import { create } from 'zustand';
import type { WeatherData } from '../services/weatherService';

/** Runtime-only state shared between widgets and the canvas (not persisted). */
interface LiveStore {
  weather: WeatherData | null;
  setWeather: (w: WeatherData | null) => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  weather: null,
  setWeather: (weather) => set({ weather }),
}));
