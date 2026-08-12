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

  // Keep the chart focused on the active quality. Other qualities can be added explicitly
  // from the comparison controls below the chart heading.
  detailUseEffect(() => {
    if (!variantsState.data) return;
    if (variantsState.data.hasWear) {
      const available = variantsState.data.variants.filter(v => v.exists);
      const selected = available.find(v => v.marketHashName === activeName) || available[0];
      setSelectedWears(selected ? [selected.marketHashName] : []);
    } else {
      setSelectedWears([activeName].filter(Boolean));
    }
  }, [variantsState.data, activeName]);

  const chartNames = (selectedWears && selectedWears.length) ? selectedWears : [activeName].filter(Boolean);
  const multiState = useMultiWearHistory(chartNames, fetchDays, activeCurrency);

  if (loading) {
    return (
      <div className="item-detail-state">
        <div className="container">
          <div className="glass item-detail-state-card">
            <button onClick={onBack} className="btn btn-sm btn-ghost">{t.item.back}</button>
            <h1 className="display">{lang === 'ru' ? 'Загружаем предмет...' : 'Loading item...'}</h1>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="item-detail-state">
        <div className="container">
          <div className="glass item-detail-state-card">
            <button onClick={onBack} className="btn btn-sm btn-ghost">{t.item.back}</button>
            <h1 className="display">{lang === 'ru' ? 'Предмет не найден' : 'Item not found'}</h1>
            <p>
              {lang === 'ru' ? 'Проверьте ссылку или откройте предмет из маркета или портфеля.' : 'Check the URL or open an item from the market or portfolio.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="item-detail-state">
        <div className="container">
          <div className="glass item-detail-state-card">
            <button onClick={onBack} className="btn btn-sm btn-ghost">{t.item.back}</button>
            <h1 className="display">{lang === 'ru' ? 'Предмет не выбран' : 'No item selected'}</h1>
            <p>
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
  const totalBasisOriginal = Number.isFinite(item.totalBasisOriginal)
    ? item.totalBasisOriginal
    : (Number.isFinite(item.basisOriginal) ? item.basisOriginal * (item.qty || 1) : null);
  // Prefer the exact amount the user typed (e.g. 1860₽ × 10) over USD basis re-converted
  // through the live FX rate, which invents figures like ~23k₽.
  const buyCostLabel = item.hasBasis && item.basisCurrency === 'rub' && Number.isFinite(totalBasisOriginal)
    ? formatMoney(totalBasisOriginal, { currency: 'rub' })
    : item.hasBasis && item.basisCurrency === 'usd' && Number.isFinite(totalBasisOriginal)
      ? formatMoney(totalBasisOriginal, { currency: 'usd' })
      : formatUsd(totalBasis);
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
  const offers = offersState.data?.offers || [];
  const offerValue = (offer) => activeCurrency === 'rub'
    ? (Number.isFinite(offer.priceRub) ? offer.priceRub : null)
    : offer.price;
  const bestOffer = offers
    .filter(offer => offer.hasPrice && Number.isFinite(offerValue(offer)))
    .reduce((best, offer) => !best || offerValue(offer) < offerValue(best) ? offer : best, null);
  const primaryUrl = bestOffer?.url || item.marketUrl || null;
  const primaryLabel = bestOffer
    ? `${lang === 'ru' ? 'Лучшая цена на' : 'Best price at'} ${(MARKETPLACE_META[bestOffer.provider] || {}).label || bestOffer.label}`
    : (lang === 'ru' ? 'Открыть в Steam Market' : 'Open on Steam Market');

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
    <main className="item-detail-page">
      <div className="container">
        <button onClick={onBack} className="btn btn-sm btn-ghost item-detail-back">{t.item.back}</button>

        <header className="item-detail-head">
          <div>
            <div className="item-detail-tags">
              <span className="chip chip-accent">{lang === 'ru' ? 'УРОВЕНЬ' : 'TIER'} {item.tier || '—'} · {item.rarity || (lang === 'ru' ? 'НЕИЗВЕСТНО' : 'UNKNOWN')}</span>
              <span className="chip">{displayWear}</span>
              <span className="chip">{item.marketable === false ? (lang === 'ru' ? 'не продаётся' : 'not marketable') : (lang === 'ru' ? 'продаётся' : 'marketable')}</span>
            </div>
            <h1 className="display item-detail-title">{item.name}</h1>
            <p className="item-detail-subtitle">
              {parsedActive.wearLabel || (lang === 'ru' ? 'Без качества' : 'No exterior')}{stattrak ? ' · StatTrak™' : ''}
            </p>
          </div>
        </header>

        <div className="item-detail-primary-grid">
          <section className={`glass item-detail-visual${!parsedBase.hasWear ? ' item-detail-visual--compact' : ''}`}>
            {item.iconUrl
              ? <div className="item-art item-detail-art">
                  <img src={withSteamImageSize(item.iconUrl, 720, 405)} alt={item.name} />
                </div>
              : <ItemArt label={item.name} tier={item.tier} style={{ aspectRatio: parsedBase.hasWear ? '16/10' : '1/1' }} />}
            <WearBar wear={item.wear} floatValue={item.floatValue} />
          </section>

          <aside className="item-detail-decision">
            <section className="glass item-detail-price-card">
              <div className="item-detail-price-head">
                <div>
                  <div className="eyebrow">{lang === 'ru' ? 'ТЕКУЩАЯ ЦЕНА STEAM' : 'CURRENT STEAM PRICE'}</div>
                  <div className="display item-detail-price">{headerPrice}</div>
                </div>
                <span className="item-detail-live"><span className="live-dot" /> live</span>
              </div>
              {primaryUrl && (
                <a href={primaryUrl} target="_blank" rel="noreferrer" className="btn btn-primary item-detail-primary-action">
                  {primaryLabel} <span>↗</span>
                </a>
              )}
            </section>

            {hasWear && (
              <section className="glass item-detail-variants">
                <div className="item-detail-section-head">
                  <div>
                    <div className="eyebrow">{lang === 'ru' ? 'ВЫБЕРИТЕ КАЧЕСТВО' : 'SELECT EXTERIOR'}</div>
                    <p>{lang === 'ru' ? 'Цена и предложения обновятся автоматически' : 'Price and offers update automatically'}</p>
                  </div>
                  {!parsedBase.isSouvenir && (
                    <button onClick={toggleStattrak} className="item-detail-stattrak" data-active={stattrak}>
                      StatTrak™
                      <span><i /></span>
                    </button>
                  )}
                </div>
                <div className="item-detail-variant-grid" style={{ '--variant-count': variants.length }}>
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
                        className="item-detail-variant"
                        data-active={isActive}
                        style={{ '--wear-color': WEAR_COLORS[v.wear] || 'var(--accent)' }}
                      >
                        <strong>{v.wear}</strong>
                        <span>{priceText}</span>
                      </button>
                    );
                  })}
                </div>
                {variantsState.loading && <div className="item-detail-loading">{lang === 'ru' ? 'обновляю цены качеств…' : 'refreshing exterior prices…'}</div>}
              </section>
            )}

            <section className="glass item-detail-offers">
              <div className="item-detail-section-head">
                <div>
                  <div className="eyebrow">{lang === 'ru' ? 'СРАВНЕНИЕ ПЛОЩАДОК' : 'MARKETPLACE COMPARISON'}</div>
                  <p>{lang === 'ru' ? 'Переход откроется в новой вкладке' : 'Links open in a new tab'}</p>
                </div>
                {offersState.loading && <span className="item-detail-loading">{lang === 'ru' ? 'загрузка…' : 'loading…'}</span>}
              </div>
              <div className="item-detail-offer-list">
                {offers.map((offer) => {
                  const meta = MARKETPLACE_META[offer.provider] || { label: offer.label, color: 'var(--accent)' };
                  const isBest = bestOffer?.provider === offer.provider;
                  const priceText = offer.hasPrice
                    ? (activeCurrency === 'rub' && Number.isFinite(offer.priceRub)
                        ? formatMoney(offer.priceRub, { digits: 2, currency: 'rub' })
                        : formatMoney(offer.price, { digits: 2 }))
                    : (lang === 'ru' ? 'смотреть' : 'view');
                  return (
                    <a key={offer.provider} href={offer.url || '#'} target="_blank" rel="noreferrer"
                       className="offer-row item-detail-offer" data-best={isBest}
                       style={{ '--market-color': meta.color }}>
                      <span className="item-detail-offer-name">
                        <i />
                        <span>{meta.label}</span>
                        {isBest && <b>{lang === 'ru' ? 'ЛУЧШАЯ' : 'BEST'}</b>}
                      </span>
                      <span className="item-detail-offer-price">{priceText} <i>↗</i></span>
                    </a>
                  );
                })}
                {!offersState.loading && !offers.length && <div className="item-detail-empty">{lang === 'ru' ? 'Нет данных по площадкам.' : 'No marketplace data.'}</div>}
              </div>
            </section>
          </aside>

          <section className="glass item-detail-chart-card">
            <div className="item-detail-chart-head">
              <div>
                <div className="eyebrow">{lang === 'ru' ? 'Медиана цен' : 'Price history'}</div>
                <div className="item-detail-chart-meta">
                  {multiState.loading
                    ? (lang === 'ru' ? 'загрузка…' : 'loading…')
                    : (lang === 'ru'
                        ? `${chartSeries.length} кач. · ${historyProviders[0] || 'нет данных'}`
                        : `${chartSeries.length} exterior(s) · ${historyProviders[0] || 'no data'}`)}
                </div>
              </div>
              <div className="item-detail-periods">
                {PERIOD_OPTIONS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setChartHover(null);
                      setPeriod(p.key);
                    }}
                    data-active={period === p.key}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {hasWear && (
              <div className="item-detail-compare">
                <span>{lang === 'ru' ? 'Сравнить:' : 'Compare:'}</span>
                {variants.filter(v => v.exists).map((v) => {
                  const shown = chartNames.includes(v.marketHashName);
                  const color = WEAR_COLORS[v.wear] || 'var(--accent)';
                  return (
                    <button
                      key={v.wear}
                      onClick={() => toggleWearLine(v.marketHashName)}
                      data-active={shown}
                      style={{ '--wear-color': color }}
                    >
                      <i />
                      <span>{v.wear}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div ref={chartRef} className="item-detail-chart"
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
          </section>
        </div>

        {isPortfolioHolding && (
          <section className="item-detail-holdings">
            {[
              { l: t.item.buy, v: buyCostLabel },
              { l: lang === 'ru' ? 'Количество' : 'Quantity', v: item.qty },
              { l: 'P&L', v: `${Number.isFinite(item.pnl) && item.pnl >= 0 ? '+' : ''}${formatUsd(item.pnl)}`, c: pnlColor },
              { l: t.item.tradelock, v: tradableQty === item.qty ? (lang === 'ru' ? 'открыт' : 'open') : (tradableQty > 0 ? (lang === 'ru' ? 'частично' : 'partial') : (lang === 'ru' ? 'ограничен' : 'restricted')) },
            ].map((s, i) => (
              <div key={i} className="glass item-detail-stat">
                <div className="eyebrow">{s.l}</div>
                <div className="display" style={{ color: s.c || 'var(--fg-0)' }}>{s.v}</div>
              </div>
            ))}
          </section>
        )}

        <details className="glass item-detail-details">
          <summary>
            <span>
              <span className="eyebrow">{lang === 'ru' ? 'ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ' : 'ADDITIONAL DATA'}</span>
              <strong>{t.item.stickers}</strong>
            </span>
            <i>+</i>
          </summary>
          <p>
            {item.stickers
              ? (lang === 'ru'
                ? `Обнаружено ${item.stickers} строк(и) описания Steam, связанных с наклейками. Для точной оценки наклеек требуется провайдер float/sticker.`
                : `${item.stickers} sticker-related Steam description line(s) detected. Exact sticker valuation requires a float/sticker provider.`)
              : (lang === 'ru'
                ? 'Steam inventory не предоставил данных об оценке наклеек для этого предмета.'
                : 'Steam inventory endpoint did not expose applied sticker valuation for this item.')}
          </p>
        </details>
      </div>
    </main>
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
