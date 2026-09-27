import {
  parsePlannerStats,
  type PlannerStats,
} from "../../domain/planner-analysis.ts";
import type { PlannerStatsStore } from "../../ports/planner-stats-store.ts";
import { readProperty } from "../validation.ts";

const PLANNER_STATS_KEY = "ea_planner_stats";

export function createPlannerStatsStore(storage: unknown): PlannerStatsStore {
  return Object.freeze({
    load() {
      try {
        const getItem = readProperty(storage, "getItem");
        if (typeof getItem !== "function") return null;
        const serialized: unknown = Reflect.apply(getItem, storage, [
          PLANNER_STATS_KEY,
        ]);
        return typeof serialized !== "string"
          ? null
          : parsePlannerStats(JSON.parse(serialized) as unknown);
      } catch {
        return null;
      }
    },
    save(stats: Readonly<PlannerStats>) {
      try {
        const setItem = readProperty(storage, "setItem");
        if (typeof setItem !== "function") return false;
        Reflect.apply(setItem, storage, [
          PLANNER_STATS_KEY,
          JSON.stringify(stats),
        ]);
        return true;
      } catch {
        return false;
      }
    },
  });
}
