export interface ConstructionTargetReservationSample {
  readonly targets: readonly Readonly<{
    name: string;
    cause: string;
    pool?: string;
    cost: Readonly<Record<string, number | undefined>>;
  }>[];
  readonly unavailable: boolean;
}

interface SavingTarget {
  readonly name: string;
  readonly pool?: string;
  readonly cost: Readonly<Record<string, number>>;
}

interface ObservedSavingTarget {
  readonly name: string;
  readonly pool?: string;
  readonly cost: Readonly<Record<string, number | undefined>>;
}

export type ConstructionTargetAdmissionStatus =
  | "accepted-for-owner-decision"
  | "rejected-target-unavailable"
  | "rejected-priority-conflict"
  | "rejected-incomplete-authority"
  | "rejected-unaffordable"
  | "stale"
  | "inactive";

export interface ConstructionTargetAdmissionRequest {
  readonly requestId: string;
  readonly generation: number;
  readonly active: boolean;
  readonly origin: "test-only";
  readonly targetBuildingId: string;
  readonly maximumPurchases: number;
  readonly maximumTotalAuthorizedResourceDebit: Readonly<
    Record<string, number>
  >;
  readonly scope: Readonly<{
    period: number;
    workCycleId: number;
    orderingGeneration: number;
  }>;
  readonly expiresAt: Readonly<{ period: number; workCycleId: number }>;
  readonly cancelledAtGeneration?: number;
  readonly replacedAtGeneration?: number;
  readonly targetPermission: boolean;
  readonly priorityReplacement: Readonly<{
    permitted: boolean;
    displacedTargetId: string;
    displacedPublicationWorkCycleId: number;
  }>;
  readonly nativeExecutionPermission: boolean;
  readonly materialGatheringPermission: false;
  readonly jobsAssignmentPermission: false;
  readonly playerSelected: false;
  readonly productionAuthorized: false;
  readonly testAuthorization: true;
}

export interface ConstructionTargetAdmissionInput {
  readonly request: ConstructionTargetAdmissionRequest | undefined;
  readonly owner: Readonly<{
    period: number | undefined;
    workCycleId: number;
    orderingGeneration: number;
    rootGeneration: number | undefined;
    progressionGeneration: string | undefined;
    publicationWorkCycleId: number | undefined;
    publicationRootGeneration: number | undefined;
    publicationProgressionGeneration: string | undefined;
  }>;
  readonly candidate:
    | Readonly<{
        key: string;
        actionId?: string;
        family: string;
        ignored: boolean;
        important: boolean;
        knowledge: boolean;
        cost: Readonly<Record<string, number>>;
        pool?: string;
      }>
    | undefined;
  readonly orderingIndex: number;
  readonly candidateCatalogComplete: boolean;
  readonly affordable: boolean | undefined;
  readonly control:
    | Readonly<{
        actionId: string;
        available: boolean;
        generation: number;
        price?: Readonly<{
          cost: Readonly<Record<string, number | undefined>>;
          pool?: string;
        }>;
      }>
    | undefined;
  readonly nativeQueue: ConstructionTargetReservationSample | undefined;
  readonly scriptReservations: ConstructionTargetReservationSample | undefined;
  readonly previousSavingTarget: Readonly<ObservedSavingTarget> | undefined;
  readonly verifiedPurchases: number;
  readonly verifiedResourceDebits: Readonly<Record<string, number>>;
}

export interface ConstructionSavingPriorityRevision {
  readonly requestId: string;
  readonly requestGeneration: number;
  readonly previous: Readonly<SavingTarget>;
  readonly replacement: Readonly<SavingTarget>;
  readonly workCycleId: number;
  readonly orderingGeneration: number;
  readonly reason: "explicit-test-only-priority-replacement";
  readonly lifetime: "this-construction-cycle";
}

export type ConstructionTargetAdmissionDecision = Readonly<{
  status: ConstructionTargetAdmissionStatus;
  reason: string;
  revision?: Readonly<ConstructionSavingPriorityRevision>;
}>;

const reject = (
  status: Exclude<
    ConstructionTargetAdmissionStatus,
    "accepted-for-owner-decision"
  >,
  reason: string,
): ConstructionTargetAdmissionDecision => Object.freeze({ status, reason });

function completeCostRecord(
  cost: Readonly<Record<string, number | undefined>>,
): Readonly<Record<string, number>> | undefined {
  if (cost === null || typeof cost !== "object") return undefined;
  const entries = Object.entries(cost);
  if (
    entries.length === 0 ||
    entries.some(
      ([id, amount]) =>
        id.length === 0 ||
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount < 0,
    )
  )
    return undefined;
  return Object.freeze(Object.fromEntries(entries) as Record<string, number>);
}

