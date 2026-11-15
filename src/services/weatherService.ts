import { StorageService } from './storageService';

export interface WeatherData {
  city: string;
  temp: number;
  condition: string;
  icon: string;
  isDay: boolean;
  timestamp: number;
}

const CACHE_KEY = 'pixora_weather_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class WeatherService {
  public static async getWeather(
    cityName = 'San Francisco',
    useGeo = false,
    unit: 'celsius' | 'fahrenheit' = 'celsius'
  ): Promise<WeatherData | null> {
    try {
      // 1. Check cache
      const cached = await StorageService.get<WeatherData | null>(CACHE_KEY, null);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached;
      }

      let lat = 37.7749;
      let lon = -122.4194;
      let displayCity = cityName || 'San Francisco';

      if (useGeo && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await this.getCurrentPosition();
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          displayCity = 'Current Location';
        } catch {
          // Fall back to city geocoding
        }
      }

      if (!useGeo && cityName) {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`
        );
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          lat = geoData.results[0].latitude;
          lon = geoData.results[0].longitude;
          displayCity = geoData.results[0].name;
        }
      }

      // Fetch live weather from Open-Meteo
      const tempParam = unit === 'fahrenheit' ? '&temperature_unit=fahrenheit' : '';
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,weather_code${tempParam}`
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
      };

      await StorageService.set(CACHE_KEY, result);
      return result;
    } catch (e) {
      console.warn('WeatherService error:', e);
      return null;
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
