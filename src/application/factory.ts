import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planFactory, type FactoryDecision } from "../domain/factory.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type {
  FactoryReader,
  FactoryTooltipPublisher,
} from "../ports/factory.ts";

export interface FactoryAutomationDependencies {
  readonly reader: FactoryReader;
  readonly executor: DecisionExecutor<FactoryDecision>;
  readonly tooltips: FactoryTooltipPublisher;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runFactoryAutomation(
  dependencies: FactoryAutomationDependencies,
): CommandExecutionOutcome {
  const decision = planFactory(dependencies.reader.read());
  if (decision === null) return SUCCEEDED;
  dependencies.tooltips.publish(decision.tooltips);
  return dependencies.executor.execute(decision);
}
