import { AnimalBase } from './AnimalBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { drawBody, drawLine, spot } from '../draw/Shapes';
import { Course, Creature, Knob, depthScale, depthSpeed, newCreature, population } from './kit';

interface Jelly extends Creature {
  hue: number;
  pulse: number;
  /** Verlet tentacles: per tentacle [x, y, px, py] × segments. */
  tentacles: Float32Array[];
  /** Central oral arm phase */
  oralPhase: number;
}

/**
 * 4 deep-sea bioluminescent species palettes:
 * 1. Deep Ocean Pink (Crown Jelly / Atolla): deep ruby, glowing magenta, electric pink, crystalline white.
 * 2. Abyssal Crystal (Aequorea victoria): deep indigo, neon cyan, electric seafoam, white core.
 * 3. Cosmic Amethyst: royal obsidian, electric violet, luminous lilac, silver glow.
 * 4. Golden Chrysaora (Pacific Sea Nettle): deep amber bronze, radiant gold, warm cream.
 */
const HUES = [
  {
    lut: gradientLUT([[0, hex('#831843')], [0.35, hex('#db2777')], [0.7, hex('#f472b6')], [1, hex('#fdf2f8')]]),
    line: hex('#f472b6'),
    glow: hex('#fdf2f8'),
  },
  {
    lut: gradientLUT([[0, hex('#082f49')], [0.35, hex('#0284c7')], [0.7, hex('#38bdf8')], [1, hex('#f0f9ff')]]),
    line: hex('#38bdf8'),
    glow: hex('#e0f2fe'),
  },
  {
    lut: gradientLUT([[0, hex('#3b0764')], [0.35, hex('#7e22ce')], [0.7, hex('#a855f7')], [1, hex('#faf5ff')]]),
    line: hex('#c084fc'),
    glow: hex('#f5f3ff'),
  },
  {
    lut: gradientLUT([[0, hex('#451a03')], [0.35, hex('#b45309')], [0.7, hex('#fbbf24')], [1, hex('#fefce8')]]),
    line: hex('#facc15'),
    glow: hex('#fffbeb'),
  },
];

const BELL_TEX = Uint32Array.from(Array.from(".:'·°*").map(code));

/**
 * Bioluminescent jellyfish pulsing through deep waters.
 * Features translucent umbrella dome with scalloped rhopalia margins,
 * undulating inner oral arms, flowing verlet tentacles, and traveling light pulses.
 */
export class Jellyfish extends AnimalBase {
  public readonly id = 'jellyfish';
  public readonly zone = 'any' as const;
  public static knobs: Knob[] = [
    { key: 'pulse', label: 'Pulse rate', min: 0.3, max: 2.5, step: 0.05, value: 1, hint: 'How fast the bell contracts.' },
    { key: 'tentacles', label: 'Tentacle length', min: 0.3, max: 2.5, step: 0.05, value: 1.1, hint: 'Length of trailing tentacles.' },
  ];
  private course = new Course(-Math.PI / 2, 0.28);
  private jellies: Jelly[] = [];

  public init(ctx: WorldContext): void {
    const n = population(ctx.habitat, 130000, this.k('density'), ctx.quality, 2, 18);
    this.jellies = [];
    for (let i = 0; i < n; i++) {
      this.jellies.push(this.spawn(newCreature(i, ctx.habitat, this.k('farthest')), i));
    }
  }

