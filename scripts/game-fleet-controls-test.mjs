import assert from "node:assert/strict";
import { createGameFleetControls } from "../src/adapters/browser/game-fleet-controls.ts";

let views = {};
let yard;
const requestedViews = [];
const requestedSteps = [];
const jqueryClicks = [];
const dispatchClicks = [];
let dispatchButtons = {};
let stepsPerRequest = 1;
const controls = createGameFleetControls({
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
  clickSteps: (count) => {
    requestedSteps.push(count);
    return Array.from({ length: stepsPerRequest }, (_value, index) => index);
  },
  getDocument: () => ({
    querySelector: (selector) =>
      dispatchButtons[selector] === true
        ? { click: () => dispatchClicks.push(selector) }
        : null,
  }),
  getJQuery: () => (selector) => ({
    eq: (index) => ({
      click: () => jqueryClicks.push([selector, index]),
    }),
  }),
});

// The component carries the game's own shipyard object, which is what a build
// appends to. `game.global` is a per-period clone and never sees the append.
yard = { sort: false, ships: [{ name: "A" }] };

// A panel the game has not rendered answers nothing, and the click multipliers
// and sort checkbox are never touched for a request that cannot be performed.
assert.equal(controls.isRendered("shipPlans"), false);
assert.equal(
  controls.isPartAvailable({
    elementId: "shipPlans",
    type: "class",
    part: "corvette",
    index: 0,
  }),
  false,
);
assert.equal(
  controls.setPart({ elementId: "shipPlans", type: "class", part: "corvette" }),
  false,
);
assert.equal(controls.hasShipPower("shipPlans"), false);
assert.deepEqual(controls.buildShip({ elementId: "shipPlans" }), {
  actionable: false,
  builtIndex: null,
});
assert.equal(
  controls.addShips({
    elementId: "fleet",
    region: "spc_red",
    ship: "corvette",
    count: 3,
  }),
  false,
);
assert.equal(
  controls.subShips({
    elementId: "fleet",
    region: "spc_red",
    ship: "corvette",
    count: 3,
  }),
  false,
);
assert.deepEqual(requestedSteps, []);
assert.deepEqual(jqueryClicks, []);

// A lookup answering null is just as unrendered, and so is a mounted component
// that does not offer the method.
views["shipPlans"] = null;
assert.equal(controls.isRendered("shipPlans"), false);
assert.equal(
  controls.setPart({ elementId: "shipPlans", type: "class", part: "corvette" }),
  false,
);
views["shipPlans"] = { setVal: "not a function" };
assert.equal(controls.isRendered("shipPlans"), true);
assert.equal(
  controls.setPart({ elementId: "shipPlans", type: "class", part: "corvette" }),
  false,
);
assert.deepEqual(requestedSteps, []);

// Part availability asks the component's own `avail` with the panel option
// index for the type, the part, and the component as receiver.
const shipPlans = {
  avail(...args) {
    calls.push({ method: "avail", args, receiver: this === shipPlans });
    return args[1] === 0;
  },
  setVal(...args) {
    calls.push({ method: "setVal", args, receiver: this === shipPlans });
  },
  powerText() {
    return "has-text-danger";
  },
  build() {
    calls.push({ method: "build" });
    if (buildAppends) {
      yard.ships?.push({ name: "New" });
    }
  },
  s: undefined,
};
// A build the game cannot pay for queues the order and appends nothing.
let buildAppends = true;
const calls = [];
views["shipPlans"] = shipPlans;
requestedViews.length = 0;
assert.equal(
  controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "railgun",
    index: 0,
  }),
  true,
);
assert.equal(
  controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "railgun",
    index: 1,
  }),
  false,
);
assert.deepEqual(calls, [
  { method: "avail", args: ["weapon", 0, "railgun"], receiver: true },
  { method: "avail", args: ["weapon", 1, "railgun"], receiver: true },
]);
// An availability check without the option index cannot be answered.
calls.length = 0;
assert.equal(
  controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "railgun",
  }),
  false,
);
assert.deepEqual(calls, []);

// Configuring a part selects it on the component in one call.
calls.length = 0;
assert.equal(
  controls.setPart({ elementId: "shipPlans", type: "class", part: "corvette" }),
  true,
);
assert.deepEqual(calls, [
  { method: "setVal", args: ["class", "corvette"], receiver: true },
]);

// A power read that shows the danger marker means the design cannot build.
assert.equal(controls.hasShipPower("shipPlans"), false);

// Building a ship with a sort-toggle toggles the checkbox around the build and
// reports the appended ship's index, which is the list's new last position.
shipPlans.s = yard;
yard.sort = true;
yard.ships = [{ name: "A" }, { name: "B" }];
shipPlans.powerText = () => "has-text-success";
calls.length = 0;
jqueryClicks.length = 0;
assert.deepEqual(controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: 2,
});
assert.deepEqual(calls, [{ method: "build" }]);
assert.deepEqual(jqueryClicks, [
  ["#shipPlans .b-checkbox", 1],
  ["#shipPlans .b-checkbox", 1],
]);

