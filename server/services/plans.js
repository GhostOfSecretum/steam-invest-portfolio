const PLANS = [
  {
    id: 'free',
    name: { en: 'Free', ru: 'Бесплатный' },
    amountRub: 0,
    amountUsd: 0,
    periodDays: null,
    price: { en: '0 ₽', ru: '0 ₽' },
    priceNote: { en: 'No payment · forever', ru: 'Без оплаты · навсегда' },
    highlight: false,
    order: 1,
    features: {
      itemDisplayLimit: 1000,
      desktopDownload: false,
      topInvestors: false,
    },
    bullets: {
      en: [
        'Steam OpenID or public profile',
        'Manual portfolio tracking',
        'Live prices, P&L, allocation',
        'Up to 1,000 items displayed',
        'Market explorer, Armory ROI, news',
      ],
      ru: [
        'Steam OpenID или публичный профиль',
        'Ручной портфель',
        'Live-цены, P&L, распределение',
        'До 1 000 предметов в списке',
        'Маркет, Armory ROI, новости',
      ],
    },
    missing: {
      en: [
        'Unlimited inventory display',
        'Desktop app (coming soon)',
        'Top investor accounts tracking',
      ],
      ru: [
        'Безлимитное отображение инвентаря',
        'Desktop-приложение (скоро)',
        'Трекинг топовых аккаунтов инвесторов',
      ],
    },
  },
  {
    id: 'plus',
    name: { en: 'Plus', ru: 'Plus' },
    amountRub: 299,
    amountUsd: 3,
    annualAmountRub: 2990,
    annualAmountUsd: 30,
    periodDays: 30,
    price: { en: '299 ₽ / 30 days', ru: '299 ₽ / 30 дней' },
    priceNote: { en: '≈ $3 · unlimited items + desktop soon', ru: 'безлимит предметов + desktop скоро' },
    highlight: true,
    order: 2,
    features: {
      itemDisplayLimit: null,
      desktopDownload: true,
      topInvestors: false,
    },
    bullets: {
      en: [
        'Everything in Free',
        'Unlimited items displayed',
        'Desktop app for full inventory — coming soon',
        'Хранилища sync — coming soon',
      ],
      ru: [
        'Всё из Free',
        'Безлимитное отображение предметов',
        'Desktop-приложение для полного инвентаря — скоро',
        'Синхронизация Хранилищ — скоро',
      ],
    },
    missing: {
      en: [
        'Top investor accounts tracking',
      ],
      ru: [
        'Трекинг топовых аккаунтов инвесторов',
      ],
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
    price: { en: '499 ₽ / 30 days', ru: '499 ₽ / 30 дней' },
    priceNote: {
      en: '≈ $5 · 7 days free via Telegram · Plus + top investors',
      ru: '7 дней бесплатно за Telegram · всё из Plus + топ-инвесторы',
    },
    trialDays: 7,
    highlight: false,
    order: 3,
    features: {
      itemDisplayLimit: null,
      desktopDownload: true,
      topInvestors: true,
    },
    bullets: {
      en: [
        '7-day free trial via Telegram channel',
        'Everything in Plus',
        'Track top investor accounts',
        'Curated high-value Steam portfolios',
        'Early access to investor watchlists',
      ],
      ru: [
        '7 дней бесплатно за подписку на Telegram-канал',
        'Всё из Plus',
        'Трекинг топовых аккаунтов инвесторов',
        'Подборка ценных Steam-портфелей',
        'Ранний доступ к watchlist инвесторов',
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

function listPlans() {
  return PLANS.slice().sort((a, b) => a.order - b.order);
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
