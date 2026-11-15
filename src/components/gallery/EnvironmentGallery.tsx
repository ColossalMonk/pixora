import React from 'react';
import { X, Check, Waves, Droplets, Sparkles, Wind, Bug } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { EnvironmentMeta } from '../../types/environment';

export const ENVIRONMENTS_METADATA: EnvironmentMeta[] = [
  {
    id: 'underwater',
    name: 'Underwater World',
    tagline: 'Living oceanic ecosystem with schooling fish & floating jellyfish',
    description:
      'Continuous aquatic simulation featuring Boids flocking fish, kinematically undulating jellyfish with trailing tentacles, seabed seaweed, and bubbles.',
    iconName: 'waves',
    defaultStyle: 'ascii-standard',
    defaultTheme: 'true-color',
  },
  {
    id: 'ripples',
    name: 'Interactive Water',
    tagline: 'Discretized 2D shallow water wave heightfield simulation',
    description:
      'Physics-based wave propagation solver where cursor movements create disturbances and clicks generate expanding ripple shockwaves across drifting petals.',
    iconName: 'droplets',
    defaultStyle: 'blocks',
    defaultTheme: 'ice-blue',
  },
  {
    id: 'frog-pond',
    name: 'Frog & Lily Pond',
    tagline: 'Biomechanical frogs, bobbing lily pads & water splash reactions',
    description:
      'Pond environment featuring biomechanical frogs with breathing, jump anticipation, and landing splash states coupled with buzzing dragonflies.',
    iconName: 'bug',
    defaultStyle: 'ascii-standard',
    defaultTheme: 'matrix-green',
  },
  {
    id: 'cosmic-aurora',
    name: 'Cosmic Aurora',
    tagline: 'Atmospheric multi-octave aurora curtains & celestial dust',
    description:
      'Procedural ribbon curtains oscillating with continuous simplex noise, drifting above a twinkling starfield and cosmic particles.',
    iconName: 'sparkles',
    defaultStyle: 'ascii-dense',
    defaultTheme: 'cyberpunk-neon',
  },
  {
    id: 'abstract-flow',
    name: 'Abstract Flow Fields',
    tagline: 'Procedural curl noise vector swarms & vortex attractors',
    description:
      'Mathematical generative art installation where particles navigate smooth curl noise velocity fields, swirling dynamically around user mouse interaction.',
    iconName: 'wind',
    defaultStyle: 'directional',
    defaultTheme: 'cyberpunk-neon',
  },
];

interface EnvironmentGalleryProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EnvironmentGallery: React.FC<EnvironmentGalleryProps> = ({ isOpen, onClose }) => {
  const { activeEnvironment, setEnvironment } = useSettingsStore();

  if (!isOpen) return null;

  const renderIcon = (name: string) => {
    switch (name) {
      case 'waves':
        return <Waves className="w-5 h-5 text-teal-400" />;
      case 'droplets':
        return <Droplets className="w-5 h-5 text-sky-400" />;
      case 'bug':
        return <Bug className="w-5 h-5 text-emerald-400" />;
      case 'sparkles':
        return <Sparkles className="w-5 h-5 text-purple-400" />;
      case 'wind':
        return <Wind className="w-5 h-5 text-pink-400" />;
      default:
        return <Waves className="w-5 h-5" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-full max-w-2xl max-h-[85vh] rounded-3xl p-6 overflow-y-auto border border-white/10 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Environment Gallery</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select your procedural living ASCII world
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Environment Cards List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ENVIRONMENTS_METADATA.map((env) => {
            const isActive = activeEnvironment === env.id;
            return (
              <div
                key={env.id}
                onClick={() => setEnvironment(env.id)}
                className={`relative p-4 rounded-2xl cursor-pointer transition-all duration-200 border text-left flex flex-col justify-between ${
                  isActive
                    ? 'glass-panel bg-teal-950/30 border-teal-400/50 ring-1 ring-teal-400/50 shadow-lg'
                    : 'glass-panel-subtle border-white/5 hover:border-white/15 hover:bg-white/5'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-white/5">
                        {renderIcon(env.iconName)}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-100">{env.name}</h3>
                    </div>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-teal-400 bg-teal-400/10 px-2 py-0.5 rounded-full">
                        <Check className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-medium text-slate-300 mb-1.5">{env.tagline}</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{env.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Interactive • 60 FPS</span>
                  <span className="font-mono text-teal-300/80">#procedural</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
