import { CmConnection } from './lib/cm.js';
import { buildLogonBody, detectOsType, qrLogin, revokeRefreshToken, steamIdFromRefreshToken } from './lib/auth.js';
import { Cs2GameCoordinator } from './lib/gc.js';
import { buildGcItem, loadSchema } from './lib/item-names.js';
import { fetchBackpack } from './lib/steam-inventory.js';
import { mergeInventoryItems } from './lib/inventory-merge.js';
import { DEFAULT_SERVER_URL, allowsDevServer, pair, unpair, uploadInventory } from './lib/server.js';
import { MIN_PASSWORD_LENGTH, createVault, saveVault, unlockVault, vaultExists, wipeVault } from './lib/pin.js';
import { LANGS, currentLang, initI18n, setLang, t } from './lib/i18n.js';
import qrcode from './vendor/qrcode-generator-2.0.4.mjs';

const CASKET_DELAY_MS = 400;

const $ = (id) => document.getElementById(id);
let abortController = null;
let lastStatus = null;
let lastResult = null;
let linkedSteamId = '';
let vault = null;
let pinMode = 'setup';
let legacyPairing = null;

function applyStatic() {
  document.title = t('pageTitle');
  $('lang-switch').setAttribute('aria-label', t('language'));
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const button of $('lang-switch').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === currentLang()));
  }
  if (linkedSteamId) $('paired-text').textContent = t('paired', { id: linkedSteamId });
  if (!$('pin-block').hidden) setPinMode(pinMode);
  if (lastStatus) paintStatus();
  if (lastResult) renderResult(lastResult);
}

function setPinMode(mode) {
  pinMode = mode;
  const setup = mode === 'setup';
  $('pin-block').hidden = false;
  $('pair-block').hidden = true;
  $('sync-block').hidden = true;
  $('pin-title').textContent = t(setup ? 'pinSetupTitle' : 'pinUnlockTitle');
  $('pin-setup-note').hidden = !setup;
  $('pin-unlock-note').hidden = setup;
  $('pin-confirm').hidden = !setup;
  $('pin-confirm').required = setup;
  $('pin-submit').textContent = t(setup ? 'pinSetupSubmit' : 'pinUnlockSubmit');
  $('pin-forgot').hidden = setup;
  $('pin').autocomplete = setup ? 'new-password' : 'current-password';
}

function clearPinFields() {
  $('pin').value = '';
  $('pin-confirm').value = '';
}

async function showLock() {
  vault = null;
  const state = await vaultExists();
  legacyPairing = state.hasVault ? null : state.legacyPairing;
  setPinMode(state.hasVault ? 'unlock' : 'setup');
}

function setStatus(key, vars = {}, isError = false) {
  lastStatus = { key, vars, isError };
  paintStatus();
}

function paintStatus() {
  $('status').textContent = t(lastStatus.key, lastStatus.vars);
  $('status').classList.toggle('error', lastStatus.isError);
}

function drawQr(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const canvas = $('qr');
  const ctx = canvas.getContext('2d');
  const modules = qr.getModuleCount();
  const quiet = 4;
  const scale = Math.floor(canvas.width / (modules + quiet * 2));
  const offset = Math.floor((canvas.width - modules * scale) / 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(offset + col * scale, offset + row * scale, scale, scale);
    }
  }
  $('qr-block').hidden = false;
  setStatus('waitingQr');
}

async function renderPairing() {
  if (!vault) return null;
  $('pin-block').hidden = true;
  const pairing = vault.pairing;
  $('pair-block').hidden = Boolean(pairing);
  $('sync-block').hidden = !pairing;
  linkedSteamId = pairing?.steamId || '';
  if (linkedSteamId) $('paired-text').textContent = t('paired', { id: linkedSteamId });
  if (allowsDevServer()) {
    $('server-url').hidden = false;
    $('server-url').placeholder = DEFAULT_SERVER_URL;
  }
  return pairing;
}

