// BpmDetector core is loaded via bpm-detector-core.js script tag (no bundler)
// The BpmDetector class is available on the global scope

export class RealtimeBpmDetector {
  constructor(options = {}) {
    this.core = new BpmDetector(options);
    this.fluxHistory = [];
    this.fluxWindowSize = 10;
    this.thresholdMultiplier = 1.5;
    this.minOnsetInterval = 200;
    this.lastOnsetTime = 0;
    this.onChange = null;
    this._lastBpm = null;
  }

  processFeatures(features, timestamp) {
    const flux = features.spectralFlux || 0;
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.fluxWindowSize) {
      this.fluxHistory.shift();
    }

    const meanFlux = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;
    const threshold = meanFlux * this.thresholdMultiplier;

    const now = timestamp || performance.now();
    if (flux > threshold && flux > 0.01 && (now - this.lastOnsetTime) > this.minOnsetInterval) {
      this.lastOnsetTime = now;
      this.core.registerOnset(now);
    }

    const result = this.core.getBpm();
    if (result.bpm !== this._lastBpm && result.bpm !== null) {
      this._lastBpm = result.bpm;
      if (this.onChange) this.onChange(result);
    }

    return result;
  }

  reset() {
    this.core.reset();
    this.fluxHistory = [];
    this.lastOnsetTime = 0;
    this._lastBpm = null;
  }
}
