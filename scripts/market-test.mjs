import assert from "node:assert/strict";

import { runMarketAutomation } from "../src/application/market.ts";
import {
  createMarketCommandExecutor,
  createMarketReader,
} from "../src/adapters/evolve/economy/market/market.ts";
import {
  planMarketBuy,
  planMarketSell,
} from "../src/domain/economy/market/market.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const money = {
    maxQuantity: scenario.moneyMax ?? 1_000,
    currentQuantity: scenario.moneyCurrent ?? 0,
    isDemanded: () => scenario.moneyDemanded ?? false,
  };
  const definitions = scenario.resources ?? [];
  const priorityList = definitions.map((definition) => {
    let quantity = definition.currentQuantity ?? 0;
    const maximum = definition.maxQuantity ?? 100;
    const resource = {
      id: definition.id,
      is: { tradable: definition.tradable ?? true },
      isUnlocked: () => definition.unlocked ?? true,
      autoSellEnabled: definition.autoSellEnabled ?? false,
      autoSellRatio: definition.autoSellRatio ?? 0.8,
      autoBuyEnabled: definition.autoBuyEnabled ?? false,
      autoBuyRatio: definition.autoBuyRatio ?? 0.5,
      maxQuantity: maximum,
      income: definition.income ?? 0,
      get storageRatio() {
        return definition.storageRatio ?? quantity / maximum;
      },
      get currentQuantity() {
        return quantity;
      },
      set currentQuantity(value) {
        quantity = value;
      },
      sellPrice: definition.sellPrice ?? 1,
      buyPrice: definition.buyPrice ?? 1,
      marketUnlocked: definition.marketUnlocked ?? true,
    };
    return resource;
  });
  const manager = {
    priorityList,
    multiplier: scenario.originalMultiplier ?? 1,
    isUnlocked: () => scenario.unlocked ?? true,
    isBuySellUnlocked: (resource) => resource.marketUnlocked,
    getMaxMultiplier: () => scenario.maximumMultiplier ?? 100,
    getUnitSellPrice: (resource) => resource.sellPrice,
    getUnitBuyPrice: (resource) => resource.buyPrice,
    setMultiplier(value) {
      trace.managerCall("setMultiplier", { value });
      this.multiplier = Math.min(
        Math.max(1, value),
        scenario.maximumMultiplier ?? 100,
      );
      trace.stateChange("market.multiplier", { value: this.multiplier });
    },
    sell(resource) {
      trace.managerCall("sell", {
        resourceId: resource.id,
        multiplier: this.multiplier,
      });
      if (resource.currentQuantity < this.multiplier) return false;
      money.currentQuantity += this.multiplier * resource.sellPrice;
      resource.currentQuantity -= this.multiplier;
      trace.command("market-sell", {
        resourceId: resource.id,
        multiplier: this.multiplier,
      });
      trace.stateChange("market.balance", {
        resourceId: resource.id,
        resource: resource.currentQuantity,
        money: money.currentQuantity,
      });
    },
    buy(resource) {
      trace.managerCall("buy", {
        resourceId: resource.id,
        multiplier: this.multiplier,
      });
      const price = this.multiplier * resource.buyPrice;
      if (money.currentQuantity < price) return false;
      money.currentQuantity -= price;
      resource.currentQuantity += this.multiplier;
      trace.command("market-buy", {
        resourceId: resource.id,
        multiplier: this.multiplier,
      });
      trace.stateChange("market.balance", {
        resourceId: resource.id,
        resource: resource.currentQuantity,
        money: money.currentQuantity,
      });
    },
  };
  return {
    trace,
    manager,
    resources: { Money: money },
    game: { global: { race: { no_trade: scenario.noTrade ?? false } } },
    settings: {
      minimumMoneyPercentage: scenario.minimumMoneyPercentage ?? 0,
      minimumMoney: scenario.minimumMoney ?? 0,
    },
    finalState: () => ({
      money: money.currentQuantity,
      multiplier: manager.multiplier,
      resources: priorityList.map((resource) => [
        resource.id,
        resource.currentQuantity,
      ]),
    }),
  };
}

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

assert.deepEqual(
  createMarketReader({
    getManager: () => ({ isUnlocked: () => false }),
    getGame: () => assert.fail("locked market read game"),
    getResources: () => assert.fail("locked market read resources"),
    getSettings: () => assert.fail("locked market read settings"),
    ticksPerSecond: () => 10,
  }).readGate(),
  { unlocked: false, noTrade: false },
);

