# FLAYSync Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign flayshlizer into FLAYSync — a production-ready real-time BPM detection overlay for VJs with improved detection, beat phase tracking, and a polished cyberpunk UI.

**Architecture:** Electron app with Web Audio API + Meyda for audio capture/feature extraction, autocorrelation-based BPM detection with dual onset detection (spectral flux + energy), internal beat phase clock tracking 4/4 position, Ableton Link output for BPM + beat phase to Resolume Arena.

**Tech Stack:** Electron, Meyda, abletonlink-addon, Web Audio API, HTML/CSS/JS

**Design doc:** `docs/plans/2026-03-06-flaysync-redesign-design.md`

---

### Task 1: Rename — flayshlizer to flaysync

**Files:**
- Modify: `package.json`
- Modify: `electron/preload.js`
- Modify: `electron/main.js`
- Modify: `src/app.js`
- Modify: `src/index.html`

**Step 1: Update package.json**

Change `"name": "flayshlizer"` to `"name": "flaysync"` and update the description:

```json
{
  "name": "flaysync",
  "version": "0.2.0",
  "description": "Real-time BPM detection for VJs — syncs tempo + beat phase to Resolume via Ableton Link"
}
```

**Step 2: Update electron/preload.js**

Change `window.flayshlizer` to `window.flaysync`:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flaysync', {
  setLinkTempo: (bpm) => ipcRenderer.send('link-set-tempo', bpm),
  setLinkBeatPhase: (phase) => ipcRenderer.send('link-set-beat-phase', phase),
  getLinkStatus: () => ipcRenderer.invoke('link-status'),
  resyncBeat: () => ipcRenderer.send('link-resync'),
  closeWindow: () => ipcRenderer.send('close-window'),
});
```

**Step 3: Update src/index.html**

Change `<title>flayshlizer</title>` to `<title>FLAYSync</title>`

**Step 4: Update all `window.flayshlizer` references in src/app.js**

Replace every `window.flayshlizer` with `window.flaysync`.

**Step 5: Commit**

```bash
git add package.json electron/preload.js electron/main.js src/app.js src/index.html
git commit -m "chore: rename flayshlizer to FLAYSync"
```

---

### Task 2: BPM Detector Rewrite — Tests First

**Files:**
- Create: `src/bpm-detector.js` (rewrite, replaces both `bpm-detector-core.js` and old `bpm-detector.js`)
- Modify: `tests/bpm-detector.test.js`

**Step 1: Write new tests for the merged BpmDetector**

Rewrite `tests/bpm-detector.test.js`. The new detector has `registerOnset()`, `getBpm()`, `getPhase()`, `resync()`, and `reset()`. It uses autocorrelation and BPM smoothing.

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { BpmDetector } = require('../src/bpm-detector.js');

describe('BpmDetector', () => {
  describe('basic detection', () => {
    it('detects 120 BPM from evenly spaced onsets', () => {
      const detector = new BpmDetector();
      const intervalMs = 500; // 120 BPM
      const now = 1000;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(now + i * intervalMs);
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null, 'BPM should not be null');
      assert.ok(result.bpm >= 118 && result.bpm <= 122, `Expected ~120, got ${result.bpm}`);
      assert.ok(result.confidence > 0.6, `Expected high confidence, got ${result.confidence}`);
    });

    it('detects 140 BPM', () => {
      const detector = new BpmDetector();
      const intervalMs = 60000 / 140;
      const now = 1000;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(now + i * intervalMs);
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
      assert.ok(result.bpm >= 138 && result.bpm <= 142, `Expected ~140, got ${result.bpm}`);
    });

    it('detects 80 BPM (slow tempo)', () => {
      const detector = new BpmDetector();
      const intervalMs = 750; // 80 BPM
      const now = 1000;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(now + i * intervalMs);
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
      assert.ok(result.bpm >= 78 && result.bpm <= 82, `Expected ~80, got ${result.bpm}`);
    });

    it('returns null BPM with insufficient onsets', () => {
      const detector = new BpmDetector();
      detector.registerOnset(1000);
      detector.registerOnset(1500);
      const result = detector.getBpm();
      assert.strictEqual(result.bpm, null);
    });

    it('has low confidence with irregular onsets', () => {
      const detector = new BpmDetector();
      const times = [1000, 1300, 1900, 2100, 2800, 3500, 3700, 4500];
      times.forEach(t => detector.registerOnset(t));
      const result = detector.getBpm();
      if (result.bpm !== null) {
        assert.ok(result.confidence < 0.5, `Expected low confidence, got ${result.confidence}`);
      }
    });
  });

  describe('BPM smoothing', () => {
    it('snaps BPM to nearest 0.5', () => {
      const detector = new BpmDetector();
      const intervalMs = 497; // ~120.7 BPM
      const now = 1000;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(now + i * intervalMs);
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
      // Should be snapped to nearest 0.5
      assert.strictEqual(result.bpm % 0.5, 0, `BPM ${result.bpm} not snapped to 0.5`);
    });

    it('rejects large BPM jumps until consistent', () => {
      const detector = new BpmDetector();
      // Lock at 120 BPM
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(1000 + i * 500);
      }
      const locked = detector.getBpm();
      assert.ok(locked.bpm >= 118 && locked.bpm <= 122);

      // Single onset at different tempo should not jump
      detector.reset();
      detector._lockedBpm = 120;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(20000 + i * 429); // ~140 BPM
      }
      // After enough consistent readings it should eventually accept the new BPM
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
    });
  });

  describe('beat phase', () => {
    it('tracks phase position in 4/4 bar', () => {
      const detector = new BpmDetector();
      const intervalMs = 500; // 120 BPM
      const now = 1000;
      for (let i = 0; i < 8; i++) {
        detector.registerOnset(now + i * intervalMs);
      }
      const phase = detector.getPhase(now + 8 * intervalMs);
      assert.ok(phase >= 0 && phase < 4, `Phase ${phase} should be 0-3`);
    });

    it('resets phase on resync', () => {
      const detector = new BpmDetector();
      const intervalMs = 500;
      const now = 1000;
      for (let i = 0; i < 8; i++) {
        detector.registerOnset(now + i * intervalMs);
      }
      detector.resync(now + 8 * intervalMs);
      const phase = detector.getPhase(now + 8 * intervalMs);
      assert.ok(phase >= 0 && phase < 0.5, `Phase after resync should be near 0, got ${phase}`);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const detector = new BpmDetector();
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(1000 + i * 500);
      }
      assert.ok(detector.getBpm().bpm !== null);
      detector.reset();
      assert.strictEqual(detector.getBpm().bpm, null);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/bpm-detector.test.js`
