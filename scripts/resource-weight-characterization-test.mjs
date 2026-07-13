import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.findRequiredResourceWeight, "function");
assert.equal(typeof hooks.setResourceWeightTestContext, "function");
hooks.setResourceWeightTestContext({
  state: {
    unlockedBuildings: [
      { cost: { Iron: 100, Copper: 5 }, weighting: 40 },
      { cost: { Iron: 200 }, weighting: 90 },
      { cost: {}, weighting: 100 },
    ],
  },
});

assert.equal(
  hooks.findRequiredResourceWeight({ id: "Iron", currentQuantity: 100 }),
  90,
);
assert.equal(
  hooks.findRequiredResourceWeight({ id: "Iron", currentQuantity: 50 }),
  40,
);
assert.equal(
  hooks.findRequiredResourceWeight({ id: "Copper", currentQuantity: 0 }),
  40,
);
assert.equal(
  hooks.findRequiredResourceWeight({ id: "Money", currentQuantity: 0 }),
  undefined,
);

console.log("Resource weight bundled characterization tests passed");
