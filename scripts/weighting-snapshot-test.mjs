import assert from "node:assert/strict";
import { createWeightingSnapshotReader } from "../src/adapters/evolve/progression/build/weighting-snapshot.ts";

const validState = () => ({
  queuedTargets: [],
  triggerTargets: [],
  knowledgeRequiredByTechs: 0,
  knowledgeRequiredByBuildTargets: 0,
  cheapestTechKnowledge: 0,
});

let state = validState();
let gates = {};
const off = () => false;
// Every weighting multiplier is written by the settings defaults on load, so a
// zero baseline is a valid reading rather than an absent one.
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
const defaultGates = () => ({
  getWeightingMultiplier: () => 0,
  isBestFreighterOnly: off,
  isAutoBuildEnabled: off,
  isAutoFleetEnabled: off,
  isMinerJobsDisabled: off,
  isTransportComparedBySoulGems: off,
  getPrestigeType: () => "none",
  isPrestigeConstructionLimited: off,
  isSavingSoulGemsForPrestige: off,
  isAuthorityManaged: off,
  getMinimumAuthority: () => 0,
  getEmbassyKnowledgeTarget: () => 0,
  getSlaveIncomeTarget: () => 0,
  // The resource wrapper defaults every quantity to zero and every storage
  // requirement to one until the game unlocks the resource, and its storage
  // ratio reads as a full 1 while the cap is still zero.
  getResourceQuantity: () => 0,
  getResourceCapacity: () => 0,
  getResourceIncome: () => 0,
  getResourceStorageRatio: () => 1,
  isResourceUnlocked: off,
  getSpareResourceQuantity: () => 0,
  getRequiredResourceStorage: () => 1,
  getMissionMaxResourceCost: () => 0,
  getResourceTitle: () => "Horseshoe",
  // A building that no run has reached yet is locked, unbuilt, and — because
  // its AutoBuild setting has not been written — not auto-buildable either.
  getBuildingCount: () => 0,
  getBuildingOnCount: () => 0,
  getBuildingName: (building) => building,
  getBuildingTitle: (building) => `${building} Title`,
  getBuildingSoulGemCost: () => undefined,
  isBuildingUnlocked: off,
  isBuildingAutoBuildable: () => undefined,
  isBuildingAffordable: off,
  isAchievementGuardsEnabled: off,
  isBananaRepublicGuardEnabled: off,
  isGalaxyAssaultPending: off,
  isStargatePiracySupressed: off,
  isGalaxyPiracyCoveredByFleet: off,
  isLumberRace: off,
  hasRaceTrait: off,
  getForeignGovernment: () => ({}),
  getWindSpeed: () => 1,
  getDefaultJobWorkers: () => 5,
  getSacrificeBonus: () => 0,
  getSpireBloodstoneRank: () => undefined,
  getAssignedEjectorCapacity: () => undefined,
  getTechLevel: () => undefined,
  isBananaRepublicObjectiveComplete: off,
  isInflationAssistActive: off,
  isInflationMoneyReachable: off,
  isRetirementAssistActive: off,
  getRetirementPreparationMissing: () => [],
  isAchievementGuardActive: off,
  getForeignAchievementGoal: () => null,
  isHellSupressUseful: off,
  isGateTowerSupressionTooLow: off,
  isGateDemonsSupressed: off,
  isGuardPostPrebuildIncomplete: off,
  getSpirePrebuildShortfall: () => ({ ports: false, baseCamps: false }),
  getNextCitadelPowerDraw: () => 30,
  isTechResearched: off,
  isShrineBonusUnwanted: off,
  isGECKNeeded: off,
  isPrestigeAllowed: off,
  isPillarFinished: off,
  isMadPrestigeAwaited: off,
  getMechSupplySavingReason: () => null,
  isWomlingStatEarned: off,
});
gates = defaultGates();
const read = createWeightingSnapshotReader({
  getState: () => state,
  ...Object.fromEntries(
    Object.keys(defaultGates()).map((name) => [
      name,
      (...args) => gates[name](...args),
    ]),
  ),
});

