import type {
  DemandCost,
  DemandCrafter,
  DemandCrafterCost,
  DemandFactoryCost,
  DemandFactoryProduction,
  DemandMission,
  DemandPrioritizationInput,
  DemandPrioritizationSettings,
  DemandSavingTarget,
  DemandTarget,
  DemandTech,
} from "../../../../domain/economy/resources/demand-prioritization.ts";
import { planTruepathAiApocalypse } from "../../../../domain/progression/truepath/ai-apocalypse.ts";
import {
  callBoolean,
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../../validation.ts";

export interface DemandPrioritizationReaderDependencies {
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getBuildingManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getCrafter: () => unknown;
  readonly getSpyManager: () => unknown;
  readonly getFleetManagerOuter: () => unknown;
  readonly getJobManager: () => unknown;
  readonly getFactoryManager: () => unknown;
  readonly getIsEarlyGame: () => boolean;
  readonly isProject: (target: unknown) => boolean;
  readonly isInflationAssistActive: () => boolean;
  readonly isRetirementAssistActive: () => boolean;
  readonly getInflationChallengeMoney: () => number;
  readonly getRetirementGraphene: () => number;
  readonly consumptionBalanceTarget: number;
}

/** Legacy `for..in object.cost`: a missing or non-record cost contributes nothing. */
function readCosts(value: unknown, path: string): DemandCost[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as UnknownRecord;
  const costs: DemandCost[] = [];
  for (const key in record) {
    costs.push(
      Object.freeze({
        resourceId: key,
        amount: requireNumber(record[key], `${path}.${key}`),
      }),
    );
  }
  return costs;
}

/** Legacy reads `progress! < 99`, so an absent/non-finite progress must be null. */
function readProgress(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTarget(
  raw: UnknownRecord,
  path: string,
  isProject: (target: unknown) => boolean,
): DemandTarget {
  return Object.freeze({
    costs: Object.freeze(readCosts(raw["cost"], `${path}.cost`)),
    isProject: isProject(raw),
    progress: readProgress(raw["progress"]),
  });
}

function targetList(
  value: unknown,
  path: string,
  isProject: (target: unknown) => boolean,
): DemandTarget[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return value.map((entry, index) => {
    const record = requireRecord(entry, `${path}[${index}]`);
    return readTarget(record, `${path}[${index}]`, isProject);
  });
}

/**
 * The highest weighted candidate the build loop wants and cannot yet afford.
 *
 * The candidate list comes from the building manager rather than
 * `state.unlockedBuildings`, which `updatePriorityTargets` clears immediately
 * before this pass runs and autoBuild only republishes afterwards. Each
 * candidate's `weighting` is therefore the previous tick's; the ordering
 * changes slowly and a one-tick lag only delays a demand by one tick.
 *
 * Projects are deliberately not candidates. autoARPA buys them one segment at a
 * time, so a project reads as unaffordable for the tick after each segment
 * without being blocked on anything, and `cost` on a project is the whole
 * remaining project - demanding that would park the run's entire income behind
 * a target that is already progressing.
 *
 * "Cannot afford" uses the same pair of checks the build queue uses for
 * `maximumAffordable`: storage must be able to hold the cost at all, and the
 * cost must not be met right now. A target storage can never hold is not
 * something to save for.
 */
function readSavingTarget(manager: unknown): DemandSavingTarget | null {
  const record = requireRecord(manager, "BuildingManager");
  const list = requireFunction(
    record["managedPriorityList"],
    "BuildingManager.managedPriorityList",
  );
  const entries: unknown = Reflect.apply(list, record, []);
  if (!Array.isArray(entries)) {
    throw new TypeError(
      "BuildingManager.managedPriorityList() must return an array",
    );
  }
  const candidates = entries.map((entry, index) => {
    const path = `BuildingManager.managedPriorityList()[${index}]`;
    const candidate = requireRecord(entry, path);
    return {
      record: candidate,
      weighting: requireNumber(candidate["weighting"], `${path}.weighting`),
    };
  });
  candidates.sort((left, right) => right.weighting - left.weighting);
  for (const candidate of candidates) {
    const path = "saving candidate";
    if (!callBoolean(candidate.record, "isAffordable", path, true)) continue;
    if (callBoolean(candidate.record, "isAffordable", path)) continue;
    return Object.freeze({
      name: requireString(candidate.record["title"], `${path}.title`),
      costs: Object.freeze(readCosts(candidate.record["cost"], `${path}.cost`)),
    });
  }
  return null;
}

function readMissions(
  value: unknown,
  blackhole: unknown,
  isProject: (target: unknown) => boolean,
): DemandMission[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`state.missionBuildingList must be an array`);
  }
  return value.map((entry, index) => {
    const path = `state.missionBuildingList[${index}]`;
    const record = requireRecord(entry, path);
    return Object.freeze({
      isUnlocked: callBoolean(record, "isUnlocked", path),
      autoBuildEnabled: Boolean(record["autoBuildEnabled"]),
      isComplete: callBoolean(record, "isComplete", path),
      isBlackholeJumpShip: entry === blackhole,
      target: readTarget(record, path, isProject),
    });
  });
}

