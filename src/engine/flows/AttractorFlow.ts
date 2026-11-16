import { FlowBase, Mood } from './FlowBase';
import { WorldContext } from '../../types/environment';
import { hex } from '../core/Color';

/**
 * A Clifford strange attractor,
 *   x' = sin(a·y) + c·cos(a·x),   y' = sin(b·x) + d·cos(b·y),
 * built up from thousands of points a frame into the fading dot buffer. The
 * four parameters drift slowly so the shape breathes and morphs; the pointer
 * bends them; a click glides to a new random shape.
 */
export class AttractorFlow extends FlowBase {
  public readonly id = 'attractor';
  public readonly backdrop = [hex('#0c0812'), hex('#120a18'), hex('#0e0814'), hex('#07040b')];
  protected moods: Mood[] = [
    [[0, hex('#3b1d06')], [0.35, hex('#f59e0b')], [0.7, hex('#fde68a')], [1, hex('#fffbeb')]],
    [[0, hex('#3b0764')], [0.35, hex('#d946ef')], [0.7, hex('#f5d0fe')], [1, hex('#ffffff')]],
    [[0, hex('#082f49')], [0.35, hex('#06b6d4')], [0.7, hex('#a5f3fc')], [1, hex('#ffffff')]],
  ];
  private walkers = new Float32Array(0);
  private p = [-1.4, 1.6, 1.0, 0.7];
  private target = [-1.4, 1.6, 1.0, 0.7];
  private base = [-1.4, 1.6, 1.0, 0.7];
  private iterations = 6000;

  public init(ctx: WorldContext): void {
    this.setupInk(ctx);
    this.fade = 1.6;
    this.walkers = new Float32Array(400);
    for (let i = 0; i < this.walkers.length; i++) this.walkers[i] = Math.random() * 2 - 1;
    this.iterations = Math.round(6000 * ctx.quality);
  }

  private reshape(): void {
    const presets = [
      [-1.4, 1.6, 1.0, 0.7],
      [1.7, 1.7, 0.6, 1.2],
      [-1.7, 1.3, -0.1, -1.21],
      [-1.8, -2.0, -0.5, -0.9],
      [1.5, -1.8, 1.6, 0.9],
      [-1.24, -1.25, -1.81, -1.91],
    ];
    const pick = presets[(Math.random() * presets.length) | 0];
    this.base = pick.map((v) => v + (Math.random() - 0.5) * 0.15);
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    if (ctx.input.clicks.length) this.reshape();
    const ptr = this.pointer(ctx);
    const px = ptr ? ptr[0] / this.cols - 0.5 : 0;
    const py = ptr ? ptr[1] / this.rowsIso - 0.5 : 0;
    for (let k = 0; k < 4; k++) {
      const drift = Math.sin(this.time * (0.05 + k * 0.013) + k * 1.7) * 0.12;
      const bend = (k % 2 ? py : px) * 0.2 * ctx.input.intensity;
      this.target[k] = this.base[k] + drift + bend;
      this.p[k] += (this.target[k] - this.p[k]) * Math.min(1, dt * 0.8);
    }
    const [a, b, c, d] = this.p;
    // Fit the attractor's ~[-1-|c|, 1+|c|] range into the screen, aspect-correct.
    const sx = Math.max(1 + Math.abs(c), 0.5);
    const sy = Math.max(1 + Math.abs(d), 0.5);
    const scale = Math.min((this.dotW * 0.46) / sx, (this.dotH * 0.46) / sy / (this.aspect * 2)) ;
    const cx = this.dotW / 2;
    const cy = this.dotH / 2;
    const w = this.walkers;
    const per = Math.max(1, Math.floor(this.iterations / (w.length / 2)));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let j = 0; j < w.length; j += 2) {
      let x = w[j];
      let y = w[j + 1];
      for (let i = 0; i < per; i++) {
        const nx = Math.sin(a * y) + c * Math.cos(a * x);
        const ny = Math.sin(b * x) + d * Math.cos(b * y);
        x = nx;
        y = ny;
        this.plot(cx + x * scale, cy + y * scale * this.aspect * 2, 0.018);
      }
      w[j] = x;
      w[j + 1] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // Some parameter sets collapse to a fixed point or a tiny cycle: steer back to a known chaotic shape.
    if (maxX - minX < 0.3 || maxY - minY < 0.3) {
      this.base = [-1.4, 1.6, 1.0, 0.7];
      for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    }
    this.fadeInk(dt);
    // Too few lit dots for a while (a thin cycle): glide back to the default shape.
    let lit = 0;
    const ink = this.dots;
    for (let i = 0; i < ink.length; i += 4) if (ink[i] > 0.22) lit++;
    this.sparse = lit * 4 < ink.length * 0.012 ? this.sparse + dt : 0;
    if (this.sparse > 1.5) {
      this.sparse = 0;
      this.base = [-1.4, 1.6, 1.0, 0.7];
    }
  }

  private sparse = 0;

  public render(ctx: WorldContext): void {
    this.renderInk(ctx, 0.22, 0.2, 0.8);
  }
}
