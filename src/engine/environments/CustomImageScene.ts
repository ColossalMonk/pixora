import { BaseEnvironment } from './BaseEnvironment';
import { CustomSlotId, Habitat, WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { FluidGasField } from '../physics/FluidGasField';
import { Layer, code } from '../core/RenderGrid';
import { hex, mix } from '../core/Color';
import { cellColor, tone } from '../image-converter/ImageProcessor';
import { ImageStore } from '../../services/imageStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { CustomImageConfig, DEFAULT_CUSTOM_CONFIG } from '../../types/settings';

// Asciify Classic ASCII ramp
const RAMP = Array.from(' .:-=+*#%@').map(code);
const TILE_GLYPHS = Array.from(' ·:;+=').map(code);
const BRAILLE_BIT = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

interface WavePulse {
  x: number;
  y: number;
  speed: number;
  wavelength: number;
  strength: number;
  age: number;
  maxAge: number;
}

export class CustomImageScene extends BaseEnvironment {
  public readonly id: CustomSlotId;
  public readonly preferredStyle = 'ascii-standard' as const;
  public readonly backdrop = [hex('#08080c'), hex('#06070a'), hex('#050608')];

  private noise = new SimplexNoise(3);
  private fluid = new FluidGasField(1.77, 1.35);
  private wavePulses: WavePulse[] = [];
  private lastRippleTime = 0;

  private cols = 1;
  private rows = 1;
  private image: HTMLImageElement | null = null;
  private video: HTMLVideoElement | null = null;
  private videoUrl: string | null = null;
  private isVideo = false;
  private offscreenCanvas: HTMLCanvasElement = document.createElement('canvas');
  private offscreenCtx: CanvasRenderingContext2D | null = null;

  private configVersion = 0;
  private builtVersion = -1;

  private lum = new Float32Array(0);
  private color = new Uint32Array(0);
  private bottom = new Uint32Array(0);
  private bits = new Uint8Array(0);

  private px = -1;
  private py = -1;
  private sampledField = [0, 0, 0];

  private unsubscribe: (() => void) | null = null;

  constructor(slotId: CustomSlotId) {
    super();
    this.id = slotId;
  }

  public habitat(width: number, height: number): Habitat {
    return { top: 0, bottom: height, left: 0, right: width, skyBottom: height * 0.6, groundY: height - 20 };
  }

  private getConfig(): CustomImageConfig {
    const s = useSettingsStore.getState();
    return s.customConfigs?.[this.id] || DEFAULT_CUSTOM_CONFIG;
  }

  public init(ctx: WorldContext): void {
    const { grid } = ctx;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.fluid.resize(ctx.width / Math.max(1, ctx.height));

    // Subscribe to store updates
    if (!this.unsubscribe) {
      this.unsubscribe = ImageStore.subscribe((updatedSlot) => {
        if (updatedSlot === this.id) {
          this.loadImage();
        }
      });
    }

    this.loadImage();
  }

  public resize(ctx: WorldContext): void {
    const { grid } = ctx;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.fluid.resize(ctx.width / Math.max(1, ctx.height));
    this.build(ctx);
  }

  public loadImage(): void {
    ImageStore.loadImage(this.id).then((blob) => {
      // Clean up previous video
      if (this.video) {
        this.video.pause();
        this.video.src = '';
        this.video.load();
        if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
        this.video = null;
        this.videoUrl = null;
      }
      this.image = null;
      this.isVideo = false;

      if (!blob) {
        this.configVersion++;
        return;
      }

      if (blob.type.startsWith('video/')) {
        this.isVideo = true;
        const url = URL.createObjectURL(blob);
        this.videoUrl = url;
        const vid = document.createElement('video');
        vid.muted = true;
        vid.loop = true;
        vid.playsInline = true;
        vid.autoplay = true;
        vid.crossOrigin = 'anonymous';
        vid.src = url;
        vid.onloadeddata = () => {
          this.configVersion++;
        };
        vid.play().catch(() => {});
        this.video = vid;
      } else {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          this.image = img;
          this.configVersion++;
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          this.image = null;
          this.configVersion++;
        };
        img.src = url;
      }
    });
  }

  private build(ctx: WorldContext): void {
    this.builtVersion = this.configVersion;
    const source = this.isVideo ? this.video : this.image;
    const n = this.cols * this.rows;
    if (this.lum.length !== n) {
      this.lum = new Float32Array(n);
      this.color = new Uint32Array(n);
      this.bottom = new Uint32Array(n);
      this.bits = new Uint8Array(n);
    }

    if (!source) return;
    const srcW = this.isVideo ? (this.video?.videoWidth || 0) : (this.image?.naturalWidth || 0);
    const srcH = this.isVideo ? (this.video?.videoHeight || 0) : (this.image?.naturalHeight || 0);
    if (srcW <= 0 || srcH <= 0) return;

    const conf = this.getConfig();
    const sub = conf.renderMode === 'braille' ? [2, 4] : conf.renderMode === 'blocks' ? [1, 2] : [1, 1];
    const w = this.cols * sub[0];
    const h = this.rows * sub[1];

    const view = ctx.width / Math.max(1, ctx.height);
    const ia = srcW / Math.max(1, srcH);
    let sx = 0, sy = 0, sw = srcW, sh = srcH;
    if (ia > view) {
      sw = sh * view;
      sx = (srcW - sw) / 2;
    } else {
      sh = sw / view;
      sy = (srcH - sh) / 2;
    }

    if (this.offscreenCanvas.width !== w || this.offscreenCanvas.height !== h) {
      this.offscreenCanvas.width = w;
      this.offscreenCanvas.height = h;
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }
    const g = this.offscreenCtx;
    if (!g) return;
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h).data;
    const lum = tone(data, w * h, conf);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = r * this.cols + c;
        if (conf.renderMode === 'braille') {
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
          this.color[cell] = cellColor(sr / 8, sg / 8, sb / 8, Math.max(0.5, sl / 8), conf.colorMode);
        } else if (conf.renderMode === 'blocks') {
          const t = (r * 2) * w + c;
          const b = (r * 2 + 1) * w + c;
          this.lum[cell] = (lum[t] + lum[b]) / 2;
          this.color[cell] = this.toned(data, t, lum[t], conf.colorMode);
          this.bottom[cell] = this.toned(data, b, lum[b], conf.colorMode);
        } else {
          const i = r * w + c;
          this.lum[cell] = lum[i];
          this.color[cell] = conf.renderMode === 'tiles'
            ? this.toned(data, i, lum[i], conf.colorMode)
            : cellColor(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], lum[i], conf.colorMode);
        }
      }
    }
  }

  private toned(data: Uint8ClampedArray, i: number, v: number, mode: CustomImageConfig['colorMode']): number {
    if (mode !== 'full') return cellColor(0, 0, 0, v, mode);
    const y = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    const k = y > 0.01 ? Math.min(3, v / y) : 1;
    return (Math.min(255, data[i * 4] * k) << 16) | (Math.min(255, data[i * 4 + 1] * k) << 8) | Math.min(255, data[i * 4 + 2] * k);
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const isVideoPlaying = this.isVideo && this.video && this.video.readyState >= 2 && !this.video.paused;
    if (isVideoPlaying || this.builtVersion !== this.configVersion) {
      this.build(ctx);
    }
    const { input, grid } = ctx;
    const conf = this.getConfig();
    const effect = conf.effect;

    const speedMult = conf.flowSpeed ?? 1.0;
    const spreadMult = conf.flowSpread ?? 1.0;
    const decayMult = conf.flowDecay ?? 1.0;
    this.fluid.setFlowDynamics(speedMult, spreadMult, decayMult);

    const tx = input.active ? input.x / grid.cellWidth : -1;
    const ty = input.active ? input.y / grid.cellHeight : -1;

    if (tx < 0) {
      this.px = -1;
      this.py = -1;
      this.fluid.leave();
    } else {
      this.px = tx;
      this.py = ty;
    }

    if (effect === 'gas' || effect === 'drift') {
      // 1. Gas Flow / Billowing Wake
      if (input.active && input.x >= 0) {
        this.fluid.move(input.x / ctx.width, input.y / ctx.height);
      }
      for (const click of input.clicks) {
        this.fluid.puff(click.x / ctx.width, click.y / ctx.height, 1.3 * spreadMult);
      }
      this.fluid.step(dt);
    } else if (effect === 'ripple') {
      // 2. Concentric Traveling Water Ripples
      const speed = Math.hypot(input.vx, input.vy);
      if (input.active && speed > 18 && this.time - this.lastRippleTime > (0.12 / Math.max(0.2, speedMult))) {
        this.lastRippleTime = this.time;
        this.wavePulses.push({
          x: input.x / grid.cellWidth,
          y: input.y / grid.cellHeight,
          speed: 28 * speedMult,
          wavelength: 12 * spreadMult,
          strength: Math.min(1.8, speed * 0.035) * spreadMult,
          age: 0,
          maxAge: 2.2 / Math.max(0.2, decayMult),
        });
      }

      for (const click of input.clicks) {
        this.wavePulses.push({
          x: click.x / grid.cellWidth,
          y: click.y / grid.cellHeight,
          speed: 32 * speedMult,
          wavelength: 14 * spreadMult,
          strength: 2.6 * spreadMult,
          age: 0,
          maxAge: 2.8 / Math.max(0.2, decayMult),
        });
      }

      // Age out ripple pulses
      for (let i = this.wavePulses.length - 1; i >= 0; i--) {
        const p = this.wavePulses[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          this.wavePulses.splice(i, 1);
        }
      }
      if (this.wavePulses.length > 8) this.wavePulses.splice(0, this.wavePulses.length - 8);
    }
  }

  public render(ctx: WorldContext): void {
    const { grid } = ctx;
    const conf = this.getConfig();
    const cols = this.cols;
    const rows = this.rows;

    if (!this.image && !this.video) {
      this.renderEmpty(ctx);
      return;
    }

    const effect = conf.effect;
    const glowVal = Math.max(0, Math.min(1, conf.glow));
    const t = this.time;
    const isGas = (effect === 'gas' || effect === 'drift') && this.fluid.active;
    const isRipple = effect === 'ripple' && this.wavePulses.length > 0;

    // Ambient gentle silky breath (very low frequency micro-drift)
    const ambT = t * 0.35;
    const sampled = this.sampledField;

    for (let r = 0; r < rows; r++) {
      const vNorm = r / Math.max(1, rows - 1);
      const rowAmbX = Math.sin(r * 0.05 + ambT) * 0.45;
      const rowAmbY = Math.cos(r * 0.04 - ambT * 0.8) * 0.25;

      for (let c = 0; c < cols; c++) {
        const uNorm = c / Math.max(1, cols - 1);
        let flowX = 0;
        let flowY = 0;
        let dynamicLuminance = 0;

        // Ambient column flow
        const colAmbX = Math.cos(c * 0.04 + ambT * 0.7) * 0.35;
        const colAmbY = Math.sin(c * 0.05 - ambT * 0.9) * 0.25;

        let sc = c + rowAmbX + colAmbX;
        let sr = r + rowAmbY + colAmbY;

        if (isGas) {
          // Sample expanding fluid gas advection wake
          this.fluid.sample(uNorm, vNorm, sampled);
          flowX = sampled[0] * cols * 3.4;
          flowY = sampled[1] * rows * 3.4;
          dynamicLuminance = sampled[2];

          sc += flowX;
          sr += flowY;
        } else if (isRipple) {
          // Sample concentric traveling water wave ripples
          for (let pi = 0; pi < this.wavePulses.length; pi++) {
            const p = this.wavePulses[pi];
            const dx = c - p.x;
            const dy = (r - p.y) / grid.aspect;
            const dist = Math.hypot(dx, dy);
            const rFront = p.age * p.speed;
            const dr = dist - rFront;

            const ringEnv = Math.exp(-(dr * dr) / 64) * Math.exp(-p.age * 1.3) * p.strength;
            if (ringEnv > 0.002) {
              const invDist = 1 / (dist + 0.001);
              const phase = dist * (Math.PI * 2 / p.wavelength) - p.age * 9;
              const waveOsc = Math.sin(phase);

              flowX += dx * invDist * waveOsc * ringEnv * 2.8;
              flowY += dy * invDist * waveOsc * ringEnv * 2.8;
              dynamicLuminance += waveOsc * ringEnv * 0.5;
            }
          }

          sc += flowX;
          sr += flowY;
        }

        // Clamp floating coordinates to valid boundaries
        const cClamped = Math.max(0, Math.min(cols - 1, sc));
        const rClamped = Math.max(0, Math.min(rows - 1, sr));

        // Sub-cell Bilinear Interpolation for silky continuous sampling
        const c0 = Math.floor(cClamped);
        const c1 = Math.min(cols - 1, c0 + 1);
        const r0 = Math.floor(rClamped);
        const r1 = Math.min(rows - 1, r0 + 1);

        const fx = cClamped - c0;
        const fy = rClamped - r0;

        const i00 = r0 * cols + c0;
        const i10 = r0 * cols + c1;
        const i01 = r1 * cols + c0;
        const i11 = r1 * cols + c1;

        const v0 = this.lum[i00] * (1 - fx) + this.lum[i10] * fx;
        const v1 = this.lum[i01] * (1 - fx) + this.lum[i11] * fx;
        const rawLum = v0 * (1 - fy) + v1 * fy;

        // Dominant cell for color fidelity
        const iDom = (fy < 0.5 ? (fx < 0.5 ? i00 : i10) : (fx < 0.5 ? i01 : i11));
        let col = this.color[iDom];

        // Asciify Dynamic Cursor Lantern (smooth radial presence)
        let cursorGlow = 0;
        if (this.px >= 0) {
          const dCursor = Math.hypot(c - this.px, (r - this.py) / grid.aspect);
          if (dCursor < 22) {
            cursorGlow = (1 - dCursor / 22) * 0.4 * glowVal;
          }
        }

        // Motion Surge & Expanding Cloud (bioluminescent gas wake or ripple crest)
        const surgeGlow = dynamicLuminance * glowVal * (isGas ? 1.15 : 0.8);
        if (surgeGlow > 0.06) {
          col = mix(col, hex('#ffffff'), Math.min(0.45, surgeGlow * 0.6));
        }

        const effectiveLum = Math.max(0, Math.min(1, rawLum + surgeGlow * 0.65 + cursorGlow * 0.35));

        // Asciify Backlight Phosphor Glow Calculation
        const bgGlowAlpha = Math.min(
          0.88,
          (effectiveLum > 0.04 ? (effectiveLum * 0.40 + 0.08) * glowVal : 0) + surgeGlow * 0.5 + cursorGlow
        );
        const bgGlowCol = mix(col, hex('#000000'), 0.44);

        switch (conf.renderMode) {
          case 'characters': {
            if (effectiveLum < 0.04) break;
            const glyphIdx = Math.min(RAMP.length - 1, Math.floor(effectiveLum * RAMP.length));
            const glyphCode = RAMP[glyphIdx];
            const fgAlpha = Math.min(1, 0.45 + effectiveLum * 0.55);

            if (bgGlowAlpha > 0.02) {
              grid.putSolid(c, r, glyphCode, col, fgAlpha, bgGlowCol, bgGlowAlpha, Layer.SKY);
            } else {
              grid.put(c, r, glyphCode, col, fgAlpha, Layer.SKY);
            }
            break;
          }
          case 'tiles': {
            if (effectiveLum < 0.04) break;
            const g = TILE_GLYPHS[Math.min(TILE_GLYPHS.length - 1, Math.floor(effectiveLum * TILE_GLYPHS.length))];
            const tileAlpha = 0.3 + effectiveLum * 0.7;
            const fgTint = mix(col, 0, 0.55);
            grid.putSolid(c, r, g, fgTint, 0.75, col, tileAlpha, Layer.SKY);
            break;
          }
          case 'braille': {
            const b = this.bits[iDom];
            if (b > 0) {
              const brailleCode = 0x2800 + b;
              const fgAlpha = Math.min(1, 0.45 + effectiveLum * 0.55);
              if (bgGlowAlpha > 0.03) {
                grid.putSolid(c, r, brailleCode, col, fgAlpha, bgGlowCol, bgGlowAlpha * 0.8, Layer.SKY);
              } else {
                grid.put(c, r, brailleCode, col, fgAlpha, Layer.SKY);
              }
            } else if (effectiveLum > 0.1) {
              grid.put(c, r, 0x2801, col, 0.3, Layer.SKY);
            }
            break;
          }
          case 'blocks': {
            grid.putSolid(c, r, code('▀'), col, 1, this.bottom[iDom], 1, Layer.SKY);
            break;
          }
        }
      }
    }
  }

  private renderEmpty(ctx: WorldContext): void {
    const { grid } = ctx;
    const slotNumber = this.id.replace('custom-', '');

    // Subtle animated grid noise
    for (let r = 0; r < this.rows; r += 2) {
      for (let c = 0; c < this.cols; c += 2) {
        const v = this.noise.noise3D(c * 0.04, r * 0.08, this.time * 0.05) * 0.5 + 0.5;
        if (v > 0.64) {
          grid.putSolid(c, r, 0, 0, 0, mix(hex('#181822'), hex('#38bdf8'), (v - 0.64) * 1.5), (v - 0.64) * 0.5, Layer.SKY);
        }
      }
    }

    const lines = [
      `CUSTOM ASCII ART • SLOT ${slotNumber}`,
      'Drop any picture or video here to asciify with gas-flow wake & backlight glow',
      'or click the circular icon on the right to upload',
    ];
    const base = Math.floor(this.rows * 0.78);
    lines.forEach((s, k) => {
      const c0 = Math.floor((this.cols - s.length) / 2);
      const color = k === 0 ? hex('#38bdf8') : hex('#94a3b8');
      const alpha = k === 0 ? 0.95 : 0.75;
      grid.text(c0, base + k * 2, s, color, alpha, Layer.FX);
    });
  }

  public tune(_values?: Record<string, number | boolean>): void {
    this.configVersion++;
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.src = '';
      this.video.load();
      if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
      this.video = null;
      this.videoUrl = null;
    }
    this.image = null;
  }
}
