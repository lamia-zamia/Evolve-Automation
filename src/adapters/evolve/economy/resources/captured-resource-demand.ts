/**
 * The first captured slice of the script's own resource-demand model.
 *
 * `isDemanded` is what most of the remaining features are waiting on: it is how crafting, the
 * production splits, storage and the market learn that something else is accumulating a resource.
 * It is not upstream state — the game does not compute it — so it has to be planned here, from the
 * commitments the captured runtime can actually see.
 *
 * This sample is deliberately narrow. It carries the player's own build and research queues, priced
 * through the game's own cost code by the existing captured reservation source, which already
 * applies the game's rule for which queue entries it is saving for, and the construction cycle's own
 * saving target — the highest-weighted candidate it wants but cannot yet afford, observed from the
 * cycle that has already run. Foundry recipes are included only when the factory-focus setting is
 * enabled and the game's own captured craft-cost renderer supplies every ingredient we use.
 * Factory material demand is included when its six-product catalog and validated regional capacity
 * are fully captured. The player's own triggers are carried when the captured trigger source can
 * say which of them the game could act on now.
 *
 * A missing part of the model can only leave a resource looking undemanded, never demand something
 * nothing wants, so every consumer degrades the same way the bounded slices already do.
 */

import { planStorageRequirements } from "../../../../domain/economy/storage/storage-requirements.ts";
import type { StorageResourceState } from "../../../../domain/economy/storage/storage-requirements.ts";
import { CONSUMPTION_BALANCE_TARGET } from "../../../../config.ts";
import {
  planDemandPrioritization,
  type DemandCost,
  type DemandCrafter,
  type DemandCrafterCost,
  type DemandMission,
  type DemandTech,
  type DemandPrioritizationSettings,
  type DemandTarget,
} from "../../../../domain/economy/resources/demand-prioritization.ts";
import type { ReservedCostTarget } from "../../../../domain/cost-conflicts.ts";
import type { CostReservationSource } from "../../../../ports/game-cost-reservations.ts";
import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { ConstructionObservations } from "../../../../ports/game-construction-observations.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { OfferedTech } from "../../../../ports/game-tech-catalog.ts";
import type { CapturedCraftCosts } from "../production/captured-craft-costs.ts";
import type { CapturedFleetDemand } from "../../combat/captured-fleet-demand.ts";
import type { CapturedTriggers } from "../../progression/build/captured-triggers.ts";
import { readCapturedFactoryCapacity } from "../production/captured-factory-capacity.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export interface CapturedResourceDemandDependencies {
  readonly rootState: GameRootStateSource;
  readonly reservations: CostReservationSource;
  /** Captured action controls and the game's own cost reader for independently ported missions. */
  readonly controls?: GameControlRegistry;
  readonly costs?: GameActionCostReader;
  /**
   * What the construction cycle observed. Absent for a caller with no construction cycle to watch,
   * which then simply sees no implicit commitment.
   */
  readonly construction?: ConstructionObservations;
  /** The last offered-technology snapshot already captured by progression, if any. */
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  readonly readSettings: () => unknown;
  /** The game's own per-volume Foundry recipe reader, when the control surface is available. */
  readonly craftCosts?: CapturedCraftCosts;
  /** The rendered True Path shipyard cost, when the current blueprint is fully captured. */
  readonly fleet?: CapturedFleetDemand;
  /** The player's own triggers, when the captured trigger source is composed. */
  readonly triggers?: CapturedTriggers;
}

export interface CapturedDemandSample {
  /** How much of a resource the queues are accumulating, clamped to what storage can hold. */
  requestedQuantity(resourceId: string): number;
  /** The script's `isDemanded`: something wants more of this than the player currently has. */
  isDemanded(resourceId: string): boolean;
  /**
   * How much storage the same commitments need for a resource, which is a different question from
   * how much of it is wanted now: a target is only reachable if its cost fits in storage at all.
   * 1 for a resource nothing is saving for, matching the script's own baseline.
   */
  storageRequired(resourceId: string): number;
  /**
   * The largest single cost in a resource the commitments name, or 0 when nothing does. Optional
   * so readers that only need the three core answers are unaffected; the trigger-condition reader
   * is currently its only consumer.
   */
  maxCost?: (resourceId: string) => number;
}

