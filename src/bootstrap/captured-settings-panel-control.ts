/**
 * The script's settings panel, composed for the captured runtime.
 *
 * The captured runtime owns the top-level automation toggles and the captured settings sections.
 * This control wires those existing typed browser builders to the captured settings record instead
 * of to the legacy closure; game-backed sections remain outside this slice until their captures exist.
 *
 * TRANSITIONAL: the remaining per-section builders (the Settings tab) are still unavailable on
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
import {
  createStorageSettingsBrowserAdapter,
  type StorageSettingsBrowserActions,
} from "../adapters/browser/storage-settings.ts";
import { createStorageSettingsIntentHandler } from "../application/storage-settings.ts";
import { createCapturedStorageSettingsAdapter } from "../adapters/evolve/economy/storage/captured-storage-settings.ts";
import { createCapturedStorageToggleReader } from "../adapters/evolve/economy/storage/captured-storage-toggles.ts";
import { createResourceToggleBrowserAdapter } from "../adapters/browser/resource-toggles.ts";
import {
  createMarketSettingsBrowserAdapter,
  type MarketSettingsBrowserActions,
} from "../adapters/browser/market-settings.ts";
import { createMarketSettingsIntentHandler } from "../application/market-settings.ts";
import { createCapturedMarketSettingsAdapter } from "../adapters/evolve/economy/market/captured-market-settings.ts";
import { createCapturedMarketToggleReader } from "../adapters/evolve/economy/market/captured-market-toggles.ts";
import {
  createEjectorSettingsBrowserAdapter,
  type EjectorSettingsBrowserActions,
} from "../adapters/browser/ejector-settings.ts";
import { createEjectorSettingsIntentHandler } from "../application/ejector-settings.ts";
import { createCapturedEjectorSettingsAdapter } from "../adapters/evolve/economy/resources/captured-ejector-settings.ts";
import { createCapturedEjectToggleReader } from "../adapters/evolve/economy/resources/captured-eject-toggles.ts";
import { createEjectToggleBrowserAdapter } from "../adapters/browser/eject-toggles.ts";
import { createCapturedSupplyToggleReader } from "../adapters/evolve/economy/resources/captured-supply-toggles.ts";
import { createSupplyToggleBrowserAdapter } from "../adapters/browser/supply-toggles.ts";
import {
  createMagicSettingsBrowserAdapter,
  type MagicSettingsBrowserActions,
} from "../adapters/browser/magic-settings.ts";
import { createMagicSettingsIntentHandler } from "../application/magic-settings.ts";
import { createCapturedMagicSettingsAdapter } from "../adapters/evolve/economy/production/captured-magic-settings.ts";
import { createProductionSettingsBrowserAdapter } from "../adapters/browser/production-settings.ts";
import { createProductionSettingsIntentHandler } from "../application/production-settings.ts";
import { createCapturedProductionSettingsAdapter } from "../adapters/evolve/economy/production/captured-production-settings.ts";
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
  createWarSettingsBrowserAdapter,
  type WarSettingsBrowserActions,
} from "../adapters/browser/war-settings.ts";
import { createWarSettingsReadModel } from "../domain/combat/war-settings.ts";
import {
  createEvolutionSettingsBrowserAdapter,
  type EvolutionSettingsBrowserActions,
} from "../adapters/browser/evolution-settings.ts";
import { createCapturedEvolutionSettingsAdapter } from "../adapters/evolve/progression/evolution/captured-evolution-settings.ts";
import {
  createPlanetSettingsBrowserAdapter,
  type PlanetSettingsBrowserActions,
} from "../adapters/browser/planet-settings.ts";
import { createCapturedPlanetSettingsAdapter } from "../adapters/evolve/progression/evolution/captured-planet-settings.ts";
import {
  createPrestigeSettingsBrowserAdapter,
  type PrestigeSettingsBrowserActions,
} from "../adapters/browser/prestige-settings.ts";
import { createCapturedPrestigeSettingsAdapter } from "../adapters/evolve/progression/prestige/captured-prestige-settings.ts";
import {
  createWeightingSettingsBrowserAdapter,
  type WeightingSettingsBrowserActions,
} from "../adapters/browser/weighting-settings.ts";
import { getWeightingSettingsReadModel } from "../domain/economy/resources/weighting-settings.ts";
import { createJobSettingsBrowserAdapter } from "../adapters/browser/job-settings.ts";
import {
  createTriggerSettingsBrowserAdapter,
  type TriggerSettingsBrowserActions,
} from "../adapters/browser/trigger-settings.ts";
import { createTriggerSettingsIntentHandler } from "../application/trigger-settings.ts";
import { createCapturedTriggerSettingsAdapter } from "../adapters/evolve/progression/build/captured-trigger-settings.ts";
import {
  createResearchSettingsBrowserAdapter,
  type ResearchSettingsBrowserActions,
} from "../adapters/browser/research-settings.ts";
import { createResearchSettingsIntentHandler } from "../application/research-settings.ts";
import { createCapturedResearchSettingsAdapter } from "../adapters/evolve/progression/research/captured-research-settings.ts";
import {
  createGovernmentSettingsBrowserAdapter,
  type GovernmentSettingsBrowserActions,
} from "../adapters/browser/government-settings.ts";
import { createGovernmentSettingsIntentHandler } from "../application/government-settings.ts";
import { createCapturedGovernmentSettingsAdapter } from "../adapters/evolve/civic/captured-government-settings.ts";
import {
  createFleetSettingsBrowserAdapter,
  type FleetSettingsBrowserActions,
  type FleetSettingsBrowserAdapter,
} from "../adapters/browser/fleet-settings.ts";
import { createFleetSettingsIntentHandler } from "../application/fleet-settings.ts";
import { createCapturedFleetSettingsAdapter } from "../adapters/evolve/combat/captured-fleet-settings.ts";
import { createTraitSettingsBrowserAdapter } from "../adapters/browser/trait-settings.ts";
import { createTraitSettingsIntentHandler } from "../application/trait-settings.ts";
import { createCapturedTraitSettingsAdapter } from "../adapters/evolve/traits/captured-trait-settings.ts";
import type { TriggerValue } from "../domain/progression/build/trigger-settings.ts";
import type {
  ObjectList,
  SettingsInputCallback,
  SettingsInputOptions,
} from "../ui/settings-inputs.ts";
import { createTableSorter } from "../adapters/browser/table-sorter.ts";
import {
  writeDefaultPriorityOrder,
  writeExplicitPriorityOrder,
} from "../domain/settings-priority-order.ts";

const jobPrioritySettingName = (jobId: string) => `job_p_${jobId}`;
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
import { createWarSettingsIntentHandler } from "../application/war-settings.ts";
import { createEvolutionSettingsIntentHandler } from "../application/evolution-settings.ts";
import { createPlanetSettingsIntentHandler } from "../application/planet-settings.ts";
import { createPrestigeSettingsIntentHandler } from "../application/prestige-settings.ts";
import { createWeightingSettingsIntentHandler } from "../application/weighting-settings.ts";
import {} from "../domain/settings-defaults.ts";
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
type StorageSettings = ReturnType<typeof createStorageSettingsBrowserAdapter>;
type StorageToggles = ReturnType<typeof createResourceToggleBrowserAdapter>;
type StorageSettingsDocument = ReturnType<
  Parameters<typeof createStorageSettingsBrowserAdapter>[0]["getDocument"]
>;
type StorageSettingsJQuery = ReturnType<
  Parameters<typeof createStorageSettingsBrowserAdapter>[0]["getJQuery"]
>;
type StorageToggleDocument = ReturnType<
  Parameters<typeof createCapturedStorageToggleReader>[0]["getDocument"]
>;
type StorageToggleJQuery = ReturnType<
  Parameters<typeof createResourceToggleBrowserAdapter>[0]["getJQuery"]
>;
type StorageToggleNode = Parameters<
  Parameters<typeof createResourceToggleBrowserAdapter>[0]["addToggleCallbacks"]
>[0];
type MarketSettings = ReturnType<typeof createMarketSettingsBrowserAdapter>;
type MarketToggles = ReturnType<typeof createResourceToggleBrowserAdapter>;
type MarketSettingsDocument = ReturnType<
  Parameters<typeof createMarketSettingsBrowserAdapter>[0]["getDocument"]
>;
type MarketSettingsJQuery = ReturnType<
  Parameters<typeof createMarketSettingsBrowserAdapter>[0]["getJQuery"]
>;
type MarketToggleDocument = ReturnType<
  Parameters<typeof createCapturedMarketToggleReader>[0]["getDocument"]
>;
type MarketToggleJQuery = ReturnType<
  Parameters<typeof createResourceToggleBrowserAdapter>[0]["getJQuery"]
>;
type EjectorSettings = ReturnType<typeof createEjectorSettingsBrowserAdapter>;
type EjectToggles = ReturnType<typeof createEjectToggleBrowserAdapter>;
type SupplyToggles = ReturnType<typeof createSupplyToggleBrowserAdapter>;
type EjectorSettingsDocument = ReturnType<
  Parameters<typeof createEjectorSettingsBrowserAdapter>[0]["getDocument"]
>;
type EjectorSettingsJQuery = ReturnType<
  Parameters<typeof createEjectorSettingsBrowserAdapter>[0]["getJQuery"]
>;
type EjectToggleDocument = ReturnType<
  Parameters<typeof createCapturedEjectToggleReader>[0]["getDocument"]
>;
type EjectToggleJQuery = ReturnType<
  Parameters<typeof createEjectToggleBrowserAdapter>[0]["getJQuery"]
>;
type EjectToggleNode = Parameters<
  Parameters<typeof createEjectToggleBrowserAdapter>[0]["addToggleCallbacks"]
>[0];
type SupplyToggleDocument = ReturnType<
  Parameters<typeof createCapturedSupplyToggleReader>[0]["getDocument"]
>;
type SupplyToggleJQuery = ReturnType<
  Parameters<typeof createSupplyToggleBrowserAdapter>[0]["getJQuery"]
>;
type SupplyToggleNode = Parameters<
  Parameters<typeof createSupplyToggleBrowserAdapter>[0]["addToggleCallbacks"]
>[0];
type MagicSettings = ReturnType<typeof createMagicSettingsBrowserAdapter>;
type MagicSettingsDocument = ReturnType<
  Parameters<typeof createMagicSettingsBrowserAdapter>[0]["getDocument"]
>;
type MagicSettingsJQuery = ReturnType<
  Parameters<typeof createMagicSettingsBrowserAdapter>[0]["getJQuery"]
>;
type ProductionSettings = ReturnType<
  typeof createProductionSettingsBrowserAdapter
>;
type ProductionSettingsDocument = ReturnType<
  Parameters<typeof createProductionSettingsBrowserAdapter>[0]["getDocument"]
>;
type ProductionSettingsJQuery = ReturnType<
  Parameters<typeof createProductionSettingsBrowserAdapter>[0]["getJQuery"]
>;
type TriggerSettings = ReturnType<typeof createTriggerSettingsBrowserAdapter>;
type TriggerSettingsDocument = ReturnType<
  Parameters<typeof createTriggerSettingsBrowserAdapter>[0]["getDocument"]
>;
type TriggerSettingsJQuery = ReturnType<
  Parameters<typeof createTriggerSettingsBrowserAdapter>[0]["getJQuery"]
>;
type ResearchSettings = ReturnType<typeof createResearchSettingsBrowserAdapter>;
type ResearchSettingsDocument = ReturnType<
  Parameters<typeof createResearchSettingsBrowserAdapter>[0]["getDocument"]
>;
type ResearchSettingsJQuery = ReturnType<
  Parameters<typeof createResearchSettingsBrowserAdapter>[0]["getJQuery"]
>;
type GovernmentSettings = ReturnType<
  typeof createGovernmentSettingsBrowserAdapter
>;
type GovernmentSettingsDocument = ReturnType<
  Parameters<typeof createGovernmentSettingsBrowserAdapter>[0]["getDocument"]
>;
type GovernmentSettingsJQuery = ReturnType<
  Parameters<typeof createGovernmentSettingsBrowserAdapter>[0]["getJQuery"]
>;
type EvolutionSettings = ReturnType<
  typeof createEvolutionSettingsBrowserAdapter
>;
type EvolutionSettingsDocument = ReturnType<
  Parameters<typeof createEvolutionSettingsBrowserAdapter>[0]["getDocument"]
>;
type EvolutionSettingsJQuery = ReturnType<
  Parameters<typeof createEvolutionSettingsBrowserAdapter>[0]["getJQuery"]
>;
type PrestigeSettings = ReturnType<typeof createPrestigeSettingsBrowserAdapter>;
type PrestigeSettingsDocument = ReturnType<
  Parameters<typeof createPrestigeSettingsBrowserAdapter>[0]["getDocument"]
>;
type PrestigeSettingsJQuery = ReturnType<
  Parameters<typeof createPrestigeSettingsBrowserAdapter>[0]["getJQuery"]
>;
type PlanetSettings = ReturnType<typeof createPlanetSettingsBrowserAdapter>;
type PlanetSettingsDocument = ReturnType<
  Parameters<typeof createPlanetSettingsBrowserAdapter>[0]["getDocument"]
>;
type PlanetSettingsJQuery = ReturnType<
  Parameters<typeof createPlanetSettingsBrowserAdapter>[0]["getJQuery"]
>;
type WarSettings = ReturnType<typeof createWarSettingsBrowserAdapter>;
type WarSettingsDocument = Parameters<
  typeof createWarSettingsBrowserAdapter
>[0]["getDocument"] extends () => infer D
  ? D
  : never;
type WarSettingsJQuery = Parameters<
  typeof createWarSettingsBrowserAdapter
>[0]["getJQuery"] extends () => infer J
  ? J
  : never;
type FleetSettings = ReturnType<typeof createFleetSettingsBrowserAdapter>;
type FleetSettingsDocument = ReturnType<
  Parameters<typeof createFleetSettingsBrowserAdapter>[0]["getDocument"]
>;
type FleetSettingsJQuery = ReturnType<
  Parameters<typeof createFleetSettingsBrowserAdapter>[0]["getJQuery"]
>;
type TraitSettings = ReturnType<typeof createTraitSettingsBrowserAdapter>;
type TraitSettingsDocument = ReturnType<
  Parameters<typeof createTraitSettingsBrowserAdapter>[0]["getDocument"]
>;
type TraitSettingsJQuery = ReturnType<
  Parameters<typeof createTraitSettingsBrowserAdapter>[0]["getJQuery"]
>;

export interface CapturedSettingsPanelDependencies {
  /** The page's global object; the panel reads `document`, `navigator` and `location` from it. */
  readonly capturedPanelWindow: unknown;
  readonly settings: CapturedSettingsStore;
  /** The captured raw/effective settings boundary: the one authority for defaults and resets. */
  readonly settingsLifecycle: CapturedSettingsLifecycle;
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
  readonly storageSettings?: {
    readonly rootState: GameRootStateSource;
    readonly controls: GameControlRegistry;
  };
  readonly marketSettings?: {
    readonly rootState: GameRootStateSource;
    readonly controls: GameControlRegistry;
  };
  readonly ejectorSettings?: {
    readonly rootState: GameRootStateSource;
    readonly controls: GameControlRegistry;
  };
  readonly magicSettings?: {
    readonly rootState: GameRootStateSource;
    readonly controls: GameControlRegistry;
  };
  readonly productionSettings?: {
    readonly rootState: GameRootStateSource;
  };
  readonly researchSettings?: {
    readonly rootState: GameRootStateSource;
    readonly controls: GameControlRegistry;
  };
  readonly fleetSettings?: {
    readonly controls: GameControlRegistry;
  };
  readonly traitSettings?: {
    readonly rootState: GameRootStateSource;
  };
  readonly prestigeSettings?: {
    /** Clears the captured prestige goal handoff when the player changes the prestige type. */
    readonly setGoalStandard: () => void;
  };
  readonly evolutionSettings?: {
    /** Drops the captured evolution runtime's committed target when the player picks another. */
    readonly clearStoredTarget: () => void;
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

/** Every settings adapter the panel builds on first draw. */
interface SettingsUi {
  readonly general: GeneralSettings;
  readonly achievementGuard: AchievementGuardSettings;
  readonly challengeHelper: ChallengeHelperSettings;
  readonly interface: InterfaceSettings;
  readonly stateLog: StateLogSettings;
  readonly authority: AuthoritySettings;
  readonly hell: HellSettings;
  readonly evolution: EvolutionSettings;
  readonly planet: PlanetSettings;
  readonly prestige: PrestigeSettings;
  readonly war: WarSettings;
  readonly weighting: WeightingSettings;
  readonly job: JobSettings;
  readonly building: BuildingSettings | undefined;
  readonly buildingToggles: BuildingToggles | undefined;
  readonly project: ProjectSettings | undefined;
  readonly arpaToggles: ArpaToggles | undefined;
  readonly storage: StorageSettings | undefined;
  readonly storageToggles: StorageToggles | undefined;
  readonly market: MarketSettings | undefined;
  readonly marketToggles: MarketToggles | undefined;
  readonly ejector: EjectorSettings | undefined;
  readonly ejectToggles: EjectToggles | undefined;
  readonly supplyToggles: SupplyToggles | undefined;
  readonly magic: MagicSettings | undefined;
  readonly production: ProductionSettings | undefined;
  readonly government: GovernmentSettings | undefined;
  readonly fleet: FleetSettings | undefined;
  readonly trait: TraitSettings | undefined;
  readonly craftToggles: CraftToggles | undefined;
  readonly shell: SettingsShell;
}

export function createCapturedSettingsPanel({
  capturedPanelWindow,
  settings,
  settingsLifecycle,
  refreshEffectiveSettings,
  prestigeSettings: capturedPrestigeSettings,
  evolutionSettings: capturedEvolutionSettings,
  craftToggles: capturedCraftToggles,
  buildingSettings: capturedBuildingSettings,
  projectSettings: capturedProjectSettings,
  storageSettings: capturedStorageSettings,
  marketSettings: capturedMarketSettings,
  ejectorSettings: capturedEjectorSettings,
  magicSettings: capturedMagicSettings,
  productionSettings: capturedProductionSettings,
  researchSettings: capturedResearchSettings,
  fleetSettings: capturedFleetSettings,
  traitSettings: capturedTraitSettings,
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

  const prepareSettingsForUi = () => {
    // One authoritative route: storage -> lifecycle -> initialized raw record -> panel. The panel
    // supplies no runtime defaults of its own; by the time anything is drawn the lifecycle has
    // already shaped, migrated and defaulted the record the UI edits.
    settingsLifecycle.initialize();
    refreshEffectiveSettings?.();
  };

  /**
   * The one reset a section button performs. Every section names itself and nothing else;
   * what that section owns is decided by the section policy, not restated per callback.
   */
  const resetSection = (section: string) => () =>
    settingsLifecycle.resetSection(section);

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

  let settingsUi: SettingsUi | undefined;

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
        getSettings: () => settingsLifecycle.readEffective(),
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
    let storage: StorageSettings | undefined;
    let storageToggles: StorageToggles | undefined;
    let market: MarketSettings | undefined;
    let marketToggles: MarketToggles | undefined;
    let ejector: EjectorSettings | undefined;
    let ejectToggles: EjectToggles | undefined;
    let supplyToggles: SupplyToggles | undefined;
    let magic: MagicSettings | undefined;
    let production: ProductionSettings | undefined;
    let government: GovernmentSettings | undefined;
    let fleet: FleetSettings | undefined;
    let trait: TraitSettings | undefined;
    let research: ResearchSettings | undefined;
    let trigger: TriggerSettings | undefined;
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
      buildPrestigeSettings: (parentNode, secondaryPrefix) =>
        prestige?.buildPrestigeSettings(
          parentNode as unknown as Parameters<
            PrestigeSettings["buildPrestigeSettings"]
          >[0],
          secondaryPrefix,
        ),
      buildGeneralSettings: () => general?.buildGeneralSettings(),
      buildInterfaceSettings: () => interfaceSettings?.buildInterfaceSettings(),
      buildStateLogSettings: () => stateLog?.buildStateLogSettings(),
      buildAchievementGuardSettings: () =>
        achievementGuard?.buildAchievementGuardSettings(),
      buildChallengeHelperSettings: () =>
        challengeHelper?.buildChallengeHelperSettings(),
      buildGovernmentSettings: () => {},
      buildAuthoritySettings: () => authority?.buildAuthoritySettings(),
      buildEvolutionSettings: () => evolution?.buildEvolutionSettings(),
      buildPlanetSettings: () => planet?.buildPlanetSettings(),
      buildTraitSettings: () => trait?.buildTraitSettings(),
      buildTriggerSettings: () => trigger?.buildTriggerSettings(),
      buildResearchSettings: () => research?.buildResearchSettings(),
      buildWarSettings: (parentNode, secondaryPrefix) =>
        war?.buildWarSettings(
          parentNode as unknown as Parameters<
            WarSettings["buildWarSettings"]
          >[0],
          secondaryPrefix,
        ),
      buildHellSettings: (parentNode, secondaryPrefix) =>
        hell?.buildHellSettings(
          parentNode as unknown as Parameters<
            HellSettings["buildHellSettings"]
          >[0],
          secondaryPrefix,
        ),
      buildMechSettings: () => {},
      buildFleetSettings: () => {},
      buildEjectorSettings: () => ejector?.buildEjectorSettings(),
      buildMarketSettings: () => market?.buildMarketSettings(),
      buildStorageSettings: () => storage?.buildStorageSettings(),
      buildMagicSettings: () => magic?.buildMagicSettings(),
      buildProductionSettings: () => production?.buildProductionSettings(),
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
        resetToDefaults: resetSection("general"),
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
      getActions: () =>
        panelActions as unknown as GeneralSettingsBrowserActions,
    });
    /**
     * The control bridges every section builds its rows from. Each is the same one-line widening
     * of the shared settings-control node; the per-section `Actions` interfaces differ only in
     * how they spell that node, which is why each section still casts this object once to its
     * own shape rather than each section rewriting the bridges.
     */
    const panelActions = {
      buildSettingsSection: shell.buildSettingsSection,
      addSettingsHeader1: shell.addSettingsHeader1,
      addStandardHeading: (node: unknown, heading: string) =>
        shell.addStandardHeading(
          node as Parameters<typeof shell.addStandardHeading>[0],
          heading,
        ),
      buildSettingsSection2: (
        parentNode: unknown,
        secondaryPrefix: string,
        sectionId: string,
        sectionName: string,
        resetFunction: () => void,
        updateSettingsContentFunction: (prefix: string) => void,
      ) =>
        shell.buildSettingsSection2(
          parentNode as Parameters<SettingsShell["buildSettingsSection2"]>[0],
          secondaryPrefix,
          sectionId,
          sectionName,
          resetFunction,
          updateSettingsContentFunction,
        ),
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
      addTableInput: (node: unknown, settingName: string) =>
        controls.addTableInput(node as SettingsControlNode, settingName),
      addTableToggle: (node: unknown, settingName: string) =>
        controls.addTableToggle(node as SettingsControlNode, settingName),
      addToggleCallbacks: (node: unknown, settingName: string) =>
        controls.addToggleCallbacks(node as SettingsControlNode, settingName),
      buildTableLabel: (label: string, title?: string, color?: string) =>
        controls.buildTableLabel(label, title, color),
      getTableSorter: () => tableSorter,
      tableSorter,
      confirm: (message: string) =>
        confirmInPanelWindow(capturedPanelWindow, message),
    };
    // Government options are static captured copy, so this section needs no game
    // draw and is always built. It renders into the secondary options modal.
    const capturedGovernmentAdapter = createCapturedGovernmentSettingsAdapter();
    let governmentIntent: ReturnType<
      typeof createGovernmentSettingsIntentHandler
    >;
    government = createGovernmentSettingsBrowserAdapter({
      getDocument: () => documentForUi as unknown as GovernmentSettingsDocument,
      getJQuery: () => getJQuery() as unknown as GovernmentSettingsJQuery,
      getReadModel: capturedGovernmentAdapter.readGovernmentSettingsReadModel,
      intents: { handle: (intent) => governmentIntent.handle(intent) },
      getActions: () =>
        ({
          ...panelActions,
        }) as unknown as GovernmentSettingsBrowserActions,
    });
    governmentIntent = createGovernmentSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("government"),
        persist: persistSettings,
      },
      renderSettingsContent: (secondaryPrefix) =>
        government?.updateGovernmentSettingsContent(secondaryPrefix),
      effects: {
        resetCheckboxes: () =>
          controls.resetCheckbox("autoTax", "autoGovernment"),
      },
    });
    // Trigger rows and catalogs are settings-record data plus static captured
    // operand copy, so this section needs no game draw and is always built.
    const capturedTriggerAdapter = createCapturedTriggerSettingsAdapter({
      getSettingsRaw: settings.readRaw,
      promptEval: (message, value) => {
        const prompt = readProperty(capturedPanelWindow, "prompt");
        if (typeof prompt === "function")
          Reflect.apply(prompt, capturedPanelWindow, [message, value]);
      },
    });
    let triggerIntent: ReturnType<typeof createTriggerSettingsIntentHandler>;
    trigger = createTriggerSettingsBrowserAdapter({
      getDocument: () => documentForUi as unknown as TriggerSettingsDocument,
      getJQuery: () => getJQuery() as unknown as TriggerSettingsJQuery,
      reader: { read: capturedTriggerAdapter.readTriggerSettingsReadModel },
      intents: { handle: (intent) => triggerIntent.handle(intent) },
      getActions: () =>
        ({
          ...panelActions,
          buildInputNode: (
            arg: string,
            options: unknown,
            value: TriggerValue,
            onChange: (value: unknown) => void,
          ) =>
            controls.buildInputNode(
              arg,
              options as SettingsInputOptions,
              value,
              onChange as SettingsInputCallback,
            ),
        }) as unknown as TriggerSettingsBrowserActions,
    });
    triggerIntent = createTriggerSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("trigger"),
        addDefault: capturedTriggerAdapter.addDefault,
        update: capturedTriggerAdapter.update,
        remove: capturedTriggerAdapter.remove,
        duplicate: capturedTriggerAdapter.duplicate,
        evalize: capturedTriggerAdapter.evalize,
        reorder: capturedTriggerAdapter.reorder,
        persist: persistSettings,
      },
      render: () => trigger?.updateTriggerSettingsContent(),
      effects: {
        resetCheckbox: () => controls.resetCheckbox("autoTrigger"),
      },
    });
    const createSimpleWriter = (section: string) => ({
      resetToDefaults: resetSection(section),
      persist: persistSettings,
    });
    let achievementIntent: ReturnType<
      typeof createAchievementGuardSettingsIntentHandler
    >;
    achievementIntent = createAchievementGuardSettingsIntentHandler({
      writer: createSimpleWriter("achievementguard"),
      renderSettingsContent: () =>
        achievementGuard?.updateAchievementGuardSettingsContent(),
    });
    achievementGuard = createAchievementGuardSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: achievementIntent,
      getActions: () =>
        panelActions as unknown as AchievementGuardSettingsBrowserActions,
    });

    let challengeIntent: ReturnType<
      typeof createChallengeHelperSettingsIntentHandler
    >;
    challengeIntent = createChallengeHelperSettingsIntentHandler({
      writer: createSimpleWriter("challengehelper"),
      renderSettingsContent: () =>
        challengeHelper?.updateChallengeHelperSettingsContent(),
    });
    challengeHelper = createChallengeHelperSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: challengeIntent,
      getActions: () =>
        panelActions as unknown as ChallengeHelperSettingsBrowserActions,
    });

    let interfaceIntent: ReturnType<
      typeof createInterfaceSettingsIntentHandler
    >;
    interfaceIntent = createInterfaceSettingsIntentHandler({
      writer: createSimpleWriter("interface"),
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
          ...panelActions,
          controlEffects: {},
        }) as unknown as InterfaceSettingsBrowserActions,
    });

    let stateLogIntent: ReturnType<typeof createStateLogSettingsIntentHandler>;
    stateLogIntent = createStateLogSettingsIntentHandler({
      writer: createSimpleWriter("statelog"),
      renderSettingsContent: () => stateLog?.updateStateLogSettingsContent(),
    });
    stateLog = createStateLogSettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as Parameters<
        typeof createStateLogSettingsBrowserAdapter
      >[0]["getJQuery"],
      intents: stateLogIntent,
      buildSettingsSection: panelActions.buildSettingsSection,
      addSettingsToggle: panelActions.addSettingsToggle,
      addSettingsNumber: panelActions.addSettingsNumber,
    });

    let authorityIntent: ReturnType<
      typeof createAuthoritySettingsIntentHandler
    >;
    authorityIntent = createAuthoritySettingsIntentHandler({
      writer: createSimpleWriter("authority"),
      renderSettingsContent: () => authority?.updateAuthoritySettingsContent(),
    });
    authority = createAuthoritySettingsBrowserAdapter({
      getDocument: () => documentForUi,
      getJQuery: getJQuery as GeneralSettingsDependencies["getJQuery"],
      intents: authorityIntent,
      getActions: () =>
        panelActions as unknown as AuthoritySettingsBrowserActions,
    });
    let hell: HellSettings | undefined;
    const hellIntent = createHellSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("hell"),
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
      // The shell's own `buildSettingsSection2` already routes by prefix: an empty one draws the
      // ordinary section into `parentNode`, a non-empty one draws the same read model into the
      // secondary options modal. Hell needs no wrapper of its own for either.
      getActions: () => panelActions as unknown as HellSettingsBrowserActions,
    });
    // Evolution targets, challenges and the queue are static captured copy plus settings-record
    // data, so this section needs no game draw and is always built.
    const capturedEvolutionAdapter = createCapturedEvolutionSettingsAdapter({
      getSettingsRaw: settings.readRaw,
      ...(capturedEvolutionSettings === undefined
        ? {}
        : { clearStoredTarget: capturedEvolutionSettings.clearStoredTarget }),
    });
    let evolution: EvolutionSettings | undefined;
    let evolutionIntent: ReturnType<
      typeof createEvolutionSettingsIntentHandler
    >;
    evolution = createEvolutionSettingsBrowserAdapter({
      getDocument: () => documentForUi as unknown as EvolutionSettingsDocument,
      getJQuery: () => getJQuery() as unknown as EvolutionSettingsJQuery,
      reader: {
        read: capturedEvolutionAdapter.readEvolutionSettingsReadModel,
      },
      intents: { handle: (intent) => evolutionIntent.handle(intent) },
      getActions: () =>
        panelActions as unknown as EvolutionSettingsBrowserActions,
    });
    evolutionIntent = createEvolutionSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("evolution"),
        setTarget: capturedEvolutionAdapter.setTarget,
        addCurrent: capturedEvolutionAdapter.addCurrent,
        remove: capturedEvolutionAdapter.remove,
        edit: capturedEvolutionAdapter.edit,
        reorder: capturedEvolutionAdapter.reorder,
        persist: persistSettings,
      },
      render: () => evolution?.updateEvolutionSettingsContent(),
      effects: {
        resetCheckbox: () => controls.resetCheckbox("autoEvolution"),
      },
    });
    // The prestige vocabulary and the exposed control set are static; only the goal handoff needs
    // the runtime, and it is optional.
    const capturedPrestigeAdapter = createCapturedPrestigeSettingsAdapter();
    let prestige: PrestigeSettings | undefined;
    let prestigeIntent: ReturnType<typeof createPrestigeSettingsIntentHandler>;
    prestige = createPrestigeSettingsBrowserAdapter({
      getDocument: () => documentForUi as unknown as PrestigeSettingsDocument,
      getJQuery: () => getJQuery() as unknown as PrestigeSettingsJQuery,
      reader: capturedPrestigeAdapter,
      intents: { handle: (intent) => prestigeIntent.handle(intent) },
      getActions: () =>
        ({
          ...panelActions,
          // Only the withheld `prestigeCustomRaceMode` control reaches these, so they exist to
          // satisfy the shared browser adapter rather than to be called.
          openOptionsModal: () => unported("custom race preset editor")(),
          buildCustomRacePresetEditor: undefined,
        }) as unknown as PrestigeSettingsBrowserActions,
    });
    prestigeIntent = createPrestigeSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("prestige"),
        setPrestigeType: (value: string) => {
          settings.readRaw()["prestigeType"] = value;
        },
        setGoalStandard: () => capturedPrestigeSettings?.setGoalStandard(),
        persist: persistSettings,
      },
      reader: capturedPrestigeAdapter,
      render: (secondaryPrefix) =>
        prestige?.updatePrestigeSettingsContent(secondaryPrefix),
      effects: {
        confirm: (message) =>
          confirmInPanelWindow(capturedPanelWindow, message),
      },
    });
    // Planet weights are static id lists plus settings-record data. Every cell is read by the
    // captured planet planner's ranking input, so the table is live rather than decorative.
    const capturedPlanetAdapter = createCapturedPlanetSettingsAdapter();
    let planet: PlanetSettings | undefined;
    const planetIntent = createPlanetSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("planet"),
        persist: persistSettings,
      },
      renderSettingsContent: () => planet?.updatePlanetSettingsContent(),
    });
    planet = createPlanetSettingsBrowserAdapter({
      getDocument: () => documentForUi as unknown as PlanetSettingsDocument,
      getJQuery: () => getJQuery() as unknown as PlanetSettingsJQuery,
      getReadModel: capturedPlanetAdapter.readPlanetSettingsReadModel,
      intents: planetIntent,
      getActions: () => panelActions as unknown as PlanetSettingsBrowserActions,
    });
    // The Foreign Affairs vocabulary — policies, protect modes, labels — is static captured copy,
    // so this section needs no game draw and is always built. It renders both as an ordinary
    // section and into the secondary options modal; `buildSettingsSection2` picks by prefix.
    let war: WarSettings | undefined;
    const warIntent = createWarSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("war"),
        persist: persistSettings,
      },
      renderSettingsContent: (secondaryPrefix) =>
        war?.updateWarSettingsContent(secondaryPrefix),
      effects: { resetCheckboxes: () => controls.resetCheckbox("autoFight") },
    });
    war = createWarSettingsBrowserAdapter({
      getDocument: () => documentForUi as unknown as WarSettingsDocument,
      getJQuery: () => getJQuery() as unknown as WarSettingsJQuery,
      reader: { read: createWarSettingsReadModel },
      intents: warIntent,
      getActions: () => panelActions as unknown as WarSettingsBrowserActions,
    });
    let weighting: WeightingSettings | undefined;
    const weightingIntent = createWeightingSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("weighting"),
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
          ...panelActions,
        }) as unknown as WeightingSettingsBrowserActions,
      getReadModel: getWeightingSettingsReadModel,
    });
    const jobIntent = createJobSettingsIntentHandler({
      writer: {
        resetToDefaults: resetSection("job"),
        persist: () => settings.persist(),
        resetPriorities: () => {
          writeDefaultPriorityOrder(
            settings.readRaw(),
            capturedJobCatalogReader?.()?.jobs.map((entry) => entry.id) ?? [],
            jobPrioritySettingName,
          );
        },
        reorderJobs: (jobIds) => {
          writeExplicitPriorityOrder(
            settings.readRaw(),
            jobIds,
            capturedJobCatalogReader?.()?.jobs.map((entry) => entry.id) ?? [],
            jobPrioritySettingName,
          );
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
          ...panelActions,
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
            ...panelActions,
            addToggleCallbacks: (node: unknown, settingName: string) =>
              controls.addToggleCallbacks(
                node as SettingsControlNode,
                settingName,
              ) as unknown as BuildingSettingsNode,
          }) as unknown as BuildingSettingsBrowserActions,
      });
      buildingIntent = createBuildingSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("building"),
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
    if (capturedResearchSettings !== undefined) {
      const capturedAdapter = createCapturedResearchSettingsAdapter({
        rootState: capturedResearchSettings.rootState,
        controls: capturedResearchSettings.controls,
      });
      let researchIntent: ReturnType<
        typeof createResearchSettingsIntentHandler
      >;
      research = createResearchSettingsBrowserAdapter({
        getDocument: () => documentForUi as unknown as ResearchSettingsDocument,
        getJQuery: () => getJQuery() as unknown as ResearchSettingsJQuery,
        getReadModel: capturedAdapter.readResearchSettingsReadModel,
        intents: { handle: (intent) => researchIntent.handle(intent) },
        getActions: () =>
          ({
            ...panelActions,
            addSettingsList: (
              node: unknown,
              settingName: string,
              labelText: string,
              hintText: string,
              list: ObjectList,
            ) =>
              controls.addSettingsList(
                node as SettingsControlNode,
                settingName,
                labelText,
                hintText,
                list,
              ),
          }) as unknown as ResearchSettingsBrowserActions,
      });
      researchIntent = createResearchSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("research"),
          persist: persistSettings,
        },
        renderSettingsContent: () => research?.updateResearchSettingsContent(),
        effects: {
          resetCheckbox: () => controls.resetCheckbox("autoResearch"),
        },
      });
    }
    if (capturedFleetSettings !== undefined) {
      const capturedAdapter = createCapturedFleetSettingsAdapter({
        controls: capturedFleetSettings.controls,
        getSettingsRaw: settings.readRaw,
      });
      let fleetIntent: ReturnType<typeof createFleetSettingsIntentHandler>;
      fleet = createFleetSettingsBrowserAdapter({
        getDocument: () => documentForUi as unknown as FleetSettingsDocument,
        getJQuery: () => getJQuery() as unknown as FleetSettingsJQuery,
        reader: { read: capturedAdapter.readFleetSettingsReadModel },
        intents: { handle: (intent) => fleetIntent.handle(intent) },
        getActions: () =>
          ({
            ...panelActions,
            openOverrideModal: (event: unknown) =>
              openOverrideModal(
                event as unknown as Parameters<typeof openOverrideModal>[0],
              ),
          }) as unknown as FleetSettingsBrowserActions,
      });
      fleetIntent = createFleetSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("fleet"),
          reorderAndromeda: (regionIds) => {
            capturedAdapter.reorderAndromeda(regionIds);
          },
          persist: persistSettings,
        },
        render: (secondaryPrefix) =>
          fleet?.updateFleetSettingsContent(secondaryPrefix),
        effects: {
          resetCheckbox: () => controls.resetCheckbox("autoFleet"),
        },
      });
    }
    if (capturedTraitSettings !== undefined) {
      const capturedAdapter = createCapturedTraitSettingsAdapter({
        rootState: capturedTraitSettings.rootState,
        getSettingsRaw: settings.readRaw,
      });
      let traitIntent: ReturnType<typeof createTraitSettingsIntentHandler>;
      trait = createTraitSettingsBrowserAdapter({
        getReadModel: capturedAdapter.readTraitSettingsReadModel,
        getDocument: () => documentForUi as unknown as TraitSettingsDocument,
        getJQuery: () => getJQuery() as unknown as TraitSettingsJQuery,
        intents: { handle: (intent) => traitIntent.handle(intent) },
        getTableSorter: panelActions.getTableSorter,
        buildSettingsSection: panelActions.buildSettingsSection,
        addStandardHeading: panelActions.addStandardHeading,
        addSettingsSelect:
          panelActions.addSettingsSelect as unknown as Parameters<
            typeof createTraitSettingsBrowserAdapter
          >[0]["addSettingsSelect"],
        addSettingsNumber: panelActions.addSettingsNumber,
        addSettingsToggle: panelActions.addSettingsToggle,
        addTableToggle: panelActions.addTableToggle,
        addTableInput: panelActions.addTableInput,
        buildTableLabel: panelActions.buildTableLabel,
      });
      traitIntent = createTraitSettingsIntentHandler({
        writer: {
          resetMinorTraits: resetSection("minortrait"),
          resetMutableTraits: resetSection("mutabletrait"),
          persist: persistSettings,
          // No captured session target exists: the captured evolution samples
          // its target from settings on every cycle, so there is nothing to clear.
          clearEvolutionTarget: () => {},
          reorderMinorTraits: (traitIds) => {
            capturedAdapter.reorderMinorTraits(traitIds);
          },
          reorderMutableTraits: (traitIds) => {
            capturedAdapter.reorderMutableTraits(traitIds);
          },
          setBoolean: (settingName, value) => {
            capturedAdapter.setBoolean(settingName, value);
          },
        },
        renderSettingsContent: () => trait?.updateTraitSettingsContent(),
        effects: {
          resetCheckboxes: () =>
            controls.resetCheckbox(
              "autoMinorTrait",
              "autoMutateTraits",
              "autoGenetics",
            ),
        },
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
            ...panelActions,
          }) as unknown as ProjectSettingsBrowserActions,
      });
      projectIntent = createProjectSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("project"),
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
    const marketToggleReader =
      capturedMarketSettings === undefined
        ? undefined
        : createCapturedMarketToggleReader({
            rootState: capturedMarketSettings.rootState,
            controls: capturedMarketSettings.controls,
            getDocument: () => documentForUi as unknown as MarketToggleDocument,
            getSettingsRaw: settings.readRaw,
          });
    if (capturedStorageSettings !== undefined) {
      const capturedAdapter = createCapturedStorageSettingsAdapter({
        rootState: capturedStorageSettings.rootState,
        controls: capturedStorageSettings.controls,
        getSettingsRaw: settings.readRaw,
      });
      let storageIntent: ReturnType<typeof createStorageSettingsIntentHandler>;
      storage = createStorageSettingsBrowserAdapter({
        getDocument: () => documentForUi as unknown as StorageSettingsDocument,
        getJQuery: () => getJQuery() as unknown as StorageSettingsJQuery,
        getReadModel: capturedAdapter.readStorageSettingsReadModel,
        intents: { handle: (intent) => storageIntent.handle(intent) },
        getActions: () =>
          ({
            ...panelActions,
          }) as unknown as StorageSettingsBrowserActions,
      });
      storageIntent = createStorageSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("storage"),
          persist: persistSettings,
          reorderResources: capturedAdapter.reorderResources,
        },
        renderSettingsContent: () => storage?.updateStorageSettingsContent(),
        effects: {
          resetCheckbox: () => controls.resetCheckbox("autoStorage"),
          removeStorageToggles: () => storageToggles?.removeStorageToggles(),
        },
      });
      storageToggles = createResourceToggleBrowserAdapter({
        getJQuery: () => getJQuery() as unknown as StorageToggleJQuery,
        marketReader: marketToggleReader ?? {
          readMarket: () => {
            throw new Error("market toggles are not ported yet");
          },
        },
        storageReader: createCapturedStorageToggleReader({
          rootState: capturedStorageSettings.rootState,
          controls: capturedStorageSettings.controls,
          getDocument: () => documentForUi as unknown as StorageToggleDocument,
          getSettingsRaw: settings.readRaw,
        }),
        addToggleCallbacks: (node, settingName) =>
          controls.addToggleCallbacks(
            node as unknown as SettingsControlNode,
            settingName,
          ) as unknown as StorageToggleNode,
      });
    }
    if (
      capturedMarketSettings !== undefined &&
      marketToggleReader !== undefined
    ) {
      const capturedAdapter = createCapturedMarketSettingsAdapter({
        rootState: capturedMarketSettings.rootState,
        controls: capturedMarketSettings.controls,
        getSettingsRaw: settings.readRaw,
      });
      let marketIntent: ReturnType<typeof createMarketSettingsIntentHandler>;
      market = createMarketSettingsBrowserAdapter({
        getDocument: () => documentForUi as unknown as MarketSettingsDocument,
        getJQuery: () => getJQuery() as unknown as MarketSettingsJQuery,
        reader: { read: capturedAdapter.readMarketSettingsReadModel },
        intents: { handle: (intent) => marketIntent.handle(intent) },
        getActions: () =>
          ({
            ...panelActions,
          }) as unknown as MarketSettingsBrowserActions,
      });
      marketIntent = createMarketSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("market"),
          persist: persistSettings,
          reorderResources: capturedAdapter.reorderResources,
        },
        renderSettingsContent: () => market?.updateMarketSettingsContent(),
        effects: {
          resetCheckboxes: () =>
            controls.resetCheckbox("autoMarket", "autoGalaxyMarket"),
          removeMarketToggles: () => marketToggles?.removeMarketToggles(),
        },
      });
      marketToggles = createResourceToggleBrowserAdapter({
        getJQuery: () => getJQuery() as unknown as MarketToggleJQuery,
        marketReader: marketToggleReader,
        storageReader:
          capturedStorageSettings === undefined
            ? {
                readStorage: () => {
                  throw new Error("storage toggles are not ported yet");
                },
              }
            : createCapturedStorageToggleReader({
                rootState: capturedStorageSettings.rootState,
                controls: capturedStorageSettings.controls,
                getDocument: () =>
                  documentForUi as unknown as StorageToggleDocument,
                getSettingsRaw: settings.readRaw,
              }),
        addToggleCallbacks: (node, settingName) =>
          controls.addToggleCallbacks(
            node as unknown as SettingsControlNode,
            settingName,
          ) as unknown as StorageToggleNode,
      });
    }
    if (capturedEjectorSettings !== undefined) {
      const capturedAdapter = createCapturedEjectorSettingsAdapter({
        rootState: capturedEjectorSettings.rootState,
        controls: capturedEjectorSettings.controls,
        getSettingsRaw: settings.readRaw,
      });
      let ejectorIntent: ReturnType<typeof createEjectorSettingsIntentHandler>;
      ejector = createEjectorSettingsBrowserAdapter({
        getDocument: () => documentForUi as unknown as EjectorSettingsDocument,
        getJQuery: () => getJQuery() as unknown as EjectorSettingsJQuery,
        reader: { read: capturedAdapter.readEjectorSettingsReadModel },
        intents: { handle: (intent) => ejectorIntent.handle(intent) },
        getActions: () =>
          ({
            ...panelActions,
          }) as unknown as EjectorSettingsBrowserActions,
      });
      ejectorIntent = createEjectorSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("ejector"),
          persist: persistSettings,
        },
        renderSettingsContent: () => ejector?.updateEjectorSettingsContent(),
        effects: {
          resetCheckboxes: () =>
            controls.resetCheckbox("autoEject", "autoSupply", "autoNanite"),
          removeEjectToggles: () => ejectToggles?.removeEjectToggles(),
          removeSupplyToggles: () => supplyToggles?.removeSupplyToggles(),
        },
      });
      ejectToggles = createEjectToggleBrowserAdapter({
        getJQuery: () => getJQuery() as unknown as EjectToggleJQuery,
        reader: createCapturedEjectToggleReader({
          rootState: capturedEjectorSettings.rootState,
          controls: capturedEjectorSettings.controls,
          getDocument: () => documentForUi as unknown as EjectToggleDocument,
          getSettingsRaw: settings.readRaw,
        }),
        addToggleCallbacks: (node, settingName) =>
          controls.addToggleCallbacks(
            node as unknown as SettingsControlNode,
            settingName,
          ) as unknown as EjectToggleNode,
      });
      supplyToggles = createSupplyToggleBrowserAdapter({
        getJQuery: () => getJQuery() as unknown as SupplyToggleJQuery,
        reader: createCapturedSupplyToggleReader({
          rootState: capturedEjectorSettings.rootState,
          controls: capturedEjectorSettings.controls,
          getDocument: () => documentForUi as unknown as SupplyToggleDocument,
          getSettingsRaw: settings.readRaw,
        }),
        addToggleCallbacks: (node, settingName) =>
          controls.addToggleCallbacks(
            node as unknown as SettingsControlNode,
            settingName,
          ) as unknown as SupplyToggleNode,
      });
    }
    if (capturedMagicSettings !== undefined) {
      const capturedAdapter = createCapturedMagicSettingsAdapter({
        rootState: capturedMagicSettings.rootState,
        controls: capturedMagicSettings.controls,
      });
      let magicIntent: ReturnType<typeof createMagicSettingsIntentHandler>;
      magic = createMagicSettingsBrowserAdapter({
        getDocument: () => documentForUi as unknown as MagicSettingsDocument,
        getJQuery: () => getJQuery() as unknown as MagicSettingsJQuery,
        getReadModel: capturedAdapter.readMagicSettingsReadModel,
        intents: { handle: (intent) => magicIntent.handle(intent) },
        getActions: () =>
          ({
            ...panelActions,
          }) as unknown as MagicSettingsBrowserActions,
      });
      magicIntent = createMagicSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("magic"),
          persist: persistSettings,
        },
        renderSettingsContent: () => magic?.updateMagicSettingsContent(),
        effects: {
          resetCheckboxes: () =>
            controls.resetCheckbox(
              "autoAlchemy",
              "autoPylon",
              "magicFullmetalHelper",
            ),
        },
      });
    }
    if (capturedProductionSettings !== undefined) {
      const capturedAdapter = createCapturedProductionSettingsAdapter({
        rootState: capturedProductionSettings.rootState,
        getSettingsRaw: settings.readRaw,
      });
      let productionIntent: ReturnType<
        typeof createProductionSettingsIntentHandler
      >;
      production = createProductionSettingsBrowserAdapter({
        getDocument: () =>
          documentForUi as unknown as ProductionSettingsDocument,
        getJQuery: () => getJQuery() as unknown as ProductionSettingsJQuery,
        getReadModel: capturedAdapter.readProductionSettingsReadModel,
        intents: { handle: (intent) => productionIntent.handle(intent) },
        buildSettingsSection: panelActions.buildSettingsSection,
        addSettingsNumber: panelActions.addSettingsNumber,
        addSettingsToggle: panelActions.addSettingsToggle,
        addSettingsSelect: panelActions.addSettingsSelect,
        addStandardHeading: panelActions.addStandardHeading,
        addTableToggle: panelActions.addTableToggle,
        addTableInput: panelActions.addTableInput,
        buildTableLabel: panelActions.buildTableLabel,
        getTableSorter: panelActions.getTableSorter,
      });
      productionIntent = createProductionSettingsIntentHandler({
        writer: {
          resetToDefaults: resetSection("production"),
          persist: persistSettings,
          reorderSmelterFuels: capturedAdapter.reorderSmelterFuels,
        },
        renderSettingsContent: () =>
          production?.updateProductionSettingsContent(),
        effects: {
          resetCheckboxes: () =>
            controls.resetCheckbox(
              "autoQuarry",
              "autoMine",
              "autoExtractor",
              "autoGraphenePlant",
              "autoSmelter",
              "autoCraft",
              "autoFactory",
              "autoMiningDroid",
              "autoReplicator",
            ),
          removeCraftToggles: () => craftToggles?.removeCraftToggles(),
        },
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
      evolution,
      planet,
      prestige,
      war,
      weighting,
      job,
      building,
      buildingToggles,
      project,
      arpaToggles,
      storage,
      storageToggles,
      market,
      marketToggles,
      ejector,
      ejectToggles,
      supplyToggles,
      magic,
      production,
      government,
      fleet,
      trait,
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
    settingsLifecycle.replaceAndInitialize(inspection.settings);
    refreshEffectiveSettings?.();
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
    ui.prestige.buildPrestigeSettings(
      dom("#script_settings") as unknown as Parameters<
        PrestigeSettings["buildPrestigeSettings"]
      >[0],
      "",
    );
    ui.evolution.buildEvolutionSettings();
    ui.planet.buildPlanetSettings();
    ui.hell.buildHellSettings(dom("#script_settings"), "");
    ui.war.buildWarSettings(
      dom("#script_settings") as unknown as Parameters<
        WarSettings["buildWarSettings"]
      >[0],
      "",
    );
    ui.weighting.buildWeightingSettings();
    if (capturedJobCatalogReader?.() !== undefined) {
      ui.job.buildJobSettings();
    }
    ui.building?.buildBuildingSettings();
    ui.project?.buildProjectSettings();
    ui.storage?.buildStorageSettings();
    ui.market?.buildMarketSettings();
    ui.ejector?.buildEjectorSettings();
    ui.magic?.buildMagicSettings();
    ui.production?.buildProductionSettings();
    ui.trait?.buildTraitSettings();
  };

  const removeScriptSettings = () => {
    getQuery()?.("#script_settings").remove();
  };

  /**
   * One inline toggle strip the automation container turns on and off. The adapter behind it is
   * built lazily with the rest of the settings UI, and a strip whose section is not available
   * names itself once rather than failing silently.
   */
  const inlineToggleStrip = <TAdapter>(
    name: string,
    select: (ui: SettingsUi) => TAdapter | undefined,
    create: (adapter: TAdapter) => void,
    remove: (adapter: TAdapter) => void,
  ) => {
    const run = (act: (adapter: TAdapter) => void) => () => {
      const dom = getQuery();
      const adapter =
        dom === undefined ? undefined : select(ensureSettingsUi(dom));
      if (adapter === undefined) {
        unported(name)();
        return;
      }
      act(adapter);
    };
    return { create: run(create), remove: run(remove) };
  };

  const arpaStrip = inlineToggleStrip(
    "ARPA toggles",
    (ui) => ui.arpaToggles,
    (adapter) => adapter.createArpaToggles(),
    (adapter) => adapter.removeArpaToggles(),
  );
  const marketStrip = inlineToggleStrip(
    "market toggles",
    (ui) => ui.marketToggles,
    (adapter) => adapter.createMarketToggles(),
    (adapter) => adapter.removeMarketToggles(),
  );
  const ejectStrip = inlineToggleStrip(
    "eject toggles",
    (ui) => ui.ejectToggles,
    (adapter) => adapter.createEjectToggles(),
    (adapter) => adapter.removeEjectToggles(),
  );
  const supplyStrip = inlineToggleStrip(
    "supply toggles",
    (ui) => ui.supplyToggles,
    (adapter) => adapter.createSupplyToggles(),
    (adapter) => adapter.removeSupplyToggles(),
  );
  const storageStrip = inlineToggleStrip(
    "storage toggles",
    (ui) => ui.storageToggles,
    (adapter) => adapter.createStorageToggles(),
    (adapter) => adapter.removeStorageToggles(),
  );
  const craftStrip = inlineToggleStrip(
    "craft toggles",
    (ui) => ui.craftToggles,
    (adapter) => adapter.createCraftToggles(),
    (adapter) => adapter.removeCraftToggles(),
  );
  const buildingStrip = inlineToggleStrip(
    "building toggles",
    (ui) => ui.buildingToggles,
    (adapter) => adapter.createBuildingToggles(),
    (adapter) => adapter.removeBuildingToggles(),
  );

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
      government: (node, prefix) => {
        const dom = getQuery();
        const adapter =
          dom === undefined ? undefined : ensureSettingsUi(dom).government;
        if (adapter === undefined) {
          unported("Government options")();
          return;
        }
        adapter.buildGovernmentSettings(
          node as unknown as Parameters<
            GovernmentSettingsBrowserActions["buildSettingsSection2"]
          >[0],
          prefix,
        );
      },
      war: (node, prefix) => {
        const dom = getQuery();
        const adapter =
          dom === undefined ? undefined : ensureSettingsUi(dom).war;
        if (adapter === undefined) {
          unported("Foreign Affairs options")();
          return;
        }
        adapter.buildWarSettings(
          node as unknown as Parameters<WarSettings["buildWarSettings"]>[0],
          prefix,
        );
      },
      hell: (node, prefix) => {
        const dom = getQuery();
        const adapter =
          dom === undefined ? undefined : ensureSettingsUi(dom).hell;
        if (adapter === undefined) {
          unported("Hell options")();
          return;
        }
        adapter.buildHellSettings(
          node as unknown as Parameters<HellSettings["buildHellSettings"]>[0],
          prefix,
        );
      },
      fleet: (node, prefix) => {
        const dom = getQuery();
        const adapter =
          dom === undefined ? undefined : ensureSettingsUi(dom).fleet;
        if (adapter === undefined) {
          unported("Fleet options")();
          return;
        }
        adapter.buildFleetSettings(
          node as unknown as Parameters<
            FleetSettingsBrowserAdapter["buildFleetSettings"]
          >[0],
          prefix,
        );
      },
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
      createCraftToggles: craftStrip.create,
      removeCraftToggles: craftStrip.remove,
      createBuildingToggles: buildingStrip.create,
      removeBuildingToggles: buildingStrip.remove,
      createArpaToggles: arpaStrip.create,
      removeArpaToggles: arpaStrip.remove,
      createStorageToggles: storageStrip.create,
      removeStorageToggles: storageStrip.remove,
      createMarketToggles: marketStrip.create,
      removeMarketToggles: marketStrip.remove,
      createEjectToggles: ejectStrip.create,
      removeEjectToggles: ejectStrip.remove,
      createSupplyToggles: supplyStrip.create,
      removeSupplyToggles: supplyStrip.remove,
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
        if (settings.readRaw()["autoStorage"] === true) {
          settingsUi?.storageToggles?.ensureStorageToggles();
        } else {
          settingsUi?.storageToggles?.removeStorageToggles();
        }
        if (settings.readRaw()["autoMarket"] === true) {
          settingsUi?.marketToggles?.ensureMarketToggles();
        } else {
          settingsUi?.marketToggles?.removeMarketToggles();
        }
        if (settings.readRaw()["autoEject"] === true) {
          settingsUi?.ejectToggles?.ensureEjectToggles();
        } else {
          settingsUi?.ejectToggles?.removeEjectToggles();
        }
        if (settings.readRaw()["autoSupply"] === true) {
          settingsUi?.supplyToggles?.ensureSupplyToggles();
        } else {
          settingsUi?.supplyToggles?.removeSupplyToggles();
        }
        optionsModal.createOptionsModal();
        // The four secondary-option buttons the game's own panels carry. Each is a second
        // rendering of a section the captured panel already owns, so they are added here rather
        // than in the compatibility UI refresh; `addOptionDefinition` is idempotent and skips a
        // panel the game has not drawn yet.
        optionsModal.updateOptionsUI();
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
