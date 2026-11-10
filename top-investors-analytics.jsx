/* global React, useTopInvestorsAnalytics, useSmartMoneyItem, useItemHistory, apiFetch, formatMoney, SmartMoneySignals, SmartMoneyIndex, SmartMoneyBacktest */
const { useState: taUseState } = React;

const TA_CATEGORY_COLORS = {
  skins: 'var(--accent)',
  knives: 'var(--amber)',
  stickers: 'var(--cyan)',
  containers: 'var(--rar-2)',
  other: 'var(--fg-3)',
};
const TA_GROUP_COLORS = ['var(--accent)', 'var(--cyan)', 'var(--amber)', 'var(--green)', 'var(--rar-2)', 'var(--rar-1)', 'var(--rar-3)'];

function taMoney(value) {
  return formatMoney(value, { digits: Math.abs(value) >= 1000 ? 1 : 0, compact: true });
}

function taSigned(value) {
  if (!Number.isFinite(value) || value === 0) return taMoney(0);
  return `${value > 0 ? '+' : '−'}${taMoney(Math.abs(value))}`;
}

function taPct(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

function taFlowColor(flow) {
  if (!flow || !flow.netUnits) return 'var(--cyan)';
  return flow.netUnits > 0 ? 'var(--green)' : 'var(--red)';
}

function taShortName(name, max = 34) {
  const text = String(name || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function TaSection({ eyebrow, title, sub, children, className = '' }) {
  return (
    <section className={`glass ta-section ${className}`}>
      <div className="ta-section-head">
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>{eyebrow}</div>
        <h2 className="ta-section-title">{title}</h2>
        {sub ? <div className="ta-section-sub">{sub}</div> : null}
      </div>
      {children}
    </section>
  );
}

function TaEmpty({ children }) {
  return <div className="ta-empty">{children}</div>;
}

function TaIcon({ src, className = 'ta-icon' }) {
  return src ? <img className={className} src={src} alt="" loading="lazy" /> : <i className={className} aria-hidden="true" />;
}

function TaAvatarStack({ holders }) {
  return (
    <div className="ta-avatars">
      {(holders || []).map((holder) => {
        const title = `${holder.personaname || holder.steamId}${holder.qty != null ? ` · ${holder.qty}` : ''}`;
        return holder.avatar
          ? <img key={holder.steamId} src={holder.avatar} alt="" title={title} />
          : <i key={holder.steamId} title={title} />;
      })}
    </div>
  );
}

function TaScoreRing({ score }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const color = score >= 60 ? 'var(--red)' : (score >= 35 ? 'var(--amber)' : 'var(--cyan)');
  return (
    <svg className="ta-score" viewBox="0 0 44 44" aria-label={`score ${score}`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 22 22)"
      />
      <text x="22" y="26.5" textAnchor="middle" fill="var(--fg-0)">{score}</text>
    </svg>
  );
}

function TaKpis({ totals, t }) {
  const cards = [
    { label: t('Под наблюдением', 'Tracked'), value: `${totals.withSnapshot}`, hint: t(`из ${totals.accounts} аккаунтов`, `of ${totals.accounts} accounts`) },
    { label: t('Капитал в инвентарях', 'Capital in inventories'), value: taMoney(totals.valueUsd), hint: t(`оценено ${taPct(totals.pricedShare)} единиц`, `${taPct(totals.pricedShare)} of units priced`) },
    { label: t('Предметов', 'Items'), value: totals.uniqueItems.toLocaleString(), hint: t(`${totals.units.toLocaleString()} единиц`, `${totals.units.toLocaleString()} units`) },
    {
      label: t('Чистый поток 7д', 'Net flow 7d'),
      value: taSigned(totals.flow7dUsd),
      hint: t(`${totals.moves7d} сделок · только покупки с рынка и продажи`, `${totals.moves7d} trades · market buys and sales only`),
      color: totals.flow7dUsd > 0 ? 'var(--green)' : (totals.flow7dUsd < 0 ? 'var(--red)' : undefined),
    },
  ];
  return (
    <div className="ta-kpis">
      {cards.map((card) => (
        <div key={card.label} className="glass ta-kpi">
          <div className="eyebrow">{card.label}</div>
          <div className="ta-kpi-value" style={card.color ? { color: card.color } : undefined}>{card.value}</div>
          <div className="ta-kpi-hint">{card.hint}</div>
        </div>
      ))}
    </div>
  );
}

function TaBoostMap({ items, t, onOpenItem }) {
  const [hover, setHover] = taUseState(null);
  const points = items.filter((item) => item.control != null);
  if (!points.length) return <TaEmpty>{t('Нет данных о листингах для этих предметов.', 'No listing data for these items yet.')}</TaEmpty>;

  const W = 640;
  const H = 360;
  const L = 44;
  const R = 18;
  const T = 30;
  const B = 38;
  const maxHolders = Math.max(3, ...points.map((item) => item.holders));
  const maxValue = Math.max(...points.map((item) => item.valueUsd), 1);
  const px = (control) => L + control * (W - L - R);
  const py = (holders) => H - B - (Math.sqrt(holders - 1) / Math.sqrt(maxHolders - 1)) * (H - T - B);
  const pr = (value) => 5 + 20 * Math.sqrt(value / maxValue);
  const yTicks = [...new Set([1, Math.ceil(maxHolders / 4), Math.ceil(maxHolders / 2), maxHolders])];
  const sorted = points.slice().sort((a, b) => b.valueUsd - a.valueUsd);

  return (
    <div className="ta-boostmap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Карта буста', 'Boost map')}>
        <rect x={px(0.5)} y={T} width={px(1) - px(0.5)} height={py(1) - T} className="ta-zone" />
        <text x={px(1) - 8} y={T + 16} textAnchor="end" className="ta-zone-label">{t('ЗОНА КОНТРОЛЯ', 'CONTROL ZONE')}</text>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={`x${tick}`}>
            <line x1={px(tick)} x2={px(tick)} y1={T} y2={H - B} className="ta-grid" />
            <text x={px(tick)} y={H - B + 16} textAnchor="middle" className="ta-axis">{taPct(tick)}</text>
          </g>
        ))}
        {yTicks.map((tick) => (
          <g key={`y${tick}`}>
            <line x1={L} x2={W - R} y1={py(tick)} y2={py(tick)} className="ta-grid" />
            <text x={L - 8} y={py(tick) + 4} textAnchor="end" className="ta-axis">{tick}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="ta-axis-title">
          {t('доля рыночного предложения у отслеживаемых аккаунтов →', 'share of market supply held by tracked accounts →')}
        </text>
        <text x={12} y={(T + H - B) / 2} textAnchor="middle" className="ta-axis-title" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>
          {t('держателей →', 'holders →')}
        </text>
        {sorted.map((item) => (
          <circle
            key={item.marketHashName}
            cx={px(item.control)}
            cy={py(item.holders)}
            r={pr(item.valueUsd)}
            fill={taFlowColor(item.flow7d)}
            className={`ta-dot${hover === item ? ' is-hover' : ''}`}
            onMouseEnter={() => setHover(item)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onOpenItem && onOpenItem(item.marketHashName)}
          />
        ))}
      </svg>
      {hover ? (
        <div
          className="ta-tooltip"
          style={{
            left: `${(px(hover.control) / W) * 100}%`,
            top: `${(py(hover.holders) / H) * 100}%`,
            transform: `translate(${hover.control > 0.6 ? 'calc(-100% - 14px)' : '14px'}, -50%)`,
          }}
        >
          <div className="ta-tooltip-name">{hover.marketHashName}</div>
          <div>{t('держат', 'held')}: {hover.units.toLocaleString()} · {taMoney(hover.valueUsd)}</div>
          <div>{t('на рынке', 'listed')}: {hover.listed != null ? hover.listed.toLocaleString() : '—'} · {t('контроль', 'control')} {taPct(hover.control)}</div>
          <div>{t('держателей', 'holders')}: {hover.holders}</div>
          {hover.flow7d ? <div style={{ color: taFlowColor(hover.flow7d) }}>7d: {hover.flow7d.netUnits > 0 ? '+' : ''}{hover.flow7d.netUnits} · {taSigned(hover.flow7d.netUsd)}</div> : null}
        </div>
      ) : null}
      <div className="ta-legend">
        <span><i style={{ background: 'var(--green)' }} />{t('прирост за 7д', 'gaining 7d')}</span>
        <span><i style={{ background: 'var(--red)' }} />{t('сливают за 7д', 'distributing 7d')}</span>
        <span><i style={{ background: 'var(--cyan)' }} />{t('без движения', 'no moves')}</span>
        <span>{t('размер = стоимость позиции', 'size = position value')}</span>
      </div>
    </div>
  );
}

function TaRadarList({ items, t, onOpenItem }) {
  return (
    <div className="ta-radar-list">
      {items.slice(0, 8).map((item, index) => (
        <button key={item.marketHashName} type="button" className="ta-radar-row" onClick={() => onOpenItem && onOpenItem(item.marketHashName)}>
          <span className="ta-rank">{String(index + 1).padStart(2, '0')}</span>
          <TaIcon src={item.iconUrl} />
          <span className="ta-radar-copy">
            <span className="ta-radar-name" title={item.marketHashName}>{item.marketHashName}</span>
            <span className="ta-control-bar" title={t('доля предложения', 'supply share')}>
              <span style={{ width: taPct(item.control ?? 0) }} />
            </span>
            <span className="ta-radar-meta">
              {t('контроль', 'control')} {taPct(item.control)} · {item.units.toLocaleString()} {t('шт', 'pcs')} · {taMoney(item.valueUsd)}
              {item.flow7d ? <b style={{ color: taFlowColor(item.flow7d) }}> · 7d {item.flow7d.netUnits > 0 ? '+' : ''}{item.flow7d.netUnits}</b> : null}
            </span>
          </span>
          <TaAvatarStack holders={item.topHolders} />
          <TaScoreRing score={item.score} />
        </button>
      ))}
    </div>
  );
}

const TA_CAPITAL_ROWS = 12;

function TaCapitalList({ holdings, totalValue, uniqueItems, t, onOpenItem }) {
  const top = holdings.filter((item) => item.valueUsd > 0).slice(0, TA_CAPITAL_ROWS);
  if (!top.length || !totalValue) return <TaEmpty>{t('Нет оценённых позиций.', 'No priced positions yet.')}</TaEmpty>;

  const maxValue = top[0].valueUsd;
  const restValue = Math.max(0, totalValue - top.reduce((sum, item) => sum + item.valueUsd, 0));
  const restCount = Math.max(0, (uniqueItems || 0) - top.length);

  return (
    <div className="ta-capital">
      <div className="ta-capital-list">
        {top.map((item, index) => {
          const flow = item.flow7d && item.flow7d.netUnits ? item.flow7d : null;
          return (
            <button
              key={item.marketHashName}
              type="button"
              className="ta-capital-row"
              style={{ '--cat': TA_CATEGORY_COLORS[item.category] || TA_CATEGORY_COLORS.other }}
              onClick={() => onOpenItem && onOpenItem(item.marketHashName)}
            >
              <span className="ta-rank">{String(index + 1).padStart(2, '0')}</span>
              <TaIcon src={item.iconUrl} />
              <span className="ta-radar-copy">
                <span className="ta-radar-name" title={item.marketHashName}>{item.marketHashName}</span>
                <span className="ta-capital-bar"><span style={{ width: `${(item.valueUsd / maxValue) * 100}%` }} /></span>
                <span className="ta-radar-meta">
                  {item.units.toLocaleString()} {t('шт', 'pcs')} · {item.holders} {t('держ.', 'holders')}
                  {flow ? <b style={{ color: taFlowColor(flow) }}> · 7d {flow.netUnits > 0 ? '▲ +' : '▼ '}{flow.netUnits}</b> : null}
                </span>
              </span>
              <span className="ta-flow-num">
                {taMoney(item.valueUsd)}
                <small>{t('доля', 'share')} {(item.valueUsd / totalValue * 100).toFixed(1)}%</small>
              </span>
            </button>
          );
        })}
      </div>
      {restValue > 0 ? (
        <div className="ta-capital-rest">
          {t(
            `Ещё ${restCount.toLocaleString()} позиций — ${taMoney(restValue)} · ${taPct(restValue / totalValue)} капитала`,
            `${restCount.toLocaleString()} more positions — ${taMoney(restValue)} · ${taPct(restValue / totalValue)} of capital`,
          )}
        </div>
      ) : null}
    </div>
  );
}

function TaCategoryBar({ categories, totalValue, t }) {
  const labels = {
    skins: t('Скины', 'Skins'),
    knives: t('Ножи и перчатки', 'Knives & gloves'),
    stickers: t('Наклейки', 'Stickers'),
    containers: t('Кейсы и капсулы', 'Cases & capsules'),
    other: t('Прочее', 'Other'),
  };
  if (!totalValue) return null;
  return (
    <div className="ta-catbar">
      <div className="ta-catbar-track">
        {categories.map((row) => (
          <span key={row.key} style={{ width: `${(row.valueUsd / totalValue) * 100}%`, background: TA_CATEGORY_COLORS[row.key] }} />
        ))}
      </div>
      <div className="ta-legend">
        {categories.map((row) => (
          <span key={row.key}><i style={{ background: TA_CATEGORY_COLORS[row.key] }} />{labels[row.key]} · {taPct(row.valueUsd / totalValue)}</span>
        ))}
      </div>
    </div>
  );
}

function TaFlowTimeline({ timeline, lang, t }) {
  const W = 640;
  const H = 190;
  const T = 12;
  const B = 24;
  const mid = T + (H - T - B) / 2;
  const half = (H - T - B) / 2;
  const max = Math.max(1, ...timeline.map((day) => Math.max(day.inUsd + day.storageUsd + day.transferUsd, day.outUsd)));
  const step = W / timeline.length;
  const fmtDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  const labelIdx = [0, Math.floor(timeline.length / 2), timeline.length - 1];

  return (
    <svg className="ta-timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Потоки по дням', 'Daily flows')}>
      <line x1="0" x2={W} y1={mid} y2={mid} className="ta-grid" />
      {timeline.map((day, index) => {
        const inH = (day.inUsd / max) * half;
        const outH = (day.outUsd / max) * half;
        const storageH = (day.storageUsd / max) * half;
        const transferH = (day.transferUsd / max) * half;
        const x = index * step + step * 0.18;
        const bw = step * 0.64;
        const extra = [
          day.storageUsd ? `${t('хранилище', 'storage')} ${taMoney(day.storageUsd)}` : '',
          day.transferUsd ? `${t('перекладки', 'transfers')} ${taMoney(day.transferUsd)}` : '',
        ].filter(Boolean).join(' · ');
        return (
          <g key={day.day}>
            <title>{`${fmtDay(day.day)}: +${taMoney(day.inUsd)} / −${taMoney(day.outUsd)} · ${day.moves}${extra ? `\n${extra}` : ''}`}</title>
            <rect x={index * step} y={T} width={step} height={H - T - B} fill="transparent" />
            {inH > 0 ? <rect x={x} y={mid - inH} width={bw} height={inH} rx="2" fill="var(--green)" opacity="0.85" /> : null}
            {storageH > 0 ? <rect x={x} y={mid - inH - storageH} width={bw} height={storageH} rx="2" fill="var(--cyan)" opacity="0.45" /> : null}
            {transferH > 0 ? <rect x={x} y={mid - inH - storageH - transferH} width={bw} height={transferH} rx="2" fill="var(--amber)" opacity="0.55" /> : null}
            {outH > 0 ? <rect x={x} y={mid} width={bw} height={outH} rx="2" fill="var(--red)" opacity="0.85" /> : null}
          </g>
        );
      })}
      {labelIdx.map((index) => (
        <text key={index} x={index * step + step / 2} y={H - 6} textAnchor={index === 0 ? 'start' : (index === timeline.length - 1 ? 'end' : 'middle')} className="ta-axis">
          {fmtDay(timeline[index].day)}
        </text>
      ))}
    </svg>
  );
}

function TaOrigins({ origins, t }) {
  if (!origins) return null;
  const cards = [
    { key: 'buy', color: 'var(--green)', label: t('Реальные покупки', 'Real buys'), sign: '+' },
    { key: 'sell', color: 'var(--red)', label: t('Продажи и выводы', 'Sales and exits'), sign: '−' },
    { key: 'storage', color: 'var(--cyan)', label: t('Из хранилищ', 'From storage units'), sign: '' },
    { key: 'transfer', color: 'var(--amber)', label: t('Перекладки между своими', 'Transfers between tracked'), sign: '' },
  ];
  const unlabeled = origins.unknown?.moves || 0;
  return (
    <div className="ta-origins">
      {cards.map((card) => (
        <div key={card.key} className="ta-origin" style={{ '--tone': card.color }}>
          <span className="eyebrow">{card.label}</span>
          <b>{card.sign}{taMoney(origins[card.key].usd)}</b>
          <small>{origins[card.key].moves} {t('движ.', 'moves')} · {origins.days}{t('д', 'd')}</small>
        </div>
      ))}
      {unlabeled ? (
        <div className="ta-origins-note">
          {t(
            `${unlabeled} движений на ${taMoney(origins.unknown.usd)} без подтверждённой покупки — старые записи и смешанные. В прирост, поток и сигналы не входят.`,
            `${unlabeled} moves worth ${taMoney(origins.unknown.usd)} are not confirmed buys — old records and mixed changes. Excluded from gains, flow and signals.`,
          )}
        </div>
      ) : null}
    </div>
  );
}

function TaHiddenBuys({ rows, lang, t, onOpenProfile }) {
  if (!rows?.length) return <TaEmpty>{t('За 7 дней скрытых покупок не замечено.', 'No hidden buys spotted in 7 days.')}</TaEmpty>;
  const fmt = (iso) => new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  return (
    <div className="ta-links">
      {rows.map((row) => (
        <button key={row.steamId} type="button" className="ta-link ta-link-btn" onClick={() => onOpenProfile && onOpenProfile(row.profileUrl || row.steamId)}>
          <div className="ta-link-pair">
            <TaAvatarStack holders={[row]} />
            <span>{taShortName(row.personaname, 22)}</span>
            <b className="ta-hidden-count">+{row.added}</b>
          </div>
          <div className="ta-link-items">
            {t(
              `последний рост ${fmt(row.lastAt)} · станут видны ≈ ${fmt(row.revealAt)}${row.hidden != null ? ` · всего скрыто ${row.hidden}` : ''}`,
              `last rise ${fmt(row.lastAt)} · visible ≈ ${fmt(row.revealAt)}${row.hidden != null ? ` · ${row.hidden} hidden total` : ''}`,
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function TaTransfers({ transfers, nodesById, lang, t, onOpenItem }) {
  if (!transfers?.length) return null;
  const fmt = (iso) => new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  const name = (steamId) => taShortName(nodesById.get(steamId)?.personaname || steamId.slice(-6), 14);
  return (
    <div className="ta-flowlist">
      <div className="eyebrow">{t('Последние перекладки между своими', 'Latest transfers between tracked accounts')}</div>
      {transfers.map((row) => (
        <button key={`${row.at}-${row.to}-${row.marketHashName}`} type="button" className="ta-flow-row" onClick={() => onOpenItem && onOpenItem(row.marketHashName)}>
          <TaIcon src={row.iconUrl} />
          <span className="ta-radar-copy">
            <span className="ta-flow-name" title={row.marketHashName}>{row.marketHashName}</span>
            <span className="ta-radar-meta">{name(row.from)} → {name(row.to)} · {fmt(row.at)}</span>
          </span>
          <span className="ta-flow-num" style={{ color: 'var(--amber)' }}>
            {taMoney(row.usd)}
            <small>×{row.qty}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function TaFlowList({ title, items, t, onOpenItem }) {
  return (
    <div className="ta-flowlist">
      <div className="eyebrow">{title}</div>
      {items.length ? items.map((item) => (
        <button key={item.marketHashName} type="button" className="ta-flow-row" onClick={() => onOpenItem && onOpenItem(item.marketHashName)}>
          <TaIcon src={item.iconUrl} />
          <span className="ta-flow-name" title={item.marketHashName}>{item.marketHashName}</span>
          <span className="ta-flow-num" style={{ color: taFlowColor(item.flow7d) }}>
            {taSigned(item.flow7d.netUsd)}
            <small>{item.flow7d.netUnits > 0 ? '+' : ''}{item.flow7d.netUnits} · {item.flow7d.netUnits > 0 ? item.flow7d.buyers : item.flow7d.sellers} {t('акк.', 'acc.')}</small>
          </span>
        </button>
      )) : <TaEmpty>{t('Пока тихо.', 'Quiet so far.')}</TaEmpty>}
    </div>
  );
}

function TaNetwork({ network, t, onOpenProfile }) {
  const [focus, setFocus] = taUseState(null);
  const { nodes, links } = network;
  if (!nodes.length) {
    return <TaEmpty>{t('Связей пока не найдено: нужно больше снимков и движений.', 'No links found yet: more snapshots and moves are needed.')}</TaEmpty>;
  }

  const S = 520;
  const C = S / 2;
  const R = S / 2 - 70;
  const maxValue = Math.max(1, ...nodes.map((node) => node.valueUsd));
  const ordered = nodes.slice().sort((a, b) => a.group - b.group || b.valueUsd - a.valueUsd);
  const pos = new Map(ordered.map((node, index) => {
    const angle = (index / ordered.length) * Math.PI * 2 - Math.PI / 2;
    return [node.steamId, { x: C + R * Math.cos(angle), y: C + R * Math.sin(angle), angle, node }];
  }));
  const nodeR = (node) => 11 + 13 * Math.sqrt(node.valueUsd / maxValue);
  const isActive = (link) => !focus || link.a === focus || link.b === focus;

  return (
    <div className="ta-network">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={t('Связанные аккаунты', 'Linked accounts')}>
        <defs>
          {ordered.map((node) => (
            <clipPath key={node.steamId} id={`ta-clip-${node.steamId}`}>
              <circle cx={pos.get(node.steamId).x} cy={pos.get(node.steamId).y} r={nodeR(node) - 2} />
            </clipPath>
          ))}
        </defs>
        {links.map((link) => {
          const a = pos.get(link.a);
          const b = pos.get(link.b);
          if (!a || !b) return null;
          return (
            <path
              key={`${link.a}-${link.b}`}
              d={`M${a.x},${a.y} Q${C},${C} ${b.x},${b.y}`}
              fill="none"
              stroke={link.transfers ? 'var(--amber)' : TA_GROUP_COLORS[a.node.group % TA_GROUP_COLORS.length]}
              strokeWidth={1 + Math.min(link.strength, 1.5) * 3}
              strokeDasharray={link.transfers ? '6 4' : undefined}
              opacity={isActive(link) ? 0.25 + Math.min(link.strength, 1) * 0.6 : 0.06}
            >
              <title>{`${taPct(link.overlap)} · ${link.coMoves}${link.transfers ? ` · ${t('перекладок', 'transfers')} ${link.transfers}` : ''}`}</title>
            </path>
          );
        })}
        {ordered.map((node) => {
          const p = pos.get(node.steamId);
          const r = nodeR(node);
          const color = TA_GROUP_COLORS[node.group % TA_GROUP_COLORS.length];
          const labelX = C + (R + r + 10) * Math.cos(p.angle);
          const labelY = C + (R + r + 10) * Math.sin(p.angle);
          const dim = focus && focus !== node.steamId && !links.some((link) => isActive(link) && (link.a === node.steamId || link.b === node.steamId));
          return (
            <g
              key={node.steamId}
              className="ta-node"
              opacity={dim ? 0.3 : 1}
              onMouseEnter={() => setFocus(node.steamId)}
              onMouseLeave={() => setFocus(null)}
              onClick={() => onOpenProfile && onOpenProfile(node.steamId)}
            >
              <circle cx={p.x} cy={p.y} r={r} fill="var(--bg-2)" stroke={color} strokeWidth="2" />
              {node.avatar ? (
                <image href={node.avatar} x={p.x - r + 2} y={p.y - r + 2} width={(r - 2) * 2} height={(r - 2) * 2} clipPath={`url(#ta-clip-${node.steamId})`} />
              ) : null}
              <text x={labelX} y={labelY + 4} textAnchor={Math.cos(p.angle) > 0.2 ? 'start' : (Math.cos(p.angle) < -0.2 ? 'end' : 'middle')} className="ta-node-label">
                {taShortName(node.personaname || node.steamId.slice(-6), 14)}
              </text>
              <title>{`${node.personaname || node.steamId} · ${taMoney(node.valueUsd)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TaLinkList({ network, t }) {
  const byId = new Map(network.nodes.map((node) => [node.steamId, node]));
  return (
    <div className="ta-links">
      {network.links.slice(0, 8).map((link) => {
        const a = byId.get(link.a);
        const b = byId.get(link.b);
        return (
          <div key={`${link.a}-${link.b}`} className="ta-link">
            <div className="ta-link-pair">
              <TaAvatarStack holders={[a, b].filter(Boolean)} />
              <span>{taShortName(a?.personaname, 16)} ↔ {taShortName(b?.personaname, 16)}</span>
            </div>
            {link.transfers ? (
              <div className="ta-link-meta" style={{ color: 'var(--amber)' }}>
                {t(`🔁 ${link.transfers} перекладок напрямую · ${taMoney(link.transferUsd)} — вероятно один владелец`, `🔁 ${link.transfers} direct transfers · ${taMoney(link.transferUsd)} — likely one owner`)}
              </div>
            ) : null}
            <div className="ta-link-meta">
              {t('пересечение', 'overlap')} {taPct(link.overlap)}
              {link.coMoves ? ` · ${link.coMoves} ${t('совместных покупок за 48ч', 'joint buys within 48h')}` : ''}
            </div>
            {link.sharedItems.length ? <div className="ta-link-items">{link.sharedItems.map((name) => taShortName(name, 28)).join(' · ')}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function TaLeaderboard({ rows, lang, t, onOpenProfile, onOpenItem }) {
  const daysAgo = (iso) => {
    if (!iso) return '—';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return t('сегодня', 'today');
    return lang === 'ru' ? `${days} дн. назад` : `${days}d ago`;
  };
  return (
    <div className="ta-board">
      <div className="ta-board-row is-head">
        <span>#</span>
        <span>{t('Аккаунт', 'Account')}</span>
        <span>{t('Капитал', 'Capital')}</span>
        <span>{t('Концентрация', 'Concentration')}</span>
        <span>{t('Поток 30д', 'Flow 30d')}</span>
        <span>{t('Последнее движение', 'Last move')}</span>
        <span>{t('Топ позиции', 'Top positions')}</span>
      </div>
      {rows.map((row, index) => (
        <div
          key={row.steamId}
          className="ta-board-row is-link"
          role="link"
          tabIndex={0}
          onClick={() => onOpenProfile && onOpenProfile(row.profileUrl || row.steamId)}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && onOpenProfile) {
              event.preventDefault();
              onOpenProfile(row.profileUrl || row.steamId);
            }
          }}
        >
          <span className="ta-rank">{String(index + 1).padStart(2, '0')}</span>
          <span className="ta-board-account">
            {row.avatar ? <img src={row.avatar} alt="" /> : <i />}
            <span>
              <b>{row.personaname}</b>
              <small>
                {row.itemCount} {t('поз.', 'pos.')} · {row.units.toLocaleString()} {t('шт', 'pcs')}
                {row.hiddenAdded7d ? <span style={{ color: 'var(--amber)' }}> · 🕵 +{row.hiddenAdded7d} {t('скрыто', 'hidden')}</span> : null}
              </small>
            </span>
          </span>
          <span className="ta-board-num">{taMoney(row.valueUsd)}</span>
          <span className="ta-board-conc" title={t('доля топ-3 позиций в капитале', 'top-3 positions share of capital')}>
            <span className="ta-control-bar"><span style={{ width: taPct(row.top3Share ?? 0) }} /></span>
            <small>{taPct(row.top3Share)}</small>
          </span>
          <span className="ta-board-num" style={{ color: row.flow30Usd > 0 ? 'var(--green)' : (row.flow30Usd < 0 ? 'var(--red)' : 'var(--fg-2)') }}>
            {row.moves30 ? taSigned(row.flow30Usd) : '—'}
            {row.storage30 || row.transfers30 ? (
              <small className="ta-board-muted" style={{ display: 'block' }}>
                {[row.storage30 ? `📦 ${row.storage30}` : '', row.transfers30 ? `🔁 ${row.transfers30}` : ''].filter(Boolean).join(' · ')}
              </small>
            ) : null}
          </span>
          <span className="ta-board-muted">{daysAgo(row.lastMoveAt)}</span>
          <span className="ta-board-items">
            {row.topItems.map((item) => (
              <button
                key={item.marketHashName}
                type="button"
                title={`${item.marketHashName} · ${taMoney(item.valueUsd)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (onOpenItem) onOpenItem(item.marketHashName);
                }}
              >
                <TaIcon src={item.iconUrl} className="ta-icon-sm" />
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

const TA_ITEM_WINDOWS = [7, 30, 60, 90];

function taPctSigned(value) {
  if (!Number.isFinite(value)) return '—';
  const points = value * 100;
  const text = `${Math.abs(points).toFixed(1)}%`;
  return points > 0 ? `+${text}` : (points < 0 ? `−${text}` : text);
}

function TaItemSearch({ lang, t, onOpenItem, onOpenProfile }) {
  const [query, setQuery] = taUseState('');
  const [picked, setPicked] = taUseState('');
  const [days, setDays] = taUseState(30);
  const [hits, setHits] = taUseState([]);
  const report = useSmartMoneyItem(picked, days);
  const history = useItemHistory(picked, days, null);
  const data = report.data && report.data.marketHashName === picked ? report.data : null;
  const chart = history.data && history.data.marketHashName === picked && history.data.provider !== 'synthetic' && history.data.provider !== 'none'
    ? (history.data.data || []).filter((point) => Number.isFinite(point.price))
    : [];
  const changePct = chart.length >= 2 && chart[0].price ? (chart[chart.length - 1].price - chart[0].price) / chart[0].price : null;
  const showHits = query.trim().length >= 2 && query.trim().toLowerCase() !== picked.toLowerCase();

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch(`/api/top-investors/items?q=${encodeURIComponent(q)}`)
        .then((payload) => { if (!cancelled) setHits(payload.items || []); })
        .catch(() => { if (!cancelled) setHits([]); });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const pick = (name) => {
    setPicked(name);
    setQuery(name);
    setHits([]);
  };

  const span = data?.window;
  const priceUsd = Number.isFinite(span?.price?.usd) ? span.price.usd : data?.priceUsd;
  const fromLabel = span?.from ? new Date(span.from).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US') : null;

  return (
    <TaSection
      eyebrow="// ITEM"
      title={t('Отчёт по предмету', 'Item report')}
      sub={t(
        'Поиск по предметам, которые держат или двигали отслеживаемые аккаунты. Цена — рыночный график. Покупка — скрытый предмет появился. Выход — количество ушло из инвентаря. Кэшфлоу — эти две суммы по цене на момент движения. Хранилище и перекладки в кэшфлоу не входят.',
        'Search items held or moved by tracked accounts. Price is the market chart. A buy is a hidden item that appeared. An exit is quantity that left an inventory. Cash flow is those two amounts at the price when the inventory changed. Storage and transfers are not in the cash flow.',
      )}
    >
      <div className="ta-search">
        <input
          type="search"
          value={query}
          placeholder={t('Название предмета', 'Item name')}
          aria-label={t('Найти предмет', 'Find an item')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && hits[0]) pick(hits[0].marketHashName);
            if (event.key === 'Escape') setHits([]);
          }}
        />
        {showHits && hits.length ? (
          <div className="ta-search-list" role="listbox">
            {hits.map((hit) => (
              <button key={hit.marketHashName} type="button" className="ta-search-hit" onClick={() => pick(hit.marketHashName)}>
                <TaIcon src={hit.iconUrl} />
                <span className="ta-radar-name">{hit.marketHashName}</span>
                <small>{hit.units ? `${hit.units.toLocaleString()} ${t('шт', 'pcs')} · ` : ''}{taMoney(hit.priceUsd)}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {picked && report.loading && !data ? <TaEmpty>{t('Собираю отчёт…', 'Building the report…')}</TaEmpty> : null}
      {data && !data.tracked ? <TaEmpty>{t('Этого предмета нет в собранных инвентарях.', 'This item is not in the collected inventories.')}</TaEmpty> : null}
      {data?.tracked && span ? (
        <div className="ta-report">
          <div className="ta-report-head">
            <TaIcon src={data.iconUrl} />
            <div>
              <div className="ta-radar-name">{data.marketHashName}</div>
              <div className="ta-radar-meta">
                {taMoney(priceUsd)}
                {Number.isFinite(changePct) ? (
                  <b style={{ color: changePct > 0 ? 'var(--green)' : (changePct < 0 ? 'var(--red)' : undefined) }}> {taPctSigned(changePct)} / {days}{t('д', 'd')}</b>
                ) : null}
                {' · '}{data.units.toLocaleString()} {t('шт сейчас', 'pcs now')} · {data.holders} {t('акк.', 'acc.')}
              </div>
            </div>
            <div className="ta-windows">
              {TA_ITEM_WINDOWS.map((value) => (
                <button key={value} type="button" className="btn btn-sm btn-ghost" aria-pressed={days === value} onClick={() => setDays(value)}>{value}{t('д', 'd')}</button>
              ))}
            </div>
          </div>
          {span.partial && fromLabel ? (
            <div className="ta-section-sub">
              {t(
                `Движения этого предмета записаны с ${fromLabel}. Окно ${days} дн. шире собранной истории, кэшфлоу покрывает только её.`,
                `Moves for this item are recorded from ${fromLabel}. The ${days}d window is wider than the collected history, so cash flow only covers that history.`,
              )}
            </div>
          ) : null}
          <div className="sm-stats">
            <div><span className="eyebrow">{t('Покупки', 'Buys')}</span><b style={{ color: 'var(--green)' }}>{span.buy.units.toLocaleString()}</b><span className="ta-radar-meta">{taMoney(span.buy.usd)} · {span.buy.accounts} {t('акк.', 'acc.')}</span></div>
            <div><span className="eyebrow">{t('Выходы', 'Exits')}</span><b style={{ color: 'var(--red)' }}>{span.sell.units.toLocaleString()}</b><span className="ta-radar-meta">{taMoney(span.sell.usd)} · {span.sell.accounts} {t('акк.', 'acc.')}</span></div>
            <div><span className="eyebrow">{t('Кэшфлоу', 'Cash flow')}</span><b style={{ color: span.netUsd > 0 ? 'var(--green)' : (span.netUsd < 0 ? 'var(--red)' : undefined) }}>{taSigned(span.netUsd)}</b><span className="ta-radar-meta">{span.netUnits > 0 ? '+' : ''}{span.netUnits} {t('шт', 'pcs')}</span></div>
            <div><span className="eyebrow">{t('Сейчас держат', 'Held now')}</span><b>{taMoney(data.valueUsd)}</b><span className="ta-radar-meta">{taPct(data.control)} {t('предложения', 'of supply')}</span></div>
          </div>
          <div className="ta-section-sub">
            {t(
              `Хранилище ${span.storage.units} шт · перекладки ${span.transfer.units} шт · без метки источника ${span.other.units} шт.`,
              `Storage ${span.storage.units} pcs · transfers ${span.transfer.units} pcs · untagged ${span.other.units} pcs.`,
            )}
          </div>
          <div className="sm-item-grid">
            <div className="ta-links">
              <div className="eyebrow">{t('Аккаунты', 'Accounts')}</div>
              {span.accounts.length ? span.accounts.map((row) => (
                <button key={row.steamId} type="button" className="ta-flow-row sm-holder" onClick={() => onOpenProfile && onOpenProfile(`https://steamcommunity.com/profiles/${row.steamId}`)}>
                  {row.avatar ? <img src={row.avatar} alt="" /> : <i />}
                  <span className="ta-radar-copy">
                    <span className="ta-radar-name">{row.personaname || row.steamId}</span>
                    <span className="ta-radar-meta">+{row.buyUnits} / −{row.sellUnits}</span>
                  </span>
                  <span className="ta-flow-num" style={{ color: row.netUsd > 0 ? 'var(--green)' : (row.netUsd < 0 ? 'var(--red)' : undefined) }}>{taSigned(row.netUsd)}</span>
                </button>
              )) : <TaEmpty>{t('Покупок и выходов в этом окне нет.', 'No buys or exits in this window.')}</TaEmpty>}
            </div>
            <div className="sm-item-side">
              <div className="eyebrow">{t('Движения', 'Moves')}</div>
              {span.moves.length ? span.moves.map((move) => {
                const tone = move.kind === 'transfer' ? 'var(--amber)' : move.kind === 'storage' ? 'var(--cyan)' : (move.kind === 'buy' ? 'var(--green)' : (move.kind === 'sell' ? 'var(--red)' : 'var(--fg-3)'));
                const label = move.kind === 'buy' ? t('покупка', 'buy')
                  : move.kind === 'sell' ? t('выход', 'exit')
                    : move.kind === 'storage' ? t('хранилище', 'storage')
                      : move.kind === 'transfer' ? t('перекладка', 'transfer')
                        : t('без метки', 'untagged');
                return (
                  <div key={move.id} className="sm-move">
                    <span style={{ color: tone }}>{move.qtyDelta > 0 ? '+' : ''}{move.qtyDelta}</span>
                    <span className="sm-move-name">{move.personaname || move.steamId} · {label}</span>
                    <span className="ta-board-muted">{new Date(move.at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}</span>
                  </div>
                );
              }) : <TaEmpty>{t('Движений в этом окне нет.', 'No moves in this window.')}</TaEmpty>}
            </div>
          </div>
          {onOpenItem ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenItem(data.marketHashName)}>{t('Карточка предмета', 'Item page')}</button> : null}
        </div>
      ) : null}
    </TaSection>
  );
}

function TopInvestorsAnalytics({ lang, onOpenItem, onOpenProfile }) {
  const analytics = useTopInvestorsAnalytics();
  const t = (ru, en) => (lang === 'ru' ? ru : en);
  const data = analytics.data;

  if (analytics.loading && !data && !analytics.locked) {
    return <div className="ta-empty">{t('Считаю аналитику по инвентарям…', 'Crunching inventory analytics…')}</div>;
  }
  if (analytics.locked || analytics.error?.code === 'plan_required') {
    return window.SmartMoneyPaywall ? <window.SmartMoneyPaywall lang={lang} /> : null;
  }
  if (analytics.error && !data) {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--red)' }}>{analytics.error.message || 'Failed to load'}</div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => analytics.reload()}>{t('Повторить', 'Retry')}</button>
      </div>
    );
  }
  if (!data) return null;
  if (!data.totals.withSnapshot) {
    return <TaEmpty>{t('Снимков инвентарей пока нет — аналитика появится после первого прохода сервера.', 'No inventory snapshots yet — analytics will appear after the first server pass.')}</TaEmpty>;
  }

  return (
    <div className="ta">
      {window.SmartMoneyTelegram ? <window.SmartMoneyTelegram lang={lang} /> : null}
      <TaKpis totals={data.totals} t={t} />

      <TaItemSearch lang={lang} t={t} onOpenItem={onOpenItem} onOpenProfile={onOpenProfile} />

      <SmartMoneySignals lang={lang} t={t} onOpenItem={onOpenItem} />

      <TaSection
        eyebrow="// BOOST RADAR"
        title={t('Где отслеживаемые аккаунты держат рынок', 'Where tracked accounts hold the market')}
        sub={t(
          'Скор = 45% доля рыночного предложения у отслеживаемых аккаунтов + 25% сколько аккаунтов держат предмет + 30% сколько из них купили его на рынке за 7 дней. Покупка — предмет был скрыт Steam и потом появился. Вывод из хранилища и перекладка в скор не входят.',
          'Score = 45% share of market supply held by tracked accounts + 25% how many accounts hold it + 30% how many of them bought it on the market in 7 days. A buy is an item Steam hid and then revealed. Storage withdrawals and transfers are not scored.',
        )}
      >
        <div className="ta-radar">
          <TaBoostMap items={data.radar} t={t} onOpenItem={onOpenItem} />
          <TaRadarList items={data.radar} t={t} onOpenItem={onOpenItem} />
        </div>
      </TaSection>

      <TaSection
        eyebrow="// CAPITAL MAP"
        title={t('Во что вложен капитал', 'Where the capital sits')}
        sub={t('Крупнейшие позиции по суммарной стоимости у всех аккаунтов. Доля — процент от всего капитала, ▲▼ — чистый поток штук за 7 дней.', 'Largest positions by combined value across all accounts. Share = percent of total capital, ▲▼ = net 7-day unit flow.')}
      >
        <TaCategoryBar categories={data.categories} totalValue={data.totals.valueUsd} t={t} />
        <TaCapitalList holdings={data.holdings} totalValue={data.totals.valueUsd} uniqueItems={data.totals.uniqueItems} t={t} onOpenItem={onOpenItem} />
      </TaSection>

      <TaSection
        eyebrow="// FLOWS"
        title={t('Smart money: прирост и слив', 'Smart money: gains and dumps')}
        sub={t(
          'Зелёным — плюс в инвентаре только по подтверждённой покупке: предмет был скрыт около 10 дней и потом появился. Красным — продажи. Голубым — хранилище, жёлтым — перекладки между своими. Эти три в прирост, радар и сигналы не входят. Записи без метки источника тоже не считаются.',
          'Green is an inventory plus only for a confirmed buy: the item was hidden for about 10 days and then appeared. Red is sales. Cyan is storage, yellow is transfers between tracked accounts. Those three are excluded from gains, the radar and signals. Untagged records are not counted either.',
        )}
      >
        <TaFlowTimeline timeline={data.timeline} lang={lang} t={t} />
        <TaOrigins origins={data.origins} t={t} />
        <div className="ta-flows">
          <TaFlowList title={t('Прирост', 'Gaining')} items={data.accumulating} t={t} onOpenItem={onOpenItem} />
          <TaFlowList title={t('Сливают', 'Distributing')} items={data.distributing} t={t} onOpenItem={onOpenItem} />
        </div>
      </TaSection>

      <SmartMoneyIndex t={t} />

      <SmartMoneyBacktest lang={lang} t={t} onOpenItem={onOpenItem} />

      <TaSection
        eyebrow="// SYNDICATES"
        title={t('Связанные аккаунты', 'Linked accounts')}
        sub={t(
          'Связь = похожий набор нетривиальных позиций, покупки одного предмета в пределах 48 часов и прямые перекладки: предмет ушёл с одного аккаунта и то же количество пришло на другой в течение 14 дней. Жёлтый пунктир — перекладки, самый сильный признак одного владельца. Кластеры одного цвета, вероятно, действуют вместе.',
          'Link = similar set of non-trivial positions, buying the same item within 48 hours, and direct transfers: an item left one account and the same quantity arrived on another within 14 days. Yellow dashes are transfers, the strongest sign of a single owner. Same-colour clusters likely act together.',
        )}
      >
        <div className="ta-syndicates">
          <TaNetwork network={data.network} t={t} onOpenProfile={onOpenProfile} />
          {data.network.links.length ? <TaLinkList network={data.network} t={t} /> : null}
        </div>
        <TaTransfers
          transfers={data.transfers}
          nodesById={new Map(data.leaderboard.concat(data.network.nodes).map((row) => [row.steamId, row]))}
          lang={lang}
          t={t}
          onOpenItem={onOpenItem}
        />
      </TaSection>

      <TaSection
        eyebrow="// STEALTH BUYS"
        title={t('Свежие скрытые покупки', 'Fresh hidden buys')}
        sub={t(
          'Steam прячет купленное на рынке ~10 дней. Рост числа скрытых предметов за 7 дней значит, что аккаунт только что закупился, и это ещё не видно в инвентаре. Ранний индикатор.',
          'Steam hides market buys for ~10 days. A rise in hidden items over 7 days means the account just bought something that is not visible in the inventory yet. A leading indicator.',
        )}
      >
        <TaHiddenBuys rows={data.hiddenBuys} lang={lang} t={t} onOpenProfile={onOpenProfile} />
      </TaSection>

      <TaSection eyebrow="// WHALES" title={t('Киты', 'Whales')} sub={t('Крупнейшие инвентари под наблюдением.', 'Largest inventories under watch.')}>
        <TaLeaderboard rows={data.leaderboard} lang={lang} t={t} onOpenProfile={onOpenProfile} onOpenItem={onOpenItem} />
      </TaSection>

      <div className="ta-footnote">
        {t(
          'Цены — медиана минимальных офферов Skinport, Market.CSGO и LIS-SKINS. «На рынке» — число листингов на Skinport и LIS-SKINS. Обновление раз в 5 минут.',
          'Prices are the median lowest ask across Skinport, Market.CSGO and LIS-SKINS. "Listed" counts Skinport and LIS-SKINS listings. Refreshed every 5 minutes.',
        )}
        {' '}{new Date(data.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}

Object.assign(window, { TopInvestorsAnalytics, TaSection, TaEmpty, TaIcon, TaAvatarStack, TaScoreRing, taMoney, taSigned, taPct });
