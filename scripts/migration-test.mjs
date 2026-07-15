import assert from "node:assert/strict";
import { createSettingsMigration } from "../src/settings/migration.ts";
import { createSettingsState } from "../src/settings/state.ts";

// Faithful applySettings/migrateSetting bound to the same synthetic settingsRaw.
let settingsRaw;
const stateStore = { setItem() {} };
const { applySettings, migrateSetting } = createSettingsState({
  getSettingsRaw: () => settingsRaw,
  getTriggerManager: () => ({ priorityList: [], AddTriggerFromSetting() {} }),
  storage: stateStore,
});

const resetOrder = [];
const resetNames = [
  "resetEvolutionSettings",
  "resetWarSettings",
  "resetHellSettings",
  "resetMechSettings",
  "resetFleetSettings",
  "resetGovernmentSettings",
  "resetAuthoritySettings",
  "resetBuildingSettings",
  "resetWeightingSettings",
  "resetMarketSettings",
  "resetResearchSettings",
  "resetProjectSettings",
  "resetJobSettings",
  "resetMagicSettings",
  "resetProductionSettings",
  "resetStorageSettings",
  "resetGeneralSettings",
  "resetInterfaceSettings",
  "resetStateLogSettings",
  "resetAchievementGuardSettings",
  "resetChallengeHelperSettings",
  "resetPrestigeSettings",
  "resetEjectorSettings",
  "resetPlanetSettings",
  "resetLoggingSettings",
  "resetTriggerSettings",
  "resetMinorTraitSettings",
  "resetMutableTraitSettings",
];
const resetSettings = Object.fromEntries(
  resetNames.map((name) => [name, (reset) => resetOrder.push({ name, reset })]),
);

const settings = { prestigeAscensionSkipCustom: false };

settingsRaw = {
  overrides: {
    // string setting with numeric ret -> coerced to string
    stringSetting: [{ ret: 5 }],
    // number setting with string ret -> coerced to number
    numberSetting: [{ ret: "7" }],
  },
  triggers: [
    {
      requirementType: "Boolean",
      requirementId: "x",
      requirementCount: 0,
      actionType: "build",
      actionId: "y",
    },
    {
      requirementType: "unlocked",
      requirementId: "sequenced",
      requirementCount: 3,
      actionType: "research",
      actionId: "sequenced",
    },
    {
      requirementType: "researched",
      requirementId: "unknown",
      requirementCount: 1,
      actionType: "build",
      actionId: "z",
    },
    {
      requirementType: "built",
      requirementId: "b",
      requirementCount: 2,
      actionType: "build",
      actionId: "b",
    },
  ],
  // pre-default migrate
  masterScriptToggle: true,
  // once-only migration (eden)
  "bld_p_eden-bliss_den": 1,
  "bld_p_eden-rectory": 5,
  "bld_p_eden-encampment": 9,
  // typed override sources
  stringSetting: "hello",
  numberSetting: 3,
  // list/checkbox migrations
  productionPrioritizeDemanded: true,
  challenge_mastery: true,
  challenge_plasmid: false,
  res_trade_buy_mtr_Food: true,
  arpa: { lhc: true, launch_facility: false },
  // deprecated pre-overrides removal
  autoAchievements: true,
  foreignAttack0: 1,
  foreignAttack1: 2,
  res_storage_w_Food: 1,
  arpa_ignore_money_lhc: true,
  bld_s_static: 3,
  bld_s_switchy: 4,
  // post-overrides migrateSetting
  prestigeWhiteholeEjectEnabled: true,
  // override migrations
  prestigeWhiteholeEjectAllCount: 15,
  prestigeAscensionSkipCustom: false,
  // crafter garbage collection
  job_p_Scarletite: 1,
  job_b1_Scarletite: 2,
  // deprecated post-overrides removal (with override)
  tickTimeout: 250,
};
settingsRaw.overrides.tickTimeout = [{ ret: 1 }];

const techIds = { "tech-sequenced": true };
const MarketManager = { priorityList: [{ id: "Food" }, { id: "Lumber" }] };
const resources = { Food: { id: "Food" }, Lumber: { id: "Lumber" } };
const projects = { lhc: { id: "lhc" } };
const buildings = {
  static: { isSwitchable: () => false, _vueBinding: "static" },
  switchy: { isSwitchable: () => true, _vueBinding: "switchy" },
};
const crafter = { Scarletite: { _originalId: "Scarletite" } };

