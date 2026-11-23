/**
 * Shape-matched glyphs and structure-tensor edges for the custom slots.
 *
 * - Shape matching (technique studied in asciify-engine, MIT): every cell is
 *   read as 3×5 sub-cells and compared with each glyph's measured 3×5 ink
 *   coverage in our own font, so contours become real strokes (/ \ | _ ( )…)
 *   instead of shading.
 * - Edges (idea studied in ascii-magic, no code used): a structure tensor finds
 *   coherent contours, thinned to one sample by non-maximum suppression, which
 *   can be inked in to give an outline/sketch look.
 */

/** Sub-cells per character cell, horizontally and vertically. */
export const SUB_X = 3;
export const SUB_Y = 5;
const SUBS = SUB_X * SUB_Y;

export interface ShapeTable {
  /** Glyph code points, sorted by mean ink (lightest first). */
  codes: Uint16Array;
  /** Mean ink per glyph, normalised so the densest is 1. */
  ink: Float32Array;
  /** Softened ink per sub-cell with the glyph's mean removed, SUBS floats per glyph. */
  cov: Float32Array;
  /** Length of each glyph's `cov` vector (for correlation). */
  norm: Float32Array;
}

const shapeCache = new Map<string, ShapeTable>();

/**
 * Glyphs shape matching may choose: strokes, corners and blobs. Most letters
 * and digits are left out on purpose; they make a picture read like text.
 */
const STROKE_GLYPHS = " .,'`-_~^:;!|/\\()[]{}<>=+*\"vxo#@";

/** Light blur inside a 3×5 block, so a stroke one sub-cell off still matches. */
function soften(src: Float32Array, so: number, dst: Float32Array, d0: number): void {
  for (let y = 0; y < SUB_Y; y++) {
    for (let x = 0; x < SUB_X; x++) {
      let acc = src[so + y * SUB_X + x] * 4;
      let w = 4;
      if (x > 0) {
        acc += src[so + y * SUB_X + x - 1];
        w++;
      }
      if (x < SUB_X - 1) {
        acc += src[so + y * SUB_X + x + 1];
        w++;
      }
      if (y > 0) {
        acc += src[so + (y - 1) * SUB_X + x];
        w++;
      }
      if (y < SUB_Y - 1) {
        acc += src[so + (y + 1) * SUB_X + x];
        w++;
      }
      dst[d0 + y * SUB_X + x] = acc / w;
    }
  }
}

/**
 * Measures every printable ASCII glyph in `fontFamily` at the real cell shape
 * (cellW × cellH, drawn centred like the rasterizer) as 3×5 ink coverage.
 */
export function shapeTable(fontFamily: string, fontPx: number, cellW: number, cellH: number): ShapeTable {
  const key = `${fontFamily}|${fontPx}|${cellW.toFixed(2)}|${cellH.toFixed(2)}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;

  // Measure large so each sub-cell covers plenty of pixels.
  const k = Math.max(2, Math.round(48 / Math.max(1, cellW)));
  const W = Math.max(SUB_X, Math.round(cellW * k));
  const H = Math.max(SUB_Y, Math.round(cellH * k));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const glyphs: number[] = Array.from(STROKE_GLYPHS, (ch) => ch.charCodeAt(0));
  const raw = new Float32Array(glyphs.length * SUBS);
  const mean = new Float32Array(glyphs.length);
  if (g) {
    g.font = `600 ${fontPx * k}px ${fontFamily}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    glyphs.forEach((cp, gi) => {
      g.clearRect(0, 0, W, H);
      g.fillText(String.fromCharCode(cp), W / 2, H / 2);
      const d = g.getImageData(0, 0, W, H).data;
      let total = 0;
      for (let sy = 0; sy < SUB_Y; sy++) {
        const y0 = Math.floor((sy * H) / SUB_Y);
        const y1 = Math.floor(((sy + 1) * H) / SUB_Y);
        for (let sx = 0; sx < SUB_X; sx++) {
          const x0 = Math.floor((sx * W) / SUB_X);
          const x1 = Math.floor(((sx + 1) * W) / SUB_X);
          let a = 0;
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a += d[(y * W + x) * 4 + 3];
          const v = a / (255 * Math.max(1, (x1 - x0) * (y1 - y0)));
          raw[gi * SUBS + sy * SUB_X + sx] = v;
          total += v;
        }
      }
      mean[gi] = total / SUBS;
    });
  }

  const order = glyphs.map((_, i) => i).sort((a, b) => mean[a] - mean[b]);
  const max = Math.max(1e-6, mean[order[order.length - 1]]);
  const table: ShapeTable = {
    codes: Uint16Array.from(order.map((i) => glyphs[i])),
    ink: Float32Array.from(order.map((i) => mean[i] / max)),
    cov: new Float32Array(order.length * SUBS),
    norm: new Float32Array(order.length),
  };
  const tmp = new Float32Array(SUBS);
  order.forEach((gi, j) => {
    // Store each glyph's softened coverage with its mean removed, plus its norm,
    // so matching is a correlation: *where* the ink is, not how much of it.
    for (let s = 0; s < SUBS; s++) tmp[s] = raw[gi * SUBS + s];
    const base = j * SUBS;
    soften(tmp, 0, table.cov, base);
    let m = 0;
    for (let s = 0; s < SUBS; s++) m += table.cov[base + s];
    m /= SUBS;
    let sq = 0;
    for (let s = 0; s < SUBS; s++) {
      const v = table.cov[base + s] - m;
      table.cov[base + s] = v;
      sq += v * v;
    }
    table.norm[j] = Math.sqrt(sq);
  });
  // Don't cache a measurement taken with a fallback font before the web font loaded.
  if (!document.fonts || document.fonts.check(`600 ${fontPx}px ${fontFamily}`)) shapeCache.set(key, table);
  return table;
}

