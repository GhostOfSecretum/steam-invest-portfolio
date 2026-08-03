# Аудит багов — Steam Invest Portfolio

**Дата:** 6 июля 2026
**Аудит выполнен моделью:** Fable 5
**Область:** фронтенд (JSX в корне), сервер (`server/`), desktop-клиент (`desktop/`). Только подтверждённые кодом дефекты; стилистика, безопасность и архитектура не рассматривались.

---

## Критическая серьёзность

### 1. Armory ROI при валюте RUB завышается примерно в ~90 раз (двойная конвертация)

**Файл:** `server/services/armory.js`, строки 158–171 (`fetchAnchorPrices`), 188–194 (`scaleEvUsd`), 196–225 (`buildArmoryPayload`).

`fetchAnchorPrices(currency)` при `currency === 'rub'` запрашивает у Steam цены **в рублях**, но `scaleEvUsd` делит этот рублёвый якорь на `baseAnchorUsd` (долларовую константу):

```188:194:server/services/armory.js
function scaleEvUsd(item, anchorPrices) {
  const anchor = anchorPrices[item.anchorMarketHashName];
  if (Number.isFinite(anchor) && Number.isFinite(item.baseAnchorUsd) && item.baseAnchorUsd > 0) {
    return item.baseEvUsd * (anchor / item.baseAnchorUsd);
  }
  return item.baseEvUsd;
}
```

В результате «evUsd» уже раздуто примерно на курс ₽/$ (~90×). Дальше:
- `roi = evUsd / starCostUsd` (starCost в USD) → ROI завышен в ~90 раз;
- `toDisplayMoney(evUsd, 'rub', rubPerUsd)` **ещё раз** умножает на курс → EV в рублях завышен в ~8000 раз.

**Проявление:** `/api/armory/roi?currency=rub` (секция Armory при переключении на RUB) показывает абсурдные ROI и суммы.

**Исправление:** якорные цены для расчёта EV всегда запрашивать в USD (`fetchAnchorPrices('usd')`), а рублёвое отображение выполнять только через `toDisplayMoney`.

---

## Высокая серьёзность

### 2. Basis в режиме RUB показывает долларовую сумму как рубли (без конвертации)

**Файл:** `dashboard.jsx`, строки 633–662 (`BasisCell`).

Если базис сохранён в USD, а активная валюта интерфейса — RUB, выполняется ветка:

```640:643:dashboard.jsx
  const displayBasis = inputCurrency === 'rub'
    ? (Number.isFinite(basisOriginal) && basisCurrency === 'rub'
      ? formatMoney(basisOriginal, { currency: 'rub' })
      : (Number.isFinite(basisPerUnit) ? formatMoney(basisPerUnit, { currency: 'rub' }) : '—'))
```

`basisPerUnit` — это USD за штуку, а `formatMoney(value, { currency: 'rub' })` в `api-client.jsx` (строки 289–303) трактует явную валюту как «значение уже в этой валюте» и **не конвертирует**. Базис $10 отображается как «10,00 ₽» вместо ~920 ₽.

**Исправление:** в этой ветке вызывать `formatMoney(basisPerUnit)` без явной валюты (тогда сработает конвертация по `FX_RATES`), либо конвертировать вручную через `getRubPerUsdRate()`.

### 3. P&L портфеля вычитает себестоимость неоценённых предметов

**Файл:** `server/services/portfolio.js`, строки 52–54 и 77–78 (Steam-портфель), 282–285 и 307–308 (ручной портфель).

```52:54:server/services/portfolio.js
  const pricedItems = items.filter((item) => item.value != null);
  const totalValue = pricedItems.reduce((sum, item) => sum + item.value * item.qty, 0);
  const totalBasis = items.reduce((sum, item) => sum + item.basis * item.qty, 0);
```

