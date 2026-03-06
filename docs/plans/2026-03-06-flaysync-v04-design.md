# FLAYSync v0.4 Design

## Goal

Make FLAYSync faster to lock, more accurate, leaner in code, and polished enough to ship to other VJs.

## Reference

Pulse by Hybrid Constructs — real-time BPM analysis tool for VJs/LDs with Ableton Link output. FLAYSync matches its core feature set with a distinct Cyberpunk Neuro Y2K visual identity.

## Architecture

Same stack: Electron + vanilla JS + Meyda + abletonlink-addon + Canvas 2D.

Pipeline: Audio Input → Meyda (RMS, energy) + custom spectral flux → Onset Detection → Quick-Lock BPM → Autocorrelation Refinement → Ableton Link

No new dependencies.

## 1. Audio Recognition — Speed to Lock

### Quick-lock strategy (2-3 beats)

Current algorithm needs ~8 beats to lock. New two-phase approach:

**Phase 1 — Tentative lock (3 onsets / 2 intervals):**
- After 3 onsets, check if the 2 intervals are consistent (within ±15%)
- If consistent, set tentative BPM with confidence 0.4 (below lock threshold, but displays BPM)
- Provides immediate visual feedback

**Phase 2 — Full lock (6+ onsets):**
- Autocorrelation confirms/refines tentative BPM
- Confidence rises above 0.6 → full lock, Link output begins
- Rolling 10s window continues for ongoing refinement

### Onset detector tuning

- Reduce minimum interval from 180ms to 150ms (allows faster 200 BPM detection)
- Keep weighted score: 0.6 × energy + 0.4 × flux
- Keep adaptive threshold at 1.5×

### Meyda spectralFlux bug (CRITICAL — DO NOT CHANGE)

Meyda v5.6.3 `spectralFlux` throws TypeError on first frame (`previousSignal` is undefined). Keep current workaround: compute spectral flux manually from AnalyserNode byte frequency data. NEVER add `spectralFlux` to Meyda's feature extractors array.

### Phase correction

Keep existing: nudge factor 0.1, dead zone 10ms.

## 2. UI/UX Improvements

### Smaller minimum window

- Reduce minimum from 200×200 to 150×150
- At sizes <180px: hide status text, shrink beat dots proportionally
- All elements use relative/percentage sizing — no overlap at any size
- BPM font scales via clamp() with 150px lower bound

### Audio level indicator

- Thin (3px) horizontal bar below beat dots
- Shows RMS level from Meyda
- Color: grey (silent) → green (healthy signal) → orange (hot) → red (clipping)
- Subtle, doesn't compete with blob visualizer

### Blob visualizer improvements

- Keep existing Perlin noise ring design
- Smoother energy response (slight lowpass on energy input)
- Better beat pulse animation (sharper attack, slower decay)

### Instagram link in settings

- Add @flaysh_ with Instagram icon in settings panel
- Links to https://www.instagram.com/flaysh_/

### Layout at 150×150

```
┌────────────────────┐
│ ✕              ⚙   │
│     ● ● ● ●       │
│   ╭───────────╮    │
│   │  120.0    │    │
│   │   BPM     │    │
│   ╰───────────╯    │
│   ▓▓▓▓▓░░░░░░░    │  <- audio level bar
│  /2  x2      TAP   │
└────────────────────┘
```

At <180px, status text ("LOCKED") hides. Beat dots and buttons scale down.

## 3. Persistent Settings

Use `localStorage` to save and restore:
- Last audio input device ID
- Buffer size (512 / 1024)
- Always-on-top preference

Auto-populate device modal on next launch. If saved device unavailable, show full selection.

## 4. Code Simplification

### Unify module system

Convert bpm-detector.js, onset-detector.js, tap-tempo.js from CJS/global to ES modules:
- Remove `if (typeof module !== 'undefined')` shims
- Add `export class` to each
- Update index.html to load all as `type="module"`
- Tests: use dynamic `import()` instead of `require()`

### Remove dead code

- Remove `openDevTools()` from electron/main.js
- Remove all diagnostic `console.log` statements
- Clean up any unused functions

### Keep stable

- ~7 source files, no new files needed
- No new dependencies
- No bundler needed

## 5. Production Hardening

- Throttle visualizer when `document.hidden` (skip rendering)
- Debounce square-resize enforcement (50ms, prevents flicker)
- Handle audio device access errors gracefully (show message in UI)
- Graceful degradation when abletonlink-addon is missing

## 6. Files Changed

- `src/app.js` — quick-lock display, audio level bar, persistent settings, smoother blob
- `src/audio.js` — expose RMS for level bar (already available)
- `src/bpm-detector.js` — quick-lock phase 1 (tentative BPM from 3 onsets), convert to ESM
- `src/onset-detector.js` — reduce minInterval to 150ms, convert to ESM
- `src/tap-tempo.js` — convert to ESM
- `src/index.html` — audio level bar element, update script tags to type="module"
- `src/styles.css` — audio level bar styles, 150px minimum sizing, responsive scaling
- `electron/main.js` — min window 150×150, remove devtools
- `tests/*.test.js` — update imports from require() to import()

## 7. Out of Scope

- BPM range selector (can add later)
- Latency compensation
- Windows build
- OSC output
- New dependencies or frameworks
- Loopback/system audio capture
