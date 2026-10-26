const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getTopInvestorsState, getTopInvestorsAnalytics, boostScore, RADAR_MIN_VALUE_USD } = require('./top-investors-analytics');
const { getPriceHistory, getMarketOverview } = require('./prices');
const { SITE_URL } = require('./items');
const { listAlertChatIds, sendTelegramMessage, unlinkChat, ensureTelegramWebhook } = require('./telegram-alerts');
const { marketHashNameToSlug } = require('../../item-slugs');

const DATA_DIR = path.join(__dirname, '..', '..', '.data');
const STORE_FILE = path.join(DATA_DIR, 'smart-money.json');
const DAY_MS = 24 * 60 * 60 * 1000;
const LEDGER_MAX = 20000;
const SIGNALS_MAX = 500;
const HISTORY_DAYS = 400;
const HISTORY_ITEMS = 300;
const SIGNAL_WINDOW_MS = 48 * 60 * 60 * 1000;
const CONTROL_SIGNAL_THRESHOLD = 0.5;
const EXIT_POSITION_SHARE = 0.3;
const MIN_SIGNAL_USD = 20;
const SCAN_BOOT_MS = 2 * 60 * 1000;
const SCAN_EVERY_MS = 10 * 60 * 1000;
const RESEARCH_EVERY_MS = 6 * 60 * 60 * 1000;
const BACKTEST_TRADES = 60;
const BACKTEST_NAMES = 40;
const INDEX_COMPONENTS = 25;
const INDEX_DAYS = 90;
const ALERT_MAX_LINES = 8;

let jobsStarted = false;
let storeQueue = Promise.resolve();

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
  const list = values.filter(Number.isFinite);
  return list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : null;
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(STORE_FILE, 'utf8'));
    return {
      initializedAt: parsed.initializedAt || null,
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
      lastSignalAt: parsed.lastSignalAt && typeof parsed.lastSignalAt === 'object' ? parsed.lastSignalAt : {},
      history: parsed.history && typeof parsed.history === 'object' ? parsed.history : {},
      lastDigestAt: parsed.lastDigestAt || null,
      backtest: parsed.backtest || null,
      index: parsed.index || null,
    };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[smart-money] unreadable store, starting fresh:', error.message);
    return { initializedAt: null, ledger: [], signals: [], lastSignalAt: {}, history: {}, lastDigestAt: null, backtest: null, index: null };
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store), 'utf8');
  await fs.rename(tmp, STORE_FILE);
}

function updateStore(mutate) {
  const run = storeQueue.then(async () => {
    const store = await readStore();
    const result = await mutate(store);
    await writeStore(store);
    return result;
  });
  storeQueue = run.catch(() => {});
  return run;
}

