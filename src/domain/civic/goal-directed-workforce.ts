import type { GoalProductionChange } from "../economy/goal-feasibility.ts";

export type WorkforceDecisionConfidence =
  "unavailable" | "low" | "provisional" | "validated";

export interface GoalWorkforcePrecondition {
  readonly id: string;
  readonly satisfied: boolean;
  readonly reason: string | undefined;
}

export interface GoalWorkforceRestriction {
  readonly id: string;
  readonly active: boolean;
  readonly reason: string;
}

export interface GoalDirectedWorkforceDecision {
  readonly terminalGoalId: string;
  readonly immediateGoalId: string;
  readonly change: Readonly<{
    readonly sourceJobId: string;
    readonly destinationJobId: string;
    readonly workers: number;
  }>;
  readonly marginalEffects: readonly Readonly<GoalProductionChange>[];
  readonly opportunityCosts: readonly Readonly<GoalProductionChange>[];
  readonly preconditions: readonly Readonly<GoalWorkforcePrecondition>[];
  readonly restrictions: readonly Readonly<GoalWorkforceRestriction>[];
  readonly observationGeneration: number;
  readonly controlGeneration: number;
  readonly confidence: WorkforceDecisionConfidence;
  readonly unavailableReasons: readonly string[];
  readonly provenance: Readonly<{
    readonly kind:
      | "player-intent"
      | "derived-goal"
      | "strategy-estimate"
      | "test-intervention";
    readonly id: string;
  }>;
  readonly productionExecutionAuthorized: boolean;
}

/** Explicit test authority cannot be mistaken for production authorization. */
export interface ExperimentalWorkforceIntervention {
  readonly kind: "test-only-workforce-intervention";
  readonly decision: Readonly<
    Omit<GoalDirectedWorkforceDecision, "productionExecutionAuthorized"> & {
      readonly productionExecutionAuthorized: false;
    }
  >;
  readonly productionExecutionAuthorized: false;
}

/** Provisional rankings and incomplete safety evidence never authorize gameplay execution. */
export function canExecuteGoalDirectedWorkforceDecision(
  decision: Readonly<GoalDirectedWorkforceDecision>,
): boolean {
  return (
    decision.productionExecutionAuthorized &&
    decision.confidence === "validated" &&
    decision.provenance.kind !== "test-intervention" &&
    decision.change.workers > 0 &&
    Number.isInteger(decision.change.workers) &&
    decision.terminalGoalId.length > 0 &&
    decision.immediateGoalId.length > 0 &&
    decision.change.sourceJobId.length > 0 &&
    decision.change.destinationJobId.length > 0 &&
    decision.change.sourceJobId !== decision.change.destinationJobId &&
    decision.marginalEffects.length > 0 &&
    decision.preconditions.length > 0 &&
    Number.isSafeInteger(decision.observationGeneration) &&
    decision.observationGeneration >= 0 &&
    Number.isSafeInteger(decision.controlGeneration) &&
    decision.controlGeneration >= 0 &&
    decision.unavailableReasons.length === 0 &&
    decision.preconditions.every(({ satisfied }) => satisfied) &&
    decision.restrictions.every(({ active }) => !active)
  );
}
