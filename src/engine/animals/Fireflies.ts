import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { EnergyField } from '../physics/EnergyField';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { renderField } from '../draw/Field';

interface Fly { x: number; y: number; vx: number; vy: number; theta: number; omega: number; seed: number; glow: number; }

/**
 * Fireflies as phase oscillators (Kuramoto model): each flashes when its
 * phase wraps and is nudged toward the swarm's mean phase. Coupling grows
 * over the first minute, so random twinkling turns into shared waves of light.
 */
export class Fireflies extends AnimalBase {
  public readonly id = 'fireflies';
  private noise = new SimplexNoise(77);
  private glow = new EnergyField();
  private flies: Fly[] = [];
  private coupling = 0.1;
  private glowLut = gradientLUT([[0, hex('#1b3a12')], [0.5, hex('#a3e635')], [1, hex('#fef9c3')]]);

  public init(ctx: WorldContext): void {
    const { grid, quality, habitat } = ctx;
    const w = habitat.right - habitat.left;
    const h = habitat.bottom - habitat.top;
    const area = (w * h) / (1440 * 900);
    this.glow.resize(grid.cols, grid.rows, grid.aspect);
    this.flies = [];
    const n = Math.round(Math.min(90, 46 * area * quality + 10));
    for (let i = 0; i < n; i++) {
      this.flies.push({
        x: habitat.left + Math.random() * w,
        y: habitat.top + h * (0.15 + Math.random() * 0.8),
        vx: 0, vy: 0,
        theta: Math.random() * Math.PI * 2,
        omega: (Math.PI * 2) / (2.2 + Math.random() * 0.8),
        seed: Math.random() * 100,
        glow: 0,
      });
    }
    this.coupling = 0.1;
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, grid, habitat } = ctx;
    this.coupling = Math.min(1.6, this.coupling + dt * 0.025);
    if (input.clicks.length) {
      for (const f of this.flies) f.theta = 0.05 + Math.random() * 0.1;
      this.coupling = 0.2;
    }
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
    const w = habitat.right - habitat.left;

    for (const f of this.flies) {
      const prev = f.theta;
      f.theta += (f.omega + this.coupling * R * Math.sin(psi - f.theta)) * dt;
      if (f.theta >= Math.PI * 2) f.theta -= Math.PI * 2;
      if (f.theta < prev) f.glow = 1;
      f.glow = Math.max(0, f.glow - dt * 2.4);

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
      if (f.x < habitat.left) f.x += w;
      if (f.x > habitat.right) f.x -= w;
      f.y = Math.max(habitat.top + 10, Math.min(habitat.bottom - 10, f.y));
      if (f.glow > 0.05) this.glow.stamp(f.x / grid.cellWidth, f.y / grid.cellHeight, 3.5, f.glow * 0.18);
    }
    this.glow.step(dt, 3, true);
  }

  public render(ctx: WorldContext): void {
    const { grid, style } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    renderField(grid, this.glow.values, { style, lut: this.glowLut, layer: Layer.MID, threshold: 0.06, minAlpha: 0.04, alphaGain: 0.5 });
    for (const f of this.flies) {
      const c = Math.floor(f.x / cw);
      const r = Math.floor(f.y / ch);
      if (f.glow > 0.35) grid.putSolid(c, r, code('•'), hex('#365314'), 0.9, mix(hex('#bef264'), hex('#fef9c3'), f.glow), 0.6 + f.glow * 0.4, Layer.FX);
      else grid.putChar(c, r, '·', hex('#a3e635'), 0.25 + f.glow, Layer.FX);
    }
  }
}