function completeReservationSample(
  sample: ConstructionTargetReservationSample,
): boolean {
  return (
    sample !== null &&
    typeof sample === "object" &&
    sample.unavailable === false &&
    Array.isArray(sample.targets) &&
    sample.targets.every(
      (target) =>
        target !== null &&
        typeof target === "object" &&
        typeof target.name === "string" &&
        target.name.length > 0 &&
        typeof target.cause === "string" &&
        target.cause.length > 0 &&
        completeCostRecord(target.cost) !== undefined,
    )
  );
}

function completeCost(cost: Readonly<Record<string, number>>): boolean {
  return completeCostRecord(cost) !== undefined;
}

function withinRemainingDebitBudget(
  cost: Readonly<Record<string, number>>,
  maximum: Readonly<Record<string, number>>,
  spent: Readonly<Record<string, number>>,
): boolean {
  return Object.entries(cost).every(([id, amount]) => {
    const limit = maximum[id];
    const used = spent[id] ?? 0;
    return (
      typeof limit === "number" &&
      Number.isFinite(limit) &&
      limit >= 0 &&
      Number.isFinite(used) &&
      used >= 0 &&
      amount <= limit - used
    );
  });
}

function validDebitRecord(amounts: Readonly<Record<string, number>>): boolean {
  return (
    amounts !== null &&
    typeof amounts === "object" &&
    Object.entries(amounts).every(
      ([id, amount]) =>
        id.length > 0 &&
        typeof amount === "number" &&
        Number.isFinite(amount) &&
        amount >= 0,
    )
  );
}

function sameCost(
  left: Readonly<Record<string, number | undefined>>,
  right: Readonly<Record<string, number | undefined>>,
): boolean {
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([id, amount]) => right[id] === amount)
  );
}

