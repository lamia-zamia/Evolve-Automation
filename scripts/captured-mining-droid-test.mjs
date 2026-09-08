import assert from "node:assert/strict";

import {
  createCapturedMiningDroidAutomation,
  MINING_DROID_CONTROL,
} from "../src/adapters/evolve/economy/production/captured-mining-droid.ts";

const root = {
  interstellar: {
    mining_droid: { count: 1, on: 6, adam: 0, uran: 0, coal: 0, alum: 0 },
  },
  resource: Object.fromEntries(
    ["Adamantite", "Uranium", "Coal", "Aluminium"].map((id) => [
      id,
      { amount: 0, max: 100, display: true },
    ]),
  ),
};
const calls = [];
const controls = {
  capturedElementIds: () => [MINING_DROID_CONTROL],
  resolve: (elementId) =>
    elementId === MINING_DROID_CONTROL
      ? { elementId, generation: 1, methods: ["addItem", "subItem"] }
      : undefined,
  invoke: (_handle, method, args) => {
    calls.push([method, args]);
    const id = args[0];
    root.interstellar.mining_droid[id] += method === "addItem" ? 1 : -1;
    return { ok: true, value: undefined };
  },
};

const automation = createCapturedMiningDroidAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({}),
});

assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(root.interstellar.mining_droid, {
  count: 1,
  on: 6,
  adam: 3,
  uran: 1,
  coal: 1,
  alum: 1,
});
assert.equal(calls.length, 6);

for (const id of ["Adamantite", "Uranium", "Coal", "Aluminium"]) {
  root.resource[id].amount = 100;
}
assert.deepEqual(automation.run(), { status: "succeeded" });
assert.deepEqual(root.interstellar.mining_droid, {
  count: 1,
  on: 6,
  adam: 3,
  uran: 1,
  coal: 1,
  alum: 1,
});
assert.equal(calls.length, 6);

console.log("Captured mining-droid adapter and bounded policy tests passed");
