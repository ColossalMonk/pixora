import { describe, expect, it } from 'vitest';
import { pickGlyph, type InkRamp } from '../src/engine/image-converter/AsciiQuality';
import { EdgeDetector, SUB_X, SUB_Y, matchShape, tableFromCoverage } from '../src/engine/image-converter/ShapeMatch';
import { inkOnPaper } from '../src/engine/core/Color';

// A small ramp shaped like the real one: fine steps at the light end, big ones at the top.
const ramp: InkRamp = {
  codes: Uint16Array.from(' .:+o#@', (c) => c.charCodeAt(0)),
  ink: Float32Array.from([0, 0.07, 0.14, 0.38, 0.6, 0.745, 1]),
};

/** Glyph indices for a 4×4 block of cells all at tone v (no hysteresis). */
const block = (v: number) => {
  const out = new Set<number>();
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out.add(pickGlyph(ramp, v, c, r, -1));
  return out;
};

describe('pickGlyph (tone → character)', () => {
  it('clamps at the ends', () => {
    expect(pickGlyph(ramp, -0.2, 0, 0, -1)).toBe(0);
    expect(pickGlyph(ramp, 1.4, 0, 0, -1)).toBe(ramp.codes.length - 1);
  });

  it('a flat bright sky settles on one character, never a #@#@ weave', () => {
    for (const v of [0.8, 0.85, 0.87, 0.9, 0.95]) expect(block(v).size).toBe(1);
  });

  it('still blends neighbouring light tones that are close in ink', () => {
    // Halfway between '.' (0.07) and ':' (0.14): both appear across the block.
    expect(block(0.105).size).toBe(2);
  });

  it('keeps the previous glyph when it is nearly as good (no shimmer)', () => {
    const colon = 2;
    expect(pickGlyph(ramp, 0.16, 0, 0, colon)).toBe(colon);
    expect(pickGlyph(ramp, 0.6, 0, 0, colon)).not.toBe(colon);
  });
});

/** 3×5 coverage from a picture: rows of '#' (ink) and '.' (none). */
const cov = (...rows: string[]) => Float32Array.from(rows.join(''), (ch) => (ch === '#' ? 1 : 0));

describe('matchShape (strokes follow contours)', () => {
  const glyphs = [' ', '|', '-', '/', '\\', '[', '#'];
  const shapes = [
    cov('...', '...', '...', '...', '...'),
    cov('.#.', '.#.', '.#.', '.#.', '.#.'),
    cov('...', '...', '###', '...', '...'),
    cov('..#', '..#', '.#.', '#..', '#..'),
    cov('#..', '#..', '.#.', '..#', '..#'),
    cov('##.', '#..', '#..', '#..', '##.'),
    cov('###', '###', '###', '###', '###'),
  ];
  const raw = new Float32Array(glyphs.length * SUB_X * SUB_Y);
  shapes.forEach((s, i) => raw.set(s, i * SUB_X * SUB_Y));
  const table = tableFromCoverage(glyphs.map((g) => g.charCodeAt(0)), raw);
  const pick = (cell: Float32Array) => {
    const mean = cell.reduce((a, b) => a + b, 0) / cell.length;
    return String.fromCharCode(table.codes[matchShape(table, cell, 0, mean, -1)]);
  };

  it('picks the stroke whose layout matches the cell', () => {
    expect(pick(cov('.#.', '.#.', '.#.', '.#.', '.#.'))).toBe('|');
    expect(pick(cov('...', '...', '###', '...', '...'))).toBe('-');
    expect(pick(cov('..#', '..#', '.#.', '#..', '#..'))).toBe('/');
    expect(pick(cov('#..', '#..', '.#.', '..#', '..#'))).toBe('\\');
  });

  it('an off-centre vertical stroke still reads as vertical, not diagonal', () => {
    expect(['|', '[']).toContain(pick(cov('#..', '#..', '#..', '#..', '#..')));
  });
});

describe('EdgeDetector', () => {
  const W = 40;
  const H = 30;

  it('finds a thin outline along a hard edge', () => {
    const lum = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = W / 2; x < W; x++) lum[y * W + x] = 1;
    const ridge = new EdgeDetector().detect(lum, W, H);
    for (let y = 4; y < H - 4; y++) {
      const strong: number[] = [];
      for (let x = 0; x < W; x++) if (ridge[y * W + x] > 0.5) strong.push(x);
      expect(strong.length).toBeGreaterThan(0);
      expect(strong.length).toBeLessThanOrEqual(2);
      for (const x of strong) expect(Math.abs(x - (W / 2 - 0.5))).toBeLessThanOrEqual(1.5);
    }
  });

  it('finds nothing in a flat picture', () => {
    const ridge = new EdgeDetector().detect(new Float32Array(W * H).fill(0.6), W, H);
    expect(Math.max(...ridge)).toBe(0);
  });
});

describe('inkOnPaper (light theme colours)', () => {
  const luma = (c: number) => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;

  it('darkens any colour enough to read on white', () => {
    for (const c of [0xffffff, 0xffeb3b, 0x5eead4, 0x87ceeb, 0xf472b6]) expect(luma(inkOnPaper(c))).toBeLessThanOrEqual(0.36);
  });

  it('keeps the hue', () => {
    const red = inkOnPaper(0xff6060);
    expect((red >> 16) & 255).toBeGreaterThan((red >> 8) & 255);
    const teal = inkOnPaper(0x5eead4);
    expect((teal >> 8) & 255).toBeGreaterThan((teal >> 16) & 255);
  });
});