export interface CapturedResourceDemand {
  /** Plans the demand for one cycle. Callers sample once and share the result. */
  sample(): CapturedDemandSample;
}

const NO_STORAGE_REQUIREMENT = 1;

/** Nothing is committed, so nothing is demanded and one unit of storage is required. */
export const EMPTY_DEMAND_SAMPLE: CapturedDemandSample = Object.freeze({
  requestedQuantity: () => 0,
  isDemanded: () => false,
  storageRequired: () => NO_STORAGE_REQUIREMENT,
  maxCost: () => 0,
});

function settingString(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: string,
): string {
  const value = settings[key];
  return typeof value === "string" ? value : fallback;
}

function settingBoolean(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : fallback;
}

/** Mirrors the script's runtime query over the captured race and technology bags. */
function readCapturedIsEarlyGame(root: unknown): boolean {
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  if (
    Boolean(readProperty(race, "cataclysm")) ||
    Boolean(readProperty(race, "orbit_decayed")) ||
    Boolean(readProperty(race, "lone_survivor")) ||
    Boolean(readProperty(race, "warlord"))
  ) {
    return false;
  }
  if (
    Boolean(readProperty(race, "truepath")) ||
    Boolean(readProperty(race, "sludge")) ||
    Boolean(readProperty(race, "ultra_sludge"))
  ) {
    return (finite(readProperty(tech, "high_tech")) ?? 0) < 7;
  }
  return (finite(readProperty(tech, "mad")) ?? 0) < 1;
}

function readSettingsInput(
  settingsValue: unknown,
): DemandPrioritizationSettings {
  const settings = isRecord(settingsValue) ? settingsValue : {};
  return Object.freeze({
    prioritizeQueue: settingString(settings, "prioritizeQueue", "savereq"),
    prioritizeTriggers: settingString(
      settings,
      "prioritizeTriggers",
      "savereq",
    ),
    missionRequest: settingBoolean(settings, "missionRequest", true),
    prestigeBioseedConstruct: settingBoolean(
      settings,
      "prestigeBioseedConstruct",
      false,
    ),
    prestigeType: settingString(settings, "prestigeType", "none"),
    researchRequest: settingBoolean(settings, "researchRequest", true),
    researchRequestSpace: settingBoolean(
      settings,
      "researchRequestSpace",
      false,
    ),
    prioritizeUnify: settingString(settings, "prioritizeUnify", "savereq"),
    autoFleet: settingBoolean(settings, "autoFleet", false),
    prioritizeOuterFleet: settingString(
      settings,
      "prioritizeOuterFleet",
      "ignore",
    ),
    productionFactoryFocusMaterials: settingBoolean(
      settings,
      "productionFactoryFocusMaterials",
      false,
    ),
    autoPower: settingBoolean(settings, "autoPower", false),
    productionFactoryMinIngredients:
      finite(settings["productionFactoryMinIngredients"]) ?? 0,
  });
}

/**
 * A reserved queue entry as a demand target. The reservation source reports the cost the game
 * would pay, not whether the entry is an A.R.P.A. project part-way through, so no target claims the
 * project cost doubling; an under-stated demand is the safe direction here.
 */
function toCosts(
  cost: Readonly<Record<string, number | undefined>>,
): readonly DemandCost[] {
  return Object.freeze(
    Object.entries(cost).flatMap(([resourceId, amount]) => {
      const value = finite(amount);
      return value === undefined
        ? []
        : [Object.freeze({ resourceId, amount: value })];
    }),
  );
}

function toTargets(
  targets: readonly Readonly<ReservedCostTarget>[],
): readonly DemandTarget[] {
  return Object.freeze(
    targets.map((target) =>
      Object.freeze({
        isProject: false,
        progress: null,
        costs: toCosts(target.cost),
      }),
    ),
  );
}

