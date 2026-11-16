import { BaseEnvironment } from './BaseEnvironment';
import { Habitat, WorldContext } from '../../types/environment';
import { WaveEquation2D } from '../physics/WaveEquation2D';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawBody, drawLine, spot } from '../draw/Shapes';

interface Pad { x: number; y: number; r: number; notch: number; flower: boolean; ox: number; oy: number; }
interface Reed { x: number; h: number; phase: number; head: boolean; }
interface Petal { x: number; y: number; vx: number; vy: number; }

/**
 * Lily Pond (scenery only — frogs, koi and dragonflies live in Animals).
 * A still pond seen from above: a ripple simulation, lily pads that bob and
 * drift on the waves, lotus flowers, drifting petals and reeds framing the edges.
 */
export class FrogPond extends BaseEnvironment {
  public readonly id = 'frog-pond';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#0f2e28'), hex('#0b2622'), hex('#081c1a'), hex('#05120f')];
  public readonly followsClock = true;
  public readonly backdropDay = [hex('#1f5a4a'), hex('#1a4f42'), hex('#143f35'), hex('#0c2a24')];

  private wave = new WaveEquation2D();
  private noise = new SimplexNoise(5);
  private field = new Float32Array(0);
  private pads: Pad[] = [];
  private reeds: Reed[] = [];
  private petals: Petal[] = [];
  private lastX = -1;
  private lastY = -1;

  private waterLut = gradientLUT([[0, hex('#0f3b36')], [0.45, hex('#2c7a6c')], [0.8, hex('#8fd3c1')], [1, hex('#e6fff8')]]);
  private padLut = gradientLUT([[0, hex('#0f3d1f')], [0.45, hex('#1f7a3a')], [0.75, hex('#4fbf62')], [1, hex('#b6f0a8')]]);
  private padTex = Uint32Array.from(Array.from('.,:;=%').map(code));

  /** Animals layered here live on and above the water surface. */
  public habitat(width: number, height: number): Habitat {
    return { top: 0, bottom: height, left: 0, right: width, waterY: 0 };
  }

