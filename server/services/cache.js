const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
const ENTRIES_DIR = path.join(DATA_DIR, 'cache-entries');
const SIDECAR_BYTES = 48 * 1024;
const FLUSH_DEBOUNCE_MS = 75;

let writeQueue = Promise.resolve();
let memoryCache = null;
let memoryCacheMtimeMs = 0;
let flushTimer = null;
let flushWaiters = [];
const sidecarMemory = new Map();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(ENTRIES_DIR, { recursive: true });
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
    if (!entry || typeof entry !== 'object' || !Object.prototype.hasOwnProperty.call(entry, 'value')) {
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
  await fs.writeFile(tmpFile, JSON.stringify(entry));
  await fs.rename(tmpFile, filePath);
  sidecarMemory.set(key, entry);
}

async function migrateLargeEntries(cache) {
  let changed = false;
  for (const [key, entry] of Object.entries(cache)) {
    if (!entry || entry.sidecar) continue;
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
  await fs.writeFile(tmpFile, JSON.stringify(cache));
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
  if (!entry) return readSidecar(key);
  if (entry.sidecar) return readSidecar(key);
  return entry;
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
  const entry = { updatedAt: Date.now(), value };
  const cache = memoryCache || await loadCache();

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

module.exports = {
  getCached,
  getCachedEntry,
  setCached,
  remember,
};
