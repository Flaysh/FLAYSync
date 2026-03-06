# FLAYSync v0.3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a production-ready BPM detection overlay for VJs with accurate audio recognition, blob contour visualizer, and polished Cyberpunk Neuro Y2K UI.

**Architecture:** Electron + vanilla JS + Meyda + abletonlink-addon + Canvas 2D. Audio pipeline: Meyda (RMS, energy) + custom spectral flux -> weighted onset detection -> autocorrelation BPM estimation -> Ableton Link. No new dependencies.

**Tech Stack:** Electron 40, Meyda 5.6.3, abletonlink-addon, Canvas 2D, ES modules (browser), CJS (Electron main)

**CRITICAL BUG GUARD:** Meyda v5.6.3 `spectralFlux` feature extractor throws `TypeError` on first frame because `previousSignal` is undefined. NEVER add `spectralFlux` to Meyda's `featureExtractors` array. Always use the custom `_computeFlux()` method on AudioEngine instead.

---

## Task 1: Production hardening — clean up electron/main.js

**Files:**
- Modify: `electron/main.js`

**Step 1: Remove devtools and debounce resize**

```js
// electron/main.js — full rewrite
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { LinkBridge } = require('./link');

let mainWindow;
const linkBridge = new LinkBridge();
let resizeTimeout;

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
```

**Step 2: Run the app to verify it launches**

Run: `npm start`
Expected: App launches without DevTools opening. Resize is smooth (no flicker).

**Step 3: Commit**

```bash
git add electron/main.js
git commit -m "fix: remove devtools, debounce resize, add always-on-top IPC"
```

---

## Task 2: Add always-on-top to preload bridge

**Files:**
- Modify: `electron/preload.js`

**Step 1: Add setAlwaysOnTop to the bridge**

```js
// electron/preload.js — full rewrite
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flaysync', {
  setLinkTempo: (bpm) => ipcRenderer.send('link-set-tempo', bpm),
  setLinkBeatPhase: (phase) => ipcRenderer.send('link-set-beat-phase', phase),
  getLinkStatus: () => ipcRenderer.invoke('link-status'),
  resyncBeat: () => ipcRenderer.send('link-resync'),
  closeWindow: () => ipcRenderer.send('close-window'),
  setAlwaysOnTop: (enabled) => ipcRenderer.send('set-always-on-top', enabled),
});
```

**Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat: add setAlwaysOnTop to preload bridge"
```

---

## Task 3: Improve onset detection — weighted combined score

**Files:**
- Modify: `src/onset-detector.js`
- Modify: `tests/onset-detector.test.js`

**Step 1: Write tests for weighted detection**

Update `tests/onset-detector.test.js` — replace the OR-logic tests with combined-score tests:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { OnsetDetector } = require('../src/onset-detector.js');

describe('OnsetDetector', () => {
  function warmUp(detector, count = 10) {
    for (let i = 0; i < count; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.01 }, 1000 + i * 12);
    }
  }

  it('detects onset when both flux and energy spike', () => {
    const detector = new OnsetDetector();
    warmUp(detector);
    const result = detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1200);
    assert.strictEqual(result, true);
  });

  it('detects onset from strong energy spike alone', () => {
    const detector = new OnsetDetector();
    warmUp(detector);
    // Very high energy, low flux — combined score should still exceed threshold
    const result = detector.process({ spectralFlux: 0.01, energy: 0.2, rms: 0.1 }, 1200);
    assert.strictEqual(result, true);
  });

  it('detects onset from strong flux spike alone', () => {
    const detector = new OnsetDetector();
    warmUp(detector);
    // Very high flux, low energy — combined score should still exceed threshold
    const result = detector.process({ spectralFlux: 0.8, energy: 0.001, rms: 0.01 }, 1200);
    assert.strictEqual(result, true);
  });

  it('rejects weak signals that only slightly exceed one threshold', () => {
    const detector = new OnsetDetector();
    warmUp(detector);
    // Moderate flux, low energy — combined score not high enough
    const result = detector.process({ spectralFlux: 0.02, energy: 0.002, rms: 0.01 }, 1200);
    assert.strictEqual(result, false);
  });

  it('respects minimum interval between onsets', () => {
    const detector = new OnsetDetector({ minInterval: 333 });
    warmUp(detector);
    detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1200);
    const result = detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1300);
    assert.strictEqual(result, false);
  });

  it('ignores silence (low rms)', () => {
    const detector = new OnsetDetector();
    warmUp(detector, 10);
    const result = detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.001 }, 1200);
    assert.strictEqual(result, false);
  });

  it('resets clears all state', () => {
    const detector = new OnsetDetector();
    warmUp(detector);
    detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1200);
    detector.reset();
    assert.strictEqual(detector.fluxHistory.length, 0);
    assert.strictEqual(detector.energyHistory.length, 0);
    assert.strictEqual(detector.lastOnsetTime, 0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: Some tests fail (new "rejects weak signals" test fails because OR logic is too permissive).

**Step 3: Implement weighted combined score**

```js
// src/onset-detector.js — full rewrite
class OnsetDetector {
  constructor(options = {}) {
    this.minInterval = options.minInterval || 180;
    this.windowSize = options.windowSize || 43;
    this.thresholdMultiplier = options.thresholdMultiplier || 1.5;
    this.minRms = options.minRms || 0.005;

    this.fluxHistory = [];
    this.energyHistory = [];
    this.lastOnsetTime = 0;
  }

