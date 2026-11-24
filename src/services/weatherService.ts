import { StorageService } from './storageService';
import type { WeatherKind } from '../engine/core/Sky';

/** Best-effort city from the browser's time zone. Maps Indian standard time to New Delhi. */
export function guessCity(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Calcutta') || tz.includes('Kolkata') || tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata') {
      return 'New Delhi';
    }
    const last = tz.split('/').pop() || '';
    return last.replace(/_/g, ' ') || 'New Delhi';
  } catch {
    return 'New Delhi';
  }
}

/** WMO weather code → 0..1 heaviness (light drizzle 0.3 … violent showers / heavy snow 1). */
export function weatherIntensity(code: number): number {
  const table: Record<number, number> = {
    45: 0.6, 48: 0.8,
    51: 0.25, 53: 0.4, 55: 0.55, 56: 0.4, 57: 0.6,
    61: 0.45, 63: 0.7, 65: 1, 66: 0.55, 67: 0.9,
    71: 0.4, 73: 0.7, 75: 1, 77: 0.3,
    80: 0.5, 81: 0.75, 82: 1, 85: 0.6, 86: 1,
    95: 0.85, 96: 0.95, 99: 1,
  };
  return table[code] ?? 0;
}

/** Wind blowing FROM `fromDeg` (meteorological) → its left/right part on screen, km/h (+ blows toward the right, i.e. east). */
export function windAcross(kmh: number, fromDeg: number): number {
  return -Math.sin((fromDeg * Math.PI) / 180) * kmh;
}

export interface WeatherData {
  city: string;
  temp: number;
  condition: string;
  icon: string;
  isDay: boolean;
  timestamp: number;
  /** Which request this answers, so a changed city or unit never shows stale data. */
  key?: string;
  /** Coarse weather for the scenes (rain in the lake, snow in the pines…). */
  kind?: WeatherKind;
  /** Today's sunrise / sunset, local ISO time (drives time-of-day shading). */
  sunrise?: string;
  sunset?: string;
  /** 0..1 how heavy the rain, snow or fog is (from the weather code). */
  intensity?: number;
  /** Wind at 10 m, km/h, and the direction it blows FROM, degrees (meteorological). */
  windKmh?: number;
  windFrom?: number;
}

const CACHE_KEY = 'pixora_weather_cache_v9';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const NCR_ALIASES = ['dadri', 'dādri', 'noida', 'greater noida', 'ghaziabad', 'delhi', 'new delhi', 'calcutta', 'kolkata'];

function isNcrOrCalcutta(name: string): boolean {
  return NCR_ALIASES.some((alias) => name.toLowerCase().includes(alias));
}

export class WeatherService {
  public static async getWeather(
    cityName = '',
    useGeo = false,
    unit: 'celsius' | 'fahrenheit' = 'celsius'
  ): Promise<WeatherData | null> {
    try {
      let city = cityName.trim() || guessCity();
      if (!city || isNcrOrCalcutta(city)) {
        city = 'New Delhi';
      }
      const requestKey = `${useGeo ? 'geo' : city.toLowerCase()}|${unit}`;
      const cached = await StorageService.get<WeatherData | null>(CACHE_KEY, null);
      if (cached && cached.key === requestKey && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached;
      }

      let lat = NaN;
      let lon = NaN;
      let displayCity = city;

      if (useGeo && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await this.getCurrentPosition();
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          displayCity = (await this.placeName(lat, lon)) || guessCity() || 'New Delhi';
        } catch {
          // Fall back to city geocoding
        }
      }

      if (isNcrOrCalcutta(displayCity)) {
        displayCity = 'New Delhi';
        lat = 28.6139;
        lon = 77.209;
      }

      if (Number.isNaN(lat) && city) {
        if (city.toLowerCase() === 'new delhi') {
          lat = 28.6139;
          lon = 77.209;
          displayCity = 'New Delhi';
        } else {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
          );
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results.length > 0) {
            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
            displayCity = geoData.results[0].name;
            if (displayCity.toLowerCase().includes('calcutta') || displayCity.toLowerCase().includes('kolkata')) {
              displayCity = 'New Delhi';
              lat = 28.6139;
              lon = 77.209;
            }
          }
        }
      }

      if (Number.isNaN(lat)) return null;

      // Fetch live weather from Open-Meteo
      const tempParam = unit === 'fahrenheit' ? '&temperature_unit=fahrenheit' : '';
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&daily=sunrise,sunset&timezone=auto&forecast_days=1${tempParam}`
      );
      const data = await weatherRes.json();

      if (!data.current) return null;

      const code = data.current.weather_code;
      const isDay = data.current.is_day === 1;
      const { condition, icon } = this.mapWeatherCode(code, isDay);

      const result: WeatherData = {
        city: displayCity,
        temp: Math.round(data.current.temperature_2m),
        condition,
        icon,
        isDay,
        timestamp: Date.now(),
        key: requestKey,
        kind: this.kindOf(code),
        intensity: weatherIntensity(code),
        windKmh: Number(data.current.wind_speed_10m) || 0,
        windFrom: Number(data.current.wind_direction_10m) || 0,
        sunrise: data.daily?.sunrise?.[0],
        sunset: data.daily?.sunset?.[0],
      };

      await StorageService.set(CACHE_KEY, result);
      return result;
    } catch (e) {
      console.warn('WeatherService error:', e);
      return null;
    }
  }

  /**
   * Coordinates → place name. Uses BigDataCloud's free client-side reverse
   * geocoder (no key); only called when the user turned on "Use my location".
   */
  private static async placeName(lat: number, lon: number): Promise<string> {
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&localityLanguage=en`
      );
      if (!res.ok) return '';
      const d = await res.json();
      return d.city || d.locality || d.principalSubdivision || d.countryName || '';
    } catch {
      return '';
    }
  }

  private static getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 6000,
        maximumAge: 10 * 60 * 1000,
      });
    });
  }

  /** WMO weather code → coarse kind for the scenes. */
  private static kindOf(code: number): WeatherKind {
    if (code === 0) return 'clear';
    if (code <= 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloudy';
  }

  private static mapWeatherCode(code: number, isDay: boolean): { condition: string; icon: string } {
    switch (code) {
      case 0:
        return { condition: 'Clear Sky', icon: isDay ? 'sun' : 'moon' };
      case 1:
      case 2:
      case 3:
        return { condition: 'Partly Cloudy', icon: 'cloud-sun' };
      case 45:
      case 48:
        return { condition: 'Foggy', icon: 'cloud-fog' };
      case 51:
      case 53:
      case 55:
      case 61:
      case 63:
      case 65:
      case 80:
      case 81:
      case 82:
        return { condition: 'Rain', icon: 'cloud-rain' };
      case 71:
      case 73:
      case 75:
      case 77:
        return { condition: 'Snow', icon: 'cloud-snow' };
      case 95:
      case 96:
      case 99:
        return { condition: 'Thunderstorm', icon: 'cloud-lightning' };
      default:
        return { condition: 'Overcast', icon: 'cloud' };
    }
  }
}