const malformedMaximumReader = createMarketReader({
  getManager: () => ({
    isUnlocked: () => true,
    multiplier: 1,
    getMaxMultiplier: () => 0,
    priorityList: [],
  }),
  getGame: () => ({ global: { race: {} } }),
  getResources: () => ({ Money: { maxQuantity: 100 } }),
  getSettings: () => ({ minimumMoneyPercentage: 0, minimumMoney: 0 }),
  ticksPerSecond: () => 10,
});
malformedMaximumReader.readGate();
assert.throws(
  () => malformedMaximumReader.readSession(),
  /positive safe integer/,
);

const orderedReaderFixture = createFixture({
  resources: [{ id: "Iron" }],
});
const orderedReader = createMarketReader({
  getManager: () => orderedReaderFixture.manager,
  getGame: () => orderedReaderFixture.game,
  getResources: () => orderedReaderFixture.resources,
  getSettings: () => orderedReaderFixture.settings,
  ticksPerSecond: () => 10,
});
orderedReader.readGate();
const orderedSession = orderedReader.readSession();
assert.throws(
  () => orderedReader.readBuy(0, orderedSession.minimumMoneyAllowed),
  /must follow its sell candidate/,
);

const staleFixture = createFixture({
  moneyCurrent: 10,
  resources: [{ id: "Iron", currentQuantity: 10 }],
});
const staleOutcome = createMarketCommandExecutor({
  getManager: () => staleFixture.manager,
  getResources: () => staleFixture.resources,
}).execute({
  kind: "trade",
  side: "sell",
  index: 0,
  resourceId: "Iron",
  expectedMoneyCurrent: 0,
  expectedResourceCurrent: 10,
  expectedUnitPrice: 1,
  multiplier: 1,
  repetitions: 1,
});
assert.equal(staleOutcome.status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), []);

const preflightFixture = createFixture({
  moneyCurrent: 10,
  resources: [{ id: "Iron", currentQuantity: 10 }],
});
delete preflightFixture.manager.sell;
assert.throws(
  () =>
    createMarketCommandExecutor({
      getManager: () => preflightFixture.manager,
      getResources: () => preflightFixture.resources,
    }).execute({
      kind: "trade",
      side: "sell",
      index: 0,
      resourceId: "Iron",
      expectedMoneyCurrent: 10,
      expectedResourceCurrent: 10,
      expectedUnitPrice: 1,
      multiplier: 1,
      repetitions: 1,
    }),
  /MarketManager\.sell must be a function/,
);
assert.deepEqual(preflightFixture.trace.snapshot(), []);

assert.equal(
  createMarketCommandExecutor({
    getManager: () => assert.fail("invalid command read manager"),
    getResources: () => ({}),
  }).execute({
    kind: "trade",
    side: "buy",
    index: 0,
    resourceId: "Iron",
    expectedMoneyCurrent: 0,
    expectedResourceCurrent: 0,
    expectedUnitPrice: 1,
    multiplier: 1,
    repetitions: 0,
  }).status,
  "rejected",
);

const failureCommands = [];
const failureOutcome = runMarketAutomation(
  {
    reader: {
      readGate: () => ({ unlocked: true, noTrade: false }),
      readSession: () => ({
        originalMultiplier: 7,
        maximumMultiplier: 10,
        minimumMoneyAllowed: 0,
      }),
      readSell: (index) =>
        index === 0
          ? {
              index: 0,
              resourceId: "Iron",
              eligible: true,
              autoSellEnabled: true,
              ignoreSellRatio: false,
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
            }
          : null,
      readBuy: () => assert.fail("failed sell proceeded to buy"),
    },
    executor: {
      execute: (decision) => {
        failureCommands.push(decision);
        return decision.kind === "trade"
          ? { status: "stale", failure: { code: "test", message: "test" } }
          : { status: "succeeded" };
      },
    },
    tradeRoutes: { adjust() {} },
  },
  false,
  false,
);
assert.equal(failureOutcome.status, "stale");
assert.equal(failureCommands.at(-1).kind, "restore-multiplier");
assert.equal(failureCommands.at(-1).multiplier, 7);

console.log("Market domain, adapter, and application tests passed");
