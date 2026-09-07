/**
 * A.R.P.A. projects as one family of the captured construction cycle.
 *
 * The catalog is read once per cycle, so the candidates the planner sees, the prices it compares,
 * and the control the executor invokes all come from the same snapshot. Affordability, cost
 * conflicts and resource competition belong to the shared cycle, so a project competes with a city
 * building on the same terms.
 */

import {
  planProjects,
  type PlannedProject,
  type ProjectAutomationSettings,
  type ProjectCapacityView,
} from "../../../../domain/progression/research/project.ts";
import { resourceView } from "../../../../domain/game-world.ts";
import type { BuildClickResult } from "../../../../ports/build.ts";
import type {
  ConstructionCandidate,
  ConstructionCandidateSource,
} from "../../../../ports/construction-candidates.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type {
  GameProjectCatalog,
  OfferedProject,
} from "../../../../ports/game-project-catalog.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { CapturedProjectContextReader } from "./captured-project-context.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";

export interface CapturedProjectDependencies {
  readonly rootState: GameRootStateSource;
  readonly catalog: GameProjectCatalog;
  readonly resources: GameResourceSource;
  readonly controls: GameControlRegistry;
  /** What the prestige plan, challenge and race say about projects this run. */
  readonly context: CapturedProjectContextReader;
  /** Persisted script settings are external input and are normalized here. */
  readonly readSettings: () => unknown;
}

interface CycleProject {
  readonly project: Readonly<PlannedProject>;
  readonly candidate: Readonly<ConstructionCandidate>;
}

const NO_CONSUMPTION = Object.freeze([]);

