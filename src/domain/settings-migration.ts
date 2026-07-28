// Pure settings schema/migration over the raw persisted record.
//
// These functions replace the getter-bag `createSettingsMigration`/`createSettingsState`
// primitives: every input the migration reads (game catalogs, evaluated flags, the default
// resets) is passed explicitly, and every write lands on the `settingsRaw` record handed in.
// No ambient globals, no live getters.

export interface SettingOverride extends Record<string, unknown> {
  ret: unknown;
}

export interface TriggerSetting extends Record<string, unknown> {
  requirementType: string;
  requirementId: unknown;
  requirementCount: number;
  actionType: string;
  actionId: string;
}

export interface SettingsRecord extends Record<string, unknown> {
  overrides: Record<string, SettingOverride[]>;
  triggers: TriggerSetting[];
}

function has(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Apply a default definition to the record. With `reset`, clears the matching
 * overrides and force-assigns the definition; otherwise fills only missing keys
 * and coerces existing values to the default's type.
 */
export function applySettings(
  settingsRaw: SettingsRecord,
  def: Record<string, unknown>,
  reset: boolean,
): void {
  if (reset) {
    for (const key in def) {
      delete settingsRaw.overrides[key];
    }
    Object.assign(settingsRaw, def);
  } else {
    for (const key in def) {
      if (!has(settingsRaw, key)) {
        settingsRaw[key] = def[key];
      } else {
        if (
          typeof settingsRaw[key] === "string" &&
          typeof def[key] === "number"
        ) {
          settingsRaw[key] = Number(settingsRaw[key]);
        }
        if (
          typeof settingsRaw[key] === "number" &&
          typeof def[key] === "string"
        ) {
          settingsRaw[key] = String(settingsRaw[key]);
        }
      }
    }
  }
}

/**
 * Rename `oldSetting` to `newSetting` (mapping the value through `mapCb`) and
 * carry any of its overrides across, mapping each override return value too.
 */
export function migrateSetting(
  settingsRaw: SettingsRecord,
  oldSetting: string,
  newSetting: string,
  mapCb: (value: unknown) => unknown,
  keepOldValue?: boolean,
): void {
  if (has(settingsRaw, oldSetting)) {
    if (!keepOldValue) {
      settingsRaw[newSetting] = mapCb(settingsRaw[oldSetting]);
    }
    delete settingsRaw[oldSetting];
  }
  if (has(settingsRaw.overrides, oldSetting)) {
    const oldOverrides = settingsRaw.overrides[oldSetting] as SettingOverride[];
    oldOverrides.forEach((override) => (override.ret = mapCb(override.ret)));
    settingsRaw.overrides[newSetting] = (
      settingsRaw.overrides[newSetting] ?? []
    ).concat(oldOverrides);
    delete settingsRaw.overrides[oldSetting];
  }
}

export interface SettingsMigrationContext {
  /** Section ids whose `<id>SettingsCollapsed` default is applied. */
  settingsSections: readonly string[];
  /** The default-reset builders, in their load-bearing order; each is run once with `false`. */
  defaultResets: readonly ((reset: boolean) => void)[];
  /** Evaluated `settings.prestigeAscensionSkipCustom`. */
  prestigeAscensionSkipCustom: boolean;
  /** Tech-id lookup used as `techIds["tech-" + id]` truthiness. */
  techIds: Record<string, unknown>;
  /** Market priority resource ids (for the pre-rework buy-default reset). */
  marketPriorityIds: readonly string[];
  /** All resource ids (for deprecated-key removal). */
  resourceIds: readonly string[];
  /** All project ids (for deprecated-key removal). */
  projectIds: readonly string[];
  /** Buildings with their vue binding and switchability (for non-switchable state-key removal). */
  buildings: readonly { vueBinding: string; switchable: boolean }[];
  /** Crafter original ids (for job-key garbage collection). */
  crafterOriginalIds: readonly string[];
}

/**
 * Run the one-time settings schema migration, mutating `settingsRaw` in place.
 * Faithful port of the legacy `updateStandAloneSettings`, with all reads supplied
 * through `context` rather than live getters.
 */
export function migrateSettingsRecord(
  settingsRaw: SettingsRecord,
  context: SettingsMigrationContext,
): void {
  const {
    settingsSections,
    defaultResets,
    prestigeAscensionSkipCustom,
    techIds,
    marketPriorityIds,
    resourceIds,
    projectIds,
    buildings,
    crafterOriginalIds,
  } = context;

  const def: Record<string, unknown> = {
    scriptName: "TMVictor",
    overrides: {},
    triggers: [],
  };
  settingsSections.forEach((id) => (def[id + "SettingsCollapsed"] = true));
  applySettings(settingsRaw, def, false); // For non-overridable settings only

  // Pre-default migrate
  if (has(settingsRaw, "masterScriptToggle")) {
    if (!has(settingsRaw, "autoPrestige")) {
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
    if (!has(settingsRaw, "buildingsLimitPowered")) {
      settingsRaw.buildingsLimitPowered = false;
    }
  }

  // Specific migrations that should only be executed once
  if (
    !settingsRaw.migrationVersion ||
    (settingsRaw.migrationVersion as number) < 1
  ) {
    // Moved upwards in default priority list, needs to be executed before resetting building settings
    // Settings may not exist yet here
    if (
      settingsRaw["bld_p_eden-bliss_den"] &&
      settingsRaw["bld_p_eden-rectory"] &&
      settingsRaw["bld_p_eden-encampment"] &&
      (settingsRaw["bld_p_eden-bliss_den"] as number) <
        (settingsRaw["bld_p_eden-rectory"] as number)
    ) {
      settingsRaw["bld_p_eden-rectory"] =
        (settingsRaw["bld_p_eden-encampment"] as number) + 1;
    }
    settingsRaw.migrationVersion = 1;
  }

  // Apply default settings
  defaultResets.forEach((reset) => reset(false));

  // Validate overrides types, and fix if needed
  for (const key in settingsRaw.overrides) {
    const overrides = settingsRaw.overrides[key] as SettingOverride[];
    for (let i = 0; i < overrides.length; i++) {
      const override = overrides[i] as SettingOverride;
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
    if (t.requirementType === "Boolean" && t.requirementCount !== 1) {
      t.requirementId = t.requirementCount ? t.requirementId : !t.requirementId;
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
  if (has(settingsRaw, "productionPrioritizeDemanded")) {
    // Replace checkbox with list
    settingsRaw.productionFoundryWeighting =
      settingsRaw.productionPrioritizeDemanded ? "demanded" : "none";
  }
  settingsRaw.challenge_plasmid =
    settingsRaw.challenge_mastery || settingsRaw.challenge_plasmid; // Merge challenge settings
  if (has(settingsRaw, "res_trade_buy_mtr_Food")) {
    // Reset default market settings for pre-rework configs
    marketPriorityIds.forEach(
      (id) => (settingsRaw["res_trade_buy_" + id] = true),
    );
  }
  if (has(settingsRaw, "arpa")) {
    // Move arpa from object to strings
    Object.entries(settingsRaw.arpa as Record<string, unknown>).forEach(
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
      resourceIds.forEach((resourceId) => delete settingsRaw[id + resourceId]),
  );
  projectIds.forEach(
    (projectId) => delete settingsRaw["arpa_ignore_money_" + projectId],
  );
  buildings
    .filter((building) => !building.switchable)
    .forEach((building) => delete settingsRaw["bld_s_" + building.vueBinding]);
  // Migrate post-overrides settings
  migrateSetting(
    settingsRaw,
    "prestigeWhiteholeEjectEnabled",
    "autoEject",
    (v) => v,
  );
  migrateSetting(settingsRaw, "mechSaveSupply", "mechSaveSupplyRatio", (v) =>
    v ? 1 : 0,
  );
  migrateSetting(
    settingsRaw,
    "foreignProtectSoldiers",
    "foreignProtect",
    (v) => (v ? "always" : "never"),
  );
  migrateSetting(
    settingsRaw,
    "prestigeWhiteholeEjectExcess",
    "ejectMode",
    (v) => (v ? "mixed" : "cap"),
  );
  migrateSetting(
    settingsRaw,
    "hellHandlePatrolCount",
    "autoHell",
    (v) => v,
    true,
  );
  migrateSetting(settingsRaw, "unificationRequest", "prioritizeUnify", (v) =>
    v ? "savereq" : "ignore",
  );
  migrateSetting(settingsRaw, "queueRequest", "prioritizeQueue", (v) =>
    v ? "savereq" : "ignore",
  );
  migrateSetting(settingsRaw, "triggerRequest", "prioritizeTriggers", (v) =>
    v ? "savereq" : "ignore",
  );
  migrateSetting(settingsRaw, "govManage", "autoGovernment", (v) => v);
  migrateSetting(
    settingsRaw,
    "storagePrioritizedOnly",
    "storageAssignPart",
    (v) => !v,
  );
  migrateSetting(
    settingsRaw,
    "fleetScanEris",
    "fleet_outer_pr_spc_eris",
    (v) => (v ? 100 : 0),
  );
  migrateSetting(
    settingsRaw,
    "jobDisableCraftsmans",
    "productionCraftsmen",
    (v) => (v ? "nocraft" : "always"),
  );
  migrateSetting(settingsRaw, "activeTriggerUI", "activeTargetsUI", (v) => v);
  migrateSetting(settingsRaw, "autoAssembleGene", "autoGenetics", (v) => v);
  // Handle ingame ID change
  migrateSetting(
    settingsRaw,
    "batportal-harbour",
    "batportal-harbor",
    (v) => v,
  );
  migrateSetting(
    settingsRaw,
    "bld_p_portal-harbour",
    "bld_p_portal-harbor",
    (v) => v,
  );
  migrateSetting(
    settingsRaw,
    "bld_s_portal-harbour",
    "bld_s_portal-harbor",
    (v) => v,
  );
  migrateSetting(
    settingsRaw,
    "bld_s2_portal-harbour",
    "bld_s2_portal-harbor",
    (v) => v,
  );
  migrateSetting(
    settingsRaw,
    "bld_m_portal-harbour",
    "bld_m_portal-harbor",
    (v) => v,
  );
  migrateSetting(
    settingsRaw,
    "bld_w_portal-harbour",
    "bld_w_portal-harbor",
    (v) => v,
  );
  // Migrate setting as override, in case if someone actualy use it
  if (has(settingsRaw, "genesAssembleGeneAlways")) {
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
    has(settingsRaw, "prestigeWhiteholeEjectAllCount") &&
    (settingsRaw.prestigeWhiteholeEjectAllCount as number) <= 20
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
    has(settingsRaw, "prestigeAscensionSkipCustom") &&
    !prestigeAscensionSkipCustom
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
  crafterOriginalIds.forEach((originalId) => {
    delete settingsRaw["job_p_" + originalId];
    delete settingsRaw["job_b1_" + originalId];
    delete settingsRaw["job_b2_" + originalId];
    delete settingsRaw["job_b3_" + originalId];
  });
  // Remove deprecated post-overrides settings
  ["res_containers_m_", "res_crates_m_"].forEach((id) =>
    resourceIds.forEach((resourceId) => {
      delete settingsRaw[id + resourceId];
      delete settingsRaw.overrides[id + resourceId];
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
    delete settingsRaw[id];
    delete settingsRaw.overrides[id];
  });
}
