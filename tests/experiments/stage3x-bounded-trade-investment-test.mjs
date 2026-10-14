import assert from "node:assert/strict";
import { evaluateBoundedTradeInvestment } from "../../experiments/stage3x-bounded-trade-investment.ts";

const base = {
  goal: { resourceId: "Alloy", targetQuantity: 100 },
  resource: {
    id: "Alloy",
    holding: 0,
    capacity: 500,
    productionLowerBoundPerPeriod: 0,
    existingImportQuantity: 0,
    importPriceUpperBoundPerPeriod: 2,
    importQuantityLowerBoundPerPeriod: 10,
    routeAssignments: 0,
  },
  availableRouteSlots: 1,
  maximumRoutes: 5,
  maximumResourceRoutes: 4,
  settings: { autoMarket: true, importEnabled: true },
  money: {
    holding: 100,
    incomePerPeriod: 5,
    outflowPerPeriod: 5,
    projectedNetFlowPerPeriod: 0,
    protectedCommitments: 20,
    commitmentsComplete: true,
    ongoingObligationsPerPeriod: 0,
    obligationsComplete: true,
  },
  freshness: {
    root: true,
    marketBoard: true,
    quote: true,
    demand: true,
    resourceControl: true,
  },
};

const candidate = evaluateBoundedTradeInvestment(base);
assert.equal(candidate.status, "candidate-investment");
assert.equal(candidate.candidate, true);
assert.equal(candidate.immediateNativeAffordability, "affordable");
assert.equal(candidate.maximumAffordableCommitment, 80);
assert.equal(candidate.conservativeSpendPerPeriod, 7);
assert.equal(candidate.estimatedRequiredCommitment, 70);
assert.equal(candidate.maximumPeriods, 11);
assert.equal(candidate.requiredDurationPeriods, 10);
assert.equal(candidate.expectedAcquisition, 110);
assert.equal(candidate.creditedFutureIncomePerPeriod, 0);
assert.equal(candidate.exitConditions.length, 3);

assert.equal(
  evaluateBoundedTradeInvestment({ ...base, goal: undefined }).status,
  "unknown-economics",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    goal: { resourceId: "Copper", targetQuantity: 100 },
  }).status,
  "eligible",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: { ...base.resource, id: "Copper" },
  }).status,
  "eligible",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: { ...base.resource, holding: 100 },
  }).status,
  "demand-satisfied",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: { ...base.resource, capacity: 99 },
  }).status,
  "capacity-blocked",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: { ...base.resource, existingImportQuantity: 100 },
  }).status,
  "existing-import-sufficient",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    settings: { ...base.settings, autoMarket: false },
  }).status,
  "permission-disabled",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    settings: { ...base.settings, importEnabled: false },
  }).status,
  "permission-disabled",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    availableRouteSlots: 0,
  }).status,
  "capacity-blocked",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: { ...base.resource, routeAssignments: 2 },
    maximumResourceRoutes: 2,
  }).status,
  "capacity-blocked",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: { ...base.resource, routeAssignments: -1 },
  }).status,
  "unknown-economics",
  "an existing export assignment is preserved instead of offset",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    money: { ...base.money, holding: 19 },
  }).status,
  "insufficient-cash",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    money: { ...base.money, protectedCommitments: 90 },
  }).status,
  "insufficient-cash",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    money: {
      ...base.money,
      outflowPerPeriod: 20,
      projectedNetFlowPerPeriod: -15,
    },
  }).status,
  "insufficient-cash",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    money: { ...base.money, projectedNetFlowPerPeriod: 20 },
  }).status,
  "candidate-investment",
  "positive current flow is not credited as future income",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    money: { ...base.money, projectedNetFlowPerPeriod: 20 },
  }).creditedFutureIncomePerPeriod,
  0,
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: {
      ...base.resource,
      id: "Uranium",
      importPriceUpperBoundPerPeriod: 20,
      importQuantityLowerBoundPerPeriod: 2,
    },
    goal: { resourceId: "Uranium", targetQuantity: 100 },
  }).status,
  "insufficient-cash",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: {
      ...base.resource,
      importPriceUpperBoundPerPeriod: 10,
    },
  }).estimatedRequiredCommitment,
  150,
  "a changed native quote changes the bounded estimate",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    resource: {
      ...base.resource,
      importPriceUpperBoundPerPeriod: undefined,
    },
  }).status,
  "unknown-economics",
);
assert.equal(
  evaluateBoundedTradeInvestment({
    ...base,
    freshness: { ...base.freshness, root: false },
  }).status,
  "unknown-economics",
);

console.log("stage3x bounded trade investment tests passed");
