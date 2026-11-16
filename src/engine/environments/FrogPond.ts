import { BaseEnvironment } from './BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { WaveEquation2D } from '../physics/WaveEquation2D';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawBody, drawLine, spot } from '../draw/Shapes';

interface Pad { x: number; y: number; r: number; notch: number; flower: boolean; ox: number; oy: number; }
type FrogState = 'idle' | 'anticipate' | 'jump' | 'tongue' | 'swim';
interface Frog {
  x: number; y: number; heading: number; state: FrogState; timer: number;
  pad: number; fromX: number; fromY: number; toX: number; toY: number; toPad: number;
  t: number; dur: number; arc: number; blink: number; breath: number;
  tongueX: number; tongueY: number; prey: number;
}
interface Koi { x: number; y: number; heading: number; speed: number; phase: number; len: number; seed: number; turn: number; }
interface Fly { x: number; y: number; vx: number; vy: number; tx: number; ty: number; hover: number; flap: number; respawn: number; }
interface Pellet { x: number; y: number; life: number; }
interface Reed { x: number; h: number; phase: number; head: boolean; }

export class FrogPond extends BaseEnvironment {
  public readonly id = 'frog-pond';
  public readonly preferredStyle = 'ascii-standard' as const;
  public readonly backdrop = [hex('#0f2e28'), hex('#0b2622'), hex('#081c1a'), hex('#05120f')];

  private wave = new WaveEquation2D();
  private noise = new SimplexNoise(5);
  private field = new Float32Array(0);
  private pads: Pad[] = [];
  private frogs: Frog[] = [];
  private koi: Koi[] = [];
  private flies: Fly[] = [];
  private pellets: Pellet[] = [];
  private reeds: Reed[] = [];

  private waterLut = gradientLUT([[0, hex('#0f3b36')], [0.45, hex('#2c7a6c')], [0.8, hex('#8fd3c1')], [1, hex('#e6fff8')]]);
  private padLut = gradientLUT([[0, hex('#0f3d1f')], [0.45, hex('#1f7a3a')], [0.75, hex('#4fbf62')], [1, hex('#b6f0a8')]]);
  private frogLut = gradientLUT([[0, hex('#3f3a0b')], [0.3, hex('#65a30d')], [0.55, hex('#a3e635')], [0.8, hex('#ecfccb')], [1, hex('#fef9c3')]]);
  private koiLut = gradientLUT([[0, hex('#1c1917')], [0.22, hex('#7c2d12')], [0.45, hex('#ea580c')], [0.6, hex('#fb923c')], [0.8, hex('#fde7d2')], [1, hex('#ffffff')]]);
  private padTex = Uint32Array.from(Array.from(".,:;=%").map(code));
  private skinTex = Uint32Array.from(Array.from(".:;+=*%").map(code));
  private koiTex = Uint32Array.from(Array.from(".:;+=*").map(code));

  public init(ctx: WorldContext): void {
    const { grid, width, height } = ctx;
    const area = (width * height) / (1440 * 900);
    this.wave.resize(grid.cols, grid.rows, grid.aspect);
    this.wave.damping = 0.982;
    this.field = this.ensure(this.field, grid.size);
    const cw = grid.cellWidth;

    // Lily pads on a jittered ring so the centre (UI) stays mostly clear.
    this.pads = [];
    const padCount = Math.max(5, Math.round(7 * Math.sqrt(area)));
    for (let i = 0; i < padCount; i++) {
      const a = (i / padCount) * Math.PI * 2 + Math.random() * 0.4;
      const rx = width * (0.33 + Math.random() * 0.1);
      const ry = height * (0.32 + Math.random() * 0.08);
      this.pads.push({
        x: width / 2 + Math.cos(a) * rx,
        y: height / 2 + Math.sin(a) * ry,
        r: cw * (5 + Math.random() * 3),
        notch: Math.random() * Math.PI * 2,
        flower: i % 3 === 0,
        ox: 0, oy: 0,
      });
    }

    this.frogs = [];
    const frogCount = Math.min(this.pads.length - 1, Math.max(2, Math.round(3 * Math.sqrt(area))));
    for (let i = 0; i < frogCount; i++) {
      const pad = this.pads[i * 2 % this.pads.length];
      this.frogs.push({
        x: pad.x, y: pad.y, heading: -Math.PI / 2 + (Math.random() - 0.5), state: 'idle', timer: 2 + Math.random() * 5,
        pad: i * 2 % this.pads.length, fromX: 0, fromY: 0, toX: 0, toY: 0, toPad: -1, t: 0, dur: 0.6, arc: 0,
        blink: Math.random() * 4, breath: Math.random() * 6, tongueX: 0, tongueY: 0, prey: -1,
      });
    }

    this.koi = [];
    for (let i = 0; i < Math.max(2, Math.round(4 * area)); i++) {
      this.koi.push({
        x: Math.random() * width, y: Math.random() * height, heading: Math.random() * 6.28, speed: 40,
        phase: Math.random() * 6, len: cw * (9 + Math.random() * 4), seed: Math.random() * 100, turn: 0,
      });
    }

    this.flies = [];
    for (let i = 0; i < Math.max(2, Math.round(3 * area)); i++) this.flies.push(this.newFly(width, height));
    this.pellets = [];

    this.reeds = [];
    const clumps = [0.02, 0.06, 0.94, 0.98];
    for (const fx of clumps) {
      for (let k = 0; k < 6; k++) {
        this.reeds.push({ x: width * fx + (Math.random() - 0.5) * cw * 8, h: height * (0.18 + Math.random() * 0.22), phase: Math.random() * 6, head: Math.random() > 0.4 });
      }
    }
  }

