import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planCraft,
  shouldRunCraft,
  type CraftDecision,
} from "../domain/economy/production/craft.ts";
import type { CraftReader } from "../ports/craft.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";

export interface CraftAutomationDependencies {
  readonly reader: CraftReader;
  readonly executor: DecisionExecutor<CraftDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

/**
 * Each craftable is a phase so later decisions observe the cached material
 * deductions made by earlier commands, preserving legacy list ordering.
 */
export function runCraftAutomation(
  dependencies: CraftAutomationDependencies,
): CommandExecutionOutcome {
  if (!shouldRunCraft(dependencies.reader.readGate())) {
    return SUCCEEDED;
  }

  for (let index = 0; ; index++) {
    const candidate = dependencies.reader.readCandidate(index);
    if (candidate === null) {
      return SUCCEEDED;
    }
    const decision = planCraft(candidate);
    if (decision === null) {
      continue;
    }
    const outcome = dependencies.executor.execute(decision);
    if (outcome.status !== "succeeded") {
      return outcome;
    }
  }
}
