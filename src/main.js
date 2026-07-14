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

(function ($) {
  "use strict";
  const { getRealNumber, getNumberString, getNiceNumber } =
    createNumberFormatting({ numberSuffix });
  var settingsRaw = JSON.parse(localStorage.getItem("settings")) ?? {};
  var settings = {};
  var game = null;
  const generalSettingsOverrides = {};
  function getGeneralSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(generalSettingsOverrides, name)) {
      return generalSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "addSettingsHeader1":
        return addSettingsHeader1;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "addSettingsString":
        return addSettingsString;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "document":
        return document;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetGeneralSettings":
        return resetGeneralSettings;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const generalSettings = createGeneralSettings({
    getDependency: getGeneralSettingsDependency,
    getOverride: (name) => generalSettingsOverrides[name],
  });
  const { buildGeneralSettings, updateGeneralSettingsContent } =
    generalSettings;

  const achievementGuardSettingsOverrides = {};
  function getAchievementGuardSettingsDependency(name) {
    if (
      Object.prototype.hasOwnProperty.call(
        achievementGuardSettingsOverrides,
        name,
      )
    ) {
      return achievementGuardSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "document":
        return document;
      case "resetAchievementGuardSettings":
        return resetAchievementGuardSettings;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const achievementGuardSettings = createAchievementGuardSettings({
    getDependency: getAchievementGuardSettingsDependency,
    getOverride: (name) => achievementGuardSettingsOverrides[name],
  });
  const {
    buildAchievementGuardSettings,
    updateAchievementGuardSettingsContent,
  } = achievementGuardSettings;

  const challengeHelperSettingsOverrides = {};
  function getChallengeHelperSettingsDependency(name) {
    if (
      Object.prototype.hasOwnProperty.call(
        challengeHelperSettingsOverrides,
        name,
      )
    ) {
      return challengeHelperSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "document":
        return document;
      case "resetChallengeHelperSettings":
        return resetChallengeHelperSettings;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const challengeHelperSettings = createChallengeHelperSettings({
    getDependency: getChallengeHelperSettingsDependency,
    getOverride: (name) => challengeHelperSettingsOverrides[name],
  });
  const { buildChallengeHelperSettings, updateChallengeHelperSettingsContent } =
    challengeHelperSettings;

  const prestigeSettingsOverrides = {};
  function getPrestigeSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(prestigeSettingsOverrides, name)) {
      return prestigeSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "addSettingsHeader1":
        return addSettingsHeader1;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "buildCustomRacePresetEditor":
        return buildCustomRacePresetEditor;
      case "buildSettingsSection2":
        return buildSettingsSection2;
      case "buildings":
        return buildings;
      case "confirm":
        return confirm;
      case "document":
        return document;
      case "game":
        return game;
      case "haveTech":
        return haveTech;
      case "isApocalypsePrestigeAvailable":
        return isApocalypsePrestigeAvailable;
      case "isAscensionPrestigeAvailable":
        return isAscensionPrestigeAvailable;
      case "isBioseederPrestigeAvailable":
        return isBioseederPrestigeAvailable;
      case "isCataclysmPrestigeAvailable":
        return isCataclysmPrestigeAvailable;
      case "isDemonicPrestigeAvailable":
        return isDemonicPrestigeAvailable;
      case "isPrestigeAllowed":
        return isPrestigeAllowed;
      case "isWhiteholePrestigeAvailable":
        return isWhiteholePrestigeAvailable;
      case "isWitchAscensionPrestigeAvailable":
        return isWitchAscensionPrestigeAvailable;
      case "openOptionsModal":
        return openOptionsModal;
      case "openOverrideModal":
        return openOverrideModal;
      case "prestigeOptions":
        return prestigeOptions;
      case "resetPrestigeSettings":
        return resetPrestigeSettings;
      case "settingsRaw":
        return settingsRaw;
      case "state":
        return state;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const prestigeSettings = createPrestigeSettings({
    getDependency: getPrestigeSettingsDependency,
    getOverride: (name) => prestigeSettingsOverrides[name],
  });
  const { buildPrestigeSettings, updatePrestigeSettingsContent } =
    prestigeSettings;

  const governmentSettingsOverrides = {};
  function getGovernmentSettingsDependency(name) {
    if (
      Object.prototype.hasOwnProperty.call(governmentSettingsOverrides, name)
    ) {
      return governmentSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "GovernmentManager":
        return GovernmentManager;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "buildSettingsSection2":
        return buildSettingsSection2;
      case "document":
        return document;
      case "game":
        return game;
      case "governors":
        return governors;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetGovernmentSettings":
        return resetGovernmentSettings;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const governmentSettings = createGovernmentSettings({
    getDependency: getGovernmentSettingsDependency,
    getOverride: (name) => governmentSettingsOverrides[name],
  });
  const { buildGovernmentSettings, updateGovernmentSettingsContent } =
    governmentSettings;

  const evolutionSettingsOverrides = {};
  function getEvolutionSettingsDependency(name) {
    if (
      Object.prototype.hasOwnProperty.call(evolutionSettingsOverrides, name)
    ) {
      return evolutionSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "addStandardHeading":
        return addStandardHeading;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "challenges":
        return challenges;
      case "document":
        return document;
      case "evolutionSettingsToStore":
        return evolutionSettingsToStore;
      case "game":
        return game;
      case "getStarLevel":
        return getStarLevel;
      case "prestigeOptions":
        return prestigeOptions;
      case "prestigeTypes":
        return prestigeTypes;
      case "races":
        return races;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetEvolutionSettings":
        return resetEvolutionSettings;
      case "settings":
        return settings;
      case "settingsRaw":
        return settingsRaw;
      case "sorterHelper":
        return sorterHelper;
      case "state":
        return state;
      case "universes":
        return universes;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
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
  function getPlanetSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(planetSettingsOverrides, name)) {
      return planetSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "addTableInput":
        return addTableInput;
      case "biomeList":
        return biomeList;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "buildTableLabel":
        return buildTableLabel;
      case "document":
        return document;
      case "extraList":
        return extraList;
      case "game":
        return game;
      case "resetPlanetSettings":
        return resetPlanetSettings;
      case "traitList":
        return traitList;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const planetSettings = createPlanetSettings({
    getDependency: getPlanetSettingsDependency,
    getOverride: (name) => planetSettingsOverrides[name],
  });
  const { buildPlanetSettings, updatePlanetSettingsContent } = planetSettings;

  const triggerSettingsOverrides = {};
  function getTriggerSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(triggerSettingsOverrides, name)) {
      return triggerSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "TriggerManager":
        return TriggerManager;
      case "argType":
        return argType;
      case "buildInputNode":
        return buildInputNode;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "checkTypes":
        return checkTypes;
      case "document":
        return document;
      case "overrideOnlyChecks":
        return overrideOnlyChecks;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetTriggerSettings":
        return resetTriggerSettings;
      case "retBools":
        return retBools;
      case "sorterHelper":
        return sorterHelper;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
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
  function getResearchSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(researchSettingsOverrides, name)) {
      return researchSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "addSettingsList":
        return addSettingsList;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "document":
        return document;
      case "game":
        return game;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetResearchSettings":
        return resetResearchSettings;
      case "techIds":
        return techIds;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const researchSettings = createResearchSettings({
    getDependency: getResearchSettingsDependency,
    getOverride: (name) => researchSettingsOverrides[name],
  });
  const { buildResearchSettings, updateResearchSettingsContent } =
    researchSettings;

  const warSettingsOverrides = {};
  function getWarSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(warSettingsOverrides, name)) {
      return warSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "SpyManager":
        return SpyManager;
      case "addSettingsHeader1":
        return addSettingsHeader1;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "buildSettingsSection2":
        return buildSettingsSection2;
      case "document":
        return document;
      case "game":
        return game;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetWarSettings":
        return resetWarSettings;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const warSettings = createWarSettings({
    getDependency: getWarSettingsDependency,
    getOverride: (name) => warSettingsOverrides[name],
  });
  const { buildWarSettings, updateWarSettingsContent } = warSettings;

  const hellSettingsOverrides = {};
  function getHellSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(hellSettingsOverrides, name)) {
      return hellSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "addSettingsHeader1":
        return addSettingsHeader1;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "buildSettingsSection2":
        return buildSettingsSection2;
      case "document":
        return document;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetHellSettings":
        return resetHellSettings;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const hellSettings = createHellSettings({
    getDependency: getHellSettingsDependency,
    getOverride: (name) => hellSettingsOverrides[name],
  });
  const { buildHellSettings, updateHellSettingsContent } = hellSettings;

  const fleetSettingsOverrides = {};
  function getFleetSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(fleetSettingsOverrides, name)) {
      return fleetSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "FleetManagerOuter":
        return FleetManagerOuter;
      case "addSettingsHeader1":
        return addSettingsHeader1;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "addStandardHeading":
        return addStandardHeading;
      case "addTableInput":
        return addTableInput;
      case "buildSettingsSection2":
        return buildSettingsSection2;
      case "buildTableLabel":
        return buildTableLabel;
      case "document":
        return document;
      case "galaxyRegions":
        return galaxyRegions;
      case "game":
        return game;
      case "openOverrideModal":
        return openOverrideModal;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetFleetSettings":
        return resetFleetSettings;
      case "settings":
        return settings;
      case "settingsRaw":
        return settingsRaw;
      case "sorterHelper":
        return sorterHelper;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
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
  function getMechSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(mechSettingsOverrides, name)) {
      return mechSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "MechManager":
        return MechManager;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "addStandardHeading":
        return addStandardHeading;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "calculateMechStats":
        return calculateMechStats;
      case "document":
        return document;
      case "game":
        return game;
      case "removeMechInfo":
        return removeMechInfo;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetMechSettings":
        return resetMechSettings;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const mechSettings = createMechSettings({
    getDependency: getMechSettingsDependency,
    getOverride: (name) => mechSettingsOverrides[name],
  });
  const { buildMechSettings, updateMechSettingsContent } = mechSettings;

  const ejectorSettingsOverrides = {};
  function getEjectorSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(ejectorSettingsOverrides, name)) {
      return ejectorSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "EjectManager":
        return EjectManager;
      case "NaniteManager":
        return NaniteManager;
      case "SupplyManager":
        return SupplyManager;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsSelect":
        return addSettingsSelect;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "addTableToggle":
        return addTableToggle;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "buildTableLabel":
        return buildTableLabel;
      case "document":
        return document;
      case "removeEjectToggles":
        return removeEjectToggles;
      case "removeSupplyToggles":
        return removeSupplyToggles;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetEjectorSettings":
        return resetEjectorSettings;
      case "resources":
        return resources;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
  const ejectorSettings = createEjectorSettings({
    getDependency: getEjectorSettingsDependency,
    getOverride: (name) => ejectorSettingsOverrides[name],
  });
  const { buildEjectorSettings, updateEjectorSettingsContent } =
    ejectorSettings;

  const marketSettingsOverrides = {};
  function getMarketSettingsDependency(name) {
    if (Object.prototype.hasOwnProperty.call(marketSettingsOverrides, name)) {
      return marketSettingsOverrides[name];
    }
    switch (name) {
      case "$":
        return $;
      case "MarketManager":
        return MarketManager;
      case "addSettingsNumber":
        return addSettingsNumber;
      case "addSettingsToggle":
        return addSettingsToggle;
      case "addStandardHeading":
        return addStandardHeading;
      case "addTableInput":
        return addTableInput;
      case "addTableToggle":
        return addTableToggle;
      case "buildSettingsSection":
        return buildSettingsSection;
      case "buildTableLabel":
        return buildTableLabel;
      case "document":
        return document;
      case "poly":
        return poly;
      case "removeMarketToggles":
        return removeMarketToggles;
      case "resetCheckbox":
        return resetCheckbox;
      case "resetMarketSettings":
        return resetMarketSettings;
      case "resources":
        return resources;
      case "settingsRaw":
        return settingsRaw;
      case "sorterHelper":
        return sorterHelper;
      case "updateSettingsFromState":
        return updateSettingsFromState;
      default:
        return undefined;
    }
  }
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

  class Job {
    constructor(id, name, flags) {
      this._originalId = id;
      this._originalName = name;
      this._workerBinding = "civ-" + this._originalId;

      this.is = normalizeProperties(flags) ?? {};
    }

    get autoJobEnabled() {
      return settings["job_" + this._originalId];
    }
    get isSmartEnabled() {
      return settings["job_s_" + this._originalId];
    }
    get priority() {
      return settingsRaw["job_p_" + this._originalId];
    }
    getBreakpoint(n) {
      return settings[`job_b${n + 1}_${this._originalId}`];
    }

    get definition() {
      return game.global.civic[this._originalId];
    }

    get id() {
      return this.definition.job;
    }

    get name() {
      return this.definition.name;
    }

    isUnlocked() {
      return this.definition.display;
    }

    isManaged() {
      if (!this.isUnlocked()) {
        return false;
      }

      return this.autoJobEnabled;
    }

    get workers() {
      return this.definition.workers;
    }

    get servants() {
      return 0;
    }

    get count() {
      return this.workers + this.servants * traitVal("high_pop", 0, 1);
    }

    get max() {
      return this.definition.max;
    }

    breakpointEmployees(breakpoint, ignoreMax) {
      let breakpointActual = this.getBreakpoint(breakpoint);

      // -1 equals unlimited up to the maximum available jobs for this job
      if (breakpointActual === -1) {
        breakpointActual = Number.MAX_SAFE_INTEGER;
      } else if (settings.jobScalePop && this._originalId !== "hell_surveyor") {
        breakpointActual *= traitVal("high_pop", 0, 1);
      }

      // return the actual workers required for this breakpoint (either our breakpoint or our max, whichever is lower)
      return ignoreMax
        ? breakpointActual
        : Math.min(breakpointActual, this.max);
    }

    addWorkers(count) {
      if (this.isDefault()) {
        return false;
      }
      if (count < 0) {
        this.removeWorkers(-1 * count);
      }

      let vue = getVueById(this._workerBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.add();
      }
    }

    removeWorkers(count) {
      if (this.isDefault()) {
        return false;
      }
      if (count < 0) {
        this.addWorkers(-1 * count);
      }

      let vue = getVueById(this._workerBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.sub();
      }
    }

    isDefault() {
      return false;
    }
  }

  class BasicJob extends Job {
    constructor(...args) {
      super(...args);

      this._servantBinding = "servant-" + this._originalId;
    }

    get servants() {
      return game.global.race.servants?.jobs[this._originalId] ?? 0;
    }

    get max() {
      return Number.MAX_SAFE_INTEGER;
    }

    addServants(count) {
      if (count < 0) {
        this.removeServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.add();
      }
    }

    removeServants(count) {
      if (count < 0) {
        this.addServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.sub();
      }
    }

    isDefault() {
      return game.global.civic.d_job === this.id;
    }

    setAsDefault() {
      getVueById(this._workerBinding)?.setDefault(this.id);
    }
  }

  class CraftingJob extends Job {
    constructor(id, name, resource) {
      super(id, name, { serve: true });

      this._crafterBinding = "foundry";
      this._servantBinding = "skilledServants";
      this.resource = resource;
    }

    get definition() {
      return game.global.civic["craftsman"];
    }

    get id() {
      return this.resource.id;
    }

    isUnlocked() {
      return game.global.resource[this._originalId].display;
    }

    get servants() {
      return game.global.race.servants?.sjobs[this._originalId] ?? 0;
    }

    get workers() {
      return game.global.city.foundry?.[this._originalId] ?? 0;
    }

    get max() {
      return game.global.civic.craftsman.max;
    }

    addWorkers(count) {
      if (!this.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        this.removeWorkers(-1 * count);
      }

      let vue = getVueById(this._crafterBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.add(this._originalId);
      }
    }

    removeWorkers(count) {
      if (!this.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        this.addWorkers(-1 * count);
      }

      let vue = getVueById(this._crafterBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.sub(this._originalId);
      }
    }

    addServants(count) {
      if (count < 0) {
        this.removeServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.add(this._originalId);
      }
    }

    removeServants(count) {
      if (count < 0) {
        this.addServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.sub(this._originalId);
      }
    }
  }

  class Resource {
    constructor(name, id, flags) {
      this.name = name;
      this._id = id;

      this.currentQuantity = 0;
      this.maxQuantity = 0;
      this.rateOfChange = 0;
      this.rateMods = {};
      this.tradeBuyPrice = 0;
      this.tradeSellPrice = 0;
      this.tradeRoutes = 0;
      this.incomeAdusted = false;

      this.maxCost = 0;
      this.storageRequired = 1;
      this.requestedQuantity = 0;
      this.cost = {};

      this._vueBinding = "res" + id;
      this._stackVueBinding = "stack-" + id;
      this._marketVueBinding = "market-" + id;

      this.is = normalizeProperties(flags) ?? {};
    }

    get autoCraftEnabled() {
      return settings["craft" + this.id];
    }
    get craftWeighting() {
      return settings["foundry_w_" + this.id];
    }
    get craftPreserve() {
      return settings["foundry_p_" + this.id];
    }
    get autoStorageEnabled() {
      return settings["res_storage" + this.id];
    }
    get storagePriority() {
      return settingsRaw["res_storage_p_" + this.id];
    }
    get storeOverflow() {
      return settings["res_storage_o_" + this.id];
    }
    get minStorage() {
      return settings["res_min_store" + this.id];
    }
    get maxStorage() {
      return settings["res_max_store" + this.id];
    }
    get marketPriority() {
      return settingsRaw["res_buy_p_" + this.id];
    }
    get autoBuyEnabled() {
      return settings["buy" + this.id];
    }
    get autoBuyRatio() {
      return settings["res_buy_r_" + this.id];
    }
    get autoSellEnabled() {
      return settings["sell" + this.id];
    }
    get autoSellRatio() {
      return settings["res_sell_r_" + this.id];
    }
    get autoTradeBuyEnabled() {
      return settings["res_trade_buy_" + this.id];
    }
    get autoTradeSellEnabled() {
      return settings["res_trade_sell_" + this.id];
    }
    get autoTradeWeighting() {
      return settings["res_trade_w_" + this.id];
    }
    get autoTradePriority() {
      return settings["res_trade_p_" + this.id];
    }
    get galaxyMarketWeighting() {
      return settings["res_galaxy_w_" + this.id];
    }
    get galaxyMarketPriority() {
      return settings["res_galaxy_p_" + this.id];
    }

    get title() {
      return this.instance?.name || this.name;
    }

    get instance() {
      return game.global.resource[this.id];
    }

    get id() {
      return this._id;
    }

    get currentCrates() {
      return this.instance.crates;
    }

    get currentContainers() {
      return this.instance.containers;
    }

    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      let instance = this.instance;
      this.currentQuantity = instance.amount;
      this.maxQuantity =
        instance.max >= 0 ? instance.max : Number.MAX_SAFE_INTEGER;
      this.rateOfChange = instance.diff;
      this.rateMods = {};
      this.incomeAdusted = false;
    }

    finalizeData() {
      if (!this.isUnlocked() || this.constructor !== Resource) {
        // Only needed for base resources
        return;
      }

      // When routes are managed - we're excluding trade diff from operational rate of change.
      if (settings.autoMarket && this.is.tradable) {
        this.tradeRoutes = this.instance.trade;
        this.tradeBuyPrice = game.tradeBuyPrice(this._id);
        this.tradeSellPrice = game.tradeSellPrice(this._id);
        let tradeDiff = game.breakdown.p.consume[this._id]?.Trade || 0;
        if (tradeDiff > 0) {
          this.rateMods["buy"] = tradeDiff * -1;
        } else if (tradeDiff < 0) {
          this.rateMods["sell"] = tradeDiff * -1;
          this.rateOfChange += this.rateMods["sell"];
        }
      }

      // Restore decayed rate
      if (
        game.global.race["decay"] &&
        this.tradeRouteQuantity > 0 &&
        this.currentQuantity >= 50
      ) {
        this.rateMods["decay"] =
          (this.currentQuantity - 50) * (0.001 * this.tradeRouteQuantity);
        this.rateOfChange += this.rateMods["decay"];
      }
    }

    calculateRateOfChange(apply) {
      let value = this.rateOfChange;
      for (let mod in this.rateMods) {
        if (apply[mod] ?? apply.all) {
          value -= this.rateMods[mod];
        }
      }
      return value;
    }

    isDemanded() {
      return this.requestedQuantity > this.currentQuantity;
    }

    get income() {
      return this.calculateRateOfChange({ buy: false, all: true });
    }

    get spareQuantity() {
      return this.currentQuantity - this.requestedQuantity;
    }

    get spareMaxQuantity() {
      return this.maxQuantity - this.requestedQuantity;
    }

    isUnlocked() {
      return this.instance?.display ?? false;
    }

    isRoutesUnlocked() {
      return (
        this.isUnlocked() &&
        !(
          this === resources.Food &&
          (game.global.race["artifical"] || game.global.race["fasting"])
        ) &&
        ((game.global.race["banana"] && this === resources.Food) ||
          (game.global.tech["trade"] && !game.global.race["terrifying"]))
      );
    }

    isManagedStorage() {
      return this.hasStorage() && this.autoStorageEnabled;
    }

    get atomicMass() {
      return game.atomic_mass[this.id] ?? 0;
    }

    isUseful() {
      /* This check always cause issues, i'll just disable it for now
            // Spending accumulated resources
            if (settings.autoStorage && settings.storageSafeReassign && !this.storeOverflow && this.currentQuantity > this.minStorage && this.currentQuantity > this.storageRequired &&
              ((this.currentCrates > 0 && this.maxQuantity - StorageManager.crateValue > this.storageRequired) ||
               (this.currentContainers > 0 && this.maxQuantity - StorageManager.containerValue > this.storageRequired))) {
                return false;
            }
            */
      return (
        this.storageRatio < 0.99 ||
        this.isDemanded() ||
        this.rateMods["eject"] > 0 ||
        this.rateMods["supply"] > 0 ||
        (this.storeOverflow && this.currentQuantity < this.maxStorage)
      );
    }

    getProduction(source, locArg) {
      let produced = 0;
      let labelFound = false;
      for (let [label, value] of Object.entries(
        game.breakdown.p[this._id] ?? {},
      )) {
        if (value.indexOf("%") === -1) {
          if (labelFound) {
            break;
          } else if (label === poly.loc(source, locArg)) {
            labelFound = true;
            produced += parseFloat(value) || 0;
          }
        } else if (labelFound && this.isValidProductionLabel(label)) {
          produced *= 1 + (parseFloat(value) || 0) / 100;
        }
      }
      return produced * state.globalProductionModifier;
    }

    isValidProductionLabel(label) {
      // Bug as of 1.3.11a: Space Syndicate is already applied to the displayed base value
      // The calculations are correct though
      // This can cause constant Iron flicker in Truepath because the script thinks
      // a worker is producing more than the constant smelter consumption.
      if (this._id === "Iron" && label === `ᄂ${poly.loc("space_syndicate")}`)
        return false;

      // Everything else is valid (at least for now)
      return true;
    }

    getBusyWorkers(workersSource, workersCount, locArg) {
      if (this.incomeAdusted) {
        // Don't reduce workers of same resource more than once per tick to avoid flickering
        return workersCount;
      }

      let newWorkers = 0;
      if (workersCount > 0) {
        let totalIncome = this.getProduction(workersSource, locArg);
        let resPerWorker = totalIncome / workersCount;
        let usedIncome = totalIncome - this.income;
        if (usedIncome > 0) {
          newWorkers = Math.ceil(usedIncome / resPerWorker);
        }
      } else if (this.income < 0) {
        newWorkers = 1;
      }

      return newWorkers;
    }

    isCraftable() {
      return game.craftCost.hasOwnProperty(this.id);
    }

    hasStorage() {
      return this.instance?.stackable ?? false;
    }

    get tradeRouteQuantity() {
      return game.tradeRatio[this.id] || -1;
    }

    get storageRatio() {
      return this.maxQuantity > 0 ? this.currentQuantity / this.maxQuantity : 1;
    }

    isCapped() {
      return this.maxQuantity > 0
        ? this.currentQuantity + this.rateOfChange / ticksPerSecond() >=
            this.maxQuantity
        : true;
    }

    get usefulRatio() {
      return this.maxQuantity > 0 && this.storageRequired > 0
        ? this.currentQuantity /
            Math.min(this.maxQuantity, this.storageRequired)
        : 1;
    }

    get timeToFull() {
      if (this.storageRatio > 0.98) {
        return Number.MIN_SAFE_INTEGER; // Already full.
      }
      let totalRateOfCharge = this.income;
      if (totalRateOfCharge <= 0) {
        return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
      }
      return (this.maxQuantity - this.currentQuantity) / totalRateOfCharge;
    }

    get timeToRequired() {
      if (this.storageRatio > 0.98) {
        return Number.MIN_SAFE_INTEGER; // Already full.
      }
      if (this.storageRequired <= 1) {
        return 0;
      }
      let totalRateOfCharge = this.income;
      if (totalRateOfCharge <= 0) {
        return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
      }
      return (
        (Math.min(this.maxQuantity, this.storageRequired) -
          this.currentQuantity) /
        totalRateOfCharge
      );
    }

    tryCraftX(count) {
      let vue = getVueById(this._vueBinding);
      if (vue === undefined) {
        return false;
      }

      KeyManager.set(false, false, false);
      vue.craft(this.id, count);
    }

    requestQuantity(req) {
      if (this.requestedQuantity < req) {
        // We can't request more than our storage.
        // TODO: Resources with consumption can usually never be max due to game processing order
        // and should have their request quantity limit a little lower than max.
        req = Math.min(req, this.maxQuantity);
        this.requestedQuantity = req;
      }
    }
  }

  class SoulGem extends Resource {
    updateData() {
      super.updateData();
      this.rateOfChange = state.soulGemPerHour / 3600;
    }
  }

  class Troops extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = WarManager.currentCityGarrison;
      this.maxQuantity = WarManager.maxCityGarrison;
      this.rateOfChange = 0;
    }

    isUnlocked() {
      return WarManager._garrisonVue !== undefined;
    }
  }

  class Supply extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = game.global.portal.purifier.supply;
      this.maxQuantity = game.global.portal.purifier.sup_max;
      this.rateOfChange = game.global.portal.purifier.diff;
    }

    isUnlocked() {
      return game.global.portal.hasOwnProperty("purifier");
    }
  }

  class Power extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = game.global.city.power;
      if (haveTask("replicate")) {
        this.currentQuantity += game.global.race.replicator.pow;
      }
      this.rateOfChange = this.currentQuantity;

      this.maxQuantity = 0;
      if (game.global.race.powered) {
        this.maxQuantity +=
          (resources.Population.maxQuantity -
            resources.Population.currentQuantity) *
          traitVal("powered", 0);
      }
      for (let building of Object.values(buildings)) {
        if (building.stateOffCount > 0) {
          let missingAmount = building.stateOffCount;
          if (
            building.autoMax < building.count &&
            settings.masterScriptToggle &&
            settings.autoPower &&
            building.autoStateEnabled &&
            settings.buildingsLimitPowered
          ) {
            missingAmount -= building.count - building.autoMax;
          }

          if (building === buildings.NeutronCitadel) {
            this.maxQuantity +=
              getCitadelConsumption(building.stateOnCount + missingAmount) -
              getCitadelConsumption(building.stateOnCount);
          } else {
            this.maxQuantity += missingAmount * building.powered;
          }
        }
      }
    }

    get usefulRatio() {
      // Could be useful for satisfied check in override
      return this.currentQuantity >= this.maxQuantity ? 1 : 0;
    }

    isUnlocked() {
      return game.global.city.powered;
    }
  }

  class Support extends Resource {
    // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
    constructor(name, id, region, inRegionId) {
      super(name, id);

      this._region = region;
      this._inRegionId = inRegionId;
    }

    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity = game.global[this._region][this.supportId].s_max;
      this.currentQuantity = game.global[this._region][this.supportId].support;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }

    get supportId() {
      return game.actions[this._region][this._inRegionId].info.support;
    }

    get storageRatio() {
      return this.maxQuantity > 0
        ? (this.maxQuantity - this.currentQuantity) / this.maxQuantity
        : 1;
    }

    isUnlocked() {
      return game.global[this._region][this.supportId] !== undefined;
    }
  }

  class BeltSupport extends Support {
    // Unlike other supports this one takes in account available workers
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      let maxStations =
        settings.autoPower && buildings.BeltSpaceStation.autoStateEnabled
          ? buildings.BeltSpaceStation.count
          : buildings.BeltSpaceStation.stateOnCount;
      let maxWorkers =
        settings.autoJobs &&
        jobs.SpaceMiner.autoJobEnabled &&
        jobs.SpaceMiner.isSmartEnabled
          ? state.maxSpaceMiners
          : jobs.SpaceMiner.count;
      this.maxQuantity = Math.min(
        maxStations * 3 * traitVal("high_pop", 0, 1),
        maxWorkers,
      );
      this.currentQuantity = game.global[this._region][this.supportId].support;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }
  }

  class ElectrolysisSupport extends Support {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity = buildings.TitanElectrolysis.stateOnCount;
      this.currentQuantity = buildings.TitanHydrogen.stateOnCount;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }

    isUnlocked() {
      return game.global.race["truepath"] ? true : false;
    }
  }

  class WomlingsSupport extends Support {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity =
        buildings.TauRedWomlingVillage.stateOnCount *
        (haveTech("womling_pop", 2) ? 6 : 5);
      this.currentQuantity =
        buildings.TauRedWomlingFarm.stateOnCount * 2 +
        buildings.TauRedWomlingLab.stateOnCount +
        buildings.TauRedWomlingMine.stateOnCount * 6;
      this.rateOfChange = this.maxQuantity - this.currentQuantity; // - game.global.tauceti.overseer.injured
    }

    isUnlocked() {
      return haveTech("tau_red", 5) ? true : false;
    }
  }

  class PrestigeResource extends Resource {
    updateData() {
      this.currentQuantity = game.global.prestige[this.id].count;
      this.maxQuantity = Number.MAX_SAFE_INTEGER;
    }

    isUnlocked() {
      return true;
    }
  }

  class Population extends Resource {
    get id() {
      // The population node is special and its id will change to the race name
      return game.global.race.species;
    }
  }

  class Morale extends Resource {
    updateData() {
      this.currentQuantity = game.global.city.morale.current;
      this.maxQuantity = game.global.city.morale.cap;
      this.rateOfChange = game.global.city.morale.potential;
      this.incomeAdusted = false;
    }

    isUnlocked() {
      return true;
    }
  }

  class Thrall extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = 0;
      this.rateOfChange = 0;
      for (let i = 0; i < game.global.city.surfaceDwellers.length; i++) {
        this.currentQuantity += game.global.city.captive_housing[`race${i}`];
        this.rateOfChange += game.global.city.captive_housing[`jailrace${i}`];
      }
      this.currentQuantity += this.rateOfChange;
      this.maxQuantity = game.global.city.captive_housing.raceCap;
    }

    isUnlocked() {
      return game.global.city.captive_housing ? true : false;
    }
  }

  class ResourceProductionCost {
    constructor(resource, quantity, minRateOfChange) {
      this.resource = resource;
      this.quantity = quantity;
      this.minRateOfChange = minRateOfChange;
    }
  }

  class Action {
    constructor(name, tab, id, location, flags) {
      this.name = name;
      this._tab = tab;
      this._id = id;
      this._location = location;
      this.gameMax = Number.MAX_SAFE_INTEGER;
      this._vueBinding = this._tab + "-" + this.id;
      this.weighting = 0;
      this.extraDescription = "";
      this.consumption = [];
      this.cost = {};
      this.overridePowered = undefined;

      this.is = normalizeProperties(flags) ?? {};
    }

    get autoBuildEnabled() {
      return settings["bat" + this._vueBinding];
    }
    get autoStateEnabled() {
      return settings["bld_s_" + this._vueBinding];
    }
    get autoStateSmart() {
      return settings["bld_s2_" + this._vueBinding];
    }
    get priority() {
      return settingsRaw["bld_p_" + this._vueBinding];
    }
    get _weighting() {
      return settings["bld_w_" + this._vueBinding];
    }
    get _autoMax() {
      return settings["bld_m_" + this._vueBinding];
    }

    get definition() {
      if (this._location !== "") {
        return game.actions[this._tab][this._location][this._id];
      } else {
        return game.actions[this._tab][this._id];
      }
    }

    get instance() {
      return game.global[this._tab][this._id];
    }

    get id() {
      return this._id;
    }

    get title() {
      let def = this.definition;
      return def
        ? typeof def.title === "function"
          ? def.title()
          : def.title
        : this.name;
    }

    get desc() {
      let def = this.definition;
      return def
        ? typeof def.desc === "function"
          ? def.desc()
          : def.desc
        : this.name;
    }

    get vue() {
      return getVueById(this._vueBinding);
    }

    /* That's a right(ish) way to do, but compared to hardcoded numbers it's a performance tax for... nothing really, as i'll still need to manually declare a lot of things for each new building, and it's already declared for all existing ones. I'll put it on hold for now.
        get gameMax() {
            // queue_complete need an initialized instance to read a current count
            return this.instance && this.definition.queue_complete ? this.instance.count + this.definition.queue_complete() : Number.MAX_SAFE_INTEGER;
        }*/

    get autoMax() {
      // There is a game max. eg. world collider can only be built 1859 times
      return this._autoMax >= 0 && this._autoMax <= this.gameMax
        ? this._autoMax
        : this.gameMax;
    }

    isUnlocked() {
      if (
        (this._tab === "city" && !game.global.settings.showCity) ||
        (this._tab === "space" &&
          !game.global.settings.showSpace &&
          !game.global.settings.showOuter) ||
        (this._tab === "interstellar" && !game.global.settings.showDeep) ||
        (this._tab === "portal" && !game.global.settings.showPortal) ||
        (this._tab === "galaxy" && !game.global.settings.showGalactic) ||
        (this._tab === "tauceti" && !game.global.settings.showTau) ||
        (this._tab === "eden" && !game.global.settings.showEden)
      ) {
        return false;
      }
      return this.vue !== undefined;
    }

    isSwitchable() {
      return (
        this.definition.hasOwnProperty("powered") ||
        this.definition.hasOwnProperty("switchable")
      );
    }

    isMission() {
      return this.definition.hasOwnProperty("grant");
    }

    isComplete() {
      return haveTech(this.definition.grant[0], this.definition.grant[1]);
    }

    isSmartManaged() {
      return (
        settings.autoPower &&
        this.isUnlocked() &&
        this.autoStateEnabled &&
        this.autoStateSmart
      );
    }

    isAutoBuildable() {
      return (
        this.isUnlocked() &&
        this.autoBuildEnabled &&
        this._weighting > 0 &&
        this.count < this.autoMax
      );
    }

    // export function checkPowerRequirements(c_action) from actions.js
    checkPowerRequirements() {
      for (let [tech, value] of Object.entries(
        this.definition.power_reqs ?? {},
      )) {
        if (!haveTech(tech, value)) {
          return false;
        }
      }
      return true;
    }

    get powered() {
      if (this.overridePowered !== undefined) {
        return this.overridePowered;
      }

      if (
        !this.definition.hasOwnProperty("powered") ||
        !this.checkPowerRequirements()
      ) {
        return 0;
      }

      return this.definition.powered();
    }

    updateResourceRequirements() {
      if (!this.isUnlocked()) {
        return;
      }

      this.cost = {};
      if (!this.definition.cost) {
        return;
      }

      let adjustedCosts = poly.adjustCosts(this.definition);
      for (let resourceName in adjustedCosts) {
        if (resources[resourceName]) {
          let resourceAmount = Number(adjustedCosts[resourceName]());
          if (resourceAmount > 0) {
            this.cost[resourceName] = resourceAmount;
          }
        }
      }
    }

    isAffordable(max = false) {
      return game.checkAffordable(this.definition, max);
    }

    // Whether the action is clickable is determined by whether it is unlocked, affordable and not a "permanently clickable" action
    isClickable() {
      return (
        this.isUnlocked() && this.isAffordable() && this.count < this.gameMax
      );
    }

    // This is a "safe" click. It will only click if the container is currently clickable.
    // ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
    click() {
      if (!this.isClickable()) {
        return false;
      }

      let doMultiClick =
        this.is.multiSegmented && settings.buildingsUseMultiClick;
      let amountToBuild = 1;
      if (doMultiClick) {
        amountToBuild = this.gameMax - this.count;
        for (let res in this.cost) {
          amountToBuild = Math.min(
            amountToBuild,
            Math.floor(resources[res].currentQuantity / this.cost[res]),
          );
        }
        if (amountToBuild < 1) {
          // Game allow to spend more resources than available, going negative. If we're here - building is clickable, and we can afford at least one thing for sure.
          amountToBuild = 1;
        }
      }

      for (let res in this.cost) {
        resources[res].currentQuantity -= this.cost[res] * amountToBuild;
      }

      // Don't log evolution actions and gathering actions
      if (
        game.global.race.species !== "protoplasm" &&
        !logIgnore.includes(this.id)
      ) {
        if (
          this.gameMax < Number.MAX_SAFE_INTEGER &&
          this.count + amountToBuild < this.gameMax
        ) {
          GameLog.logSuccess(
            "multi_construction",
            poly.loc("build_success", [
              `${this.title} (${this.count + amountToBuild})`,
            ]),
            ["queue", "building_queue"],
          );
        } else {
          GameLog.logSuccess(
            "construction",
            poly.loc("build_success", [this.title]),
            ["queue", "building_queue"],
          );
        }
      }

      KeyManager.set(doMultiClick, doMultiClick, doMultiClick);

      if (this.is.prestige) {
        logPrestige();
      }

      let popper = $("#popper");

      // Try skipping game's laggy postBuild hook by invoking the action() directly, instead of going through the
      // vue action() => game runAction() => game shed.action() => game postBuild() hook.
      // This will greatly reduce the amount of page redraws.
      // refresh is really only needed for first building as there are no buildings where building a second unlocks more stuff.
      // Keep this narrowly guarded: postBuild also handles grants, post hooks, queues, poppers, and Inflation.
      if (
        settings.performanceHackAvoidDrawTech &&
        this.definition.refresh &&
        this.count > 0 &&
        !this.definition.grant &&
        !this.definition.post &&
        !this.definition.queue_complete &&
        !this.is.prestige &&
        !game.global.race.inflation &&
        (popper.length === 0 || !popper.is(":visible"))
      ) {
        this.definition.action();
        return true;
      }

      // Hide active popper from action, so it won't rewrite it
      if (
        popper.length > 0 &&
        popper.data("id").indexOf(this._vueBinding) === -1
      ) {
        popper.attr("id", "TotallyNotAPopper");

        // Game bugs in .action() can cause an error to be thrown. We can't really handle it in any good way,
        // but we need to revert the id or a tooltip might get stuck at the bottom of the page.
        try {
          this.vue.action();
        } finally {
          popper.attr("id", "popper");
        }
      } else {
        this.vue.action();
      }

      if (this.is.prestige) {
        state.goal = "GameOverMan";
      }

      return true;
    }

    addSupport(resource) {
      this.consumption.push(
        normalizeProperties({
          resource: resource,
          rate: () => this.definition.support() * -1,
        }),
      );
    }

    addResourceConsumption(resource, rate) {
      // TODO: Load fuel from definition, same as for support
      this.consumption.push(
        normalizeProperties({ resource: resource, rate: rate }),
      );
    }

    getFuelRate(idx) {
      if (!this.consumption[idx]) {
        return 0;
      }

      let resource = this.consumption[idx].resource;
      let rate = this.consumption[idx].rate;
      if (
        this._tab === "space" &&
        (resource === resources.Oil || resource === resources.Helium_3)
      ) {
        rate = game.fuel_adjust(rate, true);
      } else if (
        (this._tab === "interstellar" ||
          this._tab === "galaxy" ||
          this._tab === "tauceti") &&
        (resource === resources.Deuterium || resource === resources.Helium_3) &&
        this !== buildings.AlphaFusion
      ) {
        rate = game.int_fuel_adjust(rate);
      }
      return rate;
    }

    getMissingConsumption() {
      for (let j = 0; j < this.consumption.length; j++) {
        let resource = this.consumption[j].resource;
        if (resource instanceof Support) {
          continue;
        }

        // Food fluctuate a lot, ignore it, assuming we always can get more
        if (
          resource === resources.Food &&
          settings.autoJobs &&
          (jobs.Farmer.autoJobEnabled || jobs.Hunter.autoJobEnabled)
        ) {
          continue;
        }

        // Now let's actually check it, bought resources excluded from rateOfChange, to prevent losing resources after switching routes
        let consumptionRate = this.getFuelRate(j);
        if (
          resource.storageRatio < 0.95 &&
          consumptionRate > 0 &&
          resource.calculateRateOfChange({ buy: true }) < consumptionRate
        ) {
          return resource;
        }
      }
      return null;
    }

    getMissingSupport() {
      // In fasting we need to build mining droid first to unlock habitats
      if (
        game.global.race["fasting"] &&
        this === buildings.AlphaMiningDroid &&
        this.count < 1
      ) {
        return null;
      }

      for (let j = 0; j < this.consumption.length; j++) {
        let resource = this.consumption[j].resource;

        // We're going to build Spire things with no support, to enable them later
        if (resource === resources.Spire_Support && this.autoStateSmart) {
          continue;
        }
        // Tau Belt support can be overused
        if (resource === resources.Tau_Belt_Support) {
          continue;
        }
        // Womlings facilities can run understaffed
        if (
          resource === resources.Womlings_Support &&
          resource.rateOfChange > 0
        ) {
          continue;
        }

        let rate = this.consumption[j].rate;
        if (!(resource instanceof Support) || rate <= 0) {
          continue;
        }

        // We don't have spare support for this
        if (resource.rateOfChange < rate) {
          return resource;
        }
      }
      return null;
    }

    getUselessSupport() {
      // Starbase and Habitats are exceptions, they're always useful
      if (
        this === buildings.GatewayStarbase ||
        this === buildings.AlphaHabitat ||
        (this === buildings.SpaceNavBeacon && game.global.race["orbit_decayed"])
      ) {
        return null;
      }

      let uselessSupports = [];
      for (let j = 0; j < this.consumption.length; j++) {
        let resource = this.consumption[j].resource;
        let rate = this.consumption[j].rate;
        if (!(resource instanceof Support) || rate >= 0) {
          continue;
        }
        let minSupport =
          resource === resources.Belt_Support
            ? 2 * traitVal("high_pop", 0, 1)
            : resource === resources.Gateway_Support
              ? 5
              : resource === resources.Womlings_Support
                ? 6
                : 1;

        if (resource.rateOfChange >= minSupport) {
          uselessSupports.push(resource);
        } else {
          // If we have something useful - stop here, we care only about buildings with all supports useless
          return null;
        }
      }
      return uselessSupports[0] ?? null;
    }

    get count() {
      if (this.isMission()) {
        return this.isComplete() ? 1 : 0;
      }

      if (!this.isUnlocked()) {
        return 0;
      }

      if (this === buildings.Banquet) {
        // Banquet hall uses "level" as build count if >= 1
        return this.instance?.count ? this.instance.level : 0;
      }

      return this.instance?.count ?? 0;
    }

    hasState() {
      if (!this.isUnlocked()) {
        return false;
      }

      return (
        (this.definition.powered &&
          haveTech("high_tech", 2) &&
          this.checkPowerRequirements()) ||
        this.definition.switchable?.() ||
        false
      );
    }

    get stateOnCount() {
      if (!this.hasState() || this.count < 1) {
        return 0;
      }

      return this.instance.on;
    }

    get stateOffCount() {
      if (!this.hasState() || this.count < 1) {
        return 0;
      }

      return this.instance.count - this.instance.on;
    }

    tryAdjustState(adjustCount) {
      if (adjustCount === 0 || !this.hasState()) {
        return false;
      }

      let vue = this.vue;

      if (adjustCount > 0) {
        for (let m of KeyManager.click(adjustCount)) {
          vue.power_on();
        }
        return true;
      }
      if (adjustCount < 0) {
        for (let m of KeyManager.click(adjustCount * -1)) {
          vue.power_off();
        }
        return true;
      }
    }
  }

  class CityAction extends Action {
    get instance() {
      return game.global.city[this._id];
    }
  }

  class Pillar extends Action {
    get count() {
      return this.isUnlocked() ? this.definition.count() : 0;
    }

    get stateOnCount() {
      return this.isUnlocked() ? this.definition.on() : 0;
    }

    isAffordable(max = false) {
      if (
        game.global.tech.pillars !== 1 ||
        game.global.race.universe === "micro"
      ) {
        return false;
      }
      return game.checkAffordable(this.definition, max);
    }
  }

  class ResourceAction extends Action {
    constructor(name, tab, id, location, res, flags) {
      super(name, tab, id, location, flags);

      this.resource = resources[res];
    }

    get count() {
      return this.resource.currentQuantity;
    }
  }

  class EvolutionAction extends Action {
    constructor(id) {
      super("", "evolution", id, "");
    }

    isUnlocked() {
      let node = document.getElementById(this._vueBinding);
      return node !== null && !node.classList.contains("is-hidden");
    }
  }

  class SpaceDock extends Action {
    isOptionsCached() {
      if (this.count < 1 || game.global.tech["genesis"] < 4) {
        // It doesn't have options yet so I guess all "none" of them are cached!
        // Also return true if we don't have the required tech level yet
        return true;
      }

      // If our tech is unlocked but we haven't cached the vue the the options aren't cached
      if (
        !buildings.GasSpaceDockProbe.isOptionsCached() ||
        (game.global.tech["genesis"] >= 5 &&
          !buildings.GasSpaceDockShipSegment.isOptionsCached()) ||
        (game.global.tech["genesis"] === 6 &&
          !buildings.GasSpaceDockPrepForLaunch.isOptionsCached()) ||
        (game.global.tech["genesis"] >= 7 &&
          !buildings.GasSpaceDockLaunch.isOptionsCached()) ||
        (game.global.tech["geck"] >= 1 &&
          !buildings.GasSpaceDockGECK.isOptionsCached())
      ) {
        return false;
      }

      return true;
    }

    cacheOptions() {
      if (this.count < 1 || WindowManager.isOpen()) {
        return false;
      }

      let optionsNode = document.querySelector("#space-star_dock .special");
      WindowManager.openModalWindowWithCallback(optionsNode, this.title, () => {
        buildings.GasSpaceDockProbe.cacheOptions();
        buildings.GasSpaceDockGECK.cacheOptions();
        buildings.GasSpaceDockShipSegment.cacheOptions();
        buildings.GasSpaceDockPrepForLaunch.cacheOptions();
        buildings.GasSpaceDockLaunch.cacheOptions();
      });
      return true;
    }
  }

  class ModalAction extends Action {
    constructor(...args) {
      super(...args);

      this._vue = undefined;
    }

    get vue() {
      return this._vue;
    }

    isOptionsCached() {
      return this._vue !== undefined;
    }

    cacheOptions() {
      this._vue = getVueById(this._vueBinding);
    }

    isUnlocked() {
      // All ModalActions belongs to starDock tab
      if (!game.global.settings.showSpace) {
        return false;
      }
      // We have to override this as there won't be an element unless the modal window is open
      return this._vue !== undefined;
    }
  }

  class Project extends Action {
    constructor(name, id) {
      super(name, "arpa", id, "");
      this._vueBinding = "arpa" + this.id;
      this.currentStep = 1;
    }

    get autoBuildEnabled() {
      return settings["arpa_" + this._id];
    }
    get priority() {
      return settingsRaw["arpa_p_" + this._id];
    }
    get _autoMax() {
      return settings["arpa_m_" + this._id];
    }
    get _weighting() {
      return settings["arpa_w_" + this._id];
    }

    updateResourceRequirements() {
      if (!this.isUnlocked()) {
        return;
      }

      this.cost = {};
      let maxStep = Math.min(
        100 - this.progress,
        state.triggerTargets.includes(this) ? 100 : settings.arpaStep,
      );

      let adjustedCosts = poly.arpaAdjustCosts(this.definition.cost);
      for (let resourceName in adjustedCosts) {
        if (resources[resourceName]) {
          let resourceAmount = Number(adjustedCosts[resourceName]());
          if (resourceAmount > 0) {
            this.cost[resourceName] = resourceAmount / 100;
            maxStep = Math.min(
              maxStep,
              resources[resourceName].maxQuantity / this.cost[resourceName],
            );
          }
        }
      }

      this.currentStep = Math.max(Math.floor(maxStep), 1);
      if (this.currentStep > 1) {
        for (let res in this.cost) {
          this.cost[res] *= this.currentStep;
        }
      }
    }

    // Override Action's version, because these have a 'grant' but aren't missions.
    isMission() {
      return this.gameMax === 1;
    }

    get count() {
      return this.instance?.rank ?? 0;
    }

    get progress() {
      return this.instance?.complete ?? 0;
    }

    isAffordable(max = false) {
      // Game's .checkAffordable doesn't work correctly on projects
      return checkAffordableCustom(this.cost, max);
    }

    isClickable() {
      return this.isUnlocked() && this.isAffordable(false);
    }

    click() {
      if (!this.isClickable()) {
        return false;
      }

      for (let res in this.cost) {
        resources[res].currentQuantity -= this.cost[res];
      }

      if (this.progress + this.currentStep < 100) {
        GameLog.logSuccess(
          "arpa",
          poly.loc("build_success", [
            `${this.title} (${this.progress + this.currentStep}%)`,
          ]),
          ["queue", "building_queue"],
        );
      } else {
        GameLog.logSuccess(
          "construction",
          poly.loc("build_success", [this.title]),
          ["queue", "building_queue"],
        );
        if (this.id === "syphon" && this.count == 79) {
          logPrestige();
        }
      }

      KeyManager.set(false, false, false);
      // This is a really bad lag hack. ARPAs make a very expensive drawTech() call on every build.
      // After 10 ARPAs, this will never actually accomplish anything; AFAIK nothing needs more than 10 ARPAs.
      // Luckily, drawTech() doesn't draw anything if preload tab content is off and we're not on research.
      // So if we can, we briefly hack that off while buying an ARPA that won't change anything.
      if (
        settings.performanceHackAvoidDrawTech &&
        this.count >= 10 &&
        !(this.id === "syphon" && this.count >= 79)
      ) {
        let mainVue = win.$("#mainColumn > div:first-child")[0]?.__vue__;
        if (mainVue) {
          let oldTabLoad = mainVue.s.tabLoad;
          try {
            mainVue.s.tabLoad = false;
            getVueById(this._vueBinding).build(this.id, this.currentStep);
          } finally {
            mainVue.s.tabLoad = oldTabLoad;
          }
        } else {
          getVueById(this._vueBinding).build(this.id, this.currentStep);
        }

        return true;
      }
      getVueById(this._vueBinding).build(this.id, this.currentStep);
      return true;
    }
  }

  class Technology {
    // These techs have the same name as some others - use a descriptor for disambiguation
    static techDiscriminators = {
      wind_plant: "Power",
      demonic_craftsman: "Evil",
      evil_planning: "Evil",
      adamantite_processing_flier: "Flier",
      alt_anthropology: "Post-Transcendence",
      alt_fanaticism: "Post-Transcendence",
      study_alt: "Post-Preeminence",
      deify_alt: "Post-Preeminence",
      dyson_sphere: "Plans",
      unification: "Plans",
      exotic_infusion: "1st Warning",
      infusion_check: "2nd Warning",
      protocol66: "Warning",
      bac_tanks_tp: "True Path",
      ai_core_tp: "True Path",
      terraforming_tp: "True Path",
      higgs_boson_tp: "True Path",
      stanene_tp: "True Path",
      graphene_tp: "True Path",
      virtual_reality_tp: "True Path",
      adamantite_vault_tp: "True Path",
      iridium_smelting: "True Path",
      bolognium_crates_tp: "True Path",
      adamantite_containers_tp: "True Path",
      orichalcum_panels_tp: "True Path",
      dreadnought_ship: "True Path",
      fusion_generator: "True Path",
      replicator: "Lone Survivor",
    };

    constructor(id) {
      this._id = id;

      this._vueBinding = "tech-" + id;

      this.cost = {};
    }

    get id() {
      return this._id;
    }

    isUnlocked() {
      // vue of researched techs still can be found in #oldTech
      return (
        document.querySelector(
          "#" + this._vueBinding + " > .button:not(.precog)",
        ) !== null && getVueById(this._vueBinding) !== undefined
      );
    }

    get definition() {
      return game.actions.tech[this._id];
    }

    get title() {
      let def = this.definition;
      let title = typeof def.title === "function" ? def.title() : def.title;
      if (this._id in Technology.techDiscriminators) {
        title += ` (${Technology.techDiscriminators[this._id]})`;
      }
      return title;
    }

    get name() {
      return this.title;
    }

    isAffordable(max = false) {
      return game.checkAffordable(this.definition, max);
    }

    // Whether the action is clickable is determined by whether it is unlocked, affordable and not a "permanently clickable" action
    isClickable() {
      return this.isUnlocked() && this.isAffordable();
    }

    // This is a "safe" click. It will only click if the container is currently clickable.
    // ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
    click() {
      if (!this.isClickable()) {
        return false;
      }

      for (let res in this.cost) {
        resources[res].currentQuantity -= this.cost[res];
      }

      getVueById(this._vueBinding).action();

      let def = this.definition;
      let title = typeof def.title === "function" ? def.title() : def.title;
      GameLog.logSuccess("research", poly.loc("research_success", [title]), [
        "queue",
        "research_queue",
      ]);
      return true;
    }

    isResearched() {
      return document.querySelector("#tech-" + this.id + " .oldTech") !== null;
    }

    updateResourceRequirements() {
      if (!this.isUnlocked()) {
        return;
      }

      this.cost = {};
      if (!this.definition.cost) {
        return;
      }

      let adjustedCosts = poly.adjustCosts(this.definition);
      for (let resourceName in adjustedCosts) {
        if (resources[resourceName]) {
          let resourceAmount = Number(adjustedCosts[resourceName]());
          if (resourceAmount > 0) {
            this.cost[resourceName] = resourceAmount;
          }
        }
      }
    }
  }

  class Race {
    constructor(id) {
      this.id = id;
      this.evolutionTree = {};
    }

    get name() {
      return game.races[this.id].name ?? `Custom (${this.id} slot)`;
    }

    get desc() {
      let nameRef = game.races[this.id].desc;
      return typeof nameRef === "function"
        ? nameRef()
        : typeof nameRef === "string"
          ? nameRef
          : "Custom"; // Nonexistent custom
    }

    get genus() {
      return game.races[this.id].type;
    }

    getWeighting(verbose) {
      // Locked races always have zero weighting
      let habitability = this.getHabitability();
      if (habitability < (settings.evolutionAutoUnbound ? 0.8 : 1)) {
        return -1;
      }

      // Races not allowed to execute MAD, invalid targets for MAD auto achievements even if there is nothing else to do
      const noMADRace = ["sludge", "ultra_sludge", "hellspawn"];
      // Races that can't meaningfully contribute to genus pillar for Enlightenment, due to not-saved user chosen genus or otherwise
      // (they do, however, have a per-race pillar!)
      const noPillarRace = [
        "custom",
        "junker",
        "sludge",
        "ultra_sludge",
        "hybrid",
        "hellspawn",
      ];
      // Genera that don't have a greatness achievement, and so should never get a weighting boost from missing greatness achievement
      const noGreatnessGenus = ["hybrid"];
      // Races that can't execute any greatness reset, and so should never be used for greatness automation
      const noGreatnessRace = ["hellspawn"];
      // Races that don't have an extinction achievement, invalid target for any extinction autoachievement
      const noExtinctionRace = ["hellspawn"];
      // Challenges races get a huge penalty applied as they shouldn't be done automatically, unless there is nothing else to do
      const challengeRace = ["junker", "sludge", "ultra_sludge", "hellspawn"];

      // List of resets that grant greatness
      const greatnessReset = [
        "bioseed",
        "ascension",
        "terraform",
        "matrix",
        "retire",
        "eden",
        "apotheosis",
      ];

      // Subjectively chosen race lists that are known to perform well, slightly preferring them when multiple valid options are available for the same achievement
      // "Mid" resets, "high" will likely also grant an Enlightenment tick
      const midTierReset = [
        "bioseed",
        "cataclysm",
        "whitehole",
        "vacuum",
        "terraform",
      ];
      const highTierReset = ["ascension", "demonic", "apotheosis"];
      const bestForMid = [
        "human",
        "cath",
        "capybara",
        "gnome",
        "cyclops",
        "gecko",
        "dracnid",
        "entish",
        "shroomi",
        "antid",
        "sharkin",
        "dryad",
        "salamander",
        "yeti",
        "kamel",
        "imp",
        "unicorn",
        "synth",
        "shoggoth",
      ];
      const bestForHigh = [
        "human",
        "cath",
        "capybara",
        "gnome",
        "cyclops",
        "gecko",
        "dracnid",
        "entish",
        "shroomi",
        "scorpid",
        "sharkin",
        "dryad",
        "salamander",
        "wendigo",
        "kamel",
        "balorg",
        "unicorn",
        "nano",
        "ghast",
      ];

      // Imitates to prioritize if farming TP3
      const goodImitates = [
        "wyvern",
        "dwarf",
        "dracnid",
        "octigoran",
        "unicorn",
        "salamander",
        "cyclops",
        "kamel",
        "arraak",
        "troll",
        "custom",
      ];
      // Races who cannot enter TP or cannot unlock imitate even if they can, due to either challenge conflicts or special case in rewards
      const noImitates = ["junker", "nano", "synth", "hellspawn"];

      let goals = [];
      let weighting = 0;
      let starLevel = getStarLevel(settings);
      const checkAchievement = (baseWeight, id) => {
        let improve = starLevel - getAchievementStar(id);
        if (improve > 0) {
          weighting += baseWeight * improve;
          goals.push(`achieve_${id}_name`);
          if (
            game.global.race.universe !== "micro" &&
            game.global.race.universe !== "standard"
          ) {
            weighting +=
              baseWeight *
              Math.max(0, starLevel - getAchievementStar(id, "standard"));
          }
        }
      };

      // Check pillar
      if (
        ((settings.prestigeType === "ascension" &&
          settings.prestigeAscensionPillar) ||
          ["demonic", "apotheosis"].includes(settings.prestigeType)) &&
        game.global.race.universe !== "micro"
      ) {
        let speciesPillarLevel = game.global.pillars[this.id] ?? 0;
        let canPillar =
          !speciesPillarLevel && resources.Harmony.currentQuantity >= 1;
        let canUpgrade = speciesPillarLevel && speciesPillarLevel < starLevel;
        if (canPillar || canUpgrade) {
          weighting += 1000 * Math.max(0, starLevel - speciesPillarLevel);
          // Strongly prioritize pillaring new non-challenge species to upgrading old ones or Equilibrium
          if (!speciesPillarLevel && !challengeRace.includes(this.id))
            weighting += 100000;

          goals.push("feat_equilibrium_name");
          // Check genus pillar for Enlightenment
          if (!noPillarRace.includes(this.id)) {
            let genusPillar = Math.max(
              ...Object.values(races)
                .filter(
                  (r) => r.genus === this.genus && !noPillarRace.includes(r.id),
                )
                .map((r) => game.global.pillars[r.id] ?? 0),
            );
            let improve = starLevel - genusPillar;
            if (improve > 0) {
              weighting += 10000 * improve;
              goals.push("achieve_enlightenment_name");
            }
          }
        }
      }

      // Check imitate unlock
      if (settings.prestigeType === "apocalypse") {
        let imitateUnlocked = game.global.stats?.synth?.[this.id] ?? false;
        if (!noImitates.includes(this.id) && !imitateUnlocked) {
          weighting += 10000;
          goals.push("feat_planned_obsolescence_name");
          if (goodImitates.includes(this.id)) {
            weighting +=
              (goodImitates.length - 1 - goodImitates.indexOf(this.id)) * 5000;
          }
        }
      }

      // Check greatness\extinction achievement
      if (greatnessReset.includes(settings.prestigeType)) {
        if (
          !noGreatnessGenus.includes(this.genus) &&
          !noGreatnessRace.includes(this.id)
        ) {
          checkAchievement(100, "genus_" + this.genus);
        }
      } else if (
        !noExtinctionRace.includes(this.id) &&
        (!noMADRace.includes(this.id) || settings.prestigeType !== "mad")
      ) {
        checkAchievement(100, "extinct_" + this.id);
      }

      // Blood War
      if (
        this.genus === "demonic" &&
        settings.prestigeType !== "mad" &&
        settings.prestigeType !== "bioseed"
      ) {
        checkAchievement(50, "blood_war");
      }

      // Sharks with Lasers
      if (this.id === "sharkin" && settings.prestigeType !== "mad") {
        checkAchievement(50, "laser_shark");
      }

      // Macro Universe and Arquillian Galaxy
      if (
        game.global.race.universe === "micro" &&
        settings.prestigeType === "bioseed"
      ) {
        let smallRace =
          this.genus === "small" || game.races[this.id].traits.compact;
        checkAchievement(50, smallRace ? "macro" : "marble");
      }

      // You Shall Pass
      if (
        this.id === "balorg" &&
        game.global.race.universe === "magic" &&
        settings.prestigeType === "vacuum"
      ) {
        checkAchievement(50, "pass");
      }

      // Madagascar Tree, Godwin's law, Infested Terrans - Achievement race
      for (let set of fanatAchievements) {
        if (this.id === set.race && game.global.race.gods === set.god) {
          checkAchievement(150, set.achieve);
        }
      }

      // Increase weight for suited conditional races with achievements
      if (
        weighting > 0 &&
        habitability === 1 &&
        this.getCondition() !== "" &&
        !challengeRace.includes(this.id)
      ) {
        weighting += 500;
      }

      // Increases weight of stringest races of genus
      if (
        (midTierReset.includes(settings.prestigeType) &&
          bestForMid.includes(this.id)) ||
        (highTierReset.includes(settings.prestigeType) &&
          bestForHigh.includes(this.id))
      ) {
        weighting += 1;
      }

      // Same race for Second Evolution
      if (this.id === game.global.race.gods) {
        checkAchievement(10, "second_evolution");
      }

      // Madagascar Tree, Godwin's law, Infested Terrans - God race
      // This races shouldn't benefit from suited planet, to avoid prep -> prep loops
      for (let set of fanatAchievements) {
        if (this.id === set.god) {
          checkAchievement(5, set.achieve);
        }
      }

      // Feats, lowest weight - go for them only if there's nothing better
      if (game.global.race.universe !== "micro") {
        const checkFeat = (id) => {
          let improve = starLevel - (game.global.stats.feat[id] ?? 0);
          if (improve > 0) {
            weighting += 1 * improve;
            goals.push(`feat_${id}_name`);
          }
        };

        // Take no advice, Ill Advised
        if (
          game.global.city.biome === "hellscape" &&
          this.genus !== "demonic"
        ) {
          switch (settings.prestigeType) {
            case "mad":
            case "cataclysm":
              checkFeat("take_no_advice");
              break;
            case "bioseed":
              checkFeat("ill_advised");
              break;
          }
        }

        // Organ Harvester, The Misery, Garbage Pie
        if (this.id === "junker") {
          switch (settings.prestigeType) {
            case "bioseed":
              checkFeat("organ_harvester");
              break;
            case "ascension":
            case "demonic":
              checkFeat("garbage_pie");
            case "terraform":
            case "whitehole":
            case "vacuum":
            case "apocalypse":
              checkFeat("the_misery");
              break;
          }
        }

        // Nephilim
        if (
          settings.prestigeType === "whitehole" &&
          game.global.race.universe === "evil" &&
          this.genus === "angelic"
        ) {
          checkFeat("nephilim");
        }

        // Twisted
        if (settings.prestigeType === "demonic" && this.genus === "angelic") {
          checkFeat("twisted");
        }

        // Digital Ascension
        if (
          settings.prestigeType === "ascension" &&
          settings.challenge_emfield &&
          this.genus === "artifical" &&
          this.id !== "custom"
        ) {
          checkFeat("digital_ascension");
        }

        // Slime Lord
        if (settings.prestigeType === "demonic" && this.id === "sludge") {
          checkFeat("slime_lord");
        }
      }

      // Ignore challenge races on low star, and decrease weight on any other star
      if (challengeRace.includes(this.id)) {
        weighting *= starLevel < 5 ? 0 : 0.01;
      }

      // Scale down weight of unsuited races
      weighting *= habitability;

      return verbose ? goals : weighting;
    }

    getHabitability() {
      switch (this.id) {
        case "hellspawn":
          return game.global.race.universe === "evil" &&
            game.global.stats.achieve["godslayer"]?.e
            ? 1
            : 0;
        case "junker":
          return game.global.genes.challenge ? 1 : 0;
        case "sludge":
          return (game.global.stats.achieve["ascended"] ||
            game.global.stats.achieve["corrupted"]) &&
            game.global.stats.achieve["extinct_junker"]
            ? 1
            : 0;
        case "ultra_sludge":
          return game.global.stats.achieve["godslayer"] &&
            game.global.stats.achieve["extinct_sludge"]
            ? 1
            : 0;
        case "hybrid":
          return game.global.stats.achieve["what_is_best"]?.e >= 5 ? 1 : 0;
      }

      let unboundMod =
        game.global.blood.unbound >= 4
          ? 0.95
          : game.global.blood.unbound >= 2
            ? 0.9
            : game.global.blood.unbound >= 1
              ? 0.8
              : 0;
      let shadowMod = game.global.blood.unbound >= 3 ? unboundMod : 0;

      switch (this.genus) {
        case "aquatic":
          return ["swamp", "oceanic"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "fey":
          return ["forest", "swamp", "taiga"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "sand":
          return ["ashland", "desert"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "heat":
          return ["ashland", "volcanic"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "polar":
          return ["tundra", "taiga"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "demonic":
          return game.global.city.biome === "hellscape" ? 1 : shadowMod;
        case "angelic":
          return game.global.city.biome === "eden" ? 1 : shadowMod;
        case "synthetic":
          return game.global.stats.achieve["obsolete"]?.l >= 5 ? 1 : 0;
        case "eldritch":
          return game.global.stats.achieve["nightmare"]?.mg ? 1 : 0;
        case "hybrid":
          return game.global.stats.achieve["godslayer"] ? 1 : 0;
        case undefined: // Nonexistent custom
          return 0;
        default:
          return 1;
      }
    }

    getCondition() {
      switch (this.id) {
        case "hellspawn":
          return poly.loc("wiki_challenges_reqs_reset", [
            `${poly.loc("wiki_universe_evil")} ${poly.loc(
              "wiki_resets_apotheosis",
            )}`,
          ]);
        case "junker":
          return "Genetic Dead End unlocked.";
        case "sludge":
          return "Failed Experiment unlocked.";
        case "ultra_sludge":
          return "Ultra Failed Experiment unlocked.";
        case "custom":
          return `Complete an Ascension reset and be on a suitable planet for your chosen genus (${
            this.genus ? game.loc("genelab_genus_" + this.genus) : "not set"
          }).`;
        case "hybrid":
          return game.loc("wiki_achieve_what_is_best");
      }

      switch (this.genus) {
        case "aquatic":
          return "Oceanic or Swamp planet.";
        case "fey":
          return "Forest, Swamp or Taiga planet.";
        case "sand":
          return "Ashland or Desert planet.";
        case "heat":
          return "Ashland or Volcanic planet.";
        case "polar":
          return "Tundra or Taiga planet.";
        case "demonic":
          return "Hellscape planet.";
        case "angelic":
          return "Eden planet.";
        case "synthetic":
          return game.loc("wiki_achieve_obsolete");
        case "eldritch":
          return game.loc("wiki_achieve_nightmare");
        case "hybrid":
          return game.loc("wiki_achieve_godslayer");
        case undefined:
          return "Unknown.";
        default: // No special conditions
          return "";
      }
    }
  }

  class Trigger {
    constructor(
      seq,
      priority,
      requirementType,
      requirementId,
      requirementCount,
      actionType,
      actionId,
      actionCount,
    ) {
      this.seq = seq;
      this.priority = priority;

      this.requirementType = requirementType;
      this.requirementId = requirementId;
      this.requirementCount = requirementCount;

      this.actionType = actionType;
      this.actionId = actionId;
      this.actionCount = actionCount;

      this.complete = false;
    }

    cost() {
      if (this.actionType === "research") {
        return techIds[this.actionId].definition.cost;
      }
      if (this.actionType === "build") {
        return buildingIds[this.actionId].definition.cost;
      }
      if (this.actionType === "arpa") {
        return arpaIds[this.actionId].definition.cost;
      }
      return {};
    }

    isActionPossible() {
      // check against MAX as we want to know if it is possible...
      let obj = null;
      if (this.actionType === "research") {
        obj = techIds[this.actionId];
      }
      if (this.actionType === "build") {
        obj = buildingIds[this.actionId];
      }
      if (this.actionType === "arpa") {
        obj = arpaIds[this.actionId];
      }
      return obj && obj.isUnlocked() && obj.isAffordable(true);
    }

    updateComplete() {
      if (this.complete) {
        return false;
      }

      if (
        this.actionType === "research" &&
        techIds[this.actionId].isResearched()
      ) {
        this.complete = true;
        return true;
      }
      if (
        this.actionType === "build" &&
        buildingIds[this.actionId].count >= this.actionCount
      ) {
        this.complete = true;
        return true;
      }
      if (
        this.actionType === "arpa" &&
        arpaIds[this.actionId].count >= this.actionCount
      ) {
        this.complete = true;
        return true;
      }
      return false;
    }

    areRequirementsMet() {
      if (this.requirementType === "chain") {
        return (
          this.priority < 1 ||
          TriggerManager.priorityList[this.priority - 1]?.complete
        );
      } else if (checkTypes[this.requirementType]) {
        try {
          if (retBools.includes(this.requirementType)) {
            return (
              checkTypes[this.requirementType].fn(this.requirementId) ==
              this.requirementCount
            );
          } else {
            return (
              checkTypes[this.requirementType].fn(this.requirementId) >=
              this.requirementCount
            );
          }
        } catch (error) {
          // Triggers don't have names, hopefully this is enough for the user to find it
          let displayName = `${this.requirementType} ${this.requirementId} x${this.requirementCount} => ${this.actionType}: ${this.actionId} x${this.actionCount}`;
          let msg = `Trigger ${this.seq} [${displayName}] requirement is invalid! Fix or remove it. (${error})`;
          if (
            !WindowManager.isOpen() &&
            !Object.values(game.global.lastMsg.all).find((log) => log.m === msg)
          ) {
            // Don't spam with errors
            GameLog.logDanger("special", msg, ["events", "major_events"]);
          }
        }
      }
      return false;
    }

    updateRequirementType(requirementType) {
      if (requirementType === this.requirementType) {
        return;
      }

      if (requirementType === "chain") {
        this.requirementType = requirementType;
        this.requirementId = "";
        this.requirementCount = 0;
        return; // Special case
      }

      if (!checkTypes[requirementType]) {
        return; // Invalid type
      }

      let oldArg = checkTypes[this.requirementType]?.arg ?? null;
      let oldOpts = checkTypes[this.requirementType]?.options ?? null;
      let newArg = checkTypes[requirementType].arg;
      let newOpts = checkTypes[requirementType].options;

      this.requirementType = requirementType;
      this.requirementCount = 1;
      this.complete = false;

      if (oldArg !== newArg || oldOpts !== newOpts) {
        this.requirementId = checkTypes[this.requirementType].def;
      }
    }

    updateActionType(actionType) {
      if (actionType === this.actionType) {
        return;
      }

      this.actionType = actionType;
      this.complete = false;

      if (this.actionType === "research") {
        this.actionId = "tech-club";
        this.actionCount = 0;
        return;
      }
      if (this.actionType === "build") {
        this.actionId = "city-basic_housing";
        this.actionCount = 1;
        return;
      }
      if (this.actionType === "arpa") {
        this.actionId = "arpalhc";
        this.actionCount = 1;
        return;
      }
    }
  }

  class MinorTrait {
    constructor(traitName) {
      this.traitName = traitName;
    }

    get enabled() {
      return settings["mTrait_" + this.traitName];
    }
    get priority() {
      return settingsRaw["mTrait_p_" + this.traitName];
    }
    get weighting() {
      return settings["mTrait_w_" + this.traitName];
    }

    isUnlocked() {
      return game.global.settings.mtorder.includes(this.traitName);
    }

    geneCount() {
      return game.global.race.minor[this.traitName] ?? 0;
    }

    phageCount() {
      return game.global.genes.minor[this.traitName] ?? 0;
    }

    totalCount() {
      return game.global.race[this.traitName] ?? 0;
    }

    geneCost() {
      return this.traitName === "mastery"
        ? Fibonacci(this.geneCount()) * 5
        : Fibonacci(this.geneCount());
    }
  }

  class MutableTrait {
    constructor(traitName) {
      this.traitName = traitName;
      this.baseCost = Math.abs(game.traits[traitName].val);
      this.isPositive = game.traits[traitName].val >= 0;
    }

    get gainEnabled() {
      return settings["mutableTrait_gain_" + this.traitName];
    }
    get purgeEnabled() {
      return settings["mutableTrait_purge_" + this.traitName];
    }
    get resetEnabled() {
      return settings["mutableTrait_reset_" + this.traitName];
    }
    get priority() {
      return settingsRaw["mutableTrait_p_" + this.traitName];
    }

    get name() {
      return game.loc("trait_" + this.traitName + "_name");
    }

    canGain() {
      if (
        game.global.race.species === "hellspawn" &&
        game.global.race["warlord"]
      ) {
        return false;
      }

      return (
        this.gainEnabled &&
        !this.purgeEnabled &&
        this.canMutate("gain") &&
        game.global.race[this.traitName] === undefined &&
        !conflictingTraits.some(
          (set) =>
            (set[0] === this.traitName &&
              game.global.race[set[1]] !== undefined) ||
            (set[1] === this.traitName &&
              game.global.race[set[0]] !== undefined),
        )
      );
    }

    canPurge() {
      return (
        this.purgeEnabled &&
        !this.gainEnabled &&
        this.canMutate("purge") &&
        game.global.race[this.traitName] !== undefined &&
        !(
          (game.global.race.species === "sludge" ||
            game.global.race.species === "ultra_sludge") &&
          this.traitName === "ooze"
        ) &&
        !game.global.race.ss_traits?.includes(this.traitName) &&
        !game.global.race.iTraits?.hasOwnProperty(this.traitName)
      );
    }

    canMutate(action) {
      let currentPlasmids =
        resources[
          game.global.race.universe === "antimatter" ? "AntiPlasmid" : "Plasmid"
        ].currentQuantity;
      return (
        currentPlasmids - this.mutationCost(action) >=
          MutableTraitManager.minimumPlasmidsToPreserve &&
        !(
          (game.global.race.species === "sludge" ||
            game.global.race.species === "ultra_sludge") &&
          game.global.race["modified"]
        )
      );
    }

    mutationCost(action) {
      let mult =
        mutationCostMultipliers[game.global.race.species]?.[action] ?? 1;
      let multGenus =
        mutationCostMultipliersGenus[
          game.races[game.global.race.species].type
        ]?.[action] ?? 1;
      return this.baseCost * 5 * mult * multGenus;
    }
  }

  class MajorTrait extends MutableTrait {
    constructor(traitName) {
      super(traitName);
      this.type = "major";
      let ownerRace =
        Object.entries(game.races)
          .filter(
            ([id, race]) =>
              id !== "custom" &&
              id !== "hybrid" &&
              race.traits[traitName] !== undefined,
          )
          .map(([id, race]) => ({ id: id, genus: race.type }))[0] ?? {};
      this.source = ownerRace.id ?? specialRaceTraits[traitName] ?? "";
      this.racesThatCanGain = Object.entries(game.races)
        .filter(
          ([id, race]) =>
            id == ownerRace.id ||
            (race?.type == "hybrid"
              ? race?.hybrid?.includes(ownerRace.genus)
              : race?.type === ownerRace.genus),
        )
        .map(([id, race]) => id)
        .flat();

      this.genus = this.source === "reindeer" ? "herbivore" : ownerRace.genus;
    }

    isGainable() {
      return this.traitName !== "frail" && this.traitName !== "ooze";
    }

    canGain() {
      return (
        super.canGain() &&
        game.global.genes["mutation"] >= 3 &&
        this.racesThatCanGain.includes(game.global.race.species)
      );
    }

    canPurge() {
      return super.canPurge() && game.global.genes["mutation"] >= 1;
    }
  }

  class GenusTrait extends MutableTrait {
    constructor(traitName) {
      super(traitName);
      this.type = "genus";
      let genus = Object.entries(poly.genus_traits)
        .filter(([id, traits]) => traits[traitName] !== undefined)
        .map(([id, traits]) => id);
      this.source = genus[0] ?? specialRaceTraits[traitName] ?? "";
      this.genus = this.source;
    }

    isGainable() {
      return false;
    }

    canGain() {
      return false;
    }

    canPurge() {
      return super.canPurge() && game.global.genes["mutation"] >= 2;
    }
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
  var resources = {
    // Resources order follow game order, and used to initialize priorities
    // Evolution resources
    RNA: new Resource("RNA", "RNA"),
    DNA: new Resource("DNA", "DNA"),

    // Base resources
    Money: new Resource("Money", "Money"),
    Population: new Population("Population", "Population"), // We can't store the full elementId because we don't know the name of the population node until later
    Slave: new Resource("Slave", "Slave"),
    Mana: new Resource("Mana", "Mana"),
    Energy: new Resource("Energy", "Energy"),
    Sus: new Resource("Suspicion", "Sus"),
    Authority: new Resource("Authority", "Authority"),
    Knowledge: new Resource("Knowledge", "Knowledge"),
    Omniscience: new Resource("Omniscience", "Omniscience"),
    Zen: new Resource("Zen", "Zen"),
    Crates: new Resource("Crates", "Crates"),
    Containers: new Resource("Containers", "Containers"),

    // Basic resources (can trade for these)
    Food: new Resource("Food", "Food", { tradable: true }),
    Lumber: new Resource("Lumber", "Lumber", { tradable: true }),
    Chrysotile: new Resource("Chrysotile", "Chrysotile", { tradable: true }),
    Stone: new Resource("Stone", "Stone", { tradable: true }),
    Crystal: new Resource("Crystal", "Crystal", { tradable: true }),
    Furs: new Resource("Furs", "Furs", { tradable: true }),
    Copper: new Resource("Copper", "Copper", { tradable: true }),
    Iron: new Resource("Iron", "Iron", { tradable: true }),
    Aluminium: new Resource("Aluminium", "Aluminium", { tradable: true }),
    Cement: new Resource("Cement", "Cement", { tradable: true }),
    Coal: new Resource("Coal", "Coal", { tradable: true }),
    Oil: new Resource("Oil", "Oil", { tradable: true }),
    Uranium: new Resource("Uranium", "Uranium", { tradable: true }),
    Steel: new Resource("Steel", "Steel", { tradable: true }),
    Titanium: new Resource("Titanium", "Titanium", { tradable: true }),
    Alloy: new Resource("Alloy", "Alloy", { tradable: true }),
    Polymer: new Resource("Polymer", "Polymer", { tradable: true }),
    Iridium: new Resource("Iridium", "Iridium", { tradable: true }),
    Helium_3: new Resource("Helium-3", "Helium_3", { tradable: true }),

    // Advanced resources
    Water: new Resource("Water", "Water"),
    Deuterium: new Resource("Deuterium", "Deuterium"),
    Neutronium: new Resource("Neutronium", "Neutronium"),
    Adamantite: new Resource("Adamantite", "Adamantite"),
    Infernite: new Resource("Infernite", "Infernite"),
    Elerium: new Resource("Elerium", "Elerium"),
    Nano_Tube: new Resource("Nano Tube", "Nano_Tube"),
    Graphene: new Resource("Graphene", "Graphene"),
    Stanene: new Resource("Stanene", "Stanene"),
    Bolognium: new Resource("Bolognium", "Bolognium"),
    Vitreloy: new Resource("Vitreloy", "Vitreloy"),
    Orichalcum: new Resource("Orichalcum", "Orichalcum"),
    Asphodel_Powder: new Resource("Asphodel Powder", "Asphodel_Powder"),
    Elysanite: new Resource("Elysanite", "Elysanite"),
    Unobtainium: new Resource("Unobtainium", "Unobtainium"),
    Materials: new Resource("Materials", "Materials"),

    Horseshoe: new Resource("Horseshoe", "Horseshoe"),
    Nanite: new Resource("Nanite", "Nanite"),
    Genes: new Resource("Genes", "Genes"),
    Soul_Gem: new SoulGem("Soul Gem", "Soul_Gem"),

    // Craftable resources
    Plywood: new Resource("Plywood", "Plywood"),
    Brick: new Resource("Brick", "Brick"),
    Wrought_Iron: new Resource("Wrought Iron", "Wrought_Iron"),
    Sheet_Metal: new Resource("Sheet Metal", "Sheet_Metal"),
    Mythril: new Resource("Mythril", "Mythril"),
    Aerogel: new Resource("Aerogel", "Aerogel"),
    Nanoweave: new Resource("Nanoweave", "Nanoweave"),
    Scarletite: new Resource("Scarletite", "Scarletite"),
    Quantium: new Resource("Quantium", "Quantium"),

    // Special resources
    Corrupt_Gem: new Resource("Corrupt Gem", "Corrupt_Gem"),
    Codex: new Resource("Codex", "Codex"),
    Cipher: new Resource("Encrypted Data", "Cipher"),
    Demonic_Essence: new Resource("Demonic Essence", "Demonic_Essence"),
    Blessed_Essence: new Resource("Blessed Essence", "Blessed_Essence"),

    // Prestige resources
    Blood_Stone: new PrestigeResource("Blood Stone", "Blood_Stone"),
    Artifact: new PrestigeResource("Artifact", "Artifact"),
    Plasmid: new PrestigeResource("Plasmid", "Plasmid"),
    AntiPlasmid: new PrestigeResource("Anti-Plasmid", "AntiPlasmid"),
    Supercoiled: new PrestigeResource("Supercoiled", "Supercoiled"),
    Phage: new PrestigeResource("Phage", "Phage"),
    Dark: new PrestigeResource("Dark", "Dark"),
    Harmony: new PrestigeResource("Harmony", "Harmony"),
    AICore: new PrestigeResource("AI Core", "AICore"),

    // Special not-really-resources-but-we'll-treat-them-like-resources resources
    Troops: new Troops("Troops", "Troops"),
    Supply: new Supply("Supplies", "Supply"),
    Power: new Power("Power", "Power"),
    Morale: new Morale("Morale", "Morale"),
    Thrall: new Thrall("Thrall", "Thrall"),
    Womlings_Support: new WomlingsSupport(
      "Womlings",
      "Womlings_Support",
      "",
      "",
    ),
    Moon_Support: new Support(
      "Moon Support",
      "Moon_Support",
      "space",
      "spc_moon",
    ),
    Red_Support: new Support("Red Support", "Red_Support", "space", "spc_red"),
    Sun_Support: new Support("Sun Support", "Sun_Support", "space", "spc_sun"),
    Belt_Support: new BeltSupport(
      "Belt Support",
      "Belt_Support",
      "space",
      "spc_belt",
    ),
    Titan_Support: new Support(
      "Titan Support",
      "Titan_Support",
      "space",
      "spc_titan",
    ),
    Electrolysis_Support: new ElectrolysisSupport(
      "Electrolysis Plant",
      "Electrolysis_Support",
      "",
      "",
    ),
    Enceladus_Support: new Support(
      "Enceladus Support",
      "Enceladus_Support",
      "space",
      "spc_enceladus",
    ),
    Eris_Support: new Support(
      "Eris Support",
      "Eris_Support",
      "space",
      "spc_eris",
    ),

    Tau_Support: new Support(
      "Tau Ceti Support",
      "Tau_Support",
      "tauceti",
      "tau_home",
    ),
    Tau_Red_Support: new Support(
      "Tau Ceti Red Support",
      "Tau_Red_Support",
      "tauceti",
      "tau_red",
    ),
    Tau_Belt_Support: new Support(
      "Tau Ceti Belt Support",
      "Tau_Belt_Support",
      "tauceti",
      "tau_roid",
    ),

    Alpha_Support: new Support(
      "Alpha Support",
      "Alpha_Support",
      "interstellar",
      "int_alpha",
    ),
    Nebula_Support: new Support(
      "Nebula Support",
      "Nebula_Support",
      "interstellar",
      "int_nebula",
    ),
    Gateway_Support: new Support(
      "Gateway Support",
      "Gateway_Support",
      "galaxy",
      "gxy_gateway",
    ),
    Alien_Support: new Support(
      "Alien Support",
      "Alien_Support",
      "galaxy",
      "gxy_alien2",
    ),
    Lake_Support: new Support(
      "Lake Support",
      "Lake_Support",
      "portal",
      "prtl_lake",
    ),
    Spire_Support: new Support(
      "Spire Support",
      "Spire_Support",
      "portal",
      "prtl_spire",
    ),
    Asphodel_Support: new Support(
      "Asphodel Support",
      "Asphodel_Support",
      "eden",
      "eden_asphodel",
    ),
  };

  var jobs = {
    Unemployed: new BasicJob("unemployed", "Unemployed"),
    Colonist: new Job("colonist", "Colonist"),
    Teamster: new BasicJob("teamster", "Teamster", { smart: true }),
    Meditator: new BasicJob("meditator", "Meditator", { smart: true }),
    Hunter: new BasicJob("hunter", "Hunter", { serve: true, smart: true }),
    Farmer: new BasicJob("farmer", "Farmer", { serve: true, smart: true }),
    Forager: new BasicJob("forager", "Forager", { serve: true, split: true }),
    Lumberjack: new BasicJob("lumberjack", "Lumberjack", {
      serve: true,
      split: true,
      smart: true,
    }),
    QuarryWorker: new BasicJob("quarry_worker", "Quarry Worker", {
      serve: true,
      split: true,
      smart: true,
    }),
    CrystalMiner: new BasicJob("crystal_miner", "Crystal Miner", {
      serve: true,
      split: true,
      smart: true,
    }),
    Scavenger: new BasicJob("scavenger", "Scavenger", {
      serve: true,
      split: true,
    }),

    TitanColonist: new Job("titan_colonist", "Titan Colonist"),
    Miner: new Job("miner", "Miner", { smart: true }),
    CoalMiner: new Job("coal_miner", "Coal Miner", { smart: true }),
    CementWorker: new Job("cement_worker", "Cement Worker", { smart: true }),
    Professor: new Job("professor", "Professor", { smart: true }),
    Scientist: new Job("scientist", "Scientist", { smart: true }),
    Entertainer: new Job("entertainer", "Entertainer", { smart: true }),
    HellSurveyor: new Job("hell_surveyor", "Hell Surveyor", { smart: true }),
    SpaceMiner: new Job("space_miner", "Space Miner", { smart: true }),
    PitMiner: new Job("pit_miner", "Pit Miner"),
    Torturer: new Job("torturer", "Tormentor", { smart: true }),
    Archaeologist: new Job("archaeologist", "Archaeologist"),
    GhostTrapper: new Job("ghost_trapper", "Ghost Trapper"),
    ElysiumMiner: new Job("elysium_miner", "Elysium Miner"),
    Banker: new Job("banker", "Banker", { smart: true }),
    Priest: new Job("priest", "Priest"),
  };

  // Non-manual crafts should be on top
  var crafter = {
    Scarletite: new CraftingJob(
      "Scarletite",
      "Scarletite Crafter",
      resources.Scarletite,
    ),
    Quantium: new CraftingJob(
      "Quantium",
      "Quantium Crafter",
      resources.Quantium,
    ),
    Plywood: new CraftingJob("Plywood", "Plywood Crafter", resources.Plywood),
    Brick: new CraftingJob("Brick", "Brick Crafter", resources.Brick),
    WroughtIron: new CraftingJob(
      "Wrought_Iron",
      "Wrought Iron Crafter",
      resources.Wrought_Iron,
    ),
    SheetMetal: new CraftingJob(
      "Sheet_Metal",
      "Sheet Metal Crafter",
      resources.Sheet_Metal,
    ),
    Mythril: new CraftingJob("Mythril", "Mythril Crafter", resources.Mythril),
    Aerogel: new CraftingJob("Aerogel", "Aerogel Crafter", resources.Aerogel),
    Nanoweave: new CraftingJob(
      "Nanoweave",
      "Nanoweave Crafter",
      resources.Nanoweave,
    ),
  };

  var buildings = {
    Food: new ResourceAction("Gather Food", "city", "food", "", "Food"),
    Lumber: new ResourceAction("Gather Lumber", "city", "lumber", "", "Lumber"),
    Stone: new ResourceAction("Gather Stone", "city", "stone", "", "Stone"),
    Chrysotile: new ResourceAction(
      "Gather Chrysotile",
      "city",
      "chrysotile",
      "",
      "Chrysotile",
    ),
    Slaughter: new Action("Slaughter the Weak", "city", "slaughter", ""),
    ForgeHorseshoe: new ResourceAction(
      "Horseshoe",
      "city",
      "horseshoe",
      "",
      "Horseshoe",
      { housing: true, garrison: true },
    ),
    SlaveMarket: new ResourceAction(
      "Slave Market",
      "city",
      "slave_market",
      "",
      "Slave",
    ),
    SacrificialAltar: new Action("Sacrificial Altar", "city", "s_alter", ""),
    House: new Action("Cabin", "city", "basic_housing", "", { housing: true }),
    Cottage: new Action("Cottage", "city", "cottage", "", { housing: true }),
    Apartment: new Action("Apartment", "city", "apartment", "", {
      housing: true,
    }),
    Lodge: new Action("Lodge", "city", "lodge", "", { housing: true }),
    Smokehouse: new Action("Smokehouse", "city", "smokehouse", ""),
    SoulWell: new Action("Soul Well", "city", "soul_well", ""),
    SlavePen: new Action("Slave Pen", "city", "slave_pen", ""),
    Transmitter: new Action("Transmitter", "city", "transmitter", "", {
      housing: true,
    }),
    CaptiveHousing: new Action(
      "Captive Housing",
      "city",
      "captive_housing",
      "",
    ),
    Farm: new Action("Farm", "city", "farm", "", { housing: true }),
    CompostHeap: new Action("Compost Heap", "city", "compost", ""),
    Mill: new Action("Windmill", "city", "mill", "", { smart: true }),
    Windmill: new Action("Windmill (Evil)", "city", "windmill", ""),
    Silo: new Action("Grain Silo", "city", "silo", ""),
    Assembly: new ResourceAction(
      "Assembly",
      "city",
      "assembly",
      "",
      "Population",
      { housing: true, important: true },
    ),
    Barracks: new Action("Barracks", "city", "garrison", "", {
      garrison: true,
    }),
    Hospital: new Action("Hospital", "city", "hospital", ""),
    BootCamp: new Action("Boot Camp", "city", "boot_camp", ""),
    Shed: new Action("Shed", "city", "shed", ""),
    StorageYard: new Action("Freight Yard", "city", "storage_yard", ""),
    Warehouse: new Action("Container Port", "city", "warehouse", ""),
    Bank: new Action("Bank", "city", "bank", ""),
    Pylon: new Action("Pylon", "city", "pylon", ""),
    ConcealWard: new Action(
      "Conceal Ward (Witch Hunting)",
      "city",
      "conceal_ward",
      "",
    ),
    Graveyard: new Action("Graveyard", "city", "graveyard", ""),
    LumberYard: new Action("Lumber Yard", "city", "lumber_yard", ""),
    Sawmill: new Action("Sawmill", "city", "sawmill", ""),
    RockQuarry: new Action("Rock Quarry", "city", "rock_quarry", ""),
    CementPlant: new Action("Cement Plant", "city", "cement_plant", "", {
      smart: true,
    }),
    Foundry: new Action("Foundry", "city", "foundry", ""),
    Factory: new Action("Factory", "city", "factory", ""),
    NaniteFactory: new Action("Nanite Factory", "city", "nanite_factory", ""),
    Smelter: new Action("Smelter", "city", "smelter", ""),
    MetalRefinery: new Action("Metal Refinery", "city", "metal_refinery", ""),
    Mine: new Action("Mine", "city", "mine", "", { smart: true }),
    CoalMine: new Action("Coal Mine", "city", "coal_mine", "", { smart: true }),
    OilWell: new Action("Oil Derrick", "city", "oil_well", ""),
    OilDepot: new Action("Fuel Depot", "city", "oil_depot", ""),
    Trade: new Action("Trade Post", "city", "trade", ""),
    Wharf: new Action("Wharf", "city", "wharf", ""),
    TouristCenter: new Action("Tourist Center", "city", "tourist_center", "", {
      smart: true,
    }),
    Amphitheatre: new Action("Amphitheatre", "city", "amphitheatre", ""),
    Casino: new Action("Casino", "city", "casino", ""),
    Temple: new Action("Temple", "city", "temple", ""),
    Shrine: new Action("Shrine", "city", "shrine", ""),
    MeditationChamber: new Action(
      "Meditation Chamber",
      "city",
      "meditation",
      "",
    ),
    Banquet: new Action("Banquet Hall", "city", "banquet", ""),
    University: new Action("University", "city", "university", "", {
      knowledge: true,
    }),
    Library: new Action("Library", "city", "library", "", { knowledge: true }),
    Wardenclyffe: new Action("Wardenclyffe", "city", "wardenclyffe", "", {
      knowledge: true,
    }),
    BioLab: new Action("Bioscience Lab", "city", "biolab", "", {
      knowledge: true,
    }),
    CoalPower: new Action("Coal Powerplant", "city", "coal_power", ""),
    OilPower: new Action("Oil Powerplant", "city", "oil_power", ""),
    FissionPower: new Action("Fission Reactor", "city", "fission_power", ""),
    MassDriver: new Action("Mass Driver", "city", "mass_driver", "", {
      knowledge: () => haveTech("mass", 2),
    }),

    SpaceTestLaunch: new Action(
      "Space Test Launch",
      "space",
      "test_launch",
      "spc_home",
    ),
    SpaceSatellite: new Action(
      "Space Satellite",
      "space",
      "satellite",
      "spc_home",
      { knowledge: true },
    ),
    SpaceGps: new Action("Space Gps", "space", "gps", "spc_home"),
    SpacePropellantDepot: new Action(
      "Space Propellant Depot",
      "space",
      "propellant_depot",
      "spc_home",
    ),
    SpaceNavBeacon: new Action(
      "Space Navigation Beacon",
      "space",
      "nav_beacon",
      "spc_home",
    ),

    MoonMission: new Action(
      "Moon Mission",
      "space",
      "moon_mission",
      "spc_moon",
    ),
    MoonBase: new Action("Moon Base", "space", "moon_base", "spc_moon"),
    MoonIridiumMine: new Action(
      "Moon Iridium Mine",
      "space",
      "iridium_mine",
      "spc_moon",
      { smart: true },
    ),
    MoonHeliumMine: new Action(
      "Moon Helium-3 Mine",
      "space",
      "helium_mine",
      "spc_moon",
      { smart: true },
    ),
    MoonObservatory: new Action(
      "Moon Observatory",
      "space",
      "observatory",
      "spc_moon",
      { knowledge: true },
    ),

    RedMission: new Action("Red Mission", "space", "red_mission", "spc_red"),
    RedSpaceport: new Action("Red Spaceport", "space", "spaceport", "spc_red"),
    RedTower: new Action("Red Space Control", "space", "red_tower", "spc_red"),
    RedCaptiveHousing: new CityAction(
      "Red Captive Housing (Cataclysm)",
      "space",
      "captive_housing",
      "spc_red",
    ),
    RedTerraformer: new Action(
      "Red Terraformer (Orbit Decay)",
      "space",
      "terraformer",
      "spc_red",
      { multiSegmented: true },
    ),
    RedAtmoTerraformer: new Action(
      "Red Terraformer (Orbit Decay, Complete)",
      "space",
      "atmo_terraformer",
      "spc_red",
    ),
    RedTerraform: new Action(
      "Red Terraform (Orbit Decay)",
      "space",
      "terraform",
      "spc_red",
      { prestige: true },
    ),
    RedAssembly: new ResourceAction(
      "Red Assembly (Cataclysm)",
      "space",
      "assembly",
      "spc_red",
      "Population",
      { housing: true, important: true },
    ),
    RedLivingQuarters: new Action(
      "Red Living Quarters",
      "space",
      "living_quarters",
      "spc_red",
      { housing: true },
    ),
    RedPylon: new Action("Red Pylon (Cataclysm)", "space", "pylon", "spc_red"),
    RedVrCenter: new Action("Red VR Center", "space", "vr_center", "spc_red"),
    RedGarage: new Action("Red Garage", "space", "garage", "spc_red"),
    RedMine: new Action("Red Mine", "space", "red_mine", "spc_red"),
    RedFabrication: new Action(
      "Red Fabrication",
      "space",
      "fabrication",
      "spc_red",
    ),
    RedFactory: new Action("Red Factory", "space", "red_factory", "spc_red"),
    RedNaniteFactory: new CityAction(
      "Red Nanite Factory (Cataclysm)",
      "space",
      "nanite_factory",
      "spc_red",
    ),
    RedBiodome: new Action("Red Biodome", "space", "biodome", "spc_red"),
    RedUniversity: new Action(
      "Red University (Orbit Decay)",
      "space",
      "red_university",
      "spc_red",
      { knowledge: true },
    ),
    RedExoticLab: new Action(
      "Red Exotic Materials Lab",
      "space",
      "exotic_lab",
      "spc_red",
      { knowledge: true },
    ),
    RedZiggurat: new Action("Red Ziggurat", "space", "ziggurat", "spc_red"),
    RedSpaceBarracks: new Action(
      "Red Marine Barracks",
      "space",
      "space_barracks",
      "spc_red",
      { garrison: true },
    ),
    RedForgeHorseshoe: new ResourceAction(
      "Red Horseshoe (Cataclysm)",
      "space",
      "horseshoe",
      "spc_red",
      "Horseshoe",
      { housing: true, garrison: true },
    ),

    HellMission: new Action(
      "Hell Mission",
      "space",
      "hell_mission",
      "spc_hell",
    ),
    HellGeothermal: new Action(
      "Hell Geothermal Plant",
      "space",
      "geothermal",
      "spc_hell",
    ),
    HellSmelter: new Action(
      "Hell Smelter",
      "space",
      "hell_smelter",
      "spc_hell",
    ),
    HellSpaceCasino: new Action(
      "Hell Space Casino",
      "space",
      "spc_casino",
      "spc_hell",
    ),
    HellSwarmPlant: new Action(
      "Hell Swarm Plant",
      "space",
      "swarm_plant",
      "spc_hell",
    ),

    SunMission: new Action("Sun Mission", "space", "sun_mission", "spc_sun"),
    SunSwarmControl: new Action(
      "Sun Control Station",
      "space",
      "swarm_control",
      "spc_sun",
    ),
    SunSwarmSatellite: new Action(
      "Sun Swarm Satellite",
      "space",
      "swarm_satellite",
      "spc_sun",
    ),
    SunJumpGate: new Action("Sun Jump Gate", "space", "jump_gate", "spc_sun", {
      multiSegmented: true,
    }),

    GasMission: new Action("Gas Mission", "space", "gas_mission", "spc_gas"),
    GasMining: new Action(
      "Gas Helium-3 Collector",
      "space",
      "gas_mining",
      "spc_gas",
      { smart: true },
    ),
    GasStorage: new Action("Gas Fuel Depot", "space", "gas_storage", "spc_gas"),
    GasSpaceDock: new SpaceDock(
      "Gas Space Dock",
      "space",
      "star_dock",
      "spc_gas",
    ),
    GasSpaceDockProbe: new ModalAction(
      "Space Dock Probe",
      "starDock",
      "probes",
      "",
    ),
    GasSpaceDockGECK: new ModalAction(
      "Space Dock G.E.C.K.",
      "starDock",
      "geck",
      "",
    ),
    GasSpaceDockShipSegment: new ModalAction(
      "Space Dock Bioseeder Ship",
      "starDock",
      "seeder",
      "",
      { multiSegmented: true },
    ),
    GasSpaceDockPrepForLaunch: new ModalAction(
      "Space Dock Prep Ship",
      "starDock",
      "prep_ship",
      "",
    ),
    GasSpaceDockLaunch: new ModalAction(
      "Space Dock Launch Ship",
      "starDock",
      "launch_ship",
      "",
      { prestige: true },
    ),

    GasMoonMission: new Action(
      "Gas Moon Mission",
      "space",
      "gas_moon_mission",
      "spc_gas_moon",
    ),
    GasMoonOutpost: new Action(
      "Gas Moon Mining Outpost",
      "space",
      "outpost",
      "spc_gas_moon",
    ),
    GasMoonDrone: new Action(
      "Gas Moon Mining Drone",
      "space",
      "drone",
      "spc_gas_moon",
    ),
    GasMoonOilExtractor: new Action(
      "Gas Moon Oil Extractor",
      "space",
      "oil_extractor",
      "spc_gas_moon",
      { smart: true },
    ),

    BeltMission: new Action(
      "Belt Mission",
      "space",
      "belt_mission",
      "spc_belt",
    ),
    BeltSpaceStation: new Action(
      "Belt Space Station",
      "space",
      "space_station",
      "spc_belt",
      { smart: true },
    ),
    BeltEleriumShip: new Action(
      "Belt Elerium Mining Ship",
      "space",
      "elerium_ship",
      "spc_belt",
      { smart: true },
    ),
    BeltIridiumShip: new Action(
      "Belt Iridium Mining Ship",
      "space",
      "iridium_ship",
      "spc_belt",
      { smart: true },
    ),
    BeltIronShip: new Action(
      "Belt Iron Mining Ship",
      "space",
      "iron_ship",
      "spc_belt",
      { smart: true },
    ),

    DwarfMission: new Action(
      "Dwarf Mission",
      "space",
      "dwarf_mission",
      "spc_dwarf",
    ),
    DwarfEleriumContainer: new Action(
      "Dwarf Elerium Storage",
      "space",
      "elerium_contain",
      "spc_dwarf",
    ),
    DwarfEleriumReactor: new Action(
      "Dwarf Elerium Reactor",
      "space",
      "e_reactor",
      "spc_dwarf",
    ),
    DwarfWorldCollider: new Action(
      "Dwarf World Collider",
      "space",
      "world_collider",
      "spc_dwarf",
      { multiSegmented: true },
    ),
    DwarfWorldController: new Action(
      "Dwarf World Collider (Complete)",
      "space",
      "world_controller",
      "spc_dwarf",
      { knowledge: true },
    ),
    DwarfShipyard: new Action(
      "Dwarf Ship Yard",
      "space",
      "shipyard",
      "spc_dwarf",
    ),
    DwarfMassRelay: new Action(
      "Dwarf Mass Relay",
      "space",
      "mass_relay",
      "spc_dwarf",
      { multiSegmented: true },
    ),
    DwarfMassRelayComplete: new Action(
      "Dwarf Mass Relay (Complete)",
      "space",
      "m_relay",
      "spc_dwarf",
    ),

    TitanMission: new Action(
      "Titan Mission",
      "space",
      "titan_mission",
      "spc_titan",
    ),
    TitanSpaceport: new Action(
      "Titan Spaceport",
      "space",
      "titan_spaceport",
      "spc_titan",
    ),
    TitanElectrolysis: new Action(
      "Titan Electrolysis",
      "space",
      "electrolysis",
      "spc_titan",
    ),
    TitanHydrogen: new Action(
      "Titan Hydrogen Plant",
      "space",
      "hydrogen_plant",
      "spc_titan",
    ),
    TitanQuarters: new Action(
      "Titan Habitat",
      "space",
      "titan_quarters",
      "spc_titan",
    ),
    TitanMine: new Action("Titan Mine", "space", "titan_mine", "spc_titan"),
    TitanStorehouse: new Action(
      "Titan Storehouse",
      "space",
      "storehouse",
      "spc_titan",
    ),
    TitanBank: new Action("Titan Bank", "space", "titan_bank", "spc_titan"),
    TitanGraphene: new Action(
      "Titan Graphene Plant",
      "space",
      "g_factory",
      "spc_titan",
    ),
    TitanSAM: new Action("Titan SAM Site", "space", "sam", "spc_titan"),
    TitanDecoder: new Action("Titan Decoder", "space", "decoder", "spc_titan"),
    TitanAI: new Action("Titan AI Core", "space", "ai_core", "spc_titan", {
      multiSegmented: true,
    }),
    TitanAIComplete: new Action(
      "Titan AI Core (Complete)",
      "space",
      "ai_core2",
      "spc_titan",
    ),
    TitanAIColonist: new Action(
      "Titan AI Colonist",
      "space",
      "ai_colonist",
      "spc_titan",
    ),
    EnceladusMission: new Action(
      "Enceladus Mission",
      "space",
      "enceladus_mission",
      "spc_enceladus",
    ),
    EnceladusWaterFreighter: new Action(
      "Enceladus Water Freighter",
      "space",
      "water_freighter",
      "spc_enceladus",
      { smart: true },
    ),
    EnceladusZeroGLab: new Action(
      "Enceladus Zero Gravity Lab",
      "space",
      "zero_g_lab",
      "spc_enceladus",
    ),
    EnceladusBase: new Action(
      "Enceladus Operational Base",
      "space",
      "operating_base",
      "spc_enceladus",
    ),
    EnceladusMunitions: new Action(
      "Enceladus Munitions Depot",
      "space",
      "munitions_depot",
      "spc_enceladus",
    ),
    TritonMission: new Action(
      "Triton Mission",
      "space",
      "triton_mission",
      "spc_triton",
    ),
    TritonFOB: new Action("Triton Forward Base", "space", "fob", "spc_triton"),
    TritonLander: new Action(
      "Triton Troop Lander",
      "space",
      "lander",
      "spc_triton",
      { smart: true },
    ),
    TritonCrashedShip: new Action(
      "Triton Derelict Ship",
      "space",
      "crashed_ship",
      "spc_triton",
    ),
    KuiperMission: new Action(
      "Kuiper Mission",
      "space",
      "kuiper_mission",
      "spc_kuiper",
    ),
    KuiperOrichalcum: new Action(
      "Kuiper Orichalcum Mine",
      "space",
      "orichalcum_mine",
      "spc_kuiper",
      { smart: true },
    ),
    KuiperUranium: new Action(
      "Kuiper Uranium Mine",
      "space",
      "uranium_mine",
      "spc_kuiper",
      { smart: true },
    ),
    KuiperNeutronium: new Action(
      "Kuiper Neutronium Mine",
      "space",
      "neutronium_mine",
      "spc_kuiper",
      { smart: true },
    ),
    KuiperElerium: new Action(
      "Kuiper Elerium Mine",
      "space",
      "elerium_mine",
      "spc_kuiper",
      { smart: true },
    ),
    ErisMission: new Action(
      "Eris Mission",
      "space",
      "eris_mission",
      "spc_eris",
    ),
    ErisDrone: new Action(
      "Eris Control Relay",
      "space",
      "drone_control",
      "spc_eris",
    ),
    ErisTrooper: new Action(
      "Eris Android Trooper",
      "space",
      "shock_trooper",
      "spc_eris",
    ),
    ErisTank: new Action("Eris Tank", "space", "tank", "spc_eris"),
    ErisDigsite: new Action("Eris Digsite", "space", "digsite", "spc_eris"),

    TauStarRingworld: new Action(
      "Tau Star Ringworld",
      "tauceti",
      "ringworld",
      "tau_star",
      { multiSegmented: true },
    ),
    TauStarMatrix: new Action(
      "Tau Star Matrix",
      "tauceti",
      "matrix",
      "tau_star",
    ),
    TauStarBluePill: new Action(
      "Tau Star Blue Pill",
      "tauceti",
      "blue_pill",
      "tau_star",
      { prestige: true },
    ),
    TauStarEden: new Action(
      "Tau Star Garden of Eden",
      "tauceti",
      "goe_facility",
      "tau_star",
      { prestige: true },
    ),

    TauMission: new Action(
      "Tau Mission",
      "tauceti",
      "home_mission",
      "tau_home",
    ),
    TauDismantle: new Action(
      "Tau Dismantle Ship",
      "tauceti",
      "dismantle",
      "tau_home",
    ),
    TauOrbitalStation: new Action(
      "Tau Orbital Station",
      "tauceti",
      "orbital_station",
      "tau_home",
    ),
    TauColony: new Action("Tau Colony", "tauceti", "colony", "tau_home", {
      housing: true,
    }),
    TauHousing: new Action(
      "Tau Housing",
      "tauceti",
      "tau_housing",
      "tau_home",
      { housing: true },
    ),
    TauCaptiveHousing: new CityAction(
      "Tau Captive Housing",
      "tauceti",
      "captive_housing",
      "tau_home",
    ),
    TauPylon: new Action("Tau Pylon", "tauceti", "pylon", "tau_home"),
    TauCloning: new ResourceAction(
      "Tau Cloning",
      "tauceti",
      "cloning_facility",
      "tau_home",
      "Population",
      { housing: true },
    ),
    TauForgeHorseshoe: new ResourceAction(
      "Tau Horseshoe",
      "tauceti",
      "horseshoe",
      "tau_home",
      "Horseshoe",
      { housing: true, garrison: true },
    ),
    TauAssembly: new ResourceAction(
      "Tau Assembly",
      "tauceti",
      "assembly",
      "tau_home",
      "Population",
      { housing: true, important: true },
    ),
    TauNaniteFactory: new CityAction(
      "Tau Nanite Factory",
      "tauceti",
      "nanite_factory",
      "tau_home",
    ),
    TauFarm: new Action(
      "Tau High-Tech Farm",
      "tauceti",
      "tau_farm",
      "tau_home",
    ),
    TauMiningPit: new Action(
      "Tau Mining Pit",
      "tauceti",
      "mining_pit",
      "tau_home",
      { smart: true },
    ),
    TauExcavate: new Action("Tau Excavate", "tauceti", "excavate", "tau_home"),
    TauAlienOutpost: new Action(
      "Tau Alien Outpost",
      "tauceti",
      "alien_outpost",
      "tau_home",
      { knowledge: true },
    ),
    TauJumpGate: new Action(
      "Tau Jump Gate",
      "tauceti",
      "jump_gate",
      "tau_home",
      { multiSegmented: true },
    ),
    TauFusionGenerator: new Action(
      "Tau Fusion Generator",
      "tauceti",
      "fusion_generator",
      "tau_home",
    ),
    TauRepository: new Action(
      "Tau Repository",
      "tauceti",
      "repository",
      "tau_home",
    ),
    TauFactory: new Action(
      "Tau High-Tech Factory",
      "tauceti",
      "tau_factory",
      "tau_home",
    ),
    TauDiseaseLab: new Action(
      "Tau Disease Lab",
      "tauceti",
      "infectious_disease_lab",
      "tau_home",
      { knowledge: true },
    ),
    TauCasino: new Action(
      "Tau Casino",
      "tauceti",
      "tauceti_casino",
      "tau_home",
    ),
    TauCulturalCenter: new Action(
      "Tau Cultural Center",
      "tauceti",
      "tau_cultural_center",
      "tau_home",
    ),

    TauRedMission: new Action(
      "Tau Red Mission",
      "tauceti",
      "red_mission",
      "tau_red",
    ),
    TauRedOrbitalPlatform: new Action(
      "Tau Red Orbital Platform",
      "tauceti",
      "orbital_platform",
      "tau_red",
    ),
    TauRedContact: new Action(
      "Tau Red Contact",
      "tauceti",
      "contact",
      "tau_red",
    ),
    TauRedIntroduce: new Action(
      "Tau Red Introduce",
      "tauceti",
      "introduce",
      "tau_red",
    ),
    TauRedSubjugate: new Action(
      "Tau Red Subjugate",
      "tauceti",
      "subjugate",
      "tau_red",
    ),
    TauRedJeff: new Action("Tau Red Jeff", "tauceti", "jeff", "tau_red"),
    TauRedOverseer: new Action(
      "Tau Red Overseer",
      "tauceti",
      "overseer",
      "tau_red",
      { smart: true },
    ),
    TauRedWomlingVillage: new Action(
      "Tau Red Womling Village",
      "tauceti",
      "womling_village",
      "tau_red",
    ),
    TauRedWomlingFarm: new Action(
      "Tau Red Womling Farm",
      "tauceti",
      "womling_farm",
      "tau_red",
      { smart: true },
    ),
    TauRedWomlingMine: new Action(
      "Tau Red Womling Mine",
      "tauceti",
      "womling_mine",
      "tau_red",
      { smart: true },
    ),
    TauRedWomlingFun: new Action(
      "Tau Red Womling Theater",
      "tauceti",
      "womling_fun",
      "tau_red",
      { smart: true },
    ),
    TauRedWomlingLab: new Action(
      "Tau Red Womling Lab",
      "tauceti",
      "womling_lab",
      "tau_red",
      { smart: true, knowledge: true },
    ),

    TauGasContest: new Action(
      "Tau Gas Naming Contest",
      "tauceti",
      "gas_contest",
      "tau_gas",
    ),
    TauGasName1: new Action(
      "Tau Gas Name 1",
      "tauceti",
      "gas_contest-a1",
      "tau_gas",
      { random: true },
    ),
    TauGasName2: new Action(
      "Tau Gas Name 2",
      "tauceti",
      "gas_contest-a2",
      "tau_gas",
      { random: true },
    ),
    TauGasName3: new Action(
      "Tau Gas Name 3",
      "tauceti",
      "gas_contest-a3",
      "tau_gas",
      { random: true },
    ),
    TauGasName4: new Action(
      "Tau Gas Name 4",
      "tauceti",
      "gas_contest-a4",
      "tau_gas",
      { random: true },
    ),
    TauGasName5: new Action(
      "Tau Gas Name 5",
      "tauceti",
      "gas_contest-a5",
      "tau_gas",
      { random: true },
    ),
    TauGasName6: new Action(
      "Tau Gas Name 6",
      "tauceti",
      "gas_contest-a6",
      "tau_gas",
      { random: true },
    ),
    TauGasName7: new Action(
      "Tau Gas Name 7",
      "tauceti",
      "gas_contest-a7",
      "tau_gas",
      { random: true },
    ),
    TauGasName8: new Action(
      "Tau Gas Name 8",
      "tauceti",
      "gas_contest-a8",
      "tau_gas",
      { random: true },
    ),
    TauGasRefuelingStation: new Action(
      "Tau Gas Refueling Station",
      "tauceti",
      "refueling_station",
      "tau_gas",
    ),
    TauGasOreRefinery: new Action(
      "Tau Gas Ore Refinery",
      "tauceti",
      "ore_refinery",
      "tau_gas",
    ),
    TauGasWhalingStation: new Action(
      "Tau Gas Whale Processor",
      "tauceti",
      "whaling_station",
      "tau_gas",
      { smart: true },
    ),
    TauGasWomlingStation: new Action(
      "Tau Gas Womling Station",
      "tauceti",
      "womling_station",
      "tau_gas",
    ),

    TauBeltMission: new Action(
      "Tau Belt Mission",
      "tauceti",
      "roid_mission",
      "tau_roid",
    ),
    TauBeltPatrolShip: new Action(
      "Tau Belt Patrol Ship",
      "tauceti",
      "patrol_ship",
      "tau_roid",
    ),
    TauBeltMiningShip: new Action(
      "Tau Belt Extractor Ship",
      "tauceti",
      "mining_ship",
      "tau_roid",
    ),
    TauBeltWhalingShip: new Action(
      "Tau Belt Whaling Ship",
      "tauceti",
      "whaling_ship",
      "tau_roid",
    ),

    TauGas2Contest: new Action(
      "Tau Gas 2 Naming Contest",
      "tauceti",
      "gas_contest2",
      "tau_gas2",
    ),
    TauGas2Name1: new Action(
      "Tau Gas 2 Name 1",
      "tauceti",
      "gas_contest-b1",
      "tau_gas2",
      { random: true },
    ),
    TauGas2Name2: new Action(
      "Tau Gas 2 Name 2",
      "tauceti",
      "gas_contest-b2",
      "tau_gas2",
      { random: true },
    ),
    TauGas2Name3: new Action(
      "Tau Gas 2 Name 3",
      "tauceti",
      "gas_contest-b3",
      "tau_gas2",
      { random: true },
    ),
    TauGas2Name4: new Action(
      "Tau Gas 2 Name 4",
      "tauceti",
      "gas_contest-b4",
      "tau_gas2",
      { random: true },
    ),
    TauGas2Name5: new Action(
      "Tau Gas 2 Name 5",
      "tauceti",
      "gas_contest-b5",
      "tau_gas2",
      { random: true },
    ),
    TauGas2Name6: new Action(
      "Tau Gas 2 Name 6",
      "tauceti",
      "gas_contest-b6",
      "tau_gas2",
      { random: true },
    ),
    TauGas2Name7: new Action(
      "Tau Gas 2 Name 7",
      "tauceti",
      "gas_contest-b7",
      "tau_gas2",
      { random: true },
    ),
    TauGas2Name8: new Action(
      "Tau Gas 2 Name 8",
      "tauceti",
      "gas_contest-b8",
      "tau_gas2",
      { random: true },
    ),
    TauGas2AlienSurvey: new Action(
      "Tau Gas 2 Alien Station (Survey)",
      "tauceti",
      "alien_station_survey",
      "tau_gas2",
    ),
    TauGas2AlienStation: new Action(
      "Tau Gas 2 Alien Station",
      "tauceti",
      "alien_station",
      "tau_gas2",
      { multiSegmented: true },
    ),
    TauGas2AlienSpaceStation: new Action(
      "Tau Gas 2 Alien Space Station",
      "tauceti",
      "alien_space_station",
      "tau_gas2",
    ),
    TauGas2MatrioshkaBrain: new Action(
      "Tau Gas 2 Matrioshka Brain",
      "tauceti",
      "matrioshka_brain",
      "tau_gas2",
      { multiSegmented: true },
    ),
    TauGas2IgnitionDevice: new Action(
      "Tau Gas 2 Ignition Device",
      "tauceti",
      "ignition_device",
      "tau_gas2",
      { multiSegmented: true },
    ),
    TauGas2IgniteGasGiant: new Action(
      "Tau Gas 2 Ignite Gas Giant",
      "tauceti",
      "ignite_gas_giant",
      "tau_gas2",
      { prestige: true },
    ),

    AlphaMission: new Action(
      "Alpha Centauri Mission",
      "interstellar",
      "alpha_mission",
      "int_alpha",
    ),
    AlphaStarport: new Action(
      "Alpha Starport",
      "interstellar",
      "starport",
      "int_alpha",
    ),
    AlphaHabitat: new Action(
      "Alpha Habitat",
      "interstellar",
      "habitat",
      "int_alpha",
      { housing: true },
    ),
    AlphaMiningDroid: new Action(
      "Alpha Mining Droid",
      "interstellar",
      "mining_droid",
      "int_alpha",
    ),
    AlphaProcessing: new Action(
      "Alpha Processing Facility",
      "interstellar",
      "processing",
      "int_alpha",
    ),
    AlphaFusion: new Action(
      "Alpha Fusion Reactor",
      "interstellar",
      "fusion",
      "int_alpha",
    ),
    AlphaLaboratory: new Action(
      "Alpha Laboratory",
      "interstellar",
      "laboratory",
      "int_alpha",
      { knowledge: true },
    ),
    AlphaExchange: new Action(
      "Alpha Exchange",
      "interstellar",
      "exchange",
      "int_alpha",
    ),
    AlphaGraphenePlant: new Action(
      "Alpha Graphene Plant",
      "interstellar",
      "g_factory",
      "int_alpha",
    ),
    AlphaWarehouse: new Action(
      "Alpha Warehouse",
      "interstellar",
      "warehouse",
      "int_alpha",
    ),
    AlphaMegaFactory: new Action(
      "Alpha Mega Factory",
      "interstellar",
      "int_factory",
      "int_alpha",
    ),
    AlphaLuxuryCondo: new Action(
      "Alpha Luxury Condo",
      "interstellar",
      "luxury_condo",
      "int_alpha",
      { housing: true },
    ),
    AlphaExoticZoo: new Action(
      "Alpha Exotic Zoo",
      "interstellar",
      "zoo",
      "int_alpha",
    ),

    ProximaMission: new Action(
      "Proxima Mission",
      "interstellar",
      "proxima_mission",
      "int_proxima",
    ),
    ProximaTransferStation: new Action(
      "Proxima Transfer Station",
      "interstellar",
      "xfer_station",
      "int_proxima",
    ),
    ProximaCargoYard: new Action(
      "Proxima Cargo Yard",
      "interstellar",
      "cargo_yard",
      "int_proxima",
    ),
    ProximaCruiser: new Action(
      "Proxima Patrol Cruiser",
      "interstellar",
      "cruiser",
      "int_proxima",
      { garrison: true },
    ),
    ProximaDyson: new Action(
      "Proxima Dyson Sphere (Adamantite)",
      "interstellar",
      "dyson",
      "int_proxima",
      { multiSegmented: true },
    ),
    ProximaDysonSphere: new Action(
      "Proxima Dyson Sphere (Bolognium)",
      "interstellar",
      "dyson_sphere",
      "int_proxima",
      { multiSegmented: true },
    ),
    ProximaOrichalcumSphere: new Action(
      "Proxima Dyson Sphere (Orichalcum)",
      "interstellar",
      "orichalcum_sphere",
      "int_proxima",
      { multiSegmented: true },
    ),
    ProximaElysaniteSphere: new Action(
      "Proxima Dyson Sphere (Elysanite)",
      "interstellar",
      "elysanite_sphere",
      "int_proxima",
      { multiSegmented: true },
    ),

    NebulaMission: new Action(
      "Nebula Mission",
      "interstellar",
      "nebula_mission",
      "int_nebula",
    ),
    NebulaNexus: new Action(
      "Nebula Nexus",
      "interstellar",
      "nexus",
      "int_nebula",
    ),
    NebulaHarvester: new Action(
      "Nebula Harvester",
      "interstellar",
      "harvester",
      "int_nebula",
      { smart: true },
    ),
    NebulaEleriumProspector: new Action(
      "Nebula Elerium Prospector",
      "interstellar",
      "elerium_prospector",
      "int_nebula",
    ),

    NeutronMission: new Action(
      "Neutron Mission",
      "interstellar",
      "neutron_mission",
      "int_neutron",
    ),
    NeutronMiner: new Action(
      "Neutron Miner",
      "interstellar",
      "neutron_miner",
      "int_neutron",
    ),
    NeutronCitadel: new Action(
      "Neutron Citadel Station",
      "interstellar",
      "citadel",
      "int_neutron",
    ),
    NeutronStellarForge: new Action(
      "Neutron Stellar Forge",
      "interstellar",
      "stellar_forge",
      "int_neutron",
    ),

    Blackhole: new Action(
      "Blackhole Mission",
      "interstellar",
      "blackhole_mission",
      "int_blackhole",
    ),
    BlackholeFarReach: new Action(
      "Blackhole Farpoint",
      "interstellar",
      "far_reach",
      "int_blackhole",
      { knowledge: true },
    ),
    BlackholeStellarEngine: new Action(
      "Blackhole Stellar Engine",
      "interstellar",
      "stellar_engine",
      "int_blackhole",
      { multiSegmented: true },
    ),
    BlackholeMassEjector: new Action(
      "Blackhole Mass Ejector",
      "interstellar",
      "mass_ejector",
      "int_blackhole",
    ),

    BlackholeJumpShip: new Action(
      "Blackhole Jump Ship",
      "interstellar",
      "jump_ship",
      "int_blackhole",
    ),
    BlackholeWormholeMission: new Action(
      "Blackhole Wormhole Mission",
      "interstellar",
      "wormhole_mission",
      "int_blackhole",
    ),
    BlackholeStargate: new Action(
      "Blackhole Stargate",
      "interstellar",
      "stargate",
      "int_blackhole",
      { multiSegmented: true },
    ),
    BlackholeStargateComplete: new Action(
      "Blackhole Stargate (Complete)",
      "interstellar",
      "s_gate",
      "int_blackhole",
    ),

    SiriusMission: new Action(
      "Sirius Mission",
      "interstellar",
      "sirius_mission",
      "int_sirius",
    ),
    SiriusAnalysis: new Action(
      "Sirius B Analysis",
      "interstellar",
      "sirius_b",
      "int_sirius",
    ),
    SiriusSpaceElevator: new Action(
      "Sirius Space Elevator",
      "interstellar",
      "space_elevator",
      "int_sirius",
      { multiSegmented: true },
    ),
    SiriusGravityDome: new Action(
      "Sirius Gravity Dome",
      "interstellar",
      "gravity_dome",
      "int_sirius",
      { multiSegmented: true },
    ),
    SiriusAscensionMachine: new Action(
      "Sirius Ascension Machine",
      "interstellar",
      "ascension_machine",
      "int_sirius",
      { multiSegmented: true },
    ),
    SiriusAscensionTrigger: new Action(
      "Sirius Ascension Machine (Complete)",
      "interstellar",
      "ascension_trigger",
      "int_sirius",
      { smart: true },
    ),
    SiriusAscend: new Action(
      "Sirius Ascend",
      "interstellar",
      "ascend",
      "int_sirius",
      { prestige: true },
    ),
    SiriusThermalCollector: new Action(
      "Sirius Thermal Collector",
      "interstellar",
      "thermal_collector",
      "int_sirius",
    ),

    GatewayMission: new Action(
      "Gateway Mission",
      "galaxy",
      "gateway_mission",
      "gxy_gateway",
    ),
    GatewayStarbase: new Action(
      "Gateway Starbase",
      "galaxy",
      "starbase",
      "gxy_gateway",
      { garrison: true },
    ),
    GatewayShipDock: new Action(
      "Gateway Ship Dock",
      "galaxy",
      "ship_dock",
      "gxy_gateway",
    ),

    BologniumShip: new Action(
      "Gateway Bolognium Ship",
      "galaxy",
      "bolognium_ship",
      "gxy_gateway",
      { ship: true, smart: true },
    ),
    ScoutShip: new Action(
      "Gateway Scout Ship",
      "galaxy",
      "scout_ship",
      "gxy_gateway",
      { ship: true, smart: true },
    ),
    CorvetteShip: new Action(
      "Gateway Corvette Ship",
      "galaxy",
      "corvette_ship",
      "gxy_gateway",
      { ship: true, smart: true },
    ),
    FrigateShip: new Action(
      "Gateway Frigate Ship",
      "galaxy",
      "frigate_ship",
      "gxy_gateway",
      { ship: true },
    ),
    CruiserShip: new Action(
      "Gateway Cruiser Ship",
      "galaxy",
      "cruiser_ship",
      "gxy_gateway",
      { ship: true },
    ),
    Dreadnought: new Action(
      "Gateway Dreadnought",
      "galaxy",
      "dreadnought",
      "gxy_gateway",
      { ship: true },
    ),

    StargateStation: new Action(
      "Stargate Station",
      "galaxy",
      "gateway_station",
      "gxy_stargate",
    ),
    StargateTelemetryBeacon: new Action(
      "Stargate Telemetry Beacon",
      "galaxy",
      "telemetry_beacon",
      "gxy_stargate",
      { knowledge: true },
    ),
    StargateDepot: new Action(
      "Stargate Depot",
      "galaxy",
      "gateway_depot",
      "gxy_stargate",
    ),
    StargateDefensePlatform: new Action(
      "Stargate Defense Platform",
      "galaxy",
      "defense_platform",
      "gxy_stargate",
    ),

    GorddonMission: new Action(
      "Gorddon Mission",
      "galaxy",
      "gorddon_mission",
      "gxy_gorddon",
    ),
    GorddonEmbassy: new Action(
      "Gorddon Embassy",
      "galaxy",
      "embassy",
      "gxy_gorddon",
      { housing: true },
    ),
    GorddonDormitory: new Action(
      "Gorddon Dormitory",
      "galaxy",
      "dormitory",
      "gxy_gorddon",
      { housing: true },
    ),
    GorddonSymposium: new Action(
      "Gorddon Symposium",
      "galaxy",
      "symposium",
      "gxy_gorddon",
      { knowledge: true },
    ),
    GorddonFreighter: new Action(
      "Gorddon Freighter",
      "galaxy",
      "freighter",
      "gxy_gorddon",
      { ship: true },
    ),

    Alien1Consulate: new Action(
      "Alien 1 Consulate",
      "galaxy",
      "consulate",
      "gxy_alien1",
      { housing: true },
    ),
    Alien1Resort: new Action(
      "Alien 1 Resort",
      "galaxy",
      "resort",
      "gxy_alien1",
    ),
    Alien1VitreloyPlant: new Action(
      "Alien 1 Vitreloy Plant",
      "galaxy",
      "vitreloy_plant",
      "gxy_alien1",
      { smart: true },
    ),
    Alien1SuperFreighter: new Action(
      "Alien 1 Super Freighter",
      "galaxy",
      "super_freighter",
      "gxy_alien1",
      { ship: true },
    ),

    Alien2Mission: new Action(
      "Alien 2 Mission",
      "galaxy",
      "alien2_mission",
      "gxy_alien2",
    ),
    Alien2Foothold: new Action(
      "Alien 2 Foothold",
      "galaxy",
      "foothold",
      "gxy_alien2",
    ),
    Alien2ArmedMiner: new Action(
      "Alien 2 Armed Miner",
      "galaxy",
      "armed_miner",
      "gxy_alien2",
      { ship: true, smart: true },
    ),
    Alien2OreProcessor: new Action(
      "Alien 2 Ore Processor",
      "galaxy",
      "ore_processor",
      "gxy_alien2",
    ),
    Alien2Scavenger: new Action(
      "Alien 2 Scavenger",
      "galaxy",
      "scavenger",
      "gxy_alien2",
      { knowledge: true, ship: true },
    ),

    ChthonianMission: new Action(
      "Chthonian Mission",
      "galaxy",
      "chthonian_mission",
      "gxy_chthonian",
    ),
    ChthonianMineLayer: new Action(
      "Chthonian Mine Layer",
      "galaxy",
      "minelayer",
      "gxy_chthonian",
      { ship: true, smart: true },
    ),
    ChthonianExcavator: new Action(
      "Chthonian Excavator",
      "galaxy",
      "excavator",
      "gxy_chthonian",
      { smart: true },
    ),
    ChthonianRaider: new Action(
      "Chthonian Corsair",
      "galaxy",
      "raider",
      "gxy_chthonian",
      { ship: true, smart: true },
    ),

    PortalTurret: new Action(
      "Portal Laser Turret",
      "portal",
      "turret",
      "prtl_fortress",
    ),
    PortalCarport: new Action(
      "Portal Surveyor Carport",
      "portal",
      "carport",
      "prtl_fortress",
    ),
    PortalWarDroid: new Action(
      "Portal War Droid",
      "portal",
      "war_droid",
      "prtl_fortress",
    ),
    PortalRepairDroid: new Action(
      "Portal Repair Droid",
      "portal",
      "repair_droid",
      "prtl_fortress",
    ),

    BadlandsPredatorDrone: new Action(
      "Badlands Predator Drone",
      "portal",
      "war_drone",
      "prtl_badlands",
    ),
    BadlandsSensorDrone: new Action(
      "Badlands Sensor Drone",
      "portal",
      "sensor_drone",
      "prtl_badlands",
    ),
    BadlandsAttractor: new Action(
      "Badlands Attractor Beacon",
      "portal",
      "attractor",
      "prtl_badlands",
      { smart: true },
    ),
    BadlandsMinions: new Action(
      "Badlands Minions Lair (Warlord)",
      "portal",
      "minions",
      "prtl_badlands",
    ),
    BadlandsReaper: new Action(
      "Badlands Soul Reaper (Warlord)",
      "portal",
      "reaper",
      "prtl_badlands",
    ),
    BadlandsCorpsePile: new Action(
      "Badlands Corpse Pile (Warlord)",
      "portal",
      "corpse_pile",
      "prtl_badlands",
    ),
    BadlandsMortuary: new Action(
      "Badlands Mortuary (Warlord)",
      "portal",
      "mortuary",
      "prtl_badlands",
    ),
    BadlandsCodex: new Action(
      "Badlands Create Codex (Warlord)",
      "portal",
      "codex",
      "prtl_badlands",
    ),

    WastelandThrone: new Action(
      "Wasteland Throne of Evil (Warlord)",
      "portal",
      "throne",
      "prtl_wasteland",
    ),
    WastelandIncinerator: new Action(
      "Wasteland Incinerator (Warlord)",
      "portal",
      "incinerator",
      "prtl_wasteland",
    ),
    WastelandWarehouse: new Action(
      "Wasteland Warehouse (Warlord)",
      "portal",
      "warehouse",
      "prtl_wasteland",
    ),
    WastelandHovel: new Action(
      "Wasteland Hellspawn Hovel (Warlord)",
      "portal",
      "hovel",
      "prtl_wasteland",
      { housing: true },
    ),
    WastelandHellCasino: new Action(
      "Wasteland Den of Sin (Warlord)",
      "portal",
      "hell_casino",
      "prtl_wasteland",
    ),
    WastelandTwistedLab: new Action(
      "Wasteland Twisted Lab (Warlord)",
      "portal",
      "twisted_lab",
      "prtl_wasteland",
      { knowledge: true },
    ),
    WastelandDemonForge: new Action(
      "Wasteland Demon Forge (Warlord)",
      "portal",
      "demon_forge",
      "prtl_wasteland",
    ),
    WastelandHellFactory: new Action(
      "Wasteland Terror Factory (Warlord)",
      "portal",
      "hell_factory",
      "prtl_wasteland",
    ),
    WastelandPumpjack: new Action(
      "Wasteland Hellish Pumpjack (Warlord)",
      "portal",
      "pumpjack",
      "prtl_wasteland",
    ),
    WastelandDigDemon: new Action(
      "Wasteland Dig Demon Burrow (Warlord)",
      "portal",
      "dig_demon",
      "prtl_wasteland",
    ),
    WastelandTunneler: new Action(
      "Wasteland Tunneler Demon (Warlord)",
      "portal",
      "tunneler",
      "prtl_wasteland",
    ),
    WastelandBrute: new Action(
      "Wasteland Brute Hut (Warlord)",
      "portal",
      "brute",
      "prtl_wasteland",
      { garrison: true },
    ),
    WastelandAltar: new CityAction(
      "Wasteland Sacrificial Altar (Warlord)",
      "portal",
      "s_alter",
      "prtl_wasteland",
    ),
    WastelandShrine: new CityAction(
      "Wasteland Shrine (Warlord)",
      "portal",
      "shrine",
      "prtl_wasteland",
    ),
    WastelandMeditationChamber: new CityAction(
      "Wasteland Meditation Chamber (Warlord)",
      "portal",
      "meditation",
      "prtl_wasteland",
    ),

    PitMission: new Action("Pit Mission", "portal", "pit_mission", "prtl_pit"),
    PitAssaultForge: new Action(
      "Pit Assault Forge",
      "portal",
      "assault_forge",
      "prtl_pit",
    ),
    PitSoulForge: new Action(
      "Pit Soul Forge",
      "portal",
      "soul_forge",
      "prtl_pit",
    ),
    PitGunEmplacement: new Action(
      "Pit Gun Emplacement",
      "portal",
      "gun_emplacement",
      "prtl_pit",
    ),
    PitSoulAttractor: new Action(
      "Pit Soul Attractor",
      "portal",
      "soul_attractor",
      "prtl_pit",
    ),
    PitSoulCapacitor: new Action(
      "Pit Soul Capacitor (Witch Hunting)",
      "portal",
      "soul_capacitor",
      "prtl_pit",
    ),
    PitAbsorptionChamber: new Action(
      "Pit Absorption Chamber (Witch Hunting)",
      "portal",
      "absorption_chamber",
      "prtl_pit",
    ),
    PitShadowMine: new Action(
      "Pit Shadow Mine (Warlord)",
      "portal",
      "shadow_mine",
      "prtl_pit",
    ),
    PitTavern: new Action(
      "Pit Tavern (Warlord)",
      "portal",
      "tavern",
      "prtl_pit",
    ),

    RuinsMission: new Action(
      "Ruins Mission",
      "portal",
      "ruins_mission",
      "prtl_ruins",
    ),
    RuinsGuardPost: new Action(
      "Ruins Guard Post",
      "portal",
      "guard_post",
      "prtl_ruins",
      { smart: true },
    ),
    RuinsVault: new Action("Ruins Vault", "portal", "vault", "prtl_ruins"),
    RuinsWarVault: new Action(
      "Ruins Vault (Warlord)",
      "portal",
      "war_vault",
      "prtl_ruins",
    ),
    RuinsArchaeology: new Action(
      "Ruins Archaeology",
      "portal",
      "archaeology",
      "prtl_ruins",
    ),
    RuinsArcology: new Action(
      "Ruins Arcology",
      "portal",
      "arcology",
      "prtl_ruins",
    ),
    RuinsHellForge: new Action(
      "Ruins Infernal Forge",
      "portal",
      "hell_forge",
      "prtl_ruins",
    ),
    RuinsInfernoPower: new Action(
      "Ruins Inferno Reactor",
      "portal",
      "inferno_power",
      "prtl_ruins",
    ),
    RuinsAncientPillars: new Pillar(
      "Ruins Ancient Pillars",
      "portal",
      "ancient_pillars",
      "prtl_ruins",
    ),

    GateMission: new Action(
      "Gate Mission",
      "portal",
      "gate_mission",
      "prtl_gate",
    ),
    GateEastTower: new Action(
      "Gate East Tower",
      "portal",
      "east_tower",
      "prtl_gate",
      { multiSegmented: true },
    ),
    GateWestTower: new Action(
      "Gate West Tower",
      "portal",
      "west_tower",
      "prtl_gate",
      { multiSegmented: true },
    ),
    GateTurret: new Action("Gate Turret", "portal", "gate_turret", "prtl_gate"),
    GateInferniteMine: new Action(
      "Gate Infernite Mine",
      "portal",
      "infernite_mine",
      "prtl_gate",
    ),

    LakeMission: new Action(
      "Lake Mission",
      "portal",
      "lake_mission",
      "prtl_lake",
    ),
    LakeHarbor: new Action("Lake Harbor", "portal", "harbor", "prtl_lake", {
      smart: true,
    }),
    LakeCoolingTower: new Action(
      "Lake Cooling Tower",
      "portal",
      "cooling_tower",
      "prtl_lake",
      { smart: true },
    ),
    LakeBireme: new Action(
      "Lake Bireme Warship",
      "portal",
      "bireme",
      "prtl_lake",
      { smart: true },
    ),
    LakeTransport: new Action(
      "Lake Transport",
      "portal",
      "transport",
      "prtl_lake",
      { smart: true },
    ),
    LakeOven: new Action(
      "Lake Cooker (Fasting)",
      "portal",
      "oven",
      "prtl_lake",
    ),
    LakeOvenComplete: new Action(
      "Lake Cooker (Fasting, Complete)",
      "portal",
      "oven_complete",
      "prtl_lake",
    ),
    LakeSoulSteeper: new Action(
      "Lake Soul Steeper (Fasting)",
      "portal",
      "dish_soul_steeper",
      "prtl_lake",
    ),
    LakeLifeInfuser: new Action(
      "Lake Life Infuser (Fasting)",
      "portal",
      "dish_life_infuser",
      "prtl_lake",
    ),
    LakeDevilishDish: new Action(
      "Lake Devilish Dish (Fasting)",
      "portal",
      "devilish_dish",
      "prtl_lake",
    ),

    SpireMission: new Action(
      "Spire Mission",
      "portal",
      "spire_mission",
      "prtl_spire",
    ),
    SpirePurifier: new Action(
      "Spire Purifier",
      "portal",
      "purifier",
      "prtl_spire",
      { smart: true },
    ),
    SpirePort: new Action("Spire Port", "portal", "port", "prtl_spire", {
      smart: true,
    }),
    SpireBaseCamp: new Action(
      "Spire Base Camp",
      "portal",
      "base_camp",
      "prtl_spire",
      { smart: true },
    ),
    SpireBridge: new Action("Spire Bridge", "portal", "bridge", "prtl_spire"),
    SpireSphinx: new Action("Spire Sphinx", "portal", "sphinx", "prtl_spire"),
    SpireBribeSphinx: new Action(
      "Spire Bribe Sphinx",
      "portal",
      "bribe_sphinx",
      "prtl_spire",
    ),
    SpireSurveyTower: new Action(
      "Spire Survey Tower",
      "portal",
      "spire_survey",
      "prtl_spire",
    ),
    SpireMechBay: new Action(
      "Spire Mech Bay",
      "portal",
      "mechbay",
      "prtl_spire",
      { smart: true },
    ),
    SpireTower: new Action("Spire Tower", "portal", "spire", "prtl_spire"),
    SpireWaygate: new Action(
      "Spire Waygate",
      "portal",
      "waygate",
      "prtl_spire",
      { smart: true },
    ),
    SpireEdenicGate: new Action(
      "Spire Edenic Gate",
      "portal",
      "edenic_gate",
      "prtl_spire",
    ),
    SpireBazaar: new Action(
      "Spire Bazaar (Warlord)",
      "portal",
      "bazaar",
      "prtl_spire",
    ),

    AsphodelMission: new Action(
      "Asphodel Mission",
      "eden",
      "survery_meadows",
      "eden_asphodel",
    ),
    AsphodelEncampment: new Action(
      "Asphodel Encampment",
      "eden",
      "encampment",
      "eden_asphodel",
    ),
    AsphodelSoulEngine: new Action(
      "Asphodel Soul Engine",
      "eden",
      "soul_engine",
      "eden_asphodel",
    ),
    AsphodelMechStation: new Action(
      "Asphodel Mech Station",
      "eden",
      "mech_station",
      "eden_asphodel",
      { multiSegmented: true },
    ),
    AsphodelHarvester: new Action(
      "Asphodel Harvester",
      "eden",
      "asphodel_harvester",
      "eden_asphodel",
      { smart: true },
    ),
    AsphodelProcessor: new Action(
      "Asphodel Muon Processor",
      "eden",
      "ectoplasm_processor",
      "eden_asphodel",
    ),
    AsphodelResearchStation: new Action(
      "Asphodel Research Station",
      "eden",
      "research_station",
      "eden_asphodel",
    ),
    AsphodelWarehouse: new Action(
      "Asphodel Warehouse",
      "eden",
      "warehouse",
      "eden_asphodel",
    ),
    AsphodelStabilizer: new Action(
      "Asphodel Stabilizer",
      "eden",
      "stabilizer",
      "eden_asphodel",
    ),
    AsphodelRuneGate: new Action(
      "Asphodel Rune Gate",
      "eden",
      "rune_gate",
      "eden_asphodel",
      { multiSegmented: true },
    ),
    AsphodelRuneGateOpen: new Action(
      "Asphodel Rune Gate (Complete)",
      "eden",
      "rune_gate_open",
      "eden_asphodel",
    ),
    AsphodelBunker: new Action(
      "Asphodel Bunker",
      "eden",
      "bunker",
      "eden_asphodel",
      { garrison: true },
    ),
    AsphodelBlissDen: new Action(
      "Asphodel Bliss Den",
      "eden",
      "bliss_den",
      "eden_asphodel",
    ),
    AsphodelRectory: new Action(
      "Asphodel Rectory",
      "eden",
      "rectory",
      "eden_asphodel",
      { housing: true },
    ),
    AsphodelCorruptor: new Action(
      "Asphodel Corruptor (Warlord)",
      "eden",
      "corruptor",
      "eden_asphodel",
    ),

    ElysiumMission: new Action(
      "Elysium Mission",
      "eden",
      "survey_fields",
      "eden_elysium",
    ),
    ElysiumFortress: new Action(
      "Elysium Celestial Fortress",
      "eden",
      "fortress",
      "eden_elysium",
    ),
    ElysiumSiege: new Action(
      "Elysium Siege Fortress",
      "eden",
      "siege_fortress",
      "eden_elysium",
    ),
    ElysiumRaid: new Action(
      "Elysium Raid Supplies",
      "eden",
      "raid_supplies",
      "eden_elysium",
    ),
    ElysiumAmbush: new Action(
      "Elysium Ambush Patrol",
      "eden",
      "ambush_patrol",
      "eden_elysium",
    ),
    ElysiumRuinedFortress: new Action(
      "Elysium Ruined Fortress",
      "eden",
      "ruined_fortress",
      "eden_elysium",
    ),
    ElysiumScout: new Action(
      "Elysium Scout",
      "eden",
      "scout_elysium",
      "eden_elysium",
    ),
    ElysiumFireSupportBase: new Action(
      "Elysium Fire Support Base",
      "eden",
      "fire_support_base",
      "eden_elysium",
      { multiSegmented: true },
    ),
    ElysiumMine: new Action(
      "Elysium Mine",
      "eden",
      "elysanite_mine",
      "eden_elysium",
    ),
    ElysiumSacredSmelter: new Action(
      "Elysium Sacred Smelter",
      "eden",
      "sacred_smelter",
      "eden_elysium",
    ),
    ElysiumEleriumContainment: new Action(
      "Elysium Elerium Containment",
      "eden",
      "elerium_containment",
      "eden_elysium",
    ),
    ElysiumPillbox: new Action(
      "Elysium Pillbox",
      "eden",
      "pillbox",
      "eden_elysium",
    ), // TODO: Need some interaction with autoHell
    ElysiumRestaurant: new Action(
      "Elysium Restaurant",
      "eden",
      "restaurant",
      "eden_elysium",
    ),
    ElysiumEternalBank: new Action(
      "Elysium Eternal Bank",
      "eden",
      "eternal_bank",
      "eden_elysium",
    ),
    ElysiumArchive: new Action(
      "Elysium Archive",
      "eden",
      "archive",
      "eden_elysium",
    ),
    ElysiumNorthPier: new Action(
      "Elysium North Pier",
      "eden",
      "north_pier",
      "eden_elysium",
      { multiSegmented: true },
    ),
    ElysiumRushmore: new Action(
      "Elysium Rushmore",
      "eden",
      "rushmore",
      "eden_elysium",
    ),
    ElysiumReincarnation: new Action(
      "Elysium Reincarnation",
      "eden",
      "reincarnation",
      "eden_elysium",
    ),
    ElysiumCement: new Action(
      "Elysium Cement",
      "eden",
      "eden_cement",
      "eden_elysium",
    ),

    IsleSouthPier: new Action(
      "Isle South Pier",
      "eden",
      "south_pier",
      "eden_isle",
      { multiSegmented: true },
    ),
    IsleWestTower: new Action(
      "Isle West Tower",
      "eden",
      "west_tower",
      "eden_isle",
    ),
    IsleGarrison: new Action(
      "Isle Garrison",
      "eden",
      "isle_garrison",
      "eden_isle",
    ),
    IsleEastTower: new Action(
      "Isle East Tower",
      "eden",
      "east_tower",
      "eden_isle",
    ),
    IsleSpiritVacuum: new Action(
      "Isle Spirit Vacuum",
      "eden",
      "spirit_vacuum",
      "eden_isle",
    ),
    IsleSpiritBattery: new Action(
      "Isle Spirit Battery",
      "eden",
      "spirit_battery",
      "eden_isle",
    ),
    IsleSoulCompactor: new Action(
      "Isle Soul Compactor",
      "eden",
      "soul_compactor",
      "eden_isle",
    ),

    PalaceMission: new Action(
      "Palace Mission",
      "eden",
      "scout_palace",
      "eden_palace",
    ),
    PalaceThrone: new Action("Palace Throne", "eden", "throne", "eden_palace"),
    PalaceInfuser: new Action(
      "Palace Infuser",
      "eden",
      "infuser",
      "eden_palace",
      { multiSegmented: true },
    ),
    PalaceApotheosis: new Action(
      "Palace Apotheosis",
      "eden",
      "apotheosis",
      "eden_palace",
      { prestige: true },
    ),
    PalaceConduit: new Action(
      "Palace Conduit",
      "eden",
      "conduit",
      "eden_palace",
      { multiSegmented: true },
    ),
    PalaceTomb: new Action("Palace Tomb", "eden", "tomb", "eden_palace", {
      multiSegmented: true,
    }),
  };

  var linkedBuildings = [
    [buildings.LakeTransport, buildings.LakeBireme],
    [buildings.SpirePort, buildings.SpireBaseCamp],
  ];

  var projects = {
    LaunchFacility: new Project("Launch Facility", "launch_facility"),
    SuperCollider: new Project("Supercollider", "lhc"),
    StockExchange: new Project("Stock Exchange", "stock_exchange"),
    Monument: new Project("Monument", "monument"),
    Railway: new Project("Railway", "railway"),
    Nexus: new Project("Nexus", "nexus"),
    RoidEject: new Project("Asteroid Redirect", "roid_eject"),
    ManaSyphon: new Project("Mana Syphon", "syphon"),
    Depot: new Project("Depot", "tp_depot"),
  };

  const wrGlobalCondition = 0; // Generic condition will be checked once per tick. Takes nothing and return bool - whether following rule is applicable, or not
  const wrIndividualCondition = 1; // Individual condition, checks every building, and return any value; if value casts to true - rule aplies
  const wrDescription = 2; // Description displayed in tooltip when rule applied, takes return value of individual condition, and building
  const wrMultiplier = 3; // Weighting mulptiplier. Called first without any context; rules returning x1 also won't be checked
  const authorityCapBuildings = [
    buildings.Barracks,
    buildings.Temple,
    buildings.RedSpaceBarracks,
    buildings.ProximaCruiser,
    buildings.BeltSpaceStation,
    buildings.WastelandBrute,
    buildings.BadlandsMinions,
    buildings.WastelandThrone,
    buildings.AsphodelBunker,
  ];
  const INFLATION_CHALLENGE_MONEY = 25e10;
  const RETIREMENT_PREP = {
    fusionGenerators: 20,
    factories: 18,
    scienceLabs: 11,
    graphene: 200e6,
  };
  const inflationMoneyStorageBuildings = [
    buildings.Bank,
    buildings.Casino,
    buildings.HellSpaceCasino,
    buildings.TitanBank,
    buildings.TauCasino,
    buildings.AlphaExchange,
    buildings.RuinsVault,
    buildings.RuinsWarVault,
    buildings.WastelandHellCasino,
    buildings.ElysiumEternalBank,
  ];
  const inflationMoneyIncomeBuildings = [
    buildings.TouristCenter,
    buildings.Casino,
    buildings.HellSpaceCasino,
    buildings.TauCasino,
    buildings.AlphaLuxuryCondo,
    buildings.WastelandHellCasino,
  ];
  const galaxyCombatShips = [
    buildings.ScoutShip,
    buildings.CorvetteShip,
    buildings.FrigateShip,
    buildings.CruiserShip,
    buildings.Dreadnought,
  ];
  var weightingRules = [
    [
      () => !settings.autoBuild,
      () => true,
      () => "",
      () => 0, // Set weighting to zero right away, and skip all checks if autoBuild is disabled
    ],
    [
      () => true,
      (building) => !building.isUnlocked(),
      () => "Locked",
      () => 0, // Should always be on top, processing locked building may lead to issues
    ],
    [
      () => true,
      (building) => state.queuedTargets.includes(building),
      () => "Queued building, processing...",
      () => 0,
    ],
    [
      () => true,
      (building) => state.triggerTargets.includes(building),
      () => "Active trigger, processing...",
      () => 0,
    ],
    [
      () => true,
      (building) => !building.autoBuildEnabled,
      () => "AutoBuild disabled",
      () => 0,
    ],
    [
      () => true,
      (building) => building.count >= building.autoMax,
      () => "Maximum amount reached",
      () => 0,
    ],
    [
      () => true,
      (building) => !building.isAffordable(true),
      () => "",
      () => 0, // Red buildings need to be filtered out, so they won't prevent affordable buildings with lower weight from building
    ],
    [
      () =>
        game.global.race["truepath"] &&
        buildings.SpaceTestLaunch.isUnlocked() &&
        !haveTech("world_control"),
      (building) => {
        if (building === buildings.SpaceTestLaunch) {
          let sabotage = 1;
          for (let i = 0; i < 3; i++) {
            let gov = game.global.civic.foreign[`gov${i}`];
            if (!gov.occ && !gov.anx && !gov.buy) {
              sabotage++;
            }
          }
          return 1 / (sabotage + 1);
        }
      },
      (chance) => `${Math.round(chance * 100)}% chance of successful launch`,
      (chance) => (chance < 0.5 ? chance : 0),
    ],
    [
      () => settings.jobDisableMiners && buildings.GatewayStarbase.count > 0,
      (building) =>
        building === buildings.CoalMine ||
        (building === buildings.Mine &&
          !(game.global.race["sappy"] && game.global.race["smoldering"])),
      () => "Miners disabled in Andromeda",
      () => 0,
    ],
    [
      () => haveTech("piracy"),
      (building) =>
        building === buildings.StargateDefensePlatform &&
        buildings.StargateDefensePlatform.count * 20 >=
          (game.global.race["instinct"] ? 0.09 : 0.1) *
            game.global.tech.piracy *
            getPiracyMultiplier(),
      () => "Piracy fully supressed",
      () => 0,
    ],
    [
      () =>
        settings.autoFleet &&
        game.global.tech["piracy"] &&
        !galaxyAssaultPending(),
      (building) => {
        if (galaxyCombatShips.includes(building)) {
          let totalNeed = getGalaxyRegions().reduce(
            (sum, region) =>
              sum +
              (region.useful ? Math.max(0, region.piracy - region.armada) : 0),
            0,
          );
          return getGalaxyCombatShipPower() >= totalNeed;
        }
      },
      () => "Piracy fully covered by fleet",
      () => 0,
    ],
    [
      () =>
        settings.autoMech &&
        settings.mechBuild !== "none" &&
        settings.buildingMechsFirst &&
        buildings.SpireMechBay.count > 0 &&
        buildings.SpireMechBay.stateOffCount === 0,
      (building) => {
        if (building.cost["Supply"]) {
          if (MechManager.isActive) {
            return "Building mechs...";
          }
          let mechBay = game.global.portal.mechbay;
          let newSize = !haveTask("mech")
            ? settings.mechBuild === "random"
              ? MechManager.getPreferredSize()[0]
              : mechBay.blueprint.size
            : "titan";
          let [newGems, newSupply, newSpace] = MechManager.getMechCost({
            size: newSize,
          });
          if (
            newSpace <= mechBay.max - mechBay.bay &&
            newSupply <= resources.Supply.maxQuantity &&
            newGems <= resources.Soul_Gem.currentQuantity
          ) {
            return "Saving supplies for new mech";
          }
        }
      },
      (note) => note,
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "ascension" &&
        !game.global.race["witch_hunter"],
      (building) =>
        building === buildings.GateEastTower ||
        building === buildings.GateWestTower,
      () => "Not needed for Ascension prestige",
      () => 0,
    ],
    [
      () =>
        buildings.GateEastTower.isUnlocked() &&
        buildings.GateWestTower.isUnlocked() &&
        poly.hellSupression("gate").supress <
          settings.buildingTowerSuppression / 100,
      (building) =>
        building === buildings.GateEastTower ||
        building === buildings.GateWestTower,
      () => "Too low gate supression",
      () => 0,
    ],
    [
      () =>
        settings.prestigeType === "whitehole" &&
        settings.prestigeWhiteholeSaveGems,
      (building) => {
        if (
          building.cost["Soul_Gem"] >
          resources.Soul_Gem.currentQuantity - 10
        ) {
          return true;
        }
      },
      () => "Saving up Soul Gems for prestige",
      () => 0,
    ],
    [
      () => {
        return (
          buildings.GorddonFreighter.isAutoBuildable() &&
          buildings.GorddonFreighter.isAffordable(true) &&
          buildings.Alien1SuperFreighter.isAutoBuildable() &&
          buildings.Alien1SuperFreighter.isAffordable(true)
        );
      },
      (building) => {
        if (
          building === buildings.GorddonFreighter ||
          building === buildings.Alien1SuperFreighter
        ) {
          let regCount = buildings.GorddonFreighter.count;
          let regTotal =
            (1 + (regCount + 1) * 0.03) / (1 + regCount * 0.03) - 1;
          let regCrew = regTotal / 3;
          let supCount = buildings.Alien1SuperFreighter.count;
          let supTotal =
            (1 + (supCount + 1) * 0.08) / (1 + supCount * 0.08) - 1;
          let supCrew = supTotal / 5;
          if (building === buildings.GorddonFreighter && regCrew < supCrew) {
            return buildings.Alien1SuperFreighter;
          }
          if (
            building === buildings.Alien1SuperFreighter &&
            supCrew < regCrew
          ) {
            return buildings.GorddonFreighter;
          }
        }
      },
      (other) => `${other.title} gives more Money`,
      () => (settings.buildingsBestFreighter ? 0 : 1), // Find what's better - Freighter or Super Freighter
    ],
    [
      () => {
        return (
          buildings.LakeBireme.isAutoBuildable() &&
          buildings.LakeBireme.isAffordable(true) &&
          buildings.LakeTransport.isAutoBuildable() &&
          buildings.LakeTransport.isAffordable(true) &&
          resources.Lake_Support.rateOfChange <= 1
        ); // Build any if there's spare support
      },
      (building) => {
        if (
          building === buildings.LakeBireme ||
          building === buildings.LakeTransport
        ) {
          let biremeCount = buildings.LakeBireme.count;
          let transportCount = buildings.LakeTransport.count;
          let rating =
            game.global.blood["spire"] && game.global.blood.spire >= 2
              ? 0.8
              : 0.85;
          let nextBireme =
            (1 - rating ** (biremeCount + 1)) * (transportCount * 5);
          let nextTransport =
            (1 - rating ** biremeCount) * ((transportCount + 1) * 5);
          if (settings.buildingsTransportGem) {
            let currentSupply =
              (1 - rating ** biremeCount) * (transportCount * 5);
            nextBireme =
              (nextBireme - currentSupply) /
              buildings.LakeBireme.cost["Soul_Gem"];
            nextTransport =
              (nextTransport - currentSupply) /
              buildings.LakeTransport.cost["Soul_Gem"];
          }
          if (building === buildings.LakeBireme && nextBireme < nextTransport) {
            return buildings.LakeTransport;
          }
          if (
            building === buildings.LakeTransport &&
            nextTransport < nextBireme
          ) {
            return buildings.LakeBireme;
          }
        }
      },
      (other) => `${other.title} gives more Supplies`,
      () => 0, // Find what's better - Bireme or Transport
    ],
    [
      () => {
        return (
          buildings.SpirePort.isAutoBuildable() &&
          buildings.SpirePort.isAffordable(true) &&
          buildings.SpireBaseCamp.isAutoBuildable() &&
          buildings.SpireBaseCamp.isAffordable(true)
        );
      },
      (building) => {
        if (
          building === buildings.SpirePort ||
          building === buildings.SpireBaseCamp
        ) {
          let portCount = buildings.SpirePort.count;
          let baseCount = buildings.SpireBaseCamp.count;
          let nextPort = (portCount + 1) * (1 + baseCount * 0.4);
          let nextBase = portCount * (1 + (baseCount + 1) * 0.4);
          if (building === buildings.SpirePort && nextPort < nextBase) {
            return buildings.SpireBaseCamp;
          }
          if (building === buildings.SpireBaseCamp && nextBase < nextPort) {
            return buildings.SpirePort;
          }
        }
      },
      (other) => `${other.title} gives more Max Supplies`,
      () => 0, // Find what's better - Port or Base
    ],
    [
      () => haveTech("waygate", 2),
      (building) => building === buildings.SpireWaygate,
      () => "",
      () => 0, // We can't limit waygate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
    ],
    [
      () => haveTech("edenic", 3),
      (building) => building === buildings.SpireEdenicGate,
      () => "",
      () => 0, // We can't limit edenic gate using gameMax, as max here isn't constant. It start with 10, but after building count reduces down to 1
    ],
    [
      () => haveTech("elysium", 8),
      (building) => {
        if (building === buildings.ElysiumFireSupportBase) {
          if (haveTech("isle", 2)) {
            return "Garrison is destroyed";
          }
          if (!haveTech("elysium", 10) && building.count >= 100) {
            return "Missing Elerium Cannon tech";
          }
        }
      },
      (note) => note,
      () => 0, // Build up to 100, and then fire after researching cannon
    ],
    [
      () => haveTech("asphodel", 8),
      (building) =>
        building === buildings.AsphodelStabilizer &&
        building.count >= buildings.AsphodelWarehouse.count,
      () => "Can not exceed amount of Warehouses",
      () => 0,
    ],
    [
      () => haveTech("hell_spire", 8) || game.global.race["warlord"],
      (building) => building === buildings.SpireSphinx,
      () => "",
      () => 0, // Sphinx not usable after solving / Harmachis not usable during Warlord
    ],
    [
      () => game.global.race["artifical"] && haveTech("focus_cure", 7),
      (building) =>
        building instanceof ResourceAction &&
        building.resource === resources.Population &&
        building !== buildings.TauCloning,
      () => "Assembling is not possible",
      () => 0,
    ],
    [
      () => game.global.race["artifical"],
      (building) =>
        building instanceof ResourceAction &&
        building.resource === resources.Population &&
        resources.Population.storageRatio === 1,
      () => "No empty housings",
      () => 0,
    ],
    [
      () =>
        buildings.GorddonEmbassy.count === 0 &&
        resources.Knowledge.maxQuantity < settings.fleetEmbassyKnowledge,
      (building) => building === buildings.GorddonEmbassy,
      () =>
        `${getNumberString(
          settings.fleetEmbassyKnowledge,
        )} Max Knowledge required`,
      () => 0,
    ],
    [
      () =>
        game.global.race["magnificent"] &&
        settings.buildingShrineType !== "any",
      (building) => {
        if (building.id && building.id.includes("shrine")) {
          let bonus = null;
          if (
            game.global.city.calendar.moon > 0 &&
            game.global.city.calendar.moon < 7
          ) {
            bonus = "morale";
          } else if (
            game.global.city.calendar.moon > 7 &&
            game.global.city.calendar.moon < 14
          ) {
            bonus = "metal";
          } else if (
            game.global.city.calendar.moon > 14 &&
            game.global.city.calendar.moon < 21
          ) {
            bonus = "know";
          } else if (game.global.city.calendar.moon > 21) {
            bonus = "tax";
          } else if ([0, 7, 14, 21].includes(game.global.city.calendar.moon)) {
            bonus = "rotating";
          } else {
            return true;
          }
          if (settings.buildingShrineType === "equally") {
            let minShrine = Math.min(
              game.global.city.shrine.morale,
              game.global.city.shrine.metal,
              game.global.city.shrine.know,
              game.global.city.shrine.tax,
            );
            return game.global.city.shrine[bonus] !== minShrine;
          } else {
            return settings.buildingShrineType !== bonus;
          }
        }
      },
      () => "Wrong shrine",
      () => 0,
    ],
    [
      () => game.global.race["slaver"],
      (building) => {
        if (building === buildings.SlaveMarket) {
          if (resources.Slave.currentQuantity >= resources.Slave.maxQuantity) {
            return "Slave pens already full";
          }
          if (
            resources.Money.currentQuantity + resources.Money.rateOfChange <
              resources.Money.maxQuantity &&
            resources.Money.rateOfChange < settings.slaveIncome
          ) {
            return "Buying slaves only with excess money";
          }
        }
      },
      (note) => note,
      () => 0, // Slave Market
    ],
    [
      () => game.global.race["cannibalize"],
      (building) => {
        if (building._id === "s_alter" && building.count > 0) {
          if (resources.Population.currentQuantity < 1) {
            return "Too low population";
          }
          if (
            resources.Population.currentQuantity !==
            resources.Population.maxQuantity
          ) {
            return "Sacrifices performed only with full population";
          }
          if (
            game.global.race["parasite"] &&
            game.global.city.calendar.wind === 0
          ) {
            return "Parasites sacrificed only during windy weather";
          }
          if (game.global.civic[game.global.civic.d_job].workers < 1) {
            return "No default workers to sacrifice";
          }

          if (
            game.global.city.s_alter.rage >= 3600 &&
            game.global.city.s_alter.regen >= 3600 &&
            game.global.city.s_alter.mind >= 3600 &&
            game.global.city.s_alter.mine >= 3600 &&
            (!isLumberRace() || game.global.city.s_alter.harvest >= 3600)
          ) {
            return "Sacrifice bonus already high enough";
          }
        }
      },
      (note) => note,
      () => 0, // Sacrificial Altar
    ],
    [
      () => true,
      (building) => building.getMissingConsumption(),
      (resource) => `Missing ${resource.name} to operate`,
      () => settings.buildingWeightingMissingSupply,
    ],
    [
      () => true,
      (building) => building.getMissingSupport(),
      (support) => `Missing ${support.name} to operate`,
      () => settings.buildingWeightingMissingSupport,
    ],
    [
      () => true,
      (building) => building.getUselessSupport(),
      (support) => `Provided ${support.name} not currently needed`,
      () => settings.buildingWeightingUselessSupport,
    ],
    [
      () =>
        game.global.race["truepath"] &&
        resources.Tau_Belt_Support.maxQuantity <=
          resources.Tau_Belt_Support.currentQuantity,
      (building) => {
        if (
          building === buildings.TauBeltWhalingShip ||
          building === buildings.TauBeltMiningShip
        ) {
          let s_max = resources.Tau_Belt_Support.maxQuantity;
          let s_cur = resources.Tau_Belt_Support.currentQuantity;
          let currentEff = 1 - (1 - s_max / s_cur) ** 1.4;
          let nextEff = 1 - (1 - s_max / (s_cur + 1)) ** 1.4;
          return nextEff * (s_cur + 1) - currentEff * s_cur;
        }
      },
      (eff) =>
        `Low security, new ship will be ${getNiceNumber(eff * 100)}% efficient`,
      (eff) => eff ?? -1,
    ],
    [
      () => game.global.race["truepath"], // "&& game.global.tech.tau_red === 4" doesn't want to work for some reason.
      (building) => {
        if (
          building === buildings.TauRedContact ||
          building === buildings.TauRedIntroduce ||
          building === buildings.TauRedSubjugate
        ) {
          let missing = null;
          for (let [id, stat] of Object.entries({
            TauRedContact: "friend",
            TauRedIntroduce: "god",
            TauRedSubjugate: "lord",
          })) {
            if (!game.global.stats.womling[stat][poly.universeAffix()]) {
              if (building === buildings[id]) {
                return false; // Unearned stat, go for it
              }
              if (buildings[id].isAutoBuildable()) {
                missing = id;
              }
            }
          }
          return missing;
        }
      },
      (id) => `Overlord achievement is missing ${buildings[id].name}`,
      () => settings.buildingWeightingOverlord,
    ],
    [
      // Evil universe: Authority amount is capped by Authority max. When max is below target no
      // amount of tax/soldier management can fix the production penalty, so prioritize the
      // buildings that raise the cap. (Locked/irrelevant ones are already filtered to 0 above.)
      () =>
        settings.generalMinimumAuthority > 0 &&
        resources.Authority.isUnlocked() &&
        resources.Authority.maxQuantity < settings.generalMinimumAuthority,
      (building) => authorityCapBuildings.includes(building),
      () => "Raises Authority cap, currently below target",
      () => settings.buildingWeightingAuthority,
    ],
    [
      () =>
        settings.achievementGuards &&
        settings.guardBananaRepublic &&
        game.global.race["banana"],
      (building) =>
        building === buildings.DwarfWorldCollider &&
        !bananaRepublicObjectiveComplete("b2"),
      () => "Banana Republic objective",
      () => settings.buildingWeightingBananaObjective,
    ],
    [
      () => inflationChallengeAssistActive(),
      (building) => {
        if (
          !inflationChallengeMoneyReachable() &&
          inflationMoneyStorageBuildings.includes(building)
        ) {
          return "storage";
        }
        if (
          inflationChallengeMoneyReachable() &&
          inflationMoneyIncomeBuildings.includes(building)
        ) {
          return "income";
        }
        return false;
      },
      (kind) =>
        kind === "storage"
          ? "Inflation challenge needs Money storage"
          : "Inflation challenge needs Money income",
      () => settings.buildingWeightingInflationMoney,
    ],
    [
      () =>
        retirementChallengeAssistActive() &&
        retirementPreparationMissing().length > 0,
      (building) => {
        if (
          building === buildings.TauFusionGenerator &&
          building.count < RETIREMENT_PREP.fusionGenerators
        ) {
          return RETIREMENT_PREP.fusionGenerators;
        }
        if (
          building === buildings.TauFactory &&
          building.count < RETIREMENT_PREP.factories
        ) {
          return RETIREMENT_PREP.factories;
        }
        if (
          building === buildings.TauDiseaseLab &&
          building.count < RETIREMENT_PREP.scienceLabs
        ) {
          return RETIREMENT_PREP.scienceLabs;
        }
        return false;
      },
      (target, building) =>
        `Retirement preparation: build ${target} ${building.name}`,
      () => settings.buildingWeightingRetirementPrep,
    ],
    [
      () => settings.achievementGuards,
      (building) =>
        building === buildings.Dreadnought && guardActive("guardDreaded")
          ? "Dreaded"
          : building === buildings.SiriusThermalCollector &&
              guardActive("guardEnergetic")
            ? "Energetic"
            : building === buildings.RedSpaceport && guardActive("guardRedDead")
              ? "Red Dead"
              : false,
      (name) => `${name} achievement guard`,
      () => 0,
    ],
    [
      () => true,
      (building) =>
        building._tab === "city" &&
        building !== buildings.Mill &&
        building !== buildings.Banquet &&
        building.stateOffCount > 0,
      () => "Still have some non operating buildings",
      () => settings.buildingWeightingNonOperatingCity,
    ],
    [
      () => true,
      (building) => {
        if (building === buildings.BlackholeStellarEngine) {
          // `stateOffCount` is missleading for powered multisegmented buildings. This rule shouldn't ever apply to Stellar Engine, just ignore it
          // TODO: Might be better to ignore all multisegmented buildings, or making `stateOffCount` return 0 for multisegmented buildings, but i'm not sure about possible side effects at the moment - that would work as a hot fix
          return false;
        }
        if (
          (building === buildings.BadlandsAttractor ||
            building === buildings.SpireMechBay) &&
          building.isSmartManaged()
        ) {
          // Those things might be temporaly disabled by smart logic
          return false;
        }
        if (
          building === buildings.RuinsGuardPost &&
          building.isSmartManaged() &&
          !isHellSupressUseful()
        ) {
          // Prebuild guard posts. Even if we don't need supression right now they will be useful soon enough
          if (
            building.count <
            Math.ceil(
              5000 /
                (game.armyRating(traitVal("high_pop", 0, 1), "hellArmy", 0) *
                  traitVal("holy", 1, "+")),
            )
          ) {
            return false;
          }
        }
        let supplyIndex =
          building === buildings.SpirePort
            ? 1
            : building === buildings.SpireBaseCamp
              ? 2
              : -1;
        if (
          supplyIndex > 0 &&
          (buildings.SpireMechBay.isSmartManaged() ||
            buildings.SpirePurifier.isSmartManaged())
        ) {
          // Prebuild ports and base camps to their optimal ratios, they will be enabled when needed. Unless mech bay and purifiers both have their smarts disabled, which means it won't ever happen.
          if (
            building.count <
            getBestSupplyRatio(
              resources.Spire_Support.maxQuantity,
              buildings.SpirePort.autoMax,
              buildings.SpireBaseCamp.autoMax,
            )[supplyIndex]
          ) {
            return false;
          }
        }
        if (building._tab !== "city" && building.stateOffCount > 0) {
          // This thing not from city, switchable, and some of them disabled. We dont't need more at the moment.
          return true;
        }
      },
      () => "Still have some non operating buildings",
      () => settings.buildingWeightingNonOperating,
    ],
    [
      () => settings.prestigeType !== "bioseed" || !isGECKNeeded(),
      (building) => building === buildings.GasSpaceDockGECK,
      () => "Max allowed amount of G.E.C.K reached",
      () => 0,
    ],
    [
      () => game.global.race["lone_survivor"] && !isPrestigeAllowed("eden"),
      (building) => building === buildings.TauStarEden,
      () => "Prestiging not currently allowed",
      () => 0,
    ],
    [
      () =>
        game.global.race["truepath"] &&
        (!isPrestigeAllowed("retire") ||
          buildings.TauGas2MatrioshkaBrain.count < 1000),
      (building) => building === buildings.TauGas2IgniteGasGiant,
      () => "Prestiging not currently allowed",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType !== "bioseed",
      (building) =>
        building === buildings.GasSpaceDock ||
        building === buildings.GasSpaceDockShipSegment ||
        building === buildings.GasSpaceDockProbe,
      () => "Not needed for current prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "bioseed",
      (building) =>
        building === buildings.DwarfWorldCollider ||
        building === buildings.TitanMission,
      () => "Not needed for Bioseed prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "whitehole",
      (building) => building === buildings.BlackholeJumpShip,
      () => "Not needed for Whitehole prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct && settings.prestigeType === "vacuum",
      (building) => building === buildings.BlackholeStellarEngine,
      () => "Not needed for Vacuum Collapse prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "ascension" &&
        isPillarFinished() &&
        !game.global.race["witch_hunter"],
      (building) =>
        building === buildings.PitMission ||
        building === buildings.RuinsMission,
      () => "Not needed for Ascension prestige",
      () => 0,
    ],
    [
      () =>
        game.global.race["witch_hunter"] &&
        settings.prestigeType === "ascension",
      (building) => building === buildings.SpireWaygate,
      () => "Not needed for Witch Hunter's Ascension prestige",
      () => 0,
    ],
    [
      () =>
        settings.prestigeBioseedConstruct &&
        settings.prestigeType === "terraform",
      (building) =>
        building === buildings.PitMission ||
        building === buildings.RuinsMission,
      () => "Not needed for Terraform prestige",
      () => 0,
    ],
    [
      () =>
        settings.autoPrestige &&
        settings.prestigeType === "mad" &&
        (haveTech("mad") ||
          (techIds["tech-mad"].isUnlocked() &&
            techIds["tech-mad"].isAffordable(true))),
      (building) =>
        !building.is.housing &&
        !building.is.garrison &&
        !building.cost["Knowledge"] &&
        building !== buildings.OilWell,
      () => "Awaiting MAD prestige",
      () => settings.buildingWeightingMADUseless,
    ],
    [
      () => true,
      (building) =>
        !(building instanceof ResourceAction) && building.count === 0,
      () => "New building",
      () => settings.buildingWeightingNew,
    ],
    [
      () =>
        resources.Power.isUnlocked() &&
        resources.Power.currentQuantity < resources.Power.maxQuantity,
      (building) =>
        building === buildings.LakeCoolingTower || building.powered < 0,
      () => "Need more energy",
      () => settings.buildingWeightingNeedfulPowerPlant,
    ],
    [
      () =>
        resources.Power.isUnlocked() &&
        resources.Power.currentQuantity > resources.Power.maxQuantity,
      (building) =>
        building !== buildings.Mill &&
        (building === buildings.LakeCoolingTower || building.powered < 0),
      () => "No need for more energy",
      () => settings.buildingWeightingUselessPowerPlant,
    ],
    [
      () => resources.Power.isUnlocked(),
      (building) =>
        building !== buildings.LakeCoolingTower &&
        building.powered > 0 &&
        (building === buildings.NeutronCitadel
          ? getCitadelConsumption(building.count + 1) -
            getCitadelConsumption(building.count)
          : building.powered) > resources.Power.currentQuantity,
      () => "Not enough energy",
      () => settings.buildingWeightingUnderpowered,
    ],
    [
      () =>
        Math.max(
          state.knowledgeRequiredByTechs,
          state.knowledgeRequiredByBuildTargets,
        ) <= resources.Knowledge.maxQuantity,
      (building) =>
        building.is.knowledge &&
        building !== buildings.Wardenclyffe &&
        (building !== buildings.StargateTelemetryBeacon || building.count > 0), // We want Wardenclyffe for morale; first beacon required for progress
      () => "No need for more knowledge",
      () => settings.buildingWeightingUselessKnowledge,
    ],
    [
      () =>
        state.cheapestTechKnowledge > resources.Knowledge.maxQuantity ||
        state.knowledgeRequiredByBuildTargets > resources.Knowledge.maxQuantity,
      (building) => building.is.knowledge,
      () => "Need more knowledge",
      () => settings.buildingWeightingNeedfulKnowledge,
    ],
    [
      () =>
        buildings.BlackholeMassEjector.count > 0 &&
        buildings.BlackholeMassEjector.count * 1000 -
          game.global.interstellar.mass_ejector.total >
          100,
      (building) => building === buildings.BlackholeMassEjector,
      () => "Still have some unused ejectors",
      () => settings.buildingWeightingUnusedEjectors,
    ],
    [
      () =>
        resources.Crates.storageRatio < 1 ||
        resources.Containers.storageRatio < 1,
      (building) =>
        building === buildings.StorageYard ||
        building === buildings.Warehouse ||
        building === buildings.EnceladusMunitions,
      () => "Still have some unused storage",
      () => settings.buildingWeightingCrateUseless,
    ],
    [
      () =>
        resources.Oil.maxQuantity < resources.Oil.maxCost &&
        buildings.OilWell.count <= 0 &&
        buildings.GasMoonOilExtractor.count <= 0,
      (building) =>
        building === buildings.OilWell ||
        building === buildings.GasMoonOilExtractor,
      () => "Need more fuel",
      () => settings.buildingWeightingMissingFuel,
    ],
    [
      () =>
        (resources.Helium_3.isUnlocked() &&
          resources.Helium_3.maxQuantity < resources.Helium_3.maxCost) ||
        resources.Oil.maxQuantity < resources.Oil.maxCost,
      (building) =>
        building === buildings.OilDepot ||
        building === buildings.SpacePropellantDepot ||
        building === buildings.GasStorage,
      () => "Need more fuel",
      () => settings.buildingWeightingMissingFuel,
    ],
    [
      () =>
        game.global.race.hooved &&
        resources.Horseshoe.spareQuantity >=
          resources.Horseshoe.storageRequired,
      (building) =>
        building instanceof ResourceAction &&
        building.resource === resources.Horseshoe,
      () => `No more ${resources.Horseshoe.title} needed`,
      () => settings.buildingWeightingHorseshoeUseless,
    ],
    [
      () =>
        game.global.race.calm &&
        resources.Zen.currentQuantity < resources.Zen.maxQuantity,
      (building) => building.id.includes("meditation"),
      () => "No more Meditation Space needed",
      () => settings.buildingWeightingZenUseless,
    ],
    [
      () =>
        buildings.GateTurret.isUnlocked() &&
        poly.hellSupression("gate").rating >
          7501 +
            game.armyRating(traitVal("high_pop", 0, 1), "hellArmy", 0) *
              traitVal("holy", 1, "+"),
      (building) => building === buildings.GateTurret,
      () => "Gate demons fully supressed",
      () => settings.buildingWeightingGateTurret,
    ],
    [
      () =>
        (resources.Containers.isUnlocked() || resources.Crates.isUnlocked()) &&
        resources.Containers.storageRatio === 1 &&
        resources.Crates.storageRatio === 1,
      (building) =>
        building === buildings.Shed ||
        building === buildings.RedGarage ||
        building === buildings.AlphaWarehouse ||
        building === buildings.ProximaCargoYard ||
        building === buildings.TitanStorehouse,
      () => "Need more storage",
      () => settings.buildingWeightingNeedStorage,
    ],
    [
      () =>
        resources.Population.maxQuantity > 50 &&
        resources.Population.storageRatio < 0.9,
      (building) =>
        building.is.housing &&
        building !== buildings.Alien1Consulate &&
        building !== buildings.Transmitter &&
        !(building instanceof ResourceAction),
      () => "No more houses needed",
      () => settings.buildingWeightingUselessHousing,
    ],
    [
      () =>
        game.global.race["orbit_decay"] && !game.global.race["orbit_decayed"],
      (building) =>
        (building._tab === "city" || building._location === "spc_moon") &&
        !(building instanceof ResourceAction),
      () => "Will be destroyed after impact",
      () => settings.buildingWeightingTemporal,
    ],
    [
      () => game.global.tech.tau_gas === 1, // Only used for name contest, no need to check at other game stages
      (building) => building.is.random,
      () => "Randomized weighting",
      () => 1 + Math.random(), // Fluctuate weight to pick random item
    ],
    [
      () => game.global.race["truepath"] && haveTech("tauceti", 2),
      (building) =>
        (building._tab === "city" ||
          building._tab === "space" ||
          building._tab === "starDock") &&
        !(building instanceof ResourceAction),
      () => "Solar System building",
      () => settings.buildingWeightingSolar,
    ],
  ];

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

  function resetWarSettings(reset) {
    let def = {
      autoFight: false,
      foreignAttackLivingSoldiersPercent: 90,
      foreignAttackHealthySoldiersPercent: 90,
      foreignHireMercMoneyStoragePercent: 90,
      foreignHireMercCostLowerThanIncome: 1,
      foreignHireMercDeadSoldiers: 1,
      foreignMinAdvantage: 40,
      foreignMaxAdvantage: 80,
      foreignMaxSiegeBattalion: 10,
      foreignProtect: "auto",
      foreignPacifist: false,
      foreignUnification: true,
      foreignForceSabotage: true,
      foreignOccupyLast: true,
      foreignTrainSpy: true,
      foreignSpyMax: 2,
      foreignPowerRequired: 75,
      foreignPolicyInferior: "Annex",
      foreignPolicySuperior: "Sabotage",
      foreignPolicyRival: "Influence",
    };

    applySettings(def, reset);
  }

  function resetHellSettings(reset) {
    let def = {
      autoHell: false,
      hellHomeGarrison: 10,
      hellMinSoldiers: 20,
      hellMinSoldiersPercent: 90,
      hellAssaultReserve: true,
      hellTargetFortressDamage: 100,
      hellLowWallsMulti: 3,
      hellHandlePatrolSize: true,
      hellPatrolMinRating: 30,
      hellPatrolThreatPercent: 8,
      hellPatrolDroneMod: 5,
      hellPatrolDroidMod: 5,
      hellPatrolBootcampMod: 0,
      hellBolsterPatrolPercentTop: 50,
      hellBolsterPatrolPercentBottom: 20,
      hellBolsterPatrolRating: 300,
      hellAttractorTopThreat: 9000,
      hellAttractorBottomThreat: 6000,
      warlordHandleFortress: true,
      warlordMinimumMinions: 1000,
    };

    applySettings(def, reset);
  }

  function resetGeneralSettings(reset) {
    let def = {
      masterScriptToggle: true,
      showSettings: true,
      autoPrestige: false,
      tickRate: 4,
      tickSchedule: false,
      researchRequest: true,
      researchRequestSpace: false,
      missionRequest: true,
      useDemanded: true,
      prioritizeTriggers: "savereq",
      prioritizeQueue: "savereq",
      prioritizeUnify: "savereq",
      prioritizeOuterFleet: "ignore",
      buildingAlwaysClick: false,
      buildingClickPerTick: 50,
      scriptSettingsExportFilename: "evolve-script-settings.json",
    };

    applySettings(def, reset);
  }

  function resetInterfaceSettings(reset) {
    let def = {
      activeTargetsUI: false,
      buildPlannerUI: true,
      buildPlannerCollapsed: false,
      displayPrestigeTypeInTopBar: true,
      displayTotalDaysTypeInTopBar: false,
      performanceHackAvoidDrawTech: false,
    };

    applySettings(def, reset);
  }

  function resetStateLogSettings(reset) {
    let def = {
      stateLogEnabled: false,
      stateLogAutoDownload: false,
      stateLogInterval: 20,
    };

    applySettings(def, reset);
  }

  function resetAchievementGuardSettings(reset) {
    let def = {
      achievementGuards: false,
      guardPacifist: true,
      guardDreaded: true,
      guardCultOfPersonality: true,
      guardAnarchist: true,
      guardEnergetic: true,
      guardRedDead: true,
      guardSecondEvolution: true,
      guardBananaRepublic: true,
    };

    applySettings(def, reset);
  }

  function resetChallengeHelperSettings(reset) {
    let def = {
      inflationChallengeAssist: true,
      inflationChallengeSaveMinutes: 30,
      retirementChallengeAssist: true,
    };

    applySettings(def, reset);
  }

  function resetPrestigeSettings(reset) {
    let def = {
      prestigeType: "none",
      prestigeMADIgnoreArpa: true,
      prestigeMADWait: true,
      prestigeMADPopulation: 1,
      prestigeWaitAT: false,
      prestigeGECK: 0,
      prestigeBioseedConstruct: true,
      prestigeBioseedProbes: 3,
      prestigeWhiteholeSaveGems: true,
      prestigeWhiteholeMinMass: 8,
      prestigeAscensionPillar: true,
      prestigeCustomRaceMode: "reuse",
      prestigeCustomRacePreset: "0",
      prestigeCustomRacePresets: [
        { name: "General", json: "" },
        { name: "Banana + EMF", json: "" },
        { name: "Cataclysm", json: "" },
      ],
      prestigeDemonicFloor: 100,
      prestigeDemonicPotential: 0.6,
      prestigeDemonicBomb: false,
      prestigeVaxStrat: "none",
    };

    applySettings(def, reset);
  }

  function resetGovernmentSettings(reset) {
    let def = {
      autoTax: false,
      autoGovernment: false,
      generalRequestedTaxRate: -1,
      generalMinimumTaxRate: 20,
      generalMinimumMorale: 105,
      generalMaximumMorale: 500,
      generalMinimumAuthority: 100, // Evil universe: keep Authority at or above this (0 to disable, -1 to target the current Authority max)
      generalAuthorityMinPatrolPercent: 40, // -1 (pin-at-max) mode only: reserve at least this % of available Hell soldiers for patrols (soul gem income) instead of stationing everyone
      govInterim: GovernmentManager.Types.democracy.id,
      govFinal: GovernmentManager.Types.technocracy.id,
      govSpace: GovernmentManager.Types.corpocracy.id,
      govGovernor: "none",
    };

    applySettings(def, reset);
  }

  function resetEvolutionSettings(reset) {
    let def = {
      autoEvolution: false,
      userUniverseTargetName: "none",
      userPlanetTargetName: "none",
      userEvolutionTarget: "auto",
      userEvolutionGenus: "fungi",
      evolutionQueue: [],
      evolutionQueueEnabled: false,
      evolutionQueueRepeat: false,
      evolutionAutoUnbound: true,
      evolutionBackup: false,
    };
    challenges.forEach((set) => (def["challenge_" + set[0].id] = false));

    applySettings(def, reset);
  }

  function resetResearchSettings(reset) {
    let def = {
      autoResearch: false,
      userResearchTheology_1: "auto",
      userResearchTheology_2: "auto",
      researchIgnore: ["tech-purify"],
    };

    applySettings(def, reset);
  }

  function resetMarketSettings(reset) {
    MarketManager.priorityList = Object.values(resources)
      .filter((r) => r.is.tradable)
      .reverse();
    let def = {
      autoMarket: false,
      autoGalaxyMarket: false,
      tradeRouteMinimumMoneyPerSecond: 500,
      tradeRouteMinimumMoneyPercentage: 50,
      tradeRouteSellExcess: true,
      minimumMoney: 0,
      minimumMoneyPercentage: 0,
      marketMinIngredients: 0,
    };

    for (let i = 0; i < MarketManager.priorityList.length; i++) {
      let resource = MarketManager.priorityList[i];
      let id = resource.id;

      def["res_buy_p_" + id] = i; // marketPriority
      def["buy" + id] = false; // autoBuyEnabled
      def["res_buy_r_" + id] = 0.5; // autoBuyRatio
      def["sell" + id] = false; // autoSellEnabled
      def["res_sell_r_" + id] = 0.9; // autoSellRatio
      def["res_trade_buy_" + id] = true; // autoTradeBuyEnabled
      def["res_trade_sell_" + id] = true; // autoTradeSellEnabled
      def["res_trade_w_" + id] = 1; // autoTradeWeighting
      def["res_trade_p_" + id] = 1; // autoTradePriority
    }

    const setTradePriority = (priority, items) =>
      items.forEach((id) => (def["res_trade_p_" + id] = priority));

    setTradePriority(1, ["Food"]);
    setTradePriority(2, ["Helium_3", "Uranium", "Oil", "Coal"]);
    setTradePriority(3, ["Stone", "Chrysotile", "Lumber"]);
    setTradePriority(4, ["Aluminium", "Iron", "Copper"]);
    setTradePriority(5, ["Furs"]);
    setTradePriority(6, ["Cement"]);
    setTradePriority(7, ["Steel"]);
    setTradePriority(8, ["Titanium"]);
    setTradePriority(9, ["Polymer", "Alloy"]);
    setTradePriority(10, ["Iridium"]);
    setTradePriority(-1, ["Crystal"]);

    for (let i = 0; i < poly.galaxyOffers.length; i++) {
      let resource = resources[poly.galaxyOffers[i].buy.res];
      let id = resource.id;

      def["res_galaxy_w_" + id] = 1; // galaxyMarketWeighting
      def["res_galaxy_p_" + id] = i + 1; // galaxyMarketPriority
    }

    applySettings(def, reset);
    MarketManager.sortByPriority();
  }

  function resetStorageSettings(reset) {
    StorageManager.priorityList = Object.values(resources)
      .filter((r) => r.hasStorage())
      .reverse();
    let def = {
      autoStorage: false,
      storageLimitPreMad: true,
      storageSafeReassign: true,
      storageAssignExtra: true,
      storageAssignPart: false,
    };

    for (let i = 0; i < StorageManager.priorityList.length; i++) {
      let resource = StorageManager.priorityList[i];
      let id = resource.id;

      def["res_storage" + id] = true; // autoStorageEnabled
      def["res_storage_p_" + id] = i; // storagePriority
      def["res_storage_o_" + id] = false; // storeOverflow
      def["res_min_store" + id] = 1; // minStorage
      def["res_max_store" + id] = -1; // maxStorage
    }

    // Enable overflow for endgame resources
    def["res_storage_o_" + resources.Orichalcum.id] = true;
    def["res_storage_o_" + resources.Vitreloy.id] = true;
    def["res_storage_o_" + resources.Bolognium.id] = true;

    applySettings(def, reset);
    StorageManager.sortByPriority();
  }

  function resetMinorTraitSettings(reset) {
    MinorTraitManager.priorityList = Object.entries(game.traits)
      .filter(
        ([id, trait]) =>
          trait.type === "minor" || id === "mastery" || id === "fortify",
      )
      .map(([id, trait]) => new MinorTrait(id));

    let def = {
      autoMinorTrait: false,
      shifterGenus: "ignore",
      imitateRace: "ignore",
      buildingShrineType: "know",
      slaveIncome: 25000,
      jobScalePop: true,
      psychicPower: "auto",
      psychicBoostRes: "auto",
      wishMinor: "none",
      wishMajor: "none",

      autoGenetics: false,
      geneticsSequence: "none",
      geneticsBoost: "none",
      geneticsAssemble: "auto",
    };

    for (let i = 0; i < MinorTraitManager.priorityList.length; i++) {
      let trait = MinorTraitManager.priorityList[i];
      let id = trait.traitName;

      def["mTrait_" + id] = true; // enabled
      def["mTrait_p_" + id] = i; // priority
      def["mTrait_w_" + id] = 1; // weighting
    }

    Object.values(ocularPowerData).forEach((v) => {
      def["ocularPower_" + v.id] = true;
      def["ocularPower_p_" + v.id] = 100;
    });

    applySettings(def, reset);
    MinorTraitManager.sortByPriority();
  }

  function resetMutableTraitSettings(reset) {
    let unobtainableTraits = ["xenophobic", "rigid", "soul_eater"];
    MutableTraitManager.priorityList = Object.entries(game.traits)
      .filter(
        ([id, trait]) =>
          (trait.type === "major" || trait.type === "genus") &&
          !unobtainableTraits.includes(id),
      )
      .map(([id, trait]) =>
        trait.type === "major" ? new MajorTrait(id) : new GenusTrait(id),
      )
      .sort(
        (a, b) =>
          Object.keys(poly.genus_traits).indexOf(a.genus) -
            Object.keys(poly.genus_traits).indexOf(b.genus) || a.type < b.type,
      );

    let def = {
      autoMutateTraits: false,
      doNotGoBelowPlasmidSoftcap: true,
      minimumPlasmidsToPreserve: 0,
    };

    for (let i = 0; i < MutableTraitManager.priorityList.length; i++) {
      let trait = MutableTraitManager.priorityList[i];
      let id = trait.traitName;

      def["mutableTrait_p_" + id] = i; // priority
      def["mutableTrait_purge_" + id] = false; // auto remove disabled

      if (trait.isGainable()) {
        def["mutableTrait_gain_" + id] = false; // auto add disabled
      }
      if (poly.neg_roll_traits.includes(id)) {
        def["mutableTrait_reset_" + id] = false; // auto reset disabled
      }
    }

    applySettings(def, reset);
    MutableTraitManager.sortByPriority();
  }

  function resetJobSettings(reset) {
    JobManager.priorityList = Object.values(jobs);
    let def = {
      autoJobs: false,
      autoCraftsmen: false,
      jobSetDefault: true,
      jobManageServants: true,
      jobLumberWeighting: 50,
      jobQuarryWeighting: 50,
      jobCrystalWeighting: 50,
      jobScavengerWeighting: 5,
      jobRaiderWeighting: 20,
      jobForagerWeighting: 50,
      jobDisableMiners: true,
    };

    for (let i = 0; i < JobManager.priorityList.length; i++) {
      let job = JobManager.priorityList[i];
      let id = job._originalId;

      def["job_" + id] = true; // autoJobEnabled
      def["job_p_" + id] = i; // priority

      if (job.is.smart) {
        def["job_s_" + id] = true; // smart
      }
    }

    const setBreakpoints = (job, b1, b2, b3) => {
      // breakpoins
      def["job_b1_" + job._originalId] = b1;
      def["job_b2_" + job._originalId] = b2;
      def["job_b3_" + job._originalId] = b3;
    };
    setBreakpoints(jobs.Colonist, -1, -1, -1);
    setBreakpoints(jobs.Teamster, 10, -1, -1);
    setBreakpoints(jobs.Meditator, -1, -1, -1);
    setBreakpoints(jobs.Hunter, -1, -1, -1);
    setBreakpoints(jobs.Farmer, -1, -1, -1);
    setBreakpoints(jobs.Forager, 4, 10, 0);
    setBreakpoints(jobs.Lumberjack, 4, 10, 0);
    setBreakpoints(jobs.QuarryWorker, 4, 10, 0);
    setBreakpoints(jobs.CrystalMiner, 2, 5, 0);
    setBreakpoints(jobs.Scavenger, 0, 0, 0);

    setBreakpoints(jobs.TitanColonist, -1, -1, -1);
    setBreakpoints(jobs.PitMiner, 1, 12, -1);
    setBreakpoints(jobs.Miner, 3, 5, -1);
    setBreakpoints(jobs.CoalMiner, 2, 4, -1);
    setBreakpoints(jobs.CementWorker, 4, 8, -1);
    setBreakpoints(jobs.Professor, 6, 10, -1);
    setBreakpoints(jobs.Scientist, 3, 6, -1);
    setBreakpoints(jobs.Entertainer, 2, 5, -1);
    setBreakpoints(jobs.HellSurveyor, 1, 1, -1);
    setBreakpoints(jobs.SpaceMiner, 1, 3, -1);
    setBreakpoints(jobs.Torturer, 1, 1, -1);
    setBreakpoints(jobs.Archaeologist, 1, 1, -1);
    setBreakpoints(jobs.GhostTrapper, 1, 1, -1);
    setBreakpoints(jobs.ElysiumMiner, 1, 1, -1);
    setBreakpoints(jobs.Banker, 3, 5, -1);
    setBreakpoints(jobs.Priest, 0, 0, -1);
    setBreakpoints(jobs.Unemployed, 0, 0, 0);

    applySettings(def, reset);
    JobManager.sortByPriority();
  }

  function resetWeightingSettings(reset) {
    let def = {
      buildingBuildIfStorageFull: false,
      buildingWeightingNew: 3,
      buildingWeightingUselessPowerPlant: 0.01,
      buildingWeightingNeedfulPowerPlant: 3,
      buildingWeightingUnderpowered: 0.8,
      buildingWeightingUselessKnowledge: 0.01,
      buildingWeightingNeedfulKnowledge: 5,
      buildingWeightingMissingFuel: 10,
      buildingWeightingNonOperatingCity: 0.2,
      buildingWeightingNonOperating: 0,
      buildingWeightingAuthority: 10,
      buildingWeightingMissingSupply: 0,
      buildingWeightingMissingSupport: 0,
      buildingWeightingUselessSupport: 0.01,
      buildingWeightingMADUseless: 0,
      buildingWeightingUnusedEjectors: 0.1,
      buildingWeightingCrateUseless: 0.01,
      buildingWeightingHorseshoeUseless: 0.1,
      buildingWeightingZenUseless: 0.01,
      buildingWeightingGateTurret: 0.01,
      buildingWeightingNeedStorage: 1,
      buildingWeightingUselessHousing: 1,
      buildingWeightingTemporal: 0.2,
      buildingWeightingSolar: 0.2,
      buildingWeightingOverlord: 0,
      buildingWeightingBananaObjective: 2,
      buildingWeightingInflationMoney: 2,
      buildingWeightingRetirementPrep: 10,
    };

    applySettings(def, reset);
  }

  function resetBuildingSettings(reset) {
    initBuildingState();
    let def = {
      autoBuild: false,
      autoPower: false,
      buildingsIgnoreZeroRate: false,
      buildingsLimitPowered: true,
      buildingTowerSuppression: 100,
      buildingConsumptionCheck: "perResource",
      buildingsTransportGem: false,
      buildingsBestFreighter: false,
      buildingsUseMultiClick: false,
      buildingEnabledAll: true,
      buildingStateAll: true,
    };

    for (let i = 0; i < BuildingManager.priorityList.length; i++) {
      let building = BuildingManager.priorityList[i];
      let id = building._vueBinding;

      def["bat" + id] = true; // autoBuildEnabled
      def["bld_p_" + id] = i; // priority
      def["bld_m_" + id] = -1; // _autoMax
      def["bld_w_" + id] = 100; // _weighting

      if (building.isSwitchable()) {
        def["bld_s_" + id] = true; // autoStateEnabled
      }
      if (building.is.smart) {
        def["bld_s2_" + id] = true; // autoStateSmart
      }
    }
    // Moon smart is disabled by default
    def["bld_s2_space-iridium_mine"] = false;
    def["bld_s2_space-helium_mine"] = false;

    // AutoBuild disabled by default for early(ish) buildings consuming Soul Gems, Blood Stones and Plasmids
    // Same for Womling interaction action, and Gas names, as they are mutualy exclusive
    [
      "RedVrCenter",
      "NeutronCitadel",
      "PortalWarDroid",
      "BadlandsPredatorDrone",
      "PortalRepairDroid",
      "SpireWaygate",
      "TauRedContact",
      "TauRedIntroduce",
      "TauRedSubjugate",
      "TauGasName1",
      "TauGasName2",
      "TauGasName3",
      "TauGasName4",
      "TauGasName5",
      "TauGasName6",
      "TauGasName7",
      "TauGasName8",
      "TauGas2Name1",
      "TauGas2Name2",
      "TauGas2Name3",
      "TauGas2Name4",
      "TauGas2Name5",
      "TauGas2Name6",
      "TauGas2Name7",
      "TauGas2Name8",
    ].forEach((b) => (def["bat" + buildings[b]._vueBinding] = false));

    // Limit max for belt ships, and horseshoes
    def["bld_m_" + buildings.ForgeHorseshoe._vueBinding] = 20;
    def["bld_m_" + buildings.RedForgeHorseshoe._vueBinding] = 20;
    def["bld_m_" + buildings.TauForgeHorseshoe._vueBinding] = 20;
    def["bld_m_" + buildings.BeltEleriumShip._vueBinding] = 15;
    def["bld_m_" + buildings.BeltIridiumShip._vueBinding] = 15;

    applySettings(def, reset);
    BuildingManager.sortByPriority();
  }

  function resetProjectSettings(reset) {
    ProjectManager.priorityList = Object.values(projects);
    let def = {
      autoARPA: false,
      arpaScaleWeighting: true,
      arpaStep: 5,
    };

    let projectPriority = 0;
    const setProject = (item, autoBuildEnabled, _autoMax, _weighting) => {
      let id = projects[item].id;
      def["arpa_" + id] = autoBuildEnabled;
      def["arpa_p_" + id] = projectPriority++;
      def["arpa_m_" + id] = _autoMax;
      def["arpa_w_" + id] = _weighting;
    };
    setProject("LaunchFacility", true, -1, 100);
    setProject("SuperCollider", true, -1, 5);
    setProject("StockExchange", true, -1, 0.5);
    setProject("Monument", true, -1, 1);
    setProject("Railway", true, -1, 0.1);
    setProject("Nexus", true, -1, 1);
    setProject("RoidEject", true, -1, 1);
    setProject("ManaSyphon", false, 79, 1);
    setProject("Depot", true, -1, 1);

    applySettings(def, reset);
    ProjectManager.sortByPriority();
  }

  function resetMagicSettings(reset) {
    AlchemyManager.priorityList = Object.values(resources).filter(
      (r) => AlchemyManager.transmuteTier(r) > 0,
    );
    let def = {
      autoAlchemy: false,
      autoPylon: false,
      magicFullmetalHelper: true,
      magicAlchemyManaUse: 0.5,
      productionRitualManaUse: 0.5,
      productionRitualSafe: true,
    };

    // Alchemy
    for (let i = 0; i < AlchemyManager.priorityList.length; i++) {
      let resource = AlchemyManager.priorityList[i];
      let id = resource.id;

      def["res_alchemy_" + id] = true; // resEnabled
      def["res_alchemy_w_" + id] = 0; // resWeighting
    }

    // Pylon
    for (let spell of Object.values(RitualManager.Productions)) {
      def["spell_w_" + spell.id] = 100; // weighting
    }
    def["spell_w_hunting"] = 10;
    def["spell_w_farmer"] = 1;

    applySettings(def, reset);
  }

  function resetProductionSettings(reset) {
    let def = {
      autoQuarry: false,
      autoMine: false,
      autoExtractor: false,
      autoGraphenePlant: false,
      autoSmelter: false,
      autoCraft: false,
      autoFactory: false,
      autoMiningDroid: false,
      autoReplicator: false,
      productionChrysotileWeight: 2,
      productionAdamantiteWeight: 1,
      productionExtWeight_common: 1,
      productionExtWeight_uncommon: 1,
      productionExtWeight_rare: 1,
      productionFoundryWeighting: "demanded",
      productionCraftsmen: "nocraft",
      productionSmelting: "required",
      productionSmeltingIridium: 0.5,
      productionFactoryWeighting: "none",
      productionFactoryMinIngredients: 0,
      productionFactoryFocusMaterials: false,
      replicatorAssignGovernorTask: true,
      replicatorWeightingMode: "mass",
    };

    // Foundry
    const setFoundryProduct = (
      item,
      autoCraftEnabled,
      crafterEnabled,
      craftWeighting,
      craftPreserve,
    ) => {
      let id = resources[item].id;
      def["craft" + id] = autoCraftEnabled;
      def["job_" + id] = crafterEnabled;
      def["foundry_w_" + id] = craftWeighting;
      def["foundry_p_" + id] = craftPreserve;
    };
    setFoundryProduct("Plywood", true, true, 1, 0);
    setFoundryProduct("Brick", true, true, 1, 0);
    setFoundryProduct("Wrought_Iron", true, true, 1, 0);
    setFoundryProduct("Sheet_Metal", true, true, 2, 0);
    setFoundryProduct("Mythril", true, true, 3, 0);
    setFoundryProduct("Aerogel", true, true, 3, 0);
    setFoundryProduct("Nanoweave", true, true, 10, 0);
    setFoundryProduct("Scarletite", true, true, 1, 0);
    setFoundryProduct("Quantium", true, true, 1, 0);

    // Smelter
    Object.values(SmelterManager.Fuels).forEach((fuel, i) => {
      def["smelter_fuel_p_" + fuel.id] = i; // priority
    });

    // Factory
    const setFactoryProduct = (item, enabled, weighting, priority) => {
      let id = FactoryManager.Productions[item].resource.id;
      def["production_" + id] = enabled;
      def["production_w_" + id] = weighting;
      def["production_p_" + id] = priority;
    };
    setFactoryProduct("LuxuryGoods", true, 1, 2);
    setFactoryProduct("Furs", true, 1, 1);
    setFactoryProduct("Alloy", true, 1, 3);
    setFactoryProduct("Polymer", true, 1, 3);
    setFactoryProduct("NanoTube", true, 4, 3);
    setFactoryProduct("Stanene", true, 4, 3);

    // Mining Droids
    const setDroidProduct = (item, weighting, priority) => {
      let id = DroidManager.Productions[item].resource.id;
      def["droid_w_" + id] = weighting;
      def["droid_pr_" + id] = priority;
    };
    setDroidProduct("Adamantite", 15, 1);
    setDroidProduct("Aluminium", 1, 1);
    setDroidProduct("Uranium", 5, -1);
    setDroidProduct("Coal", 5, -1);

    // Matter Replicator
    const setReplicatorProduct = (item, enabled, weighting, priority) => {
      let id = ReplicatorManager.Productions[item].id;
      def["replicator_" + id] = enabled;
      def["replicator_w_" + id] = weighting;
      def["replicator_p_" + id] = priority;
    };
    Object.values(ReplicatorManager.Productions).forEach((production) =>
      setReplicatorProduct(production.id, true, 1, 1),
    );

    applySettings(def, reset);
  }

  function resetTriggerSettings(reset) {
    let def = {
      autoTrigger: false,
    };

    // Add default triggers only on reset, or first run, but not on casual update
    if (reset || !settingsRaw.hasOwnProperty("autoTrigger")) {
      TriggerManager.priorityList = [];
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_mission",
        1,
        "build",
        "space-moon_base",
        1,
      );
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_base",
        1,
        "build",
        "space-iridium_mine",
        1,
      );
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_base",
        1,
        "build",
        "space-helium_mine",
        1,
      );
      settingsRaw.triggers = JSON.parse(
        JSON.stringify(TriggerManager.priorityList),
      );
    }
    applySettings(def, reset);
  }

  function resetLoggingSettings(reset) {
    let def = {
      hellTurnOffLogMessages: true,
      logFilter: "",
      logEnabled: true,
    };
    Object.keys(GameLog.Types).forEach((id) => (def["log_" + id] = true));
    def["log_mercenary"] = false;
    def["log_multi_construction"] = false;
    def["log_prestige"] = false;
    def["log_prestige_format"] =
      "Reset: {resetType}, Species: {species}, Duration: {timeStamp} days";

    applySettings(def, reset);
  }

  function resetPlanetSettings(reset) {
    let def = {};
    biomeList.forEach(
      (biome) =>
        (def["biome_w_" + biome] =
          (planetBiomes.length - planetBiomes.indexOf(biome)) * 10),
    );
    traitList.forEach(
      (trait) =>
        (def["trait_w_" + trait] =
          (planetTraits.length - planetTraits.indexOf(trait)) * 10),
    );
    extraList.forEach((extra) => (def["extra_w_" + extra] = 0));
    def["extra_w_Achievement"] = 1000;

    applySettings(def, reset);
  }

  function resetFleetSettings(reset) {
    let def = {
      autoFleet: false,
      fleetOuterCrew: 30,
      fleetOuterShips: "custom",
      fleetExploreTau: true,
      fleetMaxCover: true,
      fleetCrewReclaim: true,
      fleetEmbassyKnowledge: 6000000,
      fleetAlienGiftKnowledge: 6500000,
      fleetAlien2Knowledge: 8000000,
      fleetAlien2Loses: "none",
      fleetChthonianLoses: "low",

      // Default combat ship
      fleet_outer_class: "destroyer",
      fleet_outer_armor: "neutronium",
      fleet_outer_weapon: "plasma",
      fleet_outer_engine: "ion",
      fleet_outer_power: "fission",
      fleet_outer_sensor: "lidar",

      // Default scout ship
      fleet_scout_class: "corvette",
      fleet_scout_armor: "neutronium",
      fleet_scout_weapon: "plasma",
      fleet_scout_engine: "tie",
      fleet_scout_power: "fusion",
      fleet_scout_sensor: "quantum",

      // Default andromeda regions priority
      fleet_pr_gxy_stargate: 0,
      fleet_pr_gxy_alien2: 1,
      fleet_pr_gxy_alien1: 2,
      fleet_pr_gxy_chthonian: 3,
      fleet_pr_gxy_gateway: 4,
      fleet_pr_gxy_gorddon: 5,
    };

    const setOuterRegion = (id, weighting, protect, scouts) => {
      def["fleet_outer_pr_" + id] = weighting;
      def["fleet_outer_def_" + id] = protect;
      def["fleet_outer_sc_" + id] = scouts;
    };
    setOuterRegion("spc_moon", 1, 0.9, 0); // Iridium
    setOuterRegion("spc_red", 3, 0.9, 0); // Titanium
    setOuterRegion("spc_gas", 0, 0.9, 0); // Helium
    setOuterRegion("spc_gas_moon", 0, 0.9, 0); // Oil
    setOuterRegion("spc_belt", 1, 0.9, 0); // Iridium
    setOuterRegion("spc_titan", 5, 0.9, 1); // Adamantite
    setOuterRegion("spc_enceladus", 3, 0.9, 1); // Quantium
    setOuterRegion("spc_triton", 10, 0.95, 2); // Encrypted data
    setOuterRegion("spc_kuiper", 5, 0.9, 2); // Orichalcum
    setOuterRegion("spc_eris", 100, 0.01, 1); // Encrypted data

    applySettings(def, reset);
  }

  function resetMechSettings(reset) {
    let def = {
      autoMech: false,
      mechScrap: "mixed",
      mechScrapEfficiency: 1.5,
      mechCollectorValue: 0.5,
      mechBuild: "random",
      mechSize: "titan",
      mechSizeGravity: "auto",
      mechFillBay: true,
      mechScouts: 0.05,
      mechScoutsRebuild: false,
      mechMinSupply: 1000,
      mechMaxCollectors: 0.5,
      mechInfernalCollector: true,
      mechSpecial: "prefered",
      mechSaveSupplyRatio: 1,
      buildingMechsFirst: true,
      mechBaysFirst: true,
      mechWaygatePotential: 0.4,
    };

    applySettings(def, reset);
  }

  function resetEjectorSettings(reset) {
    if (game.global.race.universe === "magic") {
      EjectManager.priorityList = Object.values(resources)
        .filter((r) => EjectManager.isConsumable(r))
        .sort((a, b) => b.atomicMass - a.atomicMass);
    } else {
      EjectManager.priorityList = Object.values(resources)
        .filter(
          (r) =>
            EjectManager.isConsumable(r) &&
            r !== resources.Elerium &&
            r !== resources.Infernite,
        )
        .sort((a, b) => b.atomicMass - a.atomicMass);
      EjectManager.priorityList.unshift(resources.Infernite);
      EjectManager.priorityList.unshift(resources.Elerium);
    }

    SupplyManager.priorityList = Object.values(resources)
      .filter((r) => SupplyManager.isConsumable(r))
      .sort(
        (a, b) => SupplyManager.supplyIn(b.id) - SupplyManager.supplyIn(a.id),
      );

    NaniteManager.priorityList = Object.values(resources)
      .filter((r) => NaniteManager.isConsumable(r))
      .sort((a, b) => b.atomicMass - a.atomicMass);

    let def = {
      autoEject: false,
      autoSupply: false,
      autoNanite: false,
      ejectMode: "cap",
      supplyMode: "mixed",
      naniteMode: "full",
      prestigeWhiteholeStabiliseMass: true,
      prestigeWhiteholeStabiliseCooldown: 120,
    };

    for (let resource of EjectManager.priorityList) {
      def["res_eject" + resource.id] = resource.is.tradable ?? false;
    }
    for (let resource of SupplyManager.priorityList) {
      def["res_supply" + resource.id] = resource.is.tradable ?? false;
    }
    for (let resource of NaniteManager.priorityList) {
      def["res_nanite" + resource.id] = resource.is.tradable ?? false;
    }

    def["res_eject" + resources.Elerium.id] = true;
    def["res_eject" + resources.Infernite.id] = true;

    applySettings(def, reset);
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

  function updateActiveTargetsUI(queuedTargets, type) {
    if (queuedTargets.length) {
      $(`#active_targets .target-type-box.${type}`).show();
    } else {
      $(`#active_targets .target-type-box.${type}`).hide();
      return;
    }

    $(`#active_targets ul.active_targets-list.${type}`).html(
      queuedTargets.map((target) => {
        let targetName = target.name,
          targetTimeLeft = "",
          targetSegments = "",
          researchTimeLeft = 0,
          isArpaProject = type === "arpa" || target instanceof Project,
          isMultiSegmented = target.is && target.is.multiSegmented,
          isTablessBuilding = type === "buildings" && !target._tab;

        if (target.count && !isMultiSegmented) {
          targetName += ` #${target.count + 1}`;
        }

        if (target.instance && target.instance.time) {
          targetTimeLeft = `${target.instance.time}`;
        }

        const costs = target.cost;

        if (target instanceof Technology) {
          if ($.isEmptyObject(target.cost)) {
            targetTimeLeft = "Waiting on prerequisite";
          } else if (
            target.cost.Knowledge > game.global.resource.Knowledge.max
          ) {
            targetTimeLeft = "Not enough Knowledge";
          }
        } else if (isArpaProject) {
          targetName += ` (${target.progress}%)`;

          const segmentedTimeLeft = getMultiSegmentedTimeLeft(target);
          targetTimeLeft = `${segmentedTimeLeft.timeLeft}</span> <span class="has-text-danger">(${segmentedTimeLeft.resource})</span>`;
        }

        const costsHTML = Object.keys(costs)
          .map((resource) => {
            let res = resources[resource],
              className = "has-text-success",
              resourceTimeLeft = "";

            let resourceCost = costs[resource];

            if (isArpaProject) {
              resourceCost =
                costs[resource] *
                ((100 - target.progress) / target.currentStep);
            } else if (isMultiSegmented) {
              resourceCost = costs[resource] * (target.gameMax - target.count);
            }

            if (res.currentQuantity < resourceCost) {
              className = "has-text-danger";

              if (res.maxQuantity >= resourceCost && res.income > 0) {
                const timeLeftRaw =
                  (resourceCost - res.currentQuantity) / res.income;

                if (
                  target instanceof Technology &&
                  timeLeftRaw > researchTimeLeft
                ) {
                  researchTimeLeft = timeLeftRaw;
                }

                resourceTimeLeft = `${poly.timeFormat(timeLeftRaw)}`;
                if (res === resources.Soul_Gem) {
                  resourceTimeLeft = `~${resourceTimeLeft}`;
                }
              } else if (
                isArpaProject &&
                res.name === "Knowledge" &&
                res.income > 0
              ) {
                resourceTimeLeft = poly.timeFormat(
                  res.currentQuantity / res.income,
                );
              } else {
                targetTimeLeft = resourceTimeLeft = "Never";
              }
            }

            const progressBarWidth = (res.currentQuantity / resourceCost) * 100;

            const isReplicatingClassName =
              game.global.race.replicator &&
              game.global.race.replicator.res === resource
                ? "is-replicating"
                : "";

            return `
                    <li>
                        <div class='active_targets-resource-row'>
                            <div class='active_targets-resource-text'>
                                <span class='${className}'>${res.title}</span>
                            </div>
                            <div class="percentage-full-progress-bar-wrapper ${isReplicatingClassName}">
                                <div class="percentage-full-progress-bar" style="width: ${progressBarWidth}%;"></div>
                            </div>
                            <div class="active_targets-time-left">${resourceTimeLeft}</div>
                        </div>
                    </li>`;
          })
          .join("");

        if (isMultiSegmented) {
          targetSegments = `(${target.count} / ${target.gameMax})`;

          const segmentedTimeLeft = getMultiSegmentedTimeLeft(target);
          targetTimeLeft = `${segmentedTimeLeft.timeLeft} <span class="has-text-danger">(${segmentedTimeLeft.resource})</span>`;
        }

        if (target instanceof Technology && targetTimeLeft === "") {
          targetTimeLeft = poly.timeFormat(researchTimeLeft);
        }

        const targetNameDisplay = `<span class="active-target-title name">${targetName} </span><span class="active-target-title time">${targetTimeLeft} <span class="active-target-segments has-text-special">${targetSegments}</span></span>`;

        // for finding element in queue
        let queueid = "";
        if (type === "buildings") {
          queueid = isTablessBuilding
            ? `${target.id}`
            : `${target._tab}-${target.id}`;
        } else if (type === "arpa") {
          queueid = `${target._tab}${target.id}`;
        } else if (type === "research" || type === "triggers") {
          queueid = target.id;
        }

        return `
                    <li class="active-target-li">
                        ${targetNameDisplay} <span class="active-target-remove-x ${type}" data-queueid="${queueid}" data-type="${type}">＋</span>
                        <ul class="active_targets-sub-list">
                            ${costsHTML}
                        </ul>
                    </li>
                `;
      }),
    );
  }

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

  function getTooltipInfo(obj) {
    let notes = [];
    if (obj === buildings.NeutronCitadel) {
      let diff =
        getCitadelConsumption(obj.stateOnCount + 1) -
        getCitadelConsumption(obj.stateOnCount);
      notes.push(
        `Next level will increase total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }
    if (obj === buildings.SpireMechBay && MechManager.initLab()) {
      notes.push(
        `Current team potential: ${getNiceNumber(MechManager.mechsPotential)}`,
      );
      let supplyCollected = MechManager.activeMechs
        .filter((mech) => mech.size === "collector")
        .reduce(
          (sum, mech) => sum + mech.power * MechManager.collectorValue,
          0,
        );
      if (supplyCollected > 0) {
        notes.push(`Supplies collected: ${getNiceNumber(supplyCollected)} /s`);
      }
    }

    if (
      (obj instanceof Technology ||
        (!settings.autoARPA && obj._tab === "arpa") ||
        (!settings.autoBuild && obj._tab !== "arpa")) &&
      !state.queuedTargetsAll.includes(obj) &&
      !state.triggerTargets.includes(obj)
    ) {
      let conflict = getCostConflict(obj);
      if (conflict) {
        notes.push(
          `Conflicts with ${conflict.actionList
            .map((action) => {
              return `<span class="has-text-info">${action}</span>`;
            })
            .join(", ")} for ${conflict.resList
            .map((res) => {
              return `<span class="has-text-info">${res}</span>`;
            })
            .join(", ")} (${conflict.obj.cause})`,
        );
      }
    }

    if (obj instanceof Technology) {
      if (state.queuedTargetsAll.includes(obj)) {
        notes.push("Queued research, processing...");
      } else if (state.triggerTargets.includes(obj)) {
        notes.push("Active trigger, processing...");
      } else {
        let conflict = getTechConflict(obj);
        if (conflict) {
          notes.push(conflict);
        }
      }
    }

    if (obj === buildings.GorddonFreighter && haveTech("banking", 13)) {
      let count = obj.stateOnCount;
      let total = ((1 + (count + 1) * 0.03) / (1 + count * 0.03) - 1) * 100;
      let crew = total / 3;
      notes.push(
        `Next level will increase ${
          buildings.AlphaExchange.title
        } storage by +${getNiceNumber(total)}% (+${getNiceNumber(
          crew,
        )}% per crew)`,
      );
    }
    if (obj === buildings.Alien1SuperFreighter && haveTech("banking", 13)) {
      let count = obj.stateOnCount;
      let total = ((1 + (count + 1) * 0.08) / (1 + count * 0.08) - 1) * 100;
      let crew = total / 5;
      notes.push(
        `Next level will increase ${
          buildings.AlphaExchange.title
        } storage by +${getNiceNumber(total)}% (+${getNiceNumber(
          crew,
        )}% per crew)`,
      );
    }
    if (
      obj === buildings.Hospital ||
      (obj === buildings.BootCamp && game.global.race["artifical"]) ||
      (obj === buildings.EnceladusBase && game.global.race["orbit_decayed"])
    ) {
      notes.push(`~${getNiceNumber(getHealingRate())} soldiers healed per day`);
    }
    if (obj === buildings.Hospital) {
      let growth = 1 / (getGrowthRate() * 4); // Fast loop, 4 times per second
      notes.push(`~${getNiceNumber(growth)} seconds to increase population`);
    }
    if (obj === buildings.PortalCarport && jobs.HellSurveyor.count > 0) {
      let influx = 5 * (1 + buildings.BadlandsAttractor.stateOnCount * 0.22);
      let demons = (influx * 10 + influx * 50) / 2;
      let divisor = getGovernor() === "sports" ? 1100 : 1000;
      divisor *= traitVal("blurry", 0, "+");
      divisor *= traitVal("instinct", 0, "+");
      divisor += haveTech("infernite", 5) ? 250 : 0;
      let danger = demons / divisor;
      let risk = 10 - Math.min(10, jobs.HellSurveyor.count) / 2;
      let rate = (danger / 2) * Math.min(1, danger / risk);
      let wreck = 1 / (rate / 5); // Long loop, once per 5 seconds
      notes.push(
        `Up to ~${getNiceNumber(
          wreck,
        )} seconds to break car (with full supression)`,
      );
    }
    if (obj === buildings.PortalRepairDroid) {
      let wallRepair = Math.round(200 * 0.95 ** obj.stateOnCount) / 4;
      let carRepair = Math.round(180 * 0.92 ** obj.stateOnCount) / 4;
      notes.push(`${getNiceNumber(wallRepair)} seconds to repair 1% of wall`);
      notes.push(`${getNiceNumber(carRepair)} seconds to repair car`);
    }
    if (obj === buildings.BadlandsAttractor) {
      let influx = 5 * (1 + obj.stateOnCount * 0.22);
      let gem_chance =
        game.global.stats.achieve.technophobe?.l >= 5 ? 9000 : 10000;
      if (
        game.global.race.universe === "evil" &&
        resources.Dark.currentQuantity > 1
      ) {
        let de =
          resources.Dark.currentQuantity *
          (1 + resources.Harmony.currentQuantity * 0.01);
        gem_chance -= Math.round(Math.log2(de) * 2);
      }
      gem_chance = Math.round(gem_chance * 0.948 ** obj.stateOnCount);
      gem_chance = Math.round(gem_chance * traitVal("ghostly", 2, "-"));
      gem_chance = Math.max(12, gem_chance);
      let drop = (1 / gem_chance) * 100;
      notes.push(
        `~${getNiceNumber(drop)}% chance to find ${resources.Soul_Gem.title}`,
      );
      notes.push(
        `Up to ~${getNiceNumber(influx * 10)}-${getNiceNumber(
          influx * 50,
        )} demons spawned per day`,
      );
    }
    if (obj === buildings.Smokehouse) {
      let spoilage = 50 * 0.9 ** obj.count;
      notes.push(
        `${getNiceNumber(spoilage)}% of stored ${
          resources.Food.title
        } spoiled per second`,
      );
    }
    if (obj === buildings.LakeCoolingTower) {
      let coolers = buildings.LakeCoolingTower.stateOnCount;
      let current = 500 * 0.92 ** coolers;
      let next = 500 * 0.92 ** (coolers + 1);
      let diff =
        (current - next) *
        buildings.LakeHarbor.stateOnCount *
        (game.global.race["emfield"] ? 1.5 : 1);
      notes.push(
        `Next level will decrease total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }
    if (obj === buildings.DwarfShipyard) {
      if (settings.autoFleet && FleetManagerOuter.nextShipMsg) {
        notes.push(FleetManagerOuter.nextShipMsg);
      }
    }
    if (obj === buildings.IsleSpiritBattery) {
      // Pulled from game's edenic.js in v1.4.8
      const batteries = buildings.IsleSpiritBattery.stateOnCount;
      let coefficient = 0.9;

      if (
        game.global.race["warlord"] &&
        buildings.AsphodelCorruptor &&
        game.global.tech?.asphodel >= 13
      ) {
        const corruptors = buildings.AsphodelCorruptor.on;
        coefficient = 1 - (1 + (corruptors || 0) * 0.03) / 10;
      }

      const current = 18_000 * coefficient ** batteries;
      const next = 18_000 * coefficient ** (batteries + 1);
      const diff =
        (current - next) *
        buildings.IsleSpiritVacuum.stateOnCount *
        (game.global.race["emfield"] ? 1.5 : 1);
      notes.push(
        `Next level will decrease total consumption by ${getNiceNumber(
          diff,
        )} MW`,
      );
    }

    if (obj.extraDescription) {
      notes.push(obj.extraDescription);
    }
    return notes.join("<br>");
  }

  function tooltipObserverCallback(mutations) {
    if (!settings.masterScriptToggle || document.hidden) {
      return;
    }
    mutations.forEach((mutation) =>
      mutation.addedNodes.forEach((node) => {
        if (node.id === "popper") {
          let popperObserver = new MutationObserver((popperMutations) => {
            // Add tooltips once again when popper cleared
            if (!node.querySelector(".script-tooltip")) {
              popperObserver.disconnect();
              addTooltip(node);
              popperObserver.observe(node, { childList: true });
            }
          });
          addTooltip(node);
          popperObserver.observe(node, { childList: true });
        }
      }),
    );
  }

  const infusionStep = {
    "blood-lust": 15,
    "blood-illuminate": 12,
    "blood-greed": 16,
    "blood-hoarder": 14,
    "blood-artisan": 8,
    "blood-attract": 4,
    "blood-wrath": 2,
  };
  function addTooltip(node) {
    $(node).append(`<span class="script-tooltip" hidden></span>`);
    let dataId = node.dataset.id;
    // Tooltips for things with no script objects
    if (dataId === "powerStatus") {
      $(node).append(
        `<p class="modal_bd"><span>Disabled</span><span class="has-text-danger">${getNiceNumber(
          resources.Power.maxQuantity,
        )}</span></p>`,
      );
      return;
    } else if (infusionStep[dataId]) {
      $(node)
        .find(".costList .res-Blood_Stone")
        .append(` (+${infusionStep[dataId]})`);
      return;
    } else if (state.tooltips[dataId]) {
      $(node).append(
        `<div style="border-top: solid .0625rem #999">${state.tooltips[dataId]}</div>`,
      );
      return;
    }

    let match = null;
    let obj = null;
    if ((match = dataId.match(/^popArpa([a-z_-]+)\d*$/))) {
      // "popArpa[id-with-no-tab][quantity]" for projects
      obj = arpaIds["arpa" + match[1]];
    } else if ((match = dataId.match(/^q([A-Za-z_-]+)\d*$/))) {
      // "q[id][order]" for buildings in queue
      obj = buildingIds[match[1]] || arpaIds[match[1]];
    } else {
      // "[id]" for buildings and researches
      obj = buildingIds[dataId] || techIds[dataId];
    }
    if (!obj || (obj instanceof Technology && obj.isResearched())) {
      return;
    }

    // Flair, added before other descriptions
    if (
      obj === buildings.BlackholeStellarEngine &&
      game.global.race.universe !== "magic" &&
      buildings.BlackholeMassEjector.count > 0 &&
      game.global.interstellar.stellar_engine.exotic < 0.025
    ) {
      let massPerSec =
        resources.Elerium.atomicMass *
          game.global.interstellar.mass_ejector.Elerium +
          resources.Infernite.atomicMass *
            game.global.interstellar.mass_ejector.Infernite || -1;
      let missingExotics =
        (0.025 - game.global.interstellar.stellar_engine.exotic) * 1e10;
      $(node).append(
        `<div id="popTimer" class="flair has-text-advanced">Contaminated in [${poly.timeFormat(
          missingExotics / massPerSec,
        )}]</div>`,
      );
    }
    if (obj === buildings.TauRedJeff && buildings.TauRedWomlingLab.count > 0) {
      let expo = game.global.stats.achieve.overlord?.l >= 5 ? 4.9 : 5;
      expo -= game.global.race["lone_survivor"] ? 0.1 : 0;
      let nextTech = (game.global.tech.womling_tech + 2) ** expo;
      let curTech = game.global.tauceti.womling_lab.tech;
      let completion = Math.floor((curTech / nextTech) * 100);
      $(node).find("div:eq(1)>div:eq(5)").append(` (${completion}%)`);
      let rate =
        (game.global.tauceti.womling_lab.scientist / 2) *
        Math.min(1, game.global.tauceti.womling_lab.scientist * 0.1);
      let eta = rate > 0 ? Math.ceil((nextTech - curTech) / rate) : -1;
      $(node).append(
        `<div id="popTimer" class="flair has-text-advanced">Next Tech Level in ~[${poly.timeFormat(
          eta,
        )}]</div>`,
      );
    }

    let description = getTooltipInfo(obj);
    if (description) {
      $(node).append(
        `<div style="border-top: solid .0625rem #999">${description}</div>`,
      );
    }
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

  function showCustomRaceImportStatus(message, danger = false) {
    let status = $("#scriptCustomRaceImportStatus");
    if (status.length === 0) {
      status = $('<p id="scriptCustomRaceImportStatus"></p>');
      $("#celestialLab .create").before(status);
    }
    status
      .toggleClass("has-text-danger", danger)
      .toggleClass("has-text-warning", !danger)
      .text(message);
  }

  function getCustomRacePreset(raw = false) {
    let source = raw ? settingsRaw : settings;
    let presets = source.prestigeCustomRacePresets;
    if (!Array.isArray(presets) || presets.length === 0) {
      return { name: "General", json: "" };
    }
    let index = Number.parseInt(source.prestigeCustomRacePreset, 10);
    if (!Number.isInteger(index) || index < 0 || index >= presets.length) {
      index = 0;
    }
    let preset = presets[index];
    return {
      name:
        typeof preset?.name === "string" && preset.name.trim()
          ? preset.name.trim()
          : `Preset ${index + 1}`,
      json: typeof preset?.json === "string" ? preset.json.trim() : "",
    };
  }

  function refreshCustomRacePresetSelectors() {
    $(".script_prestigeCustomRacePreset").each(function () {
      let select = $(this).empty();
      (settingsRaw.prestigeCustomRacePresets ?? []).forEach((preset, index) =>
        $("<option></option>")
          .val(String(index))
          .text(preset.name || `Preset ${index + 1}`)
          .appendTo(select),
      );
      select.val(settingsRaw.prestigeCustomRacePreset);
    });
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

  function buildCustomRacePresetEditor(modal) {
    modal.empty().off("*").addClass("celestialLab");
    modal.closest(".script-modal-content").addClass("custom-race-modal");
    modal.append(`
      <style>
        .script-modal-content.custom-race-modal { width: min(96vw, 1400px); margin-top: 2vh; margin-bottom: 2vh; }
        .script-modal-content.custom-race-modal .script-modal-body { max-height: calc(96vh - 70px); overflow-y: auto; }
        #scriptModalBody.celestialLab { font-size: .92rem; }
        #scriptModalBody.celestialLab .button,
        #scriptModalBody.celestialLab input.input,
        #scriptModalBody.celestialLab select { height: 2em; min-height: 2em; font-size: .92rem; padding-top: 0; padding-bottom: 0; }
        #scriptModalBody.celestialLab .fields { margin-bottom: .35rem; }
        #scriptModalBody.celestialLab .trait_selection .field { margin-bottom: .1rem; }
        #scriptModalBody.celestialLab .script-custom-trait .rc { min-width: 4.8rem; text-align: center; }
        #scriptModalBody.celestialLab .script-custom-effect,
        #scriptModalBody.celestialLab .script-custom-traits { scrollbar-color: #777 transparent; scrollbar-width: auto; }
        #scriptModalBody.celestialLab .script-custom-effect::-webkit-scrollbar,
        #scriptModalBody.celestialLab .script-custom-traits::-webkit-scrollbar { width: 10px; }
        #scriptModalBody.celestialLab .script-custom-effect::-webkit-scrollbar-thumb,
        #scriptModalBody.celestialLab .script-custom-traits::-webkit-scrollbar-thumb { background: #777; border-radius: 5px; }
      </style>`);
    if (
      !Array.isArray(settingsRaw.prestigeCustomRacePresets) ||
      settingsRaw.prestigeCustomRacePresets.length === 0
    ) {
      settingsRaw.prestigeCustomRacePresets = [{ name: "General", json: "" }];
      settingsRaw.prestigeCustomRacePreset = "0";
    }
    let presetIndex = Number.parseInt(settingsRaw.prestigeCustomRacePreset, 10);
    if (
      !Number.isInteger(presetIndex) ||
      presetIndex < 0 ||
      presetIndex >= settingsRaw.prestigeCustomRacePresets.length
    ) {
      presetIndex = 0;
      settingsRaw.prestigeCustomRacePreset = "0";
    }
    let preset = settingsRaw.prestigeCustomRacePresets[presetIndex];
    let draft = customRaceDraftFromPreset(preset);

    modal.append(
      '<div><h3 class="has-text-danger">Custom Race Presets</h3> - <span class="has-text-warning">Automation Custom Lab</span></div>',
    );
    let controls = $(
      '<div class="fields" style="margin-bottom:10px;"></div>',
    ).appendTo(modal);
    let presetSelect = $(
      '<select class="select" style="width:220px;"></select>',
    ).appendTo(controls);
    settingsRaw.prestigeCustomRacePresets.forEach((item, index) => {
      $("<option></option>")
        .val(String(index))
        .text(item.name || `Preset ${index + 1}`)
        .appendTo(presetSelect);
    });
    presetSelect.val(String(presetIndex));
    let presetName = $(
      '<input class="input" type="text" maxlength="60" style="width:180px;" />',
    )
      .val(preset.name || `Preset ${presetIndex + 1}`)
      .appendTo(controls);
    let addButton = $(
      '<button class="button" type="button">Add</button>',
    ).appendTo(controls);
    let cloneButton = $(
      '<button class="button" type="button">Clone</button>',
    ).appendTo(controls);
    let deleteButton = $(
      '<button class="button" type="button">Delete</button>',
    ).appendTo(controls);
    let captureButton = $(
      '<button class="button" type="button">Capture saved custom</button>',
    ).appendTo(controls);

    let summary = $(
      '<div class="has-text-warning" style="margin:8px 0; font-weight:bold;"></div>',
    ).appendTo(modal);
    let identity = $(
      '<details style="margin:4px 0;"><summary class="has-text-caution">Race names and description</summary></details>',
    ).appendTo(modal);
    let form = $(
      '<div class="fields" style="display:grid; grid-template-columns:1fr 1fr; gap:6px 14px;"></div>',
    ).appendTo(identity);
    const addTextField = (key, label, max) => {
      let row = $('<label style="display:flex; gap:8px;"></label>').appendTo(
        form,
      );
      $("<span></span>").text(label).appendTo(row);
      let input = $(
        `<input class="input" type="text" maxlength="${max}" style="flex:1;" />`,
      )
        .val(draft[key])
        .appendTo(row);
      input.on("change", function () {
        draft[key] = this.value.trim();
        saveDraft();
      });
    };
    addTextField("name", "Name", 20);
    addTextField("entity", "Entity", 40);
    addTextField("home", "Homeworld", 20);
    addTextField("red", "Red planet", 20);
    addTextField("hell", "Hell", 20);
    addTextField("gas", "Gas giant", 20);
    addTextField("gas_moon", "Gas moon", 20);
    addTextField("dwarf", "Dwarf planet", 20);

    let descRow = $(
      '<label style="display:block; margin-top:6px;"></label>',
    ).appendTo(identity);
    $("<span>Description</span>").appendTo(descRow);
    $(
      '<textarea class="textarea" maxlength="255" style="width:100%; min-height:55px;"></textarea>',
    )
      .val(draft.desc)
      .on("change", function () {
        draft.desc = this.value.trim();
        saveDraft();
      })
      .appendTo(descRow);
    let outerNames = $(
      '<details style="margin-top:6px;"><summary class="has-text-caution">Outer-system names</summary><div class="fields" style="display:grid; grid-template-columns:1fr 1fr; gap:6px 14px;"></div></details>',
    ).appendTo(identity);
    let outerForm = outerNames.find("div");
    const addOuterField = (key, label) => {
      let row = $('<label style="display:flex; gap:8px;"></label>').appendTo(
        outerForm,
      );
      $("<span></span>").text(label).appendTo(row);
      $('<input class="input" type="text" maxlength="20" style="flex:1;" />')
        .val(draft[key])
        .on("change", function () {
          draft[key] = this.value.trim();
          saveDraft();
        })
        .appendTo(row);
    };
    addOuterField("titan", "Titan");
    addOuterField("enceladus", "Enceladus");
    addOuterField("triton", "Triton");
    addOuterField("eris", "Eris");

    let raceControls = $(
      '<div class="genus_selection" style="display:flex; gap:18px; margin:8px 0;"></div>',
    ).appendTo(modal);
    let genusLabel = $(
      '<label class="genus"><span class="has-text-caution header">Genus </span></label>',
    ).appendTo(raceControls);
    let genusSelect = $("<select></select>").appendTo(genusLabel);
    Object.keys(poly.genus_traits)
      .filter(
        (genus) =>
          genus !== "hybrid" &&
          (genus === draft.genus ||
            game.global.stats.achieve[`genus_${genus}`]?.l),
      )
      .forEach((genus) =>
        $("<option></option>")
          .val(genus)
          .text(game.loc(`genelab_genus_${genus}`))
          .appendTo(genusSelect),
      );
    genusSelect.val(draft.genus).on("change", function () {
      draft.genus = this.value;
      saveDraft();
      updateSummary();
    });
    let fanaticLabel = $(
      '<label class="fanatic"><span class="has-text-caution header">Fanaticism </span></label>',
    ).appendTo(raceControls);
    let fanaticSelect = $("<select></select>").appendTo(fanaticLabel);
    let genusInfo = $(
      '<div class="has-text-info" style="margin-bottom:6px;"></div>',
    ).appendTo(modal);
    let effectPanel = $(
      '<div class="script-custom-effect" style="height:112px; overflow-y:scroll; overflow-x:hidden; overflow-wrap:anywhere; white-space:normal; scrollbar-gutter:stable; overscroll-behavior:contain; pointer-events:auto; position:relative; z-index:2; padding:5px 9px; margin-bottom:5px; border-top:1px solid #777; border-bottom:1px solid #777; text-align:left;"></div>',
    ).appendTo(modal);
    let activeTrait = null;
    const showTraitEffect = (id) => {
      activeTrait = id;
      let trait = game.traits[id];
      let rank = draft.ranks[id] ?? 1;
      effectPanel.empty();
      $("<strong class='has-text-warning'></strong>")
        .text(`${trait.name} · r${rank}`)
        .appendTo(effectPanel);
      $("<div class='desc'></div>")
        .html(typeof trait.desc === "function" ? trait.desc() : trait.desc)
        .appendTo(effectPanel);
      $(
        `<div class="effect ${
          trait.val >= 0 ? "has-text-success" : "has-text-danger"
        }"></div>`,
      )
        .html(customRaceTraitEffect(id, rank))
        .appendTo(effectPanel);
    };
    effectPanel.text("Hover or select a trait to see its current-rank effect.");

    let filter = $(
      '<input class="input" type="search" placeholder="Filter traits..." style="width:100%; margin:4px 0 8px;" />',
    ).appendTo(identity);
    let traitsArea = $(
      '<div class="script-custom-traits" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; max-height:52vh; overflow-y:scroll; overflow-x:hidden; scrollbar-gutter:stable;"></div>',
    ).appendTo(modal);
    let positiveArea = $(
      '<div class="cool trait_selection"><h4 class="has-text-success">Positive traits</h4></div>',
    ).appendTo(traitsArea);
    let negativeArea = $(
      '<div class="lame trait_selection"><h4 class="has-text-danger">Negative traits</h4></div>',
    ).appendTo(traitsArea);
    let traitRows = [];
    let lastCategory = { positive: null, negative: null };
    for (let [id, trait] of customRaceEditorTraits(draft)) {
      let side = trait.val >= 0 ? "positive" : "negative";
      let targetArea = trait.val >= 0 ? positiveArea : negativeArea;
      if (lastCategory[side] !== trait.taxonomy) {
        lastCategory[side] = trait.taxonomy;
        $("<h5 class='has-text-caution'></h5>")
          .text(game.loc(`genelab_traits_${trait.taxonomy}`) ?? trait.taxonomy)
          .appendTo(targetArea);
      }
      let row = $(
        `<div class="script-custom-trait field t${id}" style="display:flex; align-items:center; gap:5px; padding:2px 0;"></div>`,
      ).appendTo(targetArea);
      row.attr(
        "data-search",
        `${trait.name} ${id} ${trait.taxonomy}`.toLowerCase(),
      );
      row.on("mouseenter click", () => showTraitEffect(id));
      let checkbox = $('<input type="checkbox" />')
        .prop("checked", draft.traitlist.includes(id))
        .appendTo(row);
      $(
        `<span class="${trait.val >= 0 ? "has-text-success" : "has-text-danger"}" style="flex:1;"></span>`,
      )
        .text(`${trait.name} [${trait.val >= 0 ? "+" : ""}${trait.val}]`)
        .attr(
          "title",
          typeof trait.desc === "function" ? trait.desc() : trait.desc,
        )
        .appendTo(row);
      let ranks = customRaceRankOptions(id);
      let currentRank = draft.ranks[id] ?? 1;
      if (!ranks.includes(currentRank)) ranks.push(currentRank);
      ranks.sort((a, b) => a - b);
      let rankWrap = $(
        '<span class="rc" style="white-space:nowrap;"></span>',
      ).appendTo(row);
      let rankDown = $(
        '<span class="sub has-text-danger" role="button">−</span>',
      ).appendTo(rankWrap);
      let rankValue = $(
        '<span class="has-text-warning" style="padding:0 4px;"></span>',
      ).appendTo(rankWrap);
      let rankUp = $(
        '<span class="add has-text-success" role="button">+</span>',
      ).appendTo(rankWrap);
      const updateRank = () => {
        currentRank = draft.ranks[id] ?? 1;
        rankValue.text(`r${currentRank}`);
        rankWrap.toggleClass("inactive-row", !checkbox.prop("checked"));
        if (activeTrait === id) showTraitEffect(id);
      };
      checkbox.on("change", function () {
        if (this.checked) {
          if (!draft.traitlist.includes(id)) draft.traitlist.push(id);
          draft.ranks[id] = currentRank;
        } else {
          draft.traitlist = draft.traitlist.filter((traitId) => traitId !== id);
          delete draft.ranks[id];
          if (draft.fanaticism === id) draft.fanaticism = false;
        }
        updateRank();
        saveDraft();
        updateSummary();
      });
      rankDown.on("click", function () {
        if (!checkbox.prop("checked")) return;
        let index = ranks.indexOf(currentRank);
        if (index > 0) draft.ranks[id] = ranks[index - 1];
        updateRank();
        saveDraft();
        updateSummary();
      });
      rankUp.on("click", function () {
        if (!checkbox.prop("checked")) return;
        let index = ranks.indexOf(currentRank);
        if (index < ranks.length - 1) draft.ranks[id] = ranks[index + 1];
        updateRank();
        saveDraft();
        updateSummary();
      });
      updateRank();
      traitRows.push(row);
    }
    filter.on("input", function () {
      let query = this.value.trim().toLowerCase();
      traitRows.forEach((row) =>
        row.toggle(!query || row.attr("data-search").includes(query)),
      );
    });

    let advanced = $(
      '<details style="margin-top:10px;"><summary>Advanced JSON import/export</summary></details>',
    ).appendTo(modal);
    let rawJson = $(
      '<textarea class="textarea" style="width:100%; min-height:160px;"></textarea>',
    ).appendTo(advanced);
    let loadRaw = $(
      '<button class="button" type="button">Load JSON into editor</button>',
    ).appendTo(advanced);
    let rawStatus = $('<span style="margin-left:8px;"></span>').appendTo(
      advanced,
    );

    function saveDraft() {
      draft.genes = 0;
      preset.json = JSON.stringify(draft, null, 2);
      rawJson.val(preset.json);
      state.customRaceImportAttempt = null;
      updateSettingsFromState();
    }
    function updateSummary() {
      let balance = customRaceGeneBalance(draft);
      summary
        .toggleClass("has-text-success", balance >= 0)
        .toggleClass("has-text-danger", balance < 0)
        .text(
          `Genes remaining: ${balance} · ${draft.traitlist.length} selected traits · live lab validation still applies`,
        );
      let builtIns = Object.keys(poly.genus_traits[draft.genus] ?? {})
        .filter((id) => !(draft.genus === "fungi" && id === "spores"))
        .map((id) => game.traits[id]?.name ?? id);
      genusInfo.text(`Genus traits: ${builtIns.join(", ") || "none"}`);
      fanaticSelect.empty();
      $("<option></option>")
        .val("")
        .text("Automatic / none")
        .appendTo(fanaticSelect);
      draft.traitlist.forEach((id) =>
        $("<option></option>")
          .val(id)
          .text(game.traits[id]?.name ?? id)
          .appendTo(fanaticSelect),
      );
      fanaticSelect.val(draft.fanaticism || "");
    }
    fanaticSelect.on("change", function () {
      draft.fanaticism = this.value || false;
      saveDraft();
    });
    presetSelect.on("change", function () {
      settingsRaw.prestigeCustomRacePreset = this.value;
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    presetName.on("change", function () {
      preset.name = this.value.trim() || `Preset ${presetIndex + 1}`;
      updateSettingsFromState();
      presetSelect.find(`option[value="${presetIndex}"]`).text(preset.name);
      refreshCustomRacePresetSelectors();
    });
    addButton.on("click", function () {
      settingsRaw.prestigeCustomRacePresets.push({
        name: `Preset ${settingsRaw.prestigeCustomRacePresets.length + 1}`,
        json: "",
      });
      settingsRaw.prestigeCustomRacePreset = String(
        settingsRaw.prestigeCustomRacePresets.length - 1,
      );
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    cloneButton.on("click", function () {
      let clone = {
        name: `${preset.name || `Preset ${presetIndex + 1}`} copy`,
        json: preset.json,
      };
      settingsRaw.prestigeCustomRacePresets.push(clone);
      settingsRaw.prestigeCustomRacePreset = String(
        settingsRaw.prestigeCustomRacePresets.length - 1,
      );
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    deleteButton.on("click", function () {
      if (settingsRaw.prestigeCustomRacePresets.length > 1) {
        settingsRaw.prestigeCustomRacePresets.splice(presetIndex, 1);
      } else {
        settingsRaw.prestigeCustomRacePresets[0] = {
          name: "General",
          json: "",
        };
      }
      settingsRaw.prestigeCustomRacePreset = "0";
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    captureButton.on("click", function () {
      let savedRace = game.global.custom?.race0;
      if (!savedRace) {
        alert("There is no saved custom race to capture yet.");
        return;
      }
      preset.json = JSON.stringify(
        {
          ...savedRace,
          genes: 0,
          traitlist: (savedRace.traits ?? []).slice(),
          traits: undefined,
        },
        (key, value) => (value === undefined ? undefined : value),
        2,
      );
      buildCustomRacePresetEditor(modal);
    });
    loadRaw.on("click", function () {
      try {
        let parsed = JSON.parse(rawJson.val());
        if (!parsed || typeof parsed !== "object")
          throw new Error("not an object");
        preset.json = JSON.stringify(parsed, null, 2);
        rawStatus.removeClass("has-text-danger").text("");
        updateSettingsFromState();
        buildCustomRacePresetEditor(modal);
      } catch (error) {
        rawStatus
          .addClass("has-text-danger")
          .text(`Invalid JSON: ${error.message}`);
      }
    });
    saveDraft();
    updateSummary();
  }

  function importCustomRaceIntoLab() {
    let preset = getCustomRacePreset();
    let attemptKey = `${settings.prestigeCustomRacePreset}:${preset.json}`;
    if (state.customRaceImportAttempt === attemptKey) {
      return false;
    }
    state.customRaceImportAttempt = attemptKey;

    let template;
    try {
      template = JSON.parse(preset.json);
    } catch (error) {
      showCustomRaceImportStatus(
        `Automatic custom-race import of “${preset.name}” paused: invalid JSON (${error.message}).`,
        true,
      );
      return false;
    }

    let lab = getVueById("celestialLab");
    let traits = template.traitlist ?? template.traits;
    if (
      !lab?.g ||
      !Array.isArray(traits) ||
      typeof template.genus !== "string"
    ) {
      showCustomRaceImportStatus(
        "Automatic custom-race import paused: expected a game custom-race export with genus and traitlist.",
        true,
      );
      return false;
    }
    if (new Set(traits).size !== traits.length) {
      showCustomRaceImportStatus(
        "Automatic custom-race import paused: traitlist contains duplicates.",
        true,
      );
      return false;
    }

    let requiredText = [
      "name",
      "desc",
      "entity",
      "home",
      "red",
      "hell",
      "gas",
      "gas_moon",
      "dwarf",
    ];
    let missingText = requiredText.filter(
      (key) => typeof template[key] !== "string" || template[key].length === 0,
    );
    if (missingText.length > 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: missing ${missingText.join(", ")}.`,
        true,
      );
      return false;
    }

    if (
      !game.global.stats.achieve[`genus_${template.genus}`]?.l &&
      template.genus !== lab.g.genus
    ) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: ${template.genus} genus is not unlocked.`,
        true,
      );
      return false;
    }

    let unavailableTraits = traits.filter(
      (trait) =>
        typeof trait !== "string" ||
        !/^[a-z0-9_]+$/.test(trait) ||
        document.querySelector(`#celestialLab .t${trait}`) === null,
    );
    if (unavailableTraits.length > 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: unavailable traits ${unavailableTraits.join(", ")}.`,
        true,
      );
      return false;
    }

    let ranks = template.ranks ?? {};
    if (
      typeof ranks !== "object" ||
      Array.isArray(ranks) ||
      Object.entries(ranks).some(
        ([trait, rank]) =>
          !traits.includes(trait) ||
          typeof rank !== "number" ||
          !Number.isFinite(rank) ||
          rank <= 0 ||
          !customRaceRankOptions(trait).includes(rank),
      )
    ) {
      showCustomRaceImportStatus(
        "Automatic custom-race import paused: ranks must contain positive numeric values for selected traits only.",
        true,
      );
      return false;
    }

    let fanaticism = template.fanaticism || false;
    if (fanaticism && !traits.includes(fanaticism)) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: Fanaticism trait ${fanaticism} is not selected.`,
        true,
      );
      return false;
    }

    let textLimits = {
      name: 20,
      desc: 255,
      entity: 40,
      home: 20,
      red: 20,
      hell: 20,
      gas: 20,
      gas_moon: 20,
      dwarf: 20,
    };
    requiredText.forEach(
      (key) => (lab.g[key] = template[key].substring(0, textLimits[key])),
    );
    ["titan", "enceladus", "triton", "eris"].forEach((key) => {
      if (typeof template[key] === "string" && template[key].length > 0) {
        lab.g[key] = template[key];
      }
    });
    lab.g.genus = template.genus;
    lab.g.traitlist = traits.slice();
    lab.g.fanaticism = fanaticism;
    lab.g.ranks ??= {};
    Object.keys(lab.g.ranks).forEach((trait) => delete lab.g.ranks[trait]);
    Object.assign(lab.g.ranks, ranks);
    lab.geneEdit();

    if (lab.g.genes < 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: template exceeds the live gene budget by ${Math.abs(lab.g.genes)}. Edit the lab or paste a cheaper export.`,
        true,
      );
      return false;
    }
    return true;
  }

  function automateLab() {
    let createCustom = document.querySelector("#celestialLab .create button");
    if (createCustom) {
      updateOverrides(); // Game doesn't tick in lab. Update settings here.
      if (
        settings.masterScriptToggle &&
        settings.autoPrestige &&
        ["ascension", "terraform", "apotheosis"].includes(settings.prestigeType)
      ) {
        let customMode = ["reuse", "pause", "import"].includes(
          settings.prestigeCustomRaceMode,
        )
          ? settings.prestigeCustomRaceMode
          : "reuse";
        if (customMode !== "import") {
          state.customRaceImportAttempt = null;
        }
        if (customMode === "pause") {
          showCustomRaceImportStatus(
            "Auto Prestige paused by Custom race handling: Pause in lab.",
          );
          return;
        }
        if (customMode === "import" && !importCustomRaceIntoLab()) {
          return;
        }
        // The first lab opens with the game's empty/default Zombie design. Never submit that
        // implicitly in reuse mode; wait for a saved race or an explicit import instead.
        if (customMode === "reuse" && !game.global.custom?.race0) {
          showCustomRaceImportStatus(
            "Auto Prestige paused: no saved custom race. Design one here or select Import selected preset in Prestige settings.",
          );
          return;
        }
        state.goal = "GameOverMan";
        createCustom.click();
        return;
      }
    }
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

  function updateDebugData() {
    state.forcedUpdate = true;
    game.updateDebugData();
    state.forcedUpdate = false;
  }

  function addScriptStyle() {
    // background = @html-background, alt = @market-item-background, hover = (alt - 0x111111), border = @primary-border, primary = @primary-color
    let cssData = {
      dark: {
        background: "#282f2f",
        alt: "#0f1414",
        hover: "#010303",
        border: "#ccc",
        primary: "#fff",
        hasTextWarning: "#ffdd57",
      },
      light: {
        background: "#fff",
        alt: "#dddddd",
        hover: "#ccc",
        border: "#000",
        primary: "#000",
        hasTextWarning: "#7a6304",
      },
      night: {
        background: "#282f2f",
        alt: "#1b1b1b",
        hover: "#0a0a0a",
        border: "#ccc",
        primary: "#fff",
        hasTextWarning: "#ffdd57",
      },
      darkNight: {
        background: "#282f2f",
        alt: "#1b1b1b",
        hover: "#0a0a0a",
        border: "#ccc",
        primary: "#b8b8b8",
        hasTextWarning: "#ffcc00",
      },
      redgreen: {
        background: "#282f2f",
        alt: "#1b1b1b",
        hover: "#0a0a0a",
        border: "#ccc",
        primary: "#fff",
        hasTextWarning: "#ffdd57",
      },
      gruvboxLight: {
        background: "#fbf1c7",
        alt: "#f9f5d7",
        hover: "#e8e4c6",
        border: "#3c3836",
        primary: "#3c3836",
        hasTextWarning: "#b57614",
      },
      gruvboxDark: {
        background: "#282828",
        alt: "#1d2021",
        hover: "#0c0f10",
        border: "#3c3836",
        primary: "#ebdbb2",
        hasTextWarning: "#fabd2f",
      },
      orangeSoda: {
        background: "#131516",
        alt: "#292929",
        hover: "#181818",
        border: "#313638",
        primary: "#EBDBB2",
        hasTextWarning: "#F06543",
      },
      dracula: {
        background: "#282a36",
        alt: "#1d2021",
        hover: "#C0F10",
        border: "#44475a",
        primary: "#f8f8f2",
        hasTextWarning: "#f1fa8c",
      },
    };
    let styles = "";
    // Colors for different themes
    for (let [theme, color] of Object.entries(cssData)) {
      styles += `
                html.${theme} .script-modal-content {
                    background-color: ${color.background};
                }

                html.${theme} .script-modal-header {
                    border-color: ${color.border};
                }

                /*
                html.${theme} .script-modal-body .button {
                    background-color: ${color.alt};
                }*/

                html.${theme} .script-modal-body table td,
                html.${theme} .script-modal-body table th {
                    border-color: ${color.border};
                }

                html.${theme} .script-collapsible {
                    background-color: ${color.alt};
                }

                html.${theme} .script-collapsible:after {
                    color: ${color.primary};
                }

                html.${theme} .script-contentactive,
                html.${theme} .script-collapsible:hover {
                    background-color: ${color.hover};
                }

                html.${theme} .percentage-full-progress-bar-wrapper {
                    background-color: ${color.hasTextWarning}15;
                }
                html.${theme} .percentage-full-progress-bar {
                    background-color: ${color.hasTextWarning}75;
                }

                html.${theme} .percentage-full-progress-bar-wrapper.is-replicating {
                    background-image: linear-gradient(135deg,${color.hasTextWarning}30 25%,transparent 25%,transparent 50%,${color.hasTextWarning}30 50%,${color.hasTextWarning}30 75%,transparent 75%,transparent);
                }

                html.${theme} #active_targets .target-type-box {
                    background-color: ${color.alt}75;
                }`;
    }
    styles += `
            .script-lastcolumn:after { float: right; content: "\\21c5"; }
            .script-refresh:after { float: right; content: "\\21ba"; cursor: pointer; }
            .script-draggable { cursor: move; cursor: grab; }
            .script-draggable:active { cursor: grabbing !important; }
            .ui-sortable-helper { display: table; cursor: grabbing !important; }

            .script-collapsible {
                color: white;
                cursor: pointer;
                padding: 18px;
                width: 100%;
                border: none;
                text-align: left;
                outline: none;
                font-size: 15px;
            }

            .script-collapsible:after {
                content: '\\002B';
                color: white;
                font-weight: bold;
                float: right;
                margin-left: 5px;
            }

            .script-contentactive:after {
                content: "\\2212";
            }

            .script-content {
                padding: 0 18px;
                display: none;
                //max-height: 0;
                overflow: hidden;
                //transition: max-height 0.2s ease-out;
            }

            .script-searchsettings {
                width: 100%;
                margin-top: 20px;
                margin-bottom: 10px;
            }

            /* Open script options button */
            .s-options-button {
                padding-right: 2px;
                cursor: pointer;
            }

            /* The Modal (background) */
            .script-modal {
              display: none; /* Hidden by default */
              position: fixed; /* Stay in place */
              z-index: 100; /* Sit on top */
              left: 0;
              top: 0;
              width: 100%; /* Full width */
              height: 100%; /* Full height */
              background-color: rgb(0,0,0); /* Fallback color */
              background-color: rgba(10,10,10,.86); /* Blackish w/ opacity */
              overflow-y: auto; /* Allow scrollbar */
            }

            /* Modal Content/Box */
            .script-modal-content {
                position: relative;
                margin: auto;
                margin-top: 50px;
                margin-bottom: 50px;
                padding: 0px;
                width: 900px;
                border-radius: .5rem;
                text-align: center;
            }

            .script-modal-content.override-modal {
                width: 70%;
                min-width: 900px;
            }

            /* The Close Button */
            .script-modal-close {
              float: right;
              font-size: 28px;
              margin-top: 20px;
              margin-right: 20px;
            }

            .script-modal-close:hover,
            .script-modal-close:focus {
              cursor: pointer;
            }

            /* Modal Header */
            .script-modal-header {
              padding: 4px 16px;
              margin-bottom: .5rem;
              border-bottom: #ccc solid .0625rem;
              text-align: center;
            }

            /* Modal Body */
            .script-modal-body {
                padding: 2px 16px;
                text-align: center;
                overflow: auto;
            }

            /* Autocomplete styles */
            .ui-autocomplete {
                background-color: #000;
                position: absolute;
                top: 0;
                left: 0;
                cursor: default;
                z-index: 10000 !important;
            }

            .ui-helper-hidden-accessible {
                border: 0;
                clip: rect(0 0 0 0);
                height: 1px;
                margin: -1px;
                overflow: hidden;
                padding: 0;
                position: absolute;
                width: 1px;
            }

            .selectable span {
                -moz-user-select: text !important;
                -khtml-user-select: text !important;
                -webkit-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }

            .ea-craft-toggle {
                max-width:75px;
                margin-top:4px;
                position:absolute;
                left:50%;
            }

            /* Reduce message log clutterness */
            .main #msgQueueFilters span:not(:last-child) {
                !important; margin-right: 0.25rem;
            }

            /* Fixes for game styles */
            .main .resources .resource :first-child { white-space: nowrap; }
            #popTimer { margin-bottom: 0.1rem }
            .barracks { white-space: nowrap; }
            .area { width: calc(100% / 6) !important; max-width: 8rem; }
            .offer-item { width: 15% !important; max-width: 7.5rem; }
            .tradeTotal { margin-left: 11.5rem !important; }

            /* Styles for queued targets UI */
            #active_targets-wrapper {
                padding: 1rem;
                max-height: 50vh;
            }

            #sideQueue #active_targets-wrapper {
                max-height: 50vh;
            }

            #active_targets {
                font-size: 0.9em;
                max-width: 500px;
            }

            #active_targets .target-type-box {
                background-color: #1d2021;
                margin: 10px 0;
                padding: 0.5rem 1rem;
            }

            #active_targets ul {
                list-style-type: none;
                padding-top: 5px;
            }

            .active_targets-list > li {
                margin-top: 10px;
                width: 100%;
            }

            .active-target-title {
                display: inline-block;
            }
            .active-target-title.name {
                width: 40%;
            }
            .active-target-title.time {
                width: 40%;
            }
            .active-target-segments {
                white-space: nowrap;
            }

            #active_targets .active_targets-sub-list {
                list-style-type: none;
            }

            #active_targets .active_targets-sub-list li {
                width: 100%;
                padding: 0;
            }

            #active_targets > ul > li:not(:first-child) {
              margin-top: 10px;
            }

            #active_targets .active_targets-resource-text {
                display: flex;
                width: 40%;
            }

            #active_targets .active_targets-resource-text span {
                margin-left: 10px;
            }

            #active_targets .active_targets-resource-row {
                display: flex;
            }

            #active_targets .active_targets-resource-row .percentage-full-progress-bar-wrapper {
                display: flex;
                margin: 5px 0 0 0;
                width: 35%;
                height: 9px;
                overflow: hidden;
            }

            /* Styles for script planner UI */
            #script_planner-wrapper {
                padding: 1rem;
                max-height: 40vh;
            }
            #script_planner-header {
                cursor: pointer;
            }
            #script_planner {
                font-size: 0.9em;
                max-width: 500px;
            }
            #script_planner ul {
                list-style-type: none;
            }
            #script_planner li {
                display: block;
                width: 100%;
                height: auto !important;
                max-height: none !important;
                line-height: normal;
                overflow: visible;
                margin-top: 6px;
            }
            #script_planner .planner-row,
            #script_planner .planner-note {
                height: auto !important;
                line-height: normal;
            }
            #script_planner .planner-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto auto;
                column-gap: 8px;
                align-items: baseline;
            }
            #script_planner .planner-row > span {
                position: static;
                float: none;
                width: auto;
                display: block;
            }
            #script_planner .planner-name {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #script_planner .planner-weight,
            #script_planner .planner-time {
                white-space: nowrap;
                text-align: right;
            }
            #script_planner .planner-note {
                font-size: 0.85em;
                opacity: 0.7;
            }
            #script_planner-stats {
                margin-top: 12px;
            }
            #script_planner-reset {
                font-size: 0.75em;
                margin-left: 8px;
            }

            .percentage-full-progress-bar-wrapper.is-replicating {
                background-image: linear-gradient(135deg,rgba(255,255,255,.95) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.95) 50%,rgba(255,255,255,.95) 75%,transparent 75%,transparent);
                background-size: 20px 20px;
                animation: progress-bar-stripes 2s linear reverse infinite;
            }

            @keyframes progress-bar-stripes {
              0% {
                background-position: 40px 0;
              }
              100% {
                background-position: 0 0;
              }
            }

            #active_targets .active_targets-time-left {
                width: auto;
                text-align: left;
                font-size: 0.8rem;
                margin-left: 10px;
            }

            .active-target-remove-x {
                margin-left: 10px;
                opacity: 0.5;
                cursor: pointer;
                float: right;
                transform: rotate(45deg);
                font-size: 1.1rem;
                line-height: 1rem;
            }

            .active-target-remove-x:hover {
                opacity: 1;
                font-size: 1.2rem;
            }
        `;

    // Create style document
    var css = document.createElement("style");
    css.type = "text/css";
    css.appendChild(document.createTextNode(styles));

    // Append style to html head
    document.getElementsByTagName("head")[0].appendChild(css);
  }

  // Known game errors, bugs, etc that we don't want to show to the user.
  // This should be game errors only.
  function checkIgnoredError(e) {
    if (typeof e !== "string") e = String(e);
    let ignoreRegexes = [
      // Currently no known game errors. Example regex:
      // /.*ReferenceError.*defineGovernor.*/,
    ];

    if (ignoreRegexes.find((regex) => regex.test(e))) {
      return true;
    }

    return false;
  }

  function displayScriptWarningNode(title, msg, stack) {
    // Add stack info if available. Format is browser-dependent, but better than nothing, I suppose.
    if (typeof stack === "string") {
      msg = `${msg}\n\nStack info:\n${stack}`;
    }

    // Add script version to message if available.
    // This is very annoying to retrieve as it can live in GM_info or in GM.info depending on userscript manager,
    // it might not be available at all in some cases due to @grant none, and it might be somewhat broken even if available,
    // as these can be weird getters that might fail in some cases.
    // Still, if we can get it, it's nice to have.
    let versionPart = "unknown";
    try {
      // We can't test this against the window because it's only available in script eval scope
      let gmInfo =
        typeof GM_info !== "undefined"
          ? GM_info
          : typeof GM !== "undefined"
            ? GM?.info
            : null;
      if (gmInfo?.script?.version) {
        versionPart = gmInfo.script.version;
      }
    } catch (internalError) {
      // This should hopefully never happen, but userscript implementations can do some really messed up stuff with GM APIs.
      // Best not to trust that there's no broken getter, etc.
      console.error("Error in error handler: %o", internalError);
      msg = `${msg}\n-----\nError in error handler: ${internalError}`;
    }

    msg = `${msg}\n\nScript version: ${versionPart} ${SCRIPT_VERSION_EXTRA}\n`;

    $("#script-script-warning").remove();

    let clickable = $(
      `<span id="script-script-warning" style="cursor: pointer; border-right: 1px solid; margin-right: 1rem; padding-right: 1rem">⚠️ ${title}</span>`,
    );
    clickable.on("click", (e) => {
      const builder = (currentNode) => {
        currentNode.append(
          $(
            `<textarea style="width: 100%; height: 100%; min-height: 400px; margin-bottom: 10px">`,
          ).val(msg),
        );
      };
      // It's possible we get stuck in an error loop before updateUI, better safe than sorry
      createOptionsModal();
      openOptionsModal(`Script Notice: ${title}`, builder);
      clickable.remove();
    });

    $("#versionLog").before(clickable);
  }

  // Generic JS & Vue2 error handler so that things don't break invisibly as often
  function addErrorHandler() {
    win.addEventListener("error", (e) => {
      if (!checkIgnoredError(e?.message)) {
        displayScriptWarningNode(
          "Script Error",
          `${e?.message} in ${e?.filename}:${e?.lineno}:${e?.colno}.`,
          e?.error?.stack,
        );
      }

      return false;
    });

    if (win?.Vue?.config && !win?.Vue?.config?.errorHandler) {
      win.Vue.config.errorHandler = (err, vm, info) => {
        if (!checkIgnoredError(err)) {
          displayScriptWarningNode(
            "Script Error",
            `Vue error: ${err}`,
            err?.stack,
          );
        }
      };
    }
  }

  function removeScriptSettings() {
    $("#script_settings").remove();
  }

  function buildScriptSettings() {
    // Don't initialize the settings tab until it's been opened
    if (game.global.settings.civTabs != 7) {
      return;
    }

    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let scriptContentNode = $("#script_settings");
    if (scriptContentNode.length !== 0) {
      return;
    }

    scriptContentNode = $(
      '<div id="script_settings" style="margin-top: 30px;"></div>',
    );
    $(".settings").append(scriptContentNode);

    buildImportExport();
    buildPrestigeSettings(scriptContentNode, "");
    buildGeneralSettings();
    buildInterfaceSettings();
    buildStateLogSettings();
    buildAchievementGuardSettings();
    buildChallengeHelperSettings();
    buildGovernmentSettings(scriptContentNode, "");
    buildEvolutionSettings();
    buildPlanetSettings();
    buildTraitSettings();
    buildTriggerSettings();
    buildResearchSettings();
    buildWarSettings(scriptContentNode, "");
    buildHellSettings(scriptContentNode, "");
    buildMechSettings();
    buildFleetSettings(scriptContentNode, "");
    buildEjectorSettings();
    buildMarketSettings();
    buildStorageSettings();
    buildMagicSettings();
    buildProductionSettings();
    buildJobSettings();
    buildBuildingSettings();
    buildWeightingSettings();
    buildProjectSettings();
    buildLoggingSettings(scriptContentNode, "");

    let collapsibles = document.querySelectorAll(
      "#script_settings .script-collapsible",
    );
    for (let i = 0; i < collapsibles.length; i++) {
      collapsibles[i].addEventListener("click", function () {
        this.classList.toggle("script-contentactive");
        let content = this.nextElementSibling;
        if (content.style.display === "block") {
          settingsRaw[collapsibles[i].id] = true;
          content.style.display = "none";

          let search = content.getElementsByClassName("script-searchsettings");
          if (search.length > 0) {
            search[0].value = "";
            filterBuildingSettingsTable();
          }
        } else {
          settingsRaw[collapsibles[i].id] = false;
          content.style.display = "block";
        }

        updateSettingsFromState();
      });
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildImportExport() {
    let importExportBase = $(".importExport").last();
    if (importExportBase === null) {
      return;
    }

    if (document.getElementById("script_importExportButtons") !== null) {
      return;
    }

    let importExportNode = $(
      '<div id="script_importExportButtons" style="margin-top: 6px">',
    );
    importExportBase.after(importExportNode);

    importExportNode.append(
      ' <button id="script_settingsImport" class="button">Import Script Settings</button>',
    );

    $("#script_settingsImport").on("click", function () {
      const str = $("#importExport").val();
      if (str.length > 0) {
        if (importSettings(str)) {
          $("#importExport").val("");
        }
      }
    });

    importExportNode.append(
      ' <button id="script_settingsExport" class="button">Export Script Settings</button>',
    );

    $("#script_settingsExport").on("click", function () {
      $("#importExport").val(exportSettings());
      $("#importExport").select();
      document.execCommand("copy");
    });

    importExportNode.append(
      ' <button id="script_settingsFile" class="button">Script Settings as File</button>',
    );

    $("#script_settingsFile").on("click", function () {
      // This one is pretty printed since it's much easier to do when downloading
      let json = JSON.stringify(settingsRaw, undefined, 2);
      triggerFileDownload(json, settings.scriptSettingsExportFilename);
    });
  }

  function buildSettingsSectionImpl(
    parentNode,
    sectionId,
    sectionName,
    resetFunction,
    updateSettingsContentFunction,
  ) {
    const triggerID = `${sectionId}SettingsCollapsed`;
    const resetID = `script_reset${sectionId}`;
    const contentID = `script_${sectionId}Content`;

    const section = $(`
          <div id="script_${sectionId}Settings" style="margin-top: 10px;">
            <h3 id="${triggerID}" class="script-collapsible text-center has-text-success">${sectionName} Settings</h3>
            <div class="script-content">
              <div style="margin-top: 10px;"><button id="${resetID}" class="button">Reset ${sectionName} Settings</button></div>
              <div style="margin-top: 10px; margin-bottom: 10px;" id="${contentID}"></div>
            </div>
          </div>`);

    parentNode.append(section);

    if (!settingsRaw[sectionId + "SettingsCollapsed"]) {
      // The section is open initially - build it now
      updateSettingsContentFunction();

      let element = document.getElementById(triggerID);
      element.classList.toggle("script-contentactive");
      element.nextElementSibling.style.display = "block";
    } else {
      // The section is closed - build it only once it's open
      section.find(`> #${triggerID}`).on("click", () => {
        if (section.find(`#${contentID}`).is(":empty")) {
          updateSettingsContentFunction();
        }
      });
    }

    section
      .find(`#${resetID}`)
      .on("click", genericResetFunction.bind(null, resetFunction, sectionName));
  }

  function buildSettingsSection(
    sectionId,
    sectionName,
    resetFunction,
    updateSettingsContentFunction,
  ) {
    buildSettingsSectionImpl(
      $("#script_settings"),
      sectionId,
      sectionName,
      resetFunction,
      updateSettingsContentFunction,
    );
  }

  function buildSettingsSection2(
    parentNode,
    secondaryPrefix,
    sectionId,
    sectionName,
    resetFunction,
    updateSettingsContentFunction,
  ) {
    if (secondaryPrefix !== "") {
      parentNode.append(
        `<div style="margin-top: 10px; margin-bottom: 10px;" id="script_${
          secondaryPrefix + sectionId
        }Content"></div>`,
      );
      updateSettingsContentFunction(secondaryPrefix);
    } else {
      buildSettingsSectionImpl(
        parentNode,
        sectionId,
        sectionName,
        resetFunction,
        () => updateSettingsContentFunction(""),
      );
    }
  }

  function genericResetFunction(resetFunction, sectionName) {
    if (
      confirm("Are you sure you wish to reset " + sectionName + " Settings?")
    ) {
      resetFunction();
    }
  }

  function addStandardHeading(node, heading) {
    node.append(
      `<div style="margin-top: 5px; width: 600px; text-align: left;"><span class="has-text-danger" style="margin-left: 10px;">${heading}</span></div>`,
    );
  }

  function addSettingsHeader1(node, headerText) {
    node.append(
      `<div style="margin: 4px; width: 100%; display: inline-block; text-align: left;"><span class="has-text-success" style="font-weight: bold;">${headerText}</span></div>`,
    );
  }

  function addSettingsHeader2(node, headerText) {
    node.append(
      `<div style="margin: 2px; width: 90%; display: inline-block; text-align: left;"><span class="has-text-caution">${headerText}</span></div>`,
    );
  }

  const prestigeTypes = [
    { val: "none", label: "None", hint: "Endless game" },
    {
      val: "mad",
      short_label: "MAD",
      label: "Mutual Assured Destruction",
      hint: "MAD prestige once MAD has been researched and all soldiers are home",
    },
    {
      val: "bioseed",
      label: "Bioseed",
      hint: "Launches the bioseeder ship to perform prestige when required probes have been constructed",
    },
    {
      val: "cataclysm",
      label: "Cataclysm",
      hint: "Perform cataclysm reset by researching Dial It To 11 once available",
    },
    {
      val: "whitehole",
      label: "Whitehole",
      hint: "Infuses the blackhole with exotic materials to perform prestige",
    },
    {
      val: "vacuum",
      short_label: "Vacuum",
      label: "Vacuum Collapse",
      hint: "Build Mana Syphons until the end",
    },
    {
      val: "apocalypse",
      label: "AI Apocalypse",
      hint: "Perform AI Apocalypse reset by researching Protocol 66 once available",
    },
    {
      val: "ascension",
      label: "Ascension",
      hint: "Allows research of Incorporeal Existence and Ascension. Ascension Machine is managed by autoPower. Use Custom race handling in Prestige settings to reuse, pause for editing, or automatically import a race at the post-reset lab.",
    },
    {
      val: "demonic",
      short_label: "DI",
      label: "Demonic Infusion",
      hint: "Sacrifice your entire civilization to absorb the essence of a greater demon lord",
    },
    {
      val: "terraform",
      label: "Terraform",
      hint: "Create new planet by building and powering Terraformer. Atmosphere Terraformer is managed by autoPower. Disable autoPrestige if you want to change custom planet. Otherwise current one will be used , or default one if there's no current. ",
    },
    {
      val: "matrix",
      label: "Matrix",
      hint: "Build a computer simulation and trap your entire civilization in it",
    },
    {
      val: "retire",
      label: "Retirement",
      hint: "Retire and enjoy the easy life.",
    },
    { val: "eden", label: "Eden", hint: "Build Garden Of Eden." },
    { val: "apotheosis", label: "Apotheosis", hint: "Kill the God." },
  ];

  const prestigeOptions = buildSelectOptions(prestigeTypes);

  const checkCompare = {
    "==": (a, b) => a == b,
    "!=": (a, b) => a != b,
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    "===": (a, b) => a === b,
    "!==": (a, b) => a !== b,
    AND: (a, b) => a && b,
    OR: (a, b) => a || b,
    NAND: (a, b) => !(a && b),
    NOR: (a, b) => !(a || b),
    XOR: (a, b) => !a != !b,
    XNOR: (a, b) => !a == !b,
    "AND!": (a, b) => a && !b,
    "OR!": (a, b) => a || !b,
    "A?B": (a, b) => a,
    "!A?B": (a, b) => !a,
  };

  const checkCustom = {
    "A?B": "Special check, uses Var2 as result if Var1 is truthy",
    "!A?B": "Special check, uses Var2 as result if Var1 is falsy",
  };

  const argType = {
    building_cost: {
      def: "city-farm.Money",
      arg: "list_cb",
      options: () =>
        Object.fromEntries(
          Object.keys(buildingIds)
            .map((b) =>
              Object.keys(buildingIds[b].cost).map((r) => [
                `${b}.${r}`,
                {
                  name: `${buildingIds[b].name} (${resources[r].name})`,
                  id: `${b}.${r}`,
                },
              ]),
            )
            .flat(),
        ),
    },
    building: {
      def: "city-farm",
      arg: "list",
      options: { list: buildingIds, name: "name", id: "_vueBinding" },
    },
    research: {
      def: "tech-mad",
      arg: "list",
      options: { list: techIds, name: "name", id: "_vueBinding" },
    },

    trait: {
      def: "kindling_kindred",
      arg: "list_cb",
      options: () =>
        Object.fromEntries(
          Object.entries(game.traits).map(([id, trait]) => [
            id,
            { name: trait.name, id: id },
          ]),
        ),
    },

    genus: {
      def: "humanoid",
      arg: "select_cb",
      options: () => [
        { val: "organism", label: game.loc(`race_protoplasm`) },
        ...Object.values(game.races)
          .map((r) => r.type)
          .filter((g, i, a) => g && g !== "organism" && a.indexOf(g) === i)
          .map((g) => ({ val: g, label: game.loc(`genelab_genus_${g}`) })),
      ],
    },
    genus_ss: {
      def: "humanoid",
      arg: "select_cb",
      options: () => [
        { val: "none", label: game.loc(`genelab_genus_none`) },
        ...Object.values(game.races)
          .map((r) => r.type)
          .filter(
            (g, i, a) =>
              g && g !== "organism" && g !== "synthetic" && a.indexOf(g) === i,
          )
          .map((g) => ({ val: g, label: game.loc(`genelab_genus_${g}`) })),
      ],
    },
    project: {
      def: "arpalaunch_facility",
      arg: "select_cb",
      options: () =>
        Object.values(arpaIds).map((p) => ({
          val: p._vueBinding,
          label: p.name,
        })),
    },
    job: {
      def: "unemployed",
      arg: "select_cb",
      options: () =>
        Object.values(jobIds).map((j) => ({
          val: j._originalId,
          label: j._originalName,
        })),
    },
    job_servant: {
      def: "farmer",
      arg: "select_cb",
      options: () =>
        Object.values(jobIds)
          .filter((j) => j.is.serve)
          .map((j) => ({ val: j._originalId, label: j._originalName })),
    },
    resource: {
      def: "Food",
      arg: "select_cb",
      options: () =>
        Object.values(resources).map((r) => ({ val: r._id, label: r.name })),
    },
    race: {
      def: "species",
      arg: "select_cb",
      options: () => [
        { val: "species", label: "Current Race", hint: "Current race" },
        { val: "gods", label: "Fanaticism Race", hint: "Gods race" },
        { val: "old_gods", label: "Deify Race", hint: "Old gods race" },
        { val: "srace", label: "Imitation Race", hint: "Imitation trait race" },
        {
          val: "protoplasm",
          label: "Protoplasm",
          hint: "Race is not chosen yet",
        },
        ...Object.values(races).map((race) => ({
          val: race.id,
          label: race.name,
          hint: race.desc,
        })),
      ],
    },
    challenge: {
      def: "junker",
      arg: "select_cb",
      options: () =>
        challenges.flat().map((c) => ({
          val: c.trait,
          label: game.loc(`evo_challenge_${c.id}`),
          hint: game.loc(`evo_challenge_${c.id}_effect`),
        })),
    },
    universe: {
      def: "standard",
      arg: "select_cb",
      options: () => [
        {
          val: "bigbang",
          label: "Big Bang",
          hint: "Universe is not chosen yet",
        },
        ...universes.map((u) => ({
          val: u,
          label: game.loc(`universe_${u}`),
          hint: game.loc(`universe_${u}_desc`),
        })),
      ],
    },
    government: {
      def: "anarchy",
      arg: "select_cb",
      options: () =>
        Object.keys(GovernmentManager.Types).map((g) => ({
          val: g,
          label: game.loc(`govern_${g}`),
          hint: game.loc(`govern_${g}_desc`),
        })),
    },
    governor: {
      def: "none",
      arg: "select_cb",
      options: () => [
        { val: "none", label: "None", hint: "No governor selected" },
        ...governors.map((id) => ({
          val: id,
          label: game.loc(`governor_${id}`),
          hint: game.loc(`governor_${id}_desc`),
        })),
      ],
    },
    queue: {
      def: "queue",
      arg: "select_cb",
      options: () => [
        {
          val: "queue",
          label: "Building",
          hint: "Buildings and projects queue",
        },
        { val: "r_queue", label: "Research", hint: "Research queue" },
        { val: "evo", label: "Evolution", hint: "Evolution queue" },
      ],
    },
    date: {
      def: "day",
      arg: "select_cb",
      options: () => [
        { val: "day", label: "Day (Year)", hint: "Day of year" },
        {
          val: "moon",
          label: "Day (Month)",
          hint: "Day of month (0-27 range)",
        },
        { val: "total", label: "Day (Total)", hint: "Day of run" },
        { val: "year", label: "Year", hint: "Year of run" },
        { val: "orbit", label: "Orbit", hint: "Planet orbit in days" },
        {
          val: "season",
          label: "Season",
          hint: "Current season (0 - Spring, 1 - Summer, 2 - Fall, 3 - Winter)",
        },
        {
          val: "temp",
          label: "Temperature",
          hint: "Current temperature (0 - Cold, 1 - Normal, 2 - Hot)",
        },
        {
          val: "impact",
          label: "Impact",
          hint: "Days remaining before Moon Impact, for Orbit Decay scenario",
        },
      ],
    },
    soldiers: {
      def: "workers",
      arg: "select_cb",
      options: () => [
        { val: "workers", label: "Total Soldiers" },
        { val: "max", label: "Total Soldiers Max" },
        { val: "currentCityGarrison", label: "City Soldiers" },
        { val: "maxCityGarrison", label: "City Soldiers Max" },
        { val: "hellSoldiers", label: "Hell Soldiers" },
        { val: "hellGarrison", label: "Hell Garrison" },
        { val: "hellPatrols", label: "Hell Patrols" },
        { val: "hellPatrolSize", label: "Hell Patrol Size" },
        { val: "wounded", label: "Wounded Soldiers" },
        { val: "deadSoldiers", label: "Dead Soldiers" },
        { val: "crew", label: "Ship Crew" },
        { val: "mercenaryCost", label: "Mercenary Cost" },
      ],
    },
    tab: {
      def: "civTabs1",
      arg: "select_cb",
      options: () => [
        { val: "civTabs0", label: game.loc("tab_evolve") },
        { val: "civTabs1", label: game.loc("tab_civil") },
        { val: "civTabs2", label: game.loc("tab_civics") },
        { val: "civTabs3", label: game.loc("tab_research") },
        { val: "civTabs4", label: game.loc("tab_resources") },
        { val: "civTabs5", label: game.loc("tech_arpa") },
        { val: "civTabs6", label: game.loc("mTabStats") },
        { val: "civTabs7", label: game.loc("tab_settings") },
      ],
    },
    biome: {
      def: "grassland",
      arg: "select_cb",
      options: () =>
        biomeList.map((b) => ({ val: b, label: game.loc(`biome_${b}_name`) })),
    },
    ptrait: {
      def: "",
      arg: "select_cb",
      options: () => [
        { val: "", label: "None", hint: "Planet have no trait" },
        ...traitList
          .slice(1)
          .map((t) => ({ val: t, label: game.loc(`planet_${t}`) })),
      ],
    },
    industry: {
      def: "smelters",
      arg: "select_cb",
      options: () => [
        { val: "smelters", label: "Total Smelter Slot Count" },
        { val: "factories", label: "Total Factory Slot Count" },
      ],
    },
    other: {
      def: "rname",
      arg: "select_cb",
      options: () => [
        {
          val: "rname",
          label: "Race Name",
          hint: "Ingame name of current race as string.",
        },
        {
          val: "tpfleet",
          label: "Fleet Size",
          hint: "Amount of ships in True Path fleet as number.",
        },
        {
          val: "mrelay",
          label: "Mass Relay charge",
          hint: "Charge percentage of the Mass Relay (0 = 0%, 0.5 = 50%, 1 = 100%",
        },
        {
          val: "satcost",
          label: "Satellite Cost",
          hint: "Money cost of next Swarm Satellite",
        },
        {
          val: "bcar",
          label: "Broken Cars",
          hint: "Amount of broken Surveyour Carports",
        },
        {
          val: "alevel",
          label: "Active challenges",
          hint: "Amount of active challenges",
        },
        {
          val: "tknow",
          label: "Tech Knowledge",
          hint: "Knowledge needed for most expensive unlocked research",
        },
      ],
    },
  };
  const argMap = {
    race: (r) =>
      r === "species" || r === "gods" || r === "old_gods"
        ? game.global.race[r]
        : r === "srace"
          ? (game.global.race.srace ?? "protoplasm")
          : r,
    date: (d) =>
      d === "total"
        ? game.global.stats.days
        : d === "impact"
          ? game.global.race["orbit_decay"]
            ? game.global.race["orbit_decay"] - game.global.stats.days
            : -1
          : game.global.city.calendar[d],
    industry: (b) =>
      b === "smelters"
        ? SmelterManager.maxOperating()
        : b === "factories"
          ? FactoryManager.maxOperating()
          : b,
    other: (o) =>
      o === "rname"
        ? game.races[
            game.global.race.species === "protoplasm" &&
            game.global.race.evoFinalMenu
              ? game.global.race.evoFinalMenu
              : game.global.race.species
          ].name
        : o === "tpfleet"
          ? (game.global.space.shipyard?.ships?.length ?? 0)
          : o === "mrelay"
            ? (game.global.space.m_relay?.charged / 10000.0 ?? 0)
            : o === "satcost"
              ? (buildings.SunSwarmSatellite.cost.Money ?? 0)
              : o === "bcar"
                ? (game.global.portal.carport?.damaged ?? 0)
                : o === "alevel"
                  ? game.alevel() - 1
                  : o === "tknow"
                    ? state.knowledgeRequiredByTechs
                    : o,
  };

  // TODO: Add TabUnlocked, with showCity, showTau, showMarket, etc.
  const checkTypes = {
    String: {
      fn: (v) => v,
      arg: "string",
      def: "none",
      desc: "Returns string",
    },
    Number: { fn: (v) => v, arg: "number", def: 0, desc: "Returns number" },
    Boolean: {
      fn: (v) => v,
      arg: "boolean",
      def: false,
      desc: "Returns boolean",
    },
    SettingDefault: {
      fn: (s) => settingsRaw[s],
      arg: "string",
      def: "masterScriptToggle",
      desc: "Returns default value of setting, types varies",
    },
    SettingCurrent: {
      fn: (s) => settings[s],
      arg: "string",
      def: "masterScriptToggle",
      desc: "Returns current value of setting, types varies",
    },
    Eval: {
      fn: (s) => fastEval(s),
      arg: "string",
      def: "Math.PI",
      desc: "Returns result of evaluating code",
    },
    BuildingCost: {
      fn: (id) => {
        let [b, r] = id.split(".");
        return buildingIds[b].cost[r] ?? 0;
      },
      ...argType.building_cost,
      desc: "Return material cost of building as number\n(Due to technical limitations some options might not appear in list until you unlock corresponding building in game)",
    },
    BuildingUnlocked: {
      fn: (b) => buildingIds[b].isUnlocked(),
      ...argType.building,
      desc: "Return true when building is unlocked",
    },
    BuildingClickable: {
      fn: (b) => buildingIds[b].isClickable(),
      ...argType.building,
      desc: "Return true when building have all required resources, and can be purchased",
    },
    BuildingAffordable: {
      fn: (b) => buildingIds[b].isAffordable(true),
      ...argType.building,
      desc: "Return true when building is affordable, i.e. costs of all resources below storage caps",
    },
    BuildingCount: {
      fn: (b) => buildingIds[b].count,
      ...argType.building,
      desc: "Returns amount of buildings as number",
    },
    BuildingEnabled: {
      fn: (b) => buildingIds[b].stateOnCount,
      ...argType.building,
      desc: "Returns amount of powered buildings as number",
    },
    BuildingDisabled: {
      fn: (b) => buildingIds[b].stateOffCount,
      ...argType.building,
      desc: "Returns amount of unpowered buildings as number",
    },
    BuildingQueued: {
      fn: (b) => state.queuedTargetsAll.includes(buildingIds[b]),
      ...argType.building,
      desc: "Returns true when building in queue",
    },
    ProjectUnlocked: {
      fn: (p) => arpaIds[p].isUnlocked(),
      ...argType.project,
      desc: "Return true when project is unlocked",
    },
    ProjectCount: {
      fn: (p) => arpaIds[p].count,
      ...argType.project,
      desc: "Returns amount of projects as number",
    },
    ProjectProgress: {
      fn: (p) => arpaIds[p].progress,
      ...argType.project,
      desc: "Returns progress of projects as number",
    },
    JobUnlocked: {
      fn: (j) => jobIds[j].isUnlocked(),
      ...argType.job,
      desc: "Returns true when job is unlocked",
    },
    JobCount: {
      fn: (j) => jobIds[j].count,
      ...argType.job,
      desc: "Returns current amount of employees(both workers, and servants) as number",
    },
    JobMax: {
      fn: (j) => jobIds[j].max,
      ...argType.job,
      desc: "Returns maximum amount of assigned workers as number",
    },
    JobWorkers: {
      fn: (j) => jobIds[j].workers,
      ...argType.job,
      desc: "Returns current amount of workers as number",
    },
    JobServants: {
      fn: (j) => jobIds[j].servants,
      ...argType.job_servant,
      desc: "Returns current amount of servants as number",
    },
    ResearchUnlocked: {
      fn: (r) => techIds[r].isUnlocked(),
      ...argType.research,
      desc: "Returns true when research is unlocked",
    },
    ResearchComplete: {
      fn: (r) => techIds[r].isResearched(),
      ...argType.research,
      desc: "Returns true when research is complete",
    },
    ResourceUnlocked: {
      fn: (r) => resources[r].isUnlocked(),
      ...argType.resource,
      desc: "Returns true when resource or support is unlocked",
    },
    ResourceQuantity: {
      fn: (r) => resources[r].currentQuantity,
      ...argType.resource,
      desc: "Returns current amount of resource or support as number",
    },
    ResourceStorage: {
      fn: (r) => resources[r].maxQuantity,
      ...argType.resource,
      desc: "Returns maximum amount of resource or support as number. Power returns 'Disabled' amount.",
    },
    ResourceMaxCost: {
      fn: (r) => resources[r].maxCost,
      ...argType.resource,
      desc: "Returns maximum cost of resource as number.",
    },
    ResourceIncome: {
      fn: (r) => resources[r].rateOfChange,
      ...argType.resource,
      desc: "Returns current income of resource or unused support as number",
    }, // rateOfChange holds full diff of resource at the moment when overrides checked
    ResourceRatio: {
      fn: (r) => resources[r].storageRatio,
      ...argType.resource,
      desc: "Returns storage ratio of resource as number. Number 0.5 means that storage is 50% full, and such.",
    },
    ResourceSatisfied: {
      fn: (r) => resources[r].usefulRatio >= 1,
      ...argType.resource,
      desc: "Returns true when current amount of resource above maximum costs",
    },
    ResourceSatisfyRatio: {
      fn: (r) => resources[r].usefulRatio,
      ...argType.resource,
      desc: "Returns satisfy ratio of resource. Number 0.5 means that storead amount equal half of maximum costs",
    },
    ResourceDemanded: {
      fn: (r) => resources[r].isDemanded(),
      ...argType.resource,
      desc: "Returns true when resource is demanded, i.e. missed by some prioritized task, such as queue or trigger",
    },
    RaceId: {
      fn: (r) => argMap.race(r),
      ...argType.race,
      desc: "Returns ID of selected race as string",
    },
    RacePillared: {
      fn: (r) => game.global.pillars[argMap.race(r)] >= game.alevel(),
      ...argType.race,
      desc: "Returns true when selected race pillared at current star level",
    },
    RaceGenus: {
      fn: (g) => races[game.global.race.species]?.genus === g,
      ...argType.genus,
      desc: "Returns true when playing selected genus",
    },
    MimicGenus: {
      fn: (g) => (game.global.race.ss_genus ?? "none") === g,
      ...argType.genus_ss,
      desc: "Returns true when mimicking selected genus",
    },
    TraitLevel: {
      fn: (t) => game.global.race[t] ?? 0,
      ...argType.trait,
      desc: "Returns trait level as number",
    },
    ResetType: {
      fn: (r) => settings.prestigeType === r,
      arg: "select",
      options: prestigeOptions,
      def: "mad",
      desc: "Returns true when selected reset is active",
    },
    Challenge: {
      fn: (c) => (game.global.race[c] ? true : false),
      ...argType.challenge,
      desc: "Returns true when selected challenge is active",
    },
    Universe: {
      fn: (u) => game.global.race.universe === u,
      ...argType.universe,
      desc: "Returns true when playing in selected universe",
    },
    Government: {
      fn: (g) => game.global.civic.govern.type === g,
      ...argType.government,
      desc: "Returns true when selected government is active",
    },
    Governor: {
      fn: (g) => getGovernor() === g,
      ...argType.governor,
      desc: "Returns true when selected governor is active",
    },
    Queue: {
      fn: (q) =>
        q === "evo"
          ? settingsRaw.evolutionQueue.length
          : game.global[q].queue.length,
      ...argType.queue,
      desc: "Returns amount of items in queue as number",
    },
    Date: {
      fn: (d) => argMap.date(d),
      ...argType.date,
      desc: "Returns ingame date as number",
    },
    Soldiers: {
      fn: (s) => WarManager[s],
      ...argType.soldiers,
      desc: "Returns amount of soldiers as number",
    },
    PlanetBiome: {
      fn: (b) => game.global.city.biome === b,
      ...argType.biome,
      desc: "Returns true when playing in selected biome",
    },
    PlanetTrait: {
      fn: (t) => game.global.city.ptrait.includes(t),
      ...argType.ptrait,
      desc: "Returns true when planet have selected trait",
    },
    Industry: {
      fn: (r) => argMap.industry(r),
      ...argType.industry,
      desc: "Returns information about Industry buildings",
    },
    Other: {
      fn: (o) => argMap.other(o),
      ...argType.other,
      desc: "Other uncategorized variables",
    },
  };

  // TODO: This thing isn't very nice. Ideally each check should declare return type, not only input type. But for now it's only used with triggers which only works with numbers and booleans, so it's fine for now.
  const retBools = [
    "Boolean",
    "BuildingUnlocked",
    "BuildingClickable",
    "BuildingAffordable",
    "BuildingQueued",
    "ProjectUnlocked",
    "JobUnlocked",
    "ResearchUnlocked",
    "ResearchComplete",
    "ResourceUnlocked",
    "ResourceSatisfied",
    "ResourceDemanded",
    "RacePillared",
    "RaceGenus",
    "MimicGenus",
    "ResetType",
    "Challenge",
    "Universe",
    "Government",
    "Governor",
    "PlanetBiome",
    "PlanetTrait",
  ];
  // No need to show primitives and string function in triggers UI.
  const overrideOnlyChecks = ["String", "Number", "RaceId"];

  // Eval shortener
  function _(check, arg) {
    return checkTypes[check].fn(arg);
  }

  function openOverrideModal(event) {
    if (event[overrideKey]) {
      event.preventDefault();
      openOptionsModal(event.data.label, function (modal) {
        modal.append(
          `<div style="margin-top: 10px; margin-bottom: 10px;" id="script_${event.data.name}Modal"></div>`,
        );
        $(".script-modal-content").addClass("override-modal");
        buildOverrideSettings(
          event.data.name,
          event.data.type,
          event.data.options,
        );
      });
    }
  }

  function buildOverrideSettings(settingName, type, options) {
    const rebuild = () => buildOverrideSettings(settingName, type, options);
    let overrides = settingsRaw.overrides[settingName] ?? [];

    let currentNode = $(`#script_${settingName}Modal`);
    currentNode.empty().off("*");

    currentNode.append(`
          <table style="width:100%; text-align: left">
            <tr>
              <th class="has-text-warning" colspan="2">Variable 1</th>
              <th class="has-text-warning" colspan="1">Check</th>
              <th class="has-text-warning" colspan="2">Variable 2</th>
              <th class="has-text-warning" colspan="3">Result</th>
            </tr>
            <tr>
              <th class="has-text-warning" style="width:16%">Type</th>
              <th class="has-text-warning" style="width:16%">Value</th>
              <th class="has-text-warning" style="width:10%"></th>
              <th class="has-text-warning" style="width:16%">Type</th>
              <th class="has-text-warning" style="width:16%">Value</th>
              <th class="has-text-warning" style="width:14%"></th>
              <th style="width:12%"></th>
            </tr>
            <tbody id="script_${settingName}ModalTable"></tbody>
          </table>`);

    let newTableBodyText = "";
    for (let i = 0; i < overrides.length; i++) {
      newTableBodyText += `<tr id="script_${settingName}_o${i}" value="${i}" class="script-draggable"><td style="width:16%"></td><td style="width:16%"></td><td style="width:10%"></td><td style="width:16%"></td><td style="width:16%"></td><td style="width:14%"></td><td style="width:12%"><span class="script-lastcolumn"></span></td></tr>`;
    }

    let listField = typeof settingsRaw[settingName] === "object";
    let note = listField
      ? "All values passed checks will be added or removed from list"
      : "First value passed check will be used. Default value:";
    let note_2 = "The current value:";

    let current = listField
      ? `<td style="width:32%" colspan="2">${note_2}</td>
          <td style="width:56%" colspan="4"></td>`
      : `<td style="width:74%" colspan="5">${note_2}</td>
          <td style="width:14%"></td>`;

    newTableBodyText += `
          <tr id="script_${settingName}_d" class="unsortable">
            <td style="width:74%" colspan="5">${note}</td>
            <td style="width:14%"></td>
            <td style="width:12%"><a class="button is-small" style="width: 26px; height: 26px"><span>+</span></a></td>
          </tr>
          <tr id="script_override_true_value" class="unsortable" value="${settingName}" type="${type}">
            ${current}
            <td style="width:12%"></td>
          </tr>`;
    let tableBodyNode = $(`#script_${settingName}ModalTable`);
    tableBodyNode.append($(newTableBodyText));

    // Default input
    if (!listField) {
      $(`#script_${settingName}_d td:eq(1)`).append(
        buildInputNode(
          type,
          options,
          settingsRaw[settingName],
          function (result) {
            settingsRaw[settingName] = result;
            updateSettingsFromState();

            let retType = typeof result === "boolean" ? "checked" : "value";
            $(".script_" + settingName).prop(retType, settingsRaw[settingName]);
          },
        ),
      );
    }
    $(`#script_override_true_value td:eq(1)`).append(
      buildInputNodeForDisplay(type, options, settings[settingName]),
    );

    // Add button
    $(`#script_${settingName}_d a`).on("click", function () {
      if (!settingsRaw.overrides[settingName]) {
        settingsRaw.overrides[settingName] = [];
        $(".script_bg_" + settingName).addClass("inactive-row");
      }
      settingsRaw.overrides[settingName].push({
        type1: "Boolean",
        arg1: true,
        type2: "Boolean",
        arg2: false,
        cmp: "==",
        ret: settingsRaw[settingName],
      });
      updateSettingsFromState();
      rebuild();
    });

    for (let i = 0; i < overrides.length; i++) {
      let override = overrides[i];
      let tableElement = $(`#script_${settingName}_o${i}`).children().eq(0);

      tableElement.append(buildConditionType(override, 1, rebuild));
      tableElement = tableElement.next();
      tableElement.append(buildConditionArg(override, 1));
      tableElement = tableElement.next();
      tableElement.append(buildConditionComparator(override, rebuild));
      tableElement = tableElement.next();
      tableElement.append(buildConditionType(override, 2, rebuild));
      tableElement = tableElement.next();
      tableElement.append(buildConditionArg(override, 2));
      tableElement = tableElement.next();
      if (!checkCustom[override.cmp]) {
        tableElement.append(buildConditionRet(override, type, options));
      }
      tableElement = tableElement.next();
      tableElement.append(buildConditionRemove(settingName, i, rebuild));
      tableElement.append(buildConditionDuplicate(settingName, i, rebuild));
      tableElement.append(buildConditionEvalize(settingName, i, rebuild));
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let newOrder = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        settingsRaw.overrides[settingName] = newOrder.map(
          (i) => settingsRaw.overrides[settingName][i],
        );

        updateSettingsFromState();
        rebuild();
      },
    });
  }

  function buildInputNode(type, options, value, callback) {
    switch (type) {
      case "string":
        return $(`
                  <input type="text" class="input is-small" style="height: 22px; width:100%"/>`)
          .val(value)
          .on("change", function () {
            callback(this.value);
          });
      case "number":
        return $(`
                  <input type="text" class="input is-small" style="height: 22px; width:100%"/>`)
          .val(value)
          .on("change", function () {
            let parsedValue = getRealNumber(this.value);
            if (isNaN(parsedValue)) {
              parsedValue = value;
            }
            this.value = parsedValue;
            callback(parsedValue);
          });
      case "boolean":
        return $(`
                  <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                    <input type="checkbox">
                    <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span>
                  </label>`)
          .find("input")
          .prop("checked", value)
          .on("change", function () {
            callback(this.checked);
          })
          .end();
      case "select":
        return $(`
                  <select style="width: 100%">${options}</select>`)
          .val(value)
          .on("change", function () {
            callback(this.value);
          });
      case "select_cb":
        return $(`
                  <select style="width: 100%">${buildSelectOptions(
                    options(),
                  )}</select>`)
          .val(value)
          .on("change", function () {
            callback(this.value);
          });
      case "list":
        return buildObjectListInput(
          options.list,
          options.name,
          options.id,
          value,
          callback,
        );
      case "list_cb":
        return buildObjectListInput(options(), "name", "id", value, callback);
      default:
        return "";
    }
  }

  function buildInputNodeForDisplay(type, options, value) {
    switch (type) {
      case "string":
      case "number":
        return $(`
                  <input type="text" class="input is-small" style="height: 22px; width:100%" disabled="disabled"/>`).val(
          value,
        );
      case "boolean":
        return $(`
                  <label tabindex="0" disabled="disabled" class="switch is-disabled" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                    <input type="checkbox"  disabled="disabled">
                    <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span>
                  </label>`)
          .find("input")
          .prop("checked", value)
          .end();
      case "select":
        return $(`
                  <select style="width: 100%"  disabled="disabled" class="dropdown is-disabled">${options}</select>`).val(
          value,
        );
      case "list":
        return $(`
                  <span></span>`).text(
          value
            .map((item) => options.list[item]?.name ?? "[Invalid item]")
            .join(", "),
        );
      default:
        return $(`
                  <span></span>`).text(JSON.stringify(value));
    }
  }

  function changeDisplayInputNode(currentNode) {
    let type = currentNode.attr("type");
    let id = currentNode.attr("value");
    let value = settings[currentNode.attr("value")];
    let node = currentNode.find(`td:eq(1)>*:first-child`);
    switch (type) {
      case "string":
      case "number":
      case "select":
        return node.val(value);
      case "boolean":
        return node.find("input").prop("checked", value);
      case "list":
        if (id === "researchIgnore") {
          return node.text(
            value
              .map((item) => techIds[item]?.name ?? "[Invalid item]")
              .join(", "),
          );
        } // else default
      default:
        return node.text(JSON.stringify(value));
    }
  }

  function buildConditionType(override, num, rebuild) {
    let types = Object.entries(checkTypes)
      .map(
        ([id, type]) =>
          `<option value="${id}" title="${type.desc}">${id
            .replace(/([A-Z])/g, " $1")
            .trim()}</option>`,
      )
      .join();
    return $(`<select style="width: 100%">${types}</select>`)
      .val(override["type" + num])
      .on("change", function () {
        override["type" + num] = this.value;
        override["arg" + num] = checkTypes[this.value].def;
        updateSettingsFromState();
        rebuild();
      });
  }

  function buildConditionArg(override, num) {
    let check = checkTypes[override["type" + num]];
    return check
      ? buildInputNode(
          check.arg,
          check.options,
          override["arg" + num],
          function (result) {
            override["arg" + num] = result;
            updateSettingsFromState();
          },
        )
      : "";
  }

  function buildConditionComparator(override, rebuild) {
    let types = Object.entries(checkCompare)
      .map(
        ([id, fn]) =>
          `<option value="${id}" title="${
            checkCustom[id] ?? fn.toString().substr(10)
          }">${id}</option>`,
      )
      .join();
    return $(`<select style="width: 100%">${types}</select>`)
      .val(override.cmp)
      .on("change", function () {
        override.cmp = this.value;
        updateSettingsFromState();
        rebuild();
      });
  }

  function buildConditionRemove(settingName, id, rebuild) {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span>-</span></a>`,
    ).on("click", function () {
      settingsRaw.overrides[settingName].splice(id, 1);
      if (settingsRaw.overrides[settingName].length === 0) {
        delete settingsRaw.overrides[settingName];
        $(".script_bg_" + settingName).removeClass("inactive-row");
      }
      updateSettingsFromState();
      rebuild();
    });
  }

  function buildConditionDuplicate(settingName, id, rebuild) {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span style="font-size: 1.2rem;">&#9282;</span></a>`,
    ).on("click", function () {
      settingsRaw.overrides[settingName].splice(id, 0, {
        ...settingsRaw.overrides[settingName][id],
      });
      updateSettingsFromState();
      rebuild();
    });
  }

  function buildConditionEvalize(settingName, id, rebuild) {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span style="font-size: 0.9rem;">E</span></a>`,
    ).on("click", function () {
      let override = settingsRaw.overrides[settingName][id];
      let check = checkCompare[override.cmp]
        .toString()
        .substr(10)
        .replace(/([ab])/g, (s, v) => {
          let idx = v === "a" ? 1 : 2;
          switch (override["type" + idx]) {
            case "Number":
            case "Boolean":
              return override["arg" + idx];
            case "Eval":
              return `(${override["arg" + idx]})`;
            case "String":
              return JSON.stringify(override["arg" + idx]);
            default:
              return `_("${override["type" + idx]}",${JSON.stringify(
                override["arg" + idx],
              )})`;
          }
        });
      win.prompt("Eval of this condition:", check);
    });
  }

  function buildConditionRet(override, type, options) {
    return buildInputNode(type, options, override.ret, function (result) {
      override.ret = result;
      updateSettingsFromState();
    });
  }

  function buildObjectListInput(list, name, id, value, callback) {
    let listNode = $(`<input type="text" style="width:100%"></input>`);

    // Event handler
    let onChange = function (event, ui) {
      event.preventDefault();

      // If it wasn't selected from list
      if (ui.item === null) {
        let foundItem = Object.values(list).find(
          (obj) => obj[name] === this.value,
        );
        if (foundItem !== undefined) {
          ui.item = { label: this.value, value: foundItem[id] };
        }
      }

      if (
        ui.item !== null &&
        Object.values(list).some((obj) => obj[id] === ui.item.value)
      ) {
        // We have an item to switch
        this.value = ui.item.label;
        callback(ui.item.value);
      } else if (list.hasOwnProperty(value)) {
        // Or try to restore old valid value
        this.value = list[value][name];
        callback(value);
      } else {
        // No luck, set it empty
        this.value = "";
        callback(null);
      }
    };

    listNode.autocomplete({
      minLength: 2,
      delay: 0,
      source: function (request, response) {
        let matcher = new RegExp(
          $.ui.autocomplete.escapeRegex(request.term),
          "i",
        );
        response(
          Object.values(list)
            .filter((item) => matcher.test(item[name]))
            .map((item) => ({ label: item[name], value: item[id] })),
        );
      },
      select: onChange, // Dropdown list click
      focus: onChange, // Arrow keys press
      change: onChange, // Keyboard type
    });

    if (Object.values(list).some((obj) => obj[id] === value)) {
      listNode.val(list[value][name]);
    }

    return listNode;
  }

  function addSettingsToggle(
    node,
    settingName,
    labelText,
    hintText,
    enabledCallBack,
    disabledCallBack,
  ) {
    return $(`
          <div class="script_bg_${settingName}" style="margin-top: 5px; width: 90%; display: inline-block; text-align: left;">
            <label title="${hintText}" tabindex="0" class="switch">
              <input class="script_${settingName}" type="checkbox" ${
                settingsRaw[settingName] ? " checked" : ""
              }><span class="check"></span>
              <span style="margin-left: 10px;">${labelText}</span>
            </label>
          </div>`)
      .toggleClass("inactive-row", Boolean(settingsRaw.overrides[settingName]))
      .on("change", "input", function () {
        settingsRaw[settingName] = this.checked;
        updateSettingsFromState();

        $(".script_" + settingName).prop("checked", settingsRaw[settingName]);

        if (settingsRaw[settingName] && enabledCallBack) {
          enabledCallBack();
        }
        if (!settingsRaw[settingName] && disabledCallBack) {
          disabledCallBack();
        }
      })
      .on(
        "click",
        {
          label: `${labelText} (${settingName})`,
          name: settingName,
          type: "boolean",
        },
        openOverrideModal,
      )
      .appendTo(node);

    if (settingsRaw[settingName] && enabledCallBack) {
      enabledCallBack();
    }
  }

  function addSettingsNumber(node, settingName, labelText, hintText) {
    return $(`
          <div class="script_bg_${settingName}" style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <input class="script_${settingName}" type="text" style="text-align: right; height: 18px; width: 150px; float: right;" value="${settingsRaw[settingName]}"></input>
            </label>
          </div>`)
      .toggleClass("inactive-row", Boolean(settingsRaw.overrides[settingName]))
      .on("change", "input", function () {
        let parsedValue = getRealNumber(this.value);
        if (!isNaN(parsedValue)) {
          settingsRaw[settingName] = parsedValue;
          updateSettingsFromState();
        }
        $(".script_" + settingName).val(settingsRaw[settingName]);
      })
      .on(
        "click",
        {
          label: `${labelText} (${settingName})`,
          name: settingName,
          type: "number",
        },
        openOverrideModal,
      )
      .appendTo(node);
  }

  function addSettingsString(node, settingName, labelText, hintText) {
    return $(`
          <div class="script_bg_${settingName}" style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <input class="script_${settingName}" type="text" style="text-align: right; height: 18px; width: 70%; float: right;" value="${settingsRaw[settingName]}"></input>
            </label>
          </div>`)
      .toggleClass("inactive-row", Boolean(settingsRaw.overrides[settingName]))
      .on("change", "input", function () {
        settingsRaw[settingName] = this.value;
        updateSettingsFromState();
        $(".script_" + settingName).val(settingsRaw[settingName]);
      })
      .on(
        "click",
        {
          label: `${labelText} (${settingName})`,
          name: settingName,
          type: "string",
        },
        openOverrideModal,
      )
      .appendTo(node);
  }

  function buildSelectOptions(optionsList) {
    return optionsList
      .map(
        (item) =>
          `<option value="${item.val}" title="${item.hint ?? ""}">${
            item.label
          }</option>`,
      )
      .join();
  }

  function addSettingsSelect(
    node,
    settingName,
    labelText,
    hintText,
    optionsList,
  ) {
    let options = buildSelectOptions(optionsList);
    return $(`
          <div class="script_bg_${settingName}" style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <select class="script_${settingName}" style="width: 150px; float: right;">
                ${options}
              </select>
            </label>
          </div>`)
      .toggleClass("inactive-row", Boolean(settingsRaw.overrides[settingName]))
      .find("select")
      .val(settingsRaw[settingName])
      .on("change", function () {
        settingsRaw[settingName] = this.value;
        updateSettingsFromState();

        $(".script_" + settingName).val(settingsRaw[settingName]);
      })
      .end()
      .on(
        "click",
        {
          label: `${labelText} (${settingName})`,
          name: settingName,
          type: "select",
          options: options,
        },
        openOverrideModal,
      )
      .appendTo(node);
  }

  function addSettingsList(node, settingName, labelText, hintText, list) {
    let listBlock = $(`
          <div class="script_bg_${settingName}" style="display: inline-block; width: 90%; margin-top: 6px;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <input type="text" style="height: 25px; width: 150px; float: right;" placeholder="Research...">
              <button class="button" style="height: 25px; float: right; margin-right: 4px; margin-left: 4px;">Remove</button>
              <button class="button" style="height: 25px; float: right;">Add</button>
            </label>
            <br>
            <textarea class="script_${settingName} textarea" style="margin-top: 12px" readonly></textarea>
          </div>`)
      .toggleClass("inactive-row", Boolean(settingsRaw.overrides[settingName]))
      .on(
        "click",
        {
          label: `Add or Remove (${settingName})`,
          name: settingName,
          type: "list",
          options: { list: list, name: "name", id: "_vueBinding" },
        },
        openOverrideModal,
      )
      .appendTo(node);

    let selectedItem = "";

    let updateList = function () {
      let techsString = settingsRaw[settingName]
        .map(
          (id) =>
            Object.values(list).find((obj) => obj._vueBinding === id).name,
        )
        .join(", ");
      $(".script_" + settingName).val(techsString);
    };

    let onChange = function (event, ui) {
      event.preventDefault();

      // If it wasn't selected from list
      if (ui.item === null) {
        let typedName = Object.values(list).find(
          (obj) => obj.name === this.value,
        );
        if (typedName !== undefined) {
          ui.item = { label: this.value, value: typedName._vueBinding };
        }
      }

      // We have an item to switch
      if (ui.item !== null && list.hasOwnProperty(ui.item.value)) {
        this.value = ui.item.label;
        selectedItem = ui.item.value;
      } else {
        this.value = "";
        selectedItem = null;
      }
    };

    listBlock.find("input").autocomplete({
      minLength: 2,
      delay: 0,
      source: function (request, response) {
        let matcher = new RegExp(
          $.ui.autocomplete.escapeRegex(request.term),
          "i",
        );
        response(
          Object.values(list)
            .filter((item) => matcher.test(item.name))
            .map((item) => ({ label: item.name, value: item._vueBinding })),
        );
      },
      select: onChange, // Dropdown list click
      focus: onChange, // Arrow keys press
      change: onChange, // Keyboard type
    });

    listBlock.on("click", "button:eq(1)", function () {
      if (selectedItem && !settingsRaw[settingName].includes(selectedItem)) {
        settingsRaw[settingName].push(selectedItem);
        settingsRaw[settingName].sort();
        updateSettingsFromState();
        updateList();
      }
    });

    listBlock.on("click", "button:eq(0)", function () {
      if (selectedItem && settingsRaw[settingName].includes(selectedItem)) {
        settingsRaw[settingName].splice(
          settingsRaw[settingName].indexOf(selectedItem),
          1,
        );
        settingsRaw[settingName].sort();
        updateSettingsFromState();
        updateList();
      }
    });

    updateList();
  }

  function addInputCallbacks(node, settingKey) {
    return node
      .on("change", function () {
        let parsedValue = getRealNumber(this.value);
        if (!isNaN(parsedValue)) {
          settingsRaw[settingKey] = parsedValue;
          updateSettingsFromState();
        }
        $(".script_" + settingKey).val(settingsRaw[settingKey]);
      })
      .on(
        "click",
        { label: `Number (${settingKey})`, name: settingKey, type: "number" },
        openOverrideModal,
      );
  }

  function addTableInput(node, settingKey) {
    node
      .addClass(
        "script_bg_" +
          settingKey +
          (settingsRaw.overrides[settingKey] ? " inactive-row" : ""),
      )
      .append(
        addInputCallbacks(
          $(
            `<input class="script_${settingKey}" type="text" class="input is-small" style="height: 25px; width:100%" value="${settingsRaw[settingKey]}"/>`,
          ),
          settingKey,
        ),
      );
  }

  function addToggleCallbacks(node, settingKey) {
    return node
      .on("change", "input", function () {
        settingsRaw[settingKey] = this.checked;
        updateSettingsFromState();

        $(".script_" + settingKey).prop("checked", settingsRaw[settingKey]);
      })
      .on(
        "click",
        { label: `Toggle (${settingKey})`, name: settingKey, type: "boolean" },
        openOverrideModal,
      );
  }

  function addTableToggle(node, settingKey) {
    node
      .addClass(
        "script_bg_" +
          settingKey +
          (settingsRaw.overrides[settingKey] ? " inactive-row" : ""),
      )
      .append(
        addToggleCallbacks(
          $(`
          <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
            <input class="script_${settingKey}" type="checkbox"${
              settingsRaw[settingKey] ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span style="margin-left: 20px;"></span>
          </label>`),
          settingKey,
        ),
      );
  }

  function buildTableLabel(note, title = "", color = "has-text-info") {
    return $(`<span class="${color}" title="${title}" >${note}</span>`);
  }

  function resetCheckbox() {
    Array.from(arguments).forEach((item) =>
      $(".script_" + item).prop("checked", settingsRaw[item]),
    );
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

  function buildActiveTargetsUI() {
    $("#buildQueue").before(`
            <div id="active_targets-wrapper" class="bldQueue vscroll right">
                <h2 class="has-text-success">Detailed Queue</h2>
                <div id="active_targets">
                    <div class="target-type-box triggers" style="display: none;">
                        <h2>Triggers</h2>
                        <ul class="active_targets-list triggers"></ul>
                    </div>
                    <div class="target-type-box buildings" style="display: none;">
                        <h2>Buildings</h2>
                        <ul class="active_targets-list buildings"></ul>
                    </div>
                    <div class="target-type-box research" style="display: none;">
                        <h2>Research</h2>
                        <ul class="active_targets-list research"></ul>
                    </div>
                    <div class="target-type-box arpa" style="display: none;">
                        <h2>A.R.P.A.</h2>
                        <ul class="active_targets-list arpa"></ul>
                    </div>
                </div>
            </div>`);

    // game assumes only message and build queue, and hardcodes heights accordingly. This overrides that to ensure scroll bars are added on message queue when active targets queue crowds it out
    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.borderBoxSize) {
            const elementHeight = entry.borderBoxSize[0].blockSize;
            const totalHeight = `${
              elementHeight + $(`#buildQueue`).outerHeight()
            }px`;

            $("#msgQueue").css(
              "max-height",
              `calc((100vh - ${totalHeight}) - 6rem)`,
            );
          }
        }
      });

      resizeObserver.observe($("#active_targets-wrapper")[0]);
    }
  }

  function removeActiveTargetsUI() {
    $("#active_targets-wrapper").remove();
  }

  function buildBuildPlannerUI() {
    // Anchor above the queues, not after #msgQueue: the game auto-sizes
    // #msgQueue (vscroll) to fill the column, so anything placed after it is
    // pushed below the fold and only becomes visible when the game's resize
    // relayout (xs) reshuffles the queues. Inserting before #buildQueue keeps
    // it visible immediately, same as the Detailed Queue UI.
    if ($("#buildQueue").length === 0) {
      return;
    }
    $("#buildQueue").before(`
            <div id="script_planner-wrapper" class="bldQueue vscroll right">
                <h2 id="script_planner-header" class="has-text-success">Script Planner</h2>
                <div id="script_planner">
                    <ul id="script_planner-list"></ul>
                    <div id="script_planner-stats">
                        <h2>Bottlenecks <a id="script_planner-reset">reset</a></h2>
                        <div id="script_planner-stats-text"></div>
                    </div>
                </div>
            </div>`);

    $("#script_planner").toggle(!settingsRaw.buildPlannerCollapsed);
    $("#script_planner-header").on("click", function () {
      settingsRaw.buildPlannerCollapsed = !settingsRaw.buildPlannerCollapsed;
      $("#script_planner").toggle(!settingsRaw.buildPlannerCollapsed);
      updateSettingsFromState();
    });
    $("#script_planner-reset").on("click", function () {
      state.plannerStats = makePlannerStats();
      savePlannerStats();
      $("#script_planner-stats-text").html("");
    });
  }

  function removeBuildPlannerUI() {
    $("#script_planner-wrapper").remove();
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

  function buildStorageSettings() {
    let sectionId = "storage";
    let sectionName = "Storage";

    let resetFunction = function () {
      resetStorageSettings(true);
      updateSettingsFromState();
      updateStorageSettingsContent();

      resetCheckbox("autoStorage");
      removeStorageToggles();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateStorageSettingsContent,
    );
  }

  function updateStorageSettingsContent() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_storageContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "storageLimitPreMad",
      "Limit Pre-MAD Storage",
      "Saves resources and shortens run time by limiting storage pre-MAD",
    );
    addSettingsToggle(
      currentNode,
      "storageSafeReassign",
      "Reassign only empty storages",
      "Wait until storage is empty before reassigning containers to another resource, to prevent overflowing and wasting resources",
    );
    addSettingsToggle(
      currentNode,
      "storageAssignExtra",
      "Assign buffer storage",
      "Assigns 3% extra strorage above required amounts, ensuring that required quantity will be actually reached, even if other part of script trying to sell\\eject\\switch production, etc. When manual trades enabled applies additional adjust derieved from selling threshold.",
    );
    addSettingsToggle(
      currentNode,
      "storageAssignPart",
      "Assign partial storage",
      "When enabled script will be allowed to assign some crates and containers even if resulting storage space won't be enough to build new building. It allows to pre-build stock of resources for further use, but can be potentially dungerous.\nIf script not allowed to reassign non-empty storage it can lock storage in position when stored resources can't be used.\nIf script is allowed to reassign non-empty storage it might waste time producing materials which might need to be disposed.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:15%">Enabled</th>
              <th class="has-text-warning" style="width:15%">Store Overflow</th>
              <th class="has-text-warning" style="width:15%">Min Storage</th>
              <th class="has-text-warning" style="width:15%">Max Storage</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_storageTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_storageTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < StorageManager.priorityList.length; i++) {
      const resource = StorageManager.priorityList[i];
      newTableBodyText += `<tr value="${resource.id}" class="script-draggable"><td id="script_storage_${resource.id}" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other storages settings rows
    for (let i = 0; i < StorageManager.priorityList.length; i++) {
      const resource = StorageManager.priorityList[i];
      let storageElement = $("#script_storage_" + resource.id);

      storageElement.append(buildTableLabel(resource.name));

      storageElement = storageElement.next();
      addTableToggle(storageElement, "res_storage" + resource.id);

      storageElement = storageElement.next();
      addTableToggle(storageElement, "res_storage_o_" + resource.id);

      storageElement = storageElement.next();
      addTableInput(storageElement, "res_min_store" + resource.id);

      storageElement = storageElement.next();
      addTableInput(storageElement, "res_max_store" + resource.id);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let storageIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < storageIds.length; i++) {
          settingsRaw["res_storage_p_" + storageIds[i]] = i;
        }

        StorageManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
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
  function buildMagicSettings() {
    let sectionId = "magic";
    let sectionName = "Magic";

    let resetFunction = function () {
      resetMagicSettings(true);
      updateSettingsFromState();
      updateMagicSettingsContent();

      resetCheckbox("autoAlchemy", "autoPylon", "magicFullmetalHelper");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateMagicSettingsContent,
    );
  }

  function updateMagicSettingsContent() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_magicContent");
    currentNode.empty().off("*");

    updateMagicAlchemy(currentNode);
    updateMagicPylon(currentNode);

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function updateMagicAlchemy(currentNode) {
    addStandardHeading(currentNode, "Alchemy");
    addSettingsNumber(
      currentNode,
      "magicAlchemyManaUse",
      "Mana income used",
      "Income portion to use on alchemy. Setting to 1 is not recommended, leftover mana will be used for rituals.",
    );
    addSettingsToggle(
      currentNode,
      "magicFullmetalHelper",
      "Fullmetal helper",
      "In Magic universe with Alchemy II, keep one non-basic alchemy transmutation active long enough to claim Fullmetal if the achievement is still below the current star level. Requires autoAlchemy.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Resource</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:40%"></th>
            </tr>
            <tbody id="script_alchemyTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_alchemyTableBody");
    let newTableBodyText = "";

    for (let resource of AlchemyManager.priorityList) {
      newTableBodyText += `<tr><td id="script_alchemy_${resource.id}" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    for (let resource of AlchemyManager.priorityList) {
      let node = $("#script_alchemy_" + resource.id);

      let color =
        AlchemyManager.transmuteTier(resource) > 1
          ? "has-text-advanced"
          : "has-text-info";
      node.append(buildTableLabel(resource.name, "", color));

      node = node.next();
      addTableToggle(node, "res_alchemy_" + resource.id);

      node = node.next();
      addTableInput(node, "res_alchemy_w_" + resource.id);
    }
  }

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
    updateSettingsFromState,
    resetCheckbox,
    removeCraftToggles,
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
  function updateMagicPylon(currentNode) {
    addStandardHeading(currentNode, "Pylon");
    addSettingsNumber(
      currentNode,
      "productionRitualManaUse",
      "Mana income used",
      "Income portion to use on rituals. Setting to 1 is not recommended, as it will halt mana regeneration. Applied only when mana not capped - with capped mana script will always use all income.",
    );
    addSettingsToggle(
      currentNode,
      "productionRitualSafe",
      "Safe rituals",
      "Limit max rituals to safe, unsuspicious amount. Have no effect out of Witch Hunter scenario.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:55%">Ritual</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th style="width:25%"></th>
            </tr>
            <tbody id="script_magicTableBodyPylon"></tbody>
          </table>`);

    let tableBodyNode = $("#script_magicTableBodyPylon");
    let newTableBodyText = "";

    let pylonProducts = Object.values(RitualManager.Productions);

    for (let i = 0; i < pylonProducts.length; i++) {
      let production = pylonProducts[i];
      newTableBodyText += `<tr><td id="script_pylon_${production.id}" style="width:55%"></td><td style="width:20%"></td><td style="width:25%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < pylonProducts.length; i++) {
      let production = pylonProducts[i];
      let productionElement = $("#script_pylon_" + production.id);

      productionElement.append(
        buildTableLabel(game.loc(`modal_pylon_spell_${production.id}`)),
      );

      productionElement = productionElement.next();
      addTableInput(productionElement, "spell_w_" + production.id);
    }
  }

  function buildJobSettings() {
    let sectionId = "job";
    let sectionName = "Job";

    let resetFunction = function () {
      resetJobSettings(true);
      updateSettingsFromState();
      updateJobSettingsContent();

      resetCheckbox("autoJobs", "autoCraftsmen");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateJobSettingsContent,
    );
  }

  function updateJobSettingsContent() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_jobContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "jobSetDefault",
      "Set default job",
      "Automatically sets the default job in order of Quarry Worker -> Lumberjack -> Crystal Miner -> Scavenger -> Hunter -> Farmer -> Unemployed",
    );
    addSettingsToggle(
      currentNode,
      "jobManageServants",
      "Manage Servants",
      "Automatically manage servants, they will be used as substitute of regular workers, sharing same breakpoints and priorities, i.e. for breakpoint 10 script might assign 8 workers and 2 servants, and such.",
    );
    addSettingsNumber(
      currentNode,
      "jobLumberWeighting",
      "Final Lumberjack Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobQuarryWeighting",
      "Final Quarry Worker Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobCrystalWeighting",
      "Final Crystal Miner Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobScavengerWeighting",
      "Final Scavenger Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobRaiderWeighting",
      "Final Raider Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobForagerWeighting",
      "Final Forager Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsToggle(
      currentNode,
      "jobDisableMiners",
      "Disable miners in Andromeda",
      "Disable Miners and Coal Miners after reaching Andromeda",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Job</th>
              <th class="has-text-warning" style="width:17%">1st Pass</th>
              <th class="has-text-warning" style="width:17%">2nd Pass</th>
              <th class="has-text-warning" style="width:17%">3rd Pass</th>
              <th class="has-text-warning" style="width:9%" title="When enabled script will limit amount of assigned workers down to maximum useful quantity, moving idling workers to other jobs">Smart</th>
              <td style="width:5%"><span id="script_resetJobsPriority" class="script-refresh"></span></td>
            </tr>
            <tbody id="script_jobTableBody"></tbody>
          </table>`);

    $("#script_resetJobsPriority").on("click", function () {
      if (confirm("Are you sure you wish to reset jobs priority?")) {
        JobManager.priorityList = Object.values(jobs);
        for (let i = 0; i < JobManager.priorityList.length; i++) {
          let id = JobManager.priorityList[i]._originalId;
          settingsRaw["job_p_" + id] = i;
        }
        updateSettingsFromState();
        updateJobSettingsContent();
      }
    });

    let tableBodyNode = $("#script_jobTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < JobManager.priorityList.length; i++) {
      const job = JobManager.priorityList[i];
      newTableBodyText += `<tr value="${job._originalId}" class="script-draggable"><td id="script_${job._originalId}" style="width:35%"></td><td style="width:17%"></td><td style="width:17%"></td><td style="width:17%"></td><td style="width:9%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    for (let i = 0; i < JobManager.priorityList.length; i++) {
      const job = JobManager.priorityList[i];
      let jobElement = $("#script_" + job._originalId);

      buildJobSettingsToggle(jobElement, job);
      jobElement = jobElement.next();
      buildJobSettingsInput(jobElement, job, 1);
      jobElement = jobElement.next();
      buildJobSettingsInput(jobElement, job, 2);
      jobElement = jobElement.next();
      buildJobSettingsInput(jobElement, job, 3);
      jobElement = jobElement.next();
      if (job.is.smart) {
        addTableToggle(jobElement, "job_s_" + job._originalId);
      }

      jobElement = jobElement.next();
      jobElement.append($('<span class="script-lastcolumn"></span>'));
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let sortedIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < sortedIds.length; i++) {
          settingsRaw["job_p_" + sortedIds[i]] = i;
        }

        JobManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildJobSettingsToggle(node, job) {
    let settingKey = "job_" + job._originalId;
    let color =
      job === jobs.Unemployed
        ? "warning"
        : job instanceof CraftingJob
          ? "danger"
          : job instanceof BasicJob
            ? "info"
            : "advanced";
    node
      .addClass(
        "script_bg_" +
          settingKey +
          (settingsRaw.overrides[settingKey] ? " inactive-row" : ""),
      )
      .append(
        addToggleCallbacks(
          $(`
          <label tabindex="0" class="switch" style="margin-top:4px; margin-left:10px;">
            <input class="script_${settingKey}" type="checkbox"${
              settingsRaw[settingKey] ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span class="has-text-${color}" style="margin-left: 20px;">${
              job._originalName
            }</span>
          </label>`),
          settingKey,
        ),
      );
  }

  function buildJobSettingsInput(node, job, breakpoint) {
    if (job instanceof CraftingJob) {
      node.append(`<span>Managed</span>`);
    } else if (breakpoint === 3 && job.is.split) {
      node.append(`<span>Weighted</span>`);
    } else {
      addTableInput(node, `job_b${breakpoint}_${job._originalId}`);
    }
  }

  function buildWeightingSettings() {
    let sectionId = "weighting";
    let sectionName = "AutoBuild Weighting";

    let resetFunction = function () {
      resetWeightingSettings(true);
      updateSettingsFromState();
      updateWeightingSettingsContent();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateWeightingSettingsContent,
    );
  }

  function updateWeightingSettingsContent() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_weightingContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "buildingBuildIfStorageFull",
      "Ignore weighting and build if any storage is full",
      "Ignore weighting and immediately construct building if it uses any capped resource, preventing wasting them by overflowing. Weight still need to be positive(above zero) for this to happen.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:30%">Target</th>
              <th class="has-text-warning" style="width:60%">Condition</th>
              <th class="has-text-warning" style="width:10%">Multiplier</th>
            </tr>
            <tbody id="script_weightingTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_weightingTableBody");

    addWeightingRule(
      tableBodyNode,
      "Any",
      "New building",
      "buildingWeightingNew",
    );
    addWeightingRule(
      tableBodyNode,
      "Powered building",
      "Low available energy",
      "buildingWeightingUnderpowered",
    );
    addWeightingRule(
      tableBodyNode,
      "Power plant",
      "Low available energy",
      "buildingWeightingNeedfulPowerPlant",
    );
    addWeightingRule(
      tableBodyNode,
      "Power plant",
      "Producing more energy than required",
      "buildingWeightingUselessPowerPlant",
    );
    addWeightingRule(
      tableBodyNode,
      "Knowledge storage",
      "Have unaffordable researches or build targets",
      "buildingWeightingNeedfulKnowledge",
    );
    addWeightingRule(
      tableBodyNode,
      "Knowledge storage",
      "All researches and build targets already affordable",
      "buildingWeightingUselessKnowledge",
    );
    addWeightingRule(
      tableBodyNode,
      "Building with state (city)",
      "Some instances of this building are not working",
      "buildingWeightingNonOperatingCity",
    );
    addWeightingRule(
      tableBodyNode,
      "Building with state (space)",
      "Some instances of this building are not working",
      "buildingWeightingNonOperating",
    );
    addWeightingRule(
      tableBodyNode,
      "Building with consumption",
      "Missing consumables to operate",
      "buildingWeightingMissingSupply",
    );
    addWeightingRule(
      tableBodyNode,
      "Support consumer",
      "Missing support to operate",
      "buildingWeightingMissingSupport",
    );
    addWeightingRule(
      tableBodyNode,
      "Support provider",
      "Provided support not currently needed",
      "buildingWeightingUselessSupport",
    );
    addWeightingRule(
      tableBodyNode,
      "All fuel depots",
      "Missing Oil or Helium for techs and missions",
      "buildingWeightingMissingFuel",
    );
    addWeightingRule(
      tableBodyNode,
      "Not housing, barrack, oil derrick, or knowledge building",
      "MAD prestige enabled, and affordable",
      "buildingWeightingMADUseless",
    );
    addWeightingRule(
      tableBodyNode,
      "Mass Ejector",
      "Existed ejectors not fully utilized",
      "buildingWeightingUnusedEjectors",
    );
    addWeightingRule(
      tableBodyNode,
      "Freight Yard, Container Port, Munitions Depot",
      "Have unused crates or containers",
      "buildingWeightingCrateUseless",
    );
    addWeightingRule(
      tableBodyNode,
      "Horseshoes",
      "No more Horseshoes needed",
      "buildingWeightingHorseshoeUseless",
    );
    addWeightingRule(
      tableBodyNode,
      "Meditation Chamber",
      "No more Meditation Space needed",
      "buildingWeightingZenUseless",
    );
    addWeightingRule(
      tableBodyNode,
      "Gate Turret",
      "Gate demons fully supressed",
      "buildingWeightingGateTurret",
    );
    addWeightingRule(
      tableBodyNode,
      "Warehouses, Garage, Cargo Yard, Storehouse",
      "Need more storage",
      "buildingWeightingNeedStorage",
    );
    addWeightingRule(
      tableBodyNode,
      "Housing",
      "Less than 90% of houses are used",
      "buildingWeightingUselessHousing",
    );
    addWeightingRule(
      tableBodyNode,
      "Orbital Decay",
      "City and Moon buildings",
      "buildingWeightingTemporal",
    );
    addWeightingRule(
      tableBodyNode,
      "The True Path",
      "Solar buildings after reaching Tau Ceti",
      "buildingWeightingSolar",
    );
    addWeightingRule(
      tableBodyNode,
      "Womlings Missions",
      "Womlings unlock actions conflicting with Overlord",
      "buildingWeightingOverlord",
    );
    addWeightingRule(
      tableBodyNode,
      "Banana Republic objectives",
      "World Collider and Monuments while their objectives are unfinished",
      "buildingWeightingBananaObjective",
    );
    addWeightingRule(
      tableBodyNode,
      "Inflation Money helpers",
      "Money storage until $250B cap is reachable, then Money income",
      "buildingWeightingInflationMoney",
    );
    addWeightingRule(
      tableBodyNode,
      "Retirement preparation",
      "Tau Fusion Generators, Factories, and Disease Labs below the pre-Isolation targets",
      "buildingWeightingRetirementPrep",
    );
    addWeightingRule(
      tableBodyNode,
      "Authority cap buildings (Evil universe)",
      "Authority cap below configured minimum",
      "buildingWeightingAuthority",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function addWeightingRule(table, targetName, conditionDesc, settingKey) {
    let ruleNode = $(`
          <tr>
            <td style="width:30%"><span class="has-text-info">${targetName}</span></td>
            <td style="width:60%"><span class="has-text-info">${conditionDesc}</span></td>
            <td style="width:10%"></td>
          </tr>`);
    addTableInput(ruleNode.find("td:eq(2)"), settingKey);
    table.append(ruleNode);
  }

  function buildBuildingSettings() {
    let sectionId = "building";
    let sectionName = "Building";

    let resetFunction = function () {
      resetBuildingSettings(true);
      updateSettingsFromState();
      updateBuildingSettingsContent();

      resetCheckbox("autoBuild", "autoPower");
      removeBuildingToggles();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateBuildingSettingsContent,
    );
  }

  function updateBuildingSettingsContent() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_buildingContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "buildingsIgnoreZeroRate",
      "Do not wait for resources without income",
      "Weighting checks will ignore resources without positive income(craftables, inactive factory goods, etc), buildings with such resources will not delay other buildings.",
    );
    addSettingsToggle(
      currentNode,
      "buildingsLimitPowered",
      "Limit amount of powered buildings",
      "With this option enabled Max Build will prevent powering extra building. Can be useful to disable buildings with overrided settings.",
    );
    addSettingsToggle(
      currentNode,
      "buildingsTransportGem",
      "Build cheapest Supplies transport",
      "By default script chooses between Lake Transport and Lake Bireme Warship comparing their 'Supplies Per Support', with this option enabled it will compare 'Supplies Per Soulgems' instead.",
    );
    addSettingsToggle(
      currentNode,
      "buildingsBestFreighter",
      "Build most efficient freighters",
      "With this option enabled script will compare 'Money Storage per Crew' of Freighter and Super Freighter, and only build the best one. Without this option no restrictions will be applied. Works only when both ships are buildable.",
    );
    addSettingsToggle(
      currentNode,
      "buildingsUseMultiClick",
      "Bulk build multi-segmented buildings",
      "With this option enabled, the script will build as many segments as are affordable at once, instead of one per tick.",
    );
    addSettingsNumber(
      currentNode,
      "buildingTowerSuppression",
      "Minimum suppression for Towers",
      "East Tower and West Tower won't be built until minimum suppression is reached",
    );

    const consumptionOptions = [
      {
        val: "onePerTick",
        label: "Default",
        hint: "Script will stop building buildings for one tick after buying building with support/upkeep. (Example: 1 Living Quarters stops processing of all buildings until next script tick.)",
      },
      {
        val: "perResource",
        label: "Non-conflicting only",
        hint: "During a tick, the script will only buy at most one building using a given support/upkeep type, but non-conflicting ones are allowed. Should be safe in most cases. (Example: 1 Living Quarters stops building the other buildings using Red Planet support for that tick, but it can still build on other planets.)",
      },
      {
        val: "unlimited",
        label: "Unlimited",
        hint: "Do not pay attention to support/upkeep requirements. This will cause bugs and undesirable behavior as it can easily exceed the maximum support. But, at extremely high prestige levels, this may be required. (Example: Can buy 1 Living Quarters + 1 Mine + 1 Fabrication + 1 Biodome in a single tick even if there is only 2 support left.)",
      },
    ];
    addSettingsSelect(
      currentNode,
      "buildingConsumptionCheck",
      "Behavior when building support/upkeep-using building",
      "By default, the script only buys one building with support or upkeep requirement per tick, to allow automatic weightings to work optimally.",
      consumptionOptions,
    );

    currentNode.append(`
          <div><input id="script_buildingSearch" class="script-searchsettings" type="text" placeholder="Search for buildings..."></div>
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Building</th>
              <th class="has-text-warning" style="width:15%" title="Enables auto building. Triggers ignores this option, allowing to build disabled things.">Auto Build</th>
              <th class="has-text-warning" style="width:15%" title="Maximum amount of buildings to build. Triggers ignores this option, allowing to build above limit. Can be also used to limit amount of enabled buildings, with respective option above.">Max Build</th>
              <th class="has-text-warning" style="width:15%" title="Script will try to spend 2x amount of resources on building having 2x weighting, and such.">Weighting</th>
              <th class="has-text-warning" style="width:20%" title="First toggle enables basic automation based on priority, power, support, and consumption. Second enables logic made specially for particlular building, their effects are different, but generally it tries to behave smarter than just staying enabled all the time.">Auto Power</th>
            </tr>
            <tbody id="script_buildingTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_buildingTableBody");

    $("#script_buildingSearch").on("keyup", filterBuildingSettingsTable); // Add building filter

    // Add in a first row for switching "All"
    let newTableBodyText =
      '<tr value="All" class="unsortable"><td id="script_bldallToggle" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"><span id="script_resetBuildingsPriority" class="script-refresh"></span></td></tr>';

    for (let i = 0; i < BuildingManager.priorityList.length; i++) {
      let building = BuildingManager.priorityList[i];
      newTableBodyText += `<tr value="${building._vueBinding}" class="script-draggable"><td id="script_${building._vueBinding}" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build special "All Buildings" top row
    let buildingElement = $("#script_bldallToggle");
    buildingElement.append(
      '<span class="has-text-warning" style="margin-left: 20px;">All Buildings</span>',
    );

    // enabled column
    buildingElement = buildingElement.next();
    buildingElement.append(buildAllBuildingEnabledSettingsToggle());

    // state column
    buildingElement = buildingElement.next().next().next();
    buildingElement.append(buildAllBuildingStateSettingsToggle());

    $("#script_resetBuildingsPriority").on("click", function () {
      if (confirm("Are you sure you wish to reset buildings priority?")) {
        initBuildingState();
        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
          let id = BuildingManager.priorityList[i]._vueBinding;
          settingsRaw["bld_p_" + id] = i;
        }
        updateSettingsFromState();
        updateBuildingSettingsContent();
      }
    });

    // Build all other buildings settings rows
    for (let i = 0; i < BuildingManager.priorityList.length; i++) {
      let building = BuildingManager.priorityList[i];
      let buildingElement = $("#script_" + building._vueBinding);

      let color =
        building._tab === "space" || building._tab === "starDock"
          ? "has-text-danger"
          : building._tab === "galaxy" || building._tab === "eden"
            ? "has-text-advanced"
            : building._tab === "interstellar"
              ? "has-text-special"
              : building._tab === "portal" || building._tab === "tauceti"
                ? "has-text-warning"
                : "has-text-info";

      buildingElement.append(buildTableLabel(building.name, "", color));

      buildingElement = buildingElement.next();
      addTableToggle(buildingElement, "bat" + building._vueBinding);

      buildingElement = buildingElement.next();
      addTableInput(buildingElement, "bld_m_" + building._vueBinding);

      buildingElement = buildingElement.next();
      addTableInput(buildingElement, "bld_w_" + building._vueBinding);

      buildingElement = buildingElement.next();
      buildBuildingStateSettingsToggle(buildingElement, building);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let buildingElements = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < buildingElements.length; i++) {
          settingsRaw["bld_p_" + buildingElements[i]] = i;
        }

        BuildingManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function filterBuildingSettingsTable() {
    // Declare variables
    let filter = document
      .getElementById("script_buildingSearch")
      .value.toUpperCase();
    let trs = document
      .getElementById("script_buildingTableBody")
      .getElementsByTagName("tr");

    let filterChecker = null;
    let reg = filter.match(/^(.+)(<=|>=|===|==|<|>|!==|!=)(.+)$/);
    if (reg?.length === 4) {
      let buildingValue = null;
      switch (reg[1].trim()) {
        case "BUILD":
        case "AUTOBUILD":
          buildingValue = (b) => b.autoBuildEnabled;
          break;
        case "POWER":
        case "AUTOPOWER":
          buildingValue = (b) => b.autoStateEnabled;
          break;
        case "WEIGHT":
        case "WEIGHTING":
          buildingValue = (b) => b._weighting;
          break;
        case "MAX":
        case "MAXBUILD":
          buildingValue = (b) => b._autoMax;
          break;
        case "POWERED":
          buildingValue = (b) => b.powered;
          break;
        case "KNOW":
        case "KNOWLEDGE":
          buildingValue = (b) => b.is.knowledge;
          break;
        default: // Cost check, get resource quantity by part of name
          buildingValue = (b) =>
            Object.entries(b.cost).find(
              ([res, qnt]) =>
                resources[res].title.toUpperCase().indexOf(reg[1].trim()) > -1,
            )?.[1] ?? 0;
      }
      let testValue = null;
      switch (reg[3].trim()) {
        case "ON":
        case "TRUE":
          testValue = true;
          break;
        case "OFF":
        case "FALSE":
          testValue = false;
          break;
        default:
          testValue = getRealNumber(reg[3].trim());
          break;
      }
      filterChecker = (building) =>
        checkCompare[reg[2]](buildingValue(building), testValue);
    }

    // Loop through all table rows, and hide those who don't match the search query
    for (let i = 0; i < trs.length; i++) {
      let td = trs[i].getElementsByTagName("td")[0];
      if (td) {
        if (filterChecker) {
          let building = buildingIds[td.id.match(/^script_(.*)$/)[1]];
          if (building && filterChecker(building)) {
            trs[i].style.display = "";
          } else {
            trs[i].style.display = "none";
          }
        } else if (td.textContent.toUpperCase().indexOf(filter) > -1) {
          trs[i].style.display = "";
        } else {
          trs[i].style.display = "none";
        }
      }
    }
  }

  function buildAllBuildingEnabledSettingsToggle() {
    return $(`
          <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
            <input class="script_buildingEnabledAll" type="checkbox"${
              settingsRaw.buildingEnabledAll ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span style="margin-left: 20px;"></span>
          </label>`)
      .on("change", "input", function () {
        settingsRaw.buildingEnabledAll = this.checked;
        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
          let id = BuildingManager.priorityList[i]._vueBinding;
          settingsRaw["bat" + id] = this.checked;
        }
        $('[class^="script_bat"]').prop("checked", this.checked);

        updateSettingsFromState();
      })
      .on("click", function (event) {
        if (event[overrideKey]) {
          event.preventDefault();
        }
        if (
          event.target.nodeName === "INPUT" &&
          !confirm(
            "Are you sure you wish to change the Auto Build state of ALL buildings?",
          )
        ) {
          event.preventDefault();
        }
      });
  }

  function buildBuildingStateSettingsToggle(node, building) {
    let stateKey = "bld_s_" + building._vueBinding;
    let smartKey = "bld_s2_" + building._vueBinding;

    if (building.isSwitchable()) {
      addToggleCallbacks(
        $(`
              <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                <input class="script_${stateKey}" type="checkbox"${
                  settingsRaw[stateKey] ? " checked" : ""
                }>
                <span class="check" style="height:5px; max-width:15px"></span>
                <span style="margin-left: 20px;"></span>
              </label>`),
        stateKey,
      ).appendTo(node);
      node.addClass("script_bg_" + stateKey);
    }

    if (building.is.smart) {
      let smartNode = $(`
              <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 35px;">
                <input class="script_${smartKey}" type="checkbox"${
                  settingsRaw[smartKey] ? " checked" : ""
                }>
                <span class="check" style="height:5px; max-width:15px"></span>
                <span style="margin-left: 20px;"></span>
              </label>`);

      let set = linkedBuildings.find((set) => set.includes(building));
      if (set) {
        smartNode.on("change", "input", function () {
          set.forEach((building) => {
            let linkedId = "bld_s2_" + building._vueBinding;
            settingsRaw[linkedId] = this.checked;
            $(".script_" + linkedId).prop("checked", this.checked);
          });
          updateSettingsFromState();
        });
      } else {
        addToggleCallbacks(smartNode, smartKey);
      }
      node.append(smartNode);
      node.addClass("script_bg_" + smartKey);
    }

    node.append(`<span class="script-lastcolumn"></span>`);
    node.toggleClass(
      "inactive-row",
      Boolean(
        settingsRaw.overrides[stateKey] || settingsRaw.overrides[smartKey],
      ),
    );
  }

  function buildAllBuildingStateSettingsToggle() {
    return $(`
          <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
            <input class="script_buildingStateAll" type="checkbox"${
              settingsRaw.buildingStateAll ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span style="margin-left: 20px;"></span>
          </label>`)
      .on("change", "input", function (e) {
        settingsRaw.buildingStateAll = this.checked;
        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
          let id = BuildingManager.priorityList[i]._vueBinding;
          settingsRaw["bld_s_" + id] = this.checked;
        }
        $('[class^="script_bld_s_"]').prop("checked", this.checked);

        updateSettingsFromState();
      })
      .on("click", function (event) {
        if (event[overrideKey]) {
          event.preventDefault();
        }
        if (
          event.target.nodeName === "INPUT" &&
          !confirm(
            "Are you sure you wish to change the Auto Power state of ALL buildings?",
          )
        ) {
          event.preventDefault();
        }
      });
  }

  function buildProjectSettings() {
    let sectionId = "project";
    let sectionName = "A.R.P.A.";

    let resetFunction = function () {
      resetProjectSettings(true);
      updateSettingsFromState();
      updateProjectSettingsContent();

      resetCheckbox("autoARPA");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateProjectSettingsContent,
    );
  }

  function updateProjectSettingsContent() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_projectContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "arpaScaleWeighting",
      "Scale weighting with progress",
      "Projects weighting scales  with current progress, making script more eager to spend resources on finishing nearly constructed projects.",
    );
    addSettingsNumber(
      currentNode,
      "arpaStep",
      "Preferred progress step",
      "Projects will be weighted and build in this steps. Increasing number can speed up constructing. Step will be adjusted down when preferred step above remaining amount, or surpass storage caps. Weightings below will be multiplied by current step. Projects builded by triggers will always have maximum possible step.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:25%">Project</th>
              <th class="has-text-warning" style="width:25%">Auto Build</th>
              <th class="has-text-warning" style="width:25%">Max Build</th>
              <th class="has-text-warning" style="width:25%">Weighting</th>
            </tr>
            <tbody id="script_projectTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_projectTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < ProjectManager.priorityList.length; i++) {
      const project = ProjectManager.priorityList[i];
      newTableBodyText += `<tr value="${project.id}" class="script-draggable"><td id="script_${project.id}" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other projects settings rows
    for (let i = 0; i < ProjectManager.priorityList.length; i++) {
      const project = ProjectManager.priorityList[i];
      let projectElement = $("#script_" + project.id);

      projectElement.append(buildTableLabel(project.name));

      projectElement = projectElement.next();
      addTableToggle(projectElement, "arpa_" + project.id);

      projectElement = projectElement.next();
      addTableInput(projectElement, "arpa_m_" + project.id);

      projectElement = projectElement.next();
      addTableInput(projectElement, "arpa_w_" + project.id);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let projectIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < projectIds.length; i++) {
          settingsRaw["arpa_p_" + projectIds[i]] = i;
        }

        ProjectManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildLoggingSettings(parentNode, secondaryPrefix) {
    let sectionId = "logging";
    let sectionName = "Logging";

    let resetFunction = function () {
      resetLoggingSettings(true);
      updateSettingsFromState();
      updateLoggingSettingsContent(secondaryPrefix);
      buildFilterRegExp();
    };

    buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      sectionId,
      sectionName,
      resetFunction,
      updateLoggingSettingsContent,
    );
  }

  function updateLoggingSettingsContent(secondaryPrefix) {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $(`#script_${secondaryPrefix}loggingContent`);
    currentNode.empty().off("*");

    addSettingsHeader1(currentNode, "Script Messages");
    addSettingsToggle(
      currentNode,
      "logEnabled",
      "Enable logging",
      "Master switch to enable logging of script actions in the game message queue",
    );
    Object.entries(GameLog.Types).forEach(([id, label]) =>
      addSettingsToggle(
        currentNode,
        "log_" + id,
        label,
        `If logging is enabled then logs ${label} actions`,
      ),
    );
    addSettingsString(
      currentNode,
      "log_prestige_format",
      "Prestige Log Format",
      "Available placeholders: {resetType}, {species}, {timestamp} (in game days). Use {eval: XXX } to log custom information",
    );

    addSettingsHeader1(currentNode, "Game Messages");
    addSettingsToggle(
      currentNode,
      "hellTurnOffLogMessages",
      "Turn off patrol and surveyor log messages",
      "Automatically turns off the hell patrol and surveyor log messages",
    );
    let stringsUrl = `strings/strings${
      game.global.settings.locale === "en-US"
        ? ""
        : "." + game.global.settings.locale
    }.json`;
    currentNode.append(`
          <div>
            <span>List of message IDs to filter, all game messages can be found <a href="${stringsUrl}" target="_blank">here</a>.</span><br>
            <textarea id="script_logFilter" class="textarea" style="margin-top: 4px;">${settingsRaw.logFilter}</textarea>
          </div>`);

    // Settings textarea
    $("#script_logFilter").on("change", function () {
      settingsRaw.logFilter = this.value;
      buildFilterRegExp();
      this.value = settingsRaw.logFilter;
      updateSettingsFromState();
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function createSettingToggle(
    node,
    settingKey,
    title,
    enabledCallBack,
    disabledCallBack,
  ) {
    let toggle = $(`
          <label class="switch script_bg_${settingKey}" tabindex="0" title="${title}">
            <input class="script_${settingKey}" type="checkbox"${
              settingsRaw[settingKey] ? " checked" : ""
            }/>
            <span class="check"></span><span>${settingKey}</span>
          </label><br>`).toggleClass(
      "inactive-row",
      Boolean(settingsRaw.overrides[settingKey]),
    );

    if (settingsRaw[settingKey] && enabledCallBack) {
      enabledCallBack();
    }

    toggle.on("change", "input", function () {
      settingsRaw[settingKey] = this.checked;
      updateSettingsFromState();
      if (settingsRaw[settingKey] && enabledCallBack) {
        enabledCallBack();
      }
      if (!settingsRaw[settingKey] && disabledCallBack) {
        disabledCallBack();
      }
    });
    toggle.on(
      "click",
      { label: `Toggle (${settingKey})`, name: settingKey, type: "boolean" },
      openOverrideModal,
    );

    node.append(toggle);
  }

  function updateOptionsUI() {
    // Build secondary options buttons if they don't currently exist
    addOptionUI(
      "s-government-options",
      "#government .tabs ul",
      "Government",
      buildGovernmentSettings,
    );
    addOptionUI(
      "s-foreign-options",
      "#garrison div h2",
      "Foreign Affairs",
      buildWarSettings,
    );
    addOptionUI(
      "s-foreign-options2",
      "#c_garrison div h2",
      "Foreign Affairs",
      buildWarSettings,
    );
    addOptionUI("s-hell-options", "#gFort div h3", "Hell", buildHellSettings);
    addOptionUI(
      "s-hell-options2",
      "#prtl_fortress div h3",
      "Hell",
      buildHellSettings,
    );
    addOptionUI("s-fleet-options", "#hfleet h3", "Fleet", buildFleetSettings);
  }

  function addOptionUI(
    optionsId,
    querySelectorText,
    modalTitle,
    buildOptionsFunction,
  ) {
    if (document.getElementById(optionsId) !== null) {
      return;
    } // We've already built the options UI

    let sectionNode = $(querySelectorText);

    if (sectionNode.length === 0) {
      return;
    } // The node that we want to add it to doesn't exist yet

    let newOptionNode = $(
      `<span id="${optionsId}" class="s-options-button has-text-success" style="margin-right:0px">+</span>`,
    );
    sectionNode.prepend(newOptionNode);
    newOptionNode.on("click", function () {
      openOptionsModal(modalTitle, buildOptionsFunction);
    });
  }

  function openOptionsModal(modalTitle, buildOptionsFunction) {
    // Build content
    let modalHeader = $("#scriptModalHeader");
    modalHeader.empty().off("*");
    modalHeader.append(`<span style="user-select: text">${modalTitle}</span>`);

    $(".script-modal-content").removeClass("custom-race-modal");
    let modalBody = $("#scriptModalBody");
    modalBody.empty().off("*").removeClass("celestialLab");
    buildOptionsFunction(modalBody, "c_");

    // Show modal
    let modal = document.getElementById("scriptModal");
    $("html").css("overflow", "hidden");
    modal.style.display = "block";
  }

  function createOptionsModal() {
    if (document.getElementById("scriptModal") !== null) {
      return;
    }

    // Append the script modal to the document
    $(document.body).append(`
          <div id="scriptModal" class="script-modal content">
            <span id="scriptModalClose" class="script-modal-close">&times;</span>
            <div class="script-modal-content">
              <div id="scriptModalHeader" class="script-modal-header has-text-warning">
                <p>You should never see this modal header...</p>
              </div>
              <div id="scriptModalBody" class="script-modal-body">
                <p>You should never see this modal body...</p>
              </div>
            </div>
          </div>`);

    // Add the script modal close button action
    $("#scriptModalClose").on("click", function () {
      $("#scriptModal").css("display", "none");
      $(".script-modal-content").removeClass(
        "override-modal custom-race-modal",
      );
      $("html").css("overflow-y", "scroll");
    });

    // If the user clicks outside the modal then close it
    $(window).on("click", function (event) {
      if (event.target.id === "scriptModal") {
        $("#scriptModal").css("display", "none");
        $(".script-modal-content").removeClass(
          "override-modal custom-race-modal",
        );
        $("html").css("overflow-y", "scroll");
      }
    });
  }

  function updatePrestigeInTopBar() {
    const parentId = "s-prestige-type";
    let parentNode = document.getElementById(parentId);

    if (settings.displayPrestigeTypeInTopBar) {
      if (parentNode === null) {
        // Check for planetWrap parent node
        const planetWrap = document.querySelector(".planetWrap");
        if (planetWrap === null) return; // Return and try again later if it doesn't exist yet

        // Create new parent node
        parentNode = document.createElement("span");
        parentNode.setAttribute("id", parentId);
        parentNode.setAttribute(
          "style",
          "border-left: 1px solid; margin-left: 0.75rem; padding-left: 0.75rem;",
        );

        // Add to planetWrap
        planetWrap.append(parentNode);

        // Add helper button to open prestige options modal
        addOptionUI(
          "s-prestige-type-helper-btn",
          `#${parentId}`,
          "Prestige",
          buildPrestigeSettings,
        );
      }
    } else {
      removePrestigeFromTopBar();
      return; // Disable and return if displayPrestigeTypeInTopBar isn't enabled
    }

    // Update if prestigeType changed
    if (parentNode.getAttribute("data-prestige") !== settings.prestigeType) {
      let infoNode = parentNode.querySelector(".info");
      if (infoNode === null) {
        // Create info node if needed
        infoNode = document.createElement("span");
        infoNode.setAttribute("class", "info");

        parentNode.append(infoNode);
      }

      let prestige = prestigeTypes.find(
        (entry) => entry.val === settings.prestigeType,
      );
      if (prestige === undefined) {
        // Somehow failed to find prestige details, mock up an object from settings
        prestige = { label: settings.prestigeType, hint: "" };
      }

      // Update node with new prestige info
      infoNode.title = prestige.hint;
      infoNode.textContent = prestige.label;
      parentNode.setAttribute("data-prestige", settings.prestigeType);
    }
  }

  function removePrestigeFromTopBar() {
    let prestigeNode = document.getElementById("s-prestige-type");
    if (prestigeNode == null) {
      return;
    } // Element has not yet been added, nothing to do

    prestigeNode.remove();
  }

  function updateTotalDaysInTopBar() {
    if (settings.displayTotalDaysTypeInTopBar) {
      addTotalDaysToTopBar();
    } else {
      removeTotalDaysFromTopBar();
    }

    const totalDaysNode = document.getElementById("s-total-days-count");
    if (totalDaysNode == null) {
      return;
    } // Element has not yet been added, cannot update

    totalDaysNode.textContent = game.global.stats.days;
  }

  function addTotalDaysToTopBar() {
    const nodeId = "s-total-days";
    if (document.getElementById(nodeId) !== null) {
      return;
    } // We've already added the info to the top bar

    const calendarNode = $("#topBar .calendar");
    if (calendarNode.length === 0) {
      return;
    } // The node that we want to add it to doesn't exist yet

    calendarNode
      .find(".day")
      .after(
        $(
          `<span id="s-total-days" class="has-text-warning" style="padding-left: 3px;">(<span id="s-total-days-count"></span>)</span>`,
        ),
      );
  }

  function removeTotalDaysFromTopBar() {
    let totalDaysNode = document.getElementById("s-total-days");
    if (totalDaysNode == null) {
      return;
    } // Element has not yet been added, nothing to do

    totalDaysNode.remove();
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

  function createMechInfo() {
    if ($(`#mechList .mechRow[draggable=true]`).length > 0) {
      return;
    }
    if (MechManager.isActive || MechManager.initLab()) {
      MechManager.mechObserver.disconnect();
      let list = getVueById("mechList");
      for (let i = 0; i < list._vnode.children.length; i++) {
        let mech = game.global.portal.mechbay.mechs[i];
        let stats = MechManager.getMechStats(mech);
        let rating = stats.power / MechManager.bestMech[mech.size].power;
        let info =
          (mech.size === "collector"
            ? `${Math.round(rating * 100)}%, ${getNiceNumber(
                stats.power * MechManager.collectorValue,
              )} /s`
            : `${Math.round(rating * 100)}%, ${getNiceNumber(
                stats.power * 100,
              )}, ${getNiceNumber(stats.efficiency * 100)}`) + " | ";

        let mechNode = list._vnode.children[i].elm;
        let firstNode = $(mechNode.childNodes[0]);
        if (firstNode.hasClass("ea-mech-info")) {
          firstNode.text(info);
        } else {
          let note = document.createElement("span");
          note.className = "ea-mech-info";
          note.innerHTML = info;
          mechNode.insertBefore(note, mechNode.firstChild);
        }
      }
      MechManager.mechObserver.observe(document.getElementById("mechList"), {
        childList: true,
      });
    }
  }

  function removeMechInfo() {
    MechManager.mechObserver.disconnect();
    $("#mechList .ea-mech-info").remove();
  }

  function createArpaToggles() {
    removeArpaToggles();

    for (let i = 0; i < ProjectManager.priorityList.length; i++) {
      let project = ProjectManager.priorityList[i];
      let projectElement = $("#arpa" + project.id + " .head");
      if (projectElement.length) {
        let settingKey = "arpa_" + project.id;
        projectElement.append(
          addToggleCallbacks(
            $(`
                  <label tabindex="0" class="switch ea-arpa-toggle" style="position:relative; max-width:75px; margin-top:-36px; left:59%; float:left;">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }>
                    <span class="check" style="height:5px;"></span>
                  </label>`),
            settingKey,
          ),
        );
      }
    }
  }

  function removeArpaToggles() {
    $("#arpaPhysics .ea-arpa-toggle").remove();
  }

  function createCraftToggles() {
    removeCraftToggles();

    for (let i = 0; i < craftablesList.length; i++) {
      let craftable = craftablesList[i];
      let craftableElement = $("#res" + craftable.id + " h3");
      if (craftableElement.length) {
        let settingKey = "craft" + craftable.id;
        craftableElement.parent().css("position", "relative");
        addToggleCallbacks(
          $(`
                  <label tabindex="0" class="switch ea-craft-toggle">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }/>
                    <span class="check" style="height:5px;"></span>
                  </label>`),
          settingKey,
        ).insertAfter(craftableElement);
      }
    }
  }

  function removeCraftToggles() {
    $("#resources .ea-craft-toggle").remove();
  }

  function createBuildingToggles() {
    removeBuildingToggles();

    // Building toggles redraw much more often than other toggles.
    // With settings off, disable them.
    if (!settings.showSettings) return;

    for (let i = 0; i < BuildingManager.priorityList.length; i++) {
      let building = BuildingManager.priorityList[i];
      let buildingElement = $("#" + building._vueBinding);
      if (buildingElement.length) {
        let settingKey = "bat" + building._vueBinding;
        buildingElement.append(
          addToggleCallbacks(
            $(`
                  <label tabindex="0" class="switch ea-building-toggle" style="position:absolute; margin-top: 24px; left:10%;">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }/>
                    <span class="check" style="height:5px; max-width:15px"></span>
                  </label>`),
            settingKey,
          ),
        );
        state.buildingToggles++;
      }
    }
  }

  function removeBuildingToggles() {
    $("#mTabCivil .ea-building-toggle").remove();
    state.buildingToggles = 0;
  }

  function createEjectToggles() {
    removeEjectToggles();

    $("#eject").append(
      '<span id="script_eject_top_row" style="margin-left: auto; margin-right: 0.2rem; float: right;" class="has-text-danger">Auto Eject</span>',
    );
    for (let resource of EjectManager.priorityList) {
      let ejectElement = $("#eject" + resource.id);
      if (ejectElement.length) {
        let settingKey = "res_eject" + resource.id;
        ejectElement.append(
          addToggleCallbacks(
            $(`
                  <label tabindex="0" title="Enable ejecting of this resource. When to eject is set in the Prestige Settings tab." class="switch ea-eject-toggle" style="margin-left:auto; margin-right:0.2rem;">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }>
                    <span class="check" style="height:5px;"></span>
                    <span class="state"></span>
                  </label>`),
            settingKey,
          ),
        );
      }
    }
  }

  function removeEjectToggles() {
    $("#resEjector .ea-eject-toggle").remove();
    $("#script_eject_top_row").remove();
  }

  function createSupplyToggles() {
    removeSupplyToggles();

    $("#spireSupply").append(
      '<span id="script_supply_top_row" style="margin-left: auto; margin-right: 0.2rem; float: right;" class="has-text-danger">Auto Supply</span>',
    );
    for (let resource of SupplyManager.priorityList) {
      let supplyElement = $("#supply" + resource.id);
      if (supplyElement.length) {
        let settingKey = "res_supply" + resource.id;
        supplyElement.append(
          addToggleCallbacks(
            $(`
                  <label tabindex="0" title="Enable supply of this resource."  class="switch ea-supply-toggle" style="margin-left:auto; margin-right:0.2rem;">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }>
                    <span class="check" style="height:5px;"></span>
                    <span class="state"></span>
                  </label>`),
            settingKey,
          ),
        );
      }
    }
  }

  function removeSupplyToggles() {
    $("#resCargo .ea-supply-toggle").remove();
    $("#script_supply_top_row").remove();
  }

  function createMarketToggles() {
    removeMarketToggles();

    if (!game.global.race["no_trade"]) {
      $("#market .market-item[id] .res").width("5rem");
      $("#market .market-item[id] .buy span").text("B");
      $("#market .market-item[id] .sell span").text("S");
      $("#market .market-item[id] .trade > :first-child").text("R");
      $("#market .market-item[id] .trade .zero").text("×");
    }

    $("#market-qty").after(`
          <div class="market-item vb" id="script_market_top_row" style="overflow:hidden">
            <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
              ${
                !game.global.race["no_trade"]
                  ? `
              <span class="has-text-success" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Buy</span>
              <span class="has-text-danger" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Sell</span>`
                  : ""
              }
              <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">In</span>
              <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Away</span>
            </span>
          </div>`);

    for (let resource of MarketManager.priorityList) {
      if (
        resource === resources.Food &&
        (game.global.race["artifical"] || game.global.race["fasting"])
      ) {
        continue;
      }
      let marketElement = $("#market-" + resource.id);
      if (marketElement.length > 0) {
        let marketRow = $(
          '<span class="ea-market-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>',
        );

        if (!game.global.race["no_trade"]) {
          let buyKey = "buy" + resource.id;
          let sellKey = "sell" + resource.id;
          marketRow.append(
            addToggleCallbacks(
              $(
                `<label tabindex="0" title="Enable buying of this resource." class="switch"><input class="script_${buyKey}" type="checkbox"${
                  settingsRaw[buyKey] ? " checked" : ""
                }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
              ),
              buyKey,
            ),
            addToggleCallbacks(
              $(
                `<label tabindex="0" title="Enable selling of this resource." class="switch"><input class="script_${sellKey}" type="checkbox"${
                  settingsRaw[sellKey] ? " checked" : ""
                }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
              ),
              sellKey,
            ),
          );
        }

        let tradeBuyKey = "res_trade_buy_" + resource.id;
        let tradeSellKey = "res_trade_sell_" + resource.id;
        marketRow.append(
          addToggleCallbacks(
            $(
              `<label tabindex="0" title="Enable trading for this resource." class="switch"><input class="script_${tradeBuyKey}" type="checkbox"${
                settingsRaw[tradeBuyKey] ? " checked" : ""
              }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
            ),
            tradeBuyKey,
          ),
          addToggleCallbacks(
            $(
              `<label tabindex="0" title="Enable trading this resource away." class="switch"><input class="script_${tradeSellKey}" type="checkbox"${
                settingsRaw[tradeSellKey] ? " checked" : ""
              }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
            ),
            tradeSellKey,
          ),
        );

        marketRow.appendTo(marketElement);
      }
    }
  }

  function removeMarketToggles() {
    $("#market .ea-market-toggle").remove();
    $("#script_market_top_row").remove();

    if (!game.global.race["no_trade"]) {
      $("#market .market-item[id] .res").width("7.5rem");
      $("#market .market-item[id] .buy span").text(
        game.loc("resource_market_buy"),
      );
      $("#market .market-item[id] .sell span").text(
        game.loc("resource_market_sell"),
      );
      $("#market .market-item[id] .trade > :first-child").text(
        game.loc("resource_market_routes"),
      );
      $("#market .market-item[id] .trade .zero").text(
        game.loc("cancel_routes"),
      );
    }
  }

  function createStorageToggles() {
    removeStorageToggles();

    $("#createHead").after(`
          <div class="market-item vb" id="script_storage_top_row" style="overflow:hidden">
            <span style="margin-left: auto; margin-right: 0.2rem; float:right;">
              <span class="has-text-warning" style="width: 2.75rem; margin-right: 0.3em; display: inline-block; text-align: center;">Auto</span>
              <span class="has-text-warning" style="width: 2.75rem; display: inline-block; text-align: center;">Over</span>
            </span>
          </div>`);

    for (let resource of StorageManager.priorityList) {
      let storageElement = $("#stack-" + resource.id);
      if (storageElement.length > 0) {
        let storeKey = "res_storage" + resource.id;
        let overKey = "res_storage_o_" + resource.id;
        $(
          `<span class="ea-storage-toggle" style="margin-left: auto; margin-right: 0.2rem; float:right;"></span>`,
        )
          .append(
            addToggleCallbacks(
              $(
                `<label tabindex="0" title="Enable storing of this resource." class="switch"><input class="script_${storeKey}" type="checkbox"${
                  settingsRaw[storeKey] ? " checked" : ""
                }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
              ),
              storeKey,
            ),
            addToggleCallbacks(
              $(
                `<label tabindex="0" title="Enable storing overflow of this resource." class="switch"><input class="script_${overKey}" type="checkbox"${
                  settingsRaw[overKey] ? " checked" : ""
                }><span class="check" style="height:5px;"></span><span class="state"></span></label>`,
              ),
              overKey,
            ),
          )
          .appendTo(storageElement);
      }
    }
  }

  function removeStorageToggles() {
    $("#resStorage .ea-storage-toggle").remove();
    $("#script_storage_top_row").remove();
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

  var poly = {
    // Taken directly from game code with no functional changes, and minified.
    // export function astrologySign() from seasons.js
    astrologySign: function () {
      let t = new Date();
      if (
        (0 === t.getMonth() && t.getDate() >= 20) ||
        (1 === t.getMonth() && 18 >= t.getDate())
      )
        return "aquarius";
      if (
        (1 === t.getMonth() && t.getDate() >= 19) ||
        (2 === t.getMonth() && 20 >= t.getDate())
      )
        return "pisces";
      if (
        (2 === t.getMonth() && t.getDate() >= 21) ||
        (3 === t.getMonth() && 19 >= t.getDate())
      )
        return "aries";
      if (
        (3 === t.getMonth() && t.getDate() >= 20) ||
        (4 === t.getMonth() && 20 >= t.getDate())
      )
        return "taurus";
      if (
        (4 === t.getMonth() && t.getDate() >= 21) ||
        (5 === t.getMonth() && 21 >= t.getDate())
      )
        return "gemini";
      else if (
        (5 === t.getMonth() && t.getDate() >= 22) ||
        (6 === t.getMonth() && 22 >= t.getDate())
      )
        return "cancer";
      else if (
        (6 === t.getMonth() && t.getDate() >= 23) ||
        (7 === t.getMonth() && 22 >= t.getDate())
      )
        return "leo";
      else if (
        (7 === t.getMonth() && t.getDate() >= 23) ||
        (8 === t.getMonth() && 22 >= t.getDate())
      )
        return "virgo";
      else if (
        (8 === t.getMonth() && t.getDate() >= 23) ||
        (9 === t.getMonth() && 22 >= t.getDate())
      )
        return "libra";
      else if (
        (9 === t.getMonth() && t.getDate() >= 23) ||
        (10 === t.getMonth() && 22 >= t.getDate())
      )
        return "scorpio";
      else if (
        (10 === t.getMonth() && t.getDate() >= 23) ||
        (11 === t.getMonth() && 21 >= t.getDate())
      )
        return "sagittarius";
      else if (
        (11 === t.getMonth() && t.getDate() >= 22) ||
        (0 === t.getMonth() && 19 >= t.getDate())
      )
        return "capricorn";
      else return "time itself is broken";
    },
    // export function arpaAdjustCosts(costs) from arpa.js
    arpaAdjustCosts: function (t) {
      return (
        (t = (function (t) {
          var r = traitVal("creative", 1, "-");
          if (r < 1) {
            var a = {};
            return (
              Object.keys(t).forEach(function (e) {
                a[e] = function () {
                  return t[e]() * r;
                };
              }),
              a
            );
          }
          return t;
        })(t)),
        poly.adjustCosts({ cost: t })
      );
    },
    // function govPrice(gov) from civics.js
    govPrice: function (e) {
      let o = game.global.civic.foreign[`gov${e}`],
        i = 15384 * o.eco;
      return (
        (i *= 1 + (1.6 * o.hstl) / 100),
        +(i *= 1 - (0.25 * o.unrest) / 100).toFixed(0)
      );
    },
    // export const galaxyOffers from resources.js
    galaxyOffers: normalizeProperties([
      { buy: { res: "Deuterium", vol: 5 }, sell: { res: "Helium_3", vol: 25 } },
      {
        buy: { res: "Neutronium", vol: 2.5 },
        sell: { res: "Copper", vol: 200 },
      },
      { buy: { res: "Adamantite", vol: 3 }, sell: { res: "Iron", vol: 300 } },
      { buy: { res: "Elerium", vol: 1 }, sell: { res: "Oil", vol: 125 } },
      {
        buy: { res: "Nano_Tube", vol: 10 },
        sell: { res: "Titanium", vol: 20 },
      },
      {
        buy: { res: "Graphene", vol: 25 },
        sell: {
          res: () =>
            game.global.race.kindling_kindred || game.global.race.smoldering
              ? game.global.race.smoldering
                ? "Chrysotile"
                : "Stone"
              : "Lumber",
          vol: 1e3,
        },
      },
      {
        buy: { res: "Stanene", vol: 40 },
        sell: { res: "Aluminium", vol: 800 },
      },
      {
        buy: { res: "Bolognium", vol: 0.75 },
        sell: { res: "Uranium", vol: 4 },
      },
      { buy: { res: "Vitreloy", vol: 1 }, sell: { res: "Infernite", vol: 1 } },
    ]),
    // export const supplyValue from resources.js
    supplyValue: {
      Lumber: { in: 0.5, out: 25e3 },
      Chrysotile: { in: 0.5, out: 25e3 },
      Stone: { in: 0.5, out: 25e3 },
      Crystal: { in: 3, out: 25e3 },
      Furs: { in: 3, out: 25e3 },
      Copper: { in: 1.5, out: 25e3 },
      Iron: { in: 1.5, out: 25e3 },
      Aluminium: { in: 2.5, out: 25e3 },
      Cement: { in: 3, out: 25e3 },
      Coal: { in: 1.5, out: 25e3 },
      Oil: { in: 2.5, out: 12e3 },
      Uranium: { in: 5, out: 300 },
      Steel: { in: 3, out: 25e3 },
      Titanium: { in: 3, out: 25e3 },
      Alloy: { in: 6, out: 25e3 },
      Polymer: { in: 6, out: 25e3 },
      Iridium: { in: 8, out: 25e3 },
      Helium_3: { in: 4.5, out: 12e3 },
      Deuterium: { in: 4, out: 1e3 },
      Neutronium: { in: 15, out: 1e3 },
      Adamantite: { in: 12.5, out: 1e3 },
      Infernite: { in: 25, out: 250 },
      Elerium: { in: 30, out: 250 },
      Nano_Tube: { in: 6.5, out: 1e3 },
      Graphene: { in: 5, out: 1e3 },
      Stanene: { in: 4.5, out: 1e3 },
      Bolognium: { in: 18, out: 1e3 },
      Vitreloy: { in: 14, out: 1e3 },
      Orichalcum: { in: 10, out: 1e3 },
      Plywood: { in: 10, out: 250 },
      Brick: { in: 10, out: 250 },
      Wrought_Iron: { in: 10, out: 250 },
      Sheet_Metal: { in: 10, out: 250 },
      Mythril: { in: 12.5, out: 250 },
      Aerogel: { in: 16.5, out: 250 },
      Nanoweave: { in: 18, out: 250 },
      Scarletite: { in: 35, out: 250 },
    },
    // export const monsters from portal.js
    monsters: {
      fire_elm: {
        weapon: {
          laser: 1.05,
          flame: 0,
          plasma: 0.25,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 1,
          shotgun: 0.75,
          tesla: 0.65,
          claws: 0.5,
          venom: 0.62,
          cold: 1.25,
          shock: 0.68,
          fire: 0,
          acid: 0.25,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.3,
          ice: 1.12,
          magma: 0,
          axe: 0.5,
          hammer: 0.5,
        },
        nozone: { freeze: !0, flooded: !0 },
        amp: { hot: 1.75, humid: 0.8, steam: 0.9 },
      },
      water_elm: {
        weapon: {
          laser: 0.65,
          flame: 0.5,
          plasma: 1,
          kinetic: 0.2,
          missile: 0.5,
          sonic: 0.5,
          shotgun: 0.25,
          tesla: 0.75,
          claws: 0.4,
          venom: 0.8,
          cold: 1.1,
          shock: 0.68,
          fire: 0.8,
          acid: 0.25,
          stone: 0.4,
          iron: 0.3,
          flesh: 0.5,
          ice: 1.1,
          magma: 0.75,
          axe: 0.45,
          hammer: 0.45,
        },
        nozone: { hot: !0, freeze: !0 },
        amp: { steam: 1.5, river: 1.1, flooded: 2, rain: 1.75, humid: 1.25 },
      },
      rock_golem: {
        weapon: {
          laser: 1,
          flame: 0.5,
          plasma: 1,
          kinetic: 0.65,
          missile: 0.95,
          sonic: 0.75,
          shotgun: 0.35,
          tesla: 0,
          claws: 0.7,
          venom: 0.25,
          cold: 0.35,
          shock: 0,
          fire: 0.9,
          acid: 1,
          stone: 0.5,
          iron: 0.65,
          flesh: 0.3,
          ice: 0.3,
          magma: 0.9,
          axe: 0.2,
          hammer: 1,
        },
        nozone: {},
        amp: {},
      },
      bone_golem: {
        weapon: {
          laser: 0.45,
          flame: 0.35,
          plasma: 0.55,
          kinetic: 1,
          missile: 1,
          sonic: 0.75,
          shotgun: 0.75,
          tesla: 0.15,
          claws: 0.75,
          venom: 0,
          cold: 0.2,
          shock: 0.15,
          fire: 0.4,
          acid: 0.85,
          stone: 0.9,
          iron: 1,
          flesh: 0.15,
          ice: 0.3,
          magma: 0.9,
          axe: 0.65,
          hammer: 1.2,
        },
        nozone: {},
        amp: {},
      },
      mech_dino: {
        weapon: {
          laser: 0.85,
          flame: 0.05,
          plasma: 0.55,
          kinetic: 0.45,
          missile: 0.5,
          sonic: 0.35,
          shotgun: 0.5,
          tesla: 1,
          claws: 0.38,
          venom: 0.1,
          cold: 0.5,
          shock: 1.1,
          fire: 0.5,
          acid: 0.75,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.15,
          ice: 0.3,
          magma: 0.9,
          axe: 0.6,
          hammer: 0.4,
        },
        nozone: {},
        amp: {},
      },
      plant: {
        weapon: {
          laser: 0.42,
          flame: 1,
          plasma: 0.65,
          kinetic: 0.2,
          missile: 0.25,
          sonic: 0.75,
          shotgun: 0.35,
          tesla: 0.38,
          claws: 0.25,
          venom: 0.25,
          cold: 0.65,
          shock: 0.28,
          fire: 1,
          acid: 0.45,
          stone: 0.6,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.55,
          magma: 1,
          axe: 0.25,
          hammer: 0.15,
        },
        nozone: {},
        amp: {},
      },
      crazed: {
        weapon: {
          laser: 0.5,
          flame: 0.85,
          plasma: 0.65,
          kinetic: 1,
          missile: 0.35,
          sonic: 0.15,
          shotgun: 0.95,
          tesla: 0.6,
          claws: 1,
          venom: 0.5,
          cold: 0.5,
          shock: 0.75,
          fire: 0.5,
          acid: 0.5,
          stone: 0.7,
          iron: 0.8,
          flesh: 0.9,
          ice: 0.4,
          magma: 0.5,
          axe: 1,
          hammer: 0.75,
        },
        nozone: {},
        amp: {},
      },
      minotaur: {
        weapon: {
          laser: 0.32,
          flame: 0.5,
          plasma: 0.82,
          kinetic: 0.44,
          missile: 1,
          sonic: 0.15,
          shotgun: 0.2,
          tesla: 0.35,
          claws: 0.6,
          venom: 1.1,
          cold: 0.5,
          shock: 0.3,
          fire: 0.5,
          acid: 1,
          stone: 0.6,
          iron: 0.9,
          flesh: 0.3,
          ice: 0.4,
          magma: 0.55,
          axe: 0.75,
          hammer: 0.6,
        },
        nozone: {},
        amp: {},
      },
      ooze: {
        weapon: {
          laser: 0.2,
          flame: 0.65,
          plasma: 1,
          kinetic: 0,
          missile: 0,
          sonic: 0.85,
          shotgun: 0,
          tesla: 0.15,
          claws: 0,
          venom: 0.15,
          cold: 1.5,
          shock: 0.2,
          fire: 0.6,
          acid: 0.5,
          stone: 0,
          iron: 0,
          flesh: 0,
          ice: 1.25,
          magma: 0.7,
          axe: 0,
          hammer: 0,
        },
        nozone: {},
        amp: {},
      },
      zombie: {
        weapon: {
          laser: 0.35,
          flame: 1,
          plasma: 0.45,
          kinetic: 0.08,
          missile: 0.8,
          sonic: 0.18,
          shotgun: 0.95,
          tesla: 0.05,
          claws: 0.85,
          venom: 0,
          cold: 0.2,
          shock: 0.35,
          fire: 0.95,
          acid: 0.5,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.35,
          ice: 0.25,
          magma: 0.9,
          axe: 1,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      raptor: {
        weapon: {
          laser: 0.68,
          flame: 0.55,
          plasma: 0.85,
          kinetic: 1,
          missile: 0.44,
          sonic: 0.22,
          shotgun: 0.33,
          tesla: 0.66,
          claws: 0.85,
          venom: 0.5,
          cold: 0.5,
          shock: 0.88,
          fire: 0.6,
          acid: 0.6,
          stone: 1,
          iron: 0.85,
          flesh: 0.45,
          ice: 0.5,
          magma: 0.65,
          axe: 0.9,
          hammer: 0.6,
        },
        nozone: {},
        amp: {},
      },
      frost_giant: {
        weapon: {
          laser: 0.9,
          flame: 0.82,
          plasma: 1,
          kinetic: 0.25,
          missile: 0.08,
          sonic: 0.45,
          shotgun: 0.28,
          tesla: 0.5,
          claws: 0.35,
          venom: 0.15,
          cold: 0,
          shock: 0.6,
          fire: 1.2,
          acid: 0.5,
          stone: 0.35,
          iron: 1,
          flesh: 0.3,
          ice: 0,
          magma: 1.1,
          axe: 0.5,
          hammer: 1,
        },
        nozone: { hot: !0 },
        amp: { freeze: 2.5, hail: 1.65 },
      },
      swarm: {
        weapon: {
          laser: 0.02,
          flame: 1,
          plasma: 0.04,
          kinetic: 0.01,
          missile: 0.08,
          sonic: 0.66,
          shotgun: 0.38,
          tesla: 0.45,
          claws: 0.05,
          venom: 0.01,
          cold: 0.8,
          shock: 0.75,
          fire: 0.8,
          acid: 0.75,
          stone: 0.03,
          iron: 0.03,
          flesh: 0.03,
          ice: 0.3,
          magma: 0.5,
          axe: 0.01,
          hammer: 0.05,
        },
        nozone: {},
        amp: {},
      },
      dragon: {
        weapon: {
          laser: 0.18,
          flame: 0,
          plasma: 0.12,
          kinetic: 0.35,
          missile: 1,
          sonic: 0.22,
          shotgun: 0.65,
          tesla: 0.15,
          claws: 0.38,
          venom: 0.88,
          cold: 0.8,
          shock: 0.35,
          fire: 0,
          acid: 0.85,
          stone: 0.03,
          iron: 0.03,
          flesh: 0.03,
          ice: 0.3,
          magma: 0,
          axe: 0.4,
          hammer: 0.55,
        },
        nozone: {},
        amp: {},
      },
      mech_dragon: {
        weapon: {
          laser: 0.84,
          flame: 0.1,
          plasma: 0.68,
          kinetic: 0.18,
          missile: 0.75,
          sonic: 0.22,
          shotgun: 0.28,
          tesla: 1,
          claws: 0.28,
          venom: 0,
          cold: 0.35,
          shock: 1,
          fire: 0.15,
          acid: 0.72,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.2,
          magma: 0.15,
          axe: 0.25,
          hammer: 0.8,
        },
        nozone: {},
        amp: {},
      },
      construct: {
        weapon: {
          laser: 0.5,
          flame: 0.2,
          plasma: 0.6,
          kinetic: 0.34,
          missile: 0.9,
          sonic: 0.08,
          shotgun: 0.28,
          tesla: 1,
          claws: 0.28,
          venom: 0,
          cold: 0.45,
          shock: 1.1,
          fire: 0.22,
          acid: 0.68,
          stone: 0.55,
          iron: 0.55,
          flesh: 0.4,
          ice: 0.4,
          magma: 0.18,
          axe: 0.42,
          hammer: 0.95,
        },
        nozone: {},
        amp: {},
      },
      beholder: {
        weapon: {
          laser: 0.75,
          flame: 0.15,
          plasma: 1,
          kinetic: 0.45,
          missile: 0.05,
          sonic: 0.01,
          shotgun: 0.12,
          tesla: 0.3,
          claws: 0.48,
          venom: 0.9,
          cold: 0.88,
          shock: 0.24,
          fire: 0.18,
          acid: 0.9,
          stone: 0.72,
          iron: 0.45,
          flesh: 0.85,
          ice: 0.92,
          magma: 0.16,
          axe: 0.44,
          hammer: 0.08,
        },
        nozone: {},
        amp: {},
      },
      worm: {
        weapon: {
          laser: 0.55,
          flame: 0.38,
          plasma: 0.45,
          kinetic: 0.2,
          missile: 0.05,
          sonic: 1,
          shotgun: 0.02,
          tesla: 0.01,
          claws: 0.18,
          venom: 0.65,
          cold: 1,
          shock: 0.02,
          fire: 0.38,
          acid: 0.48,
          stone: 0.22,
          iron: 0.24,
          flesh: 0.35,
          ice: 1,
          magma: 0.4,
          axe: 0.15,
          hammer: 0.05,
        },
        nozone: {},
        amp: {},
      },
      hydra: {
        weapon: {
          laser: 0.85,
          flame: 0.75,
          plasma: 0.85,
          kinetic: 0.25,
          missile: 0.45,
          sonic: 0.5,
          shotgun: 0.6,
          tesla: 0.65,
          claws: 0.3,
          venom: 0.65,
          cold: 0.55,
          shock: 0.65,
          fire: 0.75,
          acid: 0.85,
          stone: 0.25,
          iron: 0.15,
          flesh: 0.2,
          ice: 0.55,
          magma: 0.75,
          axe: 0.45,
          hammer: 0.65,
        },
        nozone: {},
        amp: {},
      },
      colossus: {
        weapon: {
          laser: 1,
          flame: 0.05,
          plasma: 0.75,
          kinetic: 0.45,
          missile: 1,
          sonic: 0.35,
          shotgun: 0.35,
          tesla: 0.5,
          claws: 0.48,
          venom: 0.22,
          cold: 0.25,
          shock: 0.65,
          fire: 0.15,
          acid: 0.95,
          stone: 0.55,
          iron: 0.95,
          flesh: 0.25,
          ice: 0.35,
          magma: 0.2,
          axe: 0.55,
          hammer: 0.35,
        },
        nozone: {},
        amp: {},
      },
      lich: {
        weapon: {
          laser: 0.1,
          flame: 0.1,
          plasma: 0.1,
          kinetic: 0.45,
          missile: 0.75,
          sonic: 0.35,
          shotgun: 0.75,
          tesla: 0.5,
          claws: 0.4,
          venom: 0.01,
          cold: 0.1,
          shock: 0.5,
          fire: 0.1,
          acid: 0.1,
          stone: 0.35,
          iron: 0.25,
          flesh: 0.95,
          ice: 0.1,
          magma: 0.1,
          axe: 0.4,
          hammer: 1,
        },
        nozone: {},
        amp: {},
      },
      ape: {
        weapon: {
          laser: 1,
          flame: 0.95,
          plasma: 0.85,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 0.05,
          shotgun: 0.35,
          tesla: 0.68,
          claws: 0.65,
          venom: 0.95,
          cold: 0.5,
          shock: 0.5,
          fire: 0.75,
          acid: 0.65,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.5,
          magma: 0.75,
          axe: 0.65,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      bandit: {
        weapon: {
          laser: 0.65,
          flame: 0.5,
          plasma: 0.85,
          kinetic: 1,
          missile: 0.5,
          sonic: 0.25,
          shotgun: 0.75,
          tesla: 0.25,
          claws: 1,
          venom: 0.15,
          cold: 0.5,
          shock: 0.25,
          fire: 0.5,
          acid: 0.5,
          stone: 0.5,
          iron: 0.8,
          flesh: 0.5,
          ice: 0.5,
          magma: 0.5,
          axe: 1,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      croc: {
        weapon: {
          laser: 0.65,
          flame: 0.05,
          plasma: 0.6,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 1,
          shotgun: 0.2,
          tesla: 0.75,
          claws: 1,
          venom: 0.5,
          cold: 1,
          shock: 0.75,
          fire: 0.05,
          acid: 0.08,
          stone: 0.6,
          iron: 0.5,
          flesh: 0.25,
          ice: 0.95,
          magma: 0.05,
          axe: 0.75,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      djinni: {
        weapon: {
          laser: 0,
          flame: 0.35,
          plasma: 1,
          kinetic: 0.15,
          missile: 0,
          sonic: 0.65,
          shotgun: 0.22,
          tesla: 0.4,
          claws: 0.18,
          venom: 0.12,
          cold: 0.9,
          shock: 0.45,
          fire: 0.3,
          acid: 0.1,
          stone: 0.2,
          iron: 0.95,
          flesh: 0.2,
          ice: 0.9,
          magma: 0.3,
          axe: 0.12,
          hammer: 0,
        },
        nozone: {},
        amp: {},
      },
      snake: {
        weapon: {
          laser: 0.5,
          flame: 0.5,
          plasma: 0.5,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 0.5,
          shotgun: 0.5,
          tesla: 0.5,
          claws: 0.5,
          venom: 0.02,
          cold: 0.75,
          shock: 0.5,
          fire: 0.5,
          acid: 0.5,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.75,
          magma: 0.5,
          axe: 0.5,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      centipede: {
        weapon: {
          laser: 0.5,
          flame: 0.85,
          plasma: 0.95,
          kinetic: 0.65,
          missile: 0.6,
          sonic: 0,
          shotgun: 0.5,
          tesla: 0.01,
          claws: 0.65,
          venom: 0.01,
          cold: 0,
          shock: 0.01,
          fire: 0.88,
          acid: 0.95,
          stone: 0.6,
          iron: 0.45,
          flesh: 0.55,
          ice: 0,
          magma: 0.88,
          axe: 0.7,
          hammer: 0.4,
        },
        nozone: {},
        amp: {},
      },
      spider: {
        weapon: {
          laser: 0.65,
          flame: 1,
          plasma: 0.22,
          kinetic: 0.75,
          missile: 0.15,
          sonic: 0.38,
          shotgun: 0.9,
          tesla: 0.18,
          claws: 0.12,
          venom: 0.05,
          cold: 0.5,
          shock: 0.32,
          fire: 1,
          acid: 0.65,
          stone: 0.8,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.5,
          magma: 1,
          axe: 0.18,
          hammer: 0.75,
        },
        nozone: {},
        amp: {},
      },
      manticore: {
        weapon: {
          laser: 0.05,
          flame: 0.25,
          plasma: 0.95,
          kinetic: 0.5,
          missile: 0.15,
          sonic: 0.48,
          shotgun: 0.4,
          tesla: 0.6,
          claws: 0.5,
          venom: 0.5,
          cold: 0.8,
          shock: 0.75,
          fire: 0.15,
          acid: 0.95,
          stone: 0.25,
          iron: 0.5,
          flesh: 0.8,
          ice: 0.8,
          magma: 0.15,
          axe: 0.5,
          hammer: 0.25,
        },
        nozone: {},
        amp: {},
      },
      fiend: {
        weapon: {
          laser: 0.75,
          flame: 0.25,
          plasma: 0.5,
          kinetic: 0.25,
          missile: 0.75,
          sonic: 0.25,
          shotgun: 0.5,
          tesla: 0.5,
          claws: 0.65,
          venom: 0.1,
          cold: 0.65,
          shock: 0.5,
          fire: 0.2,
          acid: 0.5,
          stone: 0.25,
          iron: 0.75,
          flesh: 1,
          ice: 0.65,
          magma: 0.2,
          axe: 0.75,
          hammer: 0.25,
        },
        nozone: {},
        amp: {},
      },
      bat: {
        weapon: {
          laser: 0.16,
          flame: 0.18,
          plasma: 0.12,
          kinetic: 0.25,
          missile: 0.02,
          sonic: 1,
          shotgun: 0.9,
          tesla: 0.58,
          claws: 0.1,
          venom: 0.1,
          cold: 0.8,
          shock: 0.65,
          fire: 0.15,
          acid: 0.5,
          stone: 0.1,
          iron: 0.1,
          flesh: 0.5,
          ice: 0.8,
          magma: 0.2,
          axe: 0.1,
          hammer: 0.1,
        },
        nozone: {},
        amp: {},
      },
      medusa: {
        weapon: {
          laser: 0.35,
          flame: 0.1,
          plasma: 0.3,
          kinetic: 0.95,
          missile: 1,
          sonic: 0.15,
          shotgun: 0.88,
          tesla: 0.26,
          claws: 0.42,
          venom: 0.3,
          cold: 0.48,
          shock: 0.28,
          fire: 0.1,
          acid: 0.85,
          stone: 1,
          iron: 0.25,
          flesh: 0.75,
          ice: 0.52,
          magma: 0.12,
          axe: 0.34,
          hammer: 1,
        },
        nozone: {},
        amp: {},
      },
      ettin: {
        weapon: {
          laser: 0.5,
          flame: 0.35,
          plasma: 0.8,
          kinetic: 0.5,
          missile: 0.25,
          sonic: 0.3,
          shotgun: 0.6,
          tesla: 0.09,
          claws: 0.5,
          venom: 0.95,
          cold: 0.3,
          shock: 0.8,
          fire: 0.38,
          acid: 0.9,
          stone: 0.6,
          iron: 0.75,
          flesh: 0.4,
          ice: 0.28,
          magma: 0.32,
          axe: 0.45,
          hammer: 0.25,
        },
        nozone: {},
        amp: {},
      },
      faceless: {
        weapon: {
          laser: 0.6,
          flame: 0.28,
          plasma: 0.6,
          kinetic: 0,
          missile: 0.05,
          sonic: 0.8,
          shotgun: 0.15,
          tesla: 1,
          claws: 0.02,
          venom: 0.01,
          cold: 0,
          shock: 1,
          fire: 0.25,
          acid: 0.55,
          stone: 0.15,
          iron: 0.15,
          flesh: 0.95,
          ice: 0,
          magma: 0.25,
          axe: 0.01,
          hammer: 0.05,
        },
        nozone: {},
        amp: {},
      },
      enchanted: {
        weapon: {
          laser: 1,
          flame: 0.02,
          plasma: 0.95,
          kinetic: 0.2,
          missile: 0.7,
          sonic: 0.05,
          shotgun: 0.65,
          tesla: 0.01,
          claws: 0.1,
          venom: 0,
          cold: 0.5,
          shock: 0.01,
          fire: 0.02,
          acid: 1,
          stone: 0.25,
          iron: 0.75,
          flesh: 0.1,
          ice: 0.5,
          magma: 0.03,
          axe: 0.1,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      gargoyle: {
        weapon: {
          laser: 0.15,
          flame: 0.4,
          plasma: 0.3,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 0.85,
          shotgun: 1,
          tesla: 0.2,
          claws: 0.45,
          venom: 0.05,
          cold: 0.15,
          shock: 0.08,
          fire: 0.38,
          acid: 0.85,
          stone: 1,
          iron: 0.85,
          flesh: 0.25,
          ice: 0.15,
          magma: 0.35,
          axe: 0.42,
          hammer: 1,
        },
        nozone: {},
        amp: {},
      },
      chimera: {
        weapon: {
          laser: 0.38,
          flame: 0.6,
          plasma: 0.42,
          kinetic: 0.85,
          missile: 0.35,
          sonic: 0.5,
          shotgun: 0.65,
          tesla: 0.8,
          claws: 0.92,
          venom: 0.5,
          cold: 0.45,
          shock: 0.8,
          fire: 0.56,
          acid: 0.4,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.48,
          magma: 0.54,
          axe: 0.88,
          hammer: 0.42,
        },
        nozone: {},
        amp: {},
      },
      gorgon: {
        weapon: {
          laser: 0.65,
          flame: 0.65,
          plasma: 0.64,
          kinetic: 0.65,
          missile: 0.66,
          sonic: 0.65,
          shotgun: 0.65,
          tesla: 0.65,
          claws: 0.65,
          venom: 0.65,
          cold: 0.65,
          shock: 0.65,
          fire: 0.65,
          acid: 0.65,
          stone: 0.65,
          iron: 0.65,
          flesh: 0.65,
          ice: 0.65,
          magma: 0.65,
          axe: 0.65,
          hammer: 0.65,
        },
        nozone: {},
        amp: {},
      },
      kraken: {
        weapon: {
          laser: 0.75,
          flame: 0.35,
          plasma: 0.75,
          kinetic: 0.35,
          missile: 0.5,
          sonic: 0.18,
          shotgun: 0.05,
          tesla: 0.85,
          claws: 0.32,
          venom: 0.8,
          cold: 0.66,
          shock: 0.82,
          fire: 0.33,
          acid: 0.75,
          stone: 0.45,
          iron: 0.35,
          flesh: 0.4,
          ice: 0.66,
          magma: 0.33,
          axe: 0.36,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      homunculus: {
        weapon: {
          laser: 0.05,
          flame: 1,
          plasma: 0.1,
          kinetic: 0.85,
          missile: 0.65,
          sonic: 0.5,
          shotgun: 0.75,
          tesla: 0.2,
          claws: 0.85,
          venom: 0.4,
          cold: 0.12,
          shock: 0.22,
          fire: 1,
          acid: 0.13,
          stone: 0.65,
          iron: 0.68,
          flesh: 0.95,
          ice: 0.18,
          magma: 0.9,
          axe: 0.85,
          hammer: 0.65,
        },
        nozone: {},
        amp: {},
      },
      giant_chicken: {
        weapon: {
          laser: 0.95,
          flame: 0.95,
          plasma: 0.95,
          kinetic: 0.95,
          missile: 0.95,
          sonic: 0.95,
          shotgun: 0.95,
          tesla: 0.95,
          claws: 0.95,
          venom: 0.96,
          cold: 0.95,
          shock: 0.95,
          fire: 0.95,
          acid: 0.95,
          stone: 0.95,
          iron: 0.95,
          flesh: 0.94,
          ice: 0.95,
          magma: 0.95,
          axe: 0.95,
          hammer: 0.95,
        },
        nozone: {},
        amp: {},
      },
      skeleton_pack: {
        weapon: {
          laser: 0.5,
          flame: 0.1,
          plasma: 0.5,
          kinetic: 1,
          missile: 1.2,
          sonic: 0.5,
          shotgun: 1.05,
          tesla: 0.2,
          claws: 0.65,
          venom: 0,
          cold: 0.11,
          shock: 0.22,
          fire: 0.1,
          acid: 0.5,
          stone: 1,
          iron: 0.65,
          flesh: 0.25,
          ice: 0.1,
          magma: 0.12,
          axe: 0.15,
          hammer: 1.08,
        },
        nozone: {},
        amp: {},
      },
    },
    // export function hellSupression(area, val) from portal.js
    hellSupression: function (t, e) {
      switch (t) {
        case "ruins": {
          let t = e || buildings.RuinsGuardPost.stateOnCount,
            r = 75 * buildings.RuinsArcology.stateOnCount,
            a = game.armyRating(t * traitVal("high_pop", 0, 1), "hellArmy", 0);
          a *= traitVal("holy", 1, "+");
          let l = (a + r) / 5e3;
          return { supress: l > 1 ? 1 : l, rating: a + r };
        }
        case "gate": {
          let t = poly.hellSupression("ruins", e),
            r = 100 * buildings.GateTurret.stateOnCount;
          r *= traitVal("holy", 1, "+");
          let a = (t.rating + r) / 7500;
          return { supress: a > 1 ? 1 : a, rating: t.rating + r };
        }
        default:
          return 0;
      }
    },
    // function taxCap(min) from civics.js
    taxCap: function (e) {
      let a =
        (haveTech("currency", 5) || game.global.race.terrifying) &&
        !game.global.race.noble;
      if (e) return a ? 0 : traitVal("noble", 0, 10);
      {
        let e = traitVal("noble", 1, 30);
        return (
          a && (e += 20),
          "oligarchy" === game.global.civic.govern.type &&
            (e += "bureaucrat" === getGovernor() ? 25 : 20),
          "noble" === getGovernor() && (e += 20),
          game.global.race["wish"] &&
            game.global.race["wishStats"] &&
            (e += game.global.race.wishStats.tax),
          e
        );
      }
    },
    // export function mechCost(size,infernal) from portal.js
    mechCost: function (e, a, x) {
      let l = 9999,
        r = 1e7;
      switch (e) {
        case "small":
          {
            let e = (x ?? game.global.blood.prepared) >= 2 ? 5e4 : 75e3;
            ((r = a ? 2.5 * e : e), (l = a ? 20 : 1));
          }
          break;
        case "medium":
          ((r = a ? 45e4 : 18e4), (l = a ? 100 : 4));
          break;
        case "large":
          ((r = a ? 925e3 : 375e3), (l = a ? 500 : 20));
          break;
        case "titan":
          ((r = a ? 15e5 : 75e4), (l = a ? 1500 : 75));
          break;
        case "collector": {
          let e = (x ?? game.global.blood.prepared) >= 2 ? 8e3 : 1e4;
          ((r = a ? 2.5 * e : e), (l = 1));
        }
      }
      return { s: l, c: r };
    },
    // function terrainRating(mech,rating,effects) from portal.js
    terrainRating: function (e, i, s, x) {
      return (
        !e.equip.includes("special") ||
          ("small" !== e.size &&
            "medium" !== e.size &&
            "collector" !== e.size) ||
          (i < 1 && (i += (1 - i) * (s.includes("gravity") ? 0.1 : 0.2))),
        "small" !== e.size &&
          i < 1 &&
          (i +=
            (s.includes("fog") || s.includes("dark") ? 0.005 : 0.01) *
            (x ?? game.global.portal.mechbay.scouts)) > 1 &&
          (i = 1),
        i
      );
    },
    // function weaponPower(mech,power) from portal.js
    weaponPower: function (e, i) {
      return (
        i < 1 &&
          0 !== i &&
          e.equip.includes("special") &&
          "titan" === e.size &&
          (i += 0.25 * (1 - i)),
        !e.equip.includes("special") ||
          ("large" !== e.size && "cyberdemon" !== e.size) ||
          (i *= 1.02),
        i
      );
    },
    // export function timeFormat(time) from functions.js
    timeFormat: function (e) {
      let i;
      if (e < 0) i = game.loc("time_never");
      else if ((e = +e.toFixed(0)) > 60) {
        let l = e % 60,
          s = (e - l) / 60;
        if (s >= 60) {
          let e = s % 60,
            l = (s - e) / 60;
          if (l > 24) {
            i = `${(l - (e = l % 24)) / 24}d ${e}h`;
          } else i = `${l}h ${(e = ("0" + e).slice(-2))}m`;
        } else
          i = `${(s = ("0" + s).slice(-2))}m ${(l = ("0" + l).slice(-2))}s`;
      } else i = `${(e = ("0" + e).slice(-2))}s`;
      return i;
    },
    // export universeAffix(universe) from achieve.js
    universeAffix: function (e) {
      switch ((e = e || game.global.race.universe)) {
        case "evil":
          return "e";
        case "antimatter":
          return "a";
        case "heavy":
          return "h";
        case "micro":
          return "m";
        case "magic":
          return "mg";
        default:
          return "l";
      }
    },
    // export const genus_traits from races.js (added spores:1 to fungi manually)
    genus_traits: {
      humanoid: { adaptable: 1, wasteful: 1 },
      carnivore: { carnivore: 1, beast: 1, cautious: 1 },
      herbivore: { herbivore: 1, instinct: 1 },
      small: { small: 1, weak: 1 },
      giant: { large: 1, strong: 1 },
      reptilian: { cold_blooded: 1, scales: 1 },
      avian: { flier: 1, hollow_bones: 1, sky_lover: 1 },
      insectoid: { high_pop: 1, fast_growth: 1, high_metabolism: 1 },
      plant: { sappy: 1, asymmetrical: 1 },
      fungi: { detritivore: 1, spongy: 1, spores: 1 },
      aquatic: { submerged: 1, low_light: 1 },
      fey: { elusive: 1, iron_allergy: 1 },
      heat: { smoldering: 1, cold_intolerance: 1 },
      polar: { chilled: 1, heat_intolerance: 1 },
      sand: { scavenger: 1, nomadic: 1 },
      demonic: { immoral: 1, evil: 1, soul_eater: 1 },
      angelic: { blissful: 1, pompous: 1, holy: 1 },
      synthetic: { artifical: 1, powered: 1 },
      eldritch: { psychic: 1, tormented: 1, darkness: 1, unfathomable: 1 },
      hybrid: {},
    },
    // export const neg_roll_traits from races.js
    neg_roll_traits: [
      "angry",
      "arrogant",
      "atrophy",
      "diverse",
      "dumb",
      "fragrant",
      "frail",
      "freespirit",
      "gluttony",
      "gnawer",
      "greedy",
      "hard_of_hearing",
      "heavy",
      "hooved",
      "invertebrate",
      "lazy",
      "mistrustful",
      "nearsighted",
      "nyctophilia",
      "paranoid",
      "pathetic",
      "pessimistic",
      "puny",
      "pyrophobia",
      "skittish",
      "slow",
      "slow_regen",
      "snowy",
      "solitary",
      "unorganized",
    ],

    // Reimplemented:
    // export function crateValue() from resources.js
    crateValue: () =>
      Number(
        getVueById("createHead")?.buildCrateDesc().match(/(\d+)/g)[1] ?? 0,
      ),
    // export function containerValue() from resources.js
    containerValue: () =>
      Number(
        getVueById("createHead")?.buildContainerDesc().match(/(\d+)/g)[1] ?? 0,
      ),

    // Firefox compatibility:
    adjustCosts: (c_action, wiki) =>
      game.adjustCosts(
        cloneInto(c_action, unsafeWindow, { cloneFunctions: true }),
        wiki,
      ),
    loc: (key, variables) => game.loc(key, cloneInto(variables, unsafeWindow)),
    messageQueue: (msg, color, dnr, tags) =>
      game.messageQueue(msg, color, dnr, cloneInto(tags, unsafeWindow)),
    shipCosts: (bp) => game.shipCosts(cloneInto(bp, unsafeWindow)),
  };

  $().ready(mainAutoEvolveScript);
})($);
