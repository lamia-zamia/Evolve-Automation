import assert from "node:assert/strict";

import { planCapturedPowerProducers } from "../src/domain/economy/production/captured-power.ts";
import { createCapturedPowerProducerAutomation } from "../src/adapters/evolve/economy/production/captured-power-producers.ts";

assert.deepEqual(
  planCapturedPowerProducers({
    unlocked: true,
    surplus: -2,
    producers: [
      { id: "mill", count: 2, on: 1 },
      { id: "oil_power", count: 1, on: 1 },
    ],
  }),
  [{ producerId: "mill", maximumOn: 2 }],
);
assert.deepEqual(
  planCapturedPowerProducers({
    unlocked: false,
    surplus: -2,
    producers: [{ id: "mill", count: 2, on: 0 }],
  }),
  [],
);
assert.deepEqual(
  planCapturedPowerProducers({
    unlocked: true,
    surplus: 1,
    producers: [{ id: "mill", count: 2, on: 0 }],
  }),
  [],
);

const root = {
  city: {
    powered: true,
    power: -1,
    mill: { count: 2, on: 0 },
  },
  space: {
    geothermal: { count: 1, on: 0 },
  },
};
const calls = [];
const outcome = createCapturedPowerProducerAutomation({
  rootState: { readRoot: () => root },
  controls: {
    resolve: (elementId) =>
      elementId === "city-mill" || elementId === "space-geothermal"
        ? { elementId, generation: 1, methods: ["power_on"] }
        : undefined,
    invoke: (_handle, method) => {
      calls.push(method);
      if (_handle.elementId === "city-mill") root.city.mill.on += 1;
      else root.space.geothermal.on += 1;
      root.city.power = 1;
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => ["city-mill"],
  },
}).run();
assert.deepEqual(outcome, { status: "succeeded" });
assert.deepEqual(calls, ["power_on"]);
assert.equal(root.city.mill.on + root.space.geothermal.on, 1);

const regionalRoot = {
  city: { powered: true, power: -1 },
  space: { geothermal: { count: 1, on: 0 } },
};
const regionalCalls = [];
const regionalOutcome = createCapturedPowerProducerAutomation({
  rootState: { readRoot: () => regionalRoot },
  controls: {
    resolve: (elementId) =>
      elementId === "space-geothermal"
        ? { elementId, generation: 1, methods: ["power_on"] }
        : undefined,
    invoke: (handle) => {
      regionalCalls.push(handle.elementId);
      regionalRoot.space.geothermal.on += 1;
      regionalRoot.city.power = 1;
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => ["space-geothermal"],
  },
}).run();
assert.deepEqual(regionalOutcome, { status: "succeeded" });
assert.deepEqual(regionalCalls, ["space-geothermal"]);

console.log("captured-power-producers ok");
