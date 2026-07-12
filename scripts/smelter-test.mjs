import assert from "node:assert/strict";

import { createAutoSmelter } from "../src/subsystems/smelter.js";

function makeResource(name, overrides = {}) {
  return {
    name,
    currentQuantity: 10_000,
    rateOfChange: 100,
    storageRatio: 0.5,
    timeToFull: 0,
    timeToRequired: 0,
    isCapped: () => false,
    isDemanded: () => false,
    ...overrides,
  };
}

function runSmelterCase({ initialized = true } = {}) {
  const actions = [];
  const coal = makeResource("Coal");
  const resources = {
    Coal: coal,
    Iron: makeResource("Iron"),
    Steel: makeResource("Steel", { timeToFull: 10 }),
    Iridium: makeResource("Iridium"),
    Titanium: makeResource("Titanium"),
  };
  const coalFuel = {
    id: "Coal",
    unlocked: true,
    cost: [{ resource: coal, quantity: 1, minRateOfChange: 0 }],
  };
  const productions = {
    Iron: { id: "Iron", cost: [] },
    Steel: { id: "Steel", cost: [] },
    Iridium: { id: "Iridium", unlocked: false, cost: [] },
  };
  const counts = { Iron: 2, Steel: 0, Iridium: 0 };
  const SmelterManager = {
    Fuels: { Coal: coalFuel, Inferno: { id: "Inferno" }, Oil: { id: "Oil" } },
    Productions: productions,
    initIndustry: () => initialized,
    maxOperating: () => 2,
    extraOperating: () => 0,
    managedFuelPriorityList: () => [coalFuel],
    fueledCount: () => 0,
    increaseFuel: (fuel, count) => actions.push(["increaseFuel", fuel.id, count]),
    decreaseFuel: (fuel, count) => actions.push(["decreaseFuel", fuel.id, count]),
    smeltingCount: (production) => counts[production.id],
    increaseSmelting: (id, count) => actions.push(["increaseSmelting", id, count]),
    decreaseSmelting: (id, count) => actions.push(["decreaseSmelting", id, count]),
  };
  const state = { tooltips: {} };
  const autoSmelter = createAutoSmelter({
    SmelterManager,
    getGame: () => ({ global: { race: {} } }),
    getState: () => state,
    getSettings: () => ({
      productionSmeltingIridium: 0,
      productionSmelting: "steel",
    }),
    getResources: () => resources,
    getJobs: () => ({ Miner: { count: 1 } }),
    getBuildings: () => ({ BeltIronShip: { stateOnCount: 0 } }),
    haveTech: () => false,
  });

  autoSmelter();
  return { actions, state };
}

const allocation = runSmelterCase();
assert.deepEqual(allocation.actions, [
  ["increaseFuel", "Coal", 2],
  ["decreaseSmelting", "Iron", 1],
  ["increaseSmelting", "Steel", 1],
]);

const unavailable = runSmelterCase({ initialized: false });
assert.deepEqual(
  unavailable.actions,
  [],
  "an unavailable smelter industry must not be adjusted",
);

console.log("Smelter automation regression tests passed");
