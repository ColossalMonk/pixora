import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { hex, mix } from '../core/Color';
import { drawLine, drawPolygon, spot } from '../draw/Shapes';
import { Course, Creature, Knob, depthScale, depthSpeed, newCreature, population, turnToward } from './kit';

interface Fly extends Creature {
  /** Seconds left hovering in place. */
  hover: number;
  tx: number;
  ty: number;
  colorIdx: number;
  wingBeat: number;
  shimmer: number;
}

/**
 * 5 striking dragonfly species palettes:
 * 1. Emerald Hawker: iridescent neon emerald, mint shimmer, dark carbon.
 * 2. Emperor Blue: electric sapphire, radiant cyan, obsidian black.
 * 3. Golden Chaser: blazing amber, sunlit gold, mahogany.
 * 4. Ruby Darter: vivid scarlet crimson, coral highlight, jet black.
 * 5. Violet Skimmer: royal violet, electric lavender, midnight navy.
 */
const PALETTES = [
  { body: hex('#10b981'), eye: hex('#34d399'), wing: hex('#ecfdf5'), dark: hex('#064e3b') },
  { body: hex('#0284c7'), eye: hex('#38bdf8'), wing: hex('#f0f9ff'), dark: hex('#0c4a6e') },
  { body: hex('#d97706'), eye: hex('#facc15'), wing: hex('#fefce8'), dark: hex('#78350f') },
  { body: hex('#dc2626'), eye: hex('#f87171'), wing: hex('#fff1f2'), dark: hex('#7f1d1d') },
  { body: hex('#7c3aed'), eye: hex('#c084fc'), wing: hex('#faf5ff'), dark: hex('#4c1d95') },
];

/**
 * Striking hawker dragonflies that dart at high speed, dead-stop hover, and pivot.
 * Large iridescent bodies with bulging compound eyes, muscular thorax,
 * long needle-thin segmented abdomen, and double pairs of shimmering veined wings.
 */
export class Dragonflies extends AnimalBase {
  public readonly id = 'dragonflies';
  public readonly zone = 'any' as const;
  public static knobs: Knob[] = [
    { key: 'hover', label: 'Hover time', min: 0.2, max: 4, step: 0.1, value: 1.4, hint: 'How long they hover between darts.' },
    { key: 'dart', label: 'Dart length', min: 60, max: 450, step: 10, value: 220, hint: 'Distance covered in a single dart.' },
  ];
  private course = new Course(0, 0.85);
  private flies: Fly[] = [];

