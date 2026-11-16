import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { drawBody, drawLine, spot } from '../draw/Shapes';
import { Creature, Knob, depthScale, depthSpeed, newCreature, population } from './kit';

interface Crab extends Creature {
  dir: 1 | -1;
  walk: number;
  /** Seconds left paused (waving claws). */
  pause: number;
  /** 0 = out, 1 = fully tucked in. */
  hide: number;
  baseY: number;
  color: number;
}

const SHELLS = [
  gradientLUT([[0, hex('#450a0a')], [0.35, hex('#b91c1c')], [0.7, hex('#f87171')], [1, hex('#fee2e2')]]),
  gradientLUT([[0, hex('#431407')], [0.35, hex('#c2410c')], [0.7, hex('#fb923c')], [1, hex('#ffedd5')]]),
  gradientLUT([[0, hex('#3b0764')], [0.35, hex('#7e22ce')], [0.7, hex('#c084fc')], [1, hex('#f3e8ff')]]),
];
const SHELL_TEX = Uint32Array.from(Array.from('.:o').map(code));

/**
 * Crabs scuttling sideways along the ground in a band near the bottom (far
 * ones higher and smaller). They pause to wave their claws, tuck down when the
 * pointer comes close, and scatter away from a click.
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
    const band = Math.min(220, (habitat.bottom - habitat.top) * 0.35);
    const n = population({ ...habitat, top: ground - band, bottom: ground }, 22000, this.k('density'), ctx.quality, 2, 24);
    this.crabs = [];
    for (let i = 0; i < n; i++) {
      const c = newCreature(i, habitat, this.k('farthest'));
      const baseY = ground - (1 - c.depth) * band - 10;
      this.crabs.push({ ...c, y: baseY, baseY, dir: Math.random() < 0.5 ? 1 : -1, walk: 0, pause: Math.random() * 3, hide: 0, color: i % SHELLS.length });
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, habitat } = ctx;
    const speed = this.k('speed');
    for (const c of input.clicks) {
      for (const k of this.crabs) {
        if (Math.abs(k.x - c.x) < 300) {
          k.dir = k.x < c.x ? -1 : 1;
          k.pause = 0;
          k.walk = 2;
        }
      }
    }
    for (const k of this.crabs) {
      const near = input.active && Math.hypot(input.x - k.x, input.y - k.y) < 140 * this.k('shy');
      k.hide += ((near ? 1 : 0) - k.hide) * Math.min(1, dt * (near ? 10 : 2));
      if (k.hide > 0.5) continue;
      if (k.pause > 0) {
        k.pause -= dt;
        continue;
      }
      k.walk -= dt;
      if (k.walk <= 0 && Math.random() < dt * 0.5) {
        k.pause = 0.8 + Math.random() * 2.5;
        k.walk = 1.5 + Math.random() * 3;
        if (Math.random() < 0.35) k.dir = k.dir === 1 ? -1 : 1;
      }
      k.x += k.dir * 55 * depthSpeed(k.depth) * speed * dt;
      k.phase += dt * 14 * speed;
      k.y = k.baseY + Math.abs(Math.sin(k.phase)) * -1.5;
      if (k.x < habitat.left - 60) k.x = habitat.right + 50;
      if (k.x > habitat.right + 60) k.x = habitat.left - 50;
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, bg } = ctx;
    const fog = this.k('fog');
    const order = [...this.crabs].sort((a, b) => a.depth - b.depth);
    for (const k of order) {
      const s = grid.cellWidth * 8 * depthScale(k.depth) * this.k('size');
      const squash = 1 - k.hide * 0.55;
      const lut = SHELLS[k.color];
      const layer = k.depth > 0.6 ? Layer.FRONT : Layer.NEAR;
      const legCol = mix(lut[150], bg, (1 - k.depth) * fog);
      const alpha = 0.55 + k.depth * 0.45;
      // Legs: three per side, scuttling.
      if (k.hide < 0.6) {
        for (const side of [-1, 1]) {
          for (let l = 0; l < 3; l++) {
            const lift = Math.sin(k.phase + l * 2 + (side > 0 ? 1 : 0)) * 3;
            const x0 = k.x + side * s * (0.18 + l * 0.08);
            const y0 = k.y + s * 0.05;
            drawLine(grid, x0, y0, x0 + side * s * 0.22, y0 + s * 0.16 + lift, legCol, alpha * 0.9, layer);
          }
        }
      }
      drawBody(grid, {
        x: k.x, y: k.y + k.hide * s * 0.12, heading: 0, length: s, width: s * 0.55 * squash,
        sampler: (u, v) => {
          const e = (u / 0.42) ** 2 + (v / 0.4) ** 2;
          if (e > 1) return 0;
          return 0.35 + (-v + 0.5) * 0.45 + (Math.sin(u * 30) > 0.8 && v < 0 ? 0.2 : 0);
        },
        lut, texture: SHELL_TEX, layer, solid: true, opacity: alpha, fog: (1 - k.depth) * fog, fogColor: bg,
      });
      // Claws (wave while paused) and eye stalks.
      if (k.hide < 0.7) {
        const wave = k.pause > 0 ? Math.sin(this.time * 6 + k.seed) * 0.3 : 0;
        for (const side of [-1, 1]) {
          const cx = k.x + side * s * 0.5;
          const cy = k.y - s * (0.12 + (side > 0 ? wave : -wave) * 0.3);
          drawLine(grid, k.x + side * s * 0.3, k.y - s * 0.02, cx, cy, legCol, alpha, layer);
          drawBody(grid, {
            x: cx, y: cy - s * 0.04, heading: 0, length: s * 0.24, width: s * 0.2,
            sampler: (u, v) => ((u / 0.5) ** 2 + (v / 0.5) ** 2 < 1 && !(v < -0.05 && Math.abs(u) < 0.08) ? 0.6 : 0),
            lut, texture: SHELL_TEX, layer, solid: true, opacity: alpha, fog: (1 - k.depth) * fog, fogColor: bg,
          });
        }
      }
      const eyeY = k.y - s * (0.32 - k.hide * 0.2);
      spot(grid, k.x - s * 0.1, eyeY, code('●'), mix(hex('#0b0b0b'), bg, (1 - k.depth) * fog), alpha, layer);
      spot(grid, k.x + s * 0.1, eyeY, code('●'), mix(hex('#0b0b0b'), bg, (1 - k.depth) * fog), alpha, layer);
    }
  }
}
