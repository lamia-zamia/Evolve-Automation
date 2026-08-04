import assert from "node:assert/strict";

import { createHellAdapter } from "../src/adapters/evolve/combat/hell.ts";
import { runHellAutomation } from "../src/application/hell.ts";
import { prepareHellCycle } from "../src/domain/combat/hell.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario = {}) {
  const trace = createTraceRecorder();
  let hellSoldiers = scenario.hellSoldiers ?? 0;
  let hellPatrols = scenario.hellPatrols ?? 0;
  let hellPatrolSize = scenario.hellPatrolSize ?? 1;
  let hellAssigned =
    "hellAssigned" in scenario ? scenario.hellAssigned : hellSoldiers;
  const reserved = scenario.hellReservedSoldiers ?? 0;
  const manager = {
    isGarrisonVisible: scenario.garrisonAvailable !== false,
    isHellVisible: scenario.hellAvailable !== false,
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

console.log("Hell domain and phased Evolve adapter/application tests passed");
