import type {
  BuildingWeightingRule,
  BuildingWeightingSnapshot,
  SacrificeBlockedReason,
} from "../ports/building-weighting.ts";
import type { RandomSource } from "../ports/randomness.ts";

type LooseFunction = (...args: any[]) => any;
type LooseObject = Record<PropertyKey, any>;
type LooseConstructor = new (...args: any[]) => any;

const SACRIFICE_BLOCKED_NOTES: Readonly<
  Record<SacrificeBlockedReason, string>
> = {
  windless: "Parasites sacrificed only during windy weather",
  "no-default-workers": "No default workers to sacrifice",
  "bonus-capped": "Sacrifice bonus already high enough",
};

type BuildingWeightingDependencies = {
  getResources: () => LooseObject;
  getBuildings: () => LooseObject;
  getNumberStringFn: () => LooseFunction;
  getNiceNumberFn: () => LooseFunction;
  ResourceAction: LooseConstructor;
  randomSource: RandomSource;
};

export function createBuildingWeightingPolicy({
  getResources,
  getBuildings,
  getNumberStringFn,
  getNiceNumberFn,
  ResourceAction,
  randomSource,
}: BuildingWeightingDependencies) {
  const getNumberString: LooseFunction = (...args) =>
    getNumberStringFn()(...args);
  const getNiceNumber: LooseFunction = (...args) => getNiceNumberFn()(...args);

  const authorityCapBuildings = [
    getBuildings().Barracks,
    getBuildings().Temple,
    getBuildings().RedSpaceBarracks,
    getBuildings().ProximaCruiser,
    getBuildings().BeltSpaceStation,
    getBuildings().WastelandBrute,
    getBuildings().BadlandsMinions,
    getBuildings().WastelandThrone,
    getBuildings().AsphodelBunker,
  ];
  const INFLATION_CHALLENGE_MONEY = 25e10;
  const RETIREMENT_PREP = {
    fusionGenerators: 20,
    factories: 18,
    scienceLabs: 11,
    graphene: 200e6,
  };
  const inflationMoneyStorageBuildings = [
    getBuildings().Bank,
    getBuildings().Casino,
    getBuildings().HellSpaceCasino,
    getBuildings().TitanBank,
    getBuildings().TauCasino,
    getBuildings().AlphaExchange,
    getBuildings().RuinsVault,
    getBuildings().RuinsWarVault,
    getBuildings().WastelandHellCasino,
    getBuildings().ElysiumEternalBank,
  ];
  const inflationMoneyIncomeBuildings = [
    getBuildings().TouristCenter,
    getBuildings().Casino,
    getBuildings().HellSpaceCasino,
    getBuildings().TauCasino,
    getBuildings().AlphaLuxuryCondo,
    getBuildings().WastelandHellCasino,
  ];
  const galaxyCombatShips = [
    getBuildings().ScoutShip,
    getBuildings().CorvetteShip,
    getBuildings().FrigateShip,
    getBuildings().CruiserShip,
    getBuildings().Dreadnought,
  ];
  const authorityCapBuildingSet = new Set(authorityCapBuildings);
  const inflationMoneyStorageBuildingSet = new Set(
    inflationMoneyStorageBuildings,
  );
  const inflationMoneyIncomeBuildingSet = new Set(
    inflationMoneyIncomeBuildings,
  );
  const galaxyCombatShipSet = new Set(galaxyCombatShips);
  const weightingRules: readonly BuildingWeightingRule[] = [
    {
      // Set weighting to zero right away, and skip all checks if autoBuild is disabled
      id: "autobuild-off",
      enabled: (snapshot) => !snapshot.autoBuildEnabled,
      match: () => true,
      describe: () => "",
      multiplier: () => 0,
    },
    {
      // Should always be on top, processing locked building may lead to issues
      id: "locked",
      enabled: () => true,
      match: (building: any) => !building.isUnlocked(),
      describe: () => "Locked",
      multiplier: () => 0,
    },
    {
      id: "queued-target",
      enabled: () => true,
      match: (building: any, snapshot: BuildingWeightingSnapshot) =>
        snapshot.queuedTargets.has(building),
      describe: () => "Queued building, processing...",
      multiplier: () => 0,
    },
    {
      id: "trigger-target",
      enabled: () => true,
      match: (building: any, snapshot: BuildingWeightingSnapshot) =>
        snapshot.triggerTargets.has(building),
      describe: () => "Active trigger, processing...",
      multiplier: () => 0,
    },
    {
      id: "autobuild-disabled",
      enabled: () => true,
      match: (building: any) => !building.autoBuildEnabled,
      describe: () => "AutoBuild disabled",
      multiplier: () => 0,
    },
    {
      id: "maximum-amount-reached",
      enabled: () => true,
      match: (building: any) => building.count >= building.autoMax,
      describe: () => "Maximum amount reached",
      multiplier: () => 0,
    },
    {
      // Red buildings need to be filtered out, so they won't prevent affordable buildings with lower weight from building
      id: "unaffordable",
      enabled: () => true,
      match: (building: any) => !building.isAffordable(true),
      describe: () => "",
      multiplier: () => 0,
    },
    {
      id: "truepath-test-launch-sabotage",
      enabled: (snapshot) =>
        snapshot.truepathRace &&
        snapshot.testLaunchUnlocked &&
        !snapshot.worldUnified,
      match: (building: any, snapshot) => {
        if (building === getBuildings().SpaceTestLaunch) {
          return snapshot.testLaunchSuccessChance;
        }
      },
      describe: (chance: any) =>
        `${Math.round(chance * 100)}% chance of successful launch`,
      multiplier: (_snapshot, chance: any) => (chance < 0.5 ? chance : 0),
    },
    {
      id: "eris-digsite-unsecured",
      enabled: (snapshot) =>
        snapshot.truepathRace && snapshot.erisDigsiteUnsecured,
      match: (building: any) =>
        building === getBuildings().ErisDrone ||
        building === getBuildings().ErisTank ||
        building === getBuildings().ErisTrooper,
      describe: () => "Eris Digsite is not yet secured",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingTruepathDigsite,
    },
    {
      id: "andromeda-miners-disabled",
      enabled: (snapshot) =>
        snapshot.minerJobsDisabled && snapshot.andromedaReached,
      match: (building: any, snapshot) =>
        building === getBuildings().CoalMine ||
        (building === getBuildings().Mine &&
          !snapshot.mineIsOnlyChrysotileSource),
      describe: () => "Miners disabled in Andromeda",
      multiplier: () => 0,
    },
    {
      id: "piracy-fully-supressed",
      enabled: (snapshot) => snapshot.stargatePiracySupressed,
      match: (building: any) =>
        building === getBuildings().StargateDefensePlatform,
      describe: () => "Piracy fully supressed",
      multiplier: () => 0,
    },
    {
      id: "piracy-covered-by-fleet",
      enabled: (snapshot) =>
        snapshot.autoFleetEnabled &&
        snapshot.galaxyPiracyCoveredByFleet &&
        !snapshot.galaxyAssaultPending,
      match: (building: any) => galaxyCombatShipSet.has(building),
      describe: () => "Piracy fully covered by fleet",
      multiplier: () => 0,
    },
    {
      id: "mech-supply-saving",
      enabled: (snapshot) => snapshot.mechSupplySaving !== null,
      match: (building: any, snapshot) =>
        building.cost["Supply"] ? snapshot.mechSupplySaving : undefined,
      describe: (reason: any) =>
        reason === "building"
          ? "Building mechs..."
          : "Saving supplies for new mech",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-ascension-towers",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "ascension" &&
        !snapshot.witchHunterRace,
      match: (building: any) =>
        building === getBuildings().GateEastTower ||
        building === getBuildings().GateWestTower,
      describe: () => "Not needed for Ascension prestige",
      multiplier: () => 0,
    },
    {
      id: "gate-supression-too-low",
      enabled: (snapshot) => snapshot.gateTowerSupressionTooLow,
      match: (building: any) =>
        building === getBuildings().GateEastTower ||
        building === getBuildings().GateWestTower,
      describe: () => "Too low gate supression",
      multiplier: () => 0,
    },
    {
      id: "saving-soul-gems-for-prestige",
      enabled: (snapshot) =>
        snapshot.prestigeRoute === "whitehole" &&
        snapshot.saveSoulGemsForPrestige,
      match: (building: any, snapshot) => {
        if (building.cost["Soul_Gem"] > snapshot.soulGemQuantity - 10) {
          return true;
        }
      },
      describe: () => "Saving up Soul Gems for prestige",
      multiplier: () => 0,
    },
    {
      id: "best-freighter",
      enabled: (snapshot) => snapshot.freighterChoiceOpen,
      match: (building: any) => {
        if (
          building === getBuildings().GorddonFreighter ||
          building === getBuildings().Alien1SuperFreighter
        ) {
          let regCount = getBuildings().GorddonFreighter.count;
          let regTotal =
            (1 + (regCount + 1) * 0.03) / (1 + regCount * 0.03) - 1;
          let regCrew = regTotal / 3;
          let supCount = getBuildings().Alien1SuperFreighter.count;
          let supTotal =
            (1 + (supCount + 1) * 0.08) / (1 + supCount * 0.08) - 1;
          let supCrew = supTotal / 5;
          if (
            building === getBuildings().GorddonFreighter &&
            regCrew < supCrew
          ) {
            return getBuildings().Alien1SuperFreighter;
          }
          if (
            building === getBuildings().Alien1SuperFreighter &&
            supCrew < regCrew
          ) {
            return getBuildings().GorddonFreighter;
          }
        }
      },
      describe: (other: any) => `${other.title} gives more Money`,
      multiplier: (snapshot) => (snapshot.buildBestFreighterOnly ? 0 : 1),
    },
    {
      id: "lake-transport-vs-bireme",
      // Build any if there's spare support
      enabled: (snapshot) =>
        snapshot.lakeShipChoiceOpen && snapshot.lakeSupportSpare <= 1,
      match: (building: any, snapshot) => {
        if (
          building === getBuildings().LakeBireme ||
          building === getBuildings().LakeTransport
        ) {
          let biremeCount = getBuildings().LakeBireme.count;
          let transportCount = getBuildings().LakeTransport.count;
          let rating = snapshot.lakeBiremeSupplyRate;
          let nextBireme =
            (1 - rating ** (biremeCount + 1)) * (transportCount * 5);
          let nextTransport =
            (1 - rating ** biremeCount) * ((transportCount + 1) * 5);
          if (snapshot.compareTransportsBySoulGems) {
            let currentSupply =
              (1 - rating ** biremeCount) * (transportCount * 5);
            nextBireme =
              (nextBireme - currentSupply) /
              getBuildings().LakeBireme.cost["Soul_Gem"];
            nextTransport =
              (nextTransport - currentSupply) /
              getBuildings().LakeTransport.cost["Soul_Gem"];
          }
          if (
            building === getBuildings().LakeBireme &&
            nextBireme < nextTransport
          ) {
            return getBuildings().LakeTransport;
          }
          if (
            building === getBuildings().LakeTransport &&
            nextTransport < nextBireme
          ) {
            return getBuildings().LakeBireme;
          }
        }
      },
      describe: (other: any) => `${other.title} gives more Supplies`,
      multiplier: () => 0,
    },
    {
      id: "spire-port-vs-base-camp",
      enabled: (snapshot) => snapshot.spireSupplyChoiceOpen,
      match: (building: any) => {
        if (
          building === getBuildings().SpirePort ||
          building === getBuildings().SpireBaseCamp
        ) {
          let portCount = getBuildings().SpirePort.count;
          let baseCount = getBuildings().SpireBaseCamp.count;
          let nextPort = (portCount + 1) * (1 + baseCount * 0.4);
          let nextBase = portCount * (1 + (baseCount + 1) * 0.4);
          if (building === getBuildings().SpirePort && nextPort < nextBase) {
            return getBuildings().SpireBaseCamp;
          }
          if (
            building === getBuildings().SpireBaseCamp &&
            nextBase < nextPort
          ) {
            return getBuildings().SpirePort;
          }
        }
      },
      describe: (other: any) => `${other.title} gives more Max Supplies`,
      multiplier: () => 0,
    },
    {
      // We can't limit waygate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
      id: "spire-waygate-done",
      enabled: (snapshot) => snapshot.spireWaygateComplete,
      match: (building: any) => building === getBuildings().SpireWaygate,
      describe: () => "",
      multiplier: () => 0,
    },
    {
      // We can't limit edenic gate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
      id: "spire-edenic-gate-done",
      enabled: (snapshot) => snapshot.spireEdenicGateComplete,
      match: (building: any) => building === getBuildings().SpireEdenicGate,
      describe: () => "",
      multiplier: () => 0,
    },
    {
      // Build up to 100, and then fire after researching cannon
      id: "elysium-fire-support-base-blocked",
      enabled: (snapshot) => snapshot.elysiumFireSupportUnlocked,
      match: (building: any, snapshot) => {
        if (building === getBuildings().ElysiumFireSupportBase) {
          if (snapshot.elysiumGarrisonDestroyed) {
            return "Garrison is destroyed";
          }
          if (!snapshot.eleriumCannonResearched && building.count >= 100) {
            return "Missing Elerium Cannon tech";
          }
        }
      },
      describe: (note: any) => note,
      multiplier: () => 0,
    },
    {
      id: "warehouse-cap",
      enabled: (snapshot) => snapshot.asphodelStabilizerUnlocked,
      match: (building: any) =>
        building === getBuildings().AsphodelStabilizer &&
        building.count >= getBuildings().AsphodelWarehouse.count,
      describe: () => "Can not exceed amount of Warehouses",
      multiplier: () => 0,
    },
    {
      // Sphinx not usable after solving / Harmachis not usable during Warlord
      id: "spire-sphinx-done",
      enabled: (snapshot) => snapshot.spireSphinxSolved || snapshot.warlordRace,
      match: (building: any) => building === getBuildings().SpireSphinx,
      describe: () => "",
      multiplier: () => 0,
    },
    {
      id: "assembling-not-possible",
      enabled: (snapshot) =>
        snapshot.artificialRace && snapshot.assemblyCureComplete,
      match: (building: any) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Population &&
        building !== getBuildings().TauCloning,
      describe: () => "Assembling is not possible",
      multiplier: () => 0,
    },
    {
      id: "no-empty-housings",
      enabled: (snapshot) => snapshot.artificialRace,
      match: (building: any, snapshot) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Population &&
        snapshot.populationAtCap,
      describe: () => "No empty housings",
      multiplier: () => 0,
    },
    {
      id: "embassy-knowledge-required",
      enabled: (snapshot) =>
        snapshot.embassyMissing &&
        snapshot.knowledgeCapacity < snapshot.embassyKnowledgeTarget,
      match: (building: any) => building === getBuildings().GorddonEmbassy,
      describe: (_match, _building, snapshot) =>
        `${getNumberString(snapshot.embassyKnowledgeTarget)} Max Knowledge required`,
      multiplier: () => 0,
    },
    {
      id: "wrong-shrine",
      enabled: (snapshot) => snapshot.shrineBonusUnwanted,
      match: (building: any) => building.id?.includes("shrine"),
      describe: () => "Wrong shrine",
      multiplier: () => 0,
    },
    {
      id: "slave-market-blocked",
      enabled: (snapshot) => snapshot.slaverRace,
      match: (building: any, snapshot) => {
        if (building === getBuildings().SlaveMarket) {
          if (snapshot.slavePensFull) {
            return "Slave pens already full";
          }
          if (snapshot.slaveIncomeInsufficient) {
            return "Buying slaves only with excess money";
          }
        }
      },
      describe: (note: any) => note,
      multiplier: () => 0,
    },
    {
      id: "sacrificial-altar-blocked",
      enabled: (snapshot) => snapshot.cannibalizeRace,
      match: (building: any, snapshot) => {
        if (building._id === "s_alter" && building.count > 0) {
          if (snapshot.populationEmpty) {
            return "Too low population";
          }
          if (!snapshot.populationAtCap) {
            return "Sacrifices performed only with full population";
          }
          if (snapshot.sacrificeBlocked) {
            return SACRIFICE_BLOCKED_NOTES[snapshot.sacrificeBlocked];
          }
        }
      },
      describe: (note: any) => note,
      multiplier: () => 0,
    },
    {
      id: "missing-consumption",
      enabled: () => true,
      match: (building: any) => building.getMissingConsumption(),
      describe: (resource: any) => `Missing ${resource.name} to operate`,
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMissingSupply,
    },
    {
      id: "missing-support",
      enabled: () => true,
      match: (building: any) => building.getMissingSupport(),
      describe: (support: any) => `Missing ${support.name} to operate`,
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingMissingSupport,
    },
    {
      id: "useless-support",
      enabled: () => true,
      match: (building: any) => building.getUselessSupport(),
      describe: (support: any) =>
        `Provided ${support.name} not currently needed`,
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUselessSupport,
    },
    {
      id: "tau-belt-ship-efficiency",
      enabled: (snapshot) =>
        snapshot.truepathRace &&
        snapshot.tauBeltSupportAvailable <= snapshot.tauBeltSupportUsed,
      match: (building: any, snapshot) => {
        if (
          building === getBuildings().TauBeltWhalingShip ||
          building === getBuildings().TauBeltMiningShip
        ) {
          let s_max = snapshot.tauBeltSupportAvailable;
          let s_cur = snapshot.tauBeltSupportUsed;
          let currentEff = 1 - (1 - s_max / s_cur) ** 1.4;
          let nextEff = 1 - (1 - s_max / (s_cur + 1)) ** 1.4;
          return nextEff * (s_cur + 1) - currentEff * s_cur;
        }
      },
      describe: (eff: any) =>
        `Low security, new ship will be ${getNiceNumber(eff * 100)}% efficient`,
      multiplier: (_snapshot, eff: any) => eff ?? -1,
    },
    {
      id: "womling-overlord-guard",
      // Narrowing this to `tau_red` level 4 was tried and did not work.
      enabled: (snapshot) => snapshot.truepathRace,
      match: (building: any, snapshot) => {
        if (
          building === getBuildings().TauRedContact ||
          building === getBuildings().TauRedIntroduce ||
          building === getBuildings().TauRedSubjugate
        ) {
          let missing = null;
          for (let [id, earned] of [
            ["TauRedContact", snapshot.womlingFriendEarned],
            ["TauRedIntroduce", snapshot.womlingGodEarned],
            ["TauRedSubjugate", snapshot.womlingLordEarned],
          ] as const) {
            if (!earned) {
              if (building === getBuildings()[id]) {
                return false; // Unearned stat, go for it
              }
              if (getBuildings()[id].isAutoBuildable()) {
                missing = id;
              }
            }
          }
          return missing;
        }
      },
      describe: (id: any) =>
        `Overlord achievement is missing ${getBuildings()[id].name}`,
      multiplier: (snapshot) => snapshot.weights.buildingWeightingOverlord,
    },
    {
      // Evil universe: Authority amount is capped by Authority max. When max is below target no
      // amount of tax/soldier management can fix the production penalty, so prioritize the
      // buildings that raise the cap. (Locked/irrelevant ones are already filtered to 0 above.)
      id: "authority-cap",
      enabled: (snapshot) => snapshot.authorityCapBelowTarget,
      match: (building: any) => authorityCapBuildingSet.has(building),
      describe: () => "Raises Authority cap, currently below target",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingAuthority,
    },
    {
      id: "banana-republic-objective",
      enabled: (snapshot) =>
        snapshot.bananaRepublicGuardActive && snapshot.bananaRace,
      match: (building: any, snapshot) =>
        building === getBuildings().DwarfWorldCollider &&
        !snapshot.bananaColliderObjectiveComplete,
      describe: () => "Banana Republic objective",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingBananaObjective,
    },
    {
      id: "inflation-money",
      enabled: (snapshot) => snapshot.inflationAssistActive,
      match: (building: any, snapshot) => {
        if (
          !snapshot.inflationMoneyReachable &&
          inflationMoneyStorageBuildingSet.has(building)
        ) {
          return "storage";
        }
        if (
          snapshot.inflationMoneyReachable &&
          inflationMoneyIncomeBuildingSet.has(building)
        ) {
          return "income";
        }
        return false;
      },
      describe: (kind: any) =>
        kind === "storage"
          ? "Inflation challenge needs Money storage"
          : "Inflation challenge needs Money income",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingInflationMoney,
    },
    {
      id: "retirement-preparation",
      enabled: (snapshot) => snapshot.retirementPreparationIncomplete,
      match: (building: any) => {
        if (
          building === getBuildings().TauFusionGenerator &&
          building.count < RETIREMENT_PREP.fusionGenerators
        ) {
          return RETIREMENT_PREP.fusionGenerators;
        }
        if (
          building === getBuildings().TauFactory &&
          building.count < RETIREMENT_PREP.factories
        ) {
          return RETIREMENT_PREP.factories;
        }
        if (
          building === getBuildings().TauDiseaseLab &&
          building.count < RETIREMENT_PREP.scienceLabs
        ) {
          return RETIREMENT_PREP.scienceLabs;
        }
        return false;
      },
      describe: (target: any, building: any) =>
        `Retirement preparation: build ${target} ${building.name}`,
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingRetirementPrep,
    },
    {
      // Red Spaceport unlocks unification research. Let an active unification
      // achievement build this prerequisite so Red Dead can release afterward.
      id: "achievement-guard",
      // Each guard answer already folds in the master AutoAchievement toggle.
      enabled: (snapshot) =>
        snapshot.guardDreadedActive ||
        snapshot.guardEnergeticActive ||
        snapshot.guardRedDeadActive,
      match: (building: any, snapshot) =>
        building === getBuildings().Dreadnought && snapshot.guardDreadedActive
          ? "Dreaded"
          : building === getBuildings().SiriusThermalCollector &&
              snapshot.guardEnergeticActive
            ? "Energetic"
            : building === getBuildings().RedSpaceport &&
                snapshot.guardRedDeadActive &&
                !snapshot.guardPacifistActive &&
                snapshot.foreignAchievementGoal === null
              ? "Red Dead"
              : false,
      describe: (name: any) => `${name} achievement guard`,
      multiplier: () => 0,
    },
    {
      id: "non-operating-city-buildings",
      enabled: () => true,
      match: (building: any) =>
        building._tab === "city" &&
        building !== getBuildings().Mill &&
        building !== getBuildings().Banquet &&
        building.stateOffCount > 0,
      describe: () => "Still have some non operating buildings",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingNonOperatingCity,
    },
    {
      id: "non-operating-buildings",
      enabled: () => true,
      match: (building: any, snapshot) => {
        if (building === getBuildings().BlackholeStellarEngine) {
          // `stateOffCount` is missleading for powered multisegmented getBuildings(). This rule shouldn't ever apply to Stellar Engine, just ignore it
          // TODO: Might be better to ignore all multisegmented buildings, or making `stateOffCount` return 0 for multisegmented buildings, but i'm not sure about possible side effects at the moment - that would work as a hot fix
          return false;
        }
        if (
          (building === getBuildings().BadlandsAttractor ||
            building === getBuildings().SpireMechBay) &&
          building.isSmartManaged()
        ) {
          // Those things might be temporaly disabled by smart logic
          return false;
        }
        if (
          building === getBuildings().RuinsGuardPost &&
          building.isSmartManaged() &&
          !snapshot.hellSupressUseful &&
          snapshot.hellGuardPostPrebuildIncomplete
        ) {
          // Prebuild guard posts. Even if we don't need supression right now they will be useful soon enough
          return false;
        }
        if (
          (building === getBuildings().SpirePort &&
            snapshot.spirePortPrebuildIncomplete) ||
          (building === getBuildings().SpireBaseCamp &&
            snapshot.spireBaseCampPrebuildIncomplete)
        ) {
          // Prebuild ports and base camps to their optimal ratios, they will be enabled when needed.
          return false;
        }
        if (building._tab !== "city" && building.stateOffCount > 0) {
          // This thing not from city, switchable, and some of them disabled. We dont't need more at the moment.
          return true;
        }
      },
      describe: () => "Still have some non operating buildings",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingNonOperating,
    },
    {
      id: "geck-limit",
      enabled: (snapshot) =>
        snapshot.prestigeRoute !== "bioseed" || !snapshot.geckNeeded,
      match: (building: any) => building === getBuildings().GasSpaceDockGECK,
      describe: () => "Max allowed amount of G.E.C.K reached",
      multiplier: () => 0,
    },
    {
      id: "prestige-blocked-eden",
      enabled: (snapshot) =>
        snapshot.loneSurvivorRace && !snapshot.prestigeEdenAllowed,
      match: (building: any) => building === getBuildings().TauStarEden,
      describe: () => "Prestiging not currently allowed",
      multiplier: () => 0,
    },
    {
      id: "prestige-blocked-ignition",
      enabled: (snapshot) =>
        snapshot.truepathRace &&
        (!snapshot.prestigeRetireAllowed || snapshot.matrioshkaBrainIncomplete),
      match: (building: any) =>
        building === getBuildings().TauGas2IgniteGasGiant,
      describe: () => "Prestiging not currently allowed",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute !== "bioseed",
      match: (building: any) =>
        building === getBuildings().GasSpaceDock ||
        building === getBuildings().GasSpaceDockShipSegment ||
        building === getBuildings().GasSpaceDockProbe,
      describe: () => "Not needed for current prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-bioseed",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "bioseed",
      match: (building: any) =>
        building === getBuildings().DwarfWorldCollider ||
        building === getBuildings().TitanMission,
      describe: () => "Not needed for Bioseed prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-whitehole",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "whitehole",
      match: (building: any) => building === getBuildings().BlackholeJumpShip,
      describe: () => "Not needed for Whitehole prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-vacuum",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "vacuum",
      match: (building: any) =>
        building === getBuildings().BlackholeStellarEngine,
      describe: () => "Not needed for Vacuum Collapse prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-ascension-missions",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "ascension" &&
        snapshot.pillarFinished &&
        !snapshot.witchHunterRace,
      match: (building: any) =>
        building === getBuildings().PitMission ||
        building === getBuildings().RuinsMission,
      describe: () => "Not needed for Ascension prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-witch-hunter",
      enabled: (snapshot) =>
        snapshot.witchHunterRace && snapshot.prestigeRoute === "ascension",
      match: (building: any) => building === getBuildings().SpireWaygate,
      describe: () => "Not needed for Witch Hunter's Ascension prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-terraform",
      enabled: (snapshot) =>
        snapshot.limitPrestigeConstruction &&
        snapshot.prestigeRoute === "terraform",
      match: (building: any) =>
        building === getBuildings().PitMission ||
        building === getBuildings().RuinsMission,
      describe: () => "Not needed for Terraform prestige",
      multiplier: () => 0,
    },
    {
      id: "awaiting-mad-prestige",
      enabled: (snapshot) => snapshot.madPrestigeAwaited,
      match: (building: any) =>
        !building.is.housing &&
        !building.is.garrison &&
        !building.cost["Knowledge"] &&
        building !== getBuildings().OilWell,
      describe: () => "Awaiting MAD prestige",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMADUseless,
    },
    {
      id: "new-building",
      enabled: () => true,
      match: (building: any) =>
        !(building instanceof ResourceAction) && building.count === 0,
      describe: () => "New building",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingNew,
    },
    {
      id: "need-more-energy",
      enabled: (snapshot) =>
        snapshot.powerUnlocked &&
        snapshot.powerSurplus < snapshot.unpoweredPowerDemand,
      match: (building: any) =>
        building === getBuildings().LakeCoolingTower || building.powered < 0,
      describe: () => "Need more energy",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingNeedfulPowerPlant,
    },
    {
      id: "no-need-for-more-energy",
      enabled: (snapshot) =>
        snapshot.powerUnlocked &&
        snapshot.powerSurplus > snapshot.unpoweredPowerDemand,
      match: (building: any) =>
        building !== getBuildings().Mill &&
        (building === getBuildings().LakeCoolingTower || building.powered < 0),
      describe: () => "No need for more energy",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUselessPowerPlant,
    },
    {
      id: "not-enough-energy",
      enabled: (snapshot) => snapshot.powerUnlocked,
      match: (building: any, snapshot) =>
        building !== getBuildings().LakeCoolingTower &&
        building.powered > 0 &&
        (building === getBuildings().NeutronCitadel
          ? snapshot.nextCitadelPowerDraw
          : building.powered) > snapshot.powerSurplus,
      describe: () => "Not enough energy",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingUnderpowered,
    },
    {
      id: "no-need-for-more-knowledge",
      enabled: (snapshot: BuildingWeightingSnapshot) =>
        Math.max(
          snapshot.knowledgeRequiredByTechs,
          snapshot.knowledgeRequiredByBuildTargets,
        ) <= snapshot.knowledgeCapacity,
      match: (building: any) =>
        building.is.knowledge &&
        building !== getBuildings().Wardenclyffe &&
        (building !== getBuildings().StargateTelemetryBeacon ||
          building.count > 0), // We want Wardenclyffe for morale; first beacon required for progress
      describe: () => "No need for more knowledge",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUselessKnowledge,
    },
    {
      id: "need-more-knowledge",
      enabled: (snapshot: BuildingWeightingSnapshot) =>
        snapshot.cheapestTechKnowledge > snapshot.knowledgeCapacity ||
        snapshot.knowledgeRequiredByBuildTargets > snapshot.knowledgeCapacity,
      match: (building: any) => building.is.knowledge,
      describe: () => "Need more knowledge",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingNeedfulKnowledge,
    },
    {
      id: "unused-ejectors",
      enabled: (snapshot) => snapshot.unusedEjectorCapacity > 100,
      match: (building: any) =>
        building === getBuildings().BlackholeMassEjector,
      describe: () => "Still have some unused ejectors",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUnusedEjectors,
    },
    {
      id: "unused-storage",
      enabled: (snapshot) => snapshot.unusedStorageParts,
      match: (building: any) =>
        building === getBuildings().StorageYard ||
        building === getBuildings().Warehouse ||
        building === getBuildings().EnceladusMunitions,
      describe: () => "Still have some unused storage",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingCrateUseless,
    },
    {
      id: "need-more-fuel-production",
      enabled: (snapshot) =>
        snapshot.oilStorageBelowMissionCost && snapshot.noOilProduction,
      match: (building: any) =>
        building === getBuildings().OilWell ||
        building === getBuildings().GasMoonOilExtractor,
      describe: () => "Need more fuel",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMissingFuel,
    },
    {
      id: "need-more-fuel-storage",
      enabled: (snapshot) =>
        snapshot.heliumStorageBelowMissionCost ||
        snapshot.oilStorageBelowMissionCost,
      match: (building: any) =>
        building === getBuildings().OilDepot ||
        building === getBuildings().SpacePropellantDepot ||
        building === getBuildings().GasStorage,
      describe: () => "Need more fuel",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingMissingFuel,
    },
    {
      id: "horseshoes-useless",
      enabled: (snapshot) =>
        snapshot.hoovedRace && snapshot.horseshoesSufficient,
      match: (building: any) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Horseshoe,
      describe: (_match, _building, snapshot) =>
        `No more ${snapshot.horseshoeTitle} needed`,
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingHorseshoeUseless,
    },
    {
      id: "meditation-space-unneeded",
      enabled: (snapshot) => snapshot.calmRace && snapshot.zenBelowCap,
      match: (building: any) => building.id.includes("meditation"),
      describe: () => "No more Meditation Space needed",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingZenUseless,
    },
    {
      id: "gate-demons-supressed",
      enabled: (snapshot) => snapshot.gateDemonsSupressed,
      match: (building: any) => building === getBuildings().GateTurret,
      describe: () => "Gate demons fully supressed",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingGateTurret,
    },
    {
      id: "need-more-storage",
      enabled: (snapshot) => snapshot.storagePartsAllAssigned,
      match: (building: any) =>
        building === getBuildings().Shed ||
        building === getBuildings().RedGarage ||
        building === getBuildings().AlphaWarehouse ||
        building === getBuildings().ProximaCargoYard ||
        building === getBuildings().TitanStorehouse,
      describe: () => "Need more storage",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingNeedStorage,
    },
    {
      id: "no-more-houses-needed",
      enabled: (snapshot) => snapshot.housingUnderused,
      match: (building: any) =>
        building.is.housing &&
        building !== getBuildings().Alien1Consulate &&
        building !== getBuildings().Transmitter &&
        !(building instanceof ResourceAction),
      describe: () => "No more houses needed",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingUselessHousing,
    },
    {
      id: "destroyed-after-impact",
      enabled: (snapshot) => snapshot.orbitalDecayImpactPending,
      match: (building: any) =>
        (building._tab === "city" || building._location === "spc_moon") &&
        !(building instanceof ResourceAction),
      describe: () => "Will be destroyed after impact",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingTemporal,
    },
    {
      id: "randomized-weighting",
      // Only used for the gas giant name contest, no need to check at other game stages
      enabled: (snapshot) => snapshot.gasGiantNameContestActive,
      match: (building: any) => building.is.random,
      describe: () => "Randomized weighting",
      multiplier: () => 1 + randomSource.nextUnit(), // Fluctuate weight to pick random item
    },
    {
      id: "solar-system-building",
      enabled: (snapshot) => snapshot.truepathRace && snapshot.tauCetiReached,
      match: (building: any) =>
        (building._tab === "city" ||
          building._tab === "space" ||
          building._tab === "starDock") &&
        !(building instanceof ResourceAction),
      describe: () => "Solar System building",
      multiplier: (snapshot) => snapshot.weights.buildingWeightingSolar,
    },
    {
      id: "vacuum-collapse-mana-producer",
      enabled: (snapshot) => snapshot.prestigeRoute === "vacuum",
      match: (building: LooseObject) =>
        building === getBuildings().Pylon ||
        building === getBuildings().RedPylon ||
        building === getBuildings().TauPylon,
      describe: () => "Vacuum Collapse Mana producer",
      multiplier: (snapshot) =>
        snapshot.weights.buildingWeightingVacuumCollapse,
    },
  ];

  return {
    authorityCapBuildings,
    INFLATION_CHALLENGE_MONEY,
    RETIREMENT_PREP,
    inflationMoneyStorageBuildings,
    inflationMoneyIncomeBuildings,
    galaxyCombatShips,
    weightingRules,
  };
}
