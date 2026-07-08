# Аудит уязвимостей — Steam Invest Portfolio

**Дата:** 6 июля 2026 г.
**Тип аудита:** Application Security (анализ исходного кода, read-only).
**Аудит выполнен моделью:** Fable 5.
**Объём:** фронтенд (JSX + HTML), backend `server/` (Node.js/Express), десктоп-клиент `desktop/` (Electron), скрипты и инфраструктура (`Dockerfile`, `docker-compose.yml`).

> Ниже перечислены только реальные проблемы, подтверждённые кодом, с указанием файла и строк. Общая оценка приложения: отсутствует модель разграничения доступа (multi-tenancy), нет rate limiting и защитных HTTP-заголовков; наиболее опасен процесс сопряжения десктоп-клиента.

---

## Критические

### C-1. Брутфорс кода сопряжения → захват аккаунта (session/account takeover)
- **Файлы/строки:**
  - `server/services/desktop.js:8-10` — генерация кода: `crypto.randomInt(100000, 999999)` (6-значный числовой код, ~900 000 значений).
  - `server/index.js:285-297` — эндпоинт `POST /api/desktop/pair` без аутентификации и без rate limiting.
  - `server/index.js:299-322` — `POST /api/desktop/inventory-sync` принимает `X-Device-Token`.
  - `server/index.js:324-337` — `GET /api/desktop/login?deviceToken=...` создаёт авторизованную сессию (`req.session.steamId = device.steamId`).
- **Тип:** CWE-307 (Improper Restriction of Excessive Authentication Attempts), CWE-330/CWE-521 (слабое пространство секрета), CWE-640.
- **Вектор атаки:** пока легитимный пользователь выполняет сопряжение (код живёт 10 минут, `PAIRING_CODE_TTL_MS`), атакующий перебирает 6-значный код по `POST /api/desktop/pair`. Ограничений на число попыток нет — весь диапазон перебирается за минуты. При успехе возвращается `deviceToken` (TTL 90 дней), который даёт: (а) запись инвентаря жертвы через `inventory-sync`; (б) полноценную авторизованную web-сессию под `steamId` жертвы через `GET /api/desktop/login`.
- **Серьёзность:** Критическая.
- **Рекомендация:** сделать код сопряжения длинным и криптостойким (например, `crypto.randomBytes` в base32, ≥ 8 символов); ввести строгий rate limiting и блокировку после N неудач на IP/на код; инвалидировать код после нескольких неверных попыток; привязать выдачу токена к дополнительному подтверждению на стороне пользователя.

---

## Высокие

### H-1. Отсутствие авторизации и изоляции пользователей на ручных портфелях (Broken Access Control / IDOR)
- **Файлы/строки:**
  - `server/index.js:140-176` — `GET/POST/DELETE /api/portfolios`, `POST/PATCH/DELETE /api/portfolios/:portfolioId/items/...` — ни один эндпоинт не вызывает `requireAuth` и не проверяет владельца.
  - `server/index.js:123-138` — `PATCH /api/portfolio/basis` для ветки manual (`portfolioId !== 'steam'`) выполняется без проверки сессии.
  - `server/services/portfolio.js:93-108, 129-139, 191-203, 205-240` — единое глобальное хранилище `manual-portfolios.json`, портфели не привязаны к `steamId`.
- **Тип:** CWE-862 (Missing Authorization), CWE-639 (IDOR), CWE-284.
- **Вектор атаки:** любой пользователь (в т.ч. неаутентифицированный) вызывает `GET /api/portfolios` и получает идентификаторы всех ручных портфелей всех пользователей, после чего читает (`GET /api/portfolio?portfolioId=...`), изменяет (`PATCH .../items/...`), удаляет (`DELETE /api/portfolios/:id`) чужие данные. Изоляции между пользователями нет вовсе.
- **Серьёзность:** Высокая.
- **Рекомендация:** ввести владение портфелем (`ownerSteamId`), требовать аутентификацию на всех мутациях и чтениях, проверять принадлежность `portfolioId` текущей сессии.

### H-2. Общая (глобальная) себестоимость для всех Steam-пользователей
- **Файлы/строки:** `server/services/portfolio.js:8-9` (`BASIS_FILE = .data/portfolio.json`), `545-561` (`readBasis`), `574-624` (`setBasisPerUnitByMarketHashName`), запись по ключу `basis[name]` без `steamId`; вызов из `server/index.js:131-137`.
- **Тип:** CWE-862/CWE-639 (нарушение изоляции арендаторов), CWE-668.
- **Вектор атаки:** себестоимость (`basis`) хранится в одном файле с ключом по `marketHashName`, без разделения по пользователям. Любой аутентифицированный Steam-пользователь, задавая basis, перезаписывает значения, которые видят все остальные пользователи; чтение портфеля (`getPortfolio`) подтягивает эту общую basis для любого `steamId`. Утечка и порча финансовых данных между аккаунтами.
- **Серьёзность:** Высокая.
- **Рекомендация:** ключевать basis по `steamId` (или хранить в записи предмета пользователя), изолировать данные по владельцу.

