import assert from "node:assert/strict";

import { createMechIntelligence } from "../src/game/mech-intelligence.ts";

let settings = { autoMech: true, mechBuild: "user", buildingMechsFirst: true };
let spireMechBay = { count: 1, stateOffCount: 0 };
let mechbay = { max: 10, bay: 0, blueprint: { size: "small" } };
let resources = {
  Supply: { maxQuantity: 1_000 },
  Soul_Gem: { currentQuantity: 41, spareQuantity: -209, rateOfChange: 0.01 },
};
let isActive = false;
let mechTask = false;
let cost = [1, 20, 1];
let managerReads = [];

const intelligence = createMechIntelligence({
  getGame: () => ({ global: { portal: { mechbay } } }),
  getSettings: () => settings,
  getBuildings: () => ({ SpireMechBay: spireMechBay }),
  getResources: () => resources,
  getMechManager: () => ({
    get isActive() {
      managerReads.push("isActive");
      return isActive;
    },
    getPreferredSize: () => {
      managerReads.push("getPreferredSize");
      return ["large", "small"];
    },
    getMechCost: (design) => {
      managerReads.push(`getMechCost(${design.size})`);
      return cost;
    },
  }),
  getHaveTask: () => (task) => (task === "mech" ? mechTask : undefined),
});

// A reserved Soul Gem target can leave currentQuantity affordable while the
// mech is not affordable from the spare quantity. The distant reservation is
// still spendable, so the next mech is worth saving Supply for.
assert.equal(intelligence.mechSupplySavingReason(), "saving");
assert.deepEqual(managerReads, ["isActive", "getMechCost(small)"]);

// Near-term reservations must release Supply again.
managerReads = [];
resources.Soul_Gem = {
  currentQuantity: 41,
  spareQuantity: 0,
  rateOfChange: 0.02,
};
assert.equal(intelligence.mechSupplySavingReason(), null);
resources.Soul_Gem.spareQuantity = 1;
assert.equal(intelligence.mechSupplySavingReason(), "saving");

// A mech already under construction pins Supply without pricing a design.
managerReads = [];
isActive = true;
assert.equal(intelligence.mechSupplySavingReason(), "building");
assert.deepEqual(managerReads, ["isActive"]);
isActive = false;

// The size comes from the blueprint, from the preferred list in random mode,
// and is always a titan while the mech task is forced.
managerReads = [];
settings = { ...settings, mechBuild: "random" };
assert.equal(intelligence.mechSupplySavingReason(), "saving");
mechTask = true;
assert.equal(intelligence.mechSupplySavingReason(), "saving");
assert.deepEqual(managerReads, [
  "isActive",
  "getPreferredSize",
  "getMechCost(large)",
  "isActive",
  "getMechCost(titan)",
]);
mechTask = false;
settings = { ...settings, mechBuild: "user" };

// A mech that does not fit the bay, or whose Supply cost exceeds storage, is
// not worth saving for.
cost = [1, 20, 11];
assert.equal(intelligence.mechSupplySavingReason(), null);
cost = [1, 1_001, 1];
assert.equal(intelligence.mechSupplySavingReason(), null);
cost = [1, 20, 1];

// Each gate skips the manager entirely: mechs off, no build mode, buildings
// not deprioritized, no bay built, and a bay that is switched off.
managerReads = [];
for (const disabled of [
  { autoMech: false },
  { mechBuild: "none" },
  { buildingMechsFirst: false },
]) {
  const previous = settings;
  settings = { ...settings, ...disabled };
  assert.equal(intelligence.mechSupplySavingReason(), null);
  settings = previous;
}
spireMechBay = { count: 0, stateOffCount: 0 };
assert.equal(intelligence.mechSupplySavingReason(), null);
spireMechBay = { count: 2, stateOffCount: 1 };
assert.equal(intelligence.mechSupplySavingReason(), null);
assert.deepEqual(managerReads, []);

console.log("Mech intelligence module tests passed");
