/* global React */
const { useState, useEffect, useRef, useMemo } = React;

/* ───────────────────────────────────────────────────
   LANDING — content sections
   ─────────────────────────────────────────────────── */

const TICKER_ITEMS = [
  { name: 'AK-47 | Redline', wear: 'FT', price: 22.41, change: 1.2 },
  { name: 'M4A4 | Asiimov', wear: 'BS', price: 89.65, change: -0.8 },
  { name: 'AWP | Dragon Lore', wear: 'FN', price: 8420.00, change: 3.4 },
  { name: 'Karambit | Doppler', wear: 'FN', price: 1985.20, change: 2.1 },
  { name: 'Glock-18 | Fade', wear: 'FN', price: 412.50, change: -1.4 },
  { name: 'M4A1-S | Hyper Beast', wear: 'MW', price: 38.10, change: 0.6 },
  { name: 'Desert Eagle | Blaze', wear: 'FN', price: 542.80, change: 2.8 },
  { name: 'USP-S | Kill Confirmed', wear: 'FT', price: 64.30, change: -0.3 },
  { name: 'Butterfly | Tiger Tooth', wear: 'FN', price: 2380.00, change: 1.7 },
  { name: 'AWP | Lightning Strike', wear: 'FN', price: 720.50, change: 4.5 },
  { name: 'AK-47 | Vulcan', wear: 'MW', price: 198.40, change: 0.9 },
  { name: 'Sport Gloves | Pandora', wear: 'FT', price: 1840.00, change: -2.1 },
];

const WEAR_LABELS = {
  FN: 'Factory New',
  MW: 'Minimal Wear',
  FT: 'Field-Tested',
  WW: 'Well-Worn',
  BS: 'Battle-Scarred',
};

function tickerItemToDetailItem(item) {
  const marketHashName = item.marketHashName || `${item.name} (${WEAR_LABELS[item.wear] || item.wear})`;
  const value = Number.isFinite(item.price) ? item.price : 0;
  const direction = item.change >= 0 ? 1 : -1;
  const spark = Array.from({ length: 12 }, (_, index) => {
    const progress = index / 11;
    return value * (1 + direction * progress * Math.abs(item.change || 0) / 100);
  });

  return {
    ...item,
    assetid: `ticker-${marketHashName}`,
    marketHashName,
    value,
    basis: value,
    pnl: 0,
    pnlPct: 0,
    qty: 1,
    tier: item.tier || 3,
    rarity: item.rarity || 'WATCHLIST',
    marketable: true,
    tradable: true,
    priceProvider: item.provider || 'market snapshot',
    marketUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`,
    spark,
  };
}

function moverItemToDetailItem(item) {
  const hasWear = item.wear && item.wear !== 'N/A';
  const marketHashName = item.marketHashName || (hasWear
    ? `${item.name} (${WEAR_LABELS[item.wear] || item.wear})`
    : item.name);
  const value = Number.isFinite(item.value) ? item.value : (Number.isFinite(item.price) ? item.price : 0);
  const basis = Number.isFinite(item.basis) ? item.basis : value;
  const qty = Number.isFinite(item.qty) ? item.qty : 1;
  const pnl = Number.isFinite(item.pnl) ? item.pnl : 0;
  const pnlPct = Number.isFinite(item.pnlPct) ? item.pnlPct : 0;

  return {
    ...item,
    assetid: item.assetid || `mover-${marketHashName}`,
    marketHashName,
    value,
    basis,
    pnl,
    pnlPct,
    qty,
    rarity: item.rarity || 'TOP MOVER',
    marketable: true,
    tradable: true,
    priceProvider: item.priceProvider || item.provider || 'portfolio',
    marketUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`,
    spark: Array.isArray(item.spark) && item.spark.length ? item.spark : [value, value],
  };
}

const MARKET_PAGE_SIZE = 48;
const MARKET_CATALOG_FALLBACK = [
  makeCatalogFallbackItem('AK-47 | Nightwish (Field-Tested)', { price: 99.17, sellListings: 360, rarity: 'Covert', category: 'weapons', type: 'Covert Rifle', wear: 'FT', tier: 5 }),
  makeCatalogFallbackItem('M4A1-S | Printstream (Minimal Wear)', { price: 322.15, sellListings: 144, rarity: 'Covert', category: 'weapons', type: 'Covert Rifle', wear: 'MW', tier: 5 }),
  makeCatalogFallbackItem('AWP | Asiimov (Field-Tested)', { price: 128.64, sellListings: 718, rarity: 'Covert', category: 'weapons', type: 'Covert Sniper Rifle', wear: 'FT', tier: 5 }),
  makeCatalogFallbackItem('Desert Eagle | Printstream (Factory New)', { price: 141.2, sellListings: 232, rarity: 'Covert', category: 'weapons', type: 'Covert Pistol', wear: 'FN', tier: 5 }),
  makeCatalogFallbackItem('Karambit | Doppler (Factory New)', { price: 2480, sellListings: 39, rarity: 'Extraordinary', category: 'knives', type: 'Extraordinary Knife', wear: 'FN', tier: 5 }),
  makeCatalogFallbackItem('Sport Gloves | Nocts (Field-Tested)', { price: 672.45, sellListings: 51, rarity: 'Extraordinary', category: 'gloves', type: 'Extraordinary Gloves', wear: 'FT', tier: 5 }),
  makeCatalogFallbackItem('Sticker | Crown (Foil)', { price: 845.5, sellListings: 18, rarity: 'Remarkable', category: 'stickers', type: 'Remarkable Sticker', wear: 'N/A', tier: 3 }),
  makeCatalogFallbackItem('StatTrak USP-S | Monster Mashup (Minimal Wear)', { price: 56.12, sellListings: 84, rarity: 'Classified', category: 'weapons', type: 'Classified Pistol', wear: 'MW', special: 'stattrak', tier: 4 }),
  makeCatalogFallbackItem('Souvenir MP9 | Hot Rod (Factory New)', { price: 77.48, sellListings: 15, rarity: 'Classified', category: 'weapons', type: 'Classified SMG', wear: 'FN', special: 'souvenir', tier: 4 }),
  makeCatalogFallbackItem('Dreams & Nightmares Case', { price: 1.64, sellListings: 221345, rarity: 'Base Grade', category: 'containers', type: 'Base Grade Container', wear: 'N/A', tier: 1 }),
  makeCatalogFallbackItem('Sticker Capsule 2', { price: 18.75, sellListings: 1234, rarity: 'Base Grade', category: 'capsules', type: 'Base Grade Container', wear: 'N/A', tier: 1 }),
  makeCatalogFallbackItem('Sealed Graffiti | Recoil AK-47 (Monarch Blue)', { price: 0.34, sellListings: 8542, rarity: 'Base Grade', category: 'graffiti', type: 'Base Grade Graffiti', wear: 'N/A', tier: 1 }),
];