// The uninitialized state the runtime installs before the first cycle reads as
// a valid empty snapshot.
const empty = read();
assert.equal(Object.isFrozen(empty), true);
assert.equal(Object.isFrozen(empty.weights), true);
assert.deepEqual(
  [...Object.keys(empty.weights)].sort(),
  [...WEIGHT_NAMES].sort(),
  "the snapshot carries exactly the weighting multipliers the rules read",
);
assert.equal(empty.buildBestFreighterOnly, false);
assert.equal(empty.autoBuildEnabled, false);
assert.equal(empty.autoFleetEnabled, false);
assert.equal(empty.minerJobsDisabled, false);
assert.equal(empty.prestigeRoute, "other");
assert.equal(empty.limitPrestigeConstruction, false);
assert.equal(empty.saveSoulGemsForPrestige, false);
assert.equal(empty.authorityCapBelowTarget, false);
assert.equal(empty.embassyKnowledgeTarget, 0);
// An uninitialized pen holds nobody and has room for nobody, which is the
// "already full" reading the Slave Market rule has always taken.
assert.equal(empty.slavePensFull, true);
assert.equal(empty.slaveIncomeInsufficient, false);
assert.equal(empty.bananaRepublicGuardActive, false);
assert.equal(empty.queuedTargets.size, 0);
assert.equal(empty.triggerTargets.size, 0);
assert.equal(empty.knowledgeRequiredByTechs, 0);
assert.equal(empty.knowledgeRequiredByBuildTargets, 0);
assert.equal(empty.cheapestTechKnowledge, 0);
assert.equal(empty.knowledgeCapacity, 0);
assert.equal(empty.soulGemQuantity, 0);
assert.equal(empty.lakeSupportSpare, 0);
assert.equal(empty.tauBeltSupportAvailable, 0);
assert.equal(empty.tauBeltSupportUsed, 0);
assert.equal(empty.powerUnlocked, false);
assert.equal(empty.powerSurplus, 0);
assert.equal(empty.unpoweredPowerDemand, 0);
assert.equal(empty.populationAtCap, true);
assert.equal(empty.populationEmpty, true);
assert.equal(empty.housingUnderused, false);
assert.equal(empty.unusedStorageParts, false);
assert.equal(empty.storagePartsAllAssigned, false);
assert.equal(empty.oilStorageBelowMissionCost, false);
assert.equal(empty.heliumStorageBelowMissionCost, false);
assert.equal(empty.horseshoesSufficient, false);
assert.equal(empty.horseshoeTitle, "Horseshoe");
assert.equal(empty.zenBelowCap, false);
assert.equal(empty.testLaunchUnlocked, false);
assert.equal(empty.erisDigsiteUnsecured, false);
assert.equal(empty.andromedaReached, false);
assert.equal(empty.freighterChoice, null);
assert.equal(empty.lakeShipChoice, null);
assert.equal(empty.spireSupplyChoice, null);
assert.equal(empty.asphodelWarehouseCount, 0);
assert.equal(empty.embassyMissing, true);
assert.equal(empty.matrioshkaBrainIncomplete, true);
assert.equal(empty.unusedEjectorCapacity, 0);
assert.equal(empty.noOilProduction, true);
assert.equal(empty.galaxyAssaultPending, false);
assert.equal(empty.stargatePiracySupressed, false);
assert.equal(empty.galaxyPiracyCoveredByFleet, false);
assert.equal(empty.truepathRace, false);
assert.equal(empty.truepathAiApocalypse, false);
assert.equal(empty.truepathAiProgress, 0);
assert.equal(empty.truepathAiBuildingTarget, null);
assert.equal(empty.truepathAiTargetColonists, 0);
assert.equal(empty.mineIsOnlyChrysotileSource, false);
assert.equal(empty.witchHunterRace, false);
assert.equal(empty.warlordRace, false);
assert.equal(empty.artificialRace, false);
assert.equal(empty.slaverRace, false);
assert.equal(empty.cannibalizeRace, false);
assert.equal(empty.sacrificeBlocked, null);
assert.equal(empty.bananaRace, false);
assert.equal(empty.loneSurvivorRace, false);
assert.equal(empty.hoovedRace, false);
assert.equal(empty.calmRace, false);
assert.equal(empty.orbitalDecayImpactPending, false);
assert.equal(empty.bananaColliderObjectiveComplete, false);
assert.equal(empty.inflationAssistActive, false);
assert.equal(empty.inflationMoneyReachable, false);
assert.equal(empty.retirementPreparationIncomplete, false);
assert.equal(empty.guardDreadedActive, false);
assert.equal(empty.guardEnergeticActive, false);
assert.equal(empty.guardRedDeadActive, false);
assert.equal(empty.guardPacifistActive, false);
assert.equal(empty.foreignAchievementGoal, null);
assert.equal(empty.hellSupressUseful, false);
assert.equal(empty.gateTowerSupressionTooLow, false);
assert.equal(empty.gateDemonsSupressed, false);
assert.equal(empty.hellGuardPostPrebuildIncomplete, false);
assert.equal(empty.spirePortPrebuildIncomplete, false);
assert.equal(empty.spireBaseCampPrebuildIncomplete, false);
assert.equal(empty.nextCitadelPowerDraw, 30);
assert.equal(empty.worldUnified, false);
assert.equal(empty.testLaunchSuccessChance, 0);
assert.equal(empty.spireWaygateComplete, false);
assert.equal(empty.spireEdenicGateComplete, false);
assert.equal(empty.elysiumFireSupportUnlocked, false);
assert.equal(empty.elysiumGarrisonDestroyed, false);
assert.equal(empty.eleriumCannonResearched, false);
assert.equal(empty.asphodelStabilizerUnlocked, false);
assert.equal(empty.spireSphinxSolved, false);
assert.equal(empty.assemblyCureComplete, false);
assert.equal(empty.tauCetiReached, false);
assert.equal(empty.gasGiantNameContestActive, false);
assert.equal(empty.shrineBonusUnwanted, false);
assert.equal(empty.geckNeeded, false);
assert.equal(empty.prestigeEdenAllowed, false);
assert.equal(empty.prestigeRetireAllowed, false);
assert.equal(empty.pillarFinished, false);
assert.equal(empty.madPrestigeAwaited, false);
assert.equal(empty.mechSupplySaving, null);
assert.deepEqual(
  empty.womlingOverlordActions,
  [],
  "a run that is not True Path has no Womlings to contact",
);

// Each multiplier is read from its own setting: distinct values must survive
// the sample unswapped.
const distinctWeights = Object.fromEntries(
  WEIGHT_NAMES.map((name, index) => [name, index + 0.5]),
);
gates = {
  ...defaultGates(),
  getWeightingMultiplier: (setting) => distinctWeights[setting],
  isBestFreighterOnly: () => true,
};
const configured = read();
assert.deepEqual(configured.weights, distinctWeights);
assert.equal(configured.buildBestFreighterOnly, true);
gates = defaultGates();

// Only the routes the weighting rules distinguish keep their own name.
for (const route of [
  "bioseed",
  "whitehole",
  "vacuum",
  "ascension",
  "terraform",
]) {
  gates = { ...defaultGates(), getPrestigeType: () => route };
  assert.equal(read().prestigeRoute, route);
}
for (const route of ["none", "mad", "demonic", "matrix", "apotheosis"]) {
  gates = { ...defaultGates(), getPrestigeType: () => route };
  assert.equal(
    read().prestigeRoute,
    "other",
    `${route} is not a route the weighting rules distinguish`,
  );
}

// The Authority answer folds in the management toggle, the unlock, and the cap
// comparison: an unmanaged cap is no target at all, and the minimum is not even
// read.
let authorityReads = 0;
gates = {
  ...defaultGates(),
  getMinimumAuthority: () => {
    authorityReads++;
    return 250;
  },
};
assert.equal(read().authorityCapBelowTarget, false);
assert.equal(authorityReads, 0);
const managedAuthority = (unlocked, cap, minimum = 250) => ({
  ...defaultGates(),
  isAuthorityManaged: () => true,
  getMinimumAuthority: () => minimum,
  isResourceUnlocked: (resource) =>
    resource === "Authority" ? unlocked : false,
  getResourceCapacity: (resource) => (resource === "Authority" ? cap : 0),
});
gates = managedAuthority(true, 80);
assert.equal(read().authorityCapBelowTarget, true);
gates = managedAuthority(true, 250);
assert.equal(
  read().authorityCapBelowTarget,
  false,
  "a cap that already reaches the target needs no more Authority buildings",
);
gates = managedAuthority(false, 80);
assert.equal(
  read().authorityCapBelowTarget,
  false,
  "locked Authority is never below target",
);
gates = managedAuthority(true, 0, 0);
assert.equal(
  read().authorityCapBelowTarget,
  false,
  "a zero minimum is no target even while management is on",
);

