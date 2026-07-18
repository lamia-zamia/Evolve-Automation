import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planOcularPowers,
  type OcularPowerDecision,
} from "../domain/ocular-power.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type {
  OcularPowerControls,
  OcularPowerReader,
} from "../ports/ocular-power.ts";

export interface OcularPowerAutomationDependencies {
  readonly reader: OcularPowerReader;
  readonly executor: DecisionExecutor<OcularPowerDecision>;
  readonly controls: OcularPowerControls;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runOcularPowerAutomation(
  dependencies: OcularPowerAutomationDependencies,
): CommandExecutionOutcome {
  if (!dependencies.reader.readGate().unlocked) return SUCCEEDED;
  if (!dependencies.controls.capture()) {
    return {
      status: "stale",
      failure: {
        code: "ocular-controls-unavailable",
        message: "ocular power controls are unavailable",
      },
    };
  }
  for (const decision of planOcularPowers(dependencies.reader.readPlan())) {
    const outcome = dependencies.executor.execute(decision);
    if (outcome.status !== "succeeded") return outcome;
  }
  return SUCCEEDED;
}
