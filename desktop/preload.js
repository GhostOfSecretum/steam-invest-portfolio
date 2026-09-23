const { contextBridge, ipcRenderer } = require('electron');

const bundle = ipcRenderer.sendSync('get-i18n-sync') || {};
const LANGS = bundle.langs || ['en', 'ru', 'zh', 'zh-TW'];
const LANG_LABELS = bundle.labels || { en: 'EN', ru: 'RU', zh: '简', 'zh-TW': '繁' };
const DEFAULT_LANG = bundle.defaultLang || 'en';
const STRINGS = bundle.strings || { en: {} };

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

contextBridge.exposeInMainWorld('i18n', {
  langs: cloneJson(LANGS, ['en', 'ru', 'zh', 'zh-TW']),
  labels: cloneJson(LANG_LABELS, { en: 'EN', ru: 'RU', zh: '简', 'zh-TW': '繁' }),
  defaultLang: DEFAULT_LANG,
  strings: cloneJson(STRINGS, { en: {} }),
});

contextBridge.exposeInMainWorld('desktop', {
  getState: () => ipcRenderer.invoke('get-state'),
  pairDevice: (args) => ipcRenderer.invoke('pair-device', args),
  openSteamLogin: () => ipcRenderer.invoke('open-steam-login'),
  syncInventory: () => ipcRenderer.invoke('sync-inventory'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  gcGetStatus: () => ipcRenderer.invoke('gc-get-status'),
  gcStartQrLogin: () => ipcRenderer.invoke('gc-start-qr-login'),
  gcDisconnect: () => ipcRenderer.invoke('gc-disconnect'),
  openDashboard: () => ipcRenderer.invoke('open-dashboard'),
  getLang: () => ipcRenderer.invoke('get-lang'),
  setLang: (lang) => ipcRenderer.invoke('set-lang', lang),
  getI18n: () => ipcRenderer.invoke('get-i18n'),
});
