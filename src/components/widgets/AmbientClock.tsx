import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';

export const AmbientClock: React.FC = () => {
  const { showClock } = useSettingsStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!showClock) return null;

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const dateStr = time.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col items-center select-none text-slate-200">
      <div className="flex items-baseline text-4xl sm:text-5xl md:text-6xl font-extralight tracking-tight font-mono">
        <span>{hours}</span>
        <span className="text-teal-400/80 mx-1 animate-pulse-subtle">:</span>
        <span>{minutes}</span>
      </div>
      <div className="text-xs font-medium text-slate-400 tracking-wider uppercase mt-1">
        {dateStr}
      </div>
    </div>
  );
};
