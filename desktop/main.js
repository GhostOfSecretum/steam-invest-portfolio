const { app, BrowserWindow, dialog, ipcMain, safeStorage, session } = require('electron');
const path = require('path');
const QRCode = require('qrcode');
const Store = require('electron-store');
const { fetchStorageContents, startQrLogin } = require('./gc-storage-sync');
const { mergeInventoryItems } = require('./inventory-merge');

const store = new Store({ encryptionKey: 'steam-invest-local-only' });

const DEFAULT_SERVER_URL = 'https://skinshead.pro';
const SERVER_URL = store.get('serverUrl', DEFAULT_SERVER_URL);
const STEAM_COMMUNITY = 'https://steamcommunity.com';
const INVENTORY_URL_PATTERN = /\/inventory\/(\d{17})\/730\/2/;
const GC_REFRESH_TOKEN_KEY = 'gcRefreshTokenProtected';
const LEGACY_GC_REFRESH_TOKEN_KEY = 'gcRefreshToken';

function normalizeServerUrl(raw) {
  let url = String(raw || '').trim().replace(/\/+$/, '');
  if (!url) throw new Error('Укажите адрес сервера (например https://skinshead.pro)');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
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
        partition: 'persist:steam',
      },
    });

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
  const deviceToken = store.get('deviceToken');
  const isPaired = Boolean(deviceToken);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Steam Invest · Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  if (isPaired) {
    autoSyncIfNeeded();
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

async function autoSyncIfNeeded() {
  try {
    const steamId = store.get('steamId');
    const deviceToken = store.get('deviceToken');
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
  const serverUrl = store.get('serverUrl', SERVER_URL);
  const deviceToken = store.get('deviceToken');

  if (!deviceToken) {
    if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(serverUrl);
    return;
  }

  // Exchange the long-lived device token (sent as a header) for a short-lived,
  // single-use login code, so the token never ends up in a URL / browser history.
  const codeResponse = await fetch(`${serverUrl}/api/desktop/login-code`, {
    method: 'POST',
    headers: { 'X-Device-Token': deviceToken },
  }).catch((error) => {
    throw new Error(`desktop login probe failed: ${error.message}`);
  });

  if (codeResponse.status === 401) {
    throw new Error('desktop token expired');
  }
  if (!codeResponse.ok) {
    throw new Error(`desktop login-code returned HTTP ${codeResponse.status}`);
  }

  const { code } = await codeResponse.json();
  const url = `${serverUrl}/api/desktop/login?code=${encodeURIComponent(code)}`;

  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(url);
  }
}

function resetDesktopState() {
  store.delete('deviceToken');
  store.delete('steamId');
  store.delete('lastSync');
  clearGcState();
}

async function runInventorySync(steamId, steamSession, deviceToken, { includeStorage = true } = {}) {
  const serverUrl = store.get('serverUrl', SERVER_URL);
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
      console.log(`[gc-storage] synced ${storageItems.length} items from storage units`);
    } catch (err) {
      gcStorageError = err.message || String(err);
      console.warn('[gc-storage] sync skipped:', gcStorageError);
    }
  }

  const webItems = await fetchFullInventory(steamId, steamSession);
  const items = mergeInventoryItems(webItems, storageItems);
  const storageItemCount = storageItems.reduce((sum, item) => sum + Number(item.amount || 1), 0);
  const response = await fetch(`${serverUrl}/api/desktop/inventory-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': deviceToken },
    // includeStorage tells the server whether this sync carries Storage Units. When
    // false (background sync), the server keeps the previously synced storage items.
    body: JSON.stringify({ items, storageItemCount, includeStorage }),
  });
  const data = await response.json();
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

app.whenReady().then(() => {
  createWindow();
  buildAppMenu();
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
          label: 'Connect Storage Units (Read-Only)',
          click: async () => {
            try { await openGcQrLoginWindow({ skipConsent: false }); } catch (e) { console.error('[menu] gc login error:', e.message); }
          },
        },
        {
          label: 'Disconnect Storage Units',
          click: () => {
            clearGcState();
          },
        },
        { type: 'separator' },
        {
          label: 'Disconnect Desktop',
          click: async () => {
            resetDesktopState();
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
  const deviceToken = store.get('deviceToken');
  const serverUrl = store.get('serverUrl', SERVER_URL);
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
  deviceToken: store.get('deviceToken', null),
  steamId: store.get('steamId', null),
  serverUrl: store.get('serverUrl', SERVER_URL),
  lastSync: store.get('lastSync', null),
  gcConnected: hasGcRefreshToken(),
  gcAccountName: store.get('gcAccountName', null),
  lastStorageSync: store.get('lastStorageSync', null),
  steamLoggedIn: await hasSteamWebSession(),
}));

ipcMain.handle('pair-device', async (_event, { serverUrl, code }) => {
  const normalizedUrl = normalizeServerUrl(serverUrl);
  const pairingCode = String(code || '').trim();
  if (!/^\d{6}$/.test(pairingCode)) {
    throw new Error('Введите 6-значный код с сайта');
  }

  let response;
  try {
    response = await fetch(`${normalizedUrl}/api/desktop/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code: pairingCode }),
    });
  } catch (error) {
    throw new Error(
      `Не удалось подключиться к ${normalizedUrl}. Проверьте Server URL (для skinshead.pro оставьте https://skinshead.pro). ${error.message}`,
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === 'invalid_code') {
      throw new Error('Неверный или просроченный код. Сгенерируйте новый на сайте (кнопка «Код для desktop»).');
    }
    if (data.code === 'rate_limited') {
      throw new Error('Слишком много попыток. Подождите несколько минут и попробуйте снова.');
    }
    throw new Error(data.error || `Pairing failed (HTTP ${response.status})`);
  }

  store.set('deviceToken', data.deviceToken);
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
  const deviceToken = store.get('deviceToken');
  if (!steamId || !deviceToken) throw new Error('Not paired');

  const steamSession = session.fromPartition('persist:steam');
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

