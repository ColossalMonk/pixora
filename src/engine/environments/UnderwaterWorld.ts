import { BaseEnvironment } from './BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { BoidsSystem } from '../physics/BoidsSystem';
import { SimplexNoise } from '../physics/SimplexNoise';
import { EnergyField } from '../physics/EnergyField';
import { Layer, RenderGrid, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix, hash2, scale } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawBody, drawLine, spot } from '../draw/Shapes';

interface Bubble { x: number; y: number; vy: number; size: number; wobble: number; }
interface Kelp { x: number; segs: number; segLen: number; phase: number; sway: number; depth: number; }
interface Coral { x: number; branches: [number, number, number, number][]; color: number; }
interface Jelly {
  x: number; y: number; vx: number; vy: number; phase: number; size: number; hue: number;
  tentacles: Float32Array[]; // [x0,y0,px0,py0, x1,y1,...] verlet points
}
interface BigFish { x: number; y: number; vx: number; vy: number; heading: number; len: number; phase: number; palette: number; targetX: number; targetY: number; timer: number; }
interface Snow { x: number; y: number; s: number; }

const SPECIES = [
  { right: '><>', left: '<><', color: hex('#5eead4') },
  { right: '>=>', left: '<=<', color: hex('#fcd34d') },
  { right: '><(°>', left: '<°)><', color: hex('#fda4af') },
  { right: '>-<>', left: '<>-<', color: hex('#93c5fd') },
];

export class UnderwaterWorld extends BaseEnvironment {
  public readonly id = 'underwater';
  public readonly preferredStyle = 'ascii-standard' as const;
  public readonly backdrop = [hex('#0c3b5e'), hex('#082a47'), hex('#05182c'), hex('#030b17')];

  private noise = new SimplexNoise(42);
  private boids = new BoidsSystem();
  private species = new Uint8Array(0);
  private wake = new EnergyField();
  private light = new Float32Array(0);
  private bed = new Int16Array(0);
  private bubbles: Bubble[] = [];
  private kelp: Kelp[] = [];
  private coral: Coral[] = [];
  private jellies: Jelly[] = [];
  private bigFish: BigFish[] = [];
  private snow: Snow[] = [];
  private vents: number[] = [];

  private lightLut = gradientLUT([[0, hex('#0e4a6e')], [0.5, hex('#3aa6c9')], [1, hex('#c9f3ff')]]);
  private wakeLut = gradientLUT([[0, hex('#1d6f8f')], [1, hex('#bff2ff')]]);
  private sandLut = gradientLUT([[0, hex('#3b3226')], [0.6, hex('#8a7558')], [1, hex('#d9c49a')]]);
  private fishLuts = [
    gradientLUT([[0, hex('#7c2d12')], [0.5, hex('#f97316')], [1, hex('#fed7aa')]]),
    gradientLUT([[0, hex('#1e3a8a')], [0.5, hex('#3b82f6')], [1, hex('#e0f2fe')]]),
    gradientLUT([[0, hex('#4c1d95')], [0.5, hex('#a78bfa')], [1, hex('#f5f3ff')]]),
  ];
  private scaleTex = Uint32Array.from(Array.from('%≡=;:·').reverse().map(code));
  private rockLut = gradientLUT([[0, hex('#1f2937')], [1, hex('#64748b')]]);
  private rockTex = Uint32Array.from(Array.from('.:%#@').map(code));

