import assert from "node:assert/strict";

import {
  createCapturedNaniteAutomation,
  NANITE_CONTROL,
} from "../src/adapters/evolve/economy/resources/captured-nanite.ts";

const root = {
  race: { deconstructor: true },
  resource: {
    Nanite: { amount: 0, max: 100, display: true },
    Copper: { amount: 100, max: 100, diff: 0, display: true },
    Iron: { amount: 100, max: 100, diff: 0, display: true },
  },
  city: { nanite_factory: { count: 1, Copper: 0, Iron: 0 } },
};

const calls = [];
const controls = {
  resolve: (elementId) =>
    elementId === NANITE_CONTROL
      ? { elementId, generation: 1, methods: ["addItem", "subItem"] }
      : undefined,
  invoke: (_handle, method, args = []) => {
    calls.push([method, ...args]);
    const id = args[0];
    root.city.nanite_factory[id] += method === "addItem" ? 1 : -1;
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => [NANITE_CONTROL],
};

const demand = {
  requestedQuantity: () => 0,
  isDemanded: () => false,
  storageRequired: () => 1,
};

const automation = createCapturedNaniteAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    autoNanite: true,
    naniteMode: "cap",
    res_naniteCopper: true,
    res_naniteIron: true,
  }),
  readDemand: () => demand,
});

assert.equal(automation.run().status, "succeeded");
// Copper is first in the mass-ordered list and receives the cap allocation before Iron.
assert.deepEqual(calls, [
  ["addItem", "Copper"],
  ["addItem", "Copper"],
  ["addItem", "Copper"],
  ["addItem", "Copper"],
  ["addItem", "Iron"],
  ["addItem", "Iron"],
  ["addItem", "Iron"],
  ["addItem", "Iron"],
]);
assert.equal(root.city.nanite_factory.Copper, 4);
assert.equal(root.city.nanite_factory.Iron, 4);

// A disabled resource is not consumed, while an existing allocation is safely removed.
root.city.nanite_factory.Copper = 2;
root.city.nanite_factory.Iron = 0;
calls.length = 0;
const disabled = createCapturedNaniteAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    autoNanite: true,
    naniteMode: "cap",
    res_naniteCopper: false,
    res_naniteIron: false,
  }),
  readDemand: () => demand,
});
assert.equal(disabled.run().status, "succeeded");
assert.deepEqual(calls, [
  ["subItem", "Copper"],
  ["subItem", "Copper"],
]);
assert.equal(root.city.nanite_factory.Copper, 0);

// The full mode's final 0.035 pass uses the remaining factory capacity after the cap pass.
root.city.nanite_factory.Copper = 0;
root.city.nanite_factory.Iron = 0;
calls.length = 0;
const full = createCapturedNaniteAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    autoNanite: true,
    naniteMode: "full",
    res_naniteCopper: true,
  }),
  readDemand: () => demand,
});
assert.equal(full.run().status, "succeeded");
assert.equal(root.city.nanite_factory.Copper, 50);

// Full Nanite storage clears an existing split so the factory stops consuming.
root.resource.Nanite.amount = 100;
calls.length = 0;
assert.equal(automation.run().status, "succeeded");
assert.equal(calls.length, 50);
assert.ok(
  calls.every(([method, id]) => method === "subItem" && id === "Copper"),
);
assert.equal(root.city.nanite_factory.Copper, 0);

// A disabled setting, locked race, missing factory, and malformed resources all fail closed.

const noMode = createCapturedNaniteAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({ autoNanite: false }),
  readDemand: () => demand,
});
assert.equal(noMode.run().status, "succeeded");

const invalidMode = createCapturedNaniteAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({ autoNanite: true, naniteMode: "bogus" }),
  readDemand: () => demand,
});
calls.length = 0;
assert.equal(invalidMode.run().status, "succeeded");
assert.deepEqual(calls, []);

const locked = structuredClone(root);
locked.race.deconstructor = false;
assert.equal(
  createCapturedNaniteAutomation({
    rootState: { readRoot: () => locked },
    controls,
    readSettings: () => ({ autoNanite: true }),
    readDemand: () => demand,
  }).run().status,
  "succeeded",
);

const malformed = structuredClone(root);
malformed.resource.Nanite.amount = 0;
malformed.resource.Iron.diff = "not a rate";
assert.equal(
  createCapturedNaniteAutomation({
    rootState: { readRoot: () => malformed },
    controls,
    readSettings: () => ({ autoNanite: true }),
    readDemand: () => demand,
  }).run().status,
  "succeeded",
);

// A root replacement during execution rejects the remaining write sequence.
root.resource.Nanite.amount = 0;
root.city.nanite_factory.Copper = 0;
let currentRoot = root;
const staleControls = {
  ...controls,
  invoke: () => {
    currentRoot = structuredClone(root);
    return { ok: true, value: undefined };
  },
};
const staleOutcome = createCapturedNaniteAutomation({
  rootState: { readRoot: () => currentRoot },
  controls: staleControls,
  readSettings: () => ({
    autoNanite: true,
    naniteMode: "cap",
    res_naniteCopper: true,
  }),
  readDemand: () => demand,
}).run();
assert.equal(staleOutcome.status, "stale");

console.log("captured-nanite ok");
