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
    <div className="relative flex flex-col items-center select-none text-white">
      <div className="flex items-baseline text-5xl sm:text-6xl md:text-7xl font-normal sm:font-medium tracking-tight font-mono z-10 text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] [text-shadow:0_2px_20px_rgba(0,0,0,0.95)]">
        <span>{hours}</span>
        <span className="text-teal-400 mx-1.5 animate-pulse-subtle font-light">:</span>
        <span>{minutes}</span>
      </div>
      <div className="mt-2 z-10 px-3 py-0.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 shadow-lg text-[11px] font-semibold text-slate-300 tracking-widest uppercase drop-shadow">
        {dateStr}
      </div>
    </div>
  );
};
