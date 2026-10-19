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
  readonly capacityAuthority?:
    | Readonly<{
        ownerType: "jobs";
        sourceAssignmentKnown: boolean;
        protectedMinimumKnown: boolean;
        defaultPoolKnown: boolean;
        workerCapacityKnown: boolean;
        foundryCouplingKnown: boolean;
      }>
    | Readonly<{
        ownerType: "smelter";
        availableCapacityKnown: boolean;
        sourceTargetAllocationKnown: boolean;
        fuelAllocationKnown: boolean;
        supportedDisplacementKnown: boolean;
      }>
    | Readonly<{ ownerType: "other" }>;
  readonly rootIdentity: object;
  readonly currentRootIdentity: object;
  readonly progressionGeneration: number;
  readonly currentProgressionGeneration: number;
  readonly priceIdentity: string;
  readonly currentPriceIdentity: string;
  readonly controlGeneration: number;
  readonly currentControlGeneration: number;
  readonly permissionEnabled: boolean;
  readonly currentPermissionEnabled: boolean;
  readonly incumbentCommandIntention?: readonly string[];
  readonly proposedCommandIntention?: readonly string[];
  readonly incumbentEffects?: readonly OwnerPlanEffect[];
  readonly proposedEffects?: readonly OwnerPlanEffect[];
  readonly commitmentClaimsComplete: boolean;
  readonly conflictingClaims: readonly string[];
  readonly affectedCommitmentIds: readonly string[];
  readonly ownerWillReverse: boolean | undefined;
  readonly supportedConstraintId?: string;
  readonly incumbentConstraintProgress?: number;
  readonly proposedConstraintProgress?: number;
  readonly objectiveIdentity?: string;
  readonly immediateConstraintIdentity?: string;
  readonly metricIdentity?: string;
  readonly metricUnit?: string;
  readonly betterDirection?: "smaller" | "larger";
  readonly observationScope?: string;
  readonly observationFreshness?: string;
  readonly supportedValue?: number;
  readonly collateralSupported: boolean;
  readonly opportunityCostSupported: boolean;
  readonly effectEvidence:
    "planned-commands" | "measured-production-marginals" | "unknown";
  readonly effectsComplete: boolean;
  readonly budgetExhausted: boolean;
}

