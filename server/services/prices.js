const { getCached, setCached, remember } = require('./cache');

const PRICE_MAX_AGE_MS = 30 * 60 * 1000;
const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const HISTORY_MAX_AGE_MS = 60 * 60 * 1000;
const ICON_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_MOVERS_MAX_AGE_MS = 30 * 60 * 1000;
const FX_RATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const FX_PROBE_ITEM = 'Revolution Case';

const WATCHLIST_MARKET_HASH_NAMES = [
  'AK-47 | Redline (Field-Tested)',
  'M4A4 | Asiimov (Battle-Scarred)',
  'AWP | Dragon Lore (Factory New)',
  'Karambit | Doppler (Factory New)',
  'Glock-18 | Fade (Factory New)',
  'M4A1-S | Hyper Beast (Minimal Wear)',
  'Desert Eagle | Blaze (Factory New)',
  'USP-S | Kill Confirmed (Field-Tested)',
  'Butterfly Knife | Tiger Tooth (Factory New)',
  'AWP | Lightning Strike (Factory New)',
  'AK-47 | Vulcan (Minimal Wear)',
  "Sport Gloves | Pandora's Box (Field-Tested)",
];

const STEAM_CURRENCY_CODES = {
  usd: 1,
  rub: 5,
};

const STEAM_CURRENCY_LABELS = {
  1: 'USD',
  5: 'RUB',
};

