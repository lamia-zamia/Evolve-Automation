import {
  applyDemandPrioritizationResult,
  applyStorageRequirementsResult,
} from "../../game/state-demand.ts";
import { planDemandPrioritization } from "../../domain/economy/resources/demand-prioritization.ts";
import { planFuelDepotDemand } from "../../domain/economy/storage/fuel-depot-demand.ts";
import { planStorageRequirements } from "../../domain/economy/storage/storage-requirements.ts";
import { readDemandPrioritizationInput } from "./economy/resources/demand-prioritization.ts";
import {
  readFuelDepotDemandInput,
  readStorageRequirementsInput,
} from "./economy/storage/storage-requirements.ts";

interface ResourceState {
  techMissionMaxCost?: number;
  maxCost: number;
  storageRequired: number;
  requestQuantity(amount: number): void;
}

interface DemandState {
  knowledgeRequiredByTechs: number;
  cheapestTechKnowledge: number;
  knowledgeRequiredByBuildTargets: number;
  missionBuildingList: unknown[];
}

interface StorageRequirementsActionDependencies {
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getResources: () => Record<string, ResourceState>;
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

interface DemandPrioritizationActionDependencies {
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getResources: () => Record<string, ResourceState>;
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

export function createStorageRequirementsAction({
  getSettings,
  getState,
  getResources,
  getBuildings,
  getGame,
  getBuildingManager,
  getProjectManager,
  getFleetManagerOuter,
  isTechnology,
  isInflationAssistActive,
  isRetirementAssistActive,
  getInflationChallengeMoney,
  getRetirementGraphene,
}: StorageRequirementsActionDependencies) {
  function calculateRequiredStorages(): void {
    const resources = getResources();
    const state = getState() as DemandState;
    const result = planStorageRequirements(
      readStorageRequirementsInput({
        getSettings,
        getState,
        getResources,
        getBuildings,
        getGame,
        getBuildingManager,
        getProjectManager,
        getFleetManagerOuter,
        isTechnology,
        isInflationAssistActive,
        isRetirementAssistActive,
        getInflationChallengeMoney,
        getRetirementGraphene,
      }),
    );
    applyStorageRequirementsResult(result, resources, state);
    const fuelDepotDemand = planFuelDepotDemand(
      readFuelDepotDemandInput({ getState }),
    );
    for (const [resourceId, maxCost] of fuelDepotDemand) {
      const resource = resources[resourceId];
      if (resource !== undefined) {
        resource.techMissionMaxCost = maxCost;
      }
    }
  }

  return { calculateRequiredStorages };
}

export function createDemandPrioritizationAction({
  getSettings,
  getState,
  getResources,
  getBuildings,
  getCrafter,
  getSpyManager,
  getFleetManagerOuter,
  getJobManager,
  getFactoryManager,
  getIsEarlyGame,
  isProject,
  isInflationAssistActive,
  isRetirementAssistActive,
  getInflationChallengeMoney,
  getRetirementGraphene,
  consumptionBalanceTarget,
}: DemandPrioritizationActionDependencies) {
  function prioritizeDemandedResources(): void {
    const resources = getResources();
    const state = getState() as DemandState;
    const result = planDemandPrioritization(
      readDemandPrioritizationInput({
        getSettings,
        getState,
        getResources,
        getBuildings,
        getCrafter,
        getSpyManager,
        getFleetManagerOuter,
        getJobManager,
        getFactoryManager,
        getIsEarlyGame,
        isProject,
        isInflationAssistActive,
        isRetirementAssistActive,
        getInflationChallengeMoney,
        getRetirementGraphene,
        consumptionBalanceTarget,
      }),
    );
    applyDemandPrioritizationResult(result, resources, state);
  }

  return { prioritizeDemandedResources };
}
