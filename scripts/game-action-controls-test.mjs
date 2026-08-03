import assert from "node:assert/strict";
import { createGameActionControls } from "../src/adapters/browser/game-action-controls.ts";

let views = {};
const requestedViews = [];
const requestedSteps = [];
let stepsPerRequest = 1;

let tooltip = null;
const tooltipRenames = [];

function makeTooltip({ owner, visible = true }) {
  return {
    length: 1,
    is: (selector) => selector === ":visible" && visible,
    data: (key) => (key === "id" ? owner : undefined),
    attr: (name, value) => tooltipRenames.push([name, value]),
  };
}

const noTooltip = {
  length: 0,
  is: () => false,
  data: () => undefined,
  attr: (name, value) => tooltipRenames.push([name, value]),
};

const controls = createGameActionControls({
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
  selectTooltip: () => tooltip ?? noTooltip,
  clickSteps: (count) => {
    requestedSteps.push(count);
    return Array.from({ length: stepsPerRequest }, (_value, index) => index);
  },
});

// A control the game has not rendered is not offered, does nothing, and never
// touches the click multipliers.
assert.equal(controls.isRendered("city-mine"), false);
assert.equal(controls.activate("city-mine"), false);
assert.equal(controls.powerOn({ elementId: "city-mine", count: 2 }), false);
assert.equal(controls.powerOff({ elementId: "city-mine", count: 2 }), false);
assert.deepEqual(requestedSteps, []);
assert.deepEqual(requestedViews, [
  "city-mine",
  "city-mine",
  "city-mine",
  "city-mine",
]);

// A lookup answering null rather than undefined is just as unrendered, and so is
// a component that does not offer the method the request needs.
views["city-mine"] = null;
assert.equal(controls.isRendered("city-mine"), false);
assert.equal(controls.activate("city-mine"), false);
views["city-mine"] = { action: "not a function" };
assert.equal(controls.isRendered("city-mine"), true);
assert.equal(controls.activate("city-mine"), false);
assert.equal(controls.powerOn({ elementId: "city-mine", count: 2 }), false);
assert.deepEqual(requestedSteps, []);

// Activating calls the component's own `action` once, with the component as the
// receiver and no argument.
const calls = [];
views["city-mine"] = {
  action(...args) {
    calls.push({
      method: "action",
      args,
      receiver: this === views["city-mine"],
    });
  },
  power_on(...args) {
    calls.push({
      method: "power_on",
      args,
      receiver: this === views["city-mine"],
    });
  },
  power_off(...args) {
    calls.push({ method: "power_off", args });
  },
};
assert.equal(controls.activate("city-mine"), true);
assert.deepEqual(calls, [{ method: "action", args: [], receiver: true }]);
assert.deepEqual(tooltipRenames, []);

// Switching power runs one component call per click step, and costs exactly one
// component lookup however many steps that is.
calls.length = 0;
requestedViews.length = 0;
stepsPerRequest = 3;
assert.equal(controls.powerOn({ elementId: "city-mine", count: 7 }), true);
assert.deepEqual(requestedSteps, [7]);
assert.deepEqual(requestedViews, ["city-mine"]);
assert.equal(calls.length, 3);
assert.deepEqual(calls[0], { method: "power_on", args: [], receiver: true });

// The count reaches the pacing untouched, and a count that resolves to no steps
// is still an accepted request rather than a refusal.
calls.length = 0;
requestedSteps.length = 0;
stepsPerRequest = 0;
assert.equal(controls.powerOff({ elementId: "city-mine", count: 4 }), true);
assert.deepEqual(requestedSteps, [4]);
assert.deepEqual(calls, []);
stepsPerRequest = 1;

// A tooltip belonging to another control would be rewritten by the action, so it
// is parked under another name and named back afterwards.
calls.length = 0;
tooltip = makeTooltip({ owner: "city-farm" });
assert.equal(controls.activate("city-mine"), true);
assert.deepEqual(tooltipRenames, [
  ["id", "TotallyNotAPopper"],
  ["id", "popper"],
]);
assert.equal(calls.length, 1);

// A tooltip that belongs to this control is left alone.
tooltipRenames.length = 0;
tooltip = makeTooltip({ owner: "popper-city-mine" });
assert.equal(controls.activate("city-mine"), true);
assert.deepEqual(tooltipRenames, []);

// A tooltip element without an owner is treated as another control's rather than
// throwing on the missing id.
tooltip = makeTooltip({ owner: undefined });
assert.equal(controls.activate("city-mine"), true);
assert.deepEqual(tooltipRenames, [
  ["id", "TotallyNotAPopper"],
  ["id", "popper"],
]);

// A throwing action still names the tooltip back, or a tooltip would stay stuck
// on the page under the parked name.
tooltipRenames.length = 0;
views["city-mine"] = {
  action() {
    throw new Error("game bug");
  },
};
tooltip = makeTooltip({ owner: "city-farm" });
assert.throws(() => controls.activate("city-mine"), /game bug/);
assert.deepEqual(tooltipRenames, [
  ["id", "TotallyNotAPopper"],
  ["id", "popper"],
]);

// A tooltip is shown only when the page holds one and it is visible.
tooltip = null;
assert.equal(controls.isTooltipShown(), false);
tooltip = makeTooltip({ owner: "city-mine", visible: false });
assert.equal(controls.isTooltipShown(), false);
tooltip = makeTooltip({ owner: "city-mine", visible: true });
assert.equal(controls.isTooltipShown(), true);
tooltip = null;

// A control that only exists while its modal is open is captured while rendered.
assert.equal(controls.isCaptured("starDock-probes"), false);
assert.equal(controls.capture("starDock-probes"), false);
assert.equal(controls.isCaptured("starDock-probes"), false);

const probeCalls = [];
views["starDock-probes"] = {
  action() {
    probeCalls.push("action");
  },
};
assert.equal(controls.capture("starDock-probes"), true);
assert.equal(controls.isCaptured("starDock-probes"), true);

// The captured control keeps working once the modal has unmounted its element,
// and answering it costs no lookup at all.
delete views["starDock-probes"];
requestedViews.length = 0;
assert.equal(controls.activate("starDock-probes"), true);
assert.deepEqual(probeCalls, ["action"]);
assert.deepEqual(requestedViews, []);

// Capture is per element, and a rendered element is still asked for directly.
assert.equal(controls.isCaptured("city-mine"), false);
// `isRendered` reports what the page shows now, not what was captured earlier.
assert.equal(controls.isRendered("starDock-probes"), false);

console.log("game-action-controls-test passed");
