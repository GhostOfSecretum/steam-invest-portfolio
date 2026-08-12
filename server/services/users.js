const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Serialize writes so concurrent Steam callbacks don't clobber each other.
let writeQueue = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { version: 1, users: {} };
    if (!parsed.users || typeof parsed.users !== 'object') return { version: 1, users: {} };
    return { version: 1, users: parsed.users };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { version: 1, users: {} };
    throw error;
  }
}

async function writeStore(store) {
  await ensureDataDir();
  const tmp = `${USERS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, USERS_FILE);
}

function normalizeSteamId(steamId) {
  const id = String(steamId || '').trim();
  return /^\d{17}$/.test(id) ? id : null;
}

/**
 * Record a successful Steam login. Stores only SteamID64 + timestamps/counts.
 * Never throws — login flow must not fail because analytics failed.
 */
async function recordSteamLogin(steamId, { source = 'steam_openid' } = {}) {
  const id = normalizeSteamId(steamId);
  if (!id) return null;

  const src = String(source || 'steam_openid').slice(0, 40);
  const nowIso = new Date().toISOString();

  const run = writeQueue.then(async () => {
    const store = await readStore();
    const prev = store.users[id];
    if (prev && typeof prev === 'object') {
      store.users[id] = {
        firstSeenAt: prev.firstSeenAt || nowIso,
        lastSeenAt: nowIso,
        loginCount: Math.max(1, Number(prev.loginCount) || 0) + 1,
        sources: Array.from(new Set([...(Array.isArray(prev.sources) ? prev.sources : []), src])).slice(0, 10),
      };
    } else {
      store.users[id] = {
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        loginCount: 1,
        sources: [src],
      };
    }
    await writeStore(store);
    return store.users[id];
  });

  writeQueue = run.catch(() => {});
  try {
    return await run;
  } catch (error) {
    console.warn('[users] failed to record Steam login:', error?.message || error);
    return null;
  }
}

async function getSteamLoginStats() {
  const store = await readStore();
  const users = Object.entries(store.users)
    .filter(([steamId, entry]) => normalizeSteamId(steamId) && entry && typeof entry === 'object')
    .map(([steamId, entry]) => ({
      steamId,
      firstSeenAt: entry.firstSeenAt || null,
      lastSeenAt: entry.lastSeenAt || null,
      loginCount: Math.max(0, Number(entry.loginCount) || 0),
      sources: Array.isArray(entry.sources) ? entry.sources : [],
    }))
    .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));

  return {
    uniqueUsers: users.length,
    totalLogins: users.reduce((sum, u) => sum + u.loginCount, 0),
    users,
  };
}

module.exports = {
  recordSteamLogin,
  getSteamLoginStats,
};
