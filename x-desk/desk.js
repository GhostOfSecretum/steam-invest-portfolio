const TZ = 'Europe/Moscow';

const $ = (id) => document.getElementById(id);

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU');
}

function mskNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function pad(n) { return String(n).padStart(2, '0'); }

function countdownTo(windowHm) {
  const [h, m] = windowHm.split(':').map(Number);
  const now = mskNow();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const ms = target - now;
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  return `${pad(hh)}:${pad(mm)} до окна`;
}

function contentDays(data) {
  return data.days.filter((d) => d.kind === 'content');
}

function lastContent(data) {
  const rows = contentDays(data);
  return rows[rows.length - 1] || null;
}

function planned(data) {
  return data.days.find((d) => d.kind === 'planned') || null;
}

function barChart(el, rows, { min, max, color = 'var(--cyan)' }) {
  const w = el.clientWidth || 520;
  const h = el.clientHeight || 180;
  const padL = 28, padR = 8, padT = 12, padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const values = rows.map((r) => r.value);
  const top = Math.max(max + 4, ...values, 8);
  const bw = innerW / Math.max(rows.length, 1);
  const y = (v) => padT + innerH - (v / top) * innerH;
  const bandTop = y(max);
  const bandH = y(min) - bandTop;
  const bars = rows.map((r, i) => {
    const bh = (r.value / top) * innerH;
    const x = padL + i * bw + bw * 0.18;
    const over = r.value > max;
    const under = r.value < min && r.value > 0;
    const fill = over ? 'var(--amber)' : under ? 'var(--magenta)' : color;
    return `<rect x="${x}" y="${y(r.value)}" width="${bw * 0.64}" height="${Math.max(bh, 0)}" rx="3" fill="${fill}" opacity="0.92"/>
      <text x="${x + bw * 0.32}" y="${h - 8}" text-anchor="middle" fill="#5a5f70" font-size="10" font-family="JetBrains Mono">${r.label}</text>
      <text x="${x + bw * 0.32}" y="${y(r.value) - 6}" text-anchor="middle" fill="#cdd1dc" font-size="10" font-family="JetBrains Mono">${r.value}</text>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" >
    <rect x="${padL}" y="${bandTop}" width="${innerW}" height="${Math.max(bandH, 0)}" fill="rgba(62,207,207,.08)"/>
    <line x1="${padL}" x2="${w - padR}" y1="${bandTop}" y2="${bandTop}" stroke="rgba(62,207,207,.35)" stroke-dasharray="3 4"/>
    <line x1="${padL}" x2="${w - padR}" y1="${y(min)}" y2="${y(min)}" stroke="rgba(62,207,207,.2)" stroke-dasharray="3 4"/>
    ${bars}
  </svg>`;
}

function dualChart(el, rows) {
  const w = el.clientWidth || 420;
  const h = el.clientHeight || 180;
  const padL = 8, padR = 8, padT = 16, padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxV = Math.max(8, ...rows.flatMap((r) => [r.post, r.replies]));
  const gap = innerW / Math.max(rows.length, 1);
  const y = (v) => padT + innerH - (v / maxV) * innerH;
  const cols = rows.map((r, i) => {
    const x = padL + i * gap;
    const cw = gap * 0.32;
    const x1 = x + gap * 0.18;
    const x2 = x1 + cw + 4;
    return `<rect x="${x1}" y="${y(r.post)}" width="${cw}" height="${(r.post / maxV) * innerH}" rx="3" fill="var(--magenta)"/>
      <rect x="${x2}" y="${y(r.replies)}" width="${cw}" height="${(r.replies / maxV) * innerH}" rx="3" fill="var(--cyan)" opacity=".85"/>
      <text x="${x + gap * 0.5}" y="${h - 8}" text-anchor="middle" fill="#5a5f70" font-size="10" font-family="JetBrains Mono">${r.label}</text>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" >
    ${cols}
  </svg>
  <div class="hint" style="display:flex;gap:14px;margin-top:-6px">
    <span style="color:var(--magenta)">■ пост</span>
    <span style="color:var(--cyan)">■ реплаи</span>
  </div>`;
}

function renderKpis(data) {
  const last = lastContent(data);
  const live = data.live && data.live.profile;
  const followers = (live && live.followers) ?? (last && last.followers) ?? 0;
  const following = (live && live.following) ?? (last && last.following) ?? 0;
  const statuses = (live && live.statuses) ?? (last && last.statuses) ?? 0;
  const replies = last ? last.replies : 0;
  const postViews = last && last.post ? last.post.views : 0;
  const replyLikes = last ? last.replyLikes : 0;
  const over = replies > data.quota.repliesMax;
  const under = replies && replies < data.quota.repliesMin;
  $('kpis').innerHTML = [
    ['фолловеры', followers, last && last.followers != null && data.days.length > 2 ? `было ${data.days.find((d) => d.date === '2026-08-23')?.followers ?? '—'} в день 1` : ''],
    ['подписки', following, 'потолок ~80'],
    ['посты в счётчике', statuses, 'реплаи + свои'],
    ['реплаи / день', replies || '—', `${data.quota.repliesMin}–${data.quota.repliesMax}`, over ? 'warn' : under ? 'hot' : 'good'],
    ['просмотры поста', postViews ?? '—', last && last.post ? `пост ${last.post.n}` : ''],
    ['лайки на реплаях', replyLikes || 0, last && last.replyBacks ? `${last.replyBacks} ответа` : ''],
  ].map(([label, val, sub, cls]) => `<div class="kpi ${cls || ''}"><div class="label">${label}</div><div class="val">${fmt(val)}</div><div class="sub">${sub || ''}</div></div>`).join('');
}

function renderCharts(data) {
  const rows = contentDays(data).map((d) => ({
    label: d.label.replace('день ', 'd'),
    value: d.replies || 0,
    post: (d.post && d.post.views) || 0,
    replies: d.replyViews || 0,
  }));
  barChart($('chart-replies'), rows, { min: data.quota.repliesMin, max: data.quota.repliesMax });
  dualChart($('chart-views'), rows.map((r) => ({ label: r.label, post: r.post, replies: r.replies })));
}

function mediaSrc(data, key) {
  if (key === 'pin') return data.assets && data.assets.pinVideo;
  if (key === 'reel') return data.assets && data.assets.productReel;
  return null;
}

function mediaLabel(key) {
  if (key === 'pin') return 'видео-пин';
  if (key === 'reel') return 'рил';
  return key || '';
}

function bindCopy(btn, text) {
  if (!btn || !text) return;
  btn.onclick = async () => {
    await navigator.clipboard.writeText(text);
    const prev = btn.textContent;
    btn.textContent = 'Скопировано';
    setTimeout(() => { btn.textContent = prev; }, 1400);
  };
}

function renderDays(data) {
  const prev = data.days.filter((d) => d.following != null);
  const line = prev.length >= 2
    ? `${prev[prev.length - 1].following} following · ${prev[prev.length - 1].followers} followers`
    : '';
  $('follow-line').textContent = line;
  $('days').innerHTML = [...data.days].reverse().map((d) => {
    const stats = d.kind === 'content'
      ? `${d.replies || 0} репл<br>${(d.post && d.post.views) ?? '—'} view`
      : d.kind === 'planned' ? (d.post && d.post.media ? mediaLabel(d.post.media) : 'план') : '—';
    const extra = [
      d.post && d.post.pinned && !(d.label || '').includes('закреп') ? 'закреп' : '',
      d.post && d.post.media ? mediaLabel(d.post.media) : '',
    ].filter(Boolean);
    const titleExtra = extra.length ? ` · ${extra.join(' · ')}` : '';
    return `<div class="day kind-${d.kind}">
      <div class="day-date">${d.date.slice(5)}</div>
      <div>
        <div class="day-title">${d.label}${titleExtra}</div>
        <div class="day-notes">${d.notes || (d.post && d.post.text ? d.post.text.split('\n')[0] : '')}</div>
      </div>
      <div class="day-stats">${stats}</div>
    </div>`;
  }).join('');
}

function renderVideos(data) {
  const week2 = data.week2;
  if (!week2) {
    $('videos').innerHTML = '';
    return;
  }
  $('videos').innerHTML = [week2.pin, week2.reel].filter(Boolean).map((v, i) => `
    <article class="panel video-card">
      <header>
        <h2>${v.title}</h2>
        <span class="hint">${v.when} · ${v.duration} · ${v.action}</span>
      </header>
      <video class="desk-video" controls preload="metadata" src="${v.src}"></video>
      <p class="hint video-meta">${v.status}</p>
      ${v.caption ? `<pre class="post-text">${v.caption}</pre><button type="button" class="copy" data-copy="${i}">Скопировать текст</button>` : '<p class="empty">Текст поста ещё не лочили</p>'}
    </article>`).join('');
  $('videos').querySelectorAll('[data-copy]').forEach((btn) => {
    const item = [week2.pin, week2.reel][Number(btn.dataset.copy)];
    bindCopy(btn, item && item.caption);
  });
}

function renderNext(data) {
  const day = planned(data);
  const last = lastContent(data);
  if (!day || !day.post) {
    $('next-card').innerHTML = `<header><h2>Следующий пост</h2></header><p class="empty">Плана нет</p>`;
    return;
  }
  const pinHint = day.post.pinned ? 'закрепить' : 'не закреплять';
  const src = mediaSrc(data, day.post.media);
  $('next-card').innerHTML = `
    <header>
      <h2>${day.label} · пост ${day.post.n}</h2>
      <span class="hint">${day.date.slice(5)} · ${day.post.time} МСК · ${pinHint}</span>
    </header>
    ${src ? `<video class="desk-video" controls preload="metadata" src="${src}"></video>` : ''}
    ${day.post.text ? `<pre class="post-text">${day.post.text}</pre><button type="button" class="copy" id="copy-post">Скопировать</button>` : '<p class="empty">Текст поста ещё не лочили</p>'}
    ${last && last.post && last.post.url ? `<p class="hint" style="margin-top:12px"><a href="${last.post.url}" target="_blank" rel="noreferrer">последний пост на X ↗</a></p>` : ''}`;
  bindCopy($('copy-post'), day.post.text);
}

function renderRules(data) {
  $('rules').innerHTML = data.rules.map((r) => `<li>${r}</li>`).join('');
}

let topsRange = 'day';
let deskData = null;

function isoMinusDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

function dayTops(data) {
  const last = [...data.days].reverse().find((d) => d.topReplies && d.topReplies.length);
  if (!last) return { rows: [], hint: 'последний снятый день' };
  return { rows: last.topReplies, hint: `${last.date.slice(5)} · последний снятый день` };
}

function weekTops(data) {
  if (data.weekTopReplies && data.weekTopReplies.length) {
    const from = data.live && data.live.week && data.live.week.from;
    const to = data.live && data.live.week && data.live.week.to;
    const hint = from && to
      ? `${from.slice(5)}–${to.slice(5)} · по просмотрам`
      : '7 дней · по просмотрам';
    return { rows: data.weekTopReplies, hint };
  }
  const today = (data.live && data.live.today && data.live.today.date)
    || (contentDays(data).slice(-1)[0] && contentDays(data).slice(-1)[0].date);
  if (!today) return { rows: [], hint: '7 дней' };
  const from = isoMinusDays(today, 6);
  const rows = data.days
    .filter((d) => d.date >= from && d.date <= today)
    .flatMap((d) => (d.topReplies || []).map((r) => ({ ...r, date: r.date || d.date })))
    .sort((a, b) => (b.views - a.views) || (b.likes - a.likes))
    .slice(0, 8);
  return { rows, hint: `${from.slice(5)}–${today.slice(5)} · по просмотрам` };
}

function renderTops(data) {
  const { rows, hint } = topsRange === 'week' ? weekTops(data) : dayTops(data);
  if ($('tops-hint')) $('tops-hint').textContent = hint;
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.range === topsRange);
  });
  if (!rows.length) {
    $('tops').innerHTML = '<p class="empty">Сними метрики — появятся топ-реплаи</p>';
    return;
  }
  const week = topsRange === 'week';
  $('tops').innerHTML = rows.map((r) => `
    <div class="top-row${week ? ' week' : ''}">
      ${week ? `<span class="when">${(r.date || '').slice(5)}</span>` : ''}
      <span>@${r.handle}</span>
      <span class="views">${fmt(r.views)} view</span>
      <span>${fmt(r.likes)} like</span>
    </div>`).join('');
}

function renderHero(data) {
  $('hero').style.setProperty('--hero', `url('${data.assets.header}')`);
  $('handle').textContent = `@${data.handle}`;
  $('handle').href = data.url;
  $('bio').textContent = data.bio;
  $('pin').textContent = data.pin;
  $('clock').textContent = data.quota.window;
  $('clock').dataset.window = data.quota.window;
  $('countdown').textContent = `${countdownTo(data.quota.window)} · МСК`;
  $('pulled').textContent = data.live && data.live.pulledAtMsk
    ? `снято ${data.live.pulledAtMsk}`
    : 'ещё не снимали сегодня';
}

let lastPulled = null;

function render(data) {
  deskData = data;
  lastPulled = (data.live && data.live.pulledAt) || lastPulled;
  renderHero(data);
  renderKpis(data);
  renderVideos(data);
  renderCharts(data);
  renderDays(data);
  renderNext(data);
  renderRules(data);
  renderTops(data);
}

async function load() {
  const res = await fetch('api/desk');
  if (!res.ok) throw new Error('desk');
  render(await res.json());
}

$('refresh').onclick = async () => {
  $('refresh').disabled = true;
  $('refresh').textContent = 'Снимаю…';
  try {
    const res = await fetch('api/desk/refresh', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'refresh');
    render(data);
  } catch (err) {
    $('pulled').textContent = `ошибка: ${err.message}`;
  } finally {
    $('refresh').disabled = false;
    $('refresh').textContent = 'Снять с X';
  }
};

load().catch((err) => {
  $('bio').textContent = `Не удалось открыть стол: ${err.message}`;
});

document.querySelector('.seg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn || !deskData) return;
  topsRange = btn.dataset.range;
  renderTops(deskData);
});

setInterval(() => {
  const clock = $('clock');
  if (clock && clock.dataset.window) {
    $('countdown').textContent = `${countdownTo(clock.dataset.window)} · МСК`;
  }
}, 30000);

setInterval(async () => {
  try {
    const res = await fetch('api/desk');
    if (!res.ok) return;
    const data = await res.json();
    const stamp = data.live && data.live.pulledAt;
    if (stamp && stamp !== lastPulled) render(data);
  } catch {
    /* desk closed or offline */
  }
}, 60000);
