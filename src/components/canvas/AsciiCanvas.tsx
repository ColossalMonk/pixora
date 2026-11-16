import React, { useEffect, useRef } from 'react';
import { Engine } from '../../engine/core/Engine';
import { sceneFor, useSettingsStore } from '../../store/useSettingsStore';

interface AsciiCanvasProps {
  /** Element whose box the art should fade behind (clock + search + shortcuts). */
  focusRef?: React.RefObject<HTMLElement | null>;
}

export const AsciiCanvas: React.FC<AsciiCanvasProps> = ({ focusRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const {
    isLoaded,
    sceneKind,
    activeWorld,
    activeAnimal,
    activeFlow,
    layerAnimals,
    animalTweaks,
    characterStyle,
    colorTheme,
    fontSize,
    charDensity,
    animationSpeed,
    interactionIntensity,
    reducedMotion,
    performanceTier,
    calmCenter,
    dimBackground,
  } = useSettingsStore();

  // Create the engine once, after saved settings are in (avoids a flash of the default world).
  useEffect(() => {
    if (!canvasRef.current || !isLoaded || engineRef.current) return;
    const s = useSettingsStore.getState();
    const engine = new Engine({
      fontSize: s.fontSize,
      charDensity: s.charDensity,
      style: s.characterStyle,
      colorTheme: s.colorTheme,
      animationSpeed: s.animationSpeed,
      interactionIntensity: s.interactionIntensity,
      reducedMotion: s.reducedMotion,
      performanceTier: s.performanceTier,
      calmCenter: s.calmCenter,
    });
    engine.setTunings(s.animalTweaks);
    const scene = sceneFor(s);
    engine.setScene(scene.base, scene.overlay);
    engine.attach(canvasRef.current);
    engineRef.current = engine;
  }, [isLoaded]);

  useEffect(
    () => () => {
      engineRef.current?.detach();
      engineRef.current = null;
    },
    []
  );

  useEffect(() => {
    engineRef.current?.setTunings(animalTweaks);
  }, [animalTweaks]);

  useEffect(() => {
    const scene = sceneFor({ sceneKind, activeWorld, activeAnimal, activeFlow, layerAnimals });
    engineRef.current?.setScene(scene.base, scene.overlay);
  }, [sceneKind, activeWorld, activeAnimal, activeFlow, layerAnimals]);

  useEffect(() => {
    engineRef.current?.updateConfig({
      fontSize,
      charDensity,
      style: characterStyle,
      colorTheme,
      animationSpeed,
      interactionIntensity,
      reducedMotion,
      performanceTier,
      calmCenter,
    });
  }, [characterStyle, colorTheme, fontSize, charDensity, animationSpeed, interactionIntensity, reducedMotion, performanceTier, calmCenter]);

  // Track the central UI box so the engine can keep the art calm behind it.
  useEffect(() => {
    const el = focusRef?.current;
    if (!el || !isLoaded) return;
    const push = () => {
      const r = el.getBoundingClientRect();
      engineRef.current?.setFocusRect(r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null);
    };
    const ro = new ResizeObserver(push);
    ro.observe(el);
    window.addEventListener('resize', push);
    const id = window.setTimeout(push, 50);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', push);
      window.clearTimeout(id);
    };
  }, [focusRef, isLoaded]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair touch-none" aria-hidden="true" />
      <div
        className={`absolute inset-0 bg-black pointer-events-none transition-opacity duration-500 ${dimBackground ? 'opacity-40' : 'opacity-0'}`}
      />
    </div>
  );
};
