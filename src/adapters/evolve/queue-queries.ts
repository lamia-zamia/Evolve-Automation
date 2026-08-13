import { isCostAffordable } from "../../domain/cost-affordability.ts";
import { readCostAffordabilityInput, readQueueTarget } from "./queue-items.ts";

interface QueueQueryDependencies {
  readonly getResources: () => unknown;
  readonly getPoly: () => unknown;
  readonly getMechManager: () => unknown;
  readonly getBuildingIds: () => unknown;
  readonly getArpaIds: () => unknown;
}

export interface QueueQueries {
  checkAffordableCustom(cost: unknown, max?: boolean): boolean;
  readQueuedTarget(item: unknown): unknown;
}

export function createQueueQueries({
  getResources,
  getPoly,
  getMechManager,
  getBuildingIds,
  getArpaIds,
}: QueueQueryDependencies): QueueQueries {
  function checkAffordableCustom(cost: unknown, max = false): boolean {
    const readResult = readCostAffordabilityInput(
      cost,
      getResources(),
      max ? "maximum" : "current",
    );
    return readResult.status === "ready"
      ? isCostAffordable(readResult.input)
      : false;
  }

  function readQueuedTarget(item: unknown): unknown {
    return readQueueTarget(item, {
      resources: getResources(),
      poly: getPoly(),
      mechManager: getMechManager(),
      buildingIds: getBuildingIds(),
      arpaIds: getArpaIds(),
    });
  }

  return { checkAffordableCustom, readQueuedTarget };
}
