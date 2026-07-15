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
} from "./config.js";
import { cartesian, k_combinations } from "./utils/collections.js";
import { Fibonacci, average } from "./utils/math.js";
import { createPropertyHelpers } from "./utils/properties.ts";
import { createNumberFormatting } from "./formatting/numbers.ts";
import { createSettingsState } from "./settings/state.ts";
import { createResetSettings } from "./settings/reset-settings.ts";
import { createQueuedSettings } from "./settings/queued-settings.ts";
import { createSettingsTransfer } from "./settings/transfer.ts";
import { createRuntimeQueries } from "./game/runtime-queries.ts";
import { createRaceProfile } from "./game/race-profile.ts";
import { createForeignGovernment } from "./game/foreign-government.ts";
import { createGalaxyIntelligence } from "./game/galaxy-intelligence.ts";
import { createPowerSupport } from "./game/power-support.ts";
import { createGameRates } from "./game/rates.ts";
import { createPlanetGeneration } from "./game/planet-generation.ts";
import { createScriptDataLifecycle } from "./game/script-data.ts";
import { createCustomRaceModel } from "./game/custom-race-model.ts";
import { createTraitValue } from "./game/trait-value.ts";
import { createCraftingCosts } from "./game/crafting-costs.ts";
import { createEntityClasses } from "./game/entities.ts";
import { createGameCompatibility } from "./game/compatibility.ts";
import { createEntityCatalogs } from "./game/entity-catalogs.ts";
import { createCostConflicts } from "./planning/cost-conflicts.ts";
import { createPlannerAnalysis } from "./planning/planner-analysis.ts";
import { createBuildPlanner } from "./planning/build-planner.ts";
import { createStorageExpansion } from "./planning/storage-expansion.ts";
import { createStorageRequirements } from "./planning/storage-requirements.ts";
import { createDemandPrioritization } from "./planning/demand-prioritization.ts";
import { createPriorityTargets } from "./planning/priority-targets.ts";
import { createEvolutionResult } from "./policies/evolution-result.ts";
import { createQueueItems } from "./planning/queue-items.ts";
import { createTargetTiming } from "./planning/target-timing.ts";
import { createResourceWeighting } from "./planning/resource-weighting.ts";
import { createGameActionVerification } from "./validation/game-actions.ts";
import { createStateLogLifecycle } from "./observability/state-log.ts";
import { createPrestigeLog } from "./observability/prestige-log.ts";
import { createLogFilter } from "./observability/log-filter.ts";
import { createBrowserRuntime } from "./browser/runtime.ts";
import { createMechStats } from "./ui/mech-stats.ts";
import { createSortHelper } from "./ui/sort-helper.ts";
import { createTabRefresh } from "./ui/tab-refresh.ts";
import { createSoulGemRateDisplay } from "./ui/soul-gem-rate.ts";
import { createPreviousGameStats } from "./ui/previous-game-stats.ts";
import { createRuntimeAdapters } from "./ui/runtime-adapters.ts";
import { createAutomationContainer } from "./ui/automation-container.ts";
import { createUIRefresh } from "./ui/ui-refresh.ts";
import { createStateLogSettings } from "./ui/state-log-settings.ts";
import { createInterfaceSettings } from "./ui/interface-settings.ts";
import { createTickOrchestration } from "./automation/tick.ts";
import { createStateUpdate } from "./automation/state-update.ts";
import { createRunGuards } from "./policies/run-guards.ts";
import { createPrestigeEligibility } from "./policies/prestige-eligibility.ts";
import { createTechConflicts } from "./policies/tech-conflicts.ts";
import { createBuildingWeightingPolicy } from "./policies/building-weighting.ts";
import { createTradeRoutes } from "./planning/trade-routes.ts";
import { createAutoHell } from "./automation/combat/hell.ts";
import { createAutoGovernment } from "./automation/civic/government.ts";
import { createAutoBattle } from "./automation/combat/battle.ts";
import { createAutoTax } from "./automation/civic/tax.ts";
import { createAutoSmelter } from "./automation/economy/smelter.ts";
import { createAutoAlchemy } from "./automation/economy/alchemy.ts";
import { createAutoPylon } from "./automation/economy/pylon.ts";
import { createAutoResourceRatios } from "./automation/economy/resource-ratios.ts";
import { createAutoFactory } from "./automation/economy/factory.ts";
import { createAutoMiningDroid } from "./automation/economy/mining-droid.ts";
import { createAutoGraphenePlant } from "./automation/economy/graphene.ts";
import { createAutoShapeshift } from "./automation/traits/shapeshift.ts";
import { createAutoWish } from "./automation/traits/wish.ts";
import { createAutoGenetics } from "./automation/traits/genetics.ts";
import { createAutoMerc } from "./automation/combat/mercenary.ts";
import { createAutoPsychic } from "./automation/traits/psychic.ts";
import { createAutoOcularPowers } from "./automation/traits/ocular.ts";
import { createAutoMinorTrait } from "./automation/traits/minor-trait.ts";
import { createAutoTrigger } from "./automation/progression/trigger.ts";
import { createAutoConsume } from "./automation/economy/consume.ts";
import { createAutoReplicator } from "./automation/economy/replicator.ts";
import { createAutoMarket } from "./automation/economy/market.ts";
import { createAutoGalaxyMarket } from "./automation/economy/galaxy-market.ts";
import { createAutoGatherResources } from "./automation/economy/gather-resources.ts";
import { createAutoEvolution } from "./automation/progression/evolution.ts";
import { createAutoUniverseSelection } from "./automation/progression/universe-selection.ts";
import { createAutoCraft } from "./automation/economy/craft.ts";
import { createAutoSpy } from "./automation/combat/spy.ts";
import { createAutoPrestige } from "./automation/progression/prestige.ts";
import { createAutoPlanetSelection } from "./automation/progression/planet-selection.ts";
import { createAutoJobs } from "./automation/civic/jobs.ts";
import { createAutoBuild } from "./automation/progression/build.ts";
import { createAutoResearch } from "./automation/progression/research.ts";
import { createAutoMutateTrait } from "./automation/traits/mutation.ts";
import { createAutoPower } from "./automation/economy/power.ts";
import { createAutoStorage } from "./automation/economy/storage.ts";
import { createAutoFleetOuter } from "./automation/combat/fleet-outer.ts";
import { createAutoFleet } from "./automation/combat/fleet.ts";
import { createAutoMech } from "./automation/combat/mech.ts";
import { createProductionSettings } from "./ui/production-settings.ts";
import { createTraitSettings } from "./ui/trait-settings.ts";
import { createGeneralSettings } from "./ui/general-settings.ts";
import { createAchievementGuardSettings } from "./ui/achievement-guard-settings.ts";
import { createChallengeHelperSettings } from "./ui/challenge-helper-settings.ts";
import { createPrestigeSettings } from "./ui/prestige-settings.ts";
import { createGovernmentSettings } from "./ui/government-settings.ts";
import { createEvolutionSettings } from "./ui/evolution-settings.ts";
import { createPlanetSettings } from "./ui/planet-settings.ts";
import { createTriggerSettings } from "./ui/trigger-settings.ts";
import { createResearchSettings } from "./ui/research-settings.ts";
import { createWarSettings } from "./ui/war-settings.ts";
import { createHellSettings } from "./ui/hell-settings.ts";
import { createFleetSettings } from "./ui/fleet-settings.ts";
import { createMechSettings } from "./ui/mech-settings.ts";
import { createEjectorSettings } from "./ui/ejector-settings.ts";
import { createMarketSettings } from "./ui/market-settings.ts";
import { createStorageSettings } from "./ui/storage-settings.ts";
import { createMagicSettings } from "./ui/magic-settings.ts";
import { createJobSettings } from "./ui/job-settings.ts";
import { createWeightingSettings } from "./ui/weighting-settings.ts";
import { createBuildingSettings } from "./ui/building-settings.ts";
import { createProjectSettings } from "./ui/project-settings.ts";
import { createLoggingSettings } from "./ui/logging-settings.ts";
import { createOptionsModalUI } from "./ui/options-modal.ts";
import { createPrestigeTopBar } from "./ui/prestige-top-bar.ts";
import { createTotalDaysTopBar } from "./ui/total-days-top-bar.ts";
import { createArpaToggleUI } from "./ui/arpa-toggles.ts";
import { createCraftToggleUI } from "./ui/craft-toggles.ts";
import { createBuildingToggleUI } from "./ui/building-toggles.ts";
import { createEjectToggleUI } from "./ui/eject-toggles.ts";
import { createSupplyToggleUI } from "./ui/supply-toggles.ts";
import { createQueuePanels } from "./ui/queue-panels.ts";
import { createMechInfoUI } from "./ui/mech-info.ts";
import { createResourceToggleUI } from "./ui/resource-toggles.ts";
import { createTooltipUI } from "./ui/tooltips.ts";
import { createCustomRaceUI } from "./ui/custom-race-ui.ts";
import { createSettingsShell } from "./ui/settings-shell.ts";
import { createSettingsControls } from "./ui/settings-controls.ts";
import { createOverrideCatalog } from "./settings/override-catalog.ts";
import { createScriptRuntimeUI } from "./ui/script-runtime.ts";
import { createDependencyResolver } from "./ui/dependencies.ts";

