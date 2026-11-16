import { EnvironmentId, IEnvironment } from '../../types/environment';
import { UnderwaterWorld } from './UnderwaterWorld';
import { InteractiveWater } from './InteractiveWater';
import { FrogPond } from './FrogPond';
import { CosmicAurora } from './CosmicAurora';
import { Campfire } from './Campfire';
import { ZenGarden } from './ZenGarden';
import { Meadow } from './Meadow';
import { WinterPines } from './WinterPines';
import { FireflyForest } from './FireflyForest';
import { RainyCity } from './RainyCity';
import { CurlFlow } from '../flows/CurlFlow';
import { FishSchool } from '../animals/FishSchool';
import { Fireflies } from '../animals/Fireflies';

/** Creates any scene (world, animal or flow) by id. */
export function createEnvironment(id: EnvironmentId): IEnvironment {
  switch (id) {
    // Worlds
    case 'ripples':
      return new InteractiveWater();
    case 'frog-pond':
      return new FrogPond();
    case 'cosmic-aurora':
      return new CosmicAurora();
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
    // Animals
    case 'fish':
      return new FishSchool();
    case 'fireflies':
      return new Fireflies();
    // Flows
    case 'curl':
      return new CurlFlow();
    case 'underwater':
    default:
      return new UnderwaterWorld();
  }
}
