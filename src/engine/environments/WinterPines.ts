import { BaseEnvironment } from './BaseEnvironment';
import { Habitat, WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { hex, hash2, mix } from '../core/Color';

interface Flake { x: number; y: number; z: number; drift: number; }
interface Pine { x: number; base: number; h: number; layer: number; }

/**
 * Snow over pine ridges at night. Flakes fall in three depth layers (size,
 * speed and brightness by depth), drift on a slow wind, and the pointer acts
 * as a gust. Snow that lands builds up on the ground, column by column, then
 * slowly settles so it never buries the scene.
 */
export class WinterPines extends BaseEnvironment {
  public readonly id = 'winter-pines';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#0a1124'), hex('#111b36'), hex('#18264a'), hex('#0c1428')];
  public readonly followsClock = true;
  public readonly backdropDay = [hex('#4a6a92'), hex('#6684a8'), hex('#8aa3c0'), hex('#3b4f6b')];

  private noise = new SimplexNoise(12);
  private flakes: Flake[] = [];
  private pines: Pine[] = [];
  private ridgeFar = new Int16Array(0);
  private ridgeNear = new Int16Array(0);
  private drift = new Float32Array(0); // snow depth per column (rows)
  private groundRow = 0;
  private gust = 0;
  private gustDir = 1;

  private skyPx = 0;

  /** Open sky above the far ridge. */
  public habitat(width: number, height: number): Habitat {
    return { top: 0, bottom: height, left: 0, right: width, skyBottom: this.skyPx };
  }

  public init(ctx: WorldContext): void {
    const { grid, width, height, quality } = ctx;
    const area = (width * height) / (1440 * 900);
    this.groundRow = grid.rows - Math.max(2, Math.round(grid.rows * 0.06));
    this.ridgeFar = new Int16Array(grid.cols);
    this.ridgeNear = new Int16Array(grid.cols);
    for (let c = 0; c < grid.cols; c++) {
      const f = 1 - Math.abs(this.noise.noise2D(c * 0.02, 3));
      const n = this.noise.noise2D(c * 0.03, 9) * 0.5 + 0.5;
      this.ridgeFar[c] = Math.round(grid.rows * 0.62 - Math.pow(f, 1.5) * grid.rows * 0.22);
      this.ridgeNear[c] = Math.round(grid.rows * 0.8 - n * grid.rows * 0.08);
    }
    this.skyPx = Math.min(...Array.from(this.ridgeFar)) * grid.cellHeight;
    this.drift = new Float32Array(grid.cols);
    this.pines = [];
    for (let x = 0; x < width; x += 26 + Math.random() * 40) {
      const c = Math.min(grid.cols - 1, Math.floor(x / grid.cellWidth));
      const near = Math.random() < 0.45;
      const baseRow = near ? this.ridgeNear[c] + 1 : this.ridgeFar[c] + 2;
      this.pines.push({ x, base: baseRow, h: Math.round((near ? 6 : 3) + Math.random() * (near ? 6 : 3)), layer: near ? 1 : 0 });
    }
    this.flakes = [];
    const n = Math.round(260 * area * quality);
    for (let i = 0; i < n; i++) this.flakes.push({ x: Math.random() * width, y: Math.random() * height, z: Math.random(), drift: Math.random() * 6 });
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, width, height, grid } = ctx;
    for (const c of input.clicks) {
      this.gust = 1;
      this.gustDir = c.x < width / 2 ? 1 : -1;
    }
    let pointerWind = 0;
    if (input.active) pointerWind = Math.max(-1, Math.min(1, input.vx / 900)) * input.intensity;
    this.gust = Math.max(0, this.gust - dt * 0.5);
    const wind = Math.sin(this.time * 0.15) * 25 + this.gust * this.gustDir * 260 + pointerWind * 220;

    for (const f of this.flakes) {
      const speed = 25 + f.z * 55;
      f.x += (wind * (0.4 + f.z * 0.6) + Math.sin(this.time * 0.9 + f.drift) * 14) * dt;
      f.y += speed * dt;
      // Swirl near a moving pointer.
      if (input.active) {
        const dx = f.x - input.x;
        const dy = f.y - input.y;
        const d = Math.hypot(dx, dy);
        if (d < 80 && d > 1) {
          f.x += (dx / d) * 60 * dt * input.intensity;
          f.y += (dy / d) * 30 * dt * input.intensity;
        }
      }
      if (f.x < -10) f.x += width + 20;
      if (f.x > width + 10) f.x -= width + 20;
      const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(f.x / grid.cellWidth)));
      const landRow = this.groundRow - this.drift[c];
      if (f.z > 0.6 && f.y / grid.cellHeight >= landRow) {
        this.drift[c] = Math.min(3, this.drift[c] + 0.04);
        f.y = -5;
        f.x = Math.random() * width;
      } else if (f.y > height + 5) {
        f.y = -5;
        f.x = Math.random() * width;
      }
    }
    // Settle and smooth the snow cover.
    for (let c = 1; c < grid.cols - 1; c++) {
      const avg = (this.drift[c - 1] + this.drift[c + 1]) / 2;
      this.drift[c] += (avg - this.drift[c]) * dt * 0.6;
      this.drift[c] = Math.max(0.6, this.drift[c] - dt * 0.012);
    }
  }

  public render(ctx: WorldContext): void {
    const { grid } = ctx;
    const cols = grid.cols;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const t = this.time;

    // Moon
    const mc = cols * 0.18;
    const mr = grid.rows * 0.16;
    const rad = 4.5;
    for (let r = Math.floor(mr - rad * grid.aspect - 2); r <= mr + rad * grid.aspect + 2; r++) {
      for (let c = Math.floor(mc - rad - 2); c <= mc + rad + 2; c++) {
        const d = Math.hypot(c - mc, (r - mr) / grid.aspect);
        if (d < rad) grid.putSolid(c, r, 0, 0, 0, ctx.sky.light > 0.5 ? hex('#fef3c7') : d > rad - 0.8 ? hex('#cbd5e1') : hex('#e2e8f0'), 0.95, Layer.SKY);
        else if (d < rad + 2.5) grid.putSolid(c, r, 0, 0, 0, hex('#cbd5e1'), (1 - (d - rad) / 2.5) * 0.08, Layer.SKY);
      }
    }

    // Ridges: snowy far ridge, dark near ridge.
    for (let c = 0; c < cols; c++) {
      const fr = this.ridgeFar[c];
      for (let r = Math.max(0, fr); r < grid.rows; r++) {
        const top = r - fr < 2;
        grid.putSolid(c, r, top && hash2(c, r) > 0.6 ? code('.') : 0, hex('#94a3b8'), 0.5, top ? hex('#9fb2cf') : mix(hex('#2b3a5c'), hex('#1b2643'), (r - fr) / 10), top ? 0.55 : 1, Layer.FAR);
      }
      const nr = this.ridgeNear[c];
      for (let r = Math.max(0, nr); r < grid.rows; r++) {
        grid.putSolid(c, r, 0, 0, 0, r - nr < 1 ? hex('#c7d2e4') : hex('#141d33'), r - nr < 1 ? 0.75 : 1, Layer.MID);
      }
    }

    // Pines with snow on the boughs.
    for (const p of this.pines) {
      const c0 = Math.floor(p.x / cw);
      const layer = p.layer ? Layer.NEAR : Layer.FAR;
      const dark = p.layer ? hex('#0b1a17') : hex('#1c2c3f');
      const green = p.layer ? hex('#14352c') : hex('#22374a');
      for (let k = 0; k < p.h; k++) {
        const r = p.base - 1 - k;
        const tier = (p.h - k) / p.h;
        const half = Math.max(0, Math.round(tier * (p.h * 0.45) * (0.75 + 0.25 * ((k % 3) / 2))));
        for (let dc = -half; dc <= half; dc++) {
          const edge = Math.abs(dc) === half;
          const snow = (k % 3 === 2 && !edge) || (edge && hash2(c0 + dc, r) > 0.5);
          grid.putSolid(c0 + dc, r, edge ? code(dc < 0 ? '/' : '\\') : 0, hex('#e2e8f0'), 0.6, snow ? hex('#dbe4f0') : edge ? dark : green, snow ? 0.85 : 1, layer);
        }
      }
      grid.putSolid(c0, p.base - 1 - p.h, code('*'), hex('#e2e8f0'), 0.7, green, 1, layer);
      grid.putSolid(c0, p.base - 1 + 1, 0, 0, 0, hex('#2a1f17'), 1, layer);
    }

    // Snow cover on the ground.
    for (let c = 0; c < cols; c++) {
      const top = this.groundRow - this.drift[c];
      for (let r = Math.floor(top); r < grid.rows; r++) {
        const edge = r === Math.floor(top);
        grid.putSolid(c, r, edge && hash2(c, 7) > 0.7 ? code('°') : 0, hex('#94a3b8'), 0.5, edge ? hex('#e8eef7') : hex('#cbd5e1'), edge ? 0.95 : 0.85, Layer.FRONT);
      }
    }

    // Flakes by depth: far = dim dot, mid = ·, near = * tile.
    for (const f of this.flakes) {
      const c = Math.floor(f.x / cw);
      const r = Math.floor(f.y / ch);
      if (f.z > 0.82) grid.putSolid(c, r, code('*'), hex('#94a3b8'), 0.8, hex('#f1f5f9'), 0.9, Layer.FX);
      else if (f.z > 0.45) grid.putChar(c, r, '•', hex('#e2e8f0'), 0.75, Layer.FX);
      else grid.putChar(c, r, '·', hex('#cbd5e1'), 0.35 + f.z * 0.4, Layer.NEAR);
    }
    void t;
  }
}
