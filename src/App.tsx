import React, { useState, useEffect, useRef } from 'react';
import { AsciiCanvas } from './components/canvas/AsciiCanvas';
import { ConversationalGreeting } from './components/greeting/ConversationalGreeting';
import { CentralSearchBar } from './components/search/CentralSearchBar';
import { ShortcutsBar } from './components/shortcuts/ShortcutsBar';
import { AmbientClock } from './components/widgets/AmbientClock';
import { WeatherWidget } from './components/widgets/WeatherWidget';
import { EnvironmentGallery } from './components/gallery/EnvironmentGallery';
import { ImageConverterModal } from './components/converter/ImageConverterModal';
import { SettingsDrawer } from './components/settings/SettingsDrawer';
import { useSettingsStore } from './store/useSettingsStore';
import { WorldBar } from './components/worlds/WorldBar';
import { scenesOf } from './data/catalog';
import { activeOf } from './store/useSettingsStore';
import { Compass, Image as ImageIcon, Sliders } from 'lucide-react';

export const App: React.FC = () => {
  const settings = useSettingsStore();
  const { loadSettings, showTopWorldCapsule, sceneKind, showScene } = settings;
  const current = activeOf(settings, sceneKind);

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const focusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#08080a] text-slate-100 font-sans select-none">
      {/* 1. Generative ASCII Animation Canvas (Background Layer) */}
      <AsciiCanvas focusRef={focusRef} />

      {/* 2. Top Navigation Bar (Productivity Header) */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 md:p-6 pointer-events-none">
        {/* Left: Weather Widget */}
        <div className="pointer-events-auto">
          <WeatherWidget />
        </div>

        {/* Center: Optional Top Worlds Capsule Switcher (Hidden in settings, off by default) */}
        {showTopWorldCapsule && (
          <nav
            aria-label="Quick World Switcher"
            className="hidden md:flex items-center gap-1 p-1 rounded-full glass-panel shadow-lg pointer-events-auto border border-white/10 animate-fade-in"
          >
            {scenesOf(sceneKind).map((w) => {
              const isActive = current === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => showScene(sceneKind, w.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-teal-400 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {w.short}
                </button>
              );
            })}
          </nav>
        )}

        {/* Right: Quick Tool Pills */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Environment Gallery */}
          <button
            type="button"
            onClick={() => setIsGalleryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel hover:glass-button text-xs font-medium text-slate-200 shadow-md transition-all hover:scale-105"
            title="Browse Procedural Environments"
          >
            <Compass className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Worlds</span>
          </button>

          {/* Image-to-ASCII Studio */}
          <button
            type="button"
            onClick={() => setIsConverterOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel hover:glass-button text-xs font-medium text-slate-200 shadow-md transition-all hover:scale-105"
            title="Image to ASCII Studio"
          >
            <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">ASCII Studio</span>
          </button>

          {/* Settings Drawer */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full glass-panel hover:glass-button text-slate-300 hover:text-white shadow-md transition-all hover:scale-105"
            title="Settings & Customization"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 3. Center Dashboard Interface */}
      <main className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4 pointer-events-none">
        <div ref={focusRef} className="pointer-events-auto w-full max-w-xl flex flex-col items-center">
          {/* Ambient Typography Clock */}
          <div className="mb-4">
            <AmbientClock />
          </div>

          {/* Conversational Greeting */}
          <ConversationalGreeting />

          {/* Omnipresent Central Search Bar */}
          <CentralSearchBar />

          {/* Shortcuts Grid */}
          <ShortcutsBar />
        </div>
      </main>

      {/* 4. World switcher + Keep this forever */}
      <WorldBar />

      {/* 5. Modals & Drawers */}
      <EnvironmentGallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
      />

      <ImageConverterModal
        isOpen={isConverterOpen}
        onClose={() => setIsConverterOpen(false)}
      />

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
