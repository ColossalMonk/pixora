import { BaseEnvironment } from './BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { hex, hash2, mix } from '../core/Color';
import { drawLine, spot } from '../draw/Shapes';

interface Flower { x: number; y: number; h: number; color: number; phase: number; }
interface Butterfly {
  x: number; y: number; vx: number; vy: number; flap: number; wing: number; body: number;
  target: number; rest: number; seed: number;
}
interface Fluff { x: number; y: number; vx: number; vy: number; }

const WINGS: [number, number][] = [
  [hex('#f97316'), hex('#7c2d12')], // monarch
  [hex('#60a5fa'), hex('#1e3a8a')], // blue
  [hex('#fde047'), hex('#854d0e')], // brimstone
  [hex('#f5f5f4'), hex('#57534e')], // white
  [hex('#c084fc'), hex('#581c87')], // violet
];
const FLOWER_COLORS = [hex('#f9a8d4'), hex('#fde68a'), hex('#ffffff'), hex('#c4b5fd'), hex('#fca5a5')];

/**
 * Dusk over rolling hills: grass that sways (and parts around the pointer),
 * flowers on stems, and butterflies that wander from flower to flower,
 * rest with slow wingbeats, get curious about a still pointer and scatter
 * from a fast one.
 */
export class Meadow extends BaseEnvironment {
  public readonly id = 'meadow';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#1d1736'), hex('#2d1f45'), hex('#4a2a4a'), hex('#1b1324')];

  private noise = new SimplexNoise(31);
  private far = new Int16Array(0);
  private near = new Int16Array(0);
  private flowers: Flower[] = [];
  private flies: Butterfly[] = [];
  private fluff: Fluff[] = [];
  private blades: { x: number; h: number; phase: number; shade: number }[] = [];

  public init(ctx: WorldContext): void {
    const { grid, width, height } = ctx;
    const area = (width * height) / (1440 * 900);
    this.far = new Int16Array(grid.cols);
    this.near = new Int16Array(grid.cols);
    for (let c = 0; c < grid.cols; c++) {
      this.far[c] = Math.round(grid.rows * (0.62 - 0.08 * (this.noise.noise2D(c * 0.015, 1) * 0.5 + 0.5)));
      this.near[c] = Math.round(grid.rows * (0.74 - 0.07 * (this.noise.noise2D(c * 0.012, 4) * 0.5 + 0.5)));
    }
    this.flowers = [];
    const nf = Math.round(26 * area);
    for (let i = 0; i < nf; i++) {
      const x = Math.random() * width;
      const c = Math.min(grid.cols - 1, Math.floor(x / grid.cellWidth));
      const ground = this.near[c] * grid.cellHeight;
      this.flowers.push({ x, y: ground + Math.random() * (height - ground) * 0.7, h: grid.cellHeight * (2 + Math.random() * 3), color: FLOWER_COLORS[i % FLOWER_COLORS.length], phase: Math.random() * 6 });
    }
    this.blades = [];
    for (let x = 0; x < width; x += grid.cellWidth * (2.5 + Math.random() * 3)) {
      this.blades.push({ x, h: grid.cellHeight * (1 + Math.random() * 1.8), phase: Math.random() * 6, shade: Math.random() });
    }
    this.flies = [];
    const nb = Math.max(4, Math.round(8 * area));
    for (let i = 0; i < nb; i++) this.flies.push(this.newFly(Math.random() * width, Math.random() * height * 0.6, i));
    this.fluff = [];
    for (let i = 0; i < 14 * area; i++) this.fluff.push({ x: Math.random() * width, y: Math.random() * height, vx: 0, vy: 0 });
  }

