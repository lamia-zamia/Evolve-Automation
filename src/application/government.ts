import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planGovernment,
  type GovernmentDecision,
} from "../domain/civic/government.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { GovernmentReader } from "../ports/government.ts";

export interface GovernmentAutomationDependencies {
  readonly reader: GovernmentReader;
  readonly executor: DecisionExecutor<GovernmentDecision>;
}

export function runGovernmentAutomation(
  dependencies: GovernmentAutomationDependencies,
): CommandExecutionOutcome {
  return dependencies.executor.execute(
    planGovernment(dependencies.reader.read()),
  );
}