export function decideConstructionTargetAdmission(
  input: Readonly<ConstructionTargetAdmissionInput>,
): ConstructionTargetAdmissionDecision {
  const { request, owner } = input;
  if (
    request === undefined ||
    request === null ||
    typeof request !== "object" ||
    request.active !== true
  )
    return reject("inactive", "request-not-active");
  if (
    !request.requestId ||
    !Number.isSafeInteger(request.generation) ||
    request.generation < 1 ||
    request.origin !== "test-only" ||
    request.testAuthorization !== true ||
    request.playerSelected !== false ||
    request.productionAuthorized !== false ||
    request.materialGatheringPermission !== false ||
    request.jobsAssignmentPermission !== false
  )
    return reject("rejected-incomplete-authority", "invalid-test-request");
  if (
    request.scope === undefined ||
    request.scope === null ||
    !Number.isSafeInteger(request.scope.period) ||
    !Number.isSafeInteger(request.scope.workCycleId) ||
    !Number.isSafeInteger(request.scope.orderingGeneration) ||
    request.expiresAt === undefined ||
    request.expiresAt === null ||
    !Number.isSafeInteger(request.expiresAt.period) ||
    !Number.isSafeInteger(request.expiresAt.workCycleId) ||
    request.priorityReplacement === undefined ||
    request.priorityReplacement === null ||
    !Number.isSafeInteger(
      request.priorityReplacement.displacedPublicationWorkCycleId,
    ) ||
    typeof request.priorityReplacement.displacedTargetId !== "string" ||
    request.priorityReplacement.displacedTargetId.length === 0 ||
    !validDebitRecord(request.maximumTotalAuthorizedResourceDebit)
  )
    return reject(
      "rejected-incomplete-authority",
      "request-authority-fields-incomplete",
    );
  if (
    request.expiresAt.period !== request.scope.period ||
    request.expiresAt.workCycleId !== request.scope.workCycleId
  )
    return reject(
      "rejected-incomplete-authority",
      "request-expiration-is-not-one-cycle",
    );
  if (
    (request.cancelledAtGeneration !== undefined &&
      request.cancelledAtGeneration >= request.generation) ||
    (request.replacedAtGeneration !== undefined &&
      request.replacedAtGeneration >= request.generation)
  )
    return reject("stale", "request-cancelled-or-replaced");
  if (
    owner.period === undefined ||
    owner.period !== request.scope.period ||
    owner.workCycleId !== request.scope.workCycleId ||
    owner.orderingGeneration !== request.scope.orderingGeneration ||
    owner.period > request.expiresAt.period ||
    owner.workCycleId > request.expiresAt.workCycleId
  )
    return reject("stale", "request-work-cycle-expired-or-mismatched");
  if (
    owner.rootGeneration === undefined ||
    owner.progressionGeneration === undefined ||
    owner.publicationRootGeneration === undefined ||
    owner.publicationProgressionGeneration === undefined ||
    owner.rootGeneration !== owner.publicationRootGeneration ||
    owner.progressionGeneration !== owner.publicationProgressionGeneration ||
    owner.publicationWorkCycleId === undefined ||
    owner.publicationWorkCycleId !== owner.workCycleId - 1
  )
    return reject("stale", "construction-publication-identity-mismatch");
  if (!input.candidateCatalogComplete)
    return reject(
      "rejected-incomplete-authority",
      "construction-catalog-incomplete",
    );
  if (
    input.candidate === undefined ||
    input.candidate.key !== request.targetBuildingId ||
    input.candidate.actionId !== request.targetBuildingId ||
    input.candidate.family !== "buildings" ||
    (input.candidate.pool !== undefined &&
      (typeof input.candidate.pool !== "string" ||
        input.candidate.pool.length === 0)) ||
    input.candidate.ignored ||
    input.candidate.important ||
    input.candidate.knowledge
  )
    return reject(
      "rejected-target-unavailable",
      "requested-target-not-current",
    );
  if (
    request.targetPermission !== true ||
    request.nativeExecutionPermission !== true ||
    request.maximumPurchases !== 1 ||
    !completeCost(input.candidate.cost) ||
    !withinRemainingDebitBudget(
      input.candidate.cost,
      request.maximumTotalAuthorizedResourceDebit,
      input.verifiedResourceDebits,
    ) ||
    input.verifiedPurchases >= request.maximumPurchases
  )
    return reject(
      "rejected-unaffordable",
      "price-or-purchase-budget-unavailable",
    );
  if (input.affordable !== true)
    return reject(
      "rejected-unaffordable",
      "current-holdings-do-not-cover-target",
    );
  if (
    input.control === undefined ||
    input.control.available !== true ||
    input.control.actionId !== request.targetBuildingId ||
    !Number.isSafeInteger(input.control.generation) ||
    input.control.generation < 0
  )
    return reject(
      "rejected-incomplete-authority",
      "native-action-control-unavailable",
    );
  const nativePrice =
    input.control.price === undefined
      ? undefined
      : completeCostRecord(input.control.price.cost);
  if (nativePrice === undefined)
    return reject("rejected-incomplete-authority", "native-price-unavailable");
  if (
    !sameCost(nativePrice, input.candidate.cost) ||
    input.control.price?.pool !== input.candidate.pool
  )
    return reject(
      "rejected-unaffordable",
      "native-price-changed-or-over-budget",
    );
  if (
    input.nativeQueue === undefined ||
    input.scriptReservations === undefined ||
    !completeReservationSample(input.nativeQueue) ||
    !completeReservationSample(input.scriptReservations)
  )
    return reject(
      "rejected-incomplete-authority",
      "reservation-evidence-incomplete",
    );
  if (input.nativeQueue.targets.length > 0)
    return reject(
      "rejected-priority-conflict",
      "native-queue-commitment-present",
    );

  const previous = input.previousSavingTarget;
  const previousCost =
    previous === undefined ? undefined : completeCostRecord(previous.cost);
  const scriptTargets = input.scriptReservations.targets;
  const savingTargets = scriptTargets.filter(
    (target) => target.cause === "Saving",
  );
  const saving = savingTargets.length === 1 ? savingTargets[0] : undefined;
  if (
    previous === undefined ||
    previousCost === undefined ||
    owner.publicationWorkCycleId !==
      request.priorityReplacement.displacedPublicationWorkCycleId ||
    previous.name !== request.priorityReplacement.displacedTargetId ||
    request.priorityReplacement.permitted !== true ||
    saving === undefined ||
    saving.cause !== "Saving" ||
    saving.name !== previous.name ||
    saving.pool !== previous.pool ||
    !sameCost(saving.cost, previousCost)
  )
    return reject(
      "rejected-priority-conflict",
      "displaced-saving-priority-not-authorized",
    );

  const replacement = Object.freeze({
    name: input.candidate.key,
    ...(input.candidate.pool === undefined
      ? {}
      : { pool: input.candidate.pool }),
    cost: Object.freeze({ ...input.candidate.cost }),
  });
  return Object.freeze({
    status: "accepted-for-owner-decision",
    reason: "bounded-test-only-request-and-current-evidence-match",
    revision: Object.freeze({
      requestId: request.requestId,
      requestGeneration: request.generation,
      previous: Object.freeze({
        name: previous.name,
        ...(previous.pool === undefined ? {} : { pool: previous.pool }),
        cost: previousCost,
      }),
      replacement,
      workCycleId: owner.workCycleId,
      orderingGeneration: owner.orderingGeneration,
      reason: "explicit-test-only-priority-replacement",
      lifetime: "this-construction-cycle",
    }),
  });
}
