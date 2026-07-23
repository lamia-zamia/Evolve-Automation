import assert from "node:assert/strict";

import { createOuterFleetAdapter } from "../src/adapters/evolve/combat/fleet-outer.ts";
import { runOuterFleetAutomation } from "../src/application/fleet-outer.ts";
import {
  calculateOuterFleetDefenseTarget,
  planOuterFleetCycle,
} from "../src/domain/combat/fleet-outer.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario = {}) {
  const trace = createTraceRecorder();
  const blueprints = {
    yard: { kind: "yard", class: scenario.yardClass ?? "corvette" },
    explorer: { kind: "explorer", class: "explorer" },
    scout: { kind: "scout", class: scenario.scoutClass ?? "corvette" },
    fighter: { kind: "fighter", class: scenario.fighterClass ?? "corvette" },
  };
  let nextShipMsg = "previous message";
  let nextShipName = "previous name";
  const regions = scenario.regions ?? ["spc_red"];
  const manager = {
    Regions: regions,
    ClassCrew: {
      corvette: scenario.corvetteCrew ?? 2,
      explorer: scenario.explorerCrew ?? 10,
    },
    _explorerBlueprint: blueprints.explorer,
    get nextShipMsg() {
      return nextShipMsg;
    },
    set nextShipMsg(value) {
      nextShipMsg = value;
      trace.stateChange("next-ship-message", { value });
    },
    get nextShipName() {
      return nextShipName;
    },
    set nextShipName(value) {
      nextShipName = value;
      trace.stateChange("next-ship-name", { value });
    },
    initFleet() {
      trace.managerCall("initFleet", {});
      return scenario.initialized ?? true;
    },
    avail(blueprint) {
      return !(scenario.unavailableBlueprints ?? []).includes(blueprint.kind);
    },
    updateNextShip(blueprint) {
      trace.managerCall("updateNextShip", {
        blueprint: blueprint?.kind ?? null,
      });
      trace.command("update-next-ship", {
        blueprint: blueprint?.kind ?? null,
      });
      this.nextShipMsg = null;
      this.nextShipName = null;
    },
    getWeighting(region) {
      return scenario.weightings?.[region] ?? 1;
    },
    getMaxDefense(region) {
      return scenario.maximumDefense?.[region] ?? 0.9;
    },
    getMaxScouts(region) {
      return scenario.maximumScouts?.[region] ?? 0;
    },
    isUnlocked(region) {
      return !(scenario.lockedRegions ?? []).includes(region);
    },
    syndicate(region, extra) {
      return extra
        ? { s: scenario.sensors?.[region] ?? 100 }
        : (scenario.syndicateRatios?.[region] ?? 0.5);
    },
    getScoutBlueprint: () => blueprints.scout,
    getFighterBlueprint: () => blueprints.fighter,
    shipCount(region, blueprint) {
      return scenario.shipCounts?.[`${region}:${blueprint.kind}`] ?? 0;
    },
    getLocName(region) {
      return (
        scenario.locationNames?.[region] ??
        {
          tauceti: "Tau Ceti",
          spc_eris: "Eris",
          spc_red: "Red Planet",
          spc_moon: "Moon",
        }[region] ??
        region
      );
    },
    getShipName(blueprint) {
      return {
        yard: "Yard Ship",
        explorer: "Explorer",
        scout: "Scout",
        fighter: "Fighter",
      }[blueprint.kind];
    },
    getMissingResource() {
      return scenario.missingResource ?? null;
    },
    build(blueprint, region) {
      trace.managerCall("build", { blueprint: blueprint.kind, region });
      trace.command("build-outer-ship", {
        blueprint: blueprint.kind,
        region,
      });
      return scenario.buildSuccess ?? true;
    },
  };
  const game = {
    global: {
      race: {
        universe: scenario.universe ?? "evil",
        grenadier: scenario.grenadier ?? false,
      },
      tech: {
        tauceti: scenario.tauTechnology ?? 0,
        eris: scenario.erisTechnology ?? 2,
      },
      space: {
        shipyard: { blueprint: blueprints.yard },
        ...(scenario.digsite === undefined
          ? {}
          : {
              digsite: { count: scenario.digsite },
              shock_trooper: { on: scenario.troopers ?? 0 },
              tank: { on: scenario.tanks ?? 0 },
            }),
      },
    },
  };
  const settings = {
    fleetOuterShips: scenario.mode ?? "custom",
    fleetOuterCrew: scenario.minimumCrew ?? 30,
    fleetExploreTau: scenario.exploreTau ?? false,
    authorityManage: scenario.authorityManage ?? false,
    generalMinimumAuthority: scenario.authorityTarget ?? 100,
  };
  const resources = {
    Authority: {
      currentQuantity: scenario.authority ?? 100,
      maxQuantity: scenario.authorityMaximum ?? 100,
      isUnlocked: () => scenario.authorityUnlocked ?? true,
    },
    Eris_Support: { currentQuantity: scenario.erisSupport ?? 0 },
    Adamantite: { name: "Adamantite" },
  };
  const warManager = {
    currentCityGarrison: scenario.currentCityGarrison ?? 100,
  };
  const traitVal = (trait, index, fallback) => {
    if (trait === "high_pop" && index === 0) {
      return scenario.highPopulationMultiplier ?? 1;
    }
    if (trait === "high_pop" && index === 1) {
      return scenario.highPopulationPercent ?? 100;
    }
    return fallback;
  };
  const assessAuthorityRemoval = (removedSoldiers) => {
    if (scenario.authorityUnavailable) {
      return { status: "unavailable", reason: "invalid-resource" };
    }
    const target =
      settings.generalMinimumAuthority < 0
        ? resources.Authority.maxQuantity
        : settings.generalMinimumAuthority;
    const predicted = Math.floor(
      resources.Authority.currentQuantity -
        ((removedSoldiers * 0.7 * (scenario.highPopulationPercent ?? 100)) /
          100) *
          (scenario.grenadier ? 1.75 : 1),
    );
    return {
      status: "ready",
      target,
      predicted,
      blocksRemoval: predicted < target,
    };
  };
  const GameLog = {
    logSuccess(id, message, categories) {
      trace.managerCall("logSuccess", { id });
      trace.log(id, { message, categories });
    },
  };
  return {
    trace,
    manager,
    warManager,
    game,
    settings,
    resources,
    traitVal,
    assessAuthorityRemoval,
    GameLog,
  };
}

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const m = fixture.manager;
  const WarManager = fixture.warManager;
  const game = fixture.game;
  const settings = fixture.settings;
  const resources = fixture.resources;
  if (!m.initFleet()) {
    m.nextShipMsg = "No ships needed yet";
    m.updateNextShip();
    return fixture.trace.snapshot();
  }
  if (settings.fleetOuterShips === "none") {
    m.updateNextShip();
    m.nextShipMsg = "Ship construction is disabled";
    return fixture.trace.snapshot();
  }
  const yard = game.global.space.shipyard;
  if (settings.fleetOuterShips === "manual") {
    m.updateNextShip(m.avail(yard.blueprint) ? yard.blueprint : null);
    m.nextShipMsg = "Ships managed manually";
    return fixture.trace.snapshot();
  }
  let targetRegion;
  let newShip = null;
  let minCrew = settings.fleetOuterCrew;
  const getDefenseTarget = (region) => {
    const target = m.getMaxDefense(region);
    if (
      region !== "spc_eris" ||
      game.global.space.digsite?.count === undefined ||
      game.global.space.digsite.count >= 100
    ) {
      return target;
    }
    const requestedTroopers = game.global.space.shock_trooper?.on ?? 0;
    const requestedTanks = game.global.space.tank?.on ?? 0;
    const requestedUnits = requestedTroopers + requestedTanks;
    const reportedSupport = resources.Eris_Support?.currentQuantity;
    const supportedUnits = Number.isFinite(reportedSupport)
      ? Math.min(requestedUnits, reportedSupport)
      : requestedUnits;
    const activeTroopers = Math.min(requestedTroopers, supportedUnits);
    const activeTanks = Math.min(
      requestedTanks,
      Math.max(0, supportedUnits - activeTroopers),
    );
    const conservativeGroundPower = activeTroopers + activeTanks * 100;
    const digsiteDefense =
      conservativeGroundPower > 0
        ? Math.min(0.9, 350 / conservativeGroundPower)
        : 0.5;
    return Math.max(target, digsiteDefense);
  };
  if (
    settings.fleetExploreTau &&
    game.global.tech.tauceti === 1 &&
    m.avail(m._explorerBlueprint) &&
    m.shipCount("tauceti", m._explorerBlueprint) < 1
  ) {
    targetRegion = "tauceti";
    newShip = m._explorerBlueprint;
    minCrew = 0;
  } else {
    const scanEris =
      game.global.tech.eris === 1 &&
      m.getWeighting("spc_eris") > 0 &&
      m.syndicate("spc_eris", true, true).s < 50;
    if (scanEris) {
      targetRegion = "spc_eris";
      minCrew = 0;
    } else {
      const regionsToProtect = m.Regions.filter(
        (region) =>
          m.isUnlocked(region) &&
          m.getWeighting(region) > 0 &&
          m.syndicate(region, false, true) < getDefenseTarget(region),
      ).sort(
        (left, right) =>
          (1 - m.syndicate(right, false, true)) * m.getWeighting(right) -
          (1 - m.syndicate(left, false, true)) * m.getWeighting(left),
      );
      if (regionsToProtect.length < 1) {
        m.updateNextShip();
        m.nextShipMsg = "No more ships currently needed";
        return fixture.trace.snapshot();
      }
      targetRegion = regionsToProtect[0];
    }
    if (settings.fleetOuterShips === "user") {
      newShip = m.avail(yard.blueprint) ? yard.blueprint : null;
    } else {
      const scout = m.getScoutBlueprint();
      if (
        m.avail(scout) &&
        m.shipCount(targetRegion, scout) < m.getMaxScouts(targetRegion)
      ) {
        newShip = scout;
      }
      if (!newShip) {
        const fighter = m.getFighterBlueprint();
        newShip = m.avail(fighter) ? fighter : null;
      }
    }
  }
  if (!newShip) {
    m.updateNextShip();
    m.nextShipMsg = `No suitable blueprint for ship to ${m.getLocName(targetRegion)}`;
    return fixture.trace.snapshot();
  }
  m.updateNextShip(newShip);
  m.nextShipName = `${m.getShipName(newShip)} to ${m.getLocName(targetRegion)}`;
  const baseCrew = game.global.race.grenadier
    ? {
        corvette: 1,
        frigate: 2,
        destroyer: 3,
        cruiser: 4,
        battlecruiser: 5,
        dreadnought: 6,
        explorer: 6,
      }[newShip.class]
    : m.ClassCrew[newShip.class];
  const shipCrew = baseCrew * fixture.traitVal("high_pop", 0, 1);
  if (
    settings.authorityManage &&
    settings.generalMinimumAuthority !== 0 &&
    game.global.race.universe === "evil" &&
    resources.Authority.isUnlocked()
  ) {
    const assessment = fixture.assessAuthorityRemoval(shipCrew);
    if (assessment.status === "unavailable") {
      m.nextShipMsg = "Authority data unavailable; ship construction paused";
      return fixture.trace.snapshot();
    }
    if (assessment.status === "ready" && assessment.blocksRemoval) {
      m.nextShipMsg = `Next ship(${m.nextShipName}) would lower Authority to ${assessment.predicted}, below the ${assessment.target} target`;
      return fixture.trace.snapshot();
    }
  }
  const missing = m.getMissingResource(newShip);
  if (missing) {
    m.nextShipMsg = `Next ship(${m.nextShipName}) is missing ${resources[missing].name}`;
    return fixture.trace.snapshot();
  }
  if (WarManager.currentCityGarrison - shipCrew < minCrew) {
    m.nextShipMsg = `Next ship(${m.nextShipName}) is missing crew`;
    return fixture.trace.snapshot();
  }
  if (m.build(newShip, targetRegion)) {
    fixture.GameLog.logSuccess(
      "outer_fleet",
      `${m.getShipName(newShip)} has been assembled, and dispatched to ${m.getLocName(targetRegion)}.`,
      ["combat"],
    );
  } else {
    m.nextShipMsg = `Invalid design! Next ship(${m.nextShipName}) is missing power`;
  }
  return fixture.trace.snapshot();
}

