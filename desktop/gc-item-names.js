const fs = require('fs/promises');
const path = require('path');
const VDF = require('@node-steam/vdf');

const ITEMS_GAME_URL = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt';
const ENGLISH_URL = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let schemaPromise = null;

function fetchErrorDetail(err) {
  const cause = err?.cause?.message || err?.cause?.code;
  return cause ? `${err.message}: ${cause}` : (err?.message || String(err));
}

async function readCachedSchema(cacheFile) {
  return JSON.parse(await fs.readFile(cacheFile, 'utf8'));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'SkinsHead-desktop/0.1' },
  });
  if (!response.ok) throw new Error(`${url.split('/').pop()} HTTP ${response.status}`);
  return response.text();
}

async function loadSchemaUncached(cacheDir) {
  await fs.mkdir(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, 'schema.json');

  try {
    const stat = await fs.stat(cacheFile);
    if (Date.now() - stat.mtimeMs < CACHE_MAX_AGE_MS) {
      const cached = await readCachedSchema(cacheFile);
      if (cached?.keychain_defs && Object.keys(cached.keychain_defs).length) {
        return cached;
      }
    }
  } catch { /* refresh */ }

  try {
    const [itemsRaw, englishRaw] = await Promise.all([
      fetchText(ITEMS_GAME_URL),
      fetchText(ENGLISH_URL),
    ]);

    const itemsGame = VDF.parse(itemsRaw);
    const translations = parseTranslations(englishRaw);
    const root = itemsGame.items_game || itemsGame;
    const schema = {
      items: root.items || {},
      paint_kits: root.paint_kits || {},
      prefabs: root.prefabs || {},
      sticker_kits: root.sticker_kits || {},
      music_kits: root.music_definitions || {},
      graffiti_tints: root.graffiti_tints || {},
      keychain_defs: root.keychain_definitions || {},
      translations,
    };
    await fs.writeFile(cacheFile, JSON.stringify(schema));
    return schema;
  } catch (err) {
    try {
      const stale = await readCachedSchema(cacheFile);
      console.warn('[gc-storage] schema refresh failed, using stale cache:', fetchErrorDetail(err));
      return stale;
    } catch {
      throw new Error(`schema fetch failed (${fetchErrorDetail(err)})`);
    }
  }
}

async function loadSchema(cacheDir) {
  if (schemaPromise) return schemaPromise;
  schemaPromise = loadSchemaUncached(cacheDir).catch((err) => {
    schemaPromise = null;
    throw err;
  });
  return schemaPromise;
}

function parseTranslations(raw) {
  const dict = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/"(.*?)"/g);
    if (match && match[1]) {
      dict[match[0].replaceAll('"', '').toLowerCase()] = match[1].replaceAll('"', '');
    }
  }
  return dict;
}

function getTranslation(schema, token) {
  if (!token) return '';
  const key = String(token).replace('#', '').toLowerCase();
  return schema.translations[key] || '';
}

function getGcValue(item, ...keys) {
  for (const key of keys) {
    if (item?.[key] != null) return item[key];
  }
  return null;
}

function getItemDef(schema, defIndex) {
  const direct = schema.items[defIndex];
  if (!direct) return null;

  const merged = { ...direct };
  const prefabs = String(direct.prefab || '').split(/\s+/).filter(Boolean);
  for (const prefabName of prefabs) {
    const prefab = schema.prefabs[prefabName];
    if (prefab) {
      Object.assign(merged, { ...prefab, ...merged });
    }
  }
  return merged;
}

function getSkinWearName(paintWear) {
  const thresholds = [0.07, 0.15, 0.38, 0.45, 1];
  const names = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
  for (let i = 0; i < thresholds.length; i++) {
    if (paintWear <= thresholds[i]) return names[i];
  }
  return names[names.length - 1];
}

function getAttributeBytes(item, attribDefIndex) {
  const attributes = item.attribute || item.attributes || [];
  const attrib = attributes.find((a) => a.def_index === attribDefIndex || a.defIndex === attribDefIndex);
  return attrib ? attrib.value_bytes : null;
}

function isStatTrak(item) {
  const attributes = item.attribute || item.attributes || [];
  return attributes.some((a) => a.def_index === 80 || a.defIndex === 80);
}

function readUint32Attr(item, attribDefIndex) {
  const bytes = getAttributeBytes(item, attribDefIndex);
  if (!bytes || bytes.length < 4) return null;
  return bytes.readUInt32LE(0);
}

