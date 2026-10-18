export interface ProductionInterventionEvidence {
  readonly startingStateMatched: boolean;
  readonly evidenceCurrent: boolean;
  readonly evidenceInvalidReason?: string;
  readonly priceUnchanged: boolean;
  readonly baselineReadyPeriod: number | undefined;
  readonly interventionReadyPeriod: number | undefined;
  readonly targetResourceCurrentlyScarce: boolean | undefined;
  readonly targetResourceId: string;
  readonly targetWasLastThreshold: boolean | undefined;
  readonly interventionAvailable: boolean;
  readonly interventionUnavailableReason?: string;
  readonly targetProductionDelta: number | undefined;
  readonly collateralProductionChanges:
    readonly Readonly<{ resourceId: string; delta: number }>[] | undefined;
  readonly collateralEffectsComplete: boolean;
  readonly nonTargetActionsMatchedUntilReadiness: boolean;
  readonly foodSustainable: boolean | undefined;
  readonly externalCommitmentsKnown: boolean;
}

export interface ProductionInterventionAssessment {
  readonly outcome: "inconclusive" | "redundant" | "advanced" | "harmful";
  readonly targetResourceId: string;
  readonly resourceCurrentlyScarce: boolean | undefined;
  readonly resourceWasLastThreshold: boolean | undefined;
  readonly interventionAvailable: boolean;
  readonly resourceProductionIncreased: boolean | undefined;
  readonly actionReadinessAdvanced: boolean | undefined;
  readonly actionReadinessWorsened: boolean | undefined;
  readonly collateralProductionLosses: readonly Readonly<{
    resourceId: string;
    delta: number;
  }>[];
  readonly forecastComplete: boolean;
  readonly reasons: readonly string[];
}

/** Classifies paired native evidence; this grants no production or spending authority. */
export function assessProductionInterventionEvidence(
  evidence: ProductionInterventionEvidence,
): ProductionInterventionAssessment {
  const reasons: string[] = [];
  if (!evidence.startingStateMatched)
    reasons.push("paired runs did not start from equivalent state");
  if (!evidence.evidenceCurrent)
    reasons.push(
      evidence.evidenceInvalidReason ??
        "root, offer, or affordability evidence is stale",
    );
  if (!evidence.priceUnchanged)
    reasons.push("native Research price changed between observations");
  if (!evidence.interventionAvailable)
    reasons.push(
      evidence.interventionUnavailableReason ??
        "native production intervention was unavailable",
    );
  if (evidence.targetProductionDelta === undefined)
    reasons.push("paired target-resource production effect is unknown");
  if (
    evidence.targetProductionDelta !== undefined &&
    evidence.targetProductionDelta <= 0
  )
    reasons.push(
      "paired intervention did not increase target-resource production",
    );
  if (evidence.targetWasLastThreshold === undefined)
    reasons.push("last observed Research resource threshold is ambiguous");
  if (evidence.foodSustainable === undefined)
    reasons.push("Food sustainability was not established");
  if (evidence.baselineReadyPeriod === undefined)
    reasons.push("baseline native action readiness time is unavailable");
  if (evidence.interventionReadyPeriod === undefined)
    reasons.push("intervention native action readiness time is unavailable");
  if (!evidence.nonTargetActionsMatchedUntilReadiness)
    reasons.push("a non-target native action diverged before target readiness");

  const resourceProductionIncreased =
    evidence.targetProductionDelta === undefined
      ? undefined
      : evidence.targetProductionDelta > 0;
  const actionReadinessAdvanced =
    evidence.baselineReadyPeriod === undefined ||
    evidence.interventionReadyPeriod === undefined
      ? undefined
      : evidence.interventionReadyPeriod < evidence.baselineReadyPeriod;
  const actionReadinessWorsened =
    evidence.baselineReadyPeriod === undefined ||
    evidence.interventionReadyPeriod === undefined
      ? undefined
      : evidence.interventionReadyPeriod > evidence.baselineReadyPeriod;
  const collateralProductionLosses = Object.freeze(
    (evidence.collateralProductionChanges ?? [])
      .filter(({ delta }) => delta < 0)
      .map(({ resourceId, delta }) => Object.freeze({ resourceId, delta })),
  );
  const forecastComplete =
    evidence.collateralEffectsComplete && evidence.externalCommitmentsKnown;

  const decisionReasons = reasons.filter(
    (reason) => reason !== "Food sustainability was not established",
  );
  let outcome: ProductionInterventionAssessment["outcome"] = "inconclusive";
  if (
    decisionReasons.length === 0 &&
    (evidence.foodSustainable === false || actionReadinessWorsened === true)
  )
    outcome = "harmful";
  else if (reasons.length === 0) {
    if (actionReadinessAdvanced === true) outcome = "advanced";
    else if (
      actionReadinessAdvanced === false &&
      actionReadinessWorsened === false
    )
      outcome = "redundant";
  }
  if (!evidence.collateralEffectsComplete)
    reasons.push("collateral production effects are incomplete");
  if (!evidence.externalCommitmentsKnown)
    reasons.push("external resource commitments are incomplete");

  return Object.freeze({
    outcome,
    targetResourceId: evidence.targetResourceId,
    resourceCurrentlyScarce: evidence.targetResourceCurrentlyScarce,
    resourceWasLastThreshold: evidence.targetWasLastThreshold,
    interventionAvailable: evidence.interventionAvailable,
    resourceProductionIncreased,
    actionReadinessAdvanced,
    actionReadinessWorsened,
    collateralProductionLosses,
    forecastComplete,
    reasons: Object.freeze(reasons),
  });
}
