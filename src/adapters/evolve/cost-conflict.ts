import { findCostConflict } from "../../domain/cost-conflicts.ts";
import { readCostConflictInput } from "./cost-conflicts.ts";

interface CostConflictDependencies {
  readonly getState: () => unknown;
  readonly getResources: () => unknown;
}

export interface CostConflict {
  getCostConflict(action: unknown): unknown;
}

export function createCostConflict({
  getState,
  getResources,
}: CostConflictDependencies): CostConflict {
  function getCostConflict(action: unknown): unknown {
    const readResult = readCostConflictInput(
      getState(),
      getResources(),
      action,
    );
    return readResult.status === "ready"
      ? findCostConflict(readResult.input)
      : readResult;
  }

  return { getCostConflict };
}
