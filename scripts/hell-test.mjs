import assert from "node:assert/strict";

import { createHellAdapter } from "../src/adapters/evolve/combat/hell.ts";
import { runHellAutomation } from "../src/application/hell.ts";
import { prepareHellCycle } from "../src/domain/combat/hell.ts";
import { createAutoHell } from "./test-support/legacy-auto-hell.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario = {}) {
  const trace = createTraceRecorder();
  let hellSoldiers = scenario.hellSoldiers ?? 0;
  let hellPatrols = scenario.hellPatrols ?? 0;
  let hellPatrolSize = scenario.hellPatrolSize ?? 1;
  let hellAssigned =
    "hellAssigned" in scenario ? scenario.hellAssigned : hellSoldiers;
  const reserved = scenario.hellReservedSoldiers ?? 0;
  const manager = {
    _garrisonVue: scenario.garrisonAvailable === false ? null : {},
    _hellVue: scenario.hellAvailable === false ? null : {},
    maxSoldiers: scenario.maximumSoldiers ?? 200,
    currentSoldiers: scenario.currentSoldiers ?? 200,
    currentCityGarrison: scenario.currentCityGarrison ?? 100,
    maxCityGarrison: scenario.maximumCityGarrison ?? 100,
    get hellSoldiers() {
      return hellSoldiers;
    },
    get hellPatrols() {
      return hellPatrols;
    },
    get hellPatrolSize() {
      return hellPatrolSize;
    },
    get hellAssigned() {
      return hellAssigned;
    },
    hellReservedSoldiers: reserved,
    get hellGarrison() {
      return hellSoldiers - hellPatrols * hellPatrolSize - reserved;
    },
    minions: scenario.minions ?? 0,
    enemies: scenario.enemies ?? 0,
    getSoldiersForAttackRating(rating) {
      trace.managerCall("getSoldiersForAttackRating", { rating });
      if (scenario.ratingCalculator) return scenario.ratingCalculator(rating);
      return rating <= 0 ? 0 : Math.ceil(rating / (scenario.soldierPower ?? 1));
    },
    removeHellPatrolSize(count) {
      trace.managerCall("removeHellPatrolSize", { count });
      trace.command("remove-patrol-size", { count });
      hellPatrolSize = Math.max(hellPatrolSize - count, 1);
    },
    removeHellPatrol(count) {
      trace.managerCall("removeHellPatrol", { count });
      trace.command("remove-patrol", { count });
      hellPatrols = Math.max(hellPatrols - count, 0);
    },
    removeHellGarrison(count) {
      trace.managerCall("removeHellGarrison", { count });
      trace.command("remove-garrison", { count });
      const minimum = hellPatrols * hellPatrolSize + reserved;
      hellSoldiers = Math.max(hellSoldiers - count, minimum);
      hellAssigned = hellSoldiers;
    },
    addHellGarrison(count) {
      trace.managerCall("addHellGarrison", { count });
      trace.command("add-garrison", { count });
      hellSoldiers = Math.min(
        hellSoldiers + count,
        scenario.currentSoldiers ?? 200,
      );
      hellAssigned = hellSoldiers;
    },
    addHellPatrolSize(count) {
      trace.managerCall("addHellPatrolSize", { count });
      trace.command("add-patrol-size", { count });
      if (hellPatrolSize < hellSoldiers) {
        hellPatrolSize += count;
        if (hellSoldiers < hellPatrols * hellPatrolSize) {
          hellPatrols = Math.floor(hellSoldiers / hellPatrolSize);
        }
      }
    },
    addHellPatrol(count) {
      trace.managerCall("addHellPatrol", { count });
      trace.command("add-patrol", { count });
      if (hellPatrols * hellPatrolSize < hellSoldiers) {
        hellPatrols += count;
        if (hellSoldiers < hellPatrols * hellPatrolSize) {
          hellPatrols = Math.floor(hellSoldiers / hellPatrolSize);
        }
      }
    },
    attackEnemyFortress(enemyIndex) {
      trace.managerCall("attackEnemyFortress", { enemyIndex });
      trace.command("attack-enemy-fortress", { enemyIndex });
    },
  };
  const game = {
    global: {
      race: {
        warlord: scenario.warlord ?? false,
        grenadier: scenario.grenadier ?? false,
      },
      tech: {
        evil: scenario.evilTechnology ?? 0,
        turret: scenario.turretTechnology ?? 0,
        portal: scenario.portalTechnology ?? 0,
        hdroid: scenario.hellDroidTechnology ?? false,
      },
      portal: {
        fortress: {
          walls: scenario.fortressWalls ?? 100,
          threat: scenario.fortressThreat ?? 1,
        },
        ...(scenario.warDroneCount === undefined
          ? {}
          : { war_drone: { on: scenario.warDroneCount } }),
        ...(scenario.warDroidCount === undefined
          ? {}
          : { war_droid: { on: scenario.warDroidCount } }),
      },
      city:
        scenario.bootCampCount === undefined
          ? {}
          : { boot_camp: { count: scenario.bootCampCount } },
      civic: { govern: { type: scenario.government ?? "democracy" } },
    },
  };
  const settings = {
    warlordHandleFortress: scenario.warlordHandleFortress ?? false,
    warlordMinimumMinions: scenario.warlordMinimumMinions ?? 0,
    hellHomeGarrison: scenario.homeGarrison ?? 100,
    hellMinSoldiers: scenario.minimumHellSoldiers ?? 1,
    hellMinSoldiersPercent: scenario.minimumSoldierPercent ?? 0,
    hellLowWallsMulti: scenario.lowWallsMultiplier ?? 1,
    hellTargetFortressDamage: scenario.targetFortressDamage ?? 100,
    hellHandlePatrolSize: scenario.handlePatrolSize ?? true,
    hellPatrolThreatPercent: scenario.patrolThreatPercent ?? 100,
    hellPatrolDroneMod: scenario.patrolDroneModifier ?? 0,
    hellPatrolDroidMod: scenario.patrolDroidModifier ?? 0,
    hellPatrolBootcampMod: scenario.patrolBootcampModifier ?? 0,
    hellPatrolMinRating: scenario.minimumPatrolRating ?? 1,
    hellBolsterPatrolRating: scenario.bolsterPatrolRating ?? 0,
    hellBolsterPatrolPercentTop: scenario.bolsterPercentTop ?? 0,
    hellBolsterPatrolPercentBottom: scenario.bolsterPercentBottom ?? 0,
    authorityManage: scenario.manageAuthority ?? false,
    generalMinimumAuthority: scenario.minimumAuthority ?? 0,
    generalAuthorityMinPatrolPercent:
      scenario.minimumAuthorityPatrolPercent ?? 0,
  };
  const unlocked = (value) => ({ isUnlocked: () => value });
  const buildings = {
    ElysiumFortress: unlocked(scenario.elysiumFortressUnlocked ?? false),
    ElysiumScout: unlocked(scenario.elysiumScoutUnlocked ?? false),
    PortalTurret: { stateOnCount: scenario.turretCount ?? 0 },
  };
  const resources = {
    Authority: {
      currentQuantity: scenario.authorityCurrent ?? 0,
      maxQuantity: scenario.authorityMaximum ?? 250,
      isUnlocked: () => scenario.authorityUnlocked ?? false,
    },
  };
  let authoritySoldiersAdjustedTick;
  const state = {
    scriptTick: scenario.scriptTick ?? 7,
    get authoritySoldiersAdjustedTick() {
      return authoritySoldiersAdjustedTick;
    },
    set authoritySoldiersAdjustedTick(value) {
      authoritySoldiersAdjustedTick = value;
      trace.stateChange("authority-adjusted-tick", { value });
    },
  };
  const debugWindow = { authorityDebug: scenario.authorityDebug ?? false };
  return {
    trace,
    manager,
    game,
    settings,
    buildings,
    resources,
    state,
    debugWindow,
  };
}

