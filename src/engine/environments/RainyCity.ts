import { BaseEnvironment } from './BaseEnvironment';
import { Habitat, WorldContext } from '../../types/environment';
import { EnergyField } from '../physics/EnergyField';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, hash2, mix } from '../core/Color';
import { renderField } from '../draw/Field';
import { drawLine, spot } from '../draw/Shapes';

interface Building { c0: number; c1: number; top: number; far: boolean; seed: number; }
interface Streak { x: number; y: number; v: number; near: boolean; }
interface Drop { x: number; y: number; size: number; sliding: boolean; vy: number; }

/**
 * A city at night seen through a rainy window. Rain streaks fall past lit
 * windows; drops bead on the glass, grow, and slide down leaving trails.
 * Dragging across the glass wipes it clear; clicking calls lightning.
 */
export class RainyCity extends BaseEnvironment {
  public readonly id = 'rainy-city';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#0a0f1f'), hex('#111830'), hex('#1a2038'), hex('#0c101d')];
  public readonly followsClock = true;
  public readonly backdropDay = [hex('#3b4a63'), hex('#4b5a73'), hex('#56657c'), hex('#2a3446')];

  private buildings: Building[] = [];
  private streaks: Streak[] = [];
  private drops: Drop[] = [];
  private trails = new EnergyField();
  private flash = 0;
  private bolt: [number, number][] = [];
  private nextBolt = 25;
  private trailLut = gradientLUT([[0, hex('#1e293b')], [1, hex('#94a3b8')]]);

  private skyPx = 0;

  /** Sky above the rooftops. */
  public habitat(width: number, height: number): Habitat {
    return { top: 0, bottom: height, left: 0, right: width, skyBottom: this.skyPx };
  }

  public init(ctx: WorldContext): void {
    const { grid, width, height, quality } = ctx;
    const area = (width * height) / (1440 * 900);
    this.trails.resize(grid.cols, grid.rows, grid.aspect);
    this.buildings = [];
    for (const far of [true, false]) {
      let c = -2;
      while (c < grid.cols) {
        const w = far ? 4 + Math.floor(Math.random() * 6) : 6 + Math.floor(Math.random() * 9);
        const hFrac = far ? 0.3 + Math.random() * 0.3 : 0.18 + Math.random() * 0.32;
        // Keep the very centre lower so the clock sits on sky.
        const centre = Math.abs(c + w / 2 - grid.cols / 2) < grid.cols * 0.16;
        const top = Math.round(grid.rows * (1 - hFrac * (centre ? 0.6 : 1)));
        this.buildings.push({ c0: c, c1: c + w - 1, top, far, seed: Math.random() * 1000 });
        c += w + (far ? 0 : Math.floor(Math.random() * 3));
      }
    }
    this.skyPx = Math.min(...this.buildings.map((b) => b.top)) * grid.cellHeight;
    this.streaks = [];
    const ns = Math.round(160 * area * quality);
    for (let i = 0; i < ns; i++) this.streaks.push({ x: Math.random() * width, y: Math.random() * height, v: 600 + Math.random() * 500, near: Math.random() < 0.3 });
    this.drops = [];
    for (let i = 0; i < 70 * area; i++) this.drops.push(this.newDrop(width, height));
  }

  private newDrop(width: number, height: number): Drop {
    return { x: Math.random() * width, y: Math.random() * height, size: Math.random() * 0.5, sliding: false, vy: 0 };
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, width, height, grid } = ctx;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;

