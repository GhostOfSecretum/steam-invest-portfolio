// Port of desktop/inventory-merge.js. The Game Coordinator sees every item the
// account owns, so backpack items the WebAPI did not return (or all of them, if
// the WebAPI call failed) are filled in from GC data instead of going missing.
const SCHEMA_ICON_RE = /\/economy\/image\/econ\//;

export function mergeInventoryItems(webItems, gcBackpackItems, storageItems) {
  const merged = new Map();
  const iconByName = new Map();
  for (const item of webItems) {
    merged.set(item.assetid, item);
    if (item.marketHashName && item.iconUrl && !SCHEMA_ICON_RE.test(item.iconUrl)) {
      iconByName.set(item.marketHashName, item.iconUrl);
    }
  }
  let gcOnlyCount = 0;
  for (const item of [...gcBackpackItems, ...storageItems]) {
    if (!item.inStorage && merged.has(item.assetid)) continue;
    if (!item.inStorage) gcOnlyCount++;
    if (!item.iconUrl && iconByName.has(item.marketHashName)) item.iconUrl = iconByName.get(item.marketHashName);
    merged.set(item.assetid, item);
  }
  return { items: [...merged.values()], gcOnlyCount };
}
