import assert from "node:assert/strict";

import { createFleetAdapter } from "../src/adapters/evolve/combat/fleet.ts";
import { runFleetAutomation } from "../src/application/fleet.ts";
import { planFleet } from "../src/domain/combat/fleet.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

const SHIPS = [
  "scout_ship",
  "corvette_ship",
  "frigate_ship",
  "cruiser_ship",
  "dreadnought",
];
const BUILDINGS = [
  "ScoutShip",
  "CorvetteShip",
  "FrigateShip",
  "CruiserShip",
  "Dreadnought",
];
const REGIONS = [
  "gxy_stargate",
  "gxy_gateway",
  "gxy_gorddon",
  "gxy_alien1",
  "gxy_alien2",
  "gxy_chthonian",
];

function emptyAssignment() {
  return Object.fromEntries(SHIPS.map((ship) => [ship, 0]));
}

function cartesian(...sets) {
  return sets.reduce(
    (products, set) =>
      products.flatMap((product) => set.map((value) => [...product, value])),
    [[]],
  );
}

function createFixture(scenario = {}) {
  const trace = createTraceRecorder();
  const defense = Object.fromEntries(
    REGIONS.map((region) => [region, emptyAssignment()]),
  );
  for (const [key, count] of Object.entries(scenario.assignments ?? {})) {
    const [region, ship] = key.split(":");
    defense[region][ship] = count;
  }
  const counts = scenario.builtCounts ?? {};
  const powers = scenario.powers ?? [10, 25, 100, 250, 1000];
  const mission = (name, unlocked) => ({
    isUnlocked: () => unlocked,
    click() {
      trace.managerCall(`${name}.click`, {});
      trace.command("launch-mission", { mission: name });
    },
  });
  const buildings = Object.fromEntries(
    BUILDINGS.map((name, index) => [
      name,
      { count: counts[SHIPS[index]] ?? 0 },
    ]),
  );
  buildings.ChthonianMission = mission(
    "chthonian",
    scenario.chthonianUnlocked ?? false,
  );
  buildings.Alien2Mission = mission("alien2", scenario.alien2Unlocked ?? false);
  buildings.GorddonSymposium = {
    stateOnCount: scenario.symposiumActive ? 1 : 0,
  };
  const game = {
    global: {
      galaxy: { defense },
      race: { instinct: scenario.instinct ?? false },
    },
    actions: {
      galaxy: {
        gxy_gateway: Object.fromEntries(
          SHIPS.map((ship, index) => [
            ship,
            { ship: { rating: () => powers[index] } },
          ]),
        ),
      },
    },
  };
  const settings = {
    fleetChthonianLoses: scenario.chthonianLossMode ?? "ignore",
    fleetAlien2Knowledge: scenario.alien2KnowledgeRequired ?? 100,
    fleetAlien2Loses: scenario.alien2LossMode ?? "safe",
    fleetCrewReclaim: scenario.crewReclaim ?? false,
    fleetMaxCover: scenario.maximumCoverage ?? true,
  };
  REGIONS.forEach((region, index) => {
    settings[`fleet_pr_${region}`] = scenario.priorities?.[region] ?? index;
  });
  const resources = {
    Knowledge: {
      maxQuantity: scenario.knowledgeMaximum ?? 1_000,
    },
  };
  const regionViews = REGIONS.map((name) => ({
    name,
    useful: (scenario.usefulRegions ?? []).includes(name),
    piracy: scenario.piracy?.[name] ?? 100,
    armada: scenario.armada?.[name] ?? 0,
  }));
  let neededShips = scenario.initialNeededShips ?? { stale: 1 };
  const manager = {
    initFleet: () => scenario.available ?? true,
    get neededShips() {
      return neededShips;
    },
    set neededShips(value) {
      neededShips = value;
      trace.stateChange("needed-ships", { value });
    },
    addShip(region, ship, count) {
      trace.managerCall("addShip", { region, ship, count });
      trace.command("add-ship", { region, ship, count });
    },
    subShip(region, ship, count) {
      trace.managerCall("subShip", { region, ship, count });
      trace.command("remove-ship", { region, ship, count });
    },
  };
  return {
    trace,
    defense,
    buildings,
    game,
    settings,
    resources,
    regionViews,
    manager,
    guardActive: (guard) =>
      guard === "guardDreaded" && Boolean(scenario.dreadedGuard),
    galaxyAssaultPending: () => scenario.assaultPending ?? false,
  };
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const FleetManager = fixture.manager;
  const game = fixture.game;
  const settings = fixture.settings;
  const resources = fixture.resources;
  const buildings = fixture.buildings;
  if (!FleetManager.initFleet()) return fixture.trace.snapshot();
  const def = game.global.galaxy.defense;
  const allRegions = fixture.regionViews;
  const allFleets = SHIPS.map((name, index) => ({
    name,
    building: buildings[BUILDINGS[index]],
    count: 0,
    power: game.actions.galaxy.gxy_gateway[name].ship.rating(),
  }));
  const minPower = allFleets[0].power;
  const fleetIndex = Object.fromEntries(
    allFleets.map((ship, index) => [ship.name, index]),
  );
  Object.values(def).forEach((assigned) =>
    Object.entries(assigned).forEach(([ship, count]) => {
      allFleets[fleetIndex[ship]].count += Math.floor(count);
    }),
  );

  let assault = null;
  if (
    buildings.ChthonianMission.isUnlocked() &&
    settings.fleetChthonianLoses !== "ignore"
  ) {
    const chthonianLoses =
      settings.fleetChthonianLoses === "dread" &&
      fixture.guardActive("guardDreaded")
        ? "high"
        : settings.fleetChthonianLoses;
    let fleetReq;
    let fleetWreck;
    if (chthonianLoses === "low") {
      fleetReq = 4500;
      fleetWreck = 80;
    } else if (chthonianLoses === "avg") {
      fleetReq = 2500;
      fleetWreck = 160;
    } else if (chthonianLoses === "high") {
      fleetReq = 1250;
      fleetWreck = 500;
    } else if (chthonianLoses === "dread") {
      if (allFleets[4].count > 0) {
        assault = {
          ships: [0, 0, 0, 0, 1],
          region: "gxy_chthonian",
          mission: buildings.ChthonianMission,
        };
      }
    } else if (chthonianLoses === "frigate") {
      const totalPower = allFleets.reduce(
        (sum, ship) =>
          sum +
          (ship.power >= allFleets[2].power ? ship.power * ship.count : 0),
        0,
      );
      if (totalPower >= 4500) {
        assault = {
          ships: allFleets.map((ship, index) => (index >= 2 ? ship.count : 0)),
          region: "gxy_chthonian",
          mission: buildings.ChthonianMission,
        };
      }
    }
    if (game.global.race.instinct) fleetWreck /= 2;
    const availableShips = allFleets.map((ship) => ship.count);
    let powerToReserve = fleetReq - fleetWreck;
    for (
      let index = availableShips.length - 1;
      index >= 0 && powerToReserve > 0;
      index--
    ) {
      const reservedShips = Math.min(
        availableShips[index],
        Math.ceil(powerToReserve / allFleets[index].power),
      );
      availableShips[index] -= reservedShips;
      powerToReserve -= reservedShips * allFleets[index].power;
    }
    if (powerToReserve <= 0) {
      const sets = availableShips.map((amount, index) => [
        ...Array(
          Math.min(
            amount,
            Math.floor(
              (fleetWreck + (minPower - 0.1)) / allFleets[index].power,
            ),
          ) + 1,
        ).keys(),
      ]);
      for (const set of cartesian(...sets)) {
        const powerMissing =
          fleetWreck -
          set.reduce(
            (sum, amount, index) => sum + amount * allFleets[index].power,
            0,
          );
        if (powerMissing <= 0 && powerMissing > minPower * -1) {
          const lastShip = set.reduce(
            (previous, value, current) => (value > 0 ? current : previous),
            0,
          );
          assault = {
            ships: allFleets.map((ship, index) =>
              index >= lastShip ? ship.count : set[index],
            ),
            region: "gxy_chthonian",
            mission: buildings.ChthonianMission,
          };
          break;
        }
      }
    }
  } else if (
    buildings.Alien2Mission.isUnlocked() &&
    resources.Knowledge.maxQuantity >= settings.fleetAlien2Knowledge
  ) {
    const totalPower = allFleets.reduce(
      (sum, ship) => sum + ship.power * ship.count,
      0,
    );
    const doAssault =
      settings.fleetAlien2Loses === "suicide"
        ? totalPower >= 400
        : totalPower >= 650;
    if (doAssault) {
      assault = {
        ships: allFleets.map((ship) => ship.count),
        region: "gxy_alien2",
        mission: buildings.Alien2Mission,
      };
    }
  }
  if (assault) {
    Object.entries(def).forEach(([region, assigned]) =>
      Object.entries(assigned).forEach(([ship, count]) =>
        FleetManager.subShip(region, ship, count),
      ),
    );
    allFleets.forEach((ship, index) =>
      FleetManager.addShip(assault.region, ship.name, assault.ships[index]),
    );
    assault.mission.click();
    return fixture.trace.snapshot();
  }

  const reclaimCrew =
    settings.fleetCrewReclaim && !fixture.galaxyAssaultPending();
  FleetManager.neededShips = null;
  if (reclaimCrew) {
    allFleets.forEach((ship) => {
      ship.count = ship.building.count;
    });
  }
  const regionsToProtect = allRegions.filter(
    (region) => region.useful && region.piracy - region.armada > 0,
  );
  allRegions.forEach((region) => {
    region.priority = settings[`fleet_pr_${region.name}`];
    region.assigned = emptyAssignment();
  });
  const missingDef = regionsToProtect.map(
    (region) => region.piracy - region.armada,
  );
  for (let index = allFleets.length - 1; index >= 0; index--) {
    const ship = allFleets[index];
    const maxAllocate = missingDef.reduce(
      (sum, defense) => sum + Math.floor(defense / ship.power),
      0,
    );
    if (ship.count > maxAllocate) {
      if (ship.count >= maxAllocate + missingDef.length) {
        ship.cover = 0;
      } else {
        const overflows = missingDef
          .map((defense) => defense % ship.power)
          .sort((left, right) => right - left);
        ship.cover = overflows[ship.count - maxAllocate - 1];
      }
    } else {
      ship.cover = ship.power - (minPower - 0.1);
    }
    if (ship.count >= maxAllocate) {
      missingDef.forEach((defense, idx, values) => {
        values[idx] = defense % ship.power;
      });
      if (ship.count > maxAllocate) {
        missingDef.sort((left, right) => right - left);
        for (let j = 0; j < ship.count - maxAllocate; j++) missingDef[j] = 0;
      }
    }
  }
  for (const ship of allFleets) {
    if (ship.count > 0) {
      ship.cover = 0.1;
      break;
    }
  }
  const priorityList = regionsToProtect.sort(
    (left, right) => left.priority - right.priority,
  );
  for (const region of priorityList) {
    let missing = region.piracy - region.armada;
    for (let index = allFleets.length - 1; index >= 0 && missing > 0; index--) {
      const ship = allFleets[index];
      if (ship.cover <= missing) {
        let amount = Math.min(ship.count, Math.floor(missing / ship.power));
        if (
          amount < ship.count &&
          amount * ship.power + ship.cover <= missing
        ) {
          amount++;
        }
        region.assigned[ship.name] += amount;
        ship.count -= amount;
        missing -= amount * ship.power;
      }
    }
    if (settings.fleetMaxCover && missing > 0) {
      let index = -1;
      while (missing > 0 && ++index < allFleets.length) {
        const ship = allFleets[index];
        if (ship.count > 0) {
          const amount = Math.min(ship.count, Math.ceil(missing / ship.power));
          region.assigned[ship.name] += amount;
          ship.count -= amount;
          missing -= amount * ship.power;
        }
      }
      if (missing > 0) break;
      while (--index >= 0) {
        const ship = allFleets[index];
        if (region.assigned[ship.name] > 0 && missing + ship.power <= 0) {
          const useless = Math.min(
            region.assigned[ship.name],
            Math.floor((missing / ship.power) * -1),
          );
          if (useless > 0) {
            region.assigned[ship.name] -= useless;
            ship.count += useless;
            missing += useless * ship.power;
          }
        }
      }
    }
  }
  if (reclaimCrew) {
    FleetManager.neededShips = Object.fromEntries(
      allFleets.map((ship) => [ship.name, ship.building.count - ship.count]),
    );
  } else if (buildings.GorddonSymposium.stateOnCount > 0) {
    allFleets.forEach((ship) => {
      allRegions[2].assigned[ship.name] += ship.count;
    });
  }
  const deltas = allRegions.map((region) =>
    Object.entries(region.assigned).map(([ship, count]) => [
      ship,
      count - def[region.name][ship],
    ]),
  );
  deltas.forEach((ships, region) =>
    ships.forEach(([ship, delta]) => {
      if (delta < 0) {
        FleetManager.subShip(allRegions[region].name, ship, delta * -1);
      }
    }),
  );
  deltas.forEach((ships, region) =>
    ships.forEach(([ship, delta]) => {
      if (delta > 0) {
        FleetManager.addShip(allRegions[region].name, ship, delta);
      }
    }),
  );
  return fixture.trace.snapshot();
}

