// Pure default-settings tables.
//
// Each `computeXDefaults` function returns the default `def` record for one settings
// section, plus — for sections that own a manager priority list — the ordered ids that
// list must be rebuilt to before the defaults apply. These functions perform no live
// reads: every game catalog a section consults arrives normalized on its context, and
// the returned plan is applied to the record + managers by the application layer.
//
// Faithful port of the legacy getter-bag `reset-settings.ts`; the values below match it
// verbatim and the ordering quirks are preserved deliberately.

import {
  DEFAULT_VACUUM_MANA_REQUIREMENT,
  DEFAULT_VACUUM_WEIGHTING_MULTIPLIER,
} from "./progression/prestige/vacuum.ts";

/** Managers whose priority list a reset rebuilds. */
export type PriorityManagerKey =
  | "market"
  | "storage"
  | "job"
  | "building"
  | "minorTrait"
  | "mutableTrait"
  | "project"
  | "alchemy"
  | "eject"
  | "supply"
  | "nanite";

/** A manager priority list to install before applying defaults, and whether to re-sort after. */
export interface PriorityOrder {
  readonly manager: PriorityManagerKey;
  readonly ids: readonly string[];
  /** Call `sortByPriority` on the manager after the defaults are applied. */
  readonly sort: boolean;
}

/** The default record for a section plus any priority lists it owns. */
export interface ResetPlan {
  readonly def: Record<string, unknown>;
  readonly priorityOrders?: readonly PriorityOrder[];
}

// ---- Pure record-only sections (no live catalog, no manager priority list) ----

export function computeWarDefaults(): ResetPlan {
  return {
    def: {
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
    },
  };
}

export function computeHellDefaults(): ResetPlan {
  return {
    def: {
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
    },
  };
}

export function computeGeneralDefaults(): ResetPlan {
  return {
    def: {
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
    },
  };
}

export function computeInterfaceDefaults(): ResetPlan {
  return {
    def: {
      activeTargetsUI: false,
      buildPlannerUI: true,
      buildPlannerCollapsed: false,
      displayPrestigeTypeInTopBar: true,
      displayTotalDaysTypeInTopBar: false,
      performanceHackAvoidDrawTech: false,
    },
  };
}

export function computeStateLogDefaults(): ResetPlan {
  return {
    def: {
      stateLogEnabled: false,
      stateLogAutoDownload: false,
      stateLogInterval: 20,
    },
  };
}

export function computeAchievementGuardDefaults(): ResetPlan {
  return {
    def: {
      achievementGuards: false,
      guardPacifist: true,
      guardDreaded: true,
      guardCultOfPersonality: true,
      guardAnarchist: true,
      guardEnergetic: true,
      guardRedDead: true,
      guardSecondEvolution: true,
      guardWorldDomination: true,
      guardSyndicate: true,
      guardTradeFederation: true,
      guardBananaRepublic: true,
    },
  };
}

export function computeChallengeHelperDefaults(): ResetPlan {
  return {
    def: {
      inflationChallengeAssist: true,
      inflationChallengeSaveMinutes: 30,
      retirementChallengeAssist: true,
    },
  };
}

export function computePrestigeDefaults(): ResetPlan {
  return {
    def: {
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
      prestigeVacuumMana: DEFAULT_VACUUM_MANA_REQUIREMENT,
    },
  };
}

export function computeAuthorityDefaults(): ResetPlan {
  return {
    def: {
      authorityManage: true,
      generalMinimumAuthority: 100,
      generalAuthorityMinPatrolPercent: 40,
      buildingWeightingAuthority: 10,
    },
  };
}

export function computeResearchDefaults(): ResetPlan {
  return {
    def: {
      autoResearch: false,
      userResearchTheology_1: "auto",
      userResearchTheology_2: "auto",
      researchIgnore: ["tech-purify"],
    },
  };
}

export function computeWeightingDefaults(): ResetPlan {
  return {
    def: {
      buildingBuildIfStorageFull: false,
      buildingWeightingNew: 3,
      buildingWeightingVacuumCollapse: DEFAULT_VACUUM_WEIGHTING_MULTIPLIER,
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
    },
  };
}

