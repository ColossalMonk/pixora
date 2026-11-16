import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { hex, mix } from '../core/Color';
import { drawLine } from '../draw/Shapes';
import { Course, Creature, Knob, depthScale, depthSpeed, newCreature, population, turnToward } from './kit';

interface Fly extends Creature {
  /** Seconds left hovering. */
  hover: number;
  tx: number;
  ty: number;
  color: number;
}

const COLORS = [hex('#38bdf8'), hex('#22d3ee'), hex('#a3e635'), hex('#f87171'), hex('#c084fc')];

/**
 * Dragonflies: dart to a new spot ahead on the course, hover with a jitter,
 * dart again. Long segmented abdomen in tiles, a bright head, and four wings
 * whose shimmer flickers between two angles. They flee a pointer that gets close.
 */
export class Dragonflies extends AnimalBase {
  public readonly id = 'dragonflies';
  public readonly zone = 'any' as const;
  public static knobs: Knob[] = [
    { key: 'hover', label: 'Hover time', min: 0.2, max: 4, step: 0.1, value: 1.4 },
    { key: 'dart', label: 'Dart length', min: 40, max: 400, step: 10, value: 180 },
  ];
  private course = new Course(0, 0.8);
  private flies: Fly[] = [];

  public init(ctx: WorldContext): void {
    const n = population(ctx.habitat, 130000, this.k('density'), ctx.quality, 2, 24);
    this.flies = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, ctx.habitat, this.k('farthest'));
      this.flies.push({ ...c, hover: Math.random() * 2, tx: c.x, ty: c.y, color: COLORS[i % COLORS.length] });
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat } = ctx;
    const speed = this.k('speed');
    for (const f of this.flies) {
      let flee = false;
      if (input.active && Math.hypot(input.x - f.x, input.y - f.y) < 120) flee = true;
      for (const c of input.clicks) if (Math.hypot(c.x - f.x, c.y - f.y) < 260) flee = true;
      if (flee) {
        const a = Math.atan2(f.y - (input.y >= 0 ? input.y : f.y), f.x - (input.x >= 0 ? input.x : f.x)) + (Math.random() - 0.5);
        f.tx = f.x + Math.cos(a) * this.k('dart') * 1.4;
        f.ty = f.y + Math.sin(a) * this.k('dart') * 1.4;
        f.hover = 0;
      }
      f.hover -= dt;
      if (f.hover <= 0 && Math.hypot(f.tx - f.x, f.ty - f.y) < 8) {
        const a = this.course.heading + (Math.random() - 0.5) * 1.6;
        const d = this.k('dart') * (0.5 + Math.random()) * depthSpeed(f.depth);
        f.tx = f.x + Math.cos(a) * d;
        f.ty = f.y + Math.sin(a) * d * 0.6;
        f.hover = this.k('hover') * (0.5 + Math.random());
      }
      const dx = f.tx - f.x;
      const dy = f.ty - f.y;
      const dist = Math.hypot(dx, dy);
      const sp = Math.min(dist * 6, 600 * speed * depthSpeed(f.depth));
      f.vx += ((dist > 1 ? (dx / dist) * sp : 0) - f.vx) * Math.min(1, dt * 8);
      f.vy += ((dist > 1 ? (dy / dist) * sp : 0) - f.vy) * Math.min(1, dt * 8);
      // Hover jitter
      f.x += f.vx * dt + Math.sin(this.time * 9 + f.seed) * 0.4;
      f.y += f.vy * dt + Math.cos(this.time * 7 + f.seed) * 0.4;
      if (Math.hypot(f.vx, f.vy) > 20) f.heading = turnToward(f.heading, Math.atan2(f.vy, f.vx), dt * 10);
      f.phase += dt * 50;
      if (this.course.recycle(f, habitat, 60)) {
        f.tx = f.x;
        f.ty = f.y;
      }
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, bg } = ctx;
    const cw = grid.cellWidth;
    const fog = this.k('fog');
    const order = [...this.flies].sort((a, b) => a.depth - b.depth);
    for (const f of order) {
      const s = depthScale(f.depth) * this.k('size');
      const L = cw * 6 * s;
      const hx = Math.cos(f.heading);
      const hy = Math.sin(f.heading);
      const body = mix(f.color, bg, (1 - f.depth) * fog);
      const wing = mix(hex('#e0f2fe'), bg, (1 - f.depth) * fog * 0.7 + 0.15);
      const layer = f.depth > 0.6 ? Layer.FX : Layer.NEAR;
      const alpha = 0.5 + f.depth * 0.5;
      // Abdomen: tiles along the body, tapering
      const segs = Math.max(3, Math.round(L / cw));
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const px = f.x - hx * L * t;
        const py = f.y - hy * L * t;
        grid.putSolid(Math.floor(px / cw), Math.floor(py / grid.cellHeight), k === 0 ? 0 : code(k % 2 ? ':' : '·'), mix(body, 0, 0.5), alpha, k === 0 ? mix(body, 0xffffff, 0.25) : body, alpha * (1 - t * 0.35), layer);
      }
      // Wings: two pairs near the thorax, flickering between two sweep angles.
      const flick = Math.sin(f.phase) > 0 ? 0.35 : 0.6;
      const bx = f.x - hx * L * 0.18;
      const by = f.y - hy * L * 0.18;
      for (const side of [-1, 1]) {
        for (const pair of [0, 1]) {
          const a = f.heading + side * (Math.PI / 2 - (pair ? flick + 0.35 : flick));
          const wl = L * (pair ? 0.75 : 0.85);
          drawLine(grid, bx - hx * pair * cw * 0.6, by - hy * pair * cw * 0.6, bx + Math.cos(a) * wl, by + Math.sin(a) * wl * 0.8, wing, alpha * 0.8, layer);
        }
      }
    }
  }
}
