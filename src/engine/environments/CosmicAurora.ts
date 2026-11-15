import { BaseEnvironment } from './BaseEnvironment';
import { RenderGrid } from '../core/RenderGrid';
import { MouseState } from '../../types/engine';
import { SimplexNoise } from '../physics/SimplexNoise';

interface Star {
  x: number; // grid coords
  y: number;
  twinklePhase: number;
  char: string;
}

export class CosmicAurora extends BaseEnvironment {
  public readonly id = 'cosmic-aurora';
  private noise: SimplexNoise;
  private stars: Star[] = [];

  constructor() {
    super();
    this.noise = new SimplexNoise(777);
  }

  public override init(grid: RenderGrid): void {
    super.init(grid);
    this.stars = [];
    const glyphs = ['·', '✦', '✧', '°', '•', '+'];
    for (let i = 0; i < 45; i++) {
      this.stars.push({
        x: Math.floor(Math.random() * grid.cols),
        y: Math.floor(Math.random() * grid.rows),
        twinklePhase: Math.random() * Math.PI * 2,
        char: glyphs[Math.floor(Math.random() * glyphs.length)],
      });
    }
  }

  public update(deltaTime: number, mouse: MouseState, _grid: RenderGrid): void {
    this.time += deltaTime * 0.8;
    for (const star of this.stars) {
      star.twinklePhase += deltaTime * 2.5;
    }
  }

  public render(grid: RenderGrid): void {
    grid.clear(4, 6, 14, ' '); // Deep obsidian cosmos

    // 1. Distant twinkling stars
    for (const s of this.stars) {
      const alpha = 0.3 + 0.6 * (Math.sin(s.twinklePhase) * 0.5 + 0.5);
      grid.setCell(s.x, s.y, s.char, 224, 231, 255, alpha);
    }

    // 2. Multilayer Aurora Borealis Ribbon Curtains
    for (let c = 0; c < grid.cols; c++) {
      const cNorm = c / grid.cols;
      // Evaluate noise curtains
      const n1 = this.noise.noise2D(cNorm * 2.8, this.time * 0.3);
      const n2 = this.noise.noise2D(cNorm * 4.2 + 10, this.time * 0.25);

      const ribbonBase = Math.floor(grid.rows * 0.35 + n1 * (grid.rows * 0.2));
      const ribbonHeight = Math.floor(grid.rows * 0.4 + n2 * (grid.rows * 0.15));

      for (let r = 0; r < ribbonHeight; r++) {
        const row = ribbonBase + r;
        if (row < 0 || row >= grid.rows) continue;

        const verticalProgress = r / ribbonHeight;
        // Fine vertical folds in the curtain
        const fold = this.noise.noise2D(c * 0.15, (row + this.time * 8) * 0.08);
        const intensity = Math.max(0, Math.sin(verticalProgress * Math.PI) * (0.5 + fold * 0.5));

        if (intensity > 0.12) {
          let char = '·';
          if (intensity > 0.7) char = '█';
          else if (intensity > 0.5) char = '▓';
          else if (intensity > 0.35) char = '▒';
          else if (intensity > 0.2) char = '░';

          // Color transition: Emerald Green at bottom -> Violet / Magenta at top
          let red = 16;
          let green = 230;
          let blue = 160;

          if (verticalProgress > 0.55) {
            const factor = (verticalProgress - 0.55) / 0.45;
            red = Math.floor(16 * (1 - factor) + 192 * factor);
            green = Math.floor(230 * (1 - factor) + 60 * factor);
            blue = Math.floor(160 * (1 - factor) + 240 * factor);
          }

          grid.setCell(c, row, char, red, green, blue, Math.min(1.0, intensity));
        }
      }
    }
  }
}
