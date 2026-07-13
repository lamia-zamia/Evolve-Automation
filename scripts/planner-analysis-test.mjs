import assert from "node:assert/strict";

import { createPlannerAnalysis } from "../src/planning/planner-analysis.ts";

const stored = new Map();
let game = { global: { stats: { days: 10, reset: 2 } } };
let resources = {
  Iron: {
    title: "Iron",
    currentQuantity: 0,
    maxQuantity: 100,
    income: 10,
    isUnlocked: () => true,
  },
};
let state = { plannerStats: null };
const planner = createPlannerAnalysis({
  getGame: () => game,
  getResources: () => resources,
  getState: () => state,
  storage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
});

assert.equal(
  planner.plannerLimitingResource({
    isAffordable: () => false,
    cost: { Iron: 50 },
  }).time,
  5,
);
assert.equal(planner.makePlannerStats().startDay, 10);

game = { global: { stats: { days: 20, reset: 3 } } };
resources = {
  Iron: {
    title: "Iron",
    currentQuantity: 0,
    maxQuantity: 10,
    income: 10,
    isUnlocked: () => true,
  },
};
assert.equal(
  planner.plannerLimitingResource({
    isAffordable: () => false,
    cost: { Iron: 50 },
  }).blocker,
  "storage",
);
assert.equal(planner.makePlannerStats().reset, 3);

state = { plannerStats: { total: 4 } };
planner.savePlannerStats();
assert.equal(stored.get("ea_planner_stats"), JSON.stringify({ total: 4 }));

console.log("Planner analysis module tests passed");
