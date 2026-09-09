import assert from "node:assert/strict";

import {
  createCapturedReplicatorAutomation,
  REPLICATOR_CONTROL,
} from "../src/adapters/evolve/economy/production/captured-replicator.ts";

const root = {
  race: { replicator: {} },
  tech: { replicator: 1 },
  resource: {
    Food: { amount: 100, max: 100, display: true },
    Lumber: { amount: 100, max: 100, display: true },
    Iron: { amount: 0, max: 100, display: true },
    Elerium: { amount: 100, max: 100, display: true },
    Asphodel_Powder: { amount: 0, max: 100, display: true },
    Super_Fuel: { amount: 0, max: 100, display: true },
  },
};
const calls = [];
const controls = {
  capturedElementIds: () => [REPLICATOR_CONTROL],
  resolve: (elementId) =>
    elementId === REPLICATOR_CONTROL
      ? { elementId, generation: 1, methods: ["setVal"] }
      : undefined,
  invoke: (_handle, method, args) => {
    calls.push([method, args]);
    root.race.replicator.res = args[0];
    return { ok: true, value: undefined };
  },
};

const automation = createCapturedReplicatorAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    replicatorWeightingMode: "mass",
    replicator_p_Elerium: 2,
  }),
  readDemand: () => ({
    requestedQuantity: () => 0,
    isDemanded: (id) => id === "Elerium",
    storageRequired: () => 1,
  }),
});

assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(calls, [["setVal", ["Elerium"]]]);
assert.equal(root.race.replicator.res, "Elerium");

root.resource.Elerium.display = false;
root.race.fasting = true;
root.race.iceage = true;
root.resource.Iron.amount = 100;
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(calls, [["setVal", ["Elerium"]]]);

root.race.fasting = false;
root.race.iceage = false;
root.resource.Iron.amount = Number.NaN;
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(calls, [["setVal", ["Elerium"]]]);

root.resource.Iron.amount = 0;
root.tech.replicator = 0;
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(calls, [["setVal", ["Elerium"]]]);

console.log("Captured replicator selection tests passed");
