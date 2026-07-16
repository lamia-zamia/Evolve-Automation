import {
  parsePlannerStats,
  type PlannerStats,
} from "../../domain/planner-analysis.ts";
import type { PlannerStatsStore } from "../../ports/planner-stats-store.ts";

const PLANNER_STATS_KEY = "ea_planner_stats";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createPlannerStatsStore(
  storage: KeyValueStorage,
): PlannerStatsStore {
  return Object.freeze({
    load() {
      try {
        const serialized = storage.getItem(PLANNER_STATS_KEY);
        return serialized === null
          ? null
          : parsePlannerStats(JSON.parse(serialized) as unknown);
      } catch {
        return null;
      }
    },
    save(stats: Readonly<PlannerStats>) {
      try {
        storage.setItem(PLANNER_STATS_KEY, JSON.stringify(stats));
        return true;
      } catch {
        return false;
      }
    },
  });
}
