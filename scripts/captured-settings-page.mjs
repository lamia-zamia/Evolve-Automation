/**
 * A captured settings panel over an in-memory store, with the same raw/effective wiring
 * `captured-runtime-control.ts` composes. Shared by the per-section end-to-end tests so a test
 * about one section does not restate the whole composition.
 *
 * Note the effective layer delegates to the raw record through its prototype: pass
 * `page.effective` itself to a runtime consumer, never a copy of it.
 */

import assert from "node:assert/strict";

import { createCapturedSettingsPanel } from "../src/bootstrap/captured-settings-panel-control.ts";
import { createSettingsStore } from "../src/adapters/browser/settings-store.ts";
import { createCapturedSettingsDefaults } from "../src/adapters/evolve/captured-settings-defaults.ts";
import { createCapturedSettingsLifecycle } from "../src/application/captured-settings-lifecycle.ts";
import { createCapturedOverrideEvaluation } from "../src/adapters/evolve/captured-override-evaluation.ts";
import { createOverrideSettings } from "../src/application/override-settings.ts";
import { overrideComparisons } from "../src/settings/override-comparators.ts";
import { settingsSections } from "../src/adapters/evolve/runtime-catalogs.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

export function createCapturedSettingsPage(stored = {}) {
  const expanded = {};
  for (const id of settingsSections) expanded[`${id}SettingsCollapsed`] = false;
  const items = new Map([
    ["settings", JSON.stringify({ ...expanded, ...stored })],
  ]);
  const storage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    writes: () => items.get("settings"),
  };
  const root = element("div", { id: "root" });
  const resources = element("div", { id: "resources" });
  const settingsTab = element("div");
  settingsTab.classList.add("settings");
  root.appendChild(resources);
  root.appendChild(settingsTab);
  const document = createTestDocument(root);
  const diagnostics = [];
  const logged = [];
  const pageWindow = {
    document,
    navigator: { platform: "Win32" },
    location: "https://x/",
    confirm: () => true,
    setTimeout: (callback) => callback(),
  };
  const settings = createSettingsStore({
    storage,
    logError: (message) => logged.push(message),
  });
  const gameRoot = { race: { governor: { tasks: {} } } };
  const settingsLifecycle = createCapturedSettingsLifecycle({
    settings,
    defaults: createCapturedSettingsDefaults({
      rootState: { readRoot: () => gameRoot },
      controls: { capturedElementIds: () => [] },
    }),
  });
  const effective = settingsLifecycle.readEffective();
  const overrideSettings = createOverrideSettings({
    getSafeMode: () => false,
    getSettings: () => effective,
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
  // The one game-backed capture the secondary options surface needs. An empty control registry is
  // enough: the Fleet read model is static copy plus settings-record priorities.
  const sectionControls = {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-method" }),
    capturedElementIds: () => [],
  };
  const panel = createCapturedSettingsPanel({
    capturedPanelWindow: pageWindow,
    settings,
    settingsLifecycle,
    fleetSettings: { controls: sectionControls },
    refreshEffectiveSettings: () => overrideSettings.updateOverrides(),
    onDiagnostic: (message) => diagnostics.push(message),
    logError: (message) => logged.push(message),
  });
  panel.ensurePanel();
  return {
    panel,
    root,
    settings,
    storage,
    effective,
    diagnostics,
    logged,
    refreshEffectiveSettings: () => overrideSettings.updateOverrides(),
  };
}

/** Sets one drawn control the way the player would, and returns the page. */
export function edit(page, settingName, value) {
  const [control] = page.root.querySelectorAll(`.script_${settingName}`);
  assert.ok(control, `${settingName} must be drawn by the captured panel`);
  if (typeof value === "boolean") control.checked = value;
  else control.value = String(value);
  control.dispatch("change");
  return page;
}