export function computeFleetDefaults(): ResetPlan {
  const def: Record<string, unknown> = {
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

  const setOuterRegion = (
    id: string,
    weighting: number,
    protect: number,
    scouts: number,
  ) => {
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

  return { def };
}

export function computeMechDefaults(): ResetPlan {
  return {
    def: {
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
    },
  };
}

// ---- Sections reading a narrow live catalog ----

export interface GovernmentResetContext {
  readonly democracyId: string;
  readonly technocracyId: string;
  readonly corpocracyId: string;
}

export function computeGovernmentDefaults(
  context: GovernmentResetContext,
): ResetPlan {
  return {
    def: {
      autoTax: false,
      autoGovernment: false,
      generalRequestedTaxRate: -1,
      generalMinimumTaxRate: 20,
      generalMinimumMorale: 105,
      generalMaximumMorale: 500,
      govInterim: context.democracyId,
      govFinal: context.technocracyId,
      govSpace: context.corpocracyId,
      govGovernor: "none",
    },
  };
}

export interface EvolutionResetContext {
  /** Challenge ids (`challenges.map((set) => set[0].id)`). */
  readonly challengeIds: readonly string[];
}

export function computeEvolutionDefaults(
  context: EvolutionResetContext,
): ResetPlan {
  const def: Record<string, unknown> = {
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
  context.challengeIds.forEach((id) => (def["challenge_" + id] = false));
  return { def };
}

export interface LoggingResetContext {
  /** `Object.keys(GameLog.Types)`. */
  readonly gameLogTypeIds: readonly string[];
}

export function computeLoggingDefaults(
  context: LoggingResetContext,
): ResetPlan {
  const def: Record<string, unknown> = {
    hellTurnOffLogMessages: true,
    logFilter: "",
    logEnabled: true,
  };
  context.gameLogTypeIds.forEach((id) => (def["log_" + id] = true));
  def["log_mercenary"] = false;
  def["log_multi_construction"] = false;
  def["log_prestige"] = false;
  def["log_prestige_format"] =
    "Reset: {resetType}, Species: {species}, Duration: {timeStamp} days";
  return { def };
}

export interface PlanetResetContext {
  readonly biomeList: readonly string[];
  readonly planetBiomes: readonly string[];
  readonly traitList: readonly string[];
  readonly planetTraits: readonly string[];
  readonly extraList: readonly string[];
}

export function computePlanetDefaults(context: PlanetResetContext): ResetPlan {
  const { biomeList, planetBiomes, traitList, planetTraits, extraList } =
    context;
  const def: Record<string, unknown> = {};
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
  return { def };
}

// ---- Sections owning a manager priority list ----

export interface MarketResetContext {
  /** Tradable resource ids in `Object.values(resources)` order (compute reverses). */
  readonly tradableResourceIds: readonly string[];
  /** Resource ids behind each galaxy offer, in `poly.galaxyOffers` order. */
  readonly galaxyOfferResourceIds: readonly string[];
}

export function computeMarketDefaults(context: MarketResetContext): ResetPlan {
  const priorityIds = [...context.tradableResourceIds].reverse();
  const def: Record<string, unknown> = {
    autoMarket: false,
    autoGalaxyMarket: false,
    tradeRouteMinimumMoneyPerSecond: 500,
    tradeRouteMinimumMoneyPercentage: 50,
    tradeRouteSellExcess: true,
    minimumMoney: 0,
    minimumMoneyPercentage: 0,
    marketMinIngredients: 0,
  };

  priorityIds.forEach((id, i) => {
    def["res_buy_p_" + id] = i; // marketPriority
    def["buy" + id] = false; // autoBuyEnabled
    def["res_buy_r_" + id] = 0.5; // autoBuyRatio
    def["sell" + id] = false; // autoSellEnabled
    def["res_sell_r_" + id] = 0.9; // autoSellRatio
    def["res_trade_buy_" + id] = true; // autoTradeBuyEnabled
    def["res_trade_sell_" + id] = true; // autoTradeSellEnabled
    def["res_trade_w_" + id] = 1; // autoTradeWeighting
    def["res_trade_p_" + id] = 1; // autoTradePriority
  });

  const setTradePriority = (priority: number, items: string[]) =>
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

  context.galaxyOfferResourceIds.forEach((id, i) => {
    def["res_galaxy_w_" + id] = 1; // galaxyMarketWeighting
    def["res_galaxy_p_" + id] = i + 1; // galaxyMarketPriority
  });

  return {
    def,
    priorityOrders: [{ manager: "market", ids: priorityIds, sort: true }],
  };
}

export interface StorageResetContext {
  /** Resource ids with storage in `Object.values(resources)` order (compute reverses). */
  readonly storableResourceIds: readonly string[];
  readonly orichalcumId: string;
  readonly vitreloyId: string;
  readonly bolognumId: string;
}

export function computeStorageDefaults(
  context: StorageResetContext,
): ResetPlan {
  const priorityIds = [...context.storableResourceIds].reverse();
  const def: Record<string, unknown> = {
    autoStorage: false,
    storageLimitPreMad: true,
    storageSafeReassign: true,
    storageAssignExtra: true,
    storageAssignPart: false,
  };

  priorityIds.forEach((id, i) => {
    def["res_storage" + id] = true; // autoStorageEnabled
    def["res_storage_p_" + id] = i; // storagePriority
    def["res_storage_o_" + id] = false; // storeOverflow
    def["res_min_store" + id] = 1; // minStorage
    def["res_max_store" + id] = -1; // maxStorage
  });

  // Enable overflow for endgame resources
  def["res_storage_o_" + context.orichalcumId] = true;
  def["res_storage_o_" + context.vitreloyId] = true;
  def["res_storage_o_" + context.bolognumId] = true;

  return {
    def,
    priorityOrders: [{ manager: "storage", ids: priorityIds, sort: true }],
  };
}

export interface MinorTraitResetContext {
  /** Minor-trait names (minor traits plus `mastery`/`fortify`) in `game.traits` order. */
  readonly traitNames: readonly string[];
  /** `Object.values(ocularPowerData).map((v) => v.id)`. */
  readonly ocularPowerIds: readonly string[];
}

export function computeMinorTraitDefaults(
  context: MinorTraitResetContext,
): ResetPlan {
  const def: Record<string, unknown> = {
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

  context.traitNames.forEach((id, i) => {
    def["mTrait_" + id] = true; // enabled
    def["mTrait_p_" + id] = i; // priority
    def["mTrait_w_" + id] = 1; // weighting
  });

  context.ocularPowerIds.forEach((id) => {
    def["ocularPower_" + id] = true;
    def["ocularPower_p_" + id] = 100;
  });

  return {
    def,
    priorityOrders: [
      { manager: "minorTrait", ids: context.traitNames, sort: true },
    ],
  };
}

export interface MutableTraitDescriptor {
  readonly traitName: string;
  readonly type: "major" | "genus";
  readonly genus: string;
  readonly isGainable: boolean;
  /** `poly.neg_roll_traits.includes(traitName)`. */
  readonly isNegRoll: boolean;
}

export interface MutableTraitResetContext {
  /** Major/genus traits (unobtainable excluded), constructed but unsorted, in `game.traits` order. */
  readonly traits: readonly MutableTraitDescriptor[];
  /** `Object.keys(poly.genus_traits)` — the genus sort order. */
  readonly genusOrder: readonly string[];
}

export function computeMutableTraitDefaults(
  context: MutableTraitResetContext,
): ResetPlan {
  const { genusOrder } = context;
  const sorted = [...context.traits].sort((a, b) => {
    const byGenus = genusOrder.indexOf(a.genus) - genusOrder.indexOf(b.genus);
    // Legacy comparator: `byGenus || (a.type < b.type)`, where the boolean
    // fallback coerces to 0/1 under Array.sort. Preserve it exactly.
    return byGenus || (a.type < b.type ? 1 : 0);
  });

  const def: Record<string, unknown> = {
    autoMutateTraits: false,
    doNotGoBelowPlasmidSoftcap: true,
    minimumPlasmidsToPreserve: 0,
  };

  sorted.forEach((trait, i) => {
    const id = trait.traitName;
    def["mutableTrait_p_" + id] = i; // priority
    def["mutableTrait_purge_" + id] = false; // auto remove disabled

    if (trait.isGainable) {
      def["mutableTrait_gain_" + id] = false; // auto add disabled
    }
    if (trait.isNegRoll) {
      def["mutableTrait_reset_" + id] = false; // auto reset disabled
    }
  });

  return {
    def,
    priorityOrders: [
      {
        manager: "mutableTrait",
        ids: sorted.map((trait) => trait.traitName),
        sort: true,
      },
    ],
  };
}

export interface JobResetContext {
  /** Jobs in `Object.values(jobs)` order. `key` is the `jobs` map key. */
  readonly jobs: readonly {
    readonly key: string;
    readonly originalId: string;
    readonly isSmart: boolean;
  }[];
}

export function computeJobDefaults(context: JobResetContext): ResetPlan {
  const priorityIds = context.jobs.map((job) => job.originalId);
  const originalIdByKey: Record<string, string> = {};
  context.jobs.forEach((job) => (originalIdByKey[job.key] = job.originalId));

  const def: Record<string, unknown> = {
    autoJobs: false,
    autoCraftsmen: false,
    jobSetDefault: true,
    jobManageServants: true,
    // Civilians kept out of ship crew and available for jobs. Absolute count
    // ("800") or a percentage of population ("50%"). "0" = disabled.
    crewReserve: "0",
    jobLumberWeighting: 50,
    jobQuarryWeighting: 50,
    jobCrystalWeighting: 50,
    jobScavengerWeighting: 5,
    jobRaiderWeighting: 20,
    jobForagerWeighting: 50,
    jobDisableMiners: true,
  };

  context.jobs.forEach((job, i) => {
    const id = job.originalId;
    def["job_" + id] = true; // autoJobEnabled
    def["job_p_" + id] = i; // priority

    if (job.isSmart) {
      def["job_s_" + id] = true; // smart
    }
  });

  const setBreakpoints = (key: string, b1: number, b2: number, b3: number) => {
    const originalId = originalIdByKey[key];
    def["job_b1_" + originalId] = b1;
    def["job_b2_" + originalId] = b2;
    def["job_b3_" + originalId] = b3;
  };
  setBreakpoints("Colonist", -1, -1, -1);
  setBreakpoints("Teamster", 10, -1, -1);
  setBreakpoints("Meditator", -1, -1, -1);
  setBreakpoints("Hunter", -1, -1, -1);
  setBreakpoints("Farmer", -1, -1, -1);
  setBreakpoints("Forager", 4, 10, 0);
  setBreakpoints("Lumberjack", 4, 10, 0);
  setBreakpoints("QuarryWorker", 4, 10, 0);
  setBreakpoints("CrystalMiner", 2, 5, 0);
  setBreakpoints("Scavenger", 0, 0, 0);

  setBreakpoints("TitanColonist", -1, -1, -1);
  setBreakpoints("PitMiner", 1, 12, -1);
  setBreakpoints("Miner", 3, 5, -1);
  setBreakpoints("CoalMiner", 2, 4, -1);
  setBreakpoints("CementWorker", 4, 8, -1);
  setBreakpoints("Professor", 6, 10, -1);
  setBreakpoints("Scientist", 3, 6, -1);
  setBreakpoints("Entertainer", 2, 5, -1);
  setBreakpoints("HellSurveyor", 1, 1, -1);
  setBreakpoints("SpaceMiner", 1, 3, -1);
  setBreakpoints("Torturer", 1, 1, -1);
  setBreakpoints("Archaeologist", 1, 1, -1);
  setBreakpoints("GhostTrapper", 1, 1, -1);
  setBreakpoints("ElysiumMiner", 1, 1, -1);
  setBreakpoints("Banker", 3, 5, -1);
  setBreakpoints("Priest", 0, 0, -1);
  setBreakpoints("Unemployed", 0, 0, 0);

  return {
    def,
    priorityOrders: [{ manager: "job", ids: priorityIds, sort: true }],
  };
}

export interface BuildingResetContext {
  /** Buildings in `BuildingManager.priorityList` order (sampled after `initBuildingState`). */
  readonly buildings: readonly {
    readonly binding: string;
    readonly switchable: boolean;
    readonly smart: boolean;
  }[];
  /** Vue binding by building map key, for the special-case defaults below. */
  readonly bindingByKey: Record<string, string>;
}

export function computeBuildingDefaults(
  context: BuildingResetContext,
): ResetPlan {
  const { bindingByKey } = context;
  const def: Record<string, unknown> = {
    autoBuild: false,
    autoPower: false,
    buildingsIgnoreZeroRate: false,
    buildingsLimitPowered: true,
    buildingTowerSuppression: 100,
    buildingConsumptionCheck: "perResource",
    buildingsTransportGem: false,
    buildingsBestFreighter: false,
    buildingsUseMultiClick: false,
    buildingsBulkBuild: false,
    buildingsBulkBuildMax: 10,
    buildingEnabledAll: true,
    buildingStateAll: true,
  };

  context.buildings.forEach((building, i) => {
    const id = building.binding;
    def["bat" + id] = true; // autoBuildEnabled
    def["bld_p_" + id] = i; // priority
    def["bld_m_" + id] = -1; // _autoMax
    def["bld_w_" + id] = 100; // _weighting

    if (building.switchable) {
      def["bld_s_" + id] = true; // autoStateEnabled
    }
    if (building.smart) {
      def["bld_s2_" + id] = true; // autoStateSmart
    }
  });
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
  ].forEach((b) => (def["bat" + bindingByKey[b]] = false));

  // Exotic Zoo: enabled by default with a reduced weighting
  def["bat" + bindingByKey.AlphaExoticZoo] = true;
  def["bld_w_" + bindingByKey.AlphaExoticZoo] = 50;

  // Limit max for belt ships, and horseshoes
  def["bld_m_" + bindingByKey.ForgeHorseshoe] = 20;
  def["bld_m_" + bindingByKey.RedForgeHorseshoe] = 20;
  def["bld_m_" + bindingByKey.TauForgeHorseshoe] = 20;
  def["bld_m_" + bindingByKey.BeltEleriumShip] = 15;
  def["bld_m_" + bindingByKey.BeltIridiumShip] = 15;

  return { def };
}

export interface ProjectResetContext {
  /** Project ids in `Object.values(projects)` order. */
  readonly projectIds: readonly string[];
  /** Project id by `projects` map key, for the default priority table. */
  readonly idByKey: Record<string, string>;
}

export function computeProjectDefaults(
  context: ProjectResetContext,
): ResetPlan {
  const { idByKey } = context;
  const def: Record<string, unknown> = {
    autoARPA: false,
    arpaScaleWeighting: true,
    arpaStep: 5,
  };

  let projectPriority = 0;
  const setProject = (
    key: string,
    autoBuildEnabled: boolean,
    autoMax: number,
    weighting: number,
  ) => {
    const id = idByKey[key];
    def["arpa_" + id] = autoBuildEnabled;
    def["arpa_p_" + id] = projectPriority++;
    def["arpa_m_" + id] = autoMax;
    def["arpa_w_" + id] = weighting;
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

  return {
    def,
    priorityOrders: [
      { manager: "project", ids: context.projectIds, sort: true },
    ],
  };
}

export interface MagicResetContext {
  /** Resources with a positive transmute tier, in `Object.values(resources)` order. */
  readonly alchemyResourceIds: readonly string[];
  /** `Object.values(RitualManager.Productions).map((spell) => spell.id)`. */
  readonly ritualProductionIds: readonly string[];
}

export function computeMagicDefaults(context: MagicResetContext): ResetPlan {
  const def: Record<string, unknown> = {
    autoAlchemy: false,
    autoPylon: false,
    magicFullmetalHelper: true,
    magicAlchemyManaUse: 0.5,
    productionRitualManaUse: 0.5,
    productionRitualSafe: true,
  };

  // Alchemy
  context.alchemyResourceIds.forEach((id) => {
    def["res_alchemy_" + id] = true; // resEnabled
    def["res_alchemy_w_" + id] = 0; // resWeighting
  });

  // Pylon
  context.ritualProductionIds.forEach((id) => {
    def["spell_w_" + id] = 100; // weighting
  });
  def["spell_w_hunting"] = 10;
  def["spell_w_farmer"] = 1;

  return {
    def,
    priorityOrders: [
      { manager: "alchemy", ids: context.alchemyResourceIds, sort: false },
    ],
  };
}

export interface ProductionResetContext {
  /** Resource id by `resources` map key, for the foundry table. */
  readonly foundryResourceIdByKey: Record<string, string>;
  /** `Object.values(SmelterManager.Fuels).map((fuel) => fuel.id)`. */
  readonly smelterFuelIds: readonly string[];
  /** `FactoryManager.Productions[key].resource.id` by production key. */
  readonly factoryResourceIdByKey: Record<string, string>;
  /** `DroidManager.Productions[key].resource.id` by production key. */
  readonly droidResourceIdByKey: Record<string, string>;
  /** `Object.values(ReplicatorManager.Productions).map((p) => p.id)`. */
  readonly replicatorProductionIds: readonly string[];
}

export function computeProductionDefaults(
  context: ProductionResetContext,
): ResetPlan {
  const def: Record<string, unknown> = {
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
    key: string,
    autoCraftEnabled: boolean,
    crafterEnabled: boolean,
    craftWeighting: number,
    craftPreserve: number,
  ) => {
    const id = context.foundryResourceIdByKey[key];
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
  context.smelterFuelIds.forEach((id, i) => {
    def["smelter_fuel_p_" + id] = i; // priority
  });

  // Factory
  const setFactoryProduct = (
    key: string,
    enabled: boolean,
    weighting: number,
    priority: number,
  ) => {
    const id = context.factoryResourceIdByKey[key];
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
  const setDroidProduct = (
    key: string,
    weighting: number,
    priority: number,
  ) => {
    const id = context.droidResourceIdByKey[key];
    def["droid_w_" + id] = weighting;
    def["droid_pr_" + id] = priority;
  };
  setDroidProduct("Adamantite", 15, 1);
  setDroidProduct("Aluminium", 1, 1);
  setDroidProduct("Uranium", 5, -1);
  setDroidProduct("Coal", 5, -1);

  // Matter Replicator
  context.replicatorProductionIds.forEach((id) => {
    def["replicator_" + id] = true; // enabled
    def["replicator_w_" + id] = 1; // weighting
    def["replicator_p_" + id] = 1; // priority
  });

  return { def };
}

export interface EjectorResourceDescriptor {
  readonly id: string;
  readonly isTradable: boolean;
  readonly atomicMass: number;
  readonly ejectConsumable: boolean;
  readonly supplyConsumable: boolean;
  readonly naniteConsumable: boolean;
  /** `SupplyManager.supplyIn(id)`. */
  readonly supplyIn: number;
}

export interface EjectorResetContext {
  /** `game.global.race.universe`. */
  readonly universe: string;
  /** All resources in `Object.values(resources)` order. */
  readonly resources: readonly EjectorResourceDescriptor[];
  readonly eleriumId: string;
  readonly inferniteId: string;
}

export function computeEjectorDefaults(
  context: EjectorResetContext,
): ResetPlan {
  const { resources, eleriumId, inferniteId } = context;
  const byId = new Map(resources.map((r) => [r.id, r]));
  const elerium = byId.get(eleriumId);
  const infernite = byId.get(inferniteId);

  let ejectList: EjectorResourceDescriptor[];
  if (context.universe === "magic") {
    ejectList = resources
      .filter((r) => r.ejectConsumable)
      .sort((a, b) => b.atomicMass - a.atomicMass);
  } else {
    ejectList = resources
      .filter(
        (r) => r.ejectConsumable && r.id !== eleriumId && r.id !== inferniteId,
      )
      .sort((a, b) => b.atomicMass - a.atomicMass);
    if (infernite) ejectList.unshift(infernite);
    if (elerium) ejectList.unshift(elerium);
  }

  const supplyList = resources
    .filter((r) => r.supplyConsumable)
    .sort((a, b) => b.supplyIn - a.supplyIn);

  const naniteList = resources
    .filter((r) => r.naniteConsumable)
    .sort((a, b) => b.atomicMass - a.atomicMass);

  const def: Record<string, unknown> = {
    autoEject: false,
    autoSupply: false,
    autoNanite: false,
    ejectMode: "cap",
    supplyMode: "mixed",
    naniteMode: "full",
    prestigeWhiteholeStabiliseMass: true,
    prestigeWhiteholeStabiliseCooldown: 120,
  };

  // Descriptor `isTradable` is already coerced from the game's `is.tradable ?? false`.
  ejectList.forEach((r) => (def["res_eject" + r.id] = r.isTradable));
  supplyList.forEach((r) => (def["res_supply" + r.id] = r.isTradable));
  naniteList.forEach((r) => (def["res_nanite" + r.id] = r.isTradable));

  def["res_eject" + eleriumId] = true;
  def["res_eject" + inferniteId] = true;

  return {
    def,
    priorityOrders: [
      { manager: "eject", ids: ejectList.map((r) => r.id), sort: false },
      { manager: "supply", ids: supplyList.map((r) => r.id), sort: false },
      { manager: "nanite", ids: naniteList.map((r) => r.id), sort: false },
    ],
  };
}
