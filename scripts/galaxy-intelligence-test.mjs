import assert from "node:assert/strict";

import { createGalaxyIntelligence } from "../src/game/galaxy-intelligence.ts";

const rating = (value) => ({ ship: { rating: () => value } });
const count = (value) => ({ count: value });
const active = (value) => ({ stateOnCount: value });
const mission = (value) => ({ isUnlocked: () => value });
let game = {
  global: { race: {}, tech: { piracy: 1 } },
  actions: {
    galaxy: {
      gxy_gateway: {
        scout_ship: rating(1),
        corvette_ship: rating(1),
        frigate_ship: rating(1),
        cruiser_ship: rating(1),
        dreadnought: rating(1),
      },
      gxy_alien2: { armed_miner: rating(1) },
      gxy_chthonian: { minelayer: rating(1), raider: rating(1) },
    },
  },
};
let buildings = {
  ScoutShip: count(1),
  CorvetteShip: count(1),
  FrigateShip: count(1),
  CruiserShip: count(1),
  Dreadnought: count(1),
  ChthonianMission: mission(false),
  Alien2Mission: mission(false),
  StargateDefensePlatform: { stateOnCount: 0, count: 0 },
  GatewayStarbase: active(0),
  BologniumShip: active(0),
  GorddonFreighter: active(0),
  Alien1SuperFreighter: active(0),
  GorddonSymposium: active(0),
  Alien1VitreloyPlant: active(0),
  Alien2Foothold: active(0),
  Alien2ArmedMiner: active(0),
  Alien2Scavenger: active(0),
  ChthonianMineLayer: active(0),
  ChthonianRaider: active(0),
  ChthonianExcavator: active(0),
};
let settings = { fleetChthonianLoses: "ignore" };
let resources = Object.fromEntries(
  [
    "Adamantite",
    "Bolognium",
    "Deuterium",
    "Iridium",
    "Knowledge",
    "Neutronium",
    "Orichalcum",
    "Polymer",
    "Vitreloy",
  ].map((id) => [id, { isUseful: () => false }]),
);
const intelligence = createGalaxyIntelligence({
  getGame: () => game,
  getBuildings: () => buildings,
  getResources: () => resources,
  getGalaxyOffers: () => [],
  getSettings: () => settings,
  getTraitVal: () => () => 1,
});

assert.equal(intelligence.getGalaxyCombatShipPower(), 5);
assert.equal(intelligence.galaxyAssaultPending(), false);

buildings = { ...buildings, Alien2Mission: mission(true), ScoutShip: count(3) };
settings = { fleetChthonianLoses: "allow" };
assert.equal(intelligence.getGalaxyCombatShipPower(), 7);
assert.equal(intelligence.galaxyAssaultPending(), true);

// Stargate piracy counts as supressed once the built defense platforms out-defend it.
game = { ...game, global: { ...game.global, tech: { piracy: 1000 } } };
buildings = {
  ...buildings,
  StargateDefensePlatform: { stateOnCount: 0, count: 4 },
};
assert.equal(intelligence.stargatePiracySupressed(), false);
buildings = {
  ...buildings,
  StargateDefensePlatform: { stateOnCount: 0, count: 5 },
};
assert.equal(intelligence.stargatePiracySupressed(), true);

// Without the piracy tech there is nothing to supress or to cover.
game = { ...game, global: { ...game.global, tech: {} } };
assert.equal(intelligence.stargatePiracySupressed(), false);
assert.equal(intelligence.galaxyPiracyCoveredByFleet(), false);

// No region the current cycle needs leaves nothing for the fleet to cover.
game = { ...game, global: { ...game.global, tech: { piracy: 1000 } } };
assert.equal(intelligence.galaxyPiracyCoveredByFleet(), true);

// A needed region the fleet cannot out-rate is not covered. Bolognium demand
// makes the gateway region useful, and stargate piracy multiplies it.
resources = {
  ...resources,
  Bolognium: { isUseful: () => true, storageRatio: 0 },
};
buildings = { ...buildings, BologniumShip: active(1) };
assert.equal(intelligence.galaxyPiracyCoveredByFleet(), false);
buildings = { ...buildings, Dreadnought: count(200) };
assert.equal(intelligence.galaxyPiracyCoveredByFleet(), true);

console.log("Galaxy intelligence module tests passed");
