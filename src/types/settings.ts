import { CharacterStyle, ColorTheme, PerformanceTier } from './engine';
import { CustomSlotId, SceneId } from './environment';

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
  searchUrl: string;
  icon: string;
}

export type CustomRenderMode = 'tiles' | 'characters' | 'braille' | 'blocks';
export type CustomColorMode = 'full' | 'mono' | 'matrix' | 'amber' | 'cyberpunk';
export type CustomPointerEffect = 'gas' | 'ripple' | 'lantern' | 'drift' | 'none';

export interface CustomImageConfig {
  name?: string;
  mediaType?: 'image' | 'video';
  renderMode: CustomRenderMode;
  colorMode: CustomColorMode;
  brightness: number; // -0.5 .. 0.5
  contrast: number; // 0.5 .. 2.0
  gamma: number; // 0.5 .. 2.0
  invert: boolean;
  glow: number; // 0 .. 1 subtle backlight glow
  /** Characters mode: how strongly contours are inked in as outlines (0 = off). */
  edges?: number; // 0 .. 1
  effect: CustomPointerEffect;
  flowSpeed: number; // 0.2 .. 3.0
  flowSpread: number; // 0.2 .. 3.0
  flowDecay: number; // 0.2 .. 3.0
}

export const DEFAULT_CUSTOM_CONFIG: CustomImageConfig = {
  name: '',
  mediaType: 'image',
  renderMode: 'characters',
  colorMode: 'full',
  brightness: 0,
  contrast: 1.15,
  gamma: 1,
  invert: false,
  glow: 0.45,
  edges: 0.35,
  effect: 'gas',
  flowSpeed: 1.0,
  flowSpread: 1.0,
  flowDecay: 1.0,
};

export interface UserSettings {
  // Active Scene (7 Animals + 3 Custom Image Slots = 10 Total)
  activeScene: SceneId;
  customConfigs: Record<CustomSlotId, CustomImageConfig>;
  animalTweaks: Record<string, Record<string, number | boolean>>;

  // Engine & Look
  characterStyle: CharacterStyle;
  colorTheme: ColorTheme;
  fontSize: number;
  charDensity: number;
  animationSpeed: number;
  interactionIntensity: number;
  performanceTier: PerformanceTier;
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

  // UI Visibility
  showClock: boolean;
  showWeather: boolean;
  showGreeting: boolean;
  showShortcuts: boolean;
  dimBackground: boolean;
}
