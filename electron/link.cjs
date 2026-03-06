let AbletonLink;
try {
  AbletonLink = require('abletonlink-addon');
} catch (err) {
  AbletonLink = null;
}

class LinkBridge {
  constructor() {
    this.link = null;
    this.enabled = false;
  }

  start() {
    if (!AbletonLink) return false;
    this.link = new AbletonLink();
    this.link.enable();
    this.link.setQuantum(4);
    this.enabled = true;
    return true;
  }

  setTempo(bpm) {
    if (!this.link || !this.enabled) return;
    this.link.setTempo(bpm);
  }

  setBeatPhase(phase) {
    if (!this.link || !this.enabled) return;
    // Force beat phase alignment — Link uses this for downbeat sync
    try {
      this.link.forceBeatAtTime(phase, Date.now() * 1000, 4);
    } catch (e) {
      // Not all Link addon versions support forceBeatAtTime
    }
  }

  resync() {
    if (!this.link || !this.enabled) return;
    try {
      this.link.forceBeatAtTime(0, Date.now() * 1000, 4);
    } catch (e) {
      // Fallback: just reset internally
    }
  }

  getStatus() {
    if (!this.link || !this.enabled) {
      return { enabled: false, tempo: 0, peers: 0, beat: 0, phase: 0 };
    }
    return {
      enabled: true,
      tempo: this.link.getTempo(),
      beat: this.link.getBeat(),
      phase: this.link.getPhase(),
      peers: this.link.getNumPeers(),
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
