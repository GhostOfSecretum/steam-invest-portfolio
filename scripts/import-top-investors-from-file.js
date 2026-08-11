require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { resolveSteamProfileInput } = require('../server/services/steam');

const DEFAULT_INPUT = path.join(__dirname, '..', 'steam-profiles-topic-5189.txt');
const OUTPUT = path.join(__dirname, '..', '.data', 'top-investors.json');
const SUMMARY_BATCH = 100;
const VANITY_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let inputPath = DEFAULT_INPUT;
  let outPath = OUTPUT;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--in') {
      inputPath = path.resolve(args[i + 1]);
      i += 1;
    } else if (args[i] === '--out') {
      outPath = path.resolve(args[i + 1]);
      i += 1;
    }
  }
  return { inputPath, outPath };
}

function parseProfilesFile(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s*\|\s*(https?:\/\/steamcommunity\.com\/(?:id|profiles)\/[^\s]+)\s*$/i);
    if (!match) continue;
    rows.push({
      count: Number(match[1]),
      profileUrl: match[2].replace(/\/+$/, ''),
    });
  }
  return rows;
}

async function fetchPlayerSummaries(steamIds) {
  const key = String(process.env.STEAM_API_KEY || '').trim();
  if (!key || !steamIds.length) return new Map();

  const map = new Map();
  for (let i = 0; i < steamIds.length; i += SUMMARY_BATCH) {
    const chunk = steamIds.slice(i, i + SUMMARY_BATCH);
    const params = new URLSearchParams({
      key,
      steamids: chunk.join(','),
    });
    const response = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?${params}`);
    if (!response.ok) {
      throw new Error(`GetPlayerSummaries failed: HTTP ${response.status}`);
    }
    const json = await response.json();
    for (const player of json.response?.players || []) {
      if (!player?.steamid) continue;
      map.set(String(player.steamid), player);
    }
    if (i + SUMMARY_BATCH < steamIds.length) await sleep(200);
  }
  return map;
}

(async () => {
  const { inputPath, outPath } = parseArgs(process.argv);
  const raw = await fs.readFile(inputPath, 'utf8');
  const rows = parseProfilesFile(raw);
  if (!rows.length) {
    throw new Error(`No Steam profiles found in ${inputPath}`);
  }

  console.log(`Profiles in file: ${rows.length}`);
  const resolved = [];
  const failures = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      const steamId = await resolveSteamProfileInput(row.profileUrl);
      resolved.push({
        steamId,
        sourceUrl: row.profileUrl,
        count: row.count,
      });
      if ((i + 1) % 25 === 0 || i === rows.length - 1) {
        console.log(`Resolved ${i + 1}/${rows.length}`);
      }
    } catch (error) {
      failures.push({
        profileUrl: row.profileUrl,
        count: row.count,
        error: error.message || String(error),
      });
      console.warn(`Skip ${row.profileUrl}: ${error.message || error}`);
    }
    await sleep(VANITY_DELAY_MS);
  }

  // Merge duplicates if the same steamId appears via id + profiles URLs.
  const bySteamId = new Map();
  for (const entry of resolved) {
    const prev = bySteamId.get(entry.steamId);
    if (!prev) {
      bySteamId.set(entry.steamId, { ...entry });
    } else {
      prev.count += entry.count;
    }
  }

  const uniqueIds = [...bySteamId.keys()];
  console.log(`Unique SteamIDs: ${uniqueIds.length}; fetching summaries...`);
  const summaries = await fetchPlayerSummaries(uniqueIds);
  const now = new Date().toISOString();

  const accounts = [...bySteamId.values()]
    .sort((a, b) => b.count - a.count || a.steamId.localeCompare(b.steamId))
    .map((entry) => {
      const player = summaries.get(entry.steamId);
      return {
        steamId: entry.steamId,
        profileUrl: player?.profileurl || `https://steamcommunity.com/profiles/${entry.steamId}`,
        personaname: player?.personaname || `STEAM/${entry.steamId.slice(-6)}`,
        avatar: player?.avatarmedium || player?.avatar || null,
        note: `Mentions in Telegram topic: ${entry.count}`,
        tags: ['telegram-topic-5189'],
        addedAt: now,
        updatedAt: now,
        mentionCount: entry.count,
        sourceUrl: entry.sourceUrl,
      };
    });

  const store = {
    updatedAt: now,
    note: 'Imported from Telegram topic https://t.me/c/1968710853/5189',
    accounts,
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(store, null, 2), 'utf8');

  console.log(`Saved ${accounts.length} accounts -> ${outPath}`);
  if (failures.length) {
    console.log(`Failed: ${failures.length}`);
    for (const failure of failures.slice(0, 20)) {
      console.log(`  - ${failure.profileUrl}: ${failure.error}`);
    }
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
