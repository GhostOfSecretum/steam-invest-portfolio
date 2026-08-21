const PLANS = [
  {
    id: 'free',
    name: { en: 'Free', ru: 'Бесплатный' },
    amountRub: 0,
    amountUsd: 0,
    periodDays: null,
    price: { en: '$0', ru: '0 ₽' },
    priceNote: { en: 'No payment · forever', ru: 'Без оплаты · навсегда' },
    highlight: false,
    order: 1,
    features: {
      itemDisplayLimit: null,
      desktopDownload: false,
      topInvestors: true,
    },
    bullets: {
      en: [
        'Steam OpenID or public profile',
        'Manual portfolio tracking',
        'Live prices, P&L, allocation',
        'Unlimited items displayed',
        'Top investor accounts',
        'Market explorer, Armory ROI, news',
      ],
      ru: [
        'Steam OpenID или публичный профиль',
        'Ручной портфель',
        'Live-цены, P&L, распределение',
        'Безлимит предметов в списке',
        'Топ-аккаунты инвесторов',
        'Маркет, Armory ROI, новости',
      ],
    },
    missing: {
      en: [
        'Desktop app (coming soon)',
        'Storage sync (coming soon)',
      ],
      ru: [
        'Desktop-приложение (скоро)',
        'Синхронизация Хранилищ (скоро)',
      ],
    },
  },
  {
    id: 'short',
    name: { en: '3 days', ru: '3 дня' },
    amountRub: 100,
    amountUsd: 2.99,
    periodDays: 3,
    price: { en: '$2.99 / 3 days', ru: '100 ₽ / 3 дня' },
    priceNote: { en: 'Card or crypto · desktop for 3 days · no auto-renewal', ru: 'desktop и Хранилища на 3 дня · без автопродления' },
    highlight: true,
    order: 2,
    features: {
      itemDisplayLimit: null,
      desktopDownload: true,
      topInvestors: true,
    },
    bullets: {
      en: [
        'Everything on the website',
        'Desktop app for full inventory — coming soon',
        'Storage sync — coming soon',
        '3 days of access',
        'No auto-renewal',
      ],
      ru: [
        'Весь сайт без ограничений',
        'Desktop-приложение для полного инвентаря — скоро',
        'Синхронизация Хранилищ — скоро',
        'Доступ на 3 дня',
        'Без автопродления',
      ],
    },
    missing: {
      en: [],
      ru: [],
    },
  },
  {
    id: 'plus',
    name: { en: 'Plus', ru: 'Plus' },
    amountRub: 299,
    amountUsd: 7.99,
    annualAmountRub: 2990,
    annualAmountUsd: 72,
    periodDays: 30,
    price: { en: '$7.99 / 30 days', ru: '299 ₽ / 30 дней' },
    priceNote: { en: 'Card or crypto · desktop + Storage soon', ru: 'desktop и Хранилища скоро' },
    highlight: false,
    order: 3,
    features: {
      itemDisplayLimit: null,
      desktopDownload: true,
      topInvestors: true,
    },
    bullets: {
      en: [
        '7 days free on first Steam login',
        'Everything on the website',
        'Desktop app for full inventory — coming soon',
        'Storage sync — coming soon',
      ],
      ru: [
        'Весь сайт без ограничений',
        'Desktop-приложение для полного инвентаря — скоро',
        'Синхронизация Хранилищ — скоро',
      ],
    },
    missing: {
      en: [],
      ru: [],
    },
  },
  {
    id: 'investor',
    name: { en: 'Investor', ru: 'Investor' },
    amountRub: 499,
    amountUsd: 5,
    annualAmountRub: 4990,
    annualAmountUsd: 50,
    periodDays: 30,
    price: { en: '$5 / 30 days', ru: '499 ₽ / 30 дней' },
    priceNote: {
      en: 'RU-only · 7 days via Telegram · desktop + Storage',
      ru: '7 дней бесплатно за Telegram · desktop и Хранилища',
    },
    trialDays: 7,
    highlight: false,
    audience: 'ru',
    order: 4,
    features: {
      itemDisplayLimit: null,
      desktopDownload: true,
      topInvestors: true,
    },
    bullets: {
      en: [
        '7-day free trial via Telegram channel',
        'Everything on the website',
        'Desktop app for full inventory — coming soon',
        'Storage sync — coming soon',
      ],
      ru: [
        '7 дней бесплатно за подписку на Telegram-канал',
        'Весь сайт без ограничений',
        'Desktop-приложение для полного инвентаря — скоро',
        'Синхронизация Хранилищ — скоро',
      ],
    },
    missing: {
      en: [],
      ru: [],
    },
  },
];

