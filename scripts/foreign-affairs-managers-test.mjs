import assert from "node:assert/strict";
import { createForeignAffairsManagers } from "../src/game/foreign-affairs-managers.ts";

let game;
let settings;
let state;
let resources;
let buildings;
let poly;
let haveTech = () => false;
let guardActive = () => false;
let foreignAchievementGoal = null;
let traitVal = () => 1;
const vueById = {};
const selectors = {};
const trace = [];
const errors = [];

const { SpyManager, WarManager } = createForeignAffairsManagers({
  getGame: () => game,
  getSettings: () => settings,
  getState: () => state,
  getResources: () => resources,
  getBuildings: () => buildings,
  getDocument: () => ({
    querySelector: (selector) => selectors[selector] ?? null,
  }),
  getPoly: () => poly,
  getVueById: (id) => vueById[id],
  callVueMethod: (view, methodName, args, legacyFilterName = methodName) => {
    const method = view[methodName];
    if (typeof method === "function") {
      return method(...args);
    }
    const filter = view.$options?.filters?.[legacyFilterName];
    if (typeof filter === "function") {
      return filter(...args);
    }
    throw new TypeError(`${methodName} must be a function`);
  },
  getWindowManager: () => ({
    isOpen: () => false,
    openModalWindowWithCallback: (_node, title, callback) => {
      trace.push(["modal", title]);
      callback();
    },
  }),
  getGameLog: () => ({
    logSuccess: (...args) => trace.push(["log", ...args]),
  }),
  getKeyManager: () => ({
    set: (...args) => trace.push(["keys", ...args]),
    click: (count) => Array.from({ length: Math.max(0, count) }),
  }),
  getHaveTech: () => haveTech,
  getGuardActive: () => guardActive,
  getForeignAchievementGoal: () => foreignAchievementGoal,
  getTraitVal: () => traitVal,
  getGovPower: (index) => game.global.civic.foreign[`gov${index}`].mil,
  getGovName: (index) => `government-${index}`,
  getOccCosts: () => 4,
  logError: (...args) => errors.push(args),
});

function foreignGovernment(overrides = {}) {
  return {
    spy: 3,
    mil: 50,
    hstl: 10,
    unrest: 60,
    anx: false,
    buy: false,
    occ: false,
    act: "",
    ...overrides,
  };
}

game = {
  global: {
    civic: {
      foreign: {
        gov0: foreignGovernment(),
        gov1: foreignGovernment({ mil: 60 }),
        gov2: foreignGovernment({ mil: 70 }),
      },
      garrison: {
        workers: 12,
        wounded: 1,
        raid: 0,
        max: 20,
        m_use: 0,
        crew: 2,
        mercs: true,
        tactic: 2,
      },
    },
    city: { biome: "grassland" },
    portal: {
      fortress: { garrison: 5, patrols: 1, patrol_size: 2, assigned: 5 },
      throne: { enemy: [{}] },
    },
    race: {},
    space: { fob: { troops: 1 } },
    tech: { unify: 1 },
  },
  loc: (key) => key,
  armyRating: (count) => count * 10,
};
settings = {
  foreignPowerRequired: 100,
  foreignPolicyInferior: "Purchase",
  foreignPolicySuperior: "Ignore",
  foreignPolicyRival: "Ignore",
  foreignPacifist: false,
  foreignUnification: true,
  foreignOccupyLast: false,
  foreignForceSabotage: false,
  autoFight: true,
  autoBuild: false,
  hellAssaultReserve: false,
};
state = { astroSign: "none" };
resources = {
  Money: { currentQuantity: 10_000, maxQuantity: 10_000 },
  Morale: { currentQuantity: 250 },
};
buildings = {
  PitAssaultForge: { isAutoBuildable: () => false, cost: {} },
  PitSoulForge: { count: 0, autoStateEnabled: false, stateOnCount: 0 },
  PitGunEmplacement: { count: 0, stateOnCount: 0 },
  RuinsGuardPost: { count: 0, stateOnCount: 0 },
};
poly = { govPrice: (index) => 1_000 + index * 100 };
vueById.foreign = { vis: () => true };

SpyManager.updateForeigns();
assert.deepEqual(
  SpyManager.foreignActive.map(({ id, policy }) => ({ id, policy })),
  [
    { id: 0, policy: "Purchase" },
    { id: 1, policy: "Purchase" },
    { id: 2, policy: "Ignore" },
  ],
);
assert.equal(SpyManager.foreignTarget.id, 2);
assert.deepEqual(SpyManager.purchaseForeigngs, [0, 1]);
assert.equal(SpyManager.purchaseMoney, 1_100);

