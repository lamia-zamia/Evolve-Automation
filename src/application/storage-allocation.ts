import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  EMPTY_STORAGE_ALLOCATION_STATE,
  finalizeStorageAllocation,
  planStorageAllocation,
  type ApplyStorageAllocationDecision,
  type StorageAllocationState,
} from "../domain/economy/storage/storage-allocation.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type {
  StorageAllocationReader,
  StorageExpansionRequester,
} from "../ports/storage-allocation.ts";

export interface StorageAllocationDependencies {
  readonly reader: StorageAllocationReader;
  readonly executor: DecisionExecutor<ApplyStorageAllocationDecision>;
  readonly expansion: StorageExpansionRequester;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export interface StorageAllocationAutomation {
  run(): CommandExecutionOutcome;
  readState(): StorageAllocationState;
}

export function createStorageAllocationAutomation(
  dependencies: StorageAllocationDependencies,
): StorageAllocationAutomation {
  let state = EMPTY_STORAGE_ALLOCATION_STATE;
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const rawPlan = planStorageAllocation(dependencies.reader.read());
      if (rawPlan === null) return SUCCEEDED;
      if (
        rawPlan.storageToBuild > 0 &&
        dependencies.expansion.expand(rawPlan.storageToBuild)
      ) {
        return SUCCEEDED;
      }
      const finalized = finalizeStorageAllocation(rawPlan, state);
      const outcome = dependencies.executor.execute(finalized.decision);
      if (outcome.status === "succeeded") {
        state = finalized.nextState;
      }
      return outcome;
    },

    readState(): StorageAllocationState {
      return state;
    },
  });
}
