import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  EMPTY_POWER_AUTOMATION_STATE,
  planPowerCycle,
  planPowerWarningShutdown,
  recordPowerWarningCap,
  type PowerAutomationState,
  type PowerDecision,
} from "../domain/power.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { PowerReader, PowerWarningSource } from "../ports/power.ts";

export interface PowerAutomationDependencies {
  readonly reader: PowerReader;
  readonly executor: DecisionExecutor<PowerDecision>;
  readonly warnings: PowerWarningSource;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export interface PowerAutomation {
  run(): CommandExecutionOutcome;
  readState(): PowerAutomationState;
}

export function createPowerAutomation(
  dependencies: PowerAutomationDependencies,
): PowerAutomation {
  let state = EMPTY_POWER_AUTOMATION_STATE;
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const plan = planPowerCycle(dependencies.reader.readCycle(), state);
      if (plan.decision === null) {
        return SUCCEEDED;
      }
      const cycleOutcome = dependencies.executor.execute(plan.decision);
      if (cycleOutcome.status !== "succeeded") {
        return cycleOutcome;
      }
      state = plan.nextState;

      const warning = planPowerWarningShutdown(
        dependencies.reader.readWarnings(
          dependencies.warnings.readWarnedBuildingDomIds(),
        ),
      );
      if (warning === null) {
        return SUCCEEDED;
      }
      const warningOutcome = dependencies.executor.execute(warning);
      if (warningOutcome.status !== "succeeded") {
        return warningOutcome;
      }
      state = recordPowerWarningCap(
        state,
        warning.binding,
        dependencies.reader.readStateOn(warning.binding),
      );
      return SUCCEEDED;
    },

    readState(): PowerAutomationState {
      return state;
    },
  });
}