  private newFly(width: number, height: number): Fly {
    return { x: Math.random() * width, y: Math.random() * height * 0.8, vx: 0, vy: 0, tx: Math.random() * width, ty: Math.random() * height, hover: 1, flap: 0, respawn: 0 };
  }

  private padFree(i: number, except: Frog): boolean {
    return !this.frogs.some((f) => f !== except && (f.pad === i || f.toPad === i));
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { grid, input, width, height } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;

    // Clicks: ripple + food pellets; frogs near the click leap away.
    for (const c of input.clicks) {
      this.wave.addDisturbance(c.x / cw, c.y / ch, 4, 4.5 * input.intensity);
      for (let k = 0; k < 4; k++) this.pellets.push({ x: c.x + (Math.random() - 0.5) * 40, y: c.y + (Math.random() - 0.5) * 24, life: 14 });
      for (const f of this.frogs) {
        if (f.state === 'idle' && Math.hypot(f.x - c.x, f.y - c.y) < 140) f.timer = 0;
      }
    }
    if (this.pellets.length > 30) this.pellets.splice(0, this.pellets.length - 30);
    if (input.active && Math.hypot(input.vx, input.vy) > 200) {
      this.wave.addDisturbance(input.x / cw, input.y / ch, 2, 0.5 * input.intensity);
    }
    this.wave.update();

    // Pads bob and drift on the waves.
    for (const p of this.pads) {
      const c = Math.floor(p.x / cw);
      const r = Math.floor(p.y / ch);
      p.ox += (-this.wave.gradX(c, r) * 30 - p.ox) * dt * 2;
      p.oy += (-this.wave.gradY(c, r) * 20 + Math.sin(this.time * 0.8 + p.notch) * 1.5 - p.oy) * dt * 2;
    }

    for (const f of this.frogs) this.updateFrog(f, dt, ctx);

    // Koi: wander, chase food.
    for (const k of this.koi) {
      let target = -1;
      let best = 380;
      for (let i = 0; i < this.pellets.length; i++) {
        const d = Math.hypot(this.pellets[i].x - k.x, this.pellets[i].y - k.y);
        if (d < best) { best = d; target = i; }
      }
      let desired = k.heading + this.noise.noise2D(k.seed, this.time * 0.15) * 1.2 * dt * 3;
      let speed = 34;
      if (target >= 0) {
        const p = this.pellets[target];
        desired = Math.atan2(p.y - k.y, p.x - k.x);
        speed = 95;
        const hx = k.x + Math.cos(k.heading) * k.len * 0.45;
        const hy = k.y + Math.sin(k.heading) * k.len * 0.45;
        if (Math.hypot(p.x - hx, p.y - hy) < 16) {
          this.pellets.splice(target, 1);
          this.wave.addDisturbance(hx / cw, hy / ch, 1.6, 1.4);
        }
      }
      // Stay in bounds.
      const m = 80;
      if (k.x < m) desired = 0;
      else if (k.x > width - m) desired = Math.PI;
      if (k.y < m) desired = Math.PI / 2;
      else if (k.y > height - m) desired = -Math.PI / 2;
      let diff = Math.atan2(Math.sin(desired - k.heading), Math.cos(desired - k.heading));
      diff = Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      k.heading += diff;
      k.turn = diff / dt;
      k.speed += (speed - k.speed) * dt * 1.5;
      k.x += Math.cos(k.heading) * k.speed * dt;
      k.y += Math.sin(k.heading) * k.speed * dt;
      k.phase += dt * (3 + k.speed * 0.05);
    }
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      this.pellets[i].life -= dt;
      if (this.pellets[i].life <= 0) this.pellets.splice(i, 1);
    }

