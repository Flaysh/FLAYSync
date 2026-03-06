class OnsetDetector {
  constructor(options = {}) {
    this.minInterval = options.minInterval || 333; // 180 BPM cap
    this.fluxWindowSize = options.fluxWindowSize || 20;
    this.fluxMultiplier = options.fluxMultiplier || 1.5;
    this.energyWindowSize = options.energyWindowSize || 20;
    this.energyMultiplier = options.energyMultiplier || 1.3;
    this.minRms = options.minRms || 0.003;

    this.fluxHistory = [];
    this.energyHistory = [];
    this.lastOnsetTime = 0;
  }

  process(features, timestamp) {
    const flux = features.spectralFlux || 0;
    const energy = features.energy || 0;
    const rms = features.rms || 0;

    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.fluxWindowSize) this.fluxHistory.shift();

    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.energyWindowSize) this.energyHistory.shift();

    if (this.fluxHistory.length < 6) return false;

    // Silence gate
    if (rms < this.minRms) return false;

    // Minimum interval
    if (timestamp - this.lastOnsetTime < this.minInterval) return false;

    // Adaptive thresholds
    const meanFlux = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;
    const meanEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    const fluxExceeds = flux > meanFlux * this.fluxMultiplier && flux > 0.01;
    const energyExceeds = energy > meanEnergy * this.energyMultiplier;

    // Both must agree
    if (fluxExceeds && energyExceeds) {
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
