export interface ConstructionAllocationShadowInput {
  readonly orderingGeneration: unknown;
  readonly phase: unknown;
  readonly workCycleId: unknown;
  readonly rootGeneration: unknown;
  readonly progressionGeneration: unknown;
  readonly currentRootGeneration: unknown;
  readonly currentProgressionGeneration: unknown;
  readonly target: unknown;
  readonly currentTarget: unknown;
  readonly resources: unknown;
  readonly permissions: unknown;
  readonly controls: unknown;
  readonly queues: unknown;
  readonly reservations: unknown;
  readonly handoff: unknown;
  readonly claims: unknown;
  readonly budgets: unknown;
}

export interface ConstructionAllocationShadowResult {
  readonly authorized: boolean;
  readonly reasons: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function readCost(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (
    entries.length === 0 ||
    entries.some(
      ([name, amount]) =>
        name.length === 0 ||
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 0,
    )
  )
    return undefined;
  return Object.fromEntries(entries) as Record<string, number>;
}

function sameCost(left: unknown, right: unknown): boolean {
  const a = readCost(left);
  const b = readCost(right);
  if (a === undefined || b === undefined) return false;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  return (
    keysA.length === keysB.length &&
    keysA.every((key, index) => key === keysB[index] && a[key] === b[key])
  );
}

function validControl(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.methods) &&
    value.methods.includes("action") &&
    typeof value.generation === "number" &&
    Number.isSafeInteger(value.generation) &&
    value.generation > 0
  );
}

function validBudget(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function evaluateConstructionAllocationShadow(
  input: ConstructionAllocationShadowInput,
): ConstructionAllocationShadowResult {
  const reasons: string[] = [];
  const add = (reason: string) => reasons.push(reason);
  const target = isRecord(input.target) ? input.target : undefined;
  const currentTarget = isRecord(input.currentTarget)
    ? input.currentTarget
    : undefined;
  const cost = readCost(target?.cost);

  if (
    typeof input.orderingGeneration !== "number" ||
    !Number.isSafeInteger(input.orderingGeneration) ||
    input.orderingGeneration < 1
  )
    add("missing-ordering-generation");
  if (input.phase !== "pre-Gather") add("wrong-ordering-phase");
  if (
    typeof input.workCycleId !== "number" ||
    !Number.isSafeInteger(input.workCycleId) ||
    input.workCycleId < 1
  )
    add("missing-work-cycle");
  if (input.rootGeneration !== input.currentRootGeneration)
    add("stale-root-generation");
  if (input.progressionGeneration !== input.currentProgressionGeneration)
    add("stale-progression-generation");
  if (target === undefined || target === null)
    add("no-current-pre-gather-target");
  else if (
    typeof target.id !== "string" ||
    !target.id.startsWith("city-") ||
    cost === undefined
  )
    add("invalid-target-or-price");
  if (
    target !== undefined &&
    target !== null &&
    target.pool !== undefined &&
    target.pool !== "anywhere"
  )
    add("incompatible-target-pool");
  if (
    target !== undefined &&
    target !== null &&
    (currentTarget === undefined ||
      currentTarget === null ||
      target.id !== currentTarget.id ||
      target.pool !== currentTarget.pool ||
      !sameCost(target.cost, currentTarget.cost))
  )
    add("current-target-mismatch");

  let hasShortage = false;
  if (cost !== undefined) {
    const resources = isRecord(input.resources) ? input.resources : undefined;
    if (resources === undefined) add("missing-resource-snapshot");
    else {
      for (const [resourceId, price] of Object.entries(cost)) {
        const resource = resources[resourceId];
        if (!isRecord(resource)) {
          add(`missing-resource:${resourceId}`);
          continue;
        }
        const amount = resource.amount;
        const maximum = resource.max;
        if (
          typeof amount !== "number" ||
          !Number.isFinite(amount) ||
          amount < 0 ||
          typeof maximum !== "number" ||
          !Number.isFinite(maximum) ||
          maximum < amount
        ) {
          add(`invalid-resource:${resourceId}`);
          continue;
        }
        if (resourceId === "Lumber" || resourceId === "Stone") {
          const shortage = Math.max(0, price - amount);
          if (shortage > 0) {
            hasShortage = true;
            if (maximum - amount < shortage)
              add(`insufficient-capacity:${resourceId}`);
          }
        } else if (amount < price) {
          add(`non-gatherable-unaffordable:${resourceId}`);
        }
      }
    }
  }
  if (cost !== undefined && !hasShortage)
    add("no-positive-gatherable-shortage");

  const permissions = isRecord(input.permissions)
    ? input.permissions
    : undefined;
  if (permissions?.autoBuild !== true) add("auto-build-permission-disabled");
  if (permissions?.gatherEnabled !== true) add("gather-permission-disabled");
  const controls = isRecord(input.controls) ? input.controls : undefined;
  if (
    target !== undefined &&
    target !== null &&
    !validControl(controls?.target)
  )
    add("missing-target-action-control");
  for (const resourceId of ["Lumber", "Stone"] as const) {
    if (!validControl(controls?.[resourceId]))
      add(`missing-gather-control:${resourceId}`);
  }

  const queues = isRecord(input.queues) ? input.queues : undefined;
  if (!Array.isArray(queues?.build)) add("missing-build-queue");
  else if (queues.build.length > 0) add("build-queue-conflict");
  if (!Array.isArray(queues?.research)) add("missing-research-queue");
  else if (queues.research.length > 0) add("research-queue-conflict");

  if (!isRecord(input.reservations) || input.reservations.status !== "clear")
    add("reservation-evidence-unavailable-or-conflicting");
  if (
    !isRecord(input.handoff) ||
    input.handoff.observed !== true ||
    typeof input.handoff.active !== "boolean"
  )
    add("missing-handoff-evidence");
  else if (input.handoff.active) add("active-handoff-conflict");
  if (!Array.isArray(input.claims)) add("missing-competing-claims-evidence");
  else if (input.claims.length > 0) add("competing-claim-conflict");

  const budgets = isRecord(input.budgets) ? input.budgets : undefined;
  if (budgets === undefined) add("missing-spending-budgets");
  else {
    for (const key of [
      "perCycle",
      "perTargetEpisode",
      "totalEpisode",
    ] as const) {
      if (!validBudget(budgets[key])) add(`invalid-spending-budget:${key}`);
    }
  }

  return Object.freeze({
    authorized: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}
