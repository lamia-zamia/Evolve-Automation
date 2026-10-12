import type {
  GoalResourceStock,
  GoalStrategyCandidate,
} from "../../../domain/economy/goal-feasibility.ts";

export interface CapturedJobStrategyResourceSample {
  readonly resourceId: string;
  readonly poolId: string;
  readonly amountBefore: number;
  readonly amountAfter: number;
  readonly capacityBefore: number;
  readonly capacityAfter: number;
}

export interface CapturedJobStrategyCell {
  /** Frozen save, settings and seed identity shared by the isolated pair. */
  readonly initialStateKey: string;
  readonly validityEpoch: string;
  readonly rootStable: boolean;
  readonly controlStable: boolean;
  readonly productionWindow: number;
  readonly jobsBefore: Readonly<Record<string, number>>;
  readonly jobsAfter: Readonly<Record<string, number>>;
  readonly resources: readonly CapturedJobStrategyResourceSample[];
}

export interface CapturedJobStrategyPair {
  readonly id: string;
  readonly goalId: string;
  readonly targetJob: string;
  readonly sourceJob: string;
  readonly targetPermitted: boolean;
  readonly targetControlBound: boolean;
  readonly targetAvailable: boolean;
  readonly baseline: CapturedJobStrategyCell;
  readonly intervention: CapturedJobStrategyCell;
}

export interface CapturedJobStrategyObservation {
  readonly candidate: GoalStrategyCandidate;
  readonly stocks: readonly GoalResourceStock[];
  readonly unavailableReasons: readonly string[];
}

/**
 * Converts a paired native job-control experiment into measured deltas. This only
 * establishes the captured period's marginal; it cannot prove future collateral
 * effects, food safety, or rate stability, so resulting candidates stay provisional.
 */