`totalValue` считается только по предметам с ценой, а `totalBasis` — по **всем** предметам. Каждый предмет с заданным базисом, но без цены (провайдеры не ответили) уменьшает `pnl = totalValue - totalBasis` на полную сумму покупки, а `pnlPct` искажает базу. То же несоответствие внутри строки: `pnl` при `value == null` равен 0, но базис строки входит в суммарный.

**Проявление:** при частичной оценке (типичный случай для больших инвентарей и рейт-лимитов Steam) карточка «All-time P&L» уходит в необоснованный минус.

**Исправление:** `totalBasis` для расчёта P&L считать по `pricedItems` (а полный базис показывать отдельно), либо исключать неоценённые позиции из `pnl`/`pnlPct`.

### 4. Кэш новостей: пустой результат затирает рабочую «stale»-копию, fallback мёртвый

**Файл:** `server/services/news.js`, строки 19–35 и 58–61.

```19:26:server/services/news.js
  const value = await loadFeeds();
  if (shouldCacheFeed(value)) {
    await setCached(cacheKey, value);
  }

  if (!value.items?.length) {
    const stale = await getCachedEntry(cacheKey);
```

Если Telegram не сконфигурирован (`shouldCacheFeed` → `true` при `!feed.configured`) или часть источников «ок», но постов нет, пустой фид записывается в кэш **до** попытки достать stale-данные. `getCachedEntry` затем читает только что записанный пустой фид — старые посты потеряны, обещанный fallback («Showing cached Telegram posts…») никогда не срабатывает. Плюс следующие 15 минут `getCached` в начале функции возвращает пустой фид как валидный кэш, даже если Telegram уже восстановился.

**Исправление:** читать stale-копию до перезаписи кэша и не кэшировать результат с пустым `items`, когда в кэше уже есть непустой.

### 5. Race condition в `usePortfolio`: устаревший ответ перезаписывает актуальные данные

**Файл:** `api-client.jsx`, строки 50–75.

В отличие от остальных хуков (`useMarketSnapshot`, `useItemHistory` и т.д.), в `load` нет флага `active`/отмены. При переключении портфелей (`portfolioId` меняется, `load` пересоздаётся и вызывается заново) медленный запрос предыдущего портфеля может завершиться позже и записать в стейт **чужие** данные, а также сбросить `loading` у ещё выполняющегося запроса.

**Проявление:** быстрый выбор другого портфеля в селекторе → в дашборде отображаются позиции/итоги предыдущего портфеля.

**Исправление:** добавить в `load` guard по актуальности (флаг из замыкания useEffect или счётчик запросов) по аналогии с другими хуками файла.

---

## Средняя серьёзность

### 6. `getPrice`: устаревшая цена перекэшируется как свежая, суффикс `-stale` накапливается

**Файл:** `server/services/prices.js`, строки 142–180.

Когда все провайдеры недоступны, берётся `staleCached` (до 30 дней), провайдеру дописывается `-stale`, и затем — поскольку `price.price` конечен — объект сохраняется через `setCached(key, price)` с новым `updatedAt`. Следствия: (1) устаревшая цена следующие 30 минут отдаётся как свежий кэш (`cached: true`, без пометки контекста); (2) при повторных сбоях провайдер мутирует в `csfloat-stale-stale-stale…`.

**Исправление:** не вызывать `setCached` для результата, полученного из stale-ветки (или хранить исходный `updatedAt`/провайдера).

### 7. Неоценённые предметы никогда не кэшируются — повторный обход 4 провайдеров на каждый запрос

**Файл:** `server/services/prices.js`, строки 142–180 (`getPrice`), 182–194 (`getPrices`), в связке с `server/services/portfolio.js` строка 48 (`getPrices(..., Number.MAX_SAFE_INTEGER)`).

`setCached` вызывается только если найдена конечная цена. Для предмета без цены каждый показ портфеля заново последовательно опрашивает CSFloat → take.skin → Steam → Skinport (батчами по 4). Для инвентаря с десятками немаркетных предметов каждый заход в дашборд генерирует шквал внешних запросов и провоцирует 429 от Steam, что в свою очередь усугубляет баг №3.

