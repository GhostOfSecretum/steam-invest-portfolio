const { listPlans } = require('./plans');
const { isBetaMode, getBetaPublicConfig } = require('./betaAccess');

const SITE_URL = 'https://skinshead.pro';
const SUPPORT_TELEGRAM = '@GhostOfSecretum';
const SUPPORT_TELEGRAM_URL = 'https://t.me/GhostOfSecretum';
const DOCS_UPDATED_AT = '10 октября 2026 г.';
const OPERATOR = 'Администрация сервиса SkinsHead';
const LEGAL_LANGS = [
  ['en', 'EN'],
  ['ru', 'RU'],
  ['zh', '简'],
  ['zh-TW', '繁'],
];
const HTML_LANG = { en: 'en', ru: 'ru', zh: 'zh-CN', 'zh-TW': 'zh-TW' };

function normalizeLegalLang(raw) {
  const value = String(raw || 'en');
  return LEGAL_LANGS.some(([code]) => code === value) ? value : 'en';
}

function legalHref(page, lang) {
  return (page === 'privacy' || page === 'terms') && lang !== 'en'
    ? `/${page}?lang=${encodeURIComponent(lang)}`
    : `/${page}`;
}

function langSwitch(page, lang) {
  const label = { en: 'Language', ru: 'Язык', zh: '语言', 'zh-TW': '語言' }[lang];
  return `<div class="lang-switch" role="group" aria-label="${escapeHtml(label)}">${LEGAL_LANGS.map(([code, text]) => {
    const href = legalHref(page, code);
    return `<a href="${href}"${code === lang ? ' class="active" aria-current="true"' : ''}>${text}</a>`;
  }).join('')}</div>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderShell({ title, description, active, bodyHtml, lang = 'ru' }) {
  const labels = {
    en: { privacy: 'Privacy policy', terms: 'Terms of use', support: 'Support' },
    ru: { privacy: 'Политика конфиденциальности', terms: 'Пользовательское соглашение', support: 'Поддержка' },
    zh: { privacy: '隐私政策', terms: '使用条款', support: '支持' },
    'zh-TW': { privacy: '隱私權政策', terms: '使用條款', support: '支援' },
  }[lang] || {
    privacy: 'Privacy policy', terms: 'Terms of use', support: 'Support',
  };
  const nav = ['privacy', 'terms', 'support'].map((id) => ({
    href: legalHref(id, lang),
    id,
    label: labels[id],
  }));
  const operator = {
    en: 'SkinsHead administration',
    ru: OPERATOR,
    zh: 'SkinsHead 服务管理方',
    'zh-TW': 'SkinsHead 服務管理方',
  }[lang] || 'SkinsHead administration';
  const updated = {
    en: 'Updated: October 10, 2026',
    ru: `Документы обновлены: ${DOCS_UPDATED_AT}`,
    zh: '更新日期：2026年10月10日',
    'zh-TW': '更新日期：2026年10月10日',
  }[lang];
  const supportWord = { en: 'Support', ru: 'Поддержка', zh: '支持', 'zh-TW': '支援' }[lang];

  return `<!doctype html>
<html lang="${HTML_LANG[lang] || 'en'}">
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
  .lang-switch { display: flex; gap: 4px; margin-top: 12px; }
  .lang-switch a {
    font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; font-weight: 600;
    text-decoration: none; min-width: 36px; text-align: center; padding: 4px 8px;
    border-radius: 7px; border: 1px solid var(--line); color: var(--muted); background: rgba(255,255,255,0.55);
  }
  .lang-switch a.active { background: var(--accent); color: #fff; border-color: transparent; }
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
      <div>${escapeHtml(operator)} · <a href="${SITE_URL}">${SITE_URL.replace('https://', '')}</a></div>
      <div style="margin-top:6px">${escapeHtml(supportWord)}: <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a> · ${escapeHtml(updated)}</div>
    </div>
  </div>
</body>
</html>`;
}


function renderLegalDoc(lang, page, copy) {
  const bodyHtml = `
    <h1>${copy.title}</h1>
    <div class="meta">${copy.kicker}<br>${copy.updated}${langSwitch(page, lang)}</div>
    <div class="card">${copy.intro}</div>
    ${copy.body}
  `;
  return renderShell({
    title: copy.title,
    description: copy.description,
    active: page,
    lang,
    bodyHtml,
  });
}

function renderPrivacyPage(rawLang) {
  const lang = normalizeLegalLang(rawLang);
  const here = legalHref('privacy', lang);
  const copy = {
    en: {
      title: 'Privacy policy',
      description: 'SkinsHead privacy policy: what data is processed, why, and how to contact support. Includes the browser extension.',
      kicker: `SkinsHead · ${SITE_URL}`,
      updated: 'Last updated: October 10, 2026',
      intro: 'This privacy policy explains how the SkinsHead online service (the “Service”) collects, uses, stores and protects information about its users. By using the Service, you agree to this policy.',
      body: `
        <h2>1. General</h2>
        <p>1.1. The Service is operated by the SkinsHead administration (website ${SITE_URL}).</p>
        <p>1.2. This policy applies to everyone who visits the site, signs in through Steam OpenID, creates a portfolio, installs the browser extension, or contacts support.</p>
        <p>1.3. The Service is for tracking and analysing a Counter-Strike 2 skin portfolio and a Steam inventory, including related digital features.</p>
        <h2>2. Data we process</h2>
        <p>2.1. Depending on how you use the Service, we may process:</p>
        <ul>
          <li>your SteamID64, public name, avatar and profile URL, when you sign in through Steam OpenID;</li>
          <li>portfolio data: the item list, quantities, cost basis, activity and settings you save in the Service;</li>
          <li>data synced by the browser extension: the list of inventory and Storage Unit items, without your Steam password, Steam token or authenticator codes;</li>
          <li>technical data: the session cookie, IP address, browser type and request logs needed for security and operation;</li>
          <li>support messages: the contents of the Telegram conversation;</li>
        </ul>
        <p>2.2. The Service never asks for or stores your Steam password, SDA seed or Steam Guard codes.</p>
        <p>2.3. The browser extension signs in to Steam with a QR code on every sync. The Steam token it receives stays only in the tab’s memory while the reading is in progress. It is not written to disk, it is not sent to the Service, and it is revoked at Steam immediately afterwards. The Service receives the item list and a pairing token, and that token can only upload the list.</p>
        <h2>3. Why we process it</h2>
        <ul>
          <li>to provide the portfolio and Storage Unit sync;</li>
          <li>to identify you and protect the session;</li>
          <li>to answer support requests;</li>
          <li>to keep the Service secure, prevent abuse and diagnose failures;</li>
          <li>to improve the Service using aggregated statistics.</li>
        </ul>
        <h2>4. Legal bases</h2>
        <p>4.1. We process data based on your consent, on performing the contract for digital services (the terms of use), and on the administration’s legitimate interest in keeping the Service secure.</p>
        <h2>5. Sharing with third parties</h2>
        <p>5.1. We do not sell personal data.</p>
        <p>5.2. Data may be shared with:</p>
        <ul>
          <li>Valve / Steam, to the extent needed for OpenID sign-in and for public profile and inventory data;</li>
          <li>hosting and infrastructure providers that run the Service;</li>
          <li>competent public authorities, where the law requires it.</li>
        </ul>
        <h2>6. Storage and protection</h2>
        <p>6.1. Data is kept for as long as needed to provide the Service and meet our obligations, or until you ask us to delete it, unless the law requires longer.</p>
        <p>6.2. We use reasonable organisational and technical safeguards. No transmission over the internet can be guaranteed completely secure.</p>
        <h2>7. Your rights</h2>
        <p>7.1. You can ask what data we process, ask us to correct inaccurate data, ask us to delete your portfolio or account data, and withdraw consent, by contacting support.</p>
        <p>7.2. Withdrawing consent may limit some features of the Service.</p>
        <h2>8. Changes</h2>
        <p>8.1. We may update this policy. The current version is always at <a href="${here}">${SITE_URL}${here}</a>.</p>
        <p>8.2. Continuing to use the Service after a new version is published means you accept the updated terms.</p>
        <h2>9. Contact</h2>
        <p>For privacy and support questions: Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>.</p>
        <p>Website: <a href="${SITE_URL}">${SITE_URL}</a>.</p>
      `,
    },
    ru: {
      title: 'Политика конфиденциальности',
      description: 'Политика конфиденциальности сервиса SkinsHead: какие данные обрабатываются, зачем и как связаться с поддержкой.',
      kicker: `Сервис SkinsHead · ${SITE_URL}`,
      updated: `Дата актуальной редакции: ${DOCS_UPDATED_AT}`,
      intro: 'Настоящая Политика конфиденциальности определяет порядок сбора, использования, хранения и защиты информации Пользователей онлайн-сервиса SkinsHead (далее — «Сервис»). Используя Сервис, Пользователь подтверждает согласие с условиями настоящей Политики.',
      body: `
        <h2>1. Общие положения</h2>
        <p>1.1. Оператором Сервиса выступает ${OPERATOR} (сайт ${SITE_URL}).</p>
        <p>1.2. Политика применяется ко всем Пользователям, которые посещают сайт, авторизуются через Steam OpenID, создают портфель, устанавливают расширение для браузера или обращаются в поддержку.</p>
        <p>1.3. Сервис предназначен для учёта и аналитики портфеля скинов Counter-Strike 2 / инвентаря Steam и связанных цифровых функций.</p>
        <h2>2. Какие данные мы обрабатываем</h2>
        <p>2.1. В зависимости от сценария использования Сервис может обрабатывать:</p>
        <ul>
          <li>идентификатор Steam (SteamID64), публичное имя, аватар и URL профиля — при авторизации через Steam OpenID;</li>
          <li>данные портфеля: список предметов, количество, себестоимость, активность и настройки, которые Пользователь сохраняет в Сервисе;</li>
          <li>данные синхронизации расширения для браузера: список предметов инвентаря и Хранилищ (без пароля Steam, токена Steam и кодов аутентификатора);</li>
          <li>технические данные: cookie сессии, IP-адрес, тип браузера, журналы запросов, необходимые для безопасности и работоспособности;</li>
          <li>данные обращений в поддержку: содержание переписки в Telegram;</li>
        </ul>
        <p>2.2. Сервис не запрашивает и не хранит пароль Steam, seed SDA и коды Steam Guard.</p>
        <p>2.3. Расширение для браузера входит в Steam по QR-коду при каждой синхронизации. Полученный токен Steam хранится только в памяти вкладки на время чтения, не записывается на диск, не передаётся на сервер Сервиса и отзывается в Steam сразу после чтения. На сервер передаётся список предметов и токен привязки, который позволяет только загрузить этот список.</p>
        <h2>3. Цели обработки</h2>
        <ul>
          <li>предоставление функций портфеля, включая синхронизацию Хранилищ;</li>
          <li>идентификация Пользователя и защита сессии;</li>
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
          <li>хостинг- и инфраструктурным провайдерам — для размещения Сервиса;</li>
          <li>уполномоченным государственным органам — в случаях, предусмотренных законодательством.</li>
        </ul>
        <h2>6. Хранение и защита</h2>
        <p>6.1. Данные хранятся в течение срока, необходимого для оказания услуг и исполнения обязательств, либо до удаления по запросу Пользователя, если иное не требуется законом.</p>
        <p>6.2. Администрация применяет разумные организационные и технические меры защиты, однако не гарантирует абсолютную безопасность передачи данных через интернет.</p>
        <h2>7. Права Пользователя</h2>
        <p>7.1. Пользователь вправе запросить информацию об обрабатываемых данных, исправление неточных данных, удаление данных портфеля/аккаунта и отзыв согласия, направив обращение в поддержку.</p>
        <p>7.2. Отзыв согласия может ограничить возможность дальнейшего использования части функций Сервиса.</p>
        <h2>8. Изменение Политики</h2>
        <p>8.1. Администрация вправе обновлять Политику. Актуальная версия всегда доступна по адресу <a href="${here}">${SITE_URL}${here}</a>.</p>
        <p>8.2. Продолжение использования Сервиса после публикации новой редакции означает согласие с обновлёнными условиями.</p>
        <h2>9. Контакты</h2>
        <p>По вопросам обработки данных и поддержки: Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>.</p>
        <p>Сайт Сервиса: <a href="${SITE_URL}">${SITE_URL}</a>.</p>
      `,
    },
    zh: {
      title: '隐私政策',
      description: 'SkinsHead 隐私政策：处理哪些数据、原因，以及如何联系支持。包括浏览器扩展。',
      kicker: `SkinsHead · ${SITE_URL}`,
      updated: '更新日期：2026年10月10日',
      intro: '本隐私政策说明 SkinsHead 在线服务（下称「服务」）如何收集、使用、存储和保护用户信息。使用服务即表示您同意本政策。',
      body: `
        <h2>1. 总则</h2>
        <p>1.1. 服务由 SkinsHead 服务管理方运营（网站 ${SITE_URL}）。</p>
        <p>1.2. 本政策适用于访问网站、通过 Steam OpenID 登录、创建资产组合、安装浏览器扩展或联系支持的所有人。</p>
        <p>1.3. 服务用于跟踪和分析 Counter-Strike 2 皮肤资产组合与 Steam 库存，以及相关数字功能。</p>
        <h2>2. 我们处理的数据</h2>
        <p>2.1. 根据您使用服务的方式，我们可能处理：</p>
        <ul>
          <li>通过 Steam OpenID 登录时的 SteamID64、公开名称、头像和档案网址；</li>
          <li>资产组合数据：您保存在服务中的物品列表、数量、成本、活动和设置；</li>
          <li>浏览器扩展同步的数据：库存和仓库物品列表，不含 Steam 密码、Steam 令牌或验证器代码；</li>
          <li>技术数据：会话 cookie、IP 地址、浏览器类型，以及安全与运行所需的请求日志；</li>
          <li>支持消息：Telegram 对话内容；</li>
        </ul>
        <p>2.2. 服务从不索取或存储您的 Steam 密码、SDA 种子或 Steam 令牌验证码。</p>
        <p>2.3. 浏览器扩展在每次同步时通过二维码登录 Steam。获得的 Steam 令牌只在读取期间留在标签页内存中，不写入磁盘，不发送给服务，并在读取后立即在 Steam 撤销。服务收到的是物品列表和绑定令牌，该令牌只能上传这份列表。</p>
        <h2>3. 处理目的</h2>
        <ul>
          <li>提供资产组合和仓库同步；</li>
          <li>识别用户并保护会话；</li>
          <li>回复支持请求；</li>
          <li>保障安全、防止滥用并诊断故障；</li>
          <li>根据汇总统计改进服务。</li>
        </ul>
        <h2>4. 法律依据</h2>
        <p>4.1. 我们基于您的同意、履行数字服务合同（使用条款），以及管理方保障服务安全的正当利益处理数据。</p>
        <h2>5. 向第三方提供</h2>
        <p>5.1. 我们不出售个人数据。</p>
        <p>5.2. 数据可能提供给：</p>
        <ul>
          <li>Valve / Steam，限于 OpenID 登录以及公开档案和库存数据所需的范围；</li>
          <li>运行服务的托管和基础设施提供商；</li>
          <li>法律要求时的主管公共机关。</li>
        </ul>
        <h2>6. 存储与保护</h2>
        <p>6.1. 数据保留至提供服务和履行义务所需的时间，或直到您要求删除，除非法律要求更长时间。</p>
        <p>6.2. 我们采取合理的组织和技术保护措施。通过互联网传输无法保证绝对安全。</p>
        <h2>7. 您的权利</h2>
        <p>7.1. 您可以联系支持，询问我们处理哪些数据、要求更正不准确的数据、要求删除资产组合或账户数据，以及撤回同意。</p>
        <p>7.2. 撤回同意可能会限制服务的部分功能。</p>
        <h2>8. 变更</h2>
        <p>8.1. 我们可能会更新本政策。当前版本始终位于 <a href="${here}">${SITE_URL}${here}</a>。</p>
        <p>8.2. 新版本发布后继续使用服务，即表示您接受更新后的条款。</p>
        <h2>9. 联系</h2>
        <p>隐私和支持问题：Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>。</p>
        <p>网站：<a href="${SITE_URL}">${SITE_URL}</a>。</p>
      `,
    },
    'zh-TW': {
      title: '隱私權政策',
      description: 'SkinsHead 隱私權政策：處理哪些資料、原因，以及如何聯絡支援。包括瀏覽器擴充。',
      kicker: `SkinsHead · ${SITE_URL}`,
      updated: '更新日期：2026年10月10日',
      intro: '本隱私權政策說明 SkinsHead 線上服務（下稱「服務」）如何收集、使用、儲存和保護使用者資訊。使用服務即表示您同意本政策。',
      body: `
        <h2>1. 總則</h2>
        <p>1.1. 服務由 SkinsHead 服務管理方營運（網站 ${SITE_URL}）。</p>
        <p>1.2. 本政策適用於造訪網站、透過 Steam OpenID 登入、建立資產組合、安裝瀏覽器擴充或聯絡支援的所有人。</p>
        <p>1.3. 服務用於追蹤和分析 Counter-Strike 2 皮膚資產組合與 Steam 庫存，以及相關數位功能。</p>
        <h2>2. 我們處理的資料</h2>
        <p>2.1. 根據您使用服務的方式，我們可能處理：</p>
        <ul>
          <li>透過 Steam OpenID 登入時的 SteamID64、公開名稱、頭像和檔案網址；</li>
          <li>資產組合資料：您儲存在服務中的物品清單、數量、成本、活動和設定；</li>
          <li>瀏覽器擴充同步的資料：庫存和倉庫物品清單，不含 Steam 密碼、Steam 權杖或驗證器代碼；</li>
          <li>技術資料：工作階段 cookie、IP 位址、瀏覽器類型，以及安全與運作所需的請求紀錄；</li>
          <li>支援訊息：Telegram 對話內容；</li>
        </ul>
        <p>2.2. 服務從不索取或儲存您的 Steam 密碼、SDA 種子或 Steam 驗證碼。</p>
        <p>2.3. 瀏覽器擴充在每次同步時透過 QR 碼登入 Steam。取得的 Steam 權杖只在讀取期間留在分頁記憶體中，不寫入磁碟，不傳送給服務，並在讀取後立即在 Steam 撤銷。服務收到的是物品清單和綁定權杖，該權杖只能上傳這份清單。</p>
        <h2>3. 處理目的</h2>
        <ul>
          <li>提供資產組合和倉庫同步；</li>
          <li>識別使用者並保護工作階段；</li>
          <li>回覆支援請求；</li>
          <li>保障安全、防止濫用並診斷故障；</li>
          <li>根據彙總統計改進服務。</li>
        </ul>
        <h2>4. 法律依據</h2>
        <p>4.1. 我們基於您的同意、履行數位服務合約（使用條款），以及管理方保障服務安全的正當利益處理資料。</p>
        <h2>5. 向第三方提供</h2>
        <p>5.1. 我們不出售個人資料。</p>
        <p>5.2. 資料可能提供給：</p>
        <ul>
          <li>Valve / Steam，限於 OpenID 登入以及公開檔案和庫存資料所需的範圍；</li>
          <li>運行服務的託管和基礎設施提供者；</li>
          <li>法律要求時的主管公共機關。</li>
        </ul>
        <h2>6. 儲存與保護</h2>
        <p>6.1. 資料保留至提供服務和履行義務所需的時間，或直到您要求刪除，除非法律要求更長時間。</p>
        <p>6.2. 我們採取合理的組織和技術保護措施。透過網際網路傳輸無法保證絕對安全。</p>
        <h2>7. 您的權利</h2>
        <p>7.1. 您可以聯絡支援，詢問我們處理哪些資料、要求更正不準確的資料、要求刪除資產組合或帳戶資料，以及撤回同意。</p>
        <p>7.2. 撤回同意可能會限制服務的部分功能。</p>
        <h2>8. 變更</h2>
        <p>8.1. 我們可能會更新本政策。目前版本始終位於 <a href="${here}">${SITE_URL}${here}</a>。</p>
        <p>8.2. 新版本發布後繼續使用服務，即表示您接受更新後的條款。</p>
        <h2>9. 聯絡</h2>
        <p>隱私和支援問題：Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>。</p>
        <p>網站：<a href="${SITE_URL}">${SITE_URL}</a>。</p>
      `,
    },
  }[lang];
  return renderLegalDoc(lang, 'privacy', copy);
}

function renderTermsPage(rawLang) {
  const lang = normalizeLegalLang(rawLang);
  const here = legalHref('terms', lang);
  const privacy = legalHref('privacy', lang);
  const copy = {
    en: {
      title: 'Terms of use',
      description: 'SkinsHead terms of use: how the service may be used and the limits of liability.',
      kicker: `SkinsHead · ${SITE_URL}`,
      updated: 'Last updated: October 10, 2026',
      intro: 'These terms of use (the “Terms”) govern use of the SkinsHead online service. By using the Service, including browsing the site or signing in through Steam, you accept these Terms in full.',
      body: `
        <h2>1. General</h2>
        <p>1.1. The Service is provided by the SkinsHead administration at ${SITE_URL}.</p>
        <p>1.2. If you do not agree with these Terms, you must stop using the Service.</p>
        <p>1.3. The current Terms are always available at <a href="${here}">${SITE_URL}${here}</a>.</p>
        <h2>2. Nature of the service</h2>
        <p>2.1. The Service provides intangible digital services, including:</p>
        <ul>
          <li>tracking and displaying a CS2 skin portfolio and a Steam inventory;</li>
          <li>price analytics, P&amp;L, allocation, the market explorer and related site tools;</li>
          <li>tracking of top investor accounts;</li>
          <li>sync of the full inventory, including Storage Units, through the browser extension.</li>
        </ul>
        <p>2.2. The Service is not a financial adviser, a broker, a guarantor of returns, or an affiliate of Valve, Steam or Counter-Strike.</p>
        <p>2.3. Item prices on third-party markets and on Steam may differ from the Service’s data. You decide on any transaction yourself.</p>
        <h2>3. Access</h2>
        <p>3.1. The Service is free. Every feature on the website is available without payment.</p>
        <h2>4. Disclaimer and limitation of liability</h2>
        <p>4.1. The Service is provided “as is”.</p>
        <p>4.2. The administration does not guarantee uninterrupted operation, financial profit, the accuracy of every third-party market quote, or that the Service will meet your personal expectations.</p>
        <p>4.3. The administration is not liable for losses, lost profits, actions of third parties, Steam account restrictions, changes to Valve’s API or rules, or temporary technical limits.</p>
        <h2>5. Lawful use</h2>
        <p>5.1. You agree to use the Service in good faith, within applicable law, and within the rules of Steam.</p>
        <p>5.2. You may not use the Service for fraud, to bypass restrictions, to interfere with the infrastructure, or to distribute malware.</p>
        <h2>6. Intellectual property</h2>
        <p>6.1. The design, code, text, SkinsHead marks and other materials of the Service are protected by law.</p>
        <p>6.2. Rights in game items, names and images of Counter-Strike and Steam belong to their respective owners.</p>
        <h2>7. Restricting access</h2>
        <p>7.1. The administration may suspend or limit access if these Terms are broken, in case of abuse, or when the law requires it.</p>
        <p>7.2. A restriction does not cancel obligations that arose before it was applied.</p>
        <h2>8. Privacy</h2>
        <p>8.1. How data is processed is described in the <a href="${privacy}">Privacy policy</a>.</p>
        <h2>9. Changes</h2>
        <p>9.1. The administration may update these Terms. Continuing to use the Service means you accept the new version.</p>
        <h2>10. Support</h2>
        <p>10.1. For questions about access and how the Service works: Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>.</p>
        <p>10.2. Support page: <a href="/support">${SITE_URL}/support</a>.</p>
        <p>By using the Service, you confirm that you have read these Terms and accept them.</p>
      `,
    },
    ru: {
      title: 'Пользовательское соглашение',
      description: 'Пользовательское соглашение SkinsHead: условия использования и ответственность.',
      kicker: `Сервис SkinsHead · ${SITE_URL}`,
      updated: `Дата актуальной редакции: ${DOCS_UPDATED_AT}`,
      intro: 'Настоящее Пользовательское соглашение (далее — «Соглашение») регулирует порядок использования онлайн-сервиса SkinsHead. Используя Сервис, включая просмотр сайта или авторизацию через Steam, Пользователь принимает условия Соглашения в полном объёме.',
      body: `
        <h2>1. Общие положения</h2>
        <p>1.1. Сервис предоставляется ${OPERATOR} на сайте ${SITE_URL}.</p>
        <p>1.2. В случае несогласия с условиями Соглашения Пользователь обязан прекратить использование Сервиса.</p>
        <p>1.3. Актуальная версия Соглашения всегда доступна по адресу <a href="${here}">${SITE_URL}${here}</a>.</p>
        <h2>2. Характер услуг</h2>
        <p>2.1. Сервис предоставляет цифровые услуги нематериального характера, включая:</p>
        <ul>
          <li>учёт и отображение портфеля скинов CS2 / инвентаря Steam;</li>
          <li>аналитику цен, P&amp;L, распределение, маркет и связанные инструменты сайта;</li>
          <li>трекинг топовых аккаунтов инвесторов;</li>
          <li>синхронизацию полного инвентаря, включая Хранилища, через расширение для браузера.</li>
        </ul>
        <p>2.2. Сервис не является финансовым советником, брокером, гарантом доходности или аффилированным лицом Valve / Steam / Counter-Strike.</p>
        <p>2.3. Цены предметов на сторонних площадках и в Steam могут отличаться от данных Сервиса; Пользователь самостоятельно принимает решения о сделках.</p>
        <h2>3. Доступ</h2>
        <p>3.1. Сервис предоставляется бесплатно. Все функции сайта доступны без оплаты.</p>
        <h2>4. Отказ от гарантий и ограничение ответственности</h2>
        <p>4.1. Сервис предоставляется на условиях «как есть» (AS IS).</p>
        <p>4.2. Администрация не гарантирует бесперебойную работу, достижение финансовой прибыли, точность всех рыночных котировок сторонних источников и соответствие Сервиса индивидуальным ожиданиям.</p>
        <p>4.3. Администрация не несёт ответственности за убытки, упущенную выгоду, действия третьих лиц, блокировки Steam-аккаунтов, изменения API/правил Valve и временные технические ограничения.</p>
        <h2>5. Законность использования</h2>
        <p>5.1. Пользователь обязуется использовать Сервис добросовестно и в рамках применимого законодательства, а также правил Steam.</p>
        <p>5.2. Запрещено использовать Сервис для мошенничества, обхода ограничений, вмешательства в работу инфраструктуры или передачи вредоносного ПО.</p>
        <h2>6. Интеллектуальная собственность</h2>
        <p>6.1. Дизайн, код, тексты, товарные обозначения SkinsHead и иные материалы Сервиса охраняются законом.</p>
        <p>6.2. Права на игровые предметы, названия и изображения Counter-Strike / Steam принадлежат соответствующим правообладателям.</p>
        <h2>7. Ограничение доступа</h2>
        <p>7.1. Администрация вправе приостановить или ограничить доступ при нарушении Соглашения, злоупотреблениях или требованиях закона.</p>
        <p>7.2. Ограничение доступа не освобождает от обязательств, возникших до его применения.</p>
        <h2>8. Конфиденциальность</h2>
        <p>8.1. Порядок обработки данных описан в <a href="${privacy}">Политике конфиденциальности</a>.</p>
        <h2>9. Изменение условий</h2>
        <p>9.1. Администрация вправе обновлять Соглашение. Продолжение использования Сервиса означает согласие с новой редакцией.</p>
        <h2>10. Контакты поддержки</h2>
        <p>10.1. По вопросам доступа и работы Сервиса: Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>.</p>
        <p>10.2. Страница поддержки: <a href="/support">${SITE_URL}/support</a>.</p>
        <p>Используя Сервис, Пользователь подтверждает, что ознакомился с настоящим Соглашением и принимает его условия.</p>
      `,
    },
    zh: {
      title: '使用条款',
      description: 'SkinsHead 使用条款：服务的使用方式和责任。',
      kicker: `SkinsHead · ${SITE_URL}`,
      updated: '更新日期：2026年10月10日',
      intro: '本使用条款（下称「条款」）规范 SkinsHead 在线服务的使用。使用服务，包括浏览网站或通过 Steam 登录，即表示您完整接受本条款。',
      body: `
        <h2>1. 总则</h2>
        <p>1.1. 服务由 SkinsHead 服务管理方在 ${SITE_URL} 提供。</p>
        <p>1.2. 如果您不同意本条款，必须停止使用服务。</p>
        <p>1.3. 当前条款始终位于 <a href="${here}">${SITE_URL}${here}</a>。</p>
        <h2>2. 服务性质</h2>
        <p>2.1. 服务提供无形的数字服务，包括：</p>
        <ul>
          <li>记录和展示 CS2 皮肤资产组合与 Steam 库存；</li>
          <li>价格分析、盈亏、分配、市场浏览以及网站的相关工具；</li>
          <li>跟踪顶尖投资者账户；</li>
          <li>通过浏览器扩展同步完整库存，包括仓库。</li>
        </ul>
        <p>2.2. 服务不是财务顾问、经纪商、收益保证人，也不是 Valve、Steam 或 Counter-Strike 的关联方。</p>
        <p>2.3. 第三方市场和 Steam 上的物品价格可能与服务中的数据不同。交易由您自行决定。</p>
        <h2>3. 访问</h2>
        <p>3.1. 服务免费提供。网站上的全部功能无需付款即可使用。</p>
        <h2>4. 免责与责任限制</h2>
        <p>4.1. 服务按「现状」提供。</p>
        <p>4.2. 管理方不保证不间断运行、财务收益、每一条第三方市场报价的准确性，或服务符合您的个人期望。</p>
        <p>4.3. 管理方不对损失、可得利益损失、第三方行为、Steam 账户限制、Valve 的 API 或规则变更，以及暂时的技术限制负责。</p>
        <h2>5. 合法使用</h2>
        <p>5.1. 您同意善意使用服务，并遵守适用法律以及 Steam 的规则。</p>
        <p>5.2. 不得将服务用于欺诈、绕过限制、干扰基础设施或传播恶意软件。</p>
        <h2>6. 知识产权</h2>
        <p>6.1. 服务的设计、代码、文字、SkinsHead 标识和其他材料受法律保护。</p>
        <p>6.2. Counter-Strike 和 Steam 的游戏物品、名称和图像的权利归各自权利人所有。</p>
        <h2>7. 限制访问</h2>
        <p>7.1. 如果违反本条款、存在滥用，或法律要求，管理方可以暂停或限制访问。</p>
        <p>7.2. 限制访问不取消在此之前已经产生的义务。</p>
        <h2>8. 隐私</h2>
        <p>8.1. 数据处理方式见<a href="${privacy}">隐私政策</a>。</p>
        <h2>9. 变更</h2>
        <p>9.1. 管理方可以更新本条款。继续使用服务即表示您接受新版本。</p>
        <h2>10. 支持</h2>
        <p>10.1. 访问和服务运行问题：Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>。</p>
        <p>10.2. 支持页面：<a href="/support">${SITE_URL}/support</a>。</p>
        <p>使用服务即表示您确认已阅读并接受本条款。</p>
      `,
    },
    'zh-TW': {
      title: '使用條款',
      description: 'SkinsHead 使用條款：服務的使用方式和責任。',
      kicker: `SkinsHead · ${SITE_URL}`,
      updated: '更新日期：2026年10月10日',
      intro: '本使用條款（下稱「條款」）規範 SkinsHead 線上服務的使用。使用服務，包括瀏覽網站或透過 Steam 登入，即表示您完整接受本條款。',
      body: `
        <h2>1. 總則</h2>
        <p>1.1. 服務由 SkinsHead 服務管理方在 ${SITE_URL} 提供。</p>
        <p>1.2. 如果您不同意本條款，必須停止使用服務。</p>
        <p>1.3. 目前條款始終位於 <a href="${here}">${SITE_URL}${here}</a>。</p>
        <h2>2. 服務性質</h2>
        <p>2.1. 服務提供無形的數位服務，包括：</p>
        <ul>
          <li>記錄和展示 CS2 皮膚資產組合與 Steam 庫存；</li>
          <li>價格分析、盈虧、分配、市場瀏覽以及網站的相關工具；</li>
          <li>追蹤頂尖投資者帳戶；</li>
          <li>透過瀏覽器擴充同步完整庫存，包括倉庫。</li>
        </ul>
        <p>2.2. 服務不是財務顧問、經紀商、收益保證人，也不是 Valve、Steam 或 Counter-Strike 的關係企業。</p>
        <p>2.3. 第三方市場和 Steam 上的物品價格可能與服務中的資料不同。交易由您自行決定。</p>
        <h2>3. 存取</h2>
        <p>3.1. 服務免費提供。網站上的全部功能無需付款即可使用。</p>
        <h2>4. 免責與責任限制</h2>
        <p>4.1. 服務按「現況」提供。</p>
        <p>4.2. 管理方不保證不間斷運行、財務收益、每一條第三方市場報價的準確性，或服務符合您的個人期望。</p>
        <p>4.3. 管理方不對損失、可得利益損失、第三方行為、Steam 帳戶限制、Valve 的 API 或規則變更，以及暫時的技術限制負責。</p>
        <h2>5. 合法使用</h2>
        <p>5.1. 您同意善意使用服務，並遵守適用法律以及 Steam 的規則。</p>
        <p>5.2. 不得將服務用於詐欺、繞過限制、干擾基礎設施或散布惡意軟體。</p>
        <h2>6. 智慧財產權</h2>
        <p>6.1. 服務的設計、程式碼、文字、SkinsHead 標識和其他材料受法律保護。</p>
        <p>6.2. Counter-Strike 和 Steam 的遊戲物品、名稱和圖像的權利歸各自權利人所有。</p>
        <h2>7. 限制存取</h2>
        <p>7.1. 如果違反本條款、存在濫用，或法律要求，管理方可以暫停或限制存取。</p>
        <p>7.2. 限制存取不取消在此之前已經產生的義務。</p>
        <h2>8. 隱私</h2>
        <p>8.1. 資料處理方式見<a href="${privacy}">隱私權政策</a>。</p>
        <h2>9. 變更</h2>
        <p>9.1. 管理方可以更新本條款。繼續使用服務即表示您接受新版本。</p>
        <h2>10. 支援</h2>
        <p>10.1. 存取和服務運行問題：Telegram <a href="${SUPPORT_TELEGRAM_URL}">${SUPPORT_TELEGRAM}</a>。</p>
        <p>10.2. 支援頁面：<a href="/support">${SITE_URL}/support</a>。</p>
        <p>使用服務即表示您確認已閱讀並接受本條款。</p>
      `,
    },
  }[lang];
  return renderLegalDoc(lang, 'terms', copy);
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
      <li>работа портфеля и расширения для браузера;</li>
      <li>удаление данных или вопросы по конфиденциальности.</li>
    </ul>

    <h2>Как быстро мы отвечаем</h2>
    <p>Обычно отвечаем в течение 24 часов в рабочие дни. Укажите SteamID или логин Steam.</p>

    <h2>Документы</h2>
    <ul>
      <li><a href="/privacy">Политика конфиденциальности</a></li>
      <li><a href="/terms">Пользовательское соглашение</a></li>
    </ul>
  `;

  return renderShell({
    title: 'Поддержка',
    description: 'Контакты поддержки SkinsHead: Telegram @GhostOfSecretum.',
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
