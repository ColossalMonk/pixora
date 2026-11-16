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

  /**
   * Moves a feature (centre x,y, radius r) out of the UI box, pushing it away
   * from the box centre, so big scenery never sits behind the clock or search.
   */
  protected clearOfUI(x: number, y: number, r: number, safe: WorldContext['safe'], width: number, height: number): [number, number] {
    if (!safe) return [x, y];
    const pad = r + 24;
    const inside = (px: number, py: number) => px > safe.x - pad && px < safe.x + safe.w + pad && py > safe.y - pad && py < safe.y + safe.h + pad;
    if (!inside(x, y)) return [x, y];
    const cx = safe.x + safe.w / 2;
    const cy = safe.y + safe.h / 2;
    let dx = x - cx;
    let dy = (y - cy) * (safe.w / Math.max(1, safe.h));
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    let px = x;
    let py = y;
    for (let k = 0; k < 60 && inside(px, py); k++) {
      px += dx * 12;
      py += dy * 12;
    }
    return [Math.max(r, Math.min(width - r, px)), Math.max(r, Math.min(height - r, py))];
  }

  /** Per-cell scratch buffer helper. */
  protected ensure(buf: Float32Array<ArrayBuffer>, size: number): Float32Array<ArrayBuffer> {
    return buf.length === size ? buf : new Float32Array(size);
  }
}
