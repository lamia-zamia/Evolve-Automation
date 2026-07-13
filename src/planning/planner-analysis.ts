type PlannerResource = {
  title: string;
  currentQuantity: number;
  maxQuantity: number;
  income: number;
  isUnlocked: () => boolean;
};

type PlannerTarget = {
  cost: Record<string, number>;
  isAffordable: () => boolean;
};

type PlannerStats = {
  startDay: number;
  day: number;
  reset: number;
  samples: Record<string, number>;
  total: number;
};

type PlannerAnalysisDependencies = {
  getGame: () => { global: { stats: { days: number; reset: number } } };
  getResources: () => Record<string, PlannerResource>;
  getState: () => { plannerStats?: PlannerStats | null };
  storage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
};

export function createPlannerAnalysis({
  getGame,
  getResources,
  getState,
  storage,
}: PlannerAnalysisDependencies) {
  function plannerLimitingResource(target: PlannerTarget) {
    if (target.isAffordable()) {
      return null;
    }
    const resources = getResources();
    let worst: {
      resource: PlannerResource;
      time: number;
      blocker: "storage" | "income" | "stalled";
    } | null = null;
    for (const resourceId in target.cost) {
      const resource = resources[resourceId];
      const quantity = target.cost[resourceId];
      if (!resource.isUnlocked() || resource.currentQuantity >= quantity) {
        continue;
      }
      let time: number;
      let blocker: "storage" | "income" | "stalled";
      if (resource.maxQuantity < quantity) {
        time = Number.MAX_SAFE_INTEGER;
        blocker = "storage";
      } else if (resource.income > 0) {
        time = (quantity - resource.currentQuantity) / resource.income;
        blocker = "income";
      } else {
        time = Number.MAX_SAFE_INTEGER / 2;
        blocker = "stalled";
      }
      if (!worst || time > worst.time) {
        worst = { resource, time, blocker };
      }
    }
    return worst;
  }

  function makePlannerStats(): PlannerStats {
    const stats = getGame().global.stats;
    return {
      startDay: stats.days,
      day: stats.days,
      reset: stats.reset,
      samples: {},
      total: 0,
    };
  }

  function loadPlannerStats() {
    try {
      const saved = JSON.parse(
        storage.getItem("ea_planner_stats") as string,
      ) as PlannerStats | null;
      const stats = getGame().global.stats;
      if (saved && saved.reset === stats.reset && saved.day <= stats.days) {
        return saved;
      }
    } catch {
      return makePlannerStats();
    }
    return makePlannerStats();
  }

  function savePlannerStats() {
    const plannerStats = getState().plannerStats;
    if (plannerStats) {
      storage.setItem("ea_planner_stats", JSON.stringify(plannerStats));
    }
  }

  return {
    plannerLimitingResource,
    makePlannerStats,
    loadPlannerStats,
    savePlannerStats,
  };
}
