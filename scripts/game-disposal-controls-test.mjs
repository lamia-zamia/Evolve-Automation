import assert from "node:assert/strict";
import { createGameDisposalControls } from "../src/adapters/browser/game-disposal-controls.ts";

let views = {};
const steps = [];
const controls = createGameDisposalControls({
  getVueById: (elementId) => views[elementId],
  clickSteps: (count) => {
    steps.push(count);
    return Array.from({ length: Math.max(count, 0) }, (_, index) => index);
  },
});

function panel(calls) {
  return {
    supplyMore(...args) {
      calls.push(["supplyMore", args, this === views[this._id]]);
    },
    supplyLess(...args) {
      calls.push(["supplyLess", args, this === views[this._id]]);
    },
    ejectMore(...args) {
      calls.push(["ejectMore", args, this === views[this._id]]);
    },
    ejectLess(...args) {
      calls.push(["ejectLess", args, this === views[this._id]]);
    },
  };
}

// A panel the game has not rendered answers nothing, performs no calls, and
// never touches the click-multiplier keys.
assert.equal(controls.isRendered("supplyIron"), false);
const missing = { elementId: "supplyIron", id: "Iron", count: 2 };
assert.equal(controls.increaseSupply(missing), false);
assert.equal(controls.decreaseSupply(missing), false);
assert.equal(
  controls.increaseEject({ elementId: "ejectIron", id: "Iron", count: 2 }),
  false,
);
assert.deepEqual(steps, []);

// A mounted component missing the panel's method is just as unusable, and the
// two panels stay distinct: a supply panel does not answer an eject.
const supplyOnly = [];
views["supplyIron"] = {
  _id: "supplyIron",
  supplyMore: panel(supplyOnly).supplyMore,
  supplyLess: panel(supplyOnly).supplyLess,
};
assert.equal(controls.isRendered("supplyIron"), true);
assert.equal(
  controls.increaseEject({ elementId: "supplyIron", id: "Iron", count: 1 }),
  false,
);
assert.deepEqual(steps, []);

// A step calls the panel's method once per click step, passing the resource id
// as the only argument, with the component as the receiver.
assert.equal(
  controls.increaseSupply({ elementId: "supplyIron", id: "Iron", count: 3 }),
  true,
);
assert.deepEqual(steps, [3]);
assert.deepEqual(supplyOnly, [
  ["supplyMore", ["Iron"], true],
  ["supplyMore", ["Iron"], true],
  ["supplyMore", ["Iron"], true],
]);

supplyOnly.length = 0;
steps.length = 0;
assert.equal(
  controls.decreaseSupply({ elementId: "supplyIron", id: "Iron", count: 1 }),
  true,
);
assert.deepEqual(supplyOnly, [["supplyLess", ["Iron"], true]]);

// The ejector answers its own pair, on its own element.
const ejectCalls = [];
views["ejectIron"] = { _id: "ejectIron", ...panel(ejectCalls) };
steps.length = 0;
assert.equal(
  controls.increaseEject({ elementId: "ejectIron", id: "Iron", count: 2 }),
  true,
);
assert.equal(
  controls.decreaseEject({ elementId: "ejectIron", id: "Iron", count: 1 }),
  true,
);
assert.deepEqual(steps, [2, 1]);
assert.deepEqual(ejectCalls, [
  ["ejectMore", ["Iron"], true],
  ["ejectMore", ["Iron"], true],
  ["ejectLess", ["Iron"], true],
]);

// A count of zero or less reports the panel actionable but moves nothing.
ejectCalls.length = 0;
steps.length = 0;
assert.equal(
  controls.increaseEject({ elementId: "ejectIron", id: "Iron", count: 0 }),
  true,
);
assert.equal(
  controls.decreaseEject({ elementId: "ejectIron", id: "Iron", count: -1 }),
  true,
);
assert.deepEqual(steps, [0, -1]);
assert.deepEqual(ejectCalls, []);

console.log("Game disposal controls adapter tests passed");