**Исправление:** кэшировать и `unpriced`-результат с коротким TTL (например, 5–15 минут).

### 8. Desktop: `loadSchema` навсегда кэширует отклонённый промис

**Файл:** `desktop/gc-item-names.js`, строки 9–50.

```11:13:desktop/gc-item-names.js
async function loadSchema(cacheDir) {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
```

Если первая загрузка схемы (два запроса на GitHub) упала (нет сети, 4xx/5xx), `schemaPromise` остаётся rejected-промисом до перезапуска приложения — все последующие синхронизации Хранилищ (`buildItemFields`) будут падать, даже когда сеть восстановилась.

**Исправление:** сбрасывать `schemaPromise = null` в `.catch` перед пробросом ошибки.

### 9. WearBar не показывается для Factory New / Minimal Wear

**Файл:** `item-detail.jsx`, строки 656–667.

```665:666:item-detail.jsx
  const wearNorm = (wear || '').toLowerCase().replace(/[^a-z-]/g, '').trim();
  const rangeIdx = WEAR_ALIAS[wearNorm];
```

Регулярка `[^a-z-]` удаляет пробелы: `"Factory New"` → `"factorynew"`, `"Minimal Wear"` → `"minimalwear"`, а ключи `WEAR_ALIAS` содержат пробелы (`'factory new'`, `'minimal wear'`). Для FN/MW `rangeIdx` всегда `undefined`, и без `floatValue` (которого у Steam-инвентаря нет) шкала износа не рендерится вовсе — только для дефисных качеств (FT/WW/BS).

**Исправление:** не удалять пробелы (`replace(/[^a-z\s-]/g, '')`) либо привести ключи алиасов к «сжатому» виду.

### 10. Desktop: бесконечный retry-цикл при HTTP 429 в `fetchFullInventory`

**Файл:** `desktop/main.js`, строки 526–556.

```547:552:desktop/main.js
    if (!response.ok) {
      if (response.status === 429) {
        console.log('[inventory] rate limited, waiting 5s...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
```

Нет ни лимита попыток, ни экспоненциального бэкоффа. Если Steam стабильно отвечает 429 (что он и делает при агрессивной постраничной выкачке), `while (more)` крутится вечно — «Sync Now» зависает без ошибки, и каждый повтор через 5 с продлевает бан.

**Исправление:** счётчик попыток с ограничением (например, 5) и растущей задержкой; по исчерпании — бросать ошибку.

### 11. Web-инвентарь: тот же пагинационный цикл без защиты от зацикливания

**Файл:** `server/services/steam.js`, строки 158–194 (`fetchInventoryPages`).

Цикл `while (more)` доверяет полям `more_items`/`last_assetid` ответа Steam без ограничения числа итераций и без проверки, что `last_assetid` изменился. Если Steam вернёт повторяющийся `last_assetid` (наблюдается при сбоях/trottling), запрос `/api/portfolio?sync=1` зависнет и будет бесконечно дёргать Steam. Кроме того, страницы запрашиваются без пауз — на больших инвентарях (>2500 предметов) вторая страница почти гарантированно ловит 429, и весь синк падает.

**Исправление:** ограничить число страниц, прерывать цикл при неизменном `last_assetid`, добавить задержку между страницами.

### 12. `getCsNews` берёт TTL медиа из «первого попавшегося», а кэш ArmoryRoi/News отдаёт `cached` без учёта ошибок — устаревший `updatedAt` в UI

Уточнённая формулировка (подтверждено кодом): **`server/services/armory.js` строки 241–251** — при попадании в кэш возвращается `{...cached, cached: true}` со старым `updatedAt`; сам по себе это ок, но в связке с багом №1 неверные RUB-значения кэшируются на 30 минут (`armory:roi:v2:rub`) и продолжают отдаваться даже после исправления курса. При правке бага №1 обязательно поднять версию ключа кэша (`v2` → `v3`), иначе старые искажённые данные переживут фикс.

