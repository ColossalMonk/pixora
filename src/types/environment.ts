import type { RenderGrid } from '../engine/core/RenderGrid';
import type { InputState, ResolvedStyle } from './engine';
import type { SkyState, WeatherKind } from '../engine/core/Sky';

/** The three things a new tab can show. */
export type SceneKind = 'world' | 'animal' | 'flow';

export type WorldId =
  | 'underwater'
  | 'ripples'
  | 'frog-pond'
  | 'cosmic-aurora'
  | 'campfire'
  | 'zen-garden'
  | 'meadow'
  | 'winter-pines'
  | 'firefly-forest'
  | 'rainy-city';

export type AnimalId =
  | 'butterflies'
  | 'koi'
  | 'jellyfish'
  | 'dragonflies'
  | 'frogs'
  | 'cranes'
  | 'crabs'
  | 'fireflies'
  | 'fish'
  | 'starlings';

export type FlowId = 'curl' | 'magnetic' | 'wind' | 'attractor' | 'contours' | 'vortex';

/** Any renderable scene. */
export type EnvironmentId = WorldId | AnimalId | FlowId;

/** What a world offers living things (used by the layering rules). */
export interface WorldTraits {
  /** 'surface' = open water seen from above, 'underwater' = inside the water, 'shore' = water edge. */
  water: 'none' | 'surface' | 'underwater' | 'shore';
  sky: boolean;
  ground: boolean;
  flowers: boolean;
  season: 'warm' | 'cold' | 'any';
  time: 'night' | 'dusk' | 'day' | 'any';
}

/** What an animal needs from a world to be layered onto it. */
export interface AnimalNeeds {
  water?: WorldTraits['water'][];
  sky?: boolean;
  ground?: boolean;
  flowers?: boolean;
  season?: WorldTraits['season'][];
  time?: WorldTraits['time'][];
  /** Human reason shown when a world doesn't fit. */
  why: string;
}

export interface SceneMeta {
  id: EnvironmentId;
  kind: SceneKind;
  name: string;
  short: string;
  tagline: string;
  description: string;
  interactions: string;
  accent: string;
  /** Built and selectable. Planned scenes stay hidden until they ship. */
  ready: boolean;
  traits?: WorldTraits;
  needs?: AnimalNeeds;
}

/** @deprecated kept for older imports. */
export type EnvironmentMeta = SceneMeta;

/**
 * Where an animal may live inside the current scene, in CSS pixels. A world
 * supplies this when an animal is layered over it; alone, an animal gets the
 * whole screen.
 */
export interface Habitat {
  /** Region the animal should stay within. */
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Y of a water surface (for swimmers / splashes), if any. */
  waterY?: number;
  /** Y of the ground line (for walkers), if any. */
  groundY?: number;
  /** Bottom of the open sky (for flyers), if the world has a horizon. */
  skyBottom?: number;
}

/** Where in a world an animal lives. */
export type Zone = 'sky' | 'water' | 'ground' | 'any';

/** Everything a scene needs each step. */
export interface WorldContext {
  grid: RenderGrid;
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  input: InputState;
  /** Style for field layers (water, aurora, trails…). */
  style: ResolvedStyle;
  /** True when the user left Character Style on Auto — scenes may use bespoke glyph ramps. */
  auto: boolean;
  /** 0.5 on weak hardware, 1 normally — scenes scale populations by it. */
  quality: number;
  /** Space available to animals (whole screen unless layered over a world). */
  habitat: Habitat;
  /** True when this scene is drawn as a layer on top of a world. */
  layered: boolean;
  /** Background colour far creatures fade toward (packed RGB). */
  bg: number;
  /** Light right now (time of day). Worlds that follow the clock adapt to it. */
  sky: SkyState;
  /** Live weather where the user is ('clear' when unknown or turned off). */
  weather: WeatherKind;
  /** Box of the clock / search / shortcuts; big features should stay clear of it. */
  safe: { x: number; y: number; w: number; h: number } | null;
}

export interface IEnvironment {
  readonly id: EnvironmentId;
  /** Style used when the user leaves Character Style on Auto. */
  readonly preferredStyle: ResolvedStyle;
  /** Vertical background gradient, top → bottom, as packed RGB. */
  readonly backdrop: number[];
  init(ctx: WorldContext): void;
  /** Called after the grid changes size. Default behaviour re-seeds the scene. */
  resize(ctx: WorldContext): void;
  /** Fixed-step simulation; dt in seconds (already scaled by animation speed). */
  update(dt: number, ctx: WorldContext): void;
  render(ctx: WorldContext): void;
  /** Worlds: the space they offer an animal layered on top. */
  habitat?(width: number, height: number): Habitat;
  /** Worlds: shift with the local time of day (backdrop + colour grade). */
  readonly followsClock?: boolean;
  /** Worlds: daytime backdrop stops (blended with `backdrop` by light). */
  readonly backdropDay?: number[];
  /** Animals: which part of a world they live in when layered. */
  readonly zone?: Zone;
  /** Animals: apply Tweaks-panel values. */
  tune?(values: Record<string, number> | undefined): void;
  destroy?(): void;
}
