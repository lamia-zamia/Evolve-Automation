import assert from "node:assert/strict";

import { createBuildPlanner } from "../src/planning/build-planner.ts";

function target(title = "Target") {
  return {
    title,
    weighting: 10,
    count: 0,
    is: {},
    extraDescription: "",
  };
}

function makeContext(overrides = {}) {
  const html = [];
  return {
    settings: {
      buildPlannerUI: true,
      stateLogEnabled: false,
      autoBuild: true,
      autoARPA: false,
    },
    settingsRaw: { buildPlannerCollapsed: false },
    state: {
      plannerFreshTick: 1,
      scriptTick: 1,
      unlockedBuildings: [],
      queuedTargets: [],
      triggerTargets: [],
      plannerStats: null,
    },
    game: { global: { stats: { days: 12 } } },
    document: { hidden: false },
    poly: { timeFormat: (seconds) => `${seconds}s` },
    jquery: (selector) => ({
      length: selector === "#script_planner-list" ? 1 : 0,
      html: (value) => html.push([selector, value]),
    }),
    html,
    ...overrides,
  };
}

let context = makeContext();
let loadCalls = 0;
let saveCalls = 0;
let savedStats = null;
let limitCalls = [];
const { updateBuildPlanner } = createBuildPlanner({
  gameBuildPlanner: {
    isPageHidden: () => context.document.hidden,
    readDay: () => context.game.global.stats.days,
    plannerListPresent: () => context.jquery("#script_planner-list").length > 0,
    writePlannerList: (value) =>
      context.jquery("#script_planner-list").html(value),
    writePlannerStats: (value) =>
      context.jquery("#script_planner-stats-text").html(value),
    formatPlannerTime: (seconds) => context.poly.timeFormat(seconds),
    formatPlannerNumber: (value) => value / 2,
  },
  getSettings: () => context.settings,
  getSettingsRaw: () => context.settingsRaw,
  getState: () => context.state,
  plannerLimitingResource: (item) => {
    limitCalls.push(item.title);
    return item.limit ?? null;
  },
  loadPlannerStats: () => {
    loadCalls++;
    return {
      startDay: 10,
      day: 10,
      reset: 2,
      samples: { Iron: 24 },
      total: 24,
    };
  },
  savePlannerStats: (stats) => {
    saveCalls++;
    savedStats = stats;
    return true;
  },
});

// All mutable objects are resolved per call. Replacing the whole context leaves the stale one
// untouched and drives sampling/rendering through the new one.
const stale = context;
stale.settings.buildPlannerUI = false;
updateBuildPlanner();
assert.deepEqual(stale.html, []);

const first = target("First");
first.limit = {
  resourceId: "Iron",
  resourceTitle: "Iron",
  time: 30,
  blocker: "income",
};
first.weighting = 8;
context = makeContext();
context.state.unlockedBuildings = [first];
updateBuildPlanner();
assert.equal(stale.state.plannerStats, null);
assert.equal(loadCalls, 1);
assert.equal(saveCalls, 1);
assert.deepEqual(limitCalls, ["First", "First"]);
assert.deepEqual(context.state.plannerStats, {
  startDay: 10,
  day: 12,
  reset: 2,
  samples: { Iron: 25 },
  total: 25,
});
assert.equal(savedStats, context.state.plannerStats);
assert.equal(context.html.length, 2);
assert.match(context.html[0][1], />4<\/span>/);
assert.match(context.html[0][1], />30s \(Iron\)<\/span>/);

// A replacement document and collapsed setting are also consulted at call time. Sampling still
// happens under state logging while rendering stays suppressed.
context = makeContext();
context.document.hidden = true;
context.settings.stateLogEnabled = true;
context.state.unlockedBuildings = [target("Hidden")];
updateBuildPlanner();
assert.deepEqual(context.html, []);
assert.equal(context.state.plannerStats.total, 25);
assert.equal(context.state.plannerStats.samples["not blocked"], 1);

context = makeContext();
const unavailable = target("Unavailable");
unavailable.limit = {
  status: "unavailable",
  reason: "invalid-resource",
  resourceId: "Missing",
};
context.state.unlockedBuildings = [unavailable];
updateBuildPlanner();
assert.equal(context.state.plannerStats.samples["data unavailable"], 1);
assert.match(context.html[0][1], /planner data unavailable/);
assert.match(context.html[0][1], /has-text-danger/);

context = makeContext();
const locked = target("Locked");
locked.limit = {
  resourceId: "Locked",
  resourceTitle: "Locked",
  time: Number.MAX_SAFE_INTEGER,
  blocker: "locked",
};
context.state.unlockedBuildings = [locked];
updateBuildPlanner();
assert.equal(context.state.plannerStats.samples.Locked, 1);
assert.match(context.html[0][1], /Locked \(locked\)/);
assert.match(context.html[0][1], /has-text-danger/);

console.log("Build planner module tests passed");
