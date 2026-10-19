export interface GoalResourceSignalInput {
  readonly goalId: string;
  readonly goalStatus: "active" | "satisfied" | "invalidated" | "unknown";
  readonly actionId: string | undefined;
  readonly goalActionAuthority: "verified" | "advisory" | "unknown";
  readonly resourceId: string | undefined;
  readonly poolId: string | undefined;
  readonly required: number | undefined;
  readonly provenance:
    "native-immediate-price" | "advisory-contributor" | "unknown";
  readonly confidence: "verified" | "advisory" | "unknown";
  readonly observation: Readonly<{
    id: string | undefined;
    generation: number | undefined;
    rootGeneration: number | undefined;
    progressionGeneration: string | undefined;
    ownerCycle: number | undefined;
    permissionGeneration: number | undefined;
    smelterControlGeneration: number | undefined;
    demandGeneration: number | undefined;
    stockObservationId: string | undefined;
    stockGeneration: number | undefined;
    demandIdentity: string | undefined;
    aggregateTarget: number | undefined;
    constructionTargetIdentity: string | undefined;
  }>;
  readonly offer: Readonly<{
    freshness: "current" | "previous-cycle" | "stale" | "unknown";
    present: boolean | undefined;
    priceIdentity: string | undefined;
    generation: number | undefined;
    rootGeneration: number | undefined;
    progressionGeneration: string | undefined;
    controlGeneration: number | undefined;
    poolId: string | undefined;
  }>;
  readonly current: Readonly<{
    ownerCycle: number | undefined;
    observationId: string | undefined;
    rootGeneration: number | undefined;
    progressionGeneration: string | undefined;
    controlGeneration: number | undefined;
    offerGeneration: number | undefined;
    priceIdentity: string | undefined;
    demandGeneration: number | undefined;
    stockGeneration: number | undefined;
    stockObservationId: string | undefined;
    permissionGeneration: number | undefined;
    permissionEnabled: boolean | undefined;
    smelterControlGeneration: number | undefined;
    demandIdentity: string | undefined;
    aggregateTarget: number | undefined;
    constructionTargetIdentity: string | undefined;
  }>;
  readonly stock: Readonly<{
    amount: number | undefined;
    capacity: number | undefined;
    poolId: string | undefined;
  }>;
  readonly demand: Readonly<{
    aggregateTarget: number | undefined;
    currentDemand: number | undefined;
    allocation: number | undefined;
    constructionSavingTarget:
      | Readonly<{
          id: string;
          poolId: string | undefined;
          resourceTarget: number | undefined;
        }>
      | undefined;
    knownCommitments: readonly Readonly<{
      owner: string;
      resourceId: string;
      poolId: string | undefined;
      amount: number;
    }>[];
    commitmentCoverage: "complete" | "partial" | "unknown";
    spendingOrderKnown: boolean;
  }>;
  readonly unknownEvidence: readonly string[];
}

export type GoalResourceSignalStatus =
  | "already-represented"
  | "additional-target-supported"
  | "competing-spending-unresolved"
  | "goal-evidence-unavailable"
  | "goal-already-satisfied"
  | "goal-invalidated";

export interface GoalResourceSignal {
  readonly goalId: string;
  readonly goalStatus: GoalResourceSignalInput["goalStatus"];
  readonly actionId: string | undefined;
  readonly goalActionAuthority: GoalResourceSignalInput["goalActionAuthority"];
  readonly resourceId: string | undefined;
  readonly poolId: string | undefined;
  readonly required: number | undefined;
  readonly provenance: GoalResourceSignalInput["provenance"];
  readonly confidence: GoalResourceSignalInput["confidence"];
  readonly observationId: string | undefined;
  readonly currentObservationId: string | undefined;
  readonly observationGeneration: number | undefined;
  readonly nativePriceIdentity: string | undefined;
  readonly offerGeneration: number | undefined;
  readonly currentAuthority: Readonly<{
    rootGeneration: number | undefined;
    progressionGeneration: string | undefined;
    permissionGeneration: number | undefined;
    permissionEnabled: boolean | undefined;
    smelterControlGeneration: number | undefined;
    demandGeneration: number | undefined;
    stockGeneration: number | undefined;
    stockObservationId: string | undefined;
  }>;
  readonly nativeOfferFreshness: GoalResourceSignalInput["offer"]["freshness"];
  readonly stockAmount: number | undefined;
  readonly stockCapacity: number | undefined;
  readonly aggregateTarget: number | undefined;
  readonly constructionSavingTarget: GoalResourceSignalInput["demand"]["constructionSavingTarget"];
  readonly currentDemand: number | undefined;
  readonly allocation: number | undefined;
  readonly knownCommitments: GoalResourceSignalInput["demand"]["knownCommitments"];
  readonly unknownEvidence: readonly string[];
  readonly unavailableReasons: readonly string[];
  /** Absolute resource threshold; never a cross-owner reservation delta. */
  readonly requiredTarget: number | undefined;
  readonly executableAuthorization: false;
  readonly status: GoalResourceSignalStatus;
}