### H-3. Небезопасные cookie сессии: `secure: false` и слабый секрет по умолчанию
- **Файлы/строки:** `server/index.js:35-46` — `secret: process.env.SESSION_SECRET || 'local-dev-only-change-me'`, `cookie.secure: false`.
- **Тип:** CWE-614 (Sensitive Cookie Without 'Secure'), CWE-1188/CWE-798 (небезопасный дефолт секрета).
- **Вектор атаки:** cookie сессии (`steam-invest.sid`) отправляется по HTTP, что допускает перехват при MITM/на незашифрованном канале. Если `SESSION_SECRET` не задан в окружении (в `docker-compose.yml` он не прокидывается явно и зависит от `.env`), используется публично известный секрет — сессии можно подделать/подписать.
- **Серьёзность:** Высокая (при развёртывании вне localhost).
- **Рекомендация:** `cookie.secure: true` за TLS (использовать `TRUST_PROXY`), делать приложение fail-fast при отсутствии `SESSION_SECRET` в production, запретить дефолтный секрет.

---

## Средние

### M-1. Полное отсутствие rate limiting
- **Файлы/строки:** `server/index.js` целиком — нет middleware ограничения частоты; в `package.json` нет `express-rate-limit`/аналогов.
- **Тип:** CWE-770 (Allocation of Resources Without Limits), CWE-307.
- **Вектор атаки:** усиливает C-1 (брутфорс кода), а также позволяет перебор `deviceToken`, злоупотребление проксирующими эндпоинтами (`/api/market/*`, `/api/portfolio/public`), DoS.
- **Серьёзность:** Средняя.
- **Рекомендация:** глобальный и точечный rate limiting (особенно на `/api/desktop/pair`, `/api/desktop/inventory-sync`, `/api/auth/*`).

### M-2. Неограниченный приём и хранение инвентаря (DoS)
- **Файлы/строки:** `server/index.js:34` — `express.json({ limit: '50mb' })`; `server/index.js:299-322` и `server/services/desktop.js:46-55` — массив `items` из тела запроса сохраняется в `cache.json` без валидации схемы/размера/количества.
- **Тип:** CWE-400 (Uncontrolled Resource Consumption), CWE-20 (недостаточная валидация ввода).
- **Вектор атаки:** обладатель валидного `deviceToken` (в т.ч. полученного через C-1) шлёт огромные/произвольные `items`; они целиком пишутся на диск (`.data/cache.json`) и затем отдаются в ответах портфеля. Возможны раздувание диска/памяти и хранение произвольных объектов.
- **Серьёзность:** Средняя.
- **Рекомендация:** ограничить размер тела для этого маршрута, валидировать структуру и максимальное число предметов, санитизировать поля.

### M-3. Хранение долгоживущего `deviceToken` в Electron без ОС-шифрования
- **Файлы/строки:** `desktop/main.js:8` — `new Store({ encryptionKey: 'steam-invest-local-only' })` (жёстко зашитый ключ, это лишь обфускация); `desktop/main.js:360` — `store.set('deviceToken', data.deviceToken)` (в отличие от refresh-токена GC, который защищён `safeStorage` в строках 22-45).
- **Тип:** CWE-312 (Cleartext Storage of Sensitive Information), CWE-321 (Use of Hard-coded Cryptographic Key).
- **Вектор атаки:** `deviceToken` (TTL 90 дней, даёт доступ к сессии/инвентарю через сервер) лежит в `electron-store` с публично известным ключом; локальный доступ к файлу или к исходникам приложения раскрывает токен.
- **Серьёзность:** Средняя.
- **Рекомендация:** хранить `deviceToken` через `safeStorage` (как это уже делается для GC refresh-токена), не полагаться на жёстко зашитый `encryptionKey`.

---

## Низкие

### L-1. Отсутствие защитных HTTP-заголовков / CSP
- **Файлы/строки:** `server/index.js` — нет `helmet`, нет `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` и т.п. Фронтенд подключает React/Babel с CDN `unpkg` (SRI присутствует — `Steam Invest Portfolio.html:20-22`) и исполняет JSX через `@babel/standalone` в браузере.
- **Тип:** CWE-693 (Protection Mechanism Failure).
- **Серьёзность:** Низкая.
- **Рекомендация:** добавить `helmet` и строгий CSP.

### L-2. `innerHTML` при отрисовке QR-кода в окне Electron
- **Файлы/строки:** `desktop/ui/gc-qr.html:28-29` — `document.getElementById('qr').innerHTML = \`<img src="${dataUrl}">\``.
- **Тип:** CWE-79 (потенциальный, эксплуатация не подтверждена).
- **Пояснение/вектор:** `dataUrl` формируется локально через `QRCode.toDataURL(...)` из URL логина Steam (`desktop/main.js:472-473`) и представляет собой `data:image/png;base64,...`, т.е. не является контролируемым атакующим HTML. Тем не менее это небезопасный шаблон.
- **Серьёзность:** Низкая.
- **Рекомендация:** формировать `<img>` через `createElement`/`img.src = dataUrl` вместо конкатенации в `innerHTML`.

