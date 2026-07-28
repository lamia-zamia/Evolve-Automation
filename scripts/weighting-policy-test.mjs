import assert from "node:assert/strict";
import { createBuildingWeightingPolicy } from "../src/policies/building-weighting.ts";

class ResourceAction {}

const buildingCache = {};
const buildings = new Proxy(buildingCache, {
  get(target, property) {
    if (!(property in target)) {
      target[property] = {
        _vueBinding: String(property),
        count: 0,
        stateOffCount: 0,
        isUnlocked: () => true,
      };
    }
    return target[property];
  },
});
let context = {
  game: {
    global: {
      race: {},
      tech: {},
      civic: { foreign: { gov0: {}, gov1: {}, gov2: {} } },
    },
  },
  settings: { autoBuild: false },
  state: { queuedTargets: [], triggerTargets: [] },
  resources: {},
  buildings,
  poly: {},
  MechManager: {},
  techIds: {},
};
let haveTech = () => false;
const neutralFunction = () => false;
let guardActive = neutralFunction;
let foreignAchievementGoal = null;

const policy = createBuildingWeightingPolicy({
  getGame: () => context.game,
  getSettings: () => context.settings,
  getState: () => context.state,
  getResources: () => context.resources,
  getBuildings: () => context.buildings,
  getPoly: () => context.poly,
  getMechManager: () => context.MechManager,
  getTechIds: () => context.techIds,
  getTraitVal: () => neutralFunction,
  getHaveTech: () => haveTech,
  getHaveTask: () => neutralFunction,
  getPiracyMultiplierFn: () => neutralFunction,
  getGalaxyAssaultPending: () => neutralFunction,
  getGalaxyRegionsFn: () => () => [],
  getGalaxyCombatShipPowerFn: () => neutralFunction,
  getNumberStringFn: () => String,
  getNiceNumberFn: () => String,
  getIsLumberRace: () => neutralFunction,
  getBananaRepublicObjectiveComplete: () => neutralFunction,
  getInflationChallengeAssistActive: () => neutralFunction,
  getInflationChallengeMoneyReachable: () => neutralFunction,
  getRetirementChallengeAssistActive: () => neutralFunction,
  getRetirementPreparationMissing: () => neutralFunction,
  getGuardActive: () => guardActive,
  getForeignAchievementGoal: () => foreignAchievementGoal,
  getIsHellSupressUseful: () => neutralFunction,
  getBestSupplyRatioFn: () => neutralFunction,
  getIsGECKNeeded: () => neutralFunction,
  getIsPrestigeAllowed: () => neutralFunction,
  getIsPillarFinished: () => neutralFunction,
  getCitadelConsumptionFn: () => neutralFunction,
  ResourceAction,
  randomSource: { nextUnit: () => 0.5 },
});

assert.equal(policy.weightingRules.length, 72);
assert.equal(
  policy.weightingRules.every(
    (rule) =>
      typeof rule.id === "string" &&
      rule.id !== "" &&
      typeof rule.enabled === "function" &&
      typeof rule.match === "function" &&
      typeof rule.describe === "function" &&
      typeof rule.multiplier === "function",
  ),
  true,
  "every weighting rule exposes a stable id and the four named phases",
);
assert.equal(
  new Set(policy.weightingRules.map((rule) => rule.id)).size,
  policy.weightingRules.length,
  "weighting rule ids are unique",
);

const ruleById = (id) => {
  const rule = policy.weightingRules.find((candidate) => candidate.id === id);
  assert.ok(rule, `weighting rule "${id}" missing`);
  return rule;
};
assert.equal(policy.authorityCapBuildings[0], buildings.Barracks);
assert.equal(policy.authorityCapBuildings.at(-1), buildings.AsphodelBunker);
assert.equal(policy.galaxyCombatShips[0], buildings.ScoutShip);
assert.equal(policy.galaxyCombatShips.at(-1), buildings.Dreadnought);

const disabledRule = ruleById("autobuild-off");
assert.equal(disabledRule.enabled(), true);
context = {
  ...context,
  settings: { ...context.settings, autoBuild: true },
};
assert.equal(disabledRule.enabled(), false);
assert.equal(disabledRule.match(), true);
assert.equal(disabledRule.multiplier(), 0);

const candidate = { name: "candidate" };
const queuedRule = ruleById("queued-target");
context = {
  ...context,
  state: { queuedTargets: [candidate], triggerTargets: [] },
};
assert.equal(queuedRule.match(candidate), true);
context = {
  ...context,
  state: { queuedTargets: [], triggerTargets: [] },
};
assert.equal(queuedRule.match(candidate), false);

const digsiteRule = ruleById("eris-digsite-unsecured");
context = {
  ...context,
  game: {
    ...context.game,
    global: {
      ...context.game.global,
      race: { truepath: true },
    },
  },
  settings: {
    ...context.settings,
    buildingWeightingTruepathDigsite: 10,
  },
};
buildings.ErisDigsite.count = 42;
assert.equal(digsiteRule.enabled(), true);
assert.equal(digsiteRule.match(buildings.ErisDrone), true);
assert.equal(digsiteRule.match(buildings.ErisTank), true);
assert.equal(digsiteRule.match(buildings.ErisTrooper), true);
assert.equal(digsiteRule.match(buildings.ErisMission), false);
assert.equal(digsiteRule.describe(), "Eris Digsite is not yet secured");
assert.equal(digsiteRule.multiplier(), 10);
buildings.ErisDigsite.count = 100;
assert.equal(digsiteRule.enabled(), false);

