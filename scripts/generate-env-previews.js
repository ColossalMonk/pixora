import fs from 'fs';
import path from 'path';

// Self-contained Simplex Noise for rendering preview frames
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
const grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

class FastNoise {
  constructor(seed = 42) {
    this.p = new Uint8Array(256);
    let s = seed;
    for (let i = 0; i < 256; i++) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      this.p[i] = (s >>> 24) & 0xff;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
  }
  noise2D(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = grad3[this.perm[ii + this.perm[jj]] % 12];
    const gi1 = grad3[this.perm[ii + i1 + this.perm[jj + j1]] % 12];
    const gi2 = grad3[this.perm[ii + 1 + this.perm[jj + 1]] % 12];
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * (gi0[0] * x0 + gi0[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * (gi1[0] * x1 + gi1[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * (gi2[0] * x2 + gi2[1] * y2); }
    return 70.0 * (n0 + n1 + n2);
  }
}

function renderToSvg(title, subtitle, grid, cols, rows, bgColor = '#08080a') {
  const charWidth = 8.5;
  const charHeight = 14;
  const paddingX = 30;
  const paddingY = 60;
  const svgWidth = Math.ceil(cols * charWidth + paddingX * 2);
  const svgHeight = Math.ceil(rows * charHeight + paddingY * 2);

  let texts = '';
  for (let r = 0; r < rows; r++) {
    const y = paddingY + r * charHeight;
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell || cell.char === ' ' || (cell.a !== undefined && cell.a <= 0.05)) continue;
      const x = paddingX + c * charWidth;
      const escapedChar = cell.char === '<' ? '&lt;' : cell.char === '>' ? '&gt;' : cell.char === '&' ? '&amp;' : cell.char;
      const fill = cell.color || `rgb(${cell.r || 220}, ${cell.g || 220}, ${cell.b || 220})`;
      texts += `<text x="${x}" y="${y}" fill="${fill}">${escapedChar}</text>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" style="background-color: ${bgColor}; border-radius: 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px;">
  <rect width="100%" height="100%" fill="${bgColor}" rx="16"/>
  <!-- Window Header -->
  <circle cx="25" cy="22" r="5" fill="#ef4444" opacity="0.8"/>
  <circle cx="40" cy="22" r="5" fill="#f59e0b" opacity="0.8"/>
  <circle cx="55" cy="22" r="5" fill="#10b981" opacity="0.8"/>
  <text x="80" y="26" fill="#94a3b8" font-size="11" font-weight="600">Pixora — ${title}</text>
  <text x="${svgWidth - 25}" y="26" text-anchor="end" fill="#64748b" font-size="10">${subtitle}</text>
  <line x1="15" y1="40" x2="${svgWidth - 15}" y2="40" stroke="#334155" stroke-width="0.75" opacity="0.4"/>
  <!-- Character Grid Content -->
  <g xml:space="preserve">
    ${texts}
  </g>
</svg>`;
}

const OUT_DIR = path.resolve('public/snapshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const COLS = 85;
const ROWS = 35;

// 1. UNDERWATER WORLD
{
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ char: ' ' })));
  const noise = new FastNoise(42);

