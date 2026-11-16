import { EngineConfig, InputState } from '../../types/engine';
import { EnvironmentId, IEnvironment, WorldContext } from '../../types/environment';
import { RenderGrid } from './RenderGrid';
import { Rasterizer } from './Rasterizer';
import { calibrateRamps, resolveStyle } from './Charsets';
import { themeBackdrop, themeLUT } from './PaletteManager';
import { createEnvironment } from '../environments/registry';

const STEP = 1 / 60;
const MAX_STEPS = 4;
export const FONT_FAMILY = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  fontSize: 14,
  charDensity: 1,
  style: 'auto',
  colorTheme: 'true-color',
  animationSpeed: 1,
  interactionIntensity: 1,
  performanceTier: 'auto',
  reducedMotion: false,
  calmCenter: 0.6,
};

/**
 * Owns the canvas, the fixed-step simulation loop and input. React only pushes
 * config changes in; nothing here triggers a React render.
 */
export class Engine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private lastRender = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private font = '';
  private focusRect: { x: number; y: number; w: number; h: number } | null = null;

  /** Adaptive quality: 0 = full, 1 = 30 fps, 2 = 30 fps + coarser grid. */
  private degrade = 0;
  private costEma = 0;
  private slowFrames = 0;

  private systemReducedMotion = false;
  private motionQuery: MediaQueryList | null = null;

  public readonly grid = new RenderGrid();
  private rasterizer = new Rasterizer();
  public config: EngineConfig;
  private environments = new Map<EnvironmentId, IEnvironment>();
  private active: IEnvironment | null = null;
  private activeId: EnvironmentId | null = null;

  public readonly input: InputState = {
    x: -1,
    y: -1,
    vx: 0,
    vy: 0,
    active: false,
    down: false,
    clicks: [],
    intensity: 1,
  };
  private rawX = -1;
  private rawY = -1;

  constructor(config?: Partial<EngineConfig>) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  public attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.systemReducedMotion = this.motionQuery.matches;
      this.motionQuery.addEventListener('change', this.handleMotionChange);
    }
    this.bindEvents();
    this.resize();
    // Canvas text doesn't trigger webfont loading; wait for the face, then re-measure.
    if (document.fonts?.load) {
      document.fonts
        .load(`16px ${FONT_FAMILY}`)
        .then(() => {
          calibrateRamps(FONT_FAMILY);
          this.resize();
        })
        .catch(() => undefined);
    }
    this.start();
  }

  public detach(): void {
    this.stop();
    this.unbindEvents();
    this.motionQuery?.removeEventListener('change', this.handleMotionChange);
    this.active?.destroy?.();
    this.canvas = null;
    this.ctx = null;
  }

  public setEnvironment(id: EnvironmentId): void {
    if (id === this.activeId && this.active) return;
    this.active?.destroy?.();
    let env = this.environments.get(id);
    if (!env) {
      env = createEnvironment(id);
      this.environments.set(id, env);
    }
    this.active = env;
    this.activeId = id;
    this.accumulator = 0;
    if (this.width > 0) {
      env.init(this.context());
      this.prepareBackdrop();
      if (this.isStill()) this.renderStill();
    }
  }

  public updateConfig(next: Partial<EngineConfig>): void {
    const prev = this.config;
    this.config = { ...prev, ...next };
    this.input.intensity = this.config.interactionIntensity;
    if (
      prev.fontSize !== this.config.fontSize ||
      prev.charDensity !== this.config.charDensity ||
      prev.performanceTier !== this.config.performanceTier
    ) {
      this.degrade = 0;
      this.resize();
    } else if (prev.colorTheme !== this.config.colorTheme) {
      this.prepareBackdrop();
    } else if (prev.calmCenter !== this.config.calmCenter) {
      this.grid.setFocusRect(this.focusRect, this.config.calmCenter);
    }
    if (prev.reducedMotion !== this.config.reducedMotion) this.applyMotionMode();
    else if (this.isStill()) this.renderStill();
  }

  /** The central UI's bounding box; art fades softly behind it. */
  public setFocusRect(rect: { x: number; y: number; w: number; h: number } | null): void {
    this.focusRect = rect;
    this.grid.setFocusRect(rect, this.config.calmCenter);
    if (this.isStill()) this.renderStill();
  }

  // ───────────────────────────── sizing ─────────────────────────────

  public resize(): void {
    if (!this.canvas || !this.ctx) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const tier = this.config.performanceTier;
    const coarse = tier === 'low' ? 1.25 : this.degrade >= 2 ? 1.15 : 1;
    const fontPx = Math.max(8, (this.config.fontSize / this.config.charDensity) * coarse);
    this.font = `${fontPx.toFixed(2)}px ${FONT_FAMILY}`;
    this.ctx.font = this.font;
    const measured = this.ctx.measureText('M').width;
    const cellW = measured > 2 ? measured : fontPx * 0.6;
    const cellH = Math.round(fontPx * 1.18);
    const cols = Math.ceil(this.width / cellW);
    const rows = Math.ceil(this.height / cellH);

    const changed = cols !== this.grid.cols || rows !== this.grid.rows || Math.abs(cellW - this.grid.cellWidth) > 0.01;
    this.grid.resize(cols, rows, cellW, cellH);
    this.grid.setFocusRect(this.focusRect, this.config.calmCenter);
    this.prepareBackdrop();
    if (this.active) {
      if (changed) this.active.resize(this.context());
    } else {
      // First size: nothing chosen yet
    }
    if (this.isStill()) this.renderStill();
  }

  private prepareBackdrop(): void {
    if (!this.active || this.width === 0) return;
    const stops = this.active.backdrop.map((c) => themeBackdrop(c, this.config.colorTheme));
    this.rasterizer.prepareBackdrop(this.width, this.height, this.dpr, stops);
    if (this.canvas) {
      // Faint cell grid (aligned to the character cells) over the world's gradient.
      const cw = this.grid.cellWidth;
      const ch = this.grid.cellHeight;
      const line = 'rgba(255,255,255,0.035)';
      const grid = `linear-gradient(${line} 1px, transparent 1px) 0 0 / ${cw}px ${ch}px, linear-gradient(90deg, ${line} 1px, transparent 1px) 0 0 / ${cw}px ${ch}px`;
      this.canvas.style.background = `${grid}, ${this.rasterizer.backdropCss}`;
    }
  }

  private context(): WorldContext {
    const tier = this.config.performanceTier;
    return {
      grid: this.grid,
      width: this.width,
      height: this.height,
      input: this.input,
      style: resolveStyle(this.config.style, this.active?.preferredStyle ?? 'ascii-standard'),
      auto: this.config.style === 'auto',
      quality: tier === 'low' || this.degrade >= 2 ? 0.6 : tier === 'high' ? 1.25 : 1,
    };
  }

  // ───────────────────────────── loop ─────────────────────────────

  private isStill(): boolean {
    return this.config.reducedMotion || this.systemReducedMotion;
  }

  private handleMotionChange = (e: MediaQueryListEvent): void => {
    this.systemReducedMotion = e.matches;
    this.applyMotionMode();
  };

  private applyMotionMode(): void {
    if (this.isStill()) {
      this.stop();
      this.renderStill();
    } else {
      this.start();
    }
  }

  /** Reduced motion: let the world settle for a few seconds, then show one still frame. */
  private renderStill(): void {
    if (!this.active || !this.ctx || this.width === 0) return;
    const ctx = this.context();
    for (let i = 0; i < 180; i++) {
      this.active.update(STEP, ctx);
      ctx.input.clicks.length = 0;
    }
    this.draw(ctx);
  }

  public start(): void {
    if (this.running || this.isStill() || (typeof document !== 'undefined' && document.hidden)) {
      if (this.isStill()) this.renderStill();
      return;
    }
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const capFps = this.config.performanceTier === 'low' || this.degrade >= 1 ? 30 : 0;
    if (capFps && now - this.lastRender < 1000 / capFps - 2) return;
    this.lastRender = now;

    const elapsed = Math.min(0.25, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (!this.active) return;

    const t0 = performance.now();
    const ctx = this.context();
    this.trackPointer(elapsed);

    this.accumulator += elapsed;
    let steps = 0;
    const dt = STEP * this.config.animationSpeed;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      this.active.update(dt, ctx);
      this.input.clicks.length = 0;
      this.accumulator -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    this.draw(ctx);
    this.adapt(performance.now() - t0);
  };

  private draw(ctx: WorldContext): void {
    if (!this.ctx || !this.active) return;
    this.grid.clear();
    this.active.render(ctx);
    this.rasterizer.draw(this.ctx, this.grid, this.width, this.height, this.font, themeLUT(this.config.colorTheme));
  }

  /** 'auto' tier: if frames keep costing too much, drop to 30 fps, then to a coarser grid. */
  private adapt(cost: number): void {
    if (this.config.performanceTier !== 'auto') return;
    this.costEma = this.costEma * 0.95 + cost * 0.05;
    if (this.costEma > 11) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90 && this.degrade < 2) {
      this.degrade++;
      this.slowFrames = 0;
      this.costEma = 0;
      if (this.degrade === 2) this.resize();
    }
  }

  // ───────────────────────────── input ─────────────────────────────

  private trackPointer(elapsed: number): void {
    const inp = this.input;
    if (this.rawX < 0) {
      inp.vx *= 0.8;
      inp.vy *= 0.8;
      return;
    }
    if (inp.x >= 0 && elapsed > 0) {
      const k = 0.35;
      inp.vx = inp.vx * (1 - k) + ((this.rawX - inp.x) / elapsed) * k;
      inp.vy = inp.vy * (1 - k) + ((this.rawY - inp.y) / elapsed) * k;
    }
    inp.x = this.rawX;
    inp.y = this.rawY;
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.rawX = e.clientX;
    this.rawY = e.clientY;
    if (this.input.x < 0) {
      this.input.x = e.clientX;
      this.input.y = e.clientY;
    }
    // Only the art itself counts — hovering the search bar or a panel shouldn't scatter fish.
    this.input.active = e.target === this.canvas;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.target !== this.canvas) return;
    this.input.down = true;
    this.input.clicks.push({ x: e.clientX, y: e.clientY });
    if (this.isStill()) return;
  };

  private onPointerUp = (): void => {
    this.input.down = false;
  };

  private onPointerLeave = (): void => {
    this.rawX = -1;
    this.rawY = -1;
    this.input.x = -1;
    this.input.y = -1;
    this.input.active = false;
    this.input.down = false;
  };

  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private resizeQueued = false;
  private onResize = (): void => {
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => {
      this.resizeQueued = false;
      this.resize();
    });
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  // ───────────────────────────── previews ─────────────────────────────

  /** Renders a settled still of a world into a small canvas (gallery thumbnails). */
  public static renderSnapshot(
    id: EnvironmentId,
    canvas: HTMLCanvasElement,
    config: Pick<EngineConfig, 'colorTheme' | 'style'>,
    fontPx = 9
  ): void {
    const ctx2d = canvas.getContext('2d', { alpha: false });
    if (!ctx2d) return;
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const font = `${fontPx}px ${FONT_FAMILY}`;
    ctx2d.font = font;
    const cw = ctx2d.measureText('M').width || fontPx * 0.6;
    const ch = Math.round(fontPx * 1.18);
    const grid = new RenderGrid();
    grid.resize(Math.ceil(width / cw), Math.ceil(height / ch), cw, ch);
    const env = createEnvironment(id);
    const input: InputState = { x: -1, y: -1, vx: 0, vy: 0, active: false, down: false, clicks: [], intensity: 1 };
    const wctx: WorldContext = {
      grid,
      width,
      height,
      input,
      style: resolveStyle(config.style, env.preferredStyle),
      auto: config.style === 'auto',
      quality: 0.8,
    };
    env.init(wctx);
    for (let i = 0; i < 240; i++) env.update(STEP, wctx);
    grid.clear();
    env.render(wctx);
    const r = new Rasterizer();
    r.prepareBackdrop(width, height, dpr, env.backdrop.map((c) => themeBackdrop(c, config.colorTheme)));
    r.draw(ctx2d, grid, width, height, font, themeLUT(config.colorTheme), true);
    env.destroy?.();
  }
}
