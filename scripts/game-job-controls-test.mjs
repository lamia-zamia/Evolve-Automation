import assert from "node:assert/strict";
import { createGameJobControls } from "../src/adapters/browser/game-job-controls.ts";

let views = {};
const requestedViews = [];
const requestedSteps = [];
let stepsPerRequest = 1;
const controls = createGameJobControls({
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
  clickSteps: (count) => {
    requestedSteps.push(count);
    return Array.from({ length: stepsPerRequest }, (_value, index) => index);
  },
});

// A control the game has not rendered moves nobody, and the click multipliers
// are never touched for a request that cannot be performed.
assert.equal(controls.assign({ elementId: "civ-farmer", count: 3 }), false);
assert.equal(controls.unassign({ elementId: "civ-farmer", count: 3 }), false);
assert.equal(
  controls.setDefault({ elementId: "civ-farmer", jobId: "farmer" }),
  false,
);
assert.deepEqual(requestedViews, ["civ-farmer", "civ-farmer", "civ-farmer"]);
assert.deepEqual(requestedSteps, []);

// A lookup answering null rather than undefined is just as unmounted, and so is
// a mounted component that does not offer the method.
views["civ-farmer"] = null;
assert.equal(controls.assign({ elementId: "civ-farmer", count: 3 }), false);
views["civ-farmer"] = { add: "not a function" };
assert.equal(controls.assign({ elementId: "civ-farmer", count: 3 }), false);
assert.deepEqual(requestedSteps, []);

// Assigning calls the component's own `add` once per click step, with the
// component as the receiver and no argument for a plain worker control.
const calls = [];
views["civ-farmer"] = {
  add(...args) {
    calls.push({ method: "add", args, receiver: this === views["civ-farmer"] });
  },
  sub(...args) {
    calls.push({ method: "sub", args, receiver: this === views["civ-farmer"] });
  },
};
requestedViews.length = 0;
stepsPerRequest = 3;
assert.equal(controls.assign({ elementId: "civ-farmer", count: 40 }), true);
assert.deepEqual(requestedSteps, [40]);
assert.deepEqual(calls, [
  { method: "add", args: [], receiver: true },
  { method: "add", args: [], receiver: true },
  { method: "add", args: [], receiver: true },
]);

// Three clicks still cost one component lookup.
assert.deepEqual(requestedViews, ["civ-farmer"]);

// Unassigning is the same control's `sub`.
calls.length = 0;
stepsPerRequest = 1;
assert.equal(controls.unassign({ elementId: "civ-farmer", count: 1 }), true);
assert.deepEqual(calls, [{ method: "sub", args: [], receiver: true }]);

// The crafting and skilled-servant controls serve every crafted resource from
// one element, so the resource id travels as the argument.
calls.length = 0;
views["foundry"] = {
  add(...args) {
    calls.push({ method: "add", args });
  },
  sub(...args) {
    calls.push({ method: "sub", args });
  },
};
assert.equal(
  controls.assign({
    elementId: "foundry",
    count: 1,
    craftedResourceId: "Plywood",
  }),
  true,
);
assert.equal(
  controls.unassign({
    elementId: "foundry",
    count: 1,
    craftedResourceId: "Plywood",
  }),
  true,
);
assert.deepEqual(calls, [
  { method: "add", args: ["Plywood"] },
  { method: "sub", args: ["Plywood"] },
]);

// A count the click sequence resolves to no steps is accepted by an actionable
// control and moves nobody.
calls.length = 0;
requestedSteps.length = 0;
stepsPerRequest = 0;
assert.equal(controls.assign({ elementId: "civ-farmer", count: 0 }), true);
assert.deepEqual(requestedSteps, [0]);
assert.deepEqual(calls, []);
stepsPerRequest = 1;

// The default job is set through the worker control, with the job id as the
// argument.
const defaults = [];
views["civ-farmer"] = {
  setDefault(...args) {
    defaults.push({ args, receiver: this === views["civ-farmer"] });
  },
};
assert.equal(
  controls.setDefault({ elementId: "civ-farmer", jobId: "farmer" }),
  true,
);
assert.deepEqual(defaults, [{ args: ["farmer"], receiver: true }]);

// A control that offers no `setDefault` refuses instead of throwing.
views["civ-farmer"] = { setDefault: "not a function" };
assert.equal(
  controls.setDefault({ elementId: "civ-farmer", jobId: "farmer" }),
  false,
);

console.log("Game job controls adapter tests passed");
