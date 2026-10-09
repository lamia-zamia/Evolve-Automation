import { isTruepathAiResourceResearch } from "../../progression/truepath/ai-apocalypse.ts";

/**
 * Pure equivalent of the legacy `prioritizeDemandedResources`. It replays the
 * ordered sequence of resource demand requests (`requestQuantity` calls) over an
 * immutable snapshot and reports which completed missions must be spliced out of
 * `missionBuildingList`. The composition root applies the returned requests and
 * splices; this function performs no game reads or mutations.
 */

export interface DemandRequest {
  readonly resourceId: string;
  readonly amount: number;
}

export interface DemandCost {
  readonly resourceId: string;
  readonly amount: number;
  /** The supply pool that pays this cost, when the game names one. */
  readonly pool?: string;
}

export interface DemandTarget {
  readonly costs: readonly DemandCost[];
  /** The target's payment pool, retained for consumers that need the whole target scope. */
  readonly pool?: string;
  readonly isProject: boolean;
  /**
   * ARPA progress, or null when absent. Legacy reads `progress! < 99`, so an
   * absent value (`undefined < 99 === false`) must not trigger the project
   * cost doubling; null preserves that.
   */
  readonly progress: number | null;
}

export interface DemandTech {
  readonly id: string | null;
  readonly isAffordable: boolean;
  readonly target: DemandTarget;
}

export interface DemandMission {
  readonly isUnlocked: boolean;
  readonly autoBuildEnabled: boolean;
  readonly isComplete: boolean;
  readonly isBlackholeJumpShip: boolean;
  readonly target: DemandTarget;
}

export interface DemandCrafterCost {
  readonly resourceId: string;
  /** `resource.cost[resourceId]` — the per-craft ingredient amount. */
  readonly amount: number;
  /** `resources[resourceId].maxQuantity` of the ingredient. */
  readonly materialMaxQuantity: number;
}

export interface DemandCrafter {
  readonly isDemanded: boolean;
  readonly isUnlocked: boolean;
  readonly craftPreserve: number;
  readonly costs: readonly DemandCrafterCost[];
}

export interface DemandFactoryCost {
  readonly quantity: number;
  readonly minRateOfChange: number;
  readonly resourceId: string;
  readonly resourceMaxQuantity: number;
}

export interface DemandFactoryProduction {
  readonly isDemanded: boolean;
  readonly unlocked: boolean;
  readonly enabled: boolean;
  /** Truthy weighting gates the production, matching legacy `if (weighting)`. */
  readonly weighting: number;
  readonly costs: readonly DemandFactoryCost[];
}

export interface DemandFleet {
  readonly nextShipAffordable: boolean;
  readonly nextShipCost: readonly DemandCost[];
}

export interface DemandVitreloyPlant {
  readonly autoStateEnabled: boolean;
  readonly count: number;
  readonly stateOnCount: number;
}

export interface DemandPrioritizationSettings {
  readonly prioritizeQueue: string;
  readonly prioritizeTriggers: string;
  readonly missionRequest: boolean;
  readonly prestigeBioseedConstruct: boolean;
  readonly prestigeType: string;
  readonly researchRequest: boolean;
  readonly researchRequestSpace: boolean;
  readonly prioritizeUnify: string;
  readonly autoFleet: boolean;
  readonly prioritizeOuterFleet: string;
  readonly productionFactoryFocusMaterials: boolean;
  readonly autoPower: boolean;
  readonly productionFactoryMinIngredients: number;
}

export interface DemandPrioritizationInput {
  readonly settings: DemandPrioritizationSettings;
  readonly isEarlyGame: boolean;
  readonly consumptionBalanceTarget: number;
  /** Cost of the next True Path AI hardware target, or null outside that stage. */
  readonly truepathAiBuildingTarget: DemandTarget | null;
  /** Money reserve when the inflation-challenge assist is active, else null. */
  readonly inflationMoney: number | null;
  /** Graphene reserve when the retirement-challenge assist is active, else null. */
  readonly retirementGraphene: number | null;
  readonly queuedTargets: readonly DemandTarget[];
  readonly triggerTargets: readonly DemandTarget[];
  /**
   * The build target the automation is currently saving for: the highest
   * weighted candidate it wants but cannot yet afford. Without it only queued
   * and trigger targets can express demand, so an ordinary weighted target -
   * however expensive - never tells crafting, market or storage that it is
   * accumulating, and its costs are spent by cheaper candidates as they arrive.
   * Null when every wanted candidate is affordable.
   */
  readonly savingTarget: DemandSavingTarget | null;
  /**
   * The pursued automatic Mech build's Supply and Soul Gem cost. Requested
   * unconditionally like the saving target: enabling the automation is the
   * intent gate, and requests combine by maximum, so holding for the build
   * can only raise a demand, never lower one.
   */
  readonly mechCosts: readonly DemandCost[];
  /** In `missionBuildingList` order; indices in the result align with this. */
  readonly missions: readonly DemandMission[];
  readonly unlockedTechs: readonly DemandTech[];
  readonly spyPurchaseMoney: number;
  readonly fleet: DemandFleet;
  readonly availableCrafters: number;
  readonly crafters: readonly DemandCrafter[];
  readonly vitreloyPlant: DemandVitreloyPlant;
  readonly factoryCount: number;
  readonly factoryProductions: readonly DemandFactoryProduction[];
}

