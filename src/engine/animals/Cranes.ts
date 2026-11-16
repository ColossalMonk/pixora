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
}


/**
 * Cranes crossing in slow V-shaped skeins. Followers hold their slot behind
 * and beside the bird ahead; wingbeats are slow and deep. Each bird is a tile
 * silhouette: white body and wings with black flight feathers, a long neck,
 * a red crown and trailing legs. A click startles them: faster beats and a climb.
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
    const groups = Math.max(1, Math.round(population(ctx.habitat, 600000, this.k('density'), ctx.quality, 1, 6)));
    this.birds = [];
    let id = 0;
    for (let g = 0; g < groups; g++) {
      const lead = newCreature(id, ctx.habitat, this.k('farthest'));
      lead.y = ctx.habitat.top + (ctx.habitat.bottom - ctx.habitat.top) * (0.1 + Math.random() * 0.5);
      const leaderId = id;
      for (let k = 0; k < skein; k++) {
        const slot = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
        this.birds.push({ ...lead, id, seed: Math.random() * 1000, leader: leaderId, slot, flap: Math.random() * 0.6, startle: 0 });
        id++;
      }
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat, grid } = ctx;
    for (const c of input.clicks) for (const b of this.birds) if (Math.hypot(b.x - c.x, b.y - c.y) < 350) b.startle = 2.5;
    const byId = new Map(this.birds.map((b) => [b.id, b]));
    for (const b of this.birds) {
      const lead = byId.get(b.leader)!;
      const s = depthSpeed(b.depth) * this.k('speed');
      b.startle = Math.max(0, b.startle - dt);
      b.flap += dt * (1.6 + b.startle * 1.5) * this.k('wingbeat');
      if (b.slot === 0) {
        b.heading = this.course.heading + Math.sin(this.time * 0.1 + b.seed) * 0.08;
        const v = 70 * s * (1 + b.startle * 0.4);
        b.x += Math.cos(b.heading) * v * dt;
        b.y += (Math.sin(b.heading) * v - b.startle * 30) * dt;
        if (this.course.recycle(b, habitat, 260)) {
          for (const f of this.birds) if (f.leader === b.id && f !== b) { f.x = b.x; f.y = b.y; }
        }
      } else {
        // Hold the V slot: behind and to the side of the leader.
        const span = grid.cellWidth * 16 * depthScale(lead.depth) * this.k('size');
        const back = Math.abs(b.slot) * span * 0.8;
        const side = b.slot * span * 0.55;
        const hx = Math.cos(lead.heading);
        const hy = Math.sin(lead.heading);
        const tx = lead.x - hx * back - hy * side;
        const ty = lead.y - hy * back + hx * side + Math.sin(this.time * 0.6 + b.seed) * 4;
        b.x += (tx - b.x) * Math.min(1, dt * 1.5);
        b.y += (ty - b.y) * Math.min(1, dt * 1.5);
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
      // Side view: body along the heading, wings sweeping up and down.
      const L = grid.cellWidth * 20 * depthScale(b.depth) * this.k('size');
      const haze = (1 - b.depth) * fog;
      const white = mix(hex('#eef2f7'), bg, haze);
      const grey = mix(hex('#9aa3b2'), bg, haze);
      const black = mix(hex('#6b7280'), bg, haze * 0.8);
      const alpha = 0.55 + b.depth * 0.45;
      const layer = b.depth > 0.6 ? Layer.FX : Layer.NEAR;
      const fx = Math.cos(b.heading);
      const fy = Math.sin(b.heading);
      const ux = 0;
      const uy = -1; // screen up
      const P = (along: number, up: number): [number, number] => [b.x + fx * along * L + ux * up * L, b.y + fy * along * L + uy * up * L];
      const beat = Math.sin(b.flap * Math.PI);
      // Never let the wing collapse to a flat line mid-beat.
      const wingUp = (beat >= 0 ? 1 : -1) * Math.max(0.22, Math.abs(beat)) * 0.85;

      // Far wing (behind the body), a little smaller and greyer.
      this.wing(grid, P, wingUp * 0.8, 0.85, grey, black, alpha * 0.8, layer);
      // Body
      const body: [number, number][] = [];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        body.push(P(Math.cos(a) * 0.3, Math.sin(a) * 0.07));
      }
      drawPolygon(grid, body, white, alpha, layer, code('-'), grey);
      // Tail wedge
      drawPolygon(grid, [P(-0.26, 0.05), P(-0.42, 0.02), P(-0.26, -0.04)], black, alpha, layer);
      // Neck, head, crown, beak
      const [nx0, ny0] = P(0.26, 0.02);
      const [hx, hy] = P(0.56, 0.06);
      drawLine(grid, nx0, ny0, hx, hy, white, alpha, layer);
      spot(grid, hx, hy, code('●'), mix(hex('#dc2626'), bg, haze), alpha, layer);
      const [bx, by] = P(0.7, 0.04);
      drawLine(grid, hx, hy, bx, by, mix(hex('#94a3b8'), bg, haze), alpha * 0.9, layer);
      // Trailing legs
      const [lx0, ly0] = P(-0.24, -0.03);
      const [lx1, ly1] = P(-0.62, -0.06);
      drawLine(grid, lx0, ly0, lx1, ly1, grey, alpha * 0.8, layer);
      // Near wing
      this.wing(grid, P, wingUp, 1, white, black, alpha, layer);
    }
  }

  /** One wing: white inner part, black flight feathers at the tip. */
  private wing(
    grid: WorldContext['grid'],
    P: (along: number, up: number) => [number, number],
    up: number,
    scale: number,
    inner: number,
    tip: number,
    alpha: number,
    layer: number
  ): void {
    const reach = 0.78 * scale;
    const T = P(-0.18, up * reach);
    const Tb = P(-0.3, up * reach * 0.92);
    const M1 = P(-0.07, up * reach * 0.62);
    const M2 = P(-0.2, up * reach * 0.58);
    drawPolygon(grid, [P(0.12, 0.02), P(-0.14, 0.02), M2, M1], inner, alpha, layer);
    drawPolygon(grid, [M1, M2, Tb, T], tip, alpha, layer);
  }
}
