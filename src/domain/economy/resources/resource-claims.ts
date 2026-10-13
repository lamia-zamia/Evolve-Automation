export type ResourceClaimPrecedence =
  "safety" | "player-commitment" | "terminal-prerequisite";

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
  readonly nativeOfferCurrent: boolean;
  readonly nativeActionEligible: boolean;
  readonly researchPermission: boolean;
  readonly queueEvidence: "empty" | "same-target" | "conflict" | "unavailable";
  readonly rootGeneration: number;
  readonly progressionGeneration: string;
  readonly observationValid: boolean;
  readonly precedence: ResourceClaimPrecedence;
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
  readonly controlBinding:
    | Readonly<{
        elementId: string;
        generation: number;
        actionCapable: boolean;
      }>
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
    !Number.isSafeInteger(controlBinding["generation"])
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
    !evidence.observationValid ||
    evidence.unavailableReasons.length > 0
  )
    return undefined;

  const claimId = [
    evidence.terminalGoalId,
    evidence.immediateGoalId,
    evidence.nativeActionId,
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

/** Accounts for each admitted claim once; forecast output never increases spendable stock. */
export function planResourceClaimLedger(
  input: Readonly<ResourceClaimLedgerInput>,
): Readonly<ResourceClaimLedger> {
  const claims = input.claims
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

  if (
    input.controlBinding === undefined ||
    !input.controlBinding.actionCapable ||
    claims.some(
      (claim) =>
        claim.controlBinding.elementId !== input.controlBinding?.elementId,
    )
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

  const first = claims[0];
  if (first === undefined) throw new TypeError("claim set unexpectedly empty");
  if (
    claims.some(
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
      claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
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
  for (const claim of claims) {
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
    claimIds: Object.freeze(claims.map((claim) => claim.claimId)),
    reasons: Object.freeze([
      ...new Set(claims.flatMap((claim) => claim.uncertaintyReasons)),
    ]),
  });
}
