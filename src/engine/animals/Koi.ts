import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { EnergyField } from '../physics/EnergyField';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex } from '../core/Color';
import { drawBody, spot } from '../draw/Shapes';
import { renderField } from '../draw/Field';
import { Course, Creature, Knob, depthScale, depthSpeed, newCreature, population, separate, turnToward } from './kit';

interface Fish extends Creature {
  variety: number;
  speed: number;
  turn: number;
}
interface Pellet { x: number; y: number; life: number; }

/** [fleck, patch, base] per variety: kohaku, sanke, showa, ogon, chagoi. */
const VARIETIES: [number, number, number][] = [
  [hex('#b91c1c'), hex('#dc2626'), hex('#f5f1e8')],
  [hex('#1c1917'), hex('#dc2626'), hex('#f5f1e8')],
  [hex('#f5f1e8'), hex('#dc2626'), hex('#1f1d22')],
  [hex('#a16207'), hex('#eab308'), hex('#fde68a')],
  [hex('#9a3412'), hex('#ea580c'), hex('#fdba74')],
];
const LUTS = VARIETIES.map(([fleck, patch, base]) =>
  gradientLUT([[0, fleck], [0.25, fleck], [0.42, patch], [0.6, patch], [0.72, base], [0.9, base], [1, hex('#fffaf0')]])
);
const SCALE_TEX = Uint32Array.from(Array.from('.:;=').map(code));

/**
 * Koi meandering lazily along the course. Each body bends with its turning
 * and carries a travelling tail wave; patterns are a smooth blotch field in
 * body space, so they ride along with the bends. A click drops food: koi in
 * range turn toward it (the closer, the keener) and gulp pellets with a ripple.
 */
export class Koi extends AnimalBase {
  public readonly id = 'koi';
  public readonly zone = 'water' as const;
  public static knobs: Knob[] = [
    { key: 'meander', label: 'Meander', min: 0, max: 3, step: 0.05, value: 1, hint: 'How much they weave in lazy S-curves.' },
    { key: 'foodRange', label: 'Food range', min: 0, max: 600, step: 10, value: 260, hint: 'How close a koi has to be to notice food.' },
  ];
  private course = new Course(Math.random() < 0.5 ? 0 : Math.PI, 0.9);
  private noise = new SimplexNoise(9);
  private fish: Fish[] = [];
  private food: Pellet[] = [];
  private ripples = new EnergyField();
  private rippleLut = gradientLUT([[0, hex('#1e4d5c')], [1, hex('#bfe9f2')]]);

