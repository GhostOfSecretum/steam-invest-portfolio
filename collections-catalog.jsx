/* global React, useT, tt, localeFor, useCollectionsIndex, withSteamImageSize, ItemArt */

const { useMemo, useState } = React;

const KIND_ORDER = ['all', 'skins', 'stickers', 'graffiti', 'patches'];

function kindLabel(lang, kind) {
  const labels = {
    all: { en: 'All', ru: 'Все', zh: '全部', 'zh-TW': '全部' },
    skins: { en: 'Skins', ru: 'Скины', zh: '皮肤', 'zh-TW': '皮膚' },
    stickers: { en: 'Stickers', ru: 'Стикеры', zh: '贴纸', 'zh-TW': '貼紙' },
    graffiti: { en: 'Graffiti', ru: 'Граффити', zh: '涂鸦', 'zh-TW': '塗鴉' },
    patches: { en: 'Patches', ru: 'Патчи', zh: '补丁', 'zh-TW': '補丁' },
  };
  return tt(lang, labels[kind] || labels.all);
}

function CollectionsCatalog({ onCollectionClick }) {
  const lang = window.__lang || 'en';
  const t = useT(lang);
  const locale = localeFor(lang);
  const catalog = useCollectionsIndex(true);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('skins');
  const [sort, setSort] = useState('size');

  const collections = catalog.data?.collections || [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = collections.filter((entry) => {
      if (kind !== 'all' && entry.kind !== kind) return false;
      if (!needle) return true;
      return String(entry.name || '').toLowerCase().includes(needle)
        || String(entry.slug || '').includes(needle);
    });
    next.sort((a, b) => {
      if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), locale);
      if (b.skinCount !== a.skinCount) return b.skinCount - a.skinCount;
      return String(a.name || '').localeCompare(String(b.name || ''), locale);
    });
    return next;
  }, [collections, kind, locale, query, sort]);

  const showInitialLoading = catalog.loading && !catalog.data;

  return (
    <section className="section market-page collections-page">
      <div className="container">
        <div className="market-page-head">
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>
              // {tt(lang, { en: 'CS2 COLLECTIONS', ru: 'КОЛЛЕКЦИИ CS2', zh: 'CS2 收藏', 'zh-TW': 'CS2 收藏' })}
            </div>
            <h1 className="display">{t.nav.collections}</h1>
            <p>
              {tt(lang, {
                en: 'Browse every collection and open it to see the skins inside — the same view as from an item page.',
                ru: 'Все коллекции в одном месте. Зайдите внутрь и посмотрите скины — как сейчас с карточки предмета.',
                zh: '浏览全部收藏，点进去查看所属皮肤，和从物品页进入时一样。',
                'zh-TW': '瀏覽全部收藏，點進去查看所屬皮膚，和從物品頁進入時一樣。',
              })}
            </p>
          </div>
          <div className="market-result-total">
            <strong>{(filtered.length || 0).toLocaleString(locale)}</strong>
            <span>
              {tt(lang, {
                en: 'collections found',
                ru: 'коллекций найдено',
                zh: '个收藏',
                'zh-TW': '個收藏',
              })}
            </span>
          </div>
        </div>

        <div className="glass market-toolbar">
          <div className="market-toolbar-top collections-toolbar-top">
            <div className="market-search">
              <span className="market-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tt(lang, {
                  en: 'Search collections...',
                  ru: 'Поиск коллекций...',
                  zh: '搜索收藏...',
                  'zh-TW': '搜尋收藏...',
                })}
                className="market-search-input"
              />
              {query && (
                <button
                  type="button"
                  className="market-search-clear"
                  onClick={() => setQuery('')}
                  aria-label={tt(lang, { en: 'Clear search', ru: 'Очистить поиск', zh: '清除搜索', 'zh-TW': '清除搜尋' })}
                >
                  ×
                </button>
              )}
            </div>

            <label className="market-sort-control">
              <span>{tt(lang, { en: 'Sort', ru: 'Сортировка', zh: '排序', 'zh-TW': '排序' })}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="size">{tt(lang, { en: 'Most items', ru: 'Больше предметов', zh: '物品最多', 'zh-TW': '物品最多' })}</option>
                <option value="name">{tt(lang, { en: 'Name A-Z', ru: 'Имя A-Я', zh: '名称 A-Z', 'zh-TW': '名稱 A-Z' })}</option>
              </select>
            </label>
          </div>

          <div className="market-category-row" aria-label={tt(lang, { en: 'Type', ru: 'Тип', zh: '类型', 'zh-TW': '類型' })}>
            {KIND_ORDER.map((value) => (
              <button
                key={value}
                type="button"
                data-active={kind === value}
                onClick={() => setKind(value)}
              >
                {kindLabel(lang, value)}
              </button>
            ))}
          </div>
        </div>

        {showInitialLoading ? (
          <div className="market-grid" aria-label={tt(lang, { en: 'Loading collections...', ru: 'Загружаю коллекции...', zh: '正在加载收藏...', 'zh-TW': '正在載入收藏...' })}>
            {Array.from({ length: 6 }, (_, index) => (
              <div className="market-card market-card-skeleton" key={index}>
                <div className="market-skeleton-line is-short"></div>
                <div className="market-skeleton-art"></div>
                <div className="market-skeleton-line"></div>
              </div>
            ))}
          </div>
        ) : catalog.error ? (
          <div className="glass market-empty">
            <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>
              {tt(lang, { en: 'Could not load collections', ru: 'Не удалось загрузить коллекции', zh: '无法加载收藏', 'zh-TW': '無法載入收藏' })}
            </div>
            <p style={{ marginTop: 12, color: 'var(--fg-1)', maxWidth: 520, lineHeight: 1.6 }}>
              {catalog.error.message || tt(lang, {
                en: 'Try again in a moment.',
                ru: 'Попробуйте ещё раз через минуту.',
                zh: '请稍后再试。',
                'zh-TW': '請稍後再試。',
              })}
            </p>
          </div>
        ) : !collections.length ? (
          <div className="glass market-empty">
            <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>
              {tt(lang, { en: 'No collections yet', ru: 'Коллекций пока нет', zh: '暂无收藏', 'zh-TW': '尚無收藏' })}
            </div>
            <p style={{ marginTop: 12, color: 'var(--fg-1)', maxWidth: 520, lineHeight: 1.6 }}>
              {tt(lang, {
                en: 'The collection index is empty. Try again later or open a collection from an item page.',
                ru: 'Индекс коллекций пуст. Попробуйте позже или откройте коллекцию со страницы предмета.',
                zh: '收藏索引为空。请稍后再试，或从物品页打开收藏。',
                'zh-TW': '收藏索引為空。請稍後再試，或從物品頁開啟收藏。',
              })}
            </p>
          </div>
        ) : filtered.length ? (
          <div className="market-grid">
            {filtered.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                className="market-card collection-card"
                onClick={() => onCollectionClick && onCollectionClick(entry.name, entry.slug)}
              >
                <div className="market-card-top">
                  <span className="chip chip-accent">{kindLabel(lang, entry.kind)}</span>
                  <span className="chip">
                    {entry.skinCount} {tt(lang, { en: 'items', ru: 'предметов', zh: '件', 'zh-TW': '件' })}
                  </span>
                </div>

                {entry.iconUrl
                  ? (
                    <div className="collection-card-logo">
                      <img src={entry.iconUrl} alt="" />
                    </div>
                  )
                  : entry.previewIcons?.length
                    ? (
                      <div className={`collection-card-mosaic is-${Math.min(4, entry.previewIcons.length)}`}>
                        {entry.previewIcons.slice(0, 4).map((iconUrl) => (
                          <img
                            key={iconUrl}
                            src={withSteamImageSize(iconUrl, 256, 192)}
                            alt=""
                          />
                        ))}
                      </div>
                    )
                    : <ItemArt label={entry.name} tier={3} className="market-card-art" />}

                <div className="market-card-body">
                  <div className="market-card-name">{entry.name}</div>
                  <div className="market-card-open">
                    <span>{tt(lang, { en: 'Open collection', ru: 'Открыть коллекцию', zh: '打开收藏', 'zh-TW': '開啟收藏' })}</span>
                    <i>→</i>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="glass market-empty">
            <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>
              {tt(lang, { en: 'No collections match the current filters.', ru: 'По текущим фильтрам коллекций нет.', zh: '没有符合当前筛选的收藏。', 'zh-TW': '沒有符合目前篩選的收藏。' })}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              onClick={() => { setQuery(''); setKind('all'); }}
            >
              {tt(lang, { en: 'Reset filters', ru: 'Сбросить фильтры', zh: '重置筛选', 'zh-TW': '重設篩選' })}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

Object.assign(window, { CollectionsCatalog });
