import assert from "node:assert/strict";

import {
  createSmelterCommandExecutor,
  readSmelterInput,
} from "../src/adapters/evolve/economy/production/smelter.ts";
import { planSmelter } from "../src/domain/economy/production/smelter.ts";
import { CONSUMPTION_BALANCE_MIN } from "../src/config.ts";

function makeResource(name, o = {}) {
  return {
    name,
    currentQuantity: o.currentQuantity ?? 10_000,
    rateOfChange: o.rateOfChange ?? 100,
    storageRatio: o.storageRatio ?? 0.5,
    timeToFull: o.timeToFull ?? 0,
    timeToRequired: o.timeToRequired ?? 0,
    _capped: o.capped ?? false,
    _demanded: o.demanded ?? false,
    isCapped() {
      return this._capped;
    },
    isDemanded() {
      return this._demanded;
    },
  };
}

// Build an independent set of mocks from a scenario spec, with its own actions
// log, driving the reader + planner + executor for each adapter-contract case.
function buildFixture(spec) {
  const actions = [];
  const s = {
    initialized: true,
    forge: false,
    maxOperating: 10,
    extraOperating: 0,
    productionSmelting: "steel",
    productionSmeltingIridium: 0,
    iridiumUnlocked: false,
    iridiumCapped: false,
    counts: { Iron: 0, Steel: 0, Iridium: 0 },
    minerCount: 1,
    beltIronShip: 0,
    haveAlumina: false,
    titaniumStorageRatio: 0.5,
    haveTitanium: false,
    steelCost: [],
    fuels: [{ id: "Coal", unlocked: true, count: 0 }],
    resources: {},
    ...spec,
  };
  s.counts = { Iron: 0, Steel: 0, Iridium: 0, ...s.counts };

  const resources = {
    Iron: makeResource("Iron", s.resources.Iron),
    Steel: makeResource("Steel", s.resources.Steel),
    Iridium: makeResource("Iridium", s.resources.Iridium),
    Titanium: makeResource("Titanium", {
      storageRatio: s.titaniumStorageRatio,
      ...s.resources.Titanium,
    }),
  };

  const buildCost = (c) => ({
    resource: makeResource(c.resourceName ?? "Coal", c.resource),
    quantity: c.quantity ?? 1,
    minRateOfChange: c.minRateOfChange ?? 0,
  });

  const fuelObjects = s.fuels.map((f) => ({
    id: f.id,
    unlocked: f.unlocked ?? true,
    count: f.count ?? 0,
    cost: (f.cost ?? [{ resourceName: f.id }]).map(buildCost),
  }));
  const Fuels = {};
  for (const fuel of fuelObjects) {
    Fuels[fuel.id] = fuel;
  }

  const Productions = {
    Iron: { id: "Iron", cost: [] },
    Steel: { id: "Steel", cost: s.steelCost.map(buildCost) },
    Iridium: { id: "Iridium", unlocked: s.iridiumUnlocked, cost: [] },
  };

  const SmelterManager = {
    Fuels,
    Productions,
    initIndustry: () => s.initialized,
    maxOperating: () => s.maxOperating,
    extraOperating: () => s.extraOperating,
    managedFuelPriorityList: () => fuelObjects,
    fueledCount: (fuel) => fuel.count,
    smeltingCount: (production) => s.counts[production.id],
    increaseFuel: (fuel, count) =>
      actions.push(["increaseFuel", fuel.id, count]),
    decreaseFuel: (fuel, count) =>
      actions.push(["decreaseFuel", fuel.id, count]),
    increaseSmelting: (id, count) =>
      actions.push(["increaseSmelting", id, count]),
    decreaseSmelting: (id, count) =>
      actions.push(["decreaseSmelting", id, count]),
  };

  const state = { tooltips: {} };
  const settings = {
    autoBuild: s.autoBuild ?? false,
    productionSmelting: s.productionSmelting,
    productionSmeltingIridium: s.productionSmeltingIridium,
  };
  const game = {
    global: {
      race: s.forge ? { forge: 1 } : {},
      tech: { alumina: s.haveAlumina ? 1 : 0 },
    },
  };
  const jobs = { Miner: { count: s.minerCount } };
  const buildings = {
    BeltIronShip: { stateOnCount: s.beltIronShip },
  };
  const haveTech = (tech) => tech === "titanium" && s.haveTitanium;

  return {
    SmelterManager,
    game,
    state,
    settings,
    resources,
    jobs,
    buildings,
    haveTech,
    actions,
  };
}

