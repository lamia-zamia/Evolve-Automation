// Verbatim copy of the legacy getter-bag `src/settings/reset-settings.ts`, preserved as the
// dual-run parity oracle for the pure `src/domain/settings-defaults.ts` +
// `src/adapters/evolve/settings-reset.ts` + `src/application/settings-reset.ts` port.
/* eslint-disable */
type Loose = any;
type LooseRecord = Record<string, Loose>;
type LooseFunction = (...args: Loose[]) => Loose;
type LooseCallable = LooseFunction & (new (...args: Loose[]) => Loose);

interface ResetSettingsContext {
  AlchemyManager: LooseRecord;
  applySettings: LooseFunction;
  biomeList: Loose[];
  BuildingManager: LooseRecord;
  buildings: LooseRecord;
  challenges: Loose[];
  DroidManager: LooseRecord;
  EjectManager: LooseRecord;
  extraList: Loose[];
  FactoryManager: LooseRecord;
  game: LooseRecord;
  GameLog: LooseRecord;
  GenusTrait: LooseCallable;
  GovernmentManager: LooseRecord;
  initBuildingState: LooseFunction;
  JobManager: LooseRecord;
  jobs: LooseRecord;
  MajorTrait: LooseCallable;
  MarketManager: LooseRecord;
  MinorTrait: LooseCallable;
  MinorTraitManager: LooseRecord;
  MutableTraitManager: LooseRecord;
  NaniteManager: LooseRecord;
  ocularPowerData: LooseRecord;
  planetBiomes: Loose[];
  planetTraits: Loose[];
  poly: LooseRecord;
  ProjectManager: LooseRecord;
  projects: LooseRecord;
  ReplicatorManager: LooseRecord;
  resources: LooseRecord;
  RitualManager: LooseRecord;
  settingsRaw: LooseRecord;
  SmelterManager: LooseRecord;
  StorageManager: LooseRecord;
  SupplyManager: LooseRecord;
  traitList: Loose[];
  TriggerManager: LooseRecord;
}

interface ResetSettingsDependencies {
  dependencies: {
    [Key in keyof ResetSettingsContext]: () => ResetSettingsContext[Key];
  };
}

