import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sliders,
  Settings as SettingsIcon,
  Upload,
  Trash2,
  RefreshCw,
  Pin,
  Check,
  Plus,
  Layers,
  Video,
  Image as ImageIcon,
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { CATALOG } from '../../data/catalog';
import { CustomSlotId } from '../../types/environment';
import { ImageStore } from '../../services/imageStore';
import { SEARCH_ENGINES } from '../../services/searchService';
import { SearchEngineId, CustomRenderMode, CustomColorMode, CustomPointerEffect } from '../../types/settings';
import { SHARED_CONTROLS } from '../../engine/ascii-animals/flock';
import { ANIMALS, AnimalKey } from '../../engine/ascii-animals/animals';

type DrawerTab = 'scenes' | 'tweaks' | 'settings';

interface EdgeHoverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EdgeHoverDrawer: React.FC<EdgeHoverDrawerProps> = ({ isOpen, onClose }) => {
  const [isPinned, setIsPinned] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>('tweaks');
  const [hasCustomImages, setHasCustomImages] = useState<Record<CustomSlotId, boolean>>({
    'custom-1': false,
    'custom-2': false,
    'custom-3': false,
  });
  const [mediaTypes, setMediaTypes] = useState<Record<CustomSlotId, 'video' | 'image' | 'none'>>({
    'custom-1': 'none',
    'custom-2': 'none',
    'custom-3': 'none',
  });

