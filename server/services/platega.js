const PLATEGA_BASE_URL = String(process.env.PLATEGA_BASE_URL || 'https://app.platega.io').replace(/\/+$/, '');

function getMerchantId() {
  return String(process.env.PLATEGA_MERCHANT_ID || '').trim();
}

function getSecret() {
  return String(process.env.PLATEGA_SECRET || '').trim();
}

function isPlategaConfigured() {
  return Boolean(getMerchantId() && getSecret());
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-MerchantId': getMerchantId(),
    'X-Secret': getSecret(),
  };
}

function headerValue(headers, name) {
  if (!headers) return '';
  const target = String(name).toLowerCase();
  if (typeof headers.get === 'function') {
    return String(headers.get(name) || headers.get(target) || '').trim();
  }
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) {
      return String(Array.isArray(value) ? value[0] : value || '').trim();
    }
  }
  return '';
}

function verifyCallbackHeaders(headers) {
  const merchantId = getMerchantId();
  const secret = getSecret();
  if (!merchantId || !secret) return false;
  return (
    headerValue(headers, 'X-MerchantId') === merchantId
    && headerValue(headers, 'X-Secret') === secret
  );
}

async function plategaRequest(method, path, { body } = {}) {
  if (!isPlategaConfigured()) {
    const err = new Error('Platega is not configured.');
    err.status = 503;
    err.code = 'billing_not_configured';
    throw err;
  }

  const response = await fetch(`${PLATEGA_BASE_URL}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.raw || `Platega API error ${response.status}`;
    const err = new Error(typeof message === 'string' ? message : `Platega API error ${response.status}`);
    err.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    err.code = 'platega_api_error';
    err.details = data;
    throw err;
  }

  return data;
}

/** Payment link where the payer picks the method on Platega's page. */
async function createPaymentLink(payload) {
  return plategaRequest('POST', '/v2/transaction/process', { body: payload });
}

async function getTransaction(transactionId) {
  return plategaRequest('GET', `/transaction/${encodeURIComponent(transactionId)}`);
}

module.exports = {
  isPlategaConfigured,
  verifyCallbackHeaders,
  createPaymentLink,
  getTransaction,
};
