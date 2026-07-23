import assert from "node:assert/strict";

import {
  planGoalTransition,
  computeMoneyWindow,
  computeTowerSize,
  evaluateStabilise,
} from "../src/domain/state-update.ts";
import { createStateUpdateReader } from "../src/adapters/evolve/state-update.ts";
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
