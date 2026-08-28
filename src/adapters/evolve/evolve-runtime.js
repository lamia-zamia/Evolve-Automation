// This script forked from TMVictor's script version 3.3.1. Original script: https://gist.github.com/TMVictor/3f24e27a21215414ddc68842057482da
//
// Most of script options have tooltips, explaining what they do, read them if you have a questions.
//
// Here's some tips about non-intuitive features:
//   Script tends to do a lot of clicks. It highly recommended to have key multipliers enabled, and bound to Shift\Control\Alt\Meta keys(in any combinations) for best performance.
//   Ctrl+Click on almost any script option brings up advanced configurations, which allows to overide setting under certain conditions and set more advanced logic.
//     Triggers, evolution queue, log filters, smart powering for interlinked buildings(like transport and bireme), priorities(draggables), and overrides itself - cannot be overridden.
//     Overrides affects only script behaviour, GUI(outside of overrides modal) always show and changes default values.
//   autoMarket, autoGalaxyMarket, autoFactory, and autoMiningDroid use weightings and priorities to determine their tasks. Resources split by groups of same priority, and then resources within group having the best priority distributed according to their weights. If there's still some more unused routes\factories\drones after assigning, script moves to next group with lower priority, etc. In most cases only one group with highest priority is active and working, while other groups serve as fallback for cases when all resources with better priority are either capped, or, in case of factory, unaffordable. There's few special values for finer configuration:
//     Prioritization(queue, trigger, etc) does temporarily change priority of resource to 100, thus resources with priority above 100 won't be affected by prioritization.
//       You can also disable prioritization under General Settings, if you can't cope with it.
//     Priority of -1 it's special supplementary value meaning "same as current highest". Resources with this value will always be crafted among with whatever currently have highest priority, without disabling them.
//     Resources with 0 priority won't be crafted during normal workflow, unless prioritized(which increases priority).
//     Resources with 0 weighting won't ever be crafted, regardless of configured priority or prioritization.
//     autoMarket and autoFactory also have separate global checkboxes per resources, when they disabled(both buying and selling in case of autoMarket) - script won't touch them, leaving with whatever was manually set.
//   Added numbers in Mech Labs represents: design efficiency, real mech damage affected by most factors, and damage per used space, respectively. For all three - bigger numbers are better. Collectors show their supply collect rate.
//   Buildings\researches queue, triggers, and available researches prioritize missing resources, overiding other script settings. If you have issues with factories producing not what you want, market buying not what you want, and such - you can disable this feature under general settings.
//     Alternatively you may try to tweak options of producing facilities: resources with 0 weighting won't ever be produced, even when script tries to prioritize it. And resources with priority -1 will always have highest available priority, even when facility prioritizing something else. But not all facilities can be configured in that way.
//   Auto Storage assigns crates\containers to make enough storage to build all buildings with enabled Auto Build.
//     If some storage grew too high, taking all crates, you can disable expensive building, and Auto Storage won't try to fullfil its demands anymore. If you want to expand storage to build something manually, you can limit maximum level of building to 0, thus while it technically have auto build enabled, it won't ever be autobuilded, but you'll have needed storage.
//   Order in which buildings receive power depends on order in buildings settings, you can drag and drop them to adjust priorities.
//     Filtering works with names, some settings, and resource cost. E.g. you can filter for "build==on", "power==off", "weight<100", "soul gem>0", "iron>=1G" and such.
//     By default Ascension Trigger placed where it can be activated as soon as possible without killing soldiers or population, and reducing prestige rewards. But it still can hurt production badly. If you're planning to ascend at very first opportunity(i.e. not planning to go for pillar or such), you may enable auto powering it. Otherwise you may want to delay with it till the moment when you'll be ready. (Or you can just move it where it will be less impacting on production, but that also means it'll take longer to get enough power)
//     Auto Power have two toggles, first one enables basic management for building: based on priority, available power, support, and fuel. Logic behind second toggle is individual per building, but generally it tries to behave smart and save resources when it's enabled.
//   Evolution Queue can change any script settings, not only those which you have after adding new task, you can append any variables and their values manually, if you're capable to read code, and can find internal names and acceptable values of those variables. Settings applied at the moment when new evolution starts. (Or right before reset in case of Cataclysm)
//     Unavailable tasks in evolution queue will be ignored, so you can queue something like salamander and balorg, one after another, and configure script to pick either volcano or hellscape after bioseed. And, assuming you'll get either of these planets, it'll go for one of those two races. (You can configure more options to pick from, if you want)
//   Prestige > Ascension has custom-race handling and named presets with a full GUI editor. It can reuse the saved race, always pause in the lab for challenge-specific edits, or validate/import the selected preset and continue automatically.
//   Auto Smelter does adjust rate of Inferno fuel and Oil for best cost and efficiency, but only when Inferno directly above oil.
//   All settings can be reset to default at once by importing {} as script settings.
//   Autoclicker can trivialize many aspects of the game, and ruin experience. Spoil your game at your own risk!
//   Use of some advanced features to run your own custom code can cause the game to freeze on load if you add an infinite loop. Add ?safemode to the game's URL to temporarily deactivate script processing while still allowing access to configuration.

import {
  CONSUMPTION_BALANCE_MIN,
  CONSUMPTION_BALANCE_TARGET,
  SCRIPT_VERSION_EXTRA,
  numberSuffix,
  universes,
} from "../../config.ts";
import { k_combinations } from "../../utils/collections.ts";
import { Fibonacci, average } from "../../utils/math.ts";
import { createCustomExpressionAdapter as createCustomExpressionControl } from "../../adapters/evolve/custom-expression.ts";
import { createNumberFormatting as createNumberFormattingControl } from "../../formatting/numbers.ts";
import { createPropertyHelpers as createPropertyHelpersControl } from "../../utils/properties.ts";
import { createSettingsState as createSettingsStateControl } from "../../settings/state.ts";
import { createSettingsTransfer as createSettingsTransferControl } from "../../settings/transfer.ts";
import { createPlannerState as createPlannerStateControl } from "../../game/planner-state.ts";
import { createAuthorityPolicy as createAuthorityPolicyControl } from "../../game/authority-policy.ts";
import { createRunGuards as createRunGuardsControl } from "../../adapters/evolve/run-guards.ts";
import { createCostConflict as createCostConflictControl } from "../../adapters/evolve/cost-conflict.ts";
import { createPlannerStatsStore as createPlannerStatsStoreControl } from "../../adapters/storage/planner-stats.ts";
import { createStateLogStore as createStateLogStoreControl } from "../../adapters/storage/state-log-store.ts";
import { createPlannerStatsLifecycle as createPlannerStatsLifecycleControl } from "../../application/planner-stats.ts";
import { createEvolutionResultCheck as createEvolutionResultCheckControl } from "../../adapters/evolve/evolution-result-check.ts";
import { createQueueQueries as createQueueQueriesControl } from "../../adapters/evolve/queue-queries.ts";
import { createTargetTimingDisplay as createTargetTimingDisplayControl } from "../../adapters/evolve/target-timing-display.ts";
import { createTechConflict as createTechConflictControl } from "../../adapters/evolve/tech-conflict.ts";
import { createSettingsResetCompositionControl } from "../../bootstrap/settings-reset-composition-control.ts";
import {
  applySettings as applySettingsRecordControl,
  migrateSetting as migrateSettingRecordControl,
} from "../../domain/settings-migration.ts";
import {
  createDemandPrioritizationAction as createDemandPrioritizationActionControl,
  createStorageRequirementsAction as createStorageRequirementsActionControl,
} from "../../adapters/evolve/state-demand-actions.ts";
import {
  readAuthorityPolicyView as readAuthorityPolicyViewControl,
  readAuthorityQuantity as readAuthorityQuantityControl,
} from "../../adapters/evolve/civic/authority.ts";
import {
  createRuntimeLookupTables as createRuntimeLookupTablesControl,
  createInitialRuntimeState as createInitialRuntimeStateControl,
} from "../../adapters/evolve/runtime-state.ts";
import {
  createSettingsMigrationControl,
  createQueuedSettingsControl,
} from "../../bootstrap/settings-lifecycle-controls.ts";
import { createOverrideCompositionControl } from "../../bootstrap/override-composition-control.ts";
import { createBrowserRuntime as createBrowserRuntimeControl } from "../../adapters/browser/runtime.ts";
import { createGameCustomRaceLab as createGameCustomRaceLabControl } from "../../adapters/browser/game-custom-race-lab.ts";
import { createOptionsModalBrowserAdapter as createOptionsModalBrowserAdapterControl } from "../../adapters/browser/options-modal.ts";
import { createInterfaceSettingsBrowserAdapter as createInterfaceSettingsBrowserAdapterControl } from "../../adapters/browser/interface-settings.ts";
import { createStateLogSettingsBrowserAdapter as createStateLogSettingsBrowserAdapterControl } from "../../adapters/browser/state-log-settings.ts";
import { createRuntimeFoundationsControl } from "../../bootstrap/runtime-foundations-control.ts";
import { createManagerCompositionControl } from "../../bootstrap/manager-composition-control.ts";
import { formatRetirementShortfalls as formatRetirementShortfallsControl } from "../../application/retirement-prep.ts";
import { formatEvolutionLog as formatEvolutionLogControl } from "../../application/evolution-result.ts";
import { formatTechConflict as formatTechConflictControl } from "../../application/tech-conflicts.ts";
import { findPlannerLimit as findPlannerLimitControl } from "../../domain/planner-analysis.ts";
import { findRequiredResourceWeight as findRequiredResourceWeightControl } from "../../domain/economy/resources/resource-weighting.ts";
import {
  DEFAULT_VACUUM_MANA_REQUIREMENT as DEFAULT_VACUUM_MANA_REQUIREMENT_CONTROL,
  isVacuumCollapseManaStageReady as isVacuumCollapseManaStageReadyControl,
} from "../../domain/progression/prestige/vacuum.ts";
import { readForeignAchievementGoal as readForeignAchievementGoalControl } from "../../adapters/evolve/combat/foreign-achievements.ts";
import {
  readPlannerLimitInput as readPlannerLimitInputControl,
  readPlannerRun as readPlannerRunControl,
} from "../../adapters/evolve/planner-analysis.ts";
import { readWeightingCandidate as readWeightingCandidateControl } from "../../adapters/evolve/progression/build/weighting-candidate.ts";
import { createGameLifecycleControl } from "../../bootstrap/game-lifecycle-control.ts";
import { createFleetMechManagerControl as createFleetMechManagerCompositionControl } from "../../bootstrap/fleet-mech-manager-control.ts";
import { createScriptBootstrapControl } from "../../bootstrap/script-bootstrap-control.ts";
import { createCoreManagerCompositionControl } from "../../bootstrap/core-manager-composition-control.ts";
import { createGameControlSet } from "../../bootstrap/game-control-set.ts";
import { createMechIntelligence as createMechIntelligenceControl } from "../../game/mech-intelligence.ts";
import { createPlanetGeneration as createPlanetGenerationControl } from "../../game/planet-generation.ts";
import { createTraitValue as createTraitValueControl } from "../../game/trait-value.ts";
import { createCraftingCosts as createCraftingCostsControl } from "../../game/crafting-costs.ts";
import { createGameCompatibility as createGameCompatibilityControl } from "../../game/compatibility.ts";
import { createScriptDataLifecycleControl } from "../../bootstrap/script-data-lifecycle-control.ts";
import { createCustomRaceModelControl } from "../../bootstrap/custom-race-model-control.ts";
import {
  createStateInitializationControl,
  createRaceInitializationControl,
  createBuildingStateInitializationControl,
} from "../../bootstrap/initialization-controls.ts";
import { createEntityCompatibilitySurface } from "../../bootstrap/entity-compatibility-surface.ts";
import { createBuildPlannerControl } from "../../bootstrap/build-planner-control.ts";
import { createPriorityTargetsControl } from "../../bootstrap/priority-targets-control.ts";
import { createRuntimeIntelligenceControl } from "../../bootstrap/runtime-intelligence-control.ts";
import { createStateLogControl } from "../../bootstrap/state-log-control.ts";
import { createPrestigeAutomationCompositionControl } from "../../bootstrap/prestige-automation-composition-control.ts";
import { createLogFilterControl } from "../../bootstrap/log-filter-control.ts";
import { createUiSupportControl } from "../../bootstrap/ui-support-control.ts";
import { createTabRefreshControl } from "../../bootstrap/tab-refresh-control.ts";
import { createRuntimeUiCompositionControl } from "../../bootstrap/runtime-ui-composition-control.ts";
import { createStateLogSettingsIntentHandler as createStateLogSettingsIntentControl } from "../../application/state-log-settings.ts";
import { createInterfaceSettingsIntentHandler as createInterfaceSettingsIntentControl } from "../../application/interface-settings.ts";
import { createTopBarControls } from "../../bootstrap/top-bar-controls.ts";
import { createToggleControls } from "../../bootstrap/toggle-controls.ts";
import { createTickRunner as createTickCompositionControl } from "../../bootstrap/tick-runner.ts";
import { createStateUpdateControl } from "../../bootstrap/state-update-control.ts";
import { createBrowserClock as createBrowserClockControl } from "../../adapters/browser/clock.ts";
import { createPeriodGate as createPeriodGateControl } from "../../adapters/browser/period-gate.ts";
import { createBrowserRandomSource as createBrowserRandomSourceControl } from "../../adapters/browser/random.ts";
import { createUserscriptEnvironment as createUserscriptEnvironmentControl } from "../../adapters/userscript/environment.ts";
import { createBuildingWeightingControl } from "../../bootstrap/building-weighting-control.ts";
import { createTradeRoutes as createTradeRouteControl } from "../../adapters/evolve/trade-routes.ts";
import {
  biomeList,
  traitList,
  extraList,
  planetBiomes,
  planetTraits,
  planetBiomeGenus,
  fanatAchievements,
  challenges,
  governors,
  evolutionSettingsToStore,
  logIgnore,
  galaxyRegions,
  settingsSections,
  mutationCostMultipliers,
  mutationCostMultipliersGenus,
  specialRaceTraits,
  conflictingTraits,
  replicableResources,
} from "./runtime-catalogs.ts";
import { createEarlyAutomationComposition } from "../../bootstrap/early-automation-composition-control.ts";
import { createTaxControl } from "../../bootstrap/tax-control.ts";
import { createStorageExpansionControl } from "../../bootstrap/storage-expansion-control.ts";
import { createResourceAutomationControl } from "../../bootstrap/resource-automation-control.ts";
import { createEvolutionControls } from "../../bootstrap/evolution-controls.ts";
import { createTraitAutomationCompositionControl } from "../../bootstrap/trait-automation-composition-control.ts";
import { createTraitFleetAutomationControl } from "../../bootstrap/trait-fleet-automation-control.ts";
import { createTriggerPowerAutomationControl } from "../../bootstrap/trigger-power-automation-control.ts";
import { createMarketProgressionAutomationControl } from "../../bootstrap/market-progression-automation-control.ts";
import { createLateSettingsControl } from "../../bootstrap/late-settings-control.ts";
import { createProgressionSettingsControl } from "../../bootstrap/progression-settings-control.ts";
import { createTriggerSettingsControl } from "../../bootstrap/settings/trigger-settings-control.ts";
import { createExtendedSettingsControl } from "../../bootstrap/extended-settings-control.ts";
import { createTraitSettingsControl } from "../../bootstrap/settings/trait-settings-control.ts";
import { createQueuePanels as createQueuePanelsControl } from "../../ui/queue-panels.ts";
import { createMechResourceUiControl } from "../../bootstrap/mech-resource-ui-control.ts";
import { createTooltipUiControl } from "../../bootstrap/tooltip-ui-control.ts";
import { createCustomRaceUiControl } from "../../bootstrap/custom-race-ui-control.ts";
import { createSettingsShell as createSettingsShellControl } from "../../ui/settings-shell.ts";
import { createSettingsEditorControl } from "../../bootstrap/settings-editor-control.ts";
import { createCoreSettingsPanelControl } from "../../bootstrap/core-settings-panel-control.ts";
import { createOverrideCatalog as createOverrideCatalogControl } from "../../settings/override-catalog.ts";
import { createScriptRuntimeUI as createScriptRuntimeUiControl } from "../../ui/script-runtime.ts";

export function startEvolveRuntime($, diagnostics, runtimeEnvironment) {
  startEvolveRuntimeComposition($, diagnostics, runtimeEnvironment);
}

