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
  {
    id: 'campfire',
    name: 'Campfire',
    short: 'Fire',
    tagline: 'A crackling fire under the stars',
    description: 'Flames from a heat simulation lick upward and flicker, sparks drift into the night and firelight warms the trees around the clearing.',
    interactions: 'Move left or right of the fire and the wind leans the flames · click to throw on a log and send up sparks',
    accent: '#fb923c',
  },
  {
    id: 'zen-garden',
    name: 'Zen Garden',
    short: 'Zen',
    tagline: 'Raked sand, mossy stones, drifting petals',
    description: 'Grooves run in quiet rows and ring each stone. Whatever you rake slowly settles back over a minute or so.',
    interactions: 'Hold the pointer down and drag to rake the sand · click to press rings around a point',
    accent: '#d6c7a1',
  },
  {
    id: 'meadow',
    name: 'Butterfly Meadow',
    short: 'Meadow',
    tagline: 'Dusk hills, swaying grass and butterflies',
    description: 'Butterflies wander from flower to flower and rest with slow wingbeats. Grass sways in the evening breeze.',
    interactions: 'Hold still and butterflies come close · move fast and they scatter · brush the grass to part it · click to release more',
    accent: '#f9a8d4',
  },
  {
    id: 'winter-pines',
    name: 'Winter Pines',
    short: 'Snow',
    tagline: 'Snow falling on pine ridges under the moon',
    description: 'Snow falls in three depths and gathers on the ground, drifting with the wind between snowy pines.',
    interactions: 'Sweep the pointer to blow gusts and swirl flakes · click for a strong gust',
    accent: '#cbd5e1',
  },
  {
    id: 'firefly-forest',
    name: 'Firefly Forest',
    short: 'Fireflies',
    tagline: 'Fireflies that learn to flash together',
    description: 'Each firefly keeps its own rhythm but listens to the others, so over a minute random twinkles turn into waves of shared light.',
    interactions: 'Hold still and fireflies gather around you · click to make them all flash and start syncing again',
    accent: '#bef264',
  },
  {
    id: 'rainy-city',
    name: 'Rainy City',
    short: 'City',
    tagline: 'City lights through a rain-streaked window',
    description: 'Rain falls past lit windows while drops bead on the glass, grow and slide down. Lightning flickers now and then.',
    interactions: 'Drag across the glass to wipe it · click to call lightning',
    accent: '#93c5fd',
  },
];

export const worldMeta = (id: string): EnvironmentMeta => WORLDS.find((w) => w.id === id) ?? WORLDS[0];
