export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyserNode = null;
    this.source = null;
    this.stream = null;
    this.meydaAnalyzer = null;
    this.onFeatures = null;
  }

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  async start(deviceId = null, bufferSize = 512) {
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

    // AnalyserNode for the visualizer
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.source.connect(this.analyserNode);

    // Meyda for feature extraction
    if (typeof Meyda !== 'undefined') {
      this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
        audioContext: this.audioContext,
        source: this.source,
        bufferSize: bufferSize,
        featureExtractors: ['rms', 'energy', 'spectralFlux'],
        callback: (features) => {
          if (this.onFeatures) this.onFeatures(features);
        },
      });
      this.meydaAnalyzer.start();
    }
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
  }
}
