const fs = require('fs/promises');
const path = require('path');
const { DEFAULT_PLAN_ID, getPlan } = require('./plans');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const FULL_ACCESS_PLAN_ID = 'investor';

// Hardcoded owner exceptions with permanent Investor access.
// eldokto/eldoktor → https://steamcommunity.com/id/eldoktor/
const FULL_ACCESS_STEAM_IDS = new Set([
  '76561198114681917',
]);

function parseEnvFullAccessIds() {
  const raw = String(process.env.PLAN_FULL_ACCESS_STEAM_IDS || '').trim();
  if (!raw) return [];
  return raw.split(/[,\s]+/).map((value) => value.trim()).filter((value) => /^\d{17}$/.test(value));
}

function hasFullAccess(ownerId) {
  const id = String(ownerId || '').trim();
  if (!id.startsWith('steam:')) return false;
  const steamId = id.slice('steam:'.length);
  if (FULL_ACCESS_STEAM_IDS.has(steamId)) return true;
  return parseEnvFullAccessIds().includes(steamId);
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore() {
  try {
    const raw = await fs.readFile(SUBSCRIPTIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { owners: {} };
    if (!parsed.owners || typeof parsed.owners !== 'object') return { owners: {} };
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') return { owners: {} };
    throw error;
  }
}

async function writeStore(store) {
  await ensureDataDir();
  await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function normalizePlanId(planId) {
  const plan = getPlan(planId);
  return plan.id;
}

async function getOwnerPlanId(ownerId) {
  if (!ownerId) return DEFAULT_PLAN_ID;
  if (hasFullAccess(ownerId)) return FULL_ACCESS_PLAN_ID;
  const store = await readStore();
  const entry = store.owners[ownerId];
  if (!entry) return DEFAULT_PLAN_ID;
  return normalizePlanId(entry.planId);
}

async function getOwnerSubscription(ownerId) {
  const planId = await getOwnerPlanId(ownerId);
  const plan = getPlan(planId);
  let updatedAt = null;
  let source = 'default';
  if (hasFullAccess(ownerId)) {
    source = 'full_access_exception';
  } else if (ownerId) {
    const store = await readStore();
    const entry = store.owners[ownerId];
    if (entry) {
      updatedAt = entry.updatedAt || null;
      source = entry.source || 'manual';
    }
  }
  return {
    planId: plan.id,
    planName: plan.name,
    entitlements: { ...plan.features },
    source,
    updatedAt,
    billingReady: false,
  };
}

async function setOwnerPlan(ownerId, planId, { source = 'manual' } = {}) {
  if (!ownerId) {
    const err = new Error('Missing subscription owner.');
    err.status = 400;
    err.code = 'missing_owner';
    throw err;
  }
  const nextPlanId = normalizePlanId(planId);
  const store = await readStore();
  store.owners[ownerId] = {
    planId: nextPlanId,
    source: String(source || 'manual'),
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return getOwnerSubscription(ownerId);
}

async function migrateSubscriptionToSteam(anonOwnerId, steamId) {
  if (!steamId) return;
  const targetOwner = `steam:${steamId}`;
  if (!anonOwnerId || anonOwnerId === targetOwner) return;
  const store = await readStore();
  const source = store.owners[anonOwnerId];
  if (!source) return;
  const target = store.owners[targetOwner];
  // Prefer the higher-tier plan if both exist.
  const rank = { free: 0, plus: 1, investor: 2 };
  if (!target || (rank[normalizePlanId(source.planId)] || 0) > (rank[normalizePlanId(target.planId)] || 0)) {
    store.owners[targetOwner] = {
      ...source,
      updatedAt: new Date().toISOString(),
      source: source.source || 'migrated',
    };
  }
  delete store.owners[anonOwnerId];
  await writeStore(store);
}

module.exports = {
  getOwnerPlanId,
  getOwnerSubscription,
  setOwnerPlan,
  migrateSubscriptionToSteam,
};
