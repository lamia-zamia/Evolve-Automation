import assert from "node:assert/strict";

import { createPlannerStatsStore } from "../src/adapters/storage/planner-stats.ts";
import {
  createPlannerStatsLifecycle,
  plannerStatsBucket,
  recordPlannerReadoutSample,
} from "../src/application/planner-stats.ts";

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
const store = createPlannerStatsStore(storage);
const lifecycle = createPlannerStatsLifecycle(store);
const run = { day: 20, reset: 3 };

assert.equal(
  plannerStatsBucket({
    cycleId: 1,
    targets: [
      { queued: true, blocker: "unavailable" },
      { queued: false, blocker: "income" },
    ],
  }),
  "income",
  "queued candidates are not counted as planner samples",
);
assert.equal(
  plannerStatsBucket({
    cycleId: 2,
    targets: [{ queued: true, blocker: "unavailable" }],
  }),
  null,
  "a cycle with only queued targets is not a planner sample",
);
assert.equal(
  plannerStatsBucket({ cycleId: 3, targets: [] }),
  null,
  "an empty candidate list is not a planner sample",
);

assert.deepEqual(lifecycle.load(run), {
  startDay: 20,
  day: 20,
  reset: 3,
  samples: {},
  total: 0,
});

const initialStats = lifecycle.make(run);
for (const snapshot of [
  { cycleId: 4, targets: [] },
  { cycleId: 5, targets: [{ queued: true, blocker: "unavailable" }] },
]) {
  assert.equal(
    recordPlannerReadoutSample(lifecycle, initialStats, snapshot, run.day),
    null,
  );
}
assert.equal(initialStats.total, 0);
const unavailableStats = recordPlannerReadoutSample(
  lifecycle,
  initialStats,
  { cycleId: 6, targets: [{ queued: false, blocker: "unavailable" }] },
  run.day,
);
assert.equal(unavailableStats.total, 1);
assert.deepEqual(unavailableStats.samples, { unavailable: 1 });

const valid = {
  startDay: 10,
  day: 19,
  reset: 3,
  samples: { Iron: 4 },
  total: 4,
};
values.set("ea_planner_stats", JSON.stringify(valid));
assert.deepEqual(lifecycle.load(run), valid);

assert.deepEqual(lifecycle.load({ day: 20, reset: 4 }), {
  startDay: 20,
  day: 20,
  reset: 4,
  samples: {},
  total: 0,
});

values.set("ea_planner_stats", "not-json");
assert.deepEqual(lifecycle.load(run), {
  startDay: 20,
  day: 20,
  reset: 3,
  samples: {},
  total: 0,
});

values.set("ea_planner_stats", JSON.stringify({ day: 20, reset: 3 }));
assert.deepEqual(lifecycle.load(run), {
  startDay: 20,
  day: 20,
  reset: 3,
  samples: {},
  total: 0,
});

values.set("ea_planner_stats", "sentinel");
assert.equal(lifecycle.save({ total: 9 }), false);
assert.equal(values.get("ea_planner_stats"), "sentinel");
assert.equal(lifecycle.save(valid), true);
assert.equal(values.get("ea_planner_stats"), JSON.stringify(valid));

let saves = 0;
let savedStats;
const periodicLifecycle = createPlannerStatsLifecycle({
  load: () => null,
  save(stats) {
    saves += 1;
    savedStats = stats;
    return true;
  },
});
let stats = periodicLifecycle.make({ day: 5, reset: 1 });
for (let sample = 1; sample <= 24; sample += 1) {
  stats = periodicLifecycle.record(stats, "income", 5);
}
assert.equal(
  saves,
  0,
  "statistics should not persist between 25-sample checkpoints",
);
periodicLifecycle.record(stats, "storage", 6);
assert.equal(saves, 1);
assert.equal(savedStats.total, 25);
assert.deepEqual(savedStats.samples, { income: 24, storage: 1 });

const manuallyReset = periodicLifecycle.make({ day: 9, reset: 2 });
assert.equal(periodicLifecycle.save(manuallyReset), true);
assert.deepEqual(savedStats, {
  startDay: 9,
  day: 9,
  reset: 2,
  samples: {},
  total: 0,
});

const throwingStore = createPlannerStatsStore({
  getItem() {
    throw new Error("storage denied");
  },
  setItem() {
    throw new Error("storage denied");
  },
});
assert.equal(throwingStore.load(), null);
assert.equal(throwingStore.save(valid), false);

console.log("Planner stats storage adapter tests passed");
