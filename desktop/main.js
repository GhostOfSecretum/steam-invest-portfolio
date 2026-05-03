const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({ encryptionKey: 'steam-invest-local-only' });

const SERVER_URL = store.get('serverUrl', 'http://localhost:3000');
const STEAM_COMMUNITY = 'https://steamcommunity.com';
const INVENTORY_URL_PATTERN = /\/inventory\/(\d{17})\/730\/2/;

let mainWindow = null;
let setupWindow = null;

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

  if (isPaired) {
    openDesktopApp().catch((error) => {
      console.warn('[desktop] failed to open paired session:', error.message);
      resetDesktopState();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
      }
    });
    autoSyncIfNeeded();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
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

    const items = await fetchFullInventory(steamId, steamSession);
    const serverUrl = store.get('serverUrl', SERVER_URL);
    await fetch(`${serverUrl}/api/desktop/inventory-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Token': deviceToken },
      body: JSON.stringify({ items }),
    });
    store.set('lastSync', new Date().toISOString());
    console.log(`[auto-sync] done: ${items.length} items`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      openDesktopApp().catch((error) => {
        console.warn('[desktop] failed to refresh paired session:', error.message);
      });
    }
  } catch (err) {
    console.warn('[auto-sync] failed:', err.message);
  }
}

function buildDesktopAppUrl() {
  const serverUrl = store.get('serverUrl', SERVER_URL);
  const deviceToken = store.get('deviceToken');
  if (!deviceToken) return serverUrl;
  return `${serverUrl}/api/desktop/login?deviceToken=${encodeURIComponent(deviceToken)}`;
}

async function openDesktopApp() {
  const url = buildDesktopAppUrl();
  const response = await fetch(url, { redirect: 'manual' }).catch((error) => {
    throw new Error(`desktop login probe failed: ${error.message}`);
  });

  if (response.status === 401) {
    throw new Error('desktop token expired');
  }

  if (response.status >= 400) {
    throw new Error(`desktop login probe returned HTTP ${response.status}`);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(url);
  }
}

function resetDesktopState() {
  store.delete('deviceToken');
  store.delete('steamId');
  store.delete('lastSync');
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
        { type: 'separator' },
        {
          label: 'Disconnect Desktop',
          click: async () => {
            store.delete('deviceToken');
            store.delete('steamId');
            store.delete('lastSync');
            session.fromPartition('persist:steam').clearStorageData();
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
          },
        },
      ],
    },
    { role: 'viewMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function handleSteamLogin() {
  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 800, height: 650, title: 'Steam Login',
      parent: mainWindow, modal: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, partition: 'persist:steam' },
    });
    loginWin.loadURL(`${STEAM_COMMUNITY}/login/home/`);
    loginWin.webContents.on('did-navigate', (_e, url) => {
      if (url.includes('steamcommunity.com/id/') || url.includes('steamcommunity.com/profiles/')) {
        loginWin.close();
      }
    });
    loginWin.on('closed', () => resolve());
  });
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
  const items = await fetchFullInventory(steamId, steamSession);

  await fetch(`${serverUrl}/api/desktop/inventory-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': deviceToken },
    body: JSON.stringify({ items }),
  });
  store.set('lastSync', new Date().toISOString());
  console.log(`[sync] done: ${items.length} items`);

  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(buildDesktopAppUrl());
}

// --- IPC handlers ---

ipcMain.handle('get-state', () => ({
  deviceToken: store.get('deviceToken', null),
  steamId: store.get('steamId', null),
  serverUrl: SERVER_URL,
  lastSync: store.get('lastSync', null),
}));

ipcMain.handle('pair-device', async (_event, { serverUrl, code }) => {
  const response = await fetch(`${serverUrl}/api/desktop/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Pairing failed');

  store.set('deviceToken', data.deviceToken);
  store.set('steamId', data.steamId);
  store.set('serverUrl', serverUrl);

  if (mainWindow && !mainWindow.isDestroyed()) {
    openDesktopApp().catch((error) => {
      console.warn('[desktop] failed after pairing:', error.message);
    });
  }

  return { steamId: data.steamId };
});

ipcMain.handle('open-steam-login', async () => {
  const steamId = store.get('steamId');
  if (!steamId) throw new Error('Not paired yet');

  return new Promise((resolve, reject) => {
    const loginWin = new BrowserWindow({
      width: 800,
      height: 650,
      title: 'Steam Login',
      parent: mainWindow,
      modal: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:steam',
      },
    });

    loginWin.loadURL(`${STEAM_COMMUNITY}/login/home/`);

    loginWin.webContents.on('did-navigate', (_event, url) => {
      if (url.includes('steamcommunity.com/id/') || url.includes('steamcommunity.com/profiles/')) {
        loginWin.close();
        resolve({ ok: true });
      }
    });

    loginWin.on('closed', () => resolve({ ok: true }));
  });
});

ipcMain.handle('sync-inventory', async () => {
  const steamId = store.get('steamId');
  const deviceToken = store.get('deviceToken');
  const serverUrl = store.get('serverUrl', SERVER_URL);
  if (!steamId || !deviceToken) throw new Error('Not paired');

  const steamSession = session.fromPartition('persist:steam');
  const items = await fetchFullInventory(steamId, steamSession);

  const response = await fetch(`${serverUrl}/api/desktop/inventory-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Token': deviceToken,
    },
    body: JSON.stringify({ items }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sync failed');

  store.set('lastSync', new Date().toISOString());
  if (mainWindow && !mainWindow.isDestroyed()) {
    openDesktopApp().catch((error) => {
      console.warn('[desktop] failed after manual sync:', error.message);
    });
  }
  return { itemCount: items.length, totalPieces: items.reduce((s, i) => s + Number(i.amount || 1), 0) };
});

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
  console.log(`[inventory] using trade partner=${trade.partner} token=${trade.token}`);

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
