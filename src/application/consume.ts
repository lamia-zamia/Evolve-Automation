import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planConsume, type ConsumeDecision } from "../domain/consume.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { ConsumeReader } from "../ports/consume.ts";

export interface ConsumeAutomationDependencies {
  readonly reader: ConsumeReader;
  readonly executor: DecisionExecutor<ConsumeDecision>;
}

export function runConsumeAutomation(
  dependencies: ConsumeAutomationDependencies,
): CommandExecutionOutcome {
  return dependencies.executor.execute(planConsume(dependencies.reader.read()));
}
