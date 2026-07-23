import type {
  AlchemyAdjustment,
  AlchemyDecision,
  AlchemyInput,
  AlchemyResourceView,
} from "../../domain/economy/production/alchemy.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
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

interface SampledAlchemyResource {
  readonly id: string;
  readonly resource: UnknownRecord;
  readonly currentCount: number;
  weighting: number;
  isUseful: boolean;
  transmuteTier: number;
  isBasic: boolean;
}

function readBaseResources(manager: UnknownRecord): SampledAlchemyResource[] {
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
    return {
      id,
      resource: res,
      currentCount: callNumber(manager, "currentCount", id),
      weighting: 0,
      isUseful: false,
      transmuteTier: 0,
      isBasic: false,
    };
  });
}

function sampleActiveResources(
  manager: UnknownRecord,
  resources: readonly SampledAlchemyResource[],
): void {
  for (const resource of resources) {
    resource.weighting = callNumber(manager, "resWeighting", resource.id);
    if (resource.weighting > 0) {
      resource.isUseful = callBoolean(
        resource.resource,
        "isUseful",
        `AlchemyManager.managedPriorityList().${resource.id}`,
      );
    }
  }
}

function sampleFullmetalResources(
  manager: UnknownRecord,
  resources: readonly SampledAlchemyResource[],
): void {
  for (const resource of resources) {
    resource.transmuteTier = callNumber(
      manager,
      "transmuteTier",
      resource.resource,
    );
    if (resource.transmuteTier <= 1) {
      continue;
    }
    const instance = resource.resource["instance"];
    resource.isBasic = Boolean(
      typeof instance === "object" && instance !== null
        ? (instance as UnknownRecord)["basic"]
        : false,
    );
    if (!resource.isBasic) {
      break;
    }
  }
}

function freezeResources(
  resources: readonly SampledAlchemyResource[],
): readonly AlchemyResourceView[] {
  return Object.freeze(
    resources.map(({ resource: _resource, ...view }) => Object.freeze(view)),
  );
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
  const resourcesValue = dependencies.getResources();
  const settingsValue = dependencies.getSettings();
  const gameValue = dependencies.getGame();
  const manager = requireRecord(
    dependencies.getAlchemyManager(),
    "AlchemyManager",
  );
  // The legacy getter bag was refreshed before this gate; preserve those calls
  // while avoiding validation of irrelevant locked state.
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

  const sampledResources = readBaseResources(manager);
  const settings = requireRecord(settingsValue, "settings");
  const game = requireRecord(gameValue, "game");
  const resourcesRecord = requireRecord(resourcesValue, "resources");
  const mana = requireRecord(resourcesRecord["Mana"], "resources.Mana");
  const crystal = requireRecord(
    resourcesRecord["Crystal"],
    "resources.Crystal",
  );
  const crystalDemanded = callBoolean(
    crystal,
    "isDemanded",
    "resources.Crystal",
  );

  let manaRateOfChange = 0;
  let manaStorageRatio = 0;
  let manaCurrentQuantity = 0;
  let crystalCurrentQuantity = 0;
  let crystalRateOfChange = 0;
  let autoPylon = false;
  let magicAlchemyManaUse = 0;
  if (!crystalDemanded) {
    sampleActiveResources(manager, sampledResources);
    manaRateOfChange = requireNumber(
      mana["rateOfChange"],
      "resources.Mana.rateOfChange",
    );
    manaStorageRatio = requireNumber(
      mana["storageRatio"],
      "resources.Mana.storageRatio",
    );
    crystalCurrentQuantity = requireNumber(
      crystal["currentQuantity"],
      "resources.Crystal.currentQuantity",
    );
    crystalRateOfChange = requireNumber(
      crystal["rateOfChange"],
      "resources.Crystal.rateOfChange",
    );
    autoPylon = Boolean(settings["autoPylon"]);
    magicAlchemyManaUse = requireNumber(
      settings["magicAlchemyManaUse"],
      "settings.magicAlchemyManaUse",
    );
  }

  const magicFullmetalHelper = Boolean(settings["magicFullmetalHelper"]);
  let universeMagic = false;
  let alchemyTech = 0;
  let fullmetalStar = 0;
  let achievementLevel = 0;
  let fullmetalEnabled = false;
  if (magicFullmetalHelper) {
    const race = requireRecord(
      requireRecord(game["global"], "game.global")["race"],
      "game.global.race",
    );
    universeMagic = race["universe"] === "magic";
    if (universeMagic) {
      alchemyTech = techLevel(game, "alchemy");
      if (alchemyTech >= 2) {
        fullmetalStar = requireNumber(
          dependencies.getAchievementStar("fullmetal"),
          "fullmetal achievement star",
        );
        const alevel = requireFunction(game["alevel"], "game.alevel");
        achievementLevel = requireNumber(
          Reflect.apply(alevel, game, []),
          "game.alevel()",
        );
        if (fullmetalStar < achievementLevel) {
          manaCurrentQuantity = requireNumber(
            mana["currentQuantity"],
            "resources.Mana.currentQuantity",
          );
          if (manaCurrentQuantity >= 1) {
            if (crystalDemanded) {
              crystalCurrentQuantity = requireNumber(
                crystal["currentQuantity"],
                "resources.Crystal.currentQuantity",
              );
            }
            fullmetalEnabled = crystalCurrentQuantity >= 0.15;
          }
        }
      }
    }
  }
  if (fullmetalEnabled) {
    sampleFullmetalResources(manager, sampledResources);
  }

  return Object.freeze({
    unlocked: true,
    crystalDemanded,
    manaRateOfChange,
    manaStorageRatio,
    manaCurrentQuantity,
    crystalCurrentQuantity,
    crystalRateOfChange,
    autoPylon,
    magicAlchemyManaUse,
    magicFullmetalHelper,
    universeMagic,
    alchemyTech,
    fullmetalStar,
    achievementLevel,
    resources: freezeResources(sampledResources),
  });
}

