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
  quantity: 25,
  stockObservationId: "stock-1",
};
const ownerOneAuthorized = reserveSharedResourceSpend(
  initial,
  ownerOneReservation,
  { id: "stock-1", quantity: 100 },
);
assert.equal(ownerOneAuthorized.budgetRemaining, 45);
assert.equal(ownerOneAuthorized.pendingReservations.length, 1);
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

const staleSecondOwner = reserveSharedResourceSpend(
  ownerOneAfter,
  { id: "construction", quantity: 1, stockObservationId: "stock-1" },
  { id: "stock-1", quantity: 75 },
);
assert.equal(staleSecondOwner.status, "invalidated");
assert.equal(staleSecondOwner.budgetRemaining, 0);

const refreshedForOwnerTwo = planSharedResourceBudget(
  input({
    stock: { id: "stock-2", quantity: 75 },
    permittedDiscretionarySpending: 45,
    observedNativeExpenditure: 25,
  }),
);
const ownerTwoReservation = {
  id: "construction",
  quantity: 40,
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
  { id: "late-action", quantity: 5, stockObservationId: "stock-1" },
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

const unexpectedDebit = reconcileSharedResourceSpend(
  ownerOneAuthorized,
  ownerOneReservation,
  {
    outcome: "succeeded",
    observedStockAfter: { id: "stock-2", quantity: 60 },
  },
);
assert.equal(unexpectedDebit.status, "invalidated");
assert.equal(unexpectedDebit.budgetRemaining, 0);

console.log("shared per-resource spending budget coordination ok");