### L-3. Логирование чувствительных данных в десктоп-клиенте
- **Файлы/строки:** `desktop/main.js:639` — `console.log(... token=${trade.token})`; `desktop/main.js:633, 647-648` — логирование trade URL и sessionid-содержащих URL; `server/index.js:361` — `console.error(error)` полностью.
- **Тип:** CWE-532 (Insertion of Sensitive Information into Log File).
- **Серьёзность:** Низкая.
- **Рекомендация:** не логировать токены/URL с секретами; маскировать перед выводом.

### L-4. Отсутствие CSRF-токенов на изменяющих запросах
- **Файлы/строки:** `server/index.js:71-176` — POST/PATCH/DELETE без CSRF-защиты; частично смягчено `SameSite=lax` (`server/index.js:42`).
- **Тип:** CWE-352.
- **Пояснение:** большинство мутаций портфелей и так не требуют сессии (см. H-1), а cookie-зависимые запросы прикрыты `SameSite=lax`, что ограничивает практическую эксплуатацию. Указано для полноты.
- **Серьёзность:** Низкая.
- **Рекомендация:** внедрить CSRF-токен для cookie-аутентифицированных мутаций после введения нормальной авторизации.

---

## Проверено и НЕ подтверждено

- **XSS через `dangerouslySetInnerHTML`:** не найдено ни одного использования в JSX (`api-client.jsx`, `components.jsx`, `dashboard.jsx`, `hero.jsx`, `item-detail.jsx`, `landing-sections.jsx`, `tweaks-panel.jsx`). Контент новостей/предметов рендерится как текст через React (авто-экранирование). Единственное `innerHTML` — в `desktop/ui/gc-qr.html` (см. L-2).
- **SSRF через пользовательские URL:** `GET /api/portfolio/public?profile=` (`server/index.js:99-121`) валидирует ввод в `resolveSteamProfileInput`/`extractVanityName` (`server/services/steam.js:55-105`): хост жёстко ограничен `steamcommunity.com`, vanity — регуляркой `^[A-Za-z0-9_-]{2,64}$`; исходящие `fetch` идут только на фиксированные домены Steam/провайдеров цен. Произвольный URL от пользователя нигде не фетчится.
- **Command injection:** в коде нет `child_process`/`exec`/`spawn`/`execSync`. `scripts/generate-xray-config.js` и `scripts/apply-telegram-session.js` работают только с файлами и переменными окружения.
- **Path traversal:** пути к данным захардкожены (`.data/`, `desktop/ui/*.html`); `Telegram media` эндпоинт (`server/index.js:264-276`) использует `sourceId`, сверяемый со списком настроенных каналов, и числовой `messageId` (`server/services/telegram.js:299-302`) — обращения к файловой системе по пользовательскому пути нет.
- **Раскрытие `.env`/`.data` через `express.static`:** `app.use(express.static(rootDir))` (`server/index.js:356`) отдаёт корень проекта, НО опция `dotfiles` по умолчанию — `'ignore'`, поэтому `.env`, `.data/` (включая `cache.json` с device-токенами), `.git` не отдаются. Раздаются только не-dot файлы (исходные `.jsx`, `package.json`) — это клиентский код, загружаемый браузером штатно. Отдельной уязвимости не подтверждено (но рекомендуется явно задать `dotfiles: 'deny'` и белый список статики).
- **Небезопасные настройки Electron:** все `BrowserWindow` используют `contextIsolation: true` и `nodeIntegration: false` (`desktop/main.js:89-93, 130-135, 454-458, 727-733`); удалённый контент Steam грузится в отдельной партиции `persist:steam` без preload. `webSecurity` не отключается. Preload-мосты (`desktop/preload.js`, `desktop/preload-gc-qr.js`) экспонируют только конкретные IPC-каналы. Критичных мисконфигураций не подтверждено.
- **Prototype pollution:** мутации портфеля собираются пополям (`addManualPortfolioItem`, `server/services/portfolio.js:169-184`), без слияния произвольных ключей тела в объекты; `JSON.parse` кэша/хранилищ не выполняет рекурсивного merge. Не подтверждено.
- **Небезопасная десериализация:** используется только `JSON.parse` над данными кэша/файлов; небезопасных десериализаторов нет.
- **CORS:** заголовки CORS не выставляются — действует политика одного источника (same-origin). Разрешающей мисконфигурации нет.
- **Session fixation:** при входе (`/api/auth/steam/callback`, `/api/desktop/login`) вызывается `req.session.regenerate` (`server/index.js:64, 332`) — фиксация сессии предотвращена.
- **Steam OpenID:** ответ провайдера валидируется (`server/services/auth.js:61-131`): проверяются `openid.ns`/`op_endpoint`, формат `claimed_id`, а `verifyAssertion` подтверждает подпись; SteamID64 сверяется регуляркой `^\d{17}$`.
