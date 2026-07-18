import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planOuterFleetBlueprint,
  planOuterFleetBuild,
  planOuterFleetCandidate,
  planOuterFleetCycle,
  planOuterFleetTarget,
  type OuterFleetDecision,
} from "../domain/fleet-outer.ts";
import type {
  OuterFleetExecutor,
  OuterFleetReader,
} from "../ports/fleet-outer.ts";

export interface OuterFleetAutomationDependencies {
  readonly reader: OuterFleetReader;
  readonly executor: OuterFleetExecutor;
}

function execute(
  executor: OuterFleetExecutor,
  decision: Readonly<OuterFleetDecision>,
): CommandExecutionOutcome {
  return executor.execute(decision);
}

export function runOuterFleetAutomation(
  dependencies: OuterFleetAutomationDependencies,
): CommandExecutionOutcome {
  const cycle = planOuterFleetCycle(dependencies.reader.readCycle());
  if (cycle.kind === "outer-fleet-status") {
    return execute(dependencies.executor, cycle);
  }
  const target = planOuterFleetTarget(
    cycle,
    dependencies.reader.readTargeting(cycle),
  );
  if (target.kind === "outer-fleet-status") {
    return execute(dependencies.executor, target);
  }
  const candidate = planOuterFleetBlueprint(
    dependencies.reader.readBlueprint(target),
  );
  if (candidate.kind === "outer-fleet-status") {
    return execute(dependencies.executor, candidate);
  }
  const readiness = planOuterFleetCandidate(
    dependencies.reader.readCandidate(candidate),
  );
  if (readiness.kind === "outer-fleet-status") {
    return execute(dependencies.executor, readiness);
  }
  return execute(
    dependencies.executor,
    planOuterFleetBuild(dependencies.reader.readBuildReadiness(readiness)),
  );
}
