import { BaseEnvironment } from './BaseEnvironment';
import { Habitat, WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, hash2, mix } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawBody, spot } from '../draw/Shapes';

interface Spark { x: number; y: number; vx: number; vy: number; life: number; }

/**
 * A campfire under the stars. The flames are a classic heat-propagation fire:
 * every step each cell takes the heat of a random neighbour below it, minus a
 * random cooling, so flames lick upward and flicker. Wind (from the pointer)
 * biases which neighbour is picked, leaning the fire.
 */
export class Campfire extends BaseEnvironment {
  public readonly id = 'campfire';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#07070f'), hex('#0d0b16'), hex('#160e10'), hex('#0b0605')];

  private heat = new Float32Array(0);
  private field = new Float32Array(0);
  private fw = 0;
  private fh = 0;
  private fx0 = 0; // grid column where the fire grid starts
  private fy0 = 0; // grid row of the fire grid's top
  private sparks: Spark[] = [];
  private stars: { c: number; r: number; p: number }[] = [];
  private trees: { x: number; h: number; w: number }[] = [];
  private wind = 0;
  private flare = 0;
  private groundRow = 0;

  private fireLut = gradientLUT([
    [0, hex('#3b0a04')],
    [0.2, hex('#b91c1c')],
    [0.4, hex('#ea580c')],
    [0.6, hex('#f59e0b')],
    [0.8, hex('#fde047')],
    [1, hex('#fffbeb')],
  ]);
  private glowLut = gradientLUT([[0, hex('#3b1308')], [1, hex('#f59e0b')]]);
  private logLut = gradientLUT([[0, hex('#2a160b')], [0.6, hex('#5b341a')], [1, hex('#8a5a33')]]);
  private logTex = Uint32Array.from(Array.from('=-≡').map(code));

  private groundPx = 0;

  /** Animals layered here stay above the ground, in the night air. */
  public habitat(width: number, height: number): Habitat {
    return { top: 0, bottom: this.groundPx || height, left: 0, right: width, groundY: this.groundPx };
  }

