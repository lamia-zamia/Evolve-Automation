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
import { createFastEvaluator } from "./utils/fast-evaluator.ts";
import { createNumberFormatting } from "./formatting/numbers.ts";
import { createSettingsState } from "./settings/state.ts";
import { createResetSettings } from "./settings/reset-settings.ts";
import { createSettingsMigration } from "./settings/migration.ts";
import { createOverrideEvaluation } from "./settings/override-evaluation.ts";
import { createQueuedSettings } from "./settings/queued-settings.ts";
import { createSettingsTransfer } from "./settings/transfer.ts";
import { createRuntimeQueries } from "./game/runtime-queries.ts";
import { createTraitManagers } from "./game/trait-managers.ts";
import { createIndustryManagers } from "./game/industry-managers.ts";
import { createMagicManagers } from "./game/magic-managers.ts";
import { createDisposalManagers } from "./game/disposal-managers.ts";
import { createProductionManagers } from "./game/production-managers.ts";
import { createEconomyManagers } from "./game/economy-managers.ts";
import { createForeignAffairsManagers } from "./game/foreign-affairs-managers.ts";
import { createFleetManagers } from "./game/fleet-managers.ts";
import { createMechManager } from "./game/mech-manager.ts";
import { createInfrastructureManagers } from "./game/infrastructure-managers.ts";
import { createScriptBootstrap } from "./game/script-bootstrap.ts";
import { createCoreManagers } from "./game/core-managers.ts";
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
import { createBuildingStateInitialization } from "./game/building-state.ts";
import { createRaceInitialization } from "./game/race-initialization.ts";
import { createStateInitialization } from "./game/state-initialization.ts";
import { findCostConflict } from "./domain/cost-conflicts.ts";
import { readCostConflictInput } from "./adapters/evolve/cost-conflicts.ts";
import { findPlannerLimit } from "./domain/planner-analysis.ts";
import {
  readPlannerLimitInput,
  readPlannerRun,
} from "./adapters/evolve/planner-analysis.ts";
import { createPlannerStatsStore } from "./adapters/storage/planner-stats.ts";
import { createPlannerStatsLifecycle } from "./application/planner-stats.ts";
import { createBuildPlanner } from "./planning/build-planner.ts";
import { createStorageExpansion } from "./bootstrap/storage-expansion.ts";
import { readStorageRequirementsInput } from "./adapters/evolve/storage-requirements.ts";
import { planStorageRequirements } from "./domain/storage-requirements.ts";
import { readDemandPrioritizationInput } from "./adapters/evolve/demand-prioritization.ts";
import { planDemandPrioritization } from "./domain/demand-prioritization.ts";
import { createPriorityTargets } from "./planning/priority-targets.ts";
import { decideEvolutionResult } from "./domain/evolution-result.ts";
import { readEvolutionResultInput } from "./adapters/evolve/evolution-result.ts";
import { formatEvolutionLog } from "./application/evolution-result.ts";
import {
  assessAuthorityRemoval as assessAuthorityRemovalPolicy,
  calculateAuthorityPerSoldier,
  calculateRequiredAuthorityGarrison,
  predictAuthorityAfterRemovingSoldiers,
  resolveAuthorityTarget,
} from "./domain/authority.ts";
import {
  readAuthorityPolicyView,
  readAuthorityQuantity,
} from "./adapters/evolve/authority.ts";
import { isCostAffordable } from "./domain/cost-affordability.ts";
import {
  readCostAffordabilityInput,
  readQueueTarget,
} from "./adapters/evolve/queue-items.ts";
import { calculateTargetTiming } from "./domain/target-timing.ts";
import { readTargetTimingInput } from "./adapters/evolve/target-timing.ts";
import { findRequiredResourceWeight as findRequiredResourceWeightPolicy } from "./domain/resource-weighting.ts";
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
import {
  assessRetirementPreparation as assessRetirementPreparationPolicy,
  isRetirementAssistActive as isRetirementAssistActivePolicy,
} from "./domain/retirement-prep.ts";
import {
  readRetirementAssistInput,
  readRetirementPreparationInput,
} from "./adapters/evolve/retirement-prep.ts";
import { formatRetirementShortfalls } from "./application/retirement-prep.ts";
import {
  calculateAchievementStarLevel,
  isAchievementGuardActive,
  isAchievementUnlocked as isAchievementUnlockedPolicy,
} from "./domain/achievement-guards.ts";
import {
  readAchievementGuardInput,
  readAchievementStar,
  readAchievementStarLevelContext,
} from "./adapters/evolve/achievement-guards.ts";
import {
  isBananaRepublicGuardActive as isBananaRepublicGuardActivePolicy,
  isBananaRepublicReadyForUnification as isBananaRepublicReadyForUnificationPolicy,
  isBananaRepublicSmoothieComplete as isBananaRepublicSmoothieCompletePolicy,
} from "./domain/banana-republic.ts";
import {
  readBananaRepublicGuardInput,
  readBananaRepublicObjective,
  readBananaRepublicProgress,
  readBananaRepublicSmoothieInput,
} from "./adapters/evolve/banana-republic.ts";
import {
  inflationSecondsToFinish as inflationSecondsToFinishPolicy,
  isInflationAssistActive as isInflationAssistActivePolicy,
  isInflationMoneyReachable as isInflationMoneyReachablePolicy,
  shouldSaveInflationMoney as shouldSaveInflationMoneyPolicy,
} from "./domain/inflation-assist.ts";
import {
  readInflationAssistInput,
  readInflationMoneyInput,
  readInflationSaveInput,
} from "./adapters/evolve/inflation-assist.ts";
import {
  getBlackholeMass as getBlackholeMassPolicy,
  isApocalypsePrestigeAvailable as isApocalypsePrestigeAvailablePolicy,
  isAscensionPrestigeAvailable as isAscensionPrestigeAvailablePolicy,
  isBioseedPrestigeAvailable as isBioseedPrestigeAvailablePolicy,
  isCataclysmPrestigeAvailable as isCataclysmPrestigeAvailablePolicy,
  isDemonicPrestigeAvailable as isDemonicPrestigeAvailablePolicy,
  isGeckNeeded as isGeckNeededPolicy,
  isPillarFinished as isPillarFinishedPolicy,
  isPrestigeAllowed as isPrestigeAllowedPolicy,
  isWhiteholePrestigeAvailable as isWhiteholePrestigeAvailablePolicy,
  isWitchAscensionPrestigeAvailable as isWitchAscensionPrestigeAvailablePolicy,
} from "./domain/prestige-eligibility.ts";
import {
  readAscensionEligibilityView,
  readGeckEligibilityView,
  readPillarEligibilityView,
  readPrestigeEligibilityView,
  readPrestigePermissionView,
  readWitchAscensionEligibilityView,
} from "./adapters/evolve/prestige-eligibility.ts";
import { findTechConflict } from "./domain/tech-conflicts.ts";
import { readTechConflictInput } from "./adapters/evolve/tech-conflicts.ts";
import { formatTechConflict } from "./application/tech-conflicts.ts";
import { createBrowserClock } from "./adapters/browser/clock.ts";
import { createBuildingWeightingPolicy } from "./policies/building-weighting.ts";
import { readTradeRoutesInput } from "./adapters/evolve/trade-routes.ts";
import { planTradeRoutes } from "./domain/trade-routes.ts";
import { createAutoHell } from "./automation/combat/hell.ts";
import {
  createGovernmentCommandExecutor,
  readGovernmentInput,
} from "./adapters/evolve/government.ts";
import { createGovernmentControls } from "./adapters/browser/government-controls.ts";
import { planGovernment } from "./domain/government.ts";
import { createAutoBattle } from "./automation/combat/battle.ts";
import { createTaxAutomation } from "./bootstrap/tax.ts";
import { createUserscriptEnvironment } from "./adapters/userscript/environment.ts";
import {
  createSmelterCommandExecutor,
  readSmelterInput,
} from "./adapters/evolve/smelter.ts";
import { planSmelter } from "./domain/smelter.ts";
import {
  createAlchemyCommandExecutor,
  readAlchemyInput,
} from "./adapters/evolve/alchemy.ts";
import { planAlchemy } from "./domain/alchemy.ts";
import {
  createPylonCommandExecutor,
  readPylonInput,
} from "./adapters/evolve/pylon.ts";
import { planPylon } from "./domain/pylon.ts";
import {
  readQuarryRatioInput,
  readMineRatioInput,
  readExtractorRatioInput,
  createResourceRatioCommandExecutors,
} from "./adapters/evolve/resource-ratios.ts";
import {
  planQuarryRatio,
  planMineRatio,
  planExtractorRatios,
} from "./domain/resource-ratios.ts";
import { createAutoFactory } from "./automation/economy/factory.ts";
import { createAutoMiningDroid } from "./automation/economy/mining-droid.ts";
import {
  createGrapheneCommandExecutor,
  readGrapheneInput,
} from "./adapters/evolve/graphene.ts";
import { planGraphene } from "./domain/graphene.ts";
import {
  createShapeshiftCommandExecutor,
  readShapeshiftInput,
} from "./adapters/evolve/shapeshift.ts";
import {
  createShapeshiftControls,
  createUniverseSelectionControls,
} from "./adapters/browser/progression-controls.ts";
import { planShapeshift } from "./domain/shapeshift.ts";
import { createAutoWish } from "./automation/traits/wish.ts";
import { createAutoGenetics } from "./automation/traits/genetics.ts";
import { createAutoMerc } from "./automation/combat/mercenary.ts";
import { createAutoPsychic } from "./automation/traits/psychic.ts";
import { createAutoOcularPowers } from "./automation/traits/ocular.ts";
import { runMinorTraitAutomation } from "./application/minor-trait.ts";
import {
  createMinorTraitCommandExecutor,
  createMinorTraitReader,
} from "./adapters/evolve/minor-trait.ts";
import { runTriggerAutomation } from "./application/trigger.ts";
import {
  createTriggerCommandExecutor,
  createTriggerReader,
} from "./adapters/evolve/trigger.ts";
import { createAutoConsume } from "./automation/economy/consume.ts";
import { createAutoReplicator } from "./automation/economy/replicator.ts";
import { createAutoMarket } from "./automation/economy/market.ts";
import { createAutoGalaxyMarket } from "./automation/economy/galaxy-market.ts";
import { createAutoGatherResources } from "./automation/economy/gather-resources.ts";
import { createAutoEvolution } from "./automation/progression/evolution.ts";
import {
  createUniverseSelectionCommandExecutor,
  readUniverseSelectionInput,
} from "./adapters/evolve/universe-selection.ts";
import { planUniverseSelection } from "./domain/universe-selection.ts";
import { createAutoCraft } from "./automation/economy/craft.ts";
import { createAutoSpy } from "./automation/combat/spy.ts";
import { createAutoPrestige } from "./automation/progression/prestige.ts";
import { createAutoPlanetSelection } from "./automation/progression/planet-selection.ts";
import { createAutoJobs } from "./automation/civic/jobs.ts";
import { createAutoBuild } from "./automation/progression/build.ts";
import { runResearchAutomation } from "./application/research.ts";
import {
  createResearchCommandExecutor,
  createResearchReader,
} from "./adapters/evolve/research.ts";
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
import { createAuthoritySettings } from "./ui/authority-settings.ts";
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
  const browserClock = createBrowserClock();
  var settingsRaw = JSON.parse(localStorage.getItem("settings")) ?? {};
  var settings = {};
  var game = null;
  // Keep direct eval in the composition-root scope: custom expressions rely on
  // access to these live bindings. The factory owns caching and invocation.
  const { fastEval, cacheSize: fastEvalCacheSize } = createFastEvaluator({
    compileExpression: (source) => eval(`(function() { return ${source} })`),
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
      buildAuthoritySettings,
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

  const authoritySettingsOverrides = {};
  const getAuthoritySettingsDependency = createDependencyResolver(
    authoritySettingsOverrides,
    {
      $: () => $,
      addSettingsNumber: () => addSettingsNumber,
      addSettingsToggle: () => addSettingsToggle,
      buildSettingsSection: () => buildSettingsSection,
      document: () => document,
      resetAuthoritySettings: () => resetAuthoritySettings,
      updateSettingsFromState: () => updateSettingsFromState,
    },
  );
  const authoritySettings = createAuthoritySettings({
    getDependency: getAuthoritySettingsDependency,
    getOverride: (name) => authoritySettingsOverrides[name],
  });
  const { buildAuthoritySettings, updateAuthoritySettingsContent } =
    authoritySettings;

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
  const readAuthorityView = () =>
    readAuthorityPolicyView(game, settings, resources, () =>
      traitVal("high_pop", 1, 100),
    );
  const getAuthorityGarrisonRequirement = (currentGarrison) => {
    const quantity = readAuthorityQuantity(currentGarrison);
    if (quantity.status === "unavailable") return quantity;
    const view = readAuthorityView();
    return view.status === "ready"
      ? calculateRequiredAuthorityGarrison(view.view, quantity.value)
      : view;
  };
  const assessAuthorityRemoval = (removedSoldiers) => {
    const quantity = readAuthorityQuantity(removedSoldiers);
    if (quantity.status === "unavailable") return quantity;
    const view = readAuthorityView();
    return view.status === "ready"
      ? assessAuthorityRemovalPolicy(view.view, quantity.value)
      : view;
  };
  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      authorityPolicy: {
        getAuthorityTarget() {
          const view = readAuthorityView();
          return view.status === "ready"
            ? resolveAuthorityTarget(view.view.target)
            : view;
        },
        getAuthorityPerSoldier() {
          const view = readAuthorityView();
          return view.status === "ready"
            ? calculateAuthorityPerSoldier(view.view.modifiers)
            : view;
        },
        getRequiredAuthorityGarrison(currentGarrison) {
          const requirement = getAuthorityGarrisonRequirement(currentGarrison);
          return requirement.status === "ready"
            ? requirement.requiredGarrison
            : requirement;
        },
        getPredictedAuthorityAfterRemovingSoldiers(removedSoldiers) {
          const quantity = readAuthorityQuantity(removedSoldiers);
          if (quantity.status === "unavailable") return quantity;
          const view = readAuthorityView();
          return view.status === "ready"
            ? predictAuthorityAfterRemovingSoldiers(view.view, quantity.value)
            : view;
        },
        assessAuthorityRemoval,
      },
      setAuthorityPolicyTestContext(context) {
        game = context.game;
        settings = context.settings;
        resources = context.resources;
      },
    });
  }
  const { normalizeProperties, addProps } = createPropertyHelpers({
    getSettings: () => settings,
  });
  let getCostConflict = (action) => {
    const readResult = readCostConflictInput(state, resources, action);
    return readResult.status === "ready"
      ? findCostConflict(readResult.input)
      : readResult;
  };
  const plannerStatsLifecycle = createPlannerStatsLifecycle(
    createPlannerStatsStore(localStorage),
  );
  function plannerLimitingResource(target) {
    const readResult = readPlannerLimitInput(target, resources);
    return readResult.status === "ready"
      ? findPlannerLimit(readResult.input)
      : readResult;
  }
  function makePlannerStats() {
    const readResult = readPlannerRun(game);
    return readResult.status === "ready"
      ? plannerStatsLifecycle.make(readResult.run)
      : null;
  }
  function loadPlannerStats() {
    const readResult = readPlannerRun(game);
    return readResult.status === "ready"
      ? plannerStatsLifecycle.load(readResult.run)
      : null;
  }
  function savePlannerStats(stats) {
    return plannerStatsLifecycle.save(stats);
  }
  const { expandStorage } = createStorageExpansion({
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getStorageManager: () => StorageManager,
    isEarlyGame: () => isEarlyGame(),
    isLumberRace: () => isLumberRace(),
    nowMs: () => browserClock.nowMs(),
  });
  function calculateRequiredStorages() {
    const result = planStorageRequirements(
      readStorageRequirementsInput({
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
      }),
    );
    for (const requirement of result.resources) {
      const resource = resources[requirement.id];
      resource.maxCost = requirement.maxCost;
      resource.storageRequired = requirement.storageRequired;
    }
    state.knowledgeRequiredByTechs = result.knowledge.knowledgeRequiredByTechs;
    state.cheapestTechKnowledge = result.knowledge.cheapestTechKnowledge;
    state.knowledgeRequiredByBuildTargets =
      result.knowledge.knowledgeRequiredByBuildTargets;
  }
  function prioritizeDemandedResources() {
    const result = planDemandPrioritization(
      readDemandPrioritizationInput({
        getSettings: () => settings,
        getState: () => state,
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
      }),
    );
    for (const request of result.requests) {
      resources[request.resourceId].requestQuantity(request.amount);
    }
    for (const index of result.removedMissionIndices) {
      state.missionBuildingList.splice(index, 1);
    }
  }
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
    getResources: () => resources,
    getGalaxyOffers: () => poly.galaxyOffers,
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
  const userscriptEnvironment = createUserscriptEnvironment(window);
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
    "authority",
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
  let MinorTraitManager, MutableTraitManager;
  ({ MinorTraitManager, MutableTraitManager } = createTraitManagers({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getVueById: (id) => getVueById(id),
    haveTech,
  }));

  const { QuarryManager, MineManager, ExtractorManager } =
    createIndustryManagers({
      getGame: () => game,
      getBuildings: () => buildings,
      getVueById: (id) => getVueById(id),
      getKeyManager: () => KeyManager,
      haveTech,
    });

  let NaniteManager, SupplyManager, EjectManager;
  ({ NaniteManager, SupplyManager, EjectManager } = createDisposalManagers({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getPoly: () => poly,
    getVueById: (id) => getVueById(id),
    getKeyManager: () => KeyManager,
    haveTask,
  }));

  let AlchemyManager, RitualManager;
  ({ AlchemyManager, RitualManager } = createMagicManagers({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getVueById: (id) => getVueById(id),
    getKeyManager: () => KeyManager,
    haveTech,
    isLumberRace,
    addProps,
  }));

  let SmelterManager,
    FactoryManager,
    ReplicatorManager,
    DroidManager,
    GrapheneManager;
  ({
    SmelterManager,
    FactoryManager,
    ReplicatorManager,
    DroidManager,
    GrapheneManager,
  } = createProductionManagers({
    getGame: () => game,
    getResources: () => resources,
    getBuildings: () => buildings,
    getVueById: (id) => getVueById(id),
    getKeyManager: () => KeyManager,
    haveTech,
    isLumberRace,
    addProps,
    normalizeProperties,
    replicableResources,
    ResourceProductionCost,
  }));

  let GalaxyTradeManager, GovernmentManager, MarketManager, StorageManager;
  ({ GalaxyTradeManager, GovernmentManager, MarketManager, StorageManager } =
    createEconomyManagers({
      getGame: () => game,
      getResources: () => resources,
      getBuildings: () => buildings,
      getDocument: () => document,
      getVueById: (id) => getVueById(id),
      getKeyManager: () => KeyManager,
      getWindowManager: () => WindowManager,
      getGameLog: () => GameLog,
      haveTech,
      traitVal,
    }));

  let SpyManager, WarManager;
  ({ SpyManager, WarManager } = createForeignAffairsManagers({
    getGame: () => game,
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getBuildings: () => buildings,
    getDocument: () => document,
    getPoly: () => poly,
    getVueById: (id) => getVueById(id),
    getWindowManager: () => WindowManager,
    getGameLog: () => GameLog,
    getKeyManager: () => KeyManager,
    getHaveTech: () => haveTech,
    getGuardActive: () => guardActive,
    getTraitVal: () => traitVal,
    getGovPower,
    getGovName,
    getOccCosts,
    logError: (...args) => console.error(...args),
  }));

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      foreignAffairsManagers: { SpyManager, WarManager },
      setForeignAffairsManagersTestContext(context) {
        if ("game" in context) game = context.game;
        if ("settings" in context) settings = context.settings;
        if ("state" in context) state = context.state;
        if ("resources" in context) resources = context.resources;
        if ("buildings" in context) buildings = context.buildings;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("WindowManager" in context) WindowManager = context.WindowManager;
        if ("GameLog" in context) GameLog = context.GameLog;
        if ("KeyManager" in context) KeyManager = context.KeyManager;
        if ("haveTech" in context) haveTech = context.haveTech;
        if ("guardActive" in context) guardActive = context.guardActive;
        if ("traitVal" in context) traitVal = context.traitVal;
      },
    });
  }

  let FleetManagerOuter, FleetManager;
  ({ FleetManagerOuter, FleetManager } = createFleetManagers({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getPoly: () => poly,
    getVueById: (id) => getVueById(id),
    getKeyManager: () => KeyManager,
    getHaveTech: () => haveTech,
    getJQuery: () => $,
  }));

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  let { MechManager } = createMechManager({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getPoly: () => poly,
    getGameLog: () => GameLog,
    getNeedSandboxBypass: () => needSandboxBypass,
    getWin: () => win,
    getSortable: () => Sortable,
    getUpdateDebugData: () => updateDebugData,
    getCreateMechInfo: () => createMechInfo,
    getVueById: (id) => getVueById(id),
    kCombinations: k_combinations,
    cloneIntoPage: (value, options) =>
      userscriptEnvironment.cloneIntoPage(value, options),
    createMutationObserver: (callback) => new MutationObserver(callback),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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
    });
  }

  let JobManager, BuildingManager, ProjectManager, TriggerManager;
  ({ JobManager, BuildingManager, ProjectManager, TriggerManager } =
    createCoreManagers({
      getGame: () => game,
      getSettings: () => settings,
      getState: () => state,
      getBuildings: () => buildings,
      getProjects: () => projects,
      getNiceNumber,
      weightingRules,
      wrGlobalCondition,
      wrIndividualCondition,
      wrDescription,
      wrMultiplier,
      isEarlyGame,
      getIsPrestigeAllowed: () => isPrestigeAllowed,
      getBananaRepublicObjectiveComplete: () => bananaRepublicObjectiveComplete,
      getInflationChallengeAssistActive: () => inflationChallengeAssistActive,
      Trigger,
      getWindow: () => win,
    }));

  let WindowManager, KeyManager, GameLog;
  ({ WindowManager, KeyManager, GameLog } = createInfrastructureManagers({
    getDocument: () => document,
    getGame: () => game,
    getSettings: () => settings,
    getPoly: () => poly,
    getWin: () => win,
    getNeedSandboxBypass: () => needSandboxBypass,
    getKeyboardEvent: () => KeyboardEvent,
    cloneIntoPage: (value) => userscriptEnvironment.cloneIntoPage(value),
  }));

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      infrastructureManagers: { WindowManager, KeyManager, GameLog },
      setInfrastructureManagersTestContext(context) {
        if ("game" in context) game = context.game;
        if ("settings" in context) settings = context.settings;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("needSandboxBypass" in context)
          needSandboxBypass = context.needSandboxBypass;
      },
    });
  }

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

  let stateInitializationTestActions = null;

  const { initialiseState } = createStateInitialization({
    getGame: () => game,
    getResources: () => resources,
    getJobManager: () => JobManager,
    getCrafter: () => crafter,
    getBuildings: () => buildings,
    setBuildings: (value) => (buildings = value),
    getProjects: () => projects,
    getUpdateCraftCost: () =>
      stateInitializationTestActions?.updateCraftCost ?? updateCraftCost,
    getUpdateTabs: () =>
      stateInitializationTestActions?.updateTabs ?? updateTabs,
    getIsLumberRace: () =>
      stateInitializationTestActions?.isLumberRace ?? isLumberRace,
    getHaveTech: () => stateInitializationTestActions?.haveTech ?? haveTech,
    log: (message) => console.log(message),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      initialiseState,
      getStateInitializationTestContext: () => ({
        game,
        resources,
        JobManager,
        crafter,
        buildings,
        projects,
      }),
      setStateInitializationTestContext(context) {
        game = context.game;
        resources = context.resources;
        JobManager = context.JobManager;
        crafter = context.crafter;
        buildings = context.buildings;
        projects = context.projects;
        stateInitializationTestActions = context.actions;
      },
    });
  }

  let raceInitializationTestContext = null;

  const { initialiseRaces } = createRaceInitialization({
    getGame: () => raceInitializationTestContext?.game ?? game,
    getEvolutions: () =>
      raceInitializationTestContext?.evolutions ?? evolutions,
    getRaces: () => raceInitializationTestContext?.races ?? races,
    getImitations: () =>
      raceInitializationTestContext?.imitations ?? imitations,
    getEvolutionAction: () =>
      raceInitializationTestContext?.EvolutionAction ?? EvolutionAction,
    getRace: () => raceInitializationTestContext?.Race ?? Race,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      initialiseRaces,
      setRaceInitializationTestContext(context) {
        raceInitializationTestContext = context;
      },
    });
  }

  const { initBuildingState } = createBuildingStateInitialization({
    getBuildings: () => buildings,
    getBuildingManager: () => BuildingManager,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      initBuildingState,
      setBuildingStateTestContext(context) {
        buildings = context.buildings;
        BuildingManager = context.BuildingManager;
      },
    });
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

  const { updateStandAloneSettings } = createSettingsMigration({
    getSettingsRaw: () => settingsRaw,
    getSettings: () => settings,
    settingsSections,
    applySettings,
    migrateSetting,
    getResetSettings: () => ({
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
    }),
    getTechIds: () => techIds,
    getMarketManager: () => MarketManager,
    getResources: () => resources,
    getProjects: () => projects,
    getBuildings: () => buildings,
    getCrafter: () => crafter,
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      settingsMigration: { updateStandAloneSettings },
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
    });
  }

  let getStarLevel = (context) => {
    const result = readAchievementStarLevelContext(context);
    return result.status === "ready"
      ? calculateAchievementStarLevel(result.context)
      : 1;
  };
  let getAchievementStar = (id, universe) => {
    const result = readAchievementStar(game, poly, id, universe);
    return result.status === "ready" ? result.star : 0;
  };
  let isAchievementUnlocked = (id, level, universe) => {
    if (typeof level !== "number" || !Number.isFinite(level) || level < 0) {
      return false;
    }
    const result = readAchievementStar(game, poly, id, universe);
    return (
      result.status === "ready" &&
      isAchievementUnlockedPolicy(result.star, level)
    );
  };
  let guardActive = (setting) => {
    const result = readAchievementGuardInput(
      settings,
      game,
      poly,
      buildings,
      setting,
    );
    if (result.status === "ready") {
      return isAchievementGuardActive(result.input);
    }
    return result.status === "unavailable" ? result.fallbackActive : false;
  };
  let bananaRepublicObjectiveComplete = (objective) => {
    const result = readBananaRepublicObjective(game, poly, objective);
    return result.status === "ready" ? result.complete : false;
  };
  let bananaRepublicSmoothieComplete = () => {
    const result = readBananaRepublicSmoothieInput(game);
    return result.status === "ready"
      ? isBananaRepublicSmoothieCompletePolicy(result.input)
      : false;
  };
  let bananaRepublicReadyForUnification = () => {
    const result = readBananaRepublicProgress(game, poly);
    return result.status === "ready"
      ? isBananaRepublicReadyForUnificationPolicy(result.progress)
      : false;
  };
  let guardBananaRepublicActive = () => {
    const result = readBananaRepublicGuardInput(settings, game, poly);
    if (result.status === "ready") {
      return isBananaRepublicGuardActivePolicy(result.input);
    }
    return result.status === "unavailable" ? result.fallbackActive : false;
  };

  let inflationChallengeAssistActive = () => {
    const result = readInflationAssistInput(
      settings,
      game,
      getAchievementStar("wheelbarrow"),
    );
    return result.status === "ready"
      ? isInflationAssistActivePolicy(result.input)
      : false;
  };
  let inflationChallengeMoneyReachable = () => {
    const result = readInflationMoneyInput(
      resources,
      INFLATION_CHALLENGE_MONEY,
    );
    return result.status === "ready"
      ? isInflationMoneyReachablePolicy(result.input)
      : false;
  };
  let inflationChallengeSecondsToFinish = () => {
    const result = readInflationMoneyInput(
      resources,
      INFLATION_CHALLENGE_MONEY,
    );
    return result.status === "ready"
      ? inflationSecondsToFinishPolicy(result.input)
      : Number.POSITIVE_INFINITY;
  };
  let inflationChallengeShouldSaveMoney = () => {
    const result = readInflationSaveInput(
      settings,
      game,
      resources,
      getAchievementStar("wheelbarrow"),
      INFLATION_CHALLENGE_MONEY,
    );
    return result.status === "ready"
      ? shouldSaveInflationMoneyPolicy(result.input)
      : false;
  };

  let retirementChallengeAssistActive = () => {
    const result = readRetirementAssistInput(
      settings,
      game,
      haveTech("isolation"),
    );
    return result.status === "ready"
      ? isRetirementAssistActivePolicy(result.input)
      : false;
  };
  let retirementPreparationMissing = () => {
    if (!retirementChallengeAssistActive()) {
      return [];
    }
    const result = readRetirementPreparationInput(
      buildings,
      resources,
      RETIREMENT_PREP,
    );
    return result.status === "ready"
      ? formatRetirementShortfalls(
          assessRetirementPreparationPolicy(result.input),
          getNumberString,
        )
      : [];
  };

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

  const findRequiredResourceWeight = (resource) =>
    findRequiredResourceWeightPolicy(state.unlockedBuildings, resource);

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

  const universeSelectionExecutor = createUniverseSelectionCommandExecutor({
    getGame: () => game,
    controls: createUniverseSelectionControls(() => document),
  });
  const autoUniverseSelection = function autoUniverseSelection() {
    universeSelectionExecutor.execute(
      planUniverseSelection(
        readUniverseSelectionInput({
          getGame: () => game,
          getSettings: () => settings,
        }),
      ),
    );
  };

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

  const governmentExecutor = createGovernmentCommandExecutor({
    getGovernmentManager: () => GovernmentManager,
    getGame: () => game,
    getGovernor,
    controls: createGovernmentControls(getVueById),
  });
  const autoGovernment = function autoGovernment() {
    governmentExecutor.execute(
      planGovernment(
        readGovernmentInput({
          getGovernmentManager: () => GovernmentManager,
          getSettings: () => settings,
          getGame: () => game,
          guardActive,
          haveTech,
          getGovernor,
        }),
      ),
    );
  };

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
    getState: () => state,
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

  const { autoTax } = createTaxAutomation({
    getPoly: () => poly,
    getResources: () => resources,
    getSettings: () => settings,
    getGame: () => game,
    getVueById,
    clearKeyModifiers: () => KeyManager.set(false, false, false),
    nowMs: () => browserClock.nowMs(),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      autoTax: () => autoTax(),
      setAutoTaxTestContext(context) {
        if ("game" in context) game = context.game;
        if ("settings" in context) settings = context.settings;
        if ("resources" in context) resources = context.resources;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("keySet" in context) KeyManager.set = context.keySet;
      },
    });
  }

  const alchemyExecutor = createAlchemyCommandExecutor(() => AlchemyManager);
  const autoAlchemy = function autoAlchemy() {
    alchemyExecutor.execute(
      planAlchemy(
        readAlchemyInput({
          getAlchemyManager: () => AlchemyManager,
          getResources: () => resources,
          getSettings: () => settings,
          getGame: () => game,
          getAchievementStar,
        }),
      ),
    );
  };

  const pylonExecutor = createPylonCommandExecutor(() => RitualManager);
  const autoPylon = function autoPylon() {
    pylonExecutor.execute(
      planPylon(
        readPylonInput({
          getRitualManager: () => RitualManager,
          getResources: () => resources,
          getSettings: () => settings,
          getGame: () => game,
          getJobs: () => jobs,
          haveTech,
        }),
      ),
    );
  };

  const resourceRatiosDependencies = {
    getQuarryManager: () => QuarryManager,
    getMineManager: () => MineManager,
    getExtractorManager: () => ExtractorManager,
    getResources: () => resources,
    getSettings: () => settings,
    getBuildings: () => buildings,
    haveTech,
  };
  const resourceRatioExecutors = createResourceRatioCommandExecutors(
    resourceRatiosDependencies,
  );
  function autoQuarry() {
    const adjustment = planQuarryRatio(
      readQuarryRatioInput(resourceRatiosDependencies),
    );
    if (adjustment !== null) {
      resourceRatioExecutors.quarry.execute(adjustment);
    }
  }
  function autoMine() {
    const adjustment = planMineRatio(
      readMineRatioInput(resourceRatiosDependencies),
    );
    if (adjustment !== null) {
      resourceRatioExecutors.mine.execute(adjustment);
    }
  }
  function autoExtractor() {
    resourceRatioExecutors.extractor.execute(
      planExtractorRatios(readExtractorRatioInput(resourceRatiosDependencies)),
    );
  }

  const smelterExecutor = createSmelterCommandExecutor(() => SmelterManager);
  const autoSmelter = function autoSmelter() {
    const decision = planSmelter(
      readSmelterInput({
        getSmelterManager: () => SmelterManager,
        getGame: () => game,
        getResources: () => resources,
        getSettings: () => settings,
        getJobs: () => jobs,
        getBuildings: () => buildings,
        haveTech,
        consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
      }),
    );
    for (const tooltip of decision.tooltips) {
      state.tooltips[tooltip.key] = tooltip.value;
    }
    smelterExecutor.execute(decision);
  };

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

  const grapheneExecutor = createGrapheneCommandExecutor(() => GrapheneManager);
  const autoGraphenePlant = function autoGraphenePlant() {
    grapheneExecutor.execute(
      planGraphene(
        readGrapheneInput({
          getGrapheneManager: () => GrapheneManager,
          getResources: () => resources,
          consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
        }),
      ),
    );
  };

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

  const readPrestigeView = () =>
    readPrestigeEligibilityView(
      settings,
      game,
      resources,
      buildings,
      techIds,
      MechManager,
      (...args) => haveTech(...args),
      (...args) => isAchievementUnlocked(...args),
    );
  let isPrestigeAllowed = (type) => {
    const result = readPrestigePermissionView(settings, game);
    return result.status === "ready"
      ? isPrestigeAllowedPolicy(result.view, type)
      : false;
  };
  let isCataclysmPrestigeAvailable = () => {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isCataclysmPrestigeAvailablePolicy(result.view)
      : false;
  };
  let isBioseederPrestigeAvailable = () => {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isBioseedPrestigeAvailablePolicy(result.view)
      : false;
  };
  let isWhiteholePrestigeAvailable = () => {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isWhiteholePrestigeAvailablePolicy(result.view)
      : false;
  };
  let isApocalypsePrestigeAvailable = () => {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isApocalypsePrestigeAvailablePolicy(result.view)
      : false;
  };
  let isAscensionPrestigeAvailable = () => {
    const result = readAscensionEligibilityView(
      settings,
      game,
      resources,
      buildings,
    );
    return result.status === "ready"
      ? isAscensionPrestigeAvailablePolicy(result.view)
      : false;
  };
  let isWitchAscensionPrestigeAvailable = (demonic) => {
    const isDemonic = Boolean(demonic);
    const result = readWitchAscensionEligibilityView(
      settings,
      game,
      resources,
      buildings,
      isDemonic,
      (...args) => haveTech(...args),
    );
    return result.status === "ready"
      ? isWitchAscensionPrestigeAvailablePolicy(result.view, isDemonic)
      : false;
  };
  let isDemonicPrestigeAvailable = () => {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isDemonicPrestigeAvailablePolicy(result.view)
      : false;
  };
  let isPillarFinished = () => {
    const result = readPillarEligibilityView(settings, game, resources);
    return result.status === "ready"
      ? isPillarFinishedPolicy(result.view)
      : false;
  };
  let isGECKNeeded = () => {
    const result = readGeckEligibilityView(settings, buildings, (...args) =>
      isAchievementUnlocked(...args),
    );
    return result.status === "ready" ? isGeckNeededPolicy(result.view) : true;
  };
  let getBlackholeMass = () => {
    const result = readPrestigeView();
    return result.status === "ready" ? getBlackholeMassPolicy(result.view) : 0;
  };

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

  const shapeshiftExecutor = createShapeshiftCommandExecutor({
    getGame: () => game,
    controls: createShapeshiftControls(getVueById),
  });
  const autoShapeshift = function autoShapeshift() {
    shapeshiftExecutor.execute(
      planShapeshift(
        readShapeshiftInput({
          getGame: () => game,
          getSettings: () => settings,
        }),
      ),
    );
  };

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

  let techConflictClock = browserClock;
  const getTechConflict = (tech) => {
    const readResult = readTechConflictInput(
      tech,
      settings,
      resources,
      state,
      game,
      {
        clock: techConflictClock,
        guardActive,
        guardBananaRepublicActive,
        retirementChallengeAssistActive,
        retirementPreparationMissing,
        isAchievementUnlocked,
        fanatAchievements,
      },
    );
    if (readResult.status === "unavailable") {
      return "Research data unavailable";
    }
    const conflict = findTechConflict(readResult.input);
    return conflict === null
      ? false
      : formatTechConflict(conflict, getNumberString);
  };

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
        techConflictClock = context.clock ?? browserClock;
      },
    });
  }

  const triggerReader = createTriggerReader({
    getState: () => state,
    shouldSaveInflationMoney: inflationChallengeShouldSaveMoney,
  });
  const triggerExecutor = createTriggerCommandExecutor({
    getState: () => state,
  });
  const autoTrigger = () => {
    const result = runTriggerAutomation({
      reader: triggerReader,
      executor: triggerExecutor,
    });
    // A stale/rejected trigger is treated as active so research/build cannot
    // spend resources after an uncertain trigger phase.
    return result.outcome.status === "succeeded" ? result.active : true;
  };

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

  const researchReader = createResearchReader({
    getState: () => state,
    getCostConflict: (tech) => getCostConflict(tech),
  });
  const researchExecutor = createResearchCommandExecutor({
    getState: () => state,
    getBuildingManager: () => BuildingManager,
    getProjectManager: () => ProjectManager,
  });
  const autoResearch = () =>
    runResearchAutomation({
      reader: researchReader,
      executor: researchExecutor,
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
    getAuthorityGarrisonRequirement,
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

  const minorTraitReader = createMinorTraitReader({
    getMinorTraitManager: () => MinorTraitManager,
    getResources: () => resources,
  });
  const minorTraitExecutor = createMinorTraitCommandExecutor({
    getMinorTraitManager: () => MinorTraitManager,
    getResources: () => resources,
  });
  const autoMinorTrait = () =>
    runMinorTraitAutomation({
      reader: minorTraitReader,
      executor: minorTraitExecutor,
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

  let adjustTradeRoutes = function adjustTradeRoutes() {
    const result = planTradeRoutes(
      readTradeRoutesInput({
        getSettings: () => settings,
        getGame: () => game,
        getResources: () => resources,
        getMarketManager: () => MarketManager,
        getGovernor: () => getGovernor(),
        shouldSaveInflationMoney: () => inflationChallengeShouldSaveMoney(),
      }),
    );
    for (const operation of result.operations) {
      const resource = resources[operation.resourceId];
      if (operation.kind === "zero") {
        MarketManager.zeroTradeRoutes(resource);
      } else if (operation.kind === "add") {
        MarketManager.addTradeRoutes(resource, operation.count);
      } else {
        MarketManager.removeTradeRoutes(resource, operation.count);
      }
    }
    resources.Money.rateOfChange = result.moneyRate;
  };

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
    traitVal,
    assessAuthorityRemoval,
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
        resources = context.resources;
        poly = context.poly;
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

  function checkAffordableCustom(cost, max = false) {
    const readResult = readCostAffordabilityInput(
      cost,
      resources,
      max ? "maximum" : "current",
    );
    return readResult.status === "ready"
      ? isCostAffordable(readResult.input)
      : false;
  }
  const readQueuedTarget = (item) =>
    readQueueTarget(item, {
      resources,
      poly,
      mechManager: MechManager,
      buildingIds,
      arpaIds,
    });

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
    readQueuedTarget,
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
        if (context.poly) poly = context.poly;
      },
    });
  }

  let evolutionResultTestActions;
  const checkEvolutionResult = () => {
    if (!settings.masterScriptToggle || !state.evoCheckNeeded) {
      return true;
    }
    state.evoCheckNeeded = false;

    const read = readEvolutionResultInput(
      settings,
      game,
      races,
      MutableTraitManager,
    );
    if (read.status !== "ready") {
      // Malformed evolution data: continue the tick without a risky soft reset.
      return true;
    }
    const decision = decideEvolutionResult(read.input);
    for (const event of decision.logs) {
      const { level, message, tags } = formatEvolutionLog(event, (key) =>
        game.loc(key),
      );
      if (level === "danger") {
        GameLog.logDanger("special", message, [...tags]);
      } else if (level === "warning") {
        GameLog.logWarning("special", message, [...tags]);
      } else {
        GameLog.logInfo("special", message, [...tags]);
      }
    }

    if (decision.needReset) {
      const resetButton = document.querySelector(".reset .button:not(.right)");
      if (resetButton.innerText === game.loc("reset_soft")) {
        const addEvolutionSettingFn =
          evolutionResultTestActions?.addEvolutionSetting ??
          addEvolutionSetting;
        const updateSettingsFromStateFn =
          evolutionResultTestActions?.updateSettingsFromState ??
          updateSettingsFromState;
        if (
          settings.evolutionQueueEnabled &&
          settingsRaw.evolutionQueue.length > 0
        ) {
          if (!settings.evolutionQueueRepeat) {
            addEvolutionSettingFn();
          }
          settingsRaw.evolutionQueue.unshift(settingsRaw.evolutionQueue.pop());
        }
        updateSettingsFromStateFn();

        state.goal = "GameOverMan";
        resetButton.disabled = false;
        resetButton.click();
        return false;
      }
    }
    return true;
  };

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

  const getMultiSegmentedTimeLeft = (target) => {
    const readResult = readTargetTimingInput(
      game,
      target,
      target instanceof Project,
    );
    if (readResult.status === "unavailable") {
      return {
        resource: readResult.resourceId ?? "",
        timeLeft: "Never",
      };
    }

    const result = calculateTargetTiming(readResult.input);
    return {
      resource: result.resourceId,
      timeLeft:
        result.seconds === Infinity ? "Never" : poly.timeFormat(result.seconds),
    };
  };

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
    savePlannerStats: (stats) => savePlannerStats(stats),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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

  let scriptBootstrapTestActions;
  const getScriptBootstrapActions = () =>
    scriptBootstrapTestActions ?? {
      updateStandAloneSettings,
      updateStateFromSettings,
      updateSettingsFromState,
      verifyGameActions,
      tooltipObserverCallback,
      buildFilterRegExp,
      filterLog,
      schedule: (callback, delay) => setTimeout(callback, delay),
      repeat: (callback, delay) => setInterval(callback, delay),
      alert: (message) => alert(message),
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

  const { initialiseScript, mainAutoEvolveScript } = createScriptBootstrap({
    getContext: () => ({
      game,
      techIds,
      Technology,
      buildings,
      buildingIds,
      state,
      projects,
      arpaIds,
      jobs,
      jobIds,
      crafter,
      TriggerManager,
      checkActions,
      MutationObserver,
      document,
      Node,
      WindowManager,
      $,
      window,
      userscriptEnvironment,
      win,
      needSandboxBypass,
      poly,
      settings,
      safeMode,
    }),
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
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      scriptBootstrap: { initialiseScript, mainAutoEvolveScript },
      setScriptBootstrapTestContext(context) {
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
        if ("WindowManager" in context) WindowManager = context.WindowManager;
        if ("KeyManager" in context) KeyManager = context.KeyManager;
        if ("poly" in context) poly = context.poly;
        if ("win" in context) win = context.win;
        if ("safeMode" in context) safeMode = context.safeMode;
        if ("checkActions" in context) checkActions = context.checkActions;
        scriptBootstrapTestActions = context.actions;
      },
    });
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
  const { updateOverrides } = createOverrideEvaluation({
    getSafeMode: () => safeMode,
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getCheckTypes: () => checkTypes,
    getCheckCompare: () => checkCompare,
    getCheckCustom: () => checkCustom,
    getHaveTask: () => haveTask,
    getWindowManager: () => WindowManager,
    getGame: () => game,
    getGameLog: () => GameLog,
    getJQuery: () => $,
    changeDisplayInputNode,
  });

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
    getScriptVersion: () => userscriptEnvironment.getScriptVersion(),
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
        authority: authoritySettings,
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
        Object.assign(authoritySettingsOverrides, context);
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

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      fastEvaluator: {
        fastEval,
        cacheSize: fastEvalCacheSize,
      },
      setFastEvaluatorTestContext(context) {
        if ("settings" in context) settings = context.settings;
        if ("state" in context) state = context.state;
      },
    });
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
    cloneIntoPage: (value, options) =>
      userscriptEnvironment.cloneIntoPage(value, options),
    getDate: () => new Date(),
  });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      gameCompatibility: poly,
    });
  }

  $().ready(mainAutoEvolveScript);
})($);
