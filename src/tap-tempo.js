class TapTempo {
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TapTempo };
}
