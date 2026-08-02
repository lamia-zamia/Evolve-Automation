import assert from "node:assert/strict";
import { createFleetManagers } from "../src/game/fleet-managers.ts";

let game;
let settings = {};
let resources;
let buildings;
let poly;
let haveTech = () => false;
let vueById = {};
const trace = [];

const { FleetManagerOuter, FleetManager } = createFleetManagers({
  getGame: () => game,
  getSettings: () => settings,
  getResources: () => resources,
  getBuildings: () => buildings,
  getPoly: () => poly,
  getVueById: (id) => vueById[id],
  getKeyManager: () => ({
    click: (count) => Array.from({ length: Math.max(0, count) }),
  }),
  getHaveTech: () => haveTech,
  getJQuery: () => (selector) => ({
    eq: (index) => ({
      click: () => trace.push(["jquery", selector, index]),
    }),
  }),
});

game = {
  global: {
    tech: {},
    race: {},
    civic: { foreign: { gov3: { hstl: 0 } } },
    space: {},
  },
  actions: { space: {} },
  loc: (key) => key,
};
resources = {
  Alloy: {
    currentQuantity: 10,
    maxQuantity: 20,
    hasStorage: () => true,
  },
};
buildings = {
  EnceladusBase: { stateOnCount: 0 },
  TitanSAM: { stateOnCount: 0 },
  TritonFOB: { stateOnCount: 0 },
};
poly = { shipCosts: () => ({ Alloy: 25 }) };

assert.equal(FleetManagerOuter.initFleet(), false);
assert.equal(FleetManager.initFleet(), false);
FleetManagerOuter.updateNextShip({ class: "corvette" });
assert.equal(FleetManagerOuter.nextShipAffordable, false);
assert.equal(FleetManagerOuter.nextShipExpandable, true);

const explorer = {
  class: "explorer",
  armor: "neutronium",
  weapon: "laser",
  engine: "emdrive",
  power: "elerium",
  sensor: "quantum",
};
game.global.space.shipyard = { blueprint: { ...explorer }, ships: [] };
game.global.tech.syndicate = 1;
vueById.shipPlans = {
  avail: () => true,
  setVal: (...args) => trace.push(["set", ...args]),
  powerText: () => "has-text-danger",
  build: () => trace.push(["build"]),
};
assert.equal(FleetManagerOuter.initFleet(), true);
assert.equal(FleetManagerOuter.avail(explorer), false);
const fighter = { ...explorer, class: "corvette", weapon: "railgun" };
assert.equal(FleetManagerOuter.build(fighter, "spc_red"), false);
assert.equal(resources.Alloy.currentQuantity, 10);

// Fallbacks and live haveTech selection in the Titan/Enceladus divisor branch.
assert.deepEqual(FleetManagerOuter.syndicate("spc_red", true, false), {
  p: 1,
  r: 0,
  s: 0,
});
game.global.race.truepath = true;
game.global.space.syndicate = { spc_titan: 600 };
game.global.space.shipyard.ships = [];
game.actions.space.spc_titan = {
  info: { syndicate_cap: () => 1_200, syndicate: () => true },
};
buildings.TitanSAM.stateOnCount = 4;
const noTriton = FleetManagerOuter.syndicate("spc_titan", true, false);
assert.equal(noTriton.r, 580);
assert.equal(noTriton.s, 0);
assert.ok(Math.abs(noTriton.p - 0.0333) < 1e-12);
haveTech = () => true;
const withTriton = FleetManagerOuter.syndicate("spc_titan", true, false);
assert.equal(withTriton.r, 580);
assert.equal(withTriton.s, 0);
assert.ok(Math.abs(withTriton.p - 0.5167) < 1e-12);

// Inner fleet keeps its technology/Vue gating and click counts.
game.global.tech.piracy = 1;
assert.equal(FleetManager.initFleet(), false);
vueById.fleet = {
  add: (...args) => trace.push(["add", ...args]),
  sub: (...args) => trace.push(["sub", ...args]),
};
assert.equal(FleetManager.initFleet(), true);
FleetManager.addShip("spc_titan", "cruiser", 2);
FleetManager.subShip("spc_titan", "cruiser", 1);
assert.deepEqual(trace.slice(-3), [
  ["add", "spc_titan", "cruiser"],
  ["add", "spc_titan", "cruiser"],
  ["sub", "spc_titan", "cruiser"],
]);

// Piracy tolerates the lazily absent space bags. `syndicate` and `shipyard`
// only exist once the matching Truepath content has unlocked.
delete game.global.space.syndicate;
assert.equal(FleetManagerOuter.syndicate("spc_titan", false, false), 1);

game.global.space.syndicate = { spc_titan: 600 };
delete game.global.space.shipyard;
// No shipyard means no patrol and no sensors, so the full piracy rating stands.
assert.deepEqual(FleetManagerOuter.syndicate("spc_titan", true, false), {
  p: 0.5,
  r: 600,
  s: 0,
});

console.log("Fleet manager tests passed");
