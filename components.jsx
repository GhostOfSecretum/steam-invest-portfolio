/* global React */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ─────────── i18n ─────────── */
const I18N = {
  en: {
    nav: { home: 'Home', dashboard: 'Portfolio', market: 'Market', favorites: 'Favorite profiles', investors: 'Top investors', pricing: 'Pricing', news: 'News', armory: 'Armory Pass', glock3d: '3D Glock', item: 'Item', currency: 'Currency' },
    hero: {
      eyebrow: 'SkinsHead · CS2 skin portfolio tracker',
      title1: 'Track and manage',
      title2: 'your CS2 skin',
      title3: 'portfolio.',
      sub: 'Link Steam or paste a public profile. SkinsHead keeps your inventory valued live — P&L, cost basis, allocation, and position tracking in one place.',
      cta1: 'Link Steam',
      profileUrlCta: 'Open profile',
      profileUrlPlaceholder: 'https://steamcommunity.com/id/...',
      profileUrlError: 'Paste a Steam profile URL or SteamID64.',
      stat1: 'Items in catalog',
      stat2: 'Ticker volume / 24h',
      stat3: 'Your portfolio',
      stat3Fallback: 'Cases on radar',
      concept: 'Concept',
    },
    sections: {
      ticker: 'LIVE MARKET',
      movers: 'Portfolio leaders',
      moversSub: 'Top positions in your linked portfolio by unrealized return versus cost basis.',
      market: 'CS2 market explorer',
      marketSub: 'Browse live prices for skins, knives, gloves, agents, stickers, and containers. Filter by category, rarity, wear, and StatTrak / Souvenir.',
      news: 'CS2 news',
      newsSub: 'Telegram channel posts aggregated on the server and refreshed automatically.',
      armory: 'Armory Pass ROI',
      armorySub: 'Rank Armory rewards by star ROI on live Steam prices. See expected value, profit, and days left on the pass.',
      stats: 'What you get',
      pricing: 'Plans & prices',
      pricingSub: 'Free is 0 ₽. Plus and Investor support 30-day or annual payment — annual is cheaper.',
      faq: 'FAQ',
    },
    news: {
      live: 'Live feed',
      cached: 'Cached',
      fallback: 'Fallback',
      official: 'Official updates',
      esports: 'Esports',
      refresh: 'Refresh',
      open: 'Open source',
      updated: 'Updated',
      unavailable: 'Some sources are temporarily unavailable.',
      empty: 'No posts yet. Check Telegram settings on the server or press Refresh.',
      telegram: 'Telegram',
      telegramPending: 'Channel not connected yet.',
    },
    dash: {
      title: 'Portfolio',
      subtitle: 'Steam portfolio · SkinsHead',
      total: 'Total value',
      change24: '24h change',
      pnl: 'All-time P&L',
      basis: 'Cost basis',
      best: 'Best performer',
      worst: 'Worst performer',
      bestTrends: 'Best trends',
      worstTrends: 'Worst trends',
      leaders: 'Portfolio leaders',
      bestLeaders: 'Best movers',
      worstLeaders: 'Worst movers',
      leadersHint: 'held items · price history',
      leadersEmpty: 'Price history temporarily limited — try Sync later',
      trendsMore: 'More',
      trendsLess: 'Less',
      trendsEmpty: 'Not enough price history',
      trendsItem: 'Item',
      trendsPercent: 'Percent',
      trendsChange: 'Change',
      liquidity: 'Liquidity',
      sticker: 'Sticker capital',
      breakdown: 'Allocation by type',
      inventory: 'Inventory',
      movers: 'Movers in portfolio',
      watchlist: 'Watchlist',
      activity: 'Recent activity',
    },
    item: {
      back: 'All items',
      buy: 'Last buy', age: 'Held', tradelock: 'Steam status', float: 'Float', pattern: 'Pattern', stickers: 'Stickers',
      history: 'Price history',
      similar: 'Similar listings',
      valueDrivers: 'Value drivers',
    },
    market: {
      searchPlaceholder: 'Search skins, knives, stickers...',
      loading: 'Loading market...',
      empty: 'No items match the current filters.',
      results: 'results',
      total: 'total',
      loaded: 'loaded',
      scanned: 'scanned',
      more: 'Load more',
      category: 'Category',
      rarity: 'Rarity',
      wear: 'Wear',
      special: 'Variant',
      sort: 'Sort',
      listings: 'listings',
      open: 'Open market',
      popular: 'Popular',
      priceDesc: 'Price ↓',
      priceAsc: 'Price ↑',
      nameAsc: 'Name A-Z',
    }
  },
  ru: {
    nav: { home: 'Главная', dashboard: 'Портфель', market: 'Маркет', favorites: 'Избранные профили', investors: 'Топ инвесторы', pricing: 'Тарифы', news: 'Новости', armory: 'Armory Pass', glock3d: '3D Glock', item: 'Карточка', currency: 'Валюта' },
    hero: {
      eyebrow: 'SkinsHead · портфель скинов CS2',
      title1: 'Портфель скинов CS2 —',
      title2: 'веди и',
      title3: 'отслеживай.',
      sub: 'Привяжи Steam или вставь публичный профиль — и веди портфель в одном месте: live-стоимость, P&L, себестоимость и распределение позиций.',
      cta1: 'Привязать Steam',
      profileUrlCta: 'Открыть профиль',
      profileUrlPlaceholder: 'https://steamcommunity.com/id/...',
      profileUrlError: 'Вставь ссылку на профиль Steam или SteamID64.',
      stat1: 'Предметов в каталоге',
      stat2: 'Объём тикера · 24ч',
      stat3: 'Твой портфель',
      stat3Fallback: 'Кейсов на радаре',
      concept: 'Концепт',
    },
    sections: {
      ticker: 'РЫНОК · LIVE',
      movers: 'Лидеры портфеля',
      moversSub: 'Лучшие позиции в подключённом портфеле по нереализованной доходности относительно себестоимости.',
      market: 'Маркет CS2',
      marketSub: 'Live-цены на скины, ножи, перчатки, агентов, стикеры и контейнеры. Фильтры по категории, редкости, износу и StatTrak / Souvenir.',
      news: 'CS2 · новости',
      newsSub: 'Посты из Telegram-каналов: собираются на сервере и обновляются автоматически.',
      armory: 'ROI Armory Pass',
      armorySub: 'Рейтинг наград Armory по ROI звёзд на live-ценах Steam. Смотри ожидаемую стоимость, профит и сколько дней осталось у пасса.',
      stats: 'Что внутри',
      pricing: 'Тарифы и цены',
      pricingSub: 'Free — 0 ₽. Plus и Investor можно оплатить на 30 дней или сразу на год — годом выгоднее.',
      faq: 'Частые вопросы',
    },
    news: {
      live: 'Live-лента',
      cached: 'Из кэша',
      fallback: 'Fallback',
      official: 'Официальные апдейты',
      esports: 'Киберспорт',
      refresh: 'Обновить',
      open: 'Открыть источник',
      updated: 'Обновлено',
      unavailable: 'Часть источников сейчас недоступна.',
      empty: 'Постов пока нет. Проверьте настройки Telegram на сервере или нажмите «Обновить».',
      telegram: 'Telegram',
      telegramPending: 'Канал ещё не подключён.',
    },
    dash: {
      title: 'Портфель',
      subtitle: 'Портфель Steam · SkinsHead',
      total: 'Стоимость',
      change24: 'Изменение 24ч',
      pnl: 'P&L за всё время',
      basis: 'Себестоимость',
      best: 'Лучший',
      worst: 'Худший',
      bestTrends: 'Лучшие тренды',
      worstTrends: 'Худшие тренды',
      leaders: 'Лидеры портфеля',
      bestLeaders: 'Лучшие',
      worstLeaders: 'Худшие',
      leadersHint: 'позиции портфеля · история цен',
      leadersEmpty: 'История цен временно ограничена — нажми Sync позже',
      trendsMore: 'Ещё',
      trendsLess: 'Свернуть',
      trendsEmpty: 'Недостаточно истории цен',
      trendsItem: 'Предмет',
      trendsPercent: 'Процент',
      trendsChange: 'Изменение',
      liquidity: 'Ликвидность',
      sticker: 'Капитал в наклейках',
      breakdown: 'Распределение по типам',
      inventory: 'Инвентарь',
      movers: 'Движение в портфеле',
      watchlist: 'Список наблюдения',
      activity: 'Активность',
    },
    item: {
      back: 'К списку', buy: 'Покупка', age: 'В портфеле', tradelock: 'Статус Steam', float: 'Float', pattern: 'Pattern', stickers: 'Наклейки',
      history: 'История цены', similar: 'Похожие лоты', valueDrivers: 'Что влияет на цену',
    },
    market: {
      searchPlaceholder: 'Поиск по скинам, ножам, стикерам...',
      loading: 'Загружаю маркет...',
      empty: 'По текущим фильтрам ничего не найдено.',
      results: 'результатов',
      total: 'всего',
      loaded: 'загружено',
      scanned: 'просканировано',
      more: 'Показать ещё',
      category: 'Категория',
      rarity: 'Редкость',
      wear: 'Износ',
      special: 'Вариант',
      sort: 'Сортировка',
      listings: 'лотов',
      open: 'Открыть маркет',
      popular: 'Популярные',
      priceDesc: 'Цена ↓',
      priceAsc: 'Цена ↑',
      nameAsc: 'Имя A-Я',
    }
  }
};

