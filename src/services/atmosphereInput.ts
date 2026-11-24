import type { AtmosphereInput } from '../engine/ascii-animals/atmosphere';
import { skyAt, type DayPhase } from '../engine/core/Sky';
import type { TimePreview, WeatherPreview } from '../store/useLiveStore';
import { windAcross, type WeatherData } from './weatherService';

/** Light and golden-hour glow for a previewed time of day. */
const PHASE_SKY: Record<DayPhase, { light: number; warm: number }> = {
  dawn: { light: 0.45, warm: 1 },
  day: { light: 1, warm: 0 },
  dusk: { light: 0.35, warm: 1 },
  night: { light: 0, warm: 0 },
};

const PREVIEW_INTENSITY = { clear: 0, cloudy: 0, fog: 0.8, rain: 0.7, snow: 0.75, storm: 1 } as const;
const PREVIEW_WIND = { clear: 6, cloudy: 10, fog: 2, rain: 16, snow: 12, storm: 34 } as const;

/** Parses Open-Meteo's local "2026-11-24T06:52" (no zone) as local time; null if missing. */
function localTime(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * What the animal scenes should show right now: the real weather and sun
 * (from the weather widget's last fetch), or a previewed weather / time.
 * Without weather data it is clear and calm, following the clock.
 */
export function atmosphereNow(
  weather: WeatherData | null,
  weatherPreview: WeatherPreview,
  timePreview: TimePreview,
  now: Date = new Date(),
): AtmosphereInput {
  const sky =
    timePreview === 'live'
      ? skyAt(now, localTime(weather?.sunrise), localTime(weather?.sunset))
      : { ...PHASE_SKY[timePreview], phase: timePreview };

  if (weatherPreview !== 'live') {
    return {
      kind: weatherPreview,
      intensity: PREVIEW_INTENSITY[weatherPreview],
      windKmh: PREVIEW_WIND[weatherPreview],
      ...sky,
    };
  }
  const kind = weather?.kind ?? 'clear';
  return {
    kind,
    // Older cached weather has no intensity: assume moderate.
    intensity: weather?.intensity ?? (kind === 'clear' || kind === 'cloudy' ? 0 : 0.6),
    windKmh: weather?.windKmh !== undefined ? windAcross(weather.windKmh, weather.windFrom ?? 270) : 0,
    ...sky,
  };
}
