import { AudioEngine } from './audio.js';
import { RealtimeBpmDetector } from './bpm-detector.js';

// DOM elements
const bpmDisplay = document.getElementById('bpmDisplay');
const beatPulse = document.getElementById('beatPulse');
const audioBar = document.getElementById('audioBar');
const statusEl = document.getElementById('status');
const tapBtn = document.getElementById('tapBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const closeBtn = document.getElementById('closeBtn');
const audioDeviceSelect = document.getElementById('audioDevice');
const bufferSizeSelect = document.getElementById('bufferSize');

// Engine instances
const audio = new AudioEngine();
const bpmDetector = new RealtimeBpmDetector();
// TapTempo is loaded as a global from script tag
const tapTempo = new TapTempo();

let currentBpm = null;
let isLocked = false;
let tapMode = false;
let tapTimeout;

// --- BPM Detection ---
audio.onFeatures = (features) => {
  const rms = features.rms || 0;
  audioBar.style.width = `${Math.min(rms * 300, 100)}%`;

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
  beatPulse.classList.toggle('active', isLocked);
  beatPulse.classList.toggle('uncertain', !isLocked);
  statusEl.textContent = isLocked ? 'LOCKED' : 'LISTENING';

  if (isLocked && window.flayshlizer) {
    window.flayshlizer.setLinkTempo(bpm);
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
  if (window.flayshlizer) {
    window.flayshlizer.closeWindow();
  } else {
    window.close();
  }
});

// --- Start ---
async function init() {
  statusEl.textContent = 'LISTENING';
  try {
    await audio.start(null, parseInt(bufferSizeSelect.value));
  } catch (err) {
    statusEl.textContent = 'NO AUDIO';
    console.error('Failed to start audio:', err);
  }

  // Poll Link status every second
  setInterval(async () => {
    if (window.flayshlizer) {
      try {
        const status = await window.flayshlizer.getLinkStatus();
        const linkStatusEl = document.getElementById('linkStatus');
        if (status.enabled) {
          linkStatusEl.textContent = 'LINK: ACTIVE';
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