  process(features, timestamp) {
    const flux = features.spectralFlux || 0;
    const energy = features.energy || 0;
    const rms = features.rms || 0;

    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.windowSize) this.energyHistory.shift();

    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.windowSize) this.fluxHistory.shift();

    if (this.energyHistory.length < 8) return false;
    if (timestamp - this.lastOnsetTime < this.minInterval) return false;
    if (rms < this.minRms) return false;

    const meanEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const meanFlux = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;

    // Normalize relative to adaptive mean (how many times above average)
    const normEnergy = meanEnergy > 0 ? energy / meanEnergy : 0;
    const normFlux = meanFlux > 0 ? flux / meanFlux : 0;

    // Weighted combined score
    const score = 0.6 * normEnergy + 0.4 * normFlux;

    if (score > this.thresholdMultiplier) {
      this.lastOnsetTime = timestamp;
      return true;
    }

    return false;
  }

  reset() {
    this.fluxHistory = [];
    this.energyHistory = [];
    this.lastOnsetTime = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OnsetDetector };
}
```

Note: Keep the CJS shim for now so tests work. We remove it in Task 8.

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All onset-detector tests PASS.

**Step 5: Commit**

```bash
git add src/onset-detector.js tests/onset-detector.test.js
git commit -m "feat: weighted combined score for onset detection, reduces false positives"
```

---

## Task 4: Improve BPM detection — autocorrelation + phase correction

**Files:**
- Modify: `src/bpm-detector.js`
- Modify: `tests/bpm-detector.test.js`

**Step 1: Add autocorrelation test**

Append to `tests/bpm-detector.test.js`:

```js
  describe('autocorrelation', () => {
    it('detects 128 BPM from slightly noisy onsets', () => {
      const detector = new BpmDetector();
      const intervalMs = 60000 / 128;
      const now = 1000;
      for (let i = 0; i < 16; i++) {
        // Add jitter of +/- 15ms
        const jitter = (i % 3 - 1) * 15;
        detector.registerOnset(now + i * intervalMs + jitter);
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
      assert.ok(result.bpm >= 126 && result.bpm <= 130, `Expected ~128, got ${result.bpm}`);
      assert.ok(result.confidence > 0.5, `Expected decent confidence, got ${result.confidence}`);
    });

    it('handles mixed-in ghost onsets gracefully', () => {
      const detector = new BpmDetector();
      const intervalMs = 500; // 120 BPM
      const now = 1000;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(now + i * intervalMs);
        // Ghost onset at half-beat (should not confuse detector into 240 BPM)
        if (i % 3 === 0) {
          detector.registerOnset(now + i * intervalMs + 250);
        }
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
      // Should detect 120 not 240
      assert.ok(result.bpm >= 115 && result.bpm <= 125, `Expected ~120, got ${result.bpm}`);
    });
  });

  describe('phase correction', () => {
    it('does not jitter phase on small timing errors', () => {
      const detector = new BpmDetector();
      const intervalMs = 500;
      const now = 1000;
      for (let i = 0; i < 8; i++) {
        detector.registerOnset(now + i * intervalMs);
      }
      const phaseBefore = detector.getPhase(now + 8 * intervalMs);
      // Register onset 5ms early (within dead zone)
      detector.registerOnset(now + 8 * intervalMs - 5);
      const phaseAfter = detector.getPhase(now + 8 * intervalMs);
      // Phase should not have changed (5ms < 10ms dead zone)
      assert.ok(Math.abs(phaseAfter - phaseBefore) < 0.05,
        `Phase jittered: ${phaseBefore} -> ${phaseAfter}`);
    });
  });
```

**Step 2: Run tests to verify new tests fail**

Run: `npm test`
Expected: New autocorrelation and phase dead-zone tests may fail.

**Step 3: Implement autocorrelation and phase improvements**

```js
// src/bpm-detector.js — full rewrite
class BpmDetector {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 10000;
    this.minBpm = options.minBpm || 60;
    this.maxBpm = options.maxBpm || 200;
    this.onsets = [];
    this._lockedBpm = null;
    this._lockTolerance = 0.08;
    this._jumpCount = 0;
    this._jumpTarget = null;
    this._jumpThreshold = 2;
    this._phaseOrigin = null;
  }

  registerOnset(timestampMs) {
    this.onsets.push(timestampMs);
    const cutoff = timestampMs - this.windowSize;
    this.onsets = this.onsets.filter(t => t >= cutoff);

    if (this._phaseOrigin === null && this.onsets.length >= 1) {
      this._phaseOrigin = timestampMs;
    }

    // Nudge phase with dead zone
    if (this._lockedBpm !== null && this._phaseOrigin !== null) {
      const beatMs = 60000 / this._lockedBpm;
      const expected = this._nearestBeatTime(timestampMs, beatMs);
      const error = timestampMs - expected;
      // Dead zone: skip nudge for errors under 10ms
      if (Math.abs(error) > 10) {
        this._phaseOrigin += error * 0.1;
      }
    }
  }

  _nearestBeatTime(timestamp, beatMs) {
    if (this._phaseOrigin === null) return timestamp;
    const elapsed = timestamp - this._phaseOrigin;
    const beats = Math.round(elapsed / beatMs);
    return this._phaseOrigin + beats * beatMs;
  }

  getBpm() {
    if (this.onsets.length < 4) {
      return { bpm: null, confidence: 0 };
    }

    const intervals = [];
    for (let i = 1; i < this.onsets.length; i++) {
      intervals.push(this.onsets[i] - this.onsets[i - 1]);
    }

    const minInterval = 60000 / this.maxBpm;
    const maxInterval = 60000 / this.minBpm;
    const validIntervals = intervals.filter(
      iv => iv >= minInterval && iv <= maxInterval
    );

    if (validIntervals.length < 3) {
      return { bpm: this._lockedBpm, confidence: this._lockedBpm ? 0.3 : 0 };
    }

    // Try autocorrelation first
    const autoResult = this._autocorrelate(validIntervals, minInterval, maxInterval);

    // Fallback to median
    const sorted = [...validIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const medianBpm = 60000 / median;

    // Use autocorrelation if it has decent strength, else median
    let rawBpm;
    if (autoResult && autoResult.strength > 0.4) {
      rawBpm = autoResult.bpm;
    } else {
      rawBpm = medianBpm;
    }

    const snapped = Math.round(rawBpm * 2) / 2;

    // Confidence from interval consistency
    const mean = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
    const variance = validIntervals.reduce((sum, iv) => sum + (iv - mean) ** 2, 0) / validIntervals.length;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = stdDev / mean;
    const confidence = Math.max(0, Math.min(1, 1 - coeffOfVariation * 3));

    const bpm = this._smooth(snapped, confidence);

    if (confidence > 0.5) {
      this._lockedBpm = bpm;
    }

    return { bpm, confidence };
  }

  _autocorrelate(intervals, minInterval, maxInterval) {
    // Build a histogram of intervals quantized to 5ms bins
    const binSize = 5;
    const bins = {};
    for (const iv of intervals) {
      const bin = Math.round(iv / binSize) * binSize;
      bins[bin] = (bins[bin] || 0) + 1;
    }

    // Find the bin with the most hits within valid range
    let bestBin = null;
    let bestCount = 0;
    for (const [bin, count] of Object.entries(bins)) {
      const binMs = Number(bin);
      if (binMs >= minInterval && binMs <= maxInterval && count > bestCount) {
        bestCount = count;
        bestBin = binMs;
      }
    }

    if (bestBin === null || bestCount < 3) return null;

    // Refine: average all intervals within +/- 1 bin of the peak
    const tolerance = binSize * 2;
    const nearby = intervals.filter(iv => Math.abs(iv - bestBin) <= tolerance);
    const refined = nearby.reduce((a, b) => a + b, 0) / nearby.length;

    return {
      bpm: 60000 / refined,
      strength: bestCount / intervals.length,
    };
  }

  _smooth(newBpm, confidence) {
    if (this._lockedBpm === null || confidence < 0.4) {
      return newBpm;
    }

    const diff = Math.abs(newBpm - this._lockedBpm) / this._lockedBpm;

    if (diff <= this._lockTolerance) {
      this._jumpCount = 0;
      this._jumpTarget = null;
      return newBpm;
    }

    if (this._jumpTarget !== null && Math.abs(newBpm - this._jumpTarget) / this._jumpTarget <= 0.02) {
      this._jumpCount++;
      if (this._jumpCount >= this._jumpThreshold) {
        this._jumpCount = 0;
        this._jumpTarget = null;
        this._phaseOrigin = null;
        return newBpm;
      }
    } else {
      this._jumpCount = 1;
      this._jumpTarget = newBpm;
    }

    return this._lockedBpm;
  }

  getPhase(timestamp) {
    if (this._lockedBpm === null || this._phaseOrigin === null) {
      return 0;
    }
    const beatMs = 60000 / this._lockedBpm;
    const elapsed = timestamp - this._phaseOrigin;
    const beats = elapsed / beatMs;
    return ((beats % 4) + 4) % 4;
  }

  getBeatIndex(timestamp) {
    return Math.floor(this.getPhase(timestamp));
  }

  resync(timestamp) {
    this._phaseOrigin = timestamp || Date.now();
  }

  reset() {
    this.onsets = [];
    this._lockedBpm = null;
    this._jumpCount = 0;
    this._jumpTarget = null;
    this._phaseOrigin = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BpmDetector };
}
```

**Step 4: Run all tests**

Run: `npm test`
Expected: ALL tests pass (bpm-detector, onset-detector, tap-tempo).

**Step 5: Commit**

```bash
git add src/bpm-detector.js tests/bpm-detector.test.js
git commit -m "feat: autocorrelation BPM detection, phase dead zone, tighter nudge"
```

---

## Task 5: Improve audio engine — higher FFT, cleanup

**Files:**
- Modify: `src/audio.js`

**Step 1: Increase FFT and clean up**

```js
// src/audio.js — full rewrite
export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyserNode = null;
    this.source = null;
    this.stream = null;
    this.meydaAnalyzer = null;
    this.onFeatures = null;
    this._prevSpectrum = null;
  }

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  async start(deviceId = null, bufferSize = 1024) {
    const constraints = {
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.audioContext = new AudioContext({ sampleRate: 44100 });
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // Higher FFT for better frequency resolution in flux calculation
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.source.connect(this.analyserNode);

    // Meyda for RMS + energy only.
    // DO NOT add 'spectralFlux' — Meyda v5.6.3 throws TypeError on first frame.
    if (typeof Meyda !== 'undefined') {
      this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
        audioContext: this.audioContext,
        source: this.source,
        bufferSize: bufferSize,
        featureExtractors: ['rms', 'energy'],
        callback: (features) => {
          if (this.onFeatures) {
            features.spectralFlux = this._computeFlux();
            this.onFeatures(features);
          }
        },
      });
      this.meydaAnalyzer.start();
    }
  }

  _computeFlux() {
    if (!this.analyserNode) return 0;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    if (!this._prevSpectrum) {
      this._prevSpectrum = data;
      return 0;
    }
    let flux = 0;
    for (let i = 0; i < data.length; i++) {
      const diff = data[i] - this._prevSpectrum[i];
      if (diff > 0) flux += diff;
    }
    this._prevSpectrum = data;
    return flux / (data.length * 255);
  }

  getFrequencyData() {
    if (!this.analyserNode) return null;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    return data;
  }

  stop() {
    if (this.meydaAnalyzer) this.meydaAnalyzer.stop();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.audioContext) this.audioContext.close();
    this.meydaAnalyzer = null;
    this.analyserNode = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
    this._prevSpectrum = null;
  }
}
```

**Step 2: Verify app still runs**

Run: `npm start`
Expected: App launches, audio analysis works. Check console — no Meyda errors.

**Step 3: Commit**

```bash
git add src/audio.js
git commit -m "feat: increase FFT to 512, add Meyda bug guard comment"
```

---

## Task 6: HTML structure — device modal, split/double buttons, updated layout

**Files:**
- Modify: `src/index.html`

**Step 1: Rewrite HTML with new structure**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FLAYSync</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Splash Screen -->
  <div class="splash" id="splash">
    <img src="../assets/flaysh-logo.png" alt="FLAYSH" class="splash-logo">
  </div>

  <!-- Device Selection Modal -->
  <div class="device-modal" id="deviceModal" style="display: none;">
    <div class="device-modal-inner">
      <div class="device-modal-title">SELECT INPUT</div>
      <label class="device-modal-label">AUDIO DEVICE</label>
      <select id="deviceSelect"></select>
      <label class="device-modal-label">BUFFER SIZE</label>
      <select id="deviceBufferSize">
        <option value="512">512</option>
        <option value="1024" selected>1024</option>
      </select>
      <div class="device-modal-hint">Larger buffer = more accurate detection</div>
      <button class="device-modal-start" id="deviceStartBtn">START</button>
    </div>
  </div>

  <!-- Main UI -->
  <div class="container" id="mainUI" style="display: none;">
    <button class="close-btn" id="closeBtn">&#x2715;</button>
    <button class="settings-btn" id="settingsBtn">&#x2699;</button>

    <!-- Beat Phase Dots -->
    <div class="beat-dots">
      <div class="beat-dot" id="beat0"></div>
      <div class="beat-dot" id="beat1"></div>
      <div class="beat-dot" id="beat2"></div>
      <div class="beat-dot" id="beat3"></div>
    </div>

    <!-- BPM Display with Blob Visualizer -->
    <div class="bpm-area">
      <canvas class="ring-visualizer" id="ringVisualizer"></canvas>
      <div class="bpm-center">
        <div class="bpm-display" id="bpmDisplay">---</div>
        <div class="bpm-label">B P M</div>
      </div>
    </div>

    <div class="status" id="status">LISTENING</div>

    <!-- BPM Split/Double -->
    <div class="bpm-controls">
      <button class="bpm-ctrl-btn" id="bpmHalf">/2</button>
      <button class="bpm-ctrl-btn" id="bpmDouble">x2</button>
    </div>

    <button class="tap-btn" id="tapBtn">TAP</button>

    <!-- Settings Panel -->
    <div class="settings-panel" id="settingsPanel">
      <button class="close-btn settings-close" id="closeSettings">&#x2715;</button>
      <label>AUDIO INPUT</label>
      <select id="audioDevice"></select>
      <label>BUFFER SIZE</label>
      <select id="bufferSize">
        <option value="512">512</option>
        <option value="1024" selected>1024</option>
      </select>
      <label>ALWAYS ON TOP</label>
      <label class="toggle">
        <input type="checkbox" id="alwaysOnTop" checked>
        <span class="toggle-slider"></span>
      </label>
      <div class="link-status" id="linkStatus">LINK: OFFLINE</div>
      <img src="../assets/flaysh-logo.png" alt="FLAYSH" class="settings-logo">
    </div>
  </div>

  <script src="../node_modules/meyda/dist/web/meyda.js"></script>
  <script src="bpm-detector.js"></script>
  <script src="onset-detector.js"></script>
  <script src="tap-tempo.js"></script>
  <script type="module" src="app.js"></script>
</body>
</html>
```