function createAutomation(fixture, overrides = {}) {
  return createFleetAdapter({
    getFleetManager: overrides.getFleetManager ?? (() => fixture.manager),
    getGame: overrides.getGame ?? (() => fixture.game),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getResources: overrides.getResources ?? (() => fixture.resources),
    getBuildings: overrides.getBuildings ?? (() => fixture.buildings),
    getGalaxyRegions: overrides.getGalaxyRegions ?? (() => fixture.regionViews),
    guardActive: overrides.guardActive ?? fixture.guardActive,
    galaxyAssaultPending:
      overrides.galaxyAssaultPending ?? fixture.galaxyAssaultPending,
  });
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runFleetAutomation(createAutomation(fixture));
  return fixture.trace.snapshot();
}

const scenarios = [
  { name: "fleet unavailable", available: false },
  {
    name: "crew reclaim removes unneeded assignment",
    crewReclaim: true,
    assignments: { "gxy_gateway:scout_ship": 1 },
    builtCounts: { scout_ship: 1 },
  },
  {
    name: "crew reclaim assigns demanded ship",
    crewReclaim: true,
    usefulRegions: ["gxy_gateway"],
    builtCounts: { scout_ship: 1 },
  },
  {
    name: "pending assault disables crew reclaim",
    crewReclaim: true,
    assaultPending: true,
    assignments: { "gxy_gateway:scout_ship": 1 },
    builtCounts: { scout_ship: 2 },
    usefulRegions: ["gxy_gateway"],
  },
  {
    name: "Symposium receives surplus ships",
    symposiumActive: true,
    assignments: { "gxy_gateway:scout_ship": 2 },
  },
  {
    name: "region priority controls scarce assignment",
    assignments: { "gxy_gateway:scout_ship": 1 },
    usefulRegions: ["gxy_gateway", "gxy_alien1"],
    priorities: { gxy_gateway: 10, gxy_alien1: 1 },
  },
  {
    name: "wasteful maximum coverage fills a gap",
    assignments: { "gxy_gateway:corvette_ship": 1 },
    usefulRegions: ["gxy_gateway"],
    piracy: { gxy_gateway: 10 },
    maximumCoverage: true,
  },
  {
    name: "strict coverage leaves an oversized ship unused",
    assignments: { "gxy_gateway:corvette_ship": 1 },
    usefulRegions: ["gxy_gateway"],
    piracy: { gxy_gateway: 10 },
    maximumCoverage: false,
  },
  {
    name: "single dreadnought Chthonian assault",
    chthonianUnlocked: true,
    chthonianLossMode: "dread",
    assignments: { "gxy_gateway:dreadnought": 1 },
  },
  {
    name: "frigate-class Chthonian assault",
    chthonianUnlocked: true,
    chthonianLossMode: "frigate",
    assignments: { "gxy_gateway:frigate_ship": 45 },
  },
  {
    name: "low-loss Chthonian exact wreck team",
    chthonianUnlocked: true,
    chthonianLossMode: "low",
    assignments: {
      "gxy_gateway:dreadnought": 5,
      "gxy_gateway:scout_ship": 8,
    },
  },
  {
    name: "Dreaded guard suppresses direct dread sacrifice",
    chthonianUnlocked: true,
    chthonianLossMode: "dread",
    dreadedGuard: true,
    assignments: { "gxy_gateway:dreadnought": 1 },
  },
  {
    name: "Alien-2 suicide threshold assault",
    alien2Unlocked: true,
    alien2LossMode: "suicide",
    assignments: { "gxy_gateway:frigate_ship": 4 },
  },
  {
    name: "Alien-2 safe threshold waits",
    alien2Unlocked: true,
    alien2LossMode: "safe",
    assignments: { "gxy_gateway:frigate_ship": 6 },
  },
  {
    name: "Alien-2 locked by Knowledge capacity",
    alien2Unlocked: true,
    knowledgeMaximum: 99,
    alien2KnowledgeRequired: 100,
    assignments: { "gxy_gateway:dreadnought": 1 },
  },
];

for (const scenario of scenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `fleet ${scenario.name}`,
  });
}

const immutableFixture = createFixture({ available: false });
const unavailable = createAutomation(immutableFixture).reader.read();
assert.equal(planFleet(unavailable), null);
assert.ok(Object.isFrozen(unavailable));

const malformed = createFixture();
malformed.settings.fleetCrewReclaim = "yes";
assert.throws(
  () => runFleetAutomation(createAutomation(malformed)),
  /settings\.fleetCrewReclaim must be a boolean/,
);

const stale = createFixture({
  crewReclaim: true,
  builtCounts: { scout_ship: 1 },
});
const staleAutomation = createAutomation(stale);
const staleInput = staleAutomation.reader.read();
const staleDecision = planFleet(staleInput);
stale.game.global.galaxy.defense = structuredClone(stale.defense);
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");

console.log(
  `Fleet domain, validated Evolve adapter/application, and parity tests passed (${scenarios.length} dual-run scenarios)`,
);
