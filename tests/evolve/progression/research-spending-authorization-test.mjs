import assert from "node:assert/strict";

import { admitResourceClaim } from "../../../src/domain/economy/resources/resource-claims.ts";
import {
  planSharedResourceBudget,
  reserveSharedResourceSpend,
} from "../../../src/domain/economy/resources/shared-spending-budget.ts";
import { authorizeResearchManaSpend } from "../../../src/domain/progression/research/research-spending-authorization.ts";

const offerSetIdentity = "research-offers-42";
const offerObservationId = "research-observation-42";
const claimFor = (actionId, quantity, grant, overrides = {}) =>
  admitResourceClaim({
    terminalGoalId: "prestige:mad",
    immediateGoalId: `research:${actionId}`,
    owner: "goal-planner",
    provenance: "verified-native-prerequisite",
    prerequisiteRelation: "verified",
    nativeActionId: actionId,
    targetGrantTechnology: grant,
    targetGrantLevel: 1,
    resourceId: "Mana",
    poolId: "anywhere",
    requiredQuantity: quantity,
    observedStock: 0,
    observedCapacity: 1000,
    observedNativePrice: quantity,
    offerSetIdentity,
    offerObservationId,
    offerBindingGeneration: 9,
    controlBinding: { elementId: actionId, generation: 9 },
    nativeOfferCurrent: true,
    nativeActionEligible: true,
    researchPermission: true,
    queueEvidence: "empty",
    rootGeneration: 1,
    progressionGeneration: "epoch-1",
    observationValid: true,
    precedence: "terminal-prerequisite",
    allocationAuthority: { kind: "independent" },
    forecastProductionPerSecond: 1,
    uncertaintyReasons: [],
    unavailableReasons: [],
    ...overrides,
  });

const madScience = claimFor("tech-mad_science", 50, "high_tech");
const blackPowder = claimFor("tech-black_powder", 100, "explosives");

const decide = (overrides = {}) => {
  const claims = overrides.claims ?? [madScience];
  const stock = overrides.stock ?? { id: "mana-42", quantity: 150 };
  const selectedActionId = overrides.selectedActionId ?? "tech-mad_science";
  const debit = overrides.expectedManaDebit ?? {
    kind: "verified",
    quantity: 50,
  };
  const controlBindings = claims.map((claim) => ({
    elementId: claim.controlBinding.elementId,
    generation: claim.controlBinding.generation,
    actionCapable: true,
  }));
  const claimLedger = overrides.claimLedger ?? {
    claims,
    freshness: {
      rootGeneration: 1,
      progressionGeneration: "epoch-1",
      offerSetIdentity,
      offerObservationId,
    },
    controlBindings,
    stock: stock.quantity,
    knownReservations: [],
    forecastProductionPerSecond: 1,
  };
  const budget =
    overrides.discretionaryBudget ??
    planSharedResourceBudget({
      resourceId: "Mana",
      poolId: "anywhere",
      stock,
      commitments: { kind: "known", quantity: 0 },
      admittedGoalClaims: claims.reduce(
        (total, claim) => total + claim.requiredQuantity,
        0,
      ),
      permittedDiscretionarySpending: 150,
      observedNativeExpenditure: 0,
    });
  return authorizeResearchManaSpend({
    selectedActionId,
    selectedControlBinding: {
      elementId: selectedActionId,
      generation: 9,
    },
    offer: {
      status: "current",
      setIdentity: offerSetIdentity,
      observationId: offerObservationId,
      bindingGeneration: 9,
      displayedManaPrice: debit.kind === "verified" ? debit.quantity : 50,
    },
    expectedManaDebit: debit,
    stock,
    claims,
    claimLedger,
    discretionaryBudget: budget,
    queueAuthority: "automation",
    commitments: "known",
    anotherReservationPending: false,
    ...overrides,
  });
};

const noClaims = decide({
  claims: [],
  expectedManaDebit: { kind: "verified", quantity: 25 },
  stock: { id: "mana-42", quantity: 100 },
});
assert.equal(noClaims.classification, "verified-discretionary-purchase");
assert.equal(noClaims.authorized, true);

const activeClaimAndDiscretionary = decide({
  selectedActionId: "tech-rituals",
  expectedManaDebit: { kind: "verified", quantity: 25 },
  stock: { id: "mana-42", quantity: 100 },
});
assert.equal(
  activeClaimAndDiscretionary.classification,
  "verified-discretionary-purchase",
);
assert.equal(activeClaimAndDiscretionary.authorized, true);

