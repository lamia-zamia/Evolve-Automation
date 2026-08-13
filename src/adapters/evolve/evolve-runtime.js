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
import { createPropertyHelpers } from "../../utils/properties.ts";
import { createCustomExpressionAdapter } from "./custom-expression.ts";
import { createNumberFormatting } from "../../formatting/numbers.ts";
import { createSettingsState } from "../../settings/state.ts";
import { createEvolveSettingsResetAdapter } from "./settings-reset.ts";
import { createSettingsResets } from "../../application/settings-reset.ts";
import {
  applySettings as applySettingsRecord,
  migrateSetting as migrateSettingRecord,
} from "../../domain/settings-migration.ts";
import {
  createSettingsMigrationControl,
  createQueuedSettingsControl,
} from "../../bootstrap/settings-lifecycle-controls.ts";
import { createOverrideSettings } from "../../application/override-settings.ts";
import { createOverrideEditor } from "../../application/override-editing.ts";
import { createOverrideEvaluationSource } from "./override-evaluation.ts";
import { createOverrideFailureReporter } from "./override-failure-log.ts";
import { createOverrideEffectiveValueDisplay } from "../browser/override-display.ts";
import { createGameActionControls } from "../browser/game-action-controls.ts";
import { createGameCraftingControls } from "../browser/game-crafting-controls.ts";
import { createGameClickMultipliers } from "../browser/game-click-multipliers.ts";
import { createGameDisposalControls } from "../browser/game-disposal-controls.ts";
import { createGameCustomRaceLab } from "../browser/game-custom-race-lab.ts";
import { createGameEspionageControls } from "../browser/game-espionage-controls.ts";
import { createGameFeatureVisibility } from "../browser/game-feature-visibility.ts";
import { createGameForeignControls } from "../browser/game-foreign-controls.ts";
import { createGameGovernmentSelection } from "../browser/game-government-selection.ts";
import { createGameIndustryControls } from "../browser/game-industry-controls.ts";
import { createGameFleetControls } from "../browser/game-fleet-controls.ts";
import { createGameGarrisonControls } from "../browser/game-garrison-controls.ts";
import { createGameMechControls } from "../browser/game-mech-controls.ts";
import { createGameMechListControls } from "../browser/game-mech-list-controls.ts";
import { createGameJobControls } from "../browser/game-job-controls.ts";
import { createGameKeyboardHandlers } from "../browser/game-keyboard-handlers.ts";
import { createGameMarketControls } from "../browser/game-market-controls.ts";
import { createGameModal } from "../browser/game-modal.ts";
import { createGamePageShell } from "../browser/game-page-shell.ts";
import { createGameUiSurface } from "../browser/game-ui-surface.ts";
import { createGameProjectControls } from "../browser/game-project-controls.ts";
import { createGameStorageControls } from "../browser/game-storage-controls.ts";
import { createGameResearchControls } from "../browser/game-research-controls.ts";
import { createGameTraitControls } from "../browser/game-trait-controls.ts";
import { createSettingsTransfer } from "../../settings/transfer.ts";
import { createRuntimeQueries } from "../../game/runtime-queries.ts";
import { createTraitManagers } from "../../game/trait-managers.ts";
import { createIndustryManagers } from "../../game/industry-managers.ts";
import { createMagicManagers } from "../../game/magic-managers.ts";
import { createDisposalManagers } from "../../game/disposal-managers.ts";
import { createProductionManagers } from "../../game/production-managers.ts";
import { createEconomyManagers } from "../../game/economy-managers.ts";
import { createForeignAffairsManagers } from "../../game/foreign-affairs-managers.ts";
import { readForeignAchievementGoal } from "./combat/foreign-achievements.ts";
import { createFleetManagers } from "../../game/fleet-managers.ts";
import { createMechManager } from "../../game/mech-manager.ts";
import { createInfrastructureManagers } from "../../game/infrastructure-managers.ts";
import { createScriptBootstrapControl } from "../../bootstrap/script-bootstrap-control.ts";
import { createCoreManagers } from "../../game/core-managers.ts";
import { createRaceProfile } from "../../game/race-profile.ts";
import { createForeignGovernment } from "../../game/foreign-government.ts";
import { createGalaxyIntelligence } from "../../game/galaxy-intelligence.ts";
import { createHellIntelligence } from "../../game/hell-intelligence.ts";
import { createMechIntelligence } from "../../game/mech-intelligence.ts";
import { createPrestigeIntelligence } from "../../game/prestige-intelligence.ts";
import { createShrineIntelligence } from "../../game/shrine-intelligence.ts";
import { createWomlingAchievements } from "../../game/womling-achievements.ts";
import { createPowerSupport } from "../../game/power-support.ts";
import { createGameRates } from "../../game/rates.ts";
import { createPlanetGeneration } from "../../game/planet-generation.ts";
import { createScriptDataLifecycleControl } from "../../bootstrap/script-data-lifecycle-control.ts";
import { createCustomRaceModel } from "../../game/custom-race-model.ts";
import { createTraitValue } from "../../game/trait-value.ts";
import { createCraftingCosts } from "../../game/crafting-costs.ts";
import { createEntityClasses } from "../../game/entities.ts";
import { createGameCompatibility } from "../../game/compatibility.ts";
import { createEntityCatalogs } from "../../game/entity-catalogs.ts";
import {
  createStateInitializationControl,
  createRaceInitializationControl,
  createBuildingStateInitializationControl,
} from "../../bootstrap/initialization-controls.ts";
import { createPlannerState } from "../../game/planner-state.ts";
import { createAuthorityPolicy } from "../../game/authority-policy.ts";
import { createRunGuards } from "./run-guards.ts";
import { createPrestigeEligibility } from "./prestige-eligibility.ts";
import { formatRetirementShortfalls } from "../../application/retirement-prep.ts";
import { createCostConflict } from "./cost-conflict.ts";
import { findPlannerLimit } from "../../domain/planner-analysis.ts";
import { readPlannerLimitInput, readPlannerRun } from "./planner-analysis.ts";
import { createPlannerStatsStore } from "../storage/planner-stats.ts";
import { createSettingsStore } from "../storage/settings-store.ts";
import { createStateLogStore } from "../storage/state-log-store.ts";
import { createPlannerStatsLifecycle } from "../../application/planner-stats.ts";
import { createBuildPlannerControl } from "../../bootstrap/build-planner-control.ts";
import {
  createDemandPrioritizationAction,
  createStorageRequirementsAction,
} from "./state-demand-actions.ts";
import { createPriorityTargetsControl } from "../../bootstrap/priority-targets-control.ts";
import { createEvolutionResultCheck } from "./evolution-result-check.ts";
import { formatEvolutionLog } from "../../application/evolution-result.ts";
import {
  readAuthorityPolicyView,
  readAuthorityQuantity,
} from "./civic/authority.ts";
import { createQueueQueries } from "./queue-queries.ts";
import { createTargetTimingDisplay } from "./target-timing-display.ts";
import { findRequiredResourceWeight as findRequiredResourceWeightPolicy } from "../../domain/economy/resources/resource-weighting.ts";
import { createGameActionVerification } from "../../validation/game-actions.ts";
import { createStateLogControl } from "../../bootstrap/state-log-control.ts";
import { createPrestigeLog } from "../../observability/prestige-log.ts";
import { createLogFilterControl } from "../../bootstrap/log-filter-control.ts";
import { createBrowserRuntime } from "../browser/runtime.ts";
import { createMechStats } from "../../ui/mech-stats.ts";
import { createSortHelper } from "../../ui/sort-helper.ts";
import { createTabRefreshControl } from "../../bootstrap/tab-refresh-control.ts";
import { createSoulGemRateDisplay } from "../../ui/soul-gem-rate.ts";
import { createPreviousGameStats } from "../../ui/previous-game-stats.ts";
import { createRuntimeAdapters } from "../../ui/runtime-adapters.ts";
import { createAutomationContainer } from "../../ui/automation-container.ts";
import { createUIRefresh } from "../../ui/ui-refresh.ts";
import { createBuildingWeightingDescriber } from "../../ui/building-weighting-description.ts";
import { createStateLogSettingsIntentHandler } from "../../application/state-log-settings.ts";
import { createStateLogSettingsBrowserAdapter } from "../browser/state-log-settings.ts";
import { createInterfaceSettingsIntentHandler } from "../../application/interface-settings.ts";
import { createInterfaceSettingsBrowserAdapter } from "../browser/interface-settings.ts";
import {
  createGeneralSettingsControl,
  createAchievementGuardSettingsControl,
  createAuthoritySettingsControl,
  createChallengeHelperSettingsControl,
  createJobSettingsControl,
  createLoggingSettingsControl,
  createMagicSettingsControl,
  createProjectSettingsControl,
  createStorageSettingsControl,
  createWeightingSettingsControl,
} from "../../bootstrap/settings/core-settings-controls.ts";
import { createResearchSettingsControl } from "../../bootstrap/settings/research-settings-control.ts";
import {
  createGovernmentSettingsControl,
  createPlanetSettingsControl,
} from "../../bootstrap/settings/government-planet-settings-controls.ts";
import { createBuildingSettingsControl } from "../../bootstrap/settings/building-settings-control.ts";
import { createOptionsModalBrowserAdapter } from "../browser/options-modal.ts";
import { createTotalDaysTopBarBrowserAdapter } from "../browser/total-days-top-bar.ts";
import { createTotalDaysTopBarEvolveAdapter } from "./total-days-top-bar.ts";
import { createPrestigeTopBarBrowserAdapter } from "../browser/prestige-top-bar.ts";
import { createPrestigeTopBarEvolveAdapter } from "./progression/prestige/prestige-top-bar.ts";
import { createEjectToggleBrowserAdapter } from "../browser/eject-toggles.ts";
import { createEjectToggleEvolveAdapter } from "./economy/resources/eject-toggles.ts";
import { createSupplyToggleBrowserAdapter } from "../browser/supply-toggles.ts";
import { createSupplyToggleEvolveAdapter } from "./economy/resources/supply-toggles.ts";
import { createCraftToggleBrowserAdapter } from "../browser/craft-toggles.ts";
import { createCraftToggleEvolveAdapter } from "./economy/production/craft-toggles.ts";
import { createArpaToggleBrowserAdapter } from "../browser/arpa-toggles.ts";
import { createArpaToggleEvolveAdapter } from "./progression/research/arpa-toggles.ts";
import { createBuildingToggleBrowserAdapter } from "../browser/building-toggles.ts";
import { createBuildingToggleEvolveAdapter } from "./progression/build/building-toggles.ts";
import { createTickRunner } from "../../bootstrap/tick-runner.ts";
import { createStateUpdateControl } from "../../bootstrap/state-update-control.ts";
import {
  DEFAULT_VACUUM_MANA_REQUIREMENT,
  isVacuumCollapseManaStageReady,
} from "../../domain/progression/prestige/vacuum.ts";
import { formatTechConflict } from "../../application/tech-conflicts.ts";
import { createTechConflict } from "./tech-conflict.ts";
import { createBrowserClock } from "../browser/clock.ts";
import { createBrowserRandomSource } from "../browser/random.ts";
import { createBuildingWeightingPolicy } from "../../domain/progression/build/building-weighting-rules.ts";
import { createBuildingWeightingDecider } from "../../domain/progression/build/building-weighting-decision.ts";
import { readWeightingCandidate } from "./progression/build/weighting-candidate.ts";
import { createWeightingSnapshotReader } from "./progression/build/weighting-snapshot.ts";
import { createTradeRoutes } from "./trade-routes.ts";
import { createHellControl } from "../../bootstrap/hell-control.ts";
import { createGovernmentControl } from "../../bootstrap/government-control.ts";
import { createBattleControl } from "../../bootstrap/battle-control.ts";
import { createUserscriptEnvironment } from "../userscript/environment.ts";
import { createSmelterControl } from "../../bootstrap/smelter-control.ts";
import { createTaxControl } from "../../bootstrap/tax-control.ts";
import { createStorageExpansionControl } from "../../bootstrap/storage-expansion-control.ts";
import { createAlchemyControl } from "../../bootstrap/alchemy-control.ts";
import { createPylonControl } from "../../bootstrap/pylon-control.ts";
import { createResourceRatioControls } from "../../bootstrap/resource-ratio-controls.ts";
import { createFactoryControl } from "../../bootstrap/factory-control.ts";
import { createMiningDroidControl } from "../../bootstrap/mining-droid-control.ts";
import { createGrapheneControl } from "../../bootstrap/graphene-control.ts";
import { createShapeshiftControl } from "../../bootstrap/shapeshift-control.ts";
import { createEvolutionControls } from "../../bootstrap/evolution-controls.ts";
import { createWishControl } from "../../bootstrap/wish-control.ts";
import { createGeneticsControl } from "../../bootstrap/genetics-control.ts";
import { createMercenaryControl } from "../../bootstrap/mercenary-control.ts";
import { createPsychicControl } from "../../bootstrap/psychic-control.ts";
import { createOcularPowerControl } from "../../bootstrap/ocular-power-control.ts";
import { createMinorTraitControl } from "../../bootstrap/minor-trait-control.ts";
import { createTriggerControl } from "../../bootstrap/trigger-control.ts";
import { createConsumeControl } from "../../bootstrap/consume-control.ts";
import { createReplicatorControl } from "../../bootstrap/replicator-control.ts";
import { createMarketControl } from "../../bootstrap/market-control.ts";
import { createPowerControl } from "../../bootstrap/power-control.ts";
import { createStorageAllocationControl } from "../../bootstrap/storage-allocation-control.ts";
import { createGalaxyMarketControl } from "../../bootstrap/galaxy-market-control.ts";
import { createGatherResourcesControl } from "../../bootstrap/gather-resources-control.ts";
import { createCraftControl } from "../../bootstrap/craft-control.ts";
import { createSpyControl } from "../../bootstrap/spy-control.ts";
import { createPrestigeControl } from "../../bootstrap/prestige-control.ts";
import { createJobsControl } from "../../bootstrap/jobs-control.ts";
import { createBuildControl } from "../../bootstrap/build-control.ts";
import { createResearchControl } from "../../bootstrap/research-control.ts";
import { createMutationControl } from "../../bootstrap/mutation-control.ts";
import { createOuterFleetControl } from "../../bootstrap/fleet-outer-control.ts";
import { createFleetControl } from "../../bootstrap/fleet-control.ts";
import { createMechControl } from "../../bootstrap/mech-control.ts";
import { createEjectorSettingsControl } from "../../bootstrap/settings/ejector-settings-control.ts";
import { createMarketSettingsControl } from "../../bootstrap/settings/market-settings-control.ts";
import { createWarSettingsControl } from "../../bootstrap/settings/war-settings-control.ts";
import { createHellSettingsControl } from "../../bootstrap/settings/hell-settings-control.ts";
import { createMechSettingsControl } from "../../bootstrap/settings/mech-settings-control.ts";
import { createTriggerSettingsControl } from "../../bootstrap/settings/trigger-settings-control.ts";
import { createFleetSettingsControl } from "../../bootstrap/settings/fleet-settings-control.ts";
import { createPrestigeSettingsControl } from "../../bootstrap/settings/prestige-settings-control.ts";
import { createEvolutionSettingsControl } from "../../bootstrap/settings/evolution-settings-control.ts";
import { createProductionSettingsControl } from "../../bootstrap/settings/production-settings-control.ts";
import { createTraitSettingsControl } from "../../bootstrap/settings/trait-settings-control.ts";
import { createQueuePanelsControl } from "../../bootstrap/queue-panels-control.ts";
import { createMechInfoEvolveAdapter } from "./combat/mech-info.ts";
import { createMechInfoBrowserAdapter } from "../browser/mech-info.ts";
import { createResourceToggleEvolveAdapter } from "./economy/resources/resource-toggles.ts";
import { createResourceToggleBrowserAdapter } from "../browser/resource-toggles.ts";
import { createTooltipUiControl } from "../../bootstrap/tooltip-ui-control.ts";
import { createCustomRaceUiControl } from "../../bootstrap/custom-race-ui-control.ts";
import { createSettingsShell } from "../../ui/settings-shell.ts";
import { createOverrideConditionControls } from "../../ui/override-condition-controls.ts";
import { createOverrideEditorControls } from "../../ui/override-editor.ts";
import { createSettingsControls } from "../../ui/settings-controls.ts";
import { createSettingsInputs } from "../../ui/settings-inputs.ts";
import { createOverrideCatalog } from "../../settings/override-catalog.ts";
import { createScriptRuntimeUI } from "../../ui/script-runtime.ts";

