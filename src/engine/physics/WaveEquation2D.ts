export class WaveEquation2D {
  public cols: number = 0;
  public rows: number = 0;
  private uCurr: Float32Array = new Float32Array(0);
  private uPrev: Float32Array = new Float32Array(0);
  private uNext: Float32Array = new Float32Array(0);
  public damping: number = 0.985;
  public waveSpeedSq: number = 0.22;

  constructor(cols = 80, rows = 40) {
    this.resize(cols, rows);
  }

  public resize(cols: number, rows: number): void {
    this.cols = Math.max(10, cols);
    this.rows = Math.max(10, rows);
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

    // Interior grid update using finite differences
    for (let y = 1; y < h - 1; y++) {
      const rowOffset = y * w;
      for (let x = 1; x < w - 1; x++) {
        const idx = rowOffset + x;
        const laplacian =
          this.uCurr[idx - 1] +
          this.uCurr[idx + 1] +
          this.uCurr[idx - w] +
          this.uCurr[idx + w] -
          4 * this.uCurr[idx];

        this.uNext[idx] = (2 * this.uCurr[idx] - this.uPrev[idx] + cSq * laplacian) * damp;
      }
    }

    // Pointer swap
    const temp = this.uPrev;
    this.uPrev = this.uCurr;
    this.uCurr = this.uNext;
    this.uNext = temp;
  }

  public addDisturbance(x: number, y: number, radius: number, amplitude: number): void {
    const minX = Math.max(1, Math.floor(x - radius));
    const maxX = Math.min(this.cols - 2, Math.ceil(x + radius));
    const minY = Math.max(1, Math.floor(y - radius));
    const maxY = Math.min(this.rows - 2, Math.ceil(y + radius));

    const rSq = radius * radius;
    for (let cy = minY; cy <= maxY; cy++) {
      const dy = cy - y;
      const rowOffset = cy * this.cols;
      for (let cx = minX; cx <= maxX; cx++) {
        const dx = cx - x;
        const distSq = dx * dx + dy * dy;
        if (distSq <= rSq) {
          const factor = Math.exp(-distSq / (2 * (radius * 0.5) * (radius * 0.5)));
          this.uCurr[rowOffset + cx] += amplitude * factor;
        }
      }
    }
  }

  public getHeight(x: number, y: number): number {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return 0;
    return this.uCurr[y * this.cols + x];
  }

  public getGradient(x: number, y: number): { dx: number; dy: number } {
    if (x <= 0 || x >= this.cols - 1 || y <= 0 || y >= this.rows - 1) {
      return { dx: 0, dy: 0 };
    }
    const idx = y * this.cols + x;
    return {
      dx: (this.uCurr[idx + 1] - this.uCurr[idx - 1]) * 0.5,
      dy: (this.uCurr[idx + this.cols] - this.uCurr[idx - this.cols]) * 0.5,
    };
  }
}
