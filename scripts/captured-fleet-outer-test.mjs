import assert from "node:assert/strict";

import { createCapturedFleetControls } from "../src/adapters/evolve/combat/captured-fleet-controls.ts";
import { createCapturedOuterFleetControl } from "../src/bootstrap/captured-fleet-outer-control.ts";

function createFixture({ append = true } = {}) {
  const ships = [];
  const calls = [];
  let destinationClicks = 0;
  const data = { s: { ships, sort: false } };
  const methods = {
    avail: (_type, _index, part) => part === "railgun",
    setVal: (type, part) => calls.push(["setVal", type, part]),
    powerText: () => "100kW",
    build: () => {
      calls.push(["build"]);
      if (append) ships.push({ location: "spc_dwarf" });
    },
  };
  const handle = {
    elementId: "shipPlans",
    generation: 1,
    methods: Object.keys(methods),
    data,
  };
  const controls = {
    resolve: (elementId) => (elementId === "shipPlans" ? handle : undefined),
    invoke: (current, method, args = []) => {
      const fn = methods[method];
      if (current !== handle || fn === undefined) {
        return { ok: false, reason: "unknown-method" };
      }
      return { ok: true, value: fn(...args) };
    },
    capturedElementIds: () => ["shipPlans"],
  };
  const document = {
    querySelector: (selector) =>
      selector === "#modalBox .shipDispatch button.spc_red"
        ? { click: () => destinationClicks++ }
        : null,
  };
  return {
    controls: createCapturedFleetControls({
      controls,
      getDocument: () => document,
    }),
    calls,
    ships,
    get destinationClicks() {
      return destinationClicks;
    },
  };
}

const ready = createFixture();
assert.equal(ready.controls.isRendered("shipPlans"), true);
assert.equal(
  ready.controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "railgun",
    index: 0,
  }),
  true,
);
assert.equal(
  ready.controls.isPartAvailable({
    elementId: "shipPlans",
    type: "weapon",
    part: "laser",
    index: 1,
  }),
  false,
);
assert.equal(
  ready.controls.setPart({
    elementId: "shipPlans",
    type: "weapon",
    part: "railgun",
  }),
  true,
);
assert.equal(ready.controls.hasShipPower("shipPlans"), true);
assert.deepEqual(ready.controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: 0,
});
assert.equal(ready.ships.length, 1);
assert.equal(
  ready.controls.dispatchShip({ index: 0, region: "spc_red" }),
  true,
);
assert.equal(ready.destinationClicks, 1);

const noTransition = createFixture({ append: false });
assert.deepEqual(noTransition.controls.buildShip({ elementId: "shipPlans" }), {
  actionable: true,
  builtIndex: null,
});
assert.equal(noTransition.ships.length, 0);

// Full captured composition: the first call builds, the next opens the game's dispatch window,
// and the following call clicks the destination. The postcondition is the live ship location, not
// the return value of either control method.
const yard = {
  blueprint: {
    class: "corvette",
    armor: "steel",
    weapon: "railgun",
    engine: "ion",
    power: "diesel",
    sensor: "radar",
  },
  ships: [],
};
const root = {
  race: { truepath: true, universe: "evil", grenadier: false },
  tech: { syndicate: 1, tauceti: 0, eris: 2, triton: 0, outer: 0 },
  space: {
    shipyard: yard,
    syndicate: { spc_red: 600 },
    operating_base: { on: 0 },
    sam: { on: 0 },
    fob: { on: 0 },
  },
  civic: {
    foreign: { gov3: { hstl: 50 } },
    govern: { type: "democracy" },
    garrison: { workers: 100, crew: 0 },
  },
  portal: {},
  resource: Object.assign(
    Object.fromEntries(
      [
        "Money",
        "Aluminium",
        "Adamantite",
        "Steel",
        "Alloy",
        "Neutronium",
        "Titanium",
        "Copper",
        "Iridium",
        "Iron",
        "Nano_Tube",
        "Quantium",
        "Orichalcum",
        "Tungsten",
      ].map((id) => [id, { amount: 1e12, max: 1e12 }]),
    ),
    { Authority: { amount: 100, max: 100, display: true } },
  ),
};
const capturedSettings = {
  fleetOuterShips: "custom",
  fleetOuterCrew: 30,
  fleetExploreTau: false,
  fleet_outer_pr_spc_red: 1,
  fleet_outer_def_spc_red: 0.9,
  fleet_outer_sc_spc_red: 0,
  fleet_outer_class: "corvette",
  fleet_outer_power: "diesel",
  fleet_outer_weapon: "railgun",
  fleet_outer_armor: "steel",
  fleet_outer_engine: "ion",
  fleet_outer_sensor: "radar",
  fleet_scout_class: "corvette",
  fleet_scout_power: "diesel",
  fleet_scout_weapon: "railgun",
  fleet_scout_armor: "steel",
  fleet_scout_engine: "ion",
  fleet_scout_sensor: "radar",
  authorityManage: false,
  generalMinimumAuthority: 100,
};
let modalOpen = false;
let capturedBuilds = 0;
const capturedMethods = {
  avail: () => true,
  setVal: (type, part) => {
    yard.blueprint[type] = part;
  },
  powerText: () => "100kW",
  build: () => {
    capturedBuilds++;
    yard.ships.push({
      class: yard.blueprint.class,
      power: yard.blueprint.power,
      weapon: yard.blueprint.weapon,
      armor: yard.blueprint.armor,
      engine: yard.blueprint.engine,
      sensor: yard.blueprint.sensor,
      location: "spc_dwarf",
      transit: 0,
      fueled: true,
      damage: 0,
    });
  },
};
const capturedHandle = {
  elementId: "shipPlans",
  generation: 1,
  methods: Object.keys(capturedMethods),
  data: { s: yard },
};
const capturedRegistry = {
  resolve: (elementId) =>
    elementId === "shipPlans" ? capturedHandle : undefined,
  invoke: (handle, method, args = []) => {
    if (handle !== capturedHandle || capturedMethods[method] === undefined) {
      return { ok: false, reason: "unknown-method" };
    }
    return {
      ok: true,
      value: capturedMethods[method](...args),
    };
  },
  capturedElementIds: () => ["shipPlans"],
};
const capturedDocument = {
  querySelector: (selector) => {
    if (selector === "#ship0loc") return { click: () => (modalOpen = true) };
    if (
      (selector === "#modalBox .shipDispatch button" ||
        selector === "#modalBox .shipDispatch button.spc_red") &&
      modalOpen
    ) {
      return {
        click: () => {
          yard.ships[0].location = "spc_red";
          modalOpen = false;
        },
      };
    }
    if (selector === ".modal .modal-close")
      return { click: () => (modalOpen = false) };
    return null;
  },
  getElementById: (id) => (id === "modalBox" && modalOpen ? {} : null),
};
const outerControl = createCapturedOuterFleetControl({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: capturedRegistry,
  getDocument: () => capturedDocument,
  readSettings: () => capturedSettings,
});
assert.equal(outerControl.autoFleetOuter().status, "succeeded");
assert.equal(yard.ships.length, 1);
assert.equal(yard.ships[0].location, "spc_dwarf");
assert.equal(outerControl.autoFleetOuter().status, "succeeded");
assert.equal(modalOpen, true);
assert.equal(outerControl.autoFleetOuter().status, "succeeded");
assert.equal(yard.ships[0].location, "spc_red");

