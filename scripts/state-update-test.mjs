import assert from "node:assert/strict";

import { createStateUpdate } from "./test-support/legacy-state-update.ts";
import { runStateUpdate } from "../src/application/state-update.ts";
import {
  createStateUpdateReader,
  createStateUpdateControls,
} from "../src/adapters/evolve/state-update.ts";
import { createActiveTargetsControls } from "../src/adapters/browser/active-targets.ts";
import {
  planGoalTransition,
  computeMoneyWindow,
  computeTowerSize,
  evaluateStabilise,
} from "../src/domain/state-update.ts";

const isTechnology = (target) => target?.kind === "tech";
const isProject = (target) => target?.kind === "arpa";

// A jQuery stub that records which selectors were touched, so both implementations render the
// active-targets panel through the same recorded vocabulary.
function makeJQuery(trace) {
  return (target) => {
    trace.push(`$:${typeof target === "string" ? target : "<element>"}`);
    return {
      click() {
        return this;
      },
      off(event) {
        trace.push(`$off:${event}`);
        return this;
      },
      css() {
        return this;
      },
      filter: () => [],
      data: () => undefined,
      length: 0,
    };
  };
}

/** Builds one fully instrumented fixture whose helper/manager/poly/jQuery calls push to `trace`. */
function makeFixture(options) {
  const {
    species = "human",
    goal = "Standard",
    days = 100,
    slow = false,
    hyper = false,
    triggers = [],
    pillars = null,
    interstellar = null,
    exoticMass = 0,
    moneyIncomes = [1, 9, 2, 8, 3, 7, 4, 6, 5, 0, 10],
    moneyRate = 100,
    optionsCached = true,
    activeTargetsUI = false,
    queuedTargetsAll = [],
    triggerTargets = [],
    targetTriggers = [],
    evolutionResult = true,
  } = options;

  const trace = [];

  const global = { race: { species, slow, hyper }, stats: { days } };
  if (pillars) {
    global.pillars = pillars;
  }
  if (interstellar) {
    global.interstellar = interstellar;
  }

  const state = {
    goal,
    tooltips: { stale: true },
    moneyIncomes: [...moneyIncomes],
    moneyMedian: 0,
    astroSign: "",
    whiteholeLastExoticMass: exoticMass,
    whiteholeLastStabilise: 0,
    queuedTargetsAll,
    triggerTargets,
  };

  const resources = {
    Money: {
      maxCost: 5,
      storageRequired: 5,
      requestedQuantity: 5,
      rateOfChange: moneyRate,
    },
    Stone: {
      maxCost: 5,
      storageRequired: 5,
      requestedQuantity: 5,
      rateOfChange: 3,
    },
  };

  const buildings = {
    GateEastTower: { gameMax: 0 },
    GateWestTower: { gameMax: 0 },
    GasSpaceDock: {
      isOptionsCached: () => optionsCached,
      cacheOptions: () => trace.push("cacheOptions"),
    },
  };

  const helpers = {
    checkEvolutionResult: () => {
      trace.push("checkEvolutionResult");
      return evolutionResult;
    },
    updateTriggerSettingsContent: () =>
      trace.push("updateTriggerSettingsContent"),
    updatePriorityTargets: () => trace.push("updatePriorityTargets"),
    calculateRequiredStorages: () => trace.push("calculateRequiredStorages"),
    prioritizeDemandedResources: () =>
      trace.push("prioritizeDemandedResources"),
    updateActiveTargetsUI: (list, type) =>
      trace.push(`updateActiveTargetsUI:${type}:${list.length}`),
  };

  return {
    trace,
    state,
    resources,
    buildings,
    settings: { activeTargetsUI },
    settingsRaw: { triggers },
    game: { global },
    StorageManager: { crateValue: 0, containerValue: 0 },
    ProjectManager: { updateProjects: () => trace.push("updateProjects") },
    TriggerManager: { targetTriggers },
    poly: {
      crateValue: () => {
        trace.push("crateValue");
        return 111;
      },
      containerValue: () => {
        trace.push("containerValue");
        return 222;
      },
      astrologySign: () => {
        trace.push("astrologySign");
        return "aries";
      },
    },
    helpers,
    jquery: makeJQuery(trace),
  };
}

function runLegacy(fixture) {
  const { updateState } = createStateUpdate({
    getSettings: () => fixture.settings,
    getSettingsRaw: () => fixture.settingsRaw,
    getState: () => fixture.state,
    getGame: () => fixture.game,
    getResources: () => fixture.resources,
    getBuildings: () => fixture.buildings,
    getStorageManager: () => fixture.StorageManager,
    getProjectManager: () => fixture.ProjectManager,
    getTriggerManager: () => fixture.TriggerManager,
    getPoly: () => fixture.poly,
    getJQuery: () => fixture.jquery,
    getHelpers: () => fixture.helpers,
    isTechnology,
    isProject,
  });
  updateState();
}

