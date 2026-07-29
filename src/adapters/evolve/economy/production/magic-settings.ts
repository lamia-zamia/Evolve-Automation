import {
  createMagicSettingsReadModel,
  type MagicAlchemyRow,
  type MagicPylonRow,
  type MagicSettingsReadModel,
} from "../../../../domain/economy/production/magic-settings.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../../validation.ts";

interface MagicSettingsEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getAlchemyManager: () => unknown;
  readonly getRitualManager: () => unknown;
}

export interface MagicSettingsEvolveAdapter {
  readMagicSettingsReadModel(): MagicSettingsReadModel;
}

function readPriorityList(manager: UnknownRecord): readonly UnknownRecord[] {
  const priorityList = manager["priorityList"];
  if (!Array.isArray(priorityList)) {
    throw new TypeError("AlchemyManager.priorityList must be an array");
  }
  return priorityList.map((resource, index) =>
    requireRecord(resource, `AlchemyManager.priorityList[${index}]`),
  );
}

/** Maps volatile Magic managers and localization to a validated read model. */
export function createMagicSettingsEvolveAdapter({
  getGame,
  getAlchemyManager,
  getRitualManager,
}: MagicSettingsEvolveDependencies): MagicSettingsEvolveAdapter {
  function readMagicSettingsReadModel(): MagicSettingsReadModel {
    const game = requireRecord(getGame(), "game");
    const localize = requireFunction(game["loc"], "game.loc");
    const alchemyManager = requireRecord(getAlchemyManager(), "AlchemyManager");
    const resources = readPriorityList(alchemyManager);
    const transmuteTier = requireFunction(
      alchemyManager["transmuteTier"],
      "AlchemyManager.transmuteTier",
    );
    const alchemyRows: MagicAlchemyRow[] = resources.map((resource, index) => {
      const path = `AlchemyManager.priorityList[${index}]`;
      const id = requireString(resource["id"], `${path}.id`);
      const tier = requireNumber(
        Reflect.apply(transmuteTier, alchemyManager, [resource]),
        `${path}.transmuteTier result`,
      );
      return {
        id,
        label: requireString(resource["name"], `${path}.name`),
        color: tier > 1 ? "has-text-advanced" : "has-text-info",
        enabledSettingName: `res_alchemy_${id}`,
        weightingSettingName: `res_alchemy_w_${id}`,
      };
    });

    const ritualManager = requireRecord(getRitualManager(), "RitualManager");
    const productions = requireRecord(
      ritualManager["Productions"],
      "RitualManager.Productions",
    );
    const pylonRows: MagicPylonRow[] = Object.entries(productions).map(
      ([key, rawProduction]) => {
        const production = requireRecord(
          rawProduction,
          `RitualManager.Productions.${key}`,
        );
        const id = requireString(
          production["id"],
          `RitualManager.Productions.${key}.id`,
        );
        return {
          id,
          label: requireString(
            Reflect.apply(localize, game, [`modal_pylon_spell_${id}`]),
            `game.loc(modal_pylon_spell_${id}) result`,
          ),
          weightingSettingName: `spell_w_${id}`,
        };
      },
    );

    return createMagicSettingsReadModel({ alchemyRows, pylonRows });
  }

  return Object.freeze({ readMagicSettingsReadModel });
}
