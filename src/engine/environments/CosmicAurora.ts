import { BaseEnvironment } from './BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { EnergyField } from '../physics/EnergyField';
import { Layer, code } from '../core/RenderGrid';

/** Vertical-ray glyphs for the curtains when the style is Auto. */
const RAY_RAMP = Uint32Array.from(Array.from(' .·:¦|‖║').map(code));
import { gradientLUT, hex, hash2, mix, scale } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawLine } from '../draw/Shapes';
import { strokeFor } from '../core/Charsets';

interface Star { c: number; r: number; p: number; g: number; b: number; }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number; }

/**
 * Northern lights over mountains and a still lake. Curtains hang from a
 * wandering base line with vertical striations; colour runs green at the hem
 * to violet at the crown. Everything above the lake is mirrored into it with
 * a gentle ripple.
 */
export class CosmicAurora extends BaseEnvironment {
  public readonly id = 'cosmic-aurora';
  public readonly preferredStyle = 'ascii-dense' as const;
  public readonly backdrop = [hex('#020617'), hex('#06102b'), hex('#0c1a3d'), hex('#040a1c')];

  private noise = new SimplexNoise(777);
  private glow = new EnergyField();
  private field = new Float32Array(0);
  private tint = new Uint32Array(0);
  private stars: Star[] = [];
  private meteors: Meteor[] = [];
  private farRidge = new Int16Array(0);
  private nearRidge = new Int16Array(0);
  private lakeTop = 0;
  private meteorTimer = 6;
  private wind = 0;

  private lut = gradientLUT([[0, hex('#0b3b3a')], [0.4, hex('#10b981')], [0.7, hex('#6ee7b7')], [1, hex('#ecfdf5')]]);
  private hem = hex('#34f5a6');
  private crown = hex('#b45cf0');

