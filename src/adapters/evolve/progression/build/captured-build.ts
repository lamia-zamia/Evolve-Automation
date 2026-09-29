/**
 * Captured construction as one family of the captured construction cycle.
 *
 * Everything here comes from the page capture — the live root for counts, the game's own cost code
 * for prices, the game's own `action()` closure for the purchase. Nothing asks whether a panel is
 * rendered: a captured control keeps working after its tab is
 * torn down, which is the whole point of the slice.
 *
 * Affordability, cost conflicts and resource competition are not decided here. They belong to the
 * shared cycle in `../construction/captured-construction.ts`, so a building competes with an
 * A.R.P.A. project on the same terms it competes with another building.
 *
 * **Weighting** is the caller's configured per-building weighting, not the dynamic weighting
 * engine. The engine is a separate port of its own; the planners only need a total order.
 */

import type { BuildConsumptionView } from "../../../../domain/progression/build/build.ts";
import type { BuildClickResult } from "../../../../ports/build.ts";
import type {
  ConstructionCandidate,
  ConstructionCandidateSource,
} from "../../../../ports/construction-candidates.ts";
import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameActivitySink } from "../../../../ports/game-message-log.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { costFitsStorage } from "../../captured-affordability.ts";
import { readCapturedControlLabel } from "../../captured-control-label.ts";
import { readCapturedBuildQueueEntryCount } from "../../captured-queue-reservations.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import { readCapturedGrantAction } from "./captured-grant-action.ts";

/** One building the caller manages, with the settings the planners need. */
export interface CapturedBuildTarget {
  /** Stable identity for settings and planner caches, e.g. `city-basic_housing`. */
  readonly key: string;
  /** The id the game renders the control under. Usually the same as `key`, but not always. */
  readonly elementId: string;
  /** Which container in the game root holds this building's state, e.g. `city`. */
  readonly region: string;
  /** The building's own key inside that container, e.g. `basic_housing`. */
  readonly id: string;
  /** Reads one-shot action completion when upstream stores progress outside a region count. */
  readonly readCount?: (root: unknown) => number | undefined;
  readonly weighting: number;
  /** Stop building at this count. `Number.MAX_SAFE_INTEGER` for no limit. */
  readonly maximum: number;
  /** Whether the building raises the Knowledge capacity used by the planner gate. */
  readonly knowledge?: boolean;
  /** The caller's "build this regardless" setting; it bypasses the cost-conflict gate. */
  readonly important: boolean;
  /** Script-sampled upkeep/support entries, when per-resource consumption checks are enabled. */
  readonly consumption?: readonly Readonly<BuildConsumptionView>[];
}

export interface CapturedBuildDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly costs: GameActionCostReader;
  readonly readTargets: () => readonly Readonly<CapturedBuildTarget>[];
  readonly readSettings?: () => unknown;
  /** Ensures the game has built the relevant action controls before target sampling. */
  readonly ensureControls?: () => void;
  /** Reports a candidate that could not be evaluated. It is dropped, never guessed at. */
  readonly onSkipped?: (key: string, reason: string) => void;
  /** Reports the captured action boundary while performance diagnostics are enabled. */
  readonly onDiagnostic?: (message: string) => void;
  /** Reports a successful build after the game's count changed. */
  readonly onActivity?: GameActivitySink;
}

interface CycleCandidate {
  readonly target: Readonly<CapturedBuildTarget>;
  readonly candidate: Readonly<ConstructionCandidate>;
  readonly count: number;
}

const NO_CONSUMPTION = Object.freeze([]);

function readBuilding(
  root: unknown,
  target: Readonly<CapturedBuildTarget>,
): Record<PropertyKey, unknown> | undefined {
  if (target.readCount !== undefined) {
    const count = target.readCount(root);
    return typeof count === "number" && Number.isFinite(count)
      ? { count }
      : undefined;
  }
  const region = readProperty(root, target.region);
  const building = readProperty(region, target.id);
  return isRecord(building) ? building : undefined;
}

