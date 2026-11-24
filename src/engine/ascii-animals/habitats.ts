/**
 * Pixora addition: an ASCII setting behind each animal (a lily-pad pond for
 * koi and frogs, a shore for crabs, reeds for dragonflies, a meadow for
 * butterflies, mountains for cranes, the deep sea for jellyfish).
 *
 * Painted once into the cached background (so it costs nothing per frame),
 * on the same cell grid as the animals, faint so the animals stay the focus.
 * Layouts come from a fixed seed, so a repaint (weather, theme) never
 * reshuffles them.
 */
import type { RGB } from "./ink";

export interface HabitatPainter {
  cols: number;
  rows: number;
  theme: "light" | "dark";
  /** Seeded 0..1. */
  rand(): number;
  /** One glyph in cell (c, r) at this opacity; out-of-range cells are ignored. */
  put(c: number, r: number, glyph: string, color: RGB, alpha: number): void;
}

export type Habitat = (p: HabitatPainter) => void;

/** Small, fast, seeded PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(p: HabitatPainter, list: readonly T[]) => list[Math.floor(p.rand() * list.length)];
const between = (p: HabitatPainter, a: number, b: number) => a + (b - a) * p.rand();

const WATER: RGB = [80, 140, 200];
const PAD: RGB = [64, 160, 96];
const LOTUS: RGB = [244, 128, 176];

/** Short runs of ~ across open water. */
function ripples(p: HabitatPainter, density: number, alpha = 0.12) {
  const n = Math.round(((p.cols * p.rows) / 360) * density);
  for (let i = 0; i < n; i++) {
    const c = Math.floor(p.rand() * p.cols);
    const r = Math.floor(p.rand() * p.rows);
    const len = 2 + Math.floor(p.rand() * 3);
    for (let k = 0; k < len; k++) p.put(c + k, r, "~", WATER, alpha * (k === 0 || k === len - 1 ? 0.6 : 1));
  }
}

/** Lily pads: ellipses of o / # with a notch, some with a lotus. */
function lilyPads(p: HabitatPainter, density: number) {
  const n = Math.max(3, Math.round(((p.cols * p.rows) / 1000) * density));
  for (let i = 0; i < n; i++) {
    const cx = between(p, 0, p.cols);
    const cy = between(p, 0, p.rows);
    const rx = between(p, 2.5, 6);
    const ry = rx * 0.55;
    const notch = between(p, 0, Math.PI * 2);
    for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++) {
      for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++) {
        const dx = (c - cx) / rx;
        const dy = (r - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const a = Math.atan2(dy, dx);
        const off = Math.abs(((a - notch + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (off < 0.32 && d > 0.08) continue; // the notch
        const edge = d > 0.6;
        p.put(c, r, edge ? "o" : (c + r) % 2 ? "=" : "#", PAD, edge ? 0.26 : 0.17);
      }
    }
    if (p.rand() < 0.35) {
      p.put(Math.round(cx), Math.round(cy), "*", LOTUS, 0.6);
      p.put(Math.round(cx) - 1, Math.round(cy), ".", LOTUS, 0.35);
      p.put(Math.round(cx) + 1, Math.round(cy), ".", LOTUS, 0.35);
    }
  }
}

const pond = (density: number): Habitat => (p) => {
  ripples(p, 1);
  lilyPads(p, density);
};

const shore: Habitat = (p) => {
  const SAND: RGB = [204, 172, 122];
  const SURF: RGB = [96, 160, 210];
  // Sand grain everywhere.
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      if (p.rand() < 0.07) p.put(c, r, pick(p, [".", ",", "`", "'"] as const), SAND, 0.3);
    }
  }
  // The sea along the top, with a wavy wet edge.
  const phase = between(p, 0, 6.28);
  for (let c = 0; c < p.cols; c++) {
    const edge = 2.5 + 1.6 * Math.sin(c * 0.11 + phase) + 0.8 * Math.sin(c * 0.37 + phase * 2);
    for (let r = 0; r < edge; r++) p.put(c, r, (c + r) % 3 ? "~" : "-", SURF, 0.4 - r * 0.04);
    p.put(c, Math.ceil(edge), ".", SURF, 0.45);
    if (p.rand() < 0.4) p.put(c, Math.ceil(edge) + 1, ",", SAND, 0.22);
  }
  // Shells and pebbles.
  const n = Math.round((p.cols * p.rows) / 700);
  for (let i = 0; i < n; i++) {
    const c = Math.floor(p.rand() * p.cols);
    const r = Math.floor(between(p, 6, p.rows));
    p.put(c, r, pick(p, ["@", "o", "v", "("] as const), [232, 204, 176], 0.5);
  }
};

