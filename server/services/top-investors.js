const fs = require('fs/promises');
const path = require('path');
const { resolveSteamProfileInput, getSteamProfile } = require('./steam');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const TOP_INVESTORS_FILE = path.join(DATA_DIR, 'top-investors.json');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore() {
  try {
    const raw = await fs.readFile(TOP_INVESTORS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { accounts: [] };
    if (!Array.isArray(parsed.accounts)) return { accounts: [] };
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const empty = {
        updatedAt: null,
        note: 'Add curated investor Steam accounts here later.',
        accounts: [],
      };
      await ensureDataDir();
      await fs.writeFile(TOP_INVESTORS_FILE, JSON.stringify(empty, null, 2), 'utf8');
      return empty;
    }
    throw error;
  }
}

function normalizeAccount(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const steamId = String(entry.steamId || '').trim();
  if (!/^\d{17}$/.test(steamId)) return null;
  return {
    steamId,
    profileUrl: entry.profileUrl || `https://steamcommunity.com/profiles/${steamId}`,
    personaname: entry.personaname || `STEAM/${steamId.slice(-6)}`,
    avatar: entry.avatar || null,
    note: entry.note || '',
    tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    addedAt: entry.addedAt || null,
  };
}

async function listTopInvestors() {
  const store = await readStore();
  const accounts = store.accounts.map(normalizeAccount).filter(Boolean);
  return {
    updatedAt: store.updatedAt || null,
    comingSoon: accounts.length === 0,
    accounts,
  };
}

async function upsertTopInvestor(input) {
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
  const existing = store.accounts.find((entry) => entry.steamId === steamId);
  const entry = {
    steamId,
    profileUrl: profile.profileurl || `https://steamcommunity.com/profiles/${steamId}`,
    personaname: profile.personaname || `STEAM/${steamId.slice(-6)}`,
    avatar: profile.avatarmedium || profile.avatar || null,
    note: String(input?.note || existing?.note || '').trim(),
    tags: Array.isArray(input?.tags) ? input.tags.map(String) : (existing?.tags || []),
    addedAt: existing?.addedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, entry);
  } else {
    store.accounts.unshift(entry);
  }
  store.updatedAt = new Date().toISOString();
  await ensureDataDir();
  await fs.writeFile(TOP_INVESTORS_FILE, JSON.stringify(store, null, 2), 'utf8');
  return normalizeAccount(entry);
}

module.exports = {
  listTopInvestors,
  upsertTopInvestor,
};
