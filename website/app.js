// ─── Noise functions (from plugin src/app.js) ───
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
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}

// ─── Hero Blob Visualizer ───
const canvas = document.getElementById('heroBlob');
const ctx = canvas.getContext('2d');
let noiseTime = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawBlob() {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) { requestAnimationFrame(drawBlob); return; }

  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.min(cx, cy) * 0.35;
  const maxDistortion = Math.min(cx, cy) * 0.25;
  const ringCount = 10;
  const energy = 0.3 + Math.sin(noiseTime * 2) * 0.15; // Simulated energy

  noiseTime += 0.008;

  for (let ring = 0; ring < ringCount; ring++) {
    const t = ring / (ringCount - 1);
    const ringRadius = baseRadius + (maxDistortion * 0.8) * t;
    const distortAmount = (energy * 0.6 + 0.15) * maxDistortion * (0.3 + t * 0.7);

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
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  requestAnimationFrame(drawBlob);
}

requestAnimationFrame(drawBlob);

// ─── BPM Ticker ───
const bpmEl = document.getElementById('demoBpm');
const bpmValues = [128.0, 130.0, 135.0, 140.0, 150.0, 162.0, 140.0, 128.0];
let bpmIndex = 0;
let currentBpm = bpmValues[0];
let targetBpm = bpmValues[0];

function tickBpm() {
  // Smoothly approach target
  currentBpm += (targetBpm - currentBpm) * 0.05;
  bpmEl.textContent = currentBpm.toFixed(1);
}

setInterval(tickBpm, 50);
setInterval(() => {
  bpmIndex = (bpmIndex + 1) % bpmValues.length;
  targetBpm = bpmValues[bpmIndex];
}, 3000);

// ─── Beat Dots ───
const dots = [0, 1, 2, 3].map(i => document.getElementById(`demoDot${i}`));
let beatIndex = 0;

setInterval(() => {
  dots.forEach(d => d.classList.remove('active'));
  dots[beatIndex].classList.add('active');
  beatIndex = (beatIndex + 1) % 4;
}, 500); // ~120 BPM feel

// ─── Scroll Reveal ───
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .step').forEach(el => {
  observer.observe(el);
});
