export type ResourceCostMap = Readonly<Record<string, number | undefined>>;

export interface ReservedCostTarget {
  readonly name: string;
  readonly cause: string;
  readonly cost: ResourceCostMap;
}

export interface CostConflictResource {
  readonly name: string;
  readonly currentQuantity: number;
}

export interface CostConflictInput {
  readonly actionCost: ResourceCostMap;
  readonly reservedTargets: readonly ReservedCostTarget[];
  readonly resources: Readonly<
    Record<string, CostConflictResource | undefined>
  >;
}

export interface CostConflict {
  readonly status: "conflict";
  /** The final conflicting resource in stable target/cost iteration order. */
  readonly resourceId: string;
  /** The final conflicting target in stable target/cost iteration order. */
  readonly targetName: string;
  readonly targetCause: string;
  readonly resourceNames: readonly string[];
  readonly targetNames: readonly string[];
}

/**
 * Finds resources an action would consume below an existing reservation.
 * Knowledge is reserved only after every non-Knowledge cost of that target is
 * currently affordable, matching the legacy deadlock-avoidance policy.
 */
export function findCostConflict(
  input: Readonly<CostConflictInput>,
): CostConflict | null {
  const resourceNames: string[] = [];
  const targetNames: string[] = [];
  let resourceId = "";
  let targetName = "";
  let targetCause = "";

  for (const reservedTarget of input.reservedTargets) {
    let blockKnowledge = true;
    for (const reservedResourceId of Object.keys(reservedTarget.cost)) {
      const resource = input.resources[reservedResourceId];
      const reservedCost = reservedTarget.cost[reservedResourceId];
      if (
        reservedResourceId !== "Knowledge" &&
        resource !== undefined &&
        reservedCost !== undefined &&
        resource.currentQuantity < reservedCost
      ) {
        blockKnowledge = false;
        break;
      }
    }

    for (const reservedResourceId of Object.keys(reservedTarget.cost)) {
      const resource = input.resources[reservedResourceId];
      const reservedCost = reservedTarget.cost[reservedResourceId];
      const actionCost = input.actionCost[reservedResourceId];
      if (
        resource === undefined ||
        reservedCost === undefined ||
        actionCost === undefined ||
        (reservedResourceId === "Knowledge" && !blockKnowledge) ||
        reservedCost <= resource.currentQuantity - actionCost
      ) {
        continue;
      }

      resourceId = reservedResourceId;
      targetName = reservedTarget.name;
      targetCause = reservedTarget.cause;
      if (!resourceNames.includes(resource.name)) {
        resourceNames.push(resource.name);
      }
      if (!targetNames.includes(reservedTarget.name)) {
        targetNames.push(reservedTarget.name);
      }
    }
  }

  if (resourceId === "") return null;
  return Object.freeze({
    status: "conflict",
    resourceId,
    targetName,
    targetCause,
    resourceNames: Object.freeze(resourceNames),
    targetNames: Object.freeze(targetNames),
  });
}
