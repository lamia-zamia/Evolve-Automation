import assert from "node:assert/strict";

import {
  calculateConsumeKeepRatio,
  planConsume,
} from "../src/domain/economy/resources/consume.ts";

assert.equal(
  calculateConsumeKeepRatio(
    -1,
    {
      storageRequired: 1,
      requestedQuantity: 0,
      maxQuantity: 100,
      isFood: false,
    },
    1,
    false,
  ),
  null,
);
assert.equal(
  calculateConsumeKeepRatio(
    0.1,
    {
      storageRequired: 10,
      requestedQuantity: 0,
      maxQuantity: 100,
      isFood: true,
    },
    1,
    false,
  ),
  0.25,
);
assert.deepEqual(
  planConsume({
    initialised: false,
    useful: false,
    maximum: 0,
    storageShift: 0,
    hungryRace: false,
    ratios: [],
    resources: [],
    current: [],
  }),
  { adjustments: [] },
);

console.log("Consume domain policy tests passed");
