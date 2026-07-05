const { remember } = require('./cache');

const STEAM_APP_ID = 730;
const STEAM_CONTEXT_ID = 2;
const INVENTORY_MAX_AGE_MS = 5 * 60 * 1000;
const PROFILE_MAX_AGE_MS = 30 * 60 * 1000;

class SteamHttpError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'SteamHttpError';
    this.status = status;
    this.code = code;
  }
}

function requireSteamId(steamId) {
  if (!/^\d{17}$/.test(String(steamId || ''))) {
    throw new SteamHttpError('Invalid SteamID64.', 400, 'invalid_steamid');
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'SteamInvestPortfolio/0.1 (+local-dev)',
    },
  });

  if (!response.ok) {
    const code = response.status === 403 ? 'private_inventory' : response.status === 429 ? 'rate_limited' : 'steam_http_error';
    throw new SteamHttpError(`Steam returned HTTP ${response.status}.`, response.status, code);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml',
      'User-Agent': 'SteamInvestPortfolio/0.1 (+local-dev)',
    },
  });

  if (!response.ok) {
    const code = response.status === 429 ? 'rate_limited' : 'steam_http_error';
    throw new SteamHttpError(`Steam returned HTTP ${response.status}.`, response.status, code);
  }

  return response.text();
}

async function resolveSteamProfileInput(input) {
  const value = String(input || '').trim();
  const directSteamId = extractSteamId64(value);
  if (directSteamId) return directSteamId;

  const vanity = extractVanityName(value);
  if (!vanity) {
    throw new SteamHttpError('Enter a Steam profile URL or SteamID64.', 400, 'invalid_profile_url');
  }

  if (process.env.STEAM_API_KEY) {
    const params = new URLSearchParams({
      key: process.env.STEAM_API_KEY,
      vanityurl: vanity,
    });
    const json = await fetchJson(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?${params}`);
    if (json.response?.success === 1 && /^\d{17}$/.test(String(json.response.steamid || ''))) {
      return String(json.response.steamid);
    }
  }

  const xml = await fetchText(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}?xml=1`);
  const match = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
  if (match) return match[1];

  throw new SteamHttpError('Steam profile not found.', 404, 'profile_not_found');
}

function extractSteamId64(value) {
  const raw = String(value || '').trim();
  if (/^\d{17}$/.test(raw)) return raw;
  const match = raw.match(/steamcommunity\.com\/profiles\/(\d{17})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

function extractVanityName(value) {
  const raw = String(value || '').trim();
  let candidate = raw;

  try {
    const url = new URL(raw);
    if (!/steamcommunity\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    candidate = parts[0] === 'id' ? parts[1] : '';
  } catch {
    candidate = raw.replace(/^@/, '');
  }

  candidate = String(candidate || '').trim();
  return /^[A-Za-z0-9_-]{2,64}$/.test(candidate) ? candidate : null;
}

async function getSteamProfile(steamId) {
  requireSteamId(steamId);

  if (!process.env.STEAM_API_KEY) {
    return {
      steamId,
      personaname: `STEAM/${steamId.slice(-6)}`,
      profileurl: `https://steamcommunity.com/profiles/${steamId}`,
      avatar: null,
      avatarmedium: null,
      avatarfull: null,
      apiKeyMissing: true,
    };
  }

  const key = `steam:profile:${steamId}`;
  const { value } = await remember(key, PROFILE_MAX_AGE_MS, async () => {
    const params = new URLSearchParams({ key: process.env.STEAM_API_KEY, steamids: steamId });
    const json = await fetchJson(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?${params}`);
    const player = json.response?.players?.[0];
    if (!player) throw new SteamHttpError('Steam profile not found.', 404, 'profile_not_found');
    return {
      steamId: player.steamid,
      personaname: player.personaname,
      profileurl: player.profileurl,
      avatar: player.avatar,
      avatarmedium: player.avatarmedium,
      avatarfull: player.avatarfull,
      communityvisibilitystate: player.communityvisibilitystate,
      personastate: player.personastate,
    };
  });

  return value;
}

async function getSteamInventory(steamId, { force = false } = {}) {
  requireSteamId(steamId);
  const key = `steam:inventory:${steamId}`;

  if (!force) {
    const cached = await remember(key, INVENTORY_MAX_AGE_MS, async () => fetchInventoryPages(steamId));
    return { ...cached.value, cached: cached.cached };
  }

  const value = await fetchInventoryPages(steamId);
  const { setCached } = require('./cache');
  await setCached(key, value);
  return { ...value, cached: false };
}

async function fetchInventoryPages(steamId) {
  const allAssets = [];
  const descriptionMap = new Map();
  let startAssetId = null;
  let more = true;

  while (more) {
    const params = new URLSearchParams({ l: 'english', count: '2500' });
    if (startAssetId) params.set('start_assetid', startAssetId);

    const url = `https://steamcommunity.com/inventory/${steamId}/${STEAM_APP_ID}/${STEAM_CONTEXT_ID}?${params}`;
    const json = await fetchJson(url);

    if (!json.success && json.success !== 1) {
      throw new SteamHttpError(json.Error || 'Steam inventory request failed.', 502, 'steam_inventory_failed');
    }

    for (const asset of json.assets || []) allAssets.push(asset);
    for (const description of json.descriptions || []) {
      descriptionMap.set(`${description.classid}_${description.instanceid}`, description);
    }

    more = Boolean(json.more_items);
    startAssetId = json.last_assetid || null;
    if (!startAssetId) more = false;
  }

  return {
    appId: STEAM_APP_ID,
    contextId: STEAM_CONTEXT_ID,
    inventoryProvider: 'steam-public',
    totalInventoryCount: allAssets.reduce((sum, asset) => sum + Number(asset.amount || 1), 0),
    assetEntriesCount: allAssets.length,
    syncedAt: new Date().toISOString(),
    items: allAssets.map((asset) => normalizeInventoryItem(asset, descriptionMap.get(`${asset.classid}_${asset.instanceid}`))),
  };
}

function normalizeInventoryItem(asset, description = {}) {
  const tags = description.tags || [];
  const marketHashName = description.market_hash_name || description.market_name || description.name || 'Unknown item';
  const wear = getTag(tags, 'Exterior') || getWearFromName(marketHashName);
  const category = getTag(tags, 'Weapon') || getTag(tags, 'Type') || 'Other';
  const rarity = getTag(tags, 'Rarity') || 'Unknown';

  return {
    assetid: asset.assetid,
    classid: asset.classid,
    instanceid: asset.instanceid,
    amount: Number(asset.amount || 1),
    name: description.market_name || description.name || marketHashName,
    marketHashName,
    type: description.type || '',
    category,
    rarity,
    wear,
    tradable: description.tradable === 1,
    marketable: description.marketable === 1,
    iconUrl: description.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${description.icon_url}` : null,
    marketUrl: description.market_hash_name
      ? `https://steamcommunity.com/market/listings/${STEAM_APP_ID}/${encodeURIComponent(description.market_hash_name)}`
      : null,
    descriptions: (description.descriptions || []).map((part) => part.value).filter(Boolean),
    tags,
  };
}

function getTag(tags, category) {
  return tags.find((tag) => tag.category === category)?.localized_tag_name || null;
}

function getWearFromName(name) {
  const match = String(name).match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/);
  return match ? match[1] : 'N/A';
}

module.exports = {
  SteamHttpError,
  resolveSteamProfileInput,
  getSteamProfile,
  getSteamInventory,
};
