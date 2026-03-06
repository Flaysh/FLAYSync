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
