import { BaseEnvironment } from './BaseEnvironment';
import { RenderGrid } from '../core/RenderGrid';
import { MouseState } from '../../types/engine';
import { WaveEquation2D } from '../physics/WaveEquation2D';
import { SimplexNoise } from '../physics/SimplexNoise';

interface FloatingPetal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  r: number;
  g: number;
  b: number;
}

export class InteractiveWater extends BaseEnvironment {
  public readonly id = 'ripples';
  private wave: WaveEquation2D;
  private noise: SimplexNoise;
  private petals: FloatingPetal[] = [];
  private lastMouseX = -1;
  private lastMouseY = -1;

  constructor() {
    super();
    this.wave = new WaveEquation2D(80, 40);
    this.noise = new SimplexNoise(88);
  }

  public override init(grid: RenderGrid): void {
    super.init(grid);
    this.wave.resize(grid.cols, grid.rows);

    // Seed floating cherry blossoms / petals
    this.petals = [];
    const glyphs = ['❀', '✿', '·', '°', '•'];
    for (let i = 0; i < 28; i++) {
      this.petals.push({
        x: Math.random() * grid.cols,
        y: Math.random() * grid.rows,
        vx: 0,
        vy: 0,
        char: glyphs[Math.floor(Math.random() * glyphs.length)],
        r: 251,
        g: 146,
        b: 180, // Soft sakura pink
      });
    }

    // Initial gentle drop
    this.wave.addDisturbance(grid.cols / 2, grid.rows / 2, 4, 3.5);
  }

  public override resize(width: number, height: number, grid: RenderGrid): void {
    super.resize(width, height, grid);
    this.wave.resize(grid.cols, grid.rows);
  }

  public update(deltaTime: number, mouse: MouseState, grid: RenderGrid): void {
    this.time += deltaTime;

    // 1. Mouse interaction
    const col = Math.floor(mouse.x / grid.cellWidth);
    const row = Math.floor(mouse.y / grid.cellHeight);

    if (mouse.clicked) {
      // Powerful ripple ring on click
      this.wave.addDisturbance(col, row, 4.5, 5.0);
    } else if (mouse.x > 0 && mouse.y > 0) {
      // Continuous disturbance on cursor movement
      const dist = Math.hypot(mouse.x - this.lastMouseX, mouse.y - this.lastMouseY);
      if (dist > 3) {
        this.wave.addDisturbance(col, row, 2.2, Math.min(2.5, dist * 0.15));
      }
    }
    this.lastMouseX = mouse.x;
    this.lastMouseY = mouse.y;

    // 2. Periodic ambient raindrops
    if (Math.random() < 0.04) {
      const rx = 4 + Math.random() * (grid.cols - 8);
      const ry = 4 + Math.random() * (grid.rows - 8);
      this.wave.addDisturbance(rx, ry, 2.0, 2.5);
    }

    // 3. Step wave simulation
    this.wave.update();

    // 4. Update floating petals responding to wave gradient
    for (const p of this.petals) {
      const grad = this.wave.getGradient(Math.floor(p.x), Math.floor(p.y));
      p.vx += -grad.dx * 0.4;
      p.vy += -grad.dy * 0.4;
      p.vx *= 0.94;
      p.vy *= 0.94;

      // Ambient stream drift
      p.x += p.vx + 0.03;
      p.y += p.vy + 0.01;

      // Wrap
      if (p.x >= grid.cols) p.x = 0;
      if (p.x < 0) p.x = grid.cols - 1;
      if (p.y >= grid.rows) p.y = 0;
      if (p.y < 0) p.y = grid.rows - 1;
    }
  }

  public render(grid: RenderGrid): void {
    grid.clear(6, 14, 26, ' '); // Midnight lake blue

    // Render wave heightfield using character density and directional slope
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const h = this.wave.getHeight(x, y);
        const grad = this.wave.getGradient(x, y);
        const slopeMag = Math.hypot(grad.dx, grad.dy);

        if (Math.abs(h) > 0.08 || slopeMag > 0.1) {
          let char = '·';
          let intensity = Math.min(1.0, Math.abs(h) * 0.45 + slopeMag * 0.55);

          if (h > 0.8) char = '█';
          else if (h > 0.45) char = '▓';
          else if (h > 0.25) char = '▒';
          else if (h > 0.1) char = '░';
          else if (h < -0.3) char = '~';
          else if (h < -0.1) char = '-';

          // Light reflection
          const r = Math.floor(40 + intensity * 160);
          const g = Math.floor(120 + intensity * 125);
          const b = Math.floor(180 + intensity * 75);

          grid.setCell(x, y, char, r, g, b, Math.min(1.0, intensity + 0.2));
        }
      }
    }

    // Render floating petals
    for (const p of this.petals) {
      const px = Math.floor(p.x);
      const py = Math.floor(p.y);
      grid.setCell(px, py, p.char, p.r, p.g, p.b, 0.95);
    }
  }
}
