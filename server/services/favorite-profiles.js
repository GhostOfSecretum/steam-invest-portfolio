const fs = require('fs/promises');
const path = require('path');
const { resolveSteamProfileInput, getSteamProfile } = require('./steam');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorite-profiles.json');
const LEGACY_OWNER = '__legacy__';
const MAX_FAVORITES = 50;

async function listFavoriteProfiles(ownerId = null) {
  const store = await readStore();
  const profiles = resolveOwnerList(store, ownerId);
  return profiles.slice().sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
}

async function addFavoriteProfile(ownerId, input) {
  if (!ownerId) {
    const err = new Error('Missing favorites owner.');
    err.status = 400;
    err.code = 'missing_owner';
    throw err;
  }

  const profileInput = String(input?.profileUrl || input?.steamId || '').trim();
  if (!profileInput) {
    const err = new Error('Steam profile URL is required.');
    err.status = 400;
    err.code = 'missing_profile_url';
    throw err;
  }

  const steamId = await resolveSteamProfileInput(profileInput);
  const profile = await getSteamProfile(steamId);
  const store = await readStore();
  const list = resolveOwnerListForWrite(store, ownerId);
  const existing = list.find((entry) => entry.steamId === steamId);
  if (existing) {
    existing.personaname = profile.personaname || existing.personaname;
    existing.avatar = profile.avatarmedium || profile.avatar || existing.avatar;
    existing.profileUrl = profile.profileurl || existing.profileUrl;
    existing.updatedAt = new Date().toISOString();
    await writeStore(store);
    return existing;
  }

  if (list.length >= MAX_FAVORITES) {
    const err = new Error(`Favorite profiles limit reached (${MAX_FAVORITES}).`);
    err.status = 400;
    err.code = 'favorites_limit';
    throw err;
  }

  const entry = {
    steamId,
    profileUrl: profile.profileurl || `https://steamcommunity.com/profiles/${steamId}`,
    personaname: profile.personaname || `STEAM/${steamId.slice(-6)}`,
    avatar: profile.avatarmedium || profile.avatar || null,
    addedAt: new Date().toISOString(),
  };
  list.unshift(entry);
  await writeStore(store);
  return entry;
}

async function removeFavoriteProfile(ownerId, steamId) {
  if (!ownerId) {
    const err = new Error('Missing favorites owner.');
    err.status = 400;
    err.code = 'missing_owner';
    throw err;
  }

  const id = String(steamId || '').trim();
  if (!/^\d{17}$/.test(id)) {
    const err = new Error('Invalid SteamID64.');
    err.status = 400;
    err.code = 'invalid_steam_id';
    throw err;
  }

  const store = await readStore();
  if (!store.owners[ownerId] && !isLegacyClaimable(store)) return false;
  const list = resolveOwnerListForWrite(store, ownerId);
  const next = list.filter((entry) => entry.steamId !== id);
  if (next.length === list.length) return false;
  store.owners[ownerId] = next;
  await writeStore(store);
  return true;
}

async function migrateFavoriteProfilesToSteam(anonOwnerId, steamId) {
  if (!steamId) return;
  const targetOwner = `steam:${steamId}`;
  const store = await readStore();
  const sources = [];
  if (anonOwnerId && anonOwnerId !== targetOwner && store.owners[anonOwnerId]) sources.push(anonOwnerId);
  if (store.owners[LEGACY_OWNER]) sources.push(LEGACY_OWNER);
  if (!sources.length) return;

  const target = store.owners[targetOwner] || (store.owners[targetOwner] = []);
  const seen = new Set(target.map((entry) => entry.steamId));
  for (const src of sources) {
    for (const entry of store.owners[src] || []) {
      if (!entry?.steamId || seen.has(entry.steamId)) continue;
      seen.add(entry.steamId);
      target.push(entry);
    }
    delete store.owners[src];
  }
  await writeStore(store);
}

async function readStore() {
  try {
    const raw = await fs.readFile(FAVORITES_FILE, 'utf8');
    if (!raw.trim()) return { version: 1, owners: {} };
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, owners: {} };
    if (error instanceof SyntaxError) {
      const backupFile = `${FAVORITES_FILE}.corrupt-${Date.now()}`;
      await fs.rename(FAVORITES_FILE, backupFile).catch(() => {});
      return { version: 1, owners: {} };
    }
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FAVORITES_FILE, JSON.stringify(normalizeStore(store), null, 2), 'utf8');
}

function normalizeStore(raw) {
  const owners = {};
  if (raw && raw.owners && typeof raw.owners === 'object' && !Array.isArray(raw.owners)) {
    for (const [ownerId, list] of Object.entries(raw.owners)) {
      owners[ownerId] = normalizeList(list);
    }
  }
  return { version: 1, owners };
}

function normalizeList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((entry) => entry && typeof entry === 'object' && /^\d{17}$/.test(String(entry.steamId || '')))
    .map((entry) => ({
      steamId: String(entry.steamId),
      profileUrl: String(entry.profileUrl || `https://steamcommunity.com/profiles/${entry.steamId}`),
      personaname: String(entry.personaname || `STEAM/${String(entry.steamId).slice(-6)}`).slice(0, 80),
      avatar: entry.avatar ? String(entry.avatar) : null,
      addedAt: entry.addedAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || null,
    }));
}

function isLegacyClaimable(store) {
  const keys = Object.keys(store.owners);
  return keys.length === 1 && keys[0] === LEGACY_OWNER;
}

function resolveOwnerList(store, ownerId) {
  if (ownerId && store.owners[ownerId]) return store.owners[ownerId];
  if (isLegacyClaimable(store)) return store.owners[LEGACY_OWNER];
  return [];
}

function resolveOwnerListForWrite(store, ownerId) {
  if (!ownerId) {
    const err = new Error('Missing favorites owner.');
    err.status = 400;
    err.code = 'missing_owner';
    throw err;
  }
  if (store.owners[ownerId]) return store.owners[ownerId];
  if (isLegacyClaimable(store)) {
    store.owners[ownerId] = store.owners[LEGACY_OWNER];
    delete store.owners[LEGACY_OWNER];
    return store.owners[ownerId];
  }
  store.owners[ownerId] = [];
  return store.owners[ownerId];
}

module.exports = {
  listFavoriteProfiles,
  addFavoriteProfile,
  removeFavoriteProfile,
  migrateFavoriteProfilesToSteam,
};
