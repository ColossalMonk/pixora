import { BaseEnvironment } from './BaseEnvironment';
import { Habitat, WorldContext } from '../../types/environment';
import { WaveEquation2D } from '../physics/WaveEquation2D';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, hash2, mix } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawLine, spot } from '../draw/Shapes';

interface Petal { x: number; y: number; vx: number; vy: number; glyph: number; spin: number; }
interface Drop { x: number; y: number; vy: number; hitY: number; }
interface Splash { x: number; y: number; age: number; }

/**
 * Moonlit lake: a sky band with moon, stars and a treeline; below it a wave
 * heightfield shaded by its surface normal, a shimmering moon path, drifting
 * petals and passing rain showers.
 */
export class InteractiveWater extends BaseEnvironment {
  public readonly id = 'ripples';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#0b1533'), hex('#101d40'), hex('#0a1630'), hex('#050b1a')];
  public readonly followsClock = true;
  public readonly backdropDay = [hex('#3a6ea8'), hex('#4b80b8'), hex('#285b8a'), hex('#14365a')];

  private wave = new WaveEquation2D();
  private noise = new SimplexNoise(11);
  private field = new Float32Array(0);
  private tint = new Uint32Array(0);
  private horizon = 0; // row where water begins
  private moonX = 0;
  private moonY = 0;
  private stars: { c: number; r: number; p: number; g: number }[] = [];
  private treeline = new Int16Array(0);
  private petals: Petal[] = [];
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private rainTimer = 20;
  private raining = 0;
  private lastPX = -1;
  private lastPY = -1;

  private waterLut = gradientLUT([[0, hex('#16305a')], [0.4, hex('#3e6aa8')], [0.75, hex('#9ec5f0')], [1, hex('#f2f7ff')]]);
  private moonPath = hex('#fff1c1');
  private petalGlyphs = Array.from('❀✿·°•').map(code);

  private horizonPx = 0;

  /** Sky above the treeline for flyers, the lake below for swimmers. */
  public habitat(width: number, height: number): Habitat {
    return { top: 0, bottom: height, left: 0, right: width, skyBottom: this.horizonPx - 20, waterY: this.horizonPx + 10 };
  }

