const { getCached, getCachedEntry, setCached } = require('./cache');
const { getSteamMarketPrice, getSteamRubRate, getSteamMarketIcon } = require('./prices');

const CACHE_KEY = 'armory:roi:v6';
const LAYOUT_CACHE_KEY = 'armory:layout:v1';
const TRACKED_CACHE_KEY = 'armory:tracked:v1';
const CACHE_TTL_MS = 30 * 60 * 1000;
const LAYOUT_TTL_MS = 6 * 60 * 60 * 1000;
const TRACKED_TTL_MS = 6 * 60 * 60 * 1000;
const STEAM_FEE_FACTOR = 0.87;
const USD_PER_STAR = 0.40;
const CSROI_LAYOUT_URL = 'https://csroi.com/pastData/armoryLayout.json';
const CSROI_TRACKED_URL = 'https://csroi.com/pastData/allTrackedCases.json';
const CSROI_FETCH_HEADERS = {
  Accept: 'application/json,text/plain,*/*',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://csroi.com/armory',
};

// Metadata keyed by normalized name. Live rotation comes from CSROI layout;
// catalog only supplies anchors / base EV / optional profitChance.
const ARMORY_CATALOG = [
  {
    id: 'fever-case',
    name: 'Fever Case',
    stars: 2,
    profitChance: null,
    volumeLabel: null,
    anchorMarketHashName: 'Fever Case',
    imageMarketHashName: 'Fever Case',
    imageUrl: null,
    baseAnchorUsd: 0.64,
    baseEvUsd: 0.92,
  },
  {
    id: 'community-stickers-2025',
    name: '2025 Community Sticker Collection',
    aliases: ['2025 Community Stickers'],
    stars: 1,
    profitChance: 13.86,
    volumeLabel: '4M',
    anchorMarketHashName: '2025 Community Sticker Collection',
    imageMarketHashName: 'Sticker | Neon MVP (Lenticular)',
    imageUrl: 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai0ki7VeTHjMmuOHaC619h7cj35VTqVBP4io_fr3IJur2ibap5KfOGAmaC_uBzv-9kWTn9wU1-tj_Xz9msJC2XPVN1DcQmTbIMshe9m9bkNO_j4lOPiY9DzCWoiDQJsHgefWkufw',
    baseAnchorUsd: 0.4,
    baseEvUsd: 0.39,
  },
  {
    id: 'auto-racing-stickers',
    name: 'Auto Racing Sticker Collection',
    aliases: ['Auto Racing Stickers'],
    stars: 1,
    profitChance: null,
    volumeLabel: null,
    anchorMarketHashName: 'Auto Racing Sticker Collection',
    imageMarketHashName: 'Sticker | Burnout (Lenticular)',
    imageUrl: 'https://cdn.csroi.com/stickers/community/auto_racing/lenticular_burnout_png.png',
    baseAnchorUsd: 0.4,
    baseEvUsd: 0.4,
  },
  {
    id: 'fruits-veggies-stickers',
    name: 'Fruits And Veggies Sticker Collection',
    aliases: ['Fruits And Veggies Stickers'],
    stars: 1,
    profitChance: null,
    volumeLabel: null,
    anchorMarketHashName: 'Fruits And Veggies Sticker Collection',
    imageMarketHashName: 'Sticker | Pineapple On Pizza (Lenticular)',
    imageUrl: 'https://cdn.csroi.com/stickers/community/fruits_veggies/lenticular_pineapple_pizza_png.png',
    baseAnchorUsd: 0.4,
    baseEvUsd: 0.4,
  },
  {
    id: 'missing-link-community-charms',
    name: 'Missing Link Community Charms',
    stars: 3,
    profitChance: 14.53,
    volumeLabel: '8M',
    anchorMarketHashName: 'Charm | Lil\' Chirp',
    // CSROI showcase: white ghost charm
    imageMarketHashName: 'Charm | Lil\' Boo',
    imageUrl: 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGI6zwki4Uf_a0IWsPGiE7Fhy-I764WbkThD8i5jp6Ttkv6PhY6dSLfmAHW6exuJ_vupWQjynkBovvC6R1NatdHuTPQAiCJF1Re8KsBOwlda0M7vm7gOMj4kUnC__jysf5ytv4OccEf1yvJT6JNo',
    baseAnchorUsd: 1.2,
    baseEvUsd: 0.98,
  },
  {
    id: 'dr-boom-charms',
    name: 'Dr. Boom Charms',
    stars: 3,
    profitChance: 6.14,
    volumeLabel: '8M',
    anchorMarketHashName: 'Charm | Whittle Guy',
    // CSROI showcase: red grenade / butane charm
    imageMarketHashName: 'Charm | Butane Buddy',
    imageUrl: 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGI6zwki4Uf_a0IWlJ3mY6ls6_4TL7lvYTRT2loLl72xZvvH2PfFuJKLLVj_Ax7d06bg4THi1wElz52iDmN6qJHmRaFVyAsBzW6dU5Yl-Omi4',
    baseAnchorUsd: 1.2,
    baseEvUsd: 0.91,
  },
  {
    id: 'small-arms-charms',
    name: 'Small Arms Charms',
    stars: 3,
    profitChance: 10.26,
    volumeLabel: '8M',
    anchorMarketHashName: 'Charm | Hot Hands',
    // CSROI showcase: golden knife charm
    imageMarketHashName: 'Charm | Whittle Knife',
    imageUrl: 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGI6zwki4Uf_a0IW2MHqH6lhKpcj_6WbwURPOnYLr8ytd6s25Z6tpbqeWCj7Hlr8n5OQ9TX62xUVx4DnUzI76eCmXaQEnXMN2FrEDuhDsm9L5d7S1yNWnbys',
    baseAnchorUsd: 1.2,
    baseEvUsd: 0.83,
  },
  {
    id: 'missing-link-charms',
    name: 'Missing Link Charms',
    stars: 3,
    profitChance: 9.19,
    volumeLabel: '8M',
    anchorMarketHashName: 'Charm | Big Kev',
    // CSROI showcase: orange howling creature
    imageMarketHashName: 'Charm | Hot Howl',
    imageUrl: 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGI6zwki4Uf_a0IWsPGiE7Fhy-I764RbsQiL8l4Xz9Cxc4_ugY5tlL-efQGKTmbxztbJoFnvjkBtw4zjcw9v8ICiTOwcpDpZyF-FYsBO9k4W2Nbn8p1uJTS_m1eQ',
    baseAnchorUsd: 1.2,
    baseEvUsd: 0.81,
  },
  {
    id: 'spy-tech',
    name: 'The Spy Tech Collection',
    aliases: ['Spy Tech Collection'],
    stars: 4,
    profitChance: null,
    volumeLabel: null,
    anchorMarketHashName: 'The Spy Tech Collection',
    imageMarketHashName: 'Glock-18 | Ghost Protocol (Field-Tested)',
    imageUrl: 'https://cdn.csroi.com/default_generated/weapon_glock_glock_ghost_protocol_red_light_png.png',
    baseAnchorUsd: 1.6,
    baseEvUsd: 1.6,
  },
  {
    id: 'arabesque',
    name: 'The Arabesque Collection',
    aliases: ['Arabesque Collection'],
    stars: 4,
    profitChance: null,
    volumeLabel: null,
    anchorMarketHashName: 'The Arabesque Collection',
    imageMarketHashName: 'AK-47 | Jinn (Field-Tested)',
    imageUrl: 'https://cdn.csroi.com/default_generated/weapon_ak47_ak47_jinn_consequence_light_png.png',
    baseAnchorUsd: 1.6,
    baseEvUsd: 1.6,
  },
  {
    id: 'overpass-2024',
    name: 'The Overpass 2024 Collection',
    aliases: ['Overpass 2024 Collection'],
    stars: 4,
    profitChance: 6.24,
    volumeLabel: '1.7Y',
    anchorMarketHashName: 'The Overpass 2024 Collection',
    imageMarketHashName: 'AK-47 | B the Monster (Field-Tested)',
    imageUrl: null,
    baseAnchorUsd: 1.6,
    baseEvUsd: 0.98,
  },
  // Kept for name matching if they rotate back in; not shown unless layout includes them.
  {
    id: 'ak47-aphrodite',
    name: 'AK-47 | Aphrodite',
    stars: 125,
    profitChance: 27,
    volumeLabel: null,
    anchorMarketHashName: 'AK-47 | Aphrodite (Field-Tested)',
    imageMarketHashName: 'AK-47 | Aphrodite (Factory New)',
    baseAnchorUsd: 50,
    baseEvUsd: 50.74,
  },
  {
    id: 'elemental-craft',
    name: 'Elemental Craft Stickers',
    stars: 1,
    profitChance: 12.39,
    volumeLabel: '4M',
    anchorMarketHashName: 'Sticker | Bolt Charge',
    imageMarketHashName: 'Sticker | Bolt Charge',
    baseAnchorUsd: 0.4,
    baseEvUsd: 0.38,
  },
  {
    id: 'sugarface-2',
    name: 'Sugarface 2 Stickers',
    stars: 1,
    profitChance: 19.35,
    volumeLabel: '4M',
    anchorMarketHashName: 'Sticker | Bolt Strike',
    imageMarketHashName: 'Sticker | Bolt Strike',
    baseAnchorUsd: 0.4,
    baseEvUsd: 0.35,
  },
  {
    id: 'sport-field',
    name: 'The Sport & Field Collection',
    aliases: ['Sport & Field Collection'],
    stars: 4,
    profitChance: 5.71,
    volumeLabel: '8M',
    anchorMarketHashName: 'The Sport & Field Collection',
    imageMarketHashName: 'M4A1-S | Solitude (Field-Tested)',
    baseAnchorUsd: 1.6,
    baseEvUsd: 1.37,
  },
  {
    id: 'train-2025',
    name: 'The Train 2025 Collection',
    aliases: ['Train 2025 Collection'],
    stars: 4,
    profitChance: 8.41,
    volumeLabel: '8M',
    anchorMarketHashName: 'The Train 2025 Collection',
    imageMarketHashName: 'AWP | LongDog (Field-Tested)',
    baseAnchorUsd: 1.6,
    baseEvUsd: 1.26,
  },
];

