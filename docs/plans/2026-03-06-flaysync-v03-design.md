# FLAYSync v0.3 Design

## Goal

Make FLAYSync a production-ready Pulse alternative: accurate BPM detection, clean code, polished Cyberpunk Neuro Y2K UI, and shippable to other VJs.

## Reference

Pulse by Hybrid Constructs — real-time BPM analysis tool for VJs/LDs with Ableton Link output. FLAYSync matches its core feature set with a distinct visual identity.

## Architecture

Same stack: Electron + vanilla JS + Meyda + abletonlink-addon + Canvas 2D.

Pipeline: Audio Input -> Meyda (RMS, energy) + custom spectral flux -> Onset Detection -> BPM Estimation -> Ableton Link

No frameworks added. No new dependencies.

## 1. Audio Recognition Improvements

### Meyda spectralFlux bug (CRITICAL)

Meyda v5.6.3 `spectralFlux` throws TypeError on first frame (`previousSignal` is undefined). Keep the current workaround: compute spectral flux manually from AnalyserNode byte frequency data. Do NOT add `spectralFlux` to Meyda's feature extractors.

### Better frequency resolution

Increase AnalyserNode FFT size from 256 to 512. More frequency bins = more accurate flux calculation.

### Improved onset detection

Replace OR logic (energy OR flux) with a weighted combined score:
- `score = 0.6 * normalizedEnergy + 0.4 * normalizedFlux`
- Fire onset when score exceeds adaptive threshold
- Reduces false positives from isolated flux spikes or energy bumps

### Improved BPM estimation

Add autocorrelation on onset intervals alongside the current median approach:
- Autocorrelation finds the strongest periodic pattern in onset timing
- More robust for electronic music with consistent kick patterns
- Fall back to median when autocorrelation confidence is low

### Phase correction

- Tighten nudge factor from 0.2 to 0.1 for smoother correction
- Add dead zone: skip nudge when error < 10ms to prevent jitter

## 2. UI/UX Overhaul

### App flow

1. Splash screen (1.5s, existing)
2. Device selection modal (NEW - fullscreen, cyberpunk styled)
   - List of available audio input devices
   - Buffer size selector (512 / 1024)
   - "START" button to proceed
3. Main UI

### Main UI layout (300x300 square, resizable)

```
[X]                    [gear]       <- close / settings

     ~~~blob visualizer~~~
     ~~ concentric rings ~~
     ~~    with glow     ~~
     ~~   [ 128.0 ]     ~~
     ~~   [  BPM  ]     ~~
     ~~~~~~~~~~~~~~~~~~~~~

       [.] [.] [.] [.]             <- beat dots

          LOCKED                    <- status

[x2] [/2]              [TAP]       <- split/double + tap
```

### Blob contour visualizer (replaces radial bars)

Inspired by the reference image: organic, topographic-map-style concentric curves.

Implementation:
- 8-12 concentric polar curves
- Base shape is a circle, distorted by Perlin/simplex noise
- Each ring has slightly different noise offset (creates the layered organic look)
- Audio energy drives distortion magnitude (louder = more warped)
- Beat onsets trigger a brief pulse/expansion
- Color: deep purple (inner) -> electric cyan (outer), matching existing palette
- Glow via `ctx.shadowBlur` and `ctx.shadowColor`
- Canvas 2D, same rendering approach as current visualizer

Performance: throttle to ~30fps when idle, skip rendering when `document.hidden`.

### BPM split/double buttons

- Two small buttons bottom-left: "x2" and "/2"
- Internally: a multiplier (0.5, 1, 2) applied to detected BPM before display and Link output
- Visual feedback: buttons glow when multiplier != 1
- Resets to 1x when detection relocks to a significantly different tempo

## 3. Settings Panel

- Audio input selector (existing)
- Buffer size selector (existing)
- Always on top toggle (NEW)
- Link status display (existing)
- FLAYSH logo (existing)

Always on top toggle: calls `mainWindow.setAlwaysOnTop()` via IPC. Default: on.

## 4. Production Hardening

- Remove `openDevTools()` from electron/main.js
- Remove all diagnostic `console.log` statements from app.js
- Throttle visualizer when window is hidden (`document.hidden` check)
- Handle audio device access errors gracefully (show message in UI)
- Clean up square-resize enforcement (debounce to prevent flicker)
- Remove CJS shims (`if (typeof module !== 'undefined')`) — use ES modules consistently for browser code, keep CJS for Electron main process

## 5. Code Simplification

- Unify module system: browser files use ES modules only
- Remove diagnostic logging
- Consolidate onset + BPM detector APIs (no breaking changes, just cleaner internals)
- Keep file count stable (~7 source files)
- No new dependencies

## 6. Files Changed

- `electron/main.js` — remove devtools, add always-on-top IPC, debounce resize
- `electron/preload.js` — add setAlwaysOnTop bridge
- `src/index.html` — add device selection modal, split/double buttons, update script loading
- `src/styles.css` — device modal styles, split/double button styles, visualizer updates
- `src/app.js` — device selection flow, split/double logic, new visualizer, remove debug logs
- `src/audio.js` — increase FFT size, cleanup
- `src/bpm-detector.js` — autocorrelation, phase correction improvements, remove CJS shim
- `src/onset-detector.js` — weighted combined score, remove CJS shim
- `src/tap-tempo.js` — remove CJS shim

## 7. Out of Scope

- Latency compensation (can add later)
- Audio level meter (visualizer + dots provide enough feedback)
- Multiple window support
- Windows build
- New dependencies or frameworks
