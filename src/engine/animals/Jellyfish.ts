import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { drawBody, drawLine } from '../draw/Shapes';
import { Course, Creature, Knob, depthScale, depthSpeed, newCreature, population } from './kit';

interface Jelly extends Creature {
  hue: number;
  pulse: number;
  /** Verlet tentacles: per tentacle [x, y, px, py] × segments. */
  tentacles: Float32Array[];
}

const HUES = [
  { lut: gradientLUT([[0, hex('#831843')], [0.5, hex('#f472b6')], [1, hex('#fdf2f8')]]), line: hex('#fbcfe8') },
  { lut: gradientLUT([[0, hex('#4c1d95')], [0.5, hex('#a78bfa')], [1, hex('#f5f3ff')]]), line: hex('#ddd6fe') },
  { lut: gradientLUT([[0, hex('#155e75')], [0.5, hex('#67e8f9')], [1, hex('#ecfeff')]]), line: hex('#cffafe') },
];
const BELL_TEX = Uint32Array.from(Array.from(".:'·°").map(code));

/**
 * Jellyfish drifting upward along a slow course. Each pulse (sharp
 * contraction, slow release) gives a push; between pulses they sink a little.
 * Tentacles are verlet chains that trail and sway. The pointer gently pushes
 * them aside; a click makes nearby ones pulse hard and shoot away.
 */
export class Jellyfish extends AnimalBase {
  public readonly id = 'jellyfish';
  public readonly zone = 'any' as const;
  public static knobs: Knob[] = [
    { key: 'pulse', label: 'Pulse rate', min: 0.3, max: 2.5, step: 0.05, value: 1 },
    { key: 'tentacles', label: 'Tentacle length', min: 0.3, max: 2, step: 0.05, value: 1 },
  ];
  private course = new Course(-Math.PI / 2, 0.25);
  private jellies: Jelly[] = [];

  public init(ctx: WorldContext): void {
    const n = population(ctx.habitat, 140000, this.k('density'), ctx.quality, 2, 16);
    this.jellies = [];
    for (let i = 0; i < n; i++) this.jellies.push(this.spawn(newCreature(i, ctx.habitat, this.k('farthest')), i));
  }

  private spawn(c: Creature, i: number): Jelly {
    const segs = Math.round(10 * this.k('tentacles')) + 4;
    const tentacles: Float32Array[] = [];
    for (let t = 0; t < 6; t++) {
      const arr = new Float32Array(segs * 4);
      for (let s = 0; s < segs; s++) {
        arr[s * 4] = arr[s * 4 + 2] = c.x;
        arr[s * 4 + 1] = arr[s * 4 + 3] = c.y + s * 6;
      }
      tentacles.push(arr);
    }
    return { ...c, hue: i % HUES.length, pulse: Math.random() * 6, tentacles };
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat, grid } = ctx;
    const speed = this.k('speed');
    for (const c of input.clicks) {
      for (const j of this.jellies) {
        const d = Math.hypot(j.x - c.x, j.y - c.y);
        if (d < 260) {
          j.vx += ((j.x - c.x) / (d + 1)) * 80;
          j.vy -= 90;
          j.pulse = Math.PI / 2;
        }
      }
    }
    for (const j of this.jellies) {
      j.pulse += dt * 1.6 * this.k('pulse');
      const p = Math.max(0, Math.sin(j.pulse)) ** 3;
      const s = depthSpeed(j.depth) * speed;
      j.vx += (Math.cos(this.course.heading) * p * 70 * s - j.vx * 0.8) * dt;
      j.vy += (Math.sin(this.course.heading) * p * 90 * s + 12 * s - j.vy * 0.8) * dt;
      if (input.active) {
        const dx = j.x - input.x;
        const dy = j.y - input.y;
        const d = Math.hypot(dx, dy);
        if (d < 170 && d > 1) {
          j.vx += (dx / d) * 50 * dt * input.intensity;
          j.vy += (dy / d) * 40 * dt * input.intensity;
        }
      }
      j.x += j.vx * dt;
      j.y += j.vy * dt;
      if (this.course.recycle(j, habitat, 160)) {
        for (const arr of j.tentacles) for (let s = 0; s < arr.length / 4; s++) {
          arr[s * 4] = arr[s * 4 + 2] = j.x;
          arr[s * 4 + 1] = arr[s * 4 + 3] = j.y + s * 6;
        }
      }

      const size = grid.cellWidth * 10 * depthScale(j.depth) * this.k('size');
      const seg = 6 * depthScale(j.depth) * this.k('size');
      for (let k = 0; k < j.tentacles.length; k++) {
        const arr = j.tentacles[k];
        const segs = arr.length / 4;
        arr[0] = j.x + (k / (j.tentacles.length - 1) - 0.5) * size * 0.75;
        arr[1] = j.y + size * 0.05;
        for (let s = 1; s < segs; s++) {
          const o = s * 4;
          const vx = (arr[o] - arr[o + 2]) * 0.9;
          const vy = (arr[o + 1] - arr[o + 3]) * 0.9;
          arr[o + 2] = arr[o];
          arr[o + 3] = arr[o + 1];
          arr[o] += vx + Math.sin(this.time * 1.3 + s * 0.45 + k * 1.7) * 0.1;
          arr[o + 1] += vy + 0.45;
        }
        for (let s = 1; s < segs; s++) {
          const o = s * 4;
          const dx = arr[o] - arr[o - 4];
          const dy = arr[o + 1] - arr[o - 3];
          const d = Math.hypot(dx, dy) || 1;
          const diff = (d - seg) / d;
          arr[o] -= dx * diff;
          arr[o + 1] -= dy * diff;
        }
      }
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, bg } = ctx;
    const fog = this.k('fog');
    const order = [...this.jellies].sort((a, b) => a.depth - b.depth);
    for (const j of order) {
      const pulse = Math.max(0, Math.sin(j.pulse)) ** 3;
      const size = grid.cellWidth * 10 * depthScale(j.depth) * this.k('size');
      const w = size * (1 - pulse * 0.2);
      const h = size * (0.55 + pulse * 0.15);
      const hue = HUES[j.hue];
      const layer = j.depth > 0.6 ? Layer.NEAR : Layer.MID;
      const lineColor = mix(hue.line, bg, (1 - j.depth) * fog);
      for (const arr of j.tentacles) {
        const segs = arr.length / 4;
        for (let s = 1; s < segs; s++) {
          const o = s * 4;
          drawLine(grid, arr[o - 4], arr[o - 3], arr[o], arr[o + 1], lineColor, (0.75 * (1 - s / segs) + 0.15) * (0.5 + j.depth * 0.5), layer);
        }
      }
      drawBody(grid, {
        x: j.x, y: j.y, heading: 0, length: w, width: h * 2,
        sampler: (u, v) => {
          if (v > 0.04) return 0;
          const hem = 0.04 - Math.abs(Math.sin(u * 22)) * 0.05;
          if (v > hem) return 0;
          const e = (u * u) / 0.25 + (v * v) / 0.25;
          if (e > 1) return 0;
          return 0.3 + (1 - e) * 0.55 + (v < -0.38 ? 0.15 : 0);
        },
        lut: hue.lut, texture: BELL_TEX, layer, solid: true, fillAlpha: 0.75, opacity: 0.55 + j.depth * 0.4,
        fog: (1 - j.depth) * fog, fogColor: bg,
      });
    }
  }
}