export interface OwnerCoordinationAssessment {
  readonly id: string;
  readonly structurallyValid: boolean;
  readonly physicalFeasibility: "supported" | "blocked" | "unknown";
  readonly executable: boolean;
  readonly incrementalEffect: "supported" | "none" | "unknown";
  readonly commandChanges: boolean | undefined;
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
    evidence.priceIdentity,
    evidence.currentPriceIdentity,
  ].every((value) => typeof value === "string" && value.length > 0);
  const generationValid =
    evidence.rootIdentity !== null &&
    typeof evidence.rootIdentity === "object" &&
    evidence.currentRootIdentity !== null &&
    typeof evidence.currentRootIdentity === "object" &&
    Number.isSafeInteger(evidence.progressionGeneration) &&
    Number.isSafeInteger(evidence.currentProgressionGeneration) &&
    Number.isSafeInteger(evidence.controlGeneration) &&
    Number.isSafeInteger(evidence.currentControlGeneration);
  if (!identityValid || !generationValid) reasons.push("missing-identity");
  if (evidence.targetOwner !== evidence.ownerId)
    reasons.push("owner-capability-mismatch");
  if (
    evidence.rootIdentity !== evidence.currentRootIdentity ||
    evidence.progressionGeneration !== evidence.currentProgressionGeneration ||
    evidence.priceIdentity !== evidence.currentPriceIdentity ||
    evidence.controlGeneration !== evidence.currentControlGeneration ||
    evidence.permissionEnabled !== evidence.currentPermissionEnabled
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
  const capacityAuthority = evidence.capacityAuthority;
  const capacityKnown =
    evidence.ownerId === "smelter" && capacityAuthority?.ownerType === "smelter"
      ? capacityAuthority.availableCapacityKnown &&
        capacityAuthority.sourceTargetAllocationKnown &&
        capacityAuthority.fuelAllocationKnown &&
        capacityAuthority.supportedDisplacementKnown
      : evidence.ownerId === "jobs" && capacityAuthority?.ownerType === "jobs"
        ? capacityAuthority.sourceAssignmentKnown &&
          capacityAuthority.protectedMinimumKnown &&
          capacityAuthority.defaultPoolKnown &&
          capacityAuthority.workerCapacityKnown &&
          capacityAuthority.foundryCouplingKnown
        : false;
  if (!capacityKnown) reasons.push("owner-capacity-authority-unavailable");
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
  const improvement = constraintKnown
    ? evidence.proposedConstraintProgress! -
      evidence.incumbentConstraintProgress!
    : undefined;
  const targetDelta =
    evidence.effectEvidence === "measured-production-marginals" &&
    planDeltaKnown(evidence)
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

  const commandsKnown =
    evidence.incumbentCommandIntention !== undefined &&
    evidence.proposedCommandIntention !== undefined;
  const commandChanges = commandsKnown
    ? JSON.stringify(evidence.incumbentCommandIntention) !==
      JSON.stringify(evidence.proposedCommandIntention)
    : undefined;
  if (!commandsKnown) reasons.push("native-command-intention-unknown");
  else if (!commandChanges) reasons.push("native-command-intention-unchanged");
  const supportedIncrementalEffect = !commandsKnown
    ? "unknown"
    : !commandChanges
      ? "none"
      : incrementalEffect;
  const supportedUseful = !commandsKnown
    ? undefined
    : !commandChanges
      ? false
      : useful;
  const supportedClassification = !commandsKnown
    ? "unavailable"
    : !commandChanges
      ? "redundant"
      : classification;
  const informationalReasons = new Set([
    "incumbent-already-covers-demand",
    "no-increment-over-incumbent",
    "native-command-intention-unchanged",
  ]);
  const executable =
    structurallyValid &&
    !reasons.some((reason) => !informationalReasons.has(reason));

  return Object.freeze({
    id: evidence.requirementId,
    structurallyValid,
    physicalFeasibility: !evidence.nativeCapAvailable
      ? "blocked"
      : capacityKnown && commandsKnown
        ? "supported"
        : "unknown",
    executable,
    incrementalEffect: supportedIncrementalEffect,
    commandChanges,
    effectChanges:
      evidence.effectEvidence === "measured-production-marginals"
        ? comparePlanEffects(evidence)
        : undefined,
    affectedCommitmentIds: Object.freeze([...evidence.affectedCommitmentIds]),
    useful: supportedUseful,
    preferred: false,
    mayRequestOwner:
      executable &&
      coverageKnown &&
      !demandMet &&
      supportedClassification === "incremental" &&
      supportedUseful === true &&
      commandChanges === true,
    authorizedToExecute: false,
    classification: supportedClassification,
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
        typeof item.objectiveIdentity === "string" &&
        typeof item.immediateConstraintIdentity === "string" &&
        typeof item.metricIdentity === "string" &&
        typeof item.metricUnit === "string" &&
        (item.betterDirection === "smaller" ||
          item.betterDirection === "larger") &&
        typeof item.observationScope === "string" &&
        typeof item.observationFreshness === "string" &&
        item.collateralSupported &&
        item.opportunityCostSupported,
    );
  let preferredIds: string[] = [];
  if (
    !budgetExhausted &&
    candidates.length > 0 &&
    candidates.every(
      ({ item }) =>
        item.objectiveIdentity === candidates[0]!.item.objectiveIdentity &&
        item.immediateConstraintIdentity ===
          candidates[0]!.item.immediateConstraintIdentity &&
        item.metricIdentity === candidates[0]!.item.metricIdentity &&
        item.metricUnit === candidates[0]!.item.metricUnit &&
        item.betterDirection === candidates[0]!.item.betterDirection &&
        item.observationScope === candidates[0]!.item.observationScope &&
        item.observationFreshness === candidates[0]!.item.observationFreshness,
    )
  ) {
    const values = candidates.map(({ item }) => item.supportedValue!);
    const bestValue =
      candidates[0]!.item.betterDirection === "smaller"
        ? Math.min(...values)
        : Math.max(...values);
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
