/**
 * Pure decision logic for the autoBuild command slice.
 *
 * The legacy loop interleaved live reads (affordability, cost conflicts,
 * resource levels) with clicks, and later iterations observed the results of
 * earlier clicks. The application runner therefore evaluates one candidate at
 * a time: each phase receives an explicit sample taken at the moment the
 * legacy code performed the same reads, and all cross-step memory (the
 * affordability cache, build-time estimations, used-consumption marks) lives
 * in an immutable BuildLoopState owned by these planners.
 */

export type BuildConsumptionMode = "perResource" | "unlimited" | "onePerTick";

export interface BuildCandidateView {
  /** Unique legacy `_vueBinding` identifier. */
  readonly key: string;
  readonly weighting: number;
  /** Cost per resource id; key order matches the legacy cost object. */
  readonly cost: Readonly<Record<string, number>>;
  /** Whether the candidate is a queued or trigger target this cycle. */
  readonly ignored: boolean;
}

export interface BuildCycleSetup {
  /** Managed buildings and projects sorted by weighting, highest first. */
  readonly candidates: readonly BuildCandidateView[];
  readonly consumptionMode: BuildConsumptionMode;
  readonly buildIfStorageFull: boolean;
  readonly ignoreZeroRate: boolean;
  /** prestigeType is whitehole and Soul Gem saving is enabled. */
  readonly saveWhiteholeGems: boolean;
}

export interface BuildConsumptionView {
  readonly resourceId: string;
  /** Legacy compared `c.rate >= 0`; support producers use negative rates. */
  readonly nonNegativeRate: boolean;
}

export interface BuildSampleRequest {
  readonly needAffordability: boolean;
  readonly needConsumption: boolean;
}

export interface BuildCandidateSample {
  /** Present when the request asked for affordability. */
  readonly affordable?: boolean;
  /** Present when the request asked for consumption rates. */
  readonly consumption?: readonly BuildConsumptionView[];
}

export interface BuildConflictView {
  /** Reservation data was unavailable; skip for safety with a fixed note. */
  readonly unavailable: boolean;
  readonly targetNames: readonly string[];
  readonly resourceNames: readonly string[];
  readonly targetCause: string;
}

export interface BuildConflictSample {
  readonly conflict: Readonly<BuildConflictView> | null;
  /** Legacy `building.is.important` bypasses queue/trigger conflicts. */
  readonly important: boolean;
}

export interface BuildResourceView {
  readonly unlocked: boolean;
  /**
   * Numeric fields use plain JS number coercion at the adapter boundary, so
   * lazily-initialized legacy fields arrive as NaN and fall through every
   * comparison exactly as they did in the legacy loop.
   */
  readonly currentQuantity: number;
  readonly rateOfChange: number;
  readonly storageRatio: number;
  readonly storageRequired: number;
}

export interface BuildCompetitionRequest {
  /** Higher-weighted competitors whose affordability is not cached yet. */
  readonly affordabilityKeys: readonly string[];
  /** Resources referenced by the candidate or any higher-weighted competitor. */
  readonly resourceIds: readonly string[];
}

export interface BuildCompetitionSample {
  readonly affordability: Readonly<Record<string, boolean>>;
  readonly resources: Readonly<Record<string, BuildResourceView>>;
}

export interface BuildEstimation {
  readonly perResource: Readonly<Record<string, number>>;
  readonly total: number;
}

export interface BuildLoopState {
  /** Legacy affordableCache; every key is reset to false after a click. */
  readonly affordable: Readonly<Record<string, boolean>>;
  /** Legacy estimatedTime; never invalidated within a cycle. */
  readonly estimations: Readonly<Record<string, BuildEstimation>>;
  /** Legacy consumptionsUsed marks by resource id. */
  readonly consumptionsUsed: Readonly<Record<string, true>>;
}

