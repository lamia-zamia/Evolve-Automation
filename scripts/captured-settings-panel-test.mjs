import assert from "node:assert/strict";

import { createCapturedSettingsPanel } from "../src/bootstrap/captured-settings-panel-control.ts";
import { createCapturedMech } from "../src/adapters/evolve/combat/captured-mech.ts";
import { createSettingsStore } from "../src/adapters/browser/settings-store.ts";
import { createCapturedSettingsDefaults } from "../src/adapters/evolve/captured-settings-defaults.ts";
import { createCapturedSettingsLifecycle } from "../src/application/captured-settings-lifecycle.ts";
import { createCapturedOverrideEvaluation } from "../src/adapters/evolve/captured-override-evaluation.ts";
import { createOverrideSettings } from "../src/application/override-settings.ts";
import { overrideComparisons } from "../src/settings/override-comparators.ts";
import { planCapturedMechBuild } from "../src/domain/combat/captured-mech.ts";
import { settingsSections } from "../src/adapters/evolve/runtime-catalogs.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

/** A root carrying enough of each captured catalog for every settings section to draw a table. */
function createFullGameRoot() {
  const resource = (extra) => ({
    display: true,
    amount: 10,
    max: 100,
    diff: 0,
    trade: 0,
    stackable: true,
    ...extra,
  });
  return {
    race: { universe: "standard", governor: { tasks: {} }, species: "human" },
    civic: {
      d_job: "unemployed",
      unemployed: { job: "unemployed", workers: 10, max: -1, display: true },
      farmer: { job: "farmer", workers: 0, max: -1, display: true },
    },
    resource: {
      Food: resource({ title: "Food", tradable: true }),
      Lumber: resource({ title: "Lumber", tradable: true }),
      Iron: resource({ title: "Iron", tradable: true }),
      Plywood: resource({ title: "Plywood" }),
      Elerium: resource({ title: "Elerium" }),
    },
    arpa: { launch_facility: { display: true } },
    tech: {},
    city: {},
    space: {},
    interstellar: {},
  };
}

/**
 * The lifecycle's own defaults start every section collapsed, and a collapsed section does not
 * build its contents. These tests assert on the controls inside them, so the stored record opens
 * them up front unless the case under test says otherwise.
 */
function withSectionsExpanded(settingsText) {
  const stored = settingsText === undefined ? {} : JSON.parse(settingsText);
  const expanded = {};
  for (const id of settingsSections) {
    expanded[`${id}SettingsCollapsed`] = false;
  }
  return JSON.stringify({ ...expanded, ...stored });
}

/** A `localStorage` stand-in that records what the panel writes back. */
function createStorage(initial) {
  const items = new Map(initial === undefined ? [] : [["settings", initial]]);
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    writes: () => items.get("settings"),
  };
}

