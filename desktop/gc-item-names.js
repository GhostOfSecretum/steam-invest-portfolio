const fs = require('fs/promises');
const path = require('path');
const VDF = require('@node-steam/vdf');

const ITEMS_GAME_URL = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt';
const ENGLISH_URL = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let schemaPromise = null;

async function loadSchema(cacheDir) {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await fs.mkdir(cacheDir, { recursive: true });
    const cacheFile = path.join(cacheDir, 'schema.json');
    try {
      const stat = await fs.stat(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_MAX_AGE_MS) {
        return JSON.parse(await fs.readFile(cacheFile, 'utf8'));
      }
    } catch { /* refresh */ }

    const [itemsRaw, englishRaw] = await Promise.all([
      fetch(ITEMS_GAME_URL).then((r) => {
        if (!r.ok) throw new Error(`items_game HTTP ${r.status}`);
        return r.text();
      }),
      fetch(ENGLISH_URL).then((r) => {
        if (!r.ok) throw new Error(`csgo_english HTTP ${r.status}`);
        return r.text();
      }),
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
      translations,
    };
    await fs.writeFile(cacheFile, JSON.stringify(schema));
    return schema;
  })();
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

function resolveIconUrl(schema, gcItem) {
  const defIndex = getGcValue(gcItem, 'def_index', 'defIndex', 'defindex');
  const paintIndex = getGcValue(gcItem, 'paint_index', 'paintIndex', 'paintindex');
  const def = getItemDef(schema, defIndex);
  if (!def) return null;
  let imagePath = def.image_inventory;
  if (paintIndex != null && def.name) {
    const paint = schema.paint_kits[paintIndex];
    if (paint?.name) {
      imagePath = `econ/default_generated/${def.name}_${paint.name}_light_large`;
    }
  }
  if (!imagePath) return null;
  return `https://community.cloudflare.steamstatic.com/economy/image/${imagePath}`;
}

async function buildItemFields(gcItem, cacheDir) {
  const schema = await loadSchema(cacheDir);
  const defIndex = getGcValue(gcItem, 'def_index', 'defIndex', 'defindex');
  const paintWear = getGcValue(gcItem, 'paint_wear', 'paintWear', 'paintwear');
  const marketHashName = resolveItemName(schema, gcItem) || `CS2 Item #${defIndex}`;
  const iconUrl = resolveIconUrl(schema, gcItem);
  const tradableAfterRaw = getGcValue(gcItem, 'tradable_after', 'tradableAfter', 'tradableafter');
  const tradableAfter = tradableAfterRaw ? new Date(tradableAfterRaw) : null;
  const tradable = !tradableAfter || tradableAfter <= new Date();

  return {
    marketHashName,
    name: gcItem.custom_name || marketHashName,
    iconUrl,
    tradable,
    marketable: tradable,
    type: 'Storage contents',
    category: 'Storage',
    rarity: 'Unknown',
    wear: paintWear != null ? getSkinWearName(paintWear) : 'N/A',
  };
}

module.exports = { loadSchema, buildItemFields };
