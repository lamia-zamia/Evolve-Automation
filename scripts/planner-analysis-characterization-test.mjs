import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const stored = new Map();
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setPlannerAnalysisTestContext, "function");
const planner = hooks.plannerAnalysis;
for (const name of [
  "plannerLimitingResource",
  "makePlannerStats",
  "loadPlannerStats",
  "savePlannerStats",
]) {
  assert.equal(typeof planner?.[name], "function", `${name} hook missing`);
}

function resource(title, overrides = {}) {
  return {
    title,
    currentQuantity: 0,
    maxQuantity: 1000,
    income: 1,
    isUnlocked: () => true,
    ...overrides,
  };
}

const resources = {
  Locked: resource("Locked", { isUnlocked: () => false }),
  Full: resource("Full", { currentQuantity: 100 }),
  Slow: resource("Slow", { currentQuantity: 10, income: 5 }),
  Stalled: resource("Stalled", { income: 0 }),
  Storage: resource("Storage", { maxQuantity: 50, income: 10 }),
};
const state = { plannerStats: null };
const game = { global: { stats: { days: 123, reset: 7 } } };
hooks.setPlannerAnalysisTestContext({ game, resources, state });

assert.equal(
  planner.plannerLimitingResource({ isAffordable: () => true, cost: {} }),
  null,
);
assert.equal(
  planner.plannerLimitingResource({
    isAffordable: () => false,
    cost: { Locked: 100, Full: 100 },
  }),
  null,
);

let limit = planner.plannerLimitingResource({
  isAffordable: () => false,
  cost: { Slow: 110 },
});
assert.equal(limit.resourceId, "Slow");
assert.equal(limit.resourceTitle, "Slow");
assert.equal(limit.time, 20);
assert.equal(limit.blocker, "income");

limit = planner.plannerLimitingResource({
  isAffordable: () => false,
  cost: { Missing: 1 },
});
assert.equal(limit.status, "unavailable");
assert.equal(limit.reason, "invalid-resource");
assert.equal(limit.resourceId, "Missing");

limit = planner.plannerLimitingResource({
  isAffordable: () => false,
  cost: { Slow: 110, Stalled: 10, Storage: 100 },
});
assert.equal(limit.resourceId, "Storage");
assert.equal(limit.resourceTitle, "Storage");
assert.equal(limit.time, Number.MAX_SAFE_INTEGER);
assert.equal(limit.blocker, "storage");

resources.SameSpeed = resource("Same Speed", {
  currentQuantity: 10,
  income: 5,
});
limit = planner.plannerLimitingResource({
  isAffordable: () => false,
  cost: { Slow: 110, SameSpeed: 110 },
});
assert.equal(limit.resourceId, "Slow");

const freshStats = planner.makePlannerStats();
assert.deepEqual(
  { ...freshStats, samples: { ...freshStats.samples } },
  {
    startDay: 123,
    day: 123,
    reset: 7,
    samples: {},
    total: 0,
  },
);

stored.set(
  "ea_planner_stats",
  JSON.stringify({
    startDay: 100,
    day: 120,
    reset: 7,
    samples: { Iron: 2 },
    total: 2,
  }),
);
const loadedStats = planner.loadPlannerStats();
assert.deepEqual(
  { ...loadedStats, samples: { ...loadedStats.samples } },
  {
    startDay: 100,
    day: 120,
    reset: 7,
    samples: { Iron: 2 },
    total: 2,
  },
);

stored.set("ea_planner_stats", "not-json");
assert.equal(planner.loadPlannerStats().startDay, 123);
stored.set("ea_planner_stats", JSON.stringify({ day: 124, reset: 7 }));
assert.equal(planner.loadPlannerStats().startDay, 123);

stored.set("ea_planner_stats", JSON.stringify({ day: 123, reset: 7 }));
const malformedSameRun = planner.loadPlannerStats();
assert.deepEqual(
  { ...malformedSameRun, samples: { ...malformedSameRun.samples } },
  {
    startDay: 123,
    day: 123,
    reset: 7,
    samples: {},
    total: 0,
  },
);

state.plannerStats = { total: 9 };
stored.set("ea_planner_stats", "sentinel");
planner.savePlannerStats();
assert.equal(stored.get("ea_planner_stats"), "sentinel");
state.plannerStats = {
  startDay: 100,
  day: 123,
  reset: 7,
  samples: { Iron: 2 },
  total: 2,
};
planner.savePlannerStats();
assert.equal(
  stored.get("ea_planner_stats"),
  JSON.stringify(state.plannerStats),
);
state.plannerStats = null;
stored.delete("ea_planner_stats");
planner.savePlannerStats();
assert.equal(stored.has("ea_planner_stats"), false);

console.log("Planner analysis bundled characterization tests passed");