const { updateStandAloneSettings } = createSettingsMigration({
  getSettingsRaw: () => settingsRaw,
  getSettings: () => settings,
  settingsSections: ["general", "prestige"],
  applySettings,
  migrateSetting,
  getResetSettings: () => resetSettings,
  getTechIds: () => techIds,
  getMarketManager: () => MarketManager,
  getResources: () => resources,
  getProjects: () => projects,
  getBuildings: () => buildings,
  getCrafter: () => crafter,
});

updateStandAloneSettings();

// Non-overridable defaults applied for missing keys only.
assert.equal(settingsRaw.scriptName, "TMVictor");
assert.equal(settingsRaw.generalSettingsCollapsed, true);
assert.equal(settingsRaw.prestigeSettingsCollapsed, true);

// Pre-default migrate under masterScriptToggle.
assert.equal(settingsRaw.autoPrestige, true);
assert.equal(settingsRaw.buildingsLimitPowered, false);

// Once-only eden migration + version bump.
assert.equal(settingsRaw["bld_p_eden-rectory"], 10);
assert.equal(settingsRaw.migrationVersion, 1);

// All 28 reset builders invoked once, in declared order, with reset=false.
assert.deepEqual(
  resetOrder.map((entry) => entry.name),
  resetNames,
);
assert.ok(resetOrder.every((entry) => entry.reset === false));

// Override return-type coercion.
assert.strictEqual(settingsRaw.overrides.stringSetting[0].ret, "5");
assert.strictEqual(settingsRaw.overrides.numberSetting[0].ret, 7);

// Trigger migrations.
const [boolT, unlockedT, researchedT, builtT] = settingsRaw.triggers;
assert.equal(boolT.requirementId, false); // count 0 -> negate id
assert.equal(boolT.requirementCount, 1);
assert.equal(unlockedT.requirementType, "ResearchUnlocked");
assert.equal(unlockedT.requirementId, "tech-sequenced");
assert.equal(unlockedT.actionId, "tech-sequenced");
assert.equal(unlockedT.requirementCount, 1);
assert.equal(researchedT.requirementType, "ResearchComplete");
assert.equal(builtT.requirementType, "BuildingCount");

// Checkbox/list migrations.
assert.equal(settingsRaw.productionFoundryWeighting, "demanded");
assert.equal(settingsRaw.challenge_plasmid, true); // merged from mastery
assert.equal(settingsRaw.res_trade_buy_Food, true);
assert.equal(settingsRaw.res_trade_buy_Lumber, true);
assert.equal(settingsRaw.arpa_lhc, true);
assert.equal(settingsRaw.arpa_launch_facility, false);

// Deprecated pre-overrides removal.
assert.ok(!("autoAchievements" in settingsRaw));
assert.ok(!("foreignAttack0" in settingsRaw));
assert.ok(!("res_storage_w_Food" in settingsRaw));
assert.ok(!("arpa_ignore_money_lhc" in settingsRaw));
assert.ok(!("arpa" in settingsRaw));
assert.ok(!("challenge_mastery" in settingsRaw));
// Only non-switchable building state key removed.
assert.ok(!("bld_s_static" in settingsRaw));
assert.equal(settingsRaw.bld_s_switchy, 4);

// Post-overrides migrateSetting.
assert.equal(settingsRaw.autoEject, true);
assert.ok(!("prestigeWhiteholeEjectEnabled" in settingsRaw));

// Override migrations pushed.
const ejectOverride = settingsRaw.overrides.ejectMode.at(-1);
assert.equal(ejectOverride.arg2, 15);
assert.equal(ejectOverride.ret, "all");
const prestigeOverride = settingsRaw.overrides.autoPrestige.at(-1);
assert.equal(prestigeOverride.arg1, "ascension");
assert.equal(prestigeOverride.ret, false);

// Crafter garbage collection.
assert.ok(!("job_p_Scarletite" in settingsRaw));
assert.ok(!("job_b1_Scarletite" in settingsRaw));

// Deprecated post-overrides removal (setting and its override).
assert.ok(!("tickTimeout" in settingsRaw));
assert.ok(!("tickTimeout" in settingsRaw.overrides));
assert.ok(!("prestigeAscensionSkipCustom" in settingsRaw));

console.log("Settings migration module tests passed");
