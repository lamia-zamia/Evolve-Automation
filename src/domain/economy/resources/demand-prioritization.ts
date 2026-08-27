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
}

export interface DemandTarget {
  readonly costs: readonly DemandCost[];
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

export interface DemandPrioritizationResult {
  readonly requests: readonly DemandRequest[];
  /** Indices to splice from `missionBuildingList`, descending (splice-safe). */
  readonly removedMissionIndices: readonly number[];
}

function projectDoubles(target: DemandTarget): boolean {
  return target.isProject && target.progress !== null && target.progress < 99;
}

export function planDemandPrioritization(
  input: Readonly<DemandPrioritizationInput>,
): DemandPrioritizationResult {
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
    // already unlocked it, so the tech ids themselves are the early-run gate.
    const truepathAiResearch = input.unlockedTechs.filter((tech) =>
      isTruepathAiResourceResearch(tech.id),
    );
    const researchRequestEnabled = input.isEarlyGame
      ? settings.researchRequest
      : settings.researchRequestSpace;
    prioritizedTasks =
      truepathAiResearch.length > 0
        ? truepathAiResearch.map((tech) => tech.target)
        : input.truepathAiBuildingTarget !== null
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

  if (input.spyPurchaseMoney && settings.prioritizeUnify.includes("req")) {
    request("Money", input.spyPurchaseMoney);
  }

  if (
    settings.autoFleet &&
    input.fleet.nextShipAffordable &&
    settings.prioritizeOuterFleet.includes("req")
  ) {
    for (const cost of input.fleet.nextShipCost) {
      request(cost.resourceId, cost.amount);
    }
  }

  for (const crafter of input.crafters) {
    if (
      (settings.productionFactoryFocusMaterials || crafter.isDemanded) &&
      crafter.isUnlocked
    ) {
      for (const cost of crafter.costs) {
        const minExpected =
          cost.materialMaxQuantity * crafter.craftPreserve +
          input.availableCrafters * (1 / 140) * balance * cost.amount;
        request(cost.resourceId, minExpected);
      }
    }
  }

  const { vitreloyPlant } = input;
  const vitPlantCount =
    settings.autoPower && vitreloyPlant.autoStateEnabled
      ? vitreloyPlant.count
      : vitreloyPlant.stateOnCount;
  if (vitPlantCount > 0) {
    request("Stanene", vitPlantCount * balance * 100);
  }

  if (input.factoryCount > 0) {
    const multiplier = input.factoryCount * balance;
    const storageThreshold = settings.productionFactoryMinIngredients;
    for (const production of input.factoryProductions) {
      if (
        (settings.productionFactoryFocusMaterials || production.isDemanded) &&
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
    requests: Object.freeze(requests.map((entry) => Object.freeze(entry))),
    removedMissionIndices: Object.freeze(removedMissionIndices),
  });
}