(function ($) {
  "use strict";
  const { getRealNumber, getNumberString, getNiceNumber } =
    createNumberFormatting({ numberSuffix });
  var settingsRaw = JSON.parse(localStorage.getItem("settings")) ?? {};
  var settings = {};
  var game = null;
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
  } = createResetSettings({
    dependencies: {
      AlchemyManager: () => AlchemyManager,
      applySettings: () => applySettings,
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
      settingsRaw: () => settingsRaw,
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
  } = createSettingsShell({
    getContext: () => ({
      $,
      document,
      settingsRaw,
      settings,
      game,
      buildPrestigeSettings,
      buildGeneralSettings,
      buildInterfaceSettings,
      buildStateLogSettings,
      buildAchievementGuardSettings,
      buildChallengeHelperSettings,
      buildGovernmentSettings,
      buildEvolutionSettings,
      buildPlanetSettings,
      buildTraitSettings,
      buildTriggerSettings,
      buildResearchSettings,
      buildWarSettings,
      buildHellSettings,
      buildMechSettings,
      buildFleetSettings,
      buildEjectorSettings,
      buildMarketSettings,
      buildStorageSettings,
      buildMagicSettings,
      buildProductionSettings,
      buildJobSettings,
      buildBuildingSettings,
      buildWeightingSettings,
      buildProjectSettings,
      buildLoggingSettings,
      filterBuildingSettingsTable,
      updateSettingsFromState,
      importSettings,
      exportSettings,
      triggerFileDownload,
      confirm: (...args) => confirm(...args),
    }),
  });

  const {
    evaluateCheck: _,
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
    buildSelectOptions,
    addSettingsSelect,
    addSettingsList,
    addInputCallbacks,
    addTableInput,
    addToggleCallbacks,
    addTableToggle,
    buildTableLabel,
    resetCheckbox,
  } = createSettingsControls({
    getContext: () => ({
      $,
      settingsRaw,
      settings,
      techIds,
      win,
      checkCompare,
      checkCustom,
      checkTypes,
      overrideKey,
      getRealNumber,
      openOptionsModal,
      sorterHelper,
      updateSettingsFromState,
    }),
  });
  const { createMechInfo, removeMechInfo } = createMechInfoUI({
    getDocument: () => document,
    getJQuery: () => $,
    getGame: () => game,
    getMechManager: () => MechManager,
    getVueById: (id) => getVueById(id),
    getNiceNumber: (value) => getNiceNumber(value),
  });
  const {
    createMarketToggles,
    removeMarketToggles,
    createStorageToggles,
    removeStorageToggles,
  } = createResourceToggleUI({
    getJQuery: () => $,
    getGame: () => game,
    getSettingsRaw: () => settingsRaw,
    getResources: () => resources,
    getMarketManager: () => MarketManager,
    getStorageManager: () => StorageManager,
    addToggleCallbacks: (node, settingKey) =>
      addToggleCallbacks(node, settingKey),
  });
  const {
    buildProductionSettings,
    updateProductionSettingsContent,
    updateProductionTableSmelter,
    updateProductionTableFoundry,
    updateProductionTableFactory,
    updateProductionTableMiningDrone,
    updateProductionTableReplicator,
  } = createProductionSettings({
    getSettingsRaw: () => settingsRaw,
    getDocument: () => document,
    getJQuery: () => $,
    getResources: () => resources,
    getCraftablesList: () => craftablesList,
    getSmelterManager: () => SmelterManager,
    getFactoryManager: () => FactoryManager,
    getDroidManager: () => DroidManager,
    getReplicatorManager: () => ReplicatorManager,
    consumptionBalanceTarget: CONSUMPTION_BALANCE_TARGET,
    resetProductionSettings,
    updateSettingsFromState: (...args) => updateSettingsFromState(...args),
    resetCheckbox,
    removeCraftToggles: (...args) => removeCraftToggles(...args),
    buildSettingsSection,
    addSettingsNumber,
    addSettingsToggle,
    addSettingsSelect,
    addStandardHeading,
    addTableToggle,
    addTableInput,
    buildTableLabel,
    getSorterHelper: () => sorterHelper,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      productionSettings: {
        buildProductionSettings,
        updateProductionSettingsContent,
        updateProductionTableSmelter,
        updateProductionTableFoundry,
        updateProductionTableFactory,
        updateProductionTableMiningDrone,
        updateProductionTableReplicator,
      },
      setProductionSettingsTestContext(context) {
        settingsRaw = context.settingsRaw;
        resources = context.resources;
        craftablesList = context.craftablesList;
        SmelterManager = context.SmelterManager;
        FactoryManager = context.FactoryManager;
        DroidManager = context.DroidManager;
        ReplicatorManager = context.ReplicatorManager;
      },
    });
  }
  const storageBoundaryOverrides = {};
  const getStorageBoundaryDependency = createDependencyResolver(
    storageBoundaryOverrides,
    {
      $: () => $,
      StorageManager: () => StorageManager,
      addSettingsToggle: () => addSettingsToggle,
      addTableInput: () => addTableInput,
      addTableToggle: () => addTableToggle,
      buildSettingsSection: () => buildSettingsSection,
      buildTableLabel: () => buildTableLabel,
      document: () => document,
      removeStorageToggles: () => removeStorageToggles,
      resetCheckbox: () => resetCheckbox,
      resetStorageSettings: () => resetStorageSettings,
      settingsRaw: () => settingsRaw,
      sorterHelper: () => sorterHelper,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const storageBoundary = createStorageSettings({
    getDependency: getStorageBoundaryDependency,
    getOverride: (name) => storageBoundaryOverrides[name],
  });
  const { buildStorageSettings, updateStorageSettingsContent } =
    storageBoundary;

  const magicBoundaryOverrides = {};
  const getMagicBoundaryDependency = createDependencyResolver(
    magicBoundaryOverrides,
    {
      $: () => $,
      AlchemyManager: () => AlchemyManager,
      RitualManager: () => RitualManager,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsToggle: () => addSettingsToggle,
      addStandardHeading: () => addStandardHeading,
      addTableInput: () => addTableInput,
      addTableToggle: () => addTableToggle,
      buildSettingsSection: () => buildSettingsSection,
      buildTableLabel: () => buildTableLabel,
      document: () => document,
      game: () => game,
      resetCheckbox: () => resetCheckbox,
      resetMagicSettings: () => resetMagicSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const magicBoundary = createMagicSettings({
    getDependency: getMagicBoundaryDependency,
    getOverride: (name) => magicBoundaryOverrides[name],
  });
  const {
    buildMagicSettings,
    updateMagicSettingsContent,
    updateMagicAlchemy,
    updateMagicPylon,
  } = magicBoundary;

  const jobsBoundaryOverrides = {};
  const getJobsBoundaryDependency = createDependencyResolver(
    jobsBoundaryOverrides,
    {
      $: () => $,
      BasicJob: () => BasicJob,
      CraftingJob: () => CraftingJob,
      JobManager: () => JobManager,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsToggle: () => addSettingsToggle,
      addTableInput: () => addTableInput,
      addTableToggle: () => addTableToggle,
      addToggleCallbacks: () => addToggleCallbacks,
      buildSettingsSection: () => buildSettingsSection,
      confirm: () => confirm,
      document: () => document,
      jobs: () => jobs,
      resetCheckbox: () => resetCheckbox,
      resetJobSettings: () => resetJobSettings,
      settingsRaw: () => settingsRaw,
      sorterHelper: () => sorterHelper,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const jobsBoundary = createJobSettings({
    getDependency: getJobsBoundaryDependency,
    getOverride: (name) => jobsBoundaryOverrides[name],
  });
  const {
    buildJobSettings,
    updateJobSettingsContent,
    buildJobSettingsToggle,
    buildJobSettingsInput,
  } = jobsBoundary;

  const weightingBoundaryOverrides = {};
  const getWeightingBoundaryDependency = createDependencyResolver(
    weightingBoundaryOverrides,
    {
      $: () => $,
      addSettingsToggle: () => addSettingsToggle,
      addTableInput: () => addTableInput,
      buildSettingsSection: () => buildSettingsSection,
      document: () => document,
      resetWeightingSettings: () => resetWeightingSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const weightingBoundary = createWeightingSettings({
    getDependency: getWeightingBoundaryDependency,
    getOverride: (name) => weightingBoundaryOverrides[name],
  });
  const {
    buildWeightingSettings,
    updateWeightingSettingsContent,
    addWeightingRule,
  } = weightingBoundary;

  const buildingBoundaryOverrides = {};
  const getBuildingBoundaryDependency = createDependencyResolver(
    buildingBoundaryOverrides,
    {
      $: () => $,
      BuildingManager: () => BuildingManager,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsSelect: () => addSettingsSelect,
      addSettingsToggle: () => addSettingsToggle,
      addTableInput: () => addTableInput,
      addTableToggle: () => addTableToggle,
      addToggleCallbacks: () => addToggleCallbacks,
      buildSettingsSection: () => buildSettingsSection,
      buildTableLabel: () => buildTableLabel,
      buildingIds: () => buildingIds,
      checkCompare: () => checkCompare,
      confirm: () => confirm,
      document: () => document,
      getRealNumber: () => getRealNumber,
      initBuildingState: () => initBuildingState,
      linkedBuildings: () => linkedBuildings,
      overrideKey: () => overrideKey,
      removeBuildingToggles: () => removeBuildingToggles,
      resetBuildingSettings: () => resetBuildingSettings,
      resetCheckbox: () => resetCheckbox,
      resources: () => resources,
      settingsRaw: () => settingsRaw,
      sorterHelper: () => sorterHelper,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const buildingBoundary = createBuildingSettings({
    getDependency: getBuildingBoundaryDependency,
    getOverride: (name) => buildingBoundaryOverrides[name],
  });
  const {
    buildBuildingSettings,
    updateBuildingSettingsContent,
    filterBuildingSettingsTable,
    buildAllBuildingEnabledSettingsToggle,
    buildBuildingStateSettingsToggle,
    buildAllBuildingStateSettingsToggle,
  } = buildingBoundary;

  const projectBoundaryOverrides = {};
  const getProjectBoundaryDependency = createDependencyResolver(
    projectBoundaryOverrides,
    {
      $: () => $,
      ProjectManager: () => ProjectManager,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsToggle: () => addSettingsToggle,
      addTableInput: () => addTableInput,
      addTableToggle: () => addTableToggle,
      buildSettingsSection: () => buildSettingsSection,
      buildTableLabel: () => buildTableLabel,
      document: () => document,
      resetCheckbox: () => resetCheckbox,
      resetProjectSettings: () => resetProjectSettings,
      settingsRaw: () => settingsRaw,
      sorterHelper: () => sorterHelper,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const projectBoundary = createProjectSettings({
    getDependency: getProjectBoundaryDependency,
    getOverride: (name) => projectBoundaryOverrides[name],
  });
  const { buildProjectSettings, updateProjectSettingsContent } =
    projectBoundary;

  const loggingBoundaryOverrides = {};
  const getLoggingBoundaryDependency = createDependencyResolver(
    loggingBoundaryOverrides,
    {
      $: () => $,
      GameLog: () => GameLog,
      addSettingsHeader1: () => addSettingsHeader1,
      addSettingsString: () => addSettingsString,
      addSettingsToggle: () => addSettingsToggle,
      buildFilterRegExp: () => buildFilterRegExp,
      buildSettingsSection2: () => buildSettingsSection2,
      document: () => document,
      game: () => game,
      resetLoggingSettings: () => resetLoggingSettings,
      settingsRaw: () => settingsRaw,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const loggingBoundary = createLoggingSettings({
    getDependency: getLoggingBoundaryDependency,
    getOverride: (name) => loggingBoundaryOverrides[name],
  });
  const { buildLoggingSettings, updateLoggingSettingsContent } =
    loggingBoundary;

  const optionsBoundaryOverrides = {};
  const getOptionsBoundaryDependency = createDependencyResolver(
    optionsBoundaryOverrides,
    {
      $: () => $,
      buildFleetSettings: () => buildFleetSettings,
      buildGovernmentSettings: () => buildGovernmentSettings,
      buildHellSettings: () => buildHellSettings,
      buildWarSettings: () => buildWarSettings,
      document: () => document,
      openOverrideModal: () => openOverrideModal,
      settingsRaw: () => settingsRaw,
      updateSettingsFromState: () => updateSettingsFromState,
      window: () => window,
    },
  );
  const optionsBoundary = createOptionsModalUI({
    getDependency: getOptionsBoundaryDependency,
    getOverride: (name) => optionsBoundaryOverrides[name],
  });
  const {
    createSettingToggle,
    updateOptionsUI,
    addOptionUI,
    openOptionsModal,
    createOptionsModal,
  } = optionsBoundary;

  const prestigeTopBarBoundaryOverrides = {};
  const getPrestigeTopBarBoundaryDependency = createDependencyResolver(
    prestigeTopBarBoundaryOverrides,
    {
      addOptionUI: () => addOptionUI,
      buildPrestigeSettings: () => buildPrestigeSettings,
      document: () => document,
      prestigeTypes: () => prestigeTypes,
      settings: () => settings,
    },
  );
  const prestigeTopBarBoundary = createPrestigeTopBar({
    getDependency: getPrestigeTopBarBoundaryDependency,
    getOverride: (name) => prestigeTopBarBoundaryOverrides[name],
  });
  const { updatePrestigeInTopBar, removePrestigeFromTopBar } =
    prestigeTopBarBoundary;

  const totalDaysTopBarBoundaryOverrides = {};
  const getTotalDaysTopBarBoundaryDependency = createDependencyResolver(
    totalDaysTopBarBoundaryOverrides,
    {
      $: () => $,
      document: () => document,
      game: () => game,
      settings: () => settings,
    },
  );
  const totalDaysTopBarBoundary = createTotalDaysTopBar({
    getDependency: getTotalDaysTopBarBoundaryDependency,
    getOverride: (name) => totalDaysTopBarBoundaryOverrides[name],
  });
  const {
    updateTotalDaysInTopBar,
    addTotalDaysToTopBar,
    removeTotalDaysFromTopBar,
  } = totalDaysTopBarBoundary;

  const arpaTogglesBoundaryOverrides = {};
  const getArpaTogglesBoundaryDependency = createDependencyResolver(
    arpaTogglesBoundaryOverrides,
    {
      $: () => $,
      ProjectManager: () => ProjectManager,
      addToggleCallbacks: () => addToggleCallbacks,
      settingsRaw: () => settingsRaw,
    },
  );
  const arpaTogglesBoundary = createArpaToggleUI({
    getDependency: getArpaTogglesBoundaryDependency,
    getOverride: (name) => arpaTogglesBoundaryOverrides[name],
  });
  const { createArpaToggles, removeArpaToggles } = arpaTogglesBoundary;

  const craftTogglesBoundaryOverrides = {};
  const getCraftTogglesBoundaryDependency = createDependencyResolver(
    craftTogglesBoundaryOverrides,
    {
      $: () => $,
      addToggleCallbacks: () => addToggleCallbacks,
      craftablesList: () => craftablesList,
      settingsRaw: () => settingsRaw,
    },
  );
  const craftTogglesBoundary = createCraftToggleUI({
    getDependency: getCraftTogglesBoundaryDependency,
    getOverride: (name) => craftTogglesBoundaryOverrides[name],
  });
  const { createCraftToggles, removeCraftToggles } = craftTogglesBoundary;

  const buildingTogglesBoundaryOverrides = {};
  const getBuildingTogglesBoundaryDependency = createDependencyResolver(
    buildingTogglesBoundaryOverrides,
    {
      $: () => $,
      BuildingManager: () => BuildingManager,
      addToggleCallbacks: () => addToggleCallbacks,
      settings: () => settings,
      settingsRaw: () => settingsRaw,
      state: () => state,
    },
  );
  const buildingTogglesBoundary = createBuildingToggleUI({
    getDependency: getBuildingTogglesBoundaryDependency,
    getOverride: (name) => buildingTogglesBoundaryOverrides[name],
  });
  const { createBuildingToggles, removeBuildingToggles } =
    buildingTogglesBoundary;

  const ejectTogglesBoundaryOverrides = {};
  const getEjectTogglesBoundaryDependency = createDependencyResolver(
    ejectTogglesBoundaryOverrides,
    {
      $: () => $,
      EjectManager: () => EjectManager,
      addToggleCallbacks: () => addToggleCallbacks,
      settingsRaw: () => settingsRaw,
    },
  );
  const ejectTogglesBoundary = createEjectToggleUI({
    getDependency: getEjectTogglesBoundaryDependency,
    getOverride: (name) => ejectTogglesBoundaryOverrides[name],
  });
  const { createEjectToggles, removeEjectToggles } = ejectTogglesBoundary;

  const supplyTogglesBoundaryOverrides = {};
  const getSupplyTogglesBoundaryDependency = createDependencyResolver(
    supplyTogglesBoundaryOverrides,
    {
      $: () => $,
      SupplyManager: () => SupplyManager,
      addToggleCallbacks: () => addToggleCallbacks,
      settingsRaw: () => settingsRaw,
    },
  );
  const supplyTogglesBoundary = createSupplyToggleUI({
    getDependency: getSupplyTogglesBoundaryDependency,
    getOverride: (name) => supplyTogglesBoundaryOverrides[name],
  });
  const { createSupplyToggles, removeSupplyToggles } = supplyTogglesBoundary;

  const generalSettingsOverrides = {};
  const getGeneralSettingsDependency = createDependencyResolver(
    generalSettingsOverrides,
    {
      $: () => $,
      addSettingsHeader1: () => addSettingsHeader1,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsSelect: () => addSettingsSelect,
      addSettingsString: () => addSettingsString,
      addSettingsToggle: () => addSettingsToggle,
      buildSettingsSection: () => buildSettingsSection,
      document: () => document,
      resetCheckbox: () => resetCheckbox,
      resetGeneralSettings: () => resetGeneralSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const generalSettings = createGeneralSettings({
    getDependency: getGeneralSettingsDependency,
    getOverride: (name) => generalSettingsOverrides[name],
  });
  const { buildGeneralSettings, updateGeneralSettingsContent } =
    generalSettings;

  const achievementGuardSettingsOverrides = {};
  const getAchievementGuardSettingsDependency = createDependencyResolver(
    achievementGuardSettingsOverrides,
    {
      $: () => $,
      addSettingsToggle: () => addSettingsToggle,
      buildSettingsSection: () => buildSettingsSection,
      document: () => document,
      resetAchievementGuardSettings: () => resetAchievementGuardSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const achievementGuardSettings = createAchievementGuardSettings({
    getDependency: getAchievementGuardSettingsDependency,
    getOverride: (name) => achievementGuardSettingsOverrides[name],
  });
  const {
    buildAchievementGuardSettings,
    updateAchievementGuardSettingsContent,
  } = achievementGuardSettings;

  const challengeHelperSettingsOverrides = {};
  const getChallengeHelperSettingsDependency = createDependencyResolver(
    challengeHelperSettingsOverrides,
    {
      $: () => $,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsToggle: () => addSettingsToggle,
      buildSettingsSection: () => buildSettingsSection,
      document: () => document,
      resetChallengeHelperSettings: () => resetChallengeHelperSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const challengeHelperSettings = createChallengeHelperSettings({
    getDependency: getChallengeHelperSettingsDependency,
    getOverride: (name) => challengeHelperSettingsOverrides[name],
  });
  const { buildChallengeHelperSettings, updateChallengeHelperSettingsContent } =
    challengeHelperSettings;

  const prestigeSettingsOverrides = {};
  const getPrestigeSettingsDependency = createDependencyResolver(
    prestigeSettingsOverrides,
    {
      $: () => $,
      addSettingsHeader1: () => addSettingsHeader1,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsSelect: () => addSettingsSelect,
      addSettingsToggle: () => addSettingsToggle,
      buildCustomRacePresetEditor: () => buildCustomRacePresetEditor,
      buildSettingsSection2: () => buildSettingsSection2,
      buildings: () => buildings,
      confirm: () => confirm,
      document: () => document,
      game: () => game,
      haveTech: () => haveTech,
      isApocalypsePrestigeAvailable: () => isApocalypsePrestigeAvailable,
      isAscensionPrestigeAvailable: () => isAscensionPrestigeAvailable,
      isBioseederPrestigeAvailable: () => isBioseederPrestigeAvailable,
      isCataclysmPrestigeAvailable: () => isCataclysmPrestigeAvailable,
      isDemonicPrestigeAvailable: () => isDemonicPrestigeAvailable,
      isPrestigeAllowed: () => isPrestigeAllowed,
      isWhiteholePrestigeAvailable: () => isWhiteholePrestigeAvailable,
      isWitchAscensionPrestigeAvailable: () =>
        isWitchAscensionPrestigeAvailable,
      openOptionsModal: () => openOptionsModal,
      openOverrideModal: () => openOverrideModal,
      prestigeOptions: () => prestigeOptions,
      resetPrestigeSettings: () => resetPrestigeSettings,
      settingsRaw: () => settingsRaw,
      state: () => state,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const prestigeSettings = createPrestigeSettings({
    getDependency: getPrestigeSettingsDependency,
    getOverride: (name) => prestigeSettingsOverrides[name],
  });
  const { buildPrestigeSettings, updatePrestigeSettingsContent } =
    prestigeSettings;

  const governmentSettingsOverrides = {};
  const getGovernmentSettingsDependency = createDependencyResolver(
    governmentSettingsOverrides,
    {
      $: () => $,
      GovernmentManager: () => GovernmentManager,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsSelect: () => addSettingsSelect,
      buildSettingsSection2: () => buildSettingsSection2,
      document: () => document,
      game: () => game,
      governors: () => governors,
      resetCheckbox: () => resetCheckbox,
      resetGovernmentSettings: () => resetGovernmentSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const governmentSettings = createGovernmentSettings({
    getDependency: getGovernmentSettingsDependency,
    getOverride: (name) => governmentSettingsOverrides[name],
  });
  const { buildGovernmentSettings, updateGovernmentSettingsContent } =
    governmentSettings;

  const evolutionSettingsOverrides = {};
  const getEvolutionSettingsDependency = createDependencyResolver(
    evolutionSettingsOverrides,
    {
      $: () => $,
      addSettingsSelect: () => addSettingsSelect,
      addSettingsToggle: () => addSettingsToggle,
      addStandardHeading: () => addStandardHeading,
      buildSettingsSection: () => buildSettingsSection,
      challenges: () => challenges,
      document: () => document,
      evolutionSettingsToStore: () => evolutionSettingsToStore,
      game: () => game,
      getStarLevel: () => getStarLevel,
      prestigeOptions: () => prestigeOptions,
      prestigeTypes: () => prestigeTypes,
      races: () => races,
      resetCheckbox: () => resetCheckbox,
      resetEvolutionSettings: () => resetEvolutionSettings,
      settings: () => settings,
      settingsRaw: () => settingsRaw,
      sorterHelper: () => sorterHelper,
      state: () => state,
      universes: () => universes,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const evolutionSettings = createEvolutionSettings({
    getDependency: getEvolutionSettingsDependency,
    getOverride: (name) => evolutionSettingsOverrides[name],
  });
  const {
    buildEvolutionSettings,
    updateRaceWarning,
    updateEvolutionSettingsContent,
    buildEvolutionQueueItem,
    addEvolutionSetting,
  } = evolutionSettings;

  const planetSettingsOverrides = {};
  const getPlanetSettingsDependency = createDependencyResolver(
    planetSettingsOverrides,
    {
      $: () => $,
      addTableInput: () => addTableInput,
      biomeList: () => biomeList,
      buildSettingsSection: () => buildSettingsSection,
      buildTableLabel: () => buildTableLabel,
      document: () => document,
      extraList: () => extraList,
      game: () => game,
      resetPlanetSettings: () => resetPlanetSettings,
      traitList: () => traitList,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const planetSettings = createPlanetSettings({
    getDependency: getPlanetSettingsDependency,
    getOverride: (name) => planetSettingsOverrides[name],
  });
  const { buildPlanetSettings, updatePlanetSettingsContent } = planetSettings;

  const triggerSettingsOverrides = {};
  const getTriggerSettingsDependency = createDependencyResolver(
    triggerSettingsOverrides,
    {
      $: () => $,
      TriggerManager: () => TriggerManager,
      argType: () => argType,
      buildInputNode: () => buildInputNode,
      buildSettingsSection: () => buildSettingsSection,
      checkTypes: () => checkTypes,
      document: () => document,
      overrideOnlyChecks: () => overrideOnlyChecks,
      resetCheckbox: () => resetCheckbox,
      resetTriggerSettings: () => resetTriggerSettings,
      retBools: () => retBools,
      sorterHelper: () => sorterHelper,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const triggerSettings = createTriggerSettings({
    getDependency: getTriggerSettingsDependency,
    getOverride: (name) => triggerSettingsOverrides[name],
  });
  const {
    buildTriggerSettings,
    updateTriggerSettingsContent,
    addTriggerSetting,
    buildTriggerRequirementType,
    buildTriggerRequirementId,
    buildTriggerRequirementCount,
    buildTriggerActionType,
    buildTriggerActionId,
    buildTriggerActionCount,
    buildTriggerSettingsColumn,
  } = triggerSettings;

  const researchSettingsOverrides = {};
  const getResearchSettingsDependency = createDependencyResolver(
    researchSettingsOverrides,
    {
      $: () => $,
      addSettingsList: () => addSettingsList,
      addSettingsSelect: () => addSettingsSelect,
      buildSettingsSection: () => buildSettingsSection,
      document: () => document,
      game: () => game,
      resetCheckbox: () => resetCheckbox,
      resetResearchSettings: () => resetResearchSettings,
      techIds: () => techIds,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const researchSettings = createResearchSettings({
    getDependency: getResearchSettingsDependency,
    getOverride: (name) => researchSettingsOverrides[name],
  });
  const { buildResearchSettings, updateResearchSettingsContent } =
    researchSettings;

  const warSettingsOverrides = {};
  const getWarSettingsDependency = createDependencyResolver(
    warSettingsOverrides,
    {
      $: () => $,
      SpyManager: () => SpyManager,
      addSettingsHeader1: () => addSettingsHeader1,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsSelect: () => addSettingsSelect,
      addSettingsToggle: () => addSettingsToggle,
      buildSettingsSection2: () => buildSettingsSection2,
      document: () => document,
      game: () => game,
      resetCheckbox: () => resetCheckbox,
      resetWarSettings: () => resetWarSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const warSettings = createWarSettings({
    getDependency: getWarSettingsDependency,
    getOverride: (name) => warSettingsOverrides[name],
  });
  const { buildWarSettings, updateWarSettingsContent } = warSettings;

  const hellSettingsOverrides = {};
  const getHellSettingsDependency = createDependencyResolver(
    hellSettingsOverrides,
    {
      $: () => $,
      addSettingsHeader1: () => addSettingsHeader1,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsToggle: () => addSettingsToggle,
      buildSettingsSection2: () => buildSettingsSection2,
      document: () => document,
      resetCheckbox: () => resetCheckbox,
      resetHellSettings: () => resetHellSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const hellSettings = createHellSettings({
    getDependency: getHellSettingsDependency,
    getOverride: (name) => hellSettingsOverrides[name],
  });
  const { buildHellSettings, updateHellSettingsContent } = hellSettings;

  const fleetSettingsOverrides = {};
  const getFleetSettingsDependency = createDependencyResolver(
    fleetSettingsOverrides,
    {
      $: () => $,
      FleetManagerOuter: () => FleetManagerOuter,
      addSettingsHeader1: () => addSettingsHeader1,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsSelect: () => addSettingsSelect,
      addSettingsToggle: () => addSettingsToggle,
      addStandardHeading: () => addStandardHeading,
      addTableInput: () => addTableInput,
      buildSettingsSection2: () => buildSettingsSection2,
      buildTableLabel: () => buildTableLabel,
      document: () => document,
      galaxyRegions: () => galaxyRegions,
      game: () => game,
      openOverrideModal: () => openOverrideModal,
      resetCheckbox: () => resetCheckbox,
      resetFleetSettings: () => resetFleetSettings,
      settings: () => settings,
      settingsRaw: () => settingsRaw,
      sorterHelper: () => sorterHelper,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const fleetSettings = createFleetSettings({
    getDependency: getFleetSettingsDependency,
    getOverride: (name) => fleetSettingsOverrides[name],
  });
  const {
    buildFleetSettings,
    updateFleetSettingsContent,
    updateFleetOuter,
    updateFleetAndromeda,
  } = fleetSettings;

  const mechSettingsOverrides = {};
  const getMechSettingsDependency = createDependencyResolver(
    mechSettingsOverrides,
    {
      $: () => $,
      MechManager: () => MechManager,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsSelect: () => addSettingsSelect,
      addSettingsToggle: () => addSettingsToggle,
      addStandardHeading: () => addStandardHeading,
      buildSettingsSection: () => buildSettingsSection,
      calculateMechStats: () => calculateMechStats,
      document: () => document,
      game: () => game,
      removeMechInfo: () => removeMechInfo,
      resetCheckbox: () => resetCheckbox,
      resetMechSettings: () => resetMechSettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const mechSettings = createMechSettings({
    getDependency: getMechSettingsDependency,
    getOverride: (name) => mechSettingsOverrides[name],
  });
  const { buildMechSettings, updateMechSettingsContent } = mechSettings;

  const ejectorSettingsOverrides = {};
  const getEjectorSettingsDependency = createDependencyResolver(
    ejectorSettingsOverrides,
    {
      $: () => $,
      EjectManager: () => EjectManager,
      NaniteManager: () => NaniteManager,
      SupplyManager: () => SupplyManager,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsSelect: () => addSettingsSelect,
      addSettingsToggle: () => addSettingsToggle,
      addTableToggle: () => addTableToggle,
      buildSettingsSection: () => buildSettingsSection,
      buildTableLabel: () => buildTableLabel,
      document: () => document,
      removeEjectToggles: () => removeEjectToggles,
      removeSupplyToggles: () => removeSupplyToggles,
      resetCheckbox: () => resetCheckbox,
      resetEjectorSettings: () => resetEjectorSettings,
      resources: () => resources,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const ejectorSettings = createEjectorSettings({
    getDependency: getEjectorSettingsDependency,
    getOverride: (name) => ejectorSettingsOverrides[name],
  });
  const { buildEjectorSettings, updateEjectorSettingsContent } =
    ejectorSettings;

  const marketSettingsOverrides = {};
  const getMarketSettingsDependency = createDependencyResolver(
    marketSettingsOverrides,
    {
      $: () => $,
      MarketManager: () => MarketManager,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsToggle: () => addSettingsToggle,
      addStandardHeading: () => addStandardHeading,
      addTableInput: () => addTableInput,
      addTableToggle: () => addTableToggle,
      buildSettingsSection: () => buildSettingsSection,
      buildTableLabel: () => buildTableLabel,
      document: () => document,
      poly: () => poly,
      removeMarketToggles: () => removeMarketToggles,
      resetCheckbox: () => resetCheckbox,
      resetMarketSettings: () => resetMarketSettings,
      resources: () => resources,
      settingsRaw: () => settingsRaw,
      sorterHelper: () => sorterHelper,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const marketSettings = createMarketSettings({
    getDependency: getMarketSettingsDependency,
    getOverride: (name) => marketSettingsOverrides[name],
  });
  const { buildMarketSettings, updateMarketSettingsContent } = marketSettings;

  let { traitVal } = createTraitValue({ getGame: () => game });
  const { normalizeProperties, addProps } = createPropertyHelpers({
    getSettings: () => settings,
  });
  let { getCostConflict } = createCostConflicts({
    getState: () => state,
    getResources: () => resources,
    isEmptyObject: (object) => $.isEmptyObject(object),
  });
  const {
    plannerLimitingResource,
    makePlannerStats,
    loadPlannerStats,
    savePlannerStats,
  } = createPlannerAnalysis({
    getGame: () => game,
    getResources: () => resources,
    getState: () => state,
    storage: localStorage,
  });
  const { expandStorage } = createStorageExpansion({
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getStorageManager: () => StorageManager,
    getIsEarlyGame: () => isEarlyGame,
    getIsLumberRace: () => isLumberRace,
  });
  const { requestStorageFor, calculateRequiredStorages } =
    createStorageRequirements({
      getSettings: () => settings,
      getState: () => state,
      getResources: () => resources,
      getBuildings: () => buildings,
      getGame: () => game,
      getBuildingManager: () => BuildingManager,
      getProjectManager: () => ProjectManager,
      getFleetManagerOuter: () => FleetManagerOuter,
      isTechnology: (target) => target instanceof Technology,
      getInflationChallengeAssistActive: () => inflationChallengeAssistActive,
      getRetirementChallengeAssistActive: () => retirementChallengeAssistActive,
      getInflationChallengeMoney: () => INFLATION_CHALLENGE_MONEY,
      getRetirementGraphene: () => RETIREMENT_PREP.graphene,
    });
  const { prioritizeDemandedResources } = createDemandPrioritization({
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getBuildings: () => buildings,
    getCrafter: () => crafter,
    getSpyManager: () => SpyManager,
    getFleetManagerOuter: () => FleetManagerOuter,
    getJobManager: () => JobManager,
    getFactoryManager: () => FactoryManager,
    getIsEarlyGame: () => isEarlyGame,
    isProject: (object) => object instanceof Project,
    getInflationChallengeAssistActive: () => inflationChallengeAssistActive,
    getRetirementChallengeAssistActive: () => retirementChallengeAssistActive,
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
  } = createStateLogLifecycle({
    getGame: () => game,
    getResources: () => resources,
    getState: () => state,
    plannerLimitingResource,
    storage: localStorage,
  });
  const { verifyGameActions, verifyGameActionsExist, verifyGameActionExists } =
    createGameActionVerification({
      getGame: () => game,
      getBuildings: () => buildings,
      log: (...values) => console.log(...values),
    });
  let { getGovernor, haveTask, haveTech, isEarlyGame } = createRuntimeQueries({
    getGame: () => game,
  });
  const { isHungryRace, isDemonRace, isLumberRace, getOccCosts } =
    createRaceProfile({
      getGame: () => game,
      getTraitVal: () => traitVal,
    });
  const { getGovName, getGovPower } = createForeignGovernment({
    getGame: () => game,
    getPoly: () => poly,
  });
  const {
    getGalaxyCombatShipPower,
    getPiracyMultiplier,
    galaxyAssaultPending,
    getGalaxyRegions,
  } = createGalaxyIntelligence({
    getGame: () => game,
    getBuildings: () => buildings,
    getSettings: () => settings,
    getTraitVal: () => traitVal,
  });
  const {
    getCitadelConsumption,
    isHellSupressUseful,
    adjustSpire,
    getBestSupplyRatio,
  } = createPowerSupport({
    getGame: () => game,
    getJobs: () => jobs,
    getCrafter: () => crafter,
    getBuildings: () => buildings,
  });
  let {
    ticksPerSecond,
    getHealingRate,
    getFoodConsume,
    getGrowthRate,
    getResourcesPerClick,
  } = createGameRates({
    getSettings: () => settings,
    getGame: () => game,
    getBuildings: () => buildings,
    getState: () => state,
    getResources: () => resources,
    getJobs: () => jobs,
    getTraitVal: () => traitVal,
    getGovernor: () => getGovernor(),
    getHaveTech: () => haveTech,
    getDate: () => new Date(),
  });
  var win = null;
  const { getVueById, triggerFileDownload } = createBrowserRuntime({
    getWin: () => win,
    getDocument: () => document,
    getUrlApi: () => URL,
    getBlobConstructor: () => Blob,
    schedule: (callback, delay) => setTimeout(callback, delay),
  });
  var needSandboxBypass = false;

  var overrideKey = "ctrlKey";
  var overrideKeyLabel = "Ctrl";
  if (window.navigator.platform.indexOf("Mac") === 0) {
    overrideKey = "altKey";
    overrideKeyLabel = "Alt";
  }

  var checkActions = false;

  let safeMode =
    String(window.location).toLowerCase().indexOf("safemode") !== -1;

  // Class definitions
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
  } = createEntityClasses({
    dependencies: {
      $: () => $,
      arpaIds: () => arpaIds,
      buildingIds: () => buildingIds,
      buildings: () => buildings,
      checkAffordableCustom: () => checkAffordableCustom,
      checkTypes: () => checkTypes,
      conflictingTraits: () => conflictingTraits,
      document: () => document,
      fanatAchievements: () => fanatAchievements,
      Fibonacci: () => Fibonacci,
      game: () => game,
      GameLog: () => GameLog,
      getAchievementStar: () => getAchievementStar,
      getCitadelConsumption: () => getCitadelConsumption,
      getStarLevel: () => getStarLevel,
      getVueById: () => getVueById,
      haveTask: () => haveTask,
      haveTech: () => haveTech,
      jobs: () => jobs,
      KeyManager: () => KeyManager,
      logIgnore: () => logIgnore,
      logPrestige: () => logPrestige,
      MutableTraitManager: () => MutableTraitManager,
      mutationCostMultipliers: () => mutationCostMultipliers,
      mutationCostMultipliersGenus: () => mutationCostMultipliersGenus,
      normalizeProperties: () => normalizeProperties,
      poly: () => poly,
      races: () => races,
      resources: () => resources,
      retBools: () => retBools,
      settings: () => settings,
      settingsRaw: () => settingsRaw,
      specialRaceTraits: () => specialRaceTraits,
      state: () => state,
      techIds: () => techIds,
      ticksPerSecond: () => ticksPerSecond,
      traitVal: () => traitVal,
      TriggerManager: () => TriggerManager,
      WarManager: () => WarManager,
      win: () => win,
      WindowManager: () => WindowManager,
    },
  });

  if (window.__EA_TEST_HOOKS__) {
    window.__EA_TEST_HOOKS__.entityClasses = {
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
    };
  }

  // Script constants

  // Biomes, traits and geologies in natural order
  const biomeList = [
    "grassland",
    "oceanic",
    "forest",
    "desert",
    "volcanic",
    "tundra",
    "savanna",
    "swamp",
    "taiga",
    "ashland",
    "hellscape",
    "eden",
  ];
  const traitList = [
    "none",
    "toxic",
    "mellow",
    "rage",
    "stormy",
    "ozone",
    "magnetic",
    "trashed",
    "elliptical",
    "flare",
    "dense",
    "unstable",
    "permafrost",
    "retrograde",
    "kamikaze",
  ];
  const extraList = [
    "Achievement",
    "Orbit",
    "Copper",
    "Iron",
    "Aluminium",
    "Coal",
    "Oil",
    "Titanium",
    "Uranium",
    "Iridium",
  ];

  // Biomes and traits sorted by habitability
  const planetBiomes = [
    "eden",
    "ashland",
    "volcanic",
    "taiga",
    "tundra",
    "swamp",
    "oceanic",
    "forest",
    "savanna",
    "grassland",
    "desert",
    "hellscape",
  ];
  const planetTraits = [
    "elliptical",
    "magnetic",
    "permafrost",
    "rage",
    "retrograde",
    "none",
    "stormy",
    "toxic",
    "trashed",
    "dense",
    "unstable",
    "ozone",
    "mellow",
    "flare",
    "kamikaze",
  ];
  const planetBiomeGenus = {
    hellscape: "demonic",
    eden: "angelic",
    oceanic: "aquatic",
    forest: "fey",
    desert: "sand",
    volcanic: "heat",
    tundra: "polar",
  };
  const fanatAchievements = [
    { god: "sharkin", race: "entish", achieve: "madagascar_tree" },
    { god: "sporgar", race: "human", achieve: "infested" },
    { god: "shroomi", race: "troll", achieve: "godwin" },
  ];

  const challenges = [
    [
      { id: "plasmid", trait: "no_plasmid" },
      { id: "mastery", trait: "weak_mastery" },
      { id: "nerfed", trait: "nerfed" },
    ],
    [
      { id: "crispr", trait: "no_crispr" },
      { id: "badgenes", trait: "badgenes" },
    ],
    [{ id: "trade", trait: "no_trade" }],
    [{ id: "craft", trait: "no_craft" }],
    [{ id: "joyless", trait: "joyless" }],
    [{ id: "steelen", trait: "steelen" }],
    [{ id: "decay", trait: "decay" }],
    [{ id: "emfield", trait: "emfield" }],
    [{ id: "inflation", trait: "inflation" }],
    [{ id: "sludge", trait: "sludge" }],
    [{ id: "ultra_sludge", trait: "ultra_sludge" }],
    [{ id: "orbit_decay", trait: "orbit_decay" }],
    //[{id:"nonstandard", trait:"nonstandard"}],
    [
      { id: "gravity_well", trait: "gravity_well" },
      { id: "witch_hunter", trait: "witch_hunter" },
      { id: "warlord", trait: "warlord" },
    ],
    //[{id:"storage_wars", trait:"storage_wars"}],
    [{ id: "junker", trait: "junker" }],
    [{ id: "cataclysm", trait: "cataclysm" }],
    [{ id: "banana", trait: "banana" }],
    [{ id: "truepath", trait: "truepath" }],
    [{ id: "lone_survivor", trait: "lone_survivor" }],
    [{ id: "fasting", trait: "fasting" }],
  ];
  const governors = [
    "soldier",
    "criminal",
    "entrepreneur",
    "educator",
    "spiritual",
    "bluecollar",
    "noble",
    "media",
    "sports",
    "bureaucrat",
  ];
  const evolutionSettingsToStore = [
    "userEvolutionTarget",
    "userEvolutionGenus",
    "prestigeType",
    ...challenges.map((c) => "challenge_" + c[0].id),
  ];
  const logIgnore = [
    "food",
    "lumber",
    "stone",
    "chrysotile",
    "slaughter",
    "s_alter",
    "slave_market",
    "horseshoe",
    "assembly",
    "cloning_facility",
    "ambush_patrol",
    "raid_supplies",
    "siege_fortress",
  ];
  const galaxyRegions = [
    "gxy_stargate",
    "gxy_gateway",
    "gxy_gorddon",
    "gxy_alien1",
    "gxy_alien2",
    "gxy_chthonian",
  ];
  const settingsSections = [
    "toggle",
    "general",
    "prestige",
    "evolution",
    "research",
    "market",
    "storage",
    "production",
    "war",
    "hell",
    "fleet",
    "job",
    "building",
    "project",
    "government",
    "logging",
    "trait",
    "weighting",
    "ejector",
    "planet",
    "mech",
    "magic",
    "trigger",
  ];
  const mutationCostMultipliers = {
    sludge: { gain: 10, purge: 10 },
    ultra_sludge: { gain: 10, purge: 10 },
    custom: { gain: 10, purge: 10 },
  };
  const mutationCostMultipliersGenus = { hybrid: { gain: 2, purge: 2 } };
  const specialRaceTraits = {
    beast_of_burden: "reindeer",
    photosynth: "plant",
  };
  const conflictingTraits = [["dumb", "smart"]];
  const replicableResources = [
    "Food",
    "Lumber",
    "Chrysotile",
    "Stone",
    "Crystal",
    "Furs",
    "Copper",
    "Iron",
    "Aluminium",
    "Cement",
    "Coal",
    "Oil",
    "Uranium",
    "Steel",
    "Titanium",
    "Alloy",
    "Polymer",
    "Iridium",
    "Helium_3",
    "Deuterium",
    "Neutronium",
    "Adamantite",
    "Infernite",
    "Elerium",
    "Nano_Tube",
    "Graphene",
    "Stanene",
    "Bolognium",
    "Unobtainium",
    "Vitreloy",
    "Orichalcum",
    "Water",
    "Plywood",
    "Brick",
    "Wrought_Iron",
    "Sheet_Metal",
    "Mythril",
    "Aerogel",
    "Nanoweave",
    "Scarletite",
    "Quantium",
  ];

  // Lookup tables, will be filled on init
  var techIds = {};
  var buildingIds = {};
  var arpaIds = {};
  var jobIds = {};
  var evolutions = {};
  var imitations = {};
  var races = {};
  var craftablesList = [];
  var foundryList = [];

  // State variables
  var state = {
    forcedUpdate: false,
    gameTicked: false,
    scriptTick: 1,
    multiplierTick: 0,
    buildingToggles: 0,
    evolutionAttempts: 0,
    tabHash: 0,

    lastWasteful: null,
    lastHighPop: null,
    lastFlier: null,
    lastPopulationCount: 0,
    lastFarmerCount: 0,
    astroSign: null,

    evoCheckNeeded: true,
    warnDebug: true,
    warnPreload: true,

    // We need to keep them separated, as we *don't* want to click on queue targets. Game will handle that. We're just managing resources for them.
    queuedTargets: [],
    queuedTargetsAll: [],
    triggerTargets: [],
    unlockedTechs: [],
    unlockedBuildings: [],
    conflictTargets: [],

    maxSpaceMiners: Number.MAX_SAFE_INTEGER,
    globalProductionModifier: 1,
    moneyIncomes: [],
    moneyMedian: 0,
    soulGemIncomes: [{ sec: 0, gems: 0 }],
    soulGemPerHour: 0,
    soulGemLast: Number.MAX_SAFE_INTEGER,

    knowledgeRequiredByTechs: 0,
    knowledgeRequiredByBuildTargets: 0,
    cheapestTechKnowledge: 0,

    goal: "Standard",

    missionBuildingList: [],
    tooltips: {},
    filterRegExp: null,
    evolutionTarget: null,

    whiteholeLastStabilise: 0,
    whiteholeLastExoticMass: 0,
  };

  // Class instances
  var { resources, jobs, crafter, buildings, linkedBuildings, projects } =
    createEntityCatalogs({
      classes: {
        Action,
        BasicJob,
        BeltSupport,
        CityAction,
        CraftingJob,
        ElectrolysisSupport,
        Job,
        ModalAction,
        Morale,
        Pillar,
        Population,
        Power,
        PrestigeResource,
        Project,
        Resource,
        ResourceAction,
        SoulGem,
        SpaceDock,
        Supply,
        Support,
        Thrall,
        Troops,
        WomlingsSupport,
      },
      getHaveTech: () => haveTech,
      setResources: (value) => (resources = value),
    });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      entityCatalogs: {
        resources,
        jobs,
        crafter,
        buildings,
        linkedBuildings,
        projects,
      },
    });
  }

  const {
    wrGlobalCondition,
    wrIndividualCondition,
    wrDescription,
    wrMultiplier,
    authorityCapBuildings,
    INFLATION_CHALLENGE_MONEY,
    RETIREMENT_PREP,
    inflationMoneyStorageBuildings,
    inflationMoneyIncomeBuildings,
    galaxyCombatShips,
    weightingRules,
  } = createBuildingWeightingPolicy({
    getGame: () => game,
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getBuildings: () => buildings,
    getPoly: () => poly,
    getMechManager: () => MechManager,
    getTechIds: () => techIds,
    getTraitVal: () => traitVal,
    getHaveTech: () => haveTech,
    getHaveTask: () => haveTask,
    getPiracyMultiplierFn: () => getPiracyMultiplier,
    getGalaxyAssaultPending: () => galaxyAssaultPending,
    getGalaxyRegionsFn: () => getGalaxyRegions,
    getGalaxyCombatShipPowerFn: () => getGalaxyCombatShipPower,
    getNumberStringFn: () => getNumberString,
    getNiceNumberFn: () => getNiceNumber,
    getIsLumberRace: () => isLumberRace,
    getBananaRepublicObjectiveComplete: () => bananaRepublicObjectiveComplete,
    getInflationChallengeAssistActive: () => inflationChallengeAssistActive,
    getInflationChallengeMoneyReachable: () => inflationChallengeMoneyReachable,
    getRetirementChallengeAssistActive: () => retirementChallengeAssistActive,
    getRetirementPreparationMissing: () => retirementPreparationMissing,
    getGuardActive: () => guardActive,
    getIsHellSupressUseful: () => isHellSupressUseful,
    getBestSupplyRatioFn: () => getBestSupplyRatio,
    getIsGECKNeeded: () => isGECKNeeded,
    getIsPrestigeAllowed: () => isPrestigeAllowed,
    getIsPillarFinished: () => isPillarFinished,
    getCitadelConsumptionFn: () => getCitadelConsumption,
    ResourceAction,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      weightingPolicy: {
        wrGlobalCondition,
        wrIndividualCondition,
        wrDescription,
        wrMultiplier,
        authorityCapBuildings,
        INFLATION_CHALLENGE_MONEY,
        RETIREMENT_PREP,
        inflationMoneyStorageBuildings,
        inflationMoneyIncomeBuildings,
        galaxyCombatShips,
        weightingRules,
      },
    });
  }

  // Singleton manager objects
  var MinorTraitManager = {
    priorityList: [],
    _traitVueBinding: "geneticBreakdown",

    isUnlocked() {
      return haveTech("genetics", 3);
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      return this.priorityList.filter(
        (trait) => trait.enabled && trait.isUnlocked(),
      );
    },

    buyTrait(traitName) {
      getVueById(this._traitVueBinding)?.gene(traitName);
    },
  };

  var MutableTraitManager = {
    priorityList: [],
    _traitVueBinding: "geneticBreakdown",

    isUnlocked() {
      return haveTech("genetics", 3) && game.global.genes["mutation"];
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    gainTrait(traitName) {
      getVueById(this._traitVueBinding)?.gain(traitName);
    },

    purgeTrait(traitName) {
      getVueById(this._traitVueBinding)?.purge(traitName);
    },

    get minimumPlasmidsToPreserve() {
      return Math.max(
        0,
        settings.minimumPlasmidsToPreserve,
        settings.doNotGoBelowPlasmidSoftcap
          ? resources.Phage.currentQuantity + 250
          : 0,
      );
    },
  };

  var QuarryManager = {
    _industryVueBinding: "iQuarry",
    _industryVue: undefined,

    initIndustry() {
      if (!game.global.race["smoldering"] || buildings.RockQuarry.count < 1) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentProduction() {
      return game.global.city.rock_quarry.asbestos;
    },

    increaseProduction(count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.add();
      }
    },

    decreaseProduction(count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.sub();
      }
    },
  };

  var MineManager = {
    _industryVueBinding: "iTMine",
    _industryVue: undefined,

    initIndustry() {
      if (buildings.TitanMine.count < 1) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentProduction() {
      return game.global.space.titan_mine.ratio;
    },

    increaseProduction(count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.add();
      }
    },

    decreaseProduction(count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.sub();
      }
    },
  };

  var ExtractorManager = {
    _industryVueBinding: "iMiningShip",
    _industryVue: undefined,

    initIndustry() {
      if (!haveTech("tau_roid", 4) || buildings.TauBeltMiningShip.count < 1) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentProduction(production) {
      return game.global.tauceti.mining_ship[production];
    },

    increaseProduction(production, count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.add(production);
      }
    },

    decreaseProduction(production, count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.sub(production);
      }
    },
  };

  var NaniteManager = {
    _industryVueBinding: "iNFactory",
    _industryVue: undefined,
    storageShift: 1.005,
    priorityList: [],

    // export const nf_resources from industry.js
    Resources: [
      "Lumber",
      "Chrysotile",
      "Stone",
      "Crystal",
      "Furs",
      "Copper",
      "Iron",
      "Aluminium",
      "Cement",
      "Coal",
      "Oil",
      "Uranium",
      "Steel",
      "Titanium",
      "Alloy",
      "Polymer",
      "Iridium",
      "Helium_3",
      "Water",
      "Deuterium",
      "Neutronium",
      "Adamantite",
      "Bolognium",
      "Orichalcum",
    ],

    resEnabled: (id) => settings["res_nanite" + id],

    isUnlocked() {
      return (
        game.global.race["deconstructor"] &&
        (buildings.NaniteFactory.count > 0 ||
          buildings.RedNaniteFactory.count > 0 ||
          buildings.TauNaniteFactory.count > 0)
      );
    },

    isUseful() {
      return resources.Nanite.storageRatio < 1;
    },

    initIndustry() {
      if (!this.isUnlocked()) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    isConsumable(res) {
      return this.Resources.includes(res.id);
    },

    updateResources() {
      if (!this.isUnlocked() || !settings.autoNanite) {
        return;
      }
      for (let resource of this.priorityList) {
        if (resource.isUnlocked()) {
          resource.rateMods["nanite"] = this.currentConsume(resource.id);
          resource.rateOfChange += resource.rateMods["nanite"];
        }
      }
    },

    managedPriorityList() {
      return this.priorityList;
    },

    maxConsume() {
      return game.global.city.nanite_factory.count * 50;
    },

    currentConsume(id) {
      return game.global.city.nanite_factory[id];
    },

    useRatio() {
      switch (settings.naniteMode) {
        case "cap":
          return [0.965];
        case "excess":
          return [-1];
        case "all":
          return [0.035];
        case "mixed":
          return [0.965, -1];
        case "full":
          return [0.965, -1, 0.035];
        default:
          return [];
      }
    },

    maxConsumeCraftable(resource) {
      let extraIncome = resource.rateOfChange;
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore);
    },

    maxConsumeForRatio(resource, keepRatio) {
      let extraIncome = resource.rateOfChange;
      let extraStore =
        (resource.storageRatio - keepRatio) * resource.maxQuantity;
      return Math.max(extraIncome, extraStore);
    },

    consumeMore(id, count) {
      resources[id].rateMods["nanite"] += count;

      for (let m of KeyManager.click(count)) {
        this._industryVue.addItem(id);
      }
    },

    consumeLess(id, count) {
      resources[id].rateMods["nanite"] -= count;

      for (let m of KeyManager.click(count)) {
        this._industryVue.subItem(id);
      }
    },
  };

  var SupplyManager = {
    _supplyVuePrefix: "supply",
    storageShift: 1.01,
    priorityList: [],

    resEnabled: (id) => settings["res_supply" + id],

    isUnlocked() {
      return buildings.LakeTransport.count > 0;
    },

    isUseful() {
      return (
        resources.Supply.storageRatio < 1 &&
        buildings.LakeTransport.stateOnCount > 0 &&
        buildings.LakeBireme.stateOnCount > 0
      );
    },

    initIndustry() {
      return this.isUnlocked();
    },

    isConsumable(res) {
      return poly.supplyValue.hasOwnProperty(res.id);
    },

    updateResources() {
      if (!this.isUnlocked() || !settings.autoSupply) {
        return;
      }
      for (let resource of this.priorityList) {
        if (resource.isUnlocked()) {
          resource.rateMods["supply"] =
            this.currentConsume(resource.id) * this.supplyOut(resource.id);
          resource.rateOfChange += resource.rateMods["supply"];
        }
      }
    },

    supplyIn(id) {
      return poly.supplyValue[id]?.in ?? 0;
    },

    supplyOut(id) {
      return poly.supplyValue[id]?.out ?? 0;
    },

    managedPriorityList() {
      return this.priorityList;
    },

    maxConsume() {
      return game.global.portal.transport.cargo.max;
    },

    currentConsume(id) {
      return game.global.portal.transport.cargo[id];
    },

    useRatio() {
      switch (settings.supplyMode) {
        case "cap":
          return [0.975];
        case "excess":
          return [-1];
        case "all":
          return [0.045];
        case "mixed":
          return [0.975, -1];
        case "full":
          return [0.975, -1, 0.045];
        default:
          return [];
      }
    },

    maxConsumeCraftable(resource) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        nanite: true,
      });
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore) / this.supplyOut(resource.id);
    },

    maxConsumeForRatio(resource, keepRatio) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        nanite: true,
      });
      let extraStore =
        (resource.storageRatio - keepRatio) * resource.maxQuantity;
      return Math.max(extraIncome, extraStore) / this.supplyOut(resource.id);
    },

    consumeMore(id, count) {
      let vue = getVueById(this._supplyVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources[id].rateMods["supply"] += count * this.supplyOut(id);

      for (let m of KeyManager.click(count)) {
        vue.supplyMore(id);
      }
    },

    consumeLess(id, count) {
      let vue = getVueById(this._supplyVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources[id].rateMods["supply"] -= count * this.supplyOut(id);

      for (let m of KeyManager.click(count)) {
        vue.supplyLess(id);
      }
    },
  };

  var EjectManager = {
    _ejectVuePrefix: "eject",
    storageShift: 1.015,
    priorityList: [],

    resEnabled: (id) => settings["res_eject" + id],

    isUnlocked() {
      return buildings.BlackholeMassEjector.count > 0;
    },

    isUseful() {
      return true; // Never stop ejecting
    },

    initIndustry() {
      return this.isUnlocked();
    },

    isConsumable(res) {
      return game.atomic_mass.hasOwnProperty(res.id);
    },

    updateResources() {
      if (!this.isUnlocked() || (!settings.autoEject && !haveTask("trash"))) {
        return;
      }
      for (let resource of this.priorityList) {
        if (resource.isUnlocked()) {
          resource.rateMods["eject"] = this.currentConsume(resource.id);
          resource.rateOfChange += resource.rateMods["eject"];
        }
      }
    },

    managedPriorityList() {
      return !game.global.race["artifical"]
        ? this.priorityList
        : this.priorityList.filter((r) => r !== resources.Food);
    },

    maxConsume() {
      return game.global.interstellar.mass_ejector.on * 1000;
    },

    currentConsume(id) {
      return game.global.interstellar.mass_ejector[id];
    },

    useRatio() {
      switch (settings.ejectMode) {
        case "cap":
          return [0.985];
        case "excess":
          return [-1];
        case "all":
          return [0.055];
        case "mixed":
          return [0.985, -1];
        case "full":
          return [0.985, -1, 0.055];
        default:
          return [];
      }
    },

    maxConsumeCraftable(resource) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        supply: true,
        nanite: true,
      });
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore);
    },

    maxConsumeForRatio(resource, keepRatio) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        supply: true,
        nanite: true,
      });
      let extraStore =
        (resource.storageRatio - keepRatio) * resource.maxQuantity;
      return Math.max(extraIncome, extraStore);
    },

    consumeMore(id, count) {
      let vue = getVueById(this._ejectVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources[id].rateMods["eject"] += count;

      for (let m of KeyManager.click(count)) {
        vue.ejectMore(id);
      }
    },

    consumeLess(id, count) {
      let vue = getVueById(this._ejectVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources[id].rateMods["eject"] -= count;

      for (let m of KeyManager.click(count)) {
        vue.ejectLess(id);
      }
    },
  };

  var AlchemyManager = {
    _alchemyVuePrefix: "alchemy",
    priorityList: [],

    resEnabled: (id) => settings["res_alchemy_" + id],
    resWeighting: (id) => settings["res_alchemy_w_" + id],

    isUnlocked() {
      return haveTech("alchemy");
    },

    managedPriorityList() {
      return this.priorityList.filter(
        (res) =>
          this.resEnabled(res.id) &&
          res.isUnlocked() &&
          this.transmuteTier(res) <= game.global.tech.alchemy &&
          (!game.global.race["artifical"] || res !== resources.Food),
      );
    },

    transmuteTier(res) {
      return !game.tradeRatio.hasOwnProperty(res.id) ||
        res === resources.Crystal
        ? 0
        : res.instance?.hasOwnProperty("trade")
          ? 1
          : 2;
    },

    currentCount(id) {
      return game.global.race.alchemy[id];
    },

    transmuteMore(id, count) {
      let vue = getVueById(this._alchemyVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources.Mana.rateOfChange -= count * 1;
      resources.Crystal.rateOfChange -= count * 0.5;

      for (let m of KeyManager.click(count)) {
        vue.addSpell(id);
      }
    },

    transmuteLess(id, count) {
      let vue = getVueById(this._alchemyVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources.Mana.rateOfChange += count * 1;
      resources.Crystal.rateOfChange += count * 0.5;

      for (let m of KeyManager.click(count)) {
        vue.subSpell(id);
      }
    },
  };

  var RitualManager = {
    _industryVueBinding: "iPylon",
    _industryVue: undefined,

    Productions: addProps(
      {
        Farmer: {
          id: "farmer",
          isUnlocked: () =>
            !game.global.race["orbit_decayed"] &&
            !game.global.race["cataclysm"] &&
            !game.global.race["carnivore"] &&
            !game.global.race["soul_eater"] &&
            !game.global.race["artifical"] &&
            !game.global.race["unfathomable"],
        },
        Miner: {
          id: "miner",
          isUnlocked: () => !game.global.race["cataclysm"],
        },
        Lumberjack: {
          id: "lumberjack",
          isUnlocked: () =>
            !game.global.race["orbit_decayed"] &&
            !game.global.race["cataclysm"] &&
            isLumberRace() &&
            !game.global.race["evil"],
        },
        Science: { id: "science", isUnlocked: () => true },
        Factory: { id: "factory", isUnlocked: () => true },
        Army: { id: "army", isUnlocked: () => true },
        Hunting: { id: "hunting", isUnlocked: () => true },
        Crafting: { id: "crafting", isUnlocked: () => haveTech("magic", 4) },
      },
      (s) => s.id,
      [{ s: "spell_w_", p: "weighting" }],
    ),

    initIndustry() {
      if (
        (buildings.Pylon.count < 1 &&
          buildings.RedPylon.count < 1 &&
          buildings.TauPylon.count < 1) ||
        !game.global.race["casting"]
      ) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentSpells(spell) {
      return game.global.race.casting[spell.id];
    },

    spellCost(spell) {
      return this.manaCost(this.currentSpells(spell));
    },

    costStep(level) {
      if (level === 0) {
        return 0.0025;
      }
      let cost = this.manaCost(level);
      return ((cost / level) * 1.0025 + 0.0025) * (level + 1) - cost;
    },

    // export function manaCost(spell,rate) from industry.js
    manaCost(level) {
      return level * (1.0025 ** level - 1);
    },

    increaseRitual(spell, count) {
      if (count === 0 || !spell.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        return this.decreaseRitual(spell, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.addSpell(spell.id);
      }
    },

    decreaseRitual(spell, count) {
      if (count === 0 || !spell.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        return this.increaseRitual(count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.subSpell(spell.id);
      }
    },
  };

  var SmelterManager = {
    _industryVueBinding: "iSmelter",
    _industryVue: undefined,

    Productions: normalizeProperties(
      {
        Iron: {
          id: "Iron",
          unlocked: () => true,
          resource: resources.Iron,
          cost: [],
        },
        Steel: {
          id: "Steel",
          unlocked: () =>
            resources.Steel.isUnlocked() && haveTech("smelting", 2),
          resource: resources.Steel,
          cost: [
            new ResourceProductionCost(resources.Coal, 0.25, 1.25),
            new ResourceProductionCost(resources.Iron, 2, 6),
          ],
        },
        Iridium: {
          id: "Iridium",
          unlocked: () =>
            resources.Iridium.isUnlocked() &&
            (haveTech("m_smelting", 2) || haveTech("irid_smelting")),
          resource: resources.Iridium,
          cost: [],
        },
      },
      [ResourceProductionCost],
    ),

    Fuels: addProps(
      normalizeProperties(
        {
          Oil: {
            id: "Oil",
            unlocked: () => game.global.resource.Oil.display,
            cost: [new ResourceProductionCost(resources.Oil, 0.35, 2)],
          },
          Coal: {
            id: "Coal",
            unlocked: () => game.global.resource.Coal.display,
            cost: [
              new ResourceProductionCost(
                resources.Coal,
                () => (!isLumberRace() ? 0.15 : 0.25),
                2,
              ),
            ],
          },
          Wood: {
            id: "Wood",
            unlocked: () => isLumberRace() || game.global.race["evil"],
            cost: [
              new ResourceProductionCost(
                () =>
                  game.global.race["evil"]
                    ? game.global.race["soul_eater"] &&
                      game.global.race.species !== "wendigo"
                      ? resources.Food
                      : resources.Furs
                    : resources.Lumber,
                () =>
                  (game.global.race["evil"] &&
                    !game.global.race["soul_eater"]) ||
                  game.global.race.species === "wendigo"
                    ? 1
                    : 3,
                6,
              ),
            ],
          },
          Inferno: {
            id: "Inferno",
            unlocked: () => haveTech("smelting", 8),
            cost: [
              new ResourceProductionCost(resources.Coal, 50, 50),
              new ResourceProductionCost(resources.Oil, 35, 50),
              new ResourceProductionCost(resources.Infernite, 0.5, 50),
            ],
          },
        },
        [ResourceProductionCost],
      ),
      (f) => f.id,
      [{ s: "smelter_fuel_p_", p: "priority" }],
    ),

    initIndustry() {
      if (
        game.global.race["steelen"] ||
        (buildings.Smelter.count < 1 &&
          !game.global.race["cataclysm"] &&
          !game.global.race["orbit_decayed"] &&
          !haveTech("isolation") &&
          !game.global.race["warlord"])
      ) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    managedFuelPriorityList() {
      return Object.values(this.Fuels).sort((a, b) => a.priority - b.priority);
    },

    fueledCount(fuel) {
      if (!fuel.unlocked) {
        return 0;
      }

      return game.global.city.smelter[fuel.id];
    },

    smeltingCount(production) {
      if (!production.unlocked) {
        return 0;
      }

      return game.global.city.smelter[production.id];
    },

    increaseFuel(fuel, count) {
      if (count === 0 || !fuel.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.decreaseFuel(fuel, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.addFuel(fuel.id);
      }
    },

    decreaseFuel(fuel, count) {
      if (count === 0 || !fuel.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.increaseFuel(fuel, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.subFuel(fuel.id);
      }
    },

    increaseSmelting(id, count) {
      if (count === 0 || !this.Productions[id].unlocked) {
        return false;
      }
      if (count < 0) {
        return this.decreaseSmelting(id, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.addMetal(id);
      }
    },

    decreaseSmelting(id, count) {
      if (count === 0 || !this.Productions[id].unlocked) {
        return false;
      }
      if (count < 0) {
        return this.increaseSmelting(id, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.subMetal(id);
      }
    },

    maxOperating() {
      return game.global.city.smelter.cap - game.global.city.smelter.Star;
    },

    extraOperating() {
      return game.global.city.smelter.Star;
    },

    currentFueled() {
      return this._industryVue.$options.filters.on();
    },
  };

  var FactoryManager = {
    _industryVueBinding: "iFactory",
    _industryVue: undefined,

    Productions: addProps(
      normalizeProperties(
        {
          LuxuryGoods: {
            id: "Lux",
            resource: resources.Money,
            unlocked: () => true,
            cost: [
              new ResourceProductionCost(
                resources.Furs,
                () => FactoryManager.f_rate("Lux", "fur"),
                5,
              ),
            ],
          },
          Furs: {
            id: "Furs",
            resource: resources.Furs,
            unlocked: () => haveTech("synthetic_fur"),
            cost: [
              new ResourceProductionCost(
                resources.Money,
                () => FactoryManager.f_rate("Furs", "money"),
                1000,
              ),
              new ResourceProductionCost(
                resources.Polymer,
                () => FactoryManager.f_rate("Furs", "polymer"),
                10,
              ),
            ],
          },
          Alloy: {
            id: "Alloy",
            resource: resources.Alloy,
            unlocked: () => true,
            cost: [
              new ResourceProductionCost(
                resources.Copper,
                () => FactoryManager.f_rate("Alloy", "copper"),
                5,
              ),
              new ResourceProductionCost(
                resources.Aluminium,
                () => FactoryManager.f_rate("Alloy", "aluminium"),
                5,
              ),
            ],
          },
          Polymer: {
            id: "Polymer",
            resource: resources.Polymer,
            unlocked: () => haveTech("polymer"),
            cost: function () {
              return !isLumberRace() ? this.cost_kk : this.cost_normal;
            },
            cost_kk: [
              new ResourceProductionCost(
                resources.Oil,
                () => FactoryManager.f_rate("Polymer", "oil_kk"),
                2,
              ),
            ],
            cost_normal: [
              new ResourceProductionCost(
                resources.Oil,
                () => FactoryManager.f_rate("Polymer", "oil"),
                2,
              ),
              new ResourceProductionCost(
                resources.Lumber,
                () => FactoryManager.f_rate("Polymer", "lumber"),
                50,
              ),
            ],
          },
          NanoTube: {
            id: "Nano",
            resource: resources.Nano_Tube,
            unlocked: () => haveTech("nano"),
            cost: [
              new ResourceProductionCost(
                resources.Coal,
                () => FactoryManager.f_rate("Nano_Tube", "coal"),
                15,
              ),
              new ResourceProductionCost(
                resources.Neutronium,
                () => FactoryManager.f_rate("Nano_Tube", "neutronium"),
                0.2,
              ),
            ],
          },
          Stanene: {
            id: "Stanene",
            resource: resources.Stanene,
            unlocked: () => haveTech("stanene"),
            cost: [
              new ResourceProductionCost(
                resources.Aluminium,
                () => FactoryManager.f_rate("Stanene", "aluminium"),
                50,
              ),
              new ResourceProductionCost(
                resources.Nano_Tube,
                () => FactoryManager.f_rate("Stanene", "nano"),
                5,
              ),
            ],
          },
        },
        [ResourceProductionCost],
      ),
      (p) => p.resource.id,
      [
        { s: "production_", p: "enabled" },
        { s: "production_w_", p: "weighting" },
        { s: "production_p_", p: "priority" },
      ],
    ),

    initIndustry() {
      if (
        buildings.Factory.count < 1 &&
        buildings.RedFactory.count < 1 &&
        buildings.TauFactory.count < 1 &&
        buildings.WastelandHellFactory.count < 1
      ) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }
      return true;
    },

    f_rate(production, resource) {
      return game.f_rate[production][resource][
        game.global.tech["factory"] || 0
      ];
    },

    currentOperating() {
      let total = 0;
      for (let key in this.Productions) {
        let production = this.Productions[key];
        total += game.global.city.factory[production.id];
      }
      return total;
    },

    maxOperating() {
      let max =
        buildings.Factory.stateOnCount +
        buildings.RedFactory.stateOnCount +
        buildings.AlphaMegaFactory.stateOnCount * 2 +
        buildings.TauFactory.stateOnCount * (haveTech("isolation") ? 5 : 3) +
        buildings.WastelandHellFactory.stateOnCount *
          (3 + (game.global.portal?.hell_factory?.rank || 1));
      if (!game.global.city.factory) {
        return max;
      }
      for (let key in this.Productions) {
        let production = this.Productions[key];
        if (production.unlocked && !production.enabled) {
          max -= game.global.city.factory[production.id];
        }
      }
      return max;
    },

    currentProduction(production) {
      return production.unlocked ? game.global.city.factory[production.id] : 0;
    },

    increaseProduction(production, count) {
      if (count === 0 || !production.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.addItem(production.id);
      }
    },

    decreaseProduction(production, count) {
      if (count === 0 || !production.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.subItem(production.id);
      }
    },
  };

  var ReplicatorManager = {
    _industryVueBinding: "iReplicator",
    _industryVue: undefined,

    Productions: addProps(
      normalizeProperties(
        replicableResources
          .map((resId) => resources[resId])
          .reduce(
            (a, res) => ({
              ...a,
              [res.id]: {
                id: res.id,
                resource: res,
                unlocked: () => res.isUnlocked(),
                cost: [],
              },
            }),
            {},
          ),
      ),
      (p) => p.resource.id,
      [
        { s: "replicator_", p: "enabled" },
        { s: "replicator_w_", p: "weighting" },
        { s: "replicator_p_", p: "priority" },
      ],
    ),

    initIndustry() {
      if (!haveTech("replicator")) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }
      return true;
    },

    setResource(res) {
      if (this._industryVue.avail(res)) {
        this._industryVue.setVal(res);
      }
    },
  };

  var DroidManager = {
    _industryVueBinding: "iDroid",
    _industryVue: undefined,

    Productions: addProps(
      {
        Adamantite: { id: "adam", resource: resources.Adamantite },
        Uranium: { id: "uran", resource: resources.Uranium },
        Coal: { id: "coal", resource: resources.Coal },
        Aluminium: { id: "alum", resource: resources.Aluminium },
      },
      (p) => p.resource.id,
      [
        { s: "droid_w_", p: "weighting" },
        { s: "droid_pr_", p: "priority" },
      ],
    ),

    initIndustry() {
      if (buildings.AlphaMiningDroid.count < 1) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentOperating() {
      let total = 0;
      for (let key in this.Productions) {
        let production = this.Productions[key];
        total += game.global.interstellar.mining_droid[production.id];
      }
      return total;
    },

    maxOperating() {
      return game.global.interstellar.mining_droid.on;
    },

    currentProduction(production) {
      return game.global.interstellar.mining_droid[production.id];
    },

    increaseProduction(production, count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.addItem(production.id);
      }
    },

    decreaseProduction(production, count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.subItem(production.id);
      }
    },
  };

  var GrapheneManager = {
    _industryVueBinding: "iGraphene",
    _industryVue: undefined,
    _graphPlant: null,

    Fuels: {
      Lumber: {
        id: "Lumber",
        cost: new ResourceProductionCost(resources.Lumber, 350, 100),
        add: "addWood",
        sub: "subWood",
      },
      Coal: {
        id: "Coal",
        cost: new ResourceProductionCost(resources.Coal, 25, 10),
        add: "addCoal",
        sub: "subCoal",
      },
      Oil: {
        id: "Oil",
        cost: new ResourceProductionCost(resources.Oil, 15, 10),
        add: "addOil",
        sub: "subOil",
      },
    },

    initIndustry() {
      this._graphPlant = game.global.race["warlord"]
        ? buildings.WastelandTwistedLab
        : game.global.race["truepath"]
          ? buildings.TitanGraphene
          : buildings.AlphaGraphenePlant;
      if ((this._graphPlant.instance?.count ?? 0) < 1) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    maxOperating() {
      return this._graphPlant.instance.on;
    },

    fueledCount(fuel) {
      return this._graphPlant.instance[fuel.id];
    },

    increaseFuel(fuel, count) {
      if (count === 0 || !fuel.cost.resource.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        return this.decreaseFuel(fuel, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue[fuel.add]();
      }
    },

    decreaseFuel(fuel, count) {
      if (count === 0 || !fuel.cost.resource.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        return this.increaseFuel(fuel, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue[fuel.sub]();
      }
    },
  };

  var GalaxyTradeManager = {
    _industryVueBinding: "galaxyTrade",
    _industryVue: undefined,

    initIndustry() {
      if (
        buildings.GorddonFreighter.count +
          buildings.Alien1SuperFreighter.count <
        1
      ) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentOperating() {
      return game.global.galaxy.trade.cur;
    },

    maxOperating() {
      return game.global.galaxy.trade.max;
    },

    currentProduction(production) {
      return game.global.galaxy.trade["f" + production];
    },

    zeroProduction(production) {
      this._industryVue.zero(production);
    },

    increaseProduction(production, count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.more(production);
      }
    },

    decreaseProduction(production, count) {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      for (let m of KeyManager.click(count)) {
        this._industryVue.less(production);
      }
    },
  };

  var GovernmentManager = {
    Types: {
      anarchy: { id: "anarchy", isUnlocked: () => false, selectable: false },
      dictator: { id: "dictator", isUnlocked: () => false, selectable: false },
      autocracy: { id: "autocracy", isUnlocked: () => true },
      democracy: { id: "democracy", isUnlocked: () => true },
      oligarchy: { id: "oligarchy", isUnlocked: () => true },
      theocracy: { id: "theocracy", isUnlocked: () => haveTech("gov_theo") },
      republic: { id: "republic", isUnlocked: () => haveTech("govern", 2) },
      socialist: { id: "socialist", isUnlocked: () => haveTech("gov_soc") },
      corpocracy: { id: "corpocracy", isUnlocked: () => haveTech("gov_corp") },
      technocracy: {
        id: "technocracy",
        isUnlocked: () => haveTech("govern", 3),
      },
      federation: { id: "federation", isUnlocked: () => haveTech("gov_fed") },
      magocracy: { id: "magocracy", isUnlocked: () => haveTech("gov_mage") },
    },

    isUnlocked() {
      let node = document.getElementById("govType");
      return node !== null && node.style.display !== "none";
    },

    isEnabled() {
      let node = document.querySelector("#govType button");
      return (
        this.isUnlocked() &&
        node !== null &&
        node.getAttribute("disabled") !== "disabled"
      );
    },

    currentGovernment() {
      return game.global.civic.govern.type;
    },

    setGovernment(government) {
      // Don't try anything if chosen government already set, or modal window is already open
      if (this.currentGovernment() === government || WindowManager.isOpen()) {
        return;
      }

      let optionsNode = document.querySelector("#govType button");
      let title = game.loc("civics_government_type");
      WindowManager.openModalWindowWithCallback(optionsNode, title, () => {
        GameLog.logSuccess(
          "special",
          `Revolution! Government changed to ${game.loc(
            "govern_" + government,
          )}.`,
          ["events", "major_events"],
        );
        getVueById("govModal")?.setGov(government);
      });
    },
  };

  var MarketManager = {
    priorityList: [],
    multiplier: 0,

    updateData() {
      if (game.global.city.market) {
        this.multiplier = game.global.city.market.qty;
      }
    },

    isUnlocked() {
      return haveTech("currency", 2);
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.marketPriority - b.marketPriority);
    },

    isBuySellUnlocked(resource) {
      return (
        document.querySelector("#market-" + resource.id + " .order") !== null
      );
    },

    setMultiplier(multiplier) {
      this.multiplier = Math.min(
        Math.max(1, multiplier),
        this.getMaxMultiplier(),
      );

      getVueById("market-qty").qty = this.multiplier;
    },

    getMaxMultiplier() {
      return getVueById("market-qty")?.limit() ?? 1;
    },

    getUnitBuyPrice(resource) {
      // marketItem > vBind > purchase from resources.js
      let price = game.global.resource[resource.id].value;

      price *= traitVal("arrogant", 0, "+");
      price *= traitVal("conniving", 0, "-");

      return price;
    },

    getUnitSellPrice(resource) {
      // marketItem > vBind > sell from resources.js
      let divide = 4;

      divide *= traitVal("merchant", 0, "-");
      divide *= traitVal("asymmetrical", 0, "+");
      divide *= traitVal("conniving", 1, "-");

      return game.global.resource[resource.id].value / divide;
    },

    buy(resource) {
      let vue = getVueById(resource._marketVueBinding);
      if (vue === undefined) {
        return false;
      }

      let price = this.getUnitBuyPrice(resource) * this.multiplier;
      if (resources.Money.currentQuantity < price) {
        return false;
      }

      resources.Money.currentQuantity -=
        this.multiplier * this.getUnitBuyPrice(resource);
      resource.currentQuantity += this.multiplier;

      vue.purchase(resource.id);
    },

    sell(resource) {
      let vue = getVueById(resource._marketVueBinding);
      if (vue === undefined) {
        return false;
      }

      if (resource.currentQuantity < this.multiplier) {
        return false;
      }

      resources.Money.currentQuantity +=
        this.multiplier * this.getUnitSellPrice(resource);
      resource.currentQuantity -= this.multiplier;

      vue.sell(resource.id);
    },

    getImportRouteCap() {
      if (haveTech("currency", 6)) {
        return 1000000;
      } else if (haveTech("currency", 4)) {
        return 100;
      } else {
        return 25;
      }
    },

    getExportRouteCap() {
      if (!game.global.race["banana"]) {
        return this.getImportRouteCap();
      } else if (haveTech("currency", 6)) {
        return 1000000;
      } else if (haveTech("currency", 4)) {
        return 25;
      } else {
        return 10;
      }
    },

    getMaxTradeRoutes() {
      let max = game.global.city.market.mtrade;
      let unmanaged = 0;
      for (let resource of this.priorityList) {
        if (!resource.autoTradeBuyEnabled && !resource.autoTradeSellEnabled) {
          max -= Math.abs(resource.tradeRoutes);
          unmanaged += resource.tradeRoutes;
        }
      }
      return [max, unmanaged];
    },

    zeroTradeRoutes(resource) {
      getVueById(resource._marketVueBinding)?.zero(resource.id);
    },

    addTradeRoutes(resource, count) {
      if (!resource.isUnlocked()) {
        return false;
      }

      let vue = getVueById(resource._marketVueBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.autoBuy(resource.id);
      }
    },

    removeTradeRoutes(resource, count) {
      if (!resource.isUnlocked()) {
        return false;
      }

      let vue = getVueById(resource._marketVueBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.autoSell(resource.id);
      }
    },
  };

  var StorageManager = {
    priorityList: [],
    crateValue: 0,
    containerValue: 0,
    _storageVueBinding: "createHead",
    _storageVue: undefined,
    _crateDebounce: {}, // { resourceId: { dir, ticks, prev, locked } }
    _containerDebounce: {}, // same

    initStorage() {
      if (!this.isUnlocked) {
        return false;
      }

      this._storageVue = getVueById(this._storageVueBinding);
      if (this._storageVue === undefined) {
        return false;
      }

      return true;
    },

    isUnlocked() {
      return haveTech("container");
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.storagePriority - b.storagePriority);
    },

    constructCrate(count) {
      if (count <= 0) {
        return;
      }
      for (let m of KeyManager.click(count)) {
        this._storageVue.crate();
      }
    },

    constructContainer(count) {
      if (count <= 0) {
        return;
      }
      for (let m of KeyManager.click(count)) {
        this._storageVue.container();
      }
    },

    assignCrate(resource, count) {
      let vue = getVueById(resource._stackVueBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.addCrate(resource.id);
      }
    },

    unassignCrate(resource, count) {
      let vue = getVueById(resource._stackVueBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.subCrate(resource.id);
      }
    },

    assignContainer(resource, count) {
      let vue = getVueById(resource._stackVueBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.addCon(resource.id);
      }
    },

    unassignContainer(resource, count) {
      let vue = getVueById(resource._stackVueBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.subCon(resource.id);
      }
    },
  };

  var SpyManager = {
    _foreignVue: undefined,

    purchaseMoney: 0,
    purchaseForeigngs: [],
    foreignActive: [],
    foreignTarget: null,

    Types: {
      Influence: { id: "influence" },
      Sabotage: { id: "sabotage" },
      Incite: { id: "incite" },
      Annex: { id: "annex" },
      Purchase: { id: "purchase" },
    },

    spyCost(govIndex, spy) {
      let gov = game.global.civic.foreign[`gov${govIndex}`];
      spy = spy ?? gov.spy + 1;

      let base = Math.max(
        50,
        Math.round(gov.mil / 2 + gov.hstl / 2 - gov.unrest) + 10,
      );
      if (game.global.race["infiltrator"]) {
        base /= 3;
      }
      if (state.astroSign === "scorpio") {
        base * 0.88;
      }
      return Math.round(base ** spy) + 500;
    },

    updateForeigns() {
      this.purchaseMoney = 0;
      this.purchaseForeigngs = [];
      this._foreignVue = getVueById("foreign");
      let foreignUnlocked = this._foreignVue?.vis();
      if (foreignUnlocked) {
        let currentTarget = null;
        let controlledForeigns = 0;

        let unlockedForeigns = [];
        if (!haveTech("world_control")) {
          unlockedForeigns.push(0, 1, 2);
        }
        if (haveTech("rival")) {
          unlockedForeigns.push(3);
        }

        let activeForeigns = unlockedForeigns.map((i) => ({
          id: i,
          gov: game.global.civic.foreign[`gov${i}`],
        }));

        // Init foreigns
        for (let foreign of activeForeigns) {
          let rank =
            foreign.id === 3
              ? "Rival"
              : getGovPower(foreign.id) <= settings.foreignPowerRequired
                ? "Inferior"
                : "Superior";

          foreign.policy = settings[`foreignPolicy${rank}`];

          if (
            (foreign.gov.anx && foreign.policy === "Annex") ||
            (foreign.gov.buy && foreign.policy === "Purchase") ||
            (foreign.gov.occ && foreign.policy === "Occupy")
          ) {
            controlledForeigns++;
          }

          if (
            !settings.foreignPacifist &&
            !guardActive("guardPacifist") &&
            !foreign.gov.anx &&
            !foreign.gov.buy &&
            rank === "Inferior"
          ) {
            currentTarget = foreign;
          }
        }

        // Adjust for fight
        if (
          activeForeigns.length > 0 &&
          !settings.foreignPacifist &&
          !guardActive("guardPacifist")
        ) {
          // Try to attacks last uncontrolled inferior, or first occupied, or just first, in this order.
          currentTarget =
            currentTarget ??
            activeForeigns.find((f) => f.gov.occ) ??
            activeForeigns[0];

          let readyToUnify =
            settings.foreignUnification &&
            controlledForeigns >= 2 &&
            game.global.tech["unify"] === 1;

          // Don't annex or purchase our farm target, unless we're ready to unify
          if (
            !readyToUnify &&
            ["Annex", "Purchase"].includes(currentTarget.policy) &&
            SpyManager.isEspionageUseful(
              currentTarget.id,
              SpyManager.Types[currentTarget.policy].id,
            )
          ) {
            currentTarget.policy = "Ignore";
          }

          // Force sabotage, if needed, and we know it's useful
          if (
            !readyToUnify &&
            settings.foreignForceSabotage &&
            currentTarget.id !== 3 &&
            SpyManager.isEspionageUseful(
              currentTarget.id,
              SpyManager.Types.Sabotage.id,
            )
          ) {
            currentTarget.policy = "Sabotage";
          }

          // Set last foreign to sabotage only, and then switch to occupy once we're ready to unify
          if (
            settings.foreignUnification &&
            settings.foreignOccupyLast &&
            !haveTech("world_control")
          ) {
            let lastTarget = ["Occupy", "Sabotage"].includes(
              settings.foreignPolicySuperior,
            )
              ? 2
              : currentTarget.id;
            activeForeigns[lastTarget].policy = readyToUnify
              ? "Occupy"
              : "Sabotage";
          }

          // Do not attack if policy set to influence, or we're ready to unify
          if (
            currentTarget.policy === "Influence" ||
            (readyToUnify && currentTarget.policy !== "Occupy") ||
            (currentTarget.policy === "Betrayal" && currentTarget.gov.mil > 75)
          ) {
            currentTarget = null;
          }
        }

        // Request money for unify, make sure we have autoFight and autoResearch
        if (
          game.global.tech["unify"] === 1 &&
          (settings.foreignUnification || guardActive("guardPacifist")) &&
          settings.autoFight
        ) {
          for (let foreign of activeForeigns) {
            if (
              foreign.policy === "Purchase" &&
              !foreign.gov.buy &&
              foreign.gov.act !== "purchase"
            ) {
              let moneyNeeded = Math.max(
                poly.govPrice(foreign.id),
                foreign.gov.spy < 3 ? this.spyCost(foreign.id, 3) : 0,
              );
              if (moneyNeeded <= resources.Money.maxQuantity) {
                this.purchaseForeigngs.push(foreign.id);
                this.purchaseMoney = Math.max(moneyNeeded, this.purchaseMoney);
              }
            }
          }
        }

        this.foreignTarget = currentTarget;
        this.foreignActive = activeForeigns;
      } else {
        this._foreignVue = undefined;
      }
    },

    performEspionage(govIndex, espionageId, influenceAllowed) {
      if (WindowManager.isOpen()) {
        return;
      } // Don't try anything if a window is already open

      let optionsSpan = document.querySelector(
        `#gov${govIndex} div span:nth-child(3)`,
      );
      if (optionsSpan.style.display === "none") {
        return;
      }

      let optionsNode = document.querySelector(
        `#gov${govIndex} div span:nth-child(3) button`,
      );
      if (
        optionsNode === null ||
        optionsNode.getAttribute("disabled") === "disabled"
      ) {
        return;
      }

      let espionageToPerform = null;
      if (
        espionageId === this.Types.Annex.id ||
        espionageId === this.Types.Purchase.id
      ) {
        // Occupation routine
        if (this.isEspionageUseful(govIndex, espionageId)) {
          // If we can annex\purchase right now - do it
          espionageToPerform = espionageId;
        } else if (
          this.isEspionageUseful(govIndex, this.Types.Influence.id) &&
          influenceAllowed
        ) {
          // Influence goes second, as it always have clear indication when HSTL already at zero
          espionageToPerform = this.Types.Influence.id;
        } else if (this.isEspionageUseful(govIndex, this.Types.Incite.id)) {
          // And now incite
          espionageToPerform = this.Types.Incite.id;
        }
      } else if (this.isEspionageUseful(govIndex, espionageId)) {
        // User specified spy operation. If it is not already at miximum effect then proceed with it.
        espionageToPerform = espionageId;
      }

      if (espionageToPerform !== null) {
        if (espionageToPerform === this.Types.Purchase.id) {
          resources.Money.currentQuantity -= poly.govPrice(govIndex);
        }
        let title = game.loc("civics_espionage_actions");
        WindowManager.openModalWindowWithCallback(optionsNode, title, () => {
          GameLog.logSuccess(
            "spying",
            `Performing "${game.loc(
              "civics_spy_" + espionageToPerform,
            )}" covert operation against ${getGovName(govIndex)}.`,
            ["spy"],
          );
          getVueById("espModal")?.[espionageToPerform]?.(govIndex);
        });
      }
    },

    isEspionageUseful(govIndex, espionageId) {
      let gov = game.global.civic.foreign["gov" + govIndex];

      // Return true when requested task is useful, or when we don't have enough spies prove it's not
      switch (espionageId) {
        case this.Types.Influence.id:
          return gov.hstl > (gov.spy > 0 ? 0 : 10);
        case this.Types.Sabotage.id:
          return gov.spy < 1 || gov.mil > (gov.spy > 1 ? 50 : 74);
        case this.Types.Incite.id:
          return gov.spy < 3 || gov.unrest < (gov.spy > 3 ? 100 : 76);
        case this.Types.Annex.id:
          return (
            gov.hstl <= 50 &&
            gov.unrest >= 50 &&
            resources.Morale.currentQuantity >= 200 + gov.hstl - gov.unrest
          );
        case this.Types.Purchase.id:
          return (
            gov.spy >= 3 &&
            resources.Money.currentQuantity >= poly.govPrice(govIndex)
          );
      }
      return false;
    },
  };

  var WarManager = {
    _garrisonVue: undefined,
    _hellVue: undefined,

    workers: 0,
    wounded: 0,
    raid: 0,
    max: 0,
    m_use: 0,
    crew: 0,
    hellSoldiers: 0,
    hellPatrols: 0,
    hellPatrolSize: 0,
    hellAssigned: 0,
    hellReservedSoldiers: 0,

    // Warlord properties
    minions: 0,
    enemies: 0,

    updateGarrison() {
      let garrison = game.global.civic.garrison;
      if (garrison) {
        this.workers = garrison.workers;
        this.wounded = garrison.wounded;
        this.raid = garrison.raid;
        this.max = garrison.max;
        this.m_use = garrison.m_use;
        this.crew = garrison.crew;
        this._garrisonVue = getVueById("garrison");
      } else {
        this._garrisonVue = undefined;
      }
    },

    updateHell() {
      let fortress = game.global.portal.fortress;
      if (fortress) {
        this.hellSoldiers = fortress.garrison;
        this.hellPatrols = fortress.patrols;
        this.hellPatrolSize = fortress.patrol_size;
        this.hellAssigned = fortress.assigned;
        this.hellReservedSoldiers = this.getHellReservedSoldiers();
        this._hellVue = getVueById("fort");
        this.minions = game.global.portal.minions?.spawns;
        this.enemies = game.global.portal.throne?.enemy?.length;
      } else {
        this._hellVue = undefined;
      }
    },

    get currentSoldiers() {
      return this.workers - this.crew;
    },

    get maxSoldiers() {
      return this.max - this.crew;
    },

    get deadSoldiers() {
      return this.max - this.workers;
    },

    get currentCityGarrison() {
      return (
        this.currentSoldiers -
        this.hellSoldiers -
        (game.global.space.fob?.troops ?? 0)
      );
    },

    get maxCityGarrison() {
      return this.maxSoldiers - this.hellSoldiers;
    },

    get availableGarrison() {
      return game.global.race["rage"]
        ? this.currentCityGarrison
        : this.currentCityGarrison - this.wounded;
    },

    get hellGarrison() {
      return (
        this.hellSoldiers -
        this.hellPatrolSize * this.hellPatrols -
        this.hellReservedSoldiers
      );
    },

    launchCampaign(govIndex) {
      this._garrisonVue.campaign(govIndex);
    },

    release(govIndex) {
      if (game.global.civic.foreign["gov" + govIndex].occ) {
        let occSoldiers = getOccCosts();
        this.workers += occSoldiers;
        this.max += occSoldiers;
      }
      this._garrisonVue.campaign(govIndex);
    },

    isMercenaryUnlocked() {
      return game.global.civic.garrison.mercs;
    },

    // function mercCost from civics.js
    get mercenaryCost() {
      let cost = Math.round(1.24 ** this.workers * 75) - 50;
      if (cost > 25000) {
        cost = 25000;
      }
      if (this.m_use > 0) {
        cost *= 1.1 ** this.m_use;
      }
      cost *= traitVal("brute", 0, "-");
      if (game.global.race["inflation"]) {
        cost *= 1 + game.global.race.inflation / 500;
      }
      cost *= traitVal("high_pop", 1, "=");
      return Math.round(cost);
    },

    hireMercenary() {
      let cost = this.mercenaryCost;
      if (this.workers >= this.max || resources.Money.currentQuantity < cost) {
        return false;
      }

      KeyManager.set(false, false, false);
      this._garrisonVue.hire();

      resources.Money.currentQuantity -= cost;
      this.workers++;
      this.m_use++;

      return true;
    },

    getHellReservedSoldiers() {
      let soldiers = 0;

      const soldierRating = game.armyRating(1, "hellArmy");

      // Assign soldiers to assault forge once other requirements are met
      if (
        settings.autoBuild &&
        buildings.PitAssaultForge.isAutoBuildable() &&
        soldierRating > 0
      ) {
        if (
          settings.hellAssaultReserve ||
          !Object.entries(buildings.PitAssaultForge.cost).find(
            ([id, amount]) => resources[id].currentQuantity < amount,
          )
        ) {
          soldiers = Math.round(650 / soldierRating);
        }
      }

      // Reserve soldiers operating forge - check if it exists and could be powered, not if it's already powered
      if (
        buildings.PitSoulForge.count > 0 &&
        (buildings.PitSoulForge.autoStateEnabled ||
          buildings.PitSoulForge.stateOnCount > 0) &&
        soldierRating > 0
      ) {
        // Calculate number of soldiers needed for Soul Forge
        let base = game.global.race["warlord"] ? 400 : 650;
        let soulForgeSoldiers = Math.round(base / soldierRating);

        // Adjust for gun emplacements
        if (buildings.PitGunEmplacement.count > 0) {
          soulForgeSoldiers -= Math.floor(
            buildings.PitGunEmplacement.stateOnCount * 1.5,
          );
          soulForgeSoldiers = Math.max(1, soulForgeSoldiers);
        }

        soldiers += soulForgeSoldiers;
      }

      // Guardposts need at least one soldier free so lets just always keep one handy
      if (buildings.RuinsGuardPost.count > 0) {
        soldiers +=
          (buildings.RuinsGuardPost.stateOnCount + 1) *
          traitVal("high_pop", 0, 1);
      }
      return soldiers;
    },

    setTactic(newTactic) {
      let currentTactic = game.global.civic.garrison.tactic;
      for (let i = currentTactic; i < newTactic; i++) {
        this._garrisonVue.next();
      }
      for (let i = currentTactic; i > newTactic; i--) {
        this._garrisonVue.last();
      }
    },

    getCampaignTitle(tactic) {
      return this._garrisonVue.$options.filters.tactics(tactic);
    },

    addBattalion(count) {
      for (let m of KeyManager.click(count)) {
        this._garrisonVue.aNext();
      }

      this.raid = Math.min(this.raid + count, this.currentCityGarrison);
    },

    removeBattalion(count) {
      for (let m of KeyManager.click(count)) {
        this._garrisonVue.aLast();
      }

      this.raid = Math.max(this.raid - count, 0);
    },

    getGovArmy(tactic, govIndex) {
      // function battleAssessment(gov)
      let enemy = [5, 27.5, 62.5, 125, 300][tactic];
      if (game.global.race["banana"]) {
        enemy *= 2;
      }
      if (game.global.city.biome === "swamp") {
        enemy *= 1.4;
      }
      return (enemy * getGovPower(govIndex)) / 100;
    },

    getAdvantage(army, tactic, govIndex) {
      return (1 - this.getGovArmy(tactic, govIndex) / army) * 100;
    },

    getRatingForAdvantage(adv, tactic, govIndex) {
      return this.getGovArmy(tactic, govIndex) / (1 - adv / 100);
    },

    getSoldiersForAdvantage(advantage, tactic, govIndex) {
      return this.getSoldiersForAttackRating(
        this.getRatingForAdvantage(advantage, tactic, govIndex),
      );
    },

    // Calculates the required soldiers to reach the given attack rating, assuming everyone is healthy.
    getSoldiersForAttackRating(targetRating) {
      if (!targetRating || targetRating <= 0) {
        return 0;
      }
      // Getting the rating for 10 soldiers and dividing it by number of soldiers, to get more accurate value after rounding
      let singleSoldierAttackRating = game.armyRating(10, "army", 0) / 10;
      let maxSoldiers = Math.ceil(targetRating / singleSoldierAttackRating);
      if (!game.global.race["hivemind"]) {
        return maxSoldiers;
      }

      // Ok, we've done no hivemind. Hivemind is trickier because each soldier gives attack rating and a bonus to all other soldiers.
      // I'm sure there is an exact mathematical calculation for this but...
      // Just loop through and remove 1 at a time until we're under the max rating.

      let hiveSize = traitVal("hivemind", 0);
      if (maxSoldiers < hiveSize) {
        maxSoldiers = Math.min(hiveSize, maxSoldiers / (1 - hiveSize * 0.05));
      }

      while (
        maxSoldiers > 1 &&
        game.armyRating(maxSoldiers - 1, "army", 0) > targetRating
      ) {
        maxSoldiers--;
      }

      return maxSoldiers;
    },

    addHellGarrison(count) {
      for (let m of KeyManager.click(count)) {
        this._hellVue.aNext();
      }

      this.hellSoldiers = Math.min(this.hellSoldiers + count, this.workers);
      this.hellAssigned = this.hellSoldiers;
    },

    removeHellGarrison(count) {
      for (let m of KeyManager.click(count)) {
        this._hellVue.aLast();
      }

      let min =
        this.hellPatrols * this.hellPatrolSize + this.hellReservedSoldiers;
      this.hellSoldiers = Math.max(this.hellSoldiers - count, min);
      this.hellAssigned = this.hellSoldiers;
    },

    addHellPatrol(count) {
      for (let m of KeyManager.click(count)) {
        this._hellVue.patInc();
      }

      if (this.hellPatrols * this.hellPatrolSize < this.hellSoldiers) {
        this.hellPatrols += count;
        if (this.hellSoldiers < this.hellPatrols * this.hellPatrolSize) {
          this.hellPatrols = Math.floor(
            this.hellSoldiers / this.hellPatrolSize,
          );
        }
      }
    },

    removeHellPatrol(count) {
      for (let m of KeyManager.click(count)) {
        this._hellVue.patDec();
      }

      this.hellPatrols = Math.max(this.hellPatrols - count, 0);
    },

    addHellPatrolSize(count) {
      for (let m of KeyManager.click(count)) {
        this._hellVue.patSizeInc();
      }

      if (this.hellPatrolSize < this.hellSoldiers) {
        this.hellPatrolSize += count;
        if (this.hellSoldiers < this.hellPatrols * this.hellPatrolSize) {
          this.hellPatrols = Math.floor(
            this.hellSoldiers / this.hellPatrolSize,
          );
        }
      }
    },

    removeHellPatrolSize(count) {
      for (let m of KeyManager.click(count)) {
        this._hellVue.patSizeDec();
      }

      this.hellPatrolSize = Math.max(this.hellPatrolSize - count, 1);
    },

    attackEnemyFortress(enemyIndex) {
      // Validate the enemy index
      if (
        enemyIndex < 0 ||
        enemyIndex >= game.global.portal.throne.enemy.length
      ) {
        return false;
      }

      // Get the Vue instance for the enemy fortress
      let fortVue = getVueById("fort");
      if (!fortVue) {
        return false;
      }

      // Call the attack method with the enemy index
      try {
        fortVue.attack(enemyIndex);
        return true;
      } catch (error) {
        console.error("Failed to attack enemy fortress:", error);
        return false;
      }
    },
  };

  var FleetManagerOuter = {
    _fleetVueBinding: "shipPlans",
    _fleetVue: undefined,
    _explorerBlueprint: {
      class: "explorer",
      armor: "neutronium",
      weapon: "railgun",
      engine: "emdrive",
      power: "elerium",
      sensor: "quantum",
    },

    nextShipName: null,
    nextShipCost: null,
    nextShipAffordable: null,
    nextShipExpandable: null,
    nextShipMsg: null,

    WeaponPower: {
      railgun: 36,
      laser: 64,
      p_laser: 54,
      plasma: 90,
      phaser: 114,
      disruptor: 156,
    },
    SensorRange: { visual: 1, radar: 20, lidar: 35, quantum: 60 },
    ClassPower: {
      corvette: 1,
      frigate: 1.5,
      destroyer: 2.75,
      cruiser: 5.5,
      battlecruiser: 10,
      dreadnought: 22,
      explorer: 1.2,
    },
    ClassCrew: {
      corvette: 2,
      frigate: 3,
      destroyer: 4,
      cruiser: 6,
      battlecruiser: 8,
      dreadnought: 10,
      explorer: 10,
    },

    // spc_dwarf is ignored, never having any syndicate
    Regions: [
      "spc_moon",
      "spc_red",
      "spc_gas",
      "spc_gas_moon",
      "spc_belt",
      "spc_titan",
      "spc_enceladus",
      "spc_triton",
      "spc_kuiper",
      "spc_eris",
    ],

    ShipConfig: {
      class: [
        "corvette",
        "frigate",
        "destroyer",
        "cruiser",
        "battlecruiser",
        "dreadnought",
        "explorer",
      ],
      power: ["solar", "diesel", "fission", "fusion", "elerium"],
      weapon: ["railgun", "laser", "p_laser", "plasma", "phaser", "disruptor"],
      armor: ["steel", "alloy", "neutronium"],
      engine: ["ion", "tie", "pulse", "photon", "vacuum", "emdrive"],
      sensor: ["visual", "radar", "lidar", "quantum"],
    },

    getWeighting(id) {
      return settings["fleet_outer_pr_" + id];
    },

    getMaxDefense(id) {
      return settings["fleet_outer_def_" + id];
    },

    getMaxScouts(id) {
      return settings["fleet_outer_sc_" + id];
    },

    getShipName(ship) {
      return game.loc(`outer_shipyard_class_${ship.class}`);
    },

    getLocName(loc) {
      let locRef =
        loc === "tauceti"
          ? game.loc("tech_era_tauceti")
          : game.actions.space[loc].info.name;
      return typeof locRef === "function" ? locRef() : locRef;
    },

    isUnlocked(id) {
      return id === "spc_moon" && game.global.race["orbit_decayed"]
        ? false
        : (game.actions.space[id].info.syndicate?.() ?? false);
    },

    updateNextShip(ship) {
      if (ship) {
        let cost = poly.shipCosts(ship);
        this.nextShipCost = cost;
        this.nextShipAffordable = true;
        this.nextShipExpandable = true;
        this.nextShipMsg = null;
        this.nextShipName = null;
        for (let res in cost) {
          if (resources[res].maxQuantity < cost[res]) {
            this.nextShipAffordable = false;
            if (!resources[res].hasStorage()) {
              this.nextShipExpandable = false;
            }
          }
        }
      } else {
        this.nextShipCost = null;
        this.nextShipAffordable = null;
        this.nextShipExpandable = null;
        this.nextShipMsg = null;
        this.nextShipName = null;
      }
    },

    initFleet() {
      if (
        !game.global.tech.syndicate ||
        !game.global.space.shipyard?.hasOwnProperty("blueprint")
      ) {
        return false;
      }

      this._fleetVue = getVueById(this._fleetVueBinding);
      if (this._fleetVue === undefined) {
        return false;
      }

      return true;
    },

    getFighterBlueprint() {
      return Object.fromEntries(
        Object.keys(this.ShipConfig).map((type) => [
          type,
          settings["fleet_outer_" + type],
        ]),
      );
    },

    getScoutBlueprint() {
      return Object.fromEntries(
        Object.keys(this.ShipConfig).map((type) => [
          type,
          settings["fleet_scout_" + type],
        ]),
      );
    },

    getMissingResource(ship) {
      let cost = poly.shipCosts(ship);
      for (let res in cost) {
        if (resources[res].currentQuantity < cost[res]) {
          return res;
        }
      }
      return null;
    },

    avail(ship) {
      let yard = game.global.space.shipyard;
      if (
        ship.class === "explorer" &&
        (ship.weapon !== "railgun" || ship.sensor !== "quantum")
      ) {
        return false;
      }
      for (let [type, part] of Object.entries(ship)) {
        if (
          type !== "name" &&
          yard.blueprint[type] !== part &&
          !(
            ship.class === "explorer" &&
            (part === "weapon" || part === "sensor")
          )
        ) {
          if (
            !this._fleetVue.avail(
              type,
              this.ShipConfig[type].indexOf(part),
              part,
            )
          ) {
            return false;
          }
        }
      }
      return true;
    },

    build(ship, region) {
      let yard = game.global.space.shipyard;
      for (let [type, part] of Object.entries(ship)) {
        if (
          type !== "name" &&
          (yard.blueprint[type] !== part ||
            ship.class === "explorer" ||
            yard.blueprint.class === "explorer")
        ) {
          this._fleetVue.setVal(type, part);
        }
      }
      if (this._fleetVue.powerText().includes("danger")) {
        return false;
      }

      let cost = poly.shipCosts(ship);
      for (let res in cost) {
        resources[res].currentQuantity -= cost[res];
      }

      if (yard.sort) {
        $("#shipPlans .b-checkbox").eq(1).click();
        this._fleetVue.build();
        getVueById("shipReg0")?.setLoc(region, yard.ships.length);
        $("#shipPlans .b-checkbox").eq(1).click();
      } else {
        this._fleetVue.build();
        getVueById("shipReg0")?.setLoc(region, yard.ships.length);
      }
      return true;
    },

    getShipAttackPower(ship) {
      return Math.round(
        this.WeaponPower[ship.weapon] * this.ClassPower[ship.class],
      );
    },

    shipCount(loc, template) {
      let count = 0;
      for (let ship of game.global.space.shipyard.ships) {
        if (
          ship.location === loc &&
          ship.class === template.class &&
          ship.power === template.power &&
          ship.weapon === template.weapon &&
          ship.armor === template.armor &&
          ship.engine === template.engine &&
          ship.sensor === template.sensor
        ) {
          count++;
        }
      }
      return count;
    },

    // export function syndicate(region,extra) from truepath.js with added "all" argument
    syndicate(region, extra, all) {
      if (
        !game.global.tech["syndicate"] ||
        !game.global.race["truepath"] ||
        !game.global.space.syndicate?.hasOwnProperty(region)
      ) {
        return extra ? { p: 1, r: 0, s: 0 } : 1;
      }
      let rivalRel = game.global.civic.foreign.gov3.hstl;
      let rival =
        rivalRel < 10
          ? 250 - 25 * rivalRel
          : rivalRel > 60
            ? -13 * (rivalRel - 60)
            : 0;

      let divisor = 1000;
      switch (region) {
        case "spc_home":
        case "spc_moon":
        case "spc_red":
        case "spc_hell":
          divisor = 1250 + rival;
          break;
        case "spc_gas":
        case "spc_gas_moon":
        case "spc_belt":
          divisor = 1020 + rival;
          break;
        case "spc_titan":
        case "spc_enceladus":
          divisor = !haveTech("triton")
            ? 600
            : game.actions.space[region].info.syndicate_cap();
          break;
        case "spc_triton":
        case "spc_kuiper":
        case "spc_eris":
          divisor = game.actions.space[region].info.syndicate_cap();
          break;
      }

      let piracy = game.global.space.syndicate[region];
      let patrol = 0;
      let sensor = 0;
      if (game.global.space.shipyard?.hasOwnProperty("ships")) {
        for (let ship of game.global.space.shipyard.ships) {
          if (
            ship.location === region &&
            ((ship.transit === 0 && ship.fueled) || all)
          ) {
            let rating = this.getShipAttackPower(ship);
            patrol +=
              ship.damage > 0
                ? Math.round((rating * (100 - ship.damage)) / 100)
                : rating;
            sensor += this.SensorRange[ship.sensor];
          }
        }

        if (region === "spc_enceladus") {
          patrol += buildings.EnceladusBase.stateOnCount * 50;
        } else if (region === "spc_titan") {
          patrol += buildings.TitanSAM.stateOnCount * 25;
        } else if (
          region === "spc_triton" &&
          buildings.TritonFOB.stateOnCount > 0
        ) {
          patrol += 500;
          sensor += 10;
        }

        if (sensor > 100) {
          sensor =
            Math.round(((sensor - 100) / (sensor - 100 + 200)) * 100) + 100;
        }

        patrol = Math.round(patrol * ((sensor + 25) / 125));
        piracy = piracy - patrol > 0 ? piracy - patrol : 0;
      }
      if (extra) {
        return {
          p: 1 - +(piracy / divisor).toFixed(4),
          r: piracy,
          s: sensor,
        };
      } else {
        return 1 - +(piracy / divisor).toFixed(4);
      }
    },
  };

  var FleetManager = {
    _fleetVueBinding: "fleet",
    _fleetVue: undefined,
    neededShips: null, // Per-ship on-counts needed for full piracy coverage, set by autoFleet when crew reclaim is active

    initFleet() {
      if (!game.global.tech.piracy) {
        return false;
      }

      this._fleetVue = getVueById(this._fleetVueBinding);
      if (this._fleetVue === undefined) {
        return false;
      }

      return true;
    },

    addShip(region, ship, count) {
      for (let m of KeyManager.click(count)) {
        this._fleetVue.add(region, ship);
      }
    },

    subShip(region, ship, count) {
      for (let m of KeyManager.click(count)) {
        this._fleetVue.sub(region, ship);
      }
    },
  };

  var MechManager = {
    _assemblyVueBinding: "mechAssembly",
    _assemblyVue: undefined,
    _listVueBinding: "mechList",
    _listVue: undefined,

    activeMechs: [],
    inactiveMechs: [],
    mechsPower: 0,
    mechsPotential: 0,
    isActive: false,
    saveSupply: false,

    stateHash: 0,
    bestSize: [],
    bestGems: [],
    bestSupply: [],
    bestMech: {},
    bestBody: {},
    bestWeapon: [],

    Size: ["small", "medium", "large", "titan", "collector"],
    Chassis: ["wheel", "tread", "biped", "quad", "spider", "hover"],
    Weapon: [
      "laser",
      "kinetic",
      "shotgun",
      "missile",
      "flame",
      "plasma",
      "sonic",
      "tesla",
    ],
    Equip: [
      "special",
      "shields",
      "sonar",
      "grapple",
      "infrared",
      "flare",
      "radiator",
      "coolant",
      "ablative",
      "stabilizer",
      "seals",
    ],

    SizeSlots: { small: 0, medium: 1, large: 2, titan: 4, collector: 2 },
    SizeWeapons: { small: 1, medium: 1, large: 2, titan: 4, collector: 0 },
    SmallChassisMod: {
      wheel: {
        sand: 0.9,
        swamp: 0.35,
        forest: 1,
        jungle: 0.92,
        rocky: 0.65,
        gravel: 1,
        muddy: 0.85,
        grass: 1.3,
        brush: 0.9,
        concrete: 1.1,
      },
      tread: {
        sand: 1.15,
        swamp: 0.55,
        forest: 1,
        jungle: 0.95,
        rocky: 0.65,
        gravel: 1.3,
        muddy: 0.88,
        grass: 1,
        brush: 1,
        concrete: 1,
      },
      biped: {
        sand: 0.78,
        swamp: 0.68,
        forest: 1,
        jungle: 0.82,
        rocky: 0.48,
        gravel: 1,
        muddy: 0.85,
        grass: 1.25,
        brush: 0.92,
        concrete: 1,
      },
      quad: {
        sand: 0.86,
        swamp: 0.58,
        forest: 1.25,
        jungle: 1,
        rocky: 0.95,
        gravel: 0.9,
        muddy: 0.68,
        grass: 1,
        brush: 0.95,
        concrete: 1,
      },
      spider: {
        sand: 0.75,
        swamp: 0.9,
        forest: 0.82,
        jungle: 0.77,
        rocky: 1.25,
        gravel: 0.86,
        muddy: 0.92,
        grass: 1,
        brush: 1,
        concrete: 1,
      },
      hover: {
        sand: 1,
        swamp: 1.35,
        forest: 0.65,
        jungle: 0.55,
        rocky: 0.82,
        gravel: 1,
        muddy: 1.15,
        grass: 1,
        brush: 0.78,
        concrete: 1,
      },
    },
    LargeChassisMod: {
      wheel: {
        sand: 0.85,
        swamp: 0.18,
        forest: 1,
        jungle: 0.85,
        rocky: 0.5,
        gravel: 0.95,
        muddy: 0.58,
        grass: 1.2,
        brush: 0.8,
        concrete: 1,
      },
      tread: {
        sand: 1.1,
        swamp: 0.4,
        forest: 0.95,
        jungle: 0.9,
        rocky: 0.5,
        gravel: 1.2,
        muddy: 0.72,
        grass: 1,
        brush: 1,
        concrete: 1,
      },
      biped: {
        sand: 0.65,
        swamp: 0.5,
        forest: 0.95,
        jungle: 0.7,
        rocky: 0.4,
        gravel: 1,
        muddy: 0.7,
        grass: 1.2,
        brush: 0.85,
        concrete: 1,
      },
      quad: {
        sand: 0.75,
        swamp: 0.42,
        forest: 1.2,
        jungle: 1,
        rocky: 0.9,
        gravel: 0.8,
        muddy: 0.5,
        grass: 0.95,
        brush: 0.9,
        concrete: 1,
      },
      spider: {
        sand: 0.65,
        swamp: 0.78,
        forest: 0.75,
        jungle: 0.65,
        rocky: 1.2,
        gravel: 0.75,
        muddy: 0.82,
        grass: 1,
        brush: 0.95,
        concrete: 1,
      },
      hover: {
        sand: 1,
        swamp: 1.2,
        forest: 0.48,
        jungle: 0.35,
        rocky: 0.68,
        gravel: 1,
        muddy: 1.08,
        grass: 1,
        brush: 0.7,
        concrete: 1,
      },
    },
    StatusMod: {
      freeze: (mech) => (!mech.equip.includes("radiator") ? 0.25 : 1),
      hot: (mech) => (!mech.equip.includes("coolant") ? 0.25 : 1),
      corrosive: (mech) =>
        !mech.equip.includes("ablative")
          ? mech.equip.includes("shields")
            ? 0.75
            : 0.25
          : 1,
      humid: (mech) => (!mech.equip.includes("seals") ? 0.75 : 1),
      windy: (mech) => (mech.chassis === "hover" ? 0.5 : 1),
      hilly: (mech) => (mech.chassis !== "spider" ? 0.75 : 1),
      mountain: (mech) =>
        mech.chassis !== "spider" && !mech.equip.includes("grapple")
          ? mech.equip.includes("flare")
            ? 0.75
            : 0.5
          : 1,
      radioactive: (mech) => (!mech.equip.includes("shields") ? 0.5 : 1),
      quake: (mech) => (!mech.equip.includes("stabilizer") ? 0.25 : 1),
      dust: (mech) => (!mech.equip.includes("seals") ? 0.5 : 1),
      river: (mech) => (mech.chassis !== "hover" ? 0.65 : 1),
      tar: (mech) =>
        mech.chassis !== "quad"
          ? mech.chassis === "tread" || mech.chassis === "wheel"
            ? 0.5
            : 0.75
          : 1,
      steam: (mech) => (!mech.equip.includes("shields") ? 0.75 : 1),
      flooded: (mech) => (mech.chassis !== "hover" ? 0.35 : 1),
      fog: (mech) => (!mech.equip.includes("sonar") ? 0.2 : 1),
      rain: (mech) => (!mech.equip.includes("seals") ? 0.75 : 1),
      hail: (mech) =>
        !mech.equip.includes("ablative") && !mech.equip.includes("shields")
          ? 0.75
          : 1,
      chasm: (mech) => (!mech.equip.includes("grapple") ? 0.1 : 1),
      dark: (mech) =>
        !mech.equip.includes("infrared")
          ? mech.equip.includes("flare")
            ? 0.25
            : 0.1
          : 1,
      gravity: (mech) =>
        mech.size === "titan"
          ? 0.25
          : mech.size === "large"
            ? 0.45
            : mech.size === "medium"
              ? 0.8
              : 1,
    },

    get collectorValue() {
      // Collectors power mod. Higher number - more often they'll be scrapped. Default value derieved from scout: 20000 = collectorBaseIncome / (scoutPower / scoutSize), to equalize relative values of collectors and combat mechs with same efficiency.
      return 20000 / Math.max(settings.mechCollectorValue, 0.000001);
    },

    mechObserver: new MutationObserver(() => {
      updateDebugData(); // Observer can be can be called at any time, make sure we have actual data
      createMechInfo();
    }),

    updateSpire() {
      let oldHash = this.stateHash;
      this.stateHash =
        0 +
        game.global.portal.spire.count +
        game.global.blood.prepared +
        game.global.blood.wrath +
        game.global.portal.mechbay.scouts * 1e7 +
        (settings.mechSpecial ? 1e14 : 0) +
        (settings.mechInfernalCollector ? 1e15 : 0) +
        settings.mechCollectorValue;

      return this.stateHash !== oldHash;
    },

    initLab() {
      // TODO: Warlord is not supported yet and breaks a bunch of things, remove when support is implemented
      if (game.global.race["warlord"]) {
        return false;
      }
      if (buildings.SpireMechBay.count < 1) {
        return false;
      }
      this._assemblyVue = getVueById(this._assemblyVueBinding);
      if (this._assemblyVue === undefined) {
        return false;
      }
      this._listVue = getVueById(this._listVueBinding);
      if (this._listVue === undefined) {
        return false;
      }

      this.activeMechs = [];
      this.inactiveMechs = [];
      this.mechsPower = 0;

      let mechBay = game.global.portal.mechbay;
      for (let i = 0; i < mechBay.mechs.length; i++) {
        let mech = {
          id: i,
          ...mechBay.mechs[i],
          ...this.getMechStats(mechBay.mechs[i]),
        };
        if (i < mechBay.active) {
          this.activeMechs.push(mech);
          if (mech.size !== "collector") {
            this.mechsPower += mech.power;
          }
        } else {
          this.inactiveMechs.push(mech);
        }
      }

      if (this.updateSpire()) {
        this.isActive = true;

        this.updateBestWeapon();
        this.Size.forEach((size) => {
          this.updateBestBody(size);
          this.bestMech[size] = this.getRandomMech(size);
        });
        let sortBy = (prop) =>
          Object.values(this.bestMech)
            .filter((m) => m.size !== "collector")
            .sort((a, b) => b[prop] - a[prop])
            .map((m) => m.size);

        this.bestSize = sortBy("efficiency");
        this.bestGems = sortBy("gems_eff");
        this.bestSupply = sortBy("supply_eff");

        // Redraw added label of Mech Lab after change of floor
        createMechInfo();
      }

      let bestMech = this.bestMech[this.bestSize[0]];
      this.mechsPotential =
        this.mechsPower /
          (((buildings.SpireMechBay.count * 25) / this.getMechSpace(bestMech)) *
            bestMech.power) || 0;

      return true;
    },

    getBodyMod(mech) {
      let floor = game.global.portal.spire;
      let terrainFactor =
        mech.size === "small" || mech.size === "medium"
          ? this.SmallChassisMod[mech.chassis][floor.type]
          : this.LargeChassisMod[mech.chassis][floor.type];

      let rating = poly.terrainRating(
        mech,
        terrainFactor,
        Object.keys(floor.status),
      );
      for (let effect in floor.status) {
        rating *= this.StatusMod[effect](mech);
      }
      return rating;
    },

    getWeaponMod(mech) {
      let weapons = poly.monsters[game.global.portal.spire.boss].weapon;
      let rating = 0;
      for (let i = 0; i < mech.hardpoint.length; i++) {
        rating += poly.weaponPower(mech, weapons[mech.hardpoint[i]]);
      }
      return rating;
    },

    getSizeMod(mech, concrete) {
      let isConcrete = concrete ?? game.global.portal.spire.type === "concrete";
      switch (mech.size) {
        case "small":
          return 0.0025 * (isConcrete ? 0.92 : 1);
        case "medium":
          return 0.0075 * (isConcrete ? 0.95 : 1);
        case "large":
          return 0.01;
        case "titan":
          return 0.012 * (isConcrete ? 1.25 : 1);
        case "collector": // For collectors we're calculating supply rate
          return 25 / this.collectorValue;
      }
      return 0;
    },

    getProgressMod() {
      let mod = 1;
      if (game.global.stats.achieve.gladiator?.l > 0) {
        mod *= 1 + game.global.stats.achieve.gladiator.l * 0.2;
      }
      if (game.global.blood["wrath"]) {
        mod *= 1 + game.global.blood.wrath / 20;
      }
      mod /= game.global.portal.spire.count;

      return mod;
    },

    getPreferredSize() {
      let mechBay = game.global.portal.mechbay;
      if (
        settings.mechFillBay &&
        mechBay.max % 1 === 0 &&
        (game.global.blood.prepared >= 2
          ? mechBay.bay % 2 !== mechBay.max % 2
          : mechBay.max - mechBay.bay === 1)
      ) {
        return ["collector", true]; // One collector to fill odd bay
      }

      if (
        resources.Supply.storageRatio < 0.9 &&
        resources.Supply.rateOfChange < settings.mechMinSupply
      ) {
        let collectorsCount = this.activeMechs.filter(
          (mech) => mech.size === "collector",
        ).length;
        if (collectorsCount / mechBay.max < settings.mechMaxCollectors) {
          return ["collector", true]; // Bootstrap income
        }
      }

      if ((mechBay.scouts * 2) / mechBay.max < settings.mechScouts) {
        return ["small", true]; // Build scouts up to configured ratio
      }

      let floorSize = game.global.portal.spire.status.gravity
        ? settings.mechSizeGravity
        : settings.mechSize;
      if (
        this.Size.includes(floorSize) &&
        (!settings.mechFillBay ||
          poly.mechCost(floorSize).c <= resources.Supply.maxQuantity)
      ) {
        return [floorSize, false]; // This floor have configured size
      }
      let mechPriority =
        floorSize === "gems"
          ? this.bestGems
          : floorSize === "supply"
            ? this.bestSupply
            : this.bestSize;

      for (let i = 0; i < mechPriority.length; i++) {
        let mechSize = mechPriority[i];
        let { s, c } = poly.mechCost(mechSize);
        if (
          resources.Soul_Gem.spareQuantity >= s &&
          resources.Supply.maxQuantity >= c
        ) {
          return [mechSize, false]; // Affordable mech for auto size
        }
      }

      return ["titan", false]; // Just a stub, if auto size couldn't pick anything
    },

    getMechStats(mech) {
      let rating = this.getBodyMod(mech);
      if (mech.size !== "collector") {
        // Collectors doesn't have weapons
        rating *= this.getWeaponMod(mech);
      }
      let power = rating * this.getSizeMod(mech) * (mech.infernal ? 1.25 : 1);
      let [gem, supply, space] = this.getMechCost(mech);
      let [gemRef, supplyRef] = this.getMechRefund(mech);
      return {
        power: power,
        efficiency: power / space,
        gems_eff: power / (gem - gemRef),
        supply_eff: power / (supply - supplyRef),
      };
    },

    getTimeToClear() {
      return this.mechsPower > 0
        ? (100 - game.global.portal.spire.progress) /
            (this.mechsPower * this.getProgressMod())
        : Number.MAX_SAFE_INTEGER;
    },

    updateBestBody(size) {
      let currentBestBodyMod = 0;
      let currentBestBodyList = [];

      let equipmentSlots =
        this.SizeSlots[size] +
        (game.global.blood.prepared ? 1 : 0) -
        (settings.mechSpecial === "always" ? 1 : 0);
      let equipOptions =
        settings.mechSpecial === "always" || settings.mechSpecial === "never"
          ? this.Equip.slice(1)
          : this.Equip;
      let infernal =
        settings.mechInfernalCollector &&
        size === "collector" &&
        game.global.blood.prepared >= 3;

      k_combinations(equipOptions, equipmentSlots).forEach((equip) => {
        this.Chassis.forEach((chassis) => {
          let mech = {
            size: size,
            chassis: chassis,
            equip: equip,
            infernal: infernal,
          };
          let mechMod = this.getBodyMod(mech);
          if (mechMod > currentBestBodyMod) {
            currentBestBodyMod = mechMod;
            currentBestBodyList = [mech];
          } else if (mechMod === currentBestBodyMod) {
            currentBestBodyList.push(mech);
          }
        });
      });

      if (settings.mechSpecial === "always" && equipmentSlots >= 0) {
        currentBestBodyList.forEach((mech) => mech.equip.unshift("special"));
      }
      if (settings.mechSpecial === "prefered") {
        let specialEquip = currentBestBodyList.filter((mech) =>
          mech.equip.includes("special"),
        );
        if (specialEquip.length > 0) {
          currentBestBodyList = specialEquip;
        }
      }
      /* TODO: Not really sure how to utilize it for good: it does find good and bad mech compositions, but using only good ones can backfire on unlucky consequent floors, and there won't big enough amount of mech to use weighted random
            currentBestBodyList.forEach(mech => {
                mech.weigthing = Object.values(this.StatusMod)
                  .reduce((sum, mod) => sum + mod(mech), 0);
            });
            */
      this.bestBody[size] = currentBestBodyList;
    },

    updateBestWeapon() {
      let bestMod = 0;
      let list = poly.monsters[game.global.portal.spire.boss].weapon;
      for (let weapon of MechManager.Weapon) {
        let mod = list[weapon];
        if (mod > bestMod) {
          bestMod = mod;
          this.bestWeapon = [weapon];
        } else if (mod === bestMod) {
          this.bestWeapon.push(weapon);
        }
      }
    },

    getRandomMech(size) {
      let randomBody =
        this.bestBody[size][
          Math.floor(Math.random() * this.bestBody[size].length)
        ];
      let randomWeapon =
        this.bestWeapon[Math.floor(Math.random() * this.bestWeapon.length)];
      let weaponsAmount = this.SizeWeapons[size];
      let mech = {
        hardpoint: new Array(weaponsAmount).fill(randomWeapon),
        ...randomBody,
      };
      return { ...mech, ...this.getMechStats(mech) };
    },

    getMechSpace(mech, prep) {
      switch (mech.size) {
        case "small":
          return 2;
        case "medium":
          return (prep ?? game.global.blood.prepared) >= 2 ? 4 : 5;
        case "large":
          return (prep ?? game.global.blood.prepared) >= 2 ? 8 : 10;
        case "titan":
          return (prep ?? game.global.blood.prepared) >= 2 ? 20 : 25;
        case "collector":
          return 1;
      }
      return Number.MAX_SAFE_INTEGER;
    },

    getMechCost(mech, prep) {
      let { s, c } = poly.mechCost(mech.size, mech.infernal, prep);
      return [s, c, this.getMechSpace(mech, prep)];
    },

    getMechRefund(mech, prep) {
      let { s, c } = poly.mechCost(mech.size, mech.infernal, prep);
      return [Math.floor(s / 2), Math.floor(c / 3)];
    },

    mechDesc(mech) {
      // (${mech.hardpoint.map(id => game.loc("portal_mech_weapon_" + id)).join(", ")}) [${mech.equip.map(id => game.loc("portal_mech_equip_" + id)).join(", ")}]
      let rating = mech.power / this.bestMech[mech.size].power;
      return `${game.loc("portal_mech_size_" + mech.size)} ${game.loc(
        "portal_mech_chassis_" + mech.chassis,
      )} (${Math.round(rating * 100)}%)`;
    },

    buildMech(mech) {
      this._assemblyVue.b.infernal = mech.infernal;
      this._assemblyVue.setSize(mech.size);
      this._assemblyVue.setType(mech.chassis);
      for (let i = 0; i < mech.hardpoint.length; i++) {
        this._assemblyVue.setWep(mech.hardpoint[i], i);
      }
      for (let i = 0; i < mech.equip.length; i++) {
        this._assemblyVue.setEquip(mech.equip[i], i);
      }
      this._assemblyVue.build();
      GameLog.logSuccess(
        "mech_build",
        `${this.mechDesc(mech)} mech has been assembled.`,
        ["hell"],
      );
    },

    scrapMech(mech) {
      this._listVue.scrap(mech.id);
    },

    dragMech(oldId, newId) {
      let sortObj = {
        oldDraggableIndex: oldId,
        newDraggableIndex: newId,
        from: { querySelectorAll: () => [], insertBefore: () => false },
      };
      if (needSandboxBypass) {
        // Yet another FF fix
        win.Sortable.get(this._listVue.$el).options.onEnd(
          cloneInto(sortObj, unsafeWindow, { cloneFunctions: true }),
        );
      } else {
        Sortable.get(this._listVue.$el).options.onEnd(sortObj);
      }
    },
  };

  var JobManager = {
    priorityList: [],
    craftingJobs: [],

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      let ret = [];
      if (settings.autoJobs) {
        ret = this.priorityList.filter((job) => job.isManaged());
      }
      if (settings.autoCraftsmen) {
        ret = ret.concat(this.craftingJobs.filter((job) => job.isManaged()));
      }
      return ret;
    },

    servantsMax() {
      if (!game.global.race.servants) {
        return 0;
      }

      let max = game.global.race.servants.max;
      for (let job of this.priorityList) {
        if (job.is.serve && !job.isManaged()) {
          max -= job.servants;
        }
      }
      return max;
    },

    skilledServantsMax() {
      if (!game.global.race.servants) {
        return 0;
      }

      let max = game.global.race.servants.smax;
      for (let job of this.craftingJobs) {
        if (!job.isManaged()) {
          max -= job.servants;
        }
      }
      return max;
    },

    craftingMax() {
      if (!game.global.city.foundry) {
        return 0;
      }

      let max = game.global.civic.craftsman.max;
      for (let job of this.craftingJobs) {
        if (!job.isManaged()) {
          max -= job.count;
        }
      }
      // Thermite is ignored by script, let's pretend it's not exists
      max -= game.global.city.foundry.Thermite ?? 0;
      return max;
    },
  };

  var BuildingManager = {
    priorityList: [],
    statePriorityList: [],

    updateBuildings() {
      for (let building of Object.values(buildings)) {
        building.updateResourceRequirements();
        building.extraDescription = "";
      }
    },

    updateWeighting() {
      // Check generic conditions, and multiplier - x1 have no effect, so skip them too.
      let activeRules = weightingRules.filter(
        (rule) => rule[wrGlobalCondition]() && rule[wrMultiplier]() !== 1,
      );

      // Iterate over buildings
      for (let building of this.priorityList) {
        building.weighting = building._weighting;

        // Apply weighting rules
        for (let j = 0; j < activeRules.length; j++) {
          let result = activeRules[j][wrIndividualCondition](building);
          // Rule passed
          if (result) {
            let note = activeRules[j][wrDescription](result, building);
            if (note !== "") {
              building.extraDescription += note + "<br>";
            }
            building.weighting *= activeRules[j][wrMultiplier](result);

            // Last rule disabled building, no need to check the rest
            if (building.weighting <= 0) {
              break;
            }
          }
        }
        if (building.weighting > 0) {
          building.weighting = Math.max(
            Number.MIN_VALUE,
            building.weighting - 1e-7 * building.count,
          );
          building.extraDescription =
            "AutoBuild weighting: " +
            getNiceNumber(building.weighting) +
            "<br>" +
            building.extraDescription;
        }
      }
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
      this.statePriorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      return this.priorityList.filter((building) => building.weighting > 0);
    },

    managedStatePriorityList() {
      return this.statePriorityList.filter(
        (building) =>
          building.hasState() &&
          building.autoStateEnabled &&
          building.count > 0,
      );
    },
  };

  var ProjectManager = {
    priorityList: [],

    updateProjects() {
      for (let project of this.priorityList) {
        project.updateResourceRequirements();
        project.extraDescription = "";
      }
    },

    updateWeighting() {
      // Iterate over projects
      for (let project of this.priorityList) {
        project.weighting = project._weighting * project.currentStep;

        if (!project.isUnlocked()) {
          project.weighting = 0;
          project.extraDescription = "Locked<br>";
        }
        if (!project.autoBuildEnabled || !settings.autoARPA) {
          project.weighting = 0;
          project.extraDescription = "AutoBuild disabled<br>";
        }
        if (
          project.count >= project.autoMax &&
          (project !== projects.ManaSyphon || !isPrestigeAllowed("vacuum"))
        ) {
          project.weighting = 0;
          project.extraDescription = "Maximum amount reached<br>";
        }
        if (settings.prestigeMADIgnoreArpa && isEarlyGame()) {
          project.weighting = 0;
          project.extraDescription = "Projects ignored Pre-MAD<br>";
        }
        if (state.queuedTargets.includes(project)) {
          project.weighting = 0;
          project.extraDescription = "Queued project, processing...<br>";
        }
        if (state.triggerTargets.includes(project)) {
          project.weighting = 0;
          project.extraDescription = "Active trigger, processing...<br>";
        }
        if (!project.isAffordable(true)) {
          project.weighting = 0;
          project.extraDescription = "Not enough storage<br>";
        }
        if (
          project === projects.ManaSyphon &&
          settings.prestigeBioseedConstruct &&
          settings.prestigeType !== "vacuum" &&
          game.global.race["witch_hunter"]
        ) {
          project.weighting = 0;
          project.extraDescription = "Not needed for current prestige<br>";
        }
        if (
          project.weighting > 0 &&
          settings.achievementGuards &&
          settings.guardBananaRepublic &&
          game.global.race["banana"] &&
          project === projects.Monument &&
          !bananaRepublicObjectiveComplete("b5")
        ) {
          project.weighting *= settings.buildingWeightingBananaObjective;
          project.extraDescription += "Banana Republic objective<br>";
        }
        if (
          project.weighting > 0 &&
          inflationChallengeAssistActive() &&
          project === projects.StockExchange
        ) {
          project.weighting *= settings.buildingWeightingInflationMoney;
          project.extraDescription += "Inflation challenge Money helper<br>";
        }

        if (settings.arpaScaleWeighting) {
          project.weighting /= 1 - 0.01 * project.progress;
        }
        if (project.weighting > 0) {
          project.extraDescription = `AutoARPA weighting: ${getNiceNumber(
            project.weighting,
          )} (${project.currentStep}%)<br>${project.extraDescription}`;
        }
      }
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      return this.priorityList.filter((project) => project.weighting > 0);
    },
  };

  var TriggerManager = {
    priorityList: [],
    targetTriggers: [],

    resetTargetTriggers() {
      this.targetTriggers = [];
      for (let trigger of this.priorityList) {
        trigger.updateComplete();
        if (
          !trigger.complete &&
          trigger.areRequirementsMet() &&
          trigger.isActionPossible() &&
          !this.actionConflicts(trigger)
        ) {
          this.targetTriggers.push(trigger);
        }
      }
    },

    getTrigger(seq) {
      return this.priorityList.find((trigger) => trigger.seq === seq);
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    AddTrigger(
      requirementType,
      requirementId,
      requirementCount,
      actionType,
      actionId,
      actionCount,
    ) {
      let trigger = new Trigger(
        this.priorityList.length,
        this.priorityList.length,
        requirementType,
        requirementId,
        requirementCount,
        actionType,
        actionId,
        actionCount,
      );
      this.priorityList.push(trigger);
      return trigger;
    },

    AddTriggerFromSetting(raw) {
      let existingSequence = this.priorityList.some(
        (trigger) => trigger.seq === raw.seq,
      );
      if (!existingSequence) {
        let trigger = new Trigger(
          raw.seq,
          raw.priority,
          raw.requirementType,
          raw.requirementId,
          raw.requirementCount,
          raw.actionType,
          raw.actionId,
          raw.actionCount,
        );
        this.priorityList.push(trigger);
      }
    },

    RemoveTrigger(seq) {
      let indexToRemove = this.priorityList.findIndex(
        (trigger) => trigger.seq === seq,
      );

      if (indexToRemove === -1) {
        return;
      }

      this.priorityList.splice(indexToRemove, 1);

      for (let i = 0; i < this.priorityList.length; i++) {
        let trigger = this.priorityList[i];
        trigger.seq = i;
        trigger.priority = i;
      }
    },

    DuplicateTrigger(seq) {
      let indexToDuplicate = this.priorityList.findIndex(
        (trigger) => trigger.seq === seq,
      );

      if (indexToDuplicate === -1) {
        return;
      }

      let triggerToDuplicate = this.priorityList[indexToDuplicate];
      let trigger = new Trigger(
        0,
        0,
        triggerToDuplicate.requirementType,
        triggerToDuplicate.requirementId,
        triggerToDuplicate.requirementCount,
        triggerToDuplicate.actionType,
        triggerToDuplicate.actionId,
        triggerToDuplicate.actionCount,
      );
      this.priorityList.splice(indexToDuplicate, 0, trigger);

      for (let i = 0; i < this.priorityList.length; i++) {
        let trigger = this.priorityList[i];
        trigger.seq = i;
        trigger.priority = i;
      }
    },

    EvalizeTrigger(seq) {
      let indexToEval = this.priorityList.findIndex(
        (trigger) => trigger.seq === seq,
      );

      if (indexToEval === -1) {
        return;
      }

      let trigger = this.priorityList[indexToEval];

      let check = "";
      switch (trigger.requirementType) {
        case "Eval":
          check = trigger.requirementId;
          break;
        default:
          check = `_("${trigger.requirementType}",${JSON.stringify(
            trigger.requirementId,
          )})`;
      }

      win.prompt("Eval of this condition:", check);
    },

    // This function only checks if two triggers use the same resource, it does not check storage
    actionConflicts(trigger) {
      for (let targetTrigger of this.targetTriggers) {
        if (
          Object.keys(targetTrigger.cost()).some((cost) =>
            Object.keys(trigger.cost()).includes(cost),
          )
        ) {
          return true;
        }
      }

      return false;
    },
  };

  var WindowManager = {
    openedByScript: false,
    _callbackWindowTitle: "",
    _callbackFunction: null,

    currentModalWindowTitle() {
      let modalTitleNode = document.getElementById("modalBoxTitle");
      if (modalTitleNode === null) {
        return "";
      }

      // Modal title will either be a single name or a combination of resource and storage
      // eg. single name "Smelter" or "Factory"
      // eg. combination "Iridium - 26.4K/279.9K"
      let indexOfDash = modalTitleNode.textContent.indexOf(" - ");
      if (indexOfDash === -1) {
        return modalTitleNode.textContent;
      } else {
        return modalTitleNode.textContent.substring(0, indexOfDash);
      }
    },

    openModalWindowWithCallback(
      elementToClick,
      callbackWindowTitle,
      callbackFunction,
    ) {
      if (this.isOpen()) {
        return;
      }

      this.openedByScript = true;
      this._callbackWindowTitle = callbackWindowTitle;
      this._callbackFunction = callbackFunction;
      elementToClick.click();
    },

    isOpen() {
      // Checks both the game modal window and our script modal window
      // game = modalBox
      // script = scriptModal
      return (
        this.openedByScript ||
        document.getElementById("modalBox") !== null ||
        document.getElementById("scriptModal")?.style.display === "block"
      );
    },

    checkCallbacks() {
      // We only care if the script itself opened the modal. If the user did it then ignore it.
      // There must be a call back function otherwise there is nothing to do.
      if (
        WindowManager.currentModalWindowTitle() ===
          WindowManager._callbackWindowTitle &&
        WindowManager.openedByScript &&
        WindowManager._callbackFunction
      ) {
        WindowManager._callbackFunction();

        let modalCloseBtn = document.querySelector(".modal .modal-close");
        if (modalCloseBtn !== null) {
          modalCloseBtn.click();
        }
      } else {
        // If we hid users's modal - show it back
        let modal = document.querySelector(".modal");
        if (modal !== null) {
          modal.style.display = "";
        }
      }

      WindowManager.openedByScript = false;
      WindowManager._callbackWindowTitle = "";
      WindowManager._callbackFunction = null;
    },
  };

  var KeyManager = {
    _setFn: null,
    _unsetFn: null,
    _allFn: null,
    _eventProp: {
      Shift: "shiftKey",
      Control: "ctrlKey",
      Alt: "altKey",
      Meta: "metaKey",
    },
    _state: { x100: undefined, x25: undefined, x10: undefined },
    _mode: "none",

    init() {
      let events = win.$._data(win.document).events;
      let set = events?.keydown?.[0]?.handler ?? null;
      let unset = events?.keyup?.[0]?.handler ?? null;
      let all = events?.mousemove?.[0]?.handler ?? null;

      if (!all && (!set || !unset)) {
        // Fallback, if there's no handlers in JQuery data
        this._setFn = (e) =>
          document.dispatchEvent(new KeyboardEvent("keydown", e));
        this._unsetFn = (e) =>
          document.dispatchEvent(new KeyboardEvent("keyup", e));
        this._allFn = null;
      } else if (needSandboxBypass) {
        // FF fix
        this._setFn = (e) => set(cloneInto(e, unsafeWindow));
        this._unsetFn = (e) => unset(cloneInto(e, unsafeWindow));
        this._allFn = (e) => all(cloneInto(e, unsafeWindow));
      } else {
        this._setFn = set;
        this._unsetFn = unset;
        this._allFn = all;
      }
    },

    reset() {
      this._state.x100 = undefined;
      this._state.x25 = undefined;
      this._state.x10 = undefined;

      let map = game.global.settings.keyMap;
      let keys = Object.values(map);
      let uniq = ["x100", "x25", "x10"].every(
        (key) => keys.indexOf(map[key]) === keys.lastIndexOf(map[key]),
      );

      if (!game.global.settings.mKeys) {
        this._mode = "none";
      } else if (!uniq) {
        this._mode = "unset";
      } else if (
        this._allFn &&
        ["x100", "x25", "x10"].every((key) =>
          ["Shift", "Control", "Alt", "Meta"].includes(
            game.global.settings.keyMap[key],
          ),
        )
      ) {
        this._mode = "all";
      } else {
        this._mode = "each";
      }
    },

    finish() {
      if (this._state.x100 || this._state.x25 || this._state.x10) {
        this.set(false, false, false);
      }
    },

    setKey(key, pressed) {
      if (this._state[key] === pressed) {
        return;
      }
      let fakeEvent = { key: game.global.settings.keyMap[key] };
      if (pressed) {
        this._setFn(fakeEvent);
      } else {
        this._unsetFn(fakeEvent);
      }
      this._state[key] = pressed;
    },

    set(x100, x25, x10) {
      if (this._mode === "all") {
        let map = game.global.settings.keyMap;
        let fakeEvent = {
          [this._eventProp[map.x100]]: (this._state.x100 = x100),
          [this._eventProp[map.x25]]: (this._state.x25 = x25),
          [this._eventProp[map.x10]]: (this._state.x10 = x10),
        };
        this._allFn(fakeEvent);
      } else if (this._mode === "each" || this._mode === "unset") {
        this.setKey("x100", x100);
        this.setKey("x25", x25);
        this.setKey("x10", x10);
      }
    },

    *click(amount) {
      if (this._mode === "none") {
        while (amount > 0) {
          yield (amount -= 1);
        }
      } else if (this._mode === "unset") {
        this.set(false, false, false);
        while (amount > 0) {
          yield (amount -= 1);
        }
      } else {
        while (amount > 0) {
          if (amount >= 25000) {
            this.set(true, true, true);
            yield (amount -= 25000);
          } else if (amount >= 2500) {
            this.set(true, true, false);
            yield (amount -= 2500);
          } else if (amount >= 1000) {
            this.set(true, false, true);
            yield (amount -= 1000);
          } else if (amount >= 250) {
            this.set(false, true, true);
            yield (amount -= 250);
          } else if (amount >= 100) {
            this.set(true, false, false);
            yield (amount -= 100);
          } else if (amount >= 25) {
            this.set(false, true, false);
            yield (amount -= 25);
          } else if (amount >= 10) {
            this.set(false, false, true);
            yield (amount -= 10);
          } else {
            this.set(false, false, false);
            yield (amount -= 1);
          }
        }
      }
    },
  };

  var GameLog = {
    Types: {
      special: "Specials",
      construction: "Construction",
      multi_construction: "Multi-part Construction",
      arpa: "A.R.P.A Progress",
      research: "Research",
      spying: "Spying",
      attack: "Attack",
      mercenary: "Mercenaries",
      mech_build: "Mech Build",
      mech_scrap: "Mech Scrap",
      outer_fleet: "True Path Fleet",
      mutation: "Mutations",
      prestige: "Prestige",
    },

    logInfo(loggingType, text, tags) {
      if (!settings.logEnabled || !settings["log_" + loggingType]) {
        return;
      }

      poly.messageQueue(text, "info", false, tags);
    },

    logSuccess(loggingType, text, tags) {
      if (!settings.logEnabled || !settings["log_" + loggingType]) {
        return;
      }

      poly.messageQueue(text, "success", false, tags);
    },

    logWarning(loggingType, text, tags) {
      if (!settings.logEnabled || !settings["log_" + loggingType]) {
        return;
      }

      poly.messageQueue(text, "warning", false, tags);
    },

    logDanger(loggingType, text, tags) {
      if (!settings.logEnabled || !settings["log_" + loggingType]) {
        return;
      }

      poly.messageQueue(text, "danger", false, tags);
    },
  };

  // Gui & Init functions
  const { updateCraftCost } = createCraftingCosts({
    getGame: () => game,
    getState: () => state,
    getResources: () => resources,
    setCraftablesList: (list) => (craftablesList = list),
    setFoundryList: (list) => (foundryList = list),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      updateCraftCost,
      getCraftCostTestLists: () => ({ craftablesList, foundryList }),
      setCraftCostTestContext(context) {
        game = context.game;
        state = context.state;
        resources = context.resources;
        craftablesList = context.craftablesList ?? [];
        foundryList = context.foundryList ?? [];
      },
    });
  }

  function initialiseState() {
    updateCraftCost();
    updateTabs(false);

    // Lets set our crate / container resource requirements
    Object.defineProperty(resources.Crates, "cost", {
      get: () =>
        game.global.race["warlord"] && game.global.race["iron_wood"]
          ? { Lumber: 200 }
          : isLumberRace()
            ? { Plywood: 10 }
            : { Stone: 200 },
    });
    resources.Containers.cost["Steel"] = 125;

    JobManager.craftingJobs = Object.values(crafter);

    // Construct city builds list
    // TODO: replace gameMax with queue_complete
    //buildings.SacrificialAltar.gameMax = 1; // Although it is technically limited to single altar, we don't care about that, as we're going to click it to make sacrifices
    // Max level depends on achievement progress, building is unavailable during fasting so it doesn't have to update dynamically.
    buildings.Banquet.gameMax =
      game.global.stats.achieve.endless_hunger?.l ?? 0;
    buildings.RedTerraformer.gameMax = 100;
    buildings.RedAtmoTerraformer.gameMax = 1;
    buildings.RedTerraform.gameMax = 1;
    buildings.GasSpaceDock.gameMax = 1;
    buildings.DwarfWorldController.gameMax = 1;
    buildings.GasSpaceDockShipSegment.gameMax = 100;
    buildings.ProximaDyson.gameMax = 100;
    buildings.BlackholeStellarEngine.gameMax = 100;
    buildings.DwarfWorldCollider.gameMax = 1859;
    buildings.DwarfShipyard.gameMax = 1;
    buildings.DwarfMassRelay.gameMax = 100;
    buildings.DwarfMassRelayComplete.gameMax = 1;
    buildings.TitanAI.gameMax = 100;
    buildings.TitanAIComplete.gameMax = 1;
    buildings.TritonFOB.gameMax = 1;

    buildings.SunJumpGate.gameMax = 100;
    buildings.TauJumpGate.gameMax = 100;
    buildings.TauAlienOutpost.gameMax = 1;
    buildings.TauStarRingworld.gameMax = 1000;
    buildings.TauStarMatrix.gameMax = 1;
    buildings.TauGas2AlienStation.gameMax = 100;
    buildings.TauGas2AlienSpaceStation.gameMax = 1;
    buildings.TauGas2MatrioshkaBrain.gameMax = 1000;
    buildings.TauGas2IgnitionDevice.gameMax = 10;

    buildings.ProximaDysonSphere.gameMax = 100;
    buildings.ProximaOrichalcumSphere.gameMax = 100;
    buildings.ProximaElysaniteSphere.gameMax = 1000;
    buildings.BlackholeStargate.gameMax = 200;
    buildings.BlackholeStargateComplete.gameMax = 1;
    buildings.SiriusSpaceElevator.gameMax = 100;
    buildings.SiriusGravityDome.gameMax = 100;
    buildings.SiriusAscensionMachine.gameMax = 100;
    buildings.SiriusAscensionTrigger.gameMax = 1;
    buildings.WastelandThrone.gameMax = 0; // TODO should probably be 1 or 2 with smart logic, 2 to toggle skill assignment mode and 3 to disable it? and then 1 after all skills assigned while a commander is captured
    buildings.RuinsWarVault.gameMax = 1;
    buildings.BadlandsCodex.gameMax = 0; // TODO script just needs to know what it costs, for now it just tries to spam it
    buildings.PitSoulForge.gameMax = 1;
    buildings.PitSoulCapacitor.gameMax = 40;
    buildings.PitAbsorptionChamber.gameMax = 100;
    buildings.GateEastTower.gameMax = 1;
    buildings.GateWestTower.gameMax = 1;
    buildings.RuinsVault.gameMax = 2;
    buildings.LakeOven.gameMax = 100;
    buildings.LakeOvenComplete.gameMax = 1;
    buildings.SpireBridge.gameMax = 10;
    buildings.SpireEdenicGate.gameMax = 1;

    buildings.AsphodelMechStation.gameMax = 10;
    buildings.AsphodelRuneGate.gameMax = 100;
    buildings.ElysiumFireSupportBase.gameMax = 101; // 101th click to fire cannon
    buildings.ElysiumNorthPier.gameMax = 10;
    buildings.ElysiumRushmore.gameMax = 1;
    buildings.ElysiumReincarnation.gameMax = 1; // TODO use it
    buildings.IsleSouthPier.gameMax = 10;
    buildings.IsleSoulCompactor.gameMax = 1;
    buildings.PalaceInfuser.gameMax = 25;
    buildings.PalaceConduit.gameMax = 25;
    buildings.PalaceTomb.gameMax = 10;

    buildings.GorddonEmbassy.gameMax = 1;
    buildings.Alien1Consulate.gameMax = 1;

    projects.LaunchFacility.gameMax = 1;
    projects.ManaSyphon.gameMax = 80;

    buildings.CoalPower.addResourceConsumption(
      () =>
        game.global.race.universe === "magic" ? resources.Mana : resources.Coal,
      () =>
        game.global.race["environmentalist"]
          ? 0
          : game.global.race.universe === "magic"
            ? 0.05
            : 0.65,
    );
    buildings.OilPower.addResourceConsumption(resources.Oil, () =>
      game.global.race["environmentalist"] ? 0 : 0.65,
    );
    buildings.FissionPower.addResourceConsumption(resources.Uranium, 0.1);
    buildings.TouristCenter.addResourceConsumption(resources.Food, 50);

    // Init support
    buildings.SpaceNavBeacon.addSupport(resources.Moon_Support);
    buildings.SpaceNavBeacon.addResourceConsumption(
      resources.Red_Support,
      () => (haveTech("luna", 3) ? -1 : 0),
    );

    buildings.MoonBase.addSupport(resources.Moon_Support);
    buildings.MoonIridiumMine.addSupport(resources.Moon_Support);
    buildings.MoonHeliumMine.addSupport(resources.Moon_Support);
    buildings.MoonObservatory.addSupport(resources.Moon_Support);

    buildings.RedSpaceport.addSupport(resources.Red_Support);
    buildings.RedTower.addSupport(resources.Red_Support);
    buildings.RedLivingQuarters.addSupport(resources.Red_Support);
    buildings.RedVrCenter.addSupport(resources.Red_Support);
    buildings.RedMine.addSupport(resources.Red_Support);
    buildings.RedFabrication.addSupport(resources.Red_Support);
    buildings.RedBiodome.addSupport(resources.Red_Support);
    buildings.RedExoticLab.addSupport(resources.Red_Support);

    buildings.SunSwarmControl.addSupport(resources.Sun_Support);
    buildings.SunSwarmSatellite.addSupport(resources.Sun_Support);

    buildings.BeltSpaceStation.addSupport(resources.Belt_Support);
    buildings.BeltEleriumShip.addSupport(resources.Belt_Support);
    buildings.BeltIridiumShip.addSupport(resources.Belt_Support);
    buildings.BeltIronShip.addSupport(resources.Belt_Support);

    buildings.AlphaStarport.addSupport(resources.Alpha_Support);
    buildings.AlphaHabitat.addSupport(resources.Alpha_Support);
    buildings.AlphaMiningDroid.addSupport(resources.Alpha_Support);
    buildings.AlphaProcessing.addSupport(resources.Alpha_Support);
    buildings.AlphaFusion.addSupport(resources.Alpha_Support);
    buildings.AlphaLaboratory.addSupport(resources.Alpha_Support);
    buildings.AlphaExchange.addSupport(resources.Alpha_Support);
    buildings.AlphaGraphenePlant.addSupport(resources.Alpha_Support);
    buildings.AlphaExoticZoo.addResourceConsumption(resources.Alpha_Support, 1);
    buildings.ProximaTransferStation.addSupport(resources.Alpha_Support);

    buildings.NebulaNexus.addSupport(resources.Nebula_Support);
    buildings.NebulaHarvester.addSupport(resources.Nebula_Support);
    buildings.NebulaEleriumProspector.addSupport(resources.Nebula_Support);

    buildings.GatewayStarbase.addSupport(resources.Gateway_Support);
    buildings.GatewayShipDock.addSupport(resources.Gateway_Support);
    buildings.BologniumShip.addSupport(resources.Gateway_Support);
    buildings.ScoutShip.addSupport(resources.Gateway_Support);
    buildings.CorvetteShip.addSupport(resources.Gateway_Support);
    buildings.FrigateShip.addSupport(resources.Gateway_Support);
    buildings.CruiserShip.addSupport(resources.Gateway_Support);
    buildings.Dreadnought.addSupport(resources.Gateway_Support);
    buildings.StargateStation.addSupport(resources.Gateway_Support);
    buildings.StargateTelemetryBeacon.addSupport(resources.Gateway_Support);

    buildings.Alien2Foothold.addSupport(resources.Alien_Support);
    buildings.Alien2ArmedMiner.addSupport(resources.Alien_Support);
    buildings.Alien2OreProcessor.addSupport(resources.Alien_Support);
    buildings.Alien2Scavenger.addSupport(resources.Alien_Support);

    buildings.LakeHarbor.addSupport(resources.Lake_Support);
    buildings.LakeBireme.addSupport(resources.Lake_Support);
    buildings.LakeTransport.addSupport(resources.Lake_Support);

    buildings.SpirePurifier.addSupport(resources.Spire_Support);
    buildings.SpirePort.addSupport(resources.Spire_Support);
    buildings.SpireBaseCamp.addSupport(resources.Spire_Support);
    buildings.SpireMechBay.addSupport(resources.Spire_Support);

    buildings.TitanElectrolysis.addSupport(resources.Titan_Support);
    buildings.TitanQuarters.addSupport(resources.Titan_Support);
    buildings.TitanMine.addSupport(resources.Titan_Support);
    buildings.TitanGraphene.addSupport(resources.Titan_Support);
    buildings.TitanDecoder.addResourceConsumption(resources.Titan_Support, 1);

    buildings.TitanSpaceport.addSupport(resources.Enceladus_Support);
    buildings.EnceladusWaterFreighter.addSupport(resources.Enceladus_Support);
    buildings.EnceladusZeroGLab.addSupport(resources.Enceladus_Support);
    buildings.EnceladusBase.addSupport(resources.Enceladus_Support);

    buildings.TitanElectrolysis.addResourceConsumption(
      resources.Electrolysis_Support,
      -1,
    );
    buildings.TitanHydrogen.addResourceConsumption(
      resources.Electrolysis_Support,
      1,
    );

    buildings.ErisDrone.addSupport(resources.Eris_Support);
    buildings.ErisTrooper.addSupport(resources.Eris_Support);
    buildings.ErisTank.addSupport(resources.Eris_Support);

    buildings.TauOrbitalStation.addSupport(resources.Tau_Support);
    buildings.TauFarm.addSupport(resources.Tau_Support);
    buildings.TauColony.addSupport(resources.Tau_Support);
    buildings.TauFactory.addSupport(resources.Tau_Support);
    buildings.TauDiseaseLab.addSupport(resources.Tau_Support);
    buildings.TauMiningPit.addSupport(resources.Tau_Support);

    buildings.TauRedOrbitalPlatform.addSupport(resources.Tau_Red_Support);
    buildings.TauRedOverseer.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingVillage.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingFarm.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingMine.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingFun.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingLab.addSupport(resources.Tau_Red_Support);

    buildings.TauRedWomlingVillage.addResourceConsumption(
      resources.Womlings_Support,
      () => (haveTech("womling_pop", 2) ? -6 : -5),
    );
    buildings.TauRedWomlingFarm.addResourceConsumption(
      resources.Womlings_Support,
      () => (buildings.TauRedWomlingFarm.autoStateSmart ? 2 : 0),
    );
    buildings.TauRedWomlingLab.addResourceConsumption(
      resources.Womlings_Support,
      () => (buildings.TauRedWomlingLab.autoStateSmart ? 1 : 0),
    );
    buildings.TauRedWomlingMine.addResourceConsumption(
      resources.Womlings_Support,
      () => (buildings.TauRedWomlingMine.autoStateSmart ? 6 : 0),
    );

    buildings.TauBeltPatrolShip.addSupport(resources.Tau_Belt_Support);
    buildings.TauBeltMiningShip.addSupport(resources.Tau_Belt_Support);
    buildings.TauBeltWhalingShip.addSupport(resources.Tau_Belt_Support);

    buildings.AsphodelEncampment.addSupport(resources.Asphodel_Support);
    buildings.AsphodelSoulEngine.addSupport(resources.Asphodel_Support);
    buildings.AsphodelResearchStation.addSupport(resources.Asphodel_Support);
    buildings.AsphodelHarvester.addSupport(resources.Asphodel_Support);
    buildings.AsphodelProcessor.addSupport(resources.Asphodel_Support);
    buildings.AsphodelBunker.addSupport(resources.Asphodel_Support);
    buildings.AsphodelBlissDen.addSupport(resources.Asphodel_Support);
    buildings.AsphodelRectory.addSupport(resources.Asphodel_Support);
    buildings.AsphodelCorruptor.addSupport(resources.Asphodel_Support);

    // Powered buildings whose output other managed buildings burn as fuel.
    // autoPower reserves power for these so consumers can't starve their own fuel source.
    buildings.GasMining.produces = [resources.Helium_3];
    buildings.GasMoonOilExtractor.produces = [resources.Oil];
    buildings.CoalMine.produces = [resources.Coal];
    buildings.NebulaHarvester.produces = [
      resources.Helium_3,
      resources.Deuterium,
    ];
    buildings.KuiperElerium.produces = [resources.Elerium];
    buildings.EnceladusWaterFreighter.produces = [resources.Water];

    // Init consumptions
    buildings.MoonBase.addResourceConsumption(resources.Oil, 2);
    buildings.RedSpaceport.addResourceConsumption(resources.Helium_3, 1.25);
    buildings.RedSpaceport.addResourceConsumption(resources.Food, () =>
      game.global.race["cataclysm"] || game.global.race["orbit_decayed"]
        ? 2
        : 25,
    );
    buildings.RedFactory.addResourceConsumption(resources.Helium_3, 1);
    buildings.RedSpaceBarracks.addResourceConsumption(resources.Oil, 2);
    buildings.RedSpaceBarracks.addResourceConsumption(resources.Food, () =>
      game.global.race["cataclysm"] || game.global.race["orbit_decayed"]
        ? 0
        : 10,
    );
    buildings.HellGeothermal.addResourceConsumption(resources.Helium_3, 0.5);
    buildings.GasMoonOutpost.addResourceConsumption(resources.Oil, 2);
    buildings.BeltSpaceStation.addResourceConsumption(resources.Food, () =>
      game.global.race["fasting"]
        ? 0
        : game.global.race["cataclysm"] || game.global.race["orbit_decayed"]
          ? 1
          : 10,
    );
    buildings.BeltSpaceStation.addResourceConsumption(resources.Helium_3, 2.5);
    buildings.DwarfEleriumReactor.addResourceConsumption(
      resources.Elerium,
      0.05,
    );

    buildings.AlphaStarport.addResourceConsumption(resources.Food, 100);
    buildings.AlphaStarport.addResourceConsumption(resources.Helium_3, 5);
    buildings.AlphaFusion.addResourceConsumption(resources.Deuterium, 1.25);
    buildings.AlphaExoticZoo.addResourceConsumption(resources.Food, 12000);
    buildings.AlphaMegaFactory.addResourceConsumption(resources.Deuterium, 5);

    buildings.ProximaTransferStation.addResourceConsumption(
      resources.Uranium,
      0.28,
    );
    buildings.ProximaCruiser.addResourceConsumption(resources.Helium_3, 6);

    buildings.NeutronMiner.addResourceConsumption(resources.Helium_3, 3);

    buildings.GatewayStarbase.addResourceConsumption(resources.Helium_3, 25);
    buildings.GatewayStarbase.addResourceConsumption(resources.Food, 250);

    buildings.BologniumShip.addResourceConsumption(resources.Helium_3, 5);
    buildings.ScoutShip.addResourceConsumption(resources.Helium_3, 6);
    buildings.CorvetteShip.addResourceConsumption(resources.Helium_3, 10);
    buildings.FrigateShip.addResourceConsumption(resources.Helium_3, 25);
    buildings.CruiserShip.addResourceConsumption(resources.Deuterium, 25);
    buildings.Dreadnought.addResourceConsumption(resources.Deuterium, 80);

    buildings.GorddonEmbassy.addResourceConsumption(resources.Food, () =>
      game.global.race["fasting"] ? 0 : 7500,
    );
    buildings.GorddonFreighter.addResourceConsumption(resources.Helium_3, 12);

    buildings.Alien1VitreloyPlant.addResourceConsumption(
      resources.Bolognium,
      2.5,
    );
    buildings.Alien1VitreloyPlant.addResourceConsumption(
      resources.Stanene,
      100,
    );
    buildings.Alien1VitreloyPlant.addResourceConsumption(
      resources.Money,
      50000,
    );
    buildings.Alien1SuperFreighter.addResourceConsumption(
      resources.Helium_3,
      25,
    );

    buildings.Alien2Foothold.addResourceConsumption(resources.Elerium, 2.5);
    buildings.Alien2ArmedMiner.addResourceConsumption(resources.Helium_3, 10);
    buildings.Alien2Scavenger.addResourceConsumption(resources.Helium_3, 12);

    buildings.ChthonianMineLayer.addResourceConsumption(resources.Helium_3, 8);
    buildings.ChthonianRaider.addResourceConsumption(resources.Helium_3, 18);

    buildings.RuinsInfernoPower.addResourceConsumption(resources.Infernite, 5);
    buildings.RuinsInfernoPower.addResourceConsumption(resources.Coal, 100);
    buildings.RuinsInfernoPower.addResourceConsumption(resources.Oil, 80);

    buildings.LakeOvenComplete.addResourceConsumption(resources.Infernite, 225);

    buildings.TitanElectrolysis.addResourceConsumption(resources.Water, 35);

    buildings.TitanQuarters.addResourceConsumption(resources.Water, 12);
    buildings.TitanQuarters.addResourceConsumption(resources.Food, 500);
    buildings.TitanDecoder.addResourceConsumption(resources.Cipher, 0.06);
    buildings.TitanAIComplete.addResourceConsumption(resources.Water, 1000);

    buildings.EnceladusWaterFreighter.addResourceConsumption(
      resources.Helium_3,
      5,
    );

    buildings.TritonFOB.addResourceConsumption(resources.Helium_3, 125);
    buildings.TritonLander.addResourceConsumption(resources.Oil, 50);

    buildings.KuiperOrichalcum.addResourceConsumption(resources.Oil, 200);
    buildings.KuiperUranium.addResourceConsumption(resources.Oil, 60);
    buildings.KuiperNeutronium.addResourceConsumption(resources.Oil, 60);
    buildings.KuiperElerium.addResourceConsumption(resources.Oil, 125);

    buildings.ErisDrone.addResourceConsumption(resources.Uranium, 5);

    buildings.TauOrbitalStation.addResourceConsumption(
      resources.Helium_3,
      () =>
        haveTech("isolation")
          ? game.global.race["lone_survivor"]
            ? 5
            : 25
          : 400,
    );
    buildings.TauColony.addResourceConsumption(resources.Food, () =>
      haveTech("isolation")
        ? game.global.race["lone_survivor"]
          ? -2
          : 75
        : 1000,
    );
    buildings.TauFusionGenerator.addResourceConsumption(
      resources.Helium_3,
      () =>
        haveTech("isolation")
          ? game.global.race["lone_survivor"]
            ? -15
            : 75
          : 500,
    );
    buildings.TauCulturalCenter.addResourceConsumption(resources.Food, () =>
      game.global.race["lone_survivor"] ? 25 : 500,
    );
    buildings.TauRedOrbitalPlatform.addResourceConsumption(resources.Oil, () =>
      game.global.race["lone_survivor"] ? 0 : haveTech("isolation") ? 32 : 125,
    );
    buildings.TauRedOrbitalPlatform.addResourceConsumption(
      resources.Helium_3,
      () =>
        game.global.race["lone_survivor"]
          ? haveTech("isolation")
            ? 8
            : 125
          : 0,
    );
    buildings.TauBeltPatrolShip.addResourceConsumption(
      resources.Helium_3,
      () => (haveTech("isolation") ? 15 : 250),
    );
    buildings.TauBeltMiningShip.addResourceConsumption(
      resources.Helium_3,
      () => (haveTech("isolation") ? 12 : 75),
    );
    buildings.TauBeltWhalingShip.addResourceConsumption(
      resources.Helium_3,
      () => (haveTech("isolation") ? 14 : 90),
    );
    buildings.TauGas2AlienSpaceStation.addResourceConsumption(
      resources.Elerium,
      () => (game.global.race["lone_survivor"] ? 1 : 10),
    );

    // Better back compatibility, to run beta version's script on stable game build without commenting out new buildings
    buildings = Object.fromEntries(
      Object.entries(buildings).filter(([id, b]) =>
        b.definition ? true : console.log(`${b.name} action not found.`),
      ),
    );

    // These are buildings which are specified as powered in the actions definition game code but aren't actually powered in the main.js powered calculations
    Object.values(buildings).forEach((building) => {
      if (building.powered > 0) {
        let powerId = (building._location || building._tab) + ":" + building.id;
        if (game.global.power.indexOf(powerId) === -1) {
          building.overridePowered = 0;
        }
      }
    });
    //Object.defineProperty(buildings.Assembly, "overridePowered", {get: () => traitVal('powered', 0)});
    //Object.defineProperty(buildings.RedAssembly, "overridePowered", {get: () => traitVal('powered', 0)});
    buildings.Windmill.overridePowered = -1;
    buildings.SunSwarmSatellite.overridePowered = -0.35;
    buildings.ProximaDyson.overridePowered = -1.25;
    buildings.ProximaDysonSphere.overridePowered = -5;
    buildings.ProximaOrichalcumSphere.overridePowered = -8;
    buildings.ProximaElysaniteSphere.overridePowered = -18;
    buildings.BlackholeStellarEngine.overridePowered = 0;
    buildings.WastelandIncinerator.overridePowered = -25;
    // Numbers aren't exactly correct. That's fine - it won't mess with calculations - it's not something we can turn off and on. We just need to know that they *are* power generators, for autobuild, and that's enough for us.
    // We don't handle the Stellar Engine at at all, it will be treated as mystery power in autoPower
  }

  function initialiseRaces() {
    for (let id in game.actions.evolution) {
      evolutions[id] = new EvolutionAction(id);
    }
    let e = evolutions;

    let bilateralSymmetry = [
      e.bilateral_symmetry,
      e.multicellular,
      e.phagocytosis,
      e.sexual_reproduction,
    ];
    let mammals = [e.mammals, ...bilateralSymmetry];

    let genusEvolution = {
      eldritch: [e.sentience, e.eldritch, ...bilateralSymmetry],
      aquatic: [e.sentience, e.aquatic, ...bilateralSymmetry],
      insectoid: [e.sentience, e.athropods, ...bilateralSymmetry],
      humanoid: [e.sentience, e.humanoid, ...mammals],
      giant: [e.sentience, e.gigantism, ...mammals],
      small: [e.sentience, e.dwarfism, ...mammals],
      carnivore: [e.sentience, e.carnivore, e.animalism, ...mammals],
      herbivore: [e.sentience, e.herbivore, e.animalism, ...mammals],
      //omnivore: [e.sentience, e.omnivore, e.animalism, ...mammals],
      demonic: [e.sentience, e.demonic, ...mammals],
      angelic: [e.sentience, e.celestial, ...mammals],
      fey: [e.sentience, e.fey, ...mammals],
      heat: [e.sentience, e.heat, ...mammals],
      polar: [e.sentience, e.polar, ...mammals],
      sand: [e.sentience, e.sand, ...mammals],
      avian: [e.sentience, e.endothermic, e.eggshell, ...bilateralSymmetry],
      reptilian: [e.sentience, e.ectothermic, e.eggshell, ...bilateralSymmetry],
      plant: [
        e.sentience,
        e.bryophyte,
        e.poikilohydric,
        e.multicellular,
        e.chloroplasts,
        e.sexual_reproduction,
      ],
      fungi: [
        e.sentience,
        e.bryophyte,
        e.spores,
        e.multicellular,
        e.chitin,
        e.sexual_reproduction,
      ],
      synthetic: [e.sentience, e.exterminate, e.sexual_reproduction],
    };

    for (let id in game.races) {
      // We don't care about protoplasm
      if (id === "protoplasm") {
        continue;
      }

      races[id] = new Race(id);
      let evolutionPath;
      if (id === "hellspawn") {
        races[id].evolutionTree[races[id].genus] = [
          e.bunker,
          e.warlord,
          ...(genusEvolution[races[id].genus] ?? []),
        ];
      } else if (id === "junker" || id === "sludge" || id === "ultra_sludge") {
        for (let genus of Object.keys(genusEvolution)) {
          races[id].evolutionTree[genus] = [
            e.bunker,
            e[id],
            ...(genusEvolution[genus] ?? []),
          ];
        }
      } else if (game.races[id].type === "hybrid") {
        let hybridGenus = game.races[id].hybrid;
        races[id].evolutionTree[hybridGenus[0]] = [
          e.bunker,
          e[id],
          ...(genusEvolution[hybridGenus[0]] ?? []),
        ];
        races[id].evolutionTree[hybridGenus[1]] = [
          e.bunker,
          e[id],
          ...(genusEvolution[hybridGenus[1]] ?? []),
        ];
      } else {
        races[id].evolutionTree[races[id].genus] = [
          e.bunker,
          e[id],
          ...(genusEvolution[races[id].genus] ?? []),
        ];
      }

      // add imitate races
      imitations[id] = new EvolutionAction(`s-${id}`);
    }
  }

  function initBuildingState() {
    let priorityList = [];

    priorityList.push(buildings.Windmill);
    priorityList.push(buildings.Mill);
    priorityList.push(buildings.CoalPower);
    priorityList.push(buildings.OilPower);
    priorityList.push(buildings.FissionPower);
    priorityList.push(buildings.TauFusionGenerator);
    priorityList.push(buildings.TauGas2AlienSpaceStation);

    priorityList.push(buildings.WastelandIncinerator);

    priorityList.push(buildings.RuinsHellForge);
    priorityList.push(buildings.RuinsInfernoPower);

    priorityList.push(buildings.AsphodelEncampment);
    priorityList.push(buildings.AsphodelRectory);
    priorityList.push(buildings.AsphodelCorruptor);
    priorityList.push(buildings.AsphodelSoulEngine);

    priorityList.push(buildings.TitanElectrolysis);
    priorityList.push(buildings.TitanHydrogen);
    priorityList.push(buildings.TitanQuarters);

    priorityList.push(buildings.DwarfMassRelayComplete);
    priorityList.push(buildings.RuinsArcology);
    priorityList.push(buildings.Apartment);
    priorityList.push(buildings.Barracks);
    priorityList.push(buildings.TouristCenter);
    priorityList.push(buildings.University);
    priorityList.push(buildings.Smelter);
    priorityList.push(buildings.Temple);
    priorityList.push(buildings.OilWell);
    priorityList.push(buildings.StorageYard);
    priorityList.push(buildings.Warehouse);
    priorityList.push(buildings.Bank);
    priorityList.push(buildings.Hospital);
    priorityList.push(buildings.BootCamp);
    priorityList.push(buildings.House);
    priorityList.push(buildings.Cottage);
    priorityList.push(buildings.Farm);
    priorityList.push(buildings.Silo);
    priorityList.push(buildings.Shed);
    priorityList.push(buildings.LumberYard);
    priorityList.push(buildings.Foundry);
    priorityList.push(buildings.OilDepot);
    priorityList.push(buildings.Trade);
    priorityList.push(buildings.Amphitheatre);
    priorityList.push(buildings.Library);
    priorityList.push(buildings.Wharf);
    priorityList.push(buildings.NaniteFactory); // Deconstructor trait
    priorityList.push(buildings.RedNaniteFactory); // Deconstructor trait & Cataclysm only
    priorityList.push(buildings.TauNaniteFactory); // Deconstructor trait & True Path only
    priorityList.push(buildings.Transmitter); // Artifical trait
    priorityList.push(buildings.Assembly); // Artifical trait
    priorityList.push(buildings.RedAssembly); // Artifical trait & Cataclysm only
    priorityList.push(buildings.TauAssembly); // Artifical trait & True Path only
    priorityList.push(buildings.TauCloning); // Sterile assembly
    priorityList.push(buildings.Lodge); // Carnivore/Detritivore/Soul Eater trait
    priorityList.push(buildings.Smokehouse); // Carnivore trait
    priorityList.push(buildings.SoulWell); // Soul Eater trait
    priorityList.push(buildings.SlavePen); // Slaver trait
    priorityList.push(buildings.SlaveMarket); // Slaver trait
    priorityList.push(buildings.CaptiveHousing); // Unfathomable trait
    priorityList.push(buildings.RedCaptiveHousing); // Unfathomable trait
    priorityList.push(buildings.TauCaptiveHousing); // Unfathomable trait
    priorityList.push(buildings.Graveyard); // Evil trait
    priorityList.push(buildings.Shrine); // Magnificent trait
    priorityList.push(buildings.CompostHeap); // Detritivore trait
    priorityList.push(buildings.ConcealWard); // Witch Hunting only
    priorityList.push(buildings.Pylon); // Magic Universe only
    priorityList.push(buildings.RedPylon); // Magic Universe & Cataclysm only
    priorityList.push(buildings.TauPylon); // Magic Universe & True Path only
    priorityList.push(buildings.ForgeHorseshoe); // Hooved trait
    priorityList.push(buildings.RedForgeHorseshoe); // Hooved trait
    priorityList.push(buildings.TauForgeHorseshoe); // Hooved trait
    priorityList.push(buildings.SacrificialAltar); // Cannibalize trait
    priorityList.push(buildings.MeditationChamber); // Calm trait
    priorityList.push(buildings.Banquet); // Fasting reward

    priorityList.push(buildings.DwarfMission);
    priorityList.push(buildings.DwarfEleriumReactor);
    priorityList.push(buildings.DwarfWorldCollider);

    priorityList.push(buildings.HellMission);
    priorityList.push(buildings.HellGeothermal);
    priorityList.push(buildings.HellSwarmPlant);

    priorityList.push(buildings.ProximaTransferStation);
    priorityList.push(buildings.ProximaMission);
    priorityList.push(buildings.ProximaCargoYard);
    priorityList.push(buildings.ProximaCruiser);
    priorityList.push(buildings.ProximaDyson);
    priorityList.push(buildings.ProximaDysonSphere);
    priorityList.push(buildings.ProximaOrichalcumSphere);
    priorityList.push(buildings.ProximaElysaniteSphere);

    priorityList.push(buildings.AlphaMission);
    priorityList.push(buildings.AlphaStarport);
    priorityList.push(buildings.AlphaHabitat);
    priorityList.push(buildings.AlphaFusion);
    priorityList.push(buildings.AlphaLuxuryCondo);
    priorityList.push(buildings.AlphaMiningDroid);
    priorityList.push(buildings.AlphaProcessing);
    priorityList.push(buildings.AlphaLaboratory);
    priorityList.push(buildings.AlphaExoticZoo);
    priorityList.push(buildings.AlphaExchange);
    priorityList.push(buildings.AlphaGraphenePlant);
    priorityList.push(buildings.AlphaWarehouse);

    priorityList.push(buildings.SpaceTestLaunch);
    priorityList.push(buildings.SpaceSatellite);
    priorityList.push(buildings.SpaceGps);
    priorityList.push(buildings.SpacePropellantDepot);
    priorityList.push(buildings.SpaceNavBeacon);

    priorityList.push(buildings.RedMission);
    priorityList.push(buildings.RedTower);
    priorityList.push(buildings.RedSpaceport);
    priorityList.push(buildings.RedLivingQuarters);
    priorityList.push(buildings.RedBiodome);
    priorityList.push(buildings.RedSpaceBarracks);
    priorityList.push(buildings.RedExoticLab);
    priorityList.push(buildings.RedFabrication);
    priorityList.push(buildings.RedMine);
    priorityList.push(buildings.RedVrCenter);
    priorityList.push(buildings.RedZiggurat);
    priorityList.push(buildings.RedGarage);
    priorityList.push(buildings.RedUniversity);
    priorityList.push(buildings.RedTerraformer);
    //priorityList.push(buildings.RedTerraform);

    priorityList.push(buildings.MoonMission);
    priorityList.push(buildings.MoonBase);
    priorityList.push(buildings.MoonObservatory);
    priorityList.push(buildings.MoonHeliumMine);
    priorityList.push(buildings.MoonIridiumMine);

    priorityList.push(buildings.SunMission);
    priorityList.push(buildings.SunSwarmControl);
    priorityList.push(buildings.SunSwarmSatellite);
    priorityList.push(buildings.SunJumpGate);

    priorityList.push(buildings.GasMission);
    priorityList.push(buildings.GasStorage);
    priorityList.push(buildings.GasSpaceDock);
    priorityList.push(buildings.GasSpaceDockProbe);
    priorityList.push(buildings.GasSpaceDockGECK);
    priorityList.push(buildings.GasSpaceDockShipSegment);

    priorityList.push(buildings.GasMoonMission);
    priorityList.push(buildings.GasMoonDrone);

    priorityList.push(buildings.Blackhole);
    priorityList.push(buildings.BlackholeStellarEngine);
    priorityList.push(buildings.BlackholeJumpShip);
    priorityList.push(buildings.BlackholeWormholeMission);
    priorityList.push(buildings.BlackholeStargate);

    priorityList.push(buildings.SiriusMission);
    priorityList.push(buildings.SiriusAnalysis);
    priorityList.push(buildings.SiriusSpaceElevator);
    priorityList.push(buildings.SiriusGravityDome);
    priorityList.push(buildings.SiriusThermalCollector);
    priorityList.push(buildings.SiriusAscensionMachine);
    //priorityList.push(buildings.SiriusAscend); // This is performing the actual ascension. We'll deal with this in prestige automation

    priorityList.push(buildings.BlackholeStargateComplete); // Should be powered before Andromeda

    priorityList.push(buildings.GatewayMission);
    priorityList.push(buildings.GatewayStarbase);
    priorityList.push(buildings.GatewayShipDock);

    priorityList.push(buildings.StargateStation);
    priorityList.push(buildings.StargateTelemetryBeacon);

    priorityList.push(buildings.Dreadnought);
    priorityList.push(buildings.CruiserShip);
    priorityList.push(buildings.FrigateShip);
    priorityList.push(buildings.BologniumShip);
    priorityList.push(buildings.CorvetteShip);
    priorityList.push(buildings.ScoutShip);

    priorityList.push(buildings.GorddonMission);
    priorityList.push(buildings.GorddonEmbassy);
    priorityList.push(buildings.GorddonDormitory);
    priorityList.push(buildings.GorddonSymposium);
    priorityList.push(buildings.GorddonFreighter);

    priorityList.push(buildings.NeutronCitadel); // TODO: Having it bellow ascension/terraformer cause flickering when it disables, reduces quantum level, and it disables solar swarms reducing power.
    priorityList.push(buildings.SiriusAscensionTrigger); // This is the 10,000 power one, buildings below this one should be safe to underpower for ascension. Buildings above this either provides, or support population
    priorityList.push(buildings.RedAtmoTerraformer); // Orbit Decay terraformer, 5,000 power
    priorityList.push(buildings.BlackholeMassEjector); // Top priority of safe buildings, disable *only* for ascension, otherwise we want to have them on at any cost, to keep pumping black hole
    priorityList.push(buildings.PitSoulForge);

    priorityList.push(buildings.Alien1Consulate);
    priorityList.push(buildings.Alien1Resort);
    priorityList.push(buildings.Alien1VitreloyPlant);
    priorityList.push(buildings.Alien1SuperFreighter);

    //priorityList.push(buildings.Alien2Mission);
    priorityList.push(buildings.Alien2Foothold);
    priorityList.push(buildings.Alien2Scavenger);
    priorityList.push(buildings.Alien2ArmedMiner);
    priorityList.push(buildings.Alien2OreProcessor);

    //priorityList.push(buildings.ChthonianMission);
    priorityList.push(buildings.ChthonianMineLayer);
    priorityList.push(buildings.ChthonianExcavator);
    priorityList.push(buildings.ChthonianRaider);

    priorityList.push(buildings.Wardenclyffe);
    priorityList.push(buildings.BioLab);
    priorityList.push(buildings.DwarfWorldController);
    priorityList.push(buildings.BlackholeFarReach);

    priorityList.push(buildings.NebulaMission);
    priorityList.push(buildings.NebulaNexus);
    priorityList.push(buildings.NebulaHarvester);
    priorityList.push(buildings.NebulaEleriumProspector);

    priorityList.push(buildings.BeltMission);
    priorityList.push(buildings.BeltSpaceStation);
    priorityList.push(buildings.BeltEleriumShip);
    priorityList.push(buildings.BeltIridiumShip);
    priorityList.push(buildings.BeltIronShip);

    priorityList.push(buildings.CementPlant);
    priorityList.push(buildings.Factory);
    priorityList.push(buildings.GasMoonOutpost);
    priorityList.push(buildings.StargateDefensePlatform);
    priorityList.push(buildings.RedFactory);
    priorityList.push(buildings.AlphaMegaFactory);

    priorityList.push(buildings.PortalTurret);
    priorityList.push(buildings.BadlandsSensorDrone);
    priorityList.push(buildings.PortalWarDroid);
    priorityList.push(buildings.BadlandsPredatorDrone);
    priorityList.push(buildings.BadlandsAttractor);
    priorityList.push(buildings.PortalCarport);
    priorityList.push(buildings.BadlandsMinions);
    priorityList.push(buildings.BadlandsReaper);
    priorityList.push(buildings.BadlandsCorpsePile);
    priorityList.push(buildings.BadlandsMortuary);
    priorityList.push(buildings.BadlandsCodex);
    priorityList.push(buildings.PitGunEmplacement);
    priorityList.push(buildings.PitSoulAttractor);
    priorityList.push(buildings.PitSoulCapacitor);
    priorityList.push(buildings.PitAbsorptionChamber);
    priorityList.push(buildings.PitShadowMine);
    priorityList.push(buildings.PitTavern);
    priorityList.push(buildings.PortalRepairDroid);
    priorityList.push(buildings.PitMission);
    priorityList.push(buildings.PitAssaultForge);
    priorityList.push(buildings.RuinsAncientPillars);

    priorityList.push(buildings.WastelandThrone);
    priorityList.push(buildings.WastelandWarehouse);
    priorityList.push(buildings.WastelandHovel);
    priorityList.push(buildings.WastelandHellCasino);
    priorityList.push(buildings.WastelandTwistedLab);
    priorityList.push(buildings.WastelandDemonForge);
    priorityList.push(buildings.WastelandHellFactory);
    priorityList.push(buildings.WastelandPumpjack);
    priorityList.push(buildings.WastelandDigDemon);
    priorityList.push(buildings.WastelandTunneler);
    priorityList.push(buildings.WastelandBrute);
    priorityList.push(buildings.WastelandAltar);
    priorityList.push(buildings.WastelandShrine);
    priorityList.push(buildings.WastelandMeditationChamber);

    priorityList.push(buildings.RuinsMission);
    priorityList.push(buildings.RuinsGuardPost);
    priorityList.push(buildings.RuinsVault);
    priorityList.push(buildings.RuinsWarVault);
    priorityList.push(buildings.RuinsArchaeology);

    priorityList.push(buildings.GateMission);
    priorityList.push(buildings.GateEastTower);
    priorityList.push(buildings.GateWestTower);
    priorityList.push(buildings.GateTurret);
    priorityList.push(buildings.GateInferniteMine);

    priorityList.push(buildings.LakeMission);
    priorityList.push(buildings.LakeCoolingTower);
    priorityList.push(buildings.LakeHarbor);
    priorityList.push(buildings.LakeBireme);
    priorityList.push(buildings.LakeTransport);
    priorityList.push(buildings.LakeOven);
    priorityList.push(buildings.LakeOvenComplete);
    priorityList.push(buildings.LakeSoulSteeper);
    priorityList.push(buildings.LakeLifeInfuser);

    priorityList.push(buildings.SpireMission);
    priorityList.push(buildings.SpirePurifier);
    priorityList.push(buildings.SpireMechBay);
    priorityList.push(buildings.SpireBaseCamp);
    priorityList.push(buildings.SpirePort);
    priorityList.push(buildings.SpireBridge);
    priorityList.push(buildings.SpireSphinx);
    priorityList.push(buildings.SpireBribeSphinx);
    priorityList.push(buildings.SpireSurveyTower);
    priorityList.push(buildings.SpireWaygate);
    priorityList.push(buildings.SpireEdenicGate);
    priorityList.push(buildings.SpireBazaar);

    priorityList.push(buildings.AsphodelMission);
    priorityList.push(buildings.AsphodelMechStation);
    priorityList.push(buildings.AsphodelHarvester);
    priorityList.push(buildings.AsphodelProcessor);
    priorityList.push(buildings.AsphodelResearchStation);
    priorityList.push(buildings.AsphodelWarehouse);
    priorityList.push(buildings.AsphodelStabilizer);
    priorityList.push(buildings.AsphodelRuneGate);
    priorityList.push(buildings.AsphodelBunker);
    priorityList.push(buildings.AsphodelBlissDen);

    priorityList.push(buildings.ElysiumMission);
    priorityList.push(buildings.ElysiumAmbush);
    priorityList.push(buildings.ElysiumRaid);
    priorityList.push(buildings.ElysiumSiege);
    priorityList.push(buildings.ElysiumScout);
    priorityList.push(buildings.ElysiumFireSupportBase);
    priorityList.push(buildings.ElysiumMine);
    priorityList.push(buildings.ElysiumSacredSmelter);
    priorityList.push(buildings.ElysiumEleriumContainment);
    priorityList.push(buildings.ElysiumPillbox);
    priorityList.push(buildings.ElysiumRestaurant);
    priorityList.push(buildings.ElysiumEternalBank);
    priorityList.push(buildings.ElysiumArchive);
    priorityList.push(buildings.ElysiumNorthPier);
    priorityList.push(buildings.ElysiumRushmore);
    priorityList.push(buildings.ElysiumReincarnation);
    priorityList.push(buildings.ElysiumCement);

    priorityList.push(buildings.IsleSouthPier);
    priorityList.push(buildings.IsleSpiritBattery);
    priorityList.push(buildings.IsleSpiritVacuum);
    priorityList.push(buildings.IsleSoulCompactor);

    priorityList.push(buildings.PalaceMission);
    priorityList.push(buildings.PalaceInfuser);
    priorityList.push(buildings.PalaceConduit);
    priorityList.push(buildings.PalaceTomb);
    //priorityList.push(buildings.PalaceApotheosis);

    priorityList.push(buildings.HellSmelter);
    priorityList.push(buildings.DwarfShipyard);
    priorityList.push(buildings.DwarfMassRelay);
    priorityList.push(buildings.TitanMission);
    priorityList.push(buildings.TitanSpaceport);

    priorityList.push(buildings.TitanAIColonist);
    priorityList.push(buildings.TitanMine);
    priorityList.push(buildings.TitanSAM);
    priorityList.push(buildings.TitanGraphene);
    priorityList.push(buildings.TitanStorehouse);
    priorityList.push(buildings.TitanBank);
    priorityList.push(buildings.TitanAI);
    priorityList.push(buildings.TitanAIComplete);
    priorityList.push(buildings.TitanDecoder);
    priorityList.push(buildings.EnceladusMission);
    priorityList.push(buildings.EnceladusZeroGLab);
    priorityList.push(buildings.EnceladusWaterFreighter);
    priorityList.push(buildings.EnceladusBase);
    priorityList.push(buildings.EnceladusMunitions);
    priorityList.push(buildings.TritonMission);
    priorityList.push(buildings.TritonFOB);
    priorityList.push(buildings.TritonLander);
    //priorityList.push(buildings.TritonCrashedShip);
    priorityList.push(buildings.KuiperMission);
    priorityList.push(buildings.KuiperOrichalcum);
    priorityList.push(buildings.KuiperUranium);
    priorityList.push(buildings.KuiperNeutronium);
    priorityList.push(buildings.KuiperElerium);
    priorityList.push(buildings.ErisMission);
    priorityList.push(buildings.ErisDrone);
    priorityList.push(buildings.ErisTank);
    priorityList.push(buildings.ErisTrooper);
    //priorityList.push(buildings.ErisDigsite);

    priorityList.push(buildings.TauStarRingworld);
    priorityList.push(buildings.TauStarMatrix);
    //priorityList.push(buildings.TauStarBluePill);
    priorityList.push(buildings.TauStarEden);

    priorityList.push(buildings.TauMission);
    priorityList.push(buildings.TauDismantle);
    priorityList.push(buildings.TauOrbitalStation);
    priorityList.push(buildings.TauFarm);
    priorityList.push(buildings.TauColony);
    priorityList.push(buildings.TauHousing);
    priorityList.push(buildings.TauExcavate);
    priorityList.push(buildings.TauAlienOutpost);
    priorityList.push(buildings.TauJumpGate);
    priorityList.push(buildings.TauRepository);
    priorityList.push(buildings.TauFactory);
    priorityList.push(buildings.TauDiseaseLab);
    priorityList.push(buildings.TauCasino);
    priorityList.push(buildings.TauCulturalCenter);
    priorityList.push(buildings.TauMiningPit);

    priorityList.push(buildings.TauRedMission);
    priorityList.push(buildings.TauRedOrbitalPlatform);
    priorityList.push(buildings.TauRedContact);
    priorityList.push(buildings.TauRedIntroduce);
    priorityList.push(buildings.TauRedSubjugate);
    //priorityList.push(buildings.TauRedJeff);
    priorityList.push(buildings.TauRedWomlingVillage);
    priorityList.push(buildings.TauRedWomlingFarm);
    priorityList.push(buildings.TauRedWomlingLab);
    priorityList.push(buildings.TauRedWomlingMine);
    priorityList.push(buildings.TauRedWomlingFun);
    priorityList.push(buildings.TauRedOverseer);

    priorityList.push(buildings.TauGasContest);
    priorityList.push(buildings.TauGasName1);
    priorityList.push(buildings.TauGasName2);
    priorityList.push(buildings.TauGasName3);
    priorityList.push(buildings.TauGasName4);
    priorityList.push(buildings.TauGasName5);
    priorityList.push(buildings.TauGasName6);
    priorityList.push(buildings.TauGasName7);
    priorityList.push(buildings.TauGasName8);
    priorityList.push(buildings.TauGasRefuelingStation);
    priorityList.push(buildings.TauGasOreRefinery);
    priorityList.push(buildings.TauGasWhalingStation);
    priorityList.push(buildings.TauGasWomlingStation);

    priorityList.push(buildings.TauBeltMission);
    priorityList.push(buildings.TauBeltPatrolShip);
    priorityList.push(buildings.TauBeltMiningShip);
    priorityList.push(buildings.TauBeltWhalingShip);

    priorityList.push(buildings.TauGas2Contest);
    priorityList.push(buildings.TauGas2Name1);
    priorityList.push(buildings.TauGas2Name2);
    priorityList.push(buildings.TauGas2Name3);
    priorityList.push(buildings.TauGas2Name4);
    priorityList.push(buildings.TauGas2Name5);
    priorityList.push(buildings.TauGas2Name6);
    priorityList.push(buildings.TauGas2Name7);
    priorityList.push(buildings.TauGas2Name8);
    priorityList.push(buildings.TauGas2AlienSurvey);
    priorityList.push(buildings.TauGas2AlienStation);
    priorityList.push(buildings.TauGas2MatrioshkaBrain);
    priorityList.push(buildings.TauGas2IgnitionDevice);
    priorityList.push(buildings.TauGas2IgniteGasGiant);

    priorityList.push(buildings.StargateDepot);
    priorityList.push(buildings.DwarfEleriumContainer);

    priorityList.push(buildings.GasMoonOilExtractor);
    priorityList.push(buildings.NeutronMission);
    priorityList.push(buildings.NeutronStellarForge);
    priorityList.push(buildings.NeutronMiner);

    priorityList.push(buildings.MassDriver);
    priorityList.push(buildings.MetalRefinery);
    priorityList.push(buildings.Casino);
    priorityList.push(buildings.HellSpaceCasino);
    priorityList.push(buildings.RockQuarry);
    priorityList.push(buildings.Sawmill);
    priorityList.push(buildings.GasMining);
    priorityList.push(buildings.Mine);
    priorityList.push(buildings.CoalMine);

    BuildingManager.priorityList = priorityList.filter((b) => b);
    BuildingManager.statePriorityList = priorityList.filter(
      (b) => b && b.isSwitchable(),
    );
  }

  const {
    updateStateFromSettings,
    updateSettingsFromState,
    applySettings,
    migrateSetting,
  } = createSettingsState({
    getSettingsRaw: () => settingsRaw,
    getTriggerManager: () => TriggerManager,
    storage: localStorage,
  });

  function updateStandAloneSettings() {
    let def = {
      scriptName: "TMVictor",
      overrides: {},
      triggers: [],
    };
    settingsSections.forEach((id) => (def[id + "SettingsCollapsed"] = true));
    applySettings(def, false); // For non-overridable settings only

    // Pre-default migrate
    if (settingsRaw.hasOwnProperty("masterScriptToggle")) {
      if (!settingsRaw.hasOwnProperty("autoPrestige")) {
        settingsRaw.autoPrestige = true;
        [
          "job_b1_farmer",
          "job_b2_farmer",
          "job_b3_farmer",
          "job_b1_hunter",
          "job_b2_hunter",
          "job_b3_hunter",
        ].forEach((id) => delete settingsRaw[id]);
      }
      if (!settingsRaw.hasOwnProperty("buildingsLimitPowered")) {
        settingsRaw.buildingsLimitPowered = false;
      }
    }

    // Specific migrations that should only be executed once
    if (!settingsRaw.migrationVersion || settingsRaw.migrationVersion < 1) {
      // Moved upwards in default priority list, needs to be executed before resetting building settings
      // Settings may not exist yet here
      if (
        settingsRaw["bld_p_eden-bliss_den"] &&
        settingsRaw["bld_p_eden-rectory"] &&
        settingsRaw["bld_p_eden-encampment"] &&
        settingsRaw["bld_p_eden-bliss_den"] < settingsRaw["bld_p_eden-rectory"]
      ) {
        settingsRaw["bld_p_eden-rectory"] =
          settingsRaw["bld_p_eden-encampment"] + 1;
      }
      settingsRaw.migrationVersion = 1;
    }

    // Apply default settings
    resetEvolutionSettings(false);
    resetWarSettings(false);
    resetHellSettings(false);
    resetMechSettings(false);
    resetFleetSettings(false);
    resetGovernmentSettings(false);
    resetBuildingSettings(false);
    resetWeightingSettings(false);
    resetMarketSettings(false);
    resetResearchSettings(false);
    resetProjectSettings(false);
    resetJobSettings(false);
    resetMagicSettings(false);
    resetProductionSettings(false);
    resetStorageSettings(false);
    resetGeneralSettings(false);
    resetInterfaceSettings(false);
    resetStateLogSettings(false);
    resetAchievementGuardSettings(false);
    resetChallengeHelperSettings(false);
    resetPrestigeSettings(false);
    resetEjectorSettings(false);
    resetPlanetSettings(false);
    resetLoggingSettings(false);
    resetTriggerSettings(false);
    resetMinorTraitSettings(false);
    resetMutableTraitSettings(false);

    // Validate overrides types, and fix if needed
    for (let key in settingsRaw.overrides) {
      for (let i = 0; i < settingsRaw.overrides[key].length; i++) {
        let override = settingsRaw.overrides[key][i];
        if (
          typeof settingsRaw[key] === "string" &&
          typeof override.ret === "number"
        ) {
          override.ret = String(override.ret);
        }
        if (
          typeof settingsRaw[key] === "number" &&
          typeof override.ret === "string"
        ) {
          override.ret = Number(override.ret);
        }
      }
    }
    // Migrate pre-overrides settings
    settingsRaw.triggers.forEach((t) => {
      // Normalize manually-added boolean triggers to match UI
      if (t.requirementType == "Boolean" && t.requirementCount !== 1) {
        t.requirementId = t.requirementCount
          ? t.requirementId
          : !t.requirementId;
        t.requirementCount = 1;
      }
      // Migrate old trigger IDs
      if (
        (t.requirementType === "unlocked" ||
          t.requirementType === "researched") &&
        techIds["tech-" + t.requirementId]
      ) {
        t.requirementId = "tech-" + t.requirementId;
      }
      if (t.actionType === "research" && techIds["tech-" + t.actionId]) {
        t.actionId = "tech-" + t.actionId;
      }
      // Migrate old trigger checks to overrides
      if (t.requirementType === "unlocked") {
        t.requirementType = "ResearchUnlocked";
        t.requirementCount = 1;
      }
      if (t.requirementType === "researched") {
        t.requirementType = "ResearchComplete";
        t.requirementCount = 1;
      }
      if (t.requirementType === "built") {
        t.requirementType = "BuildingCount";
      }
    });
    if (settingsRaw.hasOwnProperty("productionPrioritizeDemanded")) {
      // Replace checkbox with list
      settingsRaw.productionFoundryWeighting =
        settingsRaw.productionPrioritizeDemanded ? "demanded" : "none";
    }
    settingsRaw.challenge_plasmid =
      settingsRaw.challenge_mastery || settingsRaw.challenge_plasmid; // Merge challenge settings
    if (settingsRaw.hasOwnProperty("res_trade_buy_mtr_Food")) {
      // Reset default market settings for pre-rework configs
      MarketManager.priorityList.forEach(
        (res) => (settingsRaw["res_trade_buy_" + res.id] = true),
      );
    }
    if (settingsRaw.hasOwnProperty("arpa")) {
      // Move arpa from object to strings
      Object.entries(settingsRaw.arpa).forEach(
        ([id, enabled]) => (settingsRaw["arpa_" + id] = enabled),
      );
    }
    // Remove deprecated pre-overrides settings
    [
      "buildingWeightingTriggerConflict",
      "researchAlienGift",
      "arpaBuildIfStorageFullCraftableMin",
      "arpaBuildIfStorageFullResourceMaxPercent",
      "arpaBuildIfStorageFull",
      "productionMoneyIfOnly",
      "autoAchievements",
      "autoChallenge",
      "autoMAD",
      "autoSpace",
      "autoSeeder",
      "foreignSpyManage",
      "foreignHireMercCostLowerThan",
      "userResearchUnification",
      "btl_Ambush",
      "btl_max_Ambush",
      "btl_Raid",
      "btl_max_Raid",
      "btl_Pillage",
      "btl_max_Pillage",
      "btl_Assault",
      "btl_max_Assault",
      "btl_Siege",
      "btl_max_Siege",
      "smelter_fuel_Oil",
      "smelter_fuel_Coal",
      "smelter_fuel_Lumber",
      "planetSettingsCollapser",
      "buildingManageSpire",
      "hellHandleAttractors",
      "researchFilter",
      "challenge_mastery",
      "hellCountGems",
      "productionPrioritizeDemanded",
      "fleetChthonianPower",
      "productionWaitMana",
      "arpa",
      "autoLogging",
    ].forEach((id) => delete settingsRaw[id]);
    [
      "foreignAttack",
      "foreignOccupy",
      "foreignSpy",
      "foreignSpyMax",
      "foreignSpyOp",
    ].forEach((id) =>
      [0, 1, 2].forEach((index) => delete settingsRaw[id + index]),
    );
    ["res_storage_w_", "res_trade_buy_mtr_", "res_trade_sell_mps_"].forEach(
      (id) =>
        Object.values(resources).forEach(
          (resource) => delete settingsRaw[id + resource.id],
        ),
    );
    Object.values(projects).forEach(
      (project) => delete settingsRaw["arpa_ignore_money_" + project.id],
    );
    Object.values(buildings)
      .filter((building) => !building.isSwitchable())
      .forEach(
        (building) => delete settingsRaw["bld_s_" + building._vueBinding],
      );
    // Migrate post-overrides settings
    migrateSetting("prestigeWhiteholeEjectEnabled", "autoEject", (v) => v);
    migrateSetting("mechSaveSupply", "mechSaveSupplyRatio", (v) => (v ? 1 : 0));
    migrateSetting("foreignProtectSoldiers", "foreignProtect", (v) =>
      v ? "always" : "never",
    );
    migrateSetting("prestigeWhiteholeEjectExcess", "ejectMode", (v) =>
      v ? "mixed" : "cap",
    );
    migrateSetting("hellHandlePatrolCount", "autoHell", (v) => v, true);
    migrateSetting("unificationRequest", "prioritizeUnify", (v) =>
      v ? "savereq" : "ignore",
    );
    migrateSetting("queueRequest", "prioritizeQueue", (v) =>
      v ? "savereq" : "ignore",
    );
    migrateSetting("triggerRequest", "prioritizeTriggers", (v) =>
      v ? "savereq" : "ignore",
    );
    migrateSetting("govManage", "autoGovernment", (v) => v);
    migrateSetting("storagePrioritizedOnly", "storageAssignPart", (v) => !v);
    migrateSetting("fleetScanEris", "fleet_outer_pr_spc_eris", (v) =>
      v ? 100 : 0,
    );
    migrateSetting("jobDisableCraftsmans", "productionCraftsmen", (v) =>
      v ? "nocraft" : "always",
    );
    migrateSetting("activeTriggerUI", "activeTargetsUI", (v) => v);
    migrateSetting("autoAssembleGene", "autoGenetics", (v) => v);
    // Handle ingame ID change
    migrateSetting("batportal-harbour", "batportal-harbor", (v) => v);
    migrateSetting("bld_p_portal-harbour", "bld_p_portal-harbor", (v) => v);
    migrateSetting("bld_s_portal-harbour", "bld_s_portal-harbor", (v) => v);
    migrateSetting("bld_s2_portal-harbour", "bld_s2_portal-harbor", (v) => v);
    migrateSetting("bld_m_portal-harbour", "bld_m_portal-harbor", (v) => v);
    migrateSetting("bld_w_portal-harbour", "bld_w_portal-harbor", (v) => v);
    // Migrate setting as override, in case if someone actualy use it
    if (settingsRaw.hasOwnProperty("genesAssembleGeneAlways")) {
      if (settingsRaw.overrides.genesAssembleGeneAlways) {
        settingsRaw.overrides.geneticsAssemble =
          settingsRaw.overrides.genesAssembleGeneAlways.concat(
            settingsRaw.overrides.geneticsAssemble ?? [],
          );
      }
      if (!settingsRaw.genesAssembleGeneAlways) {
        settingsRaw.overrides.geneticsAssemble =
          settingsRaw.overrides.geneticsAssemble ?? [];
        settingsRaw.overrides.geneticsAssemble.push({
          type1: "ResearchComplete",
          arg1: "tech-dna_sequencer",
          type2: "Boolean",
          arg2: true,
          cmp: "==",
          ret: "none",
        });
      }
    }
    if (
      settingsRaw.hasOwnProperty("prestigeWhiteholeEjectAllCount") &&
      settingsRaw.prestigeWhiteholeEjectAllCount <= 20
    ) {
      settingsRaw.overrides.ejectMode = settingsRaw.overrides.ejectMode ?? [];
      settingsRaw.overrides.ejectMode.push({
        type1: "BuildingCount",
        arg1: "interstellar-mass_ejector",
        type2: "Number",
        arg2: settingsRaw.prestigeWhiteholeEjectAllCount,
        cmp: ">=",
        ret: "all",
      });
    }
    if (
      settingsRaw.hasOwnProperty("prestigeAscensionSkipCustom") &&
      !settings.prestigeAscensionSkipCustom
    ) {
      settingsRaw.overrides.autoPrestige =
        settingsRaw.overrides.autoPrestige ?? [];
      settingsRaw.overrides.autoPrestige.push({
        type1: "ResetType",
        arg1: "ascension",
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: false,
      });
    }
    // Garbage collection
    Object.values(crafter).forEach((job) => {
      (delete settingsRaw["job_p_" + job._originalId],
        delete settingsRaw["job_b1_" + job._originalId],
        delete settingsRaw["job_b2_" + job._originalId],
        delete settingsRaw["job_b3_" + job._originalId]);
    });
    // Remove deprecated post-overrides settings
    ["res_containers_m_", "res_crates_m_"].forEach((id) =>
      Object.values(resources).forEach((res) => {
        (delete settingsRaw[id + res.id],
          delete settingsRaw.overrides[id + res.id]);
      }),
    );
    [
      "prestigeWhiteholeEjectAllCount",
      "prestigeWhiteholeDecayRate",
      "genesAssembleGeneAlways",
      "buildingsConflictQueue",
      "buildingsConflictRQueue",
      "buildingsConflictPQueue",
      "fleet_outer_pr_spc_hell",
      "fleet_outer_pr_spc_dwarf",
      "prestigeEnabledBarracks",
      "bld_s2_city-garrison",
      "prestigeAscensionSkipCustom",
      "prestigeBioseedGECK",
      "tickTimeout",
      "minorTraitSettingsCollapsed",
      "fleetOuterMinSyndicate",
      "smelter_fuel_p_Star",
      "replicatorResource",
    ].forEach((id) => {
      (delete settingsRaw[id], delete settingsRaw.overrides[id]);
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

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
  } = createRunGuards({
    getSettings: () => settings,
    getGame: () => game,
    getPoly: () => poly,
    getResources: () => resources,
    getBuildings: () => buildings,
    haveTech,
    getNumberString,
    inflationChallengeMoney: INFLATION_CHALLENGE_MONEY,
    retirementPreparation: RETIREMENT_PREP,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  let queuedSettingsTestActions;
  const { loadQueuedSettings } = createQueuedSettings({
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getGameLog: () => GameLog,
    getUpdateOverrides: () =>
      queuedSettingsTestActions?.updateOverrides ?? updateOverrides,
    getUpdateStandAloneSettings: () =>
      queuedSettingsTestActions?.updateStandAloneSettings ??
      updateStandAloneSettings,
    getUpdateStateFromSettings: () =>
      queuedSettingsTestActions?.updateStateFromSettings ??
      updateStateFromSettings,
    getUpdateSettingsFromState: () =>
      queuedSettingsTestActions?.updateSettingsFromState ??
      updateSettingsFromState,
    getRemoveScriptSettings: () =>
      queuedSettingsTestActions?.removeScriptSettings ?? removeScriptSettings,
    getBuildScriptSettings: () =>
      queuedSettingsTestActions?.buildScriptSettings ?? buildScriptSettings,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      loadQueuedSettings,
      setQueuedSettingsTestContext(context) {
        settings = context.settings;
        settingsRaw = context.settingsRaw;
        state = context.state;
        GameLog = context.GameLog;
        queuedSettingsTestActions = context.actions;
      },
    });
  }

  const { findRequiredResourceWeight } = createResourceWeighting({
    getState: () => state,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      findRequiredResourceWeight,
      setResourceWeightTestContext(context) {
        state = context.state;
      },
    });
  }

  const autoEvolution = createAutoEvolution({
    getGame: () => game,
    getState: () => state,
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getRaces: () => races,
    loadQueuedSettings,
    GameLog,
    getChallenges: () => challenges,
    getEvolutions: () => evolutions,
    getPoly: () => poly,
    getResources: () => resources,
    getImitations: () => imitations,
    getAutoUniverseSelection: () => autoUniverseSelection,
    getAutoPlanetSelection: () => autoPlanetSelection,
  });

  const autoUniverseSelection = createAutoUniverseSelection({
    getGame: () => game,
    getSettings: () => settings,
    getDocument: () => document,
  });

  // function setPlanet from actions.js
  // Produces same set of planets, accurate for v1.0.29
  let { generatePlanets } = createPlanetGeneration({
    getGame: () => game,
    getPoly: () => poly,
    getIsAchievementUnlocked: () => isAchievementUnlocked,
    universes,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      generatePlanets,
      setPlanetGenerationTestContext(context) {
        game = context.game;
        poly = context.poly;
        isAchievementUnlocked = context.isAchievementUnlocked;
      },
    });
  }

  const autoPlanetSelection = createAutoPlanetSelection({
    getGame: () => game,
    getSettings: () => settings,
    getGeneratePlanets: () => generatePlanets,
    getStarLevel,
    getIsAchievementUnlocked: () => isAchievementUnlocked,
    getPlanetBiomeGenus: () => planetBiomeGenus,
    getRaces: () => races,
    getPlanetBiomes: () => planetBiomes,
    getPlanetTraits: () => planetTraits,
    getDocument: () => document,
    getMouseEvent: () => MouseEvent,
  });

  const autoCraft = createAutoCraft({
    getResources: () => resources,
    getGame: () => game,
    getFoundryList: () => foundryList,
    ticksPerSecond,
  });

  const autoGovernment = createAutoGovernment({
    GovernmentManager,
    getSettings: () => settings,
    getGame: () => game,
    guardActive,
    haveTech,
    getGovernor,
    getVueById,
  });

  const autoMerc = createAutoMerc({
    getWarManager: () => WarManager,
    GameLog,
    getState: () => state,
    getSettings: () => settings,
    getResources: () => resources,
    inflationChallengeShouldSaveMoney,
  });

  const autoSpy = createAutoSpy({
    getSpyManager: () => SpyManager,
    getWarManager: () => WarManager,
    getHaveTask: () => haveTask,
    getHaveTech: () => haveTech,
    inflationChallengeShouldSaveMoney,
    getResources: () => resources,
    getSettings: () => settings,
    getPoly: () => poly,
    GameLog,
    getGovName,
    getGame: () => game,
  });

  const autoBattle = createAutoBattle({
    SpyManager,
    WarManager,
    GameLog,
    getState: () => state,
    getSettings: () => settings,
    getGame: () => game,
    guardActive,
    getHealingRate,
    traitVal,
    getOccCosts,
    getGovName,
  });

  const autoHell = createAutoHell({
    WarManager,
    getGame: () => game,
    getSettings: () => settings,
    getBuildings: () => buildings,
    getResources: () => resources,
    getWindow: () => window,
  });

  // TODO: Some way to use servant crafters only
  const autoJobs = createAutoJobs({
    getJobManager: () => JobManager,
    getGame: () => game,
    getJobs: () => jobs,
    isDemonRace,
    isLumberRace,
    getSettings: () => settings,
    traitVal,
    getCrafter: () => crafter,
    getWindow: () => window,
    getBuildings: () => buildings,
    getHaveTech: () => haveTech,
    getResources: () => resources,
    ticksPerSecond,
    getState: () => state,
    findRequiredResourceWeight,
    getPoly: () => poly,
    isCraftingJob: (job) => job instanceof CraftingJob,
    getHaveTask: () => haveTask,
    getFoodConsume,
  });

  const autoTax = createAutoTax({
    KeyManager,
    getPoly: () => poly,
    getResources: () => resources,
    getSettings: () => settings,
    getGame: () => game,
    getVueById,
  });

  const autoAlchemy = createAutoAlchemy({
    AlchemyManager,
    getResources: () => resources,
    getSettings: () => settings,
    getGame: () => game,
    getAchievementStar,
  });

  const autoPylon = createAutoPylon({
    RitualManager,
    getResources: () => resources,
    getSettings: () => settings,
    getGame: () => game,
    getJobs: () => jobs,
    haveTech,
  });

  const { autoQuarry, autoMine, autoExtractor } = createAutoResourceRatios({
    QuarryManager,
    MineManager,
    ExtractorManager,
    getResources: () => resources,
    getSettings: () => settings,
    getBuildings: () => buildings,
    haveTech,
  });

  const autoSmelter = createAutoSmelter({
    SmelterManager,
    getGame: () => game,
    getState: () => state,
    getSettings: () => settings,
    getResources: () => resources,
    getJobs: () => jobs,
    getBuildings: () => buildings,
    haveTech,
  });

  const autoFactory = createAutoFactory({
    FactoryManager,
    getState: () => state,
    getSettings: () => settings,
    getGame: () => game,
    getResources: () => resources,
    findRequiredResourceWeight,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      autoFactory,
      FactoryManager,
      factorySettings: settings,
      factoryState: state,
    });
  }

  const autoMiningDroid = createAutoMiningDroid({ DroidManager });

  const autoGraphenePlant = createAutoGraphenePlant({
    GrapheneManager,
    getResources: () => resources,
  });

  // TODO: Allow configuring priorities between eject\supply\nanite
  const autoConsume = createAutoConsume({
    getResources: () => resources,
    isHungryRace,
  });

  const autoReplicator = createAutoReplicator({
    getReplicatorManager: () => ReplicatorManager,
    getSettings: () => settings,
    getResources: () => resources,
    getGame: () => game,
    getGovernor,
    haveTech,
    getVueById,
  });

  let prestigeLogTestActions;
  const { formatLogString, logPrestige } = createPrestigeLog({
    getSettings: () => settings,
    getGame: () => game,
    getState: () => state,
    getPrestigeTypes: () => prestigeTypes,
    getGameLog: () => GameLog,
    getFastEval: () => fastEval,
    getSaveStateLog: () => prestigeLogTestActions?.saveStateLog ?? saveStateLog,
    getTriggerFileDownload: () =>
      prestigeLogTestActions?.triggerFileDownload ?? triggerFileDownload,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      prestigeLog: { formatLogString, logPrestige },
      setPrestigeLogTestContext(context) {
        settings = context.settings;
        game = context.game;
        state = context.state;
        GameLog = context.GameLog;
        prestigeLogTestActions = context.actions;
      },
    });
  }

  let {
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
  } = createPrestigeEligibility({
    getSettings: () => settings,
    getGame: () => game,
    getResources: () => resources,
    getBuildings: () => buildings,
    getTechIds: () => techIds,
    getMechManager: () => MechManager,
    getHaveTech: () => haveTech,
    getIsAchievementUnlocked: () => isAchievementUnlocked,
  });

  const autoPrestige = createAutoPrestige({
    getState: () => state,
    getSettings: () => settings,
    getGame: () => game,
    getResources: () => resources,
    getBuildings: () => buildings,
    getWarManager: () => WarManager,
    getHaveTech: () => haveTech,
    getVueById,
    logPrestige,
    getIsBioseederPrestigeAvailable: () => isBioseederPrestigeAvailable,
    isCataclysmPrestigeAvailable,
    loadQueuedSettings,
    getTechIds: () => techIds,
    isWhiteholePrestigeAvailable,
    isApocalypsePrestigeAvailable,
    isWitchAscensionPrestigeAvailable,
    isAscensionPrestigeAvailable,
    KeyManager,
    isDemonicPrestigeAvailable,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      autoEvolution,
      autoUniverseSelection,
      autoCraft,
      autoSpy,
      autoPrestige,
      setWave3TestContext(context) {
        foundryList = context.foundryList;
        SpyManager = context.SpyManager;
        buildings = context.buildings;
        haveTask = context.haveTask;
        haveTech = context.haveTech;
        isBioseederPrestigeAvailable = context.isBioseederPrestigeAvailable;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      prestigeEligibility: {
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
      },
      setPrestigeEligibilityTestContext(context) {
        settings = context.settings;
        game = context.game;
        resources = context.resources;
        buildings = context.buildings;
        techIds = context.techIds;
        MechManager = context.MechManager;
        haveTech = context.haveTech;
        isAchievementUnlocked = context.isAchievementUnlocked;
      },
    });
  }

  const autoShapeshift = createAutoShapeshift({
    getGame: () => game,
    getSettings: () => settings,
    getVueById,
  });

  var psychicPowerCost = {
    murder: [10, 8],
    boost: [75, 60],
    assault: [45, 36],
    profit: [65, 52],
    mind_break: [80, 64],
    stun: [100, 80],
  };

  const autoPsychic = createAutoPsychic({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getVueById,
    clickSelector: (selector) => $(selector).click(),
    psychicPowerCost,
  });

  const ocularPowerData = [
    { key: "d", id: "disintegration", locParam: ["X"] },
    { key: "p", id: "petrification", locParam: [resources.Stone.name] },
    { key: "w", id: "wound", locParam: ["X"] },
    { key: "t", id: "telekinesis", locParam: ["X"] },
    { key: "f", id: "fear", locParam: undefined },
    { key: "c", id: "charm", locParam: ["X"] },
  ];

  const autoOcularPowers = createAutoOcularPowers({
    getGame: () => game,
    getSettings: () => settings,
    getVueById,
    traitVal,
    getOcularPowerData: () => ocularPowerData,
    getDocument: () => document,
  });

  const wishData = {
    minor: [
      { id: "Know", loc: "resource_Knowledge_name" },
      { id: "Money", loc: "resource_Money_name" },
      { id: "Res", loc: "wish_resources" },
      { id: "Love", loc: "wish_love" },
      { id: "Excite", loc: "wish_event" },
      { id: "Fame", loc: "wish_fame" },
      { id: "Strength", loc: "wish_strength" },
      { id: "Influence", loc: "wish_influence" },
    ],
    major: [
      { id: "BigMoney", loc: "wish_big_money" },
      { id: "BigRes", loc: "wish_big_resources" },
      { id: "Plasmid", loc: "wish_plasmid" },
      { id: "Power", loc: "wish_power" },
      { id: "Adoration", loc: "wish_adoration" },
      { id: "Thrill", loc: "wish_thrill" },
      { id: "Peace", loc: "wish_peace" },
      { id: "Greatness", loc: "wish_greatness" },
    ],
  };
  const autoWish = createAutoWish({
    getGame: () => game,
    getSettings: () => settings,
    getVueById,
    clickSelector: (selector) => $(selector).click(),
  });

  const autoGenetics = createAutoGenetics({
    KeyManager,
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getVueById,
    ticksPerSecond,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  const autoMarket = createAutoMarket({
    getMarketManager: () => MarketManager,
    getGame: () => game,
    getResources: () => resources,
    getSettings: () => settings,
    getAdjustTradeRoutes: () => adjustTradeRoutes,
    ticksPerSecond,
  });

  const autoGalaxyMarket = createAutoGalaxyMarket({
    getGalaxyTradeManager: () => GalaxyTradeManager,
    getPoly: () => poly,
    getResources: () => resources,
    getSettings: () => settings,
  });

  const autoGatherResources = createAutoGatherResources({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getResourcesPerClick: () => getResourcesPerClick(),
    haveTech,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  const autoBuild = createAutoBuild({
    getBuildingManager: () => BuildingManager,
    getProjectManager: () => ProjectManager,
    getState: () => state,
    getSettings: () => settings,
    getResources: () => resources,
    getGetCostConflict: () => getCostConflict,
  });

  const { getTechConflict } = createTechConflicts({
    getSettings: () => settings,
    getResources: () => resources,
    getState: () => state,
    getGame: () => game,
    getIsAchievementUnlocked: () => isAchievementUnlocked,
    getNumberString,
    guardActive,
    guardBananaRepublicActive,
    retirementChallengeAssistActive,
    retirementPreparationMissing,
    fanatAchievements,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      getTechConflict,
      setTechConflictTestContext(context) {
        settings = context.settings;
        game = context.game;
        state = context.state;
        resources = context.resources;
        buildings = context.buildings;
        isAchievementUnlocked = context.isAchievementUnlocked;
      },
    });
  }

  const autoTrigger = createAutoTrigger({
    getState: () => state,
    inflationChallengeShouldSaveMoney,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  const autoResearch = createAutoResearch({
    getState: () => state,
    getGetCostConflict: () => getCostConflict,
    getBuildingManager: () => BuildingManager,
    getProjectManager: () => ProjectManager,
  });

  var powerOscLock = {}; // { vueBinding: { prev, locked } } — anti-flicker for consumption-limited buildings
  var powerWarnCap = {}; // { vueBinding: { cap, ticks } } — game-imposed cap after a warn-badge shutdown
  const autoPower = createAutoPower({
    getGame: () => game,
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getBuildings: () => buildings,
    getJobs: () => jobs,
    getWindow: () => window,
    getPoly: () => poly,
    getBuildingManager: () => BuildingManager,
    getFleetManager: () => FleetManager,
    getMechManager: () => MechManager,
    getWarManager: () => WarManager,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    Support,
    getPowerOscLock: () => powerOscLock,
    getPowerWarnCap: () => powerWarnCap,
    getCitadelConsumption,
    isHellSupressUseful,
    getGalaxyRegions,
    traitVal,
    getHaveTech: () => haveTech,
    adjustSpire,
    getBestSupplyRatio,
    getHealingRate,
    isHungryRace,
    isPillarFinished,
    getJQuery: () => $,
    getBuildingIds: () => buildingIds,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      expandStorage,
      setStorageExpansionTestContext(context) {
        game = context.game;
        settings = context.settings;
        resources = context.resources;
        buildings = context.buildings;
        StorageManager = context.StorageManager;
      },
    });
  }

  // TODO: Implement preserving of old layout, to reduce flickering
  const autoStorage = createAutoStorage({
    getStorageManager: () => StorageManager,
    getGame: () => game,
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getWindow: () => window,
    getBuildingManager: () => BuildingManager,
    getProjectManager: () => ProjectManager,
    getFleetManagerOuter: () => FleetManagerOuter,
    expandStorage,
  });

  const autoMinorTrait = createAutoMinorTrait({
    getMinorTraitManager: () => MinorTraitManager,
    getResources: () => resources,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      autoMinorTrait,
      MinorTraitManager,
    });
  }

  const autoMutateTrait = createAutoMutateTrait({
    getMutableTraitManager: () => MutableTraitManager,
    getGame: () => game,
    getResources: () => resources,
    GameLog,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  let { adjustTradeRoutes } = createTradeRoutes({
    getSettings: () => settings,
    getGame: () => game,
    getResources: () => resources,
    getMarketManager: () => MarketManager,
    getGovernor,
    inflationChallengeShouldSaveMoney,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      adjustTradeRoutes,
      setTradeRoutesTestContext(context) {
        settings = context.settings;
        game = context.game;
        resources = context.resources;
        MarketManager = context.MarketManager;
      },
    });
  }

  const autoFleetOuter = createAutoFleetOuter({
    getFleetManagerOuter: () => FleetManagerOuter,
    getWarManager: () => WarManager,
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    GameLog,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      galaxyIntelligence: {
        getGalaxyCombatShipPower,
        getPiracyMultiplier,
        galaxyAssaultPending,
        getGalaxyRegions,
      },
      setGalaxyIntelligenceTestContext(context) {
        game = context.game;
        buildings = context.buildings;
        settings = context.settings;
        traitVal = context.traitVal;
      },
    });
  }

  const autoFleet = createAutoFleet({
    getFleetManager: () => FleetManager,
    getGame: () => game,
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getBuildings: () => buildings,
    getGalaxyRegions,
    guardActive,
    cartesian,
    galaxyAssaultPending,
  });

  const autoMech = createAutoMech({
    getMechManager: () => MechManager,
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getHaveTech: () => haveTech,
    getHaveTask: () => haveTask,
    average,
    GameLog,
    getJQuery: () => $,
  });

  let scriptDataTestActions;
  const { updateScriptData, finalizeScriptData } = createScriptDataLifecycle({
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
    getUpdateCraftCost: () =>
      scriptDataTestActions?.updateCraftCost ?? updateCraftCost,
    getResourcesPerClick: () =>
      scriptDataTestActions?.getResourcesPerClick ?? getResourcesPerClick,
    getTicksPerSecond: () =>
      scriptDataTestActions?.ticksPerSecond ?? ticksPerSecond,
    getHaveTech: () => scriptDataTestActions?.haveTech ?? haveTech,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      scriptDataLifecycle: { updateScriptData, finalizeScriptData },
      setScriptDataTestContext(context) {
        settings = context.settings;
        state = context.state;
        game = context.game;
        resources = context.resources;
        buildings = context.buildings;
        WarManager = context.WarManager;
        MarketManager = context.MarketManager;
        BuildingManager = context.BuildingManager;
        SpyManager = context.SpyManager;
        EjectManager = context.EjectManager;
        SupplyManager = context.SupplyManager;
        NaniteManager = context.NaniteManager;
        RitualManager = context.RitualManager;
        scriptDataTestActions = context.actions;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      storageRequirements: { requestStorageFor, calculateRequiredStorages },
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
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  const { checkAffordableCustom, getQueuedItemObj } = createQueueItems({
    getResources: () => resources,
    getPoly: () => poly,
    getMechManager: () => MechManager,
    getBuildingIds: () => buildingIds,
    getArpaIds: () => arpaIds,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      queueItems: { checkAffordableCustom, getQueuedItemObj },
      setQueueItemTestContext(context) {
        resources = context.resources;
        poly = context.poly;
        MechManager = context.MechManager;
        buildingIds = context.buildingIds;
        arpaIds = context.arpaIds;
      },
    });
  }

  const { updatePriorityTargets } = createPriorityTargets({
    getSettings: () => settings,
    getState: () => state,
    getGame: () => game,
    getResources: () => resources,
    getBuildings: () => buildings,
    getTechIds: () => techIds,
    getBuildingIds: () => buildingIds,
    getArpaIds: () => arpaIds,
    getSpyManager: () => SpyManager,
    getFleetManagerOuter: () => FleetManagerOuter,
    getMechManager: () => MechManager,
    getTriggerManager: () => TriggerManager,
    getJQuery: () => $,
    getQueuedItemObj,
    getTechConflict,
    isPrestigeAllowed,
    haveTask,
    inflationChallengeShouldSaveMoney,
    inflationChallengeMoney: INFLATION_CHALLENGE_MONEY,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      updatePriorityTargets: () => updatePriorityTargets(),
      setPriorityTargetsTestContext(context) {
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
      },
    });
  }

  let evolutionResultTestActions;
  const { checkEvolutionResult } = createEvolutionResult({
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getGame: () => game,
    getRaces: () => races,
    getMutableTraitManager: () => MutableTraitManager,
    getGameLog: () => GameLog,
    getDocument: () => document,
    getAddEvolutionSetting: () =>
      evolutionResultTestActions?.addEvolutionSetting ?? addEvolutionSetting,
    getUpdateSettingsFromState: () =>
      evolutionResultTestActions?.updateSettingsFromState ??
      updateSettingsFromState,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      checkEvolutionResult: () => checkEvolutionResult(),
      setEvolutionResultTestContext(context) {
        settings = context.settings;
        settingsRaw = context.settingsRaw;
        state = context.state;
        game = context.game;
        races = context.races;
        MutableTraitManager = context.MutableTraitManager;
        GameLog = context.GameLog;
        evolutionResultTestActions = context.actions;
      },
    });
  }

  const { updateTabs } = createTabRefresh({
    getState: () => state,
    getGame: () => game,
    getBuildings: () => buildings,
    getResources: () => resources,
    getHaveTech: () => haveTech,
    getMainVue: () => win.$("#mainColumn > div:first-child")[0].__vue__,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      updateTabs: (update) => updateTabs(update),
      setTabRefreshTestContext(context) {
        state = context.state;
        game = context.game;
        buildings = context.buildings;
        resources = context.resources;
        haveTech = context.haveTech;
        win = context.win;
      },
    });
  }

  const { getMultiSegmentedTimeLeft } = createTargetTiming({
    getGame: () => game,
    getPoly: () => poly,
    isProject: (target) => target instanceof Project,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  const {
    updateActiveTargetsUI,
    buildActiveTargetsUI,
    removeActiveTargetsUI,
    buildBuildPlannerUI,
    removeBuildPlannerUI,
  } = createQueuePanels({
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
      typeof ResizeObserver === "function" ? ResizeObserver : undefined,
    updateSettingsFromState: () => updateSettingsFromState(),
    makePlannerStats: () => makePlannerStats(),
    savePlannerStats: () => savePlannerStats(),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      plannerAnalysis: {
        plannerLimitingResource,
        makePlannerStats,
        loadPlannerStats,
        savePlannerStats,
      },
      setPlannerAnalysisTestContext(context) {
        game = context.game;
        resources = context.resources;
        state = context.state;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      stateLogLifecycle: {
        makeStateLog,
        loadStateLog,
        saveStateLog,
        stateLogDiff,
        stateLogBlocker,
        recordStateSnapshot,
      },
      setStateLogTestContext(context) {
        game = context.game;
        resources = context.resources;
        state = context.state;
      },
    });
  }

  const { updateBuildPlanner } = createBuildPlanner({
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getGame: () => game,
    getDocument: () => document,
    getJQuery: () => $,
    getPoly: () => poly,
    getNiceNumber,
    plannerLimitingResource,
    loadPlannerStats,
    savePlannerStats,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      updateBuildPlanner: () => updateBuildPlanner(),
      setBuildPlannerTestContext(context) {
        settings = context.settings;
        settingsRaw = context.settingsRaw;
        state = context.state;
        game = context.game;
        resources = context.resources;
        poly = context.poly;
      },
    });
  }

  let stateUpdateTestHelpers;
  const stateUpdateHelpers = {
    checkEvolutionResult,
    updateTriggerSettingsContent,
    updatePriorityTargets,
    calculateRequiredStorages,
    prioritizeDemandedResources,
    updateActiveTargetsUI,
  };

  const { updateState } = createStateUpdate({
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getGame: () => game,
    getResources: () => resources,
    getBuildings: () => buildings,
    getStorageManager: () => StorageManager,
    getProjectManager: () => ProjectManager,
    getTriggerManager: () => TriggerManager,
    getPoly: () => poly,
    getJQuery: () => $,
    getHelpers: () => stateUpdateTestHelpers ?? stateUpdateHelpers,
    isTechnology: (target) => target instanceof Technology,
    isProject: (target) => target instanceof Project,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      updateState: () => updateState(),
      // Real prototypes, so the instanceof classification of queued targets is exercised for real.
      makeStateUpdateTargets() {
        return {
          technology: Object.create(Technology.prototype),
          project: Object.create(Project.prototype),
          building: {},
        };
      },
      setStateUpdateTestContext(context) {
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
        stateUpdateTestHelpers = context.helpers;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      gameActionVerification: {
        verifyGameActions,
        verifyGameActionsExist,
        verifyGameActionExists,
      },
      setGameActionVerificationTestContext(context) {
        game = context.game;
        buildings = context.buildings;
      },
    });
  }

  function initialiseScript() {
    // Init objects and lookup tables
    for (let [key, action] of Object.entries(game.actions.tech)) {
      techIds[action.id] = new Technology(key);
    }
    for (let building of Object.values(buildings)) {
      buildingIds[building._vueBinding] = building;
      // Don't force building Jump Ship and Pit Assault, they're prety expensive at the moment when unlocked.
      if (
        building.isMission() &&
        building !== buildings.BlackholeJumpShip &&
        building !== buildings.PitAssaultForge
      ) {
        state.missionBuildingList.push(building);
      }
    }
    for (let project of Object.values(projects)) {
      arpaIds[project._vueBinding] = project;
    }
    for (let job of Object.values(jobs)) {
      jobIds[job._originalId] = job;
    }
    for (let job of Object.values(crafter)) {
      jobIds[job._originalId] = job;
    }

    updateStandAloneSettings();
    updateStateFromSettings();
    updateSettingsFromState();

    TriggerManager.priorityList.forEach((trigger) => {
      trigger.complete = false;
    });

    // If debug logging is enabled then verify the game actions code is both correct and in sync with our script code
    if (checkActions) {
      verifyGameActions();
    }

    // Normal popups
    new MutationObserver(tooltipObserverCallback).observe(
      document.getElementById("main"),
      { childList: true },
    );

    // Modals; check script callbacks and add Space Dock tooltips
    new MutationObserver((bodyMutations) =>
      bodyMutations.forEach((bodyMutation) =>
        bodyMutation.addedNodes.forEach((node) => {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.classList.contains("modal")
          ) {
            if (WindowManager.openedByScript) {
              node.style.display = "none"; // Hide splash
              new MutationObserver(WindowManager.checkCallbacks).observe(
                document.getElementById("modalBox"),
                { childList: true },
              );
            } else {
              new MutationObserver(tooltipObserverCallback).observe(node, {
                childList: true,
              });
            }
          }
        }),
      ),
    ).observe(document.querySelector("body"), { childList: true });

    // Log filtering
    buildFilterRegExp();
    new MutationObserver(filterLog).observe(
      document.getElementById("msgQueueLog"),
      { childList: true },
    );
  }

  const { buildFilterRegExp, filterLog } = createLogFilter({
    getSettingsRaw: () => settingsRaw,
    getSettings: () => settings,
    getState: () => state,
    getPoly: () => poly,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      logFilter: { buildFilterRegExp, filterLog },
      setLogFilterTestContext(context) {
        settingsRaw = context.settingsRaw;
        settings = context.settings;
        state = context.state;
        poly = context.poly;
      },
    });
  }

  const { getTooltipInfo, tooltipObserverCallback, addTooltip } =
    createTooltipUI({
      getContext: () => ({
        $,
        document,
        MutationObserver,
        settings,
        state,
        game,
        buildings,
        jobs,
        resources,
        techIds,
        buildingIds,
        arpaIds,
        MechManager,
        FleetManagerOuter,
        poly,
        getCitadelConsumption,
        getNiceNumber,
        getCostConflict,
        getTechConflict,
        haveTech,
        getHealingRate,
        getGrowthRate,
        getGovernor,
        traitVal,
      }),
      isTechnology: (value) => value instanceof Technology,
    });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      tooltipUI: { getTooltipInfo, tooltipObserverCallback, addTooltip },
      setTooltipUITestContext(context) {
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
  }
  function updateOverrides() {
    // Safe mode doesn't update overrides and always disables script toggle
    if (safeMode) {
      Object.assign(settings, settingsRaw);
      settings.masterScriptToggle = false;
      return;
    }

    let xorLists = {};
    let overrides = {};
    for (let key in settingsRaw.overrides) {
      let conditions = settingsRaw.overrides[key];
      for (let i = 0; i < conditions.length; i++) {
        let check = conditions[i];
        try {
          if (!checkTypes[check.type1]) {
            throw `${check.type1} variable not found`;
          }
          if (!checkTypes[check.type2]) {
            throw `${check.type2} variable not found`;
          }
          if (!checkCompare[check.cmp]) {
            throw `${checkCompare[check.cmp]} comparator not found`;
          }
          let var1 = checkTypes[check.type1].fn(check.arg1);
          let var2 = checkTypes[check.type2].fn(check.arg2);
          if (!checkCompare[check.cmp](var1, var2)) {
            continue;
          }
          let ret = checkCustom[check.cmp] ? var2 : check.ret;

          if (typeof settingsRaw[key] === typeof ret) {
            // Override single value
            overrides[key] = ret;
            break;
          } else if (typeof settingsRaw[key] === "object") {
            // Xor lists
            xorLists[key] = xorLists[key] ?? [];
            xorLists[key].push(ret);
          } else {
            throw `Expected type: ${typeof settingsRaw[
              key
            ]}; Override type: ${typeof ret}`;
          }
        } catch (error) {
          let msg = `Condition ${
            i + 1
          } for setting ${key} invalid! Fix or remove it. (${error})`;
          if (
            !WindowManager.isOpen() &&
            !Object.values(game.global.lastMsg.all).find((log) => log.m === msg)
          ) {
            // Don't spam with errors
            GameLog.logDanger("special", msg, ["events", "major_events"]);
          }
          continue; // Some argument not valid, skip condition
        }
      }
    }

    if (haveTask("bal_storage") || haveTask("combo_storage")) {
      overrides["autoStorage"] = false;
    }
    if (haveTask("trash")) {
      overrides["autoEject"] = false;
    }
    if (haveTask("tax")) {
      overrides["autoTax"] = false;
    }
    let rawTickRate = overrides["tickRate"] ?? settingsRaw["tickRate"];
    overrides["tickRate"] = Math.min(
      240,
      Math.max(1, Math.round(rawTickRate * 2)) / 2,
    );

    // Apply overrides
    Object.assign(settings, settingsRaw, overrides);

    // Xor lists
    for (let key in xorLists) {
      settings[key] = settingsRaw[key].slice();
      for (let item of xorLists[key]) {
        let index = settings[key].indexOf(item);
        if (index > -1) {
          settings[key].splice(index, 1);
        } else {
          settings[key].push(item);
        }
      }
    }

    let currentNode = $(`#script_override_true_value:visible`);
    if (currentNode.length !== 0) {
      changeDisplayInputNode(currentNode);
    }
  }

  const customRaceGenusOpposition = {
    humanoid: ["fungi"],
    carnivore: ["herbivore"],
    herbivore: ["carnivore"],
    small: ["giant"],
    giant: ["small"],
    reptilian: ["avian"],
    avian: ["reptilian"],
    insectoid: ["plant"],
    plant: ["insectoid"],
    fungi: ["humanoid"],
    aquatic: ["sand"],
    fey: ["eldritch", "synthetic"],
    heat: ["polar"],
    polar: ["heat"],
    sand: ["aquatic"],
    demonic: ["angelic"],
    angelic: ["demonic"],
    synthetic: ["eldritch", "fey"],
    eldritch: ["synthetic", "fey"],
  };

  const {
    customRaceRankCost,
    customRaceGeneBalance,
    customRaceRankOptions,
    customRaceTraitEffect,
    customRaceEditorTraits,
    customRaceDraftFromPreset,
  } = createCustomRaceModel({
    getGame: () => game,
    getPoly: () => poly,
    getResources: () => resources,
    getRaces: () => races,
    genusOpposition: customRaceGenusOpposition,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  const {
    showCustomRaceImportStatus,
    getCustomRacePreset,
    refreshCustomRacePresetSelectors,
    buildCustomRacePresetEditor,
    importCustomRaceIntoLab,
    automateLab,
  } = createCustomRaceUI({
    getContext: () => ({
      $,
      document,
      settingsRaw,
      settings,
      state,
      game,
      poly,
      customRaceDraftFromPreset,
      customRaceEditorTraits,
      customRaceRankOptions,
      customRaceTraitEffect,
      customRaceGeneBalance,
      updateSettingsFromState,
      updateOverrides,
      getVueById,
      alert: (message) => alert(message),
    }),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      customRaceUI: {
        showCustomRaceImportStatus,
        getCustomRacePreset,
        refreshCustomRacePresetSelectors,
        buildCustomRacePresetEditor,
        importCustomRaceIntoLab,
        automateLab,
      },
      setCustomRaceUITestContext(context) {
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
  }
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

  const { automate } = createTickOrchestration({
    getSettings: () => settings,
    getState: () => state,
    getGame: () => game,
    getResources: () => resources,
    getKeyManager: () => KeyManager,
    getNaniteManager: () => NaniteManager,
    getSupplyManager: () => SupplyManager,
    getEjectManager: () => EjectManager,
    getControllers: () => tickTestControllers ?? tickControllers,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  function mainAutoEvolveScript() {
    // This is a hack to check that the entire page has actually loaded. The queueColumn is one of the last bits of the DOM
    // so if it is there then we are good to go. Otherwise, wait a little longer for the page to load.
    if (document.getElementById("queueColumn") === null) {
      setTimeout(mainAutoEvolveScript, 100);
      return;
    }

    // We'll need real window to access vue objects
    if (typeof unsafeWindow !== "undefined") {
      win = unsafeWindow;
    } else {
      win = window;
      // Chrome overrides original JQuery with one required by script, we need to restore it to get $._data with events handlers
      // I'd get rid of this JQuery copy altogether, that's a right way to do it. No duplicate - no conflicts... But that breaks that damn FF.
      if (!win.$._data(win.document).events?.["keydown"]) {
        $.noConflict();
      }
    }
    game = win.evolve;

    // Check if game exposing anything
    if (!game) {
      if (state.warnDebug) {
        state.warnDebug = false;
        alert("You need to enable Debug Mode in settings for script to work");
      }
      setTimeout(mainAutoEvolveScript, 100);
      return;
    }

    // Wait until exposed data fully initialized ('p' in fastLoop, 'c' in midLoop)
    if (!game.global?.race || !game.breakdown.p.consume) {
      setTimeout(mainAutoEvolveScript, 100);
      return;
    }

    // Now we can check setting. Ensure game tabs are preloaded
    if (!game.global.settings.tabLoad) {
      if (state.warnPreload) {
        state.warnPreload = false;
        alert(
          "You need to enable Preload Tab Content in settings for script to work",
        );
      }
      setTimeout(mainAutoEvolveScript, 100);
      return;
    }

    // Make sure we have jQuery UI even if script was injected without *monkey
    if (!$.ui) {
      let el = document.createElement("script");
      el.src = "https://code.jquery.com/ui/1.12.1/jquery-ui.min.js";
      el.onload = mainAutoEvolveScript;
      el.onerror = () =>
        alert("Can't load jQuery UI. Check browser console for details.");
      document.body.appendChild(el);
      return;
    }

    // Dealing with userscript sandbox
    // With our @grant none we usually try to run in the page context. This is normally bad for userscripts (can be detected by the page etc)
    // but this is perfect since the game has debug mode built in on purpose just for us. We get the best possible performance too and there
    // is no security risk because we don't use any special browser/userscript/GM_ APIs.
    //
    // But depending on the userscript manager and browser it is possible we end up in the sandbox anyway.
    // They are not all alike in how they load scripts.
    // The default functions in poly. call cloneInto() on a whole bunch of stuff to make the script work when sandboxed in Firefox.
    // Chrome's sandbox is probably just broken in general, but luckily the most common ones will not sandbox us.
    //
    // But, even when we are not sandboxed, some userscript managers set unsafeWindow and cloneInto anyway, for compatibility.
    // This will work fine in the rest of the script's detections, since there it is not performance relevant, but these functions are much slower
    // than the game's original functions. So, include a check to make sure that it is worth using cloneInto.
    // The rest of the checks don't need adjusting as unsafeWindow === window in this case and they all use the same code anyway,
    // so there is no performance loss there.
    // If we don't need the sandboxed functions, we can discard our poly. wrappers and directly call the game's ones.
    needSandboxBypass =
      typeof unsafeWindow === "object" &&
      typeof cloneInto === "function" &&
      typeof exportFunction === "function" &&
      unsafeWindow !== window;
    if (!needSandboxBypass) {
      poly.adjustCosts = game.adjustCosts;
      poly.loc = game.loc;
      poly.messageQueue = game.messageQueue;
      poly.shipCosts = game.shipCosts;
    }

    addErrorHandler();
    addScriptStyle();
    KeyManager.init();
    initialiseState();
    initialiseRaces();
    initialiseScript();
    updateOverrides();

    // Hook to game loop, to allow script run at full speed in unfocused tab
    const setCallback = (fn) =>
      !needSandboxBypass ? fn : exportFunction(fn, unsafeWindow);
    // This should be the last var set in game's debug.js:updateDebugData(), otherwise we may be working with partially outdated data
    let breakdown = game.breakdown;
    Object.defineProperty(game, "breakdown", {
      get: setCallback(() => breakdown),
      set: setCallback((v) => {
        breakdown = v;
        state.gameTicked = true;
        if (settings.tickSchedule) {
          setTimeout(automate);
        } else {
          automate();
        }
      }),
    });
    // Game disables workers in lab ui, we need to check that outside of debug hook
    setInterval(automateLab, 2500);

    // Expose saving/loading functions so that they can be called by other scripts
    win.importAutomationSettings = importSettings;
    win.exportAutomationSettings = exportSettings;
    win.eaExportStateLog = () =>
      triggerFileDownload(
        JSON.stringify(state.stateLog ?? loadStateLog()),
        `evolve-statelog-manual-d${game.global.stats.days}.json`,
      );

    // Safe mode warning, if active. Hope users can't miss it
    if (safeMode) {
      const msg = [
        `Script safe mode is active to let you solve problems in your configuration.`,
        `The masterScriptToggle is always disabled in this mode, and your overrides don't get evaluated.`,
        `Fix the problems that required you to use this mode, then remove ?safemode from the URL to deactivate.`,
      ].join("\n");
      displayScriptWarningNode("Safe mode active", msg, null);
      poly.messageQueue(msg, "warning", true, ["events", "major_events"]);
    }
  }

  const {
    updateDebugData,
    addScriptStyle,
    checkIgnoredError,
    displayScriptWarningNode,
    addErrorHandler,
  } = createScriptRuntimeUI({
    getContext: () => ({
      $,
      document,
      state,
      game,
      win,
      createOptionsModal,
      openOptionsModal,
      scriptVersionExtra: SCRIPT_VERSION_EXTRA,
    }),
  });
  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  const {
    prestigeTypes,
    prestigeOptions,
    checkCompare,
    checkCustom,
    argType,
    checkTypes,
    retBools,
    overrideOnlyChecks,
  } = createOverrideCatalog({
    getContext: () => ({
      settings,
      settingsRaw,
      state,
      game,
      buildingIds,
      buildings,
      resources,
      techIds,
      arpaIds,
      jobIds,
      races,
      GovernmentManager,
      SmelterManager,
      FactoryManager,
      WarManager,
      universes,
      governors,
      challenges,
      biomeList,
      traitList,
      buildSelectOptions,
      fastEval,
      getGovernor,
    }),
  });
  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  let interfaceSettingsTestActions;
  const interfaceSettingsActions = {
    resetInterfaceSettings,
    updateSettingsFromState,
    buildSettingsSection,
    addSettingsToggle,
    addSettingsHeader1,
    buildActiveTargetsUI,
    removeActiveTargetsUI,
    buildBuildPlannerUI,
    removeBuildPlannerUI,
    updatePrestigeInTopBar,
    updateTotalDaysInTopBar,
  };

  const { buildInterfaceSettings, updateInterfaceSettingsContent } =
    createInterfaceSettings({
      getSettingsRaw: () => settingsRaw,
      getDocument: () => document,
      getJQuery: () => $,
      getActions: () =>
        interfaceSettingsTestActions ?? interfaceSettingsActions,
    });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      interfaceSettings: {
        buildInterfaceSettings,
        updateInterfaceSettingsContent,
      },
      setInterfaceSettingsTestContext(context) {
        settingsRaw = context.settingsRaw;
        interfaceSettingsTestActions = context.actions;
      },
    });
  }

  const { buildStateLogSettings, updateStateLogSettingsContent } =
    createStateLogSettings({
      getDocument: () => document,
      getJQuery: () => $,
      resetStateLogSettings,
      updateSettingsFromState,
      buildSettingsSection,
      addSettingsToggle,
      addSettingsNumber,
    });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      stateLogSettings: {
        buildStateLogSettings,
        updateStateLogSettingsContent,
      },
      setStateLogSettingsTestContext(context) {
        settingsRaw = context.settingsRaw;
      },
    });
  }

  const { calculateMechStats } = createMechStats({
    getDocument: () => document,
    getJQuery: () => $,
    getMechManager: () => MechManager,
    getPoly: () => poly,
    getGame: () => game,
    average,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      calculateMechStats,
      setMechStatsTestContext(context) {
        game = context.game;
        poly = context.poly;
        MechManager = context.MechManager;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      settingsBoundaries: {
        general: generalSettings,
        achievementGuard: achievementGuardSettings,
        challengeHelper: challengeHelperSettings,
        prestige: prestigeSettings,
        government: governmentSettings,
        evolution: evolutionSettings,
        planet: planetSettings,
        trigger: triggerSettings,
        research: researchSettings,
        war: warSettings,
        hell: hellSettings,
        fleet: fleetSettings,
        mech: mechSettings,
        ejector: ejectorSettings,
        market: marketSettings,
      },
      setSettingsBoundariesTestContext(context) {
        Object.assign(generalSettingsOverrides, context);
        Object.assign(achievementGuardSettingsOverrides, context);
        Object.assign(challengeHelperSettingsOverrides, context);
        Object.assign(prestigeSettingsOverrides, context);
        Object.assign(governmentSettingsOverrides, context);
        Object.assign(evolutionSettingsOverrides, context);
        Object.assign(planetSettingsOverrides, context);
        Object.assign(triggerSettingsOverrides, context);
        Object.assign(researchSettingsOverrides, context);
        Object.assign(warSettingsOverrides, context);
        Object.assign(hellSettingsOverrides, context);
        Object.assign(fleetSettingsOverrides, context);
        Object.assign(mechSettingsOverrides, context);
        Object.assign(ejectorSettingsOverrides, context);
        Object.assign(marketSettingsOverrides, context);
      },
    });
  }

  const {
    buildTraitSettings,
    updateImitateWarning,
    updateTraitSettingsContent,
    makeToggleSwitchesMutuallyExclusive,
  } = createTraitSettings({
    getSettingsRaw: () => settingsRaw,
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
    getDocument: () => document,
    getJQuery: () => $,
    getSorterHelper: () => sorterHelper,
    resetMinorTraitSettings,
    resetMutableTraitSettings,
    updateSettingsFromState,
    resetCheckbox,
    buildSettingsSection,
    addStandardHeading,
    addSettingsSelect,
    addSettingsNumber,
    addSettingsToggle,
    addTableToggle,
    addTableInput,
    buildTableLabel,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      traitSettings: {
        buildTraitSettings,
        updateImitateWarning,
        updateTraitSettingsContent,
        makeToggleSwitchesMutuallyExclusive,
      },
      setTraitSettingsTestContext(context) {
        settingsRaw = context.settingsRaw;
        state = context.state;
        game = context.game;
        races = context.races;
        resources = context.resources;
        poly = context.poly;
        MinorTraitManager = context.MinorTraitManager;
        MutableTraitManager = context.MutableTraitManager;
      },
    });
  }

  let uiRefreshTestActions;
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

  const { updateSoulGemRate } = createSoulGemRateDisplay({
    getState: () => state,
    getResources: () => resources,
    getJQuery: () => $,
    getNiceNumber: (value) =>
      (uiRefreshTestActions ?? uiRefreshActions).getNiceNumber(value),
  });

  const { renderPreviousGameStats } = createPreviousGameStats({
    getGame: () => game,
    getWin: () => win,
    getJQuery: () => $,
    storage: localStorage,
  });

  const { repairRuntimeAdapters } = createRuntimeAdapters({
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getGame: () => game,
    getJQuery: () => $,
    getActions: () => uiRefreshTestActions ?? uiRefreshActions,
  });

  const { ensureAutomationContainer } = createAutomationContainer({
    getSettingsRaw: () => settingsRaw,
    getJQuery: () => $,
    getSafeMode: () => safeMode,
    getOverrideKeyLabel: () => overrideKeyLabel,
    getActions: () => uiRefreshTestActions ?? uiRefreshActions,
  });

  const { updateUI } = createUIRefresh({
    getDocument: () => document,
    getActions: () => uiRefreshTestActions ?? uiRefreshActions,
    getPhases: () => ({
      ensureAutomationContainer,
      repairRuntimeAdapters,
      updateSoulGemRate,
      renderPreviousGameStats,
    }),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
        uiRefreshTestActions = context.actions;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      remainingUiBoundaries: {
        storage: storageBoundary,
        magic: magicBoundary,
        jobs: jobsBoundary,
        weighting: weightingBoundary,
        building: buildingBoundary,
        project: projectBoundary,
        logging: loggingBoundary,
        options: optionsBoundary,
        prestigeTopBar: prestigeTopBarBoundary,
        totalDaysTopBar: totalDaysTopBarBoundary,
        arpaToggles: arpaTogglesBoundary,
        craftToggles: craftTogglesBoundary,
        buildingToggles: buildingTogglesBoundary,
        ejectToggles: ejectTogglesBoundary,
        supplyToggles: supplyTogglesBoundary,
      },
      setRemainingUiBoundariesTestContext(context) {
        if ("settingsRaw" in context) settingsRaw = context.settingsRaw;
        if ("settings" in context) settings = context.settings;
        if ("game" in context) game = context.game;
        if ("state" in context) state = context.state;
        if ("resources" in context) resources = context.resources;
        if ("jobs" in context) jobs = context.jobs;
        if ("craftablesList" in context)
          craftablesList = context.craftablesList;
        if ("StorageManager" in context)
          StorageManager = context.StorageManager;
        if ("AlchemyManager" in context)
          AlchemyManager = context.AlchemyManager;
        if ("RitualManager" in context) RitualManager = context.RitualManager;
        if ("JobManager" in context) JobManager = context.JobManager;
        if ("BuildingManager" in context)
          BuildingManager = context.BuildingManager;
        if ("ProjectManager" in context)
          ProjectManager = context.ProjectManager;
        if ("EjectManager" in context) EjectManager = context.EjectManager;
        if ("SupplyManager" in context) SupplyManager = context.SupplyManager;
        Object.assign(storageBoundaryOverrides, context);
        Object.assign(magicBoundaryOverrides, context);
        Object.assign(jobsBoundaryOverrides, context);
        Object.assign(weightingBoundaryOverrides, context);
        Object.assign(buildingBoundaryOverrides, context);
        Object.assign(projectBoundaryOverrides, context);
        Object.assign(loggingBoundaryOverrides, context);
        Object.assign(optionsBoundaryOverrides, context);
        Object.assign(prestigeTopBarBoundaryOverrides, context);
        Object.assign(totalDaysTopBarBoundaryOverrides, context);
        Object.assign(arpaTogglesBoundaryOverrides, context);
        Object.assign(craftTogglesBoundaryOverrides, context);
        Object.assign(buildingTogglesBoundaryOverrides, context);
        Object.assign(ejectTogglesBoundaryOverrides, context);
        Object.assign(supplyTogglesBoundaryOverrides, context);
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
      setFinalInlineUiBoundariesTestContext(context) {
        if ("settingsRaw" in context) settingsRaw = context.settingsRaw;
        if ("state" in context) state = context.state;
        if ("game" in context) game = context.game;
        if ("resources" in context) resources = context.resources;
        if ("MarketManager" in context) MarketManager = context.MarketManager;
        if ("StorageManager" in context)
          StorageManager = context.StorageManager;
        if ("MechManager" in context) MechManager = context.MechManager;
      },
    });
  }

  const { sorterHelper } = createSortHelper({
    getJQuery: () => $,
    isHTMLElement: (value) => value instanceof HTMLElement,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, { sorterHelper });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      gameRates: {
        ticksPerSecond,
        getHealingRate,
        getFoodConsume,
        getGrowthRate,
        getResourcesPerClick,
      },
      setGameRateTestContext(context) {
        settings = context.settings;
        game = context.game;
        buildings = context.buildings;
        state = context.state;
        resources = context.resources;
        jobs = context.jobs;
        traitVal = context.traitVal;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      getCostConflict,
      setCostConflictTestContext(context) {
        state = context.state;
        resources = context.resources;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    window.__EA_TEST_HOOKS__.numberFormatting = {
      getRealNumber,
      getNumberString,
      getNiceNumber,
    };
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      runtimeQueries: { getGovernor, haveTask, haveTech, isEarlyGame },
      setRuntimeQueryTestContext(context) {
        game = context.game;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      raceProfile: { isHungryRace, isDemonRace, isLumberRace, getOccCosts },
      setRaceProfileTestContext(context) {
        game = context.game;
        traitVal = context.traitVal;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      foreignGovernment: { getGovName, getGovPower },
      setForeignGovernmentTestContext(context) {
        game = context.game;
        poly = context.poly;
      },
    });
  }

  var evalCache = {};
  function fastEval(s) {
    if (!evalCache[s]) {
      evalCache[s] = eval(`(function() { return ${s} })`);
    }
    return evalCache[s]();
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      propertyHelpers: { normalizeProperties, addProps },
      setPropertyHelperTestContext(context) {
        settings = context.settings;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      browserRuntime: { getVueById, triggerFileDownload },
      setBrowserRuntimeTestContext(context) {
        win = context.win;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      traitVal,
      setTraitValueTestContext(context) {
        game = context.game;
      },
    });
  }

  let settingsTransferTestActions;
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

  const { importSettings, exportSettings } = createSettingsTransfer({
    getSettingsRaw: () => settingsRaw,
    setSettingsRaw: (value) => {
      settingsRaw = value;
    },
    getJQuery: () => $,
    getGameLog: () => GameLog,
    getActions: () => settingsTransferTestActions ?? settingsTransferActions,
    confirmImport: (message) => confirm(message),
    logToConsole: (message) => console.log(message),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      settingsTransfer: { importSettings, exportSettings },
      setSettingsTransferTestContext(context) {
        settingsRaw = context.settingsRaw;
        GameLog = context.GameLog;
        settingsTransferTestActions = context.actions;
      },
    });
  }

  var poly = createGameCompatibility({
    getGame: () => game,
    getBuildings: () => buildings,
    getTraitVal: () => traitVal,
    getHaveTech: () => haveTech,
    getGovernor: () => getGovernor(),
    getVueById: (...args) => getVueById(...args),
    normalizeProperties,
    cloneInto: (...args) => cloneInto(...args),
    getUnsafeWindow: () => unsafeWindow,
    getDate: () => new Date(),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      gameCompatibility: poly,
    });
  }

  $().ready(mainAutoEvolveScript);
})($);
