import { BaseEnvironment } from './BaseEnvironment';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { gradientLUT, hex, hash2, mix } from '../core/Color';
import { drawBody, spot } from '../draw/Shapes';
import { strokeFor } from '../core/Charsets';

interface Rock { x: number; y: number; r: number; seed: number; }
interface Petal { x: number; y: number; vx: number; vy: number; landed: number; }

/**
 * A raked-sand garden. Grooves run in straight rows and bend into rings
 * around each rock. Holding the pointer down rakes new grooves along the
 * drag; a click presses a set of rings into the sand. Raked marks slowly
 * settle back into the original pattern.
 */
export class ZenGarden extends BaseEnvironment {
  public readonly id = 'zen-garden';
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#16171b'), hex('#1a1b1f'), hex('#15161a'), hex('#101114')];
  public readonly followsClock = true;
  public readonly backdropDay = [hex('#2a2722'), hex('#2f2b25'), hex('#29261f'), hex('#1f1c17')];

  private rocks: Rock[] = [];
  private rakeAngle = new Float32Array(0);
  private rakeLife = new Float32Array(0);
  private petals: Petal[] = [];
  private lastX = -1;
  private lastY = -1;
  private sand = hex('#e3d4ae');
  private rockLut = gradientLUT([[0, hex('#1f2023')], [0.45, hex('#4b4f57')], [0.8, hex('#8a8f98')], [1, hex('#c3c7cf')]]);
  private mossLut = gradientLUT([[0, hex('#1d3a1f')], [1, hex('#5f8f4e')]]);
  private rockTex = Uint32Array.from(Array.from('.:;%').map(code));

  public init(ctx: WorldContext): void {
    const { grid, width, height } = ctx;
    this.rakeAngle = new Float32Array(grid.size);
    this.rakeLife = new Float32Array(grid.size);
    this.rocks = [];
    // Rocks sit around the edges so the clock and search stay on clean sand.
    const spots = [
      [0.16, 0.3, 1.1], [0.84, 0.26, 0.9], [0.22, 0.76, 0.8], [0.78, 0.72, 1.2], [0.5, 0.88, 0.6],
    ];
    for (const [fx, fy, s] of spots) {
      const r = Math.min(width, height) * 0.075 * s;
      const [x, y] = this.clearOfUI(width * fx, height * fy, r * 1.6, ctx.safe, width, height);
      this.rocks.push({ x, y, r, seed: Math.random() * 10 });
    }
    this.petals = [];
    for (let i = 0; i < 10; i++) this.petals.push(this.newPetal(width, height, true));
  }

  private newPetal(width: number, height: number, anywhere = false): Petal {
    return { x: anywhere ? Math.random() * width : -10, y: Math.random() * height * (anywhere ? 1 : 0.6), vx: 18 + Math.random() * 20, vy: 6 + Math.random() * 8, landed: anywhere ? 3 + Math.random() * 10 : 0 };
  }

  private stamp(grid: WorldContext['grid'], px: number, py: number, angle: number, radius: number): void {
    const c0 = Math.floor(px / grid.cellWidth);
    const r0 = Math.floor(py / grid.cellHeight);
    const rr = Math.ceil(radius * grid.aspect);
    for (let r = r0 - rr; r <= r0 + rr; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
        if (Math.hypot(c - c0, (r - r0) / grid.aspect) > radius) continue;
        const i = r * grid.cols + c;
        this.rakeAngle[i] = angle;
        this.rakeLife[i] = 1;
      }
    }
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { grid, input, width, height } = ctx;

