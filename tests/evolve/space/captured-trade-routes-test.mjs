import assert from "node:assert/strict";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
const { createCapturedTradeRoutes, createCapturedTradeRoutesTestControl } =
  await import("../../../src/adapters/evolve/economy/market/captured-trade-routes.ts");
delete globalThis.__EA_TEST_SURFACE_ENABLED__;
import {
  readCapturedTradeQuote,
  readCapturedRegionalVolume,
} from "../../../src/adapters/evolve/economy/market/captured-trade-quote.ts";
import { planRegionalTradeRoutes } from "../../../src/domain/economy/market/regional-trade-routes.ts";

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
      rounded = [
        observation(2.3456, 3),
        observation(12, 1),
        observation(12, 2),
      ];
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

function boardSource(gameRoot, controlRegistry, mode) {
  let snapshot;
  const redraw = () => {
    const routeMultiplier = controlRegistry.resolve("marketRouteMultiplier");
    snapshot = {
      root: gameRoot,
      mode,
      epoch: "test",
      rows: controlRegistry
        .capturedElementIds()
        .filter(
          (id) =>
            id.startsWith(mode === "regional" ? "bm-" : "market-") &&
            id !== "market-qty",
        )
        .map((id) => controlRegistry.resolve(id)),
      ...(routeMultiplier === undefined ? {} : { routeMultiplier }),
    };
  };
  redraw();
  return {
    redraw,
    current: () => snapshot,
    isCurrent: (board) =>
      board === snapshot &&
      board.root === gameRoot &&
      board.rows.every(
        (row) =>
          controlRegistry.resolve(row.elementId)?.generation === row.generation,
      ) &&
      (board.routeMultiplier === undefined ||
        controlRegistry.resolve("marketRouteMultiplier")?.generation ===
          board.routeMultiplier.generation),
  };
}
const ordinaryBoard = boardSource(root, registry, "global");
// The regional executor proves native multiplier neutrality per step, so its key state has to carry
// the game's own latch answer. Nothing here observes a keyboard; see captured-route-multiplier-test.mjs
// for the latch semantics themselves.
const neutralKeyState = {
  readPressed: () => false,
  readMultiplierLatch: () => false,
};

const routes = createCapturedTradeRoutes({
  rootState: { readRoot: () => root },
  controls: registry,
  board: ordinaryBoard,
  mechanics,
  keyState: neutralKeyState,
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

root.tech.shadow = 5;
root.race.supplySplit = false;
root.resource.Iron.trade = 0;
root.city.market.trade = 0;
calls.length = 0;
routes.adjust();
assert.equal(
  root.resource.Iron.trade,
  -4,
  "Shadow progression alone keeps ordinary routes active",
);

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
  board: ordinaryBoard,
  mechanics,
  keyState: neutralKeyState,
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
    supplyZones: true,
    supplySplit: true,
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
const regionalControls = new Map([
  ...["Food", "Iron"].map((id) => [
    `bm-${id}`,
    {
      elementId: `bm-${id}`,
      generation: 1,
      methods: ["more", "less", "none", "volume"],
    },
  ]),
  [
    "marketRouteMultiplier",
    {
      elementId: "marketRouteMultiplier",
      generation: 1,
      methods: ["set"],
      data: { multiplier: 1 },
    },
  ],
]);
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
    regionalRoot.city.market.trade += method === "more" ? 1 : -1;
    return { ok: true, value: undefined };
  },
};
const regionalBoard = boardSource(regionalRoot, regionalRegistry, "regional");
const regionalRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => regionalRoot },
  controls: regionalRegistry,
  board: regionalBoard,
  mechanics,
  keyState: neutralKeyState,
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
regionalBoard.redraw();
regionalCalls.length = 0;
regionalRoutes.adjust();
assert.equal(regionalRoot.city.market.bm.spc_moon.Novelium, 2);

