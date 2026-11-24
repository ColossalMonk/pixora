/**
 * Packed 24-bit RGB helpers. Colours travel through the engine as plain
 * numbers (0xRRGGBB) so the per-frame path never allocates objects or strings.
 */

export type RGBTuple = [number, number, number];

export const rgb = (r: number, g: number, b: number): number =>
  ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);

export const hex = (h: string): number => parseInt(h.replace('#', ''), 16) & 0xffffff;

export const red = (c: number): number => (c >> 16) & 255;
export const green = (c: number): number => (c >> 8) & 255;
export const blue = (c: number): number => c & 255;

/** Linear blend between two packed colours, t in [0..1]. */
export function mix(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (((ar + (br - ar) * t) | 0) << 16) |
    (((ag + (bg - ag) * t) | 0) << 8) |
    ((ab + (bb - ab) * t) | 0)
  );
}

/** Multiplies brightness, clamped. */
export function scale(c: number, k: number): number {
  const r = Math.min(255, (((c >> 16) & 255) * k) | 0);
  const g = Math.min(255, (((c >> 8) & 255) * k) | 0);
  const b = Math.min(255, ((c & 255) * k) | 0);
  return (r << 16) | (g << 8) | b;
}

/** Perceived luminance in [0..1] (Rec. 601). */
export function luma(c: number): number {
  return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
}

/**
 * A 256-entry gradient lookup table built from colour stops.
 * Fields sample it with `lut[(v * 255) | 0]`.
 */
export function gradientLUT(stops: [number, number][]): Uint32Array {
  const lut = new Uint32Array(256);
  const sorted = [...stops].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < sorted.length - 2 && t > sorted[k + 1][0]) k++;
    const [t0, c0] = sorted[k];
    const [t1, c1] = sorted[Math.min(k + 1, sorted.length - 1)];
    const span = t1 - t0 || 1;
    lut[i] = mix(c0, c1, Math.max(0, Math.min(1, (t - t0) / span)));
  }
  return lut;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Cheap deterministic hash → [0..1). Used to anchor glyph choices to positions. */
export function hash2(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Light theme: ink must read on white. Darkens a colour to at most ~34%
 * luminance, keeping its hue and pushing it a little away from grey.
 */
export function inkOnPaper(c: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const k = y > 0.34 ? 0.34 / y : 1;
  const m = (r + g + b) / 3;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round((m + (v - m) * 1.25) * k)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
