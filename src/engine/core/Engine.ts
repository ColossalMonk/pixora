import { EngineConfig, MouseState } from '../../types/engine';
import { EnvironmentId, IEnvironment } from '../../types/environment';
import { RenderGrid } from './RenderGrid';
import { UnderwaterWorld } from '../environments/UnderwaterWorld';
import { InteractiveWater } from '../environments/InteractiveWater';
import { FrogPond } from '../environments/FrogPond';
import { CosmicAurora } from '../environments/CosmicAurora';
import { AbstractFlow } from '../environments/AbstractFlow';
import { getColorForIntensity, PALETTES } from './PaletteManager';

export class Engine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private lastTime: number = 0;
  private isRunning: boolean = false;

  public grid: RenderGrid;
  public config: EngineConfig;
  public mouse: MouseState;

  // Environment registry
  private environments: Map<EnvironmentId, IEnvironment> = new Map();
  private activeEnvironment: IEnvironment | null = null;

  constructor(config?: Partial<EngineConfig>) {
    this.config = {
      fontSize: 14,
      charDensity: 1.0,
      style: 'ascii-standard',
      colorTheme: 'true-color',
      invertLuminance: false,
      contrast: 1.0,
      animationSpeed: 1.0,
      performanceTier: 'balanced',
      reducedMotion: false,
      ...config,
    };

    this.grid = new RenderGrid(80, 40, 10, 16);

    this.mouse = {
      x: -1,
      y: -1,
      prevX: -1,
      prevY: -1,
      vx: 0,
      vy: 0,
      isDown: false,
      clicked: false,
      clickX: -1,
      clickY: -1,
      radius: 60,
    };

    // Register all 5 procedural environments
    this.environments.set('underwater', new UnderwaterWorld());
    this.environments.set('ripples', new InteractiveWater());
    this.environments.set('frog-pond', new FrogPond());
    this.environments.set('cosmic-aurora', new CosmicAurora());
    this.environments.set('abstract-flow', new AbstractFlow());

    // Default to underwater
    this.setEnvironment('underwater');

    // Bind document visibility change to freeze RAF loop when tab is hidden
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public setEnvironment(id: EnvironmentId): void {
    const nextEnv = this.environments.get(id);
    if (!nextEnv) return;

    if (this.activeEnvironment && this.activeEnvironment.destroy) {
      this.activeEnvironment.destroy();
    }
    this.activeEnvironment = nextEnv;
    this.activeEnvironment.init(this.grid);
  }

  public attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.bindEvents();
    this.resize();
    this.start();
  }

  public detach(): void {
    this.stop();
    this.unbindEvents();
    this.canvas = null;
    this.ctx = null;
  }

  public resize(): void {
    if (!this.canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }

    // Compute cell dimensions based on font size and character density (with low-tier hardware scaling)
    const isLowTier = this.config.performanceTier === 'low';
    const effectiveDensity = isLowTier ? this.config.charDensity * 0.75 : this.config.charDensity;
    const fontSize = isLowTier ? Math.max(16, this.config.fontSize + 2) : this.config.fontSize;
    const cellWidth = Math.max(6, Math.floor((fontSize * 0.6) / effectiveDensity));
    const cellHeight = Math.max(10, Math.floor(fontSize / effectiveDensity));

    const cols = Math.ceil(width / cellWidth);
    const rows = Math.ceil(height / cellHeight);

    this.grid.resize(cols, rows, cellWidth, cellHeight);

    if (this.activeEnvironment) {
      this.activeEnvironment.resize(width, height, this.grid);
    }
  }

  public updateConfig(newConfig: Partial<EngineConfig>): void {
    const prevFontSize = this.config.fontSize;
    const prevDensity = this.config.charDensity;
    const prevTier = this.config.performanceTier;

    this.config = { ...this.config, ...newConfig };

    if (
      prevFontSize !== this.config.fontSize ||
      prevDensity !== this.config.charDensity ||
      prevTier !== this.config.performanceTier
    ) {
      this.resize();
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const rawDelta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Clamp delta to prevent huge jumps on tab switch / lag spike
    const deltaTime = Math.min(rawDelta, 0.1) * (this.config.reducedMotion ? 0.2 : this.config.animationSpeed);

    // Update and render active environment
    if (this.activeEnvironment) {
      this.activeEnvironment.update(deltaTime, this.mouse, this.grid);
      this.activeEnvironment.render(this.grid);
    }

    // Convert any Braille subpixel bitfields to Unicode characters
    this.grid.finalizeBraille();

    // Rasterize grid to canvas
    this.rasterize();

    // Reset single-frame mouse flags
    this.mouse.clicked = false;

    this.rafId = requestAnimationFrame(this.loop);
  };

  private rasterize(): void {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cols = this.grid.cols;
    const rows = this.grid.rows;
    const cw = this.grid.cellWidth;
    const ch = this.grid.cellHeight;
    const cells = this.grid.cells;

    // Get background color from active theme
    const theme = PALETTES[this.config.colorTheme] || PALETTES['true-color'];
    ctx.fillStyle = `rgb(${theme.bg.r}, ${theme.bg.g}, ${theme.bg.b})`;
    ctx.fillRect(0, 0, width, height);

    // Set font
    ctx.font = `${this.config.fontSize}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    const useTrueColor = this.config.colorTheme === 'true-color';
    let currentFill = '';

    // Precompute quantized theme palette buckets (reduces Canvas state flushes from 2000+ to under 10)
    const THEME_BUCKET_COUNT = 8;
    const themeBuckets: string[] = [];
    if (!useTrueColor) {
      for (let b = 0; b < THEME_BUCKET_COUNT; b++) {
        const intensity = b / (THEME_BUCKET_COUNT - 1);
        const rgb = getColorForIntensity(intensity, this.config.colorTheme);
        themeBuckets.push(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
      }
    }

    // Batch draw character grid with fillStyle deduplication
    for (let r = 0; r < rows; r++) {
      const y = r * ch;
      const rowOffset = r * cols;

      for (let c = 0; c < cols; c++) {
        const cell = cells[rowOffset + c];
        if (!cell || cell.char === ' ' || cell.a <= 0.05) continue;

        const x = c * cw;

        let nextFill = '';
        if (useTrueColor) {
          nextFill = cell.a >= 0.99
            ? `rgb(${cell.r}, ${cell.g}, ${cell.b})`
            : `rgba(${cell.r}, ${cell.g}, ${cell.b}, ${cell.a.toFixed(2)})`;
        } else {
          // Map cell brightness to precomputed theme bucket
          const lum = (0.299 * cell.r + 0.587 * cell.g + 0.114 * cell.b) / 255;
          const bucketIndex = Math.min(THEME_BUCKET_COUNT - 1, Math.max(0, Math.floor(lum * THEME_BUCKET_COUNT)));
          nextFill = themeBuckets[bucketIndex];
        }

        if (nextFill !== currentFill) {
          ctx.fillStyle = nextFill;
          currentFill = nextFill;
        }

        ctx.fillText(cell.char, x, y);
      }
    }
  }

  private handleMouseMove = (e: MouseEvent): void => {
    this.mouse.prevX = this.mouse.x;
    this.mouse.prevY = this.mouse.y;
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.vx = this.mouse.x - this.mouse.prevX;
    this.mouse.vy = this.mouse.y - this.mouse.prevY;
  };

  private handleMouseDown = (e: MouseEvent): void => {
    this.mouse.isDown = true;
    this.mouse.clicked = true;
    this.mouse.clickX = e.clientX;
    this.mouse.clickY = e.clientY;
  };

  private handleMouseUp = (): void => {
    this.mouse.isDown = false;
  };

  private handleMouseLeave = (): void => {
    this.mouse.x = -1;
    this.mouse.y = -1;
    this.mouse.isDown = false;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('mouseleave', this.handleMouseLeave);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('mouseleave', this.handleMouseLeave);
  }

  private handleResize = (): void => {
    this.resize();
  };
}