/** The build target being saved for, named so its reservation can say why. */
export interface DemandSavingTarget {
  readonly name: string;
  readonly pool?: string;
  readonly costs: readonly DemandCost[];
}

export interface DemandPrioritizationResult {
  readonly requests: readonly DemandRequest[];
  /**
   * Cost reservation for the saving target, or null when nothing is being saved
   * for. Requesting a quantity only tells crafting, market and storage to hold
   * a resource; it does not stop the build loop spending it, so without this a
   * target whose cost is produced rather than crafted never accumulates.
   */
  readonly savingConflict: {
    readonly name: string;
    readonly cost: Readonly<Record<string, number>>;
  } | null;
  /** Indices to splice from `missionBuildingList`, descending (splice-safe). */
  readonly removedMissionIndices: readonly number[];
}

export interface PreparedDemandPrioritization {
  readonly requests: readonly DemandRequest[];
  readonly removedMissionIndices: readonly number[];
  readonly settings: DemandPrioritizationSettings;
  readonly balance: number;
  readonly spyPurchaseMoney: number;
  readonly fleet: DemandFleet;
  readonly availableCrafters: number;
  readonly crafters: readonly DemandCrafter[];
  readonly vitreloyPlant: DemandVitreloyPlant;
}

export type DemandPrioritizationVariant = Pick<
  DemandPrioritizationInput,
  "savingTarget" | "mechCosts" | "factoryCount" | "factoryProductions"
>;

export interface DemandPrioritizationDelta {
  readonly requests: readonly DemandRequest[];
  readonly savingConflict: DemandPrioritizationResult["savingConflict"];
}

function projectDoubles(target: DemandTarget): boolean {
  return target.isProject && target.progress !== null && target.progress < 99;
}

export function prepareDemandPrioritization(
  input: Readonly<DemandPrioritizationInput>,
): PreparedDemandPrioritization {
  const { settings, consumptionBalanceTarget: balance } = input;
  const requests: DemandRequest[] = [];
  const removedMissionIndices: number[] = [];
  const request = (resourceId: string, amount: number) => {
    requests.push({ resourceId, amount });
  };

  if (input.inflationMoney !== null) {
    request("Money", input.inflationMoney);
  }
  if (input.retirementGraphene !== null) {
    request("Graphene", input.retirementGraphene);
  }

  let prioritizedTasks: DemandTarget[] = [];
  if (settings.prioritizeQueue.includes("req")) {
    prioritizedTasks.push(...input.queuedTargets);
  }
  if (settings.prioritizeTriggers.includes("req")) {
    prioritizedTasks.push(...input.triggerTargets);
  }
  if (settings.missionRequest) {
    for (let i = input.missions.length - 1; i >= 0; i--) {
      const mission = input.missions[i];
      if (mission === undefined) continue;
      if (
        mission.isUnlocked &&
        mission.autoBuildEnabled &&
        (!mission.isBlackholeJumpShip ||
          !settings.prestigeBioseedConstruct ||
          settings.prestigeType !== "whitehole")
      ) {
        prioritizedTasks.push(mission.target);
      } else if (mission.isComplete) {
        removedMissionIndices.push(i);
      }
    }
  }

  if (prioritizedTasks.length === 0) {
    // Apocalypse is not selectable in the game settings until this chain has
    // already unlocked it, but the selected route still gates all AI work.
    const apocalypseSelected = settings.prestigeType === "apocalypse";
    const truepathAiResearch = apocalypseSelected
      ? input.unlockedTechs.filter((tech) =>
          isTruepathAiResourceResearch(tech.id),
        )
      : [];
    const researchRequestEnabled = input.isEarlyGame
      ? settings.researchRequest
      : settings.researchRequestSpace;
    prioritizedTasks =
      truepathAiResearch.length > 0
        ? truepathAiResearch.map((tech) => tech.target)
        : apocalypseSelected && input.truepathAiBuildingTarget !== null
          ? [input.truepathAiBuildingTarget]
          : researchRequestEnabled
            ? input.unlockedTechs
                .filter((tech) => tech.isAffordable)
                .map((tech) => tech.target)
            : [];
  }

  for (const task of prioritizedTasks) {
    const multiplier = projectDoubles(task) ? 2 : 1;
    for (const cost of task.costs) {
      request(cost.resourceId, cost.amount * multiplier);
    }
  }

  return Object.freeze({
    requests: Object.freeze(requests.map((entry) => Object.freeze(entry))),
    removedMissionIndices: Object.freeze(removedMissionIndices),
    settings,
    balance,
    spyPurchaseMoney: input.spyPurchaseMoney,
    fleet: input.fleet,
    availableCrafters: input.availableCrafters,
    crafters: input.crafters,
    vitreloyPlant: input.vitreloyPlant,
  });
}