const noDiscretionaryAllowance = planSharedResourceBudget({
  resourceId: "Mana",
  poolId: "anywhere",
  stock: { id: "mana-42", quantity: 100 },
  commitments: { kind: "known", quantity: 0 },
  admittedGoalClaims: 50,
  permittedDiscretionarySpending: 0,
  observedNativeExpenditure: 0,
});
assert.equal(
  decide({
    selectedActionId: "tech-rituals",
    expectedManaDebit: { kind: "verified", quantity: 25 },
    stock: { id: "mana-42", quantity: 100 },
    discretionaryBudget: noDiscretionaryAllowance,
  }).authorized,
  false,
);

const twoClaims = decide({
  claims: [madScience, blackPowder],
  stock: { id: "mana-42", quantity: 150 },
});
assert.equal(twoClaims.classification, "mandatory-obligation-fulfillment");
assert.equal(twoClaims.authorized, true);
assert.equal(twoClaims.fulfilledClaimId, madScience.claimId);
assert.deepEqual(twoClaims.remainingClaimIds, [blackPowder.claimId]);

const partialStockAndAccumulation = decide({
  claims: [madScience, blackPowder],
  stock: { id: "mana-42", quantity: 100 },
});
assert.equal(partialStockAndAccumulation.authorized, true);
assert.deepEqual(partialStockAndAccumulation.remainingClaimIds, [
  blackPowder.claimId,
]);

const insufficientStockForOwnDebit = decide({
  stock: { id: "mana-42", quantity: 25 },
});
assert.equal(insufficientStockForOwnDebit.authorized, false);

const staleStockBudget = planSharedResourceBudget({
  resourceId: "Mana",
  poolId: "anywhere",
  stock: { id: "mana-41", quantity: 150 },
  commitments: { kind: "known", quantity: 0 },
  admittedGoalClaims: 50,
  permittedDiscretionarySpending: 100,
  observedNativeExpenditure: 0,
});
assert.equal(
  decide({ discretionaryBudget: staleStockBudget }).authorized,
  false,
  "a stock observation that changed before invocation cannot authorize spending",
);

const pendingBudget = reserveSharedResourceSpend(
  planSharedResourceBudget({
    resourceId: "Mana",
    poolId: "anywhere",
    stock: { id: "mana-42", quantity: 150 },
    commitments: { kind: "known", quantity: 0 },
    admittedGoalClaims: 50,
    permittedDiscretionarySpending: 100,
    observedNativeExpenditure: 0,
  }),
  {
    id: "prior-spend",
    resourceId: "Mana",
    poolId: "anywhere",
    expectedDebit: 10,
    stockObservationId: "mana-42",
  },
  { id: "mana-42", quantity: 150 },
);
assert.equal(decide({ discretionaryBudget: pendingBudget }).authorized, false);
assert.equal(
  pendingBudget.pendingReservations.length,
  1,
  "a failed authorization does not mutate an already outstanding reservation",
);

for (const staleOffer of [
  {
    offer: {
      status: "changed",
      setIdentity: offerSetIdentity,
      observationId: offerObservationId,
      bindingGeneration: 9,
      displayedManaPrice: 50,
    },
  },
  {
    offer: {
      status: "unknown",
      setIdentity: offerSetIdentity,
      observationId: offerObservationId,
      bindingGeneration: 9,
      displayedManaPrice: 50,
    },
  },
  {
    offer: {
      status: "current",
      setIdentity: offerSetIdentity,
      observationId: "new-offer",
      bindingGeneration: 9,
      displayedManaPrice: 50,
    },
  },
  { selectedControlBinding: { elementId: "tech-mad_science", generation: 10 } },
  { commitments: "unknown" },
  { anotherReservationPending: true },
  { queueAuthority: "unknown" },
  { queueAuthority: "player" },
  {
    expectedManaDebit: {
      kind: "unknown",
      reason: "adjusted cost is unavailable",
    },
  },
]) {
  assert.equal(
    decide(staleOffer).authorized,
    false,
    "stale or conflicting spending evidence defers the selected action",
  );
}

const changedPrice = decide({
  expectedManaDebit: { kind: "verified", quantity: 60 },
});
assert.equal(changedPrice.classification, "unknown-obligation-relation");

const duplicateSelectedClaim = decide({
  claims: [madScience, claimFor("tech-mad_science", 50, "another-grant")],
});
assert.equal(duplicateSelectedClaim.authorized, false);

const zeroManaResearch = decide({
  claims: [],
  expectedManaDebit: { kind: "verified", quantity: 0 },
  stock: { id: "mana-42", quantity: 100 },
});
assert.equal(
  zeroManaResearch.classification,
  "verified-discretionary-purchase",
);
assert.equal(zeroManaResearch.authorized, true);

console.log("research spending authorization contract ok");
