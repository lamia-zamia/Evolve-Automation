export interface TargetTimingRequirement {
  readonly resourceId: string;
  readonly costPerSegment: number;
  readonly currentQuantity: number;
  readonly rateOfChange: number;
}

export interface TargetTimingInput {
  readonly remainingSegments: number;
  readonly requirements: readonly TargetTimingRequirement[];
}

export interface TargetTimingResult {
  readonly resourceId: string;
  readonly seconds: number;
}

/** Calculates the slowest resource requirement using one immutable resource sample. */
export function calculateTargetTiming(
  input: Readonly<TargetTimingInput>,
): TargetTimingResult {
  let resourceId = "";
  let seconds = 0;

  for (const requirement of input.requirements) {
    const totalCost = requirement.costPerSegment * input.remainingSegments;
    const rawSeconds =
      (totalCost - requirement.currentQuantity) / requirement.rateOfChange;

    if (rawSeconds > seconds && totalCost > requirement.currentQuantity) {
      resourceId = requirement.resourceId;
      seconds = rawSeconds;
    }
  }

  return Object.freeze({ resourceId, seconds });
}