regionalRoot.city.market.bm = { spc_home: { Food: 1 }, spc_moon: {} };
regionalRoot.city.market.trade = 1;
regionalRoot.city.market.bmZone = "spc_home";
regionalRoot.resource.Food.regDiff.spc_home = 30;
const normalRegionalInvoke = regionalRegistry.invoke;
regionalRegistry.invoke = (handle, method, args) => {
  const result = normalRegionalInvoke(handle, method, args);
  if (method === "less") regionalRoot.city.market.bmZone = "external";
  return result;
};
regionalCalls.length = 0;
regionalRoutes.adjust();
assert.equal(
  regionalRoot.city.market.bmZone,
  "external",
  "external zone change is not overwritten",
);
assert.equal(
  regionalCalls.length,
  1,
  "lost zone ownership stops remaining routes",
);

function oracleFixture() {
  let currentRoot = {};
  let currentBoard = true;
  let currentControl = {
    elementId: "market-Iron",
    generation: 1,
    methods: ["aSell", "aBuy", "volume"],
  };
  let sell = [observation(7.36, 1), observation(1.23456, 3)];
  let buy = [
    observation(2.34567, 3),
    observation(12.36, 1),
    observation(12.4, 2),
  ];
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
      if (behavior === "board") currentBoard = false;
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
        () => currentBoard,
      ),
    regional: () =>
      readCapturedRegionalVolume(
        currentRoot,
        "Iron",
        currentControl,
        rootState,
        controls,
        probe,
        () => currentBoard,
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
  observation(10, 1),
  observation(11.1, 2),
  observation(12.3, 1),
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
native.setBuy([
  observation(2.34567, 3),
  observation(12.36, 1),
  observation(12.4, 2),
]);
assert.equal(native.regional(), 10.4567);
native.setVolume([]);
assert.equal(native.regional(), undefined);
native.setVolume([{ receiver: 10, digits: 2, text: "bad" }]);
assert.equal(native.regional(), undefined);
for (const failure of ["reject", "throw", "root", "generation", "board"]) {
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
    rounded = [observation(2, 3), observation(12, 1), observation(12, 2)];
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
    rounded = [observation(2, 3), observation(12, 1), observation(12, 2)];
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

root.resource.Iron.trade = 0;
root.city.market.trade = 0;
settings = { ...settings, res_trade_sell_Iron: true };
let routeSettingsReads = 0;
const quoteInvoke = registry.invoke;
registry.invoke = (handle, method, args) => {
  if (method === "aSell")
    settings = { ...settings, res_trade_sell_Iron: false };
  return quoteInvoke(handle, method, args);
};
const coherentRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => root },
  controls: registry,
  board: ordinaryBoard,
  mechanics,
  keyState: neutralKeyState,
  readSettings: () => {
    routeSettingsReads += 1;
    return settings;
  },
  readDemand: () => ({ isDemanded: () => false, storageRequired: () => 1 }),
});
coherentRoutes.adjust();
assert.equal(
  root.resource.Iron.trade,
  -5,
  "the route plan uses settings sampled before quotes",
);
assert.equal(routeSettingsReads, 1);

root.resource.Iron.trade = 0;
root.city.market.trade = 0;
settings = { ...settings, res_trade_sell_Iron: true };
let routeMutations = 0;
registry.invoke = (handle, method, args) => {
  if (method === "autoSell") {
    routeMutations += 1;
    if (routeMutations === 2) return { ok: true, value: undefined };
  }
  return quoteInvoke(handle, method, args);
};
routes.adjust();
assert.equal(routeMutations, 2, "a no-op middle route step stops the batch");
assert.equal(root.resource.Iron.trade, -1);
assert.equal(root.city.market.trade, 1);

