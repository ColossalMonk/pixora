import { CharacterStyle, ColorTheme } from './engine';
import { EnvironmentId } from './environment';

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
  // Environment & Engine
  activeEnvironment: EnvironmentId;
  characterStyle: CharacterStyle;
  colorTheme: ColorTheme;
  fontSize: number;
  charDensity: number;
  animationSpeed: number;
  interactionIntensity: number;
  autoRotateEnvironments: boolean;
  performanceTier: 'low' | 'balanced' | 'high';
  reducedMotion: boolean;

  // Productivity
  userName: string;
  searchEngine: SearchEngineId;
  customSearchUrl: string;
  shortcuts: ShortcutItem[];
  enableRecentHistory: boolean;
  
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
}
