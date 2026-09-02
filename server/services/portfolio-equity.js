const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const EQUITY_FILE = path.join(DATA_DIR, 'portfolio-equity.json');
const MAX_POINTS = 800;

let writeQueue = Promise.resolve();

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

async function readStore() {
  try {
    const raw = await fs.readFile(EQUITY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    console.error('[portfolio-equity] corrupt portfolio-equity.json, resetting:', error.message);
    return {};
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${EQUITY_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(store)}\n`);
  await fs.rename(tmp, EQUITY_FILE);
}

function withStore(mutator) {
  const run = writeQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
  writeQueue = run.catch((error) => {
    console.warn('[portfolio-equity] write failed:', error.message);
  });
  return run;
}

function normalizePoints(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => {
      const date = String(point?.date || '').slice(0, 10);
      const value = roundMoney(point?.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value == null || value <= 0) return null;
      const steamValue = roundMoney(point?.steamValue);
      const itemCount = Number.isFinite(Number(point?.itemCount)) ? Number(point.itemCount) : null;
      return {
        date,
        value,
        steamValue: steamValue != null && steamValue > 0 ? steamValue : null,
        itemCount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function upsertToday(points, snapshot) {
  const date = todayUtc();
  const value = roundMoney(snapshot?.value);
  if (value == null || value <= 0) return normalizePoints(points);

  const next = normalizePoints(points).filter((point) => point.date !== date);
  next.push({
    date,
    value,
    steamValue: roundMoney(snapshot?.steamValue),
    itemCount: Number.isFinite(Number(snapshot?.itemCount)) ? Number(snapshot.itemCount) : null,
  });
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
}

function toHistory(points) {
  const series = normalizePoints(points);
  return {
    points: series.map((point) => ({
      date: point.date,
      value: point.value,
      steamValue: point.steamValue,
    })),
    coveragePct: series.length ? 100 : 0,
    itemCount: series.length,
    sources: series.length ? ['recorded'] : [],
    synthetic: false,
    recorded: true,
    since: series[0]?.date || null,
  };
}

async function capturePortfolioEquity(portfolioKey, snapshot = {}, { record = true } = {}) {
  const key = String(portfolioKey || '').trim();
  if (!key) return toHistory([]);

  const liveValue = roundMoney(snapshot.value);
  const canRecord = record && liveValue != null && liveValue > 0;

  try {
    if (canRecord) {
      const points = await withStore((store) => {
        const entry = store[key] && typeof store[key] === 'object' ? store[key] : { points: [] };
        const points = upsertToday(entry.points, snapshot);
        store[key] = { points, updatedAt: new Date().toISOString() };
        return points;
      });
      return toHistory(points);
    }

    const store = await readStore();
    return toHistory(store[key]?.points);
  } catch (error) {
    console.warn('[portfolio-equity] read/write failed:', error.message);
    return toHistory(canRecord ? upsertToday([], snapshot) : []);
  }
}

module.exports = {
  capturePortfolioEquity,
};
