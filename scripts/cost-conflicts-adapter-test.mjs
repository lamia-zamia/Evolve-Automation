import assert from "node:assert/strict";

import { readCostConflictInput } from "../src/adapters/evolve/cost-conflicts.ts";

const validState = {
  conflictTargets: [{ name: "Project", cause: "Queue", cost: { Iron: 80 } }],
};
const validResources = {
  Iron: { name: "Iron", currentQuantity: 100 },
};
const validAction = { cost: { Iron: 30 } };

const ready = readCostConflictInput(validState, validResources, validAction);
assert.equal(ready.status, "ready");
assert.deepEqual(ready.input, {
  actionCost: { Iron: 30 },
  reservedTargets: [{ name: "Project", cause: "Queue", cost: { Iron: 80 } }],
  resources: { Iron: { name: "Iron", currentQuantity: 100 } },
});
assert.ok(Object.isFrozen(ready));
assert.ok(Object.isFrozen(ready.input));
assert.ok(Object.isFrozen(ready.input.actionCost));
assert.ok(Object.isFrozen(ready.input.reservedTargets));
assert.ok(Object.isFrozen(ready.input.reservedTargets[0]));
assert.ok(Object.isFrozen(ready.input.resources));
assert.ok(Object.isFrozen(ready.input.resources.Iron));

const irrelevant = readCostConflictInput(
  { conflictTargets: [] },
  undefined,
  undefined,
);
assert.equal(irrelevant.status, "ready");
assert.deepEqual(irrelevant.input, {
  actionCost: {},
  reservedTargets: [],
  resources: {},
});

assert.deepEqual(readCostConflictInput(undefined, {}, validAction), {
  status: "unavailable",
  reason: "invalid-state",
});
assert.deepEqual(readCostConflictInput(validState, validResources, undefined), {
  status: "unavailable",
  reason: "invalid-action",
});
assert.deepEqual(
  readCostConflictInput(validState, validResources, {
    cost: { Iron: -1 },
  }),
  { status: "unavailable", reason: "invalid-action" },
);
assert.deepEqual(
  readCostConflictInput(
    { conflictTargets: [{ name: "Project", cost: { Iron: 0 } }] },
    validResources,
    validAction,
  ),
  { status: "unavailable", reason: "invalid-target", targetIndex: 0 },
);
assert.deepEqual(readCostConflictInput(validState, {}, validAction), {
  status: "unavailable",
  reason: "invalid-resource",
  resourceId: "Iron",
  targetIndex: 0,
});
assert.deepEqual(
  readCostConflictInput(
    {
      conflictTargets: [
        {
          name: "Queue data unavailable",
          cause: "Queue",
          cost: { __EA_QUEUE_DATA_UNAVAILABLE__: 1 },
        },
      ],
    },
    validResources,
    validAction,
  ),
  {
    status: "unavailable",
    reason: "invalid-resource",
    resourceId: "__EA_QUEUE_DATA_UNAVAILABLE__",
    targetIndex: 0,
  },
);
assert.deepEqual(
  readCostConflictInput(
    validState,
    { Iron: { name: "Iron", currentQuantity: NaN } },
    validAction,
  ),
  {
    status: "unavailable",
    reason: "invalid-resource",
    resourceId: "Iron",
    targetIndex: 0,
  },
);

const throwingState = new Proxy(validState, {
  get() {
    throw new Error("hostile state getter");
  },
});
assert.deepEqual(
  readCostConflictInput(throwingState, validResources, validAction),
  { status: "unavailable", reason: "inaccessible-data" },
);

console.log("Cost conflict Evolve adapter contract tests passed");