const swapRoot = {
  race: { governor: { g: { bg: "none" } } },
  tech: { trade: 1, currency: 4 },
  city: { market: { mtrade: 3, trade: 3 } },
  resource: {
    Money: { amount: 1000, max: 10000, diff: 100 },
    Source: { display: true, trade: 1, amount: 0, max: 100, diff: 0 },
    Target: { display: true, trade: 0, amount: 0, max: 100, diff: 0 },
    Locked: { display: true, trade: 1, amount: 0, max: 100, diff: 0 },
    Surplus: { display: true, trade: -1, amount: 1000, max: 1000, diff: 0 },
  },
};
const swapSettings = {
  autoMarket: true,
  res_trade_buy_Source: true,
  res_trade_sell_Source: false,
  res_trade_buy_Target: true,
  res_trade_sell_Target: false,
  res_trade_buy_Locked: false,
  res_trade_sell_Locked: false,
  res_trade_buy_Surplus: false,
  res_trade_sell_Surplus: true,
};
const swapControls = new Map(
  ["Source", "Target", "Locked", "Surplus"].map((id) => [
    `market-${id}`,
    {
      elementId: `market-${id}`,
      generation: 1,
      methods: ["autoBuy", "autoSell", "zero", "aSell", "aBuy"],
    },
  ]),
);
const swapRegistry = {
  resolve: (id) => swapControls.get(id),
  capturedElementIds: () => [...swapControls.keys()],
  invoke(handle, method, args = []) {
    const id = args[0];
    if (method === "aSell") {
      rounded = [observation(10, 1), observation(1, 3)];
      return { ok: true, value: "sell quote" };
    }
    if (method === "aBuy") {
      rounded = [observation(1, 3), observation(10, 1), observation(10, 2)];
      return { ok: true, value: "buy quote" };
    }
    if (method === "autoSell" && swapRoot.resource[id].trade > 0) {
      swapRoot.resource[id].trade -= 1;
      swapRoot.city.market.trade -= 1;
    } else if (method === "autoBuy" && swapRoot.resource[id].trade < 0) {
      swapRoot.resource[id].trade += 1;
      swapRoot.city.market.trade -= 1;
    } else if (
      method === "autoBuy" &&
      swapRoot.city.market.trade < swapRoot.city.market.mtrade
    ) {
      swapRoot.resource[id].trade += 1;
      swapRoot.city.market.trade += 1;
    }
    return { ok: true, value: undefined };
  },
};
const swapBoard = boardSource(swapRoot, swapRegistry, "global");
const swapTrace = [];
const swapControl = createCapturedTradeRoutesTestControl({
  rootState: { readRoot: () => swapRoot },
  controls: swapRegistry,
  board: swapBoard,
  mechanics,
  keyState: neutralKeyState,
  readSettings: () => swapSettings,
  readDemand: () => ({ isDemanded: () => false, storageRequired: () => 10 }),
  testSurface: { onTrace: (event) => swapTrace.push(event) },
});
globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
assert.equal(
  swapControl.inspect("Source").status,
  "captured",
  JSON.stringify(swapTrace),
);
assert.equal(
  swapControl.inspect("Source").resource.storageRequiredQuantity,
  10,
);
assert.equal(swapControl.inspect("Source").resource.demanded, false);
const removedRoute = swapControl.removeOne("Source");
assert.equal(removedRoute.status, "applied");
assert.equal(swapRoot.city.market.trade, 2);
assert.equal(swapRoot.resource.Source.trade, 0);
assert.equal(
  swapControl.addOne("Target", { requireDemand: false }).status,
  "applied",
);
assert.equal(swapRoot.city.market.trade, 3, "one route is conserved by swap");
assert.equal(swapRoot.resource.Target.trade, 1);
assert.equal(
  swapRoot.resource.Locked.trade,
  1,
  "unmanaged routes are preserved",
);
assert.equal(swapControl.removeOne("Locked").status, "permission-disabled");
assert.equal(swapRoot.city.market.trade, 3);
assert.equal(swapControl.removeOne("Surplus").status, "applied");
assert.equal(swapRoot.resource.Surplus.trade, 0);
assert.equal(swapRoot.city.market.trade, 2);

