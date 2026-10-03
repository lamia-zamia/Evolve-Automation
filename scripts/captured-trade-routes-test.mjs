import assert from "node:assert/strict";

import { createCapturedTradeRoutes } from "../src/adapters/evolve/economy/market/captured-trade-routes.ts";
import {
  readCapturedTradeQuote,
  readCapturedRegionalVolume,
} from "../src/adapters/evolve/economy/market/captured-trade-quote.ts";
import { planRegionalTradeRoutes } from "../src/domain/economy/market/regional-trade-routes.ts";

const root = {
  race: { governor: { g: { bg: "none" } } },
  tech: { trade: 1, currency: 4 },
  city: { market: { mtrade: 5, trade: 0 } },
  resource: {
    Money: { amount: 100, max: 1000, diff: 100 },
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
let rounded = [];
const mechanics = {
  readRoundedValues(read) {
    rounded = [];
    read();
    return { kind: "value", value: rounded };
  },
};
const observation = (receiver, digits) => ({
  receiver,
  digits,
  text: receiver.toFixed(digits),
});
let settings = {
  tradeRouteSellExcess: true,
  tradeRouteMinimumMoneyPerSecond: 0,
  tradeRouteMinimumMoneyPercentage: 0,
  res_trade_sell_Iron: true,
  res_trade_buy_Iron: false,
  res_trade_w_Iron: 1,
  res_trade_p_Iron: 1,
  res_buy_p_Iron: 1,
};
const controls = new Map([
  [
    "market-Iron",
    {
      elementId: "market-Iron",
      generation: 1,
      methods: ["autoBuy", "autoSell", "zero", "aSell", "aBuy"],
    },
  ],
]);
const registry = {
  resolve: (id) => controls.get(id),
  capturedElementIds: () => [...controls.keys()],
  invoke: (_handle, method, args = []) => {
    if (method === "aSell") {
      rounded = [observation(10, 1), observation(1.2345, 3)];
      return { ok: true, value: "localized" };
    }
    if (method === "aBuy") {
      rounded = [observation(2.3456, 3), observation(12, 1)];
      return { ok: true, value: "localized" };
    }
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
  mechanics,
  readSettings: () => settings,
  readDemand: () => ({
    isDemanded: () => false,
    storageRequired: () => 1,
  }),
});

routes.adjust();
assert.equal(root.resource.Iron.trade, -4);
assert.equal(root.city.market.trade, 4);
assert.equal(calls.length, 4);
assert.deepEqual(calls[0], ["autoSell", "Iron"]);

root.resource.Iron.amount = 0;
calls.length = 0;
routes.adjust();
assert.equal(root.resource.Iron.trade, 0);
assert.equal(root.city.market.trade, 0);
assert.deepEqual(calls, [["zero", "Iron"]]);

root.resource.Iron.trade = 0;
root.resource.Iron.amount = 0;
root.city.market.trade = 0;
root.resource.Money.amount = 249999998800;
root.resource.Money.max = 300000000000;
root.resource.Money.diff = 100;
root.race.universe = "standard";
root.race.inflation = 10;
root.stats = { achieve: { wheelbarrow: { l: 0 } } };
settings = {
  ...settings,
  res_trade_sell_Iron: false,
  res_trade_buy_Iron: true,
  inflationChallengeAssist: true,
  inflationChallengeSaveMinutes: 2,
};
calls.length = 0;
routes.adjust();
assert.deepEqual(calls, []);

settings = { ...settings, inflationChallengeAssist: "invalid" };
routes.adjust();
assert.equal(calls[0][0], "autoBuy");

root.resource.Iron.trade = 0;
root.city.market.trade = 0;
root.stats.achieve.wheelbarrow = 7;
settings = { ...settings, inflationChallengeAssist: true };
calls.length = 0;
routes.adjust();
assert.equal(calls[0][0], "autoBuy");

root.resource.Iron.trade = 0;
root.city.market.trade = 0;
const staleRoot = { ...root };
const staleRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => staleRoot },
  controls: registry,
  mechanics,
  readSettings: () => ({}),
});
staleRoutes.adjust();
assert.equal(root.resource.Iron.trade, 0);

const regionalPlan = planRegionalTradeRoutes({
  resources: [
    {
      resourceId: "Food",
      pool: "spc_home",
      rateOfChange: 30,
      currentRoutes: 1,
      volume: 20,
      priority: 0,
    },
    {
      resourceId: "Iron",
      pool: "spc_moon",
      rateOfChange: -25,
      currentRoutes: 0,
      volume: 10,
      priority: 5,
    },
  ],
  maximumRoutes: 2,
  money: 100,
  reserve: 0,
  margin: 0,
});
assert.deepEqual(regionalPlan.operations, [
  { kind: "remove", resourceId: "Food", pool: "spc_home", count: 1 },
  { kind: "add", resourceId: "Iron", pool: "spc_moon", count: 2 },
]);

