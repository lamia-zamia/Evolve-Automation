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
  controlBinding: { elementId: "tech-mad_science", generation: 9 },
  nativeOfferCurrent: true,
  nativeActionEligible: true,
  researchPermission: true,
  queueEvidence: "empty",
  rootGeneration: 4,
  progressionGeneration: "epoch-17",
  observationValid: true,
  precedence: "terminal-prerequisite",
  forecastProductionPerSecond: 4.94,
  uncertaintyReasons: [],
  unavailableReasons: [],
  ...overrides,
});

const claim = admitResourceClaim(evidence());
assert.ok(claim);
assert.equal(
  claim.claimId,
  "prestige:mad|research:tech-mad_science|tech-mad_science|Mana|anywhere",
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
  controlBinding: { ...claim.controlBinding, actionCapable: true },
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
  controlBinding: { ...claim.controlBinding, actionCapable: true },
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
  controlBinding: { ...claim.controlBinding, actionCapable: true },
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: 4.94,
});
assert.equal(funded.currentStockReserved, 50);
assert.equal(funded.remainingAccumulation, 0);
assert.equal(funded.spendableStock, 10);

const rebound = admitResourceClaim(
  evidence({
    offerObservationId: "research-offers-10",
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
  controlBinding: { ...rebound.controlBinding, actionCapable: true },
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(reboundLedger.status, "current");
assert.equal(reboundLedger.currentStockReserved, 50);
assert.equal(reboundLedger.spendableStock, 10);

const changedPrice = admitResourceClaim(
  evidence({
    requiredQuantity: 55,
    observedNativePrice: 55,
    offerSetIdentity: '[["tech-mad_science",[["Mana",55]]]]',
    offerObservationId: "research-offers-11",
    controlBinding: { elementId: "tech-mad_science", generation: 11 },
  }),
);
assert.ok(changedPrice, "fresh native price replaces the former requirement");
assert.equal(changedPrice.requiredQuantity, 55);
const reboundWithoutOffer = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBinding: { ...rebound.controlBinding, actionCapable: true },
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(reboundWithoutOffer.status, "current");
assert.equal(reboundWithoutOffer.spendableStock, 10);
const missingControl = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBinding: undefined,
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(missingControl.status, "unavailable");
const nonActionControl = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBinding: {
    ...claim.controlBinding,
    actionCapable: false,
  },
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: undefined,
});
assert.equal(nonActionControl.status, "unavailable");
const missingOfferObservation = planResourceClaimLedger({
  claims: [claim],
  freshness: undefined,
  controlBinding: {
    ...claim.controlBinding,
    actionCapable: true,
  },
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
  controlBinding: { ...claim.controlBinding, actionCapable: true },
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
  controlBinding: { ...claim.controlBinding, actionCapable: true },
  stock: 60,
  knownReservations: [],
  forecastProductionPerSecond: 100,
});
assert.equal(multipleClaims.currentStockReserved, 60);
assert.equal(multipleClaims.remainingAccumulation, 20);
assert.equal(multipleClaims.spendableStock, 0);
assert.deepEqual(multipleClaims.claimIds, [...multipleClaims.claimIds].sort());

const knownCommitment = planResourceClaimLedger({
  claims: [claim],
  freshness,
  controlBinding: { ...claim.controlBinding, actionCapable: true },
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
  controlBinding: { ...claim.controlBinding, actionCapable: true },
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
  controlBinding: { ...claim.controlBinding, actionCapable: true },
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
    controlBinding: undefined,
    stock: 60,
    knownReservations: [],
    forecastProductionPerSecond: 100,
  }).spendableStock,
  60,
);

console.log("resource claim admission and accounting ok");