  public init(ctx: WorldContext): void {
    const { grid, width, height } = ctx;
    const area = (width * height) / (1440 * 900);
    this.groundRow = grid.rows - Math.max(3, Math.round(grid.rows * 0.1));
    this.groundPx = this.groundRow * grid.cellHeight;
    this.fw = Math.max(24, Math.round(grid.cols * 0.16));
    this.fh = Math.max(16, Math.round(grid.rows * 0.42));
    this.fx0 = Math.round(grid.cols / 2 - this.fw / 2);
    this.fy0 = this.groundRow - this.fh;
    this.heat = new Float32Array(this.fw * this.fh);
    this.field = this.ensure(this.field, grid.size);
    this.sparks = [];
    this.stars = [];
    for (let i = 0; i < 110 * area; i++) {
      this.stars.push({ c: Math.floor(Math.random() * grid.cols), r: Math.floor(Math.random() * grid.rows * 0.55), p: Math.random() * 6 });
    }
    this.trees = [];
    for (let x = -20; x < width + 40; x += 34 + Math.random() * 50) {
      if (Math.abs(x - width / 2) < width * 0.22) continue; // keep the clearing open
      this.trees.push({ x, h: height * (0.28 + Math.random() * 0.3), w: 40 + Math.random() * 40 });
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { grid, input } = ctx;
    const w = this.fw;
    const h = this.fh;
    const heat = this.heat;

    // Wind leans toward the pointer's side of the fire.
    let target = Math.sin(this.time * 0.3) * 0.25;
    if (input.active) {
      const dx = (input.x / grid.cellWidth - (this.fx0 + w / 2)) / (w * 1.5);
      target += Math.max(-1, Math.min(1, dx)) * 0.9 * input.intensity;
    }
    this.wind += (target - this.wind) * Math.min(1, dt * 1.5);

    for (const c of input.clicks) {
      this.flare = 1;
      for (let i = 0; i < 40; i++) {
        this.sparks.push({ x: (this.fx0 + w / 2 + (Math.random() - 0.5) * w * 0.4) * grid.cellWidth, y: (this.groundRow - 3) * grid.cellHeight, vx: (Math.random() - 0.5) * 140, vy: -120 - Math.random() * 260, life: 1 + Math.random() });
      }
      void c;
    }
    this.flare = Math.max(0, this.flare - dt * 0.8);

    // Fuel line along the bottom: hot in the middle, embers flicker.
    const base = 0.92 + this.flare * 0.08;
    for (let x = 0; x < w; x++) {
      const k = 1 - Math.abs(x - w / 2) / (w / 2);
      heat[(h - 1) * w + x] = k > 0.15 ? Math.min(1, base * Math.pow(k, 0.5) * (0.75 + Math.random() * 0.35)) : 0;
    }
    // Propagate upward (two passes per step for taller flames).
    const cool = (0.75 / h) * (1 - this.flare * 0.35);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w; x++) {
          const drift = Math.round((Math.random() - 0.5) * 2 + this.wind * Math.random());
          const sx = Math.min(w - 1, Math.max(0, x - drift));
          const below = heat[(y + 1) * w + sx];
          heat[y * w + x] = Math.max(0, below - Math.random() * cool * 2);
        }
      }
    }

    // Sparks
    if (Math.random() < dt * 9) {
      this.sparks.push({ x: (this.fx0 + w / 2 + (Math.random() - 0.5) * w * 0.3) * grid.cellWidth, y: (this.groundRow - 4) * grid.cellHeight, vx: (Math.random() - 0.5) * 40, vy: -90 - Math.random() * 120, life: 1.2 + Math.random() * 1.4 });
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.vx += (this.wind * 60 - s.vx) * dt * 0.8 + (Math.random() - 0.5) * 80 * dt;
      s.vy += 30 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    if (this.sparks.length > 220) this.sparks.splice(0, this.sparks.length - 220);
  }

  public render(ctx: WorldContext): void {
    const { grid, style, height } = ctx;
    const cols = grid.cols;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;

    for (const s of this.stars) {
      const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.2 + s.p * 5));
      grid.putChar(s.c, s.r, '·', hex('#cbd5e1'), a, Layer.SKY);
    }

    // Firelight on the ground and trees: a soft glow field around the fire.
    const glow = this.field;
    glow.fill(0);
    const cx = this.fx0 + this.fw / 2;
    const cy = this.groundRow - 2;
    const flicker = 0.85 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.05 + this.flare * 0.3;
    const R = this.fw * 1.15;
    for (let r = Math.max(0, Math.floor(cy - R * grid.aspect)); r < grid.rows; r++) {
      for (let c = Math.max(0, Math.floor(cx - R)); c < Math.min(cols, cx + R); c++) {
        const d = Math.hypot(c - cx, (r - cy) / grid.aspect) / R;
        if (d < 1) glow[r * cols + c] = (1 - d) * (1 - d) * 0.32 * flicker;
      }
    }
    renderField(grid, glow, { style: style === 'tiles' ? 'tiles' : style, lut: this.glowLut, layer: Layer.SKY, threshold: 0.04, minAlpha: 0.02, alphaGain: 0.35 });

    // Tree silhouettes, rim-lit on the side facing the fire.
    for (const tr of this.trees) {
      const baseY = this.groundRow * ch;
      const rows = Math.round(tr.h / ch);
      for (let k = 0; k < rows; k++) {
        const y = baseY - k * ch;
        const halfW = (tr.w / 2) * (1 - k / rows) * (0.6 + 0.4 * ((k % 3) / 2));
        const c0 = Math.floor((tr.x - halfW) / cw);
        const c1 = Math.floor((tr.x + halfW) / cw);
        const facing = tr.x < cx * cw ? c1 : c0;
        const lit = Math.max(0, 1 - Math.abs(tr.x - cx * cw) / (ctx.width * 0.45)) * flicker;
        for (let c = c0; c <= c1; c++) {
          const rim = c === facing && lit > 0.2;
          grid.putSolid(c, Math.floor(y / ch), rim ? code('·') : 0, mix(hex('#0a0b10'), hex('#f59e0b'), lit * 0.8), 0.9, rim ? mix(hex('#0b0d12'), hex('#7c2d12'), lit * 0.6) : hex('#07080c'), 1, Layer.MID);
        }
      }
      // trunk
      for (let k = 0; k < 2; k++) grid.putSolid(Math.floor(tr.x / cw), this.groundRow - k, 0, 0, 0, hex('#120b08'), 1, Layer.MID);
    }

    // Ground
    for (let r = this.groundRow; r < grid.rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = Math.abs(c - cx) / (cols * 0.5);
        const lit = Math.max(0, 1 - d * 2.2) * flicker * (1 - (r - this.groundRow) / 6);
        const g = hash2(c, r) > 0.85 ? code(',') : hash2(c, r) < 0.05 ? code('.') : 0;
        grid.putSolid(c, r, g, hex('#3f2a1a'), 0.6, mix(hex('#0d0a08'), hex('#5a2e14'), lit * 0.7), 0.95, Layer.FRONT);
      }
    }

    // Flames
    const w = this.fw;
    const field = this.field;
    field.fill(0);
    for (let y = 0; y < this.fh; y++) {
      for (let x = 0; x < w; x++) {
        const v = this.heat[y * w + x];
        if (v > 0.08) field[(this.fy0 + y) * cols + this.fx0 + x] = v;
      }
    }
    const fireStyle = style === 'tiles' ? 'tiles' : style;
    renderField(grid, field, { style: fireStyle, lut: this.fireLut, layer: Layer.NEAR, threshold: 0.1, minAlpha: 0.55, alphaGain: 0.45 });
    if (fireStyle === 'tiles') {
      // Bright core glyphs on top of the tiles.
      for (let y = 0; y < this.fh; y++) {
        for (let x = 0; x < w; x++) {
          const v = this.heat[y * w + x];
          if (v > 0.55) grid.put(this.fx0 + x, this.fy0 + y, code(v > 0.85 ? '*' : v > 0.7 ? '^' : '\''), hex('#7c2d12'), 0.55, Layer.FRONT);
        }
      }
    }

    // Logs and stones
    const lx = cx * cw;
    const ly = (this.groundRow - 0.5) * ch;
    drawBody(grid, { x: lx - this.fw * cw * 0.12, y: ly, heading: 0.35, length: this.fw * cw * 0.55, width: ch * 1.2, sampler: (u, v) => (Math.abs(v) < 0.5 && Math.abs(u) < 0.5 ? 0.5 + (u > 0.42 ? 0.4 : 0) : 0), lut: this.logLut, texture: this.logTex, layer: Layer.FRONT, solid: true });
    drawBody(grid, { x: lx + this.fw * cw * 0.12, y: ly, heading: -0.35, length: this.fw * cw * 0.55, width: ch * 1.2, sampler: (u, v) => (Math.abs(v) < 0.5 && Math.abs(u) < 0.5 ? 0.45 + (u < -0.42 ? 0.4 : 0) : 0), lut: this.logLut, texture: this.logTex, layer: Layer.FRONT, solid: true });
    for (let k = -3; k <= 3; k++) {
      const sx = lx + k * this.fw * cw * 0.11;
      grid.putSolid(Math.floor(sx / cw), this.groundRow, code('o'), hex('#1f2937'), 0.7, hex('#4b5563'), 1, Layer.FX);
    }

    for (const s of this.sparks) {
      const a = Math.min(1, s.life);
      spot(grid, s.x, s.y, code(s.life > 1 ? '*' : '·'), mix(hex('#f97316'), hex('#fde68a'), Math.random()), a, Layer.FX);
    }
    void height;
  }
}
