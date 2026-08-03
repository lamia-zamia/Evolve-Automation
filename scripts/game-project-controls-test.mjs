import assert from "node:assert/strict";
import { createGameProjectControls } from "../src/adapters/browser/game-project-controls.ts";

let views = {};
let mainView;
const purchases = [];
const observedTabLoads = [];
const controls = createGameProjectControls({
  getVueById: (elementId) => views[elementId],
  getMainVue: () => mainView,
});

const projectView = {
  build(projectId, steps) {
    purchases.push([this === projectView, projectId, steps]);
    observedTabLoads.push(mainView?.s?.tabLoad);
  },
};

const request = {
  elementId: "arpalhc",
  projectId: "lhc",
  steps: 4,
  skipTabRedraw: false,
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
mainView = { s: { tabLoad: true } };
assert.equal(controls.build(request), true);
assert.deepEqual(purchases, [[true, "lhc", 4]]);
assert.deepEqual(
  observedTabLoads,
  [true],
  "an ordinary build leaves the page alone",
);

// Suppressing the redraw turns the preference off for the call only, and puts
// back whatever it found rather than a hardcoded default.
assert.equal(controls.build({ ...request, skipTabRedraw: true }), true);
assert.deepEqual(observedTabLoads, [true, false]);
assert.equal(mainView.s.tabLoad, true);

mainView = { s: { tabLoad: false } };
assert.equal(controls.build({ ...request, skipTabRedraw: true }), true);
assert.deepEqual(observedTabLoads, [true, false, false]);
assert.equal(mainView.s.tabLoad, false);

// A build that throws still restores the preference.
views["arpamonument"] = {
  build() {
    observedTabLoads.push(mainView.s.tabLoad);
    throw new Error("game bug");
  },
};
mainView = { s: { tabLoad: true } };
assert.throws(
  () =>
    controls.build({
      elementId: "arpamonument",
      projectId: "monument",
      steps: 1,
      skipTabRedraw: true,
    }),
  /game bug/,
);
assert.equal(mainView.s.tabLoad, true);

// A page without a main view, or without its preference record, still buys the
// project — the suppression is an optimization, not a precondition.
mainView = undefined;
assert.equal(controls.build({ ...request, skipTabRedraw: true }), true);
assert.deepEqual(purchases.length, 4);
mainView = {};
assert.equal(controls.build({ ...request, skipTabRedraw: true }), true);
mainView = { s: "not a record" };
assert.equal(controls.build({ ...request, skipTabRedraw: true }), true);
assert.deepEqual(purchases.length, 6);

console.log("Game project controls adapter tests passed");
