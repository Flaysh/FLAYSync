export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyzer = null;
    this.source = null;
    this.stream = null;
    this.onFeatures = null;
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

    this.analyzer = Meyda.createMeydaAnalyzer({
      audioContext: this.audioContext,
      source: this.source,
      bufferSize: bufferSize,
      featureExtractors: ['rms', 'energy', 'spectralFlux', 'spectralCentroid'],
      callback: (features) => {
        if (this.onFeatures) {
          this.onFeatures(features);
        }
      },
    });

    this.analyzer.start();
  }

  stop() {
    if (this.analyzer) this.analyzer.stop();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.audioContext) this.audioContext.close();
    this.analyzer = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
  }
}
