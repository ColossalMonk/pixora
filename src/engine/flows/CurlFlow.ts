import { BaseEnvironment } from '../environments/BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer } from '../core/RenderGrid';
import { gradientLUT, hex } from '../core/Color';
import { renderField, renderBrailleDots } from '../draw/Field';
import { ARROWS } from '../core/Charsets';

/**
 * Particles ride a divergence-free curl-noise field and deposit ink into a
 * fading trail field. Trails render with the active style (Braille by
 * default: silky 2×4 sub-cell lines); a sparse subset shows direction arrows.
 * The palette slowly drifts between moods.
 */
const MOODS: [number, number][][] = [
  [[0, hex('#1e1b4b')], [0.35, hex('#6366f1')], [0.7, hex('#ec4899')], [1, hex('#fde7f3')]],
  [[0, hex('#042f2e')], [0.35, hex('#14b8a6')], [0.7, hex('#a3e635')], [1, hex('#f7fee7')]],
  [[0, hex('#3b0764')], [0.35, hex('#c026d3')], [0.7, hex('#fb923c')], [1, hex('#fff7ed')]],
  [[0, hex('#0c1a4b')], [0.35, hex('#0ea5e9')], [0.7, hex('#67e8f9')], [1, hex('#ffffff')]],
];

export class CurlFlow extends BaseEnvironment {
  public readonly id = 'curl';
  public readonly preferredStyle = 'braille' as const;
  public readonly backdrop = [hex('#07061a'), hex('#0b0a22'), hex('#090818'), hex('#05040f')];