---

## Низкая серьёзность

### 13. `compactUsd` показывает «$0» вместо «N/A» для нечисловых значений

**Файл:** `api-client.jsx`, строки 324–330. При `!Number.isFinite(value)` возвращается отформатированный ноль. В `dashboard.jsx` карточки Total value / P&L при отсутствии данных покажут «$0» / «+$0», что неотличимо от реального нулевого портфеля (в отличие от `formatMoney`, честно возвращающего `'N/A'`).

**Исправление:** возвращать `'N/A'`, как это делает `formatMoney`.

### 14. Спарклайн-тренд в таблице: NaN при спарке из одного элемента

**Файл:** `dashboard.jsx`, строка 742: `const change = (h.spark || [0, 0]).at(-1) - (h.spark || [0, 0]).at(-2);` — если `h.spark` существует, но содержит один элемент, `at(-2)` даёт `undefined`, `change = NaN`, и условие `change >= 0` всегда ложно → линия ошибочно красится в красный. Дефолт `[0, 0]` защищает только случай `spark == null`.

**Исправление:** `const spark = Array.isArray(h.spark) && h.spark.length > 1 ? h.spark : [0, 0];`

### 15. Двойное экранирование в регулярке — превью ошибки не очищается

**Файл:** `desktop/main.js`, строка 765: `String(parsed.text || '').replace(/\\s+/g, ' ')` — это обычный код (не строковый шаблон), поэтому `/\\s+/` ищет литеральные символы `\s`, а не пробелы. Многострочный HTML в сообщении об ошибке не схлопывается в одну строку, как задумано.

**Исправление:** `/\s+/g`.

### 16. `getPostSummary` не вырезает усечённый заголовок

**Файл:** `server/services/telegram.js`, строки 396–404. `getPostTitle` усекает первую строку до 120 символов с добавлением `…`, после чего `text.replace(title, '')` в `getPostSummary` не находит вхождение (в тексте нет `…`) — summary начинается с дубля заголовка.

**Исправление:** вырезать первую строку исходного текста, а не усечённый `title`.

---

## Сводка

| № | Серьёзность | Файл | Суть |
|---|---|---|---|
| 1 | Критическая | server/services/armory.js | ROI/EV в RUB завышены в ~90×/~8000× (двойная конвертация) |
| 2 | Высокая | dashboard.jsx | Basis: USD-сумма показывается как ₽ без конвертации |
| 3 | Высокая | server/services/portfolio.js | P&L вычитает базис неоценённых предметов |
| 4 | Высокая | server/services/news.js | Пустой фид затирает stale-кэш, fallback не работает |
| 5 | Высокая | api-client.jsx | Race в usePortfolio: чужие данные при смене портфеля |
| 6 | Средняя | server/services/prices.js | Stale-цена перекэшируется как свежая, `-stale-stale…` |
| 7 | Средняя | server/services/prices.js | Unpriced не кэшируется → повторный обход провайдеров |
| 8 | Средняя | desktop/gc-item-names.js | Rejected-промис схемы кэшируется навсегда |
| 9 | Средняя | item-detail.jsx | WearBar не работает для FN/MW (регулярка убирает пробелы) |
| 10 | Средняя | desktop/main.js | Бесконечный retry при 429 в fetchFullInventory |
| 11 | Средняя | server/services/steam.js | Пагинация инвентаря без лимита/защиты от повторов |
| 12 | Средняя | server/services/armory.js | Кэш `armory:roi:*` переживёт фикс бага №1 без смены ключа |
| 13 | Низкая | api-client.jsx | compactUsd: «$0» вместо «N/A» |
| 14 | Низкая | dashboard.jsx | NaN-тренд спарклайна при одном элементе |
| 15 | Низкая | desktop/main.js | `/\\s+/` вместо `/\s+/` в очистке превью ошибки |
| 16 | Низкая | server/services/telegram.js | Summary дублирует усечённый заголовок |
