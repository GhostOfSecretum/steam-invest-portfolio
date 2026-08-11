/* global React, useT, useTopInvestors */
function TopInvestorsPage({ lang, auth, onOpenProfile, onPricing }) {
  const t = useT(lang);
  const unlocked = Boolean(auth?.entitlements?.topInvestors);
  const investors = useTopInvestors(unlocked && !auth?.loading);
  const copy = lang === 'ru'
    ? {
      title: 'Топ-аккаунты инвесторов',
      sub: 'Подборка Steam-портфелей для отслеживания на тарифе Investor.',
      lockedTitle: 'Доступно на тарифе Investor',
      lockedBody: 'Трекинг топовых аккаунтов инвесторов входит в тариф Investor. Plus даёт безлимит и desktop; Investor добавляет эту подборку.',
      viewPlans: 'Смотреть тарифы',
      empty: 'Список пока пуст — аккаунты появятся здесь, когда мы добавим подборку.',
      open: 'Открыть портфель',
      coming: 'Скоро',
    }
    : {
      title: 'Top investor accounts',
      sub: 'A curated set of Steam portfolios to watch on the Investor plan.',
      lockedTitle: 'Included with Investor',
      lockedBody: 'Top investor tracking is part of the Investor plan. Plus unlocks unlimited display and desktop; Investor adds this watchlist.',
      viewPlans: 'View plans',
      empty: 'The list is empty for now — accounts will appear here once the curated set is added.',
      open: 'Open portfolio',
      coming: 'Coming soon',
    };

  return (
    <div style={{ padding: '40px 64px 80px' }}>
      <div className="container">
        <div style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--accent)' }}>
            // INVESTOR · {unlocked ? 'UNLOCKED' : 'LOCKED'}
          </div>
          <h1 className="display" style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em' }}>
            {copy.title}
          </h1>
          <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)', maxWidth: 640 }}>
            {copy.sub}
          </div>
        </div>

        {!unlocked && (
          <div className="glass-strong" style={{ padding: 28, maxWidth: 640, display: 'grid', gap: 14 }}>
            <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>{copy.lockedTitle}</div>
            <p style={{ margin: 0, color: 'var(--fg-1)', fontSize: 14.5, lineHeight: 1.6 }}>{copy.lockedBody}</p>
            <div>
              <button type="button" className="btn btn-primary" onClick={() => onPricing && onPricing()}>
                {copy.viewPlans}
              </button>
            </div>
          </div>
        )}

        {unlocked && investors.loading && !investors.data && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--fg-3)' }}>...</div>
        )}

        {unlocked && investors.error && !investors.locked && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--red)' }}>
              {investors.error.message || 'Failed to load'}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => investors.reload()}>
              {lang === 'ru' ? 'Повторить' : 'Retry'}
            </button>
          </div>
        )}

        {unlocked && investors.data && (investors.data.accounts || []).length === 0 && (
          <div className="glass" style={{ padding: 28, maxWidth: 560 }}>
            <div className="chip chip-accent" style={{ marginBottom: 12 }}>{copy.coming}</div>
            <div style={{ fontSize: 14.5, color: 'var(--fg-1)', lineHeight: 1.55 }}>{copy.empty}</div>
          </div>
        )}

        {unlocked && investors.data && (investors.data.accounts || []).length > 0 && (
          <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
            {investors.data.accounts.map((account) => (
              <div key={account.steamId} className="glass" style={{
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {account.avatar ? (
                    <img src={account.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid var(--line-strong)' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, fontWeight: 500 }}>{account.personaname}</div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {account.note || account.steamId}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => onOpenProfile(account.profileUrl || account.steamId)}
                >
                  {copy.open}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

window.TopInvestorsPage = TopInvestorsPage;
