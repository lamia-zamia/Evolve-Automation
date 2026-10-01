import { createMechSupplyReservation } from "../application/mech-supply-reservation.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { createCapturedProgressionControl } from "./captured-progression-control.ts";
import { advancePeriodGate } from "../domain/tick.ts";
import { createStateLogRecorder } from "../application/state-log.ts";
import type { BuildResourceScope } from "../domain/progression/build/build.ts";
import { storageRequirementScopeKey } from "../domain/economy/storage/storage-requirements.ts";
import { readPeriodsPerScriptCycle } from "../adapters/evolve/captured-tick-rate.ts";
import { runCraftAutomation } from "../application/craft.ts";
import { runJobsAutomation } from "../application/jobs.ts";
import { createCapturedPrestigeControl } from "./captured-prestige-control.ts";
import { createCapturedGatherResourcesControl } from "./captured-gather-resources-control.ts";
import { createCapturedTaxControl } from "./captured-tax-control.ts";
import {
  createCapturedGovernmentAutomation,
  runCapturedGovernmentAutomation,
} from "../adapters/evolve/civic/captured-government.ts";
import { createCapturedHellAutomation } from "../adapters/evolve/combat/captured-hell.ts";
import {
  createCapturedGenetics,
  GENETICS_CONTROL,
} from "../adapters/evolve/traits/captured-genetics.ts";
import { GENETICS_BREAKDOWN_CONTROL } from "../adapters/evolve/traits/captured-trait-automation.ts";
import { runGeneticsAutomation } from "../application/genetics.ts";
import { createCapturedTraitControl } from "./captured-trait-control.ts";
import {
  HELL_GARRISON_CONTROLS,
  readCapturedHellGarrison,
} from "../adapters/evolve/combat/captured-hell-garrison.ts";
import {
  CAPTURED_MAD_CONTROL,
  isCapturedBuildingPrestigeType,
} from "../adapters/evolve/progression/prestige/captured-mad.ts";
import { createCapturedCraftsmenAutomation } from "../adapters/evolve/civic/captured-craftsmen.ts";
import {
  createCapturedFullJobsAutomation,
  createCapturedOrdinaryJobsAutomation,
} from "../adapters/evolve/civic/captured-ordinary-jobs.ts";
import {
  createCapturedPylonAutomation,
  PYLON_CONTROL,
} from "../adapters/evolve/economy/production/captured-pylon.ts";
import {
  ALCHEMY_CONTROL_PREFIX,
  createCapturedAlchemyAutomation,
} from "../adapters/evolve/economy/production/captured-alchemy.ts";
import {
  createCapturedMiningDroidAutomation,
  MINING_DROID_CONTROL,
} from "../adapters/evolve/economy/production/captured-mining-droid.ts";
import {
  createCapturedGrapheneAutomation,
  GRAPHENE_CONTROL,
} from "../adapters/evolve/economy/production/captured-graphene.ts";
import {
  createCapturedReplicatorAutomation,
  GOVERNOR_CONTROL,
  REPLICATOR_CONTROL,
} from "../adapters/evolve/economy/production/captured-replicator.ts";
import {
  createCapturedResourceDemand,
  hasCapturedProjectStorageDemand,
  EMPTY_DEMAND_SAMPLE,
  type CapturedDemandSample,
} from "../adapters/evolve/economy/resources/captured-resource-demand.ts";
import { ensureDemandPrerequisiteControls } from "../adapters/evolve/economy/resources/captured-demand-prerequisites.ts";
import type { DemandPrerequisiteReport } from "../adapters/evolve/economy/resources/captured-demand-prerequisites.ts";
import {
  createCapturedIdentitySource,
  createCapturedResourceSource,
} from "../adapters/evolve/captured-world-state.ts";
import { createCapturedStateLogReader } from "../adapters/evolve/captured-state-log.ts";
import { createStateLogStore } from "../adapters/storage/state-log-store.ts";
import { createPageFileDownload } from "../adapters/browser/file-download.ts";
import { createStateLogExportHook } from "../adapters/browser/state-log-export.ts";
import { createCapturedPlanningPanels } from "../adapters/browser/captured-planning-panels.ts";
import type {
  CapturedPlanningPanels,
  CapturedPlanningPanelsModel,
} from "../adapters/browser/captured-planning-panels.ts";
import { createPlannerStatsStore } from "../adapters/storage/planner-stats.ts";
import {
  createPlannerStatsLifecycle,
  recordPlannerReadoutSample,
} from "../application/planner-stats.ts";
import type { PlannerRun, PlannerStats } from "../domain/planner-analysis.ts";
import type { InterfaceSettingsState } from "../domain/interface-settings.ts";
import type {
  ConstructionReadoutSnapshot,
  SavingTarget,
} from "../ports/game-construction-observations.ts";
import { createCapturedFleetDemand } from "../adapters/evolve/combat/captured-fleet-demand.ts";
import { createCapturedFleetAutomation } from "../adapters/evolve/combat/captured-fleet.ts";
import { createCapturedOuterFleetControl } from "./captured-fleet-outer-control.ts";
import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import {
  createCapturedTriggers,
  triggersNeedDemandSample,
  triggersNeedGrantedTechs,
  type CapturedTriggerTarget,
} from "../adapters/evolve/progression/build/captured-triggers.ts";
import { createCapturedTriggerActions } from "../adapters/evolve/progression/build/captured-trigger-actions.ts";
import { createCapturedQueueReservationSource } from "../adapters/evolve/captured-queue-reservations.ts";
import {
  createCapturedProductionRatios,
  MINING_SHIP_CONTROL,
  QUARRY_CONTROL,
  TITAN_MINE_CONTROL,
} from "../adapters/evolve/economy/resources/captured-production-ratios.ts";
import { createPowerAutomation } from "../application/power.ts";
import { createCapturedPowerExecutor } from "../adapters/evolve/economy/production/captured-power-executor.ts";
import { createCapturedPowerReader } from "../adapters/evolve/economy/production/captured-power-reader.ts";
import { readCapturedSemanticBuildingStates } from "../adapters/evolve/progression/build/captured-building-availability.ts";
import { createDiscoveryAttempts } from "./discovery-attempts.ts";
import { createCapturedPowerWarnings } from "../adapters/evolve/economy/production/captured-power-warnings.ts";
import {
  EMPTY_POWER_AUTOMATION_STATE,
  planPowerCycle,
} from "../domain/economy/production/power.ts";
import { CONSUMPTION_BALANCE_MIN } from "../config.ts";
import {
  createCapturedSmelterAutomation,
  SMELTER_CONTROL,
} from "../adapters/evolve/economy/production/captured-smelter.ts";
import {
  createCapturedNaniteAutomation,
  NANITE_CONTROL,
} from "../adapters/evolve/economy/resources/captured-nanite.ts";
import {
  createCapturedEjectorAutomation,
  EJECTOR_SUMMARY_CONTROL,
} from "../adapters/evolve/economy/resources/captured-ejector.ts";
import {
  createCapturedSupplyAutomation,
  SUPPLY_SUMMARY_CONTROL,
} from "../adapters/evolve/economy/resources/captured-supply.ts";
import {
  createCapturedFactoryAutomation,
  FACTORY_CONTROL,
} from "../adapters/evolve/economy/production/captured-factory.ts";
import {
  createCapturedStoragePorts,
  STORAGE_CONSTRUCTION_CONTROL,
} from "../adapters/evolve/economy/storage/captured-storage.ts";
import {
  createCapturedGalaxyMarketPorts,
  GALAXY_MARKET_CONTROL,
} from "../adapters/evolve/economy/market/captured-galaxy-market.ts";
import {
  createCapturedMarketPorts,
  MARKET_QUANTITY_CONTROL,
} from "../adapters/evolve/economy/market/captured-market.ts";
import { createCapturedTradeRoutes } from "../adapters/evolve/economy/market/captured-trade-routes.ts";
import { runGalaxyMarketAutomation } from "../application/galaxy-market.ts";
import { runFleetAutomation } from "../application/fleet.ts";
import {
  runTriggerAutomation,
  triggerPhaseActive,
} from "../application/trigger.ts";
import { runMarketAutomation } from "../application/market.ts";
import { createCapturedMechInfoReader } from "../adapters/evolve/combat/captured-mech-info.ts";
import { CAPTURED_MECH_LIST_CONTROL } from "../adapters/evolve/combat/captured-mech-control-ids.ts";
import { createStorageAllocationAutomation } from "../application/storage-allocation.ts";
import { createCapturedCraftCosts } from "../adapters/evolve/economy/production/captured-craft-costs.ts";
import {
  createCapturedCraftExecutor,
  createCapturedCraftReader,
  type CraftingDocument,
} from "../adapters/evolve/economy/production/captured-crafting.ts";
import { createGameDrawnActionsReader } from "../adapters/browser/game-drawn-actions.ts";
import { createGameDrawnProjectsReader } from "../adapters/browser/game-drawn-projects.ts";
import { createGamePanelWorkspace } from "../adapters/browser/game-panel-workspace.ts";
import { createGameModalCloser } from "../adapters/browser/game-modal.ts";
import { createSettingsStore } from "../adapters/browser/settings-store.ts";
import { createCapturedSettingsDefaults } from "../adapters/evolve/captured-settings-defaults.ts";
import { createCapturedSettingsLifecycle } from "../application/captured-settings-lifecycle.ts";
import { createOverrideSettings } from "../application/override-settings.ts";
import {
  capturedOverridesNeedGrantedTechs,
  createCapturedOverrideEvaluation,
  readCapturedOverrideConditionRequirements,
} from "../adapters/evolve/captured-override-evaluation.ts";
import { createCapturedConditionContextReader } from "../adapters/evolve/captured-condition-context.ts";
import type { CapturedConditionContext } from "../adapters/evolve/captured-conditions.ts";
import { createCapturedQueuedSettings } from "../adapters/evolve/progression/evolution/captured-queued-settings.ts";
import { createCapturedEvolution } from "../adapters/evolve/progression/evolution/captured-evolution.ts";
import {
  createCapturedEvolutionResultCheck,
  createCapturedSoftResetControl,
} from "../adapters/evolve/progression/evolution/captured-evolution-result-check.ts";
import { createCapturedPlanetSelection } from "../adapters/evolve/progression/evolution/captured-planet-selection.ts";
import { createCapturedSettingsPanel } from "./captured-settings-panel-control.ts";
import { createPlanetMetadataReader } from "../adapters/browser/planet-metadata.ts";
import {
  createPlanetSelectionControls,
  createUniverseSelectionControls,
} from "../adapters/browser/progression-controls.ts";
import { runEvolution } from "../application/evolution.ts";
import { runCapturedPlanetSelection } from "../application/captured-planet-selection.ts";
import { runCapturedSpyTraining } from "../application/captured-spy-training.ts";
import { createCapturedEspionageRunner } from "../application/captured-espionage.ts";
import { runMercenaryAutomation } from "../application/mercenary.ts";
import { runBattleAutomation } from "../application/battle.ts";
import { challenges as evolutionChallengeCatalog } from "../adapters/evolve/runtime-catalogs.ts";
import { createCapturedSpyTraining } from "../adapters/evolve/combat/captured-spy-training.ts";
import { createCapturedEspionage } from "../adapters/evolve/combat/captured-espionage.ts";
import {
  CAPTURED_MERCENARY_CONTROLS,
  createCapturedMercenary,
} from "../adapters/evolve/combat/captured-mercenary.ts";
import { createCapturedBattle } from "../adapters/evolve/combat/battle.ts";
import {
  capturedMechControlRequirementEpoch,
  capturedMechControlsSatisfied,
  createCapturedMech,
} from "../adapters/evolve/combat/captured-mech.ts";
import { runCapturedMechAutomationWithActivity } from "../application/captured-mech.ts";
import { createBrowserRandomSource } from "../adapters/browser/random.ts";
import {
  createCapturedTabDiscovery,
  GOV_TABS_SETTING,
  GOV_TAB_INDEX,
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
  MARKET_TABS_SETTING,
  MARKET_TAB_INDEX,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SUB_TAB_CONTROLS,
} from "../adapters/evolve/captured-tab-discovery.ts";
import {
  CAPTURED_FOREIGN_PANEL_SELECTOR,
  capturedForeignEspionageTriggerSelector,
} from "../adapters/evolve/combat/captured-foreign-state.ts";
import type { PageCapture } from "../adapters/evolve/page-capture.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;
import { createGameKeyboardHandlers } from "../adapters/browser/game-keyboard-handlers.ts";
import { createGameCustomRaceLab } from "../adapters/browser/game-custom-race-lab.ts";
import { createGameTerraformLab } from "../adapters/browser/game-terraform-lab.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import type { GameActivitySink } from "../ports/game-message-log.ts";
import { isRecord, readProperty } from "../adapters/validation.ts";
import { overrideComparisons } from "../domain/override-comparators.ts";
import {
  CAPTURED_TRAIT_COMPANION_CONTROLS,
  createCapturedTraitCompanionControl,
} from "./captured-trait-companion-control.ts";

