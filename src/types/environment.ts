import type { RenderGrid } from '../engine/core/RenderGrid';
import type { InputState, ResolvedStyle } from './engine';

export type AnimalId =
  | 'butterflies'
  | 'koi'
  | 'jellyfish'
  | 'dragonflies'
  | 'frogs'
  | 'cranes'
  | 'crabs';

export type CustomSlotId = 'custom-1' | 'custom-2' | 'custom-3';

export type SceneId = AnimalId | CustomSlotId;

/** Any renderable scene identifier (backward compatibility alias). */
export type EnvironmentId = SceneId;

export type SceneKind = 'animal' | 'custom';

export type Zone = 'sky' | 'water' | 'ground' | 'any';

export interface SceneMeta {
  id: SceneId;
  kind: SceneKind;
  name: string;
  short: string;
  tagline: string;
  description: string;
  interactions: string;
  accent: string;
  slotIndex?: number;
}

export interface Habitat {
  top: number;
  bottom: number;
  left: number;
  right: number;
  waterY?: number;
  groundY?: number;
  skyBottom?: number;
}

export interface WorldContext {
  width: number;
  height: number;
  grid: RenderGrid;
  input: InputState;
  style: ResolvedStyle;
  auto: boolean;
  habitat: Habitat;
  time: number;
  quality: number;
  bg: number;
  safe?: { x: number; y: number; w: number; h: number } | null;
  layered?: boolean;
  sky?: any;
  weather?: any;
}

export interface IEnvironment {
  readonly id: EnvironmentId;
  readonly preferredStyle: ResolvedStyle;
  readonly backdrop: number[];
  readonly backdropDay?: number[];
  readonly followsClock?: boolean;
  readonly zone?: Zone;
  init(ctx: WorldContext): void;
  resize(ctx: WorldContext): void;
  update(dt: number, ctx: WorldContext): void;
  render(ctx: WorldContext): void;
  isIdle?(): boolean;
  idle?(): boolean;
  destroy?(): void;
  habitat?(width: number, height: number): Habitat;
  tune?(values: Record<string, number> | undefined): void;
}
