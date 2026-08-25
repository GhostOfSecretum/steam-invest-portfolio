require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getSteamRedirectUrl, authenticateSteam } = require('./services/auth');
const { getSteamProfile, resolveSteamProfileInput } = require('./services/steam');
const {
  getPortfolio,
  listPortfolios,
  createManualPortfolio,
  deleteManualPortfolio,
  addManualPortfolioItem,
  deleteManualPortfolioItem,
  updateManualPortfolioItem,
  setBasisPerUnitByMarketHashName,
  setManualBasisPerUnitByMarketHashName,
  deleteManualPortfolioEvent,
  migrateOwnershipToSteam,
} = require('./services/portfolio');
const {
  listFavoriteProfiles,
  addFavoriteProfile,
  removeFavoriteProfile,
  migrateFavoriteProfilesToSteam,
} = require('./services/favorite-profiles');
const { listPlans, applyItemDisplayLimit, planAllows, getDownloadArtifact } = require('./services/plans');
const {
  renderPrivacyPage,
  renderTermsPage,
  renderSupportPage,
  renderPricingPage,
} = require('./services/legal');
const {
  getOwnerPlanId,
  getOwnerSubscription,
  setOwnerPlan,
  startInvestorTrial,
  grantWelcomePlusTrial,
  migrateSubscriptionToSteam,
} = require('./services/subscriptions');
const {
  isBillingReady,
  createCheckout,
  handlePlategaCallback,
  syncPaymentByQuery,
} = require('./services/billing');
const {
  isBetaMode,
  getBetaPublicConfig,
  unlockBetaAccess,
  unlockInvestorTrialViaTelegram,
  isBetaUnlockConfigured,
} = require('./services/betaAccess');
const {
  listTopInvestors,
  upsertTopInvestor,
  listTopInvestorsActivityFeed,
  getTopInvestorActivity,
  startTopInvestorsActivityPoller,
} = require('./services/top-investors');
const { getMarketSnapshot, getMarketCatalog, getPrices, getPriceHistory, getItemOffers, getItemVariants, getMultiWearHistory } = require('./services/market');
const { getCsNews } = require('./services/news');
const { getArmoryRoi } = require('./services/armory');
const { getTelegramPostMedia } = require('./services/telegram');
const { getItemPageData, renderItemHtml, renderAppShellHtml, SITE_URL, buildSitemapXml } = require('./services/items');
const { getCollectionPageData } = require('./services/collections');
const {
  createPairingCode,
  redeemPairingCode,
  validateDeviceToken,
  createDesktopLoginCode,
  redeemDesktopLoginCode,
  saveDesktopInventory,
  getDesktopInventory,
} = require('./services/desktop');
const { recordSteamLogin, getSteamLoginStats } = require('./services/users');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}
const rootDir = path.join(__dirname, '..');
const appFile = 'Steam Invest Portfolio.html';

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) {
    throw new Error('SESSION_SECRET is required in production. Generate one with `openssl rand -hex 32`.');
  }
  console.warn('[security] SESSION_SECRET is not set — using an ephemeral dev secret. Sessions reset on restart.');
}
const resolvedSessionSecret = sessionSecret || crypto.randomBytes(32).toString('hex');
// Cookies must be Secure behind TLS in production. Enable explicitly via COOKIE_SECURE
// or automatically when running with NODE_ENV=production (expects a TLS-terminating proxy).
const cookieSecure = process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true' || isProduction;

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Collapse www → apex so Google does not pick www.*/favorites over the homepage.
try {
  const canonicalHost = new URL(SITE_URL).hostname.toLowerCase();
  app.use((req, res, next) => {
    const host = String(req.hostname || '').toLowerCase();
    if (host === `www.${canonicalHost}`) {
      res.redirect(301, `${SITE_URL}${req.originalUrl || '/'}`);
      return;
    }
    next();
  });
} catch {
  // SITE_URL misconfigured — skip host redirect.
}

