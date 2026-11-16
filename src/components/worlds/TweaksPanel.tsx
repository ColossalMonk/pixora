import React, { useState } from 'react';
import { X, Copy, Check, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { knobsFor } from '../../engine/environments/registry';
import { sceneMeta } from '../../data/catalog';
import { useEscape } from '../common/useEscape';

interface TweaksPanelProps {
  animalId: string;
  onClose: () => void;
}

/**
 * Per-animal tuning (after ascii-animals' Tweaks panel): one slider per knob,
 * saved per animal. Double-click a label to reset that knob; "Copy" exports
 * only the values you changed, as JSON.
 */
export const TweaksPanel: React.FC<TweaksPanelProps> = ({ animalId, onClose }) => {
  const { animalTweaks, updateSettings } = useSettingsStore();
  const [copied, setCopied] = useState(false);
  useEscape(true, onClose);
  const knobs = knobsFor(animalId);
  const saved = animalTweaks[animalId] ?? {};
  const meta = sceneMeta(animalId);

  const setValue = (key: string, value: number | undefined) => {
    const next = { ...saved };
    if (value === undefined) delete next[key];
    else next[key] = value;
    updateSettings({ animalTweaks: { ...animalTweaks, [animalId]: next } });
  };

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify({ [animalId]: saved }, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="absolute bottom-16 right-4 z-30 w-72 max-h-[60vh] overflow-y-auto glass-panel rounded-2xl border border-white/10 shadow-2xl p-4 text-xs pointer-events-auto animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: meta.accent }} />
          {meta.name} tweaks
        </div>
        <button type="button" onClick={onClose} aria-label="Close tweaks" className="p-1 rounded-full hover:bg-white/10 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        {knobs.map((k) => {
          const value = saved[k.key] ?? k.value;
          const changed = saved[k.key] !== undefined;
          return (
            <label key={k.key} className="block" title={k.hint}>
              <span className="flex justify-between text-[11px] mb-1">
                <span
                  className={`select-none ${changed ? 'text-teal-200' : 'text-slate-400'}`}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    setValue(k.key, undefined);
                  }}
                >
                  {k.label}
                </span>
                <span className="font-mono text-slate-300">{Number(value.toFixed(2))}</span>
              </span>
              <input
                type="range"
                min={k.min}
                max={k.max}
                step={k.step}
                value={value}
                onChange={(e) => setValue(k.key, Number(e.target.value))}
                className="w-full accent-teal-400 cursor-pointer"
              />
            </label>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-500 mt-3">Double-click a label to reset it. Some changes (how many, depth range) apply when the animal re-enters.</p>
      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={copy} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] text-slate-300 hover:bg-white/10">
          {copied ? <Check className="w-3.5 h-3.5 text-teal-300" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy changes'}
        </button>
        <button type="button" onClick={() => updateSettings({ animalTweaks: { ...animalTweaks, [animalId]: {} } })} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] text-slate-300 hover:bg-white/10">
          <RotateCcw className="w-3.5 h-3.5" /> Reset all
        </button>
      </div>
    </div>
  );
};
