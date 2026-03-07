# FLAYSync

Real-time BPM detection overlay for VJs. Detects tempo from any audio input and syncs BPM + beat phase to Resolume Arena (and any Ableton Link-enabled app).

**[Website](https://sync.flaysh.com)** · **[Download](https://flaysh.gumroad.com/l/sync)** · **[Support / Tip](https://flaysh.gumroad.com/l/sync)**

![FLAYSync](assets/FLAYSync-logo.png)

## Features

- **Auto BPM detection** from any audio input (line-in, audio interface, or microphone)
- **Tap tempo with smart hint** — tap to guide detection toward the correct BPM range
- **Beat phase tracking** — sends 4/4 bar position over Link, not just tempo
- **Ableton Link sync** — connects to Resolume Arena, Ableton Live, and any Link-enabled app
- **Quick-lock** — shows tentative BPM after just 3 beats, locks precisely as more data arrives
- **BPM half/double** — instantly switch between half-time and double-time
- **Always-on-top overlay** — compact, resizable window (min 150x150)
- **Persistent settings** — remembers your audio device, buffer size, and preferences
- **Cyberpunk UI** — dark neon interface with organic blob visualizer and beat phase dots

## Requirements

- **macOS** 10.15+ or **Windows** 10+
- Audio input device (audio interface recommended for best results)

## Install

### Download (recommended)

Download the latest release for your platform:

- **Mac:** [FLAYSync.dmg](https://flaysh.gumroad.com/l/sync)
- **Windows:** [FLAYSync-Setup.exe](https://flaysh.gumroad.com/l/sync)

### Build from source

Requires Node.js 18+ and pnpm.

```bash
git clone https://github.com/flaysh/FLAYSync.git
cd FLAYSync
pnpm install
pnpm start
```

## Quick Start

1. Launch FLAYSync — select your audio input device and buffer size
2. Play music — BPM is detected automatically
3. Tap **Space** to help the detector lock onto the correct tempo
4. When BPM locks (turns blue), it syncs to Ableton Link automatically
5. In **Resolume Arena**: enable Ableton Link in preferences

## Audio Setup Tips

| Setup | Quality | Notes |
|-------|---------|-------|
| Line-in from mixer | Best | Direct signal, no noise |
| USB audio interface | Great | Low latency, clean signal |
| Built-in microphone | OK | Works, but ambient noise reduces accuracy |

- **Buffer 1024** (default) — best accuracy
- **Buffer 512** — faster response, slightly less accurate

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Tap tempo |
| Alt + Space | Resync beat phase (reset beat 1) |
| Esc | Close settings panel |

## How It Works

FLAYSync captures audio, extracts spectral + energy features (Meyda), detects beat onsets via spectral flux + energy analysis, estimates tempo via autocorrelation, and broadcasts BPM + beat phase over Ableton Link.

**Tap tempo as a hint:** When you tap a BPM, the detector uses it as a guide — biasing detection toward that tempo range and resolving half/double-time ambiguity. The hint fades over 30 seconds as audio detection takes over.

The beat phase indicator (4 dots) shows which beat in the 4/4 bar is currently playing — green when confident, grey when uncertain. This phase syncs to Resolume so your visuals know exactly where in the bar the music is.

## Architecture

```
src/
  app.js             — Main app, UI, audio callback loop
  audio.js           — Web Audio API + Meyda feature extraction
  bpm-detector.js    — Autocorrelation BPM detection + tap hint + smoothing
  onset-detector.js  — Spectral flux + energy onset detection
  tap-tempo.js       — Tap tempo with timeout and lock
  styles.css         — Cyberpunk UI styles
  index.html         — App layout

electron/
  main.cjs           — Electron main process
  preload.cjs        — Context bridge (IPC)
  link.cjs           — Ableton Link integration

website/             — Landing page at sync.flaysh.com

tests/
  bpm-detector.test.js
  onset-detector.test.js
  tap-tempo.test.js
```

## Testing

```bash
pnpm test
```

## License

MIT — free and open source.

## Support / Donate

FLAYSync is **100% free** — no trials, no feature gates, no strings attached.

If it saves your set, consider supporting development. Every donation helps keep FLAYSync maintained and improved.

**[Donate on Gumroad](https://flaysh.gumroad.com/l/sync)** — name your price, pay what you want.

---

Built by [FLAYSH](https://www.instagram.com/flaysh_/)
