import assert from "node:assert/strict";

import { createCapturedSettingsPanel } from "../src/bootstrap/captured-settings-panel-control.ts";
import { createSettingsStore } from "../src/adapters/browser/settings-store.ts";
import { createCapturedSettingsDefaults } from "../src/adapters/evolve/captured-settings-defaults.ts";
import { createCapturedSettingsLifecycle } from "../src/application/captured-settings-lifecycle.ts";
import { createCapturedOverrideEvaluation } from "../src/adapters/evolve/captured-override-evaluation.ts";
import { createOverrideSettings } from "../src/application/override-settings.ts";
import { overrideComparisons } from "../src/settings/override-comparators.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

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
    useLifecycle = false,
  } = {},
) {
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
  const storage = createStorage(settingsText);
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
  const gameRoot = { race: { governor: { tasks: {} } } };
  const settingsLifecycle = useLifecycle
    ? createCapturedSettingsLifecycle({
        settings,
        defaults: createCapturedSettingsDefaults({
          rootState: { readRoot: () => gameRoot },
          controls: { capturedElementIds: () => [] },
        }),
      })
    : undefined;
  const effectiveSettings = settingsLifecycle?.readEffective();
  const overrideSettings =
    settingsLifecycle === undefined
      ? undefined
      : createOverrideSettings({
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
  const panel = createCapturedSettingsPanel({
    capturedPanelWindow: pageWindow,
    settings,
    settingsLifecycle,
    refreshEffectiveSettings: () => overrideSettings?.updateOverrides(),
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
  assert.equal(root.querySelectorAll("button.script-collapsible").length, 8);
  for (const section of [
    "interface",
    "stateLog",
    "achievementGuard",
    "challengeHelper",
    "authority",
    "hell",
    "weighting",
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
  const { panel, settings, root } = createPage(
    JSON.stringify({ autoBuild: true, activeTargetsUI: true }),
    { useLifecycle: true },
  );
  panel.ensurePanel();
  root.querySelectorAll("#script_resetinterface")[0].dispatch("click");
  assert.equal(settings.readRaw()["activeTargetsUI"], false);
  assert.equal(settings.readRaw()["buildPlannerUI"], true);
}

// --- show settings has a usable caption and removes the panel when disabled ---------------------

{
  const { panel, settings, root } = createPage(JSON.stringify({}));
  panel.ensurePanel();
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
  const page = createPage(JSON.stringify({ autoBuild: false }), {
    useLifecycle: true,
  });
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
  const reloaded = createPage(savedWithOverride, { useLifecycle: true });
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

// The top-level controls can open the same editor before the settings section is shown.
{
  const page = createPage(JSON.stringify({ showSettings: false }), {
    useLifecycle: true,
  });
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_autoBuild")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  assert.equal(page.root.querySelectorAll("#script_autoBuildModal").length, 1);
}

// --- a captured override still yields to governor/task suppression ------------------------------

{
  const page = createPage(JSON.stringify({ autoStorage: true }), {
    useLifecycle: true,
  });
  page.gameRoot.race.governor.tasks.storage = "storage";
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_autoStorage")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  page.root
    .querySelectorAll("#script_autoStorage_d")[0]
    .querySelectorAll("a")[0]
    .dispatch("click");
  const conditionInputs = page.root
    .querySelectorAll("#script_autoStorage_o0")[0]
    .querySelectorAll("input");
  conditionInputs[1].checked = true;
  conditionInputs[1].dispatch("change");
  assert.equal(page.settings.readRaw().autoStorage, true);
  assert.equal(page.settings.readRaw().overrides.autoStorage.length, 1);
  assert.equal(page.effectiveSettings.autoStorage, false);
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
  const panel = createCapturedSettingsPanel({
    capturedPanelWindow: {},
    settings: createSettingsStore({ storage: createStorage("{}") }),
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
    { useLifecycle: true },
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
    { useLifecycle: true },
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
