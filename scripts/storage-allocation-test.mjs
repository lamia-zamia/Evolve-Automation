import assert from "node:assert/strict";

import { createStorageAllocationAutomation } from "../src/application/storage-allocation.ts";
import { createStorageDebugSource } from "../src/adapters/browser/storage-debug.ts";
import { createStorageAllocationAdapter } from "../src/adapters/evolve/economy/storage/storage-allocation.ts";
import {
  EMPTY_STORAGE_ALLOCATION_STATE,
  finalizeStorageAllocation,
  planStorageAllocation,
} from "../src/domain/economy/storage/storage-allocation.ts";

function storageResource(id, overrides = {}) {
  return Object.freeze({
    id,
    unlocked: true,
    managed: true,
    currentQuantity: 0,
    maxQuantity: 100,
    maxStorage: -1,
    storageRequired: 0,
    minStorage: 0,
    currentCrates: 0,
    currentContainers: 0,
    storeOverflow: false,
    autoSellEnabled: false,
    autoSellRatio: 0.5,
    ...overrides,
  });
}

function target(costs, overrides = {}) {
  return Object.freeze({
    costs: Object.freeze(
      Object.entries(costs).map(([resourceId, quantity]) =>
        Object.freeze({ resourceId, quantity }),
      ),
    ),
    isList: false,
    label: "target",
    unlocked: true,
    autoBuildEnabled: true,
    ...overrides,
  });
}

function source(kind, targets, enabled = true) {
  return Object.freeze({ kind, enabled, targets: Object.freeze(targets) });
}

function allocationInput(overrides = {}) {
  const resources = overrides.resources ?? [storageResource("Iron")];
  const priorityResourceIds =
    overrides.priorityResourceIds ?? resources.map((resource) => resource.id);
  return Object.freeze({
    initialized: true,
    crateValue: 100,
    containerValue: 500,
    freeCrates: 2,
    freeContainers: 1,
    assignExtra: false,
    assignPart: false,
    safeReassign: false,
    noTrade: false,
    autoMarket: false,
    debug: false,
    resources: Object.freeze(resources),
    priorityResourceIds: Object.freeze(priorityResourceIds),
    targetSources: Object.freeze(
      overrides.targetSources ?? [source("queued", [])],
    ),
    ...overrides,
  });
}

const debouncePlan = planStorageAllocation(
  allocationInput({
    targetSources: [source("queued", [target({ Iron: 250 })])],
  }),
);
let debounceState = EMPTY_STORAGE_ALLOCATION_STATE;
let finalized;
for (let tick = 0; tick < 3; tick++) {
  finalized = finalizeStorageAllocation(debouncePlan, debounceState);
  debounceState = finalized.nextState;
}
assert.equal(finalized.decision.adjustments[0].crateDelta, 2);
assert.equal(finalized.decision.adjustments[0].containerDelta, 0);

const locked = finalizeStorageAllocation(debouncePlan, {
  crates: { Iron: { previous: 2, direction: 1, ticks: 2 } },
  containers: {},
});
assert.equal(locked.decision.adjustments[0].crateDelta, 2);
const reversePlan = {
  ...debouncePlan,
  assignments: debouncePlan.assignments.map((assignment) => ({
    ...assignment,
    expectedCrates: 2,
    desiredCrates: 0,
  })),
};
const reverse = finalizeStorageAllocation(reversePlan, {
  crates: { Iron: { previous: 0, direction: -1, ticks: 2 } },
  containers: {},
});
assert.equal(reverse.nextState.crates.Iron.locked, 2);
assert.equal(reverse.decision.adjustments[0].crateDelta, 0);

