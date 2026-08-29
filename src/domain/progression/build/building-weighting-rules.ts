import type {
  BuildingChoice,
  BuildingWeightingCandidate,
  BuildingWeightingRule,
  MechSupplySavingReason,
  SacrificeBlockedReason,
} from "./building-weighting.ts";

const SACRIFICE_BLOCKED_NOTES: Readonly<
  Record<SacrificeBlockedReason, string>
> = {
  windless: "Parasites sacrificed only during windy weather",
  "no-default-workers": "No default workers to sacrifice",
  "bonus-capped": "Sacrifice bonus already high enough",
};

/**
 * Every building catalog key the rules name. One list makes a misspelled key a
 * type error rather than a rule that silently never matches, and the adapter
 * contract test proves each of these exists in the live catalog.
 */
const NAMED_BUILDINGS = [
  "Alien1Consulate",
  "AlphaExchange",
  "AlphaLuxuryCondo",
  "AlphaWarehouse",
  "AsphodelBunker",
  "AsphodelStabilizer",
  "BadlandsAttractor",
  "BadlandsMinions",
  "Bank",
  "Banquet",
  "Barracks",
  "BeltSpaceStation",
  "BlackholeJumpShip",
  "BlackholeMassEjector",
  "BlackholeStellarEngine",
  "Casino",
  "CoalMine",
  "CorvetteShip",
  "CruiserShip",
  "Dreadnought",
  "DwarfWorldCollider",
  "ElysiumEternalBank",
  "ElysiumFireSupportBase",
  "EnceladusMunitions",
  "ErisDrone",
  "ErisTank",
  "ErisTrooper",
  "FrigateShip",
  "GasMoonOilExtractor",
  "GasSpaceDock",
  "GasSpaceDockGECK",
  "GasSpaceDockProbe",
  "GasSpaceDockShipSegment",
  "GasStorage",
  "GateEastTower",
  "GateTurret",
  "GateWestTower",
  "GorddonEmbassy",
  "HellSpaceCasino",
  "LakeCoolingTower",
  "Mill",
  "Mine",
  "NeutronCitadel",
  "OilDepot",
  "OilWell",
  "PitMission",
  "ProximaCargoYard",
  "ProximaCruiser",
  "Pylon",
  "RedGarage",
  "RedPylon",
  "RedSpaceBarracks",
  "RedSpaceport",
  "RuinsGuardPost",
  "RuinsMission",
  "RuinsVault",
  "RuinsWarVault",
  "ScoutShip",
  "Shed",
  "SiriusThermalCollector",
  "SlaveMarket",
  "SpaceTestLaunch",
  "SpacePropellantDepot",
  "SpireBaseCamp",
  "SpireEdenicGate",
  "SpireMechBay",
  "SpirePort",
  "SpireSphinx",
  "SpireWaygate",
  "StargateDefensePlatform",
  "StargateTelemetryBeacon",
  "StorageYard",
  "TauBeltMiningShip",
  "TauBeltWhalingShip",
  "TauCasino",
  "TauCloning",
  "TauDiseaseLab",
  "TauFactory",
  "TauFusionGenerator",
  "TauGas2IgniteGasGiant",
  "TauPylon",
  "TauRedContact",
  "TauRedIntroduce",
  "TauRedSubjugate",
  "TauStarEden",
  "Temple",
  "TitanAIColonist",
  "TitanBank",
  "TitanDecoder",
  "TitanMission",
  "TitanStorehouse",
  "TouristCenter",
  "Transmitter",
  "Wardenclyffe",
  "Warehouse",
  "WastelandBrute",
  "WastelandHellCasino",
  "WastelandThrone",
] as const;

type NamedBuilding = (typeof NAMED_BUILDINGS)[number];

/** Whether the candidate is one of the buildings a rule names. */
const isBuilding = (
  candidate: BuildingWeightingCandidate,
  ...ids: readonly NamedBuilding[]
): boolean => (ids as readonly string[]).includes(candidate.id);

/**
 * The title of the better side of a two-building choice, when this candidate is
 * the side that loses it.
 */
const losesChoice = (
  candidate: BuildingWeightingCandidate,
  choice: BuildingChoice,
): string | undefined =>
  choice !== null && choice.worseId === candidate.id
    ? choice.betterTitle
    : undefined;

/**
 * Erases a rule's match payload so the ordered list can hold rules that carry
 * different payloads. A payload only ever travels from a rule's own `match` to
 * its own `describe` and `multiplier`, which is why the cast is confined here.
 */
function weightingRule<Match>(
  rule: BuildingWeightingRule<Match>,
): BuildingWeightingRule<unknown> {
  return rule as BuildingWeightingRule<unknown>;
}

