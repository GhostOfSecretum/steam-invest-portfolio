const fs = require('fs/promises');
const path = require('path');
const { resolveSteamProfileInput, getSteamProfile, getSteamInventory } = require('./steam');
const {
  getInventoryActivityForSteamId,
  listInventoryActivityForSteamIds,
  syncInventoryDiffActivity,
  isStructuredActivity,
  markInventoryActivityAttempt,
  annotateInventoryEventPrices,
  readInventoryActivityStore,
} = require('./activity');
const { getCached } = require('./cache');
const { getSteamMarketIcon, getPrices } = require('./prices');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const TOP_INVESTORS_FILE = path.join(DATA_DIR, 'top-investors.json');
const FEED_LIMIT = 100;
const POLL_BOOT_DELAY_MS = Number(process.env.TOP_INVESTORS_POLL_BOOT_MS || 20 * 1000);
const POLL_CYCLE_REST_MS = Number(process.env.TOP_INVESTORS_CYCLE_REST_MS || 5 * 1000);
const POLL_MIN_SYNC_AGE_MS = Number(process.env.TOP_INVESTORS_MIN_SYNC_AGE_MS || 5 * 60 * 1000);
const POLL_IDLE_MS = Number(process.env.TOP_INVESTORS_POLL_IDLE_MS || 30 * 1000);
const RATE_LIMIT_REST_MS = Number(process.env.TOP_INVESTORS_RATE_LIMIT_REST_MS || 2 * 60 * 1000);
const BACKFILL_RETRY_MS = Number(process.env.TOP_INVESTORS_BACKFILL_RETRY_MS || 30 * 60 * 1000);
const SMART_MONEY_REFRESH_DELAY_MS = 20 * 1000;
const PRICE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SYNC_LIVE_PRICE_LIMIT = 8;