**Step 2: Commit**

```bash
git add src/index.html
git commit -m "feat: add device selection modal, BPM split/double buttons, always-on-top toggle"
```

---

## Task 7: CSS — device modal, split/double, blob visualizer, toggle styles

**Files:**
- Modify: `src/styles.css`

**Step 1: Full CSS rewrite with new styles**

Add the following sections to `src/styles.css` (keep all existing styles, add new ones):

After the `.splash` styles, add device modal:

```css
/* Device Selection Modal */
.device-modal {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
}

.device-modal-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 80%;
  max-width: 240px;
}

.device-modal-title {
  font-family: 'Orbitron', monospace;
  font-size: clamp(14px, 5vw, 20px);
  font-weight: 700;
  color: var(--electric-blue);
  text-align: center;
  letter-spacing: 0.2em;
  margin-bottom: 8px;
}

.device-modal-label {
  font-size: clamp(8px, 2vw, 11px);
  letter-spacing: 0.2em;
  color: var(--text-dim);
  text-transform: uppercase;
}

.device-modal select {
  -webkit-app-region: no-drag;
  background: var(--bg-panel);
  border: 1px solid var(--border-glow);
  color: var(--electric-blue);
  font-family: 'Share Tech Mono', monospace;
  font-size: clamp(10px, 2.5vw, 13px);
  padding: clamp(4px, 1.2vh, 8px) clamp(6px, 2vw, 12px);
  outline: none;
  width: 100%;
}

.device-modal select:focus {
  border-color: var(--deep-purple);
}

.device-modal-hint {
  font-size: clamp(7px, 1.8vw, 10px);
  color: var(--text-dim);
  opacity: 0.6;
}

.device-modal-start {
  -webkit-app-region: no-drag;
  background: transparent;
  border: 1px solid var(--electric-blue);
  color: var(--electric-blue);
  font-family: 'Orbitron', monospace;
  font-size: clamp(12px, 4vw, 18px);
  font-weight: 700;
  padding: clamp(8px, 2vh, 14px);
  cursor: pointer;
  letter-spacing: 0.3em;
  margin-top: 8px;
  transition: all 0.2s;
}

.device-modal-start:hover {
  background: rgba(0, 212, 255, 0.1);
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
}
```

