import assert from "node:assert/strict";

import { createHellIntelligence } from "../src/game/hell-intelligence.ts";

const unlockable = (value) => ({ isUnlocked: () => value });

let armyRatingCalls = [];
let supressionCalls = [];
let supression = { supress: 0, rating: 0 };
let game = {
  armyRating: (soldiers, type, wounded) => {
    armyRatingCalls.push([soldiers, type, wounded]);
    return 100;
  },
};
let buildings = {
  RuinsGuardPost: { ...unlockable(true), count: 0 },
  GateEastTower: unlockable(true),
  GateWestTower: unlockable(true),
  GateTurret: unlockable(true),
};
let settings = { buildingTowerSuppression: 100 };

const intelligence = createHellIntelligence({
  getGame: () => game,
  getBuildings: () => buildings,
  getPoly: () => ({
    hellSupression: (area) => {
      supressionCalls.push(area);
      return supression;
    },
  }),
  getSettings: () => settings,
  getTraitVal: () => (trait, index, operation) =>
    trait === "holy" && operation === "+" ? 1 : 0,
});

// The tower rule compares the gate supression fraction with the configured
// percentage floor.
supression = { supress: 0.5, rating: 0 };
assert.equal(intelligence.gateTowerSupressionTooLow(), true);
assert.deepEqual(supressionCalls, ["gate"]);
settings = { buildingTowerSuppression: 50 };
assert.equal(intelligence.gateTowerSupressionTooLow(), false);
settings = { buildingTowerSuppression: 49 };
assert.equal(intelligence.gateTowerSupressionTooLow(), false);

// Either tower still locked means there is no gate supression to measure, and
// the supression read is skipped entirely.
supressionCalls = [];
buildings = { ...buildings, GateEastTower: unlockable(false) };
assert.equal(intelligence.gateTowerSupressionTooLow(), false);
buildings = {
  ...buildings,
  GateEastTower: unlockable(true),
  GateWestTower: unlockable(false),
};
assert.equal(intelligence.gateTowerSupressionTooLow(), false);
assert.deepEqual(supressionCalls, []);
buildings = { ...buildings, GateWestTower: unlockable(true) };

// Demons count as supressed once the gate rating passes 7501 plus the rating a
// single guard post contributes.
armyRatingCalls = [];
supression = { supress: 1, rating: 7602 };
assert.equal(intelligence.gateDemonsSupressed(), true);
assert.deepEqual(armyRatingCalls, [[0, "hellArmy", 0]]);
supression = { supress: 1, rating: 7601 };
assert.equal(intelligence.gateDemonsSupressed(), false);
supression = { supress: 1, rating: 7600 };
assert.equal(intelligence.gateDemonsSupressed(), false);

// A locked turret skips both the supression and the army rating read.
supressionCalls = [];
armyRatingCalls = [];
buildings = { ...buildings, GateTurret: unlockable(false) };
assert.equal(intelligence.gateDemonsSupressed(), false);
assert.deepEqual(supressionCalls, []);
assert.deepEqual(armyRatingCalls, []);
buildings = { ...buildings, GateTurret: unlockable(true) };

// Guard posts are prebuilt until their combined rating reaches 5000, so 50 of
// them at 100 rating each complete the target.
buildings = {
  ...buildings,
  RuinsGuardPost: { ...unlockable(true), count: 49 },
};
assert.equal(intelligence.guardPostPrebuildIncomplete(), true);
buildings = {
  ...buildings,
  RuinsGuardPost: { ...unlockable(true), count: 50 },
};
assert.equal(intelligence.guardPostPrebuildIncomplete(), false);

// A locked guard post has nothing to prebuild and skips the army rating read.
armyRatingCalls = [];
buildings = {
  ...buildings,
  RuinsGuardPost: { ...unlockable(false), count: 0 },
};
assert.equal(intelligence.guardPostPrebuildIncomplete(), false);
assert.deepEqual(armyRatingCalls, []);

console.log("Hell intelligence module tests passed");