function makeCatalogFallbackItem(marketHashName, config) {
  const price = config.price;
  return {
    assetid: `fallback-${marketHashName}`,
    marketHashName,
    name: String(marketHashName).replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, ''),
    wear: config.wear || 'N/A',
    price,
    value: price,
    basis: price,
    pnl: 0,
    pnlPct: 0,
    qty: 1,
    tier: config.tier || 2,
    rarity: config.rarity,
    category: config.category,
    special: config.special || 'normal',
    type: config.type,
    sellListings: config.sellListings || 0,
    marketable: true,
    tradable: true,
    priceProvider: 'market fallback',
    currencyCode: 'USD',
    marketUrl: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`,
    iconUrl: null,
    spark: Array.from({ length: 12 }, (_, index) => {
      const wave = Math.sin((index + 1) * 0.7) * 0.035;
      return Math.max(0.01, price * (1 + wave + index * 0.0015));
    }),
  };
}

function useDebouncedValue(value, delay = 260) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeoutId);
  }, [value, delay]);
  return debounced;
}

function filterCatalogItems(items, filters) {
  const query = String(filters.query || '').trim().toLowerCase();
  return items.filter((item) => {
    const haystack = [
      item.marketHashName,
      item.name,
      item.type,
      item.category,
      item.rarity,
    ].join(' ').toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (filters.category !== 'all' && item.category !== filters.category) return false;
    if (filters.rarity !== 'all' && String(item.rarity || '').toLowerCase() !== filters.rarity) return false;
    if (filters.wear !== 'all' && String(item.wear || '').toLowerCase() !== filters.wear) return false;
    if (filters.special === 'normal' && item.special !== 'normal') return false;
    if (!['all', 'normal'].includes(filters.special) && item.special !== filters.special) return false;
    return true;
  });
}

function sortCatalogItems(items, sort) {
  const sorted = [...items];
  if (sort === 'price-desc') return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
  if (sort === 'price-asc') return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
  if (sort === 'name-asc') return sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return sorted.sort((a, b) => (b.sellListings || 0) - (a.sellListings || 0));
}

function Ticker({ onItemClick }) {
  const market = useMarketSnapshot({ ticker: TICKER_ITEMS });
  const items = market.data?.ticker?.length ? market.data.ticker : TICKER_ITEMS;
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)',
      padding: '14px 0',
    }}>
      <div style={{
        display: 'flex', gap: 32, whiteSpace: 'nowrap',
        animation: 'tickerScroll 80s linear infinite',
      }}>
        {[...items, ...items, ...items].map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onItemClick && onItemClick(tickerItemToDetailItem(it))}
            title={`${it.name} · ${formatUsd(it.price)}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              appearance: 'none', border: 0, background: 'transparent',
              color: 'inherit', padding: 0, cursor: 'pointer',
            }}
          >
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{it.wear}</span>
            <span style={{ fontFamily: 'var(--f-display)', fontSize: 13, fontWeight: 500 }}>{it.name}</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--fg-1)' }}>{formatUsd(it.price)}</span>
            <span style={{
              fontFamily: 'var(--f-mono)', fontSize: 11.5,
              color: it.change >= 0 ? 'var(--green)' : 'var(--red)',
            }}>{it.change >= 0 ? '▲' : '▼'} {Math.abs(it.change).toFixed(1)}%</span>
            <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--fg-4)' }}></span>
          </button>
        ))}
      </div>
      <style>{`@keyframes tickerScroll { from { transform: translateX(0) } to { transform: translateX(-33.333%) } }`}</style>
    </div>
  );
}

/* Top movers grid */
const MOVERS = [
  { name: 'AWP | Wildfire', wear: 'FN', price: 1240, delta: 18.2, tier: 4, spark: [10,12,11,14,16,15,18,22,20,24,26,28] },
  { name: 'Karambit | Fade', wear: 'FN', price: 3580, delta: 12.4, tier: 5, spark: [30,28,32,31,34,36,35,38,42,44,43,46] },
  { name: 'M4A1-S | Knight', wear: 'FN', price: 4120, delta: 9.8, tier: 4, spark: [40,38,42,44,46,45,48,50,52,54,56,58] },
  { name: 'AK-47 | Fire Serpent', wear: 'MW', price: 2940, delta: 7.6, tier: 4, spark: [22,24,23,26,28,30,29,32,34,33,36,38] },
  { name: 'Glock | Fade', wear: 'FN', price: 412, delta: -4.2, tier: 3, spark: [50,48,46,44,42,44,42,40,38,40,38,36] },
  { name: 'Butterfly | Doppler', wear: 'FN', price: 2180, delta: -2.8, tier: 5, spark: [60,58,56,58,54,52,50,52,48,50,48,46] },
];

