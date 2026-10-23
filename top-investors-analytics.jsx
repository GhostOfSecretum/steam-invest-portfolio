/* global React, useTopInvestorsAnalytics, formatMoney, SmartMoneySignals, SmartMoneyIndex, SmartMoneyBacktest */
const { useState: taUseState, useMemo: taUseMemo } = React;

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

function taSquarify(items, width, height) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return [];
  const scale = (width * height) / total;
  const queue = items.map((item) => ({ item, area: item.value * scale }));
  const rects = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row = [];

  const worst = (entries, side) => {
    const sum = entries.reduce((acc, entry) => acc + entry.area, 0);
    let max = 0;
    let min = Infinity;
    for (const entry of entries) {
      max = Math.max(max, entry.area);
      min = Math.min(min, entry.area);
    }
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };

  const flush = () => {
    const sum = row.reduce((acc, entry) => acc + entry.area, 0);
    if (!sum) return;
    if (w >= h) {
      const colW = sum / h;
      let cy = y;
      for (const entry of row) {
        const eh = entry.area / colW;
        rects.push({ item: entry.item, x, y: cy, w: colW, h: eh });
        cy += eh;
      }
      x += colW;
      w -= colW;
    } else {
      const rowH = sum / w;
      let cx = x;
      for (const entry of row) {
        const ew = entry.area / rowH;
        rects.push({ item: entry.item, x: cx, y, w: ew, h: rowH });
        cx += ew;
      }
      y += rowH;
      h -= rowH;
    }
    row = [];
  };

  while (queue.length) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, queue[0]], side) <= worst(row, side)) row.push(queue.shift());
    else flush();
  }
  flush();
  return rects;
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
      hint: t(`${totals.moves7d} движений`, `${totals.moves7d} moves`),
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
        <span><i style={{ background: 'var(--green)' }} />{t('скупают за 7д', 'accumulating 7d')}</span>
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

