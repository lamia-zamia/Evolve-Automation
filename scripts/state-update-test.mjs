import assert from "node:assert/strict";

import {
  planGoalTransition,
  computeMoneyWindow,
  computeTowerSize,
  evaluateStabilise,
} from "../src/domain/state-update.ts";

const base = {
  species: "human",
  goal: "Standard",
  day: 100,
  slow: false,
  hyper: false,
  triggerCount: 0,
};
assert.deepEqual(planGoalTransition({ ...base, species: "protoplasm" }), {
  kind: "force-evolution",
});
assert.deepEqual(planGoalTransition({ ...base, goal: "Evolution" }), {
  kind: "resolve-leaving",
  rebuildTriggers: false,
});
assert.deepEqual(
  planGoalTransition({ ...base, goal: "Evolution", triggerCount: 3 }),
  { kind: "resolve-leaving", rebuildTriggers: true },
);
assert.deepEqual(planGoalTransition({ ...base, day: 1, slow: true }), {
  kind: "day1-fallback",
});
assert.deepEqual(planGoalTransition({ ...base, day: 1, species: "junker" }), {
  kind: "day1-fallback",
});
assert.deepEqual(planGoalTransition({ ...base, day: 1 }), { kind: "proceed" });
assert.deepEqual(planGoalTransition({ ...base, day: 2, slow: true }), {
  kind: "proceed",
});

assert.deepEqual(computeMoneyWindow([1, 9, 2, 8, 3, 7, 4, 6, 5, 0, 10], 100), {
  incomes: [9, 2, 8, 3, 7, 4, 6, 5, 0, 10, 100],
  median: 6,
});
assert.deepEqual(computeMoneyWindow([1, 2], 50), {
  incomes: [2, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
  median: 50,
});
assert.equal(computeTowerSize(undefined), 1000);
assert.equal(computeTowerSize({ human: 3, elven: 0, orc: 1 }), 1000 - 8 - 4);
assert.equal(
  computeTowerSize(
    Object.fromEntries(
      Array.from({ length: 30 }, (unused, index) => [`race${index}`, 20]),
    ),
  ),
  250,
);
assert.deepEqual(evaluateStabilise(5, 9), {
  stabilised: true,
  lastExoticMass: 5,
});
assert.deepEqual(evaluateStabilise(12, 9), {
  stabilised: false,
  lastExoticMass: 12,
});
assert.deepEqual(evaluateStabilise(0, 3), {
  stabilised: true,
  lastExoticMass: 0,
});

console.log("State update domain policy tests passed");
