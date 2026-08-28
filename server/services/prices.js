const { execFile } = require('child_process');
const { promisify } = require('util');
const { getCached, getCachedEntry, setCached, remember } = require('./cache');
const { collectionNameToSlug } = require('../../item-slugs');

const execFileAsync = promisify(execFile);

const PRICE_MAX_AGE_MS = 30 * 60 * 1000;
const STEAM_PRICE_STALE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const HISTORY_MAX_AGE_MS = 60 * 60 * 1000;
const ICON_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_MOVERS_MAX_AGE_MS = 30 * 60 * 1000;
const MARKET_OVERVIEW_MAX_AGE_MS = 15 * 60 * 1000;
const MARKET_OVERVIEW_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MARKET_OVERVIEW_HISTORY_POINT_GAP_MS = 3 * 60 * 60 * 1000;
const FX_RATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SKINPORT_MAX_AGE_MS = 5 * 60 * 1000;
const CSFLOAT_MAX_AGE_MS = 2 * 60 * 1000;
const LISSKINS_MAX_AGE_MS = 2 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const PERIOD_MOVER_DAYS = [1, 7, 30];
const CSMARKETCAP_INDEX_PATHS = ['rifles', 'pistols', 'smgs', 'heavy', 'knives', 'gloves', 'cases'];
const PERIOD_MOVER_SEEDS = [
  ...WATCHLIST_MARKET_HASH_NAMES,
  'AWP | Asiimov (Field-Tested)',
  'AK-47 | Fire Serpent (Field-Tested)',
  'AK-47 | Asiimov (Field-Tested)',
  'AK-47 | Bloodsport (Field-Tested)',
  'AK-47 | Inheritance (Field-Tested)',
  'AK-47 | Slate (Field-Tested)',
  'M4A1-S | Printstream (Field-Tested)',
  'M4A1-S | Black Lotus (Field-Tested)',
  'M4A4 | Temukau (Field-Tested)',
  'AWP | Neo-Noir (Field-Tested)',
  'AWP | Chromatic Aberration (Field-Tested)',
  'AWP | Containment Breach (Field-Tested)',
  'USP-S | Printstream (Field-Tested)',
  'Desert Eagle | Printstream (Field-Tested)',
  'Glock-18 | Water Elemental (Factory New)',
  'Butterfly Knife | Fade (Factory New)',
  'Karambit | Lore (Field-Tested)',
  'Bayonet | Doppler (Factory New)',
  'Talon Knife | Doppler (Factory New)',
  'Specialist Gloves | Crimson Kimono (Field-Tested)',
  'Driver Gloves | Snow Leopard (Field-Tested)',
  'P90 | Asiimov (Field-Tested)',
  'MAC-10 | Neon Rider (Factory New)',
  'Revolution Case',
  'Recoil Case',
  'Kilowatt Case',
  'Fracture Case',
];

const STEAM_CURRENCY_CODES = {
  usd: 1,
  rub: 5,
  cny: 23,
};

const STEAM_CURRENCY_LABELS = {
  1: 'USD',
  5: 'RUB',
  23: 'CNY',
};

const SKINPORT_CURRENCY_CODES = {
  usd: 'USD',
  rub: 'RUB',
  cny: 'CNY',
};

const BULK_PRICELIST_MAX_AGE_MS = 10 * 60 * 1000;
// Third-party asks more expensive than Steam are usually poisoned listings.
// Asks far below Steam are usually a name mismatch, not a real cash market.
const MARK_HIGH_VS_STEAM = 1.75;
const MARK_LOW_VS_STEAM = 0.25;
const MARK_PACK_HIGH = 1.6;
const MARK_PACK_LOW = 0.45;
const CSMARKET_ITEMS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CSMARKET_LISTING_MAX_AGE_MS = 10 * 60 * 1000;
const CSMARKET_CATALOG_PRICE_HYDRATE_CAP = 500;

// Ordered low→high wear. Used to build per-quality variants of a skin.
const WEAR_TIERS = [
  { code: 'FN', label: 'Factory New' },
  { code: 'MW', label: 'Minimal Wear' },
  { code: 'FT', label: 'Field-Tested' },
  { code: 'WW', label: 'Well-Worn' },
  { code: 'BS', label: 'Battle-Scarred' },
];

const WEAR_LABELS = WEAR_TIERS.map((w) => w.label);

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

const STEAM_FETCH_HEADERS = {
  Accept: 'application/json,text/javascript,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function fetchJson(url, { timeoutMs = 6000, headers: extraHeaders = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isSteam = /steamcommunity\.com/i.test(String(url || ''));
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SteamInvestPortfolio/0.1 (+local-dev)',
        ...(isSteam ? STEAM_FETCH_HEADERS : {}),
        ...extraHeaders,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`Price provider returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, { timeoutMs = 6000, headers: extraHeaders = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isSteam = /steamcommunity\.com/i.test(String(url || ''));
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'SteamInvestPortfolio/0.1 (+local-dev)',
        ...(isSteam ? STEAM_FETCH_HEADERS : {}),
        ...extraHeaders,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = new Error(`Steam Market returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return response.text();
}

function isSteamSourcedPrice(price) {
  const provider = String(price?.provider || '');
  return provider === 'steam-market'
    || provider === 'csmarketapi'
    || provider.startsWith('steam-market-')
    || provider.startsWith('csmarketapi-');
}

// Steam RUB/USD is typically ~70–120. Near-parity means a USD quote leaked into priceRub
// (search/render ignores `currency` and returns "$6.98" even when currency=5).
function isPlausibleRubAsk(priceRub, priceUsd) {
  if (!Number.isFinite(priceRub) || priceRub <= 0) return false;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return true;
  return priceRub >= priceUsd * 10;
}

function stripImplausibleRubFields(price) {
  const usdAnchor = Number.isFinite(price?.price) ? price.price : price?.medianPrice;
  if (!isPlausibleRubAsk(price?.priceRub, usdAnchor)) delete price.priceRub;
  if (!isPlausibleRubAsk(price?.medianPriceRub, usdAnchor)) delete price.medianPriceRub;
  return price;
}

async function attachRubPrice(price, marketHashName, { skipNativeRub = false, rubRate = null } = {}) {
  if (!Number.isFinite(price?.price) && !Number.isFinite(price?.medianPrice)) return price;
  stripImplausibleRubFields(price);
  if (Number.isFinite(price.priceRub) || Number.isFinite(price.medianPriceRub)) return price;

  const usdAnchor = Number.isFinite(price.price) ? price.price : price.medianPrice;

  // Native RUB priceoverview only — never market search/render for RUB. Search ignores
  // `currency` and returns USD sell prices, which makes RUB-basis P&L look like -99%.
  if (!skipNativeRub) {
    const rub = await getSteamMarketPrice(marketHashName, 'rub').catch(() => null);
    if (isPlausibleRubAsk(rub?.price, usdAnchor) || isPlausibleRubAsk(rub?.medianPrice, usdAnchor)) {
      price.priceRub = Number.isFinite(rub.price) ? rub.price : rub.medianPrice;
      price.medianPriceRub = Number.isFinite(rub.medianPrice) ? rub.medianPrice : rub.price;
      return price;
    }
  }

  const rate = (Number.isFinite(rubRate) && rubRate >= 10 ? rubRate : null)
    || await getSteamRubRate().catch(() => null)
    || await getMarketUsdRubRate().catch(() => null);
  if (Number.isFinite(rate) && rate >= 10) {
    if (Number.isFinite(price.price)) price.priceRub = Math.round(price.price * rate * 100) / 100;
    if (Number.isFinite(price.medianPrice)) price.medianPriceRub = Math.round(price.medianPrice * rate * 100) / 100;
  }
  return price;
}

async function getPrice(marketHashName, options = {}) {
  // v4: drop v3 entries that cached USD asks as priceRub via search/render currency=5.
  const key = `price:v4:${marketHashName}`;
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? Math.max(0, options.maxAgeMs) : PRICE_MAX_AGE_MS;
  const preferSteam = options.preferSteam !== false;
  const skipNativeRub = options.skipNativeRub === true;
  const cached = maxAgeMs > 0 ? await getCached(key, maxAgeMs) : null;
  // Never short-circuit on a cached third-party quote when we prefer Steam — take.skin
  // (and friends) can be 2× Steam ask and poison portfolio P&L for 30 minutes.
  if (cached) {
    stripImplausibleRubFields(cached);
    const hasRub = Number.isFinite(cached.priceRub) || Number.isFinite(cached.medianPriceRub);
    const unpriced = !Number.isFinite(cached.price) && !Number.isFinite(cached.medianPrice);
    const usableCache = !preferSteam || isSteamSourcedPrice(cached) || unpriced;
    if (usableCache) {
      if (hasRub || unpriced) {
        return { ...cached, cached: true };
      }
      // Reuse the USD ask; only refill RUB (FX when skipNativeRub, else Steam RUB ask).
      const refreshed = { ...cached };
      await attachRubPrice(refreshed, marketHashName, {
        skipNativeRub,
        rubRate: options.rubRate,
      });
      const rubFilled = Number.isFinite(refreshed.priceRub) || Number.isFinite(refreshed.medianPriceRub);
      // Portfolio bulk loads pass persist:false to avoid rewriting the multi‑MB cache
      // once per row when we only attached an FX-derived RUB ask.
      if (rubFilled && options.persist !== false) await setCached(key, refreshed);
      return { ...refreshed, cached: true };
    }
  }

  const staleCached = await getCached(key, STEAM_PRICE_STALE_MAX_AGE_MS);
  const legacyCached = await getCached(`price:${marketHashName}`, STEAM_PRICE_STALE_MAX_AGE_MS);

  // Prefer real Steam Market asks:
  // 1) priceoverview  2) market search/render (more reliable from some hosts)
  // 3) CSMarketAPI only when it exposes STEAMCOMMUNITY
  // take.skin is intentionally omitted — it quotes this sticker at ~2× Steam ask.
  let price = await getSteamMarketPrice(marketHashName, 'usd').catch(() => null)
    || await getSteamMarketSearchPrice(marketHashName, 'usd').catch(() => null)
    || await getCSMarketAPIPrice(marketHashName).catch(() => null);

  if (!price && preferSteam) {
    if (staleCached && isSteamSourcedPrice(staleCached)) {
      price = { ...staleCached, provider: `${staleCached.provider || 'cached'}-stale` };
    } else if (legacyCached && isSteamSourcedPrice(legacyCached)) {
      price = { ...legacyCached, provider: `${legacyCached.provider || 'cached'}-stale` };
    }
  }

  if (!price && options.allowThirdParty) {
    price = await getCSFloatPrice(marketHashName).catch(() => null)
      || await getSkinportPrice(marketHashName).catch(() => null);
  }

  if (!price && staleCached) {
    price = { ...staleCached, provider: `${staleCached.provider || 'cached'}-stale` };
  } else if (!price && legacyCached) {
    price = { ...legacyCached, provider: `${legacyCached.provider || 'cached'}-stale` };
  }

  if (!price) {
    price = {
      marketHashName,
      price: null,
      medianPrice: null,
      volume24h: null,
      provider: 'unpriced',
      updatedAt: new Date().toISOString(),
    };
  }

  if (Number.isFinite(price.price) || Number.isFinite(price.medianPrice)) {
    await attachRubPrice(price, marketHashName, {
      skipNativeRub,
      rubRate: options.rubRate,
    });
    await setCached(key, price);
  } else {
    // Remember unpriced names briefly so large portfolios don't re-hit Steam timeouts
    // on the same dead rows every dashboard refresh.
    await setCached(key, price);
  }
  return { ...price, cached: false };
}

