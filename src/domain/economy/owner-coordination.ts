export type RequirementProvenance =
  | "verified-mandatory"
  | "provisional-advisory"
  | "explicit-user-instruction"
  | "existing-owner-demand";

export interface OwnerPlanEffect {
  readonly resourceId: string;
  readonly poolId: string;
  readonly amount: number;
  readonly capacityDelta?: number;
}

export interface OwnerCoordinationEvidence {
  readonly goalId: string;
  readonly requirementId: string;
  readonly provenance: RequirementProvenance;
  readonly resourceId: string;
  readonly poolId: string;
  readonly targetAmount?: number;
  readonly coveredAmount?: number;
  readonly coverageComplete: boolean;
  readonly explicitQueueActive: boolean;
  readonly playerPermitted: boolean;
  readonly excluded: boolean;
  readonly ownerId: string;
  readonly capability: string;
  readonly targetOwner: string;
  readonly requestPortAvailable: boolean;
  readonly nativeControlAvailable: boolean;
  readonly nativeCapAvailable: boolean;
  readonly safeWorkerSourceAvailable: boolean | undefined;
  readonly rootId: string;
  readonly currentRootId: string;
  readonly progressionId: string;
  readonly currentProgressionId: string;
  readonly priceIdentity: string;
  readonly currentPriceIdentity: string;
  readonly controlGeneration: string;
  readonly currentControlGeneration: string;
  readonly snapshotGeneration: string;
  readonly currentSnapshotGeneration: string;
  readonly permissionGeneration: string;
  readonly currentPermissionGeneration: string;
  readonly snapshotCurrent: boolean;
  readonly incumbentPlanId: string;
  readonly proposedPlanId: string;
  readonly incumbentEffects?: readonly OwnerPlanEffect[];
  readonly proposedEffects?: readonly OwnerPlanEffect[];
  readonly commitmentClaimsComplete: boolean;
  readonly conflictingClaims: readonly string[];
  readonly affectedCommitmentIds: readonly string[];
  readonly ownerWillReverse: boolean | undefined;
  readonly supportedConstraintId?: string;
  readonly incumbentConstraintProgress?: number;
  readonly proposedConstraintProgress?: number;
  readonly valueBasis?: string;
  readonly supportedValue?: number;
  readonly effectsComplete: boolean;
  readonly budgetExhausted: boolean;
}

