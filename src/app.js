// src/app.js
import { AudioEngine } from './audio.js';
import { BpmDetector } from './bpm-detector.js';
import { OnsetDetector } from './onset-detector.js';
import { TapTempo } from './tap-tempo.js';

// Persistent settings
const SETTINGS_KEY = 'flaysync-settings';

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch { return {}; }
}

function saveSettings(partial) {
  const current = loadSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...partial }));
}

// DOM references
const splash = document.getElementById('splash');
const deviceModal = document.getElementById('deviceModal');
const deviceSelect = document.getElementById('deviceSelect');
const deviceBufferSize = document.getElementById('deviceBufferSize');
const deviceStartBtn = document.getElementById('deviceStartBtn');
const mainUI = document.getElementById('mainUI');
const bpmDisplay = document.getElementById('bpmDisplay');
const statusEl = document.getElementById('status');
const tapBtn = document.getElementById('tapBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const closeBtn = document.getElementById('closeBtn');
const audioDeviceSelect = document.getElementById('audioDevice');
const bufferSizeSelect = document.getElementById('bufferSize');
const canvas = document.getElementById('ringVisualizer');
const ctx = canvas.getContext('2d');
const beatDots = [0, 1, 2, 3].map(i => document.getElementById(`beat${i}`));
const bpmHalfBtn = document.getElementById('bpmHalf');
const bpmDoubleBtn = document.getElementById('bpmDouble');
const alwaysOnTopToggle = document.getElementById('alwaysOnTop');
const audioLevelEl = document.getElementById('audioLevel');

// Engine instances
const audio = new AudioEngine();
const bpmDetector = new BpmDetector();
const onsetDetector = new OnsetDetector();
const tapTempo = new TapTempo();

// State
let currentBpm = null;
let currentConfidence = 0;
let isLocked = false;
let tapMode = false;
let tapTimeout;
let lastBeatIndex = -1;
let canvasReady = false;
let bpmMultiplier = 1;
let noiseTime = 0;
let onsetPulse = 0;
let smoothedEnergy = 0;

// --- Simple 2D noise (no dependency) ---
function noise2D(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = noise2D(ix, iy);
  const n10 = noise2D(ix + 1, iy);
  const n01 = noise2D(ix, iy + 1);
  const n11 = noise2D(ix + 1, iy + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbmNoise(x, y, octaves = 3) {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}

// --- Splash -> Device Modal ---
setTimeout(() => {
  splash.style.display = 'none';
  deviceModal.style.display = 'flex';
  populateDeviceModal();
}, 1500);

splash.addEventListener('animationend', (e) => {
  if (e.animationName === 'splashFade') {
    splash.style.display = 'none';
  }
});

async function populateDeviceModal() {
  try {
    // Request permission first to get device labels
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await audio.listDevices();
    deviceSelect.innerHTML = devices
      .map(d => `<option value="${d.deviceId}">${d.label || 'Unknown Device'}</option>`)
      .join('');
    const saved = loadSettings();
    if (saved.deviceId) {
      const option = [...deviceSelect.options].find(o => o.value === saved.deviceId);
      if (option) deviceSelect.value = saved.deviceId;
    }
    if (saved.bufferSize) {
      deviceBufferSize.value = saved.bufferSize;
    }
  } catch (err) {
    deviceSelect.innerHTML = '<option>No audio devices found</option>';
  }
}

deviceStartBtn.addEventListener('click', async () => {
  const deviceId = deviceSelect.value;
  const bufferSize = parseInt(deviceBufferSize.value);
  saveSettings({ deviceId, bufferSize });
  deviceModal.style.display = 'none';
  mainUI.style.display = '';

  requestAnimationFrame(() => {
    resizeCanvas();
    canvasReady = true;
  });

  // Sync settings panel values
  audioDeviceSelect.innerHTML = deviceSelect.innerHTML;
  audioDeviceSelect.value = deviceId;
  bufferSizeSelect.value = deviceBufferSize.value;

  const saved = loadSettings();
  if (saved.alwaysOnTop !== undefined) {
    alwaysOnTopToggle.checked = saved.alwaysOnTop;
    if (window.flaysync) window.flaysync.setAlwaysOnTop(saved.alwaysOnTop);
  }

  statusEl.textContent = 'LISTENING';
  try {
    await audio.start(deviceId, bufferSize);
  } catch (err) {
    statusEl.textContent = 'NO AUDIO';
  }
  pollLinkStatus();
});

// --- Blob Contour Visualizer ---
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}

window.addEventListener('resize', resizeCanvas);

function drawBlobVisualizer() {
  if (document.hidden) {
    requestAnimationFrame(drawBlobVisualizer);
    return;
  }

  const w = canvas.width;
  const h = canvas.height;

  if (w === 0 || h === 0) {
    requestAnimationFrame(drawBlobVisualizer);
    return;
  }

  ctx.clearRect(0, 0, w, h);

  const freqData = audio.getFrequencyData();
  let rawEnergy = 0;
  if (freqData) {
    for (let i = 0; i < freqData.length; i++) {
      rawEnergy += freqData[i];
    }
    rawEnergy = rawEnergy / (freqData.length * 255);
  }
  // Lowpass smoothing: fast attack, slow decay
  if (rawEnergy > smoothedEnergy) {
    smoothedEnergy = smoothedEnergy + (rawEnergy - smoothedEnergy) * 0.4;
  } else {
    smoothedEnergy = smoothedEnergy + (rawEnergy - smoothedEnergy) * 0.1;
  }
  const energy = smoothedEnergy;

  // Decay onset pulse
  onsetPulse *= 0.88;

  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.min(cx, cy) * 0.35;
  const ringCount = 10;
  const maxDistortion = Math.min(cx, cy) * 0.25;

  noiseTime += 0.008;

  for (let ring = 0; ring < ringCount; ring++) {
    const t = ring / (ringCount - 1); // 0 (inner) to 1 (outer)
    const ringRadius = baseRadius + (maxDistortion * 0.8) * t;
    const distortAmount = (energy * 0.6 + 0.15 + onsetPulse * 0.3) * maxDistortion * (0.3 + t * 0.7);

    // Color: deep purple (inner) -> electric cyan (outer)
    const r = Math.round(60 + (0 - 60) * t);
    const g = Math.round(30 + (212 - 30) * t);
    const b = Math.round(180 + (255 - 180) * t);
    const alpha = 0.15 + (1 - t) * 0.35 + energy * 0.3;

    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha)})`;
    ctx.lineWidth = Math.max(1, 2.5 - t * 1.5);
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${Math.min(0.6, alpha * 0.5)})`;
    ctx.shadowBlur = 8 + energy * 15;

    const points = 80;
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const noiseVal = fbmNoise(
        Math.cos(angle) * 1.5 + noiseTime + ring * 0.4,
        Math.sin(angle) * 1.5 + noiseTime * 0.7 + ring * 0.4,
        3
      );
      const r2 = ringRadius + noiseVal * distortAmount;
      const x = cx + Math.cos(angle) * r2;
      const y = cy + Math.sin(angle) * r2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Reset shadow for next frame
  ctx.shadowBlur = 0;

  requestAnimationFrame(drawBlobVisualizer);
}