  public init(ctx: WorldContext): void {
    this.ripples.resize(ctx.grid.cols, ctx.grid.rows, ctx.grid.aspect);
    const n = population(ctx.habitat, 85000, this.k('density'), ctx.quality, 3, 30);
    this.fish = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, ctx.habitat, this.k('farthest'));
      c.heading = this.course.heading + c.bias * 0.6;
      this.fish.push({ ...c, variety: i % VARIETIES.length, speed: 40, turn: 0 });
    }
    this.food = [];
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat, grid } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    for (const c of input.clicks) {
      const n = 7 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 60 * Math.sqrt(Math.random());
        const p = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, life: 14 };
        this.food.push(p);
        this.ripples.stamp(p.x / cw, p.y / ch, 1.5, 0.5);
      }
    }
    if (this.food.length > 60) this.food.splice(0, this.food.length - 60);
    const range = this.k('foodRange');
    const speedK = this.k('speed');

    for (const f of this.fish) {
      let target: Pellet | null = null;
      let best = range;
      for (const p of this.food) {
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < best) {
          best = d;
          target = p;
        }
      }
      const pull = target ? 1 - best / range : 0;
      let want = this.course.heading + f.bias * 0.4 + this.k('meander') * 0.6 * this.noise.noise2D(f.seed, this.time * 0.12);
      if (target) want = Math.atan2(target.y - f.y, target.x - f.x);
      // A still pointer is mildly interesting; a fast one makes them veer off.
      if (input.active && Math.hypot(input.vx, input.vy) > 600 && Math.hypot(input.x - f.x, input.y - f.y) < 180) {
        want = Math.atan2(f.y - input.y, f.x - input.x);
      }
      const prev = f.heading;
      f.heading = turnToward(f.heading, want, (0.9 + pull * 2) * dt);
      f.turn = (f.heading - prev) / Math.max(dt, 1e-4);
      const cruise = (32 + pull * 70) * depthSpeed(f.depth) * speedK;
      f.speed += (cruise - f.speed) * Math.min(1, dt * 1.5);
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.y += Math.sin(f.heading) * f.speed * dt;
      f.phase += dt * (2.2 + f.speed * 0.05);
      if (target) {
        const len = cw * 14 * depthScale(f.depth) * this.k('size');
        const hx = f.x + Math.cos(f.heading) * len * 0.45;
        const hy = f.y + Math.sin(f.heading) * len * 0.45;
        if (Math.hypot(target.x - hx, target.y - hy) < 16) {
          this.food.splice(this.food.indexOf(target), 1);
          this.ripples.stamp(hx / cw, hy / ch, 2, 0.6);
        }
      }
      if (Math.random() < dt * 0.6) this.ripples.add(f.x / cw, f.y / ch, 0.08);
      this.course.recycle(f, habitat, 140);
    }
    separate(this.fish, cw * 10, dt, 0.6);
    for (let i = this.food.length - 1; i >= 0; i--) {
      this.food[i].life -= dt;
      if (this.food[i].life <= 0) this.food.splice(i, 1);
    }
    this.ripples.step(dt, 0.9, true);
  }

  public render(ctx: WorldContext): void {
    const { grid, style, bg } = ctx;
    const size = this.k('size');
    const fog = this.k('fog');
    renderField(grid, this.ripples.values, { style, lut: this.rippleLut, layer: Layer.SKY, threshold: 0.08, minAlpha: 0.04, alphaGain: 0.35 });
    for (const p of this.food) spot(grid, p.x, p.y, code('•'), hex('#e8b268'), Math.min(1, p.life / 2), Layer.FX);

    const order = [...this.fish].sort((a, b) => a.depth - b.depth);
    for (const f of order) {
      const len = grid.cellWidth * 14 * depthScale(f.depth) * size;
      const phase = f.phase;
      const seed = f.seed;
      const bend = Math.max(-0.3, Math.min(0.3, f.turn * 0.25));
      const layer = f.depth > 0.6 ? Layer.NEAR : Layer.MID;
      drawBody(grid, {
        x: f.x, y: f.y, heading: f.heading, length: len, width: len * 0.36, extent: 0.75,
        sampler: (u, v) => {
          // u: -0.5 tail … 0.5 snout. Bend + travelling wave grow toward the tail.
          const back = 0.5 - u;
          const vv = v - Math.sin(phase - u * 6) * 0.13 * back - bend * back * back;
          if (u < -0.3) {
            const k = (-0.3 - u) / 0.22;
            if (k > 1) return 0;
            return Math.abs(vv) < 0.1 + k * 0.35 && Math.abs(vv) > k * 0.12 ? 0.98 : 0;
          }
          const x = (u + 0.3) / 0.8;
          const half = 0.5 * Math.sin(Math.PI * Math.pow(Math.min(1, x), 0.68));
          if (Math.abs(vv) > half) {
            if (x > 0.55 && x < 0.72 && Math.abs(vv) < half + 0.25) return 0.98; // pectoral fins
            return 0;
          }
          const blot = Math.sin(u * 11 + seed) * Math.cos(vv * 9 + seed * 1.3) + 0.6 * Math.sin(u * 23 + vv * 15 + seed * 2.1);
          if (blot > 0.95) return 0.15;
          return blot > 0.1 ? 0.5 : 0.8;
        },
        lut: LUTS[f.variety], texture: SCALE_TEX, layer, solid: true, opacity: 0.6 + f.depth * 0.4,
        fog: (1 - f.depth) * fog, fogColor: bg,
      });
      // Eyes
      const ex = f.x + Math.cos(f.heading) * len * 0.38;
      const ey = f.y + Math.sin(f.heading) * len * 0.38;
      spot(grid, ex, ey, code('●'), hex('#0e0c10'), 0.9, layer);
    }
  }
}
