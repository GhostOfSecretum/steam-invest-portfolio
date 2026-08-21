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

function InvestorActivityRows({ events, lang, showInvestor = false }) {
  const rows = (Array.isArray(events) ? events : []).filter((row) => row && row.kind && row.at);
  if (!rows.length) return null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((row) => {
        const kindColor = row.kind === 'removed' || row.kind === 'qty_down'
          ? 'var(--red)'
          : (row.kind === 'added' || row.kind === 'qty_up' ? 'var(--green)' : 'var(--fg-1)');
        const qtyLabel = Number.isFinite(row.qtyDelta) && row.qtyDelta !== 0
          ? `${row.qtyDelta > 0 ? '+' : ''}${row.qtyDelta}`
          : (Number.isFinite(row.qtyAfter) ? String(row.qtyAfter) : '—');
        return (
          <div
            key={row.id || `${row.steamId || ''}-${row.at}-${row.marketHashName}-${row.kind}`}
            style={{
              padding: '10px 12px',
              border: '1px solid var(--line)',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              display: 'grid',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
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
            <div style={{ fontSize: 13, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.marketHashName || row.name}>
              {row.name || row.marketHashName || '—'}
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

function TopInvestorsPage({ lang, onOpenProfile }) {
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
      activity: 'Активность',
      watchlistFeed: 'Лента watchlist',
      selected: 'Выбранный аккаунт',
      refresh: 'Обновить',
      syncing: 'Синхронизация…',
      loading: 'Загрузка…',
      noEvents: 'Пока нет изменений. Нажмите «Обновить», чтобы снять снимок инвентаря.',
      baselineOnly: 'Базовая точка сохранена. Изменения появятся после следующего обновления с другим составом инвентаря.',
      feedEmpty: 'Общая лента пуста — события появятся после обновления аккаунтов.',
    }
    : {
      title: 'Top investor accounts',
      sub: 'A curated set of Steam portfolios you can follow for free — including the activity feed.',
      empty: 'The list is empty for now — accounts will appear here once the curated set is added.',
      open: 'Open portfolio',
      coming: 'Coming soon',
      activity: 'Activity',
      watchlistFeed: 'Watchlist feed',
      selected: 'Selected account',
      refresh: 'Refresh',
      syncing: 'Syncing…',
      loading: 'Loading…',
      noEvents: 'No changes yet. Press Refresh to take an inventory snapshot.',
      baselineOnly: 'Baseline saved. Changes will appear after the next refresh with a different inventory.',
      feedEmpty: 'Watchlist feed is empty — events appear after accounts are refreshed.',
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
          <div className="top-investors-layout" style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 420px) minmax(320px, 1fr)',
            gap: 18,
            alignItems: 'start',
          }}>
            <div style={{ display: 'grid', gap: 10, maxHeight: '70vh', overflow: 'auto', paddingRight: 4 }}>
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

            <div className="glass-strong" style={{
              padding: 18,
              position: 'sticky',
              top: 24,
              maxHeight: '70vh',
              overflow: 'auto',
              display: 'grid',
              gap: 18,
            }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--accent)' }}>{copy.activity}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 500 }}>
                      {selectedAccount?.personaname || copy.selected}
                    </div>
                    {selectedActivity.data?.syncedAt ? (
                      <div style={{ marginTop: 4, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
                        {lang === 'ru' ? 'Синк' : 'Synced'}: {new Date(selectedActivity.data.syncedAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={!selectedSteamId || selectedActivity.syncing}
                    onClick={async () => {
                      await selectedActivity.sync();
                      feed.reload();
                    }}
                  >
                    {selectedActivity.syncing ? copy.syncing : copy.refresh}
                  </button>
                </div>
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
                <InvestorActivityRows events={selectedActivity.data.activity} lang={lang} />
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--fg-3)' }}>{copy.watchlistFeed}</div>
                {feed.loading && !feed.data && (
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{copy.loading}</div>
                )}
                {feed.data && !(feed.data.events || []).length && (
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{copy.feedEmpty}</div>
                )}
                {feed.data && (feed.data.events || []).length > 0 && (
                  <InvestorActivityRows events={feed.data.events} lang={lang} showInvestor />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 960px) {
          .top-investors-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

window.TopInvestorsPage = TopInvestorsPage;
