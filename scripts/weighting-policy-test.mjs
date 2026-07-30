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
  settings: { autoBuild: false },
  resources: {},
  buildings,
};
// Every configured weighting multiplier arrives through the snapshot, so the
// baseline is zero and each rule's own case supplies the value it asserts.
const WEIGHT_NAMES = [
  "buildingWeightingNew",
  "buildingWeightingUnderpowered",
  "buildingWeightingNeedfulPowerPlant",
  "buildingWeightingUselessPowerPlant",
  "buildingWeightingNeedfulKnowledge",
  "buildingWeightingUselessKnowledge",
  "buildingWeightingNonOperatingCity",
  "buildingWeightingNonOperating",
  "buildingWeightingMissingSupply",
  "buildingWeightingMissingSupport",
  "buildingWeightingUselessSupport",
  "buildingWeightingMissingFuel",
  "buildingWeightingMADUseless",
  "buildingWeightingUnusedEjectors",
  "buildingWeightingCrateUseless",
  "buildingWeightingHorseshoeUseless",
  "buildingWeightingZenUseless",
  "buildingWeightingGateTurret",
  "buildingWeightingNeedStorage",
  "buildingWeightingUselessHousing",
  "buildingWeightingTemporal",
  "buildingWeightingSolar",
  "buildingWeightingVacuumCollapse",
  "buildingWeightingTruepathDigsite",
  "buildingWeightingOverlord",
  "buildingWeightingAuthority",
  "buildingWeightingBananaObjective",
  "buildingWeightingInflationMoney",
  "buildingWeightingRetirementPrep",
];
const zeroWeights = Object.fromEntries(WEIGHT_NAMES.map((name) => [name, 0]));
// Rules read script state and phase-constant game gates only through the phase
// snapshot the executor samples.
const snapshotOf = ({ weights = {}, ...overrides } = {}) =>
  Object.freeze({
    weights: Object.freeze({ ...zeroWeights, ...weights }),
    buildBestFreighterOnly: false,
    queuedTargets: new Set(),
    triggerTargets: new Set(),
    knowledgeRequiredByTechs: 0,
    knowledgeRequiredByBuildTargets: 0,
    cheapestTechKnowledge: 0,
    galaxyAssaultPending: false,
    stargatePiracySupressed: false,
    galaxyPiracyCoveredByFleet: false,
    truepathRace: false,
    mineIsOnlyChrysotileSource: false,
    witchHunterRace: false,
    warlordRace: false,
    artificialRace: false,
    slaverRace: false,
    cannibalizeRace: false,
    sacrificeBlocked: null,
    bananaRace: false,
    loneSurvivorRace: false,
    hoovedRace: false,
    calmRace: false,
    orbitalDecayImpactPending: false,
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
    spirePortPrebuildIncomplete: false,
    spireBaseCampPrebuildIncomplete: false,
    lakeBiremeSupplyRate: 0.85,
    nextCitadelPowerDraw: 0,
    assignedEjectorCapacity: 0,
    worldUnified: false,
    testLaunchSuccessChance: 0.2,
    spireWaygateComplete: false,
    spireEdenicGateComplete: false,
    elysiumFireSupportUnlocked: false,
    elysiumGarrisonDestroyed: false,
    eleriumCannonResearched: false,
    asphodelStabilizerUnlocked: false,
    spireSphinxSolved: false,
    assemblyCureComplete: false,
    tauCetiReached: false,
    gasGiantNameContestActive: false,
    shrineBonusUnwanted: false,
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

const policy = createBuildingWeightingPolicy({
  getSettings: () => context.settings,
  getResources: () => context.resources,
  getBuildings: () => context.buildings,
  getNumberStringFn: () => String,
  getNiceNumberFn: () => String,
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
assert.equal(disabledRule.multiplier(emptySnapshot), 0);

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
const truepathSnapshot = snapshotOf({ truepathRace: true });
buildings.ErisDigsite.count = 42;
assert.equal(digsiteRule.enabled(truepathSnapshot), true);
assert.equal(
  digsiteRule.enabled(emptySnapshot),
  false,
  "the Eris digsite only exists in a True Path run",
);
assert.equal(digsiteRule.match(buildings.ErisDrone), true);
assert.equal(digsiteRule.match(buildings.ErisTank), true);
assert.equal(digsiteRule.match(buildings.ErisTrooper), true);
assert.equal(digsiteRule.match(buildings.ErisMission), false);
assert.equal(digsiteRule.describe(), "Eris Digsite is not yet secured");
assert.equal(
  digsiteRule.multiplier(
    snapshotOf({ weights: { buildingWeightingTruepathDigsite: 10 } }),
  ),
  10,
);
buildings.ErisDigsite.count = 100;
assert.equal(digsiteRule.enabled(truepathSnapshot), false);

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
assert.equal(mechSavingRule.multiplier(emptySnapshot), 0);

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

const edenRule = ruleById("prestige-blocked-eden");
const loneSurvivor = snapshotOf({ loneSurvivorRace: true });
assert.equal(edenRule.enabled(loneSurvivor), true);
assert.equal(edenRule.enabled(emptySnapshot), false);
assert.equal(
  edenRule.enabled(
    snapshotOf({ loneSurvivorRace: true, prestigeEdenAllowed: true }),
  ),
  false,
);

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
assert.equal(womlingRule.enabled(truepathSnapshot), true);
assert.equal(womlingRule.enabled(emptySnapshot), false);
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
assert.equal(
  womlingRule.multiplier(
    snapshotOf({ weights: { buildingWeightingOverlord: 0.5 } }),
  ),
  0.5,
);
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
assert.equal(
  madRule.multiplier(
    snapshotOf({ weights: { buildingWeightingMADUseless: 0.01 } }),
  ),
  0.01,
);

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
};
assert.equal(vacuumManaRule.enabled(), true);
assert.equal(vacuumManaRule.match(context.buildings.Pylon), true);
assert.equal(vacuumManaRule.match(context.buildings.Bank), false);
assert.equal(vacuumManaRule.describe(), "Vacuum Collapse Mana producer");
assert.equal(
  vacuumManaRule.multiplier(
    snapshotOf({ weights: { buildingWeightingVacuumCollapse: 10 } }),
  ),
  10,
);
context.settings.prestigeType = "mad";
assert.equal(vacuumManaRule.enabled(), false);

// Spire ports and base camps below their prebuild target are exempt from the
// non-operating penalty, and each reads only the answer that names it.
context.buildings = {
  ...context.buildings,
  SpirePort: { _vueBinding: "SpirePort", _tab: "portal", stateOffCount: 1 },
  SpireBaseCamp: {
    _vueBinding: "SpireBaseCamp",
    _tab: "portal",
    stateOffCount: 1,
  },
};
const spirePort = context.buildings.SpirePort;
const spireBaseCamp = context.buildings.SpireBaseCamp;
const portShort = snapshotOf({ spirePortPrebuildIncomplete: true });
const campShort = snapshotOf({ spireBaseCampPrebuildIncomplete: true });
assert.equal(nonOperatingRule.match(spirePort, emptySnapshot), true);
assert.equal(nonOperatingRule.match(spirePort, portShort), false);
assert.equal(nonOperatingRule.match(spirePort, campShort), true);
assert.equal(nonOperatingRule.match(spireBaseCamp, emptySnapshot), true);
assert.equal(nonOperatingRule.match(spireBaseCamp, campShort), false);
assert.equal(nonOperatingRule.match(spireBaseCamp, portShort), true);

// The Neutron Citadel is judged by the snapshot's marginal draw; every other
// powered building by its own consumption.
context.resources = {
  ...context.resources,
  Power: { isUnlocked: () => true, currentQuantity: 50 },
};
context.buildings = {
  ...context.buildings,
  NeutronCitadel: { _vueBinding: "NeutronCitadel", powered: 5 },
};
const energyRule = ruleById("not-enough-energy");
const citadel = context.buildings.NeutronCitadel;
assert.equal(energyRule.enabled(), true);
assert.equal(
  energyRule.match(citadel, snapshotOf({ nextCitadelPowerDraw: 60 })),
  true,
);
assert.equal(
  energyRule.match(citadel, snapshotOf({ nextCitadelPowerDraw: 40 })),
  false,
);
assert.equal(
  energyRule.match({ _vueBinding: "Factory", powered: 60 }, emptySnapshot),
  true,
);
assert.equal(
  energyRule.match({ _vueBinding: "Factory", powered: 40 }, emptySnapshot),
  false,
);

// The tech gates and the race gates are both snapshot answers, so an `enabled`
// that combines them reads nothing live.
context.buildings = {
  ...context.buildings,
  SpaceTestLaunch: { _vueBinding: "SpaceTestLaunch", isUnlocked: () => true },
  SpireWaygate: { _vueBinding: "SpireWaygate" },
  SpireEdenicGate: { _vueBinding: "SpireEdenicGate" },
  SpireSphinx: { _vueBinding: "SpireSphinx" },
  ElysiumFireSupportBase: { _vueBinding: "ElysiumFireSupportBase", count: 100 },
  AsphodelStabilizer: { _vueBinding: "AsphodelStabilizer", count: 5 },
  AsphodelWarehouse: { _vueBinding: "AsphodelWarehouse", count: 5 },
};

const sabotageRule = ruleById("truepath-test-launch-sabotage");
assert.equal(sabotageRule.enabled(truepathSnapshot), true);
assert.equal(
  sabotageRule.enabled(snapshotOf({ truepathRace: true, worldUnified: true })),
  false,
  "a unified world can no longer be sabotaged",
);
assert.equal(sabotageRule.enabled(emptySnapshot), false);
assert.equal(
  sabotageRule.match(
    context.buildings.SpaceTestLaunch,
    snapshotOf({ truepathRace: true, testLaunchSuccessChance: 0.25 }),
  ),
  0.25,
  "the launch chance is one snapshot answer, not a per-candidate government scan",
);
assert.equal(
  sabotageRule.match(context.buildings.SpireWaygate, truepathSnapshot),
  undefined,
);
assert.equal(sabotageRule.describe(0.25), "25% chance of successful launch");
assert.equal(sabotageRule.multiplier(emptySnapshot, 0.25), 0.25);
assert.equal(
  sabotageRule.multiplier(emptySnapshot, 0.5),
  0,
  "an even chance is not worth building for",
);

const waygateRule = ruleById("spire-waygate-done");
assert.equal(waygateRule.enabled(emptySnapshot), false);
assert.equal(
  waygateRule.enabled(snapshotOf({ spireWaygateComplete: true })),
  true,
);
assert.equal(waygateRule.match(context.buildings.SpireWaygate), true);

const edenicGateRule = ruleById("spire-edenic-gate-done");
assert.equal(edenicGateRule.enabled(emptySnapshot), false);
assert.equal(
  edenicGateRule.enabled(snapshotOf({ spireEdenicGateComplete: true })),
  true,
);
assert.equal(edenicGateRule.match(context.buildings.SpireEdenicGate), true);

const sphinxRule = ruleById("spire-sphinx-done");
assert.equal(sphinxRule.enabled(emptySnapshot), false);
assert.equal(sphinxRule.enabled(snapshotOf({ spireSphinxSolved: true })), true);
assert.equal(
  sphinxRule.enabled(snapshotOf({ warlordRace: true })),
  true,
  "Harmachis is unusable during Warlord even before the Sphinx is solved",
);
assert.equal(sphinxRule.match(context.buildings.SpireSphinx), true);

const warehouseRule = ruleById("warehouse-cap");
assert.equal(warehouseRule.enabled(emptySnapshot), false);
assert.equal(
  warehouseRule.enabled(snapshotOf({ asphodelStabilizerUnlocked: true })),
  true,
);
assert.equal(warehouseRule.match(context.buildings.AsphodelStabilizer), true);

// The Fire Support Base reports the reason it is blocked, and the cap only
// applies once a hundred of them exist.
const fireSupportRule = ruleById("elysium-fire-support-base-blocked");
const fireSupportBase = context.buildings.ElysiumFireSupportBase;
assert.equal(fireSupportRule.enabled(emptySnapshot), false);
assert.equal(
  fireSupportRule.enabled(snapshotOf({ elysiumFireSupportUnlocked: true })),
  true,
);
assert.equal(
  fireSupportRule.match(
    fireSupportBase,
    snapshotOf({ elysiumGarrisonDestroyed: true }),
  ),
  "Garrison is destroyed",
);
assert.equal(
  fireSupportRule.match(fireSupportBase, emptySnapshot),
  "Missing Elerium Cannon tech",
);
assert.equal(
  fireSupportRule.match(
    fireSupportBase,
    snapshotOf({ eleriumCannonResearched: true }),
  ),
  undefined,
);
fireSupportBase.count = 99;
assert.equal(fireSupportRule.match(fireSupportBase, emptySnapshot), undefined);
assert.equal(
  fireSupportRule.match(
    context.buildings.SpireWaygate,
    snapshotOf({ elysiumGarrisonDestroyed: true }),
  ),
  undefined,
);

const assemblingRule = ruleById("assembling-not-possible");
assert.equal(
  assemblingRule.enabled(snapshotOf({ assemblyCureComplete: true })),
  false,
);
assert.equal(
  assemblingRule.enabled(
    snapshotOf({ artificialRace: true, assemblyCureComplete: true }),
  ),
  true,
);
assert.equal(
  assemblingRule.enabled(snapshotOf({ artificialRace: true })),
  false,
);

const solarRule = ruleById("solar-system-building");
assert.equal(solarRule.enabled(snapshotOf({ tauCetiReached: true })), false);
assert.equal(
  solarRule.enabled(snapshotOf({ truepathRace: true, tauCetiReached: true })),
  true,
);
assert.equal(solarRule.enabled(truepathSnapshot), false);

// The Andromeda miner rule spares the Mine only for the race that has no other
// source of Chrysotile.
const andromedaRule = ruleById("andromeda-miners-disabled");
context.settings = { ...context.settings, jobDisableMiners: true };
context.buildings = {
  ...context.buildings,
  CoalMine: { _vueBinding: "CoalMine" },
  Mine: { _vueBinding: "Mine" },
  GatewayStarbase: { _vueBinding: "GatewayStarbase", count: 1 },
};
const chrysotileOnly = snapshotOf({ mineIsOnlyChrysotileSource: true });
assert.equal(andromedaRule.enabled(), true);
assert.equal(
  andromedaRule.match(context.buildings.CoalMine, emptySnapshot),
  true,
);
assert.equal(andromedaRule.match(context.buildings.Mine, emptySnapshot), true);
assert.equal(
  andromedaRule.match(context.buildings.Mine, chrysotileOnly),
  false,
);
assert.equal(
  andromedaRule.match(context.buildings.CoalMine, chrysotileOnly),
  true,
);

// The shrine rule is one snapshot answer too; all it still does per candidate
// is recognize a Shrine.
const shrineRule = ruleById("wrong-shrine");
assert.equal(shrineRule.enabled(emptySnapshot), false);
assert.equal(
  shrineRule.enabled(snapshotOf({ shrineBonusUnwanted: true })),
  true,
);
assert.equal(shrineRule.match({ id: "city-shrine" }), true);
assert.equal(shrineRule.match({ id: "city-temple" }), false);
assert.equal(shrineRule.match({}), undefined);
assert.equal(shrineRule.describe(), "Wrong shrine");
assert.equal(shrineRule.multiplier(emptySnapshot), 0);

// The impact rule is one snapshot answer: the planet is decaying and has not
// yet been hit.
const impactRule = ruleById("destroyed-after-impact");
assert.equal(impactRule.enabled(emptySnapshot), false);
assert.equal(
  impactRule.enabled(snapshotOf({ orbitalDecayImpactPending: true })),
  true,
);

// The altar's game-side blockers are one snapshot reason; only the population
// checks are still taken per candidate, and they still win over it.
const altarRule = ruleById("sacrificial-altar-blocked");
const altar = { _id: "s_alter", count: 1 };
const cannibalSnapshot = snapshotOf({ cannibalizeRace: true });
context = {
  ...context,
  resources: {
    ...context.resources,
    Population: { currentQuantity: 10, maxQuantity: 10 },
  },
};
assert.equal(altarRule.enabled(emptySnapshot), false);
assert.equal(altarRule.enabled(cannibalSnapshot), true);
assert.equal(altarRule.match(altar, cannibalSnapshot), undefined);
assert.equal(
  altarRule.match({ _id: "s_alter", count: 0 }, cannibalSnapshot),
  undefined,
  "an altar that does not exist yet is not blocked",
);
for (const [reason, note] of [
  ["windless", "Parasites sacrificed only during windy weather"],
  ["no-default-workers", "No default workers to sacrifice"],
  ["bonus-capped", "Sacrifice bonus already high enough"],
]) {
  assert.equal(
    altarRule.match(
      altar,
      snapshotOf({ cannibalizeRace: true, sacrificeBlocked: reason }),
    ),
    note,
  );
}
context.resources.Population.currentQuantity = 9;
assert.equal(
  altarRule.match(
    altar,
    snapshotOf({ cannibalizeRace: true, sacrificeBlocked: "bonus-capped" }),
  ),
  "Sacrifices performed only with full population",
);
context.resources.Population.currentQuantity = 0;
assert.equal(altarRule.match(altar, cannibalSnapshot), "Too low population");
assert.equal(altarRule.multiplier(emptySnapshot), 0);

// The Bireme supply rate is a snapshot answer, and the Bloodstone rank that
// improves it flips which of the two ships is worth building next.
const lakeRule = ruleById("lake-transport-vs-bireme");
const lakeShip = (binding, title, count) => ({
  _vueBinding: binding,
  title,
  count,
  isAutoBuildable: () => true,
  isAffordable: () => true,
  cost: { Soul_Gem: 1 },
});
const lakeBireme = lakeShip("LakeBireme", "Bireme Warship", 4);
const lakeTransport = lakeShip("LakeTransport", "Transport", 7);
context.buildings = {
  ...context.buildings,
  LakeBireme: lakeBireme,
  LakeTransport: lakeTransport,
};
context = {
  ...context,
  resources: { ...context.resources, Lake_Support: { rateOfChange: 0 } },
};
assert.equal(lakeRule.enabled(), true);
assert.equal(lakeRule.match(lakeTransport, emptySnapshot), lakeBireme);
assert.equal(lakeRule.match(lakeBireme, emptySnapshot), undefined);
const bloodstoneSnapshot = snapshotOf({ lakeBiremeSupplyRate: 0.8 });
assert.equal(lakeRule.match(lakeBireme, bloodstoneSnapshot), lakeTransport);
assert.equal(lakeRule.match(lakeTransport, bloodstoneSnapshot), undefined);
assert.equal(
  lakeRule.describe(lakeBireme),
  "Bireme Warship gives more Supplies",
);

// Unused ejector capacity is built capacity minus the capacity the game has
// already assigned.
const ejectorRule = ruleById("unused-ejectors");
const ejector = { _vueBinding: "BlackholeMassEjector", count: 0 };
context.buildings = { ...context.buildings, BlackholeMassEjector: ejector };
assert.equal(
  ejectorRule.enabled(emptySnapshot),
  false,
  "an unbuilt ejector has no unused capacity",
);
ejector.count = 1;
assert.equal(ejectorRule.enabled(emptySnapshot), true);
assert.equal(
  ejectorRule.enabled(snapshotOf({ assignedEjectorCapacity: 950 })),
  false,
);
assert.equal(ejectorRule.match(ejector, emptySnapshot), true);
assert.equal(
  ejectorRule.multiplier(
    snapshotOf({ weights: { buildingWeightingUnusedEjectors: 0.5 } }),
  ),
  0.5,
);

// Randomized weighting is only wanted while the gas giant name contest runs.
const randomRule = ruleById("randomized-weighting");
assert.equal(randomRule.enabled(emptySnapshot), false);
assert.equal(
  randomRule.enabled(snapshotOf({ gasGiantNameContestActive: true })),
  true,
);
assert.equal(randomRule.match({ is: { random: true } }), true);
assert.equal(randomRule.multiplier(emptySnapshot), 1.5);

// Preferring the better freighter is a snapshot answer. With the preference
// off the rule multiplies by x1, which is how the executor drops it from the
// phase entirely.
const freighterRule = ruleById("best-freighter");
const freighter = { _vueBinding: "GorddonFreighter", count: 0 };
const superFreighter = {
  _vueBinding: "Alien1SuperFreighter",
  title: "Super Freighter",
  count: 0,
};
context.buildings = {
  ...context.buildings,
  GorddonFreighter: freighter,
  Alien1SuperFreighter: superFreighter,
};
assert.equal(
  freighterRule.match(freighter, emptySnapshot),
  superFreighter,
  "the Super Freighter carries more Money per crew at equal counts",
);
assert.equal(
  freighterRule.describe(superFreighter),
  "Super Freighter gives more Money",
);
assert.equal(freighterRule.multiplier(emptySnapshot), 1);
assert.equal(
  freighterRule.multiplier(snapshotOf({ buildBestFreighterOnly: true })),
  0,
);

console.log("Weighting policy module tests passed");
