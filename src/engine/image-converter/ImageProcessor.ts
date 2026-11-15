import { CharacterStyle } from '../../types/engine';
import { getCharForLuminance } from '../core/Charsets';

export interface ProcessedAsciiResult {
  text: string;
  lines: string[];
  cols: number;
  rows: number;
  colorData: { char: string; r: number; g: number; b: number; a: number }[][];
}

export class ImageProcessor {
  public static async processImage(
    file: File | Blob | string,
    targetCols = 100,
    style: CharacterStyle = 'ascii-standard',
    invert = false,
    useSobel = true
  ): Promise<ProcessedAsciiResult> {
    const img = await this.loadImage(file);

    // Character aspect ratio compensation (monospace glyph is roughly 0.6x wide as high)
    const aspect = 0.55;
    const imgAspect = img.width / img.height;
    const targetRows = Math.max(10, Math.floor((targetCols / imgAspect) * aspect));

    // Downscale onto offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetCols;
    canvas.height = targetRows;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create offscreen canvas context');

    ctx.drawImage(img, 0, 0, targetCols, targetRows);
    const imgData = ctx.getImageData(0, 0, targetCols, targetRows);
    const data = imgData.data;

    // Luminance buffer
    const lums = new Float32Array(targetCols * targetRows);
    for (let i = 0; i < lums.length; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      lums[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    // Sobel edge filter 3x3
    const edgeMag = new Float32Array(targetCols * targetRows);
    const edgeAngle = new Float32Array(targetCols * targetRows);

    if (useSobel) {
      for (let y = 1; y < targetRows - 1; y++) {
        for (let x = 1; x < targetCols - 1; x++) {
          const idx = y * targetCols + x;
          const gx =
            -lums[idx - targetCols - 1] + lums[idx - targetCols + 1] +
            -2 * lums[idx - 1] + 2 * lums[idx + 1] +
            -lums[idx + targetCols - 1] + lums[idx + targetCols + 1];

          const gy =
            -lums[idx - targetCols - 1] - 2 * lums[idx - targetCols] - lums[idx - targetCols + 1] +
            lums[idx + targetCols - 1] + 2 * lums[idx + targetCols] + lums[idx + targetCols + 1];

          edgeMag[idx] = Math.hypot(gx, gy);
          edgeAngle[idx] = Math.atan2(gy, gx);
        }
      }
    }

    // Build character grid
    const lines: string[] = [];
    const colorData: { char: string; r: number; g: number; b: number; a: number }[][] = [];

    for (let y = 0; y < targetRows; y++) {
      let lineStr = '';
      const rowColors: { char: string; r: number; g: number; b: number; a: number }[] = [];

      for (let x = 0; x < targetCols; x++) {
        const idx = y * targetCols + x;
        const pIdx = idx * 4;
        const r = data[pIdx];
        const g = data[pIdx + 1];
        const b = data[pIdx + 2];
        const a = data[pIdx + 3] / 255;

        let char = ' ';

        if (useSobel && edgeMag[idx] > 0.45) {
          // Map edge direction to stroke characters
          const deg = (((edgeAngle[idx] * 180) / Math.PI) + 180) % 180;
          if (deg > 22.5 && deg <= 67.5) char = '/';
          else if (deg > 67.5 && deg <= 112.5) char = '|';
          else if (deg > 112.5 && deg <= 157.5) char = '\\';
          else char = '-';
        } else {
          char = getCharForLuminance(lums[idx], style, invert);
        }

        lineStr += char;
        rowColors.push({ char, r, g, b, a });
      }

      lines.push(lineStr);
      colorData.push(rowColors);
    }

    return {
      text: lines.join('\n'),
      lines,
      cols: targetCols,
      rows: targetRows,
      colorData,
    };
  }

  private static loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image source'));

      if (typeof source === 'string') {
        img.src = source;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) img.src = e.target.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(source);
      }
    });
  }
}
