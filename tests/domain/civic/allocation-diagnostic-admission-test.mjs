import assert from "node:assert/strict";
import {
  admitAllocationDiagnosticObservation,
  FOOD_STONE_DIAGNOSTIC_OBJECTIVE,
  FOOD_STONE_DIAGNOSTIC_SCOPE,
} from "../../../src/domain/civic/allocation-diagnostic-admission.ts";

const request = {
  requestId: "fixture:p48:food-stone:1",
  origin: "test-only",
  objectiveId: FOOD_STONE_DIAGNOSTIC_OBJECTIVE,
  requestedScope: FOOD_STONE_DIAGNOSTIC_SCOPE,
  generation: 1,
  active: true,
  authorityClassification: "observation-only",
};

const evidence = {
  ownerScope: "full-jobs-and-foundry",
  ownerSessionFreshness: "verified-current",
  workCycleIdentity: 90,
  jobsPreparationGeneration: 4,
  capturedRootIdentity: {
    preparationGeneration: 4,
    referenceMatchedAtExecution: true,
  },
  jobsFoundryFreshness: "verified-current",
  jobsAvailable: true,
  population: 12,
  ordinaryJobs: [
    {
      id: "farmer",
      kind: "farmer",
      workers: 2,
      servants: 0,
      managed: true,
      unlocked: true,
      count: 2,
      maximum: 20,
    },
  ],
  foundryJobs: [],
  foundryCrafts: [],
  foundryWorkerPool: 3,
  plannedDecisionIdentity: "assign-jobs:fixture",
  requestIdentity: {
    requestId: request.requestId,
    origin: request.origin,
    generation: request.generation,
  },
  progressionEvidence: {
    workCycle: 90,
    progressionEpoch: "unavailable",
    rootGeneration: "unavailable",
  },
  controlGenerationEvidence: "unavailable",
  crossOwnerCommitments: "unavailable",
  executionAuthority: "none",
};

assert.equal(
  admitAllocationDiagnosticObservation(undefined, evidence).status,
  "inactive",
);
assert.deepEqual(admitAllocationDiagnosticObservation(request, evidence), {
  status: "admitted-for-observation",
  requestId: request.requestId,
  origin: "test-only",
  executionAuthority: "none",
  reason:
    "current owner-local facts may be inspected for this diagnostic request",
});

assert.equal(
  admitAllocationDiagnosticObservation(
    { ...request, authorityClassification: "execution-required" },
    evidence,
  ).status,
  "blocked-by-authority",
  "the observation contract never grants allocation execution authority",
);
assert.equal(
  admitAllocationDiagnosticObservation(
    { ...request, cancelledAtGeneration: 1 },
    evidence,
  ).status,
  "stale",
);
assert.equal(
  admitAllocationDiagnosticObservation(
    { ...request, replacedAtGeneration: 2 },
    evidence,
  ).status,
  "stale",
);
assert.equal(
  admitAllocationDiagnosticObservation(request, {
    ...evidence,
    requestIdentity: { ...evidence.requestIdentity, generation: 2 },
  }).status,
  "stale",
  "a replaced request identity cannot use the current owner observation",
);
assert.equal(
  admitAllocationDiagnosticObservation(request, {
    ...evidence,
    jobsFoundryFreshness: "stale",
  }).status,
  "stale",
);
assert.equal(
  admitAllocationDiagnosticObservation(request, {
    ...evidence,
    progressionEvidence: {
      workCycle: null,
      progressionEpoch: "unavailable",
      rootGeneration: "unavailable",
    },
  }).status,
  "admitted-for-observation",
  "unavailable cross-owner progression generations do not invalidate a current owner-local observation",
);
assert.equal(
  admitAllocationDiagnosticObservation(request, {
    ...evidence,
    foundryCrafts: null,
  }).status,
  "insufficient-evidence",
);

const ordinaryOnlyEvidence = {
  ...evidence,
  ownerScope: "ordinary-jobs-only",
  jobsFoundryFreshness: "unavailable",
  foundryJobs: null,
  foundryCrafts: null,
  foundryWorkerPool: null,
};
assert.equal(
  admitAllocationDiagnosticObservation(request, ordinaryOnlyEvidence).status,
  "admitted-for-observation",
  "a current ordinary Jobs owner can be inspected while Foundry evidence remains unavailable",
);
assert.equal(
  admitAllocationDiagnosticObservation(request, {
    ...ordinaryOnlyEvidence,
    foundryJobs: [],
    jobsFoundryFreshness: "verified-current",
  }).status,
  "insufficient-evidence",
  "an ordinary-only owner cannot claim complete Foundry evidence",
);
assert.equal(
  admitAllocationDiagnosticObservation(request, {
    ...evidence,
    foundryWorkerPool: null,
  }).status,
  "insufficient-evidence",
  "Full Jobs cannot treat an unavailable Foundry worker commitment as zero",
);

const staleCases = [
  [
    { ...evidence, jobsPreparationGeneration: 5 },
    request,
    "owner preparation and captured-root generations must agree",
  ],
  [
    {
      ...evidence,
      progressionEvidence: { ...evidence.progressionEvidence, workCycle: 91 },
    },
    request,
    "duplicated work-cycle identities must agree",
  ],
  [
    {
      ...evidence,
      capturedRootIdentity: {
        ...evidence.capturedRootIdentity,
        referenceMatchedAtExecution: false,
      },
    },
    request,
    "a changed captured root is stale",
  ],
  [
    { ...evidence, ownerSessionFreshness: "stale" },
    request,
    "a superseded owner session is stale",
  ],
  [
    { ...evidence, jobsPreparationGeneration: 0 },
    request,
    "nonpositive owner preparation generations are stale",
  ],
  [
    {
      ...evidence,
      capturedRootIdentity: {
        ...evidence.capturedRootIdentity,
        preparationGeneration: 0,
      },
    },
    request,
    "nonpositive captured-root generations are stale",
  ],
  [
    {
      ...evidence,
      requestIdentity: { ...evidence.requestIdentity, origin: "forged" },
    },
    request,
    "a forged captured request origin is stale",
  ],
  [
    evidence,
    { ...request, origin: "forged" },
    "a forged request origin is stale",
  ],
  [
    evidence,
    { ...request, generation: 0 },
    "a nonpositive request generation is stale",
  ],
];
for (const [candidateEvidence, candidateRequest, message] of staleCases) {
  const result = admitAllocationDiagnosticObservation(
    candidateRequest,
    candidateEvidence,
  );
  assert.equal(result.status, "stale", message);
  assert.equal(result.executionAuthority, "none", message);
}

console.log("ok explicit allocation diagnostic admission contract");
