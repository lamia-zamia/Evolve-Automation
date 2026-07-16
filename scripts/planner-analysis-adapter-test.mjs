import assert from "node:assert/strict";

import {
  readPlannerLimitInput,
  readPlannerRun,
} from "../src/adapters/evolve/planner-analysis.ts";

const resource = {
  title: "Iron",
  currentQuantity: 10,
  maxQuantity: 100,
  income: 5,
  isUnlocked() {
    assert.equal(this, resource);
    return true;
  },
};
const target = {
  cost: { Iron: 50 },
  isAffordable() {
    assert.equal(this, target);
    return false;
  },
};
const ready = readPlannerLimitInput(target, { Iron: resource });
assert.equal(ready.status, "ready");
assert.deepEqual(ready.input, {
  affordable: false,
  requirements: [
    {
      resourceId: "Iron",
      resourceTitle: "Iron",
      requiredQuantity: 50,
      currentQuantity: 10,
      maximumQuantity: 100,
      income: 5,
      unlocked: true,
    },
  ],
});
assert.ok(Object.isFrozen(ready));
assert.ok(Object.isFrozen(ready.input));
assert.ok(Object.isFrozen(ready.input.requirements));
assert.ok(Object.isFrozen(ready.input.requirements[0]));

assert.deepEqual(readPlannerLimitInput({}, { Iron: resource }), {
  status: "unavailable",
  reason: "invalid-target",
});
assert.deepEqual(readPlannerLimitInput(target, {}), {
  status: "unavailable",
  reason: "invalid-resource",
  resourceId: "Iron",
});
assert.deepEqual(
  readPlannerLimitInput(
    { cost: { Iron: NaN }, isAffordable: () => false },
    { Iron: resource },
  ),
  { status: "unavailable", reason: "invalid-target", resourceId: "Iron" },
);
assert.deepEqual(
  readPlannerLimitInput(
    { cost: { Iron: -1 }, isAffordable: () => false },
    { Iron: resource },
  ),
  { status: "unavailable", reason: "invalid-target", resourceId: "Iron" },
);
assert.deepEqual(
  readPlannerLimitInput(target, {
    Iron: {
      ...resource,
      currentQuantity: "10",
      isUnlocked: () => true,
    },
  }),
  { status: "unavailable", reason: "invalid-resource", resourceId: "Iron" },
);

let costRead = false;
const affordable = {
  isAffordable: () => true,
  get cost() {
    costRead = true;
    throw new Error("cost should not be sampled");
  },
};
assert.equal(readPlannerLimitInput(affordable, null).status, "ready");
assert.equal(costRead, false);

const hostile = new Proxy(target, {
  get() {
    throw new Error("hostile target getter");
  },
});
assert.deepEqual(readPlannerLimitInput(hostile, { Iron: resource }), {
  status: "unavailable",
  reason: "inaccessible-data",
});

assert.deepEqual(
  readPlannerRun({ global: { stats: { days: 12, reset: 3 } } }),
  {
    status: "ready",
    run: { day: 12, reset: 3 },
  },
);
assert.deepEqual(
  readPlannerRun({ global: { stats: { days: -1, reset: 3 } } }),
  {
    status: "unavailable",
    reason: "invalid-game-state",
  },
);
assert.deepEqual(readPlannerRun(undefined), {
  status: "unavailable",
  reason: "invalid-game-state",
});

console.log("Planner analysis Evolve adapter contract tests passed");
