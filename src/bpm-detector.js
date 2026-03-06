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
    if (this.onsets.length < 4) {
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
      // Direct interval gets full weight
      const directBin = Math.round(iv / binSize) * binSize;
      if (directBin >= minInterval && directBin <= maxInterval) {
        bins[directBin] = (bins[directBin] || 0) + 2;
      }
      // Half/double get partial weight (handle subdivisions)
      if (iv * 2 >= minInterval && iv * 2 <= maxInterval) {
        const bin = Math.round((iv * 2) / binSize) * binSize;
        if (bin >= minInterval && bin <= maxInterval) {
          bins[bin] = (bins[bin] || 0) + 1;
        }
      }
      if (iv / 2 >= minInterval && iv / 2 <= maxInterval) {
        const bin = Math.round((iv / 2) / binSize) * binSize;
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