function readCrafters(
  value: unknown,
  resources: UnknownRecord,
): DemandCrafter[] {
  const crafter = requireRecord(value, "crafter");
  const crafters: DemandCrafter[] = [];
  for (const id in crafter) {
    const path = `crafter.${id}`;
    const entry = requireRecord(crafter[id], path);
    const resource = requireRecord(entry["resource"], `${path}.resource`);
    const cost = requireRecord(resource["cost"], `${path}.resource.cost`);
    const costs: DemandCrafterCost[] = [];
    for (const resourceId in cost) {
      const material = requireRecord(
        resources[resourceId],
        `resources.${resourceId}`,
      );
      costs.push(
        Object.freeze({
          resourceId,
          amount: requireNumber(
            cost[resourceId],
            `${path}.resource.cost.${resourceId}`,
          ),
          materialMaxQuantity: requireNumber(
            material["maxQuantity"],
            `resources.${resourceId}.maxQuantity`,
          ),
        }),
      );
    }
    crafters.push(
      Object.freeze({
        // isDemanded/isUnlocked are always-present Resource methods (legacy `!`).
        isDemanded: callBoolean(resource, "isDemanded", `${path}.resource`),
        isUnlocked: callBoolean(resource, "isUnlocked", `${path}.resource`),
        craftPreserve: requireNumber(
          resource["craftPreserve"],
          `${path}.resource.craftPreserve`,
        ),
        costs: Object.freeze(costs),
      }),
    );
  }
  return crafters;
}

function readFactoryCosts(value: unknown, path: string): DemandFactoryCost[] {
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry, index) => {
    const costPath = Array.isArray(value) ? `${path}[${index}]` : path;
    const cost = requireRecord(entry, costPath);
    const resource = requireRecord(cost["resource"], `${costPath}.resource`);
    const resourceId = resource["id"];
    if (typeof resourceId !== "string") {
      throw new TypeError(`${costPath}.resource.id must be a string`);
    }
    const minRate = cost["minRateOfChange"];
    return Object.freeze({
      quantity: requireNumber(cost["quantity"], `${costPath}.quantity`),
      // Legacy `cost.minRateOfChange ?? 0`.
      minRateOfChange:
        minRate == null
          ? 0
          : requireNumber(minRate, `${costPath}.minRateOfChange`),
      resourceId,
      resourceMaxQuantity: requireNumber(
        resource["maxQuantity"],
        `${costPath}.resource.maxQuantity`,
      ),
    });
  });
}

function readFactoryProductions(value: unknown): DemandFactoryProduction[] {
  const productions = requireRecord(value, "FactoryManager.Productions");
  return Object.values(productions).map((entry, index) => {
    const path = `FactoryManager.Productions[${index}]`;
    const production = requireRecord(entry, path);
    const resource = requireRecord(production["resource"], `${path}.resource`);
    const weighting = production["weighting"];
    return Object.freeze({
      isDemanded: callBoolean(resource, "isDemanded", `${path}.resource`),
      unlocked: Boolean(production["unlocked"]),
      enabled: Boolean(production["enabled"]),
      // Legacy uses `weighting` only as a truthiness gate.
      weighting:
        typeof weighting === "number" && Number.isFinite(weighting)
          ? weighting
          : 0,
      costs: Object.freeze(
        readFactoryCosts(production["cost"], `${path}.cost`),
      ),
    });
  });
}

