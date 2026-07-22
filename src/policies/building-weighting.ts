type LooseFunction = (...args: any[]) => any;
type LooseObject = Record<PropertyKey, any>;
type LooseConstructor = new (...args: any[]) => any;

type BuildingWeightingDependencies = {
  getGame: () => LooseObject;
  getSettings: () => LooseObject;
  getState: () => LooseObject;
  getResources: () => LooseObject;
  getBuildings: () => LooseObject;
  getPoly: () => LooseObject;
  getMechManager: () => LooseObject;
  getTechIds: () => LooseObject;
  getTraitVal: () => LooseFunction;
  getHaveTech: () => LooseFunction;
  getHaveTask: () => LooseFunction;
  getPiracyMultiplierFn: () => LooseFunction;
  getGalaxyAssaultPending: () => LooseFunction;
  getGalaxyRegionsFn: () => LooseFunction;
  getGalaxyCombatShipPowerFn: () => LooseFunction;
  getNumberStringFn: () => LooseFunction;
  getNiceNumberFn: () => LooseFunction;
  getIsLumberRace: () => LooseFunction;
  getBananaRepublicObjectiveComplete: () => LooseFunction;
  getInflationChallengeAssistActive: () => LooseFunction;
  getInflationChallengeMoneyReachable: () => LooseFunction;
  getRetirementChallengeAssistActive: () => LooseFunction;
  getRetirementPreparationMissing: () => LooseFunction;
  getGuardActive: () => LooseFunction;
  getIsHellSupressUseful: () => LooseFunction;
  getBestSupplyRatioFn: () => LooseFunction;
  getIsGECKNeeded: () => LooseFunction;
  getIsPrestigeAllowed: () => LooseFunction;
  getIsPillarFinished: () => LooseFunction;
  getCitadelConsumptionFn: () => LooseFunction;
  ResourceAction: LooseConstructor;
};

