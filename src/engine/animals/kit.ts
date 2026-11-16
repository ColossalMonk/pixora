/**
 * Shared toolkit for animals (ideas after ascii-animals, MIT — reimplemented).
 *
 * - **Course**: one slowly turning heading every creature travels along.
 *   A creature that leaves on the downstream side re-enters upstream, so the
 *   screen never empties or crowds.
 * - **Depth**: each creature gets a fixed depth 0 (far) … 1 (near) that sets
 *   its size, speed (parallax) and how much it fades into the background.
 * - **Population** scales with habitat area so phones and ultrawides feel equally alive.
 * - **Knobs**: every animal declares tunable values; the Tweaks panel edits them.
 */
import { Habitat, Zone } from '../../types/environment';
import { mix } from '../core/Color';

/** Narrows a world's habitat to the zone an animal lives in. */
export function zoneOf(h: Habitat, zone: Zone): Habitat {
  if (zone === 'sky' && h.skyBottom !== undefined) return { ...h, bottom: Math.max(h.top + 80, h.skyBottom - 10) };
  if (zone === 'water' && h.waterY !== undefined) return { ...h, top: Math.max(h.top, h.waterY + 10) };
  if (zone === 'ground' && h.groundY !== undefined) return { ...h, top: Math.max(h.top, h.groundY - 240), bottom: h.groundY };
  return h;
}

export interface Knob {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  hint?: string;
}

/** Knobs every animal has. */
export const SHARED_KNOBS: Knob[] = [
  { key: 'density', label: 'How many', min: 0.2, max: 3, step: 0.05, value: 1, hint: 'Population, relative to screen size.' },
  { key: 'size', label: 'Size', min: 0.5, max: 2, step: 0.05, value: 1 },
  { key: 'speed', label: 'Speed', min: 0.2, max: 3, step: 0.05, value: 1 },
  { key: 'farthest', label: 'Depth range', min: 0, max: 0.9, step: 0.05, value: 0.35, hint: 'How far away the farthest ones can be. 0 = all close.' },
  { key: 'fog', label: 'Haze', min: 0, max: 1, step: 0.05, value: 0.6, hint: 'How much far creatures fade into the background.' },
];

export type Tuning = Record<string, number>;

export function defaultsOf(knobs: Knob[]): Tuning {
  const t: Tuning = {};
  for (const k of [...SHARED_KNOBS, ...knobs]) t[k.key] = k.value;
  return t;
}

export interface Creature {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  /** 0 far … 1 near. */
  depth: number;
  /** Random -1..1 offset used for lane spread / personality. */
  bias: number;
  seed: number;
  phase: number;
}

export class Course {
  /** Current travel direction (radians). */
  public heading = 0;
  private base = 0;
  private wobble = 0;
  public time = 0;

  constructor(baseHeading = 0, wobble = 0.35) {
    this.base = baseHeading;
    this.heading = baseHeading;
    this.wobble = wobble;
  }

  public step(dt: number): void {
    this.time += dt;
    this.heading = this.base + Math.sin(this.time * 0.05) * this.wobble + Math.sin(this.time * 0.013 + 1.7) * this.wobble * 0.6;
  }

  /**
   * Re-enters a creature that left the habitat: on the upstream edge, at a
   * random point along it, weighted by how much of that edge the course crosses.
   */
  public recycle(c: Creature, h: Habitat, margin: number): boolean {
    const out = c.x < h.left - margin || c.x > h.right + margin || c.y < h.top - margin || c.y > h.bottom + margin;
    if (!out) return false;
    const dx = Math.cos(this.heading);
    const dy = Math.sin(this.heading);
    const w = h.right - h.left;
    const hh = h.bottom - h.top;
    const horiz = Math.abs(dx) * hh;
    const vert = Math.abs(dy) * w;
    if (Math.random() * (horiz + vert) < horiz) {
      c.x = dx > 0 ? h.left - margin * 0.8 : h.right + margin * 0.8;
      c.y = h.top + Math.random() * hh;
    } else {
      c.y = dy > 0 ? h.top - margin * 0.8 : h.bottom + margin * 0.8;
      c.x = h.left + Math.random() * w;
    }
    c.heading = this.heading + c.bias * 0.3;
    return true;
  }
}

/** Depth from a fixed roll: farthest + (1 - farthest) · roll^bias. */
export function rollDepth(farthest: number, bias = 1.3): number {
  return farthest + (1 - farthest) * Math.pow(Math.random(), bias);
}

/** How many creatures fit: habitat area / area-per-creature × density × quality. */
export function population(h: Habitat, areaEach: number, density: number, quality: number, min = 1, max = 400): number {
  const area = Math.max(1, (h.right - h.left) * (h.bottom - h.top));
  return Math.max(min, Math.min(max, Math.round((area / areaEach) * density * quality)));
}

export function newCreature(id: number, h: Habitat, farthest: number): Creature {
  return {
    id,
    x: h.left + Math.random() * (h.right - h.left),
    y: h.top + Math.random() * (h.bottom - h.top),
    vx: 0,
    vy: 0,
    heading: 0,
    depth: rollDepth(farthest),
    bias: Math.random() * 2 - 1,
    seed: Math.random() * 1000,
    phase: Math.random() * Math.PI * 2,
  };
}

/** Parallax factors for a depth. */
export const depthScale = (d: number) => 0.55 + 0.45 * d;
export const depthSpeed = (d: number) => 0.55 + 0.45 * d;

/** Fades a colour toward the background by depth. */
export function hazed(color: number, depth: number, fog: number, bg: number): number {
  return mix(color, bg, (1 - depth) * fog);
}

/** Turns `from` toward `to` by at most `max` radians. */
export function turnToward(from: number, to: number, max: number): number {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return from + Math.max(-max, Math.min(max, d));
}

/** Keeps creatures apart within the same depth band (cheap O(n²), fine for < 80). */
export function separate<T extends Creature>(list: T[], radius: number, dt: number, strength = 1): void {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (Math.abs(a.depth - b.depth) > 0.18) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const push = ((radius - d) / radius) * strength * 60 * dt;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }
}
