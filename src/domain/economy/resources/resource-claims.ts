export type ResourceClaimPrecedence =
  "safety" | "player-commitment" | "terminal-prerequisite";

export type ResourceClaimLifecycleState =
  "active" | "suspended" | "released" | "completed" | "invalidated";

export type ResourceClaimAllocationAuthority =
  | Readonly<{ kind: "independent" }>
  | Readonly<{
      kind: "selected-alternative";
      groupId: string;
      selectedActionId: string;
      authorityId: string;
    }>;

export interface ResourceClaimEvidence {
  readonly terminalGoalId: string;
  readonly immediateGoalId: string;
  readonly owner: string;
  readonly provenance: "verified-native-prerequisite";
  readonly prerequisiteRelation: "verified" | "unverified";
  readonly nativeActionId: string;
  readonly targetGrantTechnology: string;
  readonly targetGrantLevel: number;
  readonly resourceId: string;
  readonly poolId: string;
  readonly requiredQuantity: number;
  readonly observedStock: number;
  readonly observedCapacity: number;
  readonly observedNativePrice: number;
  readonly offerSetIdentity: string;
  readonly offerObservationId: string;
  readonly controlBinding: Readonly<{
    elementId: string;
    generation: number;
  }>;
  readonly offerBindingGeneration: number;
  readonly nativeOfferCurrent: boolean;
  readonly nativeActionEligible: boolean;
  readonly researchPermission: boolean;
  readonly queueEvidence: "empty" | "same-target" | "conflict" | "unavailable";
  readonly rootGeneration: number;
  readonly progressionGeneration: string;
  readonly observationValid: boolean;
  readonly precedence: ResourceClaimPrecedence;
  readonly allocationAuthority: ResourceClaimAllocationAuthority;
  readonly forecastProductionPerSecond: number | undefined;
  readonly uncertaintyReasons: readonly string[];
  readonly unavailableReasons: readonly string[];
}

export interface ResourceClaim extends ResourceClaimEvidence {
  readonly claimId: string;
  readonly admission: "admitted";
}

export interface ResourceClaimFreshness {
  readonly rootGeneration: number;
  readonly progressionGeneration: string;
  readonly offerSetIdentity: string;
  readonly offerObservationId: string;
}

export interface ResourceClaimReservation {
  readonly resourceId: string;
  readonly poolId: string;
  readonly quantity: number;
}

export interface ResourceClaimLedgerInput {
  readonly claims: readonly Readonly<ResourceClaim>[];
  readonly freshness: Readonly<ResourceClaimFreshness> | undefined;
  readonly controlBindings:
    | readonly Readonly<{
        elementId: string;
        generation: number;
        actionCapable: boolean;
      }>[]
    | undefined;
  readonly stock: number;
  readonly knownReservations:
    readonly Readonly<ResourceClaimReservation>[] | undefined;
  readonly forecastProductionPerSecond: number | undefined;
}

export interface ResourceClaimLedger {
  readonly status: "none" | "current" | "stale" | "unavailable";
  readonly currentStock: number;
  readonly currentStockReserved: number;
  readonly remainingAccumulation: number;
  readonly forecastProductionPerSecond: number | undefined;
  readonly spendableStock: number;
  readonly claimIds: readonly string[];
  readonly reasons: readonly string[];
}

const PRECEDENCE_ORDER: Readonly<Record<ResourceClaimPrecedence, number>> =
  Object.freeze({
    safety: 0,
    "player-commitment": 1,
    "terminal-prerequisite": 2,
  });

function validNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validates an externally supplied test claim before re-running admission. */
export function readAdmittedResourceClaim(
  value: unknown,
): Readonly<ResourceClaim> | undefined {
  if (!isRecordValue(value)) return undefined;
  const stringFields = [
    "terminalGoalId",
    "immediateGoalId",
    "owner",
    "provenance",
    "prerequisiteRelation",
    "nativeActionId",
    "targetGrantTechnology",
    "resourceId",
    "poolId",
    "progressionGeneration",
    "offerObservationId",
    "offerSetIdentity",
  ];
  if (stringFields.some((field) => typeof value[field] !== "string"))
    return undefined;
  if (
    [
      "requiredQuantity",
      "observedStock",
      "observedCapacity",
      "observedNativePrice",
      "targetGrantLevel",
      "rootGeneration",
      "offerBindingGeneration",
    ].some((field) => typeof value[field] !== "number") ||
    typeof value["nativeOfferCurrent"] !== "boolean" ||
    typeof value["nativeActionEligible"] !== "boolean" ||
    typeof value["researchPermission"] !== "boolean" ||
    typeof value["observationValid"] !== "boolean" ||
    !Array.isArray(value["uncertaintyReasons"]) ||
    !value["uncertaintyReasons"].every(
      (reason) => typeof reason === "string",
    ) ||
    !Array.isArray(value["unavailableReasons"]) ||
    !value["unavailableReasons"].every((reason) => typeof reason === "string")
  )
    return undefined;
  const controlBinding = value["controlBinding"];
  if (
    !isRecordValue(controlBinding) ||
    controlBinding["elementId"] !== value["nativeActionId"] ||
    typeof controlBinding["generation"] !== "number" ||
    !Number.isSafeInteger(controlBinding["generation"]) ||
    typeof value["offerBindingGeneration"] !== "number" ||
    !Number.isSafeInteger(value["offerBindingGeneration"])
  )
    return undefined;
  const precedence = value["precedence"];
  if (
    precedence !== "safety" &&
    precedence !== "player-commitment" &&
    precedence !== "terminal-prerequisite"
  )
    return undefined;
  const queueEvidence = value["queueEvidence"];
  if (
    queueEvidence !== "empty" &&
    queueEvidence !== "same-target" &&
    queueEvidence !== "conflict" &&
    queueEvidence !== "unavailable"
  )
    return undefined;
  const allocationAuthority = value["allocationAuthority"];
  if (!isRecordValue(allocationAuthority)) return undefined;
  if (allocationAuthority["kind"] === "independent") {
    // Additive intent is explicit; no path selection is implied.
  } else if (
    allocationAuthority["kind"] === "selected-alternative" &&
    typeof allocationAuthority["groupId"] === "string" &&
    allocationAuthority["groupId"] !== "" &&
    typeof allocationAuthority["selectedActionId"] === "string" &&
    allocationAuthority["selectedActionId"] !== "" &&
    typeof allocationAuthority["authorityId"] === "string" &&
    allocationAuthority["authorityId"] !== ""
  ) {
    // The named owner supplies selection authority; the ledger never chooses a path.
  } else return undefined;
  const forecastProductionPerSecond = value["forecastProductionPerSecond"];
  if (
    forecastProductionPerSecond !== undefined &&
    typeof forecastProductionPerSecond !== "number"
  )
    return undefined;
  const evidence = value as unknown as ResourceClaimEvidence;
  return admitResourceClaim(evidence);
}

/** Creates a claim only from a current, verified native prerequisite observation. */
export function admitResourceClaim(
  evidence: Readonly<ResourceClaimEvidence>,
): Readonly<ResourceClaim> | undefined {
  if (
    !evidence.terminalGoalId ||
    !evidence.immediateGoalId ||
    !evidence.owner ||
    !evidence.nativeActionId ||
    !evidence.targetGrantTechnology ||
    !validNonNegative(evidence.targetGrantLevel) ||
    !evidence.resourceId ||
    !evidence.poolId ||
    evidence.provenance !== "verified-native-prerequisite" ||
    evidence.prerequisiteRelation !== "verified" ||
    !validNonNegative(evidence.requiredQuantity) ||
    !validNonNegative(evidence.observedStock) ||
    !validNonNegative(evidence.observedCapacity) ||
    evidence.observedStock > evidence.observedCapacity ||
    evidence.requiredQuantity > evidence.observedCapacity ||
    !validNonNegative(evidence.observedNativePrice) ||
    (evidence.forecastProductionPerSecond !== undefined &&
      !validNonNegative(evidence.forecastProductionPerSecond)) ||
    evidence.observedNativePrice !== evidence.requiredQuantity ||
    !evidence.nativeOfferCurrent ||
    !evidence.nativeActionEligible ||
    !evidence.researchPermission ||
    evidence.queueEvidence !== "empty" ||
    !Number.isSafeInteger(evidence.rootGeneration) ||
    !evidence.progressionGeneration ||
    !evidence.offerObservationId ||
    !evidence.offerSetIdentity ||
    evidence.controlBinding.elementId !== evidence.nativeActionId ||
    !Number.isSafeInteger(evidence.controlBinding.generation) ||
    !Number.isSafeInteger(evidence.offerBindingGeneration) ||
    (evidence.allocationAuthority.kind === "selected-alternative" &&
      (evidence.allocationAuthority.groupId === "" ||
        evidence.allocationAuthority.selectedActionId === "" ||
        evidence.allocationAuthority.authorityId === "")) ||
    !evidence.observationValid ||
    evidence.unavailableReasons.length > 0
  )
    return undefined;

  const claimId = [
    evidence.terminalGoalId,
    evidence.immediateGoalId,
    evidence.nativeActionId,
    evidence.targetGrantTechnology,
    String(evidence.targetGrantLevel),
    evidence.resourceId,
    evidence.poolId,
  ].join("|");
  return Object.freeze({ ...evidence, claimId, admission: "admitted" });
}

