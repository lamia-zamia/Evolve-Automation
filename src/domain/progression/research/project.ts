export interface ProjectOffer {
  readonly elementId: string;
  readonly projectId: string;
  readonly rank: number;
  readonly progress: number;
  readonly cost: Readonly<Record<string, number>>;
  readonly generation: number;
}

export interface ProjectAutomationTarget {
  readonly projectId: string;
  readonly enabled: boolean;
  readonly priority: number;
  /** Negative means unlimited, matching the persisted A.R.P.A. setting. */
  readonly maximum: number;
  readonly weighting: number;
}

export interface ProjectAutomationSettings {
  readonly enabled: boolean;
  readonly stepPercent: number;
  readonly scaleWeighting: boolean;
  readonly targets: readonly Readonly<ProjectAutomationTarget>[];
}

export interface ProjectCapacityView {
  readonly unlocked: boolean;
  /** `-1` is an uncapped resource. */
  readonly maximum: number;
}

export interface ProjectPlanningInput {
  readonly settings: Readonly<ProjectAutomationSettings>;
  readonly projects: readonly Readonly<ProjectOffer>[];
  readonly capacities: Readonly<Record<string, Readonly<ProjectCapacityView>>>;
}

export interface PlannedProject {
  readonly elementId: string;
  readonly projectId: string;
  readonly generation: number;
  readonly rank: number;
  readonly progress: number;
  readonly steps: number;
  readonly weighting: number;
  readonly cost: Readonly<Record<string, number>>;
}

function stepCapacity(
  project: Readonly<ProjectOffer>,
  capacities: ProjectPlanningInput["capacities"],
): number {
  let capacity = Number.MAX_SAFE_INTEGER;
  for (const [resourceId, price] of Object.entries(project.cost)) {
    const resource = capacities[resourceId];
    if (
      resource === undefined ||
      !resource.unlocked ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return 0;
    }
    if (resource.maximum >= 0) {
      capacity = Math.min(capacity, Math.floor(resource.maximum / price));
    }
  }
  return capacity;
}

/**
 * Turns one immutable catalog/settings/resource sample into the build candidates consumed by the
 * generic build planner. The project's price is for 1%; a command never crosses a rank boundary,
 * so the upstream game keeps that price constant for every requested step.
 */
export function planProjects(
  input: Readonly<ProjectPlanningInput>,
): readonly Readonly<PlannedProject>[] {
  if (!input.settings.enabled) return Object.freeze([]);

  const targets = new Map(
    input.settings.targets.map((target) => [target.projectId, target] as const),
  );
  const planned: {
    readonly order: number;
    readonly project: PlannedProject;
  }[] = [];
  for (const [order, offered] of input.projects.entries()) {
    const target = targets.get(offered.projectId);
    if (
      target === undefined ||
      !target.enabled ||
      target.weighting <= 0 ||
      (target.maximum >= 0 && offered.rank >= target.maximum)
    ) {
      continue;
    }

    const desired = Math.min(
      input.settings.stepPercent,
      100 - offered.progress,
    );
    const steps = Math.min(desired, stepCapacity(offered, input.capacities));
    if (!Number.isSafeInteger(steps) || steps < 1) continue;

    const cost: Record<string, number> = {};
    for (const [resourceId, price] of Object.entries(offered.cost)) {
      cost[resourceId] = price * steps;
    }
    let weighting = target.weighting * steps;
    if (input.settings.scaleWeighting) {
      weighting /= 1 - offered.progress / 100;
    }
    planned.push({
      order,
      project: Object.freeze({
        elementId: offered.elementId,
        projectId: offered.projectId,
        generation: offered.generation,
        rank: offered.rank,
        progress: offered.progress,
        steps,
        weighting,
        cost: Object.freeze(cost),
      }),
    });
  }

  planned.sort((left, right) => {
    const weight = right.project.weighting - left.project.weighting;
    if (weight !== 0) return weight;
    const leftPriority =
      targets.get(left.project.projectId)?.priority ?? left.order;
    const rightPriority =
      targets.get(right.project.projectId)?.priority ?? right.order;
    return leftPriority - rightPriority || left.order - right.order;
  });
  return Object.freeze(planned.map((entry) => entry.project));
}
