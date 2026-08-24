/* global React, useTopInvestors, useTopInvestorsActivityFeed, useTopInvestorActivity */
const { useState: tiUseState, useEffect: tiUseEffect } = React;

function investorActivityKindLabel(kind, lang) {
  const ru = {
    added: 'Появилось',
    removed: 'Ушло',
    qty_up: 'Кол-во +',
    qty_down: 'Кол-во −',
    updated: 'Изменено',
  };
  const en = {
    added: 'Appeared',
    removed: 'Left',
    qty_up: 'Qty +',
    qty_down: 'Qty −',
    updated: 'Updated',
  };
  return (lang === 'ru' ? ru : en)[kind] || kind;
}

function InvestorActivityRows({ events, lang, showInvestor = false, onOpenItem }) {
  const rows = (Array.isArray(events) ? events : []).filter((row) => row && row.kind && row.at);
  if (!rows.length) return null;

  return (
    <div className="top-investors-events">
      {rows.map((row) => {
        const kindColor = row.kind === 'removed' || row.kind === 'qty_down'
          ? 'var(--red)'
          : (row.kind === 'added' || row.kind === 'qty_up' ? 'var(--green)' : 'var(--fg-1)');
        const qtyLabel = Number.isFinite(row.qtyDelta) && row.qtyDelta !== 0
          ? `${row.qtyDelta > 0 ? '+' : ''}${row.qtyDelta}`
          : (Number.isFinite(row.qtyAfter) ? String(row.qtyAfter) : '—');
        const canOpen = Boolean(row.marketHashName && onOpenItem);
        return (
          <div
            key={row.id || `${row.steamId || ''}-${row.at}-${row.marketHashName}-${row.kind}`}
            className={`top-investors-event${canOpen ? ' is-link' : ''}`}
            role={canOpen ? 'link' : undefined}
            tabIndex={canOpen ? 0 : undefined}
            onClick={canOpen ? () => onOpenItem(row.marketHashName) : undefined}
            onKeyDown={canOpen ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenItem(row.marketHashName);
              }
            } : undefined}
          >
            <div className="top-investors-event-head">
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: kindColor }}>
                {investorActivityKindLabel(row.kind, lang)}
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                {new Date(row.at).toLocaleString()}
              </div>
            </div>
            {showInvestor && row.personaname ? (
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
                {row.personaname}
              </div>
            ) : null}
            <div className="top-investors-event-name" title={row.marketHashName || row.name}>
              {row.name || row.marketHashName || '—'}
              {canOpen ? <span>↗</span> : null}
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: kindColor }}>
              {qtyLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopInvestorsPage({ lang, onOpenProfile, onOpenItem }) {
  const investors = useTopInvestors();
  const feed = useTopInvestorsActivityFeed();
  const [selectedSteamId, setSelectedSteamId] = tiUseState(null);
  const selectedActivity = useTopInvestorActivity(selectedSteamId, Boolean(selectedSteamId));

  const accounts = investors.data?.accounts || [];

  tiUseEffect(() => {
    if (!accounts.length) {
      setSelectedSteamId(null);
      return;
    }
    if (!selectedSteamId || !accounts.some((account) => account.steamId === selectedSteamId)) {
      setSelectedSteamId(accounts[0].steamId);
    }
  }, [accounts, selectedSteamId]);

  const selectedAccount = accounts.find((account) => account.steamId === selectedSteamId) || null;

  const copy = lang === 'ru'
    ? {
      title: 'Топ-аккаунты инвесторов',
      sub: 'Подборка Steam-портфелей, которые можно смотреть без оплаты — вместе с лентой изменений.',
      empty: 'Список пока пуст — аккаунты появятся здесь, когда мы добавим подборку.',
      open: 'Открыть портфель',
      coming: 'Скоро',
      activity: 'Личная активность',
      watchlistFeed: 'Общая лента',
      selected: 'Выбранный аккаунт',
      live: 'автообновление',
      loading: 'Загрузка…',
      noEvents: 'Пока нет изменений по этому аккаунту. Новые сделки появятся здесь сами.',
      baselineOnly: 'Базовая точка сохранена. Изменения появятся, когда инвентарь изменится.',
      feedEmpty: 'Общая лента пуста — события появятся после автоматического обновления аккаунтов.',
    }
    : {
      title: 'Top investor accounts',
      sub: 'A curated set of Steam portfolios you can follow for free — including the activity feed.',
      empty: 'The list is empty for now — accounts will appear here once the curated set is added.',
      open: 'Open portfolio',
      coming: 'Coming soon',
      activity: 'Personal activity',
      watchlistFeed: 'Watchlist feed',
      selected: 'Selected account',
      live: 'auto-updating',
      loading: 'Loading…',
      noEvents: 'No changes for this account yet. New trades will show up here automatically.',
      baselineOnly: 'Baseline saved. Changes will appear once the inventory moves.',
      feedEmpty: 'Watchlist feed is empty — events appear after accounts update automatically.',
    };

  return (
    <div style={{ padding: '40px 64px 80px' }}>
      <div className="container">
        <div style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--accent)' }}>
            // WATCHLIST
          </div>
          <h1 className="display" style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em' }}>
            {copy.title}
          </h1>
          <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)', maxWidth: 640 }}>
            {copy.sub}
          </div>
        </div>

        {investors.loading && !investors.data && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--fg-3)' }}>...</div>
        )}

        {investors.error && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--red)' }}>
              {investors.error.message || 'Failed to load'}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => investors.reload()}>
              {lang === 'ru' ? 'Повторить' : 'Retry'}
            </button>
          </div>
        )}

        {investors.data && accounts.length === 0 && (
          <div className="glass" style={{ padding: 28, maxWidth: 560 }}>
            <div className="chip chip-accent" style={{ marginBottom: 12 }}>{copy.coming}</div>
            <div style={{ fontSize: 14.5, color: 'var(--fg-1)', lineHeight: 1.55 }}>{copy.empty}</div>
          </div>
        )}

        {accounts.length > 0 && (
          <div className="top-investors-layout">
            <div className="top-investors-accounts">
              {accounts.map((account) => {
                const selected = account.steamId === selectedSteamId;
                return (
                  <div
                    key={account.steamId}
                    className="glass"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSteamId(account.steamId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedSteamId(account.steamId);
                      }
                    }}
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 16,
                      cursor: 'pointer',
                      borderColor: selected ? 'var(--accent)' : undefined,
                      boxShadow: selected ? 'inset 0 0 0 1px var(--accent)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      {account.avatar ? (
                        <img src={account.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid var(--line-strong)' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, fontWeight: 500 }}>{account.personaname}</div>
                        {account.note ? (
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {account.note}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenProfile(account.profileUrl || account.steamId);
                      }}
                    >
                      {copy.open}
                    </button>
                  </div>
                );
              })}
            </div>

            <section className="glass top-investors-personal">
              <div className="top-investors-panel-head">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--accent)' }}>{copy.activity}</div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 500 }}>
                    {selectedAccount?.personaname || copy.selected}
                  </div>
                  {selectedActivity.data?.syncedAt ? (
                    <div style={{ marginTop: 4, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
                      {lang === 'ru' ? 'Синк' : 'Synced'}: {new Date(selectedActivity.data.syncedAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
                <span className="item-detail-live"><span className="live-dot" /> {copy.live}</span>
              </div>

              {selectedActivity.loading && !selectedActivity.data && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{copy.loading}</div>
              )}

              {selectedActivity.error && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--red)' }}>
                  {selectedActivity.error.message || 'Failed to load activity'}
                </div>
              )}

              {selectedActivity.data && !(selectedActivity.data.activity || []).length && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5 }}>
                  {selectedActivity.data.baselineOnly ? copy.baselineOnly : copy.noEvents}
                </div>
              )}

              {selectedActivity.data && (selectedActivity.data.activity || []).length > 0 && (
                <InvestorActivityRows events={selectedActivity.data.activity} lang={lang} onOpenItem={onOpenItem} />
              )}
            </section>

            <section className="glass top-investors-feed">
              <div className="top-investors-panel-head">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--fg-3)' }}>{copy.watchlistFeed}</div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 500 }}>
                    {lang === 'ru' ? 'Все рейдеры' : 'All raiders'}
                  </div>
                </div>
                <span className="item-detail-live"><span className="live-dot" /> {copy.live}</span>
              </div>
              {feed.loading && !feed.data && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{copy.loading}</div>
              )}
              {feed.data && !(feed.data.events || []).length && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{copy.feedEmpty}</div>
              )}
              {feed.data && (feed.data.events || []).length > 0 && (
                <InvestorActivityRows events={feed.data.events} lang={lang} showInvestor onOpenItem={onOpenItem} />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

window.TopInvestorsPage = TopInvestorsPage;