const finiteNonNegative = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

/** Reconciles one verified immediate-action price with an incumbent owner target. */
export function evaluateGoalResourceSignal(
  input: Readonly<GoalResourceSignalInput>,
): Readonly<GoalResourceSignal> {
  const unavailableReasons: string[] = [];
  const observation = input.observation;
  const offer = input.offer;
  const current = input.current;

  if (input.goalStatus === "satisfied")
    return makeSignal(input, "goal-already-satisfied", undefined, []);
  if (input.goalStatus === "invalidated")
    return makeSignal(input, "goal-invalidated", undefined, []);
  if (input.goalStatus !== "active")
    unavailableReasons.push("goal-status-unknown");
  if (!input.goalId) unavailableReasons.push("goal-identity-unavailable");
  if (!input.actionId) unavailableReasons.push("immediate-action-unavailable");
  if (input.goalActionAuthority !== "verified")
    unavailableReasons.push("goal-action-selection-not-established");
  if (!input.resourceId)
    unavailableReasons.push("resource-identity-unavailable");
  if (!input.poolId) unavailableReasons.push("supply-pool-unavailable");
  if (!finiteNonNegative(input.required))
    unavailableReasons.push("required-quantity-unavailable");
  if (input.provenance !== "native-immediate-price")
    unavailableReasons.push("requirement-is-not-a-verified-native-price");
  if (input.confidence !== "verified")
    unavailableReasons.push("requirement-confidence-not-verified");
  if (offer.freshness !== "current")
    unavailableReasons.push("native-offer-not-current");
  if (offer.present !== true)
    unavailableReasons.push("native-action-not-currently-offered");
  if (!observation.id)
    unavailableReasons.push("observation-identity-unavailable");
  if (!current.observationId || observation.id !== current.observationId)
    unavailableReasons.push("current-observation-identity-mismatch");
  if (
    observation.generation === undefined ||
    observation.generation !== current.offerGeneration
  )
    unavailableReasons.push("offer-generation-changed");
  if (
    observation.rootGeneration === undefined ||
    observation.rootGeneration !== current.rootGeneration
  )
    unavailableReasons.push("root-generation-changed");
  if (
    observation.progressionGeneration === undefined ||
    observation.progressionGeneration !== current.progressionGeneration
  )
    unavailableReasons.push("progression-generation-changed");
  if (
    observation.ownerCycle === undefined ||
    observation.ownerCycle !== current.ownerCycle
  )
    unavailableReasons.push("owner-cycle-superseded");
  if (
    observation.permissionGeneration === undefined ||
    observation.permissionGeneration !== current.permissionGeneration
  )
    unavailableReasons.push("permission-generation-changed");
  if (current.permissionEnabled !== true)
    unavailableReasons.push("permission-disabled-or-unknown");
  if (observation.smelterControlGeneration !== current.smelterControlGeneration)
    unavailableReasons.push("smelter-control-replaced");
  if (
    observation.demandGeneration === undefined ||
    observation.demandGeneration !== current.demandGeneration
  )
    unavailableReasons.push("demand-generation-changed");
  if (
    !observation.stockObservationId ||
    observation.stockObservationId !== current.stockObservationId
  )
    unavailableReasons.push("stock-observation-identity-changed-or-unknown");
  if (
    observation.stockGeneration === undefined ||
    observation.stockGeneration !== current.stockGeneration
  )
    unavailableReasons.push("stock-generation-changed");
  if (
    !observation.demandIdentity ||
    observation.demandIdentity !== current.demandIdentity
  )
    unavailableReasons.push("demand-identity-changed-or-unknown");
  if (observation.aggregateTarget !== current.aggregateTarget)
    unavailableReasons.push("aggregate-demand-target-changed");
  if (
    observation.constructionTargetIdentity !==
    current.constructionTargetIdentity
  )
    unavailableReasons.push("construction-target-changed");
  if (offer.generation !== current.offerGeneration)
    unavailableReasons.push("native-control-generation-changed");
  if (offer.rootGeneration !== current.rootGeneration)
    unavailableReasons.push("native-offer-root-changed");
  if (offer.progressionGeneration !== current.progressionGeneration)
    unavailableReasons.push("native-offer-progression-changed");
  if (offer.controlGeneration !== current.controlGeneration)
    unavailableReasons.push("native-control-replaced");
  if (!offer.priceIdentity || offer.priceIdentity !== current.priceIdentity)
    unavailableReasons.push("native-price-changed-or-unidentified");
  if (!input.poolId || offer.poolId !== input.poolId)
    unavailableReasons.push("native-offer-supply-pool-mismatch");
  if (!finiteNonNegative(input.stock.amount))
    unavailableReasons.push("current-stock-unavailable");
  if (!finiteNonNegative(input.stock.capacity))
    unavailableReasons.push("storage-capacity-unavailable");
  if (input.stock.poolId !== input.poolId)
    unavailableReasons.push("current-stock-supply-pool-mismatch");
  if (!finiteNonNegative(input.demand.aggregateTarget))
    unavailableReasons.push("aggregate-demand-unavailable");
  if (!finiteNonNegative(input.demand.currentDemand))
    unavailableReasons.push("current-demand-unavailable");
  if (!finiteNonNegative(input.demand.allocation))
    unavailableReasons.push("current-allocation-unavailable");

  if (unavailableReasons.length > 0)
    return makeSignal(
      input,
      "goal-evidence-unavailable",
      undefined,
      unavailableReasons,
    );
  if (input.required! > input.stock.capacity!)
    return makeSignal(input, "goal-evidence-unavailable", undefined, [
      "required-quantity-exceeds-storage-capacity",
    ]);
  if (input.stock.amount! >= input.required!)
    return makeSignal(input, "goal-already-satisfied", undefined, []);

  const incumbentTarget = Math.min(
    input.demand.aggregateTarget!,
    input.stock.capacity!,
  );
  if (input.required! <= incumbentTarget)
    return makeSignal(input, "already-represented", undefined, []);

  const hasKnownCompetingCommitment = input.demand.knownCommitments.some(
    (item) =>
      item.resourceId === input.resourceId &&
      item.poolId === input.poolId &&
      item.amount > 0,
  );
  if (
    input.demand.commitmentCoverage !== "complete" ||
    !input.demand.spendingOrderKnown ||
    hasKnownCompetingCommitment
  )
    return makeSignal(input, "competing-spending-unresolved", undefined, [
      ...(input.demand.commitmentCoverage !== "complete"
        ? ["external-spender-coverage-incomplete"]
        : []),
      ...(!input.demand.spendingOrderKnown
        ? ["competing-spender-order-unknown"]
        : []),
      ...(hasKnownCompetingCommitment
        ? ["known-competing-resource-commitment"]
        : []),
    ]);

  return makeSignal(input, "additional-target-supported", input.required!, []);
}

