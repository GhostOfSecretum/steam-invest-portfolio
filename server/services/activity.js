const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const INVENTORY_ACTIVITY_FILE = path.join(DATA_DIR, 'inventory-activity.json');
const MAX_EVENTS = 150;

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function makeActivityEvent(partial = {}) {
  const qtyBefore = Number.isFinite(partial.qtyBefore) ? partial.qtyBefore : null;
  const qtyAfter = Number.isFinite(partial.qtyAfter) ? partial.qtyAfter : null;
  const qtyDelta = Number.isFinite(partial.qtyDelta)
    ? partial.qtyDelta
    : (qtyBefore != null && qtyAfter != null ? qtyAfter - qtyBefore : null);

  return {
    id: partial.id || `evt-${crypto.randomUUID()}`,
    at: partial.at || new Date().toISOString(),
    kind: partial.kind || 'updated',
    marketHashName: partial.marketHashName || null,
    name: partial.name || partial.marketHashName || null,
    qtyBefore,
    qtyAfter,
    qtyDelta,
    basisPerUnit: Number.isFinite(partial.basisPerUnit) ? partial.basisPerUnit : null,
    currency: partial.currency || null,
    source: partial.source || 'manual',
  };
}

function trimEvents(events) {
  const list = Array.isArray(events) ? events : [];
  if (list.length <= MAX_EVENTS) return list;
  return list.slice(list.length - MAX_EVENTS);
}

function appendEvent(events, event) {
  return trimEvents([...(Array.isArray(events) ? events : []), event]);
}

function isStructuredActivity(event) {
  return Boolean(event && typeof event === 'object' && event.kind && event.at);
}

function buildQtySnapshot(items) {
  const snapshot = {};
  for (const item of items || []) {
    const name = String(item.marketHashName || '').trim();
    if (!name) continue;
    const qty = Number(item.qty ?? item.quantity ?? item.amount) || 0;
    if (qty <= 0) continue;
    snapshot[name] = (snapshot[name] || 0) + qty;
  }
  return snapshot;
}

function snapshotsEqual(a, b) {
  const left = a || {};
  const right = b || {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] || 0) !== (right[key] || 0)) return false;
  }
  return true;
}

function diffSnapshots(prevSnapshot, nextSnapshot, { source, at } = {}) {
  const prev = prevSnapshot || {};
  const next = nextSnapshot || {};
  const names = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const events = [];
  const stamp = at || new Date().toISOString();

  for (const marketHashName of names) {
    const qtyBefore = prev[marketHashName] || 0;
    const qtyAfter = next[marketHashName] || 0;
    if (qtyBefore === qtyAfter) continue;

    let kind = 'updated';
    if (qtyBefore === 0 && qtyAfter > 0) kind = 'added';
    else if (qtyAfter === 0 && qtyBefore > 0) kind = 'removed';
    else if (qtyAfter > qtyBefore) kind = 'qty_up';
    else kind = 'qty_down';

    events.push(makeActivityEvent({
      at: stamp,
      kind,
      marketHashName,
      name: marketHashName,
      qtyBefore,
      qtyAfter,
      qtyDelta: qtyAfter - qtyBefore,
      source: source || 'steam-diff',
    }));
  }

  return events;
}

function backfillManualEvents(portfolio) {
  const existing = Array.isArray(portfolio?.events) ? portfolio.events.filter(isStructuredActivity) : [];
  if (existing.length) return existing;

  const items = Array.isArray(portfolio?.items) ? portfolio.items : [];
  return trimEvents(
    items
      .map((item) => {
        const qty = Number(item.quantity ?? item.amount) || 0;
        const basis = item.basis || {};
        return makeActivityEvent({
          at: item.createdAt || item.updatedAt || portfolio.createdAt || new Date().toISOString(),
          kind: 'added',
          marketHashName: item.marketHashName,
          name: item.name || item.marketHashName,
          qtyBefore: 0,
          qtyAfter: qty,
          qtyDelta: qty,
          basisPerUnit: Number.isFinite(basis.amount) ? basis.amount : (Number.isFinite(basis.usdPerUnit) ? basis.usdPerUnit : null),
          currency: basis.currency || null,
          source: 'manual',
        });
      })
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
  );
}

async function readInventoryActivityStore() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(INVENTORY_ACTIVITY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    console.error('[activity] corrupt inventory-activity.json, resetting:', error.message);
    return {};
  }
}

async function writeInventoryActivityStore(store) {
  await ensureDataDir();
  await fs.writeFile(INVENTORY_ACTIVITY_FILE, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

async function syncInventoryDiffActivity(steamId, items, { source = 'steam-diff', syncedAt = null } = {}) {
  if (!steamId) return [];

  const store = await readInventoryActivityStore();
  const key = String(steamId);
  const entry = store[key] || { snapshot: null, syncedAt: null, events: [] };
  const nextSnapshot = buildQtySnapshot(items);
  const stamp = syncedAt || new Date().toISOString();

  if (!entry.snapshot || typeof entry.snapshot !== 'object') {
    store[key] = {
      snapshot: nextSnapshot,
      syncedAt: stamp,
      events: trimEvents(entry.events || []),
    };
    await writeInventoryActivityStore(store);
    return store[key].events;
  }

  if (snapshotsEqual(entry.snapshot, nextSnapshot)) {
    return trimEvents(entry.events || []);
  }

  const diffEvents = diffSnapshots(entry.snapshot, nextSnapshot, { source, at: stamp });
  const events = trimEvents([...(entry.events || []), ...diffEvents]);
  store[key] = {
    snapshot: nextSnapshot,
    syncedAt: stamp,
    events,
  };
  await writeInventoryActivityStore(store);
  return events;
}

async function getInventoryActivityForSteamId(steamId) {
  const key = String(steamId || '').trim();
  if (!/^\d{17}$/.test(key)) {
    return {
      steamId: key,
      syncedAt: null,
      hasBaseline: false,
      events: [],
    };
  }

  const store = await readInventoryActivityStore();
  const entry = store[key] || null;
  return {
    steamId: key,
    syncedAt: entry?.syncedAt || null,
    hasBaseline: Boolean(entry?.snapshot && typeof entry.snapshot === 'object'),
    events: trimEvents(entry?.events || []).filter(isStructuredActivity),
  };
}

async function listInventoryActivityForSteamIds(steamIds, { limit = 100 } = {}) {
  const ids = [...new Set((Array.isArray(steamIds) ? steamIds : []).map((id) => String(id || '').trim()).filter((id) => /^\d{17}$/.test(id)))];
  const store = await readInventoryActivityStore();
  const events = [];

  for (const steamId of ids) {
    const entry = store[steamId];
    if (!entry) continue;
    for (const event of trimEvents(entry.events || []).filter(isStructuredActivity)) {
      events.push({
        ...event,
        steamId,
      });
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 300) : 100;
  return events.slice(0, cap);
}

module.exports = {
  MAX_EVENTS,
  makeActivityEvent,
  appendEvent,
  trimEvents,
  isStructuredActivity,
  buildQtySnapshot,
  diffSnapshots,
  backfillManualEvents,
  syncInventoryDiffActivity,
  getInventoryActivityForSteamId,
  listInventoryActivityForSteamIds,
};
