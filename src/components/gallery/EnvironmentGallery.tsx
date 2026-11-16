import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Mountain, Bird, Wind, Layers } from 'lucide-react';
import { activeOf, useSettingsStore } from '../../store/useSettingsStore';
import { CATALOG, KIND_LABEL, fits, scenesOf } from '../../data/catalog';
import { Engine } from '../../engine/core/Engine';
import { EnvironmentId, SceneKind } from '../../types/environment';
import { useEscape } from '../common/useEscape';

interface EnvironmentGalleryProps {
  isOpen: boolean;
  onClose: () => void;
}

const KIND_ICON: Record<SceneKind, React.ReactNode> = {
  world: <Mountain className="w-3.5 h-3.5" />,
  animal: <Bird className="w-3.5 h-3.5" />,
  flow: <Wind className="w-3.5 h-3.5" />,
};

const Preview: React.FC<{ id: EnvironmentId }> = ({ id }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { colorTheme, characterStyle } = useSettingsStore();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const handle = window.setTimeout(() => Engine.renderSnapshot(id, canvas, { colorTheme, style: characterStyle }), 30);
    return () => window.clearTimeout(handle);
  }, [id, colorTheme, characterStyle]);
  return <canvas ref={ref} className="block w-full h-28 rounded-xl" aria-hidden="true" />;
};

export const EnvironmentGallery: React.FC<EnvironmentGalleryProps> = ({ isOpen, onClose }) => {
  const settings = useSettingsStore();
  const { sceneKind, showScene, layerAnimals, activeWorld } = settings;
  const [tab, setTab] = useState<SceneKind>(sceneKind);
  useEscape(isOpen, onClose);
  useEffect(() => {
    if (isOpen) setTab(sceneKind);
  }, [isOpen, sceneKind]);

  if (!isOpen) return null;
  const current = activeOf(settings, tab);
  const items = scenesOf(tab);
  const planned = CATALOG.filter((s) => s.kind === tab && !s.ready);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a scene"
    >
      <div className="glass-panel w-full max-w-3xl max-h-[88vh] rounded-3xl p-6 overflow-y-auto border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/10 mb-5">
          <div role="tablist" className="flex items-center gap-1 p-1 rounded-full bg-white/5">
            {(['world', 'animal', 'flow'] as SceneKind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  tab === k ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {KIND_ICON[k]} {KIND_LABEL[k]}
                <span className="text-[10px] text-slate-500">{scenesOf(k).length}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {tab === 'animal' && layerAnimals && (
          <p className="flex items-center gap-2 text-[11px] text-slate-400 mb-4">
            <Layers className="w-3.5 h-3.5 text-teal-300" />
            Layering is on: animals marked “fits” can also live on top of your current world.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((w) => {
            const isActive = sceneKind === tab && current === w.id;
            const fit = tab === 'animal' && layerAnimals ? fits(activeWorld, w.id) : null;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  showScene(tab, w.id);
                  onClose();
                }}
                className={`group relative p-3 rounded-2xl text-left transition-all duration-200 border focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70 ${
                  isActive ? 'bg-white/[0.06] border-white/25' : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.05]'
                }`}
              >
                <div className="overflow-hidden rounded-xl border border-white/5">
                  <Preview id={w.id} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: w.accent }} />
                    {w.name}
                  </h3>
                  {isActive ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-teal-300 bg-teal-400/10 px-2 py-0.5 rounded-full">
                      <Check className="w-3 h-3" /> Showing
                    </span>
                  ) : fit ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${fit.ok ? 'text-teal-200 bg-teal-400/10' : 'text-slate-500 bg-white/5'}`} title={fit.reason}>
                      {fit.ok ? 'fits' : 'not here'}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-300 mt-1">{w.tagline}</p>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{w.interactions}</p>
              </button>
            );
          })}
        </div>

        {planned.length > 0 && (
          <div className="mt-6 pt-4 border-t border-white/5">
            <h4 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Coming soon</h4>
            <div className="flex flex-wrap gap-2">
              {planned.map((p) => (
                <span key={p.id} className="text-[11px] text-slate-400 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/5">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
