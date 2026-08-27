import assert from "node:assert/strict";
import { createBuildingWeightingPolicy } from "../src/domain/progression/build/building-weighting-rules.ts";

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
    autoBuildEnabled: false,
    autoFleetEnabled: false,
    minerJobsDisabled: false,
    prestigeRoute: "other",
    limitPrestigeConstruction: false,
    saveSoulGemsForPrestige: false,
    authorityCapBelowTarget: false,
    embassyKnowledgeTarget: 0,
    slavePensFull: false,
    slaveIncomeInsufficient: false,
    bananaRepublicGuardActive: false,
    queuedTargets: new Set(),
    triggerTargets: new Set(),
    knowledgeRequiredByTechs: 0,
    knowledgeRequiredByBuildTargets: 0,
    cheapestTechKnowledge: 0,
    knowledgeCapacity: 0,
    soulGemQuantity: 0,
    lakeSupportSpare: 0,
    tauBeltSupportAvailable: 0,
    tauBeltSupportUsed: 0,
    powerUnlocked: false,
    powerSurplus: 0,
    unpoweredPowerDemand: 0,
    populationAtCap: false,
    populationEmpty: false,
    housingUnderused: false,
    unusedStorageParts: false,
    storagePartsAllAssigned: false,
    oilStorageBelowMissionCost: false,
    heliumStorageBelowMissionCost: false,
    horseshoesSufficient: false,
    horseshoeTitle: "Horseshoe",
    zenBelowCap: false,
    testLaunchUnlocked: false,
    erisDigsiteUnsecured: false,
    andromedaReached: false,
    freighterChoice: null,
    lakeShipChoice: null,
    spireSupplyChoice: null,
    asphodelWarehouseCount: 0,
    embassyMissing: false,
    matrioshkaBrainIncomplete: false,
    unusedEjectorCapacity: 0,
    noOilProduction: false,
    galaxyAssaultPending: false,
    stargatePiracySupressed: false,
    galaxyPiracyCoveredByFleet: false,
    truepathRace: false,
    truepathAiApocalypse: false,
    truepathAiProgress: 0,
    truepathAiBuildingTarget: null,
    truepathAiTargetColonists: 0,
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
    nextCitadelPowerDraw: 0,
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
    womlingOverlordActions: [],
    ...overrides,
  });
const emptySnapshot = snapshotOf();

// Candidates are immutable projections keyed by their catalog key. The default
// is an ordinary unlocked building with nothing else going on.
const candidateOf = (overrides = {}) =>
  Object.freeze({
    id: "Mine",
    name: "Mine",
    actionId: "mine",
    tab: "space",
    location: "",
    unlocked: true,
    autoBuildEnabled: true,
    smartManaged: false,
    affordable: true,
    count: 0,
    autoMax: Number.MAX_SAFE_INTEGER,
    powered: 0,
    stateOffCount: 0,
    housing: false,
    garrison: false,
    knowledge: false,
    randomlyWeighted: false,
    cost: {},
    producedResource: null,
    missingConsumption: null,
    missingSupport: null,
    uselessSupport: null,
    ...overrides,
  });
const named = (id, overrides = {}) =>
  candidateOf({ id, name: id, ...overrides });
const otherBuilding = named("Mine");

const policy = createBuildingWeightingPolicy({
  formatNumber: String,
  formatNiceNumber: String,
  nextRandomUnit: () => 0.5,
});

assert.equal(policy.weightingRules.length, 73);
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

// The membership lists are catalog keys, and every key any rule names is
// declared once so a misspelling cannot become a rule that never matches.
assert.equal(policy.authorityCapBuildings[0], "Barracks");
assert.equal(policy.authorityCapBuildings.at(-1), "AsphodelBunker");
assert.equal(policy.galaxyCombatShips[0], "ScoutShip");
assert.equal(policy.galaxyCombatShips.at(-1), "Dreadnought");
const declared = new Set(policy.namedBuildings);
assert.equal(
  declared.size,
  policy.namedBuildings.length,
  "no catalog key is declared twice",
);
for (const list of [
  policy.authorityCapBuildings,
  policy.inflationMoneyStorageBuildings,
  policy.inflationMoneyIncomeBuildings,
  policy.galaxyCombatShips,
]) {
  for (const id of list) {
    assert.equal(declared.has(id), true, `${id} is declared`);
  }
}

const disabledRule = ruleById("autobuild-off");
assert.equal(disabledRule.enabled(emptySnapshot), true);
assert.equal(
  disabledRule.enabled(snapshotOf({ autoBuildEnabled: true })),
  false,
);
assert.equal(disabledRule.match(), true);
assert.equal(disabledRule.multiplier(emptySnapshot), 0);

// The eligibility rules read only the candidate's own projected answers.
assert.equal(
  ruleById("locked").match(named("Mine", { unlocked: false })),
  true,
);
assert.equal(ruleById("locked").match(otherBuilding), false);
assert.equal(
  ruleById("autobuild-disabled").match(
    named("Mine", { autoBuildEnabled: false }),
  ),
  true,
);
assert.equal(
  ruleById("maximum-amount-reached").match(
    named("Mine", { count: 4, autoMax: 4 }),
  ),
  true,
);
assert.equal(
  ruleById("maximum-amount-reached").match(
    named("Mine", { count: 3, autoMax: 4 }),
  ),
  false,
);
assert.equal(
  ruleById("unaffordable").match(named("Mine", { affordable: false })),
  true,
);

const aiRule = ruleById("truepath-ai-apocalypse");
const aiSnapshot = snapshotOf({
  truepathAiBuildingTarget: "TitanAIColonist",
  truepathAiProgress: 40,
  truepathAiTargetColonists: 43,
});
assert.equal(aiRule.enabled(aiSnapshot), true);
assert.equal(aiRule.match(named("TitanAIColonist"), aiSnapshot), true);
assert.equal(aiRule.match(named("TitanDecoder"), aiSnapshot), false);
assert.equal(aiRule.multiplier(aiSnapshot), 100);
assert.match(aiRule.describe(true, named("TitanAIColonist"), aiSnapshot), /43/);

// Target membership is by catalog key: the priority-target planner and the
// weighting phase now agree on one identity rather than on wrapper identity.
const queuedRule = ruleById("queued-target");
const triggerRule = ruleById("trigger-target");
assert.equal(
  queuedRule.match(
    otherBuilding,
    snapshotOf({ queuedTargets: new Set(["Mine"]) }),
  ),
  true,
);
assert.equal(queuedRule.match(otherBuilding, emptySnapshot), false);
assert.equal(
  triggerRule.match(
    otherBuilding,
    snapshotOf({ triggerTargets: new Set(["Mine"]) }),
  ),
  true,
);
assert.equal(triggerRule.match(otherBuilding, emptySnapshot), false);

