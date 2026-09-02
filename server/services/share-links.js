const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { parseShareCard } = require('./share-card');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const LINKS_FILE = path.join(DATA_DIR, 'share-links.json');
const SHARE_ID_RE = /^[a-f0-9]{10}$/;
const MAX_LINKS = 4000;

let writeQueue = Promise.resolve();

function isShareId(value) {
  return SHARE_ID_RE.test(String(value || '').trim());
}

function sanitizeProfile(value) {
  const profile = String(value || '').trim();
  if (!profile || profile.length > 200) return '';
  if (/^\d{17}$/.test(profile)) return profile;
  if (/^manual-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile)) return profile;
  if (/^https?:\/\/(?:www\.)?steamcommunity\.com\/(?:id|profiles)\/[^\s/?#]+/i.test(profile)) {
    return profile.slice(0, 200);
  }
  return '';
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(LINKS_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.links || typeof parsed.links !== 'object') {
      return { version: 1, links: {} };
    }
    return { version: 1, links: parsed.links };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { version: 1, links: {} };
    throw error;
  }
}

async function writeStore(store) {
  await ensureDataDir();
  const tmp = `${LINKS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store), 'utf8');
  await fs.rename(tmp, LINKS_FILE);
}

function pruneLinks(links) {
  const ids = Object.keys(links);
  if (ids.length <= MAX_LINKS) return links;
  const ranked = ids
    .map((id) => ({ id, at: String(links[id]?.createdAt || '') }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const next = { ...links };
  for (const entry of ranked.slice(0, ids.length - MAX_LINKS)) delete next[entry.id];
  return next;
}

function shareIdFor(card, profile) {
  return crypto.createHash('sha256').update(`${card}\n${profile}`).digest('hex').slice(0, 10);
}

async function createShareLink({ card, profile } = {}) {
  const token = String(card || '').trim();
  if (!parseShareCard(token)) return null;
  const profileRef = sanitizeProfile(profile);
  const id = shareIdFor(token, profileRef);

  const run = writeQueue.then(async () => {
    const store = await readStore();
    if (!store.links[id]) {
      store.links = pruneLinks(store.links);
      store.links[id] = { card: token, profile: profileRef, createdAt: new Date().toISOString() };
      await writeStore(store);
    }
    return { id, profile: store.links[id].profile };
  });
  writeQueue = run.catch(() => {});
  return run;
}

async function getShareLink(id) {
  if (!isShareId(id)) return null;
  const store = await readStore();
  const link = store.links[id];
  if (!link || typeof link !== 'object') return null;
  const card = String(link.card || '').trim();
  if (!parseShareCard(card)) return null;
  return { id, card, profile: sanitizeProfile(link.profile) };
}

module.exports = {
  isShareId,
  createShareLink,
  getShareLink,
};
