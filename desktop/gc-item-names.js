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

function getSkinWearName(paintWear) {
  const thresholds = [0.07, 0.15, 0.38, 0.45, 1];
  const names = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
  for (let i = 0; i < thresholds.length; i++) {
    if (paintWear <= thresholds[i]) return names[i];
  }
  return names[names.length - 1];
}

function getAttributeBytes(item, attribDefIndex) {
  const attrib = (item.attribute || []).find((a) => a.def_index === attribDefIndex);
  return attrib ? attrib.value_bytes : null;
}

function isStatTrak(item) {
  return (item.attribute || []).some((a) => a.def_index === 80);
}

function resolveItemName(schema, gcItem) {
  const def = schema.items[gcItem.def_index];
  if (!def) return null;

  const musicBytes = getAttributeBytes(gcItem, 166);
  if (musicBytes) {
    const musicIndex = musicBytes.readUInt32LE(0);
    const kit = schema.music_kits[musicIndex];
    if (kit?.loc_name) {
      return `Music Kit | ${getTranslation(schema, kit.loc_name)}`;
    }
  }

  let baseOne = '';
  if (def.item_name) {
    baseOne = getTranslation(schema, def.item_name);
  } else if (def.prefab) {
    const prefab = schema.prefabs[def.prefab];
    if (prefab?.item_name) baseOne = getTranslation(schema, prefab.item_name);
  }

  let baseTwo = '';
  if (gcItem.paint_index != null) {
    const paint = schema.paint_kits[gcItem.paint_index];
    if (paint?.description_tag) baseTwo = getTranslation(schema, paint.description_tag);
  }

  if (!baseOne) return null;
  let name = baseTwo ? `${baseOne} | ${baseTwo}` : baseOne;
  if (gcItem.paint_wear != null && baseTwo) {
    name = `${name} (${getSkinWearName(gcItem.paint_wear)})`;
  }
  if (isStatTrak(gcItem)) name = `StatTrak™ ${name}`;
  if (gcItem.quality === 3) name = `★ ${name}`;
  return name.trim();
}

function resolveIconUrl(schema, gcItem) {
  const def = schema.items[gcItem.def_index];
  if (!def) return null;
  let imagePath = def.image_inventory;
  if (gcItem.paint_index != null && def.name) {
    const paint = schema.paint_kits[gcItem.paint_index];
    if (paint?.name) {
      imagePath = `econ/default_generated/${def.name}_${paint.name}_light_large`;
    }
  }
  if (!imagePath) return null;
  return `https://community.cloudflare.steamstatic.com/economy/image/${imagePath}`;
}

async function buildItemFields(gcItem, cacheDir) {
  const schema = await loadSchema(cacheDir);
  const marketHashName = resolveItemName(schema, gcItem) || `CS2 Item #${gcItem.def_index}`;
  const iconUrl = resolveIconUrl(schema, gcItem);
  const tradableAfter = gcItem.tradable_after ? new Date(gcItem.tradable_after) : null;
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
    wear: gcItem.paint_wear != null ? getSkinWearName(gcItem.paint_wear) : 'N/A',
  };
}

module.exports = { loadSchema, buildItemFields };
