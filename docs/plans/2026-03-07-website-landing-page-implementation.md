# FLAYSync Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cyberpunk landing page at sync.flaysh.com to sell FLAYSync for $10 via Gumroad.

**Architecture:** Single static HTML page with CSS animations and vanilla JS for the blob visualizer and interactive effects. No framework, no build step. Gumroad overlay handles payment. Vercel hosts the site.

**Tech Stack:** HTML5, CSS3 (animations, custom properties), Vanilla JS (canvas blob, IntersectionObserver), Gumroad embed, Vercel

---

### Task 1: Scaffold website directory and base HTML

**Files:**
- Create: `website/index.html`
- Create: `website/styles.css`
- Create: `website/app.js`
- Create: `website/vercel.json`

**Step 1: Create directory structure**

Run: `mkdir -p website/assets`

**Step 2: Copy assets**

Run: `cp assets/flaysh-logo.png assets/FLAYSync-logo.png assets/icon.png website/assets/`

**Step 3: Convert demo video to mp4**

Run: `ffmpeg -i "/Users/itayflaysher/Desktop/Screen Recording 2026-03-07 at 0.58.31.mov" -vcodec h264 -acodec aac -movflags +faststart -vf "scale=640:-2" website/assets/demo.mp4`

If ffmpeg not installed: `brew install ffmpeg` first.

**Step 4: Create vercel.json**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

**Step 5: Create base index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FLAYSync — Real-time BPM Sync for VJs</title>
  <meta name="description" content="Detect tempo from any audio and sync BPM + beat phase to Resolume Arena via Ableton Link. $10 one-time purchase.">
  <meta property="og:title" content="FLAYSync — Real-time BPM Sync for VJs">
  <meta property="og:description" content="Auto BPM detection, beat phase tracking, Ableton Link sync. Built for VJs.">
  <meta property="og:image" content="/assets/FLAYSync-logo.png">
  <meta property="og:type" content="website">
  <link rel="icon" href="/assets/icon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Hero -->
  <section class="hero" id="hero">
    <canvas class="hero-blob" id="heroBlob"></canvas>
    <div class="hero-scanlines"></div>
    <div class="hero-content">
      <div class="hero-demo-ui">
        <div class="demo-beat-dots">
          <span class="demo-dot" id="demoDot0"></span>
          <span class="demo-dot" id="demoDot1"></span>
          <span class="demo-dot" id="demoDot2"></span>
          <span class="demo-dot" id="demoDot3"></span>
        </div>
        <div class="demo-bpm" id="demoBpm">128.0</div>
        <div class="demo-bpm-label">B P M</div>
      </div>
      <h1 class="hero-title">Real-time BPM sync<br>for VJs</h1>
      <p class="hero-sub">Detects tempo from any audio input and syncs BPM + beat phase to Resolume Arena via Ableton Link.</p>
      <a class="cta-btn" href="https://flaysh.gumroad.com/l/flaysync" data-gumroad-overlay-checkout="true">Get FLAYSync — $10</a>
    </div>
  </section>

  <!-- Video -->
  <section class="video-section" id="video">
    <div class="video-wrapper">
      <video autoplay loop muted playsinline>
        <source src="assets/demo.mp4" type="video/mp4">
      </video>
    </div>
  </section>

  <!-- Features -->
  <section class="features" id="features">
    <h2 class="section-title">Features</h2>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">&#9835;</div>
        <h3>Auto BPM Detection</h3>
        <p>Spectral flux + energy analysis detects tempo from any audio input — line-in, audio interface, or mic.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#8635;</div>
        <h3>Ableton Link Sync</h3>
        <p>Broadcasts BPM + beat phase over Link. Connects to Resolume Arena, Ableton Live, and any Link-enabled app.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#9757;</div>
        <h3>Tap Tempo Hint</h3>
        <p>Tap to guide detection toward the correct BPM range. Resolves half/double-time ambiguity instantly.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#9679;</div>
        <h3>Beat Phase Tracking</h3>
        <p>4 dots show which beat in the 4/4 bar is playing. Your visuals know exactly where in the bar the music is.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&#8982;</div>
        <h3>Always-on-Top Overlay</h3>
        <p>Compact, resizable window sits on top of your VJ software. Minimum 150x150px footprint.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">&times;2</div>
        <h3>Half / Double Time</h3>
        <p>Instantly switch between half-time and double-time with one click.</p>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="how-it-works" id="how">
    <h2 class="section-title">How It Works</h2>
    <div class="steps">
      <div class="step">
        <div class="step-number">1</div>
        <h3>Launch</h3>
        <p>Open FLAYSync and select your audio input device.</p>
      </div>
      <div class="step">
        <div class="step-number">2</div>
        <h3>Play Music</h3>
        <p>BPM is detected automatically. Tap Space to help lock tempo.</p>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <h3>Sync</h3>
        <p>When BPM locks, it syncs to Resolume and any Ableton Link app instantly.</p>
      </div>
    </div>
  </section>

  <!-- Download -->
  <section class="download" id="download">
    <h2 class="section-title">Get FLAYSync</h2>
    <p class="download-price">$10 <span class="price-note">one-time purchase</span></p>
    <p class="download-platforms">macOS 10.15+ &bull; Windows 10+</p>
    <a class="cta-btn cta-btn-large" href="https://flaysh.gumroad.com/l/flaysync" data-gumroad-overlay-checkout="true">Buy Now — $10</a>
    <a class="github-link" href="https://github.com/flaysh/FLAYSync" target="_blank" rel="noopener">Open source on GitHub &#8594;</a>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <a href="https://www.instagram.com/flaysh_/" target="_blank" rel="noopener" class="footer-logo-link">
      <img src="assets/flaysh-logo.png" alt="FLAYSH" class="footer-logo">
    </a>
    <div class="footer-links">
      <a href="https://github.com/flaysh/FLAYSync" target="_blank" rel="noopener">GitHub</a>
      <a href="https://www.instagram.com/flaysh_/" target="_blank" rel="noopener">Instagram</a>
    </div>
    <p class="footer-copy">MIT License &bull; Built by FLAYSH</p>
  </footer>

  <!-- Gumroad -->
  <script src="https://gumroad.com/js/gumroad.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