// Knowledge rules compare the run's knowledge requirements against the sampled
// Knowledge capacity, both of which arrive on the snapshot.
const uselessKnowledgeRule = ruleById("no-need-for-more-knowledge");
const needfulKnowledgeRule = ruleById("need-more-knowledge");
const knowledgeSnapshot = (overrides) =>
  snapshotOf({ knowledgeCapacity: 100, ...overrides });
assert.equal(
  uselessKnowledgeRule.enabled(
    knowledgeSnapshot({
      knowledgeRequiredByTechs: 100,
      knowledgeRequiredByBuildTargets: 50,
    }),
  ),
  true,
);
assert.equal(
  uselessKnowledgeRule.enabled(
    knowledgeSnapshot({ knowledgeRequiredByBuildTargets: 101 }),
  ),
  false,
  "a build target above storage still needs more knowledge",
);
assert.equal(
  needfulKnowledgeRule.enabled(
    knowledgeSnapshot({ cheapestTechKnowledge: 101 }),
  ),
  true,
);
assert.equal(
  needfulKnowledgeRule.enabled(
    knowledgeSnapshot({ knowledgeRequiredByBuildTargets: 101 }),
  ),
  true,
);
assert.equal(
  needfulKnowledgeRule.enabled(
    knowledgeSnapshot({
      cheapestTechKnowledge: 100,
      knowledgeRequiredByTechs: 1e9,
    }),
  ),
  false,
  "an unreachable far-future tech must not force knowledge weighting",
);
// Wardenclyffe is kept for morale, and the first Telemetry Beacon for progress.
const knowledgeBuilding = (id, count = 0) =>
  named(id, { knowledge: true, count });
assert.equal(uselessKnowledgeRule.match(knowledgeBuilding("Library")), true);
assert.equal(
  uselessKnowledgeRule.match(knowledgeBuilding("Wardenclyffe")),
  false,
);
assert.equal(
  uselessKnowledgeRule.match(knowledgeBuilding("StargateTelemetryBeacon")),
  false,
);
assert.equal(
  uselessKnowledgeRule.match(knowledgeBuilding("StargateTelemetryBeacon", 1)),
  true,
);
assert.equal(
  needfulKnowledgeRule.match(knowledgeBuilding("Wardenclyffe")),
  true,
);
assert.equal(needfulKnowledgeRule.match(otherBuilding), false);

const digsiteRule = ruleById("eris-digsite-unsecured");
const truepathSnapshot = snapshotOf({ truepathRace: true });
const digsiteOpen = snapshotOf({
  truepathRace: true,
  erisDigsiteUnsecured: true,
});
assert.equal(digsiteRule.enabled(digsiteOpen), true);
assert.equal(
  digsiteRule.enabled(snapshotOf({ erisDigsiteUnsecured: true })),
  false,
  "the Eris digsite only exists in a True Path run",
);
assert.equal(digsiteRule.match(named("ErisDrone")), true);
assert.equal(digsiteRule.match(named("ErisTank")), true);
assert.equal(digsiteRule.match(named("ErisTrooper")), true);
assert.equal(digsiteRule.match(named("ErisMission")), false);
assert.equal(digsiteRule.describe(), "Eris Digsite is not yet secured");
assert.equal(
  digsiteRule.multiplier(
    snapshotOf({ weights: { buildingWeightingTruepathDigsite: 10 } }),
  ),
  10,
);
assert.equal(
  digsiteRule.enabled(truepathSnapshot),
  false,
  "a secured digsite needs no more Eris hardware",
);

// The management toggle, the Authority unlock, and the cap comparison are all
// folded into one snapshot answer, so the rule only identifies the buildings.
const authorityRule = ruleById("authority-cap");
assert.equal(
  authorityRule.enabled(snapshotOf({ authorityCapBelowTarget: true })),
  true,
);
assert.equal(authorityRule.match(named("Barracks")), true);
assert.equal(authorityRule.match(otherBuilding), false);
assert.equal(authorityRule.enabled(emptySnapshot), false);

// Both piracy rules ask the snapshot whether more hardware could still help,
// and then only identify the buildings that hardware is.
const piracyRule = ruleById("piracy-fully-supressed");
assert.equal(piracyRule.enabled(emptySnapshot), false);
assert.equal(
  piracyRule.enabled(snapshotOf({ stargatePiracySupressed: true })),
  true,
);
assert.equal(piracyRule.match(named("StargateDefensePlatform")), true);
assert.equal(piracyRule.match(named("GatewayStarbase")), false);

const fleetPiracyRule = ruleById("piracy-covered-by-fleet");
const coveredSnapshot = snapshotOf({
  autoFleetEnabled: true,
  galaxyPiracyCoveredByFleet: true,
});
assert.equal(fleetPiracyRule.enabled(coveredSnapshot), true);
assert.equal(fleetPiracyRule.enabled(emptySnapshot), false);
// An accumulating assault fleet is exempt: its ships are wanted regardless.
assert.equal(
  fleetPiracyRule.enabled(
    snapshotOf({
      autoFleetEnabled: true,
      galaxyPiracyCoveredByFleet: true,
      galaxyAssaultPending: true,
    }),
  ),
  false,
);
assert.equal(
  fleetPiracyRule.enabled(snapshotOf({ galaxyPiracyCoveredByFleet: true })),
  false,
  "an idle AutoFleet cannot be trusted to keep piracy covered",
);
assert.equal(fleetPiracyRule.match(named("Dreadnought")), true);
assert.equal(fleetPiracyRule.match(named("GatewayStarbase")), false);

// Either fuel being short of the most expensive mission that needs it enables
// the depot rule; the adapter decides what "short" means.
const fuelDepotRule = ruleById("need-more-fuel-storage");
assert.equal(fuelDepotRule.enabled(emptySnapshot), false);
assert.equal(
  fuelDepotRule.enabled(snapshotOf({ oilStorageBelowMissionCost: true })),
  true,
);
assert.equal(
  fuelDepotRule.enabled(snapshotOf({ heliumStorageBelowMissionCost: true })),
  true,
);
assert.equal(fuelDepotRule.match(named("SpacePropellantDepot")), true);
assert.equal(fuelDepotRule.match(otherBuilding), false);

// Fuel production waits for both wells to be missing as well.
const fuelWellRule = ruleById("need-more-fuel-production");
const oilShort = snapshotOf({
  oilStorageBelowMissionCost: true,
  noOilProduction: true,
});
assert.equal(fuelWellRule.enabled(oilShort), true);
assert.equal(fuelWellRule.enabled(emptySnapshot), false);
assert.equal(
  fuelWellRule.enabled(snapshotOf({ oilStorageBelowMissionCost: true })),
  false,
  "an existing well already answers the shortfall",
);
assert.equal(fuelWellRule.match(named("GasMoonOilExtractor")), true);
assert.equal(fuelWellRule.match(otherBuilding), false);

