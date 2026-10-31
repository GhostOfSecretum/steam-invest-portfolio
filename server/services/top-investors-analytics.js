const { listTopInvestors } = require('./top-investors');
const { readInventoryActivityStore, isStructuredActivity } = require('./activity');
const { getThirdPartyPriceLists, selectMarketMark } = require('./prices');

const CACHE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FLOW_DAYS = 7;
const TIMELINE_DAYS = 30;
const CO_MOVE_WINDOW_MS = 48 * 60 * 60 * 1000;
const TRANSFER_WINDOW_MS = 14 * DAY_MS;
const HIDDEN_REVEAL_MS = 10 * DAY_MS;
const RADAR_MIN_VALUE_USD = 25;
const SIGNAL_MIN_PRICE_USD = 1;
const SIGNAL_MAX_HOLDER_SHARE = 0.4;

let memo = null;

function itemCategory(name) {
  if (name.startsWith('★')) return 'knives';
  if (name.startsWith('Sticker |')) return 'stickers';
  if (/(Case|Capsule|Package)$/.test(name)) return 'containers';
  if (/^(Patch \||Sealed Graffiti \||Music Kit \||StatTrak™ Music Kit \||Charm \|)/.test(name)) return 'other';
  return 'skins';
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function buildPricer(lists, eventPrices) {
  const memoized = new Map();
  return (name) => {
    if (memoized.has(name)) return memoized.get(name);
    const { mark } = selectMarketMark([
      { provider: 'skinport', price: lists.skinport[name]?.price, volume: lists.skinport[name]?.volume },
      { provider: 'csgomarket', price: lists.csgomarket[name]?.price, volume: lists.csgomarket[name]?.volume },
      { provider: 'lisskins', price: lists.lisskins[name]?.price, volume: lists.lisskins[name]?.volume },
    ], null);
    const price = Number.isFinite(mark) ? mark : (eventPrices.get(name)?.priceUsd ?? null);
    memoized.set(name, price);
    return price;
  };
}

function listedSupply(lists, name) {
  const counts = [lists.skinport[name]?.volume, lists.lisskins[name]?.volume].filter(Number.isFinite);
  return counts.length ? counts.reduce((sum, n) => sum + n, 0) : null;
}

function boostScore(view) {
  const holderScore = Math.min(view.holders / 4, 1);
  const accumScore = view.flow7d && view.flow7d.netUnits > 0 ? Math.min(view.flow7d.buyers / 3, 1) : 0;
  return Math.round(100 * (0.45 * (view.control ?? 0) + 0.25 * holderScore + 0.3 * accumScore));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const key of small) if (large.has(key)) shared += 1;
  return shared / (a.size + b.size - shared);
}

// kind 'buy' is only a confirmed market purchase: the hidden count dropped enough
// to explain the gain. Anything else that merely appeared (storage, a transfer,
// a mixed change, or a move recorded before origin tagging) is not a buy.
function classifyMoves(tracked) {
  const all = [];
  for (const row of tracked) {
    for (const event of row.events) {
      event.steamId = row.account.steamId;
      if (event.qtyDelta > 0) {
        event.kind = event.origin === 'storage' ? 'storage' : (event.origin === 'trade' ? 'buy' : 'unknown');
      } else {
        event.kind = 'sell';
      }
      all.push(event);
    }
  }
  all.sort((a, b) => a.t - b.t);
  const exitsByName = new Map();
  for (const event of all) {
    if (event.qtyDelta >= 0) continue;
    if (!exitsByName.has(event.marketHashName)) exitsByName.set(event.marketHashName, []);
    exitsByName.get(event.marketHashName).push(event);
  }
  for (const gain of all) {
    if (gain.kind === 'sell') continue;
    const exits = exitsByName.get(gain.marketHashName) || [];
    if (gain.kind === 'buy' || gain.kind === 'unknown') {
      const sender = exits.find((exit) => exit.kind === 'sell' && exit.steamId !== gain.steamId
        && exit.qtyDelta === -gain.qtyDelta && exit.t <= gain.t && exit.t >= gain.t - TRANSFER_WINDOW_MS);
      if (!sender) continue;
      sender.kind = 'transfer';
      gain.kind = 'transfer';
      sender.peer = gain.steamId;
      gain.peer = sender.steamId;
    } else {
      const deposit = exits.find((exit) => exit.kind === 'sell' && exit.steamId === gain.steamId
        && exit.qtyDelta === -gain.qtyDelta && exit.t <= gain.t);
      if (deposit) deposit.kind = 'storage';
    }
  }
  return all;
}

