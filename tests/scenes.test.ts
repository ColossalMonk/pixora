import { describe, expect, it } from 'vitest';
import { CATALOG, sceneForKey, sceneLabel, stepScene } from '../src/data/catalog';
import { frameFileName } from '../src/services/capture';

describe('stepScene (← → and the chip arrows)', () => {
  it('moves to the next and previous scene', () => {
    expect(stepScene('butterflies', 1)).toBe('koi');
    expect(stepScene('koi', -1)).toBe('butterflies');
  });

  it('wraps around both ends', () => {
    const first = CATALOG[0].id;
    const last = CATALOG[CATALOG.length - 1].id;
    expect(stepScene(last, 1)).toBe(first);
    expect(stepScene(first, -1)).toBe(last);
  });

  it('starts from the first scene when the current one is unknown', () => {
    expect(stepScene('nope', 1)).toBe(CATALOG[1].id);
  });
});

describe('sceneForKey (number keys)', () => {
  it('maps 1–9 to the first nine scenes and 0 to the tenth', () => {
    expect(sceneForKey('1')).toBe(CATALOG[0].id);
    expect(sceneForKey('9')).toBe(CATALOG[8].id);
    expect(sceneForKey('0')).toBe(CATALOG[9].id);
  });

  it('ignores other keys', () => {
    expect(sceneForKey('a')).toBeNull();
    expect(sceneForKey('10')).toBeNull();
  });
});

describe('sceneLabel', () => {
  it("uses a custom slot's own name, trimmed, or the catalog name", () => {
    expect(sceneLabel('custom-1', { 'custom-1': { name: '  Cat in leaves ' } })).toBe('Cat in leaves');
    expect(sceneLabel('custom-1', { 'custom-1': { name: '   ' } })).toBe('Custom Art 1');
    expect(sceneLabel('koi')).toBe('Koi Fish');
  });
});

describe('frameFileName (Save frame)', () => {
  it('slugs the scene and stamps the date and time', () => {
    const at = new Date(2026, 0, 5, 9, 7);
    expect(frameFileName('Koi Fish', at)).toBe('pixora-koi-fish-2026-01-05-0907.png');
    expect(frameFileName('Cat in Leaves!!', at)).toBe('pixora-cat-in-leaves-2026-01-05-0907.png');
    expect(frameFileName('***', at)).toBe('pixora-scene-2026-01-05-0907.png');
  });
});
