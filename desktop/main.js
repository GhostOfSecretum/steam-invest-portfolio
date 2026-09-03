const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } = require('electron');
const http = require('http');
const https = require('https');
const path = require('path');
const QRCode = require('qrcode');
const Store = require('electron-store');
const { fetchStorageContents, startQrLogin, revokeRefreshToken } = require('./gc-storage-sync');
const { mergeInventoryItems } = require('./inventory-merge');

const store = new Store({ encryptionKey: 'steam-invest-local-only' });

const DEFAULT_SERVER_URL = 'https://skinshead.pro';
const ALLOWED_SERVER_HOSTS = new Set(['skinshead.pro', 'www.skinshead.pro']);
const STEAM_COMMUNITY = 'https://steamcommunity.com';
const STEAM_DEVICES_URL = 'https://store.steampowered.com/account/authorizeddevices';
const INVENTORY_URL_PATTERN = /\/inventory\/(\d{17})\/730\/2/;
const GC_REFRESH_TOKEN_KEY = 'gcRefreshTokenProtected';
const LEGACY_GC_REFRESH_TOKEN_KEY = 'gcRefreshToken';
const DEVICE_TOKEN_KEY = 'deviceTokenProtected';
const LEGACY_DEVICE_TOKEN_KEY = 'deviceToken';
const PAIRING_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/i;

function normalizeServerUrl(raw) {
  let input = String(raw || '').trim().replace(/\/+$/, '');
  if (!input) throw new Error('Укажите адрес сервера (например https://skinshead.pro)');
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Некорректный адрес сервера: ${input}`);
  }

  const host = parsed.hostname.toLowerCase();
  const isLocalDev = !app.isPackaged && (host === 'localhost' || host === '127.0.0.1');

  if (!ALLOWED_SERVER_HOSTS.has(host) && !isLocalDev) {
    throw new Error(`Адрес ${host} не разрешён. Используйте ${DEFAULT_SERVER_URL}.`);
  }
  if (parsed.protocol !== 'https:' && !isLocalDev) {
    throw new Error('Адрес сервера должен использовать https.');
  }

  return `${parsed.protocol}//${parsed.host}`;
}

// A stored value can predate the allowlist, so re-validate on every read and fall
// back to the default rather than trusting whatever is on disk.
function getServerUrl() {
  const stored = store.get('serverUrl');
  if (!stored) return DEFAULT_SERVER_URL;
  try {
    return normalizeServerUrl(stored);
  } catch (err) {
    console.warn('[desktop] stored serverUrl rejected, using default:', err.message);
    return DEFAULT_SERVER_URL;
  }
}

function openExternalIfHttps(url) {
  try {
    if (new URL(url).protocol === 'https:') shell.openExternal(url);
  } catch {
    /* malformed URL — nothing to open */
  }
}

// Steam's login flow moves across several of its own hosts, so the guard has to
// allow the whole set rather than a single origin.
const STEAM_NAV_HOSTS = new Set([
  'steamcommunity.com',
  'store.steampowered.com',
  'help.steampowered.com',
  'login.steampowered.com',
  'checkout.steampowered.com',
]);

function isSteamNavigationUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && STEAM_NAV_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// Popups are handed to the system browser rather than denied outright: a link the
// page legitimately opens still works, but it opens somewhere the user can see
// the address bar.
function denyPopups(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfHttps(url);
    return { action: 'deny' };
  });
}

// For windows whose preload exposes the IPC bridge: they must only ever host the
// bundled local UI.
function restrictToLocalFiles(webContents) {
  webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return;
    event.preventDefault();
    openExternalIfHttps(url);
  });
  denyPopups(webContents);
}

// For windows that host Steam's own pages. They carry the Steam session cookies,
// and a drift to an arbitrary origin inside a window with no address bar is a
// convincing phishing surface.
function restrictToSteam(webContents) {
  webContents.on('will-navigate', (event, url) => {
    if (isSteamNavigationUrl(url)) return;
    event.preventDefault();
    openExternalIfHttps(url);
  });
  denyPopups(webContents);
}

function ensureSecretStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Защищённое хранилище ОС недоступно. Подключение складов отключено для безопасности.');
  }
}

function setGcRefreshToken(refreshToken) {
  ensureSecretStorageAvailable();
  store.set(GC_REFRESH_TOKEN_KEY, safeStorage.encryptString(refreshToken).toString('base64'));
  store.delete(LEGACY_GC_REFRESH_TOKEN_KEY);
}

function getGcRefreshToken() {
  const protectedToken = store.get(GC_REFRESH_TOKEN_KEY);
  if (protectedToken) {
    ensureSecretStorageAvailable();
    return safeStorage.decryptString(Buffer.from(protectedToken, 'base64'));
  }

  const legacyToken = store.get(LEGACY_GC_REFRESH_TOKEN_KEY);
  if (!legacyToken) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    store.delete(LEGACY_GC_REFRESH_TOKEN_KEY);
    return null;
  }

  setGcRefreshToken(legacyToken);
  return legacyToken;
}

