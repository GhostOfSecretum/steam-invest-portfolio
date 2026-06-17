/* global React */
const { useState, useRef, useMemo, useEffect } = React;

/* ───────────────────────────────────────────────────
   PORTFOLIO DASHBOARD — API backed
   ─────────────────────────────────────────────────── */

function PortfolioChart({ data }) {
  const safeData = Array.isArray(data) && data.length > 1 ? data : [0, 0];
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const w = 1000, h = 280;
  const min = Math.min(...safeData) * 0.98, max = Math.max(...safeData) * 1.02;
  const range = max - min || 1;
  const pts = safeData.map((v, i) => [(i / (safeData.length - 1)) * w, h - ((v - min) / range) * (h - 40) - 20]);
  const d = pts.map((p, i) => i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`).join(' ');
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;

  const onMove = (e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * w;
    const idx = Math.min(safeData.length - 1, Math.max(0, Math.round((x / w) * (safeData.length - 1))));
    setHover({ idx, x: pts[idx][0], y: pts[idx][1], v: safeData[idx] });
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
        <path d={area} fill="url(#chartFill)" />
        <path d={d} stroke="url(#chartLine)" strokeWidth="2" fill="none" strokeLinejoin="round" />
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1="0" y2={h} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={hover.x} cy={hover.y} r="5" fill="oklch(0.68 0.22 5)" stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {hover && (
        <div style={{
          position: 'absolute', left: `${(hover.x / w) * 100}%`, top: 12, transform: 'translateX(-50%)',
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(0,0,0,0.85)', border: '1px solid var(--line-strong)',
          fontFamily: 'var(--f-mono)', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          <div style={{ color: 'var(--fg-3)', fontSize: 10 }}>day {hover.idx + 1}</div>
          <div style={{ color: 'var(--fg-0)', marginTop: 2 }}>{formatUsd(hover.v, 0)}</div>
        </div>
      )}
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

function DesktopPairingButton({ lang }) {
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/desktop/pairing-code', { method: 'POST' });
      setCode(data.code);
    } catch { setCode(null); }
    setLoading(false);
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button className="btn btn-sm btn-ghost" onClick={generate} disabled={loading}>
        {loading ? '...' : (lang === 'ru' ? 'Код для desktop' : 'Desktop code')}
      </button>
      {code && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--accent)', letterSpacing: '0.15em' }}>{code}</span>}
    </div>
  );
}

function Dashboard({ lang, onItemClick, auth }) {
  const t = useT(lang);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(null);
  const portfolio = usePortfolio(auth, selectedPortfolioId);
  const [range, setRange] = useState('30d');
  const [tab, setTab] = useState('inventory');
  const [query, setQuery] = useState('');
  const data = portfolio.data;
  const items = data?.items || [];
  const portfolios = data?.portfolios || [];
  const activePortfolioId = data?.portfolioId || selectedPortfolioId;
  const isSteamPortfolio = data?.portfolioType === 'steam';
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.marketHashName.toLowerCase().includes(needle));
  }, [items, query]);

  useEffect(() => {
    if (!selectedPortfolioId && data?.portfolioId) setSelectedPortfolioId(data.portfolioId);
  }, [data?.portfolioId, selectedPortfolioId]);

  if (portfolio.loading && !portfolio.data) {
    return <DashboardState lang={lang} title={t.dash.title} message={lang === 'ru' ? 'Загружаем портфель и цены...' : 'Loading portfolio and prices...'} />;
  }

  if (portfolio.error) {
    return <DashboardState lang={lang} title={t.dash.title} error={portfolio.error} onRetry={() => portfolio.reload(true)} />;
  }

  if (!data) return null;

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

  return (
    <div style={{ padding: '40px 64px 80px' }}>
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--accent)' }}>
              // PORTFOLIO · {data.totalInventoryCount} ITEMS · {data.uniqueInventoryCount} UNIQUE
            </div>
            <h1 className="display" style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em' }}>{t.dash.title}</h1>
            <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
              {data.portfolioName || data.profile?.personaname || data.profile?.steamId} · synced {new Date(data.syncedAt).toLocaleString()} · {data.assetEntriesCount} entries · {inventorySourceLabel(data.inventoryProvider, lang)} · {data.cached ? 'cache' : 'live'}
              {data.storageItemCount > 0 && (
                <span> · {lang === 'ru' ? `в хранилищах: ${data.storageItemCount}` : `in storage: ${data.storageItemCount}`}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {data.desktopConnected && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--green)' }}>● desktop</span>}
            {auth?.connected && <DesktopPairingButton lang={lang} />}
            <button className="btn btn-sm btn-ghost" onClick={() => downloadPortfolioCsv(items)}>CSV</button>
            <button className="btn btn-sm btn-ghost" onClick={() => portfolio.reload(isSteamPortfolio)}>
              {portfolio.loading ? 'Syncing...' : (isSteamPortfolio ? 'Sync' : 'Refresh')}
            </button>
            <button className="btn btn-sm btn-primary" title={lang === 'ru' ? 'Клик по ячейке Basis — ввести цену покупки за шт. (₽ или $ по переключателю валюты)' : 'Click Basis cell — enter buy price per item (RUB or USD from currency toggle)'}>Buy basis</button>
          </div>
        </div>

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
        />

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

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 24 }}>
          <div className="glass" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="eyebrow">VALUE OVER TIME</div>
                <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>USD · synthetic from current holdings</div>
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
            <PortfolioChart data={data.history} />
          </div>

          <div className="glass" style={{ padding: 24 }}>
            <div className="eyebrow">{t.dash.breakdown}</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(data.allocation || []).map((b, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--fg-1)' }}>{b.l}</span>
                    <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--fg-2)' }}>{compactUsd(b.v)} · {b.p}%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${b.p}%`, height: '100%', background: b.c, borderRadius: 3, opacity: 0.8 }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
                showing {filteredItems.length} of {items.length} unique rows · {data.totalInventoryCount} total items
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
              {['inventory', 'movers', 'watchlist', 'activity'].map(k => (
                <button key={k} className="tab" data-active={tab === k} onClick={() => setTab(k)}>{t.dash[k] || k}</button>
              ))}
              </div>
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={lang === 'ru' ? 'Поиск...' : 'Search...'} style={{
              padding: '6px 12px', borderRadius: 7, fontSize: 12,
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', color: 'var(--fg-0)',
              fontFamily: 'var(--f-body)', outline: 'none', width: 260,
            }} />
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
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--f-mono)', fontSize: 11.5 }}>
            {(data.activity || []).map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: i < data.activity.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ color: 'var(--fg-3)', minWidth: 48 }}>{a.t}</span>
                <span style={{ color: a.c }}>{a.a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioControls({ lang, auth, portfolios, activePortfolioId, portfolioType, onSelect, onChanged }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
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
      onChanged(data.portfolio?.id);
    } catch (err) {
      window.alert(err.message || (lang === 'ru' ? 'Не удалось создать портфель' : 'Could not create portfolio'));
    }
    setCreating(false);
  };

  return (
    <div className="glass" style={{ padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, alignItems: 'start', position: 'relative', zIndex: 50 }}>
      <div>
        <div className="eyebrow">{lang === 'ru' ? 'Портфели' : 'Portfolios'}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <select
            value={activePortfolioId || ''}
            onChange={(e) => onSelect(e.target.value || null)}
            style={portfolioInputStyle({ minWidth: 220 })}
          >
            {!activePortfolioId && <option value="">{lang === 'ru' ? 'Создай ручной портфель' : 'Create a manual portfolio'}</option>}
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.type === 'steam' ? 'Steam · ' : ''}{portfolio.name}{portfolio.itemCount != null ? ` (${portfolio.itemCount})` : ''}
              </option>
            ))}
          </select>
          {!auth?.connected && (
            <button className="btn btn-sm btn-ghost" onClick={() => auth?.login && auth.login()}>
              {lang === 'ru' ? 'Подключить Steam' : 'Link Steam'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={lang === 'ru' ? 'Название нового портфеля' : 'New portfolio name'}
            style={portfolioInputStyle({ flex: 1 })}
          />
          <button className="btn btn-sm btn-primary" onClick={createPortfolio} disabled={creating}>
            {creating ? '...' : (lang === 'ru' ? 'Создать' : 'Create')}
          </button>
        </div>
      </div>

      <ManualItemForm
        lang={lang}
        portfolioId={manualActive ? activePortfolioId : null}
        onSaved={() => onChanged(activePortfolioId)}
      />
    </div>
  );
}

function ManualItemForm({ lang, portfolioId, onSaved }) {
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
      <div className="eyebrow">{lang === 'ru' ? 'Ручной ввод предметов' : 'Manual items'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 130px auto', gap: 8, marginTop: 10 }}>
        <div style={{ position: 'relative', minWidth: 0, zIndex: 1 }}>
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
            style={portfolioInputStyle({ width: '100%' })}
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
          style={portfolioInputStyle()}
        />
        <input
          value={basisPerUnit}
          onChange={(e) => setBasisPerUnit(e.target.value)}
          placeholder={currency === 'rub' ? '₽ / шт.' : '$ / item'}
          disabled={!portfolioId}
          style={portfolioInputStyle()}
        />
        <button className="btn btn-sm btn-primary" disabled={!portfolioId || saving}>
          {saving ? '...' : (lang === 'ru' ? 'Добавить' : 'Add')}
        </button>
      </div>
      <div style={{ marginTop: 8, color: 'var(--fg-3)', fontFamily: 'var(--f-mono)', fontSize: 11 }}>
        {portfolioId
          ? (lang === 'ru' ? `Цена покупки сохраняется за 1 шт. в ${currency.toUpperCase()}.` : `Buy price is saved per item in ${currency.toUpperCase()}.`)
          : (lang === 'ru' ? 'Выбери или создай ручной портфель.' : 'Select or create a manual portfolio.')}
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

function BasisCell({ basisPerUnit, basisOriginal, basisCurrency, qty, totalBasis, lang }) {
  const inputCurrency = getActiveCurrency();

  const title = qty > 1 && Number.isFinite(totalBasis)
    ? (lang === 'ru' ? `Всего: ${formatUsd(totalBasis)} · за шт.` : `Total: ${formatUsd(totalBasis)} · per unit`)
    : (lang === 'ru' ? 'Цена покупки за шт.' : 'Buy price per item');

  const displayBasis = inputCurrency === 'rub'
    ? (Number.isFinite(basisOriginal) && basisCurrency === 'rub'
      ? formatMoney(basisOriginal, { currency: 'rub' })
      : (Number.isFinite(basisPerUnit) ? formatMoney(basisPerUnit, { currency: 'rub' }) : '—'))
    : (Number.isFinite(basisOriginal) && basisCurrency === 'usd'
      ? formatMoney(basisOriginal, { currency: 'usd' })
      : (Number.isFinite(basisPerUnit) ? formatMoney(basisPerUnit, { currency: 'usd' }) : '—'));

  return (
    <div
      className="mono"
      title={title}
      style={{
        fontSize: 12,
        color: 'var(--fg-2)',
        display: 'inline-block',
        maxWidth: '100%',
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

  const startManualEdit = (item, event) => {
    event.stopPropagation();
    const inputCurrency = getActiveCurrency();
    const basisValue = inputCurrency === 'rub'
      ? (Number.isFinite(item.basisOriginal) && item.basisCurrency === 'rub'
        ? item.basisOriginal
        : Number(usdBasisToInputDraft(item.basis, inputCurrency)))
      : (Number.isFinite(item.basisOriginal) && item.basisCurrency === 'usd'
        ? item.basisOriginal
        : Number(usdBasisToInputDraft(item.basis, inputCurrency)));
    setEditingItemId(item.manualItemId);
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
    if (!portfolioId || !item.manualItemId) return;
    const quantity = Number(String(editDraft.quantity).trim().replace(',', '.'));
    const basisPerUnit = Number(String(editDraft.basisPerUnit).trim().replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(basisPerUnit) || basisPerUnit < 0) {
      window.alert(lang === 'ru' ? 'Укажи корректное количество и цену.' : 'Enter a valid quantity and price.');
      return;
    }

    setSavingItemId(item.manualItemId);
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
        <div>#</div><div></div><div>Item</div><div>Qty</div>
        <div title={lang === 'ru' ? 'Себестоимость за 1 шт. Меняется через кнопку Изменить.' : 'Cost per unit. Change it from the Edit button.'}>Basis</div>
        <div>Value</div><div>P&L</div><div>Source</div>
      </div>
      {items.map((h, i) => {
        const change = (h.spark || [0, 0]).at(-1) - (h.spark || [0, 0]).at(-2);
        const isEditing = editingItemId === h.manualItemId;
        const lockLabel = h.tradableQty === h.qty
          ? null
          : h.tradableQty > 0
            ? `${h.qty - h.tradableQty} restricted`
            : 'restricted';
        return (
          <div key={h.marketHashName || String(h.assetid || i)} onClick={() => onItemClick && onItemClick(h)} style={{
            display: 'grid', gridTemplateColumns: '40px 60px 2fr 90px 100px 110px 100px 160px',
            padding: '14px 20px', gap: 12, alignItems: 'center',
            borderBottom: i < items.length - 1 ? '1px solid var(--line)' : 'none',
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
            {isEditing ? (
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
                qty={h.qty}
                totalBasis={h.totalBasis}
                lang={lang}
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

function DashboardState({ lang, title, auth, message, error, onRetry }) {
  const suggestSteamApiKey = auth?.steamApiKeyConfigured === false;
  const text = error
    ? errorMessage(error, lang)
    : message || (lang === 'ru'
      ? 'Подключи Steam аккаунт, чтобы прочитать публичный CS2 inventory и оценить портфель.'
      : 'Connect Steam to read your public CS2 inventory and value the portfolio.');

  return (
    <div style={{ padding: '80px 64px' }}>
      <div className="container">
        <div className="glass" style={{ padding: 36, maxWidth: 720 }}>
          <div className="eyebrow" style={{ color: 'var(--accent)' }}>// REAL DATA MVP</div>
          <h1 className="display" style={{ fontSize: 44, fontWeight: 500, marginTop: 12 }}>{title}</h1>
          <p style={{ marginTop: 14, color: 'var(--fg-1)', lineHeight: 1.6 }}>{text}</p>
          {suggestSteamApiKey && (
            <p style={{ marginTop: 12, color: 'var(--amber)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
              {lang === 'ru'
                ? 'Для ника и аватара в Steam добавь STEAM_API_KEY в .env и перезапусти сервер (вход без ключа уже работает).'
                : 'Add STEAM_API_KEY to .env and restart the server for Steam display names and avatars (login works without it).'}
            </p>
          )}
          <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
            {!error && <button className="btn btn-primary" onClick={() => auth?.login && auth.login()}>Link Steam</button>}
            {error && <button className="btn btn-primary" onClick={onRetry}>Retry sync</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function errorMessage(error, lang) {
  const messages = {
    not_authenticated: lang === 'ru' ? 'Steam аккаунт не подключен.' : 'Steam account is not connected.',
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
