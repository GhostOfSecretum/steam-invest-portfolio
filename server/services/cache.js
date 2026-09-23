const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const ENTRIES_DIR = path.join(DATA_DIR, 'cache-entries');
const SIDECAR_BYTES = 48 * 1024;
const FLUSH_DEBOUNCE_MS = 75;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

// Values under these prefixes are user data: inventories, device tokens, pairing
// and login codes. Market price lists are deliberately left in plaintext — they
// are public, they are the bulk of the cache, and encrypting them would burn CPU
// on every read for nothing.
const SENSITIVE_KEY_RE = /^(desktop:|steam:inventory:)/;

// Encryption protects a leaked copy of .data — a stray backup, a snapshot, a
// misconfigured file server. It cannot protect against an attacker who already
// runs code on this host, since the key is readable there by definition.
function loadEncryptionKey() {
  const raw = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes: 64 hex characters or base64.');
  }
  return key;
}

const encryptionKey = loadEncryptionKey();
if (!encryptionKey && process.env.NODE_ENV === 'production') {
  console.warn('[cache] DATA_ENCRYPTION_KEY is not set — inventories and device tokens are stored unencrypted.');
}

// An entry carries data either as a plain `value` or as encrypted `enc`.
function hasPayload(entry) {
  return Object.prototype.hasOwnProperty.call(entry, 'value')
    || Object.prototype.hasOwnProperty.call(entry, 'enc');
}

function encodeEntry(key, entry) {
  if (!encryptionKey || !SENSITIVE_KEY_RE.test(String(key))) return entry;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(entry.value), 'utf8'),
    cipher.final(),
  ]);
  return {
    updatedAt: entry.updatedAt,
    enc: Buffer.concat([iv, cipher.getAuthTag(), payload]).toString('base64'),
  };
}

// A key that is missing, rotated or wrong turns into a cache miss rather than a
// crash: inventories get re-synced and device tokens get re-paired, which is
// recoverable, whereas a boot loop is not.
function decodeEntry(entry) {
  if (!entry || !entry.enc) return entry;
  if (!encryptionKey) return null;
  try {
    const raw = Buffer.from(entry.enc, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    return { updatedAt: entry.updatedAt, value: JSON.parse(json) };
  } catch {
    return null;
  }
}

let writeQueue = Promise.resolve();
let memoryCache = null;
let memoryCacheMtimeMs = 0;
let flushTimer = null;
let flushWaiters = [];
const sidecarMemory = new Map();

let permissionsTightened = false;

// mkdir's mode is subject to umask and does nothing for directories that already
// exist, so existing data written before this change is chmod'ed once on boot.
async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: DIR_MODE });
  await fs.mkdir(ENTRIES_DIR, { recursive: true, mode: DIR_MODE });
  if (permissionsTightened) return;
  permissionsTightened = true;

  for (const dir of [DATA_DIR, ENTRIES_DIR]) {
    try {
      await fs.chmod(dir, DIR_MODE);
      const names = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(names
        .filter((item) => item.isFile())
        .map((item) => fs.chmod(path.join(dir, item.name), FILE_MODE).catch(() => {})));
    } catch (error) {
      console.warn(`[cache] could not tighten permissions on ${dir}:`, error.message);
    }
  }
}

async function getCacheMtimeMs() {
  try {
    const stat = await fs.stat(CACHE_FILE);
    return stat.mtimeMs;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function readCacheFromDisk() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) {
      await backupCorruptCache();
      return {};
    }
    throw error;
  }
}

function sidecarPathForKey(key) {
  const hash = crypto.createHash('sha1').update(String(key)).digest('hex');
  return path.join(ENTRIES_DIR, `${hash}.json`);
}

function shouldUseSidecar(key, value) {
  const name = String(key || '');
  if (/^(csmarketapi:items$|pricelist:|steam:inventory:|history:|csmarketapi:history:)/.test(name)) {
    return true;
  }
  if (Array.isArray(value) && value.length > 80) return true;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.data) && value.data.length > 40) return true;
    if (Array.isArray(value.items) && value.items.length > 40) return true;
  }
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') >= SIDECAR_BYTES;
  } catch {
    return false;
  }
}

