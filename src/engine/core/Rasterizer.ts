import { RenderGrid } from './RenderGrid';
import { luma } from './Color';

/**
 * Draws a RenderGrid to a 2D canvas with as few state changes as possible.
 *
 * Every visible cell gets a 15-bit key: 3 bits of opacity + 12 bits of colour
 * (4 bits per channel). Cells are counting-sorted by key, so each frame sets
 * `globalAlpha` at most 8 times and `fillStyle` once per distinct colour,
 * instead of once per cell. The backdrop is a CSS gradient behind a
 * transparent canvas, so the compositor paints it for free.
 */
const KEY_SPACE = 8 * 4096;

export class Rasterizer {
  private keys = new Uint16Array(0);
  private order = new Uint32Array(0);
  private counts = new Uint32Array(KEY_SPACE);
  private starts = new Uint32Array(KEY_SPACE);
  private used: number[] = [];
  private colorStrings: string[] = new Array(4096);
  private glyphStrings: string[] = [];

  constructor() {
    for (let q = 0; q < 4096; q++) {
      const r = ((q >> 8) & 15) * 17;
      const g = ((q >> 4) & 15) * 17;
      const b = (q & 15) * 17;
      this.colorStrings[q] = `rgb(${r},${g},${b})`;
    }
  }

  private glyphString(cp: number): string {
    let s = this.glyphStrings[cp];
    if (s === undefined) {
      s = String.fromCodePoint(cp);
      this.glyphStrings[cp] = s;
    }
    return s;
  }

  /** CSS for the backdrop (gradient + vignette). The live canvas is transparent and sits on it. */
  public backdropCss = '';
  private backdropStops: number[] = [];

  public prepareBackdrop(_width: number, _height: number, _dpr: number, stops: number[]): void {
    this.backdropStops = stops;
    const n = Math.max(1, stops.length - 1);
    const linear = stops.map((c, i) => `${hexCss(c)} ${((i / n) * 100).toFixed(0)}%`).join(', ');
    this.backdropCss = `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.45) 100%), linear-gradient(to bottom, ${linear})`;
  }

  /** Paints the backdrop into the canvas itself (gallery snapshots, which are opaque). */
  private paintBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const stops = this.backdropStops;
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    const n = Math.max(1, stops.length - 1);
    stops.forEach((c, i) => grad.addColorStop(i / n, hexCss(c)));
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  public draw(
    ctx: CanvasRenderingContext2D,
    grid: RenderGrid,
    width: number,
    height: number,
    font: string,
    themeLut: Uint32Array | null,
    opaque = false
  ): void {
    if (opaque) this.paintBackdrop(ctx, width, height);
    else ctx.clearRect(0, 0, width, height);

    const n = grid.size;
    if (this.keys.length !== n) {
      this.keys = new Uint16Array(n);
      this.order = new Uint32Array(n);
    }
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const cols = grid.cols;

    // Pass 1 — solid tiles, inset by a hairline so the cell grid reads (ascii-animals look).
    const gap = Math.min(1, cw * 0.06);
    this.sortCells(grid.bg, grid.bgAlpha, grid.focus, null, themeLut, n);
    this.flush(ctx, (i) => {
      const c = i % cols;
      const r = (i / cols) | 0;
      ctx.fillRect(c * cw + gap, r * ch + gap, cw - gap * 2, ch - gap * 2);
    });

    // Pass 2 — glyphs. Braille is drawn as dot rectangles; everything else with fillText.
    const glyph = grid.glyph;
    this.sortCells(grid.fg, grid.alpha, grid.focus, glyph, themeLut, n);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const halfW = cw / 2;
    const halfH = ch / 2;
    const dot = Math.max(1, Math.min(cw / 2, ch / 4) * 0.62);
    const stepX = cw / 2;
    const stepY = ch / 4;
    const offX = stepX / 2 - dot / 2;
    const offY = stepY / 2 - dot / 2;
    this.flush(
      ctx,
      (i) => {
        const cp = glyph[i];
        const c = i % cols;
        const r = (i / cols) | 0;
        if (cp >= 0x2800 && cp <= 0x28ff) {
          const bits = cp - 0x2800;
          const x = c * cw + offX;
          const y = r * ch + offY;
          if (bits & 0x01) ctx.fillRect(x, y, dot, dot);
          if (bits & 0x02) ctx.fillRect(x, y + stepY, dot, dot);
          if (bits & 0x04) ctx.fillRect(x, y + stepY * 2, dot, dot);
          if (bits & 0x40) ctx.fillRect(x, y + stepY * 3, dot, dot);
          if (bits & 0x08) ctx.fillRect(x + stepX, y, dot, dot);
          if (bits & 0x10) ctx.fillRect(x + stepX, y + stepY, dot, dot);
          if (bits & 0x20) ctx.fillRect(x + stepX, y + stepY * 2, dot, dot);
          if (bits & 0x80) ctx.fillRect(x + stepX, y + stepY * 3, dot, dot);
          return;
        }
        ctx.fillText(this.glyphString(cp), c * cw + halfW, r * ch + halfH);
      }
    );
    ctx.globalAlpha = 1;
  }

  private sortCells(
    color: Uint32Array,
    alpha: Float32Array,
    focus: Float32Array,
    glyph: Uint32Array | null,
    themeLut: Uint32Array | null,
    n: number
  ): void {
    const keys = this.keys;
    const counts = this.counts;
    const used = this.used;
    for (let k = 0; k < used.length; k++) counts[used[k]] = 0;
    used.length = 0;

    for (let i = 0; i < n; i++) {
      const a = alpha[i] * focus[i];
      if (a < 0.04 || (glyph !== null && glyph[i] === 0)) {
        keys[i] = 0xffff;
        continue;
      }
      let c = color[i];
      if (themeLut !== null) c = themeLut[(luma(c) * 255) | 0];
      const lvl = a >= 1 ? 7 : (a * 8) | 0;
      const key = (lvl << 12) | ((c >> 12) & 0xf00) | ((c >> 8) & 0xf0) | ((c >> 4) & 0xf);
      keys[i] = key;
      if (counts[key]++ === 0) used.push(key);
    }

    used.sort((x, y) => x - y);
    let acc = 0;
    for (let k = 0; k < used.length; k++) {
      const key = used[k];
      this.starts[key] = acc;
      acc += counts[key];
    }
    // Scatter cell indices into sorted order (starts advance as we fill).
    const cursor = this.starts;
    const order = this.order;
    for (let i = 0; i < n; i++) {
      const key = keys[i];
      if (key === 0xffff) continue;
      order[cursor[key]++] = i;
    }
    // Restore starts for the flush pass.
    acc = 0;
    for (let k = 0; k < used.length; k++) {
      const key = used[k];
      cursor[key] = acc;
      acc += counts[key];
    }
  }

  private flush(ctx: CanvasRenderingContext2D, drawCell: (i: number) => void, onKey?: (key: number) => void): void {
    const used = this.used;
    const order = this.order;
    let lastLvl = -1;
    for (let k = 0; k < used.length; k++) {
      const key = used[k];
      const lvl = key >> 12;
      if (lvl !== lastLvl) {
        ctx.globalAlpha = (lvl + 1) / 8;
        lastLvl = lvl;
      }
      if (onKey) onKey(key);
      else ctx.fillStyle = this.colorStrings[key & 0xfff];
      const start = this.starts[key];
      const end = start + this.counts[key];
      for (let j = start; j < end; j++) drawCell(order[j]);
    }
  }
}


function hexCss(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
