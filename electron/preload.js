const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flayshlizer', {
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  setLinkTempo: (bpm) => ipcRenderer.send('link-set-tempo', bpm),
  getLinkStatus: () => ipcRenderer.invoke('link-status'),
  closeWindow: () => ipcRenderer.send('close-window'),
});
