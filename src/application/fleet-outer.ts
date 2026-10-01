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
   *
   * Read back from the adapter rather than derived from the outcome, because a pass can move the
   * yard and still fail: `setPart` writes the live blueprint before the power and postcondition
   * checks run.
   */
  readonly shipTargetChanged: boolean;
}

function execute(
  dependencies: OuterFleetAutomationDependencies,
  decision: Readonly<OuterFleetDecision>,
): OuterFleetAutomationResult {
  const outcome = dependencies.executor.execute(decision);
  return Object.freeze({
    outcome,
    shipTargetChanged: dependencies.reader.readShipTargetChanged(),
  });
}

export function runOuterFleetAutomation(
  dependencies: OuterFleetAutomationDependencies,
): OuterFleetAutomationResult {
  const cycle = planOuterFleetCycle(dependencies.reader.readCycle());
  if (cycle.kind === "outer-fleet-status") {
    return execute(dependencies, cycle);
  }
  const target = planOuterFleetTarget(
    cycle,
    dependencies.reader.readTargeting(cycle),
  );
  if (target.kind === "outer-fleet-status") {
    return execute(dependencies, target);
  }
  const candidate = planOuterFleetBlueprint(
    dependencies.reader.readBlueprint(target),
  );
  if (candidate.kind === "outer-fleet-status") {
    return execute(dependencies, candidate);
  }
  const readiness = planOuterFleetCandidate(
    dependencies.reader.readCandidate(candidate),
  );
  if (readiness.kind === "outer-fleet-status") {
    return execute(dependencies, readiness);
  }
  return execute(
    dependencies,
    planOuterFleetBuild(dependencies.reader.readBuildReadiness(readiness)),
  );
}