function clearGcState() {
  store.delete(GC_REFRESH_TOKEN_KEY);
  store.delete(LEGACY_GC_REFRESH_TOKEN_KEY);
  store.delete('gcAccountName');
  store.delete('lastStorageSync');
}

// Forgetting our copy of the token does not stop Valve from honouring it, so
// disconnecting has to revoke it too. Local state is cleared first and
// unconditionally: if revocation fails, the app must still forget the token.
async function disconnectStorage() {
  let refreshToken = null;
  try {
    refreshToken = getGcRefreshToken();
  } catch (error) {
    console.warn('[gc] could not read token for revocation:', error.message);
  }
  clearGcState();

  if (!refreshToken) return { revoked: true };
  try {
    await revokeRefreshToken(refreshToken);
    return { revoked: true };
  } catch (error) {
    console.warn('[gc] revocation failed:', error.message);
    return { revoked: false, error: error.message };
  }
}

// Whether the token is dead at Valve is exactly the thing the user is trying to
// achieve, so a silent failure is not acceptable — offer the manual route.
async function reportRevokeFailure(result) {
  if (result.revoked) return;

  const { response: choice } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Открыть устройства Steam', 'Закрыть'],
    defaultId: 0,
    cancelId: 1,
    title: 'Хранилища отключены',
    message: 'Токен удалён с этого компьютера, но отозвать его в Steam не удалось.',
    detail: [
      result.error,
      '',
      'Пока токен не отозван, он остаётся действительным на стороне Steam.',
      'Отзовите его вручную: Steam → Настройки → Безопасность → Управление устройствами.',
    ].join('\n'),
  });
  if (choice === 0) await shell.openExternal(STEAM_DEVICES_URL);
}

async function disconnectStorageWithReport() {
  const result = await disconnectStorage();
  if (result.revoked) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Хранилища отключены',
      message: 'Токен удалён с этого компьютера и отозван в Steam.',
    });
    return;
  }
  await reportRevokeFailure(result);
}

function setDeviceToken(deviceToken) {
  ensureSecretStorageAvailable();
  store.set(DEVICE_TOKEN_KEY, safeStorage.encryptString(deviceToken).toString('base64'));
  store.delete(LEGACY_DEVICE_TOKEN_KEY);
}

function getDeviceToken() {
  const protectedToken = store.get(DEVICE_TOKEN_KEY);
  if (protectedToken) {
    ensureSecretStorageAvailable();
    return safeStorage.decryptString(Buffer.from(protectedToken, 'base64'));
  }

  const legacyToken = store.get(LEGACY_DEVICE_TOKEN_KEY);
  if (!legacyToken) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    store.delete(LEGACY_DEVICE_TOKEN_KEY);
    return null;
  }

  setDeviceToken(legacyToken);
  return legacyToken;
}

function clearDeviceToken() {
  store.delete(DEVICE_TOKEN_KEY);
  store.delete(LEGACY_DEVICE_TOKEN_KEY);
}

function hasDeviceToken() {
  try {
    return Boolean(getDeviceToken());
  } catch (err) {
    console.warn('[desktop] protected device token unavailable:', err.message);
    return false;
  }
}

function hasGcRefreshToken() {
  try {
    return Boolean(getGcRefreshToken());
  } catch (err) {
    console.warn('[gc-storage] protected token unavailable:', err.message);
    return false;
  }
}

async function hasSteamWebSession() {
  const cookies = await session.fromPartition('persist:steam').cookies.get({ url: STEAM_COMMUNITY });
  return cookies.some((c) => c.name === 'steamLoginSecure');
}

async function openSteamLoginWindow() {
  if (await hasSteamWebSession()) {
    return { ok: true, alreadyLoggedIn: true };
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearInterval(cookiePoll);
      fn(value);
    };

    const loginWin = new BrowserWindow({
      width: 900,
      height: 720,
      title: 'Вход в Steam',
      modal: false,
      show: false,
      backgroundColor: '#1b2838',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: 'persist:steam',
      },
    });

    restrictToSteam(loginWin.webContents);
    loginWin.once('ready-to-show', () => loginWin.show());
    loginWin.loadURL(`${STEAM_COMMUNITY}/login/home/?redir=&redir_ssl=1`);

    const cookiePoll = setInterval(async () => {
      if (loginWin.isDestroyed()) return;
      if (await hasSteamWebSession()) {
        loginWin.close();
        finish(resolve, { ok: true });
      }
    }, 800);

    loginWin.on('closed', async () => {
      if (settled) return;
      if (await hasSteamWebSession()) {
        finish(resolve, { ok: true });
      } else {
        finish(reject, new Error('Вход не завершён. Войдите в Steam в открывшемся окне и дождитесь автоматического закрытия.'));
      }
    });
  });
}

let mainWindow = null;
let setupWindow = null;
let qrLoginWindow = null;

