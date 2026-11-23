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
import { CustomSlotId, SceneId } from './types/environment';
import { CATALOG } from './data/catalog';

export const App: React.FC = () => {
  const { loadSettings, activeScene, setActiveScene } = useSettingsStore();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const [isZenMode, setIsZenMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => searchParams?.get('drawer') === 'true');
  const [dropToast, setDropToast] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Apply ?scene= only after saved settings are in, and only if it names a real scene;
    // switching earlier would save default settings over the user's own.
    const queryScene = searchParams?.get('scene');
    loadSettings().then(() => {
      if (queryScene && CATALOG.some((s) => s.id === queryScene)) {
        setActiveScene(queryScene as SceneId);
      }
    });
  }, [loadSettings]);

  // Global hotkeys: 'Z' for Zen Mode, 'S' for Settings, 'Esc' to exit
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName || '') || el?.isContentEditable) return;
      // Leave browser shortcuts (Ctrl+S, Cmd+Z, Alt+←…) alone.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Scenes: ← → (or [ ]) step through them, 1–9 and 0 jump straight to one.
      const sceneIndex = CATALOG.findIndex((s) => s.id === useSettingsStore.getState().activeScene);
      const go = (i: number) => {
        e.preventDefault();
        setActiveScene(CATALOG[(i + CATALOG.length) % CATALOG.length].id as SceneId);
      };
      if (e.key === 'ArrowRight' || e.key === ']') return go(sceneIndex + 1);
      if (e.key === 'ArrowLeft' || e.key === '[') return go(sceneIndex - 1);
      if (/^[0-9]$/.test(e.key)) {
        const i = e.key === '0' ? 9 : Number(e.key) - 1;
        if (i < CATALOG.length) return go(i);
      }

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

      // Viewing a slot: replace it. Otherwise use the first empty slot, so a drop
      // never silently overwrites a picture you already set up.
      let targetSlot: CustomSlotId = 'custom-1';
      if (activeScene.startsWith('custom-')) {
        targetSlot = activeScene as CustomSlotId;
      } else {
        for (const slot of ['custom-1', 'custom-2', 'custom-3'] as CustomSlotId[]) {
          if (!(await ImageStore.loadImage(slot))) {
            targetSlot = slot;
            break;
          }
        }
      }

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
      <AsciiCanvas focusRef={focusRef} calm={!isZenMode} />

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
