import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { EnergyField } from '../physics/EnergyField';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex } from '../core/Color';
import { drawBody, spot } from '../draw/Shapes';
import { renderField } from '../draw/Field';
import { Course, Creature, Knob, depthScale, newCreature, population } from './kit';

interface Frog extends Creature {
  state: 'sit' | 'crouch' | 'leap';
  timer: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  dur: number;
  arc: number;
  blink: number;
  palette: number;
}

const PALETTES = [
  gradientLUT([[0, hex('#3f3a0b')], [0.3, hex('#65a30d')], [0.55, hex('#a3e635')], [0.8, hex('#ecfccb')], [1, hex('#fef9c3')]]),
  gradientLUT([[0, hex('#14361c')], [0.3, hex('#15803d')], [0.55, hex('#4ade80')], [0.8, hex('#dcfce7')], [1, hex('#f0fdf4')]]),
  gradientLUT([[0, hex('#1e3a2f')], [0.3, hex('#0f766e')], [0.55, hex('#5eead4')], [0.8, hex('#ccfbf1')], [1, hex('#f0fdfa')]]),
];
const SKIN = Uint32Array.from(Array.from('.:;+=').map(code));

/**
 * Frogs seen from above: they sit (breathing, blinking), crouch, then leap
 * along the course to a spot clear of other frogs — growing larger at the top
 * of the arc, kicking their back legs out — and land with a splash ring. A
 * pointer that comes close makes a frog leap away; a click startles them all.
 */
export class Frogs extends AnimalBase {
  public readonly id = 'frogs';
  public readonly zone = 'water' as const;
  public static knobs: Knob[] = [
    { key: 'patience', label: 'Patience', min: 0.3, max: 3, step: 0.05, value: 1, hint: 'How long they sit between leaps.' },
    { key: 'leap', label: 'Leap length', min: 60, max: 400, step: 10, value: 180 },
  ];
  private course = new Course(Math.random() < 0.5 ? 0 : Math.PI, 0.7);
  private frogs: Frog[] = [];
  private splash = new EnergyField();
  private splashLut = gradientLUT([[0, hex('#1e4d5c')], [1, hex('#d5f5ff')]]);

