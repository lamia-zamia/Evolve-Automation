import { createCapturedSettingsPanel } from "../../../src/bootstrap/captured-settings-panel-control.ts";
import { createPageFileDownload } from "../../../src/adapters/browser/file-download.ts";
import { createSettingsStore } from "../../../src/adapters/browser/settings-store.ts";
import { createCapturedSettingsDefaults } from "../../../src/adapters/evolve/captured-settings-defaults.ts";
import { createCapturedSettingsLifecycle } from "../../../src/application/captured-settings-lifecycle.ts";
import { createCapturedOverrideEvaluation } from "../../../src/adapters/evolve/captured-override-evaluation.ts";
import { createOverrideSettings } from "../../../src/application/override-settings.ts";
import { overrideComparisons } from "../../../src/domain/override-comparators.ts";
import { settingsSections } from "../../../src/adapters/evolve/runtime-catalogs.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

/** A root carrying enough of each captured catalog for every settings section to draw a table. */
export function createFullGameRoot() {
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
export function withSectionsExpanded(settingsText) {
  const stored = settingsText === undefined ? {} : JSON.parse(settingsText);
  const expanded = {};
  for (const id of settingsSections) {
    expanded[`${id}SettingsCollapsed`] = false;
  }
  return JSON.stringify({ ...expanded, ...stored });
}

/** A `localStorage` stand-in that records what the panel writes back. */
export function createStorage(initial) {
  const items = new Map(initial === undefined ? [] : [["settings", initial]]);
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    writes: () => items.get("settings"),
  };
}

export function createPage(
  settingsText,
  {
    platform = "Win32",
    url = "https://x/",
    confirmAnswer = true,
    collapsed = false,
    allSections = false,
    interfaceEffects,
    mechInfoReader,
    onGameRootRead,
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
    readRoot: () => {
      onGameRootRead?.();
      return gameRoot;
    },
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
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    }),
  });
  settingsLifecycle.initialize();
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
  refreshEffectiveSettings();
  const gameBindingListeners = new Set();
  const panel = createCapturedSettingsPanel({
    capturedPanelWindow: pageWindow,
    fileDownload: createPageFileDownload(pageWindow, document),
    settings,
    settingsLifecycle,
    refreshEffectiveSettings,
    observeGameBindings: (listener) => {
      gameBindingListeners.add(listener);
      return () => gameBindingListeners.delete(listener);
    },
    interfaceEffects,
    mechInfoReader,
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
    pageWindow,
    document,
    effectiveSettings,
    gameRoot,
    refreshEffectiveSettings,
    notifyGameBinding: (elementId) => {
      for (const listener of gameBindingListeners) listener(elementId);
    },
  };
}

export function createMechInfoPanel(settingsRecord, species) {
  const page = createPage(JSON.stringify(settingsRecord), {
    mechInfoReader: {
      ensureLabActive: () => true,
      readItems: (count) =>
        Array.from({ length: count }, (_, index) => ({
          text: `Mech info ${index}`,
        })),
    },
  });
  page.gameRoot.race.species = species;
  page.refreshEffectiveSettings();

  const list = element("div", { id: "mechList" });
  const row = element("div");
  Object.defineProperties(row, {
    childNodes: { get: () => row.children },
    firstChild: { get: () => row.children[0] ?? null },
  });
  row.appendChild(element("span"));
  list.appendChild(row);
  page.root.appendChild(list);

  const createElement = page.document.createElement.bind(page.document);
  page.document.createElement = (tagName) => {
    const node = createElement(tagName);
    let className = "";
    Object.defineProperty(node, "className", {
      get: () => className,
      set: (value) => {
        className = String(value);
        for (const token of className.split(/\s+/).filter(Boolean)) {
          node.classList.add(token);
        }
      },
    });
    return node;
  };

  let observer;
  class MechInfoTestObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnectCount = 0;
      observer = this;
    }
    observe(target, options) {
      this.targets.push([target, options]);
    }
    disconnect() {
      this.disconnectCount += 1;
    }
  }
  page.pageWindow.MutationObserver = MechInfoTestObserver;

  return {
    ...page,
    list,
    mechObserver: () => observer,
    notes: () => page.document.querySelectorAll("#mechList .ea-mech-info"),
  };
}

export const mechInfoOverride = (result) => ({
  type1: "RaceId",
  arg1: "species",
  type2: "String",
  arg2: "human",
  cmp: "==",
  ret: result,
});
