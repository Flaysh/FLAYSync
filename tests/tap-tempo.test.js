const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TapTempo } = require('../src/tap-tempo.js');

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
