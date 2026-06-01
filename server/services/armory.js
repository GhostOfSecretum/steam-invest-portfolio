const { getCached, setCached } = require('./cache');
const { getSteamMarketPrice, getSteamRubRate, getSteamMarketIcon } = require('./prices');

const CACHE_KEY = 'armory:roi:v2';
const CACHE_TTL_MS = 30 * 60 * 1000;
const STEAM_FEE_FACTOR = 0.87;
const USD_PER_STAR = 0.40;

const ARMORY_REWARDS = [
  {
    id: 'fever-case',
    name: 'Fever Case',
    stars: 2,
    profitChance: null,
    daysRemaining: null,
    volumeLabel: null,
    anchorMarketHashName: 'Fever Case',
    imageMarketHashName: 'Fever Case',
    baseAnchorUsd: 0.64,
    baseEvUsd: 0.92,
  },
  {
    id: 'ak47-aphrodite',
    name: 'AK-47 | Aphrodite',
    stars: 125,
    profitChance: 27,
    daysRemaining: 28,
    volumeLabel: null,
    anchorMarketHashName: 'AK-47 | Aphrodite (Field-Tested)',
    imageMarketHashName: 'AK-47 | Aphrodite (Factory New)',
    baseAnchorUsd: 50,
    baseEvUsd: 50.74,
  },
  {
    id: 'community-stickers-2025',
    name: '2025 Community Stickers',
    stars: 1,
    profitChance: 13.86,
    volumeLabel: '4M',
    anchorMarketHashName: 'Sticker | Bolt Charge (Foil)',
    imageMarketHashName: 'Sticker | Bolt Charge (Foil)',
    baseAnchorUsd: 0.4,
    baseEvUsd: 0.39,
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
    name: 'Sport & Field Collection',
    stars: 4,
    profitChance: 5.71,
    volumeLabel: '8M',
    anchorMarketHashName: 'The Sport & Field Collection',
    imageMarketHashName: 'M4A1-S | Solitude (Field-Tested)',
    baseAnchorUsd: 1.6,
    baseEvUsd: 1.37,
  },
  {
    id: 'missing-link-community-charms',
    name: 'Missing Link Community Charms',
    stars: 3,
    profitChance: 14.53,
    volumeLabel: '8M',
    anchorMarketHashName: 'Charm | Lil\' Chirp',
    imageMarketHashName: 'Charm | Lil\' Chirp',
    baseAnchorUsd: 1.2,
    baseEvUsd: 0.98,
  },
  {
    id: 'train-2025',
    name: 'Train 2025 Collection',
    stars: 4,
    profitChance: 8.41,
    volumeLabel: '8M',
    anchorMarketHashName: 'The Train 2025 Collection',
    imageMarketHashName: 'AWP | LongDog (Field-Tested)',
    baseAnchorUsd: 1.6,
    baseEvUsd: 1.26,
  },
  {
    id: 'dr-boom-charms',
    name: 'Dr. Boom Charms',
    stars: 3,
    profitChance: 6.14,
    volumeLabel: '8M',
    anchorMarketHashName: 'Charm | Dr. Boom',
    imageMarketHashName: 'Charm | Dr. Boom',
    baseAnchorUsd: 1.2,
    baseEvUsd: 0.91,
  },
  {
    id: 'small-arms-charms',
    name: 'Small Arms Charms',
    stars: 3,
    profitChance: 10.26,
    volumeLabel: '8M',
    anchorMarketHashName: 'Charm | Pocket Pop',
    imageMarketHashName: 'Charm | Pocket Pop',
    baseAnchorUsd: 1.2,
    baseEvUsd: 0.83,
  },
  {
    id: 'missing-link-charms',
    name: 'Missing Link Charms',
    stars: 3,
    profitChance: 9.19,
    volumeLabel: '8M',
    anchorMarketHashName: 'Charm | Lil\' Chirp',
    imageMarketHashName: 'Charm | Lil\' Chirp',
    baseAnchorUsd: 1.2,
    baseEvUsd: 0.81,
  },
  {
    id: 'overpass-2024',
    name: 'Overpass 2024 Collection',
    stars: 1,
    profitChance: 6.24,
    volumeLabel: '1.7Y',
    anchorMarketHashName: 'The Overpass 2024 Collection',
    imageMarketHashName: 'AK-47 | B the Monster (Field-Tested)',
    baseAnchorUsd: 1.6,
    baseEvUsd: 0.98,
  },
];

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

async function fetchAnchorPrices(currency) {
  const uniqueNames = [...new Set(ARMORY_REWARDS.map((item) => item.anchorMarketHashName).filter(Boolean))];
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

async function fetchIconMap() {
  const uniqueNames = [...new Set(
    ARMORY_REWARDS.map((item) => item.imageMarketHashName || item.anchorMarketHashName).filter(Boolean),
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
  return item.baseEvUsd;
}

async function buildArmoryPayload(options = {}) {
  const currency = normalizeCurrency(options.currency);
  const rubPerUsd = currency === 'rub'
    ? await getSteamRubRate().catch(() => null)
    : null;

  const [anchorPrices, iconMap] = await Promise.all([
    fetchAnchorPrices(currency),
    fetchIconMap(),
  ]);

  const items = ARMORY_REWARDS.map((item) => {
    let evUsd = scaleEvUsd(item, anchorPrices) * STEAM_FEE_FACTOR;
    const starCostUsd = item.stars * USD_PER_STAR;
    const roi = starCostUsd > 0 ? (evUsd / starCostUsd) * 100 : null;
    const imageKey = item.imageMarketHashName || item.anchorMarketHashName;

    return {
      id: item.id,
      name: item.name,
      stars: item.stars,
      profitChance: item.profitChance,
      daysRemaining: item.daysRemaining,
      volumeLabel: item.volumeLabel,
      roi: Number.isFinite(roi) ? Math.round(roi * 100) / 100 : null,
      ev: toDisplayMoney(evUsd, currency, rubPerUsd),
      starCost: toDisplayMoney(starCostUsd, currency, rubPerUsd),
      imageUrl: iconMap[imageKey] || null,
    };
  }).sort((a, b) => (b.roi || 0) - (a.roi || 0));

  items.forEach((item, index) => {
    item.rank = index + 1;
  });

  return {
    items,
    currency,
    usdPerStar: USD_PER_STAR,
    pricingSource: 'steam',
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
