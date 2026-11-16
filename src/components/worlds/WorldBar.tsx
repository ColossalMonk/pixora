import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pin, PinOff, Info } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { worldMeta } from '../../data/worlds';

/**
 * Bottom bar: world name with previous/next, and the "Keep this forever"
 * switch that pins the current world and stops daily rotation.
 * Bottom-left shows how to play with the current world, then fades.
 */
export const WorldBar: React.FC = () => {
  const { activeEnvironment, keepWorld, dailyEnvironmentRotation, cycleEnvironment, updateSettings } = useSettingsStore();
  const meta = worldMeta(activeEnvironment);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    setHintVisible(true);
    const id = window.setTimeout(() => setHintVisible(false), 7000);
    return () => window.clearTimeout(id);
  }, [activeEnvironment]);

  const status = keepWorld ? 'Kept forever' : dailyEnvironmentRotation ? 'New world tomorrow' : 'Rotation off';

  return (
    <>
      <div className="hidden md:block absolute bottom-4 left-4 z-20 max-w-sm pointer-events-auto group">
        <div
          className={`flex items-start gap-2 px-3 py-2 rounded-2xl glass-panel-subtle text-[11px] leading-relaxed text-slate-300 transition-opacity duration-700 ${
            hintVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: meta.accent }} />
          <span>{meta.interactions}</span>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 z-20 pointer-events-auto flex justify-center sm:block">
        <div className="flex items-center gap-1 p-1 rounded-full glass-panel text-xs text-slate-200 shadow-lg whitespace-nowrap max-w-full">
          <button type="button" onClick={() => cycleEnvironment(-1)} className="p-1.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Previous world">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-1 font-medium sm:min-w-[6.5rem] text-center flex items-center justify-center gap-1.5 truncate">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.accent }} />
            {meta.name}
          </span>
          <button type="button" onClick={() => cycleEnvironment(1)} className="p-1.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Next world">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button
            type="button"
            role="switch"
            aria-checked={keepWorld}
            onClick={() => updateSettings({ keepWorld: !keepWorld })}
            title={keepWorld ? 'This world stays. Click to let worlds change daily again.' : 'Pin this world so it never changes'}
            className={`flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-full transition-colors ${keepWorld ? 'bg-teal-400/15 text-teal-200' : 'hover:bg-white/10 text-slate-300'}`}
          >
            {keepWorld ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5 opacity-70" />}
            <span className="flex flex-col items-start leading-tight">
              <span className="font-medium">Keep this forever</span>
              <span className="hidden sm:inline text-[10px] text-slate-400">{status}</span>
            </span>
            <span className={`relative inline-flex w-8 h-[18px] rounded-full transition-colors ${keepWorld ? 'bg-teal-400' : 'bg-white/15'}`}>
              <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${keepWorld ? 'left-[16px]' : 'left-[2px]'}`} />
            </span>
          </button>
        </div>
      </div>
    </>
  );
};