export function readCapturedJobStrategyPair(
  pair: CapturedJobStrategyPair,
): CapturedJobStrategyObservation {
  const reasons: string[] = [];
  const baseline = pair.baseline;
  const intervention = pair.intervention;
  if (
    baseline.initialStateKey.length === 0 ||
    baseline.initialStateKey !== intervention.initialStateKey
  ) {
    reasons.push("paired job captures do not share an identical initial state");
  }
  if (
    baseline.validityEpoch.length === 0 ||
    baseline.validityEpoch !== intervention.validityEpoch
  ) {
    reasons.push("paired job capture epoch is stale or mismatched");
  }
  if (
    !baseline.rootStable ||
    !intervention.rootStable ||
    !baseline.controlStable ||
    !intervention.controlStable
  ) {
    reasons.push("root or native job control changed during paired sampling");
  }
  if (
    !Number.isSafeInteger(baseline.productionWindow) ||
    baseline.productionWindow <= 0 ||
    baseline.productionWindow !== intervention.productionWindow
  ) {
    reasons.push("paired production windows are invalid or unequal");
  }
  if (!pair.targetPermitted)
    reasons.push("target job permission is unavailable");
  if (!pair.targetControlBound)
    reasons.push("native target job control is not bound");
  if (!pair.targetAvailable)
    reasons.push("target job has no available worker capacity");

  const baselineTarget = baseline.jobsBefore[pair.targetJob];
  const baselineSource = baseline.jobsBefore[pair.sourceJob];
  const controlBaseline = baseline.jobsAfter;
  const interventionStart = intervention.jobsBefore;
  const interventionEnd = intervention.jobsAfter;
  const observedJobIds = new Set([
    ...Object.keys(baseline.jobsBefore),
    ...Object.keys(baseline.jobsAfter),
    ...Object.keys(intervention.jobsBefore),
    ...Object.keys(intervention.jobsAfter),
  ]);
  if (
    baselineTarget === undefined ||
    baselineSource === undefined ||
    interventionStart[pair.targetJob] !== baselineTarget ||
    interventionStart[pair.sourceJob] !== baselineSource ||
    controlBaseline[pair.targetJob] !== baselineTarget ||
    controlBaseline[pair.sourceJob] !== baselineSource
  ) {
    reasons.push(
      "paired job counts do not share the same pre-action allocation",
    );
  }
  for (const jobId of observedJobIds) {
    const originalCount = baseline.jobsBefore[jobId];
    if (
      originalCount === undefined ||
      controlBaseline[jobId] !== originalCount ||
      interventionStart[jobId] !== originalCount
    ) {
      reasons.push("paired job counts changed outside the controlled action");
      break;
    }
    if (
      jobId !== pair.targetJob &&
      jobId !== pair.sourceJob &&
      interventionEnd[jobId] !== originalCount
    ) {
      reasons.push("native action changed an unexpected job allocation");
      break;
    }
  }
  if (
    baselineTarget !== undefined &&
    baselineSource !== undefined &&
    (interventionEnd[pair.targetJob] !== baselineTarget + 1 ||
      interventionEnd[pair.sourceJob] !== baselineSource - 1)
  ) {
    reasons.push(
      "native action did not move exactly one worker to the target job",
    );
  }

  const baselineByKey = new Map(
    baseline.resources.map((sample) => [
      `${sample.resourceId}\u0000${sample.poolId}`,
      sample,
    ]),
  );
  const interventionByKey = new Map(
    intervention.resources.map((sample) => [
      `${sample.resourceId}\u0000${sample.poolId}`,
      sample,
    ]),
  );
  if (
    baselineByKey.size !== baseline.resources.length ||
    interventionByKey.size !== intervention.resources.length
  ) {
    reasons.push("duplicate resource observations exist in a paired capture");
  }
  const stocks: GoalResourceStock[] = [];
  const productionChanges: NonNullable<
    GoalStrategyCandidate["productionChanges"]
  >[number][] = [];
  for (const [key, base] of baselineByKey) {
    const changed = interventionByKey.get(key);
    if (changed === undefined) {
      reasons.push(`paired intervention omitted ${base.resourceId} stock`);
      continue;
    }
    const values = [
      base.amountBefore,
      base.amountAfter,
      base.capacityBefore,
      base.capacityAfter,
      changed.amountBefore,
      changed.amountAfter,
      changed.capacityBefore,
      changed.capacityAfter,
    ];
    if (!values.every(Number.isFinite)) {
      reasons.push(`paired ${base.resourceId} stock contains invalid values`);
      continue;
    }
    const period = baseline.productionWindow;
    const baseAmount = base.amountBefore;
    const baseCapacity = base.capacityBefore;
    const baselineRate = (base.amountAfter - base.amountBefore) / period;
    const interventionRate =
      (changed.amountAfter - changed.amountBefore) / period;
    const capacityDelta = changed.capacityAfter - base.capacityAfter;
    stocks.push(
      Object.freeze({
        resourceId: base.resourceId,
        poolId: base.poolId,
        amount: baseAmount,
        capacity: baseCapacity,
        netRate: baselineRate,
        rateConfidence: "observed",
        validityEpoch: baseline.validityEpoch,
      }),
    );
    const netRateDelta = interventionRate - baselineRate;
    if (netRateDelta !== 0 || capacityDelta !== 0) {
      productionChanges.push(
        Object.freeze({
          resourceId: base.resourceId,
          poolId: base.poolId,
          netRateDelta,
          ...(capacityDelta === 0 ? {} : { capacityDelta }),
        }),
      );
    }
  }
  for (const sample of intervention.resources) {
    if (!baselineByKey.has(`${sample.resourceId}\u0000${sample.poolId}`)) {
      reasons.push(`paired baseline omitted ${sample.resourceId} stock`);
    }
  }

  const candidate: GoalStrategyCandidate = Object.freeze({
    id: pair.id,
    goalId: pair.goalId,
    preconditions: Object.freeze({
      satisfied: reasons.length === 0,
      reasons: Object.freeze([...reasons]),
    }),
    acquisitionCosts: Object.freeze([]),
    productionChanges:
      reasons.length === 0 ? Object.freeze(productionChanges) : undefined,
    effectsComplete: false,
    effectAuthority: "provisional",
    validityEpoch: baseline.validityEpoch,
    unavailableReasons: Object.freeze([]),
  });
  return Object.freeze({
    candidate,
    stocks: Object.freeze(stocks),
    unavailableReasons: Object.freeze([...reasons]),
  });
}
