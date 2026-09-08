import assert from "node:assert/strict";
import { createGameProjectControls } from "../src/adapters/browser/game-project-controls.ts";

let views = {};
const purchases = [];
const controls = createGameProjectControls({
  getVueById: (elementId) => views[elementId],
});

const projectView = {
  build(projectId, steps) {
    purchases.push([this === projectView, projectId, steps]);
  },
};

const request = {
  elementId: "arpalhc",
  projectId: "lhc",
  steps: 4,
};

// An unmounted project reports the refusal instead of throwing, and so does a
// mounted one whose component is not offering the purchase.
assert.equal(controls.build(request), false);
views["arpalhc"] = { build: "not a function" };
assert.equal(controls.build(request), false);
assert.deepEqual(purchases, []);

// The purchase reaches the component with the project id and step count, and
// the component as the receiver.
views["arpalhc"] = projectView;
assert.equal(controls.build(request), true);
assert.deepEqual(purchases, [[true, "lhc", 4]]);

// A build that throws still propagates the game's failure.
views["arpamonument"] = {
  build() {
    throw new Error("game bug");
  },
};
assert.throws(
  () =>
    controls.build({
      elementId: "arpamonument",
      projectId: "monument",
      steps: 1,
    }),
  /game bug/,
);
assert.equal(controls.build(request), true);
assert.deepEqual(purchases.length, 2);

console.log("Game project controls adapter tests passed");