  public init(ctx: WorldContext): void {
    const { grid, width, height, quality } = ctx;
    const area = (width * height) / (1440 * 900);
    this.light = this.ensure(this.light, grid.size);
    this.wake.resize(grid.cols, grid.rows, grid.aspect);

    // Seabed profile (row of the sand surface per column).
    this.bed = new Int16Array(grid.cols);
    for (let c = 0; c < grid.cols; c++) {
      const n = this.noise.noise2D(c * 0.035, 3.3) * 0.6 + this.noise.noise2D(c * 0.11, 7.1) * 0.25;
      this.bed[c] = Math.round(grid.rows - 3 - (n + 1) * 1.6);
    }

    // Fish schools: depth layers by index.
    const count = Math.round(Math.min(140, 64 * area * quality + 12));
    this.boids.reset(count, width, height, (i) => (i % 5 === 0 ? 0.85 + Math.random() * 0.15 : i % 2 ? 0.15 + Math.random() * 0.3 : 0.5 + Math.random() * 0.25));
    this.species = new Uint8Array(count);
    for (let i = 0; i < count; i++) this.species[i] = Math.floor(i / 9) % SPECIES.length;

    this.kelp = [];
    const kelpCount = Math.round((width / 95) * Math.min(1.2, quality));
    for (let i = 0; i < kelpCount; i++) {
      const depth = Math.random();
      this.kelp.push({
        x: (i + Math.random() * 0.8) * (width / kelpCount),
        segs: 6 + Math.floor(Math.random() * 8 * (0.6 + depth * 0.5)),
        segLen: grid.cellHeight * (0.9 + depth * 0.5),
        phase: Math.random() * Math.PI * 2,
        sway: 0.08 + Math.random() * 0.1,
        depth,
      });
    }

    this.coral = [];
    const coralCount = Math.max(2, Math.round(width / 360));
    const coralColors = [hex('#fb7185'), hex('#fdba74'), hex('#c084fc'), hex('#f472b6')];
    for (let i = 0; i < coralCount; i++) {
      const x = (i + 0.3 + Math.random() * 0.4) * (width / coralCount);
      this.coral.push({ x, branches: this.growCoral(x, 0, -Math.PI / 2, grid.cellHeight * 2.6, 4), color: coralColors[i % coralColors.length] });
    }

    this.vents = [];
    for (let i = 0; i < Math.max(2, Math.round(width / 500)); i++) this.vents.push(Math.random() * width);
    this.bubbles = [];
    for (let i = 0; i < 26 * area; i++) this.bubbles.push(this.newBubble(Math.random() * width, Math.random() * height));

    this.snow = [];
    for (let i = 0; i < 90 * area * quality; i++) this.snow.push({ x: Math.random() * width, y: Math.random() * height, s: 0.3 + Math.random() * 0.7 });

    this.jellies = [];
    const jellyCount = Math.max(2, Math.round(3 * area));
    for (let i = 0; i < jellyCount; i++) {
      this.jellies.push(this.newJelly(width * (0.12 + (0.76 * (i + Math.random() * 0.5)) / jellyCount), height * (0.25 + Math.random() * 0.4), grid.cellWidth, i));
    }

    this.bigFish = [];
    const big = Math.max(1, Math.round(2 * area));
    for (let i = 0; i < big; i++) {
      const dir = i % 2 ? -1 : 1;
      this.bigFish.push({
        x: width * (0.2 + 0.6 * Math.random()),
        y: height * (0.3 + 0.35 * Math.random()),
        vx: 40 * dir,
        vy: 0,
        heading: dir > 0 ? 0 : Math.PI,
        len: grid.cellWidth * (20 + Math.random() * 8),
        phase: Math.random() * 10,
        palette: i % this.fishLuts.length,
        targetX: width * Math.random(),
        targetY: height * (0.25 + Math.random() * 0.4),
        timer: 4 + Math.random() * 6,
      });
    }
  }

  private growCoral(x: number, y: number, angle: number, len: number, depth: number): [number, number, number, number][] {
    if (depth === 0 || len < 4) return [];
    const x1 = x + Math.cos(angle) * len;
    const y1 = y + Math.sin(angle) * len;
    const out: [number, number, number, number][] = [[x, y, x1, y1]];
    const spread = 0.45 + Math.random() * 0.3;
    out.push(...this.growCoral(x1, y1, angle - spread, len * 0.72, depth - 1));
    out.push(...this.growCoral(x1, y1, angle + spread * (0.7 + Math.random() * 0.5), len * 0.68, depth - 1));
    return out;
  }

  private newBubble(x: number, y: number): Bubble {
    return { x, y, vy: 30 + Math.random() * 50, size: Math.random(), wobble: Math.random() * 10 };
  }

