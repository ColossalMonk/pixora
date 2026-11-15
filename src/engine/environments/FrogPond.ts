import { BaseEnvironment } from './BaseEnvironment';
import { RenderGrid } from '../core/RenderGrid';
import { MouseState } from '../../types/engine';
import { WaveEquation2D } from '../physics/WaveEquation2D';

interface LilyPad {
  x: number; // in grid cells
  y: number;
  radius: number;
  bobPhase: number;
}

interface Frog {
  padIndex: number;
  x: number; // grid coords
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  state: 'idle' | 'anticipate' | 'jump' | 'swim';
  timer: number;
  jumpProgress: number;
  jumpArcHeight: number;
  facing: 1 | -1;
}

interface Dragonfly {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  hoverTimer: number;
}

export class FrogPond extends BaseEnvironment {
  public readonly id = 'frog-pond';
  private wave: WaveEquation2D;
  private lilyPads: LilyPad[] = [];
  private frogs: Frog[] = [];
  private dragonflies: Dragonfly[] = [];

  constructor() {
    super();
    this.wave = new WaveEquation2D(80, 40);
  }

  public override init(grid: RenderGrid): void {
    super.init(grid);
    this.wave.resize(grid.cols, grid.rows);

    // Create lily pads
    this.lilyPads = [
      { x: Math.floor(grid.cols * 0.22), y: Math.floor(grid.rows * 0.4), radius: 5, bobPhase: 0 },
      { x: Math.floor(grid.cols * 0.5), y: Math.floor(grid.rows * 0.65), radius: 6, bobPhase: 1.5 },
      { x: Math.floor(grid.cols * 0.78), y: Math.floor(grid.rows * 0.45), radius: 5, bobPhase: 3.0 },
      { x: Math.floor(grid.cols * 0.35), y: Math.floor(grid.rows * 0.78), radius: 4, bobPhase: 4.2 },
      { x: Math.floor(grid.cols * 0.68), y: Math.floor(grid.rows * 0.25), radius: 4, bobPhase: 5.1 },
    ];

    // Create frogs
    this.frogs = [
      {
        padIndex: 0,
        x: this.lilyPads[0].x,
        y: this.lilyPads[0].y - 1,
        startX: this.lilyPads[0].x,
        startY: this.lilyPads[0].y - 1,
        targetX: this.lilyPads[1].x,
        targetY: this.lilyPads[1].y - 1,
        state: 'idle',
        timer: 3.0 + Math.random() * 4,
        jumpProgress: 0,
        jumpArcHeight: 7,
        facing: 1,
      },
      {
        padIndex: 2,
        x: this.lilyPads[2].x,
        y: this.lilyPads[2].y - 1,
        startX: this.lilyPads[2].x,
        startY: this.lilyPads[2].y - 1,
        targetX: this.lilyPads[1].x,
        targetY: this.lilyPads[1].y - 1,
        state: 'idle',
        timer: 5.0 + Math.random() * 4,
        jumpProgress: 0,
        jumpArcHeight: 8,
        facing: -1,
      },
    ];

    // Create dragonflies
    this.dragonflies = [];
    for (let i = 0; i < 4; i++) {
      this.dragonflies.push({
        x: Math.random() * grid.cols,
        y: Math.random() * grid.rows,
        targetX: Math.random() * grid.cols,
        targetY: Math.random() * grid.rows,
        speed: 1.2 + Math.random() * 1.5,
        hoverTimer: 1.0,
      });
    }
  }

  public override resize(width: number, height: number, grid: RenderGrid): void {
    super.resize(width, height, grid);
    this.wave.resize(grid.cols, grid.rows);
  }

