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
assert.deepEqual(
  [
    policy.wrGlobalCondition,
    policy.wrIndividualCondition,
    policy.wrDescription,
    policy.wrMultiplier,
  ],
  [0, 1, 2, 3],
);
assert.equal(policy.authorityCapBuildings[0], buildings.Barracks);
assert.equal(policy.authorityCapBuildings.at(-1), buildings.AsphodelBunker);
assert.equal(policy.galaxyCombatShips[0], buildings.ScoutShip);
assert.equal(policy.galaxyCombatShips.at(-1), buildings.Dreadnought);

const disabledRule = policy.weightingRules[0];
assert.equal(disabledRule[policy.wrGlobalCondition](), true);
context = {
  ...context,
  settings: { ...context.settings, autoBuild: true },
};
assert.equal(disabledRule[policy.wrGlobalCondition](), false);
assert.equal(disabledRule[policy.wrIndividualCondition](), true);
assert.equal(disabledRule[policy.wrMultiplier](), 0);

const candidate = { name: "candidate" };
const queuedRule = policy.weightingRules[2];
context = {
  ...context,
  state: { queuedTargets: [candidate], triggerTargets: [] },
};
assert.equal(queuedRule[policy.wrIndividualCondition](candidate), true);
context = {
  ...context,
  state: { queuedTargets: [], triggerTargets: [] },
};
assert.equal(queuedRule[policy.wrIndividualCondition](candidate), false);

const digsiteRule = policy.weightingRules[8];
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
assert.equal(digsiteRule[policy.wrGlobalCondition](), true);
assert.equal(
  digsiteRule[policy.wrIndividualCondition](buildings.ErisDrone),
  true,
);
assert.equal(
  digsiteRule[policy.wrIndividualCondition](buildings.ErisTank),
  true,
);
assert.equal(
  digsiteRule[policy.wrIndividualCondition](buildings.ErisTrooper),
  true,
);
assert.equal(
  digsiteRule[policy.wrIndividualCondition](buildings.ErisMission),
  false,
);
assert.equal(
  digsiteRule[policy.wrDescription](),
  "Eris Digsite is not yet secured",
);
assert.equal(digsiteRule[policy.wrMultiplier](), 10);
buildings.ErisDigsite.count = 100;
assert.equal(digsiteRule[policy.wrGlobalCondition](), false);

const authorityRule = policy.weightingRules.find((rule) => {
  try {
    return (
      rule[policy.wrDescription]() ===
      "Raises Authority cap, currently below target"
    );
  } catch {
    return false;
  }
});
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
assert.equal(authorityRule[policy.wrGlobalCondition](), true);
assert.equal(
  authorityRule[policy.wrIndividualCondition](buildings.Barracks),
  true,
);
context.settings.authorityManage = false;
assert.equal(authorityRule[policy.wrGlobalCondition](), false);

const piracyRule = policy.weightingRules[10];
haveTech = (id) => id === "piracy";
assert.equal(piracyRule[policy.wrGlobalCondition](), true);
haveTech = () => false;
assert.equal(piracyRule[policy.wrGlobalCondition](), false);

// Fuel-depot rule triggers on techMissionMaxCost, not the broad maxCost. A high
// maxCost from late-game buildings/projects with no tech/mission demand must not fire it.
const fuelDepotRule = policy.weightingRules.find((rule) => {
  try {
    return (
      rule[policy.wrDescription]() === "Need more fuel" &&
      rule[policy.wrIndividualCondition](buildings.OilDepot) === true
    );
  } catch {
    return false;
  }
});
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
assert.equal(fuelDepotRule[policy.wrGlobalCondition](), false);
context.resources.Oil.techMissionMaxCost = 500;
assert.equal(fuelDepotRule[policy.wrGlobalCondition](), true);
assert.equal(
  fuelDepotRule[policy.wrIndividualCondition](buildings.SpacePropellantDepot),
  true,
);
assert.equal(
  fuelDepotRule[policy.wrIndividualCondition](buildings.Mine),
  false,
);

// A reserved Soul Gem target can leave currentQuantity affordable while the
// mech itself is not affordable from the spare quantity. Supply buildings
// must remain buildable in that state instead of being pinned for a mech that
// cannot yet be built.
const mechSavingRule = policy.weightingRules[12];
assert.ok(mechSavingRule, "mech-saving weighting rule missing");
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
  mechSavingRule[policy.wrIndividualCondition]({ cost: { Supply: 1 } }),
  "Saving supplies for new mech",
  "distant reservations should not block an otherwise affordable mech",
);
context.resources.Soul_Gem.rateOfChange = 0.02;
context.resources.Soul_Gem.spareQuantity = 0;
assert.equal(
  mechSavingRule[policy.wrIndividualCondition]({ cost: { Supply: 1 } }),
  undefined,
  "near-term reservations must still release Supply buildings",
);
context.resources.Soul_Gem.spareQuantity = 1;
assert.equal(
  mechSavingRule[policy.wrIndividualCondition]({ cost: { Supply: 1 } }),
  "Saving supplies for new mech",
  "spare-affordable mechs should still protect Supply buildings",
);

context.settings.achievementGuards = true;
guardActive = (setting) => setting === "guardRedDead";
const achievementGuardRule = policy.weightingRules.find((rule) => {
  try {
    return (
      rule[policy.wrIndividualCondition](context.buildings.RedSpaceport) ===
      "Red Dead"
    );
  } catch {
    return false;
  }
});
assert.ok(achievementGuardRule, "achievement guard weighting rule missing");
assert.equal(
  achievementGuardRule[policy.wrIndividualCondition](
    context.buildings.RedSpaceport,
  ),
  "Red Dead",
);
for (const goal of ["world-domination", "syndicate"]) {
  foreignAchievementGoal = goal;
  assert.equal(
    achievementGuardRule[policy.wrIndividualCondition](
      context.buildings.RedSpaceport,
    ),
    false,
    `${goal} must be able to build the Red Spaceport needed to unlock unification`,
  );
}
foreignAchievementGoal = null;
guardActive = (setting) =>
  setting === "guardRedDead" || setting === "guardPacifist";
assert.equal(
  achievementGuardRule[policy.wrIndividualCondition](
    context.buildings.RedSpaceport,
  ),
  false,
  "Pacifist must be able to build the Red Spaceport needed for unification",
);

const vacuumManaRule = policy.weightingRules.at(-1);
context.settings = {
  ...context.settings,
  prestigeType: "vacuum",
  buildingWeightingVacuumCollapse: 10,
};
assert.equal(vacuumManaRule[policy.wrGlobalCondition](), true);
assert.equal(
  vacuumManaRule[policy.wrIndividualCondition](context.buildings.Pylon),
  true,
);
assert.equal(
  vacuumManaRule[policy.wrIndividualCondition](context.buildings.Bank),
  false,
);
assert.equal(
  vacuumManaRule[policy.wrDescription](),
  "Vacuum Collapse Mana producer",
);
assert.equal(vacuumManaRule[policy.wrMultiplier](), 10);
context.settings.prestigeType = "mad";
assert.equal(vacuumManaRule[policy.wrGlobalCondition](), false);

console.log("Weighting policy module tests passed");