// The Slave Market answers: a full pen blocks the market outright, and money
// that is about to cap counts as excess regardless of income.
const money = (currentQuantity, rateOfChange, maxQuantity, target) => ({
  ...defaultGates(),
  getSlaveIncomeTarget: () => target,
  getResourceQuantity: (resource) =>
    resource === "Money" ? currentQuantity : 0,
  getResourceIncome: (resource) => (resource === "Money" ? rateOfChange : 0),
  getResourceCapacity: (resource) => (resource === "Money" ? maxQuantity : 0),
});
gates = money(100, 10, 1000, 50);
assert.equal(read().slaveIncomeInsufficient, true);
gates = money(100, 60, 1000, 50);
assert.equal(
  read().slaveIncomeInsufficient,
  false,
  "income above the target affords slaves",
);
gates = money(1000, 10, 1000, 50);
assert.equal(
  read().slaveIncomeInsufficient,
  false,
  "money at its cap is excess money whatever the income is",
);
gates = {
  ...defaultGates(),
  getResourceQuantity: (resource) => (resource === "Slave" ? 3 : 0),
  getResourceCapacity: (resource) => (resource === "Slave" ? 10 : 0),
};
assert.equal(read().slavePensFull, false);

// Power reads three separate questions off one resource: the unlock, the
// surplus one more building can draw, and what the switched-off buildings want.
gates = {
  ...defaultGates(),
  isResourceUnlocked: (resource) => resource === "Power",
  getResourceQuantity: (resource) => (resource === "Power" ? 12 : 0),
  getResourceCapacity: (resource) => (resource === "Power" ? 30 : 0),
};
let power = read();
assert.equal(power.powerUnlocked, true);
assert.equal(power.powerSurplus, 12);
assert.equal(power.unpoweredPowerDemand, 30);
// `Power.isUnlocked()` forwards `global.city.powered`, which is absent before
// the city has power at all.
gates = { ...defaultGates(), isResourceUnlocked: () => undefined };
assert.equal(read().powerUnlocked, false);

// Population answers three thresholds, and the housing question needs both a
// cap worth having and real room inside it.
const population = (currentQuantity, maxQuantity) => ({
  ...defaultGates(),
  getResourceQuantity: (resource) =>
    resource === "Population" ? currentQuantity : 0,
  getResourceCapacity: (resource) =>
    resource === "Population" ? maxQuantity : 0,
  getResourceStorageRatio: (resource) =>
    resource === "Population" ? currentQuantity / maxQuantity : 1,
});
gates = population(100, 100);
let people = read();
assert.equal(people.populationAtCap, true);
assert.equal(people.populationEmpty, false);
assert.equal(people.housingUnderused, false);
gates = population(80, 100);
people = read();
assert.equal(people.populationAtCap, false);
assert.equal(people.housingUnderused, true);
gates = population(40, 50);
assert.equal(
  read().housingUnderused,
  false,
  "a cap of 50 or less is too small to call the housing underused",
);
gates = population(0, 100);
assert.equal(read().populationEmpty, true);

// Crates and containers answer the opposite storage questions off the same two
// ratios.
const storageParts = (crateRatio, containerRatio, anyUnlocked = true) => ({
  ...defaultGates(),
  isResourceUnlocked: (resource) =>
    anyUnlocked && (resource === "Crates" || resource === "Containers"),
  getResourceStorageRatio: (resource) =>
    resource === "Crates"
      ? crateRatio
      : resource === "Containers"
        ? containerRatio
        : 1,
});
gates = storageParts(0.5, 1);
let parts = read();
assert.equal(parts.unusedStorageParts, true);
assert.equal(parts.storagePartsAllAssigned, false);
gates = storageParts(1, 1);
parts = read();
assert.equal(parts.unusedStorageParts, false);
assert.equal(parts.storagePartsAllAssigned, true);
gates = storageParts(1, 1, false);
assert.equal(
  read().storagePartsAllAssigned,
  false,
  "storage parts nobody has unlocked are not all assigned",
);

// Fuel storage is compared against the most expensive mission that needs it,
// and Helium-3 is only asked once it exists.
const fuel = (oilCap, oilCost, heliumCap, heliumCost, heliumUnlocked) => ({
  ...defaultGates(),
  isResourceUnlocked: (resource) =>
    resource === "Helium_3" ? heliumUnlocked : false,
  getResourceCapacity: (resource) =>
    resource === "Oil" ? oilCap : resource === "Helium_3" ? heliumCap : 0,
  getMissionMaxResourceCost: (resource) =>
    resource === "Oil" ? oilCost : resource === "Helium_3" ? heliumCost : 0,
});
gates = fuel(100, 500, 0, 0, false);
let fuels = read();
assert.equal(fuels.oilStorageBelowMissionCost, true);
assert.equal(fuels.heliumStorageBelowMissionCost, false);
gates = fuel(500, 500, 100, 500, false);
fuels = read();
assert.equal(fuels.oilStorageBelowMissionCost, false);
assert.equal(
  fuels.heliumStorageBelowMissionCost,
  false,
  "locked Helium-3 storage is never short",
);
gates = fuel(500, 500, 100, 500, true);
assert.equal(read().heliumStorageBelowMissionCost, true);

// The remaining single-resource answers.
gates = {
  ...defaultGates(),
  getResourceQuantity: (resource) =>
    resource === "Soul_Gem" ? 42 : resource === "Zen" ? 3 : 0,
  getResourceCapacity: (resource) => (resource === "Zen" ? 10 : 0),
  getResourceIncome: (resource) => (resource === "Lake_Support" ? 4 : 0),
  getSpareResourceQuantity: (resource) => (resource === "Horseshoe" ? 12 : 0),
  getRequiredResourceStorage: (resource) => (resource === "Horseshoe" ? 5 : 1),
  getResourceTitle: () => "Horseshoes",
};
const singles = read();
assert.equal(singles.soulGemQuantity, 42);
assert.equal(singles.zenBelowCap, true);
assert.equal(singles.lakeSupportSpare, 4);
assert.equal(singles.horseshoesSufficient, true);
assert.equal(singles.horseshoeTitle, "Horseshoes");

// Tau Belt security is the ratio of the support the belt provides to what its
// ships already take.
gates = {
  ...defaultGates(),
  getResourceCapacity: (resource) => (resource === "Tau_Belt_Support" ? 6 : 0),
  getResourceQuantity: (resource) => (resource === "Tau_Belt_Support" ? 9 : 0),
};
const belt = read();
assert.equal(belt.tauBeltSupportAvailable, 6);
assert.equal(belt.tauBeltSupportUsed, 9);

