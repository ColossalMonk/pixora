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
  excited: number;
  mouthOpen: number;
}
interface Pellet {
  x: number;
  y: number;
  life: number;
}

/**
 * Japanese Nishikigoi varieties:
 * 1. Kohaku: snow white with deep scarlet-red patches.
 * 2. Taisho Sanke: white with scarlet hi and lacquer-black sumi ink flecks.
 * 3. Showa Sanshoku: midnight black with crimson and white lightning patterns.
 * 4. Yamabuki Ogon: gleaming metallic golden-yellow with sunlit scales.
 * 5. Tancho: pure pearl white with a single bold circular crimson crest on the head.
 * 6. Chagoi / Ochiba: warm earthy tea-amber and bronze.
 */
const VARIETIES: [number, number, number][] = [
  [hex('#991b1b'), hex('#dc2626'), hex('#fbf8f1')], // Kohaku
  [hex('#18181b'), hex('#ea580c'), hex('#fbf8f1')], // Sanke
  [hex('#fbf8f1'), hex('#dc2626'), hex('#18181b')], // Showa
  [hex('#854d0e'), hex('#eab308'), hex('#fef08a')], // Ogon
  [hex('#b91c1c'), hex('#ef4444'), hex('#ffffff')], // Tancho
  [hex('#78350f'), hex('#d97706'), hex('#fed7aa')], // Chagoi
];

const LUTS = VARIETIES.map(([fleck, patch, base]) =>
  gradientLUT([
    [0, fleck],
    [0.22, fleck],
    [0.44, patch],
    [0.62, patch],
    [0.74, base],
    [0.92, base],
    [1, hex('#fffdf7')],
  ])
);

const SCALE_TEX = Uint32Array.from(Array.from('.:;=').map(code));

/**
 * Nishikigoi meandering lazily below the water surface in fluid S-curves.
 * Features bendy spine kinematics with undulating traveling tail waves,
 * fanned pectoral fins, caudal fin rays, barbel whiskers, and interactive food feeding frenzy.
 */
export class Koi extends AnimalBase {
  public readonly id = 'koi';
  public readonly zone = 'water' as const;
  public static knobs: Knob[] = [
    { key: 'meander', label: 'Meander', min: 0, max: 3, step: 0.05, value: 1, hint: 'How much they weave in lazy S-curves.' },
    { key: 'foodRange', label: 'Food range', min: 0, max: 600, step: 10, value: 280, hint: 'How close a koi has to be to notice food.' },
  ];
  private course = new Course(Math.random() < 0.5 ? 0 : Math.PI, 0.9);
  private noise = new SimplexNoise(9);
  private fish: Fish[] = [];
  private food: Pellet[] = [];
  private ripples = new EnergyField();
  private rippleLut = gradientLUT([[0, hex('#1e4d5c')], [0.5, hex('#38bdf8')], [1, hex('#e0f2fe')]]);

