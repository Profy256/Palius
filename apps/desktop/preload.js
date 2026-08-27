const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('palius', {
  platform: process.platform,
  // Encrypted key/value store backed by Electron safeStorage. Returns promises.
  secure: {
    get: (key) => ipcRenderer.invoke('secure:get', key),
    set: (key, value) => ipcRenderer.invoke('secure:set', key, value),
    delete: (key) => ipcRenderer.invoke('secure:delete', key),
  },
});
