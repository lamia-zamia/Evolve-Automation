import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planGatherResources,
  type GatherResourcesDecision,
} from "../domain/gather-resources.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { GatherResourcesReader } from "../ports/gather-resources.ts";

export interface GatherResourcesAutomationDependencies {
  readonly reader: GatherResourcesReader;
  readonly executor: DecisionExecutor<GatherResourcesDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runGatherResourcesAutomation(
  dependencies: GatherResourcesAutomationDependencies,
): CommandExecutionOutcome {
  const decision = planGatherResources(dependencies.reader.read());
  return decision === null
    ? SUCCEEDED
    : dependencies.executor.execute(decision);
}
