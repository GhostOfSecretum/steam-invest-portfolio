/* global React, useT, usePortfolio, useFavoriteProfiles, compactUsd, formatMoney, formatUsd */
const { useState, useRef, useMemo, useEffect } = React;

/* ───────────────────────────────────────────────────
   PORTFOLIO DASHBOARD — API backed
   ─────────────────────────────────────────────────── */

function PortfolioChart({ history, range, lang }) {
  const sourcePoints = Array.isArray(history)
    ? history.map((value, index) => ({ date: String(index + 1), value }))
    : (Array.isArray(history?.points) ? history.points : []);
  const safeData = filterHistoryPoints(sourcePoints, range);
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const w = 1000, h = 280;
  const values = safeData.map((point) => Number(point.value)).filter((value) => Number.isFinite(value));
  const hasRealLine = values.length > 1;
  const chartValues = hasRealLine ? values : [0, Math.max(1, values[0] || 0)];
  const min = Math.min(...chartValues) * 0.98, max = Math.max(...chartValues) * 1.02;
  const yRange = max - min || 1;
  const pts = chartValues.map((v, i) => [(i / (chartValues.length - 1)) * w, h - ((v - min) / yRange) * (h - 40) - 20]);
  const d = pts.map((p, i) => i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`).join(' ');
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;

  const onMove = (e) => {
    if (!ref.current || !hasRealLine) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * w;
    const idx = Math.min(safeData.length - 1, Math.max(0, Math.round((x / w) * (safeData.length - 1))));
    setHover({ idx, x: pts[idx][0], y: pts[idx][1], point: safeData[idx] });
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: 280 }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.68 0.22 5)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="oklch(0.68 0.22 5)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="chartLine" x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.18 5)" />
            <stop offset="100%" stopColor="oklch(0.6 0.22 5)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1="0" x2={w} y1={p * h} y2={p * h} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="2 4" />
        ))}
        {hasRealLine && <path d={area} fill="url(#chartFill)" />}
        {hasRealLine && <path d={d} stroke="url(#chartLine)" strokeWidth="2" fill="none" strokeLinejoin="round" />}
        {!hasRealLine && (
          <text x={w / 2} y={h / 2} textAnchor="middle" fill="rgba(255,255,255,0.45)" style={{ fontFamily: 'var(--f-mono)', fontSize: 28 }}>
            {lang === 'ru' ? 'недостаточно истории цен' : 'not enough price history'}
          </text>
        )}
        {hover && hasRealLine && (
          <g>
            <line x1={hover.x} x2={hover.x} y1="0" y2={h} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={hover.x} cy={hover.y} r="5" fill="oklch(0.68 0.22 5)" stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {hover && hasRealLine && (
        <div style={{
          position: 'absolute', left: `${(hover.x / w) * 100}%`, top: 12, transform: 'translateX(-50%)',
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(0,0,0,0.85)', border: '1px solid var(--line-strong)',
          fontFamily: 'var(--f-mono)', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          <div style={{ color: 'var(--fg-3)', fontSize: 10 }}>{formatHistoryDate(hover.point.date)}</div>
          <div style={{ color: 'var(--fg-0)', marginTop: 2 }}>{formatUsd(hover.point.value, 0)}</div>
        </div>
      )}
    </div>
  );
}

function filterHistoryPoints(points, range) {
  const clean = (Array.isArray(points) ? points : [])
    .map((point) => ({
      date: point.date,
      value: Number(point.value),
    }))
    .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!clean.length || range === 'ALL') return clean;

  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  // Cut relative to today, not the last provider point (providers can lag months).
  const cutoff = Date.now() - days * 86400000;
  const sliced = clean.filter((point) => {
    const time = new Date(point.date).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
  return sliced.length > 1 ? sliced : clean.slice(-Math.max(2, Math.min(days, clean.length)));
}

function formatHistoryDate(date) {
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return String(date || '');
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TrendArrowIcon({ up }) {
  const color = up ? 'var(--green)' : 'var(--red)';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {up ? (
        <path d="M2 11 L5 7 L8 9 L12 4 L14 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M2 5 L5 9 L8 7 L12 12 L14 10" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function PortfolioLeaders({ leaders, lang, onItemClick }) {
  const t = useT(lang);
  const [range, setRange] = useState('30d');
  const limit = 5;

  const ranked = useMemo(() => {
    const rows = (Array.isArray(leaders) ? leaders : [])
      .map((item) => {
        const entry = item?.changes?.[range];
        if (!entry || !Number.isFinite(entry.pct) || !Number.isFinite(entry.change)) return null;
        return {
          marketHashName: item.marketHashName,
          name: item.name || item.marketHashName,
          iconUrl: item.iconUrl || null,
          pct: entry.pct,
          change: entry.change,
        };
      })
      .filter(Boolean);

    return {
      best: rows.filter((row) => row.pct > 0).sort((a, b) => b.pct - a.pct),
      worst: rows.filter((row) => row.pct < 0).sort((a, b) => a.pct - b.pct),
    };
  }, [leaders, range]);

  const renderSection = (kind) => {
    const up = kind === 'best';
    const visible = ranked[kind].slice(0, limit);
    const title = up ? t.dash.bestLeaders : t.dash.worstLeaders;
    const color = up ? 'var(--green)' : 'var(--red)';

    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <TrendArrowIcon up={up} />
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, fontWeight: 500, color: 'var(--fg-0)' }}>{title}</div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 72px 64px',
          gap: 8,
          padding: '0 0 8px',
          fontFamily: 'var(--f-mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-3)',
          borderBottom: '1px solid var(--line)',
        }}>
          <div>{t.dash.trendsItem}</div>
          <div style={{ textAlign: 'right' }}>{t.dash.trendsPercent}</div>
          <div style={{ textAlign: 'right' }}>{t.dash.trendsChange}</div>
        </div>

        {!visible.length ? (
          <div style={{ padding: '14px 0', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
            {t.dash.leadersEmpty}
          </div>
        ) : visible.map((row, index) => (
          <div
            key={`${kind}-${row.marketHashName}`}
            onClick={() => onItemClick && onItemClick(row)}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 72px 64px',
              gap: 8,
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: index < visible.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              cursor: onItemClick ? 'pointer' : 'default',
              background: index % 2 ? 'rgba(255,255,255,0.015)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {row.iconUrl
                ? <img src={row.iconUrl} alt="" style={{ width: 28, height: 20, objectFit: 'contain', flexShrink: 0, borderRadius: 4, background: 'rgba(255,255,255,0.03)' }} />
                : <div style={{ width: 28, height: 20, flexShrink: 0, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />}
              <div style={{
                fontSize: 12,
                color: 'var(--fg-1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }} title={row.name}>{row.name}</div>
            </div>
            <div className="mono" style={{ fontSize: 12, textAlign: 'right', color }}>{`${row.pct >= 0 ? '+' : ''}${row.pct.toFixed(1)}%`}</div>
            <div className="mono" style={{ fontSize: 12, textAlign: 'right', color }}>{`${row.change >= 0 ? '+' : '-'}${compactUsd(Math.abs(row.change))}`}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="glass" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div className="eyebrow">{t.dash.leaders}</div>
          <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
            {t.dash.leadersHint}
          </div>
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          {['7d', '30d', '90d'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              style={{
                padding: '5px 9px',
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                color: range === r ? 'var(--fg-0)' : 'var(--fg-3)',
                background: range === r ? 'rgba(255,255,255,0.06)' : 'transparent',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {renderSection('best')}
      {renderSection('worst')}
    </div>
  );
}

function StatCard({ label, value, delta, deltaColor, sub, accent }) {
  return (
    <div className="glass" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
      {accent && <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: 'var(--accent)' }}></div>}
      <div className="eyebrow">{label}</div>
      <div className="display" style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1 }}>{value}</div>
      {delta && <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 12, color: deltaColor || 'var(--green)' }}>{delta}</div>}
      {sub && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--fg-3)' }}>{sub}</div>}
    </div>
  );
}

function inventorySourceLabel(source, lang) {
  if (source === 'desktop') return lang === 'ru' ? 'desktop · полный инвентарь' : 'desktop · full inventory';
  if (source === 'manual') return lang === 'ru' ? 'ручной ввод' : 'manual input';
  return lang === 'ru' ? 'публичный Steam' : 'public Steam';
}

function allocationLabel(key, lang) {
  if (lang !== 'ru') return key;
  const labels = {
    Knives: 'Ножи',
    Gloves: 'Перчатки',
    Rifles: 'Винтовки',
    Snipers: 'Снайперки',
    SMGs: 'ПП',
    Shotguns: 'Дробовики',
    Machineguns: 'Пулемёты',
    Pistols: 'Пистолеты',
    Agents: 'Агенты',
    Stickers: 'Стикеры',
    Cases: 'Кейсы',
    Capsules: 'Капсулы',
    Graffiti: 'Граффити',
    Patches: 'Патчи',
    Charms: 'Брелоки',
    Music: 'Music Kit',
    Tools: 'Инструменты',
    Other: 'Прочее',
  };
  return labels[key] || key;
}

function DesktopPairingButton({ lang }) {
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/desktop/pairing-code', { method: 'POST' });
      setCode(data.code);
    } catch (err) {
      setCode(null);
      setError(err?.message || (lang === 'ru' ? 'Не удалось создать код' : 'Failed to create code'));
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={generate} disabled={loading}>
        {loading ? '...' : (lang === 'ru' ? 'Код для desktop' : 'Desktop code')}
      </button>
      {code && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--accent)', letterSpacing: '0.15em' }}>{code}</span>}
      {error && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--red, #ef4444)' }}>{error}</span>}
    </div>
  );
}

function Dashboard({ lang, onItemClick, auth, publicProfileUrl = '', onPublicProfile }) {
  const t = useT(lang);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(null);
  const effectivePortfolioId = publicProfileUrl || String(selectedPortfolioId || '').startsWith('public-')
    ? null
    : selectedPortfolioId;
  const portfolio = usePortfolio(auth, effectivePortfolioId, publicProfileUrl);
  const favorites = useFavoriteProfiles();
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState(null);
  const [range, setRange] = useState('30d');
  const [query, setQuery] = useState('');
  const prevConnectedRef = useRef(null);
  const data = portfolio.data;
  const items = data?.items || [];
  const portfolios = data?.portfolios || [];
  const activePortfolioId = data?.portfolioId || effectivePortfolioId;
  const isSteamPortfolio = data?.portfolioType === 'steam';
  const isPublicPortfolio = Boolean(publicProfileUrl);
  const publicSteamId = data?.profile?.steamId && /^\d{17}$/.test(String(data.profile.steamId))
    ? String(data.profile.steamId)
    : null;
  const isFavorited = Boolean(publicSteamId && favorites.isFavorite(publicSteamId));
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.marketHashName.toLowerCase().includes(needle));
  }, [items, query]);

  useEffect(() => {
    if (publicProfileUrl) {
      if (selectedPortfolioId) setSelectedPortfolioId(null);
      return;
    }
    if (!selectedPortfolioId && data?.portfolioId) setSelectedPortfolioId(data.portfolioId);
  }, [data?.portfolioId, publicProfileUrl, selectedPortfolioId]);

  // After a successful Steam OpenID login, land on the Steam inventory — not the last manual portfolio.
  useEffect(() => {
    if (auth?.loading) return;
    const connected = Boolean(auth?.connected);
    if (prevConnectedRef.current === false && connected && !publicProfileUrl) {
      setSelectedPortfolioId('steam');
    }
    prevConnectedRef.current = connected;
  }, [auth?.connected, auth?.loading, publicProfileUrl]);

  if (portfolio.loading && !portfolio.data) {
    return <DashboardState lang={lang} title={t.dash.title} loading message={lang === 'ru' ? 'Загружаем портфель и цены...' : 'Loading portfolio and prices...'} />;
  }

  if (portfolio.error) {
    return <DashboardState lang={lang} title={t.dash.title} error={portfolio.error} onRetry={() => portfolio.reload(true)} />;
  }

  if (!data) return null;

  const toggleFavorite = async () => {
    if (!isPublicPortfolio || favoriteBusy) return;
    setFavoriteBusy(true);
    setFavoriteError(null);
    try {
      if (isFavorited && publicSteamId) {
        await favorites.remove(publicSteamId);
      } else {
        await favorites.add({
          profileUrl: publicProfileUrl || data.profile?.profileurl || publicSteamId,
          steamId: publicSteamId,
        });
      }
    } catch (error) {
      setFavoriteError(error?.message || (lang === 'ru' ? 'Не удалось обновить избранное' : 'Failed to update favorites'));
    } finally {
      setFavoriteBusy(false);
    }
  };

  const pnlColor = data.pnl >= 0 ? 'var(--green)' : 'var(--red)';
  const marketableQty = items.reduce((sum, item) => sum + (Number(item.marketableQty) || 0), 0);
  const marketableValue = items.reduce((sum, item) => {
    const unitValue = Number.isFinite(item.value) ? item.value : 0;
    return sum + unitValue * (Number(item.marketableQty) || 0);
  }, 0);
  const notMarketableQty = Math.max(0, data.totalInventoryCount - marketableQty);
  const valueRows = items
    .map((item) => ({
      name: item.name || item.marketHashName || 'Unknown item',
      value: Number.isFinite(item.totalValue) ? item.totalValue : 0,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const topItem = valueRows[0];
  const topItemPct = topItem && data.totalValue > 0 ? (topItem.value / data.totalValue) * 100 : 0;
  const topFiveValue = valueRows.slice(0, 5).reduce((sum, item) => sum + item.value, 0);
  const topFivePct = data.totalValue > 0 ? (topFiveValue / data.totalValue) * 100 : 0;
  const historyMeta = data.history && !Array.isArray(data.history) ? data.history : {};
  const historySources = Array.isArray(historyMeta.sources) && historyMeta.sources.length
    ? historyMeta.sources.join(' + ')
    : (lang === 'ru' ? 'нет истории' : 'no history');
  const historySubtitle = lang === 'ru'
    ? `USD · реальные price history · покрытие ${historyMeta.coveragePct || 0}% · ${historySources}`
    : `USD · real price history · ${historyMeta.coveragePct || 0}% coverage · ${historySources}`;

  return (
    <div style={{ padding: '40px 64px 80px' }}>
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--accent)' }}>
              // PORTFOLIO · {data.totalInventoryCount} ITEMS · {data.uniqueInventoryCount} UNIQUE
            </div>
            <h1 className="display" style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em' }}>{t.dash.title}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isPublicPortfolio && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--cyan)' }}>● public</span>}
            {!isPublicPortfolio && data.desktopConnected && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--green)' }}>● desktop</span>}
            {!isPublicPortfolio && auth?.connected && <DesktopPairingButton lang={lang} />}
            {isPublicPortfolio && (
              <button
                className={`btn btn-sm ${isFavorited ? 'btn-ghost' : 'btn-primary'}`}
                onClick={toggleFavorite}
                disabled={favoriteBusy || favorites.loading}
                title={lang === 'ru' ? 'Сохранить профиль в избранное' : 'Save profile to favorites'}
              >
                {favoriteBusy
                  ? '...'
                  : isFavorited
                    ? (lang === 'ru' ? 'В избранном' : 'Favorited')
                    : (lang === 'ru' ? 'В избранное' : 'Add to favorites')}
              </button>
            )}
          </div>
        </div>
        {favoriteError && (
          <div style={{ marginBottom: 16, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--red)' }}>{favoriteError}</div>
        )}

        {!isPublicPortfolio && (
          <PortfolioControls
            lang={lang}
            auth={auth}
            portfolios={portfolios}
            activePortfolioId={activePortfolioId}
            portfolioType={data.portfolioType}
            onSelect={(id) => setSelectedPortfolioId(id)}
            onChanged={(id) => {
              if (id) setSelectedPortfolioId(id);
              portfolio.reload(false);
            }}
            onPublicProfile={onPublicProfile}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <StatCard accent label={t.dash.total} value={compactUsd(data.totalValue)} delta={`${data.pricedCount}/${data.totalInventoryCount} priced`} sub={`${data.uniqueInventoryCount} unique rows`} />
          <StatCard label={t.dash.pnl} value={`${data.pnl >= 0 ? '+' : ''}${compactUsd(data.pnl)}`} delta={`${data.pnlPct.toFixed(2)}% all-time`} deltaColor={pnlColor} sub={`Cost basis ${compactUsd(data.totalBasis)}`} />
          <StatCard
            label={lang === 'ru' ? 'ДОСТУПНО К ПРОДАЖЕ' : 'SELLABLE NOW'}
            value={compactUsd(marketableValue)}
            delta={`${marketableQty}/${data.totalInventoryCount} marketable`}
            deltaColor="var(--cyan)"
            sub={`${notMarketableQty} locked or storage`}
          />
          <StatCard
            label={lang === 'ru' ? 'КОНЦЕНТРАЦИЯ' : 'CONCENTRATION'}
            value={topItem ? `${topItemPct.toFixed(0)}%` : '0%'}
            delta={topItem ? topItem.name : 'No priced items'}
            deltaColor="var(--amber)"
            sub={`Top 5 = ${topFivePct.toFixed(0)}% of portfolio`}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1.25fr) minmax(200px, 0.9fr)', gap: 12, marginBottom: 24 }}>
          <div className="glass" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="eyebrow">VALUE OVER TIME</div>
                <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{historySubtitle}</div>
              </div>
              <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
                {['7d', '30d', '90d', 'ALL'].map(r => (
                  <button key={r} onClick={() => setRange(r)} style={{
                    padding: '6px 12px', fontFamily: 'var(--f-mono)', fontSize: 11,
                    color: range === r ? 'var(--fg-0)' : 'var(--fg-3)',
                    background: range === r ? 'rgba(255,255,255,0.06)' : 'transparent',
                  }}>{r}</button>
                ))}
              </div>
            </div>
            <PortfolioChart history={data.history} range={range} lang={lang} />
          </div>

          <PortfolioLeaders
            leaders={data.leaders}
            lang={lang}
            onItemClick={(row) => {
              const match = items.find((item) => item.marketHashName === row.marketHashName);
              if (match && onItemClick) onItemClick(match);
            }}
          />

          <div className="glass" style={{ padding: 24 }}>
            <div className="eyebrow">{t.dash.breakdown}</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(data.allocation || []).length === 0 ? (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
                  {lang === 'ru' ? 'Нет оценённых предметов' : 'No priced items'}
                </div>
              ) : (data.allocation || []).map((b, i) => (
                <div key={`${b.l}-${i}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--fg-1)' }}>{allocationLabel(b.l, lang)}</span>
                    <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--fg-2)' }}>{compactUsd(b.v)} · {b.p}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, b.p))}%`, height: '100%', background: b.c, borderRadius: 3, opacity: 0.85 }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
              {filteredItems.length}/{items.length} · {data.totalInventoryCount} {lang === 'ru' ? 'шт.' : 'items'}
              {data.storageItemCount > 0 && (
                <span> · {lang === 'ru' ? `хранилище ${data.storageItemCount}` : `storage ${data.storageItemCount}`}</span>
              )}
              <span style={{ color: 'var(--fg-3)', opacity: 0.7 }}> · {inventorySourceLabel(data.inventoryProvider, lang)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => downloadPortfolioCsv(items)}
                title={lang === 'ru' ? 'Экспорт CSV' : 'Export CSV'}
              >
                CSV
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => portfolio.reload(isSteamPortfolio || isPublicPortfolio)}
                title={lang === 'ru'
                  ? `Обновить · ${new Date(data.syncedAt).toLocaleString()}`
                  : `Refresh · ${new Date(data.syncedAt).toLocaleString()}`}
              >
                {portfolio.loading ? '...' : ((isSteamPortfolio || isPublicPortfolio) ? 'Sync' : 'Refresh')}
              </button>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={lang === 'ru' ? 'Поиск...' : 'Search...'} style={{
                padding: '6px 12px', borderRadius: 7, fontSize: 12,
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', color: 'var(--fg-0)',
                fontFamily: 'var(--f-body)', outline: 'none', width: 200,
              }} />
            </div>
          </div>

          <InventoryTable
            items={filteredItems}
            onItemClick={onItemClick}
            lang={lang}
            portfolioId={activePortfolioId}
            portfolioType={data.portfolioType}
            onBasisSaved={() => portfolio.reload(false)}
            onItemDeleted={() => portfolio.reload(false)}
          />
        </div>

        <div className="glass" style={{ padding: 20 }}>
          <div className="eyebrow">{t.dash.activity}</div>
          <ActivityTable
            activity={data.activity}
            portfolioType={data.portfolioType}
            lang={lang}
          />
        </div>
      </div>
    </div>
  );
}

