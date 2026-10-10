// Pairing and upload against the SkinsHead desktop API, same contract as
// desktop/main.js. Only the item list and the SkinsHead device token cross this
// boundary; Steam tokens never do.
import { t } from './i18n.js';

export const DEFAULT_SERVER_URL = 'https://skinshead.pro';
const ALLOWED_HOSTS = new Set(['skinshead.pro', 'www.skinshead.pro']);
// Must stay within host_permissions and connect-src of the manifest.
const LOCAL_DEV_ORIGIN = 'http://localhost:3000';
const PAIRING_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const DEVICE_TOKEN_RE = /^[a-f0-9]{64}$/i;

// The site's download strips the developer origin from the manifest, so only a
// build loaded straight from the repo may target a local server.
export const allowsDevServer = () => chrome.runtime.getManifest().host_permissions
  .some((host) => host.startsWith(LOCAL_DEV_ORIGIN));

export function normalizeServerUrl(raw) {
  const input = String(raw || '').trim().replace(/\/+$/, '') || DEFAULT_SERVER_URL;
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error(t('badUrl'));
  }
  if (parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname.toLowerCase()) && !parsed.port) {
    return `https://${parsed.hostname.toLowerCase()}`;
  }
  if (allowsDevServer() && parsed.origin === LOCAL_DEV_ORIGIN) return LOCAL_DEV_ORIGIN;
  throw new Error(t('hostOnly', { url: DEFAULT_SERVER_URL }));
}

export async function getPairing() {
  const { pairing } = await chrome.storage.local.get('pairing');
  if (!pairing || !DEVICE_TOKEN_RE.test(pairing.deviceToken || '') || !/^\d{17}$/.test(pairing.steamId || '')) {
    return null;
  }
  try {
    return { ...pairing, serverUrl: normalizeServerUrl(pairing.serverUrl) };
  } catch {
    return null;
  }
}

export async function clearPairing() {
  await chrome.storage.local.remove('pairing');
}

// Returns whether the server confirmed the revocation; the local copy is
// dropped either way so a dead network can't keep the token on disk.
export async function unpair(pairing) {
  let revoked = false;
  try {
    const res = await fetch(`${pairing.serverUrl}/api/desktop/unpair`, {
      method: 'POST',
      credentials: 'omit',
      headers: headers({ 'X-Device-Token': pairing.deviceToken }),
    });
    revoked = res.ok;
  } finally {
    await clearPairing();
  }
  return revoked;
}

function headers(extra = {}) {
  return { 'X-App-Version': chrome.runtime.getManifest().version, ...extra };
}

async function readError(res) {
  const body = await res.json().catch(() => ({}));
  switch (body.code) {
    case 'invalid_code': return t('invalidCode');
    case 'rate_limited': return t('rateLimited');
    case 'plan_required': return t('planRequired');
    case 'client_too_old': return t('tooOld');
    case 'invalid_device_token': return t('deviceToken');
    default: return body.error || t('httpError', { status: res.status });
  }
}

export async function pair(serverUrlInput, codeInput) {
  const serverUrl = normalizeServerUrl(serverUrlInput);
  const code = String(codeInput || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!PAIRING_CODE_RE.test(code)) throw new Error(t('badCode'));

  const res = await fetch(`${serverUrl}/api/desktop/pair`, {
    method: 'POST',
    credentials: 'omit',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ code, client: 'extension' }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  if (!DEVICE_TOKEN_RE.test(data.deviceToken || '') || !/^\d{17}$/.test(data.steamId || '')) {
    throw new Error(t('badResponse'));
  }
  const pairing = { serverUrl, deviceToken: data.deviceToken, steamId: data.steamId };
  await chrome.storage.local.set({ pairing });
  return pairing;
}

export async function uploadInventory(pairing, items, storageItemCount) {
  const res = await fetch(`${pairing.serverUrl}/api/desktop/inventory-sync`, {
    method: 'POST',
    credentials: 'omit',
    headers: headers({ 'Content-Type': 'application/json', 'X-Device-Token': pairing.deviceToken }),
    body: JSON.stringify({ items, storageItemCount, includeStorage: true }),
  });
  if (res.status === 401) await clearPairing();
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
