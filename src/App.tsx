import React, { useState, useEffect, useRef } from 'react';
import { AsciiCanvas } from './components/canvas/AsciiCanvas';
import { ConversationalGreeting } from './components/greeting/ConversationalGreeting';
import { CentralSearchBar } from './components/search/CentralSearchBar';
import { ShortcutsBar } from './components/shortcuts/ShortcutsBar';
import { AmbientClock } from './components/widgets/AmbientClock';
import { TopBar } from './components/navigation/TopBar';
import { EdgeHoverDrawer } from './components/drawer/EdgeHoverDrawer';
import { useSettingsStore } from './store/useSettingsStore';
import { ImageStore } from './services/imageStore';
import { CustomSlotId } from './types/environment';

export const App: React.FC = () => {
  const { loadSettings, activeScene, setActiveScene } = useSettingsStore();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const [isZenMode, setIsZenMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => searchParams?.get('drawer') === 'true');
  const [dropToast, setDropToast] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadSettings();
    const queryScene = searchParams?.get('scene');
    if (queryScene) {
      setActiveScene(queryScene as any);
    }
  }, [loadSettings]);

  // Global hotkeys: 'Z' for Zen Mode, 'S' for Settings, 'Esc' to exit
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        setIsZenMode((prev) => !prev);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (isSettingsOpen) {
          e.preventDefault();
          setIsSettingsOpen(false);
        } else if (isZenMode) {
          e.preventDefault();
          setIsZenMode(false);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isZenMode, isSettingsOpen]);

  // Drop an image or video anywhere on the page to render with glowing effect
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      const file = Array.from(e.dataTransfer?.files ?? []).find((x) =>
        x.type.startsWith('image/') || x.type.startsWith('video/')
      );
      if (!file) return;
      e.preventDefault();

      const targetSlot: CustomSlotId = activeScene.startsWith('custom-')
        ? (activeScene as CustomSlotId)
        : 'custom-1';

      await ImageStore.saveImage(targetSlot, file);
      setActiveScene(targetSlot);

      setDropToast(`Applied to ${targetSlot.replace('-', ' ').toUpperCase()} with Phosphor Glow`);
      setTimeout(() => setDropToast(null), 3500);
    };

    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [activeScene, setActiveScene]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#06070c] text-slate-100 font-sans select-none">
      {/* 1. Procedural Simulation Canvas (Full Screen) */}
      <AsciiCanvas focusRef={focusRef} />

      {/* 2. Top Bar: Weather (Left), Selection Pill on Top Hover (Center), Zen & Gear Icons (Right) */}
      <TopBar
        isZenMode={isZenMode}
        onToggleZen={() => setIsZenMode(!isZenMode)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 3. Central Interactive Hub (Clock, Greeting, Search, Shortcuts) */}
      <main
        ref={focusRef}
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center p-4 pointer-events-none transition-all duration-700 ease-out ${
          isZenMode ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
        }`}
      >
        <div className="w-full max-w-2xl flex flex-col items-center pointer-events-auto">
          {/* Ambient Monospace Clock */}
          <div className="mb-3">
            <AmbientClock />
          </div>

          {/* Conversational Greeting */}
          <div className="mb-6">
            <ConversationalGreeting />
          </div>

          {/* Liquid Glass Search Bar */}
          <CentralSearchBar />

          {/* Customizable Shortcuts Bar */}
          <ShortcutsBar />
        </div>
      </main>

      {/* 4. Drop Toast Notification */}
      {dropToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-teal-500/20 border border-teal-400/40 text-teal-200 text-xs shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
          <span>{dropToast}</span>
        </div>
      )}

      {/* 5. Control Panel / Drawer (Opens on clicking Gear icon) */}
      <EdgeHoverDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