  private newFly(x: number, y: number, i: number): Butterfly {
    return { x, y, vx: 0, vy: 0, flap: Math.random() * 6, wing: i % WINGS.length, body: 0, target: Math.floor(Math.random() * Math.max(1, this.flowers.length)), rest: 0, seed: Math.random() * 100 };
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, width, height } = ctx;
    for (const c of input.clicks) {
      for (let k = 0; k < 3 && this.flies.length < 18; k++) {
        const b = this.newFly(c.x, c.y, this.flies.length + k);
        b.vx = (Math.random() - 0.5) * 200;
        b.vy = -80 - Math.random() * 80;
        this.flies.push(b);
      }
    }
    const pointerSpeed = Math.hypot(input.vx, input.vy);
    for (const b of this.flies) {
      const f = this.flowers[b.target];
      let tx = f ? f.x : width / 2;
      let ty = f ? f.y - f.h : height / 2;
      let flee = false;
      if (input.active) {
        const d = Math.hypot(input.x - b.x, input.y - b.y);
        if (pointerSpeed > 700 && d < 200) flee = true;
        else if (pointerSpeed < 50 && d < 300) {
          tx = input.x + Math.sin(this.time + b.seed) * 40;
          ty = input.y - 30 + Math.cos(this.time * 1.3 + b.seed) * 20;
          b.rest = 0;
        }
      }
      if (b.rest > 0) {
        b.rest -= dt;
        b.x = tx;
        b.y = ty;
        b.vx = b.vy = 0;
        b.flap += dt * 2.5;
        if (b.rest <= 0) b.target = Math.floor(Math.random() * this.flowers.length);
        continue;
      }
      const dx = tx - b.x;
      const dy = ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      // Fluttery path: steer plus noise wobble.
      const wob = this.noise.noise2D(b.seed, this.time * 0.8) * 160;
      let ax = (dx / d) * 120 + wob;
      let ay = (dy / d) * 120 + Math.cos(this.time * 4 + b.seed) * 140;
      if (flee) {
        ax = (b.x - input.x) * 8;
        ay = (b.y - input.y) * 8 - 200;
      }
      b.vx += (ax - b.vx * 0.9) * dt * 2.5;
      b.vy += (ay - b.vy * 0.9) * dt * 2.5;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.flap += dt * 16;
      if (d < 12 && !flee && f) b.rest = 2 + Math.random() * 4;
      b.x = Math.max(-20, Math.min(width + 20, b.x));
      b.y = Math.max(10, Math.min(height - 10, b.y));
    }
    for (const p of this.fluff) {
      p.vx += (Math.sin(this.time * 0.4 + p.y * 0.01) * 20 + 10 - p.vx) * dt;
      p.vy += (Math.cos(this.time * 0.5 + p.x * 0.01) * 8 - 3 - p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height;
      if (p.y > height + 10) p.y = 0;
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, input, height } = ctx;
    const cols = grid.cols;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;

    // Low sun behind the far hills.
    const sunC = cols * 0.72;
    const sunR = grid.rows * 0.18;
    for (let r = Math.floor(this.far[Math.floor(sunC)] - sunR * grid.aspect * 1.6); r < this.far[Math.floor(sunC)] + 2; r++) {
      for (let c = Math.floor(sunC - sunR); c <= sunC + sunR; c++) {
        const d = Math.hypot(c - sunC, (r - (this.far[Math.floor(sunC)] - 2)) / grid.aspect) / sunR;
        if (d < 1) grid.putSolid(c, r, 0, 0, 0, mix(hex('#fde68a'), hex('#fb923c'), d), 0.85 - d * 0.35, Layer.SKY);
        else if (d < 1.6) grid.putSolid(c, r, 0, 0, 0, hex('#fb923c'), (1.6 - d) * 0.12, Layer.SKY);
      }
    }

    // Hills
    for (let c = 0; c < cols; c++) {
      for (let r = this.far[c]; r < grid.rows; r++) {
        grid.putSolid(c, r, 0, 0, 0, mix(hex('#3b3a63'), hex('#2a2f4f'), (r - this.far[c]) / 6), 1, Layer.FAR);
      }
      for (let r = this.near[c]; r < grid.rows; r++) {
        const depth = (r - this.near[c]) / (grid.rows - this.near[c]);
        const g = hash2(c, r) > 0.9 ? code(',') : hash2(c, r) < 0.04 ? code("'") : 0;
        grid.putSolid(c, r, g, hex('#86efac'), 0.35, mix(hex('#2f5d3a'), hex('#14301e'), depth), 1, Layer.MID);
      }
    }

    // Flowers
    for (const f of this.flowers) {
      const sway = Math.sin(t * 1.2 + f.phase) * 4;
      drawLine(grid, f.x, f.y, f.x + sway, f.y - f.h, hex('#4ade80'), 0.75, Layer.NEAR);
      const hx = Math.floor((f.x + sway) / cw);
      const hy = Math.floor((f.y - f.h) / ch);
      grid.putSolid(hx, hy, code('*'), mix(f.color, 0, 0.55), 0.9, f.color, 1, Layer.NEAR);
      grid.putChar(hx - 1, hy, '(', f.color, 0.6, Layer.NEAR);
      grid.putChar(hx + 1, hy, ')', f.color, 0.6, Layer.NEAR);
    }

    // Grass along the bottom, parting around the pointer.
    for (const b of this.blades) {
      let lean = Math.sin(t * 1.1 + b.phase + b.x * 0.004) * 0.25;
      if (input.active) {
        const d = b.x - input.x;
        if (Math.abs(d) < 90 && input.y > height - 160) lean += Math.sign(d) * (1 - Math.abs(d) / 90) * 0.9 * input.intensity;
      }
      const tipX = b.x + Math.sin(lean) * b.h;
      const tipY = height - Math.cos(lean) * b.h;
      drawLine(grid, b.x, height + 2, tipX, tipY, mix(hex('#4ade80'), hex('#bbf7d0'), b.shade * 0.6), 0.55, Layer.FRONT);
    }

    // Butterflies: wings open and close (tile width follows |cos(flap)|).
    for (const b of this.flies) {
      const open = Math.abs(Math.cos(b.flap));
      const span = open > 0.7 ? 3 : open > 0.4 ? 2 : open > 0.15 ? 1 : 0;
      const [light, dark] = WINGS[b.wing];
      const c = Math.floor(b.x / cw);
      const r = Math.floor(b.y / ch);
      for (let k = 1; k <= span; k++) {
        const shade = k === span ? light : mix(light, dark, 0.35);
        grid.putSolid(c - k, r, code(k === 2 ? '●' : '·'), dark, 0.9, shade, 1, Layer.FX);
        grid.putSolid(c + k, r, code(k === 2 ? '●' : '·'), dark, 0.9, shade, 1, Layer.FX);
        grid.putSolid(c - k, r - 1, 0, 0, 0, mix(shade, 0xffffff, 0.15), k === span ? 0.7 : 0.95, Layer.FX);
        grid.putSolid(c + k, r - 1, 0, 0, 0, mix(shade, 0xffffff, 0.15), k === span ? 0.7 : 0.95, Layer.FX);
        if (k <= 2) {
          grid.putSolid(c - k, r + 1, 0, 0, 0, mix(shade, dark, 0.3), 0.9, Layer.FX);
          grid.putSolid(c + k, r + 1, 0, 0, 0, mix(shade, dark, 0.3), 0.9, Layer.FX);
        }
      }
      grid.putChar(c, r, span === 0 ? '|' : '¦', hex('#1c1917'), 1, Layer.FX);
      grid.putChar(c, r + 1, '\'', hex('#1c1917'), 0.8, Layer.FX);
      if (span === 0) {
        grid.putSolid(c, r - 1, 0, 0, 0, light, 0.95, Layer.FX);
      }
    }

    for (const p of this.fluff) spot(grid, p.x, p.y, code('·'), hex('#fef3c7'), 0.55, Layer.FX);
  }
}
