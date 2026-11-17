import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex } from '../core/Color';
import { drawBody, spot } from '../draw/Shapes';
import { Course, Creature, Knob, depthScale, depthSpeed, hazed, newCreature, population, turnToward } from './kit';

interface Fly extends Creature {
  species: number;
  flap: number;
  /** Seconds left gliding (wings held open, no beat). */
  glide: number;
  /** Brownian micro-jitter phase */
  jitterPhase: number;
}

/**
 * Wing palettes: [edge/vein, base, bright, spot].
 * 6 vivid species inspired by ascii-animals and natural morphos/swallowtails.
 */
const SPECIES = [
  // 1. Blue Morpho: iridescent navy, sapphire, sky, white pearl spots
  [hex('#081026'), hex('#1d4ed8'), hex('#38bdf8'), hex('#f0f9ff')],
  // 2. Monarch: velvet carbon black, cadmium orange, fiery gold, white dots
  [hex('#14100c'), hex('#c2410c'), hex('#fb923c'), hex('#fffbeb')],
  // 3. Emerald Swallowtail: velvet forest, vibrant emerald, mint shimmer, seafoam
  [hex('#052014'), hex('#047857'), hex('#34d399'), hex('#ecfdf5')],
  // 4. Madagascan Sunset Moth: deep indigo, royal violet, magenta flame, electric cyan
  [hex('#1e1035'), hex('#7e22ce'), hex('#ec4899'), hex('#67e8f9')],
  // 5. Golden Birdwing / Brimstone: charcoal, warm amber, glowing canary yellow, cream
  [hex('#1c1917'), hex('#b45309'), hex('#facc15'), hex('#fefce8')],
  // 6. Purple Emperor: dark obsidian, imperial purple, radiant lilac, brilliant silver
  [hex('#110d24'), hex('#6b21a8'), hex('#c084fc'), hex('#ffffff')],
];

const LUTS = SPECIES.map(([edge, base, bright, dot]) =>
  gradientLUT([
    [0, edge],
    [0.18, edge],
    [0.32, base],
    [0.72, bright],
    [0.9, bright],
    [1, dot],
  ])
);

const WING_TEX = Uint32Array.from(Array.from(".:;=").map(code));

/**
 * Colorful butterflies drifting along a course with erratic Brownian fluttering,
 * turbulent bobbing, and majestic flat-winged glides.
 * Wings are broad and vibrant with forewings and hindwings, delicate vein lattices,
 * and edge pearls. Heading dynamically tracks flight velocity.
 */
export class Butterflies extends AnimalBase {
  public readonly id = 'butterflies';
  public readonly zone = 'any' as const;
  public static knobs: Knob[] = [
    { key: 'flutter', label: 'Flutter', min: 0.3, max: 2.5, step: 0.05, value: 1, hint: 'Wingbeat speed and erratic bobbing.' },
    { key: 'curious', label: 'Curiosity', min: 0, max: 2, step: 0.05, value: 1, hint: 'How strongly a still pointer draws them in.' },
  ];
  private course = new Course(-0.15, 0.6);
  private noise = new SimplexNoise(21);
  private flies: Fly[] = [];

