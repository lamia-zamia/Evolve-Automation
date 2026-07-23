export interface MiningDroidProductionInput {
  readonly id: string;
  readonly weighting: number;
  readonly priority: number;
  readonly demanded: boolean;
  readonly useful: boolean;
}

export interface MiningDroidPlanningInput {
  readonly initialised: boolean;
  readonly maximum: number;
  readonly productions: readonly MiningDroidProductionInput[];
}

export interface MiningDroidTarget {
  readonly productionId: string;
  readonly target: number;
}

export interface MiningDroidCurrent {
  readonly productionId: string;
  readonly count: number;
}

export interface MiningDroidAdjustment {
  readonly productionId: string;
  readonly expectedCurrent: number;
  readonly delta: number;
}

export interface MiningDroidDecision {
  readonly adjustments: readonly MiningDroidAdjustment[];
}

/**
 * Pure port of the legacy priority-group and proportional-weight allocator.
 * Null means the available droids could not all be assigned, in which case
 * legacy automation deliberately leaves every current allocation untouched.
 */
export function planMiningDroidTargets(
  input: Readonly<MiningDroidPlanningInput>,
): readonly MiningDroidTarget[] | null {
  if (!input.initialised) {
    return null;
  }

  const priorityGroups = new Map<number, MiningDroidProductionInput[]>();
  const targets = new Map(
    input.productions.map((production) => [production.id, 0]),
  );
  for (const production of input.productions) {
    if (production.weighting <= 0) {
      continue;
    }
    const priority = production.demanded
      ? Math.max(production.priority, 100)
      : production.priority;
    if (priority === 0) {
      continue;
    }
    const group = priorityGroups.get(priority) ?? [];
    group.push(production);
    priorityGroups.set(priority, group);
  }

  const priorityList = [...priorityGroups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, group]) => group);
  const supplementary = priorityGroups.get(-1);
  if (supplementary !== undefined && priorityList.length > 1) {
    // Preserve the legacy one-argument splice and its from-index lookup. For
    // configured priorities below -1 this removes the suffix, even though the
    // usual UI-generated priorities make -1 the final group.
    priorityList.splice(priorityList.indexOf(supplementary, 1));
    priorityList[0]?.push(...supplementary);
  }

  let remaining = input.maximum;
  for (
    let groupIndex = 0;
    groupIndex < priorityList.length && remaining > 0;
    groupIndex++
  ) {
    const products = [...(priorityList[groupIndex] ?? [])].sort(
      (left, right) => left.weighting - right.weighting,
    );
    while (remaining > 0) {
      const beforeDistribution = remaining;
      const totalWeight = products.reduce(
        (sum, production) => sum + production.weighting,
        0,
      );

      for (
        let index = products.length - 1;
        index >= 0 && remaining > 0;
        index--
      ) {
        const production = products[index];
        if (production === undefined) {
          continue;
        }
        const requested = Math.min(
          remaining,
          Math.max(
            1,
            Math.floor(
              (beforeDistribution / totalWeight) * production.weighting,
            ),
          ),
        );
        const assigned = production.useful ? requested : 0;
        if (assigned > 0) {
          remaining -= assigned;
          targets.set(
            production.id,
            (targets.get(production.id) ?? 0) + assigned,
          );
        }
        if (assigned < requested) {
          products.splice(index, 1);
        }
      }

      if (beforeDistribution === remaining) {
        break;
      }
    }
  }

  if (remaining > 0) {
    return null;
  }
  return Object.freeze(
    input.productions.map((production) =>
      Object.freeze({
        productionId: production.id,
        target: targets.get(production.id) ?? 0,
      }),
    ),
  );
}

export function planMiningDroidAdjustments(
  targets: readonly Readonly<MiningDroidTarget>[],
  current: readonly Readonly<MiningDroidCurrent>[],
): MiningDroidDecision {
  const currentById = new Map(
    current.map((production) => [production.productionId, production.count]),
  );
  return Object.freeze({
    adjustments: Object.freeze(
      targets.map((target) => {
        const expectedCurrent = currentById.get(target.productionId) ?? 0;
        return Object.freeze({
          productionId: target.productionId,
          expectedCurrent,
          delta: target.target - expectedCurrent,
        });
      }),
    ),
  });
}
