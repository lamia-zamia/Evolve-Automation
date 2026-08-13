import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const actions = [];
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

assert.equal(typeof hooks.autoFleet, "function");
const ships = [
  "scout_ship",
  "corvette_ship",
  "frigate_ship",
  "cruiser_ship",
  "dreadnought",
];
const regions = [
  "gxy_stargate",
  "gxy_gateway",
  "gxy_gorddon",
  "gxy_alien1",
  "gxy_alien2",
  "gxy_chthonian",
];
const defense = Object.fromEntries(
  regions.map((region) => [
    region,
    Object.fromEntries(ships.map((ship) => [ship, 0])),
  ]),
);
defense.gxy_gateway.frigate_ship = 45;
const rating = (value) => ({ ship: { rating: () => value } });
const mission = (unlocked, name) => ({
  isUnlocked: () => unlocked,
  click: () => actions.push(["mission", name]),
});
const count = (value) => ({ count: value });
const on = (value) => ({ stateOnCount: value });
const buildings = {
  ScoutShip: count(0),
  CorvetteShip: count(0),
  FrigateShip: count(45),
  CruiserShip: count(0),
  Dreadnought: count(0),
  ChthonianMission: mission(true, "chthonian"),
  Alien2Mission: mission(false, "alien2"),
  StargateDefensePlatform: on(0),
  GatewayStarbase: on(0),
  BologniumShip: on(0),
  GorddonFreighter: on(0),
  Alien1SuperFreighter: on(0),
  GorddonSymposium: on(0),
  Alien1VitreloyPlant: on(0),
  Alien2Foothold: on(0),
  Alien2ArmedMiner: on(0),
  Alien2Scavenger: on(0),
  ChthonianMineLayer: on(0),
  ChthonianRaider: on(0),
  ChthonianExcavator: on(0),
};
const game = {
  global: {
    race: {},
    tech: { piracy: 10 },
    galaxy: { defense, trade: { f0: 0 } },
  },
  actions: {
    galaxy: {
      gxy_gateway: {
        scout_ship: rating(10),
        corvette_ship: rating(25),
        frigate_ship: rating(100),
        cruiser_ship: rating(250),
        dreadnought: rating(1000),
      },
      gxy_alien2: { armed_miner: rating(10) },
      gxy_chthonian: { minelayer: rating(7), raider: rating(8) },
    },
  },
};
const settings = { fleetChthonianLoses: "frigate" };
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
  ].map((id) => [id, { isUseful: () => false, storageRatio: 1 }]),
);
const poly = { galaxyOffers: [] };
const manager = {
  initFleet: () => true,
  subShip: (region, ship, amount) =>
    actions.push(["remove", region, ship, amount]),
  addShip: (region, ship, amount) =>
    actions.push(["add", region, ship, amount]),
};

hooks.setGalaxyIntelligenceTestContext({
  game,
  buildings,
  resources,
  poly,
  settings,
  traitVal: () => 1,
});
hooks.setFleetManagersTestContext({
  game,
  settings,
  resources,
  buildings,
  poly,
});
hooks.setWave5TestManagers({
  StorageManager: {},
  FleetManagerOuter: {},
  FleetManager: manager,
  MechManager: {},
});

hooks.autoFleet();
const expected = [];
for (const region of regions) {
  for (const ship of ships) {
    expected.push(["remove", region, ship, defense[region][ship]]);
  }
}
for (const ship of ships) {
  expected.push([
    "add",
    "gxy_chthonian",
    ship,
    ship === "frigate_ship" ? 45 : 0,
  ]);
}
expected.push(["mission", "chthonian"]);
assert.deepEqual(actions, expected);

console.log("Fleet bundled characterization tests passed");