  private newJelly(x: number, y: number, cw: number, i: number): Jelly {
    const size = 0.8 + Math.random() * 0.6;
    const tentacles: Float32Array[] = [];
    const nT = 6;
    const segs = 9 + Math.floor(size * 4);
    for (let t = 0; t < nT; t++) {
      const arr = new Float32Array(segs * 4);
      for (let s = 0; s < segs; s++) {
        arr[s * 4] = arr[s * 4 + 2] = x;
        arr[s * 4 + 1] = arr[s * 4 + 3] = y + s * 8;
      }
      tentacles.push(arr);
    }
    return { x, y, vx: 0, vy: 0, phase: Math.random() * 6, size: size * cw * 9, hue: i % 2, tentacles };
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { width, height, input, grid } = ctx;
    const t = this.time;
    const pointer = input.active && input.intensity > 0;

    // Clicks: startle fish, burst bubbles, push jellies.
    for (const click of input.clicks) {
      this.boids.startle(click.x, click.y, 260 * input.intensity, 420 * input.intensity);
      for (let i = 0; i < 14; i++) {
        const b = this.newBubble(click.x + (Math.random() - 0.5) * 30, click.y + (Math.random() - 0.5) * 20);
        b.vy = 60 + Math.random() * 90;
        this.bubbles.push(b);
      }
      this.wake.stamp(click.x / grid.cellWidth, click.y / grid.cellHeight, 6, 1.6);
      for (const j of this.jellies) {
        const dx = j.x - click.x;
        const dy = j.y - click.y;
        const d = Math.hypot(dx, dy);
        if (d < 260 && d > 1) {
          j.vx += (dx / d) * 90 * input.intensity;
          j.vy += (dy / d) * 60 * input.intensity;
        }
      }
    }
    if (this.bubbles.length > 160) this.bubbles.splice(0, this.bubbles.length - 160);

    this.boids.update(dt, pointer ? input.x : NaN, input.y, input.intensity);
    // Fast swimmers leave a faint wake.
    for (let i = 0; i < this.boids.count; i += 2) {
      if (this.boids.panic[i] > 0 || this.boids.depth[i] > 0.8) {
        this.wake.add(this.boids.x[i] / grid.cellWidth, this.boids.y[i] / grid.cellHeight, 0.06);
      }
    }
    if (pointer) {
      const sp = Math.hypot(input.vx, input.vy);
      if (sp > 120) this.wake.stamp(input.x / grid.cellWidth, input.y / grid.cellHeight, 2.5, Math.min(0.5, sp / 4000));
    }
    this.wake.step(dt, 1.6);

    // Bubbles rise and wobble; vents keep seeding them.
    if (Math.random() < dt * 3) {
      const vx = this.vents[(Math.random() * this.vents.length) | 0];
      this.bubbles.push(this.newBubble(vx + (Math.random() - 0.5) * 12, height - grid.cellHeight * 3));
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.y -= b.vy * dt;
      b.x += Math.sin(t * 3 + b.wobble) * 14 * dt;
      b.vy = Math.min(140, b.vy + dt * 8);
      if (b.y < -10) this.bubbles.splice(i, 1);
    }

    for (const s of this.snow) {
      s.y += (6 + s.s * 8) * dt;
      s.x += Math.sin(t * 0.3 + s.y * 0.01) * 4 * dt;
      if (s.y > height) { s.y = -5; s.x = Math.random() * width; }
    }

    // Jellyfish: pulse propulsion + verlet tentacles.
    for (const j of this.jellies) {
      j.phase += dt * 1.6;
      const pulse = Math.max(0, Math.sin(j.phase)) ** 3;
      j.vy += (-pulse * 70 + 14) * dt;
      j.vx += Math.sin(t * 0.2 + j.size) * 4 * dt;
      if (pointer) {
        const dx = j.x - input.x;
        const dy = j.y - input.y;
        const d = Math.hypot(dx, dy);
        if (d < 160 && d > 1) {
          j.vx += (dx / d) * 40 * dt * input.intensity;
          j.vy += (dy / d) * 30 * dt * input.intensity;
        }
      }
      j.vx *= Math.exp(-dt * 0.8);
      j.vy *= Math.exp(-dt * 1.2);
      j.x += j.vx * dt;
      j.y += j.vy * dt;
      if (j.y < height * 0.12) j.vy += 30 * dt;
      if (j.y > height * 0.7) j.vy -= 40 * dt;
      if (j.x < 60) j.vx += 20 * dt;
      if (j.x > width - 60) j.vx -= 20 * dt;

      const bellW = j.size * (1 + pulse * -0.18);
      for (let k = 0; k < j.tentacles.length; k++) {
        const p = j.tentacles[k];
        const segs = p.length / 4;
        const rootX = j.x + (k / (j.tentacles.length - 1) - 0.5) * bellW * 0.8;
        const rootY = j.y + 30;
        p[0] = rootX; p[1] = rootY;
        const seg = 7 + j.size * 0.02;
        for (let s = 1; s < segs; s++) {
          const o = s * 4;
          const vx = (p[o] - p[o + 2]) * 0.88;
          const vy = (p[o + 1] - p[o + 3]) * 0.88;
          p[o + 2] = p[o];
          p[o + 3] = p[o + 1];
          p[o] += vx + Math.sin(t * 1.3 + s * 0.45 + k * 1.7) * 0.12;
          p[o + 1] += vy + 0.55;
        }
        for (let iter = 0; iter < 2; iter++) {
          for (let s = 1; s < segs; s++) {
            const o = s * 4;
            const po = o - 4;
            const dx = p[o] - p[po];
            const dy = p[o + 1] - p[po + 1];
            const d = Math.hypot(dx, dy) || 1;
            const diff = (d - seg) / d;
            p[o] -= dx * diff;
            p[o + 1] -= dy * diff;
          }
        }
      }
    }

    // Big fish: slow wander, curious about a still pointer, flee a fast one.
    for (const f of this.bigFish) {
      f.timer -= dt;
      f.phase += dt * (3 + Math.hypot(f.vx, f.vy) * 0.03);
      if (f.timer <= 0) {
        f.targetX = width * (0.08 + Math.random() * 0.84);
        f.targetY = height * (0.22 + Math.random() * 0.45);
        f.timer = 5 + Math.random() * 7;
      }
      let tx = f.targetX;
      let ty = f.targetY;
      if (pointer) {
        const sp = Math.hypot(input.vx, input.vy);
        const d = Math.hypot(input.x - f.x, input.y - f.y);
        if (sp < 60 && d < 420) { tx = input.x - Math.sign(input.x - f.x) * f.len * 0.9; ty = input.y; }
        else if (sp > 900 && d < 260) { tx = f.x + (f.x - input.x) * 2; ty = f.y + (f.y - input.y) * 2; }
      }
      const dx = tx - f.x;
      const dy = ty - f.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = Math.min(70, d * 0.5);
      f.vx += ((dx / d) * want - f.vx) * dt * 0.8;
      f.vy += ((dy / d) * want * 0.3 - f.vy) * dt * 0.8;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const desired = Math.atan2(f.vy, f.vx);
      let diff = desired - f.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.hypot(f.vx, f.vy) > 8) f.heading += diff * Math.min(1, dt * 2.2);
      // Fish pitch, they don't swim straight up: clamp to ±0.45 rad off horizontal.
      const right = Math.cos(f.heading) >= 0;
      const pitch = Math.atan2(Math.sin(f.heading), Math.abs(Math.cos(f.heading)));
      const clamped = Math.max(-0.45, Math.min(0.45, pitch));
      f.heading = right ? clamped : Math.PI - clamped;
      this.wake.add((f.x - Math.cos(f.heading) * f.len * 0.5) / grid.cellWidth, f.y / grid.cellHeight, 0.05);
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, style, width, height } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;

