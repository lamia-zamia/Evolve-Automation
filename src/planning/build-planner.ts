type BuildPlannerSettings = {
  buildPlannerUI: boolean;
  stateLogEnabled: boolean;
  autoBuild: boolean;
  autoARPA: boolean;
};

type BuildPlannerTarget = {
  title: string;
  weighting: number;
  count: number;
  is?: { multiSegmented?: boolean };
  extraDescription: string;
};

type BuildPlannerStats = {
  startDay: number;
  day: number;
  samples: Record<string, number>;
  total: number;
};

type BuildPlannerState = {
  plannerFreshTick: number;
  scriptTick: number;
  unlockedBuildings?: BuildPlannerTarget[];
  queuedTargets: BuildPlannerTarget[];
  triggerTargets: BuildPlannerTarget[];
  plannerStats?: BuildPlannerStats | null;
};

type PlannerLimit = {
  resource: { title: string };
  time: number;
  blocker: "storage" | "income" | "stalled";
};

type JQueryResult = {
  length: number;
  html: (value: string) => unknown;
};

type BuildPlannerDependencies = {
  getSettings: () => BuildPlannerSettings;
  getSettingsRaw: () => { buildPlannerCollapsed: boolean };
  getState: () => BuildPlannerState;
  getGame: () => { global: { stats: { days: number } } };
  getDocument: () => { hidden: boolean };
  getJQuery: () => (selector: string) => JQueryResult;
  getPoly: () => { timeFormat: (seconds: number) => string };
  getNiceNumber: (value: number) => number;
  plannerLimitingResource: (target: BuildPlannerTarget) => PlannerLimit | null;
  loadPlannerStats: () => BuildPlannerStats;
  savePlannerStats: () => void;
};

export function createBuildPlanner({
  getSettings,
  getSettingsRaw,
  getState,
  getGame,
  getDocument,
  getJQuery,
  getPoly,
  getNiceNumber,
  plannerLimitingResource,
  loadPlannerStats,
  savePlannerStats,
}: BuildPlannerDependencies) {
  function updateBuildPlanner() {
    const settings = getSettings();
    if (!settings.buildPlannerUI) {
      return;
    }
    const state = getState();
    const shouldSample = !getDocument().hidden || settings.stateLogEnabled;
    const shouldDraw = !getDocument().hidden;
    const buildRan = state.plannerFreshTick === state.scriptTick;
    const targets = state.unlockedBuildings ?? [];

    if (shouldSample && buildRan && targets.length > 0) {
      state.plannerStats ??= loadPlannerStats();
      const stats = state.plannerStats;
      const limit = plannerLimitingResource(targets[0]);
      const bucket = limit ? limit.resource.title : "not blocked";
      stats.samples[bucket] = (stats.samples[bucket] ?? 0) + 1;
      stats.total++;
      stats.day = getGame().global.stats.days;
      if (stats.total % 25 === 0) {
        savePlannerStats();
      }
    }

    if (!shouldDraw || getSettingsRaw().buildPlannerCollapsed) {
      return;
    }
    const jquery = getJQuery();
    const list = jquery("#script_planner-list");
    if (list.length === 0) {
      return;
    }

    if (!settings.autoBuild && !settings.autoARPA) {
      list.html('<li class="planner-note">autoBuild / autoARPA disabled</li>');
    } else {
      const rows = targets.slice(0, 8).map((target) => {
        const limit = plannerLimitingResource(target);
        let status: string;
        let statusClass: string;
        if (!limit) {
          status = "ready";
          statusClass = "has-text-success";
        } else if (limit.blocker === "storage") {
          status = `${limit.resource.title} (storage)`;
          statusClass = "has-text-danger";
        } else if (limit.blocker === "stalled") {
          status = `${limit.resource.title} (no income)`;
          statusClass = "has-text-danger";
        } else {
          status = `${getPoly().timeFormat(limit.time)} (${limit.resource.title})`;
          statusClass = "has-text-warning";
        }
        let name = target.title;
        if (target.count && !target.is?.multiSegmented) {
          name += ` #${target.count + 1}`;
        }
        if (state.queuedTargets.includes(target)) {
          name += ' <span class="has-text-special">(queued)</span>';
        } else if (state.triggerTargets.includes(target)) {
          name += ' <span class="has-text-special">(trigger)</span>';
        }
        const note = target.extraDescription
          .replace(/^Auto(Build|ARPA) weighting:[^<]*<br>/, "")
          .split("<br>")
          .filter(Boolean)
          .join(" · ");
        return `<li>
            <div class="planner-row">
                <span class="planner-name">${name}</span>
                <span class="planner-weight has-text-advanced">${getNiceNumber(
                  target.weighting,
                )}</span>
                <span class="planner-time ${statusClass}">${status}</span>
            </div>
            ${note ? `<div class="planner-note">${note}</div>` : ""}
        </li>`;
      });
      if (!buildRan) {
        rows.unshift(
          '<li class="planner-note">autoBuild idle (triggers or queue processing) — list from last update</li>',
        );
      } else if (rows.length === 0) {
        rows.push('<li class="planner-note">Nothing to build</li>');
      }
      list.html(rows.join(""));
    }

    const stats = state.plannerStats;
    if (stats?.total > 0) {
      const shares = Object.entries(stats.samples)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(
          ([resource, samples]) =>
            `${resource} ${Math.round((samples / stats.total) * 100)}%`,
        )
        .join(" · ");
      jquery("#script_planner-stats-text").html(
        `${shares}<div class="planner-note">Top target blocked by, since day ${stats.startDay} (${stats.total} samples)</div>`,
      );
    }
  }

  return { updateBuildPlanner };
}
