import assert from "node:assert/strict";

import {
  createGrapheneCommandExecutor,
  readGrapheneInput,
} from "../src/adapters/evolve/graphene.ts";
import { planGraphene } from "../src/domain/economy/production/graphene.ts";

const CONSUMPTION_BALANCE_MIN = 60;

// Exact copy of the deleted legacy `autoGraphenePlant`, run against identical
// live fixtures to prove the reader + planner + apply path produces a
// byte-identical fuel-adjustment call trace.
function legacyGraphene({ GrapheneManager, getResources }) {
  const resources = getResources();
  if (!GrapheneManager.initIndustry()) return;

  let remainingPlants = GrapheneManager.maxOperating();
  let fuelAdjust = [];

  let sortedFuel = Object.values(GrapheneManager.Fuels).sort((a, b) =>
    b.cost.resource.storageRatio < 0.995 || a.cost.resource.storageRatio < 0.995
      ? b.cost.resource.storageRatio - a.cost.resource.storageRatio
      : b.cost.resource.rateOfChange - a.cost.resource.rateOfChange,
  );
  for (let fuel of sortedFuel) {
    if (remainingPlants === 0) break;
    let resource = fuel.cost.resource;
    if (!resource.isUnlocked()) continue;

    let currentFuelCount = GrapheneManager.fueledCount(fuel);
    let maxFueledForConsumption = remainingPlants;
    if (!resources.Graphene.isUseful()) {
      maxFueledForConsumption = 0;
    } else if (
      resource.currentQuantity <
      maxFueledForConsumption * fuel.cost.quantity * CONSUMPTION_BALANCE_MIN +
        fuel.cost.minRateOfChange
    ) {
      let rateOfChange =
        resource.rateOfChange +
        fuel.cost.quantity * currentFuelCount -
        fuel.cost.minRateOfChange;
      let affordableAmount = Math.floor(rateOfChange / fuel.cost.quantity);
      maxFueledForConsumption = Math.max(
        Math.min(maxFueledForConsumption, affordableAmount),
        0,
      );
    }

    let deltaFuel = maxFueledForConsumption - currentFuelCount;
    if (deltaFuel !== 0) fuelAdjust.push({ res: fuel, delta: deltaFuel });

    remainingPlants -= currentFuelCount + deltaFuel;
  }

  fuelAdjust.forEach(
    (fuel) =>
      fuel.delta < 0 && GrapheneManager.decreaseFuel(fuel.res, fuel.delta * -1),
  );
  fuelAdjust.forEach(
    (fuel) =>
      fuel.delta > 0 && GrapheneManager.increaseFuel(fuel.res, fuel.delta),
  );
}

function buildFixture(scenario, calls) {
  const fuelEntries = {};
  const fueled = {};
  for (const f of scenario.fuels) {
    fuelEntries[f.id] = {
      id: f.id,
      cost: {
        quantity: f.quantity,
        minRateOfChange: f.minRate,
        resource: {
          storageRatio: f.storageRatio,
          rateOfChange: f.rate,
          currentQuantity: f.current,
          isUnlocked: () => f.unlocked !== false,
        },
      },
    };
    fueled[f.id] = f.fueled ?? 0;
  }
  const GrapheneManager = {
    Fuels: fuelEntries,
    initIndustry: () => scenario.init ?? true,
    maxOperating: () => scenario.max,
    fueledCount: (fuel) => fueled[fuel.id],
    decreaseFuel: (fuel, count) => calls.push(["dec", fuel.id, count]),
    increaseFuel: (fuel, count) => calls.push(["inc", fuel.id, count]),
  };
  const resources = {
    Graphene: { isUseful: () => scenario.grapheneUseful ?? true },
  };
  return { GrapheneManager, resources };
}

function runLegacy(scenario) {
  const calls = [];
  const f = buildFixture(scenario, calls);
  legacyGraphene({
    GrapheneManager: f.GrapheneManager,
    getResources: () => f.resources,
  });
  return calls;
}

function runNew(scenario) {
  const calls = [];
  const f = buildFixture(scenario, calls);
  const adjustments = planGraphene(
    readGrapheneInput({
      getGrapheneManager: () => f.GrapheneManager,
      getResources: () => f.resources,
      consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    }),
  );
  assert.equal(
    createGrapheneCommandExecutor(() => f.GrapheneManager).execute(adjustments)
      .status,
    "succeeded",
  );
  return calls;
}

