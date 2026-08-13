import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const actions = [];
const document = { getElementById: () => null };
const jquery = () => ({ ready() {} });
const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  document,
  $: jquery,
  authorityDebug: false,
});

assert.equal(typeof hooks.autoHell, "function");
const WarManager = {
  isGarrisonVisible: true,
  isHellVisible: true,
  maxSoldiers: 200,
  currentSoldiers: 200,
  currentCityGarrison: 80,
  maxCityGarrison: 80,
  hellSoldiers: 120,
  hellPatrols: 5,
  hellPatrolSize: 20,
  hellAssigned: 120,
  hellReservedSoldiers: 0,
  hellGarrison: 20,
  minions: 0,
  enemies: 0,
  getSoldiersForAttackRating: (rating) => rating,
  removeHellPatrolSize(count) {
    actions.push(["remove-size", count]);
    this.hellPatrolSize -= count;
  },
  removeHellPatrol(count) {
    actions.push(["remove-patrol", count]);
    this.hellPatrols -= count;
  },
  removeHellGarrison(count) {
    actions.push(["remove-garrison", count]);
    this.hellSoldiers -= count;
  },
  addHellGarrison(count) {
    actions.push(["add-garrison", count]);
    this.hellSoldiers += count;
  },
  addHellPatrolSize(count) {
    actions.push(["add-size", count]);
    this.hellPatrolSize += count;
  },
  addHellPatrol(count) {
    actions.push(["add-patrol", count]);
    this.hellPatrols += count;
  },
};
const game = {
  global: {
    race: { warlord: false, grenadier: false },
    tech: { evil: 0, turret: 0, portal: 0, hdroid: false },
    portal: { fortress: { walls: 100, threat: 10 } },
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
  authorityManage: false,
  generalMinimumAuthority: 0,
  generalAuthorityMinPatrolPercent: 0,
};
const buildings = {
  ElysiumFortress: { isUnlocked: () => false },
  ElysiumScout: { isUnlocked: () => false },
  PortalTurret: { stateOnCount: 0 },
};
const resources = {
  Authority: {
    currentQuantity: 0,
    maxQuantity: 0,
    isUnlocked: () => false,
  },
};
const state = { scriptTick: 1 };

hooks.setWave1TestManagers({ WarManager, MinorTraitManager: {} });
hooks.setForeignAffairsManagersTestContext({
  game,
  settings,
  state,
  resources,
  buildings,
});

hooks.autoHell();
assert.deepEqual(actions, [
  ["remove-size", 10],
  ["remove-garrison", 20],
  ["add-patrol", 5],
]);

console.log("Hell bundled characterization tests passed");
