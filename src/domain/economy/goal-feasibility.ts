/** Generic constant-rate feasibility projections for quantified goal requirements. */

export type FeasibilityStatus =
  "feasible" | "infeasible" | "uncertain" | "unavailable";

export interface GoalResourceNeed {
  readonly resourceId: string;
  readonly poolId: string;
  readonly amount: number;
}

export interface GoalResourceStock {
  readonly resourceId: string;
  readonly poolId: string;
  readonly amount: number;
  /** A negative capacity is the upstream unlimited-capacity sentinel. */
  readonly capacity: number;
  readonly netRate: number;
  /** `observed` means a single native sample; `stable` is a characterized projection rate. */
  readonly rateConfidence: "stable" | "observed";
  readonly validityEpoch: string;
}

export interface GoalResourceCommitment {
  readonly resourceId: string;
  readonly poolId: string;
  readonly amount: number;
}

export interface GoalResourceShortfall extends GoalResourceNeed {
  readonly availableStock?: number;
  readonly shortfall?: number;
  readonly timeToRequirement?: number;
  readonly status: FeasibilityStatus;
  readonly constraints: readonly string[];
}

export interface GoalFeasibility {
  readonly status: FeasibilityStatus;
  /** Parallel requirements complete at the slowest resource, not their summed ETAs. */
  readonly estimatedTime: number | undefined;
  readonly unmetRequirements: readonly GoalResourceShortfall[];
  readonly limitingConstraints: readonly string[];
  readonly assumptions: readonly string[];
  readonly validityEpoch: string;
  readonly reasons: readonly string[];
}

export interface GoalProductionChange {
  readonly resourceId: string;
  readonly poolId: string;
  readonly netRateDelta: number;
  readonly capacityDelta?: number;
}

export interface GoalStrategyCandidate {
  readonly id: string;
  readonly goalId: string;
  readonly preconditions: Readonly<{
    readonly satisfied: boolean;
    readonly reasons: readonly string[];
  }>;
  readonly acquisitionCosts: readonly GoalResourceNeed[];
  /** Undefined means no independently established marginal effect is available. */
  readonly productionChanges: readonly GoalProductionChange[] | undefined;
  readonly unavailableReasons: readonly string[];
}

export interface GoalStrategyEvaluation {
  readonly id: string;
  readonly goalId: string;
  readonly status: FeasibilityStatus;
  readonly acquisitionTime: number | undefined;
  readonly completionTime: number | undefined;
  readonly rankable: boolean;
  readonly feasibility: GoalFeasibility;
  readonly opportunityCosts: readonly GoalProductionChange[];
  readonly unavailableReasons: readonly string[];
}

export interface GoalStrategyComparison {
  readonly goalId: string;
  readonly winner: string | undefined;
  readonly rankedStrategyIds: readonly string[];
  readonly strategies: readonly GoalStrategyEvaluation[];
  readonly validityEpoch: string;
}

function resourceKey(resourceId: string, poolId: string): string {
  return `${poolId}\u0000${resourceId}`;
}

function combineGoalResourceNeeds(
  needs: readonly GoalResourceNeed[],
): readonly GoalResourceNeed[] {
  const combined = new Map<string, GoalResourceNeed>();
  for (const need of needs) {
    const key = resourceKey(need.resourceId, need.poolId);
    const previous = combined.get(key);
    const amount =
      !isFiniteNonnegative(need.amount) ||
      (previous !== undefined && !isFiniteNonnegative(previous.amount))
        ? Number.NaN
        : (previous?.amount ?? 0) + need.amount;
    combined.set(
      key,
      Object.freeze({
        resourceId: need.resourceId,
        poolId: need.poolId,
        amount,
      }),
    );
  }
  return Object.freeze([...combined.values()]);
}

function combineGoalProductionChanges(
  changes: readonly GoalProductionChange[],
): readonly GoalProductionChange[] {
  const combined = new Map<string, GoalProductionChange>();
  for (const change of changes) {
    const key = resourceKey(change.resourceId, change.poolId);
    const previous = combined.get(key);
    combined.set(
      key,
      Object.freeze({
        resourceId: change.resourceId,
        poolId: change.poolId,
        netRateDelta: (previous?.netRateDelta ?? 0) + change.netRateDelta,
        ...(previous?.capacityDelta === undefined &&
        change.capacityDelta === undefined
          ? {}
          : {
              capacityDelta:
                (previous?.capacityDelta ?? 0) + (change.capacityDelta ?? 0),
            }),
      }),
    );
  }
  return Object.freeze([...combined.values()]);
}

function isFiniteNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** Mirrors upstream cost-capacity semantics: a negative maximum is unlimited. */
export function hasSufficientGoalCapacity(
  capacity: number,
  requirement: number,
): boolean {
  return Number.isFinite(capacity) && (capacity < 0 || capacity >= requirement);
}

/**
 * Calculates simultaneous stock accumulation over disjoint resource pools. Inputs are immutable,
 * validated boundary observations. The rate unit is caller-defined and retained by every ETA.
 */
export function evaluateGoalFeasibility(
  goalId: string,
  requirements: readonly GoalResourceNeed[],
  stocks: readonly GoalResourceStock[],
  commitments: readonly GoalResourceCommitment[],
  validityEpoch: string,
  commitmentsKnown = true,
): GoalFeasibility {
  const stockByKey = new Map(
    stocks.map((stock) => [resourceKey(stock.resourceId, stock.poolId), stock]),
  );
  const committedByKey = new Map<string, number>();
  const limitingConstraints: string[] = [];
  const reasons: string[] = [];
  const assumptions = [
    "future production is forecast only and is not spendable current stock",
    "rates and capacity are held constant during the projection",
    "requirements in separate resource pools accumulate in parallel",
  ];
  if (!commitmentsKnown) {
    assumptions.push("current external resource commitments were not observed");
    reasons.push("current resource commitments are unavailable");
  }
  let hasUnavailable = false;
  let hasInfeasible = false;
  let hasUncertain = !commitmentsKnown;
  let hasUnestimatedRequirement = false;
  let estimatedTime = 0;

  for (const commitment of commitments) {
    if (!isFiniteNonnegative(commitment.amount)) {
      reasons.push(
        `invalid commitment for ${commitment.resourceId} in ${commitment.poolId}`,
      );
      hasUnavailable = true;
      continue;
    }
    const key = resourceKey(commitment.resourceId, commitment.poolId);
    committedByKey.set(key, (committedByKey.get(key) ?? 0) + commitment.amount);
  }

  const unmetRequirements = combineGoalResourceNeeds(requirements).map(
    (requirement) => {
      const constraints: string[] = [];
      const key = resourceKey(requirement.resourceId, requirement.poolId);
      const stock = stockByKey.get(key);
      const reserved = committedByKey.get(key) ?? 0;
      if (!isFiniteNonnegative(requirement.amount)) {
        constraints.push("invalid goal requirement");
        reasons.push(
          `goal ${goalId} has an invalid quantity for ${requirement.resourceId}`,
        );
        hasUnavailable = true;
        return Object.freeze({
          ...requirement,
          status: "unavailable" as const,
          constraints: Object.freeze(constraints),
        });
      }
      if (stock === undefined) {
        constraints.push("resource-pool observation unavailable");
        reasons.push(
          `${requirement.resourceId} in ${requirement.poolId} has no validated stock observation`,
        );
        hasUnavailable = true;
        return Object.freeze({
          ...requirement,
          status: "unavailable" as const,
          constraints: Object.freeze(constraints),
        });
      }
      if (
        stock.validityEpoch !== validityEpoch ||
        !Number.isFinite(stock.amount) ||
        !Number.isFinite(stock.capacity) ||
        !Number.isFinite(stock.netRate)
      ) {
        constraints.push("stale-or-invalid-resource-observation");
        reasons.push(
          `${requirement.resourceId} in ${requirement.poolId} is stale or invalid`,
        );
        hasUnavailable = true;
        return Object.freeze({
          ...requirement,
          status: "unavailable" as const,
          constraints: Object.freeze(constraints),
        });
      }

      const availableStock = Math.max(0, stock.amount - reserved);
      const shortfall = Math.max(0, requirement.amount - availableStock);
      if (reserved > 0) {
        constraints.push(`reserved-stock:${reserved}`);
        assumptions.push(
          `${requirement.resourceId} commitments remain reserved during the projection`,
        );
      }
      if (reserved > stock.amount) {
        constraints.push("commitments-exceed-observed-stock");
        reasons.push(
          `${requirement.resourceId} commitments exceed observed stock in ${requirement.poolId}`,
        );
        hasUnavailable = true;
        return Object.freeze({
          ...requirement,
          availableStock,
          shortfall,
          status: "unavailable" as const,
          constraints: Object.freeze(constraints),
        });
      }
      if (shortfall === 0) {
        return Object.freeze({
          ...requirement,
          availableStock,
          shortfall,
          timeToRequirement: 0,
          status: "feasible" as const,
          constraints: Object.freeze(constraints),
        });
      }
      const totalRequiredStock = requirement.amount + reserved;
      if (!hasSufficientGoalCapacity(stock.capacity, totalRequiredStock)) {
        constraints.push("capacity-below-requirement");
        limitingConstraints.push(
          `${requirement.resourceId} capacity ${stock.capacity} is below required ${totalRequiredStock}`,
        );
        hasInfeasible = true;
        return Object.freeze({
          ...requirement,
          availableStock,
          shortfall,
          status: "infeasible" as const,
          constraints: Object.freeze(constraints),
        });
      }
      if (stock.netRate <= 0) {
        constraints.push(
          stock.netRate === 0
            ? "zero-net-production"
            : "negative-net-production",
        );
        limitingConstraints.push(
          `${requirement.resourceId} cannot accumulate at observed net rate ${stock.netRate}`,
        );
        if (stock.rateConfidence === "stable") {
          hasInfeasible = true;
        } else {
          hasUncertain = true;
          hasUnestimatedRequirement = true;
          reasons.push(
            `${requirement.resourceId} has no safe ETA from a nonpositive single-sample rate`,
          );
        }
        return Object.freeze({
          ...requirement,
          availableStock,
          shortfall,
          status:
            stock.rateConfidence === "stable"
              ? ("infeasible" as const)
              : ("uncertain" as const),
          constraints: Object.freeze(constraints),
        });
      }

      const timeToRequirement = shortfall / stock.netRate;
      estimatedTime = Math.max(estimatedTime, timeToRequirement);
      if (stock.rateConfidence === "observed") {
        constraints.push("single-sample-rate");
        reasons.push(
          `${requirement.resourceId} ETA uses one observed net-rate sample`,
        );
        hasUncertain = true;
      }
      return Object.freeze({
        ...requirement,
        availableStock,
        shortfall,
        timeToRequirement,
        status: stock.rateConfidence === "stable" ? "feasible" : "uncertain",
        constraints: Object.freeze(constraints),
      });
    },
  );

  const status: FeasibilityStatus = hasUnavailable
    ? "unavailable"
    : hasInfeasible
      ? "infeasible"
      : hasUncertain
        ? "uncertain"
        : "feasible";
  if (status === "infeasible" || status === "unavailable")
    estimatedTime = Number.NaN;
  if (hasUnestimatedRequirement) estimatedTime = Number.NaN;
  if (!Number.isFinite(estimatedTime)) estimatedTime = Number.NaN;
  return Object.freeze({
    status,
    estimatedTime: Number.isFinite(estimatedTime) ? estimatedTime : undefined,
    unmetRequirements: Object.freeze(unmetRequirements),
    limitingConstraints: Object.freeze(limitingConstraints),
    assumptions: Object.freeze([...new Set(assumptions)]),
    validityEpoch,
    reasons: Object.freeze(reasons),
  });
}