let pollerStarted = false;
let smartMoneyRefreshTimer = null;

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
    events: (await hydrateActivityPrices(await hydrateActivityIcons(events))).map((event) => {
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

function unitPriceFromQuote(quote) {
  if (!quote || typeof quote !== 'object') return null;
  const priceUsd = Number(quote.price ?? quote.medianPrice);
  const priceRub = Number(quote.priceRub ?? quote.medianPriceRub);
  if (!Number.isFinite(priceUsd) && !Number.isFinite(priceRub)) return null;
  return {
    priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
    priceRub: Number.isFinite(priceRub) ? priceRub : null,
  };
}

async function hydrateActivityPrices(events) {
  const rows = Array.isArray(events) ? events : [];
  const names = [...new Set(rows.filter((event) => event?.marketHashName && !Number.isFinite(Number(event.priceUsd))).map((event) => event.marketHashName))];
  if (!names.length) return rows;

  const quotes = {};
  await Promise.all(names.map(async (name) => {
    const cached = await getCached(`price:v4:${name}`, PRICE_CACHE_MAX_AGE_MS).catch(() => null);
    const unit = unitPriceFromQuote(cached);
    if (unit) quotes[name] = unit;
  }));
  if (!Object.keys(quotes).length) return rows;
  return rows.map((event) => (
    Number.isFinite(Number(event.priceUsd)) || !quotes[event.marketHashName]
      ? event
      : { ...event, ...quotes[event.marketHashName] }
  ));
}

async function priceAddedEvents(steamId, added) {
  const rows = Array.isArray(added) ? added.filter((event) => event?.id && event.marketHashName) : [];
  if (!rows.length) return;

  const quotes = {};
  const uncached = [];
  for (const name of [...new Set(rows.map((event) => event.marketHashName))]) {
    const cached = await getCached(`price:v4:${name}`, PRICE_CACHE_MAX_AGE_MS).catch(() => null);
    const unit = unitPriceFromQuote(cached);
    if (unit) quotes[name] = unit;
    else uncached.push(name);
  }

  const liveNames = uncached.slice(0, SYNC_LIVE_PRICE_LIMIT);
  if (liveNames.length) {
    try {
      const live = await getPrices(liveNames, liveNames.length, { concurrency: 2, batchDelayMs: 200 });
      for (const name of liveNames) {
        const unit = unitPriceFromQuote(live[name]);
        if (unit) quotes[name] = unit;
      }
    } catch (error) {
      console.warn('[top-investors] price lookup failed:', error.message || error);
    }
  }

  const annotations = rows.map((event) => {
    const unit = quotes[event.marketHashName];
    return unit ? { id: event.id, ...unit } : null;
  }).filter(Boolean);
  if (annotations.length) await annotateInventoryEventPrices(steamId, annotations);
}

function activityTouchedAt(stored) {
  const stamps = [stored?.syncedAt, stored?.lastAttemptAt]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  return stamps.length ? Math.max(...stamps) : null;
}

async function hydrateActivityIcons(events) {
  const rows = Array.isArray(events) ? events : [];
  const names = [...new Set(rows.filter((event) => event?.marketHashName && !event.iconUrl).map((event) => event.marketHashName))];
  if (!names.length) return rows;

  const icons = {};
  await Promise.all(names.map(async (name) => {
    const iconUrl = await getSteamMarketIcon(name, { cachedOnly: true }).catch(() => null);
    if (iconUrl) icons[name] = iconUrl;
  }));

  if (!Object.keys(icons).length) return rows;
  return rows.map((event) => (event.iconUrl || !icons[event.marketHashName] ? event : { ...event, iconUrl: icons[event.marketHashName] }));
}

function scheduleSmartMoneyRefresh() {
  try {
    require('./top-investors-analytics').invalidateTopInvestorsAnalytics();
  } catch (error) {
    console.warn('[top-investors] analytics cache reset failed:', error.message || error);
  }
  clearTimeout(smartMoneyRefreshTimer);
  smartMoneyRefreshTimer = setTimeout(() => {
    require('./smart-money').runSmartMoneyScan()
      .catch((error) => console.warn('[top-investors] smart money scan failed:', error.message || error));
  }, SMART_MONEY_REFRESH_DELAY_MS);
}

async function syncTopInvestorInventory(account, { priority = 1 } = {}) {
  const prior = await getInventoryActivityForSteamId(account.steamId);
  const priorIds = new Set((prior.events || []).map((event) => event.id));
  const hadBaseline = prior.hasBaseline;
  const inventory = await getSteamInventory(account.steamId, { force: true, allowCommunity: true, priority });
  if (inventory.cached || inventory.stale) {
    const err = new Error('Steam inventory was not refreshed.');
    err.status = 503;
    err.code = 'inventory_stale';
    throw err;
  }
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const syncedAt = inventory.syncedAt || new Date().toISOString();
  const events = await syncInventoryDiffActivity(account.steamId, items, {
    source: 'public-diff',
    syncedAt,
    hiddenCount: inventory.hiddenCount,
  });
  const added = events.filter((event) => isStructuredActivity(event) && event.id && !priorIds.has(event.id));
  if (added.length) await priceAddedEvents(account.steamId, added);
  if (added.length || !hadBaseline) scheduleSmartMoneyRefresh();
  const stored = added.length ? await getInventoryActivityForSteamId(account.steamId) : null;
  const activity = newestFirst(await hydrateActivityPrices(await hydrateActivityIcons(
    (stored ? stored.events : events).filter(isStructuredActivity),
  )));
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
    activity: newestFirst(await hydrateActivityPrices(await hydrateActivityIcons(stored.events))),
  };
}

// Refresh accounts that already have a snapshot first (those are the trades on screen).
// Fill in accounts that have never been snapshotted once the watched ones are fresh.
// A failed read is stamped and skipped so one private or rate-limited profile cannot block the rest.
function pickDueAccount(accounts, store, now) {
  const missing = [];
  let stalest = null;
  let stalestAt = Infinity;

  for (const account of accounts) {
    const entry = store[account.steamId];
    const hasSnapshot = Boolean(entry?.snapshot && typeof entry.snapshot === 'object');
    if (!hasSnapshot) {
      const triedAt = new Date(entry?.lastAttemptAt).getTime();
      if (!Number.isFinite(triedAt) || now - triedAt > BACKFILL_RETRY_MS) missing.push(account);
      continue;
    }
    const touchedAt = activityTouchedAt(entry);
    const ageMs = touchedAt ? now - touchedAt : Infinity;
    if (ageMs < POLL_MIN_SYNC_AGE_MS) continue;
    const stamp = touchedAt ?? 0;
    if (stamp < stalestAt) {
      stalestAt = stamp;
      stalest = account;
    }
  }

  if (stalest) return { account: stalest, backfill: false };
  if (missing.length) return { account: missing[0], backfill: true };
  return { account: null, backfill: false };
}

async function runTopInvestorsActivityCycle() {
  const listed = await listTopInvestors();
  const accounts = listed.accounts || [];
  const store = await readInventoryActivityStore();
  const picked = pickDueAccount(accounts, store, Date.now());
  const due = picked.account;

  if (!due) return { waitMs: POLL_IDLE_MS };

  try {
    // Priority 2 stays behind a visitor's own inventory request on the Steam queue.
    await syncTopInvestorInventory(due, { priority: 2 });
    console.log(`[top-investors] auto-sync ${picked.backfill ? 'backfill' : 'cycle'} ${due.personaname || due.steamId}`);
    return { waitMs: POLL_CYCLE_REST_MS };
  } catch (error) {
    console.warn(`[top-investors] auto-sync ${due.personaname || due.steamId} failed:`, error.message || error);
    await markInventoryActivityAttempt(due.steamId).catch(() => {});
    if (isSteamRateLimited(error)) {
      console.warn('[top-investors] pausing after Steam rate limit');
      return { waitMs: RATE_LIMIT_REST_MS };
    }
    return { waitMs: POLL_CYCLE_REST_MS };
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
    let waitMs = POLL_CYCLE_REST_MS;
    try {
      const result = await runTopInvestorsActivityCycle();
      if (Number.isFinite(result?.waitMs) && result.waitMs >= 0) waitMs = result.waitMs;
    } catch (error) {
      console.warn('[top-investors] poller cycle failed:', error.message || error);
    } finally {
      setTimeout(tick, waitMs);
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
