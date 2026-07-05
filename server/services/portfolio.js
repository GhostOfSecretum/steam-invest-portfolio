const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getSteamInventory, getSteamProfile } = require('./steam');
const { getPrices, getPriceHistory, getSteamCurrencyRatio, getSteamRubRate, getSteamMarketIcon, rarityToTier } = require('./prices');
const { getDesktopInventory } = require('./desktop');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const BASIS_FILE = path.join(DATA_DIR, 'portfolio.json');
const MANUAL_PORTFOLIOS_FILE = path.join(DATA_DIR, 'manual-portfolios.json');
const iconRefreshes = new Set();

async function getPortfolio(steamId, options = {}) {
  const portfolioId = String(options.portfolioId || '').trim();
  if (portfolioId && portfolioId !== 'steam') {
    return getManualPortfolio(portfolioId, steamId);
  }

  if (!steamId) {
    const store = await readManualPortfolioStore();
    const active = resolveActiveManualPortfolio(store, portfolioId);
    return active ? getManualPortfolio(active.id, null) : buildEmptyManualPortfolio(store, null);
  }

  const includeDesktop = options.includeDesktop !== false;
  const [profile, steamInventory, desktopInventory, basis] = await Promise.all([
    getSteamProfile(steamId),
    getSteamInventory(steamId, options),
    includeDesktop ? getDesktopInventory(steamId).catch(() => null) : Promise.resolve(null),
    readBasis(),
  ]);

  const useDesktop = desktopInventory && Array.isArray(desktopInventory.items) && desktopInventory.items.length > 0;
  const storageItemCount = useDesktop ? Number(desktopInventory.storageItemCount || 0) : 0;
  const inventory = useDesktop
    ? {
      syncedAt: desktopInventory.syncedAt,
      cached: false,
      inventoryProvider: 'desktop',
      totalInventoryCount: desktopInventory.totalItemCount,
      assetEntriesCount: desktopInventory.items.length,
      storageItemCount,
      items: desktopInventory.items,
    }
    : steamInventory;

  const marketHashNames = inventory.items.map((item) => item.marketHashName);
  const prices = await getPrices(marketHashNames, Number.MAX_SAFE_INTEGER);
  const sourceItems = inventory.items.map((item) => enrichItem(item, prices[item.marketHashName], basis));
  const items = aggregatePortfolioItems(sourceItems);

  const pricedItems = items.filter((item) => item.value != null);
  const totalValue = pricedItems.reduce((sum, item) => sum + item.value * item.qty, 0);
  const totalBasis = items.reduce((sum, item) => sum + item.basis * item.qty, 0);
  const pricedCount = pricedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalVolume = pricedItems.reduce((sum, item) => sum + (item.volume24h || 0), 0);
  const providerLabel = useDesktop ? 'desktop' : (inventory.inventoryProvider || 'steam-public');
  const history = await buildPortfolioHistory(pricedItems, totalValue);

  return {
    portfolioId: 'steam',
    portfolioName: 'Steam inventory',
    portfolioType: 'steam',
    portfolios: await listPortfolios(steamId),
    profile,
    syncedAt: inventory.syncedAt,
    cached: inventory.cached,
    inventoryProvider: providerLabel,
    desktopConnected: useDesktop,
    storageItemCount: useDesktop ? storageItemCount : 0,
    totalInventoryCount: inventory.totalInventoryCount,
    assetEntriesCount: inventory.assetEntriesCount,
    uniqueInventoryCount: items.length,
    pricedCount,
    totalValue,
    totalBasis,
    pnl: totalValue - totalBasis,
    pnlPct: totalBasis > 0 ? ((totalValue - totalBasis) / totalBasis) * 100 : 0,
    liquidityScore: scoreLiquidity(pricedItems),
    totalVolume24h: totalVolume,
    allocation: buildAllocation(pricedItems, totalValue),
    history,
    items,
    activity: [
      { t: 'now', a: `Inventory sync · ${inventory.totalInventoryCount} items across ${items.length} unique rows`, c: 'var(--fg-2)' },
      { t: 'now', a: `Price refresh · ${pricedCount}/${inventory.totalInventoryCount} priced`, c: pricedCount ? 'var(--green)' : 'var(--amber)' },
      { t: useDesktop ? 'desktop' : (inventory.cached ? 'cache' : 'live'), a: useDesktop ? 'Full inventory from desktop client' : (inventory.cached ? 'Loaded from local cache' : 'Fetched from Steam'), c: useDesktop ? 'var(--green)' : 'var(--cyan)' },
      ...(storageItemCount > 0 ? [{ t: 'storage', a: `Storage units · ${storageItemCount} items included (read-only GC sync)`, c: 'var(--cyan)' }] : []),
    ],
  };
}

