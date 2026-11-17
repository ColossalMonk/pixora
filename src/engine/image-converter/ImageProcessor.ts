/**
 * Image → ASCII conversion.
 *
 * Image processing pipeline:
 *  1. Decode once; downscale with the browser's high-quality resampler to the
 *     sample grid (cells, or 2×4 dots per cell for Braille, 1×2 for Blocks).
 *  2. Auto-levels: stretch luminance between its 2nd and 98th percentiles,
 *     then apply brightness / contrast / gamma.
 *  3. Map to glyphs: a density ramp (Characters), Atkinson-dithered dots
 *     (Braille), or upper-half blocks with separate top/bottom colours (Blocks).
 *  4. Keep every cell's own colour from the photo so the result reads like the
 *     image, not like a monochrome texture.
 */

export type RenderMode = 'characters' | 'braille' | 'blocks' | 'tiles';
export type ColorMode = 'full' | 'mono' | 'matrix' | 'amber' | 'cyberpunk';
export type Charset = 'standard' | 'detailed' | 'dense' | 'shapes';

export interface ConvertOptions {
  cols: number;
  mode: RenderMode;
  color: ColorMode;
  charset: Charset;
  brightness: number; // -0.5 .. 0.5
  contrast: number; // 0.5 .. 2
  gamma: number; // 0.5 .. 2
  invert: boolean;
  edges: boolean;
}

export const DEFAULT_CONVERT: ConvertOptions = {
  cols: 120,
  mode: 'characters',
  color: 'full',
  charset: 'standard',
  brightness: 0,
  contrast: 1.15,
  gamma: 1,
  invert: false,
  edges: false,
};

const CHARSETS: Record<Charset, string> = {
  standard: ' .:-=+*#%@',
  detailed: ' .,:;-~=+*xX#%@',
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  shapes: ' ·∙•○◎●◉█',
};

/** A converted image: per-cell glyph and colour, plus optional cell background (Blocks). */
export interface AsciiResult {
  cols: number;
  rows: number;
  glyphs: string[]; // cols*rows
  fg: Uint32Array; // packed RGB
  bg: Uint32Array | null; // packed RGB for Blocks mode
  text: string;
}

/** Monospace cell aspect (width / height) used to keep proportions. */
export const CELL_ASPECT = 0.5;

export function loadImage(source: File | Blob): Promise<HTMLImageElement> {
  // onload (not img.decode()): decode() never settles in background tabs.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

function sample(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Two-step downscale for very large images gives a cleaner area average.
  if (img.naturalWidth > w * 4) {
    const mid = document.createElement('canvas');
    mid.width = w * 2;
    mid.height = h * 2;
    const m = mid.getContext('2d')!;
    m.imageSmoothingQuality = 'high';
    m.drawImage(img, 0, 0, mid.width, mid.height);
    ctx.drawImage(mid, 0, 0, w, h);
  } else {
    ctx.drawImage(img, 0, 0, w, h);
  }
  return ctx.getImageData(0, 0, w, h).data;
}

/** Luminance 0..1 per pixel with auto-levels + tone controls applied. */
export function tone(data: Uint8ClampedArray, n: number, o: Pick<ConvertOptions, 'brightness' | 'contrast' | 'gamma' | 'invert'>): Float32Array {
  const lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = data[p + 3] / 255;
    const y = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) * a;
    lum[i] = y / 255;
    hist[Math.min(255, y | 0)]++;
  }
  const pct = (q: number) => {
    let acc = 0;
    const target = n * q;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v / 255;
    }
    return 1;
  };
  const lo = pct(0.02);
  const hi = Math.max(lo + 0.05, pct(0.98));
  for (let i = 0; i < n; i++) {
    let v = (lum[i] - lo) / (hi - lo);
    v = (v - 0.5) * o.contrast + 0.5 + o.brightness;
    v = Math.max(0, Math.min(1, v));
    v = Math.pow(v, 1 / o.gamma);
    lum[i] = o.invert ? 1 - v : v;
  }
  return lum;
}

const pack = (r: number, g: number, b: number) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);