export function startEvolveRuntime($, diagnostics, runtimeEnvironment) {
  startEvolveRuntimeComposition($, diagnostics, runtimeEnvironment);
}

export function startEvolveRuntimeComposition(
  $,
  diagnostics,
  runtimeEnvironment,
  testSurface,
) {
  "use strict";
  const TEST_SURFACE_ENABLED = globalThis.__EA_TEST_SURFACE_ENABLED__ === true;
  const getTestContext = TEST_SURFACE_ENABLED
    ? (name) => testSurface?.getContext(name)
    : () => undefined;
  const setTestContext = TEST_SURFACE_ENABLED
    ? (name, context) => testSurface?.setContext(name, context)
    : () => {};
  const { getRealNumber, getNumberString, getNiceNumber } =
    createNumberFormatting({ numberSuffix });
  const browserClock = createBrowserClock();
  const randomSource = createBrowserRandomSource();
  let gameModal = createGameModal({
    getDocument: () => runtimeEnvironment.document,
    getMutationObserver: () => runtimeEnvironment.MutationObserver,
  });
  const featureVisibility = createGameFeatureVisibility({
    getDocument: () => runtimeEnvironment.document,
  });
  const settingsStore = createSettingsStore(runtimeEnvironment.storage);
  let settingsRaw = settingsStore.load();
  let settings = {};
  let game = null;
  const { fastEval, cacheSize: fastEvalCacheSize } =
    createCustomExpressionAdapter({
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
  } = createSettingsResets({
    getSettingsRaw: () => settingsRaw,
    setSettingsRaw: (value) => {
      settingsRaw = value;
    },
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

  const overrideEditor = createOverrideEditor({
    getSettingsRaw: () => settingsRaw,
    persistence: { save: () => updateSettingsFromState() },
  });
  const { buildSelectOptions, buildInputNode, buildObjectListInput } =
    createSettingsInputs({
      getJQuery: () => $,
      getRealNumber: () => getRealNumber,
    });
  const conditionControls = createOverrideConditionControls({
    overrideEditor,
    getJQuery: () => $,
    getSettingsRaw: () => settingsRaw,
    getWin: () => win,
    getCheckCompareExpressions: () => checkCompareExpressions,
    getCheckCustom: () => checkCustom,
    getCheckTypes: () => checkTypes,
    buildInputNode,
  });
  const {
    evaluateCheck: _,
    buildConditionType,
    buildConditionArg,
    buildConditionComparator,
    buildConditionRemove,
    buildConditionDuplicate,
    buildConditionEvalize,
    buildConditionRet,
  } = conditionControls;
  const {
    openOverrideModal,
    buildOverrideSettings,
    buildInputNodeForDisplay,
    changeDisplayInputNode,
  } = createOverrideEditorControls({
    overrideEditor,
    conditionControls,
    getJQuery: () => $,
    getSettingsRaw: () => settingsRaw,
    getSettings: () => settings,
    getTechIds: () => techIds,
    getCheckCustom: () => checkCustom,
    getOverrideKey: () => overrideKey,
    getOpenOptionsModal: () => openOptionsModal,
    getSorterHelper: () => sorterHelper,
    buildInputNode,
  });
  const {
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
  } = createSettingsControls({
    getJQuery: () => $,
    getSettingsRaw: () => settingsRaw,
    getRealNumber: () => getRealNumber,
    getUpdateSettingsFromState: () => updateSettingsFromState,
    openOverrideModal: (event) => openOverrideModal(event),
    buildSelectOptions,
  });
  const { reader: mechInfoReader, observer: mechInfoObserver } =
    createMechInfoEvolveAdapter({
      getGame: () => getTestContext("mechInfo")?.game ?? game,
      getMechManager: () =>
        getTestContext("mechInfo")?.MechManager ?? MechManager,
      getNiceNumber: (value) =>
        getTestContext("mechInfo")?.getNiceNumber?.(value) ??
        getNiceNumber(value),
    });
  const mechInfoBrowserAdapter = createMechInfoBrowserAdapter({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    getVueById: (id) =>
      getTestContext("mechInfo")?.getVueById?.(id) ?? getVueById(id),
    reader: mechInfoReader,
    observer: mechInfoObserver,
  });
  const { createMechInfo, removeMechInfo } = mechInfoBrowserAdapter;
  const resourceToggleReader = createResourceToggleEvolveAdapter({
    getGame: () => getTestContext("resourceToggle")?.game ?? game,
    getSettingsRaw: () =>
      getTestContext("resourceToggle")?.settingsRaw ?? settingsRaw,
    getMarketManager: () =>
      getTestContext("resourceToggle")?.MarketManager ?? MarketManager,
    getStorageManager: () =>
      getTestContext("resourceToggle")?.StorageManager ?? StorageManager,
  });
  const resourceToggleBrowserAdapter = createResourceToggleBrowserAdapter({
    getJQuery: () => $,
    reader: resourceToggleReader,
    addToggleCallbacks: (...args) =>
      (
        getTestContext("resourceToggle")?.addToggleCallbacks ??
        addToggleCallbacks
      )(...args),
  });
  const {
    createMarketToggles,
    removeMarketToggles,
    createStorageToggles,
    removeStorageToggles,
  } = resourceToggleBrowserAdapter;
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
  const productionSettingsBrowserAdapter = createProductionSettingsControl({
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

  const storageSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    buildTableLabel,
    getSorterHelper: () => sorterHelper,
  };
  const storageSettingsBrowserAdapter = createStorageSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: storageSettingsActions,
    getStorageManager: () => StorageManager,
    getSettingsRaw: () => settingsRaw,
    resetStorageSettings: (...args) => resetStorageSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    removeStorageToggles: () => removeStorageToggles(),
    testSurface,
  });
  const { buildStorageSettings } = storageSettingsBrowserAdapter;
  const magicSettingsActions = {
    buildSettingsSection,
    addStandardHeading,
    addSettingsNumber,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    buildTableLabel,
  };
  const magicSettingsBrowserAdapter = createMagicSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: magicSettingsActions,
    getGame: () => game,
    getAlchemyManager: () => AlchemyManager,
    getRitualManager: () => RitualManager,
    resetMagicSettings: (...args) => resetMagicSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    testSurface,
  });
  const { buildMagicSettings } = magicSettingsBrowserAdapter;
  const jobSettingsActions = {
    buildSettingsSection,
    addSettingsNumber,
    addSettingsString,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    addToggleCallbacks,
    getSorterHelper: () => sorterHelper,
    confirm: (...args) => runtimeEnvironment.confirm(...args),
  };
  const jobSettingsBrowserAdapter = createJobSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: jobSettingsActions,
    getBasicJob: () => BasicJob,
    getCraftingJob: () => CraftingJob,
    getJobManager: () => JobManager,
    getJobs: () => jobs,
    getSettingsRaw: () => settingsRaw,
    resetJobSettings: (...args) => resetJobSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    testSurface,
  });
  const { buildJobSettings } = jobSettingsBrowserAdapter;
  const weightingSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addTableInput,
  };
  const weightingSettingsBrowserAdapter = createWeightingSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: weightingSettingsActions,
    resetWeightingSettings: (...args) => resetWeightingSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    testSurface,
  });
  const { buildWeightingSettings } = weightingSettingsBrowserAdapter;
  const buildingSettingsActions = {
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
  };
  const buildingSettingsBrowserAdapter = createBuildingSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: buildingSettingsActions,
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
  });
  const { buildBuildingSettings, filterBuildingSettingsTable } =
    buildingSettingsBrowserAdapter;
  const projectSettingsActions = {
    buildSettingsSection,
    addSettingsNumber,
    addSettingsToggle,
    addTableInput,
    addTableToggle,
    buildTableLabel,
    getSorterHelper: () => sorterHelper,
  };
  const projectSettingsBrowserAdapter = createProjectSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: projectSettingsActions,
    getProjectManager: () => ProjectManager,
    getSettingsRaw: () => settingsRaw,
    resetProjectSettings: (...args) => resetProjectSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    testSurface,
  });
  const { buildProjectSettings } = projectSettingsBrowserAdapter;
  const loggingSettingsActions = {
    buildSettingsSection2,
    addSettingsHeader1,
    addSettingsString,
    addSettingsToggle,
  };
  const loggingSettingsBrowserAdapter = createLoggingSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: loggingSettingsActions,
    getGame: () => game,
    getGameLog: () => GameLog,
    getSettingsRaw: () => settingsRaw,
    resetLoggingSettings: (...args) => resetLoggingSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    buildFilterRegExp: () => buildFilterRegExp(),
    testSurface,
  });
  const { buildLoggingSettings } = loggingSettingsBrowserAdapter;
  const optionsModalBrowserAdapter = createOptionsModalBrowserAdapter({
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
  const prestigeTopBarReader = createPrestigeTopBarEvolveAdapter({
    getSettings: () => getTestContext("prestigeTopBar")?.settings ?? settings,
    getPrestigeTypes: () =>
      getTestContext("prestigeTopBar")?.prestigeTypes ?? prestigeTypes,
  });
  const prestigeTopBarBrowserAdapter = createPrestigeTopBarBrowserAdapter({
    getDocument: () => runtimeEnvironment.document,
    reader: prestigeTopBarReader,
    options: {
      addOptionUI: (...args) =>
        (getTestContext("prestigeTopBar")?.addOptionUI ?? addOptionUI)(...args),
    },
    buildPrestigeSettings: (...args) =>
      (
        getTestContext("prestigeTopBar")?.buildPrestigeSettings ??
        buildPrestigeSettings
      )(...args),
  });
  const { updatePrestigeInTopBar } = prestigeTopBarBrowserAdapter;
  const totalDaysTopBarReader = createTotalDaysTopBarEvolveAdapter({
    getSettings: () => getTestContext("totalDaysTopBar")?.settings ?? settings,
    getGame: () => getTestContext("totalDaysTopBar")?.game ?? game,
  });
  const totalDaysTopBarBrowserAdapter = createTotalDaysTopBarBrowserAdapter({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    reader: totalDaysTopBarReader,
  });
  const { updateTotalDaysInTopBar } = totalDaysTopBarBrowserAdapter;
  const arpaToggleReader = createArpaToggleEvolveAdapter({
    getProjectManager: () =>
      getTestContext("arpaToggles")?.ProjectManager ?? ProjectManager,
    getSettingsRaw: () =>
      getTestContext("arpaToggles")?.settingsRaw ?? settingsRaw,
  });
  const arpaToggleBrowserAdapter = createArpaToggleBrowserAdapter({
    getJQuery: () => $,
    reader: arpaToggleReader,
    addToggleCallbacks: (...args) =>
      (getTestContext("arpaToggles")?.addToggleCallbacks ?? addToggleCallbacks)(
        ...args,
      ),
  });
  const { createArpaToggles, removeArpaToggles } = arpaToggleBrowserAdapter;
  const craftToggleReader = createCraftToggleEvolveAdapter({
    getCraftablesList: () =>
      getTestContext("craftToggles")?.craftablesList ?? craftablesList,
    getSettingsRaw: () =>
      getTestContext("craftToggles")?.settingsRaw ?? settingsRaw,
  });
  const craftToggleBrowserAdapter = createCraftToggleBrowserAdapter({
    getJQuery: () => $,
    reader: craftToggleReader,
    addToggleCallbacks: (...args) =>
      (
        getTestContext("craftToggles")?.addToggleCallbacks ?? addToggleCallbacks
      )(...args),
  });
  const { createCraftToggles, removeCraftToggles } = craftToggleBrowserAdapter;
  const buildingToggleReader = createBuildingToggleEvolveAdapter({
    getBuildingManager: () =>
      getTestContext("buildingToggles")?.BuildingManager ?? BuildingManager,
    getSettings: () => getTestContext("buildingToggles")?.settings ?? settings,
    getSettingsRaw: () =>
      getTestContext("buildingToggles")?.settingsRaw ?? settingsRaw,
  });
  const buildingToggleBrowserAdapter = createBuildingToggleBrowserAdapter({
    getJQuery: () => $,
    reader: buildingToggleReader,
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
  });
  const { createBuildingToggles, removeBuildingToggles } =
    buildingToggleBrowserAdapter;
  const ejectToggleReader = createEjectToggleEvolveAdapter({
    getEjectManager: () =>
      getTestContext("ejectToggles")?.EjectManager ?? EjectManager,
    getSettingsRaw: () =>
      getTestContext("ejectToggles")?.settingsRaw ?? settingsRaw,
  });
  const ejectToggleBrowserAdapter = createEjectToggleBrowserAdapter({
    getJQuery: () => $,
    reader: ejectToggleReader,
    addToggleCallbacks: (...args) =>
      (
        getTestContext("ejectToggles")?.addToggleCallbacks ?? addToggleCallbacks
      )(...args),
  });
  const { createEjectToggles, removeEjectToggles } = ejectToggleBrowserAdapter;
  const supplyToggleReader = createSupplyToggleEvolveAdapter({
    getSupplyManager: () =>
      getTestContext("supplyToggles")?.SupplyManager ?? SupplyManager,
    getSettingsRaw: () =>
      getTestContext("supplyToggles")?.settingsRaw ?? settingsRaw,
  });
  const supplyToggleBrowserAdapter = createSupplyToggleBrowserAdapter({
    getJQuery: () => $,
    reader: supplyToggleReader,
    addToggleCallbacks: (...args) =>
      (
        getTestContext("supplyToggles")?.addToggleCallbacks ??
        addToggleCallbacks
      )(...args),
  });
  const { createSupplyToggles, removeSupplyToggles } =
    supplyToggleBrowserAdapter;

  const generalSettingsActions = {
    buildSettingsSection,
    addSettingsHeader1,
    addSettingsNumber,
    addSettingsSelect,
    addSettingsString,
    addSettingsToggle,
  };
  const generalSettingsBrowserAdapter = createGeneralSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: generalSettingsActions,
    resetGeneralSettings: (...args) => resetGeneralSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    testSurface,
  });
  const { buildGeneralSettings } = generalSettingsBrowserAdapter;

  const achievementGuardSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
  };
  const achievementGuardSettingsBrowserAdapter =
    createAchievementGuardSettingsControl({
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: achievementGuardSettingsActions,
      resetAchievementGuardSettings: (...args) =>
        resetAchievementGuardSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      testSurface,
    });
  const { buildAchievementGuardSettings } =
    achievementGuardSettingsBrowserAdapter;

  const challengeHelperSettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addSettingsNumber,
  };
  const challengeHelperSettingsBrowserAdapter =
    createChallengeHelperSettingsControl({
      getDocument: () => runtimeEnvironment.document,
      getJQuery: () => $,
      actions: challengeHelperSettingsActions,
      resetChallengeHelperSettings: (...args) =>
        resetChallengeHelperSettings(...args),
      persistSettings: () => updateSettingsFromState(),
      testSurface,
    });
  const { buildChallengeHelperSettings } =
    challengeHelperSettingsBrowserAdapter;
  const prestigeSettingsBrowserAdapter = createPrestigeSettingsControl({
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
  });
  const { buildPrestigeSettings } = prestigeSettingsBrowserAdapter;
  const governmentSettingsActions = {
    buildSettingsSection2,
    addSettingsNumber,
    addSettingsSelect,
  };
  const governmentSettingsBrowserAdapter = createGovernmentSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: governmentSettingsActions,
    getGame: () => game,
    getGovernmentManager: () => GovernmentManager,
    getGovernors: () => governors,
    resetGovernmentSettings: (...args) => resetGovernmentSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    testSurface,
  });
  const { buildGovernmentSettings } = governmentSettingsBrowserAdapter;

  const authoritySettingsActions = {
    buildSettingsSection,
    addSettingsToggle,
    addSettingsNumber,
  };
  const authoritySettingsBrowserAdapter = createAuthoritySettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: authoritySettingsActions,
    resetAuthoritySettings: (...args) => resetAuthoritySettings(...args),
    persistSettings: () => updateSettingsFromState(),
    testSurface,
  });
  const { buildAuthoritySettings } = authoritySettingsBrowserAdapter;
  const evolutionSettingsControl = createEvolutionSettingsControl({
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
  });
  const {
    addEvolutionSetting,
    buildEvolutionSettings,
    updateEvolutionSettingsContent,
  } = evolutionSettingsControl;
  const planetSettingsActions = {
    buildSettingsSection,
    addTableInput,
    buildTableLabel,
  };
  const planetSettingsBrowserAdapter = createPlanetSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: planetSettingsActions,
    getGame: () => game,
    getBiomeList: () => biomeList,
    getTraitList: () => traitList,
    getExtraList: () => extraList,
    resetPlanetSettings: (...args) => resetPlanetSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    testSurface,
  });
  const { buildPlanetSettings } = planetSettingsBrowserAdapter;
  const triggerSettingsBrowserAdapter = createTriggerSettingsControl({
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
  });
  const { buildTriggerSettings, updateTriggerSettingsContent } =
    triggerSettingsBrowserAdapter;
  const researchSettingsBrowserAdapter = createResearchSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: {
      buildSettingsSection,
      addSettingsList,
      addSettingsSelect,
    },
    getGame: () => game,
    getTechIds: () => techIds,
    resetResearchSettings: (...args) => resetResearchSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    testSurface,
  });
  const { buildResearchSettings } = researchSettingsBrowserAdapter;
  const warSettingsBrowserAdapter = createWarSettingsControl({
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
  });
  const { buildWarSettings, updateWarSettingsContent } =
    warSettingsBrowserAdapter;
  const hellSettingsBrowserAdapter = createHellSettingsControl({
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
  });
  const { buildHellSettings, updateHellSettingsContent } =
    hellSettingsBrowserAdapter;
  const fleetSettingsBrowserAdapter = createFleetSettingsControl({
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
  });
  const { buildFleetSettings } = fleetSettingsBrowserAdapter;
  const mechSettingsBrowserAdapter = createMechSettingsControl({
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
  });
  const { buildMechSettings, updateMechSettingsContent } =
    mechSettingsBrowserAdapter;
  const ejectorSettingsBrowserAdapter = createEjectorSettingsControl({
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
  });
  const { buildEjectorSettings, updateEjectorSettingsContent } =
    ejectorSettingsBrowserAdapter;
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
  const marketSettingsBrowserAdapter = createMarketSettingsControl({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    actions: marketSettingsActions,
    getMarketManager: () => MarketManager,
    getResources: () => resources,
    getPoly: () => poly,
    getSettingsRaw: () => settingsRaw,
    resetMarketSettings: (...args) => resetMarketSettings(...args),
    persistSettings: () => updateSettingsFromState(),
    resetCheckbox: (...args) => resetCheckbox(...args),
    removeMarketToggles: () => removeMarketToggles(),
    testSurface,
  });
  const { buildMarketSettings, updateMarketSettingsContent } =
    marketSettingsBrowserAdapter;

  let { traitVal } = createTraitValue({ getGame: () => game });
  const authorityPolicy = createAuthorityPolicy({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    readHighPopulationPercent: () => traitVal("high_pop", 1, 100),
    readAuthorityPolicyView,
    readAuthorityQuantity,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    });

  const { normalizeProperties, addProps } = createPropertyHelpers({
    getSettings: () => settings,
  });
  let { getCostConflict } = createCostConflict({
    getState: () => state,
    getResources: () => resources,
  });
  const plannerStatsLifecycle = createPlannerStatsLifecycle(
    createPlannerStatsStore(runtimeEnvironment.storage),
  );
  const {
    plannerLimitingResource,
    makePlannerStats,
    loadPlannerStats,
    savePlannerStats,
  } = createPlannerState({
    getResources: () => resources,
    getGame: () => game,
    readPlannerLimitInput,
    readPlannerRun,
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
    getSettings: () => settings,
    commandExecutor: {
      getStorageManager: () => StorageManager,
      getResources: () => resources,
    },
  });
  const { calculateRequiredStorages } = createStorageRequirementsAction({
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
  });
  const { prioritizeDemandedResources } = createDemandPrioritizationAction({
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
    stateLogStore: createStateLogStore(runtimeEnvironment.storage),
    testSurface,
    setTestContext(context) {
      game = context.game;
      resources = context.resources;
      state = context.state;
    },
  });
  const { verifyGameActions, verifyGameActionsExist, verifyGameActionExists } =
    createGameActionVerification({
      getGame: () => game,
      getBuildings: () => buildings,
      log: (...values) => runtimeEnvironment.log(...values),
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
    stargatePiracySupressed,
    galaxyPiracyCoveredByFleet,
  } = createGalaxyIntelligence({
    getGame: () => game,
    getBuildings: () => buildings,
    getResources: () => resources,
    getGalaxyOffers: () => poly.galaxyOffers,
    getSettings: () => settings,
    getTraitVal: () => traitVal,
  });
  const {
    gateTowerSupressionTooLow,
    gateDemonsSupressed,
    guardPostPrebuildIncomplete,
  } = createHellIntelligence({
    getGame: () => game,
    getBuildings: () => buildings,
    getPoly: () => poly,
    getSettings: () => settings,
    getTraitVal: () => traitVal,
  });
  const { womlingStatEarned } = createWomlingAchievements({
    getGame: () => game,
    getPoly: () => poly,
  });
  const { shrineBonusUnwanted } = createShrineIntelligence({
    getGame: () => game,
    getSettings: () => settings,
  });
  const { madPrestigeAwaited } = createPrestigeIntelligence({
    getSettings: () => settings,
    getTechIds: () => techIds,
    getHaveTech: () => haveTech,
  });
  const {
    getCitadelConsumption,
    isHellSupressUseful,
    adjustSpire,
    getBestSupplyRatio,
    nextCitadelPowerDraw,
    spirePrebuildShortfall,
  } = createPowerSupport({
    getGame: () => game,
    getJobs: () => jobs,
    getCrafter: () => crafter,
    getResources: () => resources,
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
    getDate: () => runtimeEnvironment.createDate(),
  });
  let win = null;
  const userscriptEnvironment = createUserscriptEnvironment(
    runtimeEnvironment.window,
  );
  const {
    callVueMethod,
    getVueById,
    getMainVue,
    getVueElement,
    resolveVueMethod,
    triggerFileDownload,
  } = createBrowserRuntime({
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

  const projectControls = createGameProjectControls({
    getVueById: (id) => getVueById(id),
    getMainVue: () => getMainVue(),
  });
  const researchControls = createGameResearchControls({
    getDocument: () => runtimeEnvironment.document,
    getVueById: (id) => getVueById(id),
  });
  const clickMultipliers = createGameClickMultipliers({
    getKeyManager: () => KeyManager,
  });
  const traitControls = createGameTraitControls({
    getVueById: (id) => getVueById(id),
  });
  const jobControls = createGameJobControls({
    getVueById: (id) => getVueById(id),
    clickSteps: (count) => clickMultipliers.steps(count),
  });
  const actionControls = createGameActionControls({
    getVueById: (id) => getVueById(id),
    selectTooltip: () => $("#popper"),
    clickSteps: (count) => clickMultipliers.steps(count),
  });
  const craftingControls = createGameCraftingControls({
    getVueById: (id) => getVueById(id),
    clearClickMultipliers: () => clickMultipliers.clear(),
  });
  const industryControls = createGameIndustryControls({
    getVueById: (id) => getVueById(id),
    clickSteps: (count) => clickMultipliers.steps(count),
  });
  const espionageControls = createGameEspionageControls({
    getVueById: (id) => getVueById(id),
  });
  const foreignControls = createGameForeignControls({
    getVueById: (id) =>
      getTestContext("foreignControls")?.getVueById?.(id) ?? getVueById(id),
  });
  const governmentSelection = createGameGovernmentSelection({
    getVueById: (id) => getVueById(id),
  });
  const marketControls = createGameMarketControls({
    getVueById: (id) => getVueById(id),
    clickSteps: (count) => clickMultipliers.steps(count),
  });
  const storageControls = createGameStorageControls({
    getVueById: (id) => getVueById(id),
    clickSteps: (count) => clickMultipliers.steps(count),
  });
  const disposalControls = createGameDisposalControls({
    getVueById: (id) => getVueById(id),
    clickSteps: (count) => clickMultipliers.steps(count),
  });
  const fleetControls = createGameFleetControls({
    getVueById: (id) => getVueById(id),
    clickSteps: (count) => clickMultipliers.steps(count),
    getGame: () => game,
    getJQuery: () => $,
  });
  const garrisonControls = createGameGarrisonControls({
    getVueById: (id) => getVueById(id),
    clickSteps: (count) => clickMultipliers.steps(count),
    getGame: () => game,
    clearClickMultipliers: () => clickMultipliers.clear(),
    callVueMethod,
  });
  const mechControls = createGameMechControls({
    getVueById: (id) => getVueById(id),
  });
  const mechListControls = createGameMechListControls({
    getVueById: (id) => getVueById(id),
    getSortable: () => runtimeEnvironment.Sortable,
    getPageSortable: () => win.Sortable,
    isSandboxBypass: () => needSandboxBypass,
    cloneIntoPage: (value, options) =>
      userscriptEnvironment.cloneIntoPage(value, options),
  });

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
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    });

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
  let techIds = {};
  let buildingIds = {};
  let arpaIds = {};
  let jobIds = {};
  let evolutions = {};
  let imitations = {};
  let races = {};
  let craftablesList = [];
  let foundryList = [];

  // State variables
  let state = {
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      entityCatalogs: {
        resources,
        jobs,
        crafter,
        buildings,
        linkedBuildings,
        projects,
      },
    });

  const {
    namedBuildings,
    authorityCapBuildings,
    INFLATION_CHALLENGE_MONEY,
    RETIREMENT_PREP,
    inflationMoneyStorageBuildings,
    inflationMoneyIncomeBuildings,
    galaxyCombatShips,
    weightingRules,
  } = createBuildingWeightingPolicy({
    formatNumber: getNumberString,
    formatNiceNumber: getNiceNumber,
    nextRandomUnit: () => randomSource.nextUnit(),
  });
  const buildingWeightingDescriber = createBuildingWeightingDescriber({
    formatNiceNumber: getNiceNumber,
  });
  const buildingWeightingDecider = createBuildingWeightingDecider({
    weightingRules,
  });

  const isVacuumSyphonStage = () =>
    isVacuumCollapseManaStageReady({
      prestigeType: String(settings["prestigeType"] ?? ""),
      manaRate: Number(resources?.Mana?.rateOfChange),
      requiredManaRate: Number(
        settings["prestigeVacuumMana"] ?? DEFAULT_VACUUM_MANA_REQUIREMENT,
      ),
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    });

  // Singleton manager objects
  let MinorTraitManager, MutableTraitManager;
  ({ MinorTraitManager, MutableTraitManager } = createTraitManagers({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    haveTech,
  }));

  const { QuarryManager, MineManager, ExtractorManager } =
    createIndustryManagers({
      getGame: () => game,
      getBuildings: () => buildings,
      industryControls,
      haveTech,
    });

  let NaniteManager, SupplyManager, EjectManager;
  ({ NaniteManager, SupplyManager, EjectManager } = createDisposalManagers({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getPoly: () => poly,
    haveTask,
    industryControls,
    disposalControls,
  }));

  let AlchemyManager, RitualManager;
  ({ AlchemyManager, RitualManager } = createMagicManagers({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    haveTech,
    isLumberRace,
    addProps,
    industryControls,
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
    industryControls,
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
      governmentSelection,
      marketControls,
      storageControls,
      getFeatureVisibility: () => featureVisibility,
      getGameModal: () => gameModal,
      getGameLog: () => GameLog,
      haveTech,
      traitVal,
      industryControls,
    }));

  let SpyManager, WarManager;
  ({ SpyManager, WarManager } = createForeignAffairsManagers({
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
      readForeignAchievementGoal({
        getSettings: () => settings,
        getGame: () => game,
        isAchievementUnlocked: (achievement, level) =>
          isAchievementUnlocked(achievement, level),
      }),
    getTraitVal: () => traitVal,
    getGovPower,
    getGovName,
    getOccCosts,
    logError: (...args) => runtimeEnvironment.error(...args),
  }));

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    });

  let FleetManagerOuter, FleetManager;
  ({ FleetManagerOuter, FleetManager } = createFleetManagers({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getPoly: () => poly,
    getHaveTech: () => haveTech,
    fleetControls,
  }));

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  let { MechManager } = createMechManager({
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
  });
  const { mechSupplySavingReason } = createMechIntelligence({
    getGame: () => game,
    getSettings: () => settings,
    getBuildings: () => buildings,
    getResources: () => resources,
    getMechManager: () => MechManager,
    getHaveTask: () => haveTask,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  let JobManager, BuildingManager, ProjectManager, TriggerManager;
  ({ JobManager, BuildingManager, ProjectManager, TriggerManager } =
    createCoreManagers({
      getGame: () => game,
      getSettings: () => settings,
      getState: () => state,
      getBuildings: () => buildings,
      getProjects: () => projects,
      isVacuumSyphonStage,
      getNiceNumber,
      weightingDecider: buildingWeightingDecider,
      readWeightingCandidate,
      describeBuildingWeighting: buildingWeightingDescriber.describe,
      readWeightingSnapshot: createWeightingSnapshotReader({
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
          readForeignAchievementGoal({
            getSettings: () => settings,
            getGame: () => game,
            isAchievementUnlocked: (achievement, level) =>
              isAchievementUnlocked(achievement, level),
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
      }),
      isEarlyGame,
      getIsPrestigeAllowed: () => isPrestigeAllowed,
      getBananaRepublicObjectiveComplete: () => bananaRepublicObjectiveComplete,
      getInflationChallengeAssistActive: () => inflationChallengeAssistActive,
      Trigger,
      getWindow: () => win,
      diagnostics,
    }));

  let KeyManager, GameLog;
  const gameKeyboardHandlers = createGameKeyboardHandlers({
    getWin: () => win,
    getDocument: () => runtimeEnvironment.document,
    getKeyboardEvent: () => runtimeEnvironment.KeyboardEvent,
    getNeedSandboxBypass: () => needSandboxBypass,
    cloneIntoPage: (value) => userscriptEnvironment.cloneIntoPage(value),
  });
  ({ KeyManager, GameLog } = createInfrastructureManagers({
    getGame: () => game,
    getSettings: () => settings,
    getPoly: () => poly,
    getKeyboardHandlers: () => gameKeyboardHandlers,
  }));

  const gamePageShell = createGamePageShell({
    getDocument: () => runtimeEnvironment.document,
    getMutationObserver: () => runtimeEnvironment.MutationObserver,
    getNode: () => runtimeEnvironment.Node,
    getTooltipObserver: () => tooltipObserverCallback,
    getLogFilter: () => filterLog,
    getModal: () => gameModal,
    getJQuery: () => $,
  });

  const gameUiSurface = createGameUiSurface({
    getDocument: () => runtimeEnvironment.document,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    });

  // Gui & Init functions
  const { updateCraftCost } = createCraftingCosts({
    getGame: () => game,
    getState: () => state,
    getResources: () => resources,
    setCraftablesList: (list) => (craftablesList = list),
    setFoundryList: (list) => (foundryList = list),
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    getIsLumberRace: () =>
      getTestContext("stateInitialization")?.actions?.isLumberRace ??
      isLumberRace,
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    formatRetirementShortfalls,
    inflationChallengeMoney: INFLATION_CHALLENGE_MONEY,
    retirementPreparation: RETIREMENT_PREP,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    findRequiredResourceWeightPolicy(state.unlockedBuildings, resource);

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      findRequiredResourceWeight,
      setResourceWeightTestContext(context) {
        state = context.state;
      },
    });

  const challengeGroups = challenges.map((members) => ({ members }));
  // function setPlanet from actions.js
  // Produces same set of planets, accurate for v1.0.29
  let { generatePlanets } = createPlanetGeneration({
    getGame: () => game,
    getPoly: () => poly,
    getIsAchievementUnlocked: () => isAchievementUnlocked,
    universes,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      generatePlanets,
      setPlanetGenerationTestContext(context) {
        game = context.game;
        poly = context.poly;
        isAchievementUnlocked = context.isAchievementUnlocked;
      },
    });

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

  const { autoCraft } = createCraftControl({
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
  });

  const { autoGovernment } = createGovernmentControl({
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
  });

  const { autoMerc } = createMercenaryControl({
    getWarManager: () => WarManager,
    getState: () => state,
    getSettings: () => settings,
    getResources: () => resources,
    shouldSaveInflationMoney: inflationChallengeShouldSaveMoney,
    getGameLog: () => GameLog,
  });

  const { autoSpy } = createSpyControl({
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
  });

  const { autoBattle } = createBattleControl({
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

  const { autoHell } = createHellControl({
    getWarManager: () => WarManager,
    getGame: () => game,
    getSettings: () => settings,
    getBuildings: () => buildings,
    getResources: () => resources,
    getState: () => state,
    getDebugWindow: () => runtimeEnvironment.window,
    debugLog: (message) => runtimeEnvironment.log(message),
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__) testSurface?.add({ autoHell });

  const { autoJobs } = createJobsControl({
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
  });

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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { autoAlchemy } = createAlchemyControl({
    getAlchemyManager: () => AlchemyManager,
    getResources: () => resources,
    getSettings: () => settings,
    getGame: () => game,
    getAchievementStar,
  });

  const { autoPylon } = createPylonControl({
    getRitualManager: () => RitualManager,
    getResources: () => resources,
    getSettings: () => settings,
    getGame: () => game,
    getJobs: () => jobs,
    haveTech,
  });

  const { autoQuarry, autoMine, autoExtractor } = createResourceRatioControls({
    getQuarryManager: () => QuarryManager,
    getMineManager: () => MineManager,
    getExtractorManager: () => ExtractorManager,
    getResources: () => resources,
    getSettings: () => settings,
    getBuildings: () => buildings,
    haveTech,
  });

  const { autoSmelter } = createSmelterControl({
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
  });

  const { autoFactory } = createFactoryControl({
    adapter: {
      getManager: () => FactoryManager,
      getState: () => state,
      getSettings: () => settings,
      getGame: () => game,
      getResources: () => resources,
      consumptionBalanceMinimum: CONSUMPTION_BALANCE_MIN,
    },
    getState: () => state,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      autoFactory,
      FactoryManager,
      factorySettings: settings,
      factoryState: state,
    });

  const { autoMiningDroid } = createMiningDroidControl(() => DroidManager);

  const { autoGraphenePlant } = createGrapheneControl({
    getGrapheneManager: () => GrapheneManager,
    getResources: () => resources,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  });

  // TODO: Allow configuring priorities between eject\supply\nanite
  const { autoConsume } = createConsumeControl({
    getResources: () => resources,
    isHungryRace,
  });

  const { autoReplicator } = createReplicatorControl({
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
  });

  const { formatLogString, logPrestige } = createPrestigeLog({
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
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      prestigeLog: { formatLogString, logPrestige },
      setPrestigeLogTestContext(context) {
        settings = context.settings;
        game = context.game;
        state = context.state;
        GameLog = context.GameLog;
        setTestContext("prestigeLog", context);
      },
    });

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
    haveTech: (...args) => haveTech(...args),
    isAchievementUnlocked: (...args) => isAchievementUnlocked(...args),
  });

  const { autoPrestige } = createPrestigeControl({
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
        isApocalypsePrestigeAvailable: () => isApocalypsePrestigeAvailable(),
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
      logPrestige,
      loadQueuedSettings,
    },
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { autoShapeshift } = createShapeshiftControl({
    reader: {
      getGame: () => game,
      getSettings: () => settings,
    },
    executor: {
      getGame: () => game,
      getVueById,
    },
  });

  const { autoPsychic } = createPsychicControl({
    controls: {
      getVueById,
      clickSelector: (selector) => $(selector).click(),
    },
    adapter: {
      getGame: () => game,
      getSettings: () => settings,
      getResources: () => resources,
    },
  });

  const ocularPowerData = [
    { key: "d", id: "disintegration", locParam: ["X"] },
    { key: "p", id: "petrification", locParam: [resources.Stone.name] },
    { key: "w", id: "wound", locParam: ["X"] },
    { key: "t", id: "telekinesis", locParam: ["X"] },
    { key: "f", id: "fear", locParam: undefined },
    { key: "c", id: "charm", locParam: ["X"] },
  ];

  const { autoOcularPowers } = createOcularPowerControl({
    controls: {
      getVueById,
      getDocument: () => runtimeEnvironment.document,
    },
    adapter: {
      getGame: () => game,
      getSettings: () => settings,
      getPowerData: () => ocularPowerData,
    },
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
  const { autoWish } = createWishControl({
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
  });

  const { autoGenetics } = createGeneticsControl({
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
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { autoMarket } = createMarketControl({
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
  });

  const { autoGalaxyMarket } = createGalaxyMarketControl({
    getManager: () => GalaxyTradeManager,
    getOffers: () => poly.galaxyOffers,
    getResources: () => resources,
    getSettings: () => settings,
  });

  const { autoGatherResources } = createGatherResourcesControl({
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getResourcesPerClick: () => getResourcesPerClick(),
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { autoBuild } = createBuildControl({
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
  });

  let techConflictClock = browserClock;
  const { getTechConflict } = createTechConflict({
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
    formatTechConflict,
    getNumberString,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { autoTrigger } = createTriggerControl({
    reader: {
      getState: () => state,
      shouldSaveInflationMoney: inflationChallengeShouldSaveMoney,
    },
    executor: {
      getState: () => state,
    },
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { autoResearch } = createResearchControl({
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
  });

  const { autoPower } = createPowerControl({
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
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      expandStorage,
      setStorageExpansionTestContext(context) {
        game = context.game;
        settings = context.settings;
        resources = context.resources;
        buildings = context.buildings;
        StorageManager = context.StorageManager;
      },
    });

  const { autoStorage } = createStorageAllocationControl({
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
  });

  const { autoMinorTrait } = createMinorTraitControl({
    reader: {
      getMinorTraitManager: () => MinorTraitManager,
      getResources: () => resources,
    },
    executor: {
      traitControls,
      getResources: () => resources,
    },
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      autoMinorTrait,
      MinorTraitManager,
    });

  const { autoMutateTrait } = createMutationControl({
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
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  let { adjustTradeRoutes } = createTradeRoutes({
    getSettings: () => settings,
    getGame: () => game,
    getResources: () => resources,
    getMarketManager: () => MarketManager,
    getGovernor: () => getGovernor(),
    shouldSaveInflationMoney: () => inflationChallengeShouldSaveMoney(),
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      adjustTradeRoutes,
      setTradeRoutesTestContext(context) {
        settings = context.settings;
        game = context.game;
        resources = context.resources;
        MarketManager = context.MarketManager;
      },
    });

  const { autoFleetOuter } = createOuterFleetControl({
    getFleetManagerOuter: () => FleetManagerOuter,
    getWarManager: () => WarManager,
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    traitVal,
    assessAuthorityRemoval: authorityPolicy.assessAuthorityRemoval,
    getGameLog: () => GameLog,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { autoFleet } = createFleetControl({
    getFleetManager: () => FleetManager,
    getGame: () => game,
    getSettings: () => settings,
    getResources: () => resources,
    getBuildings: () => buildings,
    getGalaxyRegions,
    guardActive,
    galaxyAssaultPending,
  });

  const { autoMech } = createMechControl({
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
  });

  const { updateScriptData, finalizeScriptData } =
    createScriptDataLifecycleControl({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  let { checkAffordableCustom, readQueuedTarget } = createQueueQueries({
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

  const { checkEvolutionResult } = createEvolutionResultCheck({
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
    formatLog: (event, localize) => formatEvolutionLog(event, localize),
    addEvolutionSetting: () => addEvolutionSetting(),
    updateSettingsFromState: () => updateSettingsFromState(),
    getTestActions: () => getTestContext("evolutionResult")?.actions,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    });

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

  const { getMultiSegmentedTimeLeft } = createTargetTimingDisplay({
    getGame: () => game,
    getTimeFormat: () => (seconds) => poly.timeFormat(seconds),
    isProject: (target) => target instanceof Project,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { updateOverrides } = createOverrideSettings({
    getSafeMode: () => safeMode,
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    source: createOverrideEvaluationSource({
      getCheckTypes: () => checkTypes,
      getCheckCompare: () => checkCompare,
      getCheckCustom: () => checkCustom,
      getHaveTask: () => haveTask,
    }),
    reporter: createOverrideFailureReporter({
      getGameModal: () => gameModal,
      getGame: () => game,
      getGameLog: () => GameLog,
    }),
    display: createOverrideEffectiveValueDisplay({
      getJQuery: () => $,
      changeDisplayInputNode,
    }),
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    customRaceLab: createGameCustomRaceLab({
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

  const { automate } = createTickRunner({
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
    },
    controllers: tickControllers,
    getTestControllers: () => tickTestControllers,
    diagnostics,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const {
    updateDebugData,
    addScriptStyle,
    checkIgnoredError,
    displayScriptWarningNode,
    addErrorHandler,
  } = createScriptRuntimeUI({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
  } = createOverrideCatalog({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
  const interfaceSettingsBrowserAdapter = createInterfaceSettingsBrowserAdapter(
    {
      getDocument: () => runtimeEnvironment.document,
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      interfaceSettings: {
        buildInterfaceSettings,
        updateInterfaceSettingsContent,
      },
      setInterfaceSettingsTestContext(context) {
        settingsRaw = context.settingsRaw;
        setTestContext("interfaceSettings", context);
      },
    });

  let stateLogSettingsIntentHandler;
  const stateLogSettingsBrowserAdapter = createStateLogSettingsBrowserAdapter({
    getDocument: () => runtimeEnvironment.document,
    getJQuery: () => $,
    intents: {
      handle: (intent) => stateLogSettingsIntentHandler.handle(intent),
    },
    buildSettingsSection,
    addSettingsToggle,
    addSettingsNumber,
  });
  stateLogSettingsIntentHandler = createStateLogSettingsIntentHandler({
    writer: {
      resetToDefaults: () => resetStateLogSettings(true),
      persist: () => updateSettingsFromState(),
    },
    renderSettingsContent: () =>
      stateLogSettingsBrowserAdapter.updateStateLogSettingsContent(),
  });
  const { buildStateLogSettings, updateStateLogSettingsContent } =
    stateLogSettingsBrowserAdapter;

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      stateLogSettings: {
        buildStateLogSettings,
        updateStateLogSettingsContent,
      },
      setStateLogSettingsTestContext(context) {
        settingsRaw = context.settingsRaw;
      },
    });

  const { calculateMechStats } = createMechStats({
    getUiSurface: () => gameUiSurface,
    getJQuery: () => $,
    getMechManager: () => MechManager,
    getPoly: () => poly,
    getGame: () => game,
    average,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      calculateMechStats,
      setMechStatsTestContext(context) {
        game = context.game;
        poly = context.poly;
        MechManager = context.MechManager;
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("optionsModal", {
      optionsModal: optionsModalBrowserAdapter,
    });
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

  const { updateSoulGemRate } = createSoulGemRateDisplay({
    getState: () => state,
    getResources: () => resources,
    getJQuery: () => $,
    getNiceNumber: (value) =>
      (getTestContext("uiRefresh")?.actions ?? uiRefreshActions).getNiceNumber(
        value,
      ),
  });

  const { renderPreviousGameStats } = createPreviousGameStats({
    getGame: () => game,
    getWin: () => win,
    getJQuery: () => $,
    storage: runtimeEnvironment.storage,
  });

  const { repairRuntimeAdapters } = createRuntimeAdapters({
    getSettings: () => settings,
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getGame: () => game,
    getJQuery: () => $,
    getActions: () => getTestContext("uiRefresh")?.actions ?? uiRefreshActions,
  });

  const { ensureAutomationContainer } = createAutomationContainer({
    getSettingsRaw: () => settingsRaw,
    getJQuery: () => $,
    getSafeMode: () => safeMode,
    getOverrideKeyLabel: () => overrideKeyLabel,
    getActions: () => getTestContext("uiRefresh")?.actions ?? uiRefreshActions,
  });

  const { updateUI } = createUIRefresh({
    getUiSurface: () => gameUiSurface,
    getActions: () => getTestContext("uiRefresh")?.actions ?? uiRefreshActions,
    getPhases: () => ({
      ensureAutomationContainer,
      repairRuntimeAdapters,
      updateSoulGemRate,
      renderPreviousGameStats,
    }),
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("prestigeTopBar", {
      prestigeTopBar: prestigeTopBarBrowserAdapter,
    });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("totalDaysTopBar", {
      totalDaysTopBar: totalDaysTopBarBrowserAdapter,
    });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("ejectToggles", {
      ejectToggles: ejectToggleBrowserAdapter,
    });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("supplyToggles", {
      supplyToggles: supplyToggleBrowserAdapter,
    });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("craftToggles", {
      craftToggles: craftToggleBrowserAdapter,
    });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("arpaToggles", {
      arpaToggles: arpaToggleBrowserAdapter,
    });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("buildingToggles", {
      buildingToggles: buildingToggleBrowserAdapter,
    });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext(
      "resourceToggle",
      {
        resourceToggles: resourceToggleBrowserAdapter,
      },
      "resourceToggles",
    );
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("mechInfo", {
      mechInfo: mechInfoBrowserAdapter,
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  const { sorterHelper } = createSortHelper({
    getJQuery: () => $,
    isHTMLElement: (value) =>
      runtimeEnvironment.HTMLElement !== undefined &&
      value instanceof runtimeEnvironment.HTMLElement,
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({ sorterHelper });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      getCostConflict,
      setCostConflictTestContext(context) {
        state = context.state;
        resources = context.resources;
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      numberFormatting: {
        getRealNumber,
        getNumberString,
        getNiceNumber,
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      runtimeQueries: { getGovernor, haveTask, haveTech, isEarlyGame },
      setRuntimeQueryTestContext(context) {
        game = context.game;
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      raceProfile: { isHungryRace, isDemonRace, isLumberRace, getOccCosts },
      setRaceProfileTestContext(context) {
        game = context.game;
        traitVal = context.traitVal;
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      foreignGovernment: { getGovName, getGovPower },
      setForeignGovernmentTestContext(context) {
        game = context.game;
        poly = context.poly;
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      fastEvaluator: {
        fastEval,
        cacheSize: fastEvalCacheSize,
      },
      setFastEvaluatorTestContext(context) {
        if ("settings" in context) settings = context.settings;
        if ("state" in context) state = context.state;
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      propertyHelpers: { normalizeProperties, addProps },
      setPropertyHelperTestContext(context) {
        settings = context.settings;
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      browserRuntime: {
        callVueMethod,
        getMainVue,
        getVueById,
        getVueElement,
        resolveVueMethod,
        triggerFileDownload,
      },
      setBrowserRuntimeTestContext(context) {
        win = context.win;
      },
    });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      traitVal,
      setTraitValueTestContext(context) {
        game = context.game;
      },
    });

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
    getActions: () =>
      getTestContext("settingsTransfer")?.actions ?? settingsTransferActions,
    confirmImport: (message) => runtimeEnvironment.confirm(message),
    logToConsole: (message) => runtimeEnvironment.log(message),
  });

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      settingsTransfer: { importSettings, exportSettings },
      setSettingsTransferTestContext(context) {
        settingsRaw = context.settingsRaw;
        GameLog = context.GameLog;
        setTestContext("settingsTransfer", context);
      },
    });

  let poly = createGameCompatibility({
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

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      gameCompatibility: poly,
    });

  $().ready(mainAutoEvolveScript);
  return testSurface?.finish() ?? {};
}
