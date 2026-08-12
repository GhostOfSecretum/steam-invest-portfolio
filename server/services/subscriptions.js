const fs = require('fs/promises');
const path = require('path');
const { DEFAULT_PLAN_ID, getPlan } = require('./plans');
const { isPlategaConfigured } = require('./platega');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const FULL_ACCESS_PLAN_ID = 'investor';
const INVESTOR_TRIAL_PLAN_ID = 'investor';
const INVESTOR_TRIAL_DAYS = 7;
const INVESTOR_TRIAL_SOURCE = 'investor_trial';

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

function isExpired(entry) {
  if (!entry?.expiresAt) return false;
  const ts = Date.parse(entry.expiresAt);
  return Number.isFinite(ts) && ts < Date.now();
}

function hasUsedInvestorTrial(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.investorTrialUsedAt) return true;
  return String(entry.source || '') === INVESTOR_TRIAL_SOURCE;
}

function isInvestorTrialEligible(ownerId, entry, planId) {
  if (!ownerId || !String(ownerId).startsWith('steam:')) return false;
  if (hasFullAccess(ownerId)) return false;
  if (hasUsedInvestorTrial(entry)) return false;
  // Trial is for trying Investor from Free only (not while Plus/Investor is active).
  return planId === DEFAULT_PLAN_ID;
}

async function getOwnerPlanId(ownerId) {
  if (!ownerId) return DEFAULT_PLAN_ID;
  if (hasFullAccess(ownerId)) return FULL_ACCESS_PLAN_ID;
  const store = await readStore();
  const entry = store.owners[ownerId];
  if (!entry || isExpired(entry)) return DEFAULT_PLAN_ID;
  return normalizePlanId(entry.planId);
}

async function getOwnerSubscription(ownerId) {
  const planId = await getOwnerPlanId(ownerId);
  const plan = getPlan(planId);
  let updatedAt = null;
  let source = 'default';
  let expiresAt = null;
  let investorTrialUsed = false;
  let entry = null;
  if (hasFullAccess(ownerId)) {
    source = 'full_access_exception';
  } else if (ownerId) {
    const store = await readStore();
    entry = store.owners[ownerId] || null;
    investorTrialUsed = hasUsedInvestorTrial(entry);
    if (entry && !isExpired(entry)) {
      updatedAt = entry.updatedAt || null;
      source = entry.source || 'manual';
      expiresAt = entry.expiresAt || null;
    } else if (entry && isExpired(entry)) {
      source = 'expired';
      updatedAt = entry.updatedAt || null;
      expiresAt = entry.expiresAt || null;
    }
  }
  return {
    planId: plan.id,
    planName: plan.name,
    entitlements: { ...plan.features },
    source,
    updatedAt,
    expiresAt,
    billingReady: isPlategaConfigured(),
    investorTrialDays: INVESTOR_TRIAL_DAYS,
    investorTrialUsed,
    investorTrialEligible: isInvestorTrialEligible(ownerId, entry, planId),
  };
}

async function setOwnerPlan(ownerId, planId, {
  source = 'manual',
  expiresAt = null,
  paymentId = null,
} = {}) {
  if (!ownerId) {
    const err = new Error('Missing subscription owner.');
    err.status = 400;
    err.code = 'missing_owner';
    throw err;
  }
  const nextPlanId = normalizePlanId(planId);
  const store = await readStore();
  const prev = store.owners[ownerId] || null;
  let nextExpiresAt = expiresAt || null;

  // Renewals of the same (or higher) paid plan extend from the current expiry when still active.
  if (nextExpiresAt && prev && !isExpired(prev) && normalizePlanId(prev.planId) === nextPlanId && prev.expiresAt) {
    const prevTs = Date.parse(prev.expiresAt);
    const nextTs = Date.parse(nextExpiresAt);
    const periodMs = nextTs - Date.now();
    if (Number.isFinite(prevTs) && Number.isFinite(periodMs) && periodMs > 0 && prevTs > Date.now()) {
      nextExpiresAt = new Date(prevTs + periodMs).toISOString();
    }
  }

  const next = {
    planId: nextPlanId,
    source: String(source || 'manual'),
    updatedAt: new Date().toISOString(),
    expiresAt: nextExpiresAt,
    paymentId: paymentId || prev?.paymentId || null,
  };
  if (prev?.investorTrialUsedAt) {
    next.investorTrialUsedAt = prev.investorTrialUsedAt;
  }
  store.owners[ownerId] = next;
  await writeStore(store);
  return getOwnerSubscription(ownerId);
}

async function startInvestorTrial(ownerId) {
  if (!ownerId || !String(ownerId).startsWith('steam:')) {
    const err = new Error('Sign in with Steam to start the Investor trial.');
    err.status = 401;
    err.code = 'steam_required';
    throw err;
  }
  if (hasFullAccess(ownerId)) {
    const err = new Error('Investor access is already active.');
    err.status = 409;
    err.code = 'trial_not_eligible';
    throw err;
  }

  const store = await readStore();
  const prev = store.owners[ownerId] || null;
  if (hasUsedInvestorTrial(prev)) {
    const err = new Error('Investor free trial was already used on this account.');
    err.status = 409;
    err.code = 'trial_already_used';
    throw err;
  }

  const currentPlanId = (prev && !isExpired(prev))
    ? normalizePlanId(prev.planId)
    : DEFAULT_PLAN_ID;
  if (currentPlanId !== DEFAULT_PLAN_ID) {
    const err = new Error('Investor free trial is available only on the Free plan.');
    err.status = 409;
    err.code = 'trial_not_eligible';
    throw err;
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INVESTOR_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  store.owners[ownerId] = {
    planId: INVESTOR_TRIAL_PLAN_ID,
    source: INVESTOR_TRIAL_SOURCE,
    updatedAt: nowIso,
    expiresAt,
    paymentId: prev?.paymentId || null,
    investorTrialUsedAt: nowIso,
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
      investorTrialUsedAt: source.investorTrialUsedAt || target?.investorTrialUsedAt || null,
    };
  } else if (target && hasUsedInvestorTrial(source) && !target.investorTrialUsedAt) {
    store.owners[targetOwner] = {
      ...target,
      investorTrialUsedAt: source.investorTrialUsedAt || source.updatedAt || new Date().toISOString(),
    };
  }
  delete store.owners[anonOwnerId];
  await writeStore(store);
}

module.exports = {
  getOwnerPlanId,
  getOwnerSubscription,
  setOwnerPlan,
  startInvestorTrial,
  migrateSubscriptionToSteam,
  INVESTOR_TRIAL_DAYS,
  INVESTOR_TRIAL_SOURCE,
};
