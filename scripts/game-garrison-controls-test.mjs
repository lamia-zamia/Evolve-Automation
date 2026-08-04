import assert from "node:assert/strict";
import { createGameGarrisonControls } from "../src/adapters/browser/game-garrison-controls.ts";

let views = {};
let game;
const requestedViews = [];
const requestedSteps = [];
const clearCalls = [];
let stepsPerRequest = 1;
const controls = createGameGarrisonControls({
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
  clickSteps: (count) => {
    requestedSteps.push(count);
    return Array.from({ length: stepsPerRequest }, (_value, index) => index);
  },
  getGame: () => game,
  clearClickMultipliers: () => clearCalls.push(true),
  callVueMethod: (view, methodName, args, legacyFilterName = methodName) => {
    const method = view[methodName];
    if (typeof method === "function") {
      return Reflect.apply(method, view, args);
    }
    const filter = view.$options?.filters?.[legacyFilterName];
    if (typeof filter === "function") {
      return Reflect.apply(filter, view, args);
    }
    throw new TypeError(`${methodName} must be a function`);
  },
});

game = {
  global: {
    civic: {
      garrison: { tactic: 2 },
    },
  },
};

// Panels the game has not rendered answer nothing, and the click multipliers
// and tactic reads are never touched for a request that cannot be performed.
assert.equal(controls.isRendered("garrison"), false);
assert.equal(
  controls.launchCampaign({ elementId: "garrison", govIndex: 0 }),
  false,
);
assert.equal(controls.hire("garrison"), false);
assert.equal(controls.setTactic({ elementId: "garrison", tactic: 1 }), false);
assert.equal(
  controls.campaignTitle({ elementId: "garrison", tactic: 1 }),
  null,
);
assert.equal(
  controls.addBattalions({ elementId: "garrison", count: 3 }),
  false,
);
assert.equal(
  controls.removeBattalions({ elementId: "garrison", count: 3 }),
  false,
);
assert.equal(controls.addHellSoldiers({ elementId: "fort", count: 3 }), false);
assert.equal(
  controls.removeHellSoldiers({ elementId: "fort", count: 3 }),
  false,
);
assert.equal(controls.addHellPatrols({ elementId: "fort", count: 3 }), false);
assert.equal(
  controls.removeHellPatrols({ elementId: "fort", count: 3 }),
  false,
);
assert.equal(
  controls.addHellPatrolSize({ elementId: "fort", count: 3 }),
  false,
);
assert.equal(
  controls.removeHellPatrolSize({ elementId: "fort", count: 3 }),
  false,
);
assert.equal(
  controls.attackFortress({ elementId: "fort", enemyIndex: 0 }),
  false,
);
assert.deepEqual(requestedSteps, []);
assert.deepEqual(clearCalls, []);

// A mounted component that does not offer the method is just as unusable.
views["garrison"] = { campaign: "not a function" };
assert.equal(controls.isRendered("garrison"), true);
assert.equal(
  controls.launchCampaign({ elementId: "garrison", govIndex: 0 }),
  false,
);
assert.equal(controls.hire("garrison"), false);
assert.equal(controls.setTactic({ elementId: "garrison", tactic: 1 }), false);
assert.deepEqual(clearCalls, []);
views["garrison"] = undefined;

// Launches and fortress attacks perform their single component call.
const garrison = {
  campaign(...args) {
    calls.push({ method: "campaign", args, receiver: this === garrison });
  },
  hire() {
    calls.push({ method: "hire", receiver: this === garrison });
  },
  next() {
    calls.push({ method: "next", receiver: this === garrison });
  },
  last() {
    calls.push({ method: "last", receiver: this === garrison });
  },
  aNext() {
    calls.push({ method: "aNext", receiver: this === garrison });
  },
  aLast() {
    calls.push({ method: "aLast", receiver: this === garrison });
  },
  $options: {
    filters: {
      tactics: (value) => `tactic-${value}`,
    },
  },
};
const fort = {
  aNext() {
    calls.push({ method: "fortNext", receiver: this === fort });
  },
  aLast() {
    calls.push({ method: "fortLast", receiver: this === fort });
  },
  patInc() {
    calls.push({ method: "patInc", receiver: this === fort });
  },
  patDec() {
    calls.push({ method: "patDec", receiver: this === fort });
  },
  patSizeInc() {
    calls.push({ method: "patSizeInc", receiver: this === fort });
  },
  patSizeDec() {
    calls.push({ method: "patSizeDec", receiver: this === fort });
  },
  attack(...args) {
    calls.push({ method: "attack", args, receiver: this === fort });
  },
};
const calls = [];
views["garrison"] = garrison;
views["fort"] = fort;

assert.equal(
  controls.launchCampaign({ elementId: "garrison", govIndex: 3 }),
  true,
);
assert.deepEqual(calls, [{ method: "campaign", args: [3], receiver: true }]);
calls.length = 0;

