require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { getSteamRedirectUrl, authenticateSteam } = require('./services/auth');
const { getSteamProfile } = require('./services/steam');
const { getPortfolio, setBasisPerUnitByMarketHashName } = require('./services/portfolio');
const { getMarketSnapshot, getMarketCatalog, getPriceHistory } = require('./services/market');
const { getCsNews } = require('./services/news');
const { createPairingCode, redeemPairingCode, validateDeviceToken, saveDesktopInventory } = require('./services/desktop');

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = path.join(__dirname, '..');
const appFile = 'Steam Invest Portfolio.html';

app.use(express.json({ limit: '50mb' }));
app.use(session({
  name: 'steam-invest.sid',
  secret: process.env.SESSION_SECRET || 'local-dev-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'steam-invest-portfolio',
    steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY),
    now: new Date().toISOString(),
  });
});

app.get('/api/auth/steam', asyncRoute(async (req, res) => {
  const redirectUrl = await getSteamRedirectUrl();
  res.redirect(redirectUrl);
}));

app.get('/api/auth/steam/callback', asyncRoute(async (req, res) => {
  const auth = await authenticateSteam(req);
  await regenerateSession(req);
  req.session.steamId = auth.steamId;
  req.session.steamRaw = auth.raw;
  await saveSession(req);
  res.redirect(`/${encodeURIComponent(appFile)}#dashboard`);
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  await destroySession(req);
  res.json({ ok: true });
}));

app.get('/api/me', asyncRoute(async (req, res) => {
  if (!req.session.steamId) {
    res.json({ connected: false, steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY) });
    return;
  }

  const profile = await getSteamProfile(req.session.steamId);
  res.json({ connected: true, profile, steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY) });
}));

app.get('/api/portfolio', requireAuth, asyncRoute(async (req, res) => {
  const portfolio = await getPortfolio(req.session.steamId, { force: req.query.sync === '1' });
  res.json(portfolio);
}));

app.patch('/api/portfolio/basis', requireAuth, asyncRoute(async (req, res) => {
  await setBasisPerUnitByMarketHashName(req.body?.marketHashName, req.body?.basisPerUnit, req.body?.currency);
  res.json({ ok: true });
}));

app.get('/api/market/snapshot', asyncRoute(async (req, res) => {
  const snapshot = await getMarketSnapshot();
  res.json(snapshot);
}));

app.get('/api/market/catalog', asyncRoute(async (req, res) => {
  const catalog = await getMarketCatalog({
    query: req.query.query,
    page: req.query.page,
    pageSize: req.query.pageSize,
    category: req.query.category,
    rarity: req.query.rarity,
    wear: req.query.wear,
    special: req.query.special,
    sort: req.query.sort,
  });
  res.json(catalog);
}));

app.get('/api/market/history', asyncRoute(async (req, res) => {
  const marketHashName = String(req.query.marketHashName || '');
  if (!marketHashName) {
    res.status(400).json({ error: 'marketHashName is required', code: 'missing_market_hash_name' });
    return;
  }

  const history = await getPriceHistory(marketHashName, req.query.days || 30);
  res.json(history);
}));

app.get('/api/news/cs2', asyncRoute(async (req, res) => {
  const news = await getCsNews();
  res.json(news);
}));

// --- Desktop client pairing & sync ---

app.post('/api/desktop/pairing-code', requireAuth, asyncRoute(async (req, res) => {
  const code = await createPairingCode(req.session.steamId);
  res.json({ code, expiresIn: 600 });
}));

app.post('/api/desktop/pair', express.json(), asyncRoute(async (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code) {
    res.status(400).json({ error: 'Pairing code is required.', code: 'missing_code' });
    return;
  }
  const result = await redeemPairingCode(code);
  if (!result) {
    res.status(401).json({ error: 'Invalid or expired pairing code.', code: 'invalid_code' });
    return;
  }
  res.json({ ok: true, steamId: result.steamId, deviceToken: result.deviceToken });
}));

app.post('/api/desktop/inventory-sync', asyncRoute(async (req, res) => {
  const deviceToken = String(req.headers['x-device-token'] || '').trim();
  const device = await validateDeviceToken(deviceToken);
  if (!device) {
    res.status(401).json({ error: 'Invalid or expired device token.', code: 'invalid_device_token' });
    return;
  }

  const items = req.body?.items;
  if (!Array.isArray(items)) {
    res.status(400).json({ error: 'items array is required.', code: 'missing_items' });
    return;
  }

  await saveDesktopInventory(device.steamId, {
    totalItemCount: items.reduce((sum, item) => sum + Number(item.amount || 1), 0),
    items,
  });

  res.json({ ok: true, steamId: device.steamId, itemCount: items.length });
}));

app.get('/api/desktop/login', asyncRoute(async (req, res) => {
  const deviceToken = String(req.query.deviceToken || '').trim();
  const device = await validateDeviceToken(deviceToken);
  if (!device) {
    res.status(401).json({ error: 'Invalid or expired device token.', code: 'invalid_device_token' });
    return;
  }

  await regenerateSession(req);
  req.session.steamId = device.steamId;
  req.session.desktopLinked = true;
  await saveSession(req);
  res.redirect(`/${encodeURIComponent(appFile)}#dashboard`);
}));

app.get('/api/desktop/status', requireAuth, asyncRoute(async (req, res) => {
  const { getDesktopInventory } = require('./services/desktop');
  const inventory = await getDesktopInventory(req.session.steamId);
  res.json({
    connected: Boolean(inventory),
    syncedAt: inventory?.syncedAt || null,
    totalItemCount: inventory?.totalItemCount || 0,
  });
}));

// --- Static & root ---

app.get('/', (req, res) => {
  res.redirect(`/${encodeURIComponent(appFile)}`);
});

app.use(express.static(rootDir));

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const code = error.code || 'internal_error';
  if (status >= 500) console.error(error);

  res.status(status).json({
    error: error.message || 'Unexpected server error.',
    code,
  });
});

app.listen(port, () => {
  console.log(`Steam Invest Portfolio running at http://localhost:${port}`);
});

function requireAuth(req, res, next) {
  if (!req.session.steamId) {
    res.status(401).json({
      error: 'Steam account is not connected.',
      code: 'not_authenticated',
    });
    return;
  }
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
}

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

function destroySession(req) {
  return new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
}
