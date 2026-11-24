import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { AnimalEngine } from '../../engine/ascii-animals/engine';
import { ANIMAL_KEYS, AnimalKey } from '../../engine/ascii-animals/animals';
import { CustomSlotId, WorldContext } from '../../types/environment';
import { CustomImageScene } from '../../engine/environments/CustomImageScene';
import { RenderGrid } from '../../engine/core/RenderGrid';
import { Rasterizer } from '../../engine/core/Rasterizer';
import { GlyphGL } from '../../engine/core/GlyphGL';
import { Power, usePowerReason } from '../../services/power';
import { registerCapturer } from '../../services/capture';
import type { ResolvedTheme } from '../../services/theme';
import { useLiveStore } from '../../store/useLiveStore';
import { atmosphereNow } from '../../services/atmosphereInput';
import type { AtmosphereInput } from '../../engine/ascii-animals/atmosphere';

interface AsciiCanvasProps {
  focusRef?: React.RefObject<HTMLElement | null>;
  /** Fade animals behind the focus box's first child (the clock/search column). */
  calm?: boolean;
  theme?: ResolvedTheme;
}

export const AsciiCanvas: React.FC<AsciiCanvasProps> = ({ focusRef, calm = true, theme = 'dark' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animalEngineRef = useRef<AnimalEngine | null>(null);
  const customSceneRef = useRef<CustomImageScene | null>(null);
  const customRafRef = useRef<number | null>(null);
  const customGridRef = useRef<RenderGrid>(new RenderGrid());
  const customRasterizerRef = useRef<Rasterizer>(new Rasterizer());
  /** Re-measures the custom slot (low power or theme changed) without reloading its media. */
  const customRefreshRef = useRef<(() => void) | null>(null);

  const {
    isLoaded,
    activeScene,
    animalTweaks,
    customConfigs,
    dimBackground,
    fontSize,
    reducedMotion,
    powerMode,
    liveWeather,
    habitats,
  } = useSettingsStore();
  const habitatsRef = useRef(habitats);
  habitatsRef.current = habitats;
  const weather = useLiveStore((s) => s.weather);
  const weatherPreview = useLiveStore((s) => s.weatherPreview);
  const timePreview = useLiveStore((s) => s.timePreview);
  /** Current weather and light for the animal scenes (null: as designed). */
  const atmosRef = useRef<AtmosphereInput | null>(null);

  const lowPower = usePowerReason() !== null;
  const lowPowerRef = useRef(lowPower);
  lowPowerRef.current = lowPower;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const isAnimal = (ANIMAL_KEYS as readonly string[]).includes(activeScene);

  useEffect(() => {
    Power.setMode(powerMode);
  }, [powerMode]);

  // ── Animal scenes (ported from DesignerStephen1/ascii-animals) ──
  useEffect(() => {
    if (!isLoaded || !canvasRef.current) return;

    if (isAnimal) {
      // Stop custom scene loop if running
      if (customRafRef.current) {
        cancelAnimationFrame(customRafRef.current);
        customRafRef.current = null;
      }
      customSceneRef.current = null;

      const animalKey = activeScene as AnimalKey;
      if (!animalEngineRef.current) {
        const engine = new AnimalEngine(canvasRef.current, {
          animal: animalKey,
          theme: themeRef.current,
        });
        engine.onFrameCost = (ms) => Power.reportFrame(ms);
        engine.setLowPower(lowPowerRef.current);
        engine.setHabitats(habitatsRef.current);
        engine.setAtmosphere(atmosRef.current);
        animalEngineRef.current = engine;
        // Dev only: lets the console inspect the live engine.
        if (location.hostname === 'localhost') (window as unknown as { __pixoraAnimals?: AnimalEngine }).__pixoraAnimals = engine;
      } else {
        animalEngineRef.current.setAnimal(animalKey);
      }

      animalEngineRef.current.setReducedMotion(reducedMotion);

      // Apply live animal tweaks
      const tweaks = animalTweaks[animalKey] || {};
      for (const [k, v] of Object.entries(tweaks)) {
        animalEngineRef.current.set(k, v);
      }
      const engine = animalEngineRef.current;
      return registerCapturer(() => engine.capture());
    } else {
      // Custom image slot is active -> destroy animal engine
      if (animalEngineRef.current) {
        animalEngineRef.current.destroy();
        animalEngineRef.current = null;
      }

      // Start Custom Image Scene
      const slotId = activeScene as CustomSlotId;
      const scene = new CustomImageScene(slotId);
      scene.setLight(themeRef.current === 'light');
      scene.setLowPower(lowPowerRef.current);
      customSceneRef.current = scene;
      // Dev only: lets the console inspect the live scene.
      if (location.hostname === 'localhost') (window as unknown as { __pixoraScene?: CustomImageScene }).__pixoraScene = scene;

      const canvas = canvasRef.current;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;

      let lastTime = performance.now();
      let lastDraw = 0;
      let lastMove = 0;
      let dirty = true;
      let initialised = false;
      const grid = customGridRef.current;
      const rasterizer = customRasterizerRef.current;
      const fontPx = fontSize || 14;
      // JetBrains Mono is bundled (600 weight included), so cells are the same on every machine.
      const font = `600 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`;
      const dprNow = () => (lowPowerRef.current ? 1 : Math.min(window.devicePixelRatio || 1, 2));

      const inputState = {
        x: -1,
        y: -1,
        vx: 0,
        vy: 0,
        active: false,
        down: false,
        clicks: [] as { x: number; y: number }[],
        intensity: 1,
      };

      const onPointerMove = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const nx = e.clientX - rect.left;
        const ny = e.clientY - rect.top;
        if (inputState.x >= 0) {
          inputState.vx = nx - inputState.x;
          inputState.vy = ny - inputState.y;
        }
        inputState.x = nx;
        inputState.y = ny;
        inputState.active = true;
        lastMove = performance.now();
      };

      const onPointerLeave = () => {
        inputState.active = false;
        inputState.x = -1;
        inputState.y = -1;
        dirty = true;
      };

      const onPointerDown = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        inputState.clicks.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      };

      window.addEventListener('pointermove', onPointerMove, { passive: true });
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('pointerdown', onPointerDown);

      // Cells are drawn by WebGL on a layer above this canvas when the browser
      // supports it (about 4× faster on full pictures and video); otherwise 2D.
      const glCanvas = document.createElement('canvas');
      glCanvas.setAttribute('aria-hidden', 'true');
      glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block';
      let glRenderer = GlyphGL.create(glCanvas);
      if (glRenderer) canvas.after(glCanvas);

      const resizeCustom = () => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const dpr = dprNow();
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (glRenderer) {
          // The WebGL layer draws the cells; this canvas only holds the backdrop.
          rasterizer.prepareBackdrop(rect.width, rect.height, dpr, scene.backdrop);
          rasterizer.paintBackdropTo(ctx2d, rect.width, rect.height);
        }

        ctx2d.font = font;
        const cw = ctx2d.measureText('M').width || fontPx * 0.6;
        const ch = Math.round(fontPx * 1.18);
        grid.resize(Math.ceil(rect.width / cw), Math.ceil(rect.height / ch), cw, ch);

        scene.setFont('"JetBrains Mono", ui-monospace, monospace', fontPx);
        const wctx = makeContext(rect, 0);
        // init() loads the media once; later resizes only re-sample it.
        if (initialised) scene.resize(wctx);
        else scene.init(wctx);
        initialised = true;
        dirty = true;
      };
      customRefreshRef.current = () => {
        scene.setLight(themeRef.current === 'light');
        scene.setLowPower(lowPowerRef.current);
        resizeCustom();
      };

      const makeContext = (rect: DOMRect, time: number): WorldContext => ({
        width: rect.width,
        height: rect.height,
        grid,
        input: inputState,
        style: 'tiles',
        auto: true,
        habitat: { top: 0, bottom: rect.height, left: 0, right: rect.width },
        time,
        quality: 1,
        bg: 0x08080c,
      });

      resizeCustom();
      const resizeObserver = new ResizeObserver(() => resizeCustom());
      resizeObserver.observe(canvas);
      // Canvas text can't trigger a web-font load: measure again once the mono face is in.
      document.fonts?.load(`600 ${fontPx}px "JetBrains Mono"`).then(() => {
        if (customSceneRef.current === scene) resizeCustom();
      });

      // Videos stop decoding while the tab is hidden or motion is reduced.
      const syncPlayback = () => scene.setPlaying(!document.hidden && !reducedMotion);
      syncPlayback();
      document.addEventListener('visibilitychange', syncPlayback);

      /** Draws the grid; returns false if WebGL went away (2D was used instead). */
      const drawGrid = (rect: DOMRect) => {
        const dpr = dprNow();
        if (glRenderer && glRenderer.draw(grid, rect.width, rect.height, dpr, font)) return;
        if (glRenderer) {
          // Context lost: fall back to the 2D renderer for this scene.
          glRenderer = null;
          glCanvas.remove();
        }
        rasterizer.prepareBackdrop(rect.width, rect.height, dpr, scene.backdrop);
        rasterizer.draw(ctx2d, grid, rect.width, rect.height, font, null, true);
      };

      const loop = (now: number) => {
        customRafRef.current = requestAnimationFrame(loop);

        // Nothing changing (still picture, pointer at rest, no wake or ripples):
        // keep the slow ambient drift at ~12 fps (6 in low power), or hold the
        // frame under reduced motion. Low power also caps busy frames at 30 fps.
        const low = lowPowerRef.current;
        const busy = !scene.isIdle() || now - lastMove < 800 || inputState.clicks.length > 0;
        const idleGap = reducedMotion ? Infinity : 1000 / (low ? 6 : 12);
        const gap = busy ? (low ? 1000 / 30 - 2 : 0) : idleGap;
        if (!dirty && now - lastDraw < gap) return;

        const work = performance.now();
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        lastDraw = now;
        dirty = false;

        const rect = canvas.getBoundingClientRect();
        const wctx = makeContext(rect, now / 1000);

        scene.update(reducedMotion ? 0 : dt, wctx);
        inputState.clicks = [];
        // Velocity is per-move; once read, a resting pointer must not keep spawning ripples.
        inputState.vx = 0;
        inputState.vy = 0;

        grid.clear();
        scene.render(wctx);
        drawGrid(rect);
        Power.reportFrame(performance.now() - work);
      };

      customRafRef.current = requestAnimationFrame(loop);

      const unregister = registerCapturer(() => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 1) return null;
        grid.clear();
        scene.render(makeContext(rect, performance.now() / 1000));
        drawGrid(rect);
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = canvas.height;
        const g = out.getContext('2d')!;
        g.drawImage(canvas, 0, 0);
        if (glRenderer) g.drawImage(glCanvas, 0, 0, out.width, out.height);
        return out;
      });

      return () => {
        unregister();
        customRefreshRef.current = null;
        if (customRafRef.current) {
          cancelAnimationFrame(customRafRef.current);
          customRafRef.current = null;
        }
        glCanvas.remove();
        resizeObserver.disconnect();
        document.removeEventListener('visibilitychange', syncPlayback);
        scene.destroy();
        window.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('pointerdown', onPointerDown);
      };
    }
  }, [isLoaded, activeScene, isAnimal, fontSize, reducedMotion]);

  // Live weather and time of day: refresh now, and every 30 s as the light changes.
  useEffect(() => {
    const apply = () => {
      atmosRef.current = liveWeather ? atmosphereNow(weather, weatherPreview, timePreview) : null;
      animalEngineRef.current?.setAtmosphere(atmosRef.current);
    };
    apply();
    if (!liveWeather) return;
    const id = window.setInterval(apply, 30_000);
    return () => window.clearInterval(id);
  }, [liveWeather, weather, weatherPreview, timePreview, isAnimal, activeScene]);

  useEffect(() => {
    animalEngineRef.current?.setHabitats(habitats);
  }, [habitats, isAnimal, activeScene]);

  // Low power and theme apply live, without restarting the scene.
  useEffect(() => {
    animalEngineRef.current?.setLowPower(lowPower);
    animalEngineRef.current?.setTheme(theme);
    customRefreshRef.current?.();
  }, [lowPower, theme]);

  // Sync animal tweaks live
  useEffect(() => {
    if (isAnimal && animalEngineRef.current) {
      const tweaks = animalTweaks[activeScene] || {};
      for (const [k, v] of Object.entries(tweaks)) {
        animalEngineRef.current.set(k, v);
      }
    }
  }, [animalTweaks, activeScene, isAnimal]);

  // Calm zone: animals fade behind the clock, search and shortcuts (off in Zen mode).
  useEffect(() => {
    const engine = animalEngineRef.current;
    const box = focusRef?.current?.firstElementChild as HTMLElement | null | undefined;
    if (!isAnimal || !engine) return;
    if (!calm || !box) {
      engine.setCalm(null);
      return;
    }
    const measure = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getBoundingClientRect();
      // offset* ignores the Zen-mode scale transition, so the zone doesn't jitter.
      let x = 0;
      let y = 0;
      for (let el: HTMLElement | null = box; el; el = el.offsetParent as HTMLElement | null) {
        x += el.offsetLeft;
        y += el.offsetTop;
      }
      engine.setCalm({ x: x - c.left, y: y - c.top, w: box.offsetWidth, h: box.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isLoaded, activeScene, isAnimal, calm, focusRef, lowPower, theme]);

  // Sync custom configs live
  useEffect(() => {
    if (!isAnimal && customSceneRef.current) {
      customSceneRef.current.tune(undefined);
    }
  }, [customConfigs, isAnimal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animalEngineRef.current) {
        animalEngineRef.current.destroy();
        animalEngineRef.current = null;
      }
      if (customRafRef.current) {
        cancelAnimationFrame(customRafRef.current);
        customRafRef.current = null;
      }
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-canvas">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block w-full h-full font-mono cursor-default"
      />

      {/* Dim Background Overlay */}
      <div
        className={`absolute inset-0 bg-black pointer-events-none transition-opacity duration-500 ${
          dimBackground ? 'opacity-40' : 'opacity-0'
        }`}
      />
    </div>
  );
};