export function createAlchemyCommandExecutor(
  getAlchemyManager: () => unknown,
): DecisionExecutor<AlchemyDecision> {
  function execute(decision: Readonly<AlchemyDecision>) {
    if (decision.decrease.length === 0 && decision.increase.length === 0) {
      return SUCCEEDED;
    }
    const manager = requireRecord(getAlchemyManager(), "AlchemyManager");
    const currentCount = requireFunction(
      manager["currentCount"],
      "AlchemyManager.currentCount",
    );
    const transmuteLess = requireFunction(
      manager["transmuteLess"],
      "AlchemyManager.transmuteLess",
    );
    const transmuteMore = requireFunction(
      manager["transmuteMore"],
      "AlchemyManager.transmuteMore",
    );
    const adjustments: readonly Readonly<AlchemyAdjustment>[] = [
      ...decision.decrease,
      ...decision.increase,
    ];
    for (const adjustment of adjustments) {
      if (!Number.isSafeInteger(adjustment.count) || adjustment.count < 0) {
        return rejected(
          "invalid-alchemy-adjustment",
          "alchemy adjustment count must be a non-negative safe integer",
        );
      }
      const actual = requireNumber(
        Reflect.apply(currentCount, manager, [adjustment.id]),
        `AlchemyManager.currentCount(${adjustment.id})`,
      );
      if (actual !== adjustment.expectedCurrentCount) {
        return stale("stale-alchemy-count", "alchemy count changed", {
          resourceId: adjustment.id,
          expected: adjustment.expectedCurrentCount,
          actual,
        });
      }
    }
    for (const adjustment of decision.decrease) {
      Reflect.apply(transmuteLess, manager, [adjustment.id, adjustment.count]);
    }
    for (const adjustment of decision.increase) {
      Reflect.apply(transmuteMore, manager, [adjustment.id, adjustment.count]);
    }
    return SUCCEEDED;
  }

  return Object.freeze({ execute });
}
