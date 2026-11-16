import { CharacterStyle, ResolvedStyle } from '../../types/engine';
import { code } from './RenderGrid';

/**
 * Glyph ramps, dark → bright. Text ramps are re-sorted at startup by the
 * measured ink of the real font (see `calibrateRamps`), so density steps are
 * even no matter which monospace face actually loaded.
 */
const RAW_RAMPS: Record<Exclude<ResolvedStyle, 'braille' | 'tiles'>, string> = {
  'ascii-standard': ' .:-=+*#%@',
  'ascii-dense': " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  geometric: ' ·∘○◌◇◈◆●■',
  dots: ' ·∙•●',
};

/** Ramps whose order is fixed by design (don't re-sort by ink). */
const FIXED_ORDER = new Set(['blocks', 'dots']);

let ramps: Record<string, Uint32Array> = buildRamps(null);

function buildRamps(ink: Map<string, number> | null): Record<string, Uint32Array> {
  const out: Record<string, Uint32Array> = {};
  for (const [name, chars] of Object.entries(RAW_RAMPS)) {
    let list = Array.from(chars);
    if (ink && !FIXED_ORDER.has(name)) {
      const [space, ...rest] = list;
      rest.sort((a, b) => (ink.get(a) ?? 0) - (ink.get(b) ?? 0));
      list = [space, ...rest];
    }
    out[name] = Uint32Array.from(list.map(code));
  }
  return out;
}

/** Measures how much ink each glyph lays down in the given font and re-orders ramps. */
export function calibrateRamps(fontFamily: string): void {
  if (typeof document === 'undefined') return;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.font = `${size * 0.8}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ink = new Map<string, number>();
  const all = new Set(Object.values(RAW_RAMPS).join(''));
  for (const ch of all) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, size / 2, size / 2);
    const data = ctx.getImageData(0, 0, size, size).data;
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) sum += data[i];
    ink.set(ch, sum);
  }
  ramps = buildRamps(ink);
}

export function getRamp(style: ResolvedStyle): Uint32Array {
  return ramps[style] ?? ramps['ascii-standard'];
}

/** Resolves the user's style against the world's preference. */
export function resolveStyle(user: CharacterStyle, worldDefault: ResolvedStyle): ResolvedStyle {
  return user === 'auto' ? worldDefault : user;
}

/** Older saved settings used styles that no longer exist. */
export function migrateStyle(style: string | undefined): CharacterStyle {
  const valid: CharacterStyle[] = ['auto', 'tiles', 'ascii-standard', 'ascii-dense', 'blocks', 'geometric', 'braille', 'dots'];
  return valid.includes(style as CharacterStyle) ? (style as CharacterStyle) : 'auto';
}

export function getCharForLuminance(luminance: number, style: ResolvedStyle, invert = false): string {
  const ramp = getRamp(style);
  let v = Math.max(0, Math.min(1, luminance));
  if (invert) v = 1 - v;
  return String.fromCodePoint(ramp[Math.round(v * (ramp.length - 1))]);
}

/** 8-way arrows indexed by angle (0 = east, counter-clockwise in screen space). */
export const ARROWS = Array.from('→↗↑↖←↙↓↘').map(code);

/** Stroke glyph for a screen-space angle (radians). */
const STROKES = [code('-'), code('\\'), code('|'), code('/')];
export function strokeFor(angle: number): number {
  // Map to [0, PI) then to 4 buckets centred on 0, 45, 90, 135 degrees (screen y points down).
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;
  const idx = Math.round(a / (Math.PI / 4)) % 4;
  return STROKES[idx];
}
