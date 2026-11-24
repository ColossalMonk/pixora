import React, { useState, useEffect } from 'react';
import { Cloud, Sun, Moon, CloudSun, CloudRain, CloudSnow, CloudLightning, MapPin } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { WeatherData, WeatherService } from '../../services/weatherService';
import { useLiveStore } from '../../store/useLiveStore';

export const WeatherWidget: React.FC = () => {
  const { weatherCity, weatherUnits, useGeolocation, showWeather } = useSettingsStore();
  const publish = useLiveStore((s) => s.setWeather);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showWeather) return;

    let isMounted = true;
    setLoading(true);

    WeatherService.getWeather(weatherCity, useGeolocation, weatherUnits).then((data) => {
      if (isMounted) {
        setWeather(data);
        publish(data);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [weatherCity, weatherUnits, useGeolocation, showWeather, publish]);

  if (!showWeather) return null;

  const renderIcon = (iconName: string) => {
    const props = { className: 'w-4 h-4 text-teal-300' };
    switch (iconName) {
      case 'sun':
        return <Sun {...props} className="w-4 h-4 text-amber-400" />;
      case 'moon':
        return <Moon {...props} className="w-4 h-4 text-indigo-300" />;
      case 'cloud-sun':
        return <CloudSun {...props} className="w-4 h-4 text-amber-300" />;
      case 'cloud-rain':
        return <CloudRain {...props} className="w-4 h-4 text-sky-400" />;
      case 'cloud-snow':
        return <CloudSnow {...props} className="w-4 h-4 text-sky-200" />;
      case 'cloud-lightning':
        return <CloudLightning {...props} className="w-4 h-4 text-yellow-400" />;
      default:
        return <Cloud {...props} className="w-4 h-4 text-slate-300" />;
    }
  };

  if (loading && !weather) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel-subtle text-xs text-slate-400 animate-pulse">
        <Cloud className="w-3.5 h-3.5" />
        <span>Loading weather...</span>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel-subtle text-xs text-slate-400">
        <MapPin className="w-3.5 h-3.5" />
        <span>{weatherCity || 'Weather Unavailable'}</span>
      </div>
    );
  }

  const unitSymbol = weatherUnits === 'fahrenheit' ? '°F' : '°C';
  const displayCity =
    weather.city &&
    ['dadri', 'dādri', 'noida', 'greater noida', 'ghaziabad', 'delhi', 'calcutta', 'kolkata'].includes(
      weather.city.toLowerCase().trim()
    )
      ? 'New Delhi'
      : weather.city || 'New Delhi';

  return (
    <div
      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface/85 backdrop-blur-2xl text-xs text-white shadow-xl select-none border border-white/12"
      title={`${weather.condition} in ${displayCity}`}
    >
      {renderIcon(weather.icon)}
      <span className="font-semibold text-white">{weather.temp}{unitSymbol}</span>
      <span className="text-slate-500">•</span>
      <span className="text-slate-200 font-medium truncate max-w-[120px]">{displayCity}</span>
    </div>
  );
};
