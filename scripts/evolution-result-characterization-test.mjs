import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

// checkEvolutionResult confirms the pending reset is a *soft* reset by comparing the
// reset button's label against the localized string, so the button is a stub the
// scenarios can retitle.
const resetButton = { innerText: "Soft Reset", disabled: true, clicks: 0 };
resetButton.click = () => {
  resetButton.clicks += 1;
};

const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  document: {
    querySelector(selector) {
      return selector === ".reset .button:not(.right)" ? resetButton : null;
    },
  },
  $: Object.assign(() => ({ ready() {}, each() {} }), {
    isEmptyObject: (object) => Object.keys(object).length === 0,
  }),
});

assert.equal(typeof hooks.checkEvolutionResult, "function");
assert.equal(typeof hooks.setEvolutionResultTestContext, "function");

function makeRace(name, { weighting = 0, goals = [], habitability = 1 } = {}) {
  return {
    name,
    getWeighting: (returnGoals) => (returnGoals ? goals : weighting),
    getHabitability: () => habitability,
  };
}

function makeTrait(traitName, { resetEnabled = false } = {}) {
  return { traitName, name: traitName, resetEnabled };
}

function baseSettings(overrides = {}) {
  return {
    masterScriptToggle: true,
    autoEvolution: true,
    evolutionBackup: true,
    userEvolutionTarget: "auto",
    autoMutateTraits: false,
    evolutionQueueEnabled: false,
    evolutionQueueRepeat: false,
    ...overrides,
  };
}

function runScenario({
  settings,
  species = "human",
  baseTraits = {},
  raceTraits = {},
  races,
  priorityList = [],
  evolutionQueue = [],
  buttonText = "Soft Reset",
  evoCheckNeeded = true,
}) {
  resetButton.innerText = buttonText;
  resetButton.disabled = true;
  resetButton.clicks = 0;

  const logs = [];
  const actionCalls = [];
  const state = { evoCheckNeeded };
  const settingsRaw = { evolutionQueue };

  hooks.setEvolutionResultTestContext({
    settings,
    settingsRaw,
    state,
    game: {
      global: { race: { species, ...raceTraits } },
      races: { [species]: { traits: baseTraits } },
      loc: (key) => (key === "reset_soft" ? "Soft Reset" : `loc:${key}`),
    },
    races,
    MutableTraitManager: { priorityList },
    GameLog: {
      logDanger: (type, message) => logs.push(["danger", type, message]),
      logWarning: (type, message) => logs.push(["warning", type, message]),
      logInfo: (type, message) => logs.push(["info", type, message]),
    },
    actions: {
      addEvolutionSetting: () => actionCalls.push("addEvolutionSetting"),
      updateSettingsFromState: () =>
        actionCalls.push("updateSettingsFromState"),
    },
  });

  const result = hooks.checkEvolutionResult();

  return {
    result,
    logs: JSON.parse(JSON.stringify(logs)),
    actionCalls: [...actionCalls],
    clicks: resetButton.clicks,
    buttonEnabled: !resetButton.disabled,
    goal: state.goal,
    evoCheckNeeded: state.evoCheckNeeded,
    // settingsRaw crosses realms only through the evolution queue rotation.
    queue: Array.from(settingsRaw.evolutionQueue, (entry) => entry.id),
  };
}

// The check is inert while the script is off, and it never fires twice for one
// evolution: the first call clears the flag.
assert.equal(
  runScenario({
    settings: baseSettings({ masterScriptToggle: false }),
    races: {},
    evoCheckNeeded: true,
  }).result,
  true,
);
const notNeeded = runScenario({
  settings: baseSettings(),
  races: {},
  evoCheckNeeded: false,
});
assert.equal(notNeeded.result, true);
assert.deepEqual(notNeeded.logs, []);

