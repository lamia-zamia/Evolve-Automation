import assert from "node:assert/strict";

import { createPage } from "../../support/fixtures/settings-panel-fixture.mjs";

// --- the complete raw A -> active override B -> raw C -> fallback C path survives reload ------

{
  const page = createPage(
    JSON.stringify({
      showSettings: true,
      generalSettingsCollapsed: false,
      tickRate: 4,
    }),
  );
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_tickRate")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  page.root
    .querySelectorAll("#script_tickRate_d")[0]
    .querySelectorAll("a")[0]
    .dispatch("click");

  const row = page.root.querySelectorAll("#script_tickRate_o0")[0];
  const conditionInputs = row.querySelectorAll("input");
  conditionInputs[0].checked = false;
  conditionInputs[0].dispatch("change");
  const result = conditionInputs.at(-1);
  result.value = "7";
  result.dispatch("change");
  assert.equal(page.settings.readRaw().tickRate, 4, "raw A is unchanged");
  assert.equal(page.settings.readRaw().overrides.tickRate[0].ret, 7);
  page.refreshEffectiveSettings();
  assert.equal(
    page.effectiveSettings.tickRate,
    7,
    "active override supplies B",
  );
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  assert.equal(
    page.root
      .querySelectorAll("#script_override_true_value")[0]
      .querySelectorAll("input")[0].value,
    "7",
    "the modal reads the effective value while raw still holds A",
  );

  target.value = "9";
  target.dispatch("change");
  assert.equal(page.settings.readRaw().tickRate, 9, "editor persists raw C");
  assert.equal(JSON.parse(page.storage.writes()).tickRate, 9);
  page.refreshEffectiveSettings();
  assert.equal(
    page.effectiveSettings.tickRate,
    7,
    "active override still supplies B after raw changes to C",
  );

  const savedWhileActive = page.storage.writes();
  const reloaded = createPage(savedWhileActive);
  reloaded.panel.ensurePanel();
  reloaded.refreshEffectiveSettings();
  assert.equal(reloaded.settings.readRaw().tickRate, 9);
  assert.equal(reloaded.settings.readRaw().overrides.tickRate[0].ret, 7);
  assert.equal(reloaded.effectiveSettings.tickRate, 7);

  const reloadedTarget = reloaded.root.querySelectorAll(".script_tickRate")[0];
  reloadedTarget.parentElement.dispatch("click", reloadedTarget, {
    ctrlKey: true,
  });
  const reloadedRow = reloaded.root.querySelectorAll("#script_tickRate_o0")[0];
  const reloadedConditionInputs = reloadedRow.querySelectorAll("input");
  reloadedConditionInputs[1].checked = true;
  reloadedConditionInputs[1].dispatch("change");
  reloaded.refreshEffectiveSettings();
  assert.equal(reloaded.settings.readRaw().tickRate, 9);
  assert.equal(
    reloaded.effectiveSettings.tickRate,
    9,
    "false condition falls back to independently persisted C",
  );
}

// --- malformed persisted rows and evaluator failures never replace the raw target -------------

{
  const page = createPage(
    JSON.stringify({
      autoBuild: false,
      overrides: {
        autoBuild: [
          null,
          { type1: "Boolean", arg1: false, type2: "Boolean", arg2: false },
          {
            type1: "UnknownOperand",
            arg1: "missing",
            type2: "Boolean",
            arg2: false,
            cmp: "==",
            ret: true,
          },
          {
            type1: "Boolean",
            arg1: false,
            type2: "Boolean",
            arg2: false,
            cmp: "UnknownComparator",
            ret: true,
          },
        ],
      },
    }),
  );
  page.panel.ensurePanel();
  assert.deepEqual(page.settings.readRaw().overrides.autoBuild, [
    {
      type1: "UnknownOperand",
      arg1: "missing",
      type2: "Boolean",
      arg2: false,
      cmp: "==",
      ret: true,
    },
    {
      type1: "Boolean",
      arg1: false,
      type2: "Boolean",
      arg2: false,
      cmp: "UnknownComparator",
      ret: true,
    },
  ]);
  page.refreshEffectiveSettings();
  assert.equal(page.settings.readRaw().autoBuild, false);
  assert.equal(
    page.effectiveSettings.autoBuild,
    false,
    "unsupported conditions fall back to raw",
  );
  assert.deepEqual(
    JSON.parse(page.storage.writes()).overrides.autoBuild,
    page.settings.readRaw().overrides.autoBuild,
  );
}

// Numeric input rejects a malformed free-form result instead of persisting NaN or text.
{
  const page = createPage(
    JSON.stringify({
      showSettings: true,
      generalSettingsCollapsed: false,
      tickRate: 4,
    }),
  );
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_tickRate")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  page.root
    .querySelectorAll("#script_tickRate_d")[0]
    .querySelectorAll("a")[0]
    .dispatch("click");
  const row = page.root.querySelectorAll("#script_tickRate_o0")[0];
  const inputs = row.querySelectorAll("input");
  inputs[0].checked = false;
  inputs[0].dispatch("change");
  const result = inputs.at(-1);
  result.value = "not-a-number";
  result.dispatch("change");
  assert.equal(page.settings.readRaw().overrides.tickRate[0].ret, 4);
  assert.equal(JSON.parse(page.storage.writes()).overrides.tickRate[0].ret, 4);
  page.refreshEffectiveSettings();
  assert.equal(page.effectiveSettings.tickRate, 4);
}

