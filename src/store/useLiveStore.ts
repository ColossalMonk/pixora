import { create } from 'zustand';
import type { WeatherData } from '../services/weatherService';
import type { DayPhase, WeatherKind } from '../engine/core/Sky';

export type WeatherPreview = 'live' | WeatherKind;
export type TimePreview = 'live' | DayPhase;

/** Runtime-only state shared between widgets and the canvas (not persisted). */
interface LiveStore {
  weather: WeatherData | null;
  setWeather: (w: WeatherData | null) => void;
  /** Try a weather or time of day without waiting for it (resets with each new tab). */
  weatherPreview: WeatherPreview;
  timePreview: TimePreview;
  setWeatherPreview: (p: WeatherPreview) => void;
  setTimePreview: (p: TimePreview) => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  weather: null,
  setWeather: (weather) => set({ weather }),
  weatherPreview: 'live',
  timePreview: 'live',
  setWeatherPreview: (weatherPreview) => set({ weatherPreview }),
  setTimePreview: (timePreview) => set({ timePreview }),
}));