// Whether Supply is being withheld for the mech bay is a fact about the run;
// the rule only asks whether the candidate spends Supply at all.
const mechSavingRule = ruleById("mech-supply-saving");
const savingSnapshot = snapshotOf({ mechSupplySaving: "saving" });
const buildingSnapshot = snapshotOf({ mechSupplySaving: "building" });
const supplySpender = named("SpireMechBay", { cost: { Supply: 1 } });
assert.equal(mechSavingRule.enabled(emptySnapshot), false);
assert.equal(mechSavingRule.enabled(savingSnapshot), true);
assert.equal(mechSavingRule.enabled(buildingSnapshot), true);
assert.equal(mechSavingRule.match(supplySpender, savingSnapshot), "saving");
assert.equal(
  mechSavingRule.match(named("Mine", { cost: { Money: 1 } }), savingSnapshot),
  undefined,
  "buildings that do not spend Supply are never pinned for a mech",
);
assert.equal(
  mechSavingRule.describe(mechSavingRule.match(supplySpender, savingSnapshot)),
  "Saving supplies for new mech",
);
assert.equal(
  mechSavingRule.describe(
    mechSavingRule.match(supplySpender, buildingSnapshot),
  ),
  "Building mechs...",
);
assert.equal(mechSavingRule.multiplier(emptySnapshot), 0);

// Each guard answer already folds in the master toggle, so the rule is enabled
// by the guards it can actually act on.
const achievementGuardRule = ruleById("achievement-guard");
assert.equal(achievementGuardRule.enabled(emptySnapshot), false);
assert.equal(
  achievementGuardRule.enabled(snapshotOf({ guardEnergeticActive: true })),
  true,
);
assert.equal(
  achievementGuardRule.enabled(snapshotOf({ guardPacifistActive: true })),
  false,
  "the Pacifist guard only suppresses Red Dead; it enables nothing on its own",
);
const redDeadSnapshot = snapshotOf({ guardRedDeadActive: true });
assert.equal(
  achievementGuardRule.match(named("RedSpaceport"), redDeadSnapshot),
  "Red Dead",
);
assert.equal(
  achievementGuardRule.match(
    named("Dreadnought"),
    snapshotOf({ guardDreadedActive: true }),
  ),
  "Dreaded",
);
assert.equal(
  achievementGuardRule.match(
    named("SiriusThermalCollector"),
    snapshotOf({ guardEnergeticActive: true }),
  ),
  "Energetic",
);
for (const goal of ["world-domination", "syndicate"]) {
  assert.equal(
    achievementGuardRule.match(
      named("RedSpaceport"),
      snapshotOf({ guardRedDeadActive: true, foreignAchievementGoal: goal }),
    ),
    undefined,
    `${goal} must be able to build the Red Spaceport needed to unlock unification`,
  );
}
assert.equal(
  achievementGuardRule.match(
    named("RedSpaceport"),
    snapshotOf({ guardRedDeadActive: true, guardPacifistActive: true }),
  ),
  undefined,
  "Pacifist must be able to build the Red Spaceport needed for unification",
);

// Challenge and prestige gates come from the snapshot, not from live reads.
const inflationRule = ruleById("inflation-money");
assert.equal(inflationRule.enabled(emptySnapshot), false);
const inflationOn = snapshotOf({ inflationAssistActive: true });
assert.equal(inflationRule.enabled(inflationOn), true);
assert.equal(
  inflationRule.match(
    named(policy.inflationMoneyStorageBuildings[0]),
    inflationOn,
  ),
  "storage",
);
assert.equal(
  inflationRule.match(named("TouristCenter"), inflationOn),
  undefined,
);
const inflationReachable = snapshotOf({
  inflationAssistActive: true,
  inflationMoneyReachable: true,
});
assert.equal(
  inflationRule.match(named("TouristCenter"), inflationReachable),
  "income",
);
assert.equal(inflationRule.match(named("Bank"), inflationReachable), undefined);
assert.equal(
  inflationRule.describe("storage"),
  "Inflation challenge needs Money storage",
);
assert.equal(
  inflationRule.describe("income"),
  "Inflation challenge needs Money income",
);

const retirementRule = ruleById("retirement-preparation");
assert.equal(retirementRule.enabled(emptySnapshot), false);
assert.equal(
  retirementRule.enabled(snapshotOf({ retirementPreparationIncomplete: true })),
  true,
);
const fusionGenerator = named("TauFusionGenerator", { count: 5 });
assert.equal(retirementRule.match(fusionGenerator), 20);
assert.equal(
  retirementRule.match(named("TauFusionGenerator", { count: 20 })),
  undefined,
);
assert.equal(retirementRule.match(otherBuilding), undefined);
assert.equal(
  retirementRule.describe(20, fusionGenerator),
  "Retirement preparation: build 20 TauFusionGenerator",
);

const bananaRule = ruleById("banana-republic-objective");
assert.equal(
  bananaRule.match(named("DwarfWorldCollider"), emptySnapshot),
  true,
);
assert.equal(
  bananaRule.match(
    named("DwarfWorldCollider"),
    snapshotOf({ bananaColliderObjectiveComplete: true }),
  ),
  false,
);

const geckRule = ruleById("geck-limit");
const bioseedRun = snapshotOf({ prestigeRoute: "bioseed" });
assert.equal(geckRule.enabled(bioseedRun), true);
assert.equal(
  geckRule.enabled(snapshotOf({ prestigeRoute: "bioseed", geckNeeded: true })),
  false,
);
assert.equal(
  geckRule.enabled(snapshotOf({ geckNeeded: true })),
  true,
  "a G.E.C.K is only worth building on the Bioseed route",
);
assert.equal(geckRule.match(named("GasSpaceDockGECK")), true);

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
assert.equal(edenRule.match(named("TauStarEden")), true);

// The Overlord guard reads the three contact actions from the snapshot, each
// carrying the stat it earns and whether the script could build it.
const womlingRule = ruleById("womling-overlord-guard");
const womlingActions = (earned) =>
  snapshotOf({
    womlingOverlordActions: [
      {
        id: "TauRedContact",
        name: "Contact",
        statEarned: earned.includes("friend"),
        autoBuildable: true,
      },
      {
        id: "TauRedIntroduce",
        name: "Introduce",
        statEarned: earned.includes("god"),
        autoBuildable: true,
      },
      {
        id: "TauRedSubjugate",
        name: "Subjugate",
        statEarned: earned.includes("lord"),
        autoBuildable: false,
      },
    ],
  });
