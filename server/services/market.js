const { getTickerItems, getTopMovers, getCases, getPriceHistory, getMarketCatalog, getSteamRubRate } = require('./prices');

async function getMarketSnapshot() {
  const [tickerResult, moversResult, casesResult, rubRate] = await Promise.allSettled([
    getTickerItems(),
    getTopMovers(),
    getCases(),
    getSteamRubRate(),
  ]);

  return {
    ticker: tickerResult.status === 'fulfilled' ? tickerResult.value : [],
    movers: moversResult.status === 'fulfilled' ? moversResult.value : [],
    cases: casesResult.status === 'fulfilled' ? casesResult.value : [],
    steamRubRate: rubRate.status === 'fulfilled' && Number.isFinite(rubRate.value) ? rubRate.value : null,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getMarketSnapshot,
  getCases,
  getMarketCatalog,
  getPriceHistory,
};
