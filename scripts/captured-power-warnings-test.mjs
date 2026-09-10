import assert from "node:assert/strict";

import { createCapturedPowerWarningAutomation } from "../src/adapters/evolve/economy/production/captured-power-warnings.ts";

function runCase({
  root,
  settings = {},
  ids,
  invoke = () => ({ ok: true, value: undefined }),
}) {
  const calls = [];
  const automation = createCapturedPowerWarningAutomation({
    rootState: { readRoot: () => root },
    controls: {
      resolve: (elementId) =>
        ids.includes(elementId)
          ? { elementId, generation: 1, methods: ["power_off"] }
          : undefined,
      invoke: (handle, method) => {
        calls.push(`${handle.elementId}.${method}`);
        return invoke(handle, method);
      },
    },
    getDocument: () => ({
      querySelectorAll: () => ids.map((id) => ({ parentElement: { id } })),
    }),
    readSettings: () => settings,
  });
  return { outcome: automation.run(), calls };
}

const root = {
  race: {},
  resource: { Belt_Support: { max: 100 }, Lake_Support: { max: 100 } },
  city: { farm: { count: 2, on: 2 } },
};
assert.deepEqual(runCase({ root, ids: ["city-farm"] }), {
  outcome: { status: "succeeded" },
  calls: ["city-farm.power_off"],
});

assert.deepEqual(
  runCase({ root, settings: { bld_s_farm: false }, ids: ["city-farm"] }),
  { outcome: { status: "succeeded" }, calls: [] },
);

const lakeRoot = {
  race: {},
  resource: { Belt_Support: { max: 100 }, Lake_Support: { max: 1 } },
  portal: {
    bireme: { count: 2, on: 2 },
    transport: { count: 1, on: 1 },
  },
};
assert.deepEqual(runCase({ root: lakeRoot, ids: ["portal-transport"] }).calls, [
  "portal-transport.power_off",
]);

const supportedLake = structuredClone(lakeRoot);
supportedLake.resource.Lake_Support.max = 3;
assert.deepEqual(
  runCase({ root: supportedLake, ids: ["portal-transport"] }).calls,
  [],
);

assert.deepEqual(runCase({ root, ids: ["city-missing"] }).outcome, {
  status: "succeeded",
});

console.log("Captured power-warning adapter tests passed");
