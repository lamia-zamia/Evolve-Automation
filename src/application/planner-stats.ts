import {
  createPlannerStats,
  parsePlannerStats,
  recordPlannerSample,
  selectPlannerStats,
  type PlannerRun,
  type PlannerStats,
} from "../domain/planner-analysis.ts";
import type { PlannerStatsStore } from "../ports/planner-stats-store.ts";
import type { ConstructionReadoutSnapshot } from "../ports/game-construction-observations.ts";

export interface PlannerStatsLifecycle {
  make(run: Readonly<PlannerRun>): Readonly<PlannerStats>;
  load(run: Readonly<PlannerRun>): Readonly<PlannerStats>;
  save(stats: unknown): boolean;
  record(
    stats: Readonly<PlannerStats>,
    bucket: string,
    currentDay: number,
  ): Readonly<PlannerStats>;
}

/** Select the first candidate whose gate was evaluated for this planner sample. */
export function plannerStatsBucket(
  snapshot: Readonly<ConstructionReadoutSnapshot>,
): string {
  return (
    snapshot.targets.find((target) => !target.queued)?.blocker ?? "unavailable"
  );
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
    record(stats: Readonly<PlannerStats>, bucket: string, currentDay: number) {
      const next = recordPlannerSample(stats, bucket, currentDay);
      if (next.total % 25 === 0) store.save(next);
      return next;
    },
  });
}
