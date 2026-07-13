import assert from "node:assert/strict";
import { createEvolutionResult } from "../src/policies/evolution-result.ts";

function makeRace(name, { weighting = 0, goals = [], habitability = 1 } = {}) {
  return {
    name,
    getWeighting: (returnGoals) => (returnGoals ? goals : weighting),
    getHabitability: () => habitability,
  };
}

function makeContext(overrides = {}) {
  const { settings: settingsOverride, ...rest } = overrides;
  return {
    settings: {
      masterScriptToggle: true,
      autoEvolution: true,
      evolutionBackup: true,
      userEvolutionTarget: "auto",
      autoMutateTraits: false,
      evolutionQueueEnabled: false,
      evolutionQueueRepeat: false,
      ...(settingsOverride || {}),
    },
    settingsRaw: { evolutionQueue: [] },
    state: { evoCheckNeeded: true },
    game: {
      global: { race: { species: "human" } },
      races: { human: { traits: {} } },
      loc: (key) => (key === "reset_soft" ? "Soft Reset" : `loc:${key}`),
    },
    races: { human: makeRace("Human", { weighting: 10, goals: [] }) },
    MutableTraitManager: { priorityList: [] },
    ...rest,
  };
}

// A single mutable context, replaced wholesale between runs, proves every runtime
// dependency is resolved through live getters rather than captured at factory time.
let context = makeContext();
const logs = [];
const calls = [];
const resetButton = {
  innerText: "Soft Reset",
  disabled: true,
  click: () => calls.push("click"),
};
let queriedSelector;

const { checkEvolutionResult } = createEvolutionResult({
  getSettings: () => context.settings,
  getSettingsRaw: () => context.settingsRaw,
  getState: () => context.state,
  getGame: () => context.game,
  getRaces: () => context.races,
  getMutableTraitManager: () => context.MutableTraitManager,
  getGameLog: () => ({
    logDanger: (type, message, tags) => logs.push(["danger", message, tags]),
    logWarning: (type, message, tags) => logs.push(["warning", message, tags]),
    logInfo: (type, message, tags) => logs.push(["info", message, tags]),
  }),
  getDocument: () => ({
    querySelector(selector) {
      queriedSelector = selector;
      return resetButton;
    },
  }),
  // Resolved per call, so a late-bound replacement is still observed.
  getAddEvolutionSetting: () => () => calls.push("addEvolutionSetting"),
  getUpdateSettingsFromState: () => () => calls.push("updateSettingsFromState"),
});

// The evolution check runs at most once per evolution and clears its own flag.
assert.equal(checkEvolutionResult(), true);
assert.equal(context.state.evoCheckNeeded, false);
assert.deepEqual(logs, [
  [
    "info",
    "Auto Achievement can't pick a goal for this run.",
    ["progress", "achievements"],
  ],
]);
assert.deepEqual(calls, []);

logs.length = 0;
assert.equal(checkEvolutionResult(), true);
assert.deepEqual(logs, []);

// Whole-context replacement: Auto Achievement now lands on a worthless race while a
// better one exists, so the run is soft reset and the evolution queue rotates.
logs.length = 0;
context = makeContext({
  settings: { evolutionQueueEnabled: true },
  settingsRaw: { evolutionQueue: [{ id: "first" }, { id: "second" }] },
  races: {
    human: makeRace("Human", { weighting: 0 }),
    elven: makeRace("Elven", { weighting: 50 }),
  },
});
assert.equal(checkEvolutionResult(), false);
assert.equal(queriedSelector, ".reset .button:not(.right)");
assert.deepEqual(calls, [
  "addEvolutionSetting",
  "updateSettingsFromState",
  "click",
]);
assert.deepEqual(
  context.settingsRaw.evolutionQueue.map((entry) => entry.id),
  ["second", "first"],
);
assert.equal(context.state.goal, "GameOverMan");
assert.equal(resetButton.disabled, false);

// A hard-reset button abandons the pending reset: nothing is persisted, rotated, or
// clicked, and the tick is allowed to continue.
calls.length = 0;
resetButton.innerText = "Reset";
resetButton.disabled = true;
context = makeContext({
  settings: { evolutionQueueEnabled: true },
  settingsRaw: { evolutionQueue: [{ id: "first" }, { id: "second" }] },
  races: {
    human: makeRace("Human", { weighting: 0 }),
    elven: makeRace("Elven", { weighting: 50 }),
  },
});
assert.equal(checkEvolutionResult(), true);
assert.deepEqual(calls, []);
assert.deepEqual(
  context.settingsRaw.evolutionQueue.map((entry) => entry.id),
  ["first", "second"],
);
assert.equal(context.state.goal, undefined);
assert.equal(resetButton.disabled, true);
resetButton.innerText = "Soft Reset";

// A reset-enabled trait the base race lacks forces a reset and suppresses the goal log.
logs.length = 0;
calls.length = 0;
context = makeContext({
  settings: { autoMutateTraits: true },
  game: {
    global: { race: { species: "human", hyper: 1, gullible: 1 } },
    races: { human: { traits: { gullible: 1 } } },
    loc: (key) => (key === "reset_soft" ? "Soft Reset" : `loc:${key}`),
  },
  races: { human: makeRace("Human", { weighting: 10, goals: ["achieve_a"] }) },
  MutableTraitManager: {
    priorityList: [
      // Inherited from the base race, so not a mutation.
      { traitName: "gullible", name: "gullible", resetEnabled: true },
      { traitName: "hyper", name: "hyper", resetEnabled: true },
    ],
  },
});
assert.equal(checkEvolutionResult(), false);
assert.deepEqual(logs, [
  [
    "danger",
    "Gained hyper trait, soft resetting and trying again.",
    ["progress"],
  ],
]);
// The queue is disabled, so only the settings write and the click happen.
assert.deepEqual(calls, ["updateSettingsFromState", "click"]);

console.log("Evolution result module tests passed");