async function listPortfolios(steamId = null) {
  const store = await readManualPortfolioStore();
  const manual = store.portfolios.map((portfolio) => ({
    id: portfolio.id,
    name: portfolio.name,
    type: 'manual',
    itemCount: (portfolio.items || []).reduce((sum, item) => sum + safeQty(item.quantity ?? item.amount), 0),
    createdAt: portfolio.createdAt,
    updatedAt: portfolio.updatedAt,
  }));

  return [
    ...(steamId ? [{ id: 'steam', name: 'Steam inventory', type: 'steam', itemCount: null }] : []),
    ...manual,
  ];
}

async function createManualPortfolio(name) {
  const title = String(name || '').trim() || 'Manual portfolio';
  const store = await readManualPortfolioStore();
  const now = new Date().toISOString();
  const portfolio = {
    id: `manual-${crypto.randomUUID()}`,
    name: title.slice(0, 80),
    type: 'manual',
    items: [],
    createdAt: now,
    updatedAt: now,
  };

  store.portfolios.push(portfolio);
  store.activePortfolioId = portfolio.id;
  await writeManualPortfolioStore(store);
  return portfolio;
}

async function deleteManualPortfolio(portfolioId) {
  const store = await readManualPortfolioStore();
  const before = store.portfolios.length;
  store.portfolios = store.portfolios.filter((portfolio) => portfolio.id !== portfolioId);
  if (store.portfolios.length === before) return false;
  if (store.activePortfolioId === portfolioId) {
    store.activePortfolioId = store.portfolios[0]?.id || null;
  }
  await writeManualPortfolioStore(store);
  return true;
}

async function addManualPortfolioItem(portfolioId, payload = {}) {
  const store = await readManualPortfolioStore();
  const portfolio = store.portfolios.find((entry) => entry.id === portfolioId);
  if (!portfolio) {
    const err = new Error('Manual portfolio not found');
    err.status = 404;
    err.code = 'portfolio_not_found';
    throw err;
  }

  const marketHashName = String(payload.marketHashName || payload.name || '').trim();
  if (!marketHashName) {
    const err = new Error('Item name is required');
    err.status = 400;
    err.code = 'missing_item_name';
    throw err;
  }

  const quantity = safeQty(payload.quantity ?? payload.qty);
  if (quantity <= 0) {
    const err = new Error('quantity must be a positive number');
    err.status = 400;
    err.code = 'invalid_quantity';
    throw err;
  }

  const basis = await makeBasisRecord(marketHashName, payload.basisPerUnit, payload.currency);
  const now = new Date().toISOString();
  portfolio.items.push({
    id: `manual-item-${crypto.randomUUID()}`,
    assetid: `manual-${crypto.randomUUID()}`,
    marketHashName,
    name: String(payload.name || marketHashName).trim(),
    quantity,
    basis,
    iconUrl: normalizeOptionalUrl(payload.iconUrl),
    marketUrl: normalizeOptionalUrl(payload.marketUrl),
    category: normalizeOptionalString(payload.category),
    rarity: normalizeOptionalString(payload.rarity),
    wear: normalizeOptionalString(payload.wear),
    tier: Number.isFinite(Number(payload.tier)) ? Number(payload.tier) : null,
    createdAt: now,
    updatedAt: now,
  });
  portfolio.updatedAt = now;
  store.activePortfolioId = portfolio.id;
  await writeManualPortfolioStore(store);
  return portfolio;
}

async function deleteManualPortfolioItem(portfolioId, itemId) {
  const store = await readManualPortfolioStore();
  const portfolio = store.portfolios.find((entry) => entry.id === portfolioId);
  if (!portfolio) return false;

  const before = portfolio.items.length;
  portfolio.items = portfolio.items.filter((item) => item.id !== itemId);
  if (portfolio.items.length === before) return false;

  portfolio.updatedAt = new Date().toISOString();
  await writeManualPortfolioStore(store);
  return true;
}

