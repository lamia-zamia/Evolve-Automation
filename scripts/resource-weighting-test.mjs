import assert from "node:assert/strict";

import { createResourceWeighting } from "../src/planning/resource-weighting.ts";

let state = {
  unlockedBuildings: [{ cost: { Iron: 10 }, weighting: 20 }],
};
const weighting = createResourceWeighting({ getState: () => state });
assert.equal(
  weighting.findRequiredResourceWeight({ id: "Iron", currentQuantity: 0 }),
  20,
);

state = {
  unlockedBuildings: [{ cost: { Iron: 100 }, weighting: 80 }],
};
assert.equal(
  weighting.findRequiredResourceWeight({ id: "Iron", currentQuantity: 50 }),
  80,
);
assert.equal(
  weighting.findRequiredResourceWeight({ id: "Iron", currentQuantity: 100 }),
  undefined,
);

console.log("Resource weighting module tests passed");
