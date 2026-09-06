const { collectionNameToSlug } = require('../../item-slugs');
const { remember, getCached } = require('./cache');
const {
  getCSMarketAPIItems,
  normalizeCSMarketCatalogItem,
  hydrateCollectionPrices,
} = require('./prices');

const OFFICIAL_COLLECTIONS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json';
const OFFICIAL_COLLECTIONS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OFFICIAL_COLLECTIONS_STALE_MS = 30 * 24 * 60 * 60 * 1000;

const WEAR_PREF = {
  'Factory New': 0,
  'Minimal Wear': 1,
  'Field-Tested': 2,
  'Well-Worn': 3,
  'Battle-Scarred': 4,
};
const WEAR_LABELS = Object.keys(WEAR_PREF);

let indexPromise = null;

function pickCollectionName(raw = {}) {
  return raw.collection
    || raw.sticker_collection
    || raw.graffiti_collection
    || raw.patch_collection
    || null;
}

function collectionKind(raw = {}) {
  if (raw.sticker_collection) return 'stickers';
  if (raw.graffiti_collection) return 'graffiti';
  if (raw.patch_collection) return 'patches';
  return 'skins';
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

function officialSkinCategory(name) {
  const value = String(name || '').toLowerCase();
  if (value.startsWith('sticker |') || value.includes(' sticker |')) return 'stickers';
  if (value.startsWith('sealed graffiti') || value.includes('graffiti')) return 'graffiti';
  if (value.startsWith('patch |')) return 'patches';
  if (value.startsWith('★') || value.includes('knife')) return 'knives';
  if (value.includes('gloves') || value.includes('wraps')) return 'gloves';
  if (value.includes(' | ')) return 'weapons';
  return 'collectibles';
}

function officialSkinHasWear(category) {
  return category === 'weapons' || category === 'knives' || category === 'gloves';
}

function officialSkinToRaw(skin, collectionName) {
  const name = String(skin?.name || '').trim();
  const category = officialSkinCategory(name);
  const hasWear = officialSkinHasWear(category);
  return {
    market_hash_name: hasWear ? `${name} (Factory New)` : name,
    collection: collectionName,
    quality: skin?.rarity || '',
    type: name.includes(' | ') ? name.split(' | ')[0] : '',
    category: category === 'weapons' ? 'rifle' : category,
    cloudflare_icon_url: skin?.image || null,
  };
}

function rememberCollectionAliases(byMarketHashName, baseName, meta) {
  const name = String(baseName || '').trim();
  if (!name || !meta) return;
  const aliases = [name];
  if (officialSkinHasWear(officialSkinCategory(name))) {
    for (const wear of WEAR_LABELS) {
      aliases.push(`${name} (${wear})`);
      aliases.push(`StatTrak™ ${name} (${wear})`);
      aliases.push(`Souvenir ${name} (${wear})`);
    }
  }
  for (const alias of aliases) {
    if (!byMarketHashName.has(alias)) byMarketHashName.set(alias, meta);
  }
}

function ingestRawItem(raw, bySlug, byMarketHashName, repsBySlug, extras = {}) {
  const collection = pickCollectionName(raw);
  if (!collection) return;

  const slug = collectionNameToSlug(collection);
  if (!slug) return;

  const meta = {
    name: collection,
    slug,
  };
  if (raw.market_hash_name && !byMarketHashName.has(raw.market_hash_name)) {
    byMarketHashName.set(raw.market_hash_name, meta);
  }

  if (!bySlug.has(slug)) {
    bySlug.set(slug, {
      name: collection,
      slug,
      kind: extras.kind || collectionKind(raw),
      listingCount: 0,
      skinCount: 0,
      releaseDate: extras.releaseDate || null,
    });
    repsBySlug.set(slug, new Map());
  } else if (extras.releaseDate && !bySlug.get(slug).releaseDate) {
    bySlug.get(slug).releaseDate = extras.releaseDate;
  }

  const entry = bySlug.get(slug);
  entry.listingCount += 1;

  const key = baseSkinKey(raw);
  if (!key) return;
  const reps = repsBySlug.get(slug);
  const current = reps.get(key);
  if (!current || isBetterCandidate(raw, current)) {
    reps.set(key, raw);
  }
}

function ingestOfficialCollections(officialBySlug, bySlug, byMarketHashName, repsBySlug) {
  for (const official of Object.values(officialBySlug || {})) {
    if (!official?.name || !official.slug) continue;
    const extras = {
      kind: official.kind || 'skins',
      releaseDate: official.releaseDate || null,
    };
    for (const skin of official.skins || []) {
      ingestRawItem(officialSkinToRaw(skin, official.name), bySlug, byMarketHashName, repsBySlug, extras);
      rememberCollectionAliases(byMarketHashName, skin.name, {
        name: official.name,
        slug: official.slug,
      });
    }
    if (!bySlug.has(official.slug) && (official.skins || []).length === 0) {
      bySlug.set(official.slug, {
        name: official.name,
        slug: official.slug,
        kind: official.kind || 'skins',
        listingCount: 0,
        skinCount: 0,
        releaseDate: official.releaseDate || null,
      });
      repsBySlug.set(official.slug, new Map());
    }
  }
}

async function buildCollectionIndex() {
  const [rawItems, official] = await Promise.all([
    getCSMarketAPIItems().catch((error) => {
      console.warn('[collection] CSMarket dump unavailable:', error.message);
      return [];
    }),
    getOfficialCollections(),
  ]);
  const bySlug = new Map();
  const byMarketHashName = new Map();
  const repsBySlug = new Map();

  for (const raw of rawItems) {
    ingestRawItem(raw, bySlug, byMarketHashName, repsBySlug);
  }
  ingestOfficialCollections(official.bySlug, bySlug, byMarketHashName, repsBySlug);

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

function normalizeOfficialCollections(rows) {
  const bySlug = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = String(row?.name || '').trim();
    const slug = collectionNameToSlug(name);
    if (!slug) continue;

    const skins = [];
    const seen = new Set();
    for (const skin of Array.isArray(row.contains) ? row.contains : []) {
      const skinName = String(skin?.name || '').trim();
      const key = skinName.toLowerCase();
      if (!skinName || seen.has(key)) continue;
      seen.add(key);
      skins.push({
        id: skin.id || skinName,
        name: skinName,
        rarity: skin.rarity?.name || null,
        image: skin.image || null,
      });
    }

    bySlug[slug] = {
      name,
      slug,
      image: row.image || null,
      kind: 'skins',
      releaseDate: row.release_date || null,
      skins,
    };
  }
  return { bySlug };
}

async function getOfficialCollections() {
  try {
    const cached = await remember('collections:official:v1', OFFICIAL_COLLECTIONS_MAX_AGE_MS, async () => {
      const response = await fetch(OFFICIAL_COLLECTIONS_URL, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`official collections ${response.status}`);
      return normalizeOfficialCollections(await response.json());
    });
    return cached.value || { bySlug: {} };
  } catch (error) {
    const stale = await getCached('collections:official:v1', OFFICIAL_COLLECTIONS_STALE_MS);
    if (stale?.bySlug) {
      console.warn('[collection] official collections refresh failed, using stale map:', error.message);
      return stale;
    }
    console.warn('[collection] official collections unavailable:', error.message);
    return { bySlug: {} };
  }
}

async function getOfficialCollectionIcons() {
  const official = await getOfficialCollections();
  const bySlug = {};
  for (const [slug, row] of Object.entries(official.bySlug || {})) {
    if (row?.image) bySlug[slug] = row.image;
  }
  return bySlug;
}

async function getCollectionsList() {
  const index = await getCollectionIndex();
  const collections = [...index.bySlug.values()].map((meta) => {
    const skins = index.skinsBySlug.get(meta.slug) || [];
    const previewIcons = [];
    for (const skin of skins) {
      if (skin.iconUrl && !previewIcons.includes(skin.iconUrl)) {
        previewIcons.push(skin.iconUrl);
        if (previewIcons.length >= 4) break;
      }
    }
    return {
      name: meta.name,
      slug: meta.slug,
      kind: meta.kind || 'skins',
      skinCount: meta.skinCount,
      listingCount: meta.listingCount,
      releaseDate: meta.releaseDate || null,
      previewIcons,
    };
  }).sort((a, b) => {
    const aDate = Date.parse(a.releaseDate) || 0;
    const bDate = Date.parse(b.releaseDate) || 0;
    if (bDate !== aDate) return bDate - aDate;
    if (b.skinCount !== a.skinCount) return b.skinCount - a.skinCount;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const officialIcons = await getOfficialCollectionIcons();
  const withIcons = collections.map((entry) => ({
    ...entry,
    iconUrl: officialIcons[entry.slug] || null,
  }));

  return {
    collections: withIcons,
    totalCount: withIcons.length,
    updatedAt: new Date().toISOString(),
  };
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
  const officialIcons = await getOfficialCollectionIcons();

  return {
    collection: {
      name: meta.name,
      slug: meta.slug,
      skinCount: meta.skinCount,
      listingCount: meta.listingCount,
      releaseDate: meta.releaseDate || null,
      iconUrl: officialIcons[normalized] || null,
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
  getCollectionsList,
  getCollectionPageData,
};
