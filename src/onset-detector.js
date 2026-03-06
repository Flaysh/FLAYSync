class OnsetDetector {
  constructor(options = {}) {
    this.minInterval = options.minInterval || 180;
    this.windowSize = options.windowSize || 43;
    this.thresholdMultiplier = options.thresholdMultiplier || 1.5;
    this.minRms = options.minRms || 0.005;

    this.fluxHistory = [];
    this.energyHistory = [];
    this.lastOnsetTime = 0;
  }

  process(features, timestamp) {
    const flux = features.spectralFlux || 0;
    const energy = features.energy || 0;
    const rms = features.rms || 0;

    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.windowSize) this.energyHistory.shift();

    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > this.windowSize) this.fluxHistory.shift();

    if (this.energyHistory.length < 8) return false;
    if (timestamp - this.lastOnsetTime < this.minInterval) return false;
    if (rms < this.minRms) return false;

    const meanEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const meanFlux = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;

    // Normalize relative to adaptive mean (how many times above average)
    const normEnergy = meanEnergy > 0 ? energy / meanEnergy : 0;
    const normFlux = meanFlux > 0 ? flux / meanFlux : 0;

    // Weighted combined score
    const score = 0.6 * normEnergy + 0.4 * normFlux;

    if (score > this.thresholdMultiplier) {
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
