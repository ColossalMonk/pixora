import { EnvironmentMeta } from '../types/environment';

export const WORLDS: EnvironmentMeta[] = [
  {
    id: 'underwater',
    name: 'Underwater World',
    short: 'Ocean',
    tagline: 'Schools of fish, jellyfish and kelp under drifting light',
    description:
      'Fish flock in depth layers, jellyfish pulse and trail soft tentacles, big fish wander and get curious, kelp sways over a coral seabed.',
    interactions: 'Hold the pointer still and big fish come to look · move fast and schools scatter · click to send a bubble burst',
    accent: '#5eead4',
  },
  {
    id: 'ripples',
    name: 'Moonlit Lake',
    short: 'Lake',
    tagline: 'Ripples, a moon path, petals and passing rain',
    description:
      'A wave simulation lit by the moon, with a shimmering reflection path, floating petals, fireflies along the shore and occasional showers.',
    interactions: 'Drag across the water to leave a wake · click for a drop · click the sky to call the rain',
    accent: '#93c5fd',
  },
  {
    id: 'frog-pond',
    name: 'Frog Pond',
    short: 'Pond',
    tagline: 'Frogs, koi, lily pads and dragonflies',
    description:
      'Frogs breathe, blink, leap between lily pads, swim back and snap up dragonflies. Koi drift below the surface.',
    interactions: 'Click the water to drop food for the koi · get close and frogs leap away · frogs watch your pointer',
    accent: '#86efac',
  },
  {
    id: 'cosmic-aurora',
    name: 'Northern Lights',
    short: 'Aurora',
    tagline: 'Aurora curtains over mountains and a still lake',
    description:
      'Two aurora curtains ripple over snowy ridges, mirrored in a lake. Stars twinkle and meteors streak by now and then.',
    interactions: 'Move the pointer to push the curtains · click for a flare and a shooting star',
    accent: '#c4b5fd',
  },
  {
    id: 'abstract-flow',
    name: 'Flow Fields',
    short: 'Flow',
    tagline: 'Thousands of particles tracing curl-noise currents',
    description:
      'Particles follow a smooth, swirling flow field and leave fading ink trails, drawn in fine Braille dots. The palette drifts between moods.',
    interactions: 'Hover to stir a vortex · click to send out a shockwave',
    accent: '#f9a8d4',
  },
];

export const worldMeta = (id: string): EnvironmentMeta => WORLDS.find((w) => w.id === id) ?? WORLDS[0];