Add BPM controls (split/double) section:

```css
/* BPM Split/Double Controls */
.bpm-controls {
  position: absolute;
  bottom: 4%;
  left: 4%;
  display: flex;
  gap: 6px;
  z-index: 3;
}

.bpm-ctrl-btn {
  -webkit-app-region: no-drag;
  background: var(--bg-panel);
  border: 1px solid var(--border-glow);
  color: var(--text-dim);
  font-family: 'Orbitron', monospace;
  font-size: clamp(9px, 2.5vw, 13px);
  font-weight: 700;
  padding: clamp(3px, 1vh, 8px) clamp(6px, 2vw, 12px);
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: all 0.15s;
}

.bpm-ctrl-btn:hover {
  border-color: var(--neon-violet);
  color: var(--neon-violet);
}

.bpm-ctrl-btn.active {
  border-color: var(--hot-pink);
  color: var(--hot-pink);
  box-shadow: 0 0 10px rgba(255, 45, 123, 0.3);
}
```

Add toggle switch:

```css
/* Toggle Switch */
.toggle {
  -webkit-app-region: no-drag;
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
  cursor: pointer;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-glow);
  border-radius: 10px;
  transition: all 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  left: 2px;
  bottom: 2px;
  background: var(--text-dim);
  border-radius: 50%;
  transition: all 0.2s;
}

.toggle input:checked + .toggle-slider {
  border-color: var(--electric-blue);
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
  background: var(--electric-blue);
}
```

**Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat: device modal, split/double, toggle switch CSS"
```

---

## Task 8: App.js — complete rewrite with device modal, blob visualizer, split/double, cleanup

**Files:**
- Modify: `src/app.js`

This is the largest task. It rewrites app.js with:
- Device selection modal flow
- Blob contour visualizer (replacing radial bars)
- BPM split/double logic
- Always-on-top toggle
- Visibility throttling
- All diagnostic logs removed

**Step 1: Implement the new app.js**

```js
// src/app.js
import { AudioEngine } from './audio.js';

// DOM references
const splash = document.getElementById('splash');
const deviceModal = document.getElementById('deviceModal');
const deviceSelect = document.getElementById('deviceSelect');
const deviceBufferSize = document.getElementById('deviceBufferSize');
const deviceStartBtn = document.getElementById('deviceStartBtn');
const mainUI = document.getElementById('mainUI');
const bpmDisplay = document.getElementById('bpmDisplay');
const statusEl = document.getElementById('status');
const tapBtn = document.getElementById('tapBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const closeBtn = document.getElementById('closeBtn');
const audioDeviceSelect = document.getElementById('audioDevice');
const bufferSizeSelect = document.getElementById('bufferSize');
const canvas = document.getElementById('ringVisualizer');
const ctx = canvas.getContext('2d');
const beatDots = [0, 1, 2, 3].map(i => document.getElementById(`beat${i}`));
const bpmHalfBtn = document.getElementById('bpmHalf');
const bpmDoubleBtn = document.getElementById('bpmDouble');
const alwaysOnTopToggle = document.getElementById('alwaysOnTop');

// Engine instances
const audio = new AudioEngine();
const bpmDetector = new BpmDetector();
const onsetDetector = new OnsetDetector();
const tapTempo = new TapTempo();

// State
let currentBpm = null;
let currentConfidence = 0;
let isLocked = false;
let tapMode = false;
let tapTimeout;
let lastBeatIndex = -1;
let canvasReady = false;
let bpmMultiplier = 1;
let noiseTime = 0;
let lastOnsetTime = 0;
let onsetPulse = 0;

// --- Simple 2D noise (no dependency) ---
function noise2D(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = noise2D(ix, iy);
  const n10 = noise2D(ix + 1, iy);
  const n01 = noise2D(ix, iy + 1);
  const n11 = noise2D(ix + 1, iy + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbmNoise(x, y, octaves = 3) {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}

// --- Splash -> Device Modal ---
setTimeout(() => {
  splash.style.display = 'none';
  deviceModal.style.display = 'flex';
  populateDeviceModal();
}, 1500);

splash.addEventListener('animationend', (e) => {
  if (e.animationName === 'splashFade') {
    splash.style.display = 'none';
  }
});

async function populateDeviceModal() {
  try {
    // Request permission first to get device labels
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await audio.listDevices();
    deviceSelect.innerHTML = devices
      .map(d => `<option value="${d.deviceId}">${d.label || 'Unknown Device'}</option>`)
      .join('');
  } catch (err) {
    deviceSelect.innerHTML = '<option>No audio devices found</option>';
  }
}

deviceStartBtn.addEventListener('click', async () => {
  const deviceId = deviceSelect.value;
  const bufferSize = parseInt(deviceBufferSize.value);
  deviceModal.style.display = 'none';
  mainUI.style.display = '';

  requestAnimationFrame(() => {
    resizeCanvas();
    canvasReady = true;
  });

  // Sync settings panel values
  audioDeviceSelect.innerHTML = deviceSelect.innerHTML;
  audioDeviceSelect.value = deviceId;
  bufferSizeSelect.value = deviceBufferSize.value;

  statusEl.textContent = 'LISTENING';
  try {
    await audio.start(deviceId, bufferSize);
  } catch (err) {
    statusEl.textContent = 'NO AUDIO';
  }
  pollLinkStatus();
});

// --- Blob Contour Visualizer ---
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}

window.addEventListener('resize', resizeCanvas);

function drawBlobVisualizer() {
  if (document.hidden) {
    requestAnimationFrame(drawBlobVisualizer);
    return;
  }

  const w = canvas.width;
  const h = canvas.height;

  if (w === 0 || h === 0) {
    requestAnimationFrame(drawBlobVisualizer);
    return;
  }

  ctx.clearRect(0, 0, w, h);

  const freqData = audio.getFrequencyData();
  let energy = 0;
  if (freqData) {
    for (let i = 0; i < freqData.length; i++) {
      energy += freqData[i];
    }
    energy = energy / (freqData.length * 255);
  }

  // Decay onset pulse
  onsetPulse *= 0.92;

  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.min(cx, cy) * 0.35;
  const ringCount = 10;
  const maxDistortion = Math.min(cx, cy) * 0.25;

  noiseTime += 0.008;

  for (let ring = 0; ring < ringCount; ring++) {
    const t = ring / (ringCount - 1); // 0 (inner) to 1 (outer)
    const ringRadius = baseRadius + (maxDistortion * 0.8) * t;
    const distortAmount = (energy * 0.6 + 0.15 + onsetPulse * 0.3) * maxDistortion * (0.3 + t * 0.7);

    // Color: deep purple (inner) -> electric cyan (outer)
    const r = Math.round(60 + (0 - 60) * t);
    const g = Math.round(30 + (212 - 30) * t);
    const b = Math.round(180 + (255 - 180) * t);
    const alpha = 0.15 + (1 - t) * 0.35 + energy * 0.3;

    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha)})`;
    ctx.lineWidth = Math.max(1, 2.5 - t * 1.5);
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${Math.min(0.6, alpha * 0.5)})`;
    ctx.shadowBlur = 8 + energy * 15;

    const points = 80;
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const noiseVal = fbmNoise(
        Math.cos(angle) * 1.5 + noiseTime + ring * 0.4,
        Math.sin(angle) * 1.5 + noiseTime * 0.7 + ring * 0.4,
        3
      );
      const r2 = ringRadius + noiseVal * distortAmount;
      const x = cx + Math.cos(angle) * r2;
      const y = cy + Math.sin(angle) * r2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Reset shadow for next frame
  ctx.shadowBlur = 0;

  requestAnimationFrame(drawBlobVisualizer);
}