function createWindow() {
  const isPaired = hasDeviceToken();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Steam Invest · Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  restrictToLocalFiles(mainWindow.webContents);

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  if (isPaired) {
    autoSyncIfNeeded();
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Set once the server has rejected this build as too old. Everything that talks
// to the API checks it, so an unsupported client stops retrying instead of
// failing on every sync.
let clientOutdated = false;
let outdatedDialogShown = false;

function serverHeaders(extra = {}) {
  return { 'X-App-Version': app.getVersion(), ...extra };
}

function formatRequestError(error) {
  const cause = error && error.cause;
  return [error?.message, cause?.code, cause?.message].filter(Boolean).join(' · ') || String(error);
}

function makeNodeResponse({ statusCode, headers, body }) {
  const buffer = Buffer.concat(body);
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    headers,
    async text() {
      return buffer.toString('utf8');
    },
    async json() {
      return JSON.parse(buffer.toString('utf8') || '{}');
    },
    clone() {
      return makeNodeResponse({ statusCode, headers, body: [buffer] });
    },
  };
}

function serverFetch(rawUrl, options = {}) {
  const parsed = new URL(rawUrl);
  const transport = parsed.protocol === 'http:' ? http : https;
  const body = options.body == null ? null : Buffer.from(String(options.body));
  const headers = { ...(options.headers || {}) };
  if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
    headers['Content-Length'] = String(body.length);
  }

  return new Promise((resolve, reject) => {
    const req = transport.request(parsed, {
      method: options.method || 'GET',
      headers,
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve(makeNodeResponse({
        statusCode: res.statusCode || 0,
        headers: res.headers,
        body: chunks,
      })));
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function readJsonResponse(response, context) {
  const text = await response.text();
  try {
    return JSON.parse(text || '{}');
  } catch (error) {
    const preview = text.replace(/\s+/g, ' ').slice(0, 80);
    throw new Error(`${context} вернул не JSON. ${preview ? `Ответ: ${preview}` : ''}`.trim());
  }
}

// Returns true when the response was an "update required" refusal.
async function isOutdatedResponse(response) {
  if (response.status !== 426) return false;
  const body = await response.clone().json().catch(() => ({}));
  if (body.code !== 'client_too_old') return false;

  clientOutdated = true;
  if (!outdatedDialogShown) {
    outdatedDialogShown = true;
    const { response: choice } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Скачать новую версию', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      title: 'Нужно обновление',
      message: 'Эта версия приложения больше не поддерживается сервером.',
      detail: `Установлена версия ${app.getVersion()}, минимальная поддерживаемая — ${body.minVersion || 'более новая'}. Синхронизация остановлена до обновления.`,
    });
    if (choice === 0) await shell.openExternal(`${getServerUrl()}/#desktop`);
  }
  return true;
}

// Updates come from the public GitHub releases of this repo, configured in
// electron-builder.js. A silent startup check keeps installs current; the manual
// menu item reports its outcome either way. Failures are only shown when the user
// asked, because an offline or not-yet-signed build would otherwise pop a dialog
// on every launch about something they cannot fix.
let updateCheckIsManual = false;

function initAutoUpdater() {
  // In development there is no update feed and no packaged app to replace.
  if (!app.isPackaged) return;

  const { autoUpdater } = require('electron-updater');

  autoUpdater.on('error', (error) => {
    const message = error?.message || String(error);
    console.warn('[updater] check failed:', message);
    if (!updateCheckIsManual) return;
    updateCheckIsManual = false;
    dialog.showMessageBox({
      type: 'error',
      title: 'Обновление',
      message: 'Не удалось проверить обновления.',
      detail: message,
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (!updateCheckIsManual) return;
    updateCheckIsManual = false;
    dialog.showMessageBox({
      type: 'info',
      title: 'Обновление',
      message: `У вас последняя версия (${app.getVersion()}).`,
    });
  });

  autoUpdater.on('update-downloaded', async ({ version }) => {
    updateCheckIsManual = false;
    const { response: choice } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Перезапустить и обновить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      title: 'Обновление готово',
      message: `Версия ${version} загружена.`,
      detail: 'Приложение перезапустится, чтобы установить обновление.',
    });
    if (choice === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch(() => {});
}

function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Обновление',
      message: 'Проверка обновлений работает только в установленной версии.',
    });
    return;
  }
  updateCheckIsManual = true;
  require('electron-updater').autoUpdater.checkForUpdates().catch(() => {});
}

// The server gates desktop sync on the subscription plan. Point the user at the
// pricing page instead of surfacing a bare HTTP error.
async function isPlanRefusal(response) {
  if (response.status !== 403) return false;
  const body = await response.clone().json().catch(() => ({}));
  if (body.code !== 'plan_required') return false;

  const { response: choice } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Открыть тарифы', 'Закрыть'],
    defaultId: 0,
    cancelId: 1,
    title: 'Нужен платный тариф',
    message: 'Синхронизация десктопа доступна на тарифах Plus и Investor.',
    detail: 'Оформите или продлите подписку на сайте, после этого синхронизация заработает без повторной привязки.',
  });
  if (choice === 0) await shell.openExternal(`${getServerUrl()}/#pricing`);
  return true;
}