requestAnimationFrame(drawBlobVisualizer);

// --- Beat Clock ---
function beatClockLoop() {
  if (currentBpm !== null && currentBpm > 0) {
    const now = performance.now();
    const beatIndex = bpmDetector.getBeatIndex(now);
    updateBeatDots(beatIndex, currentConfidence);
  }
  requestAnimationFrame(beatClockLoop);
}
requestAnimationFrame(beatClockLoop);

// --- Audio -> BPM Detection ---
audio.onFeatures = (features) => {
  try {
    if (tapMode) return;

    const now = performance.now();
    const isOnset = onsetDetector.process(features, now);

    if (isOnset) {
      bpmDetector.registerOnset(now);
      onsetPulse = 1;
    }

    const result = bpmDetector.getBpm();
    if (result.bpm !== null) {
      updateBpm(result.bpm, result.confidence);
    }

    // Audio level
    const rmsLevel = Math.min(1, (features.rms || 0) * 5);
    audioLevelEl.style.width = `${rmsLevel * 100}%`;
    audioLevelEl.classList.toggle('hot', rmsLevel > 0.7);
    audioLevelEl.classList.toggle('clip', rmsLevel > 0.9);
  } catch (err) {
    // Prevent audio callback errors from crashing the app
  }
};

function getDisplayBpm(bpm) {
  return Math.round(bpm * bpmMultiplier * 10) / 10;
}

function updateBpm(bpm, confidence) {
  currentBpm = bpm;
  currentConfidence = confidence;
  isLocked = confidence > 0.6;

  bpmDisplay.textContent = getDisplayBpm(bpm).toFixed(1);
  bpmDisplay.classList.toggle('locked', isLocked);

  if (confidence > 0.6) {
    statusEl.textContent = 'LOCKED';
  } else if (confidence > 0.3) {
    statusEl.textContent = 'UNCERTAIN';
  } else {
    statusEl.textContent = 'LISTENING';
  }

  if (isLocked && window.flaysync) {
    window.flaysync.setLinkTempo(getDisplayBpm(bpm));
  }
}

function updateBeatDots(beatIndex, confidence) {
  if (beatIndex === lastBeatIndex) return;
  lastBeatIndex = beatIndex;

  beatDots.forEach((dot, i) => {
    dot.classList.remove('active', 'uncertain');
    if (i === beatIndex) {
      dot.classList.add(confidence > 0.6 ? 'active' : 'uncertain');
    }
  });
}

