import assert from "node:assert/strict";

import {
  createCapturedEjectorAutomation,
  EJECTOR_SUMMARY_CONTROL,
} from "../src/adapters/evolve/economy/resources/captured-ejector.ts";

const root = {
  race: { artifical: false },
  resource: {
    Food: { amount: 100, max: 100, diff: 0, display: true },
    Copper: { amount: 100, max: 100, diff: 0, display: true },
    Iron: { amount: 100, max: 100, diff: 0, display: true },
  },
  interstellar: {
    mass_ejector: { count: 1, on: 1, Food: 0, Copper: 0, Iron: 0 },
  },
};

const calls = [];
const controls = {
  resolve: (elementId) =>
    elementId === EJECTOR_SUMMARY_CONTROL ||
    elementId === "ejectFood" ||
    elementId === "ejectCopper" ||
    elementId === "ejectIron"
      ? {
          elementId,
          generation: 1,
          methods:
            elementId === EJECTOR_SUMMARY_CONTROL
              ? ["max"]
              : ["ejectMore", "ejectLess"],
        }
      : undefined,
  invoke: (_handle, method, args = []) => {
    calls.push([method, ...args]);
    const id = args[0];
    root.interstellar.mass_ejector[id] += method === "ejectMore" ? 1 : -1;
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => [
    EJECTOR_SUMMARY_CONTROL,
    "ejectFood",
    "ejectCopper",
    "ejectIron",
  ],
};

const demand = {
  requestedQuantity: () => 0,
  isDemanded: () => false,
  storageRequired: () => 1,
};

const automation = createCapturedEjectorAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    autoEject: true,
    ejectMode: "cap",
    res_ejectFood: true,
    res_ejectCopper: true,
    res_ejectIron: true,
  }),
  readDemand: () => demand,
});

assert.equal(automation.run().status, "succeeded");
assert.deepEqual(calls, [
  ["ejectMore", "Food"],
  ["ejectMore", "Food"],
  ["ejectMore", "Copper"],
  ["ejectMore", "Copper"],
  ["ejectMore", "Iron"],
  ["ejectMore", "Iron"],
]);
assert.equal(root.interstellar.mass_ejector.Food, 2);
assert.equal(root.interstellar.mass_ejector.Copper, 2);
assert.equal(root.interstellar.mass_ejector.Iron, 2);

// A disabled row is not assigned, while an existing assignment is removed.
root.interstellar.mass_ejector.Copper = 2;
root.interstellar.mass_ejector.Iron = 0;
calls.length = 0;
const disabled = createCapturedEjectorAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    autoEject: true,
    ejectMode: "cap",
    res_ejectFood: false,
    res_ejectCopper: false,
    res_ejectIron: false,
  }),
  readDemand: () => demand,
});
assert.equal(disabled.run().status, "succeeded");
assert.deepEqual(calls, [
  ["ejectLess", "Food"],
  ["ejectLess", "Food"],
  ["ejectLess", "Copper"],
  ["ejectLess", "Copper"],
]);
assert.equal(root.interstellar.mass_ejector.Food, 0);
assert.equal(root.interstellar.mass_ejector.Copper, 0);

// Artificial races cannot eject Food, matching EjectManager.managedPriorityList().
root.race.artifical = true;
root.interstellar.mass_ejector.Food = 3;
calls.length = 0;
assert.equal(
  createCapturedEjectorAutomation({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ autoEject: true, ejectMode: "cap" }),
    readDemand: () => demand,
  }).run().status,
  "succeeded",
);
assert.deepEqual(calls, []);
assert.equal(root.interstellar.mass_ejector.Food, 3);

// Invalid modes fail closed, and autoEject off is inert.
root.race.artifical = false;
root.interstellar.mass_ejector.Food = 0;
calls.length = 0;
assert.equal(
  createCapturedEjectorAutomation({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ autoEject: true, ejectMode: "bogus" }),
    readDemand: () => demand,
  }).run().status,
  "succeeded",
);
assert.deepEqual(calls, []);
assert.equal(
  createCapturedEjectorAutomation({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ autoEject: false }),
    readDemand: () => demand,
  }).run().status,
  "succeeded",
);

// A root replacement during execution rejects the remaining write sequence.
root.interstellar.mass_ejector.Food = 0;
let currentRoot = root;
const staleControls = {
  ...controls,
  invoke: () => {
    currentRoot = structuredClone(root);
    return { ok: true, value: undefined };
  },
};
const staleOutcome = createCapturedEjectorAutomation({
  rootState: { readRoot: () => currentRoot },
  controls: staleControls,
  readSettings: () => ({
    autoEject: true,
    ejectMode: "cap",
    res_ejectFood: true,
  }),
  readDemand: () => demand,
}).run();
assert.equal(staleOutcome.status, "stale");

console.log("captured-ejector ok");