requestAnimationFrame(drawBlobVisualizer);

// --- Beat Clock ---
function beatClockLoop() {
  if (currentBpm !== null && currentBpm > 0) {
    const now = performance.now();
    const beatIndex = bpmDetector.getBeatIndex(now);
    updateBeatDots(beatIndex, currentConfidence);
  }
  requestAnimationFrame(beatClockLoop);
}
requestAnimationFrame(beatClockLoop);

// --- Audio -> BPM Detection ---
audio.onFeatures = (features) => {
  if (tapMode) return;

  const now = performance.now();
  const isOnset = onsetDetector.process(features, now);

  if (isOnset) {
    bpmDetector.registerOnset(now);
    onsetPulse = 1;
  }

  const result = bpmDetector.getBpm();
  if (result.bpm !== null) {
    updateBpm(result.bpm, result.confidence);
  }
};

function getDisplayBpm(bpm) {
  return Math.round(bpm * bpmMultiplier * 10) / 10;
}

function updateBpm(bpm, confidence) {
  currentBpm = bpm;
  currentConfidence = confidence;
  isLocked = confidence > 0.6;

  bpmDisplay.textContent = getDisplayBpm(bpm).toFixed(1);
  bpmDisplay.classList.toggle('locked', isLocked);

  if (confidence > 0.6) {
    statusEl.textContent = 'LOCKED';
  } else if (confidence > 0.3) {
    statusEl.textContent = 'UNCERTAIN';
  } else {
    statusEl.textContent = 'LISTENING';
  }

  if (isLocked && window.flaysync) {
    window.flaysync.setLinkTempo(getDisplayBpm(bpm));
  }
}

