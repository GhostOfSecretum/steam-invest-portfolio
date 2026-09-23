# Подготовка десктопа к продакшену

Локально клиент уже можно пользоваться: привязка, QR, склады, синк, дашборд в браузере. Этот файл — чеклист, чтобы вернуться и довести выпуск до публичного релиза, не восстанавливая контекст заново.

Код подписи и CI уже настроены и **молчат**, пока в репозитории нет секретов. Неподписанный билд собирать можно, публиковать его как «релиз для всех» — нет: Gatekeeper и SmartScreen почти никому его не дадут открыть.

## Кто что делает

| Шаг | Кто |
|---|---|
| Снять «скоро», включить кнопки скачивания, честный текст про Steam-токен | агент |
| Коммит текущего рабочего дерева (безопасность, группировка, стикеры, CI) | агент, по просьбе |
| `DATA_ENCRYPTION_KEY` на проде | человек |
| Секреты Apple и Azure в GitHub | человек |
| Деплой сайта на skinshead.pro | человек |
| Тег `v0.1.0` и сборка релизов | агент после секретов |
| Проверка установки на чистых Mac и Windows | человек |

Порядок: сначала тексты и коммит → ключ шифрования на проде → сертификаты → деплой сайта → тег → проверка с нуля.

Можно подписывать поэтапно: сначала только macOS. Не выкладывать неподписанный Mac-билд как публичный релиз.

Секреты в чат не класть — только в GitHub Secrets и env продакшен-сервера.

---

## Что делает агент (код)

Когда вернётесь, можно попросить сделать это пакетом.

1. **Снять «coming soon»** с лендинга (`landing-sections.jsx`, секция `#desktop`), тарифов (`server/services/plans.js`), FAQ и SEO-описаний.
2. **Включить кнопки скачивания** в `DesktopDownload`: сейчас они `disabled`. Скачивание уже сидит за планом Plus/Investor:
   - `GET /api/downloads/mac-arm64` → `SkinsHead-mac-arm64.dmg`
   - `GET /api/downloads/mac-x64` → `SkinsHead-mac-x64.dmg`
   - `GET /api/downloads/win-x64` → `SkinsHead-win-x64.exe`
3. **Тексты про безопасность QR.** Steam не выдаёт read-only токен. После QR у приложения полный refresh-токен; ограничивает его код клиента (только чтение инвентаря и складов, токен на сервер не уходит). То же — в consent-диалоге десктопа, если ещё звучит иначе.
4. **Коммит** всего, что накопилось: security hardening, pairing-кнопка, группировка склада, имена/иконки стикеров, `SECURITY.md`, workflows. Не коммитить `.env`, ключи, `output/`, локальный `.data`.
5. После появления секретов — **тег и релиз** (см. ниже). Тег должен совпасть с `version` в `desktop/package.json` (сейчас `0.1.0`). electron-builder именует GitHub Release по package.json, не по тегу; расхождение тихо опубликует артефакты не туда.

Автообновление читает публичные GitHub Releases репо `GhostOfSecretum/steam-invest-portfolio`. На клиенте токен не нужен. Загрузка артефактов — только когда CI гоняет `electron-builder --publish always` с `GH_TOKEN` (это делает workflow на теге `v*`).

---

## Что делает человек

### 1. Шифрование данных на проде

На хосте skinshead.pro:

```bash
openssl rand -hex 32
```

Положить в окружение процесса как `DATA_ENCRYPTION_KEY` (32 байта: 64 hex-символа). Пока ключа нет, инвентари и device token на диске сервера в открытом виде — в логе будет предупреждение из `server/services/cache.js`.

Ключ защищает утекшую копию `.data` (бэкап, снимок). Он не защищает от того, кто уже выполняет код на этом хосте.

### 2. Подпись macOS

