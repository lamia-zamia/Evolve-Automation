import { createCustomRaceModel } from "../game/custom-race-model.ts";

type Dependencies = Parameters<typeof createCustomRaceModel>[0];

const GENUS_OPPOSITION = {
  humanoid: ["fungi"],
  carnivore: ["herbivore"],
  herbivore: ["carnivore"],
  small: ["giant"],
  giant: ["small"],
  reptilian: ["avian"],
  avian: ["reptilian"],
  insectoid: ["plant"],
  plant: ["insectoid"],
  fungi: ["humanoid"],
  aquatic: ["sand"],
  fey: ["eldritch", "synthetic"],
  heat: ["polar"],
  polar: ["heat"],
  sand: ["aquatic"],
  demonic: ["angelic"],
  angelic: ["demonic"],
  synthetic: ["eldritch", "fey"],
  eldritch: ["synthetic", "fey"],
};

export interface CustomRaceModelControlDependencies {
  readonly getGame: () => unknown;
  readonly getPoly: () => unknown;
  readonly getResources: () => unknown;
  readonly getRaces: () => unknown;
}

export function createCustomRaceModelControl({
  getGame,
  getPoly,
  getResources,
  getRaces,
}: CustomRaceModelControlDependencies) {
  return createCustomRaceModel({
    getGame: getGame as Dependencies["getGame"],
    getPoly: getPoly as Dependencies["getPoly"],
    getResources: getResources as Dependencies["getResources"],
    getRaces: getRaces as Dependencies["getRaces"],
    genusOpposition: GENUS_OPPOSITION,
  });
}
