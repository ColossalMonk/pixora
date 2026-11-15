import { ColorTheme } from '../../types/engine';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const PALETTES: Record<ColorTheme, { bg: RGB; primary: RGB; secondary: RGB; highlight: RGB }> = {
  'phosphor-amber': {
    bg: { r: 12, g: 8, b: 4 },
    primary: { r: 245, g: 158, b: 11 },     // Amber 500
    secondary: { r: 180, g: 83, b: 9 },     // Amber 700
    highlight: { r: 254, g: 243, b: 199 },  // Amber 100
  },
  'matrix-green': {
    bg: { r: 4, g: 12, b: 6 },
    primary: { r: 34, g: 197, b: 94 },      // Emerald 500
    secondary: { r: 21, g: 128, b: 61 },    // Emerald 700
    highlight: { r: 220, g: 252, b: 231 },  // Emerald 100
  },
  'cyberpunk-neon': {
    bg: { r: 10, g: 6, b: 18 },
    primary: { r: 236, g: 72, b: 153 },     // Pink 500
    secondary: { r: 99, g: 102, b: 241 },   // Indigo 500
    highlight: { r: 56, g: 189, b: 248 },   // Sky 400
  },
  'ice-blue': {
    bg: { r: 6, g: 12, b: 18 },
    primary: { r: 56, g: 189, b: 248 },     // Sky 400
    secondary: { r: 14, g: 116, b: 144 },   // Cyan 700
    highlight: { r: 240, g: 249, b: 255 },  // Sky 50
  },
  'claude-warm': {
    bg: { r: 18, g: 16, b: 15 },
    primary: { r: 217, g: 119, b: 87 },     // Claude terracotta
    secondary: { r: 168, g: 145, b: 128 },  // Warm gray
    highlight: { r: 250, g: 245, b: 235 },  // Warm cream
  },
  'true-color': {
    bg: { r: 8, g: 8, b: 10 },
    primary: { r: 220, g: 220, b: 230 },
    secondary: { r: 140, g: 140, b: 160 },
    highlight: { r: 255, g: 255, b: 255 },
  },
  'monochrome-white': {
    bg: { r: 8, g: 8, b: 10 },
    primary: { r: 210, g: 215, b: 225 },
    secondary: { r: 100, g: 105, b: 115 },
    highlight: { r: 255, g: 255, b: 255 },
  },
};

/**
 * Returns an interpolated RGB color based on intensity [0..1] and theme
 */
export function getColorForIntensity(intensity: number, theme: ColorTheme): RGB {
  const palette = PALETTES[theme] || PALETTES['monochrome-white'];
  const t = Math.max(0, Math.min(1, intensity));

  if (t < 0.6) {
    const factor = t / 0.6;
    return {
      r: Math.round(palette.secondary.r * (1 - factor) + palette.primary.r * factor),
      g: Math.round(palette.secondary.g * (1 - factor) + palette.primary.g * factor),
      b: Math.round(palette.secondary.b * (1 - factor) + palette.primary.b * factor),
    };
  } else {
    const factor = (t - 0.6) / 0.4;
    return {
      r: Math.round(palette.primary.r * (1 - factor) + palette.highlight.r * factor),
      g: Math.round(palette.primary.g * (1 - factor) + palette.highlight.g * factor),
      b: Math.round(palette.primary.b * (1 - factor) + palette.highlight.b * factor),
    };
  }
}