  public update(deltaTime: number, mouse: MouseState, grid: RenderGrid): void {
    this.time += deltaTime;

    // 1. Mouse water disturbance
    const mCol = Math.floor(mouse.x / grid.cellWidth);
    const mRow = Math.floor(mouse.y / grid.cellHeight);
    if (mouse.clicked) {
      this.wave.addDisturbance(mCol, mRow, 4, 4.0);
    } else if (mouse.x > 0 && mouse.y > 0) {
      this.wave.addDisturbance(mCol, mRow, 2, 0.8);
    }
    this.wave.update();

    // 2. Lilypad bobbing
    for (const pad of this.lilyPads) {
      pad.bobPhase += deltaTime * 1.5;
    }

    // 3. Frogs state machine
    for (const frog of this.frogs) {
      if (frog.state === 'idle') {
        frog.timer -= deltaTime;
        // Trigger jump when timer expires or cursor comes very close
        const dMouse = Math.hypot(frog.x - mCol, frog.y - mRow);
        if (frog.timer <= 0 || (dMouse < 4 && mouse.x > 0)) {
          frog.state = 'anticipate';
          frog.timer = 0.4;
          // Pick a target pad different from current
          let nextPad = Math.floor(Math.random() * this.lilyPads.length);
          if (nextPad === frog.padIndex) nextPad = (nextPad + 1) % this.lilyPads.length;
          frog.targetX = this.lilyPads[nextPad].x;
          frog.targetY = this.lilyPads[nextPad].y - 1;
          frog.startX = frog.x;
          frog.startY = frog.y;
          frog.padIndex = nextPad;
          frog.facing = frog.targetX >= frog.startX ? 1 : -1;
        }
      } else if (frog.state === 'anticipate') {
        frog.timer -= deltaTime;
        if (frog.timer <= 0) {
          frog.state = 'jump';
          frog.jumpProgress = 0;
          // Water ripple at takeoff pad
          this.wave.addDisturbance(Math.floor(frog.startX), Math.floor(frog.startY), 2.5, 2.0);
        }
      } else if (frog.state === 'jump') {
        frog.jumpProgress += deltaTime * 1.8;
        const t = Math.min(1.0, frog.jumpProgress);
        const arc = 4 * t * (1 - t) * frog.jumpArcHeight;
        frog.x = frog.startX + (frog.targetX - frog.startX) * t;
        frog.y = frog.startY + (frog.targetY - frog.startY) * t - arc;

        if (t >= 1.0) {
          frog.state = 'idle';
          frog.x = frog.targetX;
          frog.y = frog.targetY;
          frog.timer = 4.0 + Math.random() * 5.0;
          // Landing splash in wave solver!
          this.wave.addDisturbance(Math.floor(frog.x), Math.floor(frog.y), 3.5, 3.5);
        }
      }
    }

    // 4. Dragonfly AI
    for (const df of this.dragonflies) {
      df.hoverTimer -= deltaTime;
      if (df.hoverTimer <= 0) {
        df.targetX = 4 + Math.random() * (grid.cols - 8);
        df.targetY = 2 + Math.random() * (grid.rows - 4);
        df.hoverTimer = 1.5 + Math.random() * 2.0;
      }
      const dx = df.targetX - df.x;
      const dy = df.targetY - df.y;
      df.x += dx * 0.08 * df.speed;
      df.y += dy * 0.08 * df.speed;
    }
  }

  public render(grid: RenderGrid): void {
    grid.clear(4, 16, 20, ' '); // Dark pond green/teal

    // 1. Water surface waves
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const h = this.wave.getHeight(x, y);
        if (Math.abs(h) > 0.06) {
          const char = h > 0.4 ? '≈' : '~';
          grid.setCell(x, y, char, 20, 110, 130, Math.min(0.7, Math.abs(h)));
        }
      }
    }

    // 2. Lily Pads
    for (const pad of this.lilyPads) {
      const bob = Math.sin(pad.bobPhase) * 0.4;
      const py = pad.y + bob;
      const r = pad.radius;

      for (let dy = -Math.floor(r * 0.6); dy <= Math.floor(r * 0.6); dy++) {
        const dxLimit = Math.floor(Math.sqrt(r * r - (dy / 0.6) * (dy / 0.6)));
        for (let dx = -dxLimit; dx <= dxLimit; dx++) {
          // Notch in pad for classic water lily shape
          if (dx > dxLimit * 0.65 && dy === 0) continue;
          const char = Math.abs(dx) === dxLimit ? ')' : '█';
          grid.setCell(pad.x + dx, Math.floor(py + dy), char, 34, 160, 88, 0.95);
        }
      }
      // Lily flower on first pad
      grid.setCell(pad.x - 1, Math.floor(py - 1), '❀', 253, 230, 138, 1.0);
    }

    // 3. Frogs
    for (const frog of this.frogs) {
      const fx = Math.floor(frog.x);
      const fy = Math.floor(frog.y);

      if (frog.state === 'anticipate') {
        // Squished readiness pose
        grid.setCell(fx - 1, fy, '(', 52, 211, 153, 1.0);
        grid.setCell(fx, fy, '◉', 74, 222, 128, 1.0);
        grid.setCell(fx + 1, fy, ')', 52, 211, 153, 1.0);
      } else if (frog.state === 'jump') {
        // Extended leap pose
        const eyeChar = frog.facing === 1 ? 'ö' : 'ö';
        grid.setCell(fx - frog.facing, fy, '<', 110, 231, 183, 1.0);
        grid.setCell(fx, fy, eyeChar, 52, 211, 153, 1.0);
        grid.setCell(fx + frog.facing, fy, '>', 110, 231, 183, 1.0);
      } else {
        // Resting frog on pad: [•ᴗ•]
        const breath = Math.sin(this.time * 3) > 0.6 ? 'O' : 'o';
        grid.setCell(fx - 1, fy, '(', 74, 222, 128, 1.0);
        grid.setCell(fx, fy, breath, 250, 204, 21, 1.0); // golden eye
        grid.setCell(fx + 1, fy, ')', 74, 222, 128, 1.0);
      }
    }

    // 4. Dragonflies
    for (const df of this.dragonflies) {
      const dx = Math.floor(df.x);
      const dy = Math.floor(df.y);
      const wingFlutter = Math.sin(this.time * 25) > 0 ? '×' : '+';
      grid.setCell(dx - 1, dy, wingFlutter, 147, 197, 253, 0.8);
      grid.setCell(dx, dy, '•', 59, 130, 246, 1.0);
      grid.setCell(dx + 1, dy, wingFlutter, 147, 197, 253, 0.8);
    }
  }
}