function updateBeatDots(beatIndex, confidence) {
  if (beatIndex === lastBeatIndex) return;
  lastBeatIndex = beatIndex;

  beatDots.forEach((dot, i) => {
    dot.classList.remove('active', 'uncertain');
    if (i === beatIndex) {
      dot.classList.add(confidence > 0.6 ? 'active' : 'uncertain');
    }
  });
}

// --- BPM Split/Double ---
bpmHalfBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (bpmMultiplier === 0.5) {
    bpmMultiplier = 1;
  } else {
    bpmMultiplier = 0.5;
  }
  updateMultiplierUI();
  if (currentBpm !== null) updateBpm(currentBpm, currentConfidence);
});

bpmDoubleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (bpmMultiplier === 2) {
    bpmMultiplier = 1;
  } else {
    bpmMultiplier = 2;
  }
  updateMultiplierUI();
  if (currentBpm !== null) updateBpm(currentBpm, currentConfidence);
});

function updateMultiplierUI() {
  bpmHalfBtn.classList.toggle('active', bpmMultiplier === 0.5);
  bpmDoubleBtn.classList.toggle('active', bpmMultiplier === 2);
}

// --- Tap Tempo ---
tapBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  handleTap();
});

document.addEventListener('keydown', (e) => {
  if (settingsPanel.classList.contains('open')) {
    if (e.code === 'Escape') {
      settingsPanel.classList.remove('open');
    }
    return;
  }

  if (e.code === 'Space' && e.altKey) {
    e.preventDefault();
    handleResync();
  } else if (e.code === 'Space') {
    e.preventDefault();
    handleTap();
  }
});

function handleTap() {
  const bpm = tapTempo.tap();
  tapBtn.classList.toggle('locked', tapTempo.isLocked());

  if (tapTempo.isLocked() && bpm !== null) {
    tapMode = true;
    bpmDetector._lockedBpm = bpm;
    bpmDetector._phaseOrigin = performance.now();
    updateBpm(bpm, 1.0);
    statusEl.textContent = 'TAP LOCKED';

    clearTimeout(tapTimeout);
    tapTimeout = setTimeout(() => {
      tapMode = false;
      tapTempo.reset();
      tapBtn.classList.remove('locked');
      statusEl.textContent = 'LISTENING';
    }, 10000);
  }
}

