import {
  planResourceClaimLedger,
  type ResourceClaim,
  type ResourceClaimLedgerInput,
} from "../../economy/resources/resource-claims.ts";
import type { SharedResourceBudget } from "../../economy/resources/shared-spending-budget.ts";

export type ResearchSpendingClassification =
  | "mandatory-obligation-fulfillment"
  | "verified-discretionary-purchase"
  | "unknown-obligation-relation"
  | "conflicting-or-incomplete-evidence";

export interface ResearchSpendingAuthorizationInput {
  readonly selectedActionId: string;
  readonly selectedControlBinding: Readonly<{
    elementId: string;
    generation: number;
  }>;
  readonly offer: Readonly<{
    nativeActionId: string;
    status: "current" | "changed" | "unknown";
    setIdentity: string;
    observationId: string;
    bindingGeneration: number;
    displayedManaPrice: number | undefined;
    manaPriceCompleteness: "complete" | "incomplete";
  }>;
  readonly expectedManaDebit:
    | Readonly<{ kind: "verified"; quantity: number }>
    | Readonly<{ kind: "unknown"; reason: string }>;
  readonly stock: Readonly<{ id: string; quantity: number }>;
  readonly claims: readonly Readonly<ResourceClaim>[];
  readonly claimLedger: Readonly<ResourceClaimLedgerInput>;
  readonly discretionaryBudget: Readonly<SharedResourceBudget>;
  readonly queueAuthority: "automation" | "player" | "unknown";
  readonly commitments: "known" | "unknown";
  readonly anotherReservationPending: boolean;
}

export interface ResearchSpendingAuthorization {
  readonly classification: ResearchSpendingClassification;
  readonly authorized: boolean;
  readonly expectedManaDebit: number | undefined;
  readonly fulfilledClaimId: string | undefined;
  readonly remainingClaimIds: readonly string[];
  readonly reason: string;
}

function researchEvidenceUnavailable(
  reason: string,
  remainingClaimIds: readonly string[] = [],
): Readonly<ResearchSpendingAuthorization> {
  return Object.freeze({
    classification: "conflicting-or-incomplete-evidence",
    authorized: false,
    expectedManaDebit: undefined,
    fulfilledClaimId: undefined,
    remainingClaimIds: Object.freeze(remainingClaimIds.slice()),
    reason,
  });
}

/**
 * Proposes authority for one native Research purchase. Claim fulfillment is
 * accepted only when removing that exact claim after its exact debit leaves the
 * other claims' ledger accumulation unchanged.
 */
