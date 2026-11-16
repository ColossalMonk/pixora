/**
 * A per-cell energy grid that diffuses and fades: wakes, trails, splashes and
 * glow all live here. Each step blurs with a 5-tap kernel (centre·4 + 4
 * neighbours) / 8 and decays by exp(-dt · fade).
 */
export class EnergyField {
  public cols = 1;
  public rows = 1;
  public values = new Float32Array(1);
  private scratch = new Float32Array(1);
  /** Vertical neighbour weight relative to horizontal; < 1 for tall cells keeps blobs round. */
  public aspect = 1;

  public resize(cols: number, rows: number, aspect = 1): void {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.aspect = aspect;
    this.values = new Float32Array(this.cols * this.rows);
    this.scratch = new Float32Array(this.cols * this.rows);
  }

  public clear(): void {
    this.values.fill(0);
  }

  /** Adds a soft disc of energy. Radius in columns; rows are scaled by aspect. */
  public stamp(cx: number, cy: number, radius: number, amount: number): void {
    const ry = Math.max(0.6, radius * this.aspect);
    const c0 = Math.max(0, Math.floor(cx - radius));
    const c1 = Math.min(this.cols - 1, Math.ceil(cx + radius));
    const r0 = Math.max(0, Math.floor(cy - ry));
    const r1 = Math.min(this.rows - 1, Math.ceil(cy + ry));
    for (let r = r0; r <= r1; r++) {
      const dy = (r + 0.5 - cy) / ry;
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5 - cx) / radius;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          const i = r * this.cols + c;
          this.values[i] += amount * (1 - d2) * (1 - d2);
        }
      }
    }
  }

  public add(col: number, row: number, amount: number): void {
    col |= 0;
    row |= 0;
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    this.values[row * this.cols + col] += amount;
  }

  public step(dt: number, fade: number, diffuse = true): void {
    const k = Math.exp(-dt * fade);
    const v = this.values;
    if (!diffuse) {
      for (let i = 0; i < v.length; i++) v[i] *= k;
      return;
    }
    const s = this.scratch;
    const w = this.cols;
    const h = this.rows;
    const wy = this.aspect;
    const norm = 1 / (4 + 2 + 2 * wy);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = r * w + c;
        const l = c > 0 ? v[i - 1] : v[i];
        const rt = c < w - 1 ? v[i + 1] : v[i];
        const u = r > 0 ? v[i - w] : v[i];
        const d = r < h - 1 ? v[i + w] : v[i];
        s[i] = (v[i] * 4 + l + rt + (u + d) * wy) * norm * k;
      }
    }
    this.values = s;
    this.scratch = v;
  }
}
