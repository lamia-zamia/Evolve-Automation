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
  StargateDefensePlatform: active(0),
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
const intelligence = createGalaxyIntelligence({
  getGame: () => game,
  getBuildings: () => buildings,
  getSettings: () => settings,
  getTraitVal: () => () => 1,
});

assert.equal(intelligence.getGalaxyCombatShipPower(), 5);
assert.equal(intelligence.galaxyAssaultPending(), false);

buildings = { ...buildings, Alien2Mission: mission(true), ScoutShip: count(3) };
settings = { fleetChthonianLoses: "allow" };
assert.equal(intelligence.getGalaxyCombatShipPower(), 7);
assert.equal(intelligence.galaxyAssaultPending(), true);

console.log("Galaxy intelligence module tests passed");