function parseMoney(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;
  const match = String(value).match(/-?\d[\d\s\u00A0\u202F.,-]*/);
  if (!match) return null;

  const sanitized = match[0]
    .replace(/[\s\u00A0\u202F]/g, '')
    .replace(/[.,-]+$/g, '');

  let normalized = sanitized;
  if (sanitized.includes(',') && sanitized.includes('.')) {
    normalized = sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.')
      ? sanitized.replace(/\./g, '').replace(',', '.')
      : sanitized.replace(/,/g, '');
  } else if (sanitized.includes(',')) {
    const parts = sanitized.split(',');
    normalized = parts.length === 2 && parts[1].length <= 2
      ? `${parts[0]}.${parts[1]}`
      : sanitized.replace(/,/g, '');
  } else if (sanitized.includes('.')) {
    const parts = sanitized.split('.');
    normalized = parts.length === 2 && parts[1].length <= 2
      ? sanitized
      : sanitized.replace(/\./g, '');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SteamInvestPortfolio/0.1 (+local-dev)',
    },
  });

  if (!response.ok) {
    const error = new Error(`Price provider returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html',
      'User-Agent': 'SteamInvestPortfolio/0.1 (+local-dev)',
    },
  });

  if (!response.ok) {
    const error = new Error(`Steam Market returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return response.text();
}

async function getPrice(marketHashName) {
  const key = `price:${marketHashName}`;
  const cached = await getCached(key, PRICE_MAX_AGE_MS);
  if (cached) return { ...cached, cached: true };

  const staleCached = await getCached(key, 30 * 24 * 60 * 60 * 1000);
  const price = await getTakeSkinPrice(marketHashName).catch(() => null)
    || await getSteamMarketPrice(marketHashName).catch(() => null)
    || (staleCached ? { ...staleCached, provider: `${staleCached.provider || 'cached'}-stale` } : null)
    || {
      marketHashName,
      price: null,
      medianPrice: null,
      volume24h: null,
      provider: 'unpriced',
      updatedAt: new Date().toISOString(),
    };

  if (Number.isFinite(price.price) || Number.isFinite(price.medianPrice)) {
    await setCached(key, price);
  }
  return { ...price, cached: false };
}

async function getPrices(marketHashNames, limit = 24) {
  const safeLimit = Number.isFinite(limit) ? limit : Number.MAX_SAFE_INTEGER;
  const unique = [...new Set(marketHashNames.filter(Boolean))].slice(0, safeLimit);
  const result = {};

  for (let i = 0; i < unique.length; i += 4) {
    const batch = unique.slice(i, i + 4);
    const priced = await Promise.all(batch.map((name) => getPrice(name)));
    for (const item of priced) result[item.marketHashName] = item;
  }

  return result;
}

async function getTakeSkinPrice(marketHashName) {
  const params = new URLSearchParams({ page: '0', limit: '10', search: marketHashName });
  const json = await fetchJson(`https://take.skin/api/public/v1/skins?${params}`);
  const matches = Array.isArray(json.data) ? json.data : [];
  const exact = matches.find((item) => item.marketHashName === marketHashName) || matches[0];
  if (!exact || exact.price == null) return null;

  const parsedPrice = parseMoney(exact.price);
  if (!Number.isFinite(parsedPrice)) return null;

  return {
    marketHashName,
    price: parsedPrice,
    medianPrice: parsedPrice,
    volume24h: exact.volume24h || null,
    provider: 'take.skin',
    currencyCode: 'USD',
    updatedAt: new Date().toISOString(),
  };
}

async function getSteamMarketPrice(marketHashName, currency = 'usd') {
  const steamCurrency = resolveSteamCurrency(currency);
  const params = new URLSearchParams({
    appid: '730',
    currency: String(steamCurrency),
    market_hash_name: marketHashName,
  });
  const json = await fetchJson(`https://steamcommunity.com/market/priceoverview/?${params}`);
  if (!json.success) return null;

  const price = parseMoney(json.lowest_price || json.median_price);
  const medianPrice = parseMoney(json.median_price || json.lowest_price);
  if (!Number.isFinite(price) && !Number.isFinite(medianPrice)) return null;

  return {
    marketHashName,
    price,
    medianPrice,
    volume24h: json.volume ? Number.parseInt(String(json.volume).replace(/,/g, ''), 10) : null,
    provider: 'steam-market',
    currencyCode: STEAM_CURRENCY_LABELS[steamCurrency] || 'USD',
    updatedAt: new Date().toISOString(),
  };
}

async function getSteamRubRate() {
  const key = 'fx:rub-per-usd';
  const cached = await getCached(key, FX_RATE_MAX_AGE_MS);
  if (Number.isFinite(cached)) return cached;

  const staleCached = await getCached(key, 30 * 24 * 60 * 60 * 1000);

  try {
    const [rubPrice, usdPrice] = await Promise.all([
      getSteamMarketPrice(FX_PROBE_ITEM, 'rub').catch(() => null),
      getSteamMarketPrice(FX_PROBE_ITEM, 'usd').catch(() => null),
    ]);

    if (Number.isFinite(rubPrice?.price) && Number.isFinite(usdPrice?.price) && usdPrice.price > 0) {
      const ratio = rubPrice.price / usdPrice.price;
      await setCached(key, ratio);
      return ratio;
    }
  } catch { /* fall through */ }

  if (Number.isFinite(staleCached)) return staleCached;

  const basisRatio = await inferRubRateFromBasis();
  if (Number.isFinite(basisRatio)) {
    await setCached(key, basisRatio);
    return basisRatio;
  }

  return null;
}

async function inferRubRateFromBasis() {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    const basisFile = path.join(__dirname, '..', '..', '.data', 'portfolio.json');
    const raw = await fs.readFile(basisFile, 'utf8');
    const basis = JSON.parse(raw);

    for (const entry of Object.values(basis)) {
      if (
        entry &&
        entry.currency === 'rub' &&
        Number.isFinite(entry.steamRubPrice) &&
        Number.isFinite(entry.steamUsdPrice) &&
        entry.steamUsdPrice > 0
      ) {
        return entry.steamRubPrice / entry.steamUsdPrice;
      }
    }
  } catch { /* no basis file */ }
  return null;
}

async function getSteamCurrencyRatio(marketHashName, fromCurrency = 'rub', toCurrency = 'usd') {
  const [fromPrice, toPrice] = await Promise.all([
    getSteamMarketPrice(marketHashName, fromCurrency).catch(() => null),
    getSteamMarketPrice(marketHashName, toCurrency).catch(() => null),
  ]);

  if (!Number.isFinite(fromPrice?.price) || !Number.isFinite(toPrice?.price) || toPrice.price <= 0) {
    return null;
  }

  return {
    ratio: fromPrice.price / toPrice.price,
    fromPrice,
    toPrice,
  };
}