const authorityCapBuildings: readonly NamedBuilding[] = [
  "Barracks",
  "Temple",
  "RedSpaceBarracks",
  "ProximaCruiser",
  "BeltSpaceStation",
  "WastelandBrute",
  "BadlandsMinions",
  "WastelandThrone",
  "AsphodelBunker",
];
const INFLATION_CHALLENGE_MONEY = 25e10;
const RETIREMENT_PREP = {
  fusionGenerators: 20,
  factories: 18,
  scienceLabs: 11,
  graphene: 200e6,
};
/**
 * Tau Disease Labs a Matrix run builds toward. The cure that gates
 * `focus_cure 3` fills at `curve(labs / 100) / 5` per game tick, so one lab is
 * two orders of magnitude slower than a handful; the target matches the
 * Retirement science-lab plan because the same 1.25x cost curve limits both.
 */
const MATRIX_CURE_LABS = 11;
const inflationMoneyStorageBuildings: readonly NamedBuilding[] = [
  "Bank",
  "Casino",
  "HellSpaceCasino",
  "TitanBank",
  "TauCasino",
  "AlphaExchange",
  "RuinsVault",
  "RuinsWarVault",
  "WastelandHellCasino",
  "ElysiumEternalBank",
];
const inflationMoneyIncomeBuildings: readonly NamedBuilding[] = [
  "TouristCenter",
  "Casino",
  "HellSpaceCasino",
  "TauCasino",
  "AlphaLuxuryCondo",
  "WastelandHellCasino",
];
const galaxyCombatShips: readonly NamedBuilding[] = [
  "ScoutShip",
  "CorvetteShip",
  "FrigateShip",
  "CruiserShip",
  "Dreadnought",
];

type BuildingWeightingDependencies = {
  /** Formats a whole number for an annotation, e.g. `1.2M`. */
  readonly formatNumber: (value: number) => string;
  /** Formats a fractional number for an annotation, e.g. `12.3`. */
  readonly formatNiceNumber: (value: number) => string;
  /**
   * A value in the half-open interval [0, 1). Injected so the one randomized
   * rule stays deterministic in tests.
   */
  readonly nextRandomUnit: () => number;
};

