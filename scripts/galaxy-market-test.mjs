import assert from "node:assert/strict";

import { createGalaxyMarketAdapter } from "../src/adapters/evolve/economy/market/galaxy-market.ts";
import { planGalaxyMarket } from "../src/domain/economy/market/galaxy-market.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

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

console.log("Galaxy-market domain, adapter, and application tests passed");
