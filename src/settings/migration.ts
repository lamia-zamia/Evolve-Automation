interface SettingOverride extends Record<string, unknown> {
  ret: unknown;
}

interface TriggerSetting extends Record<string, unknown> {
  requirementType: string;
  requirementId: unknown;
  requirementCount: number;
  actionType: string;
  actionId: string;
}

type SettingsRecord = {
  overrides: Record<string, SettingOverride[]>;
  triggers: TriggerSetting[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<string, any>;

type ResetFunction = (reset: boolean) => void;

interface ResetSettingsMap {
  resetEvolutionSettings: ResetFunction;
  resetWarSettings: ResetFunction;
  resetHellSettings: ResetFunction;
  resetMechSettings: ResetFunction;
  resetFleetSettings: ResetFunction;
  resetGovernmentSettings: ResetFunction;
  resetAuthoritySettings: ResetFunction;
  resetBuildingSettings: ResetFunction;
  resetWeightingSettings: ResetFunction;
  resetMarketSettings: ResetFunction;
  resetResearchSettings: ResetFunction;
  resetProjectSettings: ResetFunction;
  resetJobSettings: ResetFunction;
  resetMagicSettings: ResetFunction;
  resetProductionSettings: ResetFunction;
  resetStorageSettings: ResetFunction;
  resetGeneralSettings: ResetFunction;
  resetInterfaceSettings: ResetFunction;
  resetStateLogSettings: ResetFunction;
  resetAchievementGuardSettings: ResetFunction;
  resetChallengeHelperSettings: ResetFunction;
  resetPrestigeSettings: ResetFunction;
  resetEjectorSettings: ResetFunction;
  resetPlanetSettings: ResetFunction;
  resetLoggingSettings: ResetFunction;
  resetTriggerSettings: ResetFunction;
  resetMinorTraitSettings: ResetFunction;
  resetMutableTraitSettings: ResetFunction;
}

interface SettingsMigrationDependencies {
  getSettingsRaw: () => SettingsRecord;
  getSettings: () => Record<string, unknown>;
  settingsSections: readonly string[];
  applySettings: (def: Record<string, unknown>, reset: boolean) => void;
  migrateSetting: (
    oldSetting: string,
    newSetting: string,
    mapCb: (value: unknown) => unknown,
    keepOldValue?: boolean,
  ) => void;
  getResetSettings: () => ResetSettingsMap;
  getTechIds: () => Record<string, unknown>;
  getMarketManager: () => { priorityList: { id: string }[] };
  getResources: () => Record<string, { id: string }>;
  getProjects: () => Record<string, { id: string }>;
  getBuildings: () => Record<
    string,
    { isSwitchable: () => boolean; _vueBinding: string }
  >;
  getCrafter: () => Record<string, { _originalId: string }>;
}

export function createSettingsMigration({
  getSettingsRaw,
  getSettings,
  settingsSections,
  applySettings,
  migrateSetting,
  getResetSettings,
  getTechIds,
  getMarketManager,
  getResources,
  getProjects,
  getBuildings,
  getCrafter,
}: SettingsMigrationDependencies) {
  function updateStandAloneSettings() {
    const settingsRaw = getSettingsRaw();
    const settings = getSettings();
    const techIds = getTechIds();
    const MarketManager = getMarketManager();
    const resources = getResources();
    const projects = getProjects();
    const buildings = getBuildings();
    const crafter = getCrafter();
    const {
      resetEvolutionSettings,
      resetWarSettings,
      resetHellSettings,
      resetMechSettings,
      resetFleetSettings,
      resetGovernmentSettings,
      resetAuthoritySettings,
      resetBuildingSettings,
      resetWeightingSettings,
      resetMarketSettings,
      resetResearchSettings,
      resetProjectSettings,
      resetJobSettings,
      resetMagicSettings,
      resetProductionSettings,
      resetStorageSettings,
      resetGeneralSettings,
      resetInterfaceSettings,
      resetStateLogSettings,
      resetAchievementGuardSettings,
      resetChallengeHelperSettings,
      resetPrestigeSettings,
      resetEjectorSettings,
      resetPlanetSettings,
      resetLoggingSettings,
      resetTriggerSettings,
      resetMinorTraitSettings,
      resetMutableTraitSettings,
    } = getResetSettings();

    let def = {
      scriptName: "TMVictor",
      overrides: {},
      triggers: [],
    };
    settingsSections.forEach((id) => (def[id + "SettingsCollapsed"] = true));
    applySettings(def, false); // For non-overridable settings only

    // Pre-default migrate
    if (settingsRaw.hasOwnProperty("masterScriptToggle")) {
      if (!settingsRaw.hasOwnProperty("autoPrestige")) {
        settingsRaw.autoPrestige = true;
        [
          "job_b1_farmer",
          "job_b2_farmer",
          "job_b3_farmer",
          "job_b1_hunter",
          "job_b2_hunter",
          "job_b3_hunter",
        ].forEach((id) => delete settingsRaw[id]);
      }
      if (!settingsRaw.hasOwnProperty("buildingsLimitPowered")) {
        settingsRaw.buildingsLimitPowered = false;
      }
    }

    // Specific migrations that should only be executed once
    if (!settingsRaw.migrationVersion || settingsRaw.migrationVersion < 1) {
      // Moved upwards in default priority list, needs to be executed before resetting building settings
      // Settings may not exist yet here
      if (
        settingsRaw["bld_p_eden-bliss_den"] &&
        settingsRaw["bld_p_eden-rectory"] &&
        settingsRaw["bld_p_eden-encampment"] &&
        settingsRaw["bld_p_eden-bliss_den"] < settingsRaw["bld_p_eden-rectory"]
      ) {
        settingsRaw["bld_p_eden-rectory"] =
          settingsRaw["bld_p_eden-encampment"] + 1;
      }
      settingsRaw.migrationVersion = 1;
    }

    // Apply default settings
    resetEvolutionSettings(false);
    resetWarSettings(false);
    resetHellSettings(false);
    resetMechSettings(false);
    resetFleetSettings(false);
    resetGovernmentSettings(false);
    resetAuthoritySettings(false);
    resetBuildingSettings(false);
    resetWeightingSettings(false);
    resetMarketSettings(false);
    resetResearchSettings(false);
    resetProjectSettings(false);
    resetJobSettings(false);
    resetMagicSettings(false);
    resetProductionSettings(false);
    resetStorageSettings(false);
    resetGeneralSettings(false);
    resetInterfaceSettings(false);
    resetStateLogSettings(false);
    resetAchievementGuardSettings(false);
    resetChallengeHelperSettings(false);
    resetPrestigeSettings(false);
    resetEjectorSettings(false);
    resetPlanetSettings(false);
    resetLoggingSettings(false);
    resetTriggerSettings(false);
    resetMinorTraitSettings(false);
    resetMutableTraitSettings(false);

    // Validate overrides types, and fix if needed
    for (let key in settingsRaw.overrides) {
      for (let i = 0; i < settingsRaw.overrides[key].length; i++) {
        let override = settingsRaw.overrides[key][i];
        if (
          typeof settingsRaw[key] === "string" &&
          typeof override.ret === "number"
        ) {
          override.ret = String(override.ret);
        }
        if (
          typeof settingsRaw[key] === "number" &&
          typeof override.ret === "string"
        ) {
          override.ret = Number(override.ret);
        }
      }
    }
    // Migrate pre-overrides settings
    settingsRaw.triggers.forEach((t) => {
      // Normalize manually-added boolean triggers to match UI
      if (t.requirementType == "Boolean" && t.requirementCount !== 1) {
        t.requirementId = t.requirementCount
          ? t.requirementId
          : !t.requirementId;
        t.requirementCount = 1;
      }
      // Migrate old trigger IDs
      if (
        (t.requirementType === "unlocked" ||
          t.requirementType === "researched") &&
        techIds["tech-" + t.requirementId]
      ) {
        t.requirementId = "tech-" + t.requirementId;
      }
      if (t.actionType === "research" && techIds["tech-" + t.actionId]) {
        t.actionId = "tech-" + t.actionId;
      }
      // Migrate old trigger checks to overrides
      if (t.requirementType === "unlocked") {
        t.requirementType = "ResearchUnlocked";
        t.requirementCount = 1;
      }
      if (t.requirementType === "researched") {
        t.requirementType = "ResearchComplete";
        t.requirementCount = 1;
      }
      if (t.requirementType === "built") {
        t.requirementType = "BuildingCount";
      }
    });
    if (settingsRaw.hasOwnProperty("productionPrioritizeDemanded")) {
      // Replace checkbox with list
      settingsRaw.productionFoundryWeighting =
        settingsRaw.productionPrioritizeDemanded ? "demanded" : "none";
    }
    settingsRaw.challenge_plasmid =
      settingsRaw.challenge_mastery || settingsRaw.challenge_plasmid; // Merge challenge settings
    if (settingsRaw.hasOwnProperty("res_trade_buy_mtr_Food")) {
      // Reset default market settings for pre-rework configs
      MarketManager.priorityList.forEach(
        (res) => (settingsRaw["res_trade_buy_" + res.id] = true),
      );
    }
    if (settingsRaw.hasOwnProperty("arpa")) {
      // Move arpa from object to strings
      Object.entries(settingsRaw.arpa).forEach(
        ([id, enabled]) => (settingsRaw["arpa_" + id] = enabled),
      );
    }
    // Remove deprecated pre-overrides settings
    [
      "buildingWeightingTriggerConflict",
      "researchAlienGift",
      "arpaBuildIfStorageFullCraftableMin",
      "arpaBuildIfStorageFullResourceMaxPercent",
      "arpaBuildIfStorageFull",
      "productionMoneyIfOnly",
      "autoAchievements",
      "autoChallenge",
      "autoMAD",
      "autoSpace",
      "autoSeeder",
      "foreignSpyManage",
      "foreignHireMercCostLowerThan",
      "userResearchUnification",
      "btl_Ambush",
      "btl_max_Ambush",
      "btl_Raid",
      "btl_max_Raid",
      "btl_Pillage",
      "btl_max_Pillage",
      "btl_Assault",
      "btl_max_Assault",
      "btl_Siege",
      "btl_max_Siege",
      "smelter_fuel_Oil",
      "smelter_fuel_Coal",
      "smelter_fuel_Lumber",
      "planetSettingsCollapser",
      "buildingManageSpire",
      "hellHandleAttractors",
      "researchFilter",
      "challenge_mastery",
      "hellCountGems",
      "productionPrioritizeDemanded",
      "fleetChthonianPower",
      "productionWaitMana",
      "arpa",
      "autoLogging",
    ].forEach((id) => delete settingsRaw[id]);
    [
      "foreignAttack",
      "foreignOccupy",
      "foreignSpy",
      "foreignSpyMax",
      "foreignSpyOp",
    ].forEach((id) =>
      [0, 1, 2].forEach((index) => delete settingsRaw[id + index]),
    );
    ["res_storage_w_", "res_trade_buy_mtr_", "res_trade_sell_mps_"].forEach(
      (id) =>
        Object.values(resources).forEach(
          (resource) => delete settingsRaw[id + resource.id],
        ),
    );
    Object.values(projects).forEach(
      (project) => delete settingsRaw["arpa_ignore_money_" + project.id],
    );
    Object.values(buildings)
      .filter((building) => !building.isSwitchable())
      .forEach(
        (building) => delete settingsRaw["bld_s_" + building._vueBinding],
      );
    // Migrate post-overrides settings
    migrateSetting("prestigeWhiteholeEjectEnabled", "autoEject", (v) => v);
    migrateSetting("mechSaveSupply", "mechSaveSupplyRatio", (v) => (v ? 1 : 0));
    migrateSetting("foreignProtectSoldiers", "foreignProtect", (v) =>
      v ? "always" : "never",
    );
    migrateSetting("prestigeWhiteholeEjectExcess", "ejectMode", (v) =>
      v ? "mixed" : "cap",
    );
    migrateSetting("hellHandlePatrolCount", "autoHell", (v) => v, true);
    migrateSetting("unificationRequest", "prioritizeUnify", (v) =>
      v ? "savereq" : "ignore",
    );
    migrateSetting("queueRequest", "prioritizeQueue", (v) =>
      v ? "savereq" : "ignore",
    );
    migrateSetting("triggerRequest", "prioritizeTriggers", (v) =>
      v ? "savereq" : "ignore",
    );
    migrateSetting("govManage", "autoGovernment", (v) => v);
    migrateSetting("storagePrioritizedOnly", "storageAssignPart", (v) => !v);
    migrateSetting("fleetScanEris", "fleet_outer_pr_spc_eris", (v) =>
      v ? 100 : 0,
    );
    migrateSetting("jobDisableCraftsmans", "productionCraftsmen", (v) =>
      v ? "nocraft" : "always",
    );
    migrateSetting("activeTriggerUI", "activeTargetsUI", (v) => v);
    migrateSetting("autoAssembleGene", "autoGenetics", (v) => v);
    // Handle ingame ID change
    migrateSetting("batportal-harbour", "batportal-harbor", (v) => v);
    migrateSetting("bld_p_portal-harbour", "bld_p_portal-harbor", (v) => v);
    migrateSetting("bld_s_portal-harbour", "bld_s_portal-harbor", (v) => v);
    migrateSetting("bld_s2_portal-harbour", "bld_s2_portal-harbor", (v) => v);
    migrateSetting("bld_m_portal-harbour", "bld_m_portal-harbor", (v) => v);
    migrateSetting("bld_w_portal-harbour", "bld_w_portal-harbor", (v) => v);
    // Migrate setting as override, in case if someone actualy use it
    if (settingsRaw.hasOwnProperty("genesAssembleGeneAlways")) {
      if (settingsRaw.overrides.genesAssembleGeneAlways) {
        settingsRaw.overrides.geneticsAssemble =
          settingsRaw.overrides.genesAssembleGeneAlways.concat(
            settingsRaw.overrides.geneticsAssemble ?? [],
          );
      }
      if (!settingsRaw.genesAssembleGeneAlways) {
        settingsRaw.overrides.geneticsAssemble =
          settingsRaw.overrides.geneticsAssemble ?? [];
        settingsRaw.overrides.geneticsAssemble.push({
          type1: "ResearchComplete",
          arg1: "tech-dna_sequencer",
          type2: "Boolean",
          arg2: true,
          cmp: "==",
          ret: "none",
        });
      }
    }
    if (
      settingsRaw.hasOwnProperty("prestigeWhiteholeEjectAllCount") &&
      settingsRaw.prestigeWhiteholeEjectAllCount <= 20
    ) {
      settingsRaw.overrides.ejectMode = settingsRaw.overrides.ejectMode ?? [];
      settingsRaw.overrides.ejectMode.push({
        type1: "BuildingCount",
        arg1: "interstellar-mass_ejector",
        type2: "Number",
        arg2: settingsRaw.prestigeWhiteholeEjectAllCount,
        cmp: ">=",
        ret: "all",
      });
    }
    if (
      settingsRaw.hasOwnProperty("prestigeAscensionSkipCustom") &&
      !settings.prestigeAscensionSkipCustom
    ) {
      settingsRaw.overrides.autoPrestige =
        settingsRaw.overrides.autoPrestige ?? [];
      settingsRaw.overrides.autoPrestige.push({
        type1: "ResetType",
        arg1: "ascension",
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: false,
      });
    }
    // Garbage collection
    Object.values(crafter).forEach((job) => {
      (delete settingsRaw["job_p_" + job._originalId],
        delete settingsRaw["job_b1_" + job._originalId],
        delete settingsRaw["job_b2_" + job._originalId],
        delete settingsRaw["job_b3_" + job._originalId]);
    });
    // Remove deprecated post-overrides settings
    ["res_containers_m_", "res_crates_m_"].forEach((id) =>
      Object.values(resources).forEach((res) => {
        (delete settingsRaw[id + res.id],
          delete settingsRaw.overrides[id + res.id]);
      }),
    );
    [
      "prestigeWhiteholeEjectAllCount",
      "prestigeWhiteholeDecayRate",
      "genesAssembleGeneAlways",
      "buildingsConflictQueue",
      "buildingsConflictRQueue",
      "buildingsConflictPQueue",
      "fleet_outer_pr_spc_hell",
      "fleet_outer_pr_spc_dwarf",
      "prestigeEnabledBarracks",
      "bld_s2_city-garrison",
      "prestigeAscensionSkipCustom",
      "prestigeBioseedGECK",
      "tickTimeout",
      "minorTraitSettingsCollapsed",
      "fleetOuterMinSyndicate",
      "smelter_fuel_p_Star",
      "replicatorResource",
    ].forEach((id) => {
      (delete settingsRaw[id], delete settingsRaw.overrides[id]);
    });
  }

  return { updateStandAloneSettings };
}
