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

assert.equal(typeof hooks.setGalaxyIntelligenceTestContext, "function");
const intelligence = hooks.galaxyIntelligence;
for (const name of [
  "getGalaxyCombatShipPower",
  "getPiracyMultiplier",
  "galaxyAssaultPending",
  "getGalaxyRegions",
]) {
  assert.equal(typeof intelligence?.[name], "function", `${name} hook missing`);
}

const rating = (value) => ({ ship: { rating: () => value } });
const mission = (unlocked) => ({ isUnlocked: () => unlocked });
const count = (value) => ({ count: value });
const on = (value) => ({ stateOnCount: value });
const buildings = {
  ScoutShip: count(1),
  CorvetteShip: count(2),
  FrigateShip: count(3),
  CruiserShip: count(4),
  Dreadnought: count(5),
  ChthonianMission: mission(true),
  Alien2Mission: mission(false),
  StargateDefensePlatform: on(2),
  GatewayStarbase: on(1),
  BologniumShip: on(1),
  GorddonFreighter: on(1),
  Alien1SuperFreighter: on(0),
  GorddonSymposium: on(0),
  Alien1VitreloyPlant: on(1),
  Alien2Foothold: on(2),
  Alien2ArmedMiner: on(3),
  Alien2Scavenger: on(0),
  ChthonianMineLayer: on(2),
  ChthonianRaider: on(3),
  ChthonianExcavator: on(0),
};
const game = {
  global: {
    race: {
      chicken: true,
      ocular_power: true,
      ocularPowerConfig: { f: true },
    },
    tech: { piracy: 10 },
    galaxy: { trade: { f0: 0 } },
  },
  actions: {
    galaxy: {
      gxy_gateway: {
        scout_ship: rating(1),
        corvette_ship: rating(2),
        frigate_ship: rating(3),
        cruiser_ship: rating(4),
        dreadnought: rating(5),
      },
      gxy_alien2: { armed_miner: rating(10) },
      gxy_chthonian: { minelayer: rating(7), raider: rating(8) },
    },
  },
};
const settings = { fleetChthonianLoses: "ignore" };
const poly = { galaxyOffers: [{ buy: { res: "Bolognium" } }] };
let resourcesUseful = true;
const resources = Object.fromEntries(
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
  ].map((id) => [id, { isUseful: () => resourcesUseful, storageRatio: 0.5 }]),
);
hooks.setGalaxyIntelligenceTestContext({
  game,
  buildings,
  resources,
  poly,
  settings,
  traitVal: (trait, index, operation) => {
    if (trait === "chicken") {
      assert.deepEqual([index, operation], [1, "+"]);
      return 1.2;
    }
    assert.equal(trait, "ocular_power");
    assert.equal(index, 1);
    return 50;
  },
});

assert.equal(intelligence.getGalaxyCombatShipPower(), 55);
assert.equal(intelligence.getPiracyMultiplier(), 1.08);
assert.equal(intelligence.galaxyAssaultPending(), false);
settings.fleetChthonianLoses = "allow";
assert.equal(intelligence.galaxyAssaultPending(), true);

assert.deepEqual(
  [...intelligence.getGalaxyRegions()].map((region) => ({ ...region })),
  [
    { name: "gxy_stargate", piracy: 1.08, armada: 40, useful: true },
    { name: "gxy_gateway", piracy: 1.08, armada: 25, useful: true },
    { name: "gxy_gorddon", piracy: 864, armada: 0, useful: false },
    { name: "gxy_alien1", piracy: 1080, armada: 0, useful: true },
    { name: "gxy_alien2", piracy: 2700, armada: 130, useful: true },
    {
      name: "gxy_chthonian",
      piracy: 8100.000000000001,
      armada: 38,
      useful: false,
    },
  ],
);

buildings.ChthonianExcavator.stateOnCount = 1;
resources.Orichalcum.storageRatio = 1;
assert.equal(
  intelligence
    .getGalaxyRegions()
    .find((region) => region.name === "gxy_chthonian").useful,
  false,
);
resources.Orichalcum.storageRatio = 0.5;
assert.equal(
  intelligence
    .getGalaxyRegions()
    .find((region) => region.name === "gxy_chthonian").useful,
  true,
);

game.global.race = {};
buildings.ChthonianMission = mission(false);
buildings.Alien2Mission = mission(true);
assert.equal(intelligence.getPiracyMultiplier(), 1);
assert.equal(intelligence.galaxyAssaultPending(), true);

resourcesUseful = false;
assert.deepEqual(
  [...intelligence.getGalaxyRegions()].map(({ name, useful }) => ({
    name,
    useful,
  })),
  [
    { name: "gxy_stargate", useful: false },
    { name: "gxy_gateway", useful: false },
    { name: "gxy_gorddon", useful: false },
    { name: "gxy_alien1", useful: false },
    { name: "gxy_alien2", useful: false },
    { name: "gxy_chthonian", useful: false },
  ],
);

resources.Bolognium = { isUseful: () => true, storageRatio: 0.5 };
game.global.galaxy.trade.f0 = 1;
assert.equal(
  intelligence
    .getGalaxyRegions()
    .find((region) => region.name === "gxy_gorddon").useful,
  true,
);

console.log("Galaxy intelligence bundled characterization tests passed");
