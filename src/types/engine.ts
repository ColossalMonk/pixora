export type CharacterStyle =
  | 'ascii-standard'
  | 'ascii-dense'
  | 'braille'
  | 'geometric'
  | 'blocks'
  | 'directional'
  | 'pixel-blocks';

export type ColorTheme =
  | 'phosphor-amber'
  | 'matrix-green'
  | 'cyberpunk-neon'
  | 'ice-blue'
  | 'claude-warm'
  | 'true-color'
  | 'monochrome-white';

export interface GridCell {
  char: string;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface EngineConfig {
  fontSize: number;
  charDensity: number; // 0.5 (sparse) to 2.0 (dense)
  style: CharacterStyle;
  colorTheme: ColorTheme;
  invertLuminance: boolean;
  contrast: number; // 0.5 to 2.0
  animationSpeed: number; // 0.5 to 2.0
  performanceTier: 'low' | 'balanced' | 'high';
  reducedMotion: boolean;
}

export interface MouseState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  isDown: boolean;
  clicked: boolean;
  clickX: number;
  clickY: number;
  radius: number;
}
