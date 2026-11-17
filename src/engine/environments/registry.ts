import { EnvironmentId, IEnvironment, SceneId } from '../../types/environment';
import { Butterflies } from '../animals/Butterflies';
import { Koi } from '../animals/Koi';
import { Jellyfish } from '../animals/Jellyfish';
import { Dragonflies } from '../animals/Dragonflies';
import { Frogs } from '../animals/Frogs';
import { Cranes } from '../animals/Cranes';
import { Crabs } from '../animals/Crabs';
import { AnimalBase } from '../animals/AnimalBase';
import { CustomImageScene } from './CustomImageScene';
import { Knob } from '../animals/kit';

/** Instantiates any of the 10 scenes (7 animals + 3 custom image slots). */
export function createEnvironment(id: EnvironmentId): IEnvironment {
  switch (id) {
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
    case 'custom-1':
      return new CustomImageScene('custom-1');
    case 'custom-2':
      return new CustomImageScene('custom-2');
    case 'custom-3':
      return new CustomImageScene('custom-3');
    default:
      return new Butterflies();
  }
}

export const ANIMAL_CLASSES: Record<string, typeof AnimalBase> = {
  butterflies: Butterflies,
  koi: Koi,
  jellyfish: Jellyfish,
  dragonflies: Dragonflies,
  frogs: Frogs,
  cranes: Cranes,
  crabs: Crabs,
};

export function knobsFor(id: SceneId): Knob[] {
  const cls = ANIMAL_CLASSES[id];
  return cls ? cls.allKnobs() : [];
}