// Route candidate: after the aluminium tech is known, AutoBuild needs the
// refinery's Steel reserve even though the refinery itself is not affordable
// yet.  This must move one smelter to Steel under the "required" policy.
{
  const f = buildFixture({
    autoBuild: true,
    productionSmelting: "required",
    haveAlumina: true,
    counts: { Iron: 1 },
    resources: {
      Steel: { currentQuantity: 50, timeToFull: 0, timeToRequired: 0 },
    },
  });
  const decision = planSmelter(
    readSmelterInput({
      getSmelterManager: () => f.SmelterManager,
      getGame: () => f.game,
      getResources: () => f.resources,
      getSettings: () => f.settings,
      getJobs: () => f.jobs,
      getBuildings: () => f.buildings,
      haveTech: f.haveTech,
      consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    }),
  );
  assert.ok(
    decision.smeltAdjustments.some(
      ({ productionId, delta }) => productionId === "Steel" && delta > 0,
    ),
    JSON.stringify(decision),
  );
}

// Adapter contract: an unavailable industry short-circuits without reading the
// fuel/production surface and yields an empty no-op decision.
{
  const throwing = {
    getSmelterManager: () => ({
      initIndustry: () => false,
      get Fuels() {
        throw new Error("must not read Fuels when uninitialised");
      },
      get Productions() {
        throw new Error("must not read Productions when uninitialised");
      },
    }),
    getGame: () => {
      throw new Error("must not read game when uninitialised");
    },
    getResources: () => {
      throw new Error("must not read resources when uninitialised");
    },
    getSettings: () => ({}),
    getJobs: () => ({}),
    getBuildings: () => ({}),
    haveTech: () => false,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  };
  const decision = planSmelter(readSmelterInput(throwing));
  assert.deepEqual(decision.fuelAdjustments, []);
  assert.deepEqual(decision.smeltAdjustments, []);
  assert.deepEqual(decision.tooltips, []);
}

// Adapter contract: a forge race never touches the fuel priority list.
{
  const f = buildFixture({ forge: true, counts: { Iron: 2, Steel: 1 } });
  f.SmelterManager.managedFuelPriorityList = () => {
    throw new Error("forge race must not read the fuel priority list");
  };
  const decision = planSmelter(
    readSmelterInput({
      getSmelterManager: () => f.SmelterManager,
      getGame: () => f.game,
      getResources: () => f.resources,
      getSettings: () => f.settings,
      getJobs: () => f.jobs,
      getBuildings: () => f.buildings,
      haveTech: f.haveTech,
      consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    }),
  );
  assert.deepEqual(decision.fuelAdjustments, []);
}

// Adapter contract: malformed manager throws at the boundary.
assert.throws(() =>
  readSmelterInput({
    getSmelterManager: () => null,
    getGame: () => ({ global: { race: {} } }),
    getResources: () => ({}),
    getSettings: () => ({}),
    getJobs: () => ({}),
    getBuildings: () => ({}),
    haveTech: () => false,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  }),
);

// Executor: a stale fuel count aborts without mutating.
{
  const f = buildFixture({
    counts: { Iron: 2, Steel: 0 },
    maxOperating: 4,
    fuels: [{ id: "Coal", count: 0 }],
  });
  const decision = planSmelter(
    readSmelterInput({
      getSmelterManager: () => f.SmelterManager,
      getGame: () => f.game,
      getResources: () => f.resources,
      getSettings: () => f.settings,
      getJobs: () => f.jobs,
      getBuildings: () => f.buildings,
      haveTech: f.haveTech,
      consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    }),
  );
  // Game state moves after sampling: the fuel is now already fueled.
  f.SmelterManager.Fuels.Coal.count = 3;
  const outcome = createSmelterCommandExecutor(() => f.SmelterManager).execute(
    decision,
  );
  assert.equal(outcome.status, "stale");
  assert.deepEqual(f.actions, [], "no mutation on stale precondition");
}

console.log("Smelter planner, adapter, and executor tests passed");