  public init(ctx: WorldContext): void {
    const n = population(ctx.habitat, 65000, this.k('density'), ctx.quality, 3, 36);
    this.flies = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, ctx.habitat, this.k('farthest'));
      c.heading = this.course.heading + (Math.random() - 0.5) * 0.4;
      this.flies.push({
        ...c,
        species: i % SPECIES.length,
        flap: Math.random() * Math.PI * 2,
        glide: 0,
        jitterPhase: Math.random() * 100,
      });
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat } = ctx;
    const speed = this.k('speed');
    const flutter = this.k('flutter');
    const sp = Math.hypot(input.vx, input.vy);

    // Click startle: nearby butterflies burst upward in spiral
    for (const c of input.clicks) {
      for (const f of this.flies) {
        const d = Math.hypot(f.x - c.x, f.y - c.y);
        if (d < 260) {
          f.vx += ((f.x - c.x) / (d + 1)) * 220;
          f.vy -= 180 + Math.random() * 120;
          f.glide = 0;
        }
      }
    }

    for (const f of this.flies) {
      f.jitterPhase += dt * (8 + 12 * flutter);
      const s = depthSpeed(f.depth) * speed;

      // Organic low-frequency wander
      const wander = this.noise.noise2D(f.seed, this.time * 0.22) * 1.4;
      const baseDir = this.course.heading + wander;

      // Base directional propulsion
      let ax = Math.cos(baseDir) * 52 * s;
      let ay = Math.sin(baseDir) * 36 * s;

      // Brownian motion & erratic micro-turbulences
      const brownian = 48 * flutter * (0.8 + Math.sin(f.jitterPhase) * 0.3);
      ax += (Math.sin(f.jitterPhase * 1.7 + f.seed) + (Math.random() - 0.5) * 0.8) * brownian;
      ay += (Math.cos(f.jitterPhase * 2.3 + f.seed * 1.4) + (Math.random() - 0.5) * 0.8) * brownian;

      // Vertical bobbing synchronized with wingbeat
      ay += Math.sin(f.flap) * 38 * flutter;

      // Interactive pointer forces
      if (input.active) {
        const dx = input.x - f.x;
        const dy = input.y - f.y;
        const d = Math.hypot(dx, dy);
        if (sp > 600 && d < 240) {
          // Fast pointer scatters them
          ax -= (dx / (d + 1)) * 460;
          ay -= (dy / (d + 1)) * 460;
        } else if (sp < 60 && d < 340 && d > 20) {
          // Still pointer draws them gently in
          const pull = this.k('curious') * input.intensity * 95;
          ax += (dx / d) * pull;
          ay += (dy / d) * pull;
        }
      }

      // Smooth acceleration into velocity
      f.vx += (ax - f.vx) * Math.min(1, dt * 3.5);
      f.vy += (ay - f.vy) * Math.min(1, dt * 3.5);
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Dynamic flight heading: align directly with motion vector!
      const currentSpeed = Math.hypot(f.vx, f.vy);
      if (currentSpeed > 6) {
        const targetHeading = Math.atan2(f.vy, f.vx);
        f.heading = turnToward(f.heading, targetHeading, dt * 6.5);
      }

      // Wingbeat & glide cycle
      if (f.glide > 0) {
        f.glide -= dt;
      } else {
        f.flap += dt * 15 * flutter * (0.8 + f.depth * 0.4);
        // Random transition to a smooth, flat-winged glide
        if (Math.random() < dt * 0.18) {
          f.glide = 0.5 + Math.random() * 0.9;
        }
      }

      this.course.recycle(f, habitat, 100);
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, bg } = ctx;
    const size = this.k('size');
    const fog = this.k('fog');

    // Draw far butterflies first
    const order = [...this.flies].sort((a, b) => a.depth - b.depth);

    for (const f of order) {
      const scaleK = depthScale(f.depth) * size;
      // Enlarged wingspan for high visibility and majesty
      const span = grid.cellWidth * 18 * scaleK;
      const bodyLen = span * 0.85;

      // Wing fold cycle: wings fold toward the center dorsal axis during upstroke
      const open = f.glide > 0 ? 1 : 0.22 + 0.78 * Math.abs(Math.cos(f.flap));
      const lut = LUTS[f.species];
      const seed = f.seed;
      const layer = f.depth > 0.72 ? Layer.FX : f.depth > 0.4 ? Layer.NEAR : Layer.MID;

      // Draw butterfly body with heading aligned with its flight direction!
      // In body space: u is along heading (forward +u, rear -u), v is across wings (±v)
      drawBody(grid, {
        x: f.x,
        y: f.y,
        heading: f.heading,
        length: bodyLen,
        width: span,
        extent: 0.75,
        sampler: (u, v) => {
          // u: -0.5 (rear/abdomen) to +0.5 (head/snout)
          // v: -0.5 (left wing) to +0.5 (right wing)
          const av = Math.abs(v);

          // Central thorax & abdomen (along u, centered on v = 0)
          if (av < 0.045 && u > -0.38 && u < 0.32) {
            return 0.08; // dark velvet body core
          }

          // Wings fold toward the body line: scale lateral distance by open fraction
          const wv = av / Math.max(0.16, open);

          // Forewing: larger, sweeps forward and out (u from -0.08 to 0.42)
          const fx = (u - 0.12) / 0.28;
          const fy = (wv - 0.26) / 0.22;
          const fore = fx * fx + fy * fy;

          // Hindwing: rounded, sits back and lower (u from -0.38 to 0.05)
          const hx = (u + 0.16) / 0.22;
          const hy = (wv - 0.21) / 0.18;
          const hind = hx * hx + hy * hy;

          const e = Math.min(fore, hind);
          if (e > 1 || av < 0.04) return 0;

          // Wing border: dark velvet rim with subtle scalloping
          if (e > 0.74) return 0.12;

          // Margin dots / eyespots (pearl white / bright color highlights)
          const spotPattern = Math.sin(u * 38 + seed) * Math.sin(wv * 34 + seed * 0.7);
          if (e > 0.62 && spotPattern > 0.82) return 0.98;

          // Radiating wing veins
          const vein = Math.sin(Math.atan2(fy, fx) * 12 + seed) * 0.12;

          // Vibrant interior wing gradient
          return Math.max(0.25, Math.min(0.92, 0.45 + (1 - e) * 0.48 + vein));
        },
        lut,
        texture: WING_TEX,
        layer,
        solid: true,
        opacity: 0.6 + f.depth * 0.4,
        fog: (1 - f.depth) * fog,
        fogColor: bg,
      });

      // Antennae extending forward and angling out from the head
      const hx = Math.cos(f.heading);
      const hy = Math.sin(f.heading);
      const lx = -hy;
      const ly = hx;
      const headX = f.x + hx * bodyLen * 0.32;
      const headY = f.y + hy * bodyLen * 0.32;
      const antSpread = span * 0.12;
      const antReach = bodyLen * 0.18;
      const antCol = hazed(SPECIES[f.species][0], f.depth, fog, bg);

      spot(grid, headX + hx * antReach + lx * antSpread, headY + hy * antReach + ly * antSpread, code('\''), antCol, 0.85, layer);
      spot(grid, headX + hx * antReach - lx * antSpread, headY + hy * antReach - ly * antSpread, code('\''), antCol, 0.85, layer);
    }
  }
}
