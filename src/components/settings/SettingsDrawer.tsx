import React from 'react';
import { X, Sliders, Palette, Monitor, Search, Cloud, User, Eye } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { CharacterStyle, ColorTheme, PerformanceTier } from '../../types/engine';
import { useEscape } from '../common/useEscape';
import { SearchEngineId } from '../../types/settings';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose }) => {
  const {
    characterStyle,
    colorTheme,
    fontSize,
    charDensity,
    animationSpeed,
    reducedMotion,
    performanceTier,
    dimBackground,
    userName,
    searchEngine,
    customSearchUrl,
    weatherCity,
    weatherUnits,
    useGeolocation,
    showClock,
    showWeather,
    showGreeting,
    showShortcuts,
    showTopWorldCapsule,
    dailyEnvironmentRotation,
    keepWorld,
    calmCenter,
    interactionIntensity,
    updateSettings,
  } = useSettingsStore();
  useEscape(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Preferences"
    >
      <div className="glass-panel w-full max-w-md h-full p-6 overflow-y-auto border-l border-white/10 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/5 text-teal-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Preferences</h2>
              <p className="text-xs text-slate-400">Customize your Pixora experience</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6 flex-1 text-xs">
          {/* 1. Visual Rendering & Themes */}
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">
              <Palette className="w-3.5 h-3.5 text-teal-400" />
              <span>Visual Rendering</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Character Style</label>
                <select
                  value={characterStyle}
                  onChange={(e) => updateSettings({ characterStyle: e.target.value as CharacterStyle })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-200 outline-none"
                >
                  <option value="auto">Auto (each world's own style)</option>
                  <option value="tiles">Tiles (clean pixel blocks)</option>
                  <option value="ascii-standard">Classic ASCII ( .:-=+*#%@)</option>
                  <option value="ascii-dense">Dense ASCII (70 glyphs)</option>
                  <option value="braille">Braille dots (fine detail ⣿)</option>
                  <option value="blocks">Blocks & shades (░▒▓█)</option>
                  <option value="geometric">Geometric (·∘○◇◆●■)</option>
                  <option value="dots">Dots (·∙•●)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Applies to water, light, aurora and trails. Creatures keep their own shapes.</p>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Color Palette</label>
                <select
                  value={colorTheme}
                  onChange={(e) => updateSettings({ colorTheme: e.target.value as ColorTheme })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-200 outline-none"
                >
                  <option value="true-color">True Color (Atmospheric RGB)</option>
                  <option value="phosphor-amber">Phosphor Amber (Retro Terminal)</option>
                  <option value="matrix-green">Matrix Emerald</option>
                  <option value="cyberpunk-neon">Cyberpunk Neon</option>
                  <option value="ice-blue">Ice Blue</option>
                  <option value="claude-warm">Claude Warm Terracotta</option>
                  <option value="monochrome-white">Monochrome White</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Calm zone behind clock & search</span>
                  <span className="font-mono">{Math.round(calmCenter * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.05"
                  value={calmCenter}
                  onChange={(e) => updateSettings({ calmCenter: Number(e.target.value) })}
                  className="w-full accent-teal-400 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300">Dim Background for Contrast</span>
                <input
                  type="checkbox"
                  checked={dimBackground}
                  onChange={(e) => updateSettings({ dimBackground: e.target.checked })}
                  className="accent-teal-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 2. Simulation & Performance */}
          <div className="pt-4 border-t border-white/5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">
              <Monitor className="w-3.5 h-3.5 text-sky-400" />
              <span>Simulation & Performance</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Hardware Performance Tier</label>
                <select
                  value={performanceTier}
                  onChange={(e) => updateSettings({ performanceTier: e.target.value as PerformanceTier })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-200 outline-none"
                >
                  <option value="auto">Auto (adapts to this device)</option>
                  <option value="low">Battery saver (30 fps, fewer cells)</option>
                  <option value="balanced">Balanced (60 fps)</option>
                  <option value="high">High (more creatures and particles)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Auto starts at 60 fps and steps down by itself if this machine struggles.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Font Size</span>
                  <span className="font-mono">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="20"
                  value={fontSize}
                  onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                  className="w-full accent-teal-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Character Density</span>
                  <span className="font-mono">{charDensity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.1"
                  value={charDensity}
                  onChange={(e) => updateSettings({ charDensity: Number(e.target.value) })}
                  className="w-full accent-teal-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Animation Speed</span>
                  <span className="font-mono">{animationSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="2.0"
                  step="0.1"
                  value={animationSpeed}
                  onChange={(e) => updateSettings({ animationSpeed: Number(e.target.value) })}
                  className="w-full accent-teal-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Interaction Strength</span>
                  <span className="font-mono">{interactionIntensity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={interactionIntensity}
                  onChange={(e) => updateSettings({ interactionIntensity: Number(e.target.value) })}
                  className="w-full accent-teal-400 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300">Reduced Motion (still frame)</span>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                  className="accent-teal-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 3. Search Engine */}
          <div className="pt-4 border-t border-white/5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Search Configuration</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Default Search Engine</label>
                <select
                  value={searchEngine}
                  onChange={(e) => updateSettings({ searchEngine: e.target.value as SearchEngineId })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-200 outline-none"
                >
                  <option value="google">Google</option>
                  <option value="duckduckgo">DuckDuckGo</option>
                  <option value="bing">Bing</option>
                  <option value="brave">Brave Search</option>
                  <option value="ecosia">Ecosia</option>
                  <option value="custom">Custom URL</option>
                </select>
              </div>

              {searchEngine === 'custom' && (
                <div>
                  <label className="block text-slate-400 mb-1">Custom Search URL (%s for query)</label>
                  <input
                    type="text"
                    value={customSearchUrl}
                    onChange={(e) => updateSettings({ customSearchUrl: e.target.value })}
                    placeholder="https://kagi.com/search?q=%s"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-200 outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 4. Weather & Location */}
          <div className="pt-4 border-t border-white/5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">
              <Cloud className="w-3.5 h-3.5 text-teal-400" />
              <span>Weather & Location</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">City Name</label>
                <input
                  type="text"
                  value={weatherCity}
                  onChange={(e) => updateSettings({ weatherCity: e.target.value })}
                  placeholder="Empty = city from your time zone"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-200 outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300">Temperature Unit</span>
                <select
                  value={weatherUnits}
                  onChange={(e) => updateSettings({ weatherUnits: e.target.value as 'celsius' | 'fahrenheit' })}
                  className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1 text-slate-200 outline-none"
                >
                  <option value="celsius">Celsius (°C)</option>
                  <option value="fahrenheit">Fahrenheit (°F)</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300">Use Browser Geolocation</span>
                <input
                  type="checkbox"
                  checked={useGeolocation}
                  onChange={(e) => updateSettings({ useGeolocation: e.target.checked })}
                  className="accent-teal-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 5. Personalization & Greeting */}
          <div className="pt-4 border-t border-white/5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">
              <User className="w-3.5 h-3.5 text-pink-400" />
              <span>Personalization</span>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Your Name (for conversational greetings)</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => updateSettings({ userName: e.target.value })}
                placeholder="e.g. Alex"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-slate-200 outline-none"
              />
            </div>
          </div>

          {/* 6. Visibility Toggles */}
          <div className="pt-4 border-t border-white/5 pb-6">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              <span>Visible Widgets</span>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                <span>Clock & Date</span>
                <input
                  type="checkbox"
                  checked={showClock}
                  onChange={(e) => updateSettings({ showClock: e.target.checked })}
                  className="accent-teal-400"
                />
              </label>
              <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                <span>Weather</span>
                <input
                  type="checkbox"
                  checked={showWeather}
                  onChange={(e) => updateSettings({ showWeather: e.target.checked })}
                  className="accent-teal-400"
                />
              </label>
              <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                <span>Conversational Greeting</span>
                <input
                  type="checkbox"
                  checked={showGreeting}
                  onChange={(e) => updateSettings({ showGreeting: e.target.checked })}
                  className="accent-teal-400"
                />
              </label>
              <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                <span>Shortcuts Bar</span>
                <input
                  type="checkbox"
                  checked={showShortcuts}
                  onChange={(e) => updateSettings({ showShortcuts: e.target.checked })}
                  className="accent-teal-400"
                />
              </label>

              <label className="flex items-center justify-between text-slate-300 cursor-pointer pt-3 border-t border-white/5">
                <div>
                  <div className="font-medium text-slate-200">Top Worlds Capsule Switcher</div>
                  <div className="text-[10px] text-slate-400">Floating quick-switch pill at top (off by default)</div>
                </div>
                <input
                  type="checkbox"
                  checked={showTopWorldCapsule}
                  onChange={(e) => updateSettings({ showTopWorldCapsule: e.target.checked })}
                  className="accent-teal-400"
                />
              </label>

              <label className="flex items-center justify-between text-slate-300 cursor-pointer pt-3 border-t border-white/5">
                <div>
                  <div className="font-medium text-slate-200">New world every day</div>
                  <div className="text-[10px] text-slate-400">Switches at your local midnight</div>
                </div>
                <input
                  type="checkbox"
                  checked={dailyEnvironmentRotation}
                  onChange={(e) => updateSettings({ dailyEnvironmentRotation: e.target.checked })}
                  className="accent-teal-400"
                />
              </label>

              <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                <div>
                  <div className="font-medium text-slate-200">Keep this world forever</div>
                  <div className="text-[10px] text-slate-400">Same as the switch at the bottom right</div>
                </div>
                <input
                  type="checkbox"
                  checked={keepWorld}
                  onChange={(e) => updateSettings({ keepWorld: e.target.checked })}
                  className="accent-teal-400"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