async function getPriceHistory(marketHashName, days = 30) {
  const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
  const key = `history:${marketHashName}:${safeDays}`;
  const cached = await getCached(key, HISTORY_MAX_AGE_MS);
  if (cached) return { ...cached, cached: true };

  const urlName = encodeURIComponent(marketHashName);
  const json = await fetchJson(`https://take.skin/api/public/v1/skins/${urlName}/price-history?days=${safeDays}`)
    .catch(() => null);
  const data = Array.isArray(json?.data) ? json.data : [];
  const history = {
    marketHashName,
    currency: json?.currency || 'USD',
    data: data.map((point) => ({
      date: point.date,
      price: parseMoney(point.price),
      volume: point.volume || null,
    })).filter((point) => Number.isFinite(point.price)),
    provider: data.length ? 'take.skin' : 'none',
    updatedAt: new Date().toISOString(),
  };

  await setCached(key, history);
  return { ...history, cached: false };
}

async function getSteamMarketIcon(marketHashName) {
  const key = `icon:${marketHashName}`;
  const cached = await getCached(key, ICON_MAX_AGE_MS);
  if (cached) return cached.iconUrl;

  const urlName = encodeURIComponent(marketHashName);
  const html = await fetchText(`https://steamcommunity.com/market/listings/730/${urlName}`);
  const iconUrl = html
    .match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]
    ?.replace(/&amp;/g, '&') || null;

  await setCached(key, {
    marketHashName,
    iconUrl,
    updatedAt: new Date().toISOString(),
  });

  return iconUrl;
}

async function getTickerItems() {
  const prices = await getPrices(WATCHLIST_MARKET_HASH_NAMES, WATCHLIST_MARKET_HASH_NAMES.length);
  const items = WATCHLIST_MARKET_HASH_NAMES
    .map((marketHashName) => toMarketItem(marketHashName, prices[marketHashName]))
    .filter((item) => item.price != null);

  return Promise.all(items.map(async (item) => ({
    ...item,
    iconUrl: await getSteamMarketIcon(item.marketHashName).catch(() => null),
  })));
}

async function getTopMovers() {
  const key = 'market:top-movers';
  let value = [];
  try {
    const cached = await remember(key, TOP_MOVERS_MAX_AGE_MS, async () => {
      const json = await fetchJson('https://take.skin/api/public/v1/skins?page=0&limit=100');
      return Array.isArray(json.data) ? json.data : [];
    });
    value = cached.value;
  } catch (error) {
    const stale = await getCached(key, 7 * 24 * 60 * 60 * 1000);
    if (Array.isArray(stale)) value = stale;
  }

  const toNumericPercent = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value == null) return null;
    const cleaned = String(value).replace('%', '').replace(',', '.').trim();
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const extractDelta = (item) => {
    const directCandidates = [
      item?.delta,
      item?.change,
      item?.change24h,
      item?.change24H,
      item?.priceChange24h,
      item?.priceChangePercent,
      item?.priceChangePercentage,
      item?.percentChange,
      item?.percentChange24h,
      item?.pctChange24h,
    ];
    for (const candidate of directCandidates) {
      const parsed = toNumericPercent(candidate);
      if (parsed != null) return parsed;
    }

    const nestedCandidates = [
      item?.stats?.change24h,
      item?.stats?.percentChange24h,
      item?.stats?.delta24h,
      item?.analytics?.change24h,
      item?.analytics?.percentChange24h,
    ];
    for (const candidate of nestedCandidates) {
      const parsed = toNumericPercent(candidate);
      if (parsed != null) return parsed;
    }

    return null;
  };

  const items = value
    .map((item, index) => {
      const price = parseMoney(item.price);
      const delta = extractDelta(item);
      return {
        _order: index,
        name: stripWear(item.marketHashName || item.name),
        marketHashName: item.marketHashName,
        wear: getWear(item.marketHashName),
        price,
        delta,
        tier: rarityToTier(item.rarity),
        spark: makeSpark(price, index),
        provider: 'take.skin',
      };
    })
    .filter((item) => item.price != null && item.delta != null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a._order - b._order)
    .slice(0, 6)
    .map(({ _order, ...item }) => ({
      name: stripWear(item.marketHashName || item.name),
      marketHashName: item.marketHashName,
      wear: getWear(item.marketHashName),
      price: item.price,
      delta: item.delta,
      tier: item.tier,
      spark: item.spark,
      provider: item.provider,
    }));

  return Promise.all(items.map(async (item) => ({
    ...item,
    iconUrl: item.marketHashName ? await getSteamMarketIcon(item.marketHashName).catch(() => null) : null,
  })));
}

