/**
 * The one construction cycle on the captured page surface: several families in, one weighting
 * order out, decided by the existing pure build planners.
 *
 * Each family says what it offers and how it buys. Everything a candidate is judged by —
 * affordability, cost conflicts, resource competition — is asked here, over one live sample, so a
 * building and a project compete against each other exactly as two buildings do.
 *
 * Optional script-derived inputs stay explicit at this boundary: managed candidates may carry
 * validated consumption entries, storage requirements may be supplied by the storage planner, and
 * Knowledge-cap requirements may be supplied by the Knowledge gate reader. If a caller omits one,
 * the cycle leaves that gate unknown rather than guessing from the upstream root.
 */

import type {
  BuildConsumptionView,
  BuildAnnotation,
  BuildCandidateSample,
  BuildClickDecision,
  BuildCompetitionRequest,
  BuildCompetitionSample,
  BuildConflictSample,
  BuildCycleSetup,
  BuildResourceView,
  BuildResourceScope,
  BuildSampleRequest,
} from "../../../../domain/progression/build/build.ts";
import { resourceView } from "../../../../domain/game-world.ts";
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
import type {
  SavingTarget,
  ConstructionObservations,
} from "../../../../ports/game-construction-observations.ts";
import type { KnowledgeGateLevels } from "../../../../domain/progression/build/building-weighting.ts";
import { stale, SUCCEEDED } from "../../../command-outcomes.ts";
import type { CapturedCostConflictReader } from "../../captured-cost-conflict.ts";
import { costFitsNow, costFitsStorage } from "../../captured-affordability.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";

export interface CapturedConstructionDependencies {
  /** Families in the order they break weighting ties, matching the game's own list order. */
  readonly sources: readonly ConstructionCandidateSource[];
  readonly resources: GameResourceSource;
  readonly rootState: GameRootStateSource;
  readonly conflicts: CapturedCostConflictReader;
  readonly readOptions: () => ConstructionCycleOptions;
  /** Optional script-computed Knowledge requirements; absent means no gate is applied. */
  readonly readKnowledgeGate?: () => KnowledgeGateLevels;
  /** Script storage-planner values; missing ids remain unknown rather than treated as capped. */
  readonly readStorageRequired?: (
    resourceIds: readonly string[],
  ) => Readonly<Record<string, number>> | undefined;
}

export interface CapturedConstructionAdapter {
  readonly reader: BuildReader;
  readonly executor: BuildExecutor;
  /**
   * What the last cycle turned out to be saving for. It is a by-product of the affordability the
   * cycle already sampled, in the same weighting order, so it costs nothing extra to observe.
   */
  readonly observations: ConstructionObservations;
}

interface CycleEntry {
  readonly candidate: Readonly<ConstructionCandidate>;
  readonly source: ConstructionCandidateSource;
}

const NO_CONSUMPTION: readonly Readonly<BuildConsumptionView>[] = Object.freeze(
  [],
);
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
  storageRequired: Number.NaN,
});

function toBuildResourceView(
  view: Readonly<ResourceView>,
  storageRequired: number,
): BuildResourceView {
  return Object.freeze({
    unlocked: view.unlocked,
    currentQuantity: view.amount,
    rateOfChange: view.rateOfChange,
    storageRatio: view.storageRatio,
    storageRequired,
  });
}

