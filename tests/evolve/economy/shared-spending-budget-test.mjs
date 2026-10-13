import assert from "node:assert/strict";

import {
  planSharedResourceBudget,
  reconcileSharedResourceSpend,
  reserveSharedResourceSpend,
} from "../../../src/domain/economy/resources/shared-spending-budget.ts";

const input = (overrides = {}) => ({
  resourceId: "Mana",
  poolId: "anywhere",
  stock: { id: "stock-1", quantity: 100 },
  commitments: { kind: "known", quantity: 10 },
  admittedGoalClaims: 20,
  permittedDiscretionarySpending: 70,
  observedNativeExpenditure: 0,
  ...overrides,
});

const unknown = planSharedResourceBudget(
  input({
    commitments: { kind: "unknown", reason: "ritual spend not observed" },
  }),
);
assert.equal(unknown.status, "unavailable");
assert.equal(unknown.existingCommitments, undefined);
assert.equal(unknown.budgetRemaining, 0);
assert.equal(unknown.unavailableReason, "ritual spend not observed");

const initial = planSharedResourceBudget(input());
assert.equal(initial.status, "current");
assert.equal(initial.budgetRemaining, 70);
const ownerOneReservation = {
  id: "research-purchase",
  resourceId: "Mana",
  poolId: "anywhere",
  expectedDebit: 25,
  stockObservationId: "stock-1",
};
const ownerOneAuthorized = reserveSharedResourceSpend(
  initial,
  ownerOneReservation,
  { id: "stock-1", quantity: 100 },
);
assert.equal(ownerOneAuthorized.budgetRemaining, 45);
assert.equal(ownerOneAuthorized.pendingReservations.length, 1);
const secondReservationAttempt = reserveSharedResourceSpend(
  ownerOneAuthorized,
  {
    id: "construction",
    resourceId: "Mana",
    poolId: "anywhere",
    expectedDebit: 10,
    stockObservationId: "stock-1",
  },
  { id: "stock-1", quantity: 100 },
);
assert.equal(
  secondReservationAttempt.status,
  "invalidated",
  "only one native spend may be in flight per observation",
);
assert.equal(
  reserveSharedResourceSpend(ownerOneAuthorized, ownerOneReservation, {
    id: "stock-1",
    quantity: 100,
  }).status,
  "invalidated",
  "a reservation identity cannot promise stock twice",
);

const ownerOneAfter = reconcileSharedResourceSpend(
  ownerOneAuthorized,
  ownerOneReservation,
  {
    outcome: "succeeded",
    observedStockAfter: { id: "stock-2", quantity: 75 },
  },
);
assert.equal(ownerOneAfter.status, "current");
assert.equal(ownerOneAfter.observedNativeExpenditure, 25);
assert.equal(ownerOneAfter.budgetRemaining, 45);
assert.equal(ownerOneAfter.pendingReservations.length, 0);

// A stale observation id is rejected even when its quantity happens to match.
const staleSecondOwnerId = reserveSharedResourceSpend(
  ownerOneAfter,
  {
    id: "construction",
    resourceId: "Mana",
    poolId: "anywhere",
    expectedDebit: 10,
    stockObservationId: "stock-1",
  },
  { id: "stock-1", quantity: 75 },
);
assert.equal(staleSecondOwnerId.status, "invalidated");
assert.equal(staleSecondOwnerId.budgetRemaining, 0);

// A changed quantity is rejected even when the observation id is still current.
const staleSecondOwnerQuantity = reserveSharedResourceSpend(
  ownerOneAfter,
  {
    id: "construction-quantity-check",
    resourceId: "Mana",
    poolId: "anywhere",
    expectedDebit: 10,
    stockObservationId: "stock-2",
  },
  { id: "stock-2", quantity: 74 },
);
assert.equal(staleSecondOwnerQuantity.status, "invalidated");
assert.equal(staleSecondOwnerQuantity.budgetRemaining, 0);

// Adopting the invalid result from an attempted concurrent reservation also means the
// in-flight reservation can no longer be reconciled through that returned budget.
assert.equal(
  reconcileSharedResourceSpend(secondReservationAttempt, ownerOneReservation, {
    outcome: "succeeded",
    observedStockAfter: { id: "stock-2", quantity: 75 },
  }).status,
  "invalidated",
);

const refreshedForOwnerTwo = planSharedResourceBudget(
  input({
    stock: { id: "stock-2", quantity: 75 },
    permittedDiscretionarySpending: 45,
    observedNativeExpenditure: 25,
  }),
);
const ownerTwoReservation = {
  id: "construction",
  resourceId: "Mana",
  poolId: "anywhere",
  expectedDebit: 40,
  stockObservationId: "stock-2",
};
const ownerTwoAuthorized = reserveSharedResourceSpend(
  refreshedForOwnerTwo,
  ownerTwoReservation,
  { id: "stock-2", quantity: 75 },
);
const ownerTwoAfter = reconcileSharedResourceSpend(
  ownerTwoAuthorized,
  ownerTwoReservation,
  {
    outcome: "succeeded",
    observedStockAfter: { id: "stock-3", quantity: 35 },
  },
);
assert.equal(ownerTwoAfter.status, "current");
assert.equal(ownerTwoAfter.observedNativeExpenditure, 65);
assert.equal(ownerTwoAfter.budgetRemaining, 5);

const changedBeforeInvocation = reserveSharedResourceSpend(
  initial,
  {
    id: "late-action",
    resourceId: "Mana",
    poolId: "anywhere",
    expectedDebit: 5,
    stockObservationId: "stock-1",
  },
  { id: "stock-changed", quantity: 95 },
);
assert.equal(changedBeforeInvocation.status, "invalidated");
assert.equal(changedBeforeInvocation.budgetRemaining, 0);

const failedNativeAction = reconcileSharedResourceSpend(
  ownerOneAuthorized,
  ownerOneReservation,
  {
    outcome: "failed",
    observedStockAfter: { id: "stock-2", quantity: 100 },
  },
);
assert.equal(failedNativeAction.status, "invalidated");
assert.equal(failedNativeAction.budgetRemaining, 0);

const partialDebit = reconcileSharedResourceSpend(
  ownerOneAuthorized,
  ownerOneReservation,
  {
    outcome: "succeeded",
    observedStockAfter: { id: "stock-2", quantity: 80 },
  },
);
assert.equal(partialDebit.status, "invalidated");
assert.equal(partialDebit.budgetRemaining, 0);

const excessiveDebit = reconcileSharedResourceSpend(
  ownerOneAuthorized,
  ownerOneReservation,
  {
    outcome: "succeeded",
    observedStockAfter: { id: "stock-2", quantity: 60 },
  },
);
assert.equal(excessiveDebit.status, "invalidated");
assert.equal(excessiveDebit.budgetRemaining, 0);

const uncertainNativeAction = reconcileSharedResourceSpend(
  ownerOneAuthorized,
  ownerOneReservation,
  {
    outcome: "uncertain",
    observedStockAfter: { id: "stock-2", quantity: 75 },
  },
);
assert.equal(uncertainNativeAction.status, "invalidated");

for (const otherIdentity of [
  { resourceId: "Knowledge", poolId: "anywhere" },
  { resourceId: "Mana", poolId: "local" },
]) {
  const otherBudget = planSharedResourceBudget(input({ ...otherIdentity }));
  assert.equal(
    reserveSharedResourceSpend(otherBudget, ownerOneReservation, {
      id: "stock-1",
      quantity: 100,
    }).status,
    "invalidated",
    "reservation identity is scoped to its resource and pool",
  );
}

console.log("shared per-resource spending budget coordination ok");