export function startEvolveRuntimeComposition(
  $,
  diagnostics,
  runtimeEnvironment,
  testSurface,
  registerRuntimeSupportTestSurface,
) {
  "use strict";
  const TEST_SURFACE_ENABLED = globalThis.__EA_TEST_SURFACE_ENABLED__ === true;
  const getTestContext = TEST_SURFACE_ENABLED
    ? (name) => testSurface?.getContext(name)
    : () => undefined;
  const setTestContext = TEST_SURFACE_ENABLED
    ? (name, context) => testSurface?.setContext(name, context)
    : () => {};
  const testParts = [];
  const testContexts = [];
  const registerTestPart = TEST_SURFACE_ENABLED
    ? (partFactory) => testParts.push(partFactory())
    : () => {};
  const registerTestContext = TEST_SURFACE_ENABLED
    ? (contextFactory) => testContexts.push(contextFactory())
    : () => {};
  const { getRealNumber, getNumberString, getNiceNumber } =
    createNumberFormattingControl({ numberSuffix });
  const browserClock = createBrowserClockControl();
  const randomSource = createBrowserRandomSourceControl();
  const {
    gameModal: initialGameModal,
    featureVisibility,
    settingsStore,
    settingsRaw: initialSettingsRaw,
  } = createRuntimeFoundationsControl({
    getDocument: () => runtimeEnvironment.document,
    getMutationObserver: () => runtimeEnvironment.MutationObserver,
    storage: runtimeEnvironment.storage,
  });
  let gameModal = initialGameModal;
  let settingsRaw = initialSettingsRaw;
  let settings = {};
  let game = null;
  let importSettings;
  let exportSettings;
  let poly;
  const { fastEval, cacheSize: fastEvalCacheSize } =
    createCustomExpressionControl({
      getScope: () => ({
        settings,
        state,
        game,
        resources,
        buildings,
        buildingIds,
        arpaIds,
        jobIds,
        techIds,
        races,
        poly,
        win,
        jobs,
        projects,
        universes,
        governors,
        challenges,
        biomeList,
        traitList,
        GovernmentManager,
        SmelterManager,
        FactoryManager,
        WarManager,
        FleetManager,
        MechManager,
        TriggerManager,
        GameLog,
        gameModal,
        getGovernor,
        haveTech,
        isAchievementUnlocked,
      }),
    });
  const {
    resetWarSettings,
    resetHellSettings,
    resetGeneralSettings,
    resetInterfaceSettings,
    resetStateLogSettings,
    resetAchievementGuardSettings,
    resetChallengeHelperSettings,
    resetPrestigeSettings,
    resetGovernmentSettings,
    resetAuthoritySettings,
    resetEvolutionSettings,
    resetResearchSettings,
    resetMarketSettings,
    resetStorageSettings,
    resetMinorTraitSettings,
    resetMutableTraitSettings,
    resetJobSettings,
    resetWeightingSettings,
    resetBuildingSettings,
    resetProjectSettings,
    resetMagicSettings,
    resetProductionSettings,
    resetTriggerSettings,
    resetLoggingSettings,
    resetPlanetSettings,
    resetFleetSettings,
    resetMechSettings,
    resetEjectorSettings,
  } = createSettingsResetCompositionControl({
    getSettingsRaw: () => settingsRaw,
    setSettingsRaw: (value) => {
      settingsRaw = value;
    },
    evolve: {
      AlchemyManager: () => AlchemyManager,
      biomeList: () => biomeList,
      BuildingManager: () => BuildingManager,
      buildings: () => buildings,
      challenges: () => challenges,
      DroidManager: () => DroidManager,
      EjectManager: () => EjectManager,
      extraList: () => extraList,
      FactoryManager: () => FactoryManager,
      game: () => game,
      GameLog: () => GameLog,
      GenusTrait: () => GenusTrait,
      GovernmentManager: () => GovernmentManager,
      initBuildingState: () => initBuildingState,
      JobManager: () => JobManager,
      jobs: () => jobs,
      MajorTrait: () => MajorTrait,
      MarketManager: () => MarketManager,
      MinorTrait: () => MinorTrait,
      MinorTraitManager: () => MinorTraitManager,
      MutableTraitManager: () => MutableTraitManager,
      NaniteManager: () => NaniteManager,
      ocularPowerData: () => ocularPowerData,
      planetBiomes: () => planetBiomes,
      planetTraits: () => planetTraits,
      poly: () => poly,
      ProjectManager: () => ProjectManager,
      projects: () => projects,
      ReplicatorManager: () => ReplicatorManager,
      resources: () => resources,
      RitualManager: () => RitualManager,
      SmelterManager: () => SmelterManager,
      StorageManager: () => StorageManager,
      SupplyManager: () => SupplyManager,
      traitList: () => traitList,
      TriggerManager: () => TriggerManager,
    },
  });
  const {
    removeScriptSettings,
    buildScriptSettings,
    buildImportExport,
    buildSettingsSectionImpl,
    buildSettingsSection,
    buildSettingsSection2,
    genericResetFunction,
    addStandardHeading,
    addSettingsHeader1,
    addSettingsHeader2,
  } = createSettingsShellControl({
    $,
    getDocument: () => runtimeEnvironment.document,
    getSettingsRaw: () => settingsRaw,
    getSettings: () => settings,
    getGame: () => game,
    buildPrestigeSettings: (...args) => buildPrestigeSettings(...args),
    buildGeneralSettings: (...args) => buildGeneralSettings(...args),
    buildInterfaceSettings: (...args) => buildInterfaceSettings(...args),
    buildStateLogSettings: (...args) => buildStateLogSettings(...args),
    buildAchievementGuardSettings: (...args) =>
      buildAchievementGuardSettings(...args),
    buildChallengeHelperSettings: (...args) =>
      buildChallengeHelperSettings(...args),
    buildGovernmentSettings: (...args) => buildGovernmentSettings(...args),
    buildAuthoritySettings: (...args) => buildAuthoritySettings(...args),
    buildEvolutionSettings: (...args) => buildEvolutionSettings(...args),
    buildPlanetSettings: (...args) => buildPlanetSettings(...args),
    buildTraitSettings: (...args) => buildTraitSettings(...args),
    buildTriggerSettings: (...args) => buildTriggerSettings(...args),
    buildResearchSettings: (...args) => buildResearchSettings(...args),
    buildWarSettings: (...args) => buildWarSettings(...args),
    buildHellSettings: (...args) => buildHellSettings(...args),
    buildMechSettings: (...args) => buildMechSettings(...args),
    buildFleetSettings: (...args) => buildFleetSettings(...args),
    buildEjectorSettings: (...args) => buildEjectorSettings(...args),
    buildMarketSettings: (...args) => buildMarketSettings(...args),
    buildStorageSettings: (...args) => buildStorageSettings(...args),
    buildMagicSettings: (...args) => buildMagicSettings(...args),
    buildProductionSettings: (...args) => buildProductionSettings(...args),
    buildJobSettings: (...args) => buildJobSettings(...args),
    buildBuildingSettings: (...args) => buildBuildingSettings(...args),
    buildWeightingSettings: (...args) => buildWeightingSettings(...args),
    buildProjectSettings: (...args) => buildProjectSettings(...args),
    buildLoggingSettings: (...args) => buildLoggingSettings(...args),
    filterBuildingSettingsTable: (...args) =>
      filterBuildingSettingsTable(...args),
    updateSettingsFromState: (...args) => updateSettingsFromState(...args),
    importSettings: (...args) => importSettings(...args),
    exportSettings: (...args) => exportSettings(...args),
    triggerFileDownload: (...args) => triggerFileDownload(...args),
    confirm: (...args) => runtimeEnvironment.confirm(...args),
  });

  const {
    buildSelectOptions,
    buildInputNode,
    buildObjectListInput,
    evaluateCheck: _,
    buildConditionType,
    buildConditionArg,
    buildConditionComparator,
    buildConditionRemove,
    buildConditionDuplicate,
    buildConditionEvalize,
    buildConditionRet,
    openOverrideModal,
    buildOverrideSettings,
    buildInputNodeForDisplay,
    changeDisplayInputNode,
    addSettingsToggle,
    addSettingsNumber,
    addSettingsString,
    addSettingsSelect,
    addSettingsList,
    addInputCallbacks,
    addTableInput,
    addToggleCallbacks,
    addTableToggle,
    buildTableLabel,
    resetCheckbox,
  } = createSettingsEditorControl({
    overrideEditor: {
      getSettingsRaw: () => settingsRaw,
      persistence: { save: () => updateSettingsFromState() },
    },
    settingsInputs: {
      getJQuery: () => $,
      getRealNumber: () => getRealNumber,
    },
    conditionControls: {
      getJQuery: () => $,
      getSettingsRaw: () => settingsRaw,
      getWin: () => win,
      getCheckCompareExpressions: () => checkCompareExpressions,
      getCheckCustom: () => checkCustom,
      getCheckTypes: () => checkTypes,
    },
    overrideControls: {
      getJQuery: () => $,
      getSettingsRaw: () => settingsRaw,
      getSettings: () => settings,
      getTechIds: () => techIds,
      getCheckCustom: () => checkCustom,
      getOverrideKey: () => overrideKey,
      getOpenOptionsModal: () => openOptionsModal,
      getSorterHelper: () => sorterHelper,
    },
    settingsControls: {
      getJQuery: () => $,
      getSettingsRaw: () => settingsRaw,
      getRealNumber: () => getRealNumber,
      getUpdateSettingsFromState: () => updateSettingsFromState,
    },
  });
  const {
    mechInfoReader,
    mechInfoObserver,
    mechInfoBrowserAdapter,
    resourceToggleReader,
    resourceToggleBrowserAdapter,
    createMarketToggles,
    removeMarketToggles,
    createStorageToggles,
    removeStorageToggles,
    createMechInfo,
    removeMechInfo,
  } = createMechResourceUiControl({
    getMechInfoGame: () => getTestContext("mechInfo")?.game ?? game,
    getMechManager: () =>
      getTestContext("mechInfo")?.MechManager ?? MechManager,
    getNiceNumber: (value) =>
      getTestContext("mechInfo")?.getNiceNumber?.(value) ??
      getNiceNumber(value),
    getMechInfoDocument: () => runtimeEnvironment.document,
    getMechInfoJQuery: () => $,
    getMechInfoVueById: (id) =>
      getTestContext("mechInfo")?.getVueById?.(id) ?? getVueById(id),
    getResourceToggleGame: () => getTestContext("resourceToggle")?.game ?? game,
    getSettingsRaw: () =>
      getTestContext("resourceToggle")?.settingsRaw ?? settingsRaw,
    getMarketManager: () =>
      getTestContext("resourceToggle")?.MarketManager ?? MarketManager,
    getStorageManager: () =>
      getTestContext("resourceToggle")?.StorageManager ?? StorageManager,
    getResourceToggleJQuery: () => $,
    addToggleCallbacks: (...args) =>
      (
        getTestContext("resourceToggle")?.addToggleCallbacks ??
        addToggleCallbacks
      )(...args),
  });
  const productionSettingsActions = {
    buildSettingsSection,
    addSettingsNumber,
    addSettingsSelect,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    addStandardHeading,
    buildTableLabel,
    getSorterHelper: () => sorterHelper,
  };
  const {
    productionSettingsBrowserAdapter,
    storageSettingsBrowserAdapter,
    magicSettingsBrowserAdapter,
    jobSettingsBrowserAdapter,
    weightingSettingsBrowserAdapter,
    buildingSettingsBrowserAdapter,
    projectSettingsBrowserAdapter,
    loggingSettingsBrowserAdapter,
  } = createCoreSettingsPanelControl({
    production: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: productionSettingsActions,
      getResources: () => resources,
      getCraftablesList: () => craftablesList,
      getSmelterManager: () => SmelterManager,
      getFactoryManager: () => FactoryManager,
      getDroidManager: () => DroidManager,
      getReplicatorManager: () => ReplicatorManager,
      getSettingsRaw: () => settingsRaw,
      resetProductionSettings: (...args) => resetProductionSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      removeCraftToggles: () => removeCraftToggles(),
      setSettingsRaw: (value) => {
        settingsRaw = value;
      },
      testSurface,
    },
    storage: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addSettingsToggle,
        addTableInput,
        addTableToggle,
        buildTableLabel,
        getSorterHelper: () => sorterHelper,
      },
      getStorageManager: () => StorageManager,
      getSettingsRaw: () => settingsRaw,
      resetStorageSettings: (...args) => resetStorageSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      removeStorageToggles: () => removeStorageToggles(),
      testSurface,
    },
    magic: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addStandardHeading,
        addSettingsNumber,
        addSettingsToggle,
        addTableInput,
        addTableToggle,
        buildTableLabel,
      },
      getGame: () => game,
      getAlchemyManager: () => AlchemyManager,
      getRitualManager: () => RitualManager,
      resetMagicSettings: (...args) => resetMagicSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    job: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addSettingsNumber,
        addSettingsString,
        addSettingsToggle,
        addTableInput,
        addTableToggle,
        addToggleCallbacks,
        getSorterHelper: () => sorterHelper,
        confirm: (...args) => runtimeEnvironment.confirm(...args),
      },
      getBasicJob: () => BasicJob,
      getCraftingJob: () => CraftingJob,
      getJobManager: () => JobManager,
      getJobs: () => jobs,
      getSettingsRaw: () => settingsRaw,
      resetJobSettings: (...args) => resetJobSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    weighting: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: { buildSettingsSection, addSettingsToggle, addTableInput },
      resetWeightingSettings: (...args) => resetWeightingSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      testSurface,
    },
    building: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsToggle,
        addTableInput,
        addTableToggle,
        addToggleCallbacks,
        buildTableLabel,
        confirm: (...args) => runtimeEnvironment.confirm(...args),
        getSorterHelper: () => sorterHelper,
      },
      getBuildingManager: () => BuildingManager,
      getBuildingIds: () => buildingIds,
      getResources: () => resources,
      getLinkedBuildings: () => linkedBuildings,
      getCheckCompare: () => checkCompare,
      getOverrideKey: () => overrideKey,
      getRealNumber: () => getRealNumber,
      getInitBuildingState: () => initBuildingState,
      getSettingsRaw: () => settingsRaw,
      resetBuildingSettings: (...args) => resetBuildingSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      removeBuildingToggles: () => removeBuildingToggles(),
      testSurface,
    },
    project: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addSettingsNumber,
        addSettingsToggle,
        addTableInput,
        addTableToggle,
        buildTableLabel,
        getSorterHelper: () => sorterHelper,
      },
      getProjectManager: () => ProjectManager,
      getSettingsRaw: () => settingsRaw,
      resetProjectSettings: (...args) => resetProjectSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    logging: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection2,
        addSettingsHeader1,
        addSettingsString,
        addSettingsToggle,
      },
      getGame: () => game,
      getGameLog: () => GameLog,
      getSettingsRaw: () => settingsRaw,
      resetLoggingSettings: (...args) => resetLoggingSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      buildFilterRegExp: () => buildFilterRegExp(),
      testSurface,
    },
  });
  const {
    buildProductionSettings,
    updateProductionSettingsContent,
    updateProductionTableSmelter,
    updateProductionTableFoundry,
    updateProductionTableFactory,
    updateProductionTableMiningDrone,
    updateProductionTableReplicator,
  } = productionSettingsBrowserAdapter;
  const { buildStorageSettings } = storageSettingsBrowserAdapter;
  const { buildMagicSettings } = magicSettingsBrowserAdapter;
  const { buildJobSettings } = jobSettingsBrowserAdapter;
  const { buildWeightingSettings } = weightingSettingsBrowserAdapter;
  const { buildBuildingSettings, filterBuildingSettingsTable } =
    buildingSettingsBrowserAdapter;
  const { buildProjectSettings } = projectSettingsBrowserAdapter;
  const { buildLoggingSettings } = loggingSettingsBrowserAdapter;
  const optionsModalBrowserAdapter = createOptionsModalBrowserAdapterControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    getWindow: () => runtimeEnvironment.window,
    getSettingsReader: () => ({
      readToggle: (settingName) => {
        const raw = getTestContext("optionsModal")?.settingsRaw ?? settingsRaw;
        const overrides = raw.overrides ?? {};
        return {
          checked: Boolean(raw[settingName]),
          inactive: Boolean(overrides[settingName]),
        };
      },
    }),
    getSettingsWriter: () => ({
      setToggle: (settingName, checked) => {
        const raw = getTestContext("optionsModal")?.settingsRaw ?? settingsRaw;
        raw[settingName] = checked;
      },
      persist: () =>
        (
          getTestContext("optionsModal")?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    }),
    getBuilders: () =>
      getTestContext("optionsModal")?.builders ?? {
        government: buildGovernmentSettings,
        war: buildWarSettings,
        hell: buildHellSettings,
        fleet: buildFleetSettings,
      },
    openOverrideModal: (event) =>
      (getTestContext("optionsModal")?.openOverrideModal ?? openOverrideModal)(
        event,
      ),
  });
  const {
    createSettingToggle,
    updateOptionsUI,
    addOptionUI,
    openOptionsModal,
    createOptionsModal,
  } = optionsModalBrowserAdapter;
  const {
    prestigeTopBarReader,
    prestigeTopBarBrowserAdapter,
    updatePrestigeInTopBar,
    totalDaysTopBarReader,
    totalDaysTopBarBrowserAdapter,
    updateTotalDaysInTopBar,
  } = createTopBarControls({
    getPrestigeSettings: () =>
      getTestContext("prestigeTopBar")?.settings ?? settings,
    getPrestigeTypes: () =>
      getTestContext("prestigeTopBar")?.prestigeTypes ?? prestigeTypes,
    getPrestigeDocument: () => runtimeEnvironment.document,
    addPrestigeOptionUi: (...args) =>
      (getTestContext("prestigeTopBar")?.addOptionUI ?? addOptionUI)(...args),
    buildPrestigeSettings: (...args) =>
      (
        getTestContext("prestigeTopBar")?.buildPrestigeSettings ??
        buildPrestigeSettings
      )(...args),
    getTotalDaysSettings: () =>
      getTestContext("totalDaysTopBar")?.settings ?? settings,
    getTotalDaysGame: () => getTestContext("totalDaysTopBar")?.game ?? game,
    getTotalDaysDocument: () => runtimeEnvironment.document,
    getTotalDaysJQuery: () => $,
  });
  const {
    arpaToggleReader,
    arpaToggleBrowserAdapter,
    craftToggleReader,
    craftToggleBrowserAdapter,
    buildingToggleReader,
    buildingToggleBrowserAdapter,
    ejectToggleReader,
    ejectToggleBrowserAdapter,
    supplyToggleReader,
    supplyToggleBrowserAdapter,
  } = createToggleControls({
    arpa: {
      getProjectManager: () =>
        getTestContext("arpaToggles")?.ProjectManager ?? ProjectManager,
      getSettingsRaw: () =>
        getTestContext("arpaToggles")?.settingsRaw ?? settingsRaw,
    },
    arpaBrowser: {
      getJQuery: () => $,
      addToggleCallbacks: (...args) =>
        (
          getTestContext("arpaToggles")?.addToggleCallbacks ??
          addToggleCallbacks
        )(...args),
    },
    craft: {
      getCraftablesList: () =>
        getTestContext("craftToggles")?.craftablesList ?? craftablesList,
      getSettingsRaw: () =>
        getTestContext("craftToggles")?.settingsRaw ?? settingsRaw,
    },
    craftBrowser: {
      getJQuery: () => $,
      addToggleCallbacks: (...args) =>
        (
          getTestContext("craftToggles")?.addToggleCallbacks ??
          addToggleCallbacks
        )(...args),
    },
    building: {
      getBuildingManager: () =>
        getTestContext("buildingToggles")?.BuildingManager ?? BuildingManager,
      getSettings: () =>
        getTestContext("buildingToggles")?.settings ?? settings,
      getSettingsRaw: () =>
        getTestContext("buildingToggles")?.settingsRaw ?? settingsRaw,
    },
    buildingBrowser: {
      getJQuery: () => $,
      getCountWriter: () => ({
        setCount: (count) => {
          const targetState = getTestContext("buildingToggles")?.state ?? state;
          targetState.buildingToggles = count;
        },
      }),
      addToggleCallbacks: (...args) =>
        (
          getTestContext("buildingToggles")?.addToggleCallbacks ??
          addToggleCallbacks
        )(...args),
    },
    eject: {
      getEjectManager: () =>
        getTestContext("ejectToggles")?.EjectManager ?? EjectManager,
      getSettingsRaw: () =>
        getTestContext("ejectToggles")?.settingsRaw ?? settingsRaw,
    },
    ejectBrowser: {
      getJQuery: () => $,
      addToggleCallbacks: (...args) =>
        (
          getTestContext("ejectToggles")?.addToggleCallbacks ??
          addToggleCallbacks
        )(...args),
    },
    supply: {
      getSupplyManager: () =>
        getTestContext("supplyToggles")?.SupplyManager ?? SupplyManager,
      getSettingsRaw: () =>
        getTestContext("supplyToggles")?.settingsRaw ?? settingsRaw,
    },
    supplyBrowser: {
      getJQuery: () => $,
      addToggleCallbacks: (...args) =>
        (
          getTestContext("supplyToggles")?.addToggleCallbacks ??
          addToggleCallbacks
        )(...args),
    },
  });
  const { createArpaToggles, removeArpaToggles } = arpaToggleBrowserAdapter;
  const { createCraftToggles, removeCraftToggles } = craftToggleBrowserAdapter;
  const { createBuildingToggles, removeBuildingToggles } =
    buildingToggleBrowserAdapter;
  const { createEjectToggles, removeEjectToggles } = ejectToggleBrowserAdapter;
  const { createSupplyToggles, removeSupplyToggles } =
    supplyToggleBrowserAdapter;

  const {
    generalSettingsBrowserAdapter,
    achievementGuardSettingsBrowserAdapter,
    challengeHelperSettingsBrowserAdapter,
    prestigeSettingsBrowserAdapter,
    governmentSettingsBrowserAdapter,
    authoritySettingsBrowserAdapter,
  } = createExtendedSettingsControl({
    general: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addSettingsHeader1,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsString,
        addSettingsToggle,
      },
      resetGeneralSettings: (...args) => resetGeneralSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    achievementGuard: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: { buildSettingsSection, addSettingsToggle },
      resetAchievementGuardSettings: (...args) =>
        resetAchievementGuardSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      testSurface,
    },
    challengeHelper: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: { buildSettingsSection, addSettingsToggle, addSettingsNumber },
      resetChallengeHelperSettings: (...args) =>
        resetChallengeHelperSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      testSurface,
    },
    prestige: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection2,
        addSettingsHeader1,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsToggle,
        openOverrideModal,
        openOptionsModal,
        get buildCustomRacePresetEditor() {
          return buildCustomRacePresetEditor;
        },
      },
      getPrestigeTypes: () => prestigeTypes,
      getGame: () => game,
      getBuildings: () => buildings,
      isPrestigeAllowed: (...args) => isPrestigeAllowed(...args),
      haveTech: (...args) => haveTech(...args),
      isBioseederPrestigeAvailable: (...args) =>
        isBioseederPrestigeAvailable(...args),
      isCataclysmPrestigeAvailable: (...args) =>
        isCataclysmPrestigeAvailable(...args),
      isWhiteholePrestigeAvailable: (...args) =>
        isWhiteholePrestigeAvailable(...args),
      isApocalypsePrestigeAvailable: (...args) =>
        isApocalypsePrestigeAvailable(...args),
      isAscensionPrestigeAvailable: (...args) =>
        isAscensionPrestigeAvailable(...args),
      isWitchAscensionPrestigeAvailable: (...args) =>
        isWitchAscensionPrestigeAvailable(...args),
      isDemonicPrestigeAvailable: (...args) =>
        isDemonicPrestigeAvailable(...args),
      resetPrestigeSettings: (...args) => resetPrestigeSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      getSettingsRaw: () => settingsRaw,
      getState: () => state,
      confirm: (message) => runtimeEnvironment.confirm(message),
      testSurface,
    },
    government: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: { buildSettingsSection2, addSettingsNumber, addSettingsSelect },
      getGame: () => game,
      getGovernmentManager: () => GovernmentManager,
      getGovernors: () => governors,
      resetGovernmentSettings: (...args) => resetGovernmentSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    authority: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: { buildSettingsSection, addSettingsToggle, addSettingsNumber },
      resetAuthoritySettings: (...args) => resetAuthoritySettings(...args),
      persistSettings: () => updateSettingsFromState(),
      testSurface,
    },
  });
  const { buildGeneralSettings } = generalSettingsBrowserAdapter;
  const { buildAchievementGuardSettings } =
    achievementGuardSettingsBrowserAdapter;
  const { buildChallengeHelperSettings } =
    challengeHelperSettingsBrowserAdapter;
  const { buildPrestigeSettings } = prestigeSettingsBrowserAdapter;
  const { buildGovernmentSettings } = governmentSettingsBrowserAdapter;
  const { buildAuthoritySettings } = authoritySettingsBrowserAdapter;
  const {
    evolutionSettingsControl,
    planetSettingsBrowserAdapter,
    triggerSettingsBrowserAdapter,
    researchSettingsBrowserAdapter,
    warSettingsBrowserAdapter,
  } = createProgressionSettingsControl({
    evolution: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addStandardHeading,
        addSettingsSelect,
        addSettingsToggle,
        get sorterHelper() {
          return sorterHelper;
        },
      },
      getGame: () => game,
      getRaces: () => races,
      getChallenges: () => challenges,
      getUniverses: () => universes,
      getSettingsRaw: () => settingsRaw,
      getSettings: () => settings,
      getSettingsToStore: () => evolutionSettingsToStore,
      getPrestigeTypes: () => prestigeTypes,
      getStarLevel: (queueItem) => getStarLevel(queueItem),
      getState: () => state,
      resetEvolutionSettings: (...args) => resetEvolutionSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    planet: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: { buildSettingsSection, addTableInput, buildTableLabel },
      getGame: () => game,
      getBiomeList: () => biomeList,
      getTraitList: () => traitList,
      getExtraList: () => extraList,
      resetPlanetSettings: (...args) => resetPlanetSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      testSurface,
    },
    trigger: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        buildInputNode,
        get sorterHelper() {
          return sorterHelper;
        },
      },
      getTriggerManager: () => TriggerManager,
      getCheckTypes: () => checkTypes,
      getActionInputs: () => argType,
      getBooleanResultChecks: () => retBools,
      getOverrideOnlyChecks: () => overrideOnlyChecks,
      resetTriggerSettings: (...args) => resetTriggerSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    research: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: { buildSettingsSection, addSettingsList, addSettingsSelect },
      getGame: () => game,
      getTechIds: () => techIds,
      resetResearchSettings: (...args) => resetResearchSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    war: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection2,
        addSettingsHeader1,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsToggle,
      },
      getSpyManager: () => SpyManager,
      getGame: () => game,
      resetWarSettings: (...args) => resetWarSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
  });
  const {
    addEvolutionSetting,
    buildEvolutionSettings,
    updateEvolutionSettingsContent,
  } = evolutionSettingsControl;
  const { buildPlanetSettings } = planetSettingsBrowserAdapter;
  const { buildTriggerSettings, updateTriggerSettingsContent } =
    triggerSettingsBrowserAdapter;
  const { buildResearchSettings } = researchSettingsBrowserAdapter;
  const { buildWarSettings, updateWarSettingsContent } =
    warSettingsBrowserAdapter;
  const {
    hellSettingsBrowserAdapter,
    fleetSettingsBrowserAdapter,
    mechSettingsBrowserAdapter,
    ejectorSettingsBrowserAdapter,
    marketSettingsBrowserAdapter,
  } = createLateSettingsControl({
    hell: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection2,
        addSettingsHeader1,
        addSettingsNumber,
        addSettingsToggle,
      },
      resetHellSettings: (...args) => resetHellSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    fleet: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection2,
        addSettingsHeader1,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsToggle,
        addStandardHeading,
        addTableInput,
        buildTableLabel,
        openOverrideModal,
        get sorterHelper() {
          return sorterHelper;
        },
      },
      getFleetManagerOuter: () => FleetManagerOuter,
      getGalaxyRegions: () => galaxyRegions,
      getGame: () => game,
      getSettingsRaw: () => settingsRaw,
      resetFleetSettings: (...args) => resetFleetSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      testSurface,
    },
    mech: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsToggle,
        addStandardHeading,
        get calculateMechStats() {
          return calculateMechStats;
        },
      },
      getMechManager: () => MechManager,
      getGame: () => game,
      resetMechSettings: (...args) => resetMechSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      removeMechInfo: (...args) => removeMechInfo(...args),
      testSurface,
    },
    ejector: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsToggle,
        addTableToggle,
        buildTableLabel,
      },
      getResources: () => resources,
      getEjectManager: () => EjectManager,
      getNaniteManager: () => NaniteManager,
      getSupplyManager: () => SupplyManager,
      getSettingsRaw: () => settingsRaw,
      resetEjectorSettings: (...args) => resetEjectorSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      removeEjectToggles: (...args) => removeEjectToggles(...args),
      removeSupplyToggles: (...args) => removeSupplyToggles(...args),
      testSurface,
    },
    market: {
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: {
        buildSettingsSection: (...args) => buildSettingsSection(...args),
        addSettingsNumber: (...args) => addSettingsNumber(...args),
        addSettingsToggle: (...args) => addSettingsToggle(...args),
        addStandardHeading: (...args) => addStandardHeading(...args),
        addTableInput: (...args) => addTableInput(...args),
        addTableToggle: (...args) => addTableToggle(...args),
        buildTableLabel: (...args) => buildTableLabel(...args),
        getSorterHelper: () => sorterHelper,
      },
      getMarketManager: () => MarketManager,
      getResources: () => resources,
      getPoly: () => poly,
      getSettingsRaw: () => settingsRaw,
      resetMarketSettings: (...args) => resetMarketSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      resetCheckbox: (...args) => resetCheckbox(...args),
      removeMarketToggles: () => removeMarketToggles(),
      testSurface,
    },
  });
  const { buildHellSettings, updateHellSettingsContent } =
    hellSettingsBrowserAdapter;
  const { buildFleetSettings } = fleetSettingsBrowserAdapter;
  const { buildMechSettings, updateMechSettingsContent } =
    mechSettingsBrowserAdapter;
  const { buildEjectorSettings, updateEjectorSettingsContent } =
    ejectorSettingsBrowserAdapter;
  const { buildMarketSettings, updateMarketSettingsContent } =
    marketSettingsBrowserAdapter;

  let { traitVal } = createTraitValueControl({ getGame: () => game });
  const authorityPolicy = createAuthorityPolicyControl({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    readHighPopulationPercent: () => traitVal("high_pop", 1, 100),
    readAuthorityPolicyView: readAuthorityPolicyViewControl,
    readAuthorityQuantity: readAuthorityQuantityControl,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      authorityPolicy: {
        getAuthorityTarget: authorityPolicy.getAuthorityTarget,
        getAuthorityPerSoldier: authorityPolicy.getAuthorityPerSoldier,
        getRequiredAuthorityGarrison(currentGarrison) {
          const requirement =
            authorityPolicy.getRequiredAuthorityGarrison(currentGarrison);
          return requirement.status === "ready"
            ? requirement.requiredGarrison
            : requirement;
        },
        getPredictedAuthorityAfterRemovingSoldiers:
          authorityPolicy.getPredictedAuthorityAfterRemovingSoldiers,
        assessAuthorityRemoval: authorityPolicy.assessAuthorityRemoval,
      },
      setAuthorityPolicyTestContext(context) {
        game = context.game;
        settings = context.settings;
        resources = context.resources;
      },
    }));

  const { normalizeProperties, addProps } = createPropertyHelpersControl({
    getSettings: () => settings,
  });
  let { getCostConflict } = createCostConflictControl({
    getState: () => state,
    getResources: () => resources,
  });
  const plannerStatsLifecycle = createPlannerStatsLifecycleControl(
    createPlannerStatsStoreControl(runtimeEnvironment.storage),
  );
  const {
    plannerLimitingResource,
    makePlannerStats,
    loadPlannerStats,
    savePlannerStats,
  } = createPlannerStateControl({
    getResources: () => resources,
    getGame: () => game,
    readPlannerLimitInput: readPlannerLimitInputControl,
    readPlannerRun: readPlannerRunControl,
    lifecycle: plannerStatsLifecycle,
  });
  const { expandStorage } = createStorageExpansionControl({
    nowMs: () => browserClock.nowMs(),
    reader: {
      getResources: () => resources,
      getBuildings: () => buildings,
      getStorageManager: () => StorageManager,
      isEarlyGame: () => isEarlyGame(),
      isLumberRace: () => isLumberRace(),
    },
    debug: {
      getWindow: () => runtimeEnvironment.window,
      log: (message) => runtimeEnvironment.log(message),
    },
    getSettings: () => settings,
    commandExecutor: {
      getStorageManager: () => StorageManager,
      getResources: () => resources,
    },
  });
  const { calculateRequiredStorages } = createStorageRequirementsActionControl({
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getBuildings: () => buildings,
    getGame: () => game,
    getBuildingManager: () => BuildingManager,
    getProjectManager: () => ProjectManager,
    getFleetManagerOuter: () => FleetManagerOuter,
    isTechnology: (target) => target instanceof Technology,
    isInflationAssistActive: () => inflationChallengeAssistActive(),
    isRetirementAssistActive: () => retirementChallengeAssistActive(),
    getInflationChallengeMoney: () => INFLATION_CHALLENGE_MONEY,
    getRetirementGraphene: () => RETIREMENT_PREP.graphene,
    diagnostics,
  });
  const { prioritizeDemandedResources } =
    createDemandPrioritizationActionControl({
      getSettings: () => settings,
      getState: () => state,
      getGame: () => game,
      getResources: () => resources,
      getBuildings: () => buildings,
      getCrafter: () => crafter,
      getSpyManager: () => SpyManager,
      getFleetManagerOuter: () => FleetManagerOuter,
      getJobManager: () => JobManager,
      getFactoryManager: () => FactoryManager,
      getIsEarlyGame: () => isEarlyGame(),
      isProject: (object) => object instanceof Project,
      isInflationAssistActive: () => inflationChallengeAssistActive(),
      isRetirementAssistActive: () => retirementChallengeAssistActive(),
      getInflationChallengeMoney: () => INFLATION_CHALLENGE_MONEY,
      getRetirementGraphene: () => RETIREMENT_PREP.graphene,
      consumptionBalanceTarget: CONSUMPTION_BALANCE_TARGET,
    });
  const {
    makeStateLog,
    loadStateLog,
    saveStateLog,
    stateLogDiff,
    stateLogBlocker,
    recordStateSnapshot,
  } = createStateLogControl({
    getGame: () => game,
    getResources: () => resources,
    getState: () => state,
    plannerLimitingResource,
    stateLogStore: createStateLogStoreControl(runtimeEnvironment.storage),
    testSurface,
    setTestContext(context) {
      game = context.game;
      resources = context.resources;
      state = context.state;
    },
  });
  let {
    verifyGameActions,
    verifyGameActionsExist,
    verifyGameActionExists,
    getGovernor,
    haveTask,
    haveTech,
    isEarlyGame,
    isHungryRace,
    isDemonRace,
    isLumberRace,
    getOccCosts,
    getGovName,
    getGovPower,
    getGalaxyCombatShipPower,
    getPiracyMultiplier,
    galaxyAssaultPending,
    getGalaxyRegions,
    stargatePiracySupressed,
    galaxyPiracyCoveredByFleet,
    gateTowerSupressionTooLow,
    gateDemonsSupressed,
    guardPostPrebuildIncomplete,
    womlingStatEarned,
    shrineBonusUnwanted,
    madPrestigeAwaited,
    getCitadelConsumption,
    isHellSupressUseful,
    adjustSpire,
    getBestSupplyRatio,
    nextCitadelPowerDraw,
    spirePrebuildShortfall,
    ticksPerSecond,
    getHealingRate,
    getFoodConsume,
    getGrowthRate,
    getResourcesPerClick,
  } = createRuntimeIntelligenceControl({
    getGame: () => game,
    getBuildings: () => buildings,
    log: (...values) => runtimeEnvironment.log(...values),
    getTraitVal: () => traitVal,
    getPoly: () => poly,
    getResources: () => resources,
    getGalaxyOffers: () => poly.galaxyOffers,
    getSettings: () => settings,
    getState: () => state,
    getJobs: () => jobs,
    getCrafter: () => crafter,
    getTechIds: () => techIds,
    getHaveTech: () => haveTech,
    getDate: () => runtimeEnvironment.createDate(),
  });
  let win = null;
  const userscriptEnvironment = createUserscriptEnvironmentControl(
    runtimeEnvironment.window,
  );
  const {
    callVueMethod,
    getVueById,
    getMainVue,
    getVueElement,
    resolveVueMethod,
    triggerFileDownload,
  } = createBrowserRuntimeControl({
    diagnostics,
    getWin: () => win,
    getDocument: () => runtimeEnvironment.document,
    getUrlApi: () => runtimeEnvironment.urlApi,
    getBlobConstructor: () => runtimeEnvironment.BlobConstructor,
    schedule: (callback, delay) => runtimeEnvironment.schedule(callback, delay),
  });
  let needSandboxBypass = false;

  let overrideKey = "ctrlKey";
  let overrideKeyLabel = "Ctrl";
  if (runtimeEnvironment.window.navigator.platform.indexOf("Mac") === 0) {
    overrideKey = "altKey";
    overrideKeyLabel = "Alt";
  }

  let checkActions = false;

  let safeMode =
    String(runtimeEnvironment.window.location)
      .toLowerCase()
      .indexOf("safemode") !== -1;

  const {
    projectControls,
    researchControls,
    clickMultipliers,
    traitControls,
    jobControls,
    actionControls,
    craftingControls,
    industryControls,
    espionageControls,
    foreignControls,
    governmentSelection,
    marketControls,
    storageControls,
    disposalControls,
    fleetControls,
    garrisonControls,
    mechControls,
    mechListControls,
  } = createGameControlSet({
    getVueById: (id) => getVueById(id),
    getForeignVueById: (id) =>
      getTestContext("foreignControls")?.getVueById?.(id) ?? getVueById(id),
    getMainVue: () => getMainVue(),
    getDocument: () => runtimeEnvironment.document,
    getKeyManager: () => KeyManager,
    selectTooltip: () => $("#popper"),
    getGame: () => game,
    getJQuery: () => $,
    callVueMethod,
    getSortable: () => runtimeEnvironment.Sortable,
    getPageSortable: () => win.Sortable,
    isSandboxBypass: () => needSandboxBypass,
    cloneIntoPage: (value, options) =>
      userscriptEnvironment.cloneIntoPage(value, options),
  });

  var resources, jobs, crafter, buildings, linkedBuildings, projects;
  const {
    Job,
    BasicJob,
    CraftingJob,
    Resource,
    SoulGem,
    Troops,
    Supply,
    Power,
    Support,
    BeltSupport,
    ElectrolysisSupport,
    WomlingsSupport,
    PrestigeResource,
    Population,
    Morale,
    Thrall,
    ResourceProductionCost,
    Action,
    CityAction,
    Pillar,
    ResourceAction,
    EvolutionAction,
    SpaceDock,
    ModalAction,
    Project,
    Technology,
    Race,
    Trigger,
    MinorTrait,
    MutableTrait,
    MajorTrait,
    GenusTrait,
    resources: initializedResources,
    jobs: initializedJobs,
    crafter: initializedCrafter,
    buildings: initializedBuildings,
    linkedBuildings: initializedLinkedBuildings,
    projects: initializedProjects,
  } = createEntityCompatibilitySurface({
    readArpaIds: () => arpaIds,
    readBuildingIds: () => buildingIds,
    readBuildings: () => buildings,
    readCheckAffordableCustom: () => checkAffordableCustom,
    readCheckTypes: () => checkTypes,
    readConflictingTraits: () => conflictingTraits,
    readFanatAchievements: () => fanatAchievements,
    readFibonacci: () => Fibonacci,
    readGame: () => game,
    readGameLog: () => GameLog,
    readAchievementStar: () => getAchievementStar,
    readCitadelConsumption: () => getCitadelConsumption,
    readStarLevel: () => getStarLevel,
    readHaveTask: () => haveTask,
    readHaveTech: () => haveTech,
    readJobs: () => jobs,
    readLogIgnore: () => logIgnore,
    readLogPrestige: () => logPrestige,
    readMutableTraitManager: () => MutableTraitManager,
    readMutationCostMultipliers: () => mutationCostMultipliers,
    readMutationCostMultipliersGenus: () => mutationCostMultipliersGenus,
    readNormalizeProperties: () => normalizeProperties,
    readPoly: () => poly,
    readRaces: () => races,
    readResources: () => resources,
    readRetBools: () => retBools,
    readSettings: () => settings,
    readSettingsRaw: () => settingsRaw,
    readSpecialRaceTraits: () => specialRaceTraits,
    readState: () => state,
    readTechIds: () => techIds,
    readTicksPerSecond: () => ticksPerSecond,
    readTraitVal: () => traitVal,
    readTriggerManager: () => TriggerManager,
    readWarManager: () => WarManager,
    readActionControls: () => actionControls,
    readClickMultipliers: () => clickMultipliers,
    readCraftingControls: () => craftingControls,
    readFeatureVisibility: () => featureVisibility,
    readJobControls: () => jobControls,
    readGameModal: () => gameModal,
    readProjectControls: () => projectControls,
    readResearchControls: () => researchControls,
    getHaveTech: () => haveTech,
    setResources: (value) => (resources = value),
  });
  resources = initializedResources;
  jobs = initializedJobs;
  crafter = initializedCrafter;
  buildings = initializedBuildings;
  linkedBuildings = initializedLinkedBuildings;
  projects = initializedProjects;

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      entityClasses: {
        Job,
        BasicJob,
        CraftingJob,
        Resource,
        SoulGem,
        Troops,
        Supply,
        Power,
        Support,
        BeltSupport,
        ElectrolysisSupport,
        WomlingsSupport,
        PrestigeResource,
        Population,
        Morale,
        Thrall,
        ResourceProductionCost,
        Action,
        CityAction,
        Pillar,
        ResourceAction,
        EvolutionAction,
        SpaceDock,
        ModalAction,
        Project,
        Technology,
        Race,
        Trigger,
        MinorTrait,
        MutableTrait,
        MajorTrait,
        GenusTrait,
      },
    }));

  // Lookup tables are filled during initialization; state is a fresh mutable
  // session object for each runtime startup.
  let {
    techIds,
    buildingIds,
    arpaIds,
    jobIds,
    evolutions,
    imitations,
    races,
    craftablesList,
    foundryList,
  } = createRuntimeLookupTablesControl();
  let state = createInitialRuntimeStateControl();

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      entityCatalogs: {
        resources,
        jobs,
        crafter,
        buildings,
        linkedBuildings,
        projects,
      },
    }));

  const {
    namedBuildings,
    authorityCapBuildings,
    INFLATION_CHALLENGE_MONEY,
    RETIREMENT_PREP,
    inflationMoneyStorageBuildings,
    inflationMoneyIncomeBuildings,
    galaxyCombatShips,
    weightingRules,
    buildingWeightingDescriber,
    buildingWeightingDecider,
  } = createBuildingWeightingControl({
    formatNumber: getNumberString,
    formatNiceNumber: getNiceNumber,
    nextRandomUnit: () => randomSource.nextUnit(),
  });

  const isVacuumSyphonStage = () =>
    isVacuumCollapseManaStageReadyControl({
      prestigeType: String(settings["prestigeType"] ?? ""),
      manaRate: Number(resources?.Mana?.rateOfChange),
      requiredManaRate: Number(
        settings["prestigeVacuumMana"] ??
          DEFAULT_VACUUM_MANA_REQUIREMENT_CONTROL,
      ),
    });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      weightingPolicy: {
        namedBuildings,
        authorityCapBuildings,
        INFLATION_CHALLENGE_MONEY,
        RETIREMENT_PREP,
        inflationMoneyStorageBuildings,
        inflationMoneyIncomeBuildings,
        galaxyCombatShips,
        weightingRules,
      },
    }));

  // Singleton manager objects
  let {
    MinorTraitManager,
    MutableTraitManager,
    QuarryManager,
    MineManager,
    ExtractorManager,
    NaniteManager,
    SupplyManager,
    EjectManager,
    AlchemyManager,
    RitualManager,
    SmelterManager,
    FactoryManager,
    ReplicatorManager,
    DroidManager,
    GrapheneManager,
    GalaxyTradeManager,
    GovernmentManager,
    MarketManager,
    StorageManager,
    SpyManager,
    WarManager,
  } = createManagerCompositionControl({
    industry: {
      trait: {
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        haveTech,
      },
      industry: {
        getGame: () => game,
        getBuildings: () => buildings,
        industryControls,
        haveTech,
      },
      disposal: {
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        getBuildings: () => buildings,
        getPoly: () => poly,
        haveTask,
        industryControls,
        disposalControls,
      },
      magic: {
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        getBuildings: () => buildings,
        haveTech,
        isLumberRace,
        addProps,
        industryControls,
      },
      production: {
        getGame: () => game,
        getResources: () => resources,
        getBuildings: () => buildings,
        industryControls,
        haveTech,
        isLumberRace,
        addProps,
        normalizeProperties,
        replicableResources,
        ResourceProductionCost,
      },
    },
    economy: {
      getGame: () => game,
      getResources: () => resources,
      getBuildings: () => buildings,
      governmentSelection,
      marketControls,
      storageControls,
      getFeatureVisibility: () => featureVisibility,
      getGameModal: () => gameModal,
      getGameLog: () => GameLog,
      haveTech,
      traitVal,
      industryControls,
    },
    foreign: {
      getGame: () => game,
      getSettings: () => settings,
      getState: () => state,
      getResources: () => resources,
      getBuildings: () => buildings,
      getPoly: () => poly,
      getForeignControls: () => foreignControls,
      espionageControls,
      getGarrisonControls: () => garrisonControls,
      getFeatureVisibility: () => featureVisibility,
      getGameModal: () => gameModal,
      getGameLog: () => GameLog,
      getHaveTech: () => haveTech,
      getGuardActive: () => guardActive,
      getForeignAchievementGoal: () =>
        readForeignAchievementGoalControl({
          getSettings: () => settings,
          getGame: () => game,
          isAchievementUnlocked: (achievement, level) =>
            isAchievementUnlocked(achievement, level),
          isPacifistGuardActive: () => guardActive("guardPacifist"),
        }),
      getTraitVal: () => traitVal,
      getGovPower,
      getGovName,
      getOccCosts,
      logError: (...args) => runtimeEnvironment.error(...args),
    },
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      foreignAffairsManagers: { SpyManager, WarManager },
      setForeignAffairsManagersTestContext(context) {
        if ("game" in context) game = context.game;
        if ("settings" in context) settings = context.settings;
        if ("state" in context) state = context.state;
        if ("resources" in context) resources = context.resources;
        if ("buildings" in context) buildings = context.buildings;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("gameModal" in context) gameModal = context.gameModal;
        if ("GameLog" in context) GameLog = context.GameLog;
        if ("KeyManager" in context) KeyManager = context.KeyManager;
        if ("haveTech" in context) haveTech = context.haveTech;
        if ("guardActive" in context) guardActive = context.guardActive;
        if ("traitVal" in context) traitVal = context.traitVal;
      },
    }));

  let { FleetManagerOuter, FleetManager, MechManager } =
    createFleetMechManagerCompositionControl({
      fleet: {
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        getBuildings: () => buildings,
        getPoly: () => poly,
        getHaveTech: () => haveTech,
        fleetControls,
      },
      mech: {
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        getBuildings: () => buildings,
        getPoly: () => poly,
        getGameLog: () => GameLog,
        getUpdateDebugData: () => updateDebugData,
        getCreateMechInfo: () => createMechInfo,
        getMechControls: () => mechControls,
        getMechListControls: () => mechListControls,
        kCombinations: k_combinations,
        createMutationObserver: (callback) =>
          new runtimeEnvironment.MutationObserver(callback),
        randomSource,
      },
    });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      fleetManagers: { FleetManagerOuter, FleetManager },
      setFleetManagersTestContext(context) {
        if ("game" in context) game = context.game;
        if ("settings" in context) settings = context.settings;
        if ("resources" in context) resources = context.resources;
        if ("buildings" in context) buildings = context.buildings;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("KeyManager" in context) KeyManager = context.KeyManager;
        if ("haveTech" in context) haveTech = context.haveTech;
      },
    }));

  const { mechSupplySavingReason } = createMechIntelligenceControl({
    getGame: () => game,
    getSettings: () => settings,
    getBuildings: () => buildings,
    getResources: () => resources,
    getMechManager: () => MechManager,
    getHaveTask: () => haveTask,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      MechManager,
      setMechManagerTestContext(context) {
        if ("game" in context) game = context.game;
        if ("settings" in context) settings = context.settings;
        if ("resources" in context) resources = context.resources;
        if ("buildings" in context) buildings = context.buildings;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("GameLog" in context) GameLog = context.GameLog;
        if ("needSandboxBypass" in context)
          needSandboxBypass = context.needSandboxBypass;
      },
    }));

  let JobManager, BuildingManager, ProjectManager, TriggerManager;
  ({ JobManager, BuildingManager, ProjectManager, TriggerManager } =
    createCoreManagerCompositionControl({
      getGame: () => game,
      getSettings: () => settings,
      getState: () => state,
      getBuildings: () => buildings,
      getProjects: () => projects,
      isVacuumSyphonStage,
      getNiceNumber,
      weightingDecider: buildingWeightingDecider,
      readWeightingCandidate: readWeightingCandidateControl,
      describeBuildingWeighting: buildingWeightingDescriber.describe,
      weightingSnapshot: {
        getState: () => state,
        getWeightingMultiplier: (setting) => settings[setting],
        isBestFreighterOnly: () => settings.buildingsBestFreighter,
        isAutoBuildEnabled: () => settings.autoBuild,
        isAutoFleetEnabled: () => settings.autoFleet,
        isMinerJobsDisabled: () => settings.jobDisableMiners,
        isTransportComparedBySoulGems: () => settings.buildingsTransportGem,
        getPrestigeType: () => settings.prestigeType,
        isPrestigeConstructionLimited: () => settings.prestigeBioseedConstruct,
        isSavingSoulGemsForPrestige: () => settings.prestigeWhiteholeSaveGems,
        isAuthorityManaged: () => settings.authorityManage,
        getMinimumAuthority: () => settings.generalMinimumAuthority,
        getEmbassyKnowledgeTarget: () => settings.fleetEmbassyKnowledge,
        getSlaveIncomeTarget: () => settings.slaveIncome,
        getResourceQuantity: (resource) => resources[resource].currentQuantity,
        getResourceCapacity: (resource) => resources[resource].maxQuantity,
        getResourceIncome: (resource) => resources[resource].rateOfChange,
        getResourceStorageRatio: (resource) => resources[resource].storageRatio,
        isResourceUnlocked: (resource) => resources[resource].isUnlocked(),
        getSpareResourceQuantity: (resource) =>
          resources[resource].spareQuantity,
        getRequiredResourceStorage: (resource) =>
          resources[resource].storageRequired,
        getMissionMaxResourceCost: (resource) =>
          resources[resource].techMissionMaxCost,
        getResourceTitle: (resource) => resources[resource].title,
        getBuildingCount: (building) => buildings[building].count,
        getBuildingOnCount: (building) => buildings[building].stateOnCount,
        getBuildingCost: (building) => buildings[building].cost,
        getBuildingName: (building) => buildings[building].name,
        getBuildingTitle: (building) => buildings[building].title,
        getBuildingSoulGemCost: (building) =>
          buildings[building].cost["Soul_Gem"],
        isBuildingUnlocked: (building) => buildings[building].isUnlocked(),
        isBuildingAutoBuildable: (building) =>
          buildings[building].isAutoBuildable(),
        isBuildingAffordable: (building) =>
          buildings[building].isAffordable(true),
        isAchievementGuardsEnabled: () => settings.achievementGuards,
        isBananaRepublicGuardEnabled: () => settings.guardBananaRepublic,
        isGalaxyAssaultPending: () => galaxyAssaultPending(),
        isStargatePiracySupressed: () => stargatePiracySupressed(),
        isGalaxyPiracyCoveredByFleet: () => galaxyPiracyCoveredByFleet(),
        isLumberRace: () => isLumberRace(),
        hasRaceTrait: (trait) => game.global.race[trait],
        getForeignGovernment: (index) =>
          game.global.civic.foreign[`gov${index}`],
        getWindSpeed: () => game.global.city.calendar.wind,
        getDefaultJobWorkers: () =>
          game.global.civic[game.global.civic.d_job].workers,
        getSacrificeBonus: (bonus) => game.global.city.s_alter?.[bonus],
        getSpireBloodstoneRank: () => game.global.blood["spire"],
        getAssignedEjectorCapacity: () =>
          game.global.interstellar.mass_ejector?.total,
        getTechLevel: (research) => game.global.tech[research],
        isBananaRepublicObjectiveComplete: (objective) =>
          bananaRepublicObjectiveComplete(objective),
        isInflationAssistActive: () => inflationChallengeAssistActive(),
        isInflationMoneyReachable: () => inflationChallengeMoneyReachable(),
        isRetirementAssistActive: () => retirementChallengeAssistActive(),
        getRetirementPreparationMissing: () => retirementPreparationMissing(),
        isAchievementGuardActive: (guard) => guardActive(guard),
        getForeignAchievementGoal: () =>
          readForeignAchievementGoalControl({
            getSettings: () => settings,
            getGame: () => game,
            isAchievementUnlocked: (achievement, level) =>
              isAchievementUnlocked(achievement, level),
            isPacifistGuardActive: () => guardActive("guardPacifist"),
          }),
        isHellSupressUseful: () => isHellSupressUseful(),
        isGateTowerSupressionTooLow: () => gateTowerSupressionTooLow(),
        isGateDemonsSupressed: () => gateDemonsSupressed(),
        isGuardPostPrebuildIncomplete: () => guardPostPrebuildIncomplete(),
        getSpirePrebuildShortfall: () => spirePrebuildShortfall(),
        getNextCitadelPowerDraw: () => nextCitadelPowerDraw(),
        isTechResearched: (research, level) => haveTech(research, level),
        isShrineBonusUnwanted: () => shrineBonusUnwanted(),
        isGECKNeeded: () => isGECKNeeded(),
        isPrestigeAllowed: (prestige) => isPrestigeAllowed(prestige),
        isPillarFinished: () => isPillarFinished(),
        isMadPrestigeAwaited: () => madPrestigeAwaited(),
        getMechSupplySavingReason: () => mechSupplySavingReason(),
        isWomlingStatEarned: (stat) => womlingStatEarned(stat),
      },
      isEarlyGame,
      getIsPrestigeAllowed: () => isPrestigeAllowed,
      getBananaRepublicObjectiveComplete: () => bananaRepublicObjectiveComplete,
      getInflationChallengeAssistActive: () => inflationChallengeAssistActive,
      Trigger,
      getWindow: () => win,
      diagnostics,
    }));

  let KeyManager, GameLog;
  const {
    gameKeyboardHandlers,
    KeyManager: initialKeyManager,
    GameLog: initialGameLog,
    gamePageShell,
    gameUiSurface,
  } = createGameLifecycleControl({
    getWin: () => win,
    getDocument: () => runtimeEnvironment.document,
    getKeyboardEvent: () => runtimeEnvironment.KeyboardEvent,
    getNeedSandboxBypass: () => needSandboxBypass,
    cloneIntoPage: (value) => userscriptEnvironment.cloneIntoPage(value),
    getGame: () => game,
    getSettings: () => settings,
    getPoly: () => poly,
    getMutationObserver: () => runtimeEnvironment.MutationObserver,
    getNode: () => runtimeEnvironment.Node,
    getTooltipObserver: () => tooltipObserverCallback,
    getLogFilter: () => filterLog,
    getModal: () => gameModal,
    getJQuery: () => $,
  });
  KeyManager = initialKeyManager;
  GameLog = initialGameLog;

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      gameModal,
      infrastructureManagers: { KeyManager, GameLog },
      setInfrastructureManagersTestContext(context) {
        if ("game" in context) game = context.game;
        if ("settings" in context) settings = context.settings;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("needSandboxBypass" in context)
          needSandboxBypass = context.needSandboxBypass;
      },
    }));

  // Gui & Init functions
  const { updateCraftCost } = createCraftingCostsControl({
    getGame: () => game,
    getState: () => state,
    getResources: () => resources,
    setCraftablesList: (list) => (craftablesList = list),
    setFoundryList: (list) => (foundryList = list),
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      updateCraftCost,
      getCraftCostTestLists: () => ({ craftablesList, foundryList }),
      setCraftCostTestContext(context) {
        game = context.game;
        state = context.state;
        resources = context.resources;
        craftablesList = context.craftablesList ?? [];
        foundryList = context.foundryList ?? [];
      },
    }));

  const { initialiseState } = createStateInitializationControl({
    getGame: () => game,
    getResources: () => resources,
    getJobManager: () => JobManager,
    getCrafter: () => crafter,
    getBuildings: () => buildings,
    setBuildings: (value) => (buildings = value),
    getProjects: () => projects,
    getUpdateCraftCost: () =>
      getTestContext("stateInitialization")?.actions?.updateCraftCost ??
      updateCraftCost,
    getUpdateTabs: () =>
      getTestContext("stateInitialization")?.actions?.updateTabs ?? updateTabs,
    getHaveTech: () =>
      getTestContext("stateInitialization")?.actions?.haveTech ?? haveTech,
    log: (message) => runtimeEnvironment.log(message),
    testSurface,
    getTestContextSnapshot: () => ({
      game,
      resources,
      JobManager,
      crafter,
      buildings,
      projects,
    }),
    setTestContext(context) {
      game = context.game;
      resources = context.resources;
      JobManager = context.JobManager;
      crafter = context.crafter;
      buildings = context.buildings;
      projects = context.projects;
      setTestContext("stateInitialization", context);
    },
  });

  const { initialiseRaces } = createRaceInitializationControl({
    getGame: () => getTestContext("raceInitialization")?.game ?? game,
    getEvolutions: () =>
      getTestContext("raceInitialization")?.evolutions ?? evolutions,
    getRaces: () => getTestContext("raceInitialization")?.races ?? races,
    getImitations: () =>
      getTestContext("raceInitialization")?.imitations ?? imitations,
    getEvolutionAction: () =>
      getTestContext("raceInitialization")?.EvolutionAction ?? EvolutionAction,
    getRace: () => getTestContext("raceInitialization")?.Race ?? Race,
    testSurface,
    setTestContext: (context) => setTestContext("raceInitialization", context),
  });

  const { initBuildingState } = createBuildingStateInitializationControl({
    getBuildings: () => buildings,
    getBuildingManager: () => BuildingManager,
    testSurface,
    setTestContext(context) {
      buildings = context.buildings;
      BuildingManager = context.BuildingManager;
    },
  });

  const { updateStateFromSettings, updateSettingsFromState } =
    createSettingsStateControl({
      getSettingsRaw: () => settingsRaw,
      getTriggerManager: () => TriggerManager,
      settingsStore,
    });

  // Pure record primitives bound to the live settingsRaw, exposed to the settingsState
  // test hook below. Production reset/migration call the pure record functions directly.
  const applySettings = (def, reset) =>
    applySettingsRecordControl(settingsRaw, def, reset);
  const migrateSetting = (oldSetting, newSetting, mapCb, keepOldValue) =>
    migrateSettingRecordControl(
      settingsRaw,
      oldSetting,
      newSetting,
      mapCb,
      keepOldValue,
    );

  const { updateStandAloneSettings } = createSettingsMigrationControl({
    getSettingsRaw: () => settingsRaw,
    getSettings: () => settings,
    getSettingsSections: () => settingsSections,
    getDefaultResets: () => [
      resetEvolutionSettings,
      resetWarSettings,
      resetHellSettings,
      resetMechSettings,
      resetFleetSettings,
      resetGovernmentSettings,
      resetAuthoritySettings,
      resetBuildingSettings,
      resetWeightingSettings,
      resetMarketSettings,
      resetResearchSettings,
      resetProjectSettings,
      resetJobSettings,
      resetMagicSettings,
      resetProductionSettings,
      resetStorageSettings,
      resetGeneralSettings,
      resetInterfaceSettings,
      resetStateLogSettings,
      resetAchievementGuardSettings,
      resetChallengeHelperSettings,
      resetPrestigeSettings,
      resetEjectorSettings,
      resetPlanetSettings,
      resetLoggingSettings,
      resetTriggerSettings,
      resetMinorTraitSettings,
      resetMutableTraitSettings,
    ],
    getTechIds: () => techIds,
    getMarketPriorityIds: () => MarketManager.priorityList.map((res) => res.id),
    getResourceIds: () => Object.values(resources).map((res) => res.id),
    getProjectIds: () => Object.values(projects).map((project) => project.id),
    getBuildings: () =>
      Object.values(buildings).map((building) => ({
        vueBinding: building._vueBinding,
        switchable: building.isSwitchable(),
      })),
    getCrafterOriginalIds: () =>
      Object.values(crafter).map((job) => job._originalId),
    getGameLog: () => GameLog,
    testSurface,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      settingsState: {
        updateStateFromSettings,
        updateSettingsFromState,
        applySettings,
        migrateSetting,
      },
      resetSettings: {
        resetWarSettings,
        resetHellSettings,
        resetGeneralSettings,
        resetInterfaceSettings,
        resetStateLogSettings,
        resetAchievementGuardSettings,
        resetChallengeHelperSettings,
        resetPrestigeSettings,
        resetGovernmentSettings,
        resetAuthoritySettings,
        resetEvolutionSettings,
        resetResearchSettings,
        resetMarketSettings,
        resetStorageSettings,
        resetMinorTraitSettings,
        resetMutableTraitSettings,
        resetJobSettings,
        resetWeightingSettings,
        resetBuildingSettings,
        resetProjectSettings,
        resetMagicSettings,
        resetProductionSettings,
        resetTriggerSettings,
        resetLoggingSettings,
        resetPlanetSettings,
        resetFleetSettings,
        resetMechSettings,
        resetEjectorSettings,
      },
      setSettingsStateTestContext(context) {
        settingsRaw = context.settingsRaw;
        TriggerManager = context.triggerManager;
      },
    }));

  let {
    getStarLevel,
    getAchievementStar,
    isAchievementUnlocked,
    guardActive,
    bananaRepublicObjectiveComplete,
    bananaRepublicSmoothieComplete,
    bananaRepublicReadyForUnification,
    guardBananaRepublicActive,
    inflationChallengeAssistActive,
    inflationChallengeMoneyReachable,
    inflationChallengeSecondsToFinish,
    inflationChallengeShouldSaveMoney,
    retirementChallengeAssistActive,
    retirementPreparationMissing,
  } = createRunGuardsControl({
    getSettings: () => settings,
    getGame: () => game,
    getPoly: () => poly,
    getResources: () => resources,
    getBuildings: () => buildings,
    haveTech,
    getNumberString,
    formatRetirementShortfalls: formatRetirementShortfallsControl,
    inflationChallengeMoney: INFLATION_CHALLENGE_MONEY,
    retirementPreparation: RETIREMENT_PREP,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      runGuards: {
        getStarLevel,
        getAchievementStar,
        isAchievementUnlocked,
        guardActive,
        bananaRepublicObjectiveComplete,
        bananaRepublicSmoothieComplete,
        bananaRepublicReadyForUnification,
        guardBananaRepublicActive,
        inflationChallengeAssistActive,
        inflationChallengeMoneyReachable,
        inflationChallengeSecondsToFinish,
        inflationChallengeShouldSaveMoney,
        retirementChallengeAssistActive,
        retirementPreparationMissing,
      },
      setRunGuardTestContext(context) {
        settings = context.settings;
        game = context.game;
        poly = context.poly;
        resources = context.resources;
        buildings = context.buildings;
      },
    }));

  const { loadQueuedSettings } = createQueuedSettingsControl({
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getGameLog: () => GameLog,
    getUpdateOverrides: () =>
      getTestContext("queuedSettings")?.actions?.updateOverrides ??
      updateOverrides,
    getUpdateStandAloneSettings: () =>
      getTestContext("queuedSettings")?.actions?.updateStandAloneSettings ??
      updateStandAloneSettings,
    getUpdateStateFromSettings: () =>
      getTestContext("queuedSettings")?.actions?.updateStateFromSettings ??
      updateStateFromSettings,
    getUpdateSettingsFromState: () =>
      getTestContext("queuedSettings")?.actions?.updateSettingsFromState ??
      updateSettingsFromState,
    getRemoveScriptSettings: () =>
      getTestContext("queuedSettings")?.actions?.removeScriptSettings ??
      removeScriptSettings,
    getBuildScriptSettings: () =>
      getTestContext("queuedSettings")?.actions?.buildScriptSettings ??
      buildScriptSettings,
    testSurface,
    setTestContext(context) {
      settings = context.settings;
      settingsRaw = context.settingsRaw;
      state = context.state;
      GameLog = context.GameLog;
      setTestContext("queuedSettings", context);
    },
  });

  const findRequiredResourceWeight = (resource) =>
    findRequiredResourceWeightControl(state.unlockedBuildings, resource);

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      findRequiredResourceWeight,
      setResourceWeightTestContext(context) {
        state = context.state;
      },
    }));

  const challengeGroups = challenges.map((members) => ({ members }));
  // function setPlanet from actions.js
  // Produces same set of planets, accurate for v1.0.29
  let { generatePlanets } = createPlanetGenerationControl({
    getGame: () => game,
    getPoly: () => poly,
    getIsAchievementUnlocked: () => isAchievementUnlocked,
    universes,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      generatePlanets,
      setPlanetGenerationTestContext(context) {
        game = context.game;
        poly = context.poly;
        isAchievementUnlocked = context.isAchievementUnlocked;
      },
    }));

  const { autoEvolution, autoUniverseSelection, autoPlanetSelection } =
    createEvolutionControls({
      evolutionReader: {
        getGame: () => game,
        getSettings: () => settings,
        getSettingsRaw: () => settingsRaw,
        getState: () => state,
        getRaces: () => races,
        getEvolutions: () => evolutions,
        getImitations: () => imitations,
        getResources: () => resources,
        getPoly: () => poly,
        challengeGroups,
      },
      evolutionExecutor: {
        getGame: () => game,
        getState: () => state,
        getResources: () => resources,
        getEvolutions: () => evolutions,
        getImitations: () => imitations,
        loadQueuedSettings,
        gameLog: GameLog,
      },
      challengeGroups,
      universeSelection: {
        reader: {
          getGame: () => game,
          getSettings: () => settings,
        },
        executor: {
          getGame: () => game,
          getDocument: () => runtimeEnvironment.document,
        },
      },
      planetSelection: {
        reader: {
          getGame: () => game,
          getSettings: () => settings,
          getGeneratePlanets: () => generatePlanets,
          getStarLevel: () => getStarLevel,
          getIsAchievementUnlocked: () => isAchievementUnlocked,
          getRaces: () => races,
          biomeGenus: planetBiomeGenus,
          biomeOrder: planetBiomes,
          planetTraitOrder: planetTraits,
        },
        executor: {
          getGame: () => game,
          getDocument: () => runtimeEnvironment.document,
          getMouseEvent: () => MouseEvent,
        },
      },
    });

  const {
    autoCraft,
    autoJobs,
    autoGovernment,
    autoBattle,
    autoHell,
    autoMerc,
    autoSpy,
  } = createEarlyAutomationComposition({
    craftJobs: {
      craft: {
        reader: {
          getResources: () => resources,
          getGame: () => game,
          getFoundryList: () => foundryList,
          ticksPerSecond,
        },
        executor: {
          getResources: () => resources,
          getFoundryList: () => foundryList,
        },
      },
      jobs: {
        getJobManager: () => JobManager,
        getGame: () => game,
        getJobs: () => jobs,
        getCrafter: () => crafter,
        getSettings: () => settings,
        getBuildings: () => buildings,
        getResources: () => resources,
        getState: () => state,
        getDebugWindow: () => runtimeEnvironment.window,
        isDemonRace,
        isLumberRace,
        traitValue: traitVal,
        haveTech,
        haveTask,
        ticksPerSecond,
        findRequiredResourceWeight,
        taxCap: (minimum) => poly.taxCap(minimum),
        isCraftingJob: (job) => job instanceof CraftingJob,
        getFoodConsume,
        log: (message) => runtimeEnvironment.log(message),
      },
    },
    combatCivic: {
      government: {
        reader: {
          getGovernmentManager: () => GovernmentManager,
          getSettings: () => settings,
          getGame: () => game,
          guardActive,
          haveTech,
          getGovernor,
          isTradeFederationAchievementUnlocked: () =>
            isAchievementUnlocked("trade", 1),
        },
        executor: {
          getGovernmentManager: () => GovernmentManager,
          getGame: () => game,
          getGovernor,
          getVueById,
        },
      },
      battle: {
        getSpyManager: () => SpyManager,
        getWarManager: () => WarManager,
        getGameLog: () => GameLog,
        getState: () => state,
        getSettings: () => settings,
        getGame: () => game,
        guardActive,
        getHealingRate,
        traitVal,
        getOccupationCost: getOccCosts,
        getGovernmentName: getGovName,
      },
      hell: {
        getWarManager: () => WarManager,
        getGame: () => game,
        getSettings: () => settings,
        getBuildings: () => buildings,
        getResources: () => resources,
        getState: () => state,
        getDebugWindow: () => runtimeEnvironment.window,
        debugLog: (message) => runtimeEnvironment.log(message),
      },
    },
    espionage: {
      mercenary: {
        getWarManager: () => WarManager,
        getState: () => state,
        getSettings: () => settings,
        getResources: () => resources,
        shouldSaveInflationMoney: inflationChallengeShouldSaveMoney,
        getGameLog: () => GameLog,
      },
      spy: {
        getSpyManager: () => SpyManager,
        getWarManager: () => WarManager,
        getForeignControls: () => foreignControls,
        getHaveTask: () => haveTask,
        getHaveTech: () => haveTech,
        shouldSaveInflationMoney: inflationChallengeShouldSaveMoney,
        getResources: () => resources,
        getSettings: () => settings,
        getPoly: () => poly,
        getGameLog: () => GameLog,
        getGovName,
        getGame: () => game,
      },
    },
  });

  if (TEST_SURFACE_ENABLED) registerTestPart(() => ({ autoHell }));

  const { autoTax } = createTaxControl({
    nowMs: () => browserClock.nowMs(),
    getVueById,
    gameReader: {
      getGame: () => game,
      getPoly: () => poly,
      getResources: () => resources,
    },
    getSettings: () => settings,
    commandExecutor: {
      getGame: () => game,
      getResources: () => resources,
      resetKeyModifiers: () => clickMultipliers.clear(),
    },
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      autoTax: () => autoTax(),
      setAutoTaxTestContext(context) {
        if ("game" in context) game = context.game;
        if ("settings" in context) settings = context.settings;
        if ("resources" in context) resources = context.resources;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("keySet" in context) KeyManager.set = context.keySet;
      },
    }));

  const {
    autoAlchemy,
    autoPylon,
    autoQuarry,
    autoMine,
    autoExtractor,
    autoSmelter,
    autoFactory,
    autoMiningDroid,
    autoGraphenePlant,
    autoConsume,
    autoReplicator,
  } = createResourceAutomationControl({
    alchemy: {
      getAlchemyManager: () => AlchemyManager,
      getResources: () => resources,
      getSettings: () => settings,
      getGame: () => game,
      getAchievementStar,
    },
    pylon: {
      getRitualManager: () => RitualManager,
      getResources: () => resources,
      getSettings: () => settings,
      getGame: () => game,
      getJobs: () => jobs,
      haveTech,
    },
    industry: {
      resourceRatio: {
        getQuarryManager: () => QuarryManager,
        getMineManager: () => MineManager,
        getExtractorManager: () => ExtractorManager,
        getResources: () => resources,
        getSettings: () => settings,
        getBuildings: () => buildings,
        haveTech,
      },
      smelter: {
        reader: {
          getSmelterManager: () => SmelterManager,
          getGame: () => game,
          getResources: () => resources,
          getSettings: () => settings,
          getJobs: () => jobs,
          getBuildings: () => buildings,
          haveTech,
          consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
        },
        publishTooltips: (tooltips) => {
          for (const tooltip of tooltips) {
            state.tooltips[tooltip.key] = tooltip.value;
          }
        },
      },
      factory: {
        adapter: {
          getManager: () => FactoryManager,
          getState: () => state,
          getSettings: () => settings,
          getGame: () => game,
          getResources: () => resources,
          consumptionBalanceMinimum: CONSUMPTION_BALANCE_MIN,
        },
        getState: () => state,
      },
      getFactoryManager: () => FactoryManager,
      getFactorySettings: () => settings,
      getFactoryState: () => state,
      testSurface,
    },
    economy: {
      miningDroid: () => DroidManager,
      graphene: {
        getGrapheneManager: () => GrapheneManager,
        getResources: () => resources,
        consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
      },
      consume: {
        getResources: () => resources,
        isHungryRace,
      },
      replicator: {
        selectionReader: {
          getManager: () => ReplicatorManager,
          getSettings: () => settings,
          getResources: () => resources,
        },
        governorGameReader: {
          getGovernor,
          haveReplicatorTechnology: () => haveTech("replicator"),
          getGame: () => game,
        },
        getReplicatorManager: () => ReplicatorManager,
        getGovernorOffice: () => getVueById("govOffice"),
        resolveVueMethod,
      },
    },
  });

  let {
    formatLogString,
    logPrestige,
    autoPrestige,
    isPrestigeAllowed,
    isCataclysmPrestigeAvailable,
    isBioseederPrestigeAvailable,
    isWhiteholePrestigeAvailable,
    isApocalypsePrestigeAvailable,
    isAscensionPrestigeAvailable,
    isWitchAscensionPrestigeAvailable,
    isDemonicPrestigeAvailable,
    isPillarFinished,
    isGECKNeeded,
    getBlackholeMass,
  } = createPrestigeAutomationCompositionControl({
    automation: {
      log: {
        getSettings: () => settings,
        getGame: () => game,
        getState: () => state,
        getPrestigeTypes: () => prestigeTypes,
        getGameLog: () => GameLog,
        getFastEval: () => fastEval,
        getSaveStateLog: () =>
          getTestContext("prestigeLog")?.actions?.saveStateLog ?? saveStateLog,
        getTriggerFileDownload: () =>
          getTestContext("prestigeLog")?.actions?.triggerFileDownload ??
          triggerFileDownload,
      },
      prestige: {
        reader: {
          getState: () => state,
          getSettings: () => settings,
          getGame: () => game,
          getResources: () => resources,
          getBuildings: () => buildings,
          getTechIds: () => techIds,
          getWarManager: () => WarManager,
          getHaveTech: () => haveTech,
          getVueById,
          eligibility: {
            isBioseederPrestigeAvailable: () => isBioseederPrestigeAvailable(),
            isCataclysmPrestigeAvailable: () => isCataclysmPrestigeAvailable(),
            isWhiteholePrestigeAvailable: () => isWhiteholePrestigeAvailable(),
            isApocalypsePrestigeAvailable: () =>
              isApocalypsePrestigeAvailable(),
            isAscensionPrestigeAvailable: () => isAscensionPrestigeAvailable(),
            isWitchAscensionPrestigeAvailable: (demonic) =>
              isWitchAscensionPrestigeAvailable(demonic),
            isDemonicPrestigeAvailable: () => isDemonicPrestigeAvailable(),
          },
        },
        executor: {
          getState: () => state,
          getBuildings: () => buildings,
          getTechIds: () => techIds,
          getVueById,
          clickMultipliers,
          loadQueuedSettings,
        },
      },
    },
    eligibility: {
      getSettings: () => settings,
      getGame: () => game,
      getResources: () => resources,
      getBuildings: () => buildings,
      getTechIds: () => techIds,
      getMechManager: () => MechManager,
      haveTech: (...args) => haveTech(...args),
      isAchievementUnlocked: (...args) => isAchievementUnlocked(...args),
      testSurface,
      setTestContext(context) {
        settings = context.settings;
        game = context.game;
        resources = context.resources;
        buildings = context.buildings;
        techIds = context.techIds;
        MechManager = context.MechManager;
        haveTech = context.haveTech;
        isAchievementUnlocked = context.isAchievementUnlocked;
      },
    },
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      prestigeLog: { formatLogString, logPrestige },
      setPrestigeLogTestContext(context) {
        settings = context.settings;
        game = context.game;
        state = context.state;
        GameLog = context.GameLog;
        setTestContext("prestigeLog", context);
      },
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      autoEvolution,
      autoUniverseSelection,
      autoCraft,
      autoSpy,
      autoBattle,
      autoPrestige,
      setWave3TestContext(context) {
        foundryList = context.foundryList;
        SpyManager = context.SpyManager;
        buildings = context.buildings;
        haveTask = context.haveTask;
        haveTech = context.haveTech;
        isBioseederPrestigeAvailable = context.isBioseederPrestigeAvailable;
        if ("foreignView" in context) {
          setTestContext("foreignControls", {
            getVueById: () => context.foreignView,
          });
        }
      },
      setForeignControlsTestContext(context) {
        setTestContext("foreignControls", context);
      },
    }));

  const {
    ocularPowerData,
    wishData,
    autoShapeshift,
    autoPsychic,
    autoOcularPowers,
    autoWish,
    autoGenetics,
  } = createTraitAutomationCompositionControl({
    getStoneName: () => resources.Stone.name,
    shapeshift: {
      reader: {
        getGame: () => game,
        getSettings: () => settings,
      },
      executor: {
        getGame: () => game,
        getVueById,
      },
    },
    psychic: {
      controls: {
        getVueById,
        clickSelector: (selector) => $(selector).click(),
      },
      adapter: {
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
      },
    },
    ocularPower: {
      controls: {
        getVueById,
        getDocument: () => runtimeEnvironment.document,
      },
      adapter: {
        getGame: () => game,
        getSettings: () => settings,
        getPowerData: () => ocularPowerData,
      },
    },
    wish: {
      reader: {
        getGame: () => game,
        getSettings: () => settings,
      },
      executor: {
        getGame: () => game,
        controls: {
          getVueById,
          clickSelector: (selector) => $(selector).click(),
        },
      },
    },
    genetics: {
      controls: {
        getVueById,
        clickMultipliers,
      },
      adapter: {
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        getTicksPerSecond: () => ticksPerSecond(),
      },
    },
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      autoMiningDroid,
      DroidManager,
      autoGraphenePlant,
      GrapheneManager,
      autoShapeshift,
      autoWish,
      autoGenetics,
      automationSettings: settings,
      automationResources: resources,
      automationKeyManager: KeyManager,
      setAutomationTestContext(context) {
        game = context.game;
        win = context.win;
      },
    }));

  const {
    autoMarket,
    autoGalaxyMarket,
    autoGatherResources,
    autoBuild,
    autoResearch,
  } = createMarketProgressionAutomationControl({
    market: {
      market: {
        reader: {
          getManager: () => MarketManager,
          getGame: () => game,
          getResources: () => resources,
          getSettings: () => settings,
          ticksPerSecond,
        },
        executor: {
          getManager: () => MarketManager,
          getResources: () => resources,
        },
        tradeRoutes: { adjust: () => adjustTradeRoutes() },
      },
      galaxyMarket: {
        getManager: () => GalaxyTradeManager,
        getOffers: () => poly.galaxyOffers,
        getResources: () => resources,
        getSettings: () => settings,
      },
      gatherResources: {
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        getBuildings: () => buildings,
        getResourcesPerClick: () => getResourcesPerClick(),
      },
    },
    progression: {
      build: {
        adapter: {
          getBuildingManager: () => BuildingManager,
          getProjectManager: () => ProjectManager,
          getState: () => state,
          getSettings: () => settings,
          getResources: () => resources,
          getCostConflict: (target) => getCostConflict(target),
        },
        isGovernReady: () => Boolean(game?.global?.civic?.govern),
        diagnostics,
      },
      research: {
        reader: {
          getState: () => state,
          getCostConflict: (tech) => getCostConflict(tech),
        },
        executor: {
          getState: () => state,
          getBuildingManager: () => BuildingManager,
          getProjectManager: () => ProjectManager,
        },
        diagnostics,
      },
    },
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      autoConsume,
      autoReplicator,
      autoMarket,
      autoGalaxyMarket,
      autoGatherResources,
      getAutomationPoly: () => poly,
      setWave2TestContext(context) {
        ReplicatorManager = context.ReplicatorManager;
        MarketManager = context.MarketManager;
        GalaxyTradeManager = context.GalaxyTradeManager;
        buildings = context.buildings;
        adjustTradeRoutes = context.adjustTradeRoutes;
        getResourcesPerClick = context.getResourcesPerClick;
      },
    }));

  let techConflictClock = browserClock;
  const { getTechConflict } = createTechConflictControl({
    getClock: () => techConflictClock,
    getSettings: () => settings,
    getResources: () => resources,
    getState: () => state,
    getGame: () => game,
    guardActive: (setting) => guardActive(setting),
    guardBananaRepublicActive: () => guardBananaRepublicActive(),
    retirementChallengeAssistActive: () => retirementChallengeAssistActive(),
    retirementPreparationMissing: () => retirementPreparationMissing(),
    isAchievementUnlocked: (...args) => isAchievementUnlocked(...args),
    fanatAchievements,
    formatTechConflict: formatTechConflictControl,
    getNumberString,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      getTechConflict,
      setTechConflictTestContext(context) {
        settings = context.settings;
        game = context.game;
        state = context.state;
        resources = context.resources;
        buildings = context.buildings;
        isAchievementUnlocked = context.isAchievementUnlocked;
        techConflictClock = context.clock ?? browserClock;
      },
    }));

  const { autoTrigger, autoPower, autoStorage } =
    createTriggerPowerAutomationControl({
      trigger: {
        reader: {
          getState: () => state,
          shouldSaveInflationMoney: inflationChallengeShouldSaveMoney,
        },
        executor: {
          getState: () => state,
        },
      },
      powerStorage: {
        power: {
          warnings: {
            getDocument: () => runtimeEnvironment.window.document,
            getWindow: () => runtimeEnvironment.window,
          },
          adapter: {
            getGame: () => game,
            getSettings: () => settings,
            getState: () => state,
            getResources: () => resources,
            getBuildings: () => buildings,
            getJobs: () => jobs,
            getPoly: () => poly,
            getBuildingManager: () => BuildingManager,
            getFleetManager: () => FleetManager,
            getMechManager: () => MechManager,
            getWarManager: () => WarManager,
            consumptionBalanceMinimum: CONSUMPTION_BALANCE_MIN,
            isSupportResource: (value) => value instanceof Support,
            isHellSuppressionUseful: isHellSupressUseful,
            getGalaxyRegions,
            traitValue: traitVal,
            getAuthorityGarrisonRequirement:
              authorityPolicy.getRequiredAuthorityGarrison,
            haveTech,
            getHealingRate,
            isHungryRace,
            isPillarFinished,
            getBuildingIds: () => buildingIds,
            log: (message) => runtimeEnvironment.log(message),
          },
          diagnostics,
        },
        storage: {
          debug: { getWindow: () => runtimeEnvironment.window },
          adapter: {
            getStorageManager: () => StorageManager,
            getGame: () => game,
            getSettings: () => settings,
            getState: () => state,
            getResources: () => resources,
            getBuildingManager: () => BuildingManager,
            getProjectManager: () => ProjectManager,
            getFleetManagerOuter: () => FleetManagerOuter,
            log: (message) => runtimeEnvironment.log(message),
          },
          expand: expandStorage,
        },
      },
    });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      autoMerc,
      WarManager,
      GameLog,
      autoPsychic,
      autoOcularPowers,
      autoTrigger,
      automationState: state,
      setWave1TestManagers(managers) {
        WarManager = managers.WarManager;
        MinorTraitManager = managers.MinorTraitManager;
      },
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      powerSupport: {
        getCitadelConsumption,
        isHellSupressUseful,
        adjustSpire,
        getBestSupplyRatio,
      },
      setPowerSupportTestContext(context) {
        game = context.game;
        jobs = context.jobs;
        crafter = context.crafter;
        buildings = context.buildings;
      },
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      expandStorage,
      setStorageExpansionTestContext(context) {
        game = context.game;
        settings = context.settings;
        resources = context.resources;
        buildings = context.buildings;
        StorageManager = context.StorageManager;
      },
    }));

  const {
    autoMinorTrait,
    autoMutateTrait,
    autoFleetOuter,
    autoFleet,
    autoMech,
  } = createTraitFleetAutomationControl({
    traitResource: {
      minorTrait: {
        reader: {
          getMinorTraitManager: () => MinorTraitManager,
          getResources: () => resources,
        },
        executor: {
          traitControls,
          getResources: () => resources,
        },
      },
      mutation: {
        reader: {
          getMutableTraitManager: () => MutableTraitManager,
          getGame: () => game,
          getResources: () => resources,
        },
        executor: {
          getMutableTraitManager: () => MutableTraitManager,
          getGame: () => game,
          getResources: () => resources,
          traitControls,
          getGameLog: () => GameLog,
        },
      },
    },
    fleetMech: {
      outerFleet: {
        getFleetManagerOuter: () => FleetManagerOuter,
        getWarManager: () => WarManager,
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        traitVal,
        assessAuthorityRemoval: authorityPolicy.assessAuthorityRemoval,
        getGameLog: () => GameLog,
      },
      fleet: {
        getFleetManager: () => FleetManager,
        getGame: () => game,
        getSettings: () => settings,
        getResources: () => resources,
        getBuildings: () => buildings,
        getGalaxyRegions,
        guardActive,
        galaxyAssaultPending,
      },
      mech: {
        adapter: {
          getMechManager: () => MechManager,
          getGame: () => game,
          getSettings: () => settings,
          getResources: () => resources,
          getBuildings: () => buildings,
          haveTech,
          haveTask,
          getGameLog: () => GameLog,
          getJQuery: () => $,
          readDebugEnabled: () => diagnostics.readMechDebugEnabled(),
          debugLog: (message) => runtimeEnvironment.log(message),
        },
        readDebugEnabled: () => diagnostics.readMechDebugEnabled(),
        log: (label, outcome) => runtimeEnvironment.log(label, outcome),
      },
    },
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      autoMinorTrait,
      MinorTraitManager,
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      autoPlanetSelection,
      autoJobs,
      autoBuild,
      autoResearch,
      autoMutateTrait,
      setWave4TestContext(context) {
        generatePlanets = context.generatePlanets;
        getStarLevel = context.getStarLevel;
        isAchievementUnlocked = context.isAchievementUnlocked;
        races = context.races;
        JobManager = context.JobManager;
        BuildingManager = context.BuildingManager;
        ProjectManager = context.ProjectManager;
        MutableTraitManager = context.MutableTraitManager;
        getCostConflict = context.getCostConflict;
      },
    }));

  let { adjustTradeRoutes } = createTradeRouteControl({
    getSettings: () => settings,
    getGame: () => game,
    getResources: () => resources,
    getMarketManager: () => MarketManager,
    getGovernor: () => getGovernor(),
    shouldSaveInflationMoney: () => inflationChallengeShouldSaveMoney(),
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      adjustTradeRoutes,
      setTradeRoutesTestContext(context) {
        settings = context.settings;
        game = context.game;
        resources = context.resources;
        MarketManager = context.MarketManager;
      },
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      galaxyIntelligence: {
        getGalaxyCombatShipPower,
        getPiracyMultiplier,
        galaxyAssaultPending,
        getGalaxyRegions,
      },
      setGalaxyIntelligenceTestContext(context) {
        game = context.game;
        buildings = context.buildings;
        resources = context.resources;
        poly = context.poly;
        settings = context.settings;
        traitVal = context.traitVal;
      },
    }));

  const { updateScriptData, finalizeScriptData } =
    createScriptDataLifecycleControl({
      diagnostics,
      getSettings: () => settings,
      getState: () => state,
      getGame: () => game,
      getResources: () => resources,
      getBuildings: () => buildings,
      getWarManager: () => WarManager,
      getMarketManager: () => MarketManager,
      getBuildingManager: () => BuildingManager,
      getSpyManager: () => SpyManager,
      getEjectManager: () => EjectManager,
      getSupplyManager: () => SupplyManager,
      getNaniteManager: () => NaniteManager,
      getRitualManager: () => RitualManager,
      getUpdateCraftCost: () => updateCraftCost,
      getResourcesPerClick: () => getResourcesPerClick,
      getTicksPerSecond: () => ticksPerSecond,
      getHaveTech: () => haveTech,
      testSurface,
    });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      autoPower,
      autoStorage,
      autoFleetOuter,
      autoFleet,
      autoMech,
      setWave5TestManagers(managers) {
        StorageManager = managers.StorageManager;
        FleetManagerOuter = managers.FleetManagerOuter;
        FleetManager = managers.FleetManager;
        MechManager = managers.MechManager;
      },
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      storageRequirements: { calculateRequiredStorages },
      setStorageRequirementTestContext(context) {
        settings = context.settings;
        state = context.state;
        resources = context.resources;
        buildings = context.buildings;
        game = context.game;
        BuildingManager = context.BuildingManager;
        ProjectManager = context.ProjectManager;
        FleetManagerOuter = context.FleetManagerOuter;
        inflationChallengeAssistActive = context.inflationChallengeAssistActive;
        retirementChallengeAssistActive =
          context.retirementChallengeAssistActive;
      },
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      prioritizeDemandedResources,
      makeDemandProject(cost, progress) {
        return Object.defineProperties(Object.create(Project.prototype), {
          cost: { value: cost, writable: true, enumerable: true },
          progress: { value: progress, writable: true, enumerable: true },
        });
      },
      setDemandPrioritizationTestContext(context) {
        settings = context.settings;
        state = context.state;
        resources = context.resources;
        buildings = context.buildings;
        game = context.game;
        crafter = context.crafter;
        SpyManager = context.SpyManager;
        FleetManagerOuter = context.FleetManagerOuter;
        JobManager = context.JobManager;
        FactoryManager = context.FactoryManager;
        inflationChallengeAssistActive = context.inflationChallengeAssistActive;
        retirementChallengeAssistActive =
          context.retirementChallengeAssistActive;
      },
    }));

  let { checkAffordableCustom, readQueuedTarget } = createQueueQueriesControl({
    getResources: () => resources,
    getPoly: () => poly,
    getMechManager: () => MechManager,
    getBuildingIds: () => buildingIds,
    getArpaIds: () => arpaIds,
  });

  const { updatePriorityTargets } = createPriorityTargetsControl({
    getGame: () => game,
    getSpyManager: () => SpyManager,
    getFleetManagerOuter: () => FleetManagerOuter,
    getMechManager: () => MechManager,
    getTriggerManager: () => TriggerManager,
    getJQuery: () => $,
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getBuildings: () => buildings,
    getTechIds: () => techIds,
    getBuildingIds: () => buildingIds,
    getArpaIds: () => arpaIds,
    readQueuedTarget,
    getTechConflict,
    isPrestigeAllowed,
    haveTask,
    inflationChallengeShouldSaveMoney,
    inflationChallengeMoney: INFLATION_CHALLENGE_MONEY,
    testSurface,
    setTestContext(context) {
      settings = context.settings;
      state = context.state;
      game = context.game;
      resources = context.resources;
      buildings = context.buildings;
      techIds = context.techIds;
      buildingIds = context.buildingIds;
      arpaIds = context.arpaIds;
      SpyManager = context.SpyManager;
      FleetManagerOuter = context.FleetManagerOuter;
      MechManager = context.MechManager;
      TriggerManager = context.TriggerManager;
      if (context.poly) poly = context.poly;
    },
  });

  const { checkEvolutionResult } = createEvolutionResultCheckControl({
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getGame: () => game,
    getRaces: () => races,
    getTraitManager: () => MutableTraitManager,
    getGameLog: () => GameLog,
    getResetButton: () =>
      runtimeEnvironment.document.querySelector(".reset .button:not(.right)"),
    localize: (key) => game.loc(key),
    formatLog: (event, localize) => formatEvolutionLogControl(event, localize),
    addEvolutionSetting: () => addEvolutionSetting(),
    updateSettingsFromState: () => updateSettingsFromState(),
    getTestActions: () => getTestContext("evolutionResult")?.actions,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      checkEvolutionResult: () => checkEvolutionResult(),
      setEvolutionResultTestContext(context) {
        settings = context.settings;
        settingsRaw = context.settingsRaw;
        state = context.state;
        game = context.game;
        races = context.races;
        MutableTraitManager = context.MutableTraitManager;
        GameLog = context.GameLog;
        setTestContext("evolutionResult", context);
      },
    }));

  const { updateTabs } = createTabRefreshControl({
    getState: () => state,
    getGame: () => game,
    getBuildings: () => buildings,
    getResources: () => resources,
    getHaveTech: () => haveTech,
    getMainVue,
    testSurface,
    setTestContext(context) {
      state = context.state;
      game = context.game;
      buildings = context.buildings;
      resources = context.resources;
      haveTech = context.haveTech;
      win = context.win;
    },
  });

  const { getMultiSegmentedTimeLeft } = createTargetTimingDisplayControl({
    getGame: () => game,
    getTimeFormat: () => (seconds) => poly.timeFormat(seconds),
    isProject: (target) => target instanceof Project,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      getMultiSegmentedTimeLeft,
      makeTargetTimingProject(progress, currentStep, cost) {
        return Object.defineProperties(Object.create(Project.prototype), {
          gameMax: { value: 0, enumerable: true },
          count: { value: 0, enumerable: true },
          progress: { value: progress, enumerable: true },
          currentStep: { value: currentStep, enumerable: true },
          cost: { value: cost, enumerable: true },
        });
      },
      setTargetTimingTestContext(context) {
        game = context.game;
        poly = context.poly;
      },
    }));

  const {
    updateActiveTargetsUI,
    buildActiveTargetsUI,
    removeActiveTargetsUI,
    buildBuildPlannerUI,
    removeBuildPlannerUI,
  } = createQueuePanelsControl({
    getJQuery: () => $,
    getGame: () => game,
    getResources: () => resources,
    getPoly: () => poly,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getMultiSegmentedTimeLeft: (target) => getMultiSegmentedTimeLeft(target),
    isProject: (target) => target instanceof Project,
    isTechnology: (target) => target instanceof Technology,
    getResizeObserver: () =>
      typeof runtimeEnvironment.ResizeObserver === "function"
        ? runtimeEnvironment.ResizeObserver
        : undefined,
    updateSettingsFromState: () => updateSettingsFromState(),
    makePlannerStats: () => makePlannerStats(),
    savePlannerStats: (stats) => savePlannerStats(stats),
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      plannerAnalysis: {
        plannerLimitingResource,
        makePlannerStats,
        loadPlannerStats,
        savePlannerStats: () => savePlannerStats(state.plannerStats),
      },
      setPlannerAnalysisTestContext(context) {
        game = context.game;
        resources = context.resources;
        state = context.state;
      },
    }));

  const { updateBuildPlanner } = createBuildPlannerControl({
    getGame: () => game,
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    getPoly: () => poly,
    getNiceNumber,
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    plannerLimitingResource,
    loadPlannerStats,
    savePlannerStats,
    testSurface,
    setTestContext(context) {
      settings = context.settings;
      settingsRaw = context.settingsRaw;
      state = context.state;
      game = context.game;
      resources = context.resources;
      poly = context.poly;
    },
  });

  const { updateState } = createStateUpdateControl({
    diagnostics,
    getJQuery: () => $,
    getGame: () => game,
    getState: () => state,
    getActiveState: () => state,
    getSettingsRaw: () => settingsRaw,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getStorageManager: () => StorageManager,
    getTriggerManager: () => TriggerManager,
    getPoly: () => poly,
    checkEvolutionResult,
    updateTriggerSettingsContent,
    updatePriorityTargets,
    updateProjects: () => ProjectManager.updateProjects(),
    calculateRequiredStorages,
    prioritizeDemandedResources,
    updateActiveTargetsUI,
    isTechnology: (target) => target instanceof Technology,
    isProject: (target) => target instanceof Project,
    clock: browserClock,
    testSurface,
    makeStateUpdateTargets: () => ({
      technology: Object.create(Technology.prototype),
      project: Object.create(Project.prototype),
      building: {},
    }),
    setTestContext(context) {
      settings = context.settings;
      settingsRaw = context.settingsRaw;
      state = context.state;
      game = context.game;
      resources = context.resources;
      buildings = context.buildings;
      StorageManager = context.StorageManager;
      ProjectManager = context.ProjectManager;
      TriggerManager = context.TriggerManager;
      poly = context.poly;
    },
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      gameActionVerification: {
        verifyGameActions,
        verifyGameActionsExist,
        verifyGameActionExists,
      },
      setGameActionVerificationTestContext(context) {
        game = context.game;
        buildings = context.buildings;
      },
    }));

  const getScriptBootstrapActions = () =>
    getTestContext("scriptBootstrap")?.actions ?? {
      updateStandAloneSettings,
      updateStateFromSettings,
      updateSettingsFromState,
      verifyGameActions,
      tooltipObserverCallback,
      buildFilterRegExp,
      filterLog,
      schedule: (callback, delay) =>
        runtimeEnvironment.schedule(callback, delay),
      repeat: (callback, delay) => runtimeEnvironment.repeat(callback, delay),
      alert: (message) => runtimeEnvironment.alert(message),
      addErrorHandler,
      addScriptStyle,
      keyManagerInit: () => KeyManager.init(),
      initialiseState,
      initialiseRaces,
      updateOverrides,
      automate,
      automateLab,
      importSettings,
      exportSettings,
      loadStateLog,
      triggerFileDownload,
      displayScriptWarningNode,
    };

  const { initialiseScript, mainAutoEvolveScript } =
    createScriptBootstrapControl({
      getGame: () => game,
      getTechIds: () => techIds,
      getTechnology: () => Technology,
      getBuildings: () => buildings,
      getBuildingIds: () => buildingIds,
      getState: () => state,
      getProjects: () => projects,
      getArpaIds: () => arpaIds,
      getJobs: () => jobs,
      getJobIds: () => jobIds,
      getCrafter: () => crafter,
      getTriggerManager: () => TriggerManager,
      getCheckActions: () => checkActions,
      getJQuery: () => $,
      getWindow: () => runtimeEnvironment.window,
      getUserscriptEnvironment: () => userscriptEnvironment,
      getWin: () => win,
      getGameKeyboardHandlers: () => gameKeyboardHandlers,
      getPageShell: () => gamePageShell,
      getNeedSandboxBypass: () => needSandboxBypass,
      getPoly: () => poly,
      getSettings: () => settings,
      getSafeMode: () => safeMode,
      getActions: getScriptBootstrapActions,
      setWin: (value) => {
        win = value;
      },
      setGame: (value) => {
        game = value;
      },
      setNeedSandboxBypass: (value) => {
        needSandboxBypass = value;
      },
      testSurface,
      setTestContext(context) {
        if ("game" in context) game = context.game;
        if ("state" in context) state = context.state;
        if ("settings" in context) settings = context.settings;
        if ("techIds" in context) techIds = context.techIds;
        if ("buildingIds" in context) buildingIds = context.buildingIds;
        if ("arpaIds" in context) arpaIds = context.arpaIds;
        if ("jobIds" in context) jobIds = context.jobIds;
        if ("buildings" in context) buildings = context.buildings;
        if ("projects" in context) projects = context.projects;
        if ("jobs" in context) jobs = context.jobs;
        if ("crafter" in context) crafter = context.crafter;
        if ("TriggerManager" in context)
          TriggerManager = context.TriggerManager;
        if ("gameModal" in context) gameModal = context.gameModal;
        if ("KeyManager" in context) KeyManager = context.KeyManager;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("safeMode" in context) safeMode = context.safeMode;
        if ("checkActions" in context) checkActions = context.checkActions;
        setTestContext("scriptBootstrap", context);
      },
    });

  const { buildFilterRegExp, filterLog } = createLogFilterControl({
    getSettingsRaw: () => settingsRaw,
    getSettings: () => settings,
    getState: () => state,
    getPoly: () => poly,
    testSurface,
    setTestContext(context) {
      settingsRaw = context.settingsRaw;
      settings = context.settings;
      state = context.state;
      poly = context.poly;
    },
  });

  const { getTooltipInfo, tooltipObserverCallback, addTooltip } =
    createTooltipUiControl({
      getJQuery: () => $,
      getUiSurface: () => gameUiSurface,
      getMutationObserver: () => runtimeEnvironment.MutationObserver,
      getSettings: () => settings,
      getState: () => state,
      getGame: () => game,
      getBuildings: () => buildings,
      getJobs: () => jobs,
      getResources: () => resources,
      getTechIds: () => techIds,
      getBuildingIds: () => buildingIds,
      getArpaIds: () => arpaIds,
      getMechManager: () => MechManager,
      getFleetManagerOuter: () => FleetManagerOuter,
      getPoly: () => poly,
      readCitadelConsumption: () => getCitadelConsumption,
      readNiceNumber: () => getNiceNumber,
      readCostConflict: () => getCostConflict,
      readTechConflict: () => getTechConflict,
      readHaveTech: () => haveTech,
      readHealingRate: () => getHealingRate,
      readGrowthRate: () => getGrowthRate,
      readGovernor: () => getGovernor,
      readTraitVal: () => traitVal,
      isTechnology: (value) => value instanceof Technology,
      testSurface,
      setTestContext(context) {
        if ("settings" in context) settings = context.settings;
        if ("state" in context) state = context.state;
        if ("game" in context) game = context.game;
        if ("buildings" in context) buildings = context.buildings;
        if ("jobs" in context) jobs = context.jobs;
        if ("resources" in context) resources = context.resources;
        if ("techIds" in context) techIds = context.techIds;
        if ("buildingIds" in context) buildingIds = context.buildingIds;
        if ("arpaIds" in context) arpaIds = context.arpaIds;
        if ("MechManager" in context) MechManager = context.MechManager;
        if ("FleetManagerOuter" in context)
          FleetManagerOuter = context.FleetManagerOuter;
      },
    });

  const { updateOverrides } = createOverrideCompositionControl({
    getSafeMode: () => safeMode,
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getCheckTypes: () => checkTypes,
    getCheckCompare: () => checkCompare,
    getCheckCustom: () => checkCustom,
    getHaveTask: () => haveTask,
    getGameModal: () => gameModal,
    getGame: () => game,
    getGameLog: () => GameLog,
    getJQuery: () => $,
    changeDisplayInputNode,
  });

  const {
    customRaceRankCost,
    customRaceGeneBalance,
    customRaceRankOptions,
    customRaceTraitEffect,
    customRaceEditorTraits,
    customRaceDraftFromPreset,
  } = createCustomRaceModelControl({
    getGame: () => game,
    getPoly: () => poly,
    getResources: () => resources,
    getRaces: () => races,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      customRaceModel: {
        customRaceRankCost,
        customRaceGeneBalance,
        customRaceRankOptions,
        customRaceTraitEffect,
        customRaceEditorTraits,
        customRaceDraftFromPreset,
      },
      setCustomRaceModelTestContext(context) {
        game = context.game;
        poly = context.poly;
        resources = context.resources;
        races = context.races;
      },
    }));

  const {
    showCustomRaceImportStatus,
    getCustomRacePreset,
    refreshCustomRacePresetSelectors,
    buildCustomRacePresetEditor,
    importCustomRaceIntoLab,
    automateLab,
  } = createCustomRaceUiControl({
    getJQuery: () => $,
    getUiSurface: () => gameUiSurface,
    getSettingsRaw: () => settingsRaw,
    getSettings: () => settings,
    getState: () => state,
    getGame: () => game,
    getPoly: () => poly,
    getCustomRaceDraftFromPreset: customRaceDraftFromPreset,
    getCustomRaceEditorTraits: customRaceEditorTraits,
    getCustomRaceRankOptions: customRaceRankOptions,
    getCustomRaceTraitEffect: customRaceTraitEffect,
    getCustomRaceGeneBalance: customRaceGeneBalance,
    getUpdateSettingsFromState: () => updateSettingsFromState,
    getUpdateOverrides: () => updateOverrides,
    customRaceLab: createGameCustomRaceLabControl({
      getVueById: (id) => getVueById(id),
      getDocument: () => runtimeEnvironment.document,
    }),
    getAlert: () => (message) => runtimeEnvironment.alert(message),
    testSurface,
    setTestContext(context) {
      if ("settingsRaw" in context) settingsRaw = context.settingsRaw;
      if ("settings" in context) settings = context.settings;
      if ("state" in context) state = context.state;
      if ("game" in context) game = context.game;
      if ("poly" in context) poly = context.poly;
      if ("resources" in context) resources = context.resources;
      if ("races" in context) races = context.races;
      if ("win" in context) win = context.win;
    },
  });

  let tickTestControllers;
  const tickControllers = {
    updateScriptData,
    updateOverrides,
    finalizeScriptData,
    updateTabs,
    updateState,
    updateUI: () => updateUI(),
    autoEvolution,
    autoGatherResources,
    autoMarket,
    autoHell,
    autoGalaxyMarket,
    autoMiningDroid,
    autoGraphenePlant,
    autoAlchemy,
    autoPylon,
    autoQuarry,
    autoMine,
    autoExtractor,
    autoSmelter,
    autoStorage,
    autoReplicator,
    autoTrigger,
    autoResearch,
    autoBuild,
    autoFactory,
    autoJobs,
    autoFleetOuter,
    autoFleet,
    autoMech,
    autoGenetics,
    autoMinorTrait,
    autoCraft,
    autoMerc,
    autoSpy,
    autoBattle,
    autoTax,
    autoGovernment,
    autoConsume,
    autoPower,
    isPrestigeAllowed,
    autoPrestige,
    autoShapeshift,
    autoPsychic,
    autoOcularPowers,
    autoWish,
    autoMutateTrait,
    updateBuildPlanner,
    recordStateSnapshot,
  };

  // Suppresses the game's per-period deep clone of its own state on the periods the script skips.
  // Opt-in, and inert until the setting turns it on.
  const periodGate = createPeriodGateControl({
    getMainVue: () => getMainVue(),
    getVueById: (id) => getVueById(id),
  });

  const { automate } = createTickCompositionControl({
    reader: {
      getSettings: () => settings,
      getState: () => state,
      getGame: () => game,
    },
    controls: {
      getKeyManager: () => KeyManager,
      getState: () => state,
      getResources: () => resources,
      getNaniteManager: () => NaniteManager,
      getSupplyManager: () => SupplyManager,
      getEjectManager: () => EjectManager,
      getPeriodGate: () => periodGate,
    },
    controllers: tickControllers,
    getTestControllers: () => tickTestControllers,
    diagnostics,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      automate: () => automate(),
      setTickTestContext(context) {
        settings = context.settings;
        state = context.state;
        game = context.game;
        resources = context.resources;
        KeyManager = context.KeyManager;
        NaniteManager = context.NaniteManager;
        SupplyManager = context.SupplyManager;
        EjectManager = context.EjectManager;
        tickTestControllers = context.controllers;
      },
    }));

  const {
    updateDebugData,
    addScriptStyle,
    checkIgnoredError,
    displayScriptWarningNode,
    addErrorHandler,
  } = createScriptRuntimeUiControl({
    getJQuery: () => $,
    getDocument: () => runtimeEnvironment.document,
    getState: () => state,
    getGame: () => game,
    getWin: () => win,
    getCreateOptionsModal: () => createOptionsModal,
    getOpenOptionsModal: () => openOptionsModal,
    getScriptVersionExtra: () => SCRIPT_VERSION_EXTRA,
    getScriptVersion: () => userscriptEnvironment.getScriptVersion(),
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      scriptRuntimeUI: {
        updateDebugData,
        addScriptStyle,
        checkIgnoredError,
        displayScriptWarningNode,
        addErrorHandler,
      },
      setScriptRuntimeUITestContext(context) {
        if ("state" in context) state = context.state;
        if ("game" in context) game = context.game;
        if ("win" in context) win = context.win;
      },
    }));

  const {
    prestigeTypes,
    prestigeOptions,
    checkCompare,
    checkCompareExpressions,
    checkCustom,
    argType,
    checkTypes,
    retBools,
    overrideOnlyChecks,
  } = createOverrideCatalogControl({
    readSettings: () => settings,
    readSettingsRaw: () => settingsRaw,
    readState: () => state,
    readGame: () => game,
    readBuildingIds: () => buildingIds,
    readBuildings: () => buildings,
    readResources: () => resources,
    readTechIds: () => techIds,
    readArpaIds: () => arpaIds,
    readJobIds: () => jobIds,
    readRaces: () => races,
    readGovernmentManager: () => GovernmentManager,
    readSmelterManager: () => SmelterManager,
    readFactoryManager: () => FactoryManager,
    readWarManager: () => WarManager,
    readUniverses: () => universes,
    readGovernors: () => governors,
    readChallenges: () => challenges,
    readBiomeList: () => biomeList,
    readTraitList: () => traitList,
    readBuildSelectOptions: () => buildSelectOptions,
    readFastEval: () => fastEval,
    readGovernor: () => getGovernor,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      settingsControls: {
        removeScriptSettings,
        buildScriptSettings,
        buildImportExport,
        buildSettingsSectionImpl,
        buildSettingsSection,
        buildSettingsSection2,
        genericResetFunction,
        addStandardHeading,
        addSettingsHeader1,
        addSettingsHeader2,
        buildSelectOptions,
        openOverrideModal,
        buildOverrideSettings,
        buildInputNode,
        buildInputNodeForDisplay,
        changeDisplayInputNode,
        buildConditionType,
        buildConditionArg,
        buildConditionComparator,
        buildConditionRemove,
        buildConditionDuplicate,
        buildConditionEvalize,
        buildConditionRet,
        buildObjectListInput,
        addSettingsToggle,
        addSettingsNumber,
        addSettingsString,
        addSettingsSelect,
        addSettingsList,
        addInputCallbacks,
        addTableInput,
        addToggleCallbacks,
        addTableToggle,
        buildTableLabel,
        resetCheckbox,
        evaluateCheck: _,
        prestigeTypes,
        prestigeOptions,
        checkCompare,
        checkCustom,
        argType,
        checkTypes,
      },
      setSettingsControlsTestContext(context) {
        if ("settingsRaw" in context) settingsRaw = context.settingsRaw;
        if ("settings" in context) settings = context.settings;
        if ("game" in context) game = context.game;
        if ("state" in context) state = context.state;
        if ("win" in context) win = context.win;
      },
    }));

  const interfaceSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addSettingsHeader1,
    controlEffects: {
      activeTargetsUI: {
        enabled: buildActiveTargetsUI,
        disabled: removeActiveTargetsUI,
      },
      buildPlannerUI: {
        enabled: buildBuildPlannerUI,
        disabled: removeBuildPlannerUI,
      },
      displayPrestigeTypeInTopBar: {
        enabled: updatePrestigeInTopBar,
        disabled: updatePrestigeInTopBar,
      },
      displayTotalDaysTypeInTopBar: {
        enabled: updateTotalDaysInTopBar,
        disabled: updateTotalDaysInTopBar,
      },
    },
  };

  const getInterfaceSettingsActions = () => {
    if (!getTestContext("interfaceSettings")?.actions) {
      return interfaceSettingsActions;
    }

    return {
      buildSettingsSection:
        getTestContext("interfaceSettings")?.actions.buildSettingsSection,
      addSettingsToggle:
        getTestContext("interfaceSettings")?.actions.addSettingsToggle,
      addSettingsHeader1:
        getTestContext("interfaceSettings")?.actions.addSettingsHeader1,
      controlEffects: {
        activeTargetsUI: {
          enabled:
            getTestContext("interfaceSettings")?.actions.buildActiveTargetsUI,
          disabled:
            getTestContext("interfaceSettings")?.actions.removeActiveTargetsUI,
        },
        buildPlannerUI: {
          enabled:
            getTestContext("interfaceSettings")?.actions.buildBuildPlannerUI,
          disabled:
            getTestContext("interfaceSettings")?.actions.removeBuildPlannerUI,
        },
        displayPrestigeTypeInTopBar: {
          enabled:
            getTestContext("interfaceSettings")?.actions.updatePrestigeInTopBar,
          disabled:
            getTestContext("interfaceSettings")?.actions.updatePrestigeInTopBar,
        },
        displayTotalDaysTypeInTopBar: {
          enabled:
            getTestContext("interfaceSettings")?.actions
              .updateTotalDaysInTopBar,
          disabled:
            getTestContext("interfaceSettings")?.actions
              .updateTotalDaysInTopBar,
        },
      },
    };
  };

  let interfaceSettingsIntentHandler;
  const interfaceSettingsBrowserAdapter =
    createInterfaceSettingsBrowserAdapterControl({
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      intents: {
        handle: (intent) => interfaceSettingsIntentHandler.handle(intent),
      },
      getActions: getInterfaceSettingsActions,
    });

  interfaceSettingsIntentHandler = createInterfaceSettingsIntentControl({
    writer: {
      resetToDefaults: () =>
        (
          getTestContext("interfaceSettings")?.actions
            ?.resetInterfaceSettings ?? resetInterfaceSettings
        )(true),
      persist: () =>
        (
          getTestContext("interfaceSettings")?.actions
            ?.updateSettingsFromState ?? updateSettingsFromState
        )(),
    },
    reader: {
      read: () => ({
        activeTargetsUI: Boolean(settingsRaw.activeTargetsUI),
        buildPlannerUI: Boolean(settingsRaw.buildPlannerUI),
      }),
    },
    effects: {
      renderSettingsContent: () =>
        interfaceSettingsBrowserAdapter.updateInterfaceSettingsContent(),
      syncActiveTargetsUI: (enabled) =>
        (enabled
          ? (getTestContext("interfaceSettings")?.actions
              ?.buildActiveTargetsUI ?? buildActiveTargetsUI)
          : (getTestContext("interfaceSettings")?.actions
              ?.removeActiveTargetsUI ?? removeActiveTargetsUI))(),
      syncBuildPlannerUI: (enabled) =>
        (enabled
          ? (getTestContext("interfaceSettings")?.actions
              ?.buildBuildPlannerUI ?? buildBuildPlannerUI)
          : (getTestContext("interfaceSettings")?.actions
              ?.removeBuildPlannerUI ?? removeBuildPlannerUI))(),
      updatePrestigeInTopBar: () =>
        (
          getTestContext("interfaceSettings")?.actions
            ?.updatePrestigeInTopBar ?? updatePrestigeInTopBar
        )(),
      updateTotalDaysInTopBar: () =>
        (
          getTestContext("interfaceSettings")?.actions
            ?.updateTotalDaysInTopBar ?? updateTotalDaysInTopBar
        )(),
    },
  });

  const { buildInterfaceSettings, updateInterfaceSettingsContent } =
    interfaceSettingsBrowserAdapter;

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      interfaceSettings: {
        buildInterfaceSettings,
        updateInterfaceSettingsContent,
      },
      setInterfaceSettingsTestContext(context) {
        settingsRaw = context.settingsRaw;
        setTestContext("interfaceSettings", context);
      },
    }));

  let stateLogSettingsIntentHandler;
  const stateLogSettingsBrowserAdapter =
    createStateLogSettingsBrowserAdapterControl({
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      intents: {
        handle: (intent) => stateLogSettingsIntentHandler.handle(intent),
      },
      buildSettingsSection,
      addSettingsToggle,
      addSettingsNumber,
    });
  stateLogSettingsIntentHandler = createStateLogSettingsIntentControl({
    writer: {
      resetToDefaults: () => resetStateLogSettings(true),
      persist: () => updateSettingsFromState(),
    },
    renderSettingsContent: () =>
      stateLogSettingsBrowserAdapter.updateStateLogSettingsContent(),
  });
  const { buildStateLogSettings, updateStateLogSettingsContent } =
    stateLogSettingsBrowserAdapter;

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      stateLogSettings: {
        buildStateLogSettings,
        updateStateLogSettingsContent,
      },
      setStateLogSettingsTestContext(context) {
        settingsRaw = context.settingsRaw;
      },
    }));

  const { calculateMechStats, sorterHelper } = createUiSupportControl({
    getUiSurface: () => gameUiSurface,
    getMechJQuery: () => $,
    getSortJQuery: () => $,
    getMechManager: () => MechManager,
    getPoly: () => poly,
    getGame: () => game,
    average,
    isHTMLElement: (value) =>
      runtimeEnvironment.HTMLElement !== undefined &&
      value instanceof runtimeEnvironment.HTMLElement,
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      calculateMechStats,
      setMechStatsTestContext(context) {
        game = context.game;
        poly = context.poly;
        MechManager = context.MechManager;
      },
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "optionsModal",
      {
        optionsModal: optionsModalBrowserAdapter,
      },
    ]);
  const traitSettings = createTraitSettingsControl({
    getSettingsRaw: () => settingsRaw,
    setSettingsRaw: (value) => {
      settingsRaw = value;
    },
    getState: () => state,
    getGame: () => game,
    getRaces: () => races,
    getResources: () => resources,
    getPoly: () => poly,
    getMinorTraitManager: () => MinorTraitManager,
    getMutableTraitManager: () => MutableTraitManager,
    getOcularPowerData: () => ocularPowerData,
    getWishData: () => wishData,
    getMutationCostMultipliers: () => mutationCostMultipliers,
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    getSorterHelper: () => sorterHelper,
    buildSettingsSection,
    addStandardHeading,
    addSettingsSelect,
    addSettingsNumber,
    addSettingsToggle,
    addTableToggle,
    addTableInput,
    buildTableLabel,
    resetMinorTraitSettings: (...args) => resetMinorTraitSettings(...args),
    resetMutableTraitSettings: (...args) => resetMutableTraitSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    testSurface,
  });
  const {
    buildTraitSettings,
    updateImitateWarning,
    updateTraitSettingsContent,
    makeToggleSwitchesMutuallyExclusive,
  } = traitSettings;

  const uiRefreshActions = {
    createOptionsModal,
    updateOptionsUI,
    updatePrestigeInTopBar,
    createSettingToggle,
    updateSettingsFromState,
    buildScriptSettings,
    removeScriptSettings,
    createMechInfo,
    removeMechInfo,
    createCraftToggles,
    removeCraftToggles,
    createBuildingToggles,
    removeBuildingToggles,
    createArpaToggles,
    removeArpaToggles,
    createStorageToggles,
    removeStorageToggles,
    createMarketToggles,
    removeMarketToggles,
    createEjectToggles,
    removeEjectToggles,
    createSupplyToggles,
    removeSupplyToggles,
    buildActiveTargetsUI,
    buildBuildPlannerUI,
    updateDebugData,
    updateScriptData,
    finalizeScriptData,
    autoMarket,
    getNiceNumber,
    updateTotalDaysInTopBar,
  };

  const {
    updateSoulGemRate,
    renderPreviousGameStats,
    repairRuntimeAdapters,
    ensureAutomationContainer,
    updateUI,
  } = createRuntimeUiCompositionControl({
    soulGemRate: {
      getState: () => state,
      getResources: () => resources,
      getJQuery: () => $,
      getNiceNumber: (value) =>
        (
          getTestContext("uiRefresh")?.actions ?? uiRefreshActions
        ).getNiceNumber(value),
    },
    previousStats: {
      getGame: () => game,
      getWin: () => win,
      getJQuery: () => $,
      storage: runtimeEnvironment.storage,
    },
    runtimeAdapters: {
      getSettings: () => settings,
      getSettingsRaw: () => settingsRaw,
      getState: () => state,
      getGame: () => game,
      getJQuery: () => $,
      getUiSurface: () => gameUiSurface,
      getActions: () =>
        getTestContext("uiRefresh")?.actions ?? uiRefreshActions,
    },
    automationContainer: {
      getSettingsRaw: () => settingsRaw,
      getJQuery: () => $,
      getSafeMode: () => safeMode,
      getOverrideKeyLabel: () => overrideKeyLabel,
      getActions: () =>
        getTestContext("uiRefresh")?.actions ?? uiRefreshActions,
    },
    uiRefresh: {
      diagnostics,
      getUiSurface: () => gameUiSurface,
      getActions: () =>
        getTestContext("uiRefresh")?.actions ?? uiRefreshActions,
    },
  });

  if (TEST_SURFACE_ENABLED)
    registerTestPart(() => ({
      updateUI: () => updateUI(),
      setUIRefreshTestContext(context) {
        settings = context.settings;
        settingsRaw = context.settingsRaw;
        state = context.state;
        game = context.game;
        resources = context.resources;
        win = context.win;
        safeMode = context.safeMode;
        overrideKeyLabel = context.overrideKeyLabel;
        setTestContext("uiRefresh", context);
      },
    }));

  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "prestigeTopBar",
      {
        prestigeTopBar: prestigeTopBarBrowserAdapter,
      },
    ]);
  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "totalDaysTopBar",
      {
        totalDaysTopBar: totalDaysTopBarBrowserAdapter,
      },
    ]);
  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "ejectToggles",
      {
        ejectToggles: ejectToggleBrowserAdapter,
      },
    ]);
  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "supplyToggles",
      {
        supplyToggles: supplyToggleBrowserAdapter,
      },
    ]);
  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "craftToggles",
      {
        craftToggles: craftToggleBrowserAdapter,
      },
    ]);
  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "arpaToggles",
      {
        arpaToggles: arpaToggleBrowserAdapter,
      },
    ]);
  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "buildingToggles",
      {
        buildingToggles: buildingToggleBrowserAdapter,
      },
    ]);
  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "resourceToggle",
      {
        resourceToggles: resourceToggleBrowserAdapter,
      },
      "resourceToggles",
    ]);
  if (TEST_SURFACE_ENABLED)
    registerTestContext(() => [
      "mechInfo",
      {
        mechInfo: mechInfoBrowserAdapter,
      },
    ]);

  const settingsTransferActions = {
    updateStandAloneSettings,
    updateStateFromSettings,
    updateSettingsFromState,
    removeScriptSettings,
    removeMechInfo,
    removeStorageToggles,
    removeMarketToggles,
    removeArpaToggles,
    removeCraftToggles,
    removeBuildingToggles,
    removeEjectToggles,
    removeSupplyToggles,
    updateUI,
    buildFilterRegExp,
  };

  ({ importSettings, exportSettings } = createSettingsTransferControl({
    getSettingsRaw: () => settingsRaw,
    setSettingsRaw: (value) => {
      settingsRaw = value;
    },
    getJQuery: () => $,
    getGameLog: () => GameLog,
    getActions: () =>
      getTestContext("settingsTransfer")?.actions ?? settingsTransferActions,
    confirmImport: (message) => runtimeEnvironment.confirm(message),
    logToConsole: (message) => runtimeEnvironment.log(message),
  }));

  poly = createGameCompatibilityControl({
    getGame: () => game,
    getBuildings: () => buildings,
    getTraitVal: () => traitVal,
    getHaveTech: () => haveTech,
    getGovernor: () => getGovernor(),
    storageControls,
    normalizeProperties,
    cloneIntoPage: (value, options) =>
      userscriptEnvironment.cloneIntoPage(value, options),
    getDate: () => runtimeEnvironment.createDate(),
  });

  const registerRuntimeSupportSurface = () => {
    if (TEST_SURFACE_ENABLED)
      registerRuntimeSupportTestSurface?.(testSurface, {
        parts: testParts,
        contexts: testContexts,
        finalInlineUiBoundaries: {
          updateActiveTargetsUI,
          buildActiveTargetsUI,
          removeActiveTargetsUI,
          buildBuildPlannerUI,
          removeBuildPlannerUI,
          createMechInfo,
          removeMechInfo,
          createMarketToggles,
          removeMarketToggles,
          createStorageToggles,
          removeStorageToggles,
        },
        sorterHelper,
        gameRates: {
          ticksPerSecond,
          getHealingRate,
          getFoodConsume,
          getGrowthRate,
          getResourcesPerClick,
        },
        getCostConflict,
        numberFormatting: {
          getRealNumber,
          getNumberString,
          getNiceNumber,
        },
        runtimeQueries: { getGovernor, haveTask, haveTech, isEarlyGame },
        raceProfile: { isHungryRace, isDemonRace, isLumberRace, getOccCosts },
        foreignGovernment: { getGovName, getGovPower },
        fastEvaluator: { fastEval, cacheSize: fastEvalCacheSize },
        propertyHelpers: { normalizeProperties, addProps },
        browserRuntime: {
          callVueMethod,
          getMainVue,
          getVueById,
          getVueElement,
          resolveVueMethod,
          triggerFileDownload,
        },
        traitVal,
        settingsTransfer: { importSettings, exportSettings },
        gameCompatibility: poly,
        setters: {
          finalInlineUiBoundaries(context) {
            if ("settingsRaw" in context) settingsRaw = context.settingsRaw;
            if ("state" in context) state = context.state;
            if ("game" in context) game = context.game;
            if ("resources" in context) resources = context.resources;
            if ("MarketManager" in context)
              MarketManager = context.MarketManager;
            if ("StorageManager" in context)
              StorageManager = context.StorageManager;
            if ("MechManager" in context) MechManager = context.MechManager;
          },
          gameRates(context) {
            settings = context.settings;
            game = context.game;
            buildings = context.buildings;
            state = context.state;
            resources = context.resources;
            jobs = context.jobs;
            traitVal = context.traitVal;
          },
          costConflict(context) {
            state = context.state;
            resources = context.resources;
          },
          runtimeQueries(context) {
            game = context.game;
          },
          raceProfile(context) {
            game = context.game;
            traitVal = context.traitVal;
          },
          foreignGovernment(context) {
            game = context.game;
            poly = context.poly;
          },
          fastEvaluator(context) {
            if ("settings" in context) settings = context.settings;
            if ("state" in context) state = context.state;
          },
          propertyHelpers(context) {
            settings = context.settings;
          },
          browserRuntime(context) {
            win = context.win;
          },
          traitVal(context) {
            game = context.game;
          },
          settingsTransfer(context) {
            settingsRaw = context.settingsRaw;
            GameLog = context.GameLog;
            setTestContext("settingsTransfer", context);
          },
        },
      });
  };

  $().ready(mainAutoEvolveScript);
  registerRuntimeSupportSurface();
  return testSurface?.finish() ?? {};
}
