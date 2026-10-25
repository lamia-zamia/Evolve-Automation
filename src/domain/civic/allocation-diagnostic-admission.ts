export const FOOD_STONE_DIAGNOSTIC_OBJECTIVE =
  "maintain-food-buffer-and-useful-stone-production" as const;

export const FOOD_STONE_DIAGNOSTIC_SCOPE =
  "food-sustainability-and-useful-stone-replenishment" as const;

export interface AllocationDiagnosticRequest {
  readonly requestId: string;
  readonly origin: "test-only";
  readonly objectiveId: typeof FOOD_STONE_DIAGNOSTIC_OBJECTIVE;
  readonly requestedScope: typeof FOOD_STONE_DIAGNOSTIC_SCOPE;
  readonly generation: number;
  readonly active: boolean;
  readonly cancelledAtGeneration?: number;
  readonly replacedAtGeneration?: number;
  readonly authorityClassification: "observation-only" | "execution-required";
}

export interface AllocationDiagnosticJobFact {
  readonly id: string;
  readonly kind: string;
  readonly workers: number;
  readonly servants: number;
  readonly managed: boolean;
  readonly unlocked: boolean;
  readonly count: number;
  readonly maximum: number;
}

export interface AllocationDiagnosticCraftFact {
  readonly id: string;
  readonly workers: number;
  readonly skilledServants: number;
  readonly buildingCapacity: number | null;
}

export interface AllocationDiagnosticEvidence {
  readonly ownerScope: "ordinary-jobs-only" | "full-jobs-and-foundry";
  readonly ownerSessionFreshness: "verified-current" | "stale" | "unavailable";
  readonly workCycleIdentity: number | null;
  readonly jobsPreparationGeneration: number | null;
  readonly capturedRootIdentity: Readonly<{
    preparationGeneration: number;
    referenceMatchedAtExecution: boolean;
  }> | null;
  readonly jobsFoundryFreshness: "verified-current" | "stale" | "unavailable";
  readonly jobsAvailable: boolean;
  readonly population: number | null;
  readonly ordinaryJobs:
    readonly Readonly<AllocationDiagnosticJobFact>[] | null;
  readonly foundryJobs: readonly Readonly<AllocationDiagnosticJobFact>[] | null;
  readonly foundryCrafts:
    readonly Readonly<AllocationDiagnosticCraftFact>[] | null;
  readonly foundryWorkerPool: number | null;
  readonly plannedDecisionIdentity: string | null;
  readonly requestIdentity: Readonly<{
    requestId: string;
    origin: "test-only";
    generation: number;
  }> | null;
  readonly progressionEvidence: Readonly<{
    workCycle: number | null;
    progressionEpoch: "unavailable";
    rootGeneration: "unavailable";
  }>;
  readonly controlGenerationEvidence: "unavailable";
  readonly crossOwnerCommitments: "unavailable";
  readonly executionAuthority: "none";
}

export type AllocationDiagnosticAdmissionStatus =
  | "inactive"
  | "admitted-for-observation"
  | "blocked-by-authority"
  | "insufficient-evidence"
  | "stale";

export interface AllocationDiagnosticAdmission {
  readonly status: AllocationDiagnosticAdmissionStatus;
  readonly requestId: string | null;
  readonly origin: "test-only" | null;
  readonly executionAuthority: "none";
  readonly reason: string;
}

