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
    requestId: request.requestId,
    origin: request.origin,
    executionAuthority: "none" as const,
  };
  const requestIdentity = evidence.requestIdentity;
  if (
    !request.active ||
    (request.cancelledAtGeneration !== undefined &&
      request.cancelledAtGeneration >= request.generation) ||
    (request.replacedAtGeneration !== undefined &&
      request.replacedAtGeneration > request.generation) ||
    requestIdentity === null ||
    requestIdentity.requestId !== request.requestId ||
    requestIdentity.generation !== request.generation
  )
    return Object.freeze({
      ...base,
      status: "stale",
      reason:
        "request was cancelled, replaced, or no longer matches its identity",
    });

  if (
    evidence.jobsFoundryFreshness === "stale" ||
    (evidence.capturedRootIdentity !== null &&
      !evidence.capturedRootIdentity.referenceMatchedAtExecution)
  )
    return Object.freeze({
      ...base,
      status: "stale",
      reason: "the prepared Jobs owner session is stale",
    });

  if (
    evidence.workCycleIdentity === null ||
    evidence.jobsPreparationGeneration === null ||
    evidence.capturedRootIdentity === null ||
    evidence.jobsFoundryFreshness !== "verified-current" ||
    !evidence.jobsAvailable ||
    evidence.population === null ||
    evidence.ordinaryJobs === null ||
    evidence.foundryJobs === null ||
    evidence.foundryCrafts === null ||
    evidence.foundryWorkerPool === null ||
    evidence.plannedDecisionIdentity === null
  )
    return Object.freeze({
      ...base,
      status: "insufficient-evidence",
      reason: "current owner-local Jobs and Foundry facts are incomplete",
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