assert.equal(womlingRule.enabled(truepathSnapshot), true);
assert.equal(womlingRule.enabled(emptySnapshot), false);
assert.equal(womlingRule.match(otherBuilding, womlingActions([])), undefined);
// An unearned stat means the candidate that earns it is the one to build.
assert.equal(
  womlingRule.match(named("TauRedContact"), womlingActions([])),
  undefined,
);
// With its own stat earned, the candidate defers to the last unearned stat that
// is still buildable; the unbuildable Subjugate cannot claim it.
assert.equal(
  womlingRule.match(named("TauRedContact"), womlingActions(["friend"])),
  "Introduce",
);
assert.equal(
  womlingRule.describe("Introduce"),
  "Overlord achievement is missing Introduce",
);
assert.equal(
  womlingRule.multiplier(
    snapshotOf({ weights: { buildingWeightingOverlord: 0.5 } }),
  ),
  0.5,
);
assert.equal(
  womlingRule.match(
    named("TauRedContact"),
    womlingActions(["friend", "god", "lord"]),
  ),
  undefined,
);

// Awaiting MAD is one snapshot answer; the settings and tech reads it used to
// make now live in the adapter. Housing, garrisons, knowledge buildings, and the
// Oil Well stay worth building through the reset.
const madRule = ruleById("awaiting-mad-prestige");
assert.equal(madRule.enabled(emptySnapshot), false);
assert.equal(madRule.enabled(snapshotOf({ madPrestigeAwaited: true })), true);
assert.equal(madRule.match(otherBuilding), true);
assert.equal(madRule.match(named("Cottage", { housing: true })), false);
assert.equal(madRule.match(named("Barracks", { garrison: true })), false);
assert.equal(
  madRule.match(named("Library", { cost: { Knowledge: 100 } })),
  false,
);
assert.equal(madRule.match(named("OilWell")), false);
assert.equal(
  madRule.multiplier(
    snapshotOf({ weights: { buildingWeightingMADUseless: 0.01 } }),
  ),
  0.01,
);

// The two gate rules are enabled purely by their snapshot answer; the unlock
// checks and the supression reads they used to make now live in the adapter.
const towerRule = ruleById("gate-supression-too-low");
assert.equal(towerRule.enabled(emptySnapshot), false);
assert.equal(
  towerRule.enabled(snapshotOf({ gateTowerSupressionTooLow: true })),
  true,
);
assert.equal(towerRule.match(named("GateEastTower")), true);
assert.equal(towerRule.match(named("GateWestTower")), true);
assert.equal(towerRule.match(named("GateTurret")), false);

const demonRule = ruleById("gate-demons-supressed");
assert.equal(demonRule.enabled(emptySnapshot), false);
assert.equal(
  demonRule.enabled(snapshotOf({ gateDemonsSupressed: true })),
  true,
);
assert.equal(demonRule.match(named("GateTurret")), true);

// Guard posts still short of their prebuild target are exempt from the
// non-operating penalty, but only while supression is not already useful.
const nonOperatingRule = ruleById("non-operating-buildings");
const guardPost = named("RuinsGuardPost", {
  tab: "portal",
  stateOffCount: 1,
  smartManaged: true,
});
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
assert.equal(
  nonOperatingRule.match(
    named("RuinsGuardPost", { tab: "portal", stateOffCount: 1 }),
    snapshotOf({ hellGuardPostPrebuildIncomplete: true }),
  ),
  true,
  "a guard post the script does not power is judged like any other building",
);
// A multisegmented Stellar Engine reports a misleading switched-off count.
assert.equal(
  nonOperatingRule.match(
    named("BlackholeStellarEngine", { tab: "interstellar", stateOffCount: 3 }),
    emptySnapshot,
  ),
  false,
);
// City buildings belong to the other non-operating rule.
const cityRule = ruleById("non-operating-city-buildings");
const idleFactory = named("Factory", { tab: "city", stateOffCount: 2 });
assert.equal(cityRule.match(idleFactory), true);
assert.equal(nonOperatingRule.match(idleFactory, emptySnapshot), false);
assert.equal(
  cityRule.match(named("Mill", { tab: "city", stateOffCount: 2 })),
  false,
);
assert.equal(
  cityRule.match(named("Banquet", { tab: "city", stateOffCount: 2 })),
  false,
);

const vacuumManaRule = ruleById("vacuum-collapse-mana-producer");
const vacuumRun = snapshotOf({ prestigeRoute: "vacuum" });
assert.equal(vacuumManaRule.enabled(vacuumRun), true);
assert.equal(vacuumManaRule.match(named("Pylon")), true);
assert.equal(vacuumManaRule.match(named("Bank")), false);
assert.equal(vacuumManaRule.describe(), "Vacuum Collapse Mana producer");
assert.equal(
  vacuumManaRule.multiplier(
    snapshotOf({ weights: { buildingWeightingVacuumCollapse: 10 } }),
  ),
  10,
);
assert.equal(
  vacuumManaRule.enabled(emptySnapshot),
  false,
  'every route the rules do not distinguish arrives as "other"',
);

// Spire ports and base camps below their prebuild target are exempt from the
// non-operating penalty, and each reads only the answer that names it.
const spirePort = named("SpirePort", { tab: "portal", stateOffCount: 1 });
const spireBaseCamp = named("SpireBaseCamp", {
  tab: "portal",
  stateOffCount: 1,
});
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
const energyRule = ruleById("not-enough-energy");
const citadel = named("NeutronCitadel", { powered: 5 });
const powered = (overrides) =>
  snapshotOf({ powerUnlocked: true, powerSurplus: 50, ...overrides });
assert.equal(energyRule.enabled(powered()), true);
assert.equal(
  energyRule.enabled(emptySnapshot),
  false,
  "locked Power weighs nothing by its draw",
);
assert.equal(
  energyRule.match(citadel, powered({ nextCitadelPowerDraw: 60 })),
  true,
);
assert.equal(
  energyRule.match(citadel, powered({ nextCitadelPowerDraw: 40 })),
  false,
);
assert.equal(
  energyRule.match(named("Factory", { powered: 60 }), powered()),
  true,
);
assert.equal(
  energyRule.match(named("Factory", { powered: 40 }), powered()),
  false,
);
assert.equal(
  energyRule.match(named("LakeCoolingTower", { powered: 60 }), powered()),
  false,
  "the cooling tower is judged by the power-plant rules instead",
);

