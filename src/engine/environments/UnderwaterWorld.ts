import { BaseEnvironment } from './BaseEnvironment';
import { RenderGrid } from '../core/RenderGrid';
import { MouseState } from '../../types/engine';
import { BoidsSystem } from '../physics/BoidsSystem';
import { SimplexNoise } from '../physics/SimplexNoise';

interface Bubble {
  x: number;
  y: number;
  speed: number;
  radius: number;
  wobbleSpeed: number;
}

interface SeaweedStalk {
  x: number;
  height: number;
  segments: number;
  phase: number;
  amplitude: number;
}

interface Jellyfish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  pulsePhase: number;
  size: number;
  tentacles: { x: number; y: number }[][];
}

export class UnderwaterWorld extends BaseEnvironment {
  public readonly id = 'underwater';
  private boids: BoidsSystem;
  private noise: SimplexNoise;
  private bubbles: Bubble[] = [];
  private seaweed: SeaweedStalk[] = [];
  private jellyfishList: Jellyfish[] = [];

  constructor() {
    super();
    this.boids = new BoidsSystem(45, 800, 600);
    this.noise = new SimplexNoise(42);
  }

  public override init(grid: RenderGrid): void {
    super.init(grid);
    this.boids.resize(this.width, this.height);

    // Initialize rising bubbles
    this.bubbles = [];
    for (let i = 0; i < 35; i++) {
      this.bubbles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        speed: 0.5 + Math.random() * 1.2,
        radius: 0.5 + Math.random() * 1.5,
        wobbleSpeed: 1 + Math.random() * 2,
      });
    }

    // Initialize seabed seaweed stalks
    this.seaweed = [];
    const stalkCount = Math.floor(grid.cols / 3.5);
    for (let i = 0; i < stalkCount; i++) {
      this.seaweed.push({
        x: (i + Math.random() * 0.4) * (grid.cellWidth * 3.5),
        height: 6 + Math.floor(Math.random() * 12), // in grid rows
        segments: 10 + Math.floor(Math.random() * 6),
        phase: Math.random() * Math.PI * 2,
        amplitude: 1.5 + Math.random() * 2.5,
      });
    }

    // Initialize 2-3 graceful jellyfish
    this.jellyfishList = [];
    for (let i = 0; i < 3; i++) {
      const jx = this.width * (0.2 + i * 0.3);
      const jy = this.height * (0.3 + Math.random() * 0.4);
      const tentacles: { x: number; y: number }[][] = [];
      const numTentacles = 5;
      for (let t = 0; t < numTentacles; t++) {
        const chain: { x: number; y: number }[] = [];
        for (let seg = 0; seg < 8; seg++) {
          chain.push({ x: jx + (t - 2) * 6, y: jy + seg * 7 });
        }
        tentacles.push(chain);
      }
      this.jellyfishList.push({
        x: jx,
        y: jy,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.4,
        targetY: jy,
        pulsePhase: Math.random() * Math.PI * 2,
        size: 1.0,
        tentacles,
      });
    }
  }

  public update(deltaTime: number, mouse: MouseState, grid: RenderGrid): void {
    this.time += deltaTime;

    // Update fish boids
    const mouseActive = mouse.x > 0 && mouse.y > 0;
    this.boids.update(deltaTime, mouse.x, mouse.y, mouseActive);

    // Update bubbles
    for (const b of this.bubbles) {
      b.y -= b.speed * deltaTime * 60;
      b.x += Math.sin(this.time * b.wobbleSpeed + b.y * 0.05) * 0.6;
      if (b.y < -10) {
        b.y = this.height + 10;
        b.x = Math.random() * this.width;
      }
    }

    // Update jellyfish
    for (const j of this.jellyfishList) {
      j.pulsePhase += deltaTime * 2.2;
      const pulse = Math.sin(j.pulsePhase);

      // Propulsion upward on expansion
      if (pulse > 0.4) {
        j.vy = -0.9 * pulse;
      } else {
        j.vy += 0.015; // gentle sink
      }

      // Avoid mouse disturbance
      if (mouseActive) {
        const dx = j.x - mouse.x;
        const dy = j.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120 && dist > 0) {
          j.vx += (dx / dist) * 0.3;
          j.vy += (dy / dist) * 0.3;
        }
      }

      j.vx *= 0.96;
      j.vy = Math.max(-1.5, Math.min(0.8, j.vy));
      j.x += j.vx;
      j.y += j.vy;

      // Wrap / bounce boundaries
      if (j.y < 40) j.vy = 0.5;
      if (j.y > this.height - 120) j.vy = -0.7;
      if (j.x < 50) j.x = 50;
      if (j.x > this.width - 50) j.x = this.width - 50;

      // Update tentacle chain kinematics
      for (let t = 0; t < j.tentacles.length; t++) {
        const chain = j.tentacles[t];
        const rootOffset = (t - (j.tentacles.length - 1) / 2) * (7 * grid.cellWidth * 0.1);
        chain[0].x = j.x + rootOffset;
        chain[0].y = j.y + 12;

        for (let seg = 1; seg < chain.length; seg++) {
          const prev = chain[seg - 1];
          const curr = chain[seg];
          const dx = curr.x - prev.x;
          const dy = curr.y - prev.y;
          const targetDist = 7;
          const angle = Math.atan2(dy, dx);
          
          // Fluid drag & sway lag
          const sway = Math.sin(this.time * 2 + seg * 0.6 + t) * 1.2;
          curr.x = prev.x + Math.cos(angle) * targetDist + sway;
          curr.y = prev.y + Math.sin(angle) * targetDist + 1.2; // slight gravity
        }
      }
    }
  }

  public render(grid: RenderGrid): void {
    grid.clear(6, 12, 22, ' '); // Deep oceanic twilight

    // 1. Render ambient light caustics on background
    const stepCols = 2;
    const stepRows = 2;
    for (let r = 0; r < grid.rows; r += stepRows) {
      const yNorm = r / grid.rows;
      for (let c = 0; c < grid.cols; c += stepCols) {
        const n1 = this.noise.noise3D(c * 0.08, r * 0.08, this.time * 0.35);
        const n2 = this.noise.noise3D(c * 0.12, r * 0.12, this.time * 0.2 + 10);
        const caustic = Math.max(0, (n1 + n2) * 0.5);

        if (caustic > 0.45) {
          const intensity = (caustic - 0.45) / 0.55 * (1 - yNorm * 0.65);
          if (intensity > 0.1) {
            const char = intensity > 0.6 ? '~' : '·';
            grid.setCell(
              c,
              r,
              char,
              Math.floor(20 + intensity * 60),
              Math.floor(60 + intensity * 120),
              Math.floor(100 + intensity * 155),
              intensity * 0.5
            );
          }
        }
      }
    }

    // 2. Render Seaweed along bottom rows
    for (const stalk of this.seaweed) {
      const baseCol = Math.floor(stalk.x / grid.cellWidth);
      for (let s = 0; s < stalk.height; s++) {
        const row = grid.rows - 1 - s;
        if (row < 0) break;
        const sNorm = s / stalk.height;
        const swayOffset = Math.sin(this.time * 1.5 + stalk.phase + sNorm * 2.5) * stalk.amplitude * sNorm;
        const col = Math.floor(baseCol + swayOffset);
        const char = s % 2 === 0 ? ')' : '(';
        grid.setCell(col, row, char, 24, Math.floor(140 + sNorm * 80), 90, 0.85);
      }
    }

    // 3. Render Rising Bubbles
    for (const b of this.bubbles) {
      const col = Math.floor(b.x / grid.cellWidth);
      const row = Math.floor(b.y / grid.cellHeight);
      const char = b.radius > 1.2 ? '○' : '°';
      grid.setCell(col, row, char, 160, 230, 255, 0.75);
    }

    // 4. Render Fish Boids
    for (const boid of this.boids.boids) {
      const col = Math.floor(boid.position.x / grid.cellWidth);
      const row = Math.floor(boid.position.y / grid.cellHeight);
      const heading = boid.velocity.heading();

      // Fish shape facing direction
      const isRight = Math.cos(heading) >= 0;
      const tailWiggle = Math.sin(boid.phase) > 0 ? '~' : '-';
      const headChar = isRight ? '>' : '<';
      const bodyChar = '=';

      // Head
      grid.setCell(col, row, headChar, 94, 234, 212, 1.0);
      // Body & Tail
      if (isRight) {
        grid.setCell(col - 1, row, bodyChar, 45, 212, 191, 0.9);
        grid.setCell(col - 2, row, tailWiggle, 20, 184, 166, 0.7);
      } else {
        grid.setCell(col + 1, row, bodyChar, 45, 212, 191, 0.9);
        grid.setCell(col + 2, row, tailWiggle, 20, 184, 166, 0.7);
      }
    }

    // 5. Render Jellyfish
    for (const j of this.jellyfishList) {
      const jCol = Math.floor(j.x / grid.cellWidth);
      const jRow = Math.floor(j.y / grid.cellHeight);
      const pulse = Math.sin(j.pulsePhase);
      const bellWidth = pulse > 0 ? 3 : 2;

      // Bell top dome
      for (let dx = -bellWidth; dx <= bellWidth; dx++) {
        const char = dx === -bellWidth ? '/' : dx === bellWidth ? '\\' : '⌒';
        grid.setCell(jCol + dx, jRow, char, 244, 114, 182, 0.9);
        grid.setCell(jCol + dx, jRow + 1, '░', 236, 72, 153, 0.7);
      }

      // Tentacles
      for (const chain of j.tentacles) {
        for (let seg = 1; seg < chain.length; seg++) {
          const pt = chain[seg];
          const tCol = Math.floor(pt.x / grid.cellWidth);
          const tRow = Math.floor(pt.y / grid.cellHeight);
          const char = seg % 2 === 0 ? '∫' : '≀';
          grid.setCell(tCol, tRow, char, 216, 180, 254, Math.max(0.2, 0.9 - seg * 0.1));
        }
      }
    }
  }
}
