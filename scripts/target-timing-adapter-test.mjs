import assert from "node:assert/strict";

import { readTargetTimingInput } from "../src/adapters/evolve/target-timing.ts";

const validGame = {
  global: { resource: { Money: { amount: 20, diff: 10 } } },
};
const validTarget = { gameMax: 2, count: 0, cost: { Money: 100 } };

const ready = readTargetTimingInput(validGame, validTarget, false);
assert.equal(ready.status, "ready");
assert.deepEqual(ready.input, {
  remainingSegments: 2,
  requirements: [
    {
      resourceId: "Money",
      costPerSegment: 100,
      currentQuantity: 20,
      rateOfChange: 10,
    },
  ],
});
assert.ok(Object.isFrozen(ready));
assert.ok(Object.isFrozen(ready.input));
assert.ok(Object.isFrozen(ready.input.requirements));
assert.ok(Object.isFrozen(ready.input.requirements[0]));

assert.deepEqual(readTargetTimingInput(undefined, validTarget, false), {
  status: "unavailable",
  reason: "invalid-game-state",
});
assert.deepEqual(readTargetTimingInput(validGame, undefined, false), {
  status: "unavailable",
  reason: "invalid-target",
});
assert.deepEqual(
  readTargetTimingInput(validGame, { ...validTarget, count: "zero" }, false),
  { status: "unavailable", reason: "invalid-target" },
);
assert.deepEqual(
  readTargetTimingInput(
    validGame,
    { ...validTarget, cost: { Money: NaN } },
    false,
  ),
  {
    status: "unavailable",
    reason: "invalid-target",
    resourceId: "Money",
  },
);
assert.deepEqual(
  readTargetTimingInput({ global: { resource: {} } }, validTarget, false),
  {
    status: "unavailable",
    reason: "invalid-resource",
    resourceId: "Money",
  },
);
assert.deepEqual(
  readTargetTimingInput(
    { global: { resource: { Money: { amount: 0, diff: "10" } } } },
    validTarget,
    false,
  ),
  {
    status: "unavailable",
    reason: "invalid-resource",
    resourceId: "Money",
  },
);

const throwingTarget = new Proxy(validTarget, {
  get() {
    throw new Error("hostile target getter");
  },
});
assert.deepEqual(readTargetTimingInput(validGame, throwingTarget, false), {
  status: "unavailable",
  reason: "inaccessible-data",
});

console.log("Target timing Evolve adapter contract tests passed");
