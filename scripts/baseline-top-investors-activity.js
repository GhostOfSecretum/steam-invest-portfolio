require('dotenv').config();

const { listTopInvestors } = require('../server/services/top-investors');
const { getSteamInventory } = require('../server/services/steam');
const {
  syncInventoryDiffActivity,
  getInventoryActivityForSteamId,
} = require('../server/services/activity');

const DELAY_MS = Number(process.env.TOP_INVESTORS_BASELINE_DELAY_MS || 3000);
const LIMIT = Number(process.env.TOP_INVESTORS_BASELINE_LIMIT || 0);
const SKIP_EXISTING = String(process.env.TOP_INVESTORS_BASELINE_SKIP_EXISTING || '1') !== '0';
const MAX_RETRIES = Number(process.env.TOP_INVESTORS_BASELINE_RETRIES || 5);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(error) {
  const message = String(error?.message || error || '');
  return /HTTP 429|rate limit|Too Many Requests/i.test(message);
}

async function syncOne(steamId) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const inventory = await getSteamInventory(steamId, { force: true });
      const items = Array.isArray(inventory.items) ? inventory.items : [];
      await syncInventoryDiffActivity(steamId, items, {
        source: 'public-diff',
        syncedAt: inventory.syncedAt || new Date().toISOString(),
      });
      return items.length;
    } catch (error) {
      if (!isRateLimited(error) || attempt >= MAX_RETRIES) throw error;
      const waitMs = Math.min(60000, 5000 * (2 ** (attempt - 1)));
      console.warn(`  rate-limited, retry ${attempt}/${MAX_RETRIES} in ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
}

(async () => {
  const listed = await listTopInvestors();
  let accounts = listed.accounts || [];
  if (Number.isFinite(LIMIT) && LIMIT > 0) {
    accounts = accounts.slice(0, LIMIT);
  }

  console.log(`Inventory-only baseline for ${accounts.length} top investors (delay ${DELAY_MS}ms, skipExisting=${SKIP_EXISTING})`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < accounts.length; i += 1) {
    const account = accounts[i];
    const label = `${i + 1}/${accounts.length} ${account.personaname || account.steamId}`;

    try {
      if (SKIP_EXISTING) {
        const existing = await getInventoryActivityForSteamId(account.steamId);
        if (existing.hasBaseline) {
          skipped += 1;
          console.log(`SKIP ${label} (baseline exists)`);
          continue;
        }
      }

      const itemCount = await syncOne(account.steamId);
      ok += 1;
      console.log(`OK  ${label} items=${itemCount}`);
    } catch (error) {
      failed += 1;
      const message = error.message || String(error);
      failures.push({ steamId: account.steamId, personaname: account.personaname, error: message });
      console.warn(`ERR ${label}: ${message}`);
      if (isRateLimited(error)) {
        console.warn('Cooling down 45s after rate limit...');
        await sleep(45000);
      }
    }

    if (i < accounts.length - 1) await sleep(DELAY_MS);
  }

  console.log('---');
  console.log(`Done. ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failures.length) {
    console.log('Failures (first 30):');
    for (const entry of failures.slice(0, 30)) {
      console.log(`  - ${entry.personaname || entry.steamId}: ${entry.error}`);
    }
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
