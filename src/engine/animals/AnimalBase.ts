import { BaseEnvironment } from '../environments/BaseEnvironment';
import { hex } from '../core/Color';
import { Knob, SHARED_KNOBS, Tuning, defaultsOf } from './kit';

/**
 * Base for animals. Alone, an animal sits on a plain dark backdrop with the
 * cell grid (the ascii-animals look). Layered over a world, the world's
 * backdrop shows instead and the animal keeps to `ctx.habitat`.
 */
export abstract class AnimalBase extends BaseEnvironment {
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#0b0c12'), hex('#0d0f16'), hex('#0b0c12')];
  /** Animal-specific knobs (shared ones are added automatically). */
  public static knobs: Knob[] = [];
  protected tuning: Tuning;

  constructor() {
    super();
    this.tuning = defaultsOf((this.constructor as typeof AnimalBase).knobs);
  }

  /** All knobs this animal exposes, for the Tweaks panel. */
  public static allKnobs(this: typeof AnimalBase): Knob[] {
    return [...SHARED_KNOBS, ...this.knobs];
  }

  /** Applies saved tweaks; unknown keys are ignored, missing keys keep defaults. */
  public tune(values: Tuning | undefined): void {
    const defaults = defaultsOf((this.constructor as typeof AnimalBase).knobs);
    this.tuning = { ...defaults, ...(values ?? {}) };
  }

  protected k(key: string): number {
    return this.tuning[key];
  }
}
