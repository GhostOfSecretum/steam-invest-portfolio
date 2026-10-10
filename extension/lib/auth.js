import { PROTOCOL_VERSION } from './cm.js';
import { ProtoWriter, concatBytes } from './proto.js';

const PLATFORM_STEAM_CLIENT = 1;
const GAMING_DEVICE_DESKTOP = 1;
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;
// Shown to the user in the Steam app confirmation and in "Authorized devices".
export const DEVICE_NAME = 'SkinsHead Browser Extension';

export function detectOsType() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (/win/i.test(platform)) return 20; // Win11
  if (/mac/i.test(platform)) return -102; // MacOSUnknown
  return -203; // LinuxUnknown
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

export async function qrLogin(cm, { osType, onChallenge, signal }) {
  const begin = await cm.call('Authentication.BeginAuthSessionViaQR#1', new ProtoWriter().message(3,
    new ProtoWriter()
      .string(1, DEVICE_NAME)
      .uint(2, PLATFORM_STEAM_CLIENT)
      .uint(3, osType)
      .uint(4, GAMING_DEVICE_DESKTOP)));

  let clientId = begin.big(1);
  const requestId = begin.bytes(3);
  const intervalMs = Math.min(10, Math.max(1, begin.float(4, 5))) * 1000;
  if (clientId === undefined || !requestId) throw new Error('Steam did not start a QR session');
  onChallenge(begin.str(2));

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(intervalMs, signal);
    const poll = await cm.call('Authentication.PollAuthSessionStatus#1',
      new ProtoWriter().uint(1, clientId).bytes(2, requestId));
    if (poll.has(1)) clientId = poll.big(1);
    if (poll.has(2)) onChallenge(poll.str(2));
    const refreshToken = poll.str(3);
    if (refreshToken) {
      return { refreshToken, accessToken: poll.str(4), accountName: poll.str(6) };
    }
  }
  throw new Error('QR code expired');
}

// Same checks steam-user applies before handing a token to the CM.
export function steamIdFromRefreshToken(refreshToken) {
  const parts = refreshToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed Steam token');
  const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
  const payload = JSON.parse(json);
  if (payload.iss !== 'steam') throw new Error('Not a Steam refresh token');
  if (!(payload.aud || []).includes('client')) throw new Error('Steam token is not valid for client login');
  if (!/^\d{17}$/.test(payload.sub || '')) throw new Error('Steam token has no SteamID');
  return BigInt(payload.sub);
}

async function sha1Hex(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Binary KV { MessageObject: { BB3, FF2, 3B3 } } of random hashes, regenerated per session
// so nothing about this browser persists between syncs.
async function randomMachineId() {
  const encoder = new TextEncoder();
  const cstr = (s) => concatBytes([encoder.encode(s), Uint8Array.of(0)]);
  const parts = [Uint8Array.of(0), cstr('MessageObject')];
  for (const key of ['BB3', 'FF2', '3B3']) {
    const seed = [...crypto.getRandomValues(new Uint8Array(16))].join(',');
    parts.push(Uint8Array.of(1), cstr(key), cstr(await sha1Hex(seed)));
  }
  parts.push(Uint8Array.of(8, 8));
  return concatBytes(parts);
}

export async function buildLogonBody(refreshToken, osType) {
  return new ProtoWriter()
    .uint(1, PROTOCOL_VERSION)
    .string(6, 'english')
    .uint(7, osType >>> 0)
    .bool(8, true)
    .message(11, new ProtoWriter().fixed32(1, 0))
    .bytes(30, await randomMachineId())
    .uint(33, 2)
    .string(96, DEVICE_NAME)
    .bool(102, true)
    .string(108, refreshToken);
}

// Permanent revoke, not logout: the token must be unusable afterwards.
export async function revokeRefreshToken(accessToken, refreshToken) {
  const res = await fetch('https://api.steampowered.com/IAuthenticationService/RevokeToken/v1/', {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: accessToken, token: refreshToken, revoke_action: '1' }),
  });
  if (!res.ok) throw new Error(`Steam revoke HTTP ${res.status}`);
}
