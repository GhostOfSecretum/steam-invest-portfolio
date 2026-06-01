const { contextBridge, ipcRenderer } = require('electron');

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
});
