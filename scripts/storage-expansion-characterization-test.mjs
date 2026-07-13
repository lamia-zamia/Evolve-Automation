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

assert.equal(typeof hooks.expandStorage, "function");
assert.equal(typeof hooks.setStorageExpansionTestContext, "function");

function makeContext({ preMad = false } = {}) {
  const calls = [];
  return {
    calls,
    game: {
      global: {
        race: { species: "human" },
        tech: {},
      },
    },
    settings: { storageLimitPreMad: preMad },
    resources: {
      Crates: { maxQuantity: 10, currentQuantity: 2, cost: { Wood: 10 } },
      Containers: {
        maxQuantity: 5,
        currentQuantity: 1,
        cost: { Steel: 20 },
      },
      Wood: { currentQuantity: 25 },
      Steel: {
        currentQuantity: 100,
        maxQuantity: 1000,
        storageRequired: 500,
        storageRatio: 0.9,
      },
      Plywood: { currentQuantity: 200 },
    },
    buildings: {
      Library: { count: 10, cost: { Plywood: 100 } },
    },
    StorageManager: {
      crateValue: 50,
      containerValue: 200,
      constructCrate: (amount) => calls.push(["crate", amount]),
      constructContainer: (amount) => calls.push(["container", amount]),
    },
  };
}

let context = makeContext();
hooks.setStorageExpansionTestContext(context);
assert.equal(hooks.expandStorage(300), true);
assert.deepEqual(context.calls, [
  ["crate", 2],
  ["container", 1],
]);
assert.deepEqual(
  {
    crates: context.resources.Crates.currentQuantity,
    containers: context.resources.Containers.currentQuantity,
    wood: context.resources.Wood.currentQuantity,
    steel: context.resources.Steel.currentQuantity,
  },
  { crates: 4, containers: 2, wood: 5, steel: 80 },
);

context = makeContext();
context.resources.Wood.currentQuantity = 0;
context.resources.Steel.currentQuantity = 0;
hooks.setStorageExpansionTestContext(context);
assert.equal(hooks.expandStorage(300), false);
assert.deepEqual(context.calls, [
  ["crate", 0],
  ["container", 0],
]);

context = makeContext({ preMad: true });
context.resources.Steel.storageRatio = 0.7;
context.resources.Plywood.currentQuantity = 50;
hooks.setStorageExpansionTestContext(context);
assert.equal(hooks.expandStorage(100), false);
assert.deepEqual(context.calls, [
  ["crate", 0],
  ["container", 0],
]);

context = makeContext({ preMad: true });
context.resources.Plywood.currentQuantity = 50;
hooks.setStorageExpansionTestContext(context);
assert.equal(hooks.expandStorage(100), true);
assert.deepEqual(context.calls, [
  ["crate", 0],
  ["container", 1],
]);

console.log("Storage expansion bundled characterization tests passed");
