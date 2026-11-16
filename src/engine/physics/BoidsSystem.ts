/**
 * Reynolds flocking in flat typed arrays with a uniform spatial hash, so
 * neighbour queries are O(n · k) instead of O(n²) and nothing allocates per step.
 * Each boid carries a depth (0 far … 1 near); boids only flock with others at a
 * similar depth, which keeps parallax layers coherent.
 */
export interface BoidParams {
  maxSpeed: number; // px/s at depth 1
  maxForce: number; // px/s²
  separation: number; // px
  neighbor: number; // px
  avoidRadius: number; // px
  avoidForce: number; // px/s²
}

export class BoidsSystem {
  public count = 0;
  public x = new Float32Array(0);
  public y = new Float32Array(0);
  public vx = new Float32Array(0);
  public vy = new Float32Array(0);
  public depth = new Float32Array(0);
  public phase = new Float32Array(0);
  /** Seconds left of panic after a startle (ignores the speed cap a little). */
  public panic = new Float32Array(0);
  public width = 800;
  public height = 600;
  /** Optional inner bounds (habitat); flock steers to stay inside. */
  public minX = 0;
  public minY = 0;
  public params: BoidParams = {
    maxSpeed: 130,
    maxForce: 240,
    separation: 38,
    neighbor: 70,
    avoidRadius: 140,
    avoidForce: 900,
  };

  private cellSize = 70;
  private gridCols = 1;
  private gridRows = 1;
  private heads = new Int32Array(1);
  private next = new Int32Array(0);

