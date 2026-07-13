import assert from "node:assert/strict";

import { createCostConflicts } from "../src/planning/cost-conflicts.ts";

let state = { conflictTargets: [] };
let resources = {
  Iron: { name: "Iron", currentQuantity: 100 },
  Knowledge: { name: "Knowledge", currentQuantity: 100 },
};
const conflicts = createCostConflicts({
  getState: () => state,
  getResources: () => resources,
  isEmptyObject: (object) => Object.keys(object).length === 0,
});

assert.equal(conflicts.getCostConflict({ cost: {} }), null);

state = {
  conflictTargets: [{ name: "Research", cost: { Iron: 80, Knowledge: 90 } }],
};
let conflict = conflicts.getCostConflict({
  cost: { Iron: 30, Knowledge: 20 },
});
assert.equal(conflict.res, resources.Knowledge);
assert.deepEqual(conflict.resList, ["Iron", "Knowledge"]);

resources = {
  Iron: { name: "Iron", currentQuantity: 200 },
  Knowledge: { name: "Knowledge", currentQuantity: 200 },
};
conflict = conflicts.getCostConflict({ cost: { Iron: 0, Knowledge: 0 } });
assert.equal(conflict, null);

console.log("Cost conflict module tests passed");