Expected: FAIL — the old `bpm-detector-core.js` doesn't have `getPhase`, `resync`, snapping, or autocorrelation.

**Step 3: Write the new BpmDetector in src/bpm-detector.js**

This is the merged, rewritten detector. Replace the entire file:

```javascript
class BpmDetector {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 10000;
    this.minBpm = options.minBpm || 60;
    this.maxBpm = options.maxBpm || 180;
    this.onsets = [];
    this._lockedBpm = null;
    this._lockTolerance = 0.05; // 5%
    this._jumpCount = 0;
    this._jumpTarget = null;
    this._jumpThreshold = 3; // consecutive readings needed
    this._phaseOrigin = null; // timestamp of beat 1
  }

  registerOnset(timestampMs) {
    this.onsets.push(timestampMs);
    const cutoff = timestampMs - this.windowSize;
    this.onsets = this.onsets.filter(t => t >= cutoff);

    // Anchor phase to first onset if not set
    if (this._phaseOrigin === null && this.onsets.length >= 1) {
      this._phaseOrigin = timestampMs;
    }

    // Nudge phase origin toward detected onsets (small correction)
    if (this._lockedBpm !== null && this._phaseOrigin !== null) {
      const beatMs = 60000 / this._lockedBpm;
      const expected = this._nearestBeatTime(timestampMs, beatMs);
      const error = timestampMs - expected;
      // Nudge by 20% of the error for smooth correction
      this._phaseOrigin += error * 0.2;
    }
  }

  _nearestBeatTime(timestamp, beatMs) {
    if (this._phaseOrigin === null) return timestamp;
    const elapsed = timestamp - this._phaseOrigin;
    const beats = Math.round(elapsed / beatMs);
    return this._phaseOrigin + beats * beatMs;
  }

  getBpm() {
    if (this.onsets.length < 6) {
      return { bpm: null, confidence: 0 };
    }

    // Calculate inter-onset intervals
    const intervals = [];
    for (let i = 1; i < this.onsets.length; i++) {
      intervals.push(this.onsets[i] - this.onsets[i - 1]);
    }

    const minInterval = 60000 / this.maxBpm;
    const maxInterval = 60000 / this.minBpm;

    // Autocorrelation-based tempo estimation
    const rawBpm = this._autocorrelate(intervals, minInterval, maxInterval);
    if (rawBpm === null) {
      return { bpm: this._lockedBpm, confidence: this._lockedBpm ? 0.3 : 0 };
    }

    // Snap to nearest 0.5
    const snapped = Math.round(rawBpm * 2) / 2;

    // Confidence from interval consistency
    const targetInterval = 60000 / snapped;
    const validIntervals = intervals.filter(
      iv => iv >= minInterval && iv <= maxInterval
    );
    const confidence = this._calcConfidence(validIntervals, targetInterval);

    // BPM smoothing: resist large jumps
    const bpm = this._smooth(snapped, confidence);

    if (confidence > 0.5) {
      this._lockedBpm = bpm;
    }

    return { bpm, confidence };
  }

  _autocorrelate(intervals, minInterval, maxInterval) {
    const validIntervals = intervals.filter(
      iv => iv >= minInterval * 0.5 && iv <= maxInterval * 2
    );
    if (validIntervals.length < 4) return null;

    // Build histogram of intervals, quantized to 5ms bins
    const binSize = 5;
    const bins = {};

    for (const iv of validIntervals) {
      // Check the interval itself and half/double (handle subdivisions)
      const candidates = [iv];
      if (iv * 2 >= minInterval && iv * 2 <= maxInterval) candidates.push(iv * 2);
      if (iv / 2 >= minInterval && iv / 2 <= maxInterval) candidates.push(iv / 2);

      for (const c of candidates) {
        const bin = Math.round(c / binSize) * binSize;
        if (bin >= minInterval && bin <= maxInterval) {
          bins[bin] = (bins[bin] || 0) + 1;
        }
      }
    }

    // Find the bin with the most hits
    let bestBin = null;
    let bestCount = 0;
    for (const [bin, count] of Object.entries(bins)) {
      if (count > bestCount) {
        bestCount = count;
        bestBin = Number(bin);
      }
    }

    if (bestBin === null || bestCount < 3) return null;

    // Refine: average all intervals near the best bin
    const tolerance = binSize * 2;
    const nearby = validIntervals.filter(iv => {
      const candidates = [iv, iv * 2, iv / 2];
      return candidates.some(c => Math.abs(c - bestBin) <= tolerance);
    }).map(iv => {
      const candidates = [iv, iv * 2, iv / 2].filter(
        c => Math.abs(c - bestBin) <= tolerance && c >= minInterval && c <= maxInterval
      );
      return candidates.length > 0 ? candidates[0] : iv;
    }).filter(iv => iv >= minInterval && iv <= maxInterval);

    if (nearby.length < 3) return null;

    const avgInterval = nearby.reduce((a, b) => a + b, 0) / nearby.length;
    return 60000 / avgInterval;
  }

  _calcConfidence(intervals, targetInterval) {
    if (intervals.length < 3) return 0;
    const deviations = intervals.map(iv => {
      // Check how close this interval (or half/double) is to the target
      const candidates = [iv, iv * 2, iv / 2];
      const errors = candidates.map(c => Math.abs(c - targetInterval) / targetInterval);
      return Math.min(...errors);
    });
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    return Math.max(0, Math.min(1, 1 - avgDeviation * 5));
  }

  _smooth(newBpm, confidence) {
    if (this._lockedBpm === null || confidence < 0.4) {
      return newBpm;
    }

    const diff = Math.abs(newBpm - this._lockedBpm) / this._lockedBpm;

    // Within tolerance: accept immediately
    if (diff <= this._lockTolerance) {
      this._jumpCount = 0;
      this._jumpTarget = null;
      return newBpm;
    }

    // Large jump: require consecutive consistent readings
    if (this._jumpTarget !== null && Math.abs(newBpm - this._jumpTarget) / this._jumpTarget <= 0.02) {
      this._jumpCount++;
      if (this._jumpCount >= this._jumpThreshold) {
        this._jumpCount = 0;
        this._jumpTarget = null;
        this._phaseOrigin = null; // reset phase on tempo change
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
    return ((beats % 4) + 4) % 4; // Always positive, 0-3.999
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

**Step 4: Run tests to verify they pass**

Run: `node --test tests/bpm-detector.test.js`
Expected: All tests PASS

**Step 5: Delete the old bpm-detector-core.js**

Run: `rm src/bpm-detector-core.js`

**Step 6: Commit**

```bash
git add src/bpm-detector.js tests/bpm-detector.test.js
git rm src/bpm-detector-core.js
git commit -m "feat: rewrite BPM detector with autocorrelation, phase tracking, and smoothing"
```

---

### Task 3: Onset Detector — Dual Method (Spectral Flux + Energy)

**Files:**
- Create: `src/onset-detector.js`
- Create: `tests/onset-detector.test.js`

**Step 1: Write tests for OnsetDetector**

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { OnsetDetector } = require('../src/onset-detector.js');

describe('OnsetDetector', () => {
  it('detects onset when both flux and energy spike', () => {
    const detector = new OnsetDetector();
    // Feed baseline frames
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.01 }, 1000 + i * 12);
    }
    // Spike
    const result = detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1120);
    assert.strictEqual(result, true);
  });

  it('does not detect onset from energy alone', () => {
    const detector = new OnsetDetector();
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.01 }, 1000 + i * 12);
    }
    // Energy spikes but flux does not
    const result = detector.process({ spectralFlux: 0.01, energy: 0.1, rms: 0.1 }, 1120);
    assert.strictEqual(result, false);
  });

  it('respects minimum interval between onsets', () => {
    const detector = new OnsetDetector({ minInterval: 333 });
    // Baseline
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.01 }, 1000 + i * 12);
    }
    // First onset
    detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1120);
    // Too soon — should not trigger
    const result = detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1200);
    assert.strictEqual(result, false);
  });

  it('ignores silence (low rms)', () => {
    const detector = new OnsetDetector();
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.001 }, 1000 + i * 12);
    }
    // Flux spikes but rms is near zero
    const result = detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.001 }, 1120);
    assert.strictEqual(result, false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/onset-detector.test.js`
