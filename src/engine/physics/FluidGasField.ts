/**
 * Incompressible 2D semi-Lagrangian fluid & gas simulation for cursor wake.
 * Features momentum advection, multi-scale vorticity curl, lateral plume expansion,
 * and radial gas diffusion to simulate true billowing vapor/smoke that expands naturally.
 */

export interface FluidStroke {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  dx: number;
  dy: number;
  speed: number;
}

export class FluidGasField {
  public columns = 96;
  public rows = 54;

  private front: Float32Array = new Float32Array(0);
  private back: Float32Array = new Float32Array(0);
  private strokes: FluidStroke[] = [];
  private advected = [0, 0, 0];
  private previous: { x: number; y: number } | null = null;
  private energy = 0;
  private aspect = 1.77;
  private decayRate = 1.35; // Lower decay rate allows long, silky, lingering flow
  public speedMultiplier = 1.0;
  public spreadMultiplier = 1.0;
  public decayMultiplier = 1.0;

  constructor(aspect = 1.77, decayRate = 1.35) {
    this.decayRate = decayRate;
    this.resize(aspect);
  }

  public setFlowDynamics(speed = 1.0, spread = 1.0, decay = 1.0): void {
    this.speedMultiplier = Math.max(0.2, Math.min(3.0, speed));
    this.spreadMultiplier = Math.max(0.2, Math.min(3.0, spread));
    this.decayMultiplier = Math.max(0.2, Math.min(3.0, decay));
  }

  public resize(aspect: number): void {
    this.aspect = Math.max(0.25, Math.min(4, aspect));
    const resolution = 96;
    this.columns = this.aspect >= 1 ? resolution : Math.round(resolution * this.aspect);
    this.rows = this.aspect >= 1 ? Math.round(resolution / this.aspect) : resolution;
    const len = this.columns * this.rows * 3;
    if (this.front.length !== len) {
      this.front = new Float32Array(len);
      this.back = new Float32Array(len);
    } else {
      this.front.fill(0);
      this.back.fill(0);
    }
    this.strokes.length = 0;
    this.previous = null;
    this.energy = 0;
  }

  public get active(): boolean {
    return this.energy > 0.0004 || this.strokes.length > 0;
  }

  /** Continuous pointer movement in normalized [0, 1] viewport coordinates */
  public move(x: number, y: number): void {
    if (!Number.isFinite(x + y)) return;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    if (!this.previous) {
      this.previous = { x, y };
      return;
    }

    const previous = this.previous;
    const dx = Math.max(-0.12, Math.min(0.12, x - previous.x));
    const dy = Math.max(-0.12, Math.min(0.12, y - previous.y));
    this.previous = { x, y };

    if (Math.abs(dx) + Math.abs(dy) < 0.00008) return;

    const speed = Math.min(1, Math.hypot(dx * this.aspect, dy) * 22 + 0.08);
    this.strokes.push({ x, y, fromX: previous.x, fromY: previous.y, dx, dy, speed });
    if (this.strokes.length > 20) this.strokes.shift();
  }

