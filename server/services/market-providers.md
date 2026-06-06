## Market Providers

Current provider strategy in `server/services/prices.js`:

- Free providers enabled now:
  - `steam-market`
  - `take.skin`
  - `skinport`
- Optional paid providers, enabled only when API keys are present:
  - `pricempire`
  - `csfloat`

### Current order

Price lookup for a single item:

1. `csfloat` if `CSFLOAT_API_KEY` exists
2. `take.skin`
3. `steam-market`
4. `skinport`
5. stale cache

History lookup:

1. `pricempire` if `PRICEMPIRE_API_KEY` exists
2. `skinport`
3. `take.skin`
4. synthetic fallback

### Item-detail marketplace offers (`getItemOffers`)

The item card shows a price-per-marketplace list with deep buy-links:

- Live prices (no key needed): `steam-market`, `skinport` (full `/v1/items` dump), `csgomarket` (market.csgo.com `/api/v2/prices/USD.json` dump), `lisskins` (short `market_export_json/csgo.json` dump, ~3.5 MB).
- Live prices (key needed): `csfloat` when `CSFLOAT_API_KEY` is set; `lisskins` per-item search via `/v1/market/search` when `LISSKINS_API_KEY` is set (preferred over the short dump).
- Link-only (no practical public price API): `csmoney`, `buff163`.
  - CS.Money sits behind a Cloudflare bot challenge ("Just a moment…"), so its market API can't be read server-side without a browser/cookie bypass; kept as a buy-link.

All third-party USD prices are converted to RUB with the live Steam FX rate (`getSteamRubRate`), so roubles match steamcommunity.com instead of a fixed multiplier.

### Per-quality variants (`getItemVariants`) & multi-wear history (`getMultiWearHistory`)

- Variants rebuild the `market_hash_name` for every wear (FN→BS) plus the StatTrak™ flavor and fetch each one's Steam USD+RUB price.
- The chart overlays one line per selected wear on a shared time/price axis, anchoring each synthetic series to that wear's live price (real history where Skinport/take.skin provide it, modeled otherwise).

### Notes

- `skinport` public API does **not** expose a full dense time-series in the endpoint used here.
- Official `csfloat` integration currently uses `/api/v1/listings` and derives live market price from active buy-now listings.
- Official `csfloat` docs do not expose a public historical market-price endpoint suitable for the chart, so `csfloat` is intentionally used for spot pricing only.
- The current integration uses `/v1/sales/history`, which returns aggregates for `24h / 7d / 30d / 90d`.
- Those aggregates are converted into anchor points so the UI can use real market structure instead of a fully synthetic curve when detailed history is unavailable.
- When you buy PriceEmpire, insert the key into `.env` and restart the server.
