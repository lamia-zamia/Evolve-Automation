import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planMutation, type MutationDecision } from "../domain/mutation.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { MutationReader } from "../ports/mutation.ts";

export interface MutationAutomationDependencies {
  readonly reader: MutationReader;
  readonly executor: DecisionExecutor<MutationDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runMutationAutomation(
  dependencies: MutationAutomationDependencies,
): CommandExecutionOutcome {
  const decision = planMutation(dependencies.reader.read());
  return decision === null
    ? SUCCEEDED
    : dependencies.executor.execute(decision);
}