  public init(ctx: WorldContext): void {
    this.ripples.resize(ctx.grid.cols, ctx.grid.rows, ctx.grid.aspect);
    const n = population(ctx.habitat, 80000, this.k('density'), ctx.quality, 3, 30);
    this.fish = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, ctx.habitat, this.k('farthest'));
      c.heading = this.course.heading + c.bias * 0.6;
      this.fish.push({
        ...c,
        variety: i % VARIETIES.length,
        speed: 40,
        turn: 0,
        excited: 0,
        mouthOpen: 0,
      });
    }
    this.food = [];
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat, grid } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;

    // Drop food pellets on click
    for (const c of input.clicks) {
      const n = 8 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 65 * Math.sqrt(Math.random());
        const p = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, life: 15 };
        this.food.push(p);
        this.ripples.stamp(p.x / cw, p.y / ch, 1.8, 0.6);
      }
    }
    if (this.food.length > 70) this.food.splice(0, this.food.length - 70);

    const range = this.k('foodRange');
    const speedK = this.k('speed');

    for (const f of this.fish) {
      f.excited = Math.max(0, f.excited - dt);
      f.mouthOpen = Math.max(0, f.mouthOpen - dt * 4);

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
      if (pull > 0.4) f.excited = 2.0;

      // Natural meandering noise
      const wander = this.k('meander') * 0.65 * this.noise.noise2D(f.seed, this.time * 0.14);
      let want = this.course.heading + f.bias * 0.35 + wander;

      if (target) {
        // Steer eagerly toward nearest food pellet
        want = Math.atan2(target.y - f.y, target.x - f.x);
      }

      // Pointer reaction
      if (input.active && Math.hypot(input.vx, input.vy) > 600 && Math.hypot(input.x - f.x, input.y - f.y) < 200) {
        want = Math.atan2(f.y - input.y, f.x - input.x); // veer away from fast thrashing
      }

      const prev = f.heading;
      const turnRate = 0.95 + pull * 2.8 + (f.excited > 0 ? 0.6 : 0);
      f.heading = turnToward(f.heading, want, turnRate * dt);
      f.turn = (f.heading - prev) / Math.max(dt, 1e-4);

      // Swimming speed: accelerate smoothly when food is sensed
      const cruise = (34 + pull * 75 + (f.excited > 0 ? 25 : 0)) * depthSpeed(f.depth) * speedK;
      f.speed += (cruise - f.speed) * Math.min(1, dt * 2.0);
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.y += Math.sin(f.heading) * f.speed * dt;

      // Sinusoidal tail wave frequency scales with swimming speed
      f.phase += dt * (2.4 + f.speed * 0.055);

      // Gulp food when close
      if (target) {
        const len = cw * 15 * depthScale(f.depth) * this.k('size');
        const hx = f.x + Math.cos(f.heading) * len * 0.46;
        const hy = f.y + Math.sin(f.heading) * len * 0.46;
        if (Math.hypot(target.x - hx, target.y - hy) < 22) {
          f.mouthOpen = 1.0;
          this.food.splice(this.food.indexOf(target), 1);
          this.ripples.stamp(hx / cw, hy / ch, 2.5, 0.75);
        }
      }

      // Swimming ripple rings
      if (Math.random() < dt * 0.65 || f.excited > 0) {
        this.ripples.add(f.x / cw, f.y / ch, 0.07);
      }

      this.course.recycle(f, habitat, 150);
    }

    separate(this.fish, cw * 11, dt, 0.65);

    for (let i = this.food.length - 1; i >= 0; i--) {
      this.food[i].life -= dt;
      if (this.food[i].life <= 0) this.food.splice(i, 1);
    }
    this.ripples.step(dt, 0.95, true);
  }

  public render(ctx: WorldContext): void {
    const { grid, style, bg } = ctx;
    const size = this.k('size');
    const fog = this.k('fog');

    // Water surface ripples
    renderField(grid, this.ripples.values, {
      style,
      lut: this.rippleLut,
      layer: Layer.SKY,
      threshold: 0.08,
      minAlpha: 0.04,
      alphaGain: 0.38,
    });

    // Food pellets
    for (const p of this.food) {
      spot(grid, p.x, p.y, code('•'), hex('#f59e0b'), Math.min(1, p.life / 2), Layer.FX);
    }

    const order = [...this.fish].sort((a, b) => a.depth - b.depth);

    for (const f of order) {
      const len = grid.cellWidth * 15 * depthScale(f.depth) * size;
      const phase = f.phase;
      const seed = f.seed;
      const bend = Math.max(-0.35, Math.min(0.35, f.turn * 0.28));
      const layer = f.depth > 0.62 ? Layer.NEAR : Layer.MID;
      const variety = f.variety;

      // Draw bending, swimming koi body
      drawBody(grid, {
        x: f.x,
        y: f.y,
        heading: f.heading,
        length: len,
        width: len * 0.38,
        extent: 0.82,
        sampler: (u, v) => {
          // u: -0.5 (caudal fin tip) to +0.5 (snout)
          // v: -0.5 to +0.5 (lateral body width)
          const back = 0.5 - u; // 0 at snout, 1 at tail

          // Traveling sinusoidal tail wave that amplifies toward the tail
          const tailWave = Math.sin(phase - u * 6.5) * 0.14 * back * back;
          const turnBend = bend * back * back;
          const vv = v - tailWave - turnBend;
          const avv = Math.abs(vv);

          // 1. Broad billowing caudal fin (tail)
          if (u < -0.28) {
            const k = (-0.28 - u) / 0.22;
            if (k > 1) return 0;
            // Fan shape spreading wide at the tail
            const finSpread = 0.12 + k * 0.38;
            if (avv < finSpread && avv > k * 0.06) {
              return 0.98; // translucent caudal fin rays
            }
            return 0;
          }

          // 2. Fuselage body envelope
          const x = (u + 0.28) / 0.78; // 0 at tail base, 1 at snout
          if (x < 0 || x > 1) return 0;

          // Muscular koi torso contour: broad shoulders, sleek taper
          const halfWidth = 0.5 * Math.sin(Math.PI * Math.pow(x, 0.65));

          // 3. Fanned translucent pectoral fins
          if (avv > halfWidth) {
            if (x > 0.52 && x < 0.74 && avv < halfWidth + 0.28) {
              return 0.95; // pectoral fins
            }
            return 0;
          }

          // 4. Dorsal fin line
          if (avv < 0.035 && x > 0.25 && x < 0.7) {
            return 0.25;
          }

          // 5. Classic Nishikigoi patterns
          if (variety === 4) {
            // Tancho: pure snow white with a single bold round red crest on head
            const crestU = (u - 0.32) / 0.1;
            const crestV = vv / 0.12;
            if (crestU * crestU + crestV * crestV < 1.0) {
              return 0.12; // vivid scarlet Tancho crest
            }
            return 0.88; // snow white body
          }

          // Multi-frequency organic blotches for Kohaku / Sanke / Showa / Chagoi
          const blot =
            Math.sin(u * 12 + seed) * Math.cos(vv * 10 + seed * 1.3) +
            0.55 * Math.sin(u * 24 + vv * 16 + seed * 2.2);

          if (blot > 0.92) return 0.14; // dark lacquer sumi / deep hi patch
          return blot > 0.08 ? 0.48 : 0.85; // pattern base vs white field
        },
        lut: LUTS[variety],
        texture: SCALE_TEX,
        layer,
        solid: true,
        opacity: 0.65 + f.depth * 0.35,
        fog: (1 - f.depth) * fog,
        fogColor: bg,
      });

      // Eyes & barbel whiskers
      const hx = Math.cos(f.heading);
      const hy = Math.sin(f.heading);
      const lx = -hy;
      const ly = hx;

      // Dark glossy eyes
      const eyeAlong = len * 0.36;
      const eyeAcross = len * 0.12;
      for (const side of [-1, 1]) {
        const ex = f.x + hx * eyeAlong + lx * eyeAcross * side;
        const ey = f.y + hy * eyeAlong + ly * eyeAcross * side;
        spot(grid, ex, ey, code('●'), hex('#18181b'), 0.95, Layer.FRONT);
      }

      // Barbel whiskers at snout
      const snoutX = f.x + hx * len * 0.48;
      const snoutY = f.y + hy * len * 0.48;
      spot(grid, snoutX + lx * len * 0.05, snoutY + ly * len * 0.05, code('\''), hex('#fef3c7'), 0.85, layer);
      spot(grid, snoutX - lx * len * 0.05, snoutY - ly * len * 0.05, code('\''), hex('#fef3c7'), 0.85, layer);

      // Open mouth when feeding
      if (f.mouthOpen > 0.2) {
        spot(grid, snoutX, snoutY, code('O'), hex('#7f1d1d'), 0.9, Layer.FRONT);
      }
    }
  }
}
