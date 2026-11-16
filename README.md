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
> Living ASCII scenes (10 worlds, 10 animals and flowing fields) drawn on a canvas, with a calm clock, search and shortcuts on top. Something new every day, or keep your favourite forever.

---

## Worlds, Animals and Flows

Pixora shows one of three kinds of scene. Switch with the three icons in the bottom bar or the tabs in **Worlds** (top right).

**Worlds** (scenery): Deep Ocean · Moonlit Lake · Lily Pond · Northern Lights · Campfire · Zen Garden · Dusk Meadow · Winter Pines · Night Forest · Rainy City.

**Animals** (after [ascii-animals](https://github.com/DesignerStephen1/ascii-animals)):

| Animal | Behaviour |
| :--- | :--- |
| Butterflies | flutter and glide; curious about a still pointer, scatter from a fast one |
| Koi | five varieties; meander, bend and swish; click to drop food |
| Jellyfish | pulse upward trailing tentacles; click to make them shoot away |
| Dragonflies | dart, hover, dart; flee when you get close |
| Frogs | sit, blink, leap to a clear spot with a splash; watch your pointer |
| Cranes | slow V formations; click to startle them into a climb |
| Crabs | scuttle sideways, wave claws, tuck in when you come close |
| Fireflies | flash, then gradually synchronise; click to flash them all |
| Fish School | flocks at three depths; scatter and startle |
| Starlings | a murmuration that bends around the pointer |

Each animal has a **Tweaks** panel (sliders icon in the bottom bar): how many, size, speed, depth range, haze, plus its own knobs. Double-click a label to reset it; "Copy changes" exports your values.

**Flows** (fine Braille-dot line art):

| Flow | What it is | Play with it |
| :--- | :--- | :--- |
| Curl Currents | particles on swirling curl noise | hover for a vortex · click for a shockwave |
| Magnetic Lines | field lines between drifting poles | your pointer is a pole · click flips its charge |
| Wind Map | westerlies with drifting highs (H) and lows (L) | move fast for a gust · click spawns a storm |
| Strange Attractor | a slowly morphing Clifford attractor | move to bend it · click glides to a new shape |
| Contours | moving topographic lines with index contours | your pointer raises a hill · click leaves one |
| Vortex Street | swirls shed behind posts (Kármán street) | move to shed swirls · click plants a post |

**Layering** (Settings → *Layer an animal over worlds*) puts an animal on top of a world. Only animals that belong there are allowed: koi need open water, cranes need sky, fireflies need a warm night. Animals that don't fit are greyed out with the reason. Each world tells layered animals where its sky, water and ground are.

**Time of day:** worlds that follow the clock (all but Campfire and Northern Lights) shift through dawn, day, dusk and night using your local sunrise and sunset: the lake gets a sun by day, city windows switch off, stars fade in daylight. Turn it off in Settings to see each world as designed.

**Live weather:** real rain shows up in Moonlit Lake and Lily Pond, snow sets Winter Pines' snowfall, fog thickens the Night Forest mist, and storms bring more lightning to Rainy City. Off switch in Settings.

**Daily rotation:** the world, animal and flow each change at your local midnight. Each has its own **Keep this forever** pin (bottom right; it pins whichever category you're viewing). Switching scenes crossfades.

## Look & feel

- **Tile look:** creatures and scenery are drawn as solid coloured tiles with a small darker glyph on each, over a faint cell grid (after ascii-animals). Calm areas stay empty.
- **Character style:** *Auto* (tiles, plus Braille for Flow), or force Tiles, Classic ASCII, Dense ASCII, Braille, Blocks, Geometric or Dots for water, light, fire and trails.
- **Colour themes:** True Color, Phosphor Amber, Matrix Emerald, Cyberpunk Neon, Ice Blue, Claude Warm, Monochrome.
- **Calm zone:** the art fades softly behind the clock and search so text stays readable (adjustable).
- **Interaction strength**, animation speed, font size and density are adjustable. **Reduced motion** (or the OS setting) shows a settled still frame.

## Productivity overlay

- Time-aware greeting (optionally with your name), clock and date.
- Search with Google, DuckDuckGo, Bing, Brave, Ecosia or a custom URL. Typing an address (`github.com`, `localhost:5173`) opens it directly; bangs `!g !d !b !br !e` pick an engine for one search. `/` focuses search, `Esc` clears it.
- Shortcuts with favicons.
- Weather from Open-Meteo. With no city set, Pixora uses your time zone's city (no location prompt). With *Use my location* on, the place name comes from BigDataCloud's free reverse geocoder.
- ASCII Studio: drop, paste or pick an image. Render as Characters, Braille (Atkinson-dithered) or Blocks (half-block pixels), in full colour, mono, matrix or amber, with auto-levels plus brightness/contrast/gamma. Compare with the original, copy text, or export `.txt` / `.png`.

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
