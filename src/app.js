import { AudioEngine } from './audio.js';

const audio = new AudioEngine();
const bpmDisplay = document.querySelector('h1');

audio.onFeatures = (features) => {
  const level = Math.round(features.rms * 100);
  bpmDisplay.textContent = `RMS: ${level}`;
};

audio.start().catch(err => {
  bpmDisplay.textContent = 'No audio';
  console.error('Audio error:', err);
});