function createPage(
  settingsText,
  {
    platform = "Win32",
    url = "https://x/",
    confirmAnswer = true,
    collapsed = false,
    allSections = false,
  } = {},
) {
  const storedText = collapsed
    ? settingsText
    : withSectionsExpanded(settingsText);
  const root = element("div", { id: "root" });
  const resources = element("div", { id: "resources" });
  const settingsTab = element("div");
  settingsTab.classList.add("settings");
  // The game's own save import/export block, plus the Google Drive block 1.5.0 added after it.
  // The script's buttons belong under the first, which is the one holding `#importExport`.
  const saveTransfer = element("div");
  saveTransfer.classList.add("importExport");
  const saveField = element("div", { id: "importExport" });
  const saveText = element("textarea");
  saveField.appendChild(saveText);
  saveTransfer.appendChild(saveField);
  const driveTransfer = element("div");
  driveTransfer.classList.add("importExport");
  settingsTab.appendChild(saveTransfer);
  settingsTab.appendChild(driveTransfer);
  root.appendChild(resources);
  root.appendChild(settingsTab);
  const document = createTestDocument(root);
  const storage = createStorage(storedText);
  const logged = [];
  const diagnostics = [];
  const confirmed = [];
  const downloads = [];
  const pageWindow = {
    document,
    navigator: { platform },
    location: url,
    confirm: (message) => {
      confirmed.push(message);
      return confirmAnswer;
    },
    setTimeout: (callback) => callback(),
    URL: {
      createObjectURL: (blob) => {
        downloads.push(blob.parts.join(""));
        return "blob:settings";
      },
      revokeObjectURL: () => {},
    },
    Blob: class {
      constructor(parts) {
        this.parts = parts;
      }
    },
  };
  const settings = createSettingsStore({
    storage,
    logError: (message) => logged.push(message),
  });
  const gameRoot = allSections
    ? createFullGameRoot()
    : { race: { governor: { tasks: {} } } };
  const rootState = {
    readRoot: () => gameRoot,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const sectionControls = {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-method" }),
    capturedElementIds: () => [],
  };
  // Every game-backed section, wired to one minimal root. These sections are skipped entirely
  // when their capture is absent, so without this the panel's whole lower half goes untested.
  const gameBackedSections = !allSections
    ? {}
    : {
        craftToggles: { rootState, controls: sectionControls },
        buildingSettings: { rootState, controls: sectionControls },
        projectSettings: { rootState, controls: sectionControls },
        storageSettings: { rootState, controls: sectionControls },
        marketSettings: { rootState, controls: sectionControls },
        ejectorSettings: { rootState, controls: sectionControls },
        magicSettings: { rootState, controls: sectionControls },
        productionSettings: { rootState },
        researchSettings: { rootState, controls: sectionControls },
        fleetSettings: { controls: sectionControls },
      };
  const settingsLifecycle = createCapturedSettingsLifecycle({
    settings,
    defaults: createCapturedSettingsDefaults({
      rootState: { readRoot: () => gameRoot },
      controls: { capturedElementIds: () => [] },
    }),
  });
  const effectiveSettings = settingsLifecycle.readEffective();
  const overrideSettings = createOverrideSettings({
    getSafeMode: () => false,
    getSettings: () => effectiveSettings,
    getSettingsRaw: settingsLifecycle.readRaw,
    source: createCapturedOverrideEvaluation({
      rootState: { readRoot: () => gameRoot },
      readSettings: settingsLifecycle.readRaw,
      comparatorSource: {
        comparisons: overrideComparisons,
        rightOperandComparators: ["A?B", "!A?B"],
      },
    }),
    reporter: { report: () => {} },
    display: { publish: () => {} },
  });
  const refreshEffectiveSettings = () => overrideSettings.updateOverrides();
  const panel = createCapturedSettingsPanel({
    capturedPanelWindow: pageWindow,
    settings,
    settingsLifecycle,
    refreshEffectiveSettings,
    ...gameBackedSections,
    traitSettings: { rootState },
    onDiagnostic: (message) => diagnostics.push(message),
    logError: (message) => logged.push(message),
  });
  return {
    panel,
    settings,
    storage,
    root,
    logged,
    diagnostics,
    confirmed,
    downloads,
    saveText,
    effectiveSettings,
    gameRoot,
    refreshEffectiveSettings,
  };
}

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

// --- captured Mech settings render once and persist through the shared lifecycle ----------------

{
  const page = createPage(
    JSON.stringify({ autoMech: false, mechBuild: "none" }),
  );
  page.panel.ensurePanel();
  assert.equal(page.root.querySelectorAll("#script_mechSettings").length, 1);
  const buildMode = page.root.querySelectorAll(".script_mechBuild")[0];
  assert.ok(buildMode, "the captured Mech settings section exposes build mode");
  buildMode.value = "user";
  buildMode.dispatch("change");
  assert.equal(page.settings.readRaw().mechBuild, "user");
  assert.equal(JSON.parse(page.storage.writes()).mechBuild, "user");
  page.panel.ensurePanel();
  assert.equal(
    page.root.querySelectorAll("#script_mechSettings").length,
    1,
    "repeated panel discovery must not add another Mech section",
  );
}

// --- active Mech overrides reach the captured Mech planner --------------------------------------

{
  const page = createPage(
    JSON.stringify({
      autoMech: true,
      mechBuild: "random",
      overrides: {
        mechBuild: [
          {
            type1: "Boolean",
            arg1: false,
            type2: "Boolean",
            arg2: false,
            cmp: "==",
            ret: "user",
          },
        ],
      },
    }),
  );
  page.panel.ensurePanel();
  assert.equal(page.settings.readRaw().mechBuild, "random");
  assert.equal(page.effectiveSettings.mechBuild, "user");
  page.gameRoot.settings = { qKey: false, keyMap: { q: "q" } };
  page.gameRoot.portal = {
    mechbay: {
      max: 10,
      bay: 0,
      active: 0,
      scouts: 0,
      mechs: [],
      blueprint: {
        size: "small",
        chassis: "tread",
        hardpoint: ["laser"],
        equip: [],
        infernal: false,
      },
    },
    purifier: { supply: 75_000, sup_max: 100_000 },
  };
  page.gameRoot.resource = { Soul_Gem: { amount: 1 } };
  const assembly = {
    elementId: "mechAssembly",
    generation: 1,
    methods: ["build", "bay", "price", "soul"],
  };
  const controls = {
    resolve: (id) => (id === "mechAssembly" ? assembly : undefined),
    invoke: (_handle, method) => {
      if (method === "bay") return { ok: true, value: 1 };
      if (method === "price") return { ok: true, value: 75_000 };
      if (method === "soul") return { ok: true, value: 1 };
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => ["mechAssembly"],
  };
  const mech = createCapturedMech({
    rootState: {
      readRoot: () => page.gameRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => page.effectiveSettings,
    keyState: { readPressed: () => false },
  });
  assert.deepEqual(planCapturedMechBuild(mech.reader.read()), {
    kind: "build-captured-mech",
    designSize: "small",
    expectedBaySpace: 10,
    expectedPurifierSupply: 75_000,
    expectedSoulGems: 1,
  });
}

// --- the captured Mech reset uses lifecycle defaults and removes its overrides ------------------

{
  const page = createPage(
    JSON.stringify({
      autoMech: true,
      mechBuild: "none",
      overrides: {
        mechBuild: [
          {
            type1: "Boolean",
            arg1: false,
            type2: "Boolean",
            arg2: false,
            cmp: "==",
            ret: "user",
          },
        ],
      },
    }),
  );
  page.panel.ensurePanel();
  page.root.querySelectorAll("#script_resetmech")[0].dispatch("click");
  assert.equal(page.settings.readRaw().autoMech, false);
  assert.equal(page.settings.readRaw().mechBuild, "random");
  assert.equal(page.settings.readRaw().overrides.mechBuild, undefined);
  const persisted = JSON.parse(page.storage.writes());
  assert.equal(persisted.mechBuild, "random");
  assert.equal(persisted.overrides.mechBuild, undefined);
  assert.equal(
    page.root.querySelectorAll(".script_autoMech")[0].checked,
    false,
  );
}

// --- section resets use the host confirmation and update the shared record ----------------------

{
  const { panel, settings, root } = createPage(
    JSON.stringify({ autoBuild: true, activeTargetsUI: true }),
  );
  panel.ensurePanel();
  root.querySelectorAll("#script_resetinterface")[0].dispatch("click");
  assert.equal(settings.readRaw()["activeTargetsUI"], false);
  assert.equal(settings.readRaw()["buildPlannerUI"], true);
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

// --- the captured settings UI opens and edits the persisted override definition ---------------

{
  const page = createPage(JSON.stringify({ autoBuild: false }));
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_autoBuild")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  assert.equal(
    page.root.querySelectorAll("#script_autoBuildModal").length,
    1,
    "Ctrl-clicking a captured setting opens the real override editor",
  );
  assert.deepEqual(page.diagnostics, []);

  const add = page.root
    .querySelectorAll("#script_autoBuild_d")[0]
    .querySelectorAll("a")[0];
  add.dispatch("click");
  assert.equal(page.settings.readRaw().autoBuild, false);
  assert.equal(page.settings.readRaw().overrides.autoBuild.length, 1);

  const row = page.root.querySelectorAll("#script_autoBuild_o0")[0];
  const conditionInputs = row.querySelectorAll("input");
  conditionInputs[0].checked = false;
  conditionInputs[0].dispatch("change");
  const resultInput = conditionInputs.at(-1);
  resultInput.checked = true;
  resultInput.dispatch("change");
  assert.equal(page.settings.readRaw().autoBuild, false);
  assert.equal(page.effectiveSettings.autoBuild, true);

  // Editing the base setting while the override matches changes raw state only.
  target.checked = true;
  target.dispatch("change");
  assert.equal(page.settings.readRaw().autoBuild, true);
  assert.equal(page.effectiveSettings.autoBuild, true);

  // The condition stops matching, so the effective value falls back to the new raw value.
  conditionInputs[1].checked = true;
  conditionInputs[1].dispatch("change");
  assert.equal(page.effectiveSettings.autoBuild, true);

  // Editing the override itself still leaves the base value alone.
  conditionInputs[1].checked = false;
  conditionInputs[1].dispatch("change");
  const editedResult = row.querySelectorAll("input").at(-1);
  editedResult.checked = false;
  editedResult.dispatch("change");
  assert.equal(page.settings.readRaw().autoBuild, true);
  assert.equal(page.settings.readRaw().overrides.autoBuild[0].ret, false);
  assert.equal(page.effectiveSettings.autoBuild, false);

  const savedWithOverride = page.storage.writes();
  const reloaded = createPage(savedWithOverride);
  reloaded.panel.ensurePanel();
  assert.equal(reloaded.settings.readRaw().autoBuild, true);
  assert.equal(reloaded.settings.readRaw().overrides.autoBuild.length, 1);
  assert.equal(reloaded.effectiveSettings.autoBuild, false);

  // Deleting the authored definition restores the raw value and persists the deletion.
  const remove = page.root
    .querySelectorAll("#script_autoBuild_o0")[0]
    .querySelectorAll("a")[0];
  remove.dispatch("click");
  assert.equal(page.settings.readRaw().overrides.autoBuild, undefined);
  assert.equal(page.settings.readRaw().autoBuild, true);
  assert.equal(page.effectiveSettings.autoBuild, true);
  assert.equal(
    JSON.parse(page.storage.writes()).overrides.autoBuild,
    undefined,
  );
}

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
    "base-settings.json",
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

// --- an enable callback for an unported section is reported by name, once ------------------------

{
  const { panel, logged, diagnostics } = createPage(
    JSON.stringify({ autoMech: true }),
  );
  panel.ensurePanel();
  const mech = diagnostics.filter((line) => line.includes("mech info panel"));
  assert.equal(
    mech.length,
    1,
    `expected one diagnostic, got ${diagnostics.length}`,
  );
  assert.match(mech[0], /not ported yet/);
  assert.deepEqual(logged, []);
}

// --- platform and safe mode -----------------------------------------------------------------------

{
  const { panel, root } = createPage(JSON.stringify({}), {
    platform: "MacIntel",
  });
  panel.ensurePanel();
  const label = root
    .querySelectorAll("label")
    .map((node) => node.textContent)
    .join(" ");
  assert.match(label, /Alt\+click/, "macOS uses Alt for the override chord");
}

{
  const { panel, root } = createPage(JSON.stringify({}), {
    url: "https://x/#safemode",
  });
  panel.ensurePanel();
  const text = root
    .querySelectorAll("p")
    .map((node) => node.textContent)
    .join(" ");
  assert.match(text, /Safe mode active/);
}

// --- a host with no document has no panel, silently ----------------------------------------------

{
  const logged = [];
  const settings = createSettingsStore({ storage: createStorage("{}") });
  const panel = createCapturedSettingsPanel({
    capturedPanelWindow: {},
    settings,
    settingsLifecycle: createCapturedSettingsLifecycle({
      settings,
      defaults: createCapturedSettingsDefaults({
        rootState: { readRoot: () => ({}) },
        controls: { capturedElementIds: () => [] },
      }),
    }),
    logError: (message) => logged.push(message),
  });
  panel.ensurePanel();
  panel.ensurePanel();
  assert.deepEqual(
    logged,
    [],
    "a host with no DOM is an expected shape, not an error to report",
  );
}

// --- import/export buttons: the player's way to configure every ported feature ------------------

{
  const { panel, root, saveText, settings, storage, downloads } = createPage(
    JSON.stringify({ autoBuild: true }),
  );
  panel.ensurePanel();
  const buttons = root.querySelectorAll("#script_importExportButtons");
  assert.equal(buttons.length, 1, "the script's buttons should be drawn once");
  // Anchored under the block holding the game's own save field, not under the Google Drive block
  // 1.5.0 appended after it.
  const siblings = buttons[0].parentElement.children;
  const precedingBlock = siblings[siblings.indexOf(buttons[0]) - 1];
  assert.equal(precedingBlock.querySelectorAll("#importExport").length, 1);
  panel.ensurePanel();
  assert.equal(root.querySelectorAll("#script_importExportButtons").length, 1);

  // Export writes the live record into the game's field and copies it.
  root.querySelectorAll("#script_settingsExport")[0].dispatch("click");
  assert.deepEqual(JSON.parse(saveText.value), settings.readRaw());

  // Import replaces the record, persists it, and clears the field.
  saveText.value = JSON.stringify({ autoBuild: false, autoResearch: true });
  root.querySelectorAll("#script_settingsImport")[0].dispatch("click");
  assert.equal(saveText.value, "");
  assert.equal(settings.readRaw()["autoBuild"], false);
  assert.equal(settings.readRaw()["autoResearch"], true);
  assert.equal(settings.readRaw()["autoJobs"], false);
  assert.equal(settings.readRaw()["tickRate"], 4);
  assert.equal(JSON.parse(storage.writes())["autoResearch"], true);
  // The panel drawn from the replaced record is gone, and the next tick rebuilds it.
  assert.equal(root.querySelectorAll("#autoScriptContainer").length, 0);
  panel.ensurePanel();
  assert.equal(root.querySelectorAll("#autoScriptContainer").length, 1);

  // The file button hands the page a pretty-printed copy.
  root.querySelectorAll("#script_settingsFile")[0].dispatch("click");
  assert.equal(downloads.length, 1);
  assert.equal(JSON.parse(downloads[0])["autoResearch"], true);
  assert.ok(
    downloads[0].split("\n").length > 1,
    "the file copy is pretty printed",
  );
}

// --- a blob that is not settings is refused, and one carrying code asks first ---------------------

{
  const { panel, root, saveText, settings, logged } = createPage(
    JSON.stringify({ autoBuild: true }),
  );
  panel.ensurePanel();
  const importButton = root.querySelectorAll("#script_settingsImport")[0];

  for (const [text, reason] of [
    ["{", /not valid JSON/],
    ["[1,2]", /not a settings object/],
  ]) {
    saveText.value = text;
    importButton.dispatch("click");
    assert.equal(settings.readRaw()["autoBuild"], true, text);
    assert.match(logged.at(-1), reason);
    assert.equal(saveText.value, text, "a refused blob stays in the field");
  }
  saveText.value = "{}";
  importButton.dispatch("click");
  assert.equal(settings.readRaw()["autoBuild"], false);
  assert.equal(saveText.value, "");
}

{
  // An imported custom expression is code the evaluator will run, so it is shown and confirmed.
  const withEval = JSON.stringify({
    autoBuild: false,
    triggers: [{ requirementType: "Eval", requirementId: "fetch('/x')" }],
    overrides: {
      autoResearch: [{ type1: "Eval", arg1: "alert(1)", type2: "Number" }],
      log_prestige_format: [{ ret: "{eval:document.cookie}" }],
    },
  });

  const refused = createPage(JSON.stringify({ autoBuild: true }), {
    confirmAnswer: false,
  });
  refused.panel.ensurePanel();
  refused.saveText.value = withEval;
  refused.root.querySelectorAll("#script_settingsImport")[0].dispatch("click");
  assert.equal(refused.settings.readRaw()["autoBuild"], true);
  const warning = refused.confirmed.at(-1);
  for (const source of ["alert(1)", "fetch('/x')", "{eval:document.cookie}"]) {
    assert.ok(warning.includes(source), `${source} should be shown`);
  }

  const accepted = createPage(JSON.stringify({ autoBuild: true }));
  accepted.panel.ensurePanel();
  accepted.saveText.value = withEval;
  accepted.root.querySelectorAll("#script_settingsImport")[0].dispatch("click");
  assert.equal(accepted.settings.readRaw()["autoBuild"], false);
}

// --- the store itself -----------------------------------------------------------------------------

{
  const corrupt = createStorage("not json");
  const logged = [];
  const store = createSettingsStore({
    storage: corrupt,
    logError: (message) => logged.push(message),
  });
  assert.deepEqual(store.readRaw(), {});
  assert.equal(logged.length, 1);
  assert.match(logged[0], /could not be parsed/);

  // An array is a valid JSON document and an invalid settings blob.
  const arrayStore = createSettingsStore({ storage: createStorage("[1,2]") });
  assert.deepEqual(arrayStore.readRaw(), {});

  // The record is the same object across reads, so a UI write is visible to the runtime at once.
  const live = createSettingsStore({ storage: createStorage('{"a":1}') });
  assert.equal(live.readRaw(), live.readRaw());
  live.readRaw()["b"] = 2;
  assert.equal(live.readRaw()["b"], 2);

  // Absent storage is survivable rather than fatal: nothing to read, nothing to write.
  const none = createSettingsStore({ storage: undefined });
  assert.deepEqual(none.readRaw(), {});
  none.persist();
}

console.log("captured settings panel tests passed");

// --- every game-backed section renders when its capture is present ------------------------------

{
  const { panel, root, diagnostics, logged } = createPage(
    JSON.stringify({
      autoBuild: true,
      autoARPA: true,
      autoStorage: true,
      autoMarket: true,
      autoEject: true,
      autoSupply: true,
    }),
    { allSections: true },
  );
  panel.ensurePanel();
  for (const section of [
    "general",
    "interface",
    "stateLog",
    "achievementGuard",
    "challengeHelper",
    "government",
    "authority",
    "prestige",
    "evolution",
    "planet",
    "hell",
    "mech",
    "war",
    "weighting",
    "building",
    "project",
    "storage",
    "market",
    "ejector",
    "magic",
    "production",
    "trait",
  ]) {
    assert.equal(
      root.querySelectorAll(`#script_${section}Settings`).length,
      1,
      `${section} settings should render once every capture is present`,
    );
  }
  // Every section's reset button is drawn, and clicking one must not throw.
  for (const section of [
    "building",
    "market",
    "storage",
    "production",
    "war",
  ]) {
    const reset = root.querySelectorAll(`#script_reset${section}`)[0];
    assert.ok(reset, `${section} should offer a reset button`);
    reset.dispatch("click");
  }
  assert.deepEqual(logged, []);
  // Sections that genuinely have no capture yet must still say so by name, and only those.
  for (const message of diagnostics) {
    assert.match(message, /not ported yet/);
  }
}
