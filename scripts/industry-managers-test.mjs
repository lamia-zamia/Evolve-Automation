import assert from "node:assert/strict";
import { createGameIndustryControls } from "../src/adapters/browser/game-industry-controls.ts";
import { createIndustryManagers } from "../src/game/industry-managers.ts";

let game;
let buildings;
const lookups = [];
const vueCalls = [];
let techOk = true;
let rendered = true;

const vue = {
  add: (production) => vueCalls.push(["add", production]),
  sub: (production) => vueCalls.push(["sub", production]),
};

// The managers are exercised over the real adapter so the element ids and the
// click pacing are covered end to end.
const industryControls = createGameIndustryControls({
  getVueById: (id) => {
    lookups.push(id);
    return rendered ? vue : undefined;
  },
  clickSteps: (count) => Array.from({ length: count }, (_value, i) => i),
});

const { QuarryManager, MineManager, ExtractorManager } = createIndustryManagers(
  {
    getGame: () => game,
    getBuildings: () => buildings,
    industryControls,
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

// Neither gate reaches the page at all.
assert.deepEqual(lookups, []);

buildings.RockQuarry.count = 1;
assert.equal(QuarryManager.initIndustry(), true);
assert.deepEqual(lookups, ["iQuarry"]);
assert.equal(QuarryManager.currentProduction(), 3);

// The gates pass but the game has not rendered the panel.
rendered = false;
assert.equal(QuarryManager.initIndustry(), false);
rendered = true;

// --- Quarry production clicking ---
vueCalls.length = 0;
lookups.length = 0;
assert.equal(QuarryManager.increaseProduction(0), false); // no-op
assert.equal(vueCalls.length, 0);
assert.deepEqual(lookups, []);
assert.equal(QuarryManager.increaseProduction(3), true);
assert.deepEqual(vueCalls, [
  ["add", undefined],
  ["add", undefined],
  ["add", undefined],
]);
// Three clicks cost one component lookup.
assert.deepEqual(lookups, ["iQuarry"]);
vueCalls.length = 0;
assert.equal(QuarryManager.decreaseProduction(2), true);
assert.deepEqual(vueCalls, [
  ["sub", undefined],
  ["sub", undefined],
]);
// Negative count delegates to the opposite direction and returns its result.
vueCalls.length = 0;
assert.equal(QuarryManager.increaseProduction(-1), true);
assert.deepEqual(vueCalls, [["sub", undefined]]);

// An unrendered panel refuses rather than throwing.
rendered = false;
vueCalls.length = 0;
assert.equal(QuarryManager.increaseProduction(2), false);
assert.deepEqual(vueCalls, []);
rendered = true;

// --- Mine gating + production ---
game = { global: { space: { titan_mine: { ratio: 0.42 } } } };
buildings = { TitanMine: { count: 0 } };
assert.equal(MineManager.initIndustry(), false);
buildings.TitanMine.count = 2;
lookups.length = 0;
assert.equal(MineManager.initIndustry(), true);
assert.deepEqual(lookups, ["iTMine"]);
assert.equal(MineManager.currentProduction(), 0.42);
vueCalls.length = 0;
assert.equal(MineManager.increaseProduction(1), true);
assert.deepEqual(vueCalls, [["add", undefined]]);

// --- Extractor gating (tech + building) + per-production args ---
techOk = false;
game = { global: { tauceti: { mining_ship: { Iridium: 7 } } } };
buildings = { TauBeltMiningShip: { count: 4 } };
assert.equal(ExtractorManager.initIndustry(), false); // tech missing
techOk = true;
lookups.length = 0;
assert.equal(ExtractorManager.initIndustry(), true);
assert.deepEqual(lookups, ["iMiningShip"]);
assert.equal(ExtractorManager.currentProduction("Iridium"), 7);
vueCalls.length = 0;
assert.equal(ExtractorManager.increaseProduction("Iridium", 2), true);
assert.deepEqual(vueCalls, [
  ["add", "Iridium"],
  ["add", "Iridium"],
]);
vueCalls.length = 0;
assert.equal(ExtractorManager.decreaseProduction("Iridium", -1), true); // delegates
assert.deepEqual(vueCalls, [["add", "Iridium"]]);
assert.equal(ExtractorManager.increaseProduction("Iridium", 0), false);

// --- Live dependency resolution: swapping game is observed immediately ---
game = {
  global: { space: { titan_mine: { ratio: 0.99 } } },
};
assert.equal(MineManager.currentProduction(), 0.99);

console.log("Industry managers module tests passed");
