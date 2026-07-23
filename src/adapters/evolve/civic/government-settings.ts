import {
  createGovernmentSettingsReadModel,
  type GovernmentSettingsOption,
  type GovernmentSettingsReadModel,
} from "../../../domain/civic/government-settings.ts";
import { requireRecord } from "../../validation.ts";

interface GovernmentSettingsEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getGovernmentManager: () => unknown;
  readonly getGovernors: () => unknown;
}

export interface GovernmentSettingsEvolveAdapter {
  readGovernmentSettingsReadModel(): GovernmentSettingsReadModel;
}

function requireObjectRecord(value: unknown, path: string) {
  if (Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return requireRecord(value, path);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readLocalizedOption(
  id: string,
  localize: (key: string) => unknown,
  game: Record<PropertyKey, unknown>,
): GovernmentSettingsOption {
  return {
    val: id,
    label: requireString(
      Reflect.apply(localize, game, [`govern_${id}`]),
      `game.loc(govern_${id}) result`,
    ),
    hint: requireString(
      Reflect.apply(localize, game, [`govern_${id}_desc`]),
      `game.loc(govern_${id}_desc) result`,
    ),
  };
}

/** Maps volatile Evolve government definitions and governor ids to a read model. */
export function createGovernmentSettingsEvolveAdapter({
  getGame,
  getGovernmentManager,
  getGovernors,
}: GovernmentSettingsEvolveDependencies): GovernmentSettingsEvolveAdapter {
  function readGovernmentSettingsReadModel(): GovernmentSettingsReadModel {
    const game = requireObjectRecord(getGame(), "game");
    const rawLocalize = game["loc"];
    if (typeof rawLocalize !== "function") {
      throw new TypeError("game.loc must be a function");
    }
    const localize = (key: string): unknown =>
      Reflect.apply(rawLocalize, game, [key]);
    const manager = requireObjectRecord(
      getGovernmentManager(),
      "GovernmentManager",
    );
    const rawTypes = requireObjectRecord(
      manager["Types"],
      "GovernmentManager.Types",
    );
    const governmentOptions: GovernmentSettingsOption[] = [
      { val: "none", label: "None", hint: "Do not select government" },
    ];
    for (const [key, rawType] of Object.entries(rawTypes)) {
      const type = requireObjectRecord(
        rawType,
        `GovernmentManager.Types.${key}`,
      );
      if (type["selectable"] === false) continue;
      const id = requireString(type["id"], `GovernmentManager.Types.${key}.id`);
      governmentOptions.push(readLocalizedOption(id, localize, game));
    }

    const rawGovernors = getGovernors();
    if (!Array.isArray(rawGovernors)) {
      throw new TypeError("governors must be an array");
    }
    const governorOptions: GovernmentSettingsOption[] = [
      { val: "none", label: "None", hint: "Do not select governor" },
    ];
    rawGovernors.forEach((rawGovernor, index) => {
      const id = requireString(rawGovernor, `governors[${index}]`);
      governorOptions.push({
        val: id,
        label: requireString(
          localize(`governor_${id}`),
          `game.loc(governor_${id}) result`,
        ),
        hint: requireString(
          localize(`governor_${id}_desc`),
          `game.loc(governor_${id}_desc) result`,
        ),
      });
    });

    return createGovernmentSettingsReadModel({
      governmentOptions,
      governorOptions,
    });
  }

  return Object.freeze({ readGovernmentSettingsReadModel });
}
