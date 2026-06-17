const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
let writeQueue = Promise.resolve();
let memoryCache = null;
let memoryCacheMtimeMs = 0;

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
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

async function loadCache(force = false) {
  const mtimeMs = await getCacheMtimeMs();
  if (!force && memoryCache && memoryCacheMtimeMs === mtimeMs) {
    return memoryCache;
  }

  memoryCache = await readCacheFromDisk();
  memoryCacheMtimeMs = mtimeMs;
  return memoryCache;
}

async function writeCache(cache) {
  await ensureDataDir();
  const tmpFile = `${CACHE_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(cache));
  await fs.rename(tmpFile, CACHE_FILE);
  memoryCache = cache;
  memoryCacheMtimeMs = await getCacheMtimeMs();
}

async function getCached(key, maxAgeMs) {
  const cache = await loadCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > maxAgeMs) return null;
  return entry.value;
}

async function getCachedEntry(key) {
  const cache = await loadCache();
  const entry = cache[key];
  if (!entry) return null;
  return { value: entry.value, updatedAt: entry.updatedAt };
}

async function setCached(key, value) {
  await enqueueWrite(async () => {
    const cache = await loadCache();
    cache[key] = { updatedAt: Date.now(), value };
    await writeCache(cache);
  });
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
