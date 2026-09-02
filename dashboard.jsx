/* global React, useT, usePortfolio, useFavoriteProfiles, compactUsd, formatMoney, formatUsd, formatHoldingValue, formatHoldingUnitPrice, formatSteamSticker, holdingUsd, holdingUnitUsd, holdingPnl, getActiveCurrency, getRubPerUsdRate, getCnyPerUsdRate, tt, localeFor */
const { useState, useRef, useMemo, useEffect, useCallback } = React;

/* ───────────────────────────────────────────────────
   PORTFOLIO DASHBOARD — API backed
   ─────────────────────────────────────────────────── */

function isShareableSteamProfile(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (/^\d{17}$/.test(raw)) return true;
  return /steamcommunity\.com\/(id|profiles)\//i.test(raw);
}

function isPublicManualShareId(value) {
  return /^manual-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function shareFxMultiplier() {
  const currency = getActiveCurrency();
  if (currency === 'rub') return getRubPerUsdRate();
  if (currency === 'cny') return getCnyPerUsdRate();
  return 1;
}

function packPnlShareCard({ value, pnl, pnlPct, cost, itemsCount, sellable, series }) {
  const fx = shareFxMultiplier() || 1;
  const money = (amount) => Math.round((Number(amount) || 0) * fx * 100) / 100;
  const payload = {
    v: money(value),
    p: money(pnl),
    r: Math.round((Number(pnlPct) || 0) * 100) / 100,
    c: money(cost),
    n: Math.round(Number(itemsCount) || 0),
    s: money(sellable),
    y: getActiveCurrency(),
    h: (Array.isArray(series) ? series : []).slice(-32).map(money),
  };
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function canShareCardFile() {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || typeof File === 'undefined') return false;
  if (!(Number(navigator.maxTouchPoints || 0) > 0)) return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

function ShareOnXButton({ card, profile, text, label, title }) {
  const fileRef = useRef(null);
  const shareRef = useRef({ url: '', ready: Promise.resolve('') });

  useEffect(() => {
    fileRef.current = null;
    let active = true;
    const fallback = `${window.location.origin}/`;
    const ready = (async () => {
      if (!card) return fallback;
      try {
        const res = await fetch('/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ card, profile: profile || '' }),
        });
        const data = res.ok ? await res.json() : null;
        if (!active || !data?.id) return fallback;
        return `${window.location.origin}/s/${data.id}`;
      } catch {
        return fallback;
      }
    })();
    shareRef.current = { url: '', ready };
    ready.then((url) => {
      if (active) shareRef.current.url = url;
    });

    if (card && canShareCardFile()) {
      fetch(`/og/pnl.png?card=${card}`)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (!active || !blob || blob.type !== 'image/png' || !blob.size) return;
          fileRef.current = new File([blob], 'skinshead-pnl.png', { type: 'image/png' });
        })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [card, profile]);

  const resolveShareUrl = async () => shareRef.current.url || shareRef.current.ready;

  const openIntent = async () => {
    const shareUrl = await resolveShareUrl();
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost"
      title={title}
      onClick={async () => {
        const file = fileRef.current;
        const shareUrl = await resolveShareUrl();
        if (!file) {
          await openIntent();
          return;
        }
        navigator.share({ files: [file], text: `${text} ${shareUrl}` }).catch((error) => {
          if (error?.name !== 'AbortError') openIntent();
        });
      }}
    >
      {label}
    </button>
  );
}

function publicPortfolioShareRef({ data, auth, publicSteamId, publicProfileUrl }) {
  const publicRef = String(publicProfileUrl || '').trim();
  if (isShareableSteamProfile(publicRef) || isPublicManualShareId(publicRef)) return publicRef;

  const currentId = String(data?.portfolioId || '').trim();
  if ((data?.portfolioType === 'manual' || data?.portfolioType === 'public-manual') && isPublicManualShareId(currentId)) {
    return currentId;
  }

  const steamIdFromPortfolio = /^\d{17}$/.test(String(data?.profile?.steamId || ''))
    ? data.profile.steamId
    : null;
  const candidates = [
    data?.profile?.profileurl,
    publicSteamId,
    steamIdFromPortfolio,
    auth?.profile?.profileurl,
    auth?.profile?.steamId,
  ];
  return candidates.map((value) => String(value || '').trim()).find(isShareableSteamProfile) || null;
}

function historyPointValue(point, priceMode) {
  if (priceMode === 'steam' && Number.isFinite(point?.steamValue) && point.steamValue > 0) {
    return point.steamValue;
  }
  return Number(point?.value);
}

function rangeWindowMs(range) {
  if (range === '7d') return 7 * 86400000;
  if (range === '90d') return 90 * 86400000;
  if (range === 'ALL') return null;
  return 30 * 86400000;
}

function PortfolioChart({ history, range, lang, priceMode = 'market' }) {
  const sourcePoints = Array.isArray(history)
    ? history.map((value, index) => ({ date: String(index + 1), value }))
    : (Array.isArray(history?.points) ? history.points : []);
  const safeData = filterHistoryPoints(sourcePoints, range, priceMode);
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const w = 1000, h = 280;
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const windowMs = rangeWindowMs(range);
  const times = safeData.map((point) => (
    point.date === today ? now : new Date(`${point.date}T12:00:00.000Z`).getTime()
  ));
  const values = safeData.map((point) => Number(point.value)).filter((value) => Number.isFinite(value));
  const hasLine = values.length >= 1;
  const minT = windowMs != null
    ? now - windowMs
    : (times.length ? Math.min(...times) : now);
  const maxT = now;
  const tRange = Math.max(1, maxT - minT);
  const chartValues = hasLine
    ? (values.length === 1 ? [values[0], values[0]] : values)
    : [0, 1];
  const min = Math.min(...chartValues) * 0.98;
  const max = Math.max(...chartValues) * 1.02;
  const yRange = max - min || 1;
  const yFor = (value) => h - ((value - min) / yRange) * (h - 40) - 20;
  const pts = hasLine
    ? safeData.map((point, index) => {
      const time = Number.isFinite(times[index]) ? times[index] : maxT;
      const x = (time - minT) / tRange * w;
      return [Math.max(0, Math.min(w, x)), yFor(point.value)];
    })
    : [];
  if (pts.length === 1) pts[0][0] = w;
  const linePts = pts.length === 1 ? [[0, pts[0][1]], [w, pts[0][1]]] : pts;
  const d = linePts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const area = linePts.length ? `${d} L ${w} ${h} L 0 ${h} Z` : '';

  const onMove = (e) => {
    if (!ref.current || !pts.length) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * w;
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < pts.length; i += 1) {
      const dist = Math.abs(pts[i][0] - x);
      if (dist < best) {
        best = dist;
        idx = i;
      }
    }
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
        {hasLine && <path d={area} fill="url(#chartFill)" />}
        {hasLine && <path d={d} stroke="url(#chartLine)" strokeWidth="2" fill="none" strokeLinejoin="round" />}
        {!hasLine && (
          <text x={w / 2} y={h / 2} textAnchor="middle" fill="rgba(255,255,255,0.45)" style={{ fontFamily: 'var(--f-mono)', fontSize: 22 }}>
            {tt(lang, { en: 'no recorded value yet', ru: 'пока нет записанной стоимости', zh: '暂无记录的价值', 'zh-TW': '暫無記錄的價值' })}
          </text>
        )}
        {hover && hasLine && (
          <g>
            <line x1={hover.x} x2={hover.x} y1="0" y2={h} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={hover.x} cy={hover.y} r="5" fill="oklch(0.68 0.22 5)" stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {hover && hasLine && (
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

function filterHistoryPoints(points, range, priceMode = 'market') {
  const clean = (Array.isArray(points) ? points : [])
    .map((point) => ({
      date: point.date,
      value: historyPointValue(point, priceMode),
    }))
    .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!clean.length || range === 'ALL') return clean;

  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const cutoff = Date.now() - days * 86400000;
  const sliced = clean.filter((point) => {
    const time = new Date(point.date).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
  return sliced.length ? sliced : clean.slice(-1);
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
          gridTemplateColumns: 'minmax(0, 1fr) 72px',
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
              gridTemplateColumns: 'minmax(0, 1fr) 72px',
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
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="glass dash-panel dash-leaders-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div className="eyebrow">{t.dash.leaders}</div>
          <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
            {t.dash.leadersHint}
          </div>
        </div>
        <div className="dash-range-switch" style={{ flexShrink: 0 }}>
          {['1d', '7d', '30d', '90d'].map((r) => (
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
    <div className="glass dash-stat-card">
      {accent && <div className="dash-stat-accent" />}
      <div className="eyebrow">{label}</div>
      <div className="display dash-stat-value">{value}</div>
      {delta && <div className="dash-stat-delta" style={{ color: deltaColor || 'var(--green)' }}>{delta}</div>}
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  );
}

function inventorySourceLabel(source, lang) {
  if (source === 'desktop') return tt(lang, { en: 'desktop · full inventory', ru: 'desktop · полный инвентарь', zh: 'desktop · 完整库存', 'zh-TW': 'desktop · 完整庫存' });
  if (source === 'manual') return tt(lang, { en: 'manual input', ru: 'ручной ввод', zh: '手动输入', 'zh-TW': '手動輸入' });
  return tt(lang, { en: 'public Steam', ru: 'публичный Steam', zh: '公开 Steam', 'zh-TW': '公開 Steam' });
}

function DesktopPairingButton({ lang, canUseDesktop, onPricing }) {
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!canUseDesktop) {
    return (
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => onPricing && onPricing()}
        title={tt(lang, {
          en: 'Desktop requires Plus / Investor',
          ru: 'Desktop доступен на Plus / Investor',
          zh: 'Desktop 需要 Plus / Investor',
          'zh-TW': 'Desktop 需要 Plus / Investor',
        })}
      >
        {tt(lang, { en: 'Desktop · Plus', ru: 'Desktop · Plus', zh: 'Desktop · Plus', 'zh-TW': 'Desktop · Plus' })}
      </button>
    );
  }

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/desktop/pairing-code', { method: 'POST' });
      setCode(data.code);
    } catch (err) {
      setCode(null);
      setError(err?.message || tt(lang, {
        en: 'Failed to create code',
        ru: 'Не удалось создать код',
        zh: '创建代码失败',
        'zh-TW': '建立代碼失敗',
      }));
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-sm btn-ghost" onClick={generate} disabled={loading}>
        {loading ? '...' : tt(lang, { en: 'Desktop code', ru: 'Код для desktop', zh: 'Desktop 代码', 'zh-TW': 'Desktop 代碼' })}
      </button>
      {code && (
        <>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--accent)', letterSpacing: '0.15em' }}>{code}</span>
          <span style={{ fontSize: 12, opacity: 0.65 }}>
            {tt(lang, { en: 'valid for 5 min', ru: 'действует 5 минут', zh: '有效期 5 分钟', 'zh-TW': '有效期 5 分鐘' })}
          </span>
        </>
      )}
      {error && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--red, #ef4444)' }}>{error}</span>}
    </div>
  );
}

const SELECTED_PORTFOLIO_KEY = 'skinshead:selectedPortfolioId';
const PRICE_MODE_KEY = 'skinshead:priceMode';

function readSelectedPortfolioId() {
  try {
    return window.sessionStorage.getItem(SELECTED_PORTFOLIO_KEY) || null;
  } catch {
    return null;
  }
}

function readPriceMode() {
  try {
    return window.localStorage.getItem(PRICE_MODE_KEY) === 'steam' ? 'steam' : 'market';
  } catch {
    return 'market';
  }
}

function writePriceMode(mode) {
  try {
    window.localStorage.setItem(PRICE_MODE_KEY, mode);
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
}

function writeSelectedPortfolioId(id) {
  try {
    if (id) window.sessionStorage.setItem(SELECTED_PORTFOLIO_KEY, String(id));
    else window.sessionStorage.removeItem(SELECTED_PORTFOLIO_KEY);
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
}

function Dashboard({ lang, onItemClick, onCollectionClick, auth, publicProfileUrl = '', onPublicProfile, onPricing }) {
  const t = useT(lang);
  // Keep the last portfolio across item-detail remounts (Dashboard unmounts on /item).
  const [selectedPortfolioId, setSelectedPortfolioIdState] = useState(() => readSelectedPortfolioId());
  const setSelectedPortfolioId = useCallback((id) => {
    const next = id || null;
    setSelectedPortfolioIdState(next);
    if (!String(next || '').startsWith('public-')) writeSelectedPortfolioId(next);
  }, []);
  const effectivePortfolioId = publicProfileUrl || String(selectedPortfolioId || '').startsWith('public-')
    ? null
    : selectedPortfolioId;
  const portfolio = usePortfolio(auth, effectivePortfolioId, publicProfileUrl);
  const favorites = useFavoriteProfiles();
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState(null);
  const [range, setRange] = useState('30d');
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [controlsOpen, setControlsOpen] = useState(false);
  const [priceMode, setPriceModeState] = useState(readPriceMode);
  const setPriceMode = useCallback((mode) => {
    const next = mode === 'steam' ? 'steam' : 'market';
    setPriceModeState(next);
    writePriceMode(next);
  }, []);
  const isSteamPrices = priceMode === 'steam';
  const prevConnectedRef = useRef(null);
  const data = portfolio.data;
  const items = data?.items || [];
  const portfolios = data?.portfolios || [];
  // Prefer the user's selection so the dropdown does not snap back to the previous
  // portfolio while a slow switch request is still in flight.
  const activePortfolioId = effectivePortfolioId || data?.portfolioId;
  const isSwitchingPortfolio = Boolean(
    portfolio.loading
    && data
    && effectivePortfolioId
    && String(data.portfolioId) !== String(effectivePortfolioId)
  );
  const isSteamPortfolio = !isSwitchingPortfolio && data?.portfolioType === 'steam';
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
    if (publicProfileUrl) return;
    if (!selectedPortfolioId && data?.portfolioId) setSelectedPortfolioId(data.portfolioId);
  }, [data?.portfolioId, publicProfileUrl, selectedPortfolioId, setSelectedPortfolioId]);

  // After a successful Steam OpenID login, land on the Steam inventory — not the last manual portfolio.
  useEffect(() => {
    if (auth?.loading) return;
    const connected = Boolean(auth?.connected);
    if (prevConnectedRef.current === false && connected && !publicProfileUrl) {
      setSelectedPortfolioId('steam');
    }
    prevConnectedRef.current = connected;
  }, [auth?.connected, auth?.loading, publicProfileUrl, setSelectedPortfolioId]);

  // Keep the dashboard mounted while switching portfolios so "Manage portfolio" stays open.
  if (portfolio.loading && !portfolio.data) {
    return <DashboardState lang={lang} title={t.dash.title} loading message={tt(lang, { en: 'Loading portfolio and prices...', ru: 'Загружаем портфель и цены...', zh: '正在加载库存与价格...', 'zh-TW': '正在載入庫存與價格...' })} />;
  }

  if (portfolio.error && !portfolio.data) {
    return <DashboardState lang={lang} title={t.dash.title} error={portfolio.error} onRetry={() => portfolio.reload(true)} />;
  }

  if (!data) return null;

  const selectedPortfolioName = portfolios.find((entry) => String(entry.id) === String(activePortfolioId))?.name
    || (activePortfolioId === 'steam' ? (tt(lang, { en: 'Steam inventory', ru: 'Steam-инвентарь', zh: 'Steam 库存', 'zh-TW': 'Steam 庫存' })) : null);

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
      setFavoriteError(error?.message || (tt(lang, { en: 'Failed to update favorites', ru: 'Не удалось обновить избранное', zh: '无法更新收藏', 'zh-TW': '無法更新收藏' })));
    } finally {
      setFavoriteBusy(false);
    }
  };

  const displayTotal = isSteamPrices
    ? (Number.isFinite(data.totalSteamValue) ? data.totalSteamValue : 0)
    : data.totalValue;
  const displayPricedCount = isSteamPrices
    ? items.reduce((sum, item) => (
      Number.isFinite(item.steamPrice) && item.steamPrice > 0
        ? sum + (Number(item.qty) > 0 ? Number(item.qty) : 1)
        : sum
    ), 0)
    : data.pricedCount;
  let displayPnl = data.pnl;
  let displayPnlPct = data.pnlPct;
  if (isSteamPrices) {
    displayPnl = 0;
    let steamBasis = 0;
    for (const item of items) {
      if (!item.hasBasis || !Number.isFinite(item.steamPrice) || item.steamPrice <= 0) continue;
      displayPnl += holdingPnl(item, 'steam').pnl || 0;
      steamBasis += Number(item.totalBasis) || 0;
    }
    displayPnlPct = steamBasis > 0 ? (displayPnl / steamBasis) * 100 : 0;
  }
  const pnlColor = displayPnl >= 0 ? 'var(--green)' : 'var(--red)';
  const marketableQty = items.reduce((sum, item) => sum + (Number(item.marketableQty) || 0), 0);
  const marketableValue = items.reduce((sum, item) => {
    const qty = Number(item.marketableQty) || 0;
    if (qty <= 0) return sum;
    if (isSteamPrices) {
      return sum + (Number.isFinite(item.steamPrice) && item.steamPrice > 0 ? item.steamPrice * qty : 0);
    }
    const unitValue = Number.isFinite(item.value) ? item.value : 0;
    return sum + unitValue * qty;
  }, 0);
  const notMarketableQty = Math.max(0, data.totalInventoryCount - marketableQty);
  const valueRows = items
    .map((item) => ({
      name: item.name || item.marketHashName || 'Unknown item',
      value: holdingUsd(item, priceMode) || 0,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const topItem = valueRows[0];
  const topItemPct = topItem && displayTotal > 0 ? (topItem.value / displayTotal) * 100 : 0;
  const topFiveValue = valueRows.slice(0, 5).reduce((sum, item) => sum + item.value, 0);
  const topFivePct = displayTotal > 0 ? (topFiveValue / displayTotal) * 100 : 0;
  const historyMeta = data.history && !Array.isArray(data.history) ? data.history : {};
  const historyPointCount = Array.isArray(historyMeta.points) ? historyMeta.points.length : 0;
  const historySince = historyMeta.since
    ? new Date(`${historyMeta.since}T12:00:00.000Z`).toLocaleDateString(localeFor(lang), { month: 'short', day: 'numeric' })
    : null;
  const historySubtitle = historyPointCount <= 1
    ? tt(lang, {
      en: 'USD · recorded portfolio value · history builds as the total changes',
      ru: 'USD · записанная стоимость портфеля · история появится по мере изменения суммы',
      zh: 'USD · 已记录的库存价值 · 总额变化后会形成历史',
      'zh-TW': 'USD · 已記錄的庫存價值 · 總額變化後會形成歷史',
    })
    : tt(lang, {
      en: `USD · recorded portfolio value · ${historyPointCount} days${historySince ? ` · since ${historySince}` : ''}`,
      ru: `USD · записанная стоимость портфеля · ${historyPointCount} дн.${historySince ? ` · с ${historySince}` : ''}`,
      zh: `USD · 已记录的库存价值 · ${historyPointCount} 天${historySince ? ` · 自 ${historySince}` : ''}`,
      'zh-TW': `USD · 已記錄的庫存價值 · ${historyPointCount} 天${historySince ? ` · 自 ${historySince}` : ''}`,
    });
  const activePortfolio = portfolios.find((entry) => String(entry.id) === String(activePortfolioId));
  const portfolioTitle = isPublicPortfolio
    ? (data.profile?.personaname || data.profile?.name || (tt(lang, { en: 'Public portfolio', ru: 'Публичный портфель', zh: '公开库存', 'zh-TW': '公開庫存' })))
    : (selectedPortfolioName
      || activePortfolio?.name
      || (isSteamPortfolio ? (tt(lang, { en: 'Steam inventory', ru: 'Steam-инвентарь', zh: 'Steam 库存', 'zh-TW': 'Steam 庫存' })) : t.dash.title));
  const sections = [
    { id: 'overview', label: tt(lang, { en: 'Overview', ru: 'Обзор', zh: '总览', 'zh-TW': '總覽' }) },
    { id: 'items', label: tt(lang, { en: 'Items', ru: 'Предметы', zh: '物品', 'zh-TW': '物品' }), count: isSwitchingPortfolio ? null : data.totalInventoryCount },
    { id: 'activity', label: tt(lang, { en: 'Activity', ru: 'История', zh: '动态', 'zh-TW': '動態' }) },
  ];

  const shareProfileRef = publicPortfolioShareRef({ data, auth, publicSteamId, publicProfileUrl });
  const shareHistoryPoints = Array.isArray(data.history)
    ? data.history.map((value) => Number(value))
    : (Array.isArray(data.history?.points)
      ? data.history.points.map((point) => historyPointValue(point, priceMode))
      : []);
  const shareCard = packPnlShareCard({
    value: displayTotal,
    pnl: displayPnl,
    pnlPct: displayPnlPct,
    cost: data.totalBasis,
    itemsCount: data.totalInventoryCount,
    sellable: marketableValue,
    series: shareHistoryPoints.filter((value) => Number.isFinite(value) && value > 0),
  });
  const sharePnlLabel = `${displayPnl >= 0 ? '+' : ''}${compactUsd(displayPnl)}`;
  const sharePctLabel = `${displayPnlPct >= 0 ? '+' : ''}${Number(displayPnlPct || 0).toFixed(2)}%`;
  const shareText = lang === 'ru'
    ? `Мой инвентарь CS2: ${compactUsd(displayTotal)}, ${sharePctLabel} (${sharePnlLabel}). Считаю в SkinsHead`
    : `My CS2 inventory is ${compactUsd(displayTotal)}, ${sharePctLabel} (${sharePnlLabel}). Tracked on SkinsHead`;

  return (
    <div className="dash-page" data-switching={isSwitchingPortfolio ? 'true' : 'false'}>
      <div className="container">
        <div className="dash-head">
          <div className="dash-head-copy">
            <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--accent)' }}>
              // {tt(lang, { en: 'PORTFOLIO', ru: 'ПОРТФЕЛЬ', zh: '库存', 'zh-TW': '庫存' })}
              {!isSwitchingPortfolio && <> · {data.totalInventoryCount} {tt(lang, { en: 'ITEMS', ru: 'ПРЕДМЕТОВ', zh: '件物品', 'zh-TW': '件物品' })}</>}
              {isSwitchingPortfolio && <> · {tt(lang, { en: 'LOADING…', ru: 'ЗАГРУЗКА…', zh: '加载中…', 'zh-TW': '載入中…' })}</>}
            </div>
            <h1 className="display dash-title">{portfolioTitle}</h1>
            <div className="dash-sync-meta">
              <span className={`dash-source-dot ${isPublicPortfolio ? 'is-public' : 'is-live'}`}></span>
              {isPublicPortfolio
                ? (tt(lang, { en: 'Public profile', ru: 'Публичный профиль', zh: '公开资料', 'zh-TW': '公開資料' }))
                : inventorySourceLabel(data.inventoryProvider, lang)}
              {data.syncedAt && (
                <span>· {tt(lang, { en: 'updated', ru: 'обновлено', zh: '已更新', 'zh-TW': '已更新' })} {new Date(data.syncedAt).toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="dash-head-actions">
            <div
              className="dash-price-toggle"
              role="radiogroup"
              aria-label={tt(lang, { en: 'Price source', ru: 'Источник цены', zh: '价格来源', 'zh-TW': '價格來源' })}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSteamPrices}
                data-active={isSteamPrices}
                onClick={() => setPriceMode('steam')}
                title={tt(lang, {
                  en: 'Steam Market listing prices',
                  ru: 'Цены торговой площадки Steam',
                  zh: 'Steam 市场挂牌价',
                  'zh-TW': 'Steam 市場掛牌價',
                })}
              >
                Steam
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!isSteamPrices}
                data-active={!isSteamPrices}
                onClick={() => setPriceMode('market')}
                title={tt(lang, {
                  en: 'Real third-party market prices',
                  ru: 'Реальные цены сторонних маркетов',
                  zh: '第三方真实市价',
                  'zh-TW': '第三方真實市價',
                })}
              >
                {tt(lang, { en: 'Real', ru: 'Реал', zh: '真实', 'zh-TW': '真實' })}
              </button>
            </div>
            {!auth?.connected && !auth?.loading && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => auth?.login && auth.login()}
                title={tt(lang, {
                  en: 'Connect your Steam account',
                  ru: 'Подключить аккаунт Steam',
                  zh: '连接 Steam 账号',
                  'zh-TW': '連線 Steam 帳號',
                })}
              >
                {tt(lang, { en: 'Link Steam', ru: 'Подключить Steam', zh: '连接 Steam', 'zh-TW': '連線 Steam' })}
              </button>
            )}
            {isPublicPortfolio && publicSteamId && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={toggleFavorite}
                disabled={favoriteBusy || favorites.loading}
                title={tt(lang, { en: 'Save profile to favorites', ru: 'Сохранить профиль в избранное', zh: '收藏此资料', 'zh-TW': '收藏此資料' })}
              >
                {favoriteBusy
                  ? '...'
                  : isFavorited
                    ? (tt(lang, { en: 'Favorited', ru: 'В избранном', zh: '已收藏', 'zh-TW': '已收藏' }))
                    : (tt(lang, { en: 'Add to favorites', ru: 'В избранное', zh: '加入收藏', 'zh-TW': '加入收藏' }))}
              </button>
            )}
            {auth?.connected && !isPublicPortfolio && (
              <DesktopPairingButton
                lang={lang}
                canUseDesktop={Boolean(auth?.entitlements?.desktopDownload)}
                onPricing={onPricing}
              />
            )}
            {!isPublicPortfolio && (
              <button
                type="button"
                className={`btn btn-sm dash-controls-trigger ${controlsOpen ? 'btn-ghost' : 'btn-primary'}`}
                onClick={() => setControlsOpen((open) => !open)}
                aria-expanded={controlsOpen}
                aria-controls="portfolio-management"
              >
                <span>{tt(lang, { en: 'Manage portfolio', ru: 'Управлять портфелем', zh: '管理库存', 'zh-TW': '管理庫存' })}</span>
                <span className="dash-controls-chevron" aria-hidden="true" />
              </button>
            )}
            <ShareOnXButton
              card={shareCard}
              profile={shareProfileRef}
              text={shareText}
              label={tt(lang, { en: 'Share on X', ru: 'В X', zh: '分享到 X', 'zh-TW': '分享到 X' })}
              title={tt(lang, { en: 'Share this portfolio on X', ru: 'Поделиться портфелем в X', zh: '分享到 X', 'zh-TW': '分享到 X' })}
            />
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => portfolio.reload(isSteamPortfolio || isPublicPortfolio)}
              title={tt(lang, { en: 'Refresh portfolio data', ru: 'Обновить данные портфеля', zh: '刷新库存数据', 'zh-TW': '重新整理庫存資料' })}
            >
              {portfolio.loading ? '...' : (tt(lang, { en: 'Refresh', ru: 'Обновить', zh: '刷新', 'zh-TW': '重新整理' }))}
            </button>
          </div>
        </div>
        {favoriteError && (
          <div style={{ marginBottom: 16, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--red)' }}>{favoriteError}</div>
        )}

        {!isPublicPortfolio && controlsOpen && (
          <div className="dash-management" id="portfolio-management">
            <div className="dash-management-head">
              <div>
                <div className="eyebrow">{tt(lang, { en: 'PORTFOLIO MANAGEMENT', ru: 'УПРАВЛЕНИЕ ПОРТФЕЛЕМ', zh: '库存管理', 'zh-TW': '庫存管理' })}</div>
                <p>
                  {tt(lang, {
                    en: 'Choose where to get data from, or add an item manually.',
                    ru: 'Выберите, откуда получить данные, или добавьте предмет вручную.',
                    zh: '选择数据来源，或手动添加物品。',
                    'zh-TW': '選擇資料來源，或手動新增物品。',
                  })}
                </p>
              </div>
              <button
                type="button"
                className="dash-management-close"
                onClick={() => setControlsOpen(false)}
                aria-label={tt(lang, { en: 'Close portfolio management', ru: 'Закрыть управление портфелем', zh: '关闭库存管理', 'zh-TW': '關閉庫存管理' })}
              >
                ×
              </button>
            </div>
            {auth?.connected && (
              <div className="dash-control-section dash-control-section--sync">
                <div className="dash-control-section-copy">
                  <span className="dash-control-index">01</span>
                  <div>
                    <h3>{tt(lang, { en: 'Steam sync', ru: 'Синхронизация Steam', zh: 'Steam 同步', 'zh-TW': 'Steam 同步' })}</h3>
                    <p>{tt(lang, { en: 'Import your full inventory through Desktop.', ru: 'Загрузите полный инвентарь через Desktop.', zh: '通过 Desktop 导入完整库存。', 'zh-TW': '透過 Desktop 匯入完整庫存。' })}</p>
                  </div>
                </div>
                <div className="dash-control-section-actions">
                  {data.desktopConnected && <span className="dash-connected-label">● desktop</span>}
                  <DesktopPairingButton
                    lang={lang}
                    canUseDesktop={Boolean(auth?.entitlements?.desktopDownload)}
                    onPricing={onPricing}
                  />
                </div>
              </div>
            )}
            <PortfolioControls
              lang={lang}
              auth={auth}
              portfolios={portfolios}
              activePortfolioId={activePortfolioId}
              portfolioType={isSwitchingPortfolio ? (activePortfolioId === 'steam' ? 'steam' : 'manual') : data.portfolioType}
              switching={isSwitchingPortfolio}
              onSelect={(id) => setSelectedPortfolioId(id)}
              onChanged={(id) => {
                if (id) setSelectedPortfolioId(id);
                portfolio.reload(false);
              }}
              onPublicProfile={onPublicProfile}
            />
          </div>
        )}

        {isSwitchingPortfolio && (
          <div className="dash-switching-banner" role="status" aria-live="polite">
            {tt(lang, {
              en: `Loading${selectedPortfolioName ? ` “${selectedPortfolioName}”` : ' portfolio'}…`,
              ru: `Загружаем портфель${selectedPortfolioName ? ` «${selectedPortfolioName}»` : ''}…`,
              zh: `正在加载${selectedPortfolioName ? `「${selectedPortfolioName}」` : '库存'}…`,
              'zh-TW': `正在載入${selectedPortfolioName ? `「${selectedPortfolioName}」` : '庫存'}…`,
            })}
          </div>
        )}

        <div className="dash-body" data-switching={isSwitchingPortfolio ? 'true' : 'false'}>
        <div className="dash-section-tabs" role="tablist" aria-label={tt(lang, { en: 'Portfolio sections', ru: 'Разделы портфеля', zh: '库存分区', 'zh-TW': '庫存分區' })}>
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              className="dash-section-tab"
              data-active={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
              {Number.isFinite(section.count) && <span>{section.count}</span>}
            </button>
          ))}
        </div>

        {activeSection === 'overview' && (
          <div className="dash-section-panel" role="tabpanel">
            <div className="dash-stats">
              <StatCard
                accent
                label={t.dash.total}
                value={compactUsd(displayTotal)}
                delta={tt(lang, {
                  en: `${displayPricedCount} of ${data.totalInventoryCount} priced`,
                  ru: `${displayPricedCount} из ${data.totalInventoryCount} оценено`,
                  zh: `${displayPricedCount} / ${data.totalInventoryCount} 已估价`,
                  'zh-TW': `${displayPricedCount} / ${data.totalInventoryCount} 已估價`,
                })}
                sub={isSteamPrices
                  ? tt(lang, {
                    en: `Real ${compactUsd(data.totalValue)}`,
                    ru: `Реал ${compactUsd(data.totalValue)}`,
                    zh: `真实 ${compactUsd(data.totalValue)}`,
                    'zh-TW': `真實 ${compactUsd(data.totalValue)}`,
                  })
                  : (Number.isFinite(data.totalSteamValue) && data.totalSteamValue > 0
                    ? tt(lang, {
                      en: `Steam ${compactUsd(data.totalSteamValue)}`,
                      ru: `Steam ${compactUsd(data.totalSteamValue)}`,
                      zh: `Steam ${compactUsd(data.totalSteamValue)}`,
                      'zh-TW': `Steam ${compactUsd(data.totalSteamValue)}`,
                    })
                    : tt(lang, {
                      en: `${data.uniqueInventoryCount} unique positions`,
                      ru: `${data.uniqueInventoryCount} уникальных позиций`,
                      zh: `${data.uniqueInventoryCount} 个独立持仓`,
                      'zh-TW': `${data.uniqueInventoryCount} 個獨立持倉`,
                    }))}
              />
              <StatCard
                label={t.dash.pnl}
                value={`${displayPnl >= 0 ? '+' : ''}${compactUsd(displayPnl)}`}
                delta={`${displayPnlPct >= 0 ? '+' : ''}${displayPnlPct.toFixed(2)}%`}
                deltaColor={pnlColor}
                sub={tt(lang, {
                  en: `Cost basis ${compactUsd(data.totalBasis)}`,
                  ru: `Себестоимость ${compactUsd(data.totalBasis)}`,
                  zh: `成本基础 ${compactUsd(data.totalBasis)}`,
                  'zh-TW': `成本基礎 ${compactUsd(data.totalBasis)}`,
                })}
              />
              <StatCard
                label={tt(lang, { en: 'SELLABLE NOW', ru: 'ДОСТУПНО К ПРОДАЖЕ', zh: '现在可售', 'zh-TW': '現在可售' })}
                value={compactUsd(marketableValue)}
                delta={tt(lang, {
                  en: `${marketableQty} of ${data.totalInventoryCount} marketable`,
                  ru: `${marketableQty} из ${data.totalInventoryCount} доступны`,
                  zh: `${marketableQty} / ${data.totalInventoryCount} 可出售`,
                  'zh-TW': `${marketableQty} / ${data.totalInventoryCount} 可出售`,
                })}
                deltaColor="var(--cyan)"
                sub={tt(lang, {
                  en: `${notMarketableQty} locked or in storage`,
                  ru: `${notMarketableQty} заблокировано или в хранилище`,
                  zh: `${notMarketableQty} 锁定或在仓库`,
                  'zh-TW': `${notMarketableQty} 鎖定或在倉庫`,
                })}
              />
              <StatCard
                label={tt(lang, { en: 'CONCENTRATION', ru: 'КОНЦЕНТРАЦИЯ', zh: '集中度', 'zh-TW': '集中度' })}
                value={topItem ? `${topItemPct.toFixed(0)}%` : '0%'}
                delta={topItem ? topItem.name : (tt(lang, { en: 'No priced items', ru: 'Нет оценённых предметов', zh: '暂无已估价物品', 'zh-TW': '暫無已估價物品' }))}
                deltaColor="var(--amber)"
                sub={tt(lang, {
                  en: `Top 5 = ${topFivePct.toFixed(0)}% of portfolio`,
                  ru: `Топ-5 = ${topFivePct.toFixed(0)}% портфеля`,
                  zh: `前 5 = 库存的 ${topFivePct.toFixed(0)}%`,
                  'zh-TW': `前 5 = 庫存的 ${topFivePct.toFixed(0)}%`,
                })}
              />
            </div>

            <div className="dash-chart-row">
              <div className="glass dash-panel">
                <div className="dash-chart-toolbar">
                  <div>
                    <div className="eyebrow">{tt(lang, { en: 'VALUE OVER TIME', ru: 'СТОИМОСТЬ ВО ВРЕМЕНИ', zh: '价值随时间', 'zh-TW': '價值隨時間' })}</div>
                    <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{historySubtitle}</div>
                  </div>
                  <div className="dash-range-switch">
                    {['7d', '30d', '90d', 'ALL'].map(r => (
                      <button key={r} onClick={() => setRange(r)} style={{
                        padding: '6px 12px', fontFamily: 'var(--f-mono)', fontSize: 11,
                        color: range === r ? 'var(--fg-0)' : 'var(--fg-3)',
                        background: range === r ? 'rgba(255,255,255,0.06)' : 'transparent',
                      }}>{r === 'ALL' ? tt(lang, { en: 'ALL', ru: 'ВСЁ', zh: '全部', 'zh-TW': '全部' }) : r}</button>
                    ))}
                  </div>
                </div>
                <PortfolioChart history={data.history} range={range} lang={lang} priceMode={priceMode} />
              </div>

              <PortfolioLeaders leaders={data.leaders} lang={lang} onItemClick={onItemClick} />
            </div>
          </div>
        )}

        {activeSection === 'items' && (
          <div className="dash-section-panel" role="tabpanel">
            {data.itemsLimited && (
              <div className="glass dash-limit-notice">
                <div style={{ fontSize: 13.5, color: 'var(--fg-1)', lineHeight: 1.5 }}>
                  {tt(lang, {
                    en: `Free plan: showing ${data.visibleInventoryCount || data.itemDisplayLimit} of ${data.totalInventoryCount} items. Plus removes the limit.`,
                    ru: `Бесплатный тариф: показаны ${data.visibleInventoryCount || data.itemDisplayLimit} из ${data.totalInventoryCount} предметов. Plus снимает лимит.`,
                    zh: `免费套餐：显示 ${data.visibleInventoryCount || data.itemDisplayLimit} / ${data.totalInventoryCount} 件物品。Plus 可解除限制。`,
                    'zh-TW': `免費方案：顯示 ${data.visibleInventoryCount || data.itemDisplayLimit} / ${data.totalInventoryCount} 件物品。Plus 可解除限制。`,
                  })}
                </div>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onPricing && onPricing()}>
                  {tt(lang, { en: 'Plans', ru: 'Тарифы', zh: '套餐', 'zh-TW': '方案' })}
                </button>
              </div>
            )}

            <div className="glass dash-inventory">
              <div className="dash-inventory-toolbar">
                <div>
                  <div className="eyebrow">{tt(lang, { en: 'PORTFOLIO ITEMS', ru: 'ПРЕДМЕТЫ ПОРТФЕЛЯ', zh: '库存物品', 'zh-TW': '庫存物品' })}</div>
                  <div className="dash-inventory-meta">
                    {filteredItems.length}/{items.length} · {data.totalInventoryCount} {tt(lang, { en: 'items', ru: 'шт.', zh: '件', 'zh-TW': '件' })}
                    {data.itemsLimited && (
                      <span style={{ color: 'var(--accent)' }}>
                        {tt(lang, {
                          en: ` · limit ${data.itemDisplayLimit}`,
                          ru: ` · лимит ${data.itemDisplayLimit}`,
                          zh: ` · 上限 ${data.itemDisplayLimit}`,
                          'zh-TW': ` · 上限 ${data.itemDisplayLimit}`,
                        })}
                      </span>
                    )}
                    {data.storageItemCount > 0 && (
                      <span> · {tt(lang, {
                        en: `storage ${data.storageItemCount}`,
                        ru: `хранилище ${data.storageItemCount}`,
                        zh: `仓库 ${data.storageItemCount}`,
                        'zh-TW': `倉庫 ${data.storageItemCount}`,
                      })}</span>
                    )}
                  </div>
                </div>
                <div className="dash-inventory-actions">
                  <input
                    className="dash-inventory-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tt(lang, { en: 'Find an item...', ru: 'Найти предмет...', zh: '查找物品...', 'zh-TW': '尋找物品...' })}
                    aria-label={tt(lang, { en: 'Search items', ru: 'Поиск по предметам', zh: '搜索物品', 'zh-TW': '搜尋物品' })}
                  />
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => downloadPortfolioCsv(items)}
                    title={tt(lang, { en: 'Export all items to CSV', ru: 'Экспортировать все предметы в CSV', zh: '导出全部物品为 CSV', 'zh-TW': '匯出全部物品為 CSV' })}
                  >
                    {tt(lang, { en: 'Export CSV', ru: 'Экспорт CSV', zh: '导出 CSV', 'zh-TW': '匯出 CSV' })}
                  </button>
                </div>
              </div>

              <div className="dash-inventory-scroll">
                <InventoryTable
                  items={filteredItems}
                  onItemClick={onItemClick}
                  onCollectionClick={onCollectionClick}
                  lang={lang}
                  portfolioId={activePortfolioId}
                  portfolioType={data.portfolioType}
                  priceMode={priceMode}
                  onBasisSaved={() => portfolio.reload(false)}
                  onItemDeleted={() => portfolio.reload(false)}
                />
              </div>
            </div>
          </div>
        )}

        {activeSection === 'activity' && (
          <div className="dash-section-panel" role="tabpanel">
            <div className="glass dash-activity-panel">
              <div className="eyebrow">{t.dash.activity}</div>
              <div className="dash-section-description">
                {tt(lang, {
                  en: 'Purchases, sales, and item quantity changes.',
                  ru: 'Покупки, продажи и изменения количества предметов.',
                  zh: '买入、卖出与物品数量变化。',
                  'zh-TW': '買入、賣出與物品數量變化。',
                })}
              </div>
              <ActivityTable
                activity={data.activity}
                portfolioId={activePortfolioId}
                portfolioType={data.portfolioType}
                lang={lang}
                onEventDeleted={() => portfolio.reload(false)}
              />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function activityKindLabel(kind, lang) {
  return tt(lang, {
    en: { added: 'Added', removed: 'Removed', qty_up: 'Qty +', qty_down: 'Qty −', updated: 'Updated' },
    ru: { added: 'Купил / добавлен', removed: 'Удалён', qty_up: 'Кол-во +', qty_down: 'Кол-во −', updated: 'Изменён' },
    zh: { added: '已添加', removed: '已移除', qty_up: '数量 +', qty_down: '数量 −', updated: '已更新' },
    'zh-TW': { added: '已新增', removed: '已移除', qty_up: '數量 +', qty_down: '數量 −', updated: '已更新' },
  })[kind] || kind;
}

function ActivityTable({ activity, portfolioId, portfolioType, lang, onEventDeleted }) {
  const rows = (Array.isArray(activity) ? activity : []).filter((row) => row && row.kind && row.at);
  const isManual = portfolioType === 'manual';
  const [deletingId, setDeletingId] = useState(null);

  if (!rows.length) {
    const empty = isManual
      ? (tt(lang, { en: 'No purchases yet', ru: 'Пока нет покупок', zh: '暂无买入记录', 'zh-TW': '暫無買入紀錄' }))
      : tt(lang, {
        en: 'Changes will appear after the next sync with a different inventory',
        ru: 'Изменения появятся после следующего синка с другим составом инвентаря',
        zh: '下次同步且库存变化后将显示动态',
        'zh-TW': '下次同步且庫存變化後將顯示動態',
      });
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

  const deleteEvent = async (row) => {
    if (!isManual || !portfolioId || !row.id) return;
    const qtyLabel = Number.isFinite(row.qtyDelta) && row.qtyDelta !== 0
      ? `${row.qtyDelta > 0 ? '+' : ''}${row.qtyDelta}`
      : '';
    const confirmText = tt(lang, {
      en: `Delete transaction “${row.name || row.marketHashName}”${qtyLabel ? ` (${qtyLabel})` : ''}?\nPosition quantity and cost basis will be recalculated.`,
      ru: `Удалить транзакцию «${row.name || row.marketHashName}»${qtyLabel ? ` (${qtyLabel})` : ''}?\nКоличество и себестоимость позиции будут пересчитаны.`,
      zh: `删除交易「${row.name || row.marketHashName}」${qtyLabel ? ` (${qtyLabel})` : ''}？\n将重新计算持仓数量与成本。`,
      'zh-TW': `刪除交易「${row.name || row.marketHashName}」${qtyLabel ? ` (${qtyLabel})` : ''}？\n將重新計算持倉數量與成本。`,
    });
    if (!window.confirm(confirmText)) return;

    setDeletingId(row.id);
    try {
      await apiFetch(
        `/api/portfolios/${encodeURIComponent(portfolioId)}/events/${encodeURIComponent(row.id)}`,
        { method: 'DELETE' },
      );
      if (onEventDeleted) onEventDeleted();
    } catch (err) {
      window.alert(err.message || (tt(lang, { en: 'Could not delete transaction', ru: 'Не удалось удалить транзакцию', zh: '无法删除交易', 'zh-TW': '無法刪除交易' })));
    }
    setDeletingId(null);
  };

  return (
    <div style={{ marginTop: 14, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isManual ? 620 : 480 }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'left' }}>{tt(lang, { en: 'Date', ru: 'Дата', zh: '日期', 'zh-TW': '日期' })}</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>{tt(lang, { en: 'Action', ru: 'Действие', zh: '操作', 'zh-TW': '操作' })}</th>
            <th style={{ ...headerStyle, textAlign: 'left' }}>{tt(lang, { en: 'Item', ru: 'Предмет', zh: '物品', 'zh-TW': '物品' })}</th>
            <th style={{ ...headerStyle, textAlign: 'right' }}>{tt(lang, { en: 'Qty', ru: 'Кол-во', zh: '数量', 'zh-TW': '數量' })}</th>
            {isManual && (
              <th style={{ ...headerStyle, textAlign: 'right' }}>{tt(lang, { en: 'Basis', ru: 'Цена/шт.', zh: '成本', 'zh-TW': '成本' })}</th>
            )}
            {isManual && <th style={{ ...headerStyle, textAlign: 'right' }} />}
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
              ? formatMoney(row.basisPerUnit, {
                currency: row.currency === 'rub' || row.currency === 'rur'
                  ? 'rub'
                  : (row.currency === 'cny' ? 'cny' : 'usd'),
                digits: 2,
              })
              : '—';
            const canDelete = isManual && portfolioId && row.id;
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
                {isManual && (
                  <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {canDelete ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={deletingId === row.id}
                        onClick={() => deleteEvent(row)}
                        title={tt(lang, { en: 'Delete transaction and recalculate position', ru: 'Удалить транзакцию и пересчитать позицию', zh: '删除交易并重新计算持仓', 'zh-TW': '刪除交易並重新計算持倉' })}
                      >
                        {deletingId === row.id ? '...' : (tt(lang, { en: 'Delete', ru: 'Удалить', zh: '删除', 'zh-TW': '刪除' }))}
                      </button>
                    ) : null}
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

function PortfolioControls({ lang, auth, portfolios, activePortfolioId, portfolioType, switching = false, onSelect, onChanged, onPublicProfile }) {
  const t = useT(lang);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [naming, setNaming] = useState(false);
  const [profileUrl, setProfileUrl] = useState('');
  const [profileUrlError, setProfileUrlError] = useState('');
  const manualActive = portfolioType === 'manual' && activePortfolioId;

  const createPortfolio = async () => {
    const title = name.trim() || (tt(lang, { en: 'Manual portfolio', ru: 'Ручной портфель', zh: '手动库存', 'zh-TW': '手動庫存' }));
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
      window.alert(err.message || (tt(lang, { en: 'Could not create portfolio', ru: 'Не удалось создать портфель', zh: '无法创建库存', 'zh-TW': '無法建立庫存' })));
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

  return (
    <div className="dash-portfolio-controls">
      <section className="dash-control-section">
        <div className="dash-control-section-copy">
          <span className="dash-control-index">{auth?.connected ? '02' : '01'}</span>
          <div>
            <h3>{tt(lang, { en: 'My portfolios', ru: 'Мои портфели', zh: '我的库存', 'zh-TW': '我的庫存' })}</h3>
            <p>{tt(lang, { en: 'Switch portfolios or create a manual one.', ru: 'Переключитесь на существующий или создайте ручной портфель.', zh: '切换库存或创建手动库存。', 'zh-TW': '切換庫存或建立手動庫存。' })}</p>
          </div>
        </div>
        <div className="dash-control-fields">
          {!auth?.connected && (
            <button className="btn btn-sm btn-primary" onClick={() => auth?.login && auth.login()}>
              {tt(lang, { en: 'Link Steam', ru: 'Подключить Steam', zh: '连接 Steam', 'zh-TW': '連線 Steam' })}
            </button>
          )}
          <select
            value={activePortfolioId || ''}
            onChange={(e) => onSelect(e.target.value || null)}
            aria-label={tt(lang, { en: 'Choose portfolio', ru: 'Выбрать портфель', zh: '选择库存', 'zh-TW': '選擇庫存' })}
            aria-busy={switching ? 'true' : 'false'}
            style={portfolioInputStyle({
              flex: '1 1 220px',
              minWidth: 180,
              height: 34,
              borderColor: switching ? 'var(--accent)' : undefined,
            })}
          >
            {!activePortfolioId && <option value="">{tt(lang, { en: 'Choose a portfolio', ru: 'Выберите портфель', zh: '请选择库存', 'zh-TW': '請選擇庫存' })}</option>}
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.type === 'steam' ? 'Steam · ' : ''}{portfolio.name}{portfolio.itemCount != null ? ` (${portfolio.itemCount})` : ''}
              </option>
            ))}
          </select>
          {naming ? (
            <div className="dash-control-inline-form">
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
                placeholder={tt(lang, { en: 'Portfolio name', ru: 'Название портфеля', zh: '库存名称', 'zh-TW': '庫存名稱' })}
                aria-label={tt(lang, { en: 'New portfolio name', ru: 'Название нового портфеля', zh: '新库存名称', 'zh-TW': '新庫存名稱' })}
                style={portfolioInputStyle({ flex: '1 1 180px', minWidth: 150, height: 34 })}
              />
              <button className="btn btn-sm btn-primary" onClick={createPortfolio} disabled={creating}>
                {creating ? '...' : (tt(lang, { en: 'Create', ru: 'Создать', zh: '创建', 'zh-TW': '建立' }))}
              </button>
              <button
                className="btn btn-sm btn-ghost"
                type="button"
                onClick={() => {
                  setNaming(false);
                  setName('');
                }}
              >
                {tt(lang, { en: 'Cancel', ru: 'Отмена', zh: '取消', 'zh-TW': '取消' })}
              </button>
            </div>
          ) : (
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => setNaming(true)}>
              {tt(lang, { en: '+ New manual', ru: '+ Новый ручной', zh: '+ New manual', 'zh-TW': '+ New manual' })}
            </button>
          )}
        </div>
      </section>

      <section className="dash-control-section">
        <div className="dash-control-section-copy">
          <span className="dash-control-index">{auth?.connected ? '03' : '02'}</span>
          <div>
            <h3>{tt(lang, { en: 'Open Steam profile', ru: 'Открыть Steam-профиль', zh: 'Open Steam profile', 'zh-TW': 'Open Steam profile' })}</h3>
            <p>{tt(lang, { en: 'View a public inventory without changing your portfolios.', ru: 'Посмотрите публичный инвентарь, не меняя свои портфели.', zh: 'View a public inventory without changing your portfolios.', 'zh-TW': 'View a public inventory without changing your portfolios.' })}</p>
          </div>
        </div>
        <form onSubmit={submitProfileUrl} className="dash-control-fields">
          <input
            value={profileUrl}
            onChange={(e) => {
              setProfileUrl(e.target.value);
              if (profileUrlError) setProfileUrlError('');
            }}
            placeholder={t.hero.profileUrlPlaceholder}
            aria-label={t.hero.profileUrlCta}
            style={portfolioInputStyle({ flex: '1 1 260px', minWidth: 180, height: 34 })}
          />
          <button className="btn btn-sm btn-ghost" type="submit">
            {tt(lang, { en: 'Open', ru: 'Открыть', zh: 'Open', 'zh-TW': 'Open' })}
          </button>
          {profileUrlError && <span className="dash-control-error">{profileUrlError}</span>}
        </form>
      </section>

      <section className="dash-control-section dash-control-section--manual">
        <div className="dash-control-section-copy">
          <span className="dash-control-index">{auth?.connected ? '04' : '03'}</span>
          <div>
            <h3>{tt(lang, { en: 'Add an item manually', ru: 'Добавить предмет вручную', zh: 'Add an item manually', 'zh-TW': 'Add an item manually' })}</h3>
            <p>
              {manualActive
                ? (tt(lang, { en: 'Find an item, then enter quantity and purchase price.', ru: 'Найдите предмет, укажите количество и цену покупки.', zh: 'Find an item, then enter quantity and purchase price.', 'zh-TW': 'Find an item, then enter quantity and purchase price.' }))
                : (tt(lang, { en: 'Choose or create a manual portfolio first.', ru: 'Сначала выберите или создайте ручной портфель.', zh: 'Choose or create a manual portfolio first.', 'zh-TW': 'Choose or create a manual portfolio first.' }))}
            </p>
          </div>
        </div>
        <ManualItemForm
          lang={lang}
          portfolioId={manualActive ? activePortfolioId : null}
          onSaved={() => onChanged(activePortfolioId)}
        />
      </section>
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
      window.alert(err.message || (tt(lang, { en: 'Could not add item', ru: 'Не удалось добавить предмет', zh: 'Could not add item', 'zh-TW': 'Could not add item' })));
    }
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="dash-manual-item-form">
      <div className="dash-control-fields">
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
            placeholder={tt(lang, { en: 'AK-47 | Redline (Field-Tested)', ru: 'AK-47 | Redline (Field-Tested)', zh: 'AK-47 | Redline (Field-Tested)', 'zh-TW': 'AK-47 | Redline (Field-Tested)' })}
            aria-label={tt(lang, { en: 'Item name', ru: 'Название предмета', zh: 'Item name', 'zh-TW': 'Item name' })}
            disabled={!portfolioId}
            style={portfolioInputStyle({ width: '100%', height: 34 })}
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
                  {tt(lang, { en: 'Searching items...', ru: 'Ищу предметы...', zh: 'Searching items...', 'zh-TW': 'Searching items...' })}
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
          title={tt(lang, { en: 'Quantity', ru: 'Количество', zh: '数量', 'zh-TW': '數量' })}
          aria-label={tt(lang, { en: 'Quantity', ru: 'Количество', zh: '数量', 'zh-TW': '數量' })}
          style={portfolioInputStyle({ width: 80, height: 34 })}
        />
        <input
          value={basisPerUnit}
          onChange={(e) => setBasisPerUnit(e.target.value)}
          placeholder={currency === 'rub' ? '₽ / шт.' : currency === 'cny' ? '¥ / 件' : '$ / item'}
          disabled={!portfolioId}
          aria-label={tt(lang, { en: 'Purchase price per item', ru: 'Цена покупки за штуку', zh: 'Purchase price per item', 'zh-TW': 'Purchase price per item' })}
          style={portfolioInputStyle({ width: 120, height: 34 })}
        />
        <button className="btn btn-sm btn-primary" disabled={!portfolioId || saving}>
          {saving ? '...' : (tt(lang, { en: 'Add', ru: 'Добавить', zh: 'Add', 'zh-TW': 'Add' }))}
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

  const editHint = editable ? (tt(lang, { en: ' · click to edit', ru: ' · клик, чтобы изменить', zh: ' · click to edit', 'zh-TW': ' · click to edit' })) : '';
  const titleTotal = hasBasis && qty > 1
    ? ((basisCurrency === 'rub' || basisCurrency === 'cny') && Number.isFinite(basisOriginal)
      ? formatMoney(basisOriginal * qty, { currency: basisCurrency })
      : (Number.isFinite(totalBasis) ? formatUsd(totalBasis) : null))
    : null;
  const title = (titleTotal
    ? tt(lang, {
      en: `Total: ${titleTotal} · per unit`,
      ru: `Всего: ${titleTotal} · за шт.`,
      zh: `合计: ${titleTotal} · 每件`,
      'zh-TW': `合計: ${titleTotal} · 每件`,
    })
    : (tt(lang, { en: 'Buy price per item', ru: 'Цена покупки за шт.', zh: '每件买入价', 'zh-TW': '每件買入價' }))) + editHint;

  // basisOriginal keeps the exact amount the user typed in its original currency.
  // When the active currency differs, convert the USD basis (basisPerUnit) instead of
  // formatting the USD number as if it were already in the active currency.
  const displayBasis = !hasBasis
    ? (tt(lang, { en: 'not set', ru: 'не задан', zh: 'not set', 'zh-TW': 'not set' }))
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

function periodPct(item, key) {
  const value = Number(item?.[key]);
  return Number.isFinite(value) ? value : null;
}

function PeriodChangeCell({ pct }) {
  if (!Number.isFinite(pct)) {
    return <div className="mono inv-change" data-empty="true">—</div>;
  }
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const sign = pct > 0 ? '+' : '';
  return (
    <div className="mono inv-change" data-dir={dir} title={`${sign}${pct.toFixed(2)}%`}>
      {`${sign}${pct.toFixed(1)}%`}
    </div>
  );
}

function InventoryTable({ items, onItemClick, onCollectionClick, lang, portfolioId, portfolioType, priceMode = 'market', onBasisSaved, onItemDeleted }) {
  const [editingItemId, setEditingItemId] = useState(null);
  const [editDraft, setEditDraft] = useState({ quantity: '', basisPerUnit: '' });
  const [addingItemId, setAddingItemId] = useState(null);
  const [addDraft, setAddDraft] = useState({ quantity: '1', basisPerUnit: '' });
  const [savingItemId, setSavingItemId] = useState(null);
  const [sortKey, setSortKey] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const isSteamPortfolio = portfolioType === 'steam';
  const isSteamPrices = priceMode === 'steam';

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
      } else if (sortKey === 'price') {
        cmp = (num(holdingUnitUsd(a, priceMode)) ?? -Infinity) - (num(holdingUnitUsd(b, priceMode)) ?? -Infinity);
      } else if (sortKey === 'value') {
        cmp = (num(holdingUsd(a, priceMode)) ?? -Infinity) - (num(holdingUsd(b, priceMode)) ?? -Infinity);
      } else if (sortKey === 'change1d' || sortKey === 'change7d' || sortKey === 'change30d') {
        cmp = (num(periodPct(a, sortKey)) ?? -Infinity) - (num(periodPct(b, sortKey)) ?? -Infinity);
      } else if (sortKey === 'pnl') {
        const aPnl = num(holdingPnl(a, priceMode).pnlPct);
        const bPnl = num(holdingPnl(b, priceMode).pnlPct);
        cmp = (aPnl ?? -Infinity) - (bPnl ?? -Infinity);
      }
      if (cmp === 0) {
        cmp = String(a.name || a.marketHashName || '').localeCompare(String(b.name || b.marketHashName || ''), undefined, { sensitivity: 'base' });
      }
      return cmp * dir;
    });
    return list;
  }, [items, sortKey, sortDir, priceMode]);

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
    setAddingItemId(null);
    setAddDraft({ quantity: '1', basisPerUnit: '' });
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

  const startAddToPosition = (item, event) => {
    event.stopPropagation();
    setEditingItemId(null);
    setEditDraft({ quantity: '', basisPerUnit: '' });
    setAddingItemId(rowEditKey(item));
    setAddDraft({ quantity: '1', basisPerUnit: '' });
  };

  const cancelAddToPosition = (event) => {
    event.stopPropagation();
    setAddingItemId(null);
    setAddDraft({ quantity: '1', basisPerUnit: '' });
  };

  const saveAddToPosition = async (item, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!portfolioId || !item.marketHashName) return;
    const quantity = Number(String(addDraft.quantity).trim().replace(',', '.'));
    const basisPerUnit = Number(String(addDraft.basisPerUnit).trim().replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(basisPerUnit) || basisPerUnit < 0) {
      window.alert(tt(lang, { en: 'Enter a valid quantity and price.', ru: 'Укажи корректное количество и цену.', zh: 'Enter a valid quantity and price.', 'zh-TW': 'Enter a valid quantity and price.' }));
      return;
    }

    setSavingItemId(rowEditKey(item));
    try {
      await apiFetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketHashName: item.marketHashName,
          name: item.name || item.marketHashName,
          quantity,
          basisPerUnit,
          currency: getActiveCurrency(),
          iconUrl: item.iconUrl,
          marketUrl: item.marketUrl,
          category: item.category,
          rarity: item.rarity,
          wear: item.wear,
          tier: item.tier,
        }),
      });
      setAddingItemId(null);
      setAddDraft({ quantity: '1', basisPerUnit: '' });
      if (onBasisSaved) onBasisSaved();
    } catch (err) {
      window.alert(err.message || (tt(lang, { en: 'Could not add item', ru: 'Не удалось добавить предмет', zh: 'Could not add item', 'zh-TW': 'Could not add item' })));
    }
    setSavingItemId(null);
  };

  const saveManualEdit = async (item, event) => {
    event.stopPropagation();
    if (!portfolioId) return;
    const basisPerUnit = Number(String(editDraft.basisPerUnit).trim().replace(',', '.'));

    // Steam inventory rows: only the cost basis is editable (quantity comes from Steam).
    if (isSteamPortfolio) {
      if (!Number.isFinite(basisPerUnit) || basisPerUnit < 0) {
        window.alert(tt(lang, { en: 'Enter a valid buy price.', ru: 'Укажи корректную цену покупки.', zh: 'Enter a valid buy price.', 'zh-TW': 'Enter a valid buy price.' }));
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
        window.alert(err.message || (tt(lang, { en: 'Could not save', ru: 'Не удалось сохранить', zh: 'Could not save', 'zh-TW': 'Could not save' })));
      }
      setSavingItemId(null);
      return;
    }

    if (!item.manualItemId) return;
    const quantity = Number(String(editDraft.quantity).trim().replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(basisPerUnit) || basisPerUnit < 0) {
      window.alert(tt(lang, { en: 'Enter a valid quantity and price.', ru: 'Укажи корректное количество и цену.', zh: 'Enter a valid quantity and price.', 'zh-TW': 'Enter a valid quantity and price.' }));
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
      window.alert(err.message || (tt(lang, { en: 'Could not save', ru: 'Не удалось сохранить', zh: 'Could not save', 'zh-TW': 'Could not save' })));
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
      window.alert(err.message || (tt(lang, { en: 'Could not delete item', ru: 'Не удалось удалить предмет', zh: '无法删除物品', 'zh-TW': '無法刪除物品' })));
    }
  };

  return (
    <>
      <div className="inv-grid inv-grid-head">
        <div>#</div><div></div>
        <SortHeader label={tt(lang, { en: 'Item', ru: 'Предмет', zh: '物品', 'zh-TW': '物品' })} column="name" />
        <SortHeader label={tt(lang, { en: 'Qty', ru: 'Кол-во', zh: '数量', 'zh-TW': '數量' })} column="qty" />
        <SortHeader
          label={tt(lang, { en: 'Basis', ru: 'Покупка', zh: '成本', 'zh-TW': '成本' })}
          column="basis"
          title={tt(lang, { en: 'Cost per unit. Change it from the Edit button.', ru: 'Себестоимость за 1 шт. Меняется через кнопку Изменить.', zh: '单件成本。通过“编辑”按钮修改。', 'zh-TW': '單件成本。透過「編輯」按鈕修改。' })}
        />
        <SortHeader
          label={tt(lang, { en: 'Now', ru: 'За шт.', zh: '现价', 'zh-TW': '現價' })}
          column="price"
          title={tt(lang, {
            en: 'Current market price per item.',
            ru: 'Текущая цена за 1 шт.',
            zh: '当前单件市价。',
            'zh-TW': '目前單件市價。',
          })}
        />
        <SortHeader
          label={tt(lang, { en: 'Value', ru: 'Стоимость', zh: '价值', 'zh-TW': '價值' })}
          column="value"
          title={isSteamPrices
            ? tt(lang, {
              en: 'Steam Market listing price. Real market mark is shown underneath.',
              ru: 'Ценник Steam. Реальная оценка маркета — строкой ниже.',
              zh: 'Steam 市场挂牌价。真实市价显示在下方。',
              'zh-TW': 'Steam 市場掛牌價。真實市價顯示在下方。',
            })
            : tt(lang, {
              en: 'Cash-market mark. Steam list price is shown underneath.',
              ru: 'Оценка по сторонним маркетам. Ценник Steam — строкой ниже.',
              zh: '第三方市场价格。Steam 标价显示在下方。',
              'zh-TW': '第三方市場價格。Steam 標價顯示在下方。',
            })}
        />
        <SortHeader
          label="1d"
          column="change1d"
          title={tt(lang, { en: 'Price change over 1 day', ru: 'Изменение цены за 1 день', zh: '1 日涨跌', 'zh-TW': '1 日漲跌' })}
        />
        <SortHeader
          label="7d"
          column="change7d"
          title={tt(lang, { en: 'Price change over 7 days', ru: 'Изменение цены за 7 дней', zh: '7 日涨跌', 'zh-TW': '7 日漲跌' })}
        />
        <SortHeader
          label="30d"
          column="change30d"
          title={tt(lang, { en: 'Price change over 30 days', ru: 'Изменение цены за 30 дней', zh: '30 日涨跌', 'zh-TW': '30 日漲跌' })}
        />
        <SortHeader label={tt(lang, { en: 'P&L', ru: 'Доход', zh: '盈亏', 'zh-TW': '盈虧' })} column="pnl" />
        <div>{tt(lang, { en: 'Source', ru: 'Источник', zh: 'Source', 'zh-TW': 'Source' })}</div>
      </div>
      {sortedItems.map((h, i) => {
        const change = (h.spark || [0, 0]).at(-1) - (h.spark || [0, 0]).at(-2);
        const isEditing = editingItemId === rowEditKey(h);
        const isAdding = addingItemId === rowEditKey(h);
        const basisEditable = (portfolioType === 'manual' && h.manualItemId) || isSteamPortfolio;
        const steamSticker = formatSteamSticker(h);
        const rowPnl = holdingPnl(h, priceMode);
        const altValue = isSteamPrices
          ? (Number.isFinite(h.totalValue) || Number.isFinite(h.value) ? formatHoldingValue(h, { digits: 0, compact: true }) : null)
          : steamSticker;
        const altLabel = isSteamPrices
          ? tt(lang, { en: 'Real', ru: 'Реал', zh: '真实', 'zh-TW': '真實' })
          : 'Steam';
        const unitPrice = formatHoldingUnitPrice(h, { source: priceMode });
        const altUnitPrice = isSteamPrices
          ? formatHoldingUnitPrice(h, { source: 'market' })
          : formatHoldingUnitPrice(h, { source: 'steam' });
        const lockLabel = h.tradableQty === h.qty
          ? null
          : h.tradableQty > 0
            ? tt(lang, {
              en: `${h.qty - h.tradableQty} restricted`,
              ru: `${h.qty - h.tradableQty} заблок.`,
              zh: `${h.qty - h.tradableQty} 受限`,
              'zh-TW': `${h.qty - h.tradableQty} 受限`,
            })
            : (tt(lang, { en: 'restricted', ru: 'заблокировано', zh: '受限', 'zh-TW': '受限' }));
        return (
          <div
            key={h.marketHashName ? `${h.marketHashName}::${h.assetIds?.[0] || h.assetid || i}` : String(h.assetid || i)}
            className="inv-grid inv-grid-row"
            data-last={i >= sortedItems.length - 1}
            onClick={() => onItemClick && onItemClick(h)}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</div>
            {h.iconUrl
              ? <img src={h.iconUrl} alt="" style={{ width: 50, height: 32, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }} />
              : <div style={{ width: 50, height: 32, borderRadius: 6, background: `linear-gradient(135deg, var(--rar-${h.tier}), #0a0c11)`, opacity: 0.8, border: '1px solid var(--line)' }}></div>}
            <div className="inv-item-cell">
              <div className="inv-item-name">{h.name}</div>
              {h.collection && (
                <div style={{ marginTop: 4 }}>
                  <CollectionChip
                    collection={h.collection}
                    collectionSlug={h.collectionSlug}
                    lang={lang}
                    onCollectionClick={onCollectionClick}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                {h.marketableQty > 0 && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--green)' }}>{tt(lang, { en: 'marketable', ru: 'можно продать', zh: '可出售', 'zh-TW': '可出售' })}</span>}
                {h.assetIds?.length > 1 && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{tt(lang, {
                  en: `${h.assetIds.length} stacks merged`,
                  ru: `${h.assetIds.length} объединено`,
                  zh: `${h.assetIds.length} 已合并`,
                  'zh-TW': `${h.assetIds.length} 已合併`,
                })}</span>}
                {(h.inStorage || h.storageQty > 0) && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--cyan)' }} title={h.storageUnitName || ''}>
                    {tt(lang, { en: 'storage', ru: 'хранилище', zh: '仓库', 'zh-TW': '倉庫' })}{h.storageUnitName ? ` · ${h.storageUnitName}` : ''}
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
                placeholder={getActiveCurrency() === 'rub' ? '₽ / шт.' : getActiveCurrency() === 'cny' ? '¥ / 件' : '$ / item'}
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
            <div className="inv-value-cell">
              <div className="mono inv-value-mark">{unitPrice || 'N/A'}</div>
              {altUnitPrice && altUnitPrice !== unitPrice && (
                <div className="inv-value-steam">{altLabel} {altUnitPrice}</div>
              )}
            </div>
            <div className="inv-value-cell">
              <div className="mono inv-value-mark">{formatHoldingValue(h, { source: priceMode }) || 'N/A'}</div>
              {altValue && <div className="inv-value-steam">{altLabel} {altValue}</div>}
            </div>
            <PeriodChangeCell pct={periodPct(h, 'change1d')} />
            <PeriodChangeCell pct={periodPct(h, 'change7d')} />
            <PeriodChangeCell pct={periodPct(h, 'change30d')} />
            <div className="mono" style={{ fontSize: 12, color: Number.isFinite(rowPnl.pnlPct) ? (rowPnl.pnl >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--fg-3)' }}>
              {Number.isFinite(rowPnl.pnlPct) ? `${rowPnl.pnlPct >= 0 ? '+' : ''}${rowPnl.pnlPct.toFixed(1)}%` : 'N/A'}
            </div>
            <div style={{ minWidth: 0 }} title={h.priceProvider}>
              {portfolioType === 'manual' && h.manualItemId ? (
                <div className="inv-row-actions">
                  {isEditing ? (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={(event) => saveManualEdit(h, event)} disabled={savingItemId === h.manualItemId}>
                        {savingItemId === h.manualItemId ? '...' : (tt(lang, { en: 'Save', ru: 'Сохранить', zh: '保存', 'zh-TW': '儲存' }))}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={cancelManualEdit}>
                        {tt(lang, { en: 'Cancel', ru: 'Отмена', zh: '取消', 'zh-TW': '取消' })}
                      </button>
                    </>
                  ) : isAdding ? (
                    <form
                      className="inv-add-lot-form"
                      onClick={(event) => event.stopPropagation()}
                      onSubmit={(event) => saveAddToPosition(h, event)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') cancelAddToPosition(event);
                      }}
                    >
                      <input
                        value={addDraft.quantity}
                        onChange={(event) => setAddDraft((draft) => ({ ...draft, quantity: event.target.value }))}
                        type="number"
                        min="1"
                        step="1"
                        title={tt(lang, { en: 'Quantity to add', ru: 'Сколько добавить', zh: 'Quantity to add', 'zh-TW': 'Quantity to add' })}
                        aria-label={tt(lang, { en: 'Quantity to add', ru: 'Сколько добавить', zh: 'Quantity to add', 'zh-TW': 'Quantity to add' })}
                        style={portfolioInputStyle({ width: 56, fontFamily: 'var(--f-mono)' })}
                      />
                      <input
                        autoFocus
                        value={addDraft.basisPerUnit}
                        onChange={(event) => setAddDraft((draft) => ({ ...draft, basisPerUnit: event.target.value }))}
                        placeholder={getActiveCurrency() === 'rub' ? '₽ / шт.' : getActiveCurrency() === 'cny' ? '¥ / 件' : '$ / item'}
                        title={tt(lang, { en: 'Purchase price per item', ru: 'Цена покупки за штуку', zh: 'Purchase price per item', 'zh-TW': 'Purchase price per item' })}
                        aria-label={tt(lang, { en: 'Purchase price per item', ru: 'Цена покупки за штуку', zh: 'Purchase price per item', 'zh-TW': 'Purchase price per item' })}
                        style={portfolioInputStyle({ width: 88, fontFamily: 'var(--f-mono)' })}
                      />
                      <button className="btn btn-sm btn-primary" type="submit" disabled={savingItemId === rowEditKey(h)}>
                        {savingItemId === rowEditKey(h) ? '...' : (tt(lang, { en: 'Add', ru: 'Добавить', zh: 'Add', 'zh-TW': 'Add' }))}
                      </button>
                      <button className="btn btn-sm btn-ghost" type="button" onClick={cancelAddToPosition}>
                        {tt(lang, { en: 'Cancel', ru: 'Отмена', zh: '取消', 'zh-TW': '取消' })}
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm inv-row-add"
                        onClick={(event) => startAddToPosition(h, event)}
                        title={tt(lang, { en: 'Add to this position', ru: 'Добавить в эту позицию', zh: 'Add to this position', 'zh-TW': 'Add to this position' })}
                        aria-label={tt(lang, { en: 'Add to this position', ru: 'Добавить в эту позицию', zh: 'Add to this position', 'zh-TW': 'Add to this position' })}
                      >
                        +
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={(event) => startManualEdit(h, event)}>
                        {tt(lang, { en: 'Edit', ru: 'Изменить', zh: '编辑', 'zh-TW': '編輯' })}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={(event) => deleteManualItem(h, event)}>
                        {tt(lang, { en: 'Delete', ru: 'Удалить', zh: '删除', 'zh-TW': '刪除' })}
                      </button>
                    </>
                  )}
                </div>
              ) : isSteamPortfolio && isEditing ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-sm btn-primary" onClick={(event) => saveManualEdit(h, event)} disabled={savingItemId === (h.manualItemId || h.marketHashName)}>
                    {savingItemId === (h.manualItemId || h.marketHashName) ? '...' : (tt(lang, { en: 'Save', ru: 'Сохранить', zh: '保存', 'zh-TW': '儲存' }))}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={cancelManualEdit}>
                    {tt(lang, { en: 'Cancel', ru: 'Отмена', zh: '取消', 'zh-TW': '取消' })}
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

function portfolioLoadLabels(lang) {
  return tt(lang, {
    en: ['Reading inventory', 'Matching prices', 'Building analytics'],
    ru: ['Читаем инвентарь', 'Сверяем цены', 'Строим аналитику'],
    zh: ['读取库存', '匹配价格', '生成分析'],
    'zh-TW': ['讀取庫存', '匹配價格', '產生分析'],
  });
}

function portfolioLoadStep(progress) {
  if (progress < 34) return 0;
  if (progress < 68) return 1;
  return 2;
}

function useSimulatedLoadProgress(active) {
  const [pct, setPct] = useState(active ? 3 : 0);

  useEffect(() => {
    if (!active) {
      setPct(0);
      return undefined;
    }

    setPct(3);
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now) => {
      const elapsed = (now - startedAt) / 1000;
      const next = Math.min(96, Math.round(3 + 93 * (1 - Math.exp(-elapsed / 2.6))));
      setPct((current) => (current === next ? current : next));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return pct;
}

function PortfolioLoadingVisual({ lang, progress = 0 }) {
  const labels = portfolioLoadLabels(lang);
  const step = portfolioLoadStep(progress);
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
            <img src="assets/hero-glove-case-steam.png" alt="" />
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
          <span key={label} className={index === step ? 'is-active' : undefined}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function DashboardState({ lang, title, auth, message, error, onRetry, loading = false }) {
  const suggestSteamApiKey = auth?.steamApiKeyConfigured === false;
  const progress = useSimulatedLoadProgress(loading);
  const labels = portfolioLoadLabels(lang);
  const step = portfolioLoadStep(progress);
  const text = error
    ? errorMessage(error, lang)
    : message || tt(lang, {
      en: 'Connect Steam to read your public CS2 inventory and value the portfolio.',
      ru: 'Подключи Steam аккаунт, чтобы прочитать публичный CS2 inventory и оценить портфель.',
      zh: '连接 Steam 以读取公开 CS2 库存并估算价值。',
      'zh-TW': '連線 Steam 以讀取公開 CS2 庫存並估算價值。',
    });

  return (
    <div className={loading ? 'dashboard-state dashboard-state--loading' : 'dashboard-state'}>
      <div className="container">
        <div className={`glass dashboard-state__card${loading ? ' dashboard-state__card--loading' : ''}`}>
          <div className="dashboard-state__copy">
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>{loading ? '// LIVE PORTFOLIO SYNC' : '// REAL DATA MVP'}</div>
            <h1 className="display">{title}</h1>
            <p aria-live="polite">{text}</p>
            {loading && (
              <div
                className="dashboard-state__progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={labels[step]}
              >
                <div className="dashboard-state__progress-meta">
                  <span className="dashboard-state__progress-step">{labels[step]}</span>
                  <span className="dashboard-state__progress-pct">{progress}%</span>
                </div>
                <div className="dashboard-state__progress-track">
                  <span className="dashboard-state__progress-fill" style={{ width: `${progress}%` }}></span>
                </div>
              </div>
            )}
            {suggestSteamApiKey && !loading && (
              <p className="dashboard-state__warning">
                {tt(lang, {
                  en: 'Add STEAM_API_KEY to .env and restart the server for Steam display names and avatars (login works without it).',
                  ru: 'Для ника и аватара в Steam добавь STEAM_API_KEY в .env и перезапусти сервер (вход без ключа уже работает).',
                  zh: '如需显示 Steam 昵称与头像，请在 .env 添加 STEAM_API_KEY 并重启服务器（登录不依赖该密钥）。',
                  'zh-TW': '如需顯示 Steam 暱稱與頭像，請在 .env 新增 STEAM_API_KEY 並重啟伺服器（登入不依賴該金鑰）。',
                })}
              </p>
            )}
            {!loading && (
              <div className="dashboard-state__actions">
                {!error && <button className="btn btn-primary" onClick={() => auth?.login && auth.login()}>Link Steam</button>}
                {error && <button className="btn btn-primary" onClick={onRetry}>Retry sync</button>}
              </div>
            )}
          </div>
          {loading && <PortfolioLoadingVisual lang={lang} progress={progress} />}
        </div>
      </div>
    </div>
  );
}

function errorMessage(error, lang) {
  const messages = {
    not_authenticated: tt(lang, { en: 'Steam account is not connected.', ru: 'Steam аккаунт не подключен.', zh: '尚未连接 Steam 账号。', 'zh-TW': '尚未連線 Steam 帳號。' }),
    missing_profile_url: tt(lang, { en: 'Paste a Steam profile link.', ru: 'Вставь ссылку на профиль Steam.', zh: '请粘贴 Steam 个人资料链接。', 'zh-TW': '請貼上 Steam 個人資料連結。' }),
    invalid_profile_url: tt(lang, { en: 'Could not read that link. Use a Steam profile URL or SteamID64.', ru: 'Не удалось прочитать ссылку. Нужен профиль Steam или SteamID64.', zh: '无法识别该链接。请使用 Steam 个人资料 URL 或 SteamID64。', 'zh-TW': '無法識別該連結。請使用 Steam 個人資料 URL 或 SteamID64。' }),
    profile_not_found: tt(lang, { en: 'Steam profile was not found.', ru: 'Steam-профиль не найден.', zh: '未找到 Steam 个人资料。', 'zh-TW': '找不到 Steam 個人資料。' }),
    private_inventory: tt(lang, { en: 'Steam did not return inventory. Make sure your inventory is public.', ru: 'Steam не отдал inventory. Проверь, что инвентарь публичный.', zh: 'Steam 未返回库存。请确认库存为公开。', 'zh-TW': 'Steam 未回傳庫存。請確認庫存為公開。' }),
    rate_limited: tt(lang, { en: 'Steam rate limited the request. Try again later.', ru: 'Steam временно ограничил запросы. Попробуй позже.', zh: 'Steam 请求过于频繁，请稍后再试。', 'zh-TW': 'Steam 請求過於頻繁，請稍後再試。' }),
  };
  return messages[error.code] || error.message || 'Unexpected error.';
}

function downloadPortfolioCsv(items) {
  const rows = [
    ['assetid', 'market_hash_name', 'qty', 'basis_total_usd', 'unit_price_usd', 'value_total_usd', 'steam_total_usd', 'change_1d_pct', 'change_7d_pct', 'change_30d_pct', 'pnl_total_usd', 'pnl_pct', 'provider'],
    ...items.map((item) => [item.assetid, item.marketHashName, item.qty, item.totalBasis ?? item.basis, item.value, item.totalValue ?? item.value, Number.isFinite(item.steamPrice) ? item.steamPrice * (item.qty || 1) : '', item.change1d, item.change7d, item.change30d, item.pnl, item.pnlPct, item.priceProvider]),
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