// --- BPM Split/Double ---
bpmHalfBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (bpmMultiplier === 0.5) {
    bpmMultiplier = 1;
  } else {
    bpmMultiplier = 0.5;
  }
  updateMultiplierUI();
  if (currentBpm !== null) updateBpm(currentBpm, currentConfidence);
});

bpmDoubleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (bpmMultiplier === 2) {
    bpmMultiplier = 1;
  } else {
    bpmMultiplier = 2;
  }
  updateMultiplierUI();
  if (currentBpm !== null) updateBpm(currentBpm, currentConfidence);
});

function updateMultiplierUI() {
  bpmHalfBtn.classList.toggle('active', bpmMultiplier === 0.5);
  bpmDoubleBtn.classList.toggle('active', bpmMultiplier === 2);
}

// --- Tap Tempo ---
tapBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  handleTap();
});

document.addEventListener('keydown', (e) => {
  if (settingsPanel.classList.contains('open')) {
    if (e.code === 'Escape') {
      settingsPanel.classList.remove('open');
    }
    return;
  }

  if (e.code === 'Space' && e.altKey) {
    e.preventDefault();
    handleResync();
  } else if (e.code === 'Space') {
    e.preventDefault();
    handleTap();
  }
});

function handleTap() {
  const bpm = tapTempo.tap();
  tapBtn.classList.toggle('locked', tapTempo.isLocked());

  if (tapTempo.isLocked() && bpm !== null) {
    tapMode = true;
    bpmDetector._lockedBpm = bpm;
    bpmDetector._phaseOrigin = performance.now();
    updateBpm(bpm, 1.0);
    statusEl.textContent = 'TAP LOCKED';

    clearTimeout(tapTimeout);
    tapTimeout = setTimeout(() => {
      tapMode = false;
      tapTempo.reset();
      tapBtn.classList.remove('locked');
      statusEl.textContent = 'LISTENING';
    }, 10000);
  }
}

function handleResync() {
  const now = performance.now();
  bpmDetector.resync(now);
  if (window.flaysync) {
    window.flaysync.resyncBeat();
  }
  beatDots.forEach(dot => dot.classList.add('active'));
  setTimeout(() => {
    beatDots.forEach(dot => dot.classList.remove('active'));
  }, 100);
}

// --- Settings Panel ---
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('open');
  populateDevices();
});

closeSettings.addEventListener('click', () => {
  settingsPanel.classList.remove('open');
});

async function populateDevices() {
  const devices = await audio.listDevices();
  audioDeviceSelect.innerHTML = devices
    .map(d => `<option value="${d.deviceId}">${d.label || 'Unknown Device'}</option>`)
    .join('');
}

audioDeviceSelect.addEventListener('change', restartAudio);
bufferSizeSelect.addEventListener('change', restartAudio);

async function restartAudio() {
  const deviceId = audioDeviceSelect.value;
  const bufferSize = parseInt(bufferSizeSelect.value);
  saveSettings({ deviceId, bufferSize });
  audio.stop();
  bpmDetector.reset();
  onsetDetector.reset();
  await audio.start(deviceId, bufferSize);
}

// --- Always on Top ---
alwaysOnTopToggle.addEventListener('change', () => {
  saveSettings({ alwaysOnTop: alwaysOnTopToggle.checked });
  if (window.flaysync) {
    window.flaysync.setAlwaysOnTop(alwaysOnTopToggle.checked);
  }
});

// --- Close ---
closeBtn.addEventListener('click', () => {
  if (window.flaysync) {
    window.flaysync.closeWindow();
  } else {
    window.close();
  }
});

// --- External Links ---
document.querySelectorAll('a[target="_blank"]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.flaysync && window.flaysync.openExternal) {
      window.flaysync.openExternal(link.href);
    }
  });
});

// --- Link Status Polling ---
function pollLinkStatus() {
  if (!window.flaysync) return;
  setInterval(async () => {
    try {
      const status = await window.flaysync.getLinkStatus();
      const el = document.getElementById('linkStatus');
      if (status.enabled) {
        const peers = status.peers || 0;
        el.textContent = `LINK: ${peers} ${peers === 1 ? 'PEER' : 'PEERS'}`;
        el.classList.add('connected');
      } else {
        el.textContent = 'LINK: OFFLINE';
        el.classList.remove('connected');
      }
    } catch (e) {}
  }, 1000);
}

// --- Beat Phase to Link ---
function sendBeatPhaseLoop() {
  if (currentBpm !== null && isLocked && window.flaysync) {
    const phase = bpmDetector.getPhase(performance.now());
    window.flaysync.setLinkBeatPhase(phase);
  }
  setTimeout(sendBeatPhaseLoop, 50);
}
sendBeatPhaseLoop();
