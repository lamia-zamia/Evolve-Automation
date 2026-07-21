import type {
  BuildingResetContext,
  EjectorResetContext,
  EvolutionResetContext,
  GovernmentResetContext,
  JobResetContext,
  LoggingResetContext,
  MagicResetContext,
  MarketResetContext,
  MinorTraitResetContext,
  MutableTraitResetContext,
  PlanetResetContext,
  PriorityManagerKey,
  ProductionResetContext,
  ProjectResetContext,
  StorageResetContext,
} from "../domain/settings-defaults.ts";

/**
 * Reads the narrow live catalog each defaults section consults. Every method samples the
 * current game/manager state and normalizes it into the section's immutable context; the
 * pure `computeXDefaults` functions never read live state themselves.
 */
export interface SettingsResetReader {
  readGovernment(): GovernmentResetContext;
  readEvolution(): EvolutionResetContext;
  readLogging(): LoggingResetContext;
  readPlanet(): PlanetResetContext;
  readMarket(): MarketResetContext;
  readStorage(): StorageResetContext;
  readMinorTrait(): MinorTraitResetContext;
  readMutableTrait(): MutableTraitResetContext;
  readJob(): JobResetContext;
  /** Sampled after `initBuildingState` runs, so `BuildingManager.priorityList` is populated. */
  readBuilding(): BuildingResetContext;
  readProject(): ProjectResetContext;
  readMagic(): MagicResetContext;
  readProduction(): ProductionResetContext;
  readEjector(): EjectorResetContext;
}

/**
 * The manager-facing side effects a reset performs beyond writing the settings record. The
 * application layer owns the order (install priority lists before applying defaults, sort
 * after); each method performs one legacy manager mutation.
 */
export interface SettingsResetEffects {
  /** Rebuild a manager's `priorityList` from an ordered list of item ids. */
  setPriorityList(
    manager: PriorityManagerKey,
    orderedIds: readonly string[],
  ): void;
  /** Call the manager's `sortByPriority` after the defaults are applied. */
  sortByPriority(manager: PriorityManagerKey): void;
  /** `initBuildingState()` — run before reading the building context. */
  initBuildingState(): void;
  /**
   * Clear `TriggerManager.priorityList` and add the three default triggers, returning the
   * serialized trigger list to store on `settingsRaw.triggers`.
   */
  rebuildDefaultTriggers(): readonly unknown[];
}