  public reset(count: number, width: number, height: number, depthOf: (i: number) => number): void {
    this.count = count;
    this.width = width;
    this.height = height;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.depth = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.panic = new Float32Array(count);
    this.next = new Int32Array(count);
    // Seed in a few loose schools so flocks form quickly.
    const schools = Math.max(2, Math.round(count / 14));
    for (let i = 0; i < count; i++) {
      const s = i % schools;
      const sx = width * (0.15 + 0.7 * ((s * 0.618) % 1));
      const sy = height * (0.15 + 0.6 * ((s * 0.382 + 0.2) % 1));
      this.x[i] = sx + (Math.random() - 0.5) * 160;
      this.y[i] = sy + (Math.random() - 0.5) * 100;
      const a = (s % 2 ? Math.PI : 0) + (Math.random() - 0.5) * 0.6;
      this.vx[i] = Math.cos(a) * 60;
      this.vy[i] = Math.sin(a) * 30;
      this.depth[i] = depthOf(i);
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    this.cellSize = this.params.neighbor;
    this.gridCols = Math.max(1, Math.ceil(width / this.cellSize) + 1);
    this.gridRows = Math.max(1, Math.ceil(height / this.cellSize) + 1);
    this.heads = new Int32Array(this.gridCols * this.gridRows);
  }

  public startle(x: number, y: number, radius: number, power: number): void {
    for (let i = 0; i < this.count; i++) {
      const dx = this.x[i] - x;
      const dy = this.y[i] - y;
      const d = Math.hypot(dx, dy);
      if (d < radius && d > 0.001) {
        const f = (1 - d / radius) * power;
        this.vx[i] += (dx / d) * f;
        this.vy[i] += (dy / d) * f;
        this.panic[i] = 1.2;
      }
    }
  }

  private buildHash(): void {
    this.heads.fill(-1);
    const cs = this.cellSize;
    for (let i = 0; i < this.count; i++) {
      const gc = Math.min(this.gridCols - 1, Math.max(0, (this.x[i] / cs) | 0));
      const gr = Math.min(this.gridRows - 1, Math.max(0, (this.y[i] / cs) | 0));
      const cell = gr * this.gridCols + gc;
      this.next[i] = this.heads[cell];
      this.heads[cell] = i;
    }
  }

  /**
   * @param avoidX/avoidY pointer to flee from (or NaN)
   * @param attractX/attractY optional point to drift toward (food), NaN for none
   */
  public update(dt: number, avoidX: number, avoidY: number, avoidScale: number, attractX = NaN, attractY = NaN): void {
    const p = this.params;
    this.buildHash();
    const cs = this.cellSize;
    const sep2 = p.separation * p.separation;
    const nb2 = p.neighbor * p.neighbor;
    const pad = 70;

    for (let i = 0; i < this.count; i++) {
      const xi = this.x[i];
      const yi = this.y[i];
      const di = this.depth[i];
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
      const gc = Math.min(this.gridCols - 1, Math.max(0, (xi / cs) | 0));
      const gr = Math.min(this.gridRows - 1, Math.max(0, (yi / cs) | 0));
      for (let r = gr - 1; r <= gr + 1; r++) {
        if (r < 0 || r >= this.gridRows) continue;
        for (let c = gc - 1; c <= gc + 1; c++) {
          if (c < 0 || c >= this.gridCols) continue;
          for (let j = this.heads[r * this.gridCols + c]; j !== -1; j = this.next[j]) {
            if (j === i || Math.abs(this.depth[j] - di) > 0.2) continue;
            const dx = this.x[j] - xi;
            const dy = this.y[j] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 > nb2) continue;
            if (d2 < sep2 && d2 > 0.0001) {
              sx -= dx / d2;
              sy -= dy / d2;
            }
            ax += this.vx[j];
            ay += this.vy[j];
            cx += this.x[j];
            cy += this.y[j];
            n++;
          }
        }
      }

      const speedCap = p.maxSpeed * (0.45 + 0.55 * di);
      let fx = 0, fy = 0;
      if (n > 0) {
        // Alignment
        fx += (ax / n - this.vx[i]) * 1.0;
        fy += (ay / n - this.vy[i]) * 1.0;
        // Cohesion
        fx += (cx / n - xi) * 0.45;
        fy += (cy / n - yi) * 0.45;
        // Separation (scaled to px/s²)
        fx += sx * p.separation * 60;
        fy += sy * p.separation * 60;
      }
      // Gentle wander
      this.phase[i] += dt * (2 + Math.hypot(this.vx[i], this.vy[i]) * 0.04);
      fx += Math.cos(this.phase[i] * 0.13 + i) * 20;
      fy += Math.sin(this.phase[i] * 0.11 + i * 1.7) * 14;

      // Flee the pointer
      if (avoidScale > 0 && avoidX === avoidX) {
        const dx = xi - avoidX;
        const dy = yi - avoidY;
        const d = Math.hypot(dx, dy);
        if (d < p.avoidRadius && d > 0.001) {
          const f = (1 - d / p.avoidRadius) * p.avoidForce * avoidScale;
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
      }
      // Drift toward food
      if (attractX === attractX) {
        const dx = attractX - xi;
        const dy = attractY - yi;
        const d = Math.hypot(dx, dy);
        if (d > 4 && d < 420) {
          fx += (dx / d) * 160;
          fy += (dy / d) * 160;
        }
      }
      // Soft walls
      if (xi < this.minX + pad) fx += (this.minX + pad - xi) * 6;
      if (xi > this.width - pad) fx -= (xi - (this.width - pad)) * 6;
      if (yi < this.minY + pad) fy += (this.minY + pad - yi) * 6;
      if (yi > this.height - pad * 1.6) fy -= (yi - (this.height - pad * 1.6)) * 6;

      // Clamp steering force
      const fm = Math.hypot(fx, fy);
      const maxF = p.maxForce * (this.panic[i] > 0 ? 3 : 1);
      if (fm > maxF) {
        fx = (fx / fm) * maxF;
        fy = (fy / fm) * maxF;
      }
      let vx = this.vx[i] + fx * dt;
      let vy = this.vy[i] + fy * dt;
      // Fish swim mostly horizontally
      vy *= 0.985;
      const cap = this.panic[i] > 0 ? speedCap * 2.2 : speedCap;
      const sp = Math.hypot(vx, vy);
      if (sp > cap) {
        vx = (vx / sp) * cap;
        vy = (vy / sp) * cap;
      } else if (sp < speedCap * 0.3) {
        const k = (speedCap * 0.3) / Math.max(sp, 0.001);
        vx *= k;
        vy *= k;
      }
      this.vx[i] = vx;
      this.vy[i] = vy;
      if (this.panic[i] > 0) this.panic[i] -= dt;
    }
    for (let i = 0; i < this.count; i++) {
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }
}
