const { getCached, getCachedEntry, setCached } = require('./cache');
const { collectionNameToSlug } = require('../../item-slugs');

const STEAM_APP_ID = 730;
const STEAM_CONTEXT_ID = 2;
const INVENTORY_MAX_AGE_MS = 5 * 60 * 1000;
const INVENTORY_STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROFILE_MAX_AGE_MS = 30 * 60 * 1000;
const PROFILE_STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FETCH_RETRIES = 3;
const COMMUNITY_GAP_MS = 1200;
const STEAM_HEADERS = {
  Accept: 'application/json,text/javascript,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const inflight = new Map();
let communityQueue = Promise.resolve();

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

function fallbackProfile(steamId, extra = {}) {
  return {
    steamId,
    personaname: `STEAM/${String(steamId).slice(-6)}`,
    profileurl: `https://steamcommunity.com/profiles/${steamId}`,
    avatar: null,
    avatarmedium: null,
    avatarfull: null,
    ...extra,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

function steamErrorFromStatus(status) {
  const code = status === 403 ? 'private_inventory' : status === 429 ? 'rate_limited' : 'steam_http_error';
  return new SteamHttpError(`Steam returned HTTP ${status}.`, status, code);
}

function dedupe(key, loader) {
  if (inflight.has(key)) return inflight.get(key);
  const pending = Promise.resolve().then(loader).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

function enqueueCommunity(loader) {
  const run = communityQueue.then(loader, loader);
  communityQueue = run.then(() => sleep(COMMUNITY_GAP_MS), () => sleep(COMMUNITY_GAP_MS));
  return run;
}

async function fetchSteam(url, { accept = 'application/json', extraHeaders = {}, retries = FETCH_RETRIES } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: accept,
          ...STEAM_HEADERS,
          ...extraHeaders,
        },
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      lastError = new SteamHttpError(error.message || 'Steam request failed.', 502, 'steam_http_error');
      await sleep(400 * (attempt + 1));
      continue;
    }

    if (response.ok) {
      if (!accept.includes('json')) return response.text();
      try {
        return await response.json();
      } catch {
        throw new SteamHttpError('Steam returned a non-JSON response.', 502, 'steam_http_error');
      }
    }

    lastError = steamErrorFromStatus(response.status);
    if (!isRetryableStatus(response.status) || attempt === retries - 1) throw lastError;

    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 4000)
      : 800 * (attempt + 1) + Math.floor(Math.random() * 400);
    await sleep(waitMs);
  }

  throw lastError || new SteamHttpError('Steam request failed.', 502, 'steam_http_error');
}

async function fetchJson(url, options = {}) {
  return fetchSteam(url, { ...options, accept: 'application/json' });
}

