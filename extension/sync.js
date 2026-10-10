import { CmConnection } from './lib/cm.js';
import { buildLogonBody, detectOsType, qrLogin, revokeRefreshToken, steamIdFromRefreshToken } from './lib/auth.js';
import { Cs2GameCoordinator } from './lib/gc.js';
import { buildGcItem, loadSchema } from './lib/item-names.js';
import { fetchBackpack } from './lib/steam-inventory.js';
import { mergeInventoryItems } from './lib/inventory-merge.js';
import { DEFAULT_SERVER_URL, allowsDevServer, clearPairing, getPairing, pair, unpair, uploadInventory } from './lib/server.js';
import qrcode from './vendor/qrcode-generator-2.0.4.mjs';

const CASKET_DELAY_MS = 400;

const $ = (id) => document.getElementById(id);
let abortController = null;

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
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
  setStatus('Ждём подтверждения в приложении Steam…');
}

async function renderPairing() {
  const pairing = await getPairing();
  $('pair-block').hidden = Boolean(pairing);
  $('sync-block').hidden = !pairing;
  if (pairing) $('paired-steam-id').textContent = pairing.steamId;
  if (allowsDevServer()) {
    $('server-url').hidden = false;
    $('server-url').placeholder = DEFAULT_SERVER_URL;
  }
  return pairing;
}

function renderResult({ units, backpackCount, gcOnlyCount, webError, totalItems, pairing }) {
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
  $('result-title').textContent = `Отправлено в портфель: ${totalItems} позиций`;
  const backpackNote = webError
    ? `Описания Steam недоступны (${webError}), рюкзак собран по данным CS2: ${gcOnlyCount}.`
    : `Рюкзак: ${backpackCount} из Steam${gcOnlyCount ? `, ещё ${gcOnlyCount} только в CS2 (например, с трейд-баном)` : ''}.`;
  $('result-detail').textContent = `${backpackNote} Хранилищ: ${units.length}, предметов в них: ${storageTotal}.`;
  $('open-portfolio').href = `${pairing.serverUrl}/dashboard`;
  $('result').hidden = false;
}

// Everything that needs the Steam login happens here; the caller revokes the
// token as soon as this returns.
async function readFromSteam(session, osType, signal) {
  const steamId = steamIdFromRefreshToken(session.refreshToken);
  const pairing = await getPairing();
  if (!pairing) throw new Error('Расширение отвязано от SkinsHead');
  if (String(steamId) !== pairing.steamId) {
    throw new Error(`Вход выполнен в другой аккаунт Steam (${steamId}), а привязан ${pairing.steamId}`);
  }

  const cm = await CmConnection.open();
  const abort = () => cm.close();
  signal.addEventListener('abort', abort, { once: true });
  let caskets;
  let gcBackpack;
  const contents = new Map();
  try {
    setStatus('Вход в Steam…');
    await cm.logOn(steamId, await buildLogonBody(session.refreshToken, osType));
    setStatus('Подключение к CS2 Game Coordinator…');
    const gc = new Cs2GameCoordinator(cm);
    await gc.connect();

    caskets = gc.storageUnits();
    for (const [index, casket] of caskets.entries()) {
      signal.throwIfAborted();
      setStatus(`Чтение хранилища ${index + 1} из ${caskets.length}: ${casket.customName || 'Хранилище'}`);
      contents.set(casket.id, await gc.loadCasketContents(casket));
      if (index < caskets.length - 1) await new Promise((r) => setTimeout(r, CASKET_DELAY_MS));
    }
    gcBackpack = gc.backpackItems();
  } finally {
    signal.removeEventListener('abort', abort);
    cm.close();
  }

  setStatus('Чтение описаний рюкзака из Steam…');
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
  const osType = detectOsType();
  const schemaPromise = loadSchema().catch((err) => {
    console.warn('[schema]', err.message);
    return null;
  });
  let session = null;

  try {
    setStatus('Подключение к Steam…');
    const authCm = await CmConnection.open();
    try {
      session = await qrLogin(authCm, { osType, onChallenge: drawQr, signal });
    } finally {
      authCm.close();
    }
    $('qr-block').hidden = true;

    const steamData = await readFromSteam(session, osType, signal);
    setStatus('Отзыв токена Steam…');
    await revokeRefreshToken(session.accessToken, session.refreshToken);
    session = null;

    setStatus('Определение названий предметов…');
    const schema = await schemaPromise;
    const units = steamData.caskets.map((casket) => ({ id: casket.id, name: casket.customName || 'Хранилище' }));
    const storageItems = units.flatMap((unit) => steamData.contents.get(unit.id).map((item) => buildGcItem(schema, item, unit)));
    const gcBackpackItems = steamData.gcBackpack.map((item) => buildGcItem(schema, item, null));
    const { items, gcOnlyCount } = mergeInventoryItems(steamData.web.items, gcBackpackItems, storageItems);
    const storageItemCount = storageItems.reduce((sum, item) => sum + item.amount, 0);

    setStatus('Отправка в портфель SkinsHead…');
    await uploadInventory(steamData.pairing, items, storageItemCount);

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
    setStatus(schema
      ? 'Готово. Токен Steam отозван, портфель обновлён.'
      : 'Готово, но схема CS2 не загрузилась: часть предметов из хранилищ без названий. Токен Steam отозван.');
  } catch (err) {
    $('qr-block').hidden = true;
    setStatus(signal.aborted ? 'Отменено.' : `Ошибка: ${err.message}`, !signal.aborted);
  } finally {
    if (session) {
      try {
        await revokeRefreshToken(session.accessToken, session.refreshToken);
      } catch (err) {
        setStatus(`Токен не удалось отозвать (${err.message}). Удалите устройство «SkinsHead Browser Extension» в настройках безопасности Steam.`, true);
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
    setStatus('Привязка…');
    await pair($('server-url').value, $('pair-code').value);
    $('pair-code').value = '';
    setStatus('Расширение привязано.');
  } catch (err) {
    setStatus(`Ошибка: ${err.message}`, true);
  }
  await renderPairing();
});

$('unpair').addEventListener('click', async () => {
  const pairing = await getPairing();
  const revoked = pairing ? await unpair(pairing).catch(() => false) : false;
  if (!pairing) await clearPairing();
  setStatus(revoked
    ? 'Привязка отозвана на сервере и удалена из расширения.'
    : 'Привязка удалена из расширения, но сервер не ответил. Отзовите её на сайте: «Отвязать все».', !revoked);
  await renderPairing();
});

$('start').addEventListener('click', run);
$('cancel').addEventListener('click', () => abortController?.abort(new Error('cancelled')));

renderPairing();