  private spawn(c: Creature, i: number): Jelly {
    const segs = Math.round(12 * this.k('tentacles')) + 6;
    const numTentacles = 8;
    const tentacles: Float32Array[] = [];

    for (let t = 0; t < numTentacles; t++) {
      const arr = new Float32Array(segs * 4);
      for (let s = 0; s < segs; s++) {
        arr[s * 4] = arr[s * 4 + 2] = c.x;
        arr[s * 4 + 1] = arr[s * 4 + 3] = c.y + s * 7;
      }
      tentacles.push(arr);
    }

    return {
      ...c,
      hue: i % HUES.length,
      pulse: Math.random() * Math.PI * 2,
      tentacles,
      oralPhase: Math.random() * Math.PI * 2,
    };
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    this.course.step(dt);
    const { input, habitat, grid } = ctx;
    const speed = this.k('speed');

    // Clicks trigger strong pulse and rapid upward shoot
    for (const c of input.clicks) {
      for (const j of this.jellies) {
        const d = Math.hypot(j.x - c.x, j.y - c.y);
        if (d < 280) {
          j.vx += ((j.x - c.x) / (d + 1)) * 95;
          j.vy -= 120;
          j.pulse = Math.PI * 0.4;
        }
      }
    }

    for (const j of this.jellies) {
      j.pulse += dt * 1.5 * this.k('pulse');
      j.oralPhase += dt * 2.2;

      // Power contraction: quick sharp squeeze, slow relaxing glide
      const pulseRaw = Math.sin(j.pulse);
      const isContracting = pulseRaw > 0;
      const thrust = isContracting ? Math.pow(pulseRaw, 3) : 0;
      const s = depthSpeed(j.depth) * speed;

      // Upward propulsion along course during contraction, slow sink during relaxation
      const propulsionX = Math.cos(this.course.heading) * thrust * 80 * s;
      const propulsionY = Math.sin(this.course.heading) * thrust * 105 * s + 10 * s; // +10s gives gentle natural sink

      j.vx += (propulsionX - j.vx * 0.75) * dt;
      j.vy += (propulsionY - j.vy * 0.75) * dt;

      // Soft pointer push
      if (input.active) {
        const dx = j.x - input.x;
        const dy = j.y - input.y;
        const d = Math.hypot(dx, dy);
        if (d < 180 && d > 1) {
          j.vx += (dx / d) * 55 * dt * input.intensity;
          j.vy += (dy / d) * 45 * dt * input.intensity;
        }
      }

      j.x += j.vx * dt;
      j.y += j.vy * dt;

      if (this.course.recycle(j, habitat, 180)) {
        for (const arr of j.tentacles) {
          const segs = arr.length / 4;
          for (let s = 0; s < segs; s++) {
            arr[s * 4] = arr[s * 4 + 2] = j.x;
            arr[s * 4 + 1] = arr[s * 4 + 3] = j.y + s * 7;
          }
        }
      }

      // Update verlet tentacles trailing below the bell
      const bellSize = grid.cellWidth * 12 * depthScale(j.depth) * this.k('size');
      const segLen = 7 * depthScale(j.depth) * this.k('size');

      for (let k = 0; k < j.tentacles.length; k++) {
        const arr = j.tentacles[k];
        const segs = arr.length / 4;
        const tFrac = k / (j.tentacles.length - 1) - 0.5;

        // Anchor points along bell margin curve
        arr[0] = j.x + tFrac * bellSize * 0.82;
        arr[1] = j.y + bellSize * 0.08 + Math.abs(tFrac) * bellSize * 0.06;

        for (let s = 1; s < segs; s++) {
          const o = s * 4;
          const vx = (arr[o] - arr[o + 2]) * 0.88;
          const vy = (arr[o + 1] - arr[o + 3]) * 0.88;
          arr[o + 2] = arr[o];
          arr[o + 3] = arr[o + 1];

          // Ocean fluid drift & gentle serpentine sway
          const currentWave = Math.sin(this.time * 1.4 + s * 0.38 + k * 1.5) * 0.16;
          arr[o] += vx + currentWave;
          arr[o + 1] += vy + 0.48; // natural gravity drag
        }

        // Distance constraint passes
        for (let s = 1; s < segs; s++) {
          const o = s * 4;
          const dx = arr[o] - arr[o - 4];
          const dy = arr[o + 1] - arr[o - 3];
          const d = Math.hypot(dx, dy) || 1;
          const diff = (d - segLen) / d;
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
      const pulseRaw = Math.sin(j.pulse);
      const contraction = Math.max(0, pulseRaw) ** 3;
      const size = grid.cellWidth * 12 * depthScale(j.depth) * this.k('size');

      // Contracting narrows the bell width and elongates height
      const bellW = size * (1.1 - contraction * 0.3);
      const bellH = size * (0.6 + contraction * 0.22);
      const hue = HUES[j.hue];
      const layer = j.depth > 0.62 ? Layer.NEAR : Layer.MID;
      const tentacleCol = mix(hue.line, bg, (1 - j.depth) * fog);
      const glowCol = mix(hue.glow, bg, (1 - j.depth) * fog * 0.6);

      // 1. Trailing outer verlet tentacles with traveling bioluminescent pulse
      for (const arr of j.tentacles) {
        const segs = arr.length / 4;
        for (let s = 1; s < segs; s++) {
          const o = s * 4;
          // Traveling light wave along tentacle
          const wave = Math.sin(j.pulse * 2 - s * 0.6);
          const isBright = wave > 0.6;
          const col = isBright ? glowCol : tentacleCol;
          const alpha = (0.75 * (1 - s / segs) + 0.18) * (0.5 + j.depth * 0.5);
          drawLine(grid, arr[o - 4], arr[o - 3], arr[o], arr[o + 1], col, alpha, layer);
        }
      }

      // 2. Frilly inner oral feeding arms (ruffled center arms beneath bell)
      for (let arm = 0; arm < 4; arm++) {
        const armOffset = (arm - 1.5) * size * 0.14;
        const armLen = size * 0.9;
        const armSteps = 7;
        let prevAx = j.x + armOffset;
        let prevAy = j.y + bellH * 0.1;
        for (let st = 1; st <= armSteps; st++) {
          const t = st / armSteps;
          const ruffle = Math.sin(j.oralPhase + arm * 1.5 + st * 0.9) * size * 0.12 * (1 - t * 0.3);
          const ax = j.x + armOffset * (1 - t * 0.5) + ruffle;
          const ay = j.y + bellH * 0.1 + t * armLen;
          drawLine(grid, prevAx, prevAy, ax, ay, glowCol, 0.7 * (1 - t * 0.4), layer);
          prevAx = ax;
          prevAy = ay;
        }
      }

      // 3. Bioluminescent Umbrella Bell Dome
      drawBody(grid, {
        x: j.x,
        y: j.y,
        heading: 0,
        length: bellW,
        width: bellH * 2.1,
        extent: 0.75,
        sampler: (u, v) => {
          // u: -0.5 to +0.5 (lateral bell width)
          // v: -0.5 (bell apex) to 0 (bell rim)
          if (v > 0.05) return 0;

          // Scalloped bell margin with rhopalia notches
          const hem = 0.05 - Math.abs(Math.sin(u * 26)) * 0.06;
          if (v > hem) return 0;

          // Parabolic bell dome
          const e = (u * u) / 0.25 + (v * v) / 0.25;
          if (e > 1) return 0;

          // Bioluminescent glowing rim and apex
          const rim = v > -0.1 ? 0.4 : 0;
          const apexGlow = v < -0.36 ? 0.35 : 0;
          const pulseGlow = contraction * 0.25;

          return Math.max(0.2, Math.min(1.0, 0.35 + (1 - e) * 0.5 + rim + apexGlow + pulseGlow));
        },
        lut: hue.lut,
        texture: BELL_TEX,
        layer,
        solid: true,
        fillAlpha: 0.78,
        opacity: 0.65 + j.depth * 0.35,
        fog: (1 - j.depth) * fog,
        fogColor: bg,
      });

      // 4. Marginal Rhopalia / Bioluminescent Sparkle Dots along rim
      for (let r = 0; r < 7; r++) {
        const uPos = (r / 6 - 0.5) * 0.85;
        const rx = j.x + uPos * bellW;
        const ry = j.y + bellH * 0.05;
        spot(grid, rx, ry, code('·'), glowCol, 0.9, Layer.FRONT);
      }
    }
  }
}
