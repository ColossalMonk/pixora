import { EnvironmentId, IEnvironment } from '../../types/environment';
import { UnderwaterWorld } from './UnderwaterWorld';
import { InteractiveWater } from './InteractiveWater';
import { FrogPond } from './FrogPond';
import { CosmicAurora } from './CosmicAurora';
import { AbstractFlow } from './AbstractFlow';

export const ENVIRONMENT_IDS: EnvironmentId[] = ['underwater', 'ripples', 'frog-pond', 'cosmic-aurora', 'abstract-flow'];

export function createEnvironment(id: EnvironmentId): IEnvironment {
  switch (id) {
    case 'ripples':
      return new InteractiveWater();
    case 'frog-pond':
      return new FrogPond();
    case 'cosmic-aurora':
      return new CosmicAurora();
    case 'abstract-flow':
      return new AbstractFlow();
    case 'underwater':
    default:
      return new UnderwaterWorld();
  }
}
