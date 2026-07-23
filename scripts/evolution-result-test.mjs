import assert from "node:assert/strict";

import { decideEvolutionResult } from "../src/domain/progression/evolution/evolution-result.ts";
import { formatEvolutionLog } from "../src/application/evolution-result.ts";
import { legacyDecideEvolutionResult } from "./test-support/legacy-evolution-result.mjs";

const loc = (key) => `loc:${key}`;

function makeInput(overrides = {}) {
  return {
    autoEvolution: true,
    evolutionBackup: true,
    autoMutateTraits: false,
    userEvolutionTarget: "auto",
    species: "human",
    speciesRace: { name: "Human", weighting: 10, goals: [] },
    bestWeighting: 10,
    traits: [],
    ...overrides,
  };
}

// --- Old-versus-new decision equivalence ------------------------------------
const cases = [
  makeInput(),
  makeInput({
    speciesRace: { name: "Human", weighting: 0, goals: [] },
    bestWeighting: 50,
  }),
  makeInput({
    speciesRace: { name: "Human", weighting: 0, goals: [] },
    bestWeighting: 0,
  }),
  makeInput({
    speciesRace: {
      name: "Elven",
      weighting: 10,
      goals: ["achieve_a", "feat_b"],
    },
  }),
  makeInput({
    userEvolutionTarget: "elven",
    targetHabitability: 1,
    speciesRace: { name: "Human", weighting: 0, goals: [] },
  }),
  makeInput({ userEvolutionTarget: "elven", targetHabitability: 0 }),
  makeInput({ userEvolutionTarget: "human" }), // explicit target equals species
  makeInput({
    species: "sludge",
    speciesRace: { name: "Sludge", weighting: 0, goals: [] },
    bestWeighting: 0,
  }),
  makeInput({
    autoMutateTraits: true,
    speciesRace: { name: "Human", weighting: 10, goals: ["achieve_a"] },
    traits: [
      {
        name: "cunning",
        resetEnabled: true,
        gained: false,
        inheritedFromBase: false,
      },
      {
        name: "gullible",
        resetEnabled: true,
        gained: true,
        inheritedFromBase: true,
      },
      {
        name: "hyper",
        resetEnabled: true,
        gained: true,
        inheritedFromBase: false,
      },
    ],
  }),
  makeInput({
    autoMutateTraits: true,
    speciesRace: { name: "Human", weighting: 10, goals: ["achieve_a"] },
    traits: [
      {
        name: "hyper",
        resetEnabled: false,
        gained: true,
        inheritedFromBase: false,
      },
    ],
  }),
  makeInput({
    autoEvolution: false,
    userEvolutionTarget: "elven",
    targetHabitability: 1,
  }),
  makeInput({
    evolutionBackup: false,
    speciesRace: { name: "Human", weighting: 0, goals: [] },
    bestWeighting: 50,
  }),
];
for (const input of cases) {
  assert.deepEqual(
    decideEvolutionResult(input),
    legacyDecideEvolutionResult(input),
    `decision mismatch: ${JSON.stringify(input)}`,
  );
}

// --- Characterized decision + presentation ----------------------------------
const backup = decideEvolutionResult(
  makeInput({
    speciesRace: { name: "Human", weighting: 0, goals: [] },
    bestWeighting: 50,
  }),
);
assert.equal(backup.needReset, true);
assert.deepEqual(
  backup.logs.map((e) => formatEvolutionLog(e, loc)),
  [
    {
      level: "danger",
      message:
        "Human have no unearned achievements for current prestige, soft resetting and trying again.",
      tags: ["progress", "achievements"],
    },
  ],
);

const noRace = decideEvolutionResult(
  makeInput({
    speciesRace: { name: "Human", weighting: 0, goals: [] },
    bestWeighting: 0,
  }),
);
assert.equal(noRace.needReset, false);
assert.deepEqual(
  noRace.logs.map((e) => formatEvolutionLog(e, loc)),
  [
    {
      level: "warning",
      message:
        "Can't pick a race with unearned achievements for current prestige. Continuing with Human.",
      tags: ["progress", "achievements"],
    },
    {
      level: "info",
      message: "Auto Achievement can't pick a goal for this run.",
      tags: ["progress", "achievements"],
    },
  ],
);

const goals = decideEvolutionResult(
  makeInput({
    speciesRace: {
      name: "Elven",
      weighting: 10,
      goals: ["achieve_a", "feat_b"],
    },
  }),
);
assert.deepEqual(
  goals.logs.map((e) => formatEvolutionLog(e, loc)),
  [
    {
      level: "info",
      message: "Auto Achievement goes for: loc:achieve_a, loc:feat_b.",
      tags: ["progress", "achievements"],
    },
  ],
);

// A pending reset suppresses the goal info log.
const traitReset = decideEvolutionResult(
  makeInput({
    autoMutateTraits: true,
    speciesRace: { name: "Human", weighting: 10, goals: ["achieve_a"] },
    traits: [
      {
        name: "hyper",
        resetEnabled: true,
        gained: true,
        inheritedFromBase: false,
      },
    ],
  }),
);
assert.equal(traitReset.needReset, true);
assert.deepEqual(
  traitReset.logs.map((e) => formatEvolutionLog(e, loc)),
  [
    {
      level: "danger",
      message: "Gained hyper trait, soft resetting and trying again.",
      tags: ["progress"],
    },
  ],
);

// Wrong-race message.
assert.deepEqual(
  formatEvolutionLog({ level: "danger", code: "wrong-race" }, loc),
  {
    level: "danger",
    message: "Wrong race, soft resetting and trying again.",
    tags: ["progress"],
  },
);

// Intentional-only species skips the backup check entirely.
assert.equal(
  decideEvolutionResult(
    makeInput({
      species: "sludge",
      speciesRace: { name: "Sludge", weighting: 0, goals: [] },
      bestWeighting: 0,
    }),
  ).needReset,
  false,
);

console.log("Evolution result domain tests passed");