// The two power-plant rules compare the same surplus against what the game's
// switched-off buildings would draw.
const needEnergyRule = ruleById("need-more-energy");
const uselessEnergyRule = ruleById("no-need-for-more-energy");
assert.equal(
  needEnergyRule.enabled(powered({ unpoweredPowerDemand: 80 })),
  true,
);
assert.equal(
  uselessEnergyRule.enabled(powered({ unpoweredPowerDemand: 80 })),
  false,
);
assert.equal(
  needEnergyRule.enabled(powered({ unpoweredPowerDemand: 20 })),
  false,
);
assert.equal(
  uselessEnergyRule.enabled(powered({ unpoweredPowerDemand: 20 })),
  true,
);
assert.equal(
  needEnergyRule.enabled(snapshotOf({ unpoweredPowerDemand: 80 })),
  false,
  "locked Power enables neither power-plant rule",
);
const powerPlant = named("Coal_Power", { powered: -5 });
assert.equal(needEnergyRule.match(powerPlant), true);
assert.equal(needEnergyRule.match(named("LakeCoolingTower")), true);
assert.equal(needEnergyRule.match(otherBuilding), false);
assert.equal(uselessEnergyRule.match(powerPlant), true);
assert.equal(
  uselessEnergyRule.match(named("Mill", { powered: -5 })),
  false,
  "the Mill is wanted for its other output even with power to spare",
);

// The tech gates and the race gates are both snapshot answers, so an `enabled`
// that combines them reads nothing live.
const sabotageRule = ruleById("truepath-test-launch-sabotage");
const launchable = snapshotOf({
  truepathRace: true,
  testLaunchUnlocked: true,
});
assert.equal(sabotageRule.enabled(launchable), true);
assert.equal(
  sabotageRule.enabled(
    snapshotOf({
      truepathRace: true,
      testLaunchUnlocked: true,
      worldUnified: true,
    }),
  ),
  false,
  "a unified world can no longer be sabotaged",
);
assert.equal(sabotageRule.enabled(emptySnapshot), false);
assert.equal(
  sabotageRule.enabled(truepathSnapshot),
  false,
  "a run that has not unlocked the launch weighs nothing for it",
);
assert.equal(
  sabotageRule.match(
    named("SpaceTestLaunch"),
    snapshotOf({ truepathRace: true, testLaunchSuccessChance: 0.25 }),
  ),
  0.25,
  "the launch chance is one snapshot answer, not a per-candidate government scan",
);
assert.equal(
  sabotageRule.match(named("SpireWaygate"), truepathSnapshot),
  undefined,
);
assert.equal(sabotageRule.describe(0.25), "25% chance of successful launch");
assert.equal(sabotageRule.multiplier(emptySnapshot, 0.25), 0.25);
assert.equal(
  sabotageRule.multiplier(emptySnapshot, 0.5),
  0,
  "an even chance is not worth building for",
);
assert.equal(
  sabotageRule.multiplier(emptySnapshot),
  0,
  "the unmatched probe never scales a candidate up",
);

const waygateRule = ruleById("spire-waygate-done");
assert.equal(waygateRule.enabled(emptySnapshot), false);
assert.equal(
  waygateRule.enabled(snapshotOf({ spireWaygateComplete: true })),
  true,
);
assert.equal(waygateRule.match(named("SpireWaygate")), true);

const edenicGateRule = ruleById("spire-edenic-gate-done");
assert.equal(edenicGateRule.enabled(emptySnapshot), false);
assert.equal(
  edenicGateRule.enabled(snapshotOf({ spireEdenicGateComplete: true })),
  true,
);
assert.equal(edenicGateRule.match(named("SpireEdenicGate")), true);

const sphinxRule = ruleById("spire-sphinx-done");
assert.equal(sphinxRule.enabled(emptySnapshot), false);
assert.equal(sphinxRule.enabled(snapshotOf({ spireSphinxSolved: true })), true);
assert.equal(
  sphinxRule.enabled(snapshotOf({ warlordRace: true })),
  true,
  "Harmachis is unusable during Warlord even before the Sphinx is solved",
);
assert.equal(sphinxRule.match(named("SpireSphinx")), true);

// The Stabilizer cap is the Warehouse count, which is a snapshot answer.
const warehouseRule = ruleById("warehouse-cap");
assert.equal(warehouseRule.enabled(emptySnapshot), false);
assert.equal(
  warehouseRule.enabled(snapshotOf({ asphodelStabilizerUnlocked: true })),
  true,
);
const fiveWarehouses = snapshotOf({ asphodelWarehouseCount: 5 });
assert.equal(
  warehouseRule.match(
    named("AsphodelStabilizer", { count: 5 }),
    fiveWarehouses,
  ),
  true,
);
assert.equal(
  warehouseRule.match(
    named("AsphodelStabilizer", { count: 4 }),
    fiveWarehouses,
  ),
  false,
);
assert.equal(warehouseRule.match(otherBuilding, fiveWarehouses), false);

// The Fire Support Base reports the reason it is blocked, and the cap only
// applies once a hundred of them exist.
const fireSupportRule = ruleById("elysium-fire-support-base-blocked");
const fireSupportBase = named("ElysiumFireSupportBase", { count: 100 });
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
assert.equal(
  fireSupportRule.match(
    named("ElysiumFireSupportBase", { count: 99 }),
    emptySnapshot,
  ),
  undefined,
);
assert.equal(
  fireSupportRule.match(
    named("SpireWaygate"),
    snapshotOf({ elysiumGarrisonDestroyed: true }),
  ),
  undefined,
);

// Assembling population is blocked once the cure completes, and the Tau Ceti
// cloning vat is the exception that keeps working.
const assemblingRule = ruleById("assembling-not-possible");
const assembler = candidateOf({
  id: "Assemble",
  producedResource: "Population",
});
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
assert.equal(assemblingRule.match(assembler), true);
assert.equal(
  assemblingRule.match(
    candidateOf({ id: "TauCloning", producedResource: "Population" }),
  ),
  false,
);
assert.equal(assemblingRule.match(otherBuilding), false);

const solarRule = ruleById("solar-system-building");
assert.equal(solarRule.enabled(snapshotOf({ tauCetiReached: true })), false);
assert.equal(
  solarRule.enabled(snapshotOf({ truepathRace: true, tauCetiReached: true })),
  true,
);
assert.equal(solarRule.enabled(truepathSnapshot), false);
assert.equal(solarRule.match(named("Factory", { tab: "city" })), true);
assert.equal(solarRule.match(named("Mine", { tab: "space" })), true);
assert.equal(solarRule.match(named("TauFactory", { tab: "tauceti" })), false);
assert.equal(solarRule.match(assembler), false);

