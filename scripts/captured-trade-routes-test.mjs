import assert from "node:assert/strict";

import { createCapturedTradeRoutes } from "../src/adapters/evolve/economy/market/captured-trade-routes.ts";

const root = {
  race: { governor: { g: { bg: "none" } } },
  tech: { trade: 1, currency: 4 },
  city: { market: { mtrade: 5, trade: 0 } },
  resource: {
    Money: { amount: 100, max: 1000, diff: 10 },
    Iron: {
      display: true,
      trade: 0,
      value: 10,
      amount: 100,
      max: 100,
      diff: 5,
    },
  },
};
const calls = [];
const controls = new Map([
  [
    "market-Iron",
    {
      elementId: "market-Iron",
      generation: 1,
      methods: ["autoBuy", "autoSell", "zero"],
    },
  ],
]);
const registry = {
  resolve: (id) => controls.get(id),
  capturedElementIds: () => [...controls.keys()],
  invoke: (_handle, method, args = []) => {
    const id = args[0];
    calls.push([method, id]);
    const resource = root.resource[id];
    if (method === "zero") {
      root.city.market.trade -= Math.abs(resource.trade);
      resource.trade = 0;
    } else if (
      method === "autoSell" &&
      resource.trade <= 0 &&
      root.city.market.trade < root.city.market.mtrade
    ) {
      resource.trade -= 1;
      root.city.market.trade += 1;
    } else if (
      method === "autoBuy" &&
      resource.trade >= 0 &&
      root.city.market.trade < root.city.market.mtrade
    ) {
      resource.trade += 1;
      root.city.market.trade += 1;
    } else if (method === "autoSell") {
      resource.trade -= 1;
      root.city.market.trade -= 1;
    } else if (method === "autoBuy") {
      resource.trade += 1;
      root.city.market.trade -= 1;
    }
    return { ok: true, value: undefined };
  },
};

const routes = createCapturedTradeRoutes({
  rootState: { readRoot: () => root },
  controls: registry,
  readSettings: () => ({
    tradeRouteSellExcess: true,
    tradeRouteMinimumMoneyPerSecond: 0,
    tradeRouteMinimumMoneyPercentage: 0,
    res_trade_sell_Iron: true,
    res_trade_buy_Iron: false,
    res_trade_w_Iron: 1,
    res_trade_p_Iron: 1,
    res_buy_p_Iron: 1,
  }),
  readDemand: () => ({
    isDemanded: () => false,
    storageRequired: () => 1,
  }),
});

routes.adjust();
assert.equal(root.resource.Iron.trade, -5);
assert.equal(root.city.market.trade, 5);
assert.equal(calls.length, 5);
assert.deepEqual(calls[0], ["autoSell", "Iron"]);

root.resource.Iron.trade = 0;
root.city.market.trade = 0;
const staleRoot = { ...root };
const staleRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => staleRoot },
  controls: registry,
  readSettings: () => ({}),
});
staleRoutes.adjust();
assert.equal(root.resource.Iron.trade, 0);

console.log("captured trade routes tests passed");