// The Banana Republic guard needs both its own toggle and the master one.
for (const [guards, banana, active] of [
  [false, false, false],
  [true, false, false],
  [false, true, false],
  [true, true, true],
]) {
  gates = {
    ...defaultGates(),
    isAchievementGuardsEnabled: () => guards,
    isBananaRepublicGuardEnabled: () => banana,
  };
  assert.equal(read().bananaRepublicGuardActive, active);
}
gates = defaultGates();

// Membership is by catalog key, which only a building carries: an ARPA project
// shares these target lists and must not be mistaken for a build candidate.
const queued = { catalogKey: "Bank" };
const triggered = { catalogKey: "Temple" };
const queuedProject = { _vueBinding: "arpa-monument" };
state = {
  ...validState(),
  queuedTargets: [queued, queuedProject],
  triggerTargets: [triggered],
  knowledgeRequiredByTechs: 1_500,
  knowledgeRequiredByBuildTargets: 900,
  cheapestTechKnowledge: 250,
};
const sample = read();
assert.equal(sample.queuedTargets.has("Bank"), true);
assert.equal(sample.queuedTargets.has("Temple"), false);
assert.equal(sample.queuedTargets.size, 1, "the queued project is skipped");
assert.equal(sample.triggerTargets.has("Temple"), true);
assert.equal(sample.knowledgeRequiredByTechs, 1_500);
assert.equal(sample.knowledgeRequiredByBuildTargets, 900);
assert.equal(sample.cheapestTechKnowledge, 250);

// Later target-list mutation cannot reach an already-sampled snapshot.
state.queuedTargets.push(triggered);
assert.equal(sample.queuedTargets.has("Temple"), false);
assert.equal(read().queuedTargets.has("Temple"), true);

state = validState();

// Each gate is asked exactly the question its snapshot field names.
const askedObjectives = [];
const askedGuards = [];
const askedPrestiges = [];
const askedWomlingStats = [];
const askedTechs = [];
gates = {
  ...defaultGates(),
  isGalaxyAssaultPending: () => true,
  isStargatePiracySupressed: () => true,
  isGalaxyPiracyCoveredByFleet: () => true,
  isLumberRace: () => true,
  isBananaRepublicObjectiveComplete: (objective) => {
    askedObjectives.push(objective);
    return true;
  },
  isInflationAssistActive: () => true,
  isInflationMoneyReachable: () => true,
  isAchievementGuardActive: (guard) => {
    askedGuards.push(guard);
    return guard !== "guardPacifist";
  },
  getForeignAchievementGoal: () => "syndicate",
  isHellSupressUseful: () => true,
  isGateTowerSupressionTooLow: () => true,
  isGateDemonsSupressed: () => true,
  isGuardPostPrebuildIncomplete: () => true,
  getSpirePrebuildShortfall: () => ({ ports: true, baseCamps: false }),
  getNextCitadelPowerDraw: () => 172.5,
  getSpireBloodstoneRank: () => 2,
  getAssignedEjectorCapacity: () => 1_500,
  getTechLevel: () => 1,
  isTechResearched: (research, level) => {
    askedTechs.push(`${research}:${level}`);
    return research !== "isle";
  },
  isGECKNeeded: () => true,
  isPrestigeAllowed: (prestige) => {
    askedPrestiges.push(prestige);
    return prestige === "eden";
  },
  isPillarFinished: () => true,
  isShrineBonusUnwanted: () => true,
  isMadPrestigeAwaited: () => true,
  getMechSupplySavingReason: () => "saving",
  isWomlingStatEarned: (stat) => {
    askedWomlingStats.push(stat);
    return stat !== "lord";
  },
};
const gated = read();
assert.deepEqual(askedObjectives, ["b2"]);
assert.deepEqual(askedGuards, [
  "guardDreaded",
  "guardEnergetic",
  "guardRedDead",
  "guardPacifist",
]);
assert.deepEqual(askedPrestiges, ["eden", "retire"]);
assert.equal(gated.galaxyAssaultPending, true);
assert.equal(gated.stargatePiracySupressed, true);
assert.equal(gated.galaxyPiracyCoveredByFleet, true);
assert.equal(gated.bananaColliderObjectiveComplete, true);
assert.equal(gated.inflationAssistActive, true);
assert.equal(gated.inflationMoneyReachable, true);
assert.equal(gated.guardDreadedActive, true);
assert.equal(gated.guardEnergeticActive, true);
assert.equal(gated.guardRedDeadActive, true);
assert.equal(gated.guardPacifistActive, false);
assert.equal(gated.foreignAchievementGoal, "syndicate");
assert.equal(gated.hellSupressUseful, true);
assert.equal(gated.gateTowerSupressionTooLow, true);
assert.equal(gated.gateDemonsSupressed, true);
assert.equal(gated.hellGuardPostPrebuildIncomplete, true);
assert.equal(gated.spirePortPrebuildIncomplete, true);
assert.equal(gated.spireBaseCampPrebuildIncomplete, false);
assert.equal(gated.nextCitadelPowerDraw, 172.5);
assert.equal(gated.unusedEjectorCapacity, -1_500);
assert.equal(gated.gasGiantNameContestActive, true);
assert.deepEqual(askedTechs, [
  "world_control:1",
  "waygate:2",
  "edenic:3",
  "elysium:8",
  "isle:2",
  "elysium:10",
  "asphodel:8",
  "hell_spire:8",
  "focus_cure:7",
  "tauceti:2",
]);
assert.equal(gated.worldUnified, true);
assert.equal(gated.spireWaygateComplete, true);
assert.equal(gated.spireEdenicGateComplete, true);
assert.equal(gated.elysiumFireSupportUnlocked, true);
assert.equal(gated.elysiumGarrisonDestroyed, false);
assert.equal(gated.eleriumCannonResearched, true);
assert.equal(gated.asphodelStabilizerUnlocked, true);
assert.equal(gated.spireSphinxSolved, true);
assert.equal(gated.assemblyCureComplete, true);
assert.equal(gated.tauCetiReached, true);
assert.equal(gated.shrineBonusUnwanted, true);
assert.equal(gated.geckNeeded, true);
assert.equal(gated.prestigeEdenAllowed, true);
assert.equal(gated.prestigeRetireAllowed, false);
assert.equal(gated.pillarFinished, true);
assert.equal(gated.madPrestigeAwaited, true);
assert.equal(gated.mechSupplySaving, "saving");
assert.deepEqual(
  askedWomlingStats,
  [],
  "a run outside True Path never asks after a Womling stat",
);