function matchesFreshness(
  claim: Readonly<ResourceClaim>,
  freshness: Readonly<ResourceClaimFreshness>,
): boolean {
  return (
    claim.rootGeneration === freshness.rootGeneration &&
    claim.progressionGeneration === freshness.progressionGeneration &&
    claim.offerObservationId === freshness.offerObservationId &&
    claim.offerSetIdentity === freshness.offerSetIdentity
  );
}

function sameClaimObligation(
  left: Readonly<ResourceClaim>,
  right: Readonly<ResourceClaim>,
): boolean {
  return (
    left.requiredQuantity === right.requiredQuantity &&
    left.observedNativePrice === right.observedNativePrice &&
    left.targetGrantTechnology === right.targetGrantTechnology &&
    left.targetGrantLevel === right.targetGrantLevel &&
    left.offerSetIdentity === right.offerSetIdentity &&
    left.offerObservationId === right.offerObservationId &&
    left.controlBinding.generation === right.controlBinding.generation &&
    left.offerBindingGeneration === right.offerBindingGeneration &&
    JSON.stringify(left.allocationAuthority) ===
      JSON.stringify(right.allocationAuthority)
  );
}

/** Accounts for each admitted claim once; forecast output never increases spendable stock. */
export function planResourceClaimLedger(
  input: Readonly<ResourceClaimLedgerInput>,
): Readonly<ResourceClaimLedger> {
  const claimsById = new Map<string, Readonly<ResourceClaim>>();
  for (const claim of input.claims) {
    const existing = claimsById.get(claim.claimId);
    if (existing !== undefined && !sameClaimObligation(existing, claim)) {
      return Object.freeze({
        status: "unavailable",
        currentStock: validNonNegative(input.stock) ? input.stock : 0,
        currentStockReserved: 0,
        remainingAccumulation: 0,
        forecastProductionPerSecond: input.forecastProductionPerSecond,
        spendableStock: 0,
        claimIds: Object.freeze([claim.claimId]),
        reasons: Object.freeze(["duplicate claim ID has conflicting evidence"]),
      });
    }
    if (existing === undefined) claimsById.set(claim.claimId, claim);
  }
  const claims = [...claimsById.values()]
    .filter(
      (claim) =>
        claim.resourceId !== "" &&
        claim.poolId !== "" &&
        claim.requiredQuantity > 0,
    )
    .slice()
    .sort(
      (left, right) =>
        PRECEDENCE_ORDER[left.precedence] -
          PRECEDENCE_ORDER[right.precedence] ||
        (left.claimId < right.claimId
          ? -1
          : left.claimId > right.claimId
            ? 1
            : 0),
    );
  if (claims.length === 0) {
    return Object.freeze({
      status: "none",
      currentStock: input.stock,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: input.stock,
      claimIds: Object.freeze([]),
      reasons: Object.freeze([]),
    });
  }

  if (!validNonNegative(input.stock)) {
    return Object.freeze({
      status: "unavailable",
      currentStock: 0,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: 0,
      claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
      reasons: Object.freeze(["current stock observation is invalid"]),
    });
  }
  const freshness = input.freshness;
  if (freshness === undefined) {
    return Object.freeze({
      status: "unavailable",
      currentStock: input.stock,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: 0,
      claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
      reasons: Object.freeze(["native offer observation is unavailable"]),
    });
  }
  if (claims.some((claim) => !matchesFreshness(claim, freshness))) {
    return Object.freeze({
      status: "stale",
      currentStock: input.stock,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: 0,
      claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
      reasons: Object.freeze([
        "claim root, progression, or native offer observation changed",
      ]),
    });
  }

  const bindingById = new Map(
    (input.controlBindings ?? []).map((binding) => [
      binding.elementId,
      binding,
    ]),
  );
  if (
    input.controlBindings === undefined ||
    claims.some((claim) => {
      const binding = bindingById.get(claim.nativeActionId);
      return binding === undefined || !binding.actionCapable;
    })
  ) {
    return Object.freeze({
      status: "unavailable",
      currentStock: input.stock,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: 0,
      claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
      reasons: Object.freeze([
        "current control binding does not resolve the claimed action",
      ]),
    });
  }
  if (
    claims.some(
      (claim) =>
        bindingById.get(claim.nativeActionId)?.generation !==
        claim.controlBinding.generation,
    )
  ) {
    return Object.freeze({
      status: "stale",
      currentStock: input.stock,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: 0,
      claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
      reasons: Object.freeze([
        "current control binding differs from the owner offer observation",
      ]),
    });
  }

  if (input.knownReservations === undefined) {
    return Object.freeze({
      status: "unavailable",
      currentStock: input.stock,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: 0,
      claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
      reasons: Object.freeze([
        "external current-stock reservations are unavailable",
      ]),
    });
  }

  const claimsByAuthorityGroup = new Map<string, Readonly<ResourceClaim>[]>();
  for (const claim of claims) {
    if (claim.allocationAuthority.kind !== "selected-alternative") continue;
    const group = claimsByAuthorityGroup.get(claim.allocationAuthority.groupId);
    if (group === undefined)
      claimsByAuthorityGroup.set(claim.allocationAuthority.groupId, [claim]);
    else group.push(claim);
  }
  const selectedAlternativeIds = new Set<string>();
  for (const group of claimsByAuthorityGroup.values()) {
    const firstAuthority = group[0]?.allocationAuthority;
    if (firstAuthority?.kind !== "selected-alternative") continue;
    const consistent = group.every(
      (claim) =>
        claim.allocationAuthority.kind === "selected-alternative" &&
        claim.allocationAuthority.selectedActionId ===
          firstAuthority.selectedActionId &&
        claim.allocationAuthority.authorityId === firstAuthority.authorityId,
    );
    const selected = group.filter(
      (claim) => claim.nativeActionId === firstAuthority.selectedActionId,
    );
    if (!consistent || selected.length !== 1) {
      return Object.freeze({
        status: "unavailable",
        currentStock: input.stock,
        currentStockReserved: 0,
        remainingAccumulation: 0,
        forecastProductionPerSecond: input.forecastProductionPerSecond,
        spendableStock: 0,
        claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
        reasons: Object.freeze([
          "alternative claims lack one verified selected path",
        ]),
      });
    }
    const chosen = selected[0];
    if (chosen !== undefined) selectedAlternativeIds.add(chosen.claimId);
  }
  const allocatedClaims = claims.filter(
    (claim) =>
      claim.allocationAuthority.kind === "independent" ||
      selectedAlternativeIds.has(claim.claimId),
  );
  const first = allocatedClaims[0];
  if (first === undefined) throw new TypeError("claim set unexpectedly empty");
  if (
    allocatedClaims.some(
      (claim) =>
        claim.resourceId !== first.resourceId || claim.poolId !== first.poolId,
    )
  ) {
    return Object.freeze({
      status: "unavailable",
      currentStock: input.stock,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: 0,
      claimIds: Object.freeze(allocatedClaims.map((claim) => claim.claimId)),
      reasons: Object.freeze(["ledger input mixes resource pools"]),
    });
  }
  const reservationTotal = input.knownReservations
    .filter(
      (reservation) =>
        reservation.resourceId === first.resourceId &&
        reservation.poolId === first.poolId,
    )
    .reduce(
      (total, reservation) =>
        total +
        (validNonNegative(reservation.quantity) ? reservation.quantity : NaN),
      0,
    );
  if (!Number.isFinite(reservationTotal)) {
    return Object.freeze({
      status: "unavailable",
      currentStock: input.stock,
      currentStockReserved: 0,
      remainingAccumulation: 0,
      forecastProductionPerSecond: input.forecastProductionPerSecond,
      spendableStock: 0,
      claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
      reasons: Object.freeze(["known reservation quantity is invalid"]),
    });
  }

  let available = Math.max(0, input.stock - reservationTotal);
  let currentStockReserved = 0;
  let remainingAccumulation = 0;
  for (const claim of allocatedClaims) {
    const reserved = Math.min(available, claim.requiredQuantity);
    available -= reserved;
    currentStockReserved += reserved;
    remainingAccumulation += claim.requiredQuantity - reserved;
  }
  return Object.freeze({
    status: "current",
    currentStock: input.stock,
    currentStockReserved,
    remainingAccumulation,
    forecastProductionPerSecond: input.forecastProductionPerSecond,
    spendableStock: available,
    claimIds: Object.freeze(allocatedClaims.map((claim) => claim.claimId)),
    reasons: Object.freeze([
      ...new Set(allocatedClaims.flatMap((claim) => claim.uncertaintyReasons)),
    ]),
  });
}
