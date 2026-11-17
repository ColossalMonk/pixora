import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { hex, mix } from '../core/Color';
import { drawLine, drawPolygon, spot } from '../draw/Shapes';
import { Course, Creature, Knob, depthScale, depthSpeed, newCreature, population } from './kit';

interface Crane extends Creature {
  /** Leader of this skein (self for leaders). */
  leader: number;
  /** Slot in the V: 0 = leader, ±1, ±2 … */
  slot: number;
  flap: number;
  startle: number;
  glide: number;
}

/**
 * Red-crowned cranes crossing overhead in majestic V-shaped skeins seen from top-down.
 * Bilateral snow-white plumage, brilliant crimson crown, black flight feathers
 * splayed at the wingtips, outstretched neck, and long slender legs trailing straight back.
 * Followers hold aerodynamic echelon slots; wingbeats alternate between slow, deep strokes and flat glides.
 */
export class Cranes extends AnimalBase {
  public readonly id = 'cranes';
  public readonly zone = 'sky' as const;
  public static knobs: Knob[] = [
    { key: 'skein', label: 'Flock size', min: 1, max: 9, step: 1, value: 5, hint: 'Birds per V formation.' },
    { key: 'wingbeat', label: 'Wingbeat', min: 0.3, max: 2, step: 0.05, value: 1 },
  ];
  private course = new Course(Math.random() < 0.5 ? -0.12 : Math.PI + 0.12, 0.15);
  private birds: Crane[] = [];

