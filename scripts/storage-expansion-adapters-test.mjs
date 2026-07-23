import assert from "node:assert/strict";

import { createStorageCommandExecutor } from "../src/adapters/evolve/economy/storage/storage-command-executor.ts";
import { createEvolveStorageExpansionReader } from "../src/adapters/evolve/economy/storage/storage-expansion-reader.ts";

const clock = Object.freeze({ nowMs: () => 5 });

function readerDeps(overrides = {}) {
  return {
    clock,
    getStorageToBuild: () => 100,
    getResources: () => ({
      Crates: { maxQuantity: 10, currentQuantity: 2, cost: { Wood: 10 } },
      Containers: { maxQuantity: 5, currentQuantity: 1, cost: { Steel: 20 } },
      Wood: { currentQuantity: 25 },
      Steel: {
        currentQuantity: 100,
        maxQuantity: 1000,
        storageRequired: 500,
        storageRatio: 0.9,
      },
      Plywood: { currentQuantity: 200 },
    }),
    getBuildings: () => ({ Library: { count: 10, cost: { Plywood: 100 } } }),
    getStorageManager: () => ({ crateValue: 50, containerValue: 200 }),
    isEarlyGame: () => true,
    isLumberRace: () => false,
    ...overrides,
  };
}

// Valid mapping.
const snapshot =
  createEvolveStorageExpansionReader(readerDeps()).readSnapshot();
assert.equal(snapshot.storageToBuild, 100);
assert.equal(snapshot.crates.storagePerUnit, 50);
assert.equal(snapshot.containers.storagePerUnit, 200);
assert.deepEqual(snapshot.crates.costs, [
  { resourceId: "Wood", costPerUnit: 10, available: 25 },
]);
assert.equal(snapshot.isEarlyGame, true);
assert.equal(snapshot.isLumberRace, false);
assert.equal(snapshot.library.plywoodCost, 100);
assert.ok(Object.isFrozen(snapshot));
assert.ok(Object.isFrozen(snapshot.crates));

// Absent / malformed Plywood cost maps to null (preserving `undefined > x === false`).
assert.equal(
  createEvolveStorageExpansionReader(
    readerDeps({ getBuildings: () => ({ Library: { count: 3, cost: {} } }) }),
  ).readSnapshot().library.plywoodCost,
  null,
);
assert.equal(
  createEvolveStorageExpansionReader(
    readerDeps({ getBuildings: () => ({ Library: { count: 3 } }) }),
  ).readSnapshot().library.plywoodCost,
  null,
);

// Truthy non-boolean predicates normalize to boolean.
assert.equal(
  createEvolveStorageExpansionReader(
    readerDeps({ isEarlyGame: () => 1, isLumberRace: () => 0 }),
  ).readSnapshot().isEarlyGame,
  true,
);

// Malformed game data throws at the boundary.
assert.throws(() =>
  createEvolveStorageExpansionReader(
    readerDeps({ getStorageManager: () => ({ crateValue: 50 }) }),
  ).readSnapshot(),
);
assert.throws(() =>
  createEvolveStorageExpansionReader(
    readerDeps({
      getResources: () => ({
        Crates: { maxQuantity: 10, currentQuantity: 2, cost: { Wood: 10 } },
        Containers: { maxQuantity: 5, currentQuantity: 1, cost: { Steel: 20 } },
        // Wood missing -> cost resource lookup throws
        Steel: {
          currentQuantity: 100,
          maxQuantity: 1000,
          storageRequired: 500,
          storageRatio: 0.9,
        },
        Plywood: { currentQuantity: 200 },
      }),
    }),
  ).readSnapshot(),
);

// --- Executor ---

function makeResources() {
  return {
    Crates: { currentQuantity: 2 },
    Containers: { currentQuantity: 1 },
    Wood: { currentQuantity: 100 },
  };
}

function makeExecutor(calls, resources) {
  return createStorageCommandExecutor({
    getStorageManager: () => ({
      constructCrate: (n) => calls.push(["crate", n]),
      constructContainer: (n) => calls.push(["container", n]),
    }),
    getResources: () => resources,
  });
}

// Valid crate build: unconditional call plus optimistic model reconciliation.
let calls = [];
let resources = makeResources();
let outcome = makeExecutor(calls, resources).execute({
  id: "c1",
  expectedSnapshotId: "s1",
  command: {
    kind: "construct-storage",
    unit: "crate",
    count: 3,
    storagePerUnit: 50,
    producedResourceId: "Crates",
    spend: [{ resourceId: "Wood", amount: 30 }],
  },
});
assert.equal(outcome.status, "succeeded");
assert.deepEqual(calls, [["crate", 3]]);
assert.equal(resources.Crates.currentQuantity, 5);
assert.equal(resources.Wood.currentQuantity, 70);

// Negative count is preserved (no-op call in-game, reversed model reconciliation).
calls = [];
resources = makeResources();
makeExecutor(calls, resources).execute({
  id: "c2",
  expectedSnapshotId: "s1",
  command: {
    kind: "construct-storage",
    unit: "crate",
    count: -3,
    storagePerUnit: 50,
    producedResourceId: "Crates",
    spend: [{ resourceId: "Wood", amount: -30 }],
  },
});
assert.deepEqual(calls, [["crate", -3]]);
assert.equal(resources.Crates.currentQuantity, -1);
assert.equal(resources.Wood.currentQuantity, 130);

// Non-finite count is rejected before any mutation.
calls = [];
resources = makeResources();
outcome = makeExecutor(calls, resources).execute({
  id: "c3",
  expectedSnapshotId: "s1",
  command: {
    kind: "construct-storage",
    unit: "crate",
    count: Number.NaN,
    storagePerUnit: 50,
    producedResourceId: "Crates",
    spend: [],
  },
});
assert.equal(outcome.status, "rejected");
assert.deepEqual(calls, []);
assert.equal(resources.Crates.currentQuantity, 2);

// Malformed resource model throws at the boundary.
assert.throws(() =>
  makeExecutor([], { Containers: { currentQuantity: 1 } }).execute({
    id: "c4",
    expectedSnapshotId: "s1",
    command: {
      kind: "construct-storage",
      unit: "crate",
      count: 1,
      storagePerUnit: 50,
      producedResourceId: "Crates",
      spend: [],
    },
  }),
);

console.log("Storage expansion adapter contract tests passed");
