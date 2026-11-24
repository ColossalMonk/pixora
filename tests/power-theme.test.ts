import { describe, expect, it } from 'vitest';
import { SLOW_FOR_MS, SLOW_FRAME_MS, SlowFrameMeter, lowPowerReason } from '../src/services/power';
import { resolveTheme } from '../src/services/theme';
import { frameDelayMs } from '../src/engine/image-converter/AnimatedImage';

describe('lowPowerReason', () => {
  it('follows the setting when forced', () => {
    expect(lowPowerReason('on', false, false)).toBe('manual');
    expect(lowPowerReason('off', true, true)).toBeNull();
  });

  it('auto: battery first, then slow frames, else off', () => {
    expect(lowPowerReason('auto', true, true)).toBe('battery');
    expect(lowPowerReason('auto', false, true)).toBe('slow');
    expect(lowPowerReason('auto', false, false)).toBeNull();
  });
});

describe('SlowFrameMeter', () => {
  const run = (meter: SlowFrameMeter, ms: number, from: number, to: number) => {
    let tripped = false;
    for (let t = from; t <= to; t += 16) tripped = meter.report(ms, t) || tripped;
    return tripped;
  };

  it('never trips on fast frames', () => {
    const m = new SlowFrameMeter();
    expect(run(m, 6, 0, 20_000)).toBe(false);
    expect(m.slow).toBe(false);
  });

  it('needs slow frames for the whole window before tripping', () => {
    const m = new SlowFrameMeter();
    expect(run(m, SLOW_FRAME_MS * 2, 0, SLOW_FOR_MS - 500)).toBe(false);
    expect(run(m, SLOW_FRAME_MS * 2, SLOW_FOR_MS - 484, SLOW_FOR_MS + 600)).toBe(true);
    expect(m.slow).toBe(true);
  });

  it('a run of fast frames resets the clock', () => {
    const m = new SlowFrameMeter();
    run(m, SLOW_FRAME_MS * 2, 0, 2500);
    run(m, 2, 2516, 4000); // average falls back under the line
    expect(run(m, SLOW_FRAME_MS * 2, 4016, 5500)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('uses the setting, or the OS when set to system', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });
});

describe('frameDelayMs (GIF / WebP timing)', () => {
  it('stretches 0–10 ms delays to 100 ms, like browsers do', () => {
    expect(frameDelayMs(null)).toBe(100);
    expect(frameDelayMs(0)).toBe(100);
    expect(frameDelayMs(10_000)).toBe(100);
  });

  it('keeps real delays (microseconds → ms)', () => {
    expect(frameDelayMs(50_000)).toBe(50);
    expect(frameDelayMs(1_000_000)).toBe(1000);
  });
});