export function createBuildingWeightingPolicy({
  getGame,
  getSettings,
  getState,
  getResources,
  getBuildings,
  getPoly,
  getMechManager,
  getTechIds,
  getTraitVal,
  getHaveTech,
  getHaveTask,
  getPiracyMultiplierFn,
  getGalaxyAssaultPending,
  getGalaxyRegionsFn,
  getGalaxyCombatShipPowerFn,
  getNumberStringFn,
  getNiceNumberFn,
  getIsLumberRace,
  getBananaRepublicObjectiveComplete,
  getInflationChallengeAssistActive,
  getInflationChallengeMoneyReachable,
  getRetirementChallengeAssistActive,
  getRetirementPreparationMissing,
  getGuardActive,
  getIsHellSupressUseful,
  getBestSupplyRatioFn,
  getIsGECKNeeded,
  getIsPrestigeAllowed,
  getIsPillarFinished,
  getCitadelConsumptionFn,
  ResourceAction,
}: BuildingWeightingDependencies) {
  const traitVal: LooseFunction = (...args) => getTraitVal()(...args);
  const haveTech: LooseFunction = (...args) => getHaveTech()(...args);
  const haveTask: LooseFunction = (...args) => getHaveTask()(...args);
  const getPiracyMultiplier: LooseFunction = (...args) =>
    getPiracyMultiplierFn()(...args);
  const galaxyAssaultPending: LooseFunction = (...args) =>
    getGalaxyAssaultPending()(...args);
  const getGalaxyRegions: LooseFunction = (...args) =>
    getGalaxyRegionsFn()(...args);
  const getGalaxyCombatShipPower: LooseFunction = (...args) =>
    getGalaxyCombatShipPowerFn()(...args);
  const getNumberString: LooseFunction = (...args) =>
    getNumberStringFn()(...args);
  const getNiceNumber: LooseFunction = (...args) => getNiceNumberFn()(...args);
  const isLumberRace: LooseFunction = (...args) => getIsLumberRace()(...args);
  const bananaRepublicObjectiveComplete: LooseFunction = (...args) =>
    getBananaRepublicObjectiveComplete()(...args);
  const inflationChallengeAssistActive: LooseFunction = (...args) =>
    getInflationChallengeAssistActive()(...args);
  const inflationChallengeMoneyReachable: LooseFunction = (...args) =>
    getInflationChallengeMoneyReachable()(...args);
  const retirementChallengeAssistActive: LooseFunction = (...args) =>
    getRetirementChallengeAssistActive()(...args);
  const retirementPreparationMissing: LooseFunction = (...args) =>
    getRetirementPreparationMissing()(...args);
  const guardActive: LooseFunction = (...args) => getGuardActive()(...args);
  const isHellSupressUseful: LooseFunction = (...args) =>
    getIsHellSupressUseful()(...args);
  const getBestSupplyRatio: LooseFunction = (...args) =>
    getBestSupplyRatioFn()(...args);
  const isGECKNeeded: LooseFunction = (...args) => getIsGECKNeeded()(...args);
  const isPrestigeAllowed: LooseFunction = (...args) =>
    getIsPrestigeAllowed()(...args);
  const isPillarFinished: LooseFunction = (...args) =>
    getIsPillarFinished()(...args);
  const getCitadelConsumption: LooseFunction = (...args) =>
    getCitadelConsumptionFn()(...args);

  const wrGlobalCondition = 0; // Generic condition will be checked once per tick. Takes nothing and return bool - whether following rule is applicable, or not
  const wrIndividualCondition = 1; // Individual condition, checks every building, and return any value; if value casts to true - rule aplies
  const wrDescription = 2; // Description displayed in tooltip when rule applied, takes return value of individual condition, and building
  const wrMultiplier = 3; // Weighting mulptiplier. Called first without any context; rules returning x1 also won't be checked
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
  const weightingRules = [
    [
      () => !getSettings().autoBuild,
      () => true,
      () => "",
      () => 0, // Set weighting to zero right away, and skip all checks if autoBuild is disabled
    ],
    [
      () => true,
      (building: any) => !building.isUnlocked(),
      () => "Locked",
      () => 0, // Should always be on top, processing locked building may lead to issues
    ],
    [
      () => true,
      (building: any) => getState().queuedTargets.includes(building),
      () => "Queued building, processing...",
      () => 0,
    ],
    [
      () => true,
      (building: any) => getState().triggerTargets.includes(building),
      () => "Active trigger, processing...",
      () => 0,
    ],
    [
      () => true,
      (building: any) => !building.autoBuildEnabled,
      () => "AutoBuild disabled",
      () => 0,
    ],
    [
      () => true,
      (building: any) => building.count >= building.autoMax,
      () => "Maximum amount reached",
      () => 0,
    ],
    [
      () => true,
      (building: any) => !building.isAffordable(true),
      () => "",
      () => 0, // Red buildings need to be filtered out, so they won't prevent affordable buildings with lower weight from building
    ],
    [
      () =>
        getGame().global.race["truepath"] &&
        getBuildings().SpaceTestLaunch.isUnlocked() &&
        !haveTech("world_control"),
      (building: any) => {
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
      (chance: any) =>
        `${Math.round(chance * 100)}% chance of successful launch`,
      (chance: any) => (chance < 0.5 ? chance : 0),
    ],
    [
      () =>
        getGame().global.race["truepath"] &&
        getBuildings().ErisDigsite.isUnlocked() &&
        getBuildings().ErisDigsite.count < 100,
      (building: any) =>
        building === getBuildings().ErisDrone ||
        building === getBuildings().ErisTank ||
        building === getBuildings().ErisTrooper,
      () => "Eris Digsite is not yet secured",
      () => getSettings().buildingWeightingTruepathDigsite,
    ],
    [
      () =>
        getSettings().jobDisableMiners &&
        getBuildings().GatewayStarbase.count > 0,
      (building: any) =>
        building === getBuildings().CoalMine ||
        (building === getBuildings().Mine &&
          !(
            getGame().global.race["sappy"] &&
            getGame().global.race["smoldering"]
          )),
      () => "Miners disabled in Andromeda",
      () => 0,
    ],
    [
      () => haveTech("piracy"),
      (building: any) =>
        building === getBuildings().StargateDefensePlatform &&
        getBuildings().StargateDefensePlatform.count * 20 >=
          (getGame().global.race["instinct"] ? 0.09 : 0.1) *
            getGame().global.tech.piracy *
            getPiracyMultiplier(),
      () => "Piracy fully supressed",
      () => 0,
    ],
    [
      () =>
        getSettings().autoFleet &&
        getGame().global.tech["piracy"] &&
        !galaxyAssaultPending(),
      (building: any) => {
        if (galaxyCombatShips.includes(building)) {
          let totalNeed = getGalaxyRegions().reduce(
            (sum: any, region: any) =>
              sum +
              (region.useful ? Math.max(0, region.piracy - region.armada) : 0),
            0,
          );
          return getGalaxyCombatShipPower() >= totalNeed;
        }
      },
      () => "Piracy fully covered by fleet",
      () => 0,
    ],
    [
      () =>
        getSettings().autoMech &&
        getSettings().mechBuild !== "none" &&
        getSettings().buildingMechsFirst &&
        getBuildings().SpireMechBay.count > 0 &&
        getBuildings().SpireMechBay.stateOffCount === 0,
      (building: any) => {
        if (building.cost["Supply"]) {
          if (getMechManager().isActive) {
            return "Building mechs...";
          }
          let mechBay = getGame().global.portal.mechbay;
          let newSize = !haveTask("mech")
            ? getSettings().mechBuild === "random"
              ? getMechManager().getPreferredSize()[0]
              : mechBay.blueprint.size
            : "titan";
          let [newGems, newSupply, newSpace] = getMechManager().getMechCost({
            size: newSize,
          });
          if (
            newSpace <= mechBay.max - mechBay.bay &&
            newSupply <= getResources().Supply.maxQuantity &&
            newGems <= getResources().Soul_Gem.currentQuantity
          ) {
            return "Saving supplies for new mech";
          }
        }
      },
      (note: any) => note,
      () => 0,
    ],
    [
      () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "ascension" &&
        !getGame().global.race["witch_hunter"],
      (building: any) =>
        building === getBuildings().GateEastTower ||
        building === getBuildings().GateWestTower,
      () => "Not needed for Ascension prestige",
      () => 0,
    ],
    [
      () =>
        getBuildings().GateEastTower.isUnlocked() &&
        getBuildings().GateWestTower.isUnlocked() &&
        getPoly().hellSupression("gate").supress <
          getSettings().buildingTowerSuppression / 100,
      (building: any) =>
        building === getBuildings().GateEastTower ||
        building === getBuildings().GateWestTower,
      () => "Too low gate supression",
      () => 0,
    ],
    [
      () =>
        getSettings().prestigeType === "whitehole" &&
        getSettings().prestigeWhiteholeSaveGems,
      (building: any) => {
        if (
          building.cost["Soul_Gem"] >
          getResources().Soul_Gem.currentQuantity - 10
        ) {
          return true;
        }
      },
      () => "Saving up Soul Gems for prestige",
      () => 0,
    ],
    [
      () => {
        return (
          getBuildings().GorddonFreighter.isAutoBuildable() &&
          getBuildings().GorddonFreighter.isAffordable(true) &&
          getBuildings().Alien1SuperFreighter.isAutoBuildable() &&
          getBuildings().Alien1SuperFreighter.isAffordable(true)
        );
      },
      (building: any) => {
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
      (other: any) => `${other.title} gives more Money`,
      () => (getSettings().buildingsBestFreighter ? 0 : 1), // Find what's better - Freighter or Super Freighter
    ],
    [
      () => {
        return (
          getBuildings().LakeBireme.isAutoBuildable() &&
          getBuildings().LakeBireme.isAffordable(true) &&
          getBuildings().LakeTransport.isAutoBuildable() &&
          getBuildings().LakeTransport.isAffordable(true) &&
          getResources().Lake_Support.rateOfChange <= 1
        ); // Build any if there's spare support
      },
      (building: any) => {
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
      (other: any) => `${other.title} gives more Supplies`,
      () => 0, // Find what's better - Bireme or Transport
    ],
    [
      () => {
        return (
          getBuildings().SpirePort.isAutoBuildable() &&
          getBuildings().SpirePort.isAffordable(true) &&
          getBuildings().SpireBaseCamp.isAutoBuildable() &&
          getBuildings().SpireBaseCamp.isAffordable(true)
        );
      },
      (building: any) => {
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
      (other: any) => `${other.title} gives more Max Supplies`,
      () => 0, // Find what's better - Port or Base
    ],
    [
      () => haveTech("waygate", 2),
      (building: any) => building === getBuildings().SpireWaygate,
      () => "",
      () => 0, // We can't limit waygate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
    ],
    [
      () => haveTech("edenic", 3),
      (building: any) => building === getBuildings().SpireEdenicGate,
      () => "",
      () => 0, // We can't limit edenic gate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
    ],
    [
      () => haveTech("elysium", 8),
      (building: any) => {
        if (building === getBuildings().ElysiumFireSupportBase) {
          if (haveTech("isle", 2)) {
            return "Garrison is destroyed";
          }
          if (!haveTech("elysium", 10) && building.count >= 100) {
            return "Missing Elerium Cannon tech";
          }
        }
      },
      (note: any) => note,
      () => 0, // Build up to 100, and then fire after researching cannon
    ],
    [
      () => haveTech("asphodel", 8),
      (building: any) =>
        building === getBuildings().AsphodelStabilizer &&
        building.count >= getBuildings().AsphodelWarehouse.count,
      () => "Can not exceed amount of Warehouses",
      () => 0,
    ],
    [
      () => haveTech("hell_spire", 8) || getGame().global.race["warlord"],
      (building: any) => building === getBuildings().SpireSphinx,
      () => "",
      () => 0, // Sphinx not usable after solving / Harmachis not usable during Warlord
    ],
    [
      () => getGame().global.race["artifical"] && haveTech("focus_cure", 7),
      (building: any) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Population &&
        building !== getBuildings().TauCloning,
      () => "Assembling is not possible",
      () => 0,
    ],
    [
      () => getGame().global.race["artifical"],
      (building: any) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Population &&
        getResources().Population.storageRatio === 1,
      () => "No empty housings",
      () => 0,
    ],
    [
      () =>
        getBuildings().GorddonEmbassy.count === 0 &&
        getResources().Knowledge.maxQuantity <
          getSettings().fleetEmbassyKnowledge,
      (building: any) => building === getBuildings().GorddonEmbassy,
      () =>
        `${getNumberString(
          getSettings().fleetEmbassyKnowledge,
        )} Max Knowledge required`,
      () => 0,
    ],
    [
      () =>
        getGame().global.race["magnificent"] &&
        getSettings().buildingShrineType !== "any",
      (building: any) => {
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
      () => "Wrong shrine",
      () => 0,
    ],
    [
      () => getGame().global.race["slaver"],
      (building: any) => {
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
      (note: any) => note,
      () => 0, // Slave Market
    ],
    [
      () => getGame().global.race["cannibalize"],
      (building: any) => {
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
            (!isLumberRace() || getGame().global.city.s_alter.harvest >= 3600)
          ) {
            return "Sacrifice bonus already high enough";
          }
        }
      },
      (note: any) => note,
      () => 0, // Sacrificial Altar
    ],
    [
      () => true,
      (building: any) => building.getMissingConsumption(),
      (resource: any) => `Missing ${resource.name} to operate`,
      () => getSettings().buildingWeightingMissingSupply,
    ],
    [
      () => true,
      (building: any) => building.getMissingSupport(),
      (support: any) => `Missing ${support.name} to operate`,
      () => getSettings().buildingWeightingMissingSupport,
    ],
    [
      () => true,
      (building: any) => building.getUselessSupport(),
      (support: any) => `Provided ${support.name} not currently needed`,
      () => getSettings().buildingWeightingUselessSupport,
    ],
    [
      () =>
        getGame().global.race["truepath"] &&
        getResources().Tau_Belt_Support.maxQuantity <=
          getResources().Tau_Belt_Support.currentQuantity,
      (building: any) => {
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
      (eff: any) =>
        `Low security, new ship will be ${getNiceNumber(eff * 100)}% efficient`,
      (eff: any) => eff ?? -1,
    ],
    [
      () => getGame().global.race["truepath"], // "&& getGame().global.tech.tau_red === 4" doesn't want to work for some reason.
      (building: any) => {
        if (
          building === getBuildings().TauRedContact ||
          building === getBuildings().TauRedIntroduce ||
          building === getBuildings().TauRedSubjugate
        ) {
          let missing = null;
          for (let [id, stat] of Object.entries({
            TauRedContact: "friend",
            TauRedIntroduce: "god",
            TauRedSubjugate: "lord",
          })) {
            if (
              !getGame().global.stats.womling[stat][getPoly().universeAffix()]
            ) {
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
      (id: any) => `Overlord achievement is missing ${getBuildings()[id].name}`,
      () => getSettings().buildingWeightingOverlord,
    ],
    [
      // Evil universe: Authority amount is capped by Authority max. When max is below target no
      // amount of tax/soldier management can fix the production penalty, so prioritize the
      // buildings that raise the cap. (Locked/irrelevant ones are already filtered to 0 above.)
      () =>
        getSettings().authorityManage &&
        getSettings().generalMinimumAuthority > 0 &&
        getResources().Authority.isUnlocked() &&
        getResources().Authority.maxQuantity <
          getSettings().generalMinimumAuthority,
      (building: any) => authorityCapBuildings.includes(building),
      () => "Raises Authority cap, currently below target",
      () => getSettings().buildingWeightingAuthority,
    ],
    [
      () =>
        getSettings().achievementGuards &&
        getSettings().guardBananaRepublic &&
        getGame().global.race["banana"],
      (building: any) =>
        building === getBuildings().DwarfWorldCollider &&
        !bananaRepublicObjectiveComplete("b2"),
      () => "Banana Republic objective",
      () => getSettings().buildingWeightingBananaObjective,
    ],
    [
      () => inflationChallengeAssistActive(),
      (building: any) => {
        if (
          !inflationChallengeMoneyReachable() &&
          inflationMoneyStorageBuildings.includes(building)
        ) {
          return "storage";
        }
        if (
          inflationChallengeMoneyReachable() &&
          inflationMoneyIncomeBuildings.includes(building)
        ) {
          return "income";
        }
        return false;
      },
      (kind: any) =>
        kind === "storage"
          ? "Inflation challenge needs Money storage"
          : "Inflation challenge needs Money income",
      () => getSettings().buildingWeightingInflationMoney,
    ],
    [
      () =>
        retirementChallengeAssistActive() &&
        retirementPreparationMissing().length > 0,
      (building: any) => {
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
      (target: any, building: any) =>
        `Retirement preparation: build ${target} ${building.name}`,
      () => getSettings().buildingWeightingRetirementPrep,
    ],
    [
      () => getSettings().achievementGuards,
      (building: any) =>
        building === getBuildings().Dreadnought && guardActive("guardDreaded")
          ? "Dreaded"
          : building === getBuildings().SiriusThermalCollector &&
              guardActive("guardEnergetic")
            ? "Energetic"
            : building === getBuildings().RedSpaceport &&
                guardActive("guardRedDead")
              ? "Red Dead"
              : false,
      (name: any) => `${name} achievement guard`,
      () => 0,
    ],
    [
      () => true,
      (building: any) =>
        building._tab === "city" &&
        building !== getBuildings().Mill &&
        building !== getBuildings().Banquet &&
        building.stateOffCount > 0,
      () => "Still have some non operating buildings",
      () => getSettings().buildingWeightingNonOperatingCity,
    ],
    [
      () => true,
      (building: any) => {
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
          !isHellSupressUseful()
        ) {
          // Prebuild guard posts. Even if we don't need supression right now they will be useful soon enough
          if (
            building.count <
            Math.ceil(
              5000 /
                (getGame().armyRating(
                  traitVal("high_pop", 0, 1),
                  "hellArmy",
                  0,
                ) *
                  traitVal("holy", 1, "+")),
            )
          ) {
            return false;
          }
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
      () => "Still have some non operating buildings",
      () => getSettings().buildingWeightingNonOperating,
    ],
    [
      () => getSettings().prestigeType !== "bioseed" || !isGECKNeeded(),
      (building: any) => building === getBuildings().GasSpaceDockGECK,
      () => "Max allowed amount of G.E.C.K reached",
      () => 0,
    ],
    [
      () =>
        getGame().global.race["lone_survivor"] && !isPrestigeAllowed("eden"),
      (building: any) => building === getBuildings().TauStarEden,
      () => "Prestiging not currently allowed",
      () => 0,
    ],
    [
      () =>
        getGame().global.race["truepath"] &&
        (!isPrestigeAllowed("retire") ||
          getBuildings().TauGas2MatrioshkaBrain.count < 1000),
      (building: any) => building === getBuildings().TauGas2IgniteGasGiant,
      () => "Prestiging not currently allowed",
      () => 0,
    ],
    [
      () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType !== "bioseed",
      (building: any) =>
        building === getBuildings().GasSpaceDock ||
        building === getBuildings().GasSpaceDockShipSegment ||
        building === getBuildings().GasSpaceDockProbe,
      () => "Not needed for current prestige",
      () => 0,
    ],
    [
      () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "bioseed",
      (building: any) =>
        building === getBuildings().DwarfWorldCollider ||
        building === getBuildings().TitanMission,
      () => "Not needed for Bioseed prestige",
      () => 0,
    ],
    [
      () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "whitehole",
      (building: any) => building === getBuildings().BlackholeJumpShip,
      () => "Not needed for Whitehole prestige",
      () => 0,
    ],
    [
      () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "vacuum",
      (building: any) => building === getBuildings().BlackholeStellarEngine,
      () => "Not needed for Vacuum Collapse prestige",
      () => 0,
    ],
    [
      () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "ascension" &&
        isPillarFinished() &&
        !getGame().global.race["witch_hunter"],
      (building: any) =>
        building === getBuildings().PitMission ||
        building === getBuildings().RuinsMission,
      () => "Not needed for Ascension prestige",
      () => 0,
    ],
    [
      () =>
        getGame().global.race["witch_hunter"] &&
        getSettings().prestigeType === "ascension",
      (building: any) => building === getBuildings().SpireWaygate,
      () => "Not needed for Witch Hunter's Ascension prestige",
      () => 0,
    ],
    [
      () =>
        getSettings().prestigeBioseedConstruct &&
        getSettings().prestigeType === "terraform",
      (building: any) =>
        building === getBuildings().PitMission ||
        building === getBuildings().RuinsMission,
      () => "Not needed for Terraform prestige",
      () => 0,
    ],
    [
      () =>
        getSettings().autoPrestige &&
        getSettings().prestigeType === "mad" &&
        (haveTech("mad") ||
          (getTechIds()["tech-mad"].isUnlocked() &&
            getTechIds()["tech-mad"].isAffordable(true))),
      (building: any) =>
        !building.is.housing &&
        !building.is.garrison &&
        !building.cost["Knowledge"] &&
        building !== getBuildings().OilWell,
      () => "Awaiting MAD prestige",
      () => getSettings().buildingWeightingMADUseless,
    ],
    [
      () => true,
      (building: any) =>
        !(building instanceof ResourceAction) && building.count === 0,
      () => "New building",
      () => getSettings().buildingWeightingNew,
    ],
    [
      () =>
        getResources().Power.isUnlocked() &&
        getResources().Power.currentQuantity < getResources().Power.maxQuantity,
      (building: any) =>
        building === getBuildings().LakeCoolingTower || building.powered < 0,
      () => "Need more energy",
      () => getSettings().buildingWeightingNeedfulPowerPlant,
    ],
    [
      () =>
        getResources().Power.isUnlocked() &&
        getResources().Power.currentQuantity > getResources().Power.maxQuantity,
      (building: any) =>
        building !== getBuildings().Mill &&
        (building === getBuildings().LakeCoolingTower || building.powered < 0),
      () => "No need for more energy",
      () => getSettings().buildingWeightingUselessPowerPlant,
    ],
    [
      () => getResources().Power.isUnlocked(),
      (building: any) =>
        building !== getBuildings().LakeCoolingTower &&
        building.powered > 0 &&
        (building === getBuildings().NeutronCitadel
          ? getCitadelConsumption(building.count + 1) -
            getCitadelConsumption(building.count)
          : building.powered) > getResources().Power.currentQuantity,
      () => "Not enough energy",
      () => getSettings().buildingWeightingUnderpowered,
    ],
    [
      () =>
        Math.max(
          getState().knowledgeRequiredByTechs,
          getState().knowledgeRequiredByBuildTargets,
        ) <= getResources().Knowledge.maxQuantity,
      (building: any) =>
        building.is.knowledge &&
        building !== getBuildings().Wardenclyffe &&
        (building !== getBuildings().StargateTelemetryBeacon ||
          building.count > 0), // We want Wardenclyffe for morale; first beacon required for progress
      () => "No need for more knowledge",
      () => getSettings().buildingWeightingUselessKnowledge,
    ],
    [
      () =>
        getState().cheapestTechKnowledge >
          getResources().Knowledge.maxQuantity ||
        getState().knowledgeRequiredByBuildTargets >
          getResources().Knowledge.maxQuantity,
      (building: any) => building.is.knowledge,
      () => "Need more knowledge",
      () => getSettings().buildingWeightingNeedfulKnowledge,
    ],
    [
      () =>
        getBuildings().BlackholeMassEjector.count > 0 &&
        getBuildings().BlackholeMassEjector.count * 1000 -
          getGame().global.interstellar.mass_ejector.total >
          100,
      (building: any) => building === getBuildings().BlackholeMassEjector,
      () => "Still have some unused ejectors",
      () => getSettings().buildingWeightingUnusedEjectors,
    ],
    [
      () =>
        getResources().Crates.storageRatio < 1 ||
        getResources().Containers.storageRatio < 1,
      (building: any) =>
        building === getBuildings().StorageYard ||
        building === getBuildings().Warehouse ||
        building === getBuildings().EnceladusMunitions,
      () => "Still have some unused storage",
      () => getSettings().buildingWeightingCrateUseless,
    ],
    [
      () =>
        getResources().Oil.maxQuantity < getResources().Oil.maxCost &&
        getBuildings().OilWell.count <= 0 &&
        getBuildings().GasMoonOilExtractor.count <= 0,
      (building: any) =>
        building === getBuildings().OilWell ||
        building === getBuildings().GasMoonOilExtractor,
      () => "Need more fuel",
      () => getSettings().buildingWeightingMissingFuel,
    ],
    [
      () =>
        (getResources().Helium_3.isUnlocked() &&
          getResources().Helium_3.maxQuantity <
            getResources().Helium_3.maxCost) ||
        getResources().Oil.maxQuantity < getResources().Oil.maxCost,
      (building: any) =>
        building === getBuildings().OilDepot ||
        building === getBuildings().SpacePropellantDepot ||
        building === getBuildings().GasStorage,
      () => "Need more fuel",
      () => getSettings().buildingWeightingMissingFuel,
    ],
    [
      () =>
        getGame().global.race.hooved &&
        getResources().Horseshoe.spareQuantity >=
          getResources().Horseshoe.storageRequired,
      (building: any) =>
        building instanceof ResourceAction &&
        building.resource === getResources().Horseshoe,
      () => `No more ${getResources().Horseshoe.title} needed`,
      () => getSettings().buildingWeightingHorseshoeUseless,
    ],
    [
      () =>
        getGame().global.race.calm &&
        getResources().Zen.currentQuantity < getResources().Zen.maxQuantity,
      (building: any) => building.id.includes("meditation"),
      () => "No more Meditation Space needed",
      () => getSettings().buildingWeightingZenUseless,
    ],
    [
      () =>
        getBuildings().GateTurret.isUnlocked() &&
        getPoly().hellSupression("gate").rating >
          7501 +
            getGame().armyRating(traitVal("high_pop", 0, 1), "hellArmy", 0) *
              traitVal("holy", 1, "+"),
      (building: any) => building === getBuildings().GateTurret,
      () => "Gate demons fully supressed",
      () => getSettings().buildingWeightingGateTurret,
    ],
    [
      () =>
        (getResources().Containers.isUnlocked() ||
          getResources().Crates.isUnlocked()) &&
        getResources().Containers.storageRatio === 1 &&
        getResources().Crates.storageRatio === 1,
      (building: any) =>
        building === getBuildings().Shed ||
        building === getBuildings().RedGarage ||
        building === getBuildings().AlphaWarehouse ||
        building === getBuildings().ProximaCargoYard ||
        building === getBuildings().TitanStorehouse,
      () => "Need more storage",
      () => getSettings().buildingWeightingNeedStorage,
    ],
    [
      () =>
        getResources().Population.maxQuantity > 50 &&
        getResources().Population.storageRatio < 0.9,
      (building: any) =>
        building.is.housing &&
        building !== getBuildings().Alien1Consulate &&
        building !== getBuildings().Transmitter &&
        !(building instanceof ResourceAction),
      () => "No more houses needed",
      () => getSettings().buildingWeightingUselessHousing,
    ],
    [
      () =>
        getGame().global.race["orbit_decay"] &&
        !getGame().global.race["orbit_decayed"],
      (building: any) =>
        (building._tab === "city" || building._location === "spc_moon") &&
        !(building instanceof ResourceAction),
      () => "Will be destroyed after impact",
      () => getSettings().buildingWeightingTemporal,
    ],
    [
      () => getGame().global.tech.tau_gas === 1, // Only used for name contest, no need to check at other game stages
      (building: any) => building.is.random,
      () => "Randomized weighting",
      () => 1 + Math.random(), // Fluctuate weight to pick random item
    ],
    [
      () => getGame().global.race["truepath"] && haveTech("tauceti", 2),
      (building: any) =>
        (building._tab === "city" ||
          building._tab === "space" ||
          building._tab === "starDock") &&
        !(building instanceof ResourceAction),
      () => "Solar System building",
      () => getSettings().buildingWeightingSolar,
    ],
  ];

  return {
    wrGlobalCondition,
    wrIndividualCondition,
    wrDescription,
    wrMultiplier,
    authorityCapBuildings,
    INFLATION_CHALLENGE_MONEY,
    RETIREMENT_PREP,
    inflationMoneyStorageBuildings,
    inflationMoneyIncomeBuildings,
    galaxyCombatShips,
    weightingRules,
  };
}