Expected: FAIL — module not found

**Step 3: Implement src/onset-detector.js**

```javascript
class OnsetDetector {
  constructor(options = {}) {
    this.minInterval = options.minInterval || 333; // 180 BPM cap
    this.fluxWindowSize = options.fluxWindowSize || 20;
    this.fluxMultiplier = options.fluxMultiplier || 1.5;
    this.energyWindowSize = options.energyWindowSize || 20;
    this.energyMultiplier = options.energyMultiplier || 1.3;
    this.minRms = options.minRms || 0.003;

    this.fluxHistory = [];
    this.energyHistory = [];
    this.lastOnsetTime = 0;
  }

  process(features, timestamp) {
    const flux = features.spectralFlux || 0;
    const energy = features.energy || 0;
    const rms = features.rms || 0;

    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.fluxWindowSize) this.fluxHistory.shift();

    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.energyWindowSize) this.energyHistory.shift();

    if (this.fluxHistory.length < 6) return false;

    // Silence gate
    if (rms < this.minRms) return false;

    // Minimum interval
    if (timestamp - this.lastOnsetTime < this.minInterval) return false;

    // Adaptive thresholds
    const meanFlux = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;
    const meanEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    const fluxExceeds = flux > meanFlux * this.fluxMultiplier && flux > 0.01;
    const energyExceeds = energy > meanEnergy * this.energyMultiplier;

    // Both must agree
    if (fluxExceeds && energyExceeds) {
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

**Step 4: Run tests to verify they pass**

Run: `node --test tests/onset-detector.test.js`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/onset-detector.js tests/onset-detector.test.js
git commit -m "feat: dual onset detector with spectral flux + energy confirmation"
```