const CATALOG_BY_KEY = buildCatalogIndex(ARMORY_CATALOG);

function buildCatalogIndex(catalog) {
  const map = new Map();
  for (const entry of catalog) {
    map.set(normalizeRewardKey(entry.name), entry);
    for (const alias of entry.aliases || []) {
      map.set(normalizeRewardKey(alias), entry);
    }
  }
  return map;
}

function normalizeRewardKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\bsticker collections?\b/g, 'stickers')
    .replace(/\bcollections?\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'reward';
}

function parseStarsLabel(label) {
  const match = String(label || '').match(/(\d+)/);
  if (!match) return null;
  const stars = Number(match[1]);
  return Number.isFinite(stars) && stars > 0 ? stars : null;
}

function parseLayoutRows(raw) {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.rows)
      ? raw.rows
      : Array.isArray(raw?.layout)
        ? raw.layout
        : null;
  if (!Array.isArray(rows)) return [];

  const items = [];
  const seen = new Set();
  for (const row of rows) {
    for (const entry of row?.items || []) {
      const name = String(entry?.name || '').trim();
      if (!name) continue;
      const key = normalizeRewardKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        name,
        stars: parseStarsLabel(entry.starsLabel),
        releaseTimestamp: Number.isFinite(entry.releaseTimestamp) ? entry.releaseTimestamp : null,
        backupImage: entry.backupImage || null,
      });
    }
  }
  return items;
}