function readSettings(value: unknown): DemandPrioritizationSettings {
  const settings = requireRecord(value, "settings");
  const string = (name: string): string => {
    const raw = settings[name];
    if (typeof raw !== "string") {
      throw new TypeError(`settings.${name} must be a string`);
    }
    return raw;
  };
  return Object.freeze({
    prioritizeQueue: string("prioritizeQueue"),
    prioritizeTriggers: string("prioritizeTriggers"),
    missionRequest: Boolean(settings["missionRequest"]),
    prestigeBioseedConstruct: Boolean(settings["prestigeBioseedConstruct"]),
    prestigeType: string("prestigeType"),
    researchRequest: Boolean(settings["researchRequest"]),
    researchRequestSpace: Boolean(settings["researchRequestSpace"]),
    prioritizeUnify: string("prioritizeUnify"),
    autoFleet: Boolean(settings["autoFleet"]),
    prioritizeOuterFleet: string("prioritizeOuterFleet"),
    productionFactoryFocusMaterials: Boolean(
      settings["productionFactoryFocusMaterials"],
    ),
    autoPower: Boolean(settings["autoPower"]),
    productionFactoryMinIngredients: requireNumber(
      settings["productionFactoryMinIngredients"],
      "settings.productionFactoryMinIngredients",
    ),
  });
}

export function readDemandPrioritizationInput(
  dependencies: DemandPrioritizationReaderDependencies,
): DemandPrioritizationInput {
  const { isProject } = dependencies;
  const state = requireRecord(dependencies.getState(), "state");
  const resources = requireRecord(dependencies.getResources(), "resources");
  const buildings = requireRecord(dependencies.getBuildings(), "buildings");
  const spyManager = requireRecord(dependencies.getSpyManager(), "SpyManager");
  const fleet = requireRecord(
    dependencies.getFleetManagerOuter(),
    "FleetManagerOuter",
  );
  const jobManager = requireRecord(dependencies.getJobManager(), "JobManager");
  const factoryManager = requireRecord(
    dependencies.getFactoryManager(),
    "FactoryManager",
  );
  const settings = readSettings(dependencies.getSettings());
  const vitreloy = requireRecord(
    buildings["Alien1VitreloyPlant"],
    "buildings.Alien1VitreloyPlant",
  );

  const craftingMax = requireFunction(
    jobManager["craftingMax"],
    "JobManager.craftingMax",
  );
  const skilledServantsMax = requireFunction(
    jobManager["skilledServantsMax"],
    "JobManager.skilledServantsMax",
  );
  const maxOperating = requireFunction(
    factoryManager["maxOperating"],
    "FactoryManager.maxOperating",
  );

  const spyPurchaseMoney = requireNumber(
    spyManager["purchaseMoney"],
    "SpyManager.purchaseMoney",
  );

  return Object.freeze({
    settings,
    isEarlyGame: dependencies.getIsEarlyGame(),
    consumptionBalanceTarget: dependencies.consumptionBalanceTarget,
    truepathAiBuildingTarget: readTruepathAiBuildingTarget(
      dependencies.getGame,
      buildings,
      isProject,
      settings.prestigeType,
    ),
    inflationMoney: dependencies.isInflationAssistActive()
      ? requireNumber(
          dependencies.getInflationChallengeMoney(),
          "inflation challenge money",
        )
      : null,
    retirementGraphene: dependencies.isRetirementAssistActive()
      ? requireNumber(
          dependencies.getRetirementGraphene(),
          "retirement graphene",
        )
      : null,
    queuedTargets: Object.freeze(
      targetList(state["queuedTargets"], "state.queuedTargets", isProject),
    ),
    triggerTargets: Object.freeze(
      targetList(state["triggerTargets"], "state.triggerTargets", isProject),
    ),
    savingTarget: readSavingTarget(dependencies.getBuildingManager()),
    missions: Object.freeze(
      readMissions(
        state["missionBuildingList"],
        buildings["BlackholeJumpShip"],
        isProject,
      ),
    ),
    unlockedTechs: Object.freeze(readTechs(state["unlockedTechs"], isProject)),
    spyPurchaseMoney,
    fleet: Object.freeze({
      nextShipAffordable: Boolean(fleet["nextShipAffordable"]),
      nextShipCost: Object.freeze(
        readCosts(fleet["nextShipCost"], "FleetManagerOuter.nextShipCost"),
      ),
    }),
    availableCrafters:
      requireNumber(
        Reflect.apply(craftingMax, jobManager, []),
        "JobManager.craftingMax()",
      ) +
      requireNumber(
        Reflect.apply(skilledServantsMax, jobManager, []),
        "JobManager.skilledServantsMax()",
      ),
    crafters: Object.freeze(readCrafters(dependencies.getCrafter(), resources)),
    vitreloyPlant: Object.freeze({
      autoStateEnabled: requireBoolean(
        vitreloy["autoStateEnabled"],
        "buildings.Alien1VitreloyPlant.autoStateEnabled",
      ),
      count: requireNumber(
        vitreloy["count"],
        "buildings.Alien1VitreloyPlant.count",
      ),
      stateOnCount: requireNumber(
        vitreloy["stateOnCount"],
        "buildings.Alien1VitreloyPlant.stateOnCount",
      ),
    }),
    factoryCount: requireNumber(
      Reflect.apply(maxOperating, factoryManager, []),
      "FactoryManager.maxOperating()",
    ),
    factoryProductions: Object.freeze(
      readFactoryProductions(factoryManager["Productions"]),
    ),
  });
}

