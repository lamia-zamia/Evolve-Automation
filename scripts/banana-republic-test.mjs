import assert from "node:assert/strict";

import {
  BANANA_OBJECTIVE_IDS,
  isBananaObjectiveId,
  isBananaRepublicGuardActive,
  isBananaRepublicSmoothieComplete,
} from "../src/domain/civic/banana-republic.ts";

function makeProgress(overrides = {}) {
  return Object.freeze({
    objectives: Object.freeze(
      Object.fromEntries(
        BANANA_OBJECTIVE_IDS.map((objective) => [objective, true]),
      ),
    ),
    smoothie: Object.freeze({ featStar: 0, tradeRoutes: [-500, 250, 250] }),
    ...overrides,
  });
}

assert.equal(isBananaObjectiveId("b1"), true);
assert.equal(isBananaObjectiveId("b6"), false);
assert.equal(
  isBananaRepublicSmoothieComplete({ featStar: 0, tradeRoutes: [-499, 500] }),
  false,
);
assert.equal(
  isBananaRepublicGuardActive({
    enabled: false,
    bananaRace: true,
    progress: makeProgress({
      objectives: { ...makeProgress().objectives, b1: false },
    }),
  }),
  false,
);

console.log("Banana Republic domain tests passed");
