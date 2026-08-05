import assert from "node:assert/strict";
import { createGameEspionageControls } from "../src/adapters/browser/game-espionage-controls.ts";

let views = {};
const calls = [];
const controls = createGameEspionageControls({
  getVueById: (elementId) => views[elementId],
});

// The modal exists only while it is open, so a closed one runs nothing.
assert.equal(controls.performEspionage("incite", 2), false);
assert.deepEqual(calls, []);

// An open modal that does not offer the operation is just as unusable.
views["espModal"] = {
  incite(...args) {
    calls.push(["incite", args, this === views["espModal"]]);
  },
};
assert.equal(controls.performEspionage("annex", 2), false);
assert.deepEqual(calls, []);

// The offered operation runs against the named power, with the component as
// the receiver.
assert.equal(controls.performEspionage("incite", 2), true);
assert.deepEqual(calls, [["incite", [2], true]]);

console.log("Game espionage controls tests passed");