  public init(ctx: WorldContext): void {
    const { grid, width, height } = ctx;
    const area = (width * height) / (1440 * 900);
    this.wave.resize(grid.cols, grid.rows, grid.aspect);
    this.wave.damping = 0.982;
    this.field = this.ensure(this.field, grid.size);
    const cw = grid.cellWidth;

    this.pads = [];
    const padCount = Math.max(5, Math.round(8 * Math.sqrt(area)));
    for (let i = 0; i < padCount; i++) {
      const a = (i / padCount) * Math.PI * 2 + Math.random() * 0.4;
      const rx = width * (0.32 + Math.random() * 0.12);
      const ry = height * (0.3 + Math.random() * 0.1);
      const r = cw * (5 + Math.random() * 4);
      const [px, py] = this.clearOfUI(width / 2 + Math.cos(a) * rx, height / 2 + Math.sin(a) * ry, r, ctx.safe, width, height);
      this.pads.push({
        x: px,
        y: py,
        r,
        notch: Math.random() * Math.PI * 2,
        flower: i % 3 === 0,
        ox: 0,
        oy: 0,
      });
    }
    this.reeds = [];
    for (const fx of [0.02, 0.06, 0.94, 0.98]) {
      for (let k = 0; k < 6; k++) {
        this.reeds.push({ x: width * fx + (Math.random() - 0.5) * cw * 8, h: height * (0.18 + Math.random() * 0.22), phase: Math.random() * 6, head: Math.random() > 0.4 });
      }
    }
    this.petals = [];
    for (let i = 0; i < 10 * area; i++) this.petals.push({ x: Math.random() * width, y: Math.random() * height, vx: 0, vy: 0 });
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { grid, input, width, height } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    for (const c of input.clicks) this.wave.addDisturbance(c.x / cw, c.y / ch, 4, 4.5 * input.intensity);
    if (input.active) {
      const d = this.lastX >= 0 ? Math.hypot(input.x - this.lastX, input.y - this.lastY) : 0;
      if (d > 3) this.wave.addDisturbance(input.x / cw, input.y / ch, 2, Math.min(1, d * 0.04) * input.intensity);
      this.lastX = input.x;
      this.lastY = input.y;
    } else this.lastX = -1;
    const raining = ctx.weather === 'rain' || ctx.weather === 'storm';
    if (Math.random() < dt * (raining ? 9 : 0.3)) this.wave.addDisturbance(Math.random() * grid.cols, Math.random() * grid.rows, raining ? 1.2 : 1.6, raining ? 1.1 : 0.8);
    this.wave.update();

    for (const p of this.pads) {
      const c = Math.floor(p.x / cw);
      const r = Math.floor(p.y / ch);
      p.ox += (-this.wave.gradX(c, r) * 30 - p.ox) * dt * 2;
      p.oy += (-this.wave.gradY(c, r) * 20 + Math.sin(this.time * 0.8 + p.notch) * 1.5 - p.oy) * dt * 2;
    }
    for (const p of this.petals) {
      const c = Math.floor(p.x / cw);
      const r = Math.floor(p.y / ch);
      p.vx += (-this.wave.gradX(c, r) * 40 + 6 - p.vx) * dt;
      p.vy += (-this.wave.gradY(c, r) * 40 + Math.sin(this.time * 0.3 + p.x * 0.01) * 4 - p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x > width + 10) p.x = -10;
      if (p.y > height + 10) p.y = -10;
      if (p.y < -10) p.y = height + 10;
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, style } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;

    const field = this.field;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const h = this.wave.uCurr[i];
        const spec = Math.max(0, this.wave.gradX(c, r) * 0.6 - this.wave.gradY(c, r) * 0.8) * 1.8;
        const murk = this.noise.noise3D(c * 0.06, r * 0.12, t * 0.12) * 0.5 + 0.5;
        field[i] = Math.max(0, murk - 0.72) * 0.5 + Math.abs(h) * 0.45 + spec;
      }
    }
    renderField(grid, field, { style, lut: this.waterLut, layer: Layer.SKY, threshold: 0.09, minAlpha: style === 'tiles' ? 0.06 : 0.12, alphaGain: style === 'tiles' ? 0.5 : 0.75 });

    for (const p of this.pads) {
      const notch = p.notch;
      drawBody(grid, {
        x: p.x + p.ox, y: p.y + p.oy, heading: 0, length: p.r * 2, width: p.r * 2,
        sampler: (u, v) => {
          const d = Math.hypot(u, v);
          if (d > 0.5) return 0;
          const a = Math.atan2(v, u);
          const da = Math.atan2(Math.sin(a - notch), Math.cos(a - notch));
          if (Math.abs(da) < 0.28 && d > 0.04) return 0;
          if (d > 0.44) return 0.32;
          const vein = Math.cos((a - notch) * 9) > 0.92 ? 0.25 : 0;
          return 0.5 + vein + (0.5 - d) * 0.3;
        },
        lut: this.padLut, texture: this.padTex, layer: Layer.MID, solid: true, opacity: 0.95,
      });
      if (p.flower) {
        const fx = p.x + p.ox - Math.cos(p.notch) * p.r * 0.35;
        const fy = p.y + p.oy - Math.sin(p.notch) * p.r * 0.35;
        grid.putSolid(Math.floor(fx / cw), Math.floor(fy / ch), code('*'), hex('#a16207'), 0.9, hex('#fde68a'), 1, Layer.NEAR);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          grid.putSolid(Math.floor(fx / cw) + dx, Math.floor(fy / ch) + dy, code('·'), hex('#9d174d'), 0.8, hex('#f9a8d4'), 0.95, Layer.NEAR);
        }
      }
    }

    for (const p of this.petals) spot(grid, p.x, p.y, code('✿'), hex('#fbcfe8'), 0.8, Layer.NEAR);

    for (const r of this.reeds) {
      let x = r.x;
      let y = ctx.height + 4;
      const sway = Math.sin(t * 0.9 + r.phase) * 0.08;
      for (let s = 0; s < 6; s++) {
        const k = (s + 1) / 6;
        const nx = r.x + Math.sin(sway * k * 6) * r.h * 0.12 * k;
        const ny = ctx.height - r.h * k;
        drawLine(grid, x, y, nx, ny, mix(hex('#166534'), hex('#86efac'), k * 0.5), 0.9, Layer.FRONT);
        x = nx;
        y = ny;
      }
      if (r.head) {
        spot(grid, x, y, code('█'), hex('#7c4a1e'), 1, Layer.FRONT);
        spot(grid, x, y + ch, code('█'), hex('#6b3d17'), 1, Layer.FRONT);
      }
    }
  }
}