export function createCapturedConstructionAdapter(
  dependencies: CapturedConstructionDependencies,
): CapturedConstructionAdapter {
  const { sources, resources, rootState, conflicts, readOptions } =
    dependencies;
  const readKnowledgeGate = dependencies.readKnowledgeGate;
  const readStorageRequired = dependencies.readStorageRequired;
  let cycle: readonly CycleEntry[] = Object.freeze([]);
  let respectReservations = true;
  let savingTarget: SavingTarget | null = null;
  let cycleSavingTarget: SavingTarget | null = null;
  let knowledgeRequirement = 0;

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
  function affordable(candidate: Readonly<ConstructionCandidate>): boolean {
    const root = rootState.readRoot();
    if (
      root !== undefined &&
      costFitsNow(root, candidate.cost, { pool: candidate.pool }) === true
    ) {
      return true;
    }
    // The first candidate of the cycle that is wanted, storable and unaffordable is the one the
    // cycle is saving for. A cost storage can never hold is not something to save for.
    if (
      root !== undefined &&
      cycleSavingTarget === null &&
      costFitsStorage(root, candidate.cost, {
        pool: candidate.pool,
        zeroCapIsCeiling: false,
      }) !== false
    ) {
      cycleSavingTarget = Object.freeze({
        name: candidate.key,
        ...(candidate.pool === undefined ? {} : { pool: candidate.pool }),
        cost: Object.freeze({ ...candidate.cost }),
      });
    }
    return false;
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
      // The finished cycle's judgement stays readable while the new one is still being sampled.
      savingTarget = cycleSavingTarget;
      cycleSavingTarget = null;
      // The Knowledge requirement needs only the sorted list, so it describes this cycle. Only the
      // highest-weighted candidate that does not itself raise the cap counts: a Knowledge building
      // is the answer to a capacity shortage, not evidence of one.
      knowledgeRequirement = 0;
      for (const entry of entries) {
        if (entry.candidate.knowledge) continue;
        const cost = entry.candidate.cost["Knowledge"];
        knowledgeRequirement =
          typeof cost === "number" && Number.isFinite(cost) ? cost : 0;
        break;
      }
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
        consumption?: readonly Readonly<BuildConsumptionView>[];
      } = {};
      if (request.needAffordability) {
        sample.affordable = affordable(candidate);
      }
      if (request.needConsumption) {
        sample.consumption = candidate.consumption ?? NO_CONSUMPTION;
      }
      return Object.freeze(sample);
    },

    sampleConflict(index: number): BuildConflictSample {
      const { candidate } = entryAt(index);
      const important = candidate.important;
      if (!respectReservations) {
        return Object.freeze({ conflict: null, important });
      }
      const evaluated = conflicts.evaluate(candidate.cost, candidate.pool);
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
        cycle.map((entry) => [entry.candidate.key, entry.candidate]),
      );
      const compared: {
        readonly key: string;
        readonly candidate: Readonly<ConstructionCandidate>;
      }[] = [];
      for (const key of request.affordabilityKeys) {
        const candidate = byKey.get(key);
        if (candidate === undefined) {
          throw new TypeError(`unknown construction candidate ${key}`);
        }
        compared.push({ key, candidate });
      }
      const storageRequired = readStorageRequired?.(request.resourceIds);
      const affordability: Record<string, boolean> = {};
      const root = rootState.readRoot();
      for (const entry of compared) {
        affordability[entry.key] =
          root !== undefined &&
          costFitsNow(root, entry.candidate.cost, {
            pool: entry.candidate.pool,
          }) === true;
      }
      const resourceViews: Record<string, BuildResourceView> = {};
      const scopedResources: {
        readonly resourceId: string;
        readonly pool?: string;
        readonly view: BuildResourceView;
      }[] = [];
      const scopes: readonly BuildResourceScope[] =
        request.resourceScopes.length > 0
          ? request.resourceScopes
          : Object.freeze(
              request.resourceIds.map((resourceId) =>
                Object.freeze({ resourceId }),
              ),
            );
      const scopesByPool = new Map<string | undefined, string[]>();
      for (const scope of scopes) {
        const ids = scopesByPool.get(scope.pool);
        if (ids === undefined) scopesByPool.set(scope.pool, [scope.resourceId]);
        else if (!ids.includes(scope.resourceId)) ids.push(scope.resourceId);
      }
      for (const [pool, ids] of scopesByPool) {
        const sample = resources.readResources(
          ids,
          pool === undefined ? undefined : { pool },
        );
        for (const id of ids) {
          const view =
            sample === undefined
              ? LOCKED_RESOURCE
              : toBuildResourceView(
                  resourceView(sample, id),
                  storageRequired?.[id] ?? Number.NaN,
                );
          scopedResources.push({
            resourceId: id,
            ...(pool === undefined ? {} : { pool }),
            view,
          });
          if (pool === undefined) resourceViews[id] = view;
        }
      }
      return Object.freeze({
        affordability: Object.freeze(affordability),
        resources: Object.freeze(resourceViews),
        scopedResources: Object.freeze(scopedResources),
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

  return Object.freeze({
    reader,
    executor,
    observations: Object.freeze({
      readSavingTarget: (): SavingTarget | null => savingTarget,
      readKnowledgeRequirement: (): number => knowledgeRequirement,
    }),
  });
}
