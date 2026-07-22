import { requireFunction, requireRecord } from "../validation.ts";
import {
  createMechSettingsReadModel,
  type MechSettingsReadModel,
  type MechSettingsOption,
} from "../../domain/mech-settings.ts";
import type { MechSettingsReader } from "../../ports/mech-settings.ts";
export interface MechSettingsEvolveDependencies {
  readonly getMechManager: () => unknown;
  readonly getGame: () => unknown;
}
function requireString(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${path} must be a string`);
  return value;
}
export function createMechSettingsEvolveAdapter({
  getMechManager,
  getGame,
}: MechSettingsEvolveDependencies): MechSettingsReader {
  return Object.freeze({
    read(): MechSettingsReadModel {
      const manager = requireRecord(getMechManager(), "MechManager");
      const game = requireRecord(getGame(), "game");
      const loc = requireFunction(game["loc"], "game.loc");
      if (!Array.isArray(manager["Size"]))
        throw new TypeError("MechManager.Size must be an array");
      const options: MechSettingsOption[] = [
        {
          val: "auto",
          label: "Damage Per Size",
          hint: "Select affordable mech with most damage per size on current floor",
        },
        {
          val: "gems",
          label: "Damage Per Gems",
          hint: "Select affordable mech with most damage per gems on current floor",
        },
        {
          val: "supply",
          label: "Damage Per Supply",
          hint: "Select affordable mech with most damage per supply on current floor",
        },
      ];
      manager["Size"].forEach((rawId, index) => {
        const id = requireString(rawId, `MechManager.Size[${index}]`);
        options.push({
          val: id,
          label: requireString(
            Reflect.apply(loc, game, [`portal_mech_size_${id}`]),
            `game.loc(portal_mech_size_${id})`,
          ),
          hint: requireString(
            Reflect.apply(loc, game, [`portal_mech_size_${id}_desc`]),
            `game.loc(portal_mech_size_${id}_desc)`,
          ),
        });
      });
      return createMechSettingsReadModel(
        Object.freeze(options.map((option) => Object.freeze(option))),
      );
    },
  });
}
