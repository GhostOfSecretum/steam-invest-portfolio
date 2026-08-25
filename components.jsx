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
      pricingSub: 'Website is free. Plus is $7.99/mo or $72/year — 7 days on first Steam login. Pay with card or crypto.',
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
      total: 'Market value',
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
      pricingSub: 'Сайт бесплатный. Платные тарифы открывают desktop. Во время беты Plus — бесплатно за Telegram; Investor — 7 дней тоже за канал. Оплата картой или криптой.',
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
      total: 'Рыночная стоимость',
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
  },
  zh: {
    nav: { home: '首页', dashboard: '库存', market: '市场', favorites: '收藏的个人资料', investors: '顶尖投资者', pricing: '套餐', news: '新闻', armory: 'Armory Pass', glock3d: '3D Glock', item: '物品', currency: '货币' },
    hero: {
      eyebrow: 'SkinsHead · CS2 皮肤库存追踪',
      title1: '了解你的',
      title2: 'CS2 ',
      title3: '库存价值。',
      sub: '实时估算库存、查看盈亏，并看清资金集中在哪里——都在一个库存面板里。',
      cta1: '估算我的库存',
      ctaConnected: '打开我的库存',
      profileToggle: '查看公开个人资料',
      trust: '只读 Steam OpenID · 我们从不索要密码',
      profileUrlCta: '打开资料',
      profileUrlPlaceholder: 'https://steamcommunity.com/id/...',
      profileUrlError: '请粘贴 Steam 个人资料链接或 SteamID64。',
      stat1: '目录物品数',
      stat2: '行情成交量 / 24h',
      stat3: '你的库存',
      stat3Fallback: '关注中的箱子',
      concept: '概念',
    },
    sections: {
      ticker: '实时市场',
      movers: '库存领先项',
      moversSub: '已关联库存中相对成本基础未实现收益最高的持仓。',
      market: 'CS2 市场浏览器',
      marketSub: '浏览皮肤、刀具、手套、干员、贴纸和容器的实时价格。可按类别、稀有度、磨损以及 StatTrak / Souvenir 筛选。',
      news: 'CS2 新闻',
      newsSub: '服务器汇总 Telegram 频道帖子并自动刷新。',
      armory: 'Armory Pass ROI',
      armorySub: '按 Steam 实时价格对 Armory 奖励做星级 ROI 排名。查看期望价值、利润和通行证剩余天数。',
      stats: '你将获得',
      pricing: '套餐与价格',
      pricingSub: '网站免费。Plus 为 $7.99/月或 $72/年，首次 Steam 登录赠送 7 天。支持卡片或加密货币支付。',
      faq: '常见问题',
    },
    news: {
      live: '实时动态',
      cached: '缓存',
      fallback: 'Fallback',
      official: '官方更新',
      esports: '电竞',
      refresh: '刷新',
      open: '打开来源',
      updated: '已更新',
      unavailable: '部分来源暂时不可用。',
      empty: '暂无帖子。请检查服务器上的 Telegram 设置，或点击刷新。',
      telegram: 'Telegram',
      telegramPending: '频道尚未连接。',
    },
    dash: {
      title: '库存',
      subtitle: 'Steam 库存 · SkinsHead',
      total: '市场价值',
      change24: '24h 变化',
      pnl: '累计盈亏',
      basis: '成本基础',
      best: '最佳',
      worst: '最差',
      bestTrends: '最佳趋势',
      worstTrends: '最差趋势',
      leaders: '库存领先项',
      bestLeaders: '涨幅领先',
      worstLeaders: '跌幅领先',
      leadersHint: '持仓物品 · 价格历史',
      leadersEmpty: '价格历史暂时有限——稍后再同步',
      trendsMore: '更多',
      trendsLess: '收起',
      trendsEmpty: '价格历史不足',
      trendsItem: '物品',
      trendsPercent: '百分比',
      trendsChange: '变化',
      liquidity: '流动性',
      sticker: '贴纸资本',
      breakdown: '按类型分配',
      inventory: '库存',
      movers: '库存变动',
      watchlist: '关注列表',
      activity: '近期动态',
    },
    item: {
      back: '全部物品',
      buy: '上次买入', age: '持有', tradelock: 'Steam 状态', float: 'Float', pattern: 'Pattern', stickers: 'Stickers',
      history: '价格历史',
      similar: '相似挂单',
      valueDrivers: '价值驱动因素',
    },
    market: {
      searchPlaceholder: '搜索皮肤、刀具、贴纸...',
      loading: '正在加载市场...',
      empty: '没有符合当前筛选的物品。',
      results: '结果',
      total: '总计',
      loaded: '已加载',
      scanned: '已扫描',
      more: '加载更多',
      category: '类别',
      rarity: '稀有度',
      wear: 'Wear',
      special: '变体',
      sort: '排序',
      listings: '挂单',
      open: '打开市场',
      popular: '热门',
      priceDesc: '价格 ↓',
      priceAsc: '价格 ↑',
      nameAsc: '名称 A-Z',
    }
  },
  'zh-TW': {
    nav: { home: '首頁', dashboard: '庫存', market: '市場', favorites: '收藏的個人資料', investors: '頂尖投資者', pricing: '方案', news: '新聞', armory: 'Armory Pass', glock3d: '3D Glock', item: '物品', currency: '貨幣' },
    hero: {
      eyebrow: 'SkinsHead · CS2 皮膚庫存追蹤',
      title1: '了解你的',
      title2: 'CS2 ',
      title3: '庫存價值。',
      sub: '即時估算庫存、查看盈虧，並看清資金集中在哪裡——都在一個庫存面板裡。',
      cta1: '估算我的庫存',
      ctaConnected: '開啟我的庫存',
      profileToggle: '查看公開個人資料',
      trust: '唯讀 Steam OpenID · 我們從不索取密碼',
      profileUrlCta: '開啟資料',
      profileUrlPlaceholder: 'https://steamcommunity.com/id/...',
      profileUrlError: '請貼上 Steam 個人資料連結或 SteamID64。',
      stat1: '目錄物品數',
      stat2: '行情成交量 / 24h',
      stat3: '你的庫存',
      stat3Fallback: '關注中的箱子',
      concept: '概念',
    },
    sections: {
      ticker: '即時市場',
      movers: '庫存領先項',
      moversSub: '已關聯庫存中相對成本基礎未實現收益最高的持倉。',
      market: 'CS2 市場瀏覽器',
      marketSub: '瀏覽皮膚、刀具、手套、幹員、貼紙和容器的即時價格。可依類別、稀有度、磨損以及 StatTrak / Souvenir 篩選。',
      news: 'CS2 新聞',
      newsSub: '伺服器匯總 Telegram 頻道貼文並自動重新整理。',
      armory: 'Armory Pass ROI',
      armorySub: '依 Steam 即時價格對 Armory 獎勵做星級 ROI 排名。查看期望價值、利潤和通行證剩餘天數。',
      stats: '你將獲得',
      pricing: '方案與價格',
      pricingSub: '網站免費。Plus 為 $7.99/月或 $72/年，首次 Steam 登入贈送 7 天。支援卡片或加密貨幣付款。',
      faq: '常見問題',
    },
    news: {
      live: '即時動態',
      cached: '快取',
      fallback: 'Fallback',
      official: '官方更新',
      esports: '電競',
      refresh: '重新整理',
      open: '開啟來源',
      updated: '已更新',
      unavailable: '部分來源暫時無法使用。',
      empty: '尚無貼文。請檢查伺服器上的 Telegram 設定，或按下重新整理。',
      telegram: 'Telegram',
      telegramPending: '頻道尚未連線。',
    },
    dash: {
      title: '庫存',
      subtitle: 'Steam 庫存 · SkinsHead',
      total: '市場價值',
      change24: '24h 變化',
      pnl: '累計盈虧',
      basis: '成本基礎',
      best: '最佳',
      worst: '最差',
      bestTrends: '最佳趨勢',
      worstTrends: '最差趨勢',
      leaders: '庫存領先項',
      bestLeaders: '漲幅領先',
      worstLeaders: '跌幅領先',
      leadersHint: '持倉物品 · 價格歷史',
      leadersEmpty: '價格歷史暫時有限——稍後再同步',
      trendsMore: '更多',
      trendsLess: '收合',
      trendsEmpty: '價格歷史不足',
      trendsItem: '物品',
      trendsPercent: '百分比',
      trendsChange: '變化',
      liquidity: '流動性',
      sticker: '貼紙資本',
      breakdown: '依類型分配',
      inventory: '庫存',
      movers: '庫存變動',
      watchlist: '關注列表',
      activity: '近期動態',
    },
    item: {
      back: '全部物品',
      buy: '上次買入', age: '持有', tradelock: 'Steam 狀態', float: 'Float', pattern: 'Pattern', stickers: 'Stickers',
      history: '價格歷史',
      similar: '相似掛單',
      valueDrivers: '價值驅動因素',
    },
    market: {
      searchPlaceholder: '搜尋皮膚、刀具、貼紙...',
      loading: '正在載入市場...',
      empty: '沒有符合目前篩選的物品。',
      results: '結果',
      total: '總計',
      loaded: '已載入',
      scanned: '已掃描',
      more: '載入更多',
      category: '類別',
      rarity: '稀有度',
      wear: 'Wear',
      special: '變體',
      sort: '排序',
      listings: '掛單',
      open: '開啟市場',
      popular: '熱門',
      priceDesc: '價格 ↓',
      priceAsc: '價格 ↑',
      nameAsc: '名稱 A-Z',
    }
  }
};

