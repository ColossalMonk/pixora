import { BaseEnvironment } from './BaseEnvironment';
import { Habitat, WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { EnergyField } from '../physics/EnergyField';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, mix, hash2 } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawBody, drawLine, spot } from '../draw/Shapes';

interface Bubble { x: number; y: number; vy: number; size: number; wobble: number; }
interface Kelp { x: number; segs: number; segLen: number; phase: number; sway: number; depth: number; }
interface Coral { x: number; branches: [number, number, number, number][]; color: number; }
interface Snow { x: number; y: number; s: number; }

export class UnderwaterWorld extends BaseEnvironment {
  public readonly id = 'underwater';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#0c3b5e'), hex('#082a47'), hex('#05182c'), hex('#030b17')];
  public readonly followsClock = true;
  public readonly backdropDay = [hex('#1f6f9c'), hex('#155a82'), hex('#0c3a5c'), hex('#06203a')];

  private noise = new SimplexNoise(42);
  private wake = new EnergyField();
  private light = new Float32Array(0);
  private bed = new Int16Array(0);
  private bubbles: Bubble[] = [];
  private kelp: Kelp[] = [];
  private coral: Coral[] = [];
  private snow: Snow[] = [];
  private vents: number[] = [];

  private lightLut = gradientLUT([[0, hex('#0e4a6e')], [0.5, hex('#3aa6c9')], [1, hex('#c9f3ff')]]);
  private wakeLut = gradientLUT([[0, hex('#1d6f8f')], [1, hex('#bff2ff')]]);
  private sandLut = gradientLUT([[0, hex('#3b3226')], [0.6, hex('#8a7558')], [1, hex('#d9c49a')]]);
  private rockLut = gradientLUT([[0, hex('#1f2937')], [1, hex('#64748b')]]);
  private rockTex = Uint32Array.from(Array.from('.:%#@').map(code));

  private seabedPx = 0;

  /** Animals layered here swim between the surface light and the seabed. */
  public habitat(width: number, height: number): Habitat {
    return { top: 20, bottom: Math.min(height, this.seabedPx || height) - 24, left: 0, right: width, groundY: this.seabedPx };
  }

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

    this.seabedPx = Math.min(...Array.from(this.bed)) * grid.cellHeight;

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

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { width, height, input, grid } = ctx;
    const t = this.time;
    const pointer = input.active && input.intensity > 0;

    // Clicks: a burst of bubbles and a ripple of disturbed water.
    for (const click of input.clicks) {
      for (let i = 0; i < 14; i++) {
        const b = this.newBubble(click.x + (Math.random() - 0.5) * 30, click.y + (Math.random() - 0.5) * 20);
        b.vy = 60 + Math.random() * 90;
        this.bubbles.push(b);
      }
      this.wake.stamp(click.x / grid.cellWidth, click.y / grid.cellHeight, 6, 1.6);
    }
    if (this.bubbles.length > 160) this.bubbles.splice(0, this.bubbles.length - 160);

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

  }

  public render(ctx: WorldContext): void {
    const { grid, style, width, height } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;

    // 1. Soft god rays (sky layer field).
    const light = this.light;
    for (let r = 0; r < rows; r++) {
      const yn = r / rows;
      const depthFade = Math.pow(1 - yn, 1.7);
      for (let c = 0; c < cols; c++) {
        const slant = c * 0.022 + r * 0.012;
        const ray = Math.max(0, this.noise.noise2D(slant, t * 0.05)) ** 2 * 0.55 * (0.6 + ctx.sky.light * 0.8);
        light[r * cols + c] = ray * depthFade;
      }
    }
    renderField(grid, light, { style, lut: this.lightLut, layer: Layer.SKY, threshold: 0.14, minAlpha: 0.04, alphaGain: 0.14 });

    // 2. Marine snow.
    for (let i = 0; i < this.snow.length; i += 3) { const s = this.snow[i]; spot(grid, s.x, s.y, code('·'), hex('#9cc9de'), 0.15 + s.s * 0.15, Layer.FAR); }

    // 3. Wake / disturbance field.
    renderField(grid, this.wake.values, { style, lut: this.wakeLut, layer: Layer.FAR, threshold: 0.12, minAlpha: 0.08, alphaGain: 0.35 });

    // 4. Far kelp (behind fish).
    this.renderKelp(ctx, false);

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
        // Sand as tiles: lighter on top, darker deeper, with a sparse grain glyph.
        const depthIn = Math.min(1, (r - top) / 3);
        const grain = hash2(c, r);
        const v = 0.55 - depthIn * 0.3 + grain * 0.12;
        const tile = this.sandLut[(v * 255) | 0];
        const g = grain > 0.82 ? code('.') : grain < 0.08 ? code(',') : 0;
        grid.putSolid(c, r, g, mix(tile, 0, 0.5), 0.8, tile, 0.55 - depthIn * 0.2, Layer.FRONT);
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
        lut: this.rockLut, texture: this.rockTex, layer: Layer.FRONT, solid: true,
      });
    }
    this.renderKelp(ctx, true);
    void width;
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
