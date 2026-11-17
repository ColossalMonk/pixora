import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { EnergyField } from '../physics/EnergyField';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { drawBody, drawLine, spot } from '../draw/Shapes';
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
  breathPhase: number;
  palette: number;
}

/**
 * 4 natural frog palettes:
 * 1. Tree Frog: leaf green, bright chartreuse, soft cream belly.
 * 2. Leopard Frog: deep forest, olive, golden yellow, dark ringed spots.
 * 3. Blue Poison Dart Frog: midnight navy, electric cyan, sky blue, azure.
 * 4. Golden Mantella: mahogany bronze, blazing amber, sunlit yellow.
 */
const PALETTES = [
  gradientLUT([[0, hex('#14532d')], [0.3, hex('#16a34a')], [0.6, hex('#4ade80')], [0.85, hex('#dcfce7')], [1, hex('#fef9c3')]]),
  gradientLUT([[0, hex('#1c1917')], [0.35, hex('#4d7c0f')], [0.65, hex('#a3e635')], [0.85, hex('#ecfccb')], [1, hex('#fef08a')]]),
  gradientLUT([[0, hex('#082f49')], [0.35, hex('#0284c7')], [0.65, hex('#38bdf8')], [0.85, hex('#e0f2fe')], [1, hex('#ffffff')]]),
  gradientLUT([[0, hex('#451a03')], [0.35, hex('#b45309')], [0.65, hex('#f59e0b')], [0.85, hex('#fef08a')], [1, hex('#fffbeb')]]),
];

const EYE_COLORS = [hex('#facc15'), hex('#f59e0b'), hex('#38bdf8'), hex('#fbbf24')];
const SKIN = Uint32Array.from(Array.from('.:;+=').map(code));

/**
 * Frogs seen from above with bulging tracked eyes, rhythmic gular breathing,
 * folded-to-extended leg kicking kinematics, and explosive leaps landing with splash rings.
 */
export class Frogs extends AnimalBase {
  public readonly id = 'frogs';
  public readonly zone = 'water' as const;
  public static knobs: Knob[] = [
    { key: 'patience', label: 'Patience', min: 0.3, max: 3, step: 0.05, value: 1, hint: 'How long they sit between leaps.' },
    { key: 'leap', label: 'Leap length', min: 60, max: 450, step: 10, value: 200 },
  ];
  private course = new Course(Math.random() < 0.5 ? 0 : Math.PI, 0.75);
  private frogs: Frog[] = [];
  private splash = new EnergyField();
  private splashLut = gradientLUT([[0, hex('#164e63')], [0.5, hex('#38bdf8')], [1, hex('#e0f2fe')]]);

