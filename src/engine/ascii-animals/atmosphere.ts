/**
 * Pixora addition: live weather and time of day over the animal scenes.
 *
 * Everything is drawn into the same ASCII cell grid as the animals, behind
 * them (rain streaks pick their glyph from their angle, so wind slants them
 * to / or \). Fog fades everything toward the background, storms add rain and
 * the odd lightning bolt, clear nights get stars. The time of day tints the
 * backdrop (night blue, golden dawn and dusk) and grades animal colours.
 */
import type { RGB } from "./ink";
import { clamp, rand } from "./math";
import type { DayPhase, WeatherKind } from "../core/Sky";

export interface AtmosphereInput {
  kind: WeatherKind;
  /** 0..1 how heavy the rain / snow / fog is. */
  intensity: number;
  /** Wind along the screen, km/h: + blows left → right. */
  windKmh: number;
  /** 0 deep night … 1 full day. */
  light: number;
  /** 0..1 golden-hour glow. */
  warm: number;
  phase: DayPhase;
}

/** Calm, clear midday: the scenes as designed. */
export const CALM: AtmosphereInput = { kind: "clear", intensity: 0, windKmh: 0, light: 1, warm: 0, phase: "day" };

/** What the drawing needs from the renderer (kept small so this file stays testable). */
export interface AtmosphereCanvas {
  readonly width: number;
  readonly height: number;
  readonly theme: "light" | "dark";
  line(x0: number, y0: number, x1: number, y1: number, color: RGB, fog: number, tip?: string): void;
  dot(x: number, y: number, glyph: string, color: RGB, fog: number): void;
}

interface Drop {
  x: number;
  y: number;
  /** 0.3 far … 1 near: speed, length and how much it fades. */
  depth: number;
  /** Snow: sway phase. */
  phase: number;
}

interface Bolt {
  points: { x: number; y: number }[];
  age: number;
}

/** Rain shows the wind much more than creatures do, so a breeze visibly slants it. */
const RAIN_SLANT = 8;

/** Wind in km/h → horizontal push in px/s for creatures fully exposed to it. */
export const windPush = (kmh: number) => clamp(kmh, -80, 80) * 2.2;

/** How many drops/flakes to keep for this screen and weather. */
export function particleCount(kind: WeatherKind, intensity: number, width: number, height: number): number {
  const area = (width * height) / (1440 * 900);
  const k = clamp(intensity, 0, 1);
  if (kind === "rain") return Math.round((60 + 260 * k) * area);
  if (kind === "storm") return Math.round((220 + 200 * k) * area);
  if (kind === "snow") return Math.round((120 + 320 * k) * area);
  return 0;
}

export class Atmosphere {
  input: AtmosphereInput = CALM;
  private drops: Drop[] = [];
  private stars: { x: number; y: number; t: number; glyph: string }[] = [];
  private bolt: Bolt | null = null;
  private nextBolt = 6;
  private time = 0;
  /** Lightning flash brightness 0..1 (the renderer lightens the backdrop by it). */
  flash = 0;

  set(input: AtmosphereInput) {
    this.input = input;
  }

  /** Extra fade toward the background for fog (0 none … ~0.6 thick). */
  get fogAmount() {
    const { kind, intensity } = this.input;
    if (kind === "fog") return 0.25 + 0.35 * intensity;
    if (kind === "storm" || kind === "rain") return 0.08 * intensity;
    if (kind === "snow") return 0.12 * intensity;
    return 0;
  }

  /** Horizontal push on exposed creatures, px/s, with slow gusts. */
  get wind() {
    const base = windPush(this.input.windKmh);
    const gust = 1 + 0.35 * Math.sin(this.time * 0.7) * Math.sin(this.time * 0.23 + 1.3);
    return base * gust;
  }

