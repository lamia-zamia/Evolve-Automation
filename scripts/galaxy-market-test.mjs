import assert from "node:assert/strict";

import { createGalaxyMarketAdapter } from "../src/adapters/evolve/galaxy-market.ts";
import { runGalaxyMarketAutomation } from "../src/application/galaxy-market.ts";
import { planGalaxyMarket } from "../src/domain/economy/market/galaxy-market.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const current = (scenario.offers ?? []).map((offer) => offer.current ?? 0);
  const offers = (scenario.offers ?? []).map((offer, index) => ({
    buy: { res: offer.buy ?? `Buy${index}` },
    sell: { res: offer.sell ?? `Sell${index}` },
  }));
  const resources = {};
  for (let index = 0; index < offers.length; index++) {
    const definition = scenario.offers[index];
    const offer = offers[index];
    resources[offer.buy.res] = {
      id: offer.buy.res,
      galaxyMarketWeighting: definition.weighting ?? 1,
      galaxyMarketPriority: definition.priority ?? 1,
      isDemanded: () => definition.demanded ?? false,
      isUseful: () => definition.useful ?? true,
    };
    resources[offer.sell.res] = {
      id: offer.sell.res,
      isDemanded: () => definition.sellDemanded ?? false,
      storageRatio: definition.sellStorageRatio ?? 1,
    };
  }
  const manager = {
    initIndustry: () => scenario.initialized ?? true,
    maxOperating: () => scenario.maximum ?? 0,
    currentProduction: (index) => current[index],
    decreaseProduction(index, count) {
      trace.managerCall("decreaseProduction", { index, count });
      trace.command("decrease-galaxy-market", { index, count });
      current[index] -= count;
      trace.stateChange("galaxy-market-allocation", {
        index,
        count: current[index],
      });
    },
    increaseProduction(index, count) {
      trace.managerCall("increaseProduction", { index, count });
      trace.command("increase-galaxy-market", { index, count });
      current[index] += count;
      trace.stateChange("galaxy-market-allocation", {
        index,
        count: current[index],
      });
    },
  };
  return {
    trace,
    current,
    offers,
    resources,
    settings: { marketMinIngredients: scenario.minimumIngredientRatio ?? 0 },
    manager,
  };
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const GalaxyTradeManager = fixture.manager;
  const poly = { galaxyOffers: fixture.offers };
  const { resources, settings } = fixture;
  if (!GalaxyTradeManager.initIndustry()) {
    return { trace: fixture.trace.snapshot(), current: fixture.current };
  }

  const priorityGroups = {};
  const tradeAdjustments = {};
  for (let index = 0; index < poly.galaxyOffers.length; index++) {
    const trade = poly.galaxyOffers[index];
    const buyResource = resources[trade.buy.res];
    if (buyResource.galaxyMarketWeighting > 0) {
      const priority = buyResource.isDemanded()
        ? Math.max(buyResource.galaxyMarketPriority, 100)
        : buyResource.galaxyMarketPriority;
      if (priority !== 0) {
        priorityGroups[priority] = priorityGroups[priority] ?? [];
        priorityGroups[priority].push(trade);
      }
    }
    tradeAdjustments[buyResource.id] = 0;
  }
  const priorityList = Object.keys(priorityGroups)
    .sort((left, right) => right - left)
    .map((key) => priorityGroups[key]);
  if (priorityGroups["-1"] && priorityList.length > 1) {
    priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
    priorityList[0].push(...priorityGroups["-1"]);
  }

  let remainingFreighters = GalaxyTradeManager.maxOperating();
  for (
    let groupIndex = 0;
    groupIndex < priorityList.length && remainingFreighters > 0;
    groupIndex++
  ) {
    const trades = priorityList[groupIndex].sort(
      (left, right) =>
        resources[left.buy.res].galaxyMarketWeighting -
        resources[right.buy.res].galaxyMarketWeighting,
    );
    while (remainingFreighters > 0) {
      const freightersToDistribute = remainingFreighters;
      const totalPriorityWeight = trades.reduce(
        (sum, trade) => sum + resources[trade.buy.res].galaxyMarketWeighting,
        0,
      );
      for (
        let index = trades.length - 1;
        index >= 0 && remainingFreighters > 0;
        index--
      ) {
        const trade = trades[index];
        const buyResource = resources[trade.buy.res];
        const sellResource = resources[trade.sell.res];
        const calculated = Math.min(
          remainingFreighters,
          Math.max(
            1,
            Math.floor(
              (freightersToDistribute / totalPriorityWeight) *
                buyResource.galaxyMarketWeighting,
            ),
          ),
        );
        let actual = calculated;
        if (
          !buyResource.isUseful() ||
          sellResource.isDemanded() ||
          sellResource.storageRatio < settings.marketMinIngredients
        ) {
          actual = 0;
        }
        if (actual > 0) {
          remainingFreighters -= actual;
          tradeAdjustments[buyResource.id] += actual;
        }
        if (actual < calculated) trades.splice(index, 1);
      }
      if (freightersToDistribute === remainingFreighters) break;
    }
  }

  const deltas = poly.galaxyOffers.map(
    (trade, index) =>
      tradeAdjustments[trade.buy.res] -
      GalaxyTradeManager.currentProduction(index),
  );
  deltas.forEach(
    (value, index) =>
      value < 0 && GalaxyTradeManager.decreaseProduction(index, value * -1),
  );
  deltas.forEach(
    (value, index) =>
      value > 0 && GalaxyTradeManager.increaseProduction(index, value),
  );
  return { trace: fixture.trace.snapshot(), current: fixture.current };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const adapter = createGalaxyMarketAdapter({
    getManager: () => fixture.manager,
    getOffers: () => fixture.offers,
    getResources: () => fixture.resources,
    getSettings: () => fixture.settings,
  });
  const outcome = runGalaxyMarketAutomation({
    reader: adapter.reader,
    executor: adapter.executor,
  });
  assert.equal(outcome.status, "succeeded");
  return { trace: fixture.trace.snapshot(), current: fixture.current };
}

