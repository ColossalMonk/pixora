# Pixora — An Immersive, Generative-Art Browser New Tab Experience

```text
  ____  _                          
 |  _ \(_)_  _____  _ __ __ _      
 | |_) | \ \/ / _ \| '__/ _` |     
 |  __/| |>  < (_) | | | (_| |     
 |_|   |_/_/\_\___/|_|  \__,_|     
  Generative ASCII-Art Browser New Tab • Manifest V3 • v2.1.0
```

> **Pixora** transforms your browser New Tab into an ambient, living digital sanctuary.  
> Procedural animated wildlife flocking across the screen, Asciify real-time image & video shaders with billowing fluid gas wake, ambient weather, conversational greetings, and productivity search.

---

## What's in Pixora v2.1.0

Pixora features **10 Total Scenes**: 7 authentic wildlife species from [DesignerStephen1/ascii-animals](https://github.com/DesignerStephen1/ascii-animals) and 3 custom ASCII image/video slots powered by [asciify-engine](https://github.com/ayangabryl/asciify-engine).

### 1. Authentic Procedural Wildlife (7 Species)
- **Butterflies:** Blue morpho flutter, wingbeats, air currents, and glides; scatter from fast cursor motion.
- **Koi:** Five Nishikigoi varieties with flowing caudal fins, sinusoidal swimming, and schooling behavior.
- **Jellyfish:** Bioluminescent bell contractions, tentacle drag lag, and upward pulsation.
- **Dragonflies:** Rapid darting, hovering, and quick reactive fleeing.
- **Frogs:** Patient perching, blinks, realistic parabolic leaps with splashes, and cursor gaze tracking.
- **Cranes:** Elegant long-range V-formation flight with wing dynamics.
- **Crabs:** Sideways scuttling, claw snaps, and tactical tucking.

Every animal includes the full authentic tweak suite:
- **Movement (Boids & Course):** Density, Corner-to-corner trajectory, Manual Direction (°), Speed, Sway, Spread, Size, Farthest Depth, Far Bias, Hold Course, and Separation.
- **Species-Specific Knobs:** Wingspan, flutter, pulse rate, tail wave, jump frequency, and more.
- **Look & Shimmer:** Hue Shift (°), Shimmer, Sparkle, Distance Fade (fog), Trail length, Trail fade rate, Background Grid lines, and ASCII Detail resolution.

---

### 2. Custom ASCII Media & Videos (Asciify Engine)
- **Image & Video Support:** Drop or upload any image (`jpg`, `png`, `webp`) or video (`mp4`, `webm`, `ogg`) into any of the 3 custom slots.
- **Real-Time Video ASCII Engine:** Decodes and renders looping video in ASCII at 60 FPS in real-time.
- **Slot Renaming:** Name your custom slots directly (e.g., *"Cat in Leaves"*, *"Matrix Loop"*). Your custom names appear in the drawer and top selection pill.
- **Phosphor Backlight Glow:** Soft luminous backlight ambiance that mimics retro phosphor terminals.
- **Fluid Gas Flow (Navier-Stokes Advection):** Smooth, billowing smoke wake follows the pointer with lateral plume expansion, vorticity curl, and ambient micro-drift.
- **Concentric Traveling Ripples:** Water displacement waves propagate and refract with velocity and clicks.
- **Flow Dynamics Sliders:** Adjust Flow Velocity (`0.2x–3.0x`), Gas Plume Spread (`0.2x–3.0x`), and Flow Lingering / Dissipation (`0.2x–3.0x`).
- **Render Modes:** Characters (Classic ASCII ramp), Braille (Unicode `0x2800` dot patterns), Tiles, and Blocks.
- **Color Themes:** True Color, Cyberpunk, Matrix, Phosphor Amber, and Monochrome.

---

### 3. Productivity & Interface
- **Top-Edge Hover Selection Pill:** Sleek scene switcher remains hidden at the top and gracefully reveals only when your cursor hovers near the top-center edge.
- **Zen Mode:** Clean one-click distraction-free mode (toggle via the Zen button on top right or hotkeys `Z` / `Esc`).
- **Control Panel Drawer:** Accessible via the top-right gear icon or hotkey `S`. Features pinned or overlay modes.
- **Conversational Frosted Greeting:** Time-aware greeting in a floating pill with user name customization.
- **Weather Widget:** Real-time Open-Meteo weather with location lookup (New Delhi by default, custom city input, or device geolocation) and °C / °F switching.
- **Search & Shortcuts:** Multi-engine search bar (Google, DuckDuckGo, Bing, Brave, Ecosia, Custom URL) with direct URL navigation and shortcut bookmarks.
- **Display Customization:** Background dimming toggle, reduced motion toggle, and live font / cell size slider.

## Installation & Setup

### Quick install (no build needed)

1. Download **`pixora-chrome-extension.zip`** from the [latest release](https://github.com/ColossalMonk/pixora/releases/latest) and unzip it into a folder you'll keep (the browser loads it from there).
2. Open `chrome://extensions` (Chrome / Brave) or `edge://extensions` (Edge) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder (the one containing `manifest.json`).
4. Open a new tab. If the browser asks whether to keep the new tab page, choose **Keep it**.

To update later, download the new zip, replace the folder's contents, and press the reload icon on the Pixora card in the extensions page. Your settings and wallpaper are kept.

### Option 1: Build from source and load unpacked

1. Download or clone this repository:
   ```bash
   git clone https://github.com/ColossalMonk/pixora.git
   cd pixora
   ```
2. Install dependencies and compile the production extension:
   ```bash
   pnpm install
   pnpm build
   # or with npm:
   # npm install
   # npm run build
   ```
3. Open your browser extension management page:
   - **Google Chrome / Brave:** `chrome://extensions`
   - **Microsoft Edge:** `edge://extensions`
4. Enable **"Developer mode"** in the top right.
5. Click **"Load unpacked"** and select the `pixora/dist` folder.
6. Open a new tab (`Ctrl + T` / `Cmd + T`) to experience Pixora!

---

### Option 2: Build a Standalone Release ZIP

Pixora includes an automated packaging script:
```bash
pnpm package:release
# or: npm run package:release
```
This builds the extension and generates `release/pixora-v<version>-chrome-extension.zip` (it always rebuilds first), ready for distribution or GitHub Releases.

---

### Option 3: Local Development Server

Run the development server with instant Hot Module Replacement (HMR):
```bash
pnpm dev
# or: npm run dev
```
Preview at `http://localhost:5173`.

---

## Keyboard

| Key | Action |
| :--- | :--- |
| `/` | Focus search |
| `Esc` | Clear search, or close the open panel |
| `Enter` | Search, or open the typed address |

## How it works (short version)

- A plain TypeScript engine (`src/engine`) runs outside React: fixed 60 Hz simulation steps (so speed is the same on 60/120/144 Hz screens), one render per frame, paused when the tab is hidden.
- Scenes (worlds, animals, flows) write into a typed-array character grid with depth layers, so near creatures always cover far ones. An animal can be layered over a world; each world tells it where its sky, water and ground are.
- Worlds follow your local sunrise/sunset and the live weather; a still scene (Your Image with no pointer) stops redrawing.
- The rasterizer groups cells by colour and opacity (a handful of state changes per frame instead of thousands); Braille is drawn as dot rectangles; the backdrop gradient is CSS behind a transparent canvas.
- Performance tier *Auto* drops to 30 fps, then to a coarser grid, if a machine struggles.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the details.

## License

MIT © [ColossalMonk](https://github.com/ColossalMonk). Rendering ideas inspired by [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) and [asciify-engine](https://github.com/ayangabryl/asciify-engine) (both MIT); no code copied.
