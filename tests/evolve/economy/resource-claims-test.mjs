import assert from "node:assert/strict";

import {
  admitResourceClaim,
  planResourceClaimLedger,
} from "../../../src/domain/economy/resources/resource-claims.ts";

const evidence = (overrides = {}) => ({
  terminalGoalId: "prestige:mad",
  immediateGoalId: "research:tech-mad_science",
  owner: "goal-planner",
  provenance: "verified-native-prerequisite",
  prerequisiteRelation: "verified",
  nativeActionId: "tech-mad_science",
  targetGrantTechnology: "high_tech",
  targetGrantLevel: 1,
  resourceId: "Mana",
  poolId: "anywhere",
  requiredQuantity: 50,
  observedStock: 0.85,
  observedCapacity: 4200,
  observedNativePrice: 50,
  offerSetIdentity: '[["tech-mad_science",[["Mana",50]]]]',
  offerObservationId: "research-offers-9",
  offerBindingGeneration: 9,
  controlBinding: { elementId: "tech-mad_science", generation: 9 },
  nativeOfferCurrent: true,
  nativeActionEligible: true,
  researchPermission: true,
  queueEvidence: "empty",
  rootGeneration: 4,
  progressionGeneration: "epoch-17",
  observationValid: true,
  precedence: "terminal-prerequisite",
  allocationAuthority: { kind: "independent" },
  forecastProductionPerSecond: 4.94,
  uncertaintyReasons: [],
  unavailableReasons: [],
  ...overrides,
});

const claim = admitResourceClaim(evidence());
assert.ok(claim);
assert.equal(
  claim.claimId,
  "prestige:mad|research:tech-mad_science|tech-mad_science|high_tech|1|Mana|anywhere",
);
assert.equal(
  admitResourceClaim(evidence({ prerequisiteRelation: "unverified" })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ nativeOfferCurrent: false })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ nativeActionEligible: false })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ researchPermission: false })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ queueEvidence: "conflict" })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ queueEvidence: "same-target" })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ queueEvidence: "unavailable" })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ observationValid: false })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ observedNativePrice: 49 })),
  undefined,
);
assert.equal(admitResourceClaim(evidence({ observedCapacity: 49 })), undefined);
assert.equal(
  admitResourceClaim(evidence({ forecastProductionPerSecond: Number.NaN })),
  undefined,
);
assert.equal(
  admitResourceClaim(evidence({ unavailableReasons: ["queue not read"] })),
  undefined,
);

const freshness = {
  rootGeneration: 4,
  progressionGeneration: "epoch-17",
  offerSetIdentity: '[["tech-mad_science",[["Mana",50]]]]',
  offerObservationId: "research-offers-9",
};
const underfunded = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 0.85,
  knownReservations: [],
  forecastProductionPerSecond: 4.94,
});
assert.equal(underfunded.status, "current");
assert.equal(underfunded.currentStockReserved, 0.85);
assert.ok(Math.abs(underfunded.remainingAccumulation - 49.15) < 1e-9);
assert.equal(underfunded.forecastProductionPerSecond, 4.94);
assert.equal(underfunded.spendableStock, 0);

const accumulated = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 37,
  knownReservations: [],
  forecastProductionPerSecond: 4.94,
});
assert.equal(accumulated.currentStockReserved, 37);
assert.equal(accumulated.remainingAccumulation, 13);
assert.equal(accumulated.spendableStock, 0);