const regionalRoot = {
  race: {
    governor: {
      g: { bg: "none" },
      config: { trader: { margin: 0, reserve: 0 } },
    },
  },
  tech: { shadow: 5 },
  city: {
    market: {
      mtrade: 2,
      trade: 1,
      bmZone: "spc_home",
      bm: { spc_home: { Food: 1 }, spc_moon: {} },
    },
  },
  resource: {
    Money: { amount: 100, max: 1000, diff: 100, display: true },
    Food: {
      display: true,
      regDiff: { spc_home: 30, spc_moon: 0 },
    },
    Iron: {
      display: true,
      regDiff: { spc_home: 0, spc_moon: -25 },
    },
  },
};
const regionalCalls = [];
let regionalIronVolume = 10;
const regionalControls = new Map(
  ["Food", "Iron"].map((id) => [
    `bm-${id}`,
    {
      elementId: `bm-${id}`,
      generation: 1,
      methods: ["more", "less", "none", "volume"],
    },
  ]),
);
const regionalRegistry = {
  resolve: (id) => regionalControls.get(id),
  capturedElementIds: () => [...regionalControls.keys()],
  invoke: (_handle, method) => {
    if (method === "volume") {
      rounded = [
        observation(
          _handle.elementId === "bm-Food"
            ? 20
            : _handle.elementId === "bm-Iron"
              ? regionalIronVolume
              : 20,
          2,
        ),
      ];
      return { ok: true, value: "localized" };
    }
    regionalCalls.push([method, regionalRoot.city.market.bmZone]);
    const pool = regionalRoot.city.market.bmZone;
    const resourceId = _handle.elementId.slice(3);
    const poolLedger = (regionalRoot.city.market.bm[pool] ??= {});
    const current = poolLedger[resourceId] ?? 0;
    if (method === "more") poolLedger[resourceId] = current + 1;
    if (method === "less") {
      if (current <= 1) delete poolLedger[resourceId];
      else poolLedger[resourceId] = current - 1;
    }
    return { ok: true, value: undefined };
  },
};
const regionalRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => regionalRoot },
  controls: regionalRegistry,
  mechanics,
  readSettings: () => ({}),
});
regionalRoutes.adjust();
assert.deepEqual(regionalCalls, [
  ["less", "spc_home"],
  ["more", "spc_moon"],
  ["more", "spc_moon"],
]);
assert.equal(regionalRoot.city.market.bm.spc_home.Food, undefined);
assert.equal(regionalRoot.city.market.bm.spc_moon.Iron, 2);
assert.equal(regionalRoot.city.market.bmZone, "spc_home");
regionalRoot.city.market.bm = { spc_home: {}, spc_moon: {} };
regionalRoot.city.market.trade = 0;
regionalRoot.resource.Food.regDiff.spc_home = 0;
regionalRoot.race.persuasive = 1;
regionalIronVolume = 30;
regionalCalls.length = 0;
regionalRoutes.adjust();
assert.equal(regionalRoot.city.market.bm.spc_moon.Iron, 1);
regionalRoot.city.market.bm = { spc_home: {}, spc_moon: {} };
regionalRoot.city.market.trade = 0;
regionalRoot.resource.Iron.regDiff.spc_moon = 0;
regionalRoot.resource.Novelium = { display: true, regDiff: { spc_moon: -40 } };
regionalControls.set("bm-Novelium", {
  elementId: "bm-Novelium",
  generation: 1,
  methods: ["more", "less", "volume"],
});
regionalCalls.length = 0;
regionalRoutes.adjust();
assert.equal(regionalRoot.city.market.bm.spc_moon.Novelium, 2);

