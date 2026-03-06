let AbletonLink;
try {
  const addon = require('abletonlink-addon');
  AbletonLink = addon.AbletonLink;
} catch (err) {
  console.warn('abletonlink-addon not available, Link disabled:', err.message);
  AbletonLink = null;
}

class LinkBridge {
  constructor() {
    this.link = null;
    this.enabled = false;
  }

  start() {
    if (!AbletonLink) {
      console.warn('Ableton Link not available');
      return false;
    }

    this.link = new AbletonLink();
    this.link.enable();
    this.link.setQuantum(4);
    this.enabled = true;

    this.link.setNumPeersCallback((numPeers) => {
      console.log(`Link peers: ${numPeers}`);
    });

    return true;
  }

  setTempo(bpm) {
    if (!this.link || !this.enabled) return;
    this.link.setTempo(bpm);
  }

  getStatus() {
    if (!this.link || !this.enabled) {
      return { enabled: false, tempo: 0, peers: 0, beat: 0 };
    }
    return {
      enabled: true,
      tempo: this.link.getTempo(true),
      beat: this.link.getBeat(true),
      phase: this.link.getPhase(true),
    };
  }

  stop() {
    if (this.link) {
      this.link.disable();
      this.enabled = false;
    }
  }
}

module.exports = { LinkBridge };
