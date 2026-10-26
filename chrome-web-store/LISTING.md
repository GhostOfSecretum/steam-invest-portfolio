# Chrome Web Store — тексты для вставки

Язык по умолчанию в магазине: English. Добавьте второй язык Russian теми же полями ниже.
Категория: Productivity. Видимость: Public, регионы: All regions.

Политика конфиденциальности: https://skinshead.pro/privacy?lang=en
(страница должна быть на проде до отправки на проверку)

Официальный сайт: https://skinshead.pro

## English

Name: SkinsHead — CS2 Storage

Short description:
Reads your CS2 Storage Units after a one-time QR sign-in. The Steam token is never saved and is revoked right after.

Detailed description:
SkinsHead reads the contents of your CS2 Storage Units and adds them to your portfolio on skinshead.pro. A public Steam inventory does not include Storage Units, so the extension signs in to Steam on your computer and reads them directly.

How it works:
1. On skinshead.pro open your portfolio and click “Extension code”. The code is valid for 5 minutes.
2. Click the extension icon, enter the code and sign in to Steam with a QR code from the Steam mobile app.
3. The extension reads your Storage Units and uploads the item list. Your portfolio then shows which items are in which unit.

Security:
- Your Steam password is never requested.
- The link to your portfolio is encrypted on this computer with a password you choose. That password is never saved and never sent to SkinsHead.
- The Steam token lives only in the tab’s memory during the reading. It is never saved and is revoked at Steam as soon as the reading finishes.
- Only the item list is sent to skinshead.pro. The extension cannot move, sell or trade items.
- If you close the tab mid-reading, the token is not revoked. Remove the device “SkinsHead Browser Extension” in Steam → Settings → Security → Authorized devices.

SkinsHead is an independent project and is not affiliated with Steam, Valve or Counter-Strike.

Single purpose:
Read CS2 Storage Unit contents and add the item list to the user’s SkinsHead portfolio.

## Русский

Название: SkinsHead — хранилища CS2

Краткое описание:
Читает содержимое хранилищ CS2 через одноразовый вход по QR. Токен Steam не сохраняется и отзывается после чтения.

Подробное описание:
SkinsHead читает содержимое хранилищ CS2 и добавляет его в портфель на skinshead.pro. Публичный инвентарь Steam хранилища не показывает, поэтому расширение входит в Steam на вашем компьютере и читает их напрямую.

Как это работает:
1. На skinshead.pro откройте портфель и нажмите «Код для расширения». Код действует 5 минут.
2. Нажмите на значок расширения, введите код и войдите в Steam по QR из мобильного приложения Steam.
3. Расширение прочитает хранилища и отправит список предметов. В портфеле будет видно, какие предметы в каком хранилище лежат.

Безопасность:
- Пароль Steam не запрашивается.
- Привязка к портфелю шифруется на этом компьютере паролем, который выбирает пользователь. Этот пароль не сохраняется и не отправляется в SkinsHead.
- Токен Steam живёт только в памяти вкладки, пока идёт чтение. Он не сохраняется и отзывается в Steam сразу после чтения.
- На skinshead.pro уходит только список предметов. Расширение не перемещает, не продаёт и не обменивает предметы.
- Если закрыть вкладку посреди чтения, отзыв не произойдёт. Удалите устройство «SkinsHead Browser Extension» в Steam → Настройки → Безопасность → Авторизованные устройства.

SkinsHead — независимый проект и не связан со Steam, Valve или Counter-Strike.

Единственное назначение:
Читать содержимое хранилищ CS2 и добавлять список предметов в портфель пользователя на SkinsHead.

## Privacy — что отметить

Собираемые данные:
- Authentication information: да. Вход в Steam по QR. Токен только в памяти вкладки, не сохраняется, отзывается после чтения, на сервер не отправляется.
- Personally identifiable information: да. SteamID привязанного аккаунта и публичные данные профиля.
- Остальные пункты (health, location, history, communications): нет.

Использование:
- Данные не продаются.
- Не используются для целей, не связанных с единственным назначением расширения.
- Не используются для оценки кредитоспособности и не для рекламы.

Удалённый код: No. С raw.githubusercontent.com загружается только текстовая схема названий предметов CS2. Она разбирается как данные и не исполняется.

Сертификация: подтвердить, что данные используются только для единственного назначения и политика конфиденциальности это описывает.

## Обоснования разрешений

storage:
Stores the SkinsHead pairing (server address, device token, SteamID) so the user does not have to pair again before every sync. No Steam token is stored.

declarativeNetRequestWithHostAccess:
Steam’s connection servers reject the WebSocket when the request carries the extension’s Origin header. A session rule removes that header, and only for this extension’s own WebSocket requests to steamserver.net.

https://api.steampowered.com/*:
Steam Web API: inventory descriptions during a sync, and revocation of the Steam token immediately after reading.

wss://*.steamserver.net/*:
Steam’s connection manager. Used for the QR sign-in and for the CS2 Game Coordinator, which is the only way to read Storage Unit contents.

https://skinshead.pro/* and https://www.skinshead.pro/*:
The user’s own portfolio service. The extension sends the item list there and can revoke its pairing. It never sends the Steam token.

## Файлы

- Архив для магазина: `chrome-web-store/skinshead-extension-0.1.0.zip`. `manifest.json` в корне архива, localhost вырезан. Собрать заново: `node scripts/pack-cws.js`.
- Архив с сайта (`/api/downloads/extension`) для магазина не подходит: внутри папка `skinshead-extension/`, её выбирают при «Загрузить распакованное».
- Иконка 128: chrome-web-store/icon-128.png (та же, что в расширении).
- Плитка 440×280: chrome-web-store/promo-440x280.png (без альфа-канала).
- Скриншоты 1280×800, английский (язык по умолчанию): screenshot-1.png, screenshot-2.png, screenshot-3.png.
- Те же кадры по-русски, для языка Russian: screenshot-ru-1.png, screenshot-ru-2.png, screenshot-ru-3.png.
