/**
 * City construction as one family of the captured construction cycle.
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
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

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
  readonly resources: GameResourceSource;
  readonly readTargets: () => readonly Readonly<CapturedBuildTarget>[];
  /** Ensures the game has built the relevant action controls before target sampling. */
  readonly ensureControls?: () => void;
  /** Reports a candidate that could not be evaluated. It is dropped, never guessed at. */
  readonly onSkipped?: (key: string, reason: string) => void;
}

interface CycleCandidate {
  readonly target: Readonly<CapturedBuildTarget>;
  readonly candidate: Readonly<ConstructionCandidate>;
}

const NO_CONSUMPTION = Object.freeze([]);

function readBuilding(
  root: unknown,
  target: Readonly<CapturedBuildTarget>,
): Record<PropertyKey, unknown> | undefined {
  const region = readProperty(root, target.region);
  const building = readProperty(region, target.id);
  return isRecord(building) ? building : undefined;
}

function isMaximumAffordable(
  resources: GameResourceSource,
  cost: Readonly<Record<string, number>>,
): boolean {
  const sample = resources.readResources(Object.keys(cost));
  if (sample === undefined) return false;
  for (const [id, amount] of Object.entries(cost)) {
    if (amount <= 0) continue;
    const resource = sample.resources.get(id);
    if (resource === undefined) return false;
    if (resource.max >= 0 && resource.max < amount) return false;
  }
  return true;
}

function readQueuedIds(
  root: unknown,
  candidates: readonly Readonly<CycleCandidate>[],
  resources: GameResourceSource,
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
        isMaximumAffordable(resources, candidate.candidate.cost)
      ) {
        ids.add(id);
      }
    }
    if (!buyAny) break;
  }
  return ids;
}

export function createCapturedBuildSource(
  dependencies: CapturedBuildDependencies,
): ConstructionCandidateSource {
  const { rootState, controls, costs, resources, readTargets } = dependencies;
  const reportSkipped = dependencies.onSkipped ?? (() => {});
  let cycle: ReadonlyMap<string, CycleCandidate> = new Map();

  return Object.freeze({
    family: "city",

    beginCycle(): readonly Readonly<ConstructionCandidate>[] {
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
        const cost = costs.readCost(target.elementId);
        if (cost === undefined) {
          reportSkipped(target.key, "cost unavailable");
          continue;
        }
        entries.set(target.key, {
          target,
          candidate: Object.freeze({
            key: target.key,
            weighting: target.weighting,
            cost,
            ignored: false,
            knowledge: target.knowledge ?? false,
            important: target.important,
            ...(target.consumption === undefined
              ? {}
              : { consumption: target.consumption }),
          }),
        });
      }
      const queued = readQueuedIds(root, [...entries.values()], resources);
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
          ...base,
        });
      }
      const before = Number(
        readProperty(
          readBuilding(rootState.readRoot(), candidate.target),
          "count",
        ),
      );
      const result = controls.invoke(handle, "action");
      if (!result.ok) {
        return Object.freeze({
          outcome:
            result.reason === "stale-control"
              ? stale("stale-build-control", result.detail ?? result.reason, {
                  key,
                })
              : rejected("build-click-failed", result.detail ?? result.reason),
          ...base,
        });
      }
      const after = Number(
        readProperty(
          readBuilding(rootState.readRoot(), candidate.target),
          "count",
        ),
      );
      // The game's own action reports nothing useful; the count it changed does.
      return Object.freeze({
        outcome: SUCCEEDED,
        clicked: after > before,
        mission: false,
        consumption: NO_CONSUMPTION,
      });
    },
  });
}
