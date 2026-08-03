import assert from "node:assert/strict";
import { createGameResearchControls } from "../src/adapters/browser/game-research-controls.ts";

let elements = {};
let views = {};
const queried = [];
const requestedViews = [];
const controls = createGameResearchControls({
  getDocument: () => ({
    querySelector: (selector) => {
      queried.push(selector);
      return elements[selector] ?? null;
    },
  }),
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
});

// An entry the game has not rendered is neither offered nor completed, and the
// component is never asked for once the buy control is missing.
assert.equal(controls.isOffered("tech-mad"), false);
assert.deepEqual(queried, ["#tech-mad > .button:not(.precog)"]);
assert.deepEqual(requestedViews, []);

// The precognition preview renders a `.button` too, so the selector excludes it.
queried.length = 0;
elements["#tech-mad > .button:not(.precog)"] = {};
views["tech-mad"] = {};
assert.equal(controls.isOffered("tech-mad"), true);
assert.deepEqual(queried, ["#tech-mad > .button:not(.precog)"]);
assert.deepEqual(requestedViews, ["tech-mad"]);

// A rendered control whose component is not mounted yet is not offered, and
// neither is one whose lookup answers null rather than undefined.
views["tech-mad"] = undefined;
assert.equal(controls.isOffered("tech-mad"), false);
views["tech-mad"] = null;
assert.equal(controls.isOffered("tech-mad"), false);
views["tech-mad"] = {};

// A document answering `undefined` counts as absent as well.
elements["#tech-mad > .button:not(.precog)"] = undefined;
assert.equal(controls.isOffered("tech-mad"), false);
elements["#tech-mad > .button:not(.precog)"] = {};

// The game leaves a researched entry mounted and marks it with `.oldTech`.
queried.length = 0;
assert.equal(controls.isCompleted("tech-mad"), false);
assert.deepEqual(queried, ["#tech-mad .oldTech"]);
elements["#tech-mad .oldTech"] = {};
assert.equal(controls.isCompleted("tech-mad"), true);

// Starting the research calls the component's own action, with the component
// as the receiver.
const actions = [];
views["tech-mad"] = {
  action() {
    actions.push(this === views["tech-mad"]);
  },
};
assert.equal(controls.start("tech-mad"), true);
assert.deepEqual(actions, [true]);

// A component that disappeared between the availability check and the click
// reports the refusal instead of throwing.
views["tech-mad"] = undefined;
assert.equal(controls.start("tech-mad"), false);
views["tech-mad"] = { action: "not a function" };
assert.equal(controls.start("tech-mad"), false);
assert.deepEqual(actions, [true]);

// The element id reaches both the selectors and the component lookup verbatim.
queried.length = 0;
requestedViews.length = 0;
elements["#tech-wheel > .button:not(.precog)"] = {};
views["tech-wheel"] = { action: () => {} };
assert.equal(controls.isOffered("tech-wheel"), true);
assert.equal(controls.start("tech-wheel"), true);
assert.deepEqual(queried, ["#tech-wheel > .button:not(.precog)"]);
assert.deepEqual(requestedViews, ["tech-wheel", "tech-wheel"]);

console.log("Game research controls adapter tests passed");
