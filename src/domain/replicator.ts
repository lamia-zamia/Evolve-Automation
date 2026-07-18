export type ReplicatorScoreMode = "mass" | "quantity" | "weight";

export interface ReplicatorProductionInput {
  readonly id: string;
  readonly unlocked: boolean;
  readonly enabled: boolean;
  readonly weighting: number;
  readonly priority: number;
  readonly demanded: boolean;
  readonly useful: boolean;
}

export interface ReplicatorPlanningInput {
  readonly initialised: boolean;
  readonly assignGovernorTask: boolean;
  readonly scoreMode: ReplicatorScoreMode;
  readonly selectHighestScore: boolean;
  readonly productions: readonly ReplicatorProductionInput[];
}

export interface ReplicatorCandidate {
  readonly productionId: string;
  readonly weighting: number;
}

export interface ReplicatorPriorityPlan {
  readonly scoreMode: ReplicatorScoreMode;
  readonly selectHighestScore: boolean;
  readonly candidates: readonly ReplicatorCandidate[];
}

export interface ReplicatorMetric {
  readonly productionId: string;
  readonly currentQuantity: number;
  readonly atomicMass: number;
  readonly exotic: boolean;
}

export interface ReplicatorSelectionDecision {
  readonly productionId: string;
}

export interface ReplicatorGovernorGateInput {
  readonly governorPresent: boolean;
  readonly replicatorTechnology: boolean;
}

export interface ReplicatorGovernorTaskDecision {
  readonly kind: "assign-governor-task";
  readonly taskIndex: number;
  readonly expectedTask: "none";
}

export type ReplicatorGovernorTaskPlan =
  | { readonly status: "unavailable" }
  | {
      readonly status: "ready";
      readonly assignment: ReplicatorGovernorTaskDecision | null;
    };

export interface ReplicatorGovernorSettingsInput {
  readonly powerOn: boolean;
  readonly focusQueue: boolean;
  readonly focusNegative: boolean;
  readonly switchOnCap: boolean;
  readonly powerCap: number;
}

export interface ReplicatorGovernorSettingsDecision {
  readonly kind: "update-governor-settings";
  readonly expected: ReplicatorGovernorSettingsInput;
  readonly enablePower: boolean;
  readonly disableQueue: boolean;
  readonly disableNegative: boolean;
  readonly disableCapSwitch: boolean;
  readonly raisePowerCap: boolean;
}

export type ReplicatorGovernorDecision =
  ReplicatorGovernorTaskDecision | ReplicatorGovernorSettingsDecision;

/** Pure port of the legacy priority calculation and supplementary grouping. */
export function planReplicatorPriority(
  input: Readonly<ReplicatorPlanningInput>,
): ReplicatorPriorityPlan | null {
  if (!input.initialised) {
    return null;
  }

  const priorityGroups = new Map<number, ReplicatorCandidate[]>();
  for (const production of input.productions) {
    if (
      !production.unlocked ||
      !production.enabled ||
      production.weighting <= 0
    ) {
      continue;
    }
    let priority = production.demanded
      ? Math.max(production.priority, 100)
      : production.priority;
    // Preserve the legacy multiplication by the configured priority. This
    // squares ordinary priorities and changes the sign/scale of negatives.
    priority *= production.useful ? production.priority : 0;
    if (priority === 0) {
      continue;
    }
    const group = priorityGroups.get(priority) ?? [];
    group.push(
      Object.freeze({
        productionId: production.id,
        weighting: production.weighting,
      }),
    );
    priorityGroups.set(priority, group);
  }

  const priorityList = [...priorityGroups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, group]) => group);
  const supplementary = priorityGroups.get(-1);
  if (supplementary !== undefined && priorityList.length > 1) {
    priorityList.splice(priorityList.indexOf(supplementary, 1));
    priorityList[0]?.push(...supplementary);
  }
  const candidates = priorityList[0];
  if (candidates === undefined || candidates.length === 0) {
    return null;
  }
  return Object.freeze({
    scoreMode: input.scoreMode,
    selectHighestScore: input.selectHighestScore,
    candidates: Object.freeze([...candidates]),
  });
}

function scoreCandidate(
  candidate: Readonly<ReplicatorCandidate>,
  mode: ReplicatorScoreMode,
  metric: Readonly<ReplicatorMetric> | undefined,
): number | null {
  if (mode === "weight") {
    return candidate.weighting;
  }
  if (metric === undefined) {
    return null;
  }
  if (mode === "quantity") {
    return candidate.weighting / metric.currentQuantity;
  }
  return (
    candidate.weighting /
    metric.atomicMass /
    (metric.exotic ? 4 : 1) /
    metric.currentQuantity
  );
}

/** Selects from the already-planned highest priority group. */
export function planReplicatorSelection(
  priorityPlan: Readonly<ReplicatorPriorityPlan>,
  metrics: readonly Readonly<ReplicatorMetric>[],
): ReplicatorSelectionDecision | null {
  const metricById = new Map(
    metrics.map((metric) => [metric.productionId, metric]),
  );
  const scored = priorityPlan.candidates.map((candidate) => ({
    candidate,
    score: scoreCandidate(
      candidate,
      priorityPlan.scoreMode,
      metricById.get(candidate.productionId),
    ),
  }));
  if (scored.some((entry) => entry.score === null)) {
    return null;
  }
  scored.sort(
    (left, right) => (left.score as number) - (right.score as number),
  );
  const selected = priorityPlan.selectHighestScore ? scored.at(-1) : scored[0];
  return selected === undefined
    ? null
    : Object.freeze({ productionId: selected.candidate.productionId });
}

export function shouldConfigureReplicatorGovernor(
  input: Readonly<ReplicatorGovernorGateInput>,
): boolean {
  return input.governorPresent && input.replicatorTechnology;
}

export function planReplicatorGovernorTask(
  tasks: readonly string[],
): ReplicatorGovernorTaskPlan {
  if (tasks.includes("replicate")) {
    return Object.freeze({ status: "ready", assignment: null });
  }
  const taskIndex = tasks.indexOf("none");
  if (taskIndex === -1) {
    return Object.freeze({ status: "unavailable" });
  }
  return Object.freeze({
    status: "ready",
    assignment: Object.freeze({
      kind: "assign-governor-task",
      taskIndex,
      expectedTask: "none",
    }),
  });
}

export function planReplicatorGovernorSettings(
  input: Readonly<ReplicatorGovernorSettingsInput>,
): ReplicatorGovernorSettingsDecision | null {
  const enablePower = !input.powerOn;
  const disableQueue = input.focusQueue;
  const disableNegative = input.focusNegative;
  const disableCapSwitch = input.switchOnCap;
  const raisePowerCap = input.powerCap < 1e12;
  if (
    !enablePower &&
    !disableQueue &&
    !disableNegative &&
    !disableCapSwitch &&
    !raisePowerCap
  ) {
    return null;
  }
  return Object.freeze({
    kind: "update-governor-settings",
    expected: Object.freeze({ ...input }),
    enablePower,
    disableQueue,
    disableNegative,
    disableCapSwitch,
    raisePowerCap,
  });
}
