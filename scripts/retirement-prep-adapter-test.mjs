import assert from "node:assert/strict";

import {
  readRetirementAssistInput,
  readRetirementPreparationInput,
} from "../src/adapters/evolve/retirement-prep.ts";

const thresholds = Object.freeze({
  fusionGenerators: 20,
  factories: 18,
  scienceLabs: 11,
  graphene: 200_000_000,
});

function makeSettings(overrides = {}) {
  return {
    retirementChallengeAssist: true,
    prestigeType: "retire",
    ...overrides,
  };
}

function makeGame(race = {}) {
  return { global: { race: { truepath: 1, ...race } } };
}

function makeBuildings(overrides = {}) {
  return {
    TauFusionGenerator: { name: "Fusion Generator", count: 20 },
    TauFactory: { name: "Factory", count: 18 },
    TauDiseaseLab: { name: "Disease Lab", count: 11 },
    ...overrides,
  };
}

function makeResources(graphene = {}) {
  return {
    Graphene: {
      name: "Graphene",
      currentQuantity: 200_000_000,
      maxQuantity: 250_000_000,
      ...graphene,
    },
  };
}

// --- readRetirementAssistInput ----------------------------------------------
{
  const result = readRetirementAssistInput(makeSettings(), makeGame(), false);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.input, {
    assistEnabled: true,
    truepath: true,
    retirePrestige: true,
    isolationResearched: false,
  });
  assert.throws(() => {
    result.input.assistEnabled = false;
  }, "assist input must be frozen");
}
// Non-retirement configurations map to false, not unavailable.
assert.equal(
  readRetirementAssistInput(
    makeSettings({ prestigeType: "ascension" }),
    makeGame(),
    false,
  ).input.retirePrestige,
  false,
);
assert.equal(
  readRetirementAssistInput(
    makeSettings(),
    makeGame({ truepath: undefined }),
    false,
  ).input.truepath,
  false,
);
assert.equal(
  readRetirementAssistInput(
    makeSettings({ retirementChallengeAssist: undefined }),
    makeGame(),
    false,
  ).input.assistEnabled,
  false,
);
assert.equal(
  readRetirementAssistInput(makeSettings(), makeGame(), true).input
    .isolationResearched,
  true,
);
// Malformed inputs fail closed.
for (const [settings, game, field] of [
  [
    makeSettings({ retirementChallengeAssist: 1 }),
    makeGame(),
    "retirementChallengeAssist",
  ],
  [null, makeGame(), undefined],
  [makeSettings(), { global: {} }, "race"],
  [makeSettings(), {}, undefined],
]) {
  const result = readRetirementAssistInput(settings, game, false);
  assert.equal(
    result.status,
    "unavailable",
    `expected unavailable for ${field}`,
  );
  if (field !== undefined) assert.equal(result.field, field);
}

// --- readRetirementPreparationInput -----------------------------------------
{
  const result = readRetirementPreparationInput(
    makeBuildings(),
    makeResources(),
    thresholds,
  );
  assert.equal(result.status, "ready");
  assert.deepEqual(result.input.graphene, {
    name: "Graphene",
    currentQuantity: 200_000_000,
    maxQuantity: 250_000_000,
  });
  assert.equal(result.input.fusionGenerators.count, 20);
  assert.equal(result.input.thresholds.graphene, 200_000_000);
  assert.throws(() => {
    result.input.thresholds.graphene = 0;
  }, "preparation input must be frozen");
}
// Malformed inputs fail closed.
for (const [buildings, resources, thr, field] of [
  [
    makeBuildings(),
    makeResources(),
    { ...thresholds, graphene: Number.NaN },
    "graphene",
  ],
  [null, makeResources(), thresholds, undefined],
  [
    makeBuildings({ TauFactory: { name: "Factory" } }),
    makeResources(),
    thresholds,
    "TauFactory",
  ],
  [
    makeBuildings({ TauFusionGenerator: { name: "F", count: -1 } }),
    makeResources(),
    thresholds,
    "TauFusionGenerator",
  ],
  [makeBuildings(), {}, thresholds, "Graphene"],
  [
    makeBuildings(),
    makeResources({ maxQuantity: Number.NaN }),
    thresholds,
    "Graphene.maxQuantity",
  ],
  [makeBuildings(), makeResources({ name: 5 }), thresholds, "Graphene.name"],
]) {
  const result = readRetirementPreparationInput(buildings, resources, thr);
  assert.equal(
    result.status,
    "unavailable",
    `expected unavailable for ${field}`,
  );
  if (field !== undefined) assert.equal(result.field, field);
}

console.log("Retirement preparation adapter contract tests passed");
