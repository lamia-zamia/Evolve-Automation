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
import { createCustomExpressionAdapter } from "./adapters/evolve/custom-expression.ts";
import { createNumberFormatting } from "./formatting/numbers.ts";
import { createSettingsState } from "./settings/state.ts";
import { createEvolveSettingsResetAdapter } from "./adapters/evolve/settings-reset.ts";
import { createSettingsResets } from "./application/settings-reset.ts";
import {
  applySettings as applySettingsRecord,
  migrateSetting as migrateSettingRecord,
  migrateSettingsRecord,
} from "./domain/settings-migration.ts";
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
import { createSettingsStore } from "./adapters/storage/settings-store.ts";
import { createStateLogStore } from "./adapters/storage/state-log-store.ts";
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
import { createStateLogSettingsIntentHandler } from "./application/state-log-settings.ts";
import { createStateLogSettingsBrowserAdapter } from "./adapters/browser/state-log-settings.ts";
import { createInterfaceSettingsIntentHandler } from "./application/interface-settings.ts";
import { createInterfaceSettingsBrowserAdapter } from "./adapters/browser/interface-settings.ts";
import { createChallengeHelperSettingsIntentHandler } from "./application/challenge-helper-settings.ts";
import { createChallengeHelperSettingsBrowserAdapter } from "./adapters/browser/challenge-helper-settings.ts";
import { createAchievementGuardSettingsIntentHandler } from "./application/achievement-guard-settings.ts";
import { createAchievementGuardSettingsBrowserAdapter } from "./adapters/browser/achievement-guard-settings.ts";
import { createAuthoritySettingsIntentHandler } from "./application/authority-settings.ts";
import { createAuthoritySettingsBrowserAdapter } from "./adapters/browser/authority-settings.ts";
import { createGeneralSettingsIntentHandler } from "./application/general-settings.ts";
import { createGeneralSettingsBrowserAdapter } from "./adapters/browser/general-settings.ts";
import { createResearchSettingsIntentHandler } from "./application/research-settings.ts";
import { createResearchSettingsBrowserAdapter } from "./adapters/browser/research-settings.ts";
import { createResearchSettingsEvolveAdapter } from "./adapters/evolve/research-settings.ts";
import { createLoggingSettingsIntentHandler } from "./application/logging-settings.ts";
import { createLoggingSettingsBrowserAdapter } from "./adapters/browser/logging-settings.ts";
import { createLoggingSettingsEvolveAdapter } from "./adapters/evolve/logging-settings.ts";
import { createGovernmentSettingsIntentHandler } from "./application/government-settings.ts";
import { createGovernmentSettingsBrowserAdapter } from "./adapters/browser/government-settings.ts";
import { createGovernmentSettingsEvolveAdapter } from "./adapters/evolve/government-settings.ts";
import { createPlanetSettingsIntentHandler } from "./application/planet-settings.ts";
import { createPlanetSettingsBrowserAdapter } from "./adapters/browser/planet-settings.ts";
import { createPlanetSettingsEvolveAdapter } from "./adapters/evolve/planet-settings.ts";
import { createProjectSettingsIntentHandler } from "./application/project-settings.ts";
import { createProjectSettingsBrowserAdapter } from "./adapters/browser/project-settings.ts";
import { createProjectSettingsEvolveAdapter } from "./adapters/evolve/project-settings.ts";
import { createStorageSettingsIntentHandler } from "./application/storage-settings.ts";
import { createStorageSettingsBrowserAdapter } from "./adapters/browser/storage-settings.ts";
import { createStorageSettingsEvolveAdapter } from "./adapters/evolve/storage-settings.ts";
import { createMagicSettingsIntentHandler } from "./application/magic-settings.ts";
import { createMagicSettingsBrowserAdapter } from "./adapters/browser/magic-settings.ts";
import { createMagicSettingsEvolveAdapter } from "./adapters/evolve/magic-settings.ts";
import { createJobSettingsIntentHandler } from "./application/job-settings.ts";
import { createJobSettingsBrowserAdapter } from "./adapters/browser/job-settings.ts";
import { createJobSettingsEvolveAdapter } from "./adapters/evolve/job-settings.ts";
import { createWeightingSettingsIntentHandler } from "./application/weighting-settings.ts";
import { createWeightingSettingsBrowserAdapter } from "./adapters/browser/weighting-settings.ts";
import { createBuildingSettingsIntentHandler } from "./application/building-settings.ts";
import { createBuildingSettingsBrowserAdapter } from "./adapters/browser/building-settings.ts";
import { createBuildingSettingsEvolveAdapter } from "./adapters/evolve/building-settings.ts";
import { createOptionsModalBrowserAdapter } from "./adapters/browser/options-modal.ts";
import { createTotalDaysTopBarBrowserAdapter } from "./adapters/browser/total-days-top-bar.ts";
import { createTotalDaysTopBarEvolveAdapter } from "./adapters/evolve/total-days-top-bar.ts";
import { createPrestigeTopBarBrowserAdapter } from "./adapters/browser/prestige-top-bar.ts";
import { createPrestigeTopBarEvolveAdapter } from "./adapters/evolve/prestige-top-bar.ts";
import { createEjectToggleBrowserAdapter } from "./adapters/browser/eject-toggles.ts";
import { createEjectToggleEvolveAdapter } from "./adapters/evolve/eject-toggles.ts";
import { createSupplyToggleBrowserAdapter } from "./adapters/browser/supply-toggles.ts";
import { createSupplyToggleEvolveAdapter } from "./adapters/evolve/supply-toggles.ts";
import { createCraftToggleBrowserAdapter } from "./adapters/browser/craft-toggles.ts";
import { createCraftToggleEvolveAdapter } from "./adapters/evolve/craft-toggles.ts";
import { createArpaToggleBrowserAdapter } from "./adapters/browser/arpa-toggles.ts";
import { createArpaToggleEvolveAdapter } from "./adapters/evolve/arpa-toggles.ts";
import { createBuildingToggleBrowserAdapter } from "./adapters/browser/building-toggles.ts";
import { createBuildingToggleEvolveAdapter } from "./adapters/evolve/building-toggles.ts";
import { createApplicationRunner } from "./application/application-runner.ts";
import {
  createTickReader,
  createTickControls,
} from "./adapters/evolve/tick.ts";
import { runStateUpdate } from "./application/state-update.ts";
import {
  createStateUpdateReader,
  createStateUpdateControls,
} from "./adapters/evolve/state-update.ts";
import { createActiveTargetsControls } from "./adapters/browser/active-targets.ts";
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
import { runHellAutomation } from "./application/hell.ts";
import { createHellAdapter } from "./adapters/evolve/hell.ts";
import {
  createGovernmentCommandExecutor,
  readGovernmentInput,
} from "./adapters/evolve/government.ts";
import { createGovernmentControls } from "./adapters/browser/government-controls.ts";
import { planGovernment } from "./domain/government.ts";
import { runBattleAutomation } from "./application/battle.ts";
import { createBattleAdapter } from "./adapters/evolve/battle.ts";
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
import { runFactoryAutomation } from "./application/factory.ts";
import { createFactoryAdapter } from "./adapters/evolve/factory.ts";
import { createFactoryTooltipPublisher } from "./adapters/browser/factory-tooltips.ts";
import { runMiningDroidAutomation } from "./application/mining-droid.ts";
import {
  createMiningDroidCommandExecutor,
  createMiningDroidReader,
} from "./adapters/evolve/mining-droid.ts";
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
  createPlanetSelectionControls,
  createShapeshiftControls,
  createUniverseSelectionControls,
} from "./adapters/browser/progression-controls.ts";
import { planShapeshift } from "./domain/shapeshift.ts";
import { runWishAutomation } from "./application/wish.ts";
import {
  createWishCommandExecutor,
  createWishReader,
} from "./adapters/evolve/wish.ts";
import { createWishControls } from "./adapters/browser/wish-controls.ts";
import { runGeneticsAutomation } from "./application/genetics.ts";
import { createGeneticsAdapter } from "./adapters/evolve/genetics.ts";
import { createGeneticsControls } from "./adapters/browser/genetics-controls.ts";
import { runMercenaryAutomation } from "./application/mercenary.ts";
import { createMercenaryAdapter } from "./adapters/evolve/mercenary.ts";
import { runPsychicAutomation } from "./application/psychic.ts";
import { createPsychicAdapter } from "./adapters/evolve/psychic.ts";
import { createPsychicControls } from "./adapters/browser/psychic-controls.ts";
import { runOcularPowerAutomation } from "./application/ocular-power.ts";
import { createOcularPowerAdapter } from "./adapters/evolve/ocular-power.ts";
import { createOcularPowerControls } from "./adapters/browser/ocular-power-controls.ts";
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
import { runConsumeAutomation } from "./application/consume.ts";
import {
  createConsumeCommandExecutor,
  createConsumeReader,
} from "./adapters/evolve/consume.ts";
import { runReplicatorAutomation } from "./application/replicator.ts";
import {
  createReplicatorGovernorGameReader,
  createReplicatorSelectionExecutor,
  createReplicatorSelectionReader,
} from "./adapters/evolve/replicator.ts";
import { createReplicatorGovernorOffice } from "./adapters/browser/replicator-governor.ts";
import { runMarketAutomation } from "./application/market.ts";
import {
  createMarketCommandExecutor,
  createMarketReader,
} from "./adapters/evolve/market.ts";
import { createPowerAutomation } from "./application/power.ts";
import { createPowerAdapter } from "./adapters/evolve/power.ts";
import { createPowerWarningSource } from "./adapters/browser/power-warnings.ts";
import { createStorageAllocationAutomation } from "./application/storage-allocation.ts";
import { createStorageAllocationAdapter } from "./adapters/evolve/storage-allocation.ts";
import { createStorageDebugSource } from "./adapters/browser/storage-debug.ts";
import { runGalaxyMarketAutomation } from "./application/galaxy-market.ts";
import { createGalaxyMarketAdapter } from "./adapters/evolve/galaxy-market.ts";
import { runGatherResourcesAutomation } from "./application/gather-resources.ts";
import { createGatherResourcesAdapter } from "./adapters/evolve/gather-resources.ts";
import {
  createEvolutionReader,
  createEvolutionCommandExecutor,
} from "./adapters/evolve/evolution.ts";
import { runEvolution } from "./application/evolution.ts";
import {
  createUniverseSelectionCommandExecutor,
  readUniverseSelectionInput,
} from "./adapters/evolve/universe-selection.ts";
import { planUniverseSelection } from "./domain/universe-selection.ts";
import { runCraftAutomation } from "./application/craft.ts";
import {
  createCraftCommandExecutor,
  createCraftReader,
} from "./adapters/evolve/craft.ts";
import { runSpyAutomation } from "./application/spy.ts";
import { createSpyAdapter } from "./adapters/evolve/spy.ts";
import {
  createPrestigeReader,
  createPrestigeCommandExecutor,
} from "./adapters/evolve/prestige.ts";
import { runPrestige } from "./application/prestige.ts";
import {
  createPlanetSelectionCommandExecutor,
  createPlanetSelectionReader,
} from "./adapters/evolve/planet-selection.ts";
import { runPlanetSelection } from "./application/planet-selection.ts";
import { runJobsAutomation } from "./application/jobs.ts";
import { createJobsAdapter } from "./adapters/evolve/jobs.ts";
import { runBuildAutomation } from "./application/build.ts";
import { createBuildAdapter } from "./adapters/evolve/build.ts";
import { runResearchAutomation } from "./application/research.ts";
import {
  createResearchCommandExecutor,
  createResearchReader,
} from "./adapters/evolve/research.ts";
import { runMutationAutomation } from "./application/mutation.ts";
import {
  createMutationCommandExecutor,
  createMutationReader,
} from "./adapters/evolve/mutation.ts";
import { runOuterFleetAutomation } from "./application/fleet-outer.ts";
import { createOuterFleetAdapter } from "./adapters/evolve/fleet-outer.ts";
import { runFleetAutomation } from "./application/fleet.ts";
import { createFleetAdapter } from "./adapters/evolve/fleet.ts";
import { runMechAutomation } from "./application/mech.ts";
import { createMechAdapter } from "./adapters/evolve/mech.ts";
import { createEjectorSettingsIntentHandler } from "./application/ejector-settings.ts";
import { createEjectorSettingsBrowserAdapter } from "./adapters/browser/ejector-settings.ts";
import { createEjectorSettingsEvolveAdapter } from "./adapters/evolve/ejector-settings.ts";
import { createMarketSettingsIntentHandler } from "./application/market-settings.ts";
import { createMarketSettingsBrowserAdapter } from "./adapters/browser/market-settings.ts";
import {
  createMarketSettingsEvolveAdapter,
  createMarketSettingsWriter,
} from "./adapters/evolve/market-settings.ts";
import { createWarSettingsIntentHandler } from "./application/war-settings.ts";
import { createWarSettingsBrowserAdapter } from "./adapters/browser/war-settings.ts";
import { createWarSettingsEvolveAdapter } from "./adapters/evolve/war-settings.ts";
import { createHellSettingsIntentHandler } from "./application/hell-settings.ts";
import { createHellSettingsBrowserAdapter } from "./adapters/browser/hell-settings.ts";
import { getHellSettingsReadModel } from "./domain/hell-settings.ts";
import { createMechSettingsIntentHandler } from "./application/mech-settings.ts";
import { createMechSettingsBrowserAdapter } from "./adapters/browser/mech-settings.ts";
import { createMechSettingsEvolveAdapter } from "./adapters/evolve/mech-settings.ts";
import { createTriggerSettingsIntentHandler } from "./application/trigger-settings.ts";
import { createTriggerSettingsBrowserAdapter } from "./adapters/browser/trigger-settings.ts";
import { createTriggerSettingsEvolveAdapter } from "./adapters/evolve/trigger-settings.ts";
import { createFleetSettingsIntentHandler } from "./application/fleet-settings.ts";
import { createFleetSettingsBrowserAdapter } from "./adapters/browser/fleet-settings.ts";
import { createFleetSettingsEvolveAdapter } from "./adapters/evolve/fleet-settings.ts";
import { createPrestigeSettingsIntentHandler } from "./application/prestige-settings.ts";
import { createPrestigeSettingsBrowserAdapter } from "./adapters/browser/prestige-settings.ts";
import { createPrestigeSettingsEvolveAdapter } from "./adapters/evolve/prestige-settings.ts";
import { createEvolutionSettingsIntentHandler } from "./application/evolution-settings.ts";
import { createEvolutionSettingsBrowserAdapter } from "./adapters/browser/evolution-settings.ts";
import { createEvolutionSettingsEvolveAdapter } from "./adapters/evolve/evolution-settings.ts";
import { createProductionSettingsIntentHandler } from "./application/production-settings.ts";
import { createProductionSettingsBrowserAdapter } from "./adapters/browser/production-settings.ts";
import { createProductionSettingsEvolveAdapter } from "./adapters/evolve/production-settings.ts";
import { createTraitSettingsIntentHandler } from "./application/trait-settings.ts";
import { createTraitSettingsBrowserAdapter } from "./adapters/browser/trait-settings.ts";
import { createTraitSettingsEvolveAdapter } from "./adapters/evolve/trait-settings.ts";
import { createQueuePanels } from "./ui/queue-panels.ts";
import { createMechInfoEvolveAdapter } from "./adapters/evolve/mech-info.ts";
import { createMechInfoBrowserAdapter } from "./adapters/browser/mech-info.ts";
import { createResourceToggleEvolveAdapter } from "./adapters/evolve/resource-toggles.ts";
import { createResourceToggleBrowserAdapter } from "./adapters/browser/resource-toggles.ts";
import { createTooltipUI } from "./ui/tooltips.ts";
import { createCustomRaceUI } from "./ui/custom-race-ui.ts";
import { createSettingsShell } from "./ui/settings-shell.ts";
import { createSettingsControls } from "./ui/settings-controls.ts";
import { createOverrideCatalog } from "./settings/override-catalog.ts";
import { createScriptRuntimeUI } from "./ui/script-runtime.ts";