  /** Sudden expanding gas burst / smoke ring on click */
  public puff(x: number, y: number, strength = 1.2): void {
    const count = 6;
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const mag = (0.045 + Math.random() * 0.035) * strength;
      this.strokes.push({
        x,
        y,
        fromX: x - Math.cos(angle) * 0.02,
        fromY: y - Math.sin(angle) * 0.02,
        dx: Math.cos(angle) * mag,
        dy: Math.sin(angle) * mag,
        speed: 0.95 * strength,
      });
    }
  }

  public leave(): void {
    this.previous = null;
  }

  public clear(): void {
    this.front.fill(0);
    this.back.fill(0);
    this.strokes.length = 0;
    this.previous = null;
    this.energy = 0;
  }

  /** Bilinear read of [velX, velY, gasDensity] */
  private read(data: Float32Array, x: number, y: number, out: number[]): void {
    const gx = Math.max(0, Math.min(this.columns - 1.001, x * (this.columns - 1)));
    const gy = Math.max(0, Math.min(this.rows - 1.001, y * (this.rows - 1)));
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;

    const top = (iy * this.columns + ix) * 3;
    const bottom = top + this.columns * 3;
    const leftW = 1 - fx;
    const topW = 1 - fy;

    out[0] = (data[top] * leftW + data[top + 3] * fx) * topW + (data[bottom] * leftW + data[bottom + 3] * fx) * fy;
    out[1] = (data[top + 1] * leftW + data[top + 4] * fx) * topW + (data[bottom + 1] * leftW + data[bottom + 4] * fx) * fy;
    out[2] = (data[top + 2] * leftW + data[top + 5] * fx) * topW + (data[bottom + 2] * leftW + data[bottom + 5] * fx) * fy;
  }

  public sample(x: number, y: number, out: number[]): void {
    this.read(this.front, x, y, out);
  }

  public step(seconds: number): void {
    if (!this.active) return;
    const dt = Math.max(0, Math.min(0.05, seconds));
    const effectiveDecayRate = this.decayRate * this.decayMultiplier;
    const decay = Math.exp(-dt * effectiveDecayRate);
    const gasDecay = Math.exp(-dt * (effectiveDecayRate * 0.85)); // Gas lingers longer than velocity
    const xScale = Math.max(1, this.aspect);
    const yScale = Math.max(1, 1 / this.aspect);

    let peak = 0;
    const cols = this.columns;
    const rows = this.rows;
    const front = this.front;
    const back = this.back;
    const transport = 1.6 * this.speedMultiplier; // High transport carries the gas momentum further
    const spreadCutoff = 0.055 * this.spreadMultiplier;
    const velSpreadSigma = 0.0085 * this.spreadMultiplier;
    const gasSpreadSigma = 0.014 * this.spreadMultiplier;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 3;
        const u = x / (cols - 1);
        const v = y / (rows - 1);

        // 1. Semi-Lagrangian Advection
        const sx = u - front[i] * dt * transport;
        const sy = v - front[i + 1] * dt * transport;
        this.read(front, sx, sy, this.advected);

        let dx = this.advected[0] * decay;
        let dy = this.advected[1] * decay;
        let gas = this.advected[2] * gasDecay;

        // 2. Gas Radial Diffusion (Billow effect: gas naturally expands into surrounding air)
        const leftIdx = i - 3;
        const rightIdx = i + 3;
        const upIdx = i - cols * 3;
        const downIdx = i + cols * 3;

        let neighborGas = 0;
        let count = 0;
        if (x > 0) { neighborGas += front[leftIdx + 2]; count++; }
        if (x < cols - 1) { neighborGas += front[rightIdx + 2]; count++; }
        if (y > 0) { neighborGas += front[upIdx + 2]; count++; }
        if (y < rows - 1) { neighborGas += front[downIdx + 2]; count++; }

        if (count > 0) {
          const avgNeighbor = neighborGas / count;
          // Blend with neighbors to physically expand the gas cloud outward
          gas = gas * 0.84 + avgNeighbor * 0.16;
        }

        // 3. Stroke Momentum, Lateral Expansion & Vorticity Curl
        for (let sIdx = 0; sIdx < this.strokes.length; sIdx++) {
          const stroke = this.strokes[sIdx];
          const ax = (u - stroke.fromX) * xScale;
          const ay = (v - stroke.fromY) * yScale;
          const bx = (stroke.x - stroke.fromX) * xScale;
          const by = (stroke.y - stroke.fromY) * yScale;
          const bLen2 = bx * bx + by * by || 1e-6;
          const along = Math.max(0, Math.min(1, (ax * bx + ay * by) / bLen2));

          const rx = ax - bx * along;
          const ry = ay - by * along;
          const distance = rx * rx + ry * ry;

          // Wide distance cutoff for expansive gas dispersion
          if (distance > spreadCutoff) continue;

          // Soft wide Gaussian plume falloff
          const weight = Math.exp(-distance / velSpreadSigma);
          const gasWeight = Math.exp(-distance / gasSpreadSigma); // Gas cloud spreads even wider than velocity
          const travel = Math.hypot(stroke.dx * xScale, stroke.dy * yScale);

          // Lateral Expansion: gas expands outwards perpendicular to the stroke vector
          const strokeLen = Math.hypot(stroke.dx, stroke.dy) || 1e-5;
          const perpX = (-stroke.dy / strokeLen);
          const perpY = (stroke.dx / strokeLen);
          const side = (rx * perpX + ry * perpY) >= 0 ? 1 : -1;
          const expandForce = 0.02 * travel * side;

          // Multi-scale vorticity curl creates rolling smoke eddies & swirling wisps
          const curl = Math.min(0.055, travel * 0.85);

          // Micro-turbulence creates delicate tendrils inside the plume
          const turb = Math.sin(u * 28 + v * 22) * 0.015 * travel;

          dx += (stroke.dx * 3.8 + perpX * expandForce - ry * curl + turb) * weight;
          dy += (stroke.dy * 3.8 + perpY * expandForce + rx * curl - turb) * weight;
          gas = Math.max(gas, Math.min(0.92, travel * 24) * gasWeight);
        }

        back[i] = Math.max(-0.25, Math.min(0.25, dx));
        back[i + 1] = Math.max(-0.25, Math.min(0.25, dy));
        back[i + 2] = Math.min(0.95, gas);

        peak = Math.max(peak, Math.abs(dx), Math.abs(dy), gas);
      }
    }

    // Double buffer swap
    this.front = back;
    this.back = front;
    this.strokes.length = 0;
    this.energy = peak;

    if (!this.active) {
      this.clear();
    }
  }
}
