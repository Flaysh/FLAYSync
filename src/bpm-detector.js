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
    this._tapHint = null;
    this._tapHintSetAt = 0;
    this._tapHintDuration = 30000;
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

  _getTapHintWeight() {
    if (this._tapHint === null) return 0;
    const elapsed = performance.now() - this._tapHintSetAt;
    const weight = Math.max(0, 1 - elapsed / this._tapHintDuration);
    if (weight === 0) this._tapHint = null;
    return weight;
  }

  getBpm() {
    const hintWeight = this._getTapHintWeight();

    // Quick-lock: tentative BPM from 3 onsets (2 intervals)
    if (this.onsets.length >= 3 && this.onsets.length < 4) {
      return this._quickLock(hintWeight);
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

    // If tap hint active, bias intervals toward the expected beat period
    const biasedIntervals = (hintWeight > 0.1 && this._tapHint)
      ? this._biasIntervals(validIntervals, this._tapHint, hintWeight)
      : validIntervals;

    // Try autocorrelation first
    const autoResult = this._autocorrelate(biasedIntervals, minInterval, maxInterval);

    // Fallback to weighted median
    const sorted = [...biasedIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const medianBpm = 60000 / median;

    let rawBpm;
    if (autoResult && autoResult.strength > 0.4) {
      rawBpm = autoResult.bpm;
    } else {
      rawBpm = medianBpm;
    }

    // If we have a tap hint, pick the closest harmonic
    if (this._tapHint !== null && hintWeight > 0.1) {
      rawBpm = this._pickClosestHarmonic(rawBpm, this._tapHint);
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

  _quickLock(hintWeight = 0) {
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

    let rawBpm = 60000 / avg;

    // Apply tap hint to quick-lock too
    if (this._tapHint !== null && hintWeight > 0.1) {
      rawBpm = this._pickClosestHarmonic(rawBpm, this._tapHint);
    }

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

  _pickClosestHarmonic(rawBpm, hintBpm) {
    const candidates = [rawBpm, rawBpm / 2, rawBpm * 2, rawBpm / 3, rawBpm * 3];
    let best = rawBpm;
    let bestDiff = Infinity;
    for (const c of candidates) {
      if (c < this.minBpm || c > this.maxBpm) continue;
      const diff = Math.abs(c - hintBpm) / hintBpm;
      if (diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }
    return best;
  }

  _biasIntervals(intervals, hintBpm, weight) {
    // Expected beat period from tap hint
    const hintPeriod = 60000 / hintBpm;
    // Also consider half and double periods
    const hintPeriods = [hintPeriod, hintPeriod / 2, hintPeriod * 2];

    // Score each interval by proximity to any hint period
    const scored = intervals.map(iv => {
      let minDist = Infinity;
      for (const hp of hintPeriods) {
        const dist = Math.abs(iv - hp) / hp;
        if (dist < minDist) minDist = dist;
      }
      return { iv, dist: minDist };
    });

    // Keep intervals that are close to a hint period, plus all intervals if hint is weak
    const threshold = 0.2 + (1 - weight) * 0.8; // tight when hint is fresh, loose as it fades
    const biased = scored.filter(s => s.dist < threshold).map(s => s.iv);

    // Fallback: if too few pass the filter, return originals
    return biased.length >= 3 ? biased : intervals;
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

  setTapHint(bpm) {
    this._tapHint = bpm;
    this._tapHintSetAt = performance.now();
  }

  clearTapHint() {
    this._tapHint = null;
    this._tapHintSetAt = 0;
  }

  reset() {
    this.onsets = [];
    this._lockedBpm = null;
    this._jumpCount = 0;
    this._jumpTarget = null;
    this._phaseOrigin = null;
    this._tapHint = null;
    this._tapHintSetAt = 0;
  }
}
