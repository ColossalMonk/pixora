import { CharacterStyle } from '../../types/engine';

export const CHARSETS = {
  // 10-character classic ASCII luminance ramp (dark to bright)
  'ascii-standard': [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'],

  // 70-character fine-grain ASCII ramp
  'ascii-dense': [
    ' ', '`', '^', '"', ',', ':', ';', 'I', 'l', '!', 'i', '>', '<', '~', '+',
    '_', '-', '?', ']', '[', '}', '{', '1', ')', '(', '|', '/', 't', 'f', 'j',
    'r', 'x', 'n', 'u', 'v', 'c', 'z', 'X', 'Y', 'U', 'J', 'C', 'L', 'Q', '0',
    'O', 'Z', 'm', 'w', 'q', 'p', 'd', 'b', 'k', 'h', 'a', 'o', '*', '#', 'M',
    'W', '&', '8', '%', 'B', '@', '$'
  ],

  // Geometric & retro symbols
  'geometric': [' ', '·', '⋄', '∘', '◇', '◈', '◆', '▲', '●', '■'],

  // Unicode shading & half block elements
  'blocks': [' ', '░', '▒', '▓', '▄', '▌', '▐', '▀', '█'],

  // Directional flow vectors (indexed by 8-way angle + center)
  'directional': ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘', '·'],

  // Pixel blocks
  'pixel-blocks': [' ', '▖', '▗', '▘', '▝', '▀', '▄', '█'],
};

/**
 * Returns a character for a given luminance value [0..1]
 */
export function getCharForLuminance(
  luminance: number,
  style: CharacterStyle,
  invert = false
): string {
  const ramp = CHARSETS[style as keyof typeof CHARSETS] || CHARSETS['ascii-standard'];
  let normalized = Math.max(0, Math.min(1, luminance));
  if (invert) normalized = 1 - normalized;

  const index = Math.floor(normalized * (ramp.length - 1));
  return ramp[index];
}

/**
 * Converts a 2x4 boolean subpixel matrix into a Braille Unicode character (U+2800 - U+28FF)
 * Dot mapping per Unicode standard:
 *  (0,0)=bit 0 (0x01)   (1,0)=bit 3 (0x08)
 *  (0,1)=bit 1 (0x02)   (1,1)=bit 4 (0x10)
 *  (0,2)=bit 2 (0x04)   (1,2)=bit 5 (0x20)
 *  (0,3)=bit 6 (0x40)   (1,3)=bit 7 (0x80)
 */
export function bitsToBraille(dots: boolean[]): string {
  let code = 0x2800;
  if (dots[0]) code |= 0x01;
  if (dots[1]) code |= 0x02;
  if (dots[2]) code |= 0x04;
  if (dots[3]) code |= 0x40;
  if (dots[4]) code |= 0x08;
  if (dots[5]) code |= 0x10;
  if (dots[6]) code |= 0x20;
  if (dots[7]) code |= 0x80;
  return String.fromCharCode(code);
}
