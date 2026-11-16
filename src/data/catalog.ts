import { AnimalId, EnvironmentId, FlowId, SceneKind, SceneMeta, WorldId } from '../types/environment';

/**
 * Every scene Pixora knows about. `ready: false` entries are planned and stay
 * hidden from pickers and rotation until they ship.
 */
export const CATALOG: SceneMeta[] = [
  // ───────────── Worlds ─────────────
  {
    id: 'underwater', kind: 'world', name: 'Deep Ocean', short: 'Ocean', accent: '#5eead4', ready: true,
    tagline: 'Light shafts, kelp, coral and bubbles',
    description: 'A calm deep-water scene: light from above, swaying kelp, coral on the seabed and rising bubbles.',
    interactions: 'Move to stir a wake · click for a bubble burst',
    traits: { water: 'underwater', sky: false, ground: true, flowers: false, season: 'any', time: 'any' },
  },
  {
    id: 'ripples', kind: 'world', name: 'Moonlit Lake', short: 'Lake', accent: '#93c5fd', ready: true,
    tagline: 'Ripples, a moon path, petals and passing rain',
    description: 'A wave simulation lit by the moon, a shimmering moon path, pines on the shore, petals and fireflies.',
    interactions: 'Drag across the water for a wake · click for a drop · click the sky to call the rain',
    traits: { water: 'surface', sky: true, ground: false, flowers: false, season: 'warm', time: 'night' },
  },
  {
    id: 'frog-pond', kind: 'world', name: 'Lily Pond', short: 'Pond', accent: '#86efac', ready: true,
    tagline: 'Lily pads, lotus flowers and reeds from above',
    description: 'A still pond seen from above with lily pads, lotus flowers and reeds framing the edges.',
    interactions: 'Click the water for a ripple · drag to leave a wake',
    traits: { water: 'surface', sky: false, ground: false, flowers: true, season: 'warm', time: 'any' },
  },
  {
    id: 'cosmic-aurora', kind: 'world', name: 'Northern Lights', short: 'Aurora', accent: '#c4b5fd', ready: true,
    tagline: 'Aurora curtains over mountains and a still lake',
    description: 'Aurora curtains ripple over snowy ridges, mirrored in a lake, with stars and meteors.',
    interactions: 'Move the pointer to push the curtains · click for a flare and a shooting star',
    traits: { water: 'shore', sky: true, ground: true, flowers: false, season: 'cold', time: 'night' },
  },
  {
    id: 'campfire', kind: 'world', name: 'Campfire', short: 'Fire', accent: '#fb923c', ready: true,
    tagline: 'A crackling fire under the stars',
    description: 'Flames from a heat simulation, sparks drifting up and firelight on the trees around the clearing.',
    interactions: 'Move to either side to lean the flames · click to send up sparks',
    traits: { water: 'none', sky: true, ground: true, flowers: false, season: 'any', time: 'night' },
  },
  {
    id: 'zen-garden', kind: 'world', name: 'Zen Garden', short: 'Zen', accent: '#d6c7a1', ready: true,
    tagline: 'Raked sand, mossy stones, drifting petals',
    description: 'Grooves run in quiet rows and ring each stone. Whatever you rake settles back over a minute or so.',
    interactions: 'Hold and drag to rake the sand · click to press rings around a point',
    traits: { water: 'none', sky: false, ground: true, flowers: true, season: 'any', time: 'any' },
  },
  {
    id: 'meadow', kind: 'world', name: 'Dusk Meadow', short: 'Meadow', accent: '#f9a8d4', ready: true,
    tagline: 'Rolling hills, a low sun, flowers and grass',
    description: 'Hills under a dusk sky, a low sun, flowers on stems and grass that sways and parts around you.',
    interactions: 'Brush the grass to part it · click to scatter petals',
    traits: { water: 'none', sky: true, ground: true, flowers: true, season: 'warm', time: 'dusk' },
  },
  {
    id: 'winter-pines', kind: 'world', name: 'Winter Pines', short: 'Snow', accent: '#cbd5e1', ready: true,
    tagline: 'Snow falling on pine ridges under the moon',
    description: 'Snow falls in three depths and gathers on the ground between snowy pines.',
    interactions: 'Sweep the pointer to blow gusts · click for a strong gust',
    traits: { water: 'none', sky: true, ground: true, flowers: false, season: 'cold', time: 'night' },
  },
  {
    id: 'firefly-forest', kind: 'world', name: 'Night Forest', short: 'Forest', accent: '#bef264', ready: true,
    tagline: 'Tall trunks, ferns, mist and moonlight',
    description: 'A quiet night forest of tall trunks, ferns, drifting mist and shafts of moonlight.',
    interactions: 'Move to stir the mist · click for a gust through the ferns',
    traits: { water: 'none', sky: false, ground: true, flowers: false, season: 'warm', time: 'night' },
  },
  {
    id: 'rainy-city', kind: 'world', name: 'Rainy City', short: 'City', accent: '#93c5fd', ready: true,
    tagline: 'City lights through a rain-streaked window',
    description: 'Rain falls past lit windows while drops bead on the glass, grow and slide down.',
    interactions: 'Drag across the glass to wipe it · click to call lightning',
    traits: { water: 'none', sky: true, ground: false, flowers: false, season: 'cold', time: 'night' },
  },

  // ───────────── Animals ─────────────
  {
    id: 'fish', kind: 'animal', name: 'Fish School', short: 'Fish', accent: '#5eead4', ready: true,
    tagline: 'Schools of little fish at three depths',
    description: 'Flocking fish that school together, scatter from a fast pointer and burst apart on a click.',
    interactions: 'Move fast and they scatter · click to startle the school',
    needs: { water: ['underwater'], why: 'Fish need to be underwater' },
  },
  {
    id: 'fireflies', kind: 'animal', name: 'Fireflies', short: 'Fireflies', accent: '#bef264', ready: true,
    tagline: 'Fireflies that learn to flash together',
    description: 'Each firefly keeps its own rhythm but listens to the others, so random twinkles become waves of shared light.',
    interactions: 'Hold still and they gather around you · click to flash them all and restart the sync',
    needs: { time: ['night', 'dusk'], season: ['warm', 'any'], water: ['none', 'surface', 'shore'], why: 'Fireflies need a warm night' },
  },
  {
    id: 'butterflies', kind: 'animal', name: 'Butterflies', short: 'Butterflies', accent: '#f9a8d4', ready: true,
    tagline: 'Butterflies drifting from flower to flower',
    description: 'Butterflies drift along with a fluttery, bobbing flight and the odd glide, in five wing patterns.',
    interactions: 'Hold still and they come close · move fast and they scatter · click to send nearby ones spiralling up',
    needs: { flowers: true, season: ['warm', 'any'], time: ['day', 'dusk', 'any'], water: ['none', 'shore'], why: 'Butterflies need flowers on a warm day' },
  },
  {
    id: 'koi', kind: 'animal', name: 'Koi', short: 'Koi', accent: '#fb923c', ready: true,
    tagline: 'Koi gliding below the surface',
    description: 'Koi in five classic varieties meander lazily, bodies bending and tails swishing as they turn.',
    interactions: 'Click to drop food: koi in range turn and swim over · a fast pointer makes them veer away',
    needs: { water: ['surface'], why: 'Koi need open water seen from above' },
  },
  {
    id: 'jellyfish', kind: 'animal', name: 'Jellyfish', short: 'Jellies', accent: '#f0abfc', ready: true,
    tagline: 'Pulsing jellyfish with trailing tentacles',
    description: 'Jellyfish pulse their way upward, trailing soft tentacles that sway behind them.',
    interactions: 'The pointer gently pushes them aside · click to make nearby ones pulse hard and shoot away',
    needs: { water: ['underwater'], why: 'Jellyfish need to be underwater' },
  },
  {
    id: 'dragonflies', kind: 'animal', name: 'Dragonflies', short: 'Dragonflies', accent: '#38bdf8', ready: true,
    tagline: 'Dragonflies darting and hovering',
    description: 'Dragonflies dart, hover with a jitter, then dart again, wings shimmering.',
    interactions: 'Get close and they dart away · click to scatter them',
    needs: { water: ['surface', 'shore'], time: ['day', 'dusk', 'any'], why: 'Dragonflies need water in daylight' },
  },
  {
    id: 'frogs', kind: 'animal', name: 'Frogs', short: 'Frogs', accent: '#a3e635', ready: true,
    tagline: 'Frogs that sit, blink and leap',
    description: 'Frogs sit, breathe and blink, then leap to a clear spot, landing with a splash ring.',
    interactions: 'Come close and a frog leaps away · they turn to watch your pointer · click to startle them all',
    needs: { water: ['surface', 'shore'], season: ['warm', 'any'], why: 'Frogs need water and warmth' },
  },
  {
    id: 'cranes', kind: 'animal', name: 'Cranes', short: 'Cranes', accent: '#e2e8f0', ready: true,
    tagline: 'Cranes flying in slow formation',
    description: 'Cranes cross in slow V-shaped skeins with deep wingbeats, red crowns and trailing legs.',
    interactions: 'Click to startle them into faster wingbeats and a climb',
    needs: { sky: true, why: 'Cranes need open sky' },
  },
  {
    id: 'crabs', kind: 'animal', name: 'Crabs', short: 'Crabs', accent: '#f87171', ready: true,
    tagline: 'Crabs scuttling sideways',
    description: 'Crabs scuttle sideways along the bottom, pause to wave their claws, and tuck in when shy.',
    interactions: 'Come close and they tuck in · click to make them scuttle away',
    needs: { water: ['underwater', 'shore'], ground: true, why: 'Crabs need a seabed or shore' },
  },
  {
    id: 'starlings', kind: 'animal', name: 'Starlings', short: 'Starlings', accent: '#a5b4fc', ready: true,
    tagline: 'A murmuration bending across the sky',
    description: 'A murmuration of hundreds of starlings stretching, folding and turning as one cloud.',
    interactions: 'The flock bends around your pointer · click to send a shock wave through it',
    needs: { sky: true, time: ['day', 'dusk', 'any'], water: ['none', 'shore', 'surface'], why: 'Starlings need open sky before dark' },
  },

  // ───────────── Flows ─────────────
  {
    id: 'curl', kind: 'flow', name: 'Curl Currents', short: 'Curl', accent: '#f9a8d4', ready: true,
    tagline: 'Particles tracing swirling curl-noise currents',
    description: 'Particles follow a smooth, divergence-free flow and leave fine dot trails. The palette drifts between moods.',
    interactions: 'Hover to stir a vortex · click to send out a shockwave',
  },
  {
    id: 'magnetic', kind: 'flow', name: 'Magnetic Lines', short: 'Magnetic', accent: '#93c5fd', ready: true,
    tagline: 'Field lines between drifting poles',
    description: 'Dots leave the + poles and follow the field into the − poles, tracing living magnetic field lines.',
    interactions: 'Your pointer is a pole · click to flip its charge',
  },
  {
    id: 'wind', kind: 'flow', name: 'Wind Map', short: 'Wind', accent: '#a7f3d0', ready: true,
    tagline: 'Streamlines over drifting weather',
    description: 'A weather-map wind field: a wavy westerly with drifting highs (H) and lows (L) spinning the air.',
    interactions: 'Move fast to stir up a gust · click to spawn a storm',
  },
  {
    id: 'attractor', kind: 'flow', name: 'Strange Attractor', short: 'Attractor', accent: '#fcd34d', ready: true,
    tagline: 'A slowly morphing strange attractor',
    description: 'A Clifford attractor drawn from thousands of points a frame; its parameters drift so the shape breathes and morphs.',
    interactions: 'Move the pointer to bend its shape · click to glide to a new one',
  },
  {
    id: 'contours', kind: 'flow', name: 'Contours', short: 'Contours', accent: '#fdba74', ready: true,
    tagline: 'Moving topographic lines',
    description: 'A slowly shifting landscape drawn as one-dot-thin contour lines, with brighter index contours.',
    interactions: 'Your pointer raises a hill · click to leave one that slowly settles',
  },
  {
    id: 'vortex', kind: 'flow', name: 'Vortex Street', short: 'Vortex', accent: '#c4b5fd', ready: true,
    tagline: 'Swirls shed behind posts and your pointer',
    description: 'A current flows past round posts that shed swirls alternately from each side: a Kármán vortex street.',
    interactions: 'Move the pointer to shed swirls · click to plant a new post',
  },
];

