export interface CostRequirement {
  readonly resourceId: string;
  readonly requiredQuantity: number;
  readonly availableQuantity: number;
}

export interface CostAffordabilityInput {
  readonly requirements: readonly Readonly<CostRequirement>[];
}

/** Decides affordability from one complete immutable resource sample. */
export function isCostAffordable(
  input: Readonly<CostAffordabilityInput>,
): boolean {
  return input.requirements.every(
    (requirement) =>
      requirement.availableQuantity >= requirement.requiredQuantity,
  );
}
