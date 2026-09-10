import assert from "node:assert/strict";

import {
  createCapturedSupplyAutomation,
  SUPPLY_SUMMARY_CONTROL,
} from "../src/adapters/evolve/economy/resources/captured-supply.ts";

const root = {
  race: { artifical: false },
  resource: {
    Supply: { amount: 0, max: 100 },
    Copper: { amount: 100, max: 100, diff: 0, display: true },
  },
  portal: {
    bireme: { count: 1, on: 1 },
    transport: { count: 1, on: 1, cargo: { max: 2, Copper: 0 } },
  },
};

const calls = [];
const controls = {
  resolve: (elementId) =>
    elementId === SUPPLY_SUMMARY_CONTROL || elementId === "supplyCopper"
      ? {
          elementId,
          generation: 1,
          methods:
            elementId === SUPPLY_SUMMARY_CONTROL
              ? ["max"]
              : ["supplyMore", "supplyLess"],
        }
      : undefined,
  invoke: (_handle, method, args = []) => {
    calls.push([method, ...args]);
    const id = args[0];
    root.portal.transport.cargo[id] += method === "supplyMore" ? 1 : -1;
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => [SUPPLY_SUMMARY_CONTROL, "supplyCopper"],
};

const demand = {
  requestedQuantity: () => 0,
  isDemanded: () => false,
  storageRequired: () => 1,
};

const settings = {
  autoSupply: true,
  supplyMode: "cap",
  res_supplyCopper: true,
};
const automation = createCapturedSupplyAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => settings,
  readDemand: () => demand,
});

assert.equal(automation.run().status, "succeeded");
assert.deepEqual(calls, [["supplyMore", "Copper"]]);
assert.equal(root.portal.transport.cargo.Copper, 1);

// A disabled resource releases its existing cargo allocation.
settings.res_supplyCopper = false;
calls.length = 0;
assert.equal(automation.run().status, "succeeded");
assert.deepEqual(calls, [["supplyLess", "Copper"]]);
assert.equal(root.portal.transport.cargo.Copper, 0);

// The Lake usefulness gate still clears stale allocations when either structure is off.
root.portal.transport.cargo.Copper = 1;
root.portal.bireme.on = 0;
calls.length = 0;
assert.equal(automation.run().status, "succeeded");
assert.deepEqual(calls, [["supplyLess", "Copper"]]);
assert.equal(root.portal.transport.cargo.Copper, 0);

// An unknown static row fails closed without producing a command.
root.portal.bireme.on = 1;
settings.res_supplyCopper = true;
const unknownControls = {
  ...controls,
  capturedElementIds: () => ["supplyUnknown"],
};
assert.equal(
  createCapturedSupplyAutomation({
    rootState: { readRoot: () => root },
    controls: unknownControls,
    readSettings: () => settings,
    readDemand: () => demand,
  }).run().status,
  "succeeded",
);
assert.equal(root.portal.transport.cargo.Copper, 0);

// A root replacement during a click rejects the remaining write sequence.
root.portal.transport.cargo.Copper = 0;
let currentRoot = root;
const staleControls = {
  ...controls,
  invoke: () => {
    currentRoot = structuredClone(root);
    return { ok: true, value: undefined };
  },
};
const staleOutcome = createCapturedSupplyAutomation({
  rootState: { readRoot: () => currentRoot },
  controls: staleControls,
  readSettings: () => settings,
  readDemand: () => demand,
}).run();
assert.equal(staleOutcome.status, "stale");

console.log("captured-supply ok");