swapControls.set("tech-metalwork", {
  elementId: "tech-metalwork",
  generation: 7,
  methods: ["research"],
});
const staleOfferTrace = [];
const staleOfferRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => swapRoot },
  controls: swapRegistry,
  board: boardSource(swapRoot, swapRegistry, "global"),
  mechanics,
  keyState: neutralKeyState,
  readSettings: () => swapSettings,
  readRootGeneration: () => 4,
  readProgressionEpoch: () => "save:stale-offer-test",
  readDemand: () => ({ isDemanded: () => false, storageRequired: () => 10 }),
  testSurface: {
    demandForTest: () => ({
      status: "signal",
      rootGeneration: 4,
      progressionEpoch: "save:stale-offer-test",
      goalId: "prestige:mad",
      goalActionId: "tech-endgame",
      selectedActionId: "tech-metalwork",
      selectedOfferGeneration: 6,
      selectedPrestige: "mad",
      researchPermission: true,
      triggersEnabled: false,
      offerObservationId: "offer-observation-stale-test",
      offerSetIdentity: "offer-set-stale-test",
      grantTechnology: "metalworking",
      grantLevel: 1,
      grantLevelBefore: 0,
      researchPrice: Object.freeze({ Iron: 100 }),
      selectedApplicabilityStatus: "eligible",
      goalRelationship: "verified-prerequisite:eligible",
      goalChainIdentity: "tech-metalwork>tech-endgame",
      resourceId: "Source",
      targetQuantity: 20,
      shortfall: 20,
    }),
    onTrace: (event) => staleOfferTrace.push(event),
  },
});
staleOfferRoutes.adjust();
const staleOfferPlan = staleOfferTrace.find((event) => event.kind === "plan");
assert.ok(staleOfferPlan);
assert.equal(
  staleOfferPlan.testDemandResourceId,
  undefined,
  "a signal from an older native Research offer generation is rejected",
);
assert.deepEqual(
  staleOfferPlan.plannerOperations,
  staleOfferPlan.baselineOperations,
  "a stale Research offer leaves the ordinary Market plan untouched",
);

swapSettings.autoMarket = true;
swapSettings.prestigeType = "mad";
swapSettings.autoResearch = true;
swapSettings.autoTrigger = false;
const historicalGoalTrace = [];
const historicalGoalSignal = Object.freeze({
  status: "signal",
  rootGeneration: 4,
  progressionEpoch: "save:historical-goal-test",
  goalId: "prestige:mad",
  goalActionId: "tech-endgame",
  selectedActionId: "tech-metalwork",
  selectedOfferGeneration: 7,
  resourceId: "Source",
  targetQuantity: 20,
  shortfall: 20,
});
const historicalGoalRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => swapRoot },
  controls: swapRegistry,
  board: boardSource(swapRoot, swapRegistry, "global"),
  mechanics,
  keyState: neutralKeyState,
  readSettings: () => swapSettings,
  readRootGeneration: () => 4,
  readProgressionEpoch: () => "save:historical-goal-test",
  readDemand: () => ({ isDemanded: () => false, storageRequired: () => 10 }),
  testSurface: {
    allowHistoricalSignalForComparisonTest: () => true,
    demandForTest: () => historicalGoalSignal,
    onTrace: (event) => historicalGoalTrace.push(event),
  },
});
historicalGoalRoutes.adjust();
const historicalGoalPlan = historicalGoalTrace.find(
  (event) => event.kind === "plan",
);
assert.ok(historicalGoalPlan);
assert.equal(
  historicalGoalPlan.testDemandResourceId,
  "Source",
  "the explicit historical comparison path must pass its legacy signal to the planner",
);
assert.equal(
  historicalGoalPlan.testDemandMoneyFloorPolicy,
  "demand-can-relax-floor",
  "the historical F policy retains its Money-floor exception",
);
const jLegacyTrace = [];
const jLegacyRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => swapRoot },
  controls: swapRegistry,
  board: boardSource(swapRoot, swapRegistry, "global"),
  mechanics,
  keyState: neutralKeyState,
  readSettings: () => swapSettings,
  readRootGeneration: () => 4,
  readProgressionEpoch: () => "save:historical-goal-test",
  readDemand: () => ({ isDemanded: () => false, storageRequired: () => 10 }),
  testSurface: {
    allowHistoricalSignalForComparisonTest: () => false,
    demandForTest: () => historicalGoalSignal,
    onTrace: (event) => jLegacyTrace.push(event),
  },
});
jLegacyRoutes.adjust();
assert.equal(
  jLegacyTrace.find((event) => event.kind === "plan")?.testDemandResourceId,
  undefined,
  "the J-shaped path must reject a legacy signal without the authoritative Research evidence",
);