async function computeAnalytics() {
  const [listed, store, lists] = await Promise.all([
    listTopInvestors(),
    readInventoryActivityStore(),
    getThirdPartyPriceLists(),
  ]);
  const now = Date.now();
  const flowSince = now - FLOW_DAYS * DAY_MS;
  const timelineSince = now - TIMELINE_DAYS * DAY_MS;

  const icons = {};
  const eventPrices = new Map();
  const tracked = [];
  for (const account of listed.accounts) {
    const entry = store[account.steamId];
    if (!entry?.snapshot || typeof entry.snapshot !== 'object') continue;
    Object.assign(icons, entry.icons || {});
    const events = (entry.events || [])
      .filter((event) => isStructuredActivity(event) && event.marketHashName && Number.isFinite(event.qtyDelta) && event.qtyDelta !== 0)
      .map((event) => ({ ...event, t: new Date(event.at).getTime() }))
      .filter((event) => Number.isFinite(event.t));
    for (const event of events) {
      if (!Number.isFinite(event.priceUsd)) continue;
      const prev = eventPrices.get(event.marketHashName);
      if (!prev || prev.t < event.t) eventPrices.set(event.marketHashName, { priceUsd: event.priceUsd, t: event.t });
    }
    tracked.push({ account, snapshot: entry.snapshot, events, hidden: entry.hidden, hiddenLog: entry.hiddenLog || [] });
  }
  const allMoves = classifyMoves(tracked);

  const priceOf = buildPricer(lists, eventPrices);
  const items = new Map();
  const itemOf = (name) => {
    if (!items.has(name)) items.set(name, { name, units: 0, valueUsd: 0, holders: [] });
    return items.get(name);
  };

  let totalUnits = 0;
  let pricedUnits = 0;
  for (const row of tracked) {
    row.valueUsd = 0;
    row.units = 0;
    row.positions = [];
    for (const [name, rawQty] of Object.entries(row.snapshot)) {
      const qty = Number(rawQty) || 0;
      if (qty <= 0) continue;
      const price = priceOf(name);
      const value = Number.isFinite(price) ? price * qty : 0;
      const item = itemOf(name);
      item.units += qty;
      item.valueUsd += value;
      item.holders.push({ steamId: row.account.steamId, qty, valueUsd: value });
      row.valueUsd += value;
      row.units += qty;
      row.positions.push({ name, qty, valueUsd: value });
      totalUnits += qty;
      if (Number.isFinite(price)) pricedUnits += qty;
    }
    row.positions.sort((a, b) => b.valueUsd - a.valueUsd);
  }

  const timeline = new Map();
  for (let t = timelineSince; t <= now; t += DAY_MS) timeline.set(dayKey(t), { day: dayKey(t), inUsd: 0, outUsd: 0, moves: 0, storageUsd: 0, transferUsd: 0 });

  const flows = new Map();
  const buysByItem = new Map();
  let flow7dUsd = 0;
  let moves7d = 0;
  const origins = {
    days: TIMELINE_DAYS,
    buy: { usd: 0, moves: 0 },
    sell: { usd: 0, moves: 0 },
    storage: { usd: 0, moves: 0 },
    transfer: { usd: 0, moves: 0 },
    unknown: { usd: 0, moves: 0 },
  };
  for (const row of tracked) {
    row.flow30Usd = 0;
    row.moves30 = 0;
    row.storage30 = 0;
    row.transfers30 = 0;
    row.lastMoveAt = null;
    for (const event of row.events) {
      if (!row.lastMoveAt || event.t > new Date(row.lastMoveAt).getTime()) row.lastMoveAt = event.at;
      if (event.t < timelineSince) continue;
      const price = Number.isFinite(event.priceUsd) ? event.priceUsd : priceOf(event.marketHashName);
      const usd = Number.isFinite(price) ? price * event.qtyDelta : 0;
      const bucket = timeline.get(dayKey(event.t));
      if (event.kind === 'storage' || event.kind === 'transfer') {
        if (event.kind === 'storage') row.storage30 += 1;
        else row.transfers30 += 1;
        if (event.qtyDelta > 0) {
          origins[event.kind].usd += usd;
          origins[event.kind].moves += 1;
          if (bucket) bucket[`${event.kind}Usd`] += usd;
        }
        continue;
      }
      if (event.kind === 'unknown') {
        origins.unknown.usd += usd;
        origins.unknown.moves += 1;
        continue;
      }
      if (event.qtyDelta > 0) {
        origins.buy.usd += usd;
        origins.buy.moves += 1;
      } else {
        origins.sell.usd += -usd;
        origins.sell.moves += 1;
      }
      if (bucket) {
        if (usd >= 0) bucket.inUsd += usd;
        else bucket.outUsd += -usd;
        bucket.moves += 1;
      }
      row.flow30Usd += usd;
      row.moves30 += 1;

      if (event.qtyDelta > 0) {
        if (!buysByItem.has(event.marketHashName)) buysByItem.set(event.marketHashName, []);
        buysByItem.get(event.marketHashName).push({ steamId: row.account.steamId, t: event.t });
      }

      if (event.t < flowSince) continue;
      flow7dUsd += usd;
      moves7d += 1;
      if (!flows.has(event.marketHashName)) flows.set(event.marketHashName, { netUnits: 0, netUsd: 0, buyers: new Set(), sellers: new Set() });
      const flow = flows.get(event.marketHashName);
      flow.netUnits += event.qtyDelta;
      flow.netUsd += usd;
      (event.qtyDelta > 0 ? flow.buyers : flow.sellers).add(row.account.steamId);
    }

    row.hiddenAdded7d = 0;
    row.lastHiddenAt = null;
    for (const log of row.hiddenLog) {
      const t = new Date(log.at).getTime();
      if (!(t >= flowSince) || !(log.after > log.before)) continue;
      row.hiddenAdded7d += log.after - log.before;
      if (!row.lastHiddenAt || t > new Date(row.lastHiddenAt).getTime()) row.lastHiddenAt = log.at;
    }
  }

  const accountById = new Map(tracked.map((row) => [row.account.steamId, row.account]));
  const holderView = (holder) => {
    const account = accountById.get(holder.steamId);
    return { steamId: holder.steamId, personaname: account?.personaname || null, avatar: account?.avatar || null, qty: holder.qty };
  };

  const itemView = (name) => {
    const item = items.get(name);
    const flow = flows.get(name);
    const price = priceOf(name);
    const listedUnits = listedSupply(lists, name);
    const units = item?.units || 0;
    return {
      marketHashName: name,
      iconUrl: icons[name] || null,
      category: itemCategory(name),
      priceUsd: Number.isFinite(price) ? price : null,
      units,
      valueUsd: round2(item?.valueUsd || 0),
      holders: item?.holders.length || 0,
      listed: listedUnits,
      control: listedUnits != null && units > 0 ? round2(units / (units + listedUnits)) : null,
      flow7d: flow ? {
        netUnits: flow.netUnits,
        netUsd: round2(flow.netUsd),
        buyers: flow.buyers.size,
        sellers: flow.sellers.size,
      } : null,
    };
  };

  const byValue = [...items.values()].sort((a, b) => b.valueUsd - a.valueUsd);
  const totalValue = byValue.reduce((sum, item) => sum + item.valueUsd, 0);

  const categories = {};
  for (const item of byValue) {
    const key = itemCategory(item.name);
    if (!categories[key]) categories[key] = { key, valueUsd: 0, units: 0, items: 0 };
    categories[key].valueUsd += item.valueUsd;
    categories[key].units += item.units;
    categories[key].items += 1;
  }

  const radar = byValue
    .filter((item) => item.valueUsd >= RADAR_MIN_VALUE_USD)
    .map((item) => {
      const view = itemView(item.name);
      return {
        ...view,
        score: boostScore(view),
        topHolders: item.holders.slice().sort((a, b) => b.qty - a.qty).slice(0, 5).map(holderView),
      };
    })
    .sort((a, b) => b.score - a.score || b.valueUsd - a.valueUsd)
    .slice(0, 24);

  const flowList = [...flows.entries()].map(([name]) => itemView(name));
  const accumulating = flowList.filter((row) => row.flow7d.netUsd > 0).sort((a, b) => b.flow7d.netUsd - a.flow7d.netUsd).slice(0, 10);
  const distributing = flowList.filter((row) => row.flow7d.netUsd < 0).sort((a, b) => a.flow7d.netUsd - b.flow7d.netUsd).slice(0, 10);

  // Links between accounts: overlap of non-trivial holdings plus buying the same item within 48h.
  const signalNames = new Set(byValue
    .filter((item) => (priceOf(item.name) || 0) >= SIGNAL_MIN_PRICE_USD
      && item.holders.length <= Math.max(2, tracked.length * SIGNAL_MAX_HOLDER_SHARE))
    .map((item) => item.name));
  const signalSets = tracked.map((row) => ({
    steamId: row.account.steamId,
    set: new Set(row.positions.filter((pos) => signalNames.has(pos.name)).map((pos) => pos.name)),
  })).filter((row) => row.set.size >= 3);

  const pairs = new Map();
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairOf = (a, b) => {
    const key = pairKey(a, b);
    if (!pairs.has(key)) pairs.set(key, { a: a < b ? a : b, b: a < b ? b : a, overlap: 0, coMoves: 0, coItems: new Set(), transfers: 0, transferUsd: 0, transferItems: new Set() });
    return pairs.get(key);
  };
  for (let i = 0; i < signalSets.length; i += 1) {
    for (let j = i + 1; j < signalSets.length; j += 1) {
      const overlap = jaccard(signalSets[i].set, signalSets[j].set);
      if (overlap >= 0.2) pairOf(signalSets[i].steamId, signalSets[j].steamId).overlap = overlap;
    }
  }
  for (const [name, buys] of buysByItem) {
    for (let i = 0; i < buys.length; i += 1) {
      for (let j = i + 1; j < buys.length; j += 1) {
        if (buys[i].steamId === buys[j].steamId || Math.abs(buys[i].t - buys[j].t) > CO_MOVE_WINDOW_MS) continue;
        const pair = pairOf(buys[i].steamId, buys[j].steamId);
        if (!pair.coItems.has(name)) {
          pair.coItems.add(name);
          pair.coMoves += 1;
        }
      }
    }
  }
  const recentTransfers = [];
  for (const event of allMoves) {
    if (event.kind !== 'transfer' || !(event.qtyDelta > 0)) continue;
    const pair = pairOf(event.peer, event.steamId);
    const price = Number.isFinite(event.priceUsd) ? event.priceUsd : priceOf(event.marketHashName);
    const usd = Number.isFinite(price) ? price * event.qtyDelta : 0;
    pair.transfers += 1;
    pair.transferUsd += usd;
    pair.transferItems.add(event.marketHashName);
    recentTransfers.push({
      at: event.at,
      from: event.peer,
      to: event.steamId,
      marketHashName: event.marketHashName,
      iconUrl: icons[event.marketHashName] || null,
      qty: event.qtyDelta,
      usd: round2(usd),
    });
  }

  const positionsById = new Map(tracked.map((row) => [row.account.steamId, row.positions]));
  const links = [...pairs.values()]
    .map((pair) => ({ ...pair, strength: round2(pair.overlap + Math.min(pair.coMoves, 5) * 0.15 + Math.min(pair.transfers, 3) * 0.5) }))
    .filter((pair) => pair.overlap >= 0.3 || pair.coMoves >= 2 || pair.transfers >= 1)
    .sort((x, y) => y.strength - x.strength)
    .slice(0, 30)
    .map((pair) => {
      const other = new Set((positionsById.get(pair.b) || []).map((pos) => pos.name));
      const shared = (positionsById.get(pair.a) || []).filter((pos) => signalNames.has(pos.name) && other.has(pos.name)).slice(0, 3).map((pos) => pos.name);
      return {
        a: pair.a,
        b: pair.b,
        overlap: round2(pair.overlap),
        coMoves: pair.coMoves,
        strength: pair.strength,
        transfers: pair.transfers,
        transferUsd: round2(pair.transferUsd),
        sharedItems: [...new Set([...pair.transferItems, ...pair.coItems, ...shared])].slice(0, 4),
      };
    });

  const parent = new Map();
  const find = (id) => {
    while (parent.get(id) !== id) id = parent.get(id);
    return id;
  };
  for (const link of links) {
    if (!parent.has(link.a)) parent.set(link.a, link.a);
    if (!parent.has(link.b)) parent.set(link.b, link.b);
    parent.set(find(link.a), find(link.b));
  }
  const groupIndex = new Map();
  const nodes = [...parent.keys()].map((steamId) => {
    const root = find(steamId);
    if (!groupIndex.has(root)) groupIndex.set(root, groupIndex.size);
    const row = tracked.find((entry) => entry.account.steamId === steamId);
    return {
      steamId,
      personaname: row?.account.personaname || null,
      avatar: row?.account.avatar || null,
      valueUsd: round2(row?.valueUsd || 0),
      group: groupIndex.get(root),
    };
  });

  const leaderboard = tracked
    .slice()
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 25)
    .map((row) => {
      const top3 = row.positions.slice(0, 3);
      return {
        steamId: row.account.steamId,
        personaname: row.account.personaname,
        avatar: row.account.avatar,
        profileUrl: row.account.profileUrl,
        valueUsd: round2(row.valueUsd),
        units: row.units,
        itemCount: row.positions.length,
        top3Share: row.valueUsd > 0 ? round2(top3.reduce((sum, pos) => sum + pos.valueUsd, 0) / row.valueUsd) : null,
        topItems: top3.map((pos) => ({ marketHashName: pos.name, iconUrl: icons[pos.name] || null, valueUsd: round2(pos.valueUsd) })),
        flow30Usd: round2(row.flow30Usd),
        moves30: row.moves30,
        storage30: row.storage30,
        transfers30: row.transfers30,
        hidden: Number.isFinite(row.hidden) ? row.hidden : null,
        hiddenAdded7d: row.hiddenAdded7d,
        lastMoveAt: row.lastMoveAt,
      };
    });

  const hiddenBuys = tracked
    .filter((row) => row.hiddenAdded7d > 0)
    .sort((a, b) => b.hiddenAdded7d - a.hiddenAdded7d)
    .slice(0, 10)
    .map((row) => ({
      steamId: row.account.steamId,
      personaname: row.account.personaname,
      avatar: row.account.avatar,
      profileUrl: row.account.profileUrl,
      added: row.hiddenAdded7d,
      hidden: Number.isFinite(row.hidden) ? row.hidden : null,
      lastAt: row.lastHiddenAt,
      revealAt: new Date(new Date(row.lastHiddenAt).getTime() + HIDDEN_REVEAL_MS).toISOString(),
    }));

  const view = {
    generatedAt: new Date(now).toISOString(),
    flowDays: FLOW_DAYS,
    totals: {
      accounts: listed.accounts.length,
      withSnapshot: tracked.length,
      valueUsd: round2(totalValue),
      units: totalUnits,
      uniqueItems: items.size,
      pricedShare: totalUnits ? round2(pricedUnits / totalUnits) : null,
      flow7dUsd: round2(flow7dUsd),
      moves7d,
      hiddenAdded7d: tracked.reduce((sum, row) => sum + row.hiddenAdded7d, 0),
    },
    origins: {
      days: origins.days,
      buy: { ...origins.buy, usd: round2(origins.buy.usd) },
      sell: { ...origins.sell, usd: round2(origins.sell.usd) },
      storage: { ...origins.storage, usd: round2(origins.storage.usd) },
      transfer: { ...origins.transfer, usd: round2(origins.transfer.usd) },
      unknown: { ...origins.unknown, usd: round2(origins.unknown.usd) },
    },
    hiddenBuys,
    transfers: recentTransfers.reverse().slice(0, 12),
    categories: Object.values(categories)
      .map((row) => ({ ...row, valueUsd: round2(row.valueUsd) }))
      .sort((a, b) => b.valueUsd - a.valueUsd),
    holdings: byValue.slice(0, 48).map((item) => itemView(item.name)),
    radar,
    accumulating,
    distributing,
    timeline: [...timeline.values()].map((row) => ({
      ...row,
      inUsd: round2(row.inUsd),
      outUsd: round2(row.outUsd),
      storageUsd: round2(row.storageUsd),
      transferUsd: round2(row.transferUsd),
    })),
    network: { nodes, links },
    leaderboard,
  };

  return {
    view,
    state: { now, tracked, items, itemView, holderView, priceOf, icons, accountById, byValue, totalValue },
  };
}

function invalidateTopInvestorsAnalytics() {
  memo = null;
}

function loadAnalytics() {
  if (memo && Date.now() - memo.at < CACHE_MS) return memo.promise;
  const promise = computeAnalytics();
  memo = { at: Date.now(), promise };
  promise.catch(() => { memo = null; });
  return promise;
}

async function getTopInvestorsAnalytics() {
  return (await loadAnalytics()).view;
}

async function getTopInvestorsState() {
  return (await loadAnalytics()).state;
}

module.exports = {
  getTopInvestorsAnalytics,
  getTopInvestorsState,
  invalidateTopInvestorsAnalytics,
  boostScore,
  RADAR_MIN_VALUE_USD,
};
