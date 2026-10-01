import type {
  OuterFleetAutomaticPlan,
  OuterFleetBlueprintInput,
  OuterFleetBuildReadinessInput,
  OuterFleetCandidateInput,
  OuterFleetCandidatePlan,
  OuterFleetCycleInput,
  OuterFleetDecision,
  OuterFleetReadinessPlan,
  OuterFleetTargetInput,
  OuterFleetTargetPlan,
} from "../domain/combat/fleet-outer.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface OuterFleetReader {
  readCycle(): OuterFleetCycleInput;
  readTargeting(
    cycle: Readonly<OuterFleetAutomaticPlan>,
  ): OuterFleetTargetInput;
  readBlueprint(
    target: Readonly<OuterFleetTargetPlan>,
  ): OuterFleetBlueprintInput;
  readCandidate(
    candidate: Readonly<OuterFleetCandidatePlan>,
  ): OuterFleetCandidateInput;
  readBuildReadiness(
    plan: Readonly<OuterFleetReadinessPlan>,
  ): OuterFleetBuildReadinessInput;
  /**
   * Whether the last executed decision changed the ship the yard will build next — the live
   * blueprint, or the number of built ships in its cost tier, either of which moves
   * `shipCosts()` and therefore `CapturedFleetDemand`'s frozen `nextShipCost`.
   *
   * Owned here rather than derived from `CommandExecutionOutcome.status`, because the executor
   * calls `setPart()` before its power and postcondition checks: upstream `shipPlans.setVal()`
   * writes `global.space.shipyard.blueprint` and redraws the cost row immediately, so a pass can be
   * rejected or stale and still leave the next cost moved. A consumer only has to compare this
   * against what it sampled, which is exactly the fact a shared demand sample cannot hold.
   */
  readShipTargetChanged(): boolean;
}

export type OuterFleetExecutor = DecisionExecutor<OuterFleetDecision>;
