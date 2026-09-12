import assert from "node:assert/strict";

import { createCapturedSettingsPanel } from "../src/bootstrap/captured-settings-panel-control.ts";
import { createSettingsStore } from "../src/adapters/browser/settings-store.ts";
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
  { platform = "Win32", url = "https://x/" } = {},
) {
  const root = element("div", { id: "root" });
  const resources = element("div", { id: "resources" });
  const settingsTab = element("div");
  settingsTab.classList.add("settings");
  root.appendChild(resources);
  root.appendChild(settingsTab);
  const document = createTestDocument(root);
  const storage = createStorage(settingsText);
  const logged = [];
  const pageWindow = {
    document,
    navigator: { platform },
    location: url,
    confirm: () => true,
    setTimeout: (callback) => callback(),
  };
  const settings = createSettingsStore({
    storage,
    logError: (message) => logged.push(message),
  });
  const panel = createCapturedSettingsPanel({
    capturedPanelWindow: pageWindow,
    settings,
    logError: (message) => logged.push(message),
  });
  return { panel, settings, storage, root, logged };
}

// --- the panel appears, and appears once ---------------------------------------------------------

{
  const { panel, root } = createPage(JSON.stringify({ autoBuild: true }));
  assert.equal(root.querySelectorAll("#autoScriptContainer").length, 0);
  panel.ensurePanel();
  const container = root.querySelectorAll("#autoScriptContainer");
  assert.equal(container.length, 1, "the panel must be drawn into #resources");
  const toggles = root.querySelectorAll("#scriptToggles");
  assert.equal(toggles.length, 1);
  assert.equal(root.querySelectorAll("#script_settings").length, 1);
  assert.equal(root.querySelectorAll("#script_settingsVisibility").length, 1);
  assert.equal(
    root.querySelectorAll("#script_settingsVisibility")[0].textContent,
    "Hide settings",
  );
  assert.equal(root.querySelectorAll("#script_generalSettings").length, 1);
  for (const section of [
    "interface",
    "stateLog",
    "achievementGuard",
    "challengeHelper",
    "authority",
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
  assert.equal(
    root.querySelectorAll("#script_settingsVisibility")[0].textContent,
    "Show settings",
  );
  panel.ensurePanel();
  assert.equal(root.querySelectorAll("#script_settings").length, 0);
  root.querySelectorAll("#script_settingsVisibility")[0].dispatch("click");
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

// --- an enable callback for an unported section is reported by name, once ------------------------

{
  const { panel, logged } = createPage(JSON.stringify({ autoMech: true }));
  panel.ensurePanel();
  const mech = logged.filter((line) => line.includes("mech info panel"));
  assert.equal(mech.length, 1, `expected one report, got ${logged.length}`);
  assert.match(mech[0], /not ported yet/);
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
