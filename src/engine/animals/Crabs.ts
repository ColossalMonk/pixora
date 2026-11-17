import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { drawBody, drawLine, spot } from '../draw/Shapes';
import { Creature, Knob, depthScale, depthSpeed, newCreature, population } from './kit';

interface Crab extends Creature {
  dir: 1 | -1;
  walk: number;
  /** Seconds left paused (waving claws in threat display). */
  pause: number;
  /** 0 = out, 1 = fully tucked in. */
  hide: number;
  threatDisplay: number;
  baseY: number;
  color: number;
  /** Sand footprints: [x, y, alpha] */
  tracks: [number, number, number][];
}

/**
 * 4 vibrant crustacean palettes:
 * 1. Red Rock / Dungeness Crab: deep ruby, scarlet vermilion, flame orange, cream.
 * 2. Atlantic Blue Crab: deep navy, sapphire, electric cyan, bright coral tips.
 * 3. Ghost Crab: pale bisque, sun-bleached ivory, golden sand, white.
 * 4. Purple Shore Crab: royal plum, vibrant violet, amethyst, pearlescent lilac.
 */
const SHELLS = [
  gradientLUT([[0, hex('#450a0a')], [0.35, hex('#b91c1c')], [0.7, hex('#ea580c')], [1, hex('#ffedd5')]]),
  gradientLUT([[0, hex('#082f49')], [0.35, hex('#0284c7')], [0.7, hex('#38bdf8')], [1, hex('#fca5a5')]]),
  gradientLUT([[0, hex('#451a03')], [0.35, hex('#b45309')], [0.7, hex('#fde047')], [1, hex('#ffffff')]]),
  gradientLUT([[0, hex('#3b0764')], [0.35, hex('#7e22ce')], [0.7, hex('#c084fc')], [1, hex('#faf5ff')]]),
];

const SHELL_TEX = Uint32Array.from(Array.from('.:o*#').map(code));

/**
 * Crabs scuttling sideways along the ground with 8 jointed tripod walking legs,
 * raised periscope eyestalks, and snapping chelipeds (claws) that wave in aggressive
 * threat displays when paused or startled.
 */
export class Crabs extends AnimalBase {
  public readonly id = 'crabs';
  public readonly zone = 'ground' as const;
  public static knobs: Knob[] = [
    { key: 'shy', label: 'Shyness', min: 0, max: 2, step: 0.05, value: 1, hint: 'How far away the pointer makes them hide.' },
  ];
  private crabs: Crab[] = [];

