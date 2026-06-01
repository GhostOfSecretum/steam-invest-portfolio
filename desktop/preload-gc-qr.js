const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gcQr', {
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