function activityKindLabel(kind, lang) {
  const ru = {
    added: 'Купил / добавлен',
    removed: 'Удалён',
    qty_up: 'Кол-во +',
    qty_down: 'Кол-во −',
    updated: 'Изменён',
  };
  const en = {
    added: 'Added',
    removed: 'Removed',
    qty_up: 'Qty +',
    qty_down: 'Qty −',
    updated: 'Updated',
  };
  return (lang === 'ru' ? ru : en)[kind] || kind;
}

function ActivityTable({ activity, portfolioType, lang }) {
  const rows = (Array.isArray(activity) ? activity : []).filter((row) => row && row.kind && row.at);
  const isManual = portfolioType === 'manual';

  if (!rows.length) {
    const empty = isManual
      ? (lang === 'ru' ? 'Пока нет покупок' : 'No purchases yet')
      : (lang === 'ru'
        ? 'Изменения появятся после следующего синка с другим составом инвентаря'
        : 'Changes will appear after the next sync with a different inventory');
    return (
      <div style={{ marginTop: 14, fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--fg-3)' }}>
        {empty}
      </div>
    );
  }

  const headerStyle = {
    fontFamily: 'var(--f-mono)',
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--fg-3)',
    padding: '0 0 10px',
    borderBottom: '1px solid var(--line)',
  };
  const cellStyle = {
    padding: '10px 0',
    borderBottom: '1px solid var(--line)',
    fontSize: 12,
    verticalAlign: 'top',
  };

  return (
    <div style={{ marginTop: 14, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isManual ? 560 : 480 }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'left' }}>{lang === 'ru' ? 'Дата' : 'Date'}</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>{lang === 'ru' ? 'Действие' : 'Action'}</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>{lang === 'ru' ? 'Предмет' : 'Item'}</th>
            <th style={{ ...headerStyle, textAlign: 'right' }}>{lang === 'ru' ? 'Кол-во' : 'Qty'}</th>
            {isManual && (
              <th style={{ ...headerStyle, textAlign: 'right' }}>{lang === 'ru' ? 'Цена/шт.' : 'Basis'}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const kindColor = row.kind === 'removed' || row.kind === 'qty_down'
              ? 'var(--red)'
              : (row.kind === 'added' || row.kind === 'qty_up' ? 'var(--green)' : 'var(--fg-1)');
            const qtyLabel = Number.isFinite(row.qtyDelta) && row.qtyDelta !== 0
              ? `${row.qtyDelta > 0 ? '+' : ''}${row.qtyDelta}`
              : (Number.isFinite(row.qtyAfter) ? String(row.qtyAfter) : '—');
            const basisLabel = Number.isFinite(row.basisPerUnit)
              ? formatMoney(row.basisPerUnit, { currency: row.currency === 'rub' || row.currency === 'rur' ? 'rub' : 'usd', digits: 2 })
              : '—';
            return (
              <tr key={row.id || `${row.at}-${row.marketHashName}-${row.kind}`}>
                <td style={{ ...cellStyle, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                  {new Date(row.at).toLocaleString()}
                </td>
                <td style={{ ...cellStyle, color: kindColor, fontFamily: 'var(--f-mono)', fontSize: 11 }}>
                  {activityKindLabel(row.kind, lang)}
                </td>
                <td style={{ ...cellStyle, color: 'var(--fg-1)', maxWidth: 360 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.marketHashName || row.name}>
                    {row.name || row.marketHashName || '—'}
                  </div>
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--f-mono)', color: kindColor }}>
                  {qtyLabel}
                </td>
                {isManual && (
                  <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--f-mono)', color: 'var(--fg-2)' }}>
                    {basisLabel}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PortfolioControls({ lang, auth, portfolios, activePortfolioId, portfolioType, onSelect, onChanged, onPublicProfile }) {
  const t = useT(lang);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [naming, setNaming] = useState(false);
  const [profileUrl, setProfileUrl] = useState('');
  const [profileUrlError, setProfileUrlError] = useState('');
  const manualActive = portfolioType === 'manual' && activePortfolioId;

  const createPortfolio = async () => {
    const title = name.trim() || (lang === 'ru' ? 'Ручной портфель' : 'Manual portfolio');
    setCreating(true);
    try {
      const data = await apiFetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: title }),
      });
      setName('');
      setNaming(false);
      onChanged(data.portfolio?.id);
    } catch (err) {
      window.alert(err.message || (lang === 'ru' ? 'Не удалось создать портфель' : 'Could not create portfolio'));
    }
    setCreating(false);
  };

  const submitProfileUrl = (event) => {
    event.preventDefault();
    const nextProfileUrl = profileUrl.trim();
    if (!nextProfileUrl) {
      setProfileUrlError(t.hero.profileUrlError);
      return;
    }
    setProfileUrlError('');
    if (onPublicProfile) onPublicProfile(nextProfileUrl);
  };

  const sectionLabel = {
    fontFamily: 'var(--f-mono)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--fg-3)',
    whiteSpace: 'nowrap',
    minWidth: 88,
  };

  return (
    <div
      className="glass"
      style={{
        padding: '14px 16px',
        marginBottom: 16,
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 33 }}>
        <span style={sectionLabel}>{lang === 'ru' ? 'Портфель' : 'Portfolio'}</span>
        {!auth?.connected && (
          <button className="btn btn-sm btn-primary" onClick={() => auth?.login && auth.login()}>
            {lang === 'ru' ? 'Подключить Steam' : 'Link Steam'}
          </button>
        )}
        {naming ? (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createPortfolio();
                if (e.key === 'Escape') {
                  setNaming(false);
                  setName('');
                }
              }}
              placeholder={lang === 'ru' ? 'Название нового портфеля' : 'New portfolio name'}
              style={portfolioInputStyle({ flex: '1 1 180px', minWidth: 160, height: 31 })}
            />
            <button className="btn btn-sm btn-primary" onClick={createPortfolio} disabled={creating}>
              {creating ? '...' : (lang === 'ru' ? 'Создать' : 'Create')}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => {
                setNaming(false);
                setName('');
              }}
            >
              {lang === 'ru' ? 'Отмена' : 'Cancel'}
            </button>
          </>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => setNaming(true)}>
            {lang === 'ru' ? 'Создать вручную' : 'Create manually'}
          </button>
        )}
        <select
          value={activePortfolioId || ''}
          onChange={(e) => onSelect(e.target.value || null)}
          style={portfolioInputStyle({ minWidth: 200, height: 31 })}
        >
          {!activePortfolioId && <option value="">{lang === 'ru' ? 'Создай ручной портфель' : 'Create a manual portfolio'}</option>}
          {portfolios.map((portfolio) => (
            <option key={portfolio.id} value={portfolio.id}>
              {portfolio.type === 'steam' ? 'Steam · ' : ''}{portfolio.name}{portfolio.itemCount != null ? ` (${portfolio.itemCount})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div style={{ height: 1, background: 'var(--line)', margin: '12px 0' }} />

      <form onSubmit={submitProfileUrl} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={sectionLabel}>{lang === 'ru' ? 'Профиль' : 'Profile'}</span>
        <input
          value={profileUrl}
          onChange={(e) => {
            setProfileUrl(e.target.value);
            if (profileUrlError) setProfileUrlError('');
          }}
          placeholder={t.hero.profileUrlPlaceholder}
          aria-label={t.hero.profileUrlCta}
          style={portfolioInputStyle({ flex: '1 1 240px', minWidth: 180, height: 31 })}
        />
        <button className="btn btn-sm btn-ghost" type="submit">
          {t.hero.profileUrlCta}
        </button>
        {profileUrlError && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--amber)', width: '100%', marginLeft: 98 }}>
            {profileUrlError}
          </span>
        )}
      </form>

      <div style={{ height: 1, background: 'var(--line)', margin: '12px 0' }} />

      <ManualItemForm
        lang={lang}
        portfolioId={manualActive ? activePortfolioId : null}
        onSaved={() => onChanged(activePortfolioId)}
        sectionLabel={sectionLabel}
      />
    </div>
  );
}

function ManualItemForm({ lang, portfolioId, onSaved, sectionLabel }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [basisPerUnit, setBasisPerUnit] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [saving, setSaving] = useState(false);
  const currency = getActiveCurrency();

  useEffect(() => {
    const query = name.trim();
    if (!portfolioId || query.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return undefined;
    }

    let active = true;
    setSuggestionsLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        query,
        page: '1',
        pageSize: '6',
        category: 'all',
        rarity: 'all',
        wear: 'all',
        special: 'all',
        sort: 'name-asc',
      });

      apiFetch(`/api/market/catalog?${params.toString()}`)
        .then((data) => {
          if (!active) return;
          setSuggestions(Array.isArray(data.items) ? data.items : []);
          setSuggestionsOpen(true);
        })
        .catch(() => {
          if (!active) return;
          setSuggestions([]);
        })
        .finally(() => {
          if (active) setSuggestionsLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name, portfolioId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!portfolioId) return;
    const selectedMarketHashName = selectedSuggestion?.marketHashName === name.trim() ? selectedSuggestion : null;
    setSaving(true);
    try {
      await apiFetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketHashName: name.trim(),
          name: name.trim(),
          quantity: Number(quantity),
          basisPerUnit: Number(String(basisPerUnit).replace(',', '.')),
          currency,
          iconUrl: selectedMarketHashName?.iconUrl,
          marketUrl: selectedMarketHashName?.marketUrl,
          category: selectedMarketHashName?.category,
          rarity: selectedMarketHashName?.rarity,
          wear: selectedMarketHashName?.wear,
          tier: selectedMarketHashName?.tier,
        }),
      });
      setName('');
      setQuantity('1');
      setBasisPerUnit('');
      setSelectedSuggestion(null);
      onSaved();
    } catch (err) {
      window.alert(err.message || (lang === 'ru' ? 'Не удалось добавить предмет' : 'Could not add item'));
    }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={sectionLabel || undefined}>{lang === 'ru' ? 'Предмет' : 'Item'}</span>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 160, zIndex: 1 }}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSelectedSuggestion(null);
              setSuggestionsOpen(true);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 120)}
            placeholder={lang === 'ru' ? 'AK-47 | Redline (Field-Tested)' : 'AK-47 | Redline (Field-Tested)'}
            disabled={!portfolioId}
            style={portfolioInputStyle({ width: '100%', height: 31 })}
          />
          {portfolioId && suggestionsOpen && (suggestionsLoading || suggestions.length > 0) && (
            <div style={{
              position: 'absolute',
              zIndex: 100,
              left: 0,
              right: 0,
              top: 'calc(100% + 6px)',
              maxHeight: 260,
              overflowY: 'auto',
              borderRadius: 10,
              border: '1px solid var(--line-strong)',
              background: 'rgba(8,10,15,0.98)',
              boxShadow: '0 18px 42px rgba(0,0,0,0.42)',
            }}>
              {suggestionsLoading && (
                <div style={{ padding: 10, color: 'var(--fg-3)', fontFamily: 'var(--f-mono)', fontSize: 11 }}>
                  {lang === 'ru' ? 'Ищу предметы...' : 'Searching items...'}
                </div>
              )}
              {!suggestionsLoading && suggestions.map((item) => (
                <button
                  key={item.marketHashName}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setName(item.marketHashName);
                    setSelectedSuggestion(item);
                    setSuggestionsOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: item.iconUrl ? '42px 1fr auto' : '1fr auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: '9px 10px',
                    textAlign: 'left',
                    borderBottom: '1px solid var(--line)',
                    background: 'transparent',
                  }}
                >
                  {item.iconUrl && <img src={item.iconUrl} alt="" style={{ width: 42, height: 28, objectFit: 'contain' }} />}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.marketHashName}
                    </span>
                    <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase' }}>
                      {item.category || 'cs2'} · {item.wear || 'N/A'}
                    </span>
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                    {Number.isFinite(item.price) ? formatItemPrice(item, item.price, { digits: 2 }) : 'N/A'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          type="number"
          min="1"
          step="1"
          disabled={!portfolioId}
          title={lang === 'ru' ? 'Количество' : 'Quantity'}
          style={portfolioInputStyle({ width: 72, height: 31 })}
        />
        <input
          value={basisPerUnit}
          onChange={(e) => setBasisPerUnit(e.target.value)}
          placeholder={currency === 'rub' ? '₽ / шт.' : '$ / item'}
          disabled={!portfolioId}
          style={portfolioInputStyle({ width: 110, height: 31 })}
        />
        <button className="btn btn-sm btn-primary" disabled={!portfolioId || saving}>
          {saving ? '...' : (lang === 'ru' ? 'Добавить' : 'Add')}
        </button>
      </div>
    </form>
  );
}

function portfolioInputStyle(extra = {}) {
  return {
    padding: '7px 10px',
    borderRadius: 8,
    fontSize: 12,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--line)',
    color: 'var(--fg-0)',
    fontFamily: 'var(--f-body)',
    outline: 'none',
    minWidth: 0,
    ...extra,
  };
}

function BasisCell({ basisPerUnit, basisOriginal, basisCurrency, hasBasis, qty, totalBasis, lang, editable, onEdit }) {
  const inputCurrency = getActiveCurrency();

  const editHint = editable ? (lang === 'ru' ? ' · клик, чтобы изменить' : ' · click to edit') : '';
  const title = (hasBasis && qty > 1 && Number.isFinite(totalBasis)
    ? (lang === 'ru' ? `Всего: ${formatUsd(totalBasis)} · за шт.` : `Total: ${formatUsd(totalBasis)} · per unit`)
    : (lang === 'ru' ? 'Цена покупки за шт.' : 'Buy price per item')) + editHint;

  // basisOriginal keeps the exact amount the user typed in its original currency.
  // When the active currency differs, convert the USD basis (basisPerUnit) instead of
  // formatting the USD number as if it were already in the active currency.
  const displayBasis = !hasBasis
    ? (lang === 'ru' ? 'не задан' : 'not set')
    : (basisCurrency === inputCurrency && Number.isFinite(basisOriginal)
      ? formatMoney(basisOriginal, { currency: inputCurrency })
      : (Number.isFinite(basisPerUnit) ? formatMoney(basisPerUnit) : '—'));

  return (
    <div
      className="mono"
      title={title}
      onClick={editable ? onEdit : undefined}
      style={{
        fontSize: 12,
        color: hasBasis ? 'var(--fg-2)' : 'var(--fg-3)',
        display: 'inline-block',
        maxWidth: '100%',
        cursor: editable ? 'pointer' : 'inherit',
        textDecoration: editable ? 'underline dotted' : 'none',
        textUnderlineOffset: 3,
      }}
    >
      {displayBasis}
    </div>
  );
}

function InventoryTable({ items, onItemClick, lang, portfolioId, portfolioType, onBasisSaved, onItemDeleted }) {
  const [editingItemId, setEditingItemId] = useState(null);
  const [editDraft, setEditDraft] = useState({ quantity: '', basisPerUnit: '' });
  const [savingItemId, setSavingItemId] = useState(null);
  const [sortKey, setSortKey] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const isSteamPortfolio = portfolioType === 'steam';

  const rowEditKey = (item) => item.manualItemId || item.marketHashName;

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'name' ? 'asc' : 'desc');
  };

  const sortedItems = useMemo(() => {
    const list = Array.isArray(items) ? [...items] : [];
    const dir = sortDir === 'asc' ? 1 : -1;
    const num = (value) => (Number.isFinite(value) ? value : null);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = String(a.name || a.marketHashName || '').localeCompare(String(b.name || b.marketHashName || ''), undefined, { sensitivity: 'base' });
      } else if (sortKey === 'qty') {
        cmp = (num(a.qty) ?? -Infinity) - (num(b.qty) ?? -Infinity);
      } else if (sortKey === 'basis') {
        cmp = (num(a.basis) ?? -Infinity) - (num(b.basis) ?? -Infinity);
      } else if (sortKey === 'value') {
        cmp = (num(a.totalValue ?? a.value) ?? -Infinity) - (num(b.totalValue ?? b.value) ?? -Infinity);
      } else if (sortKey === 'pnl') {
        const aPnl = num(a.pnlPct);
        const bPnl = num(b.pnlPct);
        cmp = (aPnl ?? -Infinity) - (bPnl ?? -Infinity);
      }
      if (cmp === 0) {
        cmp = String(a.name || a.marketHashName || '').localeCompare(String(b.name || b.marketHashName || ''), undefined, { sensitivity: 'base' });
      }
      return cmp * dir;
    });
    return list;
  }, [items, sortKey, sortDir]);

  const SortHeader = ({ label, column, title }) => {
    const active = sortKey === column;
    const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <div
        role="button"
        tabIndex={0}
        title={title}
        onClick={() => toggleSort(column)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleSort(column);
          }
        }}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          color: active ? 'var(--fg-1)' : 'var(--fg-3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {label}{arrow}
      </div>
    );
  };

  const startManualEdit = (item, event) => {
    event.stopPropagation();
    const inputCurrency = getActiveCurrency();
    const basisValue = item.hasBasis
      ? (Number.isFinite(item.basisOriginal) && item.basisCurrency === inputCurrency
        ? item.basisOriginal
        : Number(usdBasisToInputDraft(item.basis, inputCurrency)))
      : NaN;
    setEditingItemId(rowEditKey(item));
    setEditDraft({
      quantity: String(item.qty || 1),
      basisPerUnit: Number.isFinite(basisValue) ? String(basisValue) : '',
    });
  };

  const cancelManualEdit = (event) => {
    event.stopPropagation();
    setEditingItemId(null);
    setEditDraft({ quantity: '', basisPerUnit: '' });
  };

  const saveManualEdit = async (item, event) => {
    event.stopPropagation();
    if (!portfolioId) return;
    const basisPerUnit = Number(String(editDraft.basisPerUnit).trim().replace(',', '.'));

    // Steam inventory rows: only the cost basis is editable (quantity comes from Steam).
    if (isSteamPortfolio) {
      if (!Number.isFinite(basisPerUnit) || basisPerUnit < 0) {
        window.alert(lang === 'ru' ? 'Укажи корректную цену покупки.' : 'Enter a valid buy price.');
        return;
      }
      setSavingItemId(rowEditKey(item));
      try {
        await apiFetch('/api/portfolio/basis', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portfolioId: 'steam', marketHashName: item.marketHashName, basisPerUnit, currency: getActiveCurrency() }),
        });
        setEditingItemId(null);
        setEditDraft({ quantity: '', basisPerUnit: '' });
        if (onBasisSaved) onBasisSaved();
      } catch (err) {
        window.alert(err.message || (lang === 'ru' ? 'Не удалось сохранить' : 'Could not save'));
      }
      setSavingItemId(null);
      return;
    }

    if (!item.manualItemId) return;
    const quantity = Number(String(editDraft.quantity).trim().replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(basisPerUnit) || basisPerUnit < 0) {
      window.alert(lang === 'ru' ? 'Укажи корректное количество и цену.' : 'Enter a valid quantity and price.');
      return;
    }

    setSavingItemId(rowEditKey(item));
    try {
      await apiFetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/items/${encodeURIComponent(item.manualItemId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, basisPerUnit, currency: getActiveCurrency() }),
      });
      setEditingItemId(null);
      setEditDraft({ quantity: '', basisPerUnit: '' });
      if (onBasisSaved) onBasisSaved();
    } catch (err) {
      window.alert(err.message || (lang === 'ru' ? 'Не удалось сохранить' : 'Could not save'));
    }
    setSavingItemId(null);
  };

  const deleteManualItem = async (item, event) => {
    event.stopPropagation();
    if (!portfolioId || !item.manualItemId) return;
    try {
      await apiFetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/items/${encodeURIComponent(item.manualItemId)}`, { method: 'DELETE' });
      if (onItemDeleted) onItemDeleted();
    } catch (err) {
      window.alert(err.message || (lang === 'ru' ? 'Не удалось удалить предмет' : 'Could not delete item'));
    }
  };

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: '40px 60px 2fr 90px 100px 110px 100px 160px',
        padding: '12px 20px', gap: 12, alignItems: 'center', fontSize: 11,
        color: 'var(--fg-3)', fontFamily: 'var(--f-mono)', letterSpacing: '0.06em', textTransform: 'uppercase',
        borderBottom: '1px solid var(--line)',
      }}>
        <div>#</div><div></div>
        <SortHeader label="Item" column="name" />
        <SortHeader label="Qty" column="qty" />
        <SortHeader
          label="Basis"
          column="basis"
          title={lang === 'ru' ? 'Себестоимость за 1 шт. Меняется через кнопку Изменить.' : 'Cost per unit. Change it from the Edit button.'}
        />
        <SortHeader label="Value" column="value" />
        <SortHeader label="P&L" column="pnl" />
        <div>Source</div>
      </div>
      {sortedItems.map((h, i) => {
        const change = (h.spark || [0, 0]).at(-1) - (h.spark || [0, 0]).at(-2);
        const isEditing = editingItemId === (h.manualItemId || h.marketHashName);
        const basisEditable = (portfolioType === 'manual' && h.manualItemId) || isSteamPortfolio;
        const lockLabel = h.tradableQty === h.qty
          ? null
          : h.tradableQty > 0
            ? `${h.qty - h.tradableQty} restricted`
            : 'restricted';
        return (
          <div key={h.marketHashName || String(h.assetid || i)} onClick={() => onItemClick && onItemClick(h)} style={{
            display: 'grid', gridTemplateColumns: '40px 60px 2fr 90px 100px 110px 100px 160px',
            padding: '14px 20px', gap: 12, alignItems: 'center',
            borderBottom: i < sortedItems.length - 1 ? '1px solid var(--line)' : 'none',
            cursor: 'default', transition: 'background 120ms',
          }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
             onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</div>
            {h.iconUrl
              ? <img src={h.iconUrl} alt="" style={{ width: 50, height: 32, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }} />
              : <div style={{ width: 50, height: 32, borderRadius: 6, background: `linear-gradient(135deg, var(--rar-${h.tier}), #0a0c11)`, opacity: 0.8, border: '1px solid var(--line)' }}></div>}
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 13, fontWeight: 500 }}>{h.name}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                {h.marketableQty > 0 && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--green)' }}>marketable</span>}
                {h.assetIds?.length > 1 && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{h.assetIds.length} stacks merged</span>}
                {(h.inStorage || h.storageQty > 0) && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--cyan)' }} title={h.storageUnitName || ''}>
                    {lang === 'ru' ? 'хранилище' : 'storage'}{h.storageUnitName ? ` · ${h.storageUnitName}` : ''}
                  </span>
                )}
                {lockLabel && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--amber)' }}>{lockLabel}</span>}
              </div>
            </div>
            {isEditing && portfolioType === 'manual' ? (
              <input
                value={editDraft.quantity}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setEditDraft((draft) => ({ ...draft, quantity: event.target.value }))}
                type="number"
                min="1"
                step="1"
                style={portfolioInputStyle({ width: 72, fontFamily: 'var(--f-mono)' })}
              />
            ) : (
              <div className="mono" style={{ fontSize: 12 }}>{h.qty}</div>
            )}
            {isEditing ? (
              <input
                value={editDraft.basisPerUnit}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setEditDraft((draft) => ({ ...draft, basisPerUnit: event.target.value }))}
                placeholder={getActiveCurrency() === 'rub' ? '₽ / шт.' : '$ / item'}
                style={portfolioInputStyle({ width: 96, fontFamily: 'var(--f-mono)' })}
              />
            ) : (
              <BasisCell
                basisPerUnit={h.basis}
                basisOriginal={h.basisOriginal}
                basisCurrency={h.basisCurrency}
                hasBasis={h.hasBasis}
                qty={h.qty}
                totalBasis={h.totalBasis}
                lang={lang}
                editable={basisEditable}
                onEdit={(event) => startManualEdit(h, event)}
              />
            )}
            <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{formatUsd(h.totalValue ?? h.value)}</div>
            <div className="mono" style={{ fontSize: 12, color: h.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {Number.isFinite(h.pnlPct) ? `${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(1)}%` : 'N/A'}
            </div>
            <div style={{ minWidth: 0 }} title={h.priceProvider}>
              {portfolioType === 'manual' && h.manualItemId ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isEditing ? (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={(event) => saveManualEdit(h, event)} disabled={savingItemId === h.manualItemId}>
                        {savingItemId === h.manualItemId ? '...' : (lang === 'ru' ? 'Сохранить' : 'Save')}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={cancelManualEdit}>
                        {lang === 'ru' ? 'Отмена' : 'Cancel'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-ghost" onClick={(event) => startManualEdit(h, event)}>
                        {lang === 'ru' ? 'Изменить' : 'Edit'}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={(event) => deleteManualItem(h, event)}>
                        {lang === 'ru' ? 'Удалить' : 'Delete'}
                      </button>
                    </>
                  )}
                </div>
              ) : isSteamPortfolio && isEditing ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-sm btn-primary" onClick={(event) => saveManualEdit(h, event)} disabled={savingItemId === (h.manualItemId || h.marketHashName)}>
                    {savingItemId === (h.manualItemId || h.marketHashName) ? '...' : (lang === 'ru' ? 'Сохранить' : 'Save')}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={cancelManualEdit}>
                    {lang === 'ru' ? 'Отмена' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <Sparkline data={h.spark} color={change >= 0 ? 'var(--green)' : 'var(--red)'} height={24} fill={false} />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function PortfolioLoadingVisual({ lang }) {
  const labels = lang === 'ru'
    ? ['Читаем инвентарь', 'Сверяем цены', 'Строим аналитику']
    : ['Reading inventory', 'Matching prices', 'Building analytics'];
  const candles = [
    { bottom: 20, body: 22, wick: 38, up: true },
    { bottom: 27, body: 16, wick: 31, up: false },
    { bottom: 24, body: 28, wick: 46, up: true },
    { bottom: 38, body: 19, wick: 35, up: true },
    { bottom: 34, body: 14, wick: 30, up: false },
    { bottom: 41, body: 26, wick: 44, up: true },
    { bottom: 53, body: 18, wick: 34, up: false },
    { bottom: 49, body: 31, wick: 49, up: true },
    { bottom: 61, body: 15, wick: 29, up: true },
    { bottom: 56, body: 20, wick: 38, up: false },
    { bottom: 66, body: 27, wick: 45, up: true },
    { bottom: 76, body: 18, wick: 34, up: true },
  ];

  return (
    <div className="portfolio-loader" aria-hidden="true">
      <div className="portfolio-loader__glow"></div>
      <div className="portfolio-loader__scene">
        <div className="portfolio-loader__core">
          <div className="portfolio-loader__core-face">
            <img src="assets/loader-arrow-neon-glass-01.png" alt="" />
          </div>
        </div>
        <div className="portfolio-loader__asset portfolio-loader__asset--one">
          <span>AK-47</span>
          <img src="assets/hero-ak47-gpt-transparent.png" alt="" />
        </div>
        <div className="portfolio-loader__asset portfolio-loader__asset--two">
          <span>M4A4</span>
          <img src="assets/hero-m4-red-gpt-transparent.png" alt="" />
        </div>
        <div className="portfolio-loader__asset portfolio-loader__asset--three">
          <span>AWP</span>
          <img src="assets/hero-awp-dragon-gpt-transparent.png" alt="" />
        </div>
        <div className="portfolio-loader__candles">
          <div className="portfolio-loader__candle-grid"></div>
          <div className="portfolio-loader__price-line"><i></i><b>LIVE</b></div>
          {candles.map((candle, index) => (
            <span
              key={index}
              className={`portfolio-loader__candle ${candle.up ? 'is-up' : 'is-down'}`}
              style={{
                '--candle-index': index,
                '--candle-bottom': `${candle.bottom}%`,
                '--candle-body': `${candle.body}%`,
                '--candle-wick': `${candle.wick}%`,
              }}
            >
              <i></i>
            </span>
          ))}
        </div>
      </div>
      <div className="portfolio-loader__status">
        {labels.map((label, index) => (
          <span key={label} style={{ '--loader-step': index }}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function DashboardState({ lang, title, auth, message, error, onRetry, loading = false }) {
  const suggestSteamApiKey = auth?.steamApiKeyConfigured === false;
  const text = error
    ? errorMessage(error, lang)
    : message || (lang === 'ru'
      ? 'Подключи Steam аккаунт, чтобы прочитать публичный CS2 inventory и оценить портфель.'
      : 'Connect Steam to read your public CS2 inventory and value the portfolio.');

  return (
    <div className={loading ? 'dashboard-state dashboard-state--loading' : 'dashboard-state'}>
      <div className="container">
        <div className={`glass dashboard-state__card${loading ? ' dashboard-state__card--loading' : ''}`}>
          <div className="dashboard-state__copy">
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>{loading ? '// LIVE PORTFOLIO SYNC' : '// REAL DATA MVP'}</div>
            <h1 className="display">{title}</h1>
            <p aria-live="polite">{text}</p>
            {loading && (
              <div className="dashboard-state__progress">
                <span></span>
              </div>
            )}
            {suggestSteamApiKey && !loading && (
              <p className="dashboard-state__warning">
                {lang === 'ru'
                  ? 'Для ника и аватара в Steam добавь STEAM_API_KEY в .env и перезапусти сервер (вход без ключа уже работает).'
                  : 'Add STEAM_API_KEY to .env and restart the server for Steam display names and avatars (login works without it).'}
              </p>
            )}
            {!loading && (
              <div className="dashboard-state__actions">
                {!error && <button className="btn btn-primary" onClick={() => auth?.login && auth.login()}>Link Steam</button>}
                {error && <button className="btn btn-primary" onClick={onRetry}>Retry sync</button>}
              </div>
            )}
          </div>
          {loading && <PortfolioLoadingVisual lang={lang} />}
        </div>
      </div>
    </div>
  );
}

function errorMessage(error, lang) {
  const messages = {
    not_authenticated: lang === 'ru' ? 'Steam аккаунт не подключен.' : 'Steam account is not connected.',
    missing_profile_url: lang === 'ru' ? 'Вставь ссылку на профиль Steam.' : 'Paste a Steam profile link.',
    invalid_profile_url: lang === 'ru' ? 'Не удалось прочитать ссылку. Нужен профиль Steam или SteamID64.' : 'Could not read that link. Use a Steam profile URL or SteamID64.',
    profile_not_found: lang === 'ru' ? 'Steam-профиль не найден.' : 'Steam profile was not found.',
    private_inventory: lang === 'ru' ? 'Steam не отдал inventory. Проверь, что инвентарь публичный.' : 'Steam did not return inventory. Make sure your inventory is public.',
    rate_limited: lang === 'ru' ? 'Steam временно ограничил запросы. Попробуй позже.' : 'Steam rate limited the request. Try again later.',
  };
  return messages[error.code] || error.message || 'Unexpected error.';
}

function downloadPortfolioCsv(items) {
  const rows = [
    ['assetid', 'market_hash_name', 'qty', 'basis_total_usd', 'value_total_usd', 'pnl_total_usd', 'pnl_pct', 'provider'],
    ...items.map((item) => [item.assetid, item.marketHashName, item.qty, item.totalBasis ?? item.basis, item.totalValue ?? item.value, item.pnl, item.pnlPct, item.priceProvider]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'steam-invest-portfolio.csv';
  link.click();
  URL.revokeObjectURL(url);
}

Object.assign(window, { Dashboard });