async function fetchCsroiJson(url, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: CSROI_FETCH_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`CSROI returned HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCsroiLayoutJson() {
  return fetchCsroiJson(CSROI_LAYOUT_URL, 12000);
}

function isArmoryTrackedRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.DropType === 'Armory') return true;
  if (row.CollectionType === 'Armory') return true;
  return false;
}

function indexTrackedStats(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!isArmoryTrackedRow(row)) continue;
    const name = String(row.Name || '').trim();
    if (!name) continue;
    const key = normalizeRewardKey(name);
    const existing = map.get(key);
    // Prefer explicit Armory drop rows when duplicates exist.
    if (!existing || (existing.DropType !== 'Armory' && row.DropType === 'Armory')) {
      map.set(key, row);
    }
  }
  return map;
}

function computeEvFromRarity(row) {
  const chances = row?.RarityChances;
  const values = row?.RarityValuesSteam;
  if (!chances || !values || typeof chances !== 'object' || typeof values !== 'object') return null;
  let ev = 0;
  let used = false;
  for (const [tier, chance] of Object.entries(chances)) {
    const avg = Number(values[tier]);
    const p = Number(chance);
    if (!Number.isFinite(p) || !Number.isFinite(avg)) continue;
    ev += p * avg;
    used = true;
  }
  return used ? ev : null;
}

function statsFromTrackedRow(row, stars) {
  if (!row) return null;
  const starCostUsd = Number.isFinite(Number(row.CollectionPriceSteam))
    ? Number(row.CollectionPriceSteam)
    : (Number(stars) || 0) * USD_PER_STAR;
  const keyCostUsd = Number(row.KeyCostSteam) || 0;
  const roiRatio = Number(row.SteamROI);
  const profitRatio = Number(row.ProfitSteam);
  let evUsd = computeEvFromRarity(row);
  if (!Number.isFinite(evUsd) && Number.isFinite(roiRatio)) {
    evUsd = roiRatio * (starCostUsd + keyCostUsd);
  }
  if (!Number.isFinite(evUsd)) return null;

  return {
    evUsd,
    starCostUsd,
    keyCostUsd,
    roi: Number.isFinite(roiRatio) ? Math.round(roiRatio * 10000) / 100 : null,
    profitChance: Number.isFinite(profitRatio) ? Math.round(profitRatio * 10000) / 100 : null,
    updatedAt: row.UpdatedAt || null,
  };
}

async function getArmoryTrackedStats() {
  const cached = await getCached(TRACKED_CACHE_KEY, TRACKED_TTL_MS);
  if (cached?.byKey && typeof cached.byKey === 'object') {
    return { ...cached, cached: true, stale: false };
  }

  try {
    const rows = await fetchCsroiJson(CSROI_TRACKED_URL, 60000);
    const index = indexTrackedStats(rows);
    if (!index.size) throw new Error('CSROI tracked Armory stats were empty.');
    const byKey = Object.fromEntries(index.entries());
    const value = {
      byKey,
      source: 'csroi-tracked',
      fetchedAt: new Date().toISOString(),
      count: index.size,
    };
    await setCached(TRACKED_CACHE_KEY, value);
    return { ...value, cached: false, stale: false };
  } catch (error) {
    const stale = await getCachedEntry(TRACKED_CACHE_KEY);
    if (stale?.value?.byKey) {
      return {
        ...stale.value,
        cached: true,
        stale: true,
        message: error.message || 'Failed to refresh CSROI Armory stats.',
      };
    }
    return {
      byKey: {},
      source: 'none',
      fetchedAt: null,
      cached: false,
      stale: false,
      message: error.message || 'Failed to load CSROI Armory stats.',
    };
  }
}

async function getArmoryLayout() {
  const cached = await getCached(LAYOUT_CACHE_KEY, LAYOUT_TTL_MS);
  if (cached?.items?.length) {
    return { ...cached, cached: true, stale: false };
  }

  try {
    const raw = await fetchCsroiLayoutJson();
    const items = parseLayoutRows(raw);
    if (!items.length) throw new Error('CSROI layout was empty.');
    const value = {
      items,
      source: 'csroi-layout',
      fetchedAt: new Date().toISOString(),
    };
    await setCached(LAYOUT_CACHE_KEY, value);
    return { ...value, cached: false, stale: false };
  } catch (error) {
    const stale = await getCachedEntry(LAYOUT_CACHE_KEY);
    if (stale?.value?.items?.length) {
      return {
        ...stale.value,
        cached: true,
        stale: true,
        message: error.message || 'Failed to refresh Armory layout.',
      };
    }
    return {
      items: [],
      source: 'catalog-fallback',
      fetchedAt: null,
      cached: false,
      stale: false,
      message: error.message || 'Failed to load Armory layout.',
    };
  }
}

function guessAnchorMarketHashName(layoutName) {
  const name = String(layoutName || '').trim();
  if (!name) return name;
  if (/case$/i.test(name)) return name;
  if (/charm/i.test(name)) return name;
  if (/sticker/i.test(name)) return name;
  if (/^the\s+/i.test(name)) return name;
  if (/collection$/i.test(name)) return `The ${name.replace(/^the\s+/i, '')}`;
  return name;
}

function catalogFallbackRewards() {
  // Prefer currently known active-ish rewards if layout is unavailable.
  const preferred = [
    'fever-case',
    'dr-boom-charms',
    'missing-link-community-charms',
    'missing-link-charms',
    'small-arms-charms',
    'spy-tech',
    'arabesque',
    'overpass-2024',
    'auto-racing-stickers',
    'fruits-veggies-stickers',
    'community-stickers-2025',
  ];
  const byId = new Map(ARMORY_CATALOG.map((entry) => [entry.id, entry]));
  return preferred.map((id) => byId.get(id)).filter(Boolean).map((entry) => ({
    ...entry,
    daysRemaining: null,
    backupImage: null,
  }));
}

function resolveRewards(layout) {
  const layoutItems = layout?.items || [];
  if (!layoutItems.length) {
    return {
      rewards: catalogFallbackRewards(),
      rotationSource: 'catalog-fallback',
      stale: Boolean(layout?.stale),
      message: layout?.message || 'Using catalog fallback because Armory layout is unavailable.',
    };
  }

  const rewards = layoutItems.map((layoutItem) => {
    const catalog = CATALOG_BY_KEY.get(normalizeRewardKey(layoutItem.name));
    const stars = layoutItem.stars || catalog?.stars || 1;
    const starCostUsd = stars * USD_PER_STAR;

    if (catalog) {
      return {
        id: catalog.id,
        name: layoutItem.name,
        stars,
        profitChance: catalog.profitChance ?? null,
        daysRemaining: null,
        volumeLabel: catalog.volumeLabel ?? null,
        anchorMarketHashName: catalog.anchorMarketHashName,
        imageMarketHashName: catalog.imageMarketHashName || catalog.anchorMarketHashName || null,
        imageUrl: catalog.imageUrl || null,
        baseAnchorUsd: catalog.baseAnchorUsd,
        baseEvUsd: catalog.baseEvUsd,
        backupImage: layoutItem.backupImage || null,
      };
    }

    const anchor = guessAnchorMarketHashName(layoutItem.name);
    return {
      id: slugify(layoutItem.name),
      name: layoutItem.name,
      stars,
      profitChance: null,
      daysRemaining: null,
      volumeLabel: null,
      anchorMarketHashName: anchor,
      imageMarketHashName: anchor,
      imageUrl: null,
      baseAnchorUsd: starCostUsd,
      baseEvUsd: starCostUsd,
      backupImage: layoutItem.backupImage || null,
    };
  });

  return {
    rewards,
    rotationSource: layout.source || 'csroi-layout',
    stale: Boolean(layout.stale),
    message: layout.message || null,
  };
}

function normalizeCurrency(value) {
  return String(value || 'usd').toLowerCase() === 'rub' ? 'rub' : 'usd';
}

function toDisplayMoney(usdValue, currency, rubPerUsd) {
  if (!Number.isFinite(usdValue)) return null;
  if (currency === 'rub' && Number.isFinite(rubPerUsd) && rubPerUsd > 0) {
    return Math.round(usdValue * rubPerUsd * 100) / 100;
  }
  return Math.round(usdValue * 100) / 100;
}

async function fetchAnchorPrices(rewards, currency) {
  const uniqueNames = [...new Set(rewards.map((item) => item.anchorMarketHashName).filter(Boolean))];
  const prices = {};
  for (let i = 0; i < uniqueNames.length; i += 3) {
    const batch = uniqueNames.slice(i, i + 3);
    const rows = await Promise.all(batch.map((name) => getSteamMarketPrice(name, currency).catch(() => null)));
    for (const row of rows) {
      if (!row?.marketHashName) continue;
      const value = Number.isFinite(row.medianPrice) ? row.medianPrice : row.price;
      if (Number.isFinite(value)) prices[row.marketHashName] = value;
    }
  }
  return prices;
}

async function fetchIconMap(rewards) {
  // Skip rewards that already have a curated set/collection icon.
  const uniqueNames = [...new Set(
    rewards
      .filter((item) => !item.imageUrl)
      .map((item) => item.imageMarketHashName || item.anchorMarketHashName)
      .filter(Boolean),
  )];
  const icons = {};
  for (let i = 0; i < uniqueNames.length; i += 2) {
    const batch = uniqueNames.slice(i, i + 2);
    const rows = await Promise.all(batch.map((name) => getSteamMarketIcon(name).catch(() => null)));
    batch.forEach((name, index) => {
      if (rows[index]) icons[name] = rows[index];
    });
  }
  return icons;
}

function scaleEvUsd(item, anchorPrices) {
  const anchor = anchorPrices[item.anchorMarketHashName];
  if (Number.isFinite(anchor) && Number.isFinite(item.baseAnchorUsd) && item.baseAnchorUsd > 0) {
    return item.baseEvUsd * (anchor / item.baseAnchorUsd);
  }
  if (Number.isFinite(anchor)) return anchor;
  return item.baseEvUsd;
}

async function buildArmoryPayload(options = {}) {
  const currency = normalizeCurrency(options.currency);
  const rubPerUsd = currency === 'rub'
    ? await getSteamRubRate().catch(() => null)
    : null;

  const [layout, tracked] = await Promise.all([
    getArmoryLayout(),
    getArmoryTrackedStats(),
  ]);
  const { rewards, rotationSource, stale, message } = resolveRewards(layout);
  const trackedByKey = tracked?.byKey || {};

  const needsFallbackPrices = rewards.some((item) => !trackedByKey[normalizeRewardKey(item.name)]);
  const [anchorPrices, iconMap] = await Promise.all([
    needsFallbackPrices ? fetchAnchorPrices(rewards, 'usd') : Promise.resolve({}),
    fetchIconMap(rewards),
  ]);

  const items = rewards.map((item) => {
    const trackedRow = trackedByKey[normalizeRewardKey(item.name)];
    const fromCsroi = statsFromTrackedRow(trackedRow, item.stars);
    const imageKey = item.imageMarketHashName || item.anchorMarketHashName;

    let evUsd;
    let starCostUsd;
    let roi;
    let profitChance;

    if (fromCsroi) {
      evUsd = fromCsroi.evUsd;
      starCostUsd = fromCsroi.starCostUsd;
      roi = fromCsroi.roi;
      profitChance = fromCsroi.profitChance;
    } else {
      evUsd = scaleEvUsd(item, anchorPrices) * STEAM_FEE_FACTOR;
      starCostUsd = item.stars * USD_PER_STAR;
      roi = starCostUsd > 0 ? (evUsd / starCostUsd) * 100 : null;
      if (Number.isFinite(roi)) roi = Math.round(roi * 100) / 100;
      profitChance = item.profitChance;
    }

    return {
      id: item.id,
      name: item.name,
      stars: item.stars,
      profitChance: Number.isFinite(profitChance) ? profitChance : null,
      daysRemaining: item.daysRemaining,
      volumeLabel: item.volumeLabel,
      roi: Number.isFinite(roi) ? roi : null,
      ev: toDisplayMoney(evUsd, currency, rubPerUsd),
      starCost: toDisplayMoney(starCostUsd, currency, rubPerUsd),
      imageUrl: item.imageUrl || iconMap[imageKey] || item.backupImage || null,
      statsSource: fromCsroi ? 'csroi' : 'fallback',
    };
  }).sort((a, b) => (b.roi || 0) - (a.roi || 0));

  items.forEach((item, index) => {
    item.rank = index + 1;
  });

  const csroiCount = items.filter((item) => item.statsSource === 'csroi').length;
  const messages = [message, tracked?.message].filter(Boolean);

  return {
    items,
    currency,
    usdPerStar: USD_PER_STAR,
    pricingSource: csroiCount ? 'csroi-steam' : 'steam',
    rotationSource,
    stale: Boolean(stale || tracked?.stale),
    message: messages.length ? messages.join(' ') : null,
    rubPerUsd: currency === 'rub' ? rubPerUsd : null,
    updatedAt: new Date().toISOString(),
  };
}

async function getArmoryRoi(options = {}) {
  const currency = normalizeCurrency(options.currency);
  const cacheKey = `${CACHE_KEY}:${currency}`;

  const cached = await getCached(cacheKey, CACHE_TTL_MS);
  if (cached) return { ...cached, cached: true };

  const payload = await buildArmoryPayload(options);
  await setCached(cacheKey, payload);
  return { ...payload, cached: false };
}

module.exports = {
  getArmoryRoi,
};