const CAPTURED_MISSIONS = Object.freeze([
  Object.freeze({
    actionId: "space-moon_mission",
    completionTech: "space",
    completionLevel: 3,
  }),
  Object.freeze({
    actionId: "space-red_mission",
    completionTech: "space",
    completionLevel: 4,
  }),
  Object.freeze({
    actionId: "space-hell_mission",
    completionTech: "hell",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "space-sun_mission",
    completionTech: "solar",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "space-gas_mission",
    completionTech: "space",
    completionLevel: 5,
  }),
  Object.freeze({
    actionId: "space-gas_moon_mission",
    completionTech: "space",
    completionLevel: 6,
  }),
  Object.freeze({
    actionId: "space-belt_mission",
    completionTech: "asteroid",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "space-dwarf_mission",
    completionTech: "dwarf",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "portal-pit_mission",
    completionTech: "hell_pit",
    completionLevel: 2,
  }),
  Object.freeze({
    actionId: "portal-ruins_mission",
    completionTech: "hell_ruins",
    completionLevel: 2,
  }),
  Object.freeze({
    actionId: "portal-gate_mission",
    completionTech: "hell_gate",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "portal-lake_mission",
    completionTech: "hell_lake",
    completionLevel: 2,
  }),
  Object.freeze({
    actionId: "portal-spire_mission",
    completionTech: "hell_spire",
    completionLevel: 2,
  }),
  Object.freeze({
    actionId: "interstellar-alpha_mission",
    completionTech: "alpha",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "interstellar-proxima_mission",
    completionTech: "proxima",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "interstellar-nebula_mission",
    completionTech: "nebula",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "interstellar-neutron_mission",
    completionTech: "neutron",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "interstellar-blackhole_mission",
    completionTech: "blackhole",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "interstellar-wormhole_mission",
    completionTech: "stargate",
    completionLevel: 3,
  }),
  Object.freeze({
    actionId: "interstellar-sirius_mission",
    completionTech: "ascension",
    completionLevel: 3,
  }),
  Object.freeze({
    actionId: "galaxy-gateway_mission",
    completionTech: "gateway",
    completionLevel: 2,
  }),
  Object.freeze({
    actionId: "galaxy-gorddon_mission",
    completionTech: "xeno",
    completionLevel: 3,
  }),
  Object.freeze({
    actionId: "galaxy-alien2_mission",
    completionTech: "conflict",
    completionLevel: 1,
  }),
  Object.freeze({
    actionId: "galaxy-chthonian_mission",
    completionTech: "chthonian",
    completionLevel: 2,
  }),
  Object.freeze({
    actionId: "interstellar-jump_ship",
    completionTech: "stargate",
    completionLevel: 2,
    isBlackholeJumpShip: true,
  }),
  Object.freeze({
    actionId: "interstellar-sirius_b",
    completionTech: "ascension",
    completionLevel: 4,
  }),
]);

/** DeadSpace creates each mission control only after its own requirements pass. */
function readCapturedSpaceMissionDemand(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  controls: GameControlRegistry | undefined,
  costs: GameActionCostReader | undefined,
): readonly DemandMission[] {
  if (
    controls === undefined ||
    costs === undefined ||
    settingBoolean(settings, "missionRequest", true) === false
  ) {
    return Object.freeze([]);
  }
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return Object.freeze([]);
  const missions: DemandMission[] = [];
  for (const mission of CAPTURED_MISSIONS) {
    const actionId = mission.actionId;
    const completion = finite(readProperty(tech, mission.completionTech));
    if (
      controls.resolve(actionId) === undefined ||
      settingBoolean(settings, `bat${actionId}`, true) === false ||
      completion === undefined ||
      completion >= mission.completionLevel
    ) {
      continue;
    }
    const cost = costs.readCost(actionId);
    if (cost === undefined) continue;
    const missionCosts = toCosts(cost);
    if (missionCosts.length === 0) continue;
    missions.push({
      isUnlocked: true,
      autoBuildEnabled: true,
      isComplete: false,
      isBlackholeJumpShip:
        "isBlackholeJumpShip" in mission &&
        mission.isBlackholeJumpShip === true,
      target: Object.freeze({
        isProject: false,
        progress: null,
        costs: missionCosts,
      }),
    });
  }
  return Object.freeze(missions.map((mission) => Object.freeze(mission)));
}