const PLAN_BY_ID = Object.fromEntries(PLANS.map((plan) => [plan.id, plan]));
const DEFAULT_PLAN_ID = 'free';

function listPlans(locale) {
  const lang = String(locale || '').toLowerCase().split('-')[0];
  return PLANS.filter((plan) => {
    if (plan.hidden) return false;
    if (plan.audience && lang && plan.audience !== lang) return false;
    return true;
  }).slice().sort((a, b) => a.order - b.order);
}

function getPlan(planId) {
  return PLAN_BY_ID[String(planId || '').trim()] || PLAN_BY_ID[DEFAULT_PLAN_ID];
}

function getPlanFeatures(planId) {
  return { ...getPlan(planId).features };
}

function planAllows(planId, feature) {
  const features = getPlanFeatures(planId);
  return Boolean(features[feature]);
}

function applyItemDisplayLimit(portfolio, planId) {
  const plan = getPlan(planId);
  const limit = plan.features.itemDisplayLimit;
  const totalPieces = Number(portfolio?.totalInventoryCount) || 0;
  const base = {
    ...portfolio,
    plan: plan.id,
    entitlements: { ...plan.features },
    itemDisplayLimit: limit,
    itemsLimited: false,
    itemsHiddenCount: 0,
    visibleInventoryCount: totalPieces,
  };

  if (limit == null || !Array.isArray(portfolio?.items) || totalPieces <= limit) {
    return base;
  }

  let remaining = limit;
  const limitedItems = [];
  for (const item of portfolio.items) {
    if (remaining <= 0) break;
    const qty = Number(item.qty) || 0;
    if (qty <= 0) continue;
    if (qty <= remaining) {
      limitedItems.push(item);
      remaining -= qty;
      continue;
    }
    const ratio = remaining / qty;
    limitedItems.push({
      ...item,
      qty: remaining,
      marketableQty: Math.min(Number(item.marketableQty) || 0, remaining),
      totalValue: Number.isFinite(item.value) ? item.value * remaining : item.totalValue,
      totalBasis: Number.isFinite(item.basis) ? item.basis * remaining : item.totalBasis,
      // Keep spark/leaders untouched; table display uses qty/value.
      _displayTruncated: true,
      _displayRatio: ratio,
    });
    remaining = 0;
  }

  return {
    ...base,
    items: limitedItems,
    itemsLimited: true,
    itemsHiddenCount: Math.max(0, totalPieces - limit),
    visibleInventoryCount: limit,
  };
}

const DOWNLOAD_ARTIFACTS = {
  'mac-arm64': {
    file: 'Steam-Invest-Portfolio-mac-arm64.dmg',
    contentType: 'application/x-apple-diskimage',
  },
  'mac-x64': {
    file: 'Steam-Invest-Portfolio-mac-x64.dmg',
    contentType: 'application/x-apple-diskimage',
  },
  'win-x64': {
    file: 'Steam-Invest-Portfolio-win-x64.exe',
    contentType: 'application/octet-stream',
  },
};

function getDownloadArtifact(key) {
  return DOWNLOAD_ARTIFACTS[String(key || '').trim()] || null;
}

module.exports = {
  DEFAULT_PLAN_ID,
  listPlans,
  getPlan,
  getPlanFeatures,
  planAllows,
  applyItemDisplayLimit,
  getDownloadArtifact,
};