const LANGS = ['en', 'ru', 'zh', 'zh-TW'];
const LANG_LABELS = { en: 'EN', ru: 'RU', zh: '简', 'zh-TW': '繁' };
const LOCALE_MAP = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN', 'zh-TW': 'zh-TW' };

function tt(lang, map = {}) {
  if (map && Object.prototype.hasOwnProperty.call(map, lang) && map[lang] != null) return map[lang];
  return map.en;
}

function localeFor(lang) {
  return LOCALE_MAP[lang] || LOCALE_MAP.en;
}

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
      label: tt(lang, { en: 'Main', ru: 'Основное', zh: '主要', 'zh-TW': '主要' }),
      items: [
        { k: 'home', label: t.nav.home, icon: '⌂', desc: tt(lang, { en: 'Explore SkinsHead', ru: 'Возможности SkinsHead', zh: '探索 SkinsHead', 'zh-TW': '探索 SkinsHead' }) },
        { k: 'dashboard', label: t.nav.dashboard, icon: '▣', desc: tt(lang, { en: 'Value and inventory', ru: 'Стоимость и предметы', zh: '价值与库存', 'zh-TW': '價值與庫存' }) },
        { k: 'market', label: t.nav.market, icon: '⌕', desc: tt(lang, { en: 'Search and market prices', ru: 'Поиск и рыночные цены', zh: '搜索与市场价格', 'zh-TW': '搜尋與市場價格' }) },
      ],
    },
    {
      label: tt(lang, { en: 'Tools', ru: 'Инструменты', zh: '工具', 'zh-TW': '工具' }),
      items: [
        { k: 'armory', label: t.nav.armory, icon: '◈', desc: tt(lang, { en: 'Reward ROI calculator', ru: 'Расчёт доходности наград', zh: '奖励 ROI 计算器', 'zh-TW': '獎勵 ROI 計算器' }) },
        { k: 'glock3d', label: t.nav.glock3d, icon: '◇', desc: tt(lang, { en: 'Interactive item model', ru: 'Интерактивная модель', zh: '交互式模型', 'zh-TW': '互動式模型' }) },
      ],
    },
    {
      label: tt(lang, { en: 'Community', ru: 'Сообщество', zh: '社区', 'zh-TW': '社群' }),
      items: [
        { k: 'favorites', label: t.nav.favorites, icon: '♡', desc: tt(lang, { en: 'Saved profiles', ru: 'Сохранённые профили', zh: '已保存的资料', 'zh-TW': '已儲存的資料' }) },
        { k: 'investors', label: t.nav.investors, icon: '↗', desc: tt(lang, { en: 'Investor portfolios', ru: 'Портфели инвесторов', zh: '投资者库存', 'zh-TW': '投資者庫存' }) },
      ],
    },
    {
      label: tt(lang, { en: 'Service', ru: 'Сервис', zh: '服务', 'zh-TW': '服務' }),
      items: [
        { k: 'pricing', label: t.nav.pricing, icon: '◎', desc: tt(lang, { en: 'Compare plan features', ru: 'Возможности тарифов', zh: '对比套餐功能', 'zh-TW': '比較方案功能' }) },
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
          aria-label={tt(lang, { en: 'Go to home', ru: 'На главную', zh: '回到首页', 'zh-TW': '回到首頁' })}
        >
          <Logo />
        </button>
        {showBeta && (
          <span className="nav-beta-badge" title={tt(lang, { en: 'Beta testing', ru: 'Бета-тестирование', zh: '内测', 'zh-TW': '內測' })}>
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
            <span className="nav-menu-trigger-current">{tt(lang, { en: 'Menu', ru: 'Меню', zh: '菜单', 'zh-TW': '選單' })}</span>
            <span className="nav-menu-chevron" aria-hidden="true" />
          </button>
          <nav className="nav-links nav-menu-panel" aria-label={tt(lang, { en: 'Navigation', ru: 'Навигация', zh: '导航', 'zh-TW': '導覽' })}>
            <div className="nav-menu-panel-card">
              <div className="nav-menu-profile">
                {connected ? (
                  <>
                    {profile?.avatarmedium
                      ? <img src={profile.avatarmedium} alt="" />
                      : <div className="nav-menu-profile-fallback">{String(profile?.personaname || 'S').slice(0, 1).toUpperCase()}</div>}
                    <div>
                      <strong>{profile?.personaname || 'Steam'}</strong>
                      <span><i></i>{tt(lang, { en: 'Steam connected', ru: 'Steam подключён', zh: '已连接 Steam', 'zh-TW': '已連線 Steam' })}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="nav-menu-profile-fallback">S</div>
                    <div>
                      <strong>{tt(lang, { en: 'Guest mode', ru: 'Гостевой режим', zh: '访客模式', 'zh-TW': '訪客模式' })}</strong>
                      <span>{tt(lang, { en: 'Connect Steam for your portfolio', ru: 'Подключите Steam для портфеля', zh: '连接 Steam 以查看库存', 'zh-TW': '連線 Steam 以查看庫存' })}</span>
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
                  <span>{tt(lang, { en: 'Language', ru: 'Язык', zh: '语言', 'zh-TW': '語言' })}</span>
                  <div className="nav-menu-setting-options">
                    {LANGS.map((value) => (
                      <button key={value} type="button" data-active={lang === value} onClick={() => onLang(value)}>
                        {LANG_LABELS[value] || value.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span>{t.nav.currency}</span>
                  <div className="nav-menu-setting-options">
                    {CURRENCIES.map((value) => (
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
                  {tt(lang, { en: 'Sign out', ru: 'Выйти из аккаунта', zh: '退出账号', 'zh-TW': '登出帳號' })}
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
                  {tt(lang, { en: 'Connect Steam', ru: 'Подключить Steam', zh: '连接 Steam', 'zh-TW': '連線 Steam' })}
                </button>
              )}
            </div>
          </nav>
        </div>
        {!connected && (
          <button className="btn btn-sm btn-primary nav-steam-connect" onClick={() => auth?.login && auth.login()}>
            {tt(lang, { en: 'Link Steam', ru: 'Подключить Steam', zh: '连接 Steam', 'zh-TW': '連線 Steam' })}
          </button>
        )}
      </div>
    </header>
  );
}

const CURSOR_VARIANTS = [
  { id: 'classic', labels: { en: 'Classic', ru: 'Классик', zh: '经典', 'zh-TW': '經典' }, desc: { en: '5-line', ru: '5 линий', zh: '5 线', 'zh-TW': '5 線' } },
  { id: 'dot', labels: { en: 'Dot', ru: 'Точка', zh: '圆点', 'zh-TW': '圓點' }, desc: { en: 'dot ring', ru: 'точка + кольцо', zh: '圆点+环', 'zh-TW': '圓點+環' } },
  { id: 'split', labels: { en: 'Split', ru: 'Split', zh: 'Split', 'zh-TW': 'Split' }, desc: { en: 'open gap', ru: 'с разрывом', zh: '开口', 'zh-TW': '開口' } },
  { id: 'scope', labels: { en: 'Scope', ru: 'Scope', zh: 'Scope', 'zh-TW': 'Scope' }, desc: { en: 'sniper', ru: 'снайперский', zh: '狙击', 'zh-TW': '狙擊' } },
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
  const title = tt(lang, { en: 'Crosshair', ru: 'Прицел', zh: '准星', 'zh-TW': '準星' });
  const subtitle = tt(lang, { en: 'Switch cursor', ru: 'Сменить курсор', zh: '切换光标', 'zh-TW': '切換游標' });
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
            title={tt(lang, item.labels)}
          >
            <div className="cursor-card-preview">
              <CursorGlyph variant={item.id} preview />
            </div>
            <div className="cursor-card-label">{tt(lang, item.labels)}</div>
            <div className="cursor-card-desc">{tt(lang, item.desc)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CollectionChip({ collection, collectionSlug, lang, onCollectionClick }) {
  if (!collection) return null;
  const slug = collectionSlug || (window.ItemSlugs?.collectionNameToSlug
    ? window.ItemSlugs.collectionNameToSlug(collection)
    : null);
  if (!slug || !onCollectionClick) {
    return <span className="chip chip-collection">{collection}</span>;
  }

  return (
    <span
      className="chip chip-collection is-link"
      role="link"
      tabIndex={0}
      title={tt(lang, { en: 'Open collection', ru: 'Открыть коллекцию', zh: '打开收藏', 'zh-TW': '開啟收藏' })}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCollectionClick(collection, slug);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onCollectionClick(collection, slug);
        }
      }}
    >
      {collection}
    </span>
  );
}

/* Export */
Object.assign(window, {
  useT,
  I18N,
  tt,
  localeFor,
  LANGS,
  LANG_LABELS,
  LOCALE_MAP,
  Logo,
  Sparkline,
  ItemArt,
  AnimNum,
  TopNav,
  CursorSwitcher,
  CursorOverlay,
  CURSOR_VARIANTS,
  CollectionChip,
});
