const { describe, it } = require('node:test');
const assert = require('node:assert');
const { BpmDetector } = require('../src/bpm-detector-core.js');

describe('BpmDetector', () => {
  it('detects 120 BPM from evenly spaced onsets', () => {
    const detector = new BpmDetector();
    const intervalMs = 500;
    const now = 1000;

    for (let i = 0; i < 10; i++) {
      detector.registerOnset(now + i * intervalMs);
    }

    const result = detector.getBpm();
    assert.ok(result.bpm >= 118 && result.bpm <= 122, `Expected ~120, got ${result.bpm}`);
    assert.ok(result.confidence > 0.7, `Expected high confidence, got ${result.confidence}`);
  });

  it('detects 140 BPM', () => {
    const detector = new BpmDetector();
    const intervalMs = 60000 / 140;
    const now = 1000;

    for (let i = 0; i < 10; i++) {
      detector.registerOnset(now + i * intervalMs);
    }

    const result = detector.getBpm();
    assert.ok(result.bpm >= 138 && result.bpm <= 142, `Expected ~140, got ${result.bpm}`);
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
    assert.ok(result.confidence < 0.5, `Expected low confidence, got ${result.confidence}`);
  });
});
