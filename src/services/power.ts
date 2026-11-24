import { useSyncExternalStore } from 'react';
import type { PowerMode } from '../types/settings';

/**
 * Low-power state shared by the canvases and the settings drawer.
 *
 * 'auto' turns low power on while the laptop runs on battery (Battery Status
 * API, where the browser has it) or once frames have been slow for a few
 * seconds on this machine. 'on' and 'off' force it. Browsers don't expose the
 * OS battery-saver switch, so battery and slow frames are the signals we have.
 */

/** A frame's own work (update + draw) above this many ms counts as slow: more than a 60 fps frame's whole budget. */
export const SLOW_FRAME_MS = 18;
/** How long frames must stay slow before auto mode steps in. */
export const SLOW_FOR_MS = 3000;

export type PowerReason = 'manual' | 'battery' | 'slow' | null;

/** Tracks frame cost with a moving average; flags the machine as slow once it stays high. */
export class SlowFrameMeter {
  private avg = 0;
  private slowSince = -1;
  public slow = false;

  /** Feed one frame's work time; returns true the moment the machine is judged slow. */
  report(workMs: number, now: number): boolean {
    if (this.slow) return false;
    this.avg = this.avg === 0 ? workMs : this.avg * 0.9 + workMs * 0.1;
    if (this.avg > SLOW_FRAME_MS) {
      if (this.slowSince < 0) this.slowSince = now;
      if (now - this.slowSince >= SLOW_FOR_MS) {
        this.slow = true;
        return true;
      }
    } else {
      this.slowSince = -1;
    }
    return false;
  }
}

/** Pure decision, kept separate so it can be tested. */
export function lowPowerReason(mode: PowerMode, onBattery: boolean, slow: boolean): PowerReason {
  if (mode === 'on') return 'manual';
  if (mode === 'off') return null;
  if (onBattery) return 'battery';
  if (slow) return 'slow';
  return null;
}

type BatteryLike = EventTarget & { charging: boolean };

let mode: PowerMode = 'auto';
let onBattery = false;
let reason: PowerReason = null;
const meter = new SlowFrameMeter();
const listeners = new Set<() => void>();

function recompute() {
  const next = lowPowerReason(mode, onBattery, meter.slow);
  if (next === reason) return;
  reason = next;
  listeners.forEach((fn) => fn());
}

let batteryWatched = false;
function watchBattery() {
  if (batteryWatched) return;
  batteryWatched = true;
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  nav.getBattery?.()
    .then((b) => {
      const sync = () => {
        onBattery = !b.charging;
        recompute();
      };
      sync();
      b.addEventListener('chargingchange', sync);
    })
    .catch(() => {});
}

export const Power = {
  setMode(next: PowerMode) {
    mode = next;
    watchBattery();
    recompute();
  },
  /** Canvases report each drawn frame's work time (ms). */
  reportFrame(workMs: number) {
    // Hidden tabs are throttled, so their timings say nothing about the machine.
    if (mode !== 'auto' || document.hidden) return;
    if (meter.report(workMs, performance.now())) recompute();
  },
  get low() {
    return reason !== null;
  },
  get reason() {
    return reason;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** React: current low-power reason (null when off). */
export function usePowerReason(): PowerReason {
  return useSyncExternalStore(Power.subscribe, () => Power.reason, () => null);
}
