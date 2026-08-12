const crypto = require('crypto');
const { setOwnerPlan, startInvestorTrial } = require('./subscriptions');

const BETA_PLAN_ID = 'plus';
const BETA_ACCESS_DAYS = 30;
const LOGIN_MAX_AGE_SEC = 24 * 60 * 60;
const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);

function envFlag(name) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function isBetaMode() {
  return envFlag('BETA_MODE');
}

function getBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function getBotUsername() {
  return String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
}

function getChannelId() {
  const raw = String(process.env.TELEGRAM_BETA_CHANNEL || '@cs2skinshead').trim();
  if (!raw) return '@cs2skinshead';
  if (/^-?\d+$/.test(raw)) return raw;
  return raw.startsWith('@') ? raw : `@${raw}`;
}

function getChannelUrl() {
  const configured = String(process.env.TELEGRAM_BETA_CHANNEL_URL || '').trim();
  if (configured) return configured;
  const channel = getChannelId();
  if (channel.startsWith('@')) return `https://t.me/${channel.slice(1)}`;
  return 'https://t.me/cs2skinshead';
}

function getChannelUsername() {
  const channel = getChannelId();
  if (channel.startsWith('@')) return channel.slice(1);
  return 'cs2skinshead';
}

function isBetaUnlockConfigured() {
  return Boolean(getBotToken() && getBotUsername() && getChannelId());
}

function getBetaPublicConfig() {
  const beta = isBetaMode();
  const channelUnlockReady = isBetaUnlockConfigured();
  return {
    beta,
    channelUrl: getChannelUrl(),
    channelUsername: getChannelUsername(),
    botUsername: getBotUsername() || null,
    channelUnlockReady,
    // Plus free unlock during beta; Investor trial also uses Telegram when configured.
    unlockReady: beta && channelUnlockReady,
  };
}

function verifyTelegramLogin(payload) {
  const token = getBotToken();
  if (!token) {
    const err = new Error('Telegram bot is not configured.');
    err.status = 503;
    err.code = 'beta_bot_not_configured';
    throw err;
  }

  const data = payload && typeof payload === 'object' ? payload : {};
  const hash = String(data.hash || '').trim().toLowerCase();
  if (!hash) {
    const err = new Error('Telegram login hash is missing.');
    err.status = 400;
    err.code = 'telegram_login_invalid';
    throw err;
  }

  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    const err = new Error('Telegram login auth_date is invalid.');
    err.status = 400;
    err.code = 'telegram_login_invalid';
    throw err;
  }
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > LOGIN_MAX_AGE_SEC || ageSec < -60) {
    const err = new Error('Telegram login data expired. Try again.');
    err.status = 401;
    err.code = 'telegram_login_expired';
    throw err;
  }

  const checkPairs = Object.keys(data)
    .filter((key) => key !== 'hash' && data[key] !== undefined && data[key] !== null && data[key] !== '')
    .sort()
    .map((key) => `${key}=${data[key]}`);
  const dataCheckString = checkPairs.join('\n');
  const secretKey = crypto.createHash('sha256').update(token).digest();
  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const expected = Buffer.from(computed, 'hex');
  const received = Buffer.from(hash, 'hex');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    const err = new Error('Telegram login signature is invalid.');
    err.status = 401;
    err.code = 'telegram_login_invalid';
    throw err;
  }

  const telegramUserId = Number(data.id);
  if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
    const err = new Error('Telegram user id is invalid.');
    err.status = 400;
    err.code = 'telegram_login_invalid';
    throw err;
  }

  return {
    id: telegramUserId,
    firstName: data.first_name ? String(data.first_name) : null,
    lastName: data.last_name ? String(data.last_name) : null,
    username: data.username ? String(data.username) : null,
    photoUrl: data.photo_url ? String(data.photo_url) : null,
    authDate,
  };
}

async function telegramBotApi(method, params = {}) {
  const token = getBotToken();
  if (!token) {
    const err = new Error('Telegram bot is not configured.');
    err.status = 503;
    err.code = 'beta_bot_not_configured';
    throw err;
  }
  const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { method: 'GET' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    const err = new Error(body.description || 'Telegram Bot API request failed.');
    err.status = 502;
    err.code = 'telegram_api_failed';
    err.details = body;
    throw err;
  }
  return body.result;
}

async function isChannelMember(telegramUserId) {
  const result = await telegramBotApi('getChatMember', {
    chat_id: getChannelId(),
    user_id: telegramUserId,
  });
  const status = String(result?.status || '').toLowerCase();
  return MEMBER_STATUSES.has(status);
}

async function unlockBetaAccess(ownerId, loginPayload) {
  if (!isBetaMode()) {
    const err = new Error('Beta access is disabled.');
    err.status = 403;
    err.code = 'beta_disabled';
    throw err;
  }
  if (!isBetaUnlockConfigured()) {
    const err = new Error('Beta Telegram unlock is not configured.');
    err.status = 503;
    err.code = 'beta_bot_not_configured';
    throw err;
  }

  const login = verifyTelegramLogin(loginPayload);
  const member = await isChannelMember(login.id);
  if (!member) {
    const err = new Error('Subscribe to the Telegram channel first, then try again.');
    err.status = 403;
    err.code = 'telegram_not_subscribed';
    err.channelUrl = getChannelUrl();
    throw err;
  }

  const expiresAt = new Date(Date.now() + BETA_ACCESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const subscription = await setOwnerPlan(ownerId, BETA_PLAN_ID, {
    source: 'telegram_beta',
    expiresAt,
  });

  return {
    subscription,
    telegram: {
      id: login.id,
      username: login.username,
      firstName: login.firstName,
    },
    channelUrl: getChannelUrl(),
    expiresAt,
  };
}

async function unlockInvestorTrialViaTelegram(ownerId, loginPayload) {
  if (!isBetaUnlockConfigured()) {
    const err = new Error('Telegram channel unlock is not configured.');
    err.status = 503;
    err.code = 'beta_bot_not_configured';
    throw err;
  }

  const login = verifyTelegramLogin(loginPayload);
  const member = await isChannelMember(login.id);
  if (!member) {
    const err = new Error('Subscribe to the Telegram channel first, then try again.');
    err.status = 403;
    err.code = 'telegram_not_subscribed';
    err.channelUrl = getChannelUrl();
    throw err;
  }

  const subscription = await startInvestorTrial(ownerId, { source: 'investor_trial_telegram' });
  return {
    subscription,
    telegram: {
      id: login.id,
      username: login.username,
      firstName: login.firstName,
    },
    channelUrl: getChannelUrl(),
    expiresAt: subscription.expiresAt || null,
  };
}

module.exports = {
  isBetaMode,
  getBetaPublicConfig,
  verifyTelegramLogin,
  isChannelMember,
  unlockBetaAccess,
  unlockInvestorTrialViaTelegram,
  isBetaUnlockConfigured,
  BETA_PLAN_ID,
  BETA_ACCESS_DAYS,
};
