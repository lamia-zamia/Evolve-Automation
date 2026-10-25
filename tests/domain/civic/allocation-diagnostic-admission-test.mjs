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

console.log("ok explicit allocation diagnostic admission contract");
