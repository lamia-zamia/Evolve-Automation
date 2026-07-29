import type { KnowledgeRequirementsInput } from "../../../../domain/knowledge-requirements.ts";
import type {
  StorageRequestCost,
  StorageRequestTarget,
  StorageRequirementsInput,
  StorageResourceState,
} from "../../../../domain/economy/storage/storage-requirements.ts";
import type { FuelDepotDemandInput } from "../../../../domain/economy/storage/fuel-depot-demand.ts";
import {
  requireArray,
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../../validation.ts";

export interface StorageRequirementsReaderDependencies {
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getGame: () => unknown;
  readonly getBuildingManager: () => unknown;
  readonly getProjectManager: () => unknown;
  readonly getFleetManagerOuter: () => unknown;
  readonly isTechnology: (target: unknown) => boolean;
  readonly isInflationAssistActive: () => boolean;
  readonly isRetirementAssistActive: () => boolean;
  readonly getInflationChallengeMoney: () => number;
  readonly getRetirementGraphene: () => number;
}

/** Legacy `for..in object.cost`: a non-record cost contributes nothing. */
function readCosts(value: unknown): StorageRequestCost[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as UnknownRecord;
  const costs: StorageRequestCost[] = [];
  for (const key in record) {
    costs.push(
      Object.freeze({
        resourceId: key,
        amount: requireNumber(record[key], `cost.${key}`),
      }),
    );
  }
  return costs;
}

/** Legacy `target.cost?.Knowledge ?? 0`: missing cost or Knowledge means 0. */
function knowledgeCostOf(target: UnknownRecord): number {
  const cost = target["cost"];
  if (typeof cost !== "object" || cost === null) return 0;
  const value = (cost as UnknownRecord)["Knowledge"];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isKnowledgeProducer(target: UnknownRecord): boolean {
  const is = target["is"];
  return (
    typeof is === "object" &&
    is !== null &&
    Boolean((is as UnknownRecord)["knowledge"])
  );
}

/** Legacy optional method call `target.isX?.()`. */
function optionalPredicate(target: UnknownRecord, name: string): boolean {
  const method = target[name];
  if (typeof method !== "function") return false;
  return Boolean(
    Reflect.apply(method as (...a: unknown[]) => unknown, target, []),
  );
}

/**
 * Lenient maxQuantity read. WarManager-backed special resources (Troops and the
 * garrison/fortress supports) derive maxQuantity from lazily-initialized game
 * fields — e.g. Troops = `WarManager.maxCityGarrison` = `maxSoldiers - hellSoldiers`,
 * and `hellSoldiers` reads `fortress.garrison`, which is absent until first written —
 * so the value can be non-finite (NaN). Legacy read the raw numeric property here and
 * never compared these non-cost resources' maxQuantity (the planner only reads
 * maxQuantity for resources that appear as a cost, and these never do), so a
 * non-finite value was harmless. Require a number but not finiteness to preserve that;
 * real cost resources always report a finite maxQuantity.
 */
function readMaxQuantity(value: unknown, path: string): number {
  if (typeof value !== "number") {
    throw new TypeError(`${path} must be a number`);
  }
  return value;
}

function targetList(value: unknown, path: string): UnknownRecord[] {
  return requireArray(value, path).map((entry, index) =>
    requireRecord(entry, `${path}[${index}]`),
  );
}

function costTargets(list: readonly UnknownRecord[]): StorageRequestTarget[] {
  return list.map((target) =>
    Object.freeze({ costs: readCosts(target["cost"]) }),
  );
}

function readResources(resourcesValue: unknown): StorageResourceState[] {
  const resources = requireRecord(resourcesValue, "resources");
  const states: StorageResourceState[] = [];
  for (const id in resources) {
    const resource = requireRecord(resources[id], `resources.${id}`);
    const hasStorage = requireFunction(
      resource["hasStorage"],
      `resources.${id}.hasStorage`,
    );
    states.push(
      Object.freeze({
        id,
        maxQuantity: readMaxQuantity(
          resource["maxQuantity"],
          `resources.${id}.maxQuantity`,
        ),
        maxCost: requireNumber(resource["maxCost"], `resources.${id}.maxCost`),
        storageRequired: requireNumber(
          resource["storageRequired"],
          `resources.${id}.storageRequired`,
        ),
        hasStorage: Boolean(Reflect.apply(hasStorage, resource, [])),
        // TRANSITIONAL: auto-sell fields are settings-backed getters
        // (`settings["sell"+id]` / `["res_sell_r_"+id]`) that are undefined for
        // non-market resources (RNA, DNA, ...). Legacy used them only in
        // `enabled && ratio > 0`, so they are read leniently here. When the
        // `market` (autoMarket) slice migrates, these should come from a validated
        // market-settings view keyed by sellable-resource id rather than being
        // coerced per resource at this boundary. (The trade-routes slice, already
        // migrated, owns trade-route quantities, not these auto-sell settings.)
        autoSellEnabled: Boolean(resource["autoSellEnabled"]),
        autoSellRatio:
          typeof resource["autoSellRatio"] === "number" &&
          Number.isFinite(resource["autoSellRatio"])
            ? (resource["autoSellRatio"] as number)
            : 0,
      }),
    );
  }
  return states;
}

export function readStorageRequirementsInput(
  dependencies: StorageRequirementsReaderDependencies,
): StorageRequirementsInput {
  const settings = requireRecord(dependencies.getSettings(), "settings");
  const state = requireRecord(dependencies.getState(), "state");
  const buildings = requireRecord(dependencies.getBuildings(), "buildings");
  const game = requireRecord(dependencies.getGame(), "game");
  const buildingManager = requireRecord(
    dependencies.getBuildingManager(),
    "BuildingManager",
  );
  const projectManager = requireRecord(
    dependencies.getProjectManager(),
    "ProjectManager",
  );
  const fleetManagerOuter = requireRecord(
    dependencies.getFleetManagerOuter(),
    "FleetManagerOuter",
  );

  const unlockedTechs = targetList(
    state["unlockedTechs"],
    "state.unlockedTechs",
  );
  const queuedTargetsAll = targetList(
    state["queuedTargetsAll"],
    "state.queuedTargetsAll",
  );
  const triggerTargets = targetList(
    state["triggerTargets"],
    "state.triggerTargets",
  );
  const buildingList = targetList(
    buildingManager["priorityList"],
    "BuildingManager.priorityList",
  );
  const projectList = targetList(
    projectManager["priorityList"],
    "ProjectManager.priorityList",
  );

  const autoBuildableFiltered = (list: readonly UnknownRecord[]) =>
    list.filter(
      (entry) =>
        optionalPredicate(entry, "isUnlocked") &&
        Boolean(entry["autoBuildEnabled"]),
    );

  // requestStorageFor lists, in the exact legacy call order.
  const requestLists: (readonly StorageRequestTarget[])[] = [];
  const nextShipExpandable = Boolean(fleetManagerOuter["nextShipExpandable"]);
  if (
    Boolean(settings["autoFleet"]) &&
    nextShipExpandable &&
    settings["prioritizeOuterFleet"] !== "ignore"
  ) {
    requestLists.push([
      Object.freeze({ costs: readCosts(fleetManagerOuter["nextShipCost"]) }),
    ]);
  }
  requestLists.push(costTargets(unlockedTechs));
  requestLists.push(costTargets(queuedTargetsAll));
  requestLists.push(costTargets(autoBuildableFiltered(buildingList)));
  requestLists.push(costTargets(autoBuildableFiltered(projectList)));

  const embassy = requireRecord(
    buildings["GorddonEmbassy"],
    "buildings.GorddonEmbassy",
  );
  const fleetEmbassyKnowledge = requireNumber(
    settings["fleetEmbassyKnowledge"],
    "settings.fleetEmbassyKnowledge",
  );
  const knowledge: KnowledgeRequirementsInput = {
    techKnowledgeCosts: [
      ...unlockedTechs.map((tech) => knowledgeCostOf(tech)),
      ...(optionalPredicate(embassy, "isAutoBuildable")
        ? [fleetEmbassyKnowledge]
        : []),
    ],
    reservedTargets: [...queuedTargetsAll, ...triggerTargets].map((target) => ({
      knowledgeCost: knowledgeCostOf(target),
      isTechnology: dependencies.isTechnology(target),
      isKnowledge: isKnowledgeProducer(target),
    })),
    buildCandidates: [...buildingList, ...projectList].map((object) => ({
      knowledgeCost: knowledgeCostOf(object),
      isKnowledge: isKnowledgeProducer(object),
      weighting:
        typeof object["weighting"] === "number" &&
        Number.isFinite(object["weighting"] as number)
          ? (object["weighting"] as number)
          : 0,
      autoBuildable: optionalPredicate(object, "isAutoBuildable"),
    })),
  };

  const race = requireRecord(
    requireRecord(game["global"], "game.global")["race"],
    "game.global.race",
  );

  return Object.freeze({
    storageAssignExtra: requireBoolean(
      settings["storageAssignExtra"],
      "settings.storageAssignExtra",
    ),
    autoMarket: Boolean(settings["autoMarket"]),
    noTrade: Boolean(race["no_trade"]),
    requestLists: Object.freeze(requestLists),
    knowledge,
    resources: Object.freeze(readResources(dependencies.getResources())),
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
  });
}

export interface FuelDepotDemandReaderDependencies {
  readonly getState: () => unknown;
}

/**
 * Techs and missions whose costs drive the fuel-depot weighting. Techs are every
 * currently-researchable tech (`state.unlockedTechs`, which empties once research is done);
 * missions are `state.missionBuildingList` entries still pending — unlocked, autobuild-enabled,
 * and not complete — matching how demand prioritization treats active missions.
 */
export function readFuelDepotDemandInput(
  dependencies: FuelDepotDemandReaderDependencies,
): FuelDepotDemandInput {
  const state = requireRecord(dependencies.getState(), "state");
  const unlockedTechs = targetList(
    state["unlockedTechs"],
    "state.unlockedTechs",
  );
  const missions = targetList(
    state["missionBuildingList"],
    "state.missionBuildingList",
  ).filter(
    (mission) =>
      optionalPredicate(mission, "isUnlocked") &&
      Boolean(mission["autoBuildEnabled"]) &&
      !optionalPredicate(mission, "isComplete"),
  );
  return Object.freeze({
    targets: Object.freeze([
      ...costTargets(unlockedTechs),
      ...costTargets(missions),
    ]),
  });
}