export function createBuildingWeightingPolicy({
  formatNumber,
  formatNiceNumber,
  nextRandomUnit,
}: BuildingWeightingDependencies) {
  const weightingRules: readonly BuildingWeightingRule<unknown>[] = [
    weightingRule({
      // Set weighting to zero right away, and skip all checks if autoBuild is disabled
      id: "autobuild-off",
      enabled: (snapshot) => !snapshot.autoBuildEnabled,
      match: () => true,
      describe: () => "",
      multiplier: () => 0,
    }),
    weightingRule({
      // Should always be on top, processing locked building may lead to issues
      id: "locked",
      enabled: () => true,
      match: (candidate) => !candidate.unlocked,
      describe: () => "Locked",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "queued-target",
      enabled: () => true,
      match: (candidate, snapshot) => snapshot.queuedTargets.has(candidate.id),
      describe: () => "Queued building, processing...",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "trigger-target",
      enabled: () => true,
      match: (candidate, snapshot) => snapshot.triggerTargets.has(candidate.id),
      describe: () => "Active trigger, processing...",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "autobuild-disabled",
      enabled: () => true,
      match: (candidate) => !candidate.autoBuildEnabled,
      describe: () => "AutoBuild disabled",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "maximum-amount-reached",
      enabled: () => true,
      match: (candidate) => candidate.count >= candidate.autoMax,
      describe: () => "Maximum amount reached",
      multiplier: () => 0,
    }),
    weightingRule({
      // Red buildings need to be filtered out, so they won't prevent affordable buildings with lower weight from building
      id: "unaffordable",
      enabled: () => true,
      match: (candidate) => !candidate.affordable,
      describe: () => "",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "truepath-ai-apocalypse",
      enabled: (snapshot) => snapshot.truepathAiBuildingTarget !== null,
      match: (candidate, snapshot) =>
        candidate.id === snapshot.truepathAiBuildingTarget,
      describe: (_match, _candidate, snapshot) =>
        snapshot.truepathAiBuildingTarget === "TitanDecoder"
          ? "True Path AI needs an active Decoder"
          : snapshot.truepathAiBuildingTarget === "TitanAIColonist"
            ? `True Path AI progress ${formatNiceNumber(snapshot.truepathAiProgress)}% — building Colonists toward ${snapshot.truepathAiTargetColonists}`
            : `True Path AI progress ${formatNiceNumber(snapshot.truepathAiProgress)}% — adding ${snapshot.truepathAiBuildingTarget === "ErisTrooper" ? "Troopers" : "Tanks"}`,
      // This objective beats ordinary space construction once affordable. The
      // normal power, support, and resource rules still apply afterward.
      multiplier: () => 100,
    }),
    weightingRule<number>({
      id: "truepath-test-launch-sabotage",
      enabled: (snapshot) =>
        snapshot.truepathRace &&
        snapshot.testLaunchUnlocked &&
        !snapshot.worldUnified,
      match: (candidate, snapshot) =>
        isBuilding(candidate, "SpaceTestLaunch")
          ? snapshot.testLaunchSuccessChance
          : undefined,
      describe: (chance) =>
        `${Math.round(chance * 100)}% chance of successful launch`,
      multiplier: (_snapshot, chance) =>
        chance !== undefined && chance < 0.5 ? chance : 0,
    }),
    weightingRule({
      id: "eris-digsite-unsecured",
      enabled: (snapshot) =>
        snapshot.truepathRace && snapshot.erisDigsiteUnsecured,
      match: (candidate) =>
        isBuilding(candidate, "ErisDrone", "ErisTank", "ErisTrooper"),
      describe: () => "Eris Digsite is not yet secured",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingTruepathDigsite,
    }),
    weightingRule({
      id: "andromeda-miners-disabled",
      enabled: (snapshot) =>
        snapshot.minerJobsDisabled && snapshot.andromedaReached,
      match: (candidate, snapshot) =>
        isBuilding(candidate, "CoalMine") ||
        (isBuilding(candidate, "Mine") && !snapshot.mineIsOnlyChrysotileSource),
      describe: () => "Miners disabled in Andromeda",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "piracy-fully-supressed",
      enabled: (snapshot) => snapshot.stargatePiracySupressed,
      match: (candidate) => isBuilding(candidate, "StargateDefensePlatform"),
      describe: () => "Piracy fully supressed",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "piracy-covered-by-fleet",
      enabled: (snapshot) =>
        snapshot.autoFleetEnabled &&
        snapshot.galaxyPiracyCoveredByFleet &&
        !snapshot.galaxyAssaultPending,
      match: (candidate) => isBuilding(candidate, ...galaxyCombatShips),
      describe: () => "Piracy fully covered by fleet",
      multiplier: () => 0,
    }),
    weightingRule<MechSupplySavingReason>({
      id: "mech-supply-saving",
      enabled: (snapshot) => snapshot.mechSupplySaving !== null,
      match: (candidate, snapshot) =>
        candidate.cost["Supply"] === undefined
          ? undefined
          : (snapshot.mechSupplySaving ?? undefined),
      describe: (reason) =>
        reason === "building"
          ? "Building mechs..."
          : "Saving supplies for new mech",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-unneeded-ascension-towers",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "ascension" &&
        !snapshot.witchHunterRace,
      match: (candidate) =>
        isBuilding(candidate, "GateEastTower", "GateWestTower"),
      describe: () => "Not needed for Ascension prestige",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "gate-supression-too-low",
      enabled: (snapshot) => snapshot.gateTowerSupressionTooLow,
      match: (candidate) =>
        isBuilding(candidate, "GateEastTower", "GateWestTower"),
      describe: () => "Too low gate supression",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "saving-soul-gems-for-prestige",
      enabled: (snapshot) =>
        snapshot.prestigeRoute === "whitehole" &&
        snapshot.saveSoulGemsForPrestige,
      match: (candidate, snapshot) => {
        // A candidate that costs no Soul Gems never reserves any.
        const cost = candidate.cost["Soul_Gem"];
        return cost !== undefined && cost > snapshot.soulGemQuantity - 10;
      },
      describe: () => "Saving up Soul Gems for prestige",
      multiplier: () => 0,
    }),
    weightingRule<string>({
      id: "best-freighter",
      enabled: (snapshot) => snapshot.freighterChoice !== null,
      match: (candidate, snapshot) =>
        losesChoice(candidate, snapshot.freighterChoice),
      describe: (better) => `${better} gives more Money`,
      multiplier: (snapshot) => (snapshot.buildBestFreighterOnly ? 0 : 1),
    }),
    weightingRule<string>({
      id: "lake-transport-vs-bireme",
      // Build any if there's spare support
      enabled: (snapshot) =>
        snapshot.lakeShipChoice !== null && snapshot.lakeSupportSpare <= 1,
      match: (candidate, snapshot) =>
        losesChoice(candidate, snapshot.lakeShipChoice),
      describe: (better) => `${better} gives more Supplies`,
      multiplier: () => 0,
    }),
    weightingRule<string>({
      id: "spire-port-vs-base-camp",
      enabled: (snapshot) => snapshot.spireSupplyChoice !== null,
      match: (candidate, snapshot) =>
        losesChoice(candidate, snapshot.spireSupplyChoice),
      describe: (better) => `${better} gives more Max Supplies`,
      multiplier: () => 0,
    }),
    weightingRule({
      // We can't limit waygate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
      id: "spire-waygate-done",
      enabled: (snapshot) => snapshot.spireWaygateComplete,
      match: (candidate) => isBuilding(candidate, "SpireWaygate"),
      describe: () => "",
      multiplier: () => 0,
    }),
    weightingRule({
      // We can't limit edenic gate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
      id: "spire-edenic-gate-done",
      enabled: (snapshot) => snapshot.spireEdenicGateComplete,
      match: (candidate) => isBuilding(candidate, "SpireEdenicGate"),
      describe: () => "",
      multiplier: () => 0,
    }),
    weightingRule<string>({
      // Build up to 100, and then fire after researching cannon
      id: "elysium-fire-support-base-blocked",
      enabled: (snapshot) => snapshot.elysiumFireSupportUnlocked,
      match: (candidate, snapshot) => {
        if (!isBuilding(candidate, "ElysiumFireSupportBase")) {
          return undefined;
        }
        if (snapshot.elysiumGarrisonDestroyed) {
          return "Garrison is destroyed";
        }
        if (!snapshot.eleriumCannonResearched && candidate.count >= 100) {
          return "Missing Elerium Cannon tech";
        }
        return undefined;
      },
      describe: (note) => note,
      multiplier: () => 0,
    }),
    weightingRule({
      id: "warehouse-cap",
      enabled: (snapshot) => snapshot.asphodelStabilizerUnlocked,
      match: (candidate, snapshot) =>
        isBuilding(candidate, "AsphodelStabilizer") &&
        candidate.count >= snapshot.asphodelWarehouseCount,
      describe: () => "Can not exceed amount of Warehouses",
      multiplier: () => 0,
    }),
    weightingRule({
      // Sphinx not usable after solving / Harmachis not usable during Warlord
      id: "spire-sphinx-done",
      enabled: (snapshot) => snapshot.spireSphinxSolved || snapshot.warlordRace,
      match: (candidate) => isBuilding(candidate, "SpireSphinx"),
      describe: () => "",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "assembling-not-possible",
      enabled: (snapshot) =>
        snapshot.artificialRace && snapshot.assemblyCureComplete,
      match: (candidate) =>
        candidate.producedResource === "Population" &&
        !isBuilding(candidate, "TauCloning"),
      describe: () => "Assembling is not possible",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "no-empty-housings",
      enabled: (snapshot) => snapshot.artificialRace,
      match: (candidate, snapshot) =>
        candidate.producedResource === "Population" && snapshot.populationAtCap,
      describe: () => "No empty housings",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "embassy-knowledge-required",
      enabled: (snapshot) =>
        snapshot.embassyMissing &&
        snapshot.knowledgeCapacity < snapshot.embassyKnowledgeTarget,
      match: (candidate) => isBuilding(candidate, "GorddonEmbassy"),
      describe: (_match, _candidate, snapshot) =>
        `${formatNumber(snapshot.embassyKnowledgeTarget)} Max Knowledge required`,
      multiplier: () => 0,
    }),
    weightingRule({
      id: "wrong-shrine",
      enabled: (snapshot) => snapshot.shrineBonusUnwanted,
      match: (candidate) => candidate.actionId.includes("shrine"),
      describe: () => "Wrong shrine",
      multiplier: () => 0,
    }),
    weightingRule<string>({
      id: "slave-market-blocked",
      enabled: (snapshot) => snapshot.slaverRace,
      match: (candidate, snapshot) => {
        if (!isBuilding(candidate, "SlaveMarket")) {
          return undefined;
        }
        if (snapshot.slavePensFull) {
          return "Slave pens already full";
        }
        if (snapshot.slaveIncomeInsufficient) {
          return "Buying slaves only with excess money";
        }
        return undefined;
      },
      describe: (note) => note,
      multiplier: () => 0,
    }),
    weightingRule<string>({
      id: "sacrificial-altar-blocked",
      enabled: (snapshot) => snapshot.cannibalizeRace,
      match: (candidate, snapshot) => {
        if (candidate.actionId !== "s_alter" || candidate.count <= 0) {
          return undefined;
        }
        if (snapshot.populationEmpty) {
          return "Too low population";
        }
        if (!snapshot.populationAtCap) {
          return "Sacrifices performed only with full population";
        }
        if (snapshot.sacrificeBlocked !== null) {
          return SACRIFICE_BLOCKED_NOTES[snapshot.sacrificeBlocked];
        }
        return undefined;
      },
      describe: (note) => note,
      multiplier: () => 0,
    }),
    weightingRule<string>({
      id: "missing-consumption",
      enabled: () => true,
      match: (candidate) => candidate.missingConsumption ?? undefined,
      describe: (resource) => `Missing ${resource} to operate`,
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMissingSupply,
    }),
    weightingRule<string>({
      id: "missing-support",
      enabled: () => true,
      match: (candidate) => candidate.missingSupport ?? undefined,
      describe: (support) => `Missing ${support} to operate`,
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingMissingSupport,
    }),
    weightingRule<string>({
      id: "useless-support",
      enabled: () => true,
      match: (candidate) => candidate.uselessSupport ?? undefined,
      describe: (support) => `Provided ${support} not currently needed`,
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUselessSupport,
    }),
    weightingRule<number>({
      id: "tau-belt-ship-efficiency",
      enabled: (snapshot) =>
        snapshot.truepathRace &&
        snapshot.tauBeltSupportAvailable <= snapshot.tauBeltSupportUsed,
      match: (candidate, snapshot) => {
        if (!isBuilding(candidate, "TauBeltWhalingShip", "TauBeltMiningShip")) {
          return undefined;
        }
        const available = snapshot.tauBeltSupportAvailable;
        const used = snapshot.tauBeltSupportUsed;
        const currentEfficiency = 1 - (1 - available / used) ** 1.4;
        const nextEfficiency = 1 - (1 - available / (used + 1)) ** 1.4;
        return nextEfficiency * (used + 1) - currentEfficiency * used;
      },
      describe: (gain) =>
        `Low security, new ship will be ${formatNiceNumber(gain * 100)}% efficient`,
      multiplier: (_snapshot, gain) => gain ?? -1,
    }),
    weightingRule<string>({
      id: "womling-overlord-guard",
      // Narrowing this to `tau_red` level 4 was tried and did not work.
      enabled: (snapshot) => snapshot.truepathRace,
      match: (candidate, snapshot) => {
        if (
          !isBuilding(
            candidate,
            "TauRedContact",
            "TauRedIntroduce",
            "TauRedSubjugate",
          )
        ) {
          return undefined;
        }
        let missing: string | undefined;
        for (const action of snapshot.womlingOverlordActions) {
          if (action.statEarned) {
            continue;
          }
          if (action.id === candidate.id) {
            return undefined; // Unearned stat, go for it
          }
          if (action.autoBuildable) {
            missing = action.name;
          }
        }
        return missing;
      },
      describe: (name) => `Overlord achievement is missing ${name}`,
      multiplier: (snapshot) => snapshot.weights.buildingWeightingOverlord,
    }),
    weightingRule({
      // Evil universe: Authority amount is capped by Authority max. When max is below target no
      // amount of tax/soldier management can fix the production penalty, so prioritize the
      // buildings that raise the cap. (Locked/irrelevant ones are already filtered to 0 above.)
      id: "authority-cap",
      enabled: (snapshot) => snapshot.authorityCapBelowTarget,
      match: (candidate) => isBuilding(candidate, ...authorityCapBuildings),
      describe: () => "Raises Authority cap, currently below target",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingAuthority,
    }),
    weightingRule({
      id: "banana-republic-objective",
      enabled: (snapshot) =>
        snapshot.bananaRepublicGuardActive && snapshot.bananaRace,
      match: (candidate, snapshot) =>
        isBuilding(candidate, "DwarfWorldCollider") &&
        !snapshot.bananaColliderObjectiveComplete,
      describe: () => "Banana Republic objective",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingBananaObjective,
    }),
    weightingRule<"storage" | "income">({
      id: "inflation-money",
      enabled: (snapshot) => snapshot.inflationAssistActive,
      match: (candidate, snapshot) => {
        if (
          !snapshot.inflationMoneyReachable &&
          isBuilding(candidate, ...inflationMoneyStorageBuildings)
        ) {
          return "storage";
        }
        if (
          snapshot.inflationMoneyReachable &&
          isBuilding(candidate, ...inflationMoneyIncomeBuildings)
        ) {
          return "income";
        }
        return undefined;
      },
      describe: (kind) =>
        kind === "storage"
          ? "Inflation challenge needs Money storage"
          : "Inflation challenge needs Money income",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingInflationMoney,
    }),
    weightingRule<number>({
      id: "retirement-preparation",
      enabled: (snapshot) => snapshot.retirementPreparationIncomplete,
      match: (candidate) => {
        if (
          isBuilding(candidate, "TauFusionGenerator") &&
          candidate.count < RETIREMENT_PREP.fusionGenerators
        ) {
          return RETIREMENT_PREP.fusionGenerators;
        }
        if (
          isBuilding(candidate, "TauFactory") &&
          candidate.count < RETIREMENT_PREP.factories
        ) {
          return RETIREMENT_PREP.factories;
        }
        if (
          isBuilding(candidate, "TauDiseaseLab") &&
          candidate.count < RETIREMENT_PREP.scienceLabs
        ) {
          return RETIREMENT_PREP.scienceLabs;
        }
        return undefined;
      },
      describe: (target, candidate) =>
        `Retirement preparation: build ${target} ${candidate.name}`,
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingRetirementPrep,
    }),
    weightingRule<number>({
      // The first lab is the only grant of `disease 2`, which every remaining
      // Matrix technology depends on, and the labs after it set how fast the
      // cure behind `focus_cure 3` fills.
      id: "matrix-cure-preparation",
      enabled: (snapshot) => snapshot.matrixCurePreparationIncomplete,
      match: (candidate) =>
        isBuilding(candidate, "TauDiseaseLab") &&
        candidate.count < MATRIX_CURE_LABS
          ? MATRIX_CURE_LABS
          : undefined,
      describe: (target, candidate) =>
        `Matrix cure: build ${target} ${candidate.name}`,
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMatrixCure,
    }),
    weightingRule<string>({
      // Red Spaceport unlocks unification research. Let an active unification
      // achievement build this prerequisite so Red Dead can release afterward.
      id: "achievement-guard",
      // Each guard answer already folds in the master AutoAchievement toggle.
      enabled: (snapshot) =>
        snapshot.guardDreadedActive ||
        snapshot.guardEnergeticActive ||
        snapshot.guardRedDeadActive,
      match: (candidate, snapshot) => {
        if (
          isBuilding(candidate, "Dreadnought") &&
          snapshot.guardDreadedActive
        ) {
          return "Dreaded";
        }
        if (
          isBuilding(candidate, "SiriusThermalCollector") &&
          snapshot.guardEnergeticActive
        ) {
          return "Energetic";
        }
        if (
          isBuilding(candidate, "RedSpaceport") &&
          snapshot.guardRedDeadActive &&
          !snapshot.guardPacifistActive &&
          snapshot.foreignAchievementGoal === null
        ) {
          return "Red Dead";
        }
        return undefined;
      },
      describe: (name) => `${name} achievement guard`,
      multiplier: () => 0,
    }),
    weightingRule({
      id: "non-operating-city-buildings",
      enabled: () => true,
      match: (candidate) =>
        candidate.tab === "city" &&
        !isBuilding(candidate, "Mill", "Banquet") &&
        candidate.stateOffCount > 0,
      describe: () => "Still have some non operating buildings",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingNonOperatingCity,
    }),
    weightingRule({
      id: "non-operating-buildings",
      enabled: () => true,
      match: (candidate, snapshot) => {
        if (isBuilding(candidate, "BlackholeStellarEngine")) {
          // `stateOffCount` is missleading for powered multisegmented buildings. This rule shouldn't ever apply to Stellar Engine, just ignore it
          // TODO: Might be better to ignore all multisegmented buildings, or making `stateOffCount` return 0 for multisegmented buildings, but i'm not sure about possible side effects at the moment - that would work as a hot fix
          return false;
        }
        if (
          isBuilding(candidate, "BadlandsAttractor", "SpireMechBay") &&
          candidate.smartManaged
        ) {
          // Those things might be temporaly disabled by smart logic
          return false;
        }
        if (
          isBuilding(candidate, "RuinsGuardPost") &&
          candidate.smartManaged &&
          !snapshot.hellSupressUseful &&
          snapshot.hellGuardPostPrebuildIncomplete
        ) {
          // Prebuild guard posts. Even if we don't need supression right now they will be useful soon enough
          return false;
        }
        if (
          (isBuilding(candidate, "SpirePort") &&
            snapshot.spirePortPrebuildIncomplete) ||
          (isBuilding(candidate, "SpireBaseCamp") &&
            snapshot.spireBaseCampPrebuildIncomplete)
        ) {
          // Prebuild ports and base camps to their optimal ratios, they will be enabled when needed.
          return false;
        }
        // This thing not from city, switchable, and some of them disabled. We dont't need more at the moment.
        return candidate.tab !== "city" && candidate.stateOffCount > 0;
      },
      describe: () => "Still have some non operating buildings",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingNonOperating,
    }),
    weightingRule({
      id: "geck-limit",
      enabled: (snapshot) =>
        snapshot.prestigeRoute !== "bioseed" || !snapshot.geckNeeded,
      match: (candidate) => isBuilding(candidate, "GasSpaceDockGECK"),
      describe: () => "Max allowed amount of G.E.C.K reached",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-blocked-eden",
      enabled: (snapshot) =>
        snapshot.loneSurvivorRace && !snapshot.prestigeEdenAllowed,
      match: (candidate) => isBuilding(candidate, "TauStarEden"),
      describe: () => "Prestiging not currently allowed",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-blocked-ignition",
      enabled: (snapshot) =>
        snapshot.truepathRace &&
        (!snapshot.prestigeRetireAllowed || snapshot.matrioshkaBrainIncomplete),
      match: (candidate) => isBuilding(candidate, "TauGas2IgniteGasGiant"),
      describe: () => "Prestiging not currently allowed",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-unneeded",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute !== "bioseed",
      match: (candidate) =>
        isBuilding(
          candidate,
          "GasSpaceDock",
          "GasSpaceDockShipSegment",
          "GasSpaceDockProbe",
        ),
      describe: () => "Not needed for current prestige",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-unneeded-bioseed",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "bioseed",
      match: (candidate) =>
        isBuilding(candidate, "DwarfWorldCollider", "TitanMission"),
      describe: () => "Not needed for Bioseed prestige",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-unneeded-whitehole",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "whitehole",
      match: (candidate) => isBuilding(candidate, "BlackholeJumpShip"),
      describe: () => "Not needed for Whitehole prestige",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-unneeded-vacuum",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "vacuum",
      match: (candidate) => isBuilding(candidate, "BlackholeStellarEngine"),
      describe: () => "Not needed for Vacuum Collapse prestige",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-unneeded-ascension-missions",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "ascension" &&
        snapshot.pillarFinished &&
        !snapshot.witchHunterRace,
      match: (candidate) => isBuilding(candidate, "RuinsMission"),
      describe: () => "Not needed for Ascension prestige",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-unneeded-witch-hunter",
      enabled: (snapshot) =>
        snapshot.witchHunterRace && snapshot.prestigeRoute === "ascension",
      match: (candidate) => isBuilding(candidate, "SpireWaygate"),
      describe: () => "Not needed for Witch Hunter's Ascension prestige",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "prestige-unneeded-terraform",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "terraform",
      match: (candidate) => isBuilding(candidate, "PitMission", "RuinsMission"),
      describe: () => "Not needed for Terraform prestige",
      multiplier: () => 0,
    }),
    weightingRule({
      id: "awaiting-mad-prestige",
      enabled: (snapshot) => snapshot.madPrestigeAwaited,
      match: (candidate) =>
        !candidate.housing &&
        !candidate.garrison &&
        candidate.cost["Knowledge"] === undefined &&
        !isBuilding(candidate, "OilWell"),
      describe: () => "Awaiting MAD prestige",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMADUseless,
    }),
    weightingRule({
      id: "new-building",
      enabled: () => true,
      match: (candidate) =>
        candidate.producedResource === null && candidate.count === 0,
      describe: () => "New building",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingNew,
    }),
    weightingRule({
      id: "need-more-energy",
      enabled: (snapshot) =>
        snapshot.powerUnlocked &&
        snapshot.powerSurplus < snapshot.unpoweredPowerDemand,
      match: (candidate) =>
        isBuilding(candidate, "LakeCoolingTower") || candidate.powered < 0,
      describe: () => "Need more energy",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingNeedfulPowerPlant,
    }),
    weightingRule({
      id: "no-need-for-more-energy",
      enabled: (snapshot) =>
        snapshot.powerUnlocked &&
        snapshot.powerSurplus > snapshot.unpoweredPowerDemand,
      match: (candidate) =>
        !isBuilding(candidate, "Mill") &&
        (isBuilding(candidate, "LakeCoolingTower") || candidate.powered < 0),
      describe: () => "No need for more energy",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUselessPowerPlant,
    }),
    weightingRule({
      id: "not-enough-energy",
      enabled: (snapshot) => snapshot.powerUnlocked,
      match: (candidate, snapshot) =>
        !isBuilding(candidate, "LakeCoolingTower") &&
        candidate.powered > 0 &&
        (isBuilding(candidate, "NeutronCitadel")
          ? snapshot.nextCitadelPowerDraw
          : candidate.powered) > snapshot.powerSurplus,
      describe: () => "Not enough energy",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingUnderpowered,
    }),
    weightingRule({
      id: "no-need-for-more-knowledge",
      enabled: (snapshot) =>
        Math.max(
          snapshot.knowledgeRequiredByTechs,
          snapshot.knowledgeRequiredByBuildTargets,
        ) <= snapshot.knowledgeCapacity,
      // We want Wardenclyffe for morale; first beacon required for progress.
      // A Tau Disease Lab the Matrix cure still needs is wanted for the tech it
      // grants, not for its Knowledge, so this rule must not bury it.
      match: (candidate, snapshot) =>
        candidate.knowledge &&
        !isBuilding(candidate, "Wardenclyffe") &&
        !(
          snapshot.matrixCurePreparationIncomplete &&
          isBuilding(candidate, "TauDiseaseLab") &&
          candidate.count < MATRIX_CURE_LABS
        ) &&
        (!isBuilding(candidate, "StargateTelemetryBeacon") ||
          candidate.count > 0),
      describe: () => "No need for more knowledge",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUselessKnowledge,
    }),
    weightingRule({
      id: "need-more-knowledge",
      enabled: (snapshot) =>
        snapshot.cheapestTechKnowledge > snapshot.knowledgeCapacity ||
        snapshot.knowledgeRequiredByBuildTargets > snapshot.knowledgeCapacity,
      match: (candidate) => candidate.knowledge,
      describe: () => "Need more knowledge",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingNeedfulKnowledge,
    }),
    weightingRule({
      id: "unused-ejectors",
      enabled: (snapshot) => snapshot.unusedEjectorCapacity > 100,
      match: (candidate) => isBuilding(candidate, "BlackholeMassEjector"),
      describe: () => "Still have some unused ejectors",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUnusedEjectors,
    }),
    weightingRule({
      id: "unused-storage",
      enabled: (snapshot) => snapshot.unusedStorageParts,
      match: (candidate) =>
        isBuilding(candidate, "StorageYard", "Warehouse", "EnceladusMunitions"),
      describe: () => "Still have some unused storage",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingCrateUseless,
    }),
    weightingRule({
      id: "need-more-fuel-production",
      enabled: (snapshot) =>
        snapshot.oilStorageBelowMissionCost && snapshot.noOilProduction,
      match: (candidate) =>
        isBuilding(candidate, "OilWell", "GasMoonOilExtractor"),
      describe: () => "Need more fuel",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMissingFuel,
    }),
    weightingRule({
      id: "need-more-fuel-storage",
      enabled: (snapshot) =>
        snapshot.heliumStorageBelowMissionCost ||
        snapshot.oilStorageBelowMissionCost,
      match: (candidate) =>
        isBuilding(candidate, "OilDepot", "SpacePropellantDepot", "GasStorage"),
      describe: () => "Need more fuel",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMissingFuel,
    }),
    weightingRule({
      id: "horseshoes-useless",
      enabled: (snapshot) =>
        snapshot.hoovedRace && snapshot.horseshoesSufficient,
      match: (candidate) => candidate.producedResource === "Horseshoe",
      describe: (_match, _candidate, snapshot) =>
        `No more ${snapshot.horseshoeTitle} needed`,
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingHorseshoeUseless,
    }),
    weightingRule({
      id: "meditation-space-unneeded",
      enabled: (snapshot) => snapshot.calmRace && snapshot.zenBelowCap,
      match: (candidate) => candidate.actionId.includes("meditation"),
      describe: () => "No more Meditation Space needed",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingZenUseless,
    }),
    weightingRule({
      id: "gate-demons-supressed",
      enabled: (snapshot) => snapshot.gateDemonsSupressed,
      match: (candidate) => isBuilding(candidate, "GateTurret"),
      describe: () => "Gate demons fully supressed",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingGateTurret,
    }),
    weightingRule({
      id: "need-more-storage",
      enabled: (snapshot) => snapshot.storagePartsAllAssigned,
      match: (candidate) =>
        isBuilding(
          candidate,
          "Shed",
          "RedGarage",
          "AlphaWarehouse",
          "ProximaCargoYard",
          "TitanStorehouse",
        ),
      describe: () => "Need more storage",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingNeedStorage,
    }),
    weightingRule({
      id: "no-more-houses-needed",
      enabled: (snapshot) => snapshot.housingUnderused,
      match: (candidate) =>
        candidate.housing &&
        !isBuilding(candidate, "Alien1Consulate", "Transmitter") &&
        candidate.producedResource === null,
      describe: () => "No more houses needed",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUselessHousing,
    }),
    weightingRule({
      id: "destroyed-after-impact",
      enabled: (snapshot) => snapshot.orbitalDecayImpactPending,
      match: (candidate) =>
        (candidate.tab === "city" || candidate.location === "spc_moon") &&
        candidate.producedResource === null,
      describe: () => "Will be destroyed after impact",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingTemporal,
    }),
    weightingRule({
      id: "randomized-weighting",
      // Only used for the gas giant name contest, no need to check at other game stages
      enabled: (snapshot) => snapshot.gasGiantNameContestActive,
      match: (candidate) => candidate.randomlyWeighted,
      describe: () => "Randomized weighting",
      multiplier: () => 1 + nextRandomUnit(), // Fluctuate weight to pick random item
    }),
    weightingRule({
      id: "solar-system-building",
      enabled: (snapshot) => snapshot.truepathRace && snapshot.tauCetiReached,
      match: (candidate) =>
        (candidate.tab === "city" ||
          candidate.tab === "space" ||
          candidate.tab === "starDock") &&
        candidate.producedResource === null,
      describe: () => "Solar System building",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingSolar,
    }),
    weightingRule({
      id: "vacuum-collapse-mana-producer",
      enabled: (snapshot) => snapshot.prestigeRoute === "vacuum",
      match: (candidate) =>
        isBuilding(candidate, "Pylon", "RedPylon", "TauPylon"),
      describe: () => "Vacuum Collapse Mana producer",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingVacuumCollapse,
    }),
  ];

  return {
    namedBuildings: NAMED_BUILDINGS,
    authorityCapBuildings,
    INFLATION_CHALLENGE_MONEY,
    RETIREMENT_PREP,
    inflationMoneyStorageBuildings,
    inflationMoneyIncomeBuildings,
    galaxyCombatShips,
    weightingRules,
  };
}
