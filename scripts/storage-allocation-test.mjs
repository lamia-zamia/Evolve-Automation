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

function legacyPlan(input) {
  if (
    !input.initialized ||
    input.crateValue <= 0 ||
    input.containerValue <= 0
  ) {
    return null;
  }
  const resources = Object.fromEntries(
    input.resources.map((resource) => [resource.id, resource]),
  );
  const managed = input.priorityResourceIds.filter(
    (id) => resources[id].unlocked && resources[id].managed,
  );
  if (managed.length === 0) return null;
  let totalCrates = input.freeCrates;
  let totalContainers = input.freeContainers;
  const adjustments = {};
  const modifiers = {};
  for (const id of managed) {
    const resource = resources[id];
    const sellAllowed =
      !input.noTrade &&
      input.autoMarket &&
      resource.autoSellEnabled &&
      resource.autoSellRatio > 0;
    modifiers[id] = input.assignExtra
      ? sellAllowed
        ? 1.03 / resource.autoSellRatio
        : 1.03
      : 1;
    adjustments[id] = {
      crate: 0,
      container: 0,
      amount:
        resource.maxQuantity -
        (resource.currentCrates * input.crateValue +
          resource.currentContainers * input.containerValue),
    };
    totalCrates += resource.currentCrates;
    totalContainers += resource.currentContainers;
  }
  const items = [];
  for (const sourceValue of input.targetSources) {
    const enabled =
      sourceValue.enabled &&
      (sourceValue.kind !== "safe-current" || input.safeReassign) &&
      (sourceValue.kind !== "required" || input.assignPart);
    if (!enabled) continue;
    const groups = Object.fromEntries(managed.map((id) => [id, []]));
    for (const targetValue of sourceValue.targets) {
      if (
        (sourceValue.kind === "project" || sourceValue.kind === "building") &&
        (!targetValue.unlocked || !targetValue.autoBuildEnabled)
      ) {
        continue;
      }
      const costs = Object.fromEntries(
        targetValue.costs.map((cost) => [cost.resourceId, cost.quantity]),
      );
      managed.find(
        (id) => costs[id] && groups[id].push({ target: targetValue, costs }),
      );
    }
    for (const id of managed) {
      groups[id].sort((left, right) => right.costs[id] - left.costs[id]);
      items.push(...groups[id]);
    }
  }
  let storageToBuild = 0;
  const drivers = {};
  nextItem: for (const item of items) {
    const currentAssign = {};
    let remainingCrates = totalCrates;
    let remainingContainers = totalContainers;
    for (const [id, quantity] of Object.entries(item.costs)) {
      const resource = resources[id];
      const modifier = item.target.isList ? 1 : modifiers[id];
      if (!adjustments[id]) {
        if (resource.maxQuantity >= quantity) continue;
        continue nextItem;
      }
      if (adjustments[id].amount >= quantity * modifier) continue;
      if (
        !item.target.isList &&
        resource.maxStorage >= 0 &&
        resource.maxStorage < quantity * modifier
      ) {
        continue nextItem;
      }
      let missing =
        Math.min(
          resource.maxStorage >= 0
            ? resource.maxStorage
            : Number.MAX_SAFE_INTEGER,
          quantity * modifier,
        ) - adjustments[id].amount;
      const available =
        remainingCrates * input.crateValue +
        remainingContainers * input.containerValue;
      if (item.target.isList || missing <= available) {
        currentAssign[id] = { crate: 0, container: 0 };
        if (missing > 0 && remainingCrates > 0) {
          const count = Math.min(
            Math.ceil(missing / input.crateValue),
            remainingCrates,
          );
          remainingCrates -= count;
          missing -= count * input.crateValue;
          currentAssign[id].crate = count;
        }
        if (missing > 0 && remainingContainers > 0) {
          const count = Math.min(
            Math.ceil(missing / input.containerValue),
            remainingContainers,
          );
          remainingContainers -= count;
          missing -= count * input.containerValue;
          currentAssign[id].container = count;
        }
        if (missing > 0) storageToBuild = Math.max(storageToBuild, missing);
      } else {
        storageToBuild = Math.max(storageToBuild, missing - available);
        continue nextItem;
      }
    }
    for (const [id, assignment] of Object.entries(currentAssign)) {
      if (input.debug && (assignment.crate > 0 || assignment.container > 0)) {
        const quantity = item.costs[id];
        drivers[id] = `${item.target.label} (qty=${quantity.toFixed(
          1,
        )}, missing≈${(quantity - adjustments[id].amount).toFixed(1)})`;
      }
      adjustments[id].crate += assignment.crate;
      adjustments[id].container += assignment.container;
      adjustments[id].amount +=
        assignment.crate * input.crateValue +
        assignment.container * input.containerValue;
    }
    totalCrates = remainingCrates;
    totalContainers = remainingContainers;
  }
  return {
    storageToBuild,
    assignments: managed.map((id) => ({
      resourceId: id,
      desiredCrates: adjustments[id].crate,
      desiredContainers: adjustments[id].container,
      driver: drivers[id] ?? null,
    })),
  };
}