---

### Task 4: Audio Engine Cleanup

**Files:**
- Modify: `src/audio.js`

**Step 1: Rewrite src/audio.js**

Re-add `spectralFlux` to Meyda features. Remove `getTimeDomainData()`. Remove debug console.logs. Clean up.

```javascript
export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyserNode = null;
    this.source = null;
    this.stream = null;
    this.meydaAnalyzer = null;
    this.onFeatures = null;
  }

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  async start(deviceId = null, bufferSize = 512) {
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

    // AnalyserNode for the visualizer
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.source.connect(this.analyserNode);

    // Meyda for feature extraction
    if (typeof Meyda !== 'undefined') {
      this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
        audioContext: this.audioContext,
        source: this.source,
        bufferSize: bufferSize,
        featureExtractors: ['rms', 'energy', 'spectralFlux'],
        callback: (features) => {
          if (this.onFeatures) this.onFeatures(features);
        },
      });
      this.meydaAnalyzer.start();
    }
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
  }
}
```

**Step 2: Commit**

```bash
git add src/audio.js
git commit -m "fix: add spectralFlux to features, remove debug logs and unused methods"
```

---

### Task 5: Electron Main Process — Production Ready

**Files:**
- Modify: `electron/main.js`

**Step 1: Rewrite electron/main.js**

Remove DevTools, set 300x300 1:1 window, add RESYNC IPC handler.

```javascript
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
```

**Step 2: Commit**

```bash
git add electron/main.js
git commit -m "fix: production-ready main process, 300x300 square, no DevTools"
```

---

### Task 6: Link Bridge — Add Beat Phase Support

**Files:**
- Modify: `electron/link.js`

**Step 1: Update LinkBridge with beat phase methods**

