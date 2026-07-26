import {
  advanceScriptTick,
  advanceStateLog,
  isThrottledTick,
  shouldStartTick,
} from "../domain/tick.ts";
import type {
  TickControls,
  TickDiagnostics,
  TickReader,
} from "../ports/tick.ts";

export interface TickDependencies {
  readonly reader: TickReader;
  readonly controls: TickControls;
  readonly diagnostics?: TickDiagnostics | undefined;
  /** Optional for direct unit fixtures; the application runner supplies this phase in production. */
  readonly updateState?: () => void;
}

/**
 * One pass of automation, driven by the game's own tick. This runner owns the load-bearing order:
 * several controllers invalidate data the ones after them would otherwise misread, and the inline
 * comments record which dependency each position is protecting. The pure gating math lives in
 * domain/tick; the goal is re-sampled after updateState because that pass can change it.
 *
 * Returns whether the tick did real work (passed the throttle gate), so callers can time only
 * working cycles.
 */
export function runTick({
  reader,
  controls,
  diagnostics,
  updateState,
}: TickDependencies): boolean {
  const preamble = reader.samplePreamble();
  if (!shouldStartTick(preamble)) {
    return false;
  }

  controls.markGameTickConsumed();
  const scriptTick = advanceScriptTick(preamble.scriptTick);
  controls.setScriptTick(scriptTick);
  if (isThrottledTick(scriptTick, preamble.tickRate, preamble.accelerated)) {
    return false;
  }

  const profiling =
    diagnostics?.readPerformanceEnabled() === true ? diagnostics : undefined;
  const workStartedAtMs = profiling?.nowMs();
  const measure = <T>(phase: string, action: () => T): T => {
    if (profiling === undefined) {
      return action();
    }
    const startedAtMs = profiling.nowMs();
    try {
      return action();
    } finally {
      profiling.recordPerformance(phase, profiling.nowMs() - startedAtMs);
    }
  };
  const finishProfile = () => {
    if (profiling !== undefined && workStartedAtMs !== undefined) {
      profiling.recordPerformance("tick", profiling.nowMs() - workStartedAtMs);
      profiling.flushPerformance();
    }
  };

  measure("updateScriptData", () => controls.updateScriptData()); // Sync exposed data with script variables
  measure("updateOverrides", () => controls.updateOverrides()); // Apply settings overrides as soon as possible
  measure("finalizeScriptData", () => controls.finalizeScriptData()); // Second part of updating data, applying settings

  // Redraw tabs once they unlocked
  if (measure("updateTabs", () => controls.updateTabs())) {
    finishProfile();
    return true;
  }

  measure("updateState", () => (updateState ?? controls.updateState)());
  measure("updateUI", () => controls.updateUI());
  controls.keyManagerReset();

  // Sampled after updateState/updateOverrides so the goal reflects any evolution transition and the
  // settings reflect the overrides.
  const s = reader.sampleAutomation();

  // The user has turned off the master toggle. Stop taking any actions on behalf of the player.
  // We've still updated the UI etc. above; just not performing any actions.
  if (!s.masterScriptToggle) {
    finishProfile();
    return true;
  }

  if (s.goal === "Evolution") {
    if (s.autoEvolution) {
      measure("autoEvolution", () => controls.autoEvolution());
    }
    finishProfile();
    return true;
  }

  if (s.buildingAlwaysClick || s.autoBuild) {
    measure("autoGatherResources", () => controls.autoGatherResources());
  }
  if (s.autoMarket) {
    measure("autoMarket", () => controls.autoMarket()); // Invalidates values of resources, changes are random and can't be predicted, but we won't need values anywhere else
  }
  if (s.autoHell) {
    measure("autoHell", () => controls.autoHell());
  }
  if (s.autoGalaxyMarket) {
    controls.autoGalaxyMarket();
  }
  if (s.autoMiningDroid) {
    controls.autoMiningDroid();
  }
  if (s.autoGraphenePlant) {
    controls.autoGraphenePlant();
  }
  if (s.autoAlchemy) {
    controls.autoAlchemy();
  }
  if (s.autoPylon) {
    controls.autoPylon();
  }
  if (s.autoQuarry) {
    controls.autoQuarry();
  }
  if (s.autoMine) {
    controls.autoMine();
  }
  if (s.autoExtractor) {
    controls.autoExtractor();
  }
  if (s.autoSmelter) {
    controls.autoSmelter();
  }
  if (s.autoStorage) {
    // Called before autoJobs, autoFleet and autoPower - so they wont mess with quantum
    measure("autoStorage", () => controls.autoStorage());
  }
  if (s.autoReplicator) {
    controls.autoReplicator();
  }
  if (!s.autoTrigger || !controls.autoTrigger()) {
    // Only go to autoResearch and autoBuild if triggers not building anything at this very moment, to ensure they won't steal reasources from triggers
    if (s.autoResearch) {
      measure("autoResearch", () => controls.autoResearch()); // Called before autoBuild and autoGenetics - knowledge goes to techs first
    }
    if (s.autoBuild || s.autoARPA) {
      measure("autoBuild", () => controls.autoBuild()); // Called after autoStorage to compensate fluctuations of quantum(caused by previous tick's adjustments) levels before weightings
      controls.setPlannerFreshTick(scriptTick);
    }
  }
  if (s.autoFactory) {
    controls.autoFactory();
  }
  if (s.autoJobs) {
    measure("autoJobs", () => controls.autoJobs());
  } else if (s.autoCraftsmen) {
    measure("autoJobs", () => controls.autoJobs(true));
  }
  if (s.autoFleet) {
    if (s.truepath) {
      measure("autoFleetOuter", () => controls.autoFleetOuter());
    } else {
      measure("autoFleet", () => controls.autoFleet()); // Need to know Mine Layers stateOnCount, called before autoPower while it's still valid
    }
  }
  if (s.autoMech) {
    measure("autoMech", () => controls.autoMech()); // Called after autoBuild, to prevent stealing supplies from mechs
  }
  if (s.autoGenetics) {
    controls.autoGenetics(); // Called after autoBuild and autoResearch to prevent stealing knowledge from them
  }
  if (s.autoMinorTrait) {
    controls.autoMinorTrait(); // Called after auto assemble to utilize new genes right asap
  }
  if (s.autoCraft) {
    measure("autoCraft", () => controls.autoCraft()); // Invalidates quantities of craftables, missing exposed craftingRatio to calculate craft result on script side
  }
  if (s.autoFight) {
    measure("autoFight", () => {
      controls.autoMerc();
      controls.autoSpy(); // Can unoccupy foreign power in rare occasions, without caching back new status, but such desync should not cause any harm
      controls.autoBattle(); // Invalidates garrison, and adds unaccounted amount of resources after attack
    });
  }
  if (s.autoTax) {
    controls.autoTax();
  }
  if (s.autoGovernment) {
    measure("autoGovernment", () => controls.autoGovernment());
  }
  if (s.autoNanite) {
    controls.consumeNanite(); // Purge remaining rateOfChange, should be called when it won't be needed anymore
  }
  if (s.autoSupply) {
    controls.consumeSupply();
  }
  if (s.autoEject) {
    controls.consumeEject();
  }
  if (s.autoPower) {
    // Called after purging of rateOfChange, to know useless resources
    measure("autoPower", () => controls.autoPower());
  }
  if (controls.isPrestigeAllowed()) {
    measure("autoPrestige", () => controls.autoPrestige()); // Called after autoBattle to not launch attacks right before reset, killing soldiers
  }
  if (s.autoMinorTrait) {
    controls.autoShapeshift(); // Shifting genus can remove techs, buildings, resources, etc. Leaving broken preloaded buttons behind. This thing need to be at the very end, to prevent clicking anything before redrawing tabs
    controls.autoPsychic();
    controls.autoOcularPowers();
    controls.autoWish();
  }
  if (s.autoMutateTraits) {
    controls.autoMutateTrait();
  }

  measure("updateBuildPlanner", () => controls.updateBuildPlanner());

  if (s.stateLogEnabled) {
    const { next, record } = advanceStateLog(
      s.stateLogTick,
      s.stateLogInterval,
    );
    controls.setStateLogTick(next);
    if (record) {
      controls.recordStateSnapshot();
    }
  }

  controls.keyManagerFinish();
  controls.recordSoulGem();
  finishProfile();
  return true;
}