  public init(ctx: WorldContext): void {
    const skein = Math.max(1, Math.round(this.k('skein')));
    const groups = Math.max(1, Math.round(population(ctx.habitat, 550000, this.k('density'), ctx.quality, 1, 5)));
    this.birds = [];
    let id = 0;
    for (let g = 0; g < groups; g++) {
      const lead = newCreature(id, ctx.habitat, this.k('farthest'));
      lead.y = ctx.habitat.top + (ctx.habitat.bottom - ctx.habitat.top) * (0.12 + Math.random() * 0.45);
      const leaderId = id;
      for (let k = 0; k < skein; k++) {
        const slot = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
        this.birds.push({
          ...lead,
          id,
          seed: Math.random() * 1000,
          leader: leaderId,
          slot,
          flap: Math.random() * Math.PI * 2,
          startle: 0,
          glide: Math.random() * 2,
        });
        id++;
      }
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat, grid } = ctx;

    // Startle on clicks
    for (const c of input.clicks) {
      for (const b of this.birds) {
        if (Math.hypot(b.x - c.x, b.y - c.y) < 380) {
          b.startle = 2.8;
          b.glide = 0;
        }
      }
    }

    const byId = new Map(this.birds.map((b) => [b.id, b]));

    for (const b of this.birds) {
      const lead = byId.get(b.leader) ?? b;
      const s = depthSpeed(b.depth) * this.k('speed');
      b.startle = Math.max(0, b.startle - dt);

      // Flap vs glide cycle
      if (b.glide > 0 && b.startle <= 0) {
        b.glide -= dt;
      } else {
        b.flap += dt * (1.8 + b.startle * 1.6) * this.k('wingbeat');
        if (b.startle <= 0 && Math.random() < dt * 0.2) {
          b.glide = 1.2 + Math.random() * 2.0; // long majestic glide
        }
      }

      if (b.slot === 0) {
        // Skein leader steers along course
        b.heading = this.course.heading + Math.sin(this.time * 0.12 + b.seed) * 0.06;
        const v = 75 * s * (1 + b.startle * 0.45);
        b.x += Math.cos(b.heading) * v * dt;
        b.y += (Math.sin(b.heading) * v - b.startle * 25) * dt;

        if (this.course.recycle(b, habitat, 280)) {
          for (const f of this.birds) {
            if (f.leader === b.id && f !== b) {
              f.x = b.x;
              f.y = b.y;
            }
          }
        }
      } else {
        // Followers hold aerodynamic V-formation slots
        const span = grid.cellWidth * 24 * depthScale(lead.depth) * this.k('size');
        const back = Math.abs(b.slot) * span * 0.85;
        const side = b.slot * span * 0.65;
        const hx = Math.cos(lead.heading);
        const hy = Math.sin(lead.heading);
        const tx = lead.x - hx * back - hy * side;
        const ty = lead.y - hy * back + hx * side + Math.sin(this.time * 0.6 + b.seed) * 5;

        b.x += (tx - b.x) * Math.min(1, dt * 1.8);
        b.y += (ty - b.y) * Math.min(1, dt * 1.8);
        b.heading = lead.heading;
        b.depth = lead.depth;
      }
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, bg } = ctx;
    const fog = this.k('fog');
    const order = [...this.birds].sort((a, b) => a.depth - b.depth);

    for (const b of order) {
      // Top-down dimensions
      const L = grid.cellWidth * 22 * depthScale(b.depth) * this.k('size');
      const haze = (1 - b.depth) * fog;
      const white = mix(hex('#f8fafc'), bg, haze);
      const pureWhite = mix(hex('#ffffff'), bg, haze * 0.8);
      const black = mix(hex('#111827'), bg, haze * 0.7);
      const darkSlate = mix(hex('#334155'), bg, haze);
      const crownRed = mix(hex('#ef4444'), bg, haze * 0.5);
      const beakCol = mix(hex('#cbd5e1'), bg, haze);
      const alpha = 0.6 + b.depth * 0.4;
      const layer = b.depth > 0.65 ? Layer.FX : Layer.NEAR;

      // Coordinate frame: along flight heading (fx, fy), lateral wings (lx, ly)
      const fx = Math.cos(b.heading);
      const fy = Math.sin(b.heading);
      const lx = -fy;
      const ly = fx;

      const P = (along: number, across: number): [number, number] => [
        b.x + fx * along * L + lx * across * L,
        b.y + fy * along * L + ly * across * L,
      ];

      // Wingbeat dynamics: sweep and dihedral
      const isGliding = b.glide > 0 && b.startle <= 0;
      const beat = isGliding ? 0 : Math.cos(b.flap);
      const wingSpan = 1.45 * (0.92 + 0.08 * (isGliding ? 1 : 1 - Math.abs(beat) * 0.25));
      const sweep = isGliding ? -0.1 : -0.1 + beat * 0.14;

      // 1. Long slender trailing legs (stretching straight back behind the tail)
      const legL = 0.65;
      const legStart = -0.28;
      const legEnd = legStart - legL;
      for (const side of [-1, 1]) {
        const [x0, y0] = P(legStart, side * 0.025);
        const [x1, y1] = P(legEnd, side * 0.045);
        drawLine(grid, x0, y0, x1, y1, darkSlate, alpha * 0.85, layer);
        // Small webbed feet/toes at the tip
        spot(grid, x1 - fx * L * 0.04, y1 - fy * L * 0.04, code('·'), darkSlate, alpha * 0.8, layer);
      }

      // 2. Black tertial plumes / tail wedge
      drawPolygon(
        grid,
        [P(-0.18, -0.06), P(-0.18, 0.06), P(-0.42, 0.08), P(-0.48, 0), P(-0.42, -0.08)],
        black,
        alpha,
        layer,
        code('-'),
        darkSlate
      );

      // 3. Wings (Bilateral symmetry: left side -1, right side +1)
      for (const side of [-1, 1]) {
        // Inner Wing (Secondaries): broad, pure white
        const rootAnt = P(0.18, side * 0.08);
        const rootPost = P(-0.2, side * 0.08);
        const midAnt = P(0.12 + sweep * 0.4, side * wingSpan * 0.58);
        const midPost = P(-0.16 + sweep * 0.35, side * wingSpan * 0.55);

        drawPolygon(
          grid,
          [rootAnt, midAnt, midPost, rootPost],
          pureWhite,
          alpha,
          layer,
          code('='),
          white
        );

        // Outer Wing & Splayed Primaries: black flight feathers
        const tipL = P(sweep * 0.95, side * wingSpan * 0.88);
        const tipM = P(sweep * 1.05 - 0.04, side * wingSpan);
        const tipR = P(sweep * 1.15 - 0.09, side * wingSpan * 0.94);

        drawPolygon(
          grid,
          [midAnt, tipL, tipM, tipR, midPost],
          black,
          alpha,
          layer,
          code('#'),
          darkSlate
        );
      }

      // 4. Fuselage Torso (pure white, aerodynamic almond shape)
      const body: [number, number][] = [];
      const steps = 12;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        body.push(P(Math.cos(a) * 0.28, Math.sin(a) * 0.09));
      }
      drawPolygon(grid, body, pureWhite, alpha, layer, code('='), white);

      // 5. Outstretched Neck & Head
      const [nx0, ny0] = P(0.24, 0);
      const [hx, hy] = P(0.68, 0);
      drawLine(grid, nx0, ny0, hx, hy, pureWhite, alpha, layer);
      // Extra neck thickness
      drawLine(grid, P(0.24, -0.015)[0], P(0.24, -0.015)[1], P(0.66, -0.015)[0], P(0.66, -0.015)[1], white, alpha * 0.9, layer);
      drawLine(grid, P(0.24, 0.015)[0], P(0.24, 0.015)[1], P(0.66, 0.015)[0], P(0.66, 0.015)[1], white, alpha * 0.9, layer);

      // 6. Cranial Head & Iconic Crimson Red Crown
      spot(grid, hx, hy, code('●'), pureWhite, alpha, layer);
      // Red crown on top of the skull!
      spot(grid, hx - fx * L * 0.03, hy - fy * L * 0.03, code('●'), crownRed, 1.0, Layer.FRONT);

      // 7. Long Beak
      const [bx, by] = P(0.84, 0);
      drawLine(grid, hx, hy, bx, by, beakCol, alpha * 0.95, layer);
    }
  }
}
