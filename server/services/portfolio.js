const fs = require('fs/promises');
const path = require('path');
const { getSteamInventory, getSteamProfile } = require('./steam');
const { getPrices, getSteamCurrencyRatio, rarityToTier } = require('./prices');
const { getDesktopInventory } = require('./desktop');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const BASIS_FILE = path.join(DATA_DIR, 'portfolio.json');
async function getPortfolio(steamId, options = {}) {
  const [profile, steamInventory, desktopInventory, basis] = await Promise.all([
    getSteamProfile(steamId),
    getSteamInventory(steamId, options),
    getDesktopInventory(steamId).catch(() => null),
    readBasis(),
  ]);

  const useDesktop = desktopInventory && Array.isArray(desktopInventory.items) && desktopInventory.items.length > 0;
  const inventory = useDesktop
    ? {
      syncedAt: desktopInventory.syncedAt,
      cached: false,
      inventoryProvider: 'desktop',
      totalInventoryCount: desktopInventory.totalItemCount,
      assetEntriesCount: desktopInventory.items.length,
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

  return {
    profile,
    syncedAt: inventory.syncedAt,
    cached: inventory.cached,
    inventoryProvider: providerLabel,
    desktopConnected: useDesktop,
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
    history: makePortfolioHistory(totalValue),
    items,
    activity: [
      { t: 'now', a: `Inventory sync · ${inventory.totalInventoryCount} items across ${items.length} unique rows`, c: 'var(--fg-2)' },
      { t: 'now', a: `Price refresh · ${pricedCount}/${inventory.totalInventoryCount} priced`, c: pricedCount ? 'var(--green)' : 'var(--amber)' },
      { t: useDesktop ? 'desktop' : (inventory.cached ? 'cache' : 'live'), a: useDesktop ? 'Full inventory from desktop client' : (inventory.cached ? 'Loaded from local cache' : 'Fetched from Steam'), c: useDesktop ? 'var(--green)' : 'var(--cyan)' },
    ],
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

function aggregatePortfolioItems(items) {
  const grouped = new Map();

  for (const item of items) {
    const key = item.marketHashName || item.name || item.assetid;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        ...item,
        assetIds: [item.assetid],
        stackCount: 1,
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

function makePortfolioHistory(totalValue) {
  const value = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : 1;
  return Array.from({ length: 30 }, (_, i) => value * (0.92 + i * 0.003 + Math.sin(i / 2) * 0.018));
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
  setBasisPerUnitByMarketHashName,
};
