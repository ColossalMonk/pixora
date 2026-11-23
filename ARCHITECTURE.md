# Pixora — Architecture

> Version 2.1.x · Chrome / Edge / Brave, Manifest V3 new-tab override

Pixora is a React overlay (clock, greeting, search, shortcuts, weather, top bar, settings drawer) on top of one full-screen canvas. The canvas shows one of two kinds of scene:

| Kind | Code | What it is |
| :--- | :--- | :--- |
| **Animal** (7) | `src/engine/ascii-animals/` | Butterflies, Koi, Jellyfish, Dragonflies, Frogs, Cranes, Crabs. Ported from [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) (MIT, licence kept in that folder). |
| **Custom** (3 slots) | `src/engine/environments/CustomImageScene.ts` | Your own image or looping video turned into ASCII, with a fluid-gas or ripple pointer effect. |

`src/data/catalog.ts` lists the ten scenes (id, name, kind). `activeScene` in settings picks one.

```mermaid
graph TD
  Store["Settings store (zustand → chrome.storage / localStorage)"] --> Canvas[AsciiCanvas.tsx]
  IDB["IndexedDB (custom images / videos)"] --> Canvas
  Canvas -->|animal id| AE["AnimalEngine (ascii-animals/engine.ts)"]
  AE --> Flock["Flock — creatures, steering, startle"]
  AE --> AR["AsciiRenderer — grid, trail, silhouettes, calm zone"]
  Canvas -->|custom slot| CS["CustomImageScene"]
  CS --> Fluid["FluidGasField (pointer wake)"]
  CS --> Grid["RenderGrid → Rasterizer"]
```

## Animals (`engine/ascii-animals/`)

- `engine.ts` — `AnimalEngine`: fixed 1/60 s steps (max 4 per frame), resize, click-to-startle on the canvas only, pauses when off-screen, a settled still frame under reduced motion. `set(key, value)` applies a tweak live.
- `flock.ts` — `Flock` holds the creatures and the shared steering; `SHARED_CONTROLS` are the knobs every animal has (density, speed, size, sway, spread, depth…), shown in the drawer next to each animal's own.
- `animals/*.ts` — one file per species: defaults, controls, behaviour, and a `draw` that paints through the `Pen`.
- `renderer.ts` — `AsciiRenderer`: cached background plus faint cell grid, a diffusing trail field, then silhouettes rasterised cell by cell (solid tiles with a glyph, soft edge glyphs, angled line glyphs).
- **Pixora addition — calm zone:** `setCalm(rect)` lays the plain background back over the clock/search column with a soft elliptical mask after each frame, so animals fade behind the text. `AsciiCanvas` measures the column (`focusRef`'s first child) and turns the zone off in Zen mode.

## Custom slots (`environments/CustomImageScene.ts`)

The media lives in IndexedDB (`services/imageStore.ts`, one entry per slot). Images are sampled per cell; videos are sampled every frame. Render modes: Characters, Braille, Tiles, Blocks; colour modes from true colour to monochrome; brightness/contrast/gamma and a backlight glow. Pointer effects use `physics/FluidGasField.ts` (semi-Lagrangian advection with vorticity and plume spread) travelling ripples or drift. Cells go into `core/RenderGrid` (typed arrays) and `core/Rasterizer` draws them batched by colour and opacity.

## UI

- `App.tsx` — layout, hotkeys (`Z` Zen, `S` settings, `Esc`), drag-and-drop of media onto the page.
- `navigation/TopBar.tsx` — weather, the scene pill (appears on top-edge hover), Zen and settings buttons.
- `drawer/EdgeHoverDrawer.tsx` — all settings: animal tweaks, custom slot media and look, search, shortcuts, weather, display toggles, reset to defaults.
- `widgets/`, `search/`, `shortcuts/`, `greeting/` — the productivity overlay.

## Settings and persistence

Saved under `pixora_user_settings_v2` in `chrome.storage.local` (or `localStorage` in dev). On load:

- If only the v2.0 key (`pixora_user_settings_v1`) exists, its shortcuts, name, search engine, weather and display preferences carry over; the last animal viewed becomes the scene. v2.0 animal tweaks are dropped (different knob names).
- Unknown keys and values of the wrong type are ignored, and a scene id that no longer exists (a v2.0 world or flow) falls back to the default animal.

## Weather

`services/weatherService.ts` uses Open-Meteo (forecast and geocoding). With *Use my location* on, the place name comes from BigDataCloud's reverse geocoder. Without a city, the browser's time zone gives one.

## Build and release

`pnpm build` (tsc + Vite) writes `dist/`. `pnpm package:release` rebuilds and zips `dist/` with forward-slash paths into `release/pixora-v<version>-chrome-extension.zip` and `release/pixora-chrome-extension.zip`. `public/THIRD_PARTY_NOTICES.txt` ships inside the zip.
