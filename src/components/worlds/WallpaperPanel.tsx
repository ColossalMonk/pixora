import React, { useRef } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { DEFAULT_WALLPAPER, WallpaperEffect, WallpaperOptions, WallpaperStyle, Wallpaper } from '../../engine/environments/ImageWorld';
import { ColorMode } from '../../engine/image-converter/ImageProcessor';
import { useEscape } from '../common/useEscape';
import { setWallpaperFile, clearWallpaper } from './wallpaperActions';

const STYLES: { id: WallpaperStyle; label: string }[] = [
  { id: 'tiles', label: 'Tiles' },
  { id: 'characters', label: 'Characters' },
  { id: 'braille', label: 'Braille' },
  { id: 'blocks', label: 'Blocks' },
];
const COLORS: { id: ColorMode; label: string }[] = [
  { id: 'full', label: 'Full' },
  { id: 'mono', label: 'Mono' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'amber', label: 'Amber' },
];
const EFFECTS: { id: WallpaperEffect; label: string }[] = [
  { id: 'ripple', label: 'Ripple' },
  { id: 'repel', label: 'Repel' },
  { id: 'lens', label: 'Reveal lens' },
  { id: 'drift', label: 'Drift' },
  { id: 'none', label: 'Still' },
];

const Chips = <T extends string>({ items, value, onChange }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((it) => (
      <button
        key={it.id}
        type="button"
        onClick={() => onChange(it.id)}
        className={`px-2.5 py-1 rounded-full border text-[11px] ${value === it.id ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
      >
        {it.label}
      </button>
    ))}
  </div>
);

/** Controls for the Your Image wallpaper: picture, style, colour, effect and tone. */
export const WallpaperPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { wallpaper, updateSettings } = useSettingsStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  useEscape(true, onClose);
  const set = (patch: Partial<WallpaperOptions>) => updateSettings({ wallpaper: { ...wallpaper, ...patch } });
  const slider = (key: 'brightness' | 'contrast' | 'gamma' | 'dim', label: string, min: number, max: number, step: number) => (
    <label className="block">
      <span className="flex justify-between text-[11px] mb-1 text-slate-400">
        <span onDoubleClick={() => set({ [key]: DEFAULT_WALLPAPER[key] } as Partial<WallpaperOptions>)} className="select-none">
          {label}
        </span>
        <span className="font-mono text-slate-300">{wallpaper[key].toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={wallpaper[key]} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<WallpaperOptions>)} className="w-full accent-teal-400 cursor-pointer" />
    </label>
  );

  return (
    <div className="absolute bottom-16 right-4 z-30 w-80 max-h-[70vh] overflow-y-auto glass-panel rounded-2xl border border-white/10 shadow-2xl p-4 text-xs pointer-events-auto animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-slate-100">Your Image</div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-white/10 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-200">
          <Upload className="w-3.5 h-3.5" /> {Wallpaper.image ? 'Replace picture' : 'Choose picture'}
        </button>
        {Wallpaper.image && (
          <button type="button" onClick={() => clearWallpaper()} className="px-3 py-2 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5" title="Remove picture">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setWallpaperFile(f);
            e.target.value = '';
          }}
        />
      </div>
      <p className="text-[10px] text-slate-500 -mt-2">You can also drop a picture anywhere on the page. It stays on this computer.</p>

      <section className="space-y-1.5">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Style</h4>
        <Chips items={STYLES} value={wallpaper.style} onChange={(v) => set({ style: v })} />
      </section>
      <section className="space-y-1.5">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Colour</h4>
        <Chips items={COLORS} value={wallpaper.color} onChange={(v) => set({ color: v })} />
      </section>
      <section className="space-y-1.5">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Pointer effect</h4>
        <Chips items={EFFECTS} value={wallpaper.effect} onChange={(v) => set({ effect: v })} />
      </section>
      <section className="space-y-3">
        {slider('brightness', 'Brightness', -0.4, 0.4, 0.02)}
        {slider('contrast', 'Contrast', 0.5, 2, 0.05)}
        {slider('gamma', 'Gamma', 0.5, 2, 0.05)}
        {slider('dim', 'Dim behind clock & search', 0, 0.8, 0.05)}
        <label className="flex items-center justify-between text-slate-300 cursor-pointer">
          <span>Invert</span>
          <input type="checkbox" checked={wallpaper.invert} onChange={(e) => set({ invert: e.target.checked })} className="accent-teal-400" />
        </label>
      </section>
    </div>
  );
};
