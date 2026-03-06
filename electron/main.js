const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { LinkBridge } = require('./link');

let mainWindow;
const linkBridge = new LinkBridge();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 180,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true);
}

app.whenReady().then(() => {
  createWindow();
  linkBridge.start();
});

app.on('window-all-closed', () => {
  linkBridge.stop();
  app.quit();
});

ipcMain.on('close-window', () => {
  mainWindow.close();
});

ipcMain.on('link-set-tempo', (event, bpm) => {
  linkBridge.setTempo(bpm);
});

ipcMain.handle('link-status', () => {
  return linkBridge.getStatus();
});
