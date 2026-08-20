import assert from "node:assert/strict";

import { createStorageAllocationAutomation } from "../src/application/storage-allocation.ts";
import { createStorageDebugSource } from "../src/adapters/browser/storage-debug.ts";
import { createStorageAllocationAdapter } from "../src/adapters/evolve/economy/storage/storage-allocation.ts";
import {
  EMPTY_STORAGE_ALLOCATION_STATE,
  finalizeStorageAllocation,
  planStorageAllocation,
  unfundedStorageCapacity,
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

// A research target always costs Knowledge, which holds no crates or
// containers. Its capacity is grown by buildings, not by the storage system, so
// a Knowledge cap below the research cost must not veto storage for the
// materials the research also needs.
const researchPlan = planStorageAllocation(
  allocationInput({
    resources: [
      storageResource("Polymer", {
        currentQuantity: 2000,
        maxQuantity: 2000,
      }),
      storageResource("Knowledge", {
        managed: false,
        maxQuantity: 60000,
      }),
    ],
    priorityResourceIds: ["Polymer"],
    freeCrates: 0,
    freeContainers: 0,
    targetSources: [
      source("technology", [target({ Knowledge: 100000, Polymer: 2500 })]),
    ],
  }),
);
assert.equal(researchPlan.storageToBuild, 500);

// Debug output has to explain a stalled expansion: the summary names what set
// storageToBuild, and a resource that needs more than it holds is reported even
// when nothing moves.
const stalledPlan = planStorageAllocation(
  allocationInput({
    debug: true,
    resources: [
      storageResource("Titanium", {
        currentQuantity: 49,
        maxQuantity: 50,
        storageRequired: 360.5,
      }),
    ],
    priorityResourceIds: ["Titanium"],
    freeCrates: 0,
    freeContainers: 0,
    targetSources: [
      source("technology", [
        target({ Titanium: 350 }, { label: "Titanium Axes" }),
      ]),
    ],
  }),
);
assert.equal(stalledPlan.storageToBuild, 300);
assert.equal(stalledPlan.storageToBuildDriver, "Titanium Axes/Titanium");
const stalledLogs = finalizeStorageAllocation(
  stalledPlan,
  EMPTY_STORAGE_ALLOCATION_STATE,
).decision.logs;
assert.match(
  stalledLogs[0],
  /^\[storage\] plan storageToBuild=300.0, freeCrates=0, freeContainers=0, crateValue=100, containerValue=500, driver=Titanium Axes\/Titanium$/,
);
assert.match(
  stalledLogs[1],
  /^\[storage\] Titanium: no change \| currentQty=49.0, max=50.0, storageRequired=360.5, held 0c\/0C, wanted 0c\/0C, driver=none$/,
);

// Reported deadlock: a crate is granted to a capped resource while the release
// that funds it is held back by the debounce. Evolve clamps the assignment to the
// unassigned count, so the grant is a silent no-op and the resource never gains
// storage. The shortfall has to become a construction request.
const deadlockPlan = planStorageAllocation(
  allocationInput({
    crateValue: 161631,
    containerValue: 235100,
    freeCrates: 0,
    freeContainers: 0,
    assignExtra: true,
    resources: [
      storageResource("Titanium", {
        currentQuantity: 50,
        maxQuantity: 50,
      }),
      storageResource("Lumber", {
        currentQuantity: 0,
        maxQuantity: 161731,
        currentCrates: 1,
      }),
    ],
    priorityResourceIds: ["Titanium", "Lumber"],
    targetSources: [
      source("building", [target({ Titanium: 3060 }, { label: "Warehouse" })]),
    ],
  }),
);
// Every crate in play counts as reassignable, so the plan never asks for one.
assert.equal(deadlockPlan.storageToBuild, 0);
assert.equal(
  deadlockPlan.assignments.find((a) => a.resourceId === "Titanium")
    .desiredCrates,
  1,
);

// Lumber's release is pinned by the oscillation lock while Titanium's grant fires.
const deadlockDecision = finalizeStorageAllocation(deadlockPlan, {
  crates: { Lumber: { locked: 1 }, Titanium: { direction: 1, ticks: 2 } },
  containers: {},
}).decision;
const titaniumDelta = deadlockDecision.adjustments.find(
  (a) => a.resourceId === "Titanium",
);
const lumberDelta = deadlockDecision.adjustments.find(
  (a) => a.resourceId === "Lumber",
);
assert.equal(titaniumDelta.crateDelta, 1);
assert.equal(lumberDelta.crateDelta, 0);
assert.equal(unfundedStorageCapacity(deadlockDecision), 161631);

// A grant matched by its release in the same decision funds itself.
assert.equal(
  unfundedStorageCapacity({
    ...deadlockDecision,
    adjustments: [
      { ...titaniumDelta, crateDelta: 1 },
      { ...lumberDelta, crateDelta: -1 },
    ],
  }),
  0,
);
// Releases alone never ask for construction.
assert.equal(
  unfundedStorageCapacity({
    ...deadlockDecision,
    adjustments: [{ ...lumberDelta, crateDelta: -1 }],
  }),
  0,
);
// Containers are counted at their own value.
assert.equal(
  unfundedStorageCapacity({
    ...deadlockDecision,
    adjustments: [{ ...titaniumDelta, crateDelta: 0, containerDelta: 2 }],
  }),
  470200,
);

// End-to-end deadlock: Lumber's crate gets pinned by the oscillation lock, then
// Titanium is granted that same crate every few ticks. Evolve clamps the grant to
// the unassigned count, so without a construction request Titanium never gains a
// single crate no matter how long this runs.
const CRATE_VALUE = 161631;
const world = {
  freeCrates: 0,
  crates: { Lumber: 1, Titanium: 0 },
  lumberWantsCrate: false,
  titaniumDemand: false,
  expanded: [],
};

function worldInput() {
  const targets = [];
  if (world.lumberWantsCrate) {
    targets.push(target({ Lumber: 100000 }, { label: "Lumber Yard" }));
  }
  if (world.titaniumDemand) {
    targets.push(target({ Titanium: 3060 }, { label: "Warehouse" }));
  }
  return allocationInput({
    crateValue: CRATE_VALUE,
    containerValue: 235100,
    freeCrates: world.freeCrates,
    freeContainers: 0,
    resources: [
      storageResource("Lumber", {
        currentQuantity: 0,
        maxQuantity: 100 + world.crates.Lumber * CRATE_VALUE,
        currentCrates: world.crates.Lumber,
      }),
      storageResource("Titanium", {
        currentQuantity: 50,
        maxQuantity: 50 + world.crates.Titanium * CRATE_VALUE,
        currentCrates: world.crates.Titanium,
      }),
    ],
    priorityResourceIds: ["Lumber", "Titanium"],
    targetSources: [source("building", targets)],
  });
}

const worldAutomation = createStorageAllocationAutomation({
  reader: { read: () => worldInput() },
  executor: {
    execute: (decision) => {
      // Evolve releases in full but clamps every grant to the unassigned count.
      for (const adjustment of decision.adjustments) {
        if (adjustment.crateDelta < 0) {
          world.crates[adjustment.resourceId] += adjustment.crateDelta;
          world.freeCrates -= adjustment.crateDelta;
        }
      }
      for (const adjustment of decision.adjustments) {
        if (adjustment.crateDelta > 0) {
          const granted = Math.min(adjustment.crateDelta, world.freeCrates);
          world.freeCrates -= granted;
          world.crates[adjustment.resourceId] += granted;
        }
      }
      return { status: "succeeded" };
    },
  },
  expansion: {
    expand: (capacity) => {
      world.expanded.push(capacity);
      world.freeCrates += Math.ceil(capacity / CRATE_VALUE);
      return true;
    },
  },
});

const runTicks = (count) => {
  for (let tick = 0; tick < count; tick++) worldAutomation.run();
};

runTicks(3); // Lumber releases its crate.
assert.equal(world.crates.Lumber, 0);
assert.equal(world.freeCrates, 1);
world.lumberWantsCrate = true;
runTicks(3); // Lumber takes it back, and the oscillation lock pins it there.
assert.equal(world.crates.Lumber, 1);
assert.equal(worldAutomation.readState().crates.Lumber.locked, 1);

world.lumberWantsCrate = false;
world.titaniumDemand = true;
runTicks(6);
// The pinned crate is never released, so the grant had to be funded by building.
assert.deepEqual(world.expanded, [CRATE_VALUE]);
assert.equal(world.crates.Lumber, 1);
assert.equal(world.crates.Titanium, 1);

// A stalled allocation replans identically every tick; only changes are reported.
const spamFixture = liveFixture();
spamFixture.resources.Iron.minStorage = 250;
spamFixture.settings.storageDebug = true;
const spamLogs = [];
const spamAdapter = createStorageAllocationAdapter({
  ...liveDependencies(spamFixture),
  readDebugEnabled: () => true,
  log: (message) => spamLogs.push(message),
});
const spamPlan = planStorageAllocation(spamAdapter.reader.read());
const spamDecision = finalizeStorageAllocation(
  spamPlan,
  EMPTY_STORAGE_ALLOCATION_STATE,
).decision;
spamAdapter.executor.execute(spamDecision);
const firstCount = spamLogs.length;
assert.ok(firstCount > 0);
spamAdapter.executor.execute(spamDecision);
assert.equal(spamLogs.length, firstCount);

const debugSource = createStorageDebugSource(() => ({ storageDebug: true }));
assert.equal(debugSource.readEnabled(), true);
assert.equal(createStorageDebugSource(() => null).readEnabled(), false);

console.log("Storage allocation domain, adapter, and application tests passed");
