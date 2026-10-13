/** Candidate comparison for one Research purchase versus saving for a declared goal blocker. */

import {
  compareGoalStrategies,
  type GoalResourceCommitment,
  type GoalResourceNeed,
  type GoalResourceStock,
  type GoalStrategyCandidate,
  type GoalStrategyComparison,
} from "../economy/goal-feasibility.ts";

export type ResearchSpendApplicability =
  "eligible" | "conditional" | "excluded" | "unavailable";

export interface ResearchSpendActionEvidence {
  readonly actionId: string;
  readonly cost: Readonly<Record<string, number>>;
  readonly currentNativeOffer: boolean | undefined;
  readonly nativeAffordable: boolean;
  readonly applicability: ResearchSpendApplicability;
  readonly offerGeneration: number | undefined;
  readonly expectedOfferGeneration: number | undefined;
  readonly controlGeneration: number | undefined;
  readonly expectedControlGeneration: number | undefined;
}

export interface ResearchSpendDecisionInput {
  readonly goalId: string;
  readonly currentGoalId: string;
  /** Applicability of the selected terminal objective, separate from this blocker action. */
  readonly terminalGoalApplicability: ResearchSpendApplicability;
  readonly validityEpoch: string;
  readonly currentValidityEpoch: string;
  readonly selectedAction: ResearchSpendActionEvidence | undefined;
  readonly selectedByResearchOwner: boolean;
  readonly selectedResourceAffordable: boolean | undefined;
  readonly selectedReservationConflict: boolean | undefined;
  readonly selectedExplicitExclusion: boolean | undefined;
  /** Undefined means the purchase's marginal unlock, production, and collateral are not captured. */
  readonly selectedEffects:
    | Readonly<{
        readonly productionChanges: GoalStrategyCandidate["productionChanges"];
        readonly effectsComplete: boolean;
        readonly effectAuthority: "provisional" | "validated";
        readonly unavailableReasons: readonly string[];
      }>
    | undefined;
  readonly target: ResearchSpendActionEvidence;
  readonly additionalTargetNeeds: readonly GoalResourceNeed[];
  readonly stocks: readonly GoalResourceStock[];
  readonly commitments: readonly GoalResourceCommitment[];
  readonly commitmentsKnown: boolean;
  /** A complete scan can explicitly establish that no accelerator is currently offered. */
  readonly acceleratorScan: "complete" | "unavailable";
  readonly accelerators: readonly Readonly<GoalStrategyCandidate>[];
}

export interface ResearchSpendDecision {
  readonly goalId: string;
  readonly selectedActionId: string | undefined;
  readonly targetActionId: string;
  readonly comparison: Readonly<GoalStrategyComparison> | undefined;
  readonly targetAffordability:
    "affordable" | "insufficient" | "native-denied" | "unknown";
  readonly decision:
    | "buy-selected"
    | "save-for-target"
    | "buy-accelerator"
    | "provisional"
    | "unavailable";
  readonly reasons: readonly string[];
}

function resourceNeeds(
  costs: Readonly<Record<string, number>>,
): readonly GoalResourceNeed[] | undefined {
  const needs: GoalResourceNeed[] = [];
  for (const [resourceId, amount] of Object.entries(costs)) {
    if (!Number.isFinite(amount) || amount < 0) return undefined;
    needs.push(Object.freeze({ resourceId, poolId: "anywhere", amount }));
  }
  return Object.freeze(needs);
}

function evidenceIsFresh(action: ResearchSpendActionEvidence): boolean {
  return (
    action.currentNativeOffer === true &&
    action.offerGeneration !== undefined &&
    action.offerGeneration === action.expectedOfferGeneration &&
    action.controlGeneration !== undefined &&
    action.controlGeneration === action.expectedControlGeneration
  );
}

/**
 * Compares the current Research owner's purchase against a wait projection for a goal blocker.
 * The shared feasibility owner handles all priced resources, parallel needs, commitments, rates,
 * capacity limits and production deltas. Unknown purchase effects or missing accelerator discovery
 * keep the global decision provisional; static dependency relevance never supplies an effect.
 */
