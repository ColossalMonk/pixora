import React, { useEffect, useRef } from 'react';
import { Engine } from '../../engine/core/Engine';
import { useSettingsStore } from '../../store/useSettingsStore';

export const AsciiCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const {
    activeEnvironment,
    characterStyle,
    colorTheme,
    fontSize,
    charDensity,
    animationSpeed,
    reducedMotion,
    performanceTier,
    dimBackground,
  } = useSettingsStore();

  // Initialize engine once on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine({
      fontSize,
      charDensity,
      style: characterStyle,
      colorTheme,
      animationSpeed,
      reducedMotion,
      performanceTier,
    });

    engine.attach(canvasRef.current);
    engine.setEnvironment(activeEnvironment);
    engineRef.current = engine;

    return () => {
      engine.detach();
      engineRef.current = null;
    };
  }, []);

  // Sync environment
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setEnvironment(activeEnvironment);
    }
  }, [activeEnvironment]);

  // Sync engine configuration
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateConfig({
        fontSize,
        charDensity,
        style: characterStyle,
        colorTheme,
        animationSpeed,
        reducedMotion,
        performanceTier,
      });
    }
  }, [characterStyle, colorTheme, fontSize, charDensity, animationSpeed, reducedMotion, performanceTier]);

  return (
    <div className="absolute inset-0 pointer-events-auto overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
      />
      {dimBackground && (
        <div className="absolute inset-0 bg-black/40 pointer-events-none transition-opacity duration-300" />
      )}
    </div>
  );
};
