const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');

const DEFAULT_POSTS_PER_CHANNEL = 20;
const MAX_POSTS_PER_CHANNEL = 50;
const CONNECT_RETRIES = 2;
const CONNECT_TIMEOUT_MS = 30000;
const CHANNEL_TIMEOUT_MS = 45000;
const MEDIA_CACHE_TTL_MS = 30 * 60 * 1000;
const MEDIA_CACHE_MAX_ITEMS = 80;
const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

let clientPromise = null;
let clientInstance = null;
const mediaCache = new Map();

function resetTelegramClient() {
  const client = clientInstance;
  clientInstance = null;
  clientPromise = null;
  if (client) {
    client.disconnect().catch(() => {});
  }
}

async function getTelegramNewsChannels() {
  const channels = getConfiguredChannels();
  const credentials = getTelegramCredentials();

  if (!channels.length) {
    return {
      items: [],
      sources: [],
      configured: false,
      message: 'No Telegram channels configured.',
    };
  }

  if (!credentials) {
    return {
      items: [],
      sources: channels.map((channel) => ({
        source: channel.id,
        name: channel.name,
        kind: 'telegram',
        ok: false,
        count: 0,
        message: 'Telegram API credentials are missing.',
      })),
      configured: false,
      message: 'Telegram API credentials are missing.',
    };
  }

  let client;
  try {
    client = await getTelegramClient(credentials);
  } catch (error) {
    resetTelegramClient();
    return {
      items: [],
      sources: channels.map((channel) => ({
        source: channel.id,
        name: channel.name,
        kind: 'telegram',
        ok: false,
        count: 0,
        message: error.message || 'Failed to connect to Telegram.',
      })),
      configured: true,
      message: error.message || 'Failed to connect to Telegram.',
    };
  }

  const successes = [];
  const failures = [];
  for (const channel of channels) {
    try {
      const source = await withTimeout(
        loadChannelPosts(client, channel),
        CHANNEL_TIMEOUT_MS,
        `Timed out loading ${channel.name}.`,
      );
      successes.push(source);
    } catch (error) {
      failures.push({
        source: error.channelId || channel.id,
        name: error.channelName || channel.name,
        kind: 'telegram',
        ok: false,
        count: 0,
        message: error.message || 'Failed to load Telegram channel.',
      });
    }
  }

  if (failures.length && !successes.length) {
    resetTelegramClient();
  }

  return {
    items: successes.flatMap((source) => source.items),
    sources: [
      ...successes.map((source) => ({
        source: source.source,
        name: source.name,
        kind: 'telegram',
        ok: true,
        count: source.items.length,
      })),
      ...failures,
    ],
    configured: true,
    message: failures.length && !successes.length
      ? failures.map((entry) => entry.message).filter(Boolean).join(' ')
      : null,
  };
}

function getConfiguredChannels() {
  return parseChannelList(process.env.TELEGRAM_CHANNELS)
    .map(parseChannelConfig)
    .filter(Boolean);
}