  public init(ctx: WorldContext): void {
    const { grid, width, height, quality } = ctx;
    const area = (width * height) / (1440 * 900);
    this.horizon = Math.max(4, Math.round(grid.rows * 0.24));
    this.horizonPx = (this.horizon + 1) * grid.cellHeight;
    this.wave.resize(grid.cols, grid.rows, grid.aspect);
    this.wave.damping = 0.986;
    this.field = this.ensure(this.field, grid.size);
    this.tint = this.tint.length === grid.size ? this.tint : new Uint32Array(grid.size);
    this.moonX = width * 0.74;
    this.moonY = this.horizon * grid.cellHeight * 0.42;

    this.stars = [];
    for (let i = 0; i < 70 * area; i++) {
      this.stars.push({ c: Math.floor(Math.random() * grid.cols), r: Math.floor(Math.random() * (this.horizon - 2)), p: Math.random() * 6, g: code(Math.random() > 0.85 ? '✦' : Math.random() > 0.5 ? '·' : '.') });
    }
    this.treeline = new Int16Array(grid.cols);
    let c0 = 0;
    while (c0 < grid.cols + 4) {
      const hill = this.noise.noise2D(c0 * 0.03, 1.7) * 0.5 + 0.5;
      const h = 1 + Math.round(hill * 3 + hash2(c0, 3) * 2.5);
      for (let dc = -h; dc <= h; dc++) {
        const c = c0 + dc;
        if (c < 0 || c >= grid.cols) continue;
        const v = h - Math.abs(dc);
        if (v > this.treeline[c]) this.treeline[c] = v;
      }
      c0 += 2 + Math.floor(hash2(c0, 9) * 3);
    }

    this.petals = [];
    for (let i = 0; i < 26 * area * quality; i++) {
      this.petals.push({
        x: Math.random() * grid.cols,
        y: this.horizon + 2 + Math.random() * (grid.rows - this.horizon - 3),
        vx: 0, vy: 0,
        glyph: this.petalGlyphs[(Math.random() * this.petalGlyphs.length) | 0],
        spin: Math.random() * 6,
      });
    }
    this.drops = [];
    this.splashes = [];
    this.wave.addDisturbance(grid.cols * 0.4, this.horizon + (grid.rows - this.horizon) * 0.55, 4, 3);
    void height;
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { grid, input, width, height } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const waterTop = this.horizon + 1;

    for (const c of input.clicks) {
      const col = c.x / cw;
      const row = c.y / ch;
      if (row > waterTop) {
        this.wave.addDisturbance(col, row, 4.5, 5 * input.intensity);
        this.splashes.push({ x: c.x, y: c.y, age: 0 });
      } else {
        // Clicking the sky starts a brief shower.
        this.raining = Math.max(this.raining, 6);
      }
    }

    if (input.active && input.y / ch > waterTop) {
      const d = this.lastPX >= 0 ? Math.hypot(input.x - this.lastPX, input.y - this.lastPY) : 0;
      if (d > 2) {
        const steps = Math.min(6, Math.ceil(d / cw));
        for (let s = 1; s <= steps; s++) {
          const px = this.lastPX + ((input.x - this.lastPX) * s) / steps;
          const py = this.lastPY + ((input.y - this.lastPY) * s) / steps;
          this.wave.addDisturbance(px / cw, py / ch, 2, Math.min(1.2, d * 0.05) * input.intensity);
        }
      }
      this.lastPX = input.x;
      this.lastPY = input.y;
    } else {
      this.lastPX = -1;
    }

    // Weather: occasional showers.
    this.rainTimer -= dt;
    if (this.rainTimer <= 0) {
      this.raining = 8 + Math.random() * 10;
      this.rainTimer = 35 + Math.random() * 40;
    }
    // Real rain where the user is keeps a shower going.
    if (ctx.weather === 'rain' || ctx.weather === 'storm') this.raining = Math.max(this.raining, 2);
    if (this.raining > 0) this.raining -= dt;
    const rainRate = this.raining > 0 ? 28 * (width / 1440) : 0.6;
    const spawn = rainRate * dt;
    for (let n = Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0); n > 0; n--) {
      const hitY = (waterTop + 1 + Math.random() * (grid.rows - waterTop - 2)) * ch;
      this.drops.push({ x: Math.random() * width, y: this.raining > 0 ? -10 : hitY - 1, vy: 520 + Math.random() * 200, hitY });
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += d.vy * dt;
      d.x += 30 * dt;
      if (d.y >= d.hitY) {
        this.wave.addDisturbance(d.x / cw, d.y / ch, 1.6, 1.4);
        if (Math.random() < 0.3) this.splashes.push({ x: d.x, y: d.y, age: 0.15 });
        this.drops.splice(i, 1);
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].age += dt;
      if (this.splashes[i].age > 0.6) this.splashes.splice(i, 1);
    }

    this.wave.update();

    for (const p of this.petals) {
      const c = p.x | 0;
      const r = p.y | 0;
      p.vx += -this.wave.gradX(c, r) * 6 * dt * 60 * 0.1;
      p.vy += -this.wave.gradY(c, r) * 6 * dt * 60 * 0.1;
      p.vx *= Math.exp(-dt * 2.5);
      p.vy *= Math.exp(-dt * 2.5);
      p.x += (p.vx + 0.6) * dt * 3;
      p.y += (p.vy + 0.1) * dt * 2;
      p.spin += dt;
      if (p.x >= grid.cols) p.x -= grid.cols;
      if (p.x < 0) p.x += grid.cols;
      if (p.y >= grid.rows - 0.5) p.y = waterTop + 1;
      if (p.y < waterTop + 0.5) p.y = waterTop + 0.5;
    }

