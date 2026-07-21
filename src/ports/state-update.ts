import type { GoalTransitionSnapshot } from "../domain/state-update.ts";

/** Inputs the refresh phase's pure calculations need, sampled after the planning passes run. */
export interface StateUpdateRefreshSnapshot {
  readonly moneyIncomes: readonly number[];
  readonly moneyRate: number;
  readonly pillars: Readonly<Record<string, number>> | undefined;
  /** Stellar-engine exotic mass, coerced to 0 when the engine is absent (legacy `?? 0`). */
  readonly currentExotic: number;
  readonly lastExoticMass: number;
}

/** Validated reads for the state-update refresh, sampled at the two points the runner needs them. */
export interface StateUpdateReader {
  sampleGoalTransition(): GoalTransitionSnapshot;
  sampleRefresh(): StateUpdateRefreshSnapshot;
}

/**
 * The effectful steps of the refresh, in the vocabulary the runner drives them by. The runner owns
 * the order; each method performs one legacy side effect (a helper pass, a state/building write, or
 * the jQuery active-targets panel).
 */
export interface StateUpdateControls {
  /** Resolves what the last evolution produced; false abandons the tick. */
  checkEvolutionResult(): boolean;
  setGoal(goal: string): void;
  /** Rebuilds trigger descriptions whose tech names could not be resolved during evolution. */
  rebuildTriggerContent(): void;
  /** Clears every resource's per-tick maxCost/storageRequired/requestedQuantity accumulators. */
  resetResourceAccumulators(): void;
  /** Re-reads crate/container storage unit values from the game. */
  applyStorageUnitValues(): void;
  /** Runs updatePriorityTargets, updateProjects, calculateRequiredStorages, prioritizeDemandedResources in order. */
  runPlanningPasses(): void;
  resetTooltips(): void;
  applyMoneyWindow(incomes: readonly number[], median: number): void;
  applyAstroSign(): void;
  applyTowerSize(towerSize: number): void;
  /** Writes the new exotic mass, and the stabilise timestamp only when `stabilisedAt` is provided. */
  applyStabilise(
    stabilisedAt: number | undefined,
    lastExoticMass: number,
  ): void;
  /** Caches the Space Dock's modal buildings the first time they are needed. */
  cacheSpaceDockOptions(): void;
  /** Renders (or unbinds) the active-targets panel from the queued/trigger targets. */
  updateActiveTargets(): void;
}