// The Andromeda miner rule spares the Mine only for the race that has no other
// source of Chrysotile.
const andromedaRule = ruleById("andromeda-miners-disabled");
const minersOff = snapshotOf({
  minerJobsDisabled: true,
  andromedaReached: true,
});
const chrysotileOnly = snapshotOf({
  minerJobsDisabled: true,
  mineIsOnlyChrysotileSource: true,
});
assert.equal(andromedaRule.enabled(minersOff), true);
assert.equal(andromedaRule.enabled(emptySnapshot), false);
assert.equal(
  andromedaRule.enabled(snapshotOf({ minerJobsDisabled: true })),
  false,
  "miners are only stranded once Andromeda is reached",
);
assert.equal(andromedaRule.match(named("CoalMine"), emptySnapshot), true);
assert.equal(andromedaRule.match(named("Mine"), emptySnapshot), true);
assert.equal(andromedaRule.match(named("Mine"), chrysotileOnly), false);
assert.equal(andromedaRule.match(named("CoalMine"), chrysotileOnly), true);

// The shrine rule is one snapshot answer too; all it still does per candidate
// is recognize a Shrine by the game's own action id.
const shrineRule = ruleById("wrong-shrine");
assert.equal(shrineRule.enabled(emptySnapshot), false);
assert.equal(
  shrineRule.enabled(snapshotOf({ shrineBonusUnwanted: true })),
  true,
);
assert.equal(shrineRule.match(named("Shrine", { actionId: "shrine" })), true);
assert.equal(shrineRule.match(named("Temple", { actionId: "temple" })), false);
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
assert.equal(impactRule.match(named("Factory", { tab: "city" })), true);
assert.equal(
  impactRule.match(named("MoonBase", { tab: "space", location: "spc_moon" })),
  true,
);
assert.equal(impactRule.match(otherBuilding), false);
assert.equal(
  impactRule.match(
    candidateOf({ tab: "city", producedResource: "Population" }),
  ),
  false,
);

// The altar's game-side blockers are one snapshot reason; only the population
// checks are still taken per candidate, and they still win over it.
const altarRule = ruleById("sacrificial-altar-blocked");
const altar = named("SacrificialAltar", { actionId: "s_alter", count: 1 });
const cannibalSnapshot = snapshotOf({
  cannibalizeRace: true,
  populationAtCap: true,
});
assert.equal(altarRule.enabled(emptySnapshot), false);
assert.equal(altarRule.enabled(cannibalSnapshot), true);
assert.equal(altarRule.match(altar, cannibalSnapshot), undefined);
assert.equal(
  altarRule.match(
    named("SacrificialAltar", { actionId: "s_alter", count: 0 }),
    cannibalSnapshot,
  ),
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
      snapshotOf({
        cannibalizeRace: true,
        populationAtCap: true,
        sacrificeBlocked: reason,
      }),
    ),
    note,
  );
}
assert.equal(
  altarRule.match(
    altar,
    snapshotOf({ cannibalizeRace: true, sacrificeBlocked: "bonus-capped" }),
  ),
  "Sacrifices performed only with full population",
  "a population below its cap outranks every game-side blocker",
);
assert.equal(
  altarRule.match(
    altar,
    snapshotOf({ cannibalizeRace: true, populationEmpty: true }),
  ),
  "Too low population",
);
assert.equal(altarRule.multiplier(emptySnapshot), 0);

// Which half of a paired choice loses is resolved once per phase; each rule
// only asks whether this candidate is the losing half.
const lakeRule = ruleById("lake-transport-vs-bireme");
const lakeChoice = snapshotOf({
  lakeShipChoice: { worseId: "LakeTransport", betterTitle: "Bireme Warship" },
});
assert.equal(lakeRule.enabled(lakeChoice), true);
assert.equal(
  lakeRule.enabled(emptySnapshot),
  false,
  "a ship the script cannot build right now is not a choice",
);
assert.equal(
  lakeRule.enabled(
    snapshotOf({
      lakeShipChoice: {
        worseId: "LakeTransport",
        betterTitle: "Bireme Warship",
      },
      lakeSupportSpare: 5,
    }),
  ),
  false,
  "spare Lake support makes either ship worth building",
);
assert.equal(
  lakeRule.match(named("LakeTransport"), lakeChoice),
  "Bireme Warship",
);
assert.equal(lakeRule.match(named("LakeBireme"), lakeChoice), undefined);
assert.equal(
  lakeRule.describe("Bireme Warship"),
  "Bireme Warship gives more Supplies",
);
assert.equal(lakeRule.multiplier(emptySnapshot), 0);

const spireSupplyRule = ruleById("spire-port-vs-base-camp");
const spireChoice = snapshotOf({
  spireSupplyChoice: { worseId: "SpireBaseCamp", betterTitle: "Spire Port" },
});
assert.equal(spireSupplyRule.enabled(spireChoice), true);
assert.equal(spireSupplyRule.enabled(emptySnapshot), false);
assert.equal(
  spireSupplyRule.match(named("SpireBaseCamp"), spireChoice),
  "Spire Port",
);
assert.equal(spireSupplyRule.match(named("SpirePort"), spireChoice), undefined);
assert.equal(
  spireSupplyRule.describe("Spire Port"),
  "Spire Port gives more Max Supplies",
);

// Preferring the better freighter is a snapshot answer. With the preference
// off the rule multiplies by x1, which is how the executor drops it from the
// phase entirely.
const freighterRule = ruleById("best-freighter");
const freighterChoice = snapshotOf({
  freighterChoice: {
    worseId: "GorddonFreighter",
    betterTitle: "Super Freighter",
  },
});
assert.equal(freighterRule.enabled(freighterChoice), true);
assert.equal(
  freighterRule.enabled(emptySnapshot),
  false,
  "there is no better freighter to prefer while only one is buildable",
);
assert.equal(
  freighterRule.match(named("GorddonFreighter"), freighterChoice),
  "Super Freighter",
);
assert.equal(
  freighterRule.match(named("Alien1SuperFreighter"), freighterChoice),
  undefined,
);
assert.equal(
  freighterRule.describe("Super Freighter"),
  "Super Freighter gives more Money",
);
assert.equal(freighterRule.multiplier(emptySnapshot), 1);
assert.equal(
  freighterRule.multiplier(snapshotOf({ buildBestFreighterOnly: true })),
  0,
);

// Unused ejector capacity is built capacity minus the capacity the game has
// already assigned.
const ejectorRule = ruleById("unused-ejectors");
assert.equal(
  ejectorRule.enabled(emptySnapshot),
  false,
  "an unbuilt ejector has no unused capacity",
);
assert.equal(
  ejectorRule.enabled(snapshotOf({ unusedEjectorCapacity: 1_000 })),
  true,
);
assert.equal(
  ejectorRule.enabled(snapshotOf({ unusedEjectorCapacity: 50 })),
  false,
  "a nearly-full ejector is not worth another one",
);
assert.equal(ejectorRule.match(named("BlackholeMassEjector")), true);
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
assert.equal(
  randomRule.match(named("TauGas2Name", { randomlyWeighted: true })),
  true,
);
assert.equal(randomRule.match(otherBuilding), false);
assert.equal(randomRule.multiplier(emptySnapshot), 1.5);

