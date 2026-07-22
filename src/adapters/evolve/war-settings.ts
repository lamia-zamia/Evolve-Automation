import { requireFunction, requireRecord } from "../validation.ts";
import {
  createWarSettingsReadModel,
  type WarSettingsReadModel,
  type WarSettingsOption,
} from "../../domain/war-settings.ts";
import type { WarSettingsReader } from "../../ports/war-settings.ts";

export interface WarSettingsEvolveDependencies {
  readonly getSpyManager: () => unknown;
  readonly getGame: () => unknown;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${path} must be a string`);
  return value;
}

export function createWarSettingsEvolveAdapter({
  getSpyManager,
  getGame,
}: WarSettingsEvolveDependencies): WarSettingsReader {
  return Object.freeze({
    read(): WarSettingsReadModel {
      const spyManager = requireRecord(getSpyManager(), "SpyManager");
      const types = requireRecord(spyManager["Types"], "SpyManager.Types");
      const game = requireRecord(getGame(), "game");
      const loc = requireFunction(game["loc"], "game.loc");
      const policyOptions: WarSettingsOption[] = [
        { val: "Ignore", label: "Ignore", hint: "" },
      ];
      for (const [name, rawTask] of Object.entries(types)) {
        const task = requireRecord(rawTask, `SpyManager.Types.${name}`);
        const id = requireString(task["id"], `SpyManager.Types.${name}.id`);
        policyOptions.push({
          val: name,
          label: requireString(
            Reflect.apply(loc, game, [`civics_spy_${id}`]),
            `game.loc(civics_spy_${id})`,
          ),
          hint: "",
        });
      }
      policyOptions.push({ val: "Occupy", label: "Occupy", hint: "" });
      return createWarSettingsReadModel(policyOptions);
    },
  });
}
