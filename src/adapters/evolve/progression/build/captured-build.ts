/**
 * The first vertical slice on the captured page surface: city construction, decided by the
 * existing pure build planners and executed through one captured game method.
 *
 * Everything here comes from the page capture — the live root for counts and resources, the game's
 * own cost code for prices, the game's own `action()` closure for the purchase. Nothing reads
 * `window.evolve`, and nothing asks whether a panel is rendered: a captured control keeps working
 * after its tab is torn down, which is the whole point of the slice.
 *
 * What this slice deliberately does not model yet, and why it is safe to leave out rather than
 * approximate:
 *
 * - **Weighting** is the caller's configured per-building weighting, not the dynamic weighting
 *   engine. The engine is a separate port of its own; the planners only need a total order.
 * - **Cost conflicts** cover the player’s build queue only. Trigger, purchase, and challenge
 *   reservations are still script-side commitments this slice does not read, so a candidate can
 *   pass the gate on a reservation the compatibility runtime would have raised.
 * - **Consumption** is reported as empty, so the per-tick consumption gate never fires. The
 *   support/upkeep catalog it reads is script-side and not part of this slice.
 * - **`storageRequired`** is 0. It is only read as "this resource is capped and nothing is saving
 *   it for storage", and a capped resource is genuinely not contended.
 * - **Knowledge-cap gating** is off (`knowledge: false`, zero gate levels), so the Knowledge
 *   branch of the conflict planner stays inert rather than guessing which buildings raise the cap.
 */

import type {
  BuildAnnotation,
  BuildCandidateSample,
  BuildCandidateView,
  BuildClickDecision,
  BuildCompetitionRequest,
  BuildCompetitionSample,
  BuildConflictSample,
  BuildConsumptionMode,
  BuildCycleSetup,
  BuildResourceView,
  BuildSampleRequest,
} from "../../../../domain/progression/build/build.ts";
import type {
  BuildClickResult,
  BuildExecutor,
  BuildReader,
} from "../../../../ports/build.ts";
import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { CapturedCostConflictReader } from "../../captured-cost-conflict.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type { ResourceView } from "../../../../domain/game-world.ts";
import { canAfford, resourceView } from "../../../../domain/game-world.ts";
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
  /** The caller’s "build this regardless" setting; it bypasses the cost-conflict gate. */
  readonly important: boolean;
}

export interface CapturedBuildPolicy {
  readonly targets: readonly CapturedBuildTarget[];
  /** Whether an existing commitment holds its resources back from these builds. */
  readonly respectReservations: boolean;
  readonly consumptionMode: BuildConsumptionMode;
  readonly buildIfStorageFull: boolean;
  readonly ignoreZeroRate: boolean;
}

export interface CapturedBuildDependencies {
  readonly rootState: GameRootStateSource;
  readonly resources: GameResourceSource;
  readonly conflicts: CapturedCostConflictReader;
  readonly controls: GameControlRegistry;
  readonly costs: GameActionCostReader;
  readonly readPolicy: () => CapturedBuildPolicy;
  /** Reports a candidate that could not be evaluated. It is dropped, never guessed at. */
  readonly onSkipped?: (key: string, reason: string) => void;
}

export interface CapturedBuildAdapter {
  readonly reader: BuildReader;
  readonly executor: BuildExecutor;
}

interface CycleCandidate {
  readonly target: CapturedBuildTarget;
  readonly view: BuildCandidateView;
}

const NO_CONSUMPTION = Object.freeze([]);
const NO_CONFLICT: BuildConflictSample = Object.freeze({
  conflict: null,
  important: false,
});
const ZERO_KNOWLEDGE_GATE = Object.freeze({
  cheapestTechKnowledge: 0,
  knowledgeRequiredByBuildTargets: 0,
  knowledgeCapacity: 0,
});