async function getCases() {
  const key = 'market:cases';
  let value = [];
  try {
    const cached = await remember(key, CATALOG_MAX_AGE_MS, async () => {
      const json = await fetchJson('https://take.skin/api/public/v1/cases');
      return Array.isArray(json.data) ? json.data : [];
    });
    value = cached.value;
  } catch (error) {
    const stale = await getCached(key, 30 * 24 * 60 * 60 * 1000);
    if (Array.isArray(stale)) value = stale;
  }

  return value.slice(0, 8).map((item, index) => ({
    name: item.marketHashName || item.name,
    marketHashName: item.marketHashName,
    release: 'CS2',
    invest: 0,
    price: parseMoney(item.price),
    roi: 0,
    items: 'market case',
    rank: index + 1,
  }));
}

async function fetchSteamMarketSearch({ query = '', start = 0, count = 24, sort = 'popular', currency = 'usd' } = {}) {
  const sortMap = {
    popular: { column: 'popular', dir: 'desc' },
    'price-desc': { column: 'price', dir: 'desc' },
    'price-asc': { column: 'price', dir: 'asc' },
    'name-asc': { column: 'name', dir: 'asc' },
  };
  const selectedSort = sortMap[sort] || sortMap.popular;
  const steamCurrency = resolveSteamCurrency(currency);
  const params = new URLSearchParams({
    query: String(query || ''),
    start: String(Math.max(0, Number(start) || 0)),
    count: String(Math.max(1, Math.min(100, Number(count) || 24))),
    search_descriptions: '0',
    sort_column: selectedSort.column,
    sort_dir: selectedSort.dir,
    appid: '730',
    currency: String(steamCurrency),
    norender: '1',
  });
  return fetchJson(`https://steamcommunity.com/market/search/render/?${params}`);
}

async function getMarketCatalog(options = {}) {
  const page = Math.max(1, Math.min(50, Number(options.page) || 1));
  const pageSize = Math.max(8, Math.min(100, Number(options.pageSize) || 12));
  const query = String(options.query || '').trim();
  const category = normalizeFilterValue(options.category);
  const rarity = normalizeFilterValue(options.rarity);
  const wear = normalizeFilterValue(options.wear);
  const special = normalizeFilterValue(options.special);
  const sort = String(options.sort || 'popular');
  const filters = { query, category, rarity, wear, special };
  const offset = (page - 1) * pageSize;
  const needsLocalFiltering = [category, rarity, wear, special].some((value) => value !== 'all');

  if (!needsLocalFiltering) {
    const json = await fetchSteamMarketSearch({ query, start: offset, count: pageSize, sort });
    const rawItems = Array.isArray(json.results) ? json.results : [];
    const normalizedItems = rawItems.map((item, index) => normalizeCatalogItem(item, offset + index));
    const items = await hydrateCatalogPrices(normalizedItems);
    const totalCount = Number(json.total_count) || items.length;

    return {
      items,
      page,
      pageSize,
      totalCount,
      filteredCount: totalCount,
      hasMore: offset + items.length < totalCount,
      scanned: items.length,
      updatedAt: new Date().toISOString(),
    };
  }

  const matched = [];
  const batchSize = 100;
  const scanLimit = Math.max(1200, offset + pageSize * 24);
  let totalCount = 0;
  let rawStart = 0;
  let scanned = 0;

  while (matched.length < offset + pageSize + 1 && scanned < scanLimit) {
    const json = await fetchSteamMarketSearch({ query, start: rawStart, count: batchSize, sort });
    const rawItems = Array.isArray(json.results) ? json.results : [];
    totalCount = Number(json.total_count) || totalCount;
    if (!rawItems.length) break;

    const normalized = rawItems.map((item, index) => normalizeCatalogItem(item, rawStart + index));
    matched.push(...normalized.filter((item) => matchesCatalogFilters(item, filters)));
    scanned += normalized.length;
    rawStart += normalized.length;

    if (rawStart >= totalCount) break;
  }

  const pageItems = await hydrateCatalogPrices(matched.slice(offset, offset + pageSize));

  return {
    items: pageItems,
    page,
    pageSize,
    totalCount,
    filteredCount: rawStart >= totalCount ? matched.length : null,
    hasMore: matched.length > offset + pageSize || rawStart < totalCount,
    scanned,
    partial: rawStart < totalCount,
    updatedAt: new Date().toISOString(),
  };
}