function readAffordable(
  resources: Record<PropertyKey, unknown>,
  cost: Readonly<Record<string, number>>,
): boolean {
  for (const [resourceId, amount] of Object.entries(cost)) {
    if (!Number.isFinite(amount) || amount < 0) return false;
    const current = finite(
      readProperty(readProperty(resources, resourceId), "amount"),
    );
    // Missing holdings are not treated as zero: the captured root has not yet
    // created that resource, so this is conservatively not an affordable offer.
    if (current === undefined || current < amount) return false;
  }
  return true;
}

function toOfferedTechs(
  resources: Record<PropertyKey, unknown>,
  offered: readonly Readonly<OfferedTech>[] | undefined,
): readonly DemandTech[] {
  if (offered === undefined) return Object.freeze([]);
  return Object.freeze(
    offered.map((tech) =>
      Object.freeze({
        id: tech.elementId,
        isAffordable: readAffordable(resources, tech.cost),
        target: Object.freeze({
          isProject: false,
          progress: null,
          costs: toCosts(tech.cost),
        }),
      }),
    ),
  );
}

/**
 * Every resource the game has created, at the script's own per-cycle baseline: nothing has been
 * requested yet, and one unit of storage is required. `hasStorage` is the game's own `stackable`
 * flag, which is what decides whether a cost too large for current storage can still be planned for.
 */
function readStorageResources(
  resources: Record<PropertyKey, unknown>,
  settings: Record<PropertyKey, unknown>,
): readonly StorageResourceState[] {
  const states: StorageResourceState[] = [];
  for (const id of Object.keys(resources)) {
    const resource = resources[id];
    const maximum = finite(readProperty(resource, "max"));
    if (maximum === undefined) continue;
    const ratio = finite(settings[`res_sell_r_${id}`]);
    states.push(
      Object.freeze({
        id,
        maxQuantity: maximum >= 0 ? maximum : Number.MAX_SAFE_INTEGER,
        maxCost: 0,
        storageRequired: NO_STORAGE_REQUIREMENT,
        hasStorage: readProperty(resource, "stackable") === true,
        autoSellEnabled: settings[`sell${id}`] === true,
        autoSellRatio: ratio !== undefined && ratio > 0 ? ratio : 0,
      }),
    );
  }
  return Object.freeze(states);
}

const CAPTURED_FOUNDRY_PRODUCTS = Object.freeze([
  "Plywood",
  "Brick",
  "Wrought_Iron",
  "Sheet_Metal",
  "Mythril",
  "Aerogel",
  "Nanoweave",
  "Aerographene",
  "Scarletite",
  "Quantium",
  "Super_Fuel",
  "Thermite",
]);

interface CapturedCrafterDemand {
  readonly availableCrafters: number;
  readonly crafters: readonly DemandCrafter[];
}

/**
 * Captures only the Foundry half of demand. The resource's same-cycle `isDemanded` value would
 * recurse through this sample, so the factory-focus setting is the explicit gate and every row is
 * marked as not independently demanded. Missing recipe or material data drops that row rather
 * than guessing a cost; the remaining rows still use the game's normal per-crafter balance.
 */
