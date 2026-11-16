import type { RenderGrid } from '../engine/core/RenderGrid';
import type { InputState, ResolvedStyle } from './engine';

export type EnvironmentId =
  | 'underwater'
  | 'ripples'
  | 'frog-pond'
  | 'cosmic-aurora'
  | 'abstract-flow'
  | 'campfire'
  | 'zen-garden'
  | 'meadow'
  | 'winter-pines'
  | 'firefly-forest'
  | 'rainy-city';

export interface EnvironmentMeta {
  id: EnvironmentId;
  name: string;
  short: string;
  tagline: string;
  description: string;
  interactions: string;
  accent: string;
}

/** Everything a world needs each step. */
export interface WorldContext {
  grid: RenderGrid;
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  input: InputState;
  /** Style for field layers (water, aurora, trails…). */
  style: ResolvedStyle;
  /** True when the user left Character Style on Auto — worlds may use bespoke glyph ramps. */
  auto: boolean;
  /** 0.5 on weak hardware, 1 normally — worlds scale populations by it. */
  quality: number;
}

export interface IEnvironment {
  readonly id: EnvironmentId;
  /** Style used when the user leaves Character Style on Auto. */
  readonly preferredStyle: ResolvedStyle;
  /** Vertical background gradient, top → bottom, as packed RGB. */
  readonly backdrop: number[];
  init(ctx: WorldContext): void;
  /** Called after the grid changes size. Default behaviour re-seeds the world. */
  resize(ctx: WorldContext): void;
  /** Fixed-step simulation; dt in seconds (already scaled by animation speed). */
  update(dt: number, ctx: WorldContext): void;
  render(ctx: WorldContext): void;
  destroy?(): void;
}
