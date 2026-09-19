/**
 * Captured read model for the Planet Weighting table.
 *
 * Every cell here is a weight the captured planet planner actually spends: `biome_w_<biome>`,
 * `trait_w_<trait>` and `extra_w_<id>` (including the two pseudo-deposits `Achievement` and
 * `Orbit`) are read by `captured-planet-selection.ts` when it builds the ranking input. Before
 * that ranking existed the whole table would have been inert, which is why it was not drawn.
 *
 * The id lists are the same ones `computePlanetDefaults` uses, so a weight cannot be defaulted
 * without a row, or drawn without a default. Labels come from `captured-planet-labels.ts`.
 */

import {
  createPlanetSettingsReadModel,
  type PlanetSettingsCell,
  type PlanetSettingsReadModel,
} from "../../../../domain/progression/evolution/planet-settings.ts";
import { biomeList, extraList, traitList } from "../../runtime-catalogs.ts";
import { capturedPlanetLabel } from "./captured-planet-labels.ts";

const capturedPlanetBiomeCells: readonly PlanetSettingsCell[] = Object.freeze(
  biomeList.map((id) =>
    Object.freeze({
      label: capturedPlanetLabel(id),
      settingName: `biome_w_${id}`,
    }),
  ),
);

const capturedPlanetTraitCells: readonly PlanetSettingsCell[] = Object.freeze(
  traitList.map((id) =>
    Object.freeze({
      label: capturedPlanetLabel(id),
      settingName: `trait_w_${id}`,
    }),
  ),
);

// The extra ids are already the game's resource names, plus the script's own `Achievement` and
// `Orbit` weights, so they are their own labels.
const capturedPlanetExtraCells: readonly PlanetSettingsCell[] = Object.freeze(
  extraList.map((id) =>
    Object.freeze({ label: id, settingName: `extra_w_${id}` }),
  ),
);

export interface CapturedPlanetSettingsAdapter {
  readPlanetSettingsReadModel(): PlanetSettingsReadModel;
}

export function createCapturedPlanetSettingsAdapter(): CapturedPlanetSettingsAdapter {
  const readModel = createPlanetSettingsReadModel({
    biomes: capturedPlanetBiomeCells,
    traits: capturedPlanetTraitCells,
    extras: capturedPlanetExtraCells,
  });
  return Object.freeze({
    readPlanetSettingsReadModel: () => readModel,
  });
}
