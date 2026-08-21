const { listPlans } = require('./plans');
const { isBetaMode, getBetaPublicConfig } = require('./betaAccess');

const SITE_URL = 'https://skinshead.pro';
const SUPPORT_TELEGRAM = '@GhostOfSecretum';
const SUPPORT_TELEGRAM_URL = 'https://t.me/GhostOfSecretum';
const DOCS_UPDATED_AT = '21 августа 2026 г.';
const OPERATOR = 'Администрация сервиса SkinsHead';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderShell({ title, description, active, bodyHtml }) {
  const nav = [
    { href: '/pricing', id: 'pricing', label: 'Тарифы и цены' },
    { href: '/privacy', id: 'privacy', label: 'Политика конфиденциальности' },
    { href: '/terms', id: 'terms', label: 'Пользовательское соглашение' },
    { href: '/support', id: 'support', label: 'Поддержка' },
  ];

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · SkinsHead</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${SITE_URL}${nav.find((item) => item.id === active)?.href || ''}" />
<link rel="icon" type="image/png" href="/logo-cs2-candles-favicon.png" />
<style>
  :root {
    --bg: #f6f4ef;
    --fg: #171717;
    --muted: #5c5a55;
    --line: #ddd8ce;
    --card: #fffdf8;
    --accent: #b42318;
    --ok: #0f7a43;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    color: var(--fg);
    background: linear-gradient(180deg, #efebe3 0%, var(--bg) 180px);
    line-height: 1.65;
  }
  a { color: var(--accent); }
  .wrap { max-width: 880px; margin: 0 auto; padding: 28px 20px 80px; }
  .top {
    display: flex; flex-wrap: wrap; gap: 12px 18px;
    justify-content: space-between; align-items: center;
    margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px solid var(--line);
  }
  .brand { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 700; letter-spacing: 0.04em; text-decoration: none; color: var(--fg); }
  .nav { display: flex; flex-wrap: wrap; gap: 8px; }
  .nav a {
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 13px; text-decoration: none; color: var(--muted);
    padding: 7px 10px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,0.55);
  }
  .nav a.active { color: var(--fg); border-color: #c9c2b5; background: var(--card); }
  h1 { font-size: clamp(28px, 5vw, 40px); line-height: 1.15; margin: 0 0 10px; }
  .meta { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px; color: var(--muted); margin-bottom: 28px; }
  h2 { font-size: 22px; margin: 32px 0 12px; }
  h3 { font-size: 17px; margin: 22px 0 8px; }
  p, li { font-size: 16px; }
  ul { padding-left: 1.2em; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 18px 18px; margin: 18px 0;
  }
  .plans { display: grid; gap: 14px; }
  @media (min-width: 820px) { .plans { grid-template-columns: repeat(3, 1fr); } }
  .plan {
    background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .plan.highlight { border-color: #e0a39a; box-shadow: 0 0 0 1px rgba(180,35,24,0.08); }
  .plan-name { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  .plan-price { font-size: 28px; font-weight: 700; line-height: 1.1; }
  .plan-note { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; color: var(--muted); }
  .plan ul { margin: 0; padding-left: 1.1em; }
  .plan li { font-size: 14px; margin: 4px 0; }
  .btn {
    display: inline-block; margin-top: 8px; padding: 10px 14px; border-radius: 10px;
    background: var(--accent); color: #fff; text-decoration: none;
    font-family: ui-sans-serif, system-ui, sans-serif; font-size: 14px;
  }
  .footer {
    margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--line);
    font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; color: var(--muted);
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <a class="brand" href="/">SKINS/HEAD</a>
      <nav class="nav">
        ${nav.map((item) => `<a href="${item.href}" class="${item.id === active ? 'active' : ''}">${escapeHtml(item.label)}</a>`).join('')}
      </nav>
    </div>
    ${bodyHtml}
    <div class="footer">
      <div>${escapeHtml(OPERATOR)} · <a href="${SITE_URL}">${SITE_URL.replace('https://', '')}</a></div>
      <div style="margin-top:6px">Поддержка: <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a> · Документы обновлены: ${escapeHtml(DOCS_UPDATED_AT)}</div>
    </div>
  </div>
</body>
</html>`;
}

function renderPrivacyPage() {
  const bodyHtml = `
    <h1>Политика конфиденциальности</h1>
    <div class="meta">Сервис SkinsHead · ${SITE_URL}<br>Дата актуальной редакции: ${DOCS_UPDATED_AT}</div>
    <div class="card">
      Настоящая Политика конфиденциальности определяет порядок сбора, использования, хранения и защиты информации Пользователей онлайн-сервиса SkinsHead (далее — «Сервис»).
      Используя Сервис, Пользователь подтверждает согласие с условиями настоящей Политики.
    </div>

    <h2>1. Общие положения</h2>
    <p>1.1. Оператором Сервиса выступает ${OPERATOR} (сайт ${SITE_URL}).</p>
    <p>1.2. Политика применяется ко всем Пользователям, которые посещают сайт, авторизуются через Steam OpenID, создают портфель, оплачивают тарифы или обращаются в поддержку.</p>
    <p>1.3. Сервис предназначен для учёта и аналитики портфеля скинов Counter-Strike 2 / инвентаря Steam и связанных цифровых функций.</p>

    <h2>2. Какие данные мы обрабатываем</h2>
    <p>2.1. В зависимости от сценария использования Сервис может обрабатывать:</p>
    <ul>
      <li>идентификатор Steam (SteamID64), публичное имя, аватар и URL профиля — при авторизации через Steam OpenID;</li>
      <li>данные портфеля: список предметов, количество, себестоимость, активность и настройки, которые Пользователь сохраняет в Сервисе;</li>
      <li>данные синхронизации desktop-клиента: список предметов инвентаря (без пароля Steam и без кодов аутентификатора);</li>
      <li>технические данные: cookie сессии, IP-адрес, тип браузера, журналы запросов, необходимые для безопасности и работоспособности;</li>
      <li>данные обращений в поддержку: содержание переписки в Telegram;</li>
      <li>сведения о статусе оплаты и выбранном тарифе, которые передаёт платёжный провайдер (без полных данных банковской карты).</li>
    </ul>
    <p>2.2. Сервис не запрашивает и не хранит пароль Steam, seed SDA и коды Steam Guard.</p>
    <p>2.3. Данные банковских карт вводятся Пользователем на стороне платёжного провайдера и не обрабатываются напрямую Администрацией.</p>

    <h2>3. Цели обработки</h2>
    <ul>
      <li>предоставление функций портфеля и тарифов; desktop-синхронизация появится позже;</li>
      <li>идентификация Пользователя и защита сессии;</li>
      <li>подтверждение оплаты и активация платного доступа;</li>
      <li>ответы на обращения в поддержку;</li>
      <li>обеспечение безопасности, предотвращение злоупотреблений и диагностика сбоев;</li>
      <li>улучшение качества Сервиса на основе обезличенной статистики.</li>
    </ul>

    <h2>4. Правовые основания</h2>
    <p>4.1. Обработка осуществляется на основании согласия Пользователя, исполнения договора на оказание цифровых услуг (пользовательского соглашения), а также законных интересов Администрации по обеспечению безопасности Сервиса.</p>

    <h2>5. Передача данных третьим лицам</h2>
    <p>5.1. Администрация не продаёт персональные данные Пользователей.</p>
    <p>5.2. Данные могут передаваться:</p>
    <ul>
      <li>Valve / Steam — в объёме, необходимом для OpenID-авторизации и получения публичных данных профиля/инвентаря;</li>
      <li>платёжному провайдеру — для проведения и подтверждения оплаты тарифа;</li>
      <li>хостинг- и инфраструктурным провайдерам — для размещения Сервиса;</li>
      <li>уполномоченным государственным органам — в случаях, предусмотренных законодательством.</li>
    </ul>

    <h2>6. Хранение и защита</h2>
    <p>6.1. Данные хранятся в течение срока, необходимого для оказания услуг и исполнения обязательств, либо до удаления по запросу Пользователя, если иное не требуется законом.</p>
    <p>6.2. Администрация применяет разумные организационные и технические меры защиты, однако не гарантирует абсолютную безопасность передачи данных через интернет.</p>

    <h2>7. Права Пользователя</h2>
    <p>7.1. Пользователь вправе запросить информацию об обрабатываемых данных, исправление неточных данных, удаление данных портфеля/аккаунта и отзыв согласия, направив обращение в поддержку.</p>
    <p>7.2. Отзыв согласия может ограничить возможность дальнейшего использования части функций Сервиса.</p>

    <h2>8. Платежи</h2>
    <p>8.1. Оплата тарифов осуществляется через платёжную форму стороннего платёжного провайдера.</p>
    <p>8.2. Сервис получает от провайдера сведения, необходимые для подтверждения факта оплаты, статуса платежа и активации выбранного тарифа.</p>

    <h2>9. Изменение Политики</h2>
    <p>9.1. Администрация вправе обновлять Политику. Актуальная версия всегда доступна по постоянному адресу <a href="/privacy">${SITE_URL}/privacy</a>.</p>
    <p>9.2. Продолжение использования Сервиса после публикации новой редакции означает согласие с обновлёнными условиями.</p>

    <h2>10. Контакты</h2>
    <p>По вопросам обработки данных и поддержки: Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>.</p>
    <p>Сайт Сервиса: <a href="${SITE_URL}">${SITE_URL}</a>.</p>
  `;

  return renderShell({
    title: 'Политика конфиденциальности',
    description: 'Политика конфиденциальности сервиса SkinsHead: какие данные обрабатываются, зачем и как связаться с поддержкой.',
    active: 'privacy',
    bodyHtml,
  });
}

function renderTermsPage() {
  const bodyHtml = `
    <h1>Пользовательское соглашение</h1>
    <div class="meta">Сервис SkinsHead · ${SITE_URL}<br>Дата актуальной редакции: ${DOCS_UPDATED_AT}</div>
    <div class="card">
      Настоящее Пользовательское соглашение (далее — «Соглашение») регулирует порядок использования онлайн-сервиса SkinsHead.
      Используя Сервис, включая просмотр сайта, авторизацию через Steam или оплату тарифов, Пользователь принимает условия Соглашения в полном объёме.
      Desktop-клиент находится в разработке и появится позже.
    </div>

    <h2>1. Общие положения</h2>
    <p>1.1. Сервис предоставляется ${OPERATOR} на сайте ${SITE_URL}.</p>
    <p>1.2. В случае несогласия с условиями Соглашения Пользователь обязан прекратить использование Сервиса.</p>
    <p>1.3. Актуальная версия Соглашения всегда доступна по адресу <a href="/terms">${SITE_URL}/terms</a>.</p>

    <h2>2. Характер услуг</h2>
    <p>2.1. Сервис предоставляет цифровые услуги нематериального характера, включая:</p>
    <ul>
      <li>учёт и отображение портфеля скинов CS2 / инвентаря Steam;</li>
      <li>аналитику цен, P&amp;L, распределение, маркет и связанные инструменты сайта;</li>
      <li>трекинг топовых аккаунтов инвесторов;</li>
      <li>доступ к desktop-клиенту и синхронизации полного инвентаря, включая Хранилища (по платному тарифу; приложение скоро).</li>
    </ul>
    <p>2.2. Сервис не является финансовым советником, брокером, гарантом доходности или аффилированным лицом Valve / Steam / Counter-Strike.</p>
    <p>2.3. Цены предметов на сторонних площадках и в Steam могут отличаться от данных Сервиса; Пользователь самостоятельно принимает решения о сделках.</p>

    <h2>3. Тарифы и оплата</h2>
    <p>3.1. Актуальные тарифы, цены и состав услуг опубликованы на странице <a href="/pricing">${SITE_URL}/pricing</a>.</p>
    <p>3.2. Оплата производится на условиях, указанных в Сервисе до момента оплаты.</p>
    <p>3.3. После успешной оплаты Пользователю предоставляется доступ к функциям выбранного тарифа.</p>
    <p>3.4. В связи с нематериальным характером цифровых услуг возврат денежных средств после предоставления доступа, как правило, не осуществляется, за исключением случаев:</p>
    <ul>
      <li>услуга не была оказана по технической вине Сервиса;</li>
      <li>доступ к оплаченным функциям фактически не был предоставлен.</li>
    </ul>
    <p>3.5. Для рассмотрения возврата Пользователь обращается в поддержку в течение 24 часов с момента оплаты. Решение принимается Администрацией индивидуально.</p>
    <p>3.6. Пользователь обязуется не инициировать chargeback без предварительного обращения в поддержку Сервиса.</p>

    <h2>4. Отказ от гарантий и ограничение ответственности</h2>
    <p>4.1. Сервис предоставляется на условиях «как есть» (AS IS).</p>
    <p>4.2. Администрация не гарантирует бесперебойную работу, достижение финансовой прибыли, точность всех рыночных котировок сторонних источников и соответствие Сервиса индивидуальным ожиданиям.</p>
    <p>4.3. Администрация не несёт ответственности за убытки, упущенную выгоду, действия третьих лиц, блокировки Steam-аккаунтов, изменения API/правил Valve и временные технические ограничения.</p>

    <h2>5. Законность использования</h2>
    <p>5.1. Пользователь обязуется использовать Сервис добросовестно и в рамках применимого законодательства, а также правил Steam и платёжных провайдеров.</p>
    <p>5.2. Запрещено использовать Сервис для мошенничества, обхода ограничений, вмешательства в работу инфраструктуры или передачи вредоносного ПО.</p>

    <h2>6. Интеллектуальная собственность</h2>
    <p>6.1. Дизайн, код, тексты, товарные обозначения SkinsHead и иные материалы Сервиса охраняются законом.</p>
    <p>6.2. Права на игровые предметы, названия и изображения Counter-Strike / Steam принадлежат соответствующим правообладателям.</p>

    <h2>7. Ограничение доступа</h2>
    <p>7.1. Администрация вправе приостановить или ограничить доступ при нарушении Соглашения, злоупотреблениях, требованиях закона или платёжных провайдеров.</p>
    <p>7.2. Ограничение доступа не освобождает от обязательств, возникших до его применения.</p>

    <h2>8. Конфиденциальность</h2>
    <p>8.1. Порядок обработки данных описан в <a href="/privacy">Политике конфиденциальности</a>.</p>

    <h2>9. Изменение условий</h2>
    <p>9.1. Администрация вправе обновлять Соглашение. Продолжение использования Сервиса означает согласие с новой редакцией.</p>

    <h2>10. Контакты поддержки</h2>
    <p>10.1. По всем вопросам оплаты, доступа и работы Сервиса: Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>.</p>
    <p>10.2. Страница поддержки: <a href="/support">${SITE_URL}/support</a>.</p>
    <p>Используя Сервис, Пользователь подтверждает, что ознакомился с настоящим Соглашением и принимает его условия.</p>
  `;

  return renderShell({
    title: 'Пользовательское соглашение',
    description: 'Пользовательское соглашение SkinsHead: условия использования, тарифы, оплата и ответственность.',
    active: 'terms',
    bodyHtml,
  });
}

function renderSupportPage() {
  const bodyHtml = `
    <h1>Поддержка и обратная связь</h1>
    <div class="meta">Сервис SkinsHead · ${SITE_URL}<br>Дата актуальной редакции: ${DOCS_UPDATED_AT}</div>
    <div class="card">
      <p style="margin-top:0">Официальный канал поддержки Пользователей SkinsHead — личные сообщения в Telegram на юзернейм Администрации.</p>
      <p><strong>Telegram:</strong> <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a></p>
      <p><strong>Ссылка:</strong> <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM_URL}</a></p>
      <p style="margin-bottom:0"><strong>Сайт:</strong> <a href="${SITE_URL}">${SITE_URL}</a></p>
    </div>
    <a class="btn" href="${SUPPORT_TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">Написать в Telegram</a>

    <h2>С какими вопросами можно обратиться</h2>
    <ul>
      <li>оплата тарифа и активация доступа;</li>
      <li>возврат / неуспешный платёж;</li>
      <li>работа портфеля и desktop-приложения (скоро);</li>
      <li>удаление данных или вопросы по конфиденциальности.</li>
    </ul>

    <h2>Как быстро мы отвечаем</h2>
    <p>Обычно отвечаем в течение 24 часов в рабочие дни. Для вопросов по оплате укажите SteamID / логин Steam, дату платежа и тариф.</p>

    <h2>Документы</h2>
    <ul>
      <li><a href="/pricing">Тарифы и цены</a></li>
      <li><a href="/privacy">Политика конфиденциальности</a></li>
      <li><a href="/terms">Пользовательское соглашение</a></li>
    </ul>
  `;

  return renderShell({
    title: 'Поддержка',
    description: 'Контакты поддержки SkinsHead: Telegram @GhostOfSecretum для вопросов по оплате и доступу.',
    active: 'support',
    bodyHtml,
  });
}

function renderPricingPage() {
  const plans = listPlans();
  const cards = plans.map((plan) => {
    const name = plan.name?.ru || plan.id;
    const price = plan.price?.ru || plan.price?.en || '';
    const note = plan.priceNote?.ru || plan.priceNote?.en || '';
    const bullets = plan.bullets?.ru || plan.bullets?.en || [];
    const amount = plan.amountRub;
    const annualAmount = plan.annualAmountRub;
    const shortAmount = plan.shortAmountRub;
    const shortDays = plan.shortPeriodDays;
    const highlight = plan.highlight ? ' highlight' : '';
    return `
      <article class="plan${highlight}">
        <div class="plan-name">${escapeHtml(name)}</div>
        <div class="plan-price">${escapeHtml(price)}</div>
        <div class="plan-note">${escapeHtml(note)}</div>
        ${Number.isFinite(amount) ? `<div class="plan-note">Стоимость: <strong>${amount} ₽</strong>${amount > 0 ? ` за ${plan.periodDays || 30} ${plan.periodDays === 3 ? 'дня' : 'дней'} доступа` : ''}</div>` : ''}
        ${Number.isFinite(annualAmount) ? `<div class="plan-note">Годовая оплата: <strong>${annualAmount} ₽</strong> за 12 месяцев · выгоднее на 17%</div>` : ''}
        ${Number.isFinite(shortAmount) && shortAmount > 0 ? `<div class="plan-note">Короткий доступ: <strong>${shortAmount} ₽</strong> за ${shortDays || 3} дня</div>` : ''}
        <ul>
          ${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </article>
    `;
  }).join('');

  const beta = getBetaPublicConfig();
  const betaNotice = isBetaMode()
    ? `<div class="card">
      <strong>Beta:</strong> тариф Plus можно получить бесплатно за подписку на канал
      <a href="${escapeHtml(beta.channelUrl)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(beta.channelUsername)}</a>
      после входа через Steam на сайте. Тариф Investor можно один раз попробовать бесплатно 7 дней, далее оплачивается по цене ниже.
    </div>`
    : `<div class="card">
      Ниже указаны актуальные тарифы Сервиса: сколько стоит каждый план и какие функции он открывает.
      Тариф Investor можно один раз попробовать бесплатно на 7 дней после входа через Steam.
      Оплата подключаемых платных тарифов производится через платёжного провайдера, в том числе картой или криптовалютой. После оплаты доступ активируется для аккаунта Steam, с которого выполнен вход на сайте.
    </div>`;

  const bodyHtml = `
    <h1>Тарифы и цены</h1>
    <div class="meta">Сервис SkinsHead · ${SITE_URL}<br>Дата актуальной редакции: ${DOCS_UPDATED_AT}</div>
    ${betaNotice}

    <div class="plans">${cards}</div>

    <h2>За что платит клиент</h2>
    <ul>
      ${plans.map((plan) => {
        const name = plan.name?.ru || plan.id;
        const amount = Number.isFinite(plan.amountRub) ? `${plan.amountRub} ₽` : (plan.price?.ru || '');
        const annualAmount = Number.isFinite(plan.annualAmountRub) ? ` или ${plan.annualAmountRub} ₽ / год` : '';
        const periodWord = plan.periodDays === 3 ? 'дня' : 'дней';
        const period = plan.periodDays ? ` / ${plan.periodDays} ${periodWord}` : '';
        const trial = plan.id === 'investor' ? ' Включает однократный бесплатный пробный период 7 дней.' : '';
        const summary = (plan.bullets?.ru || []).slice(0, 3).join('; ');
        return `<li><strong>${escapeHtml(name)} (${escapeHtml(amount)}${escapeHtml(period)}${escapeHtml(annualAmount)})</strong> — ${escapeHtml(summary)}.${escapeHtml(trial)}</li>`;
      }).join('')}
    </ul>

    <h2>Важные условия оплаты</h2>
    <ul>
      <li>цены указаны в российских рублях;</li>
      <li>период доступа платных тарифов — 3 дня, 30 дней или 12 месяцев с момента успешной оплаты, в зависимости от выбранного периода;</li>
      <li>тариф Investor можно один раз активировать бесплатно на 7 дней для аккаунта Steam на тарифе Free;</li>
      <li>цифровая услуга считается предоставленной с момента открытия функций тарифа;</li>
      <li>вопросы по оплате и возврату: Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>.</li>
    </ul>

    <p>См. также: <a href="/terms">Пользовательское соглашение</a> и <a href="/privacy">Политика конфиденциальности</a>.</p>
    <a class="btn" href="/">Перейти на сайт SkinsHead</a>
  `;

  return renderShell({
    title: 'Тарифы и цены',
    description: 'Тарифы SkinsHead: сайт бесплатный, Plus $7.99 / 299 ₽, оплата картой или криптой через Platega из любой страны.',
    active: 'pricing',
    bodyHtml,
  });
}

module.exports = {
  SITE_URL,
  SUPPORT_TELEGRAM,
  SUPPORT_TELEGRAM_URL,
  DOCS_UPDATED_AT,
  renderPrivacyPage,
  renderTermsPage,
  renderSupportPage,
  renderPricingPage,
};
