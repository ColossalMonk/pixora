import React, { useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { WORLDS } from '../../data/worlds';
import { Engine } from '../../engine/core/Engine';
import { EnvironmentId } from '../../types/environment';
import { useEscape } from '../common/useEscape';

interface EnvironmentGalleryProps {
  isOpen: boolean;
  onClose: () => void;
}

const Preview: React.FC<{ id: EnvironmentId }> = ({ id }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { colorTheme, characterStyle } = useSettingsStore();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // Defer so opening the gallery stays snappy.
    const handle = window.setTimeout(() => Engine.renderSnapshot(id, canvas, { colorTheme, style: characterStyle }), 30);
    return () => window.clearTimeout(handle);
  }, [id, colorTheme, characterStyle]);
  return <canvas ref={ref} className="block w-full h-28 rounded-xl" aria-hidden="true" />;
};

export const EnvironmentGallery: React.FC<EnvironmentGalleryProps> = ({ isOpen, onClose }) => {
  const { activeEnvironment, setEnvironment } = useSettingsStore();
  useEscape(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a world"
    >
      <div className="glass-panel w-full max-w-3xl max-h-[88vh] rounded-3xl p-6 overflow-y-auto border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Worlds</h2>
            <p className="text-xs text-slate-400 mt-0.5">Pick a living ASCII world. Each one reacts to your pointer.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {WORLDS.map((w) => {
            const isActive = activeEnvironment === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setEnvironment(w.id);
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
                  {isActive && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-teal-300 bg-teal-400/10 px-2 py-0.5 rounded-full">
                      <Check className="w-3 h-3" /> Showing
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1">{w.tagline}</p>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{w.interactions}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
