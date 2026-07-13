import assert from "node:assert/strict";

import { createStorageExpansion } from "../src/planning/storage-expansion.ts";

let resources = {
  Crates: { maxQuantity: 2, currentQuantity: 0, cost: { Wood: 5 } },
  Containers: { maxQuantity: 1, currentQuantity: 0, cost: { Steel: 10 } },
  Wood: { currentQuantity: 10 },
  Steel: {
    currentQuantity: 10,
    maxQuantity: 100,
    storageRequired: 100,
    storageRatio: 1,
  },
  Plywood: { currentQuantity: 100 },
};
let settings = { storageLimitPreMad: false };
const calls = [];
const expansion = createStorageExpansion({
  getSettings: () => settings,
  getResources: () => resources,
  getBuildings: () => ({ Library: { count: 20, cost: { Plywood: 0 } } }),
  getStorageManager: () => ({
    crateValue: 10,
    containerValue: 100,
    constructCrate: (amount) => calls.push(["crate", amount]),
    constructContainer: (amount) => calls.push(["container", amount]),
  }),
  getIsEarlyGame: () => () => true,
  getIsLumberRace: () => () => true,
});

assert.equal(expansion.expandStorage(120), true);
assert.deepEqual(calls, [
  ["crate", 2],
  ["container", 1],
]);

resources = {
  ...resources,
  Crates: { maxQuantity: 0, currentQuantity: 0, cost: {} },
  Containers: { maxQuantity: 0, currentQuantity: 0, cost: {} },
};
settings = { storageLimitPreMad: true };
assert.equal(expansion.expandStorage(10), false);

console.log("Storage expansion module tests passed");