export function evaluateDemandPrioritizationVariants(
  prepared: Readonly<PreparedDemandPrioritization>,
  variants: readonly Readonly<DemandPrioritizationVariant>[],
): readonly DemandPrioritizationDelta[] {
  const { settings, balance } = prepared;
  return Object.freeze(
    variants.map((variant) => {
      const requests: DemandRequest[] = [];
      const request = (resourceId: string, amount: number) => {
        requests.push(Object.freeze({ resourceId, amount }));
      };
      const savingCost: Record<string, number> = {};
      if (variant.savingTarget !== null) {
        for (const cost of variant.savingTarget.costs) {
          request(cost.resourceId, cost.amount);
          savingCost[cost.resourceId] = cost.amount;
        }
      }
      for (const cost of variant.mechCosts)
        request(cost.resourceId, cost.amount);
      if (prepared.spyPurchaseMoney && settings.prioritizeUnify.includes("req"))
        request("Money", prepared.spyPurchaseMoney);
      if (
        settings.autoFleet &&
        prepared.fleet.nextShipAffordable &&
        settings.prioritizeOuterFleet.includes("req")
      ) {
        for (const cost of prepared.fleet.nextShipCost)
          request(cost.resourceId, cost.amount);
      }
      for (const crafter of prepared.crafters) {
        if (
          (settings.productionFactoryFocusMaterials || crafter.isDemanded) &&
          crafter.isUnlocked
        ) {
          for (const cost of crafter.costs) {
            request(
              cost.resourceId,
              cost.materialMaxQuantity * crafter.craftPreserve +
                prepared.availableCrafters * (1 / 140) * balance * cost.amount,
            );
          }
        }
      }
      const { vitreloyPlant } = prepared;
      const vitPlantCount =
        settings.autoPower && vitreloyPlant.autoStateEnabled
          ? vitreloyPlant.count
          : vitreloyPlant.stateOnCount;
      if (vitPlantCount > 0) request("Stanene", vitPlantCount * balance * 100);
      if (variant.factoryCount > 0) {
        const multiplier = variant.factoryCount * balance;
        const storageThreshold = settings.productionFactoryMinIngredients;
        for (const production of variant.factoryProductions) {
          if (
            (settings.productionFactoryFocusMaterials ||
              production.isDemanded) &&
            production.unlocked &&
            production.enabled &&
            production.weighting
          ) {
            for (const cost of production.costs) {
              request(
                cost.resourceId,
                cost.quantity * multiplier +
                  cost.minRateOfChange +
                  storageThreshold * cost.resourceMaxQuantity,
              );
            }
          }
        }
      }
      return Object.freeze({
        requests: Object.freeze(requests),
        savingConflict:
          variant.savingTarget === null
            ? null
            : Object.freeze({
                name: variant.savingTarget.name,
                cost: Object.freeze(savingCost),
              }),
      });
    }),
  );
}

export function evaluateDemandPrioritization(
  prepared: Readonly<PreparedDemandPrioritization>,
  variant: Readonly<DemandPrioritizationVariant>,
): DemandPrioritizationResult {
  const [delta] = evaluateDemandPrioritizationVariants(prepared, [variant]);
  return Object.freeze({
    savingConflict: delta?.savingConflict ?? null,
    requests: Object.freeze([
      ...(prepared.requests ?? []),
      ...(delta?.requests ?? []),
    ]),
    removedMissionIndices: prepared.removedMissionIndices,
  });
}

export function planDemandPrioritization(
  input: Readonly<DemandPrioritizationInput>,
): DemandPrioritizationResult {
  return evaluateDemandPrioritization(
    prepareDemandPrioritization(input),
    input,
  );
}