// Hiring clears the click multipliers before the hire call.
assert.equal(controls.hire("garrison"), true);
assert.deepEqual(calls, [{ method: "hire", receiver: true }]);
assert.deepEqual(clearCalls, [true]);
clearCalls.length = 0;
calls.length = 0;

// The campaign title read falls back to the tactics filter name.
assert.equal(
  controls.campaignTitle({ elementId: "garrison", tactic: 2 }),
  "tactic-2",
);
requestedViews.length = 0;

// Tactic navigation moves from the live garrison tactic to the target: up via
// next, down via last, and no call when already there.
game.global.civic.garrison.tactic = 2;
assert.equal(controls.setTactic({ elementId: "garrison", tactic: 5 }), true);
assert.deepEqual(calls, [
  { method: "next", receiver: true },
  { method: "next", receiver: true },
  { method: "next", receiver: true },
]);
calls.length = 0;
assert.equal(controls.setTactic({ elementId: "garrison", tactic: 1 }), true);
assert.deepEqual(calls, [{ method: "last", receiver: true }]);
calls.length = 0;
assert.equal(controls.setTactic({ elementId: "garrison", tactic: 2 }), true);
assert.deepEqual(calls, []);

// An unreadable garrison tactic leaves the panel untouched.
game.global.civic.garrison.tactic = undefined;
assert.equal(controls.setTactic({ elementId: "garrison", tactic: 3 }), false);
assert.deepEqual(calls, []);
game.global.civic.garrison.tactic = 2;

// Each step family paces one component call per click step with the component
// receiver.
stepsPerRequest = 3;
calls.length = 0;
requestedSteps.length = 0;
requestedViews.length = 0;
assert.equal(
  controls.addBattalions({ elementId: "garrison", count: 30 }),
  true,
);
assert.deepEqual(requestedSteps, [30]);
assert.deepEqual(calls, [
  { method: "aNext", receiver: true },
  { method: "aNext", receiver: true },
  { method: "aNext", receiver: true },
]);
// Three clicks still cost one component lookup.
assert.deepEqual(requestedViews, ["garrison"]);
stepsPerRequest = 1;
calls.length = 0;
assert.equal(
  controls.removeBattalions({ elementId: "garrison", count: 1 }),
  true,
);
assert.deepEqual(calls, [{ method: "aLast", receiver: true }]);

calls.length = 0;
stepsPerRequest = 2;
assert.equal(controls.addHellSoldiers({ elementId: "fort", count: 2 }), true);
assert.deepEqual(calls, [
  { method: "fortNext", receiver: true },
  { method: "fortNext", receiver: true },
]);
stepsPerRequest = 1;
calls.length = 0;
assert.equal(
  controls.removeHellSoldiers({ elementId: "fort", count: 1 }),
  true,
);
assert.deepEqual(calls, [{ method: "fortLast", receiver: true }]);
calls.length = 0;
assert.equal(controls.addHellPatrols({ elementId: "fort", count: 1 }), true);
assert.deepEqual(calls, [{ method: "patInc", receiver: true }]);
calls.length = 0;
assert.equal(controls.removeHellPatrols({ elementId: "fort", count: 1 }), true);
assert.deepEqual(calls, [{ method: "patDec", receiver: true }]);
calls.length = 0;
assert.equal(controls.addHellPatrolSize({ elementId: "fort", count: 1 }), true);
assert.deepEqual(calls, [{ method: "patSizeInc", receiver: true }]);
calls.length = 0;
assert.equal(
  controls.removeHellPatrolSize({ elementId: "fort", count: 1 }),
  true,
);
assert.deepEqual(calls, [{ method: "patSizeDec", receiver: true }]);

// A count the click sequence resolves to no steps is accepted by an actionable
// control and moves nothing.
calls.length = 0;
stepsPerRequest = 0;
assert.equal(controls.addBattalions({ elementId: "garrison", count: 0 }), true);
assert.deepEqual(calls, []);
stepsPerRequest = 1;

// Attacking an enemy fortress calls the fortress component with the index.
calls.length = 0;
assert.equal(
  controls.attackFortress({ elementId: "fort", enemyIndex: 2 }),
  true,
);
assert.deepEqual(calls, [{ method: "attack", args: [2], receiver: true }]);

// A throwing component propagates rather than reporting movement that did not
// happen, and a hire refuses without clearing the multipliers when its control
// is absent.
views["garrison"] = {
  aNext() {
    throw new Error("garrison exploded");
  },
};
assert.throws(
  () => controls.addBattalions({ elementId: "garrison", count: 1 }),
  /garrison exploded/,
);
views["garrison"] = undefined;
clearCalls.length = 0;
assert.equal(controls.hire("garrison"), false);
assert.deepEqual(clearCalls, []);

console.log("Game garrison controls adapter tests passed");