function parseChannelList(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseChannelConfig(value) {
  const raw = String(value || '').trim();
  const inviteHash = getInviteHash(raw);
  if (inviteHash) {
    return {
      id: `telegram-invite-${inviteHash.toLowerCase()}`,
      type: 'invite',
      inviteHash,
      name: 'Telegram invite channel',
    };
  }

  const username = normalizeChannelUsername(raw);
  if (!username) return null;
  return {
    id: `telegram-${username.toLowerCase()}`,
    type: 'username',
    username,
    name: `@${username}`,
  };
}

function getInviteHash(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(?:https?:\/\/)?t\.me\/(?:joinchat\/|\+)([^/?#\s]+)/i);
  if (match?.[1]) return match[1].replace(/\/+$/, '');
  if (raw.startsWith('+') && raw.length > 1) return raw.slice(1);
  return null;
}

function normalizeChannelUsername(value) {
  const username = String(value || '')
    .trim()
    .replace(/^https?:\/\/t\.me\/s\//i, '')
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  return /^[a-zA-Z0-9_]{5,32}$/.test(username) ? username : null;
}

function getTelegramCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
  const session = String(process.env.TELEGRAM_SESSION || '').trim();

  if (!Number.isFinite(apiId) || !apiId || !apiHash || !session) return null;
  return { apiId, apiHash, session };
}

function getTelegramProxyConfig() {
  const host = String(process.env.TELEGRAM_PROXY_HOST || '').trim();
  const port = Number(process.env.TELEGRAM_PROXY_PORT);
  if (!host || !Number.isFinite(port) || port < 1) return null;

  return {
    ip: host,
    port,
    socksType: 5,
    MTProxy: false,
    timeout: 10,
  };
}

function getTelegramClientOptions(overrides = {}) {
  const options = {
    connectionRetries: overrides.connectionRetries ?? CONNECT_RETRIES,
    timeout: (overrides.timeoutMs ?? CONNECT_TIMEOUT_MS) / 1000,
    autoReconnect: overrides.autoReconnect ?? true,
  };
  const proxy = getTelegramProxyConfig();
  if (proxy) {
    options.useWSS = false;
    options.proxy = proxy;
  }
  return options;
}

async function getTelegramClient(credentials) {
  if (!clientPromise) {
    clientPromise = connectTelegramClient(credentials).catch((error) => {
      resetTelegramClient();
      throw error;
    });
  }
  return clientPromise;
}

async function connectTelegramClient({ apiId, apiHash, session }) {
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, getTelegramClientOptions());
  try {
    await withTimeout(client.connect(), CONNECT_TIMEOUT_MS, 'Timed out connecting to Telegram.');
  } catch (error) {
    await client.disconnect().catch(() => {});
    throw error;
  }
  clientInstance = client;
  return client;
}

async function loadChannelPosts(client, channel) {
  try {
    const entity = await resolveChannelEntity(client, channel);
    const messages = await client.getMessages(entity, {
      limit: getPostsPerChannelLimit(),
    });

    const sourceName = entity?.title || channel.name;
    const username = entity?.username || channel.username || null;
    const internalId = getInternalChannelId(entity);

    return {
      source: channel.id,
      name: sourceName,
      items: messages
        .map((message) => normalizeTelegramMessage(message, {
          ...channel,
          name: sourceName,
          username,
          internalId,
        }))
        .filter(Boolean),
    };
  } catch (error) {
    error.channelId = channel.id;
    error.channelName = channel.name;
    throw error;
  }
}

async function resolveChannelEntity(client, channel) {
  if (channel.type === 'invite') {
    const invite = await client.invoke(new Api.messages.CheckChatInvite({
      hash: channel.inviteHash,
    }));
    if (invite?.chat) return invite.chat;
    throw new Error('Invite link is valid, but this Telegram account has not joined the channel yet.');
  }

  return client.getEntity(channel.username);
}

function getPostsPerChannelLimit() {
  const limit = Number(process.env.TELEGRAM_POSTS_PER_CHANNEL || DEFAULT_POSTS_PER_CHANNEL);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_POSTS_PER_CHANNEL;
  return Math.min(Math.floor(limit), MAX_POSTS_PER_CHANNEL);
}

function normalizeTelegramMessage(message, channel) {
  const text = cleanText(message?.message || '');
  if (!message?.id || !text) return null;

  const title = getPostTitle(text);

  return {
    id: `${channel.id}-${message.id}`,
    source: channel.id,
    sourceName: channel.name,
    sourceKind: 'telegram',
    channelUsername: channel.username,
    title,
    summary: getPostSummary(text, title),
    url: getTelegramPostUrl(channel, message.id),
    image: hasPreviewableMedia(message) ? `/api/news/telegram-media/${encodeURIComponent(channel.id)}/${message.id}` : null,
    publishedAt: normalizeTelegramDate(message.date),
  };
}

async function getTelegramPostMedia(sourceId, messageId) {
  const channel = getConfiguredChannels().find((entry) => entry.id === sourceId);
  const numericMessageId = Number(messageId);
  if (!channel || !Number.isInteger(numericMessageId) || numericMessageId < 1) return null;

  const cached = getCachedMedia(sourceId, numericMessageId);
  if (cached) return cached;

  const credentials = getTelegramCredentials();
  if (!credentials) return null;

  const client = await getTelegramClient(credentials);
  const entity = await resolveChannelEntity(client, channel);
  const message = await getMessageById(client, entity, numericMessageId);
  if (!message || !hasPreviewableMedia(message)) return null;

  const buffer = await downloadMessagePreview(client, message);
  if (!buffer || buffer.length > MEDIA_MAX_BYTES) return null;

  const media = {
    buffer,
    contentType: getMediaContentType(buffer),
  };
  setCachedMedia(sourceId, numericMessageId, media);
  return media;
}

async function getMessageById(client, entity, messageId) {
  const result = await client.getMessages(entity, { ids: messageId });
  if (Array.isArray(result)) return result[0] || null;
  return result || null;
}

async function downloadMessagePreview(client, message) {
  if (message?.photo) return client.downloadMedia(message);
  if (message?.document && !isImageDocument(message)) {
    return client.downloadMedia(message, { thumb: 0 });
  }
  return client.downloadMedia(message);
}

function hasPreviewableMedia(message) {
  if (message?.photo) return true;
  if (!message?.document) return false;
  const mimeType = String(message.document.mimeType || '').toLowerCase();
  return mimeType.startsWith('image/') || mimeType.startsWith('video/');
}

function isImageDocument(message) {
  return String(message?.document?.mimeType || '').toLowerCase().startsWith('image/');
}

function getCachedMedia(sourceId, messageId) {
  const cacheKey = getMediaCacheKey(sourceId, messageId);
  const cached = mediaCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > MEDIA_CACHE_TTL_MS) {
    mediaCache.delete(cacheKey);
    return null;
  }
  return cached.media;
}

function setCachedMedia(sourceId, messageId, media) {
  const cacheKey = getMediaCacheKey(sourceId, messageId);
  mediaCache.set(cacheKey, { media, updatedAt: Date.now() });
  while (mediaCache.size > MEDIA_CACHE_MAX_ITEMS) {
    const oldestKey = mediaCache.keys().next().value;
    mediaCache.delete(oldestKey);
  }
}

function getMediaCacheKey(sourceId, messageId) {
  return `${sourceId}:${messageId}`;
}

function getMediaContentType(buffer) {
  const signature = buffer.slice(0, 12).toString('hex');
  if (signature.startsWith('ffd8ff')) return 'image/jpeg';
  if (signature.startsWith('89504e47')) return 'image/png';
  if (signature.startsWith('47494638')) return 'image/gif';
  if (signature.slice(16, 24) === '57454250') return 'image/webp';
  return 'application/octet-stream';
}

function getTelegramPostUrl(channel, messageId) {
  if (channel.username) return `https://t.me/${channel.username}/${messageId}`;
  if (channel.internalId) return `https://t.me/c/${channel.internalId}/${messageId}`;
  return 'https://t.me';
}

function getInternalChannelId(entity) {
  const raw = String(entity?.id || '').replace(/\D/g, '');
  if (!raw) return null;
  return raw.startsWith('100') && raw.length > 10 ? raw.slice(3) : raw;
}

function getPostTitle(text) {
  const firstLine = text.split('\n').find(Boolean) || text;
  return truncate(firstLine, 120);
}

function getPostSummary(text, title) {
  const summary = text === title ? '' : text.replace(title, '').trim();
  return truncate(summary || text, 260);
}

function normalizeTelegramDate(value) {
  if (value instanceof Date) return value.toISOString();
  const timestamp = Number(value);
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp).toISOString();
  }
  const parsed = Date.parse(String(value || ''));
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return new Date(0).toISOString();
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

module.exports = {
  getTelegramNewsChannels,
  getTelegramPostMedia,
  getTelegramClientOptions,
};
