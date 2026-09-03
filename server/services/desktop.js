const crypto = require('crypto');
const { getCached, setCached } = require('./cache');

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
const DEVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DESKTOP_INVENTORY_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_CODE_TTL_MS = 60 * 1000;
// 32 chars × 8 = 40 bits. Avoids ambiguous 0/O/1/I/L.
const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_RE = new RegExp(`^[${PAIRING_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`);

// Oldest desktop build the server will talk to. Raise this when a release fixes
// something that must not keep running in the wild — older clients then get a
// hard stop with an update prompt instead of silently misbehaving.
const MIN_DESKTOP_VERSION = '0.1.0';

function parseVersion(raw) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(raw || '').trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

// An unparseable or absent version means a build from before version reporting
// existed, which is by definition older than any minimum we set.
function isDesktopVersionSupported(raw) {
  const version = parseVersion(raw);
  if (!version) return false;
  const minimum = parseVersion(MIN_DESKTOP_VERSION);
  for (let i = 0; i < 3; i += 1) {
    if (version[i] !== minimum[i]) return version[i] > minimum[i];
  }
  return true;
}

function generateCode() {
  const bytes = crypto.randomBytes(PAIRING_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    code += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return code;
}

function normalizePairingCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function deviceTokenKey(token) {
  return `desktop:token:${hashToken(token)}`;
}

async function createPairingCode(steamId) {
  const code = generateCode();
  const key = `desktop:pairing:${code}`;
  await setCached(key, { steamId, createdAt: Date.now() });
  return code;
}

async function redeemPairingCode(rawCode) {
  const code = normalizePairingCode(rawCode);
  if (!PAIRING_CODE_RE.test(code)) return null;

  const key = `desktop:pairing:${code}`;
  const data = await getCached(key, PAIRING_CODE_TTL_MS);
  if (!data) return null;

  const deviceToken = generateToken();
  await setCached(deviceTokenKey(deviceToken), {
    steamId: data.steamId,
    pairedAt: Date.now(),
  });

  await setCached(key, null);
  return { steamId: data.steamId, deviceToken };
}

async function validateDeviceToken(deviceToken) {
  if (!deviceToken || !/^[a-f0-9]{64}$/i.test(deviceToken)) return null;

  const hashedKey = deviceTokenKey(deviceToken);
  let data = await getCached(hashedKey, DEVICE_TOKEN_TTL_MS);
  if (data) return data;

  // Legacy: tokens were stored under the raw value. Migrate once on use.
  const legacyKey = `desktop:token:${deviceToken}`;
  data = await getCached(legacyKey, DEVICE_TOKEN_TTL_MS);
  if (!data) return null;

  await setCached(hashedKey, data);
  await setCached(legacyKey, null);
  return data;
}

// Short-lived, single-use code exchanged for a web session, so the long-lived
// device token never travels in a URL / browser history / access logs.
async function createDesktopLoginCode(deviceToken) {
  const device = await validateDeviceToken(deviceToken);
  if (!device) return null;
  const code = crypto.randomBytes(32).toString('hex');
  await setCached(`desktop:login-code:${code}`, { steamId: device.steamId, createdAt: Date.now() });
  return code;
}

async function redeemDesktopLoginCode(code) {
  if (!code) return null;
  const key = `desktop:login-code:${code}`;
  const data = await getCached(key, LOGIN_CODE_TTL_MS);
  if (!data) return null;
  await setCached(key, null);
  return { steamId: data.steamId };
}

async function saveDesktopInventory(steamId, inventory) {
  const key = `desktop:inventory:${steamId}`;
  await setCached(key, {
    steamId,
    syncedAt: new Date().toISOString(),
    totalItemCount: inventory.totalItemCount,
    storageItemCount: inventory.storageItemCount || 0,
    items: inventory.items,
  });
}

async function getDesktopInventory(steamId) {
  const key = `desktop:inventory:${steamId}`;
  return getCached(key, DESKTOP_INVENTORY_TTL_MS);
}

module.exports = {
  PAIRING_CODE_TTL_MS,
  PAIRING_CODE_LENGTH,
  MIN_DESKTOP_VERSION,
  isDesktopVersionSupported,
  createPairingCode,
  redeemPairingCode,
  validateDeviceToken,
  createDesktopLoginCode,
  redeemDesktopLoginCode,
  saveDesktopInventory,
  getDesktopInventory,
};