// Default body limit is small; the large limit only applies to inventory sync.
// This runs first, marks the body as parsed, so the global parser skips it.
app.use('/api/desktop/inventory-sync', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '256kb' }));
app.use(session({
  name: 'steam-invest.sid',
  secret: resolvedSessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

const pairingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many pairing attempts. Try again later.', code: 'rate_limited' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.', code: 'rate_limited' },
});
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many checkout attempts. Try again later.', code: 'rate_limited' },
});
const betaUnlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many unlock attempts. Try again later.', code: 'rate_limited' },
});
const investorTrialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many trial attempts. Try again later.', code: 'rate_limited' },
});

function effectiveBillingReady() {
  // Investor stays purchasable during beta; Plus unlocks free via Telegram.
  return isBillingReady();
}

function withBillingFlags(subscription) {
  return {
    ...(subscription || {}),
    billingReady: effectiveBillingReady(),
    beta: getBetaPublicConfig(),
  };
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'steam-invest-portfolio',
    steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY),
    now: new Date().toISOString(),
  });
});

app.get('/api/auth/steam', authLimiter, asyncRoute(async (req, res) => {
  const redirectUrl = await getSteamRedirectUrl(req);
  res.redirect(redirectUrl);
}));

app.get('/api/auth/steam/callback', authLimiter, asyncRoute(async (req, res) => {
  const auth = await authenticateSteam(req);
  const priorOwnerId = req.session.ownerId || null;
  await regenerateSession(req);
  req.session.steamId = auth.steamId;
  req.session.steamRaw = auth.raw;
  await saveSession(req);
  await migrateOwnershipToSteam(priorOwnerId, auth.steamId);
  await migrateFavoriteProfilesToSteam(priorOwnerId, auth.steamId);
  await migrateSubscriptionToSteam(priorOwnerId, auth.steamId);
  await recordSteamLogin(auth.steamId, { source: 'steam_openid' });
  try {
    await grantWelcomePlusTrial(`steam:${auth.steamId}`);
  } catch (error) {
    console.warn('[welcome-plus-trial]', error.message);
  }
  res.redirect('/dashboard');
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  await destroySession(req);
  res.json({ ok: true });
}));

app.get('/api/me', asyncRoute(async (req, res) => {
  const ownerId = resolveOwnerId(req);
  const subscription = withBillingFlags(await getOwnerSubscription(ownerId));
  const beta = getBetaPublicConfig();
  if (!req.session.steamId) {
    res.json({
      connected: false,
      steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY),
      subscription,
      beta,
      billingReady: effectiveBillingReady(),
    });
    return;
  }

  let profile;
  try {
    profile = await getSteamProfile(req.session.steamId);
  } catch {
    profile = {
      steamId: req.session.steamId,
      personaname: `STEAM/${String(req.session.steamId).slice(-6)}`,
      profileurl: `https://steamcommunity.com/profiles/${req.session.steamId}`,
      avatar: null,
      avatarmedium: null,
      avatarfull: null,
    };
  }
  res.json({
    connected: true,
    profile,
    steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY),
    subscription,
    beta,
    billingReady: effectiveBillingReady(),
  });
}));

app.get('/api/beta', (req, res) => {
  res.json(getBetaPublicConfig());
});

