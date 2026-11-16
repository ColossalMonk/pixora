import { BaseEnvironment } from './BaseEnvironment';
import { Habitat, WorldContext } from '../../types/environment';
import { WaveEquation2D } from '../physics/WaveEquation2D';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { hex, mix } from '../core/Color';
import { cellColor, ColorMode, tone } from '../image-converter/ImageProcessor';

export type WallpaperStyle = 'tiles' | 'characters' | 'braille' | 'blocks';
export type WallpaperEffect = 'ripple' | 'repel' | 'lens' | 'drift' | 'none';

export interface WallpaperOptions {
  style: WallpaperStyle;
  color: ColorMode;
  effect: WallpaperEffect;
  brightness: number;
  contrast: number;
  gamma: number;
  invert: boolean;
  /** 0..1 — how much the art dims so the clock and search stay readable. */
  dim: number;
}

export const DEFAULT_WALLPAPER: WallpaperOptions = {
  style: 'tiles',
  color: 'full',
  effect: 'ripple',
  brightness: 0,
  contrast: 1.1,
  gamma: 1,
  invert: false,
  dim: 0.25,
};

/** Shared state: the decoded image and options, set by the UI, read by the world. */
export const Wallpaper = {
  image: null as HTMLImageElement | null,
  options: { ...DEFAULT_WALLPAPER } as WallpaperOptions,
  /** Bumped whenever image or options change, so the world rebuilds its cells. */
  version: 0,
  set(image: HTMLImageElement | null, options?: Partial<WallpaperOptions>): void {
    this.image = image;
    if (options) this.options = { ...this.options, ...options };
    this.version++;
  },
  configure(options: Partial<WallpaperOptions>): void {
    this.options = { ...this.options, ...options };
    this.version++;
  },
};

const RAMP = Array.from(' .:-=+*#%@').map(code);
const TILE_GLYPHS = Array.from(' ·:;+=').map(code);
const BRAILLE_BIT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

/**
 * "Your Image": the user's picture as a living ASCII wallpaper. The image is
 * cropped to cover the screen, toned with the Studio pipeline (auto-levels,
 * brightness, contrast, gamma) and pre-computed per cell. Each frame cells are
 * drawn with an optional pointer effect: ripple (refraction through a wave
 * simulation), repel (content bulges away from the pointer), lens (reveals
 * the true photo colours under the pointer) or drift (gentle parallax).
 * When nothing moves, it reports idle and the engine skips redrawing.
 */
export class ImageWorld extends BaseEnvironment {
  public readonly id = 'your-image';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#09090b'), hex('#0b0b0e'), hex('#08080a')];

  private noise = new SimplexNoise(3);
  private wave = new WaveEquation2D();
  private cols = 1;
  private rows = 1;
  private lum = new Float32Array(0);
  private color = new Uint32Array(0);
  private photo = new Uint32Array(0);
  private bottom = new Uint32Array(0);
  private bits = new Uint8Array(0);
  private built = -1;
  private px = -1;
  private py = -1;
  private lensR = 0;
  private energy = 0;
  private lastX = -1;
  private lastY = -1;

  /** Layered animals can roam the whole picture. */
  public habitat(width: number, height: number): Habitat {
    return { top: 0, bottom: height, left: 0, right: width, skyBottom: height * 0.6, groundY: height - 20 };
  }

  public init(ctx: WorldContext): void {
    const { grid } = ctx;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.wave.resize(grid.cols, grid.rows, grid.aspect);
    this.wave.damping = 0.975;
    this.build(ctx);
  }