function normalizePlan(plan) {
  if (plan === null) return null;
  return {
    storageToBuild: plan.storageToBuild,
    assignments: plan.assignments.map((assignment) => ({
      resourceId: assignment.resourceId,
      desiredCrates: assignment.desiredCrates,
      desiredContainers: assignment.desiredContainers,
      driver: assignment.driver,
    })),
  };
}

const dualRunScenarios = [
  ["not initialized", allocationInput({ initialized: false })],
  ["invalid capacity", allocationInput({ crateValue: 0 })],
  [
    "no managed resources",
    allocationInput({
      resources: [storageResource("Iron", { managed: false })],
    }),
  ],
  [
    "minimum list allocation",
    allocationInput({
      safeReassign: true,
      targetSources: [
        source("safe-current", [
          target({ Iron: 250 }, { isList: true, label: "current" }),
        ]),
      ],
    }),
  ],
  [
    "crate then container allocation",
    allocationInput({
      targetSources: [source("queued", [target({ Iron: 750 })])],
    }),
  ],
  [
    "partial list records missing build",
    allocationInput({
      freeCrates: 1,
      freeContainers: 0,
      targetSources: [
        source("minimum", [target({ Iron: 450 }, { isList: true })]),
      ],
    }),
  ],
  [
    "insufficient non-list skips target",
    allocationInput({
      freeCrates: 1,
      freeContainers: 0,
      targetSources: [source("queued", [target({ Iron: 450 })])],
    }),
  ],
  [
    "maximum storage rejects target",
    allocationInput({
      resources: [storageResource("Iron", { maxStorage: 300 })],
      targetSources: [source("queued", [target({ Iron: 400 })])],
    }),
  ],
  [
    "sell modifier expands requirement",
    allocationInput({
      assignExtra: true,
      autoMarket: true,
      resources: [
        storageResource("Iron", {
          autoSellEnabled: true,
          autoSellRatio: 0.5,
        }),
      ],
      targetSources: [source("queued", [target({ Iron: 300 })])],
    }),
  ],
  [
    "multi-resource target",
    allocationInput({
      freeCrates: 4,
      resources: [storageResource("Iron"), storageResource("Copper")],
      targetSources: [source("queued", [target({ Iron: 250, Copper: 250 })])],
    }),
  ],
  [
    "descending group costs",
    allocationInput({
      freeCrates: 3,
      freeContainers: 0,
      targetSources: [
        source("queued", [target({ Iron: 200 }), target({ Iron: 400 })]),
      ],
    }),
  ],
  [
    "disabled project filtered",
    allocationInput({
      targetSources: [
        source("project", [target({ Iron: 500 }, { autoBuildEnabled: false })]),
      ],
    }),
  ],
  [
    "overflow target",
    allocationInput({
      resources: [
        storageResource("Iron", {
          storeOverflow: true,
          currentQuantity: 300,
        }),
      ],
      targetSources: [
        source("overflow", [
          target({ Iron: 309 }, { isList: true, label: "overflow" }),
        ]),
      ],
    }),
  ],
];

for (const [name, input] of dualRunScenarios) {
  assert.deepEqual(
    normalizePlan(planStorageAllocation(input)),
    legacyPlan(input),
    name,
  );
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

console.log(
  `Storage allocation domain, adapter, application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
