import assert from "node:assert/strict";
import { createGameIndustryControls } from "../src/adapters/browser/game-industry-controls.ts";

let views = {};
const requestedViews = [];
const requestedSteps = [];
let stepsPerRequest = 1;
const controls = createGameIndustryControls({
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
  clickSteps: (count) => {
    requestedSteps.push(count);
    return Array.from({ length: stepsPerRequest }, (_value, index) => index);
  },
});

// A panel the game has not rendered moves nothing, and the click multipliers are
// never touched for a request that cannot be performed.
assert.equal(controls.isRendered("iQuarry"), false);
assert.equal(controls.increase({ elementId: "iQuarry", count: 3 }), false);
assert.equal(controls.decrease({ elementId: "iQuarry", count: 3 }), false);
assert.deepEqual(requestedViews, ["iQuarry", "iQuarry", "iQuarry"]);
assert.deepEqual(requestedSteps, []);

// A lookup answering null rather than undefined is just as unrendered, and so is
// a mounted component that does not offer the method.
views["iQuarry"] = null;
assert.equal(controls.isRendered("iQuarry"), false);
assert.equal(controls.increase({ elementId: "iQuarry", count: 3 }), false);
views["iQuarry"] = { add: "not a function" };
assert.equal(controls.isRendered("iQuarry"), true);
assert.equal(controls.increase({ elementId: "iQuarry", count: 3 }), false);
assert.deepEqual(requestedSteps, []);

// Increasing calls the component's own `add` once per click step, with the
// component as the receiver and no argument for a single-production panel.
const calls = [];
views["iQuarry"] = {
  add(...args) {
    calls.push({ method: "add", args, receiver: this === views["iQuarry"] });
  },
  sub(...args) {
    calls.push({ method: "sub", args, receiver: this === views["iQuarry"] });
  },
};
requestedViews.length = 0;
stepsPerRequest = 3;
assert.equal(controls.increase({ elementId: "iQuarry", count: 40 }), true);
assert.deepEqual(requestedSteps, [40]);
assert.deepEqual(calls, [
  { method: "add", args: [], receiver: true },
  { method: "add", args: [], receiver: true },
  { method: "add", args: [], receiver: true },
]);

// Three clicks still cost one component lookup.
assert.deepEqual(requestedViews, ["iQuarry"]);

// Decreasing is the same control's `sub`.
calls.length = 0;
stepsPerRequest = 1;
assert.equal(controls.decrease({ elementId: "iQuarry", count: 1 }), true);
assert.deepEqual(calls, [{ method: "sub", args: [], receiver: true }]);

// The factory-style panels answer to addItem/subItem with the item id.
calls.length = 0;
views["iFactory"] = {
  addItem(...args) {
    calls.push({ method: "addItem", args });
  },
  subItem(...args) {
    calls.push({ method: "subItem", args });
  },
};
assert.equal(
  controls.increaseItem({ elementId: "iFactory", id: "Lux", count: 1 }),
  true,
);
assert.equal(
  controls.decreaseItem({ elementId: "iFactory", id: "Lux", count: 1 }),
  true,
);
assert.deepEqual(calls, [
  { method: "addItem", args: ["Lux"] },
  { method: "subItem", args: ["Lux"] },
]);

// The smelter's productions answer to addMetal/subMetal.
calls.length = 0;
views["iSmelter"] = {
  addMetal(...args) {
    calls.push({ method: "addMetal", args });
  },
  subMetal(...args) {
    calls.push({ method: "subMetal", args });
  },
};
assert.equal(
  controls.increaseMetal({ elementId: "iSmelter", id: "Steel", count: 1 }),
  true,
);
assert.equal(
  controls.decreaseMetal({ elementId: "iSmelter", id: "Steel", count: 1 }),
  true,
);
assert.deepEqual(calls, [
  { method: "addMetal", args: ["Steel"] },
  { method: "subMetal", args: ["Steel"] },
]);

// The smelter's fuels answer to addFuel/subFuel with the fuel id.
calls.length = 0;
views["iSmelter"] = {
  ...views["iSmelter"],
  addFuel(...args) {
    calls.push({ method: "addFuel", args });
  },
  subFuel(...args) {
    calls.push({ method: "subFuel", args });
  },
};
assert.equal(
  controls.increaseFuel({ elementId: "iSmelter", id: "Oil", count: 1 }),
  true,
);
assert.equal(
  controls.decreaseFuel({ elementId: "iSmelter", id: "Oil", count: 1 }),
  true,
);
assert.deepEqual(calls, [
  { method: "addFuel", args: ["Oil"] },
  { method: "subFuel", args: ["Oil"] },
]);