function renderResult(result) {
  lastResult = result;
  const { units, backpackCount, gcOnlyCount, webError, totalItems, pairing } = result;
  const tbody = $('units');
  tbody.replaceChildren();
  let storageTotal = 0;
  for (const { name, expected, count } of units) {
    storageTotal += count;
    const row = document.createElement('tr');
    for (const [text, mismatch] of [[name, false], [String(expected), false], [String(count), count !== expected]]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      if (mismatch) cell.className = 'mismatch';
      row.append(cell);
    }
    tbody.append(row);
  }
  $('result-title').textContent = t('resultTitle', { count: totalItems });
  const backpackNote = webError
    ? t('backpackFail', { error: webError, count: gcOnlyCount })
    : t('backpack', { count: backpackCount }) + (gcOnlyCount ? t('gcOnly', { count: gcOnlyCount }) : '');
  $('result-detail').textContent = `${backpackNote} ${t('storageSummary', { units: units.length, items: storageTotal })}`;
  $('open-portfolio').href = `${pairing.serverUrl}/dashboard`;
  $('result').hidden = false;
}

// Everything that needs the Steam login happens here; the caller revokes the
// token as soon as this returns.
async function readFromSteam(session, osType, signal) {
  const steamId = steamIdFromRefreshToken(session.refreshToken);
  const pairing = vault?.pairing;
  if (!pairing) throw new Error(t('unpaired'));
  if (String(steamId) !== pairing.steamId) {
    throw new Error(t('wrongAccount', { got: steamId, expected: pairing.steamId }));
  }

  const cm = await CmConnection.open();
  const abort = () => cm.close();
  signal.addEventListener('abort', abort, { once: true });
  let caskets;
  let gcBackpack;
  const contents = new Map();
  try {
    setStatus('logon');
    await cm.logOn(steamId, await buildLogonBody(session.refreshToken, osType));
    setStatus('gc');
    const gc = new Cs2GameCoordinator(cm);
    await gc.connect();

    caskets = gc.storageUnits();
    for (const [index, casket] of caskets.entries()) {
      signal.throwIfAborted();
      setStatus('readingUnit', { n: index + 1, total: caskets.length, name: casket.customName || t('defaultUnit') });
      contents.set(casket.id, await gc.loadCasketContents(casket));
      if (index < caskets.length - 1) await new Promise((r) => setTimeout(r, CASKET_DELAY_MS));
    }
    gcBackpack = gc.backpackItems();
  } finally {
    signal.removeEventListener('abort', abort);
    cm.close();
  }

  setStatus('web');
  let web = { items: [] };
  let webError = null;
  try {
    web = await fetchBackpack(steamId, session.accessToken);
  } catch (err) {
    webError = err.message;
  }
  return { pairing, caskets, contents, gcBackpack, web, webError };
}