async function updateManualPortfolioItem(portfolioId, itemId, payload = {}) {
  const store = await readManualPortfolioStore();
  const portfolio = store.portfolios.find((entry) => entry.id === portfolioId);
  if (!portfolio) {
    const err = new Error('Manual portfolio not found');
    err.status = 404;
    err.code = 'portfolio_not_found';
    throw err;
  }

  const item = portfolio.items.find((entry) => entry.id === itemId);
  if (!item) {
    const err = new Error('Manual portfolio item not found');
    err.status = 404;
    err.code = 'item_not_found';
    throw err;
  }

  const quantity = safeQty(payload.quantity ?? payload.qty);
  if (quantity <= 0) {
    const err = new Error('quantity must be a positive number');
    err.status = 400;
    err.code = 'invalid_quantity';
    throw err;
  }

  item.quantity = quantity;
  item.amount = quantity;
  if (payload.basisPerUnit != null) {
    item.basis = await makeBasisRecord(item.marketHashName, payload.basisPerUnit, payload.currency);
  }
  item.updatedAt = new Date().toISOString();
  portfolio.updatedAt = item.updatedAt;
  await writeManualPortfolioStore(store);
  return item;
}

async function setManualBasisPerUnitByMarketHashName(portfolioId, marketHashName, basisPerUnit, currency = 'usd') {
  const name = String(marketHashName || '').trim();
  const store = await readManualPortfolioStore();
  const portfolio = store.portfolios.find((entry) => entry.id === portfolioId);
  if (!portfolio) {
    const err = new Error('Manual portfolio not found');
    err.status = 404;
    err.code = 'portfolio_not_found';
    throw err;
  }

  const matching = portfolio.items.filter((item) => item.marketHashName === name);
  if (!matching.length) {
    const err = new Error('Item not found in manual portfolio');
    err.status = 404;
    err.code = 'item_not_found';
    throw err;
  }

  const record = await makeBasisRecord(name, basisPerUnit, currency);
  const now = new Date().toISOString();
  for (const item of matching) {
    item.basis = record;
    item.updatedAt = now;
  }
  portfolio.updatedAt = now;
  await writeManualPortfolioStore(store);
}

async function getManualPortfolio(portfolioId, steamId = null) {
  const store = await readManualPortfolioStore();
  const portfolio = resolveActiveManualPortfolio(store, portfolioId);
  if (!portfolio) return buildEmptyManualPortfolio(store, steamId);

  const marketHashNames = portfolio.items.map((item) => item.marketHashName);
  const prices = await getPrices(marketHashNames, Number.MAX_SAFE_INTEGER);
  const iconUrls = await hydrateManualItemIcons(portfolio.items);
  const sourceItems = portfolio.items.map((item) => enrichManualItem(item, prices[item.marketHashName], iconUrls[item.marketHashName]));
  const items = aggregatePortfolioItems(sourceItems);
  refreshManualItemIconsInBackground(portfolio.id);
  const pricedItems = items.filter((item) => item.value != null);
  const totalInventoryCount = items.reduce((sum, item) => sum + item.qty, 0);
  const totalValue = pricedItems.reduce((sum, item) => sum + item.value * item.qty, 0);
  const totalBasis = items.reduce((sum, item) => sum + item.basis * item.qty, 0);
  const pricedCount = pricedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalVolume = pricedItems.reduce((sum, item) => sum + (item.volume24h || 0), 0);
  const history = await buildPortfolioHistory(pricedItems, totalValue);

  return {
    portfolioId: portfolio.id,
    portfolioName: portfolio.name,
    portfolioType: 'manual',
    portfolios: await listPortfolios(steamId),
    profile: { steamId: 'manual', personaname: portfolio.name },
    syncedAt: portfolio.updatedAt || portfolio.createdAt || new Date().toISOString(),
    cached: false,
    inventoryProvider: 'manual',
    desktopConnected: false,
    storageItemCount: 0,
    totalInventoryCount,
    assetEntriesCount: portfolio.items.length,
    uniqueInventoryCount: items.length,
    pricedCount,
    totalValue,
    totalBasis,
    pnl: totalValue - totalBasis,
    pnlPct: totalBasis > 0 ? ((totalValue - totalBasis) / totalBasis) * 100 : 0,
    liquidityScore: scoreLiquidity(pricedItems),
    totalVolume24h: totalVolume,
    allocation: buildAllocation(pricedItems, totalValue),
    history,
    items,
    activity: [
      { t: 'manual', a: `Manual portfolio · ${totalInventoryCount} items across ${items.length} unique rows`, c: 'var(--fg-2)' },
      { t: 'prices', a: `Price refresh · ${pricedCount}/${totalInventoryCount} priced`, c: pricedCount ? 'var(--green)' : 'var(--amber)' },
    ],
  };
}