const funded = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: 4.94,
});
assert.equal(funded.currentStockReserved, 50);
assert.equal(funded.remainingAccumulation, 0);
assert.equal(funded.spendableStock, 10);
const duplicateClaim = planResourceClaimLedger({
  claims: [claim, claim],
  freshness,
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(duplicateClaim.currentStockReserved, 50);
assert.equal(duplicateClaim.spendableStock, 10);
const conflictingDuplicate = admitResourceClaim(
  evidence({ requiredQuantity: 51, observedNativePrice: 51 }),
);
assert.ok(conflictingDuplicate);
assert.equal(conflictingDuplicate.claimId, claim.claimId);
assert.equal(
  planResourceClaimLedger({
    claims: [claim, conflictingDuplicate],
    freshness,
    controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
    stock: 60,
    knownReservations: [],
    forecastProductionPerSecond: undefined,
  }).status,
  "unavailable",
);

const rebound = admitResourceClaim(
  evidence({
    offerObservationId: "research-offers-10",
    offerBindingGeneration: 10,
    controlBinding: { elementId: "tech-mad_science", generation: 10 },
  }),
);
assert.ok(
  rebound,
  "same-price fresh owner offer permits a new control binding",
);
const reboundLedger = planResourceClaimLedger({
  claims: [rebound],
  freshness: {
    ...freshness,
    offerObservationId: "research-offers-10",
  },
  controlBindings: [{ ...rebound.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(reboundLedger.status, "current");
assert.equal(reboundLedger.currentStockReserved, 50);
assert.equal(reboundLedger.spendableStock, 10);
const ownerConfirmedRebind = admitResourceClaim(
  evidence({
    offerObservationId: "research-offers-12",
    offerBindingGeneration: 9,
    controlBinding: { elementId: "tech-mad_science", generation: 10 },
  }),
);
assert.ok(ownerConfirmedRebind);
const ownerConfirmedRebindLedger = planResourceClaimLedger({
  claims: [ownerConfirmedRebind],
  freshness: {
    ...freshness,
    offerObservationId: "research-offers-12",
  },
  controlBindings: [
    { ...ownerConfirmedRebind.controlBinding, actionCapable: true },
  ],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(ownerConfirmedRebindLedger.status, "current");
assert.equal(ownerConfirmedRebindLedger.spendableStock, 10);
assert.equal(
  planResourceClaimLedger({
    claims: [ownerConfirmedRebind],
    freshness: {
      ...freshness,
      offerObservationId: "research-offers-12",
    },
    controlBindings: [
      {
        ...ownerConfirmedRebind.controlBinding,
        generation: 11,
        actionCapable: true,
      },
    ],
    stock: 60,
    knownReservations: [],
    forecastProductionPerSecond: undefined,
  }).status,
  "stale",
  "a binding change after the owner-confirmed rebind suspends the claim",
);

const changedPrice = admitResourceClaim(
  evidence({
    requiredQuantity: 55,
    observedNativePrice: 55,
    offerSetIdentity: '[["tech-mad_science",[["Mana",55]]]]',
    offerObservationId: "research-offers-11",
    offerBindingGeneration: 11,
    controlBinding: { elementId: "tech-mad_science", generation: 11 },
  }),
);
assert.ok(changedPrice, "fresh native price replaces the former requirement");
assert.equal(changedPrice.requiredQuantity, 55);
assert.equal(changedPrice.claimId, claim.claimId);
const changedGrant = admitResourceClaim(
  evidence({ targetGrantTechnology: "high_tech", targetGrantLevel: 2 }),
);
assert.ok(changedGrant);
assert.notEqual(changedGrant.claimId, claim.claimId);
assert.equal(
  planResourceClaimLedger({
    claims: [claim],
    freshness: {
      ...freshness,
      offerObservationId: changedPrice.offerObservationId,
      offerSetIdentity: changedPrice.offerSetIdentity,
    },
    controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
    stock: 60,
    knownReservations: [],
    forecastProductionPerSecond: undefined,
  }).status,
  "stale",
);
const reboundWithoutOffer = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBindings: [{ ...rebound.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(reboundWithoutOffer.status, "stale");
assert.equal(reboundWithoutOffer.spendableStock, 0);
const missingControl = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBindings: undefined,
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(missingControl.status, "unavailable");
const nonActionControl = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBindings: [
    {
      ...claim.controlBinding,
      actionCapable: false,
    },
  ],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(nonActionControl.status, "unavailable");
const missingOfferObservation = planResourceClaimLedger({
  claims: [claim],
  freshness: undefined,
  controlBindings: [
    {
      ...claim.controlBinding,
      actionCapable: true,
    },
  ],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(missingOfferObservation.status, "unavailable");
const changedOfferSet = planResourceClaimLedger({
  claims: [claim],
  freshness: {
    ...freshness,
    offerSetIdentity: "different-membership-or-price",
  },
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(changedOfferSet.status, "stale");

const overcommitted = admitResourceClaim(
  evidence({
    terminalGoalId: "prestige:bioseed",
    requiredQuantity: 30,
    observedNativePrice: 30,
  }),
);
assert.ok(overcommitted);
const multipleClaims = planResourceClaimLedger({
  claims: [overcommitted, claim],
  freshness,
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: 100,
});
assert.equal(multipleClaims.currentStockReserved, 60);
assert.equal(multipleClaims.remainingAccumulation, 20);
assert.equal(multipleClaims.spendableStock, 0);
assert.deepEqual(multipleClaims.claimIds, [...multipleClaims.claimIds].sort());

const researchA = admitResourceClaim(
  evidence({
    immediateGoalId: "research:tech-a",
    nativeActionId: "tech-a",
    targetGrantTechnology: "tech_a",
    requiredQuantity: 50,
    observedNativePrice: 50,
    offerSetIdentity: "research-alternatives-v1",
    controlBinding: { elementId: "tech-a", generation: 9 },
    allocationAuthority: {
      kind: "selected-alternative",
      groupId: "research-frontier",
      selectedActionId: "tech-b",
      authorityId: "research-owner-cycle-7",
    },
  }),
);
const researchB = admitResourceClaim(
  evidence({
    immediateGoalId: "research:tech-b",
    nativeActionId: "tech-b",
    targetGrantTechnology: "tech_b",
    requiredQuantity: 20,
    observedNativePrice: 20,
    offerSetIdentity: "research-alternatives-v1",
    allocationAuthority: {
      kind: "selected-alternative",
      groupId: "research-frontier",
      selectedActionId: "tech-b",
      authorityId: "research-owner-cycle-7",
    },
    controlBinding: { elementId: "tech-b", generation: 4 },
  }),
);
assert.ok(researchA);
assert.ok(researchB);
const selectedAlternative = planResourceClaimLedger({
  claims: [researchA, researchB],
  freshness: {
    ...freshness,
    offerSetIdentity: "research-alternatives-v1",
  },
  controlBindings: [
    { elementId: "tech-a", generation: 9, actionCapable: true },
    { elementId: "tech-b", generation: 4, actionCapable: true },
  ],
  stock: 60,
  knownReservations: [{ resourceId: "Mana", poolId: "anywhere", quantity: 10 }],
  forecastProductionPerSecond: undefined,
});
assert.equal(selectedAlternative.currentStockReserved, 20);
assert.equal(selectedAlternative.remainingAccumulation, 0);
assert.equal(selectedAlternative.spendableStock, 30);
assert.deepEqual(selectedAlternative.claimIds, [researchB.claimId]);

const ambiguousAlternatives = planResourceClaimLedger({
  claims: [researchA],
  freshness: {
    ...freshness,
    offerSetIdentity: "research-alternatives-v1",
  },
  controlBindings: [
    { elementId: "tech-a", generation: 9, actionCapable: true },
  ],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(ambiguousAlternatives.status, "unavailable");
assert.equal(ambiguousAlternatives.spendableStock, 0);

const independentResearchA = admitResourceClaim(
  evidence({
    immediateGoalId: "research:tech-a",
    nativeActionId: "tech-a",
    targetGrantTechnology: "tech_a",
    requiredQuantity: 50,
    observedNativePrice: 50,
    offerSetIdentity: "research-independent-v1",
    controlBinding: { elementId: "tech-a", generation: 2 },
  }),
);
const independentResearchB = admitResourceClaim(
  evidence({
    immediateGoalId: "research:tech-b",
    nativeActionId: "tech-b",
    targetGrantTechnology: "tech_b",
    requiredQuantity: 20,
    observedNativePrice: 20,
    offerSetIdentity: "research-independent-v1",
    controlBinding: { elementId: "tech-b", generation: 5 },
  }),
);
assert.ok(independentResearchA);
assert.ok(independentResearchB);
const independentClaims = planResourceClaimLedger({
  claims: [independentResearchA, independentResearchB],
  freshness: {
    ...freshness,
    offerSetIdentity: "research-independent-v1",
  },
  controlBindings: [
    { elementId: "tech-a", generation: 2, actionCapable: true },
    { elementId: "tech-b", generation: 5, actionCapable: true },
  ],
  stock: 60,
  knownReservations: [{ resourceId: "Mana", poolId: "anywhere", quantity: 10 }],
  forecastProductionPerSecond: undefined,
});
assert.equal(independentClaims.currentStockReserved, 50);
assert.equal(independentClaims.remainingAccumulation, 20);
assert.equal(independentClaims.spendableStock, 0);

const knownCommitment = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: [{ resourceId: "Mana", poolId: "anywhere", quantity: 20 }],
  forecastProductionPerSecond: undefined,
});
assert.equal(knownCommitment.currentStockReserved, 40);
assert.equal(knownCommitment.remainingAccumulation, 10);
assert.equal(knownCommitment.spendableStock, 0);

const unknownExternalCommitment = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: undefined,
  forecastProductionPerSecond: 100,
});
assert.equal(unknownExternalCommitment.status, "unavailable");
assert.equal(unknownExternalCommitment.spendableStock, 0);
assert.equal(unknownExternalCommitment.forecastProductionPerSecond, 100);

const stale = planResourceClaimLedger({
  claims: [claim],
  freshness: { ...freshness, rootGeneration: 5 },
  controlBindings: [{ ...claim.controlBinding, actionCapable: true }],
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(stale.status, "stale");
assert.equal(stale.spendableStock, 0);

const separatedPool = admitResourceClaim(evidence({ poolId: "city" }));
assert.ok(separatedPool);
assert.equal(separatedPool.claimId.endsWith("|city"), true);
assert.equal(
  planResourceClaimLedger({
    claims: [],
    freshness,
    controlBindings: undefined,
    stock: 60,
    knownReservations: [],
    forecastProductionPerSecond: 100,
  }).spendableStock,
  60,
);

console.log("resource claim admission and accounting ok");
