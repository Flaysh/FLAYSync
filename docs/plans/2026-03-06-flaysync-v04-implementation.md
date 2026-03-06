# FLAYSync v0.4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship FLAYSync v0.4 — faster BPM lock, audio level indicator, persistent settings, smaller minimum window, cleaner code (ES modules), and production hardening.

**Architecture:** Electron + vanilla JS + Meyda + abletonlink-addon + Canvas 2D. Audio pipeline: Meyda (RMS, energy) + custom spectral flux → weighted onset detection → quick-lock + autocorrelation BPM estimation → Ableton Link. No new dependencies.

**Tech Stack:** Electron 40, Meyda 5.6.3, abletonlink-addon, Canvas 2D, ES modules (browser), CJS (Electron main)

**CRITICAL BUG GUARD:** Meyda v5.6.3 `spectralFlux` feature extractor throws `TypeError` on first frame because `previousSignal` is undefined. NEVER add `spectralFlux` to Meyda's `featureExtractors` array. Always use the custom `_computeFlux()` method on AudioEngine instead.

**Design doc:** `docs/plans/2026-03-06-flaysync-v04-design.md`

---

### Task 1: Convert onset-detector.js to ES module

**Files:**
- Modify: `src/onset-detector.js`
- Test: `tests/onset-detector.test.js`

**Step 1: Write the updated test file with ESM imports**

