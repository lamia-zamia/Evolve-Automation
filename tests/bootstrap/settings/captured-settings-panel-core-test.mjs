import assert from "node:assert/strict";

import { createPage } from "../../support/fixtures/settings-panel-fixture.mjs";

// --- the panel appears, and appears once ---------------------------------------------------------

{
  const { panel, settings, root } = createPage(
    JSON.stringify({ autoBuild: true }),
  );
  assert.equal(root.querySelectorAll("#autoScriptContainer").length, 0);
  panel.ensurePanel();
  const container = root.querySelectorAll("#autoScriptContainer");
  assert.equal(container.length, 1, "the panel must be drawn into #resources");
  const toggles = root.querySelectorAll("#scriptToggles");
  assert.equal(toggles.length, 1);
  assert.equal(root.querySelectorAll("#script_settings").length, 1);
  assert.equal(root.querySelectorAll("#script_generalSettings").length, 1);
  assert.equal(root.querySelectorAll("button.script-collapsible").length, 16);
  for (const section of [
    "interface",
    "stateLog",
    "achievementGuard",
    "challengeHelper",
    "government",
    "authority",
    "prestige",
    "evolution",
    "planet",
    "trigger",
    "hell",
    "mech",
    "war",
    "weighting",
    "trait",
  ]) {
    assert.equal(
      root.querySelectorAll(`#script_${section}Settings`).length,
      1,
      `${section} settings should be rendered by the captured panel`,
    );
  }

  const firstCount = root.querySelectorAll("label").length;
  assert.ok(
    firstCount > 20,
    `expected the full toggle list, got ${firstCount}`,
  );
  panel.ensurePanel();
  panel.ensurePanel();
  assert.equal(
    root.querySelectorAll("#autoScriptContainer").length,
    1,
    "a redraw must not stack a second panel",
  );
  assert.equal(root.querySelectorAll("label").length, firstCount);

  const generalHeading = root.querySelectorAll("#generalSettingsCollapsed")[0];
  const generalContent = generalHeading.nextElementSibling;
  generalHeading.dispatch("click");
  assert.equal(settings.readRaw()["generalSettingsCollapsed"], true);
  assert.equal(generalContent.style.display, "none");
  generalHeading.dispatch("click");
  assert.equal(settings.readRaw()["generalSettingsCollapsed"], false);
  assert.equal(generalContent.style.display, "block");
}

// --- section resets use the host confirmation and update the shared record ----------------------

{
  const synchronized = [];
  const { panel, settings, root } = createPage(
    JSON.stringify({ autoBuild: true, activeTargetsUI: true }),
    {
      interfaceEffects: {
        syncActiveTargetsUI: (enabled) =>
          synchronized.push(["active", enabled]),
        syncBuildPlannerUI: (enabled) =>
          synchronized.push(["planner", enabled]),
      },
    },
  );
  panel.ensurePanel();
  root.querySelectorAll("#script_resetinterface")[0].dispatch("click");
  assert.equal(settings.readRaw()["activeTargetsUI"], false);
  assert.equal(settings.readRaw()["buildPlannerUI"], true);
  assert.deepEqual(synchronized, [
    ["active", false],
    ["planner", true],
  ]);
}

// Interface toggle callbacks reach the live panel synchronizer without a settings-panel reopen.
{
  const synchronized = [];
  const { panel, root } = createPage(
    JSON.stringify({ activeTargetsUI: false, buildPlannerUI: false }),
    {
      interfaceEffects: {
        syncActiveTargetsUI: (enabled) =>
          synchronized.push(["active", enabled]),
        syncBuildPlannerUI: (enabled) =>
          synchronized.push(["planner", enabled]),
      },
    },
  );
  panel.ensurePanel();
  const active = root.querySelectorAll(".script_activeTargetsUI")[0];
  active.checked = true;
  active.dispatch("change");
  const planner = root.querySelectorAll(".script_buildPlannerUI")[0];
  planner.checked = true;
  planner.dispatch("change");
  planner.checked = false;
  planner.dispatch("change");
  assert.deepEqual(synchronized, [
    ["active", true],
    ["planner", true],
    ["planner", false],
  ]);
}

// --- show settings has a usable caption and removes the panel when disabled ---------------------

{
  const { panel, settings, root, logged } = createPage(JSON.stringify({}));
  panel.ensurePanel();
  assert.deepEqual(logged, [], "the panel must draw with no stored settings");
  const showSettings = root.querySelectorAll(".script_showSettings")[0];
  assert.ok(showSettings, "the show-settings toggle should be rendered");
  assert.equal(
    root
      .querySelectorAll(".script-setting-label")
      .some(({ textContent }) => textContent.includes("Hide settings")),
    true,
  );
  showSettings.checked = false;
  showSettings.dispatch("change");
  assert.equal(settings.readRaw()["showSettings"], false);
  assert.equal(root.querySelectorAll("#script_settings").length, 0);
  panel.ensurePanel();
  assert.equal(root.querySelectorAll("#script_settings").length, 0);
  showSettings.checked = true;
  showSettings.dispatch("change");
  assert.equal(settings.readRaw()["showSettings"], true);
  assert.equal(root.querySelectorAll("#script_settings").length, 1);
}

// --- a fresh profile with no settings at all still gets a panel ----------------------------------

{
  const { panel, root, logged } = createPage(undefined);
  panel.ensurePanel();
  assert.equal(
    root.querySelectorAll("#autoScriptContainer").length,
    1,
    "a profile with no stored settings is exactly the case that needs the panel",
  );
  assert.deepEqual(logged, []);
}

// --- a stored toggle renders checked, and flipping one writes and persists -----------------------

{
  const { panel, settings, storage, root } = createPage(
    JSON.stringify({ autoBuild: true, autoResearch: false }),
  );
  panel.ensurePanel();
  const checkbox = root.querySelectorAll(".script_autoResearch")[0];
  assert.ok(checkbox, "every toggle gets a class-named input");
  assert.equal(checkbox.checked, undefined);

  const built = root.querySelectorAll(".script_autoBuild")[0];
  assert.equal(built.getAttribute("checked"), "");

  const tickRate = root.querySelectorAll(".script_tickRate")[0];
  assert.equal(tickRate.getAttribute("value"), "4");
  tickRate.value = "7";
  tickRate.dispatch("change");
  assert.equal(settings.readRaw()["tickRate"], 7);
  assert.equal(JSON.parse(storage.writes())["tickRate"], 7);
  tickRate.value = "not-a-number";
  tickRate.dispatch("change");
  assert.equal(settings.readRaw()["tickRate"], 7);
  assert.equal(JSON.parse(storage.writes())["tickRate"], 7);
  assert.equal(
    tickRate.value,
    "7",
    "invalid raw number edits restore the last valid value",
  );

  // Dispatch on the input itself, the same native event path used by the browser control.
  checkbox.checked = true;
  checkbox.dispatch("change");
  assert.equal(settings.readRaw()["autoResearch"], true);
  assert.equal(
    JSON.parse(storage.writes())["autoResearch"],
    true,
    "a flipped toggle must be persisted, not just held in memory",
  );
}

console.log("captured-settings-panel-core passed");