async function hydrateCatalogPrices(items) {
  const resolved = [];

  for (let i = 0; i < items.length; i += 6) {
    const batch = items.slice(i, i + 6);
    const pricedBatch = await Promise.all(batch.map(async (item) => {
      if (!shouldResolveExactCatalogPrice(item)) return item;

      const exact = await getSteamMarketPrice(item.marketHashName).catch(() => null);
      if (!Number.isFinite(exact?.price)) return item;

      const nextPrice = exact.price;
      const prevPrice = Number.isFinite(item.price) && item.price > 0 ? item.price : null;
      const spark = prevPrice && Array.isArray(item.spark) && item.spark.length
        ? item.spark.map((point) => Math.max(0.01, point * (nextPrice / prevPrice)))
        : item.spark;

      return {
        ...item,
        price: nextPrice,
        value: nextPrice,
        basis: nextPrice,
        priceProvider: exact.provider || item.priceProvider,
        spark,
      };
    }));

    resolved.push(...pricedBatch);
  }

  return resolved;
}

function shouldResolveExactCatalogPrice(item) {
  return Boolean(
    item?.marketHashName
    && (
      item.commodity
      || ['containers', 'capsules', 'stickers', 'graffiti'].includes(item.category)
    )
  );
}

function toMarketItem(marketHashName, price) {
  return {
    marketHashName,
    name: stripWear(marketHashName),
    wear: getWear(marketHashName),
    price: price?.price ?? null,
    medianPrice: price?.medianPrice ?? null,
    volume24h: price?.volume24h ?? null,
    change: 0,
    provider: price?.provider || 'unpriced',
  };
}

function stripWear(marketHashName) {
  return String(marketHashName).replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, '');
}

function getWear(marketHashName) {
  const wear = String(marketHashName).match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i)?.[1] || 'N/A';
  return wear.split(/[- ]/).map((part) => part[0]).join('').toUpperCase();
}

function rarityToTier(rarity) {
  const value = String(rarity || '').toLowerCase();
  if (value.includes('covert') || value.includes('extraordinary') || value.includes('contraband')) return 5;
  if (value.includes('classified')) return 4;
  if (value.includes('restricted') || value.includes('remarkable')) return 3;
  if (value.includes('mil-spec') || value.includes('high grade')) return 2;
  return 1;
}

function makeSpark(price, seed) {
  const base = Number.isFinite(price) && price > 0 ? price : 10;
  return Array.from({ length: 10 }, (_, i) => Math.max(0.01, base * (1 + Math.sin((i + seed) / 2) * 0.04 + (i - 5) * 0.004)));
}

function normalizeCatalogItem(raw, seed = 0) {
  const description = raw?.asset_description || {};
  const marketHashName = description.market_hash_name || raw.hash_name || raw.name || 'Unknown item';
  const type = description.type || 'Unknown';
  const price = parseMoney(raw.sell_price_text || raw.sale_price_text) || (Number.isFinite(raw.sell_price) ? raw.sell_price / 100 : null);
  const rarity = inferRarity(type, marketHashName);
  const category = inferCategory(type, marketHashName);
  const wear = getWear(marketHashName);
  const special = inferSpecial(marketHashName);
  const tier = marketHashName.startsWith('★') || category === 'gloves'
    ? 5
    : rarityToTier(rarity);

  return {
    assetid: `catalog-${description.classid || marketHashName}`,
    marketHashName,
    name: stripWear(marketHashName),
    wear,
    price,
    value: price,
    basis: price,
    pnl: 0,
    pnlPct: 0,
    qty: 1,
    tier,
    rarity,
    category,
    special,
    type,
    sellListings: Number(raw.sell_listings) || 0,
    commodity: description.commodity === 1,
    marketable: true,
    tradable: description.tradable !== 0,
    priceProvider: 'steam-market',
    marketUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`,
    iconUrl: description.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${description.icon_url}` : null,
    spark: makeSpark(price, seed),
  };
}

