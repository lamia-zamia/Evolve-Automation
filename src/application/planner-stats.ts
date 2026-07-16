import {
  createPlannerStats,
  parsePlannerStats,
  selectPlannerStats,
  type PlannerRun,
  type PlannerStats,
} from "../domain/planner-analysis.ts";
import type { PlannerStatsStore } from "../ports/planner-stats-store.ts";

export interface PlannerStatsLifecycle {
  make(run: Readonly<PlannerRun>): Readonly<PlannerStats>;
  load(run: Readonly<PlannerRun>): Readonly<PlannerStats>;
  save(stats: unknown): boolean;
}

export function createPlannerStatsLifecycle(
  store: PlannerStatsStore,
): PlannerStatsLifecycle {
  return Object.freeze({
    make: createPlannerStats,
    load(run: Readonly<PlannerRun>) {
      return selectPlannerStats(store.load(), run);
    },
    save(stats: unknown) {
      const validated = parsePlannerStats(stats);
      return validated !== null && store.save(validated);
    },
  });
}