export const KIND_LABEL: Record<SceneKind, string> = { world: 'Worlds', animal: 'Animals', flow: 'Flows' };

export function sceneMeta(id: string): SceneMeta {
  return CATALOG.find((s) => s.id === id) ?? CATALOG[0];
}

/** Ready scenes of one kind, in catalog order. */
export function scenesOf(kind: 'world'): (SceneMeta & { id: WorldId })[];
export function scenesOf(kind: 'animal'): (SceneMeta & { id: AnimalId })[];
export function scenesOf(kind: 'flow'): (SceneMeta & { id: FlowId })[];
export function scenesOf(kind: SceneKind): SceneMeta[];
export function scenesOf(kind: SceneKind): SceneMeta[] {
  return CATALOG.filter((s) => s.kind === kind && s.ready);
}

export const READY_IDS = (kind: SceneKind): EnvironmentId[] => scenesOf(kind).map((s) => s.id);

// ───────────── Layering rules ─────────────

export interface Fit {
  ok: boolean;
  reason: string;
}

/** Can this animal live in this world? Checks each need against the world's traits. */
export function fits(worldId: EnvironmentId, animalId: EnvironmentId): Fit {
  const w = sceneMeta(worldId).traits;
  const a = sceneMeta(animalId).needs;
  if (!w || !a) return { ok: false, reason: 'Not a world/animal pair' };
  const ok =
    (!a.water || a.water.includes(w.water)) &&
    (a.sky === undefined || a.sky === w.sky) &&
    (a.ground === undefined || a.ground === w.ground) &&
    (a.flowers === undefined || a.flowers === w.flowers) &&
    (!a.season || a.season.includes(w.season) || w.season === 'any') &&
    (!a.time || a.time.includes(w.time) || w.time === 'any');
  return { ok, reason: ok ? '' : a.why };
}

/** Animals that may be layered over a world. */
export function animalsFor(worldId: EnvironmentId): AnimalId[] {
  return scenesOf('animal')
    .filter((a) => fits(worldId, a.id).ok)
    .map((a) => a.id);
}
