# Cross-Platform Installer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Package FLAYSync as download-and-double-click installers for Mac (.dmg) and Windows (.exe) with auto-update and CI/CD.

**Architecture:** Add electron-builder for packaging, electron-updater for in-app updates, and a GitHub Actions workflow that builds both platforms on git tag push. pnpm replaces npm.

**Tech Stack:** electron-builder, electron-updater, GitHub Actions, pnpm

---

### Task 1: Migrate from npm to pnpm

**Files:**
- Delete: `package-lock.json`
- Create: `pnpm-lock.yaml` (auto-generated)
- Modify: `package.json`

**Step 1: Delete npm lock file**

Run: `rm package-lock.json`

**Step 2: Install pnpm if not present**

Run: `npm install -g pnpm`

**Step 3: Install dependencies with pnpm**

Run: `pnpm install`
Expected: `pnpm-lock.yaml` created, `node_modules/` rebuilt

**Step 4: Verify the app still runs**

Run: `pnpm start`
Expected: FLAYSync launches normally

**Step 5: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git rm package-lock.json
git add pnpm-lock.yaml package.json
git commit -m "chore: migrate from npm to pnpm"
```

---

### Task 2: Generate app icons

**Files:**
- Create: `assets/icon.icns` (Mac)
- Create: `assets/icon.ico` (Windows)
- Create: `assets/icon.png` (1024x1024 source for electron-builder)

**Step 1: Install icon generation tool**

Run: `pnpm add -D electron-icon-builder`

**Step 2: Generate icons from logo**

The source image must be a 1024x1024 PNG. If `assets/flaysh-logo.png` is not 1024x1024, resize it first:

Run: `sips -z 1024 1024 assets/flaysh-logo.png --out assets/icon.png`

Then generate platform icons:

Run: `npx electron-icon-builder --input=assets/icon.png --output=assets/`

Expected: Creates `assets/icons/mac/icon.icns` and `assets/icons/win/icon.ico`

**Step 3: Move icons to expected locations**

Run:
```bash
mv assets/icons/mac/icon.icns assets/icon.icns
mv assets/icons/win/icon.ico assets/icon.ico
rm -rf assets/icons
```

**Step 4: Commit**

```bash
git add assets/icon.icns assets/icon.ico assets/icon.png
git commit -m "feat: add Mac and Windows app icons"
```

---

### Task 3: Add electron-builder configuration

**Files:**
- Modify: `package.json`

**Step 1: Install electron-builder**

Run: `pnpm add -D electron-builder`

**Step 2: Add build config to package.json**

Add the following `"build"` key to `package.json`:

```json
{
  "build": {
    "appId": "com.flaysh.flaysync",
    "productName": "FLAYSync",
    "directories": {
      "output": "dist"
    },
    "files": [
      "electron/**/*",
      "src/**/*",
      "assets/**/*",
      "node_modules/**/*"
    ],
    "mac": {
      "icon": "assets/icon.icns",
      "target": [
        { "target": "dmg", "arch": ["x64", "arm64"] },
        { "target": "zip", "arch": ["x64", "arm64"] }
      ],
      "category": "public.app-category.music"
    },
    "win": {
      "icon": "assets/icon.ico",
      "target": [
        { "target": "nsis", "arch": ["x64"] }
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToDir": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "publish": {
      "provider": "github",
      "owner": "flaysh",
      "repo": "FLAYSync"
    }
  }
}
```

**Step 3: Add build scripts to package.json**

Add to `"scripts"`:

```json
{
  "build": "electron-builder",
  "build:mac": "electron-builder --mac",
  "build:win": "electron-builder --win"
}
```

**Step 4: Update .gitignore**

Add `dist/` if not already present (it is), and add `out/`.

**Step 5: Test build locally (Mac only)**

Run: `pnpm build:mac`
Expected: Creates `.dmg` and `.zip` in `dist/` directory

**Step 6: Commit**

```bash
git add package.json .gitignore
git commit -m "feat: add electron-builder config for Mac and Windows builds"
```

---

### Task 4: Add auto-update support

**Files:**
- Modify: `package.json` (add electron-updater dependency)
- Modify: `electron/main.cjs` (add update logic)
- Modify: `electron/preload.cjs` (expose update events)
- Modify: `src/app.js` (show update notification)
- Modify: `src/styles.css` (update notification styles)
- Modify: `src/index.html` (update notification element)

**Step 1: Install electron-updater**

Run: `pnpm add electron-updater`

**Step 2: Add auto-update logic to electron/main.cjs**

Add at the top of `electron/main.cjs`:

```javascript
const { autoUpdater } = require('electron-updater');
```

Add after `linkBridge.start();` inside `app.whenReady().then(...)`:

```javascript
  // Auto-update
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', info.version);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update-progress', progress.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
  });

  autoUpdater.checkForUpdates().catch(() => {});
```

Add new IPC handler:

```javascript
ipcMain.on('update-download', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('update-install', () => {
  autoUpdater.quitAndInstall();
});
```

**Step 3: Expose update events in electron/preload.cjs**

Add to the `contextBridge.exposeInMainWorld('flaysync', { ... })` object:

```javascript
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, version) => callback(version)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_, percent) => callback(percent)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
  downloadUpdate: () => ipcRenderer.send('update-download'),
  installUpdate: () => ipcRenderer.send('update-install'),