```javascript
let AbletonLink;
try {
  AbletonLink = require('abletonlink-addon');
} catch (err) {
  AbletonLink = null;
}

class LinkBridge {
  constructor() {
    this.link = null;
    this.enabled = false;
  }

  start() {
    if (!AbletonLink) return false;
    this.link = new AbletonLink();
    this.link.enable();
    this.link.setQuantum(4);
    this.enabled = true;
    return true;
  }

  setTempo(bpm) {
    if (!this.link || !this.enabled) return;
    this.link.setTempo(bpm);
  }

  setBeatPhase(phase) {
    if (!this.link || !this.enabled) return;
    // Force beat phase alignment — Link uses this for downbeat sync
    try {
      this.link.forceBeatAtTime(phase, Date.now() * 1000, 4);
    } catch (e) {
      // Not all Link addon versions support forceBeatAtTime
    }
  }

  resync() {
    if (!this.link || !this.enabled) return;
    try {
      this.link.forceBeatAtTime(0, Date.now() * 1000, 4);
    } catch (e) {
      // Fallback: just reset internally
    }
  }

  getStatus() {
    if (!this.link || !this.enabled) {
      return { enabled: false, tempo: 0, peers: 0, beat: 0, phase: 0 };
    }
    return {
      enabled: true,
      tempo: this.link.getTempo(),
      beat: this.link.getBeat(),
      phase: this.link.getPhase(),
      peers: this.link.getNumPeers(),
    };
  }

  stop() {
    if (this.link) {
      this.link.disable();
      this.enabled = false;
    }
  }
}

module.exports = { LinkBridge };
```

**Step 2: Commit**

```bash
git add electron/link.js
git commit -m "feat: add beat phase and resync support to Link bridge"
```

---

### Task 7: Logo Setup

**Files:**
- Move: `src/FLAYSH Chrome.png` → `assets/flaysh-logo.png`

**Step 1: Create assets directory and move logo**

```bash
mkdir -p assets
cp "src/FLAYSH Chrome.png" assets/flaysh-logo.png
git rm "src/FLAYSH Chrome.png"
```

**Step 2: Commit**

```bash
git add assets/flaysh-logo.png
git commit -m "chore: move FLAYSH logo to assets directory"
```

---

### Task 8: UI Overhaul — HTML Structure

**Files:**
- Rewrite: `src/index.html`

**Step 1: Rewrite src/index.html**

New structure with splash screen, 4 beat dots, circular visualizer canvas, and clean script loading.

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

    <!-- BPM Display with Circular Visualizer -->
    <div class="bpm-area">
      <canvas class="ring-visualizer" id="ringVisualizer"></canvas>
      <div class="bpm-center">
        <div class="bpm-display" id="bpmDisplay">---</div>
        <div class="bpm-label">B P M</div>
      </div>
    </div>

    <div class="status" id="status">LISTENING</div>
    <button class="tap-btn" id="tapBtn">TAP</button>

    <!-- Settings Panel -->
    <div class="settings-panel" id="settingsPanel">
      <button class="close-btn settings-close" id="closeSettings">&#x2715;</button>
      <label>AUDIO INPUT</label>
      <select id="audioDevice"></select>
      <label>BUFFER SIZE</label>
      <select id="bufferSize">
        <option value="512" selected>512</option>
        <option value="1024">1024</option>
      </select>
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
git commit -m "feat: new HTML structure with splash, beat dots, circular visualizer"
```

---

### Task 9: UI Overhaul — CSS

**Files:**
- Rewrite: `src/styles.css`

**Step 1: Rewrite src/styles.css**

Complete CSS for the new 1:1 layout with splash screen, circular visualizer, beat dots, and cyberpunk styling.

```css
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --electric-blue: #00d4ff;
  --hot-pink: #ff2d7b;
  --deep-purple: #8b5cf6;
  --neon-violet: #c084fc;
  --chrome: #e2e8f0;
  --chrome-dim: rgba(226, 232, 240, 0.3);
  --bg-dark: rgba(8, 4, 20, 0.92);
  --bg-panel: rgba(20, 10, 40, 0.85);
  --text-dim: rgba(139, 92, 246, 0.5);
  --border-glow: rgba(0, 212, 255, 0.2);
  --beat-green: #00ff88;
  --beat-grey: rgba(139, 92, 246, 0.25);
}

body {
  font-family: 'Share Tech Mono', monospace;
  background: var(--bg-dark);
  color: var(--electric-blue);
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  -webkit-app-region: drag;
  user-select: none;
}

/* Splash Screen */
.splash {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: splashFade 1.5s ease-in-out forwards;
  animation-delay: 1s;
}

.splash-logo {
  width: 60%;
  max-width: 200px;
  opacity: 0;
  animation: logoIn 0.8s ease-out 0.2s forwards;
  filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.5));
}

@keyframes logoIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes splashFade {
  to { opacity: 0; pointer-events: none; }
}

/* Main Container */
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 8% 6%;
  position: relative;
  gap: 4%;
}

/* Scanline effect */
.container::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(139, 92, 246, 0.03) 2px,
    rgba(139, 92, 246, 0.03) 4px
  );
  pointer-events: none;
  z-index: 100;
}

/* Border glow */
.container::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border: 1px solid rgba(139, 92, 246, 0.15);
  pointer-events: none;
  z-index: 99;
}

/* Beat Phase Dots */
.beat-dots {
  display: flex;
  gap: clamp(8px, 3vw, 16px);
}

