export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyserNode = null;
    this.source = null;
    this.stream = null;
    this.meydaAnalyzer = null;
    this.onFeatures = null;
    this._prevSpectrum = null;
  }

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  async start(deviceId = null, bufferSize = 1024) {
    const constraints = {
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.audioContext = new AudioContext({ sampleRate: 44100 });
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // Higher FFT for better frequency resolution in flux calculation
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.source.connect(this.analyserNode);

    // Meyda for RMS + energy only.
    // DO NOT add 'spectralFlux' — Meyda v5.6.3 throws TypeError on first frame.
    if (typeof Meyda !== 'undefined') {
      this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
        audioContext: this.audioContext,
        source: this.source,
        bufferSize: bufferSize,
        featureExtractors: ['rms', 'energy'],
        callback: (features) => {
          if (this.onFeatures) {
            features.spectralFlux = this._computeFlux();
            this.onFeatures(features);
          }
        },
      });
      this.meydaAnalyzer.start();
    }
  }

  _computeFlux() {
    if (!this.analyserNode) return 0;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    if (!this._prevSpectrum) {
      this._prevSpectrum = data;
      return 0;
    }
    let flux = 0;
    for (let i = 0; i < data.length; i++) {
      const diff = data[i] - this._prevSpectrum[i];
      if (diff > 0) flux += diff;
    }
    this._prevSpectrum = data;
    return flux / (data.length * 255);
  }

  getFrequencyData() {
    if (!this.analyserNode) return null;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    return data;
  }

  stop() {
    if (this.meydaAnalyzer) this.meydaAnalyzer.stop();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.audioContext) this.audioContext.close();
    this.meydaAnalyzer = null;
    this.analyserNode = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
    this._prevSpectrum = null;
  }
}
