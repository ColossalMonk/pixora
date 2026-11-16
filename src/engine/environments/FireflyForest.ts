import { BaseEnvironment } from './BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { EnergyField } from '../physics/EnergyField';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, hash2, mix } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawLine } from '../draw/Shapes';

interface Fly { x: number; y: number; vx: number; vy: number; theta: number; omega: number; seed: number; glow: number; }
interface Trunk { x: number; w: number; depth: number; }
interface Fern { x: number; y: number; size: number; }

/**
 * A night forest of fireflies that slowly synchronise. Each firefly is a
 * phase oscillator (Kuramoto model): it flashes when its phase wraps, and is
 * nudged toward the swarm's average phase. The coupling grows over the first
 * minute, so the forest drifts from random twinkling into waves of shared
 * light. A click flashes them all at once and restarts the dance.
 */
export class FireflyForest extends BaseEnvironment {
  public readonly id = 'firefly-forest';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#040d0b'), hex('#06140f'), hex('#081a13'), hex('#030907')];

  private noise = new SimplexNoise(77);
  private glowField = new EnergyField();
  private flies: Fly[] = [];
  private trunks: Trunk[] = [];
  private ferns: Fern[] = [];
  private coupling = 0.1;
  private glowLut = gradientLUT([[0, hex('#1b3a12')], [0.5, hex('#a3e635')], [1, hex('#fef9c3')]]);

  public init(ctx: WorldContext): void {
    const { grid, width, height, quality } = ctx;
    const area = (width * height) / (1440 * 900);
    this.glowField.resize(grid.cols, grid.rows, grid.aspect);
    this.flies = [];
    const n = Math.round(Math.min(90, 46 * area * quality + 10));
    for (let i = 0; i < n; i++) {
      this.flies.push({
        x: Math.random() * width, y: height * (0.25 + Math.random() * 0.65), vx: 0, vy: 0,
        theta: Math.random() * Math.PI * 2, omega: (Math.PI * 2) / (2.2 + Math.random() * 0.8), seed: Math.random() * 100, glow: 0,
      });
    }
    this.trunks = [];
    for (let x = -10; x < width + 20; x += 50 + Math.random() * 90) {
      const depth = Math.random();
      // Keep the centre open behind the clock and search.
      if (Math.abs(x - width / 2) < width * 0.18 && depth > 0.3) continue;
      this.trunks.push({ x, w: grid.cellWidth * (1 + depth * 3.5), depth });
    }
    this.trunks.sort((a, b) => a.depth - b.depth);
    this.ferns = [];
    for (let x = 0; x < width; x += 60 + Math.random() * 80) this.ferns.push({ x, y: height + 4, size: 30 + Math.random() * 40 });
    this.coupling = 0.1;
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, grid, width, height } = ctx;
    this.coupling = Math.min(1.6, this.coupling + dt * 0.025);

    for (const c of input.clicks) {
      for (const f of this.flies) f.theta = 0.05 + Math.random() * 0.1;
      this.coupling = 0.2;
      void c;
    }

    // Mean field (order parameter R, mean phase psi).
    let sx = 0;
    let sy = 0;
    for (const f of this.flies) {
      sx += Math.cos(f.theta);
      sy += Math.sin(f.theta);
    }
    const n = Math.max(1, this.flies.length);
    const R = Math.hypot(sx, sy) / n;
    const psi = Math.atan2(sy, sx);

    const still = input.active && Math.hypot(input.vx, input.vy) < 60;
    for (const f of this.flies) {
      const prev = f.theta;
      f.theta += (f.omega + this.coupling * R * Math.sin(psi - f.theta)) * dt;
      if (f.theta >= Math.PI * 2) f.theta -= Math.PI * 2;
      if (f.theta < prev) f.glow = 1; // wrapped → flash
      f.glow = Math.max(0, f.glow - dt * 2.4);

      // Lazy drifting flight; drawn toward a still pointer.
      let ax = this.noise.noise2D(f.seed, this.time * 0.2) * 40;
      let ay = this.noise.noise2D(f.seed + 50, this.time * 0.2) * 30;
      if (still) {
        const dx = input.x - f.x;
        const dy = input.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d < 320 && d > 30) {
          ax += (dx / d) * 30 * input.intensity;
          ay += (dy / d) * 30 * input.intensity;
        }
      }
      f.vx += (ax - f.vx) * dt;
      f.vy += (ay - f.vy) * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < 0) f.x += width;
      if (f.x > width) f.x -= width;
      f.y = Math.max(height * 0.15, Math.min(height * 0.95, f.y));
      if (f.glow > 0.05) this.glowField.stamp(f.x / grid.cellWidth, f.y / grid.cellHeight, 3.5, f.glow * 0.18);
    }
    this.glowField.step(dt, 3, true);
  }

  public render(ctx: WorldContext): void {
    const { grid, style, height } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const rows = grid.rows;

    // Trunks: far ones misty, near ones dark with bark glyphs.
    for (const tr of this.trunks) {
      const c0 = Math.floor((tr.x - tr.w / 2) / cw);
      const c1 = Math.floor((tr.x + tr.w / 2) / cw);
      const layer = tr.depth > 0.6 ? Layer.NEAR : tr.depth > 0.3 ? Layer.MID : Layer.FAR;
      const fill = mix(hex('#173229'), hex('#060c0a'), tr.depth);
      for (let r = 0; r < rows; r++) {
        for (let c = c0; c <= c1; c++) {
          const bark = tr.depth > 0.5 && hash2(c, Math.floor(r / 2)) > 0.8 ? code('|') : 0;
          grid.putSolid(c, r, bark, mix(fill, hex('#3f5f4b'), 0.4), 0.6, fill, 0.4 + tr.depth * 0.6, layer);
        }
      }
    }

    // Glow field around flashing fireflies.
    renderField(grid, this.glowField.values, { style, lut: this.glowLut, layer: Layer.MID, threshold: 0.06, minAlpha: 0.04, alphaGain: 0.5 });

    // Fireflies
    for (const f of this.flies) {
      const c = Math.floor(f.x / cw);
      const r = Math.floor(f.y / ch);
      if (f.glow > 0.35) grid.putSolid(c, r, code('•'), hex('#365314'), 0.9, mix(hex('#bef264'), hex('#fef9c3'), f.glow), 0.6 + f.glow * 0.4, Layer.FX);
      else grid.putChar(c, r, '·', hex('#a3e635'), 0.25 + f.glow, Layer.FX);
    }

    // Ferns along the floor.
    for (const fe of this.ferns) {
      for (let k = -3; k <= 3; k += 2) {
        const a = -Math.PI / 2 + k * 0.28 + Math.sin(this.time * 0.6 + fe.x) * 0.05;
        drawLine(grid, fe.x, fe.y, fe.x + Math.cos(a) * fe.size, fe.y + Math.sin(a) * fe.size * 0.8, mix(hex('#14532d'), hex('#4d7c0f'), Math.abs(k) / 4), 0.45, Layer.FRONT);
      }
    }
    void height;
  }
}