    // 1. God rays + caustics (sky layer field).
    const light = this.light;
    for (let r = 0; r < rows; r++) {
      const yn = r / rows;
      const depthFade = Math.pow(1 - yn, 1.7);
      for (let c = 0; c < cols; c++) {
        const slant = c * 0.022 + r * 0.012;
        const ray = Math.max(0, this.noise.noise2D(slant, t * 0.05)) ** 2 * 0.55;
        let v = ray * depthFade;
        if (yn < 0.35) {
          const ca = this.noise.noise3D(c * 0.09, r * 0.18, t * 0.35);
          const caustic = Math.max(0, ca - 0.35) * 1.6 * (1 - yn / 0.35);
          v += caustic;
        }
        light[r * cols + c] = v;
      }
    }
    renderField(grid, light, { style, lut: this.lightLut, layer: Layer.SKY, threshold: 0.09, minAlpha: 0.1, alphaGain: 0.45 });

    // 2. Marine snow.
    for (const s of this.snow) spot(grid, s.x, s.y, code(s.s > 0.75 ? '·' : '.'), hex('#9cc9de'), 0.18 + s.s * 0.2, Layer.FAR);

    // 3. Wake / disturbance field.
    renderField(grid, this.wake.values, { style, lut: this.wakeLut, layer: Layer.FAR, threshold: 0.08, minAlpha: 0.15, alphaGain: 0.5 });

