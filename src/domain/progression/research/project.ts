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

/** What the run itself says about one project, over and above its own settings. */
export interface ProjectOverride {
  /** Build past the configured maximum, e.g. a Mana Syphon under a Vacuum Collapse. */
  readonly ignoreMaximum?: boolean;
  /** Not wanted in this run at all, whatever its own settings say. */
  readonly excluded?: boolean;
  /** Scales the planned weighting; applied before optional progress scaling. */
  readonly weightMultiplier?: number;
}

/**
 * The run context every project is judged in. It is state of the run rather than of any project —
 * prestige plan, challenge, race — so it is sampled once and handed in, not looked up per project.
 */
export interface ProjectContext {
  /** No project is built at all, e.g. projects ignored before MAD. */
  readonly suppressed: boolean;
  readonly overrides: Readonly<Record<string, Readonly<ProjectOverride>>>;
}

export const NO_PROJECT_CONTEXT: ProjectContext = Object.freeze({
  suppressed: false,
  overrides: Object.freeze({}),
});

export interface ProjectPlanningInput {
  readonly settings: Readonly<ProjectAutomationSettings>;
  readonly projects: readonly Readonly<ProjectOffer>[];
  readonly capacities: Readonly<Record<string, Readonly<ProjectCapacityView>>>;
  readonly context: Readonly<ProjectContext>;
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

export type ProjectPlanningRejectionReason =
  | "disabled"
  | "zero-weighting"
  | "maximum-reached"
  | "run-context-suppressed"
  | "run-context-excluded"
  | "capacity-rejected";

export interface ProjectPlanningRejection {
  readonly projectId: string;
  readonly reason: ProjectPlanningRejectionReason;
}

export interface ProjectPlanningResult {
  readonly candidates: readonly Readonly<PlannedProject>[];
  readonly rejections: readonly Readonly<ProjectPlanningRejection>[];
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
export function planProjectsWithRejections(
  input: Readonly<ProjectPlanningInput>,
): Readonly<ProjectPlanningResult> {
  const rejections: ProjectPlanningRejection[] = [];
  if (!input.settings.enabled || input.context.suppressed) {
    const reason = input.context.suppressed
      ? "run-context-suppressed"
      : "disabled";
    return Object.freeze({
      candidates: Object.freeze([]),
      rejections: Object.freeze(
        input.projects.map((project) =>
          Object.freeze({ projectId: project.projectId, reason }),
        ),
      ),
    });
  }

  const targets = new Map(
    input.settings.targets.map((target) => [target.projectId, target] as const),
  );
  const planned: {
    readonly order: number;
    readonly project: PlannedProject;
  }[] = [];
  for (const [order, offered] of input.projects.entries()) {
    const target = targets.get(offered.projectId);
    const override = input.context.overrides[offered.projectId];
    if (target === undefined || !target.enabled) {
      rejections.push(
        Object.freeze({ projectId: offered.projectId, reason: "disabled" }),
      );
      continue;
    }
    if (target.weighting <= 0) {
      rejections.push(
        Object.freeze({
          projectId: offered.projectId,
          reason: "zero-weighting",
        }),
      );
      continue;
    }
    if (override?.excluded === true) {
      rejections.push(
        Object.freeze({
          projectId: offered.projectId,
          reason: "run-context-excluded",
        }),
      );
      continue;
    }
    if (
      target.maximum >= 0 &&
      offered.rank >= target.maximum &&
      override?.ignoreMaximum !== true
    ) {
      rejections.push(
        Object.freeze({
          projectId: offered.projectId,
          reason: "maximum-reached",
        }),
      );
      continue;
    }

    const desired = Math.min(
      input.settings.stepPercent,
      100 - offered.progress,
    );
    const steps = Math.min(desired, stepCapacity(offered, input.capacities));
    if (!Number.isSafeInteger(steps) || steps < 1) {
      rejections.push(
        Object.freeze({
          projectId: offered.projectId,
          reason: "capacity-rejected",
        }),
      );
      continue;
    }

    const cost: Record<string, number> = {};
    for (const [resourceId, price] of Object.entries(offered.cost)) {
      cost[resourceId] = price * steps;
    }
    let weighting = target.weighting * steps;
    const multiplier = override?.weightMultiplier;
    if (multiplier !== undefined && Number.isFinite(multiplier)) {
      weighting *= multiplier;
    }
    if (weighting <= 0) {
      rejections.push(
        Object.freeze({
          projectId: offered.projectId,
          reason: "zero-weighting",
        }),
      );
      continue;
    }
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
  return Object.freeze({
    candidates: Object.freeze(planned.map((entry) => entry.project)),
    rejections: Object.freeze(rejections),
  });
}

export function planProjects(
  input: Readonly<ProjectPlanningInput>,
): readonly Readonly<PlannedProject>[] {
  return planProjectsWithRejections(input).candidates;
}