function readQueuedIds(
  root: unknown,
  candidates: readonly Readonly<CycleCandidate>[],
): ReadonlySet<string> {
  const queue = readProperty(root, "queue");
  if (!readProperty(queue, "display")) return new Set();
  const entries = readProperty(queue, "queue");
  if (!Array.isArray(entries)) return new Set();
  const byElementId = new Map(
    candidates.map((entry) => [entry.target.elementId, entry]),
  );
  const buyAny = Boolean(readProperty(readProperty(root, "settings"), "qAny"));
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = readProperty(entry, "id");
    if (typeof id === "string") {
      const candidate = byElementId.get(id);
      if (
        candidate !== undefined &&
        costFitsStorage(root, candidate.candidate.cost, {
          pool: candidate.candidate.pool,
        }) === true
      ) {
        ids.add(id);
      }
    }
    if (!buyAny) break;
  }
  return ids;
}

function readQueueLength(root: unknown): number {
  const entries = readProperty(readProperty(root, "queue"), "queue");
  return Array.isArray(entries) ? entries.length : 0;
}

export function createCapturedBuildSource(
  dependencies: CapturedBuildDependencies,
): ConstructionCandidateSource {
  const { rootState, controls, costs, readTargets } = dependencies;
  const reportSkipped = dependencies.onSkipped ?? (() => {});
  const reportDiagnostic = dependencies.onDiagnostic ?? (() => {});
  const reportActivity = dependencies.onActivity ?? (() => {});
  let cycle: ReadonlyMap<string, CycleCandidate> = new Map();
  let savingCycle: ReadonlyMap<string, CycleCandidate> = new Map();
  let nextSavingPrices = new Map<
    string,
    Readonly<{ count: number; cost: Readonly<Record<string, number>> }>
  >();
  let savingPrices: ReadonlyMap<
    string,
    Readonly<{ count: number; cost: Readonly<Record<string, number>> }>
  > = new Map();

  return Object.freeze({
    family: "buildings",

    finishCycle(): void {
      savingCycle = cycle;
      savingPrices = nextSavingPrices;
    },

    readSavingCost(candidate: Readonly<ConstructionCandidate>) {
      const previous = savingCycle.get(candidate.key);
      if (previous === undefined) return undefined;
      const settings = dependencies.readSettings?.();
      if (isRecord(settings)) {
        if (
          settings[`bat${candidate.key}`] === false ||
          settings["autoBuild"] === false
        )
          return null;
        if (settings[`bld_w_${candidate.key}`] === 0) return null;
      }
      const building = readBuilding(rootState.readRoot(), previous.target);
      if (building === undefined) return undefined;
      const count = Number(building["count"]);
      if (count >= previous.target.maximum) return null;
      if (count !== previous.count) {
        const next = savingPrices.get(candidate.key);
        return next?.count === count ? next.cost : undefined;
      }
      return candidate.cost;
    },

    beginCycle(): readonly Readonly<ConstructionCandidate>[] {
      nextSavingPrices = new Map();
      dependencies.ensureControls?.();
      const root = rootState.readRoot();
      const entries = new Map<string, CycleCandidate>();
      for (const target of readTargets()) {
        const building = readBuilding(root, target);
        if (building === undefined) {
          reportSkipped(target.key, "not present in game state");
          continue;
        }
        if (Number(building["count"]) >= target.maximum) continue;
        const price = costs.readCost(target.elementId);
        if (price === undefined) {
          reportSkipped(target.key, "cost unavailable");
          continue;
        }
        entries.set(target.key, {
          target,
          count: Number(building["count"]),
          candidate: Object.freeze({
            key: target.key,
            actionId: target.elementId,
            weighting: target.weighting,
            cost: price.cost,
            ignored: false,
            knowledge: target.knowledge ?? false,
            important: target.important,
            ...(price.pool === undefined ? {} : { pool: price.pool }),
            ...(target.consumption === undefined
              ? {}
              : { consumption: target.consumption }),
          }),
        });
      }
      const queued = readQueuedIds(root, [...entries.values()]);
      cycle = entries;
      return Object.freeze(
        [...entries.values()].map((entry) =>
          Object.freeze({
            ...entry.candidate,
            ignored: queued.has(entry.target.elementId),
          }),
        ),
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
          outcome: stale("stale-build-target", "build candidate list changed", {
            key,
          }),
          disposition: "stopped" as const,
          ...base,
        });
      }
      const handle = controls.resolve(candidate.target.elementId);
      if (handle === undefined) {
        // Never silently: a control the game has not built yet is a diagnosable gap, not a
        // locked feature.
        return Object.freeze({
          outcome: rejected(
            "build-control-missing",
            `no captured control for ${candidate.target.elementId}`,
          ),
          disposition: "stopped" as const,
          ...base,
        });
      }
      const rootBefore = rootState.readRoot();
      const before = Number(
        readProperty(readBuilding(rootBefore, candidate.target), "count"),
      );
      const queueBefore = readQueueLength(rootBefore);
      const candidateQueueBefore = readCapturedBuildQueueEntryCount(
        rootBefore,
        candidate.target.elementId,
      );
      const touch =
        readProperty(readProperty(rootBefore, "settings"), "touch") === true;
      reportDiagnostic(`build.execute.attempt ${key}`);
      reportDiagnostic(`build.execute.touch ${touch}`);
      reportDiagnostic(`build.execute.before ${before}`);
      reportDiagnostic(`build.execute.queueBefore ${queueBefore}`);
      const result = controls.invoke(handle, "action");
      reportDiagnostic(`build.execute.invokeOk ${result.ok}`);
      const rootAfter = rootState.readRoot();
      const after = Number(
        readProperty(readBuilding(rootAfter, candidate.target), "count"),
      );
      const queueAfter = readQueueLength(rootAfter);
      const candidateQueueAfter = readCapturedBuildQueueEntryCount(
        rootAfter,
        candidate.target.elementId,
      );
      const built = after > before;
      const grantAction = readCapturedGrantAction(candidate.target.elementId);
      const completedGrant =
        built &&
        grantAction !== undefined &&
        grantAction.legacyUnmanaged !== true;
      const queued =
        candidate.target.readCount === undefined &&
        candidateQueueAfter > candidateQueueBefore;
      reportDiagnostic(`build.execute.after ${after}`);
      reportDiagnostic(`build.execute.queueAfter ${queueAfter}`);
      reportDiagnostic(`build.execute.built ${built}`);
      reportDiagnostic(`build.execute.queued ${queued}`);
      reportDiagnostic(`build.execute.noop ${!built && !queued}`);
      if (!result.ok) {
        return Object.freeze({
          outcome:
            result.reason === "stale-control"
              ? stale("stale-build-control", result.detail ?? result.reason, {
                  key,
                })
              : rejected("build-click-failed", result.detail ?? result.reason),
          disposition: "stopped" as const,
          ...base,
        });
      }
      if (built) {
        if (after < candidate.target.maximum) {
          // Price one more copy while this is still the build phase. Demand can then read the
          // next-cycle price without touching the queue or recomputing construction weighting.
          const next = costs.readCost(candidate.target.elementId);
          if (next !== undefined && next.pool === candidate.candidate.pool) {
            nextSavingPrices.set(
              key,
              Object.freeze({ count: after, cost: next.cost }),
            );
          }
        }
        const label = readCapturedControlLabel(handle, candidate.target.id);
        reportActivity({
          message: `Built ${label} (${after})`,
          color: "success",
          tags: Object.freeze(["queue", "building_queue"]),
        });
      }
      // The game's own action reports nothing useful; the count it changed does.
      return Object.freeze({
        outcome: SUCCEEDED,
        clicked: built,
        mission: completedGrant,
        consumption: NO_CONSUMPTION,
        disposition:
          built || queued
            ? ("verified-success" as const)
            : ("invoked-but-unverified" as const),
      });
    },
  });
}
