# Pixora — An Immersive, Generative-Art Browser New Tab Experience

> A premium, cross-browser extension for **Google Chrome**, **Microsoft Edge**, and Chromium browsers supporting Manifest V3.  
> Combines an original procedural ASCII-art generative animation engine with a minimalist, Claude- and Arc-inspired productivity dashboard.

---

## Features Overview

### 1. Generative ASCII Animation Engine
- **Decoupled 60 FPS Canvas Simulation Loop:** Runs completely outside React component lifecycles for zero garbage-collection stutter.
- **Multiple Character Styles:**
  - Classic ASCII 10-level ramp (` .:-=+*#%@`)
  - Dense 70-character grayscale ramp
  - Unicode Block and Half-Shade elements (`░▒▓█▄▀`)
  - Geometric symbols (`▲●■◆`)
  - Directional vector arrows (`→↗↑↖←`)
  - Pixel blocks (`▀▄▖▗`)
- **Multiple Color Palettes:**
  - True-Color atmospheric RGB
  - Phosphor Amber (Retro terminal)
  - Matrix Emerald
  - Cyberpunk Neon
  - Ice Blue
  - Claude Warm Terracotta
  - Monochrome White
- **Aspect Ratio Normalizer:** Automatically corrects monospace font dimensions so circular ripples and creature bodies render with true Euclidean geometry.

### 2. Five Living Procedural Environments
1. **Underwater World:** Schools of fish with Craig Reynolds' Boids flocking, undulating jellyfish with damped spring-chain tentacles, seabed seaweed stalks swaying with phase-lagged oscillation, and rising bubbles.
2. **Interactive Water & Ripples:** Discretized 2D shallow water wave equation heightfield ($u^{t+1} = 2u^t - u^{t-1} + c^2 \nabla^2 u$) with mouse cursor energy injection, click shockwaves, and floating sakura petals.
3. **Frog & Pond:** Lily pads with buoyant bobbing, biomechanical frogs with breathing, anticipation, and ballistic jump states that splash into the water solver, plus buzzing dragonflies.
4. **Cosmic Aurora:** Atmospheric multi-octave Simplex Noise ribbon curtains drifting above a twinkling starfield.
5. **Abstract Flow Fields:** Continuous curl noise velocity vectors steering generative particle swarms around dynamic mouse vortex attractors.

### 3. Image-to-ASCII Studio
- Convert any uploaded PNG, JPG, or WEBP image into character artwork.
- Adjustable character resolution (50 to 160 columns).
- 3×3 Sobel edge detection filter mapping image gradients to contour characters (`/`, `|`, `\`, `-`).
- One-click copy text to clipboard and download as `.txt`.

### 4. Minimalist Productivity Dashboard
- **Conversational Greetings:** Time-sensitive greetings (morning, afternoon, evening, night) inspired by Claude.
- **Central Omni-Search Bar:** Instant search engine switching (Google, DuckDuckGo, Bing, Brave, Ecosia, or Custom URL) with keyboard shortcut (`/` to focus).
- **Customizable Shortcuts:** Pinned website shortcuts with automated Google S2 favicon resolution and quick-add modal.
- **Live Clock & Ambient Weather:** Free Open-Meteo weather integration with automatic geocoding and caching.
- **Personalization Drawer:** Full control over font size, density, animation speed, background dimming, and widget visibility.

---

## Quick Start & Installation

### 1. Install Dependencies
```bash
cd pixora
pnpm install
# or
npm install
```

### 2. Start Development Server
```bash
pnpm dev
# or
npm run dev
```
Open `http://localhost:5173` in your browser to preview the New Tab experience with instant Hot Module Replacement (HMR).

### 3. Build Extension for Chrome / Edge
```bash
pnpm build
# or
npm run build
```
This generates the optimized, production-ready Manifest V3 extension inside `dist/`.

### 4. Load Unpacked in Chrome or Edge
1. Open Chrome or Edge and navigate to `chrome://extensions` or `edge://extensions`.
2. Toggle on **"Developer mode"** in the top right.
3. Click **"Load unpacked"**.
4. Select the `pixora/dist` folder (or `pixora` root during development).
5. Open a new tab to experience Pixora!

---

## Architecture Specification
For detailed mathematical formulations, physics algorithms, and component diagrams, see [ARCHITECTURE.md](./ARCHITECTURE.md).
