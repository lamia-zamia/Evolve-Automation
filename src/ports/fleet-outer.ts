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
}

export type OuterFleetExecutor = DecisionExecutor<OuterFleetDecision>;
