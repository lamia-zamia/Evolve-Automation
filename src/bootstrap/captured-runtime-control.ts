import { createMechSupplyReservation } from "../application/mech-supply-reservation.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { createCapturedProgressionControl } from "./captured-progression-control.ts";
import { advancePeriodGate } from "../domain/tick.ts";
import { createStateLogRecorder } from "../application/state-log.ts";
import type { BuildResourceScope } from "../domain/progression/build/build.ts";
import { storageRequirementScopeKey } from "../domain/economy/storage/storage-requirements.ts";
import { readPeriodsPerScriptCycle } from "../adapters/evolve/captured-tick-rate.ts";
import { runCraftAutomation } from "../application/craft.ts";
import {
  runJobsAutomation,
  runPreparedJobsAutomation,
} from "../application/jobs.ts";
import type { PreparedJobsExecution } from "../ports/jobs.ts";
import type { JobsCycleInput } from "../domain/civic/jobs.ts";
import { createCapturedPrestigeControl } from "./captured-prestige-control.ts";
import { createCapturedGatherResourcesControl } from "./captured-gather-resources-control.ts";
import { createCapturedTaxControl } from "./captured-tax-control.ts";
import {
  createCapturedGovernmentAutomation,
  runCapturedGovernmentAutomation,
} from "../adapters/evolve/civic/captured-government.ts";
import { createCapturedGovernmentModalControl } from "../adapters/evolve/civic/captured-government-modal.ts";
import {
  governmentPanelControlEstablished,
  planGovernmentPanelDraw,
  type GovernmentPanelPurpose,
} from "../adapters/evolve/civic/government-panel-draw.ts";
import { createCapturedHellAutomation } from "../adapters/evolve/combat/captured-hell.ts";
import {
  createCapturedGenetics,
  GENETICS_CONTROL,
} from "../adapters/evolve/traits/captured-genetics.ts";
import { GENE_SLOTS_CONTROL } from "../adapters/evolve/traits/captured-trait-automation.ts";
import { runGeneticsAutomation } from "../application/genetics.ts";
import { createCapturedTraitControl } from "./captured-trait-control.ts";
import {
  HELL_GARRISON_CONTROLS,
  HELL_ORDINARY_FORTRESS_METHODS,
  readCapturedHellGarrison,
  resolveCapturedOrdinaryFortress,
} from "../adapters/evolve/combat/captured-hell-garrison.ts";
import {
  CAPTURED_MAD_CONTROL,
  CAPTURED_MAD_RESEARCH_TECH,
  isCapturedBuildingPrestigeType,
  observeCapturedMadGoal,
} from "../adapters/evolve/progression/prestige/captured-mad.ts";
import { runCapturedDiagnosticSafely } from "./captured-diagnostic.ts";
import { planNativeResearchPrerequisites } from "../domain/progression/research-prerequisite-planning.ts";
import type { NativeResearchPrerequisiteGraph } from "../domain/progression/research-prerequisite-planning.ts";
import {
  evaluateResearchGoalCandidates,
  hasVerifiedNonManaAffordabilityForManaOffer,
} from "../domain/progression/research-goal-candidates.ts";
import {
  bindNativeResearchEligibilityEvidence,
  classifyMandatoryNativeResearchObligations,
  classifyMandatoryResearchPrerequisiteObligations,
  planIndependentResearchResourceClaims,
} from "../domain/progression/research-prerequisite-obligations.ts";
import {
  admitResourceClaim,
  readAdmittedResourceClaim,
  type ResourceClaimLifecycleState,
  type ResourceClaim,
} from "../domain/economy/resources/resource-claims.ts";
import { decideResourceClaimLifecycle } from "../domain/economy/resources/resource-claim-lifecycle.ts";
import { decideResearchSpend } from "../domain/progression/research-spending-decision.ts";
import type { GoalResourceStock } from "../domain/economy/goal-feasibility.ts";
import { canAfford } from "../domain/game-world.ts";
import { createCapturedTechPrerequisiteLevelReader } from "../adapters/evolve/progression/research/captured-tech-prerequisite-levels.ts";
import { readEvolveRouteIdentity } from "../adapters/evolve/progression-epoch.ts";
import {
  createEffectiveCapturedTechPrerequisiteSnapshot,
  combineCapturedTechEligibility,
  readCapturedMadTargetCondition,
  readCapturedTechApplicability,
  readFreshCapturedComputedTechRequirements,
} from "../adapters/evolve/progression/research/captured-tech-applicability.ts";
import type { OfferedTech } from "../ports/game-tech-catalog.ts";
import type { ResearchOwnerSelectionObservation } from "../domain/progression/research/research.ts";
import type { ResearchOwnerSelectionResult } from "../domain/progression/research/research.ts";
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
  isCapturedTruepath,
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
import { readCapturedAuthorityMarginal } from "../adapters/evolve/civic/authority.ts";
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
  applyCapturedSmelterTestCandidate,
  capturedSmelterSkipReason,
  createCapturedSmelterIncumbentSnapshot,
  compareCapturedSmelterSteelDemand,
  createCapturedSmelterAutomation,
  setCapturedSmelterObservationModeForTest,
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
import { createCapturedMarketPorts } from "../adapters/evolve/economy/market/captured-market.ts";
import { createCapturedMarketBoard } from "../adapters/evolve/economy/market/captured-market-board.ts";
import {
  createCapturedTradeRoutes,
  createCapturedTradeRoutesTestControl,
} from "../adapters/evolve/economy/market/captured-trade-routes.ts";
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
import { createCapturedArpaMechanics } from "../adapters/evolve/progression/research/captured-arpa-mechanics.ts";
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
import {
  createCapturedEvolution,
  EVOLUTION_ACTION_SELECTOR,
} from "../adapters/evolve/progression/evolution/captured-evolution.ts";
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
import type { EvolutionCycleTrace } from "../ports/evolution.ts";
import { runCapturedPlanetSelection } from "../application/captured-planet-selection.ts";
import { runCapturedSpyTraining } from "../application/captured-spy-training.ts";
import {
  createCapturedEspionageRunner,
  shouldRunCapturedBattleAfterEspionage,
} from "../application/captured-espionage.ts";
import { runMercenaryAutomation } from "../application/mercenary.ts";
import { runBattleAutomation } from "../application/battle.ts";
import { challenges as evolutionChallengeCatalog } from "../adapters/evolve/runtime-catalogs.ts";
import { createCapturedSpyTraining } from "../adapters/evolve/combat/captured-spy-training.ts";
import { createCapturedEspionage } from "../adapters/evolve/combat/captured-espionage.ts";
import { createCapturedEspionageOperationCapture } from "../adapters/evolve/combat/captured-espionage-capture.ts";
import { createCapturedOuterFleetCosts } from "../adapters/evolve/combat/captured-outer-fleet-costs.ts";
import { createCapturedOuterFleetDispatch } from "../adapters/evolve/combat/captured-outer-fleet-dispatch.ts";
import { createCapturedOuterFleetShipyard } from "../adapters/evolve/combat/captured-outer-fleet-shipyard.ts";
import { createCapturedOuterFleetParts } from "../adapters/evolve/combat/captured-outer-fleet-parts.ts";
import { createCapturedSyndicateMechanics } from "../adapters/evolve/captured-syndicate-mechanics.ts";
import { createCapturedSpaceRegionMechanics } from "../adapters/evolve/captured-space-region-mechanics.ts";
import { createCapturedMercenary } from "../adapters/evolve/combat/captured-mercenary.ts";
import { CAPTURED_CITY_GARRISON_CONTROLS } from "../adapters/evolve/combat/captured-city-garrison.ts";
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
import type { TabDiscoveryOptions } from "../ports/game-tab-discovery.ts";
import {
  capturedForeignEstablished,
  capturedForeignGarrisonEstablished,
} from "../adapters/evolve/combat/captured-foreign-state.ts";
import {
  FOREIGN_PANEL_DRAW_KEY,
  planForeignPanelDraw,
} from "../adapters/evolve/combat/foreign-panel-draw.ts";
import type { PageCapture } from "../adapters/evolve/page-capture.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;
declare const __EA_RESEARCH_CONDITION_GATE_ENABLED__: boolean;
import { createGameKeyboardHandlers } from "../adapters/browser/game-keyboard-handlers.ts";
import { createGameCustomRaceLab } from "../adapters/browser/game-custom-race-lab.ts";
import { createGameTerraformLab } from "../adapters/browser/game-terraform-lab.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import type { GameActivitySink } from "../ports/game-message-log.ts";
import { isRecord, readProperty } from "../adapters/validation.ts";
import {
  createCountTally,
  createExclusivePhaseMeasure,
} from "../utils/performance.ts";
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
type CapturedDocument = WorkspaceDocument &
  DrawnActionsDocument &
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
      reactiveObserver: pageCapture.reactiveObserver,
      mechanics: pageCapture.mechanics,
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
  let activeRuntimeMeasure = createExclusivePhaseMeasure(undefined);
  const phaseDiagnostics: TickDiagnostics | undefined =
    diagnostics === undefined
      ? undefined
      : Object.freeze({
          readPerformanceEnabled: () => diagnostics.readPerformanceEnabled(),
          nowMs: () => diagnostics.nowMs(),
          measurePhase: <T>(phase: string, action: () => T) =>
            activeRuntimeMeasure.measure(phase, action),
          recordPerformance: (phase: string, durationMs: number) =>
            activeRuntimeMeasure.record(phase, durationMs),
          recordCount: (name: string, amount: number) =>
            diagnostics.recordCount(name, amount),
          flushPerformance: () => diagnostics.flushPerformance(),
        });
  let invalidateDemandSettings: () => void = () => {};
  const refreshEffectiveSettings = (periodWake = false) =>
    activeRuntimeMeasure.measure(
      periodWake
        ? "period.settings.refreshEffective"
        : "settings.refreshEffective",
      () => {
        // A few discoveries can refresh settings while the composition is still being assembled.
        // Until the condition sampler exists, keep the stored layer visible and defer overrides to
        // the next refresh instead of reporting context-dependent operands as unavailable.
        if (readOverrideConditionContext === undefined) {
          if (overrideSettings.syncStoredSettings()) invalidateDemandSettings();
          return;
        }
        const raw = settingsLifecycle.readRaw();
        const overrides = raw.overrides;
        if (
          readSafeMode() ||
          (isRecord(overrides) && Object.keys(overrides).length > 0)
        ) {
          const changed = activeRuntimeMeasure.measure(
            periodWake
              ? "period.settings.overrideEvaluation"
              : "settings.overrideEvaluation",
            () => overrideSettings.updateOverrides(),
          );
          if (changed) invalidateDemandSettings();
        } else {
          if (overrideSettings.syncStoredSettings()) invalidateDemandSettings();
        }
      },
    );
  const refreshDiscoveredSettings = () => {
    const previousRuns = settingsLifecycle.stats().dynamicDefaultRuns;
    settingsLifecycle.ensureDynamicDefaults();
    if (settingsLifecycle.stats().dynamicDefaultRuns !== previousRuns)
      invalidateDemandSettings();
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
    diagnostics: phaseDiagnostics,
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
    observeGameBindings: (listener) =>
      pageCapture.bindings((elementId) => listener(elementId)),
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
  const emitEvolutionTrace = (event: EvolutionCycleTrace): void => {
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ !== true
    ) {
      return;
    }
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    const sink = readProperty(hooks, "evolutionCycleTrace");
    if (typeof sink === "function") Reflect.apply(sink, hooks, [event]);
    else {
      const root = pageCapture.rootState.readRoot();
      const stats = readProperty(root, "stats");
      const reset = Number(readProperty(stats, "reset"));
      if (reset !== 849) return;
      let recordedEvent: EvolutionCycleTrace = event;
      if (event.stage === "entered") {
        const resource = readProperty(root, "resource");
        const resourceState = (id: string) => {
          const value = readProperty(resource, id);
          return {
            amount: readProperty(value, "amount"),
            max: readProperty(value, "max"),
            display: readProperty(value, "display"),
          };
        };
        const settings = settingsStore.readRaw();
        const enabledChallengeIds = evolutionChallengeGroups
          .map((group) => group.members[0]?.id)
          .filter(
            (id): id is string =>
              id !== undefined &&
              readProperty(settings, `challenge_${id}`) === true,
          );
        const actionRows = drawnActions
          .read(EVOLUTION_ACTION_SELECTOR)
          .map((row) => {
            const handle = pageCapture.controls.resolve(row.id);
            return {
              id: row.id,
              generation: handle?.generation ?? null,
              methods: handle === undefined ? [] : [...handle.methods],
              nativeAffordable: row.nativeAffordable ?? null,
              costComplete: row.costComplete,
            };
          });
        recordedEvent = {
          ...event,
          details: {
            ...event.details,
            resources: { RNA: resourceState("RNA"), DNA: resourceState("DNA") },
            actionRows,
            enabledChallengeIds,
          },
        };
      }
      const key = "__eaEvolutionCycleTrace";
      let events: unknown[] = [];
      try {
        const stored = JSON.parse(sessionStorage.getItem(key) ?? "[]");
        if (Array.isArray(stored)) events = stored;
      } catch {
        events = [];
      }
      if (events.length >= 240) return;
      const runner = readProperty(settingsHostWindow, "__EA_RUNNER__");
      const periods = readProperty(runner, "periods");
      const readLoads = readProperty(runner, "loads");
      const period =
        typeof periods === "function"
          ? Reflect.apply(periods, runner, [])
          : undefined;
      const loads =
        typeof readLoads === "function"
          ? Reflect.apply(readLoads, runner, [])
          : undefined;
      events.push({ period, loads, reset, event: recordedEvent });
      sessionStorage.setItem(key, JSON.stringify(events));
    }
  };
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
    ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
      ? { trace: emitEvolutionTrace }
      : {}),
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
    readPurchaseMoney: () =>
      readDemand("SpyTraining").spyPurchaseReservation?.purchaseMoney,
  });
  // Espionage runs the game's own operations, which live behind a Buefy modal the game builds.
  // The capture reaches them through `foreign.trigModal` with a no-op `$buefy` and a throwaway
  // `#modalBox`, so this phase needs no tab, no panel, and no modal.
  const capturedEspionageOperations = createCapturedEspionageOperationCapture({
    controls: pageCapture.controls,
    synthesis: pageCapture.synthesis,
    mountSuppression: pageCapture.mountSuppression,
    getDocument: () => document,
    getPageWindow: () => settingsHostWindow,
    onCaptureError: (detail) =>
      logError(`espionage operation capture: ${detail}`),
  });
  /**
   * The Dwarf Shipyard's own controls, established against scratch DOM instead of a Civic
   * sub-tab draw: `#dwarfShipYard` is that tab's component render, so a suppressed Civic pass has
   * nothing to draw into and captures nothing. This stands one, runs the game's draw against it, and
   * keeps the controls.
   *
   * It is also the only owner of the ship rows: `pickDest` and `show` are bound per `#shipReg${i}`,
   * never on `shipPlans`, so `captureRow()` runs the yard's own `redraw()` against a scratch
   * `#shipList` whenever a dispatch needs a row the save does not have one for.
   */
  // The yard's own part catalogue, out of the option markup that draw produces. Bound here rather
  // than built into the yard: the markup only exists inside a draw, so the establishment hands it
  // over on its way out, and the catalogue itself has three routes to be proven — the markup the game
  // is really rendering, the markup this establishment produced, and one protected draw for a yard
  // whose control was captured on an earlier visit and whose markup has since been cleared.
  const outerFleetParts = createCapturedOuterFleetParts({
    getDocument: () => document,
    // Bound now and called only later, and only when the yard is already established: a draw is the
    // yard's own pass, never one this catalogue starts on its own.
    yard: {
      control: () => outerFleetShipyard.control(),
      established: (control) => outerFleetShipyard.established(control),
      establish: () => outerFleetShipyard.establish(),
    },
    onCaptureError: (detail) =>
      logError(`outer fleet part catalogue: ${detail}`),
  });
  const outerFleetShipyard = createCapturedOuterFleetShipyard({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    synthesis: pageCapture.synthesis,
    mountSuppression: pageCapture.mountSuppression,
    panels,
    getDocument: () => document,
    getPageWindow: () => settingsHostWindow,
    parts: outerFleetParts,
    onEstablishError: (detail) =>
      logError(`outer fleet shipyard capture: ${detail}`),
  });
  // The Dwarf Shipyard's dispatch is the same shape: the game offers no method for sending a built
  // ship onward, only a ship row's `pickDest` closure behind a Buefy modal. This capture reaches that
  // closure with a row the yard itself bound, a no-op `$buefy` and a throwaway `#modalBox`, so a
  // build and its dispatch are one synchronous pass with nothing on screen.
  const capturedOuterFleetDispatch = createCapturedOuterFleetDispatch({
    controls: pageCapture.controls,
    shipyard: outerFleetShipyard,
    synthesis: pageCapture.synthesis,
    mountSuppression: pageCapture.mountSuppression,
    getDocument: () => document,
    getPageWindow: () => settingsHostWindow,
    onCaptureError: (detail) =>
      logError(`outer fleet dispatch capture: ${detail}`),
  });
  /**
   * The yard's own `#shipYardCosts`, and therefore the only price this script quotes for a ship.
   *
   * Off-tab it is not a pass of its own but a scratch `#shipYardCosts` the game's own
   * `updateCosts()` fills: the design is applied through the captured `shipPlans.setVal` for the
   * length of one synchronous call, crew is read through native `crewText`, and the blueprint is put
   * back before it returns. Outer Fleet holds that one crew/cost quote for its candidate. Both the outer
   * fleet and fleet demand read it, so neither ever needs the player to visit the shipyard.
   */
  const outerFleetCosts = createCapturedOuterFleetCosts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    panels,
    mountSuppression: pageCapture.mountSuppression,
    getDocument: () => document,
    onCaptureError: (detail) => logError(`outer fleet costs: ${detail}`),
  });
  const capturedEspionage = createCapturedEspionage({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readPurchaseReservation: () =>
      readDemand("Espionage").spyPurchaseReservation,
    operations: capturedEspionageOperations,
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
  let lastMadGoalDiagnostic = "";
  let lastResearchGraphKey = "";
  let lastResearchGraph: NativeResearchPrerequisiteGraph | undefined;
  const researchRootIdentities = new WeakMap<object, number>();
  let nextResearchRootIdentity = 1;
  const readResearchGrantLevels = createCapturedTechPrerequisiteLevelReader();
  let capturedMechCycleHasPendingWork = false;
  const capturedMercenary = createCapturedMercenary({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readGoal: () => capturedPrestigeGoal,
    readMoneyRequested: () =>
      readDemand("Mercenary").requestedQuantity("Money"),
    readMoneyStorageRequired: () =>
      readDemand("Mercenary").storageRequired("Money"),
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
      ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
        ? { trace: emitEvolutionTrace }
        : {}),
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
  const measurePhase = <T>(name: string, body: () => T): T => {
    return activeRuntimeMeasure.measure(name, body);
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
    if (
      typeof __EA_RESEARCH_CONDITION_GATE_ENABLED__ !== "undefined" &&
      __EA_RESEARCH_CONDITION_GATE_ENABLED__ === true &&
      pageCapture.mechanics.researchConditionGateCompromised?.()
    ) {
      reportOnce(
        "automation paused because Research callback restoration failed; reload the game to recover",
      );
      return undefined;
    }
    try {
      return activeRuntimeMeasure.measure(name, body);
    } catch (error) {
      reportOnce(`${name} stopped: ${String(error)}`);
      return undefined;
    }
  };
  // The demand sample both reads the construction cycle's observations and answers its storage
  // question, so one of the two has to be late-bound. This one is, with a real empty sample until
  // the cycle exists, rather than a mutable object either side could hold a stale reference to.
  type DemandSampleOwner =
    | "pre-Gather"
    | "Build"
    | "Market"
    | "Storage"
    | "Jobs"
    | "Power"
    | "SpyTraining"
    | "Espionage"
    | "Mercenary"
    | "Mech"
    | "Genetics"
    | "Replicator"
    | "ProductionRatios"
    | "Craft"
    | "Smelter"
    | "Nanite"
    | "Ejector"
    | "Supply"
    | "Factory"
    | "Fleet";
  let readDemand: (owner: DemandSampleOwner) => CapturedDemandSample = () =>
    EMPTY_DEMAND_SAMPLE;
  const readDemandFor = (owner: DemandSampleOwner) => () => readDemand(owner);
  // Overrides may need the prerequisite report before the period gate; the cycle then keeps and
  // reuses it for its demand consumers. Reset it with the cycle's other samples.
  let demandPrerequisitesThisCycle: DemandPrerequisiteReport | undefined;
  const readDemandPrerequisites = () => demandPrerequisitesThisCycle;
  const mechSupplyReservation = createMechSupplyReservation();
  let readArpaReadinessEpoch: () => string = () => "progression-not-ready";
  const arpa = createCapturedArpaMechanics({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readReadinessEpoch: () => readArpaReadinessEpoch(),
    discovery: createCapturedTabDiscovery({
      rootState: pageCapture.rootState,
      controls: pageCapture.controls,
      mountSuppression: pageCapture.mountSuppression,
      panels,
      ...(phaseDiagnostics === undefined
        ? {}
        : { diagnostics: phaseDiagnostics }),
    }),
    pageWindow: settingsHostWindow,
    bindings: pageCapture.bindings,
    ...(diagnostics === undefined
      ? {}
      : { onDiagnostic: (message: string) => reportDiagnostic(message) }),
  });
  let constructionMutationObserved = false;
  let storageMutationObserved = false;
  let researchOwnerSelectionObserver = (
    _selection: Readonly<ResearchOwnerSelectionObservation>,
  ) => {};
  let pendingResearchOwnerSelectionSummary: string | undefined;
  let pendingResearchOwnerSelectionDetails: readonly string[] = [];
  let pendingResearchOwnerSelectionDiagnosticMs = 0;
  let researchOwnerSelectionResultObserver = (
    _result: Readonly<ResearchOwnerSelectionResult>,
  ) => {};
  const progression = createCapturedProgressionControl({
    readMechPowerSupplyHold: mechSupplyReservation.readPowerSupplyHold,
    rootState: pageCapture.rootState,
    mechanics: pageCapture.mechanics,
    controls: pageCapture.controls,
    bindings: pageCapture.bindings,
    mountSuppression: pageCapture.mountSuppression,
    panels,
    discoveryAttempts,
    ...(keyboard === undefined ? {} : { keyboard }),
    keyState: pageCapture.keyState,
    drawnActions: createGameDrawnActionsReader({
      getDocument: () => document,
      diagnostics: phaseDiagnostics,
    }),
    arpa,
    costs: buildCosts,
    readSettings: () => settingsStore.readRaw(),
    readInterfacePresentationSettings: readEffectiveInterfacePresentation,
    readStateLogPlannerDetailsDue: () => stateLogPlannerDetailsDue,
    readReservedQuantityForMechPriority: (resourceId) =>
      readDemand("Mech").requestedQuantityForMechPriority(resourceId),
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
      const sample = readDemand("Build");
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
    onConstructionMutation: () => {
      constructionMutationObserved = true;
    },
    // Reported once per distinct reason: a candidate the cycle cannot price or a catalog it cannot
    // read is otherwise dropped in silence, which is how a composition gap survives a whole session.
    onSkipped: (key, reason) =>
      reportOnce(`progression skipped ${key}: ${reason}`),
    onUnavailable: (reason) => reportOnce(`progression unavailable: ${reason}`),
    nowMs: () => Date.now(),
    diagnostics: phaseDiagnostics,
    ...(phaseDiagnostics?.readPerformanceEnabled() === true
      ? {
          onResearchOwnerSelection: (
            selection: Readonly<ResearchOwnerSelectionObservation>,
          ) => researchOwnerSelectionObserver(selection),
          onResearchOwnerSelectionResult: (
            result: Readonly<ResearchOwnerSelectionResult>,
          ) => researchOwnerSelectionResultObserver(result),
        }
      : {}),
    ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
      ? {
          readComputedResearchRequirementsEnabled: () => {
            const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
            const intervention = readProperty(hooks, "gatherIntervention");
            return (
              readProperty(hooks, "computedResearchRequirementsCapture") ===
                true ||
              readProperty(intervention, "resourceClaimMode") ===
                "goal-derived-conjunctive"
            );
          },
          readResearchTestIntervention: () => {
            const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
            const intervention = readProperty(
              hooks,
              "researchSpendingIntervention",
            );
            const deferActionId = readProperty(intervention, "deferActionId");
            const targetActionId = readProperty(intervention, "targetActionId");
            return typeof deferActionId === "string" &&
              deferActionId.length > 0 &&
              typeof targetActionId === "string" &&
              targetActionId.length > 0
              ? Object.freeze({ deferActionId, targetActionId })
              : undefined;
          },
          readResearchShadowObserver: () => {
            const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
            if (
              !isRecord(hooks) ||
              readProperty(hooks, "researchShadowEnabled") !== true
            )
              return undefined;
            const testHooks = hooks;
            return (observation) => {
              const root = pageCapture.rootState.readRoot();
              const race = readProperty(root, "race");
              const universe = readProperty(race, "universe");
              const routeIdentity = JSON.stringify([
                typeof universe === "string" ? universe : null,
                readProperty(race, "truepath") === true,
                readProperty(race, "iceage") === true,
              ]);
              const nativeManaCallback =
                pageCapture.mechanics.readNativeTechManaCallbackIdentityForTest?.(
                  observation.actionId,
                  {
                    rootGeneration: progression.readRootGeneration(),
                    progressionEpoch: progression.readProgressionEpoch(),
                    routeIdentity,
                    nativeResearchObservationGeneration:
                      observation.offerGeneration,
                  },
                );
              const intervention = readProperty(
                testHooks,
                "gatherIntervention",
              );
              const claimValues = readProperty(intervention, "resourceClaims");
              const activeClaims = Array.isArray(claimValues)
                ? claimValues
                    .map((value: unknown) => readAdmittedResourceClaim(value))
                    .filter(
                      (claim): claim is Readonly<ResourceClaim> =>
                        claim !== undefined,
                    )
                : [];
              const fulfilledClaim = observation.expectedGrantOccurred
                ? activeClaims.find(
                    (claim) => claim.nativeActionId === observation.actionId,
                  )
                : undefined;
              const remainingClaims = activeClaims.filter(
                (claim) => claim.claimId !== fulfilledClaim?.claimId,
              );
              const stockDecrease =
                observation.manaStockBefore === undefined ||
                observation.manaStockAfter === undefined
                  ? undefined
                  : observation.manaStockBefore - observation.manaStockAfter;
              const event = Object.freeze({
                ...observation,
                nativeManaCallback,
                claimState: Object.freeze(
                  activeClaims.map((claim) =>
                    Object.freeze({
                      claimId: claim.claimId,
                      actionId: claim.nativeActionId,
                      protectedMana: claim.requiredQuantity,
                    }),
                  ),
                ),
                fulfilledClaimId: fulfilledClaim?.claimId,
                couldHaveConsumedStockProtectedForAnotherObligation:
                  remainingClaims.length === 0
                    ? false
                    : stockDecrease === undefined
                      ? undefined
                      : stockDecrease > 0,
                internalCostEvaluations: "unobserved",
              });
              const previous = readProperty(testHooks, "researchShadowEvents");
              const events = Array.isArray(previous) ? previous : [];
              events.push(event);
              Reflect.set(testHooks, "researchShadowEvents", events);
            };
          },
        }
      : {}),
    onDiagnostic: reportDiagnostic,
    onActivity,
  });
  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
  ) {
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (isRecord(hooks)) {
      Reflect.set(hooks, "sampleResearchCatalog", () => {
        const offers = progression.sampleOfferedTechs(
          "test-controlled-discovery",
        );
        const definitions = progression.readResearchActionDefinitions();
        const root = pageCapture.rootState.readRoot();
        const progressionEpoch = progression.readProgressionEpoch();
        const rootGeneration = progression.readRootGeneration();
        const currentOffers = progression.readOfferedTechs();
        const generationsCurrent =
          offers !== undefined &&
          currentOffers !== undefined &&
          offers.length === currentOffers.length &&
          offers.every(
            (offer, index) =>
              offer.elementId === currentOffers[index]?.elementId &&
              offer.generation === currentOffers[index]?.generation,
          );
        return Object.freeze({
          offers,
          definitions,
          rootCaptured: root !== undefined,
          progressionEpoch,
          rootGeneration,
          current:
            root === pageCapture.rootState.readRoot() &&
            progressionEpoch === progression.readProgressionEpoch() &&
            rootGeneration === progression.readRootGeneration() &&
            generationsCurrent,
        });
      });
      const readResearchResourceSamples = (
        offers:
          readonly { cost: Readonly<Record<string, number>> }[] | undefined,
        root: unknown,
      ) => {
        const resourceIds = new Set(
          (offers ?? []).flatMap((offer) => Object.keys(offer.cost)),
        );
        const sample =
          root === undefined
            ? undefined
            : createCapturedResourceSource(pageCapture.rootState).readResources(
                resourceIds,
              );
        return [...resourceIds].map((resourceId) => {
          const resource = sample?.resources.get(resourceId);
          return Object.freeze({
            resourceId,
            present: resource?.present ?? false,
            holding:
              resource?.present === true && Number.isFinite(resource.amount)
                ? resource.amount
                : undefined,
            capacity:
              resource?.present === true && Number.isFinite(resource.max)
                ? resource.max
                : undefined,
            netRate:
              resource?.present === true &&
              Number.isFinite(resource.rateOfChange)
                ? resource.rateOfChange
                : undefined,
          });
        });
      };
      const readCurrentResearchCatalog = (
        actionId: unknown,
        forceFresh: unknown,
      ) => {
        const freshSnapshot =
          forceFresh === true
            ? progression.readFreshResearchCatalogForTest?.()
            : undefined;
        const root = pageCapture.rootState.readRoot();
        const rootGeneration = progression.readRootGeneration();
        const progressionEpoch = progression.readProgressionEpoch();
        const offers =
          forceFresh === true
            ? freshSnapshot?.offered
            : progression.readOfferedTechs();
        const definitions =
          forceFresh === true
            ? freshSnapshot?.definitions
            : progression.readResearchActionDefinitions();
        const settings = settingsStore.readRaw();
        const grantLevels =
          root === undefined || definitions === undefined
            ? undefined
            : readResearchGrantLevels(root, definitions);
        const applicability =
          root === undefined || definitions === undefined
            ? undefined
            : readCapturedTechApplicability(root, definitions);
        const mana = readProperty(readProperty(root, "resource"), "Mana");
        const queueEvidence =
          root === undefined
            ? "unavailable"
            : (["queue", "r_queue"] as const).reduce<
                "empty" | "conflict" | "unavailable"
              >((evidence, queueId) => {
                if (evidence !== "empty") return evidence;
                const entries = readProperty(
                  readProperty(root, queueId),
                  "queue",
                );
                return !Array.isArray(entries)
                  ? "unavailable"
                  : entries.length > 0
                    ? "conflict"
                    : evidence;
              }, "empty");
        const targetControl =
          typeof actionId === "string"
            ? pageCapture.controls.resolve(actionId)
            : undefined;
        const resourceSamples = readResearchResourceSamples(offers, root);
        const generationsCurrent =
          offers !== undefined &&
          offers.every(
            (offer) =>
              pageCapture.controls.resolve(offer.elementId)?.generation ===
              offer.generation,
          );
        return Object.freeze({
          current:
            root !== undefined &&
            root === pageCapture.rootState.readRoot() &&
            rootGeneration === progression.readRootGeneration() &&
            progressionEpoch === progression.readProgressionEpoch() &&
            generationsCurrent,
          source:
            forceFresh === true
              ? "protected-fresh-draw"
              : "shared-current-cycle",
          offers,
          definitions,
          resourceSamples: Object.freeze(resourceSamples),
          grantLevels: grantLevels === undefined ? undefined : [...grantLevels],
          applicability:
            applicability === undefined ? undefined : [...applicability],
          rootGeneration,
          progressionEpoch,
          selectedPrestige: readProperty(settings, "prestigeType"),
          researchPermission: readProperty(settings, "autoResearch"),
          triggersEnabled: readProperty(settings, "autoTrigger"),
          queueEvidence,
          targetControl:
            targetControl === undefined
              ? undefined
              : Object.freeze({
                  generation: targetControl.generation,
                  methods: targetControl.methods,
                }),
          mana: Object.freeze({
            amount: readProperty(mana, "amount"),
            capacity: readProperty(mana, "max"),
            productionPerSecond: readProperty(mana, "gen"),
          }),
          targetEligibility:
            typeof actionId === "string"
              ? progression.readResearchActionEligibility?.(actionId)
              : "not-requested",
          madTargetCondition: readCapturedMadTargetCondition(root).status,
          highTechLevel: readProperty(readProperty(root, "tech"), "high_tech"),
        });
      };
      Reflect.set(
        hooks,
        "readCurrentResearchCatalog",
        readCurrentResearchCatalog,
      );
      Reflect.set(hooks, "readCurrentResearchResourceSamples", () => {
        const root = pageCapture.rootState.readRoot();
        return readResearchResourceSamples(
          progression.readOfferedTechs(),
          root,
        );
      });
      Reflect.set(hooks, "invokeResearchActionForTest", (actionId: unknown) => {
        if (typeof actionId !== "string")
          return Object.freeze({ status: "invalid-action-id" });
        const control = pageCapture.controls.resolve(actionId);
        if (control === undefined || !control.methods.includes("action"))
          return Object.freeze({ status: "native-action-unavailable" });
        return pageCapture.controls.invoke(control, "action", []);
      });
    }
  }
  researchOwnerSelectionObserver = (selection) => {
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
    ) {
      const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
      const root = pageCapture.rootState.readRoot();
      const rootGeneration = progression.readRootGeneration();
      const progressionEpoch = progression.readProgressionEpoch();
      const observedOffers = progression.readOfferedTechs();
      const currentOffer = observedOffers?.find(
        (offer) => offer.elementId === selection.decision.techId,
      );
      const ownerQueueEvidence =
        root === undefined
          ? "unavailable"
          : (["queue", "r_queue"] as const).reduce<
              "empty" | "conflict" | "unavailable"
            >((evidence, queueId) => {
              if (evidence !== "empty") return evidence;
              const entries = readProperty(
                readProperty(root, queueId),
                "queue",
              );
              return !Array.isArray(entries)
                ? "unavailable"
                : entries.length > 0
                  ? "conflict"
                  : evidence;
            }, "empty");
      const currentControl =
        currentOffer === undefined
          ? undefined
          : pageCapture.controls.resolve(currentOffer.elementId);
      const ownerCatalogCurrent =
        root !== undefined &&
        root === pageCapture.rootState.readRoot() &&
        rootGeneration === progression.readRootGeneration() &&
        progressionEpoch === progression.readProgressionEpoch() &&
        currentOffer?.generation === currentControl?.generation;
      const definitions = progression.readResearchActionDefinitions();
      const definition = definitions?.find(
        (entry) => entry.actionId === selection.decision.techId,
      );
      const manaBeforeValue = Number(
        readProperty(
          readProperty(readProperty(root, "resource"), "Mana"),
          "amount",
        ),
      );
      const manaBefore = Number.isFinite(manaBeforeValue)
        ? manaBeforeValue
        : undefined;
      const grantBefore =
        definition === undefined ||
        root === undefined ||
        definitions === undefined
          ? undefined
          : readResearchGrantLevels(root, definitions)?.get(
              definition.grantTechnology,
            );
      if (isRecord(hooks)) {
        Reflect.set(
          hooks,
          "researchOwnerSelectionLast",
          Object.freeze({
            cycle: automationCycle,
            rootGeneration,
            progressionEpoch,
            catalogCurrent: ownerCatalogCurrent,
            researchPermission: settingsStore.readRaw()["autoResearch"],
            queueEvidence: ownerQueueEvidence,
            targetEligibility:
              progression.readResearchActionEligibility?.(
                selection.decision.techId,
              ) ?? "unavailable",
            actionId: selection.decision.techId,
            grantTechnology: definition?.grantTechnology,
            grantLevel: definition?.grantLevel,
            grantBefore,
            manaBefore,
            observed: selection.observed.map((candidate) => ({
              actionId: candidate.id,
              offerGeneration: candidate.offerGeneration,
              offerObservationId: candidate.offerObservationId,
              offerSetIdentity: candidate.offerSetIdentity,
              cost: candidate.offerCost,
              affordable: candidate.affordable,
              nativeAffordable: candidate.nativeAffordable,
              resourceAffordable: candidate.resourceAffordable,
              observedResources: candidate.observedResources,
              reservation: candidate.costConflictEvidence,
              exclusion: candidate.exclusionEvidence,
            })),
          }),
        );
      }
    }
    const diagnosticClock = phaseDiagnostics;
    if (
      settingsStore.readRaw()["prestigeType"] !== "mad" ||
      diagnosticClock === undefined ||
      diagnosticClock.readPerformanceEnabled() !== true
    )
      return;
    const diagnosticStartedAtMs = diagnosticClock.nowMs();
    runCapturedDiagnosticSafely(
      () => {
        const root = pageCapture.rootState.readRoot();
        const progressionEpoch = progression.readProgressionEpoch();
        const rootGeneration = progression.readRootGeneration();
        const offers = progression.readOfferedTechs();
        const definitions = progression.readResearchActionDefinitions();
        if (
          root === undefined ||
          offers === undefined ||
          definitions === undefined
        ) {
          reportDiagnostic(
            `goal.mad research owner selected=${selection.decision.techId} evidence=unavailable catalog-or-root`,
          );
          return;
        }
        const grantLevels = readResearchGrantLevels(root, definitions);
        const applicability = readCapturedTechApplicability(root, definitions);
        const generations = new Map(
          offers.map((offer) => [offer.elementId, offer.generation]),
        );
        const graph = activeRuntimeMeasure.measure(
          "goal.mad.research-owner-prerequisites",
          () =>
            planNativeResearchPrerequisites({
              targetActionId: CAPTURED_MAD_RESEARCH_TECH,
              definitions: definitions.map((definition) => ({
                actionId: definition.actionId,
                grantTechnology: definition.grantTechnology,
                grantLevel: definition.grantLevel,
                prerequisites: definition.prerequisites,
                hasNativeCondition: definition.eligibility.hasNativeCondition,
                routeRestrictions: definition.eligibility.routeRestrictions,
                restrictions: definition.eligibility.restrictions,
              })),
              grantLevels,
              ...(applicability === undefined
                ? {}
                : { applicabilityByActionId: applicability }),
              offeredActionIds: new Set(offers.map((offer) => offer.elementId)),
              offerGenerations: generations,
              cycle: automationCycle,
              progressionEpoch,
              rootGeneration,
              maxDepth: 16,
              maxActions: 256,
            }),
        );
        const observedById = new Map(
          selection.observed.map((candidate) => [candidate.id, candidate]),
        );
        const evaluation = activeRuntimeMeasure.measure(
          "goal.mad.research-owner-candidates",
          () =>
            evaluateResearchGoalCandidates({
              goalId: "prestige:mad",
              targetActionId: CAPTURED_MAD_RESEARCH_TECH,
              goalSatisfied: graph.targetStatus === "satisfied",
              graph,
              cycle: automationCycle,
              progressionEpoch,
              rootGeneration,
              offers: offers.map((offer, index) => {
                const observed = observedById.get(offer.elementId);
                return {
                  actionId: offer.elementId,
                  grantTechnology: offer.grantTechnology,
                  grantLevel: offer.grantLevel,
                  index,
                  generation: offer.generation,
                  cost: offer.cost,
                  nativeAffordable: offer.nativeAffordable,
                  resourceAffordable: observed?.resourceAffordable,
                  hasCostConflict:
                    observed?.costConflictEvidence === "none"
                      ? false
                      : observed?.costConflictEvidence === "conflict"
                        ? true
                        : undefined,
                  reservationEvidence:
                    observed?.costConflictEvidence ?? "not-observed",
                  ...(observed === undefined
                    ? {
                        reservationReason:
                          "offer was outside the Research owner's sequential read prefix",
                      }
                    : observed.reservationReason === undefined
                      ? {}
                      : { reservationReason: observed.reservationReason }),
                  hasExplicitExclusion:
                    observed?.exclusionEvidence === "none"
                      ? false
                      : observed?.exclusionEvidence === "excluded"
                        ? true
                        : undefined,
                  explicitExclusionEvidence:
                    observed?.exclusionEvidence ?? "not-observed",
                  ...(observed === undefined
                    ? {
                        exclusionReason:
                          "offer was outside the Research owner's sequential read prefix",
                      }
                    : observed.exclusionReason === undefined
                      ? {}
                      : { exclusionReason: observed.exclusionReason }),
                };
              }),
              baselineSelectedActionId: selection.decision.techId,
            }),
        );
        const selected = evaluation.candidates.find(
          (candidate) => candidate.actionId === selection.decision.techId,
        );
        const savingTarget = evaluation.candidates.find(
          (candidate) =>
            candidate.dependencyRelation === "declared-prerequisite" &&
            candidate.actionability === "current-native-offer" &&
            candidate.pathApplicability === "eligible" &&
            !candidate.nativeAffordable,
        );
        const selectedObservation = observedById.get(selection.decision.techId);
        const selectedOffer = offers.find(
          (offer) => offer.elementId === selection.decision.techId,
        );
        const targetOffer = offers.find(
          (offer) => offer.elementId === savingTarget?.actionId,
        );
        const observedResources = selectedObservation?.observedResources;
        const validityEpoch = `${progressionEpoch}|root:${rootGeneration ?? "unknown"}|cycle:${automationCycle}`;
        const stocks: GoalResourceStock[] = Object.entries(
          observedResources ?? {},
        ).map(([resourceId, resource]) => ({
          resourceId,
          poolId: "anywhere",
          amount: resource.amount,
          capacity: resource.max,
          netRate: resource.rateOfChange,
          rateConfidence: "observed",
          validityEpoch,
        }));
        const spend =
          savingTarget === undefined
            ? undefined
            : decideResearchSpend({
                goalId: "prestige:mad",
                currentGoalId: "prestige:mad",
                terminalGoalApplicability:
                  applicability?.get(CAPTURED_MAD_RESEARCH_TECH)?.status ===
                  "excluded"
                    ? "excluded"
                    : "conditional",
                validityEpoch,
                currentValidityEpoch: validityEpoch,
                selectedAction:
                  selected === undefined
                    ? undefined
                    : {
                        actionId: selected.actionId,
                        cost: selected.cost,
                        currentNativeOffer:
                          selected.actionability === "current-native-offer",
                        nativeAffordable: selected.nativeAffordable,
                        applicability: selected.pathApplicability,
                        offerGeneration: selectedOffer?.generation,
                        expectedOfferGeneration: selectedOffer?.generation,
                        // The offer snapshot does not independently establish current control
                        // freshness; keep that part of the diagnostic unavailable.
                        controlGeneration: undefined,
                        expectedControlGeneration: undefined,
                      },
                selectedByResearchOwner:
                  selection.decision.techId === selected?.actionId,
                selectedResourceAffordable:
                  selectedObservation?.resourceAffordable,
                selectedReservationConflict:
                  selectedObservation?.costConflictEvidence === "none"
                    ? false
                    : selectedObservation?.costConflictEvidence === "conflict"
                      ? true
                      : undefined,
                selectedExplicitExclusion:
                  selectedObservation?.exclusionEvidence === "none"
                    ? false
                    : selectedObservation?.exclusionEvidence === "excluded"
                      ? true
                      : undefined,
                selectedEffects: undefined,
                target: {
                  actionId: savingTarget.actionId,
                  cost: savingTarget.cost,
                  currentNativeOffer: true,
                  nativeAffordable: savingTarget.nativeAffordable,
                  applicability: savingTarget.pathApplicability,
                  offerGeneration: targetOffer?.generation,
                  expectedOfferGeneration: targetOffer?.generation,
                  // Offer generation is not an independent control observation.
                  controlGeneration: undefined,
                  expectedControlGeneration: undefined,
                },
                additionalTargetNeeds: [],
                stocks,
                commitments: [],
                commitmentsKnown: false,
                acceleratorScan: "unavailable",
                accelerators: [],
              });
        const goalOfferDetails = evaluation.candidates
          .filter(
            (candidate) =>
              candidate.dependencyRelation === "declared-prerequisite",
          )
          .map((candidate) => {
            const observed = observedById.get(candidate.actionId);
            const overlap = Object.keys(selected?.cost ?? {}).filter(
              (resourceId) => candidate.cost[resourceId] !== undefined,
            );
            const cost = Object.entries(candidate.cost)
              .map(([resourceId, amount]) => `${resourceId}:${amount}`)
              .join(",");
            return `goal.mad frontier cycle=${automationCycle} action=${candidate.actionId} relation=${candidate.dependencyRelation} path=${candidate.pathApplicability} cost=${cost} shared=${overlap.join(",") || "none"} native=${candidate.nativeAffordable ? "yes" : "no"} resources=${candidate.resourceAffordability} ownerRead=${observed === undefined ? "no" : "yes"} reservation=${candidate.reservationEvidence} exclusion=${candidate.explicitExclusionEvidence}`;
          });
        const affordableOtherOffers = evaluation.candidates
          .filter(
            (candidate) =>
              candidate.dependencyRelation === "none" &&
              candidate.resourceAffordability === "affordable" &&
              candidate.nativeAffordable,
          )
          .map((candidate) => candidate.actionId)
          .join("+");
        const affordableUnknownRelation = evaluation.candidates
          .filter(
            (candidate) =>
              candidate.dependencyRelation === "unknown" &&
              candidate.nativeAffordable &&
              candidate.resourceAffordability === "affordable",
          )
          .map((candidate) => candidate.actionId)
          .join("+");
        if (affordableOtherOffers || affordableUnknownRelation)
          goalOfferDetails.push(
            `goal.mad other offers cycle=${automationCycle} nonPrerequisite=${affordableOtherOffers || "none"} relationUnknown=${affordableUnknownRelation || "none"}`,
          );
        if (spend !== undefined && savingTarget !== undefined) {
          const waitProjection = spend.comparison?.strategies.find(
            (strategy) => strategy.id === "wait",
          );
          const buyProjection = spend.comparison?.strategies.find((strategy) =>
            strategy.id.startsWith("buy-selected:"),
          );
          const stockFacts =
            Object.entries(observedResources ?? {})
              .filter(
                ([resourceId]) => savingTarget.cost[resourceId] !== undefined,
              )
              .map(
                ([resourceId, resource]) =>
                  `${resourceId}:${resource.amount.toFixed(1)}/${resource.max}@${resource.rateOfChange.toFixed(2)}/s`,
              )
              .join(",") || "unobserved";
          const projectedSeconds = (value: number | undefined) =>
            value === undefined ? "?" : value.toFixed(1);
          const buySeconds =
            buyProjection === undefined ||
            buyProjection.status === "unavailable"
              ? "unknown"
              : projectedSeconds(
                  buyProjection.feasibility.diagnosticEstimatedTime,
                );
          goalOfferDetails.push(
            `goal.mad spend cycle=${automationCycle} target=${spend.targetActionId} cost=${Object.entries(
              savingTarget.cost,
            )
              .map(([resourceId, amount]) => `${resourceId}:${amount}`)
              .join(
                ",",
              )} stock=${stockFacts} waitSec=${projectedSeconds(waitProjection?.feasibility.diagnosticEstimatedTime)} buySec=${buySeconds} commitments=unknown effects=unknown accelerators=unscanned`,
          );
        }
        pendingResearchOwnerSelectionDetails = Object.freeze(goalOfferDetails);
        const selectedCost = Object.entries(selected?.cost ?? {})
          .map(([resourceId, amount]) => `${resourceId}:${amount}`)
          .join(",");
        const spendReasons = (spend?.reasons ?? [])
          .map((reason) =>
            reason.includes("terminal goal applicability")
              ? "goal-condition"
              : reason.includes("commitments or reservations")
                ? "target-resv"
                : reason.includes("unlock, production and collateral")
                  ? "selected-effects"
                  : reason.includes("accelerator offer/effect")
                    ? "accelerator-scan"
                    : reason.includes("expected terminal-goal time")
                      ? "provisional"
                      : reason.includes("safe")
                        ? "owner-evidence"
                        : reason.includes("stale")
                          ? "stale-evidence"
                          : reason,
          )
          .join("+");
        pendingResearchOwnerSelectionSummary = `goal.mad owner c=${automationCycle} tech=${selection.decision.techId} ${selectedCost.replace("Knowledge:", "K")} resources=${selected?.resourceAffordability ?? "unknown"} reservation=${selected?.reservationEvidence ?? "unknown"} exclusion=${selected?.explicitExclusionEvidence ?? "unknown"} frontier=${spend?.targetActionId ?? "none"} target=${spend?.targetAffordability ?? "unavailable"} decision=${spend?.decision ?? "unavailable"} blockers=${spendReasons || "no-frontier"}`;
      },
      (error) =>
        reportOnce(
          `goal.mad research owner observation failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
    );
    pendingResearchOwnerSelectionDiagnosticMs = Math.max(
      0,
      diagnosticClock.nowMs() - diagnosticStartedAtMs,
    );
  };
  researchOwnerSelectionResultObserver = (result) => {
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
    ) {
      const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
      const prior = readProperty(hooks, "researchOwnerSelectionLast");
      const root = pageCapture.rootState.readRoot();
      const definitions = progression.readResearchActionDefinitions();
      const definition = definitions?.find(
        (entry) => entry.actionId === result.decision.techId,
      );
      const grantAfter =
        definition === undefined ||
        root === undefined ||
        definitions === undefined
          ? undefined
          : readResearchGrantLevels(root, definitions)?.get(
              definition.grantTechnology,
            );
      const manaAfterValue = Number(
        readProperty(
          readProperty(readProperty(root, "resource"), "Mana"),
          "amount",
        ),
      );
      const manaAfter = Number.isFinite(manaAfterValue)
        ? manaAfterValue
        : undefined;
      const manaBefore = Number(readProperty(prior, "manaBefore"));
      const readPeriod = readProperty(hooks, "readPeriodForTest");
      const period =
        typeof readPeriod === "function"
          ? Reflect.apply(readPeriod, hooks, [])
          : undefined;
      if (isRecord(hooks)) {
        const events = readProperty(hooks, "researchOwnerSelectionEvents");
        const history = Array.isArray(events) ? events : [];
        history.push(
          Object.freeze({
            ...(isRecord(prior) ? prior : {}),
            cycle: automationCycle,
            period:
              typeof period === "number" && Number.isSafeInteger(period)
                ? period
                : undefined,
            actionId: result.decision.techId,
            disposition: result.disposition,
            grantAfter,
            manaAfter,
            manaSpent:
              Number.isFinite(manaBefore) && manaAfter !== undefined
                ? Math.max(0, manaBefore - manaAfter)
                : undefined,
          }),
        );
        Reflect.set(hooks, "researchOwnerSelectionEvents", history);
      }
    }
    if (result.disposition === "candidate-rejected") {
      pendingResearchOwnerSelectionSummary = undefined;
      pendingResearchOwnerSelectionDetails = [];
      pendingResearchOwnerSelectionDiagnosticMs = 0;
      return;
    }
    const summary = pendingResearchOwnerSelectionSummary;
    const details = pendingResearchOwnerSelectionDetails;
    const diagnosticMs = pendingResearchOwnerSelectionDiagnosticMs;
    pendingResearchOwnerSelectionSummary = undefined;
    pendingResearchOwnerSelectionDetails = [];
    pendingResearchOwnerSelectionDiagnosticMs = 0;
    if (summary !== undefined) {
      reportDiagnostic(
        `${summary} observerMs=${diagnosticMs.toFixed(2)} execution=${result.disposition}`,
      );
      for (const detail of details) reportDiagnostic(detail);
    }
  };
  readArpaReadinessEpoch = progression.readProgressionEpoch;
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
    const demandSample = readDemand("Mech");
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
    ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
      ? {
          readTestIntervention: () => {
            const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
            let gatherReadId = 0;
            if (isRecord(hooks)) {
              const previousCount = Number(
                readProperty(hooks, "resourceClaimGatherReadCount"),
              );
              gatherReadId = Number.isFinite(previousCount)
                ? previousCount + 1
                : 1;
              Reflect.set(hooks, "resourceClaimGatherReadCount", gatherReadId);
            }
            const gatherTestHooksValue = readProperty(
              hooks,
              "gatherIntervention",
            );
            const gatherTestHooks = isRecord(gatherTestHooksValue)
              ? gatherTestHooksValue
              : Object.freeze({});
            const resourceClaim = readProperty(
              gatherTestHooks,
              "resourceClaim",
            );
            const rawResourceClaims = readProperty(
              gatherTestHooks,
              "resourceClaims",
            );
            const resourceClaims = Array.isArray(rawResourceClaims)
              ? rawResourceClaims
                  .map((value: unknown) => readAdmittedResourceClaim(value))
                  .filter(
                    (value): value is Readonly<ResourceClaim> =>
                      value !== undefined,
                  )
              : readAdmittedResourceClaim(resourceClaim) === undefined
                ? []
                : [readAdmittedResourceClaim(resourceClaim)!];
            const nativeActionId = readProperty(
              resourceClaim,
              "nativeActionId",
            );
            const claimStatus = readProperty(hooks, "resourceClaimStatus");
            const statusState = readProperty(claimStatus, "state");
            const statusOfferObservationId = readProperty(
              claimStatus,
              "offerObservationId",
            );
            const statusOfferSetIdentity = readProperty(
              claimStatus,
              "offerSetIdentity",
            );
            const currentRootGeneration = progression.readRootGeneration();
            const currentProgressionGeneration =
              progression.readProgressionEpoch();
            const resourceClaimFreshness =
              typeof statusOfferObservationId === "string" &&
              typeof statusOfferSetIdentity === "string"
                ? Object.freeze({
                    rootGeneration: currentRootGeneration,
                    progressionGeneration: currentProgressionGeneration,
                    offerObservationId: statusOfferObservationId,
                    offerSetIdentity: statusOfferSetIdentity,
                  })
                : undefined;
            const currentClaimControl =
              typeof nativeActionId === "string"
                ? pageCapture.controls.resolve(nativeActionId)
                : undefined;
            const observationAvailable =
              statusState === "active" &&
              isRecord(resourceClaim) &&
              resourceClaims.length > 0 &&
              (!Array.isArray(rawResourceClaims) ||
                resourceClaims.length === rawResourceClaims.length) &&
              resourceClaims.every(
                (currentClaim) =>
                  statusOfferObservationId ===
                    currentClaim.offerObservationId &&
                  statusOfferSetIdentity === currentClaim.offerSetIdentity,
              ) &&
              readProperty(claimStatus, "rootGeneration") ===
                currentRootGeneration &&
              readProperty(claimStatus, "progressionGeneration") ===
                currentProgressionGeneration;
            const resourceId = readProperty(resourceClaim, "resourceId");
            let ledgerStatusForGatherCycle = "none";
            const gatherSavingTarget =
              typeof resourceId === "string"
                ? readDemand("pre-Gather").savingTarget
                : undefined;
            const savingResourceCost =
              typeof resourceId === "string"
                ? gatherSavingTarget?.cost[resourceId]
                : undefined;
            const resourceClaimReservations =
              typeof savingResourceCost === "number" &&
              Number.isFinite(savingResourceCost) &&
              savingResourceCost > 0
                ? Object.freeze([
                    Object.freeze({
                      resourceId,
                      poolId: gatherSavingTarget?.pool ?? "anywhere",
                      quantity: savingResourceCost,
                    }),
                  ])
                : Object.freeze([]);
            return Object.freeze({
              ...gatherTestHooks,
              resourceClaimLedgerObserver: (ledger: unknown) => {
                ledgerStatusForGatherCycle = String(
                  readProperty(ledger, "status") ?? "unavailable",
                );
                const hooks = readProperty(
                  settingsHostWindow,
                  "__EA_TEST_HOOKS__",
                );
                const currentStatus = readProperty(
                  hooks,
                  "resourceClaimStatus",
                );
                if (
                  isRecord(hooks) &&
                  isRecord(currentStatus) &&
                  readProperty(currentStatus, "state") === "active" &&
                  (ledgerStatusForGatherCycle === "stale" ||
                    ledgerStatusForGatherCycle === "unavailable")
                )
                  Reflect.set(
                    hooks,
                    "resourceClaimStatus",
                    Object.freeze({
                      ...currentStatus,
                      state: "suspended" satisfies ResourceClaimLifecycleState,
                      reason: `gather-ledger-${ledgerStatusForGatherCycle}`,
                    }),
                  );
                if (isRecord(hooks))
                  Reflect.set(
                    hooks,
                    "resourceClaimLedgerLast",
                    ledger === undefined
                      ? Object.freeze({ status: "no-ledger" })
                      : ledger,
                  );
                if (isRecord(hooks)) {
                  const events = readProperty(
                    hooks,
                    "resourceClaimLedgerEvents",
                  );
                  const history = Array.isArray(events) ? events : [];
                  history.push(
                    Object.freeze({
                      gatherRead: readProperty(
                        hooks,
                        "resourceClaimGatherReadCount",
                      ),
                      gatherReadId,
                      ledgerStatusForGatherCycle,
                      claimState: readProperty(
                        readProperty(hooks, "resourceClaimStatus"),
                        "state",
                      ),
                      claimReason: readProperty(
                        readProperty(hooks, "resourceClaimStatus"),
                        "reason",
                      ),
                      currentMana:
                        readProperty(ledger, "currentStock") ??
                        readProperty(
                          readProperty(
                            readProperty(
                              pageCapture.rootState.readRoot(),
                              "resource",
                            ),
                            "Mana",
                          ),
                          "amount",
                        ),
                      reservedCurrentStock: readProperty(
                        ledger,
                        "currentStockReserved",
                      ),
                      remainingAccumulation: readProperty(
                        ledger,
                        "remainingAccumulation",
                      ),
                      spendableStock: readProperty(ledger, "spendableStock"),
                      status: readProperty(ledger, "status"),
                      reasons: readProperty(ledger, "reasons"),
                      claimControlBinding: readProperty(
                        resourceClaim,
                        "controlBinding",
                      ),
                      currentControlBinding:
                        currentClaimControl === undefined
                          ? undefined
                          : Object.freeze({
                              elementId: currentClaimControl.elementId,
                              generation: currentClaimControl.generation,
                              actionCapable:
                                currentClaimControl.methods.includes("action"),
                            }),
                    }),
                  );
                  Reflect.set(hooks, "resourceClaimLedgerEvents", history);
                }
                if (isRecord(hooks))
                  Reflect.set(
                    hooks,
                    "resourceClaimGenerationLast",
                    Object.freeze({
                      claimRootGeneration: readProperty(
                        resourceClaim,
                        "rootGeneration",
                      ),
                      claimProgressionGeneration: readProperty(
                        resourceClaim,
                        "progressionGeneration",
                      ),
                      claimControlBinding: readProperty(
                        resourceClaim,
                        "controlBinding",
                      ),
                      freshness: resourceClaimFreshness,
                    }),
                  );
              },
              resourceClaimDecisionObserver: (decision: unknown) => {
                const hooks = readProperty(
                  settingsHostWindow,
                  "__EA_TEST_HOOKS__",
                );
                if (isRecord(hooks))
                  Reflect.set(hooks, "resourceClaimDecisionLast", decision);
                if (isRecord(hooks)) {
                  const events = readProperty(
                    hooks,
                    "resourceClaimDecisionEvents",
                  );
                  const history = Array.isArray(events) ? events : [];
                  history.push(
                    isRecord(decision)
                      ? Object.freeze({
                          ...decision,
                          cycle: automationCycle,
                          gatherReadId,
                          ledgerStatus: ledgerStatusForGatherCycle,
                        })
                      : decision,
                  );
                  Reflect.set(hooks, "resourceClaimDecisionEvents", history);
                }
              },
              resourceClaimActionObserver: (event: unknown) => {
                const hooks = readProperty(
                  settingsHostWindow,
                  "__EA_TEST_HOOKS__",
                );
                if (isRecord(hooks)) {
                  const events = readProperty(
                    hooks,
                    "resourceClaimActionEvents",
                  );
                  const history = Array.isArray(events) ? events : [];
                  history.push(
                    isRecord(event)
                      ? Object.freeze({
                          ...event,
                          cycle: automationCycle,
                          gatherReadId,
                          ledgerStatus: ledgerStatusForGatherCycle,
                        })
                      : event,
                  );
                  Reflect.set(hooks, "resourceClaimActionEvents", history);
                }
              },
              resourceClaimFreshness,
              resourceClaimControlBinding:
                currentClaimControl === undefined
                  ? undefined
                  : Object.freeze({
                      elementId: currentClaimControl.elementId,
                      generation: currentClaimControl.generation,
                      actionCapable:
                        currentClaimControl.methods.includes("action"),
                    }),
              resourceClaimObservationAvailable: observationAvailable === true,
              resourceClaimReservations,
            });
          },
        }
      : {}),
  });
  const refreshResourceClaim = (
    ownerObservation?: Readonly<{
      offers: readonly Readonly<OfferedTech>[] | undefined;
      rootGeneration: number;
      progressionGeneration: string;
      routeIdentity: string | undefined;
      contextStable: boolean;
    }>,
  ) => {
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ !== true
    )
      return;
    const testHooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    const intervention = readProperty(testHooks, "gatherIntervention");
    if (isRecord(testHooks)) {
      const previousCount = Number(
        readProperty(testHooks, "resourceClaimRefreshCount"),
      );
      Reflect.set(
        testHooks,
        "resourceClaimRefreshCount",
        Number.isFinite(previousCount) ? previousCount + 1 : 1,
      );
    }
    const previousClaim = readAdmittedResourceClaim(
      readProperty(intervention, "resourceClaim"),
    );
    if (!isRecord(testHooks) || !isRecord(intervention)) return;
    const previousClaimsValue = readProperty(intervention, "resourceClaims");
    const previousClaims = Array.isArray(previousClaimsValue)
      ? previousClaimsValue
          .map((value: unknown) => readAdmittedResourceClaim(value))
          .filter(
            (value): value is Readonly<ResourceClaim> => value !== undefined,
          )
      : previousClaim === undefined
        ? []
        : [previousClaim];
    const replaceTestClaims = (claims: readonly Readonly<ResourceClaim>[]) =>
      Reflect.set(testHooks, "gatherIntervention", {
        ...intervention,
        resourceClaim: claims[0],
        resourceClaims: [...claims],
      });
    const replaceTestClaim = (claim: Readonly<ResourceClaim> | undefined) =>
      replaceTestClaims(claim === undefined ? [] : [claim]);
    const setTestClaimStatus = (
      state: ResourceClaimLifecycleState,
      reason: string,
      evidence: Readonly<Record<string, unknown>> = {},
    ) => {
      const previousUnavailableCount = Number(
        readProperty(testHooks, "resourceClaimUnavailableCount"),
      );
      const unavailableCount =
        state === "suspended"
          ? (Number.isSafeInteger(previousUnavailableCount) &&
            previousUnavailableCount >= 0
              ? previousUnavailableCount
              : 0) + 1
          : 0;
      Reflect.set(testHooks, "resourceClaimUnavailableCount", unavailableCount);
      if (state === "suspended" && unavailableCount >= 3)
        evidence = { ...evidence, recoveryRequired: true, unavailableCount };
      const status = Object.freeze({
        cycle: automationCycle,
        state,
        reason,
        previousOfferObservationId: previousClaim?.offerObservationId,
        previousOfferSetIdentity: previousClaim?.offerSetIdentity,
        ...evidence,
      });
      Reflect.set(testHooks, "resourceClaimStatus", status);
      const events = readProperty(testHooks, "resourceClaimLifecycleEvents");
      const history = Array.isArray(events) ? events : [];
      history.push(status);
      Reflect.set(testHooks, "resourceClaimLifecycleEvents", history);
    };
    const resourceClaimMode = readProperty(intervention, "resourceClaimMode");
    if (resourceClaimMode === "owner-unavailable") {
      setTestClaimStatus("suspended", "research-owner-observation-unavailable");
      return;
    }
    if (resourceClaimMode === "offer-disappeared") {
      replaceTestClaim(undefined);
      setTestClaimStatus("released", "native-offer-disappeared");
      return;
    }
    if (resourceClaimMode === "goal-cancelled") {
      replaceTestClaim(undefined);
      setTestClaimStatus("invalidated", "selected-goal-changed");
      return;
    }
    if (
      previousClaim === undefined ||
      resourceClaimMode === "goal-derived" ||
      resourceClaimMode === "goal-derived-single" ||
      resourceClaimMode === "goal-derived-conjunctive"
    ) {
      if (
        resourceClaimMode === "goal-derived" ||
        resourceClaimMode === "goal-derived-single" ||
        resourceClaimMode === "goal-derived-conjunctive"
      ) {
        if (ownerObservation === undefined) {
          setTestClaimStatus(
            "suspended",
            "research-owner-observation-unavailable",
          );
          return;
        }
        const priorClaims = previousClaims;
        const root = pageCapture.rootState.readRoot();
        const settings = settingsStore.readRaw();
        const offers = ownerObservation.offers;
        const definitions = progression.readResearchActionDefinitions();
        const rootGeneration = progression.readRootGeneration();
        const progressionGeneration = progression.readProgressionEpoch();
        const routeIdentity = readEvolveRouteIdentity(root);
        const currentOfferSetIdentity =
          offers?.[0]?.offerSetIdentity ??
          (offers?.length === 0 ? JSON.stringify([]) : undefined);
        const currentOfferObservationId =
          offers?.[0]?.offerObservationId ??
          (offers?.length === 0
            ? `research-owner-${automationCycle}`
            : undefined);
        const coherentOfferSet =
          ownerObservation.contextStable &&
          ownerObservation.rootGeneration === rootGeneration &&
          ownerObservation.progressionGeneration === progressionGeneration &&
          ownerObservation.routeIdentity !== undefined &&
          ownerObservation.routeIdentity === routeIdentity &&
          currentOfferSetIdentity !== undefined &&
          currentOfferObservationId !== undefined &&
          offers !== undefined &&
          offers.every(
            (entry) =>
              entry.offerSetIdentity === currentOfferSetIdentity &&
              entry.offerObservationId === currentOfferObservationId,
          );
        const selectionRecord = (
          status: string,
          reason: string,
          candidates: readonly string[] = [],
          evidence: Readonly<Record<string, unknown>> = {},
        ) => {
          const selection = Object.freeze({
            cycle: automationCycle,
            status,
            reason,
            candidates,
            ...evidence,
          });
          Reflect.set(testHooks, "resourceClaimSelection", selection);
          const events = readProperty(
            testHooks,
            "resourceClaimSelectionEvents",
          );
          const history = Array.isArray(events) ? events : [];
          history.push(selection);
          Reflect.set(testHooks, "resourceClaimSelectionEvents", history);
        };
        if (
          priorClaims.length > 0 &&
          priorClaims.some((claim) => claim.rootGeneration !== rootGeneration)
        ) {
          replaceTestClaims([]);
          selectionRecord("unavailable", "claim root generation changed");
          setTestClaimStatus("invalidated", "root-replaced");
          return;
        }
        if (!isRecord(root) || !isRecord(settings)) {
          selectionRecord(
            "unavailable",
            "root or Research settings observation is unavailable",
          );
          setTestClaimStatus(
            "suspended",
            "root-or-research-settings-unavailable",
          );
          return;
        }
        if (
          settings["prestigeType"] !== "mad" ||
          settings["autoResearch"] !== true ||
          settings["autoTrigger"] === true
        ) {
          replaceTestClaims([]);
          selectionRecord(
            "invalidated",
            "MAD goal or Research permission is no longer current",
          );
          setTestClaimStatus(
            "invalidated",
            "research-permission-or-goal-unavailable",
          );
          return;
        }
        const queueStates = (["queue", "r_queue"] as const).map((queueId) => {
          const entries = readProperty(readProperty(root, queueId), "queue");
          return !Array.isArray(entries)
            ? "unknown"
            : entries.length > 0
              ? "player-committed"
              : "empty";
        });
        const queueEvidence = queueStates.every((state) => state === "empty");
        if (
          !queueEvidence ||
          offers === undefined ||
          definitions === undefined
        ) {
          if (queueStates.includes("player-committed")) {
            replaceTestClaims([]);
            selectionRecord("invalidated", "player-committed queue is active");
            setTestClaimStatus("invalidated", "player-queue-present");
            return;
          }
          replaceTestClaims(priorClaims);
          selectionRecord(
            "unavailable",
            "current native offers, definitions, or empty player queues are unavailable",
          );
          setTestClaimStatus(
            "suspended",
            "research-owner-observation-or-queue-unavailable",
          );
          return;
        }
        const offerGenerations = new Map(
          offers.map((offer) => [offer.elementId, offer.generation]),
        );
        const grantLevels = readResearchGrantLevels(root, definitions);
        const applicability = readCapturedTechApplicability(root, definitions);
        const prerequisiteDefinitions = definitions.map((definition) => {
          const computedPrerequisites =
            readFreshCapturedComputedTechRequirements(definition, {
              rootGeneration,
              progressionEpoch: progressionGeneration,
            });
          return {
            actionId: definition.actionId,
            grantTechnology: definition.grantTechnology,
            grantLevel: definition.grantLevel,
            prerequisites: computedPrerequisites ?? definition.prerequisites,
            hasNativeCondition: definition.eligibility.hasNativeCondition,
            routeRestrictions: definition.eligibility.routeRestrictions,
            restrictions: definition.eligibility.restrictions,
          };
        });
        const graph = planNativeResearchPrerequisites({
          targetActionId: CAPTURED_MAD_RESEARCH_TECH,
          definitions: prerequisiteDefinitions,
          grantLevels,
          ...(applicability === undefined
            ? {}
            : { applicabilityByActionId: applicability }),
          offeredActionIds: new Set(offers.map((offer) => offer.elementId)),
          offerGenerations,
          cycle: automationCycle,
          progressionEpoch: progressionGeneration,
          rootGeneration,
          maxDepth: 16,
          maxActions: 256,
        });
        const resourceSource = createCapturedResourceSource(
          pageCapture.rootState,
        );
        const nonManaAffordableByAction = new Map<
          string,
          boolean | undefined
        >();
        const evaluation = evaluateResearchGoalCandidates({
          goalId: "prestige:mad",
          targetActionId: CAPTURED_MAD_RESEARCH_TECH,
          goalSatisfied: graph.targetStatus === "satisfied",
          graph,
          cycle: automationCycle,
          progressionEpoch: progressionGeneration,
          rootGeneration,
          offers: offers.map((offer, index) => {
            const sample = resourceSource.readResources(
              Object.keys(offer.cost),
            );
            const nonManaCost = Object.fromEntries(
              Object.entries(offer.cost).filter(
                ([resourceId]) => resourceId !== "Mana",
              ),
            );
            nonManaAffordableByAction.set(
              offer.elementId,
              sample === undefined ? undefined : canAfford(sample, nonManaCost),
            );
            const eligibility =
              progression.readResearchOwnerOfferEligibility?.(offer);
            return {
              actionId: offer.elementId,
              grantTechnology: offer.grantTechnology,
              grantLevel: offer.grantLevel,
              index,
              generation: offer.generation,
              cost: offer.cost,
              nativeAffordable: offer.nativeAffordable,
              resourceAffordable:
                sample === undefined
                  ? undefined
                  : canAfford(sample, offer.cost),
              hasCostConflict: queueEvidence ? false : undefined,
              reservationEvidence: queueEvidence
                ? ("none" as const)
                : ("unavailable" as const),
              hasExplicitExclusion:
                eligibility === "eligible"
                  ? false
                  : eligibility === "excluded"
                    ? true
                    : undefined,
              explicitExclusionEvidence:
                eligibility === "eligible"
                  ? ("none" as const)
                  : eligibility === "excluded"
                    ? ("excluded" as const)
                    : ("unavailable" as const),
            };
          }),
          baselineSelectedActionId: undefined,
        });
        const conjunctiveMode =
          resourceClaimMode === "goal-derived-conjunctive";
        const mandatoryPlan = conjunctiveMode
          ? classifyMandatoryNativeResearchObligations(graph, {
              targetEligibility: bindNativeResearchEligibilityEvidence(graph, {
                actionId: CAPTURED_MAD_RESEARCH_TECH,
                ...combineCapturedTechEligibility([
                  applicability?.get(CAPTURED_MAD_RESEARCH_TECH) ?? {
                    status: "unknown",
                    reasons: ["current Research applicability is unavailable"],
                  },
                  readCapturedMadTargetCondition(root),
                ]),
              }),
              definitions: prerequisiteDefinitions,
              grantLevels,
              applicabilityByActionId: applicability,
              offeredActionIds: new Set(offers.map((offer) => offer.elementId)),
            })
          : classifyMandatoryResearchPrerequisiteObligations(
              graph,
              applicability?.get(CAPTURED_MAD_RESEARCH_TECH)?.status ===
                "eligible" &&
                readCapturedMadTargetCondition(root).status === "eligible",
            );
        const mandatoryOfferEvidence = mandatoryPlan.mandatoryActionIds.map(
          (actionId) => {
            const offer = offers.find((entry) => entry.elementId === actionId);
            const candidate = evaluation.candidates.find(
              (entry) => entry.actionId === actionId,
            );
            const sample =
              offer === undefined
                ? undefined
                : resourceSource.readResources(
                    Object.keys(offer.cost).filter(
                      (resourceId) => resourceId !== "Mana",
                    ),
                  );
            const nonManaCost = offer
              ? Object.fromEntries(
                  Object.entries(offer.cost).filter(
                    ([resourceId]) => resourceId !== "Mana",
                  ),
                )
              : undefined;
            return {
              actionId,
              dependencyRelation: candidate?.dependencyRelation,
              pathApplicability: candidate?.pathApplicability,
              actionability: candidate?.actionability,
              resourceAffordability: candidate?.resourceAffordability,
              cost: offer?.cost,
              manaRequired: offer?.cost.Mana,
              nonManaAffordable:
                sample === undefined || nonManaCost === undefined
                  ? undefined
                  : canAfford(sample, nonManaCost),
              frontier: graph.actionableFrontier.includes(actionId),
              offerObservationId: offer?.offerObservationId,
              offerSetIdentity: offer?.offerSetIdentity,
              controlGeneration:
                pageCapture.controls.resolve(actionId)?.generation,
              offerGeneration: offer?.generation,
              ownerEligibility:
                offer === undefined
                  ? undefined
                  : progression.readResearchOwnerOfferEligibility?.(offer),
            };
          },
        );
        const reconciledPriorClaims = [] as Readonly<ResourceClaim>[];
        const releasedPriorClaims: { actionId: string; reason: string }[] = [];
        const completedPriorClaimIds: string[] = [];
        if (conjunctiveMode && mandatoryPlan.status === "verified") {
          for (const priorClaim of priorClaims) {
            const grant = grantLevels?.get(priorClaim.targetGrantTechnology);
            const currentOffer = offers.find(
              (entry) => entry.elementId === priorClaim.nativeActionId,
            );
            const nonManaCost = currentOffer
              ? Object.fromEntries(
                  Object.entries(currentOffer.cost).filter(
                    ([resourceId]) => resourceId !== "Mana",
                  ),
                )
              : undefined;
            const nonManaSample =
              currentOffer === undefined
                ? undefined
                : resourceSource.readResources(Object.keys(nonManaCost ?? {}));
            const currentControl = currentOffer
              ? pageCapture.controls.resolve(currentOffer.elementId)
              : undefined;
            let lifecycle:
              ReturnType<typeof decideResourceClaimLifecycle> | undefined;
            if (__EA_TEST_SURFACE_ENABLED__ === true)
              lifecycle = decideResourceClaimLifecycle({
                goal: "active",
                permission: "enabled",
                queues: "empty",
                root:
                  priorClaim.rootGeneration === rootGeneration
                    ? "current"
                    : "replaced",
                progression:
                  priorClaim.progressionGeneration === progressionGeneration
                    ? "current"
                    : "changed",
                obligation: mandatoryPlan.mandatoryActionIds.includes(
                  priorClaim.nativeActionId,
                )
                  ? "mandatory"
                  : "not-mandatory",
                grant:
                  grant === undefined
                    ? "unknown"
                    : grant >= priorClaim.targetGrantLevel
                      ? "complete"
                      : "incomplete",
                offerSet: {
                  status: coherentOfferSet ? "complete-fresh" : "incomplete",
                  identity: currentOfferSetIdentity,
                  observationId: currentOfferObservationId,
                  previousObservationId: priorClaim.offerObservationId,
                },
                previousContext: {
                  rootGeneration: priorClaim.rootGeneration,
                  progressionGeneration: priorClaim.progressionGeneration,
                },
                currentContext: {
                  rootGeneration,
                  progressionGeneration,
                  routeIdentity,
                },
                currentObservation: {
                  status: coherentOfferSet ? "validated" : "incomplete",
                  rootGeneration: ownerObservation.rootGeneration,
                  progressionGeneration: ownerObservation.progressionGeneration,
                  routeIdentity: ownerObservation.routeIdentity,
                  offerSetIdentity: currentOfferSetIdentity,
                  observationId: currentOfferObservationId,
                  actionId: currentOffer?.elementId,
                  manaPrice: currentOffer?.cost.Mana,
                  offerGeneration: currentOffer?.generation,
                  controlGeneration: currentControl?.generation,
                  resources:
                    currentOffer !== undefined &&
                    nonManaSample !== undefined &&
                    nonManaCost !== undefined &&
                    Object.entries(nonManaCost).every(
                      ([resourceId, cost]) =>
                        Number.isFinite(cost) &&
                        Number.isFinite(
                          nonManaSample.resources.get(resourceId)?.amount,
                        ),
                    )
                      ? "complete"
                      : "unknown",
                },
                nativeActionId: priorClaim.nativeActionId,
                offer: currentOffer === undefined ? "absent" : "current",
                price:
                  currentOffer === undefined
                    ? "unknown"
                    : currentOffer.cost.Mana === priorClaim.observedNativePrice
                      ? "current"
                      : "changed",
                binding:
                  currentOffer === undefined || currentControl === undefined
                    ? "unknown"
                    : currentControl.generation === currentOffer.generation &&
                        priorClaim.controlBinding.generation ===
                          currentControl.generation
                      ? "current"
                      : "changed",
                nonMana:
                  nonManaSample === undefined || nonManaCost === undefined
                    ? "unknown"
                    : canAfford(nonManaSample, nonManaCost)
                      ? "affordable"
                      : "insufficient",
              });
            if (
              __EA_TEST_SURFACE_ENABLED__ === true &&
              lifecycle !== undefined
            ) {
              const hooks = readProperty(
                settingsHostWindow,
                "__EA_TEST_HOOKS__",
              );
              if (isRecord(hooks)) {
                const priorEvents = readProperty(
                  hooks,
                  "resourceClaimLifecycleEvidenceEvents",
                );
                const events = Array.isArray(priorEvents) ? priorEvents : [];
                events.push({
                  cycle: automationCycle,
                  actionId: priorClaim.nativeActionId,
                  state: lifecycle.state,
                  reason: lifecycle.reason,
                  previousRootGeneration: priorClaim.rootGeneration,
                  currentRootGeneration: rootGeneration,
                  previousProgressionGeneration:
                    priorClaim.progressionGeneration,
                  currentProgressionGeneration: progressionGeneration,
                  progression:
                    priorClaim.progressionGeneration === progressionGeneration
                      ? "current"
                      : "changed",
                  previousOfferSetIdentity: priorClaim.offerSetIdentity,
                  previousOfferObservationId: priorClaim.offerObservationId,
                  currentOfferSetIdentity,
                  offerObservationId: currentOfferObservationId,
                  routeIdentity,
                  currentOfferActionId: currentOffer?.elementId,
                  currentOfferCost: currentOffer?.cost,
                  offerGeneration: currentOffer?.generation,
                  controlGeneration: currentControl?.generation,
                  priorEvidenceCurrent:
                    priorClaim.rootGeneration === rootGeneration &&
                    priorClaim.progressionGeneration ===
                      progressionGeneration &&
                    priorClaim.offerSetIdentity === currentOfferSetIdentity &&
                    priorClaim.offerObservationId ===
                      currentOfferObservationId &&
                    priorClaim.controlBinding.generation ===
                      currentControl?.generation,
                  nonManaResources:
                    currentOffer === undefined ||
                    nonManaSample === undefined ||
                    nonManaCost === undefined
                      ? undefined
                      : Object.fromEntries(
                          Object.entries(nonManaCost).map(
                            ([resourceId, required]) => [
                              resourceId,
                              {
                                available:
                                  nonManaSample.resources.get(resourceId)
                                    ?.amount,
                                required,
                              },
                            ],
                          ),
                        ),
                  nonMana:
                    nonManaSample === undefined || nonManaCost === undefined
                      ? "unknown"
                      : canAfford(nonManaSample, nonManaCost)
                        ? "affordable"
                        : "insufficient",
                  currentContextStable: coherentOfferSet,
                });
                Reflect.set(
                  hooks,
                  "resourceClaimLifecycleEvidenceEvents",
                  events,
                );
              }
            }
            if (lifecycle === undefined) {
              reconciledPriorClaims.push(priorClaim);
              continue;
            }
            if (lifecycle.state === "completed") {
              completedPriorClaimIds.push(priorClaim.nativeActionId);
            } else if (lifecycle.state === "released") {
              releasedPriorClaims.push({
                actionId: priorClaim.nativeActionId,
                reason: lifecycle.reason,
              });
            } else if (lifecycle.retainClaim) {
              reconciledPriorClaims.push(priorClaim);
            }
          }
        } else {
          reconciledPriorClaims.push(...priorClaims);
        }
        const mandatoryManaCandidates = evaluation.candidates.filter(
          (candidate) => {
            const offer = offers.find(
              (entry) => entry.elementId === candidate.actionId,
            );
            return (
              (!conjunctiveMode ||
                (mandatoryPlan.status === "verified" &&
                  mandatoryPlan.mandatoryActionIds.includes(
                    candidate.actionId,
                  ))) &&
              offer !== undefined &&
              typeof offer.cost.Mana === "number" &&
              offer.cost.Mana > 0
            );
          },
        );
        const eligibleCandidates = evaluation.candidates.filter((candidate) => {
          const offer = offers.find(
            (entry) => entry.elementId === candidate.actionId,
          );
          const control = pageCapture.controls.resolve(candidate.actionId);
          const mana = resourceSource
            .readResources(["Mana"])
            ?.resources.get("Mana");
          return (
            (!conjunctiveMode ||
              (mandatoryPlan.status === "verified" &&
                mandatoryPlan.mandatoryActionIds.includes(
                  candidate.actionId,
                ))) &&
            candidate.relevance === "verified-prerequisite" &&
            candidate.dependencyRelation === "declared-prerequisite" &&
            candidate.pathApplicability === "eligible" &&
            candidate.actionability === "current-native-offer" &&
            candidate.evidenceFresh &&
            hasVerifiedNonManaAffordabilityForManaOffer(
              candidate.cost,
              nonManaAffordableByAction.get(candidate.actionId),
            ) &&
            graph.actionableFrontier.includes(candidate.actionId) &&
            candidate.reservationEvidence === "none" &&
            candidate.explicitExclusionEvidence === "none" &&
            offer !== undefined &&
            offer.cost.Mana !== undefined &&
            offer.cost.Mana > 0 &&
            mana !== undefined &&
            (conjunctiveMode
              ? candidate.nativeAffordable || mana.amount < offer.cost.Mana
              : candidate.nativeAffordable === false &&
                candidate.resourceAffordability === "insufficient" &&
                mana.amount < offer.cost.Mana) &&
            mana.max >= offer.cost.Mana &&
            progression.readResearchOwnerOfferEligibility?.(offer) ===
              "eligible" &&
            control !== undefined &&
            control.elementId === offer.elementId &&
            control.generation === offer.generation &&
            control.methods.includes("action")
          );
        });
        const allMandatoryManaCandidatesVerified =
          mandatoryManaCandidates.length === eligibleCandidates.length &&
          eligibleCandidates.every((candidate) =>
            mandatoryManaCandidates.some(
              (required) => required.actionId === candidate.actionId,
            ),
          );
        const priorObligationStillMandatory = priorClaims.some(
          (claim) =>
            (grantLevels?.get(claim.targetGrantTechnology) ?? 0) <
              claim.targetGrantLevel &&
            mandatoryPlan.mandatoryActionIds.includes(claim.nativeActionId),
        );
        if (
          conjunctiveMode &&
          mandatoryPlan.status === "verified" &&
          mandatoryManaCandidates.length === 0 &&
          !priorObligationStillMandatory
        ) {
          replaceTestClaims([]);
          setTestClaimStatus(
            priorClaims.length > 0 &&
              priorClaims.every(
                (claim) =>
                  (grantLevels?.get(claim.targetGrantTechnology) ?? 0) >=
                  claim.targetGrantLevel,
              )
              ? "completed"
              : "released",
            "no-current-mandatory-Mana-obligations",
            {
              completedActionIds: priorClaims.map(
                (claim) => claim.nativeActionId,
              ),
            },
          );
          selectionRecord(
            "released",
            "verified prerequisite paths no longer require a Mana claim",
            mandatoryPlan.mandatoryActionIds,
            {
              mandatoryActionIds: mandatoryPlan.mandatoryActionIds,
              alternativeGroups: mandatoryPlan.alternativeGroups,
            },
          );
          return;
        }
        if (
          (conjunctiveMode && mandatoryPlan.status !== "verified") ||
          eligibleCandidates.length === 0 ||
          (!conjunctiveMode && eligibleCandidates.length !== 1) ||
          !allMandatoryManaCandidatesVerified
        ) {
          const ids = eligibleCandidates.map((candidate) => candidate.actionId);
          const legacyAmbiguous =
            !conjunctiveMode && eligibleCandidates.length > 1;
          replaceTestClaims(reconciledPriorClaims);
          const verifiedReleaseOnly =
            conjunctiveMode &&
            mandatoryPlan.status === "verified" &&
            eligibleCandidates.length === 0 &&
            reconciledPriorClaims.length === 0 &&
            (releasedPriorClaims.length > 0 ||
              completedPriorClaimIds.length > 0);
          if (verifiedReleaseOnly) {
            const blockedActionIds = releasedPriorClaims
              .filter((entry) => entry.reason === "verified-non-mana-shortage")
              .map((entry) => entry.actionId);
            setTestClaimStatus(
              completedPriorClaimIds.length > 0 &&
                blockedActionIds.length === 0 &&
                releasedPriorClaims.length === 0
                ? "completed"
                : "released",
              blockedActionIds.length > 0
                ? "verified-non-mana-shortage"
                : "verified-claim-completion-or-release",
              {
                completedActionIds: completedPriorClaimIds,
                releasedActionIds: releasedPriorClaims.map(
                  (entry) => entry.actionId,
                ),
                blockedActionIds,
                mandatoryActionIds: mandatoryPlan.mandatoryActionIds,
                evaluatedCandidates: mandatoryOfferEvidence,
              },
            );
            selectionRecord(
              "released",
              blockedActionIds.length > 0
                ? "mandatory obligation retained; Mana protection released for verified non-Mana shortage"
                : "verified prior claim completed or no longer relevant",
              mandatoryPlan.mandatoryActionIds,
              {
                completedActionIds: completedPriorClaimIds,
                releasedActionIds: releasedPriorClaims.map(
                  (entry) => entry.actionId,
                ),
                blockedActionIds,
                mandatoryActionIds: mandatoryPlan.mandatoryActionIds,
                evaluatedCandidates: mandatoryOfferEvidence,
              },
            );
            return;
          }
          setTestClaimStatus(
            "suspended",
            legacyAmbiguous
              ? "goal-prerequisite-selection-ambiguous"
              : "goal-prerequisite-selection-unavailable",
          );
          selectionRecord(
            legacyAmbiguous ? "ambiguous" : "unavailable",
            legacyAmbiguous
              ? "multiple verified prerequisite offers require Mana"
              : mandatoryPlan.status === "verified" && conjunctiveMode
                ? "no mandatory current Mana-blocked prerequisite offer"
                : "native prerequisite graph cannot prove mandatory obligations",
            ids,
            {
              researchPermission: true,
              playerQueues: "empty",
              nativeOfferCount: offers.length,
              offerObservationId: offers[0]?.offerObservationId,
              offerSetIdentity: offers[0]?.offerSetIdentity,
              mandatoryActionIds: mandatoryPlan.mandatoryActionIds,
              alternativeGroups: mandatoryPlan.alternativeGroups,
              prerequisiteReasons: mandatoryPlan.reasons,
              rootGeneration,
              progressionGeneration,
              evaluatedCandidates: evaluation.candidates
                .filter(
                  (candidate) =>
                    candidate.dependencyRelation !== "none" ||
                    candidate.relevance === "unavailable",
                )
                .map((candidate) => {
                  const offer = offers.find(
                    (entry) => entry.elementId === candidate.actionId,
                  );
                  const mana = resourceSource
                    .readResources(["Mana"])
                    ?.resources.get("Mana");
                  const nonManaSample =
                    offer === undefined
                      ? undefined
                      : resourceSource.readResources(
                          Object.keys(offer.cost).filter(
                            (resourceId) => resourceId !== "Mana",
                          ),
                        );
                  const control = pageCapture.controls.resolve(
                    candidate.actionId,
                  );
                  return {
                    actionId: candidate.actionId,
                    relevance: candidate.relevance,
                    dependencyRelation: candidate.dependencyRelation,
                    pathApplicability: candidate.pathApplicability,
                    actionability: candidate.actionability,
                    evidenceFresh: candidate.evidenceFresh,
                    resourceAffordability: candidate.resourceAffordability,
                    reservationEvidence: candidate.reservationEvidence,
                    exclusionEvidence: candidate.explicitExclusionEvidence,
                    reasons: candidate.reasons,
                    cost: offer?.cost,
                    manaAmount: mana?.amount,
                    manaRequired: offer?.cost.Mana,
                    nonManaAffordable:
                      nonManaSample === undefined || offer === undefined
                        ? undefined
                        : canAfford(
                            nonManaSample,
                            Object.fromEntries(
                              Object.entries(offer.cost).filter(
                                ([resourceId]) => resourceId !== "Mana",
                              ),
                            ),
                          ),
                    frontier: graph.actionableFrontier.includes(
                      candidate.actionId,
                    ),
                    offerObservationId: offer?.offerObservationId,
                    offerSetIdentity: offer?.offerSetIdentity,
                    controlGeneration: control?.generation,
                    offerGeneration: offer?.generation,
                    ownerEligibility:
                      offer === undefined
                        ? undefined
                        : progression.readResearchOwnerOfferEligibility?.(
                            offer,
                          ),
                  };
                }),
            },
          );
          return;
        }
        const claimsEvidence = eligibleCandidates.flatMap((candidate) => {
          const offer = offers.find(
            (entry) => entry.elementId === candidate.actionId,
          );
          const control =
            offer === undefined
              ? undefined
              : pageCapture.controls.resolve(offer.elementId);
          const mana = resourceSource
            .readResources(["Mana"])
            ?.resources.get("Mana");
          if (
            offer === undefined ||
            control === undefined ||
            mana === undefined ||
            typeof offer.offerObservationId !== "string" ||
            offer.offerObservationId === "" ||
            typeof offer.offerSetIdentity !== "string" ||
            offer.offerSetIdentity === ""
          )
            return [];
          return [
            {
              terminalGoalId: "prestige:mad",
              immediateGoalId: `research:${offer.elementId}`,
              owner: "goal-planner",
              provenance: "verified-native-prerequisite" as const,
              prerequisiteRelation: "verified" as const,
              nativeActionId: offer.elementId,
              targetGrantTechnology: offer.grantTechnology,
              targetGrantLevel: offer.grantLevel,
              resourceId: "Mana",
              poolId: "anywhere",
              requiredQuantity: offer.cost.Mana ?? Number.NaN,
              observedStock: mana.amount,
              observedCapacity: mana.max,
              observedNativePrice: offer.cost.Mana ?? Number.NaN,
              offerSetIdentity: offer.offerSetIdentity,
              offerObservationId: offer.offerObservationId,
              controlBinding: Object.freeze({
                elementId: control.elementId,
                generation: control.generation,
              }),
              offerBindingGeneration: offer.generation,
              nativeOfferCurrent: true,
              nativeActionEligible: true,
              researchPermission: true,
              queueEvidence: "empty" as const,
              rootGeneration,
              progressionGeneration,
              observationValid:
                pageCapture.rootState.readRoot() === root &&
                progression.readRootGeneration() === rootGeneration &&
                progression.readProgressionEpoch() === progressionGeneration &&
                offers.every(
                  (entry) =>
                    pageCapture.controls.resolve(entry.elementId)
                      ?.generation === entry.generation,
                ) &&
                pageCapture.controls.resolve(offer.elementId)?.generation ===
                  control.generation,
              precedence: "terminal-prerequisite" as const,
              allocationAuthority: { kind: "independent" as const },
              forecastProductionPerSecond: undefined,
              uncertaintyReasons: [],
              unavailableReasons: [],
            },
          ];
        });
        const claimPlan = planIndependentResearchResourceClaims(claimsEvidence);
        const claims = claimPlan.claims;
        const claim = claims[0];
        const offer =
          claim === undefined
            ? undefined
            : offers.find((entry) => entry.elementId === claim.nativeActionId);
        const control =
          offer === undefined
            ? undefined
            : pageCapture.controls.resolve(offer.elementId);
        if (
          claimPlan.status !== "available" ||
          claims.length !== eligibleCandidates.length ||
          claim === undefined ||
          offer === undefined ||
          control === undefined
        ) {
          replaceTestClaims(reconciledPriorClaims);
          selectionRecord(
            "unavailable",
            "one or more independent native offer claims lack current evidence",
            eligibleCandidates.map((candidate) => candidate.actionId),
            { claimReasons: claimPlan.reasons },
          );
          setTestClaimStatus(
            "suspended",
            "goal-prerequisite-claim-evidence-unavailable",
          );
          return;
        }
        selectionRecord(
          "selected",
          "independent current verified native prerequisite obligations",
          claims.map((entry) => entry.nativeActionId),
          {
            researchPermission: true,
            playerQueues: "empty",
            nativeOfferCount: offers.length,
            rootGeneration,
            progressionGeneration,
            terminalGoalId: "prestige:mad",
            claims: claims.map((entry) => ({
              immediateGoalId: entry.immediateGoalId,
              nativeActionId: entry.nativeActionId,
              targetGrantTechnology: entry.targetGrantTechnology,
              targetGrantLevel: entry.targetGrantLevel,
              requiredQuantity: entry.requiredQuantity,
              observedStock: entry.observedStock,
              offerObservationId: entry.offerObservationId,
              offerBindingGeneration: entry.offerBindingGeneration,
              allocationAuthority: entry.allocationAuthority,
            })),
            mandatoryActionIds: mandatoryPlan.mandatoryActionIds,
            alternativeGroups: mandatoryPlan.alternativeGroups,
            prerequisiteReasons: mandatoryPlan.reasons,
          },
        );
        Reflect.set(testHooks, "gatherIntervention", {
          ...intervention,
          resourceClaim: claim,
          resourceClaims: claims,
        });
        setTestClaimStatus("active", "goal-derived-native-prerequisite", {
          nativeActionIds: claims.map((entry) => entry.nativeActionId),
          completedActionIds: completedPriorClaimIds,
          releasedActionIds: releasedPriorClaims.map((entry) => entry.actionId),
          blockedActionIds: releasedPriorClaims
            .filter((entry) => entry.reason === "verified-non-mana-shortage")
            .map((entry) => entry.actionId),
          offerBindingGenerations: claims.map(
            (entry) => entry.offerBindingGeneration,
          ),
          rootGeneration,
          progressionGeneration,
          offerObservationId: offer.offerObservationId,
          offerSetIdentity: offer.offerSetIdentity,
        });
        return;
      }
      if (readProperty(intervention, "resourceClaim") !== undefined) {
        replaceTestClaim(undefined);
        setTestClaimStatus("released", "invalid-claim-evidence");
      }
      return;
    }
    const root = pageCapture.rootState.readRoot();
    const settings = settingsStore.readRaw();
    if (!isRecord(root) || !isRecord(settings)) {
      setTestClaimStatus("suspended", "root-or-settings-unavailable");
      return;
    }
    if (settings["prestigeType"] !== "mad") {
      replaceTestClaim(undefined);
      setTestClaimStatus("invalidated", "selected-goal-changed");
      return;
    }
    if (settings["autoResearch"] !== true || settings["autoTrigger"] === true) {
      replaceTestClaim(undefined);
      setTestClaimStatus(
        "invalidated",
        "research-permission-or-trigger-changed",
      );
      return;
    }
    const queueStates = (["queue", "r_queue"] as const).map((queueId) => {
      const entries = readProperty(readProperty(root, queueId), "queue");
      return !Array.isArray(entries)
        ? "unavailable"
        : entries.length > 0
          ? "active"
          : "empty";
    });
    if (queueStates.includes("active")) {
      replaceTestClaim(undefined);
      setTestClaimStatus("invalidated", "player-queue-present");
      return;
    }
    if (queueStates.includes("unavailable")) {
      setTestClaimStatus("suspended", "player-queue-observation-unavailable");
      return;
    }
    const rootGeneration = progression.readRootGeneration();
    if (previousClaim.rootGeneration !== rootGeneration) {
      replaceTestClaim(undefined);
      setTestClaimStatus("invalidated", "root-replaced");
      return;
    }
    const offers =
      ownerObservation === undefined
        ? progression.readLastResearchOwnerOffers?.()
        : ownerObservation.offers;
    const completeFreshOfferSet =
      ownerObservation !== undefined &&
      ownerObservation.offers !== undefined &&
      (ownerObservation.offers[0]?.offerSetIdentity !== undefined ||
        ownerObservation.offers.length === 0) &&
      (ownerObservation.offers[0]?.offerObservationId !== undefined ||
        ownerObservation.offers.length === 0);
    const definitions = progression.readResearchActionDefinitions();
    if (offers === undefined || definitions === undefined) {
      setTestClaimStatus("suspended", "research-owner-observation-unavailable");
      return;
    }
    const progressionGeneration = progression.readProgressionEpoch();
    const grantLevels = readResearchGrantLevels(root, definitions);
    const targetActionId = previousClaim.nativeActionId;
    const currentTargetGrant = grantLevels?.get(
      previousClaim.targetGrantTechnology,
    );
    if (currentTargetGrant === undefined) {
      setTestClaimStatus("suspended", "target-grant-observation-unavailable");
      return;
    }
    if (currentTargetGrant >= previousClaim.targetGrantLevel) {
      replaceTestClaim(undefined);
      setTestClaimStatus("completed", "current-research-grant-completed");
      return;
    }
    if (previousClaim.progressionGeneration !== progressionGeneration) {
      setTestClaimStatus(
        "suspended",
        "progression-changed-before-offer-reconciliation",
      );
      return;
    }
    const offer = offers.find((entry) => entry.elementId === targetActionId);
    if (offer === undefined) {
      if (completeFreshOfferSet) {
        replaceTestClaim(undefined);
        setTestClaimStatus(
          "released",
          "native-offer-absent-from-complete-fresh-set",
          {
            offerSetIdentity: offers[0]?.offerSetIdentity ?? JSON.stringify([]),
            offerSetObservationId:
              offers[0]?.offerObservationId ??
              `research-owner-${automationCycle}`,
          },
        );
      } else {
        setTestClaimStatus(
          "suspended",
          "offer-absence-lacks-a-complete-fresh-native-set",
        );
      }
      return;
    }
    if (
      typeof offer.offerObservationId !== "string" ||
      offer.offerObservationId === previousClaim.offerObservationId
    ) {
      setTestClaimStatus("suspended", "research-owner-observation-not-fresh");
      return;
    }
    const actionEligibility =
      progression.readResearchOwnerOfferEligibility?.(offer);
    if (actionEligibility === "excluded") {
      replaceTestClaim(undefined);
      setTestClaimStatus("released", "native-offer-excluded");
      return;
    }
    if (actionEligibility !== "eligible") {
      setTestClaimStatus("suspended", "native-offer-eligibility-unavailable");
      return;
    }
    if (
      offer.grantTechnology !== previousClaim.targetGrantTechnology ||
      offer.grantLevel !== previousClaim.targetGrantLevel
    ) {
      replaceTestClaim(undefined);
      setTestClaimStatus("released", "native-offer-grant-changed");
      return;
    }
    const currentControl = pageCapture.controls.resolve(targetActionId);
    if (
      currentControl === undefined ||
      currentControl.elementId !== targetActionId ||
      !currentControl.methods.includes("action")
    ) {
      setTestClaimStatus("suspended", "current-action-binding-unavailable");
      return;
    }
    if (offer.generation !== currentControl.generation) {
      setTestClaimStatus("suspended", "current-offer-binding-mismatch", {
        offerBindingGeneration: offer.generation,
        currentControlGeneration: currentControl.generation,
      });
      return;
    }
    const manaPrice = offer.cost[previousClaim.resourceId];
    const manaResource = readProperty(
      readProperty(root, "resource"),
      previousClaim.resourceId,
    );
    const amount = Number(readProperty(manaResource, "amount"));
    const capacity = Number(readProperty(manaResource, "max"));
    const claim = admitResourceClaim({
      terminalGoalId: previousClaim.terminalGoalId,
      immediateGoalId: `research:${targetActionId}`,
      owner: previousClaim.owner,
      provenance: "verified-native-prerequisite",
      prerequisiteRelation: previousClaim.prerequisiteRelation,
      nativeActionId: targetActionId,
      targetGrantTechnology: offer.grantTechnology,
      targetGrantLevel: offer.grantLevel,
      resourceId: previousClaim.resourceId,
      poolId: previousClaim.poolId,
      requiredQuantity: manaPrice ?? Number.NaN,
      observedStock: amount,
      observedCapacity: capacity,
      observedNativePrice: manaPrice ?? Number.NaN,
      offerSetIdentity: offer.offerSetIdentity ?? "",
      offerObservationId: offer.offerObservationId ?? "",
      controlBinding: Object.freeze({
        elementId: targetActionId,
        generation: currentControl.generation,
      }),
      offerBindingGeneration: offer.generation,
      nativeOfferCurrent: true,
      nativeActionEligible: true,
      researchPermission: true,
      queueEvidence: "empty",
      rootGeneration,
      progressionGeneration,
      observationValid:
        pageCapture.rootState.readRoot() === root &&
        progression.readRootGeneration() === rootGeneration &&
        progression.readProgressionEpoch() === progressionGeneration &&
        pageCapture.controls.resolve(targetActionId)?.generation ===
          currentControl.generation,
      precedence: previousClaim.precedence,
      allocationAuthority: previousClaim.allocationAuthority,
      forecastProductionPerSecond: previousClaim.forecastProductionPerSecond,
      uncertaintyReasons: [],
      unavailableReasons: [],
    });
    if (claim === undefined) {
      setTestClaimStatus("suspended", "current-offer-cannot-be-reserved");
      return;
    }
    const savingTarget = readDemand("pre-Gather").savingTarget;
    const savingMana = savingTarget?.cost[previousClaim.resourceId];
    const resourceClaimReservations =
      typeof savingMana === "number" &&
      Number.isFinite(savingMana) &&
      savingMana > 0
        ? Object.freeze([
            Object.freeze({
              resourceId: previousClaim.resourceId,
              poolId: savingTarget?.pool ?? "anywhere",
              quantity: savingMana,
            }),
          ])
        : Object.freeze([]);
    setTestClaimStatus(
      "active",
      offer.cost[previousClaim.resourceId] === previousClaim.requiredQuantity
        ? "same-native-offer"
        : "native-price-updated",
      {
        ownerOfferGeneration: offer.generation,
        currentControlGeneration: currentControl.generation,
        rootGeneration,
        progressionGeneration,
        offerObservationId: claim.offerObservationId,
        offerSetIdentity: claim.offerSetIdentity,
      },
    );
    Reflect.set(
      testHooks,
      "gatherIntervention",
      Object.freeze({
        ...intervention,
        resourceClaim: claim,
        resourceClaims: claim === undefined ? [] : [claim],
        resourceClaimReservations,
      }),
    );
  };
  const tax = createCapturedTaxControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    nowMs: () => Date.now(),
  });
  const hell = createCapturedHellAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readAuthorityMarginal: readCapturedAuthorityMarginal,
  });
  const genetics = createCapturedGenetics({
    rootState: pageCapture.rootState,
    keyState: pageCapture.keyState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Genetics"),
  });
  const traits = createCapturedTraitControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    keyState: pageCapture.keyState,
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
    readDemand: readDemandFor("Jobs"),
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
  });
  const capturedJobsTraceSink =
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
      ? (event: Readonly<Record<string, unknown>>) => {
          const observer = readProperty(
            readProperty(settingsHostWindow, "__EA_TEST_HOOKS__"),
            "observeJobsTrace",
          );
          if (typeof observer === "function") observer(event);
        }
      : undefined;
  const ordinaryJobs = createCapturedOrdinaryJobsAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    keyState: pageCapture.keyState,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Jobs"),
    onSkipped: (key, reason) => reportOnce(`jobs skipped ${key}: ${reason}`),
    ...(capturedJobsTraceSink === undefined
      ? {}
      : { testTrace: capturedJobsTraceSink }),
  });
  const fullJobs = createCapturedFullJobsAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    keyState: pageCapture.keyState,
    readSettings: () => settingsStore.readRaw(),
    onSkipped: (key, reason) => reportOnce(`jobs skipped ${key}: ${reason}`),
    costs,
    readDemand: readDemandFor("Jobs"),
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
    ...(phaseDiagnostics === undefined
      ? {}
      : { diagnostics: phaseDiagnostics }),
    ...(capturedJobsTraceSink === undefined
      ? {}
      : { testTrace: capturedJobsTraceSink }),
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
    readDemand: readDemandFor("Replicator"),
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
  // The yard's own cost row serves both demand plans below instead of each drawing the panel's cost
  // markup twice, and it is what lets a save that never rendered the shipyard still be priced: the
  // reader establishes the yard itself, and only while the fleet demand the prioritizer would keep
  // is actually a live one.
  const fleetDemand = createCapturedFleetDemand({
    rootState: pageCapture.rootState,
    costs: outerFleetCosts,
    shipyard: outerFleetShipyard,
    readSettings: () => settingsStore.readRaw(),
  });
  const ensureDemandResearchObservation = () => {
    progression.sampleOfferedTechs("resource-demand");
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
    readOfferedTechs: () => progression.sampleOfferedTechs("condition-context"),
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
            ensureForeignControls,
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
    readOfferedTechs: () => progression.sampleOfferedTechs("triggers"),
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
    const profiling =
      diagnostics?.readPerformanceEnabled() === true ? diagnostics : undefined;
    const startedAtMs = profiling?.nowMs();
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
    } finally {
      if (profiling !== undefined && startedAtMs !== undefined) {
        profiling.recordPerformance(
          "planningPanels.refresh",
          profiling.nowMs() - startedAtMs,
        );
      }
    }
  };
  let demandThisCycle: CapturedDemandSample | undefined;
  let exactDemandUnavailableReason: string | undefined;
  let demandEpoch = 0;
  let actionCostEpoch = 0;
  let demandSampleEpoch = -1;
  const invalidateDemandSample = (actionCostsMayChange = true) => {
    demandEpoch += 1;
    if (actionCostsMayChange) actionCostEpoch += 1;
    demandSampleEpoch = -1;
    demandThisCycle = undefined;
    exactDemandUnavailableReason = undefined;
  };
  invalidateDemandSettings = () => {
    invalidateDemandSample(false);
    savingTargetThisCycle = undefined;
    triggerTargetsThisCycle = undefined;
    triggerDemandThisCycle = undefined;
    demandPrerequisitesThisCycle = undefined;
    if (settingsLifecycle.readEffective()["autoTrigger"] === true) {
      try {
        triggerTargetsThisCycle = triggers.read();
      } catch {
        triggerTargetsThisCycle = undefined;
      }
    }
  };
  const invalidateDemandAfterMutation = (
    constructionAuthority = false,
    actionCostsMayChange = true,
  ) => {
    invalidateDemandSample(actionCostsMayChange);
    savingTargetThisCycle = undefined;
    triggerDemandThisCycle = undefined;
    demandPrerequisitesThisCycle = undefined;
    if (constructionAuthority) progression.invalidateConstructionOffers();
    if (settingsLifecycle.readEffective()["autoTrigger"] === true) {
      try {
        triggerTargetsThisCycle = triggers.read();
      } catch {
        triggerTargetsThisCycle = undefined;
      }
    }
  };
  // Upstream functions.js `adjustCosts` reads race traits, the `genes.evolve` price special case,
  // technology and the active
  // government while composing native prices. Snapshot those fields around the later mutators so
  // a no-op phase keeps price answers, while an actual change closes their reuse window.
  const captureNativePriceAuthority = () => {
    const root = pageCapture.rootState.readRoot();
    const copyFields = (value: unknown) =>
      isRecord(value)
        ? Object.freeze(
            Object.keys(value).map((key) =>
              Object.freeze([key, readProperty(value, key)] as const),
            ),
          )
        : Object.freeze([] as readonly (readonly [string, unknown])[]);
    return Object.freeze({
      race: copyFields(readProperty(root, "race")),
      genes: Object.freeze([
        Object.freeze([
          "evolve",
          readProperty(readProperty(root, "genes"), "evolve"),
        ] as const),
      ]),
      tech: copyFields(readProperty(root, "tech")),
      government: copyFields(
        readProperty(readProperty(root, "civic"), "govern"),
      ),
      captiveHousing: readProperty(
        readProperty(root, "city"),
        "captive_housing",
      ),
      torturerWorkers: readProperty(
        readProperty(readProperty(root, "civic"), "torturer"),
        "workers",
      ),
      nightmareMetaGene: readProperty(
        readProperty(
          readProperty(readProperty(root, "stats"), "achieve"),
          "nightmare",
        ),
        "mg",
      ),
    });
  };
  const nativePriceAuthorityChanged = (
    before: ReturnType<typeof captureNativePriceAuthority>,
    after: ReturnType<typeof captureNativePriceAuthority>,
  ) => {
    const fields = ["race", "genes", "tech", "government"] as const;
    return (
      fields.some((field) => {
        const prior = before[field];
        const current = after[field];
        return (
          prior.length !== current.length ||
          prior.some(
            ([key, value], index) =>
              current[index]?.[0] !== key ||
              !Object.is(current[index]?.[1], value),
          )
        );
      }) ||
      !Object.is(before.captiveHousing, after.captiveHousing) ||
      !Object.is(before.torturerWorkers, after.torturerWorkers) ||
      !Object.is(before.nightmareMetaGene, after.nightmareMetaGene)
    );
  };
  const runPriceSensitivePhase = <T>(
    name: string,
    body: () => T,
  ): T | undefined =>
    runPhase(name, () => {
      const before = captureNativePriceAuthority();
      let outcome:
        | Readonly<{ status: "succeeded"; value: T }>
        | Readonly<{ status: "failed"; error: unknown }>;
      try {
        outcome = Object.freeze({ status: "succeeded", value: body() });
      } catch (error) {
        outcome = Object.freeze({ status: "failed", error });
      }
      try {
        if (nativePriceAuthorityChanged(before, captureNativePriceAuthority()))
          invalidateDemandSample();
      } catch (error) {
        // The feature may already have changed native price inputs. If the after-snapshot is no
        // longer readable, expire the sample before the normal phase boundary reports failure.
        invalidateDemandSample();
        throw error;
      }
      if (outcome.status === "failed") throw outcome.error;
      return outcome.value;
    });
  const invalidateCapturedCyclePlanning = () => {
    latestConstructionSnapshot = null;
    latestConstructionRun = undefined;
    currentStateLogConstructionSnapshot = null;
    constructionFreshness = "none";
    triggerTargetsThisCycle = undefined;
    triggerDemandThisCycle = undefined;
    invalidateDemandSample();
    demandPrerequisitesThisCycle = undefined;
  };
  pageCapture.rootState.subscribeRootReplaced(() => {
    mechSupplyReservation.reset();
    savingTargetThisCycle = undefined;
    settingsLifecycle.invalidateDynamicDefaults();
    settingsPanel.invalidate();
    // Attempts and readouts belong to the replaced root, even when its day/reset are unchanged.
    discoveryAttempts.invalidate();
    latestConstructionSnapshot = null;
    latestConstructionRun = undefined;
    constructionFreshness = "none";
    triggerTargetsThisCycle = undefined;
    triggerDemandThisCycle = undefined;
    invalidateDemandSample();
    demandPrerequisitesThisCycle = undefined;
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
    arpa,
  });
  const demand = createCapturedResourceDemand({
    rootState: pageCapture.rootState,
    readDemandEpoch: () => demandEpoch,
    readActionCostEpoch: () => actionCostEpoch,
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
    ...(phaseDiagnostics === undefined
      ? {}
      : { diagnostics: phaseDiagnostics }),
  });
  readDemand = (owner) => {
    return measurePhase("demand.read", () => {
      if (demandThisCycle === undefined || demandSampleEpoch !== demandEpoch) {
        diagnostics?.recordCount(`demand.sampleOwner.${owner}`, 1);
        demandThisCycle = measurePhase("demand.read.compute", () => {
          measurePhase(
            "demand.sample.research-observation",
            ensureDemandResearchObservation,
          );
          return measurePhase("demand.sample.total", () => demand.sample());
        });
        demandSampleEpoch = demandEpoch;
      }
      return demandThisCycle;
    });
  };
  const storagePorts = createCapturedStoragePorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readStorageRequired: (resourceId, pool) =>
      readDemand("Storage").storageRequired(resourceId, pool),
    reservations: queueReservations,
    readSavingTarget: () => readDemand("Storage").savingTarget,
    readBuildTargets: progression.readUnlockedStorageBuildTargets,
    readOfferedTechs: progression.readOfferedTechs,
    readProjects: progression.readProjects,
    costs: buildCosts,
    onMutation: () => {
      storageMutationObserved = true;
    },
    onSkipped: (key, reason) => reportOnce(`storage skipped ${key}: ${reason}`),
    nowMs: () => Date.now(),
    ...(phaseDiagnostics === undefined
      ? {}
      : { diagnostics: phaseDiagnostics }),
  });
  const storageAutomation = createStorageAllocationAutomation({
    ...storagePorts,
    diagnostics: phaseDiagnostics,
  });
  const galaxyMarketPorts = createCapturedGalaxyMarketPorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Market"),
  });
  const galaxyMarketAutomation = Object.freeze({
    run: () =>
      runGalaxyMarketAutomation({
        reader: galaxyMarketPorts.reader,
        executor: galaxyMarketPorts.executor,
      }),
  });
  const marketBoard = createCapturedMarketBoard(
    pageCapture.rootState,
    pageCapture.controls,
  );
  const marketPorts = createCapturedMarketPorts({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    board: marketBoard,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Market"),
    onUnavailable: (resourceId, reason) =>
      reportOnce(`market skipped ${resourceId}: ${reason}`),
  });
  const tradeRouteDependencies = {
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    board: marketBoard,
    mechanics: pageCapture.mechanics,
    keyState: pageCapture.keyState,
    readSettings: () => settingsStore.readRaw(),
    readRootGeneration: progression.readRootGeneration,
    readProgressionEpoch: progression.readProgressionEpoch,
    readDemand: readDemandFor("Market"),
    onUnavailable: (reason) =>
      reportOnce(`trade routes unavailable: ${reason}`),
    ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
      ? {
          testSurface: {
            allowHistoricalSignalForComparisonTest: () => {
              const hooks = readProperty(
                settingsHostWindow,
                "__EA_TEST_HOOKS__",
              );
              return (
                readProperty(hooks, "allowHistoricalGoalComparisonForTest") ===
                true
              );
            },
            demandForTest: (input, context) => {
              const hooks = readProperty(
                settingsHostWindow,
                "__EA_TEST_HOOKS__",
              );
              const select = readProperty(
                hooks,
                "selectGoalAwareMarketDemandForTest",
              );
              return typeof select === "function"
                ? Reflect.apply(select, hooks, [input, context])
                : undefined;
            },
            preserveMoneyFloorForDemandTest: () => {
              const hooks = readProperty(
                settingsHostWindow,
                "__EA_TEST_HOOKS__",
              );
              return (
                readProperty(hooks, "preserveGoalDemandMoneyFloorForTest") ===
                true
              );
            },
            nowForTest: () => {
              const now = readProperty(settingsHostWindow, "eaDiagnosticsNow");
              if (typeof now === "function")
                return Reflect.apply(now, settingsHostWindow, []);
              const capturedMarketFenceClock = readProperty(
                settingsHostWindow,
                "performance",
              );
              const capturedMarketFenceNow = readProperty(
                capturedMarketFenceClock,
                "now",
              );
              return typeof capturedMarketFenceNow === "function"
                ? Reflect.apply(
                    capturedMarketFenceNow,
                    capturedMarketFenceClock,
                    [],
                  )
                : 0;
            },
            resolveOperations: (input, planned, context) => {
              const hooks = readProperty(
                settingsHostWindow,
                "__EA_TEST_HOOKS__",
              );
              const resolve = readProperty(
                hooks,
                "resolveTradeRouteOperationsForTest",
              );
              return typeof resolve === "function"
                ? Reflect.apply(resolve, hooks, [input, planned, context])
                : undefined;
            },
            onTrace: (event) => {
              const hooks = readProperty(
                settingsHostWindow,
                "__EA_TEST_HOOKS__",
              );
              const record = readProperty(
                hooks,
                "recordTradeRouteTraceForTest",
              );
              if (typeof record === "function")
                Reflect.apply(record, hooks, [event]);
            },
          },
        }
      : {}),
  } satisfies Parameters<typeof createCapturedTradeRoutes>[0];
  const tradeRoutes = createCapturedTradeRoutes(tradeRouteDependencies);
  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
  ) {
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (isRecord(hooks))
      Reflect.set(
        hooks,
        "capturedTradeRouteControlForTest",
        createCapturedTradeRoutesTestControl(tradeRouteDependencies),
      );
  }
  const marketAutomation = Object.freeze({
    run: (bulkSell = false, ignoreSellRatio = false) =>
      runMarketAutomation(
        {
          reader: marketPorts.reader,
          executor: marketPorts.executor,
          tradeRoutes,
          diagnostics: phaseDiagnostics,
        },
        bulkSell,
        ignoreSellRatio,
      ),
  });
  const ratios = createCapturedProductionRatios({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("ProductionRatios"),
  });
  const craftDependencies = {
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs,
    getDocument: () => document,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Craft"),
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
    diagnostics: phaseDiagnostics,
  });
  const governmentModal = createCapturedGovernmentModalControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    discovery: civicDiscovery,
    mountSuppression: pageCapture.mountSuppression,
    getDocument: () => document,
  });
  const government = createCapturedGovernmentAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    modal: governmentModal,
    readSettings: () => settingsStore.readRaw(),
  });
  /**
   * The one place a captured feature spends a tab draw. Callers check their own eligibility first
   * and pass `satisfied`: the authoritative answer to "does this feature now hold the control it
   * came for". A draw that reports success while leaving that control absent is a failure here, so
   * the feature stays eligible for a later cycle instead of latching itself off for the session.
   *
   * `epoch` names a feature-owned identity — a progression reset — that starts the attempts over.
   * `options` is the same per-pass surface `civicDiscovery.discover()` takes, for the one path that
   * needs a component really mounted or a cheap observed answer.
   */
  const finishDiscovery = (
    key: string,
    label: string,
    satisfied: (() => boolean) | undefined,
    epoch: string | undefined,
    steps: Parameters<typeof civicDiscovery.discover>[0],
    options: Readonly<TabDiscoveryOptions> | undefined = undefined,
  ): boolean => {
    if (!discoveryAttempts.shouldAttempt(key, epoch)) return false;
    // A draw that throws is a failed attempt like any other. Without this the exception would
    // escape before anything was recorded, and the phase runner's catch would leave the feature
    // redrawing its tab on every cycle forever.
    let result;
    try {
      result = civicDiscovery.discover(steps, { ...options, purpose: key });
    } catch (error) {
      discoveryAttempts.recordFailure(key, epoch);
      reportOnce(`${label} discovery threw: ${String(error)}`);
      return false;
    }
    if (result.outcome.status !== "succeeded") {
      discoveryAttempts.recordFailure(key, epoch);
      reportOnce(
        `${label} discovery skipped: ${result.outcome.failure?.message ?? result.outcome.status}`,
      );
      return false;
    }
    if (satisfied !== undefined && !satisfied()) {
      discoveryAttempts.recordFailure(key, epoch);
      reportOnce(
        `${label} discovery drew its tab without capturing its control`,
      );
      return false;
    }
    discoveryAttempts.recordSuccess(key, epoch);
    return true;
  };
  /**
   * The same bookkeeping as `finishDiscovery`, for a capability that establishes itself against its
   * own scratch DOM rather than through a tab-discovery path. The Outer Fleet shipyard is that: its
   * draw is reached through the game's own tab switch, but with a `#dwarfShipYard` of its own, so
   * there is no panel to point a path at. An attempt is a plain `() => boolean` here — it captured
   * something or it did not — and the rules above apply unchanged: a throw is a failed attempt, a
   * capability that did not appear is a failed attempt, and both back off.
   */
  const finishEstablishment = (
    key: string,
    label: string,
    establish: () => boolean,
  ): boolean => {
    if (!discoveryAttempts.shouldAttempt(key)) return false;
    let established: boolean;
    try {
      established = establish();
    } catch (error) {
      discoveryAttempts.recordFailure(key);
      logError(
        `${label} capture threw: ${String(error)} (${discoveryAttempts.describe(key)})`,
      );
      return false;
    }
    if (!established) {
      discoveryAttempts.recordFailure(key);
      logError(
        `${label} capture drew its yard without capturing the control (${discoveryAttempts.describe(key)})`,
      );
      return false;
    }
    discoveryAttempts.recordSuccess(key);
    return true;
  };
  const civicMilitaryGarrisonPath = () => {
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined)
      return undefined;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (govTabs === undefined) return undefined;
    return [
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
    ];
  };
  /**
   * Draws the civics military sub-tab, where `index.js` calls `buildFortress($('#fortress'),false)`
   * and captures `gFort`. The same draw binds the city garrison methods Auto Hell consumes.
   *
   * Eligibility comes before the attempt, like the other conditional discoveries: the fortress is
   * built mid-run, so a pre-fortress cycle must not spend a draw on a panel that cannot exist yet.
   */
  const ensureHellManagementControls = () => {
    const satisfied = () =>
      CAPTURED_CITY_GARRISON_CONTROLS.some((id) => {
        const methods = pageCapture.controls.resolve(id)?.methods;
        return (
          methods?.includes("hell") &&
          methods.includes("s_max") &&
          methods.includes("rating")
        );
      }) &&
      resolveCapturedOrdinaryFortress(
        pageCapture.controls,
        HELL_ORDINARY_FORTRESS_METHODS,
      ) !== undefined;
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    if (
      !isRecord(readProperty(readProperty(root, "portal"), "fortress")) ||
      readProperty(readProperty(root, "race"), "warlord")
    ) {
      return;
    }
    const path = civicMilitaryGarrisonPath();
    if (path === undefined) return;
    finishDiscovery(
      "hell-management",
      "Hell management",
      satisfied,
      undefined,
      path,
    );
  };
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
    const path = civicMilitaryGarrisonPath();
    if (path === undefined) return;
    finishDiscovery(
      "hell-garrison",
      "Hell garrison",
      satisfied,
      undefined,
      path,
    );
  };
  const ensureCivicControls = () => {
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const cityFoundry = readProperty(
      readProperty(pageCapture.rootState.readRoot(), "city"),
      "foundry",
    );
    const foundryCount = readProperty(cityFoundry, "count");
    const foundryUnlocked =
      typeof foundryCount === "number" &&
      Number.isFinite(foundryCount) &&
      foundryCount > 0;
    const civicEpoch = foundryUnlocked
      ? "foundry-available"
      : "foundry-unbuilt";
    const civicControlsSatisfied = () => {
      if (!foundryUnlocked) return true;
      const foundry = pageCapture.controls.resolve("foundry");
      return (
        foundry?.methods.includes("add") === true &&
        foundry.methods.includes("sub")
      );
    };
    if (
      !finishDiscovery(
        "civic-controls",
        "civic",
        civicControlsSatisfied,
        civicEpoch,
        [
          Object.freeze({
            setting: MAIN_TAB_SETTING,
            control: MAIN_TAB_CONTROL,
            index: MAIN_TAB_INDEX.civic,
          }),
        ],
      )
    ) {
      return;
    }
    refreshDiscoveredSettings();
    settingsPanel.refreshSettings();
  };
  const ensureGovernmentPanelControls = (purpose: GovernmentPanelPurpose) => {
    const satisfied = () =>
      governmentPanelControlEstablished(pageCapture.controls, purpose);
    if (satisfied()) return;
    const draw = planGovernmentPanelDraw(
      pageCapture.rootState.readRoot(),
      pageCapture.controls,
      purpose,
    );
    if (draw === undefined) return;
    finishDiscovery(
      `government-${purpose}`,
      `Government ${purpose}`,
      satisfied,
      undefined,
      draw.path,
      draw.options,
    );
  };
  /**
   * Draws the Government sub-tab, which is the only path to the Foreign panel's own controls.
   *
   * `defineGovernment()` creates `#government` and binds its `b-tabs`, but `#r_govern0` is that
   * component's *render*, not markup: `government()`, the compact `#c_garrison`, `foreignGov()` and
   * its `vBind({el:'#foreign'})` all append into `#r_govern0`, so with every mount suppressed they
   * append into a detached element and the Foreign methods are never bound at all. This pass is
   * therefore the one discovery that lets `#government` really mount — its Buefy tab template is
   * what materialises the container the game's own synchronous code appends into — and everything
   * else the draw binds stays suppressed. The Foreign component itself is not left mounted; its
   * `vBind` methods are recorded from the binding options, which is all any consumer needs.
   *
   * Eligibility is the upstream answer, not a guess: `foreignGov()` runs only for
   * `species !== 'protoplasm'` runs without `start_cataclysm`, and only when
   * `capturedForeignPanelAvailable` holds, which is upstream's own `garrison.display && spyActive()`.
   * A panel the game would not draw is not a failed discovery and must not be redrawn.
   *
   * The draw also establishes the compact Garrison Battle needs, because `buildGarrison($('#c_garrison'))`
   * runs inside the same Government draw; a player who has never visited the military tab has no
   * other source for it.
   */
  /**
   * Battle reads the Foreign authority and a Garrison campaign authority, which this one draw
   * produces but which fail independently: the compact `#c_garrison` is only bound when
   * `#r_govern0` existed for it, and the full `garrison` only when the military tab has been drawn
   * too. Naming the missing half is what keeps a dark Battle explainable instead of silent.
   */
  const reportCapturedGarrisonGap = () => {
    if (capturedForeignGarrisonEstablished(pageCapture.controls)) return;
    reportOnce(
      "Foreign authority established without a Garrison campaign control; Battle stays dark until the civic military tab has been drawn",
    );
  };
  /**
   * Draws the Government sub-tab, the only path to the Foreign panel's own controls — see
   * `foreign-panel-draw.ts` for why that needs one real `#government` mount and why a panel upstream
   * would not create must not be redrawn. Attempt bookkeeping, restoration and diagnostics stay
   * with the shared `finishDiscovery`.
   */
  const ensureForeignControls = () => {
    const satisfied = () => capturedForeignEstablished(pageCapture.controls);
    if (satisfied()) {
      reportCapturedGarrisonGap();
      return;
    }
    const draw = planForeignPanelDraw(
      pageCapture.rootState.readRoot(),
      pageCapture.controls,
    );
    if (draw === undefined) return;
    if (
      finishDiscovery(
        FOREIGN_PANEL_DRAW_KEY,
        "Foreign",
        satisfied,
        undefined,
        draw.path,
        draw.options,
      )
    ) {
      reportCapturedGarrisonGap();
    }
  };
  /**
   * Establishes the Dwarf Shipyard's own controls without the player visiting the tab.
   *
   * `drawShipYard()` is module-private, and both closures over it open by clearing every panel in
   * the Civic tab. It also draws into `#dwarfShipYard`, which is that tab's own `b-tabs` *render*
   * rather than markup — so with the render suppressed there is nothing to append into, `#shipPlans`
   * is created detached, and a Civic pass could never have captured the yard. `captured-outer-fleet-shipyard.ts`
   * stands a `#dwarfShipYard` of its own inside a scratch workspace, runs the game's draw against it
   * with the tab settings the draw gates on, and proves the control was rebound by that call.
   *
   * Eligibility is still the game's own answer, unchanged: a run without a shipyard, without the
   * syndicate tech, or with an unpowered yard is not worth a draw, and the game itself moves the
   * player off the Dwarf Shipyard sub-tab every period while `showShipYard` is false.
   */
  const ensureOuterFleetControls = () => {
    const satisfied = () =>
      outerFleetShipyard.established(outerFleetShipyard.control());
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
    finishEstablishment(
      "outer-fleet",
      "outer fleet",
      () => outerFleetShipyard.establish() !== undefined,
    );
  };
  const ensureOuterFleetGarrison = () => {
    const satisfied = () =>
      CAPTURED_CITY_GARRISON_CONTROLS.some((id) =>
        pageCapture.controls.resolve(id)?.methods.includes("hell"),
      );
    if (satisfied()) return;
    const path = civicMilitaryGarrisonPath();
    if (path === undefined) return;
    finishDiscovery(
      "outer-fleet-garrison",
      "Outer Fleet garrison",
      satisfied,
      undefined,
      path,
    );
  };
  const ensureMercenaryControls = () => {
    const satisfied = () =>
      CAPTURED_CITY_GARRISON_CONTROLS.some((id) =>
        pageCapture.controls.resolve(id)?.methods.includes("hire"),
      );
    if (satisfied()) return;
    const root = pageCapture.rootState.readRoot();
    const garrison = readProperty(readProperty(root, "civic"), "garrison");
    if (!isRecord(garrison) || garrison["mercs"] !== true) return;
    const path = civicMilitaryGarrisonPath();
    if (path === undefined) return;
    finishDiscovery("mercenary", "Mercenary", satisfied, undefined, path);
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
   * project panel, and `genetics()` binds `#arpaSequence` and, above level 2, `#geneSlots`.
   * Both of its own gates are checked first:
   * `genetics()` returns before drawing anything unless `settings.arpa.genetics` is set, and the
   * sequencer panel itself exists only above `tech.genetics` 1.
   */
  const ensureGeneticsControl = (
    control: string,
    key: string,
    minimumLevel: number,
  ) => {
    const root = pageCapture.rootState.readRoot();
    const level = readProperty(readProperty(root, "tech"), "genetics");
    const satisfied = () => pageCapture.controls.resolve(control) !== undefined;
    if (satisfied()) return;
    const panelOffered = readProperty(
      readProperty(readProperty(root, "settings"), "arpa"),
      "genetics",
    );
    if (
      typeof level !== "number" ||
      !Number.isFinite(level) ||
      level < minimumLevel ||
      panelOffered !== true
    ) {
      return;
    }
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    finishDiscovery(key, key, satisfied, undefined, [
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
    if (!readProperty(readProperty(root, "race"), "casting")) return;
    if (
      !["city", "space", "tauceti"].some((region) =>
        readProperty(readProperty(root, region), "pylon"),
      )
    )
      return;
    const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
    if (
      pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined ||
      govTabs === undefined ||
      pageCapture.controls.resolve(govTabs) === undefined
    )
      return;
    finishDiscovery("pylon", "pylon", satisfied, undefined, [
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
    if (marketBoard.current() !== undefined) return;
    if (pageCapture.controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    const root = pageCapture.rootState.readRoot();
    if (readProperty(readProperty(root, "settings"), "showMarket") !== true) {
      return;
    }
    const marketTabs = SUB_TAB_CONTROLS[MARKET_TABS_SETTING];
    if (marketTabs === undefined) return;
    if (!marketBoard.beginDraw()) return;
    const succeeded = finishDiscovery(
      "market",
      "market",
      () => marketBoard.hasObservedRows(),
      marketBoard.epoch(),
      [
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
      ],
      { forceDraw: true, whileDrawn: () => marketBoard.observeDraw() },
    );
    marketBoard.completeDraw(succeeded);
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
  const smelterTestHooks = () =>
    readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
  const smelter = createCapturedSmelterAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Smelter"),
    ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
      ? {
          shouldPrepareInputForTest: () =>
            typeof readProperty(
              smelterTestHooks(),
              "prepareSmelterGoalDemandForTest",
            ) === "function",
          prepareInputForTest: (input, _sample) => {
            const settings = settingsStore.readRaw();
            const hooks = smelterTestHooks();
            const prepare = readProperty(
              hooks,
              "prepareSmelterGoalDemandForTest",
            );
            if (
              !isRecord(settings) ||
              settings["autoSmelter"] !== true ||
              typeof prepare !== "function"
            )
              return input;
            const exact = demand.sampleExact();
            const report = readProperty(
              hooks,
              "observeSmelterGoalDemandEvidenceForTest",
            );
            if (typeof report === "function")
              report(
                Object.freeze({
                  status: exact.status,
                  reason:
                    exact.status === "unavailable"
                      ? exact.reason.code
                      : undefined,
                }),
              );
            if (exact.status !== "ready") return input;
            const candidateRoot = pageCapture.rootState.readRoot();
            const candidateRootGeneration = progression.readRootGeneration();
            const selected = prepare(input, exact.sample, {
              root: candidateRoot,
              rootGeneration: candidateRootGeneration,
            });
            return applyCapturedSmelterTestCandidate(
              input,
              selected,
              candidateRoot,
              pageCapture.rootState.readRoot(),
              candidateRootGeneration,
              progression.readRootGeneration(),
            );
          },
          shouldObservePlanForDiagnostics: () =>
            readProperty(smelterTestHooks(), "smelterObservationMode") !==
              "G" &&
            typeof readProperty(
              smelterTestHooks(),
              "observeSmelterPlanForTest",
            ) === "function",
          observePlanForDiagnostics: (input, decision, demand, observation) => {
            const observer = readProperty(
              smelterTestHooks(),
              "observeSmelterPlanForTest",
            );
            if (typeof observer === "function")
              observer(input, decision, demand, observation);
          },
          observeOutcomeForTest: (outcome, observation, postcondition) => {
            const observer = readProperty(
              smelterTestHooks(),
              "observeSmelterOutcomeForTest",
            );
            if (typeof observer === "function")
              observer(outcome, observation, postcondition);
          },
          readProgressionGeneration: progression.readRootGeneration,
        }
      : {}),
  });
  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
  ) {
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (isRecord(hooks)) {
      Reflect.set(
        hooks,
        "setSmelterObservationModeForTest",
        (mode: unknown) => {
          return setCapturedSmelterObservationModeForTest(hooks, mode);
        },
      );
      Reflect.set(
        hooks,
        "createSmelterSnapshotForTest",
        createCapturedSmelterIncumbentSnapshot,
      );
      Reflect.set(
        hooks,
        "compareSmelterSnapshotForTest",
        compareCapturedSmelterSteelDemand,
      );
      Reflect.set(hooks, "readSmelterPlanForTest", () =>
        smelter.readPlanForDiagnostics(),
      );
      Reflect.set(hooks, "readSmelterDemandForTest", () => {
        const demand = readDemand("Smelter");
        const resources = readProperty(
          pageCapture.rootState.readRoot(),
          "resource",
        );
        return Object.freeze({
          requestedIron: demand.requestedQuantity("Iron"),
          requestedSteel: demand.requestedQuantity("Steel"),
          isIronDemanded: demand.isDemanded("Iron"),
          isSteelDemanded: demand.isDemanded("Steel"),
          savingTarget: demand.savingTarget,
          resourceRates: Object.freeze(
            Object.fromEntries(
              ["Iron", "Steel", "Coal", "Titanium"].map((id) => {
                const rate = readProperty(readProperty(resources, id), "diff");
                return [
                  id,
                  typeof rate === "number" && Number.isFinite(rate)
                    ? rate
                    : null,
                ];
              }),
            ),
          ),
        });
      });
    }
  }
  const nanite = createCapturedNaniteAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Nanite"),
  });
  const ejector = createCapturedEjectorAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Ejector"),
  });
  const supply = createCapturedSupplyAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Supply"),
  });
  let factoryMutationObserved = false;
  const factory = createCapturedFactoryAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Factory"),
    onMutation: () => {
      factoryMutationObserved = true;
    },
    readBuildTargets: progression.readManagedBuildTargets,
    buildCosts,
  });
  const fleet = createCapturedFleetAutomation({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    readSettings: () => settingsStore.readRaw(),
    readDemand: readDemandFor("Fleet"),
  });
  const capturedPowerExecution = createCapturedPowerExecutor({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    mechanics: pageCapture.mechanics,
    readMechSaveSupply: mechSupplyReservation.readSaveSupply,
    setMechSaveSupply: mechSupplyReservation.setSaveSupply,
    diagnostics: phaseDiagnostics,
    log: (message) =>
      onActivity({ message, color: "has-text-info", tags: ["automation"] }),
  });
  let prospectiveSpaceMinerPlan:
    { readonly root: unknown; readonly maximum: number } | undefined;
  pageCapture.rootState.subscribeRootReplaced?.(() => {
    prospectiveSpaceMinerPlan = undefined;
  });
  const publishSpaceMinerPlan = (decision: {
    readonly maximumSpaceMiners: number;
  }) => {
    const root = pageCapture.rootState.readRoot();
    prospectiveSpaceMinerPlan =
      root !== undefined && Number.isFinite(decision.maximumSpaceMiners)
        ? { root, maximum: decision.maximumSpaceMiners }
        : undefined;
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
    ) {
      const observer = readProperty(
        readProperty(settingsHostWindow, "__EA_TEST_HOOKS__"),
        "observeSpaceMinerDecision",
      );
      if (typeof observer === "function") observer(decision.maximumSpaceMiners);
    }
  };
  const runJobsPhase = (
    phase: string,
    dependencies: Parameters<typeof runJobsAutomation>[0],
    craftOnly = false,
  ) => {
    const outcome = runJobsAutomation(dependencies, craftOnly);
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
    ) {
      const observer = readProperty(
        readProperty(settingsHostWindow, "__EA_TEST_HOOKS__"),
        "observeJobsAutomation",
      );
      if (typeof observer === "function") observer(phase, outcome);
    }
    if (outcome.status !== "succeeded" && outcome.status !== "deferred")
      reportOnce(
        `${phase}: ${outcome.failure.code}: ${outcome.failure.message}`,
      );
    return outcome;
  };
  const runPreparedJobsPhase = (
    phase: string,
    prepared: Readonly<PreparedJobsExecution>,
    input: Readonly<JobsCycleInput>,
  ) => {
    const foundryControl = pageCapture.controls.resolve("foundry");
    const outcome = runPreparedJobsAutomation(prepared, publishSpaceMinerPlan);
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
    ) {
      const observer = readProperty(
        readProperty(settingsHostWindow, "__EA_TEST_HOOKS__"),
        "observeJobsAutomation",
      );
      if (typeof observer === "function")
        observer(
          phase,
          outcome,
          Object.freeze({
            input,
            decision: prepared.decision,
            foundryControl:
              foundryControl === undefined
                ? undefined
                : Object.freeze({
                    generation: foundryControl.generation,
                    methods: foundryControl.methods,
                  }),
          }),
        );
    }
    if (outcome.status !== "succeeded" && outcome.status !== "deferred")
      reportOnce(
        `${phase}: ${outcome.failure.code}: ${outcome.failure.message}`,
      );
    return outcome;
  };
  const powerReader = createCapturedPowerReader({
    rootState: pageCapture.rootState,
    mechanics: pageCapture.mechanics,
    ...(phaseDiagnostics === undefined
      ? {}
      : { diagnostics: phaseDiagnostics }),
    readJobCounts: ordinaryJobs.readJobCounts,
    readProspectiveSpaceMiners: (root) => {
      const plan = prospectiveSpaceMinerPlan;
      return plan !== undefined && plan.root === root
        ? plan.maximum
        : undefined;
    },
    controls: pageCapture.controls,
    resources: createCapturedResourceSource(pageCapture.rootState),
    readDemand: () => demandThisCycle,
    readDemandUnavailableReason: () => exactDemandUnavailableReason,
    readFleetNeededShips: () =>
      isCapturedTruepath(pageCapture.rootState.readRoot())
        ? null
        : fleet.readNeededShips(),
    costs: buildCosts,
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
    diagnostics: phaseDiagnostics,
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
        observer(stage, demandThisCycle, outcome, demandPrerequisitesThisCycle);
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
      Reflect.set(hooks, "readSpaceMinerHandoff", () => {
        const plan = prospectiveSpaceMinerPlan;
        return plan !== undefined &&
          plan.root === pageCapture.rootState.readRoot()
          ? plan.maximum
          : undefined;
      });
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
  const outerFleetRegions = createCapturedSpaceRegionMechanics({
    pageWindow: settingsHostWindow,
    discovery: civicDiscovery,
  });
  const outerFleetSyndicate = createCapturedSyndicateMechanics({
    regions: outerFleetRegions,
    document: documentValue,
    controls: pageCapture.controls,
    discovery: civicDiscovery,
    mechanics: pageCapture.mechanics,
  });
  const outerFleet = createCapturedOuterFleetControl({
    rootState: pageCapture.rootState,
    controls: pageCapture.controls,
    costs: outerFleetCosts,
    parts: outerFleetParts,
    dispatch: capturedOuterFleetDispatch,
    syndicate: outerFleetSyndicate,
    regionMechanics: outerFleetRegions,
    readSettings: () => settingsStore.readRaw(),
    onActivity,
  });
  if (
    typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
    __EA_TEST_SURFACE_ENABLED__ === true
  ) {
    // The running game's own Syndicate answer, as a characterization reads it: a live run has to be
    // able to ask the same question production asks without standing up the rest of the feature.
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (isRecord(hooks)) {
      Reflect.set(hooks, "readOuterFleetRegion", (region: unknown) =>
        typeof region === "string"
          ? outerFleetRegions.read(region)
          : { kind: "invalid" as const },
      );
      Reflect.set(hooks, "readOuterFleetSyndicate", (region: unknown) =>
        typeof region === "string"
          ? outerFleetSyndicate.read(region)
          : { kind: "invalid" as const },
      );
    }
  }

  // Resolve overrides after all condition readers and their lazy control helpers are ready, before
  // the first planning-panel reconciliation or period callback. The settings lifecycle itself was
  // initialized above, before any settings UI or feature reader was constructed.
  refreshEffectiveSettings();
  refreshCapturedPlanningPanels();

  const runCycle = () => {
    const profiling =
      diagnostics?.readPerformanceEnabled() === true ? diagnostics : undefined;
    const cycleMeasure = createExclusivePhaseMeasure(profiling);
    activeRuntimeMeasure = cycleMeasure;
    const workStartedAtMs = profiling?.nowMs();
    const recordPreamble = (startedAtMs: number | undefined) => {
      if (profiling === undefined || startedAtMs === undefined) return;
      const elapsedMs = profiling.nowMs() - startedAtMs;
      cycleMeasure.record(
        "tick.preamble",
        Math.max(0, elapsedMs - cycleMeasure.readTotalMs()),
      );
    };
    automationCycle += 1;
    constructionMutationObserved = false;
    storageMutationObserved = false;
    factoryMutationObserved = false;
    prospectiveSpaceMinerPlan = undefined;
    capturedResetCommittedThisCycle = false;
    currentStateLogConstructionSnapshot = null;
    stateLogPlannerDetailsDue = false;
    constructionFreshness =
      latestConstructionSnapshot === null ? "none" : "stale";
    capturedMechCycleHasPendingWork = false;
    invalidateDemandSample();
    savingTargetThisCycle = undefined;
    constructionSuppressedThisCycle = false;
    triggerTargetsThisCycle = undefined;
    triggerDemandThisCycle = undefined;
    demandPrerequisitesThisCycle = undefined;
    if (!pageCapture.isComplete()) {
      cycleMeasure.measure("settingsPanel.ensurePanel", () =>
        settingsPanel.ensurePanel(),
      );
      refreshCapturedPlanningPanels();
      recordPreamble(workStartedAtMs);
      return;
    }
    refreshDiscoveredSettings();
    // The container is drawn before the master-toggle guard, so a fresh profile can enable the
    // script. Dynamic overrides have already refreshed above, keeping Mech Info in step.
    cycleMeasure.measure("settingsPanel.ensurePanel", () =>
      settingsPanel.ensurePanel(),
    );
    const settings = settingsStore.readRaw();
    if (
      !pageCapture.isComplete() ||
      !isEnabled(settings, "masterScriptToggle")
    ) {
      refreshCapturedPlanningPanels();
      recordPreamble(workStartedAtMs);
      return;
    }
    stateLogPlannerDetailsDue = stateLogRecorder.isNextSampleDue(settings);
    recordPreamble(workStartedAtMs);
    // The captured runtime is its own tick loop, so it owns the `tick` phase and the flush the
    // diagnostics adapter counts work ticks against. Without them `window.eaPerformance` records
    // samples on the production path and never emits a single summary.
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
      // cycle: the spy-purchase reserve needs the Foreign panel's own authority and the True Path
      // AI target needs the civilization build controls. The cycle caches its demand sample on
      // first use, so this runs before any consumer (triggers, market, storage) can sample,
      // and the report it writes is what the samples fail closed on when a capture is missing.
      runPhase("demand prerequisites", () => {
        demandPrerequisitesThisCycle ??= ensureDemandPrerequisiteControls({
          root: pageCapture.rootState.readRoot(),
          settings,
          controls: pageCapture.controls,
          ensureForeignControls,
          ensureBuildControls: progression.ensureBuildControls,
        });
      });
      // Build/Storage own the Building offers used by shared demand. Establish them before
      // any consumer samples; later refreshes only read this catalog and current live costs.
      if (
        isEnabled(settings, "autoBuild") ||
        isEnabled(settings, "autoStorage")
      ) {
        runPhase("construction demand preparation", () => {
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
          // Trigger targets use captured action controls, so run the control sweep before sampling
          // the targets shared with the demand model.
          progression.ensureBuildControls();
          refreshDiscoveredSettings();
          readTriggerTargets();
        });
      }
      if (isEnabled(settings, "autoFleet")) {
        runPhase("autoFleet discovery", () => {
          const truepath = isCapturedTruepath(pageCapture.rootState.readRoot());
          if (truepath) ensureOuterFleetControls();
          else ensureGalaxyFleetControls();
        });
      }
      const constructionDemandReady =
        !isEnabled(settings, "autoBuild") && !isEnabled(settings, "autoARPA")
          ? true
          : runPhase("construction saving discovery", () => {
              const ready = progression.establishConstructionOrdering();
              if (!ready)
                reportOnce(
                  "construction saving authority unavailable: candidate catalog or current price incomplete",
                );
              return ready;
            }) === true;
      const gatherEnabled =
        isEnabled(settings, "autoBuild") ||
        isEnabled(settings, "buildingAlwaysClick");
      if (gatherEnabled && constructionDemandReady) {
        if (
          typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
          __EA_TEST_SURFACE_ENABLED__ === true
        ) {
          const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
          const intervention = readProperty(hooks, "gatherIntervention");
          const claim = readAdmittedResourceClaim(
            readProperty(intervention, "resourceClaim"),
          );
          const claimMode = readProperty(intervention, "resourceClaimMode");
          if (
            claimMode === "goal-derived" ||
            claimMode === "goal-derived-single" ||
            claimMode === "goal-derived-conjunctive" ||
            (claim !== undefined &&
              (claimMode === undefined || claimMode === "current"))
          ) {
            // Sample once before Gather so its claim uses the current native binding. AutoResearch
            // reuses this same catalog later in the cycle; no second draw or executor is added.
            const offers = progression.sampleOfferedTechs(
              "resource-claim-before-gather",
            );
            const sampleRoot = pageCapture.rootState.readRoot();
            const sampleRootGeneration = progression.readRootGeneration();
            const sampleProgressionGeneration =
              progression.readProgressionEpoch();
            const sampleRouteIdentity = readEvolveRouteIdentity(sampleRoot);
            refreshResourceClaim({
              offers,
              rootGeneration: sampleRootGeneration,
              progressionGeneration: sampleProgressionGeneration,
              routeIdentity: sampleRouteIdentity,
              contextStable:
                sampleRoot !== undefined && sampleRouteIdentity !== undefined,
            });
          }
        }
        const needsConstructionSaving =
          isEnabled(settings, "autoBuild") || isEnabled(settings, "autoARPA");
        const savingOrderReady =
          progression.observations.hasCompletedOrdering();
        if (needsConstructionSaving && !savingOrderReady) {
          runPhase("buildingAlwaysClick", () => gatherResources());
        } else {
          const demandReady = runPhase("pre-Gather demand", () => {
            readDemand("pre-Gather");
            return true;
          });
          if (demandReady === true) {
            runPhase("buildingAlwaysClick", () => gatherResources());
          }
        }
      }
      if (constructionDemandReady && isEnabled(settings, "autoMarket")) {
        runPhase("autoMarket", () => {
          ensureMarketControls();
          refreshDiscoveredSettings();
          marketAutomation.run();
        });
      }
      if (isEnabled(settings, "autoHell")) {
        runPhase("autoHell", () => {
          ensureCivicControls();
          ensureHellManagementControls();
          hell.run();
        });
      }
      if (constructionDemandReady && isEnabled(settings, "autoGalaxyMarket")) {
        runPhase("autoGalaxyMarket", () => {
          ensureGalaxyMarketControls();
          refreshDiscoveredSettings();
          galaxyMarketAutomation.run();
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
      if (constructionDemandReady && isEnabled(settings, "autoAlchemy")) {
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
      const smelterSkipReason = capturedSmelterSkipReason(
        isEnabled(settings, "autoSmelter"),
        constructionDemandReady,
      );
      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true &&
        smelterSkipReason !== undefined
      ) {
        const observer = readProperty(
          readProperty(settingsHostWindow, "__EA_TEST_HOOKS__"),
          "observeSmelterSkippedForTest",
        );
        if (typeof observer === "function") observer(smelterSkipReason);
      }
      if (smelterSkipReason === undefined) {
        runPhase("autoSmelter", () => {
          ensureSmelterControls();
          refreshDiscoveredSettings();
          smelter.run();
        });
      }
      // Storage settles the quantum and storage allocation before Jobs, Fleet, Mech and Power
      // observe the resource ledger their own reads and allocations depend on.
      if (constructionDemandReady && isEnabled(settings, "autoStorage")) {
        storageMutationObserved = false;
        runPhase("autoStorage", () => {
          ensureStorageControls();
          refreshDiscoveredSettings();
          storageAutomation.run();
        });
        // Capacity affects quantity clamping and storage requirements. The adapter reports only
        // assignments and expansions whose postconditions confirmed a changed capacity.
        if (storageMutationObserved) {
          invalidateDemandAfterMutation(false, false);
        }
      }
      if (constructionDemandReady && isEnabled(settings, "autoReplicator")) {
        runPhase("autoReplicator", () => {
          ensureReplicatorControls();
          replicator.run();
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
        if (triggerActive) {
          // A successful trigger click can change queue reservations, progression offers, and
          // native prices. A failed phase can also have completed earlier clicks before failing.
          // Re-establish its dependent inputs before Factory or Power can read the new epoch.
          invalidateDemandAfterMutation(true);
        }
      }
      if (
        triggerActive &&
        (isEnabled(settings, "autoBuild") || isEnabled(settings, "autoARPA"))
      ) {
        constructionSuppressedThisCycle = true;
      }
      if (!triggerActive && isEnabled(settings, "autoResearch")) {
        let researchProgressionChanged = false;
        runPhase("autoResearch", () => {
          const progressionBeforeResearch = progression.readProgressionEpoch();
          let researchFailed = false;
          let researchFailure: unknown;
          try {
            progression.runResearchCycle();
          } catch (error) {
            researchFailed = true;
            researchFailure = error;
          }
          // Keep both authority reads inside the feature boundary. A read-only or rejected pass
          // leaves the epoch unchanged; a partial mutation still expires the sample. If the
          // post-read itself is unavailable, fail closed by expiring it before propagating.
          try {
            researchProgressionChanged =
              progression.readProgressionEpoch() !== progressionBeforeResearch;
            if (researchProgressionChanged) invalidateDemandAfterMutation(true);
          } catch (error) {
            invalidateDemandAfterMutation(true);
            throw error;
          }
          if (researchFailed) throw researchFailure;
        });
        if (researchProgressionChanged) {
          observePowerDemandPhase("research-complete");
          // A changed progression epoch can unlock controls and alter project prices. A read-only
          // Research pass keeps the current catalogs and saving target established.
          progression.resetBuildingUnlockSample();
          if (
            isEnabled(settings, "autoBuild") ||
            isEnabled(settings, "autoStorage")
          ) {
            runPhase("post-research construction demand preparation", () => {
              progression.readUnlockedStorageBuildTargets();
              refreshDiscoveredSettings();
            });
          }
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
      // Only a native action attempt can change construction or Factory demand authority. A
      // read-only/no-op phase keeps the prepared demand sample for later consumers.
      //
      // Between Factory and Power the sample is shared by Jobs, Fleet, Mech, Genetics, Minor
      // Trait, Craft, the combat block, Tax, Government, Nanite, Supply and Eject, and that share
      // is deliberate rather than an oversight. What each of them changes, against what the sample
      // freezes:
      //
      //   * Jobs/Craftsmen change `civic.<job>.workers`, `city.foundry` and servant counts. The
      //     crafter demand block reads `civic.craftsman.max` and `resource[material].max`, neither
      //     of which this pass moves, and `isDemanded()` reads `amount` live.
      //   * The ordinary galaxy Fleet moves ships between defence regions. No frozen input names
      //     `galaxy`. The Truepath outer Fleet moves the shipyard blueprint and the ship count,
      //     which is `CapturedFleetDemand`'s frozen `nextShipCost`, so that pass ends the sample
      //     itself.
      //   * Mech spends Supply and Soul Gems and fills the bay. Those move the sample's `mechCosts`
      //     block, which only ever feeds the `Supply`/`Soul_Gem` requests, and no consumer between
      //     here and Power spends either; Power resamples.
      //   * Genetics and Minor Trait move Knowledge and Genes. Amounts are read live by
      //     `isDemanded()`, and a minor trait cannot unlock a technology, so the offered catalogs
      //     are unchanged.
      //   * Craft converts materials, so it changes amounts — again read live — and its own inputs
      //     are craftable materials, which no committed request names.
      //   * The combat block moves garrison, foreign state, `stats.attacks` and arbitrary resource
      //     amounts. The one frozen input it touches is `spyPurchaseReservation`, and that is
      //     correct as a pre-combat reading on purpose: the reserve describes the commitments
      //     entering Espionage, which decides before Battle can change any of them.
      //   * Tax and Government change the tax rate and `civic.govern`/`race.governor`, none of which
      //     the sample reads.
      //   * Nanite, Supply and Eject change their own allocation ledgers. Power reads those live.
      if (constructionMutationObserved) {
        invalidateDemandAfterMutation(true);
        observePowerDemandPhase("construction-invalidated");
      }
      observePowerDemandPhase("construction-complete");
      if (isEnabled(settings, "autoFactory")) {
        runPhase("autoFactory", () => {
          ensureFactoryControls();
          refreshDiscoveredSettings();
          factory.run();
        });
      }
      if (factoryMutationObserved) {
        invalidateDemandAfterMutation(false, false);
      }
      observePowerDemandPhase("factory-invalidated");
      const autoJobs = isEnabled(settings, "autoJobs");
      const autoCraftsmen = isEnabled(settings, "autoCraftsmen");
      let combinedJobs = false;
      if (autoJobs && autoCraftsmen) {
        const completed = runPriceSensitivePhase(
          "autoJobs with autoCraftsmen",
          () => {
            ensureCivicControls();
            refreshDiscoveredSettings();
            const prepared = fullJobs.prepare();
            combinedJobs = prepared.status === "ready";
            if (prepared.status === "ready")
              runPreparedJobsPhase(
                "autoJobs with autoCraftsmen",
                prepared.execution,
                prepared.input,
              );
            return true;
          },
        );
        // The combined path owns this settings combination even when the sampled command fails;
        // split passes must not make a second decision in the same cycle.
        if (!completed) combinedJobs = true;
      }
      if (autoJobs && !combinedJobs) {
        runPriceSensitivePhase("autoJobs", () => {
          ensureCivicControls();
          refreshDiscoveredSettings();
          runJobsPhase(
            "autoJobs",
            { ...ordinaryJobs, onCoherentPlan: publishSpaceMinerPlan },
            false,
          );
        });
      }
      if (autoCraftsmen && !combinedJobs) {
        runPriceSensitivePhase("autoCraftsmen", () => {
          ensureCivicControls();
          runJobsPhase("autoCraftsmen", craftsmen, true);
        });
      }
      // Fleet reassigns already-built ships and settles the defence ledger. Power reads that
      // ledger live at its own phase, so Fleet needs no adjacency to it; what Fleet does own is
      // the shipyard target, and only the Truepath outer pass can move that.
      if (isEnabled(settings, "autoFleet")) {
        const outerResult = runPhase("autoFleet", () => {
          const truepath = isCapturedTruepath(pageCapture.rootState.readRoot());
          if (truepath) {
            ensureOuterFleetControls();
            ensureOuterFleetGarrison();
            return outerFleet.autoFleetOuter();
          }
          ensureGalaxyFleetControls();
          runFleetAutomation({
            reader: fleet.reader,
            executor: fleet.executor,
          });
          return undefined;
        });
        // `CapturedFleetDemand` freezes `nextShipCost`, which is the Truepath shipyard blueprint's
        // own cost. The outer pass changes that by setting blueprint parts and by building a ship,
        // so a sample created by Jobs/Craftsmen or any earlier consumer must not survive it. The
        // ordinary galaxy pass never touches the blueprint or the ship count, and never reads that
        // shipyard cost, so it ends nothing.
        if (outerResult?.shipTargetChanged === true) {
          invalidateDemandAfterMutation(false, false);
        }
      }
      // After Build, so construction has first claim on the supplies a Mech reservation holds.
      if (isEnabled(settings, "autoMech")) {
        runPhase("autoMech", () => {
          ensureMechControls();
          const result = runCapturedMechAutomationWithActivity({
            ...capturedMech,
            random: capturedMechRandom,
          });
          capturedMechCycleHasPendingWork = result.hasPendingWork;
          const outcome = result.outcome;
          if (outcome.status === "succeeded" && result.hasPendingWork)
            invalidateDemandAfterMutation(false, false);
          if (outcome.status !== "succeeded") {
            reportOnce(
              `autoMech: ${outcome.failure.code}: ${outcome.failure.message}`,
            );
          }
        });
      }
      // Genetics spends Knowledge, so it runs after Research and Build have had first claim on
      // it and after the Fleet/Mech reservations are settled. A gene is Genes, not a craftable.
      const geneticsAutomationEnabled =
        isEnabled(settings, "autoGenetics") ||
        isEnabled(settings, "autoMinorTrait") ||
        isEnabled(settings, "autoMutateTraits");
      if (geneticsAutomationEnabled) {
        runPriceSensitivePhase("autoGenetics", () => {
          if (isEnabled(settings, "autoGenetics"))
            ensureGeneticsControl(GENETICS_CONTROL, "genetics-sequencer", 2);
          if (isEnabled(settings, "autoGenetics")) {
            runGeneticsAutomation(genetics);
          }
        });
      }
      // A newly bought minor trait is usable right away, so this follows genetics.
      if (isEnabled(settings, "autoMinorTrait")) {
        const outcome = runPriceSensitivePhase("autoMinorTrait", () => {
          ensureGeneticsControl(GENE_SLOTS_CONTROL, "genetics-gene-slots", 3);
          return traits.autoMinorTrait();
        });
        if (outcome !== undefined && outcome.status !== "succeeded") {
          reportOnce(
            `autoMinorTrait: ${outcome.failure.code}: ${outcome.failure.message}`,
          );
        }
      }
      // Craft converts raw inputs into craftables, so it runs after every feature that has
      // claimed raw inputs this cycle and before the combat and civic tail.
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
          ensureForeignControls();
          return runCapturedSpyTraining(capturedSpyTraining);
        });
        if (outcome !== undefined && outcome.status !== "succeeded") {
          reportOnce(
            `autoFight.spy: ${outcome.failure.code}: ${outcome.failure.message}`,
          );
        }
        // The synthetic Espionage executor runs the game's own captured operations, so the phase
        // needs no tab, no panel and no modal — but it does need the `foreign` closure those
        // operations come from, which only the Government draw establishes. Skipped entirely when
        // the Governor owns espionage: the phase would immediately stand down, and spending a draw
        // to learn a fact the Governor already answered is the kind of pointless work this
        // discovery is otherwise rate-limited against.
        const espionageOutcome = runPhase("autoFight.espionage", () => {
          if (!capturedEspionage.isGovernorEspionageOwned()) {
            ensureForeignControls();
          }
          return runCapturedEspionageCycle();
        });
        if (
          espionageOutcome !== undefined &&
          espionageOutcome.status !== "succeeded" &&
          ![
            "captured-espionage-postcondition-pending",
            "captured-espionage-modal-conflict",
          ].includes(espionageOutcome.failure.code)
        ) {
          reportOnce(
            `autoFight.espionage: ${espionageOutcome.failure.code}: ${espionageOutcome.failure.message}`,
          );
        }
        if (shouldRunCapturedBattleAfterEspionage(espionageOutcome)) {
          const battleOutcome = runPhase("autoFight.battle", () => {
            // Foreign and the compact Garrison come out of the same Government draw, so this is
            // one pass rather than a Civic draw plus a Government one.
            ensureForeignControls();
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
          ensureGovernmentPanelControls("tax");
          tax.autoTax();
        });
      }
      if (isEnabled(settings, "autoGovernment")) {
        runPriceSensitivePhase("autoGovernment", () => {
          ensureGovernmentPanelControls("type");
          ensureGovernmentPanelControls("candidates");
          runCapturedGovernmentAutomation(government);
        });
      } else {
        government.cancelPending();
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
      if (isEnabled(settings, "autoPower")) {
        // Research or another progression mutation can invalidate the earlier offer sample.
        // Its owning phase establishes a current catalog before Power's read-only handoff.
        runPhase("pre-Power research demand observation", () => {
          ensureDemandResearchObservation();
        });
        if (
          hasCapturedProjectStorageDemand(settings, settingsStorage.readRaw())
        ) {
          runPhase("pre-Power project demand discovery", () => {
            progression.readProjects();
            refreshDiscoveredSettings();
          });
        }
        if (
          isEnabled(settings, "autoBuild") ||
          isEnabled(settings, "autoStorage")
        ) {
          runPhase("pre-Power build demand preparation", () => {
            progression.readUnlockedStorageBuildTargets();
            refreshDiscoveredSettings();
          });
        }
        runPhase("autoPower", () => {
          activeRuntimeMeasure.measure("autoPower.demandPreparation", () => {
            observePowerDemandPhase("power-handoff-start");
            // The owning mutators have already expired demand authority when its captured inputs
            // changed. Power may reuse that prepared input when the epoch is unchanged; its live
            // holding checks read the current root, and exactness uses the retained completeness
            // metadata instead of capturing the same catalogs again.
            // Earlier research/construction may have opened a reservation gate. Revalidate
            // its current prerequisites without drawing; an uncaptured new gate stays stale.
            // Earlier mutations can clear the cycle-start report. Rebuild its status from the
            // controls already captured by their owning phases; no discovery is allowed here,
            // so a newly required but absent authority still fails closed as unavailable.
            const prerequisites = ensureDemandPrerequisiteControls({
              root: pageCapture.rootState.readRoot(),
              settings,
              controls: pageCapture.controls,
              ensureForeignControls: () => undefined,
              ensureBuildControls: () => undefined,
            });
            demandPrerequisitesThisCycle = prerequisites;
            const buildDemandRequired =
              isEnabled(settings, "autoBuild") ||
              isEnabled(settings, "autoStorage");
            if (
              !isRecord(
                readProperty(pageCapture.rootState.readRoot(), "resource"),
              )
            )
              exactDemandUnavailableReason = "root resource state unavailable";
            else if (prerequisites === undefined)
              exactDemandUnavailableReason = "demand prerequisites unavailable";
            else if (prerequisites.spy === "unavailable")
              exactDemandUnavailableReason =
                "demand prerequisite spy unavailable";
            else if (prerequisites.ai === "unavailable")
              exactDemandUnavailableReason =
                "demand prerequisite ai unavailable";
            else if (
              isEnabled(settings, "autoTrigger") &&
              triggerTargetsThisCycle === undefined
            )
              exactDemandUnavailableReason =
                "trigger target snapshot unavailable";
            else if (
              hasCapturedProjectStorageDemand(
                settings,
                settingsStorage.readRaw(),
              ) &&
              progression.readEstablishedProjects() === undefined
            )
              exactDemandUnavailableReason =
                "enabled project-storage catalog unavailable";
            else if (
              buildDemandRequired &&
              progression.readEstablishedStorageBuildTargets() === undefined
            )
              exactDemandUnavailableReason =
                "managed build target snapshot unavailable";
            else {
              diagnostics?.recordCount("demand.sampleOwner.Power", 1);
              const exact = demand.sampleExact();
              if (exact.status === "ready") {
                demandThisCycle = exact.sample;
                demandSampleEpoch = demandEpoch;
              } else exactDemandUnavailableReason = exact.reason.message;
            }
            observePowerDemandPhase("power-ready");
          });
          const outcome = activeRuntimeMeasure.measure("autoPower.runner", () =>
            powerAutomation.run(),
          );
          observePowerDemandPhase("power-complete", outcome);
          if (outcome !== undefined && outcome.status !== "succeeded")
            reportOnce(
              `autoPower: ${outcome.failure.code}: ${outcome.failure.message}`,
            );
        });
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
      if (
        settings["prestigeType"] === "mad" &&
        diagnostics?.readPerformanceEnabled() === true
      ) {
        runCapturedDiagnosticSafely(
          () => {
            const root = pageCapture.rootState.readRoot();
            const progressionEpoch = progression.readProgressionEpoch();
            const researchRootGeneration = progression.readRootGeneration();
            const offers = progression.readOfferedTechs();
            const researchDefinitions =
              progression.readResearchActionDefinitions();
            const researchGrantLevels = readResearchGrantLevels(
              root,
              researchDefinitions,
            );
            const researchApplicability = readCapturedTechApplicability(
              root,
              researchDefinitions,
            );
            const prerequisiteSnapshot = activeRuntimeMeasure.measure(
              "goal.mad.prerequisite-preparation",
              () =>
                createEffectiveCapturedTechPrerequisiteSnapshot(
                  researchDefinitions,
                  {
                    rootGeneration: researchRootGeneration,
                    progressionEpoch,
                  },
                ),
            );
            diagnostics?.recordCount(
              "goal.mad.effective-prerequisite-definitions",
              prerequisiteSnapshot.definitions?.length ?? 0,
            );
            const researchOfferGenerations =
              offers
                ?.map((offer): readonly [string, number] => [
                  offer.elementId,
                  offer.generation,
                ])
                .sort(([first], [second]) => first.localeCompare(second)) ??
              undefined;
            let rootIdentity: number | undefined;
            if (root !== null && typeof root === "object") {
              rootIdentity = researchRootIdentities.get(root);
              if (rootIdentity === undefined) {
                rootIdentity = nextResearchRootIdentity++;
                researchRootIdentities.set(root, rootIdentity);
              }
            }
            const currentMadControl =
              pageCapture.controls.resolve(CAPTURED_MAD_CONTROL);
            const nextResearchGraphKey = JSON.stringify({
              targetActionId: CAPTURED_MAD_RESEARCH_TECH,
              rootIdentity,
              progressionEpoch,
              rootGeneration: researchRootGeneration,
              effectivePrerequisites: prerequisiteSnapshot.identity,
              levels:
                researchGrantLevels === undefined
                  ? undefined
                  : [...researchGrantLevels],
              applicability:
                researchApplicability === undefined
                  ? undefined
                  : [...researchApplicability],
              offerGenerations: researchOfferGenerations,
              madControlGeneration: currentMadControl?.generation,
            });
            let researchPrerequisiteGraph: NativeResearchPrerequisiteGraph;
            const cachedResearchGraph = lastResearchGraph;
            if (
              cachedResearchGraph === undefined ||
              lastResearchGraphKey !== nextResearchGraphKey
            ) {
              diagnostics?.recordCount("goal.mad.graph-cache.rebuilds", 1);
              researchPrerequisiteGraph = activeRuntimeMeasure.measure(
                "goal.mad.research-prerequisites",
                () =>
                  planNativeResearchPrerequisites({
                    targetActionId: CAPTURED_MAD_RESEARCH_TECH,
                    definitions: prerequisiteSnapshot.definitions,
                    grantLevels: researchGrantLevels,
                    ...(researchApplicability === undefined
                      ? {}
                      : { applicabilityByActionId: researchApplicability }),
                    offeredActionIds:
                      offers === undefined
                        ? undefined
                        : new Set(offers.map((offer) => offer.elementId)),
                    offerGenerations:
                      offers === undefined
                        ? undefined
                        : new Map(
                            offers.map((offer) => [
                              offer.elementId,
                              offer.generation,
                            ]),
                          ),
                    cycle: automationCycle,
                    progressionEpoch,
                    rootGeneration: researchRootGeneration,
                    maxDepth: 16,
                    maxActions: 256,
                  }),
              );
              lastResearchGraphKey = nextResearchGraphKey;
              lastResearchGraph = researchPrerequisiteGraph;
            } else {
              diagnostics?.recordCount("goal.mad.graph-cache.hits", 1);
              researchPrerequisiteGraph = activeRuntimeMeasure.measure(
                "goal.mad.research-graph-cache-reuse",
                () =>
                  Object.freeze({
                    ...cachedResearchGraph,
                    freshness: Object.freeze({
                      ...cachedResearchGraph.freshness,
                      cycle: automationCycle,
                      offerGenerations:
                        researchOfferGenerations === undefined
                          ? undefined
                          : Object.freeze(
                              researchOfferGenerations.map(
                                ([actionId, generation]) =>
                                  Object.freeze([
                                    actionId,
                                    generation,
                                  ] as const),
                              ),
                            ),
                    }),
                  }),
              );
            }
            const researchRequirementById = new Map(
              researchPrerequisiteGraph.requirements.map((gate) => [
                gate.id,
                gate,
              ]),
            );
            const researchTargetDefinition =
              prerequisiteSnapshot.definitions?.find(
                (definition) =>
                  definition.actionId ===
                  researchPrerequisiteGraph.targetActionId,
              );
            const researchDirectRequirements =
              researchTargetDefinition?.prerequisites.kind === "declared"
                ? researchTargetDefinition.prerequisites.requirements
                : [];
            const researchDirectGates = researchDirectRequirements.flatMap(
              (prerequisite) => {
                const gate = researchRequirementById.get(
                  `research:${prerequisite.technologyId}:${prerequisite.requiredLevel}`,
                );
                return gate === undefined
                  ? []
                  : [
                      {
                        technology: gate.technologyId,
                        required: gate.requiredLevel,
                        observed: gate.observedLevel,
                        declaredStatus: gate.declaredStatus,
                        status: gate.status,
                      },
                    ];
              },
            );
            const researchFrontier =
              researchPrerequisiteGraph.actionableFrontier.map((actionId) => {
                const offer = offers?.find(
                  (candidate) => candidate.elementId === actionId,
                );
                return {
                  actionId,
                  ...(offer === undefined
                    ? {}
                    : {
                        observedCost: offer.cost,
                        nativeAffordable: offer.nativeAffordable,
                      }),
                };
              });
            const researchSignature = nextResearchGraphKey;
            const madControl =
              pageCapture.controls.resolve(CAPTURED_MAD_CONTROL);
            const plan = observeCapturedMadGoal(
              root,
              settings,
              offers,
              capturedResetCommittedThisCycle,
              automationCycle,
              progressionEpoch,
              madControl !== undefined &&
                madControl.methods.includes("arm") &&
                madControl.methods.includes("launch"),
            );
            const researchCandidateEvaluation = activeRuntimeMeasure.measure(
              "goal.mad.research-candidate-evaluation",
              () => {
                const researchOffers = offers ?? [];
                diagnostics?.recordCount("goal.mad.candidate-evaluations", 1);
                diagnostics?.recordCount(
                  "goal.mad.candidate-offers",
                  researchOffers.length,
                );
                const obligationTargetEligibility =
                  plan.selectedGoal.id === "prestige:mad"
                    ? combineCapturedTechEligibility([
                        researchApplicability?.get(
                          CAPTURED_MAD_RESEARCH_TECH,
                        ) ?? {
                          status: "unknown",
                          reasons: [
                            "current Research applicability is unavailable",
                          ],
                        },
                        readCapturedMadTargetCondition(root),
                      ])
                    : {
                        status: "excluded" as const,
                        reasons: ["MAD is not the selected goal"],
                      };
                const obligations = activeRuntimeMeasure.measure(
                  "goal.mad.obligation-classification",
                  () =>
                    classifyMandatoryNativeResearchObligations(
                      researchPrerequisiteGraph,
                      {
                        targetEligibility:
                          bindNativeResearchEligibilityEvidence(
                            researchPrerequisiteGraph,
                            {
                              actionId: CAPTURED_MAD_RESEARCH_TECH,
                              ...obligationTargetEligibility,
                            },
                          ),
                        definitions: prerequisiteSnapshot.definitions,
                        grantLevels: researchGrantLevels,
                        applicabilityByActionId: researchApplicability,
                        offeredActionIds: new Set(
                          researchOffers.map((offer) => offer.elementId),
                        ),
                      },
                    ),
                );
                diagnostics?.recordCount(
                  "goal.mad.obligation-classifications",
                  1,
                );
                const currentFrontierIds = new Set(
                  researchPrerequisiteGraph.actionableFrontier,
                );
                const frontierResourceIds = [
                  ...new Set(
                    researchOffers
                      .filter((offer) =>
                        currentFrontierIds.has(offer.elementId),
                      )
                      .flatMap((offer) => Object.keys(offer.cost)),
                  ),
                ];
                const frontierResources = activeRuntimeMeasure.measure(
                  "goal.mad.frontier-resource-acquisition",
                  () =>
                    createCapturedResourceSource(
                      pageCapture.rootState,
                    ).readResources(frontierResourceIds),
                );
                diagnostics?.recordCount(
                  "goal.mad.frontier-resource-reads",
                  frontierResourceIds.length,
                );
                const validityEpoch = `${progressionEpoch}|root:${researchRootGeneration ?? "unknown"}|cycle:${automationCycle}`;
                const resourceStocks: GoalResourceStock[] =
                  frontierResourceIds.flatMap((resourceId) => {
                    const resource =
                      frontierResources?.resources.get(resourceId);
                    return resource?.present
                      ? [
                          {
                            resourceId,
                            poolId: "anywhere",
                            amount: resource.amount,
                            capacity: resource.max,
                            netRate: resource.rateOfChange,
                            rateConfidence: "observed",
                            validityEpoch,
                          },
                        ]
                      : [];
                  });
                return activeRuntimeMeasure.measure(
                  "goal.mad.candidate-feasibility-ranking",
                  () =>
                    evaluateResearchGoalCandidates({
                      goalId: plan.selectedGoal.id,
                      targetActionId: CAPTURED_MAD_RESEARCH_TECH,
                      goalSatisfied:
                        researchPrerequisiteGraph.targetStatus === "satisfied",
                      graph: researchPrerequisiteGraph,
                      cycle: automationCycle,
                      progressionEpoch,
                      rootGeneration: researchRootGeneration,
                      obligations,
                      resourceStocks,
                      commitmentsKnown: false,
                      offers: researchOffers.map((offer, index) => {
                        return {
                          actionId: offer.elementId,
                          grantTechnology: offer.grantTechnology,
                          grantLevel: offer.grantLevel,
                          index,
                          generation: offer.generation,
                          cost: offer.cost,
                          nativeAffordable: offer.nativeAffordable,
                          resourceAffordable: undefined,
                          hasCostConflict: undefined,
                          hasExplicitExclusion: undefined,
                        };
                      }),
                      baselineSelectedActionId: undefined,
                    }),
                );
              },
            );
            if (
              typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
              __EA_TEST_SURFACE_ENABLED__ === true
            ) {
              const hooks = readProperty(
                settingsHostWindow,
                "__EA_TEST_HOOKS__",
              );
              if (isRecord(hooks)) {
                if (
                  readProperty(
                    hooks,
                    "researchGoalCandidateEvaluationFirst",
                  ) === undefined
                )
                  Reflect.set(
                    hooks,
                    "researchGoalCandidateEvaluationFirst",
                    researchCandidateEvaluation,
                  );
                Reflect.set(
                  hooks,
                  "researchGoalCandidateEvaluation",
                  researchCandidateEvaluation,
                );
              }
            }
            const currentOffers = progression.readOfferedTechs();
            const currentTechMad = currentOffers?.find(
              (offer) => offer.elementId === CAPTURED_MAD_RESEARCH_TECH,
            );
            const currentTechMadControl = pageCapture.controls.resolve(
              CAPTURED_MAD_RESEARCH_TECH,
            );
            const rootIsCurrent = pageCapture.rootState.readRoot() === root;
            const progressionIsCurrent =
              progression.readProgressionEpoch() === progressionEpoch;
            const researchRootGenerationIsCurrent =
              progression.readRootGeneration() === researchRootGeneration;
            const madBindingIsCurrent =
              pageCapture.controls.resolve(CAPTURED_MAD_CONTROL)?.generation ===
              madControl?.generation;
            const currentResearchOfferGenerations =
              currentOffers
                ?.map((offer): readonly [string, number] => [
                  offer.elementId,
                  offer.generation,
                ])
                .sort(([first], [second]) => first.localeCompare(second)) ??
              undefined;
            const researchOfferSampleIsCurrent =
              JSON.stringify(currentResearchOfferGenerations) ===
                JSON.stringify(researchOfferGenerations) &&
              researchFrontier.every((frontierOffer) => {
                const currentOffer = currentOffers?.find(
                  (offer) => offer.elementId === frontierOffer.actionId,
                );
                return (
                  currentOffer !== undefined &&
                  currentOffer.generation ===
                    offers?.find(
                      (offer) => offer.elementId === frontierOffer.actionId,
                    )?.generation &&
                  JSON.stringify(currentOffer.cost) ===
                    JSON.stringify(frontierOffer.observedCost) &&
                  currentOffer.nativeAffordable ===
                    frontierOffer.nativeAffordable
                );
              });
            const researchBindingIsCurrent =
              researchOfferSampleIsCurrent &&
              (currentTechMad === undefined ||
                currentTechMadControl?.generation ===
                  currentTechMad.generation);
            if (
              !rootIsCurrent ||
              !progressionIsCurrent ||
              !researchRootGenerationIsCurrent ||
              !madBindingIsCurrent ||
              !researchBindingIsCurrent
            ) {
              reportOnce(
                `goal.mad unavailable=observation crossed a root, progression, or binding generation`,
              );
            } else {
              const signature = JSON.stringify({
                selectedGoal: plan.selectedGoal.id,
                status: plan.status,
                currentSubgoal: plan.currentSubgoal,
                frontierTrace: plan.frontierTrace,
                blockers: plan.blockers,
                unavailableFacts: plan.unavailableFacts,
                affordability: plan.affordability,
                researchFrontierEconomics: researchFrontier.map((offer) => ({
                  actionId: offer.actionId,
                  cost: offer.observedCost,
                  nativeAffordable: offer.nativeAffordable,
                })),
                researchSignature,
                strategyComparison:
                  plan.strategyComparison === undefined
                    ? undefined
                    : {
                        goalId: plan.strategyComparison.goalId,
                        winner: plan.strategyComparison.winner,
                        provisionalWinner:
                          plan.strategyComparison.provisionalWinner,
                        rankedStrategyIds:
                          plan.strategyComparison.rankedStrategyIds,
                        strategies: plan.strategyComparison.strategies.map(
                          (strategy) => ({
                            id: strategy.id,
                            status: strategy.status,
                            rankable: strategy.rankable,
                            actionable: strategy.actionable,
                            authority: strategy.authority,
                            completionTime:
                              strategy.completionTime === undefined
                                ? undefined
                                : strategy.completionTime.toFixed(2),
                            unavailableReasons: strategy.unavailableReasons,
                          }),
                        ),
                      },
                requirements: plan.quantitativeRequirements.map(
                  (requirement) => ({
                    resourceId: requirement.resourceId,
                    amount: requirement.amount,
                    stock:
                      requirement.held === undefined
                        ? "unknown"
                        : requirement.held < requirement.amount
                          ? "below"
                          : "enough",
                    capacity:
                      requirement.capacity === undefined ||
                      requirement.capacity < 0
                        ? "unlimited-or-unknown"
                        : requirement.capacity < requirement.amount
                          ? "below"
                          : "enough",
                    production:
                      requirement.netRate === undefined
                        ? "unknown"
                        : requirement.netRate <= 0
                          ? "nonpositive"
                          : "positive",
                  }),
                ),
              });
              if (signature !== lastMadGoalDiagnostic) {
                lastMadGoalDiagnostic = signature;
                const goalQuantityDisplay = (value: number | undefined) =>
                  value === undefined ? "?" : String(Math.round(value));
                const goalCapacityDisplay = (value: number | undefined) =>
                  value !== undefined && value < 0
                    ? "unlimited"
                    : goalQuantityDisplay(value);
                const goalEtaDisplay = (value: number | undefined) =>
                  value === undefined ? "?" : `${value.toFixed(2)}s`;
                const requirements = plan.quantitativeRequirements
                  .map(
                    (requirement) =>
                      `${requirement.resourceId}:${goalQuantityDisplay(requirement.held)}/${goalQuantityDisplay(requirement.amount)}@${goalCapacityDisplay(requirement.capacity)}#${goalQuantityDisplay(requirement.netRate)}`,
                  )
                  .join(";");
                const directResearchGates = researchDirectGates
                  .map(
                    (gate) =>
                      `${gate.technology}@${gate.required}=${gate.observed ?? "?"}:${gate.declaredStatus === "satisfied" ? "ok" : gate.declaredStatus === "unsatisfied" ? "miss" : "?"}/${gate.status === "satisfied" ? "ok" : gate.status === "unsatisfied" ? "miss" : gate.status === "conditional" ? "cond" : "?"}`,
                  )
                  .join(",");
                const highTechResearchChain =
                  researchPrerequisiteGraph.requirements
                    .filter(
                      (gate) =>
                        gate.technologyId === "high_tech" &&
                        gate.requiredLevel < 7,
                    )
                    .sort(
                      (left, right) => left.requiredLevel - right.requiredLevel,
                    )
                    .map(
                      (gate) =>
                        `H${gate.requiredLevel}=${gate.observedLevel ?? "?"}:${gate.declaredStatus === "satisfied" ? "ok" : gate.declaredStatus === "unsatisfied" ? "miss" : "?"}/${gate.status === "satisfied" ? "ok" : gate.status === "unsatisfied" ? "miss" : gate.status === "conditional" ? "cond" : "?"}`,
                    )
                    .join(">");
                const frontierResearchOffers = researchFrontier
                  .slice(0, 1)
                  .map((offer) => {
                    const cost = offer.observedCost?.["Knowledge"];
                    return `${offer.actionId}:K${cost ?? "?"}:${offer.nativeAffordable === true ? "ok" : "blocked"}`;
                  })
                  .join(",");
                const unavailableResearchReason =
                  researchPrerequisiteGraph.unavailableFacts[0]?.slice(0, 72);
                reportDiagnostic(
                  `goal.mad status=${plan.status} selected=${plan.selectedGoal.id} subgoal=${plan.currentSubgoal ?? "none"} frontier=${plan.frontierTrace.join(">")} blockers=${plan.blockers.join(",")}`,
                );
                reportDiagnostic(
                  `goal.mad affordability=${plan.affordability} requirements=${requirements}`,
                );
                if (plan.strategyComparison !== undefined) {
                  const wait = plan.strategyComparison.strategies.find(
                    (strategy) => strategy.id === "wait",
                  );
                  reportDiagnostic(
                    `goal.mad comparison goal=${plan.strategyComparison.goalId} winner=${plan.strategyComparison.winner ?? "none"} provisional=${plan.strategyComparison.provisionalWinner ?? "none"} ranked=${plan.strategyComparison.rankedStrategyIds.join(",")} wait=${goalEtaDisplay(wait?.completionTime)} authority=${wait?.authority ?? "unavailable"}`,
                  );
                  reportDiagnostic(
                    `goal.mad forecast native-diff=resource/second future-stock=forecast-only rate=constant-rate assumption; observed-rate uncertainty applies`,
                  );
                  for (const strategy of plan.strategyComparison.strategies) {
                    if (strategy.id === "wait") continue;
                    reportDiagnostic(
                      `goal.mad strategy ${strategy.id} status=${strategy.status} rankable=${strategy.rankable} actionable=${strategy.actionable} authority=${strategy.authority} reason=${strategy.unavailableReasons.join("|")}`,
                    );
                  }
                }
                reportDiagnostic(
                  `goal.mad unavailable=${plan.unavailableFacts.join(";")} freshness=cycle:${plan.freshness.cycle},offer:${plan.freshness.offerGeneration ?? "none"}`,
                );
                reportDiagnostic(
                  `goal.mad research target=${researchPrerequisiteGraph.targetStatus} direct=${directResearchGates} chain=${highTechResearchChain || "?"} offered=${frontierResearchOffers} unknown=cond/route/trait-gene/queue/cement${researchPrerequisiteGraph.targetStatus === "unavailable" ? ` why=${unavailableResearchReason ?? "unspecified"}` : ""}`,
                );
                const candidateClasses = [
                  "verified-prerequisite",
                  "conditional-prerequisite",
                  "optional-investment",
                  "unrelated",
                  "unavailable",
                ] as const;
                const candidateSummary = candidateClasses
                  .map((relevance) => {
                    const candidates =
                      researchCandidateEvaluation.candidates.filter(
                        (candidate) => candidate.relevance === relevance,
                      );
                    const actionIds =
                      relevance === "verified-prerequisite" ||
                      relevance === "conditional-prerequisite"
                        ? candidates.map(
                            (candidate) =>
                              `${candidate.actionId}:${candidate.affordability}`,
                          )
                        : [];
                    return `${relevance}=${actionIds.join("+") || candidates.length}`;
                  })
                  .join(";");
                reportDiagnostic(
                  `goal.mad research candidates goal=${researchCandidateEvaluation.goalId} economicPreference=${researchCandidateEvaluation.preference} baseline=${researchCandidateEvaluation.baselineSelectedActionId ?? "unobserved"}:${researchCandidateEvaluation.baselineSelectedDisposition ?? "unavailable"} offers=${candidateSummary}`,
                );
                const selectedFrontier =
                  researchCandidateEvaluation.frontierSelection;
                const frontierTimes = selectedFrontier.comparedActionIds
                  .map((actionId) => {
                    const candidate =
                      researchCandidateEvaluation.candidates.find(
                        (entry) => entry.actionId === actionId,
                      );
                    return `${actionId}:${goalEtaDisplay(candidate?.frontierTime?.estimatedTime)}`;
                  })
                  .join(",");
                reportDiagnostic(
                  `goal.mad frontier selection status=${selectedFrontier.status} action=${selectedFrontier.actionId ?? "none"} compared=${frontierTimes || "none"} terminalEffects=unknown commitments=unobserved reason=${selectedFrontier.reasons[0] ?? "none"}`,
                );
              }
            }
          },
          (error) =>
            reportOnce(
              `goal.mad observation failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
        );
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
          ensureGeneticsControl(GENE_SLOTS_CONTROL, "genetics-gene-slots", 3);
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
      cycleMeasure.measure("tick.finalization", () => {
        // Publish test-only claims after all progression-mutating phases. A claim
        // refreshed immediately after Research could be stale by the next Gather
        // pass if a later feature changed the progression epoch.
        if (
          typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
          __EA_TEST_SURFACE_ENABLED__ === true
        )
          refreshResourceClaim();
        cycleMeasure.measure("planning-panel refresh", () =>
          refreshCapturedPlanningPanels(),
        );
        cycleMeasure.measure("State Log work", () =>
          stateLogRecorder.recordProcessedCycle(automationCycle, settings),
        );
        currentStateLogConstructionSnapshot = null;
        stateLogPlannerDetailsDue = false;
      });
      if (profiling !== undefined && workStartedAtMs !== undefined) {
        const elapsedMs = profiling.nowMs() - workStartedAtMs;
        cycleMeasure.record(
          "tick.scaffolding",
          Math.max(0, elapsedMs - cycleMeasure.readTotalMs()),
        );
        profiling.recordPerformance("tick", elapsedMs);
        profiling.flushPerformance();
      }
      activeRuntimeMeasure = createExclusivePhaseMeasure(undefined);
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
    const periodCounts = createCountTally(diagnostics);
    activeRuntimeMeasure = createExclusivePhaseMeasure(diagnostics);
    // Overrides need their context before this gate. Reset cycle-held offer samples here so an
    // override never answers from the previous cycle, and let a cycle that runs reuse this
    // same point-in-time sample for its trigger and progression work.
    periodCounts.count("period.totalPeriods");
    const gate = activeRuntimeMeasure.measure("period.wake", () => {
      activeRuntimeMeasure.measure("period.resetProjectSample", () =>
        progression.resetProjectSample(),
      );
      activeRuntimeMeasure.measure("period.resetBuildingUnlockSample", () =>
        progression.resetBuildingUnlockSample(),
      );
      // The gate is the first effective-settings consumer after a browser wake. Refresh before it
      // reads tickRate so an override can change cadence without waiting for a completed cycle.
      refreshEffectiveSettings(true);
      const next = activeRuntimeMeasure.measure("period.cadenceGate", () =>
        advancePeriodGate({
          pendingPeriods,
          completedPeriods: period.periods,
          periodsPerCycle: readPeriodsPerScriptCycle(settingsStore.readRaw()),
        }),
      );
      pendingPeriods = next.pendingPeriods;
      return next;
    });
    if (!gate.run) {
      periodCounts.count("period.skippedPeriods");
      return;
    }
    periodCounts.count("period.workingPeriods");
    runCycle();
  });
  return () => {
    unsubscribePeriods();
    removeStateLogExport();
    government.dispose();
  };
}