/** Compares waiting with independently characterized candidates using the same feasibility query. */
export function compareGoalStrategies(
  goalId: string,
  requirements: readonly GoalResourceNeed[],
  stocks: readonly GoalResourceStock[],
  commitments: readonly GoalResourceCommitment[],
  candidates: readonly GoalStrategyCandidate[],
  validityEpoch: string,
  commitmentsKnown = true,
): GoalStrategyComparison {
  const baseline = evaluateGoalFeasibility(
    goalId,
    requirements,
    stocks,
    commitments,
    validityEpoch,
    commitmentsKnown,
  );
  const evaluations: GoalStrategyEvaluation[] = [
    Object.freeze({
      id: "wait",
      goalId,
      status: baseline.status,
      acquisitionTime: 0,
      completionTime: baseline.estimatedTime,
      rankable: baseline.estimatedTime !== undefined,
      feasibility: baseline,
      opportunityCosts: Object.freeze([]),
      unavailableReasons: baseline.reasons,
    }),
  ];
  const stockByKey = new Map(
    stocks.map((stock) => [resourceKey(stock.resourceId, stock.poolId), stock]),
  );

  for (const candidate of candidates) {
    const unavailableReasons = [...candidate.unavailableReasons];
    if (candidate.goalId !== goalId) {
      unavailableReasons.push("candidate targets a different goal");
    }
    if (!candidate.preconditions.satisfied) {
      unavailableReasons.push(...candidate.preconditions.reasons);
    }
    if (candidate.productionChanges === undefined) {
      unavailableReasons.push("marginal production effect is not established");
    }
    if (unavailableReasons.length > 0) {
      const unavailable = evaluateGoalFeasibility(
        goalId,
        requirements,
        stocks,
        commitments,
        validityEpoch,
        commitmentsKnown,
      );
      evaluations.push(
        Object.freeze({
          id: candidate.id,
          goalId,
          status: "unavailable",
          acquisitionTime: undefined,
          completionTime: undefined,
          rankable: false,
          feasibility: unavailable,
          opportunityCosts: Object.freeze([]),
          unavailableReasons: Object.freeze([...new Set(unavailableReasons)]),
        }),
      );
      continue;
    }

    const acquisition = evaluateGoalFeasibility(
      candidate.id,
      candidate.acquisitionCosts,
      stocks,
      commitments,
      validityEpoch,
      commitmentsKnown,
    );
    const acquisitionTime = acquisition.estimatedTime;
    if (acquisitionTime === undefined || acquisition.status === "infeasible") {
      evaluations.push(
        Object.freeze({
          id: candidate.id,
          goalId,
          status: acquisition.status,
          acquisitionTime: undefined,
          completionTime: undefined,
          rankable: false,
          feasibility: acquisition,
          opportunityCosts: Object.freeze([]),
          unavailableReasons: Object.freeze([
            ...acquisition.reasons,
            "candidate acquisition cost cannot be projected",
          ]),
        }),
      );
      continue;
    }

    const acquisitionCostByKey = new Map<string, number>();
    for (const cost of candidate.acquisitionCosts) {
      const key = resourceKey(cost.resourceId, cost.poolId);
      acquisitionCostByKey.set(
        key,
        (acquisitionCostByKey.get(key) ?? 0) + cost.amount,
      );
    }
    const productionChanges = combineGoalProductionChanges(
      candidate.productionChanges ?? [],
    );
    const changedStocks = stocks.map((stock) => {
      const cap =
        stock.capacity < 0 ? Number.POSITIVE_INFINITY : stock.capacity;
      const duringAcquisition = Math.min(
        cap,
        Math.max(0, stock.amount + stock.netRate * acquisitionTime),
      );
      const key = resourceKey(stock.resourceId, stock.poolId);
      const afterCost = Math.max(
        0,
        duringAcquisition - (acquisitionCostByKey.get(key) ?? 0),
      );
      const change = productionChanges.find(
        (entry) => resourceKey(entry.resourceId, entry.poolId) === key,
      );
      return Object.freeze({
        ...stock,
        amount: afterCost,
        capacity:
          change?.capacityDelta === undefined || stock.capacity < 0
            ? stock.capacity
            : stock.capacity + change.capacityDelta,
        netRate: stock.netRate + (change?.netRateDelta ?? 0),
      });
    });
    const changedKeys = new Set(
      productionChanges.map((change) =>
        resourceKey(change.resourceId, change.poolId),
      ) ?? [],
    );
    const unsupportedEffect = [...changedKeys].some(
      (key) => !stockByKey.has(key),
    );
    const feasibility = evaluateGoalFeasibility(
      goalId,
      requirements,
      changedStocks,
      commitments,
      validityEpoch,
      commitmentsKnown,
    );
    const totalTime =
      feasibility.estimatedTime === undefined
        ? undefined
        : acquisitionTime + feasibility.estimatedTime;
    const status: FeasibilityStatus = unsupportedEffect
      ? "unavailable"
      : feasibility.status;
    evaluations.push(
      Object.freeze({
        id: candidate.id,
        goalId,
        status,
        acquisitionTime,
        completionTime: totalTime,
        rankable: totalTime !== undefined && !unsupportedEffect,
        feasibility,
        opportunityCosts: Object.freeze(
          productionChanges.filter(
            (change) =>
              change.netRateDelta < 0 || (change.capacityDelta ?? 0) < 0,
          ) ?? [],
        ),
        unavailableReasons: Object.freeze(
          unsupportedEffect
            ? ["candidate changes an unobserved resource pool"]
            : [],
        ),
      }),
    );
  }

  const rankedStrategyIds = evaluations
    .filter((evaluation) => evaluation.rankable)
    .sort((left, right) => {
      const timeDifference =
        (left.completionTime ?? Number.POSITIVE_INFINITY) -
        (right.completionTime ?? Number.POSITIVE_INFINITY);
      if (timeDifference !== 0) return timeDifference;
      if (left.id === "wait") return -1;
      if (right.id === "wait") return 1;
      return left.id.localeCompare(right.id);
    })
    .map((evaluation) => evaluation.id);
  const comparisonComplete = evaluations
    .slice(1)
    .every(
      (evaluation) => evaluation.rankable || evaluation.status === "infeasible",
    );
  return Object.freeze({
    goalId,
    // An unsupported candidate is omitted from ordering and also prevents a global winner claim.
    winner: comparisonComplete ? rankedStrategyIds[0] : undefined,
    rankedStrategyIds: Object.freeze(rankedStrategyIds),
    strategies: Object.freeze(evaluations),
    validityEpoch,
  });
}
