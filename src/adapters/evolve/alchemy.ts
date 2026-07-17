import type {
  AlchemyInput,
  AlchemyResourceView,
} from "../../domain/alchemy.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface AlchemyReaderDependencies {
  readonly getAlchemyManager: () => unknown;
  readonly getResources: () => unknown;
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly getAchievementStar: (id: string) => number;
}

function callNumber(
  record: UnknownRecord,
  name: string,
  ...args: unknown[]
): number {
  const method = requireFunction(record[name], `AlchemyManager.${name}`);
  return requireNumber(
    Reflect.apply(method, record, args),
    `AlchemyManager.${name}()`,
  );
}

function callBoolean(
  record: UnknownRecord,
  name: string,
  path: string,
): boolean {
  const method = requireFunction(record[name], `${path}.${name}`);
  return Boolean(Reflect.apply(method, record, []));
}

function readResources(manager: UnknownRecord): AlchemyResourceView[] {
  const list = requireFunction(
    manager["managedPriorityList"],
    "AlchemyManager.managedPriorityList",
  );
  const priorityList = Reflect.apply(list, manager, []);
  if (!Array.isArray(priorityList)) {
    throw new TypeError(
      "AlchemyManager.managedPriorityList() must return an array",
    );
  }
  return priorityList.map((entry, index) => {
    const path = `AlchemyManager.managedPriorityList()[${index}]`;
    const res = requireRecord(entry, path);
    const id = res["id"];
    if (typeof id !== "string") {
      throw new TypeError(`${path}.id must be a string`);
    }
    const instance = res["instance"];
    return Object.freeze({
      id,
      currentCount: callNumber(manager, "currentCount", id),
      weighting: callNumber(manager, "resWeighting", id),
      isUseful: callBoolean(res, "isUseful", path),
      transmuteTier: callNumber(manager, "transmuteTier", res),
      isBasic: Boolean(
        typeof instance === "object" && instance !== null
          ? (instance as UnknownRecord)["basic"]
          : false,
      ),
    });
  });
}

/** Legacy `game.global.tech.alchemy >= 2`: absent tech reads as 0 (never >= 2). */
function techLevel(game: UnknownRecord, name: string): number {
  const global = requireRecord(game["global"], "game.global");
  const tech = requireRecord(global["tech"], "game.global.tech");
  const value = tech[name];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function readAlchemyInput(
  dependencies: AlchemyReaderDependencies,
): AlchemyInput {
  const manager = requireRecord(
    dependencies.getAlchemyManager(),
    "AlchemyManager",
  );
  // Legacy returns immediately when locked, before reading anything else.
  if (!callBoolean(manager, "isUnlocked", "AlchemyManager")) {
    return Object.freeze({
      unlocked: false,
      crystalDemanded: false,
      manaRateOfChange: 0,
      manaStorageRatio: 0,
      manaCurrentQuantity: 0,
      crystalCurrentQuantity: 0,
      crystalRateOfChange: 0,
      autoPylon: false,
      magicAlchemyManaUse: 0,
      magicFullmetalHelper: false,
      universeMagic: false,
      alchemyTech: 0,
      fullmetalStar: 0,
      achievementLevel: 0,
      resources: Object.freeze([]),
    });
  }

  const settings = requireRecord(dependencies.getSettings(), "settings");
  const game = requireRecord(dependencies.getGame(), "game");
  const resourcesRecord = requireRecord(
    dependencies.getResources(),
    "resources",
  );
  const mana = requireRecord(resourcesRecord["Mana"], "resources.Mana");
  const crystal = requireRecord(
    resourcesRecord["Crystal"],
    "resources.Crystal",
  );
  const race = requireRecord(
    requireRecord(game["global"], "game.global")["race"],
    "game.global.race",
  );
  const alevel = requireFunction(game["alevel"], "game.alevel");

  return Object.freeze({
    unlocked: true,
    crystalDemanded: callBoolean(crystal, "isDemanded", "resources.Crystal"),
    manaRateOfChange: requireNumber(
      mana["rateOfChange"],
      "resources.Mana.rateOfChange",
    ),
    manaStorageRatio: requireNumber(
      mana["storageRatio"],
      "resources.Mana.storageRatio",
    ),
    manaCurrentQuantity: requireNumber(
      mana["currentQuantity"],
      "resources.Mana.currentQuantity",
    ),
    crystalCurrentQuantity: requireNumber(
      crystal["currentQuantity"],
      "resources.Crystal.currentQuantity",
    ),
    crystalRateOfChange: requireNumber(
      crystal["rateOfChange"],
      "resources.Crystal.rateOfChange",
    ),
    autoPylon: Boolean(settings["autoPylon"]),
    magicAlchemyManaUse: requireNumber(
      settings["magicAlchemyManaUse"],
      "settings.magicAlchemyManaUse",
    ),
    magicFullmetalHelper: Boolean(settings["magicFullmetalHelper"]),
    universeMagic: race["universe"] === "magic",
    alchemyTech: techLevel(game, "alchemy"),
    fullmetalStar: requireNumber(
      dependencies.getAchievementStar("fullmetal"),
      "fullmetal achievement star",
    ),
    achievementLevel: requireNumber(
      Reflect.apply(alevel, game, []),
      "game.alevel()",
    ),
    resources: Object.freeze(readResources(manager)),
  });
}