**Step 6: Commit**

```bash
git add website/
git commit -m "feat: scaffold website directory with base HTML structure"
```

---

### Task 2: CSS — Design system and hero section

**Files:**
- Create: `website/styles.css`

**Step 1: Write the full stylesheet**

```css
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --electric-blue: #00d4ff;
  --hot-pink: #ff2d7b;
  --deep-purple: #8b5cf6;
  --neon-violet: #c084fc;
  --chrome: #e2e8f0;
  --chrome-dim: rgba(226, 232, 240, 0.3);
  --bg-dark: #080414;
  --bg-panel: rgba(20, 10, 40, 0.85);
  --text-dim: rgba(139, 92, 246, 0.5);
  --border-glow: rgba(0, 212, 255, 0.2);
  --beat-green: #00ff88;
}

html {
  scroll-behavior: smooth;
}

body {
  font-family: 'Share Tech Mono', monospace;
  background: var(--bg-dark);
  color: var(--chrome);
  overflow-x: hidden;
}

/* ─── Scanlines ─── */
.hero-scanlines {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(139, 92, 246, 0.03) 2px,
    rgba(139, 92, 246, 0.03) 4px
  );
  pointer-events: none;
  z-index: 2;
}

/* ─── Hero ─── */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hero-blob {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 500px;
  height: 500px;
  z-index: 1;
  opacity: 0.7;
}

.hero-content {
  position: relative;
  z-index: 3;
  text-align: center;
  max-width: 700px;
  padding: 0 24px;
}

.hero-demo-ui {
  margin-bottom: 40px;
}

.demo-beat-dots {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 16px;
}

.demo-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(139, 92, 246, 0.25);
  transition: all 0.1s;
}

.demo-dot.active {
  background: var(--beat-green);
  box-shadow: 0 0 10px var(--beat-green), 0 0 24px rgba(0, 255, 136, 0.5);
}

.demo-bpm {
  font-family: 'Orbitron', monospace;
  font-size: clamp(48px, 10vw, 80px);
  font-weight: 900;
  color: var(--electric-blue);
  text-shadow:
    0 0 20px var(--electric-blue),
    0 0 40px rgba(0, 212, 255, 0.5),
    0 0 80px rgba(0, 212, 255, 0.2);
  letter-spacing: 0.05em;
  line-height: 1;
}

.demo-bpm-label {
  font-size: 13px;
  color: var(--text-dim);
  letter-spacing: 0.5em;
  margin-top: 4px;
}

.hero-title {
  font-family: 'Orbitron', monospace;
  font-size: clamp(24px, 5vw, 48px);
  font-weight: 700;
  color: var(--chrome);
  text-shadow: 0 0 30px rgba(139, 92, 246, 0.4);
  letter-spacing: 0.1em;
  margin-bottom: 16px;
}

.hero-sub {
  font-size: clamp(13px, 2vw, 18px);
  color: var(--chrome-dim);
  max-width: 500px;
  margin: 0 auto 32px;
  line-height: 1.6;
}

/* ─── CTA Button ─── */
.cta-btn {
  display: inline-block;
  font-family: 'Orbitron', monospace;
  font-size: clamp(14px, 2.5vw, 20px);
  font-weight: 700;
  color: var(--electric-blue);
  border: 2px solid var(--electric-blue);
  padding: 14px 40px;
  text-decoration: none;
  letter-spacing: 0.15em;
  transition: all 0.3s;
  background: rgba(0, 212, 255, 0.05);
}

.cta-btn:hover {
  background: rgba(0, 212, 255, 0.15);
  box-shadow: 0 0 30px rgba(0, 212, 255, 0.4), inset 0 0 30px rgba(0, 212, 255, 0.1);
  transform: translateY(-2px);
}

.cta-btn-large {
  font-size: clamp(16px, 3vw, 24px);
  padding: 18px 56px;
}

/* ─── Video Section ─── */
.video-section {
  padding: 80px 24px;
  display: flex;
  justify-content: center;
}

.video-wrapper {
  max-width: 640px;
  width: 100%;
  border: 1px solid var(--border-glow);
  box-shadow: 0 0 40px rgba(0, 212, 255, 0.15), 0 0 80px rgba(139, 92, 246, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.video-wrapper video {
  width: 100%;
  display: block;
}

/* ─── Section Titles ─── */
.section-title {
  font-family: 'Orbitron', monospace;
  font-size: clamp(20px, 4vw, 36px);
  font-weight: 700;
  text-align: center;
  color: var(--chrome);
  text-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
  letter-spacing: 0.2em;
  margin-bottom: 48px;
}

/* ─── Features ─── */
.features {
  padding: 80px 24px;
  max-width: 1000px;
  margin: 0 auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.feature-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-glow);
  padding: 28px 24px;
  transition: all 0.3s;
  opacity: 0;
  transform: translateY(20px);
}

.feature-card.visible {
  opacity: 1;
  transform: translateY(0);
}

.feature-card:hover {
  border-color: var(--deep-purple);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.2), 0 0 40px rgba(0, 212, 255, 0.1);
  transform: translateY(-4px);
}

.feature-icon {
  font-size: 28px;
  color: var(--electric-blue);
  margin-bottom: 12px;
}

.feature-card h3 {
  font-family: 'Orbitron', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--neon-violet);
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}

.feature-card p {
  font-size: 13px;
  color: var(--chrome-dim);
  line-height: 1.6;
}

/* ─── How It Works ─── */
.how-it-works {
  padding: 80px 24px;
  max-width: 800px;
  margin: 0 auto;
}

.steps {
  display: flex;
  gap: 40px;
  justify-content: center;
  flex-wrap: wrap;
}

.step {
  text-align: center;
  max-width: 200px;
  opacity: 0;
  transform: translateY(20px);
}

.step.visible {
  opacity: 1;
  transform: translateY(0);
}

.step-number {
  width: 48px;
  height: 48px;
  border: 2px solid var(--electric-blue);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Orbitron', monospace;
  font-size: 20px;
  font-weight: 700;
  color: var(--electric-blue);
  margin: 0 auto 16px;
  text-shadow: 0 0 10px var(--electric-blue);
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.2);
}

.step h3 {
  font-family: 'Orbitron', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--neon-violet);
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}

.step p {
  font-size: 13px;
  color: var(--chrome-dim);
  line-height: 1.6;
}

/* ─── Download ─── */
.download {
  padding: 80px 24px;
  text-align: center;
}

.download-price {
  font-family: 'Orbitron', monospace;
  font-size: clamp(36px, 7vw, 60px);
  font-weight: 900;
  color: var(--electric-blue);
  text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
  margin-bottom: 8px;
}

.price-note {
  font-size: clamp(14px, 2.5vw, 20px);
  color: var(--chrome-dim);
  font-weight: 400;
}

.download-platforms {
  font-size: 14px;
  color: var(--text-dim);
  letter-spacing: 0.2em;
  margin-bottom: 32px;
}

.github-link {
  display: inline-block;
  margin-top: 24px;
  font-size: 14px;
  color: var(--text-dim);
  text-decoration: none;
  letter-spacing: 0.1em;
  transition: color 0.2s;
}

.github-link:hover {
  color: var(--neon-violet);
}

/* ─── Footer ─── */
.footer {
  padding: 48px 24px;
  text-align: center;
  border-top: 1px solid rgba(139, 92, 246, 0.15);
}

.footer-logo {
  width: 60px;
  opacity: 0.6;
  filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.3));
  transition: all 0.3s;
}

.footer-logo-link:hover .footer-logo {
  opacity: 1;
  filter:
    drop-shadow(0 0 15px rgba(255, 45, 123, 0.6))
    drop-shadow(0 0 30px rgba(0, 212, 255, 0.4));
}

.footer-links {
  margin: 16px 0;
  display: flex;
  gap: 24px;
  justify-content: center;
}

.footer-links a {
  color: var(--text-dim);
  text-decoration: none;
  font-size: 13px;
  letter-spacing: 0.1em;
  transition: color 0.2s;
}

.footer-links a:hover {
  color: var(--electric-blue);
}

.footer-copy {
  font-size: 11px;
  color: rgba(139, 92, 246, 0.3);
  letter-spacing: 0.1em;
}

/* ─── Scroll reveal transition ─── */
.feature-card,
.step {
  transition: opacity 0.6s ease, transform 0.6s ease;
}

/* ─── Responsive ─── */
@media (max-width: 600px) {
  .hero-blob {
    width: 300px;
    height: 300px;
  }

  .steps {
    flex-direction: column;
    align-items: center;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }
}
```

