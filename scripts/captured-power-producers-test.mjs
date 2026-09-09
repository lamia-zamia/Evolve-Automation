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
};
const calls = [];
const outcome = createCapturedPowerProducerAutomation({
  rootState: { readRoot: () => root },
  controls: {
    resolve: (elementId) =>
      elementId === "city-mill"
        ? { elementId, generation: 1, methods: ["power_on"] }
        : undefined,
    invoke: (_handle, method) => {
      calls.push(method);
      root.city.mill.on += 1;
      root.city.power = 1;
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => ["city-mill"],
  },
}).run();
assert.deepEqual(outcome, { status: "succeeded" });
assert.deepEqual(calls, ["power_on"]);
assert.equal(root.city.mill.on, 1);

console.log("captured-power-producers ok");
