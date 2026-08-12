/* global React */

function CollectionDetail({ lang, loading = false, error = null, data = null, onBack, onItemClick, onLoadMore }) {
  const collection = data?.collection || null;
  const items = data?.items || [];
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';

  if (loading && !collection) {
    return (
      <main className="collection-page">
        <div className="container">
          <div className="glass item-detail-state-card">
            <button type="button" onClick={onBack} className="btn btn-sm btn-ghost">{lang === 'ru' ? '← Назад' : '← Back'}</button>
            <h1 className="display">{lang === 'ru' ? 'Загружаем коллекцию...' : 'Loading collection...'}</h1>
          </div>
        </div>
      </main>
    );
  }

  if (error || !collection) {
    return (
      <main className="collection-page">
        <div className="container">
          <div className="glass item-detail-state-card">
            <button type="button" onClick={onBack} className="btn btn-sm btn-ghost">{lang === 'ru' ? '← Назад' : '← Back'}</button>
            <h1 className="display">{lang === 'ru' ? 'Коллекция не найдена' : 'Collection not found'}</h1>
            <p>{lang === 'ru' ? 'Проверьте ссылку или откройте коллекцию со страницы предмета.' : 'Check the URL or open a collection from an item page.'}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="collection-page">
      <div className="container">
        <button type="button" onClick={onBack} className="btn btn-sm btn-ghost item-detail-back">
          {lang === 'ru' ? '← Назад' : '← Back'}
        </button>

        <header className="collection-head">
          <div className="item-detail-tags">
            <span className="chip chip-accent">{lang === 'ru' ? 'КОЛЛЕКЦИЯ' : 'COLLECTION'}</span>
            <span className="chip">{collection.skinCount} {lang === 'ru' ? 'предметов' : 'items'}</span>
          </div>
          <h1 className="display item-detail-title">{collection.name}</h1>
          <p className="item-detail-subtitle">
            {lang === 'ru'
              ? 'Все уникальные предметы из этой коллекции. Нажмите, чтобы открыть карточку.'
              : 'All unique items from this collection. Click a card to open details.'}
          </p>
        </header>

        {items.length ? (
          <>
            <div className="market-grid">
              {items.map((item) => (
                <button
                  key={item.assetid || item.marketHashName}
                  type="button"
                  className={`market-card tier-${item.tier || 2}`}
                  onClick={() => onItemClick && onItemClick(item)}
                >
                  <div className="market-card-top">
                    <span className="chip chip-accent">{item.category || 'item'}</span>
                    <span className="chip">{item.rarity}</span>
                  </div>

                  {item.iconUrl
                    ? (
                      <div className="item-art market-card-art" style={{ display: 'grid', placeItems: 'center', padding: 18 }}>
                        <img
                          src={withSteamImageSize(item.iconUrl, 512, 320)}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'block',
                            objectFit: 'contain',
                            objectPosition: 'center center',
                            filter: 'drop-shadow(0 20px 36px rgba(0,0,0,0.5))',
                          }}
                        />
                      </div>
                    )
                    : <ItemArt label={item.name} tier={item.tier || 2} className="market-card-art" />}

                  <div className="market-card-body">
                    <div className="market-card-name">{item.name}</div>
                    <div className="market-card-sub">
                      {[item.wear !== 'N/A' ? item.wear : null, item.type].filter(Boolean).join(' · ')}
                    </div>
                    <div className="market-card-footer">
                      <div>
                        <div className="eyebrow">{lang === 'ru' ? 'ЦЕНА' : 'PRICE'}</div>
                        <div className="display market-card-price">{formatItemPrice(item, item.price)}</div>
                      </div>
                    </div>
                    <div className="market-card-open">
                      <span>{lang === 'ru' ? 'Подробнее' : 'View details'}</span>
                      <i>→</i>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="market-pagination">
              <div className="market-pagination-progress">
                <span>
                  {items.length.toLocaleString(locale)} {lang === 'ru' ? 'из' : 'of'}{' '}
                  {(data.filteredCount || items.length).toLocaleString(locale)}
                </span>
              </div>
              {data.hasMore && (
                <button type="button" className="btn btn-sm btn-primary" disabled={loading} onClick={onLoadMore}>
                  {loading ? '...' : (lang === 'ru' ? 'Ещё' : 'Load more')}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="glass item-detail-state-card">
            <p>{lang === 'ru' ? 'В коллекции пока нет предметов.' : 'No items in this collection yet.'}</p>
          </div>
        )}
      </div>
    </main>
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
      title={lang === 'ru' ? 'Открыть коллекцию' : 'Open collection'}
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

Object.assign(window, { CollectionDetail, CollectionChip });