  update(dt: number, width: number, height: number) {
    this.time += dt;
    const { kind, intensity } = this.input;
    const want = particleCount(kind, intensity, width, height);
    while (this.drops.length > want) this.drops.pop();
    while (this.drops.length < want) {
      this.drops.push({ x: rand(-0.2, 1.2) * width, y: rand(-0.1, 1) * height, depth: rand(0.3, 1), phase: rand(0, 6.28) });
    }
    const wind = this.wind;
    const snowy = kind === "snow";
    for (const d of this.drops) {
      if (snowy) {
        d.y += (28 + 46 * d.depth) * dt;
        d.x += (wind * 0.5 * d.depth + Math.sin(this.time * 1.3 + d.phase) * 18) * dt;
      } else {
        d.y += (520 + 520 * d.depth) * dt;
        d.x += wind * RAIN_SLANT * d.depth * dt;
      }
      if (d.y > height + 20) {
        d.y = rand(-60, -10);
        d.x = rand(-0.2, 1.2) * width;
      }
      if (d.x < -0.25 * width) d.x += 1.5 * width;
      if (d.x > 1.25 * width) d.x -= 1.5 * width;
    }

    // Stars on clear or cloudy nights, made once per screen size.
    if (this.stars.length === 0 || Math.abs(this.stars.length - Math.round((width * height) / 9000)) > 20) {
      this.stars = Array.from({ length: Math.round((width * height) / 9000) }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        t: rand(0, 6.28),
        glyph: Math.random() < 0.82 ? "." : Math.random() < 0.6 ? "+" : "*",
      }));
    }

    // Storms: a bolt every few seconds, a flash that fades fast.
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (this.bolt) {
      this.bolt.age += dt;
      if (this.bolt.age > 0.35) this.bolt = null;
    }
    if (kind === "storm") {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = rand(4, 11) / (0.6 + intensity * 0.6);
        this.flash = 0.55 + 0.4 * Math.random();
        this.bolt = { points: boltPath(rand(0.15, 0.85) * width, height * rand(0.45, 0.75)), age: 0 };
      }
    } else {
      this.nextBolt = 3;
    }
  }

  /**
   * Draws weather into the cells; call before the animals so they sit in front.
   * `water`: the scene looks down on water, so rain lands as splash rings instead of falling streaks.
   */
  draw(canvas: AtmosphereCanvas, water = false) {
    const { kind, light } = this.input;
    const dark = canvas.theme === "dark";

    // Stars: clear or cloudy nights, dark theme (on white they would read as dust).
    const night = 1 - light;
    if (dark && night > 0.3 && (kind === "clear" || kind === "cloudy")) {
      const visible = (night - 0.3) / 0.7 * (kind === "cloudy" ? 0.35 : 1);
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        if ((i % 100) / 100 > visible) continue;
        const tw = 0.5 + 0.5 * Math.sin(this.time * 1.7 + s.t * 3);
        canvas.dot(s.x, s.y, tw > 0.85 && s.glyph === "." ? "+" : s.glyph, [200, 214, 255], 0.35 + 0.45 * (1 - tw));
      }
    }

    if ((kind === "rain" || kind === "storm") && water) {
      // Seen from above: each drop lands somewhere fixed and rings out ' → o → .
      const color: RGB = dark ? [160, 196, 240] : [60, 90, 140];
      const H = canvas.height;
      for (const d of this.drops) {
        const age = ((d.y + 60) / (H + 80)) * 2.5 % 1;
        if (age > 0.6) continue;
        const glyph = age < 0.12 ? "'" : age < 0.36 ? "o" : ".";
        canvas.dot(d.x, (d.phase / 6.283) * H, glyph, color, 0.25 + age);
      }
    } else if (kind === "rain" || kind === "storm") {
      const color: RGB = dark ? [150, 182, 230] : [70, 96, 140];
      const slant = this.wind * RAIN_SLANT;
      for (const d of this.drops) {
        const len = 0.018 + 0.016 * d.depth;
        const vy = 520 + 520 * d.depth;
        canvas.line(d.x - slant * d.depth * len, d.y - vy * len, d.x, d.y, color, 0.75 - 0.55 * d.depth);
      }
    } else if (kind === "snow") {
      const color: RGB = dark ? [232, 240, 255] : [96, 112, 140];
      for (const d of this.drops) canvas.dot(d.x, d.y, d.depth > 0.72 ? "*" : d.depth > 0.48 ? "+" : ".", color, 0.42 - 0.42 * d.depth);
    }

    if (this.bolt) {
      const color: RGB = dark ? [235, 240, 255] : [60, 64, 120];
      const p = this.bolt.points;
      const fade = this.bolt.age / 0.35;
      for (let i = 1; i < p.length; i++) canvas.line(p[i - 1].x, p[i - 1].y, p[i].x, p[i].y, color, fade * 0.8);
    }
  }

  /**
   * Backdrop for this time of day: [top, bottom] colours. Dark: deep blue at
   * night, a little lifted by day, warm at the horizon around sunrise and sunset.
   * Light: white by day, cool at night, cream at golden hour.
   */
  backdrop(base: RGB, theme: "light" | "dark"): [RGB, RGB] {
    const { light, warm, kind } = this.input;
    const grey = kind === "cloudy" || kind === "rain" || kind === "storm" || kind === "fog" ? 1 : 0;
    if (theme === "dark") {
      // By day this stays close to the designed backdrop; night sinks into deep blue.
      const night: RGB = [4, 7, 20];
      let top = mixRgb(night, mixRgb(base, [12, 16, 28], 0.5), light);
      let bottom = mixRgb(mixRgb(base, [4, 6, 16], 0.6), base, light);
      bottom = mixRgb(bottom, [46, 20, 30], warm * 0.55);
      top = mixRgb(top, [24, 18, 40], warm * 0.35);
      if (grey) {
        top = mixRgb(top, [16, 18, 22], 0.4);
        bottom = mixRgb(bottom, [14, 16, 20], 0.3);
      }
      return [top, bottom];
    }
    let top = mixRgb([236, 240, 250], base, light);
    let bottom = mixRgb([240, 242, 250], base, light);
    bottom = mixRgb(bottom, [255, 236, 214], warm * 0.6);
    top = mixRgb(top, [246, 236, 250], warm * 0.3);
    if (grey) {
      top = mixRgb(top, [228, 231, 236], 0.5);
      bottom = mixRgb(bottom, [232, 234, 238], 0.35);
    }
    return [top, bottom];
  }

  /** Grades an animal colour for the time of day (dark theme: dimmer and bluer at night, warmer at golden hour). */
  grade(c: RGB, theme: "light" | "dark"): RGB {
    const { light, warm } = this.input;
    let out = c;
    if (theme === "dark" && light < 1) {
      const k = 0.72 + 0.28 * light;
      out = mixRgb([out[0] * k, out[1] * k, out[2] * k], [40, 56, 110], (1 - light) * 0.14);
    }
    if (warm > 0) out = mixRgb(out, [245, 158, 11], warm * 0.12);
    return out;
  }
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** A jagged bolt from the top of the screen down to `bottom`. */
function boltPath(x: number, bottom: number) {
  const points = [{ x, y: -10 }];
  let px = x;
  let py = -10;
  while (py < bottom) {
    py += rand(24, 60);
    px += rand(-40, 40);
    points.push({ x: px, y: py });
  }
  return points;
}
