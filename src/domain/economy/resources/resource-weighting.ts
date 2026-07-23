export interface ResourceShortageView {
  readonly id: string;
  readonly currentQuantity: number;
}

export interface WeightedResourceRequirement {
  readonly cost: Readonly<Record<string, number | undefined>>;
  readonly weighting: number;
}

/**
 * Returns the weighting of the highest-priority requirement that is still
 * short of the supplied resource. Requirements must be ordered from highest
 * to lowest priority by the caller.
 */
export function findRequiredResourceWeight(
  orderedRequirements: readonly WeightedResourceRequirement[],
  resource: Readonly<ResourceShortageView>,
): number | undefined {
  return orderedRequirements.find((requirement) => {
    const requiredQuantity = requirement.cost[resource.id];
    return (
      requiredQuantity !== undefined &&
      requiredQuantity > resource.currentQuantity
    );
  })?.weighting;
}
