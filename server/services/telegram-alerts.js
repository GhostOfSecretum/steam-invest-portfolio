const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getOwnerSubscription, hasSmartMoneyAccess } = require('./subscriptions');
const { SITE_URL } = require('./items');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const STORE_FILE = path.join(DATA_DIR, 'telegram-alerts.json');
const CODE_TTL_MS = 30 * 60 * 1000;

let queue = Promise.resolve();

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function botUsername() {
  return String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
}

function webhookSecret() {
  const configured = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (configured) return configured;
  const token = botToken();
  if (!token) return '';
  return crypto.createHash('sha256').update(`skinshead-telegram:${token}`).digest('hex');
}

function ownerChatId() {
  return String(process.env.SMART_MONEY_ALERT_CHAT_ID || '').trim();
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(STORE_FILE, 'utf8'));
    return {
      links: parsed.links && typeof parsed.links === 'object' ? parsed.links : {},
      codes: parsed.codes && typeof parsed.codes === 'object' ? parsed.codes : {},
    };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[telegram] unreadable store:', error.message);
    return { links: {}, codes: {} };
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store));
  await fs.rename(tmp, STORE_FILE);
}

function updateStore(mutate) {
  const run = queue.then(async () => {
    const store = await readStore();
    const result = await mutate(store);
    await writeStore(store);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

function pruneCodes(store, now = Date.now()) {
  for (const [code, entry] of Object.entries(store.codes)) {
    if (!entry || Date.parse(entry.expiresAt) <= now) delete store.codes[code];
  }
}

async function createTelegramLink(ownerId) {
  const username = botUsername();
  if (!username || !botToken()) {
    const err = new Error('Telegram bot is not configured.');
    err.status = 503;
    err.code = 'telegram_not_configured';
    throw err;
  }
  const code = crypto.randomBytes(18).toString('hex');
  await updateStore((store) => {
    pruneCodes(store);
    store.codes[code] = {
      ownerId,
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    };
  });
  return { url: `https://t.me/${username}?start=${code}` };
}

async function getTelegramLinkStatus(ownerId) {
  const store = await readStore();
  const link = ownerId ? store.links[ownerId] : null;
  return {
    linked: Boolean(link?.chatId),
    username: link?.username || null,
    botUsername: botUsername() || null,
  };
}

async function listAlertChatIds() {
  const ids = new Set();
  if (ownerChatId()) ids.add(ownerChatId());
  const store = await readStore();
  for (const [ownerId, link] of Object.entries(store.links)) {
    if (!link?.chatId) continue;
    const subscription = await getOwnerSubscription(ownerId);
    if (!hasSmartMoneyAccess(subscription)) continue;
    ids.add(String(link.chatId));
  }
  return [...ids];
}

async function unlinkChat(chatId) {
  const id = String(chatId);
  await updateStore((store) => {
    for (const [ownerId, link] of Object.entries(store.links)) {
      if (String(link?.chatId) === id) delete store.links[ownerId];
    }
  });
}

async function sendTelegramMessage(chatId, text, { html = false } = {}) {
  const token = botToken();
  if (!token || !chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: html ? 'HTML' : undefined,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    const err = new Error(body.description || `Telegram HTTP ${response.status}`);
    err.chatId = String(chatId);
    throw err;
  }
  return true;
}

function replyText(languageCode, ru, en) {
  return String(languageCode || '').toLowerCase().startsWith('ru') ? ru : en;
}

async function handleTelegramUpdate(update) {
  const message = update?.message;
  if (!message || message.chat?.type !== 'private' || !message.text) return;
  const match = String(message.text).trim().match(/^\/(start|stop)(?:@\w+)?(?:\s+(\S+))?/i);
  if (!match) return;
  const command = match[1].toLowerCase();
  const payload = match[2] || '';
  const chatId = message.chat.id;
  const say = (ru, en) => sendTelegramMessage(chatId, replyText(message.from?.language_code, ru, en));

  if (command === 'stop') {
    await unlinkChat(chatId);
    await say('Остановил. Сигналы больше не приходят в этот чат.', 'Stopped. This chat will no longer get alerts.');
    return;
  }

  if (!payload) {
    const store = await readStore();
    const existing = Object.values(store.links).find((link) => String(link?.chatId) === String(chatId));
    if (existing) {
      await say('Этот чат уже подключён. Сигналы приходят, пока подписка активна.', 'This chat is already connected. Alerts continue while the plan is active.');
      return;
    }
    await say(
      `Сначала оформите доступ на сайте и нажмите «Подключить Telegram»: ${SITE_URL}/investors`,
      `Buy access on the site, then press Connect Telegram: ${SITE_URL}/investors`,
    );
    return;
  }

  const linked = await updateStore((store) => {
    pruneCodes(store);
    const entry = store.codes[payload];
    if (!entry) return null;
    delete store.codes[payload];
    if (Date.parse(entry.expiresAt) <= Date.now()) return null;
    for (const [ownerId, link] of Object.entries(store.links)) {
      if (String(link?.chatId) === String(chatId)) delete store.links[ownerId];
    }
    store.links[entry.ownerId] = {
      chatId: String(chatId),
      username: message.from?.username || null,
      linkedAt: new Date().toISOString(),
    };
    return entry.ownerId;
  });

  if (!linked) {
    await say(
      'Ссылка устарела. Откройте аналитику и нажмите «Подключить Telegram» ещё раз.',
      'That link expired. Open analytics and press Connect Telegram again.',
    );
    return;
  }

  const subscription = await getOwnerSubscription(linked);
  if (!hasSmartMoneyAccess(subscription)) {
    await unlinkChat(chatId);
    await say(
      `Подписка не активна. Оформите доступ: ${SITE_URL}/investors`,
      `The plan is not active. Buy access: ${SITE_URL}/investors`,
    );
    return;
  }

  console.log('[telegram] alert chat linked');
  await say(
    'Готово. Сигналы smart money будут приходить сюда, пока подписка активна. Остановить: /stop',
    'Connected. Smart money alerts will arrive here while the plan is active. Stop with /stop',
  );
}

function telegramWebhookAuthorized(header) {
  const expected = webhookSecret();
  const got = String(header || '');
  if (!expected || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function ensureTelegramWebhook() {
  const token = botToken();
  const secret = webhookSecret();
  if (!token || !secret || !SITE_URL.startsWith('https://')) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${SITE_URL}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    console.warn('[telegram] webhook setup failed:', body.description || response.status);
    return;
  }
  console.log('[telegram] webhook set');
}

module.exports = {
  createTelegramLink,
  getTelegramLinkStatus,
  listAlertChatIds,
  unlinkChat,
  sendTelegramMessage,
  handleTelegramUpdate,
  telegramWebhookAuthorized,
  ensureTelegramWebhook,
};
