import { RenderGrid, Layer, code } from '../core/RenderGrid';
import { hash2, mix } from '../core/Color';
import { strokeFor } from '../core/Charsets';

/**
 * Body sampler: given body-space coordinates (u along the heading, v across,
 * both roughly -0.5..0.5 inside the body) return a shade in (0..1] for ink,
 * or 0 for empty.
 */
export type BodySampler = (u: number, v: number) => number;

export interface BodyOptions {
  /** Centre in CSS pixels. */
  x: number;
  y: number;
  /** Heading in radians (screen space, y down). */
  heading: number;
  /** Body length / width in CSS pixels. */
  length: number;
  width: number;
  sampler: BodySampler;
  /** Shade → colour. */
  lut: Uint32Array;
  /** Texture glyphs, light → dense (indexed by shade). */
  texture: Uint32Array;
  layer?: number;
  opacity?: number;
  /** Draw well-covered cells as coloured tiles with a darker glyph on top. */
  solid?: boolean;
  /** Tile opacity multiplier (default 1). Lower for translucent creatures. */
  fillAlpha?: number;
  /** How much darker the glyph is than its tile (0..1, default 0.55). */
  fillDarken?: number;
  /** 0..1 — blend toward `fogColor` (distance haze). */
  fog?: number;
  fogColor?: number;
  /** Mirror across the body axis (fish facing left still look upright). */
  flipV?: boolean;
  /** Bounding box half-size as a multiple of max(length, width). Default 0.6. */
  extent?: number;
}

const SOFT_TOP = code("'");
const SOFT_BOTTOM = code('.');
const SOFT_HEAVY = code(':');
const SOFT_SIDE = code('·');

const OFFSETS = [
  [0, 0],
  [-0.28, -0.28],
  [0.28, -0.28],
  [-0.28, 0.28],
  [0.28, 0.28],
];

/**
 * Draws an anti-aliased creature body. Each cell is sampled at five points in
 * body space: well-covered cells become solid textured glyphs, partly covered
 * cells become soft edge glyphs. Texture glyphs are picked by a hash of the
 * body-space cell, so the pattern travels with the creature instead of crawling.
 */
export function drawBody(grid: RenderGrid, o: BodyOptions): void {
  const cw = grid.cellWidth;
  const ch = grid.cellHeight;
  const cos = Math.cos(o.heading);
  const sin = Math.sin(o.heading);
  const half = Math.max(o.length, o.width) * (o.extent ?? 0.6);
  const c0 = Math.floor((o.x - half) / cw);
  const c1 = Math.ceil((o.x + half) / cw);
  const r0 = Math.floor((o.y - half) / ch);
  const r1 = Math.ceil((o.y + half) / ch);
  const layer = o.layer ?? Layer.MID;
  const opacity = o.opacity ?? 1;
  const fog = o.fog ?? 0;
  const fogColor = o.fogColor ?? 0;
  const tex = o.texture;
  const flip = o.flipV ? -1 : 1;

  for (let r = r0; r <= r1; r++) {
    if (r < 0 || r >= grid.rows) continue;
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || c >= grid.cols) continue;
      let hits = 0;
      let shadeSum = 0;
      let centreHit = false;
      let topHits = 0;
      for (let k = 0; k < 5; k++) {
        const px = (c + 0.5 + OFFSETS[k][0]) * cw - o.x;
        const py = (r + 0.5 + OFFSETS[k][1]) * ch - o.y;
        const u = (px * cos + py * sin) / o.length;
        const v = ((-px * sin + py * cos) / o.width) * flip;
        const s = o.sampler(u, v);
        if (s > 0) {
          hits++;
          shadeSum += s;
          if (k === 0) centreHit = true;
          if (OFFSETS[k][1] < 0) topHits++;
        }
      }
      if (hits === 0) continue;
      const shade = shadeSum / hits;
      let color = o.lut[Math.min(255, (shade * 255) | 0)];
      if (fog > 0) color = mix(color, fogColor, fog);

      if (hits >= 3 && centreHit) {
        // Body-anchored texture choice: hash of the body-space cell.
        const pxc = (c + 0.5) * cw - o.x;
        const pyc = (r + 0.5) * ch - o.y;
        const bu = Math.round((pxc * cos + pyc * sin) / cw);
        const bv = Math.round((-pxc * sin + pyc * cos) / ch);
        const jitter = hash2(bu * 7 + 3, bv * 13 + 5) - 0.5;
        const ti = Math.max(0, Math.min(tex.length - 1, Math.round(shade * (tex.length - 1) + jitter)));
        if (o.solid) {
          grid.putSolid(c, r, tex[ti], mix(color, 0, o.fillDarken ?? 0.55), opacity, color, opacity * (o.fillAlpha ?? 1), layer);
        } else {
          grid.put(c, r, tex[ti], color, opacity, layer);
        }
      } else {
        const glyph = hits >= 3 ? SOFT_HEAVY : topHits > hits - topHits ? SOFT_BOTTOM : hits === 1 ? SOFT_SIDE : SOFT_TOP;
        grid.put(c, r, glyph, color, opacity * 0.75, layer);
      }
    }
  }
}

/** Draws a line of stroke glyphs (- \ | /) between two pixel points. */
export function drawLine(
  grid: RenderGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
  alpha: number,
  layer: number = Layer.MID,
  tip = 0
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const glyph = strokeFor(Math.atan2(dy, dx));
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx) / grid.cellWidth, Math.abs(dy) / grid.cellHeight) * 2));
  let lastC = -1;
  let lastR = -1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const c = Math.floor((x0 + dx * t) / grid.cellWidth);
    const r = Math.floor((y0 + dy * t) / grid.cellHeight);
    if (c === lastC && r === lastR) continue;
    lastC = c;
    lastR = r;
    grid.put(c, r, s === steps && tip ? tip : glyph, color, alpha, layer);
  }
}

/** Single glyph at a pixel position (eyes, sparkles…). */
export function spot(grid: RenderGrid, x: number, y: number, cp: number, color: number, alpha: number, layer: number): void {
  grid.put(Math.floor(x / grid.cellWidth), Math.floor(y / grid.cellHeight), cp, color, alpha, layer);
}
