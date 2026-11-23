import { BaseEnvironment } from './BaseEnvironment';
import { CustomSlotId, Habitat, WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { FluidGasField } from '../physics/FluidGasField';
import { Layer, code } from '../core/RenderGrid';
import { hex, mix } from '../core/Color';
import { cellColor, tone } from '../image-converter/ImageProcessor';
import { InkRamp, cellHash, measuredRamp, pickGlyph, sampleLinear } from '../image-converter/AsciiQuality';
import { EdgeDetector, SUB_X, SUB_Y, ShapeTable, matchShape, shapeTable } from '../image-converter/ShapeMatch';
import { ImageStore } from '../../services/imageStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { CustomImageConfig, DEFAULT_CUSTOM_CONFIG } from '../../types/settings';

/** Font the ramp is measured in (size doesn't matter, the face does). */
const RAMP_FONT = '600 14px "JetBrains Mono"';
const LANTERN_TRAIL = 12;
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

  private configVersion = 0;
  private builtVersion = -1;
  private wantPlay = true;
  private lastVideoTime = -1;

  private ramp: InkRamp = measuredRamp(RAMP_FONT);
  private prevGlyph = new Int16Array(0);
  /** Characters mode: shape-matched glyph per cell (index into `shapes`), -1 for flat cells. */
  private shapeIdx = new Int16Array(0);
  private shapes: ShapeTable | null = null;
  private edges = new EdgeDetector();
  private edgeTick = 0;
  private subInk = new Float32Array(SUB_X * SUB_Y);
  private fontFamily = '"JetBrains Mono", ui-monospace, monospace';
  private fontPx = 14;
  private videoFrames = 0;
  private builtFrames = -1;
  private frameCallbackOn = false;

  // Lantern: smoothed pointer, rising/falling intensity and a fading trail.
  private lx = -1;
  private ly = -1;
  private lanternLevel = 0;
  private trail: { x: number; y: number; w: number }[] = [];
  private trailClock = 0;
  private lanternSettled = true;
  private trailX = -99;
  private trailY = -99;

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
        vid.autoplay = this.wantPlay;
        vid.crossOrigin = 'anonymous';
        vid.src = url;
        vid.onloadeddata = () => {
          this.configVersion++;
        };
        // Count decoded frames, so we re-sample exactly once per new frame.
        const rvfc = (vid as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        }).requestVideoFrameCallback;
        this.frameCallbackOn = typeof rvfc === 'function';
        if (rvfc) {
          const onFrame = () => {
            if (this.video !== vid) return;
            this.videoFrames++;
            rvfc.call(vid, onFrame);
          };
          rvfc.call(vid, onFrame);
        }
        if (this.wantPlay) vid.play().catch(() => {});
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
      this.prevGlyph = new Int16Array(n).fill(-1);
      this.shapeIdx = new Int16Array(n).fill(-1);
    }

    if (!source) return;
    const srcW = this.isVideo ? (this.video?.videoWidth || 0) : (this.image?.naturalWidth || 0);
    const srcH = this.isVideo ? (this.video?.videoHeight || 0) : (this.image?.naturalHeight || 0);
    if (srcW <= 0 || srcH <= 0) return;

    const conf = this.getConfig();
    const sub =
      conf.renderMode === 'braille' ? [2, 4]
      : conf.renderMode === 'blocks' ? [1, 2]
      : conf.renderMode === 'characters' ? [SUB_X, SUB_Y]
      : [1, 1];
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

    // Average each sample over several pixels in linear light (fewer when the
    // grid is already sub-sampled, and for video).
    const ss = sub[0] * sub[1] > 4 ? (this.isVideo ? 1 : 2) : this.isVideo ? 2 : 3;
    const data = sampleLinear(source, sx, sy, sw, sh, w, h, ss, this.offscreenCanvas);
    const lum = tone(data, w * h, conf);
    // The web font may have arrived since the last build: re-measure (cached once it has).
    this.ramp = measuredRamp(RAMP_FONT);

    if (conf.renderMode === 'characters') {
      this.buildCharacters(ctx, data, lum, w, h, conf);
      return;
    }

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

  /** Pixora: font the canvas draws with, so shapes are measured at the real cell shape. */
  public setFont(family: string, px: number): void {
    if (family === this.fontFamily && px === this.fontPx) return;
    this.fontFamily = family;
    this.fontPx = px;
    this.configVersion++;
  }

  /**
   * Characters mode: read each cell as 3×5 sub-samples. Cells with structure
   * (a contour, a stroke, an edge outline) get the glyph whose shape matches;
   * flat cells keep the tone ramp with its Bayer blend.
   */
  private buildCharacters(
    ctx: WorldContext,
    data: Uint8ClampedArray,
    lum: Float32Array,
    w: number,
    h: number,
    conf: CustomImageConfig,
  ): void {
    this.shapes = shapeTable(this.fontFamily, this.fontPx, ctx.grid.cellWidth, ctx.grid.cellHeight);
    const strength = Math.max(0, Math.min(1, conf.edges ?? 0));
    // Video: refresh edges every other frame (contours move slowly; halves the cost).
    let ridge: Float32Array | null = null;
    if (strength > 0) {
      const reuse = this.isVideo && (this.edgeTick++ & 1) === 1 && this.edges.ridge.length === w * h;
      ridge = reuse ? this.edges.ridge : this.edges.detect(lum, w, h);
    }
    const subInk = this.subInk;
    const cols = this.cols;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = r * cols + c;
        let sum = 0, lo = 1, hi = 0, edge = 0, sr = 0, sg = 0, sb = 0;
        for (let y = 0; y < SUB_Y; y++) {
          const row = (r * SUB_Y + y) * w + c * SUB_X;
          for (let x = 0; x < SUB_X; x++) {
            const i = row + x;
            let v = lum[i];
            if (ridge) {
              const e = ridge[i] * strength;
              if (e > v) v = e;
              if (ridge[i] > edge) edge = ridge[i];
            }
            subInk[y * SUB_X + x] = v;
            sum += v;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
            sr += data[i * 4];
            sg += data[i * 4 + 1];
            sb += data[i * 4 + 2];
          }
        }
        const k = 1 / (SUB_X * SUB_Y);
        const mean = sum * k;
        this.lum[cell] = mean;
        let color = cellColor(sr * k, sg * k, sb * k, mean, conf.colorMode);
        // Outlines read a little brighter than the fill around them.
        if (edge * strength > 0.25) color = mix(color, hex('#ffffff'), Math.min(0.35, edge * strength * 0.4));
        this.color[cell] = color;
        const structured = mean > 0.04 && (hi - lo > 0.28 || edge * strength > 0.3);
        this.shapeIdx[cell] = structured ? matchShape(this.shapes, subInk, 0, mean, this.shapeIdx[cell]) : -1;
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
    const vid = this.isVideo ? this.video : null;
    // Only re-sample a video when it has moved on to a new frame (frame callbacks
    // where the browser has them, otherwise a changed currentTime).
    const newVideoFrame = !!vid && vid.readyState >= 2 &&
      (this.frameCallbackOn ? this.videoFrames !== this.builtFrames : vid.currentTime !== this.lastVideoTime);
    if (newVideoFrame || this.builtVersion !== this.configVersion) {
      if (vid) {
        this.lastVideoTime = vid.currentTime;
        this.builtFrames = this.videoFrames;
      }
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

    if (effect !== 'lantern') this.lanternSettled = true;
    if (effect === 'lantern') {
      this.updateLantern(dt, input.active ? tx : -1, ty, speedMult, decayMult);
    } else if (effect === 'gas' || effect === 'drift') {
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
    const isLantern = effect === 'lantern' && this.lx >= 0;
    const lanternR = 9 * (conf.flowSpread ?? 1);
    const lanternR2 = lanternR * lanternR;
    const ramp = this.ramp;
    const WARM = hex('#fff0d6');

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

        // Lantern: Gaussian pool of light + trail, with per-cell grain.
        let lantern = 0;
        if (isLantern) {
          const dx = c - this.lx;
          const dy = (r - this.ly) / grid.aspect;
          let L = Math.exp(-(dx * dx + dy * dy) / lanternR2) * this.lanternLevel;
          for (const p of this.trail) {
            const ex = c - p.x;
            const ey = (r - p.y) / grid.aspect;
            L += p.w * Math.exp(-(ex * ex + ey * ey) / (lanternR2 * 0.55));
          }
          lantern = Math.min(1, L) * (0.7 + 0.6 * cellHash(c, r));
          if (lantern > 0.04) col = mix(col, WARM, Math.min(0.7, lantern * 0.7));
        }

        // Dynamic Cursor Lantern (smooth radial presence)
        let cursorGlow = 0;
        if (this.px >= 0 && !isLantern) {
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

        const effectiveLum = Math.max(0, Math.min(1, rawLum + surgeGlow * 0.65 + cursorGlow * 0.35 + lantern * (0.35 + glowVal * 0.5)));

        // Backlight Phosphor Glow Calculation
        const bgGlowAlpha = Math.min(
          0.88,
          (effectiveLum > 0.04 ? (effectiveLum * 0.40 + 0.08) * glowVal : 0) + surgeGlow * 0.5 + cursorGlow + lantern * 0.3
        );
        const bgGlowCol = mix(col, hex('#000000'), 0.44);

        switch (conf.renderMode) {
          case 'characters': {
            const cell = r * cols + c;
            // Structured source cell and no effect changing its tone much: use its shape glyph.
            const si = this.shapeIdx[iDom];
            if (si >= 0 && this.shapes && Math.abs(effectiveLum - rawLum) < 0.12) {
              const cp = this.shapes.codes[si];
              this.prevGlyph[cell] = -1;
              if (cp === 32) break;
              const a = Math.min(1, 0.5 + effectiveLum * 0.5);
              if (bgGlowAlpha > 0.02) grid.putSolid(c, r, cp, col, a, bgGlowCol, bgGlowAlpha, Layer.SKY);
              else grid.put(c, r, cp, col, a, Layer.SKY);
              break;
            }
            let gi = pickGlyph(ramp, effectiveLum, c, r, this.prevGlyph[cell]);
            // A few glyphs at the lantern's rim flicker one step brighter.
            if (lantern > 0.2 && lantern < 0.5 && gi < ramp.codes.length - 1 && cellHash(c + Math.floor(t * 8), r) > 0.82) gi++;
            this.prevGlyph[cell] = gi;
            if (gi === 0) break;
            const glyphCode = ramp.codes[gi];
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
      'Drop any picture or video here to render with gas-flow wake & backlight glow',
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

  /**
   * Lantern (after asciify's brightness hover): the light follows the pointer
   * with a short lag, fades in and out, and leaves a fading trail.
   */
  private updateLantern(dt: number, tx: number, ty: number, speed: number, decay: number): void {
    const present = tx >= 0;
    if (present) {
      if (this.lx < 0) {
        this.lx = tx;
        this.ly = ty;
      }
      const k = 1 - Math.exp(-dt / (0.055 / Math.max(0.2, speed)));
      this.lx += (tx - this.lx) * k;
      this.ly += (ty - this.ly) * k;
    }
    const tau = present ? 0.09 : 0.18;
    this.lanternLevel += ((present ? 1 : 0) - this.lanternLevel) * (1 - Math.exp(-dt / tau));

    // Drop a trail point every ~30 ms while moving; points fade with the decay knob.
    this.trailClock += dt;
    // Only a light that is actually moving leaves a trail.
    if (present && this.trailClock > 0.03 && Math.hypot(this.trailX - this.lx, this.trailY - this.ly) > 0.6) {
      this.trailClock = 0;
      this.trailX = this.lx;
      this.trailY = this.ly;
      this.trail.push({ x: this.lx, y: this.ly, w: 0.6 });
      if (this.trail.length > LANTERN_TRAIL) this.trail.shift();
    }
    const fade = Math.exp((-dt * 2.2) / Math.max(0.2, decay));
    for (const p of this.trail) p.w *= fade;
    while (this.trail.length && this.trail[0].w < 0.02) this.trail.shift();
    if (!present && this.lanternLevel < 0.01) {
      this.lx = -1;
      this.ly = -1;
    }
    // Settled: light has caught up with a resting pointer (or faded out) and the trail is gone.
    const caughtUp = !present || Math.hypot(tx - this.lx, ty - this.ly) < 0.05;
    this.lanternSettled =
      this.trail.length === 0 && caughtUp && Math.abs((present ? 1 : 0) - this.lanternLevel) < 0.01;
  }

  /** True when a frame would look the same as the last one (apart from the slow ambient drift). */
  public isIdle(): boolean {
    if (this.builtVersion !== this.configVersion) return false;
    if (this.isVideo && this.video && !this.video.paused) return false;
    if (!this.lanternSettled) return false;
    return !this.fluid.active && this.wavePulses.length === 0;
  }

  /** Play or pause a video slot (hidden tab, reduced motion). */
  public setPlaying(on: boolean): void {
    this.wantPlay = on;
    if (!this.video) return;
    if (on) this.video.play().catch(() => {});
    else this.video.pause();
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