  public init(ctx: WorldContext): void {
    const n = population(ctx.habitat, 110000, this.k('density'), ctx.quality, 2, 22);
    this.flies = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, ctx.habitat, this.k('farthest'));
      c.heading = this.course.heading + (Math.random() - 0.5) * 0.8;
      this.flies.push({
        ...c,
        hover: Math.random() * 2,
        tx: c.x,
        ty: c.y,
        colorIdx: i % PALETTES.length,
        wingBeat: Math.random() * Math.PI * 2,
        shimmer: Math.random() * 100,
      });
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat } = ctx;
    const speed = this.k('speed');

    for (const f of this.flies) {
      f.wingBeat += dt * 45; // high-speed wing vibration
      f.shimmer += dt * 8;

      let flee = false;
      if (input.active && Math.hypot(input.x - f.x, input.y - f.y) < 140) flee = true;
      for (const c of input.clicks) {
        if (Math.hypot(c.x - f.x, c.y - f.y) < 280) flee = true;
      }

      if (flee) {
        const a = Math.atan2(f.y - (input.y >= 0 ? input.y : f.y), f.x - (input.x >= 0 ? input.x : f.x)) + (Math.random() - 0.5) * 0.8;
        f.tx = f.x + Math.cos(a) * this.k('dart') * 1.6;
        f.ty = f.y + Math.sin(a) * this.k('dart') * 1.6;
        f.hover = 0;
      }

      f.hover -= dt;
      if (f.hover <= 0 && Math.hypot(f.tx - f.x, f.ty - f.y) < 12) {
        // Pick new dart destination ahead on the course
        const a = this.course.heading + (Math.random() - 0.5) * 1.8;
        const d = this.k('dart') * (0.6 + Math.random() * 0.8) * depthSpeed(f.depth);
        f.tx = f.x + Math.cos(a) * d;
        f.ty = f.y + Math.sin(a) * d * 0.7;
        f.hover = this.k('hover') * (0.5 + Math.random() * 1.0);
      }

      const dx = f.tx - f.x;
      const dy = f.ty - f.y;
      const dist = Math.hypot(dx, dy);

      // Explosive dart speed with snappy arrival
      const sp = Math.min(dist * 8, 750 * speed * depthSpeed(f.depth));
      f.vx += ((dist > 1 ? (dx / dist) * sp : 0) - f.vx) * Math.min(1, dt * 9);
      f.vy += ((dist > 1 ? (dy / dist) * sp : 0) - f.vy) * Math.min(1, dt * 9);

      // Hover micro-jitter
      const isHovering = f.hover > 0 && dist < 20;
      const jitterAmp = isHovering ? 0.6 : 0.2;
      f.x += f.vx * dt + Math.sin(this.time * 12 + f.seed) * jitterAmp;
      f.y += f.vy * dt + Math.cos(this.time * 10 + f.seed) * jitterAmp;

      if (Math.hypot(f.vx, f.vy) > 25) {
        f.heading = turnToward(f.heading, Math.atan2(f.vy, f.vx), dt * 14);
      }

      if (this.course.recycle(f, habitat, 80)) {
        f.tx = f.x;
        f.ty = f.y;
      }
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, bg } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const fog = this.k('fog');
    const order = [...this.flies].sort((a, b) => a.depth - b.depth);

    for (const f of order) {
      const s = depthScale(f.depth) * this.k('size');
      // Substantial size: long body and wide wingspan
      const L = cw * 16 * s;
      const wingSpan = L * 1.35;
      const pal = PALETTES[f.colorIdx];
      const bodyCol = mix(pal.body, bg, (1 - f.depth) * fog);
      const darkCol = mix(pal.dark, bg, (1 - f.depth) * fog);
      const eyeCol = mix(pal.eye, bg, (1 - f.depth) * fog * 0.5);
      const wingCol = mix(pal.wing, bg, (1 - f.depth) * fog * 0.7);
      const layer = f.depth > 0.65 ? Layer.FX : Layer.NEAR;
      const alpha = 0.65 + f.depth * 0.35;

      const hx = Math.cos(f.heading);
      const hy = Math.sin(f.heading);
      const lx = -hy;
      const ly = hx;

      const P = (along: number, across: number): [number, number] => [
        f.x + hx * along * L + lx * across * L,
        f.y + hy * along * L + ly * across * L,
      ];

      // 1. Long, slender needle abdomen (10 segmented rings tapering to tail claspers)
      const abdomenSegs = 10;
      for (let k = 1; k <= abdomenSegs; k++) {
        const t = k / abdomenSegs;
        const along = -0.15 - t * 0.65;
        const [px, py] = P(along, 0);
        const ringCol = k % 2 === 0 ? bodyCol : darkCol;
        const glyph = k === abdomenSegs ? code('>') : code(k % 2 ? '=' : '-');
        grid.put(Math.floor(px / cw), Math.floor(py / ch), glyph, ringCol, alpha * (1 - t * 0.25), layer);
      }

      // 2. Muscular Thorax (broad central core where wings hinge)
      const [tx0, ty0] = P(0.18, 0);
      const [tx1, ty1] = P(-0.14, 0);
      drawLine(grid, tx0, ty0, tx1, ty1, darkCol, alpha, layer);
      // Thorax width
      spot(grid, P(0.04, 0.04)[0], P(0.04, 0.04)[1], code('='), bodyCol, alpha, layer);
      spot(grid, P(0.04, -0.04)[0], P(0.04, -0.04)[1], code('='), bodyCol, alpha, layer);

      // 3. Double Pairs of Shimmering Veined Wings (Forewings & Hindwings)
      // Independent out-of-phase oscillation
      const foreBeat = Math.sin(f.wingBeat);
      const hindBeat = Math.sin(f.wingBeat + 1.2);

      for (const side of [-1, 1]) {
        // Forewing (anterior, longer, sweeps forward and out)
        const foreRoot = P(0.1, side * 0.06);
        const foreTip = P(0.12 + foreBeat * 0.06, side * wingSpan * 0.62);
        const forePost = P(-0.02 + foreBeat * 0.05, side * wingSpan * 0.52);
        const foreMid = P(0.06, side * wingSpan * 0.28);

        drawPolygon(
          grid,
          [foreRoot, foreMid, foreTip, forePost],
          wingCol,
          alpha * 0.55,
          layer,
          code('+'),
          wingCol
        );

        // Leading edge costa & dark pterostigma spot near wingtip
        drawLine(grid, foreRoot[0], foreRoot[1], foreTip[0], foreTip[1], wingCol, alpha * 0.9, layer);
        spot(grid, foreTip[0] - hx * L * 0.04, foreTip[1] - hy * L * 0.04, code('■'), darkCol, alpha, layer);

        // Hindwing (posterior, broader base, sits behind forewing)
        const hindRoot = P(-0.06, side * 0.06);
        const hindTip = P(-0.1 + hindBeat * 0.06, side * wingSpan * 0.54);
        const hindPost = P(-0.2 + hindBeat * 0.05, side * wingSpan * 0.44);
        const hindMid = P(-0.12, side * wingSpan * 0.24);

        drawPolygon(
          grid,
          [hindRoot, hindMid, hindTip, hindPost],
          wingCol,
          alpha * 0.5,
          layer,
          code(':'),
          wingCol
        );

        drawLine(grid, hindRoot[0], hindRoot[1], hindTip[0], hindTip[1], wingCol, alpha * 0.85, layer);
        spot(grid, hindTip[0] - hx * L * 0.04, hindTip[1] - hy * L * 0.04, code('■'), darkCol, alpha, layer);
      }

      // 4. Large Bulging Compound Eyes at the Head (iconic dragonfly feature!)
      const headAlong = 0.26;
      const eyeSpread = 0.065;
      for (const side of [-1, 1]) {
        const [ex, ey] = P(headAlong, side * eyeSpread);
        spot(grid, ex, ey, code('●'), eyeCol, 1.0, Layer.FRONT);
        // Bright light glint on the eye surface
        spot(grid, ex + hx * cw * 0.4, ey + hy * ch * 0.4, code('·'), hex('#ffffff'), 0.9, Layer.FRONT);
      }
    }
  }
}