const scenarios = [
  // 1. Plenty of fuel: fill plants with the highest-storage fuel first.
  {
    max: 10,
    fuels: [
      {
        id: "Lumber",
        quantity: 350,
        minRate: 100,
        storageRatio: 0.2,
        rate: 5000,
        current: 1e9,
        fueled: 0,
      },
      {
        id: "Coal",
        quantity: 25,
        minRate: 10,
        storageRatio: 0.9,
        rate: 5000,
        current: 1e9,
        fueled: 0,
      },
      {
        id: "Oil",
        quantity: 15,
        minRate: 10,
        storageRatio: 0.5,
        rate: 5000,
        current: 1e9,
        fueled: 0,
      },
    ],
  },
  // 2. Graphene not useful: drain all fuel to zero.
  {
    max: 10,
    grapheneUseful: false,
    fuels: [
      {
        id: "Coal",
        quantity: 25,
        minRate: 10,
        storageRatio: 0.9,
        rate: 5000,
        current: 1e9,
        fueled: 4,
      },
      {
        id: "Oil",
        quantity: 15,
        minRate: 10,
        storageRatio: 0.5,
        rate: 5000,
        current: 1e9,
        fueled: 2,
      },
    ],
  },
  // 3. Consumption-limited: low income caps the affordable fuel count.
  {
    max: 20,
    fuels: [
      {
        id: "Coal",
        quantity: 25,
        minRate: 10,
        storageRatio: 0.3,
        rate: 100,
        current: 50,
        fueled: 0,
      },
      {
        id: "Oil",
        quantity: 15,
        minRate: 10,
        storageRatio: 0.4,
        rate: 60,
        current: 20,
        fueled: 2,
      },
    ],
  },
  // 4. Locked fuel skipped; all fuels above the 0.995 storage tie-break by rate.
  {
    max: 6,
    fuels: [
      {
        id: "Lumber",
        quantity: 350,
        minRate: 100,
        storageRatio: 0.999,
        rate: 10,
        current: 1e9,
        fueled: 1,
        unlocked: false,
      },
      {
        id: "Coal",
        quantity: 25,
        minRate: 10,
        storageRatio: 0.999,
        rate: 300,
        current: 1e9,
        fueled: 0,
      },
      {
        id: "Oil",
        quantity: 15,
        minRate: 10,
        storageRatio: 0.999,
        rate: 100,
        current: 1e9,
        fueled: 0,
      },
    ],
  },
  // 5. Not initialised: no actions.
  {
    init: false,
    max: 10,
    fuels: [
      {
        id: "Coal",
        quantity: 25,
        minRate: 10,
        storageRatio: 0.5,
        rate: 100,
        current: 1000,
        fueled: 3,
      },
    ],
  },
];

let index = 0;
for (const scenario of scenarios) {
  index += 1;
  assert.deepEqual(
    runNew(scenario),
    runLegacy(scenario),
    `scenario ${index} fuel trace mismatch`,
  );
}

// Adapter: legacy refreshes resources before initIndustry, but does not inspect
// the returned object when the industry is unavailable.
{
  let resourceGetterCalls = 0;
  const input = readGrapheneInput({
    getGrapheneManager: () => ({ initIndustry: () => false }),
    getResources: () => (resourceGetterCalls++, null),
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  });
  assert.equal(input.initialised, false);
  assert.deepEqual(input.fuels, []);
  assert.equal(resourceGetterCalls, 1);
}

// Locked fuels participate in legacy sorting, but none of their deeper
// consumption fields or fueled-count state is relevant.
{
  let usefulnessCalls = 0;
  const lockedResource = {
    storageRatio: 0.5,
    rateOfChange: 1,
    isUnlocked: () => false,
    get currentQuantity() {
      throw new Error("locked current quantity must not be read");
    },
  };
  const input = readGrapheneInput({
    getGrapheneManager: () => ({
      Fuels: {
        Coal: {
          id: "Coal",
          cost: {
            get quantity() {
              throw new Error("locked cost must not be read");
            },
            get minRateOfChange() {
              throw new Error("locked minimum rate must not be read");
            },
            resource: lockedResource,
          },
        },
      },
      initIndustry: () => true,
      maxOperating: () => 1,
      fueledCount: () => {
        throw new Error("locked fuel count must not be read");
      },
    }),
    getResources: () => ({
      Graphene: { isUseful: () => (usefulnessCalls++, true) },
    }),
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  });
  assert.equal(input.fuels[0].isUnlocked, false);
  assert.equal(usefulnessCalls, 0);
}

{
  const mutations = [];
  const result = createGrapheneCommandExecutor(() => ({
    Fuels: { Coal: { id: "Coal" } },
    fueledCount: () => 3,
    decreaseFuel: (...args) => mutations.push(["decrease", ...args]),
    increaseFuel: (...args) => mutations.push(["increase", ...args]),
  })).execute([{ fuelId: "Coal", expectedCurrentFuelCount: 2, delta: 1 }]);
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

console.log(
  `Graphene automation regression tests passed (${scenarios.length} dual-run scenarios)`,
);
