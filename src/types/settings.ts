import { CharacterStyle, ColorTheme, PerformanceTier } from './engine';
import { AnimalId, FlowId, SceneKind, WorldId } from './environment';

export interface ShortcutItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  isCustom?: boolean;
}

export type SearchEngineId = 'google' | 'duckduckgo' | 'bing' | 'brave' | 'ecosia' | 'custom';

export interface SearchEngine {
  id: SearchEngineId;
  name: string;
  searchUrl: string; // e.g. "https://www.google.com/search?q=%s"
  icon: string;
}

export interface UserSettings {
  // Scenes
  /** Which category the tab shows. */
  sceneKind: SceneKind;
  activeWorld: WorldId;
  activeAnimal: AnimalId;
  activeFlow: FlowId;
  /** Opt-in: layer a fitting animal over the world. */
  layerAnimals: boolean;
  keepAnimal: boolean;
  keepFlow: boolean;
  /** Tweaks-panel values per animal (only changed knobs are stored). */
  animalTweaks: Record<string, Record<string, number>>;

  // Engine
  characterStyle: CharacterStyle;
  colorTheme: ColorTheme;
  fontSize: number;
  charDensity: number;
  animationSpeed: number;
  interactionIntensity: number;
  performanceTier: PerformanceTier;
  /** 0..1 — fade the art softly behind the clock and search. */
  calmCenter: number;
  reducedMotion: boolean;

  // Productivity
  userName: string;
  searchEngine: SearchEngineId;
  customSearchUrl: string;
  shortcuts: ShortcutItem[];
  
  // Weather
  weatherCity: string;
  weatherUnits: 'celsius' | 'fahrenheit';
  useGeolocation: boolean;

  // UI appearance
  dimBackground: boolean;
  showClock: boolean;
  showWeather: boolean;
  showGreeting: boolean;
  showShortcuts: boolean;
  showTopWorldCapsule: boolean; // Hidden inside settings, off by default
  dailyEnvironmentRotation: boolean; // Rotates to a new living world every day
  /** "Keep this forever" for worlds (animals and flows have their own pins). */
  keepWorld: boolean;
  lastRotationDate: string; // local date YYYY-MM-DD
}