function buildEmptyManualPortfolio(store, steamId = null) {
  return {
    portfolioId: null,
    portfolioName: 'Manual portfolio',
    portfolioType: 'manual',
    portfolios: [
      ...(steamId ? [{ id: 'steam', name: 'Steam inventory', type: 'steam', itemCount: null }] : []),
      ...store.portfolios.map((portfolio) => ({
        id: portfolio.id,
        name: portfolio.name,
        type: 'manual',
        itemCount: (portfolio.items || []).reduce((sum, item) => sum + safeQty(item.quantity ?? item.amount), 0),
        createdAt: portfolio.createdAt,
        updatedAt: portfolio.updatedAt,
      })),
    ],
    profile: { steamId: 'manual', personaname: 'Manual portfolio' },
    syncedAt: new Date().toISOString(),
    cached: false,
    inventoryProvider: 'manual',
    desktopConnected: false,
    storageItemCount: 0,
    totalInventoryCount: 0,
    assetEntriesCount: 0,
    uniqueInventoryCount: 0,
    pricedCount: 0,
    totalValue: 0,
    totalBasis: 0,
    pnl: 0,
    pnlPct: 0,
    liquidityScore: 0,
    totalVolume24h: 0,
    allocation: [],
    history: emptyPortfolioHistory(0),
    items: [],
    activity: [{ t: 'start', a: 'Create a manual portfolio to add items without Steam', c: 'var(--amber)' }],
  };
}

function enrichItem(item, price, basis) {
  const qty = item.amount || 1;
  const value = price?.price ?? price?.medianPrice ?? null;
  const basisEntry = resolveBasisEntry(basis[item.assetid] ?? basis[item.marketHashName], value);
  const basisValue = basisEntry.usdPerUnit;
  const history = makeSpark(value || basisValue || 1, item.assetid);

  return {
    ...item,
    qty,
    value,
    basis: basisValue,
    basisOriginal: basisEntry.originalAmount,
    basisCurrency: basisEntry.currency,
    pnl: value != null ? (value - basisValue) * qty : 0,
    pnlPct: value != null && basisValue > 0 ? ((value - basisValue) / basisValue) * 100 : 0,
    volume24h: price?.volume24h || null,
    medianPrice: price?.medianPrice || null,
    priceProvider: price?.provider || 'unpriced',
    tier: rarityToTier(item.rarity),
    float: null,
    stickers: countStickerDescriptions(item.descriptions),
    lock: item.tradable ? 0 : null,
    spark: history,
  };
}

function enrichManualItem(item, price, resolvedIconUrl = null) {
  const qty = safeQty(item.quantity ?? item.amount);
  const value = price?.price ?? price?.medianPrice ?? null;
  const basisEntry = resolveBasisEntry(item.basis, value);
  const basisValue = basisEntry.usdPerUnit;
  const rarity = item.rarity || null;
  const tier = Number.isFinite(Number(item.tier)) ? Number(item.tier) : rarityToTier(rarity);

  return {
    assetid: item.assetid || item.id,
    manualItemId: item.id,
    marketHashName: item.marketHashName,
    name: item.name || item.marketHashName,
    amount: qty,
    qty,
    value,
    basis: basisValue,
    basisOriginal: basisEntry.originalAmount,
    basisCurrency: basisEntry.currency,
    pnl: value != null ? (value - basisValue) * qty : 0,
    pnlPct: value != null && basisValue > 0 ? ((value - basisValue) / basisValue) * 100 : 0,
    volume24h: price?.volume24h || null,
    medianPrice: price?.medianPrice || null,
    priceProvider: price?.provider || 'unpriced',
    priceRub: price?.priceRub,
    medianPriceRub: price?.medianPriceRub,
    tier,
    rarity,
    category: item.category || null,
    wear: item.wear || null,
    iconUrl: item.iconUrl || resolvedIconUrl || null,
    marketUrl: item.marketUrl || `https://steamcommunity.com/market/listings/730/${encodeURIComponent(item.marketHashName)}`,
    tradable: true,
    marketable: true,
    descriptions: [],
    stickers: 0,
    lock: 0,
    spark: makeSpark(value || basisValue || 1, item.id),
    source: 'manual',
  };
}

