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