ipcMain.handle('gc-disconnect', () => {
  clearGcState();
  return { ok: true };
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
    buttons: ['Подключить только просмотр', 'Отмена'],
    cancelId: 1,
    defaultId: 1,
    title: 'Подключение Storage Units',
    message: 'Storage Units требуют локального подключения к CS2 Game Coordinator.',
    detail: [
      'Это опциональная read-only функция.',
      'Мы не запрашиваем пароль Steam.',
      'Steam-токен хранится только на этом компьютере через защищённое хранилище ОС.',
      'На сервер отправляется только список предметов, без токенов.',
      'Приложение не умеет перемещать, продавать, трейдить, удалять или переименовывать предметы.',
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
      title: 'Хранилища · только просмотр',
      modal: false,
      show: false,
      backgroundColor: '#0a0c11',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'preload-gc-qr.js'),
      },
    });

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

ipcMain.handle('disconnect', () => {
  resetDesktopState();
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

    const json = await response.json();
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
        tradable: desc.tradable === 1,
        marketable: desc.marketable === 1,
        iconUrl: desc.icon_url
          ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}`
          : null,
        marketUrl: desc.market_hash_name
          ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(desc.market_hash_name)}`
          : null,
        descriptions: (desc.descriptions || []).map((p) => p.value).filter(Boolean),
        tags,
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
      tradable: Number(desc.tradable) === 1,
      marketable: Number(desc.marketable) === 1,
      iconUrl: desc.icon_url
        ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}`
        : null,
      marketUrl: desc.market_hash_name
        ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(desc.market_hash_name)}`
        : null,
      descriptions: (desc.descriptions || []).map((p) => p.value).filter(Boolean),
      tags,
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
      partition: 'persist:steam',
    },
  });

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