const useT = (lang) => I18N[lang] || I18N.en;

/* ─────────── Logo ─────────── */
function Logo() {
  return (
    <div className="nav-logo">
      <div className="nav-logo-mark">
        <img src="logo-cs2-candles-variant-02.png" alt="" />
      </div>
      <span className="nav-logo-wordmark" aria-label="SkinsHead">
        <span className="nav-logo-wordmark-silver">SKINS</span>
        <span className="nav-logo-wordmark-divider">/</span>
        <span className="nav-logo-wordmark-pink">HEAD</span>
      </span>
    </div>
  );
}

/* ─────────── Sparkline ─────────── */
function Sparkline({ data, color = 'var(--green)', height = 32, fill = true }) {
  const safeData = Array.isArray(data) && data.length > 1 ? data : [0, 0];
  const w = 120, h = height;
  const min = Math.min(...safeData), max = Math.max(...safeData);
  const range = max - min || 1;
  const pts = safeData.map((v, i) => [(i / (safeData.length - 1)) * w, h - ((v - min) / range) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const id = `g-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={d} stroke={color} strokeWidth="1.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ─────────── Item placeholder art ─────────── */
function ItemArt({ label, tier = 2, style = {}, className = '' }) {
  // Procedurally generated placeholder. Doesn't try to depict real CS2 art.
  const tones = {
    1: ['#2a4a8a', '#0e1a30'],
    2: ['#5a3aa0', '#1a0e30'],
    3: ['#a02ab8', '#2c0a30'],
    4: ['#b13a3a', '#2c0a0a'],
    5: ['#b8932a', '#2c1f0a'],
  };
  const [c1, c2] = tones[tier] || tones[2];
  return (
    <div className={`item-art ${className}`} data-label={label} style={{
      ...style,
      background: `
        repeating-linear-gradient(115deg, rgba(255,255,255,0.04) 0 5px, rgba(255,255,255,0.0) 5px 11px),
        radial-gradient(120% 120% at 30% 25%, ${c1}55, transparent 55%),
        radial-gradient(80% 80% at 80% 80%, ${c2}aa, transparent 60%),
        linear-gradient(180deg, #1c2230, #0a0d14)
      `,
    }}>
      {/* tactical crosshair-ish marker, stylized — not branded */}
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.35 }}>
        <circle cx="50" cy="50" r="18" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" fill="none" />
        <line x1="50" y1="20" x2="50" y2="36" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
        <line x1="50" y1="64" x2="50" y2="80" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
        <line x1="20" y1="50" x2="36" y2="50" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
        <line x1="64" y1="50" x2="80" y2="50" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
      </svg>
    </div>
  );
}

/* ─────────── Animated number ─────────── */
function AnimNum({ value, prefix = '', suffix = '', decimals = 0, duration = 900 }) {
  const [v, setV] = useState(value);
  const startVal = useRef(value);
  const startT = useRef(null);
  useEffect(() => {
    startVal.current = v;
    startT.current = null;
    let raf;
    const step = (t) => {
      if (!startT.current) startT.current = t;
      const p = Math.min(1, (t - startT.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(startVal.current + (value - startVal.current) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className="num-tick">{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
  );
}

/* ─────────── Top Nav ─────────── */
function TopNav({ screen, onNav, lang, onLang, currency, onCurrency, t, auth }) {
  const connected = Boolean(auth?.connected);
  const profile = auth?.profile;
  return (
    <header className="nav">
      <div className="nav-main">
        <Logo />
      </div>
      <div className="nav-controls">
        <nav className="nav-links">
          {[
            { k: 'home', label: t.nav.home },
            { k: 'dashboard', label: t.nav.dashboard },
            { k: 'market', label: t.nav.market },
            { k: 'armory', label: t.nav.armory },
            { k: 'favorites', label: t.nav.favorites },
            { k: 'investors', label: t.nav.investors },
            { k: 'pricing', label: t.nav.pricing },
            // News nav temporarily hidden with the news section
            // { k: 'news', label: t.nav.news },
            { k: 'glock3d', label: t.nav.glock3d },
          ].map(it => (
            <button key={it.k} className="nav-link" data-active={screen === it.k} onClick={() => onNav(it.k)}>{it.label}</button>
          ))}
        </nav>
        <div className="nav-segment">
          {['en', 'ru'].map(l => (
            <button key={l} onClick={() => onLang(l)} style={{
              padding: '6px 10px', fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: lang === l ? 'var(--fg-0)' : 'var(--fg-3)',
              background: lang === l ? 'rgba(255,255,255,0.06)' : 'transparent',
            }}>{l}</button>
          ))}
        </div>
        <div
          title={t.nav.currency}
          className="nav-segment"
        >
          {[
            { key: 'usd', label: 'USD' },
            { key: 'rub', label: 'RUB' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => onCurrency(item.key)}
              style={{
                padding: '6px 10px',
                fontFamily: 'var(--f-mono)',
                fontSize: 11,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: currency === item.key ? 'var(--fg-0)' : 'var(--fg-3)',
                background: currency === item.key ? 'rgba(255,255,255,0.06)' : 'transparent',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {connected && profile?.avatarmedium && (
          <img src={profile.avatarmedium} alt="" style={{ width: 26, height: 26, borderRadius: 13, border: '1px solid var(--line-strong)' }} />
        )}
        {connected && (
          <button className="btn btn-sm btn-ghost" onClick={() => auth.logout()}>{profile?.personaname || 'Steam'} · Logout</button>
        )}
        {!connected && (
          <button className="btn btn-sm btn-primary" onClick={() => auth?.login && auth.login()}>
            {lang === 'ru' ? 'Подключить Steam' : 'Link Steam'}
          </button>
        )}
      </div>
    </header>
  );
}

const CURSOR_VARIANTS = [
  { id: 'classic', labels: { en: 'Classic', ru: 'Классик' }, desc: { en: '5-line', ru: '5 линий' } },
  { id: 'dot', labels: { en: 'Dot', ru: 'Точка' }, desc: { en: 'dot ring', ru: 'точка + кольцо' } },
  { id: 'split', labels: { en: 'Split', ru: 'Split' }, desc: { en: 'open gap', ru: 'с разрывом' } },
  { id: 'scope', labels: { en: 'Scope', ru: 'Scope' }, desc: { en: 'sniper', ru: 'снайперский' } },
];

function CursorGlyph({ variant, preview = false }) {
  return (
    <div className={`cursor-glyph${preview ? ' is-preview' : ''}`} data-variant={variant}>
      <i className="cursor-line top"></i>
      <i className="cursor-line right"></i>
      <i className="cursor-line bottom"></i>
      <i className="cursor-line left"></i>
      <i className="cursor-center"></i>
      <i className="cursor-ring"></i>
      <i className="cursor-diag tl"></i>
      <i className="cursor-diag tr"></i>
      <i className="cursor-diag br"></i>
      <i className="cursor-diag bl"></i>
    </div>
  );
}

function CursorOverlay({ variant }) {
  const rootRef = useRef(null);
  const posRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const rafRef = useRef(0);

  useEffect(() => {
    document.body.dataset.cursorStyle = variant;
    return () => { delete document.body.dataset.cursorStyle; };
  }, [variant]);

  useEffect(() => {
    if (variant === 'default') return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    const render = () => {
      rafRef.current = 0;
      root.style.left = `${posRef.current.x}px`;
      root.style.top = `${posRef.current.y}px`;
    };
    const queueRender = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(render);
    };
    const isInteractive = (target) => target?.closest?.('button, a, input, select, textarea, [role="button"], .tab, .btn, .nav-link');

    const onMove = (event) => {
      posRef.current = { x: event.clientX, y: event.clientY };
      root.dataset.visible = '1';
      root.dataset.hover = isInteractive(event.target) ? '1' : '0';
      queueRender();
    };
    const onLeave = () => { root.dataset.visible = '0'; };
    const onEnter = () => { root.dataset.visible = '1'; };
    const onDown = () => { root.dataset.down = '1'; };
    const onUp = () => { root.dataset.down = '0'; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    queueRender();

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [variant]);

  if (variant === 'default') return null;
  return (
    <div ref={rootRef} className="cursor-overlay" data-visible="0" data-hover="0" data-down="0" aria-hidden="true">
      <CursorGlyph variant={variant} />
    </div>
  );
}

function CursorSwitcher({ lang, value, onChange }) {
  const title = lang === 'ru' ? 'Прицел' : 'Crosshair';
  const subtitle = lang === 'ru' ? 'Сменить курсор' : 'Switch cursor';
  return (
    <div className="cursor-switcher glass-strong">
      <div className="cursor-switcher-head">
        <div>
          <div className="eyebrow" style={{ color: 'var(--accent)' }}>// {title}</div>
          <div className="cursor-switcher-sub">{subtitle}</div>
        </div>
      </div>
      <div className="cursor-switcher-grid">
        {CURSOR_VARIANTS.map((item) => (
          <button
            key={item.id}
            className="cursor-card"
            data-active={value === item.id}
            onClick={() => onChange(item.id)}
            title={item.labels[lang] || item.labels.en}
          >
            <div className="cursor-card-preview">
              <CursorGlyph variant={item.id} preview />
            </div>
            <div className="cursor-card-label">{item.labels[lang] || item.labels.en}</div>
            <div className="cursor-card-desc">{item.desc[lang] || item.desc.en}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Export */
Object.assign(window, { useT, I18N, Logo, Sparkline, ItemArt, AnimNum, TopNav, CursorSwitcher, CursorOverlay, CURSOR_VARIANTS });
