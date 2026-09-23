function mergeInventoryItems(webItems, storageItems) {
  const merged = new Map();
  const iconByName = new Map();
  for (const item of webItems || []) {
    merged.set(String(item.assetid), item);
    if (item.marketHashName && item.iconUrl && !/\/economy\/image\/econ\//.test(item.iconUrl)) {
      iconByName.set(item.marketHashName, item.iconUrl);
    }
  }
  for (const item of storageItems || []) {
    if ((!item.iconUrl || /\/economy\/image\/econ\//.test(item.iconUrl)) && iconByName.has(item.marketHashName)) {
      item.iconUrl = iconByName.get(item.marketHashName);
    }
    merged.set(String(item.assetid), item);
  }
  return [...merged.values()];
}

module.exports = { mergeInventoryItems };
