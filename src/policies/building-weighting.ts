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

function liveObject(getValue: () => LooseObject): LooseObject {
  return new Proxy({} as LooseObject, {
    get: (_target, property) => Reflect.get(getValue(), property),
    set: (_target, property, value) => Reflect.set(getValue(), property, value),
    has: (_target, property) => Reflect.has(getValue(), property),
    ownKeys: () => Reflect.ownKeys(getValue()),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(getValue(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

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
  const game = liveObject(getGame);
  const settings = liveObject(getSettings);
  const state = liveObject(getState);
  const resources = liveObject(getResources);
  const buildings = liveObject(getBuildings);
  const poly = liveObject(getPoly);
  const MechManager = liveObject(getMechManager);
  const techIds = liveObject(getTechIds);
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
    buildings.Barracks,
    buildings.Temple,
    buildings.RedSpaceBarracks,
    buildings.ProximaCruiser,
    buildings.BeltSpaceStation,
    buildings.WastelandBrute,
    buildings.BadlandsMinions,
    buildings.WastelandThrone,
    buildings.AsphodelBunker,
  ];
  const INFLATION_CHALLENGE_MONEY = 25e10;
  const RETIREMENT_PREP = {
    fusionGenerators: 20,
    factories: 18,
    scienceLabs: 11,
    graphene: 200e6,
  };
  const inflationMoneyStorageBuildings = [
    buildings.Bank,
    buildings.Casino,
    buildings.HellSpaceCasino,
    buildings.TitanBank,
    buildings.TauCasino,
    buildings.AlphaExchange,
    buildings.RuinsVault,
    buildings.RuinsWarVault,
    buildings.WastelandHellCasino,
    buildings.ElysiumEternalBank,
  ];
  const inflationMoneyIncomeBuildings = [
    buildings.TouristCenter,
    buildings.Casino,
    buildings.HellSpaceCasino,
    buildings.TauCasino,
    buildings.AlphaLuxuryCondo,
    buildings.WastelandHellCasino,
  ];
  const galaxyCombatShips = [
    buildings.ScoutShip,
    buildings.CorvetteShip,
    buildings.FrigateShip,
    buildings.CruiserShip,
    buildings.Dreadnought,
  ];
  const weightingRules = [
    [
      () => !settings.autoBuild,
      () => true,
      () => "",
      () => 0, // Set weighting to zero right away, and skip all checks if autoBuild is disabled
    ],
    [
      () => true,
      (building) => !building.isUnlocked(),
      () => "Locked",
      () => 0, // Should always be on top, processing locked building may lead to issues
    ],
    [
      () => true,
      (building) => state.queuedTargets.includes(building),
      () => "Queued building, processing...",
      () => 0,
    ],
    [
      () => true,
      (building) => state.triggerTargets.includes(building),
      () => "Active trigger, processing...",
      () => 0,
    ],
    [
      () => true,
      (building) => !building.autoBuildEnabled,
      () => "AutoBuild disabled",
      () => 0,
    ],
    [
      () => true,
      (building) => building.count >= building.autoMax,
      () => "Maximum amount reached",
      () => 0,
    ],
    [
      () => true,
      (building) => !building.isAffordable(true),
      () => "",
      () => 0, // Red buildings need to be filtered out, so they won't prevent affordable buildings with lower weight from building
    ],
    [
      () =>
        game.global.race["truepath"] &&
        buildings.SpaceTestLaunch.isUnlocked() &&
        !haveTech("world_control"),
      (building) => {
        if (building === buildings.SpaceTestLaunch) {
          let sabotage = 1;
          for (let i = 0; i < 3; i++) {
            let gov = game.global.civic.foreign[`gov${i}`];
            if (!gov.occ && !gov.anx && !gov.buy) {
              sabotage++;
            }
          }
          return 1 / (sabotage + 1);
        }
      },
      (chance) => `${Math.round(chance * 100)}% chance of successful launch`,
      (chance) => (chance < 0.5 ? chance : 0),
    ],
    [
      () => settings.jobDisableMiners && buildings.GatewayStarbase.count > 0,
      (building) =>
        building === buildings.CoalMine ||
        (building === buildings.Mine &&
          !(game.global.race["sappy"] && game.global.race["smoldering"])),
      () => "Miners disabled in Andromeda",
      () => 0,
    ],
    [
      () => haveTech("piracy"),
      (building) =>
        building === buildings.StargateDefensePlatform &&
        buildings.StargateDefensePlatform.count * 20 >=
          (game.global.race["instinct"] ? 0.09 : 0.1) *
            game.global.tech.piracy *
            getPiracyMultiplier(),
      () => "Piracy fully supressed",
      () => 0,
    ],
    [
      () =>
        settings.autoFleet &&
        game.global.tech["piracy"] &&
        !galaxyAssaultPending(),
      (building) => {
        if (galaxyCombatShips.includes(building)) {
          let totalNeed = getGalaxyRegions().reduce(
            (sum, region) =>
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
        settings.autoMech &&
        settings.mechBuild !== "none" &&
        settings.buildingMechsFirst &&
        buildings.SpireMechBay.count > 0 &&
        buildings.SpireMechBay.stateOffCount === 0,
      (building) => {
        if (building.cost["Supply"]) {
          if (MechManager.isActive) {
            return "Building mechs...";
          }
          let mechBay = game.global.portal.mechbay;
          let newSize = !haveTask("mech")
            ? settings.mechBuild === "random"
              ? MechManager.getPreferredSize()[0]
              : mechBay.blueprint.size
            : "titan";
          let [newGems, newSupply, newSpace] = MechManager.getMechCost({
            size: newSize,
          });
          if (
            newSpace <= mechBay.max - mechBay.bay &&
            newSupply <= resources.Supply.maxQuantity &&
            newGems <= resources.Soul_Gem.currentQuantity
          ) {
            return "Saving supplies for new mech";
          }
        }
      },
      (note) => note,
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "ascension" &&
        !game.global.race["witch_hunter"],
      (building) =>
        building === buildings.GateEastTower ||
        building === buildings.GateWestTower,
      () => "Not needed for Ascension prestige",
      () => 0,
    ],
    [
      () =>
        buildings.GateEastTower.isUnlocked() &&
        buildings.GateWestTower.isUnlocked() &&
        poly.hellSupression("gate").supress <
          settings.buildingTowerSuppression / 100,
      (building) =>
        building === buildings.GateEastTower ||
        building === buildings.GateWestTower,
      () => "Too low gate supression",
      () => 0,
    ],
    [
      () =>
        settings.prestigeType === "whitehole" &&
        settings.prestigeWhiteholeSaveGems,
      (building) => {
        if (
          building.cost["Soul_Gem"] >
          resources.Soul_Gem.currentQuantity - 10
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
          buildings.GorddonFreighter.isAutoBuildable() &&
          buildings.GorddonFreighter.isAffordable(true) &&
          buildings.Alien1SuperFreighter.isAutoBuildable() &&
          buildings.Alien1SuperFreighter.isAffordable(true)
        );
      },
      (building) => {
        if (
          building === buildings.GorddonFreighter ||
          building === buildings.Alien1SuperFreighter
        ) {
          let regCount = buildings.GorddonFreighter.count;
          let regTotal =
            (1 + (regCount + 1) * 0.03) / (1 + regCount * 0.03) - 1;
          let regCrew = regTotal / 3;
          let supCount = buildings.Alien1SuperFreighter.count;
          let supTotal =
            (1 + (supCount + 1) * 0.08) / (1 + supCount * 0.08) - 1;
          let supCrew = supTotal / 5;
          if (building === buildings.GorddonFreighter && regCrew < supCrew) {
            return buildings.Alien1SuperFreighter;
          }
          if (
            building === buildings.Alien1SuperFreighter &&
            supCrew < regCrew
          ) {
            return buildings.GorddonFreighter;
          }
        }
      },
      (other) => `${other.title} gives more Money`,
      () => (settings.buildingsBestFreighter ? 0 : 1), // Find what's better - Freighter or Super Freighter
    ],
    [
      () => {
        return (
          buildings.LakeBireme.isAutoBuildable() &&
          buildings.LakeBireme.isAffordable(true) &&
          buildings.LakeTransport.isAutoBuildable() &&
          buildings.LakeTransport.isAffordable(true) &&
          resources.Lake_Support.rateOfChange <= 1
        ); // Build any if there's spare support
      },
      (building) => {
        if (
          building === buildings.LakeBireme ||
          building === buildings.LakeTransport
        ) {
          let biremeCount = buildings.LakeBireme.count;
          let transportCount = buildings.LakeTransport.count;
          let rating =
            game.global.blood["spire"] && game.global.blood.spire >= 2
              ? 0.8
              : 0.85;
          let nextBireme =
            (1 - rating ** (biremeCount + 1)) * (transportCount * 5);
          let nextTransport =
            (1 - rating ** biremeCount) * ((transportCount + 1) * 5);
          if (settings.buildingsTransportGem) {
            let currentSupply =
              (1 - rating ** biremeCount) * (transportCount * 5);
            nextBireme =
              (nextBireme - currentSupply) /
              buildings.LakeBireme.cost["Soul_Gem"];
            nextTransport =
              (nextTransport - currentSupply) /
              buildings.LakeTransport.cost["Soul_Gem"];
          }
          if (building === buildings.LakeBireme && nextBireme < nextTransport) {
            return buildings.LakeTransport;
          }
          if (
            building === buildings.LakeTransport &&
            nextTransport < nextBireme
          ) {
            return buildings.LakeBireme;
          }
        }
      },
      (other) => `${other.title} gives more Supplies`,
      () => 0, // Find what's better - Bireme or Transport
    ],
    [
      () => {
        return (
          buildings.SpirePort.isAutoBuildable() &&
          buildings.SpirePort.isAffordable(true) &&
          buildings.SpireBaseCamp.isAutoBuildable() &&
          buildings.SpireBaseCamp.isAffordable(true)
        );
      },
      (building) => {
        if (
          building === buildings.SpirePort ||
          building === buildings.SpireBaseCamp
        ) {
          let portCount = buildings.SpirePort.count;
          let baseCount = buildings.SpireBaseCamp.count;
          let nextPort = (portCount + 1) * (1 + baseCount * 0.4);
          let nextBase = portCount * (1 + (baseCount + 1) * 0.4);
          if (building === buildings.SpirePort && nextPort < nextBase) {
            return buildings.SpireBaseCamp;
          }
          if (building === buildings.SpireBaseCamp && nextBase < nextPort) {
            return buildings.SpirePort;
          }
        }
      },
      (other) => `${other.title} gives more Max Supplies`,
      () => 0, // Find what's better - Port or Base
    ],
    [
      () => haveTech("waygate", 2),
      (building) => building === buildings.SpireWaygate,
      () => "",
      () => 0, // We can't limit waygate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
    ],
    [
      () => haveTech("edenic", 3),
      (building) => building === buildings.SpireEdenicGate,
      () => "",
      () => 0, // We can't limit edenic gate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
    ],
    [
      () => haveTech("elysium", 8),
      (building) => {
        if (building === buildings.ElysiumFireSupportBase) {
          if (haveTech("isle", 2)) {
            return "Garrison is destroyed";
          }
          if (!haveTech("elysium", 10) && building.count >= 100) {
            return "Missing Elerium Cannon tech";
          }
        }
      },
      (note) => note,
      () => 0, // Build up to 100, and then fire after researching cannon
    ],
    [
      () => haveTech("asphodel", 8),
      (building) =>
        building === buildings.AsphodelStabilizer &&
        building.count >= buildings.AsphodelWarehouse.count,
      () => "Can not exceed amount of Warehouses",
      () => 0,
    ],
    [
      () => haveTech("hell_spire", 8) || game.global.race["warlord"],
      (building) => building === buildings.SpireSphinx,
      () => "",
      () => 0, // Sphinx not usable after solving / Harmachis not usable during Warlord
    ],
    [
      () => game.global.race["artifical"] && haveTech("focus_cure", 7),
      (building) =>
        building instanceof ResourceAction &&
        building.resource === resources.Population &&
        building !== buildings.TauCloning,
      () => "Assembling is not possible",
      () => 0,
    ],
    [
      () => game.global.race["artifical"],
      (building) =>
        building instanceof ResourceAction &&
        building.resource === resources.Population &&
        resources.Population.storageRatio === 1,
      () => "No empty housings",
      () => 0,
    ],
    [
      () =>
        buildings.GorddonEmbassy.count === 0 &&
        resources.Knowledge.maxQuantity < settings.fleetEmbassyKnowledge,
      (building) => building === buildings.GorddonEmbassy,
      () =>
        `${getNumberString(
          settings.fleetEmbassyKnowledge,
        )} Max Knowledge required`,
      () => 0,
    ],
    [
      () =>
        game.global.race["magnificent"] &&
        settings.buildingShrineType !== "any",
      (building) => {
        if (building.id && building.id.includes("shrine")) {
          let bonus = null;
          if (
            game.global.city.calendar.moon > 0 &&
            game.global.city.calendar.moon < 7
          ) {
            bonus = "morale";
          } else if (
            game.global.city.calendar.moon > 7 &&
            game.global.city.calendar.moon < 14
          ) {
            bonus = "metal";
          } else if (
            game.global.city.calendar.moon > 14 &&
            game.global.city.calendar.moon < 21
          ) {
            bonus = "know";
          } else if (game.global.city.calendar.moon > 21) {
            bonus = "tax";
          } else if ([0, 7, 14, 21].includes(game.global.city.calendar.moon)) {
            bonus = "rotating";
          } else {
            return true;
          }
          if (settings.buildingShrineType === "equally") {
            let minShrine = Math.min(
              game.global.city.shrine.morale,
              game.global.city.shrine.metal,
              game.global.city.shrine.know,
              game.global.city.shrine.tax,
            );
            return game.global.city.shrine[bonus] !== minShrine;
          } else {
            return settings.buildingShrineType !== bonus;
          }
        }
      },
      () => "Wrong shrine",
      () => 0,
    ],
    [
      () => game.global.race["slaver"],
      (building) => {
        if (building === buildings.SlaveMarket) {
          if (resources.Slave.currentQuantity >= resources.Slave.maxQuantity) {
            return "Slave pens already full";
          }
          if (
            resources.Money.currentQuantity + resources.Money.rateOfChange <
              resources.Money.maxQuantity &&
            resources.Money.rateOfChange < settings.slaveIncome
          ) {
            return "Buying slaves only with excess money";
          }
        }
      },
      (note) => note,
      () => 0, // Slave Market
    ],
    [
      () => game.global.race["cannibalize"],
      (building) => {
        if (building._id === "s_alter" && building.count > 0) {
          if (resources.Population.currentQuantity < 1) {
            return "Too low population";
          }
          if (
            resources.Population.currentQuantity !==
            resources.Population.maxQuantity
          ) {
            return "Sacrifices performed only with full population";
          }
          if (
            game.global.race["parasite"] &&
            game.global.city.calendar.wind === 0
          ) {
            return "Parasites sacrificed only during windy weather";
          }
          if (game.global.civic[game.global.civic.d_job].workers < 1) {
            return "No default workers to sacrifice";
          }

          if (
            game.global.city.s_alter.rage >= 3600 &&
            game.global.city.s_alter.regen >= 3600 &&
            game.global.city.s_alter.mind >= 3600 &&
            game.global.city.s_alter.mine >= 3600 &&
            (!isLumberRace() || game.global.city.s_alter.harvest >= 3600)
          ) {
            return "Sacrifice bonus already high enough";
          }
        }
      },
      (note) => note,
      () => 0, // Sacrificial Altar
    ],
    [
      () => true,
      (building) => building.getMissingConsumption(),
      (resource) => `Missing ${resource.name} to operate`,
      () => settings.buildingWeightingMissingSupply,
    ],
    [
      () => true,
      (building) => building.getMissingSupport(),
      (support) => `Missing ${support.name} to operate`,
      () => settings.buildingWeightingMissingSupport,
    ],
    [
      () => true,
      (building) => building.getUselessSupport(),
      (support) => `Provided ${support.name} not currently needed`,
      () => settings.buildingWeightingUselessSupport,
    ],
    [
      () =>
        game.global.race["truepath"] &&
        resources.Tau_Belt_Support.maxQuantity <=
          resources.Tau_Belt_Support.currentQuantity,
      (building) => {
        if (
          building === buildings.TauBeltWhalingShip ||
          building === buildings.TauBeltMiningShip
        ) {
          let s_max = resources.Tau_Belt_Support.maxQuantity;
          let s_cur = resources.Tau_Belt_Support.currentQuantity;
          let currentEff = 1 - (1 - s_max / s_cur) ** 1.4;
          let nextEff = 1 - (1 - s_max / (s_cur + 1)) ** 1.4;
          return nextEff * (s_cur + 1) - currentEff * s_cur;
        }
      },
      (eff) =>
        `Low security, new ship will be ${getNiceNumber(eff * 100)}% efficient`,
      (eff) => eff ?? -1,
    ],
    [
      () => game.global.race["truepath"], // "&& game.global.tech.tau_red === 4" doesn't want to work for some reason.
      (building) => {
        if (
          building === buildings.TauRedContact ||
          building === buildings.TauRedIntroduce ||
          building === buildings.TauRedSubjugate
        ) {
          let missing = null;
          for (let [id, stat] of Object.entries({
            TauRedContact: "friend",
            TauRedIntroduce: "god",
            TauRedSubjugate: "lord",
          })) {
            if (!game.global.stats.womling[stat][poly.universeAffix()]) {
              if (building === buildings[id]) {
                return false; // Unearned stat, go for it
              }
              if (buildings[id].isAutoBuildable()) {
                missing = id;
              }
            }
          }
          return missing;
        }
      },
      (id) => `Overlord achievement is missing ${buildings[id].name}`,
      () => settings.buildingWeightingOverlord,
    ],
    [
      // Evil universe: Authority amount is capped by Authority max. When max is below target no
      // amount of tax/soldier management can fix the production penalty, so prioritize the
      // buildings that raise the cap. (Locked/irrelevant ones are already filtered to 0 above.)
      () =>
        settings.generalMinimumAuthority > 0 &&
        resources.Authority.isUnlocked() &&
        resources.Authority.maxQuantity < settings.generalMinimumAuthority,
      (building) => authorityCapBuildings.includes(building),
      () => "Raises Authority cap, currently below target",
      () => settings.buildingWeightingAuthority,
    ],
    [
      () =>
        settings.achievementGuards &&
        settings.guardBananaRepublic &&
        game.global.race["banana"],
      (building) =>
        building === buildings.DwarfWorldCollider &&
        !bananaRepublicObjectiveComplete("b2"),
      () => "Banana Republic objective",
      () => settings.buildingWeightingBananaObjective,
    ],
    [
      () => inflationChallengeAssistActive(),
      (building) => {
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
      (kind) =>
        kind === "storage"
          ? "Inflation challenge needs Money storage"
          : "Inflation challenge needs Money income",
      () => settings.buildingWeightingInflationMoney,
    ],
    [
      () =>
        retirementChallengeAssistActive() &&
        retirementPreparationMissing().length > 0,
      (building) => {
        if (
          building === buildings.TauFusionGenerator &&
          building.count < RETIREMENT_PREP.fusionGenerators
        ) {
          return RETIREMENT_PREP.fusionGenerators;
        }
        if (
          building === buildings.TauFactory &&
          building.count < RETIREMENT_PREP.factories
        ) {
          return RETIREMENT_PREP.factories;
        }
        if (
          building === buildings.TauDiseaseLab &&
          building.count < RETIREMENT_PREP.scienceLabs
        ) {
          return RETIREMENT_PREP.scienceLabs;
        }
        return false;
      },
      (target, building) =>
        `Retirement preparation: build ${target} ${building.name}`,
      () => settings.buildingWeightingRetirementPrep,
    ],
    [
      () => settings.achievementGuards,
      (building) =>
        building === buildings.Dreadnought && guardActive("guardDreaded")
          ? "Dreaded"
          : building === buildings.SiriusThermalCollector &&
              guardActive("guardEnergetic")
            ? "Energetic"
            : building === buildings.RedSpaceport && guardActive("guardRedDead")
              ? "Red Dead"
              : false,
      (name) => `${name} achievement guard`,
      () => 0,
    ],
    [
      () => true,
      (building) =>
        building._tab === "city" &&
        building !== buildings.Mill &&
        building !== buildings.Banquet &&
        building.stateOffCount > 0,
      () => "Still have some non operating buildings",
      () => settings.buildingWeightingNonOperatingCity,
    ],
    [
      () => true,
      (building) => {
        if (building === buildings.BlackholeStellarEngine) {
          // `stateOffCount` is missleading for powered multisegmented buildings. This rule shouldn't ever apply to Stellar Engine, just ignore it
          // TODO: Might be better to ignore all multisegmented buildings, or making `stateOffCount` return 0 for multisegmented buildings, but i'm not sure about possible side effects at the moment - that would work as a hot fix
          return false;
        }
        if (
          (building === buildings.BadlandsAttractor ||
            building === buildings.SpireMechBay) &&
          building.isSmartManaged()
        ) {
          // Those things might be temporaly disabled by smart logic
          return false;
        }
        if (
          building === buildings.RuinsGuardPost &&
          building.isSmartManaged() &&
          !isHellSupressUseful()
        ) {
          // Prebuild guard posts. Even if we don't need supression right now they will be useful soon enough
          if (
            building.count <
            Math.ceil(
              5000 /
                (game.armyRating(traitVal("high_pop", 0, 1), "hellArmy", 0) *
                  traitVal("holy", 1, "+")),
            )
          ) {
            return false;
          }
        }
        let supplyIndex =
          building === buildings.SpirePort
            ? 1
            : building === buildings.SpireBaseCamp
              ? 2
              : -1;
        if (
          supplyIndex > 0 &&
          (buildings.SpireMechBay.isSmartManaged() ||
            buildings.SpirePurifier.isSmartManaged())
        ) {
          // Prebuild ports and base camps to their optimal ratios, they will be enabled when needed. Unless mech bay and purifiers both have their smarts disabled, which means it won't ever happen.
          if (
            building.count <
            getBestSupplyRatio(
              resources.Spire_Support.maxQuantity,
              buildings.SpirePort.autoMax,
              buildings.SpireBaseCamp.autoMax,
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
      () => settings.buildingWeightingNonOperating,
    ],
    [
      () => settings.prestigeType !== "bioseed" || !isGECKNeeded(),
      (building) => building === buildings.GasSpaceDockGECK,
      () => "Max allowed amount of G.E.C.K reached",
      () => 0,
    ],
    [
      () => game.global.race["lone_survivor"] && !isPrestigeAllowed("eden"),
      (building) => building === buildings.TauStarEden,
      () => "Prestiging not currently allowed",
      () => 0,
    ],
    [
      () =>
        game.global.race["truepath"] &&
        (!isPrestigeAllowed("retire") ||
          buildings.TauGas2MatrioshkaBrain.count < 1000),
      (building) => building === buildings.TauGas2IgniteGasGiant,
      () => "Prestiging not currently allowed",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType !== "bioseed",
      (building) =>
        building === buildings.GasSpaceDock ||
        building === buildings.GasSpaceDockShipSegment ||
        building === buildings.GasSpaceDockProbe,
      () => "Not needed for current prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "bioseed",
      (building) =>
        building === buildings.DwarfWorldCollider ||
        building === buildings.TitanMission,
      () => "Not needed for Bioseed prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "whitehole",
      (building) => building === buildings.BlackholeJumpShip,
      () => "Not needed for Whitehole prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct && settings.prestigeType === "vacuum",
      (building) => building === buildings.BlackholeStellarEngine,
      () => "Not needed for Vacuum Collapse prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "ascension" &&
        isPillarFinished() &&
        !game.global.race["witch_hunter"],
      (building) =>
        building === buildings.PitMission ||
        building === buildings.RuinsMission,
      () => "Not needed for Ascension prestige",
      () => 0,
    ],
    [
      () =>
        game.global.race["witch_hunter"] &&
        settings.prestigeType === "ascension",
      (building) => building === buildings.SpireWaygate,
      () => "Not needed for Witch Hunter's Ascension prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "terraform",
      (building) =>
        building === buildings.PitMission ||
        building === buildings.RuinsMission,
      () => "Not needed for Terraform prestige",
      () => 0,
    ],
    [
      () =>
        settings.autoPrestige &&
        settings.prestigeType === "mad" &&
        (haveTech("mad") ||
          (techIds["tech-mad"].isUnlocked() &&
            techIds["tech-mad"].isAffordable(true))),
      (building) =>
        !building.is.housing &&
        !building.is.garrison &&
        !building.cost["Knowledge"] &&
        building !== buildings.OilWell,
      () => "Awaiting MAD prestige",
      () => settings.buildingWeightingMADUseless,
    ],
    [
      () => true,
      (building) =>
        !(building instanceof ResourceAction) && building.count === 0,
      () => "New building",
      () => settings.buildingWeightingNew,
    ],
    [
      () =>
        resources.Power.isUnlocked() &&
        resources.Power.currentQuantity < resources.Power.maxQuantity,
      (building) =>
        building === buildings.LakeCoolingTower || building.powered < 0,
      () => "Need more energy",
      () => settings.buildingWeightingNeedfulPowerPlant,
    ],
    [
      () =>
        resources.Power.isUnlocked() &&
        resources.Power.currentQuantity > resources.Power.maxQuantity,
      (building) =>
        building !== buildings.Mill &&
        (building === buildings.LakeCoolingTower || building.powered < 0),
      () => "No need for more energy",
      () => settings.buildingWeightingUselessPowerPlant,
    ],
    [
      () => resources.Power.isUnlocked(),
      (building) =>
        building !== buildings.LakeCoolingTower &&
        building.powered > 0 &&
        (building === buildings.NeutronCitadel
          ? getCitadelConsumption(building.count + 1) -
            getCitadelConsumption(building.count)
          : building.powered) > resources.Power.currentQuantity,
      () => "Not enough energy",
      () => settings.buildingWeightingUnderpowered,
    ],
    [
      () =>
        Math.max(
          state.knowledgeRequiredByTechs,
          state.knowledgeRequiredByBuildTargets,
        ) <= resources.Knowledge.maxQuantity,
      (building) =>
        building.is.knowledge &&
        building !== buildings.Wardenclyffe &&
        (building !== buildings.StargateTelemetryBeacon || building.count > 0), // We want Wardenclyffe for morale; first beacon required for progress
      () => "No need for more knowledge",
      () => settings.buildingWeightingUselessKnowledge,
    ],
    [
      () =>
        state.cheapestTechKnowledge > resources.Knowledge.maxQuantity ||
        state.knowledgeRequiredByBuildTargets > resources.Knowledge.maxQuantity,
      (building) => building.is.knowledge,
      () => "Need more knowledge",
      () => settings.buildingWeightingNeedfulKnowledge,
    ],
    [
      () =>
        buildings.BlackholeMassEjector.count > 0 &&
        buildings.BlackholeMassEjector.count * 1000 -
          game.global.interstellar.mass_ejector.total >
          100,
      (building) => building === buildings.BlackholeMassEjector,
      () => "Still have some unused ejectors",
      () => settings.buildingWeightingUnusedEjectors,
    ],
    [
      () =>
        resources.Crates.storageRatio < 1 ||
        resources.Containers.storageRatio < 1,
      (building) =>
        building === buildings.StorageYard ||
        building === buildings.Warehouse ||
        building === buildings.EnceladusMunitions,
      () => "Still have some unused storage",
      () => settings.buildingWeightingCrateUseless,
    ],
    [
      () =>
        resources.Oil.maxQuantity < resources.Oil.maxCost &&
        buildings.OilWell.count <= 0 &&
        buildings.GasMoonOilExtractor.count <= 0,
      (building) =>
        building === buildings.OilWell ||
        building === buildings.GasMoonOilExtractor,
      () => "Need more fuel",
      () => settings.buildingWeightingMissingFuel,
    ],
    [
      () =>
        (resources.Helium_3.isUnlocked() &&
          resources.Helium_3.maxQuantity < resources.Helium_3.maxCost) ||
        resources.Oil.maxQuantity < resources.Oil.maxCost,
      (building) =>
        building === buildings.OilDepot ||
        building === buildings.SpacePropellantDepot ||
        building === buildings.GasStorage,
      () => "Need more fuel",
      () => settings.buildingWeightingMissingFuel,
    ],
    [
      () =>
        game.global.race.hooved &&
        resources.Horseshoe.spareQuantity >=
          resources.Horseshoe.storageRequired,
      (building) =>
        building instanceof ResourceAction &&
        building.resource === resources.Horseshoe,
      () => `No more ${resources.Horseshoe.title} needed`,
      () => settings.buildingWeightingHorseshoeUseless,
    ],
    [
      () =>
        game.global.race.calm &&
        resources.Zen.currentQuantity < resources.Zen.maxQuantity,
      (building) => building.id.includes("meditation"),
      () => "No more Meditation Space needed",
      () => settings.buildingWeightingZenUseless,
    ],
    [
      () =>
        buildings.GateTurret.isUnlocked() &&
        poly.hellSupression("gate").rating >
          7501 +
            game.armyRating(traitVal("high_pop", 0, 1), "hellArmy", 0) *
              traitVal("holy", 1, "+"),
      (building) => building === buildings.GateTurret,
      () => "Gate demons fully supressed",
      () => settings.buildingWeightingGateTurret,
    ],
    [
      () =>
        (resources.Containers.isUnlocked() || resources.Crates.isUnlocked()) &&
        resources.Containers.storageRatio === 1 &&
        resources.Crates.storageRatio === 1,
      (building) =>
        building === buildings.Shed ||
        building === buildings.RedGarage ||
        building === buildings.AlphaWarehouse ||
        building === buildings.ProximaCargoYard ||
        building === buildings.TitanStorehouse,
      () => "Need more storage",
      () => settings.buildingWeightingNeedStorage,
    ],
    [
      () =>
        resources.Population.maxQuantity > 50 &&
        resources.Population.storageRatio < 0.9,
      (building) =>
        building.is.housing &&
        building !== buildings.Alien1Consulate &&
        building !== buildings.Transmitter &&
        !(building instanceof ResourceAction),
      () => "No more houses needed",
      () => settings.buildingWeightingUselessHousing,
    ],
    [
      () =>
        game.global.race["orbit_decay"] && !game.global.race["orbit_decayed"],
      (building) =>
        (building._tab === "city" || building._location === "spc_moon") &&
        !(building instanceof ResourceAction),
      () => "Will be destroyed after impact",
      () => settings.buildingWeightingTemporal,
    ],
    [
      () => game.global.tech.tau_gas === 1, // Only used for name contest, no need to check at other game stages
      (building) => building.is.random,
      () => "Randomized weighting",
      () => 1 + Math.random(), // Fluctuate weight to pick random item
    ],
    [
      () => game.global.race["truepath"] && haveTech("tauceti", 2),
      (building) =>
        (building._tab === "city" ||
          building._tab === "space" ||
          building._tab === "starDock") &&
        !(building instanceof ResourceAction),
      () => "Solar System building",
      () => settings.buildingWeightingSolar,
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