async function hydrateManualItemIcons(items) {
  const names = [...new Set(items
    .filter((item) => !item.iconUrl && item.marketHashName)
    .map((item) => item.marketHashName))];
  if (!names.length) return {};

  const entries = await Promise.all(names.map(async (marketHashName) => [
    marketHashName,
    await getSteamMarketIcon(marketHashName, { cachedOnly: true }).catch(() => null),
  ]));
  return Object.fromEntries(entries);
}

function refreshManualItemIconsInBackground(portfolioId) {
  if (iconRefreshes.has(portfolioId)) return;
  iconRefreshes.add(portfolioId);
  refreshManualItemIcons(portfolioId)
    .catch((error) => console.warn('[portfolio] manual icon refresh failed:', error.message))
    .finally(() => iconRefreshes.delete(portfolioId));
}

async function refreshManualItemIcons(portfolioId) {
  const store = await readManualPortfolioStore();
  const portfolio = store.portfolios.find((entry) => entry.id === portfolioId);
  if (!portfolio) return;

  const missingNames = [...new Set((portfolio.items || [])
    .filter((item) => !item.iconUrl && item.marketHashName)
    .map((item) => item.marketHashName))];
  if (!missingNames.length) return;

  const iconEntries = await Promise.all(missingNames.map(async (marketHashName) => [
    marketHashName,
    await getSteamMarketIcon(marketHashName).catch(() => null),
  ]));
  const iconsByName = Object.fromEntries(iconEntries.filter(([, iconUrl]) => iconUrl));
  if (!Object.keys(iconsByName).length) return;

  const now = new Date().toISOString();
  let changed = false;
  for (const item of portfolio.items) {
    const iconUrl = iconsByName[item.marketHashName];
    if (!item.iconUrl && iconUrl) {
      item.iconUrl = iconUrl;
      item.updatedAt = now;
      changed = true;
    }
  }

  if (changed) {
    portfolio.updatedAt = now;
    await writeManualPortfolioStore(store);
  }
}

function aggregatePortfolioItems(items) {
  const grouped = new Map();

  for (const item of items) {
    const location = item.inStorage ? `storage:${item.storageUnitId || 'unit'}` : 'inventory';
    const key = `${item.marketHashName || item.name || item.assetid}::${location}`;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        ...item,
        assetIds: [item.assetid],
        stackCount: 1,
        storageQty: item.inStorage ? item.qty : 0,
        tradableQty: item.tradable ? item.qty : 0,
        marketableQty: item.marketable ? item.qty : 0,
        totalBasis: item.basis * item.qty,
      });
      continue;
    }

    current.assetIds.push(item.assetid);
    current.stackCount += 1;
    current.qty += item.qty;
    current.pnl += item.pnl;
    current.stickers += item.stickers;
    current.totalBasis += item.basis * item.qty;
    current.storageQty = (current.storageQty || 0) + (item.inStorage ? item.qty : 0);
    current.tradableQty += item.tradable ? item.qty : 0;
    current.marketableQty += item.marketable ? item.qty : 0;
    current.value = current.value ?? item.value;
    current.volume24h = current.volume24h ?? item.volume24h;
    current.medianPrice = current.medianPrice ?? item.medianPrice;
    current.priceProvider = current.priceProvider === 'unpriced' ? item.priceProvider : current.priceProvider;
  }

  return [...grouped.values()]
    .map((item) => {
      const basis = item.qty > 0 ? item.totalBasis / item.qty : item.basis;
      const tradable = item.tradableQty === item.qty;
      const marketable = item.marketableQty === item.qty;
      const totalValue = item.value != null ? item.value * item.qty : null;
      return {
        ...item,
        basis,
        totalBasis: item.totalBasis,
        totalValue,
        tradable,
        marketable,
        lock: tradable ? 0 : null,
        pnl: totalValue != null ? totalValue - item.totalBasis : 0,
        pnlPct: item.totalBasis > 0 && totalValue != null ? ((totalValue - item.totalBasis) / item.totalBasis) * 100 : 0,
      };
    })
    .sort((a, b) => {
      const valueDelta = (b.totalValue ?? -1) - (a.totalValue ?? -1);
      if (valueDelta !== 0) return valueDelta;
      return String(a.marketHashName).localeCompare(String(b.marketHashName));
    });
}