  public init(ctx: WorldContext): void {
    const { habitat } = ctx;
    const ground = habitat.groundY ?? habitat.bottom - 30;
    const band = Math.min(230, (habitat.bottom - habitat.top) * 0.35);
    const n = population({ ...habitat, top: ground - band, bottom: ground }, 20000, this.k('density'), ctx.quality, 2, 22);
    this.crabs = [];

    for (let i = 0; i < n; i++) {
      const c = newCreature(i, habitat, this.k('farthest'));
      const baseY = ground - (1 - c.depth) * band - 12;
      this.crabs.push({
        ...c,
        y: baseY,
        baseY,
        dir: Math.random() < 0.5 ? 1 : -1,
        walk: 0,
        pause: Math.random() * 3,
        hide: 0,
        threatDisplay: 0,
        color: i % SHELLS.length,
        tracks: [],
      });
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, habitat } = ctx;
    const speed = this.k('speed');

    for (const c of input.clicks) {
      for (const k of this.crabs) {
        if (Math.abs(k.x - c.x) < 320) {
          k.dir = k.x < c.x ? -1 : 1;
          k.pause = 0;
          k.walk = 2.2;
          k.threatDisplay = 1.8;
        }
      }
    }

    for (const k of this.crabs) {
      const distToPointer = Math.hypot(input.x - k.x, input.y - k.y);
      const near = input.active && distToPointer < 150 * this.k('shy');
      k.hide += ((near ? 1 : 0) - k.hide) * Math.min(1, dt * (near ? 10 : 2));

      if (k.threatDisplay > 0) k.threatDisplay -= dt;

      if (k.hide > 0.5) continue;

      if (k.pause > 0) {
        k.pause -= dt;
        k.threatDisplay = Math.max(k.threatDisplay, 0.5);
        continue;
      }

      k.walk -= dt;
      if (k.walk <= 0 && Math.random() < dt * 0.55) {
        k.pause = 0.8 + Math.random() * 2.8;
        k.walk = 1.6 + Math.random() * 3.2;
        if (Math.random() < 0.38) k.dir = k.dir === 1 ? -1 : 1;
      }

      const stepDist = k.dir * 58 * depthSpeed(k.depth) * speed * dt;
      k.x += stepDist;
      k.phase += dt * 15 * speed;
      k.y = k.baseY + Math.abs(Math.sin(k.phase)) * -1.8;

      // Leave sand tracks periodically while walking
      if (Math.random() < dt * 6) {
        k.tracks.push([k.x, k.y + 4, 1.0]);
        if (k.tracks.length > 8) k.tracks.shift();
      }

      // Fade existing tracks
      for (let t = 0; t < k.tracks.length; t++) {
        k.tracks[t][2] -= dt * 0.25;
      }
      k.tracks = k.tracks.filter((t) => t[2] > 0);

      if (k.x < habitat.left - 70) k.x = habitat.right + 60;
      if (k.x > habitat.right + 70) k.x = habitat.left - 60;
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, bg } = ctx;
    const fog = this.k('fog');
    const order = [...this.crabs].sort((a, b) => a.depth - b.depth);

    for (const k of order) {
      const s = grid.cellWidth * 9.5 * depthScale(k.depth) * this.k('size');
      const squash = 1 - k.hide * 0.58;
      const lut = SHELLS[k.color];
      const layer = k.depth > 0.65 ? Layer.FRONT : Layer.NEAR;
      const legCol = mix(lut[140], bg, (1 - k.depth) * fog);
      const clawCol = mix(lut[220], bg, (1 - k.depth) * fog * 0.7);
      const alpha = 0.65 + k.depth * 0.35;

      // 1. Sand tracks left by walking legs
      for (const [tx, ty, ta] of k.tracks) {
        spot(grid, tx, ty, code('·'), bg, ta * 0.5, Layer.FAR);
      }

      // 2. 4 Pairs of Walking Legs (8 legs total, jointed tripod scuttling!)
      if (k.hide < 0.65) {
        for (const side of [-1, 1]) {
          for (let l = 0; l < 4; l++) {
            // Alternating tripod gait phase offset
            const legPhase = k.phase + l * 1.5 + (side > 0 ? Math.PI : 0);
            const lift = Math.max(0, Math.sin(legPhase)) * 3.5;
            const reach = Math.cos(legPhase) * 2.0;

            const x0 = k.x + side * s * (0.16 + l * 0.08);
            const y0 = k.y + s * 0.06;
            // Knee joint
            const kneeX = x0 + side * s * 0.18 + reach;
            const kneeY = y0 - s * 0.04 - lift * 0.5;
            // Foot / dactylus tip
            const footX = x0 + side * s * 0.3 + reach;
            const footY = y0 + s * 0.22 - lift;

            drawLine(grid, x0, y0, kneeX, kneeY, legCol, alpha * 0.9, layer);
            drawLine(grid, kneeX, kneeY, footX, footY, legCol, alpha * 0.9, layer);
          }
        }
      }

      // 3. Carapace (broad crustacean shell with lateral spine serrations)
      drawBody(grid, {
        x: k.x,
        y: k.y + k.hide * s * 0.14,
        heading: 0,
        length: s * 1.1,
        width: s * 0.62 * squash,
        extent: 0.75,
        sampler: (u, v) => {
          // u: -0.5 to +0.5 (lateral width)
          // v: -0.5 to +0.5 (anterior to posterior)
          const lateralSpine = Math.sin(Math.abs(u) * 28) * 0.04;
          const shell = (u / (0.44 + lateralSpine)) ** 2 + (v / 0.42) ** 2;
          if (shell > 1.0) return 0;

          // Intricate carapace grooves / cardiac-gastric ridges
          const groove = Math.abs(u) < 0.04 ? -0.15 : 0;
          const ridge = Math.abs(v) < 0.05 && Math.abs(u) < 0.3 ? 0.2 : 0;

          return Math.max(0.2, Math.min(1.0, 0.4 + (-v + 0.5) * 0.4 + groove + ridge));
        },
        lut,
        texture: SHELL_TEX,
        layer,
        solid: true,
        opacity: alpha,
        fog: (1 - k.depth) * fog,
        fogColor: bg,
      });

      // 4. Chelipeds (Massive articulated claws with threat display)
      if (k.hide < 0.72) {
        const isThreatening = k.threatDisplay > 0 || k.pause > 0;
        const wave = isThreatening ? Math.sin(this.time * 8 + k.seed) * 0.45 : 0;

        for (const side of [-1, 1]) {
          const armBaseX = k.x + side * s * 0.28;
          const armBaseY = k.y - s * 0.05;

          // Claw raised high during threat display
          const clawLift = isThreatening ? s * (0.28 + wave * 0.15) : s * 0.1;
          const elbowX = k.x + side * s * 0.48;
          const elbowY = k.y - clawLift * 0.6;
          const pincerX = k.x + side * s * 0.58;
          const pincerY = k.y - clawLift;

          // Upper arm and forearm
          drawLine(grid, armBaseX, armBaseY, elbowX, elbowY, legCol, alpha, layer);
          drawLine(grid, elbowX, elbowY, pincerX, pincerY, legCol, alpha, layer);

          // Pincer palm and snapping fingers
          const fingerSnap = isThreatening && Math.sin(this.time * 12 + k.seed) > 0 ? 0.08 : 0.03;
          // Fixed finger
          spot(grid, pincerX, pincerY - s * 0.04, code(side > 0 ? '}' : '{'), clawCol, 1.0, Layer.FRONT);
          // Movable dactyl finger
          spot(grid, pincerX + side * s * fingerSnap, pincerY - s * 0.08, code(side > 0 ? '>' : '<'), clawCol, 1.0, Layer.FRONT);
        }
      }

      // 5. Periscope Eyestalks with black bead eyes
      const eyeY = k.y - s * (0.34 - k.hide * 0.22);
      const stalkY = k.y - s * (0.22 - k.hide * 0.14);
      for (const side of [-1, 1]) {
        const eyeX = k.x + side * s * 0.12;
        // Eyestalk
        drawLine(grid, k.x + side * s * 0.08, stalkY, eyeX, eyeY, legCol, alpha * 0.9, layer);
        // Eyeball
        spot(grid, eyeX, eyeY, code('●'), hex('#09090b'), 1.0, Layer.FRONT);
        // Highlight speck
        spot(grid, eyeX, eyeY - 1, code('·'), hex('#ffffff'), 0.85, Layer.FRONT);
      }
    }
  }
}