export type BuildAnnotation =
  | {
      readonly kind: "text";
      readonly index: number;
      readonly key: string;
      readonly text: string;
    }
  | {
      /** Competitor text is rendered by the executor from live title/name. */
      readonly kind: "competitor";
      readonly index: number;
      readonly key: string;
      readonly otherKey: string;
      readonly resourceId: string;
    };

export interface BuildClickDecision {
  readonly index: number;
  readonly key: string;
}

export type BuildSampleNeeds =
  | { readonly kind: "skip" }
  | { readonly kind: "evaluate"; readonly request: BuildSampleRequest };

export interface BuildGateResult {
  readonly kind: "skip" | "conflict-check";
  readonly state: BuildLoopState;
}

export type BuildConflictPlan =
  | { readonly kind: "proceed" }
  | { readonly kind: "skip"; readonly annotation: BuildAnnotation };

export type BuildCompetitionPlan = {
  readonly state: BuildLoopState;
} & (
  | { readonly kind: "build"; readonly decision: BuildClickDecision }
  | { readonly kind: "delay"; readonly annotation: BuildAnnotation }
);

export interface BuildClickReport {
  readonly clicked: boolean;
  /** Sampled after the click, matching the legacy post-click reads. */
  readonly mission: boolean;
  readonly consumption: readonly BuildConsumptionView[];
}

export interface BuildClickApplication {
  /** Stop the whole cycle (mission built, or whitehole Soul Gem saving). */
  readonly stop: boolean;
  readonly state: BuildLoopState;
}

const SKIP_NEEDS: BuildSampleNeeds = Object.freeze({ kind: "skip" });
const PROCEED: BuildConflictPlan = Object.freeze({ kind: "proceed" });

export function initialBuildLoopState(): BuildLoopState {
  return Object.freeze({
    affordable: Object.freeze({}),
    estimations: Object.freeze({}),
    consumptionsUsed: Object.freeze({}),
  });
}

function candidateAt(
  setup: Readonly<BuildCycleSetup>,
  index: number,
): BuildCandidateView {
  const candidate = setup.candidates[index];
  if (candidate === undefined) {
    throw new TypeError(`no build candidate at index ${index}`);
  }
  return candidate;
}

/** Decide which live reads the current candidate's gate phase requires. */
export function candidateSampleNeeds(
  setup: Readonly<BuildCycleSetup>,
  state: Readonly<BuildLoopState>,
  index: number,
): BuildSampleNeeds {
  const candidate = candidateAt(setup, index);
  // Legacy short-circuited on the ignore list before touching the cache.
  if (candidate.ignored) {
    return SKIP_NEEDS;
  }
  const cached = state.affordable[candidate.key];
  if (cached === false) {
    return SKIP_NEEDS;
  }
  return Object.freeze({
    kind: "evaluate",
    request: Object.freeze({
      needAffordability: cached === undefined,
      needConsumption:
        setup.consumptionMode === "perResource" &&
        Object.keys(state.consumptionsUsed).length > 0,
    }),
  });
}

function usesUsedConsumption(
  setup: Readonly<BuildCycleSetup>,
  state: Readonly<BuildLoopState>,
  sample: Readonly<BuildCandidateSample>,
): boolean {
  switch (setup.consumptionMode) {
    case "perResource":
      return (sample.consumption ?? []).some(
        (entry) =>
          entry.nonNegativeRate &&
          state.consumptionsUsed[entry.resourceId] === true,
      );
    case "unlimited":
      return false;
    // onePerTick (and any invalid override value) blocks every candidate once
    // any consumption was used, even candidates without consumption.
    case "onePerTick":
      return Object.keys(state.consumptionsUsed).length > 0;
  }
}