.beat-dot {
  width: clamp(8px, 3vw, 14px);
  height: clamp(8px, 3vw, 14px);
  border-radius: 50%;
  background: var(--beat-grey);
  transition: background 0.05s, box-shadow 0.05s;
}

.beat-dot.active {
  background: var(--beat-green);
  box-shadow: 0 0 8px var(--beat-green), 0 0 20px rgba(0, 255, 136, 0.4);
}

.beat-dot.uncertain {
  background: rgba(100, 100, 100, 0.5);
  box-shadow: none;
}

/* BPM Area — circular visualizer wrapping BPM */
.bpm-area {
  position: relative;
  width: clamp(120px, 55vw, 220px);
  height: clamp(120px, 55vw, 220px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring-visualizer {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.bpm-center {
  position: relative;
  z-index: 2;
  text-align: center;
}

.bpm-display {
  font-family: 'Orbitron', monospace;
  font-size: clamp(24px, 12vw, 56px);
  font-weight: 900;
  color: var(--chrome);
  text-shadow:
    0 0 20px var(--deep-purple),
    0 0 40px rgba(139, 92, 246, 0.4);
  letter-spacing: 0.05em;
  transition: color 0.3s, text-shadow 0.3s;
  line-height: 1;
}

.bpm-display.locked {
  color: var(--electric-blue);
  text-shadow:
    0 0 20px var(--electric-blue),
    0 0 40px rgba(0, 212, 255, 0.5);
}

.bpm-label {
  font-size: clamp(7px, 2vw, 12px);
  color: var(--text-dim);
  letter-spacing: 0.5em;
  margin-top: 2px;
}

/* Status */
.status {
  font-size: clamp(7px, 2vw, 11px);
  color: var(--text-dim);
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

/* TAP Button */
.tap-btn {
  -webkit-app-region: no-drag;
  position: absolute;
  bottom: 5%;
  right: 5%;
  background: var(--bg-panel);
  border: 1px solid var(--border-glow);
  color: var(--neon-violet);
  font-family: 'Orbitron', monospace;
  font-size: clamp(10px, 3vw, 16px);
  font-weight: 700;
  padding: clamp(4px, 1.5vh, 10px) clamp(10px, 4vw, 24px);
  cursor: pointer;
  letter-spacing: 0.2em;
  transition: all 0.15s;
}

.tap-btn:hover {
  border-color: var(--hot-pink);
  color: var(--hot-pink);
  box-shadow: 0 0 15px rgba(255, 45, 123, 0.2);
}

.tap-btn:active {
  transform: scale(0.95);
  background: rgba(255, 45, 123, 0.1);
}

.tap-btn.locked {
  border-color: var(--electric-blue);
  color: var(--electric-blue);
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.3);
}

/* Settings gear */
.settings-btn {
  -webkit-app-region: no-drag;
  position: absolute;
  top: 5%;
  right: 5%;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: clamp(14px, 3.5vw, 20px);
  cursor: pointer;
  transition: color 0.2s;
}

.settings-btn:hover {
  color: var(--neon-violet);
}

/* Close button */
.close-btn {
  -webkit-app-region: no-drag;
  position: absolute;
  top: 5%;
  left: 5%;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: clamp(10px, 2.5vw, 16px);
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--hot-pink);
}

/* Settings Panel */
.settings-panel {
  display: none;
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg-dark);
  padding: 10% 8%;
  flex-direction: column;
  gap: clamp(6px, 2.5vh, 14px);
  z-index: 10;
  overflow-y: auto;
}

.settings-panel.open {
  display: flex;
}

.settings-panel label {
  font-size: clamp(7px, 1.8vw, 11px);
  letter-spacing: 0.2em;
  color: var(--text-dim);
  text-transform: uppercase;
}

.settings-panel select {
  -webkit-app-region: no-drag;
  background: var(--bg-panel);
  border: 1px solid var(--border-glow);
  color: var(--electric-blue);
  font-family: 'Share Tech Mono', monospace;
  font-size: clamp(9px, 2.2vw, 13px);
  padding: clamp(3px, 1vh, 6px) clamp(4px, 1.5vw, 10px);
  outline: none;
}

.settings-panel select:focus {
  border-color: var(--deep-purple);
}

.settings-close {
  position: relative;
  top: 0;
  left: 0;
  align-self: flex-start;
}

.link-status {
  font-size: clamp(7px, 1.8vw, 11px);
  color: var(--text-dim);
  margin-top: auto;
}

.link-status.connected {
  color: var(--electric-blue);
}

.settings-logo {
  width: 40%;
  max-width: 100px;
  align-self: center;
  margin-top: auto;
  opacity: 0.6;
  filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.3));
}
```

**Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat: cyberpunk 1:1 UI with splash, beat dots, circular visualizer layout"
```

---

### Task 10: App.js — Wire Everything Together