async function readBasis() {
  try {
    const raw = await fs.readFile(BASIS_FILE, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) {
      console.error('[portfolio] corrupt portfolio.json (basis), using empty basis:', error.message);
      await backupCorruptBasisFile();
      return {};
    }
    throw error;
  }
}

async function backupCorruptBasisFile() {
  try {
    const backupFile = `${BASIS_FILE}.corrupt-${Date.now()}`;
    await fs.rename(BASIS_FILE, backupFile);
  } catch (renameError) {
    if (renameError.code !== 'ENOENT') {
      console.error('[portfolio] could not backup corrupt basis file:', renameError.message);
    }
  }
}

async function setBasisPerUnitByMarketHashName(marketHashName, basisPerUnit, currency = 'usd') {
  const name = String(marketHashName || '').trim();
  if (!name) {
    const err = new Error('marketHashName is required');
    err.status = 400;
    err.code = 'missing_market_hash_name';
    throw err;
  }
  const n = Number(basisPerUnit);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error('basisPerUnit must be a non-negative number');
    err.status = 400;
    err.code = 'invalid_basis';
    throw err;
  }
  const cur = String(currency || 'usd').toLowerCase();
  let record;
  if (cur === 'usd') {
    record = {
      amount: n,
      currency: 'usd',
      usdPerUnit: n,
      savedAt: new Date().toISOString(),
    };
  } else if (cur === 'rub' || cur === 'rur') {
    const ratioData = await getSteamCurrencyRatio(name, 'rub', 'usd');
    if (!Number.isFinite(ratioData?.ratio) || ratioData.ratio <= 0) {
      const err = new Error('Could not derive RUB/USD ratio from Steam for this item');
      err.status = 502;
      err.code = 'steam_fx_unavailable';
      throw err;
    }
    record = {
      amount: n,
      currency: 'rub',
      usdPerUnit: n / ratioData.ratio,
      steamRubPrice: ratioData.fromPrice.price,
      steamUsdPrice: ratioData.toPrice.price,
      savedAt: new Date().toISOString(),
    };
  } else {
    const err = new Error('currency must be usd or rub');
    err.status = 400;
    err.code = 'invalid_currency';
    throw err;
  }
  const basis = await readBasis();
  basis[name] = record;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(BASIS_FILE, JSON.stringify(basis, null, 2), 'utf8');
}

async function makeBasisRecord(marketHashName, basisPerUnit, currency = 'usd') {
  const n = Number(basisPerUnit);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error('basisPerUnit must be a non-negative number');
    err.status = 400;
    err.code = 'invalid_basis';
    throw err;
  }

  const cur = String(currency || 'usd').toLowerCase();
  if (cur === 'usd') {
    return { amount: n, currency: 'usd', usdPerUnit: n, savedAt: new Date().toISOString() };
  }

  if (cur === 'rub' || cur === 'rur') {
    const ratioData = await getSteamCurrencyRatio(marketHashName, 'rub', 'usd').catch(() => null);
    const ratio = Number.isFinite(ratioData?.ratio) && ratioData.ratio > 0
      ? ratioData.ratio
      : await getSteamRubRate().catch(() => null);
    return {
      amount: n,
      currency: 'rub',
      usdPerUnit: n / (Number.isFinite(ratio) && ratio > 0 ? ratio : 92),
      steamRubPrice: ratioData?.fromPrice?.price,
      steamUsdPrice: ratioData?.toPrice?.price,
      savedAt: new Date().toISOString(),
    };
  }

  const err = new Error('currency must be usd or rub');
  err.status = 400;
  err.code = 'invalid_currency';
  throw err;
}

