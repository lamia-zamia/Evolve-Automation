import assert from "node:assert/strict";

import {
  createCapturedReplicatorAutomation,
  GOVERNOR_CONTROL,
  REPLICATOR_CONTROL,
} from "../src/adapters/evolve/economy/production/captured-replicator.ts";

const root = {
  race: {
    replicator: {},
    governor: {
      tasks: { t0: "none", t1: "none", t2: "none" },
      config: {
        replicate: {
          pow: { on: false, cap: 10000 },
          res: { que: true, neg: true, cap: true },
        },
      },
    },
  },
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
const governorCalls = [];
let settings = {
  replicatorWeightingMode: "mass",
  replicator_p_Elerium: 2,
};
const controls = {
  capturedElementIds: () => [REPLICATOR_CONTROL, GOVERNOR_CONTROL],
  resolve: (elementId) =>
    elementId === REPLICATOR_CONTROL
      ? { elementId, generation: 1, methods: ["setVal"] }
      : elementId === GOVERNOR_CONTROL
        ? { elementId, generation: 1, methods: ["setTask"] }
        : undefined,
  invoke: (handle, method, args) => {
    if (handle.elementId === GOVERNOR_CONTROL) {
      governorCalls.push([method, args]);
      root.race.governor.tasks[`t${args[1]}`] = args[0];
    } else {
      calls.push([method, args]);
      root.race.replicator.res = args[0];
    }
    return { ok: true, value: undefined };
  },
};

const automation = createCapturedReplicatorAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => settings,
  readDemand: () => ({
    requestedQuantity: () => 0,
    isDemanded: (id) => id === "Elerium",
    storageRequired: () => 1,
  }),
});

assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(calls, [["setVal", ["Elerium"]]]);

settings = {
  ...settings,
  replicatorAssignGovernorTask: true,
  replicator_Iron: false,
  replicator_Elerium: false,
};
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(governorCalls, [["setTask", ["replicate", 0]]]);
assert.equal(root.race.governor.tasks.t0, "replicate");
assert.equal(root.race.governor.config.replicate.pow.on, true);
assert.equal(root.race.governor.config.replicate.pow.cap, 1e12);
assert.equal(root.race.governor.config.replicate.res.que, false);
assert.equal(root.race.governor.config.replicate.res.neg, false);
assert.equal(root.race.governor.config.replicate.res.cap, false);
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
