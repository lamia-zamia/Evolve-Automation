import assert from "node:assert/strict";
import { readWeightingCandidate } from "../src/adapters/evolve/progression/build/weighting-candidate.ts";

// A live wrapper answers most questions through getters and methods, so the
// fixture is a class rather than a literal.
class BuildingWrapper {
  constructor(overrides = {}) {
    this.catalogKey = "Factory";
    this.name = "Factory";
    this._id = "factory";
    this._tab = "city";
    this._location = "";
    this.is = {};
    this.cost = {};
    this.unlocked = true;
    this.autoBuildEnabled = true;
    this.smartManaged = false;
    this.count = 3;
    this.autoMax = Number.MAX_SAFE_INTEGER;
    this._weighting = 100;
    this.stateOffCount = 1;
    this.powered = 5;
    this.affordable = true;
    this.missing = null;
    this.support = null;
    this.useless = null;
    Object.assign(this, overrides);
  }
  isUnlocked() {
    return this.unlocked;
  }
  isSmartManaged() {
    return this.smartManaged;
  }
  isAffordable(max) {
    assert.equal(max, true, "affordability is asked at the AutoBuild amount");
    return this.affordable;
  }
  getMissingConsumption() {
    return this.missing;
  }
  getMissingSupport() {
    return this.support;
  }
  getUselessSupport() {
    return this.useless;
  }
}

const read = (overrides) =>
  readWeightingCandidate(new BuildingWrapper(overrides));

const unlocked = read({
  is: { housing: true, knowledge: true },
  cost: { Money: 250, Knowledge: 1_000 },
  missing: { name: "Coal" },
  support: { name: "Elerium Support" },
  useless: { name: "Belt Support" },
});
assert.deepEqual(
  { ...unlocked },
  {
    id: "Factory",
    name: "Factory",
    actionId: "factory",
    tab: "city",
    location: "",
    unlocked: true,
    autoBuildEnabled: true,
    smartManaged: false,
    count: 3,
    autoMax: Number.MAX_SAFE_INTEGER,
    baseWeight: 100,
    stateOffCount: 1,
    housing: true,
    garrison: false,
    knowledge: true,
    randomlyWeighted: false,
    producedResource: null,
    affordable: true,
    powered: 5,
    cost: { Money: 250, Knowledge: 1_000 },
    missingConsumption: "Coal",
    missingSupport: "Elerium Support",
    uselessSupport: "Belt Support",
  },
);
assert.equal(Object.isFrozen(unlocked), true);
assert.equal(Object.isFrozen(unlocked.cost), true);

// `is` carries only the flags a building declares, so an undeclared category is
// absent rather than false.
assert.equal(read({ is: { random: true } }).randomlyWeighted, true);
assert.equal(read({ is: { garrison: true } }).garrison, true);

// Only a ResourceAction records the resource it produces.
assert.equal(read({ resourceKey: "Horseshoe" }).producedResource, "Horseshoe");

// A locked building has no game `definition`, so `powered`, `isAffordable()`
// and the three consumption answers cannot be evaluated on it and its `cost` is
// whatever it held before it locked. The `locked` rule zeroes such a candidate
// before any rule reads them.
class LockedWrapper extends BuildingWrapper {
  get powered() {
    throw new Error("powered read on a locked building");
  }
  set powered(_value) {}
  isAffordable() {
    throw new Error("affordability read on a locked building");
  }
  getMissingConsumption() {
    throw new Error("consumption read on a locked building");
  }
  getMissingSupport() {
    throw new Error("support read on a locked building");
  }
  getUselessSupport() {
    throw new Error("support read on a locked building");
  }
}
const locked = readWeightingCandidate(
  new LockedWrapper({ unlocked: false, cost: { Money: 250 } }),
);
assert.equal(locked.unlocked, false);
assert.equal(locked.affordable, false);
assert.equal(locked.powered, 0);
assert.deepEqual({ ...locked.cost }, {});
assert.equal(locked.missingConsumption, null);
assert.equal(locked.missingSupport, null);
assert.equal(locked.uselessSupport, null);
// The identity and the cheap wrapper reads are still taken while locked.
assert.equal(locked.id, "Factory");
assert.equal(locked.count, 3);
assert.equal(locked.stateOffCount, 1);

// The settings-backed answers are absent until that building's toggle is first
// written, so they keep the game's truthiness test.
for (const absent of [undefined, null, 0, ""]) {
  const lenient = read({ autoBuildEnabled: absent, smartManaged: absent });
  assert.equal(lenient.autoBuildEnabled, false);
  assert.equal(lenient.smartManaged, false);
}
assert.equal(read({ affordable: undefined }).affordable, false);
assert.equal(read({ affordable: 1 }).affordable, true);

const rejects = (overrides, message) =>
  assert.throws(() => read(overrides), {
    name: "TypeError",
    message: new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  });

rejects(
  { catalogKey: undefined },
  "BuildingManager.priorityList entry.catalogKey must be a string",
);
rejects(
  { unlocked: undefined },
  "buildings.Factory.isUnlocked() must be a boolean",
);
rejects({ name: 7 }, "buildings.Factory.name must be a string");
rejects({ _id: undefined }, "buildings.Factory._id must be a string");
rejects({ _tab: undefined }, "buildings.Factory._tab must be a string");
rejects(
  { _location: undefined },
  "buildings.Factory._location must be a string",
);
rejects({ count: "3" }, "buildings.Factory.count must be a finite number");
rejects(
  { autoMax: undefined },
  "buildings.Factory.autoMax must be a finite number",
);
rejects(
  { _weighting: undefined },
  "buildings.Factory._weighting must be a finite number",
);
rejects(
  { stateOffCount: Number.NaN },
  "buildings.Factory.stateOffCount must be a finite number",
);
rejects({ powered: "5" }, "buildings.Factory.powered must be a finite number");
rejects({ is: undefined }, "buildings.Factory.is must be an object");
rejects({ cost: undefined }, "buildings.Factory.cost must be an object");
rejects(
  { cost: { Money: "250" } },
  "buildings.Factory.cost.Money must be a finite number",
);
rejects({ resourceKey: 7 }, "buildings.Factory.resourceKey must be a string");
rejects(
  { missing: { name: undefined } },
  "buildings.Factory.getMissingConsumption().name must be a string",
);
rejects(
  { support: 7 },
  "buildings.Factory.getMissingSupport() must be an object",
);
rejects(
  { useless: { name: 7 } },
  "buildings.Factory.getUselessSupport().name must be a string",
);
assert.throws(() => readWeightingCandidate({ catalogKey: "Factory", is: {} }), {
  name: "TypeError",
  message: /^buildings\.Factory\.isUnlocked must be a function/,
});
assert.throws(() => readWeightingCandidate(null), {
  name: "TypeError",
  message: /^BuildingManager\.priorityList entry must be an object/,
});

console.log("Building weighting candidate adapter tests passed");
