import React, { useMemo } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';

export const ConversationalGreeting: React.FC = () => {
  const { userName, showGreeting } = useSettingsStore();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    let bracket: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';

    if (hour >= 5 && hour < 12) bracket = 'morning';
    else if (hour >= 12 && hour < 17) bracket = 'afternoon';
    else if (hour >= 17 && hour < 22) bracket = 'evening';
    else bracket = 'night';

    const pools = {
      morning: [
        'Good morning. Ready to explore something new?',
        'The morning is fresh and calm. Where shall we begin?',
        'Good morning. What would you like to create today?',
        'A quiet start. Let’s make something great.',
      ],
      afternoon: [
        'Good afternoon. What are we working on today?',
        'Hope your day is flowing smoothly.',
        'Good afternoon. What’s on your mind?',
        'Taking a breath. Where to next?',
      ],
      evening: [
        'Good evening. Let’s make something worthwhile.',
        'Winding down, or just hitting your stride?',
        'Good evening. What shall we explore tonight?',
        'The evening is peaceful. Welcome back.',
      ],
      night: [
        'The night is young and quiet. What’s on your mind?',
        'Quiet hours. Breathe and take your time.',
        'Late night inspiration strikes. Where shall we dive in?',
        'Still exploring under the starlight.',
      ],
    };

    const options = pools[bracket];
    // Deterministic selection per minute to avoid jarring flickers
    const minuteIndex = new Date().getMinutes() % options.length;
    let text = options[minuteIndex];

    if (userName && userName.trim()) {
      text = text.replace(
        /^(Good morning|Good afternoon|Good evening|Welcome back)/,
        `$1, ${userName.trim()}`
      );
    }

    return text;
  }, [userName]);

  if (!showGreeting) return null;

  return (
    <div className="text-center select-none animate-fade-in mb-4">
      <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-surface/75 hover:bg-surface/90 backdrop-blur-xl border border-white/10 shadow-lg transition-colors">
        <h1 className="text-xs sm:text-sm font-medium text-slate-200 tracking-wide drop-shadow-sm">
          {greeting}
        </h1>
      </div>
    </div>
  );
};
