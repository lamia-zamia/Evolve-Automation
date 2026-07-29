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
  resources: {},
  buildings,
};
// Rules read script state and phase-constant game gates only through the phase
// snapshot the executor samples.
const snapshotOf = (overrides = {}) =>
  Object.freeze({
    queuedTargets: new Set(),
    triggerTargets: new Set(),
    knowledgeRequiredByTechs: 0,
    knowledgeRequiredByBuildTargets: 0,
    cheapestTechKnowledge: 0,
    galaxyAssaultPending: false,
    stargatePiracySupressed: false,
    galaxyPiracyCoveredByFleet: false,
    lumberRace: false,
    bananaColliderObjectiveComplete: false,
    inflationAssistActive: false,
    inflationMoneyReachable: false,
    retirementPreparationIncomplete: false,
    guardDreadedActive: false,
    guardEnergeticActive: false,
    guardRedDeadActive: false,
    guardPacifistActive: false,
    foreignAchievementGoal: null,
    hellSupressUseful: false,
    gateTowerSupressionTooLow: false,
    gateDemonsSupressed: false,
    hellGuardPostPrebuildIncomplete: false,
    geckNeeded: false,
    prestigeEdenAllowed: false,
    prestigeRetireAllowed: false,
    pillarFinished: false,
    madPrestigeAwaited: false,
    mechSupplySaving: null,
    womlingFriendEarned: false,
    womlingGodEarned: false,
    womlingLordEarned: false,
    ...overrides,
  });
const emptySnapshot = snapshotOf();
let haveTech = () => false;
const neutralFunction = () => false;