function TopMovers({ onItemClick, auth }) {
  const t = useT(window.__lang || 'en');
  const lang = window.__lang || 'en';
  const portfolio = usePortfolio(auth);
  const movers = useMemo(() => {
    const items = Array.isArray(portfolio.data?.items) ? portfolio.data.items : [];
    return items
      .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.pnlPct) && Number.isFinite(item.totalBasis) && item.totalBasis > 0)
      .sort((a, b) => b.pnlPct - a.pnlPct || b.pnl - a.pnl || (b.totalValue ?? b.value ?? 0) - (a.totalValue ?? a.value ?? 0))
      .slice(0, 6)
      .map((item) => ({
        ...item,
        price: item.value,
        delta: item.pnlPct,
      }));
  }, [portfolio.data]);
  return (
    <section className="section">
      <div className="container">
        <SectionHeader title={t.sections.movers} sub={t.sections.moversSub} num="01" />
        {portfolio.loading && !portfolio.data ? (
          <div className="glass" style={{ padding: 18, color: 'var(--fg-2)', fontSize: 14 }}>
            {lang === 'ru'
              ? 'Собираю лидеров из твоего портфеля...'
              : 'Building leaders from your portfolio...'}
          </div>
        ) : movers.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {movers.map((m, i) => (
              <button
                key={m.assetid || m.marketHashName || `${m.name}-${i}`}
                type="button"
                className={`item-card tier-${m.tier}`}
                onClick={() => onItemClick && onItemClick(moverItemToDetailItem(m))}
                title={m.marketHashName || m.name}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  appearance: 'none',
                  cursor: onItemClick ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, fontWeight: 500 }}>{m.name}</div>
                    <div className="eyebrow" style={{ marginTop: 4 }}>
                      {m.wear} · {m.qty} pcs · TIER {m.tier}
                    </div>
                  </div>
                  <span className={`chip ${m.delta >= 0 ? 'chip-up' : 'chip-down'}`}>
                    {m.delta >= 0 ? '▲' : '▼'} {Math.abs(m.delta).toFixed(1)}%
                  </span>
                </div>
                {m.iconUrl
                  ? (
                    <div className="item-art" style={{ aspectRatio: '16/8', display: 'grid', placeItems: 'center', padding: 24 }}>
                      <img
                        src={withSteamImageSize(m.iconUrl, 640, 320)}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'block',
                          objectFit: 'contain',
                          objectPosition: 'center center',
                          filter: 'drop-shadow(0 18px 32px rgba(0,0,0,0.45))',
                        }}
                      />
                    </div>
                  )
                  : <ItemArt label={m.name} tier={m.tier} style={{ aspectRatio: '16/8' }} />}
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
                  <div>
                    <div className="eyebrow">{lang === 'ru' ? 'СТОИМОСТЬ' : 'VALUE'}</div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', marginBottom: 4 }}>
                      {lang === 'ru' ? 'Текущая цена за 1 шт.' : 'Current price per unit'}
                    </div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, fontWeight: 500 }}>{formatUsd(m.price)}</div>
                  </div>
                  <div style={{ flex: 1, maxWidth: 120 }}>
                    <Sparkline data={m.spark} color={m.delta >= 0 ? 'var(--green)' : 'var(--red)'} height={36} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="glass" style={{ padding: 18, color: 'var(--fg-2)', fontSize: 14 }}>
            {auth?.connected
              ? (lang === 'ru'
                ? 'В портфеле пока нет позиций с рассчитанной себестоимостью и доходностью. Добавь базис или дождись оценки цен.'
                : 'No portfolio positions have enough pricing and basis data yet. Add cost basis or wait for pricing to finish.')
              : (lang === 'ru'
                ? 'Подключи Steam аккаунт, и здесь появятся лидеры именно из твоего портфеля.'
                : 'Connect your Steam account to see leaders from your own portfolio here.')}
          </div>
        )}
      </div>
    </section>
  );
}