async function autoSyncIfNeeded() {
  try {
    if (clientOutdated) return;
    const steamId = store.get('steamId');
    const deviceToken = getDeviceToken();
    if (!steamId || !deviceToken) return;

    const lastSync = store.get('lastSync');
    const staleMs = 10 * 60 * 1000;
    if (lastSync && Date.now() - new Date(lastSync).getTime() < staleMs) return;

    console.log('[auto-sync] starting background inventory sync...');
    const steamSession = session.fromPartition('persist:steam');
    const cookies = await steamSession.cookies.get({ url: STEAM_COMMUNITY });
    if (!cookies.some((c) => c.name === 'steamLoginSecure')) {
      console.log('[auto-sync] no Steam session, skipping');
      return;
    }

    const result = await runInventorySync(steamId, steamSession, deviceToken, { includeStorage: false });
    console.log(`[auto-sync] done: ${result.itemCount} rows (${result.storageItemCount} in storage)`);

  } catch (err) {
    console.warn('[auto-sync] failed:', err.message);
  }
}

async function openDesktopApp() {
  const serverUrl = getServerUrl();
  const deviceToken = getDeviceToken();

  if (!deviceToken) {
    await shell.openExternal(serverUrl);
    return;
  }

  // Exchange the long-lived device token (sent as a header) for a short-lived,
  // single-use login code, so the token never ends up in a URL / browser history.
  const codeResponse = await serverFetch(`${serverUrl}/api/desktop/login-code`, {
    method: 'POST',
    headers: serverHeaders({ 'X-Device-Token': deviceToken }),
  }).catch((error) => {
    throw new Error(`desktop login probe failed: ${formatRequestError(error)}`);
  });

  if (await isOutdatedResponse(codeResponse)) {
    throw new Error('desktop build is no longer supported');
  }
  if (await isPlanRefusal(codeResponse)) {
    throw new Error('desktop sync requires a paid plan');
  }
  if (codeResponse.status === 401) {
    throw new Error('desktop token expired');
  }
  if (!codeResponse.ok) {
    throw new Error(`desktop login-code returned HTTP ${codeResponse.status}`);
  }

  const { code } = await readJsonResponse(codeResponse, 'SkinsHead server');
  const url = `${serverUrl}/api/desktop/login?code=${encodeURIComponent(code)}`;

  await shell.openExternal(url);
}

async function resetDesktopState() {
  clearDeviceToken();
  store.delete('steamId');
  store.delete('lastSync');
  // Disconnecting the desktop entirely must not leave a working Steam token
  // behind, so this revokes instead of only forgetting it.
  await reportRevokeFailure(await disconnectStorage());
}

async function runInventorySync(steamId, steamSession, deviceToken, { includeStorage = true } = {}) {
  const serverUrl = getServerUrl();
  let storageItems = [];
  let gcStorageError = null;
  const refreshToken = includeStorage ? getGcRefreshToken() : null;

  if (refreshToken) {
    try {
      const gcResult = await fetchStorageContents(refreshToken, steamId);
      storageItems = gcResult.items || [];
      if (gcResult.refreshToken) {
        setGcRefreshToken(gcResult.refreshToken);
      }
      store.set('lastStorageSync', new Date().toISOString());
      console.log(`[gc-storage] synced ${storageItems.length} items from Хранилищ`);
    } catch (err) {
      gcStorageError = [err.message, err.cause?.message].filter(Boolean).join(': ') || String(err);
      console.warn('[gc-storage] sync skipped:', gcStorageError);
    }
  }

  const webItems = await fetchFullInventory(steamId, steamSession);
  const items = mergeInventoryItems(webItems, storageItems);
  const storageItemCount = storageItems.reduce((sum, item) => sum + Number(item.amount || 1), 0);
  const response = await serverFetch(`${serverUrl}/api/desktop/inventory-sync`, {
    method: 'POST',
    headers: serverHeaders({ 'Content-Type': 'application/json', 'X-Device-Token': deviceToken }),
    // includeStorage tells the server whether this sync carries Хранилища. When
    // false (background sync), the server keeps the previously synced storage items.
    body: JSON.stringify({ items, storageItemCount, includeStorage }),
  });
  if (await isOutdatedResponse(response)) {
    throw new Error('Версия приложения устарела — синхронизация остановлена. Установите свежую сборку.');
  }
  if (await isPlanRefusal(response)) {
    throw new Error('Синхронизация доступна на тарифах Plus и Investor.');
  }
  const data = await readJsonResponse(response, 'SkinsHead server');
  if (!response.ok) throw new Error(data.error || 'Sync failed');
  store.set('lastSync', new Date().toISOString());
  return {
    itemCount: items.length,
    storageItemCount,
    totalPieces: items.reduce((s, i) => s + Number(i.amount || 1), 0),
    gcStorageError,
    gcConnected: includeStorage && Boolean(refreshToken),
  };
}

