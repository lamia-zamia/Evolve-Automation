import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const actions = [];
const document = { getElementById: () => null };
const jquery = (selector) =>
  selector === undefined ? { ready() {} } : { length: 0 };
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
});

assert.equal(typeof hooks.autoMech, "function");
const design = {
  id: -1,
  size: "medium",
  infernal: false,
  power: 80,
  efficiency: 16,
  chassis: "avian",
  hardpoint: ["laser"],
  equip: [],
};
let isActive = true;
let supply = 100;
let gems = 100;
const manager = {
  Size: ["collector", "small", "medium", "large", "titan"],
  activeMechs: [],
  inactiveMechs: [],
  bestMech: {},
  mechsPower: 0,
  saveSupply: false,
  get isActive() {
    return isActive;
  },
  set isActive(value) {
    isActive = value;
    actions.push(["active", value]);
  },
  initLab: () => true,
  getPreferredSize: () => ["medium", false],
  getRandomMech: () => design,
  getMechCost: () => [20, 50, 5],
  buildMech: (mech) => actions.push(["build", mech.size, mech.power]),
};
const resource = (getCurrent, setCurrent, maximum, rate) => ({
  get currentQuantity() {
    return getCurrent();
  },
  set currentQuantity(value) {
    setCurrent(value);
  },
  get spareQuantity() {
    return getCurrent();
  },
  spareMaxQuantity: maximum,
  maxQuantity: maximum,
  rateOfChange: rate,
  get storageRatio() {
    return getCurrent() / maximum;
  },
});
const resources = {
  Supply: resource(
    () => supply,
    (value) => {
      supply = value;
      actions.push(["supply", value]);
    },
    100,
    10,
  ),
  Soul_Gem: resource(
    () => gems,
    (value) => {
      gems = value;
      actions.push(["gems", value]);
    },
    100,
    10,
  ),
};
const settings = {
  mechBaysFirst: false,
  mechBuild: "random",
  mechFillBay: false,
  autoPrestige: false,
  prestigeType: "ascension",
  prestigeDemonicFloor: 100,
  mechSaveSupplyRatio: 0,
  autoBuild: false,
  mechMinSupply: 0,
  mechScrap: "none",
  mechScrapEfficiency: 1,
  mechScoutsRebuild: true,
  mechScouts: 0,
};
const buildings = {
  SpirePurifier: {
    stateOffCount: 0,
    isAutoBuildable: () => false,
    isAffordable: () => false,
  },
  SpireMechBay: {
    isAutoBuildable: () => false,
    isAffordable: () => false,
  },
  SpireTower: { count: 0 },
  SpireWaygate: { stateOnCount: 0 },
};
const game = {
  global: {
    race: { warlord: false },
    tech: {},
    portal: {
      mechbay: {
        mechs: [],
        max: 10,
        bay: 0,
        scouts: 0,
        blueprint: {},
      },
    },
  },
};

hooks.setMechManagerTestContext({
  game,
  settings,
  resources,
  buildings,
  GameLog: { logSuccess() {} },
});
hooks.setWave3TestContext({
  foundryList: [],
  SpyManager: {},
  buildings,
  haveTask: () => false,
  haveTech: () => false,
  isBioseederPrestigeAvailable: () => false,
});
hooks.setWave5TestManagers({
  StorageManager: {},
  FleetManagerOuter: {},
  FleetManager: {},
  MechManager: manager,
});

hooks.autoMech();
assert.deepEqual(actions, [
  ["active", false],
  ["build", "medium", 80],
  ["supply", 50],
  ["gems", 80],
  ["active", true],
]);

console.log("Mech bundled characterization tests passed");
