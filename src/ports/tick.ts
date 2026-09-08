import type { TickStartSnapshot } from "../domain/tick.ts";
import type { PhaseTimingSink } from "../utils/performance.ts";

/** Pre-refresh gating snapshot: read before updateOverrides can change the script settings. */
export interface TickPreambleSnapshot extends TickStartSnapshot {
  readonly scriptTick: number;
  readonly tickRate: number;
  /** game.global.settings.at — the game's accelerated-time flag. */
  readonly accelerated: boolean;
}

/**
 * The automation-gating snapshot, sampled after updateState so the goal reflects any evolution
 * transition and every setting reflects updateOverrides. The tick reads a broad slice of settings
 * because it is the orchestrator that gates every automation.
 */
export interface TickAutomationSnapshot {
  readonly goal: string;
  readonly masterScriptToggle: boolean;
  /** game.global.race.truepath — routes fleet automation to the outer-fleet controller. */
  readonly truepath: boolean;
  readonly buildingAlwaysClick: boolean;
  readonly autoEvolution: boolean;
  readonly autoBuild: boolean;
  readonly autoARPA: boolean;
  readonly autoMarket: boolean;
  readonly autoHell: boolean;
  readonly autoGalaxyMarket: boolean;
  readonly autoMiningDroid: boolean;
  readonly autoGraphenePlant: boolean;
  readonly autoAlchemy: boolean;
  readonly autoPylon: boolean;
  readonly autoQuarry: boolean;
  readonly autoMine: boolean;
  readonly autoExtractor: boolean;
  readonly autoSmelter: boolean;
  readonly autoStorage: boolean;
  readonly autoReplicator: boolean;
  readonly autoTrigger: boolean;
  readonly autoResearch: boolean;
  readonly autoFactory: boolean;
  readonly autoJobs: boolean;
  readonly autoCraftsmen: boolean;
  readonly autoFleet: boolean;
  readonly autoMech: boolean;
  readonly autoGenetics: boolean;
  readonly autoMinorTrait: boolean;
  readonly autoCraft: boolean;
  readonly autoFight: boolean;
  readonly autoTax: boolean;
  readonly autoGovernment: boolean;
  readonly autoNanite: boolean;
  readonly autoSupply: boolean;
  readonly autoEject: boolean;
  readonly autoPower: boolean;
  readonly autoMutateTraits: boolean;
  readonly stateLogEnabled: boolean;
  readonly stateLogInterval: number;
  readonly stateLogTick: number;
}

export interface TickReader {
  samplePreamble(): TickPreambleSnapshot;
  sampleAutomation(): TickAutomationSnapshot;
}

/** Optional, explicitly enabled timing sink for live performance diagnosis. */
export interface TickDiagnostics extends PhaseTimingSink {
  flushPerformance(): void;
}

/**
 * The tick's effectful surface: the script's controllers, the key manager, the consumption managers,
 * and the tick bookkeeping writes. The runner owns the order these are called in; updateTabs,
 * autoTrigger, and isPrestigeAllowed return the booleans the runner branches on.
 */
export interface TickControls {
  /** Consumes the game-ticked flag so one game tick drives at most one automation pass. */
  markGameTickConsumed(): void;
  setScriptTick(scriptTick: number): void;
  setPlannerFreshTick(scriptTick: number): void;
  setStateLogTick(stateLogTick: number): void;
  /** Reads the current Soul Gem count and carries it to the next tick for gain attribution. */
  recordSoulGem(): void;

  updateScriptData(): void;
  updateOverrides(): void;
  finalizeScriptData(): void;
  /** Redraws tabs that just unlocked; a redraw abandons the rest of the tick. */
  updateTabs(): boolean;
  updateState(): void;
  updateUI(): void;
  keyManagerReset(): void;
  keyManagerFinish(): void;

  autoEvolution(): void;
  autoGatherResources(): void;
  autoMarket(): void;
  autoHell(): void;
  autoGalaxyMarket(): void;
  autoMiningDroid(): void;
  autoGraphenePlant(): void;
  autoAlchemy(): void;
  autoPylon(): void;
  autoQuarry(): void;
  autoMine(): void;
  autoExtractor(): void;
  autoSmelter(): void;
  autoStorage(): void;
  autoReplicator(): void;
  /** Returns true when a trigger started construction this tick, blocking research/build. */
  autoTrigger(): boolean;
  autoResearch(): void;
  autoBuild(): void;
  autoFactory(): void;
  autoJobs(craftsmenOnly?: boolean): void;
  autoFleetOuter(): void;
  autoFleet(): void;
  autoMech(): void;
  autoGenetics(): void;
  autoMinorTrait(): void;
  autoCraft(): void;
  autoMerc(): void;
  autoSpy(): void;
  autoBattle(): void;
  autoTax(): void;
  autoGovernment(): void;
  consumeNanite(): void;
  consumeSupply(): void;
  consumeEject(): void;
  autoPower(): void;
  isPrestigeAllowed(): boolean;
  autoPrestige(): void;
  autoShapeshift(): void;
  autoPsychic(): void;
  autoOcularPowers(): void;
  autoWish(): void;
  autoMutateTrait(): void;
  updateBuildPlanner(): void;
  recordStateSnapshot(): void;
}