function runNew(fixture) {
  const reader = createStateUpdateReader({
    getGame: () => fixture.game,
    getState: () => fixture.state,
    getSettingsRaw: () => fixture.settingsRaw,
    getResources: () => fixture.resources,
  });
  const activeTargets = createActiveTargetsControls({
    getJQuery: () => fixture.jquery,
    getSettings: () => fixture.settings,
    getState: () => fixture.state,
    getTriggerManager: () => fixture.TriggerManager,
    updateActiveTargetsUI: (targets, type) =>
      fixture.helpers.updateActiveTargetsUI(targets, type),
    isTechnology,
    isProject,
  });
  const controls = createStateUpdateControls({
    getState: () => fixture.state,
    getResources: () => fixture.resources,
    getBuildings: () => fixture.buildings,
    getStorageManager: () => fixture.StorageManager,
    getPoly: () => fixture.poly,
    checkEvolutionResult: () => fixture.helpers.checkEvolutionResult(),
    updateTriggerSettingsContent: () =>
      fixture.helpers.updateTriggerSettingsContent(),
    updatePriorityTargets: () => fixture.helpers.updatePriorityTargets(),
    updateProjects: () => fixture.ProjectManager.updateProjects(),
    calculateRequiredStorages: () =>
      fixture.helpers.calculateRequiredStorages(),
    prioritizeDemandedResources: () =>
      fixture.helpers.prioritizeDemandedResources(),
    updateActiveTargets: () => activeTargets.updateActiveTargets(),
  });
  runStateUpdate({
    reader,
    controls,
    clock: { nowMs: () => Date.now() },
  });
}

/** Normalizes a run's observable result: the stabilise timestamp is compared as a boolean. */
function snapshot(fixture) {
  const { state, resources, buildings, StorageManager } = fixture;
  return {
    trace: fixture.trace,
    goal: state.goal,
    tooltips: Object.keys(state.tooltips),
    moneyIncomes: state.moneyIncomes,
    moneyMedian: state.moneyMedian,
    astroSign: state.astroSign,
    whiteholeLastExoticMass: state.whiteholeLastExoticMass,
    stabilised: state.whiteholeLastStabilise > 0,
    resources: Object.fromEntries(
      Object.entries(resources).map(([id, res]) => [
        id,
        [res.maxCost, res.storageRequired, res.requestedQuantity],
      ]),
    ),
    towers: [buildings.GateEastTower.gameMax, buildings.GateWestTower.gameMax],
    storage: [StorageManager.crateValue, StorageManager.containerValue],
  };
}

let scenarioCount = 0;
function dualRun(label, options = {}) {
  const legacy = makeFixture(options);
  const migrated = makeFixture(options);
  runLegacy(legacy);
  runNew(migrated);
  assert.deepEqual(snapshot(migrated), snapshot(legacy), label);
  scenarioCount += 1;
}

// --- Dual-run equivalence across the refresh's branches -----------------------------------------

dualRun("standard refresh");
dualRun("protoplasm forces evolution", { species: "protoplasm" });
dualRun("leaving evolution, no triggers", { goal: "Evolution" });
dualRun("leaving evolution, with triggers", {
  goal: "Evolution",
  triggers: [{}, {}],
});
dualRun("rejected evolution result", {
  goal: "Evolution",
  evolutionResult: false,
});
dualRun("day-1 slow fallback", { days: 1, slow: true });
dualRun("day-1 hyper fallback", { days: 1, hyper: true });
dualRun("day-1 junker fallback", { days: 1, species: "junker" });
dualRun("day-1 rejected fallback", {
  days: 1,
  slow: true,
  evolutionResult: false,
});
dualRun("day-1 non-fallback race", { days: 1 });
dualRun("later day with slow race", { days: 2, slow: true });
dualRun("some pillars raised", { pillars: { human: 3, elven: 0, orc: 1 } });
dualRun("pillars below floor", {
  pillars: Object.fromEntries(
    Array.from({ length: 30 }, (unused, index) => [`race${index}`, 20]),
  ),
});
dualRun("stabilised (exotic decreasing)", {
  interstellar: { stellar_engine: { exotic: 5 } },
  exoticMass: 9,
});
dualRun("growing (exotic increasing)", {
  interstellar: { stellar_engine: { exotic: 12 } },
  exoticMass: 9,
});
dualRun("no stellar engine, prior mass", { exoticMass: 3 });
dualRun("space dock options need caching", { optionsCached: false });
dualRun("short money window", { moneyIncomes: [1, 2], moneyRate: 50 });
dualRun("active-targets panel off");
dualRun("active-targets panel on", {
  activeTargetsUI: true,
  queuedTargetsAll: [
    { kind: "tech" },
    { kind: "arpa" },
    { kind: "building" },
    { kind: "tech" },
  ],
  triggerTargets: [{ kind: "tech" }, { kind: "tech" }],
  targetTriggers: [{ actionId: "tech-mad", complete: false }],
});