function matchesCatalogFilters(item, filters) {
  const query = String(filters.query || '').trim().toLowerCase();
  const category = normalizeFilterValue(filters.category);
  const rarity = normalizeFilterValue(filters.rarity);
  const wear = normalizeFilterValue(filters.wear);
  const special = normalizeFilterValue(filters.special);
  const haystack = [
    item.marketHashName,
    item.name,
    item.type,
    item.category,
    item.rarity,
  ].join(' ').toLowerCase();

  if (query && !haystack.includes(query)) return false;
  if (category !== 'all' && item.category !== category) return false;
  if (rarity !== 'all' && normalizeFilterValue(item.rarity) !== rarity) return false;
  if (wear !== 'all' && normalizeFilterValue(item.wear) !== wear) return false;
  if (special === 'normal' && item.special !== 'normal') return false;
  if (special !== 'all' && special !== 'normal' && item.special !== special) return false;
  return true;
}

function inferCategory(type, marketHashName) {
  const typeValue = String(type || '').toLowerCase();
  const name = String(marketHashName || '').toLowerCase();

  if (name.includes('sticker capsule') || typeValue.includes('sticker capsule')) return 'capsules';
  if (name.includes('sticker') && !name.includes('sticker capsule')) return 'stickers';
  if (name.includes('graffiti') || typeValue.includes('graffiti')) return 'graffiti';
  if (typeValue.includes('music kit')) return 'music kits';
  if (typeValue.includes('agent')) return 'agents';
  if (name.startsWith('★') || typeValue.includes('knife')) return 'knives';
  if (name.includes('gloves') || name.includes('wraps') || name.includes('mitts') || typeValue.includes('glove')) return 'gloves';
  if (typeValue.includes('container') || name.endsWith(' case') || name.includes(' capsule') || name.includes(' package') || name.includes(' terminal')) return 'containers';
  if (typeValue.includes('rifle') || typeValue.includes('pistol') || typeValue.includes('smg') || typeValue.includes('shotgun') || typeValue.includes('machinegun') || typeValue.includes('sniper')) return 'weapons';
  return 'collectibles';
}

function inferRarity(type, marketHashName) {
  const value = String(type || '').toLowerCase();
  if (String(marketHashName || '').startsWith('★')) return 'Extraordinary';
  if (value.includes('contraband')) return 'Contraband';
  if (value.includes('extraordinary')) return 'Extraordinary';
  if (value.includes('covert')) return 'Covert';
  if (value.includes('classified')) return 'Classified';
  if (value.includes('restricted')) return 'Restricted';
  if (value.includes('mil-spec')) return 'Mil-Spec';
  if (value.includes('remarkable')) return 'Remarkable';
  if (value.includes('high grade')) return 'High Grade';
  if (value.includes('industrial grade')) return 'Industrial Grade';
  if (value.includes('consumer grade')) return 'Consumer Grade';
  if (value.includes('base grade')) return 'Base Grade';
  return 'Other';
}

function inferSpecial(marketHashName) {
  const value = String(marketHashName || '');
  if (value.includes('StatTrak')) return 'stattrak';
  if (value.includes('Souvenir')) return 'souvenir';
  return 'normal';
}

function normalizeFilterValue(value) {
  return String(value || 'all').trim().toLowerCase();
}

function normalizeCurrency(value) {
  const key = String(value || 'usd').trim().toLowerCase();
  return STEAM_CURRENCY_CODES[key] ? key : 'usd';
}

function resolveSteamCurrency(value) {
  return STEAM_CURRENCY_CODES[normalizeCurrency(value)];
}

module.exports = {
  getPrice,
  getPrices,
  getPriceHistory,
  getTickerItems,
  getTopMovers,
  getCases,
  getMarketCatalog,
  getSteamRubRate,
  getSteamCurrencyRatio,
  rarityToTier,
};
