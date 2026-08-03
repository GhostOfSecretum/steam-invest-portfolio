# Итоговый отчёт по аудиту кодовой базы — Steam Invest Portfolio

**Дата:** 6 июля 2026
**Режим:** только чтение (в проект внесён только этот файл-отчёт)
**Метод:** параллельный анализ 4 субагентами по направлениям — качество кода, баги, уязвимости, security-check

---

## Оглавление

1. [Краткое резюме](#краткое-резюме)
2. [Качество кода](#1-качество-кода)
3. [Баги](#2-баги)
4. [Уязвимости (application security)](#3-уязвимости-application-security)
5. [Security-check (секреты, конфигурация, зависимости)](#4-security-check-секреты-конфигурация-зависимости)
6. [Приоритетный план действий](#приоритетный-план-действий)

---

## Краткое резюме

| Блок | Критич. | Высок. | Средн. | Низк. | Всего |
|------|:---:|:---:|:---:|:---:|:---:|
| Качество кода | 0 | 5 | 11 | 5 | 21 |
| Баги | 3 | 4 | 7 | 3 | 17 |
| Уязвимости | 3 | 4 | 7 | 4 | 18 |
| Security-check | 1 | 9 | 10 | 3 | 23 |

**Что горит в первую очередь:**

1. **Реальные секреты в локальном `.env`** — рабочий Steam API key, полный Telegram session string (эквивалент пароля от аккаунта), Telegram API hash. Требуется немедленная ротация. (`.env` корректно в `.gitignore` и не отслеживается git — утечки в репозиторий нет, но ключи живые.)
2. **Отсутствие авторизации** на CRUD ручных портфелей и глобальный файл basis — любой клиент без сессии может читать/менять/удалять данные всех пользователей.
3. **Ошибки в денежных расчётах** — Armory ROI в рублях считается в смешанных валютах (завышение на порядок), история портфеля подставляет текущую стоимость в прошлые даты, fallback basis = рыночная цена (маскирует реальный P&L).
4. **Auto-sync desktop затирает предметы из Хранилищ** — предметы исчезают из портфеля после фоновой синхронизации.
5. **Уязвимые зависимости** — axios (SSRF/prototype pollution, high), electron 33.x (множество CVE).

---

## 1. Качество кода

Субагент: `[Аудит качества кода](7b044b3c-50d7-4e18-988e-724c11050ab5)`

### Высокая серьёзность

**1.1. God-модуль `prices.js` (~1936 строк)** — `server/services/prices.js`
Один файл совмещает парсинг денег, HTTP-клиент, FX-курсы, 8+ price-провайдеров, каталог, историю, иконки, offers, variants, tier-маппинг; экспортирует 15 функций.
*Рекомендация:* разбить на `providers/`, `fx.js`, `catalog.js`, `history.js`, `offers.js`, общий `http.js`.

**1.2. Race-prone кэширование без dedup in-flight запросов** — `server/services/cache.js:83–88` (`remember()`), `server/services/prices.js:142–179` (`getPrice()`)
При одновременных запросах по одному ключу все проходят cache miss и параллельно дёргают внешние API (cache stampede).
*Рекомендация:* in-flight Map (`key → Promise`) или mutex.

**1.3. Глобальное mutable-состояние `window.__lang` / `window.__currency`** — `Steam Invest Portfolio.html:53–58,78–79`, `api-client.jsx:257–260,279–281`, `landing-sections.jsx` (множество мест)
Язык и валюта передаются через глобальные переменные и custom event вместо React Context; `FX_RATES.rub` мутируется.
*Рекомендация:* единый React Context (lang + currency + FX rate).

**1.4. Монолитный компонент `ItemDetail` (~513 строк)** — `item-detail.jsx:34–547`
Один компонент: state wear/StatTrak, загрузка variants/offers/history, chart series, marketplace UI, wear bar, empty states.
*Рекомендация:* выделить `ItemPriceHeader`, `WearSelector`, `MarketplaceOffers`, `PriceHistoryChart`, `ItemMeta`.

**1.5. Дублирование парсинга `market_hash_name` клиент/сервер** — `item-detail.jsx:550–560` (`parseClientName`), `prices.js:1826–1841` (`splitMarketHashName`)
Почти идентичная логика StatTrak/Souvenir/wear («Mirror of the server-side splitter») — риск расхождения regex.
*Рекомендация:* общий shared-модуль или API endpoint для variants.

### Средняя серьёзность

**1.6.** Монолитный `landing-sections.jsx` (~1074 строк) — разбить по секциям.
**1.7.** Смешение ответственностей в `portfolio.js` (~831 строк): persistence + CRUD + enrichment + aggregation + liquidity + history + UI-строки с CSS-переменными (`portfolio.js:84–88`).
**1.8.** Монолитный `desktop/main.js` (~674 строк): lifecycle + меню + IPC + login windows + sync — разнести по модулям.
**1.9.** Копипаст `enrichItem` / `enrichManualItem` — `portfolio.js:360–427` (~80% общей логики).
**1.10.** Дублирование HTTP-клиента `fetchJson`/`fetchText` — `steam.js:23–50` vs `prices.js:92–140`.
**1.11.** Несогласованная i18n: словарь `I18N` (`components.jsx:5–183`) + 40+ inline `lang === 'ru' ? ...`.
**1.12.** Дублирование логики SVG-графиков — `dashboard.jsx:8–95` vs `item-detail.jsx:564–611`.
**1.13.** Дублирование `formatHistoryDate` — `dashboard.jsx:97–100` vs `item-detail.jsx:638–645`.
**1.14.** Устаревшая архитектура фронтенда: React dev build + `@babel/standalone` в браузере, без bundler/tree-shaking (`Steam Invest Portfolio.html:20–30`).
**1.15.** Длинная функция `getPriceHistory` (~125 строк) — `prices.js:661–785`.
**1.16.** Массовое дублирование inline-стилей поверх `styles.css` (dashboard 84×, item-detail 79×, landing 72×).

### Низкая серьёзность

**1.17.** Мёртвый код: константа `MOVERS` — `landing-sections.jsx:216–223`.
**1.18.** Вводящее в заблуждение имя `CaseROI` (рендерит news feed) — `landing-sections.jsx:568–586`.
**1.19.** Магическое число `86400000` без `MS_PER_DAY` (6+ мест).
**1.20.** Нестабильный ID в `Sparkline` через `Math.random()` на каждый render — `components.jsx:208` (использовать `useId()`).
**1.21.** «Тихие» empty catch без логирования — `dashboard.jsx:130`, `prices.js:405,437`, `desktop/gc-storage-sync.js:138,204`.

---

## 2. Баги

Субагент: `[Поиск багов](e854b7a4-eadb-46a0-981d-80997a310353)`

### Критическая

**2.1. Armory ROI в рублях считается в смешанных валютах** — `server/services/armory.js:158–169,188–194,207–221`
При `currency=rub` цены Steam берутся в RUB, но делятся на `baseAnchorUsd` (эталон в USD) → коэффициент ~92×, затем ещё раз умножается на курс. EV/ROI завышаются на порядок.
*Исправление:* считать EV в одной валюте (всегда USD с конвертацией в конце, либо хранить `baseAnchorRub`).

**2.2. Auto-sync desktop затирает предметы из Хранилищ** — `desktop/main.js:163,204–231`
`autoSyncIfNeeded` вызывает `runInventorySync(..., { includeStorage: false })` → `storageItems=[]` перезаписывает кэш, storage-предметы исчезают из портфеля после фоновой синхронизации.
*Исправление:* не перезаписывать storage при `includeStorage: false` (мержить с предыдущим снимком).

**2.3. История портфеля подставляет текущую стоимость в прошлые даты** — `server/services/portfolio.js:834–841`
`buildPortfolioHistory` при отсутствии цены на дату добавляет `history.currentValue` (сегодня), а не последнюю известную цену. График «VALUE OVER TIME» показывает неверные уровни, coveragePct завышен.
*Исправление:* использовать последнюю известную цену до даты либо не включать позицию.

### Высокая

**2.4. Кнопка «Buy basis» для Steam-портфеля не работает** — `dashboard.jsx:235`
Кнопка без `onClick`; API `PATCH /api/portfolio/basis` есть (`server/index.js:123–137`), но фронт не вызывает. Редактирование basis только для manual-портфеля.

**2.5. Fallback basis = рыночная цена маскирует отсутствие cost basis** — `portfolio.js:727–754,363–375`
`resolveBasisEntry` подставляет `fallbackUsdPerUnit = value` → `pnl=0`, `totalBasis ≈ totalValue`. Дашборд показывает «P&L +$0», как будто куплено по текущей цене.
*Исправление:* без явного basis использовать 0/null, показывать «basis not set».

**2.6. Неверное отображение basis при смене валюты (BasisCell)** — `dashboard.jsx:640–646`, `api-client.jsx:289–294`
`formatMoney(value, { currency: 'rub' })` при explicit currency не конвертирует USD→RUB → `$10` выводится как `10 ₽` (ошибка в 50–100×).

**2.7. `makeBasisRecord` для RUB silently использует курс 92** — `portfolio.js:640–648`
При недоступном Steam FX: `usdPerUnit = n / 92` без предупреждения. Для Steam-портфеля тот же случай возвращает 502 — поведение несогласовано.

### Средняя

**2.8.** `storageItemCount` — число строк, а не штук (`desktop/main.js:230`; надо `reduce` по `amount`).
**2.9.** `getTakeSkinPrice` может взять цену не того предмета: `matches.find(exact) || matches[0]` (`prices.js:199–200`).
**2.10.** `notMarketableQty` смешивает locked и storage (`dashboard.jsx:185–190,263`).
**2.11.** Race condition в `useItemHistory`/chart при быстром переключении wear — нет `activeName` в deps (`item-detail.jsx:78–88`).
**2.12.** `PortfolioChart`: деление на ноль / `NaN` при одной точке истории (`dashboard.jsx:17–29`).
**2.13.** Дробное количество: UI шлёт `Number(quantity)`, сервер `Math.floor` без уведомления (`dashboard.jsx:491`, `portfolio.js:159,706–708`).
**2.14.** Публичный портфель принудительно обнуляет storage (`server/index.js:107–119`) — баг или недокументированная фича.

### Низкая

**2.15.** Утечка интервала в окне Steam Login при crash-path (`desktop/main.js:99–114`).
**2.16.** `redeemPairingCode` не удаляет ключ pairing из кэша, `setCached(key, null)` (`desktop.js:35`).
**2.17.** `scoreLiquidity` — среднее по строкам, не по стоимости (`portfolio.js:785–788`).

---

## 3. Уязвимости (application security)

Субагент: `[Поиск уязвимостей](397e3a11-d3da-4015-9004-f74513782a8c)`

### Критическая

**3.1. Отсутствие авторизации на CRUD ручных портфелей (IDOR / broken access control)** — `server/index.js:123–128,140–176`, `portfolio.js:110–203`
CWE-862 / CWE-639. Любой без сессии может создавать/читать/удалять портфели и позиции; данные в общем `.data/manual-portfolios.json` без привязки к пользователю.
*Рекомендация:* привязать к `req.session.steamId`, проверять владельца на каждом мутирующем эндпоинте.

**3.2. Перебор 6-значного pairing code без rate limiting** — `desktop.js:8–10,16–36`, `server/index.js:285–296`
CWE-307. ~900 000 значений, TTL 10 мин, без ограничения частоты → подбор `deviceToken` жертвы.
*Рекомендация:* увеличить энтропию, rate limiting по IP, lockout, одноразовость.

**3.3. Дефолтный секрет сессии в production** — `server/index.js:35–37`
CWE-798. Fallback `'local-dev-only-change-me'` → подделка cookie и impersonation.
*Рекомендация:* отказ от запуска без явного `SESSION_SECRET`.

### Высокая

**3.4. Device token в URL** — `server/index.js:324–336`, `desktop/main.js:171–175`
CWE-598/200. `GET /api/desktop/login?deviceToken=...` → утечка через логи, историю, Referer; TTL 90 дней.

**3.5. Подмена инвентаря через inventory-sync** — `server/index.js:299–321`, `desktop.js:46–55`
CWE-345. Сервер принимает произвольный массив `items` без сверки с реальным Steam-инвентарём.

**3.6. Глобальный файл basis — изменение данных всех пользователей** — `server/index.js:131–137`, `portfolio.js:574–623`
CWE-639. Запись в общий `.data/portfolio.json` по ключу `marketHashName` без привязки к `steamId`.

**3.7. CSRF на GET `/api/desktop/login`** — `server/index.js:324–336`
CWE-352. Cookie `sameSite: 'lax'` при top-level GET → session swapping (перезапись сессии жертвы чужим `steamId`).

### Средняя

**3.8.** Раздача исходного кода backend через `express.static(rootDir)` — `server/index.js:31–32,356` (CWE-552).
**3.9.** Отсутствие rate limiting на API — весь `server/index.js` (CWE-770).
**3.10.** Лимит тела запроса 50 MB — вектор DoS — `server/index.js:34` (CWE-400).
**3.11.** Cookie сессии без флага `Secure` — `server/index.js:40–44` (CWE-614).
**3.12.** Загрузка React/Babel с CDN (`unpkg.com`) без CSP — `Steam Invest Portfolio.html:20–22` (CWE-829, supply-chain).
**3.13.** Device token доступен renderer-процессу Electron — `desktop/main.js:340–348` (CWE-200).
**3.14.** Статический ключ шифрования electron-store — `desktop/main.js:8` (CWE-321).

### Низкая

**3.15.** Логирование trade token Steam — `desktop/main.js:639` (CWE-532).
**3.16.** `innerHTML` при отображении QR-кода — `desktop/ui/gc-qr.html:29` (CWE-79, потенциально).
**3.17.** `postMessage` без проверки `origin` — `tweaks-panel.jsx:192–200` (CWE-345).
**3.18.** Раскрытие конфигурации в `/api/health` и `/api/me` (`steamApiKeyConfigured`) — `server/index.js:48–54,76–83` (CWE-200).

**Проверено и НЕ подтверждено:** command injection (нет `exec`), SSRF (fetch только на фикс. домены), path traversal (пути захардкожены), Electron `nodeIntegration: false` + `contextIsolation: true`, отсутствие `dangerouslySetInnerHTML`, prototype pollution, permissive CORS.

---

## 4. Security-check (секреты, конфигурация, зависимости)

Субагент: `[Security-check конфигураций](8b6af481-85f8-4c0a-84d2-8938731d1340)`

> **Уточнение по исходному предположению:** `.env` **корректно указан в `.gitignore`** (строка 3) и **не отслеживается git** (`git ls-files .env` пусто, `git check-ignore` подтверждает). Утечки в репозиторий нет. Но на диске лежит `.env` с рабочими секретами.

### Критическая

**4.1. Реальные секреты в локальном `.env`** (типы, значения маскированы):

| Поле | Тип | Префикс |
|------|-----|---------|
| `STEAM_API_KEY` | Steam Web API key | `D688C5B8…` |
| `TELEGRAM_API_ID` | Telegram API ID | `38373560` |
| `TELEGRAM_API_HASH` | Telegram API hash | `6e678b93…` |
| `TELEGRAM_SESSION` | Telegram StringSession (полный доступ к аккаунту) | `1AgAOMTQ5…` |
| `SESSION_SECRET` | Секрет express-session | `local-dev-7f1a…` |
| `TELEGRAM_CHANNELS` | Приватные invite-ссылки | `https://t.me/+HsAE…` |

*Рекомендация:* немедленно ротировать все ключи; `TELEGRAM_SESSION` пересоздать и отозвать старые сессии; для продакшена — secrets manager.

### Высокая

**4.2.** Telegram session string — полный захват аккаунта (`telegram.js`).
**4.3.** Сервер слушает на `0.0.0.0` без HTTPS, cookie `secure: false`, порт проброшен в `docker-compose.yml` (`server/index.js:369–371`).
**4.4.** Дефолтный/слабый `SESSION_SECRET` (`server/index.js:37`).
**4.5.** Device token в URL query (`desktop/main.js:175`, `server/index.js:324–336`).
**4.6.** Brute-force pairing code без rate limit (`desktop.js:8–9`, `server/index.js:285–297`).
**4.7.** Docker: контейнеры от root, `xray-core:latest` без pin, `.env` через `env_file` (`Dockerfile`, `docker-compose.yml`).
**4.8.** Уязвимый `axios@1.15.2` (transitive через `telegram`): SSRF bypass, prototype pollution, credential leak (high).
**4.9.** Уязвимый `electron@33.4.11`: множество CVE (use-after-free, ASAR bypass); нужно ≥39.x.
**4.10.** `express.static(rootDir)` раздаёт корень репозитория (`server/index.js:356`).

### Средняя

**4.11.** API manual portfolios без аутентификации.
**4.12.** Xray SOCKS proxy `listen: 0.0.0.0`, `auth: noauth` (`generate-xray-config.js:71–76`; в текущем compose порт не проброшен).
**4.13.** VLESS/VPN credentials в сгенерированном config (`generate-xray-config.js`).
**4.14.** Telegram session во временном файле `/tmp/telegram-session.out` (`telegram-session-on-server.sh:33,35`).
**4.15.** Plaintext device tokens в `.data/cache.json`.
**4.16.** Hardcoded encryption key в electron-store (`desktop/main.js:8`).
**4.17.** Уязвимости `express/qs` (DoS, moderate), `form-data` (CRLF, high transitive).
**4.18.** Устаревший `openid@2.0.15` (`auth.js`).
**4.19.** Отсутствие security middleware (helmet, rate limiting, CORS policy).
**4.20.** Публичный endpoint инвентаря `/api/portfolio/public` (privacy-by-design).

### Низкая

**4.21.** `.env.example` с placeholder, похожим на реальный секрет.
**4.22.** Desktop: нет `sandbox: true` в webPreferences.
**4.23.** `telegram-session-on-server.sh` — hardcoded пути деплоя.

**Положительные находки:** `.env` в `.gitignore` и не tracked; `.dockerignore` исключает `.env`/`.data`; секретов в коде нет (только `process.env`); GitHub Actions без `pull_request_target` и без secrets в YAML; Electron `contextIsolation: true` + `nodeIntegration: false`; OpenID-валидация в `auth.js`; `xray/config.json` в `.gitignore`.

### Версии ключевых зависимостей

| Пакет | Версия | Статус |
|-------|--------|--------|
| express | 4.22.1 | Moderate (qs) |
| telegram | 2.26.22 | Тянет axios 1.15.2 (high) |
| axios (transitive) | 1.15.2 | High CVEs |
| electron | 33.4.11 | High CVEs |
| openid | 2.0.15 | Устаревший |

---

## Приоритетный план действий

1. **Немедленно (секреты):** ротировать `STEAM_API_KEY`, `TELEGRAM_SESSION`, `TELEGRAM_API_HASH`; отозвать старые Telegram-сессии.
2. **Авторизация и изоляция данных:** привязать ручные портфели, basis и desktop-sync к `steamId`; проверять владельца на мутациях (баги 3.1, 3.6, 4.11).
3. **Денежные расчёты:** Armory ROI в RUB (2.1), история портфеля (2.3), fallback basis (2.5), BasisCell при смене валюты (2.6).
4. **Desktop storage:** auto-sync не должен затирать Хранилища (2.2); корректный `storageItemCount` (2.8).
5. **Перед публикацией в сеть:** HTTPS + reverse proxy, strong `SESSION_SECRET` без fallback (3.3), `Secure` cookie, rate limiting (3.2/3.9), ограничить static root (3.8), убрать device token из URL + CSRF-защита (3.4/3.7), уменьшить body limit (3.10).
6. **Зависимости:** обновить electron (≥39.x) и axios (≥1.16), `npm audit fix`.
7. **Docker:** non-root user, pin digest образа xray, Docker secrets.
8. **Рефакторинг (качество):** разбить god-модули `prices.js`/`portfolio.js`/`main.js`, дедупликация shared-логики, единый React Context вместо `window.__*`, миграция на bundler.

---

*Отчёт сгенерирован автоматически по результатам работы 4 субагентов. Все пункты подтверждены чтением кода; git-история на предмет ранее закоммиченных секретов не анализировалась.*
