import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.updateCraftCost, "function");
assert.equal(typeof hooks.setCraftCostTestContext, "function");
assert.equal(typeof hooks.getCraftCostTestLists, "function");

const game = {
  global: { race: { wasteful: false, high_pop: false, flier: false } },
  craftCost: {
    Plywood: [
      { r: "Lumber", a: 100 },
      { r: "Money", a: 5 },
    ],
    Scarletite: [{ r: "Scarlet", a: 10 }],
    Quantium: [{ r: "Neutronium", a: 20 }],
    Thermite: [{ r: "Iron", a: 50 }],
  },
};
const state = { lastWasteful: null, lastHighPop: null, lastFlier: null };
const resources = {
  Plywood: { id: "Plywood", cost: { stale: 1 } },
  Scarletite: { id: "Scarletite", cost: {} },
  Quantium: { id: "Quantium", cost: {} },
};
hooks.setCraftCostTestContext({ game, state, resources });
hooks.updateCraftCost();
assert.deepEqual({ ...resources.Plywood.cost }, { Lumber: 100, Money: 5 });
assert.deepEqual(
  Array.from(hooks.getCraftCostTestLists().craftablesList, (item) => item.id),
  ["Plywood", "Scarletite", "Quantium"],
);
assert.deepEqual(
  Array.from(hooks.getCraftCostTestLists().foundryList, (item) => item.id),
  ["Plywood"],
);
assert.deepEqual(state, {
  lastWasteful: false,
  lastHighPop: false,
  lastFlier: false,
});

game.craftCost.Plywood[0].a = 250;
hooks.updateCraftCost();
assert.equal(resources.Plywood.cost.Lumber, 100);
game.global.race.high_pop = true;
hooks.updateCraftCost();
assert.equal(resources.Plywood.cost.Lumber, 250);
assert.equal(state.lastHighPop, true);

console.log("Crafting cost bundled characterization tests passed");
