import assert from "node:assert/strict";

import { createPlannerStatsStore } from "../src/adapters/storage/planner-stats.ts";
import { createPlannerStatsLifecycle } from "../src/application/planner-stats.ts";

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
const store = createPlannerStatsStore(storage);
const lifecycle = createPlannerStatsLifecycle(store);
const run = { day: 20, reset: 3 };

assert.deepEqual(lifecycle.load(run), {
  startDay: 20,
  day: 20,
  reset: 3,
  samples: {},
  total: 0,
});

const valid = {
  startDay: 10,
  day: 19,
  reset: 3,
  samples: { Iron: 4 },
  total: 4,
};
values.set("ea_planner_stats", JSON.stringify(valid));
assert.deepEqual(lifecycle.load(run), valid);

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