```

**Step 4: Add update notification element to src/index.html**

Add right after the opening `<div class="container" id="mainUI" ...>` tag (before the close-btn):

```html
    <!-- Update Notification -->
    <div class="update-bar" id="updateBar" style="display: none;">
      <span id="updateText"></span>
      <button id="updateAction"></button>
    </div>
```

**Step 5: Add update notification styles to src/styles.css**

Add at the end of the file:

```css
/* Update notification */
.update-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: rgba(0, 212, 255, 0.15);
  border-bottom: 1px solid rgba(0, 212, 255, 0.3);
  font-size: 10px;
  color: #0df;
  z-index: 100;
}

.update-bar button {
  background: rgba(0, 212, 255, 0.2);
  border: 1px solid rgba(0, 212, 255, 0.4);
  color: #0df;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 9px;
  text-transform: uppercase;
}

.update-bar button:hover {
  background: rgba(0, 212, 255, 0.4);
}
```

**Step 6: Add update notification logic to src/app.js**

Add at the end of the file:

```javascript
// --- Auto Update ---
if (window.flaysync && window.flaysync.onUpdateAvailable) {
  const updateBar = document.getElementById('updateBar');
  const updateText = document.getElementById('updateText');
  const updateAction = document.getElementById('updateAction');

  window.flaysync.onUpdateAvailable((version) => {
    updateBar.style.display = 'flex';
    updateText.textContent = `v${version} available`;
    updateAction.textContent = 'Download';
    updateAction.onclick = () => {
      window.flaysync.downloadUpdate();
      updateAction.disabled = true;
      updateText.textContent = 'Downloading...';
    };
  });

  window.flaysync.onUpdateProgress((percent) => {
    updateText.textContent = `Downloading... ${Math.round(percent)}%`;
  });

  window.flaysync.onUpdateDownloaded(() => {
    updateText.textContent = 'Update ready';
    updateAction.textContent = 'Restart';
    updateAction.disabled = false;
    updateAction.onclick = () => {
      window.flaysync.installUpdate();
    };
  });
}
```

**Step 7: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (auto-update code is UI-only, no unit tests needed)

**Step 8: Commit**

```bash
git add electron/main.cjs electron/preload.cjs src/app.js src/styles.css src/index.html package.json
git commit -m "feat: add auto-update with user prompt via electron-updater"
```

---

### Task 5: Create GitHub Actions CI/CD workflow

**Files:**
- Create: `.github/workflows/build.yml`

**Step 1: Create workflow directory**

Run: `mkdir -p .github/workflows`

**Step 2: Create the workflow file**

Create `.github/workflows/build.yml`:

```yaml
name: Build & Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            build_cmd: pnpm build:mac
          - os: windows-latest
            build_cmd: pnpm build:win

    runs-on: ${{ matrix.os }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm test

      - name: Build
        run: ${{ matrix.build_cmd }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist-${{ matrix.os }}
          path: |
            dist/*.dmg
            dist/*.zip
            dist/*.exe
            dist/*.yml

  release:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          draft: true
          files: artifacts/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Step 3: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: add GitHub Actions workflow for Mac and Windows builds"
```

---

### Task 6: Update .gitignore and README

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

**Step 1: Update .gitignore**

Add these entries:

```
out/
*.dmg
*.exe
*.zip
```

**Step 2: Update README.md install section**

Replace the current Install and Requirements sections with:

```markdown
## Install

### Download (recommended)

Download the latest release for your platform:

- **Mac:** [FLAYSync.dmg](https://github.com/flaysh/FLAYSync/releases/latest)
- **Windows:** [FLAYSync-Setup.exe](https://github.com/flaysh/FLAYSync/releases/latest)

### Build from source

Requires Node.js 18+ and pnpm.

```bash
git clone https://github.com/flaysh/FLAYSync.git
cd FLAYSync
pnpm install
pnpm start
```
```

Also update Requirements to indicate Mac and Windows support:

```markdown
## Requirements

- **macOS** 10.15+ or **Windows** 10+
- Audio input device (audio interface recommended for best results)
```

**Step 3: Commit**

```bash
git add .gitignore README.md
git commit -m "docs: update README with download links and Windows support"
```

---

### Task 7: Test full build and verify

**Step 1: Test Mac build locally**

Run: `pnpm build:mac`
Expected: `dist/` contains `.dmg` and `.zip` files

**Step 2: Open the DMG and test the app**

Run: `open dist/*.dmg`
Expected: FLAYSync app launches, audio works, UI renders correctly

**Step 3: Verify auto-update code doesn't crash in dev mode**

Run: `pnpm start`
Expected: App starts normally (auto-updater silently fails in dev mode, no crash)

**Step 4: Commit any fixes if needed**

**Step 5: Tag and push to trigger CI**

```bash
git tag v0.5.0
git push origin main --tags
```

Expected: GitHub Actions builds Mac + Windows, creates draft release with installers attached.
