const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { getPortfolio, getPublicManualPortfolio, isPublicManualShareId } = require('./portfolio');
const { resolveSteamProfileInput } = require('./steam');

const WIDTH = 1200;
const HEIGHT = 630;
const GREEN = '#5ee0a0';
const RED = '#ff5a3d';
const CACHE_MS = 2 * 60 * 1000;
const CACHE_MAX = 40;

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_FILES = [
  path.join(FONT_DIR, 'Unbounded-ExtraBold.ttf'),
  path.join(FONT_DIR, 'Unbounded-Medium.ttf'),
  path.join(FONT_DIR, 'JetBrainsMono-Medium.ttf'),
];

const pngCache = new Map();

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CURRENCY = {
  usd: { locale: 'en-US', currency: 'USD' },
  rub: { locale: 'ru-RU', currency: 'RUB' },
  cny: { locale: 'zh-CN', currency: 'CNY' },
};

function formatMoney(value, currencyKey) {
  const meta = CURRENCY[currencyKey] || CURRENCY.usd;
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: meta.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function signedMoney(value, currencyKey) {
  const amount = Number(value) || 0;
  const body = formatMoney(amount, currencyKey);
  return amount >= 0 ? `+${body}` : body;
}

function formatPct(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0.00%';
  const body = `${Math.abs(amount).toFixed(2)}%`;
  return amount >= 0 ? `+${body}` : `−${body}`;
}

function pctFontSize(label) {
  const len = [...String(label)].length;
  if (len > 10) return 86;
  if (len > 8) return 108;
  return 132;
}

function sparkPath(values, x, y, w, h) {
  if (!Array.isArray(values) || values.length < 2) return { line: '', area: '' };
  const min = Math.min(...values) * 0.98;
  const max = Math.max(...values) * 1.02;
  const range = max - min || 1;
  const last = values.length - 1;
  const pts = values.map((value, i) => {
    const px = x + (i / last) * w;
    const py = y + h - ((value - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
  });
  const line = pts.join(' ');
  return { line, area: `${line} L ${(x + w).toFixed(1)} ${(y + h).toFixed(1)} L ${x.toFixed(1)} ${(y + h).toFixed(1)} Z` };
}

function historySeries(portfolio) {
  const raw = Array.isArray(portfolio?.history)
    ? portfolio.history
    : (Array.isArray(portfolio?.history?.points) ? portfolio.history.points : []);
  const values = raw
    .map((point) => (typeof point === 'number' ? point : Number(point?.value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.slice(-60);
}

function sellableValue(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const qty = Number(item?.marketableQty) || 0;
    if (qty <= 0) return sum;
    const unit = Number.isFinite(item.value) ? item.value : 0;
    return sum + unit * qty;
  }, 0);
}

function summarizeShareStats(portfolio) {
  return {
    value: Number(portfolio?.totalValue) || 0,
    cost: Number(portfolio?.totalBasis) || 0,
    pnl: Number(portfolio?.pnl) || 0,
    pnlPct: Number(portfolio?.pnlPct) || 0,
    itemsCount: Number(portfolio?.totalInventoryCount) || 0,
    sellable: sellableValue(portfolio?.items),
    series: historySeries(portfolio),
    currency: 'usd',
  };
}

function parseShareCard(raw) {
  const token = String(raw || '').trim();
  if (!token || token.length > 4000) return null;
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const data = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    const num = (value) => {
      const amount = Number(value);
      return Number.isFinite(amount) ? amount : 0;
    };
    const currency = String(data.y || data.ccy || 'usd').toLowerCase();
    return {
      value: num(data.v),
      pnl: num(data.p),
      pnlPct: num(data.r),
      cost: num(data.c),
      itemsCount: Math.max(0, Math.round(num(data.n))),
      sellable: num(data.s),
      series: Array.isArray(data.h) ? data.h.map(num).slice(0, 60) : [],
      currency: CURRENCY[currency] ? currency : 'usd',
    };
  } catch {
    return null;
  }
}

function renderShareCardPng(token) {
  const stats = parseShareCard(token);
  if (!stats) return null;
  return renderPnlCardPng(stats);
}

async function loadSharePortfolio(profileInput) {
  const profile = String(profileInput || '').trim();
  if (!profile) {
    const err = new Error('Steam profile URL is required.');
    err.status = 400;
    err.code = 'missing_profile_url';
    throw err;
  }
  if (isPublicManualShareId(profile)) {
    return getPublicManualPortfolio(profile);
  }
  const steamId = await resolveSteamProfileInput(profile);
  return getPortfolio(steamId, {
    force: false,
    includeDesktop: false,
    activitySource: 'public-diff',
  });
}

function buildCardSvg(stats) {
  const up = (Number(stats.pnl) || 0) >= 0;
  const accent = up ? GREEN : RED;
  const pct = formatPct(stats.pnlPct);
  const fontSize = pctFontSize(pct);
  const ccy = stats.currency || 'usd';
  const spark = sparkPath(stats.series, 48, 268, 1104, 168);
  const fillId = up ? 'gfill' : 'rfill';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="skins" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="42%" stop-color="#d8dde6"/>
      <stop offset="52%" stop-color="#7d8491"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="head" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff5fb0"/>
      <stop offset="44%" stop-color="#ff1684"/>
      <stop offset="54%" stop-color="#a20f58"/>
      <stop offset="100%" stop-color="#ff4aa3"/>
    </linearGradient>
    <linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glowPnl" cx="50%" cy="46%" r="42%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowPink" cx="88%" cy="92%" r="38%">
      <stop offset="0%" stop-color="#ff1684" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#ff1684" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(255,255,255,0.035)" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="#050608"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowPink)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowPnl)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)" opacity="0.45"/>

  ${spark.area ? `<path d="${spark.area}" fill="url(#${fillId})"/>` : ''}
  ${spark.line ? `<path d="${spark.line}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}

  <g transform="translate(48, 58)">
    <g transform="skewX(-8)">
      <text font-family="Unbounded" font-weight="800" font-size="22" letter-spacing="-0.4">
        <tspan fill="url(#skins)">SKINS</tspan>
        <tspan dx="4" fill="rgba(255,255,255,0.45)" font-weight="500">/</tspan>
        <tspan dx="4" fill="url(#head)">HEAD</tspan>
      </text>
    </g>
    <text x="1104" text-anchor="end" y="4" dominant-baseline="hanging" font-family="JetBrains Mono" font-size="12" letter-spacing="1.7" fill="#8b91a3">CS2 PORTFOLIO · ALL TIME</text>
  </g>

  <text x="48" y="168" font-family="JetBrains Mono" font-size="13" letter-spacing="3.6" fill="#8b91a3">ROI</text>
  <text x="48" y="${168 + fontSize * 0.92}" font-family="Unbounded" font-weight="800" font-size="${fontSize}" letter-spacing="${Math.round(fontSize * -0.06)}" fill="${accent}">${escapeXml(pct)}</text>
  <text x="48" y="${168 + fontSize * 0.92 + 42}" font-family="Unbounded" font-weight="500" font-size="28" fill="${accent}">
    ${escapeXml(signedMoney(stats.pnl, ccy))}<tspan dx="12" font-family="JetBrains Mono" font-size="13" letter-spacing="2" fill="#8b91a3">PNL</tspan>
  </text>

  <line x1="48" y1="478" x2="1152" y2="478" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

  <g font-family="JetBrains Mono" font-size="11" letter-spacing="1.8" fill="#5a5f70">
    <text x="48" y="504">VALUE</text>
    <text x="324" y="504">COST</text>
    <text x="600" y="504">ITEMS</text>
    <text x="876" y="504">SELLABLE</text>
  </g>
  <g font-family="Unbounded" font-weight="500" font-size="22" fill="#f6f7fb">
    <text x="48" y="536">${escapeXml(formatMoney(stats.value, ccy))}</text>
    <text x="324" y="536" fill="#8b91a3">${escapeXml(formatMoney(stats.cost, ccy))}</text>
    <text x="600" y="536">${escapeXml(String(Math.round(stats.itemsCount || 0)))}</text>
    <text x="876" y="536">${escapeXml(formatMoney(stats.sellable, ccy))}</text>
  </g>

  <text x="48" y="592" font-family="JetBrains Mono" font-size="12" fill="#5a5f70">skinshead.pro</text>
  <g transform="translate(1008, 576)" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1">
    <rect width="44" height="28" rx="6"/>
    <rect x="52" width="44" height="28" rx="6"/>
    <rect x="104" width="44" height="28" rx="6"/>
    <path d="M8 18 L18 10 L28 14 L36 8" stroke="#ff1684" stroke-width="1.4"/>
    <rect x="62" y="11" width="24" height="6" rx="1" stroke="#8b91a3" stroke-width="1.2"/>
    <path d="M116 16 Q126 6 136 16" stroke="#cdd1dc" stroke-width="1.3"/>
  </g>
</svg>`;
}

function renderPnlCardPng(stats) {
  const svg = buildCardSvg(stats);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      fontFiles: FONT_FILES.filter((file) => fs.existsSync(file)),
      loadSystemFonts: false,
      defaultFontFamily: 'Unbounded',
    },
  });
  return resvg.render().asPng();
}

function cacheGet(key) {
  const hit = pngCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    pngCache.delete(key);
    return null;
  }
  return hit.png;
}

function cacheSet(key, png) {
  if (pngCache.size >= CACHE_MAX) {
    pngCache.delete(pngCache.keys().next().value);
  }
  pngCache.set(key, { png, at: Date.now() });
}

async function renderSharePnlPng(profileInput) {
  const key = String(profileInput || '').trim().toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;
  const portfolio = await loadSharePortfolio(profileInput);
  const png = renderPnlCardPng(summarizeShareStats(portfolio));
  cacheSet(key, png);
  return png;
}

module.exports = {
  WIDTH,
  HEIGHT,
  summarizeShareStats,
  parseShareCard,
  renderPnlCardPng,
  renderShareCardPng,
  renderSharePnlPng,
};