// Nothing in this app needs camera, microphone, geolocation, notifications or
// clipboard reads, so every permission request is refused outright.
function denyAllPermissions() {
  for (const target of [session.defaultSession, session.fromPartition('persist:steam')]) {
    target.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    target.setPermissionCheckHandler(() => false);
  }
}

app.whenReady().then(() => {
  denyAllPermissions();
  createWindow();
  buildAppMenu();
  initAutoUpdater();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

function buildAppMenu() {
  const { Menu } = require('electron');
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'Inventory',
      submenu: [
        {
          label: 'Desktop Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => showDesktopSettings(),
        },
        {
          label: 'Open Portfolio Dashboard',
          accelerator: 'CmdOrCtrl+D',
          click: () => openDesktopApp().catch((e) => console.error('[menu] dashboard:', e.message)),
        },
        { type: 'separator' },
        {
          label: 'Steam Login',
          click: async () => {
            try { await handleSteamLogin(); } catch (e) { console.error('[menu] steam login error:', e.message); }
          },
        },
        {
          label: 'Sync Now',
          accelerator: 'CmdOrCtrl+R',
          click: async () => {
            try { await handleManualSync(); } catch (e) { console.error('[menu] sync error:', e.message); }
          },
        },
        {
          label: 'Connect Storage',
          click: async () => {
            try { await openGcQrLoginWindow({ skipConsent: false }); } catch (e) { console.error('[menu] gc login error:', e.message); }
          },
        },
        {
          label: 'Disconnect Storage',
          click: async () => {
            try { await disconnectStorageWithReport(); } catch (e) { console.error('[menu] gc disconnect:', e.message); }
          },
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => checkForUpdatesManually(),
        },
        {
          label: 'Disconnect Desktop',
          click: async () => {
            await resetDesktopState();
            session.fromPartition('persist:steam').clearStorageData();
            showDesktopSettings();
          },
        },
      ],
    },
    { role: 'viewMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function handleSteamLogin() {
  return openSteamLoginWindow();
}

async function handleManualSync() {
  const steamId = store.get('steamId');
  const deviceToken = getDeviceToken();
  if (!steamId || !deviceToken) {
    console.log('[sync] not paired');
    return;
  }

  console.log('[sync] starting manual sync...');
  const steamSession = session.fromPartition('persist:steam');
  const result = await runInventorySync(steamId, steamSession, deviceToken, { includeStorage: true });
  console.log(`[sync] done: ${result.itemCount} rows (${result.storageItemCount} in storage)`);

}

function showDesktopSettings() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  }
}

// --- IPC handlers ---

ipcMain.handle('get-state', async () => ({
  paired: hasDeviceToken(),
  steamId: store.get('steamId', null),
  serverUrl: getServerUrl(),
  lastSync: store.get('lastSync', null),
  gcConnected: hasGcRefreshToken(),
  gcAccountName: store.get('gcAccountName', null),
  lastStorageSync: store.get('lastStorageSync', null),
  steamLoggedIn: await hasSteamWebSession(),
}));

ipcMain.handle('pair-device', async (_event, { serverUrl, code }) => {
  const normalizedUrl = normalizeServerUrl(serverUrl);
  const pairingCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!PAIRING_CODE_RE.test(pairingCode)) {
    throw new Error('Введите 8-символьный код с сайта (буквы и цифры)');
  }

  let response;
  try {
    response = await serverFetch(`${normalizedUrl}/api/desktop/pair`, {
      method: 'POST',
      headers: serverHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({ code: pairingCode }),
    });
  } catch (error) {
    throw new Error(
      `Не удалось подключиться к ${normalizedUrl}. Проверьте Server URL (для skinshead.pro оставьте https://skinshead.pro). ${formatRequestError(error)}`,
    );
  }

  if (await isOutdatedResponse(response)) {
    throw new Error('Эта версия приложения больше не поддерживается. Установите свежую сборку и повторите привязку.');
  }

  const data = await readJsonResponse(response, 'SkinsHead server').catch(() => ({}));
  if (!response.ok) {
    if (data.code === 'invalid_code') {
      throw new Error('Неверный или просроченный код. Сгенерируйте новый на сайте (кнопка «Код для desktop»).');
    }
    if (data.code === 'rate_limited') {
      throw new Error('Слишком много попыток. Подождите несколько минут и попробуйте снова.');
    }
    throw new Error(data.error || `Pairing failed (HTTP ${response.status})`);
  }

  setDeviceToken(data.deviceToken);
  store.set('steamId', data.steamId);
  store.set('serverUrl', normalizedUrl);

  showDesktopSettings();

  return { steamId: data.steamId };
});

ipcMain.handle('open-steam-login', async () => {
  const steamId = store.get('steamId');
  if (!steamId) throw new Error('Not paired yet');
  return openSteamLoginWindow();
});

