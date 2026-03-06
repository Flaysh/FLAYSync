class OnsetDetector {
  constructor(options = {}) {
    this.minInterval = options.minInterval || 180; // ms — allow fast onset rate
    this.fluxWindowSize = options.fluxWindowSize || 43;
    this.energyWindowSize = options.energyWindowSize || 43;
    this.energyThresholdMultiplier = options.energyThresholdMultiplier || 1.4;
    this.fluxThresholdMultiplier = options.fluxThresholdMultiplier || 1.5;
    this.minRms = options.minRms || 0.005;
    this.minEnergy = options.minEnergy || 0.001;
    this.minFlux = options.minFlux || 0.001;

    this.fluxHistory = [];
    this.energyHistory = [];
    this.lastOnsetTime = 0;
  }

  process(features, timestamp) {
    const flux = features.spectralFlux || 0;
    const energy = features.energy || 0;
    const rms = features.rms || 0;

    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.energyWindowSize) this.energyHistory.shift();

    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.fluxWindowSize) this.fluxHistory.shift();

    if (this.energyHistory.length < 8) return false;

    // Minimum interval
    if (timestamp - this.lastOnsetTime < this.minInterval) return false;

    // Adaptive thresholds
    const meanEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const meanFlux = this.fluxHistory.length > 0
      ? this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length
      : 0;

    // Energy onset: energy spike above adaptive threshold + minimum RMS/energy
    const isEnergyOnset = energy > meanEnergy * this.energyThresholdMultiplier
      && energy > this.minEnergy
      && rms > this.minRms;

    // Flux onset: spectral flux spike
    const isFluxOnset = flux > meanFlux * this.fluxThresholdMultiplier
      && flux > this.minFlux;

    // Either is sufficient — OR logic matches the working version
    if (isEnergyOnset || isFluxOnset) {
      this.lastOnsetTime = timestamp;
      return true;
    }

    return false;
  }

  reset() {
    this.fluxHistory = [];
    this.energyHistory = [];
    this.lastOnsetTime = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OnsetDetector };
}
