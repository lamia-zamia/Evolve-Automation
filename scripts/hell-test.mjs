import assert from "node:assert/strict";

import { createAutoHell } from "../src/automation/combat/hell.ts";

function zeroAuthorityManager() {
  return {
    _garrisonVue: {},
    _hellVue: {},
    maxSoldiers: 200,
    currentSoldiers: 200,
    currentCityGarrison: 100,
    maxCityGarrison: 100,
    hellSoldiers: 100,
    hellPatrols: 1,
    hellPatrolSize: 100,
    hellAssigned: 100,
    hellReservedSoldiers: 0,
    minions: 0,
    enemies: 0,

    get hellGarrison() {
      return (
        this.hellSoldiers -
        this.hellPatrols * this.hellPatrolSize -
        this.hellReservedSoldiers
      );
    },

    getSoldiersForAttackRating(rating) {
      return rating <= 0 ? 0 : Number.POSITIVE_INFINITY;
    },
    removeHellPatrolSize(count) {
      this.hellPatrolSize = Math.max(1, this.hellPatrolSize - count);
    },
    addHellPatrolSize(count) {
      this.hellPatrolSize += count;
    },
    removeHellPatrol(count) {
      this.hellPatrols = Math.max(0, this.hellPatrols - count);
    },
    addHellPatrol(count) {
      this.hellPatrols += count;
    },
    removeHellGarrison(count) {
      this.hellSoldiers -= count;
    },
    addHellGarrison(count) {
      this.hellSoldiers += count;
    },
    attackEnemyFortress() {
      throw new Error("Non-Warlord test must not attack an enemy fortress");
    },
  };
}

const manager = zeroAuthorityManager();
const game = {
  global: {
    race: { warlord: false, grenadier: false },
    tech: { evil: 1, turret: 0, portal: 0 },
    portal: { fortress: { walls: 100, threat: 1 } },
    city: {},
    civic: { govern: { type: "democracy" } },
  },
};
const settings = {
  warlordHandleFortress: false,
  warlordMinimumMinions: 0,
  hellHomeGarrison: 100,
  hellMinSoldiers: 1,
  hellMinSoldiersPercent: 0,
  hellLowWallsMulti: 1,
  hellTargetFortressDamage: 100,
  hellHandlePatrolSize: true,
  hellPatrolThreatPercent: 100,
  hellPatrolDroneMod: 0,
  hellPatrolDroidMod: 0,
  hellPatrolBootcampMod: 0,
  hellPatrolMinRating: 1,
  hellBolsterPatrolRating: 0,
  hellBolsterPatrolPercentTop: 0,
  hellBolsterPatrolPercentBottom: 0,
  generalMinimumAuthority: -1,
  generalAuthorityMinPatrolPercent: 40,
};
const buildings = {
  ElysiumFortress: { isUnlocked: () => false },
  ElysiumScout: { isUnlocked: () => false },
  PortalTurret: { stateOnCount: 0 },
};
const resources = {
  Authority: {
    currentQuantity: 0,
    maxQuantity: 250,
    isUnlocked: () => true,
  },
};

const autoHell = createAutoHell({
  WarManager: manager,
  getGame: () => game,
  getSettings: () => settings,
  getBuildings: () => buildings,
  getResources: () => resources,
  getWindow: () => ({ authorityDebug: false }),
});

autoHell();

assert.equal(
  manager.hellSoldiers,
  100,
  "all available soldiers remain in Hell",
);
assert.equal(manager.hellPatrols, 1, "one patrol remains active");
assert.equal(
  manager.hellPatrolSize,
  40,
  "the configured 40% remains on patrol",
);
assert.equal(
  manager.hellGarrison,
  60,
  "the other 60% is stationed for Authority",
);

console.log("Hell Authority bootstrap regression test passed");
