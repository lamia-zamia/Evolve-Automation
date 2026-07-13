import assert from "node:assert/strict";

import { createTradeRoutes } from "../src/planning/trade-routes.ts";

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
    isRoutesUnlocked: () => true,
    isDemanded() {
      return this._demanded;
    },
  };
}

const baseSettings = {
  tradeRouteSellExcess: false,
  tradeRouteMinimumMoneyPerSecond: 0,
  tradeRouteMinimumMoneyPercentage: 0,
};

// Mutable context observed through live getters.
let settings = { ...baseSettings };
let resources = {};
let market = null;
let governor = "none";
let saveInflation = false;
let governorCalls = 0;

const { adjustTradeRoutes } = createTradeRoutes({
  getSettings: () => settings,
  getGame: () => ({ global: { race: {} } }),
  getResources: () => resources,
  getMarketManager: () => market,
  getGovernor: () => {
    governorCalls++;
    return governor;
  },
  inflationChallengeShouldSaveMoney: () => saveInflation,
});

function buildMarket(priorityList, maxTradeRoutes) {
  const calls = [];
  return {
    calls,
    manager: {
      priorityList,
      getImportRouteCap: () => 100,
      getExportRouteCap: () => 100,
      getMaxTradeRoutes: () => [maxTradeRoutes, 0],
      zeroTradeRoutes: (r) => calls.push(["zero", r.id]),
      addTradeRoutes: (r, n) => calls.push(["add", r.id, n]),
      removeTradeRoutes: (r, n) => calls.push(["remove", r.id, n]),
    },
  };
}

// Scenario 1: whole-context replacement is observed; matches the bundled trace.
{
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
  });
  const money = {
    id: "Money",
    rateOfChange: 0,
    maxQuantity: 1e9,
    currentQuantity: 0,
    isDemanded: () => false,
  };
  resources = { Iron: iron, Copper: copper, Money: money };
  const { calls, manager } = buildMarket([iron, copper], 10);
  market = manager;
  governorCalls = 0;
  adjustTradeRoutes();
  assert.deepEqual(calls, [
    ["remove", "Iron", 3],
    ["add", "Copper", 4],
  ]);
  assert.equal(money.rateOfChange, 4);
  assert.ok(governorCalls > 0, "getGovernor dependency should be consulted");
}

// Scenario 2: inflation money-saving skips all buying but still sells excess.
{
  saveInflation = true;
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
  });
  const money = {
    id: "Money",
    rateOfChange: 0,
    maxQuantity: 1e9,
    currentQuantity: 0,
    isDemanded: () => false,
  };
  resources = { Iron: iron, Copper: copper, Money: money };
  const { calls, manager } = buildMarket([iron, copper], 10);
  market = manager;
  adjustTradeRoutes();
  // Iron still sold, Copper never bought (required stays 0, so no call for it).
  assert.deepEqual(calls, [["remove", "Iron", 3]]);
  assert.equal(money.rateOfChange, 24);
  saveInflation = false;
}

console.log("Trade routes module tests passed");
