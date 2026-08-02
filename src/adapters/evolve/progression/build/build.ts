import type {
  BuildAnnotation,
  BuildCandidateSample,
  BuildClickDecision,
  BuildCompetitionRequest,
  BuildCompetitionSample,
  BuildConflictSample,
  BuildConflictView,
  BuildConsumptionMode,
  BuildConsumptionView,
  BuildCycleSetup,
  BuildResourceView,
  BuildSampleRequest,
} from "../../../../domain/progression/build/build.ts";
import type {
  BuildClickResult,
  BuildExecutor,
  BuildReader,
} from "../../../../ports/build.ts";
import type { TickDiagnostics } from "../../../../ports/tick.ts";
import { createPhaseMeasure } from "../../../../utils/performance.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import {
  requireArray,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../../validation.ts";

export interface BuildAdapterDependencies {
  readonly getBuildingManager: () => unknown;
  readonly getProjectManager: () => unknown;
  readonly getState: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly getCostConflict: (target: unknown) => unknown;
  readonly diagnostics?: TickDiagnostics | undefined;
}

export interface BuildAdapter {
  readonly reader: BuildReader;
  readonly executor: BuildExecutor;
}

interface BuildCycleCapture {
  readonly entities: readonly UnknownRecord[];
  readonly byKey: ReadonlyMap<string, UnknownRecord>;
}

function callMethod(
  target: UnknownRecord,
  name: string,
  path: string,
): unknown {
  return requireFunction(target[name], `${path}.${name}`).call(target);
}

const UNAVAILABLE_CONFLICT: BuildConflictView = Object.freeze({
  unavailable: true,
  targetNames: Object.freeze([]),
  resourceNames: Object.freeze([]),
  targetCause: "",
});

const EMPTY_CONSUMPTION: readonly BuildConsumptionView[] = Object.freeze([]);

function sampleConsumption(
  entity: UnknownRecord,
  path: string,
): readonly BuildConsumptionView[] {
  const list = requireArray(entity["consumption"], `${path}.consumption`);
  return Object.freeze(
    list.map((raw, index) => {
      const entryPath = `${path}.consumption[${index}]`;
      const entry = requireRecord(raw, entryPath);
      const resource = requireRecord(
        entry["resource"],
        `${entryPath}.resource`,
      );
      // Legacy keyed consumptionsUsed by resource._id and compared
      // `c.rate >= 0` without validating either; keep the same coercions.
      return Object.freeze({
        resourceId: String(resource["_id"]),
        nonNegativeRate: Number(entry["rate"]) >= 0,
      });
    }),
  );
}