function liveResource(id, overrides = {}) {
  let crates = overrides.currentCrates ?? 0;
  let containers = overrides.currentContainers ?? 0;
  const value = {
    id,
    currentQuantity: overrides.currentQuantity ?? 0,
    maxQuantity: overrides.maxQuantity ?? 100,
    maxStorage: overrides.maxStorage ?? -1,
    storageRequired: overrides.storageRequired ?? 0,
    minStorage: overrides.minStorage ?? 0,
    storeOverflow: overrides.storeOverflow ?? false,
    autoSellEnabled: overrides.autoSellEnabled ?? false,
    autoSellRatio: overrides.autoSellRatio ?? 0.5,
    isUnlocked: overrides.isUnlocked ?? (() => true),
    isManagedStorage: overrides.isManagedStorage ?? (() => true),
  };
  Object.defineProperties(value, {
    currentCrates: { get: () => crates, enumerable: true },
    currentContainers: { get: () => containers, enumerable: true },
  });
  value.changeCrates = (amount) => {
    crates += amount;
  };
  value.changeContainers = (amount) => {
    containers += amount;
  };
  return value;
}

function liveFixture() {
  const trace = [];
  const Iron = liveResource("Iron", { minStorage: 250 });
  const Crates = liveResource("Crates", { currentQuantity: 2 });
  const Containers = liveResource("Containers", { currentQuantity: 0 });
  const manager = {
    crateValue: 100,
    containerValue: 500,
    priorityList: [Iron],
    initStorage: () => {
      trace.push(["init"]);
      return true;
    },
    assignCrate: (resource, count) => {
      trace.push(["assign-crate", resource.id, count]);
      resource.changeCrates(count);
    },
    unassignCrate: (resource, count) => {
      trace.push(["unassign-crate", resource.id, count]);
      resource.changeCrates(-count);
    },
    assignContainer: (resource, count) => {
      trace.push(["assign-container", resource.id, count]);
      resource.changeContainers(count);
    },
    unassignContainer: (resource, count) => {
      trace.push(["unassign-container", resource.id, count]);
      resource.changeContainers(-count);
    },
  };
  return {
    trace,
    manager,
    resources: { Iron, Crates, Containers },
    game: { global: { race: {} } },
    settings: {
      storageSafeReassign: false,
      storageAssignExtra: false,
      storageAssignPart: false,
      autoFleet: false,
      autoMarket: false,
      prioritizeOuterFleet: "ignore",
    },
    state: { queuedTargetsAll: [], triggerTargets: [], unlockedTechs: [] },
    buildings: { priorityList: [] },
    projects: { priorityList: [] },
    fleet: {},
  };
}

function liveDependencies(fixture, overrides = {}) {
  return {
    getStorageManager: () => fixture.manager,
    getGame: () => fixture.game,
    getSettings: () => fixture.settings,
    getState: () => fixture.state,
    getResources: () => fixture.resources,
    getBuildingManager: () => fixture.buildings,
    getProjectManager: () => fixture.projects,
    getFleetManagerOuter: () => fixture.fleet,
    readDebugEnabled: () => false,
    log: (message) => fixture.trace.push(["log", message]),
    ...overrides,
  };
}

const fixture = liveFixture();
const adapter = createStorageAllocationAdapter(liveDependencies(fixture));
const automation = createStorageAllocationAutomation({
  reader: adapter.reader,
  executor: adapter.executor,
  expansion: {
    expand: (missing) => {
      fixture.trace.push(["expand", missing]);
      return false;
    },
  },
});
for (let tick = 0; tick < 3; tick++) {
  assert.equal(automation.run().status, "succeeded");
}
assert.deepEqual(fixture.trace, [
  ["init"],
  ["init"],
  ["init"],
  ["assign-crate", "Iron", 2],
]);
assert.equal(fixture.resources.Iron.currentCrates, 2);
assert.equal(fixture.resources.Iron.maxQuantity, 300);
// Pinned legacy cache behavior: assignment increases the cached free count.
assert.equal(fixture.resources.Crates.currentQuantity, 4);