const target = new Float32Array(SUBS);
/** Balance between matching brightness and matching shape (1 − correlation). */
const TONE_WEIGHT = 2;
const SHAPE_WEIGHT = 0.6;
/** Only glyphs whose ink is this close to the cell's are considered. */
const TONE_RANGE = 0.35;

/**
 * Best glyph (index into `table`) for a cell whose 3×5 sub-cell inks are
 * `sub[off .. off+15)` with mean `mean`. Score = tone error + (1 − correlation
 * between the cell's and the glyph's ink layout), among glyphs near the tone.
 * Keeps `prev` unless the new best is clearly better.
 */
export function matchShape(table: ShapeTable, sub: Float32Array, off: number, mean: number, prev: number): number {
  soften(sub, off, target, 0);
  let tMean = 0;
  for (let s = 0; s < SUBS; s++) tMean += target[s];
  tMean /= SUBS;
  let tSq = 0;
  for (let s = 0; s < SUBS; s++) {
    target[s] -= tMean;
    tSq += target[s] * target[s];
  }
  const tNorm = Math.sqrt(tSq) + 1e-6;
  const ink = table.ink;
  const cov = table.cov;
  const norm = table.norm;
  const n = ink.length;
  // Search glyphs whose ink is within TONE_RANGE of the cell's (the table is
  // sorted by ink, so that's one contiguous run); skip the space, which has no shape.
  let from = 1;
  while (from < n - 1 && ink[from] < mean - TONE_RANGE) from++;
  let to = from;
  while (to < n - 1 && ink[to + 1] <= mean + TONE_RANGE) to++;
  const score = (j: number) => {
    const t = ink[j] - mean;
    let e = TONE_WEIGHT * t * t;
    const base = j * SUBS;
    let dot = 0;
    for (let s = 0; s < SUBS; s++) dot += cov[base + s] * target[s];
    const corr = dot / (norm[j] * tNorm + 1e-6);
    return e + SHAPE_WEIGHT * (1 - corr);
  };
  let best = from;
  let bestE = Infinity;
  for (let j = from; j <= to; j++) {
    const e = score(j);
    if (e < bestE) {
      bestE = e;
      best = j;
    }
  }
  if (prev >= 0 && prev < n && prev !== best && score(prev) <= bestE * 1.12 + 0.002) return prev;
  return best;
}

// ── structure-tensor edges ───────────────────────────────────────────

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Separable [1,4,6,4,1]/16 blur in place, clamped at the borders. */
function blur5(src: Float32Array, tmp: Float32Array, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = src[row + Math.max(0, x - 2)];
      const b = src[row + Math.max(0, x - 1)];
      const c = src[row + x];
      const d = src[row + Math.min(w - 1, x + 1)];
      const e = src[row + Math.min(w - 1, x + 2)];
      tmp[row + x] = (a + 4 * b + 6 * c + 4 * d + e) / 16;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 2) * w;
    const y1 = Math.max(0, y - 1) * w;
    const y3 = Math.min(h - 1, y + 1) * w;
    const y4 = Math.min(h - 1, y + 2) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      src[row + x] = (tmp[y0 + x] + 4 * tmp[y1 + x] + 6 * tmp[row + x] + 4 * tmp[y3 + x] + tmp[y4 + x]) / 16;
    }
  }
}