function oracleFixture() {
  let currentRoot = {};
  let currentControl = {
    elementId: "market-Iron",
    generation: 1,
    methods: ["aSell", "aBuy", "volume"],
  };
  let sell = [observation(7.36, 1), observation(1.23456, 3)];
  let buy = [observation(2.34567, 3), observation(12.36, 1)];
  let volume = [observation(10.4567, 2)];
  let behavior = "ok";
  const rootState = { readRoot: () => currentRoot };
  const controls = {
    resolve: () => currentControl,
    invoke: (_control, method) => {
      if (behavior === "throw") throw new Error("native failed");
      if (behavior === "reject") return { ok: false, reason: "threw" };
      rounded = method === "aSell" ? sell : method === "aBuy" ? buy : volume;
      if (behavior === "root") currentRoot = {};
      if (behavior === "generation")
        currentControl = { ...currentControl, generation: 2 };
      return { ok: true, value: "localized prose" };
    },
  };
  const probe = {
    readRoundedValues(read) {
      rounded = [];
      try {
        read();
      } catch {
        return { kind: "invalid" };
      }
      return { kind: "value", value: rounded };
    },
  };
  return {
    quote: () =>
      readCapturedTradeQuote(
        currentRoot,
        "Iron",
        currentControl,
        rootState,
        controls,
        probe,
      ),
    regional: () =>
      readCapturedRegionalVolume(
        currentRoot,
        "Iron",
        currentControl,
        rootState,
        controls,
        probe,
      ),
    setSell: (values) => {
      sell = values;
    },
    setBuy: (values) => {
      buy = values;
    },
    setVolume: (values) => {
      volume = values;
    },
    setBehavior: (value) => {
      behavior = value;
    },
  };
}

const native = oracleFixture();
assert.deepEqual(native.quote(), {
  sellPrice: 7.4,
  sellQuantity: 1.23456,
  buyPrice: 12.4,
  buyVolume: 2.34567,
});
native.setSell([
  observation(999, 1),
  observation(888, 3),
  observation(7.36, 1),
  observation(1.23456, 3),
]);
assert.equal(native.quote(), undefined); // Two terminal-shaped pairs are ambiguous.
native.setSell([
  observation(888, 2),
  observation(7.36, 1),
  observation(1.23456, 3),
]);
assert.equal(native.quote()?.sellPrice, 7.4); // An unrelated nested rounding is harmless.
native.setBuy([
  observation(2.34567, 3),
  observation(12.36, 1),
  observation(77, 2),
]);
assert.equal(native.quote(), undefined);
native.setBuy([observation(Number.NaN, 3), observation(12.36, 1)]);
assert.equal(native.quote(), undefined);
native.setBuy([
  observation(2.34567, 3),
  { receiver: 12.36, digits: 1, text: "bad" },
]);
assert.equal(native.quote(), undefined);
native.setBuy([observation(2.34567, 3), observation(12.36, 1)]);
assert.equal(native.regional(), 10.4567);
native.setVolume([]);
assert.equal(native.regional(), undefined);
native.setVolume([{ receiver: 10, digits: 2, text: "bad" }]);
assert.equal(native.regional(), undefined);
for (const failure of ["reject", "throw", "root", "generation"]) {
  const broken = oracleFixture();
  broken.setBehavior(failure);
  assert.equal(broken.quote(), undefined, failure);
  const brokenVolume = oracleFixture();
  brokenVolume.setBehavior(failure);
  assert.equal(brokenVolume.regional(), undefined, failure);
}

// Native answers alone change the planner's export count, even with formerly bailed-out traits.
root.race.cunning = 1;
root.resource.Money.amount = 100;
root.resource.Iron.amount = 100;
root.resource.Iron.trade = 0;
root.city.market.trade = 0;
settings = {
  ...settings,
  res_trade_sell_Iron: true,
  res_trade_buy_Iron: false,
  inflationChallengeAssist: false,
};
registry.invoke = (_handle, method, args = []) => {
  if (method === "aSell") {
    rounded = [observation(10, 1), observation(10, 3)];
    return { ok: true };
  }
  if (method === "aBuy") {
    rounded = [observation(2, 3), observation(12, 1)];
    return { ok: true };
  }
  const resource = root.resource[args[0]];
  calls.push([method, args[0]]);
  if (method === "autoSell") {
    resource.trade -= 1;
    root.city.market.trade += 1;
  }
  return { ok: true };
};
calls.length = 0;
routes.adjust();
assert.equal(root.resource.Iron.trade, 0);
assert.deepEqual(calls, []);
root.race.psychic_cash = 1;
registry.invoke = (_handle, method, args = []) => {
  if (method === "aSell") {
    rounded = [observation(10, 1), observation(0.5, 3)];
    return { ok: true };
  }
  if (method === "aBuy") {
    rounded = [observation(2, 3), observation(12, 1)];
    return { ok: true };
  }
  calls.push([method, args[0]]);
  if (method === "autoSell") {
    root.resource.Iron.trade -= 1;
    root.city.market.trade += 1;
  }
  return { ok: true };
};
routes.adjust();
assert.equal(root.resource.Iron.trade, -5);

console.log("captured trade routes tests passed");