function itemUrl(name) {
  const slug = marketHashNameToSlug(name);
  return slug ? `${SITE_URL}/item/${slug}?name=${encodeURIComponent(name)}` : `${SITE_URL}/investors`;
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function compactUsd(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const text = abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M` : abs >= 1e3 ? `$${(abs / 1e3).toFixed(1)}K` : `$${abs.toFixed(0)}`;
  return value < 0 ? `−${text}` : text;
}

function pct(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

// ─── Ledger and daily history ───────────────────────────────────────────────

function appendLedger(store, state) {
  const known = new Set(store.ledger.map((entry) => entry.id));
  let added = 0;
  for (const row of state.tracked) {
    for (const event of row.events) {
      if (!event.id || known.has(event.id)) continue;
      const price = Number.isFinite(event.priceUsd) ? event.priceUsd : state.priceOf(event.marketHashName);
      store.ledger.push({
        id: event.id,
        steamId: row.account.steamId,
        name: event.marketHashName,
        t: event.t,
        qtyDelta: event.qtyDelta,
        priceUsd: Number.isFinite(price) ? price : null,
      });
      known.add(event.id);
      added += 1;
    }
  }
  store.ledger.sort((a, b) => a.t - b.t);
  if (store.ledger.length > LEDGER_MAX) store.ledger = store.ledger.slice(store.ledger.length - LEDGER_MAX);
  return added;
}

function recordHistory(store, state) {
  store.history[dayKey(state.now)] = {
    valueUsd: round2(state.totalValue),
    accounts: state.tracked.length,
    items: Object.fromEntries(state.byValue.slice(0, HISTORY_ITEMS).map((item) => [item.name, item.units])),
  };
  const days = Object.keys(store.history).sort();
  for (const day of days.slice(0, Math.max(0, days.length - HISTORY_DAYS))) delete store.history[day];
}

// ─── Signals ────────────────────────────────────────────────────────────────

// One seller counts only when they held a large share of the tracked position
// and sold at least 30% of that holding. Selling a single copy does not.
function isLargeHolderDump(moves, trackedUnitsNow) {
  const byAccount = new Map();
  let totalSold = 0;
  for (const move of moves) {
    const sold = -(Number(move.qtyDelta) || 0);
    const before = Number(move.qtyBefore) || 0;
    if (!(sold > 0)) continue;
    totalSold += sold;
    const row = byAccount.get(move.steamId) || { sold: 0, before: 0 };
    row.sold += sold;
    if (before > row.before) row.before = before;
    byAccount.set(move.steamId, row);
  }
  const beforeGroup = Math.max(0, Number(trackedUnitsNow) || 0) + totalSold;
  if (!(beforeGroup > 0)) return false;
  for (const row of byAccount.values()) {
    const dumpedOwn = row.before > 0 && row.sold / row.before >= EXIT_POSITION_SHARE;
    const wasLarge = row.before / beforeGroup >= EXIT_POSITION_SHARE;
    if (dumpedOwn && wasLarge) return true;
  }
  return false;
}

function isListedSignal(signal) {
  if (signal?.type !== 'exit') return true;
  if ((signal.accounts || []).length >= 2) return true;
  return signal.largeDump === true;
}

function detectSignals(store, state) {
  const now = state.now;
  const since = now - SIGNAL_WINDOW_MS;
  const buys = new Map();
  const sells = new Map();
  for (const row of state.tracked) {
    for (const event of row.events) {
      if (event.t < since) continue;
      const bucket = event.qtyDelta > 0 ? buys : sells;
      if (!bucket.has(event.marketHashName)) bucket.set(event.marketHashName, []);
      bucket.get(event.marketHashName).push({ steamId: row.account.steamId, qtyDelta: event.qtyDelta, qtyBefore: event.qtyBefore });
    }
  }

  const fresh = [];
  const cooling = (type, name, cooldownMs) => (store.lastSignalAt[`${type}:${name}`] || 0) > now - cooldownMs;
  const accountsOf = (moves) => {
    const byAccount = new Map();
    for (const move of moves) byAccount.set(move.steamId, (byAccount.get(move.steamId) || 0) + move.qtyDelta);
    return [...byAccount.entries()].map(([steamId, qtyDelta]) => ({
      steamId,
      personaname: state.accountById.get(steamId)?.personaname || null,
      avatar: state.accountById.get(steamId)?.avatar || null,
      qtyDelta,
    }));
  };
  const emit = (type, name, extra = {}) => {
    const view = state.itemView(name);
    store.lastSignalAt[`${type}:${name}`] = now;
    fresh.push({
      id: `sig-${crypto.randomUUID()}`,
      type,
      at: new Date(now).toISOString(),
      marketHashName: name,
      iconUrl: view.iconUrl,
      priceUsd: view.priceUsd,
      control: view.control,
      holders: view.holders,
      units: view.units,
      valueUsd: view.valueUsd,
      score: boostScore(view),
      ...extra,
    });
  };

  for (const [name, moves] of buys) {
    const accounts = accountsOf(moves);
    const deltaUnits = accounts.reduce((sum, row) => sum + row.qtyDelta, 0);
    const deltaUsd = deltaUnits * (state.priceOf(name) || 0);
    if (accounts.length >= 2 && deltaUsd >= MIN_SIGNAL_USD && !cooling('accumulation', name, SIGNAL_WINDOW_MS)) {
      emit('accumulation', name, { accounts, deltaUnits, deltaUsd: round2(deltaUsd) });
    }
  }

  for (const [name, moves] of sells) {
    const accounts = accountsOf(moves);
    const deltaUnits = accounts.reduce((sum, row) => sum + row.qtyDelta, 0);
    const deltaUsd = deltaUnits * (state.priceOf(name) || 0);
    const item = state.items.get(name);
    const bigExit = isLargeHolderDump(moves, item?.units || 0);
    if ((accounts.length >= 2 || bigExit) && -deltaUsd >= MIN_SIGNAL_USD && !cooling('exit', name, SIGNAL_WINDOW_MS)) {
      emit('exit', name, { accounts, deltaUnits, deltaUsd: round2(deltaUsd), largeDump: bigExit });
    }
  }

  for (const item of state.byValue) {
    if (item.valueUsd < RADAR_MIN_VALUE_USD) break;
    const view = state.itemView(item.name);
    if ((view.control ?? 0) >= CONTROL_SIGNAL_THRESHOLD && !cooling('control', item.name, 7 * DAY_MS)) {
      emit('control', item.name, {
        accounts: item.holders.slice().sort((a, b) => b.qty - a.qty).slice(0, 5).map((holder) => ({ ...state.holderView(holder) })),
      });
    }
  }

  return fresh;
}

// ─── Telegram ───────────────────────────────────────────────────────────────

function alertChatId() {
  return String(process.env.SMART_MONEY_ALERT_CHAT_ID || '').trim();
}

async function sendTelegram(text) {
  const chatIds = await listAlertChatIds();
  if (!chatIds.length) return false;
  let sent = 0;
  for (const chatId of chatIds) {
    try {
      await sendTelegramMessage(chatId, text, { html: true });
      sent += 1;
    } catch (error) {
      console.warn('[smart-money] telegram alert failed:', error.message);
      if (/blocked|deactivated|chat not found/i.test(error.message || '')) {
        await unlinkChat(chatId).catch(() => {});
      }
    }
  }
  return sent > 0;
}

function signalLine(signal) {
  const name = `<a href="${itemUrl(signal.marketHashName)}">${escapeHtml(signal.marketHashName)}</a>`;
  const who = (signal.accounts || []).length;
  if (signal.type === 'accumulation') {
    return `🟢 Скупка: ${name} — ${who} акк. +${signal.deltaUnits} шт (~${compactUsd(signal.deltaUsd)}), контроль ${pct(signal.control)}`;
  }
  if (signal.type === 'exit') {
    const seller = signal.largeDump && who < 2 ? 'крупный держатель' : `${who} акк.`;
    return `🔴 Выход: ${name} — ${seller} ${signal.deltaUnits} шт (~${compactUsd(signal.deltaUsd)}), контроль ${pct(signal.control)}`;
  }
  return `🎯 Контроль: ${name} — ${pct(signal.control)} рыночного предложения у ${signal.holders} акк., скор ${signal.score}`;
}

function alertWorthy(signal) {
  return signal.type !== 'control' || signal.score >= 50;
}

async function sendSignalAlert(signals) {
  const lines = signals.filter(alertWorthy).slice(0, ALERT_MAX_LINES).map(signalLine);
  if (!lines.length) return false;
  return sendTelegram(`<b>Smart money · SkinsHead</b>\n\n${lines.join('\n')}\n\n<a href="${SITE_URL}/investors">Вся аналитика</a>`);
}

function digestDue(store, now) {
  const date = new Date(now);
  if (date.getUTCDay() !== 1 || date.getUTCHours() < 9) return false;
  const last = new Date(store.lastDigestAt).getTime();
  return !Number.isFinite(last) || now - last > 6 * DAY_MS;
}

async function sendWeeklyDigest(store, now) {
  const view = await getTopInvestorsAnalytics();
  const weekSignals = store.signals.filter((signal) => isListedSignal(signal) && new Date(signal.at).getTime() > now - 7 * DAY_MS);
  const count = (type) => weekSignals.filter((signal) => signal.type === type).length;
  const lines = [
    '<b>Smart money · итоги недели</b>',
    '',
    `Капитал под наблюдением: ${compactUsd(view.totals.valueUsd)} в ${view.totals.withSnapshot} аккаунтах`,
    `Чистый поток 7д: ${compactUsd(view.totals.flow7dUsd)} · ${view.totals.moves7d} движений`,
    `Сигналы: ${count('accumulation')} скупок, ${count('exit')} выходов, ${count('control')} новых зон контроля`,
    '',
    '<b>Буст-радар</b>',
    ...view.radar.slice(0, 5).map((row, index) => `${index + 1}. <a href="${itemUrl(row.marketHashName)}">${escapeHtml(row.marketHashName)}</a> — скор ${row.score}, контроль ${pct(row.control)}`),
  ];
  if (view.accumulating.length) {
    lines.push('', '<b>Скупают</b>', ...view.accumulating.slice(0, 3).map((row) => `• ${escapeHtml(row.marketHashName)} ${compactUsd(row.flow7d.netUsd)}`));
  }
  if (view.distributing.length) {
    lines.push('', '<b>Сливают</b>', ...view.distributing.slice(0, 3).map((row) => `• ${escapeHtml(row.marketHashName)} ${compactUsd(row.flow7d.netUsd)}`));
  }
  const bt = store.backtest?.summary?.all;
  if (bt && bt.n7) {
    lines.push('', `Бэктест «следуй за китами»: ${bt.n7} сделок, ${pct(bt.win7)} в плюсе через 7 дней, медиана ${pct(bt.med7)}`);
  }
  lines.push('', `<a href="${SITE_URL}/investors">Открыть аналитику</a>`);
  return sendTelegram(lines.join('\n'));
}

// ─── Scan job ───────────────────────────────────────────────────────────────

async function runSmartMoneyScan() {
  const state = await getTopInvestorsState();
  if (!state.tracked.length) return;
  let toAlert = [];
  let digest = false;
  await updateStore(async (store) => {
    const firstRun = !store.initializedAt;
    appendLedger(store, state);
    recordHistory(store, state);
    const fresh = detectSignals(store, state);
    store.signals = [...fresh, ...store.signals].slice(0, SIGNALS_MAX);
    if (!firstRun) toAlert = fresh;
    store.initializedAt = store.initializedAt || new Date(state.now).toISOString();
    if (alertChatId() && digestDue(store, state.now)) {
      store.lastDigestAt = new Date(state.now).toISOString();
      digest = true;
    }
    if (fresh.length) console.log(`[smart-money] ${fresh.length} new signals${firstRun ? ' (first run, silent)' : ''}`);
  });

  if (toAlert.length) await sendSignalAlert(toAlert).catch((error) => console.warn('[smart-money] alert failed:', error.message));
  if (digest) {
    const store = await readStore();
    await sendWeeklyDigest(store, state.now).catch((error) => console.warn('[smart-money] digest failed:', error.message));
  }
}

// ─── Backtest and index ─────────────────────────────────────────────────────

async function loadRealSeries(name) {
  const history = await getPriceHistory(name, 365, { skipAlign: true }).catch(() => null);
  if (!history || !Array.isArray(history.data) || !history.provider || history.provider === 'synthetic' || history.provider === 'none') return null;
  const realFrom = history.realFrom ? new Date(history.realFrom).getTime() : -Infinity;
  const points = history.data
    .map((point) => ({ t: new Date(point.date).getTime(), price: Number(point.price) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price) && point.price > 0 && point.t >= realFrom)
    .sort((a, b) => a.t - b.t);
  return points.length >= 2 ? points : null;
}

function priceAt(points, t) {
  if (!points || !points.length || t < points[0].t - DAY_MS) return null;
  let found = null;
  for (const point of points) {
    if (point.t > t) break;
    found = point;
  }
  return (found || points[0]).price;
}

function seriesEnd(points) {
  return points[points.length - 1].t;
}

async function loadSeriesMap(names) {
  const map = new Map();
  for (const name of names) {
    const points = await loadRealSeries(name);
    if (points) map.set(name, points);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return map;
}

function marketSeries(overview) {
  const points = (Array.isArray(overview?.history) ? overview.history : [])
    .map((point) => ({ t: Number(point.t), price: Number(point.v) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.t - b.t);
  return points.length >= 2 ? points : null;
}

function windowReturn(points, from, days) {
  if (!points) return null;
  const to = from + days * DAY_MS;
  if (to > seriesEnd(points)) return null;
  const start = priceAt(points, from);
  const end = priceAt(points, to);
  return start && end ? end / start - 1 : null;
}

function summarize(trades) {
  const pick = (key) => trades.map((trade) => trade[key]).filter(Number.isFinite);
  const block = (key, alphaKey) => {
    const values = pick(key);
    return {
      n: values.length,
      win: values.length ? values.filter((value) => value > 0).length / values.length : null,
      med: median(values),
      avg: average(values),
      alpha: average(pick(alphaKey)),
    };
  };
  const d7 = block('ret7', 'alpha7');
  const d30 = block('ret30', 'alpha30');
  return {
    trades: trades.length,
    n7: d7.n, win7: d7.win, med7: d7.med, avg7: d7.avg, alpha7: d7.alpha,
    n30: d30.n, win30: d30.win, med30: d30.med, avg30: d30.avg, alpha30: d30.alpha,
    medNow: median(pick('retNow')),
  };
}

async function computeBacktest(store, state, seriesMap, market) {
  const now = state.now;
  const groups = new Map();
  for (const entry of store.ledger) {
    if (entry.qtyDelta <= 0 || entry.t > now - DAY_MS || entry.t < now - 365 * DAY_MS) continue;
    const key = `${entry.name}|${dayKey(entry.t)}`;
    if (!groups.has(key)) groups.set(key, { name: entry.name, t: entry.t, accounts: new Set(), units: 0, usd: 0 });
    const group = groups.get(key);
    group.t = Math.min(group.t, entry.t);
    group.accounts.add(entry.steamId);
    group.units += entry.qtyDelta;
    group.usd += entry.qtyDelta * (entry.priceUsd || 0);
  }

  const candidates = [...groups.values()].filter((group) => group.usd >= MIN_SIGNAL_USD).sort((a, b) => b.usd - a.usd).slice(0, BACKTEST_TRADES);
  const trades = [];
  for (const group of candidates) {
    const points = seriesMap.get(group.name);
    if (!points) continue;
    const entry = priceAt(points, group.t);
    if (!entry) continue;
    const ret7 = windowReturn(points, group.t, 7);
    const ret30 = windowReturn(points, group.t, 30);
    const mkt7 = windowReturn(market, group.t, 7);
    const mkt30 = windowReturn(market, group.t, 30);
    trades.push({
      marketHashName: group.name,
      iconUrl: state.icons[group.name] || null,
      at: new Date(group.t).toISOString(),
      accounts: group.accounts.size,
      units: group.units,
      usd: round2(group.usd),
      entryUsd: round2(entry),
      lastUsd: round2(points[points.length - 1].price),
      ret7: ret7 == null ? null : round4(ret7),
      ret30: ret30 == null ? null : round4(ret30),
      retNow: round4(points[points.length - 1].price / entry - 1),
      alpha7: ret7 != null && mkt7 != null ? round4(ret7 - mkt7) : null,
      alpha30: ret30 != null && mkt30 != null ? round4(ret30 - mkt30) : null,
    });
  }

  return {
    computedAt: new Date(now).toISOString(),
    ledgerSince: store.ledger.length ? new Date(store.ledger[0].t).toISOString() : null,
    summary: {
      all: summarize(trades),
      joint: summarize(trades.filter((trade) => trade.accounts >= 2)),
    },
    trades: trades.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 40),
  };
}

function computeIndex(store, state, seriesMap, market) {
  const now = state.now;
  const start = now - INDEX_DAYS * DAY_MS;
  const components = state.byValue
    .slice(0, INDEX_COMPONENTS * 2)
    .filter((item) => {
      const points = seriesMap.get(item.name);
      return points && priceAt(points, start) && item.units > 0;
    })
    .slice(0, INDEX_COMPONENTS);
  const coveredValue = components.reduce((sum, item) => sum + item.valueUsd, 0);

  const series = [];
  let base = null;
  let marketBase = null;
  for (let t = start; t <= now; t += DAY_MS) {
    let value = 0;
    for (const item of components) value += item.units * (priceAt(seriesMap.get(item.name), t) || 0);
    const marketValue = market ? priceAt(market, t) : null;
    if (base == null && value > 0) base = value;
    if (marketBase == null && marketValue) marketBase = marketValue;
    series.push({
      t,
      whale: base ? round2((value / base) * 100) : null,
      market: marketBase && marketValue ? round2((marketValue / marketBase) * 100) : null,
    });
  }

  return {
    computedAt: new Date(now).toISOString(),
    days: INDEX_DAYS,
    components: components.map((item) => ({ marketHashName: item.name, iconUrl: state.icons[item.name] || null, weight: coveredValue ? round4(item.valueUsd / coveredValue) : null })),
    coverage: state.totalValue ? round4(coveredValue / state.totalValue) : null,
    series,
    capital: Object.entries(store.history)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, row]) => ({ day, valueUsd: row.valueUsd, accounts: row.accounts })),
  };
}

async function runSmartMoneyResearch() {
  const state = await getTopInvestorsState();
  if (!state.tracked.length) return;
  const store = await readStore();

  const tradeNames = new Map();
  for (const entry of store.ledger) {
    if (entry.qtyDelta > 0) tradeNames.set(entry.name, (tradeNames.get(entry.name) || 0) + entry.qtyDelta * (entry.priceUsd || 0));
  }
  const names = [...new Set([
    ...[...tradeNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, BACKTEST_NAMES).map(([name]) => name),
    ...state.byValue.slice(0, INDEX_COMPONENTS * 2).map((item) => item.name),
  ])];
  const seriesMap = await loadSeriesMap(names);
  const market = marketSeries(await getMarketOverview().catch(() => null));

  const backtest = await computeBacktest(store, state, seriesMap, market);
  const index = computeIndex(store, state, seriesMap, market);
  await updateStore((fresh) => {
    fresh.backtest = backtest;
    fresh.index = index;
  });
  console.log(`[smart-money] research done: series=${seriesMap.size}/${names.length} trades=${backtest.trades.length} index=${index.components.length}`);
}

// ─── Read APIs ──────────────────────────────────────────────────────────────

async function listSmartMoneySignals({ limit = 50, marketHashName = null } = {}) {
  const store = await readStore();
  const rows = (marketHashName ? store.signals.filter((signal) => signal.marketHashName === marketHashName) : store.signals)
    .filter(isListedSignal);
  return {
    alertsConfigured: Boolean(alertChatId()),
    signals: rows.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200)),
  };
}

async function getSmartMoneyBacktest() {
  const store = await readStore();
  return store.backtest || { computedAt: null, summary: null, trades: [] };
}

async function getSmartMoneyIndex() {
  const store = await readStore();
  return store.index || { computedAt: null, series: [], components: [], capital: [] };
}

async function getSmartMoneyItem(marketHashName) {
  const name = String(marketHashName || '').trim();
  const [state, store] = await Promise.all([getTopInvestorsState(), readStore()]);
  const item = state.items.get(name);
  if (!item) return { marketHashName: name, tracked: false, accounts: state.tracked.length };

  const view = state.itemView(name);
  const holders = item.holders
    .slice()
    .sort((a, b) => b.qty - a.qty)
    .map((holder) => ({ ...state.holderView(holder), valueUsd: round2(holder.valueUsd), share: item.units ? round4(holder.qty / item.units) : null }));
  const moves = store.ledger
    .filter((entry) => entry.name === name)
    .slice(-25)
    .reverse()
    .map((entry) => ({
      ...entry,
      at: new Date(entry.t).toISOString(),
      personaname: state.accountById.get(entry.steamId)?.personaname || null,
      avatar: state.accountById.get(entry.steamId)?.avatar || null,
    }));
  const unitsHistory = Object.entries(store.history)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, row]) => row.items && Number.isFinite(row.items[name]))
    .map(([day, row]) => ({ day, units: row.items[name] }));

  return {
    ...view,
    tracked: true,
    accounts: state.tracked.length,
    score: boostScore(view),
    holdersList: holders,
    moves,
    unitsHistory,
    signals: store.signals.filter((signal) => signal.marketHashName === name && isListedSignal(signal)).slice(0, 5),
  };
}

async function getSmartMoneyExposure(names) {
  const list = [...new Set((Array.isArray(names) ? names : []).map((name) => String(name || '').trim()).filter(Boolean))].slice(0, 1000);
  const [state, store] = await Promise.all([getTopInvestorsState(), readStore()]);
  const since = state.now - 7 * DAY_MS;
  const exits = new Map();
  for (const signal of store.signals) {
    if (signal.type === 'exit' && isListedSignal(signal) && new Date(signal.at).getTime() > since && !exits.has(signal.marketHashName)) exits.set(signal.marketHashName, signal.at);
  }

  const items = list
    .filter((name) => state.items.has(name))
    .map((name) => {
      const view = state.itemView(name);
      return { ...view, score: boostScore(view), exitAt: exits.get(name) || null };
    })
    .filter((row) => row.exitAt || (row.control ?? 0) >= 0.15 || row.score >= 30 || row.holders >= 2)
    .sort((a, b) => (b.exitAt ? 1 : 0) - (a.exitAt ? 1 : 0) || b.score - a.score);

  return { accounts: state.tracked.length, checked: list.length, items };
}

function startSmartMoneyJobs() {
  if (jobsStarted) return;
  if (String(process.env.SMART_MONEY_JOBS || '1') === '0') {
    console.log('[smart-money] jobs disabled');
    return;
  }
  jobsStarted = true;

  const loop = (fn, firstMs, everyMs, label) => {
    const tick = async () => {
      try {
        await fn();
      } catch (error) {
        console.warn(`[smart-money] ${label} failed:`, error.message || error);
      } finally {
        setTimeout(tick, everyMs);
      }
    };
    setTimeout(tick, firstMs);
  };

  loop(runSmartMoneyScan, SCAN_BOOT_MS, SCAN_EVERY_MS, 'scan');
  loop(runSmartMoneyResearch, SCAN_BOOT_MS + 3 * 60 * 1000, RESEARCH_EVERY_MS, 'research');
  ensureTelegramWebhook().catch((error) => console.warn('[telegram] webhook setup failed:', error.message));
  console.log(`[smart-money] jobs started${alertChatId() ? ' (telegram alerts on)' : ''}`);
}

module.exports = {
  startSmartMoneyJobs,
  runSmartMoneyScan,
  runSmartMoneyResearch,
  listSmartMoneySignals,
  getSmartMoneyBacktest,
  getSmartMoneyIndex,
  getSmartMoneyItem,
  getSmartMoneyExposure,
};
