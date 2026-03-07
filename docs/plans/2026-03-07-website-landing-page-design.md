# FLAYSync Landing Page Design

**Date:** 2026-03-07
**URL:** sync.flaysh.com

## Overview

Single-page static landing site to sell FLAYSync for $10 via Gumroad. Cyberpunk Neuro Y2K design matching the plugin aesthetic.

## Tech Stack

- Static HTML + CSS + Vanilla JS (no framework, no build step)
- Gumroad embed for $10 payment + download delivery
- Vercel for hosting (free tier, custom domain sync.flaysh.com)

## Design System (from plugin)

- **Colors:** `--electric-blue: #00d4ff`, `--hot-pink: #ff2d7b`, `--deep-purple: #8b5cf6`, `--neon-violet: #c084fc`, `--beat-green: #00ff88`, `--bg-dark: rgba(8, 4, 20, 0.92)`
- **Fonts:** Orbitron (headings), Share Tech Mono (body)
- **Effects:** Scanline overlay, neon glow text-shadows, glitch hover on logo, dark glass panels (`--bg-panel`)

## Page Sections

### 1. Hero (full viewport)
- Animated canvas blob visualizer (ported from plugin's ring-visualizer)
- Cycling BPM counter animation (128.0 → 140.0 → 162.0)
- Beat phase dots pulsing in sequence (1→2→3→4)
- Scanline overlay effect
- Embedded demo video in a floating neon-bordered window
- Headline: "Real-time BPM sync for VJs"
- Subhead: "Detects tempo from any audio and syncs to Resolume via Ableton Link"
- CTA button → Gumroad overlay ($10)

### 2. Features (4-6 cards)
- Auto BPM Detection
- Ableton Link Sync
- Tap Tempo with Smart Hint
- Beat Phase Tracking
- Always-on-Top Overlay
- Half/Double Time
- Cards styled with dark glass panels + neon border glow on hover

### 3. How It Works (3 steps)
1. Launch FLAYSync
2. Play music
3. Syncs to Resolume
- Numbered neon circles, minimal layout

### 4. Download / Buy
- Central CTA: "$10 — one-time purchase"
- Gumroad embed button
- Platform badges: Mac + Windows
- "Open source on GitHub" link

### 5. Footer
- FLAYSH logo (links to Instagram)
- GitHub repo link
- MIT license note

## Animations
- **Hero blob:** Canvas-based organic blob animation (JS)
- **Beat dots:** CSS keyframe pulsing green dots cycling through 4 beats
- **BPM counter:** JS number ticker cycling through BPM values
- **Scroll reveals:** Sections fade-in with subtle glow on scroll (IntersectionObserver)
- **Hover effects:** Neon border glow on feature cards, glitch effect on logo

## File Structure
```
website/
  index.html
  styles.css
  app.js
  assets/
    demo.mp4          (converted from screen recording)
    flaysh-logo.png   (copied from project assets)
    icon.png          (copied from project assets)
  vercel.json
```

## Deployment
1. Vercel project pointing to `website/` directory
2. Add CNAME record: `sync.flaysh.com` → Vercel
3. Gumroad product created with Mac DMG + Windows EXE as deliverables

## Payment Flow
1. User clicks "Buy $10" button
2. Gumroad overlay opens (handles payment + taxes)
3. After payment, Gumroad delivers download links (DMG + EXE)
4. Money deposited to connected bank account (~$9 after Gumroad's 10% fee)