export function createBuildAdapter(
  dependencies: BuildAdapterDependencies,
): BuildAdapter {
  let cycle: BuildCycleCapture | null = null;

  function capturedEntity(index: number, key?: string): UnknownRecord {
    if (cycle === null) {
      throw new TypeError("no active build cycle");
    }
    const entity = cycle.entities[index];
    if (entity === undefined) {
      throw new TypeError(`no build candidate at index ${index}`);
    }
    if (key !== undefined && entity["_vueBinding"] !== key) {
      throw new TypeError(`build candidate at index ${index} is not ${key}`);
    }
    return entity;
  }

  const reader: BuildReader = Object.freeze({
    beginCycle(): BuildCycleSetup {
      const measure = createPhaseMeasure(dependencies.diagnostics);
      const buildingManager = requireRecord(
        dependencies.getBuildingManager(),
        "BuildingManager",
      );
      const projectManager = requireRecord(
        dependencies.getProjectManager(),
        "ProjectManager",
      );
      measure("autoBuild.beginCycle.updateBuildingWeighting", () =>
        callMethod(buildingManager, "updateWeighting", "BuildingManager"),
      );
      measure("autoBuild.beginCycle.updateProjectWeighting", () =>
        callMethod(projectManager, "updateWeighting", "ProjectManager"),
      );

      const state = requireRecord(dependencies.getState(), "state");
      const queuedTargets = requireArray(
        state["queuedTargets"],
        "state.queuedTargets",
      );
      const triggerTargets = requireArray(
        state["triggerTargets"],
        "state.triggerTargets",
      );
      // The legacy loop checked these arrays for every managed candidate. Sets
      // preserve the same object-identity membership semantics without making
      // large end-game target lists rescan both arrays repeatedly.
      const queuedTargetSet = new Set(queuedTargets);
      const triggerTargetSet = new Set(triggerTargets);

      const entities = measure("autoBuild.beginCycle.readCandidateLists", () =>
        [
          ...requireArray(
            callMethod(
              buildingManager,
              "managedPriorityList",
              "BuildingManager",
            ),
            "BuildingManager.managedPriorityList()",
          ),
          ...requireArray(
            callMethod(projectManager, "managedPriorityList", "ProjectManager"),
            "ProjectManager.managedPriorityList()",
          ),
        ].map((entry, index) => requireRecord(entry, `buildList[${index}]`)),
      );
      // Highest weighting first; stable sort keeps the legacy tie order.
      measure("autoBuild.beginCycle.sortCandidates", () =>
        entities.sort(
          (a, b) => Number(b["weighting"]) - Number(a["weighting"]),
        ),
      );
      // TRANSITIONAL: the sorted entity list is still published to
      // state.unlockedBuildings for the build planner UI, the state log,
      // resource weighting, and the jobs/factory adapters until those
      // consumers stop reading the legacy state bag.
      measure("autoBuild.beginCycle.publishCandidates", () => {
        state["unlockedBuildings"] = entities;
      });

      const byKey = new Map<string, UnknownRecord>();
      const candidates = measure(
        "autoBuild.beginCycle.normalizeCandidates",
        () =>
          entities.map((entity, index) => {
            const path = `buildList[${index}]`;
            const key = requireString(
              entity["_vueBinding"],
              `${path}._vueBinding`,
            );
            byKey.set(key, entity);
            const rawCost = requireRecord(entity["cost"], `${path}.cost`);
            const cost: Record<string, number> = {};
            for (const resourceId of Object.keys(rawCost)) {
              cost[resourceId] = requireNumber(
                rawCost[resourceId],
                `${path}.cost.${resourceId}`,
              );
            }
            return Object.freeze({
              key,
              weighting: requireNumber(
                entity["weighting"],
                `${path}.weighting`,
              ),
              cost: Object.freeze(cost),
              ignored:
                queuedTargetSet.has(entity) || triggerTargetSet.has(entity),
            });
          }),
      );

      const settings = requireRecord(dependencies.getSettings(), "settings");
      // Legacy read these settings loosely: overrides may yield non-boolean
      // values, and any unknown buildingConsumptionCheck value fell through
      // to the onePerTick branch.
      const rawMode = settings["buildingConsumptionCheck"];
      const consumptionMode: BuildConsumptionMode =
        rawMode === "perResource"
          ? "perResource"
          : rawMode === "unlimited"
            ? "unlimited"
            : "onePerTick";

      cycle = Object.freeze({ entities: Object.freeze(entities), byKey });
      return Object.freeze({
        candidates: Object.freeze(candidates),
        consumptionMode,
        buildIfStorageFull: Boolean(settings["buildingBuildIfStorageFull"]),
        ignoreZeroRate: Boolean(settings["buildingsIgnoreZeroRate"]),
        saveWhiteholeGems:
          settings["prestigeType"] === "whitehole" &&
          Boolean(settings["prestigeWhiteholeSaveGems"]),
      });
    },

    sampleCandidate(
      index: number,
      request: Readonly<BuildSampleRequest>,
    ): BuildCandidateSample {
      const entity = capturedEntity(index);
      const path = `buildList[${index}]`;
      const sample: {
        affordable?: boolean;
        consumption?: readonly BuildConsumptionView[];
      } = {};
      if (request.needAffordability) {
        sample.affordable = Boolean(callMethod(entity, "isAffordable", path));
      }
      if (request.needConsumption) {
        sample.consumption = sampleConsumption(entity, path);
      }
      return Object.freeze(sample);
    },

    sampleConflict(index: number): BuildConflictSample {
      const entity = capturedEntity(index);
      const path = `buildList[${index}]`;
      const raw = dependencies.getCostConflict(entity);
      let conflict: BuildConflictView | null = null;
      // Legacy treated any truthy result as a conflict.
      if (raw) {
        const record = requireRecord(raw, "costConflict");
        conflict =
          record["status"] === "unavailable"
            ? UNAVAILABLE_CONFLICT
            : Object.freeze({
                unavailable: false,
                targetNames: Object.freeze(
                  requireArray(
                    record["targetNames"],
                    "costConflict.targetNames",
                  ).map((name) => String(name)),
                ),
                resourceNames: Object.freeze(
                  requireArray(
                    record["resourceNames"],
                    "costConflict.resourceNames",
                  ).map((name) => String(name)),
                ),
                targetCause: String(record["targetCause"]),
              });
      }
      return Object.freeze({
        conflict,
        important: Boolean(
          requireRecord(entity["is"], `${path}.is`)["important"],
        ),
      });
    },

    sampleCompetition(
      index: number,
      request: Readonly<BuildCompetitionRequest>,
    ): BuildCompetitionSample {
      capturedEntity(index);
      const capture = cycle as BuildCycleCapture;
      const affordability: Record<string, boolean> = {};
      for (const key of request.affordabilityKeys) {
        const entity = capture.byKey.get(key);
        if (entity === undefined) {
          throw new TypeError(`unknown build candidate ${key}`);
        }
        affordability[key] = Boolean(
          callMethod(entity, "isAffordable", `buildList[${key}]`),
        );
      }
      const resources = requireRecord(dependencies.getResources(), "resources");
      const resourceViews: Record<string, BuildResourceView> = {};
      for (const resourceId of request.resourceIds) {
        const path = `resources.${resourceId}`;
        const resource = requireRecord(resources[resourceId], path);
        // Legacy compared these fields without validating. Several are
        // lazily initialized (storageRequired, rateOfChange before the first
        // state update), so plain number coercion lets NaN flow through the
        // planner comparisons exactly as it did in the legacy loop.
        resourceViews[resourceId] = Object.freeze({
          unlocked: Boolean(callMethod(resource, "isUnlocked", path)),
          currentQuantity: Number(resource["currentQuantity"]),
          rateOfChange: Number(resource["rateOfChange"]),
          storageRatio: Number(resource["storageRatio"]),
          storageRequired: Number(resource["storageRequired"]),
        });
      }
      return Object.freeze({
        affordability: Object.freeze(affordability),
        resources: Object.freeze(resourceViews),
      });
    },
  });

  function staleTarget(index: number, key: string) {
    return stale("stale-build-target", "build candidate list changed", {
      key,
      index,
    });
  }

  function candidateFor(index: number, key: string): UnknownRecord | null {
    if (cycle === null) {
      return null;
    }
    const entity = cycle.entities[index];
    if (entity === undefined || entity["_vueBinding"] !== key) {
      return null;
    }
    return entity;
  }

  const executor: BuildExecutor = Object.freeze({
    annotate(annotation: Readonly<BuildAnnotation>) {
      if (cycle === null) {
        return rejected(
          "no-build-cycle",
          "annotate requires an active build cycle",
        );
      }
      const entity = candidateFor(annotation.index, annotation.key);
      if (entity === null) {
        return staleTarget(annotation.index, annotation.key);
      }
      let text: string;
      if (annotation.kind === "text") {
        text = annotation.text;
      } else {
        const other = cycle.byKey.get(annotation.otherKey);
        if (other === undefined) {
          return staleTarget(annotation.index, annotation.otherKey);
        }
        const resources = requireRecord(
          dependencies.getResources(),
          "resources",
        );
        const resource = requireRecord(
          resources[annotation.resourceId],
          `resources.${annotation.resourceId}`,
        );
        // Legacy interpolated the live title/name getters at annotation time.
        text = `Conflicts with <span class="has-text-info">${String(
          other["title"],
        )}</span> for <span class="has-text-info">${String(
          resource["name"],
        )}</span><br>`;
      }
      entity["extraDescription"] = String(entity["extraDescription"]) + text;
      return SUCCEEDED;
    },

    executeClick(decision: Readonly<BuildClickDecision>): BuildClickResult {
      if (cycle === null) {
        return Object.freeze({
          outcome: rejected(
            "no-build-cycle",
            "executeClick requires an active build cycle",
          ),
          clicked: false,
          mission: false,
          consumption: EMPTY_CONSUMPTION,
        });
      }
      const entity = candidateFor(decision.index, decision.key);
      if (entity === null) {
        return Object.freeze({
          outcome: staleTarget(decision.index, decision.key),
          clicked: false,
          mission: false,
          consumption: EMPTY_CONSUMPTION,
        });
      }
      const path = `buildList[${decision.index}]`;
      const clicked = Boolean(callMethod(entity, "click", path));
      if (!clicked) {
        return Object.freeze({
          outcome: SUCCEEDED,
          clicked: false,
          mission: false,
          consumption: EMPTY_CONSUMPTION,
        });
      }
      // Sampled after the click, matching the legacy post-click reads.
      return Object.freeze({
        outcome: SUCCEEDED,
        clicked: true,
        mission: Boolean(callMethod(entity, "isMission", path)),
        consumption: sampleConsumption(entity, path),
      });
    },
  });

  return Object.freeze({ reader, executor });
}
