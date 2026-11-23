/**
 * Higher-quality image → cell sampling and glyph choice for the custom slots.
 *
 * Techniques studied in asciify-engine (MIT) and asciify.org, reimplemented here:
 *  - linear-light supersampling: average each cell's pixels in linear light,
 *    so fine highlights and edges don't turn muddy (plain downscaling averages
 *    gamma-encoded values and darkens them);
 *  - a ramp ordered by each glyph's *measured* ink in our own font, so tones
 *    step evenly whatever the font;
 *  - a 4×4 Bayer blend between the two nearest glyphs for smooth gradients;
 *  - hysteresis, so a cell keeps its glyph unless another is clearly better
 *    (kills shimmer on video and on the slow ambient drift).
 */

// ── sRGB ↔ linear tables ─────────────────────────────────────────────

const TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const FROM_LINEAR_STEPS = 4096;
const FROM_LINEAR = new Uint8ClampedArray(FROM_LINEAR_STEPS + 1);
for (let i = 0; i <= FROM_LINEAR_STEPS; i++) {
  const l = i / FROM_LINEAR_STEPS;
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  FROM_LINEAR[i] = Math.round(c * 255);
}

/**
 * Draws `source` (cropped to sx,sy,sw,sh) at w×h samples, averaging `ss`×`ss`
 * supersamples per output pixel in linear light. Returns RGBA like getImageData.
 * `scratch` is a reusable canvas.
 */
export function sampleLinear(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  w: number,
  h: number,
  ss: number,
  scratch: HTMLCanvasElement,
): Uint8ClampedArray {
  // Keep the supersampled buffer to a sane size (~3 MP).
  while (ss > 1 && w * ss * h * ss > 3_000_000) ss--;
  const W = w * ss;
  const H = h * ss;
  if (scratch.width !== W || scratch.height !== H) {
    scratch.width = W;
    scratch.height = H;
  }
  const g = scratch.getContext('2d', { willReadFrequently: true });
  if (!g) return new Uint8ClampedArray(w * h * 4);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, W, H);
  g.drawImage(source, sx, sy, sw, sh, 0, 0, W, H);
  const src = g.getImageData(0, 0, W, H).data;
  if (ss === 1) return src;

  const out = new Uint8ClampedArray(w * h * 4);
  const inv = 1 / (ss * ss);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, gg = 0, b = 0, a = 0;
      for (let dy = 0; dy < ss; dy++) {
        let p = ((y * ss + dy) * W + x * ss) * 4;
        for (let dx = 0; dx < ss; dx++, p += 4) {
          r += TO_LINEAR[src[p]];
          gg += TO_LINEAR[src[p + 1]];
          b += TO_LINEAR[src[p + 2]];
          a += src[p + 3];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = FROM_LINEAR[Math.round(r * inv * FROM_LINEAR_STEPS)];
      out[o + 1] = FROM_LINEAR[Math.round(gg * inv * FROM_LINEAR_STEPS)];
      out[o + 2] = FROM_LINEAR[Math.round(b * inv * FROM_LINEAR_STEPS)];
      out[o + 3] = a * inv;
    }
  }
  return out;
}

// ── measured-ink ramp ────────────────────────────────────────────────

/**
 * Candidate glyphs for flat areas; the measured ramp keeps the ones that spread
 * tones evenly. No directional strokes (| / \ < >): in flat areas they read as
 * stripes, and contours get their strokes from shape matching (ShapeMatch.ts).
 * No letters either: they make a picture read like text.
 */
// Symbols only: letters and digits ($ 0 8 & %) read as text in flat areas.
const CANDIDATES = " .`',:;=+*xo#@";

export interface InkRamp {
  codes: Uint16Array; // glyph code points, lightest → darkest
  ink: Float32Array; // normalised ink 0..1, increasing
}

const rampCache = new Map<string, InkRamp>();