/** Colour for a cell, by colour mode. `v` is the toned luminance. */
export function cellColor(r: number, g: number, b: number, v: number, mode: ColorMode): number {
  switch (mode) {
    case 'mono': {
      const k = 90 + v * 165;
      return pack(k, k, k);
    }
    case 'matrix':
      return pack(20 + v * 100, 90 + v * 165, 40 + v * 90);
    case 'amber':
      return pack(120 + v * 135, 60 + v * 130, 10 + v * 40);
    case 'cyberpunk': {
      // Magenta/Cyan blend according to red vs blue bias and luminance
      const isRed = (r - b) > 20;
      if (isRed) {
        return pack(200 + v * 55, 40 + v * 80, 160 + v * 95);
      }
      return pack(20 + v * 60, 160 + v * 95, 210 + v * 45);
    }
    default: {
      // Glyphs cover only part of a cell, so lift colour toward its own brightness.
      const max = Math.max(r, g, b, 1);
      const lift = Math.min(2.2, (110 + v * 145) / max);
      return pack(Math.min(255, r * lift), Math.min(255, g * lift), Math.min(255, b * lift));
    }
  }
}

export function convert(img: HTMLImageElement, o: ConvertOptions): AsciiResult {
  const aspect = img.naturalHeight / img.naturalWidth;
  const cols = Math.max(20, Math.min(400, Math.round(o.cols)));
  const rows = Math.max(8, Math.round(cols * aspect * CELL_ASPECT));
  const n = cols * rows;
  const glyphs: string[] = new Array(n);
  const fg = new Uint32Array(n);
  let bg: Uint32Array | null = null;

  if (o.mode === 'blocks') {
    // Two vertical samples per cell: '▀' coloured with the top, cell background = bottom.
    const w = cols;
    const h = rows * 2;
    const data = sample(img, w, h);
    const lum = tone(data, w * h, o);
    bg = new Uint32Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = (r * 2) * w + c;
        const b = (r * 2 + 1) * w + c;
        const tc = toneColor(data, t, lum[t], o.color);
        const bc = toneColor(data, b, lum[b], o.color);
        const i = r * cols + c;
        glyphs[i] = '▀';
        fg[i] = tc;
        bg[i] = bc;
      }
    }
    return { cols, rows, glyphs, fg, bg, text: toText(glyphs, cols, rows) };
  }

  if (o.mode === 'braille') {
    const w = cols * 2;
    const h = rows * 4;
    const data = sample(img, w, h);
    const lum = tone(data, w * h, o);
    // Atkinson dithering keeps highlights clean and midtones textured.
    const err = Float32Array.from(lum);
    const on = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const old = err[i];
        const nv = old > 0.5 ? 1 : 0;
        on[i] = nv;
        const e = (old - nv) / 8;
        if (x + 1 < w) err[i + 1] += e;
        if (x + 2 < w) err[i + 2] += e;
        if (y + 1 < h) {
          if (x > 0) err[i + w - 1] += e;
          err[i + w] += e;
          if (x + 1 < w) err[i + w + 1] += e;
        }
        if (y + 2 < h) err[i + 2 * w] += e;
      }
    }
    const BIT = [
      [0x01, 0x02, 0x04, 0x40],
      [0x08, 0x10, 0x20, 0x80],
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let bits = 0;
        let sr = 0, sg = 0, sb = 0, sl = 0;
        for (let dx = 0; dx < 2; dx++) {
          for (let dy = 0; dy < 4; dy++) {
            const i = (r * 4 + dy) * w + c * 2 + dx;
            if (on[i]) bits |= BIT[dx][dy];
            sr += data[i * 4];
            sg += data[i * 4 + 1];
            sb += data[i * 4 + 2];
            sl += lum[i];
          }
        }
        const i = r * cols + c;
        glyphs[i] = bits ? String.fromCharCode(0x2800 + bits) : ' ';
        fg[i] = cellColor(sr / 8, sg / 8, sb / 8, Math.max(0.5, sl / 8), o.color);
      }
    }
    return { cols, rows, glyphs, fg, bg, text: toText(glyphs, cols, rows) };
  }

  // Characters
  const data = sample(img, cols, rows);
  const lum = tone(data, n, o);
  const ramp = Array.from(CHARSETS[o.charset]);
  const last = ramp.length - 1;
  let gx: Float32Array | null = null;
  let gy: Float32Array | null = null;
  if (o.edges) {
    gx = new Float32Array(n);
    gy = new Float32Array(n);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        gx[i] = -lum[i - cols - 1] + lum[i - cols + 1] - 2 * lum[i - 1] + 2 * lum[i + 1] - lum[i + cols - 1] + lum[i + cols + 1];
        gy[i] = -lum[i - cols - 1] - 2 * lum[i - cols] - lum[i - cols + 1] + lum[i + cols - 1] + 2 * lum[i + cols] + lum[i + cols + 1];
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const v = lum[i];
    let ch = ramp[Math.round(v * last)];
    if (gx && gy) {
      const mag = Math.hypot(gx[i], gy[i]);
      // Only the strongest contours become strokes, so faces and shapes stay readable.
      if (mag > 1.1 && v > 0.08) {
        const deg = ((Math.atan2(gy[i], gx[i]) * 180) / Math.PI + 180) % 180;
        ch = deg < 22.5 || deg >= 157.5 ? '|' : deg < 67.5 ? '/' : deg < 112.5 ? '-' : '\\';
      }
    }
    glyphs[i] = ch;
    fg[i] = cellColor(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], v, o.color);
  }
  return { cols, rows, glyphs, fg, bg, text: toText(glyphs, cols, rows) };
}

