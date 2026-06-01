const { getCached, getCachedEntry, setCached } = require('./cache');
const { getTelegramNewsChannels } = require('./telegram');

const CACHE_KEY = 'cs2-news-feed-v7';
const CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ITEMS = 50;

async function getCsNews() {
  const cacheKey = getCacheKey();
  const cachedValue = await getCached(cacheKey, CACHE_TTL_MS);
  if (cachedValue) {
    return {
      ...cachedValue,
      cached: true,
      fallback: false,
    };
  }

  const value = await loadFeeds();
  if (shouldCacheFeed(value)) {
    await setCached(cacheKey, value);
  }

  if (!value.items?.length) {
    const stale = await getCachedEntry(cacheKey);
    if (stale?.value?.items?.length) {
      return {
        ...stale.value,
        cached: true,
        stale: true,
        fallback: true,
        message: value.message || 'Showing cached Telegram posts because the live fetch failed.',
      };
    }
  }

  return {
    ...value,
    cached: false,
    fallback: false,
  };
}

async function loadFeeds() {
  const feed = await getTelegramNewsChannels();
  const items = mergeItems(feed.items).slice(0, getMaxItems());

  return {
    items,
    updatedAt: new Date().toISOString(),
    fallback: false,
    configured: Boolean(feed.configured),
    sources: feed.sources,
    message: feed.message || null,
  };
}

function shouldCacheFeed(feed) {
  if (!feed.configured) return true;
  return Array.isArray(feed.sources) && feed.sources.some((source) => source.ok !== false);
}

function getCacheKey() {
  const hasCredentials = Boolean(
    process.env.TELEGRAM_API_ID
    && process.env.TELEGRAM_API_HASH
    && process.env.TELEGRAM_SESSION
  );
  const channels = String(process.env.TELEGRAM_CHANNELS || 'none').toLowerCase();
  const perChannel = String(process.env.TELEGRAM_POSTS_PER_CHANNEL || 'default');
  const maxItems = String(process.env.NEWS_MAX_ITEMS || 'default');
  return `${CACHE_KEY}:${hasCredentials ? 'auth' : 'noauth'}:${channels}:${perChannel}:${maxItems}`;
}

function getMaxItems() {
  const limit = Number(process.env.NEWS_MAX_ITEMS || DEFAULT_MAX_ITEMS);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_MAX_ITEMS;
  return Math.min(Math.floor(limit), 200);
}

function mergeItems(items) {
  const seen = new Set();
  return [...items]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .filter((item) => {
      if (!item?.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

module.exports = {
  getCsNews,
};
