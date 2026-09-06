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
 * - **Cost conflicts** are reported as absent. Queue and trigger reservations live in the
 *   compatibility runtime, and inventing a reservation here would delay builds for reasons no
 *   policy decided.
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
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
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
}

export interface CapturedBuildPolicy {
  readonly targets: readonly CapturedBuildTarget[];
  readonly consumptionMode: BuildConsumptionMode;
  readonly buildIfStorageFull: boolean;
  readonly ignoreZeroRate: boolean;
}

export interface CapturedBuildDependencies {
  readonly rootState: GameRootStateSource;
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

function resourceView(root: unknown, resourceId: string): BuildResourceView {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  if (!isRecord(resource)) {
    // An unknown cost key is not a stored resource (`Morale`, `Army`, and friends). Reporting it
    // as locked keeps it out of the competition arithmetic instead of feeding it NaN.
    return Object.freeze({
      unlocked: false,
      currentQuantity: 0,
      rateOfChange: 0,
      storageRatio: 0,
      storageRequired: 0,
    });
  }
  const amount = Number(resource["amount"]);
  const max = Number(resource["max"]);
  return Object.freeze({
    unlocked: Boolean(resource["display"]),
    currentQuantity: amount,
    rateOfChange: Number(resource["diff"]),
    // The game stores an uncapped resource as max -1; it is never near its ceiling.
    storageRatio: max > 0 ? amount / max : 0,
    storageRequired: 0,
  });
}

/**
 * Affordable means the game's own prices are covered by what the game says is held. A cost key
 * that names no stored resource cannot be checked here, and the candidate is reported as not
 * affordable rather than bought on an assumption.
 */
function isAffordable(
  root: unknown,
  cost: Readonly<Record<string, number>>,
): boolean {
  for (const [resourceId, amount] of Object.entries(cost)) {
    if (amount <= 0) continue;
    const resource = readProperty(readProperty(root, "resource"), resourceId);
    if (!isRecord(resource)) return false;
    if (!(Number(resource["amount"]) >= amount)) return false;
  }
  return true;
}

export function createCapturedBuildAdapter(
  dependencies: CapturedBuildDependencies,
): CapturedBuildAdapter {
  const { rootState, controls, costs, readPolicy } = dependencies;
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
        sample.affordable = isAffordable(
          rootState.readRoot(),
          candidate.view.cost,
        );
      }
      if (request.needConsumption) {
        sample.consumption = NO_CONSUMPTION;
      }
      return Object.freeze(sample);
    },

    sampleConflict(): BuildConflictSample {
      return NO_CONFLICT;
    },

    sampleCompetition(
      index: number,
      request: Readonly<BuildCompetitionRequest>,
    ): BuildCompetitionSample {
      if (candidateAt(index) === null) {
        throw new TypeError(`no build candidate at index ${index}`);
      }
      const root = rootState.readRoot();
      const byKey = new Map(
        (cycle ?? []).map((entry) => [entry.view.key, entry.view] as const),
      );
      const affordability: Record<string, boolean> = {};
      for (const key of request.affordabilityKeys) {
        const other = byKey.get(key);
        if (other === undefined) {
          throw new TypeError(`unknown build candidate ${key}`);
        }
        affordability[key] = isAffordable(root, other.cost);
      }
      const resources: Record<string, BuildResourceView> = {};
      for (const resourceId of request.resourceIds) {
        resources[resourceId] = resourceView(root, resourceId);
      }
      return Object.freeze({
        affordability: Object.freeze(affordability),
        resources: Object.freeze(resources),
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
