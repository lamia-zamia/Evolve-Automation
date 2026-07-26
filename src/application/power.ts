import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  EMPTY_POWER_AUTOMATION_STATE,
  planPowerCycle,
  planPowerWarningShutdown,
  recordPowerWarningCap,
  type PowerAutomationState,
  type PowerDecision,
} from "../domain/economy/production/power.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { PowerReader, PowerWarningSource } from "../ports/power.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

export interface PowerAutomationDependencies {
  readonly reader: PowerReader;
  readonly executor: DecisionExecutor<PowerDecision>;
  readonly warnings: PowerWarningSource;
  readonly diagnostics?: TickDiagnostics | undefined;
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
  const profiling = dependencies.diagnostics;
  const measure = <T>(phase: string, action: () => T): T => {
    if (profiling === undefined || !profiling.readPerformanceEnabled()) {
      return action();
    }
    const startedAtMs = profiling.nowMs();
    try {
      return action();
    } finally {
      profiling.recordPerformance(phase, profiling.nowMs() - startedAtMs);
    }
  };
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const cycle = measure("autoPower.readCycle", () =>
        dependencies.reader.readCycle(),
      );
      const plan = measure("autoPower.planCycle", () =>
        planPowerCycle(cycle, state),
      );
      const decision = plan.decision;
      if (decision === null) {
        return SUCCEEDED;
      }
      const cycleOutcome = measure("autoPower.executeCycle", () =>
        dependencies.executor.execute(decision),
      );
      if (cycleOutcome.status !== "succeeded") {
        return cycleOutcome;
      }
      state = plan.nextState;

      const warning = planPowerWarningShutdown(
        measure("autoPower.readWarnings", () =>
          dependencies.reader.readWarnings(
            dependencies.warnings.readWarnedBuildingDomIds(),
          ),
        ),
      );
      if (warning === null) {
        return SUCCEEDED;
      }
      const warningOutcome = measure("autoPower.executeWarning", () =>
        dependencies.executor.execute(warning),
      );
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