    // 4. Far kelp (behind fish).
    this.renderKelp(ctx, false);

    // 5. Fish schools by depth.
    const fog = hex('#0a2f4a');
    for (let i = 0; i < this.boids.count; i++) {
      const x = this.boids.x[i];
      const y = this.boids.y[i];
      const d = this.boids.depth[i];
      const right = this.boids.vx[i] >= 0;
      const sp = SPECIES[this.species[i]];
      const col = Math.floor(x / cw);
      const row = Math.floor(y / ch);
      const color = mix(sp.color, fog, (1 - d) * 0.65);
      const alpha = 0.35 + d * 0.65;
      if (d < 0.45) {
        grid.putChar(col, row, right ? '›' : '‹', color, alpha, Layer.FAR);
        continue;
      }
      const str = d > 0.8 ? (right ? sp.right : sp.left) : right ? '><>' : '<><';
      const wiggle = Math.sin(this.boids.phase[i] * 2.4) > 0.3;
      const len = str.length;
      const start = right ? col - len + 1 : col;
      const layer = d > 0.8 ? Layer.NEAR : Layer.MID;
      for (let k = 0; k < len; k++) {
        let chh = str[k];
        if (wiggle && ((right && k === 0) || (!right && k === len - 1))) chh = right ? '}' : '{';
        grid.putChar(start + k, row, chh, k === (right ? len - 1 : 0) ? scale(color, 1.2) : color, alpha, layer);
      }
    }

    // 6. Jellyfish (translucent bells, stroke tentacles).
    for (const j of this.jellies) {
      const pulse = Math.max(0, Math.sin(j.phase)) ** 3;
      const w = j.size * (1 - pulse * 0.18);
      const h = j.size * (0.55 + pulse * 0.12);
      for (const p of j.tentacles) {
        const segs = p.length / 4;
        for (let s = 1; s < segs; s++) {
          const o = s * 4;
          const a = 0.75 * (1 - s / segs) + 0.15;
          drawLine(grid, p[o - 4], p[o - 3], p[o], p[o + 1], j.hue ? hex('#e9d5ff') : hex('#fbcfe8'), a, Layer.MID);
        }
      }
      this.drawBell(grid, j.x, j.y, w, h, j.hue, pulse);
    }