async function fetchText(url, options = {}) {
  return fetchSteam(url, { ...options, accept: 'text/html,application/xhtml+xml,application/xml' });
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
    return fallbackProfile(steamId, { apiKeyMissing: true });
  }

  const key = `steam:profile:${steamId}`;
  return dedupe(key, async () => {
    const cached = await getCached(key, PROFILE_MAX_AGE_MS);
    if (cached) return cached;

    try {
      const params = new URLSearchParams({ key: process.env.STEAM_API_KEY, steamids: steamId });
      const json = await fetchJson(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?${params}`);
      const player = json.response?.players?.[0];
      if (!player) throw new SteamHttpError('Steam profile not found.', 404, 'profile_not_found');
      const value = {
        steamId: player.steamid,
        personaname: player.personaname,
        profileurl: player.profileurl,
        avatar: player.avatar,
        avatarmedium: player.avatarmedium,
        avatarfull: player.avatarfull,
        communityvisibilitystate: player.communityvisibilitystate,
        personastate: player.personastate,
      };
      await setCached(key, value);
      return value;
    } catch (error) {
      if (error?.code === 'invalid_steamid') throw error;
      const stale = await getCached(key, PROFILE_STALE_MAX_AGE_MS);
      if (stale) return stale;
      return fallbackProfile(steamId);
    }
  });
}

async function getSteamInventory(steamId, { force = false } = {}) {
  requireSteamId(steamId);
  const key = `steam:inventory:${steamId}`;

  return dedupe(`${key}:${force ? 'force' : 'get'}`, async () => {
    if (!force) {
      const cached = await getCached(key, INVENTORY_MAX_AGE_MS);
      if (cached) return { ...cached, cached: true };
    }

    try {
      const value = await fetchInventoryPages(steamId);
      await setCached(key, value);
      return { ...value, cached: false };
    } catch (error) {
      const stale = await getCachedEntry(key);
      const ageMs = stale ? Date.now() - stale.updatedAt : Infinity;
      if (stale?.value && ageMs <= INVENTORY_STALE_MAX_AGE_MS) {
        return { ...stale.value, cached: true, stale: true };
      }
      throw error;
    }
  });
}

async function fetchInventoryPages(steamId) {
  if (process.env.STEAM_API_KEY) {
    try {
      return await fetchInventoryViaWebApi(steamId);
    } catch (error) {
      if (error?.code === 'private_inventory' || error?.code === 'invalid_steamid') throw error;
      console.warn('[steam] webapi inventory failed, falling back to community:', error.message || error);
    }
  }

  return enqueueCommunity(() => fetchInventoryViaCommunity(steamId));
}

async function fetchInventoryViaWebApi(steamId) {
  const pages = [];
  let startAssetId = null;
  let more = true;
  let totalInventoryCount = null;

  while (more) {
    const params = new URLSearchParams({
      key: process.env.STEAM_API_KEY,
      steamid: steamId,
      appid: String(STEAM_APP_ID),
      contextid: String(STEAM_CONTEXT_ID),
      language: 'english',
      get_descriptions: '1',
      count: '2500',
    });
    if (startAssetId) params.set('start_assetid', startAssetId);

    const json = await fetchJson(`https://api.steampowered.com/IEconService/GetInventoryItemsWithDescriptions/v1/?${params}`);
    const payload = json.response || {};
    if (payload.success === false) {
      throw new SteamHttpError(payload.error || 'Steam inventory request failed.', 502, 'steam_inventory_failed');
    }

    pages.push(payload);
    if (Number.isFinite(Number(payload.total_inventory_count))) {
      totalInventoryCount = Number(payload.total_inventory_count);
    }

    more = Boolean(payload.more_items);
    startAssetId = payload.last_assetid || null;
    if (!startAssetId) more = false;
  }

  const first = pages[0] || {};
  const hasAssets = pages.some((page) => Array.isArray(page.assets) && page.assets.length);
  if (!hasAssets && totalInventoryCount == null && !Array.isArray(first.descriptions)) {
    throw new SteamHttpError('Steam Web API returned an empty inventory payload.', 502, 'steam_inventory_failed');
  }

  return assembleInventory(pages, 'steam-webapi');
}

async function fetchInventoryViaCommunity(steamId) {
  const pages = [];
  let startAssetId = null;
  let more = true;

  while (more) {
    const params = new URLSearchParams({ l: 'english', count: '2500' });
    if (startAssetId) params.set('start_assetid', startAssetId);

    const url = `https://steamcommunity.com/inventory/${steamId}/${STEAM_APP_ID}/${STEAM_CONTEXT_ID}?${params}`;
    const json = await fetchJson(url, {
      extraHeaders: {
        Referer: `https://steamcommunity.com/profiles/${steamId}/inventory`,
      },
    });

    if (!json.success && json.success !== 1) {
      throw new SteamHttpError(json.Error || 'Steam inventory request failed.', 502, 'steam_inventory_failed');
    }

    pages.push(json);
    more = Boolean(json.more_items);
    startAssetId = json.last_assetid || null;
    if (!startAssetId) more = false;
  }

  return assembleInventory(pages, 'steam-public');
}

function assembleInventory(pages, inventoryProvider) {
  const allAssets = [];
  const descriptionMap = new Map();

  for (const page of pages) {
    for (const asset of page.assets || []) allAssets.push(asset);
    for (const description of page.descriptions || []) {
      descriptionMap.set(`${description.classid}_${description.instanceid}`, description);
    }
  }

  return {
    appId: STEAM_APP_ID,
    contextId: STEAM_CONTEXT_ID,
    inventoryProvider,
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
  const collection = getTag(tags, 'ItemSet') || null;

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
    collection,
    collectionSlug: collection ? collectionNameToSlug(collection) : null,
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