Нужен [Apple Developer Program](https://developer.apple.com/programs/) (~$99/год).

1. Сертификат **Developer ID Application**, экспорт в `.p12`.
2. Ключ **App Store Connect API** (`.p8`) для нотаризации.

GitHub Secrets:

| Secret | Что это |
|---|---|
| `MAC_CSC_LINK` | `.p12` в base64 |
| `MAC_CSC_KEY_PASSWORD` | пароль от `.p12` |
| `APPLE_API_KEY_B64` | `.p8` в base64 |
| `APPLE_API_KEY_ID` | Key ID рядом с ключом в App Store Connect |
| `APPLE_API_ISSUER` | Issuer ID на странице Keys |

Workflow: `.github/workflows/desktop-build.yml`. Пустые секреты = unsigned build + warning в логе CI, сборка не падает.

### 3. Подпись Windows

[Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/). Без этого SmartScreen будет пугать на установщике.

GitHub Secrets:

| Secret | Что это |
|---|---|
| `AZURE_TENANT_ID` | tenant приложения |
| `AZURE_CLIENT_ID` | client id |
| `AZURE_CLIENT_SECRET` | client secret |
| `AZURE_CODE_SIGNING_ENDPOINT` | например `https://eus.codesigning.azure.net/` |
| `AZURE_CODE_SIGNING_ACCOUNT` | имя аккаунта Trusted Signing |
| `AZURE_CODE_SIGNING_PROFILE` | имя профиля сертификата |
| `AZURE_CODE_SIGNING_PUBLISHER` | publisher **точно как в сертификате**, иначе NSIS не подпишется |

Конфиг: `desktop/electron-builder.js` включает `azureSignOptions` только если задан `AZURE_CODE_SIGNING_ACCOUNT`.

### 4. Деплой сайта

Выкатить текущий сервер и фронт на skinshead.pro тем способом, которым катите обычно. Локальный `localhost:3000` пользователи не увидят. После деплоя проверить:

- `https://skinshead.pro/.well-known/security.txt`
- кнопка «Код для desktop» в дашборде у Plus/Investor
- скачивание с тарифом и 403 без тарифа

### 5. Релизный тег

Когда секреты на месте и коммит в `main`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Это триггерит `desktop-build.yml` с `--publish always`. В релизе должны появиться DMG + ZIP (mac arm64 и x64), NSIS (win x64), `latest-mac.yml` / `latest.yml`, SHA-256 суммы.

Проверка скачанного файла:

```bash
shasum -a 256 -c SHA256SUMS-macos.txt
```

### 6. Проверка на чистых машинах

Один Mac без вашего сертификата в связке и один Windows:

1. Скачать с сайта под аккаунтом Plus/Investor.
2. Установить без обходных Gatekeeper-ритуалов (если подпись на месте — должно открыться).
3. Привязка кодом с дашборда.
4. Steam QR → склады → синк.
5. Дашборд в системном браузере, не внутри Electron.
6. «Отключить хранилища» — отзыв токена у Valve, при сбое ссылка на Manage Devices.

---

## Как устроен десктоп (чтобы не сломать при возврате)

- Окно приложения — только локальный `file://`. Дашборд открывается в системном браузере одноразовым login-code, device token в URL не попадает.
- Steam QR даёт полный refresh-токен; он живёт в OS `safeStorage`. Если сейф недоступен, токен не пишется в plaintext.
- Отключение складов вызывает `IAuthenticationService/RevokeToken`.
- Склады с GC приходят по одному ассету; сервер клеит строки по `marketHashName`. Стикеры/чармы получают имя из kit id схемы, картинки — из каталога маркета по этому имени. После правки имён нужна повторная синхронизация складов, иначе в кеше останется голое `Sticker`.
- Минимальная версия клиента, которую принимает API: `MIN_DESKTOP_VERSION` в `server/services/desktop.js`. Поднимать, когда в дикой природе нельзя оставлять старый билд.
- Принятый риск: `adm-zip` через `steam-user`. См. `SECURITY.md` и allowlist в `scripts/audit-check.js`.

---

## Состояние на 28.08.2026

Сделано в коде, ещё не обязательно закоммичено и не на проде:

- Харденинг Electron (sandbox, навигация, IPC только на local UI)
- Серверный CSP, rate limit по device token, гейт версии и плана
- Шифрование чувствительного кеша, права `0700`/`0600`
- Автообновление через GitHub Releases, CI на тег `v*`
- Реальный отзыв Steam-токена
- Кнопка кода привязки в дашборде
- Группировка склада, имена стикеров/чармов, иконки из каталога
- `SECURITY.md`, `security.txt`, `security-scan.yml`

Ещё не сделано:

- Тексты «скоро» и disabled-кнопки скачивания на сайте
- Коммит и пуш
- Секреты подписи
- `DATA_ENCRYPTION_KEY` на проде
- Деплой и tagged release
- Проверка на чистых машинах