function readCapturedCrafterDemand(
  root: unknown,
  resources: Record<PropertyKey, unknown>,
  settings: Record<PropertyKey, unknown>,
  craftCosts: CapturedCraftCosts | undefined,
): CapturedCrafterDemand | undefined {
  if (craftCosts === undefined) return undefined;
  if (!isRecord(readProperty(readProperty(root, "city"), "foundry"))) {
    return undefined;
  }
  const maximum = finite(
    readProperty(readProperty(readProperty(root, "civic"), "craftsman"), "max"),
  );
  if (maximum === undefined || maximum < 0) return undefined;

  let availableCrafters = maximum;
  const servants = readProperty(readProperty(root, "race"), "servants");
  if (isRecord(servants)) {
    const skilledMaximum = finite(readProperty(servants, "smax"));
    if (skilledMaximum !== undefined && skilledMaximum >= 0) {
      availableCrafters += skilledMaximum;
    }
  }

  const crafters: DemandCrafter[] = [];
  for (const id of CAPTURED_FOUNDRY_PRODUCTS) {
    const resource = readProperty(resources, id);
    if (!isRecord(resource) || readProperty(resource, "display") !== true) {
      continue;
    }
    const recipe = craftCosts.read(id);
    if (recipe === undefined) continue;
    const costs: DemandCrafterCost[] = [];
    let valid = true;
    for (const [resourceId, amount] of recipe) {
      const material = readProperty(resources, resourceId);
      const maximumQuantity = finite(readProperty(material, "max"));
      if (
        maximumQuantity === undefined ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        valid = false;
        break;
      }
      costs.push({
        resourceId,
        amount,
        materialMaxQuantity:
          maximumQuantity < 0 ? Number.MAX_SAFE_INTEGER : maximumQuantity,
      });
    }
    if (!valid || costs.length === 0) continue;
    crafters.push({
      isDemanded: false,
      isUnlocked: true,
      craftPreserve: finite(settings[`foundry_p_${id}`]) ?? 0,
      costs: Object.freeze(costs),
    });
  }
  return Object.freeze({
    availableCrafters,
    crafters: Object.freeze(crafters),
  });
}

interface CapturedFactoryCatalog {
  readonly count: number;
  readonly productions: readonly Readonly<{
    readonly outputResourceId: string;
    readonly unlocked: boolean;
    readonly enabled: boolean;
    readonly weighting: number;
    readonly costs: readonly Readonly<{
      readonly quantity: number;
      readonly minRateOfChange: number;
      readonly resourceId: string;
      readonly resourceMaxQuantity: number;
    }>[];
  }>[];
}

interface FactoryDemandSpec {
  readonly id: string;
  readonly outputResourceId: string;
  readonly unlockTech?: string;
  readonly costs: readonly Readonly<{
    readonly resourceId: string;
    readonly rates: readonly number[];
    readonly minRateOfChange: number;
  }>[];
}

const FACTORY_DEMAND_SPECS: readonly FactoryDemandSpec[] = Object.freeze([
  Object.freeze({
    id: "Lux",
    outputResourceId: "Money",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Furs",
        rates: Object.freeze([2, 3, 4, 5, 6]),
        minRateOfChange: 5,
      }),
    ]),
  }),
  Object.freeze({
    id: "Furs",
    outputResourceId: "Furs",
    unlockTech: "synthetic_fur",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Money",
        rates: Object.freeze([10, 15, 20, 25, 30]),
        minRateOfChange: 1000,
      }),
      Object.freeze({
        resourceId: "Polymer",
        rates: Object.freeze([1.5, 2.25, 3, 3.75, 4.5]),
        minRateOfChange: 10,
      }),
    ]),
  }),
  Object.freeze({
    id: "Alloy",
    outputResourceId: "Alloy",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Copper",
        rates: Object.freeze([0.75, 1.12, 1.49, 1.86, 2.23]),
        minRateOfChange: 5,
      }),
      Object.freeze({
        resourceId: "Aluminium",
        rates: Object.freeze([1, 1.5, 2, 2.5, 3]),
        minRateOfChange: 5,
      }),
    ]),
  }),
  Object.freeze({
    id: "Polymer",
    outputResourceId: "Polymer",
    unlockTech: "polymer",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Oil",
        rates: Object.freeze([0.18, 0.27, 0.36, 0.45, 0.54]),
        minRateOfChange: 2,
      }),
      Object.freeze({
        resourceId: "Lumber",
        rates: Object.freeze([15, 22, 29, 36, 43]),
        minRateOfChange: 50,
      }),
    ]),
  }),
  Object.freeze({
    id: "Nano",
    outputResourceId: "Nano_Tube",
    unlockTech: "nano",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Coal",
        rates: Object.freeze([8, 12, 16, 20, 24]),
        minRateOfChange: 15,
      }),
      Object.freeze({
        resourceId: "Neutronium",
        rates: Object.freeze([0.05, 0.075, 0.1, 0.125, 0.15]),
        minRateOfChange: 0.2,
      }),
    ]),
  }),
  Object.freeze({
    id: "Stanene",
    outputResourceId: "Stanene",
    unlockTech: "stanene",
    costs: Object.freeze([
      Object.freeze({
        resourceId: "Aluminium",
        rates: Object.freeze([30, 45, 60, 75, 90]),
        minRateOfChange: 50,
      }),
      Object.freeze({
        resourceId: "Nano_Tube",
        rates: Object.freeze([0.02, 0.03, 0.04, 0.05, 0.06]),
        minRateOfChange: 5,
      }),
    ]),
  }),
]);

