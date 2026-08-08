import {
  recordPlannerSample,
  type PlannerLimit,
  type PlannerStats,
} from "../domain/planner-analysis.ts";
import type { GameBuildPlannerPort } from "../ports/game-build-planner.ts";

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

type BuildPlannerState = {
  plannerFreshTick: number;
  scriptTick: number;
  unlockedBuildings?: BuildPlannerTarget[];
  queuedTargets: BuildPlannerTarget[];
  triggerTargets: BuildPlannerTarget[];
  plannerStats?: Readonly<PlannerStats> | null;
};

type PlannerLimitUnavailable = {
  readonly status: "unavailable";
  readonly reason: string;
  readonly resourceId?: string;
};

type BuildPlannerDependencies = {
  gameBuildPlanner: GameBuildPlannerPort;
  getSettings: () => BuildPlannerSettings;
  getSettingsRaw: () => { buildPlannerCollapsed: boolean };
  getState: () => BuildPlannerState;
  plannerLimitingResource: (
    target: BuildPlannerTarget,
  ) => Readonly<PlannerLimit> | PlannerLimitUnavailable | null;
  loadPlannerStats: () => Readonly<PlannerStats> | null;
  savePlannerStats: (stats: unknown) => boolean;
};

export function createBuildPlanner({
  getSettings,
  getSettingsRaw,
  getState,
  gameBuildPlanner,
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
    const pageHidden = gameBuildPlanner.isPageHidden();
    const shouldSample = !pageHidden || settings.stateLogEnabled;
    const shouldDraw = !pageHidden;
    const buildRan = state.plannerFreshTick === state.scriptTick;
    const targets = state.unlockedBuildings ?? [];

    const topTarget = targets[0];

    if (shouldSample && buildRan && topTarget !== undefined) {
      state.plannerStats ??= loadPlannerStats();
      const stats = state.plannerStats;
      if (stats !== null) {
        const limit = plannerLimitingResource(topTarget);
        const bucket =
          limit === null
            ? "not blocked"
            : "status" in limit
              ? "data unavailable"
              : limit.resourceTitle;
        const updated = recordPlannerSample(
          stats,
          bucket,
          gameBuildPlanner.readDay(),
        );
        state.plannerStats = updated;
        if (updated.total % 25 === 0) {
          savePlannerStats(updated);
        }
      }
    }

    if (!shouldDraw || getSettingsRaw().buildPlannerCollapsed) {
      return;
    }
    if (!gameBuildPlanner.plannerListPresent()) {
      return;
    }
    const listHtml = buildListHtml(settings, state, buildRan, targets);
    gameBuildPlanner.writePlannerList(listHtml);

    const stats = state.plannerStats;
    if (stats !== null && stats !== undefined && stats.total > 0) {
      const shares = Object.entries(stats.samples)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(
          ([resource, samples]) =>
            `${resource} ${Math.round((samples / stats.total) * 100)}%`,
        )
        .join(" · ");
      gameBuildPlanner.writePlannerStats(
        `${shares}<div class="planner-note">Top target blocked by, since day ${stats.startDay} (${stats.total} samples)</div>`,
      );
    }
  }

  function buildListHtml(
    settings: BuildPlannerSettings,
    state: BuildPlannerState,
    buildRan: boolean,
    targets: BuildPlannerTarget[],
  ) {
    if (!settings.autoBuild && !settings.autoARPA) {
      return '<li class="planner-note">autoBuild / autoARPA disabled</li>';
    }
    const rows = targets.slice(0, 8).map((target) => {
      const limit = plannerLimitingResource(target);
      let status: string;
      let statusClass: string;
      if (!limit) {
        status = "ready";
        statusClass = "has-text-success";
      } else if ("status" in limit) {
        status = "planner data unavailable";
        statusClass = "has-text-danger";
      } else if (limit.blocker === "storage") {
        status = `${limit.resourceTitle} (storage)`;
        statusClass = "has-text-danger";
      } else if (limit.blocker === "stalled") {
        status = `${limit.resourceTitle} (no income)`;
        statusClass = "has-text-danger";
      } else if (limit.blocker === "locked") {
        status = `${limit.resourceTitle} (locked)`;
        statusClass = "has-text-danger";
      } else {
        status = `${gameBuildPlanner.formatPlannerTime(limit.time)} (${limit.resourceTitle})`;
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
                <span class="planner-weight has-text-advanced">${gameBuildPlanner.formatPlannerNumber(
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
    return rows.join("");
  }

  return { updateBuildPlanner };
}
