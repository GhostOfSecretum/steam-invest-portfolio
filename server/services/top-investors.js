const fs = require('fs/promises');
const path = require('path');
const { resolveSteamProfileInput, getSteamProfile, getSteamInventory, isSteamCommunityCoolingDown } = require('./steam');
const {
  getInventoryActivityForSteamId,
  listInventoryActivityForSteamIds,
  syncInventoryDiffActivity,
  isStructuredActivity,
} = require('./activity');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const TOP_INVESTORS_FILE = path.join(DATA_DIR, 'top-investors.json');
const FEED_LIMIT = 100;
const POLL_BOOT_DELAY_MS = Number(process.env.TOP_INVESTORS_POLL_BOOT_MS || 5 * 60 * 1000);
const POLL_CYCLE_REST_MS = Number(process.env.TOP_INVESTORS_CYCLE_REST_MS || 3 * 60 * 1000);
const POLL_MIN_SYNC_AGE_MS = Number(process.env.TOP_INVESTORS_MIN_SYNC_AGE_MS || 10 * 60 * 1000);

let pollerStarted = false;

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

function isSteamRateLimited(error) {
  return /HTTP 429|rate limit|Too Many Requests|rate_limited/i.test(String(error?.message || error || ''));
}

function newestFirst(events) {
  return (Array.isArray(events) ? events : []).slice().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

async function syncTopInvestorInventory(account) {
  const inventory = await getSteamInventory(account.steamId, { force: false, allowCommunity: false });
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const syncedAt = inventory.syncedAt || new Date().toISOString();
  const events = await syncInventoryDiffActivity(account.steamId, items, {
    source: 'public-diff',
    syncedAt,
  });
  const activity = newestFirst(events.filter(isStructuredActivity));
  return {
    ...account,
    syncedAt,
    hasBaseline: true,
    baselineOnly: activity.length === 0,
    activity,
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
      return await syncTopInvestorInventory(account);
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
    activity: newestFirst(stored.events),
  };
}

async function runTopInvestorsActivityCycle() {
  if (isSteamCommunityCoolingDown()) {
    console.log('[top-investors] skip cycle: steam community cooling down');
    return;
  }

  const listed = await listTopInvestors();
  const accounts = listed.accounts || [];
  let skipped = 0;
  let due = null;

  for (const account of accounts) {
    try {
      const stored = await getInventoryActivityForSteamId(account.steamId);
      const ageMs = stored.syncedAt ? Date.now() - new Date(stored.syncedAt).getTime() : Infinity;
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < POLL_MIN_SYNC_AGE_MS) {
        skipped += 1;
        continue;
      }
      due = account;
      break;
    } catch (error) {
      console.warn(`[top-investors] read ${account.personaname || account.steamId} failed:`, error.message || error);
    }
  }

  if (!due) {
    if (skipped) console.log(`[top-investors] auto-sync cycle synced=0 skipped=${skipped} failed=0`);
    return;
  }

  try {
    await syncTopInvestorInventory(due);
    console.log(`[top-investors] auto-sync cycle synced=1 skipped=${skipped} failed=0`);
  } catch (error) {
    console.warn(`[top-investors] auto-sync ${due.personaname || due.steamId} failed:`, error.message || error);
    if (isSteamRateLimited(error) || isSteamCommunityCoolingDown()) {
      console.warn('[top-investors] aborting cycle after Steam rate limit');
    }
  }
}

function startTopInvestorsActivityPoller() {
  if (pollerStarted) return;
  if (String(process.env.TOP_INVESTORS_POLL || '1') === '0') {
    console.log('[top-investors] activity poller disabled');
    return;
  }
  pollerStarted = true;

  const tick = async () => {
    try {
      await runTopInvestorsActivityCycle();
    } catch (error) {
      console.warn('[top-investors] poller cycle failed:', error.message || error);
    } finally {
      setTimeout(tick, POLL_CYCLE_REST_MS);
    }
  };

  console.log('[top-investors] activity poller started');
  setTimeout(tick, POLL_BOOT_DELAY_MS);
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
  startTopInvestorsActivityPoller,
};
