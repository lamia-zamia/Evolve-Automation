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
  getGuardActive: () => neutralFunction,
  getIsHellSupressUseful: () => neutralFunction,
  getBestSupplyRatioFn: () => neutralFunction,
  getIsGECKNeeded: () => neutralFunction,
  getIsPrestigeAllowed: () => neutralFunction,
  getIsPillarFinished: () => neutralFunction,
  getCitadelConsumptionFn: () => neutralFunction,
  ResourceAction,
});

assert.equal(policy.weightingRules.length, 71);
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

console.log("Weighting policy module tests passed");
