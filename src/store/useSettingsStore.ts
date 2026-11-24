import { create } from 'zustand';
import { UserSettings, ShortcutItem, SearchEngineId, CustomImageConfig, DEFAULT_CUSTOM_CONFIG, PowerMode, Appearance } from '../types/settings';
import { CharacterStyle, ColorTheme } from '../types/engine';
import { CustomSlotId, SceneId } from '../types/environment';
import { StorageService } from '../services/storageService';
import { CATALOG } from '../data/catalog';

const SETTINGS_KEY = 'pixora_user_settings_v2';
const LEGACY_SETTINGS_KEY = 'pixora_user_settings_v1';
const SCENE_IDS = new Set<string>(CATALOG.map((s) => s.id));

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: '1', title: 'GitHub', url: 'https://github.com' },
  { id: '2', title: 'YouTube', url: 'https://youtube.com' },
  { id: '3', title: 'Reddit', url: 'https://reddit.com' },
  { id: '4', title: 'X', url: 'https://x.com' },
  { id: '5', title: 'Wikipedia', url: 'https://wikipedia.org' },
];

export const DEFAULT_SETTINGS: UserSettings = {
  activeScene: 'butterflies',
  customConfigs: {
    'custom-1': { ...DEFAULT_CUSTOM_CONFIG },
    'custom-2': { ...DEFAULT_CUSTOM_CONFIG },
    'custom-3': { ...DEFAULT_CUSTOM_CONFIG },
  },
  animalTweaks: {},

  characterStyle: 'auto',
  colorTheme: 'true-color',
  fontSize: 14,
  charDensity: 1.0,
  animationSpeed: 1.0,
  interactionIntensity: 1.0,
  performanceTier: 'auto',
  calmCenter: 0.6,
  reducedMotion: false,
  powerMode: 'auto',
  appearance: 'system',

  userName: '',
  searchEngine: 'google',
  customSearchUrl: '',
  shortcuts: DEFAULT_SHORTCUTS,

  weatherCity: 'New Delhi',
  weatherUnits: 'celsius',
  useGeolocation: false,

  dimBackground: false,
  showClock: true,
  showWeather: true,
  showGreeting: true,
  showShortcuts: true,
};

/**
 * Keeps only known settings whose type matches the default, and drops a scene id
 * that no longer exists (e.g. a v2.0 world), so the tab falls back to an animal.
 */
export function sanitize(raw: Record<string, unknown>): Partial<UserSettings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[]) {
    const value = raw[key];
    const fallback = DEFAULT_SETTINGS[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(fallback) ? !Array.isArray(value) : typeof value !== typeof fallback) continue;
    out[key] = value;
  }
  if (!SCENE_IDS.has(out.activeScene as string)) delete out.activeScene;
  if (!['auto', 'on', 'off'].includes(out.powerMode as string)) delete out.powerMode;
  if (!['system', 'dark', 'light'].includes(out.appearance as string)) delete out.appearance;
  return out as Partial<UserSettings>;
}

/** v2.0 settings → v2.1+: animal tweaks start fresh (different knob names); the last animal becomes the scene. */
export function fromLegacy(legacy: Record<string, unknown>): Record<string, unknown> {
  return { ...legacy, animalTweaks: undefined, activeScene: legacy.activeAnimal };
}