export interface OwnerCoordinationAssessment {
  readonly id: string;
  readonly structurallyValid: boolean;
  readonly executable: boolean;
  readonly incrementalEffect: "supported" | "none" | "unknown";
  readonly commandChanges: boolean;
  readonly effectChanges:
    | readonly Readonly<{
        resourceId: string;
        poolId: string;
        incumbentProduction: number;
        proposedProduction: number;
        productionDelta: number;
        capacityDelta: number;
      }>[]
    | undefined;
  readonly affectedCommitmentIds: readonly string[];
  readonly useful: boolean | undefined;
  readonly preferred: boolean;
  readonly mayRequestOwner: boolean;
  readonly authorizedToExecute: false;
  readonly classification: "incremental" | "redundant" | "unavailable";
  readonly reasons: readonly string[];
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const key = (effect: OwnerPlanEffect) =>
  `${effect.poolId}\u0000${effect.resourceId}`;

function planDeltaKnown(evidence: OwnerCoordinationEvidence): boolean {
  if (
    !evidence.effectsComplete ||
    !evidence.incumbentEffects ||
    !evidence.proposedEffects
  )
    return false;
  const incumbent = new Map(
    evidence.incumbentEffects.map((effect) => [key(effect), effect.amount]),
  );
  const proposed = new Map(
    evidence.proposedEffects.map((effect) => [key(effect), effect.amount]),
  );
  return (
    [...evidence.incumbentEffects, ...evidence.proposedEffects].every(
      (effect) =>
        finite(effect.amount) &&
        (effect.capacityDelta === undefined || finite(effect.capacityDelta)),
    ) &&
    [...new Set([...incumbent.keys(), ...proposed.keys()])].every(
      (effectKey) =>
        finite(incumbent.get(effectKey) ?? 0) &&
        finite(proposed.get(effectKey) ?? 0),
    )
  );
}

function targetProductionDelta(
  evidence: OwnerCoordinationEvidence,
): number | undefined {
  if (!evidence.incumbentEffects || !evidence.proposedEffects) return undefined;
  const total = (effects: readonly OwnerPlanEffect[]) =>
    effects
      .filter(
        (effect) =>
          effect.resourceId === evidence.resourceId &&
          effect.poolId === evidence.poolId,
      )
      .reduce((sum, effect) => sum + effect.amount, 0);
  const incumbent = total(evidence.incumbentEffects);
  const proposed = total(evidence.proposedEffects);
  return finite(incumbent) && finite(proposed)
    ? proposed - incumbent
    : undefined;
}

function comparePlanEffects(
  evidence: OwnerCoordinationEvidence,
): OwnerCoordinationAssessment["effectChanges"] {
  if (!planDeltaKnown(evidence)) return undefined;
  const totals = (effects: readonly OwnerPlanEffect[]) => {
    const values = new Map<
      string,
      {
        resourceId: string;
        poolId: string;
        production: number;
        capacity: number;
      }
    >();
    for (const effect of effects) {
      const effectKey = key(effect);
      const previous = values.get(effectKey) ?? {
        resourceId: effect.resourceId,
        poolId: effect.poolId,
        production: 0,
        capacity: 0,
      };
      values.set(effectKey, {
        resourceId: effect.resourceId,
        poolId: effect.poolId,
        production: previous.production + effect.amount,
        capacity: previous.capacity + (effect.capacityDelta ?? 0),
      });
    }
    return values;
  };
  const incumbent = totals(evidence.incumbentEffects!);
  const proposed = totals(evidence.proposedEffects!);
  return Object.freeze(
    [...new Set([...incumbent.keys(), ...proposed.keys()])].map((effectKey) => {
      const before = incumbent.get(effectKey);
      const after = proposed.get(effectKey);
      const incumbentProduction = before?.production ?? 0;
      const proposedProduction = after?.production ?? 0;
      return Object.freeze({
        resourceId: before?.resourceId ?? after!.resourceId,
        poolId: before?.poolId ?? after!.poolId,
        incumbentProduction,
        proposedProduction,
        productionDelta: proposedProduction - incumbentProduction,
        capacityDelta: (after?.capacity ?? 0) - (before?.capacity ?? 0),
      });
    }),
  );
}

export function assessOwnerCoordination(
  evidence: OwnerCoordinationEvidence,
): OwnerCoordinationAssessment {
  const reasons: string[] = [];
  const identityValid = [
    evidence.goalId,
    evidence.requirementId,
    evidence.resourceId,
    evidence.poolId,
    evidence.ownerId,
    evidence.capability,
    evidence.targetOwner,
    evidence.rootId,
    evidence.currentRootId,
    evidence.progressionId,
    evidence.currentProgressionId,
    evidence.priceIdentity,
    evidence.currentPriceIdentity,
    evidence.controlGeneration,
    evidence.currentControlGeneration,
    evidence.snapshotGeneration,
    evidence.currentSnapshotGeneration,
    evidence.permissionGeneration,
    evidence.currentPermissionGeneration,
    evidence.incumbentPlanId,
    evidence.proposedPlanId,
  ].every((value) => typeof value === "string" && value.length > 0);
  if (!identityValid) reasons.push("missing-identity");
  if (evidence.targetOwner !== evidence.ownerId)
    reasons.push("owner-capability-mismatch");
  if (
    !evidence.snapshotCurrent ||
    evidence.rootId !== evidence.currentRootId ||
    evidence.progressionId !== evidence.currentProgressionId ||
    evidence.priceIdentity !== evidence.currentPriceIdentity ||
    evidence.controlGeneration !== evidence.currentControlGeneration ||
    evidence.snapshotGeneration !== evidence.currentSnapshotGeneration ||
    evidence.permissionGeneration !== evidence.currentPermissionGeneration
  )
    reasons.push("stale-owner-snapshot");
  if (evidence.budgetExhausted) reasons.push("budget-exhausted");
  if (!evidence.commitmentClaimsComplete)
    reasons.push("commitment-coverage-incomplete");
  if (evidence.conflictingClaims.length > 0)
    reasons.push("conflicting-source-claims");
  if (evidence.ownerWillReverse === true) reasons.push("owner-will-reverse");
  else if (evidence.ownerWillReverse !== false)
    reasons.push("owner-reversal-unknown");
  if (!evidence.requestPortAvailable)
    reasons.push("owner-request-port-unavailable");
  if (!evidence.nativeControlAvailable)
    reasons.push("native-control-unavailable");
  if (!evidence.nativeCapAvailable) reasons.push("native-cap-unavailable");
  if (evidence.safeWorkerSourceAvailable === false)
    reasons.push("safe-worker-source-unavailable");
  else if (evidence.safeWorkerSourceAvailable !== true)
    reasons.push("safe-worker-source-unknown");
  if (evidence.explicitQueueActive)
    reasons.push("explicit-user-queue-precedence");
  if (!evidence.playerPermitted) reasons.push("player-permission-denied");
  if (evidence.excluded) reasons.push("player-exclusion");
  if (evidence.provenance === "provisional-advisory")
    reasons.push("advisory-cannot-reserve-or-override-owner-demand");
  if (!planDeltaKnown(evidence))
    reasons.push("incumbent-comparison-incomplete");

  const constraintKnown =
    typeof evidence.supportedConstraintId === "string" &&
    evidence.supportedConstraintId.length > 0 &&
    finite(evidence.incumbentConstraintProgress) &&
    finite(evidence.proposedConstraintProgress);
  if (!constraintKnown) reasons.push("supported-constraint-effect-unknown");

  const structurallyValid =
    identityValid && evidence.targetOwner === evidence.ownerId;
  const executable = structurallyValid && reasons.length === 0;
  const improvement = constraintKnown
    ? evidence.proposedConstraintProgress! -
      evidence.incumbentConstraintProgress!
    : undefined;
  const targetDelta = planDeltaKnown(evidence)
    ? targetProductionDelta(evidence)
    : undefined;
  const coverageKnown =
    evidence.coverageComplete &&
    finite(evidence.targetAmount) &&
    finite(evidence.coveredAmount);
  const demandMet =
    coverageKnown && evidence.coveredAmount! >= evidence.targetAmount!;
  const incrementalEffect: OwnerCoordinationAssessment["incrementalEffect"] =
    improvement === undefined || targetDelta === undefined
      ? "unknown"
      : improvement > 0 && targetDelta > 0
        ? "supported"
        : "none";
  const useful =
    improvement === undefined || targetDelta === undefined
      ? undefined
      : improvement > 0 && targetDelta > 0;
  const classification =
    demandMet || improvement === 0
      ? "redundant"
      : improvement === undefined ||
          targetDelta === undefined ||
          !evidence.effectsComplete
        ? "unavailable"
        : "incremental";

  if (!coverageKnown) reasons.push("demand-coverage-unknown");
  if (demandMet) reasons.push("incumbent-already-covers-demand");
  if (improvement === 0 && evidence.coverageComplete)
    reasons.push("no-increment-over-incumbent");
  if (improvement !== undefined && improvement < 0)
    reasons.push("supported-constraint-regression");

  return Object.freeze({
    id: evidence.requirementId,
    structurallyValid,
    executable,
    incrementalEffect,
    commandChanges: evidence.incumbentPlanId !== evidence.proposedPlanId,
    effectChanges: comparePlanEffects(evidence),
    affectedCommitmentIds: Object.freeze([...evidence.affectedCommitmentIds]),
    useful,
    preferred: false,
    mayRequestOwner:
      executable &&
      coverageKnown &&
      !demandMet &&
      classification === "incremental" &&
      useful === true,
    authorizedToExecute: false,
    classification,
    reasons: Object.freeze([...new Set(reasons)].sort()),
  });
}

export function compareOwnerCoordination(
  evidence: readonly OwnerCoordinationEvidence[],
  maxCandidates = 32,
): Readonly<{
  assessments: readonly OwnerCoordinationAssessment[];
  preferredIds: readonly string[];
  budgetExhausted: boolean;
}> {
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 0)
    throw new RangeError("maxCandidates must be a non-negative safe integer");
  const budgetExhausted = evidence.length > maxCandidates;
  const assessed = evidence
    .slice(0, maxCandidates)
    .map(assessOwnerCoordination);
  const assessments = budgetExhausted
    ? assessed.map((assessment) =>
        Object.freeze({
          ...assessment,
          mayRequestOwner: false,
          preferred: false,
          reasons: Object.freeze(
            [...new Set([...assessment.reasons, "budget-exhausted"])].sort(),
          ),
        }),
      )
    : assessed;
  const candidates = evidence
    .slice(0, maxCandidates)
    .map((item, index) => ({ item, assessment: assessments[index]! }))
    .filter(
      ({ item, assessment }) =>
        assessment.mayRequestOwner &&
        finite(item.supportedValue) &&
        typeof item.valueBasis === "string" &&
        item.valueBasis.length > 0,
    );
  let preferredIds: string[] = [];
  if (
    !budgetExhausted &&
    candidates.length > 0 &&
    candidates.every(
      ({ item }) => item.valueBasis === candidates[0]!.item.valueBasis,
    )
  ) {
    const bestValue = Math.max(
      ...candidates.map(({ item }) => item.supportedValue!),
    );
    preferredIds = candidates
      .filter(({ item }) => item.supportedValue === bestValue)
      .map(({ assessment }) => assessment.id);
  }
  const preferredSet = new Set(preferredIds);
  return Object.freeze({
    assessments: Object.freeze(
      assessments.map((assessment) =>
        Object.freeze({
          ...assessment,
          preferred: preferredSet.has(assessment.id),
        }),
      ),
    ),
    preferredIds: Object.freeze(preferredIds),
    budgetExhausted,
  });
}
