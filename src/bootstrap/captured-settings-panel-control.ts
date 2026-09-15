/**
 * The script's settings panel, composed for the captured runtime.
 *
 * The captured runtime owns the top-level automation toggles and the record-only settings sections.
 * This control wires those existing typed browser builders to the captured settings record instead
 * of to the legacy closure; game-backed sections remain outside this slice until their captures exist.
 *
 * TRANSITIONAL: the remaining per-section builders (the Settings tab, and the toggle strips
 * injected into the game's own Building/ARPA/Storage/Market/Eject/Supply panels) still reach the mutable
 * managers under `src/game/`, which are not in the production bundle. They are diagnosed once by
 * name rather than silently doing nothing, and each is replaced by its captured equivalent in a
 * later slice. Automation itself does not depend on any of them — it reads the same settings
 * record this panel writes.
 */

import { createAutomationContainer } from "../ui/automation-container.ts";
import {
  createCraftToggleBrowserAdapter,
  type CraftToggleBrowserDependencies,
} from "../adapters/browser/craft-toggles.ts";
import { createCapturedCraftToggleReader } from "../adapters/evolve/economy/production/captured-craft-toggles.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
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
import {
  computeAchievementGuardDefaults,
  computeAuthorityDefaults,
  computeChallengeHelperDefaults,
  computeGeneralDefaults,
  computeInterfaceDefaults,
  computeStateLogDefaults,
} from "../domain/settings-defaults.ts";
import type { SettingsStore } from "../adapters/browser/settings-store.ts";
import { inspectImportedSettings } from "../adapters/browser/settings-import.ts";
import {
  createFileDownload,
  type FileDownloadDependencies,
} from "../adapters/browser/file-download.ts";
import { createSettingsControls } from "../ui/settings-controls.ts";
import { createSettingsInputs } from "../ui/settings-inputs.ts";
import { createSettingsShell } from "../ui/settings-shell.ts";
import { isRecord, readProperty } from "../adapters/validation.ts";

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
type SettingsControlsDependencies = Parameters<
  typeof createSettingsControls
>[0];
type SettingsInputsDependencies = Parameters<typeof createSettingsInputs>[0];
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
type SettingsShellDependencies = Parameters<typeof createSettingsShell>[0];
type SettingsControlNode = Parameters<
  ReturnType<typeof createSettingsControls>["addSettingsNumber"]
>[0];
type CraftToggles = ReturnType<typeof createCraftToggleBrowserAdapter>;
type CraftToggleJQuery = ReturnType<
  CraftToggleBrowserDependencies["getJQuery"]
>;

export interface CapturedSettingsPanelDependencies {
  /** The page's global object; the panel reads `document`, `navigator` and `location` from it. */
  readonly capturedPanelWindow: unknown;
  readonly settings: SettingsStore;
  readonly craftToggles?: {
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
  craftToggles: capturedCraftToggles,
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
  ) => {
    const raw = settings.readRaw();
    const overrides = raw["overrides"];
    if (isRecord(overrides) && !Array.isArray(overrides)) {
      for (const key of Object.keys(defaults)) delete overrides[key];
    }
    Object.assign(raw, defaults);
  };