export function createResetSettings({
  dependencies,
}: ResetSettingsDependencies) {
  const liveObject = (key: keyof ResetSettingsContext) =>
    new Proxy(
      {},
      {
        get(_target, property) {
          const current = dependencies[key]() as LooseRecord;
          const value = Reflect.get(current, property);
          return typeof value === "function" ? value.bind(current) : value;
        },
        set(_target, property, value) {
          return Reflect.set(
            dependencies[key]() as LooseRecord,
            property,
            value,
          );
        },
        deleteProperty(_target, property) {
          return Reflect.deleteProperty(
            dependencies[key]() as LooseRecord,
            property,
          );
        },
        has(_target, property) {
          return Reflect.has(dependencies[key]() as LooseRecord, property);
        },
        ownKeys() {
          return Reflect.ownKeys(dependencies[key]() as LooseRecord);
        },
        getOwnPropertyDescriptor(_target, property) {
          const current = dependencies[key]() as LooseRecord;
          const descriptor = Object.getOwnPropertyDescriptor(current, property);
          return {
            configurable: true,
            enumerable: descriptor?.enumerable ?? true,
            writable: true,
            value: Reflect.get(current, property),
          };
        },
      },
    ) as LooseRecord;
  const liveFunction = (key: keyof ResetSettingsContext) =>
    new Proxy(function () {}, {
      apply(_target, thisArg, argumentsList) {
        return Reflect.apply(
          dependencies[key]() as LooseFunction,
          thisArg,
          argumentsList,
        );
      },
      construct(_target, argumentsList, newTarget) {
        return Reflect.construct(
          dependencies[key]() as LooseFunction,
          argumentsList,
          newTarget,
        );
      },
      get(_target, property) {
        const current = dependencies[key]() as LooseFunction;
        if (property === Symbol.hasInstance) {
          return (value: Loose) => value instanceof current;
        }
        return Reflect.get(current, property);
      },
    }) as LooseCallable;

  const AlchemyManager = liveObject("AlchemyManager");
  const applySettings = liveFunction("applySettings");
  const biomeList = liveObject("biomeList") as Loose[];
  const BuildingManager = liveObject("BuildingManager");
  const buildings = liveObject("buildings");
  const challenges = liveObject("challenges") as Loose[];
  const DroidManager = liveObject("DroidManager");
  const EjectManager = liveObject("EjectManager");
  const extraList = liveObject("extraList") as Loose[];
  const FactoryManager = liveObject("FactoryManager");
  const game = liveObject("game");
  const GameLog = liveObject("GameLog");
  const GenusTrait = liveFunction("GenusTrait");
  const GovernmentManager = liveObject("GovernmentManager");
  const initBuildingState = liveFunction("initBuildingState");
  const JobManager = liveObject("JobManager");
  const jobs = liveObject("jobs");
  const MajorTrait = liveFunction("MajorTrait");
  const MarketManager = liveObject("MarketManager");
  const MinorTrait = liveFunction("MinorTrait");
  const MinorTraitManager = liveObject("MinorTraitManager");
  const MutableTraitManager = liveObject("MutableTraitManager");
  const NaniteManager = liveObject("NaniteManager");
  const ocularPowerData = liveObject("ocularPowerData");
  const planetBiomes = liveObject("planetBiomes") as Loose[];
  const planetTraits = liveObject("planetTraits") as Loose[];
  const poly = liveObject("poly");
  const ProjectManager = liveObject("ProjectManager");
  const projects = liveObject("projects");
  const ReplicatorManager = liveObject("ReplicatorManager");
  const resources = liveObject("resources");
  const RitualManager = liveObject("RitualManager");
  const settingsRaw = liveObject("settingsRaw");
  const SmelterManager = liveObject("SmelterManager");
  const StorageManager = liveObject("StorageManager");
  const SupplyManager = liveObject("SupplyManager");
  const traitList = liveObject("traitList") as Loose[];
  const TriggerManager = liveObject("TriggerManager");

  function resetWarSettings(reset) {
    let def = {
      autoFight: false,
      foreignAttackLivingSoldiersPercent: 90,
      foreignAttackHealthySoldiersPercent: 90,
      foreignHireMercMoneyStoragePercent: 90,
      foreignHireMercCostLowerThanIncome: 1,
      foreignHireMercDeadSoldiers: 1,
      foreignMinAdvantage: 40,
      foreignMaxAdvantage: 80,
      foreignMaxSiegeBattalion: 10,
      foreignProtect: "auto",
      foreignPacifist: false,
      foreignUnification: true,
      foreignForceSabotage: true,
      foreignOccupyLast: true,
      foreignTrainSpy: true,
      foreignSpyMax: 2,
      foreignPowerRequired: 75,
      foreignPolicyInferior: "Annex",
      foreignPolicySuperior: "Sabotage",
      foreignPolicyRival: "Influence",
    };

    applySettings(def, reset);
  }

  function resetHellSettings(reset) {
    let def = {
      autoHell: false,
      hellHomeGarrison: 10,
      hellMinSoldiers: 20,
      hellMinSoldiersPercent: 90,
      hellAssaultReserve: true,
      hellTargetFortressDamage: 100,
      hellLowWallsMulti: 3,
      hellHandlePatrolSize: true,
      hellPatrolMinRating: 30,
      hellPatrolThreatPercent: 8,
      hellPatrolDroneMod: 5,
      hellPatrolDroidMod: 5,
      hellPatrolBootcampMod: 0,
      hellBolsterPatrolPercentTop: 50,
      hellBolsterPatrolPercentBottom: 20,
      hellBolsterPatrolRating: 300,
      hellAttractorTopThreat: 9000,
      hellAttractorBottomThreat: 6000,
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    };

    applySettings(def, reset);
  }

  function resetGeneralSettings(reset) {
    let def = {
      masterScriptToggle: true,
      showSettings: true,
      autoPrestige: false,
      tickRate: 4,
      tickSchedule: false,
      researchRequest: true,
      researchRequestSpace: false,
      missionRequest: true,
      useDemanded: true,
      prioritizeTriggers: "savereq",
      prioritizeQueue: "savereq",
      prioritizeUnify: "savereq",
      prioritizeOuterFleet: "ignore",
      buildingAlwaysClick: false,
      buildingClickPerTick: 50,
      scriptSettingsExportFilename: "evolve-script-settings.json",
    };

    applySettings(def, reset);
  }

  function resetInterfaceSettings(reset) {
    let def = {
      activeTargetsUI: false,
      buildPlannerUI: true,
      buildPlannerCollapsed: false,
      displayPrestigeTypeInTopBar: true,
      displayTotalDaysTypeInTopBar: false,
      performanceHackAvoidDrawTech: false,
    };

    applySettings(def, reset);
  }

  function resetStateLogSettings(reset) {
    let def = {
      stateLogEnabled: false,
      stateLogAutoDownload: false,
      stateLogInterval: 20,
    };

    applySettings(def, reset);
  }

  function resetAchievementGuardSettings(reset) {
    let def = {
      achievementGuards: false,
      guardPacifist: true,
      guardDreaded: true,
      guardCultOfPersonality: true,
      guardAnarchist: true,
      guardEnergetic: true,
      guardRedDead: true,
      guardSecondEvolution: true,
      guardBananaRepublic: true,
    };

    applySettings(def, reset);
  }

  function resetChallengeHelperSettings(reset) {
    let def = {
      inflationChallengeAssist: true,
      inflationChallengeSaveMinutes: 30,
      retirementChallengeAssist: true,
    };

    applySettings(def, reset);
  }

  function resetPrestigeSettings(reset) {
    let def = {
      prestigeType: "none",
      prestigeMADIgnoreArpa: true,
      prestigeMADWait: true,
      prestigeMADPopulation: 1,
      prestigeWaitAT: false,
      prestigeGECK: 0,
      prestigeBioseedConstruct: true,
      prestigeBioseedProbes: 3,
      prestigeWhiteholeSaveGems: true,
      prestigeWhiteholeMinMass: 8,
      prestigeAscensionPillar: true,
      prestigeCustomRaceMode: "reuse",
      prestigeCustomRacePreset: "0",
      prestigeCustomRacePresets: [
        { name: "General", json: "" },
        { name: "Banana + EMF", json: "" },
        { name: "Cataclysm", json: "" },
      ],
      prestigeDemonicFloor: 100,
      prestigeDemonicPotential: 0.6,
      prestigeDemonicBomb: false,
      prestigeVaxStrat: "none",
    };

    applySettings(def, reset);
  }

  function resetGovernmentSettings(reset) {
    let def = {
      autoTax: false,
      autoGovernment: false,
      generalRequestedTaxRate: -1,
      generalMinimumTaxRate: 20,
      generalMinimumMorale: 105,
      generalMaximumMorale: 500,
      govInterim: GovernmentManager.Types.democracy.id,
      govFinal: GovernmentManager.Types.technocracy.id,
      govSpace: GovernmentManager.Types.corpocracy.id,
      govGovernor: "none",
    };

    applySettings(def, reset);
  }

  function resetAuthoritySettings(reset) {
    const def = {
      authorityManage: true,
      generalMinimumAuthority: 100,
      generalAuthorityMinPatrolPercent: 40,
      buildingWeightingAuthority: 10,
    };

    applySettings(def, reset);
  }

  function resetEvolutionSettings(reset) {
    let def = {
      autoEvolution: false,
      userUniverseTargetName: "none",
      userPlanetTargetName: "none",
      userEvolutionTarget: "auto",
      userEvolutionGenus: "fungi",
      evolutionQueue: [],
      evolutionQueueEnabled: false,
      evolutionQueueRepeat: false,
      evolutionAutoUnbound: true,
      evolutionBackup: false,
    };
    challenges.forEach((set) => (def["challenge_" + set[0].id] = false));

    applySettings(def, reset);
  }

  function resetResearchSettings(reset) {
    let def = {
      autoResearch: false,
      userResearchTheology_1: "auto",
      userResearchTheology_2: "auto",
      researchIgnore: ["tech-purify"],
    };

    applySettings(def, reset);
  }

  function resetMarketSettings(reset) {
    MarketManager.priorityList = Object.values(resources)
      .filter((r) => r.is.tradable)
      .reverse();
    let def = {
      autoMarket: false,
      autoGalaxyMarket: false,
      tradeRouteMinimumMoneyPerSecond: 500,
      tradeRouteMinimumMoneyPercentage: 50,
      tradeRouteSellExcess: true,
      minimumMoney: 0,
      minimumMoneyPercentage: 0,
      marketMinIngredients: 0,
    };

    for (let i = 0; i < MarketManager.priorityList.length; i++) {
      let resource = MarketManager.priorityList[i];
      let id = resource.id;

      def["res_buy_p_" + id] = i; // marketPriority
      def["buy" + id] = false; // autoBuyEnabled
      def["res_buy_r_" + id] = 0.5; // autoBuyRatio
      def["sell" + id] = false; // autoSellEnabled
      def["res_sell_r_" + id] = 0.9; // autoSellRatio
      def["res_trade_buy_" + id] = true; // autoTradeBuyEnabled
      def["res_trade_sell_" + id] = true; // autoTradeSellEnabled
      def["res_trade_w_" + id] = 1; // autoTradeWeighting
      def["res_trade_p_" + id] = 1; // autoTradePriority
    }

    const setTradePriority = (priority, items) =>
      items.forEach((id) => (def["res_trade_p_" + id] = priority));

    setTradePriority(1, ["Food"]);
    setTradePriority(2, ["Helium_3", "Uranium", "Oil", "Coal"]);
    setTradePriority(3, ["Stone", "Chrysotile", "Lumber"]);
    setTradePriority(4, ["Aluminium", "Iron", "Copper"]);
    setTradePriority(5, ["Furs"]);
    setTradePriority(6, ["Cement"]);
    setTradePriority(7, ["Steel"]);
    setTradePriority(8, ["Titanium"]);
    setTradePriority(9, ["Polymer", "Alloy"]);
    setTradePriority(10, ["Iridium"]);
    setTradePriority(-1, ["Crystal"]);

    for (let i = 0; i < poly.galaxyOffers.length; i++) {
      let resource = resources[poly.galaxyOffers[i].buy.res];
      let id = resource.id;

      def["res_galaxy_w_" + id] = 1; // galaxyMarketWeighting
      def["res_galaxy_p_" + id] = i + 1; // galaxyMarketPriority
    }

    applySettings(def, reset);
    MarketManager.sortByPriority();
  }

  function resetStorageSettings(reset) {
    StorageManager.priorityList = Object.values(resources)
      .filter((r) => r.hasStorage())
      .reverse();
    let def = {
      autoStorage: false,
      storageLimitPreMad: true,
      storageSafeReassign: true,
      storageAssignExtra: true,
      storageAssignPart: false,
    };

    for (let i = 0; i < StorageManager.priorityList.length; i++) {
      let resource = StorageManager.priorityList[i];
      let id = resource.id;

      def["res_storage" + id] = true; // autoStorageEnabled
      def["res_storage_p_" + id] = i; // storagePriority
      def["res_storage_o_" + id] = false; // storeOverflow
      def["res_min_store" + id] = 1; // minStorage
      def["res_max_store" + id] = -1; // maxStorage
    }

    // Enable overflow for endgame resources
    def["res_storage_o_" + resources.Orichalcum.id] = true;
    def["res_storage_o_" + resources.Vitreloy.id] = true;
    def["res_storage_o_" + resources.Bolognium.id] = true;

    applySettings(def, reset);
    StorageManager.sortByPriority();
  }

  function resetMinorTraitSettings(reset) {
    MinorTraitManager.priorityList = (
      Object.entries(game.traits) as [string, Loose][]
    )
      .filter(
        ([id, trait]) =>
          trait.type === "minor" || id === "mastery" || id === "fortify",
      )
      .map(([id, trait]) => new MinorTrait(id));

    let def = {
      autoMinorTrait: false,
      shifterGenus: "ignore",
      imitateRace: "ignore",
      buildingShrineType: "know",
      slaveIncome: 25000,
      jobScalePop: true,
      psychicPower: "auto",
      psychicBoostRes: "auto",
      wishMinor: "none",
      wishMajor: "none",

      autoGenetics: false,
      geneticsSequence: "none",
      geneticsBoost: "none",
      geneticsAssemble: "auto",
    };

    for (let i = 0; i < MinorTraitManager.priorityList.length; i++) {
      let trait = MinorTraitManager.priorityList[i];
      let id = trait.traitName;

      def["mTrait_" + id] = true; // enabled
      def["mTrait_p_" + id] = i; // priority
      def["mTrait_w_" + id] = 1; // weighting
    }

    Object.values(ocularPowerData).forEach((v) => {
      def["ocularPower_" + v.id] = true;
      def["ocularPower_p_" + v.id] = 100;
    });

    applySettings(def, reset);
    MinorTraitManager.sortByPriority();
  }

  function resetMutableTraitSettings(reset) {
    let unobtainableTraits = ["xenophobic", "rigid", "soul_eater"];
    MutableTraitManager.priorityList = (
      Object.entries(game.traits) as [string, Loose][]
    )
      .filter(
        ([id, trait]) =>
          (trait.type === "major" || trait.type === "genus") &&
          !unobtainableTraits.includes(id),
      )
      .map(([id, trait]) =>
        trait.type === "major" ? new MajorTrait(id) : new GenusTrait(id),
      )
      .sort(
        (a, b) =>
          (Object.keys(poly.genus_traits).indexOf(a.genus) -
            Object.keys(poly.genus_traits).indexOf(b.genus) ||
            a.type < b.type) as Loose,
      );

    let def = {
      autoMutateTraits: false,
      doNotGoBelowPlasmidSoftcap: true,
      minimumPlasmidsToPreserve: 0,
    };

    for (let i = 0; i < MutableTraitManager.priorityList.length; i++) {
      let trait = MutableTraitManager.priorityList[i];
      let id = trait.traitName;

      def["mutableTrait_p_" + id] = i; // priority
      def["mutableTrait_purge_" + id] = false; // auto remove disabled

      if (trait.isGainable()) {
        def["mutableTrait_gain_" + id] = false; // auto add disabled
      }
      if (poly.neg_roll_traits.includes(id)) {
        def["mutableTrait_reset_" + id] = false; // auto reset disabled
      }
    }

    applySettings(def, reset);
    MutableTraitManager.sortByPriority();
  }

  function resetJobSettings(reset) {
    JobManager.priorityList = Object.values(jobs);
    let def = {
      autoJobs: false,
      autoCraftsmen: false,
      jobSetDefault: true,
      jobManageServants: true,
      jobLumberWeighting: 50,
      jobQuarryWeighting: 50,
      jobCrystalWeighting: 50,
      jobScavengerWeighting: 5,
      jobRaiderWeighting: 20,
      jobForagerWeighting: 50,
      jobDisableMiners: true,
    };

    for (let i = 0; i < JobManager.priorityList.length; i++) {
      let job = JobManager.priorityList[i];
      let id = job._originalId;

      def["job_" + id] = true; // autoJobEnabled
      def["job_p_" + id] = i; // priority

      if (job.is.smart) {
        def["job_s_" + id] = true; // smart
      }
    }

    const setBreakpoints = (job, b1, b2, b3) => {
      // breakpoins
      def["job_b1_" + job._originalId] = b1;
      def["job_b2_" + job._originalId] = b2;
      def["job_b3_" + job._originalId] = b3;
    };
    setBreakpoints(jobs.Colonist, -1, -1, -1);
    setBreakpoints(jobs.Teamster, 10, -1, -1);
    setBreakpoints(jobs.Meditator, -1, -1, -1);
    setBreakpoints(jobs.Hunter, -1, -1, -1);
    setBreakpoints(jobs.Farmer, -1, -1, -1);
    setBreakpoints(jobs.Forager, 4, 10, 0);
    setBreakpoints(jobs.Lumberjack, 4, 10, 0);
    setBreakpoints(jobs.QuarryWorker, 4, 10, 0);
    setBreakpoints(jobs.CrystalMiner, 2, 5, 0);
    setBreakpoints(jobs.Scavenger, 0, 0, 0);

    setBreakpoints(jobs.TitanColonist, -1, -1, -1);
    setBreakpoints(jobs.PitMiner, 1, 12, -1);
    setBreakpoints(jobs.Miner, 3, 5, -1);
    setBreakpoints(jobs.CoalMiner, 2, 4, -1);
    setBreakpoints(jobs.CementWorker, 4, 8, -1);
    setBreakpoints(jobs.Professor, 6, 10, -1);
    setBreakpoints(jobs.Scientist, 3, 6, -1);
    setBreakpoints(jobs.Entertainer, 2, 5, -1);
    setBreakpoints(jobs.HellSurveyor, 1, 1, -1);
    setBreakpoints(jobs.SpaceMiner, 1, 3, -1);
    setBreakpoints(jobs.Torturer, 1, 1, -1);
    setBreakpoints(jobs.Archaeologist, 1, 1, -1);
    setBreakpoints(jobs.GhostTrapper, 1, 1, -1);
    setBreakpoints(jobs.ElysiumMiner, 1, 1, -1);
    setBreakpoints(jobs.Banker, 3, 5, -1);
    setBreakpoints(jobs.Priest, 0, 0, -1);
    setBreakpoints(jobs.Unemployed, 0, 0, 0);

    applySettings(def, reset);
    JobManager.sortByPriority();
  }

  function resetWeightingSettings(reset) {
    let def = {
      buildingBuildIfStorageFull: false,
      buildingWeightingNew: 3,
      buildingWeightingUselessPowerPlant: 0.01,
      buildingWeightingNeedfulPowerPlant: 3,
      buildingWeightingUnderpowered: 0.8,
      buildingWeightingUselessKnowledge: 0.01,
      buildingWeightingNeedfulKnowledge: 5,
      buildingWeightingMissingFuel: 10,
      buildingWeightingNonOperatingCity: 0.2,
      buildingWeightingNonOperating: 0,
      buildingWeightingMissingSupply: 0,
      buildingWeightingMissingSupport: 0,
      buildingWeightingUselessSupport: 0.01,
      buildingWeightingMADUseless: 0,
      buildingWeightingUnusedEjectors: 0.1,
      buildingWeightingCrateUseless: 0.01,
      buildingWeightingHorseshoeUseless: 0.1,
      buildingWeightingZenUseless: 0.01,
      buildingWeightingGateTurret: 0.01,
      buildingWeightingNeedStorage: 1,
      buildingWeightingUselessHousing: 1,
      buildingWeightingTemporal: 0.2,
      buildingWeightingSolar: 0.2,
      buildingWeightingOverlord: 0,
      buildingWeightingBananaObjective: 2,
      buildingWeightingInflationMoney: 2,
      buildingWeightingRetirementPrep: 10,
      buildingWeightingTruepathDigsite: 10,
    };

    applySettings(def, reset);
  }

  function resetBuildingSettings(reset) {
    initBuildingState();
    let def = {
      autoBuild: false,
      autoPower: false,
      buildingsIgnoreZeroRate: false,
      buildingsLimitPowered: true,
      buildingTowerSuppression: 100,
      buildingConsumptionCheck: "perResource",
      buildingsTransportGem: false,
      buildingsBestFreighter: false,
      buildingsUseMultiClick: false,
      buildingEnabledAll: true,
      buildingStateAll: true,
    };

    for (let i = 0; i < BuildingManager.priorityList.length; i++) {
      let building = BuildingManager.priorityList[i];
      let id = building._vueBinding;

      def["bat" + id] = true; // autoBuildEnabled
      def["bld_p_" + id] = i; // priority
      def["bld_m_" + id] = -1; // _autoMax
      def["bld_w_" + id] = 100; // _weighting

      if (building.isSwitchable()) {
        def["bld_s_" + id] = true; // autoStateEnabled
      }
      if (building.is.smart) {
        def["bld_s2_" + id] = true; // autoStateSmart
      }
    }
    // Moon smart is disabled by default
    def["bld_s2_space-iridium_mine"] = false;
    def["bld_s2_space-helium_mine"] = false;

    // AutoBuild disabled by default for early(ish) buildings consuming Soul Gems, Blood Stones and Plasmids
    // Same for Womling interaction action, and Gas names, as they are mutualy exclusive
    [
      "RedVrCenter",
      "NeutronCitadel",
      "PortalWarDroid",
      "BadlandsPredatorDrone",
      "PortalRepairDroid",
      "SpireWaygate",
      "TauRedContact",
      "TauRedIntroduce",
      "TauRedSubjugate",
      "TauGasName1",
      "TauGasName2",
      "TauGasName3",
      "TauGasName4",
      "TauGasName5",
      "TauGasName6",
      "TauGasName7",
      "TauGasName8",
      "TauGas2Name1",
      "TauGas2Name2",
      "TauGas2Name3",
      "TauGas2Name4",
      "TauGas2Name5",
      "TauGas2Name6",
      "TauGas2Name7",
      "TauGas2Name8",
    ].forEach((b) => (def["bat" + buildings[b]._vueBinding] = false));

    // Limit max for belt ships, and horseshoes
    def["bld_m_" + buildings.ForgeHorseshoe._vueBinding] = 20;
    def["bld_m_" + buildings.RedForgeHorseshoe._vueBinding] = 20;
    def["bld_m_" + buildings.TauForgeHorseshoe._vueBinding] = 20;
    def["bld_m_" + buildings.BeltEleriumShip._vueBinding] = 15;
    def["bld_m_" + buildings.BeltIridiumShip._vueBinding] = 15;

    applySettings(def, reset);
    BuildingManager.sortByPriority();
  }

  function resetProjectSettings(reset) {
    ProjectManager.priorityList = Object.values(projects);
    let def = {
      autoARPA: false,
      arpaScaleWeighting: true,
      arpaStep: 5,
    };

    let projectPriority = 0;
    const setProject = (item, autoBuildEnabled, _autoMax, _weighting) => {
      let id = projects[item].id;
      def["arpa_" + id] = autoBuildEnabled;
      def["arpa_p_" + id] = projectPriority++;
      def["arpa_m_" + id] = _autoMax;
      def["arpa_w_" + id] = _weighting;
    };
    setProject("LaunchFacility", true, -1, 100);
    setProject("SuperCollider", true, -1, 5);
    setProject("StockExchange", true, -1, 0.5);
    setProject("Monument", true, -1, 1);
    setProject("Railway", true, -1, 0.1);
    setProject("Nexus", true, -1, 1);
    setProject("RoidEject", true, -1, 1);
    setProject("ManaSyphon", false, 79, 1);
    setProject("Depot", true, -1, 1);

    applySettings(def, reset);
    ProjectManager.sortByPriority();
  }

  function resetMagicSettings(reset) {
    AlchemyManager.priorityList = Object.values(resources).filter(
      (r) => AlchemyManager.transmuteTier(r) > 0,
    );
    let def = {
      autoAlchemy: false,
      autoPylon: false,
      magicFullmetalHelper: true,
      magicAlchemyManaUse: 0.5,
      productionRitualManaUse: 0.5,
      productionRitualSafe: true,
    };

    // Alchemy
    for (let i = 0; i < AlchemyManager.priorityList.length; i++) {
      let resource = AlchemyManager.priorityList[i];
      let id = resource.id;

      def["res_alchemy_" + id] = true; // resEnabled
      def["res_alchemy_w_" + id] = 0; // resWeighting
    }

    // Pylon
    for (let spell of Object.values(RitualManager.Productions) as Loose[]) {
      def["spell_w_" + spell.id] = 100; // weighting
    }
    def["spell_w_hunting"] = 10;
    def["spell_w_farmer"] = 1;

    applySettings(def, reset);
  }

  function resetProductionSettings(reset) {
    let def = {
      autoQuarry: false,
      autoMine: false,
      autoExtractor: false,
      autoGraphenePlant: false,
      autoSmelter: false,
      autoCraft: false,
      autoFactory: false,
      autoMiningDroid: false,
      autoReplicator: false,
      productionChrysotileWeight: 2,
      productionAdamantiteWeight: 1,
      productionExtWeight_common: 1,
      productionExtWeight_uncommon: 1,
      productionExtWeight_rare: 1,
      productionFoundryWeighting: "demanded",
      productionCraftsmen: "nocraft",
      productionSmelting: "required",
      productionSmeltingIridium: 0.5,
      productionFactoryWeighting: "none",
      productionFactoryMinIngredients: 0,
      productionFactoryFocusMaterials: false,
      replicatorAssignGovernorTask: true,
      replicatorWeightingMode: "mass",
    };

    // Foundry
    const setFoundryProduct = (
      item,
      autoCraftEnabled,
      crafterEnabled,
      craftWeighting,
      craftPreserve,
    ) => {
      let id = resources[item].id;
      def["craft" + id] = autoCraftEnabled;
      def["job_" + id] = crafterEnabled;
      def["foundry_w_" + id] = craftWeighting;
      def["foundry_p_" + id] = craftPreserve;
    };
    setFoundryProduct("Plywood", true, true, 1, 0);
    setFoundryProduct("Brick", true, true, 1, 0);
    setFoundryProduct("Wrought_Iron", true, true, 1, 0);
    setFoundryProduct("Sheet_Metal", true, true, 2, 0);
    setFoundryProduct("Mythril", true, true, 3, 0);
    setFoundryProduct("Aerogel", true, true, 3, 0);
    setFoundryProduct("Nanoweave", true, true, 10, 0);
    setFoundryProduct("Scarletite", true, true, 1, 0);
    setFoundryProduct("Quantium", true, true, 1, 0);

    // Smelter
    (Object.values(SmelterManager.Fuels) as Loose[]).forEach((fuel, i) => {
      def["smelter_fuel_p_" + fuel.id] = i; // priority
    });

    // Factory
    const setFactoryProduct = (item, enabled, weighting, priority) => {
      let id = FactoryManager.Productions[item].resource.id;
      def["production_" + id] = enabled;
      def["production_w_" + id] = weighting;
      def["production_p_" + id] = priority;
    };
    setFactoryProduct("LuxuryGoods", true, 1, 2);
    setFactoryProduct("Furs", true, 1, 1);
    setFactoryProduct("Alloy", true, 1, 3);
    setFactoryProduct("Polymer", true, 1, 3);
    setFactoryProduct("NanoTube", true, 4, 3);
    setFactoryProduct("Stanene", true, 4, 3);

    // Mining Droids
    const setDroidProduct = (item, weighting, priority) => {
      let id = DroidManager.Productions[item].resource.id;
      def["droid_w_" + id] = weighting;
      def["droid_pr_" + id] = priority;
    };
    setDroidProduct("Adamantite", 15, 1);
    setDroidProduct("Aluminium", 1, 1);
    setDroidProduct("Uranium", 5, -1);
    setDroidProduct("Coal", 5, -1);

    // Matter Replicator
    const setReplicatorProduct = (item, enabled, weighting, priority) => {
      let id = ReplicatorManager.Productions[item].id;
      def["replicator_" + id] = enabled;
      def["replicator_w_" + id] = weighting;
      def["replicator_p_" + id] = priority;
    };
    (Object.values(ReplicatorManager.Productions) as Loose[]).forEach(
      (production) => setReplicatorProduct(production.id, true, 1, 1),
    );

    applySettings(def, reset);
  }

  function resetTriggerSettings(reset) {
    let def = {
      autoTrigger: false,
    };

    // Add default triggers only on reset, or first run, but not on casual update
    if (reset || !settingsRaw.hasOwnProperty("autoTrigger")) {
      TriggerManager.priorityList = [];
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_mission",
        1,
        "build",
        "space-moon_base",
        1,
      );
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_base",
        1,
        "build",
        "space-iridium_mine",
        1,
      );
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_base",
        1,
        "build",
        "space-helium_mine",
        1,
      );
      settingsRaw.triggers = JSON.parse(
        JSON.stringify(TriggerManager.priorityList),
      );
    }
    applySettings(def, reset);
  }

  function resetLoggingSettings(reset) {
    let def = {
      hellTurnOffLogMessages: true,
      logFilter: "",
      logEnabled: true,
    };
    Object.keys(GameLog.Types).forEach((id) => (def["log_" + id] = true));
    def["log_mercenary"] = false;
    def["log_multi_construction"] = false;
    def["log_prestige"] = false;
    def["log_prestige_format"] =
      "Reset: {resetType}, Species: {species}, Duration: {timeStamp} days";

    applySettings(def, reset);
  }

  function resetPlanetSettings(reset) {
    let def = {};
    biomeList.forEach(
      (biome) =>
        (def["biome_w_" + biome] =
          (planetBiomes.length - planetBiomes.indexOf(biome)) * 10),
    );
    traitList.forEach(
      (trait) =>
        (def["trait_w_" + trait] =
          (planetTraits.length - planetTraits.indexOf(trait)) * 10),
    );
    extraList.forEach((extra) => (def["extra_w_" + extra] = 0));
    def["extra_w_Achievement"] = 1000;

    applySettings(def, reset);
  }

  function resetFleetSettings(reset) {
    let def = {
      autoFleet: false,
      fleetOuterCrew: 30,
      fleetOuterShips: "custom",
      fleetExploreTau: true,
      fleetMaxCover: true,
      fleetCrewReclaim: true,
      fleetEmbassyKnowledge: 6000000,
      fleetAlienGiftKnowledge: 6500000,
      fleetAlien2Knowledge: 8000000,
      fleetAlien2Loses: "none",
      fleetChthonianLoses: "low",

      // Default combat ship
      fleet_outer_class: "destroyer",
      fleet_outer_armor: "neutronium",
      fleet_outer_weapon: "plasma",
      fleet_outer_engine: "ion",
      fleet_outer_power: "fission",
      fleet_outer_sensor: "lidar",

      // Default scout ship
      fleet_scout_class: "corvette",
      fleet_scout_armor: "neutronium",
      fleet_scout_weapon: "plasma",
      fleet_scout_engine: "tie",
      fleet_scout_power: "fusion",
      fleet_scout_sensor: "quantum",

      // Default andromeda regions priority
      fleet_pr_gxy_stargate: 0,
      fleet_pr_gxy_alien2: 1,
      fleet_pr_gxy_alien1: 2,
      fleet_pr_gxy_chthonian: 3,
      fleet_pr_gxy_gateway: 4,
      fleet_pr_gxy_gorddon: 5,
    };

    const setOuterRegion = (id, weighting, protect, scouts) => {
      def["fleet_outer_pr_" + id] = weighting;
      def["fleet_outer_def_" + id] = protect;
      def["fleet_outer_sc_" + id] = scouts;
    };
    setOuterRegion("spc_moon", 1, 0.9, 0); // Iridium
    setOuterRegion("spc_red", 3, 0.9, 0); // Titanium
    setOuterRegion("spc_gas", 0, 0.9, 0); // Helium
    setOuterRegion("spc_gas_moon", 0, 0.9, 0); // Oil
    setOuterRegion("spc_belt", 1, 0.9, 0); // Iridium
    setOuterRegion("spc_titan", 5, 0.9, 1); // Adamantite
    setOuterRegion("spc_enceladus", 3, 0.9, 1); // Quantium
    setOuterRegion("spc_triton", 10, 0.95, 2); // Encrypted data
    setOuterRegion("spc_kuiper", 5, 0.9, 2); // Orichalcum
    setOuterRegion("spc_eris", 100, 0.01, 1); // Encrypted data

    applySettings(def, reset);
  }

  function resetMechSettings(reset) {
    let def = {
      autoMech: false,
      mechScrap: "mixed",
      mechScrapEfficiency: 1.5,
      mechCollectorValue: 0.5,
      mechBuild: "random",
      mechSize: "titan",
      mechSizeGravity: "auto",
      mechFillBay: true,
      mechScouts: 0.05,
      mechScoutsRebuild: false,
      mechMinSupply: 1000,
      mechMaxCollectors: 0.5,
      mechInfernalCollector: true,
      mechSpecial: "prefered",
      mechSaveSupplyRatio: 1,
      buildingMechsFirst: true,
      mechBaysFirst: true,
      mechWaygatePotential: 0.4,
    };

    applySettings(def, reset);
  }

  function resetEjectorSettings(reset) {
    if (game.global.race.universe === "magic") {
      EjectManager.priorityList = Object.values(resources)
        .filter((r) => EjectManager.isConsumable(r))
        .sort((a, b) => b.atomicMass - a.atomicMass);
    } else {
      EjectManager.priorityList = Object.values(resources)
        .filter(
          (r) =>
            EjectManager.isConsumable(r) &&
            r !== resources.Elerium &&
            r !== resources.Infernite,
        )
        .sort((a, b) => b.atomicMass - a.atomicMass);
      EjectManager.priorityList.unshift(resources.Infernite);
      EjectManager.priorityList.unshift(resources.Elerium);
    }

    SupplyManager.priorityList = Object.values(resources)
      .filter((r) => SupplyManager.isConsumable(r))
      .sort(
        (a, b) => SupplyManager.supplyIn(b.id) - SupplyManager.supplyIn(a.id),
      );

    NaniteManager.priorityList = Object.values(resources)
      .filter((r) => NaniteManager.isConsumable(r))
      .sort((a, b) => b.atomicMass - a.atomicMass);

    let def = {
      autoEject: false,
      autoSupply: false,
      autoNanite: false,
      ejectMode: "cap",
      supplyMode: "mixed",
      naniteMode: "full",
      prestigeWhiteholeStabiliseMass: true,
      prestigeWhiteholeStabiliseCooldown: 120,
    };

    for (let resource of EjectManager.priorityList) {
      def["res_eject" + resource.id] = resource.is.tradable ?? false;
    }
    for (let resource of SupplyManager.priorityList) {
      def["res_supply" + resource.id] = resource.is.tradable ?? false;
    }
    for (let resource of NaniteManager.priorityList) {
      def["res_nanite" + resource.id] = resource.is.tradable ?? false;
    }

    def["res_eject" + resources.Elerium.id] = true;
    def["res_eject" + resources.Infernite.id] = true;

    applySettings(def, reset);
  }

  return {
    resetWarSettings,
    resetHellSettings,
    resetGeneralSettings,
    resetInterfaceSettings,
    resetStateLogSettings,
    resetAchievementGuardSettings,
    resetChallengeHelperSettings,
    resetPrestigeSettings,
    resetGovernmentSettings,
    resetAuthoritySettings,
    resetEvolutionSettings,
    resetResearchSettings,
    resetMarketSettings,
    resetStorageSettings,
    resetMinorTraitSettings,
    resetMutableTraitSettings,
    resetJobSettings,
    resetWeightingSettings,
    resetBuildingSettings,
    resetProjectSettings,
    resetMagicSettings,
    resetProductionSettings,
    resetTriggerSettings,
    resetLoggingSettings,
    resetPlanetSettings,
    resetFleetSettings,
    resetMechSettings,
    resetEjectorSettings,
  };
}