/**
 * Measures each candidate's ink coverage in `font` (e.g. `600 14px "JetBrains Mono"`)
 * and returns about `steps` glyphs whose ink is evenly spaced from 0 to 1.
 */
export function measuredRamp(font: string, steps = 20): InkRamp {
  const key = `${font}|${steps}`;
  const hit = rampCache.get(key);
  if (hit) return hit;

  const S = 32;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  const glyphs = Array.from(new Set(CANDIDATES));
  const measured: { code: number; ink: number }[] = [];
  if (g) {
    g.font = font.replace(/\d+(\.\d+)?px/, `${S * 0.8}px`);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const ch of glyphs) {
      g.clearRect(0, 0, S, S);
      g.fillStyle = '#fff';
      g.fillText(ch, S / 2, S / 2);
      const d = g.getImageData(0, 0, S, S).data;
      let ink = 0;
      for (let i = 3; i < d.length; i += 4) ink += d[i];
      measured.push({ code: ch.codePointAt(0)!, ink });
    }
  }
  measured.sort((a, b) => a.ink - b.ink);
  const max = measured.length ? measured[measured.length - 1].ink || 1 : 1;

  // Pick the glyph nearest each evenly spaced ink target (no repeats).
  const picked: { code: number; ink: number }[] = [];
  for (let s = 0; s < steps; s++) {
    const target = (s / (steps - 1)) * max;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < measured.length; i++) {
      const d = Math.abs(measured[i].ink - target);
      if (d < bestD && !picked.includes(measured[i])) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) picked.push(measured[best]);
  }
  picked.sort((a, b) => a.ink - b.ink);
  const ramp: InkRamp = {
    codes: Uint16Array.from(picked.map((p) => p.code)),
    ink: Float32Array.from(picked.map((p) => p.ink / max)),
  };
  if (ramp.codes.length < 2) {
    ramp.codes = Uint16Array.from(Array.from(' .:-=+*#%@').map((ch) => ch.charCodeAt(0)));
    ramp.ink = Float32Array.from(ramp.codes, (_, i) => i / (ramp.codes.length - 1));
  }
  // Don't cache a measurement taken with a fallback font before the web font loaded.
  if (typeof document === 'undefined' || !document.fonts || document.fonts.check(font)) rampCache.set(key, ramp);
  return ramp;
}

// ── glyph choice: Bayer blend + hysteresis ───────────────────────────

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * Index into `ramp` for tone `v` at cell (c, r): blends the two glyphs around
 * `v` with an ordered (Bayer 4×4) pattern, then keeps `prev` if it is within
 * `margin` of the tone (so cells don't flicker between near-equal glyphs).
 */
export function pickGlyph(ramp: InkRamp, v: number, c: number, r: number, prev: number, margin = 0.035): number {
  const ink = ramp.ink;
  const last = ink.length - 1;
  if (v <= 0) return 0;
  if (v >= 1) return last;
  // Binary search for the pair around v.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ink[mid] <= v) lo = mid;
    else hi = mid;
  }
  // Dither only near the midpoint between two glyphs; elsewhere snap to the
  // nearer one, so flat areas settle on one character instead of a pattern.
  // Glyphs far apart in ink (o → # → @) never dither: mixing them reads as a
  // woven pattern rather than a shade.
  const gap = ink[hi] - ink[lo];
  const t = (v - ink[lo]) / Math.max(1e-6, gap);
  const f = gap > 0.1 ? (t >= 0.5 ? 1 : 0) : Math.min(1, Math.max(0, (t - 0.5) * 3.5 + 0.5));
  const pick = f > BAYER4[(r & 3) * 4 + (c & 3)] ? hi : lo;
  if (prev >= 0 && prev <= last && prev !== pick && Math.abs(ink[prev] - v) <= Math.abs(ink[pick] - v) + margin) {
    return prev;
  }
  return pick;
}

/** Cheap stable per-cell hash in [0, 1). */
export function cellHash(c: number, r: number): number {
  let h = (c * 374761393 + r * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
