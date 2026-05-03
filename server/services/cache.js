const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');
let writeQueue = Promise.resolve();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readCache() {
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

async function writeCache(cache) {
  await ensureDataDir();
  const tmpFile = `${CACHE_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(cache, null, 2));
  await fs.rename(tmpFile, CACHE_FILE);
}

async function getCached(key, maxAgeMs) {
  const cache = await readCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > maxAgeMs) return null;
  return entry.value;
}

async function setCached(key, value) {
  await enqueueWrite(async () => {
    const cache = await readCache();
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
  setCached,
  remember,
};