app.post('/api/beta/telegram-unlock', betaUnlockLimiter, requireAuth, asyncRoute(async (req, res) => {
  const ownerId = resolveOwnerId(req);
  try {
    const result = await unlockBetaAccess(ownerId, req.body || {});
    res.json({
      ok: true,
      ...result,
      beta: getBetaPublicConfig(),
      billingReady: effectiveBillingReady(),
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({
      error: error.message || 'Beta unlock failed.',
      code: error.code || 'beta_unlock_failed',
      channelUrl: error.channelUrl || getBetaPublicConfig().channelUrl,
    });
  }
}));

app.post('/api/trials/investor', investorTrialLimiter, requireAuth, asyncRoute(async (req, res) => {
  const ownerId = resolveOwnerId(req);
  try {
    // Prefer Telegram channel unlock when the bot is configured.
    let subscription;
    if (isBetaUnlockConfigured()) {
      const result = await unlockInvestorTrialViaTelegram(ownerId, req.body || {});
      subscription = result.subscription;
      res.json({
        ok: true,
        subscription: withBillingFlags(subscription),
        billingReady: effectiveBillingReady(),
        channelUrl: result.channelUrl,
        telegram: result.telegram,
      });
      return;
    }
    subscription = await startInvestorTrial(ownerId);
    res.json({
      ok: true,
      subscription: withBillingFlags(subscription),
      billingReady: effectiveBillingReady(),
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({
      error: error.message || 'Investor trial failed.',
      code: error.code || 'investor_trial_failed',
      channelUrl: error.channelUrl || getBetaPublicConfig().channelUrl,
    });
  }
}));

app.get('/api/plans', asyncRoute(async (req, res) => {
  const beta = getBetaPublicConfig();
  res.json({
    plans: listPlans(req.query.locale),
    billingReady: effectiveBillingReady(),
    beta,
    current: withBillingFlags(await getOwnerSubscription(resolveOwnerId(req))),
  });
}));

app.get('/api/subscription', asyncRoute(async (req, res) => {
  const beta = getBetaPublicConfig();
  res.json({
    subscription: withBillingFlags(await getOwnerSubscription(resolveOwnerId(req))),
    billingReady: effectiveBillingReady(),
    beta,
  });
}));

// Temporary manual plan assignment (admin). Billing uses POST /api/billing/checkout.
// Requires PLAN_ADMIN_SECRET in the environment.
app.post('/api/subscription/plan', asyncRoute(async (req, res) => {
  const adminSecret = String(process.env.PLAN_ADMIN_SECRET || '').trim();
  const provided = String(req.headers['x-plan-admin-secret'] || req.body?.adminSecret || '').trim();
  if (!adminSecret || provided !== adminSecret) {
    res.status(403).json({ error: 'Plan admin secret required.', code: 'plan_admin_forbidden' });
    return;
  }
  const ownerId = resolveOwnerId(req, { create: true });
  const subscription = await setOwnerPlan(ownerId, req.body?.planId, { source: 'admin' });
  res.json({ subscription, billingReady: effectiveBillingReady(), beta: getBetaPublicConfig() });
}));

// Unique Steam login stats. Requires PLAN_ADMIN_SECRET — not public.
app.get('/api/admin/users', asyncRoute(async (req, res) => {
  const adminSecret = String(process.env.PLAN_ADMIN_SECRET || '').trim();
  const provided = String(req.headers['x-plan-admin-secret'] || '').trim();
  if (!adminSecret || provided !== adminSecret) {
    res.status(403).json({ error: 'Plan admin secret required.', code: 'plan_admin_forbidden' });
    return;
  }
  res.json(await getSteamLoginStats());
}));

app.post('/api/billing/checkout', checkoutLimiter, requireAuth, asyncRoute(async (req, res) => {
  const planId = String(req.body?.planId || '').trim().toLowerCase();
  const locale = String(req.body?.locale || req.query.locale || '').trim();
  // RU beta still unlocks Plus via Telegram; other locales can pay (card or crypto).
  if (isBetaMode() && planId === 'plus' && locale.toLowerCase().startsWith('ru')) {
    res.status(503).json({
      error: 'Plus is free during beta. Unlock it via the Telegram channel.',
      code: 'beta_plus_free',
      channelUrl: getBetaPublicConfig().channelUrl,
    });
    return;
  }
  const ownerId = resolveOwnerId(req);
  const checkout = await createCheckout({
    ownerId,
    steamId: req.session.steamId,
    planId,
    cycle: req.body?.cycle,
    locale,
    req,
  });
  res.json(checkout);
}));

app.post('/api/billing/platega/callback', asyncRoute(async (req, res) => {
  await handlePlategaCallback(req);
  res.status(200).json({ ok: true });
}));

app.get('/api/billing/sync', checkoutLimiter, asyncRoute(async (req, res) => {
  const result = await syncPaymentByQuery({
    paymentId: req.query.payment,
    transactionId: req.query.tx,
  });
  res.json({
    payment: {
      id: result.payment.id,
      status: result.payment.status,
      planId: result.payment.planId,
      cycle: result.payment.cycle,
      amountRub: result.payment.amountRub,
      expiresAt: result.payment.expiresAt,
    },
    subscription: result.subscription,
  });
}));

app.get('/billing/success', asyncRoute(async (req, res) => {
  try {
    if (req.query.payment || req.query.tx) {
      await syncPaymentByQuery({
        paymentId: req.query.payment,
        transactionId: req.query.tx,
      });
    }
  } catch (error) {
    console.warn('[billing] success sync failed:', error.message);
  }
  res.redirect('/dashboard?billing=success');
}));

app.get('/billing/fail', (req, res) => {
  res.redirect('/dashboard?billing=fail');
});

app.get('/api/portfolio', asyncRoute(async (req, res) => {
  if (req.query.sync === '1' && !req.session.steamId) {
    res.status(401).json({ error: 'Steam account is not connected.', code: 'not_authenticated' });
    return;
  }

  const ownerId = resolveOwnerId(req);
  const planId = await getOwnerPlanId(ownerId);
  const portfolio = await getPortfolio(req.session.steamId || null, {
    force: req.query.sync === '1',
    portfolioId: req.query.portfolioId,
    ownerId,
  });
  res.json(applyItemDisplayLimit(portfolio, planId));
}));

app.get('/api/portfolio/public', asyncRoute(async (req, res) => {
  const profileInput = String(req.query.profile || '').trim();
  if (!profileInput) {
    res.status(400).json({ error: 'Steam profile URL is required.', code: 'missing_profile_url' });
    return;
  }

  const steamId = await resolveSteamProfileInput(profileInput);
  const planId = await getOwnerPlanId(resolveOwnerId(req));
  const portfolio = await getPortfolio(steamId, {
    force: req.query.sync === '1',
    includeDesktop: false,
    activitySource: 'public-diff',
  });

  res.json(applyItemDisplayLimit({
    ...portfolio,
    portfolioId: `public-${steamId}`,
    portfolioName: portfolio.profile?.personaname || `STEAM/${steamId.slice(-6)}`,
    portfolioType: 'public-steam',
    portfolios: [],
    desktopConnected: false,
    storageItemCount: 0,
  }, planId));
}));

app.patch('/api/portfolio/basis', asyncRoute(async (req, res) => {
  const portfolioId = String(req.body?.portfolioId || '').trim();
  if (portfolioId && portfolioId !== 'steam') {
    const ownerId = resolveOwnerId(req, { create: true });
    await setManualBasisPerUnitByMarketHashName(ownerId, portfolioId, req.body?.marketHashName, req.body?.basisPerUnit, req.body?.currency);
    res.json({ ok: true });
    return;
  }

  if (!req.session.steamId) {
    res.status(401).json({ error: 'Steam account is not connected.', code: 'not_authenticated' });
    return;
  }

  await setBasisPerUnitByMarketHashName(req.session.steamId, req.body?.marketHashName, req.body?.basisPerUnit, req.body?.currency);
  res.json({ ok: true });
}));

app.get('/api/favorite-profiles', asyncRoute(async (req, res) => {
  const profiles = await listFavoriteProfiles(resolveOwnerId(req));
  res.json({ profiles });
}));

app.post('/api/favorite-profiles', asyncRoute(async (req, res) => {
  const profile = await addFavoriteProfile(resolveOwnerId(req, { create: true }), req.body);
  res.status(201).json({ profile });
}));

app.delete('/api/favorite-profiles/:steamId', asyncRoute(async (req, res) => {
  const deleted = await removeFavoriteProfile(resolveOwnerId(req, { create: true }), req.params.steamId);
  if (!deleted) {
    res.status(404).json({ error: 'Favorite profile not found.', code: 'favorite_not_found' });
    return;
  }
  res.json({ ok: true });
}));

app.get('/api/portfolios', asyncRoute(async (req, res) => {
  const portfolios = await listPortfolios(resolveOwnerId(req), req.session.steamId || null);
  res.json({ portfolios });
}));

app.post('/api/portfolios', asyncRoute(async (req, res) => {
  const portfolio = await createManualPortfolio(resolveOwnerId(req, { create: true }), req.body?.name);
  res.status(201).json({ portfolio });
}));

app.delete('/api/portfolios/:portfolioId', asyncRoute(async (req, res) => {
  const deleted = await deleteManualPortfolio(resolveOwnerId(req, { create: true }), req.params.portfolioId);
  if (!deleted) {
    res.status(404).json({ error: 'Manual portfolio not found.', code: 'portfolio_not_found' });
    return;
  }
  res.json({ ok: true });
}));

app.post('/api/portfolios/:portfolioId/items', asyncRoute(async (req, res) => {
  const portfolio = await addManualPortfolioItem(resolveOwnerId(req, { create: true }), req.params.portfolioId, req.body);
  res.status(201).json({ portfolio });
}));

app.patch('/api/portfolios/:portfolioId/items/:itemId', asyncRoute(async (req, res) => {
  const item = await updateManualPortfolioItem(resolveOwnerId(req, { create: true }), req.params.portfolioId, req.params.itemId, req.body);
  res.json({ item });
}));

app.delete('/api/portfolios/:portfolioId/items/:itemId', asyncRoute(async (req, res) => {
  const deleted = await deleteManualPortfolioItem(resolveOwnerId(req, { create: true }), req.params.portfolioId, req.params.itemId);
  if (!deleted) {
    res.status(404).json({ error: 'Manual portfolio item not found.', code: 'item_not_found' });
    return;
  }
  res.json({ ok: true });
}));

app.delete('/api/portfolios/:portfolioId/events/:eventId', asyncRoute(async (req, res) => {
  const result = await deleteManualPortfolioEvent(
    resolveOwnerId(req, { create: true }),
    req.params.portfolioId,
    req.params.eventId,
  );
  res.json(result);
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

app.get('/api/market/prices', asyncRoute(async (req, res) => {
  const rawNames = Array.isArray(req.query.names) ? req.query.names : [req.query.names];
  const names = rawNames
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!names.length) {
    res.status(400).json({ error: 'names is required', code: 'missing_names' });
    return;
  }

  const prices = await getPrices(names, 12, { maxAgeMs: 2 * 60 * 1000 });
  res.set('Cache-Control', 'no-store');
  res.json({ prices, updatedAt: new Date().toISOString() });
}));

app.get('/api/market/history', asyncRoute(async (req, res) => {
  const marketHashName = String(req.query.marketHashName || '');
  if (!marketHashName) {
    res.status(400).json({ error: 'marketHashName is required', code: 'missing_market_hash_name' });
    return;
  }

  const anchorPrice = Number(req.query.anchor);
  const history = await getPriceHistory(marketHashName, req.query.days || 30, {
    anchorPrice: Number.isFinite(anchorPrice) && anchorPrice > 0 ? anchorPrice : null,
    currency: String(req.query.currency || 'usd'),
  });
  res.json(history);
}));

app.get('/api/market/offers', asyncRoute(async (req, res) => {
  const marketHashName = String(req.query.marketHashName || '');
  if (!marketHashName) {
    res.status(400).json({ error: 'marketHashName is required', code: 'missing_market_hash_name' });
    return;
  }
  const offers = await getItemOffers(marketHashName, String(req.query.currency || 'usd'));
  res.json(offers);
}));

app.get('/api/market/variants', asyncRoute(async (req, res) => {
  const marketHashName = String(req.query.marketHashName || '');
  if (!marketHashName) {
    res.status(400).json({ error: 'marketHashName is required', code: 'missing_market_hash_name' });
    return;
  }
  const variants = await getItemVariants(marketHashName, String(req.query.currency || 'usd'));
  res.json(variants);
}));

app.get('/api/market/history-multi', asyncRoute(async (req, res) => {
  const raw = req.query.names;
  const names = (Array.isArray(raw) ? raw : raw != null ? [raw] : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  if (!names.length) {
    res.status(400).json({ error: 'names is required', code: 'missing_names' });
    return;
  }
  const anchorPrice = Number(req.query.anchor);
  const history = await getMultiWearHistory(names, req.query.days || 30, {
    anchorPrice: Number.isFinite(anchorPrice) && anchorPrice > 0 ? anchorPrice : null,
    currency: String(req.query.currency || 'usd'),
  });
  res.json(history);
}));

app.get('/api/news/cs2', asyncRoute(async (req, res) => {
  const news = await getCsNews();
  res.json(news);
}));

app.get('/api/armory/roi', asyncRoute(async (req, res) => {
  const roi = await getArmoryRoi({
    currency: req.query.currency,
    starPreset: req.query.starPreset,
    customUsdPerStar: req.query.customUsdPerStar,
    steamFees: req.query.steamFees,
  });
  res.json(roi);
}));

app.get('/api/news/telegram-media/:sourceId/:messageId', asyncRoute(async (req, res) => {
  const media = await getTelegramPostMedia(req.params.sourceId, req.params.messageId);
  if (!media) {
    res.status(404).json({ error: 'Telegram media not found.', code: 'telegram_media_not_found' });
    return;
  }

  res.set({
    'Content-Type': media.contentType,
    'Cache-Control': 'public, max-age=1800',
  });
  res.send(media.buffer);
}));

// --- Desktop client pairing & sync ---

app.post('/api/desktop/pairing-code', authLimiter, requireAuth, asyncRoute(async (req, res) => {
  const planId = await getOwnerPlanId(resolveOwnerId(req));
  if (!planAllows(planId, 'desktopDownload')) {
    res.status(403).json({
      error: 'Desktop sync requires Plus or Investor plan.',
      code: 'plan_required',
      requiredFeature: 'desktopDownload',
      planId,
    });
    return;
  }
  const code = await createPairingCode(req.session.steamId);
  res.json({ code, expiresIn: 300 });
}));

app.get('/api/downloads/:artifact', asyncRoute(async (req, res) => {
  const artifact = getDownloadArtifact(req.params.artifact);
  if (!artifact) {
    res.status(404).json({ error: 'Download not found.', code: 'download_not_found' });
    return;
  }

  const planId = await getOwnerPlanId(resolveOwnerId(req));
  if (!planAllows(planId, 'desktopDownload')) {
    res.status(403).json({
      error: 'Desktop download requires Plus or Investor plan.',
      code: 'plan_required',
      requiredFeature: 'desktopDownload',
      planId,
    });
    return;
  }

  const filePath = path.join(rootDir, 'downloads', artifact.file);
  try {
    await fs.access(filePath);
  } catch {
    res.status(404).json({ error: 'Installer file is not available on this server.', code: 'download_missing' });
    return;
  }

  res.download(filePath, artifact.file, {
    headers: { 'Content-Type': artifact.contentType },
  });
}));

app.get('/api/top-investors', asyncRoute(async (req, res) => {
  res.json(await listTopInvestors());
}));

app.get('/api/top-investors/activity', asyncRoute(async (req, res) => {
  res.json(await listTopInvestorsActivityFeed());
}));

app.get('/api/top-investors/:steamId/activity', asyncRoute(async (req, res) => {
  const steamId = String(req.params.steamId || '').trim();
  if (!/^\d{17}$/.test(steamId)) {
    res.status(400).json({ error: 'Valid SteamID64 is required.', code: 'invalid_steam_id' });
    return;
  }
  try {
    res.json(await getTopInvestorActivity(steamId, { sync: req.query.sync === '1' }));
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Failed to load investor activity.',
      code: error.code || 'investor_activity_failed',
    });
  }
}));

app.post('/api/top-investors', asyncRoute(async (req, res) => {
  const adminSecret = String(process.env.PLAN_ADMIN_SECRET || '').trim();
  const provided = String(req.headers['x-plan-admin-secret'] || req.body?.adminSecret || '').trim();
  if (!adminSecret || provided !== adminSecret) {
    res.status(403).json({ error: 'Plan admin secret required.', code: 'plan_admin_forbidden' });
    return;
  }
  const account = await upsertTopInvestor(req.body);
  res.status(201).json({ account });
}));

app.post('/api/desktop/pair', pairingLimiter, asyncRoute(async (req, res) => {
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

app.post('/api/desktop/inventory-sync', pairingLimiter, asyncRoute(async (req, res) => {
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
  if (items.length > 50000) {
    res.status(413).json({ error: 'Too many inventory items.', code: 'too_many_items' });
    return;
  }

  const sumPieces = (list) => list.reduce((sum, item) => sum + Number(item.amount || 1), 0);
  // When a background sync omits Хранилища, keep the previously synced storage
  // items instead of wiping them out of the portfolio.
  const includeStorage = req.body?.includeStorage !== false;
  let mergedItems = items;
  let storageItemCount;

  if (includeStorage) {
    storageItemCount = Number.isFinite(Number(req.body?.storageItemCount))
      ? Number(req.body.storageItemCount)
      : sumPieces(items.filter((item) => item.inStorage));
  } else {
    const previous = await getDesktopInventory(device.steamId).catch(() => null);
    const previousStorage = (previous?.items || []).filter((item) => item.inStorage);
    const freshNonStorage = items.filter((item) => !item.inStorage);
    mergedItems = [...freshNonStorage, ...previousStorage];
    storageItemCount = Number.isFinite(previous?.storageItemCount)
      ? previous.storageItemCount
      : sumPieces(previousStorage);
  }

  await saveDesktopInventory(device.steamId, {
    totalItemCount: sumPieces(mergedItems),
    storageItemCount,
    items: mergedItems,
  });

  res.json({ ok: true, steamId: device.steamId, itemCount: mergedItems.length, storageItemCount });
}));

app.post('/api/desktop/login-code', pairingLimiter, asyncRoute(async (req, res) => {
  const deviceToken = String(req.headers['x-device-token'] || '').trim();
  const code = await createDesktopLoginCode(deviceToken);
  if (!code) {
    res.status(401).json({ error: 'Invalid or expired device token.', code: 'invalid_device_token' });
    return;
  }
  res.json({ code, expiresIn: 60 });
}));

app.get('/api/desktop/login', pairingLimiter, asyncRoute(async (req, res) => {
  const code = String(req.query.code || '').trim();
  const loginSession = await redeemDesktopLoginCode(code);
  if (!loginSession) {
    res.status(401).json({ error: 'Invalid or expired login code.', code: 'invalid_login_code' });
    return;
  }

  const priorOwnerId = req.session.ownerId || null;
  await regenerateSession(req);
  req.session.steamId = loginSession.steamId;
  req.session.desktopLinked = true;
  await saveSession(req);
  await migrateOwnershipToSteam(priorOwnerId, loginSession.steamId);
  await migrateFavoriteProfilesToSteam(priorOwnerId, loginSession.steamId);
  await migrateSubscriptionToSteam(priorOwnerId, loginSession.steamId);
  await recordSteamLogin(loginSession.steamId, { source: 'desktop' });
  try {
    await grantWelcomePlusTrial(`steam:${loginSession.steamId}`);
  } catch (error) {
    console.warn('[welcome-plus-trial]', error.message);
  }
  res.redirect('/dashboard');
}));

app.get('/api/desktop/status', requireAuth, asyncRoute(async (req, res) => {
  const { getDesktopInventory } = require('./services/desktop');
  const inventory = await getDesktopInventory(req.session.steamId);
  res.json({
    connected: Boolean(inventory),
    syncedAt: inventory?.syncedAt || null,
    totalItemCount: inventory?.totalItemCount || 0,
    storageItemCount: inventory?.storageItemCount || 0,
  });
}));

// --- Static & root ---

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(buildSitemapXml());
});

app.get('/api/items/by-slug/:slug', asyncRoute(async (req, res) => {
  const data = await getItemPageData(req.params.slug);
  if (!data) {
    res.status(404).json({ error: 'Item not found.', code: 'item_not_found' });
    return;
  }
  res.json(data);
}));

app.get('/api/collections/:slug', asyncRoute(async (req, res) => {
  const data = await getCollectionPageData(req.params.slug, {
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  if (!data) {
    res.status(404).json({ error: 'Collection not found.', code: 'collection_not_found' });
    return;
  }
  res.json(data);
}));

app.get('/item/:slug', asyncRoute(async (req, res) => {
  const data = await getItemPageData(req.params.slug);
  if (!data) {
    res.status(404).type('text/html').send('<!doctype html><title>Item not found · SkinsHead</title><p>Item not found.</p>');
    return;
  }
  const html = await renderItemHtml(path.join(rootDir, appFile), data.seo);
  res.type('html').send(html);
}));

app.get('/collection/:slug', asyncRoute(async (req, res) => {
  await sendAppShell(res);
}));

async function sendAppShell(res) {
  const html = await renderAppShellHtml(path.join(rootDir, appFile));
  res.type('html').send(html);
}

app.get('/dashboard', asyncRoute(async (req, res) => {
  await sendAppShell(res);
}));

app.get('/favorites', asyncRoute(async (req, res) => {
  await sendAppShell(res);
}));

app.get('/investors', asyncRoute(async (req, res) => {
  await sendAppShell(res);
}));

app.get('/market', asyncRoute(async (req, res) => {
  await sendAppShell(res);
}));

app.get('/armory', asyncRoute(async (req, res) => {
  await sendAppShell(res);
}));

// Permanent legal / billing pages for payment provider review (no JS required).
app.get('/privacy', (req, res) => {
  res.type('html').send(renderPrivacyPage());
});

app.get('/terms', (req, res) => {
  res.type('html').send(renderTermsPage());
});

app.get('/support', (req, res) => {
  res.type('html').send(renderSupportPage());
});

app.get('/pricing', (req, res) => {
  res.type('html').send(renderPricingPage());
});

app.get('/glock-3d', asyncRoute(async (req, res) => {
  await sendAppShell(res);
}));

app.get('/glock3d', (req, res) => {
  res.redirect(301, '/glock-3d');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, appFile));
});

// Desktop installers are plan-gated via /api/downloads/:artifact — block direct static access.
app.use('/downloads', (req, res) => {
  res.status(403).json({
    error: 'Desktop download requires Plus or Investor plan. Use /api/downloads/:artifact.',
    code: 'plan_required',
    requiredFeature: 'desktopDownload',
  });
});

// Only serve browser assets. Never expose server/, desktop/, scripts/, audits, etc.
const PUBLIC_ROOT_EXTENSIONS = new Set([
  '.css', '.js', '.jsx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico',
]);
const PUBLIC_ASSET_EXTENSIONS = new Set([
  ...PUBLIC_ROOT_EXTENSIONS,
  '.json', '.woff', '.woff2', '.ttf', '.map',
]);
const PUBLIC_ROOT_FILES = new Set([
  'robots.txt',
  'yandex_4cff244ace473e62.html',
]);

function isAllowedPublicAsset(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(requestPath || ''));
  } catch {
    return false;
  }
  const normalized = path.posix.normalize(`/${decoded}`).replace(/\\/g, '/');
  if (!normalized.startsWith('/') || normalized.includes('\0') || normalized.includes('/.')) {
    return false;
  }

  const basename = path.posix.basename(normalized);
  const ext = path.posix.extname(basename).toLowerCase();

  if (normalized.startsWith('/assets/')) {
    return PUBLIC_ASSET_EXTENSIONS.has(ext);
  }

  // Root-level client files only (no nested backend paths).
  if (normalized === `/${basename}`) {
    if (PUBLIC_ROOT_FILES.has(basename)) return true;
    return PUBLIC_ROOT_EXTENSIONS.has(ext);
  }

  return false;
}

const servePublicAssets = express.static(rootDir, {
  dotfiles: 'deny',
  index: false,
  fallthrough: true,
});

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  if (!isAllowedPublicAsset(req.path)) {
    next();
    return;
  }
  servePublicAssets(req, res, next);
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const code = error.code || 'internal_error';
  if (status >= 500) console.error(error);

  res.status(status).json({
    error: error.message || 'Unexpected server error.',
    code,
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.', code: 'not_found' });
});

app.listen(port, () => {
  console.log(`Steam Invest Portfolio running at http://localhost:${port}`);
  startTopInvestorsActivityPoller();
});

// Owner id scopes manual portfolios & basis per user: the Steam account when
// logged in, otherwise a stable per-session anonymous id (only created on write).
function resolveOwnerId(req, { create = false } = {}) {
  if (req.session.steamId) return `steam:${req.session.steamId}`;
  if (req.session.ownerId) return req.session.ownerId;
  if (create) {
    req.session.ownerId = `anon:${crypto.randomUUID()}`;
    return req.session.ownerId;
  }
  return null;
}

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
