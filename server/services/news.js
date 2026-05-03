const { XMLParser } = require('fast-xml-parser');
const { remember } = require('./cache');

const CACHE_KEY = 'cs2-news-feed-v2';
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_ITEMS = 9;
const MAX_PER_SOURCE = 6;

const FEED_SOURCES = [
  {
    id: 'steam',
    name: 'Steam',
    kind: 'official',
    priority: 3,
    url: 'https://store.steampowered.com/feeds/news/app/730/',
  },
  {
    id: 'hltv',
    name: 'HLTV',
    kind: 'esports',
    priority: 2,
    url: 'https://www.hltv.org/rss/news',
  },
];

const FALLBACK_ITEMS = [
  {
    id: 'steam-fallback-1',
    source: 'steam',
    sourceName: 'Steam',
    sourceKind: 'official',
    title: 'Counter-Strike 2 updates land here first',
    summary: 'Official CS2 release notes, map changes, gameplay tweaks, event announcements, and matchmaking updates from Valve.',
    url: 'https://store.steampowered.com/news/app/730',
    image: null,
    publishedAt: '2026-05-01T08:00:00.000Z',
  },
  {
    id: 'hltv-fallback-1',
    source: 'hltv',
    sourceName: 'HLTV',
    sourceKind: 'esports',
    title: 'HLTV tracks roster moves, tournaments, and match-day storylines',
    summary: 'When the live feed is unavailable, keep HLTV as the primary esports source for lineups, event coverage, and results.',
    url: 'https://www.hltv.org/news',
    image: null,
    publishedAt: '2026-05-01T07:00:00.000Z',
  },
  {
    id: 'steam-fallback-2',
    source: 'steam',
    sourceName: 'Steam',
    sourceKind: 'official',
    title: 'This news module refreshes automatically on the backend',
    summary: 'The server caches upstream feeds for a short window so the landing page stays fast and stable even when external sources slow down.',
    url: 'https://store.steampowered.com/news/app/730',
    image: null,
    publishedAt: '2026-05-01T06:30:00.000Z',
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: true,
});

async function getCsNews() {
  const { value, cached } = await remember(CACHE_KEY, CACHE_TTL_MS, loadFeeds);
  return {
    ...value,
    cached,
    fallback: Boolean(value.fallback),
  };
}

async function loadFeeds() {
  const settled = await Promise.allSettled(FEED_SOURCES.map(loadFeedSource));
  const successes = settled
    .filter((entry) => entry.status === 'fulfilled')
    .map((entry) => entry.value);
  const failures = settled
    .filter((entry) => entry.status === 'rejected')
    .map((entry) => ({
      ok: false,
      source: entry.reason?.source || 'unknown',
      message: entry.reason?.message || 'Failed to load source.',
    }));

  const items = mergeSourceItems(successes);

  const sources = [
    ...successes.map((entry) => ({
      source: entry.source,
      name: entry.name,
      kind: entry.kind,
      ok: true,
      count: entry.items.length,
    })),
    ...failures,
  ];

  if (!items.length) {
    return {
      items: FALLBACK_ITEMS,
      updatedAt: new Date().toISOString(),
      fallback: true,
      sources,
    };
  }

  return {
    items,
    updatedAt: new Date().toISOString(),
    fallback: false,
    sources,
  };
}

async function loadFeedSource(source) {
  try {
    const xml = await fetchText(source.url);
    const raw = parser.parse(xml);
    const items = normalizeRssItems(raw, source).slice(0, MAX_PER_SOURCE);
    return {
      source: source.id,
      name: source.name,
      kind: source.kind,
      items,
    };
  } catch (error) {
    error.source = source.id;
    throw error;
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, text/html;q=0.8',
        'User-Agent': 'Steam-Invest-Portfolio/0.1 (+https://localhost)',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Upstream request failed with ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeRssItems(payload, source) {
  const channel = payload?.rss?.channel;
  const items = Array.isArray(channel?.item) ? channel.item : (channel?.item ? [channel.item] : []);

  return items
    .map((item, index) => normalizeFeedItem(item, source, index))
    .filter(Boolean);
}

function normalizeFeedItem(item, source, index) {
  const title = cleanText(item?.title);
  const url = cleanUrl(item?.link);
  if (!title || !url) return null;

  const summary = cleanText(item?.description || item?.contentSnippet || item?.['content:encoded'] || '');
  const image = cleanUrl(
    item?.enclosure?.url
    || item?.['media:content']?.url
    || (Array.isArray(item?.['media:content']) ? item['media:content'][0]?.url : null)
    || null
  );

  return {
    id: `${source.id}-${item?.guid?.['#text'] || item?.guid || index}`,
    source: source.id,
    sourceName: source.name,
    sourceKind: source.kind,
    sourcePriority: source.priority,
    title,
    summary,
    url,
    image,
    publishedAt: normalizeDate(item?.pubDate),
  };
}

function normalizeDate(value) {
  const timestamp = Date.parse(String(value || ''));
  if (Number.isNaN(timestamp)) return new Date(0).toISOString();
  return new Date(timestamp).toISOString();
}

function cleanText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function uniqueByUrl() {
  const seen = new Set();
  return (item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  };
}

function mergeSourceItems(entries) {
  const queues = entries
    .map((entry) => ({
      ...entry,
      items: [...entry.items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    }))
    .sort((a, b) => (b.items[0] ? new Date(b.items[0].publishedAt).getTime() : 0) - (a.items[0] ? new Date(a.items[0].publishedAt).getTime() : 0)
      || (b.kind === 'official') - (a.kind === 'official')
      || b.items.length - a.items.length);

  const merged = [];
  const accept = uniqueByUrl();

  while (merged.length < MAX_ITEMS && queues.some((entry) => entry.items.length)) {
    for (const entry of queues) {
      const candidate = entry.items.shift();
      if (!candidate) continue;
      if (accept(candidate)) merged.push(candidate);
      if (merged.length >= MAX_ITEMS) break;
    }
  }

  return merged;
}

module.exports = {
  getCsNews,
};