  public init(ctx: WorldContext): void {
    this.splash.resize(ctx.grid.cols, ctx.grid.rows, ctx.grid.aspect);
    const n = population(ctx.habitat, 110000, this.k('density'), ctx.quality, 2, 24);
    this.frogs = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, ctx.habitat, this.k('farthest'));
      c.heading = this.course.heading + (Math.random() - 0.5);
      this.frogs.push({ ...c, state: 'sit', timer: Math.random() * 4, fromX: c.x, fromY: c.y, toX: c.x, toY: c.y, t: 0, dur: 0.6, arc: 30, blink: Math.random() * 4, palette: i % PALETTES.length });
    }
  }

  private landing(f: Frog, angle: number, h: WorldContext['habitat']): [number, number] {
    // Try a few leap lengths and take the first clear of other frogs.
    const base = this.k('leap') * (0.7 + f.depth * 0.5);
    for (const k of [1, 0.8, 1.2, 0.6, 1.4]) {
      const x = f.x + Math.cos(angle) * base * k;
      const y = f.y + Math.sin(angle) * base * k * 0.8;
      if (this.frogs.every((o) => o === f || Math.hypot(o.toX - x, o.toY - y) > 70)) return [x, y];
    }
    return [f.x + Math.cos(angle) * base, Math.min(h.bottom, Math.max(h.top, f.y + Math.sin(angle) * base * 0.8))];
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat, grid } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    for (const f of this.frogs) {
      f.blink -= dt;
      if (f.blink < -0.14) f.blink = 2 + Math.random() * 4;
      f.phase += dt * 2.6;
      let scared = false;
      if (input.active && f.state === 'sit' && Math.hypot(input.x - f.x, input.y - f.y) < 110) scared = true;
      if (input.clicks.length && f.state === 'sit') scared = true;

      if (f.state === 'sit') {
        f.timer -= dt;
        if (f.timer <= 0 || scared) {
          f.state = 'crouch';
          f.timer = scared ? 0.08 : 0.35;
          let angle = this.course.heading + (Math.random() - 0.5) * 1.2;
          if (scared && input.x >= 0) angle = Math.atan2(f.y - input.y, f.x - input.x) + (Math.random() - 0.5) * 0.6;
          f.heading = angle;
          f.fromX = f.x;
          f.fromY = f.y;
          [f.toX, f.toY] = this.landing(f, angle, habitat);
        } else if (input.active) {
          // Watch the pointer.
          const want = Math.atan2(input.y - f.y, input.x - f.x);
          const d = Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading));
          if (Math.hypot(input.x - f.x, input.y - f.y) < 300) f.heading += d * dt * 1.5;
        }
      } else if (f.state === 'crouch') {
        f.timer -= dt;
        if (f.timer <= 0) {
          f.state = 'leap';
          f.t = 0;
          const dist = Math.hypot(f.toX - f.fromX, f.toY - f.fromY);
          f.dur = 0.4 + dist / (900 * this.k('speed'));
          f.arc = Math.min(80, 20 + dist * 0.2);
          this.splash.stamp(f.fromX / cw, f.fromY / ch, 2, 0.5);
        }
      } else {
        f.t += dt / f.dur;
        const s = Math.min(1, f.t);
        const e = s * s * (3 - 2 * s);
        f.x = f.fromX + (f.toX - f.fromX) * e;
        f.y = f.fromY + (f.toY - f.fromY) * e;
        if (s >= 1) {
          f.state = 'sit';
          f.timer = (2 + Math.random() * 5) * this.k('patience');
          // Splash ring
          for (let k = 0; k < 14; k++) {
            const a = (k / 14) * Math.PI * 2;
            this.splash.add(f.x / cw + Math.cos(a) * 3, f.y / ch + Math.sin(a) * 3 * grid.aspect, 0.6);
          }
          this.splash.stamp(f.x / cw, f.y / ch, 2.5, 0.8);
        }
      }
      if (f.state === 'sit' && this.course.recycle(f, habitat, 90)) {
        f.toX = f.x;
        f.toY = f.y;
      }
    }
    this.splash.step(dt, 1.8, true);
  }

  public render(ctx: WorldContext): void {
    const { grid, style, bg } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const fog = this.k('fog');
    renderField(grid, this.splash.values, { style, lut: this.splashLut, layer: Layer.SKY, threshold: 0.07, minAlpha: 0.06, alphaGain: 0.5 });
    const order = [...this.frogs].sort((a, b) => a.depth - b.depth);
    for (const f of order) {
      let lift = 0;
      let squash = 1;
      let legs = 0;
      if (f.state === 'leap') {
        const s = Math.min(1, f.t);
        lift = 4 * s * (1 - s) * f.arc;
        legs = Math.sin(Math.min(1, s * 1.6) * Math.PI);
      } else if (f.state === 'crouch') squash = 0.85;
      const base = cw * 9 * depthScale(f.depth) * this.k('size');
      const size = base * (1 + lift / 160);
      const L = size * squash;
      const W = size * 0.84 * (f.state === 'sit' ? 1 + Math.sin(f.phase) * 0.04 : 1);
      const cx = f.x;
      const cy = f.y - lift;
      const layer = lift > 2 ? Layer.FX : f.depth > 0.5 ? Layer.NEAR : Layer.MID;
      if (lift > 4) {
        const rr = size * 0.3;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          spot(grid, f.x + Math.cos(a) * rr, f.y + 10 + Math.sin(a) * rr * 0.5, code('·'), bg, 0.6, Layer.MID);
        }
      }
      drawBody(grid, {
        x: cx, y: cy, heading: f.heading, length: L, width: W, extent: 1.1,
        sampler: (u, v) => {
          const av = Math.abs(v);
          const e = (u / 0.42) ** 2 + (v / 0.36) ** 2;
          if (e < 1) {
            const spots = Math.sin(u * 23 + f.seed) * Math.sin(v * 19) > 0.55 ? -0.3 : 0;
            return Math.max(0.1, Math.min(1, 0.5 + (0.5 - e) * 0.3 + spots + (av < 0.05 ? 0.2 : 0)));
          }
          if (legs > 0.2) {
            const lu = u + 0.42 + legs * 0.3;
            if ((lu / 0.3) ** 2 + ((av - 0.22) / 0.08) ** 2 < 1) return 0.35;
          } else if (((u + 0.26) / 0.18) ** 2 + ((av - 0.42) / 0.12) ** 2 < 1) return 0.3;
          if (((u - 0.22) / 0.08) ** 2 + ((av - 0.42) / 0.1) ** 2 < 1) return 0.35;
          return 0;
        },
        lut: PALETTES[f.palette], texture: SKIN, layer, solid: true, opacity: 0.6 + f.depth * 0.4,
        fog: (1 - f.depth) * fog, fogColor: bg,
      });
      const hx = Math.cos(f.heading);
      const hy = Math.sin(f.heading);
      const blink = f.blink < 0;
      for (const side of [-1, 1]) {
        const ex = cx + hx * L * 0.3 - hy * W * 0.22 * side;
        const ey = cy + hy * L * 0.3 + hx * W * 0.22 * side;
        grid.putSolid(Math.floor(ex / cw), Math.floor(ey / ch), code(blink ? '-' : '●'), hex('#101410'), 1, hex('#f0f7d8'), 0.6 + f.depth * 0.4, layer === Layer.FX ? Layer.FX : Layer.FRONT);
      }
    }
  }
}