// Scenario A: Auto Achievement landed on a race with no unearned achievements, but
// another race still has some, so the run is soft reset and the evolution queue
// rotates (repeat off, so the current setting is re-queued first).
const scenarioA = runScenario({
  settings: baseSettings({
    evolutionQueueEnabled: true,
    evolutionQueueRepeat: false,
  }),
  species: "human",
  races: {
    human: makeRace("Human", { weighting: 0 }),
    elven: makeRace("Elven", { weighting: 50 }),
  },
  evolutionQueue: [{ id: "first" }, { id: "second" }],
});
assert.equal(scenarioA.result, false);
assert.deepEqual(scenarioA.logs, [
  [
    "danger",
    "special",
    "Human have no unearned achievements for current prestige, soft resetting and trying again.",
  ],
]);
assert.deepEqual(scenarioA.actionCalls, [
  "addEvolutionSetting",
  "updateSettingsFromState",
]);
assert.deepEqual(scenarioA.queue, ["second", "first"]);
assert.equal(scenarioA.goal, "GameOverMan");
assert.equal(scenarioA.clicks, 1);
assert.equal(scenarioA.buttonEnabled, true);
assert.equal(scenarioA.evoCheckNeeded, false);

// Scenario B: no race has unearned achievements left, so the run continues with a
// warning instead of resetting, and the goal log reports the empty goal list.
const scenarioB = runScenario({
  settings: baseSettings(),
  species: "human",
  races: {
    human: makeRace("Human", { weighting: 0, goals: [] }),
    elven: makeRace("Elven", { weighting: 0 }),
  },
});
assert.equal(scenarioB.result, true);
assert.deepEqual(scenarioB.logs, [
  [
    "warning",
    "special",
    "Can't pick a race with unearned achievements for current prestige. Continuing with Human.",
  ],
  ["info", "special", "Auto Achievement can't pick a goal for this run."],
]);
assert.deepEqual(scenarioB.actionCalls, []);
assert.equal(scenarioB.clicks, 0);

// Scenario C: the intended race evolved successfully, so Auto Achievement announces
// the goals it is chasing. Goal ids are localized through game.loc.
const scenarioC = runScenario({
  settings: baseSettings(),
  species: "elven",
  races: {
    elven: makeRace("Elven", { weighting: 10, goals: ["achieve_a", "feat_b"] }),
  },
});
assert.equal(scenarioC.result, true);
assert.deepEqual(scenarioC.logs, [
  ["info", "special", "Auto Achievement goes for: loc:achieve_a, loc:feat_b."],
]);

// Scenario D: an explicit evolution target that is habitable but did not evolve is a
// wrong-race reset. The queue is disabled here, so only settings are persisted.
const scenarioD = runScenario({
  settings: baseSettings({ userEvolutionTarget: "elven" }),
  species: "human",
  races: {
    human: makeRace("Human", { weighting: 0 }),
    elven: makeRace("Elven", { habitability: 1 }),
  },
  evolutionQueue: [{ id: "first" }],
});
assert.equal(scenarioD.result, false);
assert.deepEqual(scenarioD.logs, [
  ["danger", "special", "Wrong race, soft resetting and trying again."],
]);
assert.deepEqual(scenarioD.actionCalls, ["updateSettingsFromState"]);
assert.deepEqual(scenarioD.queue, ["first"]);
assert.equal(scenarioD.clicks, 1);

// An uninhabitable explicit target is not a wrong-race reset: the game could not have
// evolved it in the first place.
const uninhabitable = runScenario({
  settings: baseSettings({ userEvolutionTarget: "elven" }),
  species: "human",
  races: {
    human: makeRace("Human", { weighting: 5 }),
    elven: makeRace("Elven", { habitability: 0 }),
  },
});
assert.equal(uninhabitable.result, true);
assert.deepEqual(uninhabitable.logs, []);
assert.equal(uninhabitable.clicks, 0);