    void height;
  }

  public render(ctx: WorldContext): void {
    const { grid, style } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;
    const H = this.horizon;

    // Sky: stars, moon, treeline.
    for (const s of this.stars) {
      const a = (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + s.p * 7))) * (1 - ctx.sky.light);
      grid.put(s.c, s.r, s.g, hex('#dbe7ff'), a, Layer.SKY);
    }
    const mc = this.moonX / cw;
    const mr = this.moonY / ch;
    const rad = 5.5;
    for (let r = Math.floor(mr - rad * grid.aspect - 2); r <= mr + rad * grid.aspect + 2; r++) {
      for (let c = Math.floor(mc - rad - 3); c <= mc + rad + 3; c++) {
        const dx = c + 0.5 - mc;
        const dy = (r + 0.5 - mr) / grid.aspect;
        const d = Math.hypot(dx, dy);
        if (d < rad) {
          const limb = d / rad;
          const crater = this.noise.noise2D(c * 0.35, r * 0.8) > 0.3;
          const g = limb > 0.9 ? '▓' : '█';
          const sun = ctx.sky.light > 0.5;
          grid.putChar(c, r, g, sun ? (crater ? hex('#fde68a') : hex('#fef9c3')) : crater ? hex('#efe3b8') : hex('#fff8e2'), 1, Layer.MID);
        } else if (d < rad + 3) {
          grid.putChar(c, r, (c + r) % 2 ? '·' : '.', hex('#fff1c1'), 0.45 * (1 - (d - rad) / 3), Layer.SKY);
        }
      }
    }
    for (let c = 0; c < cols; c++) {
      const h = this.treeline[c];
      const hl = c > 0 ? this.treeline[c - 1] : h;
      const hr = c < cols - 1 ? this.treeline[c + 1] : h;
      for (let k = 0; k < h; k++) {
        const r = H - k;
        let g = 0;
        if (k === h - 1) g = h > hl && h > hr ? code('▲') : hl > h ? code('\\') : hr > h ? code('/') : code('^');
        grid.putSolid(c, r, g, hex('#1b2b4a'), 0.9, hex('#050a17'), 1, Layer.NEAR);
      }
    }

    // Water surface: height + normal shading + moon path.
    const field = this.field;
    const tint = this.tint;
    field.fill(0);
    tint.fill(0);
    const lx = 0.55;
    const ly = -0.83;
    const pathHalf = 2.5;
    for (let r = H + 1; r < rows; r++) {
      const depth = (r - H) / (rows - H);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const h = this.wave.uCurr[i];
        const gx = this.wave.gradX(c, r);
        const gy = this.wave.gradY(c, r);
        const spec = Math.max(0, -(gx * lx + gy * ly)) * 2.2;
        const swell = this.noise.noise3D(c * 0.08, r * 0.3, t * 0.25) * 0.5 + 0.5;
        let v = Math.max(0, swell - 0.55) * 0.42 * (1 - depth * 0.3) + Math.abs(h) * 0.35 + spec;
        // Moon path: a broken column of light under the moon, bent by the waves.
        const off = Math.abs(c + 0.5 - mc + gx * 14);
        const widen = pathHalf + depth * 7;
        if (off < widen) {
          const streak = this.noise.noise2D(c * 0.35, r * 1.4 + t * 0.6);
          const k = (1 - off / widen) * (0.5 + 0.5 * streak);
          if (k > 0.15) {
            v += k * 0.7;
            tint[i] = mix(hex('#9fb6e0'), this.moonPath, Math.min(1, k * 1.4));
          }
        }
        field[i] = v;
      }
    }
    renderField(grid, field, { style, lut: this.waterLut, tint, layer: Layer.SKY, threshold: 0.1, minAlpha: style === 'tiles' ? 0.08 : 0.12, alphaGain: style === 'tiles' ? 0.6 : 0.8 });
    // Shoreline reflection of the treeline.
    for (let c = 0; c < cols; c++) {
      const h = this.treeline[c];
      for (let k = 0; k < h; k++) grid.putChar(c, H + 1 + k, k % 2 ? '~' : '≈', hex('#0d1830'), 0.5 - k * 0.1, Layer.FAR);
    }

    // Petals ride the waves.
    for (const p of this.petals) {
      const wobble = Math.sin(p.spin * 2) > 0.85;
      grid.put(Math.floor(p.x), Math.floor(p.y), wobble ? code('✿') : p.glyph, hex('#f9a8c8'), 0.95, Layer.NEAR);
    }

    // Rain streaks and splashes.
    for (const d of this.drops) {
      if (d.y < d.hitY - ch * 1.2) drawLine(grid, d.x, d.y - ch * 0.9, d.x + 3, d.y, hex('#a9c6ee'), 0.55, Layer.FRONT);
    }
    for (const s of this.splashes) {
      const k = s.age / 0.6;
      const r = 0.5 + k * 3;
      const a = 0.8 * (1 - k);
      spot(grid, s.x - r * cw, s.y, code('('), hex('#cfe3ff'), a, Layer.FRONT);
      spot(grid, s.x + r * cw, s.y, code(')'), hex('#cfe3ff'), a, Layer.FRONT);
      if (k < 0.4) spot(grid, s.x, s.y - ch * (1 + k * 2), code("'"), hex('#e6f0ff'), a, Layer.FRONT);
    }

  }
}