// The graphene plant names one method per fuel and takes no argument at all.
calls.length = 0;
requestedSteps.length = 0;
views["iGraphene"] = {
  addWood(...args) {
    calls.push({ method: "addWood", args });
  },
  subWood(...args) {
    calls.push({ method: "subWood", args });
  },
  addCoal(...args) {
    calls.push({ method: "addCoal", args });
  },
  subCoal(...args) {
    calls.push({ method: "subCoal", args });
  },
};
stepsPerRequest = 2;
assert.equal(
  controls.increaseFuel({ elementId: "iGraphene", id: "Lumber", count: 5 }),
  true,
);
assert.deepEqual(calls, [
  { method: "addWood", args: [] },
  { method: "addWood", args: [] },
]);
assert.deepEqual(requestedSteps, [5]);
stepsPerRequest = 1;
assert.equal(
  controls.decreaseFuel({ elementId: "iGraphene", id: "Coal", count: 1 }),
  true,
);
assert.deepEqual(calls.slice(2), [{ method: "subCoal", args: [] }]);

// A graphene fuel without a recorded method pair refuses without clicking.
requestedSteps.length = 0;
assert.equal(
  controls.increaseFuel({ elementId: "iGraphene", id: "Deuterium", count: 1 }),
  false,
);
assert.deepEqual(requestedSteps, []);
// So does a fuel request with no fuel id.
assert.equal(
  controls.increaseFuel({ elementId: "iGraphene", count: 1 }),
  false,
);
assert.deepEqual(requestedSteps, []);

// The galaxy trade routes answer to more/less with the production name.
calls.length = 0;
views["galaxyTrade"] = {
  more(...args) {
    calls.push({ method: "more", args });
  },
  less(...args) {
    calls.push({ method: "less", args });
  },
};
assert.equal(
  controls.increaseTrade({ elementId: "galaxyTrade", id: "Helium", count: 1 }),
  true,
);
assert.equal(
  controls.decreaseTrade({ elementId: "galaxyTrade", id: "Helium", count: 1 }),
  true,
);
assert.deepEqual(calls, [
  { method: "more", args: ["Helium"] },
  { method: "less", args: ["Helium"] },
]);

// select only sets the value when the view accepts it.
calls.length = 0;
views["iReplicator"] = {
  avail: (id) => id !== "locked",
  setVal(id) {
    calls.push({ method: "setVal", args: [id] });
  },
};
assert.equal(controls.select({ elementId: "iReplicator", id: "Iron" }), true);
assert.deepEqual(calls, [{ method: "setVal", args: ["Iron"] }]);
calls.length = 0;
assert.equal(
  controls.select({ elementId: "iReplicator", id: "locked" }),
  false,
);
assert.deepEqual(calls, []);
// An unrendered panel refuses the selection.
assert.equal(controls.select({ elementId: "iGone", id: "Iron" }), false);

// The panels that weigh several productions from one element take the id as the
// argument through the weighting pair too.
calls.length = 0;
views["iMiningShip"] = {
  add(...args) {
    calls.push({ method: "add", args });
  },
  sub(...args) {
    calls.push({ method: "sub", args });
  },
};
assert.equal(
  controls.increase({ elementId: "iMiningShip", count: 1, id: "common" }),
  true,
);
assert.equal(
  controls.decrease({ elementId: "iMiningShip", count: 1, id: "common" }),
  true,
);
assert.deepEqual(calls, [
  { method: "add", args: ["common"] },
  { method: "sub", args: ["common"] },
]);

// A count the click sequence resolves to no steps is accepted by an actionable
// control and moves nothing.
calls.length = 0;
requestedSteps.length = 0;
stepsPerRequest = 0;
assert.equal(controls.increase({ elementId: "iQuarry", count: 0 }), true);
assert.deepEqual(requestedSteps, [0]);
assert.deepEqual(calls, []);
stepsPerRequest = 1;

// A throwing component propagates rather than reporting a move that did not
// happen.
views["iTMine"] = {
  add() {
    throw new Error("industry panel exploded");
  },
};
assert.throws(
  () => controls.increase({ elementId: "iTMine", count: 1 }),
  /industry panel exploded/,
);

console.log("Game industry controls adapter tests passed");