const authorityRule = ruleById("authority-cap");
context = {
  ...context,
  settings: {
    ...context.settings,
    authorityManage: true,
    generalMinimumAuthority: 100,
    buildingWeightingAuthority: 10,
  },
  resources: {
    Authority: {
      maxQuantity: 80,
      isUnlocked: () => true,
    },
  },
};
assert.equal(authorityRule.enabled(), true);
assert.equal(authorityRule.match(buildings.Barracks), true);
context.settings.authorityManage = false;
assert.equal(authorityRule.enabled(), false);

const piracyRule = ruleById("piracy-fully-supressed");
haveTech = (id) => id === "piracy";
assert.equal(piracyRule.enabled(), true);
haveTech = () => false;
assert.equal(piracyRule.enabled(), false);

// Fuel-depot rule triggers on techMissionMaxCost, not the broad maxCost. A high
// maxCost from late-game buildings/projects with no tech/mission demand must not fire it.
const fuelDepotRule = ruleById("need-more-fuel-storage");
context = {
  ...context,
  resources: {
    Helium_3: {
      isUnlocked: () => false,
      maxQuantity: 0,
      techMissionMaxCost: 0,
    },
    Oil: { maxQuantity: 100, maxCost: 999999, techMissionMaxCost: 0 },
  },
};
assert.equal(fuelDepotRule.enabled(), false);
context.resources.Oil.techMissionMaxCost = 500;
assert.equal(fuelDepotRule.enabled(), true);
assert.equal(fuelDepotRule.match(buildings.SpacePropellantDepot), true);
assert.equal(fuelDepotRule.match(buildings.Mine), false);

// A reserved Soul Gem target can leave currentQuantity affordable while the
// mech itself is not affordable from the spare quantity. Supply buildings
// must remain buildable in that state instead of being pinned for a mech that
// cannot yet be built.
const mechSavingRule = ruleById("mech-supply-saving");
context = {
  ...context,
  settings: {
    ...context.settings,
    autoMech: true,
    mechBuild: "user",
    buildingMechsFirst: true,
  },
  game: {
    ...context.game,
    global: {
      ...context.game.global,
      portal: { mechbay: { max: 10, bay: 0, blueprint: { size: "small" } } },
    },
  },
  buildings: {
    ...context.buildings,
    SpireMechBay: { count: 1, stateOffCount: 0 },
  },
  resources: {
    Supply: { maxQuantity: 1_000 },
    Soul_Gem: {
      currentQuantity: 41,
      spareQuantity: -209,
      rateOfChange: 0.01,
    },
  },
  MechManager: {
    isActive: false,
    getMechCost: () => [1, 20, 1],
    getPreferredSize: () => ["small"],
  },
};
assert.equal(
  mechSavingRule.match({ cost: { Supply: 1 } }),
  "Saving supplies for new mech",
  "distant reservations should not block an otherwise affordable mech",
);
context.resources.Soul_Gem.rateOfChange = 0.02;
context.resources.Soul_Gem.spareQuantity = 0;
assert.equal(
  mechSavingRule.match({ cost: { Supply: 1 } }),
  undefined,
  "near-term reservations must still release Supply buildings",
);
context.resources.Soul_Gem.spareQuantity = 1;
assert.equal(
  mechSavingRule.match({ cost: { Supply: 1 } }),
  "Saving supplies for new mech",
  "spare-affordable mechs should still protect Supply buildings",
);

context.settings.achievementGuards = true;
guardActive = (setting) => setting === "guardRedDead";
const achievementGuardRule = ruleById("achievement-guard");
assert.equal(
  achievementGuardRule.match(context.buildings.RedSpaceport),
  "Red Dead",
);
for (const goal of ["world-domination", "syndicate"]) {
  foreignAchievementGoal = goal;
  assert.equal(
    achievementGuardRule.match(context.buildings.RedSpaceport),
    false,
    `${goal} must be able to build the Red Spaceport needed to unlock unification`,
  );
}
foreignAchievementGoal = null;
guardActive = (setting) =>
  setting === "guardRedDead" || setting === "guardPacifist";
assert.equal(
  achievementGuardRule.match(context.buildings.RedSpaceport),
  false,
  "Pacifist must be able to build the Red Spaceport needed for unification",
);

const vacuumManaRule = ruleById("vacuum-collapse-mana-producer");
context.settings = {
  ...context.settings,
  prestigeType: "vacuum",
  buildingWeightingVacuumCollapse: 10,
};
assert.equal(vacuumManaRule.enabled(), true);
assert.equal(vacuumManaRule.match(context.buildings.Pylon), true);
assert.equal(vacuumManaRule.match(context.buildings.Bank), false);
assert.equal(vacuumManaRule.describe(), "Vacuum Collapse Mana producer");
assert.equal(vacuumManaRule.multiplier(), 10);
context.settings.prestigeType = "mad";
assert.equal(vacuumManaRule.enabled(), false);

console.log("Weighting policy module tests passed");
