import assert from "node:assert/strict";

import { runMarketAutomation } from "../src/application/market.ts";
import {
  createMarketCommandExecutor,
  createMarketReader,
} from "../src/adapters/evolve/market.ts";
import { planMarketBuy, planMarketSell } from "../src/domain/market.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

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

// Exact copy of the deleted factory, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const MarketManager = fixture.manager;
  const game = fixture.game;
  const resources = fixture.resources;
  const settings = fixture.settings;
  if (!MarketManager.isUnlocked()) {
    return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
  }
  fixture.trace.managerCall("adjustTradeRoutes", {});
  if (game.global.race.no_trade) {
    return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
  }
  const minimumMoneyAllowed = Math.max(
    (resources.Money.maxQuantity * settings.minimumMoneyPercentage) / 100,
    settings.minimumMoney,
  );
  const currentMultiplier = MarketManager.multiplier;
  const maxMultiplier = MarketManager.getMaxMultiplier();
  for (const resource of MarketManager.priorityList) {
    if (
      !resource.is.tradable ||
      !resource.isUnlocked() ||
      !MarketManager.isBuySellUnlocked(resource)
    ) {
      continue;
    }
    if (
      resource.autoSellEnabled &&
      (scenario.ignoreSellRatio ||
        resource.storageRatio >= resource.autoSellRatio)
    ) {
      const maxAllowedTotalSellPrice =
        resources.Money.maxQuantity - resources.Money.currentQuantity;
      const unitSellPrice = MarketManager.getUnitSellPrice(resource);
      let maxAllowedUnits = Math.floor(
        maxAllowedTotalSellPrice / unitSellPrice,
      );
      if (resource.storageRatio > resource.autoSellRatio) {
        maxAllowedUnits = Math.min(
          maxAllowedUnits,
          Math.floor(
            resource.currentQuantity -
              resource.autoSellRatio * resource.maxQuantity,
          ),
        );
      } else {
        maxAllowedUnits = Math.min(
          maxAllowedUnits,
          Math.floor((resource.income * 2) / (scenario.ticks ?? 10)),
        );
      }
      if (maxAllowedUnits <= maxMultiplier) {
        MarketManager.setMultiplier(maxAllowedUnits);
        MarketManager.sell(resource);
      } else {
        const counter = Math.min(
          5,
          Math.floor(maxAllowedUnits / maxMultiplier),
        );
        MarketManager.setMultiplier(maxMultiplier);
        for (let index = 0; index < counter; index++) {
          MarketManager.sell(resource);
        }
      }
    }
    if (scenario.bulkSell === true) continue;
    if (
      resource.autoBuyEnabled === true &&
      resource.storageRatio < resource.autoBuyRatio &&
      !resources.Money.isDemanded()
    ) {
      const storableAmount = Math.floor(
        (resource.autoBuyRatio - resource.storageRatio) * resource.maxQuantity,
      );
      const affordableAmount = Math.floor(
        (resources.Money.currentQuantity - minimumMoneyAllowed) /
          MarketManager.getUnitBuyPrice(resource),
      );
      const maxAllowedUnits = Math.min(storableAmount, affordableAmount);
      if (maxAllowedUnits > 0) {
        if (maxAllowedUnits <= maxMultiplier) {
          MarketManager.setMultiplier(maxAllowedUnits);
          MarketManager.buy(resource);
        } else {
          const counter = Math.min(
            5,
            Math.floor(maxAllowedUnits / maxMultiplier),
          );
          MarketManager.setMultiplier(maxMultiplier);
          for (let index = 0; index < counter; index++) {
            MarketManager.buy(resource);
          }
        }
      }
    }
  }
  MarketManager.setMultiplier(currentMultiplier);
  return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const outcome = runMarketAutomation(
    {
      reader: createMarketReader({
        getManager: () => fixture.manager,
        getGame: () => fixture.game,
        getResources: () => fixture.resources,
        getSettings: () => fixture.settings,
        ticksPerSecond: () => scenario.ticks ?? 10,
      }),
      executor: createMarketCommandExecutor({
        getManager: () => fixture.manager,
        getResources: () => fixture.resources,
      }),
      tradeRoutes: {
        adjust: () => fixture.trace.managerCall("adjustTradeRoutes", {}),
      },
    },
    scenario.bulkSell,
    scenario.ignoreSellRatio,
  );
  assert.equal(outcome.status, "succeeded");
  return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
}

