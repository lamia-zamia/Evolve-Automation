/**
 * The script's settings panel, composed for the captured runtime.
 *
 * The captured runtime owns the top-level automation toggles and the captured settings sections.
 * This control wires those existing typed browser builders to the captured settings record instead
 * of to the legacy closure; game-backed sections remain outside this slice until their captures exist.
 *
 * TRANSITIONAL: the remaining per-section builders (the Settings tab, and the toggle strips
 * injected into the game's own Storage/Market/Eject/Supply panels) are still unavailable on
 * the captured path. They are diagnosed once by name rather than silently doing nothing. Automation
 * itself does not depend on any of them — it reads the same settings record this panel writes.
 */

import { createAutomationContainer } from "../ui/automation-container.ts";
import {
  createCraftToggleBrowserAdapter,
  type CraftToggleBrowserDependencies,
} from "../adapters/browser/craft-toggles.ts";
import { createCapturedCraftToggleReader } from "../adapters/evolve/economy/production/captured-craft-toggles.ts";
import {
  createBuildingSettingsBrowserAdapter,
  type BuildingSettingsBrowserActions,
} from "../adapters/browser/building-settings.ts";
import { createBuildingSettingsIntentHandler } from "../application/building-settings.ts";
import { createCapturedBuildingSettingsAdapter } from "../adapters/evolve/progression/build/captured-building-settings.ts";
import { createCapturedBuildingToggleReader } from "../adapters/evolve/progression/build/captured-building-toggles.ts";
import { createBuildingToggleBrowserAdapter } from "../adapters/browser/building-toggles.ts";
import {
  createProjectSettingsBrowserAdapter,
  type ProjectSettingsBrowserActions,
} from "../adapters/browser/project-settings.ts";
import { createProjectSettingsIntentHandler } from "../application/project-settings.ts";
import { createCapturedProjectSettingsAdapter } from "../adapters/evolve/progression/research/captured-project-settings.ts";
import { createCapturedArpaToggleReader } from "../adapters/evolve/progression/research/captured-arpa-toggles.ts";
import { createArpaToggleBrowserAdapter } from "../adapters/browser/arpa-toggles.ts";
import type { GameActionCostReader } from "../ports/game-action-costs.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import { overrideComparisons } from "../settings/override-comparators.ts";
import { createAutocomplete } from "../adapters/browser/autocomplete.ts";
import {
  createGeneralSettingsBrowserAdapter,
  type GeneralSettingsBrowserActions,
} from "../adapters/browser/general-settings.ts";
import {
  createAchievementGuardSettingsBrowserAdapter,
  type AchievementGuardSettingsBrowserActions,
} from "../adapters/browser/achievement-guard-settings.ts";
import {
  createChallengeHelperSettingsBrowserAdapter,
  type ChallengeHelperSettingsBrowserActions,
} from "../adapters/browser/challenge-helper-settings.ts";
import {
  createInterfaceSettingsBrowserAdapter,
  type InterfaceSettingsBrowserActions,
} from "../adapters/browser/interface-settings.ts";
import { createStateLogSettingsBrowserAdapter } from "../adapters/browser/state-log-settings.ts";
import {
  createAuthoritySettingsBrowserAdapter,
  type AuthoritySettingsBrowserActions,
} from "../adapters/browser/authority-settings.ts";
import {
  createHellSettingsBrowserAdapter,
  type HellSettingsBrowserActions,
} from "../adapters/browser/hell-settings.ts";
import { getHellSettingsReadModel } from "../domain/combat/hell-settings.ts";
import {
  createWeightingSettingsBrowserAdapter,
  type WeightingSettingsBrowserActions,
} from "../adapters/browser/weighting-settings.ts";
import { getWeightingSettingsReadModel } from "../domain/economy/resources/weighting-settings.ts";
import { createJobSettingsBrowserAdapter } from "../adapters/browser/job-settings.ts";
import { createTableSorter } from "../adapters/browser/table-sorter.ts";
import { createCapturedOverrideEditorCatalog } from "./captured-override-editor-catalog.ts";
import { createJobSettingsReadModel } from "../domain/civic/job-settings.ts";
import { createJobSettingsIntentHandler } from "../application/job-settings.ts";
import {
  createCapturedJobCatalogReader,
  isCapturedSmartJob,
} from "../adapters/evolve/civic/captured-job-catalog.ts";
import { readCapturedControlLabel } from "../adapters/evolve/captured-control-label.ts";
import { createOptionsModalBrowserAdapter } from "../adapters/browser/options-modal.ts";
import { createBrowserDomQuery } from "../adapters/browser/dom.ts";
import { createNumberFormatting } from "../formatting/numbers.ts";
import { numberSuffix as generalSettingsNumberSuffix } from "../config.ts";
import { createGeneralSettingsIntentHandler } from "../application/general-settings.ts";
import { createAchievementGuardSettingsIntentHandler } from "../application/achievement-guard-settings.ts";
import { createChallengeHelperSettingsIntentHandler } from "../application/challenge-helper-settings.ts";
import { createInterfaceSettingsIntentHandler } from "../application/interface-settings.ts";
import { createStateLogSettingsIntentHandler } from "../application/state-log-settings.ts";
import { createAuthoritySettingsIntentHandler } from "../application/authority-settings.ts";
import { createHellSettingsIntentHandler } from "../application/hell-settings.ts";
import { createWeightingSettingsIntentHandler } from "../application/weighting-settings.ts";
import {
  computeAchievementGuardDefaults,
  computeAuthorityDefaults,
  computeChallengeHelperDefaults,
  computeGeneralDefaults,
  computeHellDefaults,
  computeInterfaceDefaults,
  computeStateLogDefaults,
  computeWeightingDefaults,
} from "../domain/settings-defaults.ts";
import type { CapturedSettingsStore } from "../ports/captured-settings-store.ts";
import { inspectImportedSettings } from "../adapters/browser/settings-import.ts";
import {
  createFileDownload,
  type FileDownloadDependencies,
} from "../adapters/browser/file-download.ts";
import { createSettingsEditorControl } from "./settings-editor-control.ts";
import type { JQueryNode } from "../ui/jquery.ts";
import { createSettingsShell } from "../ui/settings-shell.ts";
import { isRecord, readProperty } from "../adapters/validation.ts";
import type { CapturedSettingsLifecycle } from "../application/captured-settings-lifecycle.ts";
import type { SettingsRecord } from "../domain/settings-migration.ts";

type OptionsModalDependencies = Parameters<
  typeof createOptionsModalBrowserAdapter
>[0];
type OptionsModalDocument = ReturnType<OptionsModalDependencies["getDocument"]>;
type OptionsModalQuery = ReturnType<OptionsModalDependencies["getJQuery"]>;
type ContainerQuery = ReturnType<
  Parameters<typeof createAutomationContainer>[0]["getJQuery"]
