/* global React, useSmartMoneySignals, useSmartMoneyBacktest, useSmartMoneyIndex, useSmartMoneyItem, useSmartMoneyExposure,
   useAuth, apiFetch, TaSection, TaEmpty, TaIcon, TaAvatarStack, TaScoreRing, taMoney, taSigned, taPct */
const { useState: smUseState, useEffect: smUseEffect } = React;

const SM_SIGNAL_META = {
  accumulation: { color: 'var(--green)', ru: 'Скупка', en: 'Accumulation' },
  exit: { color: 'var(--red)', ru: 'Выход', en: 'Exit' },
  control: { color: 'var(--accent)', ru: 'Контроль', en: 'Control' },
};

function smAgo(iso, lang) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return lang === 'ru' ? `${minutes} мин назад` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return lang === 'ru' ? `${hours} ч назад` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return lang === 'ru' ? `${days} дн. назад` : `${days}d ago`;
}

function smRet(value) {
  if (!Number.isFinite(value)) return <span style={{ color: 'var(--fg-3)' }}>—</span>;
  const color = value > 0 ? 'var(--green)' : (value < 0 ? 'var(--red)' : 'var(--fg-2)');
  return <span style={{ color }}>{value > 0 ? '+' : ''}{(value * 100).toFixed(1)}%</span>;
}

function smProfileUrl(steamId) {
  return `https://steamcommunity.com/profiles/${steamId}`;
}

function smSignalDetail(signal, t) {
  const accounts = (signal.accounts || []).length;
  if (signal.type === 'control') {
    return t(
      `${taPct(signal.control)} рыночного предложения у ${signal.holders} акк. · ${signal.units.toLocaleString()} шт`,
      `${taPct(signal.control)} of market supply held by ${signal.holders} acc. · ${signal.units.toLocaleString()} pcs`,
    );
  }
  const units = `${signal.deltaUnits > 0 ? '+' : ''}${signal.deltaUnits}`;
  return t(
    `${accounts} акк. · ${units} шт · ${taSigned(signal.deltaUsd)} · контроль ${taPct(signal.control)}`,
    `${accounts} acc. · ${units} pcs · ${taSigned(signal.deltaUsd)} · control ${taPct(signal.control)}`,
  );
}