// The Banana Republic objective guard is one snapshot answer that already
// folds in the master achievement toggle.
assert.equal(bananaRule.enabled(emptySnapshot), false);
assert.equal(
  bananaRule.enabled(snapshotOf({ bananaRepublicGuardActive: true })),
  false,
  "only a Banana Republic run has the objective",
);
assert.equal(
  bananaRule.enabled(
    snapshotOf({ bananaRepublicGuardActive: true, bananaRace: true }),
  ),
  true,
);

// The prestige-route rules ask the snapshot which route is configured. All but
// the Witch Hunter one also require the "only build what the route needs"
// setting, and every one of them is off on a route they do not name.
const prestigeRouteCases = [
  ["prestige-unneeded", { prestigeRoute: "whitehole" }],
  ["prestige-unneeded-bioseed", { prestigeRoute: "bioseed" }],
  ["prestige-unneeded-whitehole", { prestigeRoute: "whitehole" }],
  ["prestige-unneeded-vacuum", { prestigeRoute: "vacuum" }],
  ["prestige-unneeded-terraform", { prestigeRoute: "terraform" }],
  ["prestige-unneeded-ascension-towers", { prestigeRoute: "ascension" }],
  [
    "prestige-unneeded-ascension-missions",
    { prestigeRoute: "ascension", pillarFinished: true },
  ],
];
for (const [id, answers] of prestigeRouteCases) {
  const rule = ruleById(id);
  assert.equal(
    rule.enabled(snapshotOf({ ...answers, limitPrestigeConstruction: true })),
    true,
    `${id} is enabled on its own route`,
  );
  assert.equal(
    rule.enabled(snapshotOf(answers)),
    false,
    `${id} respects the prestige construction limit`,
  );
  assert.equal(
    rule.enabled(snapshotOf({ limitPrestigeConstruction: true })),
    id === "prestige-unneeded",
    `${id} only fires on the route it names`,
  );
}
assert.equal(
  ruleById("prestige-unneeded").match(named("GasSpaceDockProbe")),
  true,
);
assert.equal(
  ruleById("prestige-unneeded-bioseed").match(named("TitanMission")),
  true,
);
assert.equal(
  ruleById("prestige-unneeded-whitehole").match(named("BlackholeJumpShip")),
  true,
);
assert.equal(
  ruleById("prestige-unneeded-vacuum").match(named("BlackholeStellarEngine")),
  true,
);
assert.equal(
  ruleById("prestige-unneeded-terraform").match(named("RuinsMission")),
  true,
);
assert.equal(
  ruleById("prestige-unneeded-ascension-towers").match(named("GateWestTower")),
  true,
);
assert.equal(
  ruleById("prestige-unneeded-ascension-missions").match(named("PitMission")),
  false,
  "Ascension still needs the Pit Mission for the Soul Gem progression",
);
assert.equal(
  ruleById("prestige-unneeded-ascension-missions").match(named("RuinsMission")),
  true,
);
// The Witch Hunter Ascension has its own Waygate rule and no construction gate.
const witchHunterRule = ruleById("prestige-unneeded-witch-hunter");
assert.equal(
  witchHunterRule.enabled(
    snapshotOf({ witchHunterRace: true, prestigeRoute: "ascension" }),
  ),
  true,
);
assert.equal(
  witchHunterRule.enabled(snapshotOf({ prestigeRoute: "ascension" })),
  false,
);
assert.equal(witchHunterRule.match(named("SpireWaygate")), true);
// The two Ascension rules stand down for a Witch Hunter run.
for (const id of [
  "prestige-unneeded-ascension-towers",
  "prestige-unneeded-ascension-missions",
]) {
  assert.equal(
    ruleById(id).enabled(
      snapshotOf({
        limitPrestigeConstruction: true,
        prestigeRoute: "ascension",
        pillarFinished: true,
        witchHunterRace: true,
      }),
    ),
    false,
    `${id} stands down for the Witch Hunter Ascension`,
  );
}

const ignitionRule = ruleById("prestige-blocked-ignition");
assert.equal(
  ignitionRule.enabled(snapshotOf({ truepathRace: true })),
  true,
  "an unallowed retirement blocks ignition on its own",
);
assert.equal(
  ignitionRule.enabled(
    snapshotOf({ truepathRace: true, prestigeRetireAllowed: true }),
  ),
  false,
);
assert.equal(
  ignitionRule.enabled(
    snapshotOf({
      truepathRace: true,
      prestigeRetireAllowed: true,
      matrioshkaBrainIncomplete: true,
    }),
  ),
  true,
  "an unfinished Matrioshka Brain blocks ignition even when retirement is allowed",
);
assert.equal(ignitionRule.enabled(emptySnapshot), false);
assert.equal(ignitionRule.match(named("TauGas2IgniteGasGiant")), true);

const soulGemRule = ruleById("saving-soul-gems-for-prestige");
assert.equal(
  soulGemRule.enabled(
    snapshotOf({ prestigeRoute: "whitehole", saveSoulGemsForPrestige: true }),
  ),
  true,
);
assert.equal(
  soulGemRule.enabled(snapshotOf({ prestigeRoute: "whitehole" })),
  false,
);
assert.equal(
  soulGemRule.enabled(snapshotOf({ saveSoulGemsForPrestige: true })),
  false,
);
const twentyGems = snapshotOf({ soulGemQuantity: 20 });
assert.equal(
  soulGemRule.match(named("Mine", { cost: { Soul_Gem: 5 } }), twentyGems),
  false,
);
assert.equal(
  soulGemRule.match(named("Mine", { cost: { Soul_Gem: 11 } }), twentyGems),
  true,
  "the last ten Soul Gems are reserved for the reset",
);
assert.equal(
  soulGemRule.match(otherBuilding, snapshotOf({ soulGemQuantity: 5 })),
  false,
  "a candidate that costs no Soul Gems never reserves any",
);

// Storage, housing, Horseshoes, Zen, and Tau Belt security are whole-run
// answers now, so their rules only identify the buildings they apply to.
const storageUnusedRule = ruleById("unused-storage");
assert.equal(storageUnusedRule.enabled(emptySnapshot), false);
assert.equal(
  storageUnusedRule.enabled(snapshotOf({ unusedStorageParts: true })),
  true,
);
assert.equal(storageUnusedRule.match(named("Warehouse")), true);
assert.equal(storageUnusedRule.match(otherBuilding), false);

