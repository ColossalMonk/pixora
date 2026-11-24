import { ANIMALS, type AnimalKey } from "./animals";
import { Flock, type Animal, type Tuning } from "./flock";
import { AsciiRenderer, type Theme } from "./renderer";
import { Atmosphere, type AtmosphereInput } from "./atmosphere";

const STEP = 1 / 60;

/** A built-in animal by name, or any Animal definition. */
const resolve = (animal: AnimalKey | Animal<any>) => (typeof animal === "string" ? ANIMALS[animal] : animal);
const MAX_STEPS = 4;

/**
 * Wires a Flock + AsciiRenderer to a canvas: fixed-timestep loop, resize,
 * click-to-startle, switching animals, pausing off-screen, and
 * prefers-reduced-motion.
 */
export class AnimalEngine {
  /** The current animal's live knobs; change them through set() so resizes and repaints happen. */
  tuning: Tuning;
  animal: Animal<any>;
  private flock: Flock<any>;
  private renderer: AsciiRenderer;
  private count?: number;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;
  /** Pixora: the in-app "Reduced motion" setting, on top of the OS preference. */
  private forceStill = false;
  private get still() {
    return this.forceStill || this.reducedMotion.matches;
  }
  /** Pixora: low power caps the frame rate at 30 fps and draws at 1× pixel density. */
  private lowPower = false;
  private lastDrawn = 0;
  /** Pixora: WebGL layer for the cells and a layer for the calm zone above it. */
  private glCanvas: HTMLCanvasElement | null = null;
  private calmCanvas: HTMLCanvasElement | null = null;
  /** Pixora: each drawn frame's work time in ms (for auto low power). */
  onFrameCost: ((ms: number) => void) | null = null;

  /** count pins the population; tuning overrides any of the animal's defaults. */
  constructor(
    private canvas: HTMLCanvasElement,
    {
      animal = "butterflies",
      count,
      theme = "light",
      tuning,
    }: { animal?: AnimalKey | Animal<any>; count?: number; theme?: Theme; tuning?: Partial<Tuning> } = {},
  ) {
    this.count = count;
    this.animal = resolve(animal);
    this.tuning = { ...this.animal.defaults, ...tuning } as Tuning;
    this.flock = new Flock(this.animal, this.tuning, count);
    this.renderer = new AsciiRenderer(canvas, this.tuning);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.renderer.setAnimal(this.animal, this.tuning);
    this.renderer.setTheme(theme);
    this.attachGPU();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });

    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, redraw.
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && this.still) this.drawStill();
    });
    this.schedule();
  }

  /** Pixora: WebGL overlay for the cells (about 2-3x cheaper than canvas text), 2D if unavailable. */
  private attachGPU() {
    const layer = () => {
      const c = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block";
      return c;
    };
    const gl = layer();
    const calm = layer();
    if (!this.renderer.attachGPU(gl, calm)) return;
    this.canvas.after(gl, calm);
    this.glCanvas = gl;
    this.calmCanvas = calm;
    this.renderer.onGpuLost = () => this.removeLayers();
  }

  private removeLayers() {
    this.glCanvas?.remove();
    this.calmCanvas?.remove();
    this.glCanvas = null;
    this.calmCanvas = null;
  }

  get usingGPU() {
    return this.renderer.usingGPU;
  }

  /** Pixora: live weather and time of day; null shows the scene as designed. */
  setAtmosphere(input: AtmosphereInput | null) {
    if (!input) {
      this.renderer.atmosphere = null;
      this.flock.windX = 0;
    } else {
      if (!this.renderer.atmosphere) this.renderer.atmosphere = new Atmosphere();
      this.renderer.atmosphere.set(input);
    }
    this.renderer.restyle();
    if (this.still) this.drawStill();
  }

  /** Pixora: show the animal's habitat behind it. */
  setHabitats(on: boolean) {
    if (on === this.renderer.habitats) return;
    this.renderer.habitats = on;
    this.renderer.restyle();
    if (this.still) this.drawStill();
  }

  /** Pixora: low power (30 fps cap, 1x pixel density). */
  setLowPower(on: boolean) {
    if (on === this.lowPower) return;
    this.lowPower = on;
    this.resize();
  }

  /** Pixora: draws a fresh frame and returns it as one canvas (for saving as a picture). */
  capture(): HTMLCanvasElement {
    this.renderer.render(this.flock, 0);
    return this.renderer.composite(this.glCanvas);
  }

  destroy() {
    this.disposed = true;
    this.removeLayers();
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointerdown", this.onPointerDown);
  }

  /** Swap in another animal with its own defaults (plus any overrides); the screen fills with it at once. */
  setAnimal(animal: AnimalKey | Animal<any>, tuning?: Partial<Tuning>) {
    this.animal = resolve(animal);
    this.tuning = { ...this.animal.defaults, ...tuning } as Tuning;
    this.flock = new Flock(this.animal, this.tuning, this.count);
    this.renderer.setAnimal(this.animal, this.tuning);
    this.resize();
  }

  set(key: string, value: number | boolean) {
    this.tuning[key] = value;
    if (key === "detail") this.resize();
    else if (key === "hueShift" || key === "grid") this.renderer.restyle();
    if (this.still) this.drawStill();
  }

  /** Pixora: keep the animals faded behind this box (CSS pixels, canvas-relative). */
  setCalm(rect: { x: number; y: number; w: number; h: number } | null) {
    this.renderer.setCalm(rect);
    if (this.still) this.drawStill();
  }

  /** Pixora: honour the in-app Reduced motion toggle as well as the OS setting. */
  setReducedMotion(on: boolean) {
    if (on === this.forceStill) return;
    this.forceStill = on;
    this.onMotionPreference();
  }

  setTheme(theme: Theme) {
    this.renderer.setTheme(theme);
    if (this.still) this.drawStill();
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = this.lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(rect.width, rect.height, dpr);
    this.flock.resize(rect.width, rect.height);
    if (this.still) this.drawStill();
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.still) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    // Low power: at most 30 frames a second (the sim still steps at 60 Hz).
    if (this.lowPower && now - this.lastDrawn < 1000 / 30 - 2) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.lastDrawn = now;
    const work = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    const atmos = this.renderer.atmosphere;
    this.flock.windX = atmos ? atmos.wind : 0;
    // Rain on water: drops land as small ripples in the trail field.
    if (atmos && this.animal.water && (atmos.input.kind === "rain" || atmos.input.kind === "storm")) {
      const rate = (6 + 30 * atmos.input.intensity) * dt * ((this.flock.width * this.flock.height) / (1440 * 900));
      for (let n = rate + Math.random(); n >= 1; n--) {
        this.flock.events.push({ x: Math.random() * this.flock.width, y: Math.random() * this.flock.height, radius: 1, amount: 0.55 });
      }
    }
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.flock.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.renderer.render(this.flock, dt);
    this.onFrameCost?.(performance.now() - work);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Reduced motion: let the animals spread out, then show a single frame. */
  private drawStill() {
    if (this.flock.time < 4) {
      for (let i = 0; i < 240; i++) this.flock.step(STEP);
    }
    this.renderer.render(this.flock, STEP);
  }

  private onMotionPreference = () => {
    if (this.still) {
      cancelAnimationFrame(this.raf);
      this.drawStill();
    } else {
      this.schedule();
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    // Only clicks that land on the canvas itself, not on UI floating above it.
    if (this.still || e.target !== this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.flock.startle(e.clientX - rect.left, e.clientY - rect.top);
  };
}