function readBuilding(
  root: unknown,
  target: Readonly<CapturedBuildTarget>,
): Record<PropertyKey, unknown> | undefined {
  const region = readProperty(root, target.region);
  const building = readProperty(region, target.id);
  return isRecord(building) ? building : undefined;
}

function readQueuedIds(root: unknown): ReadonlySet<string> {
  const entries = readProperty(readProperty(root, "queue"), "queue");
  if (!Array.isArray(entries)) return new Set();
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = readProperty(entry, "id");
    if (typeof id === "string") ids.add(id);
  }
  return ids;
}

/** A cost key that names no stored resource (`Morale`, `Army`) has nothing to report. */
const LOCKED_BUILD_RESOURCE: BuildResourceView = Object.freeze({
  unlocked: false,
  currentQuantity: 0,
  rateOfChange: 0,
  storageRatio: 0,
  storageRequired: 0,
});

function toBuildResourceView(view: Readonly<ResourceView>): BuildResourceView {
  return Object.freeze({
    unlocked: view.unlocked,
    currentQuantity: view.amount,
    rateOfChange: view.rateOfChange,
    storageRatio: view.storageRatio,
    storageRequired: 0,
  });
}

export function createCapturedBuildAdapter(
  dependencies: CapturedBuildDependencies,
): CapturedBuildAdapter {
  const { rootState, resources, conflicts, controls, costs, readPolicy } =
    dependencies;
  const reportSkipped = dependencies.onSkipped ?? (() => {});
  let cycle: readonly CycleCandidate[] | null = null;

  function candidateAt(index: number): CycleCandidate | null {
    if (cycle === null) return null;
    return cycle[index] ?? null;
  }

  function candidateFor(index: number, key: string): CycleCandidate | null {
    const candidate = candidateAt(index);
    return candidate !== null && candidate.view.key === key ? candidate : null;
  }

  /**
   * Affordable means the game's own prices are covered by what the game says is held, sampled for
   * exactly the cost keys in question. Before the root is captured there are no holdings to
   * compare against, so nothing is affordable.
   */
  function affordable(cost: Readonly<Record<string, number>>): boolean {
    const sample = resources.readResources(Object.keys(cost));
    return sample !== undefined && canAfford(sample, cost);
  }

  const reader: BuildReader = Object.freeze({
    beginCycle(): BuildCycleSetup {
      const policy = readPolicy();
      const root = rootState.readRoot();
      const queued = readQueuedIds(root);
      const entries: CycleCandidate[] = [];
      for (const target of policy.targets) {
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
        entries.push({
          target,
          view: Object.freeze({
            key: target.key,
            weighting: target.weighting,
            cost,
            ignored: queued.has(target.elementId),
            knowledge: false,
          }),
        });
      }
      // Highest weighting first; a stable sort keeps the caller's order on ties.
      entries.sort((a, b) => b.view.weighting - a.view.weighting);
      cycle = Object.freeze(entries);
      return Object.freeze({
        candidates: Object.freeze(entries.map((entry) => entry.view)),
        consumptionMode: policy.consumptionMode,
        buildIfStorageFull: policy.buildIfStorageFull,
        ignoreZeroRate: policy.ignoreZeroRate,
        saveWhiteholeGems: false,
        knowledgeGate: ZERO_KNOWLEDGE_GATE,
      });
    },

    sampleCandidate(
      index: number,
      request: Readonly<BuildSampleRequest>,
    ): BuildCandidateSample {
      const candidate = candidateAt(index);
      if (candidate === null) {
        throw new TypeError(`no build candidate at index ${index}`);
      }
      const sample: {
        affordable?: boolean;
        consumption?: readonly never[];
      } = {};
      if (request.needAffordability) {
        sample.affordable = affordable(candidate.view.cost);
      }
      if (request.needConsumption) {
        sample.consumption = NO_CONSUMPTION;
      }
      return Object.freeze(sample);
    },

    sampleConflict(index: number): BuildConflictSample {
      const candidate = candidateAt(index);
      if (candidate === null) {
        throw new TypeError(`no build candidate at index ${index}`);
      }
      const important = candidate.target.important;
      if (!readPolicy().respectReservations) {
        return Object.freeze({ conflict: null, important });
      }
      const evaluated = conflicts.evaluate(candidate.view.cost);
      if (evaluated.status === "none") return NO_CONFLICT;
      if (evaluated.status === "unavailable") {
        // Something is saving and the reservation could not be priced. Skipping on incomplete
        // data is the safe half of the trade; spending is not recoverable.
        return Object.freeze({
          conflict: Object.freeze({
            unavailable: true,
            targetNames: Object.freeze([]),
            resourceNames: Object.freeze([]),
            targetCause: "",
          }),
          important,
        });
      }
      return Object.freeze({
        conflict: Object.freeze({
          unavailable: false,
          targetNames: evaluated.conflict.targetNames,
          resourceNames: evaluated.conflict.resourceNames,
          targetCause: evaluated.conflict.targetCause,
        }),
        important,
      });
    },

    sampleCompetition(
      index: number,
      request: Readonly<BuildCompetitionRequest>,
    ): BuildCompetitionSample {
      if (candidateAt(index) === null) {
        throw new TypeError(`no build candidate at index ${index}`);
      }
      const byKey = new Map(
        (cycle ?? []).map((entry) => [entry.view.key, entry.view] as const),
      );
      // One sample covers every resource the request asks about and every resource the compared
      // costs name, so the competition arithmetic reads one consistent set of holdings.
      const wanted = new Set<string>(request.resourceIds);
      const compared: {
        readonly key: string;
        readonly cost: Readonly<Record<string, number>>;
      }[] = [];
      for (const key of request.affordabilityKeys) {
        const other = byKey.get(key);
        if (other === undefined) {
          throw new TypeError(`unknown build candidate ${key}`);
        }
        compared.push({ key, cost: other.cost });
        for (const id of Object.keys(other.cost)) wanted.add(id);
      }
      const sample = resources.readResources(wanted);
      const affordability: Record<string, boolean> = {};
      for (const entry of compared) {
        affordability[entry.key] =
          sample !== undefined && canAfford(sample, entry.cost);
      }
      const resourceViews: Record<string, BuildResourceView> = {};
      for (const id of request.resourceIds) {
        resourceViews[id] =
          sample === undefined
            ? LOCKED_BUILD_RESOURCE
            : toBuildResourceView(resourceView(sample, id));
      }
      return Object.freeze({
        affordability: Object.freeze(affordability),
        resources: Object.freeze(resourceViews),
      });
    },
  });

  const executor: BuildExecutor = Object.freeze({
    annotate(annotation: Readonly<BuildAnnotation>) {
      // Annotations are tooltip text on a rendered panel. The slice runs with the panel torn
      // down, so a delay is a decision that simply produced no purchase.
      return candidateFor(annotation.index, annotation.key) === null
        ? stale("stale-build-target", "build candidate list changed", {
            key: annotation.key,
            index: annotation.index,
          })
        : SUCCEEDED;
    },

    executeClick(decision: Readonly<BuildClickDecision>): BuildClickResult {
      const candidate = candidateFor(decision.index, decision.key);
      if (candidate === null) {
        return Object.freeze({
          outcome: stale("stale-build-target", "build candidate list changed", {
            key: decision.key,
            index: decision.index,
          }),
          clicked: false,
          mission: false,
          consumption: NO_CONSUMPTION,
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
          clicked: false,
          mission: false,
          consumption: NO_CONSUMPTION,
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
                  key: decision.key,
                })
              : rejected("build-click-failed", result.detail ?? result.reason),
          clicked: false,
          mission: false,
          consumption: NO_CONSUMPTION,
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

  return Object.freeze({ reader, executor });
}