async function readManualPortfolioStore() {
  try {
    const raw = await fs.readFile(MANUAL_PORTFOLIOS_FILE, 'utf8');
    if (!raw.trim()) return { activePortfolioId: null, portfolios: [] };
    const parsed = JSON.parse(raw);
    return normalizeManualPortfolioStore(parsed);
  } catch (error) {
    if (error.code === 'ENOENT') return { activePortfolioId: null, portfolios: [] };
    if (error instanceof SyntaxError) {
      const backupFile = `${MANUAL_PORTFOLIOS_FILE}.corrupt-${Date.now()}`;
      await fs.rename(MANUAL_PORTFOLIOS_FILE, backupFile).catch(() => {});
      return { activePortfolioId: null, portfolios: [] };
    }
    throw error;
  }
}

async function writeManualPortfolioStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MANUAL_PORTFOLIOS_FILE, JSON.stringify(normalizeManualPortfolioStore(store), null, 2), 'utf8');
}

function normalizeManualPortfolioStore(raw) {
  const portfolios = Array.isArray(raw?.portfolios) ? raw.portfolios : [];
  return {
    activePortfolioId: typeof raw?.activePortfolioId === 'string' ? raw.activePortfolioId : null,
    portfolios: portfolios
      .filter((portfolio) => portfolio && typeof portfolio === 'object')
      .map((portfolio) => ({
        id: String(portfolio.id || `manual-${crypto.randomUUID()}`),
        name: String(portfolio.name || 'Manual portfolio').slice(0, 80),
        type: 'manual',
        items: Array.isArray(portfolio.items) ? portfolio.items : [],
        createdAt: portfolio.createdAt || new Date().toISOString(),
        updatedAt: portfolio.updatedAt || portfolio.createdAt || new Date().toISOString(),
      })),
  };
}

function resolveActiveManualPortfolio(store, requestedId = '') {
  const id = String(requestedId || '').trim();
  if (id) return store.portfolios.find((portfolio) => portfolio.id === id) || null;
  return store.portfolios.find((portfolio) => portfolio.id === store.activePortfolioId) || store.portfolios[0] || null;
}

function safeQty(value) {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0;
}

function normalizeOptionalString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeOptionalUrl(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === 'http:' || url.protocol === 'https:' ? String(url) : null;
  } catch {
    return null;
  }
}

function resolveBasisEntry(rawEntry, fallbackUsdPerUnit) {
  if (typeof rawEntry === 'number' && Number.isFinite(rawEntry)) {
    return {
      usdPerUnit: rawEntry,
      originalAmount: rawEntry,
      currency: 'usd',
    };
  }

  if (rawEntry && typeof rawEntry === 'object') {
    const usdPerUnit = Number(rawEntry.usdPerUnit);
    const amount = Number(rawEntry.amount);
    const currency = String(rawEntry.currency || 'usd').toLowerCase();
    if (Number.isFinite(usdPerUnit) && usdPerUnit >= 0) {
      return {
        usdPerUnit,
        originalAmount: Number.isFinite(amount) ? amount : usdPerUnit,
        currency: currency === 'rub' ? 'rub' : 'usd',
      };
    }
  }

  const fallback = Number.isFinite(fallbackUsdPerUnit) ? fallbackUsdPerUnit : 0;
  return {
    usdPerUnit: fallback,
    originalAmount: fallback,
    currency: 'usd',
  };
}

function buildAllocation(items, totalValue) {
  const buckets = new Map();

  for (const item of items) {
    const label = bucketLabel(item);
    const current = buckets.get(label) || { l: label, v: 0, c: `var(--rar-${item.tier || 1})`, p: 0 };
    current.v += (item.value || 0) * item.qty;
    current.p = totalValue > 0 ? (current.v / totalValue) * 100 : 0;
    buckets.set(label, current);
  }

  return [...buckets.values()]
    .sort((a, b) => b.v - a.v)
    .slice(0, 6)
    .map((bucket) => ({ ...bucket, p: Math.round(bucket.p) }));
}

