import { createGameActionVerification } from "../validation/game-actions.ts";
import { createForeignGovernment } from "../game/foreign-government.ts";
import { createGalaxyIntelligence } from "../game/galaxy-intelligence.ts";
import { createGameRates } from "../game/rates.ts";
import { createHellIntelligence } from "../game/hell-intelligence.ts";
import { createPowerSupport } from "../game/power-support.ts";
import { createPrestigeIntelligence } from "../game/prestige-intelligence.ts";
import { createRaceProfile } from "../game/race-profile.ts";
import { createRuntimeQueries } from "../game/runtime-queries.ts";
import { createShrineIntelligence } from "../game/shrine-intelligence.ts";
import { createWomlingAchievements } from "../game/womling-achievements.ts";

type ActionVerificationDependencies = Parameters<
  typeof createGameActionVerification
>[0];
type GameRatesDependencies = Parameters<typeof createGameRates>[0];
type GalaxyDependencies = Parameters<typeof createGalaxyIntelligence>[0];
type HellDependencies = Parameters<typeof createHellIntelligence>[0];
type PowerDependencies = Parameters<typeof createPowerSupport>[0];
type PrestigeDependencies = Parameters<typeof createPrestigeIntelligence>[0];
type RaceProfileDependencies = Parameters<typeof createRaceProfile>[0];
type RuntimeQueryDependencies = Parameters<typeof createRuntimeQueries>[0];
type ShrineDependencies = Parameters<typeof createShrineIntelligence>[0];
type WomlingDependencies = Parameters<typeof createWomlingAchievements>[0];
type ForeignGovernmentDependencies = Parameters<
  typeof createForeignGovernment
>[0];

export interface RuntimeIntelligenceControlDependencies {
  readonly getGame: () => unknown;
  readonly getBuildings: () => unknown;
  readonly log: (...values: readonly unknown[]) => void;
  readonly getTraitVal: () => unknown;
  readonly getPoly: () => unknown;
  readonly getResources: () => unknown;
  readonly getGalaxyOffers: () => unknown;
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getJobs: () => unknown;
  readonly getCrafter: () => unknown;
  readonly getTechIds: () => unknown;
  readonly getHaveTech: () => unknown;
  readonly getDate: () => unknown;
}

export function createRuntimeIntelligenceControl({
  getGame,
  getBuildings,
  log,
  getTraitVal,
  getPoly,
  getResources,
  getGalaxyOffers,
  getSettings,
  getState,
  getJobs,
  getCrafter,
  getTechIds,
  getHaveTech,
  getDate,
}: RuntimeIntelligenceControlDependencies) {
  const actionVerification = createGameActionVerification({
    getGame: getGame as ActionVerificationDependencies["getGame"],
    getBuildings:
      getBuildings as ActionVerificationDependencies["getBuildings"],
    log,
  });
  const runtimeQueries = createRuntimeQueries({
    getGame: getGame as RuntimeQueryDependencies["getGame"],
  });
  const raceProfile = createRaceProfile({
    getGame: getGame as RaceProfileDependencies["getGame"],
    getTraitVal: getTraitVal as RaceProfileDependencies["getTraitVal"],
  });
  const foreignGovernment = createForeignGovernment({
    getGame: getGame as ForeignGovernmentDependencies["getGame"],
    getPoly: getPoly as ForeignGovernmentDependencies["getPoly"],
  });
  const galaxyIntelligence = createGalaxyIntelligence({
    getGame: getGame as GalaxyDependencies["getGame"],
    getBuildings: getBuildings as GalaxyDependencies["getBuildings"],
    getResources: getResources as GalaxyDependencies["getResources"],
    getGalaxyOffers: getGalaxyOffers as GalaxyDependencies["getGalaxyOffers"],
    getSettings: getSettings as GalaxyDependencies["getSettings"],
    getTraitVal: getTraitVal as GalaxyDependencies["getTraitVal"],
  });
  const hellIntelligence = createHellIntelligence({
    getGame: getGame as HellDependencies["getGame"],
    getBuildings: getBuildings as HellDependencies["getBuildings"],
    getPoly: getPoly as HellDependencies["getPoly"],
    getSettings: getSettings as HellDependencies["getSettings"],
    getTraitVal: getTraitVal as HellDependencies["getTraitVal"],
  });
  const womlingAchievements = createWomlingAchievements({
    getGame: getGame as WomlingDependencies["getGame"],
    getPoly: getPoly as WomlingDependencies["getPoly"],
  });
  const shrineIntelligence = createShrineIntelligence({
    getGame: getGame as ShrineDependencies["getGame"],
    getSettings: getSettings as ShrineDependencies["getSettings"],
  });
  const prestigeIntelligence = createPrestigeIntelligence({
    getSettings: getSettings as PrestigeDependencies["getSettings"],
    getTechIds: getTechIds as PrestigeDependencies["getTechIds"],
    getHaveTech: getHaveTech as PrestigeDependencies["getHaveTech"],
  });
  const powerSupport = createPowerSupport({
    getGame: getGame as PowerDependencies["getGame"],
    getJobs: getJobs as PowerDependencies["getJobs"],
    getCrafter: getCrafter as PowerDependencies["getCrafter"],
    getResources: getResources as PowerDependencies["getResources"],
    getBuildings: getBuildings as PowerDependencies["getBuildings"],
  });
  const gameRates = createGameRates({
    getSettings: getSettings as GameRatesDependencies["getSettings"],
    getGame: getGame as GameRatesDependencies["getGame"],
    getBuildings: getBuildings as GameRatesDependencies["getBuildings"],
    getState: getState as GameRatesDependencies["getState"],
    getResources: getResources as GameRatesDependencies["getResources"],
    getJobs: getJobs as GameRatesDependencies["getJobs"],
    getTraitVal: getTraitVal as GameRatesDependencies["getTraitVal"],
    getGovernor: () => runtimeQueries.getGovernor(),
    getHaveTech: getHaveTech as GameRatesDependencies["getHaveTech"],
    getDate: getDate as GameRatesDependencies["getDate"],
  });

  return Object.freeze({
    ...actionVerification,
    ...runtimeQueries,
    ...raceProfile,
    ...foreignGovernment,
    ...galaxyIntelligence,
    ...hellIntelligence,
    ...womlingAchievements,
    ...shrineIntelligence,
    ...prestigeIntelligence,
    ...powerSupport,
    ...gameRates,
  });
}
