const { collectionNameToSlug } = require('../../item-slugs');
const {
  getCSMarketAPIItems,
  normalizeCSMarketCatalogItem,
  hydrateCollectionPrices,
} = require('./prices');

const WEAR_PREF = {
  'Factory New': 0,
  'Minimal Wear': 1,
  'Field-Tested': 2,
  'Well-Worn': 3,
  'Battle-Scarred': 4,
};

let indexPromise = null;

function pickCollectionName(raw = {}) {
  return raw.collection
    || raw.sticker_collection
    || raw.graffiti_collection
    || raw.patch_collection
    || null;
}

function baseSkinKey(raw) {
  let base = String(raw.hash_name || raw.market_hash_name || '').trim();
  base = base
    .replace(/^StatTrak™\s+/i, '')
    .replace(/^Souvenir\s+/i, '')
    .replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, '');
  return base.toLowerCase();
}

function pickWearLabel(raw) {
  const exterior = String(raw.exterior || '').trim();
  if (exterior && WEAR_PREF[exterior] != null) return exterior;
  const name = String(raw.market_hash_name || raw.hash_name || '');
  const match = name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i);
  if (!match) return null;
  return Object.keys(WEAR_PREF).find((label) => label.toLowerCase() === match[1].toLowerCase()) || null;
}

function candidateScore(raw) {
  const name = String(raw.market_hash_name || '');
  const isSpecial = /^StatTrak™\s+/i.test(name) || /^Souvenir\s+/i.test(name) ? 1 : 0;
  const wear = pickWearLabel(raw);
  const wearScore = wear && WEAR_PREF[wear] != null ? WEAR_PREF[wear] : 5;
  const hasIcon = raw.cloudflare_icon_url || raw.akamai_icon_url ? 0 : 1;
  return [isSpecial, wearScore, hasIcon];
}

function isBetterCandidate(next, current) {
  const a = candidateScore(next);
  const b = candidateScore(current);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

async function buildCollectionIndex() {
  const rawItems = await getCSMarketAPIItems();
  const bySlug = new Map();
  const byMarketHashName = new Map();
  const repsBySlug = new Map();

  for (const raw of rawItems) {
    const collection = pickCollectionName(raw);
    if (!collection) continue;

    const slug = collectionNameToSlug(collection);
    if (!slug) continue;

    const meta = {
      name: collection,
      slug,
    };
    byMarketHashName.set(raw.market_hash_name, meta);

    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        name: collection,
        slug,
        listingCount: 0,
        skinCount: 0,
      });
      repsBySlug.set(slug, new Map());
    }

    const entry = bySlug.get(slug);
    entry.listingCount += 1;

    const key = baseSkinKey(raw);
    if (!key) continue;
    const reps = repsBySlug.get(slug);
    const current = reps.get(key);
    if (!current || isBetterCandidate(raw, current)) {
      reps.set(key, raw);
    }
  }

  const skinsBySlug = new Map();
  for (const [slug, reps] of repsBySlug.entries()) {
    const skins = [...reps.values()]
      .map((raw, index) => {
        const item = normalizeCSMarketCatalogItem(raw, index);
        return {
          ...item,
          collection: bySlug.get(slug)?.name || item.collection,
          collectionSlug: slug,
        };
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    skinsBySlug.set(slug, skins);
    const entry = bySlug.get(slug);
    if (entry) entry.skinCount = skins.length;
  }

  return { bySlug, byMarketHashName, skinsBySlug };
}

async function getCollectionIndex() {
  if (!indexPromise) {
    indexPromise = buildCollectionIndex().catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

function collectionFromTags(tags = []) {
  if (!Array.isArray(tags) || !tags.length) return null;
  const tag = tags.find((entry) => entry?.category === 'ItemSet');
  if (!tag) return null;
  const name = tag.localized_tag_name || tag.name || null;
  if (!name) return null;
  const slug = collectionNameToSlug(name);
  return slug ? { name, slug } : null;
}

function collectionFromItemFields(item = {}) {
  if (item.collection) {
    const slug = item.collectionSlug || collectionNameToSlug(item.collection);
    return slug ? { name: item.collection, slug } : null;
  }
  return collectionFromTags(item.tags);
}

async function getCollectionForMarketHashName(marketHashName) {
  const name = String(marketHashName || '').trim();
  if (!name) return null;
  const index = await getCollectionIndex();
  return index.byMarketHashName.get(name) || null;
}

async function attachCollections(items) {
  if (!Array.isArray(items) || !items.length) return items;

  const prepared = items.map((item) => {
    const fromItem = collectionFromItemFields(item);
    if (!fromItem) return item;
    return {
      ...item,
      collection: fromItem.name,
      collectionSlug: fromItem.slug,
    };
  });

  const needsCatalog = prepared.some((item) => !item.collection && item.marketHashName);
  if (!needsCatalog) return prepared;

  const index = await getCollectionIndex().catch(() => null);
  if (!index) return prepared;

  return prepared.map((item) => {
    if (item.collection || !item.marketHashName) return item;
    const catalog = index.byMarketHashName.get(item.marketHashName);
    if (!catalog) return item;
    return {
      ...item,
      collection: catalog.name,
      collectionSlug: catalog.slug,
    };
  });
}

async function getCollectionPageData(slug, options = {}) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return null;

  const index = await getCollectionIndex();
  const meta = index.bySlug.get(normalized);
  if (!meta) return null;

  const page = Math.max(1, Math.min(50, Number(options.page) || 1));
  const pageSize = Math.max(8, Math.min(48, Number(options.pageSize) || 24));
  const offset = (page - 1) * pageSize;
  const allSkins = index.skinsBySlug.get(normalized) || [];
  const pageSlice = allSkins.slice(offset, offset + pageSize);
  const pageItems = await hydrateCollectionPrices(pageSlice).catch((error) => {
    console.warn('[collection] price hydrate failed:', error.message);
    return pageSlice;
  });

  return {
    collection: {
      name: meta.name,
      slug: meta.slug,
      skinCount: meta.skinCount,
      listingCount: meta.listingCount,
    },
    items: pageItems,
    page,
    pageSize,
    filteredCount: allSkins.length,
    hasMore: offset + pageSize < allSkins.length,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  pickCollectionName,
  collectionNameToSlug,
  collectionFromTags,
  collectionFromItemFields,
  getCollectionForMarketHashName,
  attachCollections,
  getCollectionPageData,
};
