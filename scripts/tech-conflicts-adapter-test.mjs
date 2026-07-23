import assert from "node:assert/strict";

import { readTechConflictInput } from "../src/adapters/evolve/progression/research/tech-conflicts.ts";

function baseContext(overrides = {}) {
  const game = {
    global: { race: { species: "human", gods: "sharkin" } },
    alevel() {
      assert.equal(this, game);
      return 2;
    },
  };
  return {
    tech: { _vueBinding: "tech-anthropology", cost: {} },
    settings: {
      researchIgnore: [],
      prestigeType: "mad",
      prestigeWhiteholeSaveGems: false,
      prestigeVaxStrat: "strat1",
      prestigeDemonicBomb: false,
      foreignUnification: false,
      prestigeWhiteholeStabiliseMass: false,
      prestigeWhiteholeStabiliseCooldown: 0,
      userResearchTheology_1: "auto",
      userResearchTheology_2: "auto",
      fleetAlienGiftKnowledge: 1_000_000,
    },
    resources: {
      Soul_Gem: { currentQuantity: 100 },
      Knowledge: { maxQuantity: 500 },
    },
    state: { whiteholeLastStabilise: 0 },
    game,
    dependencies: {
      clock: { nowMs: () => 10_000 },
      guardActive: () => false,
      guardBananaRepublicActive: () => false,
      retirementChallengeAssistActive: () => false,
      retirementPreparationMissing: () => [],
      isAchievementUnlocked: (id, level) => id === "genocide" && level === 2,
      fanatAchievements: [
        { race: "human", god: "sharkin", achieve: "genocide" },
      ],
    },
    ...overrides,
  };
}

let context = baseContext();
const ready = readTechConflictInput(
  context.tech,
  context.settings,
  context.resources,
  context.state,
  context.game,
  context.dependencies,
);
assert.equal(ready.status, "ready");
assert.equal(ready.input.itemId, "tech-anthropology");
assert.equal(ready.input.stabilization.nowMs, 0);
assert.deepEqual(ready.input.fanaticismAchievements, [
  { race: "human", god: "sharkin", unlocked: true },
]);
assert.ok(Object.isFrozen(ready));
assert.ok(Object.isFrozen(ready.input));
assert.ok(Object.isFrozen(ready.input.settings));
assert.ok(Object.isFrozen(ready.input.guards));
assert.ok(Object.isFrozen(ready.input.fanaticismAchievements));

context = baseContext({
  tech: { _vueBinding: "tech-bad", cost: { Soul_Gem: NaN } },
});
assert.deepEqual(
  readTechConflictInput(
    context.tech,
    context.settings,
    context.resources,
    context.state,
    context.game,
    context.dependencies,
  ),
  { status: "unavailable", reason: "invalid-target", field: "cost.Soul_Gem" },
);

context = baseContext({ resources: { Soul_Gem: {}, Knowledge: {} } });
assert.deepEqual(
  readTechConflictInput(
    context.tech,
    context.settings,
    context.resources,
    context.state,
    context.game,
    context.dependencies,
  ),
  {
    status: "unavailable",
    reason: "invalid-resource",
    field: "Soul_Gem.currentQuantity",
  },
);

context = baseContext({
  tech: { _vueBinding: "tech-unification2", cost: {} },
  dependencies: {
    ...baseContext().dependencies,
    guardBananaRepublicActive: () => "yes",
  },
});
assert.deepEqual(
  readTechConflictInput(
    context.tech,
    context.settings,
    context.resources,
    context.state,
    context.game,
    context.dependencies,
  ),
  { status: "unavailable", reason: "invalid-external-result", field: "guard" },
);

context = baseContext({
  tech: { _vueBinding: "tech-stabilize_blackhole", cost: {} },
  dependencies: {
    ...baseContext().dependencies,
    clock: { nowMs: () => NaN },
  },
});
assert.deepEqual(
  readTechConflictInput(
    context.tech,
    context.settings,
    context.resources,
    context.state,
    context.game,
    context.dependencies,
  ),
  { status: "unavailable", reason: "invalid-clock" },
);

context = baseContext();
const hostile = new Proxy(context.tech, {
  get() {
    throw new Error("hostile target getter");
  },
});
assert.deepEqual(
  readTechConflictInput(
    hostile,
    context.settings,
    context.resources,
    context.state,
    context.game,
    context.dependencies,
  ),
  { status: "unavailable", reason: "inaccessible-data" },
);

console.log("Tech conflict Evolve adapter contract tests passed");