function readCapturedFactoryDemand(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
): CapturedFactoryCatalog | undefined {
  const count = readCapturedFactoryCapacity(root);
  const factoryLevel = finite(
    readProperty(readProperty(root, "tech"), "factory"),
  );
  if (
    count === undefined ||
    count <= 0 ||
    !Number.isSafeInteger(count) ||
    factoryLevel === undefined ||
    !Number.isSafeInteger(factoryLevel) ||
    factoryLevel < 0 ||
    factoryLevel > 4
  ) {
    return undefined;
  }
  const tech = readProperty(root, "tech");
  const race = readProperty(root, "race");
  const coalSpecies =
    Boolean(readProperty(race, "kindling_kindred")) ||
    Boolean(readProperty(race, "smoldering")) ||
    Boolean(readProperty(race, "iceage"));
  const productions = FACTORY_DEMAND_SPECS.map((spec) => {
    const techLevel =
      spec.unlockTech === undefined
        ? 1
        : (finite(readProperty(tech, spec.unlockTech)) ?? 0);
    const enabled = settings[`production_${spec.id}`] ?? true;
    const weighting =
      settings[`production_w_${spec.id}`] ??
      (spec.id === "Nano" || spec.id === "Stanene" ? 4 : 1);
    if (
      typeof enabled !== "boolean" ||
      typeof weighting !== "number" ||
      !Number.isFinite(weighting)
    ) {
      return undefined;
    }
    const unlocked = spec.unlockTech === undefined || techLevel > 0;
    const costs = spec.costs.flatMap((cost) => {
      const rates =
        spec.id === "Polymer" && coalSpecies && cost.resourceId === "Oil"
          ? [0.22, 0.33, 0.44, 0.55, 0.66]
          : cost.rates;
      const quantity = rates[factoryLevel];
      const resource = readProperty(
        readProperty(root, "resource"),
        cost.resourceId,
      );
      const maximum = finite(readProperty(resource, "max"));
      return quantity === undefined || maximum === undefined
        ? []
        : [
            Object.freeze({
              quantity,
              minRateOfChange: cost.minRateOfChange,
              resourceId: cost.resourceId,
              resourceMaxQuantity: maximum,
            }),
          ];
    });
    if (
      unlocked &&
      enabled &&
      weighting > 0 &&
      costs.length !== spec.costs.length
    ) {
      return undefined;
    }
    return Object.freeze({
      outputResourceId: spec.outputResourceId,
      unlocked,
      enabled,
      weighting,
      costs: Object.freeze(costs),
    });
  });
  if (productions.some((production) => production === undefined))
    return undefined;
  return Object.freeze({
    count,
    productions: Object.freeze(productions.map((production) => production!)),
  });
}

