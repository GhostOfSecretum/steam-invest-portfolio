const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getState: () => ipcRenderer.invoke('get-state'),
  pairDevice: (args) => ipcRenderer.invoke('pair-device', args),
  openSteamLogin: () => ipcRenderer.invoke('open-steam-login'),
  syncInventory: () => ipcRenderer.invoke('sync-inventory'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
});
