import assert from "node:assert/strict";

import { createAutoFleetOuter } from "../src/automation/combat/fleet-outer.ts";

function runFleetCase({
  authority = 100,
  authorityTarget = 100,
  authorityMax = 100,
  authorityManage = true,
  authorityUnavailable = false,
  race = {},
  trait = () => undefined,
  regions = ["spc_red"],
  maxDefense = 0.9,
  syndicateRatio = 0.5,
  erisTech = 2,
  digsite,
  troopers = 0,
  tanks = 0,
  erisSupport = troopers + tanks,
} = {}) {
  const actions = [];
  const fighter = {
    class: "corvette",
    armor: "neutronium",
    weapon: "plasma",
    engine: "ion",
    power: "fission",
    sensor: "quantum",
  };
  const manager = {
    Regions: regions,
    ClassCrew: { corvette: 2 },
    initFleet: () => true,
    getWeighting: () => 1,
    getMaxDefense: () => maxDefense,
    getMaxScouts: () => 0,
    isUnlocked: () => true,
    syndicate: (_region, extra) => (extra ? { s: 100 } : syndicateRatio),
    getScoutBlueprint: () => fighter,
    getFighterBlueprint: () => fighter,
    shipCount: () => 0,
    avail: () => true,
    updateNextShip: (ship) => actions.push(["next", ship]),
    getShipName: () => "Corvette",
    getLocName: () => "Red Planet",
    getMissingResource: () => null,
    build: (_ship, region) => {
      actions.push(["build", region]);
      return true;
    },
  };
  const game = {
    global: {
      race: { universe: "evil", truepath: true, ...race },
      tech: { evil: 0, eris: erisTech },
      civic: { govern: { type: "federation" } },
      space: {
        shipyard: { blueprint: fighter },
        ...(digsite === undefined
          ? {}
          : {
              digsite: { count: digsite },
              shock_trooper: { on: troopers },
              tank: { on: tanks },
            }),
      },
    },
  };
  const settings = {
    fleetOuterShips: "custom",
    fleetOuterCrew: 30,
    fleetExploreTau: false,
    generalMinimumAuthority: authorityTarget,
    authorityManage,
  };
  const resources = {
    Authority: {
      currentQuantity: authority,
      maxQuantity: authorityMax,
      isUnlocked: () => true,
    },
    Eris_Support: { currentQuantity: erisSupport },
  };
  const autoFleetOuter = createAutoFleetOuter({
    getFleetManagerOuter: () => manager,
    getWarManager: () => ({ currentCityGarrison: 100 }),
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    traitVal: (id, index, fallback) => trait(id, index) ?? fallback,
    assessAuthorityRemoval: (removed) => {
      if (authorityUnavailable) {
        return { status: "unavailable", reason: "invalid-resource" };
      }
      const target =
        authorityTarget === 0
          ? null
          : authorityTarget < 0
            ? authorityMax
            : authorityTarget;
      if (target === null) return { status: "unmanaged" };
      const perSoldier =
        0.7 *
        ((trait("high_pop", 1) ?? 100) / 100) *
        (race.grenadier ? 1.75 : 1);
      const predicted = Math.floor(authority - removed * perSoldier);
      return {
        status: "ready",
        target,
        predicted,
        blocksRemoval: predicted < target,
      };
    },
    GameLog: { logSuccess: () => actions.push(["log"]) },
  });

  autoFleetOuter();
  return { actions, manager };
}

const blocked = runFleetCase();
assert.equal(
  blocked.actions.some(([action]) => action === "build"),
  false,
);
assert.match(blocked.manager.nextShipMsg, /would lower Authority to 98/);

const surplus = runFleetCase({ authority: 103 });
assert.equal(
  surplus.actions.some(([action]) => action === "build"),
  true,
);

const disabled = runFleetCase({ authority: 20, authorityTarget: 0 });
assert.equal(
  disabled.actions.some(([action]) => action === "build"),
  true,
);

const globallyDisabled = runFleetCase({
  authority: 20,
  authorityManage: false,
});
assert.equal(
  globallyDisabled.actions.some(([action]) => action === "build"),
  true,
);

const unavailable = runFleetCase({ authorityUnavailable: true });
assert.equal(
  unavailable.actions.some(([action]) => action === "build"),
  false,
);
assert.match(unavailable.manager.nextShipMsg, /Authority data unavailable/);

const pinAtMax = runFleetCase({
  authority: 102,
  authorityTarget: -1,
  authorityMax: 102,
});
assert.equal(
  pinAtMax.actions.some(([action]) => action === "build"),
  false,
);

const highPopulation = runFleetCase({
  authority: 102,
  race: { high_pop: true },
  trait: (id, index) =>
    id === "high_pop" && index === 0
      ? 2
      : id === "high_pop" && index === 1
        ? 50
        : undefined,
});
assert.equal(
  highPopulation.actions.some(([action]) => action === "build"),
  true,
);

const incompleteDigsite = runFleetCase({
  authority: 103,
  regions: ["spc_eris"],
  maxDefense: 0.01,
  syndicateRatio: 0.47,
  erisTech: 4,
  digsite: 0,
  troopers: 23,
  tanks: 7,
});
assert.deepEqual(
  incompleteDigsite.actions.find(([action]) => action === "build"),
  ["build", "spc_eris"],
  "the scan-only Eris defense target must be raised while Digsite is incomplete",
);

const adequatelyDefendedDigsite = runFleetCase({
  authority: 103,
  regions: ["spc_eris"],
  maxDefense: 0.01,
  syndicateRatio: 0.49,
  erisTech: 4,
  digsite: 0,
  troopers: 23,
  tanks: 7,
});
assert.equal(
  adequatelyDefendedDigsite.actions.some(([action]) => action === "build"),
  false,
);

const completedDigsite = runFleetCase({
  authority: 103,
  regions: ["spc_eris"],
  maxDefense: 0.01,
  syndicateRatio: 0.02,
  erisTech: 4,
  digsite: 100,
  troopers: 23,
  tanks: 7,
});
assert.equal(
  completedDigsite.actions.some(([action]) => action === "build"),
  false,
  "the progression floor must stop after Digsite completion",
);

console.log("Outer fleet progression and Authority regression tests passed");
