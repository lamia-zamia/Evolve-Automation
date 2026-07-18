import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planMiningDroidAdjustments,
  planMiningDroidTargets,
  type MiningDroidDecision,
} from "../domain/mining-droid.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { MiningDroidReader } from "../ports/mining-droid.ts";

export interface MiningDroidAutomationDependencies {
  readonly reader: MiningDroidReader;
  readonly executor: DecisionExecutor<MiningDroidDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runMiningDroidAutomation(
  dependencies: MiningDroidAutomationDependencies,
): CommandExecutionOutcome {
  const targets = planMiningDroidTargets(
    dependencies.reader.readPlanningInput(),
  );
  if (targets === null) {
    return SUCCEEDED;
  }
  const current = dependencies.reader.readCurrent(
    targets.map((target) => target.productionId),
  );
  return dependencies.executor.execute(
    planMiningDroidAdjustments(targets, current),
  );
}
