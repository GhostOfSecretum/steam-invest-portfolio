const { contextBridge, ipcRenderer } = require('electron');

const bundle = ipcRenderer.sendSync('get-i18n-sync') || {};
const LANGS = bundle.langs || ['en', 'ru', 'zh', 'zh-TW'];
const LANG_LABELS = bundle.labels || { en: 'EN', ru: 'RU', zh: '简', 'zh-TW': '繁' };
const DEFAULT_LANG = bundle.defaultLang || 'en';
const STRINGS = bundle.strings || { en: {} };

function normalizeLang(lang) {
  return LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

function htmlLangFor(lang) {
  if (lang === 'ru') return 'ru';
  if (lang === 'zh') return 'zh-CN';
  if (lang === 'zh-TW') return 'zh-TW';
  return 'en';
}

function t(lang, key, vars) {
  const dict = STRINGS[normalizeLang(lang)] || STRINGS.en || {};
  let value = dict[key];
  if (value == null) value = (STRINGS.en || {})[key];
  if (value == null) return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
  ));
}

contextBridge.exposeInMainWorld('i18n', {
  langs: LANGS,
  labels: LANG_LABELS,
  defaultLang: DEFAULT_LANG,
  t,
  normalize: normalizeLang,
  htmlLangFor,
});

contextBridge.exposeInMainWorld('gcQr', {
  getLang: () => ipcRenderer.invoke('get-lang'),
  onLangChanged: (handler) => {
    ipcRenderer.on('lang-changed', (_event, nextLang) => handler(nextLang));
  },
  onQrImage: (handler) => {
    ipcRenderer.on('gc-qr-image', (_event, dataUrl) => handler(dataUrl));
  },
  onLoginSuccess: (handler) => {
    ipcRenderer.on('gc-login-success', (_event, payload) => handler(payload));
  },
  onLoginError: (handler) => {
    ipcRenderer.on('gc-login-error', (_event, message) => handler(message));
  },
});