foreignAchievementGoal = "world-domination";
settings.foreignPolicyInferior = "Ignore";
settings.foreignPolicySuperior = "Ignore";
settings.foreignOccupyLast = false;
SpyManager.updateForeigns();
assert.deepEqual(
  SpyManager.foreignActive.map(({ id, policy }) => ({ id, policy })),
  [
    { id: 0, policy: "Occupy" },
    { id: 1, policy: "Occupy" },
    { id: 2, policy: "Occupy" },
  ],
);

foreignAchievementGoal = "syndicate";
SpyManager.updateForeigns();
assert.deepEqual(
  SpyManager.foreignActive.map(({ id, policy }) => ({ id, policy })),
  [
    { id: 0, policy: "Purchase" },
    { id: 1, policy: "Purchase" },
    { id: 2, policy: "Ignore" },
  ],
);
assert.deepEqual(SpyManager.purchaseForeigngs, [0, 1]);
game.global.civic.foreign.gov0.buy = true;
game.global.civic.foreign.gov1.buy = true;
settings.foreignOccupyLast = true;
settings.foreignPolicySuperior = "Sabotage";
SpyManager.updateForeigns();
assert.deepEqual(
  SpyManager.foreignActive.map(({ id, policy }) => ({ id, policy })),
  [
    { id: 0, policy: "Purchase" },
    { id: 1, policy: "Purchase" },
    { id: 2, policy: "Purchase" },
  ],
);
assert.deepEqual(SpyManager.purchaseForeigngs, [2]);

// Tech and guard lookups stay live after factory construction.
haveTech = (id) => id === "world_control";
guardActive = () => true;
SpyManager.updateForeigns();
assert.deepEqual(SpyManager.foreignActive, []);
assert.equal(SpyManager.foreignTarget, null);

// Infiltrator divides the base cost, then Scorpio takes its 12% off that.
game.global.race.infiltrator = true;
assert.equal(SpyManager.spyCost(0, 2), 778);
state.astroSign = "scorpio";
assert.equal(SpyManager.spyCost(0, 2), 715);

selectors["#gov0 div span:nth-child(3)"] = { style: { display: "block" } };
selectors["#gov0 div span:nth-child(3) button"] = {
  getAttribute: () => null,
};
vueById.espModal = {
  annex: (index) => trace.push(["annex", index]),
};
resources.Morale.currentQuantity = 300;
SpyManager.performEspionage(0, SpyManager.Types.Annex.id, false);
assert.deepEqual(trace.slice(0, 3), [
  ["modal", "civics_espionage_actions"],
  [
    "log",
    "spying",
    'Performing "civics_spy_annex" covert operation against government-0.',
    ["spy"],
  ],
  ["annex", 0],
]);

// War state updates and occupation release.
vueById.garrison = {
  campaign: (index) => trace.push(["campaign", index]),
  hire: () => trace.push(["hire"]),
  next: () => trace.push(["next"]),
  last: () => trace.push(["last"]),
  aNext: () => trace.push(["aNext"]),
  aLast: () => trace.push(["aLast"]),
  $options: { filters: { tactics: (value) => `tactic-${value}` } },
};
vueById.fort = {
  aNext: () => trace.push(["hellNext"]),
  aLast: () => trace.push(["hellLast"]),
  patInc: () => trace.push(["patInc"]),
  patDec: () => trace.push(["patDec"]),
  patSizeInc: () => trace.push(["patSizeInc"]),
  patSizeDec: () => trace.push(["patSizeDec"]),
  attack: (index) => trace.push(["attack", index]),
};
WarManager.updateGarrison();
WarManager.updateHell();
assert.equal(WarManager.currentCityGarrison, 4);
assert.equal(WarManager.availableGarrison, 3);
game.global.civic.foreign.gov0.occ = true;
WarManager.release(0);
assert.equal(WarManager.workers, 16);
assert.equal(WarManager.max, 24);

// Reserve calculations include assault forge, soul forge, emplacement, and guardpost.
settings.autoBuild = true;
settings.hellAssaultReserve = true;
buildings.PitAssaultForge.isAutoBuildable = () => true;
buildings.PitSoulForge = { count: 1, autoStateEnabled: true, stateOnCount: 1 };
buildings.PitGunEmplacement = { count: 1, stateOnCount: 2 };
buildings.RuinsGuardPost = { count: 1, stateOnCount: 2 };
traitVal = (id, _fallback, mode) => (id === "high_pop" && mode === 1 ? 2 : 1);
assert.equal(WarManager.getHellReservedSoldiers(), 133);

// Hivemind uses the iterative rating branch and live trait lookup.
game.global.race.hivemind = true;
traitVal = (id) => (id === "hivemind" ? 5 : 1);
assert.equal(WarManager.getSoldiersForAttackRating(35), 4);

// Fortress validation and caught failures.
assert.equal(WarManager.attackEnemyFortress(-1), false);
vueById.fort.attack = () => {
  throw new Error("boom");
};
assert.equal(WarManager.attackEnemyFortress(0), false);
assert.equal(errors.length, 1);

console.log("Foreign-affairs manager tests passed");
