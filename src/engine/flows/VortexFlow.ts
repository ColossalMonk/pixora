import { FlowBase, Mood } from './FlowBase';
import { WorldContext } from '../../types/environment';
import { Layer, code } from '../core/RenderGrid';
import { hex, mix } from '../core/Color';

interface Vortex { x: number; y: number; g: number; core: number; }
interface Post { x: number; y: number; r: number; timer: number; side: number; }

/**
 * A von Kármán vortex street: a steady current flows past round posts, which
 * shed swirls alternately from top and bottom. Each swirl is a point vortex
 * (with a soft core) that drifts downstream and weakens. Particles entering
 * from the left trace the flow. Moving the pointer sheds swirls behind it;
 * a click plants a new post.
 */
export class VortexFlow extends FlowBase {
  public readonly id = 'vortex';
  public readonly backdrop = [hex('#050b14'), hex('#07101c'), hex('#060d17'), hex('#03070c')];
  protected moods: Mood[] = [
    [[0, hex('#1e1b4b')], [0.4, hex('#818cf8')], [0.75, hex('#c7d2fe')], [1, hex('#ffffff')]],
    [[0, hex('#083344')], [0.4, hex('#22d3ee')], [0.75, hex('#cffafe')], [1, hex('#ffffff')]],
    [[0, hex('#4a044e')], [0.4, hex('#e879f9')], [0.75, hex('#fae8ff')], [1, hex('#ffffff')]],
  ];
  private vortices: Vortex[] = [];
  private posts: Post[] = [];
  private flow = 9;
  private lastPtr: [number, number] | null = null;
  private shedSide = 1;
  private shedDist = 0;

  public init(ctx: WorldContext): void {
    this.setupInk(ctx);
    this.fade = 0.7;
    this.vortices = [];
    this.posts = [{ x: this.cols * 0.14, y: this.rowsIso * 0.5, r: 2.2, timer: 0, side: 1 }];
    this.setupParticles(Math.round(Math.min(700, ctx.grid.size * 0.026 * ctx.quality)));
  }

  protected spawn(i: number, randomAge: boolean): void {
    // Inflow from the left edge (and anywhere at start-up).
    this.px[i] = randomAge ? Math.random() * this.cols : Math.random() * 2;
    // Most particles enter in a band around a post so the wake is the focus.
    const post = this.posts[(Math.random() * this.posts.length) | 0];
    this.py[i] = post && Math.random() < 0.75 ? post.y + (Math.random() - 0.5) * this.rowsIso * 0.35 : Math.random() * this.rowsIso;
    if (post && !randomAge && Math.random() < 0.75) this.px[i] = Math.max(0, post.x - 6 - Math.random() * 4);
    this.vx[i] = this.flow;
    this.vy[i] = 0;
    this.life[i] = 20;
    this.age[i] = 0;
  }

  protected velocityAt(x: number, y: number): [number, number] {
    let vx = this.flow;
    let vy = 0;
    for (const v of this.vortices) {
      const dx = x - v.x;
      const dy = y - v.y;
      const k = v.g / (dx * dx + dy * dy + v.core * v.core);
      vx += -dy * k;
      vy += dx * k;
    }
    // Flow around posts (potential flow past a cylinder, roughly).
    for (const p of this.posts) {
      const dx = x - p.x;
      const dy = y - p.y;
      const r2 = dx * dx + dy * dy;
      const R2 = p.r * p.r;
      if (r2 < R2 * 16) {
        const f = R2 / Math.max(r2, R2);
        vx -= this.flow * f * ((dx * dx - dy * dy) / Math.max(r2, 0.01));
        vy -= this.flow * f * ((2 * dx * dy) / Math.max(r2, 0.01));
      }
    }
    return [vx, vy];
  }

  protected retire(i: number): boolean {
    for (const p of this.posts) if (Math.hypot(this.px[i] - p.x, this.py[i] - p.y) < p.r * 0.9) return true;
    return false;
  }

  public update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const { input, grid } = ctx;
    for (const c of input.clicks) {
      this.posts.push({ x: c.x / grid.cellWidth, y: c.y / grid.cellHeight / grid.aspect, r: 1.8 + Math.random(), timer: 0, side: 1 });
      if (this.posts.length > 4) this.posts.shift();
    }
    // Posts shed alternately at the Strouhal-ish rate.
    for (const p of this.posts) {
      p.timer += dt;
      const period = (p.r * 2 * 5) / this.flow;
      if (p.timer > period) {
        p.timer = 0;
        p.side *= -1;
        this.vortices.push({ x: p.x + p.r * 1.3, y: p.y + p.side * p.r * 0.7, g: -p.side * this.flow * p.r * 2.2, core: p.r * 0.8 });
      }
    }
    // The pointer sheds swirls as it moves, alternating sides.
    const ptr = this.pointer(ctx);
    if (ptr && this.lastPtr) {
      const dx = ptr[0] - this.lastPtr[0];
      const dy = ptr[1] - this.lastPtr[1];
      const d = Math.hypot(dx, dy);
      this.shedDist += d;
      if (this.shedDist > 4 && d > 0.05) {
        this.shedDist = 0;
        this.shedSide *= -1;
        const nx = -dy / d;
        const ny = dx / d;
        this.vortices.push({ x: ptr[0] + nx * this.shedSide * 1.5, y: ptr[1] + ny * this.shedSide * 1.5, g: this.shedSide * Math.min(40, d * 25) * input.intensity, core: 1.6 });
      }
    }
    this.lastPtr = ptr;

    // Vortices drift with the flow (minus their own spin) and weaken.
    for (const v of this.vortices) {
      let vx = this.flow * 0.85;
      let vy = 0;
      for (const o of this.vortices) {
        if (o === v) continue;
        const dx = v.x - o.x;
        const dy = v.y - o.y;
        const k = o.g / (dx * dx + dy * dy + o.core * o.core);
        vx += -dy * k;
        vy += dx * k;
      }
      v.x += vx * dt;
      v.y += vy * dt;
      v.g *= Math.exp(-dt * 0.06);
    }
    this.vortices = this.vortices.filter((v) => v.x < this.cols + 10 && Math.abs(v.g) > 0.5).slice(-60);

    this.advect(dt, ctx, 6);
    this.fadeInk(dt);
  }

  public render(ctx: WorldContext): void {
    this.renderInk(ctx);
    const { grid } = ctx;
    for (const p of this.posts) {
      const cr = Math.ceil(p.r);
      for (let dy = -cr; dy <= cr; dy++) {
        for (let dx = -cr; dx <= cr; dx++) {
          if (dx * dx + dy * dy > p.r * p.r) continue;
          const c = Math.floor(p.x + dx);
          const r = Math.floor((p.y + dy) * grid.aspect);
          grid.putSolid(c, r, dx === 0 && dy === 0 ? code('●') : 0, hex('#0b1020'), 1, mix(hex('#334155'), hex('#94a3b8'), (dy + cr) / (2 * cr)), 0.9, Layer.FX);
        }
      }
    }
  }
}
