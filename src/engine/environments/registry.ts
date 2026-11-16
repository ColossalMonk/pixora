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
import { ImageWorld } from './ImageWorld';
import { CurlFlow } from '../flows/CurlFlow';
import { MagneticFlow } from '../flows/MagneticFlow';
import { WindFlow } from '../flows/WindFlow';
import { AttractorFlow } from '../flows/AttractorFlow';
import { ContoursFlow } from '../flows/ContoursFlow';
import { VortexFlow } from '../flows/VortexFlow';
import { FishSchool } from '../animals/FishSchool';
import { Fireflies } from '../animals/Fireflies';
import { Butterflies } from '../animals/Butterflies';
import { Koi } from '../animals/Koi';
import { Jellyfish } from '../animals/Jellyfish';
import { Dragonflies } from '../animals/Dragonflies';
import { Frogs } from '../animals/Frogs';
import { Cranes } from '../animals/Cranes';
import { Crabs } from '../animals/Crabs';
import { Starlings } from '../animals/Starlings';
import { AnimalBase } from '../animals/AnimalBase';
import { Knob } from '../animals/kit';

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
    case 'your-image':
      return new ImageWorld();
    // Animals
    case 'fish':
      return new FishSchool();
    case 'fireflies':
      return new Fireflies();
    case 'butterflies':
      return new Butterflies();
    case 'koi':
      return new Koi();
    case 'jellyfish':
      return new Jellyfish();
    case 'dragonflies':
      return new Dragonflies();
    case 'frogs':
      return new Frogs();
    case 'cranes':
      return new Cranes();
    case 'crabs':
      return new Crabs();
    case 'starlings':
      return new Starlings();
    // Flows
    case 'curl':
      return new CurlFlow();
    case 'magnetic':
      return new MagneticFlow();
    case 'wind':
      return new WindFlow();
    case 'attractor':
      return new AttractorFlow();
    case 'contours':
      return new ContoursFlow();
    case 'vortex':
      return new VortexFlow();
    case 'underwater':
    default:
      return new UnderwaterWorld();
  }
}

const ANIMAL_CLASSES: Record<string, typeof AnimalBase> = {
  fish: FishSchool as unknown as typeof AnimalBase,
  fireflies: Fireflies as unknown as typeof AnimalBase,
  butterflies: Butterflies as unknown as typeof AnimalBase,
  koi: Koi as unknown as typeof AnimalBase,
  jellyfish: Jellyfish as unknown as typeof AnimalBase,
  dragonflies: Dragonflies as unknown as typeof AnimalBase,
  frogs: Frogs as unknown as typeof AnimalBase,
  cranes: Cranes as unknown as typeof AnimalBase,
  crabs: Crabs as unknown as typeof AnimalBase,
  starlings: Starlings as unknown as typeof AnimalBase,
};

/** Tweaks-panel knobs for an animal (shared + its own). */
export function knobsFor(id: string): Knob[] {
  const cls = ANIMAL_CLASSES[id];
  return cls ? cls.allKnobs() : [];
}
