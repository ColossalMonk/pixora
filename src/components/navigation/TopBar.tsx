import React, { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { CATALOG } from '../../data/catalog';
import { CustomSlotId, SceneId } from '../../types/environment';
import { WeatherWidget } from '../widgets/WeatherWidget';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Settings } from 'lucide-react';

interface TopBarProps {
  isZenMode: boolean;
  onToggleZen: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ isZenMode, onToggleZen, onOpenSettings }) => {
  const [isPillHovered, setIsPillHovered] = useState(false);
  // Opened by clicking the scene chip (works on touch screens too); stays until a pick or outside click.
  const [isPillPinned, setIsPillPinned] = useState(false);
  const { activeScene, setActiveScene, customConfigs } = useSettingsStore();
  const pillRef = useRef<HTMLDivElement | null>(null);

  const labelOf = (id: string) => {
    const meta = CATALOG.find((s) => s.id === id);
    const customName = id.startsWith('custom-') ? customConfigs[id as CustomSlotId]?.name?.trim() : undefined;
    return customName || meta?.short || id;
  };
  const index = Math.max(0, CATALOG.findIndex((s) => s.id === activeScene));
  const current = CATALOG[index];
  const step = (dir: number) => {
    const next = CATALOG[(index + dir + CATALOG.length) % CATALOG.length];
    setActiveScene(next.id as SceneId);
  };
  const isPillOpen = (isPillHovered || isPillPinned) && !isZenMode;

  // Close the pinned pill on an outside click or Esc.
  useEffect(() => {
    if (!isPillPinned) return;
    const onDown = (e: PointerEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) setIsPillPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPillPinned(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isPillPinned]);

  // Reveal selection pill ONLY when hovering near the top-center edge
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Check if cursor is near top center (within central 70% width and top 48px)
      const isTop = e.clientY <= 48;
      const isCenter = e.clientX >= window.innerWidth * 0.15 && e.clientX <= window.innerWidth * 0.85;

      if (isTop && isCenter) {
        setIsPillHovered(true);
      } else if (e.clientY > 90) {
        setIsPillHovered(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <>
      {/* ── 1. Top-Left: Weather Widget (Always visible, not hidden) ── */}
      <div
        className={`fixed top-4 left-6 z-30 transition-all duration-700 ease-out select-none ${
          isZenMode ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100'
        }`}
      >
        <WeatherWidget />
      </div>

      {/* ── 2. Top-Right: Zen Icon + Gear Icon (Zen is never hidden; Gear directly opens settings) ── */}
      <div className="fixed top-4 right-6 z-30 flex items-center gap-2 select-none">
        {/* Zen Mode Button (Always visible so the user can easily toggle Zen on/off) */}
        <button
          type="button"
          onClick={onToggleZen}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0c0e14]/85 backdrop-blur-2xl text-xs font-medium border transition-all duration-300 cursor-pointer shadow-xl active:scale-95 ${
            isZenMode
              ? 'bg-teal-500/30 text-teal-200 border-teal-400/50 opacity-80 hover:opacity-100 shadow-[0_0_12px_rgba(45,212,191,0.3)]'
              : 'text-slate-200 hover:text-white hover:bg-white/10 border-white/12 opacity-100'
          }`}
          title="Zen Mode (Hotkey: Z or Esc)"
          aria-label="Toggle Zen Mode"
        >
          {isZenMode ? <EyeOff className="w-3.5 h-3.5 text-teal-300" /> : <Eye className="w-3.5 h-3.5" />}
          <span>Zen</span>
        </button>

        {/* Gear Icon Button (Directly opens control panel, NO rotation on hover, fades in Zen mode) */}
        <button
          type="button"
          onClick={onOpenSettings}
          className={`w-9 h-9 rounded-full bg-[#0c0e14]/85 backdrop-blur-2xl flex items-center justify-center text-slate-200 hover:text-white hover:bg-white/10 active:scale-95 transition-all duration-500 shadow-xl border border-white/12 cursor-pointer ${
            isZenMode ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
          }`}
          title="Settings & Tweaks (Hotkey: S)"
          aria-label="Open Settings and Tweaks"
        >
          <Settings className="w-4 h-4 text-slate-300 hover:text-white transition-colors" />
        </button>
      </div>

      {/* ── 2b. Top-Center: always-visible scene chip (‹ name ›), hidden while the full pill is open ── */}
      <div
        className={`fixed bottom-4 sm:bottom-auto sm:top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 p-0.5 rounded-full bg-[#0c0e14]/85 backdrop-blur-2xl border border-white/12 shadow-xl select-none transition-all duration-300 ${
          isZenMode || isPillOpen ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={() => step(-1)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          title="Previous scene (←)"
          aria-label="Previous scene"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setIsPillPinned(true)}
          className="flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer"
          title="All scenes (keys 1–0, ← →)"
          aria-label={`Scene: ${labelOf(current.id)}. Show all scenes`}
          aria-haspopup="listbox"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: current.accent }} aria-hidden="true" />
          <span className="truncate max-w-[140px]">{labelOf(current.id)}</span>
          <span className="text-slate-500 tabular-nums">{index + 1}/{CATALOG.length}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          title="Next scene (→)"
          aria-label="Next scene"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── 3. Top-Center Hover Trigger Area ── */}
      <div
        className="fixed top-0 left-1/4 right-1/4 h-5 z-40 pointer-events-auto"
        onMouseEnter={() => setIsPillHovered(true)}
      />

      {/* ── 4. Top-Center: ONLY the Selection Pill Reveals on Hover ── */}
      <div
        onMouseEnter={() => setIsPillHovered(true)}
        onMouseLeave={() => setIsPillHovered(false)}
        className={`fixed top-3 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ease-out select-none ${
          isPillOpen
            ? 'translate-y-0 opacity-100 pointer-events-auto scale-100'
            : '-translate-y-12 opacity-0 pointer-events-none scale-95'
        }`}
        ref={pillRef}
        role="listbox"
        aria-label="Scenes"
      >
        <div className="flex items-center gap-1 p-1 rounded-2xl glass-panel-subtle border border-white/10 shadow-2xl backdrop-blur-2xl bg-[#090a10]/80 max-w-[92vw] overflow-x-auto custom-scrollbar">
          {CATALOG.map((scene) => {
            const isSelected = activeScene === scene.id;
            const displayLabel = labelOf(scene.id);

            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => {
                  setActiveScene(scene.id as SceneId);
                  setIsPillPinned(false);
                  setIsPillHovered(false);
                }}
                role="option"
                aria-selected={isSelected}
                title={`${labelOf(scene.id)} (key ${(CATALOG.indexOf(scene) + 1) % 10})`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: scene.accent }}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[100px]">{displayLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
