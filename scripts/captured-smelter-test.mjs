import assert from "node:assert/strict";

import { createCapturedSmelterAutomation } from "../src/adapters/evolve/economy/production/captured-smelter.ts";

const root = {
  race: {},
  tech: { smelting: 2, titanium: 1 },
  resource: {
    Iron: { name: "Iron", amount: 50, max: 100, diff: 1, display: true },
    Steel: { name: "Steel", amount: 0, max: 100, diff: 10, display: true },
    Titanium: {
      name: "Titanium",
      amount: 10,
      max: 100,
      diff: 1,
      display: true,
    },
    Coal: { name: "Coal", amount: 1000, max: 2000, diff: 100, display: true },
    Lumber: {
      name: "Lumber",
      amount: 1000,
      max: 2000,
      diff: 100,
      display: true,
    },
    Oil: { name: "Oil", amount: 0, max: 0, diff: 0, display: false },
    Super_Fuel: {
      name: "Super Fuel",
      amount: 0,
      max: 100,
      diff: 0,
      display: false,
    },
  },
  city: {
    smelter: {
      count: 2,
      cap: 2,
      Star: 0,
      Iron: 2,
      Steel: 0,
      Iridium: 0,
      Coal: 2,
      Oil: 0,
      Wood: 0,
      Inferno: 0,
      Super: 0,
    },
  },
  civic: { miner: { workers: 1 } },
  space: { iron_ship: { on: 0 } },
};

const calls = [];
const controls = {
  resolve: (elementId) =>
    elementId === "iSmelter"
      ? {
          elementId,
          generation: 1,
          methods: ["addFuel", "subFuel", "addMetal", "subMetal"],
        }
      : undefined,
  invoke: (_handle, method, args = []) => {
    calls.push([method, ...args]);
    const id = args[0];
    if (method === "addMetal") {
      const metal =
        root.city.smelter.Iron +
        root.city.smelter.Steel +
        root.city.smelter.Iridium;
      const fuel =
        root.city.smelter.Coal +
        root.city.smelter.Wood +
        root.city.smelter.Oil +
        root.city.smelter.Inferno +
        root.city.smelter.Super;
      if (metal < fuel) root.city.smelter[id] += 1;
      else {
        root.city.smelter.Iron -= 1;
        root.city.smelter[id] += 1;
      }
    } else if (method === "subMetal") {
      root.city.smelter[id] -= 1;
    } else if (method === "addFuel") {
      root.city.smelter[id] += 1;
    } else {
      root.city.smelter[id] -= 1;
    }
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => ["iSmelter"],
};

const automation = createCapturedSmelterAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({ productionSmelting: "steel" }),
  readDemand: () => ({
    requestedQuantity: () => 0,
    isDemanded: () => false,
    storageRequired: () => 1,
  }),
});

const outcome = automation.run();
assert.equal(outcome.status, "succeeded", JSON.stringify(outcome));
assert.deepEqual(calls, [
  ["subMetal", "Iron"],
  ["addMetal", "Steel"],
]);
assert.equal(root.city.smelter.Iron, 1);
assert.equal(root.city.smelter.Steel, 1);

const unavailable = createCapturedSmelterAutomation({
  rootState: { readRoot: () => root },
  controls: { ...controls, resolve: () => undefined },
  readSettings: () => ({}),
});
assert.equal(unavailable.run().status, "succeeded");

root.tech.super_fuel = 2;
root.resource.Super_Fuel.display = true;
root.resource.Super_Fuel.amount = 100;
root.resource.Super_Fuel.diff = 10;
root.city.smelter.cap = 4;
root.city.smelter.Iron = 4;
root.city.smelter.Steel = 0;
root.city.smelter.Super = 0;
root.city.smelter.Coal = 0;
root.city.smelter.Wood = 0;
root.city.smelter.Oil = 0;
root.city.smelter.Inferno = 0;
calls.length = 0;

const superFuelAutomation = createCapturedSmelterAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    productionSmelting: "steel",
    smelter_fuel_p_super: 0,
  }),
});
assert.equal(superFuelAutomation.run().status, "succeeded");
assert.equal(root.city.smelter.Super, 4);
assert.equal(root.city.smelter.cap, 4);
assert.deepEqual(
  calls.filter(([method]) => method === "addFuel"),
  [
    ["addFuel", "Super"],
    ["addFuel", "Super"],
    ["addFuel", "Super"],
    ["addFuel", "Super"],
  ],
);

root.resource.Super_Fuel = undefined;
calls.length = 0;
assert.equal(
  createCapturedSmelterAutomation({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ smelter_fuel_p_super: 0 }),
  }).run().status,
  "succeeded",
);
assert.deepEqual(calls, []);

console.log("captured-smelter ok");
