require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { getTelegramClientOptions } = require('../server/services/telegram');

const URL_RE = /https?:\/\/[^\s<>"'\)\]]+/gi;
const STEAM_PROFILE_RE = /^https?:\/\/(?:www\.)?steamcommunity\.com\/(?:id|profiles)\/[^/?#\s]+/i;

function usage() {
  console.error(`Usage:
  node scripts/extract-telegram-topic-links.js <topic-url> [--out file.txt] [--steam-only]

Examples:
  node scripts/extract-telegram-topic-links.js "https://t.me/c/1234567890/42" --steam-only --out steam-profiles.txt
`);
}

function getCredentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
  const session = String(process.env.TELEGRAM_SESSION || '').trim();
  if (!Number.isFinite(apiId) || !apiId || !apiHash || !session) {
    throw new Error('Set TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_SESSION in .env');
  }
  return { apiId, apiHash, session };
}

function parseTopicRef(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('Topic URL is required.');

  const privateMatch = value.match(
    /^(?:https?:\/\/)?t\.me\/c\/(\d+)\/(\d+)(?:\/\d+)?(?:[?#].*)?$/i,
  );
  if (privateMatch) {
    return {
      kind: 'private',
      channelId: Number(privateMatch[1]),
      topicId: Number(privateMatch[2]),
      peer: `-100${privateMatch[1]}`,
    };
  }

  const publicMatch = value.match(
    /^(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{5,32})\/(\d+)(?:\/\d+)?(?:[?#].*)?$/i,
  );
  if (publicMatch) {
    return {
      kind: 'username',
      username: publicMatch[1],
      topicId: Number(publicMatch[2]),
      peer: publicMatch[1],
    };
  }

  throw new Error(
    'Unsupported topic URL. Expected https://t.me/c/<id>/<topicId> or https://t.me/<username>/<topicId>',
  );
}

function cleanUrl(url) {
  return String(url || '').trim().replace(/[),.;!?]+$/g, '');
}

function normalizeSteamProfileUrl(url) {
  const cleaned = cleanUrl(url);
  const match = cleaned.match(
    /^(https?:\/\/(?:www\.)?steamcommunity\.com\/(?:id|profiles)\/([^/?#\s]+))/i,
  );
  if (!match) return null;

  const kind = /\/profiles\//i.test(match[1]) ? 'profiles' : 'id';
  const slug = decodeURIComponent(match[2]).replace(/\/+$/, '');
  if (!slug) return null;

  return `https://steamcommunity.com/${kind}/${slug}`;
}

function addLink(bucket, url, meta, steamOnly) {
  const cleaned = cleanUrl(url);
  if (!cleaned || !/^https?:\/\//i.test(cleaned)) return;

  if (steamOnly) {
    const steamUrl = normalizeSteamProfileUrl(cleaned);
    if (!steamUrl) return;
    const entry = bucket.get(steamUrl) || { count: 0, messageIds: new Set() };
    entry.count += 1;
    if (meta?.messageId) entry.messageIds.add(meta.messageId);
    bucket.set(steamUrl, entry);
    return;
  }

  if (!bucket.has(cleaned)) {
    bucket.set(cleaned, { count: 1, messageIds: new Set(meta?.messageId ? [meta.messageId] : []) });
  } else {
    const entry = bucket.get(cleaned);
    entry.count += 1;
    if (meta?.messageId) entry.messageIds.add(meta.messageId);
  }
}

function collectLinksFromMessage(message, bucket, steamOnly) {
  const messageId = message?.id || null;
  const date = message?.date || null;
  const meta = { messageId, date };

  const text = String(message?.message || '');
  for (const match of text.matchAll(URL_RE)) {
    addLink(bucket, match[0], meta, steamOnly);
  }

  for (const entity of message?.entities || []) {
    if (entity instanceof Api.MessageEntityTextUrl && entity.url) {
      addLink(bucket, entity.url, meta, steamOnly);
    } else if (entity instanceof Api.MessageEntityUrl) {
      const slice = text.slice(entity.offset, entity.offset + entity.length);
      addLink(bucket, slice, meta, steamOnly);
    }
  }

  const webpageUrl = message?.media?.webpage?.url;
  if (webpageUrl) {
    addLink(bucket, webpageUrl, meta, steamOnly);
  }

  const rows = message?.replyMarkup?.rows || [];
  for (const row of rows) {
    for (const button of row.buttons || []) {
      if (button?.url) {
        addLink(bucket, button.url, meta, steamOnly);
      }
    }
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let topicUrl = null;
  let outPath = null;
  let steamOnly = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out' || arg === '-o') {
      outPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--steam-only') {
      steamOnly = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (!topicUrl) topicUrl = arg;
  }

  return { topicUrl, outPath, steamOnly };
}

function formatGroupedLinks(bucket, steamOnly) {
  const rows = [...bucket.entries()]
    .map(([url, info]) => ({
      url,
      count: info.count,
      messages: info.messageIds.size,
    }))
    .sort((a, b) => b.count - a.count || a.url.localeCompare(b.url));

  if (!rows.length) return '';

  if (!steamOnly) {
    return `${rows.map((row) => row.url).join('\n')}\n`;
  }

  const lines = [
    `# Steam profiles from Telegram topic`,
    `# unique=${rows.length} total_mentions=${rows.reduce((sum, row) => sum + row.count, 0)}`,
    `# format: count | profile_url`,
    '',
    ...rows.map((row) => `${String(row.count).padStart(4, ' ')} | ${row.url}`),
    '',
  ];
  return lines.join('\n');
}

(async () => {
  const { topicUrl, outPath, steamOnly } = parseArgs(process.argv);
  if (!topicUrl) {
    usage();
    process.exit(1);
  }

  const credentials = getCredentials();
  const topic = parseTopicRef(topicUrl);
  const client = new TelegramClient(
    new StringSession(credentials.session),
    credentials.apiId,
    credentials.apiHash,
    getTelegramClientOptions({ connectionRetries: 5 }),
  );

  await client.connect();
  await client.getMe();

  const entity = await client.getEntity(topic.peer);
  const title = entity?.title || topic.username || topic.peer;
  const links = new Map();
  let scanned = 0;

  for await (const message of client.iterMessages(entity, {
    replyTo: topic.topicId,
  })) {
    scanned += 1;
    collectLinksFromMessage(message, links, steamOnly);
  }

  const body = formatGroupedLinks(links, steamOnly);
  const uniqueCount = links.size;

  console.log(`Channel: ${title}`);
  console.log(`Topic ID: ${topic.topicId}`);
  console.log(`Messages scanned: ${scanned}`);
  console.log(`${steamOnly ? 'Unique Steam profiles' : 'Unique links'}: ${uniqueCount}`);
  console.log('---');
  process.stdout.write(body || (steamOnly ? '(no Steam profile links found)\n' : '(no links found)\n'));

  if (outPath) {
    const absolute = path.resolve(outPath);
    fs.writeFileSync(absolute, body || '', 'utf8');
    console.error(`Saved: ${absolute}`);
  }

  await client.disconnect();
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
