import assert from "node:assert/strict";

import { createAutoFleetOuter } from "../src/automation/combat/fleet-outer.ts";

function runFleetCase({
  authority = 100,
  authorityTarget = 100,
  authorityMax = 100,
  race = {},
  trait = () => undefined,
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
    Regions: ["spc_red"],
    ClassCrew: { corvette: 2 },
    initFleet: () => true,
    getWeighting: () => 1,
    getMaxDefense: () => 0.9,
    getMaxScouts: () => 0,
    isUnlocked: () => true,
    syndicate: (_region, extra) => (extra ? { s: 100 } : 0.5),
    getScoutBlueprint: () => fighter,
    getFighterBlueprint: () => fighter,
    shipCount: () => 0,
    avail: () => true,
    updateNextShip: (ship) => actions.push(["next", ship]),
    getShipName: () => "Corvette",
    getLocName: () => "Red Planet",
    getMissingResource: () => null,
    build: () => {
      actions.push(["build"]);
      return true;
    },
  };
  const game = {
    global: {
      race: { universe: "evil", truepath: true, ...race },
      tech: { evil: 0, eris: 2 },
      civic: { govern: { type: "federation" } },
      space: { shipyard: { blueprint: fighter } },
    },
  };
  const settings = {
    fleetOuterShips: "custom",
    fleetOuterCrew: 30,
    fleetExploreTau: false,
    generalMinimumAuthority: authorityTarget,
  };
  const resources = {
    Authority: {
      currentQuantity: authority,
      maxQuantity: authorityMax,
      isUnlocked: () => true,
    },
  };
  const autoFleetOuter = createAutoFleetOuter({
    getFleetManagerOuter: () => manager,
    getWarManager: () => ({ currentCityGarrison: 100 }),
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    traitVal: (id, index, fallback) => trait(id, index) ?? fallback,
    getAuthorityTarget: () =>
      authorityTarget === 0
        ? null
        : authorityTarget < 0
          ? authorityMax
          : authorityTarget,
    getPredictedAuthorityAfterRemovingSoldiers: (removed) => {
      const perSoldier =
        0.7 *
        ((trait("high_pop", 1) ?? 100) / 100) *
        (race.grenadier ? 1.75 : 1);
      return Math.floor(authority - removed * perSoldier);
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

console.log("Outer fleet Authority guard regression tests passed");
