export interface ArpaProjectResourceCost {
  readonly resourceId: string;
  readonly amount: number;
  readonly pool?: string;
}

export interface ArpaProjectResourceCapacity {
  readonly id: string;
  readonly pool?: string;
  /** Negative values are the game's uncapped-resource sentinel. */
  readonly maxQuantity: number;
}

export interface ArpaProjectStepCostsInput {
  readonly perPercentCosts: readonly ArpaProjectResourceCost[];
  readonly progress: number;
  readonly desiredStepPercent: number;
  readonly resources: readonly ArpaProjectResourceCapacity[];
}

export interface ArpaProjectStepCosts {
  readonly steps: number;
  readonly costs: readonly ArpaProjectResourceCost[];
}

/** Calculate the integer ARPA step and its cost for any consumer of project demand. */
export function calculateArpaProjectStepCosts(
  input: Readonly<ArpaProjectStepCostsInput>,
): Readonly<ArpaProjectStepCosts> {
  let maxStep = Math.min(100 - input.progress, input.desiredStepPercent);
  for (const cost of input.perPercentCosts) {
    const resource = input.resources.find(
      (candidate) =>
        candidate.id === cost.resourceId && candidate.pool === undefined,
    );
    if (resource !== undefined && resource.maxQuantity >= 0) {
      maxStep = Math.min(maxStep, resource.maxQuantity / cost.amount);
    }
  }
  const steps = Math.max(Math.floor(maxStep), 1);
  const costs = Object.freeze(
    input.perPercentCosts.map((cost) =>
      Object.freeze({ ...cost, amount: cost.amount * steps }),
    ),
  );
  return Object.freeze({ steps, costs });
}