console.log(`State update dual-run parity: ${scenarioCount} scenarios matched`);

// --- Pure planner unit tests --------------------------------------------------------------------

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

// Money window: drop the oldest, refill to 11 with the current rate, median is the 6th sorted sample.
assert.deepEqual(computeMoneyWindow([1, 9, 2, 8, 3, 7, 4, 6, 5, 0, 10], 100), {
  incomes: [9, 2, 8, 3, 7, 4, 6, 5, 0, 10, 100],
  median: 6,
});
assert.deepEqual(computeMoneyWindow([1, 2], 50), {
  incomes: [2, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
  median: 50,
});

// Tower size: 1000 minus (rank*2+2) per raised pillar, floored at 250.
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

// Stabilise: exotic mass going down flags a stabilise; the new mass is always carried forward.
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

// --- Adapter contract tests ---------------------------------------------------------------------

function makeReader(overrides = {}) {
  const game = overrides.game ?? {
    global: {
      race: { species: "human", slow: false, hyper: false },
      stats: { days: 42 },
    },
  };
  const state = overrides.state ?? {
    goal: "Standard",
    moneyIncomes: [1, 2, 3],
    whiteholeLastExoticMass: 7,
  };
  const settingsRaw = overrides.settingsRaw ?? { triggers: [{}, {}] };
  const resources = overrides.resources ?? { Money: { rateOfChange: 5 } };
  return createStateUpdateReader({
    getGame: () => game,
    getState: () => state,
    getSettingsRaw: () => settingsRaw,
    getResources: () => resources,
  });
}

// Malformed game containers are rejected.
const nullGameReader = createStateUpdateReader({
  getGame: () => null,
  getState: () => ({}),
  getSettingsRaw: () => ({ triggers: [] }),
  getResources: () => ({ Money: {} }),
});
assert.throws(() => nullGameReader.sampleGoalTransition());
assert.throws(() =>
  makeReader({
    game: { global: { stats: { days: 1 } } },
  }).sampleGoalTransition(),
);

// Goal transition coercions: non-string species/goal and non-number days never match legacy's ===.
const oddGoal = makeReader({
  game: {
    global: { race: { species: 42, slow: 1, hyper: 0 }, stats: { days: "x" } },
  },
  state: { goal: null },
  settingsRaw: { triggers: "nope" },
}).sampleGoalTransition();
assert.equal(oddGoal.species, undefined);
assert.equal(oddGoal.goal, "");
assert.ok(Number.isNaN(oddGoal.day));
assert.equal(oddGoal.slow, true);
assert.equal(oddGoal.hyper, false);
assert.equal(oddGoal.triggerCount, 0);

const goodGoal = makeReader().sampleGoalTransition();
assert.equal(goodGoal.species, "human");
assert.equal(goodGoal.day, 42);
assert.equal(goodGoal.triggerCount, 2);

// Refresh coercions: pillars absent -> undefined; present with odd values -> numbers.
const noPillars = makeReader().sampleRefresh();
assert.equal(noPillars.pillars, undefined);
assert.equal(noPillars.currentExotic, 0);
assert.deepEqual(noPillars.moneyIncomes, [1, 2, 3]);
assert.equal(noPillars.moneyRate, 5);
assert.equal(noPillars.lastExoticMass, 7);

const withPillars = makeReader({
  game: {
    global: {
      race: { species: "human" },
      stats: { days: 1 },
      pillars: { human: "3", orc: 2 },
      interstellar: { stellar_engine: { exotic: 8 } },
    },
  },
}).sampleRefresh();
assert.deepEqual(withPillars.pillars, { human: 3, orc: 2 });
assert.equal(withPillars.currentExotic, 8);

// Lazily-absent numeric/array fields coerce leniently (NaN / empty) rather than throwing.
const lazy = makeReader({
  state: {},
  resources: { Money: {} },
}).sampleRefresh();
assert.deepEqual(lazy.moneyIncomes, []);
assert.ok(Number.isNaN(lazy.moneyRate));
assert.ok(Number.isNaN(lazy.lastExoticMass));

console.log("State update slice tests passed");