function createAutomation(fixture, overrides = {}) {
  return createOuterFleetAdapter({
    getFleetManagerOuter:
      overrides.getFleetManagerOuter ?? (() => fixture.manager),
    getWarManager: overrides.getWarManager ?? (() => fixture.warManager),
    getGame: overrides.getGame ?? (() => fixture.game),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getResources: overrides.getResources ?? (() => fixture.resources),
    traitVal: overrides.traitVal ?? fixture.traitVal,
    assessAuthorityRemoval:
      overrides.assessAuthorityRemoval ?? fixture.assessAuthorityRemoval,
    getGameLog: overrides.getGameLog ?? (() => fixture.GameLog),
  });
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runOuterFleetAutomation(createAutomation(fixture));
  return fixture.trace.snapshot();
}

const dualRunScenarios = [
  { name: "fleet unavailable", initialized: false },
  { name: "construction disabled", mode: "none" },
  { name: "manual available blueprint", mode: "manual" },
  {
    name: "manual unavailable blueprint",
    mode: "manual",
    unavailableBlueprints: ["yard"],
  },
  {
    name: "Tau explorer priority",
    exploreTau: true,
    tauTechnology: 1,
    currentCityGarrison: 6,
    minimumCrew: 30,
  },
  {
    name: "Eris scan priority",
    erisTechnology: 1,
    sensors: { spc_eris: 49 },
    currentCityGarrison: 2,
    minimumCrew: 30,
  },
  {
    name: "no region needs protection",
    syndicateRatios: { spc_red: 0.95 },
    maximumDefense: { spc_red: 0.9 },
  },
  {
    name: "stable weighted region ordering",
    regions: ["spc_red", "spc_moon"],
    weightings: { spc_red: 2, spc_moon: 1 },
    syndicateRatios: { spc_red: 0.5, spc_moon: 0.2 },
  },
  { name: "user blueprint", mode: "user" },
  {
    name: "scout below configured cap",
    maximumScouts: { spc_red: 1 },
  },
  {
    name: "fighter after scout cap",
    maximumScouts: { spc_red: 1 },
    shipCounts: { "spc_red:scout": 1 },
  },
  {
    name: "no suitable blueprint",
    unavailableBlueprints: ["scout", "fighter"],
  },
  {
    name: "Authority data unavailable",
    authorityManage: true,
    authorityUnavailable: true,
  },
  {
    name: "Authority blocks crew removal",
    authorityManage: true,
    authority: 100,
    authorityTarget: 100,
  },
  {
    name: "Authority surplus permits build",
    authorityManage: true,
    authority: 103,
    authorityTarget: 100,
  },
  { name: "missing construction resource", missingResource: "Adamantite" },
  {
    name: "missing crew",
    currentCityGarrison: 31,
    minimumCrew: 30,
  },
  { name: "invalid powered design", buildSuccess: false },
  {
    name: "grenadier crew schedule",
    grenadier: true,
    currentCityGarrison: 31,
    minimumCrew: 30,
  },
  {
    name: "incomplete Digsite raises Eris defense",
    regions: ["spc_eris"],
    erisTechnology: 4,
    maximumDefense: { spc_eris: 0.01 },
    syndicateRatios: { spc_eris: 0.47 },
    digsite: 0,
    troopers: 23,
    tanks: 7,
    erisSupport: 30,
  },
  {
    name: "adequately defended incomplete Digsite",
    regions: ["spc_eris"],
    erisTechnology: 4,
    maximumDefense: { spc_eris: 0.01 },
    syndicateRatios: { spc_eris: 0.49 },
    digsite: 0,
    troopers: 23,
    tanks: 7,
    erisSupport: 30,
  },
  {
    name: "completed Digsite removes defense floor",
    regions: ["spc_eris"],
    erisTechnology: 4,
    maximumDefense: { spc_eris: 0.01 },
    syndicateRatios: { spc_eris: 0.02 },
    digsite: 100,
    troopers: 23,
    tanks: 7,
    erisSupport: 30,
  },
];