  const drawerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetSlot, setUploadTargetSlot] = useState<CustomSlotId>('custom-1');

  const {
    activeScene,
    setActiveScene,
    customConfigs,
    setCustomConfig,
    resetCustomConfig,
    animalTweaks,
    setAnimalTweak,
    resetAnimalTweaks,
    resetAllSettings,
    userName,
    setUserName,
    searchEngine,
    setSearchEngine,
    weatherCity,
    setWeatherCity,
    weatherUnits,
    setWeatherUnits,
    useGeolocation,
    setUseGeolocation,
    showClock,
    setShowClock,
    showGreeting,
    setShowGreeting,
    showWeather,
    setShowWeather,
    showShortcuts,
    setShowShortcuts,
    dimBackground,
    setDimBackground,
    fontSize,
    setFontSize,
    reducedMotion,
    setReducedMotion,
    shortcuts,
    addShortcut,
    removeShortcut,
  } = useSettingsStore();

  // Check which custom image slots have media in IndexedDB
  const checkCustomImages = async () => {
    const [s1, s2, s3] = await Promise.all([
      ImageStore.hasImage('custom-1'),
      ImageStore.hasImage('custom-2'),
      ImageStore.hasImage('custom-3'),
    ]);
    const [m1, m2, m3] = await Promise.all([
      ImageStore.getMediaType('custom-1'),
      ImageStore.getMediaType('custom-2'),
      ImageStore.getMediaType('custom-3'),
    ]);
    setHasCustomImages({ 'custom-1': s1, 'custom-2': s2, 'custom-3': s3 });
    setMediaTypes({ 'custom-1': m1, 'custom-2': m2, 'custom-3': m3 });
  };

  useEffect(() => {
    checkCustomImages();
    const unsub = ImageStore.subscribe(() => checkCustomImages());
    return () => unsub();
  }, []);

  // Keyboard shortcut: Escape closes drawer
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
      if (e.key === 'Escape' && isOpen && !isPinned) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isPinned, onClose]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await ImageStore.saveImage(uploadTargetSlot, file);
    setActiveScene(uploadTargetSlot);
    checkCustomImages();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerUpload = (slot: CustomSlotId) => {
    setUploadTargetSlot(slot);
    fileInputRef.current?.click();
  };

  const handleDeleteImage = async (slot: CustomSlotId, e: React.MouseEvent) => {
    e.stopPropagation();
    await ImageStore.deleteImage(slot);
    checkCustomImages();
  };

  const isCustomActive = activeScene.startsWith('custom-');
  const activeCustomSlot = isCustomActive ? (activeScene as CustomSlotId) : 'custom-1';
  const currentCustomConfig = customConfigs[activeCustomSlot];

  // Authentic Animal controls from DesignerStephen1/ascii-animals
  const isAnimalActive = !isCustomActive;
  const activeAnimalKey = activeScene as AnimalKey;
  const currentAnimalDef = isAnimalActive && ANIMALS[activeAnimalKey] ? ANIMALS[activeAnimalKey] : null;
  const animalHiddenKeys = new Set<string>((currentAnimalDef?.hide as string[]) ?? []);
  const animalDefaults = (currentAnimalDef?.defaults ?? {}) as Record<string, any>;

  const movementKnobs = SHARED_CONTROLS.movement.filter((k) => !animalHiddenKeys.has(k.key));
  const speciesGroups = currentAnimalDef?.controls ?? [];
  const lookKnobs = SHARED_CONTROLS.look.filter((k) => !animalHiddenKeys.has(k.key));

  // New shortcut form state
  const [newShortcutTitle, setNewShortcutTitle] = useState('');
  const [newShortcutUrl, setNewShortcutUrl] = useState('');

  return (
    <>
      {/* Hidden File Input for Image & Video Uploading */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/ogg"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* ── Background Backdrop (When open and not pinned) ── */}
      {isOpen && !isPinned && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* ── Main Slide-Over Drawer ── */}
      <aside
        ref={drawerRef}
        className={`fixed top-0 right-0 bottom-0 w-[410px] max-w-[92vw] z-50 flex flex-col bg-[#0c0d12]/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl text-slate-200 transition-transform duration-300 ease-out select-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
            <span className="text-xs font-semibold tracking-widest text-slate-200 uppercase font-mono">
              Pixora
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsPinned(!isPinned)}
              className={`p-1.5 rounded-lg transition-colors ${
                isPinned ? 'text-teal-400 bg-teal-400/15' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title={isPinned ? 'Unpin drawer' : 'Pin drawer open'}
            >
              <Pin className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="Close drawer (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/10 bg-black/20 p-1.5 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('tweaks')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'tweaks'
                ? 'bg-teal-500/20 text-teal-300 shadow-sm border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isCustomActive ? 'Media Glow' : 'Tweaks'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scenes')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'scenes'
                ? 'bg-teal-500/20 text-teal-300 shadow-sm border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Scenes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'settings'
                ? 'bg-teal-500/20 text-teal-300 shadow-sm border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-sm custom-scrollbar">
          {/* ══════════════ TAB: TWEAKS & GLOW ══════════════ */}
          {activeTab === 'tweaks' && (
            <div className="space-y-6">
              {isCustomActive ? (
                /* Case 1: Custom Media Controls */
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-slate-200 text-xs uppercase tracking-wider font-mono">
                          {currentCustomConfig.name?.trim() || activeCustomSlot.replace('-', ' ').toUpperCase()}
                        </h3>
                        {mediaTypes[activeCustomSlot] === 'video' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono flex items-center gap-1 border border-emerald-500/30">
                            <Video className="w-3 h-3" /> VIDEO
                          </span>
                        )}
                        {mediaTypes[activeCustomSlot] === 'image' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/20 text-sky-300 font-mono flex items-center gap-1 border border-sky-500/30">
                            <ImageIcon className="w-3 h-3" /> IMAGE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Phosphor glow shader with dynamic fluid gas flow
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => resetCustomConfig(activeCustomSlot)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors border border-white/5 cursor-pointer"
                        title="Reset tweaks to default"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reset</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerUpload(activeCustomSlot)}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-sky-500/30 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload</span>
                      </button>
                    </div>
                  </div>

                  {/* Slot Custom Name */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Slot Custom Name</label>
                    <input
                      type="text"
                      placeholder={`Name this slot (e.g. Cat in Leaves, Matrix Video...)`}
                      value={currentCustomConfig.name || ''}
                      onChange={(e) => setCustomConfig(activeCustomSlot, { name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>

                  {/* Render Mode */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-2">Render Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['tiles', 'characters', 'braille', 'blocks'] as CustomRenderMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setCustomConfig(activeCustomSlot, { renderMode: mode })}
                          className={`py-2 px-3 rounded-lg text-xs font-medium capitalize transition-all border cursor-pointer ${
                            currentCustomConfig.renderMode === mode
                              ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-sm'
                              : 'bg-white/[0.03] border-white/5 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color Theme */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-2">Color Theme</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['full', 'cyberpunk', 'matrix', 'amber', 'mono'] as CustomColorMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setCustomConfig(activeCustomSlot, { colorMode: mode })}
                          className={`py-2 px-3 rounded-lg text-xs font-medium capitalize transition-all border cursor-pointer ${
                            currentCustomConfig.colorMode === mode
                              ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-sm'
                              : 'bg-white/[0.03] border-white/5 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {mode === 'full' ? 'True Color' : mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Glowing Radiance Slider */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-300 font-medium">Backlight Glow</span>
                      <span className="text-sky-400 font-mono">
                        {Math.round(currentCustomConfig.glow * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={currentCustomConfig.glow}
                      onChange={(e) =>
                        setCustomConfig(activeCustomSlot, { glow: parseFloat(e.target.value) })
                      }
                      className="w-full accent-sky-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Phosphor luminance and character backlight glow
                    </p>
                  </div>

                  {/* Brightness */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-300">Brightness</span>
                      <span className="text-slate-400 font-mono">
                        {(currentCustomConfig.brightness > 0 ? '+' : '') + Math.round(currentCustomConfig.brightness * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-0.5"
                      max="0.5"
                      step="0.05"
                      value={currentCustomConfig.brightness}
                      onChange={(e) =>
                        setCustomConfig(activeCustomSlot, { brightness: parseFloat(e.target.value) })
                      }
                      className="w-full accent-teal-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Contrast */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-300">Contrast</span>
                      <span className="text-slate-400 font-mono">
                        {Math.round(currentCustomConfig.contrast * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={currentCustomConfig.contrast}
                      onChange={(e) =>
                        setCustomConfig(activeCustomSlot, { contrast: parseFloat(e.target.value) })
                      }
                      className="w-full accent-teal-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Edge outlines (Characters mode) */}
                  {currentCustomConfig.renderMode === 'characters' && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-300">Edge Outlines</span>
                        <span className="text-slate-400 font-mono">
                          {Math.round((currentCustomConfig.edges ?? 0) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={currentCustomConfig.edges ?? 0}
                        onChange={(e) =>
                          setCustomConfig(activeCustomSlot, { edges: parseFloat(e.target.value) })
                        }
                        className="w-full accent-teal-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                        aria-label="Edge outlines"
                      />
                    </div>
                  )}

                  {/* Pointer Dynamics: Gas Flow, Ripple, Still */}
                  <div className="pt-3 border-t border-white/10 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-2">Pointer Interaction Mode</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { id: 'gas', label: 'Gas Flow' },
                          { id: 'ripple', label: 'Ripple' },
                          { id: 'lantern', label: 'Lantern' },
                          { id: 'none', label: 'Still' },
                        ].map(({ id, label }) => {
                          const isSelected =
                            currentCustomConfig.effect === id ||
                            (id === 'gas' && currentCustomConfig.effect === 'drift');
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() =>
                                setCustomConfig(activeCustomSlot, {
                                  effect: id as CustomPointerEffect,
                                })
                              }
                              className={`py-2 px-3 rounded-lg text-xs font-medium capitalize transition-all border cursor-pointer ${
                                isSelected
                                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                                  : 'bg-white/[0.03] border-white/5 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Flow Dynamics Controls (Speed, Spread, Decay) */}
                    {currentCustomConfig.effect !== 'none' && (
                      <div className="space-y-3.5 pt-1">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-300">Flow Velocity / Speed</span>
                            <span className="text-sky-400 font-mono">{(currentCustomConfig.flowSpeed ?? 1.0).toFixed(1)}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.2"
                            max="3.0"
                            step="0.1"
                            value={currentCustomConfig.flowSpeed ?? 1.0}
                            onChange={(e) =>
                              setCustomConfig(activeCustomSlot, { flowSpeed: parseFloat(e.target.value) })
                            }
                            className="w-full accent-sky-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-300">Gas Expansion / Plume Spread</span>
                            <span className="text-sky-400 font-mono">{(currentCustomConfig.flowSpread ?? 1.0).toFixed(1)}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.2"
                            max="3.0"
                            step="0.1"
                            value={currentCustomConfig.flowSpread ?? 1.0}
                            onChange={(e) =>
                              setCustomConfig(activeCustomSlot, { flowSpread: parseFloat(e.target.value) })
                            }
                            className="w-full accent-sky-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-300">Flow Lingering / Dissipation</span>
                            <span className="text-sky-400 font-mono">{(currentCustomConfig.flowDecay ?? 1.0).toFixed(1)}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.2"
                            max="3.0"
                            step="0.1"
                            value={currentCustomConfig.flowDecay ?? 1.0}
                            onChange={(e) =>
                              setCustomConfig(activeCustomSlot, { flowDecay: parseFloat(e.target.value) })
                            }
                            className="w-full accent-sky-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Lower lingers longer; Higher fades rapidly</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Case 2: Authentic Animal Knobs from DesignerStephen1/ascii-animals */
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div>
                      <h3 className="font-medium text-slate-200 text-xs uppercase tracking-wider font-mono">
                        {currentAnimalDef?.label || activeScene} Simulation
                      </h3>
                      <p className="text-[11px] text-slate-400">Authentic flocking and creature knobs</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => resetAnimalTweaks(activeScene)}
                      className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors border border-white/5 cursor-pointer"
                      title="Reset simulation tweaks to default"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {/* Section 1: Movement Controls */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider font-mono">
                      Movement (Boids & Course)
                    </h4>
                    <div className="space-y-3.5">
                      {movementKnobs.map((spec) => {
                        if ('toggle' in spec) {
                          const val = animalTweaks[activeScene]?.[spec.key] ?? animalDefaults[spec.key] ?? false;
                          return (
                            <div key={spec.key} className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                              <div>
                                <span className="text-slate-300 font-medium">{spec.label}</span>
                                {spec.hint && <p className="text-[10px] text-slate-500 mt-0.5">{spec.hint}</p>}
                              </div>
                              <input
                                type="checkbox"
                                checked={Boolean(val)}
                                onChange={(e) => setAnimalTweak(activeScene, spec.key, e.target.checked)}
                                className="accent-teal-400 w-4 h-4 rounded cursor-pointer"
                              />
                            </div>
                          );
                        }

                        const isDisabled = spec.disabledWhen ? Boolean(animalTweaks[activeScene]?.[spec.disabledWhen] ?? animalDefaults[spec.disabledWhen]) : false;
                        const rawVal = animalTweaks[activeScene]?.[spec.key] ?? animalDefaults[spec.key] ?? spec.min;
                        const val = Number(rawVal);

                        return (
                          <div key={spec.key} className={`space-y-1 ${isDisabled ? 'opacity-35 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-300 font-medium">{spec.label}</span>
                              <span className="text-teal-400 font-mono">
                                {val.toFixed(spec.step < 0.1 ? 2 : spec.step < 1 ? 1 : 0)}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={spec.min}
                              max={spec.max}
                              step={spec.step}
                              value={val}
                              disabled={isDisabled}
                              onChange={(e) => setAnimalTweak(activeScene, spec.key, parseFloat(e.target.value))}
                              className="w-full accent-teal-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                            />
                            {spec.hint && <p className="text-[10px] text-slate-500">{spec.hint}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: Species Specific Controls */}
                  {speciesGroups.map(([groupTitle, specs]) => (
                    <div key={groupTitle} className="space-y-4 pt-3 border-t border-white/10">
                      <h4 className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider font-mono">
                        {groupTitle}
                      </h4>
                      <div className="space-y-3.5">
                        {specs.map((spec) => {
                          if ('toggle' in spec) {
                            const val = animalTweaks[activeScene]?.[spec.key] ?? animalDefaults[spec.key] ?? false;
                            return (
                              <div key={spec.key} className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                                <div>
                                  <span className="text-slate-300 font-medium">{spec.label}</span>
                                  {spec.hint && <p className="text-[10px] text-slate-500 mt-0.5">{spec.hint}</p>}
                                </div>
                                <input
                                  type="checkbox"
                                  checked={Boolean(val)}
                                  onChange={(e) => setAnimalTweak(activeScene, spec.key, e.target.checked)}
                                  className="accent-teal-400 w-4 h-4 rounded cursor-pointer"
                                />
                              </div>
                            );
                          }

                          const isDisabled = spec.disabledWhen ? Boolean(animalTweaks[activeScene]?.[spec.disabledWhen] ?? animalDefaults[spec.disabledWhen]) : false;
                          const rawVal = animalTweaks[activeScene]?.[spec.key] ?? animalDefaults[spec.key] ?? spec.min;
                          const val = Number(rawVal);

                          return (
                            <div key={spec.key} className={`space-y-1 ${isDisabled ? 'opacity-35 pointer-events-none' : ''}`}>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 font-medium">{spec.label}</span>
                                <span className="text-teal-400 font-mono">
                                  {val.toFixed(spec.step < 0.1 ? 2 : spec.step < 1 ? 1 : 0)}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={spec.min}
                                max={spec.max}
                                step={spec.step}
                                value={val}
                                disabled={isDisabled}
                                onChange={(e) => setAnimalTweak(activeScene, spec.key, parseFloat(e.target.value))}
                                className="w-full accent-teal-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                              />
                              {spec.hint && <p className="text-[10px] text-slate-500">{spec.hint}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Section 3: Look, Grid & Shimmer */}
                  <div className="space-y-4 pt-3 border-t border-white/10">
                    <h4 className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider font-mono">
                      Look, Grid & Shimmer
                    </h4>
                    <div className="space-y-3.5">
                      {lookKnobs.map((spec) => {
                        if ('toggle' in spec) {
                          const val = animalTweaks[activeScene]?.[spec.key] ?? animalDefaults[spec.key] ?? false;
                          return (
                            <div key={spec.key} className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                              <div>
                                <span className="text-slate-300 font-medium">{spec.label}</span>
                                {spec.hint && <p className="text-[10px] text-slate-500 mt-0.5">{spec.hint}</p>}
                              </div>
                              <input
                                type="checkbox"
                                checked={Boolean(val)}
                                onChange={(e) => setAnimalTweak(activeScene, spec.key, e.target.checked)}
                                className="accent-teal-400 w-4 h-4 rounded cursor-pointer"
                              />
                            </div>
                          );
                        }

                        const isDisabled = spec.disabledWhen ? Boolean(animalTweaks[activeScene]?.[spec.disabledWhen] ?? animalDefaults[spec.disabledWhen]) : false;
                        const rawVal = animalTweaks[activeScene]?.[spec.key] ?? animalDefaults[spec.key] ?? spec.min;
                        const val = Number(rawVal);

                        return (
                          <div key={spec.key} className={`space-y-1 ${isDisabled ? 'opacity-35 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-300 font-medium">{spec.label}</span>
                              <span className="text-teal-400 font-mono">
                                {val.toFixed(spec.step < 0.1 ? 2 : spec.step < 1 ? 1 : 0)}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={spec.min}
                              max={spec.max}
                              step={spec.step}
                              value={val}
                              disabled={isDisabled}
                              onChange={(e) => setAnimalTweak(activeScene, spec.key, parseFloat(e.target.value))}
                              className="w-full accent-teal-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                            />
                            {spec.hint && <p className="text-[10px] text-slate-500">{spec.hint}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════ TAB: SCENES ══════════════ */}
          {activeTab === 'scenes' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    Wildlife Species
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {CATALOG.filter((c) => c.kind === 'animal').map((scene) => {
                    const isSelected = activeScene === scene.id;
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => setActiveScene(scene.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-500/15 border-teal-400/50 shadow-md ring-1 ring-teal-400/30'
                            : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: scene.accent }}
                          />
                          <div>
                            <div className="font-medium text-slate-200 text-xs flex items-center gap-2">
                              {scene.name}
                              {isSelected && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-teal-400/20 text-teal-300 font-mono">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {scene.tagline}
                            </div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-teal-300 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    Custom Art & Videos
                  </h3>
                </div>

                <div className="space-y-2.5">
                  {(['custom-1', 'custom-2', 'custom-3'] as CustomSlotId[]).map((slotId, index) => {
                    const isSelected = activeScene === slotId;
                    const hasImage = hasCustomImages[slotId];
                    const mediaType = mediaTypes[slotId];
                    const slotNum = index + 1;
                    const customName = customConfigs[slotId]?.name?.trim();
                    const displayName = customName || `Custom ${slotNum}`;

                    return (
                      <div
                        key={slotId}
                        onClick={() => setActiveScene(slotId)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all space-y-2.5 ${
                          isSelected
                            ? 'bg-sky-500/15 border-sky-400/50 shadow-md ring-1 ring-sky-400/30'
                            : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-mono font-bold text-xs shrink-0">
                              {slotNum}
                            </div>
                            <div>
                              <div className="font-medium text-slate-200 text-xs flex items-center gap-2">
                                <span>{displayName}</span>
                                {isSelected && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-400/20 text-sky-300 font-mono">
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                                {mediaType === 'video' ? (
                                  <span className="text-emerald-400 flex items-center gap-1">
                                    <Video className="w-3 h-3" /> Video looping in ASCII
                                  </span>
                                ) : hasImage ? (
                                  <span className="text-sky-300 flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3" /> Image with backlight glow
                                  </span>
                                ) : (
                                  'Empty • Ready for image or video'
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerUpload(slotId);
                              }}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                              title={hasImage ? 'Change Image / Video' : 'Upload Image / Video'}
                            >
                              <Upload className="w-3.5 h-3.5" />
                            </button>
                            {hasImage && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteImage(slotId, e)}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                                title="Delete media"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Quick Rename Input inside Card */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            placeholder={`Rename slot ${slotNum}...`}
                            value={customConfigs[slotId]?.name || ''}
                            onChange={(e) => setCustomConfig(slotId, { name: e.target.value })}
                            className="w-full px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-400"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ TAB: SETTINGS ══════════════ */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Greeting & Name */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                  Greeting & Profile
                </h3>
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">Your Name (for Greeting)</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Enter your name (e.g. Stephen)..."
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-400"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Show Greeting</span>
                  <input
                    type="checkbox"
                    checked={showGreeting}
                    onChange={(e) => setShowGreeting(e.target.checked)}
                    className="accent-teal-400 w-4 h-4 rounded"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Show Clock</span>
                  <input
                    type="checkbox"
                    checked={showClock}
                    onChange={(e) => setShowClock(e.target.checked)}
                    className="accent-teal-400 w-4 h-4 rounded"
                  />
                </div>
              </div>

              {/* Search Engine */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                  Search Engine
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => {
                    const engine = SEARCH_ENGINES[id];
                    const isSelected = searchEngine === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSearchEngine(id)}
                        className={`py-2 px-3 rounded-lg text-xs font-medium transition-all text-left border ${
                          isSelected
                            ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                            : 'bg-white/[0.03] border-white/5 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {engine.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weather Settings */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                  Weather (Open-Meteo)
                </h3>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Show Weather Widget</span>
                  <input
                    type="checkbox"
                    checked={showWeather}
                    onChange={(e) => setShowWeather(e.target.checked)}
                    className="accent-teal-400 w-4 h-4 rounded"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Use Device Geolocation</span>
                  <input
                    type="checkbox"
                    checked={useGeolocation}
                    onChange={(e) => setUseGeolocation(e.target.checked)}
                    className="accent-teal-400 w-4 h-4 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">Custom City / Location</label>
                  <input
                    type="text"
                    value={weatherCity}
                    onChange={(e) => setWeatherCity(e.target.value)}
                    placeholder="e.g. San Francisco, Tokyo, London..."
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-400"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Temperature Unit</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setWeatherUnits('celsius')}
                      className={`px-2.5 py-1 rounded text-xs ${
                        weatherUnits === 'celsius' ? 'bg-teal-400/20 text-teal-300' : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      °C
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeatherUnits('fahrenheit')}
                      className={`px-2.5 py-1 rounded text-xs ${
                        weatherUnits === 'fahrenheit' ? 'bg-teal-400/20 text-teal-300' : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      °F
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom Shortcuts Manager */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    Shortcuts
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Visible</span>
                    <input
                      type="checkbox"
                      checked={showShortcuts}
                      onChange={(e) => setShowShortcuts(e.target.checked)}
                      className="accent-teal-400 w-4 h-4 rounded"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {shortcuts.map((sc) => (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/5 text-xs"
                    >
                      <span className="text-slate-300 truncate max-w-[200px]">{sc.title}</span>
                      <button
                        type="button"
                        onClick={() => removeShortcut(sc.id)}
                        className="text-slate-500 hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new shortcut */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Title"
                    value={newShortcutTitle}
                    onChange={(e) => setNewShortcutTitle(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200"
                  />
                  <input
                    type="text"
                    placeholder="URL (e.g. google.com)"
                    value={newShortcutUrl}
                    onChange={(e) => setNewShortcutUrl(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newShortcutUrl.trim()) return;
                      let finalUrl = newShortcutUrl.trim();
                      if (!/^https?:\/\//i.test(finalUrl)) finalUrl = `https://${finalUrl}`;
                      const title = newShortcutTitle.trim() || new URL(finalUrl).hostname;
                      addShortcut({ title, url: finalUrl });
                      setNewShortcutTitle('');
                      setNewShortcutUrl('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Display & Motion */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                  Display & Performance
                </h3>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Dim Art Behind Content</span>
                  <input
                    type="checkbox"
                    checked={dimBackground}
                    onChange={(e) => setDimBackground(e.target.checked)}
                    className="accent-teal-400 w-4 h-4 rounded"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Reduced Motion</span>
                  <input
                    type="checkbox"
                    checked={reducedMotion}
                    onChange={(e) => setReducedMotion(e.target.checked)}
                    className="accent-teal-400 w-4 h-4 rounded"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-300">Font / Cell Size</span>
                    <span className="text-teal-400 font-mono">{fontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="20"
                    step="1"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                    className="w-full accent-teal-400 bg-white/10 h-1.5 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Reset to Factory Defaults */}
              <div className="pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Reset all settings, scenes, and media tweaks to factory defaults?')) {
                      resetAllSettings();
                    }
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset All to Default</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