// String result input persists the authored value while leaving the base filename untouched.
{
  const page = createPage(
    JSON.stringify({
      showSettings: true,
      generalSettingsCollapsed: false,
      scriptSettingsExportFilename: "base-settings.json",
    }),
  );
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(
    ".script_scriptSettingsExportFilename",
  )[0];
  target.value = "current-settings.json";
  target.dispatch("change");
  assert.equal(
    page.settings.readRaw().scriptSettingsExportFilename,
    "current-settings.json",
  );
  assert.equal(
    JSON.parse(page.storage.writes()).scriptSettingsExportFilename,
    "current-settings.json",
  );
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  page.root
    .querySelectorAll("#script_scriptSettingsExportFilename_d")[0]
    .querySelectorAll("a")[0]
    .dispatch("click");
  const row = page.root.querySelectorAll(
    "#script_scriptSettingsExportFilename_o0",
  )[0];
  const inputs = row.querySelectorAll("input");
  inputs[0].checked = false;
  inputs[0].dispatch("change");
  const result = inputs.at(-1);
  result.value = "profile-settings.json";
  result.dispatch("change");
  assert.equal(
    page.settings.readRaw().scriptSettingsExportFilename,
    "current-settings.json",
  );
  assert.equal(
    page.settings.readRaw().overrides.scriptSettingsExportFilename[0].ret,
    "profile-settings.json",
  );
  page.refreshEffectiveSettings();
  assert.equal(
    page.effectiveSettings.scriptSettingsExportFilename,
    "profile-settings.json",
  );
}

// The top-level controls can open the same editor before the settings section is shown.
{
  const page = createPage(JSON.stringify({ showSettings: false }));
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_autoBuild")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  assert.equal(page.root.querySelectorAll("#script_autoBuildModal").length, 1);
}

// --- an editor-authored autoTax override still yields to the active tax task ------------------

{
  const page = createPage(JSON.stringify({ autoTax: true }));
  page.gameRoot.race.governor.tasks.tax = "tax";
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_autoTax")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  page.root
    .querySelectorAll("#script_autoTax_d")[0]
    .querySelectorAll("a")[0]
    .dispatch("click");
  const conditionInputs = page.root
    .querySelectorAll("#script_autoTax_o0")[0]
    .querySelectorAll("input");
  conditionInputs[1].checked = true;
  conditionInputs[1].dispatch("change");
  assert.equal(page.settings.readRaw().autoTax, true);
  assert.equal(page.settings.readRaw().overrides.autoTax.length, 1);
  page.refreshEffectiveSettings();
  assert.equal(page.effectiveSettings.autoTax, false);
}

// Presentation labels can collide; modifier-click still persists each setting's original key.
{
  const page = createPage(
    JSON.stringify({ autoBuild: false, autoResearch: false }),
  );
  page.panel.ensurePanel();
  for (const settingName of ["autoBuild", "autoResearch"]) {
    const input = page.root.querySelectorAll(`.script_${settingName}`)[0];
    const presentation = input.parentElement.children.find(
      ({ tagName }) => tagName === "span",
    );
    presentation.textContent = "Shared presentation label";
    input.parentElement.dispatch("click", input, { ctrlKey: true });
    page.root
      .querySelectorAll(`#script_${settingName}_d`)[0]
      .querySelectorAll("a")[0]
      .dispatch("click");
  }
  assert.equal(page.settings.readRaw().overrides.autoBuild.length, 1);
  assert.equal(page.settings.readRaw().overrides.autoResearch.length, 1);
  assert.equal(page.settings.readRaw().overrides.Shared, undefined);
}

// Resetting Jobs removes its dynamic overrides and refreshes the effective layer immediately.
{
  let effectiveRefreshes = 0;
  const page = createPage(
    JSON.stringify({
      autoCraftsmen: false,
      overrides: {
        autoCraftsmen: [
          {
            type1: "Boolean",
            arg1: false,
            type2: "Boolean",
            arg2: false,
            cmp: "==",
            ret: true,
          },
        ],
      },
    }),
    {
      allSections: true,
      capturedJobControlIds: ["civ-unemployed", "civ-farmer"],
      onEffectiveSettingsRefresh: () => effectiveRefreshes++,
    },
  );
  page.gameRoot.civic.unemployed.assigned = 0;
  page.gameRoot.civic.farmer.assigned = 0;
  page.panel.ensurePanel();
  assert.equal(page.effectiveSettings.autoCraftsmen, true);
  const reset = page.root.querySelectorAll("#script_resetjob")[0];
  assert.ok(reset, "the captured Jobs settings section should be available");

  const beforeReset = effectiveRefreshes;
  reset.dispatch("click");

  assert.equal(page.settings.readRaw().autoCraftsmen, false);
  assert.equal(page.settings.readRaw().overrides.autoCraftsmen, undefined);
  assert.equal(page.effectiveSettings.autoCraftsmen, false);
  assert.equal(effectiveRefreshes, beforeReset + 1);
}

console.log("captured-settings-panel-override-lifecycle passed");
