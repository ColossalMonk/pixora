import { BaseEnvironment } from '../environments/BaseEnvironment';
import { hex } from '../core/Color';

/**
 * Base for animals. Alone, an animal sits on a plain dark backdrop with the
 * cell grid (the ascii-animals look). Layered over a world, the world's
 * backdrop shows instead and the animal keeps to `ctx.habitat`.
 */
export abstract class AnimalBase extends BaseEnvironment {
  public readonly preferredStyle = 'tiles' as const;
  public readonly backdrop = [hex('#0b0c12'), hex('#0d0f16'), hex('#0b0c12')];
}
