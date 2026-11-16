import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pin, PinOff, Info, Mountain, Bird, Wind, Layers, SlidersHorizontal, Image as ImageIcon } from 'lucide-react';
import { TweaksPanel } from './TweaksPanel';
import { WallpaperPanel } from './WallpaperPanel';
import { KEEP_KEY, activeOf, sceneFor, useSettingsStore } from '../../store/useSettingsStore';
import { KIND_LABEL, sceneMeta } from '../../data/catalog';
import { SceneKind } from '../../types/environment';

const KINDS: { kind: SceneKind; icon: React.ReactNode }[] = [
  { kind: 'world', icon: <Mountain className="w-3.5 h-3.5" /> },
  { kind: 'animal', icon: <Bird className="w-3.5 h-3.5" /> },
  { kind: 'flow', icon: <Wind className="w-3.5 h-3.5" /> },
];

/**
 * Bottom bar: category switcher (Worlds / Animals / Flows), the current
 * scene with previous/next, and that category's "Keep this forever" pin.
 * Bottom-left shows how to play with what's on screen, then fades.
 */
export const WorldBar: React.FC = () => {
  const settings = useSettingsStore();
  const { sceneKind, dailyEnvironmentRotation, cycleScene, setSceneKind, toggleKeep } = settings;
  const currentId = activeOf(settings, sceneKind);
  const meta = sceneMeta(currentId);
  const keep = settings[KEEP_KEY[sceneKind]];
  const scene = sceneFor(settings);
  const overlayMeta = scene.overlay ? sceneMeta(scene.overlay) : null;
  const [hintVisible, setHintVisible] = useState(true);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const tweakTarget = sceneKind === 'animal' ? currentId : scene.overlay;
  const imageWorld = sceneKind === 'world' && currentId === 'your-image';
  const [wallpaperOpen, setWallpaperOpen] = useState(false);

  useEffect(() => {
    setHintVisible(true);
    const id = window.setTimeout(() => setHintVisible(false), 7000);
    return () => window.clearTimeout(id);
  }, [currentId, scene.overlay]);

  const status = keep ? 'Kept forever' : dailyEnvironmentRotation ? 'Changes tomorrow' : 'Rotation off';
  const hint = overlayMeta?.interactions ? `${meta.interactions} · ${overlayMeta.interactions}` : meta.interactions;

  return (
    <>
      <div className="hidden md:block absolute bottom-4 left-4 z-20 max-w-sm pointer-events-auto group">
        <div
          className={`flex items-start gap-2 px-3 py-2 rounded-2xl glass-panel-subtle text-[11px] leading-relaxed text-slate-300 transition-opacity duration-700 ${
            hintVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: meta.accent }} />
          <span>{hint}</span>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 z-20 pointer-events-auto flex justify-center sm:block">
        <div className="flex items-center gap-1 p-1 rounded-full glass-panel text-xs text-slate-200 shadow-lg whitespace-nowrap max-w-full">
          <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-white/5" role="tablist" aria-label="Category">
            {KINDS.map(({ kind, icon }) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={sceneKind === kind}
                title={KIND_LABEL[kind]}
                onClick={() => setSceneKind(kind)}
                className={`p-1.5 rounded-full transition-colors ${sceneKind === kind ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {icon}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => cycleScene(-1)} className="p-1.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Previous">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-1 font-medium sm:min-w-[6.5rem] text-center flex items-center justify-center gap-1.5 truncate">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.accent }} />
            {meta.name}
            {overlayMeta && (
              <span className="flex items-center gap-1 text-[10px] text-teal-200/90 bg-teal-400/10 px-1.5 py-0.5 rounded-full" title="Layered animal">
                <Layers className="w-3 h-3" /> {overlayMeta.short}
              </span>
            )}
          </span>
          <button type="button" onClick={() => cycleScene(1)} className="p-1.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Next">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {imageWorld && (
            <button
              type="button"
              onClick={() => setWallpaperOpen((v) => !v)}
              className={`p-1.5 rounded-full ${wallpaperOpen ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'}`}
              aria-label="Wallpaper settings"
              title="Your Image settings"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {tweakTarget && (
            <button
              type="button"
              onClick={() => setTweaksOpen((v) => !v)}
              className={`p-1.5 rounded-full ${tweaksOpen ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'}`}
              aria-label="Animal tweaks"
              title="Tweak this animal"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button
            type="button"
            role="switch"
            aria-checked={keep}
            onClick={toggleKeep}
            title={keep ? `This ${sceneKind} stays. Click to let it change daily again.` : `Pin this ${sceneKind} so it never changes`}
            className={`flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-full transition-colors ${keep ? 'bg-teal-400/15 text-teal-200' : 'hover:bg-white/10 text-slate-300'}`}
          >
            {keep ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5 opacity-70" />}
            <span className="flex flex-col items-start leading-tight">
              <span className="font-medium">Keep this forever</span>
              <span className="hidden sm:inline text-[10px] text-slate-400">{status}</span>
            </span>
            <span className={`relative inline-flex w-8 h-[18px] rounded-full transition-colors ${keep ? 'bg-teal-400' : 'bg-white/15'}`}>
              <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${keep ? 'left-[16px]' : 'left-[2px]'}`} />
            </span>
          </button>
        </div>
      </div>
      {tweaksOpen && tweakTarget && <TweaksPanel animalId={tweakTarget} onClose={() => setTweaksOpen(false)} />}
      {wallpaperOpen && imageWorld && <WallpaperPanel onClose={() => setWallpaperOpen(false)} />}
    </>
  );
};
