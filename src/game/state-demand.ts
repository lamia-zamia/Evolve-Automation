import type { DemandPrioritizationResult } from "../domain/economy/resources/demand-prioritization.ts";
import type { StorageRequirementsResult } from "../domain/economy/storage/storage-requirements.ts";

interface ResourceState {
  maxCost: number;
  storageRequired: number;
  requestQuantity(amount: number): void;
}

interface StateDemandState {
  knowledgeRequiredByTechs: number;
  cheapestTechKnowledge: number;
  knowledgeRequiredByBuildTargets: number;
  missionBuildingList: unknown[];
}

/** Apply pure storage planning results to the live game resource catalog and state. */
export function applyStorageRequirementsResult(
  result: Readonly<StorageRequirementsResult>,
  resources: Record<string, ResourceState>,
  state: StateDemandState,
): void {
  for (const requirement of result.resources) {
    // The game resource catalog contains every resource returned by its planners.
    const resource = resources[requirement.id]!;
    resource.maxCost = requirement.maxCost;
    resource.storageRequired = requirement.storageRequired;
  }

  state.knowledgeRequiredByTechs = result.knowledge.knowledgeRequiredByTechs;
  state.cheapestTechKnowledge = result.knowledge.cheapestTechKnowledge;
  state.knowledgeRequiredByBuildTargets =
    result.knowledge.knowledgeRequiredByBuildTargets;
}

/** Apply pure demand-planning requests and completed-mission removals in order. */
export function applyDemandPrioritizationResult(
  result: Readonly<DemandPrioritizationResult>,
  resources: Record<string, ResourceState>,
  state: StateDemandState,
): void {
  for (const request of result.requests) {
    // The game resource catalog contains every resource requested by its planners.
    const resource = resources[request.resourceId]!;
    resource.requestQuantity(request.amount);
  }
  for (const index of result.removedMissionIndices) {
    state.missionBuildingList.splice(index, 1);
  }
}