async function getPrices(marketHashNames, limit = 24, options = {}) {
  const safeLimit = Number.isFinite(limit) ? limit : Number.MAX_SAFE_INTEGER;
  const unique = [...new Set(marketHashNames.filter(Boolean))].slice(0, safeLimit);
  const result = {};
  // Steam priceoverview is fragile under concurrency; portfolio passes a lower value.
  const concurrency = Math.max(1, Math.min(24, Number(options.concurrency) || 16));
  const batchDelayMs = Math.max(0, Number(options.batchDelayMs) || 0);

  // Only pace live Steam fetches. Cached hits are cheap — delaying them made large
  // portfolios sleep for tens of seconds even with a warm price cache.
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const priced = await Promise.all(batch.map((name) => getPrice(name, options)));
    for (const item of priced) result[item.marketHashName] = item;

    const hadLiveFetch = priced.some((item) => item && item.cached === false);
    if (hadLiveFetch && i + concurrency < unique.length && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  return result;
}

function medianAsk(values) {
  const sorted = (Array.isArray(values) ? values : [])
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(median * 100) / 100;
}

function selectMarketMark(quotes, steamAsk) {
  const raw = (Array.isArray(quotes) ? quotes : [])
    .map((entry) => ({
      provider: entry?.provider,
      price: Number(entry?.price),
    }))
    .filter((entry) => entry.provider && Number.isFinite(entry.price) && entry.price > 0);

  let usable = raw.filter((entry) => {
    if (!Number.isFinite(steamAsk) || steamAsk <= 0) return true;
    if (entry.price > steamAsk * MARK_HIGH_VS_STEAM) return false;
    if (entry.price < steamAsk * MARK_LOW_VS_STEAM) return false;
    return true;
  });

  if (usable.length >= 2) {
    const packMedian = medianAsk(usable.map((entry) => entry.price));
    if (Number.isFinite(packMedian)) {
      const tightened = usable.filter((entry) => (
        entry.price <= packMedian * MARK_PACK_HIGH
        && entry.price >= packMedian * MARK_PACK_LOW
      ));
      if (tightened.length) usable = tightened;
    }
  }

  return {
    mark: medianAsk(usable.map((entry) => entry.price)),
    sources: usable.map((entry) => entry.provider),
  };
}

async function getThirdPartyPriceLists() {
  const [skinport, csgomarket, lisskins] = await Promise.all([
    getSkinportPriceList().catch(() => ({})),
    getMarketCsgoPriceList().catch(() => ({})),
    getLisSkinsPriceList().catch(() => ({})),
  ]);
  return {
    skinport: skinport && typeof skinport === 'object' ? skinport : {},
    csgomarket: csgomarket && typeof csgomarket === 'object' ? csgomarket : {},
    lisskins: lisskins && typeof lisskins === 'object' ? lisskins : {},
  };
}

// Portfolio mark-to-market: median of lowest asks on liquid cash markets.
// Steam stays on the quote as a sticker / fallback, and is never written back
// into the Steam price cache.
async function getPortfolioPrices(marketHashNames, options = {}) {
  const names = [...new Set((marketHashNames || []).filter(Boolean))];
  if (!names.length) return {};
  const [steamPrices, lists] = await Promise.all([
    getPrices(names, Number.MAX_SAFE_INTEGER, options),
    getThirdPartyPriceLists(),
  ]);

  const result = {};
  for (const name of names) {
    const steam = steamPrices[name] || {
      marketHashName: name,
      price: null,
      medianPrice: null,
      volume24h: null,
      provider: 'unpriced',
    };
    const steamAsk = Number.isFinite(steam.price) ? steam.price
      : (Number.isFinite(steam.medianPrice) ? steam.medianPrice : null);
    const steamPriceRub = Number.isFinite(steam.priceRub) ? steam.priceRub
      : (Number.isFinite(steam.medianPriceRub) ? steam.medianPriceRub : null);
    const selected = selectMarketMark([
      { provider: 'skinport', price: lists.skinport[name]?.price },
      { provider: 'csgomarket', price: lists.csgomarket[name]?.price },
      { provider: 'lisskins', price: lists.lisskins[name]?.price },
    ], steamAsk);
    const usedSteamFallback = !Number.isFinite(selected.mark) && Number.isFinite(steamAsk);
    const value = Number.isFinite(selected.mark) ? selected.mark : steamAsk;
    const merged = {
      ...steam,
      marketHashName: name,
      price: Number.isFinite(value) ? value : null,
      medianPrice: Number.isFinite(selected.mark) ? selected.mark : (steam.medianPrice ?? value ?? null),
      provider: usedSteamFallback
        ? (steam.provider || 'steam-market')
        : (Number.isFinite(value) ? 'market-mark' : 'unpriced'),
      markSources: selected.sources,
      steamPrice: Number.isFinite(steamAsk) ? steamAsk : null,
      steamPriceRub: Number.isFinite(steamPriceRub) ? steamPriceRub : null,
      updatedAt: steam.updatedAt || new Date().toISOString(),
    };

    if (Number.isFinite(selected.mark)) {
      delete merged.priceRub;
      delete merged.medianPriceRub;
      await attachRubPrice(merged, name, {
        skipNativeRub: true,
        rubRate: options.rubRate,
      });
    }

    result[name] = merged;
  }
  return result;
}

async function getTakeSkinPrice(marketHashName) {
  const params = new URLSearchParams({ page: '0', limit: '10', search: marketHashName });
  const json = await fetchJson(`https://take.skin/api/public/v1/skins?${params}`);
  const matches = Array.isArray(json.data) ? json.data : [];
  // Exact name only — search ranking often returns a nearby sticker/skin at a very
  // different ask (e.g. Rainbow Route Holo at 2× Steam when the query was mangled).
  const exact = matches.find((item) => item.marketHashName === marketHashName);
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

async function getCSFloatPrice(marketHashName) {
  if (!process.env.CSFLOAT_API_KEY) return null;

  const key = `csfloat:price:${marketHashName}`;
  const cached = await getCached(key, CSFLOAT_MAX_AGE_MS);
  if (cached) return cached;

  const params = new URLSearchParams({
    market_hash_name: marketHashName,
    limit: '50',
    sort_by: 'lowest_price',
    type: 'buy_now',
  });
  const rows = await fetchJson(`https://csfloat.com/api/v1/listings?${params}`, {
    timeoutMs: 5000,
    headers: {
      Authorization: process.env.CSFLOAT_API_KEY,
    },
  }).catch(() => null);

  const listings = Array.isArray(rows) ? rows : Array.isArray(rows?.data) ? rows.data : [];
  const exactListings = listings.filter((entry) => entry?.item?.market_hash_name === marketHashName);
  const source = exactListings.length ? exactListings : listings;
  const prices = source
    .map((entry) => Number(entry?.price))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (!prices.length) return null;

  const lowest = prices[0] / 100;
  const median = prices[Math.floor(prices.length / 2)] / 100;
  const result = {
    marketHashName,
    price: Math.round(lowest * 100) / 100,
    medianPrice: Math.round(median * 100) / 100,
    volume24h: prices.length,
    provider: 'csfloat',
    currencyCode: 'USD',
    updatedAt: new Date().toISOString(),
  };

  await setCached(key, result);
  return result;
}

function extractLisSkinsListingPrice(entry) {
  if (!entry) return null;
  // Public search/export always quote USD in `price` (currency=RUB is ignored by the API).
  const usd = Number(entry.price_usd ?? entry.price);
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

async function getLisSkinsPrice(marketHashName) {
  if (!process.env.LISSKINS_API_KEY) return null;

  const cacheKey = `lisskins:price:${marketHashName}:usd`;
  const cached = await getCached(cacheKey, LISSKINS_MAX_AGE_MS);
  if (cached) return cached;

  const params = new URLSearchParams({
    game: 'csgo',
    sort_by: 'lowest_price',
  });
  params.append('names[]', marketHashName);

  const json = await fetchJson(`https://api.lis-skins.com/v1/market/search?${params}`, {
    timeoutMs: 8000,
    headers: { Authorization: `Bearer ${process.env.LISSKINS_API_KEY}` },
  }).catch(() => null);

  const rows = Array.isArray(json?.data) ? json.data : [];
  const exact = rows.filter((entry) => entry?.name === marketHashName);
  const source = exact.length ? exact : rows;
  const prices = source
    .map((entry) => extractLisSkinsListingPrice(entry))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (!prices.length) return null;

  const result = {
    marketHashName,
    price: Math.round(prices[0] * 100) / 100,
    medianPrice: Math.round(prices[Math.floor(prices.length / 2)] * 100) / 100,
    volume24h: prices.length,
    provider: 'lisskins',
    currencyCode: 'USD',
    updatedAt: new Date().toISOString(),
  };

  await setCached(cacheKey, result);
  return result;
}

async function getSkinportPrice(marketHashName, currency = 'usd') {
  const history = await getSkinportSalesHistory(marketHashName, currency).catch(() => null);
  if (!history?.data?.length) return null;
  const latest = history.data[history.data.length - 1];
  if (!Number.isFinite(latest?.price)) return null;
  return {
    marketHashName,
    price: latest.price,
    medianPrice: latest.price,
    volume24h: latest.volume ?? null,
    provider: 'skinport',
    currencyCode: history.currency || normalizeCurrency(currency).toUpperCase(),
    updatedAt: new Date().toISOString(),
  };
}

async function getSteamMarketPrice(marketHashName, currency = 'usd') {
  const steamCurrency = resolveSteamCurrency(currency);
  const cacheKey = `steam:priceoverview:${marketHashName}:${steamCurrency}`;
  const cached = await getCached(cacheKey, PRICE_MAX_AGE_MS);
  if (cached) return { ...cached };

  const params = new URLSearchParams({
    appid: '730',
    currency: String(steamCurrency),
    market_hash_name: marketHashName,
  });

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const json = await fetchJson(`https://steamcommunity.com/market/priceoverview/?${params}`, {
        timeoutMs: 8000,
      });
      if (!json.success) return null;

      const price = parseMoney(json.lowest_price || json.median_price);
      const medianPrice = parseMoney(json.median_price || json.lowest_price);
      if (!Number.isFinite(price) && !Number.isFinite(medianPrice)) return null;

      const result = {
        marketHashName,
        price,
        medianPrice,
        volume24h: json.volume ? Number.parseInt(String(json.volume).replace(/,/g, ''), 10) : null,
        provider: 'steam-market',
        currencyCode: STEAM_CURRENCY_LABELS[steamCurrency] || 'USD',
        updatedAt: new Date().toISOString(),
      };
      await setCached(cacheKey, result);
      return result;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status);
      if (status === 429 || status === 502 || status === 503) {
        await sleep(400 * (attempt + 1) + Math.floor(Math.random() * 250));
        continue;
      }
      break;
    }
  }

  const stale = await getCached(cacheKey, STEAM_PRICE_STALE_MAX_AGE_MS);
  if (stale) return { ...stale, provider: 'steam-market-stale' };
  if (lastError) throw lastError;
  return null;
}

// Fallback when priceoverview is blocked/rate-limited: Steam market search still
// returns sell_price (cents) for an exact hash_name match.
// USD only — search/render ignores `currency` and keeps "$…" sell_price_text.
async function getSteamMarketSearchPrice(marketHashName, currency = 'usd') {
  if (normalizeCurrency(currency) !== 'usd') return null;

  const steamCurrency = resolveSteamCurrency('usd');
  const cacheKey = `steam:searchprice:${marketHashName}:${steamCurrency}`;
  const cached = await getCached(cacheKey, PRICE_MAX_AGE_MS);
  if (cached) return { ...cached };

  const json = await fetchSteamMarketSearch({
    query: marketHashName,
    start: 0,
    count: 10,
    sort: 'name-asc',
    currency: 'usd',
  });
  const rows = Array.isArray(json?.results) ? json.results : [];
  const exact = rows.find((row) => {
    const name = row?.hash_name || row?.asset_description?.market_hash_name;
    return name === marketHashName;
  });
  if (!exact) return null;

  const priceText = exact.sell_price_text || exact.sale_price_text;
  // Refuse non-USD text even if a caller bypasses the currency guard later.
  if (priceText && !/\$|USD/i.test(String(priceText))) return null;

  const price = parseMoney(priceText)
    || (Number.isFinite(Number(exact.sell_price)) ? Number(exact.sell_price) / 100 : null);
  if (!Number.isFinite(price) || price <= 0) return null;

  const result = {
    marketHashName,
    price: Math.round(price * 100) / 100,
    medianPrice: Math.round(price * 100) / 100,
    volume24h: Number(exact.sell_listings) || null,
    provider: 'steam-market',
    currencyCode: 'USD',
    updatedAt: new Date().toISOString(),
  };
  await setCached(cacheKey, result);
  return result;
}

let steamRubRateInflight = null;
let steamCnyRateInflight = null;

async function getSteamRubRate() {
  const key = 'fx:rub-per-usd';
  const cached = await getCached(key, FX_RATE_MAX_AGE_MS);
  if (Number.isFinite(cached) && cached >= 10) return cached;

  if (steamRubRateInflight) return steamRubRateInflight;

  steamRubRateInflight = (async () => {
    const staleCached = await getCached(key, 30 * 24 * 60 * 60 * 1000);

    try {
      const [rubPrice, usdPrice] = await Promise.all([
        getSteamMarketPrice(FX_PROBE_ITEM, 'rub').catch(() => null),
        getSteamMarketPrice(FX_PROBE_ITEM, 'usd').catch(() => null),
      ]);

      if (Number.isFinite(rubPrice?.price) && Number.isFinite(usdPrice?.price) && usdPrice.price > 0) {
        const ratio = rubPrice.price / usdPrice.price;
        // Reject near-parity — usually means the RUB probe actually returned USD.
        if (ratio >= 10) {
          await setCached(key, ratio);
          return ratio;
        }
      }
    } catch { /* fall through */ }

    if (Number.isFinite(staleCached) && staleCached >= 10) return staleCached;

    const cbr = await getMarketUsdRubRate().catch(() => null);
    if (Number.isFinite(cbr) && cbr >= 10) {
      await setCached(key, cbr);
      return cbr;
    }

    const basisRatio = await inferRubRateFromBasis();
    if (Number.isFinite(basisRatio)) {
      await setCached(key, basisRatio);
      return basisRatio;
    }

    return null;
  })().finally(() => {
    steamRubRateInflight = null;
  });

  return steamRubRateInflight;
}

