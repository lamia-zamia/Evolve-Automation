import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { planJobs } from "../../src/domain/civic/jobs.ts";

const evidence = JSON.parse(
  await readFile(
    new URL(
      "../../experiments/p38-quarry-production-validation-jobs.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const capturedInput = evidence.capturedP688Input;
assert.equal(capturedInput.available, true);
assert.equal(capturedInput.population, 4);
assert.equal(evidence.capturedSettings.farmerPriority, 5);
assert.equal(evidence.capturedSettings.quarryWorkerPriority, 8);
assert.equal(evidence.capturedP688Planner.defaultJobId, "farmer");
assert.deepEqual(evidence.capturedP688Planner.existingAssignments, {
  unemployed: 0,
  farmer: 4,
});

const assignmentsById = (input, decision) =>
  Object.fromEntries(
    decision.assignments.map((assignment) => [
      input.jobs.find((job) => job.token === assignment.jobToken)?.id,
      assignment.workers,
    ]),
  );

const capturedDecision = planJobs(capturedInput);
assert.deepEqual(assignmentsById(capturedInput, capturedDecision), {
  unemployed: 0,
  farmer: 4,
});
const capturedFarmer = capturedInput.jobs.find((job) => job.id === "farmer");
assert.equal(capturedFarmer.farmerMinimum, 2);
assert.equal(capturedFarmer.maximum, -1);
assert.equal(capturedFarmer.smartMaximum, 2);
assert.deepEqual(capturedFarmer.breakpoints, [
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
]);
assert.equal(
  capturedInput.jobs.some((job) => job.id === "quarry_worker"),
  false,
  "the captured native P688 catalog must keep the locked Quarry Worker absent",
);

const hypotheticalInput = evidence.hypotheticalUnlockedInput;
assert.equal(evidence.hypotheticalUnlockedPlanner.nativeObservation, false);
assert.equal(
  evidence.hypotheticalUnlockedPlanner.catalogSource.label,
  "hypothetical unlock; not a native post-purchase observation",
);
const quarryJob = hypotheticalInput.jobs.find(
  (job) => job.id === "quarry_worker",
);
assert.ok(quarryJob);
assert.equal(quarryJob.workers, 0);
assert.equal(quarryJob.maximum, -1);
assert.deepEqual(quarryJob.breakpoints, [4, 10, 0]);
const farmerPosition = hypotheticalInput.jobs.findIndex(
  (job) => job.id === "farmer",
);
assert.equal(hypotheticalInput.jobs[farmerPosition + 1].id, "quarry_worker");

const hypotheticalDecision = planJobs(hypotheticalInput);
assert.deepEqual(assignmentsById(hypotheticalInput, hypotheticalDecision), {
  unemployed: 0,
  farmer: 2,
  quarry_worker: 2,
});
assert.equal(
  hypotheticalDecision.selectedDefaultToken,
  hypotheticalInput.jobs.find((job) => job.id === "farmer").token,
);
assert.equal(
  evidence.physicalManualTransfer,
  "not reached: native Construction did not purchase Quarry",
);

console.log("p38-quarry-production-validation-jobs ok");