  // Background caustics
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const n = noise.noise2D(c * 0.08, r * 0.12);
      if (n > 0.35) {
        grid[r][c] = { char: '~', color: `rgba(45, 212, 191, ${((n - 0.35) * 0.4).toFixed(2)})` };
      }
    }
  }

  // Seabed seaweed stalks
  for (let c = 4; c < COLS - 4; c += 4) {
    const height = 6 + Math.floor(Math.sin(c) * 4 + 4);
    for (let h = 0; h < height; h++) {
      const r = ROWS - 1 - h;
      const sway = Math.floor(Math.sin(h * 0.6 + c) * 1.5);
      const col = Math.max(0, Math.min(COLS - 1, c + sway));
      grid[r][col] = { char: '∫', color: '#10b981' };
    }
  }

  // Rising bubbles
  for (let i = 0; i < 20; i++) {
    const c = Math.floor(Math.random() * COLS);
    const r = Math.floor(Math.random() * (ROWS - 8));
    grid[r][c] = { char: '°', color: '#67e8f9' };
  }

  // Jellyfish
  const jx = 22, jy = 10;
  grid[jy][jx] = { char: '⌒', color: '#f472b6' };
  grid[jy][jx - 1] = { char: '(', color: '#f472b6' };
  grid[jy][jx + 1] = { char: ')', color: '#f472b6' };
  grid[jy + 1][jx - 2] = { char: '/', color: '#f472b6' };
  grid[jy + 1][jx - 1] = { char: '░', color: '#f472b6' };
  grid[jy + 1][jx] = { char: '░', color: '#f472b6' };
  grid[jy + 1][jx + 1] = { char: '░', color: '#f472b6' };
  grid[jy + 1][jx + 2] = { char: '\\', color: '#f472b6' };
  // Jellyfish tentacles
  for (let t = -2; t <= 2; t++) {
    for (let seg = 2; seg < 9; seg++) {
      const sway = Math.sin(seg * 0.8 + t) > 0 ? 1 : 0;
      grid[jy + seg][jx + t + sway] = { char: '§', color: 'rgba(244, 114, 182, 0.75)' };
    }
  }

  // School of fish
  const fishPositions = [
    [52, 14, '>'], [55, 12, '>'], [58, 15, '>'], [62, 13, '>'],
    [65, 16, '>'], [60, 18, '>'], [68, 14, '>'], [54, 17, '>']
  ];
  for (const [fx, fy, dir] of fishPositions) {
    grid[fy][fx] = { char: dir, color: '#5eead4' };
    grid[fy][fx - 1] = { char: '=', color: '#2dd4bf' };
    grid[fy][fx - 2] = { char: '~', color: '#14b8a6' };
  }

  const svg = renderToSvg('Underwater World', 'Boids Flocking & Jellyfish', grid, COLS, ROWS, '#050c18');
  fs.writeFileSync(path.join(OUT_DIR, 'underwater.svg'), svg);
}

// 2. INTERACTIVE WATER & RIPPLES
{
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ char: ' ' })));
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);

  // Concentric wave ripple rings
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const dx = c - cx;
      const dy = (r - cy) / 0.6; // Euclidean aspect ratio correction
      const dist = Math.sqrt(dx * dx + dy * dy);
      const wave = Math.sin(dist * 0.45) * Math.exp(-dist * 0.05);

      if (Math.abs(wave) > 0.3) {
        const char = wave > 0.7 ? '█' : wave > 0.4 ? '▓' : '▒';
        const alpha = Math.max(0.15, Math.min(0.95, (Math.abs(wave) * 0.9).toFixed(2)));
        grid[r][c] = { char, color: `rgba(56, 189, 248, ${alpha})` };
      } else if (Math.abs(wave) > 0.15) {
        grid[r][c] = { char: '░', color: 'rgba(14, 116, 144, 0.45)' };
      }
    }
  }

  // Floating sakura petals
  const petals = [[30, 10], [55, 12], [42, 22], [62, 25], [25, 26], [48, 8]];
  for (const [px, py] of petals) {
    grid[py][px] = { char: '✿', color: '#f472b6' };
  }

  const svg = renderToSvg('Interactive Water', 'Discretized Shallow Wave Heightfield', grid, COLS, ROWS, '#040d1a');
  fs.writeFileSync(path.join(OUT_DIR, 'ripples.svg'), svg);
}

