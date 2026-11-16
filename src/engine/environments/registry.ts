import { EnvironmentId, IEnvironment } from '../../types/environment';
import { UnderwaterWorld } from './UnderwaterWorld';
import { InteractiveWater } from './InteractiveWater';
import { FrogPond } from './FrogPond';
import { CosmicAurora } from './CosmicAurora';
import { AbstractFlow } from './AbstractFlow';
import { Campfire } from './Campfire';
import { ZenGarden } from './ZenGarden';
import { Meadow } from './Meadow';
import { WinterPines } from './WinterPines';
import { FireflyForest } from './FireflyForest';
import { RainyCity } from './RainyCity';

export const ENVIRONMENT_IDS: EnvironmentId[] = [
  'underwater',
  'campfire',
  'ripples',
  'meadow',
  'cosmic-aurora',
  'zen-garden',
  'frog-pond',
  'winter-pines',
  'firefly-forest',
  'rainy-city',
  'abstract-flow',
];

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
    case 'campfire':
      return new Campfire();
    case 'zen-garden':
      return new ZenGarden();
    case 'meadow':
      return new Meadow();
    case 'winter-pines':
      return new WinterPines();
    case 'firefly-forest':
      return new FireflyForest();
    case 'rainy-city':
      return new RainyCity();
    case 'underwater':
    default:
      return new UnderwaterWorld();
  }
}
