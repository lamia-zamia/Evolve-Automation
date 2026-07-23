import assert from "node:assert/strict";

import { createFleetAdapter } from "../src/adapters/evolve/combat/fleet.ts";
import { runFleetAutomation } from "../src/application/fleet.ts";

const shipNames = [
  "scout_ship",
  "corvette_ship",
  "frigate_ship",
  "cruiser_ship",
  "dreadnought",
];
const regionNames = [
  "gxy_stargate",
  "gxy_gateway",
  "gxy_gorddon",
  "gxy_alien1",
  "gxy_alien2",
  "gxy_chthonian",
];
const emptyAssignment = () =>
  Object.fromEntries(shipNames.map((shipName) => [shipName, 0]));
const defense = Object.fromEntries(
  regionNames.map((regionName) => [regionName, emptyAssignment()]),
);
defense.gxy_gateway.scout_ship = 1;
const rating = () => ({ ship: { rating: () => 1 } });
const ship = (id, count) => ({ id, count });
const lockedMission = { isUnlocked: () => false, click: () => assert.fail() };
const buildings = {
  ScoutShip: ship("scout_ship", 1),
  CorvetteShip: ship("corvette_ship", 0),
  FrigateShip: ship("frigate_ship", 0),
  CruiserShip: ship("cruiser_ship", 0),
  Dreadnought: ship("dreadnought", 0),
  ChthonianMission: lockedMission,
  Alien2Mission: lockedMission,
  GorddonSymposium: { stateOnCount: 0 },
};
const game = {
  global: {
    galaxy: { defense },
    race: {},
  },
  actions: {
    galaxy: {
      gxy_gateway: {
        scout_ship: rating(),
        corvette_ship: rating(),
        frigate_ship: rating(),
        cruiser_ship: rating(),
        dreadnought: rating(),
      },
    },
  },
};
const settings = {
  fleetCrewReclaim: true,
  fleetChthonianLoses: "ignore",
  fleetMaxCover: true,
};
const resources = { Knowledge: { maxQuantity: 0 } };
for (const [index, regionName] of regionNames.entries()) {
  settings[`fleet_pr_${regionName}`] = index;
}

const removals = [];
const fleetManager = {
  neededShips: null,
  initFleet: () => true,
  addShip: () => assert.fail("no ship should be assigned without demand"),
  subShip: (...args) => removals.push(["sub", ...args]),
};
let usefulRegion = null;
const fleetAdapter = createFleetAdapter({
  getFleetManager: () => fleetManager,
  getGame: () => game,
  getSettings: () => settings,
  getResources: () => resources,
  getBuildings: () => buildings,
  getGalaxyRegions: () =>
    regionNames.map((name) => ({
      name,
      piracy: 1,
      armada: 0,
      useful: name === usefulRegion,
    })),
  guardActive: () => false,
  galaxyAssaultPending: () => false,
});

runFleetAutomation(fleetAdapter);
assert.deepEqual(fleetManager.neededShips, {
  scout_ship: 0,
  corvette_ship: 0,
  frigate_ship: 0,
  cruiser_ship: 0,
  dreadnought: 0,
});
assert.deepEqual(removals, [["sub", "gxy_gateway", "scout_ship", 1]]);

const assignments = [];
usefulRegion = "gxy_gateway";
defense.gxy_gateway.scout_ship = 0;
fleetManager.addShip = (...args) => assignments.push(["add", ...args]);
runFleetAutomation(fleetAdapter);
assert.deepEqual(fleetManager.neededShips, {
  scout_ship: 1,
  corvette_ship: 0,
  frigate_ship: 0,
  cruiser_ship: 0,
  dreadnought: 0,
});
assert.deepEqual(assignments, [["add", "gxy_gateway", "scout_ship", 1]]);

console.log("Fleet crew demand integration tests passed");
