// Composes the 28 `resetXSettings(reset)` functions from the pure defaults tables, the
// reset reader/effects ports, and the pure `applySettings` record primitive. This replaces
// the legacy getter-bag `createResetSettings`: no proxy managers, no injected `applySettings`.
//
// The application owns the effect order for each section — install a manager's priority list
// before the defaults apply, re-sort after — so the pure `computeXDefaults` functions only
// return data.

import {
  computeAchievementGuardDefaults,
  computeAuthorityDefaults,
  computeBuildingDefaults,
  computeChallengeHelperDefaults,
  computeEjectorDefaults,
  computeEvolutionDefaults,
  computeFleetDefaults,
  computeGeneralDefaults,
  computeGovernmentDefaults,
  computeHellDefaults,
  computeInterfaceDefaults,
  computeJobDefaults,
  computeLoggingDefaults,
  computeMagicDefaults,
  computeMarketDefaults,
  computeMechDefaults,
  computeMinorTraitDefaults,
  computeMutableTraitDefaults,
  computePlanetDefaults,
  computePrestigeDefaults,
  computeProductionDefaults,
  computeProjectDefaults,
  computeResearchDefaults,
  computeStateLogDefaults,
  computeStorageDefaults,
  computeWarDefaults,
  computeWeightingDefaults,
  type ResetPlan,
} from "../domain/settings-defaults.ts";
import {
  applySettings,
  type SettingsRecord,
} from "../domain/settings-migration.ts";
import type {
  SettingsResetEffects,
  SettingsResetReader,
} from "../ports/settings-reset.ts";

export interface SettingsResetDependencies {
  getSettingsRaw: () => SettingsRecord;
  reader: SettingsResetReader;
  effects: SettingsResetEffects;
}

export function createSettingsResets({
  getSettingsRaw,
  reader,
  effects,
}: SettingsResetDependencies) {
  const applyPlan = (plan: ResetPlan, reset: boolean): void => {
    const orders = plan.priorityOrders ?? [];
    for (const order of orders) {
      effects.setPriorityList(order.manager, order.ids);
    }
    applySettings(getSettingsRaw(), plan.def, reset);
    for (const order of orders) {
      if (order.sort) {
        effects.sortByPriority(order.manager);
      }
    }
  };

  return {
    // Pure record-only sections.
    resetWarSettings: (reset: boolean) =>
      applyPlan(computeWarDefaults(), reset),
    resetHellSettings: (reset: boolean) =>
      applyPlan(computeHellDefaults(), reset),
    resetGeneralSettings: (reset: boolean) =>
      applyPlan(computeGeneralDefaults(), reset),
    resetInterfaceSettings: (reset: boolean) =>
      applyPlan(computeInterfaceDefaults(), reset),
    resetStateLogSettings: (reset: boolean) =>
      applyPlan(computeStateLogDefaults(), reset),
    resetAchievementGuardSettings: (reset: boolean) =>
      applyPlan(computeAchievementGuardDefaults(), reset),
    resetChallengeHelperSettings: (reset: boolean) =>
      applyPlan(computeChallengeHelperDefaults(), reset),
    resetPrestigeSettings: (reset: boolean) =>
      applyPlan(computePrestigeDefaults(), reset),
    resetAuthoritySettings: (reset: boolean) =>
      applyPlan(computeAuthorityDefaults(), reset),
    resetResearchSettings: (reset: boolean) =>
      applyPlan(computeResearchDefaults(), reset),
    resetWeightingSettings: (reset: boolean) =>
      applyPlan(computeWeightingDefaults(), reset),
    resetFleetSettings: (reset: boolean) =>
      applyPlan(computeFleetDefaults(), reset),
    resetMechSettings: (reset: boolean) =>
      applyPlan(computeMechDefaults(), reset),

    // Sections reading a narrow live catalog.
    resetGovernmentSettings: (reset: boolean) =>
      applyPlan(computeGovernmentDefaults(reader.readGovernment()), reset),
    resetEvolutionSettings: (reset: boolean) =>
      applyPlan(computeEvolutionDefaults(reader.readEvolution()), reset),
    resetLoggingSettings: (reset: boolean) =>
      applyPlan(computeLoggingDefaults(reader.readLogging()), reset),
    resetPlanetSettings: (reset: boolean) =>
      applyPlan(computePlanetDefaults(reader.readPlanet()), reset),
    resetProductionSettings: (reset: boolean) =>
      applyPlan(computeProductionDefaults(reader.readProduction()), reset),

    // Sections owning a manager priority list.
    resetMarketSettings: (reset: boolean) =>
      applyPlan(computeMarketDefaults(reader.readMarket()), reset),
    resetStorageSettings: (reset: boolean) =>
      applyPlan(computeStorageDefaults(reader.readStorage()), reset),
    resetMinorTraitSettings: (reset: boolean) =>
      applyPlan(computeMinorTraitDefaults(reader.readMinorTrait()), reset),
    resetMutableTraitSettings: (reset: boolean) =>
      applyPlan(computeMutableTraitDefaults(reader.readMutableTrait()), reset),
    resetJobSettings: (reset: boolean) =>
      applyPlan(computeJobDefaults(reader.readJob()), reset),
    resetProjectSettings: (reset: boolean) =>
      applyPlan(computeProjectDefaults(reader.readProject()), reset),
    resetMagicSettings: (reset: boolean) =>
      applyPlan(computeMagicDefaults(reader.readMagic()), reset),
    resetEjectorSettings: (reset: boolean) =>
      applyPlan(computeEjectorDefaults(reader.readEjector()), reset),

    // Building: initBuildingState runs before the priority list is read; sort after.
    resetBuildingSettings: (reset: boolean) => {
      effects.initBuildingState();
      const plan = computeBuildingDefaults(reader.readBuilding());
      applySettings(getSettingsRaw(), plan.def, reset);
      effects.sortByPriority("building");
    },

    // Trigger: rebuild the default triggers (on reset or first run) before applying defaults.
    resetTriggerSettings: (reset: boolean) => {
      const settingsRaw = getSettingsRaw();
      if (
        reset ||
        !Object.prototype.hasOwnProperty.call(settingsRaw, "autoTrigger")
      ) {
        settingsRaw.triggers =
          effects.rebuildDefaultTriggers() as SettingsRecord["triggers"];
      }
      applySettings(settingsRaw, { autoTrigger: false }, reset);
    },
  };
}
