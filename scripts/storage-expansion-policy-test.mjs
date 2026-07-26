import assert from "node:assert/strict";

import { planStorageExpansion } from "../src/domain/economy/storage/storage-expansion.ts";

function snapshot(overrides = {}) {
  return {
    metadata: { id: "storage-policy", capturedAtMs: 0 },
    storageToBuild: 50,
    crates: {
      resourceId: "Crates",
      maxQuantity: 10,
      currentQuantity: 0,
      storagePerUnit: 50,
      costs: [{ resourceId: "Plywood", costPerUnit: 10, available: 10 }],
    },
    containers: {
      resourceId: "Containers",
      maxQuantity: 10,
      currentQuantity: 0,
      storagePerUnit: 200,
      costs: [{ resourceId: "Steel", costPerUnit: 125, available: 125 }],
    },
    isEarlyGame: true,
    isLumberRace: false,
    steel: { storageRatio: 1, maxQuantity: 50, storageRequired: 50 },
    library: { count: 20, plywoodCost: 10 },
    plywoodAvailable: 10,
    ...overrides,
  };
}

const containerFirst = planStorageExpansion(snapshot(), {
  storageLimitPreMad: false,
});
assert.deepEqual(
  containerFirst.map(({ unit, count }) => ({ unit, count })),
  [
    { unit: "container", count: 1 },
    { unit: "crate", count: 0 },
  ],
);

const crateFallback = planStorageExpansion(
  snapshot({
    containers: {
      resourceId: "Containers",
      maxQuantity: 10,
      currentQuantity: 0,
      storagePerUnit: 200,
      costs: [{ resourceId: "Steel", costPerUnit: 125, available: 50 }],
    },
  }),
  { storageLimitPreMad: false },
);
assert.deepEqual(
  crateFallback.map(({ unit, count }) => ({ unit, count })),
  [
    { unit: "container", count: 0 },
    { unit: "crate", count: 1 },
  ],
);

console.log("Storage expansion policy tests passed");