export function createCapturedResourceDemand(
  dependencies: CapturedResourceDemandDependencies,
): CapturedResourceDemand {
  return Object.freeze({
    sample(): CapturedDemandSample {
      const root = dependencies.rootState.readRoot();
      const resources = readProperty(root, "resource");
      if (!isRecord(resources)) return EMPTY_DEMAND_SAMPLE;
      const queued = dependencies.reservations.readReservations().targets;
      const saving = dependencies.construction?.readSavingTarget() ?? null;
      const offered = dependencies.readOfferedTechs?.();
      const settingsValue = dependencies.readSettings();
      const settings = isRecord(settingsValue) ? settingsValue : {};
      const fleet = dependencies.fleet?.read();
      const triggerTargets = Object.freeze(
        (dependencies.triggers?.read() ?? []).map((target) =>
          Object.freeze({
            // A project trigger reserves the whole remaining project, so it takes the same
            // doubling the pure planner gives any part-built project target.
            isProject: target.actionType === "arpa",
            progress: target.actionType === "arpa" ? target.progress : null,
            costs: toCosts(target.cost),
          }),
        ),
      );
      const missions = readCapturedSpaceMissionDemand(
        root,
        settings,
        dependencies.controls,
        dependencies.costs,
      );
      const crafterDemand =
        settings["productionFactoryFocusMaterials"] === true
          ? readCapturedCrafterDemand(
              root,
              resources,
              settings,
              dependencies.craftCosts,
            )
          : undefined;
      const factoryCatalog = readCapturedFactoryDemand(root, settings);
      const hasFactoryDemand =
        factoryCatalog?.productions.some(
          (production) =>
            production.unlocked &&
            production.enabled &&
            production.weighting > 0,
        ) ?? false;
      const hasCrafterDemand = (crafterDemand?.crafters.length ?? 0) > 0;
      const hasFleetDemand =
        settingBoolean(settings, "autoFleet", false) &&
        settingString(settings, "prioritizeOuterFleet", "ignore").includes(
          "req",
        ) &&
        fleet?.nextShipAffordable === true &&
        fleet.nextShipCost.length > 0;
      if (
        queued.length === 0 &&
        triggerTargets.length === 0 &&
        saving === null &&
        (offered === undefined || offered.length === 0) &&
        !hasFactoryDemand &&
        !hasCrafterDemand &&
        missions.length === 0 &&
        !hasFleetDemand
      ) {
        return EMPTY_DEMAND_SAMPLE;
      }
      const savingCosts = saving === null ? null : toCosts(saving.cost);

      const baseInput = Object.freeze({
        settings: readSettingsInput(settingsValue),
        // The captured offer list is the game's own technology qualification result. The reader
        // only recomputes affordability from current holdings; it never recreates tech gates.
        isEarlyGame: readCapturedIsEarlyGame(root),
        consumptionBalanceTarget: CONSUMPTION_BALANCE_TARGET,
        truepathAiBuildingTarget: null,
        inflationMoney: null,
        retirementGraphene: null,
        queuedTargets: toTargets(queued),
        triggerTargets,
        savingTarget:
          saving === null || savingCosts === null
            ? null
            : Object.freeze({ name: saving.name, costs: savingCosts }),
        missions,
        unlockedTechs: toOfferedTechs(resources, offered),
        spyPurchaseMoney: 0,
        fleet:
          fleet ??
          Object.freeze({
            nextShipAffordable: false,
            nextShipCost: Object.freeze([]),
          }),
        availableCrafters: crafterDemand?.availableCrafters ?? 0,
        crafters: crafterDemand?.crafters ?? Object.freeze([]),
        vitreloyPlant: Object.freeze({
          autoStateEnabled: false,
          count: 0,
          stateOnCount: 0,
        }),
        factoryCount: 0,
        factoryProductions: Object.freeze([]),
      });
      const baseResult = planDemandPrioritization(baseInput);
      const baseRequested = new Map<string, number>();
      for (const request of baseResult.requests) {
        const amount = finite(request.amount);
        if (amount !== undefined) {
          baseRequested.set(
            request.resourceId,
            Math.max(baseRequested.get(request.resourceId) ?? 0, amount),
          );
        }
      }
      const factoryProductions =
        factoryCatalog === undefined
          ? Object.freeze([])
          : Object.freeze(
              factoryCatalog.productions.map((production) => {
                const amount = finite(
                  readProperty(
                    readProperty(resources, production.outputResourceId),
                    "amount",
                  ),
                );
                return Object.freeze({
                  ...production,
                  isDemanded:
                    amount !== undefined &&
                    (baseRequested.get(production.outputResourceId) ?? 0) >
                      amount,
                });
              }),
            );
      const result =
        factoryCatalog !== undefined && hasFactoryDemand
          ? planDemandPrioritization({
              ...baseInput,
              factoryCount: factoryCatalog.count,
              factoryProductions,
            })
          : baseResult;

      // The script's own `requestQuantity`: requests combine by maximum, and none can exceed what
      // the resource's storage holds.
      const requested = new Map<string, number>();
      for (const request of result.requests) {
        const amount = finite(request.amount);
        if (amount === undefined) continue;
        const current = requested.get(request.resourceId) ?? 0;
        if (amount <= current) continue;
        const maximum = finite(
          readProperty(readProperty(resources, request.resourceId), "max"),
        );
        requested.set(
          request.resourceId,
          maximum === undefined || maximum < 0
            ? amount
            : Math.min(amount, maximum),
        );
      }

      const factoryStorageTargets = factoryProductions
        .filter(
          (production) =>
            production.unlocked &&
            production.enabled &&
            production.weighting > 0,
        )
        .map((production) =>
          Object.freeze({
            costs: Object.freeze(
              production.costs.map((cost) =>
                Object.freeze({
                  resourceId: cost.resourceId,
                  amount:
                    cost.minRateOfChange +
                    (finite(settings["productionFactoryMinIngredients"]) ?? 0) *
                      cost.resourceMaxQuantity,
                }),
              ),
            ),
          }),
        );

      const storage = planStorageRequirements({
        storageAssignExtra: settings["storageAssignExtra"] !== false,
        autoMarket: settings["autoMarket"] === true,
        noTrade: Boolean(readProperty(readProperty(root, "race"), "no_trade")),
        // The same commitments the demand pass just used, in the same order.
        requestLists: Object.freeze([
          toTargets(queued),
          savingCosts === null
            ? Object.freeze([])
            : Object.freeze([Object.freeze({ costs: savingCosts })]),
          factoryStorageTargets,
        ]),
        // The Knowledge half of this planner is owned by the captured Knowledge reader, which reads
        // the offered catalog; this pass would have to draw one of its own to answer it.
        knowledge: Object.freeze({
          techKnowledgeCosts: Object.freeze([]),
          reservedTargets: Object.freeze([]),
          buildCandidates: Object.freeze([]),
        }),
        resources: readStorageResources(resources, settings),
        inflationMoney: null,
        retirementGraphene: null,
      });
      const required = new Map(
        storage.resources.map((resource) => [
          resource.id,
          resource.storageRequired,
        ]),
      );
      const maxCosts = new Map(
        storage.resources.map((resource) => [resource.id, resource.maxCost]),
      );

      return Object.freeze({
        storageRequired: (resourceId: string) =>
          required.get(resourceId) ?? NO_STORAGE_REQUIREMENT,
        requestedQuantity: (resourceId: string) =>
          requested.get(resourceId) ?? 0,
        maxCost: (resourceId: string) => maxCosts.get(resourceId) ?? 0,
        isDemanded: (resourceId: string) => {
          const wanted = requested.get(resourceId);
          if (wanted === undefined) return false;
          const amount = finite(
            readProperty(readProperty(resources, resourceId), "amount"),
          );
          return amount !== undefined && wanted > amount;
        },
      });
    },
  });
}