type WorkspaceDocument = ReturnType<
  Parameters<typeof createGamePanelWorkspace>[0]["getDocument"]
>;
type DrawnActionsDocument = ReturnType<
  Parameters<typeof createGameDrawnActionsReader>[0]["getDocument"]
>;
type DrawnProjectsDocument = ReturnType<
  Parameters<typeof createGameDrawnProjectsReader>[0]["getDocument"]
>;
type CapturedDocument = WorkspaceDocument &
  DrawnActionsDocument &
  DrawnProjectsDocument &
  CraftingDocument & {
    querySelector(selector: string): { click?(): void } | null;
  };

export interface CapturedRuntimeControlDependencies {
  readonly pageCapture: PageCapture;
  /** Browser adapter output; the feature readers narrow it at their own boundaries. */
  readonly document: unknown;
  /** The page's KeyboardEvent constructor, used only by the queue-capacity oracle. */
  readonly keyboardEvent: unknown;
  readonly mouseEvent: unknown;
  readonly storage: unknown;
  /** The page's global object. The settings panel reads `document`, `navigator` and `location`. */
  readonly settingsHostWindow: unknown;
  /** Userscript bridge for the single advertised page-global State Log export hook. */
  readonly exportToPage?: ((value: unknown) => unknown) | undefined;
  readonly diagnostics?: TickDiagnostics | undefined;
  /** User-visible activity emitted after a captured state transition. */
  readonly onActivity?: GameActivitySink;
  readonly log?: (message: string) => void;
  readonly logError?: (message: string) => void;
}

function isEnabled(settings: Record<string, unknown>, key: string): boolean {
  return settings[key] === true;
}

