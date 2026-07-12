/* global React */
const { useState: detailUseState, useRef: detailUseRef, useCallback: detailUseCallback, useEffect: detailUseEffect, useMemo: detailUseMemo } = React;

// Wear colors shared between the quality selector and the multi-line chart.
const WEAR_COLORS = {
  FN: '#4ade80',
  MW: '#22d3ee',
  FT: '#facc15',
  WW: '#fb923c',
  BS: '#f87171',
};

const MARKETPLACE_META = {
  steam:      { label: 'Steam Market', color: '#66c0f4' },
  skinport:   { label: 'Skinport',     color: '#fa490a' },
  csgomarket: { label: 'Market.CSGO',  color: '#f7b500' },
  lisskins:   { label: 'LIS-Skins',    color: '#8b5cf6' },
  csfloat:    { label: 'CSFloat',      color: '#16c79a' },
  csmoney:    { label: 'CS.Money',     color: '#fdd835' },
  buff163:    { label: 'Buff163',      color: '#0fb9b1' },
};

// Build a market_hash_name for a given base / wear / StatTrak flavor on the client,
// so the quality + StatTrak toggles can switch the active listing without a round-trip.
function buildVariantHashName(base, wearLabel, { stattrak = false, souvenir = false } = {}) {
  const prefix = stattrak ? 'StatTrak™ ' : souvenir ? 'Souvenir ' : '';
  return `${prefix}${base} (${wearLabel})`;
}

/* ───────────────────────────────────────────────────
   ITEM DETAIL — API backed
   ─────────────────────────────────────────────────── */