async function run() {
  abortController = new AbortController();
  const { signal } = abortController;
  $('start').disabled = true;
  $('cancel').hidden = false;
  $('result').hidden = true;
  lastResult = null;
  const osType = detectOsType();
  const schemaPromise = loadSchema().catch((err) => {
    console.warn('[schema]', err.message);
    return null;
  });
  let session = null;

  try {
    setStatus('connecting');
    const authCm = await CmConnection.open();
    try {
      session = await qrLogin(authCm, { osType, onChallenge: drawQr, signal });
    } finally {
      authCm.close();
    }
    $('qr-block').hidden = true;

    const steamData = await readFromSteam(session, osType, signal);
    setStatus('revoke');
    await revokeRefreshToken(session.accessToken, session.refreshToken);
    session = null;

    setStatus('names');
    const schema = await schemaPromise;
    const units = steamData.caskets.map((casket) => ({ id: casket.id, name: casket.customName || t('defaultUnit') }));
    const storageItems = units.flatMap((unit) => steamData.contents.get(unit.id).map((item) => buildGcItem(schema, item, unit)));
    const gcBackpackItems = steamData.gcBackpack.map((item) => buildGcItem(schema, item, null));
    const { items, gcOnlyCount } = mergeInventoryItems(steamData.web.items, gcBackpackItems, storageItems);
    const storageItemCount = storageItems.reduce((sum, item) => sum + item.amount, 0);

    setStatus('upload');
    try {
      await uploadInventory(steamData.pairing, items, storageItemCount);
    } catch (err) {
      if (err.code === 'invalid_device_token' && vault) await saveVault(vault, null);
      throw err;
    }

    renderResult({
      units: units.map((unit, i) => ({
        name: unit.name,
        expected: steamData.caskets[i].casketItemCount,
        count: steamData.contents.get(unit.id).length,
      })),
      backpackCount: steamData.web.items.length,
      gcOnlyCount,
      webError: steamData.webError,
      totalItems: items.length,
      pairing: steamData.pairing,
    });
    setStatus(schema ? 'done' : 'doneNoSchema');
  } catch (err) {
    $('qr-block').hidden = true;
    setStatus(signal.aborted ? 'cancelled' : 'error', signal.aborted ? {} : { message: err.message }, !signal.aborted);
  } finally {
    if (session) {
      try {
        await revokeRefreshToken(session.accessToken, session.refreshToken);
      } catch (err) {
        setStatus('revokeFailed', { message: err.message }, true);
      }
      session = null;
    }
    abortController = null;
    $('start').disabled = false;
    $('cancel').hidden = true;
    await renderPairing();
  }
}

$('pair-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    setStatus('pairing');
    await saveVault(vault, await pair($('server-url').value, $('pair-code').value));
    $('pair-code').value = '';
    setStatus('pairedOk');
  } catch (err) {
    setStatus('error', { message: err.message }, true);
  }
  await renderPairing();
});

$('unpair').addEventListener('click', async () => {
  const pairing = vault?.pairing || null;
  const revoked = pairing ? await unpair(pairing).catch(() => false) : false;
  if (vault) await saveVault(vault, null);
  setStatus(revoked ? 'unpairOk' : 'unpairLocal', {}, !revoked);
  await renderPairing();
});

$('pin-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('pin').value;
  if (password.length < MIN_PASSWORD_LENGTH) {
    setStatus('pinShort', {}, true);
    return;
  }
  if (pinMode === 'setup' && password !== $('pin-confirm').value) {
    setStatus('pinMismatch', {}, true);
    return;
  }
  $('pin-submit').disabled = true;
  setStatus('pinChecking');
  try {
    vault = pinMode === 'setup'
      ? await createVault(password, legacyPairing)
      : await unlockVault(password);
    legacyPairing = null;
    clearPinFields();
    lastStatus = null;
    $('status').textContent = '';
    $('status').classList.remove('error');
    await renderPairing();
  } catch (err) {
    clearPinFields();
    if (err.code === 'wait' || (err.code === 'bad' && err.waitMs > 0)) {
      setStatus('pinWait', { seconds: Math.max(1, Math.ceil(err.waitMs / 1000)) }, true);
    } else if (err.code === 'bad') {
      setStatus('pinWrong', {}, true);
    } else {
      setStatus('error', { message: err.message }, true);
    }
  } finally {
    $('pin-submit').disabled = false;
  }
});

$('pin-forgot').addEventListener('click', async () => {
  if (!window.confirm(t('pinForgotConfirm'))) return;
  await wipeVault();
  vault = null;
  legacyPairing = null;
  clearPinFields();
  setPinMode('setup');
  setStatus('pinWiped', {}, true);
});

$('start').addEventListener('click', run);
$('cancel').addEventListener('click', () => abortController?.abort(new Error('cancelled')));

for (const [code, label] of LANGS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.lang = code;
  button.textContent = label;
  button.addEventListener('click', async () => {
    await setLang(code);
    applyStatic();
  });
  $('lang-switch').append(button);
}

await initI18n();
applyStatic();
await showLock();
