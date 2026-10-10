// Backpack with Steam's own descriptions (icons, rarity, collection), read through
// the official WebAPI with the sync's short-lived access token. Mirrors the item
// shape of fetchFullInventory() in desktop/main.js.
const INVENTORY_URL = 'https://api.steampowered.com/IEconService/GetInventoryItemsWithDescriptions/v1/';
const PAGE_SIZE = 2000;
const PAGE_DELAY_MS = 1000;
const MAX_PAGES = 50;
const MAX_RATE_LIMIT_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getTag(tags, category) {
  return tags.find((t) => t.category === category)?.localized_tag_name || null;
}

function compactDescriptions(descriptions = []) {
  return descriptions
    .map((part) => String(part?.value || '').trim())
    .filter((value) => /sticker/i.test(value));
}

function compactTags(tags = []) {
  return tags
    .filter((tag) => ['ItemSet', 'Weapon', 'Type', 'Rarity', 'Exterior'].includes(tag?.category))
    .map((tag) => ({ category: tag.category, localized_tag_name: tag.localized_tag_name || tag.name || '' }));
}

const isTrue = (value) => value === true || Number(value) === 1;

function mapAsset(asset, desc) {
  const tags = desc.tags || [];
  const marketHashName = desc.market_hash_name || desc.market_name || desc.name || 'Unknown';
  return {
    assetid: String(asset.assetid),
    classid: String(asset.classid),
    instanceid: String(asset.instanceid),
    amount: Number(asset.amount || 1),
    name: desc.market_name || desc.name || desc.market_hash_name || 'Unknown',
    marketHashName,
    type: desc.type || '',
    category: getTag(tags, 'Weapon') || getTag(tags, 'Type') || 'Other',
    rarity: getTag(tags, 'Rarity') || 'Unknown',
    wear: getTag(tags, 'Exterior') || 'N/A',
    collection: getTag(tags, 'ItemSet') || null,
    tradable: isTrue(desc.tradable),
    marketable: isTrue(desc.marketable),
    iconUrl: /^[\w-]+$/.test(desc.icon_url || '')
      ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}`
      : null,
    marketUrl: desc.market_hash_name
      ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(desc.market_hash_name)}`
      : null,
    descriptions: compactDescriptions(desc.descriptions),
    tags: compactTags(tags),
  };
}

export async function fetchBackpack(steamId, accessToken) {
  const items = [];
  let startAssetId = null;
  let retries = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);
    const params = new URLSearchParams({
      access_token: accessToken,
      steamid: String(steamId),
      appid: '730',
      contextid: '2',
      get_descriptions: 'true',
      language: 'english',
      count: String(PAGE_SIZE),
    });
    if (startAssetId) params.set('start_assetid', startAssetId);

    const res = await fetch(`${INVENTORY_URL}?${params}`, { credentials: 'omit', cache: 'no-store' });
    if (res.status === 429 && retries < MAX_RATE_LIMIT_RETRIES) {
      retries++;
      page--;
      await sleep(5000 * retries);
      continue;
    }
    if (!res.ok) throw new Error(`Steam inventory HTTP ${res.status}`);
    const data = (await res.json())?.response || {};

    const descriptions = new Map((data.descriptions || []).map((d) => [`${d.classid}_${d.instanceid}`, d]));
    for (const asset of data.assets || []) {
      items.push(mapAsset(asset, descriptions.get(`${asset.classid}_${asset.instanceid}`) || {}));
    }
    startAssetId = data.last_assetid || null;
    if (!data.more_items || !startAssetId) {
      return { items, totalInventoryCount: data.total_inventory_count ?? null };
    }
  }
  throw new Error('Steam inventory has too many pages');
}
