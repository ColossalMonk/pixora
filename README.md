# Pixora — An Immersive, Generative-Art Browser New Tab Experience

```text
  ____  _                          
 |  _ \(_)_  _____  _ __ __ _      
 | |_) | \ \/ / _ \| '__/ _` |     
 |  __/| |>  < (_) | | | (_| |     
 |_|   |_/_/\_\___/|_|  \__,_|     
  Generative ASCII-Art Browser New Tab • Manifest V3
```

> **Pixora** transforms the standard browser New Tab into an ambient, living digital sanctuary.  
> Five living ASCII worlds drawn on a canvas, with a calm clock, search and shortcuts on top. A new world every day, or keep the one you love forever.

---

## The worlds

| World | What lives there | Play with it |
| :--- | :--- | :--- |
| **Underwater World** | Fish schools in three depth layers, big curious fish, pulsing jellyfish with soft tentacles, kelp, coral, light shafts and caustics | Hold the pointer still and big fish come to look · move fast and schools scatter · click for a bubble burst |
| **Moonlit Lake** | Wave simulation lit by the moon, a shimmering moon path, pine treeline, drifting petals, fireflies, passing rain showers | Drag across the water for a wake · click for a drop · click the sky to call rain |
| **Frog Pond** | Frogs that breathe, blink, leap between free lily pads, swim back and catch dragonflies; koi below the surface; reeds | Click the water to drop food for the koi · get close and frogs leap away |
| **Northern Lights** | Two aurora curtains of vertical rays over sharp ridges, mirrored in a lake; stars and meteors | Move to push the curtains · click for a flare and a shooting star |
| **Flow Fields** | Particles riding curl noise, leaving fine Braille-dot trails; the palette drifts between moods | Hover to stir a vortex · click for a shockwave |

**Daily rotation:** a new world each day at your local midnight. Flip **Keep this forever** (bottom right) to pin the one you're on. The arrows next to it switch worlds by hand, and **Worlds** (top right) shows live previews of all five.

## Look & feel

- **Character style:** *Auto* (each world's own glyphs: vertical rays for the aurora, Braille for flow), or force Classic ASCII, Dense ASCII, Braille, Blocks, Geometric or Dots for water, light and trails. Creatures keep their own shapes.
- **Colour themes:** True Color, Phosphor Amber, Matrix Emerald, Cyberpunk Neon, Ice Blue, Claude Warm, Monochrome.
- **Calm zone:** the art fades softly behind the clock and search so text stays readable (adjustable).
- **Interaction strength**, animation speed, font size and density are adjustable. **Reduced motion** (or the OS setting) shows a settled still frame.

## Productivity overlay

- Time-aware greeting (optionally with your name), clock and date.
- Search with Google, DuckDuckGo, Bing, Brave, Ecosia or a custom URL. Typing an address (`github.com`, `localhost:5173`) opens it directly; bangs `!g !d !b !br !e` pick an engine for one search. `/` focuses search, `Esc` clears it.
- Shortcuts with favicons.
- Weather from Open-Meteo. With no city set, Pixora uses your time zone's city (no location prompt).
- ASCII Studio: drop or pick an image and convert it to text with luminance ramps and Sobel edge strokes; copy or download as `.txt`.

All fonts are bundled locally. The only network calls are weather and shortcut favicons.

## Installation & Setup

### Option 1: Load as Unpacked Extension in Chrome / Edge / Brave

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
- Worlds write into a typed-array character grid with depth layers, so near creatures always cover far ones.
- The rasterizer groups cells by colour and opacity (a handful of state changes per frame instead of thousands); Braille is drawn as dot rectangles; the backdrop gradient is CSS behind a transparent canvas.
- Performance tier *Auto* drops to 30 fps, then to a coarser grid, if a machine struggles.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the details.

## License

MIT © [ColossalMonk](https://github.com/ColossalMonk). Rendering ideas inspired by [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) and [asciify-engine](https://github.com/ayangabryl/asciify-engine) (both MIT); no code copied.
