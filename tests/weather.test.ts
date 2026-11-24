import { describe, expect, it } from 'vitest';
import { weatherIntensity, windAcross, type WeatherData } from '../src/services/weatherService';
import { atmosphereNow } from '../src/services/atmosphereInput';
import { Atmosphere, particleCount, windPush } from '../src/engine/ascii-animals/atmosphere';

const base: WeatherData = { city: 'Pune', temp: 22, condition: 'Rain', icon: 'cloud-rain', isDay: true, timestamp: 0 };

describe('weather codes', () => {
  it('maps WMO codes to heaviness', () => {
    expect(weatherIntensity(51)).toBeLessThan(weatherIntensity(65));
    expect(weatherIntensity(65)).toBe(1);
    expect(weatherIntensity(0)).toBe(0);
  });

  it('turns wind FROM a direction into a left/right push', () => {
    expect(windAcross(20, 270)).toBeCloseTo(20); // from the west → blows right
    expect(windAcross(20, 90)).toBeCloseTo(-20); // from the east → blows left
    expect(Math.abs(windAcross(20, 0))).toBeLessThan(1e-9); // from the north → no sideways part
  });
});

describe('atmosphereNow', () => {
  const noon = new Date(2026, 5, 1, 12, 0);
  const midnight = new Date(2026, 5, 1, 0, 30);

  it('follows the clock with no weather data: clear, calm, day at noon, night at midnight', () => {
    const day = atmosphereNow(null, 'live', 'live', noon);
    expect(day).toMatchObject({ kind: 'clear', intensity: 0, windKmh: 0, phase: 'day' });
    expect(atmosphereNow(null, 'live', 'live', midnight).phase).toBe('night');
  });

  it('uses the real weather, intensity and wind', () => {
    const a = atmosphereNow({ ...base, kind: 'rain', intensity: 0.7, windKmh: 30, windFrom: 270 }, 'live', 'live', noon);
    expect(a.kind).toBe('rain');
    expect(a.intensity).toBe(0.7);
    expect(a.windKmh).toBeCloseTo(30);
  });

  it('assumes moderate rain for older cached weather without intensity', () => {
    expect(atmosphereNow({ ...base, kind: 'snow' }, 'live', 'live', noon).intensity).toBe(0.6);
  });

  it('previews override the live weather and time', () => {
    const a = atmosphereNow({ ...base, kind: 'clear' }, 'storm', 'dusk', noon);
    expect(a.kind).toBe('storm');
    expect(a.phase).toBe('dusk');
    expect(a.warm).toBe(1);
  });
});

describe('Atmosphere', () => {
  it('only makes particles for rain, storms and snow, scaled by screen size', () => {
    expect(particleCount('clear', 1, 1440, 900)).toBe(0);
    expect(particleCount('fog', 1, 1440, 900)).toBe(0);
    expect(particleCount('rain', 1, 1440, 900)).toBeGreaterThan(particleCount('rain', 0.2, 1440, 900));
    expect(particleCount('rain', 1, 2880, 1800)).toBeCloseTo(particleCount('rain', 1, 1440, 900) * 4, -1);
  });

  it('caps wind so a gale does not fling everything off screen', () => {
    expect(windPush(500)).toBe(windPush(80));
    expect(windPush(-500)).toBe(-windPush(80));
  });

  it('fog fades more than rain; clear does not fade at all', () => {
    const a = new Atmosphere();
    const fade = (kind: 'clear' | 'rain' | 'fog') => {
      a.set({ kind, intensity: 1, windKmh: 0, light: 1, warm: 0, phase: 'day' });
      return a.fogAmount;
    };
    expect(fade('clear')).toBe(0);
    expect(fade('fog')).toBeGreaterThan(fade('rain'));
  });

  it('grades nothing at a calm midday, dims and cools at night (dark theme)', () => {
    const a = new Atmosphere();
    a.set({ kind: 'clear', intensity: 0, windKmh: 0, light: 1, warm: 0, phase: 'day' });
    expect(a.grade([200, 100, 50], 'dark')).toEqual([200, 100, 50]);
    a.set({ kind: 'clear', intensity: 0, windKmh: 0, light: 0, warm: 0, phase: 'night' });
    const [r, , b] = a.grade([200, 100, 50], 'dark');
    expect(r).toBeLessThan(200);
    expect(b).toBeGreaterThan(50 * 0.72);
  });
});
