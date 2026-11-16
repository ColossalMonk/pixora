import { FlowBase, Mood } from './FlowBase';
import { WorldContext } from '../../types/environment';
import { SimplexNoise } from '../physics/SimplexNoise';
import { Layer, code } from '../core/RenderGrid';
import { hex } from '../core/Color';
import { ARROWS } from '../core/Charsets';

interface Cell { x: number; y: number; s: number; r: number; vx: number; life: number; }

/**
 * A weather-map wind field: a westerly flow with gentle waves, plus drifting
 * pressure cells (cyclones L spin one way, anticyclones H the other). Short
 * fading streaks and sparse arrows show the wind. A moving pointer stirs a
 * small cell; a click spawns a new storm.
 */
export class WindFlow extends FlowBase {
  public readonly id = 'wind';
  public readonly backdrop = [hex('#061214'), hex('#081a1c'), hex('#071517'), hex('#040b0c')];
  protected moods: Mood[] = [
    [[0, hex('#064e3b')], [0.4, hex('#10b981')], [0.75, hex('#a7f3d0')], [1, hex('#ffffff')]],
    [[0, hex('#0c4a6e')], [0.4, hex('#0ea5e9')], [0.75, hex('#bae6fd')], [1, hex('#ffffff')]],
    [[0, hex('#422006')], [0.4, hex('#eab308')], [0.75, hex('#fef08a')], [1, hex('#ffffff')]],
  ];
  private noise = new SimplexNoise(31);
  private cells: Cell[] = [];

  public init(ctx: WorldContext): void {
    this.setupInk(ctx);
    this.fade = 2.2;
    this.ink = 0.3;
    this.cells = [];
    for (let i = 0; i < 4; i++) this.cells.push(this.newCell(Math.random() * this.cols, Math.random() * this.rowsIso, i % 2 ? 1 : -1));
    this.setupParticles(Math.round(Math.min(1400, ctx.grid.size * 0.06 * ctx.quality)));
  }

  private newCell(x: number, y: number, sign: number): Cell {
    return { x, y, s: sign * (14 + Math.random() * 10), r: 10 + Math.random() * 14, vx: 1 + Math.random() * 2, life: 40 + Math.random() * 40 };
  }

  protected spawn(i: number, randomAge: boolean): void {
    super.spawn(i, randomAge);
    this.life[i] = 1 + Math.random() * 1.5;
    if (randomAge) this.age[i] = Math.random() * this.life[i];
  }

  private stir: Cell | null = null;

  protected velocityAt(x: number, y: number): [number, number] {
    const n = this.noise.noise2D(x * 0.02, this.time * 0.05);
    let vx = 7 + n * 3;
    let vy = Math.sin(x * 0.05 + this.time * 0.2) * 2 + this.noise.noise2D(y * 0.03, this.time * 0.04) * 3;
    const list = this.stir ? [...this.cells, this.stir] : this.cells;
    for (const c of list) {
      const dx = x - c.x;
      const dy = y - c.y;
      const d2 = (dx * dx + dy * dy) / (c.r * c.r);
      if (d2 > 9) continue;
      const k = c.s * Math.exp(-d2) / c.r;
      // Tangential spin plus a little inflow (cyclones) / outflow (anticyclones).
      vx += -dy * k + dx * k * 0.15 * Math.sign(-c.s);
      vy += dx * k + dy * k * 0.15 * Math.sign(-c.s);
    }
    return [vx, vy];
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, grid } = ctx;
    for (const c of input.clicks) {
      this.cells.push(this.newCell(c.x / grid.cellWidth, c.y / grid.cellHeight / grid.aspect, Math.random() < 0.5 ? 1 : -1));
      if (this.cells.length > 7) this.cells.shift();
    }
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const c = this.cells[i];
      c.x += c.vx * dt;
      c.life -= dt;
      if (c.x > this.cols + c.r * 2 || c.life <= 0) this.cells[i] = this.newCell(-c.r, Math.random() * this.rowsIso, Math.random() < 0.5 ? 1 : -1);
    }
    const ptr = this.pointer(ctx);
    const sp = Math.hypot(input.vx, input.vy);
    this.stir = ptr && sp > 80 ? { x: ptr[0], y: ptr[1], s: Math.min(30, sp / 40) * input.intensity, r: 6, vx: 0, life: 1 } : null;
    this.advect(dt, ctx, 3);
    this.fadeInk(dt);
  }

  public render(ctx: WorldContext): void {
    this.renderInk(ctx, 0.08, 0.25, 0.75);
    const { grid } = ctx;
    // Sparse arrows on a coarse lattice.
    for (let r = 2; r < grid.rows; r += 5) {
      for (let c = 3; c < grid.cols; c += 10) {
        const [vx, vy] = this.velocityAt(c, r / grid.aspect);
        const a = Math.atan2(-vy, vx);
        const idx = ((Math.round((a / (Math.PI * 2)) * 8) % 8) + 8) % 8;
        grid.put(c, r, ARROWS[idx], this.lut[200], 0.35, Layer.MID);
      }
    }
    // Pressure labels
    for (const c of this.cells) {
      const col = Math.floor(c.x);
      const row = Math.floor(c.y * grid.aspect);
      grid.putSolid(col, row, code(c.s > 0 ? 'L' : 'H'), hex('#0b1020'), 1, c.s > 0 ? hex('#f87171') : hex('#60a5fa'), 0.85, Layer.FX);
    }
  }
}