function SmartMoneySignals({ lang, t, onOpenItem }) {
  const signals = useSmartMoneySignals();
  const rows = signals.data?.signals || [];
  return (
    <TaSection
      eyebrow="// SIGNALS"
      title={t('Сигналы', 'Signals')}
      sub={t(
        'Скупка — 2+ аккаунта докупили предмет за 48 часов. Выход — 2+ аккаунта продают или крупный держатель сбрасывает 30%+ позиции. Контроль — у отслеживаемых аккаунтов 50%+ рыночного предложения.',
        'Accumulation — 2+ accounts bought the item within 48 hours. Exit — 2+ accounts sell or a large holder dumps 30%+ of the position. Control — tracked accounts hold 50%+ of market supply.',
      )}
    >
      {signals.loading && !signals.data ? <TaEmpty>{t('Загрузка…', 'Loading…')}</TaEmpty> : null}
      {signals.data && !rows.length ? <TaEmpty>{t('Сигналов пока нет — они появятся, когда аккаунты начнут двигаться.', 'No signals yet — they appear once accounts start moving.')}</TaEmpty> : null}
      {rows.length ? (
        <div className="sm-signals">
          {rows.map((signal) => {
            const meta = SM_SIGNAL_META[signal.type] || SM_SIGNAL_META.control;
            return (
              <button key={signal.id} type="button" className="sm-signal" style={{ '--sig': meta.color }} onClick={() => onOpenItem && onOpenItem(signal.marketHashName)}>
                <span className="sm-signal-type">{lang === 'ru' ? meta.ru : meta.en}</span>
                <TaIcon src={signal.iconUrl} />
                <span className="ta-radar-copy">
                  <span className="ta-radar-name" title={signal.marketHashName}>{signal.marketHashName}</span>
                  <span className="ta-radar-meta">{smSignalDetail(signal, t)}</span>
                </span>
                <TaAvatarStack holders={(signal.accounts || []).slice(0, 5).map((row) => ({ ...row, qty: row.qtyDelta ?? row.qty }))} />
                <span className="sm-signal-time">{smAgo(signal.at, lang)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </TaSection>
  );
}

function SmIndexChart({ series, t }) {
  const points = series.filter((point) => Number.isFinite(point.whale));
  if (points.length < 2) return <TaEmpty>{t('Недостаточно истории цен для индекса.', 'Not enough price history for the index.')}</TaEmpty>;
  const W = 640;
  const H = 220;
  const L = 36;
  const R = 12;
  const T = 12;
  const B = 24;
  const values = points.flatMap((point) => [point.whale, point.market]).filter(Number.isFinite);
  const min = Math.min(...values, 100) * 0.98;
  const max = Math.max(...values, 100) * 1.02;
  const x = (index) => L + (index / (points.length - 1)) * (W - L - R);
  const y = (value) => T + (1 - (value - min) / (max - min)) * (H - T - B);
  const line = (key) => points
    .map((point, index) => (Number.isFinite(point[key]) ? `${index === 0 || !Number.isFinite(points[index - 1][key]) ? 'M' : 'L'}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}` : ''))
    .join(' ');
  const fmt = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const area = `${line('whale')} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z`;

  return (
    <svg className="ta-timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Индекс smart money', 'Smart money index')}>
      <defs>
        <linearGradient id="sm-index-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[min, 100, max].map((tick) => (
        <g key={tick}>
          <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} className="ta-grid" strokeDasharray={tick === 100 ? '3 3' : undefined} />
          <text x={L - 6} y={y(tick) + 4} textAnchor="end" className="ta-axis">{Math.round(tick)}</text>
        </g>
      ))}
      <path d={area} fill="url(#sm-index-fill)" />
      <path d={line('market')} fill="none" stroke="var(--cyan)" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.8" />
      <path d={line('whale')} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
      <text x={L} y={H - 6} className="ta-axis">{fmt(points[0].t)}</text>
      <text x={W - R} y={H - 6} textAnchor="end" className="ta-axis">{fmt(points[points.length - 1].t)}</text>
    </svg>
  );
}

function SmartMoneyIndex({ t }) {
  const index = useSmartMoneyIndex();
  const data = index.data;
  const last = data?.series?.length ? data.series[data.series.length - 1] : null;
  const change = (value) => (Number.isFinite(value) ? value / 100 - 1 : null);
  return (
    <TaSection
      eyebrow="// SMART MONEY INDEX"
      title={t('Индекс smart money против рынка', 'Smart money index vs market')}
      sub={t(
        'Как менялась бы стоимость текущего совокупного портфеля китов (топ-25 позиций, фиксированные количества) за 90 дней, против капитализации рынка CS2. Оба ряда = 100 на старте.',
        'How the current combined whale portfolio (top 25 positions, fixed quantities) would have moved over 90 days, against CS2 market cap. Both series start at 100.',
      )}
    >
      {!data?.computedAt ? <TaEmpty>{t('Индекс считается в фоне — появится через несколько минут после запуска сервера.', 'The index is computed in the background — it shows up a few minutes after the server starts.')}</TaEmpty> : (
        <>
          <div className="sm-stats">
            <div><span className="eyebrow">{t('Киты 90д', 'Whales 90d')}</span><b style={{ color: 'var(--accent)' }}>{smRet(change(last?.whale))}</b></div>
            <div><span className="eyebrow">{t('Рынок 90д', 'Market 90d')}</span><b>{smRet(change(last?.market))}</b></div>
            <div><span className="eyebrow">{t('Компонентов', 'Components')}</span><b>{data.components.length}</b></div>
            <div><span className="eyebrow">{t('Покрытие капитала', 'Capital covered')}</span><b>{taPct(data.coverage)}</b></div>
          </div>
          <SmIndexChart series={data.series} t={t} />
          <div className="ta-legend">
            <span><i style={{ background: 'var(--accent)' }} />{t('портфель китов', 'whale portfolio')}</span>
            <span><i style={{ background: 'var(--cyan)' }} />{t('рынок CS2', 'CS2 market')}</span>
          </div>
        </>
      )}
    </TaSection>
  );
}

function SmartMoneyBacktest({ lang, t, onOpenItem }) {
  const backtest = useSmartMoneyBacktest();
  const data = backtest.data;
  const all = data?.summary?.all;
  const joint = data?.summary?.joint;
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });

  const statRow = (label, row) => (
    <div className="sm-bt-row">
      <span className="sm-bt-label">{label}</span>
      <span>{row?.trades || 0}<small>{t('сделок', 'trades')}</small></span>
      <span>{taPct(row?.win7)}<small>{t('в плюсе 7д', 'win 7d')}</small></span>
      <span>{smRet(row?.med7)}<small>{t('медиана 7д', 'median 7d')}</small></span>
      <span>{smRet(row?.alpha7)}<small>{t('vs рынок 7д', 'vs market 7d')}</small></span>
      <span>{taPct(row?.win30)}<small>{t('в плюсе 30д', 'win 30d')}</small></span>
      <span>{smRet(row?.med30)}<small>{t('медиана 30д', 'median 30d')}</small></span>
      <span>{smRet(row?.alpha30)}<small>{t('vs рынок 30д', 'vs market 30d')}</small></span>
    </div>
  );

  return (
    <TaSection
      eyebrow="// BACKTEST"
      title={t('Бэктест «следуй за китами»', 'Backtest: follow the whales')}
      sub={t(
        'Если бы вы покупали в тот же день, что и отслеживаемые аккаунты: доходность через 7 и 30 дней и разница с рынком. Только реальная история цен, синтетика исключена. Статистика копится с каждым днём наблюдения.',
        'If you had bought on the same day as tracked accounts: returns after 7 and 30 days and the difference vs the market. Real price history only, synthetic data excluded. The stats grow with every day of tracking.',
      )}
    >
      {!data?.computedAt ? <TaEmpty>{t('Бэктест считается в фоне — появится через несколько минут после запуска сервера.', 'The backtest is computed in the background — it shows up a few minutes after the server starts.')}</TaEmpty> : (
        <>
          <div className="sm-bt">
            {statRow(t('Все покупки', 'All buys'), all)}
            {statRow(t('Совместные (2+ акк.)', 'Joint (2+ acc.)'), joint)}
          </div>
          {data.trades.length ? (
            <div className="ta-board">
              <div className="ta-board-row sm-bt-trade is-head">
                <span>{t('Дата', 'Date')}</span>
                <span>{t('Предмет', 'Item')}</span>
                <span>{t('Акк.', 'Acc.')}</span>
                <span>{t('Вход', 'Entry')}</span>
                <span>7d</span>
                <span>30d</span>
                <span>{t('Сейчас', 'Now')}</span>
              </div>
              {data.trades.map((trade) => (
                <div key={`${trade.marketHashName}-${trade.at}`} className="ta-board-row sm-bt-trade is-link" role="link" tabIndex={0} onClick={() => onOpenItem && onOpenItem(trade.marketHashName)}>
                  <span className="ta-board-muted">{fmtDate(trade.at)}</span>
                  <span className="ta-board-account">
                    <TaIcon src={trade.iconUrl} className="ta-icon-sm" />
                    <span><b style={{ fontFamily: 'var(--f-body)', fontSize: 13 }}>{trade.marketHashName}</b><small>{trade.units} {t('шт', 'pcs')} · {taMoney(trade.usd)}</small></span>
                  </span>
                  <span className="ta-board-num">{trade.accounts}</span>
                  <span className="ta-board-num">{taMoney(trade.entryUsd)}</span>
                  <span className="ta-board-num">{smRet(trade.ret7)}</span>
                  <span className="ta-board-num">{smRet(trade.ret30)}</span>
                  <span className="ta-board-num">{smRet(trade.retNow)}</span>
                </div>
              ))}
            </div>
          ) : <TaEmpty>{t('Сделок с реальной историей цен пока нет.', 'No trades with real price history yet.')}</TaEmpty>}
        </>
      )}
    </TaSection>
  );
}

function SmSparkline({ points }) {
  if (points.length < 2) return null;
  const W = 240;
  const H = 48;
  const values = points.map((point) => point.units);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = points.map((point, index) => `${index ? 'L' : 'M'}${(index / (points.length - 1)) * W},${H - 4 - ((point.units - min) / span) * (H - 8)}`).join(' ');
  return (
    <svg className="sm-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SmartMoneyPaywall({ lang, compact = false }) {
  const auth = useAuth();
  const [offer, setOffer] = smUseState(null);
  const [pending, setPending] = smUseState('');
  const [error, setError] = smUseState('');
  const t = (ru, en) => (lang === 'ru' ? ru : en);

  smUseEffect(() => {
    let cancelled = false;
    apiFetch(`/api/smart-money/offer?locale=${encodeURIComponent(lang || 'en')}`)
      .then((data) => { if (!cancelled) setOffer(data); })
      .catch(() => { if (!cancelled) setOffer({ plans: [], billingReady: false }); });
    return () => { cancelled = true; };
  }, [lang]);

  const buy = async (planId) => {
    setPending(planId);
    setError('');
    try {
      const data = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, locale: lang }),
      });
      if (data.redirectUrl) window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err.message || t('Не удалось открыть оплату.', 'Could not open checkout.'));
      setPending('');
    }
  };

  return (
    <section className={`glass sm-paywall${compact ? ' sm-paywall-compact' : ''}`}>
      <div className="eyebrow" style={{ color: 'var(--accent)' }}>// SMART MONEY</div>
      <h2 className="ta-section-title">{t('Аналитика китов по подписке', 'Whale analytics is a paid plan')}</h2>
      <p className="ta-section-sub">
        {t(
          'Сигналы, доля рынка, бэктест и риск бустеров. Список аккаунтов и лента остаются открытыми.',
          'Signals, supply share, the backtest, and booster risk. The account list and the feed stay open.',
        )}
      </p>
      <div className="sm-paywall-plans">
        {(offer?.plans || []).map((plan) => (
          auth.connected ? (
            <button key={plan.id} type="button" className="btn btn-primary" disabled={!offer.billingReady || Boolean(pending)} onClick={() => buy(plan.id)}>
              {pending === plan.id ? t('Открываю оплату…', 'Opening checkout…') : plan.price}
            </button>
          ) : (
            <span key={plan.id} className="btn">{plan.price}</span>
          )
        ))}
        {!auth.connected && offer?.plans?.length ? (
          <button type="button" className="btn btn-primary" onClick={() => auth.login()}>
            {t('Войти через Steam', 'Sign in with Steam')}
          </button>
        ) : null}
      </div>
      {error ? <div className="sm-paywall-error">{error}</div> : null}
    </section>
  );
}

