import assert from "node:assert/strict";
import { createGameForeignControls } from "../src/adapters/browser/game-foreign-controls.ts";

let views = {};
const calls = [];
const controls = createGameForeignControls({
  getVueById: (elementId) => views[elementId],
});

// An absent panel is the pre-unlock state, not an error.
assert.equal(controls.isUnlocked(), false);
assert.equal(controls.isSpyDisabled(2), false);
assert.equal(controls.trainSpy(2), false);
assert.deepEqual(calls, []);

// A mounted panel reports its own visibility.
views.foreign = {
  vis() {
    calls.push(["vis"]);
    return true;
  },
  spy_disabled(governmentId) {
    calls.push(["spy_disabled", governmentId]);
    return false;
  },
  spy(governmentId) {
    calls.push(["spy", governmentId]);
  },
};
assert.equal(controls.isUnlocked(), true);
assert.equal(controls.isSpyDisabled(2), false);
assert.equal(controls.trainSpy(2), true);
assert.deepEqual(calls, [["vis"], ["spy_disabled", 2], ["spy", 2]]);

// The disabled read reports the panel's own answer, with the component as the
// receiver, even when the panel hides.
views.foreign.spy_disabled = function spyDisabled(governmentId) {
  calls.push(["spy_disabled", governmentId, this === views["foreign"]]);
  return true;
};
assert.equal(controls.isSpyDisabled(1), true);
assert.deepEqual(calls[calls.length - 1], ["spy_disabled", 1, true]);

console.log("Game foreign controls tests passed");