const scenarios = [
  { name: "locked market is inert", unlocked: false },
  { name: "no-trade race adjusts routes then stops", noTrade: true },
  {
    name: "ineligible resources are skipped before final reset",
    resources: [
      { id: "Iron", tradable: false, autoSellEnabled: true },
      { id: "Coal", unlocked: false, autoSellEnabled: true },
      { id: "Oil", marketUnlocked: false, autoSellEnabled: true },
    ],
  },
  {
    name: "sell above ratio is bounded by excess storage",
    moneyCurrent: 100,
    resources: [
      {
        id: "Iron",
        currentQuantity: 90,
        autoSellEnabled: true,
        autoSellRatio: 0.7,
        sellPrice: 2,
      },
    ],
  },
  {
    name: "sell at ratio uses two ticks of income",
    ticks: 10,
    resources: [
      {
        id: "Iron",
        currentQuantity: 80,
        storageRatio: 0.8,
        autoSellEnabled: true,
        autoSellRatio: 0.8,
        income: 25,
      },
    ],
  },
  {
    name: "ignore ratio sells income even below threshold",
    ignoreSellRatio: true,
    resources: [
      {
        id: "Iron",
        currentQuantity: 20,
        storageRatio: 0.2,
        autoSellEnabled: true,
        autoSellRatio: 0.8,
        income: 10,
      },
    ],
  },
  {
    name: "zero sell calculation still issues clamped manager trade",
    moneyCurrent: 1_000,
    resources: [
      {
        id: "Iron",
        currentQuantity: 80,
        storageRatio: 0.8,
        autoSellEnabled: true,
        autoSellRatio: 0.8,
        income: 0,
      },
    ],
  },
  {
    name: "large sell is capped at five maximum batches",
    maximumMultiplier: 10,
    moneyMax: 10_000,
    resources: [
      {
        id: "Iron",
        currentQuantity: 500,
        maxQuantity: 500,
        autoSellEnabled: true,
        autoSellRatio: 0,
      },
    ],
  },
  {
    name: "bulk sell skips otherwise eligible buys",
    bulkSell: true,
    moneyCurrent: 500,
    resources: [{ id: "Iron", currentQuantity: 0, autoBuyEnabled: true }],
  },
  {
    name: "buy respects fixed and percentage money reserve",
    moneyCurrent: 500,
    minimumMoneyPercentage: 20,
    minimumMoney: 300,
    resources: [
      {
        id: "Iron",
        currentQuantity: 10,
        autoBuyEnabled: true,
        autoBuyRatio: 0.8,
        buyPrice: 10,
      },
    ],
  },
  {
    name: "large buy is capped at five maximum batches",
    maximumMultiplier: 10,
    moneyCurrent: 5_000,
    moneyMax: 10_000,
    resources: [
      {
        id: "Iron",
        currentQuantity: 0,
        maxQuantity: 1_000,
        autoBuyEnabled: true,
        autoBuyRatio: 1,
      },
    ],
  },
  {
    name: "demanded money suppresses buying",
    moneyCurrent: 500,
    moneyDemanded: true,
    resources: [{ id: "Iron", currentQuantity: 0, autoBuyEnabled: true }],
  },
  {
    name: "buy resamples balances after sell on the same resource",
    moneyCurrent: 100,
    resources: [
      {
        id: "Iron",
        currentQuantity: 80,
        autoSellEnabled: true,
        autoSellRatio: 0.8,
        income: 10,
        sellPrice: 2,
        autoBuyEnabled: true,
        autoBuyRatio: 0.9,
        buyPrice: 1,
      },
    ],
  },
  {
    name: "later resources observe money spent by earlier buys",
    moneyCurrent: 100,
    maximumMultiplier: 50,
    resources: [
      { id: "Iron", currentQuantity: 0, autoBuyEnabled: true, buyPrice: 1 },
      { id: "Coal", currentQuantity: 0, autoBuyEnabled: true, buyPrice: 2 },
    ],
  },
  {
    name: "original multiplier is restored after mixed trades",
    originalMultiplier: 7,
    moneyCurrent: 200,
    resources: [{ id: "Iron", currentQuantity: 0, autoBuyEnabled: true }],
  },
];

for (const scenario of scenarios) {
  const legacy = runLegacy(scenario);
  const modern = runModern(scenario);
  assertEquivalentTraces({
    legacy: legacy.trace,
    modern: modern.trace,
    label: `market parity: ${scenario.name}`,
  });
  assert.deepEqual(modern.state, legacy.state, scenario.name);
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

console.log("Market domain, adapter, application, and parity tests passed");
