import assert from "node:assert/strict";

import {
  BANANA_OBJECTIVE_IDS,
  isBananaObjectiveId,
  isBananaRepublicGuardActive,
  isBananaRepublicObjectiveComplete,
  isBananaRepublicReadyForUnification,
  isBananaRepublicSmoothieComplete,
} from "../src/domain/civic/banana-republic.ts";
import { legacyBananaRepublicTrace } from "./test-support/legacy-banana-republic.mjs";

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

for (const progress of [
  makeProgress(),
  makeProgress({ smoothie: { featStar: 0, tradeRoutes: [-500, 499] } }),
  makeProgress({ smoothie: { featStar: 1, tradeRoutes: [] } }),
  makeProgress({
    objectives: { ...makeProgress().objectives, b3: false },
  }),
]) {
  const modern = {
    objectives: Object.fromEntries(
      BANANA_OBJECTIVE_IDS.map((objective) => [
        objective,
        isBananaRepublicObjectiveComplete(progress, objective),
      ]),
    ),
    smoothie: isBananaRepublicSmoothieComplete(progress.smoothie),
    ready: isBananaRepublicReadyForUnification(progress),
    guarded: isBananaRepublicGuardActive({
      enabled: true,
      bananaRace: true,
      progress,
    }),
  };
  assert.deepEqual(modern, legacyBananaRepublicTrace(progress));
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