```js
// tests/onset-detector.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OnsetDetector } from '../src/onset-detector.js';

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
    const result = detector.process({ spectralFlux: 0.01, energy: 0.2, rms: 0.1 }, 1200);
    assert.strictEqual(result, true);
  });

  it('detects onset from strong flux spike alone', () => {
    const detector = new OnsetDetector();
    warmUp(detector);
    const result = detector.process({ spectralFlux: 0.8, energy: 0.001, rms: 0.01 }, 1200);
    assert.strictEqual(result, true);
  });

  it('rejects weak signals that only slightly exceed one threshold', () => {
    const detector = new OnsetDetector();
    warmUp(detector);
    const result = detector.process({ spectralFlux: 0.015, energy: 0.0015, rms: 0.01 }, 1200);
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

**Step 2: Run test to verify it fails**

Run: `node --test tests/onset-detector.test.js`
Expected: FAIL — `require` vs `import` mismatch or CJS module error.

**Step 3: Convert onset-detector.js to ESM and reduce minInterval**

```js
// src/onset-detector.js
export class OnsetDetector {
  constructor(options = {}) {
    this.minInterval = options.minInterval || 150;
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

    const normEnergy = meanEnergy > 0 ? energy / meanEnergy : 0;
    const normFlux = meanFlux > 0 ? flux / meanFlux : 0;

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
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/onset-detector.test.js`
Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add src/onset-detector.js tests/onset-detector.test.js
git commit -m "refactor: convert onset-detector to ESM, reduce minInterval to 150ms"
```

---

### Task 2: Convert tap-tempo.js to ES module

**Files:**
- Modify: `src/tap-tempo.js`
- Test: `tests/tap-tempo.test.js`

**Step 1: Write the updated test file with ESM imports**

```js
// tests/tap-tempo.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TapTempo } from '../src/tap-tempo.js';

describe('TapTempo', () => {
  it('returns null with fewer than 5 taps', () => {
    const tap = new TapTempo();
    tap.tap(1000);
    tap.tap(1500);
    tap.tap(2000);
    tap.tap(2500);
    assert.strictEqual(tap.getBpm(), null);
  });

  it('detects 120 BPM after 5 taps at 500ms intervals', () => {
    const tap = new TapTempo();
    for (let i = 0; i < 5; i++) {
      tap.tap(1000 + i * 500);
    }
    const bpm = tap.getBpm();
    assert.ok(bpm >= 118 && bpm <= 122, `Expected ~120, got ${bpm}`);
  });

  it('resets after timeout', () => {
    const tap = new TapTempo({ timeoutMs: 2000 });
    tap.tap(1000);
    tap.tap(1500);
    tap.tap(2000);
    tap.tap(2500);
    tap.tap(3000);
    assert.ok(tap.getBpm() !== null);

    tap.tap(6000);
    assert.strictEqual(tap.getBpm(), null);
  });

  it('isLocked returns true after 5 taps', () => {
    const tap = new TapTempo();
    for (let i = 0; i < 5; i++) {
      tap.tap(1000 + i * 500);
    }
    assert.strictEqual(tap.isLocked(), true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/tap-tempo.test.js`
Expected: FAIL

**Step 3: Convert tap-tempo.js to ESM**

```js
// src/tap-tempo.js
export class TapTempo {
  constructor(options = {}) {
    this.requiredTaps = options.requiredTaps || 5;
    this.timeoutMs = options.timeoutMs || 3000;
    this.taps = [];
  }

  tap(timestampMs) {
    const now = timestampMs || Date.now();

    if (this.taps.length > 0 && (now - this.taps[this.taps.length - 1]) > this.timeoutMs) {
      this.taps = [];
    }

    this.taps.push(now);

    if (this.taps.length > 8) {
      this.taps.shift();
    }

    return this.getBpm();
  }

  getBpm() {
    if (this.taps.length < this.requiredTaps) return null;

    const intervals = [];
    for (let i = 1; i < this.taps.length; i++) {
      intervals.push(this.taps[i] - this.taps[i - 1]);
    }

    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.round((60000 / avg) * 10) / 10;
  }

  isLocked() {
    return this.taps.length >= this.requiredTaps;
  }

  reset() {
    this.taps = [];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/tap-tempo.test.js`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/tap-tempo.js tests/tap-tempo.test.js
git commit -m "refactor: convert tap-tempo to ESM"
```

---

### Task 3: Convert bpm-detector.js to ESM + add quick-lock

**Files:**
- Modify: `src/bpm-detector.js`
- Test: `tests/bpm-detector.test.js`

**Step 1: Write updated test file — add quick-lock test, use ESM imports**

Add these tests to the existing suite (full file rewrite with ESM imports):

```js
// tests/bpm-detector.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BpmDetector } from '../src/bpm-detector.js';

describe('BpmDetector', () => {
  describe('basic detection', () => {
    it('detects 120 BPM from evenly spaced onsets', () => {
      const detector = new BpmDetector();
      const intervalMs = 500;
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
      const intervalMs = 750;
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

  describe('quick-lock', () => {
    it('provides tentative BPM after just 3 onsets with consistent intervals', () => {
      const detector = new BpmDetector();
      const intervalMs = 500; // 120 BPM
      detector.registerOnset(1000);
      detector.registerOnset(1500);
      detector.registerOnset(2000);
      const result = detector.getBpm();
      assert.ok(result.bpm !== null, 'Should have tentative BPM after 3 onsets');
      assert.ok(result.bpm >= 118 && result.bpm <= 122, `Expected ~120, got ${result.bpm}`);
      assert.ok(result.confidence > 0 && result.confidence <= 0.5, `Expected medium confidence, got ${result.confidence}`);
    });

    it('returns null after 3 onsets with inconsistent intervals', () => {
      const detector = new BpmDetector();
      detector.registerOnset(1000);
      detector.registerOnset(1200); // 200ms gap
      detector.registerOnset(2000); // 800ms gap — very inconsistent
      const result = detector.getBpm();
      // Should not quick-lock on inconsistent intervals
      assert.strictEqual(result.bpm, null);
    });
  });

  describe('BPM smoothing', () => {
    it('snaps BPM to nearest 0.5', () => {
      const detector = new BpmDetector();
      const intervalMs = 497;
      const now = 1000;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(now + i * intervalMs);
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
      assert.strictEqual(result.bpm % 0.5, 0, `BPM ${result.bpm} not snapped to 0.5`);
    });

    it('rejects large BPM jumps until consistent', () => {
      const detector = new BpmDetector();
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(1000 + i * 500);
      }
      const locked = detector.getBpm();
      assert.ok(locked.bpm >= 118 && locked.bpm <= 122);

      detector.reset();
      detector._lockedBpm = 120;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(20000 + i * 429);
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
    });
  });

  describe('beat phase', () => {
    it('tracks phase position in 4/4 bar', () => {
      const detector = new BpmDetector();
      const intervalMs = 500;
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

  describe('autocorrelation', () => {
    it('detects 128 BPM from slightly noisy onsets', () => {
      const detector = new BpmDetector();
      const intervalMs = 60000 / 128;
      const now = 1000;
      for (let i = 0; i < 16; i++) {
        const jitter = (i % 3 - 1) * 15;
        detector.registerOnset(now + i * intervalMs + jitter);
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
      assert.ok(result.bpm >= 123 && result.bpm <= 133, `Expected ~128, got ${result.bpm}`);
      assert.ok(result.confidence > 0.5, `Expected decent confidence, got ${result.confidence}`);
    });

    it('handles mixed-in ghost onsets gracefully', () => {
      const detector = new BpmDetector();
      const intervalMs = 500;
      const now = 1000;
      for (let i = 0; i < 12; i++) {
        detector.registerOnset(now + i * intervalMs);
        if (i % 3 === 0) {
          detector.registerOnset(now + i * intervalMs + 250);
        }
      }
      const result = detector.getBpm();
      assert.ok(result.bpm !== null);
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
      detector.registerOnset(now + 8 * intervalMs - 5);
      const phaseAfter = detector.getPhase(now + 8 * intervalMs);
      assert.ok(Math.abs(phaseAfter - phaseBefore) < 0.05,
        `Phase jittered: ${phaseBefore} -> ${phaseAfter}`);
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

**Step 2: Run test to verify it fails**

Run: `node --test tests/bpm-detector.test.js`
Expected: FAIL — CJS module can't be imported as ESM.

**Step 3: Convert bpm-detector.js to ESM + add quick-lock logic**

```js
// src/bpm-detector.js
export class BpmDetector {
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
    // Quick-lock: tentative BPM from 3 onsets (2 intervals)
    if (this.onsets.length >= 3 && this.onsets.length < 4) {
      return this._quickLock();
    }

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

  _quickLock() {
    const intervals = [];
    for (let i = 1; i < this.onsets.length; i++) {
      intervals.push(this.onsets[i] - this.onsets[i - 1]);
    }

    const minInterval = 60000 / this.maxBpm;
    const maxInterval = 60000 / this.minBpm;
    const valid = intervals.filter(iv => iv >= minInterval && iv <= maxInterval);

    if (valid.length < 2) return { bpm: null, confidence: 0 };

    // Check consistency: intervals within 15% of each other
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const maxDiff = Math.max(...valid.map(iv => Math.abs(iv - avg) / avg));

    if (maxDiff > 0.15) return { bpm: null, confidence: 0 };

    const rawBpm = 60000 / avg;
    const snapped = Math.round(rawBpm * 2) / 2;

    return { bpm: snapped, confidence: 0.4 };
  }

  _autocorrelate(intervals, minInterval, maxInterval) {
    const binSize = 5;
    const bins = {};
    for (const iv of intervals) {
      const bin = Math.round(iv / binSize) * binSize;
      bins[bin] = (bins[bin] || 0) + 1;
    }

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
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/bpm-detector.test.js`
Expected: PASS (all 14 tests including 2 new quick-lock tests)

**Step 5: Commit**

```bash
git add src/bpm-detector.js tests/bpm-detector.test.js
git commit -m "refactor: convert bpm-detector to ESM, add quick-lock (tentative BPM from 3 onsets)"
```

---

### Task 4: Update package.json test command for ESM

**Files:**
- Modify: `package.json`

**Step 1: Run all tests to check current state**

Run: `node --test tests/*.test.js`
Expected: May need adjustment for ESM loading.

**Step 2: Update package.json test script**

The test files now use `import` syntax. Node.js needs to know to treat them as ESM. The simplest approach: add `"type": "module"` to package.json. But this would break the CJS `require()` in electron/*.js files. Instead, keep CJS default and use `--experimental-vm-modules` or rename test files.

Actually, the cleanest approach: since the source files in `src/` use `export`, they work as ESM when imported with `.js` extension in a module context. The test files use `import` so they need ESM context. We can pass `--input-type=module` or just add a file-level approach.

Best approach: Use `--import` flag isn't needed. Node test runner supports ESM natively. We just need to ensure the test files are loaded as ESM. Since package.json has no `"type"` field (defaults to CJS), we need the test runner to know these are ESM files.

Solution: Rename test files to `.mjs` OR add `"type": "module"` to package.json and rename electron files to `.cjs`. Since electron/main.js is referenced by `"main"` in package.json and loaded by Electron directly, it's safest to keep CJS for electron/ and use a different approach for tests.

Simplest: add `"type": "module"` to package.json. Electron's `main` field loads via Node which respects `"type"`, but Electron's `require()` calls work differently. Actually, Electron 40 with `"type": "module"` would try to load `electron/main.js` as ESM, breaking the `require()` calls there.

**Best approach:** Rename electron files to `.cjs` extension so they're always loaded as CJS regardless of package.json `type` field.

```json
{
  "name": "flaysync",
  "version": "0.4.0",
  "type": "module",
  "description": "Real-time BPM detection for VJs — syncs tempo + beat phase to Resolume via Ableton Link",
  "main": "electron/main.cjs",
  "scripts": {
    "start": "electron .",
    "test": "node --test tests/*.test.js",
    "postinstall": "npx @electron/rebuild"
  },
  "keywords": [
    "bpm",
    "vj",
    "resolume",
    "ableton-link"
  ],
  "license": "MIT",
  "dependencies": {
    "abletonlink-addon": "^0.2.9",
    "meyda": "^5.6.3"
  },
  "devDependencies": {
    "electron": "^40.8.0"
  }
}
```

**Step 3: Rename electron files to .cjs**

```bash
git mv electron/main.js electron/main.cjs
git mv electron/preload.js electron/preload.cjs
git mv electron/link.js electron/link.cjs
```

**Step 4: Update require paths in electron files**

In `electron/main.cjs`, update the preload and link require paths:

```js
// electron/main.cjs — only changes are file references
const { LinkBridge } = require('./link.cjs');
// ...
preload: path.join(__dirname, 'preload.cjs'),
```

In `electron/preload.cjs` — no changes needed (it doesn't require other local files).

**Step 5: Update index.html script tags**

Remove the non-module script tags for bpm-detector, onset-detector, tap-tempo. Import them in app.js instead.

In `src/index.html`, remove lines 84-86 (the three script tags for detector/onset/tap) and keep only Meyda and app.js:

```html
  <script src="../node_modules/meyda/dist/web/meyda.js"></script>
  <script type="module" src="app.js"></script>
```

**Step 6: Update app.js imports**

Add imports at top of `src/app.js`:

```js
import { AudioEngine } from './audio.js';
import { BpmDetector } from './bpm-detector.js';
import { OnsetDetector } from './onset-detector.js';
import { TapTempo } from './tap-tempo.js';
```

(The `BpmDetector`, `OnsetDetector`, `TapTempo` are no longer globals.)

**Step 7: Run all tests**

Run: `node --test tests/*.test.js`
Expected: PASS (all 25 tests)

**Step 8: Commit**

```bash
git add package.json electron/main.cjs electron/preload.cjs electron/link.cjs src/index.html src/app.js
git commit -m "refactor: add type:module to package.json, rename electron files to .cjs"
```

---

### Task 5: Add audio level indicator — HTML + CSS

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles.css`

**Step 1: Add audio level bar element to index.html**

After the status div (line 53), add:

```html
    <div class="audio-level-bar">
      <div class="audio-level-fill" id="audioLevel"></div>
    </div>
```

**Step 2: Add CSS for audio level bar**

Add to `src/styles.css`:

```css
/* Audio Level Bar */
.audio-level-bar {
  width: clamp(80px, 40vw, 160px);
  height: 3px;
  background: rgba(139, 92, 246, 0.15);
  border-radius: 2px;
  margin-top: clamp(4px, 1.5vh, 10px);
  overflow: hidden;
  z-index: 3;
  position: relative;
}

.audio-level-fill {
  height: 100%;
  width: 0%;
  border-radius: 2px;
  background: var(--beat-green);
  transition: width 0.05s linear, background 0.15s;
}

.audio-level-fill.hot {
  background: #ff8800;
}

.audio-level-fill.clip {
  background: var(--hot-pink);
}
```

**Step 3: Commit**

```bash
git add src/index.html src/styles.css
git commit -m "feat: add audio level indicator bar (HTML + CSS)"
```

---

### Task 6: Wire audio level indicator in app.js

**Files:**
- Modify: `src/app.js`

**Step 1: Add DOM reference and update logic**

Add DOM reference near existing ones:

```js
const audioLevelEl = document.getElementById('audioLevel');
```

In the `audio.onFeatures` callback, add RMS-based level update:

```js
// Inside audio.onFeatures callback, after existing logic:
const rmsLevel = Math.min(1, (features.rms || 0) * 5);
audioLevelEl.style.width = `${rmsLevel * 100}%`;
audioLevelEl.classList.toggle('hot', rmsLevel > 0.7);
audioLevelEl.classList.toggle('clip', rmsLevel > 0.9);
```

**Step 2: Test manually**

Run: `npm start`
Expected: Thin bar below status text, green when audio playing, orange/red when loud.

**Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: wire audio level indicator to RMS from Meyda"
```

---

### Task 7: Persistent settings with localStorage

**Files:**
- Modify: `src/app.js`

**Step 1: Add save/load functions**

Add near the top of `src/app.js` (after imports):

```js
const SETTINGS_KEY = 'flaysync-settings';

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch { return {}; }
}

function saveSettings(partial) {
  const current = loadSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...partial }));
}
```

**Step 2: Restore settings on device modal open**

In `populateDeviceModal()`, after populating the device list, add:

```js
const saved = loadSettings();
if (saved.deviceId) {
  const option = [...deviceSelect.options].find(o => o.value === saved.deviceId);
  if (option) deviceSelect.value = saved.deviceId;
}
if (saved.bufferSize) {
  deviceBufferSize.value = saved.bufferSize;
}
```

**Step 3: Save settings when starting**

In the `deviceStartBtn` click handler, after getting deviceId and bufferSize:

```js
saveSettings({ deviceId, bufferSize });
```

**Step 4: Save always-on-top preference**

In the `alwaysOnTopToggle` change handler:

```js
saveSettings({ alwaysOnTop: alwaysOnTopToggle.checked });
```

And restore it in `deviceStartBtn` click handler:

```js
const saved = loadSettings();
if (saved.alwaysOnTop !== undefined) {
  alwaysOnTopToggle.checked = saved.alwaysOnTop;
  if (window.flaysync) window.flaysync.setAlwaysOnTop(saved.alwaysOnTop);
}
```

**Step 5: Save on settings panel changes too**

In `restartAudio()`:

```js
saveSettings({ deviceId: audioDeviceSelect.value, bufferSize: parseInt(bufferSizeSelect.value) });
```

**Step 6: Test manually**

Run: `npm start`
1. Select a device and buffer size, click START
2. Close app, reopen
3. Expected: device modal pre-selects the previously chosen device and buffer size

**Step 7: Commit**

```bash
git add src/app.js
git commit -m "feat: persist settings (device, buffer, always-on-top) in localStorage"
```

---

### Task 8: Reduce minimum window to 150x150, responsive scaling

**Files:**
- Modify: `electron/main.cjs`
- Modify: `src/styles.css`

**Step 1: Update electron min window size**

In `electron/main.cjs`, change:
- `minWidth: 200` → `minWidth: 150`
- `minHeight: 200` → `minHeight: 150`

**Step 2: Add responsive hiding for small windows**

Add to `src/styles.css`:

```css
/* Hide status text at very small sizes */
@media (max-width: 179px), (max-height: 179px) {
  .status {
    display: none;
  }
  .beat-dot {
    width: clamp(6px, 3vw, 10px);
    height: clamp(6px, 3vw, 10px);
  }
  .bpm-display {
    font-size: clamp(20px, 12vw, 28px);
  }
}
```

**Note:** Electron window media queries use the window's inner dimensions. At 150x150 window, the inner content area will be 150x150 (frameless), so these media queries will apply.

**Step 3: Test manually**

Run: `npm start`
Resize window to minimum. Expected: status text hides, dots shrink, BPM stays readable.

**Step 4: Commit**

```bash
git add electron/main.cjs src/styles.css
git commit -m "feat: reduce minimum window to 150x150, hide status at small sizes"
```

---

### Task 9: Add Instagram link in settings panel

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles.css`

**Step 1: Add Instagram link in settings panel**

In `src/index.html`, after the settings logo `<img>` tag (line 79), add:

```html
      <a class="instagram-link" href="https://www.instagram.com/flaysh_/" target="_blank" rel="noopener">
        @flaysh_
      </a>
```

**Step 2: Add CSS**

```css
/* Instagram Link */
.instagram-link {
  -webkit-app-region: no-drag;
  font-family: 'Share Tech Mono', monospace;
  font-size: clamp(9px, 2.5vw, 12px);
  color: var(--neon-violet);
  text-decoration: none;
  text-align: center;
  letter-spacing: 0.1em;
  transition: color 0.2s;
  margin-top: 6px;
}

.instagram-link:hover {
  color: var(--hot-pink);
}
```

**Step 3: Make link open in external browser (Electron)**

In `src/app.js`, add click handler to open external links:

```js
document.querySelectorAll('a[target="_blank"]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.flaysync && window.flaysync.openExternal) {
      window.flaysync.openExternal(link.href);
    }
  });
});
```

In `electron/preload.cjs`, add to the exposed API:

```js
openExternal: (url) => ipcRenderer.send('open-external', url),
```

In `electron/main.cjs`, add handler:

```js
const { app, BrowserWindow, ipcMain, shell } = require('electron');
// ...
ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});
```

**Step 4: Test manually**

Run: `npm start`
Open settings, click `@flaysh_`. Expected: Opens Instagram in default browser.

**Step 5: Commit**

```bash
git add src/index.html src/styles.css src/app.js electron/preload.cjs electron/main.cjs
git commit -m "feat: add @flaysh_ Instagram link in settings, open in external browser"
```

---

### Task 10: Improve blob visualizer — smoother energy response

**Files:**
- Modify: `src/app.js`

**Step 1: Add energy smoothing**

Add a smoothed energy variable near existing state:

```js
let smoothedEnergy = 0;
```

In `drawBlobVisualizer()`, replace the raw energy calculation block with smoothed version:

```js
  const freqData = audio.getFrequencyData();
  let rawEnergy = 0;
  if (freqData) {
    for (let i = 0; i < freqData.length; i++) {
      rawEnergy += freqData[i];
    }
    rawEnergy = rawEnergy / (freqData.length * 255);
  }
  // Lowpass smoothing: fast attack, slow decay
  if (rawEnergy > smoothedEnergy) {
    smoothedEnergy = smoothedEnergy + (rawEnergy - smoothedEnergy) * 0.4;
  } else {
    smoothedEnergy = smoothedEnergy + (rawEnergy - smoothedEnergy) * 0.1;
  }
  const energy = smoothedEnergy;
```

**Step 2: Sharper onset pulse (faster attack, slower decay)**

Change onset pulse decay from `0.92` to `0.88` for faster decay, and keep onset pulse set to `1` on onset:

```js
onsetPulse *= 0.88;
```

**Step 3: Test manually**

Run: `npm start`
Expected: Blob responds more smoothly to audio, beats cause sharper visual pulses.

**Step 4: Commit**

```bash
git add src/app.js
git commit -m "feat: improve blob visualizer — smoother energy, sharper beat pulses"
```

---

### Task 11: Production hardening — final cleanup

**Files:**
- Modify: `electron/main.cjs`
- Modify: `src/app.js`

**Step 1: Ensure no openDevTools in electron/main.cjs**

Check `electron/main.cjs` — confirm no `openDevTools()` call exists. (Current code already clean.)

**Step 2: Add error boundary for audio callback**

In `src/app.js`, wrap the `audio.onFeatures` callback in try-catch:

```js
audio.onFeatures = (features) => {
  try {
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

    // Audio level
    const rmsLevel = Math.min(1, (features.rms || 0) * 5);
    audioLevelEl.style.width = `${rmsLevel * 100}%`;
    audioLevelEl.classList.toggle('hot', rmsLevel > 0.7);
    audioLevelEl.classList.toggle('clip', rmsLevel > 0.9);
  } catch (err) {
    // Prevent audio callback errors from crashing the app
  }
};
```

**Step 3: Update version in package.json**

Already set to `0.4.0` in Task 4.

**Step 4: Run all tests**

Run: `node --test tests/*.test.js`
Expected: ALL PASS

**Step 5: Test app manually**

Run: `npm start`
Verify:
- Splash → Device modal → Main UI flow works
- BPM detects from audio input
- Beat dots pulse
- Audio level bar shows signal
- Settings panel opens, device/buffer/always-on-top work
- Instagram link opens browser
- Window resizes to 150x150 cleanly
- /2, x2 buttons work
- TAP and RESYNC work

**Step 6: Commit**

```bash
git add src/app.js
git commit -m "fix: add error boundary for audio callback, production hardening"
```

---

## Summary of Changes

| Task | What | Files |
|------|------|-------|
| 1 | Convert onset-detector to ESM, reduce minInterval | onset-detector.js, test |
| 2 | Convert tap-tempo to ESM | tap-tempo.js, test |
| 3 | Convert bpm-detector to ESM, add quick-lock | bpm-detector.js, test |
| 4 | Package.json type:module, rename electron to .cjs | package.json, electron/*.cjs, index.html, app.js |
| 5 | Audio level indicator HTML + CSS | index.html, styles.css |
| 6 | Wire audio level to RMS | app.js |
| 7 | Persistent settings (localStorage) | app.js |
| 8 | Min window 150x150, responsive hiding | main.cjs, styles.css |
| 9 | Instagram link + external browser open | index.html, styles.css, app.js, preload.cjs, main.cjs |
| 10 | Smoother blob visualizer | app.js |
| 11 | Production hardening, error boundary | app.js |
