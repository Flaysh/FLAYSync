const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flaysync', {
  setLinkTempo: (bpm) => ipcRenderer.send('link-set-tempo', bpm),
  setLinkBeatPhase: (phase) => ipcRenderer.send('link-set-beat-phase', phase),
  getLinkStatus: () => ipcRenderer.invoke('link-status'),
  resyncBeat: () => ipcRenderer.send('link-resync'),
  closeWindow: () => ipcRenderer.send('close-window'),
  setAlwaysOnTop: (enabled) => ipcRenderer.send('set-always-on-top', enabled),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, version) => callback(version)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_, percent) => callback(percent)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
  downloadUpdate: () => ipcRenderer.send('update-download'),
  installUpdate: () => ipcRenderer.send('update-install'),
});