**Step 2: Verify in browser**

Run: `cd website && python3 -m http.server 8080` and open `http://localhost:8080`

**Step 3: Commit**

```bash
git add website/styles.css
git commit -m "feat: cyberpunk CSS design system and all page styles"
```

---

### Task 3: JavaScript — blob visualizer, BPM ticker, beat dots, scroll reveals

**Files:**
- Create: `website/app.js`

**Step 1: Write the JavaScript**

```javascript
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
```

**Step 2: Test in browser**

Run: `cd website && python3 -m http.server 8080`

Verify:
- Blob animates smoothly in hero
- BPM counter cycles through values
- Beat dots pulse in sequence
- Feature cards and steps fade in on scroll

**Step 3: Commit**

```bash
git add website/app.js
git commit -m "feat: blob visualizer, BPM ticker, beat dots, scroll reveals"
```

---

### Task 4: Gumroad setup and final polish

**Step 1: Create Gumroad product**

Manual steps (not code):
1. Go to gumroad.com, create account
2. Create product "FLAYSync" — $10, digital product
3. Upload Mac DMG + Windows EXE as deliverable files
4. Note the product URL slug (e.g., `flaysh.gumroad.com/l/flaysync`)
5. Update the `href` in both CTA buttons in `index.html` to match

**Step 2: Verify Gumroad overlay works**