function SmartMoneyItemPanel({ marketHashName, lang, onOpenProfile }) {
  const state = useSmartMoneyItem(marketHashName);
  const t = (ru, en) => (lang === 'ru' ? ru : en);
  const data = state.data;
  if (state.locked) return <SmartMoneyPaywall lang={lang} compact />;
  if (!data) return null;

  if (!data.tracked) {
    return (
      <section className="glass sm-item">
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>// SMART MONEY</div>
        <div className="ta-empty">{t(`Ни один из ${data.accounts} отслеживаемых аккаунтов не держит этот предмет.`, `None of the ${data.accounts} tracked accounts hold this item.`)}</div>
      </section>
    );
  }

  const openProfile = (steamId) => onOpenProfile && onOpenProfile(smProfileUrl(steamId));
  return (
    <section className="glass sm-item">
      <div className="sm-item-head">
        <div>
          <div className="eyebrow" style={{ color: 'var(--accent)' }}>// SMART MONEY</div>
          <h2 className="ta-section-title">{t('Кто из китов держит предмет', 'Which whales hold this item')}</h2>
        </div>
        <TaScoreRing score={data.score} />
      </div>
      <div className="sm-stats">
        <div><span className="eyebrow">{t('Держат', 'Held')}</span><b>{data.units.toLocaleString()} {t('шт', 'pcs')}</b></div>
        <div><span className="eyebrow">{t('Доля предложения', 'Supply share')}</span><b style={{ color: (data.control ?? 0) >= 0.5 ? 'var(--accent)' : undefined }}>{taPct(data.control)}</b></div>
        <div><span className="eyebrow">{t('Держателей', 'Holders')}</span><b>{data.holders} / {data.accounts}</b></div>
        <div><span className="eyebrow">{t('Поток 7д', 'Flow 7d')}</span><b>{data.flow7d ? `${data.flow7d.netUnits > 0 ? '+' : ''}${data.flow7d.netUnits}` : '—'}</b></div>
      </div>
      {data.signals.length ? (
        <div className="sm-item-signals">
          {data.signals.map((signal) => {
            const meta = SM_SIGNAL_META[signal.type] || SM_SIGNAL_META.control;
            return <span key={signal.id} className="sm-chip" style={{ '--sig': meta.color }}>{lang === 'ru' ? meta.ru : meta.en} · {smAgo(signal.at, lang)}</span>;
          })}
        </div>
      ) : null}
      <div className="sm-item-grid">
        <div className="ta-links">
          {data.holdersList.slice(0, 8).map((holder) => (
            <button key={holder.steamId} type="button" className="ta-flow-row sm-holder" onClick={() => openProfile(holder.steamId)}>
              {holder.avatar ? <img src={holder.avatar} alt="" /> : <i />}
              <span className="ta-radar-copy">
                <span className="ta-radar-name">{holder.personaname || holder.steamId}</span>
                <span className="ta-control-bar"><span style={{ width: taPct(holder.share ?? 0) }} /></span>
              </span>
              <span className="ta-flow-num">{holder.qty.toLocaleString()}<small>{taMoney(holder.valueUsd)}</small></span>
            </button>
          ))}
        </div>
        <div className="sm-item-side">
          {data.unitsHistory.length >= 2 ? (
            <div>
              <div className="eyebrow">{t('Сколько держат киты по дням', 'Whale units by day')}</div>
              <SmSparkline points={data.unitsHistory} />
            </div>
          ) : null}
          <div className="eyebrow">{t('Последние движения', 'Recent moves')}</div>
          {data.moves.length ? data.moves.slice(0, 8).map((move) => (
            <div key={move.id} className="sm-move">
              <span style={{ color: move.qtyDelta > 0 ? 'var(--green)' : 'var(--red)' }}>{move.qtyDelta > 0 ? '+' : ''}{move.qtyDelta}</span>
              <span className="sm-move-name">{move.personaname || move.steamId}</span>
              <span className="ta-board-muted">{smAgo(move.at, lang)}</span>
            </div>
          )) : <TaEmpty>{t('Движений пока не было.', 'No moves yet.')}</TaEmpty>}
        </div>
      </div>
    </section>
  );
}

