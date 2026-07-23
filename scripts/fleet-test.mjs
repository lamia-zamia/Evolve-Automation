import assert from "node:assert/strict";

import { createFleetAdapter } from "../src/adapters/evolve/combat/fleet.ts";
import { runFleetAutomation } from "../src/application/fleet.ts";
import { planFleet } from "../src/domain/combat/fleet.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

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
  "Fleet domain and validated Evolve adapter/application tests passed",
);