  public init(ctx: WorldContext): void {
    const { grid, width, height } = ctx;
    const area = (width * height) / (1440 * 900);
    this.field = this.ensure(this.field, grid.size);
    this.tint = this.tint.length === grid.size ? this.tint : new Uint32Array(grid.size);
    this.glow.resize(grid.cols, grid.rows, grid.aspect);
    this.lakeTop = Math.round(grid.rows * 0.8);

    this.farRidge = new Int16Array(grid.cols);
    this.nearRidge = new Int16Array(grid.cols);
    for (let c = 0; c < grid.cols; c++) {
      // Ridged noise (1 - |n|) gives sharp peaks instead of rolling terraces.
      const ridge = (x: number, seed: number) => 1 - Math.abs(this.noise.noise2D(x, seed));
      const f = ridge(c * 0.022, 2) * 0.65 + ridge(c * 0.07, 5) * 0.25 + ridge(c * 0.2, 7) * 0.1;
      const n = ridge(c * 0.04, 8) * 0.6 + ridge(c * 0.13, 13) * 0.3 + ridge(c * 0.35, 17) * 0.1;
      this.farRidge[c] = Math.round(this.lakeTop - 3 - Math.pow(f, 1.6) * grid.rows * 0.24);
      this.nearRidge[c] = Math.round(this.lakeTop - 1 - Math.pow(n, 1.8) * grid.rows * 0.1);
    }

    this.stars = [];
    for (let i = 0; i < 160 * area; i++) {
      const c = Math.floor(Math.random() * grid.cols);
      const r = Math.floor(Math.random() * this.farRidge[c]);
      const roll = Math.random();
      this.stars.push({ c, r, p: Math.random() * 6, g: code(roll > 0.96 ? '✦' : roll > 0.9 ? '+' : roll > 0.55 ? '·' : '.'), b: 0.3 + Math.random() * 0.7 });
    }
    this.meteors = [];
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { grid, input, width } = ctx;
    for (const c of input.clicks) {
      this.glow.stamp(c.x / grid.cellWidth, c.y / grid.cellHeight, 14, 1.4 * input.intensity);
      this.meteors.push({ x: c.x, y: c.y, vx: (Math.random() < 0.5 ? -1 : 1) * 700, vy: 260, life: 1 });
    }
    // Pointer = solar wind: brightens and pushes the curtains.
    if (input.active) {
      this.glow.stamp(input.x / grid.cellWidth, input.y / grid.cellHeight, 8, 0.04 * input.intensity);
      this.wind += ((input.x / width - 0.5) * 2 * input.intensity - this.wind) * dt * 0.8;
    } else {
      this.wind *= Math.exp(-dt * 0.5);
    }
    this.glow.step(dt, 0.8);

    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.meteorTimer = 7 + Math.random() * 12;
      this.meteors.push({ x: Math.random() * width, y: Math.random() * ctx.height * 0.3, vx: (Math.random() < 0.5 ? -1 : 1) * (500 + Math.random() * 400), vy: 180 + Math.random() * 120, life: 1 });
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt * 0.9;
      if (m.life <= 0) this.meteors.splice(i, 1);
    }
  }

  public render(ctx: WorldContext): void {
    const { grid, style } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const t = this.time;
    const lake = this.lakeTop;
    const field = this.field;
    const tint = this.tint;
    field.fill(0);
    tint.fill(0);

    // Stars (sky only).
    for (const s of this.stars) {
      const a = s.b * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * (0.8 + s.b) + s.p * 9)));
      grid.put(s.c, s.r, s.g, hex('#e0e7ff'), a, Layer.SKY);
      // Reflection
      const rr = 2 * lake - s.r;
      if (rr < rows && rr > lake) grid.put(s.c, rr, code('.'), hex('#94a3b8'), a * 0.35, Layer.SKY);
    }

    // Aurora: two curtains.
    const glow = this.glow.values;
    for (let layerIdx = 0; layerIdx < 2; layerIdx++) {
      const speed = layerIdx ? 0.05 : 0.035;
      const amp = layerIdx ? 0.1 : 0.14;
      const baseY = layerIdx ? 0.5 : 0.42;
      const height = layerIdx ? 0.32 : 0.42;
      const strength = layerIdx ? 0.55 : 1;
      for (let c = 0; c < cols; c++) {
        const x = c / cols;
        const sway = this.noise.noise2D(x * 1.6 + layerIdx * 9, t * speed) * amp + this.wind * 0.03 * (1 - x);
        const base = (baseY + sway) * rows;
        // Vertical striations drifting sideways.
        const rays = Math.max(0, this.noise.noise2D(x * 26 + t * 0.25 + layerIdx * 40, t * 0.12 + layerIdx));
        const sheet = 0.55 + 0.45 * this.noise.noise2D(x * 3.5 + layerIdx * 3, t * 0.08);
        const top = base - height * rows * (0.6 + 0.4 * sheet);
        for (let r = Math.max(0, Math.floor(top)); r < Math.min(lake, Math.ceil(base + 2)); r++) {
          const k = (base - r) / (base - top); // 0 at hem, 1 at crown
          if (k < -0.15) continue;
          const hemGlow = k < 0 ? (1 + k / 0.15) * 0.8 : 1;
          const fall = k < 0 ? hemGlow : Math.pow(1 - k, 1.6) * (0.45 + 0.55 * Math.exp(-k * 4));
          const v = Math.min(1, strength * fall * (0.45 + rays * 1.1) * sheet * 1.9);
          const i = r * cols + c;
          if (v > field[i]) {
            field[i] = v + glow[i] * 0.3;
            tint[i] = mix(this.hem, this.crown, Math.min(1, Math.max(0, k * 1.2)));
          }
        }
      }
    }
    // Pointer glow also brightens sky slightly.
    for (let i = 0; i < lake * cols; i++) if (glow[i] > 0.05 && field[i] < glow[i] * 0.25) { field[i] = glow[i] * 0.25; tint[i] = hex('#7dd3fc'); }

    // Mirror into the lake with a horizontal ripple.
    for (let r = lake + 1; r < rows; r++) {
      const src = 2 * lake - r;
      if (src < 0) continue;
      const d = (r - lake) / (rows - lake);
      for (let c = 0; c < cols; c++) {
        const shift = Math.round(Math.sin(r * 1.7 + t * 1.5 + c * 0.05) * (1 + d * 2));
        const sc = Math.min(cols - 1, Math.max(0, c + shift));
        const si = src * cols + sc;
        const i = r * cols + c;
        field[i] = field[si] * (0.42 - d * 0.18);
        tint[i] = tint[si] ? scale(tint[si], 0.75) : 0;
      }
    }
    renderField(grid, field, { style, lut: this.lut, tint, layer: Layer.SKY, threshold: 0.1, minAlpha: 0.22, alphaGain: 0.78, ramp: ctx.auto ? RAY_RAMP : undefined });

    // Meteors.
    for (const m of this.meteors) {
      const len = 90;
      const sp = Math.hypot(m.vx, m.vy);
      drawLine(grid, m.x - (m.vx / sp) * len, m.y - (m.vy / sp) * len, m.x, m.y, hex('#e0f2fe'), m.life * 0.8, Layer.FAR, code('✦'));
    }

    // Mountains: far ridge with snow, near ridge, both as solid silhouettes.
    for (let c = 0; c < cols; c++) {
      const fr = this.farRidge[c];
      const nr = this.nearRidge[c];
      const slopeF = (this.farRidge[Math.min(cols - 1, c + 1)] - this.farRidge[Math.max(0, c - 1)]) / 2;
      const slopeN = (this.nearRidge[Math.min(cols - 1, c + 1)] - this.nearRidge[Math.max(0, c - 1)]) / 2;
      for (let r = Math.max(0, fr); r <= lake; r++) {
        const isEdge = r === fr;
        const snow = r - fr < 2 && fr < this.lakeTop - rows * 0.14;
        const cp = isEdge ? (Math.abs(slopeF) < 0.3 ? code('_') : strokeFor(Math.atan2(slopeF, 1))) : snow && hash2(c, r) > 0.4 ? code('·') : 0;
        grid.putSolid(c, r, cp, snow ? hex('#e2e8f0') : hex('#64748b'), 0.8, hex('#0b1530'), 1, Layer.MID);
      }
      for (let r = Math.max(0, nr); r <= lake; r++) {
        const isEdge = r === nr;
        const cp = isEdge ? (Math.abs(slopeN) < 0.3 ? code('_') : strokeFor(Math.atan2(slopeN, 1))) : hash2(c * 3, r) > 0.93 ? code('▲') : 0;
        grid.putSolid(c, r, cp, isEdge ? hex('#334155') : hex('#0f2a1f'), 0.9, hex('#060d1d'), 1, Layer.NEAR);
      }
      // Ridge reflections
      const reflF = 2 * lake - fr;
      const reflN = 2 * lake - nr;
      for (let r = lake + 1; r < Math.min(rows, reflF); r++) {
        grid.putBg(c, r, r <= reflN ? hex('#050b18') : hex('#08112a'), 0.6, Layer.SKY);
      }
      // Shoreline
      grid.putChar(c, lake + 1, hash2(c, 1) > 0.5 ? '~' : '-', hex('#475569'), 0.5, Layer.NEAR);
    }
  }
}