    this.nextBolt -= dt;
    if (input.clicks.length || this.nextBolt <= 0) {
      this.flash = 1;
      this.nextBolt = ctx.weather === 'storm' ? 6 + Math.random() * 8 : 25 + Math.random() * 30;
      const x0 = input.clicks.length ? input.clicks[0].x : Math.random() * width;
      this.bolt = [[x0, 0]];
      let x = x0;
      for (let y = 0; y < height * 0.55; y += ch * 1.5) {
        x += (Math.random() - 0.5) * cw * 6;
        this.bolt.push([x, y]);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);

    for (const s of this.streaks) {
      s.y += s.v * dt;
      s.x += s.v * 0.18 * dt;
      if (s.y > height) {
        s.y = -20;
        s.x = Math.random() * (width + 200) - 200;
      }
    }

    // Wipe the glass along a moving pointer.
    const wiping = input.active && Math.hypot(input.vx, input.vy) > 120;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (wiping && Math.hypot(d.x - input.x, d.y - input.y) < 70 * Math.max(0.5, input.intensity)) {
        this.drops[i] = this.newDrop(width, height);
        this.drops[i].size = 0;
        continue;
      }
      if (!d.sliding) {
        d.size += dt * 0.025;
        if (d.size > 1) {
          d.sliding = true;
          d.vy = 30;
        }
      } else {
        d.vy = Math.min(220, d.vy + 160 * dt);
        d.y += d.vy * dt;
        d.x += Math.sin(d.y * 0.05) * 6 * dt;
        this.trails.add(d.x / cw, d.y / ch, 0.5);
        if (d.y > height + 10) this.drops[i] = this.newDrop(width, height);
      }
    }
    if (wiping) this.trails.stamp(input.x / cw, input.y / ch, 6, -1);
    for (let i = 0; i < this.trails.values.length; i++) if (this.trails.values[i] < 0) this.trails.values[i] = 0;
    this.trails.step(dt, 0.35, false);
  }

  public render(ctx: WorldContext): void {
    const { grid, style } = ctx;
    const ch = grid.cellHeight;
    const t = this.time;
    const flash = this.flash;

    // Lightning bolt + sky flash.
    if (flash > 0.05) {
      for (let r = 0; r < grid.rows * 0.6; r++) {
        for (let c = 0; c < grid.cols; c += 1) grid.putBg(c, r, hex('#c7d2fe'), flash * 0.12, Layer.SKY);
      }
      for (let k = 1; k < this.bolt.length; k++) {
        drawLine(grid, this.bolt[k - 1][0], this.bolt[k - 1][1], this.bolt[k][0], this.bolt[k][1], hex('#eef2ff'), flash, Layer.FAR);
      }
    }

    // Buildings with windows.
    for (const b of this.buildings) {
      const layer = b.far ? Layer.FAR : Layer.MID;
      const wall = b.far ? mix(hex('#1e2a44'), hex('#c7d2fe'), flash * 0.25) : mix(hex('#0d1322'), hex('#c7d2fe'), flash * 0.15);
      for (let r = b.top; r < grid.rows; r++) {
        for (let c = b.c0; c <= b.c1; c++) {
          const wx = c - b.c0;
          const wy = r - b.top;
          const isWindow = wx % 2 === 1 && wy % 2 === 1 && c < b.c1 && r < grid.rows - 1;
          let fill = wall;
          let a = 1;
          if (isWindow) {
            const h = hash2(c + Math.floor(b.seed), r);
            // A few windows switch on/off over time.
            const flicker = hash2(c * 3 + Math.floor(t / 7), r) > 0.97;
            const lit = (h > (b.far ? 0.55 : 0.62) + ctx.sky.light * 0.32) !== flicker;
            if (lit) {
              fill = h > 0.9 ? hex('#bfdbfe') : mix(hex('#fbbf24'), hex('#fde68a'), h);
              a = b.far ? 0.55 : 0.85;
            }
          }
          grid.putSolid(c, r, 0, 0, 0, fill, a, layer);
        }
      }
      // Rooftop antenna light
      if (!b.far && hash2(b.c0, 3) > 0.7) {
        const blink = Math.sin(t * 2 + b.seed) > 0.6;
        grid.putChar(Math.floor((b.c0 + b.c1) / 2), b.top - 1, '|', hex('#475569'), 0.8, layer);
        if (blink) grid.putSolid(Math.floor((b.c0 + b.c1) / 2), b.top - 2, 0, 0, 0, hex('#ef4444'), 0.9, layer);
      }
    }

    // Rain streaks
    for (const s of this.streaks) {
      const len = s.near ? 2.2 : 1.2;
      drawLine(grid, s.x, s.y, s.x + ch * len * 0.18, s.y + ch * len, s.near ? hex('#cbd5e1') : hex('#64748b'), s.near ? 0.55 : 0.35, s.near ? Layer.NEAR : Layer.FAR);
    }

    // Trails and drops on the glass.
    renderField(grid, this.trails.values, { style, lut: this.trailLut, layer: Layer.FRONT, threshold: 0.12, minAlpha: 0.05, alphaGain: 0.25 });
    for (const d of this.drops) {
      if (d.size < 0.2) continue;
      const g = d.sliding ? 'o' : d.size > 0.7 ? 'o' : d.size > 0.45 ? '°' : '·';
      spot(grid, d.x, d.y, code(g), hex('#e2e8f0'), 0.35 + d.size * 0.5, Layer.FX);
    }
  }
}