function finiteSetting(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Whether the caller wants projects automated at all, read without the catalog. Answering this
 * first keeps a discovery pass — the most expensive thing in the cycle — off the tick of every
 * player who leaves A.R.P.A. automation switched off.
 */
export function isProjectAutomationEnabled(value: unknown): boolean {
  return Boolean(readProperty(value, "autoARPA"));
}

/** Normalize missing/corrupt imported settings before they enter the pure planner. */
export function readCapturedProjectSettings(
  value: unknown,
  projects: readonly Readonly<OfferedProject>[],
): ProjectAutomationSettings {
  const settings = isNonArrayRecord(value) ? value : {};
  const rawStep = finiteSetting(settings, "arpaStep", 1);
  const stepPercent = Math.max(1, Math.min(100, Math.floor(rawStep)));
  return Object.freeze({
    enabled: Boolean(settings["autoARPA"]),
    stepPercent,
    scaleWeighting: Boolean(settings["arpaScaleWeighting"]),
    targets: Object.freeze(
      projects.map((project, index) =>
        Object.freeze({
          projectId: project.projectId,
          enabled: Boolean(settings[`arpa_${project.projectId}`]),
          priority: finiteSetting(
            settings,
            `arpa_p_${project.projectId}`,
            index,
          ),
          maximum: finiteSetting(settings, `arpa_m_${project.projectId}`, -1),
          weighting: finiteSetting(settings, `arpa_w_${project.projectId}`, 0),
        }),
      ),
    ),
  });
}

function projectState(
  root: unknown,
  id: string,
): { rank: number; progress: number } | undefined {
  const state = readProperty(readProperty(root, "arpa"), id);
  if (!isNonArrayRecord(state)) return undefined;
  const rank = Number(state["rank"]);
  const progress = Number(state["complete"]);
  return Number.isSafeInteger(rank) &&
    rank >= 0 &&
    Number.isSafeInteger(progress) &&
    progress >= 0
    ? { rank, progress }
    : undefined;
}

function queuedIds(root: unknown): ReadonlySet<string> {
  const queue = readProperty(readProperty(root, "queue"), "queue");
  if (!Array.isArray(queue)) return new Set();
  const ids = new Set<string>();
  for (const entry of queue) {
    const id = readProperty(entry, "id");
    if (typeof id === "string") ids.add(id);
  }
  return ids;
}

export function createCapturedProjectSource(
  dependencies: CapturedProjectDependencies,
): ConstructionCandidateSource {
  const { rootState, catalog, resources, controls, context, readSettings } =
    dependencies;
  let cycle: ReadonlyMap<string, CycleProject> = new Map();

  return Object.freeze({
    family: "arpa",

    beginCycle(): readonly Readonly<ConstructionCandidate>[] {
      const settings = readSettings();
      if (!isProjectAutomationEnabled(settings)) {
        cycle = new Map();
        return Object.freeze([]);
      }
      const offered = catalog.readProjects();
      if (offered === undefined) {
        // A discovery pass that failed leaves no catalog. Planning from the previous one would
        // spend against prices and offers the game may already have moved past.
        cycle = new Map();
        return Object.freeze([]);
      }
      const resourceIds = new Set(
        offered.flatMap((project) => Object.keys(project.cost)),
      );
      const sample = resources.readResources(resourceIds);
      const capacities: Record<string, ProjectCapacityView> = {};
      if (sample !== undefined) {
        for (const id of resourceIds) {
          const view = resourceView(sample, id);
          capacities[id] = Object.freeze({
            unlocked: view.unlocked,
            maximum: view.max,
          });
        }
      }
      const queued = queuedIds(rootState.readRoot());
      const entries = new Map<string, CycleProject>();
      for (const project of planProjects({
        settings: readCapturedProjectSettings(settings, offered),
        projects: offered,
        capacities: Object.freeze(capacities),
        context: context.readContext(),
      })) {
        entries.set(project.elementId, {
          project,
          candidate: Object.freeze({
            key: project.elementId,
            weighting: project.weighting,
            cost: project.cost,
            ignored: queued.has(project.elementId),
            knowledge: false,
            important: false,
          }),
        });
      }
      cycle = entries;
      return Object.freeze(
        [...entries.values()].map((entry) => entry.candidate),
      );
    },

    execute(key: string): BuildClickResult {
      const base = {
        clicked: false,
        mission: false,
        consumption: NO_CONSUMPTION,
      } as const;
      const candidate = cycle.get(key);
      if (candidate === undefined) {
        return Object.freeze({
          outcome: stale(
            "stale-project-target",
            "project candidate list changed",
          ),
          ...base,
        });
      }
      const handle = controls.resolve(candidate.project.elementId);
      if (handle === undefined) {
        return Object.freeze({
          outcome: rejected(
            "project-control-missing",
            `no captured control for ${candidate.project.elementId}`,
          ),
          ...base,
        });
      }
      if (handle.generation !== candidate.project.generation) {
        return Object.freeze({
          outcome: stale(
            "stale-project-control",
            `${candidate.project.elementId} was redrawn`,
          ),
          ...base,
        });
      }
      const before = projectState(
        rootState.readRoot(),
        candidate.project.projectId,
      );
      if (
        before === undefined ||
        before.rank !== candidate.project.rank ||
        before.progress !== candidate.project.progress
      ) {
        return Object.freeze({
          outcome: stale(
            "stale-project-state",
            `${candidate.project.projectId} moved after sampling`,
          ),
          ...base,
        });
      }
      const result = controls.invoke(handle, "build", [
        candidate.project.projectId,
        candidate.project.steps,
      ]);
      if (!result.ok) {
        return Object.freeze({
          outcome:
            result.reason === "stale-control"
              ? stale("stale-project-control", result.detail ?? result.reason)
              : rejected(
                  "project-build-failed",
                  result.detail ?? result.reason,
                ),
          ...base,
        });
      }
      const after = projectState(
        rootState.readRoot(),
        candidate.project.projectId,
      );
      const clicked =
        after !== undefined &&
        (after.rank > before.rank || after.progress > before.progress);
      return Object.freeze({
        outcome: SUCCEEDED,
        clicked,
        mission: false,
        consumption: NO_CONSUMPTION,
      });
    },
  });
}