// Authority management must reach the existing policy before build execution. A corvette removes
// two soldiers; at 100 Authority and a 99 target, the policy predicts 98 and must stand down.
const buildsBeforeAuthority = capturedBuilds;
capturedSettings.authorityManage = true;
capturedSettings.generalMinimumAuthority = 99;
yard.ships.length = 0;
const authorityControl = createCapturedOuterFleetControl({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: capturedRegistry,
  getDocument: () => capturedDocument,
  readSettings: () => capturedSettings,
});
assert.equal(authorityControl.autoFleetOuter().status, "succeeded");
assert.equal(capturedBuilds, buildsBeforeAuthority);
assert.equal(yard.ships.length, 0);

// A trigger can click successfully while the dispatch modal never mounts its destination. The
// captured modal adapter must let FleetManagerOuter's retry budget advance instead of holding the
// manager busy forever.
capturedSettings.authorityManage = false;
capturedSettings.generalMinimumAuthority = 0;
yard.ships.length = 0;
let stalledModalOpen = false;
let stalledModalShip = null;
let allowStalledDestination = false;
const stalledDispatchTriggers = new Map([
  ["#ship0loc", 0],
  ["#ship1loc", 1],
]);
const stalledDocument = {
  querySelector: (selector) => {
    const shipIndex = stalledDispatchTriggers.get(selector);
    if (shipIndex !== undefined) {
      return {
        click: () => {
          stalledModalOpen = true;
          stalledModalShip = shipIndex;
        },
      };
    }
    if (
      (selector === "#modalBox .shipDispatch button" ||
        selector === "#modalBox .shipDispatch button.spc_red") &&
      stalledModalOpen &&
      allowStalledDestination
    ) {
      return {
        click: () => {
          yard.ships[stalledModalShip].location = "spc_red";
          stalledModalOpen = false;
          stalledModalShip = null;
        },
      };
    }
    if (selector === ".modal .modal-close" && stalledModalOpen)
      return {
        click: () => {
          stalledModalOpen = false;
          stalledModalShip = null;
        },
      };
    return null;
  },
  getElementById: (id) => (id === "modalBox" && stalledModalOpen ? {} : null),
};
const stalledControl = createCapturedOuterFleetControl({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: capturedRegistry,
  getDocument: () => stalledDocument,
  readSettings: () => capturedSettings,
});
assert.equal(stalledControl.autoFleetOuter().status, "succeeded");
assert.equal(yard.ships.length, 1);
capturedSettings.fleetOuterShips = "none";
for (let cycle = 0; cycle < 200; cycle++) {
  stalledControl.autoFleetOuter();
}
assert.equal(yard.ships.length, 1);
assert.equal(stalledModalOpen, false);
assert.equal(stalledModalShip, null);
capturedSettings.fleetOuterShips = "custom";
assert.equal(stalledControl.autoFleetOuter().status, "succeeded");
assert.equal(yard.ships.length, 2);
capturedSettings.fleetOuterShips = "none";
allowStalledDestination = true;
assert.equal(stalledControl.autoFleetOuter().status, "succeeded");
assert.equal(stalledModalOpen, true);
assert.equal(stalledModalShip, 1);
assert.equal(yard.ships[1].location, "spc_dwarf");
assert.equal(stalledControl.autoFleetOuter().status, "succeeded");
assert.equal(stalledModalOpen, false);
assert.equal(stalledModalShip, null);
assert.equal(yard.ships[1].location, "spc_red");
assert.equal(stalledControl.autoFleetOuter().status, "succeeded");

console.log("Captured outer-fleet control postcondition tests passed");
