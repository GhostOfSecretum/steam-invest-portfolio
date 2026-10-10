// The password is the only key to the SkinsHead pairing. It is stretched with
// PBKDF2 and never stored. The pairing is AES-GCM ciphertext in extension
// storage; the derived key lives only in this tab's memory.
const ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 8;
const DELAYS_MS = [0, 0, 0, 1000, 2000, 4000, 8000, 16000, 30000, 60000];

const text = new TextEncoder();
const decoder = new TextDecoder();

function bytesToB64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pairingOrNull(value) {
  if (!value) return null;
  if (!/^[a-f0-9]{64}$/i.test(value.deviceToken || '') || !/^\d{17}$/.test(value.steamId || '')) return null;
  return { serverUrl: value.serverUrl, deviceToken: value.deviceToken, steamId: value.steamId };
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', text.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key, salt, iterations, pairing) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    text.encode(JSON.stringify({ pairing: pairingOrNull(pairing) })),
  ));
  await chrome.storage.local.set({
    vault: {
      v: 1,
      iterations,
      salt: bytesToB64(salt),
      iv: bytesToB64(iv),
      ct: bytesToB64(ct),
    },
  });
  await chrome.storage.local.remove('pairing');
}

async function open(key, vault) {
  const json = JSON.parse(decoder.decode(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(vault.iv) },
    key,
    b64ToBytes(vault.ct),
  )));
  return pairingOrNull(json.pairing);
}

export async function vaultExists() {
  const { vault, pairing } = await chrome.storage.local.get(['vault', 'pairing']);
  return { hasVault: Boolean(vault?.ct && vault?.salt), legacyPairing: pairingOrNull(pairing) };
}

export async function createVault(password, pairing) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, ITERATIONS);
  const stored = pairingOrNull(pairing);
  await seal(key, salt, ITERATIONS, stored);
  await chrome.storage.local.remove('pinGuard');
  return { key, pairing: stored };
}

export async function unlockDelayMs() {
  const { pinGuard } = await chrome.storage.local.get('pinGuard');
  if (!pinGuard?.nextAt) return 0;
  return Math.max(0, pinGuard.nextAt - Date.now());
}

async function noteFailure() {
  const { pinGuard } = await chrome.storage.local.get('pinGuard');
  const fails = Number(pinGuard?.fails || 0) + 1;
  const delay = DELAYS_MS[Math.min(fails, DELAYS_MS.length - 1)];
  await chrome.storage.local.set({ pinGuard: { fails, nextAt: Date.now() + delay } });
  return delay;
}

export async function unlockVault(password) {
  const wait = await unlockDelayMs();
  if (wait > 0) {
    const error = new Error('wait');
    error.code = 'wait';
    error.waitMs = wait;
    throw error;
  }
  const { vault } = await chrome.storage.local.get('vault');
  if (!vault?.ct) {
    const error = new Error('missing');
    error.code = 'missing';
    throw error;
  }
  try {
    const key = await deriveKey(password, b64ToBytes(vault.salt), vault.iterations || ITERATIONS);
    const pairing = await open(key, vault);
    await chrome.storage.local.remove(['pinGuard', 'pairing']);
    return { key, pairing };
  } catch (err) {
    if (err.code) throw err;
    const delay = await noteFailure();
    const error = new Error('bad');
    error.code = 'bad';
    error.waitMs = delay;
    throw error;
  }
}

export async function saveVault(lock, pairing) {
  const { vault } = await chrome.storage.local.get('vault');
  if (!vault?.salt || !lock?.key) throw new Error('locked');
  const stored = pairingOrNull(pairing);
  await seal(lock.key, b64ToBytes(vault.salt), vault.iterations || ITERATIONS, stored);
  lock.pairing = stored;
}

export async function wipeVault() {
  await chrome.storage.local.remove(['vault', 'pinGuard', 'pairing']);
}
