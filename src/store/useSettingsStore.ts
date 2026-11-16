import { create } from 'zustand';
import { UserSettings, ShortcutItem, SearchEngineId } from '../types/settings';
import { CharacterStyle, ColorTheme } from '../types/engine';
import { EnvironmentId } from '../types/environment';
import { StorageService } from '../services/storageService';
import { migrateStyle } from '../engine/core/Charsets';
import { ENVIRONMENT_IDS } from '../engine/environments/registry';

const SETTINGS_KEY = 'pixora_user_settings_v1';

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: '1', title: 'GitHub', url: 'https://github.com' },
  { id: '2', title: 'YouTube', url: 'https://youtube.com' },
  { id: '3', title: 'X', url: 'https://x.com' },
  { id: '4', title: 'Reddit', url: 'https://reddit.com' },
  { id: '5', title: 'Asciify', url: 'https://asciify.org' },
];

export const DEFAULT_SETTINGS: UserSettings = {
  activeEnvironment: 'underwater',
  characterStyle: 'auto',
  colorTheme: 'true-color',
  fontSize: 14,
  charDensity: 1.0,
  animationSpeed: 1.0,
  interactionIntensity: 1.0,
  performanceTier: 'auto',
  calmCenter: 0.6,
  reducedMotion: false,

  userName: '',
  searchEngine: 'google',
  customSearchUrl: '',
  shortcuts: DEFAULT_SHORTCUTS,

  weatherCity: '',
  weatherUnits: 'celsius',
  useGeolocation: false,

  dimBackground: false,
  showClock: true,
  showWeather: true,
  showGreeting: true,
  showShortcuts: true,
  showTopWorldCapsule: false,
  dailyEnvironmentRotation: true,
  keepWorld: false,
  lastRotationDate: '',
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[];

/** Local calendar date (not UTC), so the world changes at the user's midnight. */
export function localDate(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** World of the day: walks the list by local day number, never repeating yesterday's. */
export function worldForDate(date: string, current: EnvironmentId): EnvironmentId {
  const [y, m, d] = date.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const pick = ENVIRONMENT_IDS[dayNumber % ENVIRONMENT_IDS.length];
  return pick === current ? ENVIRONMENT_IDS[(dayNumber + 1) % ENVIRONMENT_IDS.length] : pick;
}

function pickSettings(state: Partial<UserSettings>): UserSettings {
  const out = {} as Record<string, unknown>;
  for (const k of SETTING_KEYS) out[k] = state[k] ?? DEFAULT_SETTINGS[k];
  return out as unknown as UserSettings;
}

interface SettingsStore extends UserSettings {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<UserSettings>) => void;
  setEnvironment: (env: EnvironmentId) => void;
  cycleEnvironment: (dir: 1 | -1) => void;
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
    const combined = pickSettings({ ...DEFAULT_SETTINGS, ...saved });
    combined.characterStyle = migrateStyle(saved.characterStyle);
    if (!ENVIRONMENT_IDS.includes(combined.activeEnvironment)) combined.activeEnvironment = 'underwater';
    if (!['auto', 'low', 'balanced', 'high'].includes(combined.performanceTier)) combined.performanceTier = 'auto';
    // Older builds defaulted to San Francisco; an empty city now means "guess from time zone".
    if (saved.weatherCity === 'San Francisco' && saved.keepWorld === undefined) combined.weatherCity = '';

    const today = localDate();
    if (combined.dailyEnvironmentRotation && !combined.keepWorld && combined.lastRotationDate !== today) {
      combined.activeEnvironment = worldForDate(today, combined.activeEnvironment);
      combined.lastRotationDate = today;
    }
    StorageService.set(SETTINGS_KEY, combined);
    set({ ...combined, isLoaded: true });
  },

  updateSettings: (partial) => {
    set(partial);
    StorageService.set(SETTINGS_KEY, pickSettings(get()));
  },

  setEnvironment: (env) => get().updateSettings({ activeEnvironment: env }),
  cycleEnvironment: (dir) => {
    const i = ENVIRONMENT_IDS.indexOf(get().activeEnvironment);
    const next = ENVIRONMENT_IDS[(i + dir + ENVIRONMENT_IDS.length) % ENVIRONMENT_IDS.length];
    get().updateSettings({ activeEnvironment: next });
  },
  setStyle: (style) => get().updateSettings({ characterStyle: style }),
  setTheme: (theme) => get().updateSettings({ colorTheme: theme }),
  setSearchEngine: (engine) => get().updateSettings({ searchEngine: engine }),

  addShortcut: (shortcut) => {
    const newShortcut: ShortcutItem = { ...shortcut, id: Math.random().toString(36).substring(2, 9) };
    get().updateSettings({ shortcuts: [...get().shortcuts, newShortcut] });
  },

  removeShortcut: (id) => {
    get().updateSettings({ shortcuts: get().shortcuts.filter((s) => s.id !== id) });
  },
}));
