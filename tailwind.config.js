import colors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

/**
 * Light / dark theme: the UI was written for dark (white text, slate greys,
 * pale accents). Those colour names point at CSS variables instead, and
 * [data-theme="light"] swaps the variables: white ↔ ink, the slate scale
 * flips (300 ↔ 700…), and pale accent shades become their deep versions.
 */
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const FLIP = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 };
/** Accents keep their hue; only the pale shades used as text on dark get deeper. */
const ACCENT_LIGHT = { 50: 50, 100: 100, 200: 800, 300: 700, 400: 600, 500: 600, 600: 600, 700: 700, 800: 800, 900: 900, 950: 950 };
const ACCENTS = ['teal', 'sky', 'red', 'emerald', 'indigo', 'amber', 'yellow'];

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};
const ref = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scale = (hue) => Object.fromEntries(SHADES.map((s) => [s, ref(`${hue}-${s}`)]));

const dark = {
  '--c-white': '255 255 255',
  '--c-black': '0 0 0',
  '--c-canvas': '6 7 12',
  '--c-surface': '12 14 20',
  '--c-surface-2': '21 24 34',
};
const light = {
  '--c-white': rgb(colors.slate[900]),
  '--c-black': '255 255 255',
  '--c-canvas': '250 250 252',
  '--c-surface': '255 255 255',
  '--c-surface-2': '241 243 247',
};
for (const s of SHADES) {
  dark[`--c-slate-${s}`] = rgb(colors.slate[s]);
  light[`--c-slate-${s}`] = rgb(colors.slate[FLIP[s]]);
  for (const hue of ACCENTS) {
    dark[`--c-${hue}-${s}`] = rgb(colors[hue][s]);
    light[`--c-${hue}-${s}`] = rgb(colors[hue][ACCENT_LIGHT[s]]);
  }
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        white: ref('white'),
        black: ref('black'),
        canvas: ref('canvas'),
        surface: ref('surface'),
        'surface-2': ref('surface-2'),
        slate: scale('slate'),
        ...Object.fromEntries(ACCENTS.map((hue) => [hue, scale(hue)])),
        pixora: {
          dark: '#08080a',
          card: 'rgba(18, 18, 22, 0.72)',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.05)',
          muted: '#8b8b99',
          accent: '#5eead4', // luminous teal
          accentWarm: '#fdba74', // warm amber
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        }
      }
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': dark, '[data-theme="light"]': light });
    }),
  ],
}
