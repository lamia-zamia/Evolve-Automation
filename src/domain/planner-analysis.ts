export interface PlannerRequirement {
  readonly resourceId: string;
  readonly resourceTitle: string;
  readonly requiredQuantity: number;
  readonly currentQuantity: number;
  readonly maximumQuantity: number;
  readonly income: number;
  readonly unlocked: boolean;
}

export interface PlannerLimitInput {
  readonly affordable: boolean;
  readonly requirements: readonly Readonly<PlannerRequirement>[];
}

export interface PlannerLimit {
  readonly resourceId: string;
  readonly resourceTitle: string;
  readonly time: number;
  readonly blocker: "storage" | "income" | "stalled" | "locked";
}

export interface PlannerRun {
  readonly day: number;
  readonly reset: number;
}

export interface PlannerStats {
  readonly startDay: number;
  readonly day: number;
  readonly reset: number;
  readonly samples: Readonly<Record<string, number>>;
  readonly total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function freezeStats(stats: PlannerStats): Readonly<PlannerStats> {
  return Object.freeze({
    ...stats,
    samples: Object.freeze({ ...stats.samples }),
  });
}

/** Selects the slowest unmet requirement from one immutable resource sample. */
export function findPlannerLimit(
  input: Readonly<PlannerLimitInput>,
): Readonly<PlannerLimit> | null {
  if (input.affordable) return null;

  let worst: PlannerLimit | null = null;
  let locked: PlannerLimit | null = null;
  for (const requirement of input.requirements) {
    if (!requirement.unlocked) {
      if (
        locked === null &&
        requirement.currentQuantity < requirement.requiredQuantity
      ) {
        locked = {
          resourceId: requirement.resourceId,
          resourceTitle: requirement.resourceTitle,
          time: Number.MAX_SAFE_INTEGER,
          blocker: "locked",
        };
      }
      continue;
    }
    if (requirement.currentQuantity >= requirement.requiredQuantity) {
      continue;
    }

    let time: number;
    let blocker: PlannerLimit["blocker"];
    if (requirement.maximumQuantity < requirement.requiredQuantity) {
      time = Number.MAX_SAFE_INTEGER;
      blocker = "storage";
    } else if (requirement.income > 0) {
      time =
        (requirement.requiredQuantity - requirement.currentQuantity) /
        requirement.income;
      blocker = "income";
    } else {
      time = Number.MAX_SAFE_INTEGER / 2;
      blocker = "stalled";
    }

    // Preserve resource insertion order when two requirements have equal ETAs.
    if (worst === null || time > worst.time) {
      worst = {
        resourceId: requirement.resourceId,
        resourceTitle: requirement.resourceTitle,
        time,
        blocker,
      };
    }
  }

  const result = locked ?? worst;
  return result === null ? null : Object.freeze(result);
}

export function createPlannerStats(
  run: Readonly<PlannerRun>,
): Readonly<PlannerStats> {
  if (
    !isNonNegativeSafeInteger(run.day) ||
    !isNonNegativeSafeInteger(run.reset)
  ) {
    throw new TypeError(
      "planner run values must be non-negative safe integers",
    );
  }
  return freezeStats({
    startDay: run.day,
    day: run.day,
    reset: run.reset,
    samples: {},
    total: 0,
  });
}

/** Validates persisted or otherwise untrusted planner statistics. */
export function parsePlannerStats(
  value: unknown,
): Readonly<PlannerStats> | null {
  if (!isRecord(value)) return null;

  const { startDay, day, reset, samples, total } = value;
  if (
    !isNonNegativeSafeInteger(startDay) ||
    !isNonNegativeSafeInteger(day) ||
    !isNonNegativeSafeInteger(reset) ||
    !isNonNegativeSafeInteger(total) ||
    startDay > day ||
    !isRecord(samples)
  ) {
    return null;
  }

  const validatedSamples: Record<string, number> = {};
  let sampleTotal = 0;
  for (const [bucket, count] of Object.entries(samples)) {
    if (!isNonNegativeSafeInteger(count)) return null;
    validatedSamples[bucket] = count;
    sampleTotal += count;
  }
  if (!Number.isSafeInteger(sampleTotal) || sampleTotal !== total) return null;

  return freezeStats({
    startDay,
    day,
    reset,
    samples: validatedSamples,
    total,
  });
}

export function selectPlannerStats(
  saved: Readonly<PlannerStats> | null,
  run: Readonly<PlannerRun>,
): Readonly<PlannerStats> {
  return saved !== null && saved.reset === run.reset && saved.day <= run.day
    ? saved
    : createPlannerStats(run);
}

export function recordPlannerSample(
  stats: Readonly<PlannerStats>,
  bucket: string,
  currentDay: number,
): Readonly<PlannerStats> {
  if (!isNonNegativeSafeInteger(currentDay)) {
    throw new TypeError("currentDay must be a non-negative safe integer");
  }

  return freezeStats({
    ...stats,
    day: currentDay,
    samples: {
      ...stats.samples,
      [bucket]: (stats.samples[bucket] ?? 0) + 1,
    },
    total: stats.total + 1,
  });
}
