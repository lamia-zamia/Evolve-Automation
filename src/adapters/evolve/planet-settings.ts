import {
  createPlanetSettingsReadModel,
  type PlanetSettingsCell,
  type PlanetSettingsReadModel,
} from "../../domain/planet-settings.ts";
import { requireRecord } from "../validation.ts";

interface PlanetSettingsEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getBiomeList: () => unknown;
  readonly getTraitList: () => unknown;
  readonly getExtraList: () => unknown;
}

export interface PlanetSettingsEvolveAdapter {
  readPlanetSettingsReadModel(): PlanetSettingsReadModel;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return value.map((item, index) => requireString(item, `${path}[${index}]`));
}

/** Maps volatile Evolve planet lists and localization to table cells. */
export function createPlanetSettingsEvolveAdapter({
  getGame,
  getBiomeList,
  getTraitList,
  getExtraList,
}: PlanetSettingsEvolveDependencies): PlanetSettingsEvolveAdapter {
  function readPlanetSettingsReadModel(): PlanetSettingsReadModel {
    const game = requireRecord(getGame(), "game");
    const rawLocalize = game["loc"];
    if (typeof rawLocalize !== "function") {
      throw new TypeError("game.loc must be a function");
    }
    const localize = (key: string): unknown =>
      Reflect.apply(rawLocalize, game, [key]);
    const biomeIds = requireStringArray(getBiomeList(), "biomeList");
    const traitIds = requireStringArray(getTraitList(), "traitList");
    const extraIds = requireStringArray(getExtraList(), "extraList");

    const biomes: PlanetSettingsCell[] = biomeIds.map((id) => ({
      label: requireString(
        localize(`biome_${id}_name`),
        `game.loc(biome_${id}_name) result`,
      ),
      settingName: `biome_w_${id}`,
    }));
    const traits: PlanetSettingsCell[] = traitIds.map((id, index) => ({
      label:
        index === 0
          ? "None"
          : requireString(
              localize(`planet_${id}`),
              `game.loc(planet_${id}) result`,
            ),
      settingName: `trait_w_${id}`,
    }));
    const extras: PlanetSettingsCell[] = extraIds.map((id) => ({
      label: id,
      settingName: `extra_w_${id}`,
    }));

    return createPlanetSettingsReadModel({ biomes, traits, extras });
  }

  return Object.freeze({ readPlanetSettingsReadModel });
}
