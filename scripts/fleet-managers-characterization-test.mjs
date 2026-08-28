import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const readyCallbacks = [];
const vueById = {};
const trace = [];
const documentStub = {
  getElementById: (id) =>
    vueById[id] === undefined ? null : { __vue__: vueById[id] },
};
const jquery = (selector) => ({
  ready(callback) {
    readyCallbacks.push(callback);
  },
  eq(index) {
    return {
      click: () => trace.push(["jquery-click", selector, index]),
    };
  },
});
const { hooks } = await loadCharacterizationBundle({
  console,
  document: documentStub,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
});

const { FleetManagerOuter, FleetManager } = hooks.fleetManagers;
const fighter = {
  class: "corvette",
  armor: "neutronium",
  weapon: "plasma",
  engine: "ion",
  power: "fission",
  sensor: "quantum",
};
const yard = {
  blueprint: { ...fighter },
  ships: [
    {
      ...fighter,
      name: "A",
      location: "spc_red",
      damage: 0,
      transit: 0,
      fueled: true,
    },
  ],
  sort: true,
};
// The panel's own shipyard, which is the object the game builds into.
const liveYard = { ships: [...yard.ships], sort: true };
const game = {
  global: {
    tech: { syndicate: 1, piracy: 1 },
    race: { truepath: true },
    civic: { foreign: { gov3: { hstl: 30 } } },
    space: {
      shipyard: yard,
      syndicate: { spc_red: 500 },
    },
  },
  actions: {
    space: {
      spc_red: {
        info: {
          name: "Red Planet",
          syndicate: () => true,
          syndicate_cap: () => 1_000,
        },
      },
    },
  },
  loc: (key) => key,
};
const settings = {};
for (const type of Object.keys(FleetManagerOuter.ShipConfig)) {
  settings[`fleet_outer_${type}`] = fighter[type];
  settings[`fleet_scout_${type}`] = fighter[type];
}
settings.fleet_outer_pr_spc_red = 7;
settings.fleet_outer_def_spc_red = 0.85;
settings.fleet_outer_sc_spc_red = 2;
const resources = {
  Alloy: {
    currentQuantity: 200,
    maxQuantity: 500,
    hasStorage: () => true,
  },
  Elerium: {
    currentQuantity: 20,
    maxQuantity: 25,
    hasStorage: () => false,
  },
};
const shipPlansVue = {
  avail: (...args) => {
    trace.push(["avail", ...args]);
    return true;
  },
  setVal: (...args) => trace.push(["set", ...args]),
  powerText: () => "has-text-success",
  build: () => {
    trace.push(["build"]);
    // The game appends the finished ship to its own list, which the panel
    // carries; `game.global` is a per-period clone and never sees it.
    liveYard.ships.push({ name: "New" });
  },
  s: liveYard,
};
vueById.shipPlans = shipPlansVue;
vueById.shipReg0 = {
  setLoc: (...args) => trace.push(["location", ...args]),
};
vueById.fleet = {
  add: (...args) => trace.push(["add", ...args]),
  sub: (...args) => trace.push(["sub", ...args]),
};

hooks.setFleetManagersTestContext({
  game,
  settings,
  resources,
  buildings: {
    EnceladusBase: { stateOnCount: 0 },
    TitanSAM: { stateOnCount: 0 },
    TritonFOB: { stateOnCount: 0 },
  },
  poly: {
    shipCosts: () => ({ Alloy: 100, Elerium: 30 }),
  },
  win: { document: documentStub },
  KeyManager: {
    click: (count) => Array.from({ length: Math.max(0, count) }),
  },
  haveTech: () => true,
});

assert.equal(FleetManagerOuter.getWeighting("spc_red"), 7);
assert.equal(FleetManagerOuter.getMaxDefense("spc_red"), 0.85);
assert.equal(FleetManagerOuter.getMaxScouts("spc_red"), 2);
assert.equal(
  FleetManagerOuter.getShipName(fighter),
  "outer_shipyard_class_corvette",
);
assert.equal(FleetManagerOuter.getLocName("spc_red"), "Red Planet");
assert.equal(FleetManagerOuter.isUnlocked("spc_red"), true);

FleetManagerOuter.updateNextShip(fighter);
assert.deepEqual(
  JSON.parse(
    JSON.stringify({
      cost: FleetManagerOuter.nextShipCost,
      affordable: FleetManagerOuter.nextShipAffordable,
      expandable: FleetManagerOuter.nextShipExpandable,
    }),
  ),
  {
    cost: { Alloy: 100, Elerium: 30 },
    affordable: false,
    expandable: false,
  },
);
assert.equal(FleetManagerOuter.initFleet(), true);
assert.deepEqual(
  JSON.parse(JSON.stringify(FleetManagerOuter.getFighterBlueprint())),
  fighter,
);
assert.deepEqual(
  JSON.parse(JSON.stringify(FleetManagerOuter.getScoutBlueprint())),
  fighter,
);
assert.equal(FleetManagerOuter.getMissingResource(fighter), "Elerium");
assert.equal(FleetManagerOuter.avail(fighter), true);
resources.Elerium.currentQuantity = 100;
assert.equal(FleetManagerOuter.build(fighter, "spc_red"), true);
assert.equal(FleetManagerOuter.getShipAttackPower(fighter), 90);
assert.equal(FleetManagerOuter.shipCount("spc_red", fighter), 1);
assert.deepEqual(
  JSON.parse(
    JSON.stringify(FleetManagerOuter.syndicate("spc_red", true, false)),
  ),
  { p: 0.6488, r: 439, s: 60 },
);

assert.equal(FleetManager.initFleet(), true);
FleetManager.addShip("spc_red", "corvette", 2);
FleetManager.subShip("spc_red", "corvette", 1);

assert.deepEqual(JSON.parse(JSON.stringify(trace)), [
  ["jquery-click", "#shipPlans .b-checkbox", 1],
  ["build"],
  ["location", "spc_red", 1],
  ["jquery-click", "#shipPlans .b-checkbox", 1],
  ["add", "spc_red", "corvette"],
  ["add", "spc_red", "corvette"],
  ["sub", "spc_red", "corvette"],
]);

FleetManagerOuter.updateNextShip(null);
assert.equal(FleetManagerOuter.nextShipCost, null);
assert.equal(FleetManagerOuter.nextShipAffordable, null);

console.log("Fleet manager bundled characterization tests passed");