export function admitAllocationDiagnosticObservation(
  request: Readonly<AllocationDiagnosticRequest> | undefined,
  evidence: Readonly<AllocationDiagnosticEvidence>,
): Readonly<AllocationDiagnosticAdmission> {
  if (request === undefined)
    return Object.freeze({
      status: "inactive",
      requestId: null,
      origin: null,
      executionAuthority: "none",
      reason: "no explicit diagnostic request",
    });

  const base = {
    requestId:
      typeof request.requestId === "string" && request.requestId.length > 0
        ? request.requestId
        : null,
    origin: request.origin === "test-only" ? ("test-only" as const) : null,
    executionAuthority: "none" as const,
  };
  const requestIdentity = evidence.requestIdentity;
  const validRequestGeneration =
    Number.isInteger(request.generation) && request.generation > 0;
  if (
    !request.active ||
    !validRequestGeneration ||
    request.origin !== "test-only" ||
    typeof request.requestId !== "string" ||
    request.requestId.length === 0 ||
    request.objectiveId !== FOOD_STONE_DIAGNOSTIC_OBJECTIVE ||
    request.requestedScope !== FOOD_STONE_DIAGNOSTIC_SCOPE ||
    (request.cancelledAtGeneration !== undefined &&
      (!Number.isInteger(request.cancelledAtGeneration) ||
        request.cancelledAtGeneration <= 0 ||
        request.cancelledAtGeneration >= request.generation)) ||
    (request.replacedAtGeneration !== undefined &&
      (!Number.isInteger(request.replacedAtGeneration) ||
        request.replacedAtGeneration <= 0 ||
        request.replacedAtGeneration >= request.generation)) ||
    requestIdentity == null ||
    requestIdentity.requestId !== request.requestId ||
    requestIdentity.origin !== request.origin ||
    requestIdentity.generation !== request.generation ||
    !Number.isInteger(requestIdentity.generation) ||
    requestIdentity.generation <= 0
  )
    return Object.freeze({
      ...base,
      status: "stale",
      reason:
        "request was cancelled, replaced, or no longer matches its identity",
    });

  const rootGeneration =
    evidence.capturedRootIdentity?.preparationGeneration ?? null;
  const progressionWorkCycle = evidence.progressionEvidence?.workCycle;
  if (
    evidence.ownerSessionFreshness === "stale" ||
    evidence.jobsFoundryFreshness === "stale" ||
    (evidence.capturedRootIdentity != null &&
      !evidence.capturedRootIdentity.referenceMatchedAtExecution) ||
    (evidence.jobsPreparationGeneration !== null &&
      (!Number.isInteger(evidence.jobsPreparationGeneration) ||
        evidence.jobsPreparationGeneration <= 0)) ||
    (rootGeneration !== null &&
      (!Number.isInteger(rootGeneration) || rootGeneration <= 0)) ||
    (evidence.jobsPreparationGeneration !== null &&
      rootGeneration !== null &&
      evidence.jobsPreparationGeneration !== rootGeneration) ||
    (evidence.workCycleIdentity !== null &&
      (!Number.isInteger(evidence.workCycleIdentity) ||
        evidence.workCycleIdentity < 0)) ||
    (progressionWorkCycle !== null &&
      progressionWorkCycle !== undefined &&
      (!Number.isInteger(progressionWorkCycle) || progressionWorkCycle < 0)) ||
    (evidence.workCycleIdentity !== null &&
      progressionWorkCycle !== null &&
      progressionWorkCycle !== undefined &&
      evidence.workCycleIdentity !== progressionWorkCycle)
  )
    return Object.freeze({
      ...base,
      status: "stale",
      reason: "the prepared Jobs owner session is stale",
    });

  if (
    (evidence.ownerScope !== "ordinary-jobs-only" &&
      evidence.ownerScope !== "full-jobs-and-foundry") ||
    evidence.ownerSessionFreshness !== "verified-current" ||
    evidence.workCycleIdentity === null ||
    evidence.jobsPreparationGeneration === null ||
    rootGeneration === null ||
    evidence.capturedRootIdentity == null ||
    !evidence.jobsAvailable ||
    evidence.population === null ||
    !Number.isFinite(evidence.population) ||
    evidence.population < 0 ||
    !Array.isArray(evidence.ordinaryJobs) ||
    typeof evidence.plannedDecisionIdentity !== "string" ||
    evidence.plannedDecisionIdentity.length === 0 ||
    (evidence.ownerScope === "full-jobs-and-foundry" &&
      (evidence.jobsFoundryFreshness !== "verified-current" ||
        !Array.isArray(evidence.foundryJobs) ||
        !Array.isArray(evidence.foundryCrafts) ||
        evidence.foundryWorkerPool === null ||
        !Number.isFinite(evidence.foundryWorkerPool) ||
        evidence.foundryWorkerPool < 0)) ||
    (evidence.ownerScope === "ordinary-jobs-only" &&
      (evidence.jobsFoundryFreshness !== "unavailable" ||
        evidence.foundryJobs !== null ||
        evidence.foundryCrafts !== null ||
        evidence.foundryWorkerPool !== null))
  )
    return Object.freeze({
      ...base,
      status: "insufficient-evidence",
      reason:
        "current owner-local Jobs facts are incomplete for this owner scope",
    });

  if (request.authorityClassification !== "observation-only")
    return Object.freeze({
      ...base,
      status: "blocked-by-authority",
      reason: "the request has no allocation execution authority",
    });

  return Object.freeze({
    ...base,
    status: "admitted-for-observation",
    reason:
      "current owner-local facts may be inspected for this diagnostic request",
  });
}
