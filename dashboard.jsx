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
  const portfolio = usePortfolio(auth);
  const [range, setRange] = useState('30d');
  const [tab, setTab] = useState('inventory');
  const [query, setQuery] = useState('');
  const data = portfolio.data;
  const items = data?.items || [];
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.marketHashName.toLowerCase().includes(needle));
  }, [items, query]);

  if (!auth?.connected) {
    return <DashboardState lang={lang} title={t.dash.title} auth={auth} />;
  }

  if (portfolio.loading && !portfolio.data) {
    return <DashboardState lang={lang} title={t.dash.title} message={lang === 'ru' ? 'Синхронизируем Steam inventory и цены...' : 'Syncing Steam inventory and prices...'} />;
  }

  if (portfolio.error) {
    return <DashboardState lang={lang} title={t.dash.title} error={portfolio.error} onRetry={() => portfolio.reload(true)} />;
  }

  if (!data) return null;

  const pnlColor = data.pnl >= 0 ? 'var(--green)' : 'var(--red)';
  const pricedPct = data.totalInventoryCount ? (data.pricedCount / data.totalInventoryCount) * 100 : 0;

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
              {data.profile?.personaname || data.profile?.steamId} · synced {new Date(data.syncedAt).toLocaleString()} · {data.assetEntriesCount} Steam stacks · {inventorySourceLabel(data.inventoryProvider, lang)} · {data.cached ? 'cache' : 'live'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {data.desktopConnected && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--green)' }}>● desktop</span>}
            <DesktopPairingButton lang={lang} />
            <button className="btn btn-sm btn-ghost" onClick={() => downloadPortfolioCsv(items)}>CSV</button>
            <button className="btn btn-sm btn-ghost" onClick={() => portfolio.reload(true)}>{portfolio.loading ? 'Syncing...' : 'Sync'}</button>
            <button className="btn btn-sm btn-primary" title={lang === 'ru' ? 'Клик по ячейке Basis — ввести цену покупки за шт. (₽ или $ по переключателю валюты)' : 'Click Basis cell — enter buy price per item (RUB or USD from currency toggle)'}>Buy basis</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <StatCard accent label={t.dash.total} value={compactUsd(data.totalValue)} delta={`${data.pricedCount}/${data.totalInventoryCount} priced`} sub={`${data.uniqueInventoryCount} unique rows from Steam inventory`} />
          <StatCard label={t.dash.pnl} value={`${data.pnl >= 0 ? '+' : ''}${compactUsd(data.pnl)}`} delta={`${data.pnlPct.toFixed(2)}% all-time`} deltaColor={pnlColor} sub={`Cost basis ${compactUsd(data.totalBasis)}`} />
          <StatCard label={t.dash.liquidity} value={`${data.liquidityScore} / 100`} delta={`${data.totalVolume24h.toLocaleString()} volume / 24h`} deltaColor="var(--cyan)" sub="based on priced items" />
          <StatCard label="Pricing coverage" value={`${pricedPct.toFixed(0)}%`} delta="Take.Skin + Steam fallback" deltaColor="var(--amber)" sub="all Steam inventory rows stay visible" />
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

          <InventoryTable items={filteredItems} onItemClick={onItemClick} lang={lang} onBasisSaved={() => portfolio.reload(false)} />
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

function BasisCell({ marketHashName, basisPerUnit, basisOriginal, basisCurrency, qty, totalBasis, lang, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const skipBlurRef = useRef(false);
  const inputCurrency = getActiveCurrency();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = (e) => {
    e.stopPropagation();
    const displayValue = inputCurrency === 'rub'
      ? (Number.isFinite(basisOriginal) && basisCurrency === 'rub'
        ? basisOriginal
        : (Number.isFinite(basisPerUnit) ? Number(usdBasisToInputDraft(basisPerUnit, inputCurrency)) : null))
      : (Number.isFinite(basisOriginal) && basisCurrency === 'usd'
        ? basisOriginal
        : (Number.isFinite(basisPerUnit) ? Number(usdBasisToInputDraft(basisPerUnit, inputCurrency)) : null));
    setDraft(Number.isFinite(displayValue) ? String(displayValue) : '');
    setEditing(true);
  };

  const cancel = (e) => {
    e?.stopPropagation();
    skipBlurRef.current = true;
    setEditing(false);
  };

  const commit = async (e) => {
    e?.stopPropagation();
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    const raw = String(draft).trim().replace(',', '.');
    if (raw === '') {
      setEditing(false);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setEditing(false);
      return;
    }
    try {
      await apiFetch('/api/portfolio/basis', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketHashName, basisPerUnit: n, currency: inputCurrency }),
      });
      if (onSaved) onSaved();
    } catch (err) {
      window.alert(err.message || (lang === 'ru' ? 'Не удалось сохранить' : 'Could not save'));
    }
    setEditing(false);
  };

  if (!marketHashName) {
    return <div className="mono" style={{ fontSize: 12, color: 'var(--fg-2)' }}>—</div>;
  }

  if (editing) {
    return (
      <div className="mono" style={{ fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={draft}
          placeholder={inputCurrency === 'rub'
            ? (lang === 'ru' ? '₽ за шт.' : 'RUB per item')
            : (lang === 'ru' ? '$ за шт.' : 'USD per item')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setTimeout(commit, 0); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commit(e); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(e); }
          }}
          style={{
            width: '100%',
            maxWidth: inputCurrency === 'rub' ? 110 : 92,
            padding: '4px 6px',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'var(--f-mono)',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--accent)',
            color: 'var(--fg-0)',
            outline: 'none',
          }}
        />
      </div>
    );
  }

  const unitHint = inputCurrency === 'rub'
    ? (lang === 'ru' ? 'цена покупки за шт. (₽)' : 'buy price per item (RUB)')
    : (lang === 'ru' ? 'цена покупки за шт. ($)' : 'buy price per item (USD)');
  const title = qty > 1 && Number.isFinite(totalBasis)
    ? (lang === 'ru' ? `Всего: ${formatUsd(totalBasis)} · за шт.` : `Total: ${formatUsd(totalBasis)} · per unit`)
    : (lang === 'ru' ? `Клик — ${unitHint}` : `Click — ${unitHint}`);

  const displayBasis = inputCurrency === 'rub'
    ? (Number.isFinite(basisOriginal) && basisCurrency === 'rub'
      ? formatMoney(basisOriginal, { currency: 'rub' })
      : (Number.isFinite(basisPerUnit) ? formatMoney(basisPerUnit, { currency: 'rub' }) : '—'))
    : (Number.isFinite(basisOriginal) && basisCurrency === 'usd'
      ? formatMoney(basisOriginal, { currency: 'usd' })
      : (Number.isFinite(basisPerUnit) ? formatMoney(basisPerUnit, { currency: 'usd' }) : '—'));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(e); }
      }}
      className="mono"
      title={title}
      style={{
        fontSize: 12,
        color: 'var(--fg-2)',
        cursor: 'pointer',
        borderBottom: '1px dashed rgba(255,255,255,0.2)',
        display: 'inline-block',
        maxWidth: '100%',
      }}
    >
      {displayBasis}
    </div>
  );
}

