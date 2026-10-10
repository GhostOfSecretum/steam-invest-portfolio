// Port of desktop/gc-item-names.js: Game Coordinator items carry only numeric
// ids, so names come from the public CS2 schema tracked by SteamDatabase.
import { parseVdf } from './vdf.js';

const ITEMS_GAME_URL = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt';
const ENGLISH_URL = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt';
const CACHE_NAME = 'cs2-schema-v1';
const CACHE_KEY = 'https://cache.invalid/cs2-schema.json';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`${url.split('/').pop()} HTTP ${res.status}`);
  return res.text();
}

function parseTranslations(raw) {
  const dict = Object.create(null);
  for (const line of raw.split('\n')) {
    const match = line.match(/"(.*?)"/g);
    if (match && match[1]) {
      dict[match[0].replaceAll('"', '').toLowerCase()] = match[1].replaceAll('"', '');
    }
  }
  return dict;
}

async function downloadSchema() {
  const [itemsRaw, englishRaw] = await Promise.all([fetchText(ITEMS_GAME_URL), fetchText(ENGLISH_URL)]);
  const parsed = parseVdf(itemsRaw);
  const root = parsed.items_game || parsed;
  return {
    items: root.items || {},
    paint_kits: root.paint_kits || {},
    prefabs: root.prefabs || {},
    sticker_kits: root.sticker_kits || {},
    music_kits: root.music_definitions || {},
    keychain_defs: root.keychain_definitions || {},
    translations: parseTranslations(englishRaw),
  };
}

export async function loadSchema() {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(CACHE_KEY);
  const fetchedAt = Number(cached?.headers.get('x-fetched-at') || 0);
  if (cached && Date.now() - fetchedAt < CACHE_MAX_AGE_MS) {
    return cached.json();
  }
  try {
    const schema = await downloadSchema();
    await cache.put(CACHE_KEY, new Response(JSON.stringify(schema), {
      headers: { 'Content-Type': 'application/json', 'x-fetched-at': String(Date.now()) },
    }));
    return schema;
  } catch (err) {
    if (cached) {
      console.warn('[schema] refresh failed, using stale cache:', err.message);
      return cached.json();
    }
    throw err;
  }
}

function getTranslation(schema, token) {
  if (!token) return '';
  return schema.translations[String(token).replace('#', '').toLowerCase()] || '';
}

function getItemDef(schema, defIndex) {
  const direct = schema.items[defIndex];
  if (!direct) return null;
  let merged = { ...direct };
  for (const prefabName of String(direct.prefab || '').split(/\s+/).filter(Boolean)) {
    const prefab = schema.prefabs[prefabName];
    if (prefab) merged = { ...prefab, ...merged };
  }
  return merged;
}

export function getSkinWearName(paintWear) {
  const thresholds = [0.07, 0.15, 0.38, 0.45, 1];
  const names = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
  for (let i = 0; i < thresholds.length; i++) {
    if (paintWear <= thresholds[i]) return names[i];
  }
  return names[names.length - 1];
}

function resolveKitName(schema, kitId, prefix) {
  if (kitId == null) return null;
  const kit = schema.sticker_kits[kitId] || schema.keychain_defs[kitId];
  const translated = kit && getTranslation(schema, kit.item_name || kit.loc_name);
  return translated ? `${prefix} | ${translated}` : null;
}

function resolveItemName(schema, item) {
  const def = getItemDef(schema, item.defIndex);
  if (!def) return null;

  if (item.musicIndex !== undefined) {
    const kit = schema.music_kits[item.musicIndex];
    if (kit?.loc_name) return `Music Kit | ${getTranslation(schema, kit.loc_name)}`;
  }

  const kitPrefix = { 1209: 'Sticker', 1355: 'Charm', 1348: 'Sealed Graffiti' }[item.defIndex];
  if (kitPrefix) {
    const named = resolveKitName(schema, item.kitId, kitPrefix);
    if (named) return named;
  }

  const baseOne = getTranslation(schema, def.item_name);
  if (!baseOne) return null;
  const paint = item.paintIndex !== undefined ? schema.paint_kits[item.paintIndex] : null;
  const baseTwo = paint?.description_tag ? getTranslation(schema, paint.description_tag) : '';

  let name = baseTwo ? `${baseOne} | ${baseTwo}` : baseOne;
  if (item.paintWear !== undefined && baseTwo) name = `${name} (${getSkinWearName(item.paintWear)})`;
  if (item.statTrak) name = `StatTrak™ ${name}`;
  if (item.quality === 3) name = `★ ${name}`;
  return name.trim();
}

// Same item shape desktop sends for Game Coordinator items.
export function buildGcItem(schema, item, storageUnit) {
  const marketHashName = (schema && resolveItemName(schema, item)) || `CS2 Item #${item.defIndex}`;
  const tradable = !item.tradableAfter || item.tradableAfter <= new Date();
  const isSticker = item.defIndex === 1209;
  const isCharm = item.defIndex === 1355;
  return {
    assetid: String(item.id),
    classid: String(item.defIndex || ''),
    instanceid: '0',
    amount: item.quantity || 1,
    marketHashName,
    name: item.customName || marketHashName,
    iconUrl: null,
    tradable,
    marketable: tradable,
    type: isSticker ? 'Sticker' : (isCharm ? 'Charm' : (storageUnit ? 'Storage contents' : '')),
    category: isSticker ? 'Sticker' : (isCharm ? 'Charm' : (storageUnit ? 'Storage' : 'Other')),
    rarity: 'Unknown',
    wear: item.paintWear !== undefined ? getSkinWearName(item.paintWear) : 'N/A',
    marketUrl: marketHashName.startsWith('CS2 Item #')
      ? null
      : `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`,
    descriptions: [],
    tags: [],
    inStorage: Boolean(storageUnit),
    ...(storageUnit ? { storageUnitId: String(storageUnit.id), storageUnitName: storageUnit.name } : {}),
  };
}
