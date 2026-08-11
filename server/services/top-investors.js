const fs = require('fs/promises');
const path = require('path');
const { resolveSteamProfileInput, getSteamProfile } = require('./steam');
const {
  getInventoryActivityForSteamId,
  listInventoryActivityForSteamIds,
} = require('./activity');
const { getPortfolio } = require('./portfolio');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const TOP_INVESTORS_FILE = path.join(DATA_DIR, 'top-investors.json');
const FEED_LIMIT = 100;

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

function findTopInvestorAccount(store, steamId) {
  const id = String(steamId || '').trim();
  if (!/^\d{17}$/.test(id)) return null;
  return store.accounts.map(normalizeAccount).filter(Boolean).find((entry) => entry.steamId === id) || null;
}

async function listTopInvestorsActivityFeed({ limit = FEED_LIMIT } = {}) {
  const listed = await listTopInvestors();
  const accountsById = new Map(listed.accounts.map((account) => [account.steamId, account]));
  const events = await listInventoryActivityForSteamIds(
    listed.accounts.map((account) => account.steamId),
    { limit },
  );

  return {
    updatedAt: listed.updatedAt,
    events: events.map((event) => {
      const account = accountsById.get(event.steamId);
      return {
        ...event,
        personaname: account?.personaname || null,
        avatar: account?.avatar || null,
        profileUrl: account?.profileUrl || `https://steamcommunity.com/profiles/${event.steamId}`,
      };
    }),
  };
}

async function getTopInvestorActivity(steamId, { sync = false } = {}) {
  const store = await readStore();
  const account = findTopInvestorAccount(store, steamId);
  if (!account) {
    const err = new Error('Top investor account not found.');
    err.status = 404;
    err.code = 'top_investor_not_found';
    throw err;
  }

  if (sync) {
    try {
      const portfolio = await getPortfolio(account.steamId, {
        force: true,
        includeDesktop: false,
        activitySource: 'public-diff',
      });
      const activity = Array.isArray(portfolio.activity) ? portfolio.activity : [];
      return {
        ...account,
        syncedAt: portfolio.syncedAt || null,
        hasBaseline: true,
        baselineOnly: activity.length === 0,
        activity,
      };
    } catch (error) {
      const err = new Error(error.message || 'Failed to sync investor inventory.');
      err.status = error.status || 502;
      err.code = error.code || 'investor_sync_failed';
      throw err;
    }
  }

  const stored = await getInventoryActivityForSteamId(account.steamId);
  return {
    ...account,
    syncedAt: stored.syncedAt,
    hasBaseline: stored.hasBaseline,
    baselineOnly: stored.hasBaseline && stored.events.length === 0,
    activity: stored.events,
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
  listTopInvestorsActivityFeed,
  getTopInvestorActivity,
};
