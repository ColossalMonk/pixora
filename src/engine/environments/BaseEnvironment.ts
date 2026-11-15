import { IEnvironment, EnvironmentId } from '../../types/environment';
import { MouseState } from '../../types/engine';
import { RenderGrid } from '../core/RenderGrid';

export abstract class BaseEnvironment implements IEnvironment {
  public abstract readonly id: EnvironmentId;
  protected width: number = 800;
  protected height: number = 600;
  protected time: number = 0;

  public init(grid: RenderGrid): void {
    this.width = grid.cols * grid.cellWidth;
    this.height = grid.rows * grid.cellHeight;
    this.time = 0;
  }

  public abstract update(deltaTime: number, mouse: MouseState, grid: RenderGrid): void;

  public abstract render(grid: RenderGrid): void;

  public resize(width: number, height: number, _grid: RenderGrid): void {
    this.width = width;
    this.height = height;
  }

  public destroy(): void {
    // Optional cleanup
  }
}