function BoosterExposureCard({ holdings, lang, onItemClick }) {
  const names = (holdings || []).map((holding) => holding.marketHashName);
  const exposure = useSmartMoneyExposure(names);
  const t = (ru, en) => (lang === 'ru' ? ru : en);
  const rows = exposure.data?.items || [];
  if (exposure.locked) return <SmartMoneyPaywall lang={lang} compact />;
  if (!rows.length) return null;
  const byName = new Map((holdings || []).map((holding) => [holding.marketHashName, holding]));
  const exits = rows.filter((row) => row.exitAt).length;

  return (
    <section className="glass sm-exposure">
      <div className="sm-item-head">
        <div>
          <div className="eyebrow" style={{ color: 'var(--accent)' }}>{t('// РИСК БУСТЕРОВ', '// BOOSTER RISK')}</div>
          <h2 className="ta-section-title">
            {t(`Позиции портфеля у отслеживаемых аккаунтов: ${rows.length}`, `Portfolio positions held by tracked accounts: ${rows.length}`)}
          </h2>
          <div className="ta-section-sub">
            {exits
              ? t(`⚠ По ${exits} из них киты начали выходить за последние 7 дней.`, `⚠ Whales started exiting ${exits} of them in the last 7 days.`)
              : t('Высокая доля предложения у одной группы — цена может резко упасть, когда они начнут продавать.', 'A high supply share in one group means the price can drop fast once they start selling.')}
          </div>
        </div>
        <a className="btn btn-sm btn-ghost" href="/investors">{t('Аналитика', 'Analytics')} ↗</a>
      </div>
      <div className="ta-radar-list">
        {rows.slice(0, 6).map((row) => (
          <button key={row.marketHashName} type="button" className="ta-radar-row sm-exposure-row" onClick={() => onItemClick && byName.get(row.marketHashName) && onItemClick(byName.get(row.marketHashName))}>
            <TaIcon src={row.iconUrl} />
            <span className="ta-radar-copy">
              <span className="ta-radar-name" title={row.marketHashName}>{row.marketHashName}</span>
              <span className="ta-control-bar"><span style={{ width: taPct(row.control ?? 0) }} /></span>
              <span className="ta-radar-meta">
                {t('контроль', 'control')} {taPct(row.control)} · {row.holders} {t('акк.', 'acc.')} · {row.units.toLocaleString()} {t('шт', 'pcs')}
                {row.exitAt ? <b style={{ color: 'var(--red)' }}> · {t('выходят', 'exiting')}</b> : null}
              </span>
            </span>
            <TaScoreRing score={row.score} />
          </button>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { SmartMoneySignals, SmartMoneyIndex, SmartMoneyBacktest, SmartMoneyItemPanel, BoosterExposureCard, SmartMoneyPaywall });
