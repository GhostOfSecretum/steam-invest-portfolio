function mergeInventoryItems(webItems, storageItems) {
  const merged = new Map();
  for (const item of webItems || []) {
    merged.set(String(item.assetid), item);
  }
  for (const item of storageItems || []) {
    merged.set(String(item.assetid), item);
  }
  return [...merged.values()];
}

module.exports = { mergeInventoryItems };
