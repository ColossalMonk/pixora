import { ColorTheme } from '../../types/engine';
import { gradientLUT, hex, mix } from './Color';

interface ThemeDef {
  /** Background tint blended into each world's own backdrop. */
  bg: number;
  /** Dark → bright colour stops that glyph luminance maps onto. */
  stops: [number, number][];
}

export const THEMES: Record<Exclude<ColorTheme, 'true-color'>, ThemeDef> = {
  'phosphor-amber': {
    bg: hex('#0c0804'),
    stops: [[0, hex('#3b1d06')], [0.45, hex('#b45309')], [0.75, hex('#f59e0b')], [1, hex('#fef3c7')]],
  },
  'matrix-green': {
    bg: hex('#040c06'),
    stops: [[0, hex('#052e16')], [0.45, hex('#15803d')], [0.75, hex('#22c55e')], [1, hex('#dcfce7')]],
  },
  'cyberpunk-neon': {
    bg: hex('#0a0612'),
    stops: [[0, hex('#1e1b4b')], [0.35, hex('#6366f1')], [0.65, hex('#ec4899')], [1, hex('#7dd3fc')]],
  },
  'ice-blue': {
    bg: hex('#060c12'),
    stops: [[0, hex('#082f49')], [0.45, hex('#0e7490')], [0.75, hex('#38bdf8')], [1, hex('#f0f9ff')]],
  },
  'claude-warm': {
    bg: hex('#12100f'),
    stops: [[0, hex('#3a2a22')], [0.4, hex('#a89180')], [0.7, hex('#d97757')], [1, hex('#faf5eb')]],
  },
  'monochrome-white': {
    bg: hex('#08080a'),
    stops: [[0, hex('#27272a')], [0.5, hex('#71717a')], [0.8, hex('#d4d4d8')], [1, hex('#ffffff')]],
  },
};

const lutCache = new Map<ColorTheme, Uint32Array>();

/** 256-entry luminance → theme colour table, or null for true colour. */
export function themeLUT(theme: ColorTheme): Uint32Array | null {
  if (theme === 'true-color') return null;
  let lut = lutCache.get(theme);
  if (!lut) {
    lut = gradientLUT(THEMES[theme].stops);
    lutCache.set(theme, lut);
  }
  return lut;
}

/** Re-tints a world backdrop colour for the active theme. */
export function themeBackdrop(color: number, theme: ColorTheme): number {
  if (theme === 'true-color') return color;
  return mix(THEMES[theme].bg, color, 0.25);
}
