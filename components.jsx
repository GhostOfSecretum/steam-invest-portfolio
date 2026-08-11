/* global React */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ─────────── i18n ─────────── */
const I18N = {
  en: {
    nav: { home: 'Home', dashboard: 'Portfolio', market: 'Market', favorites: 'Favorite profiles', investors: 'Top investors', pricing: 'Pricing', news: 'News', armory: 'Armory Pass', glock3d: '3D Glock', item: 'Item', currency: 'Currency' },
    hero: {
      eyebrow: 'SkinsHead · CS2 skin portfolio tracker',
      title1: 'Know the value of',
      title2: 'your CS2 ',
      title3: 'inventory.',
      sub: 'Get a live inventory valuation, see your profit, and understand where your money is concentrated — all in one portfolio.',
      cta1: 'Value my inventory',
      ctaConnected: 'Open my portfolio',
      profileToggle: 'Check a public profile',
      trust: 'Read-only Steam OpenID · we never ask for your password',
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
      pricingSub: 'Free is 0 ₽. During beta, Plus unlocks free via the Telegram channel; Investor is paid.',
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
      title1: 'Узнай стоимость',
      title2: 'своего CS2-',
      title3: 'инвентаря.',
      sub: 'Получи актуальную оценку предметов, посмотри прибыль и пойми, где сосредоточены деньги — в одном портфеле.',
      cta1: 'Оценить мой инвентарь',
      ctaConnected: 'Открыть мой портфель',
      profileToggle: 'Проверить публичный профиль',
      trust: 'Только Steam OpenID · пароль мы не запрашиваем',
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
      pricingSub: 'Free — 0 ₽. Во время беты Plus бесплатно за подписку на Telegram-канал; Investor оплачивается.',
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
  const showBeta = Boolean(auth?.beta?.beta);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navGroups = [
    {
      label: lang === 'ru' ? 'Основное' : 'Main',
      items: [
        { k: 'home', label: t.nav.home, icon: '⌂', desc: lang === 'ru' ? 'Возможности SkinsHead' : 'Explore SkinsHead' },
        { k: 'dashboard', label: t.nav.dashboard, icon: '▣', desc: lang === 'ru' ? 'Стоимость и предметы' : 'Value and inventory' },
        { k: 'market', label: t.nav.market, icon: '⌕', desc: lang === 'ru' ? 'Поиск и рыночные цены' : 'Search and market prices' },
      ],
    },
    {
      label: lang === 'ru' ? 'Инструменты' : 'Tools',
      items: [
        { k: 'armory', label: t.nav.armory, icon: '◈', desc: lang === 'ru' ? 'Расчёт доходности наград' : 'Reward ROI calculator' },
        { k: 'glock3d', label: t.nav.glock3d, icon: '◇', desc: lang === 'ru' ? 'Интерактивная модель' : 'Interactive item model' },
      ],
    },
    {
      label: lang === 'ru' ? 'Сообщество' : 'Community',
      items: [
        { k: 'favorites', label: t.nav.favorites, icon: '♡', desc: lang === 'ru' ? 'Сохранённые профили' : 'Saved profiles' },
        { k: 'investors', label: t.nav.investors, icon: '↗', desc: lang === 'ru' ? 'Портфели инвесторов' : 'Investor portfolios' },
      ],
    },
    {
      label: lang === 'ru' ? 'Сервис' : 'Service',
      items: [
        { k: 'pricing', label: t.nav.pricing, icon: '◎', desc: lang === 'ru' ? 'Возможности тарифов' : 'Compare plan features' },
      ],
    },
  ];
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) closeMenu();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="nav">
      <div className="nav-main">
        <button
          type="button"
          className="nav-logo-button"
          onClick={() => onNav('home')}
          aria-label={lang === 'ru' ? 'На главную' : 'Go to home'}
        >
          <Logo />
        </button>
        {showBeta && (
          <span className="nav-beta-badge" title={lang === 'ru' ? 'Бета-тестирование' : 'Beta testing'}>
            Beta
          </span>
        )}
      </div>
      <div className="nav-controls">
        <div
          className="nav-menu"
          ref={menuRef}
          data-open={menuOpen}
        >
          <button
            type="button"
            className="nav-menu-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav-menu-trigger-icon" aria-hidden="true"><i></i><i></i><i></i></span>
            <span className="nav-menu-trigger-current">{lang === 'ru' ? 'Меню' : 'Menu'}</span>
            <span className="nav-menu-chevron" aria-hidden="true" />
          </button>
          <nav className="nav-links nav-menu-panel" aria-label={lang === 'ru' ? 'Навигация' : 'Navigation'}>
            <div className="nav-menu-panel-card">
              <div className="nav-menu-profile">
                {connected ? (
                  <>
                    {profile?.avatarmedium
                      ? <img src={profile.avatarmedium} alt="" />
                      : <div className="nav-menu-profile-fallback">{String(profile?.personaname || 'S').slice(0, 1).toUpperCase()}</div>}
                    <div>
                      <strong>{profile?.personaname || 'Steam'}</strong>
                      <span><i></i>{lang === 'ru' ? 'Steam подключён' : 'Steam connected'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="nav-menu-profile-fallback">S</div>
                    <div>
                      <strong>{lang === 'ru' ? 'Гостевой режим' : 'Guest mode'}</strong>
                      <span>{lang === 'ru' ? 'Подключите Steam для портфеля' : 'Connect Steam for your portfolio'}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="nav-menu-groups" role="menu">
                {navGroups.map((group) => (
                  <div className="nav-menu-group" key={group.label}>
                    <div className="nav-menu-group-label">{group.label}</div>
                    {group.items.map((it) => (
                      <button
                        key={it.k}
                        type="button"
                        role="menuitem"
                        className="nav-link"
                        data-active={screen === it.k}
                        onClick={() => {
                          closeMenu();
                          onNav(it.k);
                        }}
                      >
                        <span className="nav-link-icon">{it.icon}</span>
                        <span className="nav-link-copy">
                          <strong>{it.label}</strong>
                          <small>{it.desc}</small>
                        </span>
                        <span className="nav-link-arrow">→</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="nav-menu-settings">
                <div>
                  <span>{lang === 'ru' ? 'Язык' : 'Language'}</span>
                  <div className="nav-menu-setting-options">
                    {['en', 'ru'].map((value) => (
                      <button key={value} type="button" data-active={lang === value} onClick={() => onLang(value)}>
                        {value.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span>{t.nav.currency}</span>
                  <div className="nav-menu-setting-options">
                    {['usd', 'rub'].map((value) => (
                      <button key={value} type="button" data-active={currency === value} onClick={() => onCurrency(value)}>
                        {value.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {connected ? (
                <button
                  type="button"
                  className="nav-menu-account-action"
                  onClick={() => {
                    closeMenu();
                    auth.logout();
                  }}
                >
                  {lang === 'ru' ? 'Выйти из аккаунта' : 'Sign out'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary nav-menu-connect"
                  onClick={() => {
                    closeMenu();
                    if (auth?.login) auth.login();
                  }}
                >
                  {lang === 'ru' ? 'Подключить Steam' : 'Connect Steam'}
                </button>
              )}
            </div>
          </nav>
        </div>
        {!connected && (
          <button className="btn btn-sm btn-primary nav-steam-connect" onClick={() => auth?.login && auth.login()}>
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