/** Affordability and used-consumption gates, in legacy order. */
export function planBuildGate(
  setup: Readonly<BuildCycleSetup>,
  index: number,
  sample: Readonly<BuildCandidateSample>,
  state: Readonly<BuildLoopState>,
): BuildGateResult {
  const candidate = candidateAt(setup, index);
  let nextState = state;
  let affordable = state.affordable[candidate.key];
  if (affordable === undefined) {
    if (sample.affordable === undefined) {
      throw new TypeError(
        `affordability sample missing for build candidate ${candidate.key}`,
      );
    }
    affordable = sample.affordable;
    nextState = Object.freeze({
      ...state,
      affordable: Object.freeze({
        ...state.affordable,
        [candidate.key]: affordable,
      }),
    });
  }
  if (!affordable || usesUsedConsumption(setup, state, sample)) {
    return Object.freeze({ kind: "skip", state: nextState });
  }
  return Object.freeze({ kind: "conflict-check", state: nextState });
}

function highlight(name: string): string {
  return `<span class="has-text-info">${name}</span>`;
}

/** Queue/trigger cost-conflict gate; important candidates bypass it. */
export function planBuildConflict(
  setup: Readonly<BuildCycleSetup>,
  index: number,
  sample: Readonly<BuildConflictSample>,
): BuildConflictPlan {
  const candidate = candidateAt(setup, index);
  if (sample.conflict === null || sample.important) {
    return PROCEED;
  }
  const conflict = sample.conflict;
  const text = conflict.unavailable
    ? "Cost reservation data unavailable; skipped for safety<br>"
    : `Conflicts with ${conflict.targetNames
        .map(highlight)
        .join(", ")} for ${conflict.resourceNames
        .map(highlight)
        .join(", ")} (${conflict.targetCause})<br>`;
  return Object.freeze({
    kind: "skip",
    annotation: Object.freeze({
      kind: "text",
      index,
      key: candidate.key,
      text,
    }),
  });
}

/**
 * Compute the exact live reads the competition phase may perform: candidates
 * with a higher weighting form a prefix of the sorted list, affordability is
 * only consulted below the 10x weighting ratio, and resource levels are read
 * for the candidate's cost plus every higher-weighted competitor's cost.
 */
export function competitionSampleRequest(
  setup: Readonly<BuildCycleSetup>,
  state: Readonly<BuildLoopState>,
  index: number,
): BuildCompetitionRequest {
  const candidate = candidateAt(setup, index);
  const affordabilityKeys: string[] = [];
  const resourceIds = new Set<string>(Object.keys(candidate.cost));
  for (const other of setup.candidates) {
    const weightDiffRatio = other.weighting / candidate.weighting;
    if (weightDiffRatio <= 1.000001) {
      break;
    }
    for (const resourceId of Object.keys(other.cost)) {
      resourceIds.add(resourceId);
    }
    if (weightDiffRatio < 10 && state.affordable[other.key] === undefined) {
      affordabilityKeys.push(other.key);
    }
  }
  return Object.freeze({
    affordabilityKeys: Object.freeze(affordabilityKeys),
    resourceIds: Object.freeze([...resourceIds]),
  });
}

function resourceViewOf(
  sample: Readonly<BuildCompetitionSample>,
  resourceId: string,
): BuildResourceView {
  const view = sample.resources[resourceId];
  if (view === undefined) {
    throw new TypeError(`resource sample missing for ${resourceId}`);
  }
  return view;
}

function estimateBuildTime(
  setup: Readonly<BuildCycleSetup>,
  other: Readonly<BuildCandidateView>,
  sample: Readonly<BuildCompetitionSample>,
): BuildEstimation {
  const perResource: Record<string, number> = {};
  for (const [resourceId, quantity] of Object.entries(other.cost)) {
    const resource = resourceViewOf(sample, resourceId);
    if (!resource.unlocked) {
      continue;
    }
    if (resource.rateOfChange > 0) {
      perResource[resourceId] =
        (quantity - resource.currentQuantity) / resource.rateOfChange;
    } else if (
      setup.ignoreZeroRate &&
      resource.storageRatio < 0.975 &&
      resource.currentQuantity < quantity
    ) {
      perResource[resourceId] = Number.MAX_SAFE_INTEGER;
    } else {
      // Not producing right now (craftables and such); assume availability.
      perResource[resourceId] = 0;
    }
  }
  return Object.freeze({
    perResource: Object.freeze(perResource),
    total: Math.max(0, ...Object.values(perResource)),
  });
}

