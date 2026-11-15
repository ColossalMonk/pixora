import { RenderGrid } from '../engine/core/RenderGrid';
import { MouseState } from './engine';

export type EnvironmentId =
  | 'underwater'
  | 'ripples'
  | 'frog-pond'
  | 'cosmic-aurora'
  | 'abstract-flow';

export interface EnvironmentMeta {
  id: EnvironmentId;
  name: string;
  tagline: string;
  description: string;
  iconName: string;
  defaultStyle: string;
  defaultTheme: string;
}

export interface IEnvironment {
  readonly id: EnvironmentId;
  init(grid: RenderGrid): void;
  update(deltaTime: number, mouse: MouseState, grid: RenderGrid): void;
  render(grid: RenderGrid): void;
  resize(width: number, height: number, grid: RenderGrid): void;
  destroy?(): void;
}
