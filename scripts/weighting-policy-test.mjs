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
// Every resource question the rules ask now arrives on the snapshot. The two
// resources left here are only compared for identity against a candidate's own
// resource, which waits for the typed candidate view.
let context = {
  resources: {
    Population: { name: "Population" },
    Horseshoe: { name: "Horseshoe" },
  },
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
    autoBuildEnabled: false,
    autoFleetEnabled: false,
    minerJobsDisabled: false,
    compareTransportsBySoulGems: false,
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
    freighterChoiceOpen: false,
    lakeShipChoiceOpen: false,
    spireSupplyChoiceOpen: false,
    embassyMissing: false,
    matrioshkaBrainIncomplete: false,
    unusedEjectorCapacity: 0,
    noOilProduction: false,
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
assert.equal(disabledRule.enabled(emptySnapshot), true);
assert.equal(
  disabledRule.enabled(snapshotOf({ autoBuildEnabled: true })),
  false,
);
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
assert.equal(authorityRule.match(buildings.Barracks), true);
assert.equal(authorityRule.enabled(emptySnapshot), false);

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
assert.equal(fleetPiracyRule.match(buildings.Dreadnought), true);
assert.equal(fleetPiracyRule.match(buildings.GatewayStarbase), false);

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
assert.equal(fuelDepotRule.match(buildings.SpacePropellantDepot), true);
assert.equal(fuelDepotRule.match(buildings.Mine), false);

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
assert.equal(fuelWellRule.match(buildings.GasMoonOilExtractor), true);
assert.equal(fuelWellRule.match(buildings.Mine), false);

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
const vacuumRun = snapshotOf({ prestigeRoute: "vacuum" });
assert.equal(vacuumManaRule.enabled(vacuumRun), true);
assert.equal(vacuumManaRule.match(context.buildings.Pylon), true);
assert.equal(vacuumManaRule.match(context.buildings.Bank), false);
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
context.buildings = {
  ...context.buildings,
  NeutronCitadel: { _vueBinding: "NeutronCitadel", powered: 5 },
};
const energyRule = ruleById("not-enough-energy");
const citadel = context.buildings.NeutronCitadel;
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
  energyRule.match({ _vueBinding: "Factory", powered: 60 }, powered()),
  true,
);
assert.equal(
  energyRule.match({ _vueBinding: "Factory", powered: 40 }, powered()),
  false,
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

// The tech gates and the race gates are both snapshot answers, so an `enabled`
// that combines them reads nothing live.
context.buildings = {
  ...context.buildings,
  SpaceTestLaunch: { _vueBinding: "SpaceTestLaunch" },
  SpireWaygate: { _vueBinding: "SpireWaygate" },
  SpireEdenicGate: { _vueBinding: "SpireEdenicGate" },
  SpireSphinx: { _vueBinding: "SpireSphinx" },
  ElysiumFireSupportBase: { _vueBinding: "ElysiumFireSupportBase", count: 100 },
  AsphodelStabilizer: { _vueBinding: "AsphodelStabilizer", count: 5 },
  AsphodelWarehouse: { _vueBinding: "AsphodelWarehouse", count: 5 },
};

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
context.buildings = {
  ...context.buildings,
  CoalMine: { _vueBinding: "CoalMine" },
  Mine: { _vueBinding: "Mine" },
};
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
const cannibalSnapshot = snapshotOf({
  cannibalizeRace: true,
  populationAtCap: true,
});
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
assert.equal(lakeRule.enabled(snapshotOf({ lakeShipChoiceOpen: true })), true);
assert.equal(
  lakeRule.enabled(emptySnapshot),
  false,
  "a ship the script cannot build right now is not a choice",
);
assert.equal(
  lakeRule.enabled(
    snapshotOf({ lakeShipChoiceOpen: true, lakeSupportSpare: 5 }),
  ),
  false,
  "spare Lake support makes either ship worth building",
);
assert.equal(lakeRule.match(lakeTransport, emptySnapshot), lakeBireme);
assert.equal(lakeRule.match(lakeBireme, emptySnapshot), undefined);
const bloodstoneSnapshot = snapshotOf({ lakeBiremeSupplyRate: 0.8 });
assert.equal(lakeRule.match(lakeBireme, bloodstoneSnapshot), lakeTransport);
assert.equal(lakeRule.match(lakeTransport, bloodstoneSnapshot), undefined);
assert.equal(
  lakeRule.describe(lakeBireme),
  "Bireme Warship gives more Supplies",
);
// Comparing by Soul Gems instead of support flips the winner once the ships
// cost different amounts.
lakeBireme.cost = { Soul_Gem: 10 };
const gemComparison = snapshotOf({ compareTransportsBySoulGems: true });
assert.equal(lakeRule.match(lakeBireme, gemComparison), lakeTransport);
assert.equal(lakeRule.match(lakeTransport, gemComparison), undefined);
assert.equal(lakeRule.match(lakeTransport, emptySnapshot), lakeBireme);

// Unused ejector capacity is built capacity minus the capacity the game has
// already assigned.
const ejectorRule = ruleById("unused-ejectors");
const ejector = { _vueBinding: "BlackholeMassEjector", count: 1 };
context.buildings = { ...context.buildings, BlackholeMassEjector: ejector };
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
  freighterRule.enabled(snapshotOf({ freighterChoiceOpen: true })),
  true,
);
assert.equal(
  freighterRule.enabled(emptySnapshot),
  false,
  "there is no better freighter to prefer while only one is buildable",
);
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
  soulGemRule.match({ cost: { Soul_Gem: 5 } }, twentyGems),
  undefined,
);
assert.equal(
  soulGemRule.match({ cost: { Soul_Gem: 11 } }, twentyGems),
  true,
  "the last ten Soul Gems are reserved for the reset",
);

