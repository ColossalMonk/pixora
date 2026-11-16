import { FlowBase, Mood } from './FlowBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { hex } from '../core/Color';

interface Pole { x: number; y: number; q: number; ax: number; ay: number; fx: number; fy: number; phase: number; }

/**
 * Magnetic field lines between drifting poles. Particles leave the + poles,
 * follow the field direction and vanish into the − poles, tracing the lines.
 * The pointer is an extra pole; a click flips its charge.
 */
export class MagneticFlow extends FlowBase {
  public readonly id = 'magnetic';
  public readonly backdrop = [hex('#060a18'), hex('#08102a'), hex('#070c1e'), hex('#040712')];
  protected moods: Mood[] = [
    [[0, hex('#0c1a4b')], [0.4, hex('#3b82f6')], [0.75, hex('#93c5fd')], [1, hex('#ffffff')]],
    [[0, hex('#2e1065')], [0.4, hex('#8b5cf6')], [0.75, hex('#e879f9')], [1, hex('#fdf4ff')]],
    [[0, hex('#3b1d06')], [0.4, hex('#f59e0b')], [0.75, hex('#fde68a')], [1, hex('#fffbeb')]],
  ];
  private poles: Pole[] = [];
  private pointerCharge = 1;

  public init(ctx: WorldContext): void {
    this.setupInk(ctx);
    this.fade = 1.3;
    this.ink = 0.16;
    this.poles = [];
    const n = 4;
    for (let i = 0; i < n; i++) {
      this.poles.push({
        x: 0, y: 0, q: i % 2 ? -1 : 1,
        ax: this.cols * (0.18 + Math.random() * 0.2), ay: this.rowsIso * (0.15 + Math.random() * 0.2),
        fx: 0.03 + Math.random() * 0.04, fy: 0.025 + Math.random() * 0.04, phase: Math.random() * 6,
      });
    }
    this.placePoles();
    this.setupParticles(Math.round(Math.min(420, ctx.grid.size * 0.014 * ctx.quality)));
  }

  private placePoles(): void {
    for (const p of this.poles) {
      p.x = this.cols / 2 + Math.cos(this.time * p.fx * 6.28 + p.phase) * p.ax;
      p.y = this.rowsIso / 2 + Math.sin(this.time * p.fy * 6.28 + p.phase * 1.3) * p.ay;
    }
  }

  protected spawn(i: number, randomAge: boolean): void {
    const sources = this.poles.filter((p) => p.q > 0);
    if (!sources.length) return super.spawn(i, randomAge);
    const s = sources[(Math.random() * sources.length) | 0];
    const a = Math.random() * Math.PI * 2;
    this.px[i] = s.x + Math.cos(a) * 1.5;
    this.py[i] = s.y + Math.sin(a) * 1.5;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.life[i] = 6 + Math.random() * 6;
    this.age[i] = randomAge ? Math.random() * this.life[i] : 0;
  }

  private pointerPole: Pole | null = null;

  protected velocityAt(x: number, y: number): [number, number] {
    let bx = 0;
    let by = 0;
    const all = this.pointerPole ? [...this.poles, this.pointerPole] : this.poles;
    for (const p of all) {
      const dx = x - p.x;
      const dy = y - p.y;
      const r2 = dx * dx + dy * dy + 0.5;
      bx += (p.q * dx) / r2;
      by += (p.q * dy) / r2;
    }
    const m = Math.hypot(bx, by) || 1;
    const speed = 16;
    return [(bx / m) * speed, (by / m) * speed];
  }

  protected retire(i: number): boolean {
    const all = this.pointerPole ? [...this.poles, this.pointerPole] : this.poles;
    for (const p of all) if (p.q < 0 && Math.hypot(this.px[i] - p.x, this.py[i] - p.y) < 1.4) return true;
    return false;
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    if (ctx.input.clicks.length) this.pointerCharge *= -1;
    this.placePoles();
    const ptr = this.pointer(ctx);
    this.pointerPole = ptr ? { x: ptr[0], y: ptr[1], q: this.pointerCharge * 1.4, ax: 0, ay: 0, fx: 0, fy: 0, phase: 0 } : null;
    this.advect(dt, ctx, 8);
    this.fadeInk(dt);
  }

  public render(ctx: WorldContext): void {
    this.renderInk(ctx);
    const { grid } = ctx;
    const all = this.pointerPole ? [...this.poles, this.pointerPole] : this.poles;
    for (const p of all) {
      const c = Math.floor(p.x);
      const r = Math.floor(p.y * grid.aspect);
      const pos = p.q > 0;
      grid.putSolid(c, r, code(pos ? '+' : '−'), hex('#0b1020'), 1, pos ? hex('#f87171') : hex('#60a5fa'), 0.95, Layer.FX);
    }
  }
}