const finalFenceTrace = [];
const finalFenceSettings = { ...swapSettings };
let finalFenceRootGeneration = 4;
let finalFenceEpoch = "save:final-fence-test";
const finalFenceRoutes = createCapturedTradeRoutes({
  rootState: { readRoot: () => swapRoot },
  controls: swapRegistry,
  board: boardSource(swapRoot, swapRegistry, "global"),
  mechanics,
  keyState: neutralKeyState,
  readSettings: () => finalFenceSettings,
  readRootGeneration: () => finalFenceRootGeneration,
  readProgressionEpoch: () => finalFenceEpoch,
  readDemand: () => ({ isDemanded: () => false, storageRequired: () => 10 }),
  testSurface: {
    demandForTest: () => ({
      status: "signal",
      rootGeneration: finalFenceRootGeneration,
      progressionEpoch: finalFenceEpoch,
      goalId: "prestige:mad",
      goalActionId: "tech-endgame",
      selectedActionId: "tech-metalwork",
      selectedOfferGeneration: 7,
      selectedPrestige: "mad",
      researchPermission: true,
      triggersEnabled: false,
      offerObservationId: "offer-observation-final-fence",
      offerSetIdentity: "offer-set-final-fence",
      grantTechnology: "metalworking",
      grantLevel: 1,
      grantLevelBefore: 0,
      researchPrice: Object.freeze({ Iron: 100 }),
      selectedApplicabilityStatus: "eligible",
      goalRelationship: "verified-prerequisite:eligible",
      goalChainIdentity: "tech-metalwork>tech-endgame",
      resourceId: "Source",
      targetQuantity: 20,
      shortfall: 20,
    }),
    resolveOperations: () => {
      // Synthetic adapter test: model a permission change after planning.
      finalFenceSettings.autoMarket = false;
      return undefined;
    },
    onTrace: (event) => finalFenceTrace.push(event),
  },
});
const routesBeforeFinalFence = Object.fromEntries(
  Object.entries(swapRoot.resource).map(([id, resource]) => [
    id,
    resource.trade,
  ]),
);
finalFenceRoutes.adjust();
assert.ok(
  finalFenceTrace.some(
    (event) =>
      event.kind === "skipped" && event.reason === "market-authority-stale",
  ),
  "a permission change after planning rejects the whole strategy batch",
);
assert.deepEqual(
  Object.fromEntries(
    Object.entries(swapRoot.resource).map(([id, resource]) => [
      id,
      resource.trade,
    ]),
  ),
  routesBeforeFinalFence,
  "a failed final fence does not execute a partial strategy batch",
);