function InventoryTable({ items, onItemClick, lang, onBasisSaved }) {
  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: '40px 60px 2fr 90px 100px 110px 100px 90px',
        padding: '12px 20px', gap: 12, alignItems: 'center', fontSize: 11,
        color: 'var(--fg-3)', fontFamily: 'var(--f-mono)', letterSpacing: '0.06em', textTransform: 'uppercase',
        borderBottom: '1px solid var(--line)',
      }}>
        <div>#</div><div></div><div>Item</div><div>Qty</div>
        <div title={lang === 'ru' ? 'Себестоимость за 1 шт. (валюта переключателя сверху) — клик в строке' : 'Cost per unit (matches currency toggle) — click cell in row'}>Basis</div>
        <div>Value</div><div>P&L</div><div>Source</div>
      </div>
      {items.map((h, i) => {
        const change = (h.spark || [0, 0]).at(-1) - (h.spark || [0, 0]).at(-2);
        const lockLabel = h.tradableQty === h.qty
          ? null
          : h.tradableQty > 0
            ? `${h.qty - h.tradableQty} restricted`
            : 'restricted';
        return (
          <div key={h.marketHashName || String(h.assetid || i)} onClick={() => onItemClick && onItemClick(h)} style={{
            display: 'grid', gridTemplateColumns: '40px 60px 2fr 90px 100px 110px 100px 90px',
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
                {lockLabel && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--amber)' }}>{lockLabel}</span>}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 12 }}>{h.qty}</div>
            <BasisCell
              marketHashName={h.marketHashName}
              basisPerUnit={h.basis}
              basisOriginal={h.basisOriginal}
              basisCurrency={h.basisCurrency}
              qty={h.qty}
              totalBasis={h.totalBasis}
              lang={lang}
              onSaved={onBasisSaved}
            />
            <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{formatUsd(h.totalValue ?? h.value)}</div>
            <div className="mono" style={{ fontSize: 12, color: h.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {Number.isFinite(h.pnlPct) ? `${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(1)}%` : 'N/A'}
            </div>
            <div style={{ width: 70, height: 24 }} title={h.priceProvider}>
              <Sparkline data={h.spark} color={change >= 0 ? 'var(--green)' : 'var(--red)'} height={24} fill={false} />
            </div>
          </div>
        );
      })}
    </>
  );
}

function DashboardState({ lang, title, auth, message, error, onRetry }) {
  const loginMissingKey = error?.code === 'missing_steam_api_key' || auth?.steamApiKeyConfigured === false;
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
          {loginMissingKey && (
            <p style={{ marginTop: 12, color: 'var(--amber)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
              Add STEAM_API_KEY to .env and restart the server before Steam login.
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