const storageNeededRule = ruleById("need-more-storage");
assert.equal(storageNeededRule.enabled(emptySnapshot), false);
assert.equal(
  storageNeededRule.enabled(snapshotOf({ storagePartsAllAssigned: true })),
  true,
);
assert.equal(storageNeededRule.match(named("Shed")), true);
assert.equal(storageNeededRule.match(otherBuilding), false);

const housingRule = ruleById("no-more-houses-needed");
assert.equal(housingRule.enabled(emptySnapshot), false);
assert.equal(housingRule.enabled(snapshotOf({ housingUnderused: true })), true);
assert.equal(housingRule.match(named("Cottage", { housing: true })), true);
assert.equal(housingRule.match(named("Transmitter", { housing: true })), false);
assert.equal(
  housingRule.match(named("Alien1Consulate", { housing: true })),
  false,
);
assert.equal(
  housingRule.match(
    candidateOf({
      id: "Assemble",
      housing: true,
      producedResource: "Population",
    }),
  ),
  false,
  "assembling population is not a house",
);

const zenRule = ruleById("meditation-space-unneeded");
assert.equal(
  zenRule.enabled(snapshotOf({ calmRace: true, zenBelowCap: true })),
  true,
);
assert.equal(zenRule.enabled(snapshotOf({ zenBelowCap: true })), false);
assert.equal(zenRule.enabled(snapshotOf({ calmRace: true })), false);
assert.equal(
  zenRule.match(named("MeditationSpace", { actionId: "meditation" })),
  true,
);
assert.equal(zenRule.match(otherBuilding), false);

const horseshoeRule = ruleById("horseshoes-useless");
assert.equal(
  horseshoeRule.enabled(
    snapshotOf({ hoovedRace: true, horseshoesSufficient: true }),
  ),
  true,
);
assert.equal(
  horseshoeRule.enabled(snapshotOf({ horseshoesSufficient: true })),
  false,
);
const horseshoeAction = candidateOf({
  id: "Horseshoe",
  producedResource: "Horseshoe",
});
assert.equal(horseshoeRule.match(horseshoeAction), true);
assert.equal(horseshoeRule.match(otherBuilding), false);
assert.equal(
  horseshoeRule.describe(
    true,
    horseshoeAction,
    snapshotOf({ horseshoeTitle: "Horseshoes" }),
  ),
  "No more Horseshoes needed",
);

// A candidate that assembles population is only useless once every housing is
// occupied.
const emptyHousingRule = ruleById("no-empty-housings");
assert.equal(
  emptyHousingRule.match(assembler, snapshotOf({ populationAtCap: true })),
  true,
);
assert.equal(emptyHousingRule.match(assembler, emptySnapshot), false);
assert.equal(
  emptyHousingRule.match(otherBuilding, snapshotOf({ populationAtCap: true })),
  false,
);

// New buildings are weighed up, but producing a resource is not "building" one.
const newBuildingRule = ruleById("new-building");
assert.equal(newBuildingRule.match(otherBuilding), true);
assert.equal(newBuildingRule.match(named("Mine", { count: 1 })), false);
assert.equal(newBuildingRule.match(assembler), false);

const beltRule = ruleById("tau-belt-ship-efficiency");
const beltSecurity = (available, used) =>
  snapshotOf({
    truepathRace: true,
    tauBeltSupportAvailable: available,
    tauBeltSupportUsed: used,
  });
assert.equal(beltRule.enabled(beltSecurity(6, 9)), true);
assert.equal(
  beltRule.enabled(beltSecurity(9, 6)),
  false,
  "a belt with spare security is efficient enough already",
);
assert.equal(
  beltRule.enabled(
    snapshotOf({ tauBeltSupportAvailable: 6, tauBeltSupportUsed: 9 }),
  ),
  false,
  "only True Path has a Tau Belt",
);
const shipGain = beltRule.match(
  named("TauBeltWhalingShip"),
  beltSecurity(6, 9),
);
assert.ok(shipGain > 0 && shipGain < 1);
assert.equal(beltRule.match(otherBuilding, beltSecurity(6, 9)), undefined);
assert.equal(beltRule.multiplier(emptySnapshot, shipGain), shipGain);
assert.equal(
  beltRule.multiplier(emptySnapshot),
  -1,
  "a candidate the rule did not match is not a belt ship at all",
);

// The Embassy threshold is a snapshot answer, and `describe` reports the same
// number the gate compared against.
const embassyRule = ruleById("embassy-knowledge-required");
const embassy = named("GorddonEmbassy");
const embassyWanted = snapshotOf({
  embassyMissing: true,
  knowledgeCapacity: 5_000_000,
  embassyKnowledgeTarget: 6_000_000,
});
assert.equal(embassyRule.enabled(embassyWanted), true);
assert.equal(embassyRule.enabled(emptySnapshot), false);
assert.equal(embassyRule.match(embassy), true);
assert.equal(embassyRule.match(otherBuilding), false);
assert.equal(
  embassyRule.describe(true, embassy, embassyWanted),
  "6000000 Max Knowledge required",
);
assert.equal(
  embassyRule.enabled(
    snapshotOf({
      knowledgeCapacity: 5_000_000,
      embassyKnowledgeTarget: 6_000_000,
    }),
  ),
  false,
  "one Embassy is all the script wants",
);

// The three consumption answers arrive already resolved to a resource name.
for (const [id, field, resource, note] of [
  [
    "missing-consumption",
    "missingConsumption",
    "Coal",
    "Missing Coal to operate",
  ],
  [
    "missing-support",
    "missingSupport",
    "Elerium Support",
    "Missing Elerium Support to operate",
  ],
  [
    "useless-support",
    "uselessSupport",
    "Belt Support",
    "Provided Belt Support not currently needed",
  ],
]) {
  const rule = ruleById(id);
  assert.equal(rule.enabled(emptySnapshot), true);
  assert.equal(rule.match(named("Mine", { [field]: resource })), resource);
  assert.equal(rule.match(otherBuilding), undefined);
  assert.equal(rule.describe(resource), note);
}

// Both Slave Market blockers are snapshot answers, and a full pen outranks the
// money question.
const slaveRule = ruleById("slave-market-blocked");
const slaveMarket = named("SlaveMarket");
assert.equal(
  slaveRule.match(slaveMarket, snapshotOf({ slaveIncomeInsufficient: true })),
  "Buying slaves only with excess money",
);
assert.equal(
  slaveRule.match(slaveMarket, emptySnapshot),
  undefined,
  "income above the target is excess money",
);
assert.equal(
  slaveRule.match(
    slaveMarket,
    snapshotOf({ slavePensFull: true, slaveIncomeInsufficient: true }),
  ),
  "Slave pens already full",
);
assert.equal(
  slaveRule.match(otherBuilding, snapshotOf({ slavePensFull: true })),
  undefined,
);

console.log("Weighting policy module tests passed");
