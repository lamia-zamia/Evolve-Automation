/**
 * The one construction cycle on the captured page surface: several families in, one weighting
 * order out, decided by the existing pure build planners.
 *
 * Each family says what it offers and how it buys. Everything a candidate is judged by —
 * affordability, cost conflicts, resource competition — is asked here, over one live sample, so a
 * building and a project compete against each other exactly as two buildings do.
 *
 * What this cycle deliberately does not model yet, and why it is safe to leave out rather than
 * approximate:
 *
 * - **Consumption** is reported as empty, so the per-tick consumption gate never fires. The
 *   support/upkeep catalog it reads is script-side and not part of the captured surface.
 * - **`storageRequired`** is 0. It is only read as "this resource is capped and nothing is saving
 *   it for storage", and a capped resource is genuinely not contended.
 * - **Knowledge-cap gating** is off (zero gate levels), so the Knowledge branch of the conflict
 *   planner stays inert rather than guessing which buildings raise the cap.
 */

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
import { canAfford, resourceView } from "../../../../domain/game-world.ts";
import type { ResourceView } from "../../../../domain/game-world.ts";
import type {
  BuildClickResult,
  BuildExecutor,
  BuildReader,
} from "../../../../ports/build.ts";
import type {
  ConstructionCandidate,
  ConstructionCandidateSource,
  ConstructionCycleOptions,
} from "../../../../ports/construction-candidates.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type { KnowledgeGateLevels } from "../../../../domain/progression/build/building-weighting.ts";
import { stale, SUCCEEDED } from "../../../command-outcomes.ts";
import type { CapturedCostConflictReader } from "../../captured-cost-conflict.ts";

export interface CapturedConstructionDependencies {
  /** Families in the order they break weighting ties, matching the game's own list order. */
  readonly sources: readonly ConstructionCandidateSource[];
  readonly resources: GameResourceSource;
  readonly conflicts: CapturedCostConflictReader;
  readonly readOptions: () => ConstructionCycleOptions;
  /** Optional script-computed Knowledge requirements; absent means no gate is applied. */
  readonly readKnowledgeGate?: () => KnowledgeGateLevels;
}

export interface CapturedConstructionAdapter {
  readonly reader: BuildReader;
  readonly executor: BuildExecutor;
}

interface CycleEntry {
  readonly candidate: Readonly<ConstructionCandidate>;
  readonly source: ConstructionCandidateSource;
}

const NO_CONSUMPTION = Object.freeze([]);
const ZERO_KNOWLEDGE_GATE = Object.freeze({
  cheapestTechKnowledge: 0,
  knowledgeRequiredByBuildTargets: 0,
  knowledgeCapacity: 0,
});

/** A cost key that names no stored resource (`Morale`, `Army`) has nothing to report. */
const LOCKED_RESOURCE: BuildResourceView = Object.freeze({
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

export function createCapturedConstructionAdapter(
  dependencies: CapturedConstructionDependencies,
): CapturedConstructionAdapter {
  const { sources, resources, conflicts, readOptions } = dependencies;
  const readKnowledgeGate = dependencies.readKnowledgeGate;
  let cycle: readonly CycleEntry[] = Object.freeze([]);
  let respectReservations = true;

  function entryAt(index: number): CycleEntry {
    const entry = cycle[index];
    if (entry === undefined) {
      throw new TypeError(`no construction candidate at index ${index}`);
    }
    return entry;
  }

  function entryFor(index: number, key: string): CycleEntry | null {
    const entry = cycle[index];
    return entry !== undefined && entry.candidate.key === key ? entry : null;
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
      const options = readOptions();
      respectReservations = options.respectReservations;
      const entries: CycleEntry[] = [];
      const owners = new Map<string, string>();
      for (const source of sources) {
        for (const candidate of source.beginCycle()) {
          const owner = owners.get(candidate.key);
          if (owner !== undefined) {
            throw new TypeError(
              `${source.family} and ${owner} both offer construction candidate ${candidate.key}`,
            );
          }
          owners.set(candidate.key, source.family);
          entries.push({ candidate, source });
        }
      }
      // Highest weighting first; a stable sort keeps each family's own order, and the order the
      // families were given in, on ties.
      entries.sort((a, b) => b.candidate.weighting - a.candidate.weighting);
      cycle = Object.freeze(entries);
      return Object.freeze({
        candidates: Object.freeze(entries.map((entry) => entry.candidate)),
        consumptionMode: options.consumptionMode,
        buildIfStorageFull: options.buildIfStorageFull,
        ignoreZeroRate: options.ignoreZeroRate,
        saveWhiteholeGems: options.saveWhiteholeGems,
        knowledgeGate: readKnowledgeGate?.() ?? ZERO_KNOWLEDGE_GATE,
      });
    },

    sampleCandidate(
      index: number,
      request: Readonly<BuildSampleRequest>,
    ): BuildCandidateSample {
      const { candidate } = entryAt(index);
      const sample: {
        affordable?: boolean;
        consumption?: readonly never[];
      } = {};
      if (request.needAffordability) {
        sample.affordable = affordable(candidate.cost);
      }
      if (request.needConsumption) {
        sample.consumption = NO_CONSUMPTION;
      }
      return Object.freeze(sample);
    },

    sampleConflict(index: number): BuildConflictSample {
      const { candidate } = entryAt(index);
      const important = candidate.important;
      if (!respectReservations) {
        return Object.freeze({ conflict: null, important });
      }
      const evaluated = conflicts.evaluate(candidate.cost);
      if (evaluated.status === "none") {
        return Object.freeze({ conflict: null, important });
      }
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
      entryAt(index);
      const byKey = new Map(
        cycle.map((entry) => [entry.candidate.key, entry.candidate.cost]),
      );
      // One sample covers every resource the request asks about and every resource the compared
      // costs name, so the competition arithmetic reads one consistent set of holdings.
      const wanted = new Set<string>(request.resourceIds);
      const compared: {
        readonly key: string;
        readonly cost: Readonly<Record<string, number>>;
      }[] = [];
      for (const key of request.affordabilityKeys) {
        const cost = byKey.get(key);
        if (cost === undefined) {
          throw new TypeError(`unknown construction candidate ${key}`);
        }
        compared.push({ key, cost });
        for (const id of Object.keys(cost)) wanted.add(id);
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
            ? LOCKED_RESOURCE
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
      // Annotations are tooltip text on a rendered panel. The cycle runs with the panel torn
      // down, so a delay is a decision that simply produced no purchase.
      return entryFor(annotation.index, annotation.key) === null
        ? stale(
            "stale-construction-target",
            "construction candidate list changed",
            { key: annotation.key, index: annotation.index },
          )
        : SUCCEEDED;
    },

    executeClick(decision: Readonly<BuildClickDecision>): BuildClickResult {
      const entry = entryFor(decision.index, decision.key);
      if (entry === null) {
        return Object.freeze({
          outcome: stale(
            "stale-construction-target",
            "construction candidate list changed",
            { key: decision.key, index: decision.index },
          ),
          clicked: false,
          mission: false,
          consumption: NO_CONSUMPTION,
        });
      }
      return entry.source.execute(decision.key);
    },
  });

  return Object.freeze({ reader, executor });
}