    // 7. Big fish (silhouettes with travelling tail wave).
    for (const f of this.bigFish) {
      const facingLeft = Math.cos(f.heading) < 0;
      const phase = f.phase;
      const len = f.len;
      drawBody(grid, {
        x: f.x, y: f.y, heading: f.heading, length: len, width: len * 0.46, extent: 0.65,
        flipV: facingLeft,
        sampler: (u, v) => {
          // u: -0.5 tail … 0.5 head; v: -0.5 back … 0.5 belly
          const tailWave = Math.sin(phase - u * 5) * 0.1 * (0.5 - u);
          const vv = v - tailWave;
          if (u < -0.3) {
            // Forked tail fin
            const k = (-0.3 - u) / 0.2;
            if (k > 1) return 0;
            const spread = 0.08 + k * 0.42;
            const notch = k * 0.22;
            return Math.abs(vv) < spread && Math.abs(vv) > notch ? 0.35 : 0;
          }
          const x = (u + 0.3) / 0.8; // 0 tail root … 1 snout
          const half = x < 0.55 ? 0.12 + 0.3 * Math.sin((Math.PI / 2) * (x / 0.55)) : 0.42 * Math.pow(Math.cos((Math.PI / 2) * ((x - 0.55) / 0.45)), 0.75);
          // Dorsal fin
          if (vv < -half && x > 0.3 && x < 0.62) {
            const tip = 0.16 * (1 - Math.abs(x - 0.42) / 0.2);
            return -vv - half < tip ? 0.3 : 0;
          }
          // Pelvic fin
          if (vv > half && x > 0.45 && x < 0.6) return vv - half < 0.07 ? 0.4 : 0;
          if (Math.abs(vv) > half) return 0;
          const b = (vv / Math.max(half, 0.01) + 1) / 2; // 0 back … 1 belly
          const bars = Math.sin(x * 18) > 0.7 && b < 0.6 ? -0.15 : 0;
          const gill = Math.abs(x - 0.78) < 0.025 ? -0.2 : 0;
          return Math.max(0.05, Math.min(1, 0.3 + b * 0.6 + bars + gill));
        },
        lut: this.fishLuts[f.palette], texture: this.scaleTex, layer: Layer.FRONT, solid: true, fillAlpha: 0.45, fillDarken: 0.7, opacity: 0.95,
      });
      const ex = f.x + Math.cos(f.heading) * len * 0.32 - Math.sin(f.heading) * len * 0.05 * (facingLeft ? -1 : 1);
      const ey = f.y + Math.sin(f.heading) * len * 0.32 - len * 0.04;
      grid.putSolid(Math.floor(ex / cw), Math.floor(ey / ch), code('●'), hex('#0b1020'), 1, hex('#f8fafc'), 1, Layer.FX);
    }

    // 8. Bubbles.
    for (const b of this.bubbles) {
      const g = b.size > 0.8 ? 'O' : b.size > 0.45 ? 'o' : b.size > 0.2 ? '°' : '·';
      spot(grid, b.x, b.y, code(g), hex('#d6f4ff'), 0.75, Layer.NEAR);
    }