interface SettingsStore extends UserSettings {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<UserSettings>) => void;

  // Scene Switching
  setActiveScene: (id: SceneId) => void;

  // Custom Image Configs (for the 3 slots)
  setCustomConfig: (slot: CustomSlotId, partial: Partial<CustomImageConfig>) => void;
  resetCustomConfig: (slot: CustomSlotId) => void;

  // Animal Tweaks
  setAnimalTweak: (animal: string, key: string, value: number | boolean) => void;
  resetAnimalTweaks: (animal: string) => void;
  resetAllSettings: () => void;

  // Productivity
  setUserName: (name: string) => void;
  setSearchEngine: (engine: SearchEngineId) => void;
  setCustomSearchUrl: (url: string) => void;
  addShortcut: (item: Omit<ShortcutItem, 'id'>) => void;
  removeShortcut: (id: string) => void;

  // Weather
  setWeatherCity: (city: string) => void;
  setWeatherUnits: (units: 'celsius' | 'fahrenheit') => void;
  setUseGeolocation: (use: boolean) => void;

  // Visuals & Toggles
  setShowClock: (show: boolean) => void;
  setShowWeather: (show: boolean) => void;
  setShowGreeting: (show: boolean) => void;
  setShowShortcuts: (show: boolean) => void;
  setDimBackground: (dim: boolean) => void;
  setColorTheme: (theme: ColorTheme) => void;
  setCharacterStyle: (style: CharacterStyle) => void;
  setFontSize: (size: number) => void;
  setReducedMotion: (reduced: boolean) => void;
  setPowerMode: (mode: PowerMode) => void;
  setAppearance: (appearance: Appearance) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    try {
      let raw = await StorageService.get<Record<string, unknown> | null>(SETTINGS_KEY, null);
      if (!raw) {
        // Carry over shortcuts, name, city and preferences from v2.0 and earlier.
        const legacy = await StorageService.get<Record<string, unknown> | null>(LEGACY_SETTINGS_KEY, null);
        if (legacy) raw = fromLegacy(legacy);
      }
      const saved = raw ? sanitize(raw) : null;
      if (raw && saved) StorageService.set(SETTINGS_KEY, saved);
      if (saved) {
        let weatherCity = saved.weatherCity?.trim() || 'New Delhi';
        if (weatherCity.toLowerCase() === 'calcutta' || weatherCity.toLowerCase() === 'kolkata') {
          weatherCity = 'New Delhi';
        }
        set((state) => ({
          ...state,
          ...saved,
          weatherCity,
          customConfigs: {
            'custom-1': { ...DEFAULT_CUSTOM_CONFIG, ...(saved.customConfigs?.['custom-1'] || {}) },
            'custom-2': { ...DEFAULT_CUSTOM_CONFIG, ...(saved.customConfigs?.['custom-2'] || {}) },
            'custom-3': { ...DEFAULT_CUSTOM_CONFIG, ...(saved.customConfigs?.['custom-3'] || {}) },
          },
          isLoaded: true,
        }));
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  updateSettings: (partial) => {
    set((state) => {
      const next = { ...state, ...partial };
      // Persist to storage
      StorageService.set(SETTINGS_KEY, {
        activeScene: next.activeScene,
        customConfigs: next.customConfigs,
        animalTweaks: next.animalTweaks,
        characterStyle: next.characterStyle,
        colorTheme: next.colorTheme,
        fontSize: next.fontSize,
        charDensity: next.charDensity,
        animationSpeed: next.animationSpeed,
        interactionIntensity: next.interactionIntensity,
        performanceTier: next.performanceTier,
        calmCenter: next.calmCenter,
        reducedMotion: next.reducedMotion,
        powerMode: next.powerMode,
        appearance: next.appearance,
        userName: next.userName,
        searchEngine: next.searchEngine,
        customSearchUrl: next.customSearchUrl,
        shortcuts: next.shortcuts,
        weatherCity: next.weatherCity,
        weatherUnits: next.weatherUnits,
        useGeolocation: next.useGeolocation,
        dimBackground: next.dimBackground,
        showClock: next.showClock,
        showWeather: next.showWeather,
        showGreeting: next.showGreeting,
        showShortcuts: next.showShortcuts,
      });
      return next;
    });
  },

  setActiveScene: (id) => get().updateSettings({ activeScene: id }),

  setCustomConfig: (slot, partial) => {
    const current = get().customConfigs[slot] || DEFAULT_CUSTOM_CONFIG;
    const updated = {
      ...get().customConfigs,
      [slot]: { ...current, ...partial },
    };
    get().updateSettings({ customConfigs: updated });
  },

  resetCustomConfig: (slot) => {
    const current = get().customConfigs[slot] || DEFAULT_CUSTOM_CONFIG;
    const updated = {
      ...get().customConfigs,
      [slot]: { ...DEFAULT_CUSTOM_CONFIG, name: current.name },
    };
    get().updateSettings({ customConfigs: updated });
  },

  setAnimalTweak: (animal, key, value) => {
    const tweaks = { ...get().animalTweaks };
    tweaks[animal] = { ...(tweaks[animal] || {}), [key]: value };
    get().updateSettings({ animalTweaks: tweaks });
  },

  resetAnimalTweaks: (animal) => {
    const tweaks = { ...get().animalTweaks };
    delete tweaks[animal];
    get().updateSettings({ animalTweaks: tweaks });
  },

  resetAllSettings: () => {
    get().updateSettings({ ...DEFAULT_SETTINGS });
  },

  setUserName: (userName) => get().updateSettings({ userName }),
  setSearchEngine: (searchEngine) => get().updateSettings({ searchEngine }),
  setCustomSearchUrl: (customSearchUrl) => get().updateSettings({ customSearchUrl }),

  addShortcut: (item) => {
    const shortcuts = [...get().shortcuts, { ...item, id: Date.now().toString(), isCustom: true }];
    get().updateSettings({ shortcuts });
  },

  removeShortcut: (id) => {
    const shortcuts = get().shortcuts.filter((s) => s.id !== id);
    get().updateSettings({ shortcuts });
  },

  setWeatherCity: (weatherCity) => get().updateSettings({ weatherCity }),
  setWeatherUnits: (weatherUnits) => get().updateSettings({ weatherUnits }),
  setUseGeolocation: (useGeolocation) => get().updateSettings({ useGeolocation }),

  setShowClock: (showClock) => get().updateSettings({ showClock }),
  setShowWeather: (showWeather) => get().updateSettings({ showWeather }),
  setShowGreeting: (showGreeting) => get().updateSettings({ showGreeting }),
  setShowShortcuts: (showShortcuts) => get().updateSettings({ showShortcuts }),
  setDimBackground: (dimBackground) => get().updateSettings({ dimBackground }),
  setColorTheme: (colorTheme) => get().updateSettings({ colorTheme }),
  setCharacterStyle: (characterStyle) => get().updateSettings({ characterStyle }),
  setFontSize: (fontSize) => get().updateSettings({ fontSize }),
  setReducedMotion: (reducedMotion) => get().updateSettings({ reducedMotion }),
  setPowerMode: (powerMode) => get().updateSettings({ powerMode }),
  setAppearance: (appearance) => get().updateSettings({ appearance }),
}));
