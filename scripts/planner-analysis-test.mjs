import assert from "node:assert/strict";

import {
  createPlannerStats,
  findPlannerLimit,
  parsePlannerStats,
  recordPlannerSample,
  selectPlannerStats,
} from "../src/domain/planner-analysis.ts";

function requirement(resourceId, overrides = {}) {
  return {
    resourceId,
    resourceTitle: resourceId,
    requiredQuantity: 100,
    currentQuantity: 0,
    maximumQuantity: 1000,
    income: 10,
    unlocked: true,
    ...overrides,
  };
}

const cases = [
  {
    name: "affordable target",
    input: { affordable: true, requirements: [requirement("Iron")] },
    expected: null,
  },
  {
    name: "income blocker",
    input: {
      affordable: false,
      requirements: [requirement("Iron", { currentQuantity: 20, income: 10 })],
    },
    expected: {
      resourceId: "Iron",
      resourceTitle: "Iron",
      time: 8,
      blocker: "income",
    },
  },
  {
    name: "storage outranks stalled and income",
    input: {
      affordable: false,
      requirements: [
        requirement("Iron"),
        requirement("Stone", { income: 0 }),
        requirement("Money", { maximumQuantity: 50 }),
      ],
    },
    expected: {
      resourceId: "Money",
      resourceTitle: "Money",
      time: Number.MAX_SAFE_INTEGER,
      blocker: "storage",
    },
  },
  {
    name: "locked requirement is a blocker even when another cost is satisfied",
    input: {
      affordable: false,
      requirements: [
        requirement("Locked", { unlocked: false }),
        requirement("Full", { currentQuantity: 100 }),
      ],
    },
    expected: {
      resourceId: "Locked",
      resourceTitle: "Locked",
      time: Number.MAX_SAFE_INTEGER,
      blocker: "locked",
    },
  },
  {
    name: "satisfied requirements leave prerequisite-only target without a resource limit",
    input: {
      affordable: false,
      requirements: [requirement("Full", { currentQuantity: 100 })],
    },
    expected: null,
  },
  {
    name: "equal ETAs retain requirement order",
    input: {
      affordable: false,
      requirements: [requirement("First"), requirement("Second")],
    },
    expected: {
      resourceId: "First",
      resourceTitle: "First",
      time: 10,
      blocker: "income",
    },
  },
];

for (const testCase of cases) {
  const modern = findPlannerLimit(testCase.input);
  assert.deepEqual(modern, testCase.expected, testCase.name);
  if (modern !== null) assert.ok(Object.isFrozen(modern));
}

const fresh = createPlannerStats({ day: 10, reset: 2 });
assert.deepEqual(fresh, {
  startDay: 10,
  day: 10,
  reset: 2,
  samples: {},
  total: 0,
});
assert.ok(Object.isFrozen(fresh));
assert.ok(Object.isFrozen(fresh.samples));

const sampled = recordPlannerSample(fresh, "Iron", 11);
assert.deepEqual(sampled, {
  startDay: 10,
  day: 11,
  reset: 2,
  samples: { Iron: 1 },
  total: 1,
});
assert.deepEqual(fresh.samples, {}, "sample transition must not mutate input");

const validSaved = parsePlannerStats({
  startDay: 8,
  day: 9,
  reset: 2,
  samples: { Iron: 3 },
  total: 3,
});
assert.deepEqual(
  selectPlannerStats(validSaved, { day: 10, reset: 2 }),
  validSaved,
);
assert.deepEqual(selectPlannerStats(validSaved, { day: 10, reset: 3 }), {
  startDay: 10,
  day: 10,
  reset: 3,
  samples: {},
  total: 0,
});

for (const invalid of [
  null,
  { day: 10, reset: 2 },
  { startDay: 11, day: 10, reset: 2, samples: {}, total: 0 },
  { startDay: 10, day: 10, reset: 2, samples: { Iron: -1 }, total: 0 },
  { startDay: 10, day: 10, reset: 2, samples: { Iron: 1 }, total: 2 },
  { startDay: 10, day: 10, reset: 2, samples: [], total: 0 },
]) {
  assert.equal(parsePlannerStats(invalid), null);
}
assert.throws(
  () => createPlannerStats({ day: -1, reset: 2 }),
  /non-negative safe integers/,
);

console.log("Planner analysis domain tests passed");
