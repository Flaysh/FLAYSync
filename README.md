# FLAYSync

Real-time BPM detection for VJs. Syncs tempo and beat phase to Resolume Arena via Ableton Link.

![FLAYSync](assets/flaysh-logo.png)

## Features

- **Auto BPM detection** from any audio input device
- **Beat phase tracking** — sends 4/4 bar position to Link, not just BPM
- **Tap tempo** — tap 5 times to override (spacebar or click)
- **Ableton Link** — syncs BPM + beat position to Resolume Arena and any Link-enabled app
- **Always-on-top overlay** — compact 300x300 square, resizable
- **Cyberpunk UI** — dark, neon-accented interface with circular waveform visualizer

## Install

```bash
git clone <repo-url>
cd flaysync
npm install
```

Requires Node.js 18+ and macOS (Windows support planned).

## Run

```bash
npm start
```

## Quick Start

1. Launch FLAYSync — splash screen shows, then the main overlay appears
2. Select your audio input device in Settings (gear icon)
3. Play music — FLAYSync auto-detects BPM
4. When BPM locks (turns blue), it syncs to Ableton Link automatically
5. In Resolume Arena: enable Ableton Link in preferences

## Audio Setup Tips

- **Best:** Dedicated line input from mixer/audio interface
- **Good:** External USB audio interface
- **OK:** Built-in laptop microphone (works, but less accurate)
- Use buffer size 512 (default) for best balance of speed and accuracy
- Higher buffer (1024) can improve accuracy in noisy environments

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Tap tempo |
| ALT + Space | Resync (reset beat 1) |
| ESC | Close settings |

## How It Works

FLAYSync captures audio from your selected input device, extracts spectral and energy features in real-time using Meyda, detects beat onsets using dual spectral flux + energy analysis, estimates tempo via autocorrelation, and broadcasts BPM + beat phase over Ableton Link.

The beat phase indicator (4 dots) shows which beat in the 4/4 bar is currently playing — green when confident, grey when uncertain. This phase information syncs to Resolume so your visuals know exactly where in the bar the music is.

## License

MIT

---

Built by **FLAYSH**
