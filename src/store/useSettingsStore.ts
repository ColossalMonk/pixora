import { create } from 'zustand';
import { UserSettings, ShortcutItem, SearchEngineId } from '../types/settings';
import { CharacterStyle, ColorTheme } from '../types/engine';
import { EnvironmentId } from '../types/environment';
import { StorageService } from '../services/storageService';

const SETTINGS_KEY = 'pixora_user_settings_v1';

const ROTATING_WORLDS: EnvironmentId[] = [
  'underwater',
  'ripples',
  'frog-pond',
  'cosmic-aurora',
  'abstract-flow',
];

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: '1', title: 'GitHub', url: 'https://github.com' },
  { id: '2', title: 'YouTube', url: 'https://youtube.com' },
  { id: '3', title: 'X', url: 'https://x.com' },
  { id: '4', title: 'Reddit', url: 'https://reddit.com' },
  { id: '5', title: 'Asciify', url: 'https://asciify.org' },
];

const DEFAULT_SETTINGS: UserSettings = {
  activeEnvironment: 'underwater',
  characterStyle: 'ascii-standard',
  colorTheme: 'true-color',
  fontSize: 14,
  charDensity: 1.0,
  animationSpeed: 1.0,
  interactionIntensity: 1.0,
  autoRotateEnvironments: false,
  performanceTier: 'balanced',
  reducedMotion: false,

  userName: '',
  searchEngine: 'google',
  customSearchUrl: '',
  shortcuts: DEFAULT_SHORTCUTS,
  enableRecentHistory: false,

  weatherCity: 'San Francisco',
  weatherUnits: 'celsius',
  useGeolocation: false,

  dimBackground: false,
  showClock: true,
  showWeather: true,
  showGreeting: true,
  showShortcuts: true,
  showTopWorldCapsule: false, // Off by default, toggleable in settings
  dailyEnvironmentRotation: true, // 24-hour daily world refresh
  lastRotationDate: '',
};

interface SettingsStore extends UserSettings {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  setEnvironment: (env: EnvironmentId) => void;
  setStyle: (style: CharacterStyle) => void;
  setTheme: (theme: ColorTheme) => void;
  setSearchEngine: (engine: SearchEngineId) => void;
  addShortcut: (shortcut: Omit<ShortcutItem, 'id'>) => void;
  removeShortcut: (id: string) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    const saved = await StorageService.get<Partial<UserSettings>>(SETTINGS_KEY, {});
    const combined = { ...DEFAULT_SETTINGS, ...saved };

    // Check 24-hour daily rotation
    const today = new Date().toISOString().slice(0, 10);
    if (combined.dailyEnvironmentRotation && combined.lastRotationDate !== today) {
      const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
      const dailyWorld = ROTATING_WORLDS[daysSinceEpoch % ROTATING_WORLDS.length];
      combined.activeEnvironment = dailyWorld;
      combined.lastRotationDate = today;
      StorageService.set(SETTINGS_KEY, combined);
    }

    set({ ...combined, isLoaded: true });
  },

  updateSettings: async (partial) => {
    set((state) => {
      const next = { ...state, ...partial };
      StorageService.set(SETTINGS_KEY, next);
      return next;
    });
  },

  setEnvironment: (env) => get().updateSettings({ activeEnvironment: env }),
  setStyle: (style) => get().updateSettings({ characterStyle: style }),
  setTheme: (theme) => get().updateSettings({ colorTheme: theme }),
  setSearchEngine: (engine) => get().updateSettings({ searchEngine: engine }),

  addShortcut: (shortcut) => {
    const newShortcut: ShortcutItem = {
      ...shortcut,
      id: Math.random().toString(36).substring(2, 9),
    };
    const nextList = [...get().shortcuts, newShortcut];
    get().updateSettings({ shortcuts: nextList });
  },

  removeShortcut: (id) => {
    const nextList = get().shortcuts.filter((s) => s.id !== id);
    get().updateSettings({ shortcuts: nextList });
  },
}));
