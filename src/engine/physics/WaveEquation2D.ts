/**
 * 2D wave equation on the character grid:
 *   u' = (2u - u_prev + c² ∇²u) · damping
 *
 * Grid cells are taller than they are wide, so the vertical half of the
 * Laplacian is weighted by aspect² (cellWidth / cellHeight)². That keeps
 * ripples circular on screen instead of stretching into tall ellipses.
 * Called once per fixed simulation step (60 Hz).
 */
export class WaveEquation2D {
  public cols = 0;
  public rows = 0;
  public uCurr = new Float32Array(0);
  private uPrev = new Float32Array(0);
  private uNext = new Float32Array(0);
  public damping = 0.985;
  public waveSpeedSq = 0.22;
  /** cellWidth / cellHeight. */
  public aspect = 1;

  constructor(cols = 80, rows = 40) {
    this.resize(cols, rows);
  }

  public resize(cols: number, rows: number, aspect = this.aspect): void {
    this.cols = Math.max(3, cols);
    this.rows = Math.max(3, rows);
    this.aspect = aspect;
    const size = this.cols * this.rows;
    this.uCurr = new Float32Array(size);
    this.uPrev = new Float32Array(size);
    this.uNext = new Float32Array(size);
  }

  public update(): void {
    const w = this.cols;
    const h = this.rows;
    const cSq = this.waveSpeedSq;
    const damp = this.damping;
    const wy = this.aspect * this.aspect;
    const cur = this.uCurr;
    const prev = this.uPrev;
    const next = this.uNext;

    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const lap = cur[i - 1] + cur[i + 1] - 2 * cur[i] + (cur[i - w] + cur[i + w] - 2 * cur[i]) * wy;
        next[i] = (2 * cur[i] - prev[i] + cSq * lap) * damp;
      }
    }

    this.uPrev = cur;
    this.uCurr = next;
    this.uNext = prev;
  }

  /** Gaussian bump; radius in columns (rows scaled by aspect). */
  public addDisturbance(x: number, y: number, radius: number, amplitude: number): void {
    const ry = Math.max(0.8, radius * this.aspect);
    const minX = Math.max(1, Math.floor(x - radius));
    const maxX = Math.min(this.cols - 2, Math.ceil(x + radius));
    const minY = Math.max(1, Math.floor(y - ry));
    const maxY = Math.min(this.rows - 2, Math.ceil(y + ry));
    const sigma2 = 2 * (radius * 0.5) * (radius * 0.5);
    for (let cy = minY; cy <= maxY; cy++) {
      const dy = (cy - y) / this.aspect;
      const row = cy * this.cols;
      for (let cx = minX; cx <= maxX; cx++) {
        const dx = cx - x;
        const d2 = dx * dx + dy * dy;
        if (d2 <= radius * radius) this.uCurr[row + cx] += amplitude * Math.exp(-d2 / sigma2);
      }
    }
  }

  public getHeight(x: number, y: number): number {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return 0;
    return this.uCurr[y * this.cols + x];
  }

  public gradX(x: number, y: number): number {
    if (x <= 0 || x >= this.cols - 1 || y < 0 || y >= this.rows) return 0;
    const i = y * this.cols + x;
    return (this.uCurr[i + 1] - this.uCurr[i - 1]) * 0.5;
  }

  public gradY(x: number, y: number): number {
    if (y <= 0 || y >= this.rows - 1 || x < 0 || x >= this.cols) return 0;
    const i = y * this.cols + x;
    return (this.uCurr[i + this.cols] - this.uCurr[i - this.cols]) * 0.5 * this.aspect;
  }
}