function bucketLabel(item) {
  const category = String(item.category || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();
  if (category.includes('knife') || type.includes('knife')) return 'Knives';
  if (category.includes('glove') || type.includes('glove')) return 'Gloves';
  if (category.includes('rifle') || /ak-47|awp|m4a/i.test(item.marketHashName)) return 'Rifles';
  if (category.includes('pistol') || /glock|usp|desert eagle|p250/i.test(item.marketHashName)) return 'Pistols';
  if (type.includes('case')) return 'Cases';
  return 'Other';
}

function scoreLiquidity(items) {
  if (!items.length) return 0;
  const averageVolume = items.reduce((sum, item) => sum + (item.volume24h || 0), 0) / items.length;
  return Math.max(0, Math.min(100, Math.round(averageVolume / 10)));
}

async function buildPortfolioHistory(items, totalValue) {
  const priced = items
    .filter((item) => item.marketHashName && Number.isFinite(item.value) && item.value > 0 && item.qty > 0)
    .sort((a, b) => (b.value * b.qty) - (a.value * a.qty));

  if (!priced.length) return emptyPortfolioHistory(totalValue);

  const tracked = priced.slice(0, 12);
  const trackedNames = new Set(tracked.map((item) => item.marketHashName));
  const trackedValue = tracked.reduce((sum, item) => sum + item.value * item.qty, 0);
  const untrackedValue = priced
    .filter((item) => !trackedNames.has(item.marketHashName))
    .reduce((sum, item) => sum + item.value * item.qty, 0);

  const histories = (await Promise.all(tracked.map(async (item) => {
    const history = await getPriceHistory(item.marketHashName, 365, {
      anchorPrice: item.value,
      currency: 'usd',
    }).catch(() => null);
    if (history?.provider === 'synthetic') return null;
    const points = normalizeHistoryPoints(history?.data);
    if (points.length < 2) return null;
    return {
      marketHashName: item.marketHashName,
      qty: item.qty,
      currentValue: item.value * item.qty,
      provider: history.provider || 'unknown',
      points,
    };
  }))).filter(Boolean);

  if (!histories.length) return emptyPortfolioHistory(totalValue);

  const dateSet = new Set();
  for (const history of histories) {
    for (const point of history.points) dateSet.add(point.date);
  }
  const dates = [...dateSet].sort();

  const points = dates.map((date) => {
    let value = untrackedValue;
    let coveredValue = 0;

    for (const history of histories) {
      const price = priceAtDate(history.points, date);
      if (!Number.isFinite(price) || price <= 0) {
        value += history.currentValue;
      } else {
        value += price * history.qty;
      }
      coveredValue += history.currentValue;
    }

    return {
      date,
      value: Math.round(value * 100) / 100,
      coveredValue: Math.round(coveredValue * 100) / 100,
    };
  }).filter((point) => Number.isFinite(point.value) && point.value > 0);

  return {
    points,
    coveragePct: totalValue > 0 ? Math.round((trackedValue / totalValue) * 100) : 0,
    itemCount: histories.length,
    sources: [...new Set(histories.map((history) => history.provider))],
    synthetic: false,
  };
}

function emptyPortfolioHistory(totalValue) {
  const value = Number.isFinite(totalValue) && totalValue > 0 ? Math.round(totalValue * 100) / 100 : 0;
  return {
    points: value > 0 ? [{ date: new Date().toISOString().slice(0, 10), value, coveredValue: 0 }] : [],
    coveragePct: 0,
    itemCount: 0,
    sources: [],
    synthetic: false,
  };
}

function normalizeHistoryPoints(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => {
      const time = new Date(point.date).getTime();
      const price = Number(point.price);
      if (!Number.isFinite(time) || !Number.isFinite(price) || price <= 0) return null;
      return {
        date: new Date(time).toISOString().slice(0, 10),
        price,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function priceAtDate(points, date) {
  let last = null;
  for (const point of points) {
    if (point.date > date) break;
    last = point.price;
  }
  return last ?? points[0]?.price ?? null;
}

function makeSpark(value, seedValue) {
  const seed = Number(String(seedValue || '1').slice(-4)) || 1;
  return Array.from({ length: 8 }, (_, i) => {
    const wave = Math.sin((seed % 17) + i / 1.7) * 0.035;
    return Math.max(0.01, value * (1 + wave + (i - 4) * 0.004));
  });
}

function countStickerDescriptions(descriptions) {
  return (descriptions || []).filter((line) => /sticker/i.test(line)).length;
}

module.exports = {
  getPortfolio,
  listPortfolios,
  createManualPortfolio,
  deleteManualPortfolio,
  addManualPortfolioItem,
  deleteManualPortfolioItem,
  updateManualPortfolioItem,
  setBasisPerUnitByMarketHashName,
  setManualBasisPerUnitByMarketHashName,
};
