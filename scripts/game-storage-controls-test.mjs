import assert from "node:assert/strict";
import { createGameStorageControls } from "../src/adapters/browser/game-storage-controls.ts";

let views = {};
const steps = [];
const calls = [];
const controls = createGameStorageControls({
  getVueById: (elementId) => views[elementId],
  clickSteps: (count) => {
    steps.push(count);
    return Array.from({ length: Math.max(count, 0) }, (_, index) => index);
  },
});

function reset() {
  steps.length = 0;
  calls.length = 0;
}

// ---------- the shared construction panel ----------

// Without the panel there is nothing to build, no capacity to state, and the
// click-multiplier keys are never touched.
assert.equal(controls.isConstructionRendered(), false);
assert.equal(controls.crateCapacity(), 0);
assert.equal(controls.containerCapacity(), 0);
assert.equal(controls.constructCrates(2), false);
assert.equal(controls.constructContainers(2), false);
assert.deepEqual(steps, []);

// A mounted component missing the method is just as unusable.
views["createHead"] = {};
assert.equal(controls.isConstructionRendered(), true);
assert.equal(controls.constructCrates(2), false);
assert.equal(controls.crateCapacity(), 0);
assert.deepEqual(steps, []);

// The capacity is the second number in the panel's sentence: the first is how
// many units one click builds.
let capacityReceiver;
views["createHead"] = {
  buildCrateDesc() {
    capacityReceiver = this;
    return "Construct 1 crate. Each crate stores 250 of a resource.";
  },
  buildContainerDesc: () =>
    "Construct 1 container. Each container stores 1000 of a resource.",
  crate(...args) {
    calls.push(["crate", args]);
  },
  container(...args) {
    calls.push(["container", args]);
  },
};
assert.equal(controls.crateCapacity(), 250);
assert.equal(capacityReceiver, views["createHead"]);
assert.equal(controls.containerCapacity(), 1000);

// A sentence that states no second number states no capacity.
views["createHead"].buildCrateDesc = () => "Construct a crate.";
assert.equal(controls.crateCapacity(), 0);
views["createHead"].buildCrateDesc = () => undefined;
assert.equal(controls.crateCapacity(), 0);

// Building calls the panel once per click step, with no argument.
reset();
assert.equal(controls.constructCrates(2), true);
assert.equal(controls.constructContainers(1), true);
assert.deepEqual(calls, [
  ["crate", []],
  ["crate", []],
  ["container", []],
]);
assert.deepEqual(steps, [2, 1]);

// A count of zero or less is the step sequence's business, so the port still
// asks it and simply performs no call.
reset();
assert.equal(controls.constructCrates(0), true);
assert.deepEqual(calls, []);
assert.deepEqual(steps, [0]);

// ---------- the per-resource stack rows ----------

function stackRow(elementId) {
  return {
    _id: elementId,
    addCrate(...args) {
      calls.push(["addCrate", args, this === views[this._id]]);
    },
    subCrate(...args) {
      calls.push(["subCrate", args, this === views[this._id]]);
    },
    addCon(...args) {
      calls.push(["addCon", args, this === views[this._id]]);
    },
    subCon(...args) {
      calls.push(["subCon", args, this === views[this._id]]);
    },
  };
}

// The game only mounts the rows of the storage tab on screen, so an unrendered
// row answers nothing rather than throwing.
reset();
const offscreen = { elementId: "stack-Iron", id: "Iron", count: 2 };
assert.equal(controls.isStackRendered("stack-Iron"), false);
assert.equal(controls.assignCrates(offscreen), false);
assert.equal(controls.unassignCrates(offscreen), false);
assert.equal(controls.assignContainers(offscreen), false);
assert.equal(controls.unassignContainers(offscreen), false);
assert.deepEqual(steps, []);
assert.deepEqual(calls, []);

// A row calls its method once per click step, passing the resource id as the
// only argument, with the component as the receiver.
views["stack-Iron"] = stackRow("stack-Iron");
views["stack-Copper"] = stackRow("stack-Copper");
reset();
assert.equal(controls.isStackRendered("stack-Iron"), true);
assert.equal(controls.assignCrates(offscreen), true);
assert.equal(controls.unassignCrates({ ...offscreen, count: 1 }), true);
assert.equal(controls.assignContainers({ ...offscreen, count: 1 }), true);
assert.equal(controls.unassignContainers({ ...offscreen, count: 1 }), true);
assert.deepEqual(calls, [
  ["addCrate", ["Iron"], true],
  ["addCrate", ["Iron"], true],
  ["subCrate", ["Iron"], true],
  ["addCon", ["Iron"], true],
  ["subCon", ["Iron"], true],
]);
assert.deepEqual(steps, [2, 1, 1, 1]);

// Rows stay distinct: one resource's row never answers another's.
reset();
assert.equal(
  controls.assignCrates({ elementId: "stack-Copper", id: "Copper", count: 1 }),
  true,
);
assert.deepEqual(calls, [["addCrate", ["Copper"], true]]);

console.log("Game storage controls tests passed");