  /** Samples the image into per-cell tone/colour (and Braille bits / block halves). */
  private build(ctx: WorldContext): void {
    this.built = Wallpaper.version;
    const img = Wallpaper.image;
    const n = this.cols * this.rows;
    this.lum = new Float32Array(n);
    this.color = new Uint32Array(n);
    this.photo = new Uint32Array(n);
    this.bottom = new Uint32Array(n);
    this.bits = new Uint8Array(n);
    if (!img) return;
    const o = Wallpaper.options;
    const sub = o.style === 'braille' ? [2, 4] : o.style === 'blocks' ? [1, 2] : [1, 1];
    const w = this.cols * sub[0];
    const h = this.rows * sub[1];
    // Cover-crop the image to the screen's aspect.
    const view = ctx.width / Math.max(1, ctx.height);
    const ia = img.naturalWidth / img.naturalHeight;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (ia > view) {
      sw = sh * view;
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = sw / view;
      sy = (img.naturalHeight - sh) / 2;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h).data;
    const lum = tone(data, w * h, o);
    const pack = (i: number) => ((data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2]) >>> 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = r * this.cols + c;
        if (o.style === 'braille') {
          let b = 0, sr = 0, sg = 0, sb = 0, sl = 0;
          for (let dx = 0; dx < 2; dx++) {
            for (let dy = 0; dy < 4; dy++) {
              const i = (r * 4 + dy) * w + c * 2 + dx;
              const thr = [0.12, 0.62, 0.37, 0.87, 0.75, 0.25, 0.5, 0.0][dx * 4 + dy] * 0.9 + 0.05;
              if (lum[i] > thr) b |= BRAILLE_BIT[dx][dy];
              sr += data[i * 4]; sg += data[i * 4 + 1]; sb += data[i * 4 + 2]; sl += lum[i];
            }
          }
          this.bits[cell] = b;
          this.lum[cell] = sl / 8;
          this.color[cell] = cellColor(sr / 8, sg / 8, sb / 8, Math.max(0.5, sl / 8), o.color);
          this.photo[cell] = ((sr / 8) << 16) | ((sg / 8) << 8) | (sb / 8);
        } else if (o.style === 'blocks') {
          const t = (r * 2) * w + c;
          const b = (r * 2 + 1) * w + c;
          this.lum[cell] = (lum[t] + lum[b]) / 2;
          this.color[cell] = this.toned(data, t, lum[t], o.color);
          this.bottom[cell] = this.toned(data, b, lum[b], o.color);
          this.photo[cell] = pack(t);
        } else {
          const i = r * w + c;
          this.lum[cell] = lum[i];
          this.color[cell] = o.style === 'tiles' ? this.toned(data, i, lum[i], o.color) : cellColor(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], lum[i], o.color);
          this.photo[cell] = pack(i);
        }
      }
    }
  }

  /** True colour scaled by the tone change (tiles and blocks fill whole cells). */
  private toned(data: Uint8ClampedArray, i: number, v: number, mode: ColorMode): number {
    if (mode !== 'full') return cellColor(0, 0, 0, v, mode);
    const y = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    const k = y > 0.01 ? Math.min(3, v / y) : 1;
    return (Math.min(255, data[i * 4] * k) << 16) | (Math.min(255, data[i * 4 + 1] * k) << 8) | Math.min(255, data[i * 4 + 2] * k);
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    if (this.built !== Wallpaper.version) this.build(ctx);
    const { input, grid } = ctx;
    const effect = Wallpaper.options.effect;
    const tx = input.active ? input.x / grid.cellWidth : -1;
    const ty = input.active ? input.y / grid.cellHeight : -1;
    if (tx < 0) {
      this.px = -1;
    } else if (this.px < 0) {
      this.px = tx;
      this.py = ty;
    } else {
      this.px += (tx - this.px) * Math.min(1, dt * 10);
      this.py += (ty - this.py) * Math.min(1, dt * 10);
    }
    this.lensR += ((input.active && effect === 'lens' ? 9 : 0) - this.lensR) * Math.min(1, dt * 6);

    if (effect === 'ripple') {
      for (const c of input.clicks) this.wave.addDisturbance(c.x / grid.cellWidth, c.y / grid.cellHeight, 4, 6 * input.intensity);
      if (input.active && this.lastX >= 0) {
        const d = Math.hypot(input.x - this.lastX, input.y - this.lastY);
        if (d > 2) this.wave.addDisturbance(tx, ty, 2.2, Math.min(2, d * 0.06) * input.intensity);
      }
      this.wave.update();
      let e = 0;
      for (let i = 0; i < this.wave.uCurr.length; i += 7) e += Math.abs(this.wave.uCurr[i]);
      this.energy = e;
    } else {
      this.energy = 0;
    }
    this.lastX = input.active ? input.x : -1;
    this.lastY = input.y;
  }

  /** Nothing animating: the engine may keep the last frame. */
  public idle(): boolean {
    const effect = Wallpaper.options.effect;
    if (!Wallpaper.image) return false;
    if (effect === 'drift') return false;
    if (this.px >= 0 && effect !== 'none') return false;
    if (this.lensR > 0.05) return false;
    return this.energy < 0.5;
  }

  public render(ctx: WorldContext): void {
    const { grid } = ctx;
    const o = Wallpaper.options;
    const cols = this.cols;
    const rows = this.rows;
    if (!Wallpaper.image) {
      this.renderEmpty(ctx);
      return;
    }
    const dimK = 1 - o.dim;
    const effect = o.effect;
    const t = this.time;
    const driftX = effect === 'drift' ? Math.sin(t * 0.07) * 2 + (this.px >= 0 ? (this.px / cols - 0.5) * -4 : 0) : 0;
    const driftY = effect === 'drift' ? Math.cos(t * 0.05) * 1 + (this.py >= 0 ? (this.py / rows - 0.5) * -2 : 0) : 0;
    const repelR = 12;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Where to read from (displacement by effect).
        let sc = c + driftX;
        let sr = r + driftY;
        if (effect === 'ripple' && this.energy > 0.01) {
          sc += this.wave.gradX(c, r) * 6;
          sr += this.wave.gradY(c, r) * 6;
        } else if (effect === 'repel' && this.px >= 0) {
          const dx = c - this.px;
          const dy = (r - this.py) / grid.aspect;
          const d = Math.hypot(dx, dy);
          if (d < repelR && d > 0.001) {
            const push = (1 - d / repelR) ** 2 * 5;
            sc -= (dx / d) * push;
            sr -= (dy / d) * push * grid.aspect;
          }
        }
        const ci = Math.min(cols - 1, Math.max(0, Math.round(sc)));
        const ri = Math.min(rows - 1, Math.max(0, Math.round(sr)));
        const i = ri * cols + ci;

        // Lens: reveal the true photo under the pointer.
        if (this.lensR > 0.3 && this.px >= 0) {
          const d = Math.hypot(c - this.px, (r - this.py) / grid.aspect);
          if (d < this.lensR) {
            grid.putSolid(c, r, d > this.lensR - 0.8 ? code('·') : 0, hex('#ffffff'), 0.5, this.photo[i], 1, Layer.MID);
            continue;
          }
        }

        const v = this.lum[i];
        let col = this.color[i];
        if (effect === 'ripple' && this.energy > 0.01) {
          const h = this.wave.uCurr[r * cols + c];
          if (h > 0.05) col = mix(col, 0xffffff, Math.min(0.5, h * 0.4));
        }
        switch (o.style) {
          case 'tiles': {
            if (v < 0.04) break;
            const g = TILE_GLYPHS[Math.min(TILE_GLYPHS.length - 1, Math.floor(v * TILE_GLYPHS.length))];
            grid.putSolid(c, r, g, mix(col, 0, 0.55), 0.7, col, (0.25 + v * 0.75) * dimK, Layer.SKY);
            break;
          }
          case 'characters': {
            if (v < 0.06) break;
            grid.put(c, r, RAMP[Math.round(v * (RAMP.length - 1))], col, (0.35 + v * 0.65) * dimK, Layer.SKY);
            break;
          }
          case 'braille': {
            const b = this.bits[i];
            if (b) grid.put(c, r, 0x2800 + b, col, (0.45 + v * 0.55) * dimK, Layer.SKY);
            break;
          }
          case 'blocks':
            grid.putSolid(c, r, code('▀'), col, dimK, this.bottom[i], dimK, Layer.SKY);
            break;
        }
      }
    }
  }

  /** No image yet: a calm placeholder with a hint. */
  private renderEmpty(ctx: WorldContext): void {
    const { grid } = ctx;
    for (let r = 0; r < this.rows; r += 2) {
      for (let c = 0; c < this.cols; c += 2) {
        const v = this.noise.noise3D(c * 0.04, r * 0.08, this.time * 0.05) * 0.5 + 0.5;
        if (v > 0.62) grid.putSolid(c, r, 0, 0, 0, mix(hex('#1e293b'), hex('#5eead4'), (v - 0.62) * 1.5), (v - 0.62) * 0.8, Layer.SKY);
      }
    }
    const lines = ['Your Image', 'drop a picture anywhere on this page', 'or open the wallpaper panel ( ⚙ in the bottom bar )'];
    const base = Math.floor(this.rows * 0.82);
    lines.forEach((s, k) => {
      const c0 = Math.floor((this.cols - s.length) / 2);
      grid.text(c0, base + k * 2, s, k === 0 ? hex('#5eead4') : hex('#94a3b8'), k === 0 ? 0.95 : 0.8, Layer.FX);
    });
  }
}