// Intentional-only species (Valdi, Sludge, Hellspawn) skip the evolution backup check
// entirely, even though this one evolved with a zero weighting.
const sludge = runScenario({
  settings: baseSettings(),
  species: "sludge",
  races: { sludge: makeRace("Sludge", { weighting: 0, goals: [] }) },
});
assert.equal(sludge.result, true);
assert.deepEqual(sludge.logs, [
  ["info", "special", "Auto Achievement can't pick a goal for this run."],
]);

// Scenario E: a mutation-reset trait that the base race does not have forces a reset,
// and the earlier goal log is suppressed because a reset is already pending.
const scenarioE = runScenario({
  settings: baseSettings({ autoMutateTraits: true }),
  species: "human",
  raceTraits: { hyper: 1, gullible: 1 },
  baseTraits: { gullible: 1 },
  races: { human: makeRace("Human", { weighting: 10, goals: ["achieve_a"] }) },
  priorityList: [
    // Ignored: not enabled for reset.
    makeTrait("cunning", { resetEnabled: true }),
    makeTrait("gullible", { resetEnabled: true }),
    makeTrait("hyper", { resetEnabled: true }),
  ],
});
assert.equal(scenarioE.result, false);
assert.deepEqual(scenarioE.logs, [
  ["danger", "special", "Gained hyper trait, soft resetting and trying again."],
]);
assert.deepEqual(scenarioE.actionCalls, ["updateSettingsFromState"]);
assert.equal(scenarioE.clicks, 1);

// A gained trait that is not reset-enabled is tolerated.
const toleratedTrait = runScenario({
  settings: baseSettings({ autoMutateTraits: true }),
  species: "human",
  raceTraits: { hyper: 1 },
  races: { human: makeRace("Human", { weighting: 10, goals: ["achieve_a"] }) },
  priorityList: [makeTrait("hyper", { resetEnabled: false })],
});
assert.equal(toleratedTrait.result, true);
assert.deepEqual(toleratedTrait.logs, [
  ["info", "special", "Auto Achievement goes for: loc:achieve_a."],
]);
assert.equal(toleratedTrait.clicks, 0);

// Scenario F: the reset button is a *hard* reset, so the pending reset is abandoned;
// the run continues and nothing is persisted or clicked.
const scenarioF = runScenario({
  settings: baseSettings({ evolutionQueueEnabled: true }),
  species: "human",
  races: {
    human: makeRace("Human", { weighting: 0 }),
    elven: makeRace("Elven", { weighting: 50 }),
  },
  evolutionQueue: [{ id: "first" }, { id: "second" }],
  buttonText: "Reset",
});
assert.equal(scenarioF.result, true);
assert.deepEqual(scenarioF.actionCalls, []);
assert.deepEqual(scenarioF.queue, ["first", "second"]);
assert.equal(scenarioF.clicks, 0);
assert.equal(scenarioF.goal, undefined);

// An enabled but empty evolution queue skips the rotation and only persists settings.
const emptyQueue = runScenario({
  settings: baseSettings({ evolutionQueueEnabled: true }),
  species: "human",
  races: {
    human: makeRace("Human", { weighting: 0 }),
    elven: makeRace("Elven", { weighting: 50 }),
  },
  evolutionQueue: [],
});
assert.equal(emptyQueue.result, false);
assert.deepEqual(emptyQueue.actionCalls, ["updateSettingsFromState"]);

// With repeat enabled the current setting is not re-queued, but the queue still rotates.
const repeating = runScenario({
  settings: baseSettings({
    evolutionQueueEnabled: true,
    evolutionQueueRepeat: true,
  }),
  species: "human",
  races: {
    human: makeRace("Human", { weighting: 0 }),
    elven: makeRace("Elven", { weighting: 50 }),
  },
  evolutionQueue: [{ id: "first" }, { id: "second" }, { id: "third" }],
});
assert.equal(repeating.result, false);
assert.deepEqual(repeating.actionCalls, ["updateSettingsFromState"]);
assert.deepEqual(repeating.queue, ["third", "first", "second"]);

console.log("Evolution result bundled characterization tests passed");