    // Rake while the pointer is held down and moving.
    if (input.down && input.active) {
      if (this.lastX >= 0) {
        const dx = input.x - this.lastX;
        const dy = input.y - this.lastY;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          const a = Math.atan2(dy, dx);
          const steps = Math.ceil(d / grid.cellWidth);
          for (let s = 0; s <= steps; s++) this.stamp(grid, this.lastX + (dx * s) / steps, this.lastY + (dy * s) / steps, a, 3);
        }
      }
      this.lastX = input.x;
      this.lastY = input.y;
    } else {
      this.lastX = -1;
    }
    // Click: press rings into the sand.
    for (const c of input.clicks) {
      for (let ring = 2; ring <= 10; ring += 2) {
        const steps = ring * 8;
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          const px = c.x + Math.cos(a) * ring * grid.cellWidth;
          const py = c.y + Math.sin(a) * ring * grid.cellWidth;
          this.stamp(grid, px, py, a + Math.PI / 2, 0);
        }
      }
    }

    // Raked marks settle back over ~90 seconds.
    const fade = dt / 90;
    for (let i = 0; i < this.rakeLife.length; i++) if (this.rakeLife[i] > 0) this.rakeLife[i] = Math.max(0, this.rakeLife[i] - fade);

    for (const p of this.petals) {
      if (p.landed > 0) {
        p.landed -= dt;
        if (p.landed <= 0) Object.assign(p, this.newPetal(width, height));
        continue;
      }
      p.x += (p.vx + Math.sin(this.time + p.y * 0.02) * 12) * dt;
      p.y += (p.vy + Math.cos(this.time * 1.3 + p.x * 0.01) * 6) * dt;
      if (Math.random() < dt * 0.15 || p.x > width + 10) p.landed = 6 + Math.random() * 10;
    }
  }

  public render(ctx: WorldContext): void {
    const { grid } = ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const groove = mix(this.sand, 0, 0.35);

    // Sand grooves: rows, bending into rings near rocks.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const px = (c + 0.5) * cw;
        const py = (r + 0.5) * ch;
        let glyph = 0;
        let alpha = 0.22;
        // Nearest rock ring?
        let ringed = false;
        for (const rk of this.rocks) {
          const dx = px - rk.x;
          const dy = py - rk.y;
          const d = Math.hypot(dx, dy * 1.0);
          const band = d - rk.r;
          if (band > 0 && band < rk.r * 1.6) {
            const step = ch * 0.9;
            if ((band % step) < step * 0.45) {
              glyph = strokeFor(Math.atan2(dy, dx) + Math.PI / 2);
              alpha = 0.32 * (1 - band / (rk.r * 1.6)) + 0.2;
            }
            ringed = true;
            break;
          }
        }
        if (!ringed && r % 4 === 0) {
          // Straight rows with a gentle wave.
          const wave = Math.sin(c * 0.06 + r * 0.4) * 0.4;
          glyph = wave > 0.25 ? code('~') : code('─');
          alpha = 0.3 + hash2(c, r) * 0.06;
        }
        const life = this.rakeLife[i];
        if (life > 0) {
          glyph = strokeFor(this.rakeAngle[i]);
          alpha = Math.max(alpha, 0.2 + life * 0.45);
        }
        if (glyph) grid.put(c, r, glyph, life > 0 ? mix(groove, this.sand, life) : groove, alpha, Layer.SKY);
      }
    }

    // Rocks with moss.
    for (const rk of this.rocks) {
      const seed = rk.seed;
      drawBody(grid, {
        x: rk.x, y: rk.y, heading: 0, length: rk.r * 2.2, width: rk.r * 1.5,
        sampler: (u, v) => {
          const lump = 1 + Math.sin(Math.atan2(v, u) * 3 + seed) * 0.08;
          const d = Math.hypot(u, v) * 2 / lump;
          if (d > 1) return 0;
          return 0.35 + (-v + 0.5) * 0.45 + (1 - d) * 0.15;
        },
        lut: this.rockLut, texture: this.rockTex, layer: Layer.MID, solid: true,
      });
      // Moss cap
      drawBody(grid, {
        x: rk.x - rk.r * 0.2, y: rk.y - rk.r * 0.35, heading: 0, length: rk.r * 1.1, width: rk.r * 0.5,
        sampler: (u, v) => (Math.hypot(u, v * 1.3) < 0.5 && Math.sin(u * 20 + seed) > -0.6 ? 0.4 + (-v) * 0.6 : 0),
        lut: this.mossLut, texture: this.rockTex, layer: Layer.NEAR, solid: true,
      });
    }

    for (const p of this.petals) {
      const a = p.landed > 0 ? Math.min(1, p.landed / 3) * 0.85 : 0.95;
      spot(grid, p.x, p.y, code(p.landed > 0 ? '❀' : '✿'), hex('#f9a8d4'), a, Layer.FX);
    }
  }
}
