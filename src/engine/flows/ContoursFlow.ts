import { FlowBase, Mood } from './FlowBase';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { hex } from '../core/Color';

interface Hill { x: number; y: number; h: number; r: number; }

/**
 * Moving topographic contour lines. A slowly evolving height field is
 * evaluated per cell, sampled bilinearly at Braille-dot resolution, and a dot
 * lights wherever the contour band changes between neighbours — so lines stay
 * one dot thin. Every fifth line is an index contour, drawn brighter. The
 * pointer raises a hill; a click leaves one that slowly settles.
 */
export class ContoursFlow extends FlowBase {
  public readonly id = 'contours';
  public readonly backdrop = [hex('#0d0a07'), hex('#140f0a'), hex('#100c08'), hex('#090604')];
  protected moods: Mood[] = [
    [[0, hex('#422006')], [0.4, hex('#d97706')], [0.75, hex('#fcd34d')], [1, hex('#fffbeb')]],
    [[0, hex('#14532d')], [0.4, hex('#65a30d')], [0.75, hex('#d9f99d')], [1, hex('#ffffff')]],
    [[0, hex('#4c0519')], [0.4, hex('#e11d48')], [0.75, hex('#fda4af')], [1, hex('#fff1f2')]],
  ];
  private noise = new SimplexNoise(17);
  private height = new Float32Array(0);
  private hills: Hill[] = [];
  private levels = 14;
  private frame = 0;

  public init(ctx: WorldContext): void {
    this.setupInk(ctx);
    this.height = new Float32Array((ctx.grid.cols + 1) * (ctx.grid.rows + 1));
    this.hills = [];
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, grid } = ctx;
    for (const c of input.clicks) {
      this.hills.push({ x: c.x / grid.cellWidth, y: c.y / grid.cellHeight / grid.aspect, h: 0.55, r: 9 });
      if (this.hills.length > 6) this.hills.shift();
    }
    for (const h of this.hills) h.h *= Math.exp(-dt * 0.05);
    this.hills = this.hills.filter((h) => h.h > 0.03);
  }

  public render(ctx: WorldContext): void {
    const { grid } = ctx;
    const W = grid.cols + 1;
    const H = grid.rows + 1;
    const t = this.time * 0.025;
    const ptr = this.pointer(ctx);
    const hills = ptr ? [...this.hills, { x: ptr[0], y: ptr[1], h: 0.35 * ctx.input.intensity, r: 7 }] : this.hills;
    // Height per cell corner (isotropic coordinates); recomputed every third frame, it moves slowly.
    if (this.frame++ % 3 === 0) for (let r = 0; r < H; r++) {
      const yi = r / grid.aspect;
      for (let c = 0; c < W; c++) {
        let v = this.noise.noise3D(c * 0.022, yi * 0.022, t) * 0.55 + this.noise.noise3D(c * 0.06, yi * 0.06, t * 1.7 + 5) * 0.18;
        for (const h of hills) {
          const dx = c - h.x;
          const dy = yi - h.y;
          v += h.h * Math.exp(-(dx * dx + dy * dy) / (h.r * h.r));
        }
        this.height[r * W + c] = v * 0.5 + 0.5;
      }
    }
    // Contour dots: a dot lights where the band index changes toward its right/down
    // neighbour. Only cells whose corners straddle a band boundary can hold a contour,
    // so dots are only examined there (most of the screen is skipped).
    this.dots.fill(0);
    const N = this.levels;
    const dw = this.dotW;
    const hgt = this.height;
    const valueAt = (x: number, y: number): number => {
      const fx = (x + 0.5) / 2;
      const fy = (y + 0.5) / 4;
      const c0 = Math.min(W - 2, Math.floor(fx));
      const r0 = Math.min(H - 2, Math.floor(fy));
      const tx = fx - c0;
      const ty = fy - r0;
      const i = r0 * W + c0;
      const top = hgt[i] + (hgt[i + 1] - hgt[i]) * tx;
      const bot = hgt[i + W] + (hgt[i + W + 1] - hgt[i + W]) * tx;
      return top + (bot - top) * ty;
    };
    for (let r = 0; r < H - 1; r++) {
      for (let c = 0; c < W - 1; c++) {
        const i = r * W + c;
        const b0 = Math.floor(hgt[i] * N);
        // Include the next corners too, since dots compare with their right/down neighbour.
        const c2 = Math.min(W - 1, c + 2);
        const r2 = Math.min(H - 1, r + 2);
        let mixed = false;
        for (let rr = r; rr <= r2 && !mixed; rr++) for (let cc = c; cc <= c2; cc++) if (Math.floor(hgt[rr * W + cc] * N) !== b0) { mixed = true; break; }
        if (!mixed) continue;
        for (let dy = 0; dy < 4; dy++) {
          const y = r * 4 + dy;
          for (let dx = 0; dx < 2; dx++) {
            const x = c * 2 + dx;
            const v = valueAt(x, y);
            const band = Math.floor(v * N);
            if (Math.floor(valueAt(x + 1, y) * N) !== band || Math.floor(valueAt(x, y + 1) * N) !== band) {
              this.dots[y * dw + x] = band % 5 === 0 ? 0.75 + v * 0.25 : 0.25 + v * 0.5;
            }
          }
        }
      }
    }
    this.renderInk(ctx, 0.1, 0.2, 0.8);
  }
}