  public init(ctx: WorldContext): void {
    this.splash.resize(ctx.grid.cols, ctx.grid.rows, ctx.grid.aspect);
    const n = population(ctx.habitat, 100000, this.k('density'), ctx.quality, 2, 22);
    this.frogs = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, ctx.habitat, this.k('farthest'));
      c.heading = this.course.heading + (Math.random() - 0.5) * 0.8;
      this.frogs.push({
        ...c,
        state: 'sit',
        timer: Math.random() * 4,
        fromX: c.x,
        fromY: c.y,
        toX: c.x,
        toY: c.y,
        t: 0,
        dur: 0.6,
        arc: 35,
        blink: Math.random() * 4,
        breathPhase: Math.random() * Math.PI * 2,
        palette: i % PALETTES.length,
      });
    }
  }

  private landing(f: Frog, angle: number, h: WorldContext['habitat']): [number, number] {
    const base = this.k('leap') * (0.75 + f.depth * 0.45);
    for (const k of [1, 0.85, 1.25, 0.65, 1.4]) {
      const x = f.x + Math.cos(angle) * base * k;
      const y = f.y + Math.sin(angle) * base * k * 0.85;
      if (this.frogs.every((o) => o === f || Math.hypot(o.toX - x, o.toY - y) > 75)) {
        return [x, y];
      }
    }
    return [f.x + Math.cos(angle) * base, Math.min(h.bottom, Math.max(h.top, f.y + Math.sin(angle) * base * 0.85))];
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat, grid } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;

    for (const f of this.frogs) {
      f.blink -= dt;
      if (f.blink < -0.15) f.blink = 2.5 + Math.random() * 4;
      f.breathPhase += dt * 3.5; // rhythmic throat breathing

      let scared = false;
      if (input.active && f.state === 'sit' && Math.hypot(input.x - f.x, input.y - f.y) < 130) scared = true;
      if (input.clicks.length && f.state === 'sit') scared = true;

      if (f.state === 'sit') {
        f.timer -= dt;
        if (f.timer <= 0 || scared) {
          f.state = 'crouch';
          f.timer = scared ? 0.07 : 0.32;
          let angle = this.course.heading + (Math.random() - 0.5) * 1.3;
          if (scared && input.x >= 0) {
            angle = Math.atan2(f.y - input.y, f.x - input.x) + (Math.random() - 0.5) * 0.5;
          }
          f.heading = angle;
          f.fromX = f.x;
          f.fromY = f.y;
          [f.toX, f.toY] = this.landing(f, angle, habitat);
        } else if (input.active) {
          // Eyes and head watch the pointer
          const want = Math.atan2(input.y - f.y, input.x - f.x);
          const d = Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading));
          if (Math.hypot(input.x - f.x, input.y - f.y) < 320) {
            f.heading += d * dt * 2.0;
          }
        }
      } else if (f.state === 'crouch') {
        f.timer -= dt;
        if (f.timer <= 0) {
          f.state = 'leap';
          f.t = 0;
          const dist = Math.hypot(f.toX - f.fromX, f.toY - f.fromY);
          f.dur = 0.38 + dist / (950 * this.k('speed'));
          f.arc = Math.min(85, 25 + dist * 0.22);
          this.splash.stamp(f.fromX / cw, f.fromY / ch, 2.5, 0.65);
        }
      } else {
        f.t += dt / f.dur;
        const s = Math.min(1, f.t);
        const e = s * s * (3 - 2 * s);
        f.x = f.fromX + (f.toX - f.fromX) * e;
        f.y = f.fromY + (f.toY - f.fromY) * e;

        if (s >= 1) {
          f.state = 'sit';
          f.timer = (2 + Math.random() * 4.5) * this.k('patience');
          // Splash landing with concentric ripple rings
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            this.splash.add(f.x / cw + Math.cos(a) * 3.5, f.y / ch + Math.sin(a) * 3.5 * grid.aspect, 0.75);
          }
          this.splash.stamp(f.x / cw, f.y / ch, 3.2, 0.95);
        }
      }

      if (f.state === 'sit' && this.course.recycle(f, habitat, 100)) {
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

    // Concentric splash ripples
    renderField(grid, this.splash.values, {
      style,
      lut: this.splashLut,
      layer: Layer.SKY,
      threshold: 0.07,
      minAlpha: 0.05,
      alphaGain: 0.5,
    });

    const order = [...this.frogs].sort((a, b) => a.depth - b.depth);

    for (const f of order) {
      let lift = 0;
      let squash = 1;
      let legExtend = 0;

      if (f.state === 'leap') {
        const s = Math.min(1, f.t);
        lift = 4 * s * (1 - s) * f.arc; // parabolic leap height
        legExtend = Math.sin(Math.min(1, s * 1.5) * Math.PI); // back legs kick straight out
      } else if (f.state === 'crouch') {
        squash = 0.82;
      }

      const base = cw * 10 * depthScale(f.depth) * this.k('size');
      const size = base * (1 + lift / 150);
      const L = size * squash;
      const breath = f.state === 'sit' ? Math.sin(f.breathPhase) * 0.06 : 0;
      const W = size * (0.86 + breath);
      const cx = f.x;
      const cy = f.y - lift;
      const layer = lift > 2 ? Layer.FX : f.depth > 0.5 ? Layer.NEAR : Layer.MID;
      const palette = PALETTES[f.palette];
      const eyeCol = EYE_COLORS[f.palette];

      // Ground shadow during high leap
      if (lift > 5) {
        const shadowR = size * 0.32;
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          spot(grid, f.x + Math.cos(a) * shadowR, f.y + 8 + Math.sin(a) * shadowR * 0.45, code('·'), bg, 0.7, Layer.FAR);
        }
      }

      // 1. Extended Hind Legs during leap
      if (f.state === 'leap' && legExtend > 0.15) {
        const hx = Math.cos(f.heading);
        const hy = Math.sin(f.heading);
        const lx = -hy;
        const ly = hx;
        const legCol = mix(palette[120], bg, (1 - f.depth) * fog);

        for (const side of [-1, 1]) {
          const hipX = cx - hx * L * 0.28 + lx * W * 0.25 * side;
          const hipY = cy - hy * L * 0.28 + ly * W * 0.25 * side;
          const kneeX = cx - hx * L * (0.55 + legExtend * 0.35) + lx * W * 0.42 * side;
          const kneeY = cy - hy * L * (0.55 + legExtend * 0.35) + ly * W * 0.42 * side;
          const footX = cx - hx * L * (0.85 + legExtend * 0.55) + lx * W * 0.25 * side;
          const footY = cy - hy * L * (0.85 + legExtend * 0.55) + ly * W * 0.25 * side;

          drawLine(grid, hipX, hipY, kneeX, kneeY, legCol, 0.9, layer);
          drawLine(grid, kneeX, kneeY, footX, footY, legCol, 0.9, layer);
          // Webbed foot / splayed toes
          spot(grid, footX + lx * cw * 0.8 * side, footY + ly * ch * 0.8 * side, code('·'), legCol, 0.9, layer);
          spot(grid, footX - lx * cw * 0.8 * side, footY - ly * ch * 0.8 * side, code('·'), legCol, 0.9, layer);
        }
      }

      // 2. Frog Body & Folded Thighs
      drawBody(grid, {
        x: cx,
        y: cy,
        heading: f.heading,
        length: L,
        width: W,
        extent: 1.15,
        sampler: (u, v) => {
          const av = Math.abs(v);
          // Torso ellipse
          const torso = (u / 0.42) ** 2 + (v / 0.36) ** 2;
          if (torso < 1.0) {
            // Dark ringed spots on back
            const spots = Math.sin(u * 22 + f.seed) * Math.sin(v * 18) > 0.52 ? -0.32 : 0;
            // Pale central spine stripe
            const stripe = av < 0.05 ? 0.25 : 0;
            return Math.max(0.12, Math.min(1.0, 0.52 + (0.5 - torso) * 0.3 + spots + stripe));
          }

          // Folded muscular thighs while sitting/crouching
          if (f.state !== 'leap' || legExtend <= 0.15) {
            const thigh = ((u + 0.24) / 0.2) ** 2 + ((av - 0.42) / 0.13) ** 2;
            if (thigh < 1.0) return 0.38; // muscular folded thighs
          }

          // Front forelimbs
          const foreleg = ((u - 0.24) / 0.1) ** 2 + ((av - 0.4) / 0.1) ** 2;
          if (foreleg < 1.0) return 0.36;

          return 0;
        },
        lut: palette,
        texture: SKIN,
        layer,
        solid: true,
        opacity: 0.65 + f.depth * 0.35,
        fog: (1 - f.depth) * fog,
        fogColor: bg,
      });

      // 3. Bulging Dorsal Eyes tracking focus with dark horizontal slit pupils
      const hx = Math.cos(f.heading);
      const hy = Math.sin(f.heading);
      const lx = -hy;
      const ly = hx;
      const blink = f.blink < 0;

      for (const side of [-1, 1]) {
        const ex = cx + hx * L * 0.32 + lx * W * 0.24 * side;
        const ey = cy + hy * L * 0.32 + ly * W * 0.24 * side;
        // Golden iris pedestal
        grid.putSolid(
          Math.floor(ex / cw),
          Math.floor(ey / ch),
          code(blink ? '-' : '●'),
          hex('#0f172a'),
          1,
          eyeCol,
          0.85 + f.depth * 0.15,
          layer === Layer.FX ? Layer.FX : Layer.FRONT
        );
      }
    }
  }
}
