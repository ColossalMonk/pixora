import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex } from '../core/Color';
import { drawBody, spot } from '../draw/Shapes';
import { Course, Creature, Knob, depthScale, depthSpeed, hazed, newCreature, population } from './kit';

interface Fly extends Creature {
  species: number;
  flap: number;
  /** Seconds left gliding (wings held open, no beat). */
  glide: number;
}

/** Wing palettes: [edge/vein, base, bright, spot]. */
const SPECIES = [
  [hex('#1c1008'), hex('#c2410c'), hex('#fb923c'), hex('#fff7ed')], // monarch
  [hex('#0c1a3a'), hex('#1d4ed8'), hex('#60a5fa'), hex('#e0f2fe')], // blue
  [hex('#3f2a06'), hex('#ca8a04'), hex('#fde047'), hex('#fefce8')], // brimstone
  [hex('#3f3f46'), hex('#d4d4d8'), hex('#fafafa'), hex('#18181b')], // cabbage white
  [hex('#3b0b2e'), hex('#be185d'), hex('#f9a8d4'), hex('#fdf2f8')], // pink
];
const LUTS = SPECIES.map(([edge, base, bright, dot]) => gradientLUT([[0, edge], [0.18, edge], [0.3, base], [0.75, bright], [0.92, bright], [1, dot]]));
const WING_TEX = Uint32Array.from(Array.from(".:;=").map(code));

/**
 * Butterflies drifting along the course with a fluttery, bobbing flight and
 * the odd glide. Wings are tile silhouettes (fore + hind wing per side) whose
 * span follows the wingbeat. A still pointer draws them in; a fast one
 * scatters them; a click sends the nearby ones spiralling up.
 */
export class Butterflies extends AnimalBase {
  public readonly id = 'butterflies';
  public readonly zone = 'any' as const;
  public static knobs: Knob[] = [
    { key: 'flutter', label: 'Flutter', min: 0.3, max: 2.5, step: 0.05, value: 1, hint: 'Wingbeat speed and how much they bob.' },
    { key: 'curious', label: 'Curiosity', min: 0, max: 2, step: 0.05, value: 1, hint: 'How strongly a still pointer draws them in.' },
  ];
  private course = new Course(-0.15, 0.6);
  private noise = new SimplexNoise(21);
  private flies: Fly[] = [];

  public init(ctx: WorldContext): void {
    const n = population(ctx.habitat, 70000, this.k('density'), ctx.quality, 3, 40);
    this.flies = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, ctx.habitat, this.k('farthest'));
      this.flies.push({ ...c, species: i % SPECIES.length, flap: Math.random() * 6, glide: 0 });
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat } = ctx;
    const speed = this.k('speed');
    const flutter = this.k('flutter');
    const sp = Math.hypot(input.vx, input.vy);
    for (const c of input.clicks) {
      for (const f of this.flies) {
        const d = Math.hypot(f.x - c.x, f.y - c.y);
        if (d < 240) {
          f.vx += ((f.x - c.x) / (d + 1)) * 160;
          f.vy -= 140 + Math.random() * 80;
          f.glide = 0;
        }
      }
    }
    for (const f of this.flies) {
      const s = depthSpeed(f.depth) * speed;
      const wander = this.noise.noise2D(f.seed, this.time * 0.25) * 1.2;
      const dir = this.course.heading + wander;
      let ax = Math.cos(dir) * 46 * s;
      let ay = Math.sin(dir) * 30 * s + Math.sin(f.flap * 0.5) * 40 * flutter;
      if (input.active) {
        const dx = input.x - f.x;
        const dy = input.y - f.y;
        const d = Math.hypot(dx, dy);
        if (sp > 700 && d < 220) {
          ax -= (dx / (d + 1)) * 420;
          ay -= (dy / (d + 1)) * 420;
        } else if (sp < 60 && d < 320 && d > 24) {
          const pull = this.k('curious') * input.intensity * 90;
          ax += (dx / d) * pull;
          ay += (dy / d) * pull;
        }
      }
      f.vx += (ax - f.vx) * Math.min(1, dt * 2);
      f.vy += (ay - f.vy) * Math.min(1, dt * 2);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.glide > 0) f.glide -= dt;
      else {
        f.flap += dt * 14 * flutter * (0.8 + f.depth * 0.4);
        if (Math.random() < dt * 0.15) f.glide = 0.6 + Math.random() * 0.8;
      }
      this.course.recycle(f, habitat, 80);
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, bg } = ctx;
    const size = this.k('size');
    const fog = this.k('fog');
    // Far ones first so near ones overwrite them cleanly.
    const order = [...this.flies].sort((a, b) => a.depth - b.depth);
    for (const f of order) {
      const scaleK = depthScale(f.depth) * size;
      const span = grid.cellWidth * 12 * scaleK;
      const open = f.glide > 0 ? 1 : 0.25 + 0.75 * Math.abs(Math.cos(f.flap));
      const lut = LUTS[f.species];
      const seed = f.seed;
      const layer = f.depth > 0.75 ? Layer.FX : f.depth > 0.45 ? Layer.NEAR : Layer.MID;
      drawBody(grid, {
        x: f.x, y: f.y, heading: 0, length: span, width: span * 0.75, extent: 0.7,
        sampler: (u, v) => {
          const au = Math.abs(u);
          if (au < 0.035 && v > -0.2 && v < 0.28) return 0.05; // body
          const wu = au / Math.max(0.15, open); // wings fold toward the body
          // Forewing
          const fx = (wu - 0.27) / 0.24;
          const fy = (v + 0.1) / 0.22;
          const fore = fx * fx + fy * fy;
          // Hindwing
          const hx = (wu - 0.2) / 0.17;
          const hy = (v - 0.17) / 0.16;
          const hind = hx * hx + hy * hy;
          const e = Math.min(fore, hind);
          if (e > 1 || au < 0.035) return 0;
          if (e > 0.72) return 0.1; // dark edge
          const dot = Math.sin(u * 40 + seed) * Math.sin(v * 37 + seed * 0.7) > 0.86;
          if (dot) return 0.97;
          return 0.35 + (1 - e) * 0.5;
        },
        lut, texture: WING_TEX, layer, solid: true, opacity: 0.55 + f.depth * 0.45,
        fog: (1 - f.depth) * fog, fogColor: bg,
      });
      // Antennae
      const ax = f.x;
      const ay = f.y - span * 0.75 * 0.28;
      const ant = hazed(SPECIES[f.species][0], f.depth, fog, bg);
      spot(grid, ax - grid.cellWidth * 0.6, ay, code('\''), ant, 0.8, layer);
      spot(grid, ax + grid.cellWidth * 0.6, ay, code('\''), ant, 0.8, layer);
    }
  }
}
