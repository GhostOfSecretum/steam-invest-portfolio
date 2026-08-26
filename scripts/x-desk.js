#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });

const DESK_DIR = path.join(ROOT, 'x-desk');
const SEED_FILE = path.join(DESK_DIR, 'data.json');
const DATA_FILE = process.env.X_DESK_DATA || SEED_FILE;
const PORT = Number(process.env.X_DESK_PORT || 3847);
const DESK_USER = String(process.env.X_DESK_USER || 'rustam').trim();
const DESK_PASSWORD = String(process.env.X_DESK_PASSWORD || '').trim();
const HOST = process.env.X_DESK_BIND || (DESK_PASSWORD ? '0.0.0.0' : '127.0.0.1');
const HANDLE = 'SkinsheadPro';
const FX = 'https://api.fxtwitter.com';

function isLoopback(req) {
  const ip = String(req.socket.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseBasic(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return null;
  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return null;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return null;
  return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}

function requireDeskAuth(req, res, next) {
  if (!DESK_PASSWORD) {
    if (!isLoopback(req)) {
      res.status(404).end();
      return;
    }
    next();
    return;
  }
  const creds = parseBasic(req);
  if (
    !creds
    || !safeEqual(creds.user, DESK_USER)
    || !safeEqual(creds.pass, DESK_PASSWORD)
  ) {
    res.set('WWW-Authenticate', 'Basic realm="SkinsHead desk"');
    res.set('Cache-Control', 'no-store');
    res.status(401).send('Restricted');
    return;
  }
  next();
}

function mskDate(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function mskTime(ms = Date.now()) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    if (DATA_FILE === SEED_FILE) throw new Error(`Missing desk data: ${SEED_FILE}`);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.copyFile(SEED_FILE, DATA_FILE);
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
}

async function fxGet(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SkinsHead-XDesk/1.0' },
  });
  if (!res.ok) throw new Error(`FxTwitter ${res.status} ${url}`);
  return res.json();
}