function TaTreemap({ holdings, totalValue, t, onOpenItem }) {
  const tiles = taUseMemo(() => {
    const top = holdings.slice(0, 30).filter((item) => item.valueUsd > 0);
    const rest = totalValue - top.reduce((sum, item) => sum + item.valueUsd, 0);
    const list = top.map((item) => ({ value: item.valueUsd, item }));
    if (rest > totalValue * 0.01) list.push({ value: rest, item: null });
    return taSquarify(list, 100, 100);
  }, [holdings, totalValue]);

  if (!tiles.length) return <TaEmpty>{t('Нет оценённых позиций.', 'No priced positions yet.')}</TaEmpty>;

  return (
    <div className="ta-treemap">
      {tiles.map(({ item: tile, x, y, w, h }) => {
        const item = tile.item;
        const color = item ? TA_CATEGORY_COLORS[item.category] : 'var(--fg-4)';
        const big = w >= 12 && h >= 18;
        const mid = w >= 6 && h >= 9;
        return (
          <div
            key={item ? item.marketHashName : 'rest'}
            className={`ta-tile${item ? ' is-link' : ''}`}
            style={{
              left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
              '--tile': color,
            }}
            title={item ? `${item.marketHashName}\n${taMoney(item.valueUsd)} · ${item.units} · ${item.holders}` : t('Остальное', 'Other')}
            onClick={item && onOpenItem ? () => onOpenItem(item.marketHashName) : undefined}
          >
            {big && item?.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" /> : null}
            {mid ? (
              <div className="ta-tile-copy">
                {big ? <div className="ta-tile-name">{item ? item.marketHashName : t('Остальное', 'Other')}</div> : null}
                <div className="ta-tile-value">
                  {taMoney(tile.value)}
                  {item?.flow7d ? <span style={{ color: taFlowColor(item.flow7d) }}>{item.flow7d.netUnits > 0 ? ' ▲' : ' ▼'}</span> : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
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
  const max = Math.max(1, ...timeline.map((day) => Math.max(day.inUsd, day.outUsd)));
  const step = W / timeline.length;
  const fmtDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  const labelIdx = [0, Math.floor(timeline.length / 2), timeline.length - 1];

  return (
    <svg className="ta-timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Потоки по дням', 'Daily flows')}>
      <line x1="0" x2={W} y1={mid} y2={mid} className="ta-grid" />
      {timeline.map((day, index) => {
        const inH = (day.inUsd / max) * half;
        const outH = (day.outUsd / max) * half;
        const x = index * step + step * 0.18;
        const bw = step * 0.64;
        return (
          <g key={day.day}>
            <title>{`${fmtDay(day.day)}: +${taMoney(day.inUsd)} / −${taMoney(day.outUsd)} · ${day.moves}`}</title>
            <rect x={index * step} y={T} width={step} height={H - T - B} fill="transparent" />
            {inH > 0 ? <rect x={x} y={mid - inH} width={bw} height={inH} rx="2" fill="var(--green)" opacity="0.85" /> : null}
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
              stroke={TA_GROUP_COLORS[a.node.group % TA_GROUP_COLORS.length]}
              strokeWidth={1 + link.strength * 3}
              opacity={isActive(link) ? 0.25 + Math.min(link.strength, 1) * 0.6 : 0.06}
            >
              <title>{`${taPct(link.overlap)} · ${link.coMoves}`}</title>
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
              <small>{row.itemCount} {t('поз.', 'pos.')} · {row.units.toLocaleString()} {t('шт', 'pcs')}</small>
            </span>
          </span>
          <span className="ta-board-num">{taMoney(row.valueUsd)}</span>
          <span className="ta-board-conc" title={t('доля топ-3 позиций в капитале', 'top-3 positions share of capital')}>
            <span className="ta-control-bar"><span style={{ width: taPct(row.top3Share ?? 0) }} /></span>
            <small>{taPct(row.top3Share)}</small>
          </span>
          <span className="ta-board-num" style={{ color: row.flow30Usd > 0 ? 'var(--green)' : (row.flow30Usd < 0 ? 'var(--red)' : 'var(--fg-2)') }}>
            {row.moves30 ? taSigned(row.flow30Usd) : '—'}
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

function TopInvestorsAnalytics({ lang, onOpenItem, onOpenProfile }) {
  const analytics = useTopInvestorsAnalytics();
  const t = (ru, en) => (lang === 'ru' ? ru : en);
  const data = analytics.data;

  if (analytics.loading && !data) {
    return <div className="ta-empty">{t('Считаю аналитику по инвентарям…', 'Crunching inventory analytics…')}</div>;
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
      <TaKpis totals={data.totals} t={t} />

      <SmartMoneySignals lang={lang} t={t} onOpenItem={onOpenItem} />

      <TaSection
        eyebrow="// BOOST RADAR"
        title={t('Где отслеживаемые аккаунты держат рынок', 'Where tracked accounts hold the market')}
        sub={t(
          'Скор = 45% доля рыночного предложения у отслеживаемых аккаунтов + 25% сколько аккаунтов держат предмет + 30% сколько из них докупали за 7 дней. Высокий скор — кандидат на буст.',
          'Score = 45% share of market supply held by tracked accounts + 25% how many accounts hold it + 30% how many of them bought more in 7 days. High score = boost candidate.',
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
        sub={t('Площадь плитки — стоимость суммарной позиции всех аккаунтов. ▲▼ — направление потока за 7 дней.', 'Tile area = combined position value across all accounts. ▲▼ = 7-day flow direction.')}
      >
        <TaCategoryBar categories={data.categories} totalValue={data.totals.valueUsd} t={t} />
        <TaTreemap holdings={data.holdings} totalValue={data.totals.valueUsd} t={t} onOpenItem={onOpenItem} />
      </TaSection>

      <TaSection
        eyebrow="// FLOWS"
        title={t('Smart money: что скупают и что сливают', 'Smart money: what they buy and dump')}
        sub={t('Ежедневная сумма входов и выходов по всем аккаунтам за 30 дней, и лидеры потока за 7 дней.', 'Daily inflow and outflow across all accounts over 30 days, plus 7-day flow leaders.')}
      >
        <TaFlowTimeline timeline={data.timeline} lang={lang} t={t} />
        <div className="ta-flows">
          <TaFlowList title={t('Скупают', 'Accumulating')} items={data.accumulating} t={t} onOpenItem={onOpenItem} />
          <TaFlowList title={t('Сливают', 'Distributing')} items={data.distributing} t={t} onOpenItem={onOpenItem} />
        </div>
      </TaSection>

      <SmartMoneyIndex t={t} />

      <SmartMoneyBacktest lang={lang} t={t} onOpenItem={onOpenItem} />

      <TaSection
        eyebrow="// SYNDICATES"
        title={t('Связанные аккаунты', 'Linked accounts')}
        sub={t(
          'Связь = похожий набор нетривиальных позиций и покупки одного предмета в пределах 48 часов. Кластеры одного цвета, вероятно, действуют вместе.',
          'Link = similar set of non-trivial positions plus buying the same item within 48 hours. Same-colour clusters likely act together.',
        )}
      >
        <div className="ta-syndicates">
          <TaNetwork network={data.network} t={t} onOpenProfile={onOpenProfile} />
          {data.network.links.length ? <TaLinkList network={data.network} t={t} /> : null}
        </div>
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
