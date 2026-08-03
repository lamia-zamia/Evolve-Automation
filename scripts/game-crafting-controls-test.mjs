import assert from "node:assert/strict";
import { createGameCraftingControls } from "../src/adapters/browser/game-crafting-controls.ts";

let views = {};
const requestedViews = [];
const cleared = [];
const controls = createGameCraftingControls({
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
  clearClickMultipliers: () => cleared.push(requestedViews.length),
});

// A row the game has not rendered crafts nothing, and the click multipliers are
// never touched for a request that cannot be performed.
assert.equal(
  controls.craft({ elementId: "resIron", resourceId: "Iron", count: 5 }),
  false,
);
assert.deepEqual(requestedViews, ["resIron"]);
assert.deepEqual(cleared, []);

// A lookup answering null rather than undefined is just as unmounted, and so is
// a mounted component that does not offer the method.
views["resIron"] = null;
assert.equal(
  controls.craft({ elementId: "resIron", resourceId: "Iron", count: 5 }),
  false,
);
views["resIron"] = { craft: "not a function" };
assert.equal(
  controls.craft({ elementId: "resIron", resourceId: "Iron", count: 5 }),
  false,
);
assert.deepEqual(cleared, []);

// Crafting calls the component's own `craft` with the resource id and the
// requested amount, and with the component as the receiver.
const calls = [];
views["resIron"] = {
  craft(...args) {
    calls.push({
      args,
      receiver: this === views["resIron"],
      clearedFirst: cleared.length === 1,
    });
  },
};
requestedViews.length = 0;
assert.equal(
  controls.craft({ elementId: "resIron", resourceId: "Iron", count: 5 }),
  true,
);
assert.deepEqual(calls, [
  { args: ["Iron", 5], receiver: true, clearedFirst: true },
]);

// The count reaches the game literally, which is only true because the keys
// were released first: the game scales it by whichever it believes are held.
assert.deepEqual(cleared, [1]);
assert.deepEqual(requestedViews, ["resIron"]);

// The population row's element and resource ids differ from each other, so both
// travel with the request rather than being derived from one another.
calls.length = 0;
views["resHuman"] = {
  craft(...args) {
    calls.push({ args });
  },
};
assert.equal(
  controls.craft({ elementId: "resHuman", resourceId: "Species", count: 1 }),
  true,
);
assert.deepEqual(calls, [{ args: ["Species", 1] }]);

// A component whose `craft` throws does not swallow the failure.
views["resIron"] = {
  craft() {
    throw new Error("game bug");
  },
};
assert.throws(
  () => controls.craft({ elementId: "resIron", resourceId: "Iron", count: 1 }),
  /game bug/,
);

console.log("Game crafting controls adapter tests passed");
