/* global React */
const { useState: detailUseState, useRef: detailUseRef, useCallback: detailUseCallback } = React;

/* ───────────────────────────────────────────────────
   ITEM DETAIL — API backed
   ─────────────────────────────────────────────────── */

function ItemDetail({ lang, item, onBack }) {
  const t = useT(lang);
  const PERIOD_OPTIONS = [
    { key: '1d',  days: 1,   label: lang === 'ru' ? 'День' : '1D' },
    { key: '7d',  days: 7,   label: lang === 'ru' ? 'Неделя' : '7D' },
    { key: '30d', days: 30,  label: '30D' },
    { key: 'all', days: 365, label: lang === 'ru' ? 'Всё время' : 'All' },
  ];
  const [period, setPeriod] = detailUseState('30d');
  const activePeriod = PERIOD_OPTIONS.find(p => p.key === period) || PERIOD_OPTIONS[2];
  const historyState = useItemHistory(item?.marketHashName, 365);
  const [chartHover, setChartHover] = detailUseState(null);
  const chartRef = detailUseRef(null);

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

  const rawHistory = historyState.data?.data || [];
  const cutoff = activePeriod.days < 365 ? Date.now() - activePeriod.days * 86400000 : 0;
  const filteredHistory = rawHistory
    .filter(p => !cutoff || (new Date(p.date).getTime() >= cutoff))
    .map(p => p.price)
    .filter(Number.isFinite);
  const history = filteredHistory.length ? filteredHistory : null;
  const chartData = history?.length > 1 ? history : item.spark || [item.value || 0, item.value || 0];
  const chart = buildChart(chartData);
  const pnlColor = item.pnl >= 0 ? 'var(--green)' : 'var(--red)';
  const totalValue = item.totalValue ?? (item.value != null ? item.value * item.qty : null);
  const totalBasis = item.totalBasis ?? (item.basis * item.qty);
  const stackCount = item.assetIds?.length || 1;
  const tradableQty = Number.isFinite(item.tradableQty) ? item.tradableQty : (item.tradable ? item.qty : 0);
  const assetLabel = item.assetIds?.length > 1
    ? `${item.assetIds.length} merged stacks`
    : `asset ${item.assetid}`;

  const onMove = (e) => {
    if (!chartRef.current) return;
    const r = chartRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * chart.w;
    const idx = Math.min(chartData.length - 1, Math.max(0, Math.round((x / chart.w) * (chartData.length - 1))));
    setChartHover({ idx, x: chart.pts[idx][0], y: chart.pts[idx][1], v: chartData[idx] });
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
                  <span className="chip chip-accent">TIER {item.tier} · {item.rarity || 'UNKNOWN'}</span>
                  <span className="chip">{item.wear || 'N/A'}</span>
                  <span className="chip">{item.marketable ? 'marketable' : 'not marketable'}</span>
                </div>
                <h1 className="display" style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{item.name}</h1>
                <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
                  {assetLabel} · {item.marketHashName}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="eyebrow">VALUE</div>
                <div className="display" style={{ fontSize: 32, fontWeight: 500, marginTop: 4 }}>{formatUsd(totalValue)}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: pnlColor, marginTop: 4 }}>
                  {item.pnl >= 0 ? '+' : ''}{formatUsd(item.pnl)} ({item.pnlPct >= 0 ? '+' : ''}{item.pnlPct.toFixed(2)}%) · {item.qty} pcs
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
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                { l: t.item.buy, v: formatItemMoney(totalBasis, item.currencyCode), s: `${formatItemMoney(item.basis, item.currencyCode)} each · local .data/portfolio.json` },
                { l: 'Qty', v: item.qty, s: `${stackCount} Steam stack(s)` },
                { l: 'P&L', v: `${item.pnl >= 0 ? '+' : ''}${formatUsd(item.pnl)}`, s: `${item.pnlPct >= 0 ? '+' : ''}${item.pnlPct.toFixed(2)}%`, c: pnlColor },
                { l: t.item.tradelock, v: tradableQty === item.qty ? 'open' : (tradableQty > 0 ? 'partial' : 'restricted'), s: `${tradableQty}/${item.qty} available by Steam flag` },
              ].map((s, i) => (
                <div key={i} className="glass" style={{ padding: 16 }}>
                  <div className="eyebrow">{s.l}</div>
                  <div className="display" style={{ fontSize: 22, fontWeight: 500, marginTop: 8, color: s.c || 'var(--fg-0)' }}>{s.v}</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>{s.s}</div>
                </div>
              ))}
            </div>

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

            <div style={{ display: 'flex', gap: 10 }}>
              <a className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} href={item.marketUrl || '#'} target="_blank" rel="noreferrer">Open Steam Market</a>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>Add to watchlist</button>
            </div>
          </div>
        </div>

        <div className="glass" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div className="eyebrow">{t.item.history}</div>
              <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
                {historyState.data?.provider === 'take.skin'
                  ? `${activePeriod.days}${lang === 'ru' ? 'д' : 'd'} · Take.Skin · USD`
                  : (lang === 'ru' ? 'локальный спарклайн' : 'local sparkline fallback')}
                {historyState.loading && (lang === 'ru' ? ' · загрузка…' : ' · loading…')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
                {PERIOD_OPTIONS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
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
              <Legend dot="var(--accent)" label={lang === 'ru' ? 'Медиана' : 'Median listing'} />
              <Legend dot="var(--cyan)" label={lang === 'ru' ? 'Базис' : 'Cost basis'} />
            </div>
          </div>
          <div ref={chartRef} style={{ position: 'relative', width: '100%', height: 280 }}
               onMouseMove={onMove} onMouseLeave={() => setChartHover(null)}>
            <svg viewBox={`0 0 ${chart.w} ${chart.h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="itemFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.68 0.22 5)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="oklch(0.68 0.22 5)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((p, i) => (
                <line key={i} x1="0" x2={chart.w} y1={p * chart.h} y2={p * chart.h} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
              ))}
              <path d={chart.area} fill="url(#itemFill)" />
              <path d={chart.d} stroke="oklch(0.78 0.18 5)" strokeWidth="2" fill="none" strokeLinejoin="round" />
              {Number.isFinite(item.basis) && chart.range > 0 && (
                <line x1="0" x2={chart.w} y1={chart.h - ((item.basis - chart.min) / chart.range) * (chart.h - 40) - 20} y2={chart.h - ((item.basis - chart.min) / chart.range) * (chart.h - 40) - 20}
                      stroke="oklch(0.78 0.14 210)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
              )}
              {chartHover && (
                <g>
                  <line x1={chartHover.x} x2={chartHover.x} y1="0" y2={chart.h} stroke="rgba(255,255,255,0.2)" strokeDasharray="2 3" />
                  <circle cx={chartHover.x} cy={chartHover.y} r="5" fill="oklch(0.68 0.22 5)" stroke="#fff" strokeWidth="1.5" />
                </g>
              )}
            </svg>
            {chartHover && (
              <div style={{
                position: 'absolute', left: `${(chartHover.x / chart.w) * 100}%`, top: 12, transform: 'translateX(-50%)',
                padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.85)',
                border: '1px solid var(--line-strong)', fontFamily: 'var(--f-mono)', fontSize: 12, whiteSpace: 'nowrap',
              }}>
                <div style={{ color: 'var(--fg-3)', fontSize: 10 }}>point {chartHover.idx + 1}</div>
                <div style={{ color: 'var(--fg-0)', marginTop: 2 }}>{formatUsd(chartHover.v)}</div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function buildChart(data) {
  const safeData = Array.isArray(data) && data.length > 1 ? data : [0, 0];
  const w = 1000, h = 280;
  const min = Math.min(...safeData) * 0.99;
  const max = Math.max(...safeData) * 1.01;
  const range = max - min || 1;
  const pts = safeData.map((v, i) => [(i / (safeData.length - 1)) * w, h - ((v - min) / range) * (h - 40) - 20]);
  const d = pts.map((p, i) => i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`).join(' ');
  return { w, h, min, max, range, pts, d, area: `${d} L ${w} ${h} L 0 ${h} Z` };
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

function Legend({ dot, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: dot }}></span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{label}</span>
    </div>
  );
}

Object.assign(window, { ItemDetail });
