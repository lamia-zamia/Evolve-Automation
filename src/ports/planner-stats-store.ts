import type { PlannerStats } from "../domain/planner-analysis.ts";

export interface PlannerStatsStore {
  load(): Readonly<PlannerStats> | null;
  save(stats: Readonly<PlannerStats>): boolean;
}