// The three Womling contacts are sampled in Overlord achievement order, each
// with the stat it earns and whether AutoBuild could build it right now.
const womlingBuildable = [];
gates = {
  ...defaultGates(),
  hasRaceTrait: (trait) => trait === "truepath",
  isWomlingStatEarned: (stat) => stat !== "lord",
  isBuildingAutoBuildable: (building) => {
    womlingBuildable.push(building);
    return building === "TauRedSubjugate" ? undefined : true;
  },
};
assert.deepEqual(read().womlingOverlordActions, [
  {
    id: "TauRedContact",
    name: "TauRedContact",
    statEarned: true,
    autoBuildable: true,
  },
  {
    id: "TauRedIntroduce",
    name: "TauRedIntroduce",
    statEarned: true,
    autoBuildable: true,
  },
  {
    id: "TauRedSubjugate",
    name: "TauRedSubjugate",
    statEarned: false,
    autoBuildable: false,
  },
]);
assert.deepEqual(womlingBuildable.slice(-3), [
  "TauRedContact",
  "TauRedIntroduce",
  "TauRedSubjugate",
]);
gates = defaultGates();

// The tech gates keep the game's lenient coercion: `haveTech` answers
// `undefined` for a research the run has never started and `0` for one recorded
// at level 0, and neither may become a malformed-input rejection.
for (const absent of [undefined, 0, false]) {
  gates = { ...defaultGates(), isTechResearched: () => absent };
  assert.equal(read().tauCetiReached, false);
}
gates = { ...defaultGates(), isTechResearched: () => true };
assert.equal(read().tauCetiReached, true);

// The other mech-saving reason survives the same validation.
gates = { ...defaultGates(), getMechSupplySavingReason: () => "building" };
assert.equal(read().mechSupplySaving, "building");

// The race gates keep the game's lenient coercion too: `global.race[trait]` is
// absent unless the race has the trait, and carries a numeric rank when it does.
const ALL_RACE_TRAITS = [
  "truepath",
  "cannibalize",
  "smoldering",
  "sappy",
  "witch_hunter",
  "warlord",
  "artifical",
  "slaver",
  "parasite",
  "banana",
  "lone_survivor",
  "hooved",
  "calm",
  "orbit_decay",
  "orbit_decayed",
];
let askedRaceTraits = [];
const withTraits = (...owned) => {
  const held = new Set(owned);
  askedRaceTraits = [];
  return {
    ...defaultGates(),
    hasRaceTrait: (trait) => {
      askedRaceTraits.push(trait);
      return held.has(trait) ? 2 : undefined;
    },
  };
};

gates = withTraits(...ALL_RACE_TRAITS);
const raced = read();
assert.deepEqual(askedRaceTraits, ALL_RACE_TRAITS);
assert.equal(raced.truepathRace, true);
assert.equal(raced.mineIsOnlyChrysotileSource, true);
assert.equal(raced.witchHunterRace, true);
assert.equal(raced.warlordRace, true);
assert.equal(raced.artificialRace, true);
assert.equal(raced.slaverRace, true);
assert.equal(raced.cannibalizeRace, true);
assert.equal(raced.sacrificeBlocked, null);
assert.equal(raced.bananaRace, true);
assert.equal(raced.loneSurvivorRace, true);
assert.equal(raced.hoovedRace, true);
assert.equal(raced.calmRace, true);
// The impact has already happened, so nothing more can be destroyed by it.
assert.equal(raced.orbitalDecayImpactPending, false);

gates = {
  ...withTraits("truepath"),
  getPrestigeType: () => "none",
  getTechLevel: (research) => (research === "titan_ai_core" ? 3 : undefined),
  getBuildingCount: (building) =>
    ({
      TitanDecoder: 4,
      TitanAIColonist: 0,
    })[building] ?? 0,
  getBuildingOnCount: (building) =>
    ({
      TitanDecoder: 4,
      TitanAIColonist: 0,
      ErisTrooper: 13,
      ErisTank: 7,
    })[building] ?? 0,
};
const aiApocalypse = read();
assert.equal(aiApocalypse.truepathAiApocalypse, true);
assert.equal(aiApocalypse.truepathAiProgress, 40);
assert.equal(aiApocalypse.truepathAiBuildingTarget, "TitanAIColonist");
assert.equal(aiApocalypse.truepathAiTargetColonists, 43);

gates = withTraits("orbit_decay");
assert.equal(read().orbitalDecayImpactPending, true);

// A smoldering race that still has quarry workers gets its Chrysotile from
// them, and a race that is not smoldering never has the sappy read taken.
gates = withTraits("smoldering");
assert.equal(read().mineIsOnlyChrysotileSource, false);
assert.equal(askedRaceTraits.includes("sappy"), true);
gates = withTraits("sappy");
assert.equal(read().mineIsOnlyChrysotileSource, false);
assert.equal(askedRaceTraits.includes("sappy"), false);

// The retirement preparation read is skipped while the assist is inactive, and
// an empty shortfall list still reads as prepared.
let preparationReads = 0;
const countedPreparation = (missing) => ({
  ...defaultGates(),
  isRetirementAssistActive: () => missing !== null,
  getRetirementPreparationMissing: () => {
    preparationReads++;
    return missing ?? [];
  },
});
gates = countedPreparation(null);
assert.equal(read().retirementPreparationIncomplete, false);
assert.equal(preparationReads, 0);
gates = countedPreparation([]);
assert.equal(read().retirementPreparationIncomplete, false);
assert.equal(preparationReads, 1);
gates = countedPreparation(["20 Fusion Generator"]);
assert.equal(read().retirementPreparationIncomplete, true);
assert.equal(preparationReads, 2);

// The Test Launch chance is only sampled for a True Path run. Every foreign
// government the player does not control adds one saboteur, and `occ`, `anx`,
// and `buy` are absent until that government is taken.
const withGovernments = (...governments) => ({
  ...defaultGates(),
  hasRaceTrait: (trait) => trait === "truepath",
  getForeignGovernment: (index) => governments[index],
});
gates = withGovernments({}, {}, {});
assert.equal(read().testLaunchSuccessChance, 1 / 5);
gates = withGovernments({ occ: true }, { anx: true }, { buy: true });
assert.equal(read().testLaunchSuccessChance, 1 / 2);
gates = withGovernments({ occ: true }, {}, {});
assert.equal(read().testLaunchSuccessChance, 1 / 4);
let governmentReads = 0;
gates = {
  ...defaultGates(),
  getForeignGovernment: () => {
    governmentReads++;
    return {};
  },
};
assert.equal(read().testLaunchSuccessChance, 0);
assert.equal(governmentReads, 0, "no other run has a Test Launch to sabotage");