/**
 * The legacy weighting-protection inner loop: delay the candidate when a
 * higher-weighted competitor is waiting for one of the same resources.
 */
export function planBuildCompetition(
  setup: Readonly<BuildCycleSetup>,
  index: number,
  sample: Readonly<BuildCompetitionSample>,
  state: Readonly<BuildLoopState>,
): BuildCompetitionPlan {
  const candidate = candidateAt(setup, index);
  // Most candidates do not add anything to either cache. Keep the immutable
  // records shared in that case, cloning only when this phase writes a value.
  let affordable: Readonly<Record<string, boolean>> = state.affordable;
  let estimations: Readonly<Record<string, BuildEstimation>> =
    state.estimations;
  let affordableCopy: Record<string, boolean> | undefined;
  let estimationsCopy: Record<string, BuildEstimation> | undefined;

  const cacheAffordable = (key: string, value: boolean) => {
    affordableCopy ??= { ...affordable };
    affordableCopy[key] = value;
    affordable = affordableCopy;
  };
  const cacheEstimation = (key: string, value: BuildEstimation) => {
    estimationsCopy ??= { ...estimations };
    estimationsCopy[key] = value;
    estimations = estimationsCopy;
  };

  const finish = (
    outcome:
      | { readonly kind: "build"; readonly decision: BuildClickDecision }
      | { readonly kind: "delay"; readonly annotation: BuildAnnotation },
  ): BuildCompetitionPlan =>
    Object.freeze({
      ...outcome,
      state: Object.freeze({
        affordable: Object.freeze(affordable),
        estimations: Object.freeze(estimations),
        consumptionsUsed: state.consumptionsUsed,
      }),
    });

  const build = () =>
    finish({
      kind: "build",
      decision: Object.freeze({ index, key: candidate.key }),
    });

  // With buildingBuildIfStorageFull, overflowing demanded resources skip the
  // weighting protection entirely.
  if (
    setup.buildIfStorageFull &&
    Object.keys(candidate.cost).some(
      (resourceId) => resourceViewOf(sample, resourceId).storageRatio > 0.98,
    )
  ) {
    return build();
  }

  for (const other of setup.candidates) {
    const weightDiffRatio = other.weighting / candidate.weighting;
    // Sorted by weighting: everything after this point weighs the same or less.
    if (weightDiffRatio <= 1.000001) {
      break;
    }
    // An affordable higher-weighted competitor was already processed and is
    // blocked by something else; ignore its demands below the 10x ratio.
    if (weightDiffRatio < 10) {
      let otherAffordable = affordable[other.key];
      if (otherAffordable === undefined) {
        const sampled = sample.affordability[other.key];
        if (sampled === undefined) {
          throw new TypeError(
            `affordability sample missing for competitor ${other.key}`,
          );
        }
        otherAffordable = sampled;
        cacheAffordable(other.key, otherAffordable);
      }
      if (otherAffordable) {
        continue;
      }
    }

    let estimation = estimations[other.key];
    if (estimation === undefined) {
      estimation = estimateBuildTime(setup, other, sample);
      cacheEstimation(other.key, estimation);
    }

    for (const [resourceId, thisQuantity] of Object.entries(candidate.cost)) {
      const resource = resourceViewOf(sample, resourceId);

      // Ignore locked and capped resources.
      if (
        !resource.unlocked ||
        (resource.storageRatio > 0.99 &&
          resource.currentQuantity >= resource.storageRequired)
      ) {
        continue;
      }
      const otherQuantity = other.cost[resourceId];
      if (otherQuantity === undefined) {
        continue;
      }
      // Enough for both; nothing to preserve.
      if (resource.currentQuantity >= otherQuantity + thisQuantity) {
        continue;
      }
      // Spending inside the competitor's bottleneck slack won't delay it - but
      // only once. The slack is projected from the competitor's wait on its
      // slowest resource, and every candidate on every tick is measured against
      // that same projection, so conceding it in full hands the whole of it out
      // repeatedly and the competitor is delayed forever. Measured on the
      // day-41,140 Matrix checkpoint: a weighting-1 Navigation Beacon was
      // allowed 146,958 Iridium of the weighting-300 Dwarf Shipyard's 250,000,
      // and the Shipyard was still unaffordable 8,000 game days later.
      //
      // Conceding a share inversely proportional to the weighting gap keeps the
      // rule's purpose - a cheap purchase that genuinely cannot matter still
      // goes ahead - while a candidate worth a fraction of the competitor can no
      // longer take a comparable bite out of it.
      //
      // A locked-at-estimation-time resource yields NaN, failing the check
      // exactly like the legacy `total - undefined` arithmetic.
      const perResource = estimation.perResource[resourceId];
      if (
        thisQuantity * weightDiffRatio <=
        (estimation.total - (perResource ?? Number.NaN)) * resource.rateOfChange
      ) {
        continue;
      }
      // Below the weighting threshold the cost gap is tolerated - but not on
      // the resource the competitor is actually waiting on. There the gap
      // argument is exactly backwards: the more the competitor needs, the more
      // freely everything else is allowed to take it, so a target costing more
      // than `weightDiffRatio` times its rivals can never be reached. Measured
      // on the day-41,140 Matrix checkpoint, this alone released every
      // weighting-100 Titanium consumer against the weighting-300 Dwarf
      // Shipyard (650,000 / 132,884 = 4.9 over a ratio of 3), every tick.
      //
      // A resource the competitor is not bottlenecked on keeps the tolerance,
      // so a disproportionately expensive target still cannot freeze everything
      // that merely shares one of its cheaper resources.
      if (perResource === undefined || perResource < estimation.total) {
        const costDiffRatio = otherQuantity / thisQuantity;
        if (costDiffRatio >= weightDiffRatio) {
          continue;
        }
      }
      return finish({
        kind: "delay",
        annotation: Object.freeze({
          kind: "competitor",
          index,
          key: candidate.key,
          otherKey: other.key,
          resourceId,
        }),
      });
    }
  }
  return build();
}

