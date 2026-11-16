/** What the user can pick. 'auto' lets each world use the style it was designed for. */
export type CharacterStyle =
  | 'auto'
  | 'tiles'
  | 'ascii-standard'
  | 'ascii-dense'
  | 'blocks'
  | 'geometric'
  | 'braille'
  | 'dots';

/** A concrete style a world renders its fields with. */
export type ResolvedStyle = Exclude<CharacterStyle, 'auto'>;

export type ColorTheme =
  | 'phosphor-amber'
  | 'matrix-green'
  | 'cyberpunk-neon'
  | 'ice-blue'
  | 'claude-warm'
  | 'true-color'
  | 'monochrome-white';

export type PerformanceTier = 'auto' | 'low' | 'balanced' | 'high';

export interface EngineConfig {
  fontSize: number;
  charDensity: number; // 0.6 (sparse) to 1.6 (dense)
  style: CharacterStyle;
  colorTheme: ColorTheme;
  animationSpeed: number; // 0.4 to 2.0
  interactionIntensity: number; // 0 to 2
  performanceTier: PerformanceTier;
  reducedMotion: boolean;
  /** 0..1 — how strongly the art fades behind the central UI. */
  calmCenter: number;
}

export interface PointerClick {
  x: number;
  y: number;
}

/** Pointer state handed to worlds every step, in CSS pixels. */
export interface InputState {
  x: number;
  y: number;
  /** Velocity in px / second. */
  vx: number;
  vy: number;
  /** Pointer is inside the window and over the art (not over a panel or button). */
  active: boolean;
  down: boolean;
  /** Clicks on the art since the last step. */
  clicks: PointerClick[];
  /** Scales every interaction force, from settings. */
  intensity: number;
}
