import { EnvironmentId, IEnvironment, WorldContext } from '../../types/environment';
import { ResolvedStyle } from '../../types/engine';

export abstract class BaseEnvironment implements IEnvironment {
  public abstract readonly id: EnvironmentId;
  public abstract readonly preferredStyle: ResolvedStyle;
  public abstract readonly backdrop: number[];
  /** Simulation clock in seconds. */
  protected time = 0;

  public abstract init(ctx: WorldContext): void;
  public abstract update(dt: number, ctx: WorldContext): void;
  public abstract render(ctx: WorldContext): void;

  /** Re-seed on resize so populations and layouts match the new viewport. */
  public resize(ctx: WorldContext): void {
    const t = this.time;
    this.init(ctx);
    this.time = t;
  }

  public destroy(): void {}

  /** Per-cell scratch buffer helper. */
  protected ensure(buf: Float32Array<ArrayBuffer>, size: number): Float32Array<ArrayBuffer> {
    return buf.length === size ? buf : new Float32Array(size);
  }
}