>;
type OptionsModalNode = Parameters<
  ReturnType<typeof createOptionsModalBrowserAdapter>["createSettingToggle"]
>[0];
type GeneralSettingsDependencies = Parameters<
  typeof createGeneralSettingsBrowserAdapter
>[0];
type SettingsEditorDependencies = Parameters<
  typeof createSettingsEditorControl
>[0];
type SettingsControlsDependencies =
  SettingsEditorDependencies["settingsControls"];
type SettingsInputsDependencies = SettingsEditorDependencies["settingsInputs"];
type SettingsShell = ReturnType<typeof createSettingsShell>;
type GeneralSettings = ReturnType<typeof createGeneralSettingsBrowserAdapter>;
type AchievementGuardSettings = ReturnType<
  typeof createAchievementGuardSettingsBrowserAdapter
>;
type ChallengeHelperSettings = ReturnType<
  typeof createChallengeHelperSettingsBrowserAdapter
>;
type InterfaceSettings = ReturnType<
  typeof createInterfaceSettingsBrowserAdapter
>;
type StateLogSettings = ReturnType<typeof createStateLogSettingsBrowserAdapter>;
type AuthoritySettings = ReturnType<
  typeof createAuthoritySettingsBrowserAdapter
>;
type HellSettings = ReturnType<typeof createHellSettingsBrowserAdapter>;
type WeightingSettings = ReturnType<
  typeof createWeightingSettingsBrowserAdapter
>;
type JobSettings = ReturnType<typeof createJobSettingsBrowserAdapter>;
type SettingsShellDependencies = Parameters<typeof createSettingsShell>[0];
type SettingsControlNode = Parameters<
  ReturnType<typeof createSettingsEditorControl>["addSettingsNumber"]
>[0];
type CraftToggles = ReturnType<typeof createCraftToggleBrowserAdapter>;
type CraftToggleJQuery = ReturnType<
  CraftToggleBrowserDependencies["getJQuery"]
>;
type BuildingSettings = ReturnType<typeof createBuildingSettingsBrowserAdapter>;
type BuildingToggles = ReturnType<typeof createBuildingToggleBrowserAdapter>;
type BuildingSettingsDocument = ReturnType<
  Parameters<typeof createBuildingSettingsBrowserAdapter>[0]["getDocument"]
>;
type BuildingSettingsJQuery = ReturnType<
  Parameters<typeof createBuildingSettingsBrowserAdapter>[0]["getJQuery"]
>;
type BuildingSettingsNode = Parameters<
  BuildingSettingsBrowserActions["addToggleCallbacks"]
>[0];
type BuildingToggleNode = Parameters<
  Parameters<typeof createBuildingToggleBrowserAdapter>[0]["addToggleCallbacks"]
>[0];
type BuildingSettingsSelectOptions = Parameters<
  ReturnType<typeof createSettingsEditorControl>["addSettingsSelect"]
>[4];
type BuildingToggleDocument = ReturnType<
  Parameters<typeof createCapturedBuildingToggleReader>[0]["getDocument"]
>;
type BuildingToggleJQuery = ReturnType<
  Parameters<typeof createBuildingToggleBrowserAdapter>[0]["getJQuery"]
>;
type ProjectSettings = ReturnType<typeof createProjectSettingsBrowserAdapter>;
type ArpaToggles = ReturnType<typeof createArpaToggleBrowserAdapter>;
type ProjectSettingsDocument = ReturnType<
  Parameters<typeof createProjectSettingsBrowserAdapter>[0]["getDocument"]
>;
type ProjectSettingsJQuery = ReturnType<
  Parameters<typeof createProjectSettingsBrowserAdapter>[0]["getJQuery"]
>;
type ArpaToggleDocument = ReturnType<
  Parameters<typeof createCapturedArpaToggleReader>[0]["getDocument"]
>;
type ArpaToggleJQuery = ReturnType<
  Parameters<typeof createArpaToggleBrowserAdapter>[0]["getJQuery"]
>;
type ArpaToggleNode = Parameters<
  Parameters<typeof createArpaToggleBrowserAdapter>[0]["addToggleCallbacks"]
>[0];

export interface CapturedSettingsPanelDependencies {
  /** The page's global object; the panel reads `document`, `navigator` and `location` from it. */
  readonly capturedPanelWindow: unknown;
  readonly settings: CapturedSettingsStore;
  /** The captured raw/effective settings boundary; absent only for panel contract tests. */
  readonly settingsLifecycle?: CapturedSettingsLifecycle;
  /** Recomputes the effective layer after a UI mutation of the raw record. */
  readonly refreshEffectiveSettings?: () => void;
  readonly craftToggles?: {
    readonly rootState: GameRootStateSource;
    readonly controls: GameControlRegistry;
  };
  readonly buildingSettings?: {
    readonly rootState: GameRootStateSource;
    readonly controls: GameControlRegistry;
    readonly ensureControls?: () => void;
    readonly costs?: GameActionCostReader;
  };
  readonly projectSettings?: {
    readonly rootState: GameRootStateSource;
    readonly controls: GameControlRegistry;
  };
  readonly onDiagnostic?: (message: string) => void;
  readonly logError?: (message: string) => void;
}

export interface CapturedSettingsPanel {
  /**
   * Draws the panel once the game has drawn `#resources`, and does nothing on every later call.
   * Safe to call every tick: the container's own guard is a single selector lookup.
   */
  ensurePanel(): void;
  /** Rebuilds only the script-owned settings section after a queued settings load. */
  refreshSettings(): void;
}

/** `Alt` on macOS, where `Ctrl`+click is already the secondary click. */
function overrideKeyLabelFor(capturedPanelWindow: unknown): string {
  const platform = readProperty(
    readProperty(capturedPanelWindow, "navigator"),
    "platform",
  );
  return typeof platform === "string" && platform.startsWith("Mac")
    ? "Alt"
    : "Ctrl";
}

/** The historical opt-out: `#safemode` anywhere in the URL disables the master toggle. */
function safeModeFor(capturedPanelWindow: unknown): boolean {
  const location = readProperty(capturedPanelWindow, "location");
  return String(location ?? "")
    .toLowerCase()
    .includes("safemode");
}

function confirmInPanelWindow(
  capturedPanelWindow: unknown,
  message: string,
): boolean {
  const confirm = readProperty(capturedPanelWindow, "confirm");
  return typeof confirm === "function"
    ? Boolean(Reflect.apply(confirm, capturedPanelWindow, [message]))
    : false;
}

/**
 * The page's own "save this text as a file" gesture, or `undefined` when the page does not offer
 * the pieces it needs. A test page without `URL`/`Blob` gets the absent case rather than a throw.
 */