const policy = createBuildingWeightingPolicy({
  getGame: () => context.game,
  getSettings: () => context.settings,
  getResources: () => context.resources,
  getBuildings: () => context.buildings,
  getHaveTech: () => haveTech,
  getNumberStringFn: () => String,
  getNiceNumberFn: () => String,
  getBestSupplyRatioFn: () => neutralFunction,
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
const triggerRule = ruleById("trigger-target");
assert.equal(
  queuedRule.match(
    candidate,
    snapshotOf({ queuedTargets: new Set([candidate]) }),
  ),
  true,
);
assert.equal(queuedRule.match(candidate, emptySnapshot), false);
assert.equal(
  triggerRule.match(
    candidate,
    snapshotOf({ triggerTargets: new Set([candidate]) }),
  ),
  true,
);
assert.equal(triggerRule.match(candidate, emptySnapshot), false);

// Knowledge rules compare the phase snapshot against live Knowledge storage.
const uselessKnowledgeRule = ruleById("no-need-for-more-knowledge");
const needfulKnowledgeRule = ruleById("need-more-knowledge");
context = { ...context, resources: { Knowledge: { maxQuantity: 100 } } };
assert.equal(
  uselessKnowledgeRule.enabled(
    snapshotOf({
      knowledgeRequiredByTechs: 100,
      knowledgeRequiredByBuildTargets: 50,
    }),
  ),
  true,
);
assert.equal(
  uselessKnowledgeRule.enabled(
    snapshotOf({ knowledgeRequiredByBuildTargets: 101 }),
  ),
  false,
  "a build target above storage still needs more knowledge",
);
assert.equal(
  needfulKnowledgeRule.enabled(snapshotOf({ cheapestTechKnowledge: 101 })),
  true,
);
assert.equal(
  needfulKnowledgeRule.enabled(
    snapshotOf({ knowledgeRequiredByBuildTargets: 101 }),
  ),
  true,
);
assert.equal(
  needfulKnowledgeRule.enabled(
    snapshotOf({ cheapestTechKnowledge: 100, knowledgeRequiredByTechs: 1e9 }),
  ),
  false,
  "an unreachable far-future tech must not force knowledge weighting",
);

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

// Both piracy rules ask the snapshot whether more hardware could still help,
// and then only identify the buildings that hardware is.
const piracyRule = ruleById("piracy-fully-supressed");
assert.equal(piracyRule.enabled(emptySnapshot), false);
assert.equal(
  piracyRule.enabled(snapshotOf({ stargatePiracySupressed: true })),
  true,
);
assert.equal(piracyRule.match(buildings.StargateDefensePlatform), true);
assert.equal(piracyRule.match(buildings.GatewayStarbase), false);

const fleetPiracyRule = ruleById("piracy-covered-by-fleet");
const coveredSnapshot = snapshotOf({ galaxyPiracyCoveredByFleet: true });
context.settings.autoFleet = true;
assert.equal(fleetPiracyRule.enabled(coveredSnapshot), true);
assert.equal(fleetPiracyRule.enabled(emptySnapshot), false);
// An accumulating assault fleet is exempt: its ships are wanted regardless.
assert.equal(
  fleetPiracyRule.enabled(
    snapshotOf({
      galaxyPiracyCoveredByFleet: true,
      galaxyAssaultPending: true,
    }),
  ),
  false,
);
context.settings.autoFleet = false;
assert.equal(fleetPiracyRule.enabled(coveredSnapshot), false);
assert.equal(fleetPiracyRule.match(buildings.Dreadnought), true);
assert.equal(fleetPiracyRule.match(buildings.GatewayStarbase), false);

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

// Whether Supply is being withheld for the mech bay is a fact about the run;
// the rule only asks whether the candidate spends Supply at all.
const mechSavingRule = ruleById("mech-supply-saving");
const savingSnapshot = snapshotOf({ mechSupplySaving: "saving" });
const buildingSnapshot = snapshotOf({ mechSupplySaving: "building" });
assert.equal(mechSavingRule.enabled(emptySnapshot), false);
assert.equal(mechSavingRule.enabled(savingSnapshot), true);
assert.equal(mechSavingRule.enabled(buildingSnapshot), true);
assert.equal(
  mechSavingRule.match({ cost: { Supply: 1 } }, savingSnapshot),
  "saving",
);
assert.equal(
  mechSavingRule.match({ cost: { Money: 1 } }, savingSnapshot),
  undefined,
  "buildings that do not spend Supply are never pinned for a mech",
);
assert.equal(
  mechSavingRule.describe(
    mechSavingRule.match({ cost: { Supply: 1 } }, savingSnapshot),
  ),
  "Saving supplies for new mech",
);
assert.equal(
  mechSavingRule.describe(
    mechSavingRule.match({ cost: { Supply: 1 } }, buildingSnapshot),
  ),
  "Building mechs...",
);
assert.equal(mechSavingRule.multiplier(), 0);

context.settings.achievementGuards = true;
const achievementGuardRule = ruleById("achievement-guard");
const redDeadSnapshot = snapshotOf({ guardRedDeadActive: true });
assert.equal(
  achievementGuardRule.match(context.buildings.RedSpaceport, redDeadSnapshot),
  "Red Dead",
);
assert.equal(
  achievementGuardRule.match(
    context.buildings.Dreadnought,
    snapshotOf({ guardDreadedActive: true }),
  ),
  "Dreaded",
);
assert.equal(
  achievementGuardRule.match(
    context.buildings.SiriusThermalCollector,
    snapshotOf({ guardEnergeticActive: true }),
  ),
  "Energetic",
);
for (const goal of ["world-domination", "syndicate"]) {
  assert.equal(
    achievementGuardRule.match(
      context.buildings.RedSpaceport,
      snapshotOf({ guardRedDeadActive: true, foreignAchievementGoal: goal }),
    ),
    false,
    `${goal} must be able to build the Red Spaceport needed to unlock unification`,
  );
}
assert.equal(
  achievementGuardRule.match(
    context.buildings.RedSpaceport,
    snapshotOf({ guardRedDeadActive: true, guardPacifistActive: true }),
  ),
  false,
  "Pacifist must be able to build the Red Spaceport needed for unification",
);

// Challenge and prestige gates come from the snapshot, not from live reads.
const inflationRule = ruleById("inflation-money");
assert.equal(inflationRule.enabled(emptySnapshot), false);
const inflationOn = snapshotOf({ inflationAssistActive: true });
assert.equal(inflationRule.enabled(inflationOn), true);
assert.equal(
  inflationRule.match(policy.inflationMoneyStorageBuildings[0], inflationOn),
  "storage",
);
assert.equal(
  inflationRule.match(policy.inflationMoneyIncomeBuildings[0], inflationOn),
  false,
);
const inflationReachable = snapshotOf({
  inflationAssistActive: true,
  inflationMoneyReachable: true,
});
assert.equal(
  inflationRule.match(
    policy.inflationMoneyIncomeBuildings[0],
    inflationReachable,
  ),
  "income",
);
assert.equal(
  inflationRule.match(
    policy.inflationMoneyStorageBuildings[0],
    inflationReachable,
  ),
  false,
);

const retirementRule = ruleById("retirement-preparation");
assert.equal(retirementRule.enabled(emptySnapshot), false);
assert.equal(
  retirementRule.enabled(snapshotOf({ retirementPreparationIncomplete: true })),
  true,
);

const bananaRule = ruleById("banana-republic-objective");
assert.equal(
  bananaRule.match(context.buildings.DwarfWorldCollider, emptySnapshot),
  true,
);
assert.equal(
  bananaRule.match(
    context.buildings.DwarfWorldCollider,
    snapshotOf({ bananaColliderObjectiveComplete: true }),
  ),
  false,
);

context.settings = { ...context.settings, prestigeType: "bioseed" };
const geckRule = ruleById("geck-limit");
assert.equal(geckRule.enabled(emptySnapshot), true);
assert.equal(geckRule.enabled(snapshotOf({ geckNeeded: true })), false);

context.game.global.race.lone_survivor = true;
const edenRule = ruleById("prestige-blocked-eden");
assert.equal(edenRule.enabled(emptySnapshot), true);
assert.equal(
  edenRule.enabled(snapshotOf({ prestigeEdenAllowed: true })),
  false,
);
delete context.game.global.race.lone_survivor;

// The Overlord guard reads the three womling stats from the snapshot; only the
// candidate's own buildability is still a live building read.
const womlingRule = ruleById("womling-overlord-guard");
const womlingBuilding = (id, autoBuildable) => ({
  _vueBinding: id,
  name: id,
  isAutoBuildable: () => autoBuildable,
});
context.buildings = {
  ...context.buildings,
  TauRedContact: womlingBuilding("TauRedContact", true),
  TauRedIntroduce: womlingBuilding("TauRedIntroduce", true),
  TauRedSubjugate: womlingBuilding("TauRedSubjugate", false),
};
context.game.global.race.truepath = 1;
assert.equal(womlingRule.enabled(emptySnapshot), 1);
assert.equal(womlingRule.match(candidate, emptySnapshot), undefined);
// An unearned stat means the candidate that earns it is the one to build.
assert.equal(
  womlingRule.match(context.buildings.TauRedContact, emptySnapshot),
  false,
);
// With its own stat earned, the candidate defers to the last unearned stat that
// is still buildable; the unbuildable Subjugate cannot claim it.
const friendEarned = snapshotOf({ womlingFriendEarned: true });
assert.equal(
  womlingRule.match(context.buildings.TauRedContact, friendEarned),
  "TauRedIntroduce",
);
assert.equal(
  womlingRule.describe("TauRedIntroduce"),
  "Overlord achievement is missing TauRedIntroduce",
);
context.settings = { ...context.settings, buildingWeightingOverlord: 0.5 };
assert.equal(womlingRule.multiplier(), 0.5);
assert.equal(
  womlingRule.match(
    context.buildings.TauRedContact,
    snapshotOf({
      womlingFriendEarned: true,
      womlingGodEarned: true,
      womlingLordEarned: true,
    }),
  ),
  null,
);
delete context.game.global.race.truepath;

// Awaiting MAD is one snapshot answer; the settings and tech reads it used to
// make now live in the adapter. Housing, garrisons, knowledge buildings, and the
// Oil Well stay worth building through the reset.
const madRule = ruleById("awaiting-mad-prestige");
assert.equal(madRule.enabled(emptySnapshot), false);
assert.equal(madRule.enabled(snapshotOf({ madPrestigeAwaited: true })), true);
const uselessThroughMad = { is: {}, cost: {} };
assert.equal(madRule.match(uselessThroughMad), true);
assert.equal(madRule.match({ is: { housing: true }, cost: {} }), false);
assert.equal(madRule.match({ is: { garrison: true }, cost: {} }), false);
assert.equal(madRule.match({ is: {}, cost: { Knowledge: 100 } }), false);
context.buildings = {
  ...context.buildings,
  OilWell: { _vueBinding: "OilWell", is: {}, cost: {} },
};
assert.equal(madRule.match(context.buildings.OilWell), false);
context.settings = { ...context.settings, buildingWeightingMADUseless: 0.01 };
assert.equal(madRule.multiplier(), 0.01);

// The two gate rules are enabled purely by their snapshot answer; the unlock
// checks and the supression reads they used to make now live in the adapter.
context.buildings = {
  ...context.buildings,
  GateEastTower: { _vueBinding: "GateEastTower" },
  GateWestTower: { _vueBinding: "GateWestTower" },
  GateTurret: { _vueBinding: "GateTurret" },
  RuinsGuardPost: {
    _vueBinding: "RuinsGuardPost",
    _tab: "portal",
    count: 0,
    stateOffCount: 1,
    isSmartManaged: () => true,
  },
};
const towerRule = ruleById("gate-supression-too-low");
assert.equal(towerRule.enabled(emptySnapshot), false);
assert.equal(
  towerRule.enabled(snapshotOf({ gateTowerSupressionTooLow: true })),
  true,
);
assert.equal(towerRule.match(context.buildings.GateEastTower), true);
assert.equal(towerRule.match(context.buildings.GateWestTower), true);
assert.equal(towerRule.match(context.buildings.GateTurret), false);

const demonRule = ruleById("gate-demons-supressed");
assert.equal(demonRule.enabled(emptySnapshot), false);
assert.equal(
  demonRule.enabled(snapshotOf({ gateDemonsSupressed: true })),
  true,
);
assert.equal(demonRule.match(context.buildings.GateTurret), true);

// Guard posts still short of their prebuild target are exempt from the
// non-operating penalty, but only while supression is not already useful.
const nonOperatingRule = ruleById("non-operating-buildings");
const guardPost = context.buildings.RuinsGuardPost;
assert.equal(nonOperatingRule.match(guardPost, emptySnapshot), true);
assert.equal(
  nonOperatingRule.match(
    guardPost,
    snapshotOf({ hellGuardPostPrebuildIncomplete: true }),
  ),
  false,
);
assert.equal(
  nonOperatingRule.match(
    guardPost,
    snapshotOf({
      hellGuardPostPrebuildIncomplete: true,
      hellSupressUseful: true,
    }),
  ),
  true,
);
guardPost.isSmartManaged = () => false;
assert.equal(
  nonOperatingRule.match(
    guardPost,
    snapshotOf({ hellGuardPostPrebuildIncomplete: true }),
  ),
  true,
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
