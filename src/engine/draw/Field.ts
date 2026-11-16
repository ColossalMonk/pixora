import { RenderGrid, Layer } from '../core/RenderGrid';
import { getRamp } from '../core/Charsets';
import { ResolvedStyle } from '../../types/engine';

/**
 * Renders a per-cell scalar field (values 0..1) with the active character style.
 *
 * - Text styles pick a glyph from the ink-sorted ramp.
 * - Braille bilinearly samples the field at 2×4 sub-cell dots and thresholds
 *   each dot against an ordered-dither matrix, so a field drawn in Braille
 *   gets eight times the spatial detail at no extra simulation cost.
 */

// Ordered thresholds for the 8 Braille dots (2 wide × 4 tall), spread like a Bayer matrix.
const DOT_THRESH = [0.0625, 0.5625, 0.8125, 0.3125, 0.6875, 0.1875, 0.4375, 0.9375];
const TILE_GLYPH = 0x00b7; // ·

// Braille bit for dot (dx, dy).
const DOT_BIT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

export interface FieldOptions {
  style: ResolvedStyle;
  /** 256-entry colour LUT indexed by value. */
  lut: Uint32Array;
  layer?: number;
  /** Values below this are not drawn. */
  threshold?: number;
  /** Opacity = minAlpha + value * alphaGain (clamped). */
  minAlpha?: number;
  alphaGain?: number;
  /** Optional per-cell colour override (packed RGB); 0 means use the LUT. */
  tint?: Uint32Array | null;
  /** Bespoke glyph ramp (dark → bright) used instead of the style's ramp for text styles. */
  ramp?: Uint32Array;
}

export function renderField(grid: RenderGrid, values: Float32Array, opts: FieldOptions): void {
  const { style, lut } = opts;
  const layer = opts.layer ?? Layer.SKY;
  const threshold = opts.threshold ?? 0.06;
  const minAlpha = opts.minAlpha ?? 0.25;
  const alphaGain = opts.alphaGain ?? 0.75;
  const tint = opts.tint ?? null;
  const cols = grid.cols;
  const rows = grid.rows;

  if (style === 'tiles') {
    // Quantised translucent tiles; the brightest level also carries a dark glyph.
    const levels = 4;
    for (let i = 0, n = cols * rows; i < n; i++) {
      const v = values[i];
      if (v < threshold) continue;
      const vv = v > 1 ? 1 : v;
      const q = Math.ceil(((vv - threshold) / (1 - threshold)) * levels) / levels;
      const color = tint && tint[i] ? tint[i] : lut[(vv * 255) | 0];
      const r = (i / cols) | 0;
      const glyph = q >= 1 ? TILE_GLYPH : 0;
      grid.putSolid(i - r * cols, r, glyph, 0x000000, 0.35, color, minAlpha + q * q * alphaGain, layer);
    }
    return;
  }

  if (style === 'braille') {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const v = values[i];
        // Quick reject: nothing in this cell or its neighbours.
        if (v < threshold * 0.5) {
          const right = c + 1 < cols ? values[i + 1] : 0;
          const down = r + 1 < rows ? values[i + cols] : 0;
          if (right < threshold && down < threshold) continue;
        }
        let bits = 0;
        for (let dx = 0; dx < 2; dx++) {
          const fx = c + (dx + 0.5) / 2 - 0.5;
          for (let dy = 0; dy < 4; dy++) {
            const fy = r + (dy + 0.5) / 4 - 0.5;
            const s = sample(values, cols, rows, fx, fy);
            if (s > threshold && s > DOT_THRESH[dx * 4 + dy] * 0.9) bits |= DOT_BIT[dx][dy];
          }
        }
        if (bits === 0) continue;
        const vv = v > 1 ? 1 : v;
        const color = tint && tint[i] ? tint[i] : lut[(vv * 255) | 0];
        grid.put(c, r, 0x2800 + bits, color, minAlpha + vv * alphaGain, layer);
      }
    }
    return;
  }

  const ramp = opts.ramp ?? getRamp(style);
  const steps = ramp.length - 1;
  for (let i = 0, n = cols * rows; i < n; i++) {
    const v = values[i];
    if (v < threshold) continue;
    const vv = v > 1 ? 1 : v;
    const idx = 1 + Math.min(steps - 1, ((vv - threshold) / (1 - threshold) * steps) | 0);
    const color = tint && tint[i] ? tint[i] : lut[(vv * 255) | 0];
    const r = (i / cols) | 0;
    grid.put(i - r * cols, r, ramp[idx], color, minAlpha + vv * alphaGain, layer);
  }
}

function sample(values: Float32Array, cols: number, rows: number, x: number, y: number): number {
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > cols - 1) x = cols - 1;
  if (y > rows - 1) y = rows - 1;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1 < cols ? x0 + 1 : x0;
  const y1 = y0 + 1 < rows ? y0 + 1 : y0;
  const tx = x - x0;
  const ty = y - y0;
  const a = values[y0 * cols + x0];
  const b = values[y0 * cols + x1];
  const c = values[y1 * cols + x0];
  const d = values[y1 * cols + x1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/**
 * Braille straight from a sub-cell field (2 columns × 4 rows of dots per cell).
 * Used when a world deposits ink at dot resolution, e.g. flow trails: each dot
 * lights when its own sample passes the threshold, so lines stay one dot thin.
 */
export function renderBrailleDots(
  grid: RenderGrid,
  dots: Float32Array,
  opts: { lut: Uint32Array; layer?: number; threshold?: number; minAlpha?: number; alphaGain?: number }
): void {
  const cols = grid.cols;
  const rows = grid.rows;
  const w = cols * 2;
  const layer = opts.layer ?? Layer.SKY;
  const threshold = opts.threshold ?? 0.08;
  const minAlpha = opts.minAlpha ?? 0.3;
  const alphaGain = opts.alphaGain ?? 0.7;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let bits = 0;
      let peak = 0;
      for (let dy = 0; dy < 4; dy++) {
        const row = (r * 4 + dy) * w + c * 2;
        const a = dots[row];
        const b = dots[row + 1];
        if (a > threshold) { bits |= DOT_BIT[0][dy]; if (a > peak) peak = a; }
        if (b > threshold) { bits |= DOT_BIT[1][dy]; if (b > peak) peak = b; }
      }
      if (bits === 0) continue;
      const v = peak > 1 ? 1 : peak;
      grid.put(c, r, 0x2800 + bits, opts.lut[(v * 255) | 0], minAlpha + v * alphaGain, layer);
    }
  }
}
