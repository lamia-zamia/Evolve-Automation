import assert from "node:assert/strict";

import { createCapturedAchievementSource } from "../src/adapters/evolve/captured-achievement-state.ts";

function root(universe, overrides = {}) {
  return {
    race: { universe },
    stats: {
      achieve: {
        wheelbarrow: { l: 2, e: 4, mg: 5 },
        ...overrides.achieve,
      },
      banana: {
        b5: { l: false, e: true, mg: false },
        ...overrides.banana,
      },
    },
  };
}

function source(value) {
  return createCapturedAchievementSource({ readRoot: () => value });
}

assert.deepEqual(
  source(root("evil")).readAchievementState(["wheelbarrow"], ["b5"]),
  {
    stars: new Map([["wheelbarrow", 4]]),
    bananaObjectives: new Map([["b5", true]]),
  },
);
assert.equal(
  source(root("magic"))
    .readAchievementState(["wheelbarrow"], ["b5"])
    .stars.get("wheelbarrow"),
  5,
);
assert.deepEqual(
  source(root("standard")).readAchievementState(["missing"], []),
  { stars: new Map([["missing", 0]]), bananaObjectives: new Map() },
);
assert.equal(
  source(
    root("standard", { achieve: { wheelbarrow: { l: "bad" } } }),
  ).readAchievementState(["wheelbarrow"], []),
  undefined,
);
assert.equal(
  source(
    root("standard", { banana: { b5: { l: "yes" } } }),
  ).readAchievementState([], ["b5"]),
  undefined,
);
assert.equal(source(undefined).readAchievementState([], []), undefined);

console.log("captured achievement state ok");
