import { GridCell } from '../../types/engine';
import { bitsToBraille } from './Charsets';

export class RenderGrid {
  public cols: number = 0;
  public rows: number = 0;
  public cellWidth: number = 10;
  public cellHeight: number = 16;
  public aspect: number = 0.625; // cellWidth / cellHeight

  // Dense 1D array of cells: [row * cols + col]
  public cells: GridCell[] = [];

  // Subpixel bitfield for Braille mode: 8 bits per cell stored as Uint8Array
  public brailleDots: Uint8Array = new Uint8Array(0);

  constructor(cols = 80, rows = 40, cellWidth = 10, cellHeight = 16) {
    this.resize(cols, rows, cellWidth, cellHeight);
  }

  public resize(cols: number, rows: number, cellWidth: number, cellHeight: number): void {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.cellWidth = Math.max(1, cellWidth);
    this.cellHeight = Math.max(1, cellHeight);
    this.aspect = this.cellWidth / this.cellHeight;

    const total = this.cols * this.rows;
    this.cells = new Array(total);
    for (let i = 0; i < total; i++) {
      this.cells[i] = { char: ' ', r: 255, g: 255, b: 255, a: 0 };
    }

    this.brailleDots = new Uint8Array(total);
  }

  public clear(bgR = 8, bgG = 8, bgB = 10, defaultChar = ' '): void {
    const total = this.cols * this.rows;
    for (let i = 0; i < total; i++) {
      const cell = this.cells[i];
      cell.char = defaultChar;
      cell.r = bgR;
      cell.g = bgG;
      cell.b = bgB;
      cell.a = 0;
    }
    this.brailleDots.fill(0);
  }

  public setCell(
    col: number,
    row: number,
    char: string,
    r: number,
    g: number,
    b: number,
    a = 1.0
  ): void {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    const idx = row * this.cols + col;
    const cell = this.cells[idx];
    cell.char = char;
    cell.r = r;
    cell.g = g;
    cell.b = b;
    cell.a = a;
  }

  public getCell(col: number, row: number): GridCell | null {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return this.cells[row * this.cols + col];
  }

  /**
   * Sets a subpixel dot in Braille mode (2 dots horizontal, 4 dots vertical per cell)
   * Dot mapping per Unicode standard:
   *  (0,0)=bit 0 (0x01)   (1,0)=bit 3 (0x08)
   *  (0,1)=bit 1 (0x02)   (1,1)=bit 4 (0x10)
   *  (0,2)=bit 2 (0x04)   (1,2)=bit 5 (0x20)
   *  (0,3)=bit 6 (0x40)   (1,3)=bit 7 (0x80)
   */
  public setBrailleSubpixel(
    subX: number,
    subY: number,
    r: number,
    g: number,
    b: number,
    a = 1.0
  ): void {
    const col = Math.floor(subX / 2);
    const row = Math.floor(subY / 4);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;

    const dotX = subX % 2;
    const dotY = subY % 4;

    const idx = row * this.cols + col;
    // Map (dotX, dotY) directly to Unicode Braille bitmask
    const mask = dotX === 0
      ? (dotY === 3 ? 0x40 : 1 << dotY)
      : (dotY === 3 ? 0x80 : 1 << (3 + dotY));
    this.brailleDots[idx] |= mask;

    const cell = this.cells[idx];
    cell.r = r;
    cell.g = g;
    cell.b = b;
    cell.a = Math.max(cell.a, a);
  }

  /**
   * Finalizes Braille cells by converting bitfields directly to Unicode characters (U+2800 - U+28FF)
   * Zero array allocation in high-frequency 60 FPS animation loop
   */
  public finalizeBraille(): void {
    const total = this.cols * this.rows;
    for (let i = 0; i < total; i++) {
      const bits = this.brailleDots[i];
      if (bits > 0) {
        this.cells[i].char = String.fromCharCode(0x2800 + bits);
      }
    }
  }
}