const reeds: Habitat = (p) => {
  const STEM: RGB = [96, 150, 84];
  const HEAD: RGB = [150, 104, 64];
  // Water along the bottom.
  for (let r = p.rows - 3; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) if (p.rand() < 0.3) p.put(c, r, "~", WATER, 0.13);
  }
  // Clumps of reeds rising from it.
  for (let c = Math.floor(between(p, 0, 6)); c < p.cols; c += Math.floor(between(p, 7, 16))) {
    const stalks = 2 + Math.floor(p.rand() * 4);
    for (let s = 0; s < stalks; s++) {
      const x = c + Math.floor(between(p, -2, 3));
      const h = Math.floor(between(p, 0.12, 0.32) * p.rows);
      const base = p.rows - 2;
      for (let k = 0; k < h; k++) p.put(x, base - k, "|", STEM, 0.3);
      if (p.rand() < 0.6) {
        p.put(x, base - h, "#", HEAD, 0.42);
        p.put(x, base - h - 1, "#", HEAD, 0.42);
        p.put(x, base - h - 2, "'", STEM, 0.3);
      }
      // A leaf or two.
      const leaf = base - Math.floor(h * between(p, 0.3, 0.7));
      if (p.rand() < 0.7) {
        p.put(x - 1, leaf, "/", STEM, 0.26);
        p.put(x - 2, leaf - 1, "/", STEM, 0.2);
      } else {
        p.put(x + 1, leaf, "\\", STEM, 0.26);
        p.put(x + 2, leaf - 1, "\\", STEM, 0.2);
      }
    }
  }
};

const meadow: Habitat = (p) => {
  const GRASS: RGB = [104, 170, 92];
  const BLOOMS: RGB[] = [[244, 128, 176], [250, 204, 80], [180, 140, 250], [236, 240, 250], [250, 150, 90]];
  const grassRows = Math.max(4, Math.round(p.rows * 0.16));
  for (let r = p.rows - grassRows; r < p.rows; r++) {
    const depth = (r - (p.rows - grassRows)) / grassRows; // 0 top of the grass → 1 bottom
    for (let c = 0; c < p.cols; c++) {
      if (p.rand() < 0.25 + depth * 0.45) p.put(c, r, pick(p, ['"', ",", "'", "|", "v"] as const), GRASS, 0.12 + depth * 0.14);
    }
  }
  const flowers = Math.round(p.cols / 2.6);
  for (let i = 0; i < flowers; i++) {
    const c = Math.floor(p.rand() * p.cols);
    const top = p.rows - grassRows - Math.floor(between(p, 0, 7));
    for (let r = top + 1; r < p.rows - grassRows + 2; r++) p.put(c, r, "|", GRASS, 0.24);
    p.put(c, top, pick(p, ["*", "@", "o", "%"] as const), pick(p, BLOOMS), 0.5);
  }
};

const mountains: Habitat = (p) => {
  const ROCK: RGB = [132, 142, 176];
  const ridge = (phase: number, base: number, amp: number) => (c: number) =>
    base - amp * (0.55 * Math.sin(c * 0.045 + phase) + 0.3 * Math.sin(c * 0.13 + phase * 1.7) + 0.15 * Math.sin(c * 0.31 + phase * 2.3));
  const layers = [
    { line: ridge(between(p, 0, 6), p.rows * 0.7, p.rows * 0.16), fill: ".", alpha: 0.12 },
    { line: ridge(between(p, 0, 6), p.rows * 0.84, p.rows * 0.11), fill: ":", alpha: 0.2 },
  ];
  for (const { line, fill, alpha } of layers) {
    for (let c = 0; c < p.cols; c++) {
      const y = line(c);
      const slope = line(c + 1) - line(c - 1);
      const top = Math.round(y);
      p.put(c, top, Math.abs(slope) < 0.35 ? (slope < 0 ? "^" : "_") : slope < 0 ? "/" : "\\", ROCK, alpha * 2.6);
      for (let r = top + 1; r < p.rows; r++) if ((c + r) % 2 === 0) p.put(c, r, fill, ROCK, alpha);
    }
  }
  // A few long, thin clouds.
  const clouds = 3 + Math.floor(p.rand() * 3);
  for (let i = 0; i < clouds; i++) {
    const c0 = Math.floor(p.rand() * p.cols);
    const r = Math.floor(between(p, 1, p.rows * 0.35));
    const len = Math.floor(between(p, 6, 16));
    for (let k = 0; k < len; k++) p.put(c0 + k, r, k % 4 === 0 ? "-" : "~", [190, 200, 226], 0.1);
  }
};

const deepSea: Habitat = (p) => {
  const LIGHT: RGB = [96, 160, 220];
  // Light rays slanting down from the surface, fading with depth.
  const rays = 3 + Math.floor(p.rand() * 3);
  for (let i = 0; i < rays; i++) {
    const x0 = between(p, -0.1, 1) * p.cols;
    const width = between(p, 3, 8);
    for (let r = 0; r < p.rows * 0.8; r++) {
      const fade = 1 - r / (p.rows * 0.8);
      const cx = x0 + r * 0.45;
      for (let c = Math.floor(cx - width); c <= cx + width; c++) {
        if (p.rand() < 0.3 * fade) p.put(c, r, p.rand() < 0.5 ? ":" : ".", LIGHT, 0.24 * fade + 0.05);
      }
    }
  }
  // Marine snow drifting everywhere.
  const n = Math.round((p.cols * p.rows) / 80);
  for (let i = 0; i < n; i++) p.put(Math.floor(p.rand() * p.cols), Math.floor(p.rand() * p.rows), ".", [180, 200, 230], 0.22);
};

/** Habitat per animal key (also used by the mixed scenes). */
export const HABITATS: Record<string, Habitat> = {
  koi: pond(1),
  frogs: pond(1.6),
  crabs: shore,
  dragonflies: reeds,
  butterflies: meadow,
  cranes: mountains,
  jellyfish: deepSea,
};
