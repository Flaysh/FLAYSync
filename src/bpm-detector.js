// BpmDetector core is loaded via bpm-detector-core.js script tag (no bundler)
// The BpmDetector class is available on the global scope

export class RealtimeBpmDetector {
  constructor(options = {}) {
    this.core = new BpmDetector(options);

    // Energy-based onset detection (primary — much more reliable than spectralFlux)
    this.energyHistory = [];
    this.energyWindowSize = 43; // ~1 second at 1024 buffer / 44100Hz (~23ms per frame)
    this.energyThresholdMultiplier = 1.4;

    // Spectral flux as secondary confirmation
    this.fluxHistory = [];
    this.fluxWindowSize = 43;

    this.minOnsetInterval = 180; // ms — fastest we expect beats (333 BPM)
    this.lastOnsetTime = 0;
    this.onChange = null;
    this._lastBpm = null;
    this._frameCount = 0;
  }

  processFeatures(features, timestamp) {
    this._frameCount++;
    const now = timestamp || performance.now();

    const energy = features.energy || 0;
    const rms = features.rms || 0;
    const flux = features.spectralFlux || 0;

    // Track energy history
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.energyWindowSize) {
      this.energyHistory.shift();
    }

    // Track flux history
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.fluxWindowSize) {
      this.fluxHistory.shift();
    }

    // Need at least some history before detecting
    if (this.energyHistory.length < 8) {
      return this.core.getBpm();
    }

    // Adaptive energy threshold
    const meanEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const energyThreshold = meanEnergy * this.energyThresholdMultiplier;

    // Adaptive flux threshold
    const meanFlux = this.fluxHistory.length > 0
      ? this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length
      : 0;

    // Onset detection: energy spike above adaptive threshold
    // Also require minimum RMS so we don't trigger on silence noise
    const isEnergyOnset = energy > energyThreshold && energy > 0.001 && rms > 0.005;
    const isFluxOnset = flux > meanFlux * 1.5 && flux > 0.001;
    const isOnset = isEnergyOnset || isFluxOnset;

    const timeSinceLastOnset = now - this.lastOnsetTime;
    if (isOnset && timeSinceLastOnset > this.minOnsetInterval) {
      this.lastOnsetTime = now;
      this.core.registerOnset(now);
    }

    // Get current BPM estimate
    const result = this.core.getBpm();
    if (result.bpm !== this._lastBpm && result.bpm !== null) {
      this._lastBpm = result.bpm;
      if (this.onChange) this.onChange(result);
    }

    return result;
  }

  reset() {
    this.core.reset();
    this.energyHistory = [];
    this.fluxHistory = [];
    this.lastOnsetTime = 0;
    this._lastBpm = null;
    this._frameCount = 0;
  }
}