async function getSteamCnyRate() {
  const key = 'fx:cny-per-usd';
  const cached = await getCached(key, FX_RATE_MAX_AGE_MS);
  if (Number.isFinite(cached) && cached >= 4 && cached <= 15) return cached;

  if (steamCnyRateInflight) return steamCnyRateInflight;

  steamCnyRateInflight = (async () => {
    const staleCached = await getCached(key, 30 * 24 * 60 * 60 * 1000);

    try {
      const [cnyPrice, usdPrice] = await Promise.all([
        getSteamMarketPrice(FX_PROBE_ITEM, 'cny').catch(() => null),
        getSteamMarketPrice(FX_PROBE_ITEM, 'usd').catch(() => null),
      ]);

      if (Number.isFinite(cnyPrice?.price) && Number.isFinite(usdPrice?.price) && usdPrice.price > 0) {
        const ratio = cnyPrice.price / usdPrice.price;
        // CNY/USD is typically ~6–8; reject near-parity or absurd outliers.
        if (ratio >= 4 && ratio <= 15) {
          await setCached(key, ratio);
          return ratio;
        }
      }
    } catch { /* fall through */ }

    if (Number.isFinite(staleCached) && staleCached >= 4 && staleCached <= 15) return staleCached;
    return null;
  })().finally(() => {
    steamCnyRateInflight = null;
  });

  return steamCnyRateInflight;
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

async function getMarketUsdRubRate() {
  const key = 'fx:market-rub-per-usd';
  const cached = await getCached(key, FX_RATE_MAX_AGE_MS);
  if (Number.isFinite(cached)) return cached;

  const staleCached = await getCached(key, 30 * 24 * 60 * 60 * 1000);
  const json = await fetchJson('https://www.cbr-xml-daily.ru/daily_json.js', { timeoutMs: 5000 }).catch(() => null);
  const rate = Number(json?.Valute?.USD?.Value);
  if (Number.isFinite(rate) && rate > 0) {
    await setCached(key, rate);
    return rate;
  }

  return Number.isFinite(staleCached) ? staleCached : null;
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

/** Free CSFloat daily avg-price graph (no API key). Prices are returned in USD cents. */
async function getCSFloatGraphHistory(marketHashName, currency = 'usd') {
  const normalizedCurrency = normalizeCurrency(currency);
  const cacheKey = `csfloat:graph:${marketHashName}:${normalizedCurrency}`;
  const cached = await getCached(cacheKey, HISTORY_MAX_AGE_MS);
  if (cached?.data?.length && !historyLooksStale(cached, 3)) return { ...cached, cached: true };

  const urlName = encodeURIComponent(marketHashName);
  const rows = await fetchJson(`https://csfloat.com/api/v1/history/${urlName}/graph`, {
    timeoutMs: 12000,
    headers: { Accept: 'application/json' },
  }).catch(() => null);

  // Rate limits / brief outages: keep a recent real graph instead of falling through to synthetic.
  if (!Array.isArray(rows) || !rows.length) {
    const stale = await getCachedEntry(cacheKey).catch(() => null);
    const staleHistory = stale?.value;
    if (staleHistory?.data?.length && !historyLooksStale(staleHistory, 14)) {
      return { ...staleHistory, cached: true };
    }
    return null;
  }

  let data = rows
    .map((bucket) => {
      const cents = Number(bucket?.avg_price);
      if (!Number.isFinite(cents) || cents <= 0) return null;
      const day = String(bucket.day || '').slice(0, 10);
      if (!day || Number.isNaN(new Date(day).getTime())) return null;
      return {
        date: day,
        price: Math.round(cents) / 100,
        volume: Number.isFinite(bucket.count) ? bucket.count : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (!data.length) return null;

  if (normalizedCurrency === 'rub') {
    const rate = await getSteamRubRate().catch(() => null);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    data = data.map((point) => ({
      ...point,
      price: Math.round(point.price * rate * 100) / 100,
    }));
  }

  const result = {
    marketHashName,
    currency: normalizedCurrency.toUpperCase(),
    data,
    provider: 'csfloat',
    updatedAt: new Date().toISOString(),
  };
  await setCached(cacheKey, result);
  return { ...result, cached: false };
}

function historyLooksStale(history, maxLagDays = 3) {
  const data = Array.isArray(history?.data) ? history.data : [];
  if (!data.length) return true;
  const last = data[data.length - 1]?.date;
  if (!last) return true;
  const lagMs = Date.now() - new Date(last).getTime();
  return !Number.isFinite(lagMs) || lagMs > maxLagDays * 86400000;
}

async function getSkinportSalesHistory(marketHashName, currency = 'usd') {
  const key = `skinport:history:${marketHashName}:${currency}`;
  const cached = await getCached(key, SKINPORT_MAX_AGE_MS);
  if (cached) return { ...cached, cached: true };

  const params = new URLSearchParams({
    app_id: '730',
    currency: SKINPORT_CURRENCY_CODES[normalizeCurrency(currency)] || 'USD',
    market_hash_name: marketHashName,
  });
  const json = await fetchJson(`https://api.skinport.com/v1/sales/history?${params}`, {
    timeoutMs: 5000,
    headers: { 'Accept-Encoding': 'br' },
  }).catch(() => null);

  const rows = Array.isArray(json) ? json : [];
  // Never substitute another wear/variant: percentages must match the exact inventory item.
  const exact = rows.find((row) => row.market_hash_name === marketHashName);
  if (!exact) return null;

  const now = Date.now();
  const buckets = [
    { days: 90, key: 'last_90_days' },
    { days: 30, key: 'last_30_days' },
    { days: 7, key: 'last_7_days' },
    { days: 1, key: 'last_24_hours' },
  ];
  const data = buckets
    .map(({ days, key }) => {
      const bucket = exact[key];
      const price = parseMoney(bucket?.median ?? bucket?.avg ?? bucket?.min ?? bucket?.max);
      if (!Number.isFinite(price)) return null;
      return {
        date: new Date(now - days * 86400000).toISOString().slice(0, 10),
        price,
        volume: Number.isFinite(bucket?.volume) ? bucket.volume : null,
      };
    })
    .filter(Boolean);

  if (data.length) {
    const latest = data[data.length - 1];
    data.push({
      date: new Date(now).toISOString().slice(0, 10),
      price: latest.price,
      volume: latest.volume,
    });
  }

  const result = {
    marketHashName,
    currency: exact.currency || (SKINPORT_CURRENCY_CODES[normalizeCurrency(currency)] || 'USD'),
    data,
    provider: data.length ? 'skinport' : 'none',
    updatedAt: new Date().toISOString(),
  };

  if (result.data.length) {
    await setCached(key, result);
  }
  return { ...result, cached: false };
}

async function getPriceHistory(marketHashName, days = 30, options = {}) {
  const allTime = days === 'all' || days === 'max' || Number(days) > 365;
  const requestedDays = allTime ? 'all' : Math.max(1, Math.min(365, Number(days) || 30));
  const anchorOverride = Number.isFinite(options.anchorPrice) && options.anchorPrice > 0
    ? options.anchorPrice
    : null;
  const requestedCurrency = String(options.currency || 'usd').toLowerCase() === 'rub' ? 'rub' : 'usd';
  // Always build the full 4-year series and slice per request, so short periods (1d/7d/30d/1y)
  // remain consistent with "All time" and never get re-derived from a stale FX rate.
  const FULL_SPAN_DAYS = 365 * 4;
  // v3: charts use free CSFloat graph only (CSMarketAPI kept for catalog/listings).
  const key = `history:v3:${marketHashName}:${requestedCurrency}:full`;
  const cached = await getCached(key, HISTORY_MAX_AGE_MS);
  // Synthetic series must not block retries — leaders/charts need real CSFloat/take.skin data.
  const cachedIsUsable = Boolean(
    cached
    && Array.isArray(cached.data)
    && cached.data.length
    && cached.provider
    && cached.provider !== 'synthetic'
    && !historyLooksStale(cached, 3)
  );
  let history = cachedIsUsable ? cached : null;
  let usedCached = Boolean(history);

  // Prefer a slightly stale real series over inventing synthetic data when providers
  // are rate-limited / unavailable.
  const staleEntry = !history ? await getCachedEntry(key).catch(() => null) : null;
  const staleHistory = staleEntry?.value && Array.isArray(staleEntry.value.data) && staleEntry.value.data.length
    ? staleEntry.value
    : null;
  const staleIsReal = Boolean(staleHistory && staleHistory.provider && staleHistory.provider !== 'synthetic');

  if (!history) {
    const csfloatHistory = await getCSFloatGraphHistory(marketHashName, requestedCurrency).catch(() => null);
    if (csfloatHistory?.data?.length) {
      history = csfloatHistory;
    }
  }

  if (!history) {
    const skinportHistory = await getSkinportSalesHistory(marketHashName, requestedCurrency).catch(() => null);
    if (skinportHistory?.data?.length) {
      history = skinportHistory;
    }
  }

  if (!history) {
    // 1) Try take.skin (free tier caps around ~30d). It only returns USD prices,
    //    so for RUB requests we'll convert each point with the current FX ratio.
    let providerData = [];
    let providerName = 'none';
    let currency = requestedCurrency.toUpperCase();
    let providerCurrency = 'USD';
    for (const window of [365, 30]) {
      const urlName = encodeURIComponent(marketHashName);
      const json = await fetchJson(`https://take.skin/api/public/v1/skins/${urlName}/price-history?days=${window}`)
        .catch(() => null);
      const raw = Array.isArray(json?.data) ? json.data : [];
      if (raw.length) {
        providerCurrency = (json?.currency || 'USD').toUpperCase();
        providerData = raw
          .map((point) => ({
            date: point.date,
            price: parseMoney(point.price),
            volume: Number.isFinite(point.volume) ? point.volume : (point.volume ? Number(point.volume) : null),
          }))
          .filter((point) => Number.isFinite(point.price) && !Number.isNaN(new Date(point.date).getTime()))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        providerName = 'take.skin';
        break;
      }
    }

    // 2) Always build the 4-year synthetic baseline so short periods get a real cut.
    let anchor = anchorOverride;
    if (!Number.isFinite(anchor)) {
      const live = await getSteamMarketPrice(marketHashName, requestedCurrency).catch(() => null)
        || await getPrice(marketHashName).catch(() => null);
      anchor = Number.isFinite(live?.price) ? live.price
        : Number.isFinite(live?.medianPrice) ? live.medianPrice
        : null;
      if (live?.currencyCode) currency = live.currencyCode;
    }

    // Provider data may be in USD or use a different price source (take.skin vs Steam).
    // To keep the chart consistent with Steam Market, we rescale the provider series so its
    // most recent point matches the live anchor in the requested currency.
    if (providerData.length && Number.isFinite(anchor) && anchor > 0) {
      const lastProviderPrice = providerData[providerData.length - 1].price;
      if (Number.isFinite(lastProviderPrice) && lastProviderPrice > 0) {
        const ratio = anchor / lastProviderPrice;
        if (Math.abs(ratio - 1) > 0.01) {
          providerData = providerData.map((p) => ({
            ...p,
            price: Math.round(p.price * ratio * 100) / 100,
          }));
        }
      }
      currency = requestedCurrency.toUpperCase();
    }

    if (providerData.length >= 2 && Number.isFinite(anchor) && anchor > 0) {
      // Splice: synthetic baseline before the first provider point, real provider data afterwards.
      const realFrom = new Date(providerData[0].date).toISOString().slice(0, 10);
      const firstProviderTs = new Date(providerData[0].date).getTime();
      const baseline = synthesizePriceHistory(marketHashName, anchor, FULL_SPAN_DAYS)
        .filter((p) => new Date(p.date).getTime() < firstProviderTs);
      providerData = baseline.concat(providerData);
      providerName = 'mixed';
      history = {
        marketHashName,
        currency,
        data: providerData,
        provider: providerName,
        realFrom,
        updatedAt: new Date().toISOString(),
      };
    } else if (staleIsReal) {
      // Providers are down/rate-limited — keep the last real series instead of faking one.
      history = staleHistory;
      usedCached = true;
    } else if (Number.isFinite(anchor) && anchor > 0) {
      providerData = synthesizePriceHistory(marketHashName, anchor, FULL_SPAN_DAYS);
      providerName = 'synthetic';
      history = {
        marketHashName,
        currency,
        data: providerData,
        provider: providerName,
        updatedAt: new Date().toISOString(),
      };
    } else {
      history = {
        marketHashName,
        currency,
        data: providerData,
        provider: providerName,
        updatedAt: new Date().toISOString(),
      };
    }

    // Cache the full series so subsequent period switches are instant.
    // Never let synthetic overwrite a previously stored real/mixed history.
    if (history.data.length) {
      const shouldCache = history.provider !== 'synthetic' || !staleIsReal;
      if (shouldCache && history !== staleHistory) {
        await setCached(key, history);
      }
    }
  }

  // Slice to the requested period.
  const series = history?.data || [];
  let slice = series;
  if (!allTime && series.length > 0) {
    const cutoff = Date.now() - requestedDays * 86400000;
    slice = series.filter((p) => new Date(p.date).getTime() >= cutoff);
    if (slice.length < 2) slice = series.slice(-Math.max(2, requestedDays));
  }

  return {
    ...history,
    data: slice,
    requestedDays,
    cached: usedCached,
  };
}

function synthesizePriceHistory(seedText, anchorPrice, days, options = {}) {
  const safeDays = Math.max(7, Math.min(3650, Number(days) || 30));
  const seed = hashStringToInt(String(seedText || '')) || 1;
  const rand = mulberry32(seed);
  const points = [];
  const now = Date.now();

  // Pick a behaviour shape based on the item name hash so different skins look different.
  // Burn entropy from `rand` only AFTER we pick the shape, otherwise every item gets the same one.
  const SHAPES = ['launch_dump', 'steady_growth', 'cyclical', 'late_pump', 'choppy_flat'];
  const shape = options.shape || SHAPES[seed % SHAPES.length];

  const longHorizon = safeDays >= 180;
  // Unique random parameters per item, derived from its hash.
  const launchMultiplier = 2 + (rand() * 4);     // 2x..6x
  const bottomMultiplier = 0.2 + rand() * 0.5;   // 0.2..0.7
  const dumpDays = Math.round(safeDays * (0.03 + rand() * 0.08)); // 3-11% of span
  const recoveryStart = Math.round(safeDays * (0.4 + rand() * 0.4));
  const noiseLevel = 0.025 + rand() * 0.05;      // 2.5-7.5% daily noise
  const cycleAmp = 0.1 + rand() * 0.25;          // 10-35% cycle amplitude
  const cyclePeriodDays = Math.round(30 + rand() * 240); // 30-270 day cycles
  const trendDirection = rand() < 0.5 ? -1 : 1;
  const phaseShift = rand() * Math.PI * 2;

  const baselineAt = (index) => {
    if (!longHorizon) return anchorPrice;
    const fromEnd = safeDays - 1 - index;
    const progress = (safeDays - 1 - fromEnd) / (safeDays - 1); // 0=start, 1=now

    switch (shape) {
      case 'launch_dump': {
        if (fromEnd >= safeDays - dumpDays) {
          const phaseProgress = (safeDays - 1 - fromEnd) / Math.max(1, dumpDays);
          const start = anchorPrice * launchMultiplier;
          const end = anchorPrice * bottomMultiplier;
          return start * Math.pow(end / start, phaseProgress);
        }
        if (fromEnd >= safeDays - recoveryStart) {
          const phaseProgress = (recoveryStart - (safeDays - 1 - fromEnd) + dumpDays) / Math.max(1, recoveryStart - dumpDays);
          return anchorPrice * bottomMultiplier * (1 + phaseProgress * 0.1);
        }
        const phaseProgress = ((safeDays - 1 - fromEnd) - recoveryStart) / Math.max(1, safeDays - 1 - recoveryStart);
        const start = anchorPrice * bottomMultiplier * 1.1;
        return start + (anchorPrice - start) * easeOutCubic(phaseProgress);
      }
      case 'steady_growth': {
        // Slow upward trend from ~30-60% of anchor to anchor.
        const start = anchorPrice * (0.3 + rand() * 0.3);
        return start + (anchorPrice - start) * Math.pow(progress, 1.4);
      }
      case 'cyclical': {
        // Sine wave around a slowly-trending mean.
        const trend = anchorPrice * (1 + (progress - 1) * 0.3 * trendDirection);
        const cycle = Math.sin(progress * Math.PI * 2 * (safeDays / cyclePeriodDays) + phaseShift) * cycleAmp * anchorPrice;
        return Math.max(anchorPrice * 0.2, trend + cycle);
      }
      case 'late_pump': {
        // Long boring period, then sharp rise near the end.
        const flat = anchorPrice * (0.4 + rand() * 0.3);
        if (progress < 0.7) return flat;
        const phaseProgress = (progress - 0.7) / 0.3;
        return flat + (anchorPrice - flat) * easeOutCubic(phaseProgress);
      }
      case 'choppy_flat':
      default: {
        // Hovers around anchor with mild drift.
        const drift = anchorPrice * (1 + (progress - 0.5) * 0.2 * trendDirection);
        return drift;
      }
    }
  };

  let price = baselineAt(0);
  for (let i = 0; i < safeDays; i += 1) {
    const t = now - (safeDays - 1 - i) * 86400000;
    const baseline = baselineAt(i);
    const meanReversion = (baseline - price) * 0.12;
    const dailyShock = (rand() - 0.5) * baseline * noiseLevel;
    price = Math.max(0.01, price + meanReversion + dailyShock);
    points.push({
      date: new Date(t).toISOString().slice(0, 10),
      price: Math.round(price * 100) / 100,
      volume: null,
    });
  }
  // Snap the final point exactly to the current anchor so chart agrees with the card.
  if (points.length) points[points.length - 1].price = Math.round(anchorPrice * 100) / 100;
  return points;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

function hashStringToInt(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

async function cacheIconUrl(key, marketHashName, iconUrl) {
  if (!iconUrl) return;
  await setCached(key, {
    marketHashName,
    iconUrl,
    updatedAt: new Date().toISOString(),
  });
}

let csMarketIconIndex = null;

async function getCSMarketAPIIcon(marketHashName) {
  const name = String(marketHashName || '').trim();
  if (!name) return null;
  const items = await getCSMarketAPIItems();
  if (!Array.isArray(items) || !items.length) return null;
  if (!csMarketIconIndex || csMarketIconIndex.source !== items) {
    const map = new Map();
    for (const item of items) {
      const itemName = item.market_hash_name || item.hash_name;
      const icon = item.cloudflare_icon_url || item.akamai_icon_url;
      if (itemName && icon) map.set(itemName, icon);
    }
    csMarketIconIndex = { source: items, map };
  }
  return csMarketIconIndex.map.get(name) || null;
}

async function getSteamMarketIcon(marketHashName, options = {}) {
  const key = `icon:${marketHashName}`;
  const cached = await getCached(key, ICON_MAX_AGE_MS);
  if (cached?.iconUrl) return cached.iconUrl;
  if (options.cachedOnly) return null;

  const searchIconUrl = await getSteamMarketSearchIcon(marketHashName).catch(() => null);
  if (searchIconUrl) {
    await cacheIconUrl(key, marketHashName, searchIconUrl);
    return searchIconUrl;
  }

  // Same catalog dump the Market tab uses — Steam search/listings 403 from some hosts.
  const catalogIconUrl = await getCSMarketAPIIcon(marketHashName).catch(() => null);
  if (catalogIconUrl) {
    await cacheIconUrl(key, marketHashName, catalogIconUrl);
    return catalogIconUrl;
  }

  try {
    const urlName = encodeURIComponent(marketHashName);
    const html = await fetchText(`https://steamcommunity.com/market/listings/730/${urlName}`);
    const iconUrl = html
      .match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]
      ?.replace(/&amp;/g, '&') || null;
    if (iconUrl) {
      await cacheIconUrl(key, marketHashName, iconUrl);
      return iconUrl;
    }
  } catch {
    // Steam listing pages are often blocked from the production host.
  }

  return null;
}

async function getSteamMarketSearchIcon(marketHashName) {
  const json = await fetchSteamMarketSearch({ query: marketHashName, start: 0, count: 10, sort: 'name-asc' });
  const rawItems = Array.isArray(json.results) ? json.results : [];
  const normalized = rawItems.map((item, index) => normalizeCatalogItem(item, index));
  const exact = normalized.find((item) => item.marketHashName === marketHashName) || normalized[0];
  return exact?.iconUrl || null;
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

function toNumericPercent(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null) return null;
  const cleaned = String(value).replace('%', '').replace(',', '.').trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractTakeSkinDelta(item) {
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
}

function takeSkinIconUrl(item) {
  const candidate = item?.iconUrl || item?.image || item?.icon || item?.img || item?.imageUrl;
  return typeof candidate === 'string' && candidate.startsWith('http') ? candidate : null;
}

function mapTakeSkinItem(item, index) {
  const marketHashName = item.marketHashName || item.name;
  const price = parseMoney(item.price);
  return {
    name: stripWear(marketHashName || item.name),
    marketHashName,
    wear: getWear(marketHashName),
    price,
    delta: extractTakeSkinDelta(item),
    tier: rarityToTier(item.rarity),
    spark: makeSpark(price, index),
    provider: 'take.skin',
    iconUrl: takeSkinIconUrl(item),
  };
}

function publicMover(item) {
  return {
    name: item.name,
    marketHashName: item.marketHashName,
    wear: item.wear,
    price: item.price,
    delta: item.delta,
    tier: item.tier,
    spark: item.spark,
    provider: item.provider,
    iconUrl: item.iconUrl || null,
  };
}

async function loadTakeSkinRows() {
  const key = 'market:top-movers';
  try {
    const cached = await remember(key, TOP_MOVERS_MAX_AGE_MS, async () => {
      const json = await fetchJson('https://take.skin/api/public/v1/skins?page=0&limit=100', { timeoutMs: 12000 });
      return Array.isArray(json.data) ? json.data : [];
    });
    return Array.isArray(cached.value) ? cached.value : [];
  } catch (error) {
    const stale = await getCached(key, 7 * 24 * 60 * 60 * 1000);
    return Array.isArray(stale) ? stale : [];
  }
}

function liquidityFromPriceMap(map) {
  let listedValue = 0;
  let listedCount = 0;
  let itemCount = 0;
  for (const row of Object.values(map || {})) {
    const price = Number(row.price);
    const volume = Number(row.volume);
    if (!Number.isFinite(price) || price <= 0) continue;
    itemCount += 1;
    if (Number.isFinite(volume) && volume > 0) {
      listedValue += price * volume;
      listedCount += volume;
    }
  }
  return { listedValue, listedCount, itemCount };
}

function pickListedLiquidity(maps) {
  const sources = [
    ['skinport', maps.skinport],
    ['lisskins', maps.lisskins],
    ['csgomarket', maps.csgomarket],
  ];
  for (const [source, map] of sources) {
    const liquidity = liquidityFromPriceMap(map);
    if (liquidity.listedValue > 0) return { ...liquidity, source };
  }
  return { listedValue: 0, listedCount: 0, itemCount: 0, source: null };
}

function pulseFromMovers(items) {
  let weighted = 0;
  let weight = 0;
  for (const item of items) {
    if (!Number.isFinite(item.delta) || Math.abs(item.delta) > 40) continue;
    const itemWeight = Math.max(1, Number(item.price) || 1);
    weighted += item.delta * itemWeight;
    weight += itemWeight;
  }
  return weight > 0 ? weighted / weight : null;
}

function pickMoverLeaders(items, maxAbs = 120) {
  const cap = Number.isFinite(maxAbs) ? maxAbs : 120;
  const usable = items.filter((item) => (
    Number.isFinite(item.price)
    && item.price >= 1
    && Number.isFinite(item.delta)
    && Math.abs(item.delta) <= cap
  ));
  const gainers = usable
    .filter((item) => item.delta > 0)
    .sort((a, b) => b.delta - a.delta || b.price - a.price)
    .slice(0, 3);
  const losers = usable
    .filter((item) => item.delta < 0)
    .sort((a, b) => a.delta - b.delta || b.price - a.price)
    .slice(0, 3);
  const movers = [...usable]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.price - a.price)
    .slice(0, 6);
  return { gainers, losers, movers };
}

async function moversFromPriceSnapshot(map) {
  const key = 'market:listed-price-snapshot';
  const current = {};
  for (const [name, row] of Object.entries(map || {})) {
    const price = Number(row?.price);
    const volume = Number(row?.volume);
    if (!name || !Number.isFinite(price) || price < 1) continue;
    if (Number.isFinite(volume) && volume < 3) continue;
    current[name] = price;
  }

  const entry = await getCachedEntry(key);
  const previous = entry && entry.value && typeof entry.value === 'object' ? entry.value : null;
  const ageMs = entry && Number.isFinite(entry.updatedAt) ? Date.now() - entry.updatedAt : null;
  const items = [];
  if (previous) {
    let index = 0;
    for (const [name, price] of Object.entries(current)) {
      const old = Number(previous[name]);
      if (!Number.isFinite(old) || old <= 0) continue;
      const delta = ((price - old) / old) * 100;
      if (!Number.isFinite(delta) || Math.abs(delta) < 0.4 || Math.abs(delta) > 120) continue;
      items.push({
        name: stripWear(name),
        marketHashName: name,
        wear: getWear(name),
        price,
        delta,
        tier: rarityToTier(''),
        spark: makeSpark(price, index),
        provider: 'price-snapshot',
        iconUrl: null,
      });
      index += 1;
    }
  }

  if (!previous || (ageMs != null && ageMs >= 6 * 60 * 60 * 1000)) {
    await setCached(key, current);
  }

  return items;
}

async function attachMoverIcons(items) {
  return Promise.all(items.map(async (item) => {
    if (item.iconUrl) return item;
    const iconUrl = item.marketHashName
      ? await getSteamMarketIcon(item.marketHashName).catch(() => null)
      : null;
    return { ...item, iconUrl };
  }));
}

function pickPeriodMoverUniverse() {
  return [...new Set(PERIOD_MOVER_SEEDS)].slice(0, 18);
}

function parseTakeSkinHistoryPoints(json) {
  const raw = Array.isArray(json?.data) ? json.data : [];
  return raw
    .map((point) => ({
      date: point.date,
      price: parseMoney(point.price),
    }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0 && !Number.isNaN(new Date(point.date).getTime()))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function changeOverDays(points, days) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const last = points[points.length - 1];
  const end = Date.parse(last.date);
  const target = end - days * 24 * 60 * 60 * 1000;
  let start = null;
  for (const point of points) {
    if (Date.parse(point.date) <= target) start = point;
  }
  if (!start) {
    const first = points[0];
    const ageDays = (end - Date.parse(first.date)) / 86400000;
    if (ageDays < days * 0.6) return null;
    start = first;
  }
  if (!start || start.price <= 0 || start === last) return null;
  return ((last.price - start.price) / start.price) * 100;
}

function sparkFromHistory(points, days) {
  if (!Array.isArray(points) || !points.length) return [];
  const last = points[points.length - 1];
  const target = Date.parse(last.date) - days * 24 * 60 * 60 * 1000;
  const slice = points.filter((point) => Date.parse(point.date) >= target);
  const series = (slice.length >= 2 ? slice : points).map((point) => point.price);
  return series.slice(-12);
}

function emptyPeriodMovers(fallback = {}) {
  const day1 = {
    gainers: Array.isArray(fallback.gainers) ? fallback.gainers : [],
    losers: Array.isArray(fallback.losers) ? fallback.losers : [],
  };
  return {
    1: day1,
    7: { gainers: [], losers: [] },
    30: { gainers: [], losers: [] },
  };
}

function extractNuxtPayload(html) {
  const page = String(html || '');
  const start = page.indexOf('[["ShallowReactive"');
  if (start < 0) return null;
  const end = page.indexOf('</script>', start);
  if (end < 0) return null;
  try {
    return JSON.parse(page.slice(start, end));
  } catch {
    return null;
  }
}

function nuxtDeref(payload, value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < payload.length) {
    return payload[value];
  }
  return value;
}

function csMarketCapMilliToUsd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed / 1000;
}

function isJunkMoverName(name) {
  const value = String(name || '');
  return /^(Souvenir |Sticker \| |Sealed Graffiti|Graffiti \| |Patch \| |Charm \| |Music Kit \| |Pin \| )/.test(value)
    || /Capsule|Viewer Pass|Souvenir Package/.test(value);
}

function sparkFromCsMarketCapChart(payload, chartRef) {
  const chart = nuxtDeref(payload, chartRef);
  if (!Array.isArray(chart)) return [];
  const spark = [];
  for (const entry of chart) {
    const point = nuxtDeref(payload, entry);
    const raw = point && typeof point === 'object' && !Array.isArray(point)
      ? nuxtDeref(payload, point.min_price)
      : point;
    const price = csMarketCapMilliToUsd(raw);
    if (Number.isFinite(price)) spark.push(price);
  }
  return spark.slice(-12);
}

function parseCsMarketCapIndexItems(html) {
  const payload = extractNuxtPayload(html);
  if (!Array.isArray(payload) || payload.length < 10) return [];
  const rows = payload.find((entry) => (
    entry && typeof entry === 'object' && !Array.isArray(entry)
    && entry.items != null
    && (entry.best30d != null || entry.worst30d != null)
  ));
  const items = rows ? nuxtDeref(payload, rows.items) : null;
  if (!Array.isArray(items)) return [];
  const parsed = [];
  for (const ref of items) {
    const obj = nuxtDeref(payload, ref);
    if (!obj || typeof obj !== 'object') continue;
    const marketHashName = nuxtDeref(payload, obj.market_hash_name);
    if (typeof marketHashName !== 'string' || isJunkMoverName(marketHashName)) continue;
    const price = csMarketCapMilliToUsd(nuxtDeref(payload, obj.current_min_price));
    if (!Number.isFinite(price) || price < 2 || price > 20000) continue;
    parsed.push({
      marketHashName,
      name: stripWear(marketHashName),
      wear: getWear(marketHashName),
      price,
      changes: {
        1: Number(nuxtDeref(payload, obj.change_24h_percent)),
        7: Number(nuxtDeref(payload, obj.change_7d_percent)),
        30: Number(nuxtDeref(payload, obj.change_30d_percent)),
      },
      spark: sparkFromCsMarketCapChart(payload, obj.seven_day_chart),
      provider: 'csmarketcap',
    });
  }
  return parsed;
}

function plausibleMoverDelta(price, delta, days) {
  if (!Number.isFinite(delta)) return false;
  const abs = Math.abs(delta);
  if (abs < 0.3) return false;
  if (days === 1 && abs > 80) return false;
  if (days === 7 && abs > 200) return false;
  if (days === 30 && abs > 400) return false;
  if (price >= 50 && days >= 7 && abs > 80) return false;
  return true;
}

async function loadCsMarketCapIndexMovers() {
  const key = 'market:csmarketcap-index-movers';
  const cached = await remember(key, MARKET_OVERVIEW_MAX_AGE_MS, async () => {
    const pages = await Promise.all(CSMARKETCAP_INDEX_PATHS.map(async (pathName) => {
      try {
        const html = await fetchText(`https://csmarketcap.com/indexes/${pathName}`, {
          timeoutMs: 25000,
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': STEAM_FETCH_HEADERS['User-Agent'],
          },
        });
        return parseCsMarketCapIndexItems(html);
      } catch {
        return [];
      }
    }));
    const merged = [];
    const seen = new Set();
    for (const list of pages) {
      for (const item of list) {
        if (seen.has(item.marketHashName)) continue;
        seen.add(item.marketHashName);
        merged.push(item);
      }
    }
    if (merged.length < 20) throw new Error('CSMarketCap index movers were not recognized.');
    return merged;
  });
  return cached.value;
}

function periodMoversFromCsMarketCap(rows) {
  const byPeriod = {};
  for (const days of PERIOD_MOVER_DAYS) {
    const maxAbs = days === 1 ? 80 : days === 7 ? 200 : 400;
    const items = rows.map((row) => {
      const delta = row.changes[days];
      if (!plausibleMoverDelta(row.price, delta, days)) return null;
      return {
        name: row.name,
        marketHashName: row.marketHashName,
        wear: row.wear,
        price: row.price,
        delta,
        tier: rarityToTier(''),
        spark: Array.isArray(row.spark) && row.spark.length > 1 ? row.spark : [],
        provider: 'csmarketcap',
        iconUrl: null,
      };
    }).filter(Boolean);
    byPeriod[days] = pickMoverLeaders(items, maxAbs);
  }
  return publicPeriodMovers(byPeriod);
}

async function fetchTakeSkinHistoryPoints(marketHashName) {
  const urlName = encodeURIComponent(marketHashName);
  const json = await fetchJson(
    `https://take.skin/api/public/v1/skins/${urlName}/price-history?days=30`,
    { timeoutMs: 5000 },
  ).catch(() => null);
  return parseTakeSkinHistoryPoints(json);
}

async function fetchCsfloatHistoryPoints(marketHashName) {
  const urlName = encodeURIComponent(marketHashName);
  const rows = await fetchJson(`https://csfloat.com/api/v1/history/${urlName}/graph`, {
    timeoutMs: 5000,
    headers: { Accept: 'application/json' },
  }).catch(() => null);
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows
    .map((bucket) => {
      const cents = Number(bucket?.avg_price);
      if (!Number.isFinite(cents) || cents <= 0) return null;
      const day = String(bucket.day || '').slice(0, 10);
      if (!day || Number.isNaN(new Date(day).getTime())) return null;
      return { date: day, price: Math.round(cents) / 100 };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function isFreshHistory(points) {
  if (!Array.isArray(points) || points.length < 2) return false;
  const lastAge = Date.now() - Date.parse(points[points.length - 1].date);
  return Number.isFinite(lastAge) && lastAge <= 10 * 24 * 60 * 60 * 1000;
}

async function fetchMoverHistoryPoints(marketHashName) {
  const key = `market:mover-history:${marketHashName}`;
  const cached = await getCached(key, 6 * 60 * 60 * 1000);
  if (isFreshHistory(cached)) return cached;

  let points = await fetchCsfloatHistoryPoints(marketHashName);
  if (!isFreshHistory(points)) {
    const take = await fetchTakeSkinHistoryPoints(marketHashName);
    if (isFreshHistory(take)) points = take;
    else points = [];
  }
  if (isFreshHistory(points)) await setCached(key, points);
  return points;
}

let periodMoversInflight = null;

async function getPeriodMovers(maps, fallbackLeaders) {
  const key = 'market:period-movers:v4';
  const cached = await getCached(key, MARKET_OVERVIEW_MAX_AGE_MS);
  if (cached && typeof cached === 'object') return cached;
  if (periodMoversInflight) return periodMoversInflight;

  periodMoversInflight = (async () => {
    try {
      const liveRows = await loadCsMarketCapIndexMovers();
      const live = periodMoversFromCsMarketCap(liveRows);
      if ((live[1]?.gainers?.length || 0) >= 1 && (live[1]?.losers?.length || 0) >= 1) {
        await setCached(key, live);
        return live;
      }
    } catch (error) {
      console.warn('[market] CSMarketCap movers failed, using fallback:', error.message);
    }

    const names = pickPeriodMoverUniverse();
    const rows = [];
    for (let i = 0; i < names.length; i += 2) {
      const batch = names.slice(i, i + 2);
      const fetched = await Promise.all(batch.map(async (name) => {
        const points = await fetchMoverHistoryPoints(name);
        if (points.length < 2) return null;
        return { name, points, price: points[points.length - 1].price };
      }));
      rows.push(...fetched.filter(Boolean));
    }
    if (!rows.length) throw new Error('Not enough period-mover histories.');
    const byPeriod = {};
    for (const days of PERIOD_MOVER_DAYS) {
      const maxAbs = days === 1 ? 80 : days === 7 ? 200 : 400;
      const items = rows.map((row) => {
        const delta = changeOverDays(row.points, days);
        if (!Number.isFinite(delta)) return null;
        return {
          name: stripWear(row.name),
          marketHashName: row.name,
          wear: getWear(row.name),
          price: row.price,
          delta,
          tier: rarityToTier(''),
          spark: sparkFromHistory(row.points, days),
          provider: 'csfloat',
          iconUrl: null,
        };
      }).filter(Boolean);
      byPeriod[days] = pickMoverLeaders(items, maxAbs);
    }
    const stamped = publicPeriodMovers(byPeriod);
    await setCached(key, stamped);
    return stamped;
  })()
    .catch(async () => {
      const stale = await getCached(key, 7 * 24 * 60 * 60 * 1000);
      if (stale && typeof stale === 'object' && stale[1]) return stale;
      return emptyPeriodMovers({
        gainers: (fallbackLeaders?.gainers || []).map(publicMover),
        losers: (fallbackLeaders?.losers || []).map(publicMover),
      });
    })
    .finally(() => {
      periodMoversInflight = null;
    });

  return periodMoversInflight;
}

function publicPeriodMovers(byPeriod) {
  const stamped = {};
  for (const days of PERIOD_MOVER_DAYS) {
    const pack = byPeriod[days] || { gainers: [], losers: [] };
    stamped[days] = {
      gainers: (pack.gainers || []).map(publicMover),
      losers: (pack.losers || []).map(publicMover),
    };
  }
  return stamped;
}

async function appendOverviewHistory(listedValue) {
  const key = 'market:overview-history';
  const now = Date.now();
  const previous = await getCached(key, MARKET_OVERVIEW_HISTORY_MAX_AGE_MS);
  const points = Array.isArray(previous) ? previous.filter((point) => Number.isFinite(point?.v) && Number.isFinite(point?.t)) : [];
  const last = points[points.length - 1];
  if (Number.isFinite(listedValue) && listedValue > 0 && (!last || now - last.t >= MARKET_OVERVIEW_HISTORY_POINT_GAP_MS)) {
    points.push({ t: now, v: listedValue });
    await setCached(key, points.slice(-24));
  }
  const spark = points.map((point) => point.v);
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const baseline = [...points].reverse().find((point) => point.t <= dayAgo) || (points.length >= 2 ? points[0] : null);
  const change24h = baseline && baseline.v > 0 && listedValue > 0
    ? ((listedValue - baseline.v) / baseline.v) * 100
    : null;
  return { spark, change24h };
}

function parseSpacedUsd(text) {
  const digits = String(text || '').replace(/[^\d.]/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 1e8 ? parsed : null;
}

function milliDollarsToUsd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed / 1000;
}

function interpolateLogChange(fromDays, fromPct, toDays, toPct, targetDays) {
  if (![fromPct, toPct].every((value) => Number.isFinite(value))) return null;
  if (!(toDays > fromDays) || targetDays <= fromDays || targetDays >= toDays) return null;
  const start = Math.log(1 + fromPct / 100);
  const end = Math.log(1 + toPct / 100);
  const t = (targetDays - fromDays) / (toDays - fromDays);
  return (Math.exp(start + (end - start) * t) - 1) * 100;
}

function csMarketCapChanges(change7d, change30d, change90d, change365d) {
  const change180d = interpolateLogChange(90, change90d, 365, change365d, 180);
  return {
    7: Number.isFinite(change7d) ? change7d : null,
    30: Number.isFinite(change30d) ? change30d : null,
    90: Number.isFinite(change90d) ? change90d : null,
    180: Number.isFinite(change180d) ? change180d : null,
    365: Number.isFinite(change365d) ? change365d : null,
  };
}

function parseCsMarketCapHistoryFromHtml(html) {
  const history = [];
  const page = String(html || '');
  const dateRe = /"(\d{4}-\d{2}-\d{2})T00:00:00\.000Z",(\d{12,16})/g;
  let match = dateRe.exec(page);
  while (match) {
    const t = Date.parse(`${match[1]}T00:00:00.000Z`);
    const v = milliDollarsToUsd(match[2]);
    if (Number.isFinite(t) && Number.isFinite(v) && v >= 1e9) history.push({ t, v });
    match = dateRe.exec(page);
  }
  history.sort((a, b) => a.t - b.t);
  const deduped = [];
  for (const point of history) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.t === point.t) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return deduped;
}

function attachCsMarketCapHistory(parsed, html) {
  if (!parsed) return null;
  const fromHtml = parseCsMarketCapHistoryFromHtml(html);
  if (fromHtml.length > (parsed.history || []).length) {
    parsed.history = fromHtml;
  }
  if (parsed.history.length) {
    parsed.history[parsed.history.length - 1] = {
      t: parsed.history[parsed.history.length - 1].t,
      v: parsed.marketCap,
    };
    parsed.spark = parsed.history.slice(-8).map((point) => point.v);
  }
  return parsed;
}

function parseCsMarketCapPayload(html) {
  const payload = extractNuxtPayload(html);
  if (!Array.isArray(payload)) return null;
  let stats = null;
  let bestChartLen = 0;
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    if (entry.current_sum == null || entry.chart_data == null) continue;
    const chart = nuxtDeref(payload, entry.chart_data);
    const chartLen = Array.isArray(chart) ? chart.length : 0;
    if (chartLen > bestChartLen) {
      bestChartLen = chartLen;
      stats = entry;
    }
  }
  if (!stats) return null;
  const currentSum = milliDollarsToUsd(nuxtDeref(payload, stats.current_sum));
  const change7d = Number(nuxtDeref(payload, stats.percent_change_7d ?? stats.change_7d));
  const change24h = Number(nuxtDeref(payload, stats.change_24h));
  const change30d = Number(nuxtDeref(payload, stats.change_30d));
  const change90d = Number(nuxtDeref(payload, stats.change_90d));
  const change365d = Number(nuxtDeref(payload, stats.change_1y));
  const chart = nuxtDeref(payload, stats.chart_data);
  const history = [];
  for (const ref of chart) {
    const point = nuxtDeref(payload, ref);
    if (!point || typeof point !== 'object' || Array.isArray(point)) continue;
    const ts = Date.parse(nuxtDeref(payload, point.date));
    const value = milliDollarsToUsd(nuxtDeref(payload, point.sum));
    if (!Number.isFinite(ts) || !Number.isFinite(value) || value < 1e9) continue;
    history.push({ t: ts, v: value });
  }
  history.sort((a, b) => a.t - b.t);
  const marketCap = currentSum || (history.length ? history[history.length - 1].v : null);
  if (!Number.isFinite(marketCap)) return null;
  if (history.length) history[history.length - 1] = { t: history[history.length - 1].t, v: marketCap };
  const spark = history.slice(-8).map((point) => point.v);
  return {
    marketCap,
    change24h: Number.isFinite(change24h) ? change24h : null,
    change7d: Number.isFinite(change7d) ? change7d : null,
    changes: csMarketCapChanges(change7d, change30d, change90d, change365d),
    history,
    spark,
    source: 'csmarketcap',
  };
}

function parseCsMarketCapHtml(html) {
  const fromPayload = attachCsMarketCapHistory(parseCsMarketCapPayload(html), html);
  if (fromPayload && fromPayload.history.length >= 2) return fromPayload;

  const page = String(html || '');
  const faq = page.match(/CS2 market cap sits at \$([0-9\s\u00A0]+)\s*\(\s*([+-]?\d+(?:\.\d+)?)%\s+over the last 7 days\)/i);
  const banner = page.match(/banner__price[\s\S]{0,500}?c-usd[^>]*>([0-9\s\u00A0]+)</i);
  const marketCap = parseSpacedUsd(faq?.[1]) || parseSpacedUsd(banner?.[1]);
  const stats = page.match(/"current_sum":\d+,"previous_sum":\d+,"percent_change_7d":\d+,"ath":\d+,"change_24h":\d+,"change_7d":\d+,"change_30d":\d+,"change_90d":\d+,"change_1y":\d+,"chart_data":\d+\},(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const currentSum = stats ? milliDollarsToUsd(stats[1]) : null;
  const previousSum = stats ? milliDollarsToUsd(stats[2]) : null;
  const change7d = stats ? Number(stats[3]) : (faq ? Number(faq[2]) : null);
  const change24h = stats ? Number(stats[5]) : null;
  const change30d = stats ? Number(stats[6]) : null;
  const change90d = stats ? Number(stats[7]) : null;
  const change365d = stats ? Number(stats[8]) : null;

  const chartStart = page.indexOf('"chart_data":');
  const chartSlice = chartStart >= 0 ? page.slice(chartStart, chartStart + 1800) : '';
  const spark = [];
  const dateRe = /"(\d{4}-\d{2}-\d{2})T00:00:00\.000Z"(?:,(\d{12,14}))?/g;
  let match = dateRe.exec(chartSlice);
  let index = 0;
  while (match) {
    const inline = match[2] ? milliDollarsToUsd(match[2]) : null;
    const point = inline
      || (index === 0 ? previousSum : null)
      || currentSum;
    if (Number.isFinite(point) && point > 1e9) spark.push(point);
    index += 1;
    match = dateRe.exec(chartSlice);
  }

  const value = marketCap || currentSum || fromPayload?.marketCap;
  if (Number.isFinite(value) && spark.length) spark[spark.length - 1] = value;

  if (!Number.isFinite(value)) return fromPayload;
  return attachCsMarketCapHistory({
    marketCap: value,
    change24h: Number.isFinite(change24h) ? change24h : fromPayload?.change24h ?? null,
    change7d: Number.isFinite(change7d) ? change7d : fromPayload?.change7d ?? null,
    changes: csMarketCapChanges(change7d, change30d, change90d, change365d),
    history: Array.isArray(fromPayload?.history) ? fromPayload.history : [],
    spark: spark.length > 1 ? spark : (fromPayload?.spark || []),
    source: 'csmarketcap',
  }, html);
}

async function fetchCsMarketCapPage(url) {
  const headers = {
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': STEAM_FETCH_HEADERS['User-Agent'],
  };
  const args = ['-sS', '-L', '-4', '--max-time', '30'];
  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }
  args.push(url);
  try {
    const { stdout } = await execFileAsync('curl', args, {
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8',
      timeout: 35000,
    });
    if (stdout) return stdout;
  } catch (error) {
    try {
      return await fetchText(url, { timeoutMs: 45000, headers });
    } catch {
      throw error;
    }
  }
  return fetchText(url, { timeoutMs: 45000, headers });
}

async function getCsMarketCapIndex() {
  const key = 'market:csmarketcap-index:v4';
  try {
    const cached = await remember(key, MARKET_OVERVIEW_MAX_AGE_MS, async () => {
      const urls = [
        'https://csmarketcap.com/market-cap',
        'https://csmarketcap.com/market-cap',
        'https://csmarketcap.com/',
      ];
      let lastError = null;
      let best = null;
      for (const url of urls) {
        try {
          const parsed = parseCsMarketCapHtml(await fetchCsMarketCapPage(url));
          if (!parsed || !Number.isFinite(parsed.marketCap)) continue;
          const points = Array.isArray(parsed.history) ? parsed.history.length : 0;
          if (!best || points > (best.history || []).length) best = parsed;
          if (points >= 30) return parsed;
        } catch (error) {
          lastError = error;
        }
      }
      if (best) return best;
      throw lastError || new Error('CSMarketCap market-cap markup was not recognized.');
    });
    return cached.value;
  } catch (error) {
    const stale = await getCached(key, 7 * 24 * 60 * 60 * 1000)
      || await getCached('market:csmarketcap-index:v3', 7 * 24 * 60 * 60 * 1000)
      || await getCached('market:csmarketcap-index:v2', 7 * 24 * 60 * 60 * 1000);
    if (stale && Number.isFinite(stale.marketCap)) return stale;
    return null;
  }
}

function emptyMarketOverview() {
  return {
    listedValue: null,
    listedCount: 0,
    itemCount: 0,
    change24h: null,
    changes: {},
    history: [],
    spark: [],
    gainers: [],
    losers: [],
    movers: [],
    moversByPeriod: emptyPeriodMovers(),
    source: null,
    updatedAt: new Date().toISOString(),
  };
}

async function getMarketOverview() {
  const key = 'market:overview:v6';
  try {
    const cached = await remember(key, MARKET_OVERVIEW_MAX_AGE_MS, async () => {
      const [rows, skinport, lisskins, csgomarket, capIndex] = await Promise.all([
        loadTakeSkinRows(),
        getSkinportPriceList().catch(() => ({})),
        getLisSkinsPriceList().catch(() => ({})),
        getMarketCsgoPriceList().catch(() => ({})),
        getCsMarketCapIndex().catch(() => null),
      ]);
      const universe = rows
        .map((item, index) => mapTakeSkinItem(item, index))
        .filter((item) => item.price != null && item.delta != null);
      const snapshotMap = [csgomarket, lisskins, skinport].find((map) => map && Object.keys(map).length) || {};
      const snapshotUniverse = universe.length ? [] : await moversFromPriceSnapshot(snapshotMap);
      const combined = universe.length ? universe : snapshotUniverse;
      const liquidity = pickListedLiquidity({ skinport, lisskins, csgomarket });
      const circulating = Boolean(capIndex && Number.isFinite(capIndex.marketCap));
      const listedValue = circulating
        ? capIndex.marketCap
        : (liquidity.listedValue > 0 ? liquidity.listedValue : null);
      const pulse = pulseFromMovers(combined);
      let change24h = pulse;
      let spark = [];
      let history = [];
      let changes = {};
      if (circulating) {
        change24h = Number.isFinite(capIndex.change24h) ? capIndex.change24h : pulse;
        spark = Array.isArray(capIndex.spark) ? capIndex.spark : [];
        history = Array.isArray(capIndex.history) ? capIndex.history : [];
        changes = capIndex.changes && typeof capIndex.changes === 'object' ? capIndex.changes : {};
      } else {
        const pulseHistory = await appendOverviewHistory(liquidity.listedValue);
        change24h = Number.isFinite(pulseHistory.change24h) ? pulseHistory.change24h : pulse;
        spark = pulseHistory.spark.length >= 2
          ? pulseHistory.spark
          : (Number.isFinite(listedValue) && listedValue > 0
            ? [
              listedValue / (1 + (Number.isFinite(change24h) ? change24h : 0) / 100),
              listedValue,
            ]
            : []);
        if (Number.isFinite(change24h)) changes = { 7: change24h };
      }
      if (!Number.isFinite(listedValue)) {
        throw new Error('Market overview sources returned no cap.');
      }
      const leaders = pickMoverLeaders(combined);
      const [gainers, losers, movers] = await Promise.all([
        attachMoverIcons(leaders.gainers),
        attachMoverIcons(leaders.losers),
        attachMoverIcons(leaders.movers),
      ]);
      const publicGainers = gainers.map(publicMover);
      const publicLosers = losers.map(publicMover);
      getPeriodMovers({ skinport, lisskins, csgomarket }, leaders).catch(() => {});
      const cachedPeriodMovers = await getCached('market:period-movers:v4', MARKET_OVERVIEW_MAX_AGE_MS);
      const periodMovers = cachedPeriodMovers && typeof cachedPeriodMovers === 'object'
        ? cachedPeriodMovers
        : emptyPeriodMovers({ gainers: publicGainers, losers: publicLosers });
      const day1 = periodMovers?.[1] && (periodMovers[1].gainers?.length || periodMovers[1].losers?.length)
        ? periodMovers[1]
        : null;
      return {
        listedValue,
        listedCount: circulating ? 0 : liquidity.listedCount,
        itemCount: liquidity.itemCount,
        change24h: Number.isFinite(change24h) ? change24h : null,
        change7d: Number.isFinite(capIndex?.change7d) ? capIndex.change7d : (Number.isFinite(changes[7]) ? changes[7] : null),
        changes,
        history,
        spark,
        gainers: day1 ? day1.gainers : publicGainers,
        losers: day1 ? day1.losers : publicLosers,
        movers: movers.map(publicMover),
        moversByPeriod: periodMovers,
        source: circulating ? 'csmarketcap' : liquidity.source,
        circulating,
        updatedAt: new Date().toISOString(),
      };
    });
    return cached.value;
  } catch (error) {
    const stale = await getCached(key, 7 * 24 * 60 * 60 * 1000);
    if (stale && typeof stale === 'object') return stale;
    return emptyMarketOverview();
  }
}

async function getTopMovers() {
  const overview = await getMarketOverview();
  return Array.isArray(overview.movers) ? overview.movers : [];
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

function resolveMarketCatalogProvider() {
  const configured = String(process.env.MARKET_CATALOG_PROVIDER || 'steam').trim().toLowerCase();
  if (configured === 'csmarketapi' && process.env.CSMARKET_API_KEY) return 'csmarketapi';
  return 'steam';
}

async function getCSMarketAPIItems() {
  if (!process.env.CSMARKET_API_KEY) return [];

  try {
    const cached = await remember('csmarketapi:items', CSMARKET_ITEMS_MAX_AGE_MS, async () => {
      const params = new URLSearchParams({ key: process.env.CSMARKET_API_KEY });
      const json = await fetchJson(`https://api.csmarketapi.com/v1/items/?${params}`, { timeoutMs: 120000 });
      return Array.isArray(json) ? json : [];
    });
    return cached.value;
  } catch (error) {
    // Dump refresh often 500s; keep serving the last good snapshot instead of blocking search for ~2 minutes.
    const stale = await getCached('csmarketapi:items', 30 * 24 * 60 * 60 * 1000);
    if (Array.isArray(stale) && stale.length) {
      console.warn('[catalog] CSMarketAPI items refresh failed, using stale dump:', error.message);
      return stale;
    }
    throw error;
  }
}

function mapCSMarketQualityToRarity(quality, marketHashName) {
  const value = String(quality || '').toLowerCase();
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
  if (quality) return String(quality);
  return inferRarity('', marketHashName);
}

function inferCategoryFromCSMarketItem(item) {
  const category = String(item.category || '').toLowerCase();
  const weapon = String(item.weapon || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();
  const name = String(item.market_hash_name || '').toLowerCase();

  if (item.sticker_collection || (category.includes('sticker') && !name.includes('capsule'))) return 'stickers';
  if (item.graffiti_collection || category.includes('graffiti')) return 'graffiti';
  if (name.includes('sticker capsule') || category.includes('capsule')) return 'capsules';
  if (category.includes('knife') || weapon.includes('knife') || name.startsWith('★')) return 'knives';
  if (category.includes('glove') || weapon.includes('glove') || name.includes('gloves') || name.includes('wraps')) return 'gloves';
  if (category.includes('agent') || type.includes('agent')) return 'agents';
  if (category.includes('container') || name.endsWith(' case') || type.includes('container')) return 'containers';
  if (
    category.includes('rifle')
    || category.includes('pistol')
    || category.includes('smg')
    || category.includes('shotgun')
    || category.includes('sniper')
    || category.includes('machinegun')
    || weapon
  ) return 'weapons';

  return inferCategory(type || item.category, item.market_hash_name);
}

function pickRawCollectionName(raw = {}) {
  return raw.collection
    || raw.sticker_collection
    || raw.graffiti_collection
    || raw.patch_collection
    || null;
}

function normalizeCSMarketCatalogItem(raw, seed = 0) {
  const marketHashName = raw.market_hash_name || raw.hash_name || 'Unknown item';
  const type = raw.type || raw.category || raw.weapon || 'Unknown';
  const rarity = mapCSMarketQualityToRarity(raw.quality, marketHashName);
  const category = inferCategoryFromCSMarketItem(raw);
  const wear = getWear(marketHashName);
  const special = inferSpecial(marketHashName);
  const tier = marketHashName.startsWith('★') || category === 'gloves'
    ? 5
    : rarityToTier(rarity);
  const commodity = wear === 'N/A'
    || ['containers', 'capsules', 'stickers', 'graffiti'].includes(category);
  const collection = pickRawCollectionName(raw);

  return {
    assetid: `catalog-${raw.classid || raw.nameid || marketHashName}`,
    marketHashName,
    name: stripWear(marketHashName),
    wear,
    price: null,
    value: null,
    basis: null,
    pnl: 0,
    pnlPct: 0,
    qty: 1,
    tier,
    rarity,
    category,
    special,
    type,
    collection,
    collectionSlug: collection ? collectionNameToSlug(collection) : null,
    sellListings: 0,
    commodity,
    marketable: true,
    tradable: true,
    priceProvider: 'csmarketapi',
    marketUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`,
    iconUrl: raw.cloudflare_icon_url || raw.akamai_icon_url || null,
    spark: makeSpark(null, seed),
  };
}

function pickCSMarketListingPrice(listing) {
  if (!listing) return null;
  for (const candidate of [listing.min_price, listing.median_price, listing.mean_price]) {
    if (Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return null;
}

// Aggregate a CSMarketAPI listings payload into a Steam-comparable price.
// Only STEAMCOMMUNITY rows are accepted — third-party mins (Buff/Skinport/…) are
// typically 20–40% below Steam ask and must not drive portfolio valuation.
function aggregateCSMarketListing(listings) {
  if (!Array.isArray(listings) || !listings.length) return null;

  const steam = listings.find((row) => row.market === 'STEAMCOMMUNITY');
  const steamPrice = pickCSMarketListingPrice(steam);
  if (!Number.isFinite(steamPrice)) return null;

  return {
    price: steamPrice,
    medianPrice: Number.isFinite(steam.median_price) ? steam.median_price : steamPrice,
    sellListings: Number(steam.listings) || 0,
  };
}

async function getCSMarketListingPrice(marketHashName, currency = 'usd') {
  if (!process.env.CSMARKET_API_KEY) return null;

  const normalizedCurrency = normalizeCurrency(currency).toUpperCase();
  // v2: only STEAMCOMMUNITY aggregates are stored (see aggregateCSMarketListing).
  const cacheKey = `csmarketapi:listing:steam:${marketHashName}:${normalizedCurrency}`;
  const cached = await getCached(cacheKey, CSMARKET_LISTING_MAX_AGE_MS);
  if (cached) return cached;

  const params = new URLSearchParams({
    market_hash_name: marketHashName,
    currency: normalizedCurrency,
    key: process.env.CSMARKET_API_KEY,
  });
  const json = await fetchJson(`https://api.csmarketapi.com/v1/listings/latest/aggregate?${params}`, {
    timeoutMs: 10000,
  }).catch(() => null);
  if (!json) return null;

  const listings = Array.isArray(json.listings) ? json.listings : [];
  const aggregated = aggregateCSMarketListing(listings);
  if (!aggregated) return null;

  const result = {
    ...aggregated,
    provider: 'csmarketapi',
    currencyCode: normalizedCurrency,
  };
  await setCached(cacheKey, result);
  return result;
}

async function getCSMarketAPIPrice(marketHashName) {
  if (!process.env.CSMARKET_API_KEY) return null;

  const [usd, rub] = await Promise.all([
    getCSMarketListingPrice(marketHashName, 'usd'),
    getCSMarketListingPrice(marketHashName, 'rub'),
  ]);
  if (!Number.isFinite(usd?.price) && !Number.isFinite(usd?.medianPrice)) return null;

  return {
    marketHashName,
    price: usd.price,
    medianPrice: usd.medianPrice,
    priceRub: Number.isFinite(rub?.price) ? rub.price : null,
    medianPriceRub: Number.isFinite(rub?.medianPrice) ? rub.medianPrice : null,
    volume24h: usd.sellListings || null,
    provider: 'csmarketapi',
    currencyCode: 'USD',
    updatedAt: new Date().toISOString(),
  };
}

async function hydrateCSMarketCatalogPrices(items) {
  const resolved = [];
  const rubPerUsdPromise = getSteamRubRate()
    .then((rate) => (Number.isFinite(rate) && rate > 0 ? rate : 78.5))
    .catch(() => 78.5);

  for (let i = 0; i < items.length; i += 6) {
    const batch = items.slice(i, i + 6);
    const pricedBatch = await Promise.all(batch.map(async (item) => {
      if (Number.isFinite(item.price) && item.price > 0) return item;

      const [usd, rub] = await Promise.all([
        getCSMarketListingPrice(item.marketHashName, 'usd'),
        getCSMarketListingPrice(item.marketHashName, 'rub'),
      ]);
      if (!Number.isFinite(usd?.price)) return item;

      const price = usd.price;
      let priceRub = Number.isFinite(rub?.price) ? rub.price : null;
      let medianPriceRub = Number.isFinite(rub?.medianPrice) ? rub.medianPrice : null;
      if (priceRub == null || medianPriceRub == null) {
        const rate = await rubPerUsdPromise;
        if (Number.isFinite(rate) && rate > 0) {
          if (priceRub == null) priceRub = Math.round(price * rate * 100) / 100;
          if (medianPriceRub == null) medianPriceRub = Math.round((usd.medianPrice || price) * rate * 100) / 100;
        }
      }

      return {
        ...item,
        price,
        value: price,
        basis: price,
        priceRub,
        medianPriceRub,
        sellListings: usd.sellListings || item.sellListings,
        priceProvider: 'csmarketapi',
        spark: makeSpark(price, 0),
      };
    }));
    resolved.push(...pricedBatch);
  }

  return resolved;
}

// Collection pages start from the CSMarket dump (no Steam sell_price). Prefer
// CSMarket listings for bulk pages, then Steam search/overview for gaps.
async function hydrateCollectionPrices(items) {
  if (!Array.isArray(items) || !items.length) return items;

  const rubPerUsdPromise = getSteamRubRate()
    .then((rate) => (Number.isFinite(rate) && rate > 0 ? rate : 78.5))
    .catch(() => 78.5);

  const resolved = [];
  for (let i = 0; i < items.length; i += 6) {
    const batch = items.slice(i, i + 6);
    const pricedBatch = await Promise.all(batch.map(async (item) => {
      if (Number.isFinite(item.price) && item.price > 0) return item;

      const usd = await getCSMarketListingPrice(item.marketHashName, 'usd').catch(() => null)
        || await getSteamMarketSearchPrice(item.marketHashName, 'usd').catch(() => null)
        || await getSteamMarketPrice(item.marketHashName, 'usd').catch(() => null);
      if (!Number.isFinite(usd?.price)) return item;

      const price = usd.price;
      const rate = await rubPerUsdPromise;
      const priceRub = Number.isFinite(usd.priceRub)
        ? usd.priceRub
        : Math.round(price * rate * 100) / 100;
      const median = Number.isFinite(usd.medianPrice) ? usd.medianPrice : price;

      return {
        ...item,
        price,
        value: price,
        basis: price,
        priceRub,
        medianPrice: median,
        medianPriceRub: Math.round(median * rate * 100) / 100,
        sellListings: usd.sellListings || usd.volume24h || item.sellListings,
        priceProvider: usd.provider || item.priceProvider,
        spark: makeSpark(price, 0),
      };
    }));
    resolved.push(...pricedBatch);
  }

  return resolved;
}

function sortCatalogItemsServer(items, sort) {
  const sorted = [...items];
  if (sort === 'price-desc') {
    return sorted.sort((a, b) => (Number.isFinite(b.price) ? b.price : -1) - (Number.isFinite(a.price) ? a.price : -1));
  }
  if (sort === 'price-asc') {
    return sorted.sort((a, b) => {
      const left = Number.isFinite(a.price) ? a.price : Number.POSITIVE_INFINITY;
      const right = Number.isFinite(b.price) ? b.price : Number.POSITIVE_INFINITY;
      return left - right;
    });
  }
  if (sort === 'name-asc') {
    return sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
  return sorted.sort((a, b) => (b.sellListings || 0) - (a.sellListings || 0) || String(a.name || '').localeCompare(String(b.name || '')));
}

async function getMarketCatalogFromCSMarketAPI(options = {}) {
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
  const priceSort = sort === 'popular' || sort === 'price-desc' || sort === 'price-asc';

  const rawItems = await getCSMarketAPIItems();
  if (!rawItems.length) {
    throw new Error('CSMarketAPI items dump is empty.');
  }

  const normalized = rawItems.map((item, index) => normalizeCSMarketCatalogItem(item, index));
  let matched = normalized.filter((item) => matchesCatalogFilters(item, filters));

  if (priceSort) {
    const sortPool = matched.slice(0, CSMARKET_CATALOG_PRICE_HYDRATE_CAP);
    const pricedPool = await hydrateCSMarketCatalogPrices(sortPool);
    const pricedByName = new Map(pricedPool.map((item) => [item.marketHashName, item]));
    matched = matched.map((item) => pricedByName.get(item.marketHashName) || item);
  }

  matched = sortCatalogItemsServer(matched, sort);
  const pageItems = await hydrateCSMarketCatalogPrices(matched.slice(offset, offset + pageSize));

  return {
    items: pageItems,
    page,
    pageSize,
    totalCount: normalized.length,
    filteredCount: matched.length,
    hasMore: offset + pageSize < matched.length,
    scanned: matched.length,
    partial: priceSort && matched.length > CSMARKET_CATALOG_PRICE_HYDRATE_CAP,
    provider: 'csmarketapi',
    updatedAt: new Date().toISOString(),
  };
}

async function getMarketCatalogFromSteam(options = {}) {
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
      provider: 'steam-market',
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
    provider: 'steam-market',
    updatedAt: new Date().toISOString(),
  };
}

async function getMarketCatalog(options = {}) {
  const query = String(options.query || '').trim();

  // Name lookup must use Steam: the CSMarketAPI dump can omit stickers/commodities
  // (e.g. "Sticker | Rainbow Route (Holo)" while only "Sticker Slab | ..." is present).
  if (query) {
    try {
      return await getMarketCatalogFromSteam(options);
    } catch (error) {
      console.warn('[catalog] Steam search failed, trying CSMarketAPI:', error.message);
      if (resolveMarketCatalogProvider() === 'csmarketapi') {
        return getMarketCatalogFromCSMarketAPI(options);
      }
      throw error;
    }
  }

  if (resolveMarketCatalogProvider() === 'csmarketapi') {
    try {
      return await getMarketCatalogFromCSMarketAPI(options);
    } catch (error) {
      console.warn('[catalog] CSMarketAPI failed, falling back to Steam:', error.message);
    }
  }
  return getMarketCatalogFromSteam(options);
}

async function hydrateCatalogPrices(items) {
  const resolved = [];
  // Resolve the global RUB/USD ratio once for the whole batch so items that Steam
  // refuses to price in RUB still display a sensible rouble value.
  const rubPerUsdPromise = getSteamRubRate().then((rate) => Number.isFinite(rate) && rate > 0 ? rate : 78.5).catch(() => 78.5);

  for (let i = 0; i < items.length; i += 6) {
    const batch = items.slice(i, i + 6);
    const pricedBatch = await Promise.all(batch.map(async (item) => {
      if (!shouldResolveExactCatalogPrice(item)) return item;

      // Steam search already returns sell_price; skip priceoverview (rate-limited) for autocomplete speed.
      if (Number.isFinite(item.price) && item.price > 0 && item.priceProvider === 'steam-market') {
        let priceRub = Number.isFinite(item.priceRub) ? item.priceRub : null;
        let medianPriceRub = Number.isFinite(item.medianPriceRub) ? item.medianPriceRub : null;
        if (priceRub == null || medianPriceRub == null) {
          const rate = await rubPerUsdPromise;
          if (Number.isFinite(rate) && rate > 0) {
            if (priceRub == null) priceRub = Math.round(item.price * rate * 100) / 100;
            if (medianPriceRub == null) medianPriceRub = priceRub;
          }
        }
        return { ...item, priceRub, medianPriceRub };
      }

      // Fetch USD and RUB in parallel so the UI shows exact Steam prices for each currency.
      const [exactUsd, exactRub] = await Promise.all([
        getSteamMarketPrice(item.marketHashName, 'usd').catch(() => null),
        getSteamMarketPrice(item.marketHashName, 'rub').catch(() => null),
      ]);
      if (!Number.isFinite(exactUsd?.price)) return item;

      const nextPrice = exactUsd.price;
      const prevPrice = Number.isFinite(item.price) && item.price > 0 ? item.price : null;
      const spark = prevPrice && Array.isArray(item.spark) && item.spark.length
        ? item.spark.map((point) => Math.max(0.01, point * (nextPrice / prevPrice)))
        : item.spark;

      // Steam often returns null for RUB on certain items (region restriction); fall back to FX.
      let priceRub = Number.isFinite(exactRub?.price) ? exactRub.price : null;
      let medianPriceRub = Number.isFinite(exactRub?.medianPrice) ? exactRub.medianPrice : null;
      if (priceRub == null || medianPriceRub == null) {
        const rate = await rubPerUsdPromise;
        if (Number.isFinite(rate) && rate > 0) {
          if (priceRub == null) priceRub = Math.round(nextPrice * rate * 100) / 100;
          if (medianPriceRub == null && Number.isFinite(exactUsd?.medianPrice)) {
            medianPriceRub = Math.round(exactUsd.medianPrice * rate * 100) / 100;
          }
        }
      }

      return {
        ...item,
        price: nextPrice,
        value: nextPrice,
        basis: nextPrice,
        priceRub,
        medianPriceRub,
        priceProvider: exactUsd.provider || item.priceProvider,
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
    item.collection,
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

// ───────────────────────────────────────────────────
//  Bulk price lists from third-party marketplaces.
//  Each marketplace publishes a full snapshot we cache and index by
//  market_hash_name, so per-item lookups don't hammer their APIs.
// ───────────────────────────────────────────────────

async function getMarketCsgoPriceList() {
  const key = 'pricelist:marketcsgo';
  const cached = await getCached(key, BULK_PRICELIST_MAX_AGE_MS);
  if (cached) return cached;

  const json = await fetchJson('https://market.csgo.com/api/v2/prices/USD.json', { timeoutMs: 25000 }).catch(() => null);
  const rows = Array.isArray(json?.items) ? json.items : [];
  const map = {};
  for (const row of rows) {
    // Market.CSGO already returns plain decimal strings (e.g. "30.134"); Number() avoids
    // parseMoney's thousands-separator heuristics that would mis-read "30.134" as 30134.
    const price = Number(row.price);
    if (row.market_hash_name && Number.isFinite(price)) {
      map[row.market_hash_name] = { price, volume: Number(row.volume) || null };
    }
  }
  if (Object.keys(map).length) await setCached(key, map);
  return map;
}

async function getSkinportPriceList() {
  const key = 'pricelist:skinport';
  const cached = await getCached(key, BULK_PRICELIST_MAX_AGE_MS);
  if (cached) return cached;

  const json = await fetchJson('https://api.skinport.com/v1/items?app_id=730&currency=USD', {
    timeoutMs: 25000,
    headers: { 'Accept-Encoding': 'br' },
  }).catch(() => null);
  const rows = Array.isArray(json) ? json : [];
  const map = {};
  for (const row of rows) {
    const price = Number(row.min_price ?? row.suggested_price);
    if (row.market_hash_name && Number.isFinite(price)) {
      map[row.market_hash_name] = { price, volume: Number(row.quantity) || null };
    }
  }
  if (Object.keys(map).length) await setCached(key, map);
  return map;
}

async function getLisSkinsPriceList() {
  const key = 'pricelist:lisskins';
  const cached = await getCached(key, BULK_PRICELIST_MAX_AGE_MS);
  if (cached) return cached;

  const rows = await fetchJson('https://lis-skins.com/market_export_json/csgo.json', { timeoutMs: 25000 }).catch(() => null);
  const list = Array.isArray(rows) ? rows : [];
  const map = {};
  for (const row of list) {
    const price = Number(row.price ?? row.unlocked_price);
    if (row.name && Number.isFinite(price)) {
      map[row.name] = { price, volume: Number(row.count) || null, url: row.url || null };
    }
  }
  if (Object.keys(map).length) await setCached(key, map);
  return map;
}

function buildMarketplaceUrl(provider, marketHashName) {
  const enc = encodeURIComponent(marketHashName);
  switch (provider) {
    case 'steam': return `https://steamcommunity.com/market/listings/730/${enc}`;
    case 'skinport': return `https://skinport.com/market?search=${enc}`;
    case 'csgomarket': return `https://market.csgo.com/en/?search=${enc}`;
    case 'lisskins': return `https://lis-skins.com/market/csgo/?query=${enc}`;
    case 'csfloat': return `https://csfloat.com/search?market_hash_name=${enc}`;
    case 'csmoney': return `https://cs.money/csgo/store/?search=${enc}`;
    case 'buff163': return `https://buff.163.com/market/csgo#tab=selling&search=${enc}`;
    default: return null;
  }
}

// Third-party marketplaces quote USD; Steam has native RUB. Use CBR for non-Steam RUB display.
async function getItemOffers(marketHashName, currency = 'usd') {
  const [steamUsd, steamRub, skinportList, csgomarketList, lisskinsList, csfloat, lisskinsUsdApi, steamRate, marketRate] = await Promise.all([
    getSteamMarketPrice(marketHashName, 'usd').catch(() => null),
    getSteamMarketPrice(marketHashName, 'rub').catch(() => null),
    getSkinportPriceList().catch(() => ({})),
    getMarketCsgoPriceList().catch(() => ({})),
    getLisSkinsPriceList().catch(() => ({})),
    getCSFloatPrice(marketHashName).catch(() => null),
    getLisSkinsPrice(marketHashName).catch(() => null),
    getSteamRubRate().catch(() => null),
    getMarketUsdRubRate().catch(() => null),
  ]);

  const steamRubPerUsd = Number.isFinite(steamRate) && steamRate > 0 ? steamRate : null;
  const marketRubPerUsd = Number.isFinite(marketRate) && marketRate > 0 ? marketRate : steamRubPerUsd;
  const toSteamRub = (usd) => Number.isFinite(usd) && steamRubPerUsd
    ? Math.round(usd * steamRubPerUsd * 100) / 100
    : null;
  const toMarketRub = (usd) => Number.isFinite(usd) && marketRubPerUsd
    ? Math.round(usd * marketRubPerUsd * 100) / 100
    : null;
  const lisskinsEntry = lisskinsList[marketHashName];
  const lisskinsPrice = Number.isFinite(lisskinsUsdApi?.price)
    ? lisskinsUsdApi.price
    : (lisskinsEntry?.price ?? null);
  const lisskinsUrl = lisskinsEntry?.url || buildMarketplaceUrl('lisskins', marketHashName);

  const offers = [
    {
      provider: 'steam',
      label: 'Steam Market',
      price: Number.isFinite(steamUsd?.price) ? steamUsd.price : null,
      priceRub: Number.isFinite(steamRub?.price) ? steamRub.price : toSteamRub(steamUsd?.price),
    },
    {
      provider: 'skinport',
      label: 'Skinport',
      price: skinportList[marketHashName]?.price ?? null,
      priceRub: toMarketRub(skinportList[marketHashName]?.price),
    },
    {
      provider: 'csgomarket',
      label: 'Market.CSGO',
      price: csgomarketList[marketHashName]?.price ?? null,
      priceRub: toMarketRub(csgomarketList[marketHashName]?.price),
    },
    {
      provider: 'lisskins',
      label: 'LIS-Skins',
      price: lisskinsPrice,
      priceRub: toMarketRub(lisskinsPrice),
      url: lisskinsUrl,
    },
    {
      provider: 'csfloat',
      label: 'CSFloat',
      price: Number.isFinite(csfloat?.price) ? csfloat.price : null,
      priceRub: toMarketRub(csfloat?.price),
    },
    {
      provider: 'csmoney',
      label: 'CS.Money',
      price: null,
      priceRub: null,
    },
    {
      provider: 'buff163',
      label: 'Buff163',
      price: null,
      priceRub: null,
    },
  ].map((offer) => ({
    ...offer,
    currencyCode: 'USD',
    url: offer.url || buildMarketplaceUrl(offer.provider, marketHashName),
    hasPrice: Number.isFinite(offer.price),
  }));

  // Cheapest priced offer first, link-only offers last.
  offers.sort((a, b) => {
    if (a.hasPrice && b.hasPrice) return a.price - b.price;
    return a.hasPrice ? -1 : b.hasPrice ? 1 : 0;
  });

  return {
    marketHashName,
    offers,
    steamRubRate: steamRubPerUsd,
    marketRubRate: marketRubPerUsd,
    updatedAt: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────
//  Per-quality variants (Factory New … Battle-Scarred, with StatTrak™).
// ───────────────────────────────────────────────────

function splitMarketHashName(marketHashName) {
  const name = String(marketHashName || '');
  const isStatTrak = /^StatTrak™\s/.test(name);
  const isSouvenir = /^Souvenir\s/.test(name);
  const wearMatch = name.match(/\s\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i);
  const wearLabel = wearMatch ? wearMatch[1] : null;
  const core = name
    .replace(/^StatTrak™\s/, '')
    .replace(/^Souvenir\s/, '')
    .replace(/\s\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, '');
  return { core, wearLabel, isStatTrak, isSouvenir, hasWear: Boolean(wearLabel) };
}

function buildVariantName(core, wearLabel, { stattrak = false, souvenir = false } = {}) {
  const prefix = stattrak ? 'StatTrak™ ' : souvenir ? 'Souvenir ' : '';
  return `${prefix}${core} (${wearLabel})`;
}

async function getItemVariants(marketHashName, currency = 'usd') {
  const parsed = splitMarketHashName(marketHashName);
  if (!parsed.hasWear) {
    return { marketHashName, base: parsed.core, hasWear: false, stattrak: false, variants: [] };
  }

  const stattrak = parsed.isStatTrak;
  const souvenir = parsed.isSouvenir;
  const rate = await getSteamRubRate().catch(() => null);
  const rubPerUsd = Number.isFinite(rate) && rate > 0 ? rate : null;

  const variants = await Promise.all(WEAR_TIERS.map(async (tier) => {
    const name = buildVariantName(parsed.core, tier.label, { stattrak, souvenir });
    const [usd, rub] = await Promise.all([
      getSteamMarketPrice(name, 'usd').catch(() => null),
      getSteamMarketPrice(name, 'rub').catch(() => null),
    ]);
    const price = Number.isFinite(usd?.price) ? usd.price : null;
    const priceRub = Number.isFinite(rub?.price)
      ? rub.price
      : (Number.isFinite(price) && rubPerUsd ? Math.round(price * rubPerUsd * 100) / 100 : null);
    return {
      wear: tier.code,
      wearLabel: tier.label,
      marketHashName: name,
      price,
      priceRub,
      exists: Number.isFinite(price),
      active: name === marketHashName,
    };
  }));

  return {
    marketHashName,
    base: parsed.core,
    hasWear: true,
    stattrak,
    souvenir,
    steamRubRate: rubPerUsd,
    variants,
  };
}

// History overlay across several wear variants — one line per quality, like Steam.
async function getMultiWearHistory(marketHashNames, days = 30, options = {}) {
  const names = (Array.isArray(marketHashNames) ? marketHashNames : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean)
    .slice(0, 5);

  const series = await Promise.all(names.map(async (name) => {
    const parsed = splitMarketHashName(name);
    const tier = WEAR_TIERS.find((w) => w.label === parsed.wearLabel);
    const history = await getPriceHistory(name, days, options).catch(() => null);
    return {
      marketHashName: name,
      wear: tier?.code || null,
      wearLabel: parsed.wearLabel || null,
      currency: history?.currency || 'USD',
      provider: history?.provider || 'none',
      data: history?.data || [],
    };
  }));

  return { series, updatedAt: new Date().toISOString() };
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
  getPortfolioPrices,
  getPriceHistory,
  getTickerItems,
  getTopMovers,
  getMarketOverview,
  getPeriodMovers,
  getCases,
  getMarketCatalog,
  getSteamMarketPrice,
  getSteamMarketIcon,
  getSteamRubRate,
  getSteamCnyRate,
  getSteamCurrencyRatio,
  getItemOffers,
  getItemVariants,
  getMultiWearHistory,
  rarityToTier,
  getCSMarketAPIItems,
  normalizeCSMarketCatalogItem,
  hydrateCSMarketCatalogPrices,
  hydrateCollectionPrices,
};
