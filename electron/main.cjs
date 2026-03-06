// electron/main.js — full rewrite
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { LinkBridge } = require('./link.cjs');

let mainWindow;
const linkBridge = new LinkBridge();
let resizeTimeout;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 300,
    minWidth: 150,
    minHeight: 150,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true);

  // Enforce square aspect ratio on resize (debounced)
  mainWindow.on('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const [width] = mainWindow.getSize();
      mainWindow.setSize(width, width);
    }, 50);
  });
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

ipcMain.on('link-set-beat-phase', (event, phase) => {
  linkBridge.setBeatPhase(phase);
});

ipcMain.on('link-resync', () => {
  linkBridge.resync();
});

ipcMain.handle('link-status', () => {
  return linkBridge.getStatus();
});

ipcMain.on('set-always-on-top', (event, enabled) => {
  mainWindow.setAlwaysOnTop(enabled, enabled ? 'screen-saver' : undefined);
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});