export function decideResearchSpend(
  input: Readonly<ResearchSpendDecisionInput>,
): ResearchSpendDecision {
  const reasons: string[] = [];
  if (input.goalId !== input.currentGoalId)
    reasons.push("selected terminal goal changed during the observation");
  if (input.validityEpoch !== input.currentValidityEpoch)
    reasons.push("resource, price, control, or root observation is stale");
  if (input.terminalGoalApplicability !== "eligible")
    reasons.push(
      `terminal goal applicability is ${input.terminalGoalApplicability}`,
    );
  const targetNeeds = resourceNeeds(input.target.cost);
  const extraNeeds = resourceNeeds(
    Object.fromEntries(
      input.additionalTargetNeeds.map((need) => [
        need.resourceId,
        need.amount + (input.target.cost[need.resourceId] ?? 0),
      ]),
    ),
  );
  if (targetNeeds === undefined || extraNeeds === undefined)
    reasons.push(
      "native target price or parallel acquisition requirement is invalid",
    );
  const targetFresh = evidenceIsFresh(input.target);
  if (!targetFresh)
    reasons.push(
      "goal-relevant target offer or captured control is unavailable or stale",
    );
  if (input.target.applicability !== "eligible")
    reasons.push(`target applicability is ${input.target.applicability}`);
  if (!input.commitmentsKnown)
    reasons.push("external commitments or reservations are unavailable");
  const targetAffordable =
    targetFresh && targetNeeds !== undefined
      ? (() => {
          const comparison = compareGoalStrategies(
            input.target.actionId,
            targetNeeds,
            input.stocks,
            input.commitments,
            [],
            input.validityEpoch,
            input.commitmentsKnown,
          );
          const wait = comparison.strategies[0];
          if (wait?.completionTime === 0)
            return input.target.nativeAffordable
              ? ("affordable" as const)
              : ("native-denied" as const);
          if (wait?.feasibility.status === "infeasible")
            return "insufficient" as const;
          return wait?.feasibility.estimatedTime === undefined
            ? ("unknown" as const)
            : ("insufficient" as const);
        })()
      : "unknown";

  const currentSelectionUsable =
    input.selectedAction !== undefined &&
    input.selectedByResearchOwner &&
    evidenceIsFresh(input.selectedAction) &&
    input.selectedAction.nativeAffordable &&
    input.selectedResourceAffordable === true &&
    input.selectedReservationConflict === false &&
    input.selectedExplicitExclusion === false;
  if (input.selectedAction !== undefined && !currentSelectionUsable)
    reasons.push(
      "Research owner selection lacks fresh affordability, reservation, or exclusion evidence",
    );
  if (currentSelectionUsable && input.selectedEffects === undefined)
    reasons.push(
      "selected Research unlock, production and collateral effects are unknown; price-only projection assumes no rate or capacity change",
    );

  if (
    input.goalId !== input.currentGoalId ||
    input.validityEpoch !== input.currentValidityEpoch ||
    input.terminalGoalApplicability === "excluded" ||
    targetNeeds === undefined ||
    !targetFresh ||
    input.target.applicability !== "eligible"
  ) {
    return Object.freeze({
      goalId: input.goalId,
      selectedActionId: input.selectedAction?.actionId,
      targetActionId: input.target.actionId,
      comparison: undefined,
      targetAffordability: targetAffordable,
      decision: "unavailable",
      reasons: Object.freeze([...new Set(reasons)]),
    });
  }

  const candidates: GoalStrategyCandidate[] = [];
  if (currentSelectionUsable && input.selectedAction !== undefined) {
    const selectedNeeds = resourceNeeds(input.selectedAction.cost);
    const effects = input.selectedEffects;
    candidates.push(
      Object.freeze({
        id: `buy-selected:${input.selectedAction.actionId}`,
        goalId: input.target.actionId,
        preconditions: Object.freeze({
          satisfied: selectedNeeds !== undefined,
          reasons:
            selectedNeeds === undefined
              ? ["selected purchase price is invalid"]
              : [],
        }),
        acquisitionCosts: selectedNeeds ?? [],
        // Keep a price-only counterfactual visible when the actual unlock effect is unknown.
        // The incomplete flag and unavailable reason prevent it from authorizing a winner.
        productionChanges: effects?.productionChanges ?? [],
        effectsComplete: effects?.effectsComplete ?? false,
        effectAuthority: effects?.effectAuthority ?? "provisional",
        validityEpoch: input.validityEpoch,
        unavailableReasons: effects?.unavailableReasons ?? [],
      }),
    );
  } else
    reasons.push(
      "buy-selected scenario is not currently owner-selected and safe",
    );

  let acceleratorEvidenceComplete = input.acceleratorScan === "complete";
  for (const accelerator of input.accelerators) {
    if (
      accelerator.validityEpoch !== input.validityEpoch ||
      !accelerator.effectsComplete ||
      accelerator.productionChanges === undefined
    ) {
      acceleratorEvidenceComplete = false;
      reasons.push(
        `accelerator ${accelerator.id} lacks current complete effect evidence`,
      );
    }
    candidates.push(accelerator);
  }
  if (!acceleratorEvidenceComplete)
    reasons.push("accelerator offer/effect scan is unavailable");

  const comparison = compareGoalStrategies(
    input.target.actionId,
    [...(targetNeeds ?? []), ...input.additionalTargetNeeds],
    input.stocks,
    input.commitments,
    candidates,
    input.validityEpoch,
    input.commitmentsKnown,
  );
  const complete =
    currentSelectionUsable &&
    input.terminalGoalApplicability === "eligible" &&
    input.selectedEffects !== undefined &&
    input.selectedEffects.effectsComplete &&
    input.selectedEffects.effectAuthority === "validated" &&
    acceleratorEvidenceComplete &&
    input.commitmentsKnown &&
    comparison.provisionalWinner !== undefined;
  const reportedComparison = complete
    ? comparison
    : Object.freeze({ ...comparison, winner: undefined });
  const winner = reportedComparison.winner;
  const winnerId =
    winner ?? (complete ? comparison.provisionalWinner : undefined);
  const decision =
    winnerId === "wait"
      ? "save-for-target"
      : winnerId?.startsWith("buy-selected:")
        ? "buy-selected"
        : winnerId !== undefined
          ? "buy-accelerator"
          : "provisional";
  if (!complete)
    reasons.push(
      "expected terminal-goal time is provisional while strategy effects or option coverage remain unknown",
    );
  return Object.freeze({
    goalId: input.goalId,
    selectedActionId: input.selectedAction?.actionId,
    targetActionId: input.target.actionId,
    comparison: reportedComparison,
    targetAffordability: targetAffordable,
    decision,
    reasons: Object.freeze([...new Set(reasons)]),
  });
}