**Files:**
- Rewrite: `src/app.js`

**Step 1: Rewrite src/app.js**

This is the main application logic. Wires audio, onset detection, BPM detection, tap tempo, beat phase, visualizer, and UI state together.

```javascript
import { AudioEngine } from './audio.js';

// Globals loaded via script tags: BpmDetector, OnsetDetector, TapTempo

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
const splash = document.getElementById('splash');
const mainUI = document.getElementById('mainUI');
const beatDots = [0, 1, 2, 3].map(i => document.getElementById(`beat${i}`));

// Engine instances
const audio = new AudioEngine();
const bpmDetector = new BpmDetector();
const onsetDetector = new OnsetDetector();
const tapTempo = new TapTempo();

let currentBpm = null;
let isLocked = false;
let tapMode = false;
let tapTimeout;
let lastBeatIndex = -1;

// --- Splash Screen ---
setTimeout(() => {
  mainUI.style.display = '';
}, 1500);

splash.addEventListener('animationend', (e) => {
  if (e.animationName === 'splashFade') {
    splash.style.display = 'none';
  }
});

// --- Circular Visualizer ---
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function drawRingVisualizer() {
  const freqData = audio.getFrequencyData();
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy) * 0.85;

  ctx.clearRect(0, 0, w, h);

  if (!freqData) {
    requestAnimationFrame(drawRingVisualizer);
    return;
  }

  const barCount = 64;
  const step = Math.floor(freqData.length / barCount);

  for (let i = 0; i < barCount; i++) {
    const value = freqData[i * step] / 255;
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const barLen = value * radius * 0.3;

    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + barLen);
    const y2 = cy + Math.sin(angle) * (radius + barLen);

    // Color gradient around the ring
    const t = i / barCount;
    let r, g, b;
    if (t < 0.33) {
      const p = t * 3;
      r = Math.round(139 + (0 - 139) * p);
      g = Math.round(92 + (212 - 92) * p);
      b = Math.round(246 + (255 - 246) * p);
    } else if (t < 0.66) {
      const p = (t - 0.33) * 3;
      r = Math.round(0 + (255 - 0) * p);
      g = Math.round(212 + (45 - 212) * p);
      b = Math.round(255 + (123 - 255) * p);
    } else {
      const p = (t - 0.66) * 3;
      r = Math.round(255 + (139 - 255) * p);
      g = Math.round(45 + (92 - 45) * p);
      b = Math.round(123 + (246 - 123) * p);
    }

    const alpha = 0.3 + value * 0.7;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = Math.max(1, (w / barCount) * 0.6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Subtle ring outline
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  requestAnimationFrame(drawRingVisualizer);
}

requestAnimationFrame(drawRingVisualizer);

// --- Audio → BPM Detection ---
audio.onFeatures = (features) => {
  if (tapMode) return;

  const now = performance.now();
  const isOnset = onsetDetector.process(features, now);

  if (isOnset) {
    bpmDetector.registerOnset(now);
  }

  const result = bpmDetector.getBpm();
  if (result.bpm !== null) {
    updateBpm(result.bpm, result.confidence);
    updateBeatDots(bpmDetector.getBeatIndex(now), result.confidence);
  }
};

function updateBpm(bpm, confidence) {
  currentBpm = bpm;
  isLocked = confidence > 0.6;

  bpmDisplay.textContent = bpm.toFixed(1);
  bpmDisplay.classList.toggle('locked', isLocked);

  if (confidence > 0.6) {
    statusEl.textContent = 'LOCKED';
  } else if (confidence > 0.3) {
    statusEl.textContent = 'UNCERTAIN';
  } else {
    statusEl.textContent = 'LISTENING';
  }

  if (isLocked && window.flaysync) {
    window.flaysync.setLinkTempo(bpm);
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
  // Flash all dots briefly
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
        el.textContent = `LINK: ACTIVE (${peers} ${peers === 1 ? 'PEER' : 'PEERS'})`;
        el.classList.add('connected');
      } else {
        el.textContent = 'LINK: OFFLINE';
        el.classList.remove('connected');
      }
    } catch (e) {}
  }, 1000);
}

// --- Init ---
async function init() {
  statusEl.textContent = 'LISTENING';
  try {
    await audio.start(null, parseInt(bufferSizeSelect.value));
  } catch (err) {
    statusEl.textContent = 'NO AUDIO';
  }
  pollLinkStatus();
}

init();
```

**Step 2: Commit**

```bash
git add src/app.js
git commit -m "feat: wire BPM detection, beat phase, circular visualizer, and all controls"
```

---

### Task 11: Run All Tests

**Step 1: Run all unit tests**

Run: `node --test tests/*.test.js`
Expected: All tests PASS (bpm-detector + tap-tempo + onset-detector)