    // Dragonflies: dart, hover, dart.
    for (const fl of this.flies) {
      if (fl.respawn > 0) {
        fl.respawn -= dt;
        if (fl.respawn <= 0) Object.assign(fl, this.newFly(width, height), { x: Math.random() < 0.5 ? -20 : width + 20 });
        continue;
      }
      fl.hover -= dt;
      fl.flap += dt * 40;
      if (fl.hover <= 0) {
        fl.tx = 60 + Math.random() * (width - 120);
        fl.ty = 50 + Math.random() * (height - 100);
        fl.hover = 1.5 + Math.random() * 2.5;
      }
      const dx = fl.tx - fl.x;
      const dy = fl.ty - fl.y;
      fl.vx += (dx * 3 - fl.vx) * dt * 3;
      fl.vy += (dy * 3 - fl.vy) * dt * 3;
      if (input.active) {
        const px = fl.x - input.x;
        const py = fl.y - input.y;
        const d = Math.hypot(px, py);
        if (d < 90 && d > 1) { fl.vx += (px / d) * 900 * dt; fl.vy += (py / d) * 900 * dt; }
      }
      fl.x += fl.vx * dt + Math.sin(fl.flap * 0.21) * 0.4;
      fl.y += fl.vy * dt + Math.cos(fl.flap * 0.17) * 0.4;
    }
  }

  private updateFrog(f: Frog, dt: number, ctx: WorldContext): void {
    const { grid, input } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    f.blink -= dt;
    if (f.blink < -0.14) f.blink = 2 + Math.random() * 4;
    f.breath += dt * 2.6;

    if (f.state === 'idle') {
      const pad = this.pads[f.pad];
      f.x = pad.x + pad.ox;
      f.y = pad.y + pad.oy;
      f.timer -= dt;
      // Turn toward a nearby pointer, curious.
      if (input.active) {
        const d = Math.hypot(input.x - f.x, input.y - f.y);
        if (d < 260) {
          const want = Math.atan2(input.y - f.y, input.x - f.x);
          f.heading += Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading)) * dt * 2;
          if (d < 50) f.timer = Math.min(f.timer, 0.1);
        }
      }
      // Snack check: a dragonfly within reach in front.
      for (let i = 0; i < this.flies.length; i++) {
        const fl = this.flies[i];
        if (fl.respawn > 0) continue;
        const d = Math.hypot(fl.x - f.x, fl.y - f.y);
        if (d < 120 && d > 20) {
          f.state = 'tongue';
          f.t = 0;
          f.prey = i;
          f.heading = Math.atan2(fl.y - f.y, fl.x - f.x);
          return;
        }
      }
      if (f.timer <= 0) {
        f.state = 'anticipate';
        f.timer = 0.35;
        // Pick a free pad; occasionally hop into the water instead.
        const options = this.pads.map((_, i) => i).filter((i) => i !== f.pad && this.padFree(i, f));
        f.fromX = f.x;
        f.fromY = f.y;
        if (options.length === 0 || Math.random() < 0.18) {
          const a = Math.random() * Math.PI * 2;
          f.toPad = -1;
          f.toX = f.x + Math.cos(a) * 140;
          f.toY = f.y + Math.sin(a) * 90;
        } else {
          options.sort((a, b) => Math.hypot(this.pads[a].x - f.x, this.pads[a].y - f.y) - Math.hypot(this.pads[b].x - f.x, this.pads[b].y - f.y));
          const pick = options[Math.min(options.length - 1, Math.floor(Math.random() * Math.min(3, options.length)))];
          f.toPad = pick;
          f.toX = this.pads[pick].x;
          f.toY = this.pads[pick].y;
        }
        f.heading = Math.atan2(f.toY - f.y, f.toX - f.x);
      }
    } else if (f.state === 'anticipate') {
      f.timer -= dt;
      if (f.timer <= 0) {
        f.state = 'jump';
        f.t = 0;
        const dist = Math.hypot(f.toX - f.fromX, f.toY - f.fromY);
        f.dur = 0.45 + dist / 900;
        f.arc = Math.min(70, 25 + dist * 0.18);
        this.wave.addDisturbance(f.fromX / cw, f.fromY / ch, 2.5, 1.8);
      }
    } else if (f.state === 'jump') {
      f.t += dt / f.dur;
      const s = Math.min(1, f.t);
      const e = s * s * (3 - 2 * s);
      f.x = f.fromX + (f.toX - f.fromX) * e;
      f.y = f.fromY + (f.toY - f.fromY) * e;
      if (s >= 1) {
        this.wave.addDisturbance(f.x / cw, f.y / ch, 3.5, f.toPad >= 0 ? 2.5 : 4.5);
        if (f.toPad >= 0) {
          f.pad = f.toPad;
          f.toPad = -1;
          f.state = 'idle';
          f.timer = 3 + Math.random() * 6;
        } else {
          f.state = 'swim';
          // Swim back to the nearest free pad.
          let best = -1;
          let bd = Infinity;
          this.pads.forEach((p, i) => {
            const d = Math.hypot(p.x - f.x, p.y - f.y);
            if (d < bd && this.padFree(i, f)) { bd = d; best = i; }
          });
          f.toPad = best >= 0 ? best : f.pad;
        }
      }
    } else if (f.state === 'swim') {
      const pad = this.pads[f.toPad];
      const dx = pad.x - f.x;
      const dy = pad.y - f.y;
      const d = Math.hypot(dx, dy);
      f.heading = Math.atan2(dy, dx);
      const sp = 55;
      f.x += (dx / d) * sp * dt;
      f.y += (dy / d) * sp * dt;
      if (Math.sin(this.time * 6) > 0.9) this.wave.addDisturbance(f.x / cw, f.y / ch, 1.5, 0.5);
      if (d < pad.r * 0.6) {
        f.state = 'jump';
        f.fromX = f.x;
        f.fromY = f.y;
        f.toX = pad.x;
        f.toY = pad.y;
        f.t = 0;
        f.dur = 0.35;
        f.arc = 18;
      }
    } else if (f.state === 'tongue') {
      f.t += dt / 0.4;
      const fl = this.flies[f.prey];
      if (f.t < 0.5 && fl && fl.respawn <= 0) {
        f.tongueX = fl.x;
        f.tongueY = fl.y;
      }
      if (f.t >= 0.5 && fl && fl.respawn <= 0) {
        fl.respawn = 4 + Math.random() * 4;
        fl.x = -999;
      }
      if (f.t >= 1) {
        f.state = 'idle';
        f.timer = Math.max(f.timer, 1.5);
      }
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, style } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;

    // Water.
    const field = this.field;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const h = this.wave.uCurr[i];
        const gx = this.wave.gradX(c, r);
        const gy = this.wave.gradY(c, r);
        const spec = Math.max(0, gx * 0.6 - gy * 0.8) * 1.8;
        const murk = this.noise.noise3D(c * 0.06, r * 0.12, t * 0.12) * 0.5 + 0.5;
        field[i] = Math.max(0, murk - 0.52) * 0.45 + Math.abs(h) * 0.4 + spec;
      }
    }
    renderField(grid, field, { style, lut: this.waterLut, layer: Layer.SKY, threshold: 0.07, minAlpha: 0.12, alphaGain: 0.75 });

    // Koi under the surface (fogged toward the water).
    const waterTone = hex('#0f3b36');
    for (const k of this.koi) {
      const phase = k.phase;
      const seed = k.seed;
      const bend = Math.max(-0.25, Math.min(0.25, k.turn * 0.15));
      drawBody(grid, {
        x: k.x, y: k.y, heading: k.heading, length: k.len, width: k.len * 0.34, extent: 0.7,
        sampler: (u, v) => {
          const wave = Math.sin(phase - u * 5) * 0.14 * (0.5 - u) + bend * (0.5 - u) * (0.5 - u);
          const vv = v - wave;
          if (u < -0.3) {
            const k2 = (-0.3 - u) / 0.25;
            if (k2 > 1) return 0;
            return Math.abs(vv) < 0.12 + k2 * 0.35 ? 0.62 : 0;
          }
          const x = (u + 0.3) / 0.8;
          const half = 0.5 * Math.sin(Math.PI * Math.pow(Math.min(1, x), 0.7));
          if (Math.abs(vv) > half || x > 1) {
            // pectoral fins
            if (x > 0.55 && x < 0.7 && Math.abs(vv) < half + 0.22) return 0.85;
            return 0;
          }
          const patch = Math.sin(u * 9 + seed) + Math.sin(vv * 7 + seed * 1.7) + Math.sin((u + vv) * 5 + seed * 0.3);
          if (patch > 1.4) return 0.08;
          return patch > 0 ? 0.5 : 0.9;
        },
        lut: this.koiLut, texture: this.koiTex, layer: Layer.FAR, solid: false, opacity: 0.95, fog: 0.18, fogColor: waterTone,
      });
    }
    for (const p of this.pellets) spot(grid, p.x, p.y, code('•'), hex('#d6b46a'), Math.min(1, p.life / 2), Layer.MID);

    // Lily pads.
    for (const p of this.pads) {
      const notch = p.notch;
      drawBody(grid, {
        x: p.x + p.ox, y: p.y + p.oy, heading: 0, length: p.r * 2, width: p.r * 2,
        sampler: (u, v) => {
          const d = Math.hypot(u, v * 1.0);
          if (d > 0.5) return 0;
          const a = Math.atan2(v, u);
          const da = Math.atan2(Math.sin(a - notch), Math.cos(a - notch));
          if (Math.abs(da) < 0.28 && d > 0.04) return 0;
          if (d > 0.44) return 0.32;
          const vein = Math.cos((a - notch) * 9) > 0.92 ? 0.25 : 0;
          return 0.5 + vein + (0.5 - d) * 0.3;
        },
        lut: this.padLut, texture: this.padTex, layer: Layer.MID, solid: true, opacity: 0.95,
      });
      if (p.flower) {
        const fx = p.x + p.ox - Math.cos(p.notch) * p.r * 0.35;
        const fy = p.y + p.oy - Math.sin(p.notch) * p.r * 0.35;
        spot(grid, fx, fy, code('✿'), hex('#f9a8d4'), 1, Layer.FRONT);
        spot(grid, fx - cw, fy, code('❀'), hex('#fbcfe8'), 0.9, Layer.FRONT);
        spot(grid, fx + cw, fy, code('❀'), hex('#fbcfe8'), 0.9, Layer.FRONT);
        spot(grid, fx, fy - ch, code('◡'), hex('#fde68a'), 0.85, Layer.FRONT);
      }
    }

    // Frogs.
    for (const f of this.frogs) this.renderFrog(f, ctx);

    // Dragonflies.
    for (const fl of this.flies) {
      if (fl.respawn > 0) continue;
      const a = Math.atan2(fl.vy, fl.vx);
      const L = cw * 4;
      const tx = fl.x - Math.cos(a) * L;
      const ty = fl.y - Math.sin(a) * L;
      drawLine(grid, tx, ty, fl.x, fl.y, hex('#38bdf8'), 0.95, Layer.FX);
      const wing = Math.sin(fl.flap) > 0 ? 0.55 : 0.25;
      const bx = fl.x - Math.cos(a) * L * 0.25;
      const by = fl.y - Math.sin(a) * L * 0.25;
      for (const side of [-1, 1]) {
        const wa = a + side * (Math.PI / 2 - wing);
        drawLine(grid, bx, by, bx + Math.cos(wa) * cw * 3, by + Math.sin(wa) * cw * 1.6, hex('#e0f2fe'), 0.55, Layer.FX);
      }
      spot(grid, fl.x, fl.y, code('●'), hex('#0ea5e9'), 1, Layer.FX);
    }

    // Reeds frame the edges.
    for (const r of this.reeds) {
      let x = r.x;
      let y = ctx.height + 4;
      const segs = 6;
      const sway = Math.sin(t * 0.9 + r.phase) * 0.08;
      for (let s = 0; s < segs; s++) {
        const k = (s + 1) / segs;
        const nx = r.x + Math.sin(sway * k * 6) * r.h * 0.12 * k;
        const ny = ctx.height - r.h * k;
        drawLine(grid, x, y, nx, ny, mix(hex('#166534'), hex('#86efac'), k * 0.5), 0.9, Layer.FRONT);
        x = nx;
        y = ny;
      }
      if (r.head) {
        spot(grid, x, y, code('█'), hex('#7c4a1e'), 1, Layer.FRONT);
        spot(grid, x, y + ch, code('█'), hex('#6b3d17'), 1, Layer.FRONT);
        spot(grid, x, y - ch, code('╵'), hex('#a3a37a'), 0.8, Layer.FRONT);
      }
    }
    void rows;
  }

  private renderFrog(f: Frog, ctx: WorldContext): void {
    const { grid } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const base = cw * 10;
    let lift = 0;
    let squash = 1;
    let legsOut = 0;
    if (f.state === 'jump') {
      const s = Math.min(1, f.t);
      lift = 4 * s * (1 - s) * f.arc;
      legsOut = Math.sin(Math.min(1, s * 1.6) * Math.PI);
    } else if (f.state === 'anticipate') {
      squash = 0.86;
    }
    const swimming = f.state === 'swim';
    const breath = f.state === 'idle' ? 1 + Math.sin(f.breath) * 0.04 : 1;
    const size = base * (1 + lift / 160);
    const L = size * squash;
    const W = size * 0.84 * breath;

    // Shadow on the water while airborne.
    if (lift > 4) {
      const rr = size * 0.35 * (1 - lift / 200);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        spot(grid, f.x + Math.cos(a) * rr, f.y + 12 + Math.sin(a) * rr * 0.5, code('·'), hex('#06201b'), 0.5, Layer.MID);
      }
    }
    const cx = f.x;
    const cy = f.y - lift;
    const layer = lift > 2 ? Layer.FX : Layer.NEAR;

    if (swimming) {
      // Just eyes and back above the water, with a small V wake.
      const ex = Math.cos(f.heading);
      const ey = Math.sin(f.heading);
      spot(grid, cx - ex * cw * 2 - ey * cw, cy - ey * ch + ex * ch * 0.5, code('\\'), hex('#9ae6d0'), 0.6, Layer.NEAR);
      spot(grid, cx - ex * cw * 2 + ey * cw, cy - ey * ch - ex * ch * 0.5, code('/'), hex('#9ae6d0'), 0.6, Layer.NEAR);
      spot(grid, cx, cy, code('▀'), hex('#4c9a3a'), 1, Layer.NEAR);
      spot(grid, cx - ey * cw, cy + ex * cw * 0.5, code('●'), hex('#111'), 1, Layer.NEAR);
      spot(grid, cx + ey * cw, cy - ex * cw * 0.5, code('●'), hex('#111'), 1, Layer.NEAR);
      return;
    }

    drawBody(grid, {
      x: cx, y: cy, heading: f.heading, length: L, width: W, extent: 1.1,
      sampler: (u, v) => {
        const av = Math.abs(v);
        // Body
        const e = (u / 0.42) ** 2 + (v / 0.36) ** 2;
        if (e < 1) {
          const spots = Math.sin(u * 23) * Math.sin(v * 19) > 0.55 ? -0.3 : 0;
          const stripe = av < 0.05 ? 0.2 : 0;
          return Math.max(0.1, Math.min(1, 0.5 + (0.5 - e) * 0.3 + spots + stripe));
        }
        // Back legs: folded, or kicked out during the leap.
        if (legsOut > 0.2) {
          const lu = u + 0.42 + legsOut * 0.3;
          if ((lu / 0.3) ** 2 + ((av - 0.22) / 0.08) ** 2 < 1) return 0.35;
        } else if (((u + 0.26) / 0.18) ** 2 + ((av - 0.42) / 0.12) ** 2 < 1) return 0.3;
        // Front legs
        if (((u - 0.22) / 0.08) ** 2 + ((av - 0.42) / 0.1) ** 2 < 1) return 0.35;
        return 0;
      },
      lut: this.frogLut, texture: this.skinTex, layer, solid: true, fillAlpha: 1, fillDarken: 0.45, opacity: 1,
    });

    // Eyes always face the camera and blink.
    const hx = Math.cos(f.heading);
    const hy = Math.sin(f.heading);
    const blink = f.blink < 0;
    for (const side of [-1, 1]) {
      const ex = cx + hx * L * 0.3 - hy * W * 0.22 * side;
      const ey = cy + hy * L * 0.3 + hx * W * 0.22 * side;
      grid.putSolid(Math.floor(ex / cw), Math.floor(ey / ch), code(blink ? '-' : '●'), hex('#101410'), 1, hex('#e9f7c9'), 1, layer + 0 === Layer.FX ? Layer.FX : Layer.FRONT);
    }

    if (f.state === 'tongue') {
      const k = f.t < 0.5 ? f.t * 2 : (1 - f.t) * 2;
      const mx = cx + hx * L * 0.45;
      const my = cy + hy * L * 0.45;
      const tx = mx + (f.tongueX - mx) * k;
      const ty = my + (f.tongueY - my) * k;
      drawLine(grid, mx, my, tx, ty, hex('#fb7185'), 1, Layer.FX, code('●'));
    }
  }
}
