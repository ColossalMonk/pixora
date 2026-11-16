import { mix, scale } from './Color';

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';
export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/** Light at the user's location right now. */
export interface SkyState {
  /** 0 deep night … 1 full day. */
  light: number;
  /** 0 … 1 strength of the golden-hour glow around sunrise and sunset. */
  warm: number;
  phase: DayPhase;
}

const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Light from local time. Sunrise / sunset come from the weather service when
 * available, otherwise 06:15 / 18:30. Light ramps over ±50 minutes around
 * each; the warm glow peaks right at them.
 */
export function skyAt(now: Date, sunrise?: Date | null, sunset?: Date | null): SkyState {
  const m = minutes(now);
  const rise = sunrise ? minutes(sunrise) : 6 * 60 + 15;
  const set = sunset ? minutes(sunset) : 18 * 60 + 30;
  const light = Math.min(smooth(rise - 50, rise + 50, m), 1 - smooth(set - 50, set + 50, m));
  const warm = Math.max(Math.exp(-(((m - rise) / 55) ** 2)), Math.exp(-(((m - set) / 55) ** 2)));
  let phase: DayPhase = 'night';
  if (warm > 0.45) phase = m < 12 * 60 ? 'dawn' : 'dusk';
  else if (light > 0.5) phase = 'day';
  return { light, warm, phase };
}

/** Fixed sky used when time-of-day is off: worlds look as designed. */
export const DESIGNED_SKY: SkyState = { light: 0, warm: 0, phase: 'night' };

const NIGHT_TINT = 0x1d2a4d;
const GOLD = 0xf59e0b;

/**
 * Colour grade for worlds that follow the clock: night is dimmer and bluer,
 * day slightly brighter, golden hour warmer. Subtle on purpose.
 */
export function grade(color: number, sky: SkyState): number {
  let c = color;
  if (sky.light < 1) c = mix(scale(c, 0.78 + sky.light * 0.22), NIGHT_TINT, (1 - sky.light) * 0.12);
  if (sky.light > 0) c = scale(c, 1 + sky.light * 0.06);
  if (sky.warm > 0) c = mix(c, GOLD, sky.warm * 0.1);
  return c;
}

/**
 * Backdrop for a clock-following world: blend its night stops toward its day
 * stops by light, and warm the lower half at golden hour.
 */
export function blendBackdrop(night: number[], day: number[] | undefined, sky: SkyState): number[] {
  return night.map((n, i) => {
    let c = day ? mix(n, day[Math.min(i, day.length - 1)], sky.light) : n;
    const low = i / Math.max(1, night.length - 1);
    if (sky.warm > 0) c = mix(c, i === night.length - 1 ? 0x3b1d2e : 0xc2410c, sky.warm * 0.35 * low);
    return c;
  });
}