function MarketCatalog({ onItemClick }) {
  const lang = window.__lang || 'en';
  const t = useT(lang);
  const marketT = t.market;
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [wear, setWear] = useState('all');
  const [special, setSpecial] = useState('all');
  const [sort, setSort] = useState('popular');
  const [page, setPage] = useState(1);
  const [loadedItems, setLoadedItems] = useState([]);
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, category, wear, special, sort]);

  useEffect(() => {
    setLoadedItems([]);
  }, [debouncedQuery, category, wear, special, sort]);

  const categoryOptions = [
    { value: 'all', label: lang === 'ru' ? 'Все' : 'All' },
    { value: 'weapons', label: lang === 'ru' ? 'Оружие' : 'Weapons' },
    { value: 'knives', label: lang === 'ru' ? 'Ножи' : 'Knives' },
    { value: 'gloves', label: lang === 'ru' ? 'Перчатки' : 'Gloves' },
    { value: 'agents', label: lang === 'ru' ? 'Агенты' : 'Agents' },
    { value: 'stickers', label: lang === 'ru' ? 'Стикеры' : 'Stickers' },
    { value: 'containers', label: lang === 'ru' ? 'Контейнеры' : 'Containers' },
    { value: 'capsules', label: lang === 'ru' ? 'Капсулы' : 'Capsules' },
    { value: 'graffiti', label: lang === 'ru' ? 'Граффити' : 'Graffiti' },
  ];
  const wearOptions = [
    { value: 'all', label: lang === 'ru' ? 'Все' : 'All' },
    { value: 'fn', label: 'FN' },
    { value: 'mw', label: 'MW' },
    { value: 'ft', label: 'FT' },
    { value: 'ww', label: 'WW' },
    { value: 'bs', label: 'BS' },
  ];
  const specialOptions = [
    { value: 'all', label: lang === 'ru' ? 'Все' : 'All' },
    { value: 'normal', label: lang === 'ru' ? 'Обычные' : 'Standard' },
    { value: 'stattrak', label: 'StatTrak' },
  ];
  const sortOptions = [
    { value: 'popular', label: marketT.popular },
    { value: 'price-desc', label: marketT.priceDesc },
    { value: 'price-asc', label: marketT.priceAsc },
    { value: 'name-asc', label: marketT.nameAsc },
  ];
  const categoryLabelMap = Object.fromEntries(categoryOptions.map((option) => [option.value, option.label]));
  const specialLabelMap = Object.fromEntries(specialOptions.map((option) => [option.value, option.label]));
  const formatTagLabel = (value, map) => map[value] || String(value || '').replace(/\b\w/g, (letter) => letter.toUpperCase());

  const fallbackData = useMemo(() => {
    const filtered = filterCatalogItems(sortCatalogItems(MARKET_CATALOG_FALLBACK, sort), {
      query: debouncedQuery,
      category,
      rarity: 'all',
      wear,
      special,
    });
    return {
      items: filtered.slice(0, page * MARKET_PAGE_SIZE),
      filteredCount: filtered.length,
      totalCount: filtered.length,
      hasMore: page * MARKET_PAGE_SIZE < filtered.length,
      scanned: filtered.length,
    };
  }, [debouncedQuery, category, wear, special, sort, page]);

  const catalog = useMarketCatalog({
    query: debouncedQuery,
    page,
    pageSize: MARKET_PAGE_SIZE,
    currency: getActiveCurrency(),
    category,
    rarity: 'all',
    wear,
    special,
    sort,
  });

  useEffect(() => {
    if (!catalog.data?.items) return;
    setLoadedItems((current) => {
      if (page === 1) return catalog.data.items;
      const existing = new Set(current.map((item) => item.assetid || item.marketHashName));
      const appended = catalog.data.items.filter((item) => !existing.has(item.assetid || item.marketHashName));
      return [...current, ...appended];
    });
  }, [catalog.data, page]);

  const data = catalog.data || fallbackData;
  const items = catalog.data
    ? (loadedItems.length ? loadedItems : (catalog.data.items || []))
    : (fallbackData.items || []);
  const totalCount = data.filteredCount ?? data.totalCount ?? items.length;
  const shownResults = `${items.length.toLocaleString(locale)} ${marketT.loaded}`;
  const totalResults = `${totalCount.toLocaleString(locale)} ${marketT.total}`;

  return (
    <section className="section">
      <div className="container">
        <SectionHeader title={t.sections.market} sub={t.sections.marketSub} num="02" />

        <div className="glass market-toolbar">
          <div className="market-toolbar-top">
            <label className="market-search">
              <span className="eyebrow">{marketT.searchPlaceholder}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={marketT.searchPlaceholder}
                className="market-search-input"
              />
            </label>

            <div className="market-toolbar-meta">
              <span className="chip">{shownResults}</span>
              <span className="chip">{totalResults}</span>
              <span className="chip">{`${(data.scanned || 0).toLocaleString(locale)} ${marketT.scanned}`}</span>
              {catalog.loading && <span className="chip chip-accent">{marketT.loading}</span>}
            </div>
          </div>

          <div className="market-filter-stack">
            <MarketFilterGroup label={marketT.category} value={category} options={categoryOptions} onChange={setCategory} />
            <MarketFilterGroup label={marketT.wear} value={wear} options={wearOptions} onChange={setWear} />
            <MarketFilterGroup label={marketT.special} value={special} options={specialOptions} onChange={setSpecial} />
            <MarketFilterGroup label={marketT.sort} value={sort} options={sortOptions} onChange={setSort} />
          </div>
        </div>

        {items.length
          ? (
            <>
              <div className="market-grid">
                {items.map((item) => (
                  <button
                    key={item.assetid || item.marketHashName}
                    type="button"
                    className={`market-card tier-${item.tier || 2}`}
                    onClick={() => onItemClick && onItemClick(item)}
                  >
                    <div className="market-card-top">
                      <span className="chip chip-accent">{formatTagLabel(item.category, categoryLabelMap)}</span>
                      <span className="chip">{item.rarity}</span>
                    </div>

                    {item.iconUrl
                      ? (
                        <div className="item-art market-card-art" style={{ display: 'grid', placeItems: 'center', padding: 18 }}>
                          <img
                            src={withSteamImageSize(item.iconUrl, 512, 320)}
                            alt=""
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'block',
                              objectFit: 'contain',
                              objectPosition: 'center center',
                              filter: 'drop-shadow(0 20px 36px rgba(0,0,0,0.5))',
                            }}
                          />
                        </div>
                      )
                      : <ItemArt label={item.name} tier={item.tier || 2} className="market-card-art" />}

                    <div className="market-card-body">
                      <div className="market-card-name">{item.name}</div>
                      <div className="market-card-sub">
                        {[item.wear !== 'N/A' ? item.wear : null, item.special !== 'normal' ? formatTagLabel(item.special, specialLabelMap) : null, item.type].filter(Boolean).join(' · ')}
                      </div>

                      <div className="market-card-footer">
                        <div>
                          <div className="eyebrow">PRICE</div>
                          <div className="display market-card-price">{formatItemPrice(item, item.price)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="eyebrow">{marketT.listings}</div>
                          <div className="market-card-listings">{(item.sellListings || 0).toLocaleString(locale)}</div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="market-pagination">
                <button type="button" className="btn btn-sm btn-primary" disabled={!data.hasMore || catalog.loading} onClick={() => setPage((value) => value + 1)}>
                  {marketT.more}
                </button>
              </div>
            </>
          )
          : (
            <div className="glass market-empty">
              <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>{marketT.empty}</div>
              <p style={{ marginTop: 12, color: 'var(--fg-1)', maxWidth: 520, lineHeight: 1.6 }}>
                {lang === 'ru'
                  ? 'Попробуй убрать часть фильтров или изменить поисковый запрос. Для узких фильтров мы сканируем рынок батчами, поэтому результаты могут быть неполными до следующей страницы.'
                  : 'Try removing some filters or changing the search query. Narrow combinations are scanned in batches, so the current slice may not represent the full market yet.'}
              </p>
            </div>
          )}
      </div>
    </section>
  );
}

/* CS2 news feed */
function formatNewsTime(iso, lang) {
  const timestamp = Date.parse(String(iso || ''));
  if (Number.isNaN(timestamp)) return '--';
  const elapsedHours = Math.max(0, Math.round((Date.now() - timestamp) / (60 * 60 * 1000)));
  if (elapsedHours < 1) return lang === 'ru' ? 'только что' : 'just now';
  if (elapsedHours < 24) return lang === 'ru' ? `${elapsedHours} ч назад` : `${elapsedHours}h ago`;
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

function newsInitial(name) {
  const clean = String(name || 'TG').trim();
  return (clean.charAt(0) || 'T').toUpperCase();
}

function newsAvatarStyle(name) {
  const value = String(name || 'tg');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return { background: `linear-gradient(135deg, hsl(${hue} 64% 52%), hsl(${(hue + 38) % 360} 58% 42%))` };
}

function CaseROI() {
  const lang = window.__lang || 'en';
  const t = useT(lang);
  const newsFeed = useCsNews();
  const news = newsFeed.data?.items || [];
  const featured = news[0] || null;
  const sideItems = news.slice(1, 5);
  const updatedLabel = newsFeed.data?.updatedAt ? formatNewsTime(newsFeed.data.updatedAt, lang) : '--';
  const sources = Array.isArray(newsFeed.data?.sources) ? newsFeed.data.sources : [];
  const connectedSources = sources.filter((source) => source.ok !== false);
  const failedSources = sources.filter((source) => source.ok === false);
  const sourceSummary = connectedSources.length
    ? `${connectedSources.length} ${lang === 'ru' ? 'кан.' : 'ch.'} · ${connectedSources.reduce((total, source) => total + (source.count || 0), 0)} ${lang === 'ru' ? 'постов' : 'posts'}`
    : (failedSources[0]?.message || newsFeed.data?.message || t.news.telegramPending);
  const feedError = newsFeed.error?.message
    || (!featured && (newsFeed.data?.message || failedSources.map((source) => source.message).filter(Boolean).join(' · ')))
    || null;

  return (
    <section className="section">
      <div className="container">
        <SectionHeader title={t.sections.news} sub={t.sections.newsSub} num="03" />
        <div className="news-grid">
          <div className="glass news-main">
            <div className="news-toolbar">
              <div className="news-toolbar-chips">
                <span className="chip chip-accent"><span className="live-dot"></span>{t.news.live}</span>
                <span className="chip">{newsFeed.data?.stale ? t.news.fallback : (newsFeed.data?.cached ? t.news.cached : 'API')}</span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => newsFeed.reload()}
                disabled={newsFeed.loading}
                style={{ cursor: 'pointer' }}
              >
                {newsFeed.loading ? (lang === 'ru' ? 'Обновляем…' : 'Refreshing…') : t.news.refresh}
              </button>
            </div>

            {featured ? (
              <>
                <a href={featured.url} target="_blank" rel="noreferrer" className="news-featured">
                  <div
                    className="news-featured-media"
                    style={featured.image
                      ? { backgroundImage: `url(${featured.image})` }
                      : { background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))' }}
                  >
                    <span className="chip chip-accent">{featured.sourceName || t.news.telegram}</span>
                    <span className="news-time">{formatNewsTime(featured.publishedAt, lang)}</span>
                    {featured.image ? null : (
                      <div className="news-featured-glyph">{newsInitial(featured.sourceName)}</div>
                    )}
                  </div>
                  <div className="news-featured-body">
                    <div className="news-featured-title news-clamp-2">{featured.title}</div>
                    <div className="news-featured-summary news-clamp-3">
                      {featured.summary || (lang === 'ru' ? 'Открыть пост в Telegram.' : 'Open the post in Telegram.')}
                    </div>
                    <div className="news-featured-foot">
                      <span className="eyebrow">{t.news.updated} · {formatNewsTime(featured.publishedAt, lang)}</span>
                      <span className="news-open">{lang === 'ru' ? 'Открыть в TG →' : 'Open in TG →'}</span>
                    </div>
                  </div>
                </a>

                <div className="news-list">
                  {sideItems.map((item) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="news-row">
                      <div
                        className={`news-thumb ${item.image ? '' : 'news-thumb-fallback'}`}
                        style={item.image ? { backgroundImage: `url(${item.image})` } : newsAvatarStyle(item.sourceName)}
                      >
                        {item.image ? null : newsInitial(item.sourceName)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="news-row-title news-clamp-2">{item.title}</div>
                        <div className="news-row-meta">
                          <span className="news-row-source">{item.sourceName || t.news.telegram}</span>
                          <span className="news-time">· {formatNewsTime(item.publishedAt, lang)}</span>
                        </div>
                        <div className="news-row-summary news-clamp-3">
                          {item.summary || (lang === 'ru' ? 'Открыть пост в Telegram.' : 'Open the post in Telegram.')}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <div className="news-empty">
                <div>{newsFeed.loading ? (lang === 'ru' ? 'Загружаем посты из Telegram…' : 'Loading Telegram posts…') : t.news.empty}</div>
                {feedError ? (
                  <div style={{ marginTop: 10, color: 'var(--fg-1)' }}>{feedError}</div>
                ) : null}
              </div>
            )}
          </div>

          <div className="glass news-side">
            <div className="news-side-head">
              <div>
                <div className="eyebrow">{t.news.telegram}</div>
                <div className="news-side-total">{`${news.length}`.padStart(2, '0')}</div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-2)', marginTop: 2 }}>
                  {lang === 'ru' ? 'постов в ленте' : 'posts in feed'}
                </div>
              </div>
              <span className={`chip ${connectedSources.length ? 'chip-up' : 'chip-down'}`}>
                {connectedSources.length
                  ? (lang === 'ru' ? `${connectedSources.length} онлайн` : `${connectedSources.length} live`)
                  : 'offline'}
              </span>
            </div>

            <div className="news-channels">
              {sources.length ? sources.map((source) => (
                <div key={source.source} className="news-channel">
                  <div className="news-avatar" style={newsAvatarStyle(source.name)}>{newsInitial(source.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="news-channel-name">{source.name}</div>
                    <div className="news-channel-sub">
                      {source.ok === false
                        ? (lang === 'ru' ? 'недоступен' : 'unavailable')
                        : `${source.count || 0} ${lang === 'ru' ? 'постов' : 'posts'}`}
                    </div>
                  </div>
                  <span className={`chip ${source.ok === false ? 'chip-down' : 'chip-up'}`} title={source.message || ''}>
                    {source.ok === false ? 'offline' : `${source.count || 0}`}
                  </span>
                </div>
              )) : (
                <div style={{ color: 'var(--fg-2)', fontSize: 13, lineHeight: 1.55 }}>{sourceSummary}</div>
              )}
            </div>

            <div className="news-side-foot">
              <div className="news-stat">
                <span className="eyebrow">{lang === 'ru' ? 'Обновлено' : 'Last refresh'}</span>
                <span className="news-stat-val">{updatedLabel}</span>
              </div>
              <div className="news-stat">
                <span className="eyebrow">{lang === 'ru' ? 'Протокол' : 'Source'}</span>
                <span className="news-stat-val">Telegram MTProto</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function armoryRoiTone(roi) {
  if (!Number.isFinite(roi)) return 'muted';
  if (roi >= 100) return 'good';
  if (roi >= 80) return 'mid';
  return 'low';
}

function formatArmoryMoney(value, currency) {
  if (!Number.isFinite(value)) return '—';
  return formatMoney(value, { digits: 2, currency });
}

function ArmoryROI() {
  const lang = window.__lang || 'en';
  const t = useT(lang);
  const [currency, setCurrency] = useState(() => getActiveCurrency());

  useEffect(() => {
    const sync = () => setCurrency(getActiveCurrency());
    window.addEventListener('currency-change', sync);
    return () => window.removeEventListener('currency-change', sync);
  }, []);

  const feed = useArmoryRoi(currency);
  const items = feed.data?.items || [];
  const updatedLabel = feed.data?.updatedAt
    ? new Date(feed.data.updatedAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    : '—';

  const copy = lang === 'ru'
    ? {
      pricing: 'Источник цен',
      currency: 'Валюта',
      updated: 'Обновлено',
      starRoi: 'ROI звёзд',
      profit: 'Профит',
      avg: 'СР.',
      days: 'дней осталось',
      loading: 'Загружаем Armory…',
      empty: 'Нет данных Armory.',
    }
    : {
      pricing: 'Pricing Source',
      currency: 'Currency',
      updated: 'Updated',
      starRoi: 'Star ROI',
      profit: 'Profit',
      avg: 'AVG',
      days: 'days remaining',
      loading: 'Loading Armory…',
      empty: 'No Armory data.',
    };

  return (
    <section className="section armory-section">
      <div className="container">
        <SectionHeader title={t.sections.armory} sub={t.sections.armorySub} num="04" />

        <div className="armory-shell">
          <div className="armory-toolbar">
            <div className="armory-toolbar-group">
              <span className="armory-toolbar-label">{copy.pricing}</span>
              <span className="armory-source-pill">Steam</span>
            </div>
            <div className="armory-toolbar-group">
              <span className="armory-toolbar-label">{copy.currency}</span>
              <div className="armory-currency-row">
                {['usd', 'rub'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`armory-currency-btn ${currency === key ? 'is-active' : ''}`}
                    onClick={() => {
                      window.__currency = key;
                      setCurrency(key);
                      window.dispatchEvent(new Event('currency-change'));
                    }}
                  >
                    {key.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="armory-toolbar-group armory-toolbar-updated">
              <span className="armory-toolbar-label">{copy.updated}</span>
              <span className="armory-updated-val">{updatedLabel}</span>
            </div>
          </div>

          {feed.loading && !items.length ? (
            <div className="armory-empty">{copy.loading}</div>
          ) : null}
          {!feed.loading && !items.length ? (
            <div className="armory-empty">{feed.error?.message || copy.empty}</div>
          ) : null}

          <div className="armory-grid">
            {items.map((item) => (
              <article key={item.id} className={`armory-tile tone-${armoryRoiTone(item.roi)}`}>
                <div className="armory-tile-head">
                  <h3 className="armory-tile-title">{item.name}</h3>
                  <span className="armory-tile-rank">#{item.rank}</span>
                </div>

                <div className="armory-tile-body">
                  <div className="armory-tile-stats">
                    <div className="armory-stat">
                      <span className="armory-stat-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 8h16v10H4z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 8V6h8v2" stroke="currentColor" strokeWidth="1.5"/></svg>
                      </span>
                      <span className="armory-stat-label">{copy.starRoi}</span>
                      <span className="armory-stat-val">{Number.isFinite(item.roi) ? `${item.roi}%` : '—'}</span>
                    </div>
                    {Number.isFinite(item.profitChance) ? (
                      <div className="armory-stat">
                        <span className="armory-stat-icon" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M8 7h8M7 12h10M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </span>
                        <span className="armory-stat-label">{copy.profit}</span>
                        <span className="armory-stat-val">{item.profitChance}%</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="armory-tile-art">
                    {item.imageUrl ? (
                      <img src={withSteamImageSize(item.imageUrl, 360, 270)} alt="" loading="lazy" />
                    ) : (
                      <div className="armory-tile-art-fallback" />
                    )}
                  </div>
                </div>

                <div className="armory-tile-foot">
                  <div className="armory-tile-cost">
                    <span className="armory-tile-stars">{item.stars} ★</span>
                    <span className="armory-tile-slash">/</span>
                    <span>{formatArmoryMoney(item.starCost, currency)}</span>
                    <span className="armory-tile-arrow">→</span>
                    <span className="armory-tile-ev">{formatArmoryMoney(item.ev, currency)} {copy.avg}</span>
                  </div>
                  {Number.isFinite(item.daysRemaining) ? (
                    <div className="armory-tile-days">
                      <span aria-hidden="true">⏱</span>
                      {item.daysRemaining} {copy.days}
                    </div>
                  ) : null}
                  {item.volumeLabel ? (
                    <span className="armory-tile-volume">{item.volumeLabel}</span>
                  ) : null}
                </div>
                <div className="armory-tile-accent" aria-hidden="true" />
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DesktopDownload({ lang }) {
  const copy = lang === 'ru'
    ? {
      title: 'Desktop app для полного портфеля',
      sub: 'Скачайте локальный клиент, войдите в Steam на своём компьютере и синхронизируйте полный инвентарь вместе с содержимым Storage Units.',
      macApple: 'macOS · Apple Silicon',
      macIntel: 'macOS · Intel',
      windows: 'Windows · x64',
      note: 'После установки откройте портфель в браузере, нажмите «Код для desktop» и введите 6-значный код в приложении.',
      security: 'Read-only: пароль Steam не запрашивается, токены хранятся локально, на сервер отправляется только список предметов.',
    }
    : {
      title: 'Desktop app for the full portfolio',
      sub: 'Download the local client, sign in to Steam on your computer, and sync the full inventory including Storage Units.',
      macApple: 'macOS · Apple Silicon',
      macIntel: 'macOS · Intel',
      windows: 'Windows · x64',
      note: 'After installing, open your browser portfolio, click “Desktop code”, and enter the 6-digit code in the app.',
      security: 'Read-only: Steam password is never requested, tokens stay local, and only item lists are sent to the server.',
    };

  const downloads = [
    { label: copy.macApple, href: '/downloads/Steam-Invest-Portfolio-mac-arm64.dmg' },
    { label: copy.macIntel, href: '/downloads/Steam-Invest-Portfolio-mac-x64.dmg' },
    { label: copy.windows, href: '/downloads/Steam-Invest-Portfolio-win-x64.exe' },
  ];

  return (
    <section className="section-tight">
      <div className="container">
        <div className="glass-strong" style={{
          padding: '34px 40px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.8fr)',
          gap: 28,
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            inset: 'auto -10% -80% 45%',
            height: 260,
            background: 'radial-gradient(circle, oklch(0.68 0.22 5 / 0.24), transparent 65%)',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative' }}>
            <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 12 }}>// DESKTOP CLIENT</div>
            <h2 className="display" style={{ fontSize: 'clamp(28px, 3.2vw, 44px)', fontWeight: 500, lineHeight: 1.08 }}>
              {copy.title}
            </h2>
            <p style={{ marginTop: 14, color: 'var(--fg-1)', fontSize: 15, lineHeight: 1.65, maxWidth: 760 }}>
              {copy.sub}
            </p>
            <p style={{ marginTop: 12, color: 'var(--fg-2)', fontSize: 13, lineHeight: 1.6, maxWidth: 760 }}>
              {copy.note}
            </p>
          </div>
          <div style={{ position: 'relative', display: 'grid', gap: 10 }}>
            {downloads.map((item) => (
              <a key={item.href} className="btn btn-primary" href={item.href} download style={{ justifyContent: 'space-between' }}>
                <span>{item.label}</span>
                <span className="mono" style={{ fontSize: 11 }}>DOWNLOAD</span>
              </a>
            ))}
            <div className="glass" style={{ padding: 14, color: 'var(--fg-2)', fontSize: 12.5, lineHeight: 1.55 }}>
              {copy.security}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Stats band */
function StatsBand() {
  const t = useT(window.__lang || 'en');
  const stats = [
    { v: '482,180', l: 'items priced live' },
    { v: compactUsd(31200000, { digits: 1, compact: true }), l: 'tracked / 24h' },
    { v: '14,210', l: 'portfolios linked' },
    { v: '99.94%', l: 'price-feed uptime' },
  ];
  return (
    <section className="section-tight">
      <div className="container">
        <div className="glass-strong" style={{
          padding: '48px 56px',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* march line */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }}>
            <div className="march" style={{ height: '100%' }}></div>
          </div>
          {stats.map((s, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <div className="display" style={{ fontSize: 44, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>{s.v}</div>
              <div className="eyebrow" style={{ marginTop: 10 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* FAQ */
const FAQ_ITEMS = {
  en: [
    { q: 'How does Steam linking work?', a: 'Open-Auth via your Steam ID, then we read your public inventory. We never request your password or session token. You can also paste an inventory URL to track read-only.' },
    { q: 'Where do prices come from?', a: 'We aggregate community market and major third-party listing books, weighting by recent volume and float band. Per-item provenance is shown on the detail view.' },
    { q: 'Are float, paint seed, and stickers considered?', a: 'Yes. Valuation is float-band aware and applies per-skin sticker multipliers. Paint-seed premium tables are maintained for known pattern lines.' },
    { q: 'Do you show Steam availability restrictions?', a: 'Yes. Steam availability status is surfaced per item so you can distinguish open and restricted inventory entries.' },
    { q: 'What about Steam Mobile Authenticator?', a: 'Read-only tracking needs nothing. Sensitive Steam actions always stay inside Steam — we never touch SDA seeds or codes.' },
    { q: 'Is there a free tier?', a: 'Yes. Up to 100 items tracked, 24h price refresh. Pro lifts caps and adds float scanners, alerts, and CSV export.' },
  ],
  ru: [
    { q: 'Как работает привязка Steam?', a: 'OpenID через Steam ID, далее читаем публичный инвентарь. Пароль и токены сессии не запрашиваем. Можно вставить URL инвентаря для read-only режима.' },
    { q: 'Откуда берутся цены?', a: 'Агрегируем community market и крупные сторонние книги ставок, взвешиваем по объёму и float-бэнду. На карточке предмета показан per-item provenance.' },
    { q: 'Учитываются ли float, paint seed и наклейки?', a: 'Да. Оценка зависит от float-бэнда, применяет per-skin множители наклеек. Для известных pattern-line ведём таблицы premium-ов по seed.' },
    { q: 'Показываете ли ограничения доступности Steam?', a: 'Да. Для каждого предмета виден статус Steam, чтобы можно было отличать открытые и ограниченные позиции.' },
    { q: 'А Steam Mobile Authenticator?', a: 'Для read-only ничего не нужно. Все чувствительные действия остаются внутри Steam, SDA-seed-ов мы не касаемся.' },
    { q: 'Есть бесплатный тариф?', a: 'Да. До 100 предметов и 24-часовой refresh. Pro снимает лимиты, добавляет float-сканер, алерты и CSV-экспорт.' },
  ],
};

function FAQ({ lang }) {
  const t = useT(lang);
  const [open, setOpen] = useState(0);
  const items = FAQ_ITEMS[lang] || FAQ_ITEMS.en;
  return (
    <section className="section">
      <div className="container">
        <SectionHeader title={t.sections.faq} num="05" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 32 }}>
          <div>
            <p style={{ color: 'var(--fg-1)', lineHeight: 1.6, fontSize: 15 }}>
              {lang === 'ru'
                ? 'Не нашли ответ? Напишите нам — отвечаем в течение часа в рабочее время.'
                : 'Couldn\'t find what you needed? Email us — we answer within an hour during business hours.'}
            </p>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }}>support@steaminvest.local →</button>
          </div>
          <div className="glass" style={{ overflow: 'hidden' }}>
            {items.map((it, i) => (
              <div key={i} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <button onClick={() => setOpen(open === i ? -1 : i)} style={{
                  width: '100%', padding: '20px 24px', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
                  cursor: 'default',
                }}>
                  <span style={{ fontFamily: 'var(--f-display)', fontSize: 14, fontWeight: 500 }}>{it.q}</span>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--line-strong)',
                    display: 'grid', placeItems: 'center', color: 'var(--accent)',
                    transform: open === i ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 200ms',
                  }}>+</span>
                </button>
                {open === i && (
                  <div style={{ padding: '0 24px 24px', color: 'var(--fg-1)', fontSize: 13.5, lineHeight: 1.6, maxWidth: 720 }}>{it.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({ title, sub, num }) {
  const isNewsRuTitle = title === 'CS2 · новости';
  return (
    <div style={{ marginBottom: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {num && <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--accent)',
            padding: '3px 8px', border: '1px solid oklch(0.68 0.22 5 / 0.4)', borderRadius: 4,
          }}>// {num}</span>}
          <div style={{ height: 1, width: 60, background: 'var(--line-strong)' }}></div>
        </div>
        <h2 className="display" style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
          {isNewsRuTitle ? (
            <>
              CS2 · <span style={{ fontSize: '1.18em', lineHeight: 0.9, display: 'inline-block' }}>Н</span>овости
            </>
          ) : title}
        </h2>
      </div>
      {sub && <p style={{ maxWidth: 480, color: 'var(--fg-1)', fontSize: 14.5, lineHeight: 1.6 }}>{sub}</p>}
    </div>
  );
}

function MarketFilterGroup({ label, value, options, onChange }) {
  return (
    <div className="market-filter-group">
      <div className="eyebrow">{label}</div>
      <div className="market-filter-row">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="market-filter-chip"
            data-active={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Footer */
function Footer({ lang }) {
  return (
    <footer style={{ padding: '64px 64px 48px', borderTop: '1px solid var(--line)' }}>
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 32 }}>
        <div>
          <Logo />
          <p style={{ marginTop: 16, color: 'var(--fg-2)', fontSize: 12.5, lineHeight: 1.6, maxWidth: 320 }}>
            {lang === 'ru'
              ? 'Независимый трекер инвестиций в CS2. Не аффилирован со Steam, Valve или CSGO.'
              : 'Independent CS2 investment tracker. Not affiliated with Steam, Valve, or CSGO.'}
          </p>
        </div>
        {[
          { h: 'Product', items: ['Dashboard', 'Watchlist', 'API', 'Pricing'] },
          { h: 'Resources', items: ['Float guide', 'Pattern atlas', 'Case ROI', 'Changelog'] },
          { h: 'Company', items: ['About', 'Privacy', 'Terms', 'Contact'] },
        ].map((c, i) => (
          <div key={i}>
            <div className="eyebrow">{c.h}</div>
            <ul style={{ marginTop: 14, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {c.items.map((it, j) => (
                <li key={j} style={{ fontSize: 13, color: 'var(--fg-1)' }}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', color: 'var(--fg-3)', fontFamily: 'var(--f-mono)', fontSize: 11 }}>
        <span>© 2026 STEAM/INVEST · all rights reserved</span>
        <span>build 0824-A · 12ms median</span>
      </div>
    </footer>
  );
}

Object.assign(window, { Ticker, TopMovers, MarketCatalog, CaseROI, ArmoryROI, DesktopDownload, StatsBand, FAQ, Footer, SectionHeader });