// A build the game only queues appends no ship, so there is no index to read
// past the end of the list with.
buildAppends = false;
yard.ships = [{ name: "A" }, { name: "B" }];
jqueryClicks.length = 0;
assert.deepEqual(controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: null,
});
assert.deepEqual(jqueryClicks, [
  ["#shipPlans .b-checkbox", 1],
  ["#shipPlans .b-checkbox", 1],
]);
buildAppends = true;

// A shipyard that sorts nothing needs no toggle.
yard.sort = false;
yard.ships = [{ name: "A" }, { name: "B" }];
jqueryClicks.length = 0;
assert.deepEqual(controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: 2,
});
assert.deepEqual(jqueryClicks, []);

// A shipyard list that has not rendered yet still allows the build click, and a
// component that carries no shipyard at all neither toggles nor reports a ship.
yard.ships = undefined;
yard.sort = true;
calls.length = 0;
jqueryClicks.length = 0;
assert.deepEqual(controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: null,
});
assert.deepEqual(calls, [{ method: "build" }]);
assert.deepEqual(jqueryClicks, [
  ["#shipPlans .b-checkbox", 1],
  ["#shipPlans .b-checkbox", 1],
]);
shipPlans.s = undefined;
calls.length = 0;
jqueryClicks.length = 0;
assert.deepEqual(controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: null,
});
assert.deepEqual(calls, [{ method: "build" }]);
assert.deepEqual(jqueryClicks, []);
shipPlans.s = yard;
yard.ships = [{ name: "A" }];
yard.sort = false;

// A dispatch names the ship row that opens the window, and sends the ship by
// clicking the destination the window classes with the region. A window that
// does not offer the region performs no click.
assert.equal(controls.dispatchTrigger(4), "#ship4loc");
dispatchButtons = { "#modalBox .shipDispatch button.spc_red": true };
dispatchClicks.length = 0;
assert.equal(controls.dispatchShip({ index: 4, region: "spc_red" }), true);
assert.deepEqual(dispatchClicks, ["#modalBox .shipDispatch button.spc_red"]);
dispatchClicks.length = 0;
assert.equal(controls.dispatchShip({ index: 4, region: "spc_titan" }), false);
assert.deepEqual(dispatchClicks, []);
dispatchButtons = {};

// A control without a build answer refuses without toggling the sort checkbox.
views["shipPlans"] = { setVal() {} };
jqueryClicks.length = 0;
assert.deepEqual(controls.buildShip({ elementId: "shipPlans" }), {
  actionable: false,
  builtIndex: null,
});
assert.deepEqual(jqueryClicks, []);

// The piracy armada moves one ship per click step with the component receiver.
views["shipPlans"] = shipPlans;
views["fleet"] = {
  add(...args) {
    calls.push({ method: "add", args, receiver: this === views["fleet"] });
  },
  sub(...args) {
    calls.push({ method: "sub", args, receiver: this === views["fleet"] });
  },
};
calls.length = 0;
requestedSteps.length = 0;
requestedViews.length = 0;
stepsPerRequest = 3;
assert.equal(
  controls.addShips({
    elementId: "fleet",
    region: "spc_titan",
    ship: "cruiser",
    count: 40,
  }),
  true,
);
assert.deepEqual(requestedSteps, [40]);
assert.deepEqual(calls, [
  { method: "add", args: ["spc_titan", "cruiser"], receiver: true },
  { method: "add", args: ["spc_titan", "cruiser"], receiver: true },
  { method: "add", args: ["spc_titan", "cruiser"], receiver: true },
]);
// Three clicks still cost one component lookup.
assert.deepEqual(requestedViews, ["fleet"]);
stepsPerRequest = 1;
calls.length = 0;
assert.equal(
  controls.subShips({
    elementId: "fleet",
    region: "spc_titan",
    ship: "cruiser",
    count: 1,
  }),
  true,
);
assert.deepEqual(calls, [
  { method: "sub", args: ["spc_titan", "cruiser"], receiver: true },
]);

// A count the click sequence resolves to no steps is accepted by an actionable
// control and moves nothing.
calls.length = 0;
stepsPerRequest = 0;
assert.equal(
  controls.addShips({
    elementId: "fleet",
    region: "spc_titan",
    ship: "cruiser",
    count: 0,
  }),
  true,
);
assert.deepEqual(calls, []);
stepsPerRequest = 1;

// A throwing component propagates rather than reporting movement that did not
// happen.
views["fleet"] = {
  add() {
    throw new Error("armada exploded");
  },
};
assert.throws(
  () =>
    controls.addShips({
      elementId: "fleet",
      region: "spc_titan",
      ship: "cruiser",
      count: 1,
    }),
  /armada exploded/,
);
views["shipPlans"] = {
  build() {
    throw new Error("shipyard exploded");
  },
};
assert.throws(
  () => controls.buildShip({ elementId: "shipPlans" }),
  /shipyard exploded/,
);

console.log("Game fleet controls adapter tests passed");