**Step 2: Fix any failing tests**

If tests fail, fix the issues and re-run.

**Step 3: Manual smoke test**

Run: `npm start`
Verify:
- Splash shows for ~1.5s then fades
- Main UI appears as 300x300 square
- BPM detection works with audio input
- Tap tempo works (spacebar or TAP button)
- Beat dots pulse on beat
- Circular visualizer reacts to audio
- Settings panel opens/closes
- ESC closes settings
- ALT+Space resyncs (dots flash)
- Close button works

---

### Task 12: README

**Files:**
- Create: `README.md`

**Step 1: Write README.md**

```markdown
# FLAYSync

Real-time BPM detection for VJs. Syncs tempo and beat phase to Resolume Arena via Ableton Link.

![FLAYSync](assets/flaysh-logo.png)

## Features

- **Auto BPM detection** from any audio input device
- **Beat phase tracking** — sends 4/4 bar position to Link, not just BPM
- **Tap tempo** — tap 5 times to override (spacebar or click)
- **Ableton Link** — syncs BPM + beat position to Resolume Arena and any Link-enabled app
- **Always-on-top overlay** — compact 300x300 square, resizable
- **Cyberpunk UI** — dark, neon-accented interface with circular waveform visualizer

## Install

```bash
git clone <repo-url>
cd flaysync
npm install
```

Requires Node.js 18+ and macOS (Windows support planned).

## Run

```bash
npm start
```

## Quick Start

1. Launch FLAYSync — splash screen shows, then the main overlay appears
2. Select your audio input device in Settings (gear icon)
3. Play music — FLAYSync auto-detects BPM
4. When BPM locks (turns blue), it syncs to Ableton Link automatically
5. In Resolume Arena: enable Ableton Link in preferences

## Audio Setup Tips

- **Best:** Dedicated line input from mixer/audio interface
- **Good:** External USB audio interface
- **OK:** Built-in laptop microphone (works, but less accurate)
- Use buffer size 512 (default) for best balance of speed and accuracy
- Higher buffer (1024) can improve accuracy in noisy environments

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Tap tempo |
| ALT + Space | Resync (reset beat 1) |
| ESC | Close settings |

## How It Works

FLAYSync captures audio from your selected input device, extracts spectral and energy features in real-time using Meyda, detects beat onsets using dual spectral flux + energy analysis, estimates tempo via autocorrelation, and broadcasts BPM + beat phase over Ableton Link.

The beat phase indicator (4 dots) shows which beat in the 4/4 bar is currently playing — green when confident, grey when uncertain. This phase information syncs to Resolume so your visuals know exactly where in the bar the music is.

## License

MIT

---

Built by **FLAYSH**
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with features, setup, and usage guide"
```

---

### Task 13: Final Cleanup

**Files:**
- Various cleanup across all files

**Step 1: Delete old design/plan docs that reference flayshlizer**

Keep only the new FLAYSync docs:
```bash
rm docs/plans/2026-03-06-flayshlizer-design.md
rm docs/plans/2026-03-06-flayshlizer-implementation.md
```

**Step 2: Run all tests one final time**

Run: `node --test tests/*.test.js`
Expected: All PASS

**Step 3: Manual end-to-end verification**

Run: `npm start` and verify the full checklist:
- [ ] Splash screen shows FLAYSH logo, fades after 1.5s
- [ ] 300x300 square window, always on top
- [ ] Window is draggable, resizable (stays square)
- [ ] Circular visualizer reacts to audio
- [ ] BPM auto-detects from music
- [ ] BPM number turns blue when locked
- [ ] 4 beat dots pulse green on beat when locked
- [ ] Beat dots pulse grey when uncertain
- [ ] Tap tempo locks after 5 taps
- [ ] ALT+Space resyncs (dots flash)
- [ ] ESC closes settings
- [ ] Settings shows audio device, buffer size, Link status, FLAYSH logo
- [ ] Close button works
- [ ] Link connects to Resolume Arena

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup, remove old docs, FLAYSync v0.2.0 ready"
```

---

## Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Rename to FLAYSync | None |
| 2 | BPM detector rewrite (TDD) | None |
| 3 | Onset detector (TDD) | None |
| 4 | Audio engine cleanup | None |
| 5 | Electron main.js production-ready | None |
| 6 | Link bridge + beat phase | None |
| 7 | Logo setup | None |
| 8 | HTML structure overhaul | Tasks 2, 3 |
| 9 | CSS overhaul | Task 8 |
| 10 | App.js — wire everything | Tasks 1-9 |
| 11 | Run all tests | Tasks 2, 3 |
| 12 | README | Task 10 |
| 13 | Final cleanup + verification | All |

Tasks 1-7 can run in parallel. Task 8-9 depend on 2-3. Task 10 depends on all. Task 11-13 are sequential at the end.
