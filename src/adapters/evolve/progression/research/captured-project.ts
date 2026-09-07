/** Captured A.R.P.A. planning and execution over one exact project catalog snapshot. */

import type {
  BuildAnnotation,
  BuildCandidateSample,
  BuildClickDecision,
  BuildCompetitionRequest,
  BuildCompetitionSample,
  BuildConflictSample,
  BuildCycleSetup,
  BuildResourceView,
  BuildSampleRequest,
} from "../../../../domain/progression/build/build.ts";
import {
  planProjects,
  type ProjectAutomationSettings,
  type ProjectCapacityView,
} from "../../../../domain/progression/research/project.ts";
import { canAfford, resourceView } from "../../../../domain/game-world.ts";
import type {
  BuildClickResult,
  BuildExecutor,
  BuildReader,
} from "../../../../ports/build.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { OfferedProject } from "../../../../ports/game-project-catalog.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import type { CapturedCostConflictReader } from "../../captured-cost-conflict.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";

export interface CapturedProjectDependencies {
  readonly rootState: GameRootStateSource;
  readonly offered: readonly Readonly<OfferedProject>[] | undefined;
  readonly resources: GameResourceSource;
  readonly conflicts: CapturedCostConflictReader;
  readonly controls: GameControlRegistry;
  /** Persisted script settings are external input and are normalized here. */
  readonly readSettings: () => unknown;
}

export interface CapturedProjectAdapter {
  readonly reader: BuildReader;
  readonly executor: BuildExecutor;
}

interface CycleProject {
  readonly project: Readonly<ReturnType<typeof planProjects>[number]>;
  readonly view: BuildCycleSetup["candidates"][number];
}

const NO_CONSUMPTION = Object.freeze([]);
const ZERO_KNOWLEDGE_GATE = Object.freeze({
  cheapestTechKnowledge: 0,
  knowledgeRequiredByBuildTargets: 0,
  knowledgeCapacity: 0,
});
const LOCKED_RESOURCE: BuildResourceView = Object.freeze({
  unlocked: false,
  currentQuantity: 0,
  rateOfChange: 0,
  storageRatio: 0,
  storageRequired: 0,
});

function finiteSetting(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
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

function buildResource(
  view: ReturnType<typeof resourceView>,
): BuildResourceView {
  return Object.freeze({
    unlocked: view.unlocked,
    currentQuantity: view.amount,
    rateOfChange: view.rateOfChange,
    storageRatio: view.storageRatio,
    storageRequired: 0,
  });
}

export function createCapturedProjectAdapter(
  dependencies: CapturedProjectDependencies,
): CapturedProjectAdapter {
  const { rootState, offered, resources, conflicts, controls, readSettings } =
    dependencies;
  let cycle: readonly CycleProject[] = Object.freeze([]);

  const reader: BuildReader = Object.freeze({
    beginCycle(): BuildCycleSetup {
      if (offered === undefined) {
        cycle = Object.freeze([]);
      } else {
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
        cycle = Object.freeze(
          planProjects({
            settings: readCapturedProjectSettings(readSettings(), offered),
            projects: offered,
            capacities: Object.freeze(capacities),
          }).map((project) =>
            Object.freeze({
              project,
              view: Object.freeze({
                key: project.elementId,
                weighting: project.weighting,
                cost: project.cost,
                ignored: queued.has(project.elementId),
                knowledge: false,
              }),
            }),
          ),
        );
      }
      return Object.freeze({
        candidates: Object.freeze(cycle.map((entry) => entry.view)),
        consumptionMode: "unlimited",
        buildIfStorageFull: false,
        ignoreZeroRate: false,
        saveWhiteholeGems: false,
        knowledgeGate: ZERO_KNOWLEDGE_GATE,
      });
    },

    sampleCandidate(
      index: number,
      request: Readonly<BuildSampleRequest>,
    ): BuildCandidateSample {
      const candidate = cycle[index];
      if (candidate === undefined)
        throw new TypeError(`no project candidate at index ${index}`);
      const sample = resources.readResources(
        Object.keys(candidate.project.cost),
      );
      return Object.freeze({
        ...(request.needAffordability
          ? {
              affordable:
                sample !== undefined &&
                canAfford(sample, candidate.project.cost),
            }
          : {}),
        ...(request.needConsumption ? { consumption: NO_CONSUMPTION } : {}),
      });
    },

    sampleConflict(index: number): BuildConflictSample {
      const candidate = cycle[index];
      if (candidate === undefined)
        throw new TypeError(`no project candidate at index ${index}`);
      const result = conflicts.evaluate(candidate.project.cost);
      if (result.status === "none")
        return Object.freeze({ conflict: null, important: false });
      if (result.status === "unavailable") {
        return Object.freeze({
          conflict: Object.freeze({
            unavailable: true,
            targetNames: Object.freeze([]),
            resourceNames: Object.freeze([]),
            targetCause: "",
          }),
          important: false,
        });
      }
      return Object.freeze({
        conflict: Object.freeze({
          unavailable: false,
          targetNames: result.conflict.targetNames,
          resourceNames: result.conflict.resourceNames,
          targetCause: result.conflict.targetCause,
        }),
        important: false,
      });
    },

    sampleCompetition(
      index: number,
      request: Readonly<BuildCompetitionRequest>,
    ): BuildCompetitionSample {
      if (cycle[index] === undefined)
        throw new TypeError(`no project candidate at index ${index}`);
      const byKey = new Map(
        cycle.map((entry) => [entry.view.key, entry.project.cost] as const),
      );
      const wanted = new Set(request.resourceIds);
      for (const key of request.affordabilityKeys) {
        for (const id of Object.keys(byKey.get(key) ?? {})) wanted.add(id);
      }
      const sample = resources.readResources(wanted);
      const affordability: Record<string, boolean> = {};
      for (const key of request.affordabilityKeys) {
        const cost = byKey.get(key);
        if (cost === undefined)
          throw new TypeError(`unknown project candidate ${key}`);
        affordability[key] = sample !== undefined && canAfford(sample, cost);
      }
      const views: Record<string, BuildResourceView> = {};
      for (const id of request.resourceIds) {
        views[id] =
          sample === undefined
            ? LOCKED_RESOURCE
            : buildResource(resourceView(sample, id));
      }
      return Object.freeze({
        affordability: Object.freeze(affordability),
        resources: Object.freeze(views),
      });
    },
  });

  const executor: BuildExecutor = Object.freeze({
    annotate(annotation: Readonly<BuildAnnotation>) {
      return cycle[annotation.index]?.view.key === annotation.key
        ? SUCCEEDED
        : stale("stale-project-target", "project candidate list changed");
    },

    executeClick(decision: Readonly<BuildClickDecision>): BuildClickResult {
      const candidate = cycle[decision.index];
      const base = {
        clicked: false,
        mission: false,
        consumption: NO_CONSUMPTION,
      } as const;
      if (candidate === undefined || candidate.view.key !== decision.key) {
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

  return Object.freeze({ reader, executor });
}
