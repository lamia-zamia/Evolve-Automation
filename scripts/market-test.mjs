import assert from "node:assert/strict";

import {
  planMarketBuy,
  planMarketSell,
} from "../src/domain/economy/market/market.ts";

assert.equal(
  planMarketSell({
    index: 0,
    resourceId: "Iron",
    eligible: false,
    autoSellEnabled: true,
    ignoreSellRatio: true,
    storageRatio: 1,
    autoSellRatio: 0,
    moneyMaximum: 100,
    moneyCurrent: 0,
    unitPrice: 1,
    currentQuantity: 100,
    maxQuantity: 100,
    income: 0,
    ticksPerSecond: 10,
    maximumMultiplier: 10,
  }),
  null,
);

const zeroSellDecision = planMarketSell({
  index: 0,
  resourceId: "Iron",
  eligible: true,
  autoSellEnabled: true,
  ignoreSellRatio: true,
  storageRatio: 1,
  autoSellRatio: 0,
  moneyMaximum: 100,
  moneyCurrent: 100,
  unitPrice: 1,
  currentQuantity: 100,
  maxQuantity: 100,
  income: 0,
  ticksPerSecond: 10,
  maximumMultiplier: 10,
});
assert.deepEqual(
  {
    multiplier: zeroSellDecision.multiplier,
    repetitions: zeroSellDecision.repetitions,
  },
  { multiplier: 0, repetitions: 1 },
);
assert.equal(
  planMarketBuy({
    index: 0,
    resourceId: "Iron",
    eligible: true,
    autoBuyEnabled: true,
    storageRatio: 0,
    autoBuyRatio: 1,
    moneyDemanded: true,
    moneyCurrent: 100,
    minimumMoneyAllowed: 0,
    unitPrice: 1,
    currentQuantity: 0,
    maxQuantity: 100,
    maximumMultiplier: 10,
  }),
  null,
);

console.log("Market domain policy tests passed");
