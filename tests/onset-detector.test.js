const { describe, it } = require('node:test');
const assert = require('node:assert');
const { OnsetDetector } = require('../src/onset-detector.js');

describe('OnsetDetector', () => {
  it('detects onset when both flux and energy spike', () => {
    const detector = new OnsetDetector();
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.01 }, 1000 + i * 12);
    }
    const result = detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1120);
    assert.strictEqual(result, true);
  });

  it('detects onset from energy spike alone (OR logic)', () => {
    const detector = new OnsetDetector();
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.01 }, 1000 + i * 12);
    }
    // Energy spikes but flux does not — should still detect
    const result = detector.process({ spectralFlux: 0.01, energy: 0.1, rms: 0.1 }, 1120);
    assert.strictEqual(result, true);
  });

  it('detects onset from flux spike alone (OR logic)', () => {
    const detector = new OnsetDetector();
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.01 }, 1000 + i * 12);
    }
    // Flux spikes but energy does not — should still detect
    const result = detector.process({ spectralFlux: 0.5, energy: 0.001, rms: 0.1 }, 1120);
    assert.strictEqual(result, true);
  });

  it('respects minimum interval between onsets', () => {
    const detector = new OnsetDetector({ minInterval: 333 });
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.01 }, 1000 + i * 12);
    }
    detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1120);
    const result = detector.process({ spectralFlux: 0.5, energy: 0.1, rms: 0.1 }, 1200);
    assert.strictEqual(result, false);
  });

  it('ignores silence (low rms) for energy onsets', () => {
    const detector = new OnsetDetector();
    for (let i = 0; i < 10; i++) {
      detector.process({ spectralFlux: 0.01, energy: 0.001, rms: 0.001 }, 1000 + i * 12);
    }
    // Energy spikes but rms is near zero — energy onset requires rms
    const result = detector.process({ spectralFlux: 0.01, energy: 0.1, rms: 0.001 }, 1120);
    assert.strictEqual(result, false);
  });
});
