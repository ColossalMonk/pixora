import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { BoidsSystem } from '../physics/BoidsSystem';
import { EnergyField } from '../physics/EnergyField';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { renderField } from '../draw/Field';
import { Knob, population } from './kit';

/**
 * A starling murmuration: a few hundred flocking birds chasing a slowly
 * wandering focus, so the whole cloud stretches, folds and turns. Density is
 * shown as a soft tile cloud with individual birds on top. The flock bends
 * around the pointer; a click sends a shock wave through it.
 */
export class Starlings extends AnimalBase {
  public readonly id = 'starlings';
  public readonly zone = 'sky' as const;
  public static knobs: Knob[] = [
    { key: 'cohesion', label: 'Togetherness', min: 0.3, max: 2.5, step: 0.05, value: 1, hint: 'How tightly the flock holds together.' },
    { key: 'wander', label: 'Wander', min: 0.2, max: 2.5, step: 0.05, value: 1, hint: 'How far the flock roams across the sky.' },
  ];
  private boids = new BoidsSystem();
  private noise = new SimplexNoise(4);
  private cloud = new EnergyField();
  private cloudLut = gradientLUT([[0, hex('#1e1b4b')], [0.5, hex('#6d6aa8')], [1, hex('#c7d2fe')]]);

  public init(ctx: WorldContext): void {
    const { habitat, grid } = ctx;
    const n = population(habitat, 2200, this.k('density'), ctx.quality, 90, 600);
    this.boids.params = {
      maxSpeed: 210,
      maxForce: 520,
      separation: 12,
      neighbor: 46,
      avoidRadius: 170,
      avoidForce: 1600,
      attractRadius: 4000,
      attractForce: 70,
    };
    this.boids.reset(n, habitat.right, habitat.bottom, () => 0.75 + Math.random() * 0.25);
    this.boids.minX = habitat.left;
    this.boids.minY = habitat.top;
    const cx = (habitat.left + habitat.right) / 2;
    const cy = habitat.top + (habitat.bottom - habitat.top) * 0.35;
    for (let i = 0; i < n; i++) {
      this.boids.x[i] = cx + (Math.random() - 0.5) * 300;
      this.boids.y[i] = cy + (Math.random() - 0.5) * 160;
    }
    this.cloud.resize(grid.cols, grid.rows, grid.aspect);
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, habitat, grid } = ctx;
    const w = habitat.right - habitat.left;
    const h = habitat.bottom - habitat.top;
    const wander = this.k('wander');
    this.boids.params.attractForce = 120 * this.k('cohesion');
    this.boids.params.maxSpeed = 210 * this.k('speed');
    const tx = habitat.left + w * (0.5 + 0.38 * this.noise.noise2D(1, this.time * 0.05 * wander));
    const ty = habitat.top + h * (0.38 + 0.25 * this.noise.noise2D(7, this.time * 0.06 * wander));
    for (const c of input.clicks) this.boids.startle(c.x, c.y, 260, 520 * input.intensity);
    this.boids.update(dt, input.active ? input.x : NaN, input.y, input.intensity, tx, ty);
    for (let i = 0; i < this.boids.count; i++) this.cloud.add(this.boids.x[i] / grid.cellWidth, this.boids.y[i] / grid.cellHeight, 0.05);
    this.cloud.step(dt, 3, true);
  }

  public render(ctx: WorldContext): void {
    const { grid, style, bg } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    renderField(grid, this.cloud.values, { style, lut: this.cloudLut, layer: Layer.MID, threshold: 0.05, minAlpha: 0.06, alphaGain: 0.55 });
    const bird = mix(hex('#e0e7ff'), bg, 0.15);
    const near = code('•');
    const far = code('·');
    for (let i = 0; i < this.boids.count; i++) {
      const fast = Math.hypot(this.boids.vx[i], this.boids.vy[i]) > 150;
      grid.put(Math.floor(this.boids.x[i] / cw), Math.floor(this.boids.y[i] / ch), fast ? near : far, bird, 0.95, Layer.NEAR);
    }
  }
}