// The altar reads are only taken for a race that can sacrifice, and report the
// first reason that blocks it.
const sacrificeGates = (overrides = {}) => ({
  ...defaultGates(),
  hasRaceTrait: (trait) => trait === "cannibalize",
  ...overrides,
});
gates = sacrificeGates();
assert.equal(read().sacrificeBlocked, null);
gates = sacrificeGates({ getDefaultJobWorkers: () => 0 });
assert.equal(read().sacrificeBlocked, "no-default-workers");
gates = sacrificeGates({ getWindSpeed: () => 0 });
assert.equal(
  read().sacrificeBlocked,
  null,
  "only a parasite race needs windy weather",
);
gates = {
  ...defaultGates(),
  hasRaceTrait: (trait) => trait === "cannibalize" || trait === "parasite",
  getWindSpeed: () => 0,
  getDefaultJobWorkers: () => 0,
};
assert.equal(read().sacrificeBlocked, "windless");

// Every bonus over the cap blocks the sacrifice. `s_alter` bonuses are absent
// until first raised, and the harvest bonus only counts for a lumber race.
gates = sacrificeGates({ getSacrificeBonus: () => 3_600 });
assert.equal(read().sacrificeBlocked, "bonus-capped");
gates = sacrificeGates({
  getSacrificeBonus: (bonus) => (bonus === "mine" ? 3_599 : 3_600),
});
assert.equal(read().sacrificeBlocked, null);
const withoutHarvest = (bonus) => (bonus === "harvest" ? undefined : 3_600);
gates = sacrificeGates({ getSacrificeBonus: withoutHarvest });
assert.equal(read().sacrificeBlocked, "bonus-capped");
gates = sacrificeGates({
  getSacrificeBonus: withoutHarvest,
  isLumberRace: () => true,
});
assert.equal(read().sacrificeBlocked, null);

let altarReads = 0;
gates = {
  ...defaultGates(),
  getDefaultJobWorkers: () => {
    altarReads++;
    return 5;
  },
};
assert.equal(read().sacrificeBlocked, null);
assert.equal(
  altarReads,
  0,
  "a race that cannot sacrifice reads no altar state",
);

// Unused ejector capacity is what the built ejectors handle minus what the game
// has assigned. The assignment is absent until the first ejector is built, and
// no ejector means no unused capacity at all.
gates = {
  ...defaultGates(),
  getBuildingCount: (building) => (building === "BlackholeMassEjector" ? 3 : 0),
  getAssignedEjectorCapacity: () => 2_400,
};
assert.equal(read().unusedEjectorCapacity, 600);
gates = {
  ...defaultGates(),
  getBuildingCount: (building) => (building === "BlackholeMassEjector" ? 3 : 0),
};
assert.equal(
  read().unusedEjectorCapacity,
  3_000,
  "an ejector with nothing assigned to it is entirely unused",
);

// The remaining named-building questions the rules ask about the run.
const withBuildings = (counts = {}, overrides = {}) => ({
  ...defaultGates(),
  getBuildingCount: (building) => counts[building] ?? 0,
  ...overrides,
});
gates = withBuildings({}, { isBuildingUnlocked: () => true });
let named = read();
assert.equal(named.testLaunchUnlocked, true);
assert.equal(named.erisDigsiteUnsecured, true);
gates = withBuildings({ ErisDigsite: 100 }, { isBuildingUnlocked: () => true });
assert.equal(
  read().erisDigsiteUnsecured,
  false,
  "a hundred digsites secure it",
);
gates = withBuildings({ ErisDigsite: 42 });
assert.equal(
  read().erisDigsiteUnsecured,
  false,
  "a locked digsite is not an unsecured one",
);
gates = withBuildings({ GatewayStarbase: 1 });
assert.equal(read().andromedaReached, true);
gates = withBuildings({ GorddonEmbassy: 1, TauGas2MatrioshkaBrain: 1_000 });
named = read();
assert.equal(named.embassyMissing, false);
assert.equal(named.matrioshkaBrainIncomplete, false);
gates = withBuildings({ OilWell: 1 });
assert.equal(read().noOilProduction, false);
gates = withBuildings({ GasMoonOilExtractor: 1 });
assert.equal(read().noOilProduction, false);

// A paired-building choice is only open while both halves are auto-buildable
// and affordable right now.
const pairChoice = (buildable, affordable) =>
  withBuildings(
    {},
    {
      isBuildingAutoBuildable: (building) => buildable.includes(building),
      isBuildingAffordable: (building) => affordable.includes(building),
    },
  );
const BOTH_FREIGHTERS = ["GorddonFreighter", "Alien1SuperFreighter"];
// At equal counts the Super Freighter carries more Money per crew member.
gates = pairChoice(BOTH_FREIGHTERS, BOTH_FREIGHTERS);
assert.deepEqual(read().freighterChoice, {
  worseId: "GorddonFreighter",
  betterTitle: "Alien1SuperFreighter Title",
});
gates = pairChoice(BOTH_FREIGHTERS, ["GorddonFreighter"]);
assert.equal(
  read().freighterChoice,
  null,
  "one unaffordable freighter closes the choice",
);
gates = pairChoice(["GorddonFreighter"], BOTH_FREIGHTERS);
assert.equal(read().freighterChoice, null);
// Enough regular freighters, and each further one adds more per crew than the
// super freighter does.
gates = {
  ...pairChoice(BOTH_FREIGHTERS, BOTH_FREIGHTERS),
  getBuildingCount: (building) =>
    building === "Alien1SuperFreighter" ? 20 : 0,
};
assert.deepEqual(read().freighterChoice, {
  worseId: "Alien1SuperFreighter",
  betterTitle: "GorddonFreighter Title",
});

