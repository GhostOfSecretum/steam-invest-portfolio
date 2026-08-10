const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getPlan } = require('./plans');
const { setOwnerPlan, getOwnerSubscription } = require('./subscriptions');
const {
  isPlategaConfigured,
  verifyCallbackHeaders,
  createPaymentLink,
  getTransaction,
} = require('./platega');
const { resolveBaseUrl } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');
const PAID_PLAN_IDS = new Set(['plus', 'investor', 'test']);
const CYCLE_DAYS = { monthly: 30, annual: 365 };

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore() {
  try {
    const raw = await fs.readFile(PAYMENTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { payments: {} };
    if (!parsed.payments || typeof parsed.payments !== 'object') return { payments: {} };
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') return { payments: {} };
    throw error;
  }
}

async function writeStore(store) {
  await ensureDataDir();
  await fs.writeFile(PAYMENTS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeCycle(cycle) {
  const value = String(cycle || 'monthly').trim().toLowerCase();
  return value === 'annual' || value === 'yearly' ? 'annual' : 'monthly';
}

function resolveCheckoutAmount(plan, cycle) {
  if (plan.test) return Number(plan.amountRub) || 0;
  if (cycle === 'annual') {
    const annual = Number(plan.annualAmountRub);
    if (Number.isFinite(annual) && annual > 0) return annual;
    const monthly = Number(plan.amountRub) || 0;
    return monthly * 10;
  }
  return Number(plan.amountRub) || 0;
}

function computeExpiresAt(planId, cycle, fromDate = new Date()) {
  const plan = getPlan(planId);
  const days = plan.test
    ? (Number(plan.periodDays) || 1)
    : (CYCLE_DAYS[cycle] || CYCLE_DAYS.monthly);
  const start = fromDate instanceof Date ? fromDate.getTime() : Date.now();
  return new Date(start + days * 24 * 60 * 60 * 1000).toISOString();
}

function findPayment(store, predicate) {
  return Object.values(store.payments).find(predicate) || null;
}

async function savePayment(payment) {
  const store = await readStore();
  store.payments[payment.id] = payment;
  await writeStore(store);
  return payment;
}

async function getPaymentById(id) {
  const store = await readStore();
  return store.payments[id] || null;
}

async function getPaymentByTransactionId(transactionId) {
  const store = await readStore();
  return findPayment(store, (p) => p.transactionId === transactionId) || null;
}

async function createCheckout({ ownerId, steamId, planId, cycle, req }) {
  if (!isPlategaConfigured()) {
    const err = new Error('Billing is not configured.');
    err.status = 503;
    err.code = 'billing_not_configured';
    throw err;
  }
  if (!ownerId || !steamId) {
    const err = new Error('Steam account is not connected.');
    err.status = 401;
    err.code = 'not_authenticated';
    throw err;
  }

  const plan = getPlan(planId);
  if (!PAID_PLAN_IDS.has(plan.id)) {
    const err = new Error('Selected plan cannot be purchased.');
    err.status = 400;
    err.code = 'invalid_plan';
    throw err;
  }

  const billingCycle = plan.test ? 'monthly' : normalizeCycle(cycle);
  const amountRub = resolveCheckoutAmount(plan, billingCycle);
  if (!(amountRub > 0)) {
    const err = new Error('Invalid plan price.');
    err.status = 400;
    err.code = 'invalid_amount';
    throw err;
  }

  const paymentId = crypto.randomUUID();
  const baseUrl = resolveBaseUrl(req);
  const planName = plan.name?.ru || plan.name?.en || plan.id;
  const cycleLabel = plan.test
    ? `${Number(plan.periodDays) || 1} день`
    : (billingCycle === 'annual' ? '12 мес' : '30 дней');
  const description = `SkinsHead ${planName} · ${cycleLabel}`;

  const created = {
    id: paymentId,
    transactionId: null,
    ownerId,
    steamId: String(steamId),
    planId: plan.id,
    cycle: billingCycle,
    amountRub,
    currency: 'RUB',
    status: 'created',
    redirectUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidAt: null,
    expiresAt: null,
  };
  await savePayment(created);

  let platega;
  try {
    platega = await createPaymentLink({
      paymentDetails: { amount: amountRub, currency: 'RUB' },
      description,
      return: `${baseUrl}/billing/success?payment=${encodeURIComponent(paymentId)}`,
      failedUrl: `${baseUrl}/billing/fail?payment=${encodeURIComponent(paymentId)}`,
      payload: paymentId,
      metadata: {
        userId: String(steamId),
        userName: ownerId,
      },
    });
  } catch (error) {
    created.status = 'failed';
    created.error = error.message;
    created.updatedAt = new Date().toISOString();
    await savePayment(created);
    throw error;
  }

  const redirectUrl = platega?.url || platega?.redirect || null;
  if (!redirectUrl || !platega?.transactionId) {
    created.status = 'failed';
    created.error = 'Platega did not return a payment URL.';
    created.updatedAt = new Date().toISOString();
    await savePayment(created);
    const err = new Error(created.error);
    err.status = 502;
    err.code = 'platega_no_redirect';
    throw err;
  }

  created.transactionId = String(platega.transactionId);
  created.redirectUrl = String(redirectUrl);
  created.status = 'pending';
  created.plategaStatus = platega.status || 'PENDING';
  created.updatedAt = new Date().toISOString();
  await savePayment(created);

  return {
    paymentId: created.id,
    transactionId: created.transactionId,
    redirectUrl: created.redirectUrl,
    amountRub: created.amountRub,
    planId: created.planId,
    cycle: created.cycle,
  };
}

async function fulfillPayment(payment, { source = 'callback' } = {}) {
  if (!payment) return null;
  if (payment.status === 'paid') {
    return {
      payment,
      subscription: await getOwnerSubscription(payment.ownerId),
      alreadyPaid: true,
    };
  }

  const expiresAt = computeExpiresAt(payment.planId, payment.cycle);
  const subscription = await setOwnerPlan(payment.ownerId, payment.planId, {
    source: 'platega',
    expiresAt,
    paymentId: payment.id,
  });

  payment.status = 'paid';
  payment.paidAt = new Date().toISOString();
  payment.expiresAt = expiresAt;
  payment.fulfilledFrom = source;
  payment.updatedAt = new Date().toISOString();
  await savePayment(payment);

  return { payment, subscription, alreadyPaid: false };
}

async function syncPaymentStatus(payment, { source = 'sync' } = {}) {
  if (!payment?.transactionId) return { payment, subscription: null };
  if (payment.status === 'paid') {
    return {
      payment,
      subscription: await getOwnerSubscription(payment.ownerId),
      alreadyPaid: true,
    };
  }

  const tx = await getTransaction(payment.transactionId);
  const status = String(tx?.status || '').toUpperCase();
  payment.plategaStatus = status || payment.plategaStatus;
  payment.updatedAt = new Date().toISOString();

  if (status === 'CONFIRMED') {
    const amount = Number(tx?.paymentDetails?.amount);
    if (Number.isFinite(amount) && Math.abs(amount - payment.amountRub) > 0.01) {
      payment.status = 'amount_mismatch';
      await savePayment(payment);
      const err = new Error('Paid amount does not match checkout amount.');
      err.status = 409;
      err.code = 'amount_mismatch';
      throw err;
    }
    return fulfillPayment(payment, { source });
  }

  if (status === 'CANCELED' || status === 'CHARGEBACKED') {
    payment.status = status === 'CHARGEBACKED' ? 'chargebacked' : 'canceled';
    await savePayment(payment);
  } else {
    await savePayment(payment);
  }

  return {
    payment,
    subscription: await getOwnerSubscription(payment.ownerId),
    alreadyPaid: false,
  };
}

async function handlePlategaCallback(req) {
  if (!verifyCallbackHeaders(req.headers)) {
    const err = new Error('Invalid Platega callback credentials.');
    err.status = 401;
    err.code = 'platega_callback_unauthorized';
    throw err;
  }

  const body = req.body || {};
  const transactionId = String(body.id || body.transactionId || '').trim();
  const payloadId = String(body.payload || '').trim();
  if (!transactionId && !payloadId) {
    const err = new Error('Callback missing transaction id.');
    err.status = 400;
    err.code = 'platega_callback_invalid';
    throw err;
  }

  let payment = payloadId ? await getPaymentById(payloadId) : null;
  if (!payment && transactionId) {
    payment = await getPaymentByTransactionId(transactionId);
  }
  if (!payment) {
    const err = new Error('Payment not found for callback.');
    err.status = 404;
    err.code = 'payment_not_found';
    throw err;
  }

  if (!payment.transactionId && transactionId) {
    payment.transactionId = transactionId;
  }

  // Never trust callback status alone — re-check via API.
  return syncPaymentStatus(payment, { source: 'callback' });
}

async function syncPaymentByQuery({ paymentId, transactionId }) {
  let payment = null;
  if (paymentId) payment = await getPaymentById(String(paymentId).trim());
  if (!payment && transactionId) {
    payment = await getPaymentByTransactionId(String(transactionId).trim());
  }
  if (!payment) {
    const err = new Error('Payment not found.');
    err.status = 404;
    err.code = 'payment_not_found';
    throw err;
  }
  return syncPaymentStatus(payment, { source: 'return_url' });
}

module.exports = {
  isBillingReady: isPlategaConfigured,
  createCheckout,
  handlePlategaCallback,
  syncPaymentByQuery,
  getPaymentById,
};
