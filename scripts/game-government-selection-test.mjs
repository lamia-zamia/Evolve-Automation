import assert from "node:assert/strict";
import { createGameGovernmentSelection } from "../src/adapters/browser/game-government-selection.ts";

let views = {};
const calls = [];
const selection = createGameGovernmentSelection({
  getVueById: (elementId) => views[elementId],
});

// The modal exists only while it is open, so a closed one commits nothing.
assert.equal(selection.selectGovernment("oligarchy"), false);
assert.deepEqual(calls, []);

// A mounted modal missing the command is just as unusable.
views["govModal"] = {};
assert.equal(selection.selectGovernment("oligarchy"), false);
assert.deepEqual(calls, []);

// The open modal takes the government, with the component as the receiver.
views["govModal"] = {
  setGov(...args) {
    calls.push([args, this === views["govModal"]]);
  },
};
assert.equal(selection.selectGovernment("oligarchy"), true);
assert.deepEqual(calls, [[["oligarchy"], true]]);

console.log("Game government selection tests passed");