/** Starts the captured runtime from completed game periods, without a debug clone or game object. */
export function startCapturedRuntime({
  pageCapture,
  document: documentValue,
  keyboardEvent: keyboardEventValue,
  mouseEvent: mouseEventValue,
  storage,
  settingsHostWindow,
  exportToPage,
  diagnostics,
  onActivity = () => {},
  log = () => {},
  logError = () => {},
}: CapturedRuntimeControlDependencies): () => void {
  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
  ) {
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (isRecord(hooks)) {
      const buildings = readCapturedSemanticBuildingStates(
        pageCapture.rootState.readRoot(),
        pageCapture.controls,
        pageCapture.mechanics,
      );
      Reflect.set(
        hooks,
        "freshPowerBuildings",
        buildings?.map((building) => ({
          binding: building.catalog.binding,
          hasState: building.hasState,
          powered: building.powered,
          count: building.count,
          panelCaptured:
            pageCapture.controls.resolve(building.catalog.elementId) !==
            undefined,
        })),
      );
    }
  }
  const document = documentValue as CapturedDocument;
  const fileDownload = createPageFileDownload(
    settingsHostWindow,
    documentValue,
  );
  const customRaceLab = createGameCustomRaceLab({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    getDocument: () => document,
  });
  const terraformLab = createGameTerraformLab({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    getDocument: () => document,
  });
  const closeBioseedModal = createGameModalCloser({
    getDocument: () => document,
  });
  const keyboard =
    typeof keyboardEventValue === "function" &&
    typeof readProperty(document, "dispatchEvent") === "function"
      ? createGameKeyboardHandlers({
          getDocument: () => document,
          getKeyboardEvent: () =>
            keyboardEventValue as new (type: string, init: unknown) => unknown,
        })
      : undefined;
  const mouseEvent =
    typeof mouseEventValue === "function"
      ? (mouseEventValue as new (type: "mouseover" | "mouseout") => unknown)
      : class {
          constructor(_type: "mouseover" | "mouseout") {}
        };
  const panels = createGamePanelWorkspace({ getDocument: () => document });
  const settingsStorage = createSettingsStore({
    storage,
    logError: (message) => logError(message),
  });
  const settingsLifecycle = createCapturedSettingsLifecycle({
    settings: settingsStorage,
    defaults: createCapturedSettingsDefaults({
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    }),
  });
  settingsLifecycle.initialize();
  const readEffectiveInterfacePresentation =
    (): Readonly<InterfaceSettingsState> => {
      const settings = settingsLifecycle.readEffective();
      return Object.freeze({
        activeTargetsUI: settings["activeTargetsUI"] === true,
        buildPlannerUI: settings["buildPlannerUI"] === true,
      });
    };
  // The settings catalogs are read out of the game's root object, so a replacement can change
  // them without changing any count the lifecycle's own generation can see.
  // Advances once per automation cycle. Discovery retries are rate-limited against it so a draw
  // that keeps failing backs off instead of redrawing its tab on every phase call.
  let automationCycle = 0;
  const discoveryAttempts = createDiscoveryAttempts({
    readCycle: () => automationCycle,
  });
  const effectiveSettings = settingsLifecycle.readEffective();
  const capturedIdentity = createCapturedIdentitySource(pageCapture.rootState);
  const plannerStats = createPlannerStatsLifecycle(
    createPlannerStatsStore(storage),
  );
  let currentPlannerStats: Readonly<PlannerStats> | undefined;
  let latestConstructionSnapshot: Readonly<ConstructionReadoutSnapshot> | null =
    null;
  let currentStateLogConstructionSnapshot: Readonly<ConstructionReadoutSnapshot> | null =
    null;
  let stateLogPlannerDetailsDue = false;
  let latestConstructionRun: Readonly<PlannerRun> | undefined;
  let constructionFreshness: CapturedPlanningPanelsModel["freshness"] = "none";
  let planningPanels: CapturedPlanningPanels | undefined;
  let refreshCapturedPlanningPanels: () => void = () => {};
  const reportedPlanningUiErrors = new Set<string>();

  function reportPlanningUiError(error: unknown): void {
    const message = String(error);
    if (reportedPlanningUiErrors.has(message)) return;
    reportedPlanningUiErrors.add(message);
    try {
      logError(
        message.startsWith("captured planning UI:")
          ? message
          : `captured planning UI: ${message}`,
      );
    } catch {
      // UI diagnostics cannot stop an automation cycle.
    }
  }

  function readCapturedPlannerRun(): Readonly<PlannerRun> | undefined {
    try {
      const identity = capturedIdentity.readIdentity();
      if (
        identity === undefined ||
        !Number.isSafeInteger(identity.days) ||
        identity.days < 0 ||
        !Number.isSafeInteger(identity.resets) ||
        identity.resets < 0
      ) {
        return undefined;
      }
      return Object.freeze({ day: identity.days, reset: identity.resets });
    } catch {
      // A run identity is presentation metadata; its absence cannot affect automation.
      return undefined;
    }
  }

  function ensureCapturedPlannerStats(): Readonly<PlannerStats> | undefined {
    const run = readCapturedPlannerRun();
    if (run === undefined) return undefined;
    if (
      currentPlannerStats === undefined ||
      currentPlannerStats.reset !== run.reset ||
      currentPlannerStats.day > run.day
    ) {
      currentPlannerStats = plannerStats.load(run);
      plannerStats.save(currentPlannerStats);
    }
    return currentPlannerStats;
  }

  function resetCapturedPlannerStats(): void {
    try {
      const run = readCapturedPlannerRun();
      if (run === undefined) return;
      currentPlannerStats = plannerStats.make(run);
      plannerStats.save(currentPlannerStats);
      refreshCapturedPlanningPanels();
    } catch (error) {
      reportPlanningUiError(
        `planner statistics reset failed: ${String(error)}`,
      );
    }
  }

  function recordCapturedPlannerSample(
    snapshot: Readonly<ConstructionReadoutSnapshot>,
  ): void {
    try {
      if (snapshot.detailLevel !== "planner") return;
      const run = readCapturedPlannerRun();
      const current = ensureCapturedPlannerStats();
      if (run === undefined || current === undefined) return;
      const next = recordPlannerReadoutSample(
        plannerStats,
        current,
        snapshot,
        run.day,
      );
      if (next !== null) currentPlannerStats = next;
    } catch (error) {
      reportPlanningUiError(
        `planner statistics sample failed: ${String(error)}`,
      );
    }
  }
  const reportedOverrideFailures = new Set<string>();
  const readSafeMode = () => {
    const location = readProperty(settingsHostWindow, "location");
    return String(location ?? "")
      .toLowerCase()
      .includes("safemode");
  };
  let readOverrideConditionContext:
    | ((
        settings: Readonly<Record<string, unknown>>,
      ) => Readonly<CapturedConditionContext> | undefined)
    | undefined;
  const overrideSettings = createOverrideSettings({
    getSafeMode: readSafeMode,
    getSettings: () => effectiveSettings,
    getSettingsRaw: settingsLifecycle.readRaw,
    source: createCapturedOverrideEvaluation({
      rootState: pageCapture.rootState,
      readSettings: settingsLifecycle.readRaw,
      comparatorSource: {
        comparisons: overrideComparisons,
        rightOperandComparators: ["A?B", "!A?B"],
      },
      readConditionContext: (settings) =>
        readOverrideConditionContext?.(settings),
    }),
    reporter: {
      report: (failures) =>
        failures.forEach((failure) => {
          const message = `override ${failure.settingKey} #${failure.conditionNumber} unavailable: ${failure.reason.kind}`;
          if (reportedOverrideFailures.has(message)) return;
          reportedOverrideFailures.add(message);
          logError(message);
        }),
    },
    display: { publish: () => {} },
  });
  const refreshEffectiveSettings = () => {
    // A few discoveries can refresh settings while the composition is still being assembled.
    // Until the condition sampler exists, keep the stored layer visible and defer overrides to
    // the next refresh instead of reporting context-dependent operands as unavailable.
    if (readOverrideConditionContext === undefined) {
      overrideSettings.syncStoredSettings();
      return;
    }
    const raw = settingsLifecycle.readRaw();
    const overrides = raw.overrides;
    if (
      readSafeMode() ||
      (isRecord(overrides) && Object.keys(overrides).length > 0)
    ) {
      overrideSettings.updateOverrides();
    } else {
      overrideSettings.syncStoredSettings();
    }
  };
  const refreshDiscoveredSettings = () => {
    settingsLifecycle.ensureDynamicDefaults();
    refreshEffectiveSettings();
  };
  // Feature adapters retain their existing SettingsStore-shaped capability, but its read is now
  // the effective layer. The panel and queued-settings loader receive settingsStorage directly
  // so imports and edits always operate on the raw persisted record.
  const settingsStore = Object.freeze({
    readRaw: settingsLifecycle.readEffective,
    replaceRaw: settingsStorage.replaceRaw,
    persist: settingsStorage.persist,
  });
  const buildCosts = createCapturedActionCostReader({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
  });
  let ensureCapturedBuildingControls: () => void = () => {};
  const reportDiagnostic = (message: string) => {
    if (diagnostics?.readPerformanceEnabled() === true) log(message);
  };
  let ensureMechInfoLabActive: () => boolean = () => false;
  const mechInfoReader = createCapturedMechInfoReader({
    rootState: pageCapture.rootState,
    readSettings: () => settingsStore.readRaw(),
    keyState: pageCapture.keyState,
    ensureLabActive: () => ensureMechInfoLabActive(),
  });
  let runBulkSellFromPanel: () => void = () => {};
  const settingsPanel = createCapturedSettingsPanel({
    capturedPanelWindow: settingsHostWindow,
    fileDownload,
    settings: settingsStorage,
    settingsLifecycle,
    customRaceLab,
    refreshEffectiveSettings,
    readInterfacePresentationSettings: readEffectiveInterfacePresentation,
    interfaceEffects: {
      syncActiveTargetsUI: () => refreshCapturedPlanningPanels(),
      syncBuildPlannerUI: () => refreshCapturedPlanningPanels(),
    },
    craftToggles: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    },
    buildingSettings: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
      ensureControls: () => ensureCapturedBuildingControls(),
      costs: buildCosts,
    },
    projectSettings: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    },
    storageSettings: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    },
    marketSettings: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    },
    ejectorSettings: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    },
    magicSettings: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    },
    productionSettings: {
      rootState: pageCapture.rootState,
    },
    researchSettings: {
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    },
    fleetSettings: {
      controls: pageCapture.controls,
    },
    // Both are called only from a settings-panel event, long after the constructors below run.
    prestigeSettings: {
      setGoalStandard: () => {
        capturedPrestigeGoal = "Standard";
      },
    },
    evolutionSettings: {
      clearStoredTarget: () => capturedEvolution.clearStoredTarget(),
    },
    traitSettings: {
      rootState: pageCapture.rootState,
    },
    mechInfoReader,
    onBulkSell: () => runBulkSellFromPanel(),
    onDiagnostic: (message) => reportDiagnostic(message),
    logError: (message) => logError(message),
  });
  const queuedSettings = createCapturedQueuedSettings({
    settings: settingsStorage,
    refreshSettings: settingsPanel.refreshSettings,
    onWarning: (message) => logError(message),
  });
  const evolutionChallengeGroups = Object.freeze(
    evolutionChallengeCatalog.map((members) =>
      Object.freeze({ members: Object.freeze(members) }),
    ),
  );
  const drawnActions = createGameDrawnActionsReader({
    getDocument: () => document,
  });
  const capturedEvolution = createCapturedEvolution({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    drawnActions,
    readSettings: () => settingsStore.readRaw(),
    readEvolutionAttempts: queuedSettings.readEvolutionAttempts,
    loadQueuedSettings: queuedSettings.loadQueuedSettings,
    universeControls: createUniverseSelectionControls(() => document),
    challengeGroups: evolutionChallengeGroups,
    onActivity,
  });
  const capturedEvolutionResultCheck = createCapturedEvolutionResultCheck({
    reader: capturedEvolution.reader,
    softReset: createCapturedSoftResetControl(() => document),
    restoreEvolutionAfterResult: queuedSettings.restoreEvolutionAfterResult,
    onActivity,
  });
  const capturedPlanetSelection = createCapturedPlanetSelection({
    rootState: pageCapture.rootState,
    drawnActions,
    readSettings: () => settingsStore.readRaw(),
    controls: createPlanetSelectionControls(
      () => document,
      () => mouseEvent,
    ),
    metadata: createPlanetMetadataReader({
      getDocument: () => document,
      getMouseEventConstructor: () => mouseEvent,
    }),
  });
  const capturedSpyTraining = createCapturedSpyTraining({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readPurchaseMoney: () => readDemand().spyPurchaseReservation?.purchaseMoney,
  });
  let openCapturedForeignModal: (governmentId: number) => boolean = () => false;
  const capturedEspionage = createCapturedEspionage({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readPurchaseReservation: () => readDemand().spyPurchaseReservation,
    getDocument: () => document,
    ensureForeignModal: (governmentId) =>
      openCapturedForeignModal(governmentId),
    onActivity,
  });
  const runCapturedEspionageCycle =
    createCapturedEspionageRunner(capturedEspionage);
  const capturedBattle = createCapturedBattle({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    keyState: pageCapture.keyState,
    readSettings: () => settingsStore.readRaw(),
    onActivity,
  });
  // The captured runtime has no compatibility state object. This application-instance goal is
  // only the one-tick handoff used by the captured prestige planner and is discarded on reload.
  let capturedPrestigeGoal = "Standard";
  let capturedResetCommittedThisCycle = false;
  let capturedMechCycleHasPendingWork = false;
  const capturedMercenary = createCapturedMercenary({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readGoal: () => capturedPrestigeGoal,
    readMoneyRequested: () => readDemand().requestedQuantity("Money"),
    readMoneyStorageRequired: () => readDemand().storageRequired("Money"),
    keyState: pageCapture.keyState,
    onActivity,
  });
  const runCapturedEvolution = () =>
    runEvolution({
      reader: capturedEvolution.reader,
      executor: capturedEvolution.executor,
      runUniverseSelection: capturedEvolution.runUniverseSelection,
      runPlanetSelection: () => {
        const outcome = runCapturedPlanetSelection(capturedPlanetSelection);
        if (outcome.status !== "succeeded") {
          reportOnce(
            `autoEvolution: ${outcome.failure.code}: ${outcome.failure.message}`,
          );
        }
      },
      challengeGroups: evolutionChallengeGroups,
    });
  // The settings UI is useful even when document-start capture was missed (for example, when a
  // local bundle is loaded after the game). Automation still fails closed below until capture is
  // complete, but configuration should not disappear with it.
  settingsPanel.ensurePanel();
  const reported = new Set<string>();
  const reportOnce = (message: string) => {
    if (reported.has(message)) return;
    reported.add(message);
    logError(message);
  };
  /**
   * One feature's phase of the cycle. A throw inside it is reported once and skips that feature for
   * this cycle; every phase after it still runs, because a control that has gone missing in one
   * feature says nothing about the others. Before this boundary existed a single `try` covered the
   * whole cycle, so one unavailable control cost every later feature silently — measured at zero
   * build-queue cost probes over 600 periods while the market phase threw each cycle.
   *
   * Returns the phase value, or undefined when the phase throws, for the two places where a later
   * phase depends on it.
   */
  const runPhase = <T>(name: string, body: () => T): T | undefined => {
    try {
      return body();
    } catch (error) {
      reportOnce(`${name} stopped: ${String(error)}`);
      return undefined;
    }
  };
  // The demand sample both reads the construction cycle's observations and answers its storage
  // question, so one of the two has to be late-bound. This one is, with a real empty sample until
  // the cycle exists, rather than a mutable object either side could hold a stale reference to.
  let readDemand: () => CapturedDemandSample = () => EMPTY_DEMAND_SAMPLE;
  // Overrides may need the prerequisite report before the period gate; the cycle then keeps and
  // reuses it for its demand consumers. Reset it with the cycle's other samples.
  let demandPrerequisitesThisCycle: DemandPrerequisiteReport | undefined;
  const readDemandPrerequisites = () => demandPrerequisitesThisCycle;
  const mechSupplyReservation = createMechSupplyReservation();
  const progression = createCapturedProgressionControl({
    readMechPowerSupplyHold: mechSupplyReservation.readPowerSupplyHold,
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    mountSuppression: pageCapture.mountSuppression,
    panels,
    ...(keyboard === undefined ? {} : { keyboard }),
    keyState: pageCapture.keyState,
    drawnActions: createGameDrawnActionsReader({
      getDocument: () => document,
    }),
    drawnProjects: createGameDrawnProjectsReader({
      getDocument: () => document,
      createMouseEvent: (type) => new mouseEvent(type),
    }),
    costs: buildCosts,
    readSettings: () => settingsStore.readRaw(),
    readInterfacePresentationSettings: readEffectiveInterfacePresentation,
    readStateLogPlannerDetailsDue: () => stateLogPlannerDetailsDue,
    readReservedQuantityForMechPriority: (resourceId) =>
      readDemand().requestedQuantityForMechPriority(resourceId),
    // The already-granted half of the research draw is only worth its cost to a configured
    // trigger or override, so those stored conditions decide whether the pass keeps it.
    needGrantedTechs: () => {
      const settings = settingsStore.readRaw();
      return (
        triggersNeedGrantedTechs(settings) ||
        capturedOverridesNeedGrantedTechs(settings)
      );
    },
    readCapturedStorageRequired: (_resourceIds, resourceScopes = []) => {
      const sample = readDemand();
      const scopes: readonly BuildResourceScope[] =
        resourceScopes.length > 0
          ? resourceScopes
          : _resourceIds.map((resourceId) => ({ resourceId }));
      return Object.freeze(
        Object.fromEntries(
          scopes.map((scope) => [
            storageRequirementScopeKey(scope.resourceId, scope.pool),
            sample.storageRequired(scope.resourceId, scope.pool),
          ]),
        ),
      );
    },
    // Reported once per distinct reason: a candidate the cycle cannot price or a catalog it cannot
    // read is otherwise dropped in silence, which is how a composition gap survives a whole session.
    onSkipped: (key, reason) =>
      reportOnce(`progression skipped ${key}: ${reason}`),
    onUnavailable: (reason) => reportOnce(`progression unavailable: ${reason}`),
    nowMs: () => Date.now(),
    diagnostics,
    onDiagnostic: reportDiagnostic,
    onActivity,
  });
  let savingTargetThisCycle: SavingTarget | null | undefined;
  let constructionRunning = false;
  let constructionSuppressedThisCycle = false;
  const cycleConstructionObservations = Object.freeze({
    ...progression.observations,
    readSavingTarget(): SavingTarget | null {
      const settings = settingsStore.readRaw();
      if (settings["autoBuild"] !== true && settings["autoARPA"] !== true)
        return null;
      // A trigger owns this cycle's construction budget even though it deliberately skips the
      // construction planner. Later Factory/Jobs demand samples still run, with no stale target
      // carried forward from a previous cycle.
      if (constructionSuppressedThisCycle) return null;
      if (
        constructionRunning &&
        !progression.observations.hasCompletedOrdering()
      )
        return null;
      if (savingTargetThisCycle === undefined) {
        savingTargetThisCycle = progression.observations.readSavingTarget();
      }
      return savingTargetThisCycle;
    },
  });
  const readCapturedMechReservation = (resourceId: string): number => {
    const demandSample = readDemand();
    // Re-evaluate Mech-first with the priority budget: the normal sample still contains the
    // construction saving target that this priority is meant to preempt.
    const priorityDemand = progression.mechDemand.read({
      supply: demandSample.requestedQuantityForMechPriority("Supply"),
      soulGems: demandSample.requestedQuantityForMechPriority("Soul_Gem"),
    });
    return (
      priorityDemand.buildingMechsFirst &&
        priorityDemand.immediatePlan.status === "ready"
        ? demandSample.requestedQuantityForMechPriority
        : demandSample.requestedQuantityExcludingMech
    )(resourceId);
  };
  const capturedMech = createCapturedMech({
    readPowerSupplyHold: mechSupplyReservation.readPowerSupplyHold,
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    keyState: pageCapture.keyState,
    readCanExpandBay: progression.readCanExpandMechBay,
    readReservedQuantityExcludingMech: readCapturedMechReservation,
  });
  const capturedMechRandom = createBrowserRandomSource();
  ensureCapturedBuildingControls = progression.ensureBuildControls;
  const gatherResources = createCapturedGatherResourcesControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const tax = createCapturedTaxControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    nowMs: () => Date.now(),
  });
  const government = createCapturedGovernmentAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const hell = createCapturedHellAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const genetics = createCapturedGenetics({
    rootState: pageCapture.rootState,
    keyState: pageCapture.keyState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const traits = createCapturedTraitControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    keyState: pageCapture.keyState,
    getDocument: () => document,
    readSettings: () => settingsStore.readRaw(),
  });
  const traitCompanions = createCapturedTraitCompanionControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    getDocument: () => document,
    readSettings: () => settingsStore.readRaw(),
    ensureShapeshiftControls: () => ensureShapeshiftControls(),
    ensurePsychicControls: () => ensurePsychicControls(),
    ensureOcularPowerControls: () => ensureOcularPowerControls(),
    ensureWishControls: (tier, wishId) => ensureWishControls(tier, wishId),
  });
  const costs = createCapturedCraftCosts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
  });
  const craftsmen = createCapturedCraftsmenAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
  });
  const ordinaryJobs = createCapturedOrdinaryJobsAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    onSkipped: (key, reason) => reportOnce(`jobs skipped ${key}: ${reason}`),
  });
  const fullJobs = createCapturedFullJobsAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    onSkipped: (key, reason) => reportOnce(`jobs skipped ${key}: ${reason}`),
    costs,
    readDemand: () => readDemand(),
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
  });
  const pylon = createCapturedPylonAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const alchemy = createCapturedAlchemyAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const miningDroid = createCapturedMiningDroidAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
  });
  const graphene = createCapturedGrapheneAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
  });
  const replicator = createCapturedReplicatorAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  // Demand is shared within a mutation phase; construction and Factory invalidate it below.
  // The research offer snapshot is already captured by progression; sharing it here keeps queue
  // reservations and demand on one catalog without buying another discovery pass.
  const queueReservations = createCapturedQueueReservationSource({
    rootState: pageCapture.rootState,
    readOfferedTechs: progression.readOfferedTechs,
    costs: createCapturedActionCostReader({
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
    }),
  });
  // The rendered shipyard cost is read-only, so one fleet demand reader serves both demand
  // plans below instead of each drawing the panel's cost markup twice.
  const fleetDemand = createCapturedFleetDemand({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    getDocument: () => document,
  });
  const ensureDemandResearchObservation = () => {
    progression.sampleOfferedTechs();
  };
  // The trigger conditions read what something else is accumulating, which needs the demand
  // commitments without the trigger targets. Sampling the cycle's own demand from a condition
  // would recurse through the trigger sampling it pulls in, so this second plan simply leaves
  // the triggers out; everything else reads the same inputs at the same moment.
  const triggerDemand = createCapturedResourceDemand({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs: buildCosts,
    construction: cycleConstructionObservations,
    readOfferedTechs: progression.readOfferedTechs,
    reservations: queueReservations,
    readSettings: () => settingsStore.readRaw(),
    mechDemand: progression.mechDemand,
    readPrerequisites: readDemandPrerequisites,
    craftCosts: costs,
    fleet: fleetDemand,
  });
  let triggerDemandThisCycle: CapturedDemandSample | undefined;
  const readTriggerDemand = () => {
    if (triggerDemandThisCycle === undefined) {
      ensureDemandResearchObservation();
      triggerDemandThisCycle = triggerDemand.sample();
    }
    return triggerDemandThisCycle;
  };
  const conditionContextReader = createCapturedConditionContextReader({
    costs: buildCosts,
    readOfferedTechs: progression.sampleOfferedTechs,
    readGrantedTechs: progression.readGrantedTechs,
    readProjects: progression.readProjects,
    readBuildingUnlocks: progression.readBuildingUnlocks,
    readBuildingCapacity: progression.readBuildingCapacity,
    readDemandSample: () =>
      triggersNeedDemandSample(settingsStore.readRaw())
        ? readTriggerDemand()
        : undefined,
    readTechKnowledge: progression.readKnowledgeRequiredByTechs,
    readHellGarrison: () => {
      ensureHellGarrisonControls();
      return readCapturedHellGarrison(
        pageCapture.rootState,
        pageCapture.controls,
      );
    },
  });
  readOverrideConditionContext = (settings) =>
    conditionContextReader.read(
      readCapturedOverrideConditionRequirements(settings),
      settings,
      {
        readDemandSample: () => {
          demandPrerequisitesThisCycle = ensureDemandPrerequisiteControls({
            root: pageCapture.rootState.readRoot(),
            settings: settingsStore.readRaw(),
            controls: pageCapture.controls,
            ensureCivicControls,
            ensureBuildControls: progression.ensureBuildControls,
          });
          return readTriggerDemand();
        },
      },
    ).context;
  const triggers = createCapturedTriggers({
    readHellGarrison: () => {
      ensureHellGarrisonControls();
      return readCapturedHellGarrison(
        pageCapture.rootState,
        pageCapture.controls,
      );
    },
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs: buildCosts,
    readSettings: () => settingsStore.readRaw(),
    readOfferedTechs: progression.sampleOfferedTechs,
    readGrantedTechs: progression.readGrantedTechs,
    readOfferedProjects: progression.readProjects,
    readBuildingUnlocks: progression.readBuildingUnlocks,
    readBuildingCapacity: progression.readBuildingCapacity,
    // The demand-reading conditions need the commitments without the trigger targets; the
    // cycle's own sample includes them, and the conditions are evaluated inside the sampling
    // it pulls in. Sampled lazily and only for a configured condition, like the granted-techs
    // pass, so other runs never pay for the second demand plan.
    readDemandSample: () =>
      triggersNeedDemandSample(settingsStore.readRaw())
        ? readTriggerDemand()
        : undefined,
    readTechKnowledge: progression.readKnowledgeRequiredByTechs,
  });
  // One trigger sample per cycle, shared by the demand model and the trigger phase: what the
  // script saves for and what it clicks must be the same list.
  let triggerTargetsThisCycle:
    readonly Readonly<CapturedTriggerTarget>[] | undefined;
  const readTriggerTargets = () =>
    (triggerTargetsThisCycle ??= triggers.read());
  planningPanels = createCapturedPlanningPanels({
    getDocument: () => document as unknown as Document,
    readSettings: settingsLifecycle.readRaw,
    onResetPlannerStats: resetCapturedPlannerStats,
    onCollapsedChange: (collapsed) => {
      settingsLifecycle.readRaw()["buildPlannerCollapsed"] = collapsed;
      settingsStorage.persist();
      refreshEffectiveSettings();
      refreshCapturedPlanningPanels();
    },
    onError: reportPlanningUiError,
  });
  refreshCapturedPlanningPanels = () => {
    try {
      const rawSettings = settingsLifecycle.readRaw();
      const presentation = readEffectiveInterfacePresentation();
      const activeTargetsEnabled = presentation.activeTargetsUI;
      const plannerEnabled = presentation.buildPlannerUI;
      const currentRun =
        latestConstructionSnapshot !== null &&
        (activeTargetsEnabled || plannerEnabled)
          ? readCapturedPlannerRun()
          : undefined;
      if (
        latestConstructionSnapshot !== null &&
        latestConstructionRun !== undefined &&
        currentRun !== undefined &&
        (latestConstructionRun.reset !== currentRun.reset ||
          latestConstructionRun.day > currentRun.day)
      ) {
        latestConstructionSnapshot = null;
        latestConstructionRun = undefined;
        constructionFreshness = "none";
      }
      planningPanels?.syncActiveTargetsUI(activeTargetsEnabled);
      planningPanels?.syncBuildPlannerUI(plannerEnabled);
      if (!activeTargetsEnabled && !plannerEnabled) return;
      const triggers =
        activeTargetsEnabled || plannerEnabled
          ? triggerTargetsThisCycle?.map((target) =>
              Object.freeze({
                id: target.actionId,
                kind: target.actionType,
                ...(target.actionType === "arpa"
                  ? { projectId: target.projectId }
                  : {}),
              }),
            )
          : undefined;
      planningPanels?.update(
        Object.freeze({
          construction: latestConstructionSnapshot,
          freshness:
            latestConstructionSnapshot === null
              ? "none"
              : constructionFreshness,
          queues: activeTargetsEnabled ? queueReservations.read() : undefined,
          triggers,
          stats: plannerEnabled ? ensureCapturedPlannerStats() : undefined,
          collapsed: rawSettings["buildPlannerCollapsed"] === true,
        }),
      );
    } catch (error) {
      reportPlanningUiError(error);
    }
  };
  const invalidateCapturedCyclePlanning = () => {
    latestConstructionSnapshot = null;
    latestConstructionRun = undefined;
    currentStateLogConstructionSnapshot = null;
    constructionFreshness = "none";
    triggerTargetsThisCycle = undefined;
    triggerDemandThisCycle = undefined;
    demandThisCycle = undefined;
    demandPrerequisitesThisCycle = undefined;
  };
  pageCapture.rootState.subscribeRootReplaced(() => {
    mechSupplyReservation.reset();
    savingTargetThisCycle = undefined;
    settingsLifecycle.invalidateDynamicDefaults();
    // Attempts and readouts belong to the replaced root, even when its day/reset are unchanged.
    discoveryAttempts.invalidate();
    latestConstructionSnapshot = null;
    latestConstructionRun = undefined;
    constructionFreshness = "none";
    triggerTargetsThisCycle = undefined;
    // Planner statistics stay keyed to the captured day/reset identity; this event also fires
    // when the game restores reactivity around the same raw run.
    refreshCapturedPlanningPanels();
  });
  const triggerActions = createCapturedTriggerActions({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    resources: createCapturedResourceSource(pageCapture.rootState),
    readTargets: readTriggerTargets,
    readSettings: () => settingsStore.readRaw(),
    readOfferedTechs: progression.readOfferedTechs,
    readOfferedProjects: progression.readProjects,
  });
  const demand = createCapturedResourceDemand({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs: buildCosts,
    triggers: Object.freeze({
      read: () => triggerTargetsThisCycle ?? Object.freeze([]),
    }),
    construction: cycleConstructionObservations,
    readOfferedTechs: progression.readOfferedTechs,
    readBuildTargets: () => {
      const settings = settingsStore.readRaw();
      return isEnabled(settings, "autoBuild") ||
        isEnabled(settings, "autoStorage")
        ? progression.readEstablishedStorageBuildTargets()
        : Object.freeze([]);
    },
    readProjects: progression.readEstablishedProjects,
    reservations: queueReservations,
    readSettings: () => settingsLifecycle.materializeEffective(),
    mechDemand: progression.mechDemand,
    readPrerequisites: readDemandPrerequisites,
    craftCosts: costs,
    fleet: fleetDemand,
  });
  let demandThisCycle: CapturedDemandSample | undefined;
  readDemand = () => {
    if (demandThisCycle === undefined) {
      ensureDemandResearchObservation();
      demandThisCycle = demand.sample();
    }
    return demandThisCycle;
  };
  const storagePorts = createCapturedStoragePorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readStorageRequired: (resourceId, pool) =>
      readDemand().storageRequired(resourceId, pool),
    reservations: queueReservations,
    readSavingTarget: () => readDemand().savingTarget,
    readBuildTargets: progression.readUnlockedStorageBuildTargets,
    readOfferedTechs: progression.readOfferedTechs,
    readProjects: progression.readProjects,
    costs: buildCosts,
    onSkipped: (key, reason) => reportOnce(`storage skipped ${key}: ${reason}`),
    nowMs: () => Date.now(),
  });
  const storageAutomation = createStorageAllocationAutomation({
    ...storagePorts,
    diagnostics,
  });
  const galaxyMarketPorts = createCapturedGalaxyMarketPorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const galaxyMarketAutomation = Object.freeze({
    run: () =>
      runGalaxyMarketAutomation({
        reader: galaxyMarketPorts.reader,
        executor: galaxyMarketPorts.executor,
      }),
  });
  const marketPorts = createCapturedMarketPorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    onUnavailable: (resourceId, reason) =>
      reportOnce(`market skipped ${resourceId}: ${reason}`),
  });
  const tradeRoutes = createCapturedTradeRoutes({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    onUnavailable: (reason) =>
      reportOnce(`trade routes unavailable: ${reason}`),
  });
  const marketAutomation = Object.freeze({
    run: (bulkSell = false, ignoreSellRatio = false) =>
      runMarketAutomation(
        {
          reader: marketPorts.reader,
          executor: marketPorts.executor,
          tradeRoutes,
          diagnostics,
        },
        bulkSell,
        ignoreSellRatio,
      ),
  });
  const ratios = createCapturedProductionRatios({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const craftDependencies = {
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs,
    getDocument: () => document,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  };
  const craft = Object.freeze({
    reader: createCapturedCraftReader(craftDependencies),
    executor: createCapturedCraftExecutor(craftDependencies),
  });
  const civicDiscovery = createCapturedTabDiscovery({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    mountSuppression: pageCapture.mountSuppression,
    panels,
    diagnostics,
  });
  /**
   * The one place a captured feature spends a tab draw. Callers check their own eligibility first
   * and pass `satisfied`: the authoritative answer to "does this feature now hold the control it
   * came for". A draw that reports success while leaving that control absent is a failure here, so
   * the feature stays eligible for a later cycle instead of latching itself off for the session.
   *
   * `epoch` names a feature-owned identity — a progression reset — that starts the attempts over.
   */
  const finishDiscovery = (
    key: string,
    label: string,
    satisfied: (() => boolean) | undefined,
    epoch: string | undefined,
    steps: Parameters<typeof civicDiscovery.discover>[0],
  ): boolean => {
    if (!discoveryAttempts.shouldAttempt(key, epoch)) return false;
    // A draw that throws is a failed attempt like any other. Without this the exception would
    // escape before anything was recorded, and the phase runner's catch would leave the feature
    // redrawing its tab on every cycle forever.
    let result;
    try {
      result = civicDiscovery.discover(steps);
    } catch (error) {
      discoveryAttempts.recordFailure(key, epoch);
      logError(
        `${label} discovery threw: ${String(error)} (${discoveryAttempts.describe(key, epoch)})`,
      );
      return false;
    }
    if (result.outcome.status !== "succeeded") {
      discoveryAttempts.recordFailure(key, epoch);
      logError(
        `${label} discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status} (${discoveryAttempts.describe(key, epoch)})`,
      );
      return false;
    }
    if (satisfied !== undefined && !satisfied()) {
      discoveryAttempts.recordFailure(key, epoch);
      logError(
        `${label} discovery drew its tab without capturing its control (${discoveryAttempts.describe(key, epoch)})`,
      );
      return false;
    }
    discoveryAttempts.recordSuccess(key, epoch);
    return true;
  };
  /**
   * Draws the civics military sub-tab, where `index.js` calls `buildFortress($('#fortress'),false)`
   * and captures `gFort`. The same draw runs `defineGarrison()`, so a later slice that needs the
   * `garrison` controls reuses this helper instead of adding a second military-tab discovery.
   *
   * Eligibility comes before the attempt, like the other conditional discoveries: the fortress is
   * built mid-run, so a pre-fortress cycle must not spend a draw on a panel that cannot exist yet.
   */
  const ensureHellGarrisonControls = () => {
    const satisfied = () =>
      HELL_GARRISON_CONTROLS.some((id) =>
        pageCapture.controls.resolve(id)?.methods.includes("patrolling"),
      );
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    if (
      !isRecord(readProperty(readProperty(root, "portal"), "fortress")) ||
      readProperty(readProperty(root, "race"), "warlord")
    ) {
      return;
    }
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    finishDiscovery("hell-garrison", "Hell garrison", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.military,
      }),
    ]);
  };
  const ensureCivicControls = () => {
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    if (
      !finishDiscovery("civic-controls", "civic", undefined, undefined, [
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civic,
        }),
      ])
    ) {
      return;
    }
    refreshDiscoveredSettings();
    settingsPanel.refreshSettings();
  };
  const ensureOuterFleetControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve("shipPlans")?.methods.includes("build") ===
      true;
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const tech = readProperty(root, "tech");
    const settings = readProperty(root, "settings");
    const shipyard = readProperty(readProperty(root, "space"), "shipyard");
    const syndicate = readProperty(tech, "syndicate");
    if (
      !isRecord(shipyard) ||
      !(typeof syndicate === "number" && syndicate > 0) ||
      readProperty(settings, "showShipYard") !== true
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery("outer-fleet", "outer fleet", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.dwarfShipYard,
      }),
    ]);
  };
  const ensureMercenaryControls = () => {
    const satisfied = () =>
      CAPTURED_MERCENARY_CONTROLS.some((id) =>
        pageCapture.controls.resolve(id)?.methods.includes("hire"),
      );
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const garrison = readProperty(readProperty(root, "civic"), "garrison");
    if (!isRecord(garrison) || garrison["mercs"] !== true) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery("mercenary", "Mercenary", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.military,
      }),
    ]);
  };
  openCapturedForeignModal = (governmentId) => {
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (
      govTabs === undefined ||
      pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined
    ) {
      return false;
    }
    let clicked = false;
    const result = civicDiscovery.discover(
      [
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civic,
        }),
        Object.freeze({
          setting: GOV_TABS_SETTING,
          control: govTabs,
          index: GOV_TAB_INDEX.civic,
        }),
      ],
      {
        mount: [CAPTURED_FOREIGN_PANEL_SELECTOR],
        whileDrawn: () => {
          const trigger = document.querySelector(
            capturedForeignEspionageTriggerSelector(governmentId),
          );
          if (trigger === null || typeof trigger.click !== "function") {
            throw new Error(
              "the game-owned espionage modal trigger is not mounted",
            );
          }
          const click = trigger.click;
          pageCapture.mountSuppression.withMountingEnabled(() => {
            click.call(trigger);
          });
          clicked = true;
        },
      },
    );
    if (result.outcome.status !== "succeeded") {
      logError(
        `foreign espionage modal discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
    }
    return result.outcome.status === "succeeded" && clicked;
  };
  const ensureMechControls = () => {
    const satisfied = () =>
      capturedMechControlsSatisfied(
        pageCapture.controls,
        settingsStore.readRaw(),
      );
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const portal = readProperty(root, "portal");
    const mechbay = readProperty(portal, "mechbay");
    const gameSettings = readProperty(root, "settings");
    const race = readProperty(root, "race");
    if (
      !isRecord(mechbay) ||
      readProperty(gameSettings, "showMechLab") !== true ||
      readProperty(race, "species") === "protoplasm" ||
      readProperty(race, "start_cataclysm") === true
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery(
      "mech",
      "mech",
      satisfied,
      capturedMechControlRequirementEpoch(settingsStore.readRaw()),
      [
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civic,
        }),
        Object.freeze({
          setting: GOV_TABS_SETTING,
          control: govTabs,
          index: GOV_TAB_INDEX.mechLab,
        }),
      ],
    );
  };
  ensureMechInfoLabActive = () => {
    ensureMechControls();
    return (
      pageCapture.controls.resolve(CAPTURED_MECH_LIST_CONTROL) !== undefined
    );
  };
  /**
   * Draws the civics military sub-tab, where `defineGarrison()` also binds the game's `#mad`
   * control. The display flag is written by the game's `tech.mad` action, so it is the gate for
   * spending a military discovery pass before the prestige route exists. Its attempts are scoped
   * to the progression epoch: a reset rebuilds the page's controls and makes the draw useful again.
   */
  const ensureMadControls = () => {
    const satisfied = () =>
      pageCapture.controls
        .resolve(CAPTURED_MAD_CONTROL)
        ?.methods.includes("arm") === true &&
      pageCapture.controls
        .resolve(CAPTURED_MAD_CONTROL)
        ?.methods.includes("launch") === true;
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const mad = readProperty(readProperty(root, "civic"), "mad");
    if (!isRecord(mad) || readProperty(mad, "display") !== true) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    const progressionEpoch = progression.readProgressionEpoch();
    finishDiscovery("mad", "MAD", satisfied, progressionEpoch, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.military,
      }),
    ]);
  };
  const stateLogRecorder = createStateLogRecorder({
    store: createStateLogStore(storage),
    reader: createCapturedStateLogReader({
      identity: capturedIdentity,
      resources: createCapturedResourceSource(pageCapture.rootState),
      readConstruction: () => currentStateLogConstructionSnapshot,
    }),
    ...(fileDownload === undefined ? {} : { download: fileDownload }),
  });
  const removeStateLogExport = createStateLogExportHook({
    pageWindow: settingsHostWindow,
    exportToPage,
    download: fileDownload,
  }).install(() => stateLogRecorder.readCurrent());
  const prestige = createCapturedPrestigeControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    customRaceLab,
    terraformLab,
    readSettings: () => settingsStore.readRaw(),
    readGoal: () => capturedPrestigeGoal,
    readMechCycleActivity: () => capturedMechCycleHasPendingWork,
    setGoal: (goal) => {
      capturedPrestigeGoal = goal;
    },
    readOfferedTechs: progression.readOfferedTechs,
    resources: createCapturedResourceSource(pageCapture.rootState),
    onResetCommitted: (endingReset, endingDay) => {
      capturedResetCommittedThisCycle = true;
      invalidateCapturedCyclePlanning();
      stateLogRecorder.prestigeCommitted(
        settingsStore.readRaw(),
        endingReset,
        endingDay,
      );
    },
    readBuildingResetActions: (regions) =>
      progression.readBuildingUnlocks(new Set(regions))?.unlocked,
    closeBioseedModal,
    loadQueuedSettings: queuedSettings.loadQueuedSettings,
  });
  /**
   * Draws the A.R.P.A. tab, where `loadTab` calls `arpa('Genetics')` in the same pass that draws the
   * project panel, and `genetics()` binds `#arpaSequence` plus the Genetics 2.0 `#geneticBreakdown`.
   * Both of its own gates are checked first:
   * `genetics()` returns before drawing anything unless `settings.arpa.genetics` is set, and the
   * sequencer panel itself exists only above `tech.genetics` 1.
   */
  const ensureGeneticsControls = () => {
    const root = pageCapture.rootState.readRoot();
    const level = readProperty(readProperty(root, "tech"), "genetics");
    const satisfied = () =>
      pageCapture.controls.resolve(GENETICS_CONTROL) !== undefined &&
      (typeof level !== "number" ||
        level <= 2 ||
        pageCapture.controls.resolve(GENETICS_BREAKDOWN_CONTROL) !== undefined);
    if (satisfied()) return;
    const panelOffered = readProperty(
      readProperty(readProperty(root, "settings"), "arpa"),
      "genetics",
    );
    if (
      typeof level !== "number" ||
      !Number.isFinite(level) ||
      level < 2 ||
      panelOffered !== true
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    finishDiscovery("genetics", "genetics", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.arpa,
      }),
    ]);
  };
  const ensureShapeshiftControls = () => {
    const satisfied = () =>
      pageCapture.controls
        .resolve(CAPTURED_TRAIT_COMPANION_CONTROLS.shapeshift)
        ?.methods.includes("setShape") === true;
    if (satisfied()) return true;
    const root = pageCapture.rootState.readRoot();
    const arpaSettings = readProperty(readProperty(root, "settings"), "arpa");
    if (readProperty(arpaSettings, "genetics") !== true) return false;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined)
      return false;
    return finishDiscovery(
      "shapeshift-controls",
      "shapeshift",
      satisfied,
      undefined,
      [
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.arpa,
        }),
      ],
    );
  };
  const ensurePsychicControls = () => {
    const satisfied = () =>
      pageCapture.controls
        .resolve(CAPTURED_TRAIT_COMPANION_CONTROLS.psychic.boost)
        ?.methods.includes("boostVal") === true;
    if (satisfied()) return true;
    const root = pageCapture.rootState.readRoot();
    const technologyLevel = readProperty(readProperty(root, "tech"), "psychic");
    if (
      !readProperty(readProperty(root, "race"), "psychic") ||
      typeof technologyLevel !== "number" ||
      technologyLevel <= 0
    ) {
      return false;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined)
      return false;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return false;
    return finishDiscovery(
      "psychic-controls",
      "psychic powers",
      satisfied,
      undefined,
      [
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civic,
        }),
        Object.freeze({
          setting: GOV_TABS_SETTING,
          control: govTabs,
          index: GOV_TAB_INDEX.psychicPowers,
        }),
      ],
    );
  };
  const ensureOcularPowerControls = () => {
    const satisfied = () =>
      pageCapture.controls
        .resolve(CAPTURED_TRAIT_COMPANION_CONTROLS.ocularPower)
        ?.methods.includes("pow") === true;
    if (satisfied()) return true;
    const root = pageCapture.rootState.readRoot();
    const race = readProperty(root, "race");
    if (
      !readProperty(race, "ocular_power") ||
      !readProperty(race, "ocularPowerConfig")
    ) {
      return false;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined)
      return false;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return false;
    return finishDiscovery(
      "supernatural-controls",
      "supernatural powers",
      satisfied,
      undefined,
      [
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civic,
        }),
        Object.freeze({
          setting: GOV_TABS_SETTING,
          control: govTabs,
          index: GOV_TAB_INDEX.supernatural,
        }),
      ],
    );
  };
  const ensureWishControls = (tier: "minor" | "major", _wishId: string) => {
    const controlId =
      tier === "minor"
        ? CAPTURED_TRAIT_COMPANION_CONTROLS.wish.minor
        : CAPTURED_TRAIT_COMPANION_CONTROLS.wish.major;
    const satisfied = () =>
      pageCapture.controls.resolve(controlId) !== undefined;
    if (satisfied()) return true;
    const root = pageCapture.rootState.readRoot();
    const race = readProperty(root, "race");
    const technologyLevel = readProperty(readProperty(root, "tech"), "wish");
    if (
      !readProperty(race, "wish") ||
      !readProperty(race, "wishStats") ||
      typeof technologyLevel !== "number" ||
      technologyLevel <= 0 ||
      (tier === "major" && technologyLevel < 2)
    ) {
      return false;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined)
      return false;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return false;
    return finishDiscovery(
      "supernatural-controls",
      "supernatural powers",
      satisfied,
      undefined,
      [
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civic,
        }),
        Object.freeze({
          setting: GOV_TABS_SETTING,
          control: govTabs,
          index: GOV_TAB_INDEX.supernatural,
        }),
      ],
    );
  };
  const ensureGalaxyFleetControls = () => {
    const satisfied = () => pageCapture.controls.resolve("fleet") !== undefined;
    if (satisfied()) return;
    // `galaxySpace()` returns before `armada(parent,'fleet')` unless the game is showing the
    // galactic tab, so without this gate the draw can only ever produce an empty panel.
    if (
      readProperty(
        readProperty(pageCapture.rootState.readRoot(), "settings"),
        "showGalactic",
      ) !== true
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const spaceTabs = SUB_TAB_CONTROLS[SPACE_TABS_SETTING];
    if (spaceTabs === undefined) return;
    finishDiscovery("galaxy-fleet", "galaxy fleet", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civilization,
      }),
      Object.freeze({
        setting: SPACE_TABS_SETTING,
        control: spaceTabs,
        index: SPACE_TAB_INDEX.galaxy,
      }),
    ]);
  };
  const ensurePylonControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(PYLON_CONTROL) !== undefined;
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const tech = readProperty(root, "tech");
    const magic = readProperty(tech, "magic");
    if (typeof magic !== "number" || !Number.isFinite(magic) || magic < 3) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) {
      return;
    }
    finishDiscovery("pylon", "pylon", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civilization,
      }),
    ]);
  };
  const ensureAlchemyControls = () => {
    const satisfied = () =>
      pageCapture.controls
        .capturedElementIds()
        .some((id) => id.startsWith(ALCHEMY_CONTROL_PREFIX));
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const tech = readProperty(root, "tech");
    const techLevel = readProperty(tech, "alchemy");
    if (
      typeof techLevel !== "number" ||
      !Number.isFinite(techLevel) ||
      techLevel < 1
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    finishDiscovery("alchemy", "alchemy", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.alchemy,
      }),
    ]);
  };
  const ensureMiningDroidControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(MINING_DROID_CONTROL) !== undefined;
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const interstellar = readProperty(root, "interstellar");
    const droids = readProperty(interstellar, "mining_droid");
    const count = readProperty(droids, "count");
    if (typeof count !== "number" || !Number.isFinite(count) || count < 1) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery("mining-droid", "mining-droid", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
  };
  const ensureGrapheneControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(GRAPHENE_CONTROL) !== undefined;
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const race = readProperty(root, "race");
    const interstellar = readProperty(root, "interstellar");
    const plant = readProperty(interstellar, "g_factory");
    const count = readProperty(plant, "count");
    if (
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count < 1 ||
      Boolean(readProperty(race, "truepath")) ||
      Boolean(readProperty(race, "warlord"))
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery("graphene", "graphene", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
  };

  const ensureReplicatorControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(REPLICATOR_CONTROL) !== undefined &&
      pageCapture.controls.resolve(GOVERNOR_CONTROL) !== undefined;
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const race = readProperty(root, "race");
    const tech = readProperty(root, "tech");
    const techLevel = readProperty(tech, "replicator");
    if (
      !isRecord(readProperty(race, "replicator")) ||
      typeof techLevel !== "number" ||
      !Number.isFinite(techLevel) ||
      techLevel < 1
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery("replicator", "replicator", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
  };

  const ensureSmelterControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(SMELTER_CONTROL) !== undefined;
    if (satisfied()) return;
    const city = readProperty(pageCapture.rootState.readRoot(), "city");
    const smelterState = readProperty(city, "smelter");
    const race = readProperty(pageCapture.rootState.readRoot(), "race");
    const count = readProperty(smelterState, "count");
    const exempt =
      Boolean(readProperty(race, "cataclysm")) ||
      Boolean(readProperty(race, "orbit_decayed")) ||
      Boolean(
        readProperty(
          readProperty(pageCapture.rootState.readRoot(), "tech"),
          "isolation",
        ),
      ) ||
      Boolean(readProperty(race, "warlord"));
    if (
      (typeof count !== "number" || !Number.isFinite(count) || count < 1) &&
      !exempt
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery("smelter", "smelter", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
  };

  const ensureNaniteControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(NANITE_CONTROL) !== undefined;
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const race = readProperty(root, "race");
    const naniteFactory = readProperty(
      readProperty(root, "city"),
      "nanite_factory",
    );
    if (!readProperty(race, "deconstructor") || !isRecord(naniteFactory)) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery("nanite", "nanite", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
  };

  const ensureEjectorControls = () => {
    const satisfied = () =>
      pageCapture.controls
        .capturedElementIds()
        .some((id) => id.startsWith("eject") && id !== EJECTOR_SUMMARY_CONTROL);
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const ejector = readProperty(
      readProperty(root, "interstellar"),
      "mass_ejector",
    );
    const count = readProperty(ejector, "count");
    if (
      !isRecord(ejector) ||
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count < 1
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    finishDiscovery("ejector", "ejector", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.ejector,
      }),
    ]);
  };

  const ensureSupplyControls = () => {
    const satisfied = () =>
      pageCapture.controls
        .capturedElementIds()
        .some((id) => id.startsWith("supply") && id !== SUPPLY_SUMMARY_CONTROL);
    if (satisfied()) return;
    const transport = readProperty(
      readProperty(pageCapture.rootState.readRoot(), "portal"),
      "transport",
    );
    const count = readProperty(transport, "count");
    if (
      !isRecord(transport) ||
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count < 1
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    finishDiscovery("supply", "supply", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.supply,
      }),
    ]);
  };

  const ensureStorageControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(STORAGE_CONSTRUCTION_CONTROL) !== undefined;
    if (satisfied()) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    if (
      readProperty(
        readProperty(pageCapture.rootState.readRoot(), "settings"),
        "showStorage",
      ) !== true
    ) {
      return;
    }
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    finishDiscovery("storage", "storage", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.storage,
      }),
    ]);
  };

  const ensureGalaxyMarketControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(GALAXY_MARKET_CONTROL) !== undefined;
    if (satisfied()) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const root = pageCapture.rootState.readRoot();
    if (!isRecord(readProperty(readProperty(root, "galaxy"), "trade"))) {
      return;
    }
    if (readProperty(readProperty(root, "settings"), "showMarket") !== true) {
      return;
    }
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    finishDiscovery("galaxy-market", "galaxy market", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.market,
      }),
    ]);
  };

  const ensureMarketControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(MARKET_QUANTITY_CONTROL) !== undefined;
    if (satisfied()) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const root = pageCapture.rootState.readRoot();
    if (readProperty(readProperty(root, "settings"), "showMarket") !== true) {
      return;
    }
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    finishDiscovery("market", "market", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.resources,
      }),
      Object.freeze({
        setting: MARKET_TABS_SETTING,
        control: marketTabs,
        index: MARKET_TAB_INDEX.market,
      }),
    ]);
  };

  runBulkSellFromPanel = () => {
    try {
      ensureMarketControls();
      refreshDiscoveredSettings();
      const outcome = marketAutomation.run(true, true);
      if (outcome.status !== "succeeded") {
        try {
          logError(
            `Bulk Sell failed: ${outcome.failure?.message ?? outcome.status}`,
          );
        } catch {
          // Reporting a failed manual action cannot throw back through the page event.
        }
      }
    } catch (error) {
      try {
        logError(`Bulk Sell failed: ${String(error)}`);
      } catch {
        // Reporting a failed manual action cannot throw back through the page event.
      }
    }
  };

  const ensureFactoryControls = () => {
    const satisfied = () =>
      pageCapture.controls.resolve(FACTORY_CONTROL) !== undefined;
    if (satisfied()) return;
    const city = readProperty(pageCapture.rootState.readRoot(), "city");
    const factoryState = readProperty(city, "factory");
    const count = readProperty(factoryState, "count");
    if (typeof count !== "number" || !Number.isFinite(count) || count < 1) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery("factory", "factory", satisfied, undefined, [
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.industry,
      }),
    ]);
  };

  /** The three ratio sliders share the industry panel the droid and graphene plants render into. */
  const ensureRatioControls = (control: string, unlocked: boolean) => {
    const satisfied = () => pageCapture.controls.resolve(control) !== undefined;
    if (
      !unlocked ||
      satisfied() ||
      pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined
    ) {
      return;
    }
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return;
    finishDiscovery(
      "production-ratio",
      "production-ratio",
      satisfied,
      undefined,
      [
        Object.freeze({
          setting: MAIN_TAB_SETTING,
          control: MAIN_TAB_CONTROL,
          index: MAIN_TAB_INDEX.civic,
        }),
        Object.freeze({
          setting: GOV_TABS_SETTING,
          control: govTabs,
          index: GOV_TAB_INDEX.industry,
        }),
      ],
    );
  };
  const structureCount = (region: string, id: string): number => {
    const value = readProperty(
      readProperty(readProperty(pageCapture.rootState.readRoot(), region), id),
      "count",
    );
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const powerWarnings = createCapturedPowerWarnings({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    mechanics: pageCapture.mechanics,
    getDocument: () => document,
    readSettings: settingsLifecycle.readEffective,
  });
  const smelter = createCapturedSmelterAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const nanite = createCapturedNaniteAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const ejector = createCapturedEjectorAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const supply = createCapturedSupplyAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const factory = createCapturedFactoryAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
  });
  const fleet = createCapturedFleetAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: () => readDemand(),
  });
  const capturedPowerExecution = createCapturedPowerExecutor({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    mechanics: pageCapture.mechanics,
    readMechSaveSupply: mechSupplyReservation.readSaveSupply,
    setMechSaveSupply: mechSupplyReservation.setSaveSupply,
    log: (message) =>
      onActivity({ message, color: "has-text-info", tags: ["automation"] }),
  });
  const powerReader = createCapturedPowerReader({
    rootState: pageCapture.rootState,
    mechanics: pageCapture.mechanics,
    controls: pageCapture.controls,
    resources: createCapturedResourceSource(pageCapture.rootState),
    readDemand: () => demandThisCycle,
    readFleetNeededShips: fleet.readNeededShips,
    costs: buildCosts,
    readCurrentDate: () => new Date(),
    readPurifierDescription: () =>
      capturedPowerExecution.readDescription("portal-purifier"),
    readMechSaveSupply: mechSupplyReservation.readSaveSupply,
    readMechState: () => capturedMech.reader.readState(),
    readSettingsRaw: settingsLifecycle.readEffective,
    readRuntimeOptions: () => ({
      settings: {
        showGalactic: false,
        limitPowered: false,
        autoFleet: false,
        crewReserve: 0,
      },
      debug: powerWarnings.readDebugEnabled(),
      consumptionBalanceMinimum: CONSUMPTION_BALANCE_MIN,
    }),
    readWarnings: powerWarnings.readWarnings,
  });
  const powerAutomation = createPowerAutomation({
    reader: powerReader,
    executor: capturedPowerExecution.executor,
    warnings: powerWarnings,
    diagnostics,
  });
  const observePowerDemandPhase = (
    stage: string,
    outcome?: CommandExecutionOutcome,
  ) => {
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
    ) {
      const observer = readProperty(
        readProperty(settingsHostWindow, "__EA_TEST_HOOKS__"),
        "observePowerDemandPhase",
      );
      if (typeof observer === "function")
        observer(stage, demandThisCycle, outcome);
    }
  };
  // The live characterization bundle opts into this inert hook by defining both the build
  // constant and the hook bag before main.ts starts. Production builds fold this block away.
  // Keep it after the captured demand, build-cost, and fleet capabilities so the test cycle uses
  // the same owners as the runtime composition rather than synthetic empty inputs.
  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
  ) {
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (isRecord(hooks)) {
      Reflect.set(hooks, "runPowerAutomation", () => powerAutomation.run());
      Reflect.set(hooks, "readPowerAutomationState", () =>
        powerAutomation.readState(),
      );
      Reflect.set(hooks, "samplePowerDemand", () => {
        demandThisCycle = demand.sample();
      });
      Reflect.set(hooks, "readPowerCycle", () => {
        const cycle = powerReader.readCycle();
        return cycle === undefined
          ? undefined
          : Object.freeze({
              cycle,
              plan: planPowerCycle(cycle, EMPTY_POWER_AUTOMATION_STATE),
            });
      });
      Reflect.set(
        hooks,
        "planPowerCycle",
        (cycle: Parameters<typeof planPowerCycle>[0]) =>
          planPowerCycle(cycle, EMPTY_POWER_AUTOMATION_STATE),
      );
    }
  }
  const outerFleet = createCapturedOuterFleetControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    getDocument: () => document,
    readSettings: () => settingsStore.readRaw(),
    onActivity,
  });

  // The settings panel prepares the raw layer before this composition has an override context.
  // Resolve it after all condition readers and their lazy control helpers are ready, before the
  // first planning-panel reconciliation or period callback.
  refreshEffectiveSettings();
  refreshCapturedPlanningPanels();

  const runCycle = () => {
    automationCycle += 1;
    capturedResetCommittedThisCycle = false;
    currentStateLogConstructionSnapshot = null;
    stateLogPlannerDetailsDue = false;
    constructionFreshness =
      latestConstructionSnapshot === null ? "none" : "stale";
    capturedMechCycleHasPendingWork = false;
    demandThisCycle = undefined;
    savingTargetThisCycle = undefined;
    constructionSuppressedThisCycle = false;
    triggerTargetsThisCycle = undefined;
    triggerDemandThisCycle = undefined;
    demandPrerequisitesThisCycle = undefined;
    // Drawn before the master-toggle guard below, and before any automation runs: a fresh profile
    // carries no settings at all, so a script that only drew its interface while already enabled
    // could never be switched on.
    settingsPanel.ensurePanel();
    if (!pageCapture.isComplete()) {
      refreshCapturedPlanningPanels();
      return;
    }
    refreshDiscoveredSettings();
    const settings = settingsStore.readRaw();
    if (
      !pageCapture.isComplete() ||
      !isEnabled(settings, "masterScriptToggle")
    ) {
      refreshCapturedPlanningPanels();
      return;
    }
    stateLogPlannerDetailsDue = stateLogRecorder.isNextSampleDue(settings);
    // The captured runtime is its own tick loop, so it owns the `tick` phase and the flush the
    // diagnostics adapter counts work ticks against. Without them `window.eaPerformance` records
    // samples on the production path and never emits a single summary.
    const profiling =
      diagnostics?.readPerformanceEnabled() === true ? diagnostics : undefined;
    const workStartedAtMs = profiling?.nowMs();
    try {
      progression.beginProcessedCycle();
      // Evolution is a separate game phase: while the root still carries the protoplasm species,
      // do only its controls, matching the tick runner's Evolution-goal short circuit. A landed
      // evolution page can therefore progress without spending resources on ordinary automation.
      if (isEnabled(settings, "autoEvolution")) {
        const species = capturedEvolution.reader.sampleSpecies();
        capturedEvolutionResultCheck.observeSpecies(species);
        if (capturedEvolutionResultCheck.check().stopCycle) return;
        if (species === "protoplasm") {
          runPhase("autoEvolution", runCapturedEvolution);
          return;
        }
      }
      // Two demand reservations need controls that are otherwise discovered later in the
      // cycle: the spy-purchase reserve needs the `foreign` panel control and the True Path AI
      // target needs the civilization build controls. The cycle caches its demand sample on
      // first use, so this runs before any consumer (triggers, market, storage) can sample,
      // and the report it writes is what the samples fail closed on when a capture is missing.
      runPhase("demand prerequisites", () => {
        demandPrerequisitesThisCycle ??= ensureDemandPrerequisiteControls({
          root: pageCapture.rootState.readRoot(),
          settings,
          controls: pageCapture.controls,
          ensureCivicControls,
          ensureBuildControls: progression.ensureBuildControls,
        });
      });
      // Build/Storage own the Building offers used by shared demand. Establish them before
      // any consumer samples; later refreshes only read this catalog and current live costs.
      if (
        isEnabled(settings, "autoBuild") ||
        isEnabled(settings, "autoStorage")
      ) {
        runPhase("construction demand discovery", () => {
          progression.readUnlockedStorageBuildTargets();
          refreshDiscoveredSettings();
        });
      }
      if (
        hasCapturedProjectStorageDemand(settings, settingsStorage.readRaw()) &&
        (isEnabled(settings, "autoBuild") ||
          isEnabled(settings, "autoARPA") ||
          isEnabled(settings, "autoStorage"))
      ) {
        runPhase("project demand discovery", () => {
          progression.readProjects();
          refreshDiscoveredSettings();
        });
      }
      if (isEnabled(settings, "autoTrigger")) {
        runPhase("autoTrigger discovery", () => {
          // Trigger targets are only the actions whose controls were captured, so the sample the
          // demand model shares has to be taken after construction discovery, not before it.
          progression.ensureBuildControls();
          refreshDiscoveredSettings();
          readTriggerTargets();
        });
      }
      if (isEnabled(settings, "autoFleet")) {
        runPhase("autoFleet discovery", () => {
          const truepath =
            readProperty(
              readProperty(pageCapture.rootState.readRoot(), "race"),
              "truepath",
            ) === true;
          if (truepath) ensureOuterFleetControls();
          else ensureGalaxyFleetControls();
        });
      }
      const gatherEnabled =
        isEnabled(settings, "autoBuild") ||
        isEnabled(settings, "buildingAlwaysClick");
      if (gatherEnabled) {
        const needsConstructionSaving =
          isEnabled(settings, "autoBuild") || isEnabled(settings, "autoARPA");
        const savingOrderReady =
          progression.observations.hasCompletedOrdering();
        if (needsConstructionSaving && !savingOrderReady) {
          runPhase("buildingAlwaysClick", () => gatherResources());
        } else {
          const demandReady = runPhase("pre-Gather demand", () => {
            readDemand();
            return true;
          });
          if (demandReady === true) {
            runPhase("buildingAlwaysClick", () => gatherResources());
          }
        }
      }
      if (isEnabled(settings, "autoMarket")) {
        runPhase("autoMarket", () => {
          ensureMarketControls();
          refreshDiscoveredSettings();
          marketAutomation.run();
        });
      }
      if (isEnabled(settings, "autoGalaxyMarket")) {
        runPhase("autoGalaxyMarket", () => {
          ensureGalaxyMarketControls();
          refreshDiscoveredSettings();
          galaxyMarketAutomation.run();
        });
      }
      if (isEnabled(settings, "autoStorage")) {
        runPhase("autoStorage", () => {
          ensureStorageControls();
          refreshDiscoveredSettings();
          storageAutomation.run();
        });
      }
      if (isEnabled(settings, "autoHell")) {
        runPhase("autoHell", () => {
          ensureCivicControls();
          hell.run();
        });
      }
      if (isEnabled(settings, "autoMiningDroid")) {
        runPhase("autoMiningDroid", () => {
          ensureMiningDroidControls();
          miningDroid.run();
        });
      }
      if (isEnabled(settings, "autoGraphenePlant")) {
        runPhase("autoGraphenePlant", () => {
          ensureGrapheneControls();
          graphene.run();
        });
      }
      if (isEnabled(settings, "autoReplicator")) {
        runPhase("autoReplicator", () => {
          ensureReplicatorControls();
          replicator.run();
        });
      }
      if (isEnabled(settings, "autoQuarry")) {
        runPhase("autoQuarry", () => {
          ensureRatioControls(
            QUARRY_CONTROL,
            Boolean(
              readProperty(
                readProperty(pageCapture.rootState.readRoot(), "race"),
                "smoldering",
              ),
            ) && structureCount("city", "rock_quarry") >= 1,
          );
          ratios.quarry();
        });
      }
      if (isEnabled(settings, "autoMine")) {
        runPhase("autoMine", () => {
          ensureRatioControls(
            TITAN_MINE_CONTROL,
            structureCount("space", "titan_mine") >= 1,
          );
          ratios.titanMine();
        });
      }
      if (isEnabled(settings, "autoExtractor")) {
        runPhase("autoExtractor", () => {
          ensureRatioControls(
            MINING_SHIP_CONTROL,
            structureCount("tauceti", "mining_ship") >= 1,
          );
          ratios.miningShip();
        });
      }
      if (isEnabled(settings, "autoAlchemy")) {
        runPhase("autoAlchemy", () => {
          ensureAlchemyControls();
          refreshDiscoveredSettings();
          alchemy.run();
        });
      }
      if (isEnabled(settings, "autoPylon")) {
        runPhase("autoPylon", () => {
          ensurePylonControls();
          refreshDiscoveredSettings();
          pylon.run();
        });
      }
      // Trigger gates Research and Build, then Factory finishes before Jobs samples the root.
      // An active trigger suppresses only Research and Build for this cycle.
      let triggerActive = false;
      if (isEnabled(settings, "autoTrigger")) {
        const completed = runPhase("autoTrigger", () => {
          triggerActive = triggerPhaseActive(
            runTriggerAutomation({
              reader: triggerActions.reader,
              executor: triggerActions.executor,
            }),
          );
          return true;
        });
        // A trigger phase that threw may already have pressed something, and cannot say what the
        // rest of the list was saving for. Construction and research stand down rather than spend
        // it — which is what the whole-cycle `try` did for this case, and the only part of that
        // behavior worth keeping.
        if (completed !== true) triggerActive = true;
      }
      if (
        triggerActive &&
        (isEnabled(settings, "autoBuild") || isEnabled(settings, "autoARPA"))
      ) {
        constructionSuppressedThisCycle = true;
      }
      if (!triggerActive && isEnabled(settings, "autoResearch")) {
        runPhase("autoResearch", () => progression.runResearchCycle());
        observePowerDemandPhase("research-complete");
        // The earlier demand discovery cannot answer offers unlocked by this research.
        // Construction owns the next discovery and must sample the new tech state.
        progression.resetBuildingUnlockSample();
        if (
          isEnabled(settings, "autoBuild") ||
          isEnabled(settings, "autoStorage")
        ) {
          runPhase("post-research construction demand discovery", () => {
            progression.readUnlockedStorageBuildTargets();
            refreshDiscoveredSettings();
          });
        }
      }
      if (
        !triggerActive &&
        (isEnabled(settings, "autoBuild") || isEnabled(settings, "autoARPA"))
      ) {
        const outcome = runPhase("autoBuild", () => {
          constructionRunning = true;
          try {
            return progression.runConstructionCycle();
          } finally {
            constructionRunning = false;
          }
        });
        if (outcome !== undefined && outcome.status !== "succeeded") {
          reportOnce(
            `autoBuild: ${outcome.failure.code}: ${outcome.failure.message}`,
          );
        }
        if (outcome?.status === "succeeded") {
          try {
            if (stateLogPlannerDetailsDue) {
              currentStateLogConstructionSnapshot =
                progression.observations.readStateLogSnapshot();
            }
            const snapshot = progression.observations.readPlannerSnapshot();
            if (snapshot !== null) {
              const presentation = readEffectiveInterfacePresentation();
              if (
                (presentation.activeTargetsUI || presentation.buildPlannerUI) &&
                (latestConstructionSnapshot === null ||
                  snapshot.cycleId > latestConstructionSnapshot.cycleId)
              ) {
                latestConstructionSnapshot = snapshot;
                latestConstructionRun = readCapturedPlannerRun();
                constructionFreshness = "fresh";
                if (presentation.buildPlannerUI) {
                  recordCapturedPlannerSample(snapshot);
                }
              }
            }
          } catch (error) {
            reportPlanningUiError(
              `planner observation failed: ${String(error)}`,
            );
          }
        }
      }
      // Construction and Factory change holdings, commitments, and saving intent. Each
      // invalidation ends the old sample's lifetime, including when an enabled phase is a no-op.
      observePowerDemandPhase("construction-complete");
      demandThisCycle = undefined;
      savingTargetThisCycle = undefined;
      observePowerDemandPhase("construction-invalidated");
      if (isEnabled(settings, "autoFactory")) {
        runPhase("autoFactory", () => {
          ensureFactoryControls();
          refreshDiscoveredSettings();
          factory.run();
        });
      }
      demandThisCycle = undefined;
      savingTargetThisCycle = undefined;
      observePowerDemandPhase("factory-invalidated");
      const autoJobs = isEnabled(settings, "autoJobs");
      const autoCraftsmen = isEnabled(settings, "autoCraftsmen");
      let combinedJobs = false;
      if (autoJobs && autoCraftsmen) {
        const completed = runPhase("autoJobs with autoCraftsmen", () => {
          ensureCivicControls();
          refreshDiscoveredSettings();
          combinedJobs = fullJobs.isAvailable();
          if (combinedJobs) runJobsAutomation(fullJobs, false);
        });
        // The combined path owns this settings combination even when the sampled command fails;
        // split passes must not make a second decision in the same cycle.
        if (!completed) combinedJobs = true;
      }
      if (autoJobs && !combinedJobs) {
        runPhase("autoJobs", () => {
          ensureCivicControls();
          refreshDiscoveredSettings();
          runJobsAutomation(ordinaryJobs, false);
        });
      }
      if (autoCraftsmen && !combinedJobs) {
        runPhase("autoCraftsmen", () => {
          ensureCivicControls();
          runJobsAutomation(craftsmen, true);
        });
      }
      if (isEnabled(settings, "autoCraft")) {
        runPhase("autoCraft", () => {
          runCraftAutomation(craft);
        });
      }
      if (isEnabled(settings, "autoFight")) {
        const mercenaryOutcome = runPhase("autoFight.mercenary", () => {
          ensureMercenaryControls();
          return runMercenaryAutomation(capturedMercenary);
        });
        if (
          mercenaryOutcome !== undefined &&
          mercenaryOutcome.status !== "succeeded"
        ) {
          reportOnce(
            `autoFight.mercenary: ${mercenaryOutcome.failure.code}: ${mercenaryOutcome.failure.message}`,
          );
        }
        const outcome = runPhase("autoFight.spy", () => {
          ensureCivicControls();
          return runCapturedSpyTraining(capturedSpyTraining);
        });
        if (outcome !== undefined && outcome.status !== "succeeded") {
          reportOnce(
            `autoFight.spy: ${outcome.failure.code}: ${outcome.failure.message}`,
          );
        }
        const espionageOutcome = runPhase("autoFight.espionage", () => {
          ensureCivicControls();
          return runCapturedEspionageCycle();
        });
        if (
          espionageOutcome !== undefined &&
          espionageOutcome.status !== "succeeded" &&
          ![
            "captured-espionage-modal-pending",
            "captured-espionage-postcondition-pending",
            "captured-espionage-modal-conflict",
          ].includes(espionageOutcome.failure.code)
        ) {
          reportOnce(
            `autoFight.espionage: ${espionageOutcome.failure.code}: ${espionageOutcome.failure.message}`,
          );
        }
        if (
          espionageOutcome?.status === "succeeded" &&
          !capturedEspionage.isBusy()
        ) {
          const battleOutcome = runPhase("autoFight.battle", () => {
            ensureCivicControls();
            if (isEnabled(settings, "autoHell")) ensureHellGarrisonControls();
            return runBattleAutomation(capturedBattle);
          });
          if (
            battleOutcome !== undefined &&
            battleOutcome.status !== "succeeded"
          ) {
            reportOnce(
              `autoFight.battle: ${battleOutcome.failure.code}: ${battleOutcome.failure.message}`,
            );
          }
        }
      }
      // Tax and government intentionally observe the completed combat pass, matching runTick's
      // autoMerc → autoSpy → autoBattle → autoTax → autoGovernment tail where those controls exist.
      if (isEnabled(settings, "autoTax")) {
        runPhase("autoTax", () => {
          ensureCivicControls();
          tax.autoTax();
        });
      }
      if (isEnabled(settings, "autoGovernment")) {
        runPhase("autoGovernment", () => {
          ensureCivicControls();
          runCapturedGovernmentAutomation(government);
        });
      }
      if (isEnabled(settings, "autoMech")) {
        runPhase("autoMech", () => {
          ensureMechControls();
          const result = runCapturedMechAutomationWithActivity({
            ...capturedMech,
            random: capturedMechRandom,
          });
          capturedMechCycleHasPendingWork = result.hasPendingWork;
          const outcome = result.outcome;
          if (outcome.status !== "succeeded") {
            reportOnce(
              `autoMech: ${outcome.failure.code}: ${outcome.failure.message}`,
            );
          }
        });
      }
      if (isEnabled(settings, "autoNanite")) {
        runPhase("autoNanite", () => {
          ensureNaniteControls();
          refreshDiscoveredSettings();
          nanite.run();
        });
      }
      if (isEnabled(settings, "autoSupply")) {
        runPhase("autoSupply", () => {
          ensureSupplyControls();
          refreshDiscoveredSettings();
          supply.run();
        });
      }
      if (isEnabled(settings, "autoEject")) {
        runPhase("autoEject", () => {
          ensureEjectorControls();
          refreshDiscoveredSettings();
          ejector.run();
        });
      }
      if (isEnabled(settings, "autoSmelter")) {
        runPhase("autoSmelter", () => {
          ensureSmelterControls();
          refreshDiscoveredSettings();
          smelter.run();
        });
      }
      if (isEnabled(settings, "autoFleet")) {
        runPhase("autoFleet", () => {
          const truepath =
            readProperty(
              readProperty(pageCapture.rootState.readRoot(), "race"),
              "truepath",
            ) === true;
          if (truepath) {
            ensureOuterFleetControls();
            outerFleet.autoFleetOuter();
          } else {
            ensureGalaxyFleetControls();
            runFleetAutomation({
              reader: fleet.reader,
              executor: fleet.executor,
            });
          }
        });
      }
      if (isEnabled(settings, "autoPower")) {
        // Research or another progression mutation can invalidate the earlier offer sample.
        // Its owning phase establishes a current catalog before Power's read-only handoff.
        runPhase("pre-Power research demand observation", () => {
          ensureDemandResearchObservation();
        });
        runPhase("autoPower", () => {
          observePowerDemandPhase("power-handoff-start");
          // Refresh from the demand owner at the handoff, even if another consumer sampled
          // after Factory: subsequent production work may also have changed the live root.
          // Never discover panels here. Progression owns the established offer catalogs.
          demandThisCycle = undefined;
          // Earlier research/construction may have opened a reservation gate. Revalidate
          // its current prerequisites without drawing; an uncaptured new gate stays stale.
          const prerequisites =
            demandPrerequisitesThisCycle === undefined
              ? undefined
              : ensureDemandPrerequisiteControls({
                  root: pageCapture.rootState.readRoot(),
                  settings,
                  controls: pageCapture.controls,
                  ensureCivicControls: () => undefined,
                  ensureBuildControls: () => undefined,
                });
          demandPrerequisitesThisCycle = prerequisites;
          const buildDemandRequired =
            isEnabled(settings, "autoBuild") ||
            isEnabled(settings, "autoStorage");
          if (
            isRecord(
              readProperty(pageCapture.rootState.readRoot(), "resource"),
            ) &&
            prerequisites !== undefined &&
            prerequisites.spy !== "unavailable" &&
            prerequisites.ai !== "unavailable" &&
            (!isEnabled(settings, "autoTrigger") ||
              triggerTargetsThisCycle !== undefined) &&
            (!hasCapturedProjectStorageDemand(
              settings,
              settingsStorage.readRaw(),
            ) ||
              progression.readEstablishedProjects() !== undefined) &&
            (!buildDemandRequired ||
              progression.readEstablishedStorageBuildTargets() !== undefined)
          ) {
            demandThisCycle = demand.sampleExact();
          }
          observePowerDemandPhase("power-ready");
          const outcome = powerAutomation.run();
          observePowerDemandPhase("power-complete", outcome);
          if (outcome.status !== "succeeded")
            logError(
              `autoPower: ${outcome.failure.code}: ${outcome.failure.message}`,
            );
        });
      }
      // After construction and research, so neither is outbid for the Knowledge a gene costs.
      const geneticsAutomationEnabled =
        isEnabled(settings, "autoGenetics") ||
        isEnabled(settings, "autoMinorTrait") ||
        isEnabled(settings, "autoMutateTraits");
      if (geneticsAutomationEnabled) {
        runPhase("autoGenetics", () => {
          ensureGeneticsControls();
          if (isEnabled(settings, "autoGenetics")) {
            runGeneticsAutomation(genetics);
          }
        });
      }
      if (isEnabled(settings, "autoMinorTrait")) {
        const outcome = runPhase("autoMinorTrait", () => {
          ensureGeneticsControls();
          return traits.autoMinorTrait();
        });
        if (outcome !== undefined && outcome.status !== "succeeded") {
          reportOnce(
            `autoMinorTrait: ${outcome.failure.code}: ${outcome.failure.message}`,
          );
        }
      }
      const prestigeType = settings["prestigeType"];
      if (
        isEnabled(settings, "autoPrestige") &&
        (prestigeType === "mad" ||
          prestigeType === "cataclysm" ||
          prestigeType === "apocalypse" ||
          prestigeType === "demonic" ||
          prestigeType === "whitehole" ||
          prestigeType === "bioseed" ||
          isCapturedBuildingPrestigeType(prestigeType)) &&
        capturedPrestigeGoal !== "GameOverMan"
      ) {
        runPhase("autoPrestige", () => {
          if (prestigeType === "mad") {
            ensureMadControls();
            const mad = pageCapture.controls.resolve(CAPTURED_MAD_CONTROL);
            if (
              mad === undefined ||
              !mad.methods.includes("arm") ||
              !mad.methods.includes("launch")
            ) {
              return;
            }
          }
          prestige.run();
        });
      }
      // A confirmed reset changes the live run out from under every later feature. A planned
      // one-tick `Reset` goal does not: it remains eligible for the old companion ordering.
      if (capturedResetCommittedThisCycle) return;
      if (isEnabled(settings, "autoMinorTrait")) {
        const shapeshift = runPhase("autoShapeshift", () =>
          traitCompanions.autoShapeshift(),
        );
        if (shapeshift !== undefined) {
          if (shapeshift.outcome.status !== "succeeded") {
            reportOnce(
              `autoShapeshift: ${shapeshift.outcome.failure.code}: ${shapeshift.outcome.failure.message}`,
            );
          }
          // shapeShift() can replace race traits, tech, buildings, resources, controls and DOM
          // panels. No decision sampled before it is safe to execute in this cycle.
          if (shapeshift.changed) {
            invalidateCapturedCyclePlanning();
            return;
          }
        }
        const psychic = runPhase("autoPsychic", () =>
          traitCompanions.autoPsychic(),
        );
        if (psychic !== undefined && psychic.status !== "succeeded") {
          reportOnce(
            `autoPsychic: ${psychic.failure.code}: ${psychic.failure.message}`,
          );
        }
        const ocular = runPhase("autoOcularPowers", () =>
          traitCompanions.autoOcularPowers(),
        );
        if (ocular !== undefined && ocular.status !== "succeeded") {
          reportOnce(
            `autoOcularPowers: ${ocular.failure.code}: ${ocular.failure.message}`,
          );
        }
        const wish = runPhase("autoWish", () => traitCompanions.autoWish());
        if (wish !== undefined && wish.status !== "succeeded") {
          reportOnce(`autoWish: ${wish.failure.code}: ${wish.failure.message}`);
        }
      }
      if (isEnabled(settings, "autoMutateTraits")) {
        const outcome = runPhase("autoMutateTraits", () => {
          ensureGeneticsControls();
          return traits.autoMutateTrait();
        });
        if (outcome !== undefined && outcome.status !== "succeeded") {
          reportOnce(
            `autoMutateTraits: ${outcome.failure.code}: ${outcome.failure.message}`,
          );
        }
      }
    } catch (error) {
      // Backstop for anything outside a phase boundary. Each feature now catches its own throw, so
      // reaching here means the cycle's own scaffolding failed and there is no one feature to blame.
      logError(String(error));
    } finally {
      refreshCapturedPlanningPanels();
      stateLogRecorder.recordProcessedCycle(automationCycle, settings);
      currentStateLogConstructionSnapshot = null;
      stateLogPlannerDetailsDue = false;
      if (profiling !== undefined && workStartedAtMs !== undefined) {
        profiling.recordPerformance(
          "tick",
          profiling.nowMs() - workStartedAtMs,
        );
        profiling.flushPerformance();
      }
    }
  };

  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
  ) {
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (isRecord(hooks))
      Reflect.set(hooks, "runCapturedRuntimeCycle", runCycle);
  }

  // The game wakes the script on every completed period; `tickRate` decides how many of those one
  // working cycle covers. Without this gate every automation decision, and every panel draw a cycle
  // pays for, was re-made four times more often than the setting asks for.
  let pendingPeriods = 0;
  const unsubscribePeriods = pageCapture.periods.subscribe((period) => {
    // Overrides need their context before this gate. Reset the cycle-held panel samples here so
    // an override never answers from the previous cycle, and let a cycle that runs reuse this
    // same point-in-time sample for its trigger and progression work.
    progression.resetProjectSample();
    progression.resetBuildingUnlockSample();
    // The gate is the first effective-settings consumer after a browser wake. Refresh before it
    // reads tickRate so an override can change cadence without waiting for a completed cycle.
    refreshEffectiveSettings();
    const gate = advancePeriodGate({
      pendingPeriods,
      completedPeriods: period.periods,
      periodsPerCycle: readPeriodsPerScriptCycle(settingsStore.readRaw()),
    });
    pendingPeriods = gate.pendingPeriods;
    if (!gate.run) return;
    runCycle();
  });
  return () => {
    unsubscribePeriods();
    removeStateLogExport();
  };
}
