import type { Clock } from "../ports/clock.ts";
import type {
  StateUpdateControls,
  StateUpdateReader,
} from "../ports/state-update.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import { createPhaseMeasure } from "../utils/performance.ts";
import {
  computeMoneyWindow,
  computeTowerSize,
  evaluateStabilise,
  planGoalTransition,
} from "../domain/state-update.ts";

export interface StateUpdateDependencies {
  readonly reader: StateUpdateReader;
  readonly controls: StateUpdateControls;
  readonly clock: Clock;
  readonly diagnostics?: TickDiagnostics | undefined;
}

/**
 * Runs one updateState refresh: resolve what the last evolution produced (abandoning the tick if an
 * evolution result is still pending), clear the accumulators the planning passes write into, run
 * those passes in dependency order, then refresh the derived game state the controllers read after.
 * The runner owns this order; the pure calculations live in domain/state-update.
 */
export function runStateUpdate({
  reader,
  controls,
  clock,
  diagnostics,
}: StateUpdateDependencies): void {
  const measure = createPhaseMeasure(diagnostics);
  const goalSnapshot = reader.sampleGoalTransition();
  const transition = planGoalTransition(goalSnapshot);
  switch (transition.kind) {
    case "force-evolution":
      controls.setGoal("Evolution");
      break;
    case "resolve-leaving":
      if (!controls.checkEvolutionResult()) {
        return;
      }
      controls.setGoal("Standard");
      if (transition.rebuildTriggers) {
        controls.rebuildTriggerContent();
      }
      break;
    case "day1-fallback":
      if (!controls.checkEvolutionResult()) {
        return;
      }
      break;
    case "proceed":
      break;
  }

  measure("updateState.resetResourceAccumulators", () =>
    controls.resetResourceAccumulators(),
  );
  measure("updateState.applyStorageUnitValues", () =>
    controls.applyStorageUnitValues(),
  );
  measure("updateState.runPlanningPasses", () => controls.runPlanningPasses());

  controls.resetTooltips();

  const refresh = measure("updateState.sampleRefresh", () =>
    reader.sampleRefresh(),
  );
  const money = computeMoneyWindow(refresh.moneyIncomes, refresh.moneyRate);
  controls.applyMoneyWindow(money.incomes, money.median);
  controls.applyAstroSign();
  controls.applyTowerSize(computeTowerSize(refresh.pillars));

  const stabilise = evaluateStabilise(
    refresh.currentExotic,
    refresh.lastExoticMass,
  );
  controls.applyStabilise(
    stabilise.stabilised ? clock.nowMs() : undefined,
    stabilise.lastExoticMass,
  );

  measure("updateState.cacheSpaceDockOptions", () =>
    controls.cacheSpaceDockOptions(),
  );
  measure("updateState.updateActiveTargets", () =>
    controls.updateActiveTargets(),
  );
}
