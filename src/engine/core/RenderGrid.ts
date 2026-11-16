/**
 * Logical character grid. Every cell is stored in flat typed arrays so a
 * frame never allocates. Writes are depth-tested against a per-cell layer,
 * which lets worlds draw back-to-front or front-to-back without caring about
 * order: a far fish can never overwrite a near jellyfish.
 */

export const Layer = {
  SKY: 0,
  FAR: 1,
  MID: 2,
  NEAR: 3,
  FRONT: 4,
  FX: 5,
} as const;

const charCodeCache = new Map<string, number>();
export function code(ch: string): number {
  let c = charCodeCache.get(ch);
  if (c === undefined) {
    c = ch.codePointAt(0) ?? 32;
    charCodeCache.set(ch, c);
  }
  return c;
}

export class RenderGrid {
  public cols = 1;
  public rows = 1;
  /** Cell size in CSS pixels. */
  public cellWidth = 8;
  public cellHeight = 16;
  /** cellWidth / cellHeight — multiply a vertical cell distance by 1/aspect to get "square" units. */
  public aspect = 0.5;

  /** Unicode code point per cell; 0 means empty. */
  public glyph = new Uint32Array(1);
  /** Packed 0xRRGGBB glyph colour. */
  public fg = new Uint32Array(1);
  /** Glyph opacity 0..1. */
  public alpha = new Float32Array(1);
  /** Packed cell background fill (used by solid creature bodies). */
  public bg = new Uint32Array(1);
  public bgAlpha = new Float32Array(1);
  /** Depth of whatever currently occupies the cell. */
  public layer = new Uint8Array(1);
  /** Per-cell opacity multiplier for the calm zone behind the UI (1 = untouched). */
  public focus = new Float32Array(1);

  public resize(cols: number, rows: number, cellWidth: number, cellHeight: number): void {
    this.cols = Math.max(1, cols | 0);
    this.rows = Math.max(1, rows | 0);
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.aspect = cellWidth / cellHeight;
    const n = this.cols * this.rows;
    this.glyph = new Uint32Array(n);
    this.fg = new Uint32Array(n);
    this.alpha = new Float32Array(n);
    this.bg = new Uint32Array(n);
    this.bgAlpha = new Float32Array(n);
    this.layer = new Uint8Array(n);
    this.focus = new Float32Array(n).fill(1);
  }

  public get size(): number {
    return this.cols * this.rows;
  }

  public clear(): void {
    this.glyph.fill(0);
    this.alpha.fill(0);
    this.bgAlpha.fill(0);
    this.layer.fill(0);
  }

  /** Writes a glyph if `layer` is at least as deep-front as what's there. */
  public put(col: number, row: number, cp: number, color: number, a: number, layer: number = Layer.MID): void {
    col |= 0;
    row |= 0;
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows || a <= 0.01) return;
    const i = row * this.cols + col;
    if (layer < this.layer[i]) return;
    this.layer[i] = layer;
    this.glyph[i] = cp;
    this.fg[i] = color;
    this.alpha[i] = a > 1 ? 1 : a;
  }

  public putChar(col: number, row: number, ch: string, color: number, a: number, layer: number = Layer.MID): void {
    this.put(col, row, code(ch), color, a, layer);
  }

  /** Solid cell: background fill plus glyph. */
  public putSolid(
    col: number,
    row: number,
    cp: number,
    color: number,
    a: number,
    fill: number,
    fillA: number,
    layer: number = Layer.MID
  ): void {
    col |= 0;
    row |= 0;
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = row * this.cols + col;
    if (layer < this.layer[i]) return;
    this.layer[i] = layer;
    this.glyph[i] = cp;
    this.fg[i] = color;
    this.alpha[i] = a > 1 ? 1 : a;
    this.bg[i] = fill;
    this.bgAlpha[i] = fillA;
  }

  /** Background fill only; any glyph already in the cell stays. */
  public putBg(col: number, row: number, fill: number, fillA: number, layer: number = Layer.MID): void {
    col |= 0;
    row |= 0;
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = row * this.cols + col;
    if (layer < this.layer[i]) return;
    this.bg[i] = fill;
    this.bgAlpha[i] = fillA;
  }

  /** Writes a horizontal string starting at col. */
  public text(col: number, row: number, str: string, color: number, a: number, layer: number = Layer.MID): void {
    let c = col | 0;
    for (const ch of str) {
      if (ch !== ' ') this.put(c, row, code(ch), color, a, layer);
      c++;
    }
  }

  /** Cell coordinates from CSS pixels. */
  public colAt(px: number): number {
    return Math.floor(px / this.cellWidth);
  }
  public rowAt(py: number): number {
    return Math.floor(py / this.cellHeight);
  }

  /**
   * Builds the calm-zone mask: cells under the given rect fade toward
   * `strength` with a soft elliptical falloff, so the clock and search stay readable.
   */
  public setFocusRect(rect: { x: number; y: number; w: number; h: number } | null, strength: number): void {
    this.focus.fill(1);
    if (!rect || strength <= 0) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const rx = rect.w / 2 + 60;
    const ry = rect.h / 2 + 50;
    const floor = 1 - strength;
    for (let r = 0; r < this.rows; r++) {
      const py = (r + 0.5) * this.cellHeight;
      const dy = (py - cy) / ry;
      for (let c = 0; c < this.cols; c++) {
        const px = (c + 0.5) * this.cellWidth;
        const dx = (px - cx) / rx;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.35) {
          const t = d <= 0.75 ? 0 : (d - 0.75) / 0.6;
          const s = t * t * (3 - 2 * t);
          this.focus[r * this.cols + c] = floor + (1 - floor) * s;
        }
      }
    }
  }
}