ipcMain.handle('sync-inventory', async () => {
  const steamId = store.get('steamId');
  const deviceToken = getDeviceToken();
  if (!steamId || !deviceToken) throw new Error('Not paired');

  const steamSession = session.fromPartition('persist:steam');
  const cookies = await steamSession.cookies.get({ url: STEAM_COMMUNITY });
  if (!cookies.some((c) => c.name === 'steamLoginSecure')) {
    throw new Error('Сначала нажмите «1. Войти в Steam (инвентарь)» и дождитесь сохранения Steam-сессии.');
  }
  const result = await runInventorySync(steamId, steamSession, deviceToken, { includeStorage: true });

  return result;
});

ipcMain.handle('open-dashboard', async () => {
  await openDesktopApp();
  return { ok: true };
});

ipcMain.handle('gc-get-status', () => ({
  connected: hasGcRefreshToken(),
  accountName: store.get('gcAccountName', null),
  lastStorageSync: store.get('lastStorageSync', null),
}));

ipcMain.handle('gc-disconnect', async () => {
  const result = await disconnectStorage();
  return { ok: true, revoked: result.revoked, revokeError: result.error || null };
});

ipcMain.handle('gc-start-qr-login', async () => {
  if (qrLoginWindow && !qrLoginWindow.isDestroyed()) {
    qrLoginWindow.focus();
    return { ok: true, alreadyOpen: true };
  }
  return openGcQrLoginWindow({ skipConsent: true });
});

async function confirmStorageSyncConsent() {
  ensureSecretStorageAvailable();
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Подключить Хранилища', 'Отмена'],
    cancelId: 1,
    defaultId: 1,
    title: 'Подключение Хранилищ',
    message: 'Чтобы прочитать Хранилища, нужен вход в Steam по QR-коду.',
    detail: [
      'Пароль Steam мы не запрашиваем и не получаем.',
      '',
      'Важно понимать: Steam не выдаёт токены с урезанными правами. После сканирования QR приложение получает такой же токен, как у обычного клиента Steam — технически он даёт полный доступ к аккаунту.',
      '',
      'Что делаем мы:',
      '• читаем только содержимое Хранилищ;',
      '• в приложении нет кода для перемещения, продажи, трейда, удаления или переименования предметов;',
      '• токен хранится только на этом компьютере в защищённом хранилище ОС и никогда не отправляется на наш сервер;',
      '• на сервер уходит только список предметов.',
      '',
      'Отозвать доступ можно в любой момент: Steam → Настройки → Безопасность → Управление устройствами.',
    ].join('\n'),
  });

  return result.response === 0;
}

async function openGcQrLoginWindow({ skipConsent = false } = {}) {
  if (!skipConsent) {
    const approved = await confirmStorageSyncConsent();
    if (!approved) return { ok: false, cancelled: true };
  } else {
    ensureSecretStorageAvailable();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    qrLoginWindow = new BrowserWindow({
      width: 440,
      height: 560,
      title: 'Хранилища · вход по QR',
      modal: false,
      show: false,
      backgroundColor: '#0a0c11',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload-gc-qr.js'),
      },
    });

    restrictToLocalFiles(qrLoginWindow.webContents);

    qrLoginWindow.once('ready-to-show', () => {
      if (qrLoginWindow && !qrLoginWindow.isDestroyed()) qrLoginWindow.show();
    });

    qrLoginWindow.loadFile(path.join(__dirname, 'ui', 'gc-qr.html'));

    qrLoginWindow.webContents.once('did-finish-load', () => {
      startQrLogin({
        onQrUrl: async (url) => {
          if (!qrLoginWindow || qrLoginWindow.isDestroyed()) return;
          try {
            const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 280 });
            qrLoginWindow.webContents.send('gc-qr-image', dataUrl);
          } catch (err) {
            qrLoginWindow.webContents.send('gc-login-error', err.message);
          }
        },
        onAuthenticated: ({ accountName }) => {
          if (qrLoginWindow && !qrLoginWindow.isDestroyed()) {
            qrLoginWindow.webContents.send('gc-login-success', { accountName });
          }
        },
      })
        .then(({ refreshToken, accountName }) => {
          setGcRefreshToken(refreshToken);
          store.set('gcAccountName', accountName);
          setTimeout(() => {
            if (qrLoginWindow && !qrLoginWindow.isDestroyed()) qrLoginWindow.close();
          }, 1500);
          finish(resolve, { accountName });
        })
        .catch((err) => {
          if (qrLoginWindow && !qrLoginWindow.isDestroyed()) {
            qrLoginWindow.webContents.send('gc-login-error', err.message || String(err));
          }
          finish(reject, err);
        });
    });

    qrLoginWindow.on('closed', () => {
      qrLoginWindow = null;
      finish(reject, new Error('Окно закрыто до завершения входа. Отсканируйте QR в Steam Mobile.'));
    });
  });
}

ipcMain.handle('disconnect', async () => {
  await resetDesktopState();
  const steamSession = session.fromPartition('persist:steam');
  steamSession.clearStorageData();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  }

  return { ok: true };
});