// 3. FROG POND
{
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ char: ' ' })));

  // Water caustics
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((r + c) % 8 === 0) grid[r][c] = { char: '·', color: 'rgba(34, 197, 94, 0.15)' };
    }
  }

  // Lily pads
  const pads = [[20, 18, 5], [45, 24, 6], [68, 16, 5]];
  for (const [px, py, pr] of pads) {
    for (let r = -pr; r <= pr; r++) {
      for (let c = -Math.floor(pr * 1.6); c <= Math.floor(pr * 1.6); c++) {
        const dist = Math.sqrt((c / 1.6) ** 2 + r ** 2);
        if (dist <= pr) {
          const row = py + r;
          const col = px + c;
          if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
            // Cutout notch in lily pad
            if (c > 0 && Math.abs(r) <= 1) continue;
            grid[row][col] = { char: dist > pr - 0.8 ? '●' : '■', color: '#15803d' };
          }
        }
      }
    }
  }

  // Frog on pad 1
  grid[16][19] = { char: '(', color: '#4ade80' };
  grid[16][20] = { char: '•', color: '#ffffff' };
  grid[16][21] = { char: '‿', color: '#4ade80' };
  grid[16][22] = { char: '•', color: '#ffffff' };
  grid[16][23] = { char: ')', color: '#4ade80' };

  // Dragonfly buzzing
  grid[8][55] = { char: '—', color: '#38bdf8' };
  grid[8][56] = { char: '┼', color: '#67e8f9' };
  grid[8][57] = { char: '—', color: '#38bdf8' };

  const svg = renderToSvg('Frog & Lily Pond', 'Biomechanical Frogs & Splash Physics', grid, COLS, ROWS, '#051409');
  fs.writeFileSync(path.join(OUT_DIR, 'frog-pond.svg'), svg);
}

// 4. COSMIC AURORA
{
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ char: ' ' })));
  const noise = new FastNoise(777);

  // Starfield
  for (let i = 0; i < 40; i++) {
    const c = Math.floor(Math.random() * COLS);
    const r = Math.floor(Math.random() * ROWS);
    const glyph = ['·', '✦', '✧', '°'][Math.floor(Math.random() * 4)];
    grid[r][c] = { char: glyph, color: '#e2e8f0' };
  }

  // Aurora ribbon curtain
  for (let c = 0; c < COLS; c++) {
    const cNorm = c / COLS;
    const n = noise.noise2D(cNorm * 3.2, 0.5);
    const baseRow = Math.floor(ROWS * 0.35 + n * (ROWS * 0.2));
    const curtainHeight = Math.floor(ROWS * 0.45);

    for (let h = 0; h < curtainHeight; h++) {
      const r = baseRow + h;
      if (r < 0 || r >= ROWS) continue;
      const progress = h / curtainHeight;
      const fold = noise.noise2D(c * 0.15, r * 0.1);
      const intensity = Math.sin(progress * Math.PI) * (0.5 + fold * 0.5);

      if (intensity > 0.15) {
        const char = intensity > 0.65 ? '█' : intensity > 0.45 ? '▓' : intensity > 0.28 ? '▒' : '░';
        // Green at bottom -> Magenta at top
        const color = progress > 0.55
          ? `rgba(217, 70, 239, ${(intensity * 0.9).toFixed(2)})`
          : `rgba(45, 212, 191, ${(intensity * 0.9).toFixed(2)})`;
        grid[r][c] = { char, color };
      }
    }
  }

  const svg = renderToSvg('Cosmic Aurora', 'Multi-Octave Simplex Noise Curtains', grid, COLS, ROWS, '#060412');
  fs.writeFileSync(path.join(OUT_DIR, 'cosmic-aurora.svg'), svg);
}

// 5. ABSTRACT FLOW FIELDS
{
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ char: ' ' })));
  const noise = new FastNoise(999);
  const arrows = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const angle = noise.noise2D(c * 0.08, r * 0.1) * Math.PI * 2.5;
      const normAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const dirIdx = Math.floor((normAngle / (Math.PI * 2)) * 8) % 8;
      const char = arrows[dirIdx];
      const intensity = Math.abs(noise.noise2D(c * 0.05 + 10, r * 0.05));

      if (intensity > 0.2) {
        const alpha = Math.min(1.0, (intensity * 1.2).toFixed(2));
        grid[r][c] = { char, color: `rgba(236, 72, 153, ${alpha})` };
      }
    }
  }

  const svg = renderToSvg('Abstract Flow Fields', 'Curl Noise Vector Particle Swarms', grid, COLS, ROWS, '#0d0718');
  fs.writeFileSync(path.join(OUT_DIR, 'abstract-flow.svg'), svg);
}

console.log('All 5 procedural environment SVG snapshots generated in public/snapshots!');