const containerFixture = liveFixture();
containerFixture.resources.Crates.currentQuantity = 0;
containerFixture.resources.Containers.currentQuantity = 1;
containerFixture.resources.Iron.minStorage = 500;
const containerAdapter = createStorageAllocationAdapter(
  liveDependencies(containerFixture),
);
const containerAutomation = createStorageAllocationAutomation({
  reader: containerAdapter.reader,
  executor: containerAdapter.executor,
  expansion: { expand: () => false },
});
for (let tick = 0; tick < 3; tick++) {
  assert.equal(containerAutomation.run().status, "succeeded");
}
assert.deepEqual(containerFixture.trace, [
  ["init"],
  ["init"],
  ["init"],
  ["assign-container", "Iron", 1],
]);
assert.equal(containerFixture.resources.Containers.currentQuantity, 2);

const failedFixture = liveFixture();
failedFixture.manager.assignCrate = (resource, count) => {
  failedFixture.trace.push(["assign-crate-failed", resource.id, count]);
  return false;
};
const failedAdapter = createStorageAllocationAdapter(
  liveDependencies(failedFixture),
);
const failedAutomation = createStorageAllocationAutomation({
  reader: failedAdapter.reader,
  executor: failedAdapter.executor,
  expansion: { expand: () => false },
});
let failedOutcome;
for (let tick = 0; tick < 3; tick++) {
  failedOutcome = failedAutomation.run();
}
assert.equal(failedOutcome.status, "rejected");
assert.deepEqual(failedFixture.trace, [
  ["init"],
  ["init"],
  ["init"],
  ["assign-crate-failed", "Iron", 2],
]);
assert.equal(failedFixture.resources.Iron.currentCrates, 0);
assert.equal(failedFixture.resources.Iron.maxQuantity, 100);
assert.equal(failedFixture.resources.Crates.currentQuantity, 2);

const expandingFixture = liveFixture();
expandingFixture.resources.Iron.minStorage = 1000;
const expandingAdapter = createStorageAllocationAdapter(
  liveDependencies(expandingFixture),
);
const expanding = createStorageAllocationAutomation({
  reader: expandingAdapter.reader,
  executor: expandingAdapter.executor,
  expansion: {
    expand: (missing) => {
      expandingFixture.trace.push(["expand", missing]);
      return true;
    },
  },
});
assert.equal(expanding.run().status, "succeeded");
assert.deepEqual(expandingFixture.trace, [["init"], ["expand", 700]]);

const staleFixture = liveFixture();
const staleAdapter = createStorageAllocationAdapter(
  liveDependencies(staleFixture),
);
const staleRaw = planStorageAllocation(staleAdapter.reader.read());
let staleState = EMPTY_STORAGE_ALLOCATION_STATE;
for (let tick = 0; tick < 3; tick++) {
  const value = finalizeStorageAllocation(staleRaw, staleState);
  staleState = value.nextState;
  finalized = value;
}
staleFixture.manager.priorityList = [];
assert.equal(staleAdapter.executor.execute(finalized.decision).status, "stale");
assert.deepEqual(staleFixture.trace, [["init"]]);

const lockedFixture = liveFixture();
lockedFixture.manager.initStorage = () => false;
const lockedAdapter = createStorageAllocationAdapter(
  liveDependencies(lockedFixture),
);
assert.equal(lockedAdapter.reader.read().initialized, false);

const missingSellRatioFixture = liveFixture();
delete missingSellRatioFixture.resources.Iron.autoSellRatio;
const missingSellRatioAdapter = createStorageAllocationAdapter(
  liveDependencies(missingSellRatioFixture),
);
assert.equal(
  missingSellRatioAdapter.reader.read().resources[0].autoSellRatio,
  0,
);

const debugSource = createStorageDebugSource(() => ({ storageDebug: true }));
assert.equal(debugSource.readEnabled(), true);
assert.equal(createStorageDebugSource(() => null).readEnabled(), false);

console.log("Storage allocation domain, adapter, and application tests passed");
