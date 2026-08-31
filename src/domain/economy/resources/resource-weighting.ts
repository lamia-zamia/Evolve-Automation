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
 *
 * A requirement is measured against what is left after the higher-priority
 * requirements ahead of it, not against the gross stock. The build planner
 * already preserves a higher-weighted competitor's share of a resource before
 * spending on a lower-weighted candidate, so judging each requirement in
 * isolation lets the two disagree: with 19,920 Mythril held, a 12,000 Cargo
 * Yard claim and a 19,149 Titan Spaceport claim, every requirement looks
 * individually covered and this returned `undefined` - which drove the
 * Mythril craft weighting to zero and stopped crafting entirely - while the
 * planner refused to spend, because 12,000 was preserved for the Cargo Yard.
 * Nothing produced Mythril and nothing consumed it for 12,000 game days.
 */
export function findRequiredResourceRequirement<
  T extends WeightedResourceRequirement,
>(
  orderedRequirements: readonly T[],
  resource: Readonly<ResourceShortageView>,
): T | undefined {
  let claimed = 0;
  for (const requirement of orderedRequirements) {
    const requiredQuantity = requirement.cost[resource.id];
    if (requiredQuantity === undefined) {
      continue;
    }
    claimed += requiredQuantity;
    if (claimed > resource.currentQuantity) {
      return requirement;
    }
  }
  return undefined;
}

export function findRequiredResourceWeight(
  orderedRequirements: readonly WeightedResourceRequirement[],
  resource: Readonly<ResourceShortageView>,
): number | undefined {
  return findRequiredResourceRequirement(orderedRequirements, resource)
    ?.weighting;
}
