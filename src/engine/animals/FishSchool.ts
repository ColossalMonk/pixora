import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { BoidsSystem } from '../physics/BoidsSystem';
import { EnergyField } from '../physics/EnergyField';
import { Layer } from '../core/RenderGrid';
import { gradientLUT, hex, mix, scale } from '../core/Color';
import { renderField } from '../draw/Field';
import { Knob } from './kit';

const SPECIES = [
  { right: '><>', left: '<><', color: hex('#5eead4') },
  { right: '>=>', left: '<=<', color: hex('#fcd34d') },
  { right: '><(°>', left: '<°)><', color: hex('#fda4af') },
  { right: '>-<>', left: '<>-<', color: hex('#93c5fd') },
];

/**
 * Schools of small fish in three depth layers (far `›`, mid `><>`, near
 * species). Flocking with a spatial hash; fast pointer scatters them, a click
 * startles the whole school, and fast swimmers leave a faint wake.
 */
export class FishSchool extends AnimalBase {
  public readonly id = 'fish';
  public readonly zone = 'any' as const;
  public static knobs: Knob[] = [
    { key: 'schooling', label: 'Schooling', min: 0.2, max: 2.5, step: 0.05, value: 1, hint: 'How tightly they school together.' },
  ];
  private boids = new BoidsSystem();
  private species = new Uint8Array(0);
  private wake = new EnergyField();
  private wakeLut = gradientLUT([[0, hex('#1d6f8f')], [1, hex('#bff2ff')]]);

  public init(ctx: WorldContext): void {
    const { grid, quality, habitat } = ctx;
    const w = habitat.right - habitat.left;
    const h = habitat.bottom - habitat.top;
    const area = (w * h) / (1440 * 900);
    const count = Math.round(Math.min(160, (50 * area * quality + 12) * this.k('density')));
    const far = this.k('farthest');
    this.boids.reset(count, habitat.right, habitat.bottom, (i) => far + (1 - far) * (i % 5 === 0 ? 0.85 + Math.random() * 0.15 : i % 2 ? 0.15 + Math.random() * 0.3 : 0.5 + Math.random() * 0.25));
    this.boids.minX = habitat.left;
    this.boids.minY = habitat.top;
    // Re-seed inside the habitat.
    for (let i = 0; i < count; i++) {
      this.boids.x[i] = habitat.left + 60 + Math.random() * Math.max(1, w - 120);
      this.boids.y[i] = habitat.top + 60 + Math.random() * Math.max(1, h - 140);
    }
    this.species = new Uint8Array(count);
    for (let i = 0; i < count; i++) this.species[i] = Math.floor(i / 9) % SPECIES.length;
    this.wake.resize(grid.cols, grid.rows, grid.aspect);
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, grid } = ctx;
    for (const c of input.clicks) {
      this.boids.startle(c.x, c.y, 260 * input.intensity, 420 * input.intensity);
      this.wake.stamp(c.x / grid.cellWidth, c.y / grid.cellHeight, 6, 1.4);
    }
    this.boids.params.maxSpeed = 130 * this.k('speed');
    this.boids.params.neighbor = 70 * this.k('schooling');
    const pointer = input.active && input.intensity > 0;
    this.boids.update(dt, pointer ? input.x : NaN, input.y, input.intensity);
    for (let i = 0; i < this.boids.count; i += 2) {
      if (this.boids.panic[i] > 0 || this.boids.depth[i] > 0.8) {
        this.wake.add(this.boids.x[i] / grid.cellWidth, this.boids.y[i] / grid.cellHeight, 0.06);
      }
    }
    this.wake.step(dt, 1.6);
  }

  public render(ctx: WorldContext): void {
    const { grid, style, layered } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    renderField(grid, this.wake.values, { style, lut: this.wakeLut, layer: Layer.FAR, threshold: 0.12, minAlpha: 0.08, alphaGain: 0.35 });
    const fog = layered ? ctx.bg : hex('#0b0c12');
    for (let i = 0; i < this.boids.count; i++) {
      const d = this.boids.depth[i];
      const right = this.boids.vx[i] >= 0;
      const sp = SPECIES[this.species[i]];
      const col = Math.floor(this.boids.x[i] / cw);
      const row = Math.floor(this.boids.y[i] / ch);
      const color = mix(sp.color, fog, (1 - d) * this.k('fog'));
      const alpha = 0.35 + d * 0.65;
      if (d < 0.45) {
        grid.putChar(col, row, right ? '›' : '‹', color, alpha, Layer.FAR);
        continue;
      }
      const str = d > 0.8 ? (right ? sp.right : sp.left) : right ? '><>' : '<><';
      const wiggle = Math.sin(this.boids.phase[i] * 2.4) > 0.3;
      const len = str.length;
      const start = right ? col - len + 1 : col;
      const layer = d > 0.8 ? Layer.NEAR : Layer.MID;
      for (let k = 0; k < len; k++) {
        let chh = str[k];
        if (wiggle && ((right && k === 0) || (!right && k === len - 1))) chh = right ? '}' : '{';
        grid.putChar(start + k, row, chh, k === (right ? len - 1 : 0) ? scale(color, 1.2) : color, alpha, layer);
      }
    }
  }
}
