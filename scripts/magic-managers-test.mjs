import assert from "node:assert/strict";
import { createGameIndustryControls } from "../src/adapters/browser/game-industry-controls.ts";
import { createMagicManagers } from "../src/game/magic-managers.ts";

let game;
let settings;
let resources;
let buildings;
let techOk = true;
let lumber = false;
const vueCalls = [];
const requestedViews = [];

const vue = {
  addSpell: (id) => vueCalls.push(["add", id]),
  subSpell: (id) => vueCalls.push(["sub", id]),
};
let vueById = { iPylon: vue };

const industryControls = createGameIndustryControls({
  getVueById: (id) => {
    requestedViews.push(id);
    return vueById[id];
  },
  clickSteps: (count) => Array.from({ length: count }, (_, i) => i),
});

const { AlchemyManager, RitualManager } = createMagicManagers({
  getGame: () => game,
  getSettings: () => settings,
  getResources: () => resources,
  getBuildings: () => buildings,
  haveTech: () => techOk,
  isLumberRace: () => lumber,
  // Faithful-enough stub: keeps id/isUnlocked, ignores weighting props.
  addProps: (target) => target,
  industryControls,
});

// --- Alchemy: settings-backed enable/weighting + unlock ---
settings = { res_alchemy_Iron: true, res_alchemy_w_Iron: 5 };
assert.equal(AlchemyManager.resEnabled("Iron"), true);
assert.equal(AlchemyManager.resWeighting("Iron"), 5);
techOk = true;
assert.equal(AlchemyManager.isUnlocked(), true);
techOk = false;
assert.equal(AlchemyManager.isUnlocked(), false);

// --- Alchemy: transmuteTier tiers ---
const Crystal = { id: "Crystal" };
resources = { Crystal, Food: { id: "Food" }, Mana: {} };
game = { tradeRatio: { Copper: 1, Steel: 1 }, global: {} };
// Crystal is always tier 0.
assert.equal(AlchemyManager.transmuteTier(Crystal), 0);
// Not in tradeRatio -> tier 0.
assert.equal(AlchemyManager.transmuteTier({ id: "Iron" }), 0);
// In tradeRatio, instance has trade -> tier 1.
assert.equal(
  AlchemyManager.transmuteTier({ id: "Copper", instance: { trade: 1 } }),
  1,
);
// In tradeRatio, no trade -> tier 2.
assert.equal(AlchemyManager.transmuteTier({ id: "Steel", instance: {} }), 2);
// A resource the game has not instantiated yet is tier 2, not a crash.
assert.equal(AlchemyManager.transmuteTier({ id: "Steel" }), 2);

// --- Alchemy: managedPriorityList filters by enabled + unlocked + tier ---
settings = {
  res_alchemy_A: true,
  res_alchemy_B: true,
  res_alchemy_C: false,
};
game = {
  tradeRatio: {},
  global: { tech: { alchemy: 2 }, race: { artifical: false } },
};
AlchemyManager.priorityList = [
  { id: "A", isUnlocked: () => true },
  { id: "B", isUnlocked: () => false }, // not unlocked
  { id: "C", isUnlocked: () => true }, // not enabled
];
assert.deepEqual(
  AlchemyManager.managedPriorityList().map((r) => r.id),
  ["A"],
);

// --- Alchemy: currentCount + transmute rate adjustments + clicks ---
game = { global: { race: { alchemy: { Iron: 12 } } } };
assert.equal(AlchemyManager.currentCount("Iron"), 12);

resources = { Mana: { rateOfChange: 100 }, Crystal: { rateOfChange: 50 } };
vueById.alchemyIron = vue;
vueCalls.length = 0;
requestedViews.length = 0;
assert.equal(AlchemyManager.transmuteMore("Iron", 4), true);
assert.equal(resources.Mana.rateOfChange, 96); // -4 * 1
assert.equal(resources.Crystal.rateOfChange, 48); // -4 * 0.5
assert.deepEqual(vueCalls, [
  ["add", "Iron"],
  ["add", "Iron"],
  ["add", "Iron"],
  ["add", "Iron"],
]);
// The transmute panel is named by the game's `alchemy` prefix plus the id.
assert.deepEqual(requestedViews, ["alchemyIron"]);
vueCalls.length = 0;
assert.equal(AlchemyManager.transmuteLess("Iron", 2), true);
assert.equal(resources.Mana.rateOfChange, 98); // +2 * 1
assert.equal(resources.Crystal.rateOfChange, 49); // +2 * 0.5
assert.deepEqual(vueCalls, [
  ["sub", "Iron"],
  ["sub", "Iron"],
]);

// A withdrawn transmute panel short-circuits before touching the rates.
delete vueById.alchemyIron;
resources = { Mana: { rateOfChange: 5 }, Crystal: { rateOfChange: 5 } };
assert.equal(AlchemyManager.transmuteMore("Iron", 3), false);
assert.equal(resources.Mana.rateOfChange, 5);

// --- Ritual: production unlock closures ---
game = { global: { race: {} } };
lumber = true;
assert.equal(RitualManager.Productions.Farmer.isUnlocked(), true);
assert.equal(RitualManager.Productions.Lumberjack.isUnlocked(), true);
game = { global: { race: { cataclysm: true } } };
assert.equal(RitualManager.Productions.Miner.isUnlocked(), false);
techOk = true;
assert.equal(RitualManager.Productions.Crafting.isUnlocked(), true);

// --- Ritual: initIndustry gating ---
vueById.iPylon = vue;
game = { global: { race: { casting: true } } };
buildings = {
  Pylon: { count: 0 },
  RedPylon: { count: 0 },
  TauPylon: { count: 0 },
};
assert.equal(RitualManager.initIndustry(), false); // no pylons
buildings.Pylon.count = 1;
assert.equal(RitualManager.initIndustry(), true);
game.global.race.casting = false;
assert.equal(RitualManager.initIndustry(), false); // not casting

// --- Ritual: mana cost math ---
assert.equal(RitualManager.manaCost(0), 0);
assert.equal(RitualManager.costStep(0), 0.0025);
game = { global: { race: { casting: { farmer: 3 } } } };
assert.equal(RitualManager.currentSpells({ id: "farmer" }), 3);

// --- Ritual: increase/decrease resolve to the iPylon panel ---
vueCalls.length = 0;
requestedViews.length = 0;
const spell = { id: "science", isUnlocked: () => true };
assert.equal(RitualManager.increaseRitual(spell, 2), true);
assert.deepEqual(vueCalls, [
  ["add", "science"],
  ["add", "science"],
]);
assert.deepEqual(requestedViews, ["iPylon"]);
vueCalls.length = 0;
assert.equal(RitualManager.decreaseRitual(spell, 1), true);
assert.deepEqual(vueCalls, [["sub", "science"]]);
// A withdrawn pylon refuses instead of throwing.
delete vueById.iPylon;
vueCalls.length = 0;
assert.equal(RitualManager.increaseRitual(spell, 1), false);
assert.equal(vueCalls.length, 0);
// Locked spell is a no-op.
assert.equal(
  RitualManager.increaseRitual({ id: "x", isUnlocked: () => false }, 3),
  false,
);
assert.equal(vueCalls.length, 0);

console.log("Magic managers module tests passed");