function toneColor(data: Uint8ClampedArray, i: number, v: number, mode: ColorMode): number {
  if (mode === 'full') {
    // Blocks fill the whole half-cell, so use the true colour scaled by the tone change.
    const y = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    const k = y > 0.01 ? Math.min(3, v / y) : 1;
    return pack(Math.min(255, data[i * 4] * k), Math.min(255, data[i * 4 + 1] * k), Math.min(255, data[i * 4 + 2] * k));
  }
  return cellColor(0, 0, 0, v, mode === 'mono' ? 'mono' : mode);
}

function toText(glyphs: string[], cols: number, rows: number): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) lines.push(glyphs.slice(r * cols, (r + 1) * cols).join('').replace(/\s+$/, ''));
  return lines.join('\n');
}

/**
 * Draws a result onto a canvas at the given cell height. Returns the canvas
 * size used. Colours are grouped so fillStyle changes stay low.
 */
export function drawResult(
  canvas: HTMLCanvasElement,
  res: AsciiResult,
  cellH: number,
  background: string,
  dpr = Math.min(2, window.devicePixelRatio || 1)
): { width: number; height: number } {
  const cellW = cellH * CELL_ASPECT;
  const width = Math.ceil(res.cols * cellW);
  const height = Math.ceil(res.rows * cellH);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

  if (res.bg) {
    for (let i = 0; i < res.bg.length; i++) {
      ctx.fillStyle = hex(res.bg[i]);
      const c = i % res.cols;
      const r = (i / res.cols) | 0;
      ctx.fillRect(c * cellW, r * cellH + cellH / 2, cellW + 0.4, cellH / 2 + 0.4);
      ctx.fillStyle = hex(res.fg[i]);
      ctx.fillRect(c * cellW, r * cellH, cellW + 0.4, cellH / 2 + 0.4);
    }
    return { width, height };
  }

  // Braille → dots; other glyphs → text. Group by colour.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < res.glyphs.length; i++) {
    if (res.glyphs[i] === ' ') continue;
    // 5 bits per channel keeps groups few without visible banding.
    const key = res.fg[i] & 0xf8f8f8;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(i);
  }
  ctx.font = `${cellH * 0.92}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dot = Math.max(0.6, cellW * 0.32);
  for (const [key, cells] of groups) {
    ctx.fillStyle = hex(key | 0x040404);
    for (const i of cells) {
      const c = i % res.cols;
      const r = (i / res.cols) | 0;
      const g = res.glyphs[i];
      const code = g.charCodeAt(0);
      if (code >= 0x2800 && code <= 0x28ff) {
        const bits = code - 0x2800;
        const x0 = c * cellW;
        const y0 = r * cellH;
        for (let k = 0; k < 8; k++) {
          const bit = [0x01, 0x02, 0x04, 0x40, 0x08, 0x10, 0x20, 0x80][k];
          if (!(bits & bit)) continue;
          const dx = k < 4 ? 0 : 1;
          const dy = k % 4;
          ctx.fillRect(x0 + (dx + 0.5) * (cellW / 2) - dot / 2, y0 + (dy + 0.5) * (cellH / 4) - dot / 2, dot, dot);
        }
      } else {
        ctx.fillText(g, c * cellW + cellW / 2, r * cellH + cellH / 2);
      }
    }
  }
  return { width, height };
}
