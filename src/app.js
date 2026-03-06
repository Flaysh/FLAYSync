import { AudioEngine } from './audio.js';

// Globals loaded via script tags: BpmDetector, OnsetDetector, TapTempo

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
const splash = document.getElementById('splash');
const mainUI = document.getElementById('mainUI');
const beatDots = [0, 1, 2, 3].map(i => document.getElementById(`beat${i}`));

// Engine instances
const audio = new AudioEngine();
const bpmDetector = new BpmDetector();
const onsetDetector = new OnsetDetector();
const tapTempo = new TapTempo();

let currentBpm = null;
let currentConfidence = 0;
let isLocked = false;
let tapMode = false;
let tapTimeout;
let lastBeatIndex = -1;

// --- Splash Screen ---
setTimeout(() => {
  mainUI.style.display = '';
}, 1500);

splash.addEventListener('animationend', (e) => {
  if (e.animationName === 'splashFade') {
    splash.style.display = 'none';
  }
});

// --- Circular Visualizer ---
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function drawRingVisualizer() {
  const freqData = audio.getFrequencyData();
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(cx, cy) * 0.82;

  ctx.clearRect(0, 0, w, h);

  if (!freqData) {
    requestAnimationFrame(drawRingVisualizer);
    return;
  }

  const barCount = 90;
  const step = Math.max(1, Math.floor(freqData.length / barCount));
  const angleStep = (Math.PI * 2) / barCount;

  for (let i = 0; i < barCount; i++) {
    const value = freqData[Math.min(i * step, freqData.length - 1)] / 255;
    const angle = i * angleStep - Math.PI / 2;
    const barLen = value * radius * 0.35 + radius * 0.02; // minimum bar length for full ring

    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + barLen);
    const y2 = cy + Math.sin(angle) * (radius + barLen);

    // Color gradient around the ring
    const t = i / barCount;
    let r, g, b;
    if (t < 0.33) {
      const p = t * 3;
      r = Math.round(139 + (0 - 139) * p);
      g = Math.round(92 + (212 - 92) * p);
      b = Math.round(246 + (255 - 246) * p);
    } else if (t < 0.66) {
      const p = (t - 0.33) * 3;
      r = Math.round(0 + (255 - 0) * p);
      g = Math.round(212 + (45 - 212) * p);
      b = Math.round(255 + (123 - 255) * p);
    } else {
      const p = (t - 0.66) * 3;
      r = Math.round(255 + (139 - 255) * p);
      g = Math.round(45 + (92 - 45) * p);
      b = Math.round(123 + (246 - 123) * p);
    }

    const alpha = 0.3 + value * 0.7;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = Math.max(2, (w / barCount) * 0.8);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Subtle ring outline
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  requestAnimationFrame(drawRingVisualizer);
}

requestAnimationFrame(drawRingVisualizer);

// --- Independent Beat Clock for Dots ---
// Runs on rAF, ticks dots based on locked BPM phase regardless of onset detection
function beatClockLoop() {
  if (currentBpm !== null && currentBpm > 0) {
    const now = performance.now();
    const beatIndex = bpmDetector.getBeatIndex(now);
    updateBeatDots(beatIndex, currentConfidence);
  }
  requestAnimationFrame(beatClockLoop);
}
requestAnimationFrame(beatClockLoop);

// --- Audio → BPM Detection ---
audio.onFeatures = (features) => {
  if (tapMode) return;

  const now = performance.now();
  const isOnset = onsetDetector.process(features, now);

  if (isOnset) {
    bpmDetector.registerOnset(now);
  }

  const result = bpmDetector.getBpm();
  if (result.bpm !== null) {
    updateBpm(result.bpm, result.confidence);
  }
};

function updateBpm(bpm, confidence) {
  currentBpm = bpm;
  currentConfidence = confidence;
  isLocked = confidence > 0.6;

  bpmDisplay.textContent = bpm.toFixed(1);
  bpmDisplay.classList.toggle('locked', isLocked);

  if (confidence > 0.6) {
    statusEl.textContent = 'LOCKED';
  } else if (confidence > 0.3) {
    statusEl.textContent = 'UNCERTAIN';
  } else {
    statusEl.textContent = 'LISTENING';
  }

  if (isLocked && window.flaysync) {
    window.flaysync.setLinkTempo(bpm);
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
    // Set phase origin on tap lock so dots work immediately
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
  // Flash all dots briefly
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
  audio.stop();
  bpmDetector.reset();
  onsetDetector.reset();
  await audio.start(deviceId, bufferSize);
}

// --- Close ---
closeBtn.addEventListener('click', () => {
  if (window.flaysync) {
    window.flaysync.closeWindow();
  } else {
    window.close();
  }
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
        el.textContent = `LINK: ACTIVE (${peers} ${peers === 1 ? 'PEER' : 'PEERS'})`;
        el.classList.add('connected');
      } else {
        el.textContent = 'LINK: OFFLINE';
        el.classList.remove('connected');
      }
    } catch (e) {}
  }, 1000);
}

// --- Beat Phase to Link ---
// Send beat phase to Link continuously when locked
function sendBeatPhaseLoop() {
  if (currentBpm !== null && isLocked && window.flaysync) {
    const phase = bpmDetector.getPhase(performance.now());
    window.flaysync.setLinkBeatPhase(phase);
  }
  setTimeout(sendBeatPhaseLoop, 50);
}
sendBeatPhaseLoop();

// --- Init ---
async function init() {
  statusEl.textContent = 'LISTENING';
  try {
    await audio.start(null, parseInt(bufferSizeSelect.value));
  } catch (err) {
    statusEl.textContent = 'NO AUDIO';
  }
  pollLinkStatus();
}

init();