async function pullTimeline() {
  const items = [];
  const seen = new Set();
  let cursor = null;
  for (let page = 0; page < 5; page += 1) {
    let url = `${FX}/2/profile/${HANDLE}/statuses?count=100&with_replies=1`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const data = await fxGet(url);
    const results = data.results || [];
    let added = 0;
    for (const t of results) {
      if (!t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      items.push(t);
      added += 1;
    }
    const next = data.cursor && data.cursor.bottom;
    if (!results.length || !next || next === cursor || added === 0) break;
    cursor = next;
  }
  return items.filter((t) => t.author && t.author.screen_name === HANDLE);
}

function isReply(t) {
  return Boolean(t.replying_to || t.replying_to_status);
}

function replyHandle(t) {
  const to = t.replying_to;
  if (to && typeof to === 'object') return to.screen_name || '';
  return to || '';
}

function addIsoDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function rankReplies(list, limit) {
  return list
    .map((t) => ({
      handle: replyHandle(t),
      views: t.views || 0,
      likes: t.likes || 0,
      replies: t.replies || 0,
      text: t.text || '',
      date: mskDate((t.created_timestamp || 0) * 1000),
    }))
    .sort((a, b) => (b.views - a.views) || (b.likes - a.likes))
    .slice(0, limit);
}

async function pullLive() {
  const [userWrap, mine] = await Promise.all([
    fxGet(`${FX}/${HANDLE}`),
    pullTimeline(),
  ]);
  const user = userWrap.user || {};
  const today = mskDate();
  const todays = mine.filter((t) => mskDate((t.created_timestamp || 0) * 1000) === today);
  const replies = todays.filter(isReply);
  const posts = todays.filter((t) => !isReply(t));
  const original = mine.filter((t) => !isReply(t));
  const latestPost = original.sort((a, b) => b.created_timestamp - a.created_timestamp)[0] || null;

  const weekFrom = addIsoDays(today, -6);
  const weekReplies = mine.filter((t) => {
    if (!isReply(t)) return false;
    const date = mskDate((t.created_timestamp || 0) * 1000);
    return date >= weekFrom && date <= today;
  });
  const topReplies = rankReplies(replies, 5);
  const weekTopReplies = rankReplies(weekReplies, 8);

  return {
    pulledAt: new Date().toISOString(),
    pulledAtMsk: `${today} ${mskTime()} МСК`,
    profile: {
      followers: user.followers ?? 0,
      following: user.following ?? 0,
      statuses: user.tweets ?? user.statuses ?? mine.length,
      likesGiven: user.likes ?? 0,
      mediaCount: user.media_count ?? 0,
    },
    today: {
      date: today,
      replies: replies.length,
      replyViews: replies.reduce((s, t) => s + (t.views || 0), 0),
      replyLikes: replies.reduce((s, t) => s + (t.likes || 0), 0),
      replyBacks: replies.filter((t) => (t.replies || 0) > 0).length,
      replyBackHandles: [...new Set(replies.filter((t) => (t.replies || 0) > 0).map(replyHandle).filter(Boolean))],
      topReplies,
      posts: posts.map((t) => ({
        id: t.id,
        url: t.url,
        time: mskTime((t.created_timestamp || 0) * 1000),
        views: t.views || 0,
        likes: t.likes || 0,
        replies: t.replies || 0,
        reposts: t.reposts || t.retweets || 0,
        text: t.text || '',
      })),
    },
    latestPost: latestPost
      ? {
          id: latestPost.id,
          url: latestPost.url,
          date: mskDate((latestPost.created_timestamp || 0) * 1000),
          time: mskTime((latestPost.created_timestamp || 0) * 1000),
          views: latestPost.views || 0,
          likes: latestPost.likes || 0,
          replies: latestPost.replies || 0,
          reposts: latestPost.reposts || latestPost.retweets || 0,
          text: latestPost.text || '',
        }
      : null,
    week: {
      from: weekFrom,
      to: today,
      topReplies: weekTopReplies,
    },
  };
}

function mergeLive(data, live) {
  data.live = live;
  const today = live.today.date;
  let day = data.days.find((d) => d.date === today);
  if (!day) {
    day = { date: today, kind: 'content', label: today.slice(5) };
    data.days.push(day);
  }
  if (day.kind === 'planned') day.kind = 'content';
  day.replies = live.today.replies;
  day.replyViews = live.today.replyViews;
  day.replyLikes = live.today.replyLikes;
  day.replyBacks = live.today.replyBacks;
  if (live.today.replyBackHandles.length) day.replyBackHandles = live.today.replyBackHandles;
  if (live.today.topReplies.length) day.topReplies = live.today.topReplies;
  if (live.week && live.week.topReplies) data.weekTopReplies = live.week.topReplies;
  day.followers = live.profile.followers;
  day.following = live.profile.following;
  day.statuses = live.profile.statuses;
  day.likesGiven = live.profile.likesGiven;

  const livePost = live.today.posts[0] || (live.latestPost && live.latestPost.date === today ? live.latestPost : null);
  if (livePost) {
    day.post = {
      ...(day.post || {}),
      time: livePost.time || (day.post && day.post.time),
      views: livePost.views,
      likes: livePost.likes,
      replies: livePost.replies,
      reposts: livePost.reposts,
      url: livePost.url,
      text: (day.post && day.post.text) || livePost.text,
    };
  }
  return data;
}

const PULL_EVERY_MS = 30 * 60 * 1000;
let pulling = null;

async function refreshDesk() {
  if (pulling) return pulling;
  pulling = (async () => {
    try {
      const live = await pullLive();
      const data = mergeLive(await readData(), live);
      await writeData(data);
      console.log(`[x-desk] pulled ${live.pulledAtMsk}`);
      return data;
    } finally {
      pulling = null;
    }
  })();
  return pulling;
}

if (HOST !== '127.0.0.1' && HOST !== '::1' && !DESK_PASSWORD) {
  console.error('X_DESK_PASSWORD is required when the desk binds beyond localhost');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (DESK_PASSWORD) app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(requireDeskAuth);
app.use(express.json({ limit: '200kb' }));

app.get('/api/desk', async (_req, res) => {
  try {
    res.json(await readData());
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/desk/refresh', async (_req, res) => {
  try {
    res.json(await refreshDesk());
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.get('/media/header.png', (_req, res) => {
  res.sendFile(path.join(ROOT, 'output', 'x-header-v6-mobile-1500x500.png'));
});
app.get('/media/avatar.png', (_req, res) => {
  res.sendFile(path.join(ROOT, 'logo-cs2-candles-variant-02.png'));
});
app.get('/media/pin.mp4', (_req, res) => {
  res.sendFile(path.join(ROOT, 'output', 'skinshead-x-pin-pnl.mp4'));
});
app.get('/media/reel.mp4', (_req, res) => {
  res.sendFile(path.join(ROOT, 'output', 'skinshead_reel_ms_v2_open.mp4'));
});
app.use('/fonts', express.static(path.join(ROOT, 'assets', 'fonts')));
app.use(express.static(DESK_DIR));

app.listen(PORT, HOST, () => {
  const local = HOST === '127.0.0.1' || HOST === '::1';
  const url = `http://127.0.0.1:${PORT}`;
  console.log(local ? `X desk (local only) → ${url}` : `X desk → ${HOST}:${PORT} (password required)`);
  console.log('Auto-pull from X every 30 min while this process runs');
  setInterval(() => {
    refreshDesk().catch((err) => {
      console.error('[x-desk] auto pull failed', err.message || err);
    });
  }, PULL_EVERY_MS);
  if (local && process.platform === 'darwin') exec(`open ${url}`);
});
