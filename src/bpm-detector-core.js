class BpmDetector {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 10000;
    this.minBpm = options.minBpm || 60;
    this.maxBpm = options.maxBpm || 200;
    this.onsets = [];
  }

  registerOnset(timestampMs) {
    this.onsets.push(timestampMs);
    const cutoff = timestampMs - this.windowSize;
    this.onsets = this.onsets.filter(t => t >= cutoff);
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
      return { bpm: null, confidence: 0 };
    }

    const sorted = [...validIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const bpm = Math.round((60000 / median) * 10) / 10;

    const mean = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
    const variance = validIntervals.reduce((sum, iv) => sum + (iv - mean) ** 2, 0) / validIntervals.length;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = stdDev / mean;
    const confidence = Math.max(0, Math.min(1, 1 - coeffOfVariation * 3));

    return { bpm, confidence };
  }

  reset() {
    this.onsets = [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BpmDetector };
}
