import assert from "node:assert/strict";
import { createIndustryManagers } from "../src/game/industry-managers.ts";

let game;
let buildings;
const clicks = [];
const vueCalls = [];
let techOk = true;

const vue = {
  add: (production) => vueCalls.push(["add", production]),
  sub: (production) => vueCalls.push(["sub", production]),
};

const { QuarryManager, MineManager, ExtractorManager } = createIndustryManagers(
  {
    getGame: () => game,
    getBuildings: () => buildings,
    getVueById: (id) => {
      clicks.push(["vue", id]);
      return vue;
    },
    getKeyManager: () => ({
      click: (count) => Array.from({ length: count }, (_, i) => i),
    }),
    haveTech: () => techOk,
  },
);

// --- Quarry gating ---
game = {
  global: {
    race: { smoldering: false },
    city: { rock_quarry: { asbestos: 3 } },
  },
};
buildings = { RockQuarry: { count: 5 } };
assert.equal(QuarryManager.initIndustry(), false); // not smoldering

game.global.race.smoldering = true;
buildings.RockQuarry.count = 0;
assert.equal(QuarryManager.initIndustry(), false); // no quarry

buildings.RockQuarry.count = 1;
assert.equal(QuarryManager.initIndustry(), true);
assert.equal(QuarryManager._industryVue, vue);
assert.equal(QuarryManager.currentProduction(), 3);

// --- Quarry production clicking ---
vueCalls.length = 0;
assert.equal(QuarryManager.increaseProduction(0), false); // no-op
assert.equal(vueCalls.length, 0);
QuarryManager.increaseProduction(3);
assert.deepEqual(vueCalls, [
  ["add", undefined],
  ["add", undefined],
  ["add", undefined],
]);
vueCalls.length = 0;
QuarryManager.decreaseProduction(2);
assert.deepEqual(vueCalls, [
  ["sub", undefined],
  ["sub", undefined],
]);
// Negative count delegates to the opposite direction.
vueCalls.length = 0;
QuarryManager.increaseProduction(-1);
assert.deepEqual(vueCalls, [["sub", undefined]]);

// --- Mine gating + production ---
game = { global: { space: { titan_mine: { ratio: 0.42 } } } };
buildings = { TitanMine: { count: 0 } };
assert.equal(MineManager.initIndustry(), false);
buildings.TitanMine.count = 2;
assert.equal(MineManager.initIndustry(), true);
assert.equal(MineManager.currentProduction(), 0.42);
vueCalls.length = 0;
MineManager.increaseProduction(1);
assert.deepEqual(vueCalls, [["add", undefined]]);

// --- Extractor gating (tech + building) + per-production args ---
techOk = false;
game = { global: { tauceti: { mining_ship: { Iridium: 7 } } } };
buildings = { TauBeltMiningShip: { count: 4 } };
assert.equal(ExtractorManager.initIndustry(), false); // tech missing
techOk = true;
assert.equal(ExtractorManager.initIndustry(), true);
assert.equal(ExtractorManager.currentProduction("Iridium"), 7);
vueCalls.length = 0;
ExtractorManager.increaseProduction("Iridium", 2);
assert.deepEqual(vueCalls, [
  ["add", "Iridium"],
  ["add", "Iridium"],
]);
vueCalls.length = 0;
ExtractorManager.decreaseProduction("Iridium", -1); // delegates to increase
assert.deepEqual(vueCalls, [["add", "Iridium"]]);

// --- Live dependency resolution: swapping game is observed immediately ---
game = {
  global: { space: { titan_mine: { ratio: 0.99 } } },
};
assert.equal(MineManager.currentProduction(), 0.99);

console.log("Industry managers module tests passed");