function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const originalLog = console.log;
  console.log = (message) => fixture.trace.log("authority-debug", { message });
  try {
    createAutoHell({
      WarManager: fixture.manager,
      getGame: () => fixture.game,
      getSettings: () => fixture.settings,
      getBuildings: () => fixture.buildings,
      getResources: () => fixture.resources,
      getState: () => fixture.state,
      getWindow: () => fixture.debugWindow,
    })();
  } finally {
    console.log = originalLog;
  }
  return fixture.trace.snapshot();
}

function createModern(fixture, overrides = {}) {
  return createHellAdapter({
    getWarManager: overrides.getWarManager ?? (() => fixture.manager),
    getGame: overrides.getGame ?? (() => fixture.game),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getBuildings: overrides.getBuildings ?? (() => fixture.buildings),
    getResources: overrides.getResources ?? (() => fixture.resources),
    getState: overrides.getState ?? (() => fixture.state),
    getDebugWindow: overrides.getDebugWindow ?? (() => fixture.debugWindow),
    debugLog:
      overrides.debugLog ??
      ((message) => fixture.trace.log("authority-debug", { message })),
  });
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runHellAutomation(createModern(fixture));
  return fixture.trace.snapshot();
}

const scenarios = [
  { name: "garrison panel unavailable", garrisonAvailable: false },
  { name: "Hell panel unavailable", hellAvailable: false },
  { name: "Warlord has no enemy", warlord: true, enemies: 0 },
  {
    name: "Warlord waits for minions",
    warlord: true,
    enemies: 1,
    minions: 5,
    warlordHandleFortress: true,
    warlordMinimumMinions: 5,
  },
  {
    name: "Warlord attacks first fortress",
    warlord: true,
    enemies: 2,
    minions: 6,
    warlordHandleFortress: true,
    warlordMinimumMinions: 5,
  },
  {
    name: "insufficient army leaves Hell",
    maximumSoldiers: 100,
    currentSoldiers: 50,
    minimumSoldierPercent: 90,
    hellSoldiers: 30,
    hellPatrols: 2,
    hellPatrolSize: 10,
  },
  {
    name: "Elysium keeps one hundred home",
    elysiumScoutUnlocked: true,
    homeGarrison: 10,
    maximumSoldiers: 250,
    currentSoldiers: 250,
  },
  {
    name: "defense and patrol targets shrink assignments",
    maximumSoldiers: 200,
    currentSoldiers: 200,
    hellSoldiers: 150,
    hellPatrols: 4,
    hellPatrolSize: 20,
    fortressWalls: 50,
    fortressThreat: 10,
    lowWallsMultiplier: 2,
    targetFortressDamage: 10,
    soldierPower: 5,
  },
  {
    name: "fixed patrol size only adjusts counts",
    handlePatrolSize: false,
    hellSoldiers: 50,
    hellPatrols: 2,
    hellPatrolSize: 20,
    maximumSoldiers: 200,
    currentSoldiers: 200,
  },
  {
    name: "drone droid bootcamp and bolster rating",
    fortressThreat: 100,
    warDroneCount: 2,
    portalTechnology: 7,
    warDroidCount: 3,
    hellDroidTechnology: true,
    bootCampCount: 4,
    patrolDroneModifier: 2,
    patrolDroidModifier: 3,
    patrolBootcampModifier: 4,
    bolsterPatrolRating: 20,
    bolsterPercentTop: 80,
    bolsterPercentBottom: 20,
    currentCityGarrison: 50,
    maximumCityGarrison: 100,
  },
  {
    name: "one and a half patrols split into three",
    maximumSoldiers: 250,
    currentSoldiers: 250,
    homeGarrison: 100,
    ratingCalculator: (rating) => (rating <= 0 ? 0 : 100),
  },
  {
    name: "positive Authority target adjusts stationing and debugs",
    maximumSoldiers: 250,
    currentSoldiers: 250,
    hellSoldiers: 100,
    hellPatrols: 2,
    hellPatrolSize: 40,
    manageAuthority: true,
    minimumAuthority: 100,
    authorityUnlocked: true,
    authorityCurrent: 50,
    evilTechnology: 1,
    grenadier: true,
    government: "autocracy",
    authorityDebug: true,
    soldierPower: 1,
  },
  {
    // A freshly unlocked fortress has no `assigned` property yet; the game only
    // writes it once garrison controls are used. The Hell panel is already
    // available, so the adapter must tolerate the missing value as zero.
    name: "fortress just unlocked has no assigned",
    hellAssigned: undefined,
    hellSoldiers: 0,
    hellPatrols: 0,
    hellPatrolSize: 10,
    maximumSoldiers: 100,
    currentSoldiers: 0,
    minimumSoldierPercent: 90,
  },
  {
    name: "negative Authority target reserves patrol percentage",
    maximumSoldiers: 200,
    currentSoldiers: 200,
    hellSoldiers: 100,
    hellPatrols: 1,
    hellPatrolSize: 100,
    manageAuthority: true,
    minimumAuthority: -1,
    minimumAuthorityPatrolPercent: 40,
    authorityUnlocked: true,
    authorityCurrent: 0,
    authorityMaximum: 250,
    evilTechnology: 1,
    ratingCalculator: (rating) => (rating <= 0 ? 0 : Number.POSITIVE_INFINITY),
  },
];

for (const scenario of scenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `Hell ${scenario.name}`,
  });
}

const unavailableFixture = createFixture({ garrisonAvailable: false });
const unavailable = createModern(unavailableFixture).reader.readCycle();
assert.equal(prepareHellCycle(unavailable), null);
assert.ok(Object.isFrozen(unavailable));

const malformed = createFixture();
malformed.settings.hellHomeGarrison = "many";
assert.throws(
  () => runHellAutomation(createModern(malformed)),
  /settings\.hellHomeGarrison must be a finite number/,
);

const staleFixture = createFixture({
  warlord: true,
  enemies: 1,
  minions: 2,
  warlordHandleFortress: true,
});
let staleManager = staleFixture.manager;
const staleAutomation = createModern(staleFixture, {
  getWarManager: () => staleManager,
});
const staleDecision = prepareHellCycle(staleAutomation.reader.readCycle());
staleManager = {};
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");

console.log(
  `Hell domain, phased Evolve adapter/application, and parity tests passed (${scenarios.length} dual-run scenarios)`,
);