Open site in browser, click "Buy Now". Gumroad overlay should appear without navigating away.

**Step 3: Commit**

```bash
git add website/index.html
git commit -m "feat: gumroad payment integration"
```

---

### Task 5: Deploy to Vercel and connect domain

**Step 1: Install Vercel CLI (if not installed)**

Run: `npm i -g vercel`

**Step 2: Deploy**

Run: `cd website && vercel --prod`

Follow prompts to link to Vercel account. Set root directory to `website/`.

**Step 3: Add custom domain**

In Vercel dashboard:
1. Go to project Settings > Domains
2. Add `sync.flaysh.com`
3. Vercel will show DNS instructions

**Step 4: Configure DNS**

In your domain registrar (wherever flaysh.com is managed):
- Add CNAME record: `sync` → `cname.vercel-dns.com`
- Wait for propagation (usually < 5 minutes)

**Step 5: Verify**

Run: `curl -I https://sync.flaysh.com`

Expected: HTTP 200, site loads with SSL.

**Step 6: Commit vercel config**

```bash
git add website/vercel.json
git commit -m "feat: vercel deployment config for sync.flaysh.com"
```

---

### Task 6: Final commit and tag

**Step 1: Final check**

- [ ] Site loads at sync.flaysh.com
- [ ] Blob animates in hero
- [ ] BPM ticker cycles
- [ ] Beat dots pulse
- [ ] Video plays
- [ ] Feature cards reveal on scroll
- [ ] "Buy Now" opens Gumroad overlay
- [ ] Mobile responsive

**Step 2: Tag release**

```bash
git tag v0.5.0-website
```
