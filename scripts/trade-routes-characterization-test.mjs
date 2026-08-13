import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

function jquery() {
  return { ready() {} };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;
const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
});

assert.equal(typeof hooks.adjustTradeRoutes, "function");
assert.equal(typeof hooks.setTradeRoutesTestContext, "function");

function makeResource(id, options) {
  return {
    id,
    name: id,
    tradeRoutes: options.tradeRoutes ?? 0,
    autoTradeBuyEnabled: options.buy ?? false,
    autoTradeSellEnabled: options.sell ?? false,
    usefulRatio: options.usefulRatio ?? 0,
    storageRatio: options.storageRatio ?? 0,
    tradeSellPrice: options.sellPrice ?? 0,
    tradeBuyPrice: options.buyPrice ?? 0,
    rateOfChange: options.rate ?? 0,
    tradeRouteQuantity: options.qty ?? 1,
    autoTradeWeighting: options.weight ?? 1,
    autoTradePriority: options.priority ?? 0,
    _demanded: options.demanded ?? false,
    isRoutesUnlocked: () => options.locked !== true,
    isDemanded() {
      return this._demanded;
    },
  };
}

function runScenario({
  settings,
  resources,
  priorityList,
  maxTradeRoutes,
  race = {},
}) {
  const calls = [];
  const MarketManager = {
    priorityList,
    getImportRouteCap: () => 100,
    getExportRouteCap: () => 100,
    getMaxTradeRoutes: () => [maxTradeRoutes, 0],
    zeroTradeRoutes(resource) {
      calls.push(["zero", resource.id]);
    },
    addTradeRoutes(resource, count) {
      calls.push(["add", resource.id, count]);
    },
    removeTradeRoutes(resource, count) {
      calls.push(["remove", resource.id, count]);
    },
  };
  const game = { global: { race } };
  hooks.setTradeRoutesTestContext({ settings, game, resources, MarketManager });
  hooks.adjustTradeRoutes();
  return { calls, money: resources.Money.rateOfChange };
}

const baseSettings = {
  tradeRouteSellExcess: false,
  tradeRouteMinimumMoneyPerSecond: 0,
  tradeRouteMinimumMoneyPercentage: 0,
  inflationChallengeAssist: false,
};

// Scenario: sell excess Iron (storage full), buy priority Copper down to the
// money floor, then apply the towards-zero and remainder adjustment passes.
const iron = makeResource("Iron", {
  sell: true,
  storageRatio: 1,
  sellPrice: 8,
  rate: 30,
  qty: 10,
});
const copper = makeResource("Copper", {
  buy: true,
  priority: 50,
  buyPrice: 5,
  storageRatio: 0,
});
const money = {
  id: "Money",
  name: "Money",
  rateOfChange: 0,
  maxQuantity: 1_000_000_000,
  currentQuantity: 0,
  isDemanded: () => false,
};

const result = runScenario({
  settings: { ...baseSettings },
  resources: { Iron: iron, Copper: copper, Money: money },
  priorityList: [iron, copper],
  maxTradeRoutes: 10,
});

assert.deepEqual(result.calls, [
  ["remove", "Iron", 3],
  ["add", "Copper", 4],
]);
assert.equal(result.money, 4);

// Scenario B: a resource holding stale routes it no longer qualifies for is
// zeroed out (required stays 0 while it still has live trade routes).
const tin = makeResource("Tin", {
  sell: true,
  storageRatio: 0.5,
  tradeRoutes: 3,
});
const moneyB = {
  id: "Money",
  name: "Money",
  rateOfChange: 0,
  maxQuantity: 1_000_000_000,
  currentQuantity: 0,
  isDemanded: () => false,
};
const resultB = runScenario({
  settings: { ...baseSettings },
  resources: { Tin: tin, Money: moneyB },
  priorityList: [tin],
  maxTradeRoutes: 10,
});
assert.deepEqual(resultB.calls, [["zero", "Tin"]]);
assert.equal(resultB.money, 0);

// Scenario C: Banana Republic sells only a single resource (one trade route),
// so the lower-priority sellable is left at zero even with routes to spare.
const gold = makeResource("Gold", {
  sell: true,
  storageRatio: 1,
  sellPrice: 10,
  rate: 100,
  qty: 10,
});
const silver = makeResource("Silver", {
  sell: true,
  storageRatio: 1,
  sellPrice: 5,
  rate: 100,
  qty: 10,
});
const moneyC = {
  id: "Money",
  name: "Money",
  rateOfChange: 0,
  maxQuantity: 1_000_000_000,
  currentQuantity: 0,
  isDemanded: () => false,
};
const resultC = runScenario({
  settings: { ...baseSettings },
  resources: { Gold: gold, Silver: silver, Money: moneyC },
  priorityList: [gold, silver],
  maxTradeRoutes: 100,
  race: { banana: true },
});
assert.deepEqual(resultC.calls, [["remove", "Gold", 10]]);
assert.equal(resultC.money, 100);

// Scenario D: custom priorities below -1 must remain eligible after the -1
// supplementary group is merged into the highest remaining group.
const supplementary = makeResource("Supplementary", {
  buy: true,
  priority: -1,
});
const lowerPriority = makeResource("LowerPriority", {
  buy: true,
  priority: -2,
});
const moneyD = {
  id: "Money",
  name: "Money",
  rateOfChange: 0,
  maxQuantity: 1_000_000_000,
  currentQuantity: 0,
  isDemanded: () => false,
};
const resultD = runScenario({
  settings: { ...baseSettings },
  resources: {
    Supplementary: supplementary,
    LowerPriority: lowerPriority,
    Money: moneyD,
  },
  priorityList: [supplementary, lowerPriority],
  maxTradeRoutes: 2,
});
assert.deepEqual(resultD.calls, [
  ["add", "Supplementary", 1],
  ["add", "LowerPriority", 1],
]);
assert.equal(resultD.money, 0);

console.log("Trade routes bundled characterization tests passed");
