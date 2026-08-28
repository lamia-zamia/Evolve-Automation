import assert from "node:assert/strict";
import { createGameFleetControls } from "../src/adapters/browser/game-fleet-controls.ts";
import { createFleetManagers } from "../src/game/fleet-managers.ts";

let game;
let settings = {};
let resources;
let buildings;
let poly;
let haveTech = () => false;
let vueById = {};
const trace = [];

const fleetControls = createGameFleetControls({
  getVueById: (id) => vueById[id],
  clickSteps: (count) => Array.from({ length: Math.max(0, count) }),
  getGame: () => game,
  getJQuery: () => (selector) => ({
    eq: (index) => ({
      click: () => trace.push(["jquery", selector, index]),
    }),
  }),
});

const { FleetManagerOuter, FleetManager } = createFleetManagers({
  getGame: () => game,
  getSettings: () => settings,
  getResources: () => resources,
  getBuildings: () => buildings,
  getPoly: () => poly,
  getHaveTech: () => haveTech,
  fleetControls,
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
// `game.global` is a per-period clone; the panel carries the game's own
// shipyard, and a build appends the finished ship to that list.
const liveYard = { sort: false, ships: [] };
vueById.shipPlans = {
  avail: (...args) => {
    trace.push(["avail", ...args]);
    return true;
  },
  setVal: (...args) => trace.push(["set", ...args]),
  powerText: () => "has-text-danger",
  build: () => {
    trace.push(["build"]);
    liveYard.ships?.push({ name: "New" });
  },
  s: liveYard,
};
assert.equal(FleetManagerOuter.initFleet(), true);

// The explorer design rule is the manager's own: a weapon or sensor the preset
// would not allow is refused before any panel question.
assert.equal(FleetManagerOuter.avail(explorer), false);

// A differing part is asked of the panel with its option index from the
// catalog, and a part the panel refuses fails the whole design.
const fighter = {
  ...explorer,
  class: "corvette",
  weapon: "railgun",
};
assert.equal(FleetManagerOuter.avail(fighter), true);
assert.deepEqual(trace, [
  ["avail", "class", 0, "corvette"],
  ["avail", "weapon", 0, "railgun"],
]);
trace.length = 0;
vueById.shipPlans.avail = (...args) => args[0] !== "weapon";
assert.equal(FleetManagerOuter.avail(fighter), false);

// A blueprint that cannot be powered refuses the build before any resource is
// deducted, after the differing parts have been configured.
trace.length = 0;
vueById.shipPlans.avail = () => true;
game.global.space.shipyard.blueprint = {
  ...fighter,
  class: "frigate",
  weapon: "laser",
};
assert.equal(FleetManagerOuter.build(fighter, "spc_red"), false);
assert.equal(resources.Alloy.currentQuantity, 10);
assert.deepEqual(trace, [
  ["set", "class", "corvette"],
  ["set", "weapon", "railgun"],
]);

// With power in order the build lands with the sort checkbox toggled around it
// and the built ship parked at the end of the list.
vueById.shipPlans.powerText = () => "has-text-success";
vueById.shipReg0 = {
  setLoc: (...args) => trace.push(["location", ...args]),
};
liveYard.sort = true;
liveYard.ships = [{ ...fighter, name: "A", location: "spc_red" }];
resources.Alloy.currentQuantity = 10;
trace.length = 0;
assert.equal(FleetManagerOuter.build(fighter, "spc_red"), true);
assert.equal(resources.Alloy.currentQuantity, -15);
assert.deepEqual(trace, [
  ["set", "class", "corvette"],
  ["set", "weapon", "railgun"],
  ["jquery", "#shipPlans .b-checkbox", 1],
  ["build"],
  ["location", "spc_red", 1],
  ["jquery", "#shipPlans .b-checkbox", 1],
]);

// A yard that sorts nothing needs no toggle, and a yard with no ship list yet
// still builds without a parking read.
liveYard.sort = false;
liveYard.ships = [{ ...fighter, name: "A", location: "spc_red" }];
resources.Alloy.currentQuantity = 10;
trace.length = 0;
assert.equal(FleetManagerOuter.build(fighter, "spc_red"), true);
assert.deepEqual(trace, [
  ["set", "class", "corvette"],
  ["set", "weapon", "railgun"],
  ["build"],
  ["location", "spc_red", 1],
]);
liveYard.ships = undefined;
trace.length = 0;
assert.equal(FleetManagerOuter.build(fighter, "spc_red"), true);
assert.deepEqual(trace, [
  ["set", "class", "corvette"],
  ["set", "weapon", "railgun"],
  ["build"],
]);

// The piracy panel keeps its technology gate, and moves one ship per click
// step through the real adapter.
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

// A withdrawn panel refuses both directions instead of throwing, and a count
// that resolves to no steps is still accepted by an actionable panel.
delete vueById.fleet;
assert.equal(FleetManager.addShip("spc_titan", "cruiser", 2), false);
assert.equal(FleetManager.subShip("spc_titan", "cruiser", 1), false);
vueById.fleet = {
  add: () => trace.push(["add"]),
  sub: () => trace.push(["sub"]),
};
assert.equal(FleetManager.addShip("spc_titan", "cruiser", 0), true);
assert.equal(FleetManager.subShip("spc_titan", "cruiser", 0), true);

// Fallbacks and live haveTech selection in the Titan/Enceladus divisor branch.
assert.deepEqual(FleetManagerOuter.syndicate("spc_red", true, false), {
  p: 1,
  r: 0,
  s: 0,
});
game.global.race.truepath = true;
game.global.space.syndicate = { spc_titan: 600 };
game.global.space.shipyard = { blueprint: { ...explorer }, ships: [] };
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

// The design questions answer for a missing shipyard instead of throwing: no
// yard means no design is available, nothing can be built, and no ship of a
// template is parked anywhere.
assert.equal(FleetManagerOuter.avail(fighter), false);
assert.equal(FleetManagerOuter.build(fighter, "spc_red"), false);
assert.equal(FleetManagerOuter.shipCount("spc_red", fighter), 0);

console.log("Fleet manager tests passed");