for (const scenario of dualRunScenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `outer fleet ${scenario.name}`,
  });
}

assert.deepEqual(
  planOuterFleetCycle({
    initialized: false,
    mode: "none",
    manualBlueprintAvailable: false,
    configuredMinimumCrew: 0,
  }),
  {
    kind: "outer-fleet-status",
    blueprint: null,
    nextShipName: null,
    messageBeforeUpdate: "No ships needed yet",
    messageAfterUpdate: null,
  },
);
assert.equal(
  calculateOuterFleetDefenseTarget({
    id: "spc_eris",
    unlocked: true,
    weighting: 1,
    syndicateRatio: 0.47,
    maximumDefense: 0.01,
    digsiteIncomplete: true,
    requestedTroopers: 23,
    requestedTanks: 7,
    reportedSupport: 30,
  }),
  350 / 723,
);

const malformed = createFixture({ mode: "none" });
malformed.settings.fleetOuterShips = 1;
assert.throws(
  () => runOuterFleetAutomation(createAutomation(malformed)),
  /settings\.fleetOuterShips must be a string/,
);

const stale = createFixture({ mode: "none" });
let currentManager = stale.manager;
const staleAutomation = createAutomation(stale, {
  getFleetManagerOuter: () => currentManager,
});
const staleDecision = planOuterFleetCycle(staleAutomation.reader.readCycle());
currentManager = { ...stale.manager };
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");

console.log(
  `Outer fleet domain, phased Evolve adapter/application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