// Storage, housing, Horseshoes, Zen, and Tau Belt security are whole-run
// answers now, so their rules only identify the buildings they apply to.
context.buildings = {
  ...context.buildings,
  StorageYard: { _vueBinding: "StorageYard" },
  Warehouse: { _vueBinding: "Warehouse" },
  EnceladusMunitions: { _vueBinding: "EnceladusMunitions" },
  Shed: { _vueBinding: "Shed" },
  TauBeltWhalingShip: { _vueBinding: "TauBeltWhalingShip" },
};
const otherBuilding = { _vueBinding: "Mine" };

const storageUnusedRule = ruleById("unused-storage");
assert.equal(storageUnusedRule.enabled(emptySnapshot), false);
assert.equal(
  storageUnusedRule.enabled(snapshotOf({ unusedStorageParts: true })),
  true,
);
assert.equal(storageUnusedRule.match(context.buildings.Warehouse), true);
assert.equal(storageUnusedRule.match(otherBuilding), false);

const storageNeededRule = ruleById("need-more-storage");
assert.equal(storageNeededRule.enabled(emptySnapshot), false);
assert.equal(
  storageNeededRule.enabled(snapshotOf({ storagePartsAllAssigned: true })),
  true,
);
assert.equal(storageNeededRule.match(context.buildings.Shed), true);
assert.equal(storageNeededRule.match(otherBuilding), false);

const housingRule = ruleById("no-more-houses-needed");
assert.equal(housingRule.enabled(emptySnapshot), false);
assert.equal(housingRule.enabled(snapshotOf({ housingUnderused: true })), true);

const zenRule = ruleById("meditation-space-unneeded");
assert.equal(
  zenRule.enabled(snapshotOf({ calmRace: true, zenBelowCap: true })),
  true,
);
assert.equal(zenRule.enabled(snapshotOf({ zenBelowCap: true })), false);
assert.equal(zenRule.enabled(snapshotOf({ calmRace: true })), false);

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
assert.equal(
  horseshoeRule.describe(
    true,
    otherBuilding,
    snapshotOf({ horseshoeTitle: "Horseshoes" }),
  ),
  "No more Horseshoes needed",
);

// A candidate that assembles population is only useless once every housing is
// occupied.
const emptyHousingRule = ruleById("no-empty-housings");
const assembler = new ResourceAction();
assembler.resource = context.resources.Population;
assert.equal(
  emptyHousingRule.match(assembler, snapshotOf({ populationAtCap: true })),
  true,
);
assert.equal(emptyHousingRule.match(assembler, emptySnapshot), false);

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
  context.buildings.TauBeltWhalingShip,
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
context.buildings = {
  ...context.buildings,
  GorddonEmbassy: { _vueBinding: "GorddonEmbassy", count: 0 },
};
const embassyWanted = snapshotOf({
  embassyMissing: true,
  knowledgeCapacity: 5_000_000,
  embassyKnowledgeTarget: 6_000_000,
});
assert.equal(embassyRule.enabled(embassyWanted), true);
assert.equal(embassyRule.enabled(emptySnapshot), false);
assert.equal(
  embassyRule.describe(true, context.buildings.GorddonEmbassy, embassyWanted),
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

// The Spire supply pair and the Matrioshka Brain gate are the last two named
// buildings the rules asked about directly.
const spireSupplyRule = ruleById("spire-port-vs-base-camp");
const spirePortCandidate = { _vueBinding: "SpirePort", count: 2 };
const spireCampCandidate = { _vueBinding: "SpireBaseCamp", count: 2 };
context.buildings = {
  ...context.buildings,
  SpirePort: spirePortCandidate,
  SpireBaseCamp: spireCampCandidate,
  TauGas2IgniteGasGiant: { _vueBinding: "TauGas2IgniteGasGiant" },
};
assert.equal(
  spireSupplyRule.enabled(snapshotOf({ spireSupplyChoiceOpen: true })),
  true,
);
assert.equal(spireSupplyRule.enabled(emptySnapshot), false);
assert.equal(
  spireSupplyRule.match(spireCampCandidate, emptySnapshot),
  spirePortCandidate,
  "at two of each, one more Port supplies more than one more Base Camp",
);
assert.equal(
  spireSupplyRule.match(spirePortCandidate, emptySnapshot),
  undefined,
);

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
assert.equal(ignitionRule.match(context.buildings.TauGas2IgniteGasGiant), true);

// Both Slave Market blockers are snapshot answers, and a full pen outranks the
// money question.
const slaveRule = ruleById("slave-market-blocked");
const slaveMarket = { _vueBinding: "SlaveMarket" };
context.buildings = { ...context.buildings, SlaveMarket: slaveMarket };
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
  slaveRule.match(buildings.Mine, snapshotOf({ slavePensFull: true })),
  undefined,
);

console.log("Weighting policy module tests passed");
