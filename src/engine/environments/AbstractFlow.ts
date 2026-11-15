import { BaseEnvironment } from './BaseEnvironment';
import { RenderGrid } from '../core/RenderGrid';
import { MouseState } from '../../types/engine';
import { SimplexNoise } from '../physics/SimplexNoise';
import { CHARSETS } from '../core/Charsets';

interface FlowParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  age: number;
  maxAge: number;
}

export class AbstractFlow extends BaseEnvironment {
  public readonly id = 'abstract-flow';
  private noise: SimplexNoise;
  private particles: FlowParticle[] = [];

  constructor() {
    super();
    this.noise = new SimplexNoise(999);
  }

  public override init(grid: RenderGrid): void {
    super.init(grid);
    this.particles = [];
    const count = Math.floor(grid.cols * grid.rows * 0.12);
    for (let i = 0; i < count; i++) {
      this.particles.push(this.spawnParticle(grid));
    }
  }

  private spawnParticle(grid: RenderGrid): FlowParticle {
    return {
      x: Math.random() * grid.cols,
      y: Math.random() * grid.rows,
      vx: 0,
      vy: 0,
      speed: 0.8 + Math.random() * 1.2,
      age: Math.random() * 60,
      maxAge: 60 + Math.random() * 120,
    };
  }

  public update(deltaTime: number, mouse: MouseState, grid: RenderGrid): void {
    this.time += deltaTime * 0.4;
    const mCol = mouse.x / grid.cellWidth;
    const mRow = mouse.y / grid.cellHeight;
    const mouseActive = mouse.x > 0 && mouse.y > 0;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age += deltaTime * 30;

      // Calculate flow angle via 2D Perlin/Simplex Curl Noise
      const scale = 0.07;
      const angle = this.noise.noise3D(p.x * scale, p.y * scale, this.time * 0.5) * Math.PI * 2.5;

      let targetVx = Math.cos(angle) * p.speed;
      let targetVy = Math.sin(angle) * p.speed;

      // Mouse vortex attractor
      if (mouseActive) {
        const dx = mCol - p.x;
        const dy = mRow - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 18 && dist > 0.5) {
          // Tangential swirl force + inward pull
          const tangentX = -dy / dist;
          const tangentY = dx / dist;
          const pull = (1 - dist / 18) * 1.5;
          targetVx += (tangentX * 2.0 + (dx / dist) * 0.5) * pull;
          targetVy += (tangentY * 2.0 + (dy / dist) * 0.5) * pull;
        }
      }

      p.vx += (targetVx - p.vx) * 0.15;
      p.vy += (targetVy - p.vy) * 0.15;
      p.x += p.vx;
      p.y += p.vy;

      // Respawn if out of bounds or expired
      if (p.x < 0 || p.x >= grid.cols || p.y < 0 || p.y >= grid.rows || p.age > p.maxAge) {
        this.particles[i] = this.spawnParticle(grid);
      }
    }
  }

  public render(grid: RenderGrid): void {
    grid.clear(8, 8, 12, ' ');

    const dirRamp = CHARSETS['directional']; // ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘', '·']

    for (const p of this.particles) {
      const col = Math.floor(p.x);
      const row = Math.floor(p.y);
      if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;

      const angle = Math.atan2(p.vy, p.vx);
      // Map [-PI..PI] to 8-direction index
      let dirIdx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8;
      // Directional character
      const char = dirRamp[dirIdx] || '·';

      const lifeFactor = Math.sin((p.age / p.maxAge) * Math.PI);
      const intensity = Math.min(1.0, (Math.hypot(p.vx, p.vy) / 2.0) * lifeFactor);

      // Cybernetic gradient: cyan -> magenta
      const r = Math.floor(60 + (col / grid.cols) * 180 * intensity);
      const g = Math.floor(180 + (row / grid.rows) * 70 * intensity);
      const b = 255;

      grid.setCell(col, row, char, r, g, b, Math.max(0.3, intensity));
    }
  }
}
