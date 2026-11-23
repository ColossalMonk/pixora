import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { AnimalEngine } from '../../engine/ascii-animals/engine';
import { ANIMAL_KEYS, AnimalKey } from '../../engine/ascii-animals/animals';
import { CustomSlotId, WorldContext } from '../../types/environment';
import { CustomImageScene } from '../../engine/environments/CustomImageScene';
import { RenderGrid } from '../../engine/core/RenderGrid';
import { Rasterizer } from '../../engine/core/Rasterizer';

interface AsciiCanvasProps {
  focusRef?: React.RefObject<HTMLElement | null>;
  /** Fade animals behind the focus box's first child (the clock/search column). */
  calm?: boolean;
}

export const AsciiCanvas: React.FC<AsciiCanvasProps> = ({ focusRef, calm = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animalEngineRef = useRef<AnimalEngine | null>(null);
  const customSceneRef = useRef<CustomImageScene | null>(null);
  const customRafRef = useRef<number | null>(null);
  const customGridRef = useRef<RenderGrid>(new RenderGrid());
  const customRasterizerRef = useRef<Rasterizer>(new Rasterizer());

  const {
    isLoaded,
    activeScene,
    animalTweaks,
    customConfigs,
    dimBackground,
    fontSize,
    reducedMotion,
  } = useSettingsStore();

  const isAnimal = (ANIMAL_KEYS as readonly string[]).includes(activeScene);

  // ── Handle Animal Scenes (Directly from DesignerStephen1/ascii-animals) ──
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
          theme: 'dark',
        });
        animalEngineRef.current = engine;
      } else {
        animalEngineRef.current.setAnimal(animalKey);
      }

      // Apply live animal tweaks
      const tweaks = animalTweaks[animalKey] || {};
      for (const [k, v] of Object.entries(tweaks)) {
        animalEngineRef.current.set(k, v);
      }
    } else {
      // Custom image slot is active -> destroy animal engine
      if (animalEngineRef.current) {
        animalEngineRef.current.destroy();
        animalEngineRef.current = null;
      }

      // Start Custom Image Scene
      const slotId = activeScene as CustomSlotId;
      const scene = new CustomImageScene(slotId);
      customSceneRef.current = scene;

      const canvas = canvasRef.current;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;

      let lastTime = performance.now();
      const grid = customGridRef.current;
      const rasterizer = customRasterizerRef.current;

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
      };

      const onPointerLeave = () => {
        inputState.active = false;
        inputState.x = -1;
        inputState.y = -1;
      };

      const onPointerDown = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        inputState.clicks.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      };

      window.addEventListener('pointermove', onPointerMove, { passive: true });
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('pointerdown', onPointerDown);

      const resizeCustom = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx2d.scale(dpr, dpr);

        const fontPx = fontSize || 14;
        ctx2d.font = `600 ${fontPx}px "Geist Mono", monospace`;
        const cw = ctx2d.measureText('M').width || fontPx * 0.6;
        const ch = Math.round(fontPx * 1.18);
        grid.resize(Math.ceil(rect.width / cw), Math.ceil(rect.height / ch), cw, ch);

        const wctx: WorldContext = {
          width: rect.width,
          height: rect.height,
          grid,
          input: inputState,
          style: 'tiles',
          auto: true,
          habitat: { top: 0, bottom: rect.height, left: 0, right: rect.width },
          time: 0,
          quality: 1,
          bg: 0x08080c,
        };
        scene.init(wctx);
      };

      resizeCustom();

      const loop = (now: number) => {
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        const rect = canvas.getBoundingClientRect();
        const wctx: WorldContext = {
          width: rect.width,
          height: rect.height,
          grid,
          input: inputState,
          style: 'tiles',
          auto: true,
          habitat: { top: 0, bottom: rect.height, left: 0, right: rect.width },
          time: now / 1000,
          quality: 1,
          bg: 0x08080c,
        };

        scene.update(reducedMotion ? 0 : dt, wctx);
        inputState.clicks = [];

        grid.clear();
        scene.render(wctx);

        rasterizer.prepareBackdrop(rect.width, rect.height, window.devicePixelRatio || 1, scene.backdrop);
        rasterizer.draw(ctx2d, grid, rect.width, rect.height, `600 ${fontSize || 14}px "Geist Mono", monospace`, null, true);

        customRafRef.current = requestAnimationFrame(loop);
      };

      customRafRef.current = requestAnimationFrame(loop);

      return () => {
        if (customRafRef.current) {
          cancelAnimationFrame(customRafRef.current);
          customRafRef.current = null;
        }
        scene.destroy();
        window.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('pointerdown', onPointerDown);
      };
    }
  }, [isLoaded, activeScene, isAnimal, fontSize, reducedMotion]);

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
  }, [isLoaded, activeScene, isAnimal, calm, focusRef]);

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
    <div className="absolute inset-0 overflow-hidden bg-[#06070c]">
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