const OX = [1, 1, 0, -1];
const OY = [0, 1, 1, 1];

export class EdgeDetector {
  private jxx = new Float32Array(0);
  private jyy = new Float32Array(0);
  private jxy = new Float32Array(0);
  private tmp = new Float32Array(0);
  private mag = new Float32Array(0);
  private dir = new Uint8Array(0);
  /** Ridge strength 0..1 per sample, valid after detect(). */
  public ridge = new Float32Array(0);

  /**
   * Sobel gradients → structure tensor blurred twice → strength √λ1 gated by
   * coherence → threshold at mean + 1.1σ → non-maximum suppression across the
   * edge, so contours come out one sample thin.
   */
  public detect(lum: Float32Array, w: number, h: number): Float32Array {
    const n = w * h;
    if (this.jxx.length !== n) {
      this.jxx = new Float32Array(n);
      this.jyy = new Float32Array(n);
      this.jxy = new Float32Array(n);
      this.tmp = new Float32Array(n);
      this.mag = new Float32Array(n);
      this.dir = new Uint8Array(n);
      this.ridge = new Float32Array(n);
    }
    const { jxx, jyy, jxy, mag, dir, ridge } = this;
    for (let y = 0; y < h; y++) {
      const ym = Math.max(0, y - 1) * w;
      const y0 = y * w;
      const yp = Math.min(h - 1, y + 1) * w;
      for (let x = 0; x < w; x++) {
        const xm = Math.max(0, x - 1);
        const xp = Math.min(w - 1, x + 1);
        const gx = lum[ym + xp] + 2 * lum[y0 + xp] + lum[yp + xp] - lum[ym + xm] - 2 * lum[y0 + xm] - lum[yp + xm];
        const gy = lum[yp + xm] + 2 * lum[yp + x] + lum[yp + xp] - lum[ym + xm] - 2 * lum[ym + x] - lum[ym + xp];
        const i = y0 + x;
        jxx[i] = gx * gx;
        jyy[i] = gy * gy;
        jxy[i] = gx * gy;
      }
    }
    blur5(jxx, this.tmp, w, h);
    blur5(jyy, this.tmp, w, h);
    blur5(jxy, this.tmp, w, h);

    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < n; i++) {
      const a = jxx[i];
      const b = jyy[i];
      const trace = a + b;
      if (trace < 1e-4) {
        // Flat: no edge here.
        mag[i] = 0;
        dir[i] = 0;
        continue;
      }
      const c = jxy[i];
      const u = a - b;
      const v = 2 * c;
      const root = 0.5 * Math.sqrt(u * u + v * v);
      const coherence = (2 * root) / trace;
      const m = coherence <= 0.2 ? 0 : Math.sqrt(trace / 2 + root) * smoothstep(0.2, 0.55, coherence);
      mag[i] = m;
      sum += m;
      sum2 += m * m;
      // Gradient direction quantised to 4 (0 →, 1 ↘, 2 ↓, 3 ↙) from the doubled
      // angle (u, v) without atan2: the dominant axis and its sign pick the bin.
      dir[i] = Math.abs(u) >= Math.abs(v) ? (u >= 0 ? 0 : 2) : v >= 0 ? 1 : 3;
    }
    const meanM = sum / n;
    const sd = Math.sqrt(Math.max(0, sum2 / n - meanM * meanM));
    const thr = Math.max(1e-3, meanM + 1.1 * sd);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const m = mag[i];
        if (m < thr * 0.8) {
          ridge[i] = 0;
          continue;
        }
        const q = dir[i];
        const ax = Math.min(w - 1, Math.max(0, x + OX[q]));
        const ay = Math.min(h - 1, Math.max(0, y + OY[q]));
        const bx = Math.min(w - 1, Math.max(0, x - OX[q]));
        const by = Math.min(h - 1, Math.max(0, y - OY[q]));
        ridge[i] = m >= mag[ay * w + ax] && m >= mag[by * w + bx] ? smoothstep(thr * 0.8, thr * 1.8, m) : 0;
      }
    }
    return ridge;
  }
}
