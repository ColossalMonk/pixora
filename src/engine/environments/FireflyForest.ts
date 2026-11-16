import { BaseEnvironment } from './BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, hash2, mix } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawLine, spot } from '../draw/Shapes';

interface Trunk { x: number; w: number; depth: number; }
interface Fern { x: number; y: number; size: number; }
interface Leaf { x: number; y: number; vx: number; vy: number; spin: number; }

/**
 * Night Forest (scenery only — fireflies live in Animals). Tall trunks at
 * three depths, slanting moonlight shafts, low mist that drifts and swirls
 * around the pointer, ferns along the floor and the odd falling leaf.
 * A click sends a gust: the mist streams and the ferns bow.
 */
export class FireflyForest extends BaseEnvironment {
  public readonly id = 'firefly-forest';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#040d0b'), hex('#06140f'), hex('#081a13'), hex('#030907')];

  private noise = new SimplexNoise(77);
  private trunks: Trunk[] = [];
  private ferns: Fern[] = [];
  private leaves: Leaf[] = [];
  private mist = new Float32Array(0);
  private shafts = new Float32Array(0);
  private gust = 0;
  private mistLut = gradientLUT([[0, hex('#1d3b34')], [1, hex('#9fc9bb')]]);
  private moonLut = gradientLUT([[0, hex('#1a2e2a')], [1, hex('#d7efe4')]]);

  public init(ctx: WorldContext): void {
    const { grid, width, height } = ctx;
    this.mist = this.ensure(this.mist, grid.size);
    this.shafts = this.ensure(this.shafts, grid.size);
    this.trunks = [];
    for (let x = -10; x < width + 20; x += 50 + Math.random() * 90) {
      const depth = Math.random();
      if (Math.abs(x - width / 2) < width * 0.18 && depth > 0.3) continue;
      this.trunks.push({ x, w: grid.cellWidth * (1 + depth * 3.5), depth });
    }
    this.trunks.sort((a, b) => a.depth - b.depth);
    this.ferns = [];
    for (let x = 0; x < width; x += 60 + Math.random() * 80) this.ferns.push({ x, y: height + 4, size: 30 + Math.random() * 40 });
    this.leaves = [];
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, width, height } = ctx;
    if (input.clicks.length) this.gust = 1;
    this.gust = Math.max(0, this.gust - dt * 0.6);
    if (Math.random() < dt * 0.4) this.leaves.push({ x: Math.random() * width, y: -10, vx: 0, vy: 20 + Math.random() * 20, spin: Math.random() * 6 });
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i];
      l.spin += dt * 2;
      l.vx = Math.sin(l.spin) * 30 + this.gust * 160;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (l.y > height + 10) this.leaves.splice(i, 1);
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, style, input } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;

    // Moonlight shafts: slanted bands from the upper left, very faint.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const band = this.noise.noise2D((c + r * 0.6) * 0.03, t * 0.02);
        this.shafts[r * cols + c] = Math.max(0, band - 0.45) * 0.9 * (1 - r / rows * 0.6);
      }
    }
    renderField(grid, this.shafts, { style, lut: this.moonLut, layer: Layer.SKY, threshold: 0.12, minAlpha: 0.02, alphaGain: 0.18 });

    // Trunks
    for (const tr of this.trunks) {
      const c0 = Math.floor((tr.x - tr.w / 2) / cw);
      const c1 = Math.floor((tr.x + tr.w / 2) / cw);
      const layer = tr.depth > 0.6 ? Layer.NEAR : tr.depth > 0.3 ? Layer.MID : Layer.FAR;
      const fill = mix(hex('#173229'), hex('#060c0a'), tr.depth);
      for (let r = 0; r < rows; r++) {
        for (let c = c0; c <= c1; c++) {
          const bark = tr.depth > 0.5 && hash2(c, Math.floor(r / 2)) > 0.8 ? code('|') : 0;
          grid.putSolid(c, r, bark, mix(fill, hex('#3f5f4b'), 0.4), 0.6, fill, 0.4 + tr.depth * 0.6, layer);
        }
      }
    }

    // Low mist, drifting and parting around the pointer.
    const mx = input.active ? input.x / cw : -999;
    const my = input.active ? input.y / ch : -999;
    for (let r = Math.floor(rows * 0.55); r < rows; r++) {
      const low = (r - rows * 0.55) / (rows * 0.45);
      for (let c = 0; c < cols; c++) {
        let v = this.noise.noise3D(c * 0.05 - t * (0.05 + this.gust * 0.6), r * 0.12, t * 0.05) * 0.5 + 0.5;
        v = Math.max(0, v - 0.45) * 1.4 * low;
        const d = Math.hypot(c - mx, (r - my) / grid.aspect);
        if (d < 10) v *= d / 10;
        this.mist[r * cols + c] = v;
      }
    }
    for (let i = 0; i < Math.floor(rows * 0.55) * cols; i++) this.mist[i] = 0;
    renderField(grid, this.mist, { style, lut: this.mistLut, layer: Layer.NEAR, threshold: 0.1, minAlpha: 0.03, alphaGain: 0.3 });

    for (const l of this.leaves) spot(grid, l.x, l.y, code(Math.sin(l.spin) > 0 ? '❦' : '•'), hex('#a3a35a'), 0.75, Layer.FX);

    // Ferns, bowing in a gust.
    for (const fe of this.ferns) {
      for (let k = -3; k <= 3; k += 2) {
        const a = -Math.PI / 2 + k * 0.28 + Math.sin(t * 0.6 + fe.x) * 0.05 + this.gust * 0.5;
        drawLine(grid, fe.x, fe.y, fe.x + Math.cos(a) * fe.size, fe.y + Math.sin(a) * fe.size * 0.8, mix(hex('#14532d'), hex('#4d7c0f'), Math.abs(k) / 4), 0.45, Layer.FRONT);
      }
    }
  }
}