/** Post-click bookkeeping: early stop, consumption marks, cache reset. */
export function applyBuildClickResult(
  setup: Readonly<BuildCycleSetup>,
  index: number,
  report: Readonly<BuildClickReport>,
  state: Readonly<BuildLoopState>,
): BuildClickApplication {
  if (!report.clicked) {
    return Object.freeze({ stop: false, state });
  }
  const candidate = candidateAt(setup, index);
  // Missions tend to unlock new content; whitehole runs may protect Soul Gems.
  if (
    report.mission ||
    (candidate.cost["Soul_Gem"] !== undefined && setup.saveWhiteholeGems)
  ) {
    return Object.freeze({ stop: true, state });
  }
  const consumptionsUsed: Record<string, true> = { ...state.consumptionsUsed };
  for (const entry of report.consumption) {
    if (entry.nonNegativeRate) {
      consumptionsUsed[entry.resourceId] = true;
    }
  }
  // Everything already sampled is treated as unaffordable for the rest of the
  // cycle, so processed candidates won't reappear as competitors.
  const affordable: Record<string, boolean> = {};
  for (const key of Object.keys(state.affordable)) {
    affordable[key] = false;
  }
  return Object.freeze({
    stop: false,
    state: Object.freeze({
      affordable: Object.freeze(affordable),
      estimations: state.estimations,
      consumptionsUsed: Object.freeze(consumptionsUsed),
    }),
  });
}