function readTruepathAiBuildingTarget(
  getGame: () => unknown,
  buildings: UnknownRecord,
  isProject: (target: unknown) => boolean,
  prestigeType: string,
): DemandTarget | null {
  const game = requireRecord(getGame(), "game");
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  if (!race["truepath"] || prestigeType !== "apocalypse") return null;

  const tech = requireRecord(global["tech"], "game.global.tech");
  const coreLevel = tech["titan_ai_core"];
  if (
    typeof coreLevel !== "number" ||
    !Number.isFinite(coreLevel) ||
    coreLevel < 3
  ) {
    return null;
  }

  const decoder = requireRecord(
    buildings["TitanDecoder"],
    "buildings.TitanDecoder",
  );
  const colonist = requireRecord(
    buildings["TitanAIColonist"],
    "buildings.TitanAIColonist",
  );
  const trooper = requireRecord(
    buildings["ErisTrooper"],
    "buildings.ErisTrooper",
  );
  const tank = requireRecord(buildings["ErisTank"], "buildings.ErisTank");
  const readMoneyCost = (building: UnknownRecord): number | null => {
    const value = building["cost"];
    if (typeof value !== "object" || value === null) return null;
    const money = (value as UnknownRecord)["Money"];
    return typeof money === "number" && Number.isFinite(money) && money >= 0
      ? money
      : null;
  };
  const targetId = planTruepathAiApocalypse({
    enabled: true,
    aiCoreLevel: coreLevel,
    decoderCount: requireNumber(
      decoder["count"],
      "buildings.TitanDecoder.count",
    ),
    decoderOnCount: requireNumber(
      decoder["stateOnCount"],
      "buildings.TitanDecoder.stateOnCount",
    ),
    colonistCount: requireNumber(
      colonist["count"],
      "buildings.TitanAIColonist.count",
    ),
    colonistOnCount: requireNumber(
      colonist["stateOnCount"],
      "buildings.TitanAIColonist.stateOnCount",
    ),
    trooperOnCount: requireNumber(
      trooper["stateOnCount"],
      "buildings.ErisTrooper.stateOnCount",
    ),
    tankOnCount: requireNumber(
      tank["stateOnCount"],
      "buildings.ErisTank.stateOnCount",
    ),
    decoderMoneyCost: readMoneyCost(decoder),
    colonistMoneyCost: readMoneyCost(colonist),
    trooperMoneyCost: readMoneyCost(trooper),
    tankMoneyCost: readMoneyCost(tank),
  }).target;
  if (targetId === null) return null;
  const target = requireRecord(buildings[targetId], `buildings.${targetId}`);
  if (!callBoolean(target, "isUnlocked", `buildings.${targetId}`, true)) {
    return null;
  }
  return readTarget(target, `buildings.${targetId}`, isProject);
}

function readTechs(
  value: unknown,
  isProject: (target: unknown) => boolean,
): DemandTech[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`state.unlockedTechs must be an array`);
  }
  return value.map((entry, index) => {
    const path = `state.unlockedTechs[${index}]`;
    const record = requireRecord(entry, path);
    return Object.freeze({
      id: typeof record["id"] === "string" ? record["id"] : null,
      isAffordable: callBoolean(record, "isAffordable", path, true),
      target: readTarget(record, path, isProject),
    });
  });
}
