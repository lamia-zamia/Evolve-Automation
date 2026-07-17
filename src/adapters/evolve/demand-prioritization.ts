import type {
  DemandCost,
  DemandCrafter,
  DemandCrafterCost,
  DemandFactoryCost,
  DemandFactoryProduction,
  DemandMission,
  DemandPrioritizationInput,
  DemandPrioritizationSettings,
  DemandTarget,
  DemandTech,
} from "../../domain/demand-prioritization.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface DemandPrioritizationReaderDependencies {
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
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

function callBoolean(
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): boolean {
  const method = requireFunction(record[name], `${path}.${name}`);
  return Boolean(Reflect.apply(method, record, args));
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
    settings: readSettings(dependencies.getSettings()),
    isEarlyGame: dependencies.getIsEarlyGame(),
    consumptionBalanceTarget: dependencies.consumptionBalanceTarget,
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
      isAffordable: callBoolean(record, "isAffordable", path, true),
      target: readTarget(record, path, isProject),
    });
  });
}