const dualRunScenarios = [
  { name: "locked", initialized: false, maximum: 3, offers: [] },
  {
    name: "single offer",
    maximum: 3,
    offers: [{ buy: "A", sell: "Fuel" }],
  },
  {
    name: "weighted distribution and remainder",
    maximum: 6,
    offers: [
      { buy: "A", sell: "FuelA", weighting: 1 },
      { buy: "B", sell: "FuelB", weighting: 2 },
    ],
  },
  {
    name: "demand promotes priority",
    maximum: 2,
    offers: [
      { buy: "A", sell: "FuelA", priority: 1, demanded: true },
      { buy: "B", sell: "FuelB", priority: 50 },
    ],
  },
  {
    name: "useless high priority falls back",
    maximum: 2,
    offers: [
      { buy: "A", sell: "FuelA", priority: 10, useful: false, current: 1 },
      { buy: "B", sell: "FuelB", priority: 5 },
    ],
  },
  {
    name: "demanded ingredient blocks offer",
    maximum: 2,
    offers: [
      { buy: "A", sell: "FuelA", priority: 10, sellDemanded: true },
      { buy: "B", sell: "FuelB", priority: 5 },
    ],
  },
  {
    name: "ingredient floor and equality",
    maximum: 2,
    minimumIngredientRatio: 0.5,
    offers: [
      { buy: "A", sell: "FuelA", priority: 10, sellStorageRatio: 0.49 },
      { buy: "B", sell: "FuelB", priority: 5, sellStorageRatio: 0.5 },
    ],
  },
  {
    name: "zero weighting and priority clear routes",
    maximum: 2,
    offers: [
      { buy: "A", sell: "FuelA", weighting: 0, current: 1 },
      { buy: "B", sell: "FuelB", priority: 0, current: 1 },
    ],
  },
  {
    name: "supplementary group joins top priority",
    maximum: 2,
    offers: [
      { buy: "A", sell: "FuelA", priority: 10, weighting: 1 },
      { buy: "B", sell: "FuelB", priority: -1, weighting: 10 },
    ],
  },
  {
    name: "below minus one preserves splice behavior",
    maximum: 2,
    offers: [
      { buy: "A", sell: "FuelA", priority: -1 },
      { buy: "B", sell: "FuelB", priority: -2, current: 1 },
    ],
  },
  {
    name: "all ineligible still clears existing routes",
    maximum: 3,
    offers: [
      { buy: "A", sell: "FuelA", useful: false, current: 2 },
      { buy: "B", sell: "FuelB", sellDemanded: true, current: 1 },
    ],
  },
  {
    name: "zero capacity clears existing routes",
    maximum: 0,
    offers: [
      { buy: "A", sell: "FuelA", current: 2 },
      { buy: "B", sell: "FuelB", current: 1 },
    ],
  },
  {
    name: "all decreases precede increases",
    maximum: 2,
    offers: [
      { buy: "A", sell: "FuelA", priority: 1, current: 2 },
      { buy: "B", sell: "FuelB", priority: 10, current: 0 },
    ],
  },
];

