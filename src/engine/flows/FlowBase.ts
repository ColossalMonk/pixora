import { BaseEnvironment } from '../environments/BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { Layer } from '../core/RenderGrid';
import { gradientLUT, mix } from '../core/Color';
import { renderBrailleDots, renderField } from '../draw/Field';

export type Mood = [number, number][];

/**
 * Shared machinery for Flows:
 * - an ink buffer at Braille-dot resolution ((cols·2) × (rows·4)) that fades,
 *   so trails stay one dot thin;
 * - a particle pool advected through `velocityAt` in isotropic cell units
 *   (x in columns, y in rows ÷ aspect, so circles stay round);
 * - a palette that drifts slowly between moods;
 * - rendering as Braille dots, or downsampled to cells for text styles.
 */
export abstract class FlowBase extends BaseEnvironment {
  public readonly preferredStyle = 'braille' as const;

  protected dots = new Float32Array(0);
  protected dotW = 0;
  protected dotH = 0;
  private cellInk = new Float32Array(0);

  protected count = 0;
  protected px = new Float32Array(0);
  protected py = new Float32Array(0); // isotropic y
  protected vx = new Float32Array(0);
  protected vy = new Float32Array(0);
  protected age = new Float32Array(0);
  protected life = new Float32Array(0);

  protected lut = gradientLUT([[0, 0x222222], [1, 0xffffff]]);
  private lutTime = -1;
  protected abstract moods: Mood[];
  /** Seconds per mood. */
  protected moodPeriod = 45;
  /** Trail fade rate (1/s). */
  protected fade = 0.8;
  /** Ink added per dot crossed. */
  protected ink = 0.22;
  /** Columns, isotropic rows. */
  protected cols = 1;
  protected rowsIso = 1;
  protected aspect = 1;

  protected setupInk(ctx: WorldContext): void {
    const { grid } = ctx;
    this.dotW = grid.cols * 2;
    this.dotH = grid.rows * 4;
    this.dots = new Float32Array(this.dotW * this.dotH);
    this.cellInk = new Float32Array(grid.size);
    this.cols = grid.cols;
    this.aspect = grid.aspect;
    this.rowsIso = grid.rows / grid.aspect;
  }

  protected setupParticles(n: number): void {
    this.count = n;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    for (let i = 0; i < n; i++) this.spawn(i, true);
  }

  /** Where a particle starts. Default: anywhere. */
  protected spawn(i: number, randomAge: boolean): void {
    this.px[i] = Math.random() * this.cols;
    this.py[i] = Math.random() * this.rowsIso;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.life[i] = 3 + Math.random() * 6;
    this.age[i] = randomAge ? Math.random() * this.life[i] : 0;
  }

  /** Velocity field in isotropic cell units per second. Flows that use particles override this. */
  protected velocityAt(_x: number, _y: number, _ctx: WorldContext): [number, number] {
    return [0, 0];
  }

  /** Should this particle be retired early (e.g. it reached a sink)? */
  protected retire(_i: number): boolean {
    return false;
  }

  /** Moves every particle through the field, inking its path. */
  protected advect(dt: number, ctx: WorldContext, response = 4): void {
    const k = 1 - Math.exp(-dt * response);
    for (let i = 0; i < this.count; i++) {
      const x = this.px[i];
      const y = this.py[i];
      const [tx, ty] = this.velocityAt(x, y, ctx);
      this.vx[i] += (tx - this.vx[i]) * k;
      this.vy[i] += (ty - this.vy[i]) * k;
      const nx = x + this.vx[i] * dt;
      const ny = y + this.vy[i] * dt;
      this.deposit(x, y * this.aspect, nx, ny * this.aspect);
      this.px[i] = nx;
      this.py[i] = ny;
      this.age[i] += dt;
      if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rowsIso || this.age[i] > this.life[i] || this.retire(i)) this.spawn(i, false);
    }
  }

  /** Inks a segment between two points in cell coordinates (x cols, y rows). */
  protected deposit(x0: number, y0: number, x1: number, y1: number, amount = this.ink): void {
    const ax = x0 * 2, ay = y0 * 4, bx = x1 * 2, by = y1 * 4;
    const steps = Math.min(16, Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)))));
    const w = this.dotW;
    const h = this.dotH;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const dx = (ax + (bx - ax) * t) | 0;
      const dy = (ay + (by - ay) * t) | 0;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      const i = dy * w + dx;
      const v = this.dots[i] + amount;
      this.dots[i] = v > 1.4 ? 1.4 : v;
    }
  }

  /** Inks one dot (dot coordinates). */
  protected plot(dx: number, dy: number, amount: number): void {
    dx |= 0;
    dy |= 0;
    if (dx < 0 || dy < 0 || dx >= this.dotW || dy >= this.dotH) return;
    const i = dy * this.dotW + dx;
    const v = this.dots[i] + amount;
    this.dots[i] = v > 1.4 ? 1.4 : v;
  }

  protected fadeInk(dt: number): void {
    const k = Math.exp(-dt * this.fade);
    const d = this.dots;
    for (let i = 0; i < d.length; i++) d[i] = d[i] > 0.002 ? d[i] * k : 0;
  }

  /** Rebuilds the palette a few times a second, crossfading between moods. */
  protected updatePalette(): void {
    if (this.time - this.lutTime < 0.25 && this.lutTime >= 0) return;
    this.lutTime = this.time;
    const phase = (this.time / this.moodPeriod) % this.moods.length;
    const a = Math.floor(phase);
    const f = phase - a;
    const m0 = this.moods[a];
    const m1 = this.moods[(a + 1) % this.moods.length];
    const e = f * f * (3 - 2 * f);
    this.lut = gradientLUT(m0.map(([p, c], i) => [p, mix(c, m1[i][1], e)] as [number, number]));
  }

  protected renderInk(ctx: WorldContext, threshold = 0.1, minAlpha = 0.3, alphaGain = 0.7): void {
    const { grid, style } = ctx;
    this.updatePalette();
    if (style === 'braille') {
      renderBrailleDots(grid, this.dots, { lut: this.lut, layer: Layer.SKY, threshold, minAlpha, alphaGain });
      return;
    }
    const cols = grid.cols;
    const w = this.dotW;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        for (let dy = 0; dy < 4; dy++) {
          const o = (r * 4 + dy) * w + c * 2;
          sum += this.dots[o] + this.dots[o + 1];
        }
        this.cellInk[r * cols + c] = 1 - Math.exp(-sum * 0.6);
      }
    }
    renderField(grid, this.cellInk, { style, lut: this.lut, layer: Layer.SKY, threshold: 0.06, minAlpha: 0.15, alphaGain: 0.85 });
  }

  /** Pointer in isotropic cell units (or null). */
  protected pointer(ctx: WorldContext): [number, number] | null {
    const { input, grid } = ctx;
    if (!input.active) return null;
    return [input.x / grid.cellWidth, input.y / grid.cellHeight / grid.aspect];
  }
}