async function readSidecar(key) {
  if (sidecarMemory.has(key)) return sidecarMemory.get(key);
  try {
    const raw = await fs.readFile(sidecarPathForKey(key), 'utf8');
    const entry = JSON.parse(raw);
    if (!entry || typeof entry !== 'object' || !hasPayload(entry)) {
      return null;
    }
    sidecarMemory.set(key, entry);
    return entry;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function writeSidecar(key, entry) {
  await ensureDataDir();
  const filePath = sidecarPathForKey(key);
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(entry), { mode: FILE_MODE });
  await fs.rename(tmpFile, filePath);
  sidecarMemory.set(key, entry);
}

async function migrateLargeEntries(cache) {
  let changed = false;
  for (const [key, entry] of Object.entries(cache)) {
    if (!entry || entry.sidecar) continue;
    // Encrypted entries are already written in their final shape and their size
    // says nothing about item count, so they are left where they are.
    if (!Object.prototype.hasOwnProperty.call(entry, 'value')) continue;
    if (!shouldUseSidecar(key, entry.value)) continue;
    await writeSidecar(key, entry);
    cache[key] = { updatedAt: entry.updatedAt || Date.now(), sidecar: true };
    changed = true;
  }
  return changed;
}

let loadCacheInflight = null;

async function loadCache(force = false) {
  // Single-process app: once memory is warm, keep serving it. Re-reading the multi-MB
  // cache.json on every setCached mtime bump made portfolio pricing take 20s+.
  if (!force && memoryCache) return memoryCache;
  if (!force && loadCacheInflight) return loadCacheInflight;

  loadCacheInflight = (async () => {
    if (!force && memoryCache) return memoryCache;

    const cache = await readCacheFromDisk();
    const migrated = await migrateLargeEntries(cache);
    memoryCache = cache;
    if (migrated) {
      await writeCacheNow(cache);
    } else {
      memoryCacheMtimeMs = await getCacheMtimeMs();
    }
    return memoryCache;
  })().finally(() => {
    loadCacheInflight = null;
  });

  return loadCacheInflight;
}

async function writeCacheNow(cache) {
  await ensureDataDir();
  const tmpFile = `${CACHE_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(cache), { mode: FILE_MODE });
  await fs.rename(tmpFile, CACHE_FILE);
  memoryCache = cache;
  memoryCacheMtimeMs = await getCacheMtimeMs();
}

function scheduleMainFlush() {
  return new Promise((resolve, reject) => {
    flushWaiters.push({ resolve, reject });
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const waiters = flushWaiters;
      flushWaiters = [];
      enqueueWrite(async () => {
        if (memoryCache) await writeCacheNow(memoryCache);
      }).then(
        () => waiters.forEach((waiter) => waiter.resolve()),
        (error) => waiters.forEach((waiter) => waiter.reject(error)),
      );
    }, FLUSH_DEBOUNCE_MS);
  });
}

async function resolveEntry(key) {
  const cache = await loadCache();
  const entry = cache[key];
  if (!entry || entry.sidecar) return decodeEntry(await readSidecar(key));
  return decodeEntry(entry);
}

async function getCached(key, maxAgeMs) {
  const entry = await resolveEntry(key);
  if (!entry || !Object.prototype.hasOwnProperty.call(entry, 'value')) return null;
  if (Date.now() - entry.updatedAt > maxAgeMs) return null;
  return entry.value;
}

async function getCachedEntry(key) {
  const entry = await resolveEntry(key);
  if (!entry || !Object.prototype.hasOwnProperty.call(entry, 'value')) return null;
  return { value: entry.value, updatedAt: entry.updatedAt };
}

async function setCached(key, value) {
  const entry = encodeEntry(key, { updatedAt: Date.now(), value });
  const cache = memoryCache || await loadCache();

  // The sidecar decision is made on the plaintext value: ciphertext size says
  // nothing useful about how many items an entry holds.
  if (shouldUseSidecar(key, value)) {
    await writeSidecar(key, entry);
    cache[key] = { updatedAt: entry.updatedAt, sidecar: true };
  } else {
    cache[key] = entry;
    sidecarMemory.delete(key);
  }

  memoryCache = cache;
  await scheduleMainFlush();
  return value;
}

async function remember(key, maxAgeMs, loader) {
  const cached = await getCached(key, maxAgeMs);
  if (cached) return { value: cached, cached: true };
  const value = await loader();
  await setCached(key, value);
  return { value, cached: false };
}

function enqueueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

async function backupCorruptCache() {
  try {
    const backupFile = `${CACHE_FILE}.corrupt-${Date.now()}`;
    await fs.rename(CACHE_FILE, backupFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

// Tightening permissions must not depend on the cache being touched: an instance
// that only serves static pages would otherwise leave .data world-readable.
ensureDataDir().catch((error) => {
  console.warn('[cache] could not prepare the data directory:', error.message);
});

module.exports = {
  getCached,
  getCachedEntry,
  setCached,
  remember,
};
