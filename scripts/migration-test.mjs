import assert from "node:assert/strict";

import {
  applySettings,
  migrateSetting,
  migrateSettingsRecord,
} from "../src/domain/settings-migration.ts";
import {
  createLegacySettingsMigration,
  resetNames,
} from "./test-support/legacy-settings-migration.ts";

// A rich settingsRaw fixture exercising every migration branch. Returns a fresh
// deep copy each call so the legacy and pure runs mutate independent records.
function makeFixture() {
  const raw = {
    overrides: {
      // string setting with numeric ret -> coerced to string
      stringSetting: [{ ret: 5 }],
      // number setting with string ret -> coerced to number
      numberSetting: [{ ret: "7" }],
      tickTimeout: [{ ret: 1 }],
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
  return raw;
}

const settingsSections = ["general", "prestige"];
const techIds = { "tech-sequenced": true };
const marketPriorityIds = ["Food", "Lumber"];
const resourceIds = ["Food", "Lumber"];
const projectIds = ["lhc"];
const buildingViews = [
  { vueBinding: "static", switchable: false },
  { vueBinding: "switchy", switchable: true },
];
const crafterOriginalIds = ["Scarletite"];
const prestigeAscensionSkipCustom = false;

// Shared reset logic, so the legacy named-map and the pure ordered-array apply
// identical default mutations. Each reset drops a surviving marker key; the
// market-slot reset also writes a real default value that must land before the
// deprecated-key removal step runs.
const resetLogic = resetNames.map((_name, index) => (record, reset) => {
  record["__reset_default_" + index] = { reset, order: index };
  if (index === 9) {
    record.someMarketDefault = "seeded";
  }
});

function makeLegacyResets(record, order) {
  return Object.fromEntries(
    resetNames.map((name, index) => [
      name,
      (reset) => {
        order.push({ name, reset });
        resetLogic[index](record, reset);
      },
    ]),
  );
}

function makePureResets(record, order) {
  return resetNames.map((name, index) => (reset) => {
    order.push({ name, reset });
    resetLogic[index](record, reset);
  });
}

// ---- Dual run: legacy getter-bag vs. pure record port over identical inputs ----

const legacyRaw = makeFixture();
const legacyOrder = [];
const { updateStandAloneSettings } = createLegacySettingsMigration({
  getSettingsRaw: () => legacyRaw,
  getSettings: () => ({ prestigeAscensionSkipCustom }),
  settingsSections,
  getResetSettings: () => makeLegacyResets(legacyRaw, legacyOrder),
  getTechIds: () => techIds,
  getMarketManager: () => ({
    priorityList: marketPriorityIds.map((id) => ({ id })),
  }),
  getResources: () => Object.fromEntries(resourceIds.map((id) => [id, { id }])),
  getProjects: () => Object.fromEntries(projectIds.map((id) => [id, { id }])),
  getBuildings: () =>
    Object.fromEntries(
      buildingViews.map((b) => [
        b.vueBinding,
        { isSwitchable: () => b.switchable, _vueBinding: b.vueBinding },
      ]),
    ),
  getCrafter: () =>
    Object.fromEntries(
      crafterOriginalIds.map((id) => [id, { _originalId: id }]),
    ),
});
updateStandAloneSettings();

const pureRaw = makeFixture();
const pureOrder = [];
migrateSettingsRecord(pureRaw, {
  settingsSections,
  defaultResets: makePureResets(pureRaw, pureOrder),
  prestigeAscensionSkipCustom,
  techIds,
  marketPriorityIds,
  resourceIds,
  projectIds,
  buildings: buildingViews,
  crafterOriginalIds,
});

// Complete record equivalence, and identical reset order/arg.
assert.deepEqual(pureRaw, legacyRaw);
assert.deepEqual(pureOrder, legacyOrder);
assert.deepEqual(
  pureOrder.map((entry) => entry.name),
  resetNames,
);
assert.ok(pureOrder.every((entry) => entry.reset === false));

// ---- Focused assertions on the pure result ----

const settingsRaw = pureRaw;

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

// Default reset marker survived (defaults applied at the right point).
assert.equal(settingsRaw.someMarketDefault, "seeded");

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

// ---- Pure primitive unit tests ----

// applySettings fills only missing keys and coerces existing values to the default's type.
{
  const rec = { overrides: {}, triggers: [], count: "2" };
  applySettings(rec, { count: 0, enabled: true }, false);
  assert.strictEqual(rec.count, 2); // string -> number
  assert.strictEqual(rec.enabled, true); // filled

  const rec2 = { overrides: {}, triggers: [], flag: 5 };
  applySettings(rec2, { flag: "x" }, false);
  assert.strictEqual(rec2.flag, "5"); // number -> string
}

// applySettings with reset clears matching overrides and force-assigns.
{
  const rec = {
    overrides: { a: [{ ret: 1 }], b: [{ ret: 2 }] },
    triggers: [],
    a: 99,
  };
  applySettings(rec, { a: 1, c: 3 }, true);
  assert.strictEqual(rec.a, 1); // overwritten
  assert.strictEqual(rec.c, 3); // assigned
  assert.ok(!("a" in rec.overrides)); // matching override cleared
  assert.deepEqual(rec.overrides.b, [{ ret: 2 }]); // untouched
}

// migrateSetting renames the value + carries and maps overrides; keepOldValue preserves target.
{
  const rec = { overrides: { old: [{ ret: 4 }] }, triggers: [], old: 3 };
  migrateSetting(rec, "old", "new", (v) => Number(v) + 1);
  assert.strictEqual(rec.new, 4);
  assert.ok(!("old" in rec));
  assert.strictEqual(rec.overrides.new[0].ret, 5);
  assert.ok(!("old" in rec.overrides));

  const kept = { overrides: {}, triggers: [], oldKey: 7, newKey: "existing" };
  migrateSetting(kept, "oldKey", "newKey", (v) => v, true);
  assert.strictEqual(kept.newKey, "existing"); // target not overwritten
  assert.ok(!("oldKey" in kept)); // source still removed
}

console.log("Settings migration module tests passed");
