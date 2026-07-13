import assert from "node:assert/strict";

import { createCraftingCosts } from "../src/game/crafting-costs.ts";

let game = {
  global: { race: { wasteful: false, high_pop: false, flier: false } },
  craftCost: { Plywood: [{ r: "Lumber", a: 100 }] },
};
let state = { lastWasteful: null, lastHighPop: null, lastFlier: null };
let resources = { Plywood: { id: "Plywood", cost: {} } };
let craftables = [];
let foundry = [];
const costs = createCraftingCosts({
  getGame: () => game,
  getState: () => state,
  getResources: () => resources,
  setCraftablesList: (list) => (craftables = list),
  setFoundryList: (list) => (foundry = list),
});

costs.updateCraftCost();
assert.equal(resources.Plywood.cost.Lumber, 100);
assert.equal(craftables[0], resources.Plywood);
assert.equal(foundry[0], resources.Plywood);

game = {
  global: { race: { wasteful: true, high_pop: false, flier: false } },
  craftCost: { Brick: [{ r: "Stone", a: 25 }] },
};
state = { lastWasteful: false, lastHighPop: false, lastFlier: false };
resources = { Brick: { id: "Brick", cost: {} } };
costs.updateCraftCost();
assert.equal(resources.Brick.cost.Stone, 25);
assert.equal(craftables[0], resources.Brick);

console.log("Crafting cost module tests passed");