    // 9. Seabed: sand, rocks, coral, front kelp.
    const bedY = height - grid.cellHeight * 2;
    for (let c = 0; c < cols; c++) {
      const top = this.bed[c];
      for (let r = Math.max(0, top); r < rows; r++) {
        const depthIn = (r - top) / 4;
        const grain = hash2(c, r);
        const v = Math.min(1, 0.35 + depthIn * 0.2 + grain * 0.35);
        const g = r === top ? (grain > 0.5 ? '_' : '.') : grain > 0.7 ? ':' : grain > 0.35 ? '.' : ',';
        grid.putChar(c, r, g, this.sandLut[(v * 255) | 0], 0.35 + v * 0.4, Layer.FRONT);
      }
    }
    for (const co of this.coral) {
      const col = Math.min(cols - 1, Math.max(0, Math.floor(co.x / cw)));
      const baseY = this.bed[col] * ch;
      for (const [x0, y0, x1, y1] of co.branches) {
        drawLine(grid, x0, baseY + y0, x1, baseY + y1, co.color, 0.85, Layer.FRONT, code('°'));
      }
    }
    for (let i = 0; i < this.vents.length; i++) {
      const vx = this.vents[i];
      drawBody(grid, {
        x: vx, y: bedY, heading: 0, length: cw * 9, width: ch * 2.4,
        sampler: (u, v) => (v > 0 ? 0 : (u * u) / 0.25 + (v * v) / 0.25 < 1 ? 0.3 + (-v) * 0.6 : 0),
        lut: this.rockLut, texture: this.rockTex, layer: Layer.FRONT,
      });
    }
    this.renderKelp(ctx, true);
    void width;
  }

  /**
   * Jellyfish bell as a dome: each row's half-width follows an ellipse, with
   * edge glyphs chosen by slope ( . / ( at the sides, - ~ along the crown ),
   * a translucent dotted interior and a scalloped skirt that breathes.
   */
  private drawBell(grid: RenderGrid, x: number, y: number, w: number, h: number, hue: number, pulse: number): void {
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const rows = Math.max(2, Math.round(h / ch));
    const rim = hue ? hex('#e9d5ff') : hex('#fbcfe8');
    const body = hue ? hex('#c4b5fd') : hex('#f9a8d4');
    const glow = hue ? hex('#a78bfa') : hex('#f472b6');
    const cx = x / cw;
    const baseRow = Math.floor(y / ch);
    for (let k = 0; k < rows; k++) {
      // k = 0 is the crown, rows-1 the widest row just above the skirt.
      const yn = 1 - (k + 0.5) / rows;
      const half = (w / 2 / cw) * Math.sqrt(Math.max(0, 1 - yn * yn));
      const row = baseRow - (rows - 1 - k);
      const left = Math.round(cx - half);
      const right = Math.round(cx + half);
      for (let c = left; c <= right; c++) {
        let g: string;
        let col = body;
        let a = 0.55;
        if (k === 0) {
          g = c === left ? '.' : c === right ? '.' : (c + k) % 3 === 0 ? '~' : '-';
          col = rim;
          a = 0.95;
        } else if (c === left) {
          g = half - (cx - left) > 0.2 || k < rows - 1 ? '/' : '(';
          if (k === rows - 1) g = '(';
          col = rim;
          a = 0.95;
        } else if (c === right) {
          g = k === rows - 1 ? ')' : '\\';
          col = rim;
          a = 0.95;
        } else {
          const inner = Math.abs(c - cx) / Math.max(1, half);
          g = inner < 0.35 && k === rows - 2 ? 'o' : (c + k) % 2 ? '·' : ':';
          col = mix(glow, body, inner);
          a = 0.35 + (1 - inner) * 0.3;
        }
        grid.put(c, row, code(g), col, a, Layer.NEAR);
      }
    }
    // Skirt
    const half = w / 2 / cw;
    const skirtRow = baseRow + 1;
    for (let c = Math.round(cx - half); c <= Math.round(cx + half); c++) {
      grid.putChar(c, skirtRow, (c + Math.round(pulse * 2)) % 2 ? '‿' : '◡', rim, 0.75, Layer.NEAR);
    }
  }

  private renderKelp(ctx: WorldContext, front: boolean): void {
    const { grid, height } = ctx;
    const t = this.time;
    const cols = grid.cols;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    for (const k of this.kelp) {
      const isFront = k.depth > 0.65;
      if (isFront !== front) continue;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(k.x / cw)));
      const baseY = Math.min(height, this.bed[col] * ch);
      const base = mix(hex('#166534'), hex('#4ade80'), 0.25 + k.depth * 0.5);
      const color = isFront ? base : mix(base, hex('#0a2f4a'), 0.55);
      const layer = isFront ? Layer.FRONT : Layer.FAR;
      const alpha = isFront ? 0.95 : 0.55;
      let offset = 0;
      for (let s = 0; s < k.segs; s++) {
        const sNorm = s / k.segs;
        // Sway grows toward the tip and lags with height (travelling wave).
        offset = Math.sin(t * 0.9 + k.phase - s * 0.35) * k.sway * 18 * sNorm * k.segs * 0.25;
        const x = k.x + offset;
        const y = baseY - s * ch;
        const lean = Math.cos(t * 0.9 + k.phase - s * 0.35);
        const g = s % 2 === 0 ? (lean > 0.6 ? '/' : '(') : lean < -0.6 ? '\\' : ')';
        const c = mix(color, hex('#bbf7d0'), sNorm * 0.3);
        grid.putChar(Math.floor(x / cw) + (s % 2), Math.floor(y / ch), g, c, alpha, layer);
        if (s > 1 && s % 3 === 0) {
          const side = (s / 3) % 2 ? 1 : -1;
          grid.putChar(Math.floor(x / cw) + (s % 2) + side, Math.floor(y / ch), side > 0 ? '~' : '~', c, alpha * 0.75, layer);
        }
      }
    }
  }
}
