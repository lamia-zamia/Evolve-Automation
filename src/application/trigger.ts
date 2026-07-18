import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planTrigger } from "../domain/trigger.ts";
import type {
  TriggerCommandExecutor,
  TriggerReader,
} from "../ports/trigger.ts";

export interface TriggerAutomationDependencies {
  readonly reader: TriggerReader;
  readonly executor: TriggerCommandExecutor;
}

export interface TriggerAutomationResult {
  readonly outcome: CommandExecutionOutcome;
  /** Whether at least one target reported a successful click. */
  readonly active: boolean;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

function result(
  outcome: CommandExecutionOutcome,
  active: boolean,
): TriggerAutomationResult {
  return Object.freeze({ outcome, active });
}

/**
 * Runs triggers in list order. Each target is a separate phase so inflation
 * protection can observe the result of every earlier click, matching the
 * legacy loop without putting live reads in the planner.
 */
export function runTriggerAutomation(
  dependencies: TriggerAutomationDependencies,
): TriggerAutomationResult {
  let index = 0;
  let active = false;
  while (true) {
    const decision = planTrigger(dependencies.reader.read(index));
    if (decision === null) {
      return result(SUCCEEDED, active);
    }

    if (decision.kind === "click") {
      const execution = dependencies.executor.execute(decision);
      if (execution.outcome.status !== "succeeded") {
        return result(execution.outcome, active);
      }
      active ||= execution.clicked;
    }
    index = decision.index + 1;
  }
}
