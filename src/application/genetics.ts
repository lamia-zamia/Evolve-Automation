import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planGenetics,
  type GeneticsDecision,
} from "../domain/traits/genetics.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { GeneticsControls, GeneticsReader } from "../ports/genetics.ts";

export interface GeneticsAutomationDependencies {
  readonly reader: GeneticsReader;
  readonly executor: DecisionExecutor<GeneticsDecision>;
  readonly controls: GeneticsControls;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runGeneticsAutomation(
  dependencies: GeneticsAutomationDependencies,
): CommandExecutionOutcome {
  if (!dependencies.reader.readGate().unlocked) return SUCCEEDED;
  if (!dependencies.controls.capture()) {
    return {
      status: "stale",
      failure: {
        code: "genetics-controls-unavailable",
        message: "genetics controls are unavailable",
      },
    };
  }
  for (const decision of planGenetics(dependencies.reader.readPlan())) {
    const outcome = dependencies.executor.execute(decision);
    if (outcome.status !== "succeeded") return outcome;
  }
  return SUCCEEDED;
}
