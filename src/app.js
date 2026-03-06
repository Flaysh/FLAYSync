import { AudioEngine } from './audio.js';
import { RealtimeBpmDetector } from './bpm-detector.js';

// DOM elements
const bpmDisplay = document.getElementById('bpmDisplay');
const beatPulse = document.getElementById('beatPulse');
const statusEl = document.getElementById('status');
const tapBtn = document.getElementById('tapBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const closeBtn = document.getElementById('closeBtn');
const audioDeviceSelect = document.getElementById('audioDevice');
const bufferSizeSelect = document.getElementById('bufferSize');
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');

// Engine instances
const audio = new AudioEngine();
const bpmDetector = new RealtimeBpmDetector();
// TapTempo is loaded as a global from script tag
const tapTempo = new TapTempo();

let currentBpm = null;
let isLocked = false;
let tapMode = false;
let tapTimeout;

// --- Visualizer ---
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function drawVisualizer() {
  const freqData = audio.getFrequencyData();
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  if (!freqData) {
    requestAnimationFrame(drawVisualizer);
    return;
  }

  const barCount = Math.min(freqData.length, 64);
  const barWidth = w / barCount;
  const gap = 1;

  for (let i = 0; i < barCount; i++) {
    const value = freqData[i] / 255;
    const barHeight = value * h;

    // Gradient from deep purple → hot pink → electric blue based on frequency
    const t = i / barCount;
    let r, g, b;
    if (t < 0.5) {
      // purple to pink
      const p = t * 2;
      r = Math.round(139 + (255 - 139) * p);
      g = Math.round(92 + (45 - 92) * p);
      b = Math.round(246 + (123 - 246) * p);
    } else {
      // pink to blue
      const p = (t - 0.5) * 2;
      r = Math.round(255 + (0 - 255) * p);
      g = Math.round(45 + (212 - 45) * p);
      b = Math.round(123 + (255 - 123) * p);
    }

    const alpha = 0.4 + value * 0.6;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fillRect(
      i * barWidth + gap / 2,
      h - barHeight,
      barWidth - gap,
      barHeight
    );

    // Glow on top of each bar
    if (value > 0.4) {
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
      ctx.shadowBlur = 8;
      ctx.fillRect(
        i * barWidth + gap / 2,
        h - barHeight,
        barWidth - gap,
        2
      );
      ctx.shadowBlur = 0;
    }
  }

  requestAnimationFrame(drawVisualizer);
}

requestAnimationFrame(drawVisualizer);

// --- BPM Detection ---
audio.onFeatures = (features) => {
  if (tapMode) return;

  const result = bpmDetector.processFeatures(features);
  if (result.bpm !== null) {
    updateBpm(result.bpm, result.confidence);
  }
};

function updateBpm(bpm, confidence) {
  currentBpm = bpm;
  isLocked = confidence > 0.6;

  bpmDisplay.textContent = bpm.toFixed(1);
  bpmDisplay.classList.toggle('locked', isLocked);
  statusEl.textContent = isLocked ? 'LOCKED' : 'LISTENING';

  if (isLocked && window.flaysync) {
    window.flaysync.setLinkTempo(bpm);
  }
}

// --- Beat Pulse Animation ---
let beatInterval = null;

function startBeatPulse(bpm) {
  if (beatInterval) clearInterval(beatInterval);
  const ms = 60000 / bpm;
  beatInterval = setInterval(() => {
    beatPulse.classList.add('active');
    setTimeout(() => beatPulse.classList.remove('active'), 80);
  }, ms);
}

let lastPulseBpm = null;
setInterval(() => {
  if (currentBpm && currentBpm !== lastPulseBpm && isLocked) {
    lastPulseBpm = currentBpm;
    startBeatPulse(currentBpm);
  }
}, 500);

// --- Tap Tempo ---
tapBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  handleTap();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !settingsPanel.classList.contains('open')) {
    e.preventDefault();
    handleTap();
  }
});

function handleTap() {
  const bpm = tapTempo.tap();
  tapBtn.classList.toggle('locked', tapTempo.isLocked());

  if (tapTempo.isLocked() && bpm !== null) {
    tapMode = true;
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

audioDeviceSelect.addEventListener('change', async () => {
  const deviceId = audioDeviceSelect.value;
  const bufferSize = parseInt(bufferSizeSelect.value);
  audio.stop();
  bpmDetector.reset();
  await audio.start(deviceId, bufferSize);
});

bufferSizeSelect.addEventListener('change', async () => {
  const deviceId = audioDeviceSelect.value;
  const bufferSize = parseInt(bufferSizeSelect.value);
  audio.stop();
  bpmDetector.reset();
  await audio.start(deviceId, bufferSize);
});

// --- Close ---
closeBtn.addEventListener('click', () => {
  if (window.flaysync) {
    window.flaysync.closeWindow();
  } else {
    window.close();
  }
});

// --- Start ---
async function init() {
  statusEl.textContent = 'LISTENING';
  console.log('[init] Starting audio engine...');
  console.log('[init] Meyda available:', typeof Meyda !== 'undefined');
  console.log('[init] BpmDetector available:', typeof BpmDetector !== 'undefined');

  try {
    await audio.start(null, parseInt(bufferSizeSelect.value));
    console.log('[init] Audio started successfully');
  } catch (err) {
    statusEl.textContent = 'NO AUDIO';
    console.error('[init] Failed to start audio:', err);
  }

  // Poll Link status every second
  setInterval(async () => {
    if (window.flaysync) {
      try {
        const status = await window.flaysync.getLinkStatus();
        const linkStatusEl = document.getElementById('linkStatus');
        if (status.enabled) {
          const peers = status.peers || 0;
          linkStatusEl.textContent = `LINK: ACTIVE (${peers} ${peers === 1 ? 'PEER' : 'PEERS'})`;
          linkStatusEl.classList.add('connected');
        } else {
          linkStatusEl.textContent = 'LINK: OFFLINE';
          linkStatusEl.classList.remove('connected');
        }
      } catch (e) {
        // Link not available
      }
    }
  }, 1000);
}

init();