(function ($) {
  "use strict";
  const { getRealNumber, getNumberString, getNiceNumber } =
    createNumberFormatting({ numberSuffix });
  const browserClock = createBrowserClock();
  const settingsStore = createSettingsStore(localStorage);
  var settingsRaw = settingsStore.load();
  var settings = {};
  var game = null;
  const { fastEval, cacheSize: fastEvalCacheSize } = createCustomExpressionAdapter({
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
      WindowManager,
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
  } = createSettingsResets({
    getSettingsRaw: () => settingsRaw,
    ...createEvolveSettingsResetAdapter({
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
    }),
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
    $,
    getDocument: () => document,
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
    confirm: (...args) => confirm(...args),
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
  let mechInfoTestContext;
  const { reader: mechInfoReader, observer: mechInfoObserver } =
    createMechInfoEvolveAdapter({
      getGame: () => mechInfoTestContext?.game ?? game,
      getMechManager: () => mechInfoTestContext?.MechManager ?? MechManager,
      getNiceNumber: (value) =>
        mechInfoTestContext?.getNiceNumber?.(value) ?? getNiceNumber(value),
    });
  const mechInfoBrowserAdapter = createMechInfoBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getVueById: (id) => mechInfoTestContext?.getVueById?.(id) ?? getVueById(id),
    reader: mechInfoReader,
    observer: mechInfoObserver,
  });
  const { createMechInfo, removeMechInfo } = mechInfoBrowserAdapter;
  let resourceToggleTestContext;
  const resourceToggleReader = createResourceToggleEvolveAdapter({
    getGame: () => resourceToggleTestContext?.game ?? game,
    getSettingsRaw: () => resourceToggleTestContext?.settingsRaw ?? settingsRaw,
    getMarketManager: () =>
      resourceToggleTestContext?.MarketManager ?? MarketManager,
    getStorageManager: () =>
      resourceToggleTestContext?.StorageManager ?? StorageManager,
  });
  const resourceToggleBrowserAdapter = createResourceToggleBrowserAdapter({
    getJQuery: () => $,
    reader: resourceToggleReader,
    addToggleCallbacks: (...args) =>
      (resourceToggleTestContext?.addToggleCallbacks ?? addToggleCallbacks)(
        ...args,
      ),
  });
  const {
    createMarketToggles,
    removeMarketToggles,
    createStorageToggles,
    removeStorageToggles,
  } = resourceToggleBrowserAdapter;
  let productionSettingsTestContext;
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
  const productionSettingsEvolveAdapter = createProductionSettingsEvolveAdapter(
    {
      getResources: () => productionSettingsTestContext?.resources ?? resources,
      getCraftablesList: () =>
        productionSettingsTestContext?.craftablesList ?? craftablesList,
      getSmelterManager: () =>
        productionSettingsTestContext?.SmelterManager ?? SmelterManager,
      getFactoryManager: () =>
        productionSettingsTestContext?.FactoryManager ?? FactoryManager,
      getDroidManager: () =>
        productionSettingsTestContext?.DroidManager ?? DroidManager,
      getReplicatorManager: () =>
        productionSettingsTestContext?.ReplicatorManager ?? ReplicatorManager,
      getSettingsRaw: () =>
        productionSettingsTestContext?.settingsRaw ?? settingsRaw,
      consumptionBalanceTarget: CONSUMPTION_BALANCE_TARGET,
    },
  );
  let productionSettingsIntentHandler;
  const productionSettingsBrowserAdapter =
    createProductionSettingsBrowserAdapter({
      getDocument: () => document,
      getJQuery: () => $,
      getReadModel: () =>
        productionSettingsEvolveAdapter.readProductionSettingsReadModel(),
      intents: {
        handle: (intent) => productionSettingsIntentHandler.handle(intent),
      },
      ...productionSettingsActions,
    });
  productionSettingsIntentHandler = createProductionSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          productionSettingsTestContext?.resetProductionSettings ??
          resetProductionSettings
        )(true),
      persist: () =>
        (
          productionSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
      reorderSmelterFuels: (fuelIds) =>
        productionSettingsEvolveAdapter.reorderSmelterFuels(fuelIds),
    },
    renderSettingsContent: () =>
      productionSettingsBrowserAdapter.updateProductionSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (productionSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
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
      removeCraftToggles: () =>
        (
          productionSettingsTestContext?.removeCraftToggles ??
          removeCraftToggles
        )(),
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
        productionSettingsTestContext = context;
      },
    });
  }
  let storageSettingsTestContext;
  const storageSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    buildTableLabel,
    getSorterHelper: () => sorterHelper,
  };
  const storageSettingsEvolveAdapter = createStorageSettingsEvolveAdapter({
    getStorageManager: () =>
      storageSettingsTestContext?.StorageManager ?? StorageManager,
    getSettingsRaw: () =>
      storageSettingsTestContext?.settingsRaw ?? settingsRaw,
  });
  let storageSettingsIntentHandler;
  const storageSettingsBrowserAdapter = createStorageSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getReadModel: () =>
      storageSettingsEvolveAdapter.readStorageSettingsReadModel(),
    intents: {
      handle: (intent) => storageSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      storageSettingsTestContext?.actions ?? storageSettingsActions,
  });
  storageSettingsIntentHandler = createStorageSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          storageSettingsTestContext?.resetStorageSettings ??
          resetStorageSettings
        )(true),
      persist: () =>
        (
          storageSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
      reorderResources: (resourceIds) =>
        storageSettingsEvolveAdapter.reorderResources(resourceIds),
    },
    renderSettingsContent: () =>
      storageSettingsBrowserAdapter.updateStorageSettingsContent(),
    effects: {
      resetCheckbox: () =>
        (storageSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoStorage",
        ),
      removeStorageToggles: () =>
        (
          storageSettingsTestContext?.removeStorageToggles ??
          removeStorageToggles
        )(),
    },
  });
  const { buildStorageSettings, updateStorageSettingsContent } =
    storageSettingsBrowserAdapter;

  let magicSettingsTestContext;
  const magicSettingsActions = {
    buildSettingsSection,
    addStandardHeading,
    addSettingsNumber,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    buildTableLabel,
  };
  const magicSettingsEvolveAdapter = createMagicSettingsEvolveAdapter({
    getGame: () => magicSettingsTestContext?.game ?? game,
    getAlchemyManager: () =>
      magicSettingsTestContext?.AlchemyManager ?? AlchemyManager,
    getRitualManager: () =>
      magicSettingsTestContext?.RitualManager ?? RitualManager,
  });
  let magicSettingsIntentHandler;
  const magicSettingsBrowserAdapter = createMagicSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getReadModel: () => magicSettingsEvolveAdapter.readMagicSettingsReadModel(),
    intents: {
      handle: (intent) => magicSettingsIntentHandler.handle(intent),
    },
    getActions: () => magicSettingsTestContext?.actions ?? magicSettingsActions,
  });
  magicSettingsIntentHandler = createMagicSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (magicSettingsTestContext?.resetMagicSettings ?? resetMagicSettings)(
          true,
        ),
      persist: () =>
        (
          magicSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: () =>
      magicSettingsBrowserAdapter.updateMagicSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (magicSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoAlchemy",
          "autoPylon",
          "magicFullmetalHelper",
        ),
    },
  });
  const { buildMagicSettings, updateMagicSettingsContent } =
    magicSettingsBrowserAdapter;

  let jobSettingsTestContext;
  const jobSettingsActions = {
    buildSettingsSection,
    addSettingsNumber,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    addToggleCallbacks,
    getSorterHelper: () => sorterHelper,
    confirm: (...args) => confirm(...args),
  };
  const jobSettingsEvolveAdapter = createJobSettingsEvolveAdapter({
    getBasicJob: () => jobSettingsTestContext?.BasicJob ?? BasicJob,
    getCraftingJob: () => jobSettingsTestContext?.CraftingJob ?? CraftingJob,
    getJobManager: () => jobSettingsTestContext?.JobManager ?? JobManager,
    getJobs: () => jobSettingsTestContext?.jobs ?? jobs,
    getSettingsRaw: () => jobSettingsTestContext?.settingsRaw ?? settingsRaw,
  });
  let jobSettingsIntentHandler;
  const jobSettingsBrowserAdapter = createJobSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getReadModel: () => jobSettingsEvolveAdapter.readJobSettingsReadModel(),
    intents: {
      handle: (intent) => jobSettingsIntentHandler.handle(intent),
    },
    getActions: () => jobSettingsTestContext?.actions ?? jobSettingsActions,
  });
  jobSettingsIntentHandler = createJobSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (jobSettingsTestContext?.resetJobSettings ?? resetJobSettings)(true),
      persist: () =>
        (
          jobSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
      resetPriorities: () => jobSettingsEvolveAdapter.resetPriorities(),
      reorderJobs: (jobIds) => jobSettingsEvolveAdapter.reorderJobs(jobIds),
    },
    renderSettingsContent: () =>
      jobSettingsBrowserAdapter.updateJobSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (jobSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoJobs",
          "autoCraftsmen",
        ),
    },
  });
  const { buildJobSettings, updateJobSettingsContent } =
    jobSettingsBrowserAdapter;

  let weightingSettingsTestContext;
  const weightingSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addTableInput,
  };
  let weightingSettingsIntentHandler;
  const weightingSettingsBrowserAdapter = createWeightingSettingsBrowserAdapter(
    {
      getDocument: () => document,
      getJQuery: () => $,
      intents: {
        handle: (intent) => weightingSettingsIntentHandler.handle(intent),
      },
      getActions: () =>
        weightingSettingsTestContext?.actions ?? weightingSettingsActions,
    },
  );
  weightingSettingsIntentHandler = createWeightingSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          weightingSettingsTestContext?.resetWeightingSettings ??
          resetWeightingSettings
        )(true),
      persist: () =>
        (
          weightingSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: () =>
      weightingSettingsBrowserAdapter.updateWeightingSettingsContent(),
  });
  const { buildWeightingSettings, updateWeightingSettingsContent } =
    weightingSettingsBrowserAdapter;

  let buildingSettingsTestContext;
  const buildingSettingsActions = {
    buildSettingsSection,
    addSettingsNumber,
    addSettingsSelect,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    addToggleCallbacks,
    buildTableLabel,
    confirm: (...args) => confirm(...args),
    getSorterHelper: () => sorterHelper,
  };
  const buildingSettingsEvolveAdapter = createBuildingSettingsEvolveAdapter({
    getBuildingManager: () =>
      buildingSettingsTestContext?.BuildingManager ?? BuildingManager,
    getBuildingIds: () =>
      buildingSettingsTestContext?.buildingIds ?? buildingIds,
    getResources: () => buildingSettingsTestContext?.resources ?? resources,
    getLinkedBuildings: () =>
      buildingSettingsTestContext?.linkedBuildings ?? linkedBuildings,
    getCheckCompare: () =>
      buildingSettingsTestContext?.checkCompare ?? checkCompare,
    getOverrideKey: () =>
      buildingSettingsTestContext?.overrideKey ?? overrideKey,
    getRealNumber: () =>
      buildingSettingsTestContext?.getRealNumber ?? getRealNumber,
    getInitBuildingState: () =>
      buildingSettingsTestContext?.initBuildingState ?? initBuildingState,
    getSettingsRaw: () =>
      buildingSettingsTestContext?.settingsRaw ?? settingsRaw,
  });
  let buildingSettingsIntentHandler;
  const buildingSettingsBrowserAdapter = createBuildingSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getReadModel: () =>
      buildingSettingsEvolveAdapter.readBuildingSettingsReadModel(),
    getFilterMatches: (query) =>
      buildingSettingsEvolveAdapter.filterBuildingSettings(query),
    intents: {
      handle: (intent) => buildingSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      buildingSettingsTestContext?.actions ?? buildingSettingsActions,
  });
  buildingSettingsIntentHandler = createBuildingSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          buildingSettingsTestContext?.resetBuildingSettings ??
          resetBuildingSettings
        )(true),
      persist: () =>
        (
          buildingSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
      resetPriorities: () => buildingSettingsEvolveAdapter.resetPriorities(),
      reorderBuildings: (buildingIds) =>
        buildingSettingsEvolveAdapter.reorderBuildings(buildingIds),
      setAllAutoBuild: (enabled) =>
        buildingSettingsEvolveAdapter.setAllAutoBuild(enabled),
      setAllAutoPower: (enabled) =>
        buildingSettingsEvolveAdapter.setAllAutoPower(enabled),
      setLinkedSmartState: (buildingIds, enabled) =>
        buildingSettingsEvolveAdapter.setLinkedSmartState(buildingIds, enabled),
    },
    renderSettingsContent: () =>
      buildingSettingsBrowserAdapter.updateBuildingSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (buildingSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoBuild",
          "autoPower",
        ),
      removeBuildingToggles: () =>
        (
          buildingSettingsTestContext?.removeBuildingToggles ??
          removeBuildingToggles
        )(),
    },
  });
  const {
    buildBuildingSettings,
    updateBuildingSettingsContent,
    filterBuildingSettingsTable,
  } = buildingSettingsBrowserAdapter;

  let projectSettingsTestContext;
  const projectSettingsActions = {
    buildSettingsSection,
    addSettingsNumber,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    buildTableLabel,
    getSorterHelper: () => sorterHelper,
  };
  const projectSettingsEvolveAdapter = createProjectSettingsEvolveAdapter({
    getProjectManager: () =>
      projectSettingsTestContext?.ProjectManager ?? ProjectManager,
    getSettingsRaw: () =>
      projectSettingsTestContext?.settingsRaw ?? settingsRaw,
  });
  let projectSettingsIntentHandler;
  const projectSettingsBrowserAdapter = createProjectSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getReadModel: () =>
      projectSettingsEvolveAdapter.readProjectSettingsReadModel(),
    intents: {
      handle: (intent) => projectSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      projectSettingsTestContext?.actions ?? projectSettingsActions,
  });
  projectSettingsIntentHandler = createProjectSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          projectSettingsTestContext?.resetProjectSettings ??
          resetProjectSettings
        )(true),
      persist: () =>
        (
          projectSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
      reorderProjects: (projectIds) =>
        projectSettingsEvolveAdapter.reorderProjects(projectIds),
    },
    renderSettingsContent: () =>
      projectSettingsBrowserAdapter.updateProjectSettingsContent(),
    effects: {
      resetCheckbox: () =>
        (projectSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoARPA",
        ),
    },
  });
  const { buildProjectSettings, updateProjectSettingsContent } =
    projectSettingsBrowserAdapter;

  let loggingSettingsTestContext;
  const loggingSettingsActions = {
    buildSettingsSection2,
    addSettingsHeader1,
    addSettingsString,
    addSettingsToggle,
  };
  const loggingSettingsEvolveAdapter = createLoggingSettingsEvolveAdapter({
    getGame: () => loggingSettingsTestContext?.game ?? game,
    getGameLog: () => loggingSettingsTestContext?.GameLog ?? GameLog,
    getSettingsRaw: () =>
      loggingSettingsTestContext?.settingsRaw ?? settingsRaw,
  });
  let loggingSettingsIntentHandler;
  const loggingSettingsBrowserAdapter = createLoggingSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getReadModel: () =>
      loggingSettingsEvolveAdapter.readLoggingSettingsReadModel(),
    intents: {
      handle: (intent) => loggingSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      loggingSettingsTestContext?.actions ?? loggingSettingsActions,
  });
  loggingSettingsIntentHandler = createLoggingSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          loggingSettingsTestContext?.resetLoggingSettings ??
          resetLoggingSettings
        )(true),
      persist: () =>
        (
          loggingSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
      setLogFilter: (value) => {
        const target = loggingSettingsTestContext?.settingsRaw ?? settingsRaw;
        target.logFilter = value;
      },
    },
    renderSettingsContent: (secondaryPrefix) =>
      loggingSettingsBrowserAdapter.updateLoggingSettingsContent(
        secondaryPrefix,
      ),
    effects: {
      buildFilterRegExp: () =>
        (loggingSettingsTestContext?.buildFilterRegExp ?? buildFilterRegExp)(),
    },
  });
  const { buildLoggingSettings, updateLoggingSettingsContent } =
    loggingSettingsBrowserAdapter;

  let optionsModalTestContext;
  const optionsModalBrowserAdapter = createOptionsModalBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getWindow: () => window,
    getSettingsReader: () => ({
      readToggle: (settingName) => {
        const raw = optionsModalTestContext?.settingsRaw ?? settingsRaw;
        const overrides = raw.overrides ?? {};
        return {
          checked: Boolean(raw[settingName]),
          inactive: Boolean(overrides[settingName]),
        };
      },
    }),
    getSettingsWriter: () => ({
      setToggle: (settingName, checked) => {
        const raw = optionsModalTestContext?.settingsRaw ?? settingsRaw;
        raw[settingName] = checked;
      },
      persist: () =>
        (
          optionsModalTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    }),
    getBuilders: () =>
      optionsModalTestContext?.builders ?? {
        government: buildGovernmentSettings,
        war: buildWarSettings,
        hell: buildHellSettings,
        fleet: buildFleetSettings,
      },
    openOverrideModal: (event) =>
      (optionsModalTestContext?.openOverrideModal ?? openOverrideModal)(event),
  });
  const {
    createSettingToggle,
    updateOptionsUI,
    addOptionUI,
    openOptionsModal,
    createOptionsModal,
  } = optionsModalBrowserAdapter;

  let prestigeTopBarTestContext;
  const prestigeTopBarReader = createPrestigeTopBarEvolveAdapter({
    getSettings: () => prestigeTopBarTestContext?.settings ?? settings,
    getPrestigeTypes: () =>
      prestigeTopBarTestContext?.prestigeTypes ?? prestigeTypes,
  });
  const prestigeTopBarBrowserAdapter = createPrestigeTopBarBrowserAdapter({
    getDocument: () => document,
    reader: prestigeTopBarReader,
    options: {
      addOptionUI: (...args) =>
        (prestigeTopBarTestContext?.addOptionUI ?? addOptionUI)(...args),
    },
    buildPrestigeSettings: (...args) =>
      (
        prestigeTopBarTestContext?.buildPrestigeSettings ??
        buildPrestigeSettings
      )(...args),
  });
  const { updatePrestigeInTopBar, removePrestigeFromTopBar } =
    prestigeTopBarBrowserAdapter;

  let totalDaysTopBarTestContext;
  const totalDaysTopBarReader = createTotalDaysTopBarEvolveAdapter({
    getSettings: () => totalDaysTopBarTestContext?.settings ?? settings,
    getGame: () => totalDaysTopBarTestContext?.game ?? game,
  });
  const totalDaysTopBarBrowserAdapter = createTotalDaysTopBarBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: totalDaysTopBarReader,
  });
  const {
    updateTotalDaysInTopBar,
    addTotalDaysToTopBar,
    removeTotalDaysFromTopBar,
  } = totalDaysTopBarBrowserAdapter;

  let arpaTogglesTestContext;
  const arpaToggleReader = createArpaToggleEvolveAdapter({
    getProjectManager: () =>
      arpaTogglesTestContext?.ProjectManager ?? ProjectManager,
    getSettingsRaw: () => arpaTogglesTestContext?.settingsRaw ?? settingsRaw,
  });
  const arpaToggleBrowserAdapter = createArpaToggleBrowserAdapter({
    getJQuery: () => $,
    reader: arpaToggleReader,
    addToggleCallbacks: (...args) =>
      (arpaTogglesTestContext?.addToggleCallbacks ?? addToggleCallbacks)(
        ...args,
      ),
  });
  const { createArpaToggles, removeArpaToggles } = arpaToggleBrowserAdapter;

  let craftTogglesTestContext;
  const craftToggleReader = createCraftToggleEvolveAdapter({
    getCraftablesList: () =>
      craftTogglesTestContext?.craftablesList ?? craftablesList,
    getSettingsRaw: () => craftTogglesTestContext?.settingsRaw ?? settingsRaw,
  });
  const craftToggleBrowserAdapter = createCraftToggleBrowserAdapter({
    getJQuery: () => $,
    reader: craftToggleReader,
    addToggleCallbacks: (...args) =>
      (craftTogglesTestContext?.addToggleCallbacks ?? addToggleCallbacks)(
        ...args,
      ),
  });
  const { createCraftToggles, removeCraftToggles } = craftToggleBrowserAdapter;

  let buildingTogglesTestContext;
  const buildingToggleReader = createBuildingToggleEvolveAdapter({
    getBuildingManager: () =>
      buildingTogglesTestContext?.BuildingManager ?? BuildingManager,
    getSettings: () => buildingTogglesTestContext?.settings ?? settings,
    getSettingsRaw: () =>
      buildingTogglesTestContext?.settingsRaw ?? settingsRaw,
  });
  const buildingToggleBrowserAdapter = createBuildingToggleBrowserAdapter({
    getJQuery: () => $,
    reader: buildingToggleReader,
    getCountWriter: () => ({
      setCount: (count) => {
        const targetState = buildingTogglesTestContext?.state ?? state;
        targetState.buildingToggles = count;
      },
    }),
    addToggleCallbacks: (...args) =>
      (buildingTogglesTestContext?.addToggleCallbacks ?? addToggleCallbacks)(
        ...args,
      ),
  });
  const { createBuildingToggles, removeBuildingToggles } =
    buildingToggleBrowserAdapter;

  let ejectTogglesTestContext;
  const ejectToggleReader = createEjectToggleEvolveAdapter({
    getEjectManager: () =>
      ejectTogglesTestContext?.EjectManager ?? EjectManager,
    getSettingsRaw: () => ejectTogglesTestContext?.settingsRaw ?? settingsRaw,
  });
  const ejectToggleBrowserAdapter = createEjectToggleBrowserAdapter({
    getJQuery: () => $,
    reader: ejectToggleReader,
    addToggleCallbacks: (...args) =>
      (ejectTogglesTestContext?.addToggleCallbacks ?? addToggleCallbacks)(
        ...args,
      ),
  });
  const { createEjectToggles, removeEjectToggles } = ejectToggleBrowserAdapter;

  let supplyTogglesTestContext;
  const supplyToggleReader = createSupplyToggleEvolveAdapter({
    getSupplyManager: () =>
      supplyTogglesTestContext?.SupplyManager ?? SupplyManager,
    getSettingsRaw: () => supplyTogglesTestContext?.settingsRaw ?? settingsRaw,
  });
  const supplyToggleBrowserAdapter = createSupplyToggleBrowserAdapter({
    getJQuery: () => $,
    reader: supplyToggleReader,
    addToggleCallbacks: (...args) =>
      (supplyTogglesTestContext?.addToggleCallbacks ?? addToggleCallbacks)(
        ...args,
      ),
  });
  const { createSupplyToggles, removeSupplyToggles } =
    supplyToggleBrowserAdapter;

  let generalSettingsTestActions;
  const generalSettingsActions = {
    buildSettingsSection,
    addSettingsHeader1,
    addSettingsNumber,
    addSettingsSelect,
    addSettingsString,
    addSettingsToggle,
  };
  let generalSettingsIntentHandler;
  const generalSettingsBrowserAdapter = createGeneralSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    intents: {
      handle: (intent) => generalSettingsIntentHandler.handle(intent),
    },
    getActions: () => generalSettingsTestActions ?? generalSettingsActions,
  });
  generalSettingsIntentHandler = createGeneralSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          generalSettingsTestActions?.resetGeneralSettings ??
          resetGeneralSettings
        )(true),
      persist: () =>
        (
          generalSettingsTestActions?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: () =>
      generalSettingsBrowserAdapter.updateGeneralSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (generalSettingsTestActions?.resetCheckbox ?? resetCheckbox)(
          "masterScriptToggle",
          "showSettings",
          "autoPrestige",
        ),
    },
  });
  const { buildGeneralSettings, updateGeneralSettingsContent } =
    generalSettingsBrowserAdapter;

  let achievementGuardSettingsTestActions;
  const achievementGuardSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
  };
  let achievementGuardSettingsIntentHandler;
  const achievementGuardSettingsBrowserAdapter =
    createAchievementGuardSettingsBrowserAdapter({
      getDocument: () => document,
      getJQuery: () => $,
      intents: {
        handle: (intent) =>
          achievementGuardSettingsIntentHandler.handle(intent),
      },
      getActions: () =>
        achievementGuardSettingsTestActions ?? achievementGuardSettingsActions,
    });
  achievementGuardSettingsIntentHandler =
    createAchievementGuardSettingsIntentHandler({
      writer: {
        resetToDefaults: () =>
          (
            achievementGuardSettingsTestActions?.resetAchievementGuardSettings ??
            resetAchievementGuardSettings
          )(true),
        persist: () =>
          (
            achievementGuardSettingsTestActions?.updateSettingsFromState ??
            updateSettingsFromState
          )(),
      },
      renderSettingsContent: () =>
        achievementGuardSettingsBrowserAdapter.updateAchievementGuardSettingsContent(),
    });
  const {
    buildAchievementGuardSettings,
    updateAchievementGuardSettingsContent,
  } = achievementGuardSettingsBrowserAdapter;

  let challengeHelperSettingsTestActions;
  const challengeHelperSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addSettingsNumber,
  };
  let challengeHelperSettingsIntentHandler;
  const challengeHelperSettingsBrowserAdapter =
    createChallengeHelperSettingsBrowserAdapter({
      getDocument: () => document,
      getJQuery: () => $,
      intents: {
        handle: (intent) => challengeHelperSettingsIntentHandler.handle(intent),
      },
      getActions: () =>
        challengeHelperSettingsTestActions ?? challengeHelperSettingsActions,
    });
  challengeHelperSettingsIntentHandler =
    createChallengeHelperSettingsIntentHandler({
      writer: {
        resetToDefaults: () =>
          (
            challengeHelperSettingsTestActions?.resetChallengeHelperSettings ??
            resetChallengeHelperSettings
          )(true),
        persist: () =>
          (
            challengeHelperSettingsTestActions?.updateSettingsFromState ??
            updateSettingsFromState
          )(),
      },
      renderSettingsContent: () =>
        challengeHelperSettingsBrowserAdapter.updateChallengeHelperSettingsContent(),
    });
  const { buildChallengeHelperSettings, updateChallengeHelperSettingsContent } =
    challengeHelperSettingsBrowserAdapter;

  let prestigeSettingsTestContext;
  const prestigeSettingsReader = createPrestigeSettingsEvolveAdapter({
    getPrestigeTypes: () =>
      prestigeSettingsTestContext?.prestigeTypes ?? prestigeTypes,
    getGame: () => prestigeSettingsTestContext?.game ?? game,
    getSettingsRaw: () =>
      prestigeSettingsTestContext?.settingsRaw ?? settingsRaw,
    getBuildings: () => prestigeSettingsTestContext?.buildings ?? buildings,
    isPrestigeAllowed: () =>
      (prestigeSettingsTestContext?.isPrestigeAllowed ?? isPrestigeAllowed)(),
    haveTech: (...args) =>
      (prestigeSettingsTestContext?.haveTech ?? haveTech)(...args),
    isBioseederPrestigeAvailable: () =>
      (
        prestigeSettingsTestContext?.isBioseederPrestigeAvailable ??
        isBioseederPrestigeAvailable
      )(),
    isCataclysmPrestigeAvailable: () =>
      (
        prestigeSettingsTestContext?.isCataclysmPrestigeAvailable ??
        isCataclysmPrestigeAvailable
      )(),
    isWhiteholePrestigeAvailable: () =>
      (
        prestigeSettingsTestContext?.isWhiteholePrestigeAvailable ??
        isWhiteholePrestigeAvailable
      )(),
    isApocalypsePrestigeAvailable: () =>
      (
        prestigeSettingsTestContext?.isApocalypsePrestigeAvailable ??
        isApocalypsePrestigeAvailable
      )(),
    isAscensionPrestigeAvailable: () =>
      (
        prestigeSettingsTestContext?.isAscensionPrestigeAvailable ??
        isAscensionPrestigeAvailable
      )(),
    isWitchAscensionPrestigeAvailable: (demonic) =>
      (
        prestigeSettingsTestContext?.isWitchAscensionPrestigeAvailable ??
        isWitchAscensionPrestigeAvailable
      )(demonic),
    isDemonicPrestigeAvailable: () =>
      (
        prestigeSettingsTestContext?.isDemonicPrestigeAvailable ??
        isDemonicPrestigeAvailable
      )(),
  });
  let prestigeSettingsIntentHandler;
  const prestigeSettingsBrowserAdapter = createPrestigeSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: prestigeSettingsReader,
    intents: {
      handle: (intent) => prestigeSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      prestigeSettingsTestContext?.actions ?? {
        buildSettingsSection2,
        addSettingsHeader1,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsToggle,
        openOverrideModal,
        openOptionsModal,
        buildCustomRacePresetEditor,
      },
  });
  prestigeSettingsIntentHandler = createPrestigeSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          prestigeSettingsTestContext?.resetPrestigeSettings ??
          resetPrestigeSettings
        )(true),
      setPrestigeType: (value) => {
        const target = prestigeSettingsTestContext?.settingsRaw ?? settingsRaw;
        target.prestigeType = value;
      },
      setGoalStandard: () => {
        const target = prestigeSettingsTestContext?.state ?? state;
        target.goal = "Standard";
      },
      persist: () =>
        (
          prestigeSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    reader: prestigeSettingsReader,
    render: (secondaryPrefix) =>
      prestigeSettingsBrowserAdapter.updatePrestigeSettingsContent(
        secondaryPrefix,
      ),
    effects: {
      confirm: (message) =>
        (prestigeSettingsTestContext?.confirm ?? confirm)(message),
    },
  });
  const { buildPrestigeSettings, updatePrestigeSettingsContent } =
    prestigeSettingsBrowserAdapter;

  let governmentSettingsTestContext;
  const governmentSettingsActions = {
    buildSettingsSection2,
    addSettingsNumber,
    addSettingsSelect,
  };
  const governmentSettingsEvolveAdapter = createGovernmentSettingsEvolveAdapter(
    {
      getGame: () => governmentSettingsTestContext?.game ?? game,
      getGovernmentManager: () =>
        governmentSettingsTestContext?.GovernmentManager ?? GovernmentManager,
      getGovernors: () => governmentSettingsTestContext?.governors ?? governors,
    },
  );
  let governmentSettingsIntentHandler;
  const governmentSettingsBrowserAdapter =
    createGovernmentSettingsBrowserAdapter({
      getDocument: () => document,
      getJQuery: () => $,
      getReadModel: () =>
        governmentSettingsEvolveAdapter.readGovernmentSettingsReadModel(),
      intents: {
        handle: (intent) => governmentSettingsIntentHandler.handle(intent),
      },
      getActions: () =>
        governmentSettingsTestContext?.actions ?? governmentSettingsActions,
    });
  governmentSettingsIntentHandler = createGovernmentSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          governmentSettingsTestContext?.resetGovernmentSettings ??
          resetGovernmentSettings
        )(true),
      persist: () =>
        (
          governmentSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: (secondaryPrefix) =>
      governmentSettingsBrowserAdapter.updateGovernmentSettingsContent(
        secondaryPrefix,
      ),
    effects: {
      resetCheckboxes: () =>
        (governmentSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoTax",
          "autoGovernment",
        ),
    },
  });
  const { buildGovernmentSettings, updateGovernmentSettingsContent } =
    governmentSettingsBrowserAdapter;

  let authoritySettingsTestActions;
  const authoritySettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addSettingsNumber,
  };
  let authoritySettingsIntentHandler;
  const authoritySettingsBrowserAdapter = createAuthoritySettingsBrowserAdapter(
    {
      getDocument: () => document,
      getJQuery: () => $,
      intents: {
        handle: (intent) => authoritySettingsIntentHandler.handle(intent),
      },
      getActions: () =>
        authoritySettingsTestActions ?? authoritySettingsActions,
    },
  );
  authoritySettingsIntentHandler = createAuthoritySettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          authoritySettingsTestActions?.resetAuthoritySettings ??
          resetAuthoritySettings
        )(true),
      persist: () =>
        (
          authoritySettingsTestActions?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: () =>
      authoritySettingsBrowserAdapter.updateAuthoritySettingsContent(),
  });
  const { buildAuthoritySettings, updateAuthoritySettingsContent } =
    authoritySettingsBrowserAdapter;

  let evolutionSettingsTestContext;
  const evolutionSettingsReader = createEvolutionSettingsEvolveAdapter({
    getGame: () => evolutionSettingsTestContext?.game ?? game,
    getRaces: () => evolutionSettingsTestContext?.races ?? races,
    getChallenges: () => evolutionSettingsTestContext?.challenges ?? challenges,
    getUniverses: () => evolutionSettingsTestContext?.universes ?? universes,
    getSettingsRaw: () =>
      evolutionSettingsTestContext?.settingsRaw ?? settingsRaw,
    getSettings: () => evolutionSettingsTestContext?.settings ?? settings,
    getSettingsToStore: () =>
      evolutionSettingsTestContext?.evolutionSettingsToStore ??
      evolutionSettingsToStore,
    getPrestigeTypes: () =>
      evolutionSettingsTestContext?.prestigeTypes ?? prestigeTypes,
    getStarLevel: (queueItem) =>
      (evolutionSettingsTestContext?.getStarLevel ?? getStarLevel)(queueItem),
  });
  let evolutionSettingsIntentHandler;
  const evolutionSettingsBrowserAdapter = createEvolutionSettingsBrowserAdapter(
    {
      getDocument: () => document,
      getJQuery: () => $,
      reader: evolutionSettingsReader,
      intents: {
        handle: (intent) => evolutionSettingsIntentHandler.handle(intent),
      },
      getActions: () =>
        evolutionSettingsTestContext?.actions ?? {
          buildSettingsSection,
          addStandardHeading,
          addSettingsSelect,
          addSettingsToggle,
          sorterHelper,
        },
    },
  );
  evolutionSettingsIntentHandler = createEvolutionSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          evolutionSettingsTestContext?.resetEvolutionSettings ??
          resetEvolutionSettings
        )(true),
      setTarget: (value) => {
        const target = evolutionSettingsTestContext?.settingsRaw ?? settingsRaw;
        target.userEvolutionTarget = value;
        const currentState = evolutionSettingsTestContext?.state ?? state;
        currentState.evolutionTarget = null;
      },
      addCurrent: (prestigeType) => {
        const target = evolutionSettingsTestContext?.settingsRaw ?? settingsRaw;
        const currentSettings =
          evolutionSettingsTestContext?.settings ?? settings;
        const names =
          evolutionSettingsTestContext?.evolutionSettingsToStore ??
          evolutionSettingsToStore;
        const queued = {};
        for (const name of names)
          queued[name] = target[name] ?? currentSettings[name];
        if (prestigeType !== "auto") queued.prestigeType = prestigeType;
        target.evolutionQueue.push(queued);
      },
      remove: (index) => {
        const target = evolutionSettingsTestContext?.settingsRaw ?? settingsRaw;
        target.evolutionQueue.splice(index, 1);
      },
      edit: (index, json) => {
        try {
          const value = JSON.parse(json);
          if (value && typeof value === "object" && !Array.isArray(value)) {
            const target =
              evolutionSettingsTestContext?.settingsRaw ?? settingsRaw;
            target.evolutionQueue[index] = value;
          }
        } catch {
          return;
        }
      },
      reorder: (indexes) => {
        const target = evolutionSettingsTestContext?.settingsRaw ?? settingsRaw;
        target.evolutionQueue = indexes.map(
          (index) => target.evolutionQueue[index],
        );
      },
      persist: () =>
        (
          evolutionSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    render: () =>
      evolutionSettingsBrowserAdapter.updateEvolutionSettingsContent(),
    effects: {
      resetCheckbox: () =>
        (evolutionSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoEvolution",
        ),
    },
  });
  const addEvolutionSetting = () =>
    evolutionSettingsIntentHandler.handle({
      type: "add-evolution",
      prestigeType: "auto",
    });
  const { buildEvolutionSettings, updateEvolutionSettingsContent } =
    evolutionSettingsBrowserAdapter;

  let planetSettingsTestContext;
  const planetSettingsActions = {
    buildSettingsSection,
    addTableInput,
    buildTableLabel,
  };
  const planetSettingsEvolveAdapter = createPlanetSettingsEvolveAdapter({
    getGame: () => planetSettingsTestContext?.game ?? game,
    getBiomeList: () => planetSettingsTestContext?.biomeList ?? biomeList,
    getTraitList: () => planetSettingsTestContext?.traitList ?? traitList,
    getExtraList: () => planetSettingsTestContext?.extraList ?? extraList,
  });
  let planetSettingsIntentHandler;
  const planetSettingsBrowserAdapter = createPlanetSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getReadModel: () =>
      planetSettingsEvolveAdapter.readPlanetSettingsReadModel(),
    intents: {
      handle: (intent) => planetSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      planetSettingsTestContext?.actions ?? planetSettingsActions,
  });
  planetSettingsIntentHandler = createPlanetSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (planetSettingsTestContext?.resetPlanetSettings ?? resetPlanetSettings)(
          true,
        ),
      persist: () =>
        (
          planetSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: () =>
      planetSettingsBrowserAdapter.updatePlanetSettingsContent(),
  });
  const { buildPlanetSettings, updatePlanetSettingsContent } =
    planetSettingsBrowserAdapter;

  let triggerSettingsTestContext;
  const triggerSettingsReader = createTriggerSettingsEvolveAdapter({
    getTriggerManager: () =>
      triggerSettingsTestContext?.TriggerManager ?? TriggerManager,
    getCheckTypes: () => triggerSettingsTestContext?.checkTypes ?? checkTypes,
    getActionInputs: () => triggerSettingsTestContext?.argType ?? argType,
    getBooleanResultChecks: () =>
      triggerSettingsTestContext?.retBools ?? retBools,
    getOverrideOnlyChecks: () =>
      triggerSettingsTestContext?.overrideOnlyChecks ?? overrideOnlyChecks,
  });
  let triggerSettingsIntentHandler;
  const triggerSettingsBrowserAdapter = createTriggerSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: triggerSettingsReader,
    intents: {
      handle: (intent) => triggerSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      triggerSettingsTestContext?.actions ?? {
        buildSettingsSection,
        buildInputNode,
        sorterHelper,
      },
  });
  triggerSettingsIntentHandler = createTriggerSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          triggerSettingsTestContext?.resetTriggerSettings ??
          resetTriggerSettings
        )(true),
      addDefault: () => {
        const manager =
          triggerSettingsTestContext?.TriggerManager ?? TriggerManager;
        manager.AddTrigger("Boolean", false, 1, "research", "tech-club", 0);
      },
      update: (seq, field, value) => {
        const manager =
          triggerSettingsTestContext?.TriggerManager ?? TriggerManager;
        const trigger = manager.getTrigger(seq);
        if (!trigger) return;
        trigger[field] = value;
        trigger.complete = false;
        if (field === "requirementType") {
          trigger.requirementId = false;
          trigger.requirementCount = 1;
        }
        if (field === "actionType") {
          trigger.actionId = "";
          trigger.actionCount = 0;
        }
      },
      remove: (seq) =>
        (
          triggerSettingsTestContext?.TriggerManager ?? TriggerManager
        ).RemoveTrigger(seq),
      duplicate: (seq) =>
        (
          triggerSettingsTestContext?.TriggerManager ?? TriggerManager
        ).DuplicateTrigger(seq),
      evalize: (seq) =>
        (
          triggerSettingsTestContext?.TriggerManager ?? TriggerManager
        ).EvalizeTrigger(seq),
      reorder: (seqs) => {
        const manager =
          triggerSettingsTestContext?.TriggerManager ?? TriggerManager;
        seqs.forEach((seq, index) => {
          const trigger = manager.getTrigger(seq);
          if (trigger) trigger.priority = index;
        });
        manager.sortByPriority();
      },
      persist: () =>
        (
          triggerSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    render: () => triggerSettingsBrowserAdapter.updateTriggerSettingsContent(),
    effects: {
      resetCheckbox: () =>
        (triggerSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoTrigger",
        ),
    },
  });
  const { buildTriggerSettings, updateTriggerSettingsContent } =
    triggerSettingsBrowserAdapter;

  let researchSettingsTestContext;
  const researchSettingsActions = {
    buildSettingsSection,
    addSettingsList,
    addSettingsSelect,
  };
  const researchSettingsEvolveAdapter = createResearchSettingsEvolveAdapter({
    getGame: () => researchSettingsTestContext?.game ?? game,
    getTechIds: () => researchSettingsTestContext?.techIds ?? techIds,
  });
  let researchSettingsIntentHandler;
  const researchSettingsBrowserAdapter = createResearchSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    getReadModel: () =>
      researchSettingsEvolveAdapter.readResearchSettingsReadModel(),
    intents: {
      handle: (intent) => researchSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      researchSettingsTestContext?.actions ?? researchSettingsActions,
  });
  researchSettingsIntentHandler = createResearchSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          researchSettingsTestContext?.resetResearchSettings ??
          resetResearchSettings
        )(true),
      persist: () =>
        (
          researchSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: () =>
      researchSettingsBrowserAdapter.updateResearchSettingsContent(),
    effects: {
      resetCheckbox: () =>
        (researchSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoResearch",
        ),
    },
  });
  const { buildResearchSettings, updateResearchSettingsContent } =
    researchSettingsBrowserAdapter;

  let warSettingsTestContext;
  const warSettingsReader = createWarSettingsEvolveAdapter({
    getSpyManager: () => warSettingsTestContext?.SpyManager ?? SpyManager,
    getGame: () => warSettingsTestContext?.game ?? game,
  });
  const warSettingsActions = {
    buildSettingsSection2: (...args) => buildSettingsSection2(...args),
    addSettingsHeader1: (...args) => addSettingsHeader1(...args),
    addSettingsNumber: (...args) => addSettingsNumber(...args),
    addSettingsSelect: (...args) => addSettingsSelect(...args),
    addSettingsToggle: (...args) => addSettingsToggle(...args),
  };
  const warSettingsIntentHandler = createWarSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (warSettingsTestContext?.resetWarSettings ?? resetWarSettings)(true),
      persist: () =>
        (
          warSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: (secondaryPrefix) =>
      updateWarSettingsContent(secondaryPrefix),
    effects: {
      resetCheckboxes: () =>
        (warSettingsTestContext?.resetCheckbox ?? resetCheckbox)("autoFight"),
    },
  });
  const warSettingsBrowserAdapter = createWarSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: warSettingsReader,
    intents: warSettingsIntentHandler,
    getActions: () => warSettingsTestContext?.actions ?? warSettingsActions,
  });
  const { buildWarSettings, updateWarSettingsContent } =
    warSettingsBrowserAdapter;

  let hellSettingsTestContext;
  const hellSettingsReader = { read: getHellSettingsReadModel };
  const hellSettingsActions = {
    buildSettingsSection2: (...args) => buildSettingsSection2(...args),
    addSettingsHeader1: (...args) => addSettingsHeader1(...args),
    addSettingsNumber: (...args) => addSettingsNumber(...args),
    addSettingsToggle: (...args) => addSettingsToggle(...args),
  };
  const hellSettingsIntentHandler = createHellSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (hellSettingsTestContext?.resetHellSettings ?? resetHellSettings)(true),
      persist: () =>
        (
          hellSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: (secondaryPrefix) =>
      updateHellSettingsContent(secondaryPrefix),
    effects: {
      resetCheckboxes: () =>
        (hellSettingsTestContext?.resetCheckbox ?? resetCheckbox)("autoHell"),
    },
  });
  const hellSettingsBrowserAdapter = createHellSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: hellSettingsReader,
    intents: hellSettingsIntentHandler,
    getActions: () => hellSettingsTestContext?.actions ?? hellSettingsActions,
  });
  const { buildHellSettings, updateHellSettingsContent } =
    hellSettingsBrowserAdapter;

  let fleetSettingsTestContext;
  const fleetSettingsReader = createFleetSettingsEvolveAdapter({
    getFleetManagerOuter: () =>
      fleetSettingsTestContext?.FleetManagerOuter ?? FleetManagerOuter,
    getGalaxyRegions: () =>
      fleetSettingsTestContext?.galaxyRegions ?? galaxyRegions,
    getGame: () => fleetSettingsTestContext?.game ?? game,
    getSettingsRaw: () => fleetSettingsTestContext?.settingsRaw ?? settingsRaw,
  });
  let fleetSettingsIntentHandler;
  const fleetSettingsBrowserAdapter = createFleetSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: fleetSettingsReader,
    intents: {
      handle: (intent) => fleetSettingsIntentHandler.handle(intent),
    },
    getActions: () =>
      fleetSettingsTestContext?.actions ?? {
        buildSettingsSection2,
        addSettingsHeader1,
        addSettingsNumber,
        addSettingsSelect,
        addSettingsToggle,
        addStandardHeading,
        addTableInput,
        buildTableLabel,
        openOverrideModal,
        sorterHelper,
      },
  });
  fleetSettingsIntentHandler = createFleetSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (fleetSettingsTestContext?.resetFleetSettings ?? resetFleetSettings)(
          true,
        ),
      reorderAndromeda: (regionIds) => {
        const target = fleetSettingsTestContext?.settingsRaw ?? settingsRaw;
        regionIds.forEach((regionId, index) => {
          target[`fleet_pr_${regionId}`] = index;
        });
      },
      persist: () =>
        (
          fleetSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    render: (secondaryPrefix) =>
      fleetSettingsBrowserAdapter.updateFleetSettingsContent(secondaryPrefix),
    effects: {
      resetCheckbox: () =>
        (fleetSettingsTestContext?.resetCheckbox ?? resetCheckbox)("autoFleet"),
    },
  });
  const { buildFleetSettings, updateFleetSettingsContent } =
    fleetSettingsBrowserAdapter;

  let mechSettingsTestContext;
  const mechSettingsReader = createMechSettingsEvolveAdapter({
    getMechManager: () => mechSettingsTestContext?.MechManager ?? MechManager,
    getGame: () => mechSettingsTestContext?.game ?? game,
  });
  const mechSettingsActions = {
    buildSettingsSection: (...args) => buildSettingsSection(...args),
    addSettingsNumber: (...args) => addSettingsNumber(...args),
    addSettingsSelect: (...args) => addSettingsSelect(...args),
    addSettingsToggle: (...args) => addSettingsToggle(...args),
    addStandardHeading: (...args) => addStandardHeading(...args),
    calculateMechStats: (...args) => calculateMechStats(...args),
  };
  const mechSettingsIntentHandler = createMechSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (mechSettingsTestContext?.resetMechSettings ?? resetMechSettings)(true),
      persist: () =>
        (
          mechSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: () => updateMechSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (mechSettingsTestContext?.resetCheckbox ?? resetCheckbox)("autoMech"),
      removeMechInfo: () =>
        (mechSettingsTestContext?.removeMechInfo ?? removeMechInfo)(),
    },
  });
  const mechSettingsBrowserAdapter = createMechSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: mechSettingsReader,
    intents: mechSettingsIntentHandler,
    getActions: () => mechSettingsTestContext?.actions ?? mechSettingsActions,
  });
  const { buildMechSettings, updateMechSettingsContent } =
    mechSettingsBrowserAdapter;

  let ejectorSettingsTestContext;
  const ejectorSettingsReader = createEjectorSettingsEvolveAdapter({
    getResources: () => ejectorSettingsTestContext?.resources ?? resources,
    getEjectManager: () =>
      ejectorSettingsTestContext?.EjectManager ?? EjectManager,
    getNaniteManager: () =>
      ejectorSettingsTestContext?.NaniteManager ?? NaniteManager,
    getSupplyManager: () =>
      ejectorSettingsTestContext?.SupplyManager ?? SupplyManager,
    getSettingsRaw: () =>
      ejectorSettingsTestContext?.settingsRaw ?? settingsRaw,
  });
  const ejectorSettingsActions = {
    buildSettingsSection: (...args) => buildSettingsSection(...args),
    addSettingsNumber: (...args) => addSettingsNumber(...args),
    addSettingsSelect: (...args) => addSettingsSelect(...args),
    addSettingsToggle: (...args) => addSettingsToggle(...args),
    addTableToggle: (...args) => addTableToggle(...args),
    buildTableLabel: (...args) => buildTableLabel(...args),
  };
  const ejectorSettingsIntentHandler = createEjectorSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          ejectorSettingsTestContext?.resetEjectorSettings ??
          resetEjectorSettings
        )(true),
      persist: () =>
        (
          ejectorSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
    },
    renderSettingsContent: () => updateEjectorSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (ejectorSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoEject",
          "autoSupply",
          "autoNanite",
        ),
      removeEjectToggles: () =>
        (
          ejectorSettingsTestContext?.removeEjectToggles ?? removeEjectToggles
        )(),
      removeSupplyToggles: () =>
        (
          ejectorSettingsTestContext?.removeSupplyToggles ?? removeSupplyToggles
        )(),
    },
  });
  const ejectorSettingsBrowserAdapter = createEjectorSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: ejectorSettingsReader,
    intents: ejectorSettingsIntentHandler,
    getActions: () =>
      ejectorSettingsTestContext?.actions ?? ejectorSettingsActions,
  });
  const { buildEjectorSettings, updateEjectorSettingsContent } =
    ejectorSettingsBrowserAdapter;

  let marketSettingsTestContext;
  const marketSettingsReader = createMarketSettingsEvolveAdapter({
    getMarketManager: () =>
      marketSettingsTestContext?.MarketManager ?? MarketManager,
    getResources: () => marketSettingsTestContext?.resources ?? resources,
    getPoly: () => marketSettingsTestContext?.poly ?? poly,
  });
  const marketSettingsReorderer = createMarketSettingsWriter({
    getMarketManager: () =>
      marketSettingsTestContext?.MarketManager ?? MarketManager,
    getSettingsRaw: () => marketSettingsTestContext?.settingsRaw ?? settingsRaw,
  });
  const marketSettingsActions = {
    buildSettingsSection: (...args) => buildSettingsSection(...args),
    addSettingsNumber: (...args) => addSettingsNumber(...args),
    addSettingsToggle: (...args) => addSettingsToggle(...args),
    addStandardHeading: (...args) => addStandardHeading(...args),
    addTableInput: (...args) => addTableInput(...args),
    addTableToggle: (...args) => addTableToggle(...args),
    buildTableLabel: (...args) => buildTableLabel(...args),
    getSorterHelper: () => sorterHelper,
  };
  const marketSettingsIntentHandler = createMarketSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (marketSettingsTestContext?.resetMarketSettings ?? resetMarketSettings)(
          true,
        ),
      persist: () =>
        (
          marketSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
      reorderResources: (resourceIds) =>
        marketSettingsReorderer.reorderResources(resourceIds),
    },
    renderSettingsContent: () => updateMarketSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (marketSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoMarket",
          "autoGalaxyMarket",
        ),
      removeMarketToggles: () =>
        (
          marketSettingsTestContext?.removeMarketToggles ?? removeMarketToggles
        )(),
    },
  });
  const marketSettingsBrowserAdapter = createMarketSettingsBrowserAdapter({
    getDocument: () => document,
    getJQuery: () => $,
    reader: marketSettingsReader,
    intents: marketSettingsIntentHandler,
    getActions: () =>
      marketSettingsTestContext?.actions ?? marketSettingsActions,
  });
  const { buildMarketSettings, updateMarketSettingsContent } =
    marketSettingsBrowserAdapter;

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
    stateLogStore: createStateLogStore(localStorage),
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

  const { updateStateFromSettings, updateSettingsFromState } =
    createSettingsState({
      getSettingsRaw: () => settingsRaw,
      getTriggerManager: () => TriggerManager,
      settingsStore,
    });

  // Pure record primitives bound to the live settingsRaw, exposed to the settingsState
  // test hook below. Production reset/migration call the pure record functions directly.
  const applySettings = (def, reset) =>
    applySettingsRecord(settingsRaw, def, reset);
  const migrateSetting = (oldSetting, newSetting, mapCb, keepOldValue) =>
    migrateSettingRecord(
      settingsRaw,
      oldSetting,
      newSetting,
      mapCb,
      keepOldValue,
    );

  const updateStandAloneSettings = () =>
    migrateSettingsRecord(settingsRaw, {
      settingsSections,
      // The 28 default-reset builders, in their load-bearing order.
      defaultResets: [
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
      prestigeAscensionSkipCustom: Boolean(
        settings.prestigeAscensionSkipCustom,
      ),
      techIds,
      marketPriorityIds: MarketManager.priorityList.map((res) => res.id),
      resourceIds: Object.values(resources).map((res) => res.id),
      projectIds: Object.values(projects).map((project) => project.id),
      buildings: Object.values(buildings).map((building) => ({
        vueBinding: building._vueBinding,
        switchable: building.isSwitchable(),
      })),
      crafterOriginalIds: Object.values(crafter).map((job) => job._originalId),
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

  const challengeGroups = challenges.map((members) => ({ members }));
  const evolutionReader = createEvolutionReader({
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
  });
  const evolutionExecutor = createEvolutionCommandExecutor({
    getGame: () => game,
    getState: () => state,
    getResources: () => resources,
    getEvolutions: () => evolutions,
    getImitations: () => imitations,
    loadQueuedSettings,
    gameLog: GameLog,
  });
  const autoEvolution = () =>
    runEvolution({
      reader: evolutionReader,
      executor: evolutionExecutor,
      runUniverseSelection: autoUniverseSelection,
      runPlanetSelection: autoPlanetSelection,
      challengeGroups,
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

  const planetSelectionReader = createPlanetSelectionReader({
    getGame: () => game,
    getSettings: () => settings,
    getGeneratePlanets: () => generatePlanets,
    getStarLevel: () => getStarLevel,
    getIsAchievementUnlocked: () => isAchievementUnlocked,
    getRaces: () => races,
    biomeGenus: planetBiomeGenus,
    biomeOrder: planetBiomes,
  });
  const planetSelectionExecutor = createPlanetSelectionCommandExecutor({
    getGame: () => game,
    controls: createPlanetSelectionControls(
      () => document,
      () => MouseEvent,
    ),
  });
  const autoPlanetSelection = () =>
    runPlanetSelection({
      reader: planetSelectionReader,
      executor: planetSelectionExecutor,
    });

  const autoCraft = () =>
    runCraftAutomation({
      reader: createCraftReader({
        getResources: () => resources,
        getGame: () => game,
        getFoundryList: () => foundryList,
        ticksPerSecond,
      }),
      executor: createCraftCommandExecutor({
        getResources: () => resources,
        getFoundryList: () => foundryList,
      }),
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

  const mercenaryAdapter = createMercenaryAdapter({
    getWarManager: () => WarManager,
    getState: () => state,
    getSettings: () => settings,
    getResources: () => resources,
    shouldSaveInflationMoney: inflationChallengeShouldSaveMoney,
    getGameLog: () => GameLog,
  });
  const autoMerc = () => runMercenaryAutomation(mercenaryAdapter);

  const spyAdapter = createSpyAdapter({
    getSpyManager: () => SpyManager,
    getWarManager: () => WarManager,
    getHaveTask: () => haveTask,
    getHaveTech: () => haveTech,
    shouldSaveInflationMoney: inflationChallengeShouldSaveMoney,
    getResources: () => resources,
    getSettings: () => settings,
    getPoly: () => poly,
    getGameLog: () => GameLog,
    getGovName,
    getGame: () => game,
  });
  const autoSpy = () => runSpyAutomation(spyAdapter);

  const battleAdapter = createBattleAdapter({
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
  });
  const autoBattle = () => runBattleAutomation(battleAdapter);

  const hellAdapter = createHellAdapter({
    getWarManager: () => WarManager,
    getGame: () => game,
    getSettings: () => settings,
    getBuildings: () => buildings,
    getResources: () => resources,
    getState: () => state,
    getDebugWindow: () => window,
    debugLog: (message) => console.log(message),
  });
  const autoHell = () => runHellAutomation(hellAdapter);

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, { autoHell });
  }

  const jobsAdapter = createJobsAdapter({
    getJobManager: () => JobManager,
    getGame: () => game,
    getJobs: () => jobs,
    getCrafter: () => crafter,
    getSettings: () => settings,
    getBuildings: () => buildings,
    getResources: () => resources,
    getState: () => state,
    getDebugWindow: () => window,
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
    log: (message) => console.log(message),
  });
  const autoJobs = (craftOnly = false) =>
    runJobsAutomation(jobsAdapter, craftOnly);

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

  const factoryAdapter = createFactoryAdapter({
    getManager: () => FactoryManager,
    getState: () => state,
    getSettings: () => settings,
    getGame: () => game,
    getResources: () => resources,
    consumptionBalanceMinimum: CONSUMPTION_BALANCE_MIN,
  });
  const factoryTooltips = createFactoryTooltipPublisher(() => state);
  const autoFactory = () =>
    runFactoryAutomation({
      reader: factoryAdapter.reader,
      executor: factoryAdapter.executor,
      tooltips: factoryTooltips,
    });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      autoFactory,
      FactoryManager,
      factorySettings: settings,
      factoryState: state,
    });
  }

  const autoMiningDroid = () =>
    runMiningDroidAutomation({
      reader: createMiningDroidReader(() => DroidManager),
      executor: createMiningDroidCommandExecutor(() => DroidManager),
    });

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
  const autoConsume = (manager) =>
    runConsumeAutomation({
      reader: createConsumeReader({
        getManager: () => manager,
        getResources: () => resources,
        isHungryRace,
      }),
      executor: createConsumeCommandExecutor(() => manager),
    });

  const replicatorSelectionReader = createReplicatorSelectionReader({
    getManager: () => ReplicatorManager,
    getSettings: () => settings,
    getResources: () => resources,
  });
  const replicatorGovernorGameReader = createReplicatorGovernorGameReader({
    getGovernor,
    haveReplicatorTechnology: () => haveTech("replicator"),
    getGame: () => game,
  });
  const replicatorGovernorOffice = createReplicatorGovernorOffice(() =>
    getVueById("govOffice"),
  );
  const autoReplicator = () =>
    runReplicatorAutomation({
      selectionReader: replicatorSelectionReader,
      selectionExecutor: createReplicatorSelectionExecutor(
        () => ReplicatorManager,
      ),
      governorGameReader: replicatorGovernorGameReader,
      governorOfficeReader: replicatorGovernorOffice.reader,
      governorExecutor: replicatorGovernorOffice.executor,
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

  const prestigeReader = createPrestigeReader({
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
      isApocalypsePrestigeAvailable: () => isApocalypsePrestigeAvailable(),
      isAscensionPrestigeAvailable: () => isAscensionPrestigeAvailable(),
      isWitchAscensionPrestigeAvailable: (demonic) =>
        isWitchAscensionPrestigeAvailable(demonic),
      isDemonicPrestigeAvailable: () => isDemonicPrestigeAvailable(),
    },
  });
  const prestigeExecutor = createPrestigeCommandExecutor({
    getState: () => state,
    getBuildings: () => buildings,
    getTechIds: () => techIds,
    getVueById,
    getKeyManager: () => KeyManager,
    logPrestige,
    loadQueuedSettings,
  });
  const autoPrestige = () =>
    runPrestige({ reader: prestigeReader, executor: prestigeExecutor });

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
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

  const psychicControls = createPsychicControls({
    getVueById,
    clickSelector: (selector) => $(selector).click(),
  });
  const psychicAdapter = createPsychicAdapter({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    controls: psychicControls,
  });
  const autoPsychic = () =>
    runPsychicAutomation({
      reader: psychicAdapter.reader,
      executor: psychicAdapter.executor,
    });

  const ocularPowerData = [
    { key: "d", id: "disintegration", locParam: ["X"] },
    { key: "p", id: "petrification", locParam: [resources.Stone.name] },
    { key: "w", id: "wound", locParam: ["X"] },
    { key: "t", id: "telekinesis", locParam: ["X"] },
    { key: "f", id: "fear", locParam: undefined },
    { key: "c", id: "charm", locParam: ["X"] },
  ];

  const ocularPowerControls = createOcularPowerControls({
    getVueById,
    getDocument: () => document,
  });
  const ocularPowerAdapter = createOcularPowerAdapter({
    getGame: () => game,
    getSettings: () => settings,
    getPowerData: () => ocularPowerData,
    controls: ocularPowerControls,
  });
  const autoOcularPowers = () =>
    runOcularPowerAutomation({
      reader: ocularPowerAdapter.reader,
      executor: ocularPowerAdapter.executor,
      controls: ocularPowerControls,
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
  const wishReader = createWishReader({
    getGame: () => game,
    getSettings: () => settings,
  });
  const wishExecutor = createWishCommandExecutor({
    getGame: () => game,
    controls: createWishControls({
      getVueById,
      clickSelector: (selector) => $(selector).click(),
    }),
  });
  const autoWish = () =>
    runWishAutomation({ reader: wishReader, executor: wishExecutor });

  const geneticsControls = createGeneticsControls({
    getVueById,
    getKeyManager: () => KeyManager,
  });
  const geneticsAdapter = createGeneticsAdapter({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getTicksPerSecond: () => ticksPerSecond(),
    controls: geneticsControls,
  });
  const autoGenetics = () =>
    runGeneticsAutomation({
      reader: geneticsAdapter.reader,
      executor: geneticsAdapter.executor,
      controls: geneticsControls,
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

  const autoMarket = (bulkSell, ignoreSellRatio) =>
    runMarketAutomation(
      {
        reader: createMarketReader({
          getManager: () => MarketManager,
          getGame: () => game,
          getResources: () => resources,
          getSettings: () => settings,
          ticksPerSecond,
        }),
        executor: createMarketCommandExecutor({
          getManager: () => MarketManager,
          getResources: () => resources,
        }),
        tradeRoutes: { adjust: () => adjustTradeRoutes() },
      },
      bulkSell,
      ignoreSellRatio,
    );

  const galaxyMarketAdapter = createGalaxyMarketAdapter({
    getManager: () => GalaxyTradeManager,
    getOffers: () => poly.galaxyOffers,
    getResources: () => resources,
    getSettings: () => settings,
  });
  const autoGalaxyMarket = () =>
    runGalaxyMarketAutomation({
      reader: galaxyMarketAdapter.reader,
      executor: galaxyMarketAdapter.executor,
    });

  const gatherResourcesAdapter = createGatherResourcesAdapter({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getResourcesPerClick: () => getResourcesPerClick(),
  });
  const autoGatherResources = () =>
    runGatherResourcesAutomation({
      reader: gatherResourcesAdapter.reader,
      executor: gatherResourcesAdapter.executor,
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

  const buildAdapter = createBuildAdapter({
    getBuildingManager: () => BuildingManager,
    getProjectManager: () => ProjectManager,
    getState: () => state,
    getSettings: () => settings,
    getResources: () => resources,
    getCostConflict: (target) => getCostConflict(target),
  });
  const autoBuild = () => {
    runBuildAutomation(buildAdapter);
  };

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

  const powerWarnings = createPowerWarningSource(
    () => window.document,
    () => window,
  );
  const powerAdapter = createPowerAdapter({
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
    readDebugEnabled: () => powerWarnings.readDebugEnabled(),
    isHellSuppressionUseful: isHellSupressUseful,
    getGalaxyRegions,
    traitValue: traitVal,
    getAuthorityGarrisonRequirement,
    haveTech,
    getHealingRate,
    isHungryRace,
    isPillarFinished,
    getBuildingIds: () => buildingIds,
    log: (message) => console.log(message),
  });
  const powerAutomation = createPowerAutomation({
    reader: powerAdapter.reader,
    executor: powerAdapter.executor,
    warnings: powerWarnings,
  });
  const autoPower = () => powerAutomation.run();

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

  const storageDebug = createStorageDebugSource(() => window);
  const storageAllocationAdapter = createStorageAllocationAdapter({
    getStorageManager: () => StorageManager,
    getGame: () => game,
    getSettings: () => settings,
    getState: () => state,
    getResources: () => resources,
    getBuildingManager: () => BuildingManager,
    getProjectManager: () => ProjectManager,
    getFleetManagerOuter: () => FleetManagerOuter,
    readDebugEnabled: () => storageDebug.readEnabled(),
    log: (message) => console.log(message),
  });
  const storageAllocationAutomation = createStorageAllocationAutomation({
    reader: storageAllocationAdapter.reader,
    executor: storageAllocationAdapter.executor,
    expansion: { expand: expandStorage },
  });
  const autoStorage = () => storageAllocationAutomation.run();

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

  const mutationReader = createMutationReader({
    getMutableTraitManager: () => MutableTraitManager,
    getGame: () => game,
    getResources: () => resources,
  });
  const mutationExecutor = createMutationCommandExecutor({
    getMutableTraitManager: () => MutableTraitManager,
    getGame: () => game,
    getResources: () => resources,
    getGameLog: () => GameLog,
  });
  const autoMutateTrait = () =>
    runMutationAutomation({
      reader: mutationReader,
      executor: mutationExecutor,
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

  const outerFleetAdapter = createOuterFleetAdapter({
    getFleetManagerOuter: () => FleetManagerOuter,
    getWarManager: () => WarManager,
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    traitVal,
    assessAuthorityRemoval,
    getGameLog: () => GameLog,
  });
  const autoFleetOuter = () => runOuterFleetAutomation(outerFleetAdapter);

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

  const fleetAdapter = createFleetAdapter({
    getFleetManager: () => FleetManager,
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getGalaxyRegions,
    guardActive,
    galaxyAssaultPending,
  });
  const autoFleet = () => runFleetAutomation(fleetAdapter);

  const mechAdapter = createMechAdapter({
    getMechManager: () => MechManager,
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    haveTech,
    haveTask,
    getGameLog: () => GameLog,
    getJQuery: () => $,
    readDebugEnabled: () => window.mechDebug === true,
    debugLog: (message) => console.log(message),
  });
  const autoMech = () => {
    const outcome = runMechAutomation(mechAdapter);
    if (window.mechDebug === true && outcome.status !== "succeeded") {
      console.log("[mech] outcome:", outcome);
    }
    return outcome;
  };

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

  // Helpers are resolved through this getter so the state-update test hook can swap them wholesale.
  const stateUpdateActiveHelpers = () =>
    stateUpdateTestHelpers ?? stateUpdateHelpers;

  const stateUpdateReader = createStateUpdateReader({
    getGame: () => game,
    getState: () => state,
    getSettingsRaw: () => settingsRaw,
    getResources: () => resources,
  });

  const activeTargetsControls = createActiveTargetsControls({
    getJQuery: () => $,
    getSettings: () => settings,
    getState: () => state,
    getTriggerManager: () => TriggerManager,
    updateActiveTargetsUI: (targets, type) =>
      stateUpdateActiveHelpers().updateActiveTargetsUI(targets, type),
    isTechnology: (target) => target instanceof Technology,
    isProject: (target) => target instanceof Project,
  });

  const stateUpdateControls = createStateUpdateControls({
    getState: () => state,
    getResources: () => resources,
    getBuildings: () => buildings,
    getStorageManager: () => StorageManager,
    getPoly: () => poly,
    checkEvolutionResult: () =>
      stateUpdateActiveHelpers().checkEvolutionResult(),
    updateTriggerSettingsContent: () =>
      stateUpdateActiveHelpers().updateTriggerSettingsContent(),
    updatePriorityTargets: () =>
      stateUpdateActiveHelpers().updatePriorityTargets(),
    updateProjects: () => ProjectManager.updateProjects(),
    calculateRequiredStorages: () =>
      stateUpdateActiveHelpers().calculateRequiredStorages(),
    prioritizeDemandedResources: () =>
      stateUpdateActiveHelpers().prioritizeDemandedResources(),
    updateActiveTargets: () => activeTargetsControls.updateActiveTargets(),
  });

  const updateState = () =>
    runStateUpdate({
      reader: stateUpdateReader,
      controls: stateUpdateControls,
      clock: browserClock,
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

  const tickReader = createTickReader({
    getSettings: () => settings,
    getState: () => state,
    getGame: () => game,
  });

  const tickControls = createTickControls({
    getControllers: () => tickTestControllers ?? tickControllers,
    getKeyManager: () => KeyManager,
    getState: () => state,
    getResources: () => resources,
    getNaniteManager: () => NaniteManager,
    getSupplyManager: () => SupplyManager,
    getEjectManager: () => EjectManager,
  });

  const applicationRunner = createApplicationRunner({
    reader: tickReader,
    controls: tickControls,
    updateState: () =>
      tickTestControllers?.updateState
        ? tickTestControllers.updateState()
        : updateState(),
  });

  // Cheap per-tick timer mirroring the pre-migration baseline probe in
  // evolve_automation.user_original.js. Times only work ticks (runTick returns
  // true past the throttle gate) so the numbers line up with the baseline.
  // Inspect/reset from the console via window.__EAperf; __EAperf.report() prints
  // on demand. Remove once the performance comparison is done.
  const __EAperf = {
    n: 0,
    total: 0,
    max: 0,
    window: 0,
    windowTotal: 0,
    report() {
      const avg = this.n ? this.total / this.n : 0;
      const wavg = this.window ? this.windowTotal / this.window : 0;
      console.log(
        `[EA perf] work-ticks=${this.n} cum-avg=${avg.toFixed(3)}ms ` +
          `last-${this.window}-avg=${wavg.toFixed(3)}ms max=${this.max.toFixed(3)}ms`,
      );
    },
    record(ms) {
      this.n++;
      this.total += ms;
      this.window++;
      this.windowTotal += ms;
      if (ms > this.max) this.max = ms;
      if (this.window >= 200) {
        this.report();
        this.window = 0;
        this.windowTotal = 0;
      }
    },
    reset() {
      this.n = this.total = this.max = this.window = this.windowTotal = 0;
      console.log("[EA perf] reset");
    },
  };
  window.__EAperf = __EAperf;
  // performance.now() in the browser (sub-ms resolution); Date.now() only so the
  // headless test sandbox, which has no performance global, does not crash.
  const __eaNow =
    typeof performance !== "undefined" && performance.now
      ? () => performance.now()
      : () => Date.now();

  const automate = () => {
    const t0 = __eaNow();
    const worked = applicationRunner.runCycle();
    if (worked) {
      __EAperf.record(__eaNow() - t0);
    }
  };

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
    if (!interfaceSettingsTestActions) {
      return interfaceSettingsActions;
    }

    return {
      buildSettingsSection: interfaceSettingsTestActions.buildSettingsSection,
      addSettingsToggle: interfaceSettingsTestActions.addSettingsToggle,
      addSettingsHeader1: interfaceSettingsTestActions.addSettingsHeader1,
      controlEffects: {
        activeTargetsUI: {
          enabled: interfaceSettingsTestActions.buildActiveTargetsUI,
          disabled: interfaceSettingsTestActions.removeActiveTargetsUI,
        },
        buildPlannerUI: {
          enabled: interfaceSettingsTestActions.buildBuildPlannerUI,
          disabled: interfaceSettingsTestActions.removeBuildPlannerUI,
        },
        displayPrestigeTypeInTopBar: {
          enabled: interfaceSettingsTestActions.updatePrestigeInTopBar,
          disabled: interfaceSettingsTestActions.updatePrestigeInTopBar,
        },
        displayTotalDaysTypeInTopBar: {
          enabled: interfaceSettingsTestActions.updateTotalDaysInTopBar,
          disabled: interfaceSettingsTestActions.updateTotalDaysInTopBar,
        },
      },
    };
  };

  let interfaceSettingsIntentHandler;
  const interfaceSettingsBrowserAdapter = createInterfaceSettingsBrowserAdapter(
    {
      getDocument: () => document,
      getJQuery: () => $,
      intents: {
        handle: (intent) => interfaceSettingsIntentHandler.handle(intent),
      },
      getActions: getInterfaceSettingsActions,
    },
  );

  interfaceSettingsIntentHandler = createInterfaceSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        (
          interfaceSettingsTestActions?.resetInterfaceSettings ??
          resetInterfaceSettings
        )(true),
      persist: () =>
        (
          interfaceSettingsTestActions?.updateSettingsFromState ??
          updateSettingsFromState
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
          ? (interfaceSettingsTestActions?.buildActiveTargetsUI ??
              buildActiveTargetsUI)
          : (interfaceSettingsTestActions?.removeActiveTargetsUI ??
              removeActiveTargetsUI))(),
      syncBuildPlannerUI: (enabled) =>
        (enabled
          ? (interfaceSettingsTestActions?.buildBuildPlannerUI ??
              buildBuildPlannerUI)
          : (interfaceSettingsTestActions?.removeBuildPlannerUI ??
              removeBuildPlannerUI))(),
      updatePrestigeInTopBar: () =>
        (
          interfaceSettingsTestActions?.updatePrestigeInTopBar ??
          updatePrestigeInTopBar
        )(),
      updateTotalDaysInTopBar: () =>
        (
          interfaceSettingsTestActions?.updateTotalDaysInTopBar ??
          updateTotalDaysInTopBar
        )(),
    },
  });

  const { buildInterfaceSettings, updateInterfaceSettingsContent } =
    interfaceSettingsBrowserAdapter;

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

  const stateLogSettingsIntents = createStateLogSettingsIntentHandler({
    resetToDefaults: () => resetStateLogSettings(true),
    persist: () => updateSettingsFromState(),
  });
  const { buildStateLogSettings, updateStateLogSettingsContent } =
    createStateLogSettingsBrowserAdapter({
      getDocument: () => document,
      getJQuery: () => $,
      intents: stateLogSettingsIntents,
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
      evolutionSettings: evolutionSettingsBrowserAdapter,
      setEvolutionSettingsTestContext(context) {
        evolutionSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      prestigeSettings: prestigeSettingsBrowserAdapter,
      setPrestigeSettingsTestContext(context) {
        prestigeSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      triggerSettings: triggerSettingsBrowserAdapter,
      setTriggerSettingsTestContext(context) {
        triggerSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      fleetSettings: fleetSettingsBrowserAdapter,
      setFleetSettingsTestContext(context) {
        fleetSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      ejectorSettings: ejectorSettingsBrowserAdapter,
      setEjectorSettingsTestContext(context) {
        ejectorSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      marketSettings: marketSettingsBrowserAdapter,
      setMarketSettingsTestContext(context) {
        marketSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      warSettings: warSettingsBrowserAdapter,
      setWarSettingsTestContext(context) {
        warSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      hellSettings: hellSettingsBrowserAdapter,
      setHellSettingsTestContext(context) {
        hellSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      mechSettings: mechSettingsBrowserAdapter,
      setMechSettingsTestContext(context) {
        mechSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      challengeHelperSettings: challengeHelperSettingsBrowserAdapter,
      setChallengeHelperSettingsTestContext(context) {
        challengeHelperSettingsTestActions = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      governmentSettings: governmentSettingsBrowserAdapter,
      setGovernmentSettingsTestContext(context) {
        governmentSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      planetSettings: planetSettingsBrowserAdapter,
      setPlanetSettingsTestContext(context) {
        planetSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      projectSettings: projectSettingsBrowserAdapter,
      setProjectSettingsTestContext(context) {
        projectSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      storageSettings: storageSettingsBrowserAdapter,
      setStorageSettingsTestContext(context) {
        storageSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      magicSettings: magicSettingsBrowserAdapter,
      setMagicSettingsTestContext(context) {
        magicSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      jobSettings: jobSettingsBrowserAdapter,
      setJobSettingsTestContext(context) {
        jobSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      weightingSettings: weightingSettingsBrowserAdapter,
      setWeightingSettingsTestContext(context) {
        weightingSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      buildingSettings: buildingSettingsBrowserAdapter,
      setBuildingSettingsTestContext(context) {
        buildingSettingsTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      optionsModal: optionsModalBrowserAdapter,
      setOptionsModalTestContext(context) {
        optionsModalTestContext = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      achievementGuardSettings: achievementGuardSettingsBrowserAdapter,
      setAchievementGuardSettingsTestContext(context) {
        achievementGuardSettingsTestActions = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      authoritySettings: authoritySettingsBrowserAdapter,
      setAuthoritySettingsTestContext(context) {
        authoritySettingsTestActions = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      generalSettings: generalSettingsBrowserAdapter,
      setGeneralSettingsTestContext(context) {
        generalSettingsTestActions = context;
      },
    });
    Object.assign(window.__EA_TEST_HOOKS__, {
      researchSettings: researchSettingsBrowserAdapter,
      setResearchSettingsTestContext(context) {
        researchSettingsTestContext = context;
      },
    });
  }

  let traitSettingsTestContext;
  const traitSettingsEvolveAdapter = createTraitSettingsEvolveAdapter({
    getSettingsRaw: () => traitSettingsTestContext?.settingsRaw ?? settingsRaw,
    getState: () => traitSettingsTestContext?.state ?? state,
    getGame: () => traitSettingsTestContext?.game ?? game,
    getRaces: () => traitSettingsTestContext?.races ?? races,
    getResources: () => traitSettingsTestContext?.resources ?? resources,
    getPoly: () => traitSettingsTestContext?.poly ?? poly,
    getMinorTraitManager: () =>
      traitSettingsTestContext?.MinorTraitManager ?? MinorTraitManager,
    getMutableTraitManager: () =>
      traitSettingsTestContext?.MutableTraitManager ?? MutableTraitManager,
    getOcularPowerData: () => ocularPowerData,
    getWishData: () => wishData,
    getMutationCostMultipliers: () => mutationCostMultipliers,
  });
  let traitSettingsIntentHandler;
  const traitSettingsBrowserAdapter = createTraitSettingsBrowserAdapter({
    getReadModel: () => traitSettingsEvolveAdapter.readTraitSettingsReadModel(),
    getDocument: () => document,
    getJQuery: () => $,
    intents: {
      handle: (intent) => traitSettingsIntentHandler.handle(intent),
    },
    getSorterHelper: () => sorterHelper,
    buildSettingsSection,
    addStandardHeading,
    addSettingsSelect,
    addSettingsNumber,
    addSettingsToggle,
    addTableToggle,
    addTableInput,
    buildTableLabel,
  });
  traitSettingsIntentHandler = createTraitSettingsIntentHandler({
    writer: {
      resetMinorTraits: () =>
        (
          traitSettingsTestContext?.resetMinorTraitSettings ??
          resetMinorTraitSettings
        )(true),
      resetMutableTraits: () =>
        (
          traitSettingsTestContext?.resetMutableTraitSettings ??
          resetMutableTraitSettings
        )(true),
      persist: () =>
        (
          traitSettingsTestContext?.updateSettingsFromState ??
          updateSettingsFromState
        )(),
      clearEvolutionTarget: () =>
        traitSettingsEvolveAdapter.clearEvolutionTarget(),
      reorderMinorTraits: (traitIds) =>
        traitSettingsEvolveAdapter.reorderMinorTraits(traitIds),
      reorderMutableTraits: (traitIds) =>
        traitSettingsEvolveAdapter.reorderMutableTraits(traitIds),
      setBoolean: (settingName, value) =>
        traitSettingsEvolveAdapter.setBoolean(settingName, value),
    },
    renderSettingsContent: () =>
      traitSettingsBrowserAdapter.updateTraitSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        (traitSettingsTestContext?.resetCheckbox ?? resetCheckbox)(
          "autoMinorTrait",
          "autoMutateTraits",
          "autoGenetics",
        ),
    },
  });
  const {
    buildTraitSettings,
    updateImitateWarning,
    updateTraitSettingsContent,
    makeToggleSwitchesMutuallyExclusive,
  } = traitSettingsBrowserAdapter;

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
        traitSettingsTestContext = context;
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
      prestigeTopBar: prestigeTopBarBrowserAdapter,
      setPrestigeTopBarTestContext(context) {
        prestigeTopBarTestContext = context;
      },
      totalDaysTopBar: totalDaysTopBarBrowserAdapter,
      setTotalDaysTopBarTestContext(context) {
        totalDaysTopBarTestContext = context;
      },
      ejectToggles: ejectToggleBrowserAdapter,
      setEjectTogglesTestContext(context) {
        ejectTogglesTestContext = context;
      },
      supplyToggles: supplyToggleBrowserAdapter,
      setSupplyTogglesTestContext(context) {
        supplyTogglesTestContext = context;
      },
      craftToggles: craftToggleBrowserAdapter,
      setCraftTogglesTestContext(context) {
        craftTogglesTestContext = context;
      },
      arpaToggles: arpaToggleBrowserAdapter,
      setArpaTogglesTestContext(context) {
        arpaTogglesTestContext = context;
      },
      buildingToggles: buildingToggleBrowserAdapter,
      setBuildingTogglesTestContext(context) {
        buildingTogglesTestContext = context;
      },
      resourceToggles: resourceToggleBrowserAdapter,
      setResourceTogglesTestContext(context) {
        resourceToggleTestContext = context;
      },
      mechInfo: mechInfoBrowserAdapter,
      setMechInfoTestContext(context) {
        mechInfoTestContext = context;
      },
    });
  }

  if (window.__EA_TEST_HOOKS__) {
    Object.assign(window.__EA_TEST_HOOKS__, {
      loggingSettings: loggingSettingsBrowserAdapter,
      setLoggingSettingsTestContext(context) {
        loggingSettingsTestContext = context;
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