const BOTH_LAKE_SHIPS = ["LakeBireme", "LakeTransport"];
const lakeGates = (counts, overrides = {}) => ({
  ...pairChoice(BOTH_LAKE_SHIPS, BOTH_LAKE_SHIPS),
  getBuildingCount: (building) => counts[building] ?? 0,
  ...overrides,
});
// Four Biremes escorting seven Transports: one more Bireme adds more supply
// than one more Transport.
gates = lakeGates({ LakeBireme: 4, LakeTransport: 7 });
assert.deepEqual(read().lakeShipChoice, {
  worseId: "LakeTransport",
  betterTitle: "LakeBireme Title",
});
// Bloodstone ranks are absent until one is earned, and only rank 2 improves the
// per-Bireme factor — enough to flip which ship is worth building.
for (const rank of [undefined, 0, 1]) {
  gates = lakeGates(
    { LakeBireme: 4, LakeTransport: 7 },
    { getSpireBloodstoneRank: () => rank },
  );
  assert.equal(read().lakeShipChoice.worseId, "LakeTransport");
}
for (const rank of [2, 5]) {
  gates = lakeGates(
    { LakeBireme: 4, LakeTransport: 7 },
    { getSpireBloodstoneRank: () => rank },
  );
  assert.equal(read().lakeShipChoice.worseId, "LakeBireme");
}
// Comparing by Soul Gems instead of support scores each ship by the supply it
// adds per gem, which a lopsided cost flips.
gates = lakeGates(
  { LakeBireme: 4, LakeTransport: 7 },
  {
    isTransportComparedBySoulGems: () => true,
    getBuildingSoulGemCost: (building) => (building === "LakeBireme" ? 10 : 1),
  },
);
assert.deepEqual(read().lakeShipChoice, {
  worseId: "LakeBireme",
  betterTitle: "LakeTransport Title",
});
// A Soul Gem cost is absent until it is above zero, and the resulting NaN
// leaves the script preferring neither ship.
gates = lakeGates(
  { LakeBireme: 4, LakeTransport: 7 },
  { isTransportComparedBySoulGems: () => true },
);
assert.equal(read().lakeShipChoice, null);

const BOTH_SPIRE = ["SpirePort", "SpireBaseCamp"];
// At two of each, one more Port supplies more than one more Base Camp.
gates = {
  ...pairChoice(BOTH_SPIRE, BOTH_SPIRE),
  getBuildingCount: () => 2,
};
assert.deepEqual(read().spireSupplyChoice, {
  worseId: "SpireBaseCamp",
  betterTitle: "SpirePort Title",
});
// With no Ports built, a Base Camp multiplies nothing and neither is ahead of
// the other once the Port also scores its own first copy.
gates = {
  ...pairChoice(BOTH_SPIRE, BOTH_SPIRE),
  getBuildingCount: () => 0,
};
assert.deepEqual(read().spireSupplyChoice, {
  worseId: "SpireBaseCamp",
  betterTitle: "SpirePort Title",
});

// The name contest is an exact level test, so it closes as the tech advances.
const askedTechLevels = [];
gates = {
  ...defaultGates(),
  getTechLevel: (research) => {
    askedTechLevels.push(research);
    return 2;
  },
};
assert.equal(read().gasGiantNameContestActive, false);
assert.deepEqual(askedTechLevels, ["tau_gas"]);
for (const level of [undefined, 0]) {
  gates = { ...defaultGates(), getTechLevel: () => level };
  assert.equal(read().gasGiantNameContestActive, false);
}

// Validators append ", got <value>" to identify the rejected value; these cases
// pin the reported path and kind, so they match the message prefix.
const startsWith = (message) =>
  new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

const rejects = (mutate, message) => {
  state = validState();
  gates = defaultGates();
  mutate(state);
  assert.throws(read, { name: "TypeError", message: startsWith(message) });
};
rejects((s) => delete s.queuedTargets, "state.queuedTargets must be an array");
rejects(
  (s) => (s.triggerTargets = { 0: queued }),
  "state.triggerTargets must be an array",
);
rejects(
  (s) => (s.queuedTargets = [null]),
  "state.queuedTargets[0] must be an object",
);
rejects(
  (s) => (s.knowledgeRequiredByTechs = undefined),
  "state.knowledgeRequiredByTechs must be a finite number",
);
rejects(
  (s) => (s.knowledgeRequiredByBuildTargets = Number.NaN),
  "state.knowledgeRequiredByBuildTargets must be a finite number",
);
rejects(
  (s) => (s.cheapestTechKnowledge = "250"),
  "state.cheapestTechKnowledge must be a finite number",
);

