import assert from "node:assert/strict";
import { planTradeRoutes } from "../../../src/domain/economy/market/trade-routes.ts";

const base = {
  settings: {
    tradeRouteSellExcess: false,
    tradeRouteMinimumMoneyPerSecond: 500,
    tradeRouteMinimumMoneyPercentage: 0,
  },
  priorityList: [
    {
      id: "Titanium",
      tradeRoutes: 0,
      autoTradeBuyEnabled: true,
      autoTradeSellEnabled: false,
      usefulRatio: 0,
      storageRatio: 0,
      tradeSellPrice: 1,
      tradeBuyPrice: 10,
      rateOfChange: 0,
      tradeRouteQuantity: 1,
      autoTradeWeighting: 1,
      autoTradePriority: 1,
      isRoutesUnlocked: true,
      isDemanded: true,
    },
  ],
  money: {
    rateOfChange: 5,
    maxQuantity: 1_000,
    currentQuantity: 100,
    isDemanded: false,
  },
  importRouteCap: 25,
  exportRouteCap: 25,
  maxTradeRoutes: 1,
  unmanagedTradeRoutes: 0,
  isBanana: false,
  isEntrepreneur: false,
  saveInflationMoney: false,
};

const negativeProjection = planTradeRoutes(base);
assert.deepEqual(negativeProjection.operations, []);
assert.equal(
  negativeProjection.moneyRate,
  5,
  "demand removes the configured positive floor but does not allow negative projected Money flow",
);

const positiveProjection = planTradeRoutes({
  ...base,
  money: { ...base.money, rateOfChange: 20 },
});
assert.deepEqual(positiveProjection.operations, [
  { kind: "add", resourceId: "Titanium", count: 1 },
]);
assert.equal(positiveProjection.moneyRate, 10);

const preservedFloor = planTradeRoutes(
  {
    ...base,
    money: { ...base.money, rateOfChange: 20 },
  },
  { preserveMoneyFloorForDemandedResources: true },
);
assert.deepEqual(
  preservedFloor.operations,
  [],
  "priority demand keeps its priority but cannot bypass the ordinary Money floor",
);
const abovePreservedFloor = planTradeRoutes(
  {
    ...base,
    money: { ...base.money, rateOfChange: 520 },
  },
  { preserveMoneyFloorForDemandedResources: true },
);
assert.deepEqual(abovePreservedFloor.operations, [
  { kind: "add", resourceId: "Titanium", count: 1 },
]);
assert.equal(abovePreservedFloor.moneyRate, 510);

console.log("trade route Money-flow guard tests passed");