  let settingsUi:
    | {
        readonly general: GeneralSettings;
        readonly achievementGuard: AchievementGuardSettings;
        readonly challengeHelper: ChallengeHelperSettings;
        readonly interface: InterfaceSettings;
        readonly stateLog: StateLogSettings;
        readonly authority: AuthoritySettings;
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
    const inputs = createSettingsInputs({
      getAutocomplete: () => autocomplete,
      getJQuery: getJQuery as SettingsInputsDependencies["getJQuery"],
      getRealNumber: () => formatting.getRealNumber,
    });
    const controls = createSettingsControls({
      getAutocomplete: () => autocomplete,
      getJQuery: getJQuery as SettingsControlsDependencies["getJQuery"],
      getSettingsRaw: () => {
        prepareSettingsForUi();
        return settings.readRaw() as ReturnType<
          SettingsControlsDependencies["getSettingsRaw"]
        >;
      },
      getRealNumber: () => formatting.getRealNumber,
      getUpdateSettingsFromState: () => () => settings.persist(),
      openOverrideModal: unported("per-setting override editor"),
      buildSelectOptions: inputs.buildSelectOptions,
    });
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
      buildHellSettings: () => {},
      buildMechSettings: () => {},
      buildFleetSettings: () => {},
      buildEjectorSettings: () => {},
      buildMarketSettings: () => {},
      buildStorageSettings: () => {},
      buildMagicSettings: () => {},
      buildProductionSettings: () => {},
      buildJobSettings: () => {},
      buildBuildingSettings: () => {},
      buildWeightingSettings: () => {},
      buildProjectSettings: () => {},
      buildLoggingSettings: () => {},
      filterBuildingSettingsTable: () => {},
      updateSettingsFromState: () => settings.persist(),
      importSettings: importScriptSettings,
      exportSettings: () => JSON.stringify(settings.readRaw()),
      triggerFileDownload: fileDownload ?? reportNoFileDownload,
      confirm: (message) => confirmInPanelWindow(capturedPanelWindow, message),
    });
    const generalIntent = createGeneralSettingsIntentHandler({
      writer: {
        resetToDefaults: () => {
          const raw = settings.readRaw();
          const overrides = raw["overrides"];
          if (isRecord(overrides) && !Array.isArray(overrides)) {
            for (const key of Object.keys(generalDefaults))
              delete overrides[key];
          }
          Object.assign(raw, generalDefaults);
        },
        persist: () => settings.persist(),
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
    };
    const createSimpleWriter = (
      defaults: Readonly<Record<string, unknown>>,
    ) => ({
      resetToDefaults: () => resetCapturedSectionRecord(defaults),
      persist: () => settings.persist(),
    });
    let achievementIntent: ReturnType<
      typeof createAchievementGuardSettingsIntentHandler
    >;
    achievementIntent = createAchievementGuardSettingsIntentHandler({
      writer: createSimpleWriter(computeAchievementGuardDefaults().def),
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
      writer: createSimpleWriter(computeChallengeHelperDefaults().def),
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
      writer: createSimpleWriter(computeInterfaceDefaults().def),
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
      writer: createSimpleWriter(computeStateLogDefaults().def),
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
      writer: createSimpleWriter(computeAuthorityDefaults().def),
      renderSettingsContent: () => authority?.updateAuthoritySettingsContent(),
    });
    authority = createAuthoritySettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: authorityIntent,
      getActions: () =>
        simpleActions as unknown as AuthoritySettingsBrowserActions,
    });
    settingsUi = {
      general,
      achievementGuard,
      challengeHelper,
      interface: interfaceSettings,
      stateLog,
      authority,
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
    settings.replaceRaw(inspection.settings);
    settings.persist();
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
  };

  const removeScriptSettings = () => {
    getQuery()?.("#script_settings").remove();
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
      persist: () => settings.persist(),
    }),
    // TRANSITIONAL: the four secondary-option modals (Government, Foreign Affairs, Hell, Fleet)
    // build their contents from legacy managers.
    getBuilders: () => ({
      government: unported("Government options"),
      war: unported("Foreign Affairs options"),
      hell: unported("Hell options"),
      fleet: unported("Fleet options"),
    }),
    openOverrideModal: unported("per-setting override editor"),
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
      updateSettingsFromState: () => settings.persist(),
      buildScriptSettings,
      removeScriptSettings,
      createMechInfo: unported("mech info panel"),
      removeMechInfo: unported("mech info panel"),
      createCraftToggles,
      removeCraftToggles,
      createBuildingToggles: unported("building toggles"),
      removeBuildingToggles: unported("building toggles"),
      createArpaToggles: unported("ARPA toggles"),
      removeArpaToggles: unported("ARPA toggles"),
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
