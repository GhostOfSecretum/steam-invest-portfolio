const { getTickerItems, getMarketOverview, getPeriodMovers, getCases, getPrices, getPriceHistory, getMarketCatalog, getSteamRubRate, getSteamCnyRate, getItemOffers, getItemVariants, getMultiWearHistory } = require('./prices');

async function getMarketSnapshot() {
  const [tickerResult, overviewResult, casesResult, rubRate, cnyRate] = await Promise.allSettled([
    getTickerItems(),
    getMarketOverview(),
    getCases(),
    getSteamRubRate(),
    getSteamCnyRate(),
  ]);

  const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null;

  return {
    ticker: tickerResult.status === 'fulfilled' ? tickerResult.value : [],
    movers: Array.isArray(overview?.movers) ? overview.movers : [],
    overview,
    cases: casesResult.status === 'fulfilled' ? casesResult.value : [],
    steamRubRate: rubRate.status === 'fulfilled' && Number.isFinite(rubRate.value) ? rubRate.value : null,
    steamCnyRate: cnyRate.status === 'fulfilled' && Number.isFinite(cnyRate.value) ? cnyRate.value : null,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getMarketSnapshot,
  getPeriodMovers,
  getCases,
  getMarketCatalog,
  getPrices,
  getPriceHistory,
  getItemOffers,
  getItemVariants,
  getMultiWearHistory,
};
