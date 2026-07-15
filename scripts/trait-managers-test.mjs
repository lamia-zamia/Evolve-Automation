import assert from "node:assert/strict";
import { createTraitManagers } from "../src/game/trait-managers.ts";

let game;
let settings;
let resources;
let techLevel;
const vueCalls = [];

const vue = {
  gene: (name) => vueCalls.push(["gene", name]),
  gain: (name) => vueCalls.push(["gain", name]),
  purge: (name) => vueCalls.push(["purge", name]),
};

const { MinorTraitManager, MutableTraitManager } = createTraitManagers({
  getGame: () => game,
  getSettings: () => settings,
  getResources: () => resources,
  getVueById: () => vue,
  haveTech: (_tech, level) => techLevel >= level,
});

// --- Minor: unlock gating ---
techLevel = 2;
assert.equal(MinorTraitManager.isUnlocked(), false);
techLevel = 3;
assert.equal(MinorTraitManager.isUnlocked(), true);

// --- Minor: sort + managed filtering ---
MinorTraitManager.priorityList = [
  { priority: 2, enabled: true, isUnlocked: () => true, id: "b" },
  { priority: 1, enabled: false, isUnlocked: () => true, id: "a" },
  { priority: 3, enabled: true, isUnlocked: () => false, id: "c" },
];
MinorTraitManager.sortByPriority();
assert.deepEqual(
  MinorTraitManager.priorityList.map((t) => t.id),
  ["a", "b", "c"],
);
// Only enabled AND unlocked traits survive.
assert.deepEqual(
  MinorTraitManager.managedPriorityList().map((t) => t.id),
  ["b"],
);

// --- Minor: buyTrait dispatches gene() ---
vueCalls.length = 0;
MinorTraitManager.buyTrait("smart");
assert.deepEqual(vueCalls, [["gene", "smart"]]);

// --- Mutable: unlock requires tech AND mutation gene ---
techLevel = 3;
game = { global: { genes: {} } };
assert.ok(!MutableTraitManager.isUnlocked());
game = { global: { genes: { mutation: 1 } } };
assert.ok(MutableTraitManager.isUnlocked());

// --- Mutable: gain/purge dispatch ---
vueCalls.length = 0;
MutableTraitManager.gainTrait("dumb");
MutableTraitManager.purgeTrait("dumb");
assert.deepEqual(vueCalls, [
  ["gain", "dumb"],
  ["purge", "dumb"],
]);

// --- Mutable: minimumPlasmidsToPreserve ---
resources = { Phage: { currentQuantity: 100 } };
settings = { minimumPlasmidsToPreserve: 40, doNotGoBelowPlasmidSoftcap: false };
assert.equal(MutableTraitManager.minimumPlasmidsToPreserve, 40);
// Softcap floor uses Phage + 250 when it exceeds the configured minimum.
settings.doNotGoBelowPlasmidSoftcap = true;
assert.equal(MutableTraitManager.minimumPlasmidsToPreserve, 350);
// Never negative.
settings.minimumPlasmidsToPreserve = -5;
settings.doNotGoBelowPlasmidSoftcap = false;
assert.equal(MutableTraitManager.minimumPlasmidsToPreserve, 0);

// --- Live resolution: swapping settings is observed immediately ---
settings = { minimumPlasmidsToPreserve: 7, doNotGoBelowPlasmidSoftcap: false };
assert.equal(MutableTraitManager.minimumPlasmidsToPreserve, 7);

console.log("Trait managers module tests passed");
