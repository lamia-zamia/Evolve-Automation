import assert from "node:assert/strict";
import { createGameMechControls } from "../src/adapters/browser/game-mech-controls.ts";

let views = {};
const requestedViews = [];
const controls = createGameMechControls({
  getVueById: (elementId) => {
    requestedViews.push(elementId);
    return views[elementId];
  },
});

// A panel the game has not rendered answers nothing and performs no calls.
assert.equal(controls.isRendered("mechAssembly"), false);
assert.equal(
  controls.assembleMech({
    elementId: "mechAssembly",
    size: "small",
    chassis: "wheel",
    hardpoints: ["laser"],
    equips: [],
    infernal: false,
  }),
  false,
);
assert.deepEqual(requestedViews, ["mechAssembly", "mechAssembly"]);

// A mounted component missing any assembly method is just as unusable.
views["mechAssembly"] = {
  b: { infernal: false },
  setSize() {},
  setType() {},
  setWep() {},
  setEquip() {},
  build: "not a function",
};
assert.equal(controls.isRendered("mechAssembly"), true);
assert.equal(
  controls.assembleMech({
    elementId: "mechAssembly",
    size: "small",
    chassis: "wheel",
    hardpoints: ["laser"],
    equips: [],
    infernal: false,
  }),
  false,
);
requestedViews.length = 0;
views["mechAssembly"] = undefined;

// A full build steps the panel: infernal flag first, then size, chassis, one
// weapon per hardpoint and one equip per slot, and the build finish, with the
// component as the receiver.
let b = { infernal: false };
const calls = [];
const assembly = {
  get b() {
    return b;
  },
  setSize(...args) {
    calls.push({ method: "setSize", args, receiver: this === assembly });
  },
  setType(...args) {
    calls.push({ method: "setType", args, receiver: this === assembly });
  },
  setWep(...args) {
    calls.push({ method: "setWep", args, receiver: this === assembly });
  },
  setEquip(...args) {
    calls.push({ method: "setEquip", args, receiver: this === assembly });
  },
  build() {
    calls.push({ method: "build", receiver: this === assembly });
  },
};
views["mechAssembly"] = assembly;

assert.equal(
  controls.assembleMech({
    elementId: "mechAssembly",
    size: "medium",
    chassis: "tread",
    hardpoints: ["laser", "missile"],
    equips: ["shields", "sonar"],
    infernal: true,
  }),
  true,
);
assert.equal(b.infernal, true);
assert.deepEqual(calls, [
  { method: "setSize", args: ["medium"], receiver: true },
  { method: "setType", args: ["tread"], receiver: true },
  { method: "setWep", args: ["laser", 0], receiver: true },
  { method: "setWep", args: ["missile", 1], receiver: true },
  { method: "setEquip", args: ["shields", 0], receiver: true },
  { method: "setEquip", args: ["sonar", 1], receiver: true },
  { method: "build", receiver: true },
]);
assert.deepEqual(requestedViews, ["mechAssembly"]);

// Empty slots skip their loops but still finish the build, and a missing `b`
// data record does not block it.
calls.length = 0;
b = undefined;
assert.equal(
  controls.assembleMech({
    elementId: "mechAssembly",
    size: "collector",
    chassis: "hover",
    hardpoints: [],
    equips: [],
    infernal: false,
  }),
  true,
);
assert.deepEqual(calls, [
  { method: "setSize", args: ["collector"], receiver: true },
  { method: "setType", args: ["hover"], receiver: true },
  { method: "build", receiver: true },
]);

// A throwing component propagates rather than reporting a build that did not
// happen.
views["mechAssembly"] = {
  b: {},
  setSize() {},
  setType() {},
  setWep() {},
  setEquip() {},
  build() {
    throw new Error("assembly exploded");
  },
};
assert.throws(
  () =>
    controls.assembleMech({
      elementId: "mechAssembly",
      size: "small",
      chassis: "wheel",
      hardpoints: [],
      equips: [],
      infernal: false,
    }),
  /assembly exploded/,
);
views["mechAssembly"] = undefined;

console.log("Game mech controls adapter tests passed");
