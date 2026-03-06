const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { LinkBridge } = require('./link');

let mainWindow;
const linkBridge = new LinkBridge();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 300,
    minWidth: 200,
    minHeight: 200,
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

  // Enforce square aspect ratio on resize
  mainWindow.on('resize', () => {
    const [width] = mainWindow.getSize();
    mainWindow.setSize(width, width);
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