function getKit(schema, kitId) {
  if (kitId == null || kitId === '') return null;
  return schema.sticker_kits?.[kitId]
    || schema.sticker_kits?.[String(kitId)]
    || schema.keychain_defs?.[kitId]
    || schema.keychain_defs?.[String(kitId)]
    || null;
}

function resolveKitName(schema, kitId, prefix) {
  const kit = getKit(schema, kitId);
  if (!kit) return null;
  const translated = getTranslation(schema, kit.item_name || kit.loc_name);
  if (!translated) return null;
  return `${prefix} | ${translated}`;
}

function resolveKitId(gcItem) {
  return gcItem.stickers?.[0]?.sticker_id
    ?? gcItem.keychains?.[0]?.sticker_id
    ?? readUint32Attr(gcItem, 113)
    ?? readUint32Attr(gcItem, 299)
    ?? readUint32Attr(gcItem, 321);
}

function resolveItemName(schema, gcItem) {
  const defIndex = getGcValue(gcItem, 'def_index', 'defIndex', 'defindex');
  const paintIndex = getGcValue(gcItem, 'paint_index', 'paintIndex', 'paintindex');
  const paintWear = getGcValue(gcItem, 'paint_wear', 'paintWear', 'paintwear');
  const def = getItemDef(schema, defIndex);
  if (!def) return null;

  const musicBytes = getAttributeBytes(gcItem, 166);
  if (musicBytes) {
    const musicIndex = musicBytes.readUInt32LE(0);
    const kit = schema.music_kits[musicIndex];
    if (kit?.loc_name) {
      return `Music Kit | ${getTranslation(schema, kit.loc_name)}`;
    }
  }

  const kitId = resolveKitId(gcItem);
  const defIndexNum = Number(defIndex);
  if (defIndexNum === 1209) {
    const named = resolveKitName(schema, kitId, 'Sticker');
    if (named) return named;
  }
  if (defIndexNum === 1355) {
    const named = resolveKitName(schema, kitId, 'Charm');
    if (named) return named;
  }
  if (defIndexNum === 1348) {
    const named = resolveKitName(schema, kitId, 'Sealed Graffiti');
    if (named) return named;
  }

  const baseOne = getTranslation(schema, def.item_name);

  let baseTwo = '';
  if (paintIndex != null) {
    const paint = schema.paint_kits[paintIndex];
    if (paint?.description_tag) baseTwo = getTranslation(schema, paint.description_tag);
  }

  if (!baseOne) return null;
  let name = baseTwo ? `${baseOne} | ${baseTwo}` : baseOne;
  if (paintWear != null && baseTwo) {
    name = `${name} (${getSkinWearName(paintWear)})`;
  }
  if (isStatTrak(gcItem)) name = `StatTrak™ ${name}`;
  if (gcItem.quality === 3) name = `★ ${name}`;
  return name.trim();
}

function resolveIconUrl() {
  // Schema paths like econ/weapon_cases/... 404 on Steam's CDN. Real icons are
  // hashed economy URLs from the market catalog, filled in on the server after sync.
  return null;
}

async function buildItemFields(gcItem, cacheDir) {
  let schema = null;
  try {
    schema = await loadSchema(cacheDir);
  } catch (err) {
    console.warn('[gc-storage] schema unavailable, using fallback names:', fetchErrorDetail(err));
  }
  const defIndex = getGcValue(gcItem, 'def_index', 'defIndex', 'defindex');
  const defIndexNum = Number(defIndex);
  const paintWear = getGcValue(gcItem, 'paint_wear', 'paintWear', 'paintwear');
  const marketHashName = (schema && resolveItemName(schema, gcItem)) || `CS2 Item #${defIndex}`;
  const tradableAfterRaw = getGcValue(gcItem, 'tradable_after', 'tradableAfter', 'tradableafter');
  const tradableAfter = tradableAfterRaw ? new Date(tradableAfterRaw) : null;
  const tradable = !tradableAfter || tradableAfter <= new Date();
  const isSticker = defIndexNum === 1209;
  const isCharm = defIndexNum === 1355;

  return {
    marketHashName,
    name: gcItem.custom_name || marketHashName,
    iconUrl: null,
    tradable,
    marketable: tradable,
    type: isSticker ? 'Sticker' : (isCharm ? 'Charm' : 'Storage contents'),
    category: isSticker ? 'Sticker' : (isCharm ? 'Charm' : 'Storage'),
    rarity: 'Unknown',
    wear: paintWear != null ? getSkinWearName(paintWear) : 'N/A',
  };
}

module.exports = { loadSchema, buildItemFields };
