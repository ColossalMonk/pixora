import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, fromLegacy, sanitize } from '../src/store/useSettingsStore';

describe('sanitize (loading saved settings)', () => {
  it('keeps known settings of the right type', () => {
    const out = sanitize({ userName: 'Sam', fontSize: 16, showClock: false, activeScene: 'koi' });
    expect(out).toEqual({ userName: 'Sam', fontSize: 16, showClock: false, activeScene: 'koi' });
  });

  it('drops unknown keys and values of the wrong type', () => {
    const out = sanitize({ mystery: 1, fontSize: '16', shortcuts: 'github', showClock: 'yes' });
    expect(out).toEqual({});
  });

  it('drops a scene that no longer exists (a v2.0 world), so the default animal opens', () => {
    expect(sanitize({ activeScene: 'meadow' })).toEqual({});
    expect(sanitize({ activeScene: 'custom-2' })).toEqual({ activeScene: 'custom-2' });
  });

  it('only accepts known power and theme modes', () => {
    expect(sanitize({ powerMode: 'turbo', appearance: 'blue' })).toEqual({});
    expect(sanitize({ powerMode: 'on', appearance: 'light' })).toEqual({ powerMode: 'on', appearance: 'light' });
  });

  it('ignores null and undefined', () => {
    expect(sanitize({ userName: null, weatherCity: undefined })).toEqual({});
  });
});

describe('fromLegacy (v2.0 → current)', () => {
  it('turns the last animal into the scene and drops old animal tweaks', () => {
    const legacy = { activeAnimal: 'cranes', animalTweaks: { cranes: { flap: 2 } }, userName: 'Sam', shortcuts: [] };
    const out = sanitize(fromLegacy(legacy));
    expect(out.activeScene).toBe('cranes');
    expect(out.userName).toBe('Sam');
    expect(out.shortcuts).toEqual([]);
    expect(out.animalTweaks).toBeUndefined();
  });

  it('falls back to the default scene when the old one is gone', () => {
    expect(sanitize(fromLegacy({ activeAnimal: 'ocean-world' })).activeScene).toBeUndefined();
  });
});

describe('defaults', () => {
  it('starts on auto power and the system theme', () => {
    expect(DEFAULT_SETTINGS.powerMode).toBe('auto');
    expect(DEFAULT_SETTINGS.appearance).toBe('system');
  });
});