function handleResync() {
  const now = performance.now();
  bpmDetector.resync(now);
  if (window.flaysync) {
    window.flaysync.resyncBeat();
  }
  beatDots.forEach(dot => dot.classList.add('active'));
  setTimeout(() => {
    beatDots.forEach(dot => dot.classList.remove('active'));
  }, 100);
}

// --- Settings Panel ---
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('open');
  populateDevices();
});

closeSettings.addEventListener('click', () => {
  settingsPanel.classList.remove('open');
});

async function populateDevices() {
  const devices = await audio.listDevices();
  audioDeviceSelect.innerHTML = devices
    .map(d => `<option value="${d.deviceId}">${d.label || 'Unknown Device'}</option>`)
    .join('');
}

audioDeviceSelect.addEventListener('change', restartAudio);
bufferSizeSelect.addEventListener('change', restartAudio);

async function restartAudio() {
  const deviceId = audioDeviceSelect.value;
  const bufferSize = parseInt(bufferSizeSelect.value);
  audio.stop();
  bpmDetector.reset();
  onsetDetector.reset();
  await audio.start(deviceId, bufferSize);
}

// --- Always on Top ---
alwaysOnTopToggle.addEventListener('change', () => {
  if (window.flaysync) {
    window.flaysync.setAlwaysOnTop(alwaysOnTopToggle.checked);
  }
});

// --- Close ---
closeBtn.addEventListener('click', () => {
  if (window.flaysync) {
    window.flaysync.closeWindow();
  } else {
    window.close();
  }
});

// --- Link Status Polling ---
function pollLinkStatus() {
  if (!window.flaysync) return;
  setInterval(async () => {
    try {
      const status = await window.flaysync.getLinkStatus();
      const el = document.getElementById('linkStatus');
      if (status.enabled) {
        const peers = status.peers || 0;
        el.textContent = `LINK: ${peers} ${peers === 1 ? 'PEER' : 'PEERS'}`;
        el.classList.add('connected');
      } else {
        el.textContent = 'LINK: OFFLINE';
        el.classList.remove('connected');
      }
    } catch (e) {}
  }, 1000);
}

// --- Beat Phase to Link ---
function sendBeatPhaseLoop() {
  if (currentBpm !== null && isLocked && window.flaysync) {
    const phase = bpmDetector.getPhase(performance.now());
    window.flaysync.setLinkBeatPhase(phase);
  }
  setTimeout(sendBeatPhaseLoop, 50);
}
sendBeatPhaseLoop();
```

**Step 2: Verify app runs end-to-end**

Run: `npm start`
Expected:
- Splash shows for 1.5s
- Device modal appears with audio inputs listed
- Clicking START shows main UI with blob visualizer
- BPM detection works
- Split/double buttons work
- Settings panel shows always-on-top toggle
- No console errors (especially no Meyda TypeError)

**Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: device modal, blob visualizer, BPM split/double, cleanup"
```

---

## Task 9: Remove CJS shims from browser modules

**Files:**
- Modify: `src/bpm-detector.js`
- Modify: `src/onset-detector.js`
- Modify: `src/tap-tempo.js`

**Important:** Tests use `require()` to load these files. The CJS shim is needed for tests. Do NOT remove the shims yet — they serve dual purpose (browser global + Node test require). This task is **SKIPPED** unless we migrate tests to a bundler or ESM test runner.

**Decision:** Keep CJS shims. They're 2 lines each and make testing work. Simplicity wins.

**Step 1: Commit skip note (no code change)**

No commit needed — this is an intentional keep.

---

## Task 10: Final integration test and manual QA

**Step 1: Run all unit tests**

Run: `npm test`
Expected: ALL tests pass.

**Step 2: Manual QA checklist**

Run: `npm start`

Test each item:
- [ ] Splash screen shows logo, fades out
- [ ] Device modal lists audio devices
- [ ] Buffer size selector works
- [ ] START button transitions to main UI
- [ ] Blob visualizer renders concentric organic shapes
- [ ] Visualizer responds to audio (more distortion with louder input)
- [ ] BPM detects correctly from music
- [ ] Beat dots pulse in time
- [ ] Status shows LISTENING -> LOCKED
- [ ] BPM display turns cyan when locked
- [ ] /2 button halves BPM, shows as active
- [ ] x2 button doubles BPM, shows as active
- [ ] Clicking active /2 or x2 resets to 1x
- [ ] TAP button works (5 taps to lock)
- [ ] Space bar triggers tap
- [ ] ALT+Space resyncs
- [ ] Settings panel opens/closes
- [ ] Audio device change in settings restarts audio
- [ ] Always on top toggle works
- [ ] Link status shows peer count when connected
- [ ] Window resizes as square (no flicker)
- [ ] Close button closes app
- [ ] No console errors
- [ ] No Meyda TypeError

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: FLAYSync v0.3 — production ready"
```
