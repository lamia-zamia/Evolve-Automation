import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planOuterFleetBlueprint,
  planOuterFleetBuild,
  planOuterFleetCandidate,
  planOuterFleetCycle,
  planOuterFleetTarget,
  type OuterFleetDecision,
} from "../domain/combat/fleet-outer.ts";
import type {
  OuterFleetExecutor,
  OuterFleetReader,
} from "../ports/fleet-outer.ts";

export interface OuterFleetAutomationDependencies {
  readonly reader: OuterFleetReader;
  readonly executor: OuterFleetExecutor;
}

export interface OuterFleetAutomationResult {
  readonly outcome: CommandExecutionOutcome;
  /**
   * Whether this pass changed the ship the next one will be: the yard blueprint's parts, or the
   * ship's own count. Both move `CapturedFleetDemand`'s `nextShipCost`, which a shared resource
   * demand sample freezes, so the composition ends that sample's lifetime when this is true. A
   * status report that only narrates the current blueprint moves nothing.
   */
  readonly shipTargetChanged: boolean;
}

function execute(
  executor: OuterFleetExecutor,
  decision: Readonly<OuterFleetDecision>,
): OuterFleetAutomationResult {
  const outcome = executor.execute(decision);
  return Object.freeze({
    outcome,
    shipTargetChanged:
      outcome.status === "succeeded" && decision.kind === "build-outer-fleet",
  });
}

export function runOuterFleetAutomation(
  dependencies: OuterFleetAutomationDependencies,
): OuterFleetAutomationResult {
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
