# FLAYSync Redesign — Design Document

**Date:** 2026-03-06
**Status:** Approved

## Overview

FLAYSync (formerly flayshlizer) is a real-time BPM detection overlay for VJs. It listens to audio input, detects tempo, and syncs BPM + beat phase to Resolume Arena via Ableton Link. Cyberpunk/Neuro/Y2K aesthetic.

Modeled after [Pulse](https://hybridconstructs.com/pulse/) by Hybrid Constructs, with a hybrid auto-detect + tap approach instead of Pulse's tap-first workflow.

## Rename

Everything changes from `flayshlizer` → `flaysync`:
- Package name, window title, preload API (`window.flaysync`), all references

## Key Features

- **Hybrid BPM detection** — auto-detect from audio, tap to override, continuous fine-tuning
- **Beat phase tracking** — 4/4 bar position sent to Link (not just BPM)
- **4-dot beat indicator** — green pulse on beat when locked, grey when uncertain
- **Circular waveform visualizer** — ring around BPM display, lightweight canvas
- **RESYNC** — ALT+Space resets beat 1
- **Always-on-top** 300x300 square overlay, resizable (min 200x200)
- **FLAYSH splash** on launch + logo in settings

## Architecture

```
Audio Input (Web Audio API + getUserMedia)
    |
    v
Feature Extraction (Meyda: energy, spectralFlux, rms)
    |
    v
Onset Detection (dual: spectral flux + energy confirmation)
    |
    v
Tempo Estimation (autocorrelation, replaces naive median)
    |
    v
Beat Phase Clock (internal 4/4 tracking, onset-driven corrections)
    |
    v
Ableton Link Output (BPM + beat phase to Resolume Arena)
```

## BPM Detection Algorithm

### Problems with current approach
- Only uses `energy` — misses many beats, especially in tracks with sustained bass
- No spectral flux — the best feature for onset detection
- Median-of-intervals is naive — jitters between values
- No BPM smoothing or snapping
- No beat phase tracking at all

### Improved algorithm

1. **Feature extraction:** Meyda extracts `energy`, `spectralFlux`, and `rms`

2. **Onset detection — dual method:**
   - Primary: spectral flux exceeds adaptive threshold (mean x 1.5)
   - Secondary: energy spike confirms (reduces false positives)
   - Both must agree = high confidence onset
   - Minimum onset interval: 333ms (180 BPM cap)

3. **Tempo estimation — autocorrelation:**
   - Autocorrelation on onset times instead of naive median-of-intervals
   - Find the strongest repeating interval in 333ms-1000ms range (60-180 BPM)
   - Much more robust against missed/extra onsets

4. **BPM smoothing:**
   - Once locked, only accept new BPM if within +/-5% of current
   - Larger jumps require 3 consecutive consistent readings
   - Snap to nearest 0.5 BPM for display stability

5. **Beat phase clock:**
   - Internal clock ticks at detected BPM rate
   - Each confirmed onset nudges phase alignment (small corrections, not jumps)
   - Tracks position in 4/4 bar (0-3)
   - Sent to Link every tick

6. **Confidence scoring:**
   - High: consistent onsets, low variance -> green, actively correcting
   - Medium: some inconsistency -> blue, holding BPM, still correcting
   - Low: lost signal or break -> grey, holding BPM, stops correcting

7. **RESYNC:** Manually resets phase to beat 1 without changing BPM

### Parameters
- BPM range: 60-180
- Default buffer size: 512
- Energy window: ~0.5s
- Onset min interval: 333ms
- BPM lock tolerance: +/-5%
- Consecutive readings for jump: 3

## UI Design

### Window
- 300x300 default, 1:1 ratio
- Resizable, min 200x200
- Always-on-top, frameless, semi-transparent dark background
- Draggable

### Main View Layout
```
+----------------------+
| X                  G |  <- close + settings buttons
|       . . . .       |  <- 4 beat phase dots
|    +-------------+   |
|    |             |   |
|    |    128.0    |   |  <- circular ring visualizer
|    |     BPM     |   |    surrounds the BPM display
|    |             |   |
|    +-------------+   |
|      LOCKED          |
|               TAP    |
+----------------------+
```

### States
- **LISTENING** — detecting, BPM dimmed purple, beat dots inactive
- **LOCKED** — confident, BPM electric blue, beat dots pulse green on each beat
- **TAP LOCKED** — tap override active, BPM electric blue, dots pulse
- **UNCERTAIN** — had lock but lost confidence, holds BPM, dots pulse grey
- **NO AUDIO** — no input signal

### Settings Panel (overlays main view)
- Audio input device dropdown
- Buffer size (512 / 1024)
- Link status + peer count
- FLAYSH logo at bottom

### Splash Screen
- FLAYSH logo fades in for 1.5s on launch
- Transitions to main view

### Keyboard Shortcuts
- Space = TAP
- ALT+Space = RESYNC (reset beat 1)
- ESC = close settings panel

### Visual Style
- Cyberpunk/Neuro/Y2K aesthetic
- Color palette: electric blue (#00d4ff), hot pink (#ff2d7b), deep purple (#8b5cf6), chrome (#e2e8f0)
- Orbitron font for BPM, Share Tech Mono for UI
- Scanline overlay effect
- Subtle border glow

## Simplification & Cleanup

### Code cleanup
- Remove all console.log debug statements
- Remove DevTools auto-open from main.js
- Remove unused getTimeDomainData() from AudioEngine
- Merge bpm-detector-core.js + bpm-detector.js into single bpm-detector.js
- Remove Meyda script tag hack — use require() or proper bundling

### File structure
```
flaysync/
├── package.json
├── README.md
├── .gitignore
├── electron/
│   ├── main.js
│   ├── preload.js
│   └── link.js
├── src/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── audio.js
│   ├── bpm-detector.js    <- merged, single file
│   └── tap-tempo.js
├── assets/
│   └── flaysh-logo.png
└── tests/
    ├── bpm-detector.test.js
    └── tap-tempo.test.js
```

## README Contents
- What FLAYSync is (one-liner + screenshot)
- Features list
- Install & run instructions
- How to use (quick start)
- Audio setup tips (dedicated line input > mic, buffer 512+)
- Link setup with Resolume Arena
- Keyboard shortcuts
- License (MIT)
- FLAYSH branding/credits

## Scope

### In scope
- Rename to FLAYSync
- Improved BPM detection (autocorrelation, dual onset, smoothing)
- Beat phase tracking + 4/4 Link output
- New 1:1 UI with beat phase dots, circular visualizer, splash screen
- RESYNC feature
- Production cleanup (no debug, no DevTools)
- README
- FLAYSH logo integration

### Out of scope
- Windows support (future)
- OSC output (future)
- Loopback/system audio capture (future)
- Multiple audio sources (future)
- Electron packaging/installer (future)