  private noise = new SimplexNoise(999);
  /** Trail ink at Braille-dot resolution: (cols·2) × (rows·4). */
  private dots = new Float32Array(0);
  private dotW = 0;
  private dotH = 0;
  private cellInk = new Float32Array(0);
  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);
  private age = new Float32Array(0);
  private life = new Float32Array(0);
  private count = 0;
  private lut = gradientLUT(MOODS[0]);
  private lutTime = -1;
  private bursts: { x: number; y: number; t: number }[] = [];

  public init(ctx: WorldContext): void {
    const { grid, quality } = ctx;
    this.dotW = grid.cols * 2;
    this.dotH = grid.rows * 4;
    this.dots = new Float32Array(this.dotW * this.dotH);
    this.cellInk = new Float32Array(grid.size);
    this.count = Math.round(Math.min(1200, grid.size * 0.045 * quality));
    this.px = new Float32Array(this.count);
    this.py = new Float32Array(this.count);
    this.vx = new Float32Array(this.count);
    this.vy = new Float32Array(this.count);
    this.age = new Float32Array(this.count);
    this.life = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.spawn(i, grid.cols, grid.rows, true);
  }

  private spawn(i: number, cols: number, rows: number, randomAge: boolean): void {
    this.px[i] = Math.random() * cols;
    this.py[i] = Math.random() * rows;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.life[i] = 3 + Math.random() * 6;
    this.age[i] = randomAge ? Math.random() * this.life[i] : 0;
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { grid, input } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const asp = grid.aspect; // convert row units to column units for isotropic motion
    const t = this.time * 0.06;
    const s = 0.035;
    const eps = 0.5;
    const mCol = input.x / grid.cellWidth;
    const mRow = input.y / grid.cellHeight;
    const pointer = input.active;

    for (const c of input.clicks) this.bursts.push({ x: c.x / grid.cellWidth, y: c.y / grid.cellHeight, t: 0 });

    for (let i = 0; i < this.count; i++) {
      const x = this.px[i];
      const y = this.py[i] / asp; // isotropic coordinates
      // Curl of a scalar noise potential: v = (∂n/∂y, -∂n/∂x).
      const n1 = this.noise.noise3D(x * s, (y + eps) * s, t);
      const n2 = this.noise.noise3D(x * s, (y - eps) * s, t);
      const n3 = this.noise.noise3D((x + eps) * s, y * s, t);
      const n4 = this.noise.noise3D((x - eps) * s, y * s, t);
      let tx = ((n1 - n2) / (2 * eps)) * 380;
      let ty = (-(n3 - n4) / (2 * eps)) * 380;

      if (pointer) {
        const dx = mCol - x;
        const dy = mRow / asp - y;
        const d = Math.hypot(dx, dy);
        const R = 28;
        if (d < R && d > 0.6) {
          const k = (1 - d / R) * 22 * input.intensity;
          tx += (-dy / d) * k * 2 + (dx / d) * k * 0.6;
          ty += (dx / d) * k * 2 + (dy / d) * k * 0.6;
        }
      }
      for (const b of this.bursts) {
        const dx = x - b.x;
        const dy = y - b.y / asp;
        const d = Math.hypot(dx, dy);
        const front = b.t * 60;
        if (Math.abs(d - front) < 6 && d > 0.1) {
          tx += (dx / d) * 70 * input.intensity;
          ty += (dy / d) * 70 * input.intensity;
        }
      }

      const k = 1 - Math.exp(-dt * 4);
      this.vx[i] += (tx - this.vx[i]) * k;
      this.vy[i] += (ty - this.vy[i]) * k;
      const nx = x + this.vx[i] * dt;
      const ny = (y + this.vy[i] * dt) * asp;
      // Deposit along the step, dot by dot, so fast particles still draw unbroken lines.
      this.deposit(x, y * asp, nx, ny);
      this.px[i] = nx;
      this.py[i] = ny;
      this.age[i] += dt;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || this.age[i] > this.life[i]) this.spawn(i, cols, rows, false);
    }
    for (let b = this.bursts.length - 1; b >= 0; b--) {
      this.bursts[b].t += dt;
      if (this.bursts[b].t > 0.8) this.bursts.splice(b, 1);
    }
    const k = Math.exp(-dt * 0.8);
    const d = this.dots;
    for (let i = 0; i < d.length; i++) if (d[i] > 0.002) d[i] *= k; else d[i] = 0;
  }

  private deposit(x0: number, y0: number, x1: number, y1: number): void {
    const ax = x0 * 2, ay = y0 * 4, bx = x1 * 2, by = y1 * 4;
    const steps = Math.min(12, Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)))));
    const w = this.dotW;
    const h = this.dotH;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const dx = (ax + (bx - ax) * t) | 0;
      const dy = (ay + (by - ay) * t) | 0;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      const i = dy * w + dx;
      const v = this.dots[i] + 0.22;
      this.dots[i] = v > 1.4 ? 1.4 : v;
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, style } = ctx;
    // Palette drift between moods (rebuild the LUT ~4× a second).
    if (this.time - this.lutTime > 0.25) {
      this.lutTime = this.time;
      const phase = (this.time / 40) % MOODS.length;
      const a = Math.floor(phase);
      const f = phase - a;
      const m0 = MOODS[a];
      const m1 = MOODS[(a + 1) % MOODS.length];
      const ease = f * f * (3 - 2 * f);
      const stops = m0.map(([p, c], i) => [p, lerpColor(c, m1[i][1], ease)] as [number, number]);
      this.lut = gradientLUT(stops);
    }
    if (style === 'braille') {
      renderBrailleDots(grid, this.dots, { lut: this.lut, layer: Layer.SKY, threshold: 0.1, minAlpha: 0.3, alphaGain: 0.7 });
    } else {
      // Downsample dots to cells for text styles.
      const cols = grid.cols;
      const w = this.dotW;
      const ink = this.cellInk;
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < cols; c++) {
          let sum = 0;
          for (let dy = 0; dy < 4; dy++) {
            const o = (r * 4 + dy) * w + c * 2;
            sum += this.dots[o] + this.dots[o + 1];
          }
          ink[r * cols + c] = 1 - Math.exp(-sum * 0.6);
        }
      }
      renderField(grid, ink, { style, lut: this.lut, layer: Layer.SKY, threshold: 0.06, minAlpha: 0.15, alphaGain: 0.85 });
    }

    // Arrow heads for a sparse subset.
    const step = Math.max(6, Math.round(this.count / 260));
    for (let i = 0; i < this.count; i += step) {
      const lifeK = Math.sin((this.age[i] / this.life[i]) * Math.PI);
      if (lifeK < 0.3) continue;
      const a = Math.atan2(-this.vy[i], this.vx[i]);
      const idx = ((Math.round((a / (Math.PI * 2)) * 8) % 8) + 8) % 8;
      grid.put(this.px[i], this.py[i], ARROWS[idx], this.lut[230], 0.55 + lifeK * 0.45, Layer.NEAR);
    }

    // Burst rings.
    for (const b of this.bursts) {
      const r = b.t * 60;
      const a = 1 - b.t / 0.8;
      for (let k = 0; k < 48; k++) {
        const ang = (k / 48) * Math.PI * 2;
        grid.put(b.x + Math.cos(ang) * r, b.y + Math.sin(ang) * r * grid.aspect, 0x2022, this.lut[250], a, Layer.FX);
      }
    }
  }

}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
}