async function fetchFullInventory(steamId, steamSession) {
  const regularItems = [];
  let startAssetId = null;
  let more = true;
  let pageNum = 0;
  let expectedTotal = null;

  while (more) {
    const params = new URLSearchParams({ l: 'english', count: '2000' });
    if (startAssetId) params.set('start_assetid', startAssetId);

    const url = `${STEAM_COMMUNITY}/inventory/${steamId}/730/2?${params}`;
    const cookies = await steamSession.cookies.get({ url: STEAM_COMMUNITY });
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    if (pageNum > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Cookie: cookieHeader,
        Referer: `${STEAM_COMMUNITY}/profiles/${steamId}/inventory/`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('[inventory] rate limited, waiting 5s...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      throw new Error(`Steam returned HTTP ${response.status}`);
    }

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text || '{}');
    } catch {
      const preview = text.replace(/\s+/g, ' ').slice(0, 80);
      throw new Error(`Steam вернул HTML вместо данных инвентаря. Нажмите «1. Войти в Steam (инвентарь)» и повторите синхронизацию. ${preview ? `Ответ: ${preview}` : ''}`.trim());
    }
    if (!json.success && json.success !== 1) {
      throw new Error(json.Error || 'Steam inventory request failed');
    }

    if (json.total_inventory_count != null && expectedTotal == null) {
      expectedTotal = json.total_inventory_count;
      console.log(`[inventory] Steam reports total_inventory_count: ${expectedTotal}`);
    }

    const descMap = new Map();
    for (const desc of json.descriptions || []) {
      descMap.set(`${desc.classid}_${desc.instanceid}`, desc);
    }

    for (const asset of json.assets || []) {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`) || {};
      const tags = desc.tags || [];
      const collection = getTag(tags, 'ItemSet') || null;
      regularItems.push({
        assetid: asset.assetid,
        classid: asset.classid,
        instanceid: asset.instanceid,
        amount: Number(asset.amount || 1),
        name: desc.market_name || desc.name || desc.market_hash_name || 'Unknown',
        marketHashName: desc.market_hash_name || desc.market_name || desc.name || 'Unknown',
        type: desc.type || '',
        category: getTag(tags, 'Weapon') || getTag(tags, 'Type') || 'Other',
        rarity: getTag(tags, 'Rarity') || 'Unknown',
        wear: getTag(tags, 'Exterior') || 'N/A',
        collection,
        tradable: desc.tradable === 1,
        marketable: desc.marketable === 1,
        iconUrl: desc.icon_url
          ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}`
          : null,
        marketUrl: desc.market_hash_name
          ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(desc.market_hash_name)}`
          : null,
        descriptions: compactDescriptions(desc.descriptions),
        tags: compactTags(tags),
      });
    }

    more = Boolean(json.more_items);
    startAssetId = json.last_assetid || null;
    if (!startAssetId) more = false;
    pageNum++;
    console.log(`[inventory] page ${pageNum}: +${(json.assets || []).length} assets, total so far: ${regularItems.length}`);
  }

  console.log(`[inventory] regular endpoint done: ${regularItems.length} items fetched (Steam reported: ${expectedTotal ?? 'unknown'})`);

  const tradeItems = await fetchTradeOfferInventory(steamId, steamSession).catch((error) => {
    console.warn('[inventory] trade-offer endpoint failed:', error.message);
    return [];
  });

  if (!tradeItems.length) {
    return regularItems;
  }

  const merged = new Map();
  for (const item of regularItems) merged.set(item.assetid, item);
  for (const item of tradeItems) merged.set(item.assetid, item);
  const mergedItems = [...merged.values()];
  console.log(`[inventory] merged total: ${mergedItems.length} items (regular ${regularItems.length} + trade ${tradeItems.length})`);
  return mergedItems;
}

function getTag(tags, category) {
  return tags.find((t) => t.category === category)?.localized_tag_name || null;
}

function compactDescriptions(descriptions = []) {
  return descriptions
    .map((part) => String(part?.value || '').trim())
    .filter((value) => /sticker/i.test(value));
}

function compactTags(tags = []) {
  return tags
    .filter((tag) => ['ItemSet', 'Weapon', 'Type', 'Rarity', 'Exterior'].includes(tag?.category))
    .map((tag) => ({
      category: tag.category,
      localized_tag_name: tag.localized_tag_name || tag.name || '',
    }));
}

async function fetchTradeOfferInventory(steamId, steamSession) {
  const tradeUrl = await getOwnTradeUrl(steamSession);
  if (!tradeUrl) {
    throw new Error('Could not resolve own trade URL from Steam session');
  }
  console.log(`[inventory] own trade URL resolved: ${tradeUrl}`);

  const trade = parseTradeUrl(tradeUrl);
  if (!trade.partner || !trade.token) {
    throw new Error('Trade URL is missing partner or token');
  }
  console.log(`[inventory] using trade partner=${trade.partner}`);

  const cookies = await steamSession.cookies.get({ url: STEAM_COMMUNITY });
  const sessionId = cookies.find((c) => c.name === 'sessionid')?.value;
  if (!sessionId) {
    throw new Error('Steam sessionid cookie missing');
  }

  const url = `${STEAM_COMMUNITY}/tradeoffer/new/partnerinventory/?sessionid=${encodeURIComponent(sessionId)}&partner=${encodeURIComponent(trade.partner)}&appid=730&contextid=2`;
  console.log(`[inventory] trade-offer endpoint request: ${url}`);
  const json = await fetchJsonInSteamWindow({
    steamSession,
    loadUrl: tradeUrl,
    requestUrl: url,
    referer: tradeUrl,
  });
  const inventoryEntries = json?.rgInventory || {};
  const descriptionEntries = json?.rgDescriptions || {};
  const assets = Object.values(inventoryEntries);
  const descriptions = new Map(
    Object.values(descriptionEntries).map((desc) => [`${desc.classid}_${desc.instanceid}`, desc]),
  );

  console.log(`[inventory] trade-offer endpoint returned ${assets.length} items`);

  return assets.map((asset) => {
    const desc = descriptions.get(`${asset.classid}_${asset.instanceid}`) || {};
    const tags = desc.tags || [];
    const collection = getTag(tags, 'ItemSet') || null;
    return {
      assetid: asset.id || asset.assetid,
      classid: asset.classid,
      instanceid: asset.instanceid,
      amount: Number(asset.amount || 1),
      name: desc.market_name || desc.name || desc.market_hash_name || 'Unknown',
      marketHashName: desc.market_hash_name || desc.market_name || desc.name || 'Unknown',
      type: desc.type || '',
      category: getTag(tags, 'Weapon') || getTag(tags, 'Type') || 'Other',
      rarity: getTag(tags, 'Rarity') || 'Unknown',
      wear: getTag(tags, 'Exterior') || 'N/A',
      collection,
      tradable: Number(desc.tradable) === 1,
      marketable: Number(desc.marketable) === 1,
      iconUrl: desc.icon_url
        ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}`
        : null,
      marketUrl: desc.market_hash_name
        ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(desc.market_hash_name)}`
        : null,
      descriptions: compactDescriptions(desc.descriptions),
      tags: compactTags(tags),
    };
  });
}

async function getOwnTradeUrl(steamSession) {
  const html = await fetchTextInSteamWindow({
    steamSession,
    loadUrl: `${STEAM_COMMUNITY}/my/tradeoffers/privacy`,
    requestUrl: `${STEAM_COMMUNITY}/my/tradeoffers/privacy`,
    referer: `${STEAM_COMMUNITY}/`,
  });
  const direct = html.match(/https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&amp;token=[A-Za-z0-9_-]+/i)?.[0]
    || html.match(/https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[A-Za-z0-9_-]+/i)?.[0];
  return direct ? direct.replace(/&amp;/g, '&') : null;
}

function parseTradeUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      partner: parsed.searchParams.get('partner'),
      token: parsed.searchParams.get('token'),
    };
  } catch {
    return { partner: null, token: null };
  }
}

async function fetchJsonInSteamWindow({ steamSession, loadUrl, requestUrl, referer }) {
  const text = await fetchTextLikeBrowser({ steamSession, loadUrl, requestUrl, referer, parseAsJson: true });
  return JSON.parse(text);
}

async function fetchTextInSteamWindow({ steamSession, loadUrl, requestUrl, referer }) {
  return fetchTextLikeBrowser({ steamSession, loadUrl, requestUrl, referer, parseAsJson: false });
}

async function fetchTextLikeBrowser({ steamSession, loadUrl, requestUrl, referer, parseAsJson }) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:steam',
    },
  });

  restrictToSteam(win.webContents);

  try {
    await win.loadURL(loadUrl);
    const relativeRequestUrl = requestUrl.startsWith(STEAM_COMMUNITY)
      ? requestUrl.slice(STEAM_COMMUNITY.length)
      : requestUrl;
    const result = await win.webContents.executeJavaScript(`
      fetch(${JSON.stringify(relativeRequestUrl)}, {
        credentials: 'include',
        headers: {
          'Accept': ${JSON.stringify(parseAsJson ? 'application/json' : 'text/html')}
        },
        referrer: ${JSON.stringify(referer)}
      }).then(async (response) => {
        const text = await response.text();
        return JSON.stringify({
          ok: response.ok,
          status: response.status,
          url: response.url,
          text
        });
      }).catch((error) => JSON.stringify({
        ok: false,
        status: -1,
        url: ${JSON.stringify(relativeRequestUrl)},
        text: String(error && error.message || error)
      }));
    `, true);

    const parsed = JSON.parse(result);
    if (!parsed.ok) {
      const preview = String(parsed.text || '').replace(/\\s+/g, ' ').slice(0, 300);
      throw new Error(`browser fetch returned HTTP ${parsed.status} for ${parsed.url || requestUrl} :: ${preview}`);
    }
    return parsed.text;
  } finally {
    win.destroy();
  }
}