function panelFileDownloadFor(
  capturedPanelWindow: unknown,
  documentValue: unknown,
): ((contents: string, filename: string) => void) | undefined {
  const urlApi = readProperty(capturedPanelWindow, "URL");
  const blobConstructor = readProperty(capturedPanelWindow, "Blob");
  const schedule = readProperty(capturedPanelWindow, "setTimeout");
  if (
    typeof readProperty(urlApi, "createObjectURL") !== "function" ||
    typeof readProperty(urlApi, "revokeObjectURL") !== "function" ||
    typeof blobConstructor !== "function" ||
    typeof schedule !== "function" ||
    typeof readProperty(documentValue, "createElement") !== "function"
  ) {
    return undefined;
  }
  return createFileDownload({
    getDocument: () =>
      documentValue as ReturnType<FileDownloadDependencies["getDocument"]>,
    getUrlApi: () =>
      urlApi as ReturnType<FileDownloadDependencies["getUrlApi"]>,
    getBlobConstructor: () =>
      blobConstructor as ReturnType<
        FileDownloadDependencies["getBlobConstructor"]
      >,
    schedule: (callback, delay) =>
      Reflect.apply(schedule, capturedPanelWindow, [callback, delay]),
  }).triggerFileDownload;
}

export function createCapturedSettingsPanel({
  capturedPanelWindow,
  settings,
  settingsLifecycle,
  refreshEffectiveSettings,
  craftToggles: capturedCraftToggles,
  buildingSettings: capturedBuildingSettings,
  projectSettings: capturedProjectSettings,
  onDiagnostic = () => {},
  logError = () => {},
}: CapturedSettingsPanelDependencies): CapturedSettingsPanel {
  const documentValue = readProperty(capturedPanelWindow, "document");
  const reportedSections = new Set<string>();
  // Built on first use, not at construction: `createBrowserDomQuery` throws when the page has no
  // document, and a missing interface must never cost the automation its startup. A page without a
  // document simply has no panel.
  let query: ReturnType<typeof createBrowserDomQuery> | undefined;
  let queryUnavailable = false;
  const getQuery = () => {
    if (query === undefined && !queryUnavailable) {
      try {
        query = createBrowserDomQuery(capturedPanelWindow);
      } catch {
        // Silent on purpose. A host with no document is a host with no interface, which is an
        // expected shape (the headless harness, a contract test), not a fault to report on the
        // error channel. A failure to *draw* into a document that does exist is reported below.
        queryUnavailable = true;
      }
    }
    return query;
  };
  // TRANSITIONAL: replaced per section as each one is ported to the capture. Reporting by name is
  // what keeps an unported strip diagnosable instead of looking like a broken toggle.
  const unported = (section: string) => () => {
    if (reportedSections.has(section)) return;
    reportedSections.add(section);
    onDiagnostic(`settings panel section not ported yet: ${section}`);
  };

  const fileDownload = panelFileDownloadFor(capturedPanelWindow, documentValue);
  const reportNoFileDownload = () => {
    if (reportedSections.has("settings file download")) return;
    reportedSections.add("settings file download");
    logError("this page cannot offer a settings file download");
  };

  const persistSettings = () => {
    settings.persist();
    refreshEffectiveSettings?.();
  };

  const generalDefaults = computeGeneralDefaults().def;
  const capturedRecordDefaults = [
    generalDefaults,
    computeInterfaceDefaults().def,
    computeStateLogDefaults().def,
    computeAchievementGuardDefaults().def,
    computeChallengeHelperDefaults().def,
    computeAuthorityDefaults().def,
  ];
  const prepareSettingsForUi = () => {
    settingsLifecycle?.initialize();
    refreshEffectiveSettings?.();
    const raw = settings.readRaw();
    if (!isRecord(raw["overrides"]) || Array.isArray(raw["overrides"])) {
      raw["overrides"] = {};
    }
    for (const defaults of capturedRecordDefaults) {
      for (const [key, value] of Object.entries(defaults)) {
        if (!Object.hasOwn(raw, key)) raw[key] = value;
      }
    }
  };

  const resetCapturedSectionRecord = (
    defaults: Readonly<Record<string, unknown>>,
    section?: string,
  ) => {
    if (settingsLifecycle !== undefined && section !== undefined) {
      settingsLifecycle.resetSection(section);
      return;
    }
    const raw = settings.readRaw();
    const overrides = raw["overrides"];
    if (isRecord(overrides) && !Array.isArray(overrides)) {
      for (const key of Object.keys(defaults)) delete overrides[key];
    }
    Object.assign(raw, defaults);
  };

  const capturedJobCatalogReader =
    capturedCraftToggles === undefined
      ? undefined
      : createCapturedJobCatalogReader({
          rootState: capturedCraftToggles.rootState,
          controls: capturedCraftToggles.controls,
          readSettings: settings.readRaw,
          onSkipped: (controlId, reason) =>
            onDiagnostic(`settings job row skipped ${controlId}: ${reason}`),
        });

  const readCapturedJobSettings = () => {
    const catalog = capturedJobCatalogReader?.();
    const raw = settings.readRaw();
    const overrides = isRecord(raw.overrides) ? raw.overrides : {};
    return createJobSettingsReadModel({
      rows: (catalog?.jobs ?? []).map((job) => {
        const settingName = `job_${job.id}`;
        const handle = capturedCraftToggles!.controls.resolve(job.controlId);
        return {
          id: job.id,
          label:
            handle === undefined
              ? job.id
              : readCapturedControlLabel(handle, job.id),
          color:
            job.id === "unemployed"
              ? "warning"
              : job.kind === "other"
                ? "advanced"
                : "info",
          enabledSettingName: settingName,
          enabled: raw[settingName] !== false,
          hasOverride:
            Array.isArray(overrides[settingName]) &&
            overrides[settingName].length > 0,
          breakpoints: [
            { kind: "input", settingName: `job_b1_${job.id}` },
            { kind: "input", settingName: `job_b2_${job.id}` },
            job.split
              ? { kind: "weighted" }
              : { kind: "input", settingName: `job_b3_${job.id}` },
          ],
          ...(isCapturedSmartJob(job.id)
            ? { smartSettingName: `job_s_${job.id}` }
            : {}),
        };
      }),
    });
  };

  let settingsUi:
    | {
        readonly general: GeneralSettings;
        readonly achievementGuard: AchievementGuardSettings;
        readonly challengeHelper: ChallengeHelperSettings;
        readonly interface: InterfaceSettings;
        readonly stateLog: StateLogSettings;
        readonly authority: AuthoritySettings;
        readonly hell: HellSettings;
        readonly weighting: WeightingSettings;
        readonly job: JobSettings;
        readonly building: BuildingSettings | undefined;
        readonly buildingToggles: BuildingToggles | undefined;
        readonly project: ProjectSettings | undefined;
        readonly arpaToggles: ArpaToggles | undefined;
        readonly craftToggles: CraftToggles | undefined;
        readonly shell: SettingsShell;
      }
    | undefined;

  const ensureSettingsUi = (dom: ReturnType<typeof createBrowserDomQuery>) => {
    if (settingsUi !== undefined) return settingsUi;
    const documentForUi = documentValue as ReturnType<
      SettingsShellDependencies["getDocument"]
    >;
    const autocomplete = createAutocomplete({
      getDocument: () => documentValue as Document,
    });
    const formatting = createNumberFormatting({
      numberSuffix: generalSettingsNumberSuffix,
    });
    const getJQuery = () =>
      dom as unknown as ReturnType<SettingsControlsDependencies["getJQuery"]>;
    const tableSorter = createTableSorter({
      getSortable: () => readProperty(capturedPanelWindow, "Sortable"),
    });
    const overrideCatalog = createCapturedOverrideEditorCatalog();
    const settingsEditor = createSettingsEditorControl({
      overrideEditor: {
        getSettingsRaw: () => settings.readRaw() as SettingsRecord,
        persistence: { save: persistSettings },
      },
      settingsInputs: {
        getAutocomplete: () => autocomplete,
        getJQuery: getJQuery as SettingsInputsDependencies["getJQuery"],
        getRealNumber: () => formatting.getRealNumber,
      },
      conditionControls: {
        getJQuery: getJQuery as SettingsControlsDependencies["getJQuery"],
        getSettingsRaw: () => {
          prepareSettingsForUi();
          return settings.readRaw() as ReturnType<
            Parameters<
              typeof createSettingsEditorControl
            >[0]["overrideControls"]["getSettingsRaw"]
          >;
        },
        getWin: () => ({
          prompt: (message: string, value: string) => {
            const prompt = readProperty(capturedPanelWindow, "prompt");
            return typeof prompt === "function"
              ? Reflect.apply(prompt, capturedPanelWindow, [message, value])
              : undefined;
          },
        }),
        getCheckCompareExpressions: () =>
          overrideCatalog.checkCompareExpressions,
        getCheckCustom: () => overrideCatalog.checkCustom,
        getCheckTypes: () => overrideCatalog.checkTypes,
      },
      overrideControls: {
        getJQuery: getJQuery as SettingsControlsDependencies["getJQuery"],
        getSettingsRaw: () => {
          prepareSettingsForUi();
          return settings.readRaw() as ReturnType<
            Parameters<
              typeof createSettingsEditorControl
            >[0]["overrideControls"]["getSettingsRaw"]
          >;
        },
        getSettings: () =>
          settingsLifecycle?.readEffective() ?? settings.readRaw(),
        getTechIds: () => ({}),
        getCheckCustom: () => overrideCatalog.checkCustom,
        getOverrideKey: () =>
          overrideKeyLabelFor(capturedPanelWindow) === "Alt"
            ? "altKey"
            : "ctrlKey",
        getOpenOptionsModal: () => (title, buildOptions) =>
          optionsModal.openOptionsModal(title, (modal) =>
            buildOptions(modal as unknown as JQueryNode),
          ),
        getTableSorter: () => tableSorter,
      },
      settingsControls: {
        getAutocomplete: () => autocomplete,
        getJQuery: getJQuery as SettingsControlsDependencies["getJQuery"],
        getSettingsRaw: () => {
          prepareSettingsForUi();
          return settings.readRaw() as ReturnType<
            SettingsControlsDependencies["getSettingsRaw"]
          >;
        },
        getRealNumber: () => formatting.getRealNumber,
        getUpdateSettingsFromState: () => persistSettings,
      },
    });
    const controls = settingsEditor;
    openOverrideModal = (event) =>
      settingsEditor.openOverrideModal(
        event as unknown as Parameters<
          typeof settingsEditor.openOverrideModal
        >[0],
      );
    const craftToggles =
      capturedCraftToggles === undefined
        ? undefined
        : createCraftToggleBrowserAdapter({
            getJQuery: () => getJQuery() as unknown as CraftToggleJQuery,
            reader: createCapturedCraftToggleReader({
              rootState: capturedCraftToggles.rootState,
              controls: capturedCraftToggles.controls,
              getDocument: () =>
                documentValue as { getElementById(id: string): unknown },
              getSettingsRaw: () => settings.readRaw(),
            }),
            addToggleCallbacks: (node, settingKey) =>
              controls.addToggleCallbacks(
                node as unknown as SettingsControlNode,
                settingKey,
              ) as unknown as typeof node,
          });

    let general: GeneralSettings | undefined;
    let achievementGuard: AchievementGuardSettings | undefined;
    let challengeHelper: ChallengeHelperSettings | undefined;
    let interfaceSettings: InterfaceSettings | undefined;
    let stateLog: StateLogSettings | undefined;
    let authority: AuthoritySettings | undefined;
    let job: JobSettings | undefined;
    let building: BuildingSettings | undefined;
    let buildingToggles: BuildingToggles | undefined;
    let project: ProjectSettings | undefined;
    let arpaToggles: ArpaToggles | undefined;
    const shell = createSettingsShell({
      $: getJQuery() as unknown as Parameters<
        typeof createSettingsShell
      >[0]["$"],
      getDocument: () => documentForUi,
      getSettingsRaw: () => settings.readRaw(),
      getSettings: () => ({
        scriptSettingsExportFilename: String(
          settings.readRaw()["scriptSettingsExportFilename"] ??
            "evolve-script-settings.json",
        ),
      }),
      getGame: () => ({ global: { settings: { civTabs: 7 } } }),
      buildPrestigeSettings: () => {},
      buildGeneralSettings: () => general?.buildGeneralSettings(),
      buildInterfaceSettings: () => interfaceSettings?.buildInterfaceSettings(),
      buildStateLogSettings: () => stateLog?.buildStateLogSettings(),
      buildAchievementGuardSettings: () =>
        achievementGuard?.buildAchievementGuardSettings(),
      buildChallengeHelperSettings: () =>
        challengeHelper?.buildChallengeHelperSettings(),
      buildGovernmentSettings: () => {},
      buildAuthoritySettings: () => authority?.buildAuthoritySettings(),
      buildEvolutionSettings: () => {},
      buildPlanetSettings: () => {},
      buildTraitSettings: () => {},
      buildTriggerSettings: () => {},
      buildResearchSettings: () => {},
      buildWarSettings: () => {},
      buildHellSettings: (parentNode, secondaryPrefix) =>
        hell?.buildHellSettings(
          parentNode as unknown as Parameters<
            HellSettings["buildHellSettings"]
          >[0],
          secondaryPrefix,
        ),
      buildMechSettings: () => {},
      buildFleetSettings: () => {},
      buildEjectorSettings: () => {},
      buildMarketSettings: () => {},
      buildStorageSettings: () => {},
      buildMagicSettings: () => {},
      buildProductionSettings: () => {},
      buildJobSettings: () => job?.buildJobSettings(),
      buildBuildingSettings: () => building?.buildBuildingSettings(),
      buildWeightingSettings: () => weighting?.buildWeightingSettings(),
      buildProjectSettings: () => project?.buildProjectSettings(),
      buildLoggingSettings: () => {},
      filterBuildingSettingsTable: () =>
        building?.filterBuildingSettingsTable(),
      updateSettingsFromState: persistSettings,
      importSettings: importScriptSettings,
      exportSettings: () => JSON.stringify(settings.readRaw()),
      triggerFileDownload: fileDownload ?? reportNoFileDownload,
      confirm: (message) => confirmInPanelWindow(capturedPanelWindow, message),
    });
    const generalIntent = createGeneralSettingsIntentHandler({
      writer: {
        resetToDefaults: () => {
          if (settingsLifecycle !== undefined) {
            settingsLifecycle.resetSection("general");
            return;
          }
          const raw = settings.readRaw();
          const overrides = raw["overrides"];
          if (isRecord(overrides) && !Array.isArray(overrides)) {
            for (const key of Object.keys(generalDefaults))
              delete overrides[key];
          }
          Object.assign(raw, generalDefaults);
        },
        persist: persistSettings,
      },
      renderSettingsContent: () => general?.updateGeneralSettingsContent(),
      effects: {
        resetCheckboxes: () => {
          for (const key of [
            "masterScriptToggle",
            "showSettings",
            "autoPrestige",
          ]) {
            dom(`.script_${key}`).prop("checked", settings.readRaw()[key]);
          }
        },
      },
    });
    general = createGeneralSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: { handle: (intent) => generalIntent.handle(intent) },
      getActions: () => ({
        buildSettingsSection: shell.buildSettingsSection,
        addSettingsHeader1:
          shell.addSettingsHeader1 as unknown as GeneralSettingsBrowserActions["addSettingsHeader1"],
        addSettingsNumber: ((node, settingName, labelText, hintText) =>
          controls.addSettingsNumber(
            node as unknown as SettingsControlNode,
            settingName,
            labelText,
            hintText,
          )) as GeneralSettingsBrowserActions["addSettingsNumber"],
        addSettingsSelect: ((node, settingName, labelText, hintText, options) =>
          controls.addSettingsSelect(
            node as unknown as SettingsControlNode,
            settingName,
            labelText,
            hintText,
            options,
          )) as GeneralSettingsBrowserActions["addSettingsSelect"],
        addSettingsString: ((node, settingName, labelText, hintText) =>
          controls.addSettingsString(
            node as unknown as SettingsControlNode,
            settingName,
            labelText,
            hintText,
          )) as GeneralSettingsBrowserActions["addSettingsString"],
        addSettingsToggle: ((node, settingName, labelText, hintText) =>
          controls.addSettingsToggle(
            node as unknown as SettingsControlNode,
            settingName,
            labelText,
            hintText,
          )) as GeneralSettingsBrowserActions["addSettingsToggle"],
      }),
    });
    const simpleActions = {
      buildSettingsSection: shell.buildSettingsSection,
      addSettingsHeader1: shell.addSettingsHeader1,
      addSettingsNumber: (
        node: unknown,
        settingName: string,
        label: string,
        hint: string,
      ) =>
        controls.addSettingsNumber(
          node as SettingsControlNode,
          settingName,
          label,
          hint,
        ),
      addSettingsToggle: (
        node: unknown,
        settingName: string,
        label: string,
        hint: string,
      ) =>
        controls.addSettingsToggle(
          node as SettingsControlNode,
          settingName,
          label,
          hint,
        ),
      addTableInput: (node: unknown, settingName: string) =>
        controls.addTableInput(node as SettingsControlNode, settingName),
      addSettingsString: (
        node: unknown,
        settingName: string,
        label: string,
        hint: string,
      ) =>
        controls.addSettingsString(
          node as SettingsControlNode,
          settingName,
          label,
          hint,
        ),
    };
    const createSimpleWriter = (
      defaults: Readonly<Record<string, unknown>>,
      section: string,
    ) => ({
      resetToDefaults: () => resetCapturedSectionRecord(defaults, section),
      persist: persistSettings,
    });
    let achievementIntent: ReturnType<
      typeof createAchievementGuardSettingsIntentHandler
    >;
    achievementIntent = createAchievementGuardSettingsIntentHandler({
      writer: createSimpleWriter(
        computeAchievementGuardDefaults().def,
        "achievementguard",
      ),
      renderSettingsContent: () =>
        achievementGuard?.updateAchievementGuardSettingsContent(),
    });
    achievementGuard = createAchievementGuardSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: achievementIntent,
      getActions: () =>
        simpleActions as unknown as AchievementGuardSettingsBrowserActions,
    });

    let challengeIntent: ReturnType<
      typeof createChallengeHelperSettingsIntentHandler
    >;
    challengeIntent = createChallengeHelperSettingsIntentHandler({
      writer: createSimpleWriter(
        computeChallengeHelperDefaults().def,
        "challengehelper",
      ),
      renderSettingsContent: () =>
        challengeHelper?.updateChallengeHelperSettingsContent(),
    });
    challengeHelper = createChallengeHelperSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: challengeIntent,
      getActions: () =>
        simpleActions as unknown as ChallengeHelperSettingsBrowserActions,
    });

    let interfaceIntent: ReturnType<
      typeof createInterfaceSettingsIntentHandler
    >;
    interfaceIntent = createInterfaceSettingsIntentHandler({
      writer: createSimpleWriter(computeInterfaceDefaults().def, "interface"),
      reader: {
        read: () => ({
          activeTargetsUI: settings.readRaw()["activeTargetsUI"] === true,
          buildPlannerUI: settings.readRaw()["buildPlannerUI"] === true,
        }),
      },
      effects: {
        renderSettingsContent: () =>
          interfaceSettings?.updateInterfaceSettingsContent(),
        syncActiveTargetsUI: () => {},
        syncBuildPlannerUI: () => {},
        updatePrestigeInTopBar: () => {},
        updateTotalDaysInTopBar: () => {},
      },
    });
    interfaceSettings = createInterfaceSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: interfaceIntent,
      getActions: () =>
        ({
          ...simpleActions,
          controlEffects: {},
        }) as unknown as InterfaceSettingsBrowserActions,
    });

    let stateLogIntent: ReturnType<typeof createStateLogSettingsIntentHandler>;
    stateLogIntent = createStateLogSettingsIntentHandler({
      writer: createSimpleWriter(computeStateLogDefaults().def, "statelog"),
      renderSettingsContent: () => stateLog?.updateStateLogSettingsContent(),
    });
    stateLog = createStateLogSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as Parameters<
        typeof createStateLogSettingsBrowserAdapter
      >[0]["getJQuery"],
      intents: stateLogIntent,
      buildSettingsSection: shell.buildSettingsSection,
      addSettingsToggle: (node, settingName, label, hint) =>
        controls.addSettingsToggle(
          node as unknown as SettingsControlNode,
          settingName,
          label,
          hint,
        ),
      addSettingsNumber: (node, settingName, label, hint) =>
        controls.addSettingsNumber(
          node as unknown as SettingsControlNode,
          settingName,
          label,
          hint,
        ),
    });

    let authorityIntent: ReturnType<
      typeof createAuthoritySettingsIntentHandler
    >;
    authorityIntent = createAuthoritySettingsIntentHandler({
      writer: createSimpleWriter(computeAuthorityDefaults().def, "authority"),
      renderSettingsContent: () => authority?.updateAuthoritySettingsContent(),
    });
    authority = createAuthoritySettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: authorityIntent,
      getActions: () =>
        simpleActions as unknown as AuthoritySettingsBrowserActions,
    });
    let hell: HellSettings | undefined;
    const hellIntent = createHellSettingsIntentHandler({
      writer: {
        resetToDefaults: () => {
          if (settingsLifecycle !== undefined) {
            settingsLifecycle.resetSection("hell");
          } else {
            resetCapturedSectionRecord(computeHellDefaults().def);
          }
        },
        persist: persistSettings,
      },
      renderSettingsContent: (secondaryPrefix) =>
        hell?.updateHellSettingsContent(secondaryPrefix),
      effects: { resetCheckboxes: () => controls.resetCheckbox("autoHell") },
    });
    hell = createHellSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as Parameters<
        typeof createHellSettingsBrowserAdapter
      >[0]["getJQuery"],
      reader: { read: getHellSettingsReadModel },
      intents: hellIntent,
      getActions: () =>
        ({
          ...simpleActions,
          addSettingsHeader1: shell.addSettingsHeader1,
          buildSettingsSection2: (
            ...args: Parameters<
              HellSettingsBrowserActions["buildSettingsSection2"]
            >
          ) => {
            const [
              _parentNode,
              secondaryPrefix,
              sectionId,
              sectionName,
              resetFunction,
              updateSettingsContentFunction,
            ] = args;
            if (secondaryPrefix === "") {
              shell.buildSettingsSection(
                sectionId,
                sectionName,
                resetFunction,
                () => updateSettingsContentFunction(""),
              );
            }
          },
        }) as unknown as HellSettingsBrowserActions,
    });
    let weighting: WeightingSettings | undefined;
    const weightingIntent = createWeightingSettingsIntentHandler({
      writer: {
        resetToDefaults: () => {
          if (settingsLifecycle !== undefined) {
            settingsLifecycle.resetSection("weighting");
          } else {
            resetCapturedSectionRecord(computeWeightingDefaults().def);
          }
        },
        persist: persistSettings,
      },
      renderSettingsContent: () => weighting?.updateWeightingSettingsContent(),
    });
    weighting = createWeightingSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as Parameters<
        typeof createWeightingSettingsBrowserAdapter
      >[0]["getJQuery"],
      intents: weightingIntent,
      getActions: () =>
        ({
          ...simpleActions,
          addTableInput: (node: unknown, settingName: string) =>
            controls.addTableInput(node as SettingsControlNode, settingName),
        }) as unknown as WeightingSettingsBrowserActions,
      getReadModel: getWeightingSettingsReadModel,
    });
    const jobIntent = createJobSettingsIntentHandler({
      writer: {
        resetToDefaults: () => settingsLifecycle?.resetSection("job"),
        persist: () => settings.persist(),
        resetPriorities: () => {
          const catalog = capturedJobCatalogReader?.();
          catalog?.jobs.forEach((entry, index) => {
            settings.readRaw()[`job_p_${entry.id}`] = index;
          });
        },
        reorderJobs: (jobIds) => {
          const known = new Set(
            capturedJobCatalogReader?.()?.jobs.map((entry) => entry.id),
          );
          jobIds.forEach((jobId, index) => {
            if (known.has(jobId)) settings.readRaw()[`job_p_${jobId}`] = index;
          });
        },
      },
      renderSettingsContent: () => job?.updateJobSettingsContent(),
      effects: {
        resetCheckboxes: () => {
          const catalog = capturedJobCatalogReader?.();
          if (catalog === undefined) return;
          controls.resetCheckbox(
            ...catalog.jobs.map((entry) => `job_${entry.id}`),
          );
        },
      },
    });
    job = createJobSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as Parameters<
        typeof createJobSettingsBrowserAdapter
      >[0]["getJQuery"],
      getReadModel: readCapturedJobSettings,
      intents: jobIntent,
      getActions: () =>
        ({
          ...simpleActions,
          addTableInput: (node: unknown, settingName: string) =>
            controls.addTableInput(node as SettingsControlNode, settingName),
          addTableToggle: (node: unknown, settingName: string) =>
            controls.addTableToggle(node as SettingsControlNode, settingName),
          addToggleCallbacks: (node: unknown, settingName: string) =>
            controls.addToggleCallbacks(
              node as SettingsControlNode,
              settingName,
            ),
          getTableSorter: () => tableSorter,
          confirm: (message: string) =>
            confirmInPanelWindow(capturedPanelWindow, message),
        }) as unknown as Parameters<
          typeof createJobSettingsBrowserAdapter
        >[0]["getActions"] extends () => infer Actions
          ? Actions
          : never,
    });
    if (capturedBuildingSettings !== undefined) {
      const capturedAdapter = createCapturedBuildingSettingsAdapter({
        rootState: capturedBuildingSettings.rootState,
        controls: capturedBuildingSettings.controls,
        getSettingsRaw: settings.readRaw,
        getOverrideKey: () =>
          overrideKeyLabelFor(capturedPanelWindow) === "Alt"
            ? "altKey"
            : "ctrlKey",
        getRealNumber: formatting.getRealNumber,
        getComparison: (operator) => overrideComparisons[operator],
        ...(capturedBuildingSettings.ensureControls === undefined
          ? {}
          : { ensureControls: capturedBuildingSettings.ensureControls }),
        ...(capturedBuildingSettings.costs === undefined
          ? {}
          : { costs: capturedBuildingSettings.costs }),
      });
      let buildingIntent: ReturnType<
        typeof createBuildingSettingsIntentHandler
      >;
      building = createBuildingSettingsBrowserAdapter({
        getDocument: () => documentForUi as unknown as BuildingSettingsDocument,
        getJQuery: () => getJQuery() as unknown as BuildingSettingsJQuery,
        getReadModel: capturedAdapter.readBuildingSettingsReadModel,
        getFilterMatches: capturedAdapter.filterBuildingSettings,
        intents: { handle: (intent) => buildingIntent.handle(intent) },
        getActions: () =>
          ({
            ...simpleActions,
            addSettingsSelect: (
              node: unknown,
              settingName: string,
              label: string,
              hint: string,
              options: readonly unknown[],
            ) =>
              controls.addSettingsSelect(
                node as SettingsControlNode,
                settingName,
                label,
                hint,
                options as BuildingSettingsSelectOptions,
              ),
            addTableToggle: (node: unknown, settingName: string) =>
              controls.addTableToggle(node as SettingsControlNode, settingName),
            addToggleCallbacks: (node: unknown, settingName: string) =>
              controls.addToggleCallbacks(
                node as SettingsControlNode,
                settingName,
              ) as unknown as BuildingSettingsNode,
            buildTableLabel: (label: string, title: string, color: string) =>
              controls.buildTableLabel(label, title, color),
            getTableSorter: () => tableSorter,
            confirm: (message: string) =>
              confirmInPanelWindow(capturedPanelWindow, message),
          }) as unknown as BuildingSettingsBrowserActions,
      });
      buildingIntent = createBuildingSettingsIntentHandler({
        writer: {
          resetToDefaults: () => {
            if (settingsLifecycle !== undefined) {
              settingsLifecycle.resetSection("building");
            } else {
              capturedAdapter.resetToDefaults();
            }
          },
          persist: persistSettings,
          resetPriorities: capturedAdapter.resetPriorities,
          reorderBuildings: capturedAdapter.reorderBuildings,
          setAllAutoBuild: capturedAdapter.setAllAutoBuild,
          setAllAutoPower: capturedAdapter.setAllAutoPower,
          setLinkedSmartState: capturedAdapter.setLinkedSmartState,
        },
        renderSettingsContent: () => building?.updateBuildingSettingsContent(),
        effects: {
          resetCheckboxes: () =>
            controls.resetCheckbox("autoBuild", "autoPower"),
          removeBuildingToggles: () => buildingToggles?.removeBuildingToggles(),
        },
      });
      buildingToggles = createBuildingToggleBrowserAdapter({
        getJQuery: () => getJQuery() as unknown as BuildingToggleJQuery,
        reader: createCapturedBuildingToggleReader({
          rootState: capturedBuildingSettings.rootState,
          controls: capturedBuildingSettings.controls,
          getDocument: () => documentForUi as unknown as BuildingToggleDocument,
          getSettingsRaw: settings.readRaw,
          ...(capturedBuildingSettings.ensureControls === undefined
            ? {}
            : { ensureControls: capturedBuildingSettings.ensureControls }),
        }),
        getCountWriter: () => ({ setCount: () => {} }),
        addToggleCallbacks: (node, settingName) =>
          controls.addToggleCallbacks(
            node as unknown as SettingsControlNode,
            settingName,
          ) as unknown as BuildingToggleNode,
      });
    }
    if (capturedProjectSettings !== undefined) {
      const capturedAdapter = createCapturedProjectSettingsAdapter({
        rootState: capturedProjectSettings.rootState,
        controls: capturedProjectSettings.controls,
        getSettingsRaw: settings.readRaw,
      });
      let projectIntent: ReturnType<typeof createProjectSettingsIntentHandler>;
      project = createProjectSettingsBrowserAdapter({
        getDocument: () => documentForUi as unknown as ProjectSettingsDocument,
        getJQuery: () => getJQuery() as unknown as ProjectSettingsJQuery,
        getReadModel: capturedAdapter.readProjectSettingsReadModel,
        intents: { handle: (intent) => projectIntent.handle(intent) },
        getActions: () =>
          ({
            ...simpleActions,
            addTableToggle: (node: unknown, settingName: string) =>
              controls.addTableToggle(node as SettingsControlNode, settingName),
            buildTableLabel: (label: string) => controls.buildTableLabel(label),
            getTableSorter: () => tableSorter,
          }) as unknown as ProjectSettingsBrowserActions,
      });
      projectIntent = createProjectSettingsIntentHandler({
        writer: {
          resetToDefaults: () => {
            if (settingsLifecycle !== undefined) {
              settingsLifecycle.resetSection("project");
            } else {
              capturedAdapter.resetToDefaults();
            }
          },
          persist: persistSettings,
          reorderProjects: capturedAdapter.reorderProjects,
        },
        renderSettingsContent: () => project?.updateProjectSettingsContent(),
        effects: {
          resetCheckbox: () => controls.resetCheckbox("autoARPA"),
        },
      });
      arpaToggles = createArpaToggleBrowserAdapter({
        getJQuery: () => getJQuery() as unknown as ArpaToggleJQuery,
        reader: createCapturedArpaToggleReader({
          rootState: capturedProjectSettings.rootState,
          controls: capturedProjectSettings.controls,
          getDocument: () => documentForUi as unknown as ArpaToggleDocument,
          getSettingsRaw: settings.readRaw,
        }),
        addToggleCallbacks: (node, settingName) =>
          controls.addToggleCallbacks(
            node as unknown as SettingsControlNode,
            settingName,
          ) as unknown as ArpaToggleNode,
      });
    }
    settingsUi = {
      general,
      achievementGuard,
      challengeHelper,
      interface: interfaceSettings,
      stateLog,
      authority,
      hell,
      weighting,
      job,
      building,
      buildingToggles,
      project,
      arpaToggles,
      craftToggles,
      shell,
    };
    return settingsUi;
  };

  const importScriptSettings = (serialized: string): boolean => {
    const inspection = inspectImportedSettings(serialized);
    if (!inspection.ok) {
      logError(`script settings were not imported: ${inspection.reason}`);
      return false;
    }
    if (
      inspection.evalSources.length > 0 &&
      !confirmInPanelWindow(
        capturedPanelWindow,
        "Warning! Imported settings include evaluated code, which will have full access to " +
          "the browser page, and can be potentially dangerous.\n" +
          "Only continue if you trust the source. Injected code:\n" +
          inspection.evalSources.join("\n"),
      )
    ) {
      return false;
    }
    if (settingsLifecycle === undefined) {
      settings.replaceRaw(inspection.settings);
      persistSettings();
    } else {
      settingsLifecycle.replaceAndInitialize(inspection.settings);
      refreshEffectiveSettings?.();
    }
    // Everything drawn from the replaced record goes, so the next `ensurePanel` rebuilds the
    // container and every section from the imported one. The import/export buttons sit outside
    // both and keep working. Automation needs no signal: it reads the store on every cycle.
    const dom = getQuery();
    dom?.("#script_settings").remove();
    dom?.("#autoScriptContainer").remove();
    return true;
  };

  const buildScriptSettings = () => {
    const dom = getQuery();
    if (dom === undefined || dom(".settings").length === 0) return;
    const ui = ensureSettingsUi(dom);
    ui.shell.buildImportExport();
    if (dom("#script_settings").length === 0) {
      dom(".settings").append(
        '<div id="script_settings" style="margin-top: 30px;"></div>',
      );
    }
    if (dom("#script_generalSettings").length !== 0) return;
    ui.general.buildGeneralSettings();
    ui.interface.buildInterfaceSettings();
    ui.stateLog.buildStateLogSettings();
    ui.achievementGuard.buildAchievementGuardSettings();
    ui.challengeHelper.buildChallengeHelperSettings();
    ui.authority.buildAuthoritySettings();
    ui.hell.buildHellSettings(dom("#script_settings"), "");
    ui.weighting.buildWeightingSettings();
    if (capturedJobCatalogReader?.() !== undefined) {
      ui.job.buildJobSettings();
    }
    ui.building?.buildBuildingSettings();
    ui.project?.buildProjectSettings();
  };

  const removeScriptSettings = () => {
    getQuery()?.("#script_settings").remove();
  };

  const createArpaToggles = () => {
    const dom = getQuery();
    const adapter =
      dom === undefined ? undefined : ensureSettingsUi(dom).arpaToggles;
    if (adapter === undefined) {
      unported("ARPA toggles")();
      return;
    }
    adapter.createArpaToggles();
  };

  const removeArpaToggles = () => {
    const dom = getQuery();
    const adapter =
      dom === undefined ? undefined : ensureSettingsUi(dom).arpaToggles;
    if (adapter === undefined) {
      unported("ARPA toggles")();
      return;
    }
    adapter.removeArpaToggles();
  };

  const createCraftToggles = () => {
    const dom = getQuery();
    const adapter =
      dom === undefined ? undefined : ensureSettingsUi(dom).craftToggles;
    if (adapter === undefined) {
      unported("craft toggles")();
      return;
    }
    adapter.createCraftToggles();
  };

  const removeCraftToggles = () => {
    const dom = getQuery();
    const adapter =
      dom === undefined ? undefined : ensureSettingsUi(dom).craftToggles;
    if (adapter === undefined) {
      unported("craft toggles")();
      return;
    }
    adapter.removeCraftToggles();
  };

  const createBuildingToggles = () => {
    const dom = getQuery();
    const adapter =
      dom === undefined ? undefined : ensureSettingsUi(dom).buildingToggles;
    if (adapter === undefined) {
      unported("building toggles")();
      return;
    }
    adapter.createBuildingToggles();
  };

  const removeBuildingToggles = () => {
    const dom = getQuery();
    const adapter =
      dom === undefined ? undefined : ensureSettingsUi(dom).buildingToggles;
    if (adapter === undefined) {
      unported("building toggles")();
      return;
    }
    adapter.removeBuildingToggles();
  };

  let openOverrideModal: OptionsModalDependencies["openOverrideModal"] = (
    event,
  ) => {
    const dom = getQuery();
    if (dom === undefined) {
      return;
    }
    ensureSettingsUi(dom);
    openOverrideModal(event);
  };
  const optionsModal = createOptionsModalBrowserAdapter({
    getDocument: () => documentValue as OptionsModalDocument,
    getJQuery: () => getQuery() as unknown as OptionsModalQuery,
    getWindow: () => capturedPanelWindow,
    getSettingsReader: () => ({
      readToggle: (settingName: string) => {
        const raw = settings.readRaw();
        const overrides = raw["overrides"];
        return {
          checked: Boolean(raw[settingName]),
          inactive: isRecord(overrides)
            ? Boolean(overrides[settingName])
            : false,
        };
      },
    }),
    getSettingsWriter: () => ({
      setToggle: (settingName: string, checked: boolean) => {
        settings.readRaw()[settingName] = checked;
      },
      persist: persistSettings,
    }),
    // TRANSITIONAL: the four secondary-option modals (Government, Foreign Affairs, Hell, Fleet)
    // build their contents from legacy managers.
    getBuilders: () => ({
      government: unported("Government options"),
      war: unported("Foreign Affairs options"),
      hell: unported("Hell options"),
      fleet: unported("Fleet options"),
    }),
    openOverrideModal: (event) => openOverrideModal(event),
  });

  const { ensureAutomationContainer } = createAutomationContainer({
    getSettingsRaw: () => settings.readRaw(),
    getJQuery: () => getQuery() as unknown as ContainerQuery,
    getSafeMode: () => safeModeFor(capturedPanelWindow),
    getOverrideKeyLabel: () => overrideKeyLabelFor(capturedPanelWindow),
    getActions: () => ({
      // The panel and the toggle builder describe the same `DomList` through two independent narrow
      // contracts, and the container's is the smaller of the two. The node here always came from the
      // shared `$` above, so widening it back is a seam adaptation rather than an assumption.
      createSettingToggle: (node, settingName, title, onEnable, onDisable) =>
        optionsModal.createSettingToggle(
          node as unknown as OptionsModalNode,
          settingName,
          title,
          onEnable,
          onDisable,
        ),
      updateSettingsFromState: persistSettings,
      buildScriptSettings,
      removeScriptSettings,
      createMechInfo: unported("mech info panel"),
      removeMechInfo: unported("mech info panel"),
      createCraftToggles,
      removeCraftToggles,
      createBuildingToggles,
      removeBuildingToggles,
      createArpaToggles,
      removeArpaToggles,
      createStorageToggles: unported("storage toggles"),
      removeStorageToggles: unported("storage toggles"),
      createMarketToggles: unported("market toggles"),
      removeMarketToggles: unported("market toggles"),
      createEjectToggles: unported("eject toggles"),
      removeEjectToggles: unported("eject toggles"),
      createSupplyToggles: unported("supply toggles"),
      removeSupplyToggles: unported("supply toggles"),
      updateScriptData: unported("script data readouts"),
      finalizeScriptData: unported("script data readouts"),
      autoMarket: unported("bulk sell button"),
    }),
  });

  return Object.freeze({
    ensurePanel() {
      if (getQuery() === undefined) return;
      try {
        prepareSettingsForUi();
        ensureAutomationContainer();
        if (settings.readRaw()["autoBuild"] === true) {
          settingsUi?.buildingToggles?.ensureBuildingToggles();
        } else {
          settingsUi?.buildingToggles?.removeBuildingToggles();
        }
        if (settings.readRaw()["autoARPA"] === true) {
          settingsUi?.arpaToggles?.ensureArpaToggles();
        } else {
          settingsUi?.arpaToggles?.removeArpaToggles();
        }
        optionsModal.createOptionsModal();
        if (settings.readRaw()["showSettings"] === true) buildScriptSettings();
      } catch (error) {
        // A panel that fails to draw must never stop the automation tick.
        logError(`settings panel could not be drawn: ${String(error)}`);
      }
    },
    refreshSettings() {
      if (settings.readRaw()["showSettings"] !== true) return;
      try {
        removeScriptSettings();
        buildScriptSettings();
      } catch (error) {
        logError(`settings panel could not be refreshed: ${String(error)}`);
      }
    },
  });
}
