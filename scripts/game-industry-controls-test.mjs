import assert from "node:assert/strict";
import { createGameIndustryControls } from "../src/adapters/browser/game-industry-controls.ts";

let views = {};
const requestedViews = [];
const requestedSteps = [];
let stepsPerRequest = 1;
const controls = createGameIndustryControls({
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
  clickSteps: (count) => {
    requestedSteps.push(count);
    return Array.from({ length: stepsPerRequest }, (_value, index) => index);
  },
});

// A panel the game has not rendered moves nothing, and the click multipliers are
// never touched for a request that cannot be performed.
assert.equal(controls.isRendered("iQuarry"), false);
assert.equal(controls.increase({ elementId: "iQuarry", count: 3 }), false);
assert.equal(controls.decrease({ elementId: "iQuarry", count: 3 }), false);
assert.deepEqual(requestedViews, ["iQuarry", "iQuarry", "iQuarry"]);
assert.deepEqual(requestedSteps, []);

// A lookup answering null rather than undefined is just as unrendered, and so is
// a mounted component that does not offer the method.
views["iQuarry"] = null;
assert.equal(controls.isRendered("iQuarry"), false);
assert.equal(controls.increase({ elementId: "iQuarry", count: 3 }), false);
views["iQuarry"] = { add: "not a function" };
assert.equal(controls.isRendered("iQuarry"), true);
assert.equal(controls.increase({ elementId: "iQuarry", count: 3 }), false);
assert.deepEqual(requestedSteps, []);

// Increasing calls the component's own `add` once per click step, with the
// component as the receiver and no argument for a single-production panel.
const calls = [];
views["iQuarry"] = {
  add(...args) {
    calls.push({ method: "add", args, receiver: this === views["iQuarry"] });
  },
  sub(...args) {
    calls.push({ method: "sub", args, receiver: this === views["iQuarry"] });
  },
};
requestedViews.length = 0;
stepsPerRequest = 3;
assert.equal(controls.increase({ elementId: "iQuarry", count: 40 }), true);
assert.deepEqual(requestedSteps, [40]);
assert.deepEqual(calls, [
  { method: "add", args: [], receiver: true },
  { method: "add", args: [], receiver: true },
  { method: "add", args: [], receiver: true },
]);

// Three clicks still cost one component lookup.
assert.deepEqual(requestedViews, ["iQuarry"]);

// Decreasing is the same control's `sub`.
calls.length = 0;
stepsPerRequest = 1;
assert.equal(controls.decrease({ elementId: "iQuarry", count: 1 }), true);
assert.deepEqual(calls, [{ method: "sub", args: [], receiver: true }]);

// The panels that weigh several productions from one element take the production
// id as the argument.
calls.length = 0;
views["iMiningShip"] = {
  add(...args) {
    calls.push({ method: "add", args });
  },
  sub(...args) {
    calls.push({ method: "sub", args });
  },
};
assert.equal(
  controls.increase({
    elementId: "iMiningShip",
    count: 1,
    productionId: "common",
  }),
  true,
);
assert.equal(
  controls.decrease({
    elementId: "iMiningShip",
    count: 1,
    productionId: "common",
  }),
  true,
);
assert.deepEqual(calls, [
  { method: "add", args: ["common"] },
  { method: "sub", args: ["common"] },
]);

// A count the click sequence resolves to no steps is accepted by an actionable
// control and moves nothing.
calls.length = 0;
requestedSteps.length = 0;
stepsPerRequest = 0;
assert.equal(controls.increase({ elementId: "iQuarry", count: 0 }), true);
assert.deepEqual(requestedSteps, [0]);
assert.deepEqual(calls, []);
stepsPerRequest = 1;

// A throwing component propagates rather than reporting a move that did not
// happen.
views["iTMine"] = {
  add() {
    throw new Error("industry panel exploded");
  },
};
assert.throws(
  () => controls.increase({ elementId: "iTMine", count: 1 }),
  /industry panel exploded/,
);

console.log("Game industry controls adapter tests passed");
