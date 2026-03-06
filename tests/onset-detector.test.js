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
    // Slightly above mean but not enough for combined score to exceed threshold
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
