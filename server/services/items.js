const fs = require('fs/promises');
const path = require('path');
const {
  marketHashNameToSlug,
  slugToMarketHashName,
  parseSlug,
  getCuratedMarketHashNames,
  buildItemSeoMeta,
  SLUG_INDEX,
} = require('../../item-slugs');
const { getPrice, getSteamMarketIcon, getMarketCatalog } = require('./prices');

const SITE_URL = String(process.env.APP_BASE_URL || 'https://skinshead.pro').replace(/\/+$/, '');

async function resolveItemBySlug(slug) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return null;

  const curated = SLUG_INDEX.get(normalized);
  if (curated) return curated;

  const candidate = slugToMarketHashName(normalized);
  if (candidate) {
    const priced = await getPrice(candidate).catch(() => null);
    if (priced && marketHashNameToSlug(priced.marketHashName) === normalized) {
      return priced.marketHashName;
    }
  }

  const parsed = parseSlug(normalized);
  if (parsed?.core) {
    const searchQuery = parsed.core.replace(/-/g, ' ');
    const catalog = await getMarketCatalog({ query: searchQuery, page: 1, pageSize: 100, sort: 'popular' }).catch(() => null);
    const items = catalog?.items || [];
    const exact = items.find((item) => marketHashNameToSlug(item.marketHashName) === normalized);
    if (exact?.marketHashName) return exact.marketHashName;
  }

  return null;
}

async function getItemPageData(slug) {
  const marketHashName = await resolveItemBySlug(slug);
  if (!marketHashName) return null;

  const [priceData, iconData] = await Promise.all([
    getPrice(marketHashName).catch(() => null),
    getSteamMarketIcon(marketHashName).catch(() => null),
  ]);

  const price = Number(priceData?.price);
  const wearMatch = marketHashName.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i);
  const wearLabel = wearMatch?.[1] || null;
  const wear = wearLabel
    ? wearLabel.split(/[- ]/).map((part) => part[0]).join('').toUpperCase()
    : null;
  const item = {
    assetid: `slug-${marketHashNameToSlug(marketHashName)}`,
    marketHashName,
    name: priceData?.name || marketHashName.replace(/\s+\([^)]+\)$/, ''),
    price: Number.isFinite(price) ? price : null,
    iconUrl: iconData?.iconUrl || null,
    marketUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`,
    type: priceData?.type || '',
    wear,
    rarity: priceData?.rarity || null,
    tier: priceData?.tier || null,
    priceProvider: priceData?.provider || null,
    marketable: true,
    qty: 1,
  };

  const seo = {
    ...buildItemSeoMeta({
      marketHashName,
      slug: marketHashNameToSlug(marketHashName),
      price: item.price,
      iconUrl: item.iconUrl,
      siteUrl: SITE_URL,
    }),
    price: item.price,
  };

  return { item, seo };
}

function upsertMetaTag(html, attr, key, value) {
  const escaped = String(value).replace(/"/g, '&quot;');
  const pattern = new RegExp(`<meta\\s+${attr}="${key}"[^>]*>`, 'i');
  const tag = `<meta ${attr}="${key}" content="${escaped}" />`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function upsertLinkTag(html, rel, href) {
  const escaped = String(href).replace(/"/g, '&quot;');
  const pattern = new RegExp(`<link\\s+rel="${rel}"[^>]*>`, 'i');
  const tag = `<link rel="${rel}" href="${escaped}" />`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function injectItemSeo(html, seo) {
  let next = html;
  next = next.replace(/<title>[^<]*<\/title>/i, `<title>${seo.title}</title>`);
  next = upsertMetaTag(next, 'name', 'description', seo.description);
  next = upsertMetaTag(next, 'name', 'robots', 'index, follow, max-image-preview:large');
  next = upsertLinkTag(next, 'canonical', seo.url);
  next = upsertMetaTag(next, 'property', 'og:type', 'product');
  next = upsertMetaTag(next, 'property', 'og:site_name', 'SkinsHead');
  next = upsertMetaTag(next, 'property', 'og:title', seo.title);
  next = upsertMetaTag(next, 'property', 'og:description', seo.description);
  next = upsertMetaTag(next, 'property', 'og:url', seo.url);
  next = upsertMetaTag(next, 'property', 'og:image', seo.ogImage);
  next = upsertMetaTag(next, 'name', 'twitter:card', 'summary_large_image');
  next = upsertMetaTag(next, 'name', 'twitter:title', seo.title);
  next = upsertMetaTag(next, 'name', 'twitter:description', seo.description);
  next = upsertMetaTag(next, 'name', 'twitter:image', seo.ogImage);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: seo.marketHashName,
    description: seo.description,
    url: seo.url,
    image: seo.ogImage,
    brand: { '@type': 'Brand', name: 'Counter-Strike 2' },
    category: 'Video Game Virtual Item',
  };
  if (Number.isFinite(seo.price)) {
    jsonLd.offers = {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: seo.price.toFixed(2),
      availability: 'https://schema.org/InStock',
      url: seo.url,
    };
  }

  const jsonLdTag = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  next = next.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, jsonLdTag);

  const crawlerBlock = `<noscript><div style="max-width:720px;margin:0 auto;padding:32px 24px;font-family:system-ui,sans-serif;line-height:1.6;color:#e8e6e3;background:#0a0c11;"><h1 style="font-size:28px;font-weight:600;margin:0 0 16px;">${seo.marketHashName}</h1><p>${seo.description}</p><p>${seo.descriptionRu}</p></div></noscript>`;
  next = next.replace(/<noscript>[\s\S]*?<\/noscript>/i, crawlerBlock);

  return next;
}

async function renderItemHtml(appFilePath, seo) {
  const html = await fs.readFile(appFilePath, 'utf8');
  return injectItemSeo(html, seo);
}

function buildSitemapXml() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0' },
    ...getCuratedMarketHashNames().map((marketHashName) => ({
      loc: `${SITE_URL}/item/${marketHashNameToSlug(marketHashName)}`,
      priority: '0.8',
    })),
  ];

  const body = urls.map((entry) => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

module.exports = {
  SITE_URL,
  resolveItemBySlug,
  getItemPageData,
  renderItemHtml,
  injectItemSeo,
  buildSitemapXml,
};