for (const scenario of dualRunScenarios) {
  const legacy = runLegacy(scenario);
  const modern = runModern(scenario);
  assertEquivalentTraces({
    legacy: legacy.trace,
    modern: modern.trace,
    label: `galaxy-market ${scenario.name}`,
  });
  assert.deepEqual(modern.current, legacy.current, scenario.name);
}

const immutableInput = Object.freeze({
  initialized: true,
  maximum: 1,
  minimumIngredientRatio: 0,
  offers: Object.freeze([
    Object.freeze({
      index: 0,
      buyResourceId: "A",
      sellResourceId: "Fuel",
      weighting: 1,
      priority: 1,
      demanded: false,
      useful: true,
      sellDemanded: false,
      sellStorageRatio: 1,
      current: 0,
    }),
  ]),
});
assert.equal(planGalaxyMarket(immutableInput).adjustments[0].delta, 1);
assert.equal(planGalaxyMarket({ ...immutableInput, initialized: false }), null);

let offersRead = false;
const lockedAdapter = createGalaxyMarketAdapter({
  getManager: () => ({ initIndustry: () => false }),
  getOffers: () => {
    offersRead = true;
    return [];
  },
  getResources: () => ({}),
  getSettings: () => ({}),
});
assert.equal(lockedAdapter.reader.read().initialized, false);
assert.equal(offersRead, false);

const inactiveManager = {
  initIndustry: () => true,
  maxOperating: () => 0,
  currentProduction: () => 0,
};
const inactiveAdapter = createGalaxyMarketAdapter({
  getManager: () => inactiveManager,
  getOffers: () => [{ buy: { res: "A" }, sell: { res: "Fuel" } }],
  getResources: () => ({
    A: {},
    Fuel: {},
  }),
  getSettings: () => ({}),
});
assert.equal(inactiveAdapter.reader.read().offers[0].priority, 0);

const staleFixture = createFixture({
  maximum: 1,
  offers: [{ buy: "A", sell: "Fuel" }],
});
const staleAdapter = createGalaxyMarketAdapter({
  getManager: () => staleFixture.manager,
  getOffers: () => staleFixture.offers,
  getResources: () => staleFixture.resources,
  getSettings: () => staleFixture.settings,
});
const staleDecision = planGalaxyMarket(staleAdapter.reader.read());
staleFixture.offers[0].sell.res = "Changed";
assert.equal(staleAdapter.executor.execute(staleDecision).status, "stale");
assert.deepEqual(staleFixture.trace.snapshot(), []);

const preflightFixture = createFixture({
  maximum: 1,
  offers: [
    { buy: "A", sell: "FuelA", priority: 1, current: 1 },
    { buy: "B", sell: "FuelB", priority: 10 },
  ],
});
const preflightAdapter = createGalaxyMarketAdapter({
  getManager: () => preflightFixture.manager,
  getOffers: () => preflightFixture.offers,
  getResources: () => preflightFixture.resources,
  getSettings: () => preflightFixture.settings,
});
const preflightDecision = planGalaxyMarket(preflightAdapter.reader.read());
delete preflightFixture.manager.increaseProduction;
assert.throws(
  () => preflightAdapter.executor.execute(preflightDecision),
  /increaseProduction/,
);
assert.deepEqual(preflightFixture.trace.snapshot(), []);

const currentFixture = createFixture({
  maximum: 1,
  offers: [{ buy: "A", sell: "Fuel" }],
});
const currentAdapter = createGalaxyMarketAdapter({
  getManager: () => currentFixture.manager,
  getOffers: () => currentFixture.offers,
  getResources: () => currentFixture.resources,
  getSettings: () => currentFixture.settings,
});
const currentDecision = planGalaxyMarket(currentAdapter.reader.read());
currentFixture.current[0] = 1;
assert.equal(currentAdapter.executor.execute(currentDecision).status, "stale");
assert.deepEqual(currentFixture.trace.snapshot(), []);

console.log(
  `Galaxy-market domain, adapter, application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