const rejectsGate = (overrides, message) => {
  state = validState();
  gates = { ...defaultGates(), ...overrides };
  assert.throws(read, { name: "TypeError", message: startsWith(message) });
};
rejectsGate(
  {
    getWeightingMultiplier: (setting) =>
      setting === "buildingWeightingSolar" ? undefined : 0,
  },
  "settings.buildingWeightingSolar must be a finite number",
);
rejectsGate(
  {
    getWeightingMultiplier: (setting) =>
      setting === "buildingWeightingAuthority" ? "10" : 0,
  },
  "settings.buildingWeightingAuthority must be a finite number",
);
rejectsGate(
  { isBestFreighterOnly: () => undefined },
  "settings.buildingsBestFreighter must be a boolean",
);
rejectsGate(
  { getPrestigeType: () => undefined },
  "settings.prestigeType must be a string",
);
rejectsGate(
  { isAutoBuildEnabled: () => 1 },
  "settings.autoBuild must be a boolean",
);
rejectsGate(
  { isAuthorityManaged: () => true, getMinimumAuthority: () => "250" },
  "settings.generalMinimumAuthority must be a finite number",
);
rejectsGate(
  { getEmbassyKnowledgeTarget: () => null },
  "settings.fleetEmbassyKnowledge must be a finite number",
);
// Every resource read names the wrapper field it rejected, so a corrupt
// resource cannot silently weigh a candidate by NaN.
rejectsGate(
  {
    getResourceQuantity: (resource) =>
      resource === "Soul_Gem" ? undefined : 0,
  },
  "resources.Soul_Gem.currentQuantity must be a finite number",
);
rejectsGate(
  { getResourceCapacity: (resource) => (resource === "Knowledge" ? "5" : 0) },
  "resources.Knowledge.maxQuantity must be a finite number",
);
rejectsGate(
  {
    getResourceIncome: (resource) =>
      resource === "Lake_Support" ? Number.NaN : 0,
  },
  "resources.Lake_Support.rateOfChange must be a finite number",
);
rejectsGate(
  {
    getResourceStorageRatio: (resource) =>
      resource === "Population" ? null : 1,
  },
  "resources.Population.storageRatio must be a finite number",
);
rejectsGate(
  { getMissionMaxResourceCost: (resource) => (resource === "Oil" ? {} : 0) },
  "resources.Oil.techMissionMaxCost must be a finite number",
);
rejectsGate(
  { getSpareResourceQuantity: () => undefined },
  "resources.Horseshoe.spareQuantity must be a finite number",
);
rejectsGate(
  { getRequiredResourceStorage: () => "1" },
  "resources.Horseshoe.storageRequired must be a finite number",
);
rejectsGate(
  { getResourceTitle: () => undefined },
  "resources.Horseshoe.title must be a string",
);
rejectsGate(
  {
    isAuthorityManaged: () => true,
    getMinimumAuthority: () => 250,
    isResourceUnlocked: (resource) => resource === "Authority",
    getResourceCapacity: (resource) =>
      resource === "Authority" ? undefined : 0,
  },
  "resources.Authority.maxQuantity must be a finite number",
);
// The individual guard is only read when the master toggle is on.
rejectsGate(
  {
    isAchievementGuardsEnabled: () => true,
    isBananaRepublicGuardEnabled: () => undefined,
  },
  "settings.guardBananaRepublic must be a boolean",
);
rejectsGate(
  { isGalaxyAssaultPending: () => undefined },
  "isGalaxyAssaultPending() must be a boolean",
);
rejectsGate(
  { isStargatePiracySupressed: () => 0 },
  "isStargatePiracySupressed() must be a boolean",
);
rejectsGate(
  { isGalaxyPiracyCoveredByFleet: () => null },
  "isGalaxyPiracyCoveredByFleet() must be a boolean",
);
rejectsGate({ isLumberRace: () => 1 }, "isLumberRace() must be a boolean");
rejectsGate(
  { isShrineBonusUnwanted: () => "know" },
  "isShrineBonusUnwanted() must be a boolean",
);
rejectsGate(
  { isGateTowerSupressionTooLow: () => 0.5 },
  "isGateTowerSupressionTooLow() must be a boolean",
);
rejectsGate(
  { isGateDemonsSupressed: () => "yes" },
  "isGateDemonsSupressed() must be a boolean",
);
rejectsGate(
  { isGuardPostPrebuildIncomplete: () => undefined },
  "isGuardPostPrebuildIncomplete() must be a boolean",
);
rejectsGate(
  { isBananaRepublicObjectiveComplete: () => "yes" },
  'isBananaRepublicObjectiveComplete("b2") must be a boolean',
);
rejectsGate(
  { isAchievementGuardActive: (guard) => guard !== "guardRedDead" || null },
  'isAchievementGuardActive("guardRedDead") must be a boolean',
);
rejectsGate(
  { isPrestigeAllowed: (prestige) => prestige === "eden" && "yes" },
  'isPrestigeAllowed("eden") must be a boolean',
);
rejectsGate(
  {
    isRetirementAssistActive: () => true,
    getRetirementPreparationMissing: () => "none",
  },
  "getRetirementPreparationMissing() must be an array",
);
rejectsGate(
  { getSpirePrebuildShortfall: () => null },
  "getSpirePrebuildShortfall() must be an object",
);
rejectsGate(
  { getSpirePrebuildShortfall: () => ({ baseCamps: false }) },
  "getSpirePrebuildShortfall().ports must be a boolean",
);
rejectsGate(
  { getSpirePrebuildShortfall: () => ({ ports: true, baseCamps: 1 }) },
  "getSpirePrebuildShortfall().baseCamps must be a boolean",
);
rejectsGate(
  { getNextCitadelPowerDraw: () => Number.NaN },
  "getNextCitadelPowerDraw() must be a finite number",
);
rejectsGate(
  { getNextCitadelPowerDraw: () => "30" },
  "getNextCitadelPowerDraw() must be a finite number",
);
rejectsGate(
  { isMadPrestigeAwaited: () => "mad" },
  "isMadPrestigeAwaited() must be a boolean",
);
rejectsGate(
  {
    hasRaceTrait: (trait) => trait === "truepath",
    isWomlingStatEarned: (stat) => (stat === "god" ? 3 : true),
  },
  'isWomlingStatEarned("god") must be a boolean',
);
rejectsGate(
  {
    hasRaceTrait: (trait) => trait === "truepath",
    getBuildingName: (building) =>
      building === "TauRedIntroduce" ? undefined : building,
  },
  "buildings.TauRedIntroduce.name must be a string",
);
rejectsGate(
  {
    isBuildingAutoBuildable: () => true,
    isBuildingAffordable: () => true,
    getBuildingTitle: (building) =>
      building === "Alien1SuperFreighter" ? undefined : building,
  },
  "buildings.Alien1SuperFreighter.title must be a string",
);
rejectsGate(
  {
    getBuildingCount: (building) =>
      building === "AsphodelWarehouse" ? "5" : 0,
  },
  "buildings.AsphodelWarehouse.count must be a finite number",
);
rejectsGate(
  { getMechSupplySavingReason: () => "hoarding" },
  'getMechSupplySavingReason() must be null, "building", or "saving"',
);
rejectsGate(
  { getMechSupplySavingReason: () => false },
  'getMechSupplySavingReason() must be null, "building", or "saving"',
);
rejectsGate(
  { getForeignAchievementGoal: () => "unification" },
  'getForeignAchievementGoal() must be null, "world-domination", or "syndicate"',
);
rejectsGate(
  { getForeignAchievementGoal: () => undefined },
  'getForeignAchievementGoal() must be null, "world-domination", or "syndicate"',
);
rejectsGate(
  {
    hasRaceTrait: (trait) => trait === "truepath",
    getForeignGovernment: (index) => (index === 1 ? null : {}),
  },
  "getForeignGovernment(1) must be an object",
);
rejectsGate(
  {
    hasRaceTrait: (trait) => trait === "cannibalize" || trait === "parasite",
    getWindSpeed: () => "calm",
  },
  "getWindSpeed() must be a finite number",
);
rejectsGate(
  {
    hasRaceTrait: (trait) => trait === "cannibalize",
    getDefaultJobWorkers: () => undefined,
  },
  "getDefaultJobWorkers() must be a finite number",
);
rejectsGate(
  { getAssignedEjectorCapacity: () => Number.NaN },
  "getAssignedEjectorCapacity() must be a finite number",
);
rejectsGate(
  { getBuildingCount: (building) => (building === "OilWell" ? "0" : 0) },
  "buildings.OilWell.count must be a finite number",
);
rejectsGate(
  { isBuildingUnlocked: (building) => building === "ErisDigsite" || undefined },
  "buildings.SpaceTestLaunch.isUnlocked() must be a boolean",
);

state = validState();
gates = defaultGates();
assert.throws(
  createWeightingSnapshotReader({
    getState: () => null,
    ...defaultGates(),
  }),
  {
    name: "TypeError",
    message: startsWith("state must be an object"),
  },
);

console.log("Building weighting snapshot adapter tests passed");