export function authorizeResearchManaSpend(
  input: Readonly<ResearchSpendingAuthorizationInput>,
): Readonly<ResearchSpendingAuthorization> {
  const budget = input.discretionaryBudget;
  const claimIds = input.claims.map((claim) => claim.claimId).sort();
  const unavailable = (reason: string) =>
    researchEvidenceUnavailable(reason, claimIds);
  if (
    input.selectedActionId === "" ||
    input.selectedControlBinding.elementId !== input.selectedActionId ||
    input.selectedControlBinding.elementId === "" ||
    !Number.isSafeInteger(input.selectedControlBinding.generation) ||
    input.offer.status !== "current" ||
    input.offer.nativeActionId !== input.selectedActionId ||
    input.offer.setIdentity === "" ||
    input.offer.observationId === "" ||
    input.offer.bindingGeneration !== input.selectedControlBinding.generation ||
    input.stock.id === "" ||
    !Number.isFinite(input.stock.quantity) ||
    input.stock.quantity < 0 ||
    input.queueAuthority !== "automation" ||
    input.commitments !== "known" ||
    input.claimLedger.knownReservations === undefined ||
    input.anotherReservationPending ||
    budget.status !== "current" ||
    budget.resourceId !== "Mana" ||
    budget.stockObservation?.id !== input.stock.id ||
    budget.observedStock !== input.stock.quantity ||
    input.claimLedger.stock !== input.stock.quantity ||
    budget.pendingReservations.length > 0
  )
    return unavailable(
      "current offer, control, stock, queue, commitment, or reservation evidence is incomplete",
    );
  if (input.expectedManaDebit.kind !== "verified")
    return unavailable(input.expectedManaDebit.reason);
  const debit = input.expectedManaDebit.quantity;
  if (!Number.isFinite(debit) || debit < 0)
    return unavailable("expected Mana debit is invalid");
  if (input.offer.displayedManaPrice !== debit)
    return unavailable(
      "current displayed Mana price conflicts with the verified expected debit",
    );
  if (debit === 0 && input.offer.manaPriceCompleteness !== "complete")
    return unavailable(
      "zero-Mana spending requires a complete native price observation",
    );

  const selectedClaims = input.claims.filter(
    (claim) => claim.nativeActionId === input.selectedActionId,
  );
  if (selectedClaims.length > 1)
    return researchEvidenceUnavailable(
      "selected Research action maps to multiple active claims",
    );
  const poolClaims = input.claims.filter(
    (claim) => claim.resourceId === "Mana" && claim.poolId === budget.poolId,
  );
  if (
    new Set(claimIds).size !== claimIds.length ||
    new Set(input.claims.map((claim) => claim.nativeActionId)).size !==
      input.claims.length ||
    poolClaims.length !== input.claims.length
  )
    return unavailable(
      "duplicate, overlapping, or foreign-pool claims cannot be reconciled",
    );
  const claimTotal = poolClaims.reduce(
    (total, claim) => total + claim.requiredQuantity,
    0,
  );
  const knownReservations = input.claimLedger.knownReservations;
  if (knownReservations === undefined)
    return unavailable("claim-ledger reservations are unavailable");
  const reservationTotal = knownReservations.reduce((total, reservation) => {
    if (
      reservation.resourceId !== "Mana" ||
      reservation.poolId !== budget.poolId ||
      !Number.isFinite(reservation.quantity) ||
      reservation.quantity < 0
    )
      return Number.NaN;
    return total + reservation.quantity;
  }, 0);
  if (
    !Number.isFinite(claimTotal) ||
    budget.admittedGoalClaims !== claimTotal ||
    budget.existingCommitments !== reservationTotal
  )
    return unavailable(
      "shared budget claims or commitments conflict with the claim ledger",
    );

  const beforeLedger = planResourceClaimLedger({
    ...input.claimLedger,
    claims: poolClaims,
    stock: input.stock.quantity,
  });
  if (beforeLedger.status !== "current" && beforeLedger.status !== "none")
    return unavailable(
      "active claim ledger is not current for the selected stock",
    );
  if (
    beforeLedger.currentStock !== input.stock.quantity ||
    beforeLedger.currentStockReserved + beforeLedger.remainingAccumulation !==
      claimTotal
  )
    return unavailable(
      "claim-ledger allocation does not reconcile with admitted obligations",
    );

  const claim = selectedClaims[0];
  if (claim !== undefined) {
    const claimEvidenceMatches =
      claim.nativeActionId === input.selectedActionId &&
      claim.resourceId === "Mana" &&
      claim.poolId === budget.poolId &&
      claim.offerSetIdentity === input.offer.setIdentity &&
      claim.offerObservationId === input.offer.observationId &&
      claim.controlBinding.elementId ===
        input.selectedControlBinding.elementId &&
      claim.controlBinding.generation ===
        input.selectedControlBinding.generation &&
      claim.offerBindingGeneration === input.offer.bindingGeneration &&
      claim.nativeOfferCurrent &&
      claim.nativeActionEligible &&
      claim.researchPermission &&
      claim.observationValid;
    if (!claimEvidenceMatches)
      return Object.freeze({
        classification: "unknown-obligation-relation",
        authorized: false,
        expectedManaDebit: debit,
        fulfilledClaimId: undefined,
        remainingClaimIds: beforeLedger.claimIds,
        reason:
          "selected action has a claim, but current offer or binding does not reconcile",
      });
    if (
      input.offer.displayedManaPrice !== debit ||
      claim.observedNativePrice !== debit ||
      claim.requiredQuantity !== debit
    )
      return Object.freeze({
        classification: "unknown-obligation-relation",
        authorized: false,
        expectedManaDebit: debit,
        fulfilledClaimId: undefined,
        remainingClaimIds: beforeLedger.claimIds,
        reason:
          "verified debit does not exactly match the selected claim and current offer",
      });

    const remainingClaims = poolClaims.filter(
      (activeClaim) => activeClaim.claimId !== claim.claimId,
    );
    const projectedStock = input.stock.quantity - debit;
    const afterLedger = planResourceClaimLedger({
      ...input.claimLedger,
      claims: remainingClaims,
      stock: projectedStock,
    });
    const remainingClaimIds = remainingClaims
      .map((activeClaim) => activeClaim.claimId)
      .sort();
    if (
      projectedStock < 0 ||
      afterLedger.status !==
        (remainingClaimIds.length === 0 ? "none" : "current") ||
      afterLedger.remainingAccumulation !==
        beforeLedger.remainingAccumulation ||
      !remainingClaimIds.every((claimId) =>
        afterLedger.claimIds.includes(claimId),
      )
    )
      return Object.freeze({
        classification: "unknown-obligation-relation",
        authorized: false,
        expectedManaDebit: debit,
        fulfilledClaimId: undefined,
        remainingClaimIds: beforeLedger.claimIds,
        reason:
          "claim fulfillment would increase another obligation's required accumulation",
      });

    return Object.freeze({
      classification: "mandatory-obligation-fulfillment",
      authorized: true,
      expectedManaDebit: debit,
      fulfilledClaimId: claim.claimId,
      remainingClaimIds: Object.freeze(afterLedger.claimIds.slice()),
      reason:
        "exact debit fulfills only the selected claim while preserving remaining accumulation",
    });
  }

  if (debit === 0 || debit <= budget.budgetRemaining)
    return Object.freeze({
      classification: "verified-discretionary-purchase",
      authorized: true,
      expectedManaDebit: debit,
      fulfilledClaimId: undefined,
      remainingClaimIds: beforeLedger.claimIds,
      reason:
        debit === 0
          ? "zero-Mana Research action requires no shared spending reservation"
          : "exact debit fits the current discretionary budget",
    });
  return Object.freeze({
    classification: "unknown-obligation-relation",
    authorized: false,
    expectedManaDebit: debit,
    fulfilledClaimId: undefined,
    remainingClaimIds: beforeLedger.claimIds,
    reason:
      "selected action has no matching claim or verified discretionary allowance",
  });
}
