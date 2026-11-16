import { create } from 'zustand';
import { UserSettings, ShortcutItem, SearchEngineId } from '../types/settings';
import { CharacterStyle, ColorTheme } from '../types/engine';
import { AnimalId, EnvironmentId, FlowId, SceneKind, WorldId } from '../types/environment';
import { StorageService } from '../services/storageService';
import { migrateStyle } from '../engine/core/Charsets';
import { READY_IDS, animalsFor, fits } from '../data/catalog';

const SETTINGS_KEY = 'pixora_user_settings_v1';

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: '1', title: 'GitHub', url: 'https://github.com' },
  { id: '2', title: 'YouTube', url: 'https://youtube.com' },
  { id: '3', title: 'X', url: 'https://x.com' },
  { id: '4', title: 'Reddit', url: 'https://reddit.com' },
  { id: '5', title: 'Asciify', url: 'https://asciify.org' },
];

export const DEFAULT_SETTINGS: UserSettings = {
  sceneKind: 'world',
  activeWorld: 'underwater',
  activeAnimal: 'fish',
  activeFlow: 'curl',
  layerAnimals: false,
  keepAnimal: false,
  keepFlow: false,
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

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Pick of the day from a list: walks the list by local day number (offset per
 * category so they don't move in lockstep), never repeating the current pick.
 */
export function pickForDate<T>(date: string, list: T[], current: T, salt = 0): T {
  if (list.length === 0) return current;
  const n = dayNumber(date) + salt;
  const pick = list[((n % list.length) + list.length) % list.length];
  return pick === current && list.length > 1 ? list[(n + 1) % list.length] : pick;
}

/** @deprecated use pickForDate */
export function worldForDate(date: string, current: EnvironmentId): EnvironmentId {
  return pickForDate(date, READY_IDS('world'), current);
}

/** What the engine should draw for the given settings. */
export function sceneFor(s: Pick<UserSettings, 'sceneKind' | 'activeWorld' | 'activeAnimal' | 'activeFlow' | 'layerAnimals'>): {
  base: EnvironmentId;
  overlay: EnvironmentId | null;
} {
  if (s.sceneKind === 'animal') return { base: s.activeAnimal, overlay: null };
  if (s.sceneKind === 'flow') return { base: s.activeFlow, overlay: null };
  if (!s.layerAnimals) return { base: s.activeWorld, overlay: null };
  // Layering: the chosen animal if it fits this world, otherwise the first that does, otherwise none.
  if (fits(s.activeWorld, s.activeAnimal).ok) return { base: s.activeWorld, overlay: s.activeAnimal };
  return { base: s.activeWorld, overlay: animalsFor(s.activeWorld)[0] ?? null };
}

/** The id currently shown for a category. */
export function activeOf(s: Pick<UserSettings, 'activeWorld' | 'activeAnimal' | 'activeFlow'>, kind: SceneKind): EnvironmentId {
  return kind === 'world' ? s.activeWorld : kind === 'animal' ? s.activeAnimal : s.activeFlow;
}

export const KEEP_KEY: Record<SceneKind, 'keepWorld' | 'keepAnimal' | 'keepFlow'> = {
  world: 'keepWorld',
  animal: 'keepAnimal',
  flow: 'keepFlow',
};

const ACTIVE_KEY: Record<SceneKind, 'activeWorld' | 'activeAnimal' | 'activeFlow'> = {
  world: 'activeWorld',
  animal: 'activeAnimal',
  flow: 'activeFlow',
};

function pickSettings(state: Partial<UserSettings>): UserSettings {
  const out = {} as Record<string, unknown>;
  for (const k of SETTING_KEYS) out[k] = state[k] ?? DEFAULT_SETTINGS[k];
  return out as unknown as UserSettings;
}

interface SettingsStore extends UserSettings {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<UserSettings>) => void;
  /** Show a scene: switches the category and the pick within it. */
  showScene: (kind: SceneKind, id: EnvironmentId) => void;
  setSceneKind: (kind: SceneKind) => void;
  /** Next / previous scene within the current category. */
  cycleScene: (dir: 1 | -1) => void;
  /** Toggle "Keep this forever" for the current category. */
  toggleKeep: () => void;
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
    // Migrate the single-world setting from v1.3 and earlier.
    const legacy = (saved as Record<string, unknown>).activeEnvironment as string | undefined;
    if (legacy && saved.activeWorld === undefined) {
      if (legacy === 'abstract-flow') {
        combined.sceneKind = 'flow';
        combined.activeFlow = 'curl';
      } else if (READY_IDS('world').includes(legacy as WorldId)) {
        combined.activeWorld = legacy as WorldId;
      }
    }
    if (!READY_IDS('world').includes(combined.activeWorld)) combined.activeWorld = 'underwater';
    if (!READY_IDS('animal').includes(combined.activeAnimal)) combined.activeAnimal = READY_IDS('animal')[0] as AnimalId;
    if (!READY_IDS('flow').includes(combined.activeFlow)) combined.activeFlow = READY_IDS('flow')[0] as FlowId;
    if (!['auto', 'low', 'balanced', 'high'].includes(combined.performanceTier)) combined.performanceTier = 'auto';
    // Older builds defaulted to San Francisco; an empty city now means "guess from time zone".
    if (saved.weatherCity === 'San Francisco' && saved.keepWorld === undefined) combined.weatherCity = '';

    const today = localDate();
    if (combined.dailyEnvironmentRotation && combined.lastRotationDate !== today) {
      if (!combined.keepWorld) combined.activeWorld = pickForDate(today, READY_IDS('world') as WorldId[], combined.activeWorld, 0);
      if (!combined.keepFlow) combined.activeFlow = pickForDate(today, READY_IDS('flow') as FlowId[], combined.activeFlow, 3);
      if (!combined.keepAnimal) {
        // When layering, only rotate among animals that fit today's world.
        const pool = (combined.layerAnimals && combined.sceneKind === 'world' ? animalsFor(combined.activeWorld) : READY_IDS('animal')) as AnimalId[];
        combined.activeAnimal = pickForDate(today, pool.length ? pool : (READY_IDS('animal') as AnimalId[]), combined.activeAnimal, 7);
      }
      combined.lastRotationDate = today;
    }
    StorageService.set(SETTINGS_KEY, combined);
    set({ ...combined, isLoaded: true });
  },

  updateSettings: (partial) => {
    set(partial);
    StorageService.set(SETTINGS_KEY, pickSettings(get()));
  },

  showScene: (kind, id) => get().updateSettings({ sceneKind: kind, [ACTIVE_KEY[kind]]: id } as Partial<UserSettings>),
  setSceneKind: (kind) => get().updateSettings({ sceneKind: kind }),
  cycleScene: (dir) => {
    const kind = get().sceneKind;
    const ids = READY_IDS(kind);
    const i = ids.indexOf(activeOf(get(), kind));
    const next = ids[(i + dir + ids.length) % ids.length];
    get().updateSettings({ [ACTIVE_KEY[kind]]: next } as Partial<UserSettings>);
  },
  toggleKeep: () => {
    const key = KEEP_KEY[get().sceneKind];
    get().updateSettings({ [key]: !get()[key] } as Partial<UserSettings>);
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