export function evaluateGoalResourceSignals(
  inputs: readonly Readonly<GoalResourceSignalInput>[],
): readonly Readonly<GoalResourceSignal>[] {
  return Object.freeze(inputs.map(evaluateGoalResourceSignal));
}

function makeSignal(
  input: Readonly<GoalResourceSignalInput>,
  status: GoalResourceSignalStatus,
  requiredTarget: number | undefined,
  unavailableReasons: readonly string[],
): Readonly<GoalResourceSignal> {
  return Object.freeze({
    goalId: input.goalId,
    goalStatus: input.goalStatus,
    actionId: input.actionId,
    goalActionAuthority: input.goalActionAuthority,
    resourceId: input.resourceId,
    poolId: input.poolId,
    required: input.required,
    provenance: input.provenance,
    confidence: input.confidence,
    observationId: input.observation.id,
    currentObservationId: input.current.observationId,
    observationGeneration: input.observation.generation,
    nativePriceIdentity: input.offer.priceIdentity,
    offerGeneration: input.offer.generation,
    currentAuthority: Object.freeze({
      rootGeneration: input.current.rootGeneration,
      progressionGeneration: input.current.progressionGeneration,
      permissionGeneration: input.current.permissionGeneration,
      permissionEnabled: input.current.permissionEnabled,
      smelterControlGeneration: input.current.smelterControlGeneration,
      demandGeneration: input.current.demandGeneration,
      stockGeneration: input.current.stockGeneration,
      stockObservationId: input.current.stockObservationId,
    }),
    nativeOfferFreshness: input.offer.freshness,
    stockAmount: input.stock.amount,
    stockCapacity: input.stock.capacity,
    aggregateTarget: input.demand.aggregateTarget,
    constructionSavingTarget: input.demand.constructionSavingTarget,
    currentDemand: input.demand.currentDemand,
    allocation: input.demand.allocation,
    knownCommitments: input.demand.knownCommitments,
    unknownEvidence: unique(input.unknownEvidence),
    unavailableReasons: unique(unavailableReasons),
    requiredTarget,
    executableAuthorization: false,
    status,
  });
}
