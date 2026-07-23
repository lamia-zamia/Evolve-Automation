import assert from "node:assert/strict";

import { readEvolutionResultInput } from "../src/adapters/evolve/progression/evolution/evolution-result.ts";

function makeRace(name, { weighting = 0, goals = [], habitability = 1 } = {}) {
  return {
    name,
    getWeighting: (returnGoals) => (returnGoals ? goals : weighting),
    getHabitability: () => habitability,
  };
}

function makeSettings(overrides = {}) {
  return {
    autoEvolution: true,
    evolutionBackup: true,
    autoMutateTraits: false,
    userEvolutionTarget: "auto",
    ...overrides,
  };
}

function makeGame(overrides = {}) {
  return {
    global: { race: { species: "human" } },
    races: { human: { traits: {} } },
    ...overrides,
  };
}

function makeRaces() {
  return {
    human: makeRace("Human", { weighting: 10, goals: ["achieve_a"] }),
    elven: makeRace("Elven", { weighting: 50, habitability: 1 }),
  };
}

// --- Happy path -------------------------------------------------------------
{
  const result = readEvolutionResultInput(
    makeSettings(),
    makeGame(),
    makeRaces(),
    { priorityList: [] },
  );
  assert.equal(result.status, "ready");
  assert.equal(result.input.species, "human");
  assert.deepEqual(result.input.speciesRace, {
    name: "Human",
    weighting: 10,
    goals: ["achieve_a"],
  });
  assert.equal(result.input.bestWeighting, 50);
  assert.equal("targetHabitability" in result.input, false);
  assert.throws(() => {
    result.input.speciesRace.weighting = 0;
  }, "input must be frozen");
}

// Explicit distinct target samples habitability.
{
  const result = readEvolutionResultInput(
    makeSettings({ userEvolutionTarget: "elven" }),
    makeGame(),
    makeRaces(),
    { priorityList: [] },
  );
  assert.equal(result.status, "ready");
  assert.equal(result.input.targetHabitability, 1);
}
// Explicit target equal to species does not sample habitability.
assert.equal(
  "targetHabitability" in
    readEvolutionResultInput(
      makeSettings({ userEvolutionTarget: "human" }),
      makeGame(),
      makeRaces(),
      { priorityList: [] },
    ).input,
  false,
);

// Traits: gained vs inherited, sampled only when autoMutateTraits is on.
{
  const result = readEvolutionResultInput(
    makeSettings({ autoMutateTraits: true }),
    makeGame({
      global: { race: { species: "human", hyper: 1, gullible: 1 } },
      races: { human: { traits: { gullible: 1 } } },
    }),
    makeRaces(),
    {
      priorityList: [
        { traitName: "hyper", name: "hyper", resetEnabled: true },
        { traitName: "gullible", name: "gullible", resetEnabled: true },
      ],
    },
  );
  assert.equal(result.status, "ready");
  assert.deepEqual(result.input.traits, [
    {
      name: "hyper",
      resetEnabled: true,
      gained: true,
      inheritedFromBase: false,
    },
    {
      name: "gullible",
      resetEnabled: true,
      gained: true,
      inheritedFromBase: true,
    },
  ]);
}
// Traits are not read when autoMutateTraits is off, even with bad trait data.
assert.equal(
  readEvolutionResultInput(
    makeSettings({ autoMutateTraits: false }),
    makeGame(),
    makeRaces(),
    { priorityList: "not-an-array" },
  ).status,
  "ready",
);

// --- Malformed inputs fail closed (caller then continues without resetting) --
for (const [settings, game, races, traitManager, field] of [
  [null, makeGame(), makeRaces(), { priorityList: [] }, undefined],
  [
    makeSettings({ userEvolutionTarget: 5 }),
    makeGame(),
    makeRaces(),
    { priorityList: [] },
    "userEvolutionTarget",
  ],
  [
    makeSettings(),
    { global: { race: {} } },
    makeRaces(),
    { priorityList: [] },
    "race.species",
  ],
  [makeSettings(), makeGame(), {}, { priorityList: [] }, "human"],
  [
    makeSettings(),
    makeGame(),
    { human: { getWeighting: () => 10 } },
    { priorityList: [] },
    "human.name",
  ],
  [
    makeSettings(),
    makeGame(),
    { human: makeRace("Human", { weighting: Number.NaN }) },
    { priorityList: [] },
    "human.weighting",
  ],
  [
    makeSettings({ userEvolutionTarget: "elven" }),
    makeGame(),
    { human: makeRace("Human") },
    { priorityList: [] },
    "elven.getHabitability",
  ],
  [
    makeSettings({ autoMutateTraits: true }),
    makeGame(),
    makeRaces(),
    { priorityList: [{ name: "x" }] },
    undefined,
  ],
]) {
  const result = readEvolutionResultInput(settings, game, races, traitManager);
  assert.equal(
    result.status,
    "unavailable",
    `expected unavailable for ${field}`,
  );
  if (field !== undefined) assert.equal(result.field, field);
}

// A throwing race-model getter is caught, not propagated.
assert.equal(
  readEvolutionResultInput(
    makeSettings(),
    makeGame(),
    {
      human: {
        name: "Human",
        getWeighting() {
          throw new Error("boom");
        },
      },
    },
    { priorityList: [] },
  ).status,
  "unavailable",
);

console.log("Evolution result adapter contract tests passed");
