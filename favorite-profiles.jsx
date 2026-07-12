/* global React, useT, useFavoriteProfiles */
const { useState } = React;

function FavoriteProfiles({ lang, onOpenProfile }) {
  const t = useT(lang);
  const favorites = useFavoriteProfiles();
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const removeProfile = async (steamId) => {
    setBusyId(steamId);
    setActionError(null);
    try {
      await favorites.remove(steamId);
    } catch (error) {
      setActionError(error?.message || (lang === 'ru' ? 'Не удалось удалить профиль' : 'Failed to remove profile'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: '40px 64px 80px' }}>
      <div className="container">
        <div style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 10, color: 'var(--accent)' }}>
            // FAVORITES · {favorites.profiles.length}
          </div>
          <h1 className="display" style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em' }}>
            {lang === 'ru' ? 'Избранные профили' : t.nav.favorites}
          </h1>
          <div style={{ marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-3)', maxWidth: 560 }}>
            {lang === 'ru'
              ? 'Сохранённые публичные профили Steam. Открой портфель и следи за инвентарём.'
              : 'Saved public Steam profiles. Open a portfolio and keep watching inventories.'}
          </div>
        </div>

        {actionError && (
          <div style={{ marginBottom: 16, fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--red)' }}>{actionError}</div>
        )}

        {favorites.loading && !favorites.profiles.length && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--fg-3)' }}>
            {lang === 'ru' ? 'Загружаем избранное...' : 'Loading favorites...'}
          </div>
        )}

        {favorites.error && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--red)' }}>
              {favorites.error.message || (lang === 'ru' ? 'Ошибка загрузки' : 'Failed to load')}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => favorites.reload()}>
              {lang === 'ru' ? 'Повторить' : 'Retry'}
            </button>
          </div>
        )}

        {!favorites.loading && !favorites.error && favorites.profiles.length === 0 && (
          <div style={{
            padding: '28px 24px',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.02)',
            maxWidth: 560,
          }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--fg-2)', marginBottom: 8 }}>
              {lang === 'ru' ? 'Пока пусто' : 'Nothing saved yet'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--fg-3)', lineHeight: 1.5 }}>
              {lang === 'ru'
                ? 'Открой публичный портфель по ссылке на главной и нажми «В избранное».'
                : 'Open a public portfolio from the home page and tap “Add to favorites”.'}
            </div>
          </div>
        )}

        {favorites.profiles.length > 0 && (
          <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
            {favorites.profiles.map((profile) => (
              <div
                key={profile.steamId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}>
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="" width={44} height={44} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>ST</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {profile.personaname}
                  </div>
                  <div style={{ marginTop: 4, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
                    {profile.steamId}
                    {profile.addedAt ? ` · ${new Date(profile.addedAt).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onOpenProfile(profile.profileUrl || profile.steamId)}
                  >
                    {lang === 'ru' ? 'Открыть' : 'Open'}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={busyId === profile.steamId}
                    onClick={() => removeProfile(profile.steamId)}
                  >
                    {busyId === profile.steamId
                      ? '...'
                      : (lang === 'ru' ? 'Удалить' : 'Remove')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

window.FavoriteProfiles = FavoriteProfiles;
