import type {
  BuildingWeightingRule,
  BuildingWeightingSnapshot,
} from "../ports/building-weighting.ts";
import type { RandomSource } from "../ports/randomness.ts";

type LooseFunction = (...args: any[]) => any;
type LooseObject = Record<PropertyKey, any>;
type LooseConstructor = new (...args: any[]) => any;

type BuildingWeightingDependencies = {
  getGame: () => LooseObject;
  getSettings: () => LooseObject;
  getResources: () => LooseObject;
  getBuildings: () => LooseObject;
  getHaveTech: () => LooseFunction;
  getNumberStringFn: () => LooseFunction;
  getNiceNumberFn: () => LooseFunction;
  getBestSupplyRatioFn: () => LooseFunction;
  getCitadelConsumptionFn: () => LooseFunction;
  ResourceAction: LooseConstructor;
  randomSource: RandomSource;
};

export function createBuildingWeightingPolicy({
  getGame,
  getSettings,
  getResources,
  getBuildings,
  getHaveTech,
  getNumberStringFn,
  getNiceNumberFn,
  getBestSupplyRatioFn,
  getCitadelConsumptionFn,
  ResourceAction,
  randomSource,
}: BuildingWeightingDependencies) {
  const haveTech: LooseFunction = (...args) => getHaveTech()(...args);
  const getNumberString: LooseFunction = (...args) =>
    getNumberStringFn()(...args);
  const getNiceNumber: LooseFunction = (...args) => getNiceNumberFn()(...args);
  const getBestSupplyRatio: LooseFunction = (...args) =>
    getBestSupplyRatioFn()(...args);
  const getCitadelConsumption: LooseFunction = (...args) =>
    getCitadelConsumptionFn()(...args);

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
      enabled: () => !getSettings().autoBuild,
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
      enabled: () =>
        getGame().global.race["truepath"] &&
        getBuildings().SpaceTestLaunch.isUnlocked() &&
        !haveTech("world_control"),
      match: (building: any) => {
        if (building === getBuildings().SpaceTestLaunch) {
          let sabotage = 1;
          for (let i = 0; i < 3; i++) {
            let gov = getGame().global.civic.foreign[`gov${i}`];
            if (!gov.occ && !gov.anx && !gov.buy) {
              sabotage++;
            }
          }
          return 1 / (sabotage + 1);
        }
      },
      describe: (chance: any) =>
        `${Math.round(chance * 100)}% chance of successful launch`,
      multiplier: (chance: any) => (chance < 0.5 ? chance : 0),
    },
    {
      id: "eris-digsite-unsecured",
      enabled: () =>
        getGame().global.race["truepath"] &&
        getBuildings().ErisDigsite.isUnlocked() &&
        getBuildings().ErisDigsite.count < 100,
      match: (building: any) =>
        building === getBuildings().ErisDrone ||
        building === getBuildings().ErisTank ||
        building === getBuildings().ErisTrooper,
      describe: () => "Eris Digsite is not yet secured",
      multiplier: () => getSettings().buildingWeightingTruepathDigsite,
    },
    {
      id: "andromeda-miners-disabled",
      enabled: () =>
        getSettings().jobDisableMiners &&
        getBuildings().GatewayStarbase.count > 0,
      match: (building: any) =>
        building === getBuildings().CoalMine ||
        (building === getBuildings().Mine &&
          !(
            getGame().global.race["sappy"] &&
            getGame().global.race["smoldering"]
          )),
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
        getSettings().autoFleet &&
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
      enabled: () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "ascension" &&
        !getGame().global.race["witch_hunter"],
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
      enabled: () =>
        getSettings().prestigeType === "whitehole" &&
        getSettings().prestigeWhiteholeSaveGems,
      match: (building: any) => {
        if (
          building.cost["Soul_Gem"] >
          getResources().Soul_Gem.currentQuantity - 10
        ) {
          return true;
        }
      },
      describe: () => "Saving up Soul Gems for prestige",
      multiplier: () => 0,
    },
    {
      id: "best-freighter",
      enabled: () => {
        return (
          getBuildings().GorddonFreighter.isAutoBuildable() &&
          getBuildings().GorddonFreighter.isAffordable(true) &&
          getBuildings().Alien1SuperFreighter.isAutoBuildable() &&
          getBuildings().Alien1SuperFreighter.isAffordable(true)
        );
      },
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
      multiplier: () => (getSettings().buildingsBestFreighter ? 0 : 1),
    },
    {
      id: "lake-transport-vs-bireme",
      enabled: () => {
        return (
          getBuildings().LakeBireme.isAutoBuildable() &&
          getBuildings().LakeBireme.isAffordable(true) &&
          getBuildings().LakeTransport.isAutoBuildable() &&
          getBuildings().LakeTransport.isAffordable(true) &&
          getResources().Lake_Support.rateOfChange <= 1
        ); // Build any if there's spare support
      },
      match: (building: any) => {
        if (
          building === getBuildings().LakeBireme ||
          building === getBuildings().LakeTransport
        ) {
          let biremeCount = getBuildings().LakeBireme.count;
          let transportCount = getBuildings().LakeTransport.count;
          let rating =
            getGame().global.blood["spire"] && getGame().global.blood.spire >= 2
              ? 0.8
              : 0.85;
          let nextBireme =
            (1 - rating ** (biremeCount + 1)) * (transportCount * 5);
          let nextTransport =
            (1 - rating ** biremeCount) * ((transportCount + 1) * 5);
          if (getSettings().buildingsTransportGem) {
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
      enabled: () => {
        return (
          getBuildings().SpirePort.isAutoBuildable() &&
          getBuildings().SpirePort.isAffordable(true) &&
          getBuildings().SpireBaseCamp.isAutoBuildable() &&
          getBuildings().SpireBaseCamp.isAffordable(true)
        );
      },
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
      enabled: () => haveTech("waygate", 2),
      match: (building: any) => building === getBuildings().SpireWaygate,
      describe: () => "",
      multiplier: () => 0,
    },
    {
      // We can't limit edenic gate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
      id: "spire-edenic-gate-done",
      enabled: () => haveTech("edenic", 3),
      match: (building: any) => building === getBuildings().SpireEdenicGate,
      describe: () => "",
      multiplier: () => 0,
    },
    {
      // Build up to 100, and then fire after researching cannon
      id: "elysium-fire-support-base-blocked",
      enabled: () => haveTech("elysium", 8),
      match: (building: any) => {
        if (building === getBuildings().ElysiumFireSupportBase) {
          if (haveTech("isle", 2)) {
            return "Garrison is destroyed";
          }
          if (!haveTech("elysium", 10) && building.count >= 100) {
            return "Missing Elerium Cannon tech";
          }
        }
      },
      describe: (note: any) => note,
      multiplier: () => 0,
    },
    {
      id: "warehouse-cap",
      enabled: () => haveTech("asphodel", 8),
      match: (building: any) =>
        building === getBuildings().AsphodelStabilizer &&
        building.count >= getBuildings().AsphodelWarehouse.count,
      describe: () => "Can not exceed amount of Warehouses",
      multiplier: () => 0,
    },
    {
      // Sphinx not usable after solving / Harmachis not usable during Warlord
      id: "spire-sphinx-done",
      enabled: () =>
        haveTech("hell_spire", 8) || getGame().global.race["warlord"],
      match: (building: any) => building === getBuildings().SpireSphinx,
      describe: () => "",
      multiplier: () => 0,
    },
    {
      id: "assembling-not-possible",
      enabled: () =>
        getGame().global.race["artifical"] && haveTech("focus_cure", 7),
      match: (building: any) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Population &&
        building !== getBuildings().TauCloning,
      describe: () => "Assembling is not possible",
      multiplier: () => 0,
    },
    {
      id: "no-empty-housings",
      enabled: () => getGame().global.race["artifical"],
      match: (building: any) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Population &&
        getResources().Population.storageRatio === 1,
      describe: () => "No empty housings",
      multiplier: () => 0,
    },
    {
      id: "embassy-knowledge-required",
      enabled: () =>
        getBuildings().GorddonEmbassy.count === 0 &&
        getResources().Knowledge.maxQuantity <
          getSettings().fleetEmbassyKnowledge,
      match: (building: any) => building === getBuildings().GorddonEmbassy,
      describe: () =>
        `${getNumberString(
          getSettings().fleetEmbassyKnowledge,
        )} Max Knowledge required`,
      multiplier: () => 0,
    },
    {
      id: "wrong-shrine",
      enabled: () =>
        getGame().global.race["magnificent"] &&
        getSettings().buildingShrineType !== "any",
      match: (building: any) => {
        if (building.id && building.id.includes("shrine")) {
          let bonus = null;
          if (
            getGame().global.city.calendar.moon > 0 &&
            getGame().global.city.calendar.moon < 7
          ) {
            bonus = "morale";
          } else if (
            getGame().global.city.calendar.moon > 7 &&
            getGame().global.city.calendar.moon < 14
          ) {
            bonus = "metal";
          } else if (
            getGame().global.city.calendar.moon > 14 &&
            getGame().global.city.calendar.moon < 21
          ) {
            bonus = "know";
          } else if (getGame().global.city.calendar.moon > 21) {
            bonus = "tax";
          } else if (
            [0, 7, 14, 21].includes(getGame().global.city.calendar.moon)
          ) {
            bonus = "rotating";
          } else {
            return true;
          }
          if (getSettings().buildingShrineType === "equally") {
            let minShrine = Math.min(
              getGame().global.city.shrine.morale,
              getGame().global.city.shrine.metal,
              getGame().global.city.shrine.know,
              getGame().global.city.shrine.tax,
            );
            return getGame().global.city.shrine[bonus] !== minShrine;
          } else {
            return getSettings().buildingShrineType !== bonus;
          }
        }
      },
      describe: () => "Wrong shrine",
      multiplier: () => 0,
    },
    {
      id: "slave-market-blocked",
      enabled: () => getGame().global.race["slaver"],
      match: (building: any) => {
        if (building === getBuildings().SlaveMarket) {
          if (
            getResources().Slave.currentQuantity >=
            getResources().Slave.maxQuantity
          ) {
            return "Slave pens already full";
          }
          if (
            getResources().Money.currentQuantity +
              getResources().Money.rateOfChange <
              getResources().Money.maxQuantity &&
            getResources().Money.rateOfChange < getSettings().slaveIncome
          ) {
            return "Buying slaves only with excess money";
          }
        }
      },
      describe: (note: any) => note,
      multiplier: () => 0,
    },
    {
      id: "sacrificial-altar-blocked",
      enabled: () => getGame().global.race["cannibalize"],
      match: (building: any, snapshot) => {
        if (building._id === "s_alter" && building.count > 0) {
          if (getResources().Population.currentQuantity < 1) {
            return "Too low population";
          }
          if (
            getResources().Population.currentQuantity !==
            getResources().Population.maxQuantity
          ) {
            return "Sacrifices performed only with full population";
          }
          if (
            getGame().global.race["parasite"] &&
            getGame().global.city.calendar.wind === 0
          ) {
            return "Parasites sacrificed only during windy weather";
          }
          if (
            getGame().global.civic[getGame().global.civic.d_job].workers < 1
          ) {
            return "No default workers to sacrifice";
          }

          if (
            getGame().global.city.s_alter.rage >= 3600 &&
            getGame().global.city.s_alter.regen >= 3600 &&
            getGame().global.city.s_alter.mind >= 3600 &&
            getGame().global.city.s_alter.mine >= 3600 &&
            (!snapshot.lumberRace ||
              getGame().global.city.s_alter.harvest >= 3600)
          ) {
            return "Sacrifice bonus already high enough";
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
      multiplier: () => getSettings().buildingWeightingMissingSupply,
    },
    {
      id: "missing-support",
      enabled: () => true,
      match: (building: any) => building.getMissingSupport(),
      describe: (support: any) => `Missing ${support.name} to operate`,
      multiplier: () => getSettings().buildingWeightingMissingSupport,
    },
    {
      id: "useless-support",
      enabled: () => true,
      match: (building: any) => building.getUselessSupport(),
      describe: (support: any) =>
        `Provided ${support.name} not currently needed`,
      multiplier: () => getSettings().buildingWeightingUselessSupport,
    },
    {
      id: "tau-belt-ship-efficiency",
      enabled: () =>
        getGame().global.race["truepath"] &&
        getResources().Tau_Belt_Support.maxQuantity <=
          getResources().Tau_Belt_Support.currentQuantity,
      match: (building: any) => {
        if (
          building === getBuildings().TauBeltWhalingShip ||
          building === getBuildings().TauBeltMiningShip
        ) {
          let s_max = getResources().Tau_Belt_Support.maxQuantity;
          let s_cur = getResources().Tau_Belt_Support.currentQuantity;
          let currentEff = 1 - (1 - s_max / s_cur) ** 1.4;
          let nextEff = 1 - (1 - s_max / (s_cur + 1)) ** 1.4;
          return nextEff * (s_cur + 1) - currentEff * s_cur;
        }
      },
      describe: (eff: any) =>
        `Low security, new ship will be ${getNiceNumber(eff * 100)}% efficient`,
      multiplier: (eff: any) => eff ?? -1,
    },
    {
      id: "womling-overlord-guard",
      // "&& getGame().global.tech.tau_red === 4" doesn't want to work for some reason.
      enabled: () => getGame().global.race["truepath"],
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
      multiplier: () => getSettings().buildingWeightingOverlord,
    },
    {
      // Evil universe: Authority amount is capped by Authority max. When max is below target no
      // amount of tax/soldier management can fix the production penalty, so prioritize the
      // buildings that raise the cap. (Locked/irrelevant ones are already filtered to 0 above.)
      id: "authority-cap",
      enabled: () =>
        getSettings().authorityManage &&
        getSettings().generalMinimumAuthority > 0 &&
        getResources().Authority.isUnlocked() &&
        getResources().Authority.maxQuantity <
          getSettings().generalMinimumAuthority,
      match: (building: any) => authorityCapBuildingSet.has(building),
      describe: () => "Raises Authority cap, currently below target",
      multiplier: () => getSettings().buildingWeightingAuthority,
    },
    {
      id: "banana-republic-objective",
      enabled: () =>
        getSettings().achievementGuards &&
        getSettings().guardBananaRepublic &&
        getGame().global.race["banana"],
      match: (building: any, snapshot) =>
        building === getBuildings().DwarfWorldCollider &&
        !snapshot.bananaColliderObjectiveComplete,
      describe: () => "Banana Republic objective",
      multiplier: () => getSettings().buildingWeightingBananaObjective,
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
      multiplier: () => getSettings().buildingWeightingInflationMoney,
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
      multiplier: () => getSettings().buildingWeightingRetirementPrep,
    },
    {
      // Red Spaceport unlocks unification research. Let an active unification
      // achievement build this prerequisite so Red Dead can release afterward.
      id: "achievement-guard",
      enabled: () => getSettings().achievementGuards,
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
      multiplier: () => getSettings().buildingWeightingNonOperatingCity,
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
        let supplyIndex =
          building === getBuildings().SpirePort
            ? 1
            : building === getBuildings().SpireBaseCamp
              ? 2
              : -1;
        if (
          supplyIndex > 0 &&
          (getBuildings().SpireMechBay.isSmartManaged() ||
            getBuildings().SpirePurifier.isSmartManaged())
        ) {
          // Prebuild ports and base camps to their optimal ratios, they will be enabled when needed. Unless mech bay and purifiers both have their smarts disabled, which means it won't ever happen.
          if (
            building.count <
            getBestSupplyRatio(
              getResources().Spire_Support.maxQuantity,
              getBuildings().SpirePort.autoMax,
              getBuildings().SpireBaseCamp.autoMax,
            )[supplyIndex]
          ) {
            return false;
          }
        }
        if (building._tab !== "city" && building.stateOffCount > 0) {
          // This thing not from city, switchable, and some of them disabled. We dont't need more at the moment.
          return true;
        }
      },
      describe: () => "Still have some non operating buildings",
      multiplier: () => getSettings().buildingWeightingNonOperating,
    },
    {
      id: "geck-limit",
      enabled: (snapshot) =>
        getSettings().prestigeType !== "bioseed" || !snapshot.geckNeeded,
      match: (building: any) => building === getBuildings().GasSpaceDockGECK,
      describe: () => "Max allowed amount of G.E.C.K reached",
      multiplier: () => 0,
    },
    {
      id: "prestige-blocked-eden",
      enabled: (snapshot) =>
        getGame().global.race["lone_survivor"] && !snapshot.prestigeEdenAllowed,
      match: (building: any) => building === getBuildings().TauStarEden,
      describe: () => "Prestiging not currently allowed",
      multiplier: () => 0,
    },
    {
      id: "prestige-blocked-ignition",
      enabled: (snapshot) =>
        getGame().global.race["truepath"] &&
        (!snapshot.prestigeRetireAllowed ||
          getBuildings().TauGas2MatrioshkaBrain.count < 1000),
      match: (building: any) =>
        building === getBuildings().TauGas2IgniteGasGiant,
      describe: () => "Prestiging not currently allowed",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded",
      enabled: () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType !== "bioseed",
      match: (building: any) =>
        building === getBuildings().GasSpaceDock ||
        building === getBuildings().GasSpaceDockShipSegment ||
        building === getBuildings().GasSpaceDockProbe,
      describe: () => "Not needed for current prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-bioseed",
      enabled: () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "bioseed",
      match: (building: any) =>
        building === getBuildings().DwarfWorldCollider ||
        building === getBuildings().TitanMission,
      describe: () => "Not needed for Bioseed prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-whitehole",
      enabled: () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "whitehole",
      match: (building: any) => building === getBuildings().BlackholeJumpShip,
      describe: () => "Not needed for Whitehole prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-vacuum",
      enabled: () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "vacuum",
      match: (building: any) =>
        building === getBuildings().BlackholeStellarEngine,
      describe: () => "Not needed for Vacuum Collapse prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-ascension-missions",
      enabled: (snapshot) =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "ascension" &&
        snapshot.pillarFinished &&
        !getGame().global.race["witch_hunter"],
      match: (building: any) =>
        building === getBuildings().PitMission ||
        building === getBuildings().RuinsMission,
      describe: () => "Not needed for Ascension prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-witch-hunter",
      enabled: () =>
        getGame().global.race["witch_hunter"] &&
        getSettings().prestigeType === "ascension",
      match: (building: any) => building === getBuildings().SpireWaygate,
      describe: () => "Not needed for Witch Hunter's Ascension prestige",
      multiplier: () => 0,
    },
    {
      id: "prestige-unneeded-terraform",
      enabled: () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "terraform",
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
      multiplier: () => getSettings().buildingWeightingMADUseless,
    },
    {
      id: "new-building",
      enabled: () => true,
      match: (building: any) =>
        !(building instanceof ResourceAction) && building.count === 0,
      describe: () => "New building",
      multiplier: () => getSettings().buildingWeightingNew,
    },
    {
      id: "need-more-energy",
      enabled: () =>
        getResources().Power.isUnlocked() &&
        getResources().Power.currentQuantity < getResources().Power.maxQuantity,
      match: (building: any) =>
        building === getBuildings().LakeCoolingTower || building.powered < 0,
      describe: () => "Need more energy",
      multiplier: () => getSettings().buildingWeightingNeedfulPowerPlant,
    },
    {
      id: "no-need-for-more-energy",
      enabled: () =>
        getResources().Power.isUnlocked() &&
        getResources().Power.currentQuantity > getResources().Power.maxQuantity,
      match: (building: any) =>
        building !== getBuildings().Mill &&
        (building === getBuildings().LakeCoolingTower || building.powered < 0),
      describe: () => "No need for more energy",
      multiplier: () => getSettings().buildingWeightingUselessPowerPlant,
    },
    {
      id: "not-enough-energy",
      enabled: () => getResources().Power.isUnlocked(),
      match: (building: any) =>
        building !== getBuildings().LakeCoolingTower &&
        building.powered > 0 &&
        (building === getBuildings().NeutronCitadel
          ? getCitadelConsumption(building.count + 1) -
            getCitadelConsumption(building.count)
          : building.powered) > getResources().Power.currentQuantity,
      describe: () => "Not enough energy",
      multiplier: () => getSettings().buildingWeightingUnderpowered,
    },
    {
      id: "no-need-for-more-knowledge",
      enabled: (snapshot: BuildingWeightingSnapshot) =>
        Math.max(
          snapshot.knowledgeRequiredByTechs,
          snapshot.knowledgeRequiredByBuildTargets,
        ) <= getResources().Knowledge.maxQuantity,
      match: (building: any) =>
        building.is.knowledge &&
        building !== getBuildings().Wardenclyffe &&
        (building !== getBuildings().StargateTelemetryBeacon ||
          building.count > 0), // We want Wardenclyffe for morale; first beacon required for progress
      describe: () => "No need for more knowledge",
      multiplier: () => getSettings().buildingWeightingUselessKnowledge,
    },
    {
      id: "need-more-knowledge",
      enabled: (snapshot: BuildingWeightingSnapshot) =>
        snapshot.cheapestTechKnowledge > getResources().Knowledge.maxQuantity ||
        snapshot.knowledgeRequiredByBuildTargets >
          getResources().Knowledge.maxQuantity,
      match: (building: any) => building.is.knowledge,
      describe: () => "Need more knowledge",
      multiplier: () => getSettings().buildingWeightingNeedfulKnowledge,
    },
    {
      id: "unused-ejectors",
      enabled: () =>
        getBuildings().BlackholeMassEjector.count > 0 &&
        getBuildings().BlackholeMassEjector.count * 1000 -
          getGame().global.interstellar.mass_ejector.total >
          100,
      match: (building: any) =>
        building === getBuildings().BlackholeMassEjector,
      describe: () => "Still have some unused ejectors",
      multiplier: () => getSettings().buildingWeightingUnusedEjectors,
    },
    {
      id: "unused-storage",
      enabled: () =>
        getResources().Crates.storageRatio < 1 ||
        getResources().Containers.storageRatio < 1,
      match: (building: any) =>
        building === getBuildings().StorageYard ||
        building === getBuildings().Warehouse ||
        building === getBuildings().EnceladusMunitions,
      describe: () => "Still have some unused storage",
      multiplier: () => getSettings().buildingWeightingCrateUseless,
    },
    {
      id: "need-more-fuel-production",
      enabled: () =>
        getResources().Oil.maxQuantity <
          getResources().Oil.techMissionMaxCost &&
        getBuildings().OilWell.count <= 0 &&
        getBuildings().GasMoonOilExtractor.count <= 0,
      match: (building: any) =>
        building === getBuildings().OilWell ||
        building === getBuildings().GasMoonOilExtractor,
      describe: () => "Need more fuel",
      multiplier: () => getSettings().buildingWeightingMissingFuel,
    },
    {
      id: "need-more-fuel-storage",
      enabled: () =>
        (getResources().Helium_3.isUnlocked() &&
          getResources().Helium_3.maxQuantity <
            getResources().Helium_3.techMissionMaxCost) ||
        getResources().Oil.maxQuantity < getResources().Oil.techMissionMaxCost,
      match: (building: any) =>
        building === getBuildings().OilDepot ||
        building === getBuildings().SpacePropellantDepot ||
        building === getBuildings().GasStorage,
      describe: () => "Need more fuel",
      multiplier: () => getSettings().buildingWeightingMissingFuel,
    },
    {
      id: "horseshoes-useless",
      enabled: () =>
        getGame().global.race.hooved &&
        getResources().Horseshoe.spareQuantity >=
          getResources().Horseshoe.storageRequired,
      match: (building: any) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Horseshoe,
      describe: () => `No more ${getResources().Horseshoe.title} needed`,
      multiplier: () => getSettings().buildingWeightingHorseshoeUseless,
    },
    {
      id: "meditation-space-unneeded",
      enabled: () =>
        getGame().global.race.calm &&
        getResources().Zen.currentQuantity < getResources().Zen.maxQuantity,
      match: (building: any) => building.id.includes("meditation"),
      describe: () => "No more Meditation Space needed",
      multiplier: () => getSettings().buildingWeightingZenUseless,
    },
    {
      id: "gate-demons-supressed",
      enabled: (snapshot) => snapshot.gateDemonsSupressed,
      match: (building: any) => building === getBuildings().GateTurret,
      describe: () => "Gate demons fully supressed",
      multiplier: () => getSettings().buildingWeightingGateTurret,
    },
    {
      id: "need-more-storage",
      enabled: () =>
        (getResources().Containers.isUnlocked() ||
          getResources().Crates.isUnlocked()) &&
        getResources().Containers.storageRatio === 1 &&
        getResources().Crates.storageRatio === 1,
      match: (building: any) =>
        building === getBuildings().Shed ||
        building === getBuildings().RedGarage ||
        building === getBuildings().AlphaWarehouse ||
        building === getBuildings().ProximaCargoYard ||
        building === getBuildings().TitanStorehouse,
      describe: () => "Need more storage",
      multiplier: () => getSettings().buildingWeightingNeedStorage,
    },
    {
      id: "no-more-houses-needed",
      enabled: () =>
        getResources().Population.maxQuantity > 50 &&
        getResources().Population.storageRatio < 0.9,
      match: (building: any) =>
        building.is.housing &&
        building !== getBuildings().Alien1Consulate &&
        building !== getBuildings().Transmitter &&
        !(building instanceof ResourceAction),
      describe: () => "No more houses needed",
      multiplier: () => getSettings().buildingWeightingUselessHousing,
    },
    {
      id: "destroyed-after-impact",
      enabled: () =>
        getGame().global.race["orbit_decay"] &&
        !getGame().global.race["orbit_decayed"],
      match: (building: any) =>
        (building._tab === "city" || building._location === "spc_moon") &&
        !(building instanceof ResourceAction),
      describe: () => "Will be destroyed after impact",
      multiplier: () => getSettings().buildingWeightingTemporal,
    },
    {
      id: "randomized-weighting",
      enabled: () => getGame().global.tech.tau_gas === 1, // Only used for name contest, no need to check at other game stages
      match: (building: any) => building.is.random,
      describe: () => "Randomized weighting",
      multiplier: () => 1 + randomSource.nextUnit(), // Fluctuate weight to pick random item
    },
    {
      id: "solar-system-building",
      enabled: () =>
        getGame().global.race["truepath"] && haveTech("tauceti", 2),
      match: (building: any) =>
        (building._tab === "city" ||
          building._tab === "space" ||
          building._tab === "starDock") &&
        !(building instanceof ResourceAction),
      describe: () => "Solar System building",
      multiplier: () => getSettings().buildingWeightingSolar,
    },
    {
      id: "vacuum-collapse-mana-producer",
      enabled: () => getSettings().prestigeType === "vacuum",
      match: (building: LooseObject) =>
        building === getBuildings().Pylon ||
        building === getBuildings().RedPylon ||
        building === getBuildings().TauPylon,
      describe: () => "Vacuum Collapse Mana producer",
      multiplier: () => getSettings().buildingWeightingVacuumCollapse ?? 10,
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
