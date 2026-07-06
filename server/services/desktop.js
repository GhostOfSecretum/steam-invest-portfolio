const crypto = require('crypto');
const { getCached, setCached } = require('./cache');

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const DEVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DESKTOP_INVENTORY_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_CODE_TTL_MS = 60 * 1000;

function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createPairingCode(steamId) {
  const code = generateCode();
  const key = `desktop:pairing:${code}`;
  await setCached(key, { steamId, createdAt: Date.now() });
  return code;
}

async function redeemPairingCode(code) {
  const key = `desktop:pairing:${code}`;
  const data = await getCached(key, PAIRING_CODE_TTL_MS);
  if (!data) return null;

  const deviceToken = generateToken();
  const tokenKey = `desktop:token:${deviceToken}`;
  await setCached(tokenKey, {
    steamId: data.steamId,
    pairedAt: Date.now(),
  });

  await setCached(key, null);
  return { steamId: data.steamId, deviceToken };
}

async function validateDeviceToken(deviceToken) {
  if (!deviceToken) return null;
  const key = `desktop:token:${deviceToken}`;
  const data = await getCached(key, DEVICE_TOKEN_TTL_MS);
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
  createPairingCode,
  redeemPairingCode,
  validateDeviceToken,
  createDesktopLoginCode,
  redeemDesktopLoginCode,
  saveDesktopInventory,
  getDesktopInventory,
};