function assertSyntheticResearchFenceCase(expectedReason, mutate) {
  finalFenceSettings.autoMarket = true;
  finalFenceSettings.autoResearch = true;
  finalFenceSettings.autoTrigger = false;
  finalFenceSettings.prestigeType = "mad";
  finalFenceSettings.res_trade_buy_Source = true;
  finalFenceRootGeneration = 4;
  finalFenceEpoch = "save:final-fence-test";
  const events = [];
  const routeControl = createCapturedTradeRoutes({
    rootState: { readRoot: () => swapRoot },
    controls: swapRegistry,
    board: boardSource(swapRoot, swapRegistry, "global"),
    mechanics,
    keyState: neutralKeyState,
    readSettings: () => finalFenceSettings,
    readRootGeneration: () => finalFenceRootGeneration,
    readProgressionEpoch: () => finalFenceEpoch,
    readDemand: () => ({ isDemanded: () => false, storageRequired: () => 10 }),
    testSurface: {
      demandForTest: () => ({
        status: "signal",
        rootGeneration: finalFenceRootGeneration,
        progressionEpoch: finalFenceEpoch,
        goalId: "prestige:mad",
        goalActionId: "tech-endgame",
        selectedActionId: "tech-metalwork",
        selectedOfferGeneration: 7,
        selectedPrestige: "mad",
        researchPermission: true,
        triggersEnabled: false,
        offerObservationId: "offer-observation-synthetic-fence",
        offerSetIdentity: "offer-set-synthetic-fence",
        grantTechnology: "metalworking",
        grantLevel: 1,
        grantLevelBefore: 0,
        researchPrice: Object.freeze({ Iron: 100 }),
        selectedApplicabilityStatus: "eligible",
        goalRelationship: "verified-prerequisite:eligible",
        goalChainIdentity: "tech-metalwork>tech-endgame",
        resourceId: "Source",
        targetQuantity: 20,
        shortfall: 20,
      }),
      resolveOperations: () => {
        // Synthetic state injection exercises the final executor boundary.
        mutate();
        return undefined;
      },
      onTrace: (event) => events.push(event),
    },
  });
  routeControl.adjust();
  assert.ok(
    events.some(
      (event) => event.kind === "skipped" && event.reason === expectedReason,
    ),
    `synthetic fence mutation must fail closed: ${expectedReason}`,
  );
}

assertSyntheticResearchFenceCase(
  "research-permission-or-prestige-stale",
  () => {
    finalFenceSettings.autoResearch = false;
  },
);
assertSyntheticResearchFenceCase(
  "research-permission-or-prestige-stale",
  () => {
    finalFenceSettings.autoTrigger = true;
  },
);
assertSyntheticResearchFenceCase(
  "research-permission-or-prestige-stale",
  () => {
    finalFenceSettings.prestigeType = "bioseed";
  },
);
assertSyntheticResearchFenceCase("research-root-or-progression-stale", () => {
  finalFenceRootGeneration += 1;
});
assertSyntheticResearchFenceCase("research-root-or-progression-stale", () => {
  finalFenceEpoch = "save:changed-progression-test";
});
assertSyntheticResearchFenceCase("market-authority-stale", () => {
  finalFenceSettings.res_trade_buy_Source = false;
});
const originalSourceHolding = swapRoot.resource.Source.amount;
assertSyntheticResearchFenceCase("market-resource-or-quote-stale", () => {
  swapRoot.resource.Source.amount = originalSourceHolding + 1;
});
swapRoot.resource.Source.amount = originalSourceHolding;
finalFenceSettings.autoMarket = true;
finalFenceSettings.res_trade_buy_Source = true;
const baseSwapInvoke = swapRegistry.invoke;
let ordinaryMarketInvocations = 0;
swapRegistry.invoke = (handle, method, args) => {
  if (["autoBuy", "autoSell", "zero"].includes(method))
    ordinaryMarketInvocations += 1;
  return baseSwapInvoke(handle, method, args);
};
const ordinaryAfterFence = createCapturedTradeRoutes({
  rootState: { readRoot: () => swapRoot },
  controls: swapRegistry,
  board: boardSource(swapRoot, swapRegistry, "global"),
  mechanics,
  keyState: neutralKeyState,
  readSettings: () => finalFenceSettings,
  readDemand: () => ({ isDemanded: () => false, storageRequired: () => 10 }),
});
const ordinaryInvocationsBefore = ordinaryMarketInvocations;
ordinaryAfterFence.adjust();
assert.ok(
  ordinaryMarketInvocations > ordinaryInvocationsBefore,
  "ordinary Market remains usable after the strategy batch is refused",
);
delete globalThis.__EA_TEST_SURFACE_ENABLED__;

console.log("captured trade routes tests passed");