function ItemDetail({ lang, item, loading = false, error = null, onBack }) {
  const t = useT(lang);
  const PERIOD_OPTIONS = [
    { key: '1d',  days: 1,   label: lang === 'ru' ? 'День' : '1D' },
    { key: '7d',  days: 7,   label: lang === 'ru' ? 'Неделя' : '7D' },
    { key: '30d', days: 30,  label: '30D' },
    { key: '1y',  days: 365, label: lang === 'ru' ? 'Год' : '1Y' },
    { key: 'all', days: 'all', label: lang === 'ru' ? 'Всё время' : 'All' },
  ];
  const activeCurrency = getActiveCurrency();
  const baseName = item?.marketHashName || null;
  const parsedBase = parseClientName(baseName);

  const [period, setPeriod] = detailUseState('30d');
  const [chartHover, setChartHover] = detailUseState(null);
  const chartRef = detailUseRef(null);
  const [activeName, setActiveName] = detailUseState(baseName);
  const [stattrak, setStattrak] = detailUseState(parsedBase.isStatTrak);
  const [selectedWears, setSelectedWears] = detailUseState(null);

  const activePeriod = PERIOD_OPTIONS.find(p => p.key === period) || PERIOD_OPTIONS[2];
  const fetchDays = period === 'all' ? 'all' : 365;

  // Variants are fetched per (skin, StatTrak flavor) — not per active wear — so clicking a
  // wear chip doesn't re-request the whole set. We probe with a fixed wear label.
  const probeName = parsedBase.hasWear
    ? buildVariantHashName(parsedBase.core, parsedBase.wearLabel || 'Field-Tested', { stattrak, souvenir: parsedBase.isSouvenir })
    : baseName;
  const variantsState = useItemVariants(probeName, activeCurrency);
  const offersState = useItemOffers(activeName, activeCurrency);

  const variants = variantsState.data?.variants || [];
  const hasWear = Boolean(variantsState.data?.hasWear);

  // Reset local selection whenever the user opens a different item.
  detailUseEffect(() => {
    setActiveName(baseName);
    setStattrak(parsedBase.isStatTrak);
    setSelectedWears(null);
    setChartHover(null);
  }, [baseName]);

  // Default the chart to every existing quality (Steam shows them overlaid) — re-runs when the
  // StatTrak flavor changes because that re-fetches the variant set.
  detailUseEffect(() => {
    if (!variantsState.data) return;
    if (variantsState.data.hasWear) {
      setSelectedWears(variantsState.data.variants.filter(v => v.exists).map(v => v.marketHashName));
    } else {
      setSelectedWears([activeName].filter(Boolean));
    }
  }, [variantsState.data]);

  const chartNames = (selectedWears && selectedWears.length) ? selectedWears : [activeName].filter(Boolean);
  const multiState = useMultiWearHistory(chartNames, fetchDays, activeCurrency);

  if (loading) {
    return (
      <div style={{ padding: '80px 64px' }}>
        <div className="container">
          <div className="glass" style={{ padding: 32, maxWidth: 620 }}>
            <button onClick={onBack} className="btn btn-sm btn-ghost" style={{ marginBottom: 24 }}>{t.item.back}</button>
            <h1 className="display" style={{ fontSize: 34, fontWeight: 500 }}>{lang === 'ru' ? 'Загружаем предмет...' : 'Loading item...'}</h1>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '80px 64px' }}>
        <div className="container">
          <div className="glass" style={{ padding: 32, maxWidth: 620 }}>
            <button onClick={onBack} className="btn btn-sm btn-ghost" style={{ marginBottom: 24 }}>{t.item.back}</button>
            <h1 className="display" style={{ fontSize: 34, fontWeight: 500 }}>{lang === 'ru' ? 'Предмет не найден' : 'Item not found'}</h1>
            <p style={{ marginTop: 12, color: 'var(--fg-1)', lineHeight: 1.6 }}>
              {lang === 'ru' ? 'Проверьте ссылку или откройте предмет из маркета или портфеля.' : 'Check the URL or open an item from the market or portfolio.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ padding: '80px 64px' }}>
        <div className="container">
          <div className="glass" style={{ padding: 32, maxWidth: 620 }}>
            <button onClick={onBack} className="btn btn-sm btn-ghost" style={{ marginBottom: 24 }}>{t.item.back}</button>
            <h1 className="display" style={{ fontSize: 34, fontWeight: 500 }}>{lang === 'ru' ? 'Предмет не выбран' : 'No item selected'}</h1>
            <p style={{ marginTop: 12, color: 'var(--fg-1)', lineHeight: 1.6 }}>
              {lang === 'ru' ? 'Открой предмет из таблицы портфеля после синхронизации Steam inventory.' : 'Open an item from the portfolio table after syncing Steam inventory.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const rawSeries = multiState.data?.series || [];
  const historyProviders = [...new Set(rawSeries.map((s) => s.provider).filter((p) => p && p !== 'none'))];
  const historyCurrency = (rawSeries.find(s => s.currency)?.currency || (activeCurrency === 'rub' ? 'RUB' : 'USD')).toLowerCase();
  const periodDays = typeof activePeriod.days === 'number' ? activePeriod.days : null;
  const cutoffTs = periodDays == null ? 0 : Date.now() - periodDays * 86400000;

  // Each visible quality becomes a colored line on a shared time/price axis (Steam-style).
  const chartSeries = rawSeries
    .map(s => {
      let pts = (s.data || [])
        .map(p => ({ ...p, t: new Date(p.date).getTime() }))
        .filter(p => Number.isFinite(p.price) && !Number.isNaN(p.t))
        .sort((a, b) => a.t - b.t);
      let view = cutoffTs ? pts.filter(p => p.t >= cutoffTs) : pts;
      if (view.length < 2 && pts.length >= 2) view = pts.slice(-Math.max(2, periodDays || 30));
      return {
        marketHashName: s.marketHashName,
        wear: s.wear,
        wearLabel: s.wearLabel,
        color: WEAR_COLORS[s.wear] || 'var(--accent)',
        points: view,
      };
    })
    .filter(s => s.points.length >= 2);

  const formatChartMoney = (value) => formatMoney(value, { digits: 2, currency: historyCurrency });
  const chart = chartSeries.length ? buildMultiChart(chartSeries, historyCurrency) : null;
  const hasHistory = Boolean(chart);

  const activeVariant = variants.find(v => v.marketHashName === activeName) || null;
  const parsedActive = parseClientName(activeName);
  const activePriceUsd = Number.isFinite(activeVariant?.price) ? activeVariant.price
    : Number.isFinite(item.price) ? item.price : item.value;
  const activePriceRub = Number.isFinite(activeVariant?.priceRub) ? activeVariant.priceRub
    : Number.isFinite(item.priceRub) ? item.priceRub : null;
  const headerPrice = activeCurrency === 'rub' && Number.isFinite(activePriceRub)
    ? formatMoney(activePriceRub, { digits: 2, currency: 'rub' })
    : formatMoney(activePriceUsd, { digits: 2 });

  const toggleStattrak = () => {
    const next = !stattrak;
    const wearLabel = parsedActive.wearLabel || parsedBase.wearLabel;
    setStattrak(next);
    if (wearLabel) {
      setActiveName(buildVariantHashName(parsedBase.core, wearLabel, { stattrak: next, souvenir: parsedBase.isSouvenir }));
    }
    setChartHover(null);
  };

  const toggleWearLine = (mhn) => {
    setSelectedWears((prev) => {
      const current = prev && prev.length ? prev : chartNames;
      if (current.includes(mhn)) {
        const next = current.filter(n => n !== mhn);
        return next.length ? next : current; // never hide the last line
      }
      // Preserve wear order (FN→BS) when re-adding.
      const order = variants.map(v => v.marketHashName);
      return [...current, mhn].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    });
    setChartHover(null);
  };

  const pnlColor = Number.isFinite(item.pnl) && item.pnl >= 0 ? 'var(--green)' : 'var(--red)';
  const totalBasis = item.totalBasis ?? (Number.isFinite(item.basis) ? item.basis * item.qty : null);
  const tradableQty = Number.isFinite(item.tradableQty) ? item.tradableQty : (item.tradable ? item.qty : 0);
  // Portfolio holdings (Steam / manual / public profile) keep Buy·Qty·P&L·lock.
  // Market search, ticker, movers, hero, and /item/:slug pages do not.
  const isPortfolioHolding = Boolean(
    item.manualItemId
    || (item.assetid && !/^(slug|catalog|ticker|mover|fallback|hero)-/.test(String(item.assetid)))
  );
  const displayWear = item.wear && item.wear !== 'N/A'
    ? item.wear
    : (parsedActive.wearLabel
      ? parsedActive.wearLabel.split(/[- ]/).map((part) => part[0]).join('').toUpperCase()
      : 'N/A');

  const onMove = (e) => {
    if (!chartRef.current || !chart) return;
    const r = chartRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * chart.w;
    const t = chart.xToTime(px);
    // Snap to the nearest sample of each visible series at that time.
    const rows = chart.series.map((s) => {
      let nearest = s.pts[0];
      let best = Infinity;
      for (const p of s.pts) {
        const d = Math.abs(p.point.t - t);
        if (d < best) { best = d; nearest = p; }
      }
      return { wear: s.wear, wearLabel: s.wearLabel, color: s.color, x: nearest.x, y: nearest.y, point: nearest.point };
    });
    const guideX = rows.length ? rows[0].x : px;
    setChartHover({ x: guideX, date: rows[0]?.point.date, rows });
  };

  return (
    <div style={{ padding: '40px 64px 80px' }}>
      <div className="container">
        <button onClick={onBack} className="btn btn-sm btn-ghost" style={{ marginBottom: 24 }}>{t.item.back}</button>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 24, marginBottom: 24 }}>
          <div className="glass" style={{ padding: 28, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                  <span className="chip chip-accent">TIER {item.tier || '—'} · {item.rarity || 'UNKNOWN'}</span>
                  <span className="chip">{displayWear}</span>
                  <span className="chip">{item.marketable === false ? 'not marketable' : 'marketable'}</span>
                </div>
                <h1 className="display" style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{item.name}</h1>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="eyebrow">{lang === 'ru' ? 'ЦЕНА STEAM' : 'STEAM PRICE'}</div>
                <div className="display" style={{ fontSize: 32, fontWeight: 500, marginTop: 4 }}>{headerPrice}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>
                  {parsedActive.wearLabel || (lang === 'ru' ? 'без качества' : 'no exterior')}{stattrak ? ' · StatTrak™' : ''}
                </div>
              </div>
            </div>

            {item.iconUrl
              ? <div className="item-art" style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', padding: 24 }}>
                  <img
                    src={withSteamImageSize(item.iconUrl, 720, 405)}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      objectFit: 'contain',
                      objectPosition: 'center center',
                      filter: 'drop-shadow(0 24px 42px rgba(0,0,0,0.55))',
                    }}
                  />
                </div>
              : <ItemArt label={item.name} tier={item.tier} style={{ aspectRatio: '16/9' }} />}

            <WearBar wear={item.wear} floatValue={item.floatValue} />

            {hasWear && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="eyebrow">{lang === 'ru' ? 'Качество' : 'Exterior'}</div>
                  {!parsedBase.isSouvenir && (
                    <button
                      onClick={toggleStattrak}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                        background: 'transparent', border: 'none', padding: 0,
                        fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600,
                        color: stattrak ? '#cf6a32' : 'var(--fg-3)',
                      }}
                    >
                      StatTrak™
                      <span style={{
                        width: 30, height: 16, borderRadius: 9, padding: 2, transition: 'all .15s ease',
                        background: stattrak ? '#cf6a32' : 'rgba(255,255,255,0.12)',
                        display: 'inline-flex', justifyContent: stattrak ? 'flex-end' : 'flex-start',
                      }}>
                        <span style={{ width: 12, height: 12, borderRadius: 6, background: '#fff' }} />
                      </span>
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${variants.length}, 1fr)`, gap: 8 }}>
                  {variants.map((v) => {
                    const isActive = v.marketHashName === activeName;
                    const priceText = activeCurrency === 'rub' && Number.isFinite(v.priceRub)
                      ? formatMoney(v.priceRub, { digits: v.priceRub >= 1000 ? 0 : 2, currency: 'rub' })
                      : Number.isFinite(v.price) ? formatMoney(v.price, { digits: 2 })
                      : '—';
                    return (
                      <button
                        key={v.wear}
                        onClick={() => v.exists && setActiveName(v.marketHashName)}
                        disabled={!v.exists}
                        title={v.wearLabel}
                        style={{
                          textAlign: 'center', padding: '8px 4px', borderRadius: 8, cursor: v.exists ? 'pointer' : 'default',
                          background: isActive ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isActive ? (WEAR_COLORS[v.wear] || 'var(--accent)') : 'var(--line)'}`,
                          opacity: v.exists ? 1 : 0.4, transition: 'all .15s ease',
                        }}
                      >
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 700, color: WEAR_COLORS[v.wear] || 'var(--fg-2)' }}>{v.wear}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-1)', marginTop: 4 }}>{priceText}</div>
                      </button>
                    );
                  })}
                </div>
                {variantsState.loading && (
                  <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
                    {lang === 'ru' ? 'обновляю цены качеств…' : 'refreshing exterior prices…'}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isPortfolioHolding ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                { l: t.item.buy, v: formatItemMoney(totalBasis, item.currencyCode) },
                { l: 'Qty', v: item.qty },
                { l: 'P&L', v: `${Number.isFinite(item.pnl) && item.pnl >= 0 ? '+' : ''}${formatUsd(item.pnl)}`, c: pnlColor },
                { l: t.item.tradelock, v: tradableQty === item.qty ? 'open' : (tradableQty > 0 ? 'partial' : 'restricted') },
              ].map((s, i) => (
                <div key={i} className="glass" style={{ padding: 16 }}>
                  <div className="eyebrow">{s.l}</div>
                  <div className="display" style={{ fontSize: 22, fontWeight: 500, marginTop: 8, color: s.c || 'var(--fg-0)' }}>{s.v}</div>
                </div>
              ))}
            </div>
            ) : (
            <div className="glass" style={{ padding: 20 }}>
              <div className="eyebrow">{lang === 'ru' ? 'Публичная карточка' : 'Public item page'}</div>
              <div style={{ marginTop: 12, color: 'var(--fg-1)', fontSize: 13, lineHeight: 1.6 }}>
                {lang === 'ru'
                  ? 'Цена, история и предложения маркетплейсов для Counter-Strike 2. Чтобы видеть P&L и себестоимость, откройте предмет из своего портфеля.'
                  : 'Live Counter-Strike 2 price, history, and marketplace offers. Open an item from your portfolio to see P&L and cost basis.'}
              </div>
              {item.marketUrl && (
                <a href={item.marketUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost" style={{ marginTop: 16 }}>
                  {lang === 'ru' ? 'Открыть в Steam Market' : 'Open on Steam Market'} →
                </a>
              )}
            </div>
            )}

            <div className="glass" style={{ padding: 20 }}>
              <div className="eyebrow">{t.item.stickers}</div>
              <div style={{ marginTop: 12, color: 'var(--fg-1)', fontSize: 13, lineHeight: 1.6 }}>
                {item.stickers
                  ? (lang === 'ru'
                    ? `Обнаружено ${item.stickers} строк(и) описания Steam, связанных с наклейками. Для точной оценки наклеек требуется провайдер float/sticker.`
                    : `${item.stickers} sticker-related Steam description line(s) detected. Exact sticker valuation requires a float/sticker provider.`)
                  : (lang === 'ru'
                    ? 'Steam inventory не предоставил данных об оценке наклеек для этого предмета.'
                    : 'Steam inventory endpoint did not expose applied sticker valuation for this item.')}
              </div>
            </div>

            <div className="glass" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="eyebrow">{lang === 'ru' ? 'Цены на площадках' : 'Marketplace prices'}</div>
                {offersState.loading && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
                    {lang === 'ru' ? 'загрузка…' : 'loading…'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(offersState.data?.offers || []).map((offer) => {
                  const meta = MARKETPLACE_META[offer.provider] || { label: offer.label, color: 'var(--accent)' };
                  const priceText = offer.hasPrice
                    ? (activeCurrency === 'rub' && Number.isFinite(offer.priceRub)
                        ? formatMoney(offer.priceRub, { digits: 2, currency: 'rub' })
                        : formatMoney(offer.price, { digits: 2 }))
                    : (lang === 'ru' ? 'смотреть →' : 'view →');
                  return (
                    <a
                      key={offer.provider}
                      href={offer.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="offer-row"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: 10, textDecoration: 'none',
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid var(--line)`, borderLeft: `3px solid ${meta.color}`,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: meta.color }} />
                        <span style={{ color: 'var(--fg-1)', fontSize: 13, fontWeight: 500 }}>{meta.label}</span>
                      </span>
                      <span style={{
                        fontFamily: 'var(--f-mono)', fontSize: 14, fontWeight: 600,
                        color: offer.hasPrice ? 'var(--fg-0)' : 'var(--fg-3)',
                      }}>
                        {priceText}
                      </span>
                    </a>
                  );
                })}
                {!offersState.loading && !(offersState.data?.offers || []).length && (
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
                    {lang === 'ru' ? 'Нет данных по площадкам.' : 'No marketplace data.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="eyebrow">{lang === 'ru' ? 'Медиана цен' : 'Price history'}</div>
              <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
                {multiState.loading
                  ? (lang === 'ru' ? 'загрузка…' : 'loading…')
                  : (lang === 'ru'
                      ? `${chartSeries.length} кач. · ${historyProviders[0] || 'нет данных'}`
                      : `${chartSeries.length} exterior(s) · ${historyProviders[0] || 'no data'}`)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
              {PERIOD_OPTIONS.map(p => (
                <button
                  key={p.key}
                  onClick={() => {
                    setChartHover(null);
                    setPeriod(p.key);
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600,
                    background: period === p.key ? 'var(--accent)' : 'transparent',
                    color: period === p.key ? '#000' : 'var(--fg-2)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {hasWear && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {variants.filter(v => v.exists).map((v) => {
                const shown = chartNames.includes(v.marketHashName);
                const color = WEAR_COLORS[v.wear] || 'var(--accent)';
                return (
                  <button
                    key={v.wear}
                    onClick={() => toggleWearLine(v.marketHashName)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      padding: '4px 10px', borderRadius: 999, border: `1px solid ${shown ? color : 'var(--line)'}`,
                      background: shown ? 'rgba(255,255,255,0.04)' : 'transparent',
                      opacity: shown ? 1 : 0.5, transition: 'all .15s ease',
                    }}
                  >
                    <span style={{ width: 10, height: 3, borderRadius: 2, background: color }} />
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, color: shown ? 'var(--fg-1)' : 'var(--fg-3)' }}>{v.wearLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div ref={chartRef} style={{ position: 'relative', width: '100%', height: 300 }}
               onMouseMove={onMove} onMouseLeave={() => setChartHover(null)}>
            {hasHistory ? (
              <svg viewBox={`0 0 ${chart.w} ${chart.h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                {/* horizontal grid + Y axis labels */}
                {chart.yTicks.map((tick, i) => (
                  <g key={`y-${i}`}>
                    <line x1={chart.padX} x2={chart.w - chart.padXRight} y1={tick.y} y2={tick.y}
                          stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
                    <text x={chart.w - chart.padXRight + 8} y={tick.y + 3}
                          fill="var(--fg-3)" fontFamily="var(--f-mono)" fontSize="10">
                      {tick.label}
                    </text>
                  </g>
                ))}

                {/* X axis labels */}
                {chart.xTicks.map((tick, i) => (
                  <text key={`x-${i}`} x={tick.x} y={chart.h - 6}
                        textAnchor="middle"
                        fill="var(--fg-3)" fontFamily="var(--f-mono)" fontSize="10">
                    {tick.label}
                  </text>
                ))}

                {/* one line per visible quality */}
                {chart.series.map((s) => (
                  <path key={s.wear || s.marketHashName} d={s.d}
                        stroke={s.color}
                        strokeWidth="2"
                        fill="none"
                        strokeLinejoin="round"
                        strokeLinecap="round" />
                ))}

                {chartHover && (
                  <g>
                    <line x1={chartHover.x} x2={chartHover.x}
                          y1={chart.padY} y2={chart.h - chart.padYBottom}
                          stroke="rgba(255,255,255,0.2)" strokeDasharray="2 3" />
                    {chartHover.rows.map((row, i) => (
                      <circle key={i} cx={row.x} cy={row.y} r="4"
                              fill={row.color} stroke="#fff" strokeWidth="1.5" />
                    ))}
                  </g>
                )}
              </svg>
            ) : (
              <div style={{
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                border: '1px dashed var(--line)',
                borderRadius: 12,
                color: 'var(--fg-2)',
                textAlign: 'center',
                padding: 24,
              }}>
                <div>
                  <div className="display" style={{ fontSize: 18, fontWeight: 500 }}>
                    {multiState.loading
                      ? (lang === 'ru' ? 'Загружаю историю...' : 'Loading history...')
                      : (lang === 'ru' ? 'Нет данных для графика' : 'No chart data')}
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
                    {lang === 'ru'
                      ? 'Ни провайдер, ни цена не дали достаточно точек.'
                      : 'Neither the provider nor the live price returned enough points.'}
                  </div>
                </div>
              </div>
            )}
            {chartHover && chart && (
              <div style={{
                position: 'absolute',
                left: `${(chartHover.x / chart.w) * 100}%`,
                top: 8,
                transform: 'translateX(-50%)',
                padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.88)',
                border: '1px solid var(--line-strong)', fontFamily: 'var(--f-mono)', fontSize: 12, whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                <div style={{ color: 'var(--fg-3)', fontSize: 10 }}>{formatHistoryDate(chartHover.date, lang)}</div>
                {chartHover.rows.map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{ width: 8, height: 3, borderRadius: 2, background: row.color }} />
                    {row.wear && <span style={{ color: row.color, fontSize: 11 }}>{row.wear}</span>}
                    <span style={{ color: 'var(--fg-0)' }}>{formatChartMoney(row.point.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// Mirror of the server-side splitter so the UI can build/identify wear variants.
function parseClientName(marketHashName) {
  const name = String(marketHashName || '');
  const isStatTrak = /^StatTrak™\s/.test(name);
  const isSouvenir = /^Souvenir\s/.test(name);
  const wearMatch = name.match(/\s\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i);
  const wearLabel = wearMatch ? wearMatch[1] : null;
  const core = name
    .replace(/^StatTrak™\s/, '')
    .replace(/^Souvenir\s/, '')
    .replace(/\s\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, '');
  return { core, wearLabel, isStatTrak, isSouvenir, hasWear: Boolean(wearLabel) };
}

// Overlay several quality series on a shared time/price axis (Steam-style multi-line chart).
function buildMultiChart(seriesList, currency = 'usd') {
  const w = 1000, h = 300;
  const padX = 16, padXRight = 56, padY = 18, padYBottom = 26;
  const plotW = w - padX - padXRight;
  const plotH = h - padY - padYBottom;

  const allPoints = seriesList.flatMap(s => s.points);
  const prices = allPoints.map(p => p.price);
  const times = allPoints.map(p => p.t);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const span = rawMax - rawMin || Math.max(0.01, rawMax * 0.05);
  const min = Math.max(0, rawMin - span * 0.1);
  const max = rawMax + span * 0.1;
  const range = max - min || 1;
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tRange = tMax - tMin || 1;

  const priceToY = (price) => padY + (1 - (price - min) / range) * plotH;
  const timeToX = (t) => padX + ((t - tMin) / tRange) * plotW;
  const xToTime = (x) => tMin + ((x - padX) / plotW) * tRange;

  const series = seriesList.map((s) => {
    const pts = s.points.map((p) => ({ x: timeToX(p.t), y: priceToY(p.price), point: p }));
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    return { wear: s.wear, wearLabel: s.wearLabel, marketHashName: s.marketHashName, color: s.color, pts, d };
  });

  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => {
    const value = min + (range * i) / yTickCount;
    return { y: priceToY(value), label: formatTickPrice(value, currency) };
  });

  const spanDays = Math.max(1, tRange / 86400000);
  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const t = tMin + (i / (xTickCount - 1)) * tRange;
    return { x: timeToX(t), label: formatTickDate(new Date(t).toISOString().slice(0, 10), spanDays) };
  });

  return {
    w, h, padX, padXRight, padY, padYBottom, plotW, plotH,
    min, max, range, series, yTicks, xTicks,
    priceToY, timeToX, xToTime,
  };
}

function formatTickPrice(value, currency = 'usd') {
  if (!Number.isFinite(value)) return '';
  const cur = String(currency).toLowerCase();
  if (cur === 'rub') {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k ₽`;
    if (value >= 10) return `${value.toFixed(0)} ₽`;
    return `${value.toFixed(2)} ₽`;
  }
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  if (value >= 10) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

function formatTickDate(value, spanDays = 30) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (spanDays > 365) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(date);
  }
  if (spanDays > 60) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  }
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(date);
}

function formatHistoryDate(value, lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

const WEAR_RANGES = [
  { key: 'FN', label: 'Factory New',    min: 0,    max: 0.07, color: '#4ade80' },
  { key: 'MW', label: 'Minimal Wear',   min: 0.07, max: 0.15, color: '#22d3ee' },
  { key: 'FT', label: 'Field-Tested',   min: 0.15, max: 0.38, color: '#facc15' },
  { key: 'WW', label: 'Well-Worn',      min: 0.38, max: 0.45, color: '#fb923c' },
  { key: 'BS', label: 'Battle-Scarred', min: 0.45, max: 1,    color: '#f87171' },
];

const WEAR_ALIAS = {
  'factory new': 0, 'fn': 0,
  'minimal wear': 1, 'mw': 1,
  'field-tested': 2, 'ft': 2,
  'well-worn': 3, 'ww': 3,
  'battle-scarred': 4, 'bs': 4,
};

function WearBar({ wear, floatValue }) {
  const wearNorm = (wear || '').toLowerCase().replace(/[^a-z-]/g, '').trim();
  const rangeIdx = WEAR_ALIAS[wearNorm];
  if (rangeIdx == null && floatValue == null) return null;

  let fv = floatValue;
  if (fv == null && rangeIdx != null) {
    const r = WEAR_RANGES[rangeIdx];
    fv = (r.min + r.max) / 2;
  }
  const pct = Math.min(1, Math.max(0, fv)) * 100;
  const activeRange = WEAR_RANGES.find(r => fv >= r.min && fv < r.max) || WEAR_RANGES[4];

  return (
    <div style={{ marginTop: 24, padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 600,
          color: activeRange.color, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {activeRange.label}
        </div>
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--fg-0)',
          background: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: 6,
        }}>
          {fv.toFixed(9)}
        </div>
      </div>

      <div style={{ position: 'relative', height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
        {WEAR_RANGES.map((r, i) => (
          <div key={i} style={{
            flex: `${(r.max - r.min) * 100} 0 0`,
            background: r.color,
            opacity: r === activeRange ? 1 : 0.25,
            borderRight: i < 4 ? '1px solid rgba(0,0,0,0.5)' : 'none',
          }} />
        ))}
      </div>

      <div style={{ position: 'relative', height: 14, marginTop: -3 }}>
        <div style={{
          position: 'absolute',
          left: `${pct}%`,
          transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderBottom: `6px solid ${activeRange.color}`,
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        {WEAR_RANGES.map((r, i) => (
          <div key={i} style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, color: r === activeRange ? r.color : 'var(--fg-3)',
            textAlign: 'center', flex: `${(r.max - r.min) * 100} 0 0`,
            fontWeight: r === activeRange ? 700 : 400,
          }}>
            {r.key}
          </div>
        ))}
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div style={{ color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10 }}>{label}</div>
      <div style={{ color: 'var(--fg-1)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

Object.assign(window, { ItemDetail });
